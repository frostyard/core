// Backfill of the level labels (ADR-0078, docs/specs/pr-triage.md): adds the
// missing label level:L1 to level:L4, and risk:high for L1 and L2, to open pull
// requests. The rules are the rules of the levels step: this module calls
// runLevelsStep with the same event shape as the workflow, so the ratchet never
// lives here a second time. Edit the ratchet in scripts/lib/pr-triage.mjs.
//
// Read-only by default: without `apply`, the wrapper records a planned change
// and writes nothing. scripts/pr-triage-backfill.mjs prints the plan as
// Markdown.
import { escapeCell } from "./risk-paths.mjs";
import { runLevelsStep } from "./pr-triage.mjs";

const REPO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;

// ---- Arguments ------------------------------------------------------------

function usageError(message) {
  const error = new Error(message);
  error.name = "UsageError";
  return error;
}

// `--apply`, `--help` and owner/name repositories. A help request takes no
// repository; every other call needs at least 1.
export function parseArgs(argv = []) {
  const args = { repos: [], apply: false, help: false };
  for (const arg of argv) {
    if (arg === "--apply") {
      args.apply = true;
      continue;
    }
    if (arg === "--help") {
      args.help = true;
      continue;
    }
    if (typeof arg !== "string" || arg.startsWith("-")) throw usageError(`unknown option: ${String(arg)}`);
    if (!REPO_PATTERN.test(arg)) throw usageError(`not an owner/name repository: ${arg}`);
    args.repos.push(arg);
  }
  if (!args.help && args.repos.length === 0) throw usageError("no repository given");
  return args;
}

// ---- Recording API --------------------------------------------------------

const labelName = (label) => (typeof label === "string" ? label : label?.name);

// Wraps a GitHub client. The writes of runLevelsStep become planned changes:
// `adds` holds { number, labels } for the labels the pull request lacks, and
// `removes` holds { number, name }. With `apply`, the same change also goes to
// the real client. The label list of a pull request is read once and kept up to
// date with the planned change, so a repeated add records nothing.
export function recordingApi(api, { apply = false } = {}) {
  const adds = [];
  const removes = [];
  const known = new Map();

  const keyOf = (owner, repo, number) => `${owner}/${repo}#${number}`;

  const namesOf = async (owner, repo, number) => {
    const key = keyOf(owner, repo, number);
    if (!known.has(key)) {
      const list = await api.listIssueLabels(owner, repo, number);
      const names = (Array.isArray(list) ? list : []).map(labelName).filter((name) => typeof name === "string");
      known.set(key, names);
    }
    return known.get(key);
  };

  const wrapper = {
    adds,
    removes,
    // The caller reads the plan of 1 pull request, then starts the next one.
    reset() {
      adds.length = 0;
      removes.length = 0;
      known.clear();
    },

    async listIssueLabels(owner, repo, number) {
      return (await namesOf(owner, repo, number)).map((name) => ({ name }));
    },

    async addLabels(owner, repo, number, labels) {
      const current = await namesOf(owner, repo, number);
      const missing = [];
      for (const name of Array.isArray(labels) ? labels : []) {
        if (typeof name !== "string" || current.includes(name) || missing.includes(name)) continue;
        missing.push(name);
      }
      if (missing.length === 0) return;
      // With apply, a change counts only after the real write worked: a
      // rejected write throws before anything is recorded.
      if (apply) await api.addLabels(owner, repo, number, missing);
      adds.push({ number, labels: missing });
      current.push(...missing);
    },

    async removeIssueLabel(owner, repo, number, name) {
      const current = await namesOf(owner, repo, number);
      // The real client returns false when the label was already gone (HTTP 404):
      // no change was made, so none is recorded.
      const gone = apply ? await api.removeIssueLabel(owner, repo, number, name) : current.includes(name);
      const at = current.indexOf(name);
      if (at !== -1) current.splice(at, 1);
      if (gone) removes.push({ number, name });
      return true;
    },
  };

  // Every read method of the client passes through, and so does any method
  // added to it later.
  return new Proxy(wrapper, {
    get(target, property, receiver) {
      if (typeof property !== "string" || property in target) return Reflect.get(target, property, receiver);
      const value = api[property];
      return typeof value === "function" ? value.bind(api) : value;
    },
  });
}

// ---- Backfill -------------------------------------------------------------

// 1 row per pull request, in ascending number order. `pulls` holds
// { number, baseSha } for every open pull request, drafts included. A failure
// on 1 pull request becomes its row's `error`; the loop goes on.
export async function backfillRepository({ api, owner, repo, pulls = [], apply = false }) {
  const wrapped = recordingApi(api, { apply });
  const rows = [];
  const ordered = [...pulls].sort((a, b) => (a?.number ?? 0) - (b?.number ?? 0));
  for (const pull of ordered) {
    wrapped.reset();
    const row = {
      number: pull?.number ?? null,
      outcome: "error",
      level: null,
      added: [],
      removed: [],
      missingLabels: [],
      error: null,
    };
    try {
      const result = await runLevelsStep({
        api: wrapped,
        eventName: "pull_request_target",
        event: {
          pull_request: { number: pull?.number, base: { sha: pull?.baseSha } },
          repository: { owner: { login: owner }, name: repo },
        },
        summary: async () => {},
        log: () => {},
      });
      row.outcome = result.outcome;
      row.level = result.level ?? null;
      row.missingLabels = Array.isArray(result.missingLabels) ? result.missingLabels : [];
    } catch (error) {
      row.outcome = "error";
      row.error = error?.message ?? String(error);
    }
    row.added = wrapped.adds.flatMap((entry) => entry.labels);
    row.removed = wrapped.removes.map((entry) => entry.name);
    rows.push(row);
  }
  return rows;
}

// ---- Report ---------------------------------------------------------------

const tick = (labels) => labels.map((name) => `\`${name}\``).join(", ");

// The changes of 1 row; an error row also shows the writes that worked before
// the error.
function changeText(row) {
  const parts = [];
  if (row.added.length > 0) parts.push(`add ${tick(row.added)}`);
  if (row.removed.length > 0) parts.push(`remove ${tick(row.removed)}`);
  if (row.error !== null && row.error !== undefined) return [...parts, escapeCell(row.error)].join("; ");
  if ((row.missingLabels ?? []).length > 0) parts.push(`no level label: the repository lacks ${tick(row.missingLabels)}`);
  return parts.length === 0 ? "no change" : parts.join("; ");
}

// Markdown: 1 section per repository, 1 last line that counts the changes.
// `results` holds { repository, rows, error } for each repository in argument
// order; `error` is a repository-level failure, such as an unreadable pull
// request list.
export function formatReport(results = [], { apply = false } = {}) {
  const lines = [];
  let changes = 0;
  let pullRequests = 0;
  let noList = 0;
  let errors = 0;
  const lacking = new Map();
  for (const result of results) {
    const rows = result.rows ?? [];
    lines.push(`## ${result.repository}`, "");
    if (result.error) {
      errors += 1;
      lines.push(`Could not list the open pull requests: ${escapeCell(result.error)}`, "");
      continue;
    }
    if (rows.length === 0) {
      lines.push("No open pull request.", "");
      continue;
    }
    lines.push("| PR | Level | Outcome | Change |", "| --- | --- | --- | --- |");
    for (const row of rows) {
      const level = row.level ?? "—";
      lines.push(`| #${row.number} | ${escapeCell(level)} | ${escapeCell(row.outcome)} | ${changeText(row)} |`);
      const count = row.added.length + row.removed.length;
      changes += count;
      if (count > 0) pullRequests += 1;
      if (row.outcome === "no-list") noList += 1;
      if (row.outcome === "error") errors += 1;
      if ((row.missingLabels ?? []).length > 0) lacking.set(result.repository, row.missingLabels);
    }
    lines.push("");
  }
  if (noList > 0) {
    lines.push(
      `${noList} pull request(s) have no list at their base SHA: no level label, as in the workflow; ` +
        "each gets one at its next event.",
    );
  }
  for (const [repository, missing] of lacking) {
    lines.push(
      `${repository} lacks the label(s) ${tick(missing)}: its pull requests get no level label. ` +
        `Fix: frostyard/core scripts/apply-triage-settings.sh ${repository} --apply`,
    );
  }
  if (errors > 0) lines.push(`${errors} error(s): see the rows above.`);
  if (changes === 0 && noList === 0 && errors === 0 && lacking.size === 0) {
    lines.push("No change: every open pull request has its level label.");
  } else if (changes === 0) {
    lines.push("No change.");
  } else if (apply) {
    lines.push(`${changes} change(s) made on ${pullRequests} pull request(s).`);
  } else {
    lines.push(`${changes} change(s) planned on ${pullRequests} pull request(s); re-run with --apply to make them.`);
  }
  return `${lines.join("\n")}\n`;
}
