// PR triage (ADR-0077, ADR-0078, docs/specs/pr-triage.md): the levels step that
// adds the level label level:L1 to level:L4 and, for L1 and L2, the label
// risk:high (ADR-0068, docs/specs/risk-paths.md), and the readiness step that
// removes the label ready-for-human when the pull request head moves after the
// label, or when the label comes while CI at the head is not green. `main`
// picks the step from PR_TRIAGE_STEP: `levels` or `readiness`.
//
// The reusable workflow .github/workflows/pr-triage.yml embeds this file
// verbatim, plus 1 trailer line, and scripts/lib/risk-paths.mjs beside it. It
// writes both to the runner temp directory and runs this file with Node, with
// no checkout. Edit this file, then run `npm run sync:risk-paths-workflow`;
// `npm run check:risk-paths` fails when the embedded copy drifts. Never edit
// the embedded copy by hand.
import {
  LABEL,
  LEVELS,
  LIST_PATH,
  NAME_PATTERN,
  commandValue,
  createGitHubApi,
  escapeCell,
  levelOfPullRequest,
  parseStrictJson,
  validateRiskPaths,
} from "./risk-paths.mjs";

export const READY_LABEL = "ready-for-human";
export const MARKER_PREFIX = "<!-- frostyard:readiness-revoked v1";
const OWN_CHECK_PREFIX = "pr-triage";
const GREEN_CONCLUSIONS = new Set(["success", "neutral", "skipped"]);
const BAD_STATUS_STATES = new Set(["pending", "failure", "error"]);
const SUMMARY_ROW_LIMIT = 50;
const LEVELS_ROW_LIMIT = 500;
const READINESS_PREFIX = "pr-triage: readiness: ";
const LEVELS_PREFIX = "risk-paths: ";
export const LEVEL_LABELS = Object.freeze({ L1: "level:L1", L2: "level:L2", L3: "level:L3", L4: "level:L4" });
const SHA_PATTERN = /^[0-9a-f]{40}$/;

// ---- Comments -------------------------------------------------------------

const short = (sha) => sha.slice(0, 12);

// The marker line of a revocation comment; it is also the comment's first line.
export function readinessMarker({ reason, before, after, head }) {
  if (reason === "head-moved") return `${MARKER_PREFIX} reason=head-moved before=${before} after=${after} -->`;
  if (reason === "checks-not-green") return `${MARKER_PREFIX} reason=checks-not-green head=${head} -->`;
  throw new Error(`unknown readiness reason ${JSON.stringify(reason)}`);
}

export function readinessComment({ reason, before, after, head }) {
  const marker = readinessMarker({ reason, before, after, head });
  if (reason === "head-moved") {
    return (
      `${marker}\n` +
      `\`${READY_LABEL}\` came off: the head moved from \`${short(before)}\` to \`${short(after)}\` after the label. ` +
      "Run the checks and the review again at the new head, then add the label again."
    );
  }
  return (
    `${marker}\n` +
    `\`${READY_LABEL}\` came off: CI at \`${short(head)}\` was not green when the label came. ` +
    "Add the label again when every check passes at this head."
  );
}

// ---- Checks ---------------------------------------------------------------

// Returns { relevant, notGreen } for the check runs and commit statuses of a
// head. The check runs of this workflow (names that start with pr-triage) are
// left out: the step cannot wait for itself.
export function evaluateChecks(checkRuns, statuses) {
  const runs = checkRuns.filter((run) => !String(run?.name ?? "").startsWith(OWN_CHECK_PREFIX));
  const notGreen = [];
  for (const run of runs) {
    if (run?.status !== "completed") {
      notGreen.push({ kind: "check run", name: run?.name, state: String(run?.status) });
    } else if (!GREEN_CONCLUSIONS.has(run.conclusion)) {
      notGreen.push({ kind: "check run", name: run.name, state: String(run.conclusion) });
    }
  }
  for (const status of statuses) {
    if (BAD_STATUS_STATES.has(status?.state)) {
      notGreen.push({ kind: "status", name: status.context, state: String(status.state) });
    }
  }
  return { relevant: runs.length + statuses.length, notGreen };
}

// ---- Step -----------------------------------------------------------------

export async function runReadinessStep({ api, eventName, event, summary, log }) {
  const say = (message, value) =>
    log(value === undefined ? `${READINESS_PREFIX}${message}` : `${READINESS_PREFIX}${message} ${JSON.stringify(value)}`);

  if (eventName !== "pull_request_target") {
    throw new Error(`the caller must run on pull_request_target, not ${JSON.stringify(eventName)}`);
  }
  const pr = event?.pull_request;
  const owner = event?.repository?.owner?.login;
  const repo = event?.repository?.name;
  const number = pr?.number;
  if (typeof owner !== "string" || !NAME_PATTERN.test(owner) || typeof repo !== "string" || !NAME_PATTERN.test(repo)) {
    throw new Error("the event has no valid repository owner and name");
  }
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("the event has no valid pull request number");
  const action = event?.action;
  say("repository", `${owner}/${repo}`);
  say("pull request", number);
  say("action", action);

  const done = async (outcome, text) => {
    say(text);
    await summary(`## Readiness\n\n${text}\n`);
    return { outcome };
  };

  let revocation;
  let notGreen = [];
  if (action === "synchronize") {
    const labels = Array.isArray(pr?.labels) ? pr.labels : [];
    if (!labels.some((label) => label?.name === READY_LABEL)) {
      return done("no-label", `the pull request has no \`${READY_LABEL}\` label. No label change.`);
    }
    const { before, after } = event;
    if (typeof before !== "string" || !SHA_PATTERN.test(before)) {
      throw new Error("the event has no valid before (40 hex characters)");
    }
    if (typeof after !== "string" || !SHA_PATTERN.test(after)) {
      throw new Error("the event has no valid after (40 hex characters)");
    }
    revocation = { reason: "head-moved", before, after };
    say("head moved", { before, after });
  } else if (action === "labeled" && event?.label?.name === READY_LABEL) {
    const head = pr?.head?.sha;
    if (typeof head !== "string" || !SHA_PATTERN.test(head)) {
      throw new Error("the event has no valid pull request head SHA (40 hex characters)");
    }
    say("head", head);
    const checkRuns = await api.listCheckRuns(owner, repo, head);
    const statuses = await api.listCommitStatuses(owner, repo, head);
    const evaluated = evaluateChecks(checkRuns, statuses);
    say("checks counted", evaluated.relevant);
    if (evaluated.relevant === 0) {
      return done("no-checks", "no check run and no commit status at the head. No label change.");
    }
    if (evaluated.notGreen.length === 0) {
      return done("green", "every check at the head is green. The label stays.");
    }
    notGreen = evaluated.notGreen;
    revocation = { reason: "checks-not-green", head };
    for (const row of notGreen) say("not green", row);
  } else {
    return done("ignored", "the event is not a push to a labeled pull request and not the label being added. No label change.");
  }

  // The marker comment comes first: when the delete fails, a re-run finds the
  // marker and writes no second comment.
  const marker = readinessMarker(revocation);
  const comments = await api.listIssueComments(owner, repo, number);
  const hasMarker = comments.some(
    (comment) => typeof comment?.body === "string" && comment.body.split(/\r?\n/).some((line) => line.trim() === marker),
  );
  if (!hasMarker) {
    await api.createIssueComment(owner, repo, number, readinessComment(revocation));
    say("wrote the marker comment", revocation.reason);
  } else {
    say("the marker comment exists", revocation.reason);
  }
  const removed = await api.removeIssueLabel(owner, repo, number, READY_LABEL);
  say(removed ? "removed label" : "label already gone", READY_LABEL);

  const lines = [
    "## Readiness",
    "",
    `Removed the label \`${READY_LABEL}\`${removed ? "" : " (it was already gone)"}. Reason: \`${revocation.reason}\`.`,
    "",
  ];
  if (notGreen.length > 0) {
    lines.push("| Check | Kind | State |", "| --- | --- | --- |");
    for (const row of notGreen.slice(0, SUMMARY_ROW_LIMIT)) {
      lines.push(`| ${escapeCell(row.name)} | ${row.kind} | ${escapeCell(row.state)} |`);
    }
    if (notGreen.length > SUMMARY_ROW_LIMIT) {
      lines.push("", `${notGreen.length - SUMMARY_ROW_LIMIT} more checks are not shown here; the job log lists every one.`);
    }
  }
  await summary(`${lines.join("\n")}\n`);
  return { outcome: "revoked", reason: revocation.reason, commented: !hasMarker, removed };
}

// ---- Levels step ----------------------------------------------------------

const levelRank = (level) => LEVELS.indexOf(level);

// Adds the level label of the pull request and, for L1 and L2, risk:high. A
// level label only gets stricter: a looser computed level keeps the stricter
// label that the pull request has. Never removes risk:high. Never creates a
// label: the add-labels API creates a missing one, so the step checks first.
export async function runLevelsStep({ api, eventName, event, summary, log }) {
  const say = (message, value) =>
    log(value === undefined ? `${LEVELS_PREFIX}${message}` : `${LEVELS_PREFIX}${message} ${JSON.stringify(value)}`);

  if (eventName !== "pull_request_target") {
    throw new Error(`the caller must run on pull_request_target, not ${JSON.stringify(eventName)}`);
  }
  const pr = event?.pull_request;
  const owner = event?.repository?.owner?.login;
  const repo = event?.repository?.name;
  const number = pr?.number;
  const baseSha = pr?.base?.sha;
  if (typeof owner !== "string" || !NAME_PATTERN.test(owner) || typeof repo !== "string" || !NAME_PATTERN.test(repo)) {
    throw new Error("the event has no valid repository owner and name");
  }
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("the event has no valid pull request number");
  if (typeof baseSha !== "string" || !SHA_PATTERN.test(baseSha)) {
    throw new Error("the event has no valid pull_request.base.sha (40 hex characters)");
  }
  const fullName = `${owner}/${repo}`;
  say("repository", fullName);
  say("pull request", number);
  say("base sha", baseSha);

  const text = await api.getFileAtRef(owner, repo, LIST_PATH, baseSha);
  if (text === null) {
    say(`no list on base: ${LIST_PATH} does not exist at`, baseSha);
    await summary(`## Levels\n\nno list on base: \`${LIST_PATH}\` does not exist at \`${baseSha}\`. No label change.\n`);
    return { outcome: "no-list" };
  }

  let list;
  try {
    list = parseStrictJson(text);
  } catch (error) {
    throw new Error(`${LIST_PATH} at ${baseSha} is not valid: ${error.message}`);
  }
  const validation = validateRiskPaths(list);
  if (!validation.ok) {
    throw new Error(`${LIST_PATH} at ${baseSha} is not valid: ${validation.errors.join("; ")}`);
  }
  say("list entries", list.paths.length);

  if (!(await api.labelExists(owner, repo, LABEL))) {
    throw new Error(
      `label ${LABEL} does not exist in ${fullName}; the accountable owner must create it ` +
        `(gh label create ${LABEL} --repo ${fullName} --color B60205 --description "Touches a high-risk path (ADR-0068)")`,
    );
  }
  const missingLabels = [];
  for (const level of LEVELS) {
    if (!(await api.labelExists(owner, repo, LEVEL_LABELS[level]))) missingLabels.push(LEVEL_LABELS[level]);
  }

  const files = await api.listPullFiles(owner, repo, number);
  say("changed files", files.length);
  const computed = levelOfPullRequest(list, files);
  const level = computed.level;
  say("computed level", level);
  const strict = computed.files.filter((result) => result.level === "L1" || result.level === "L2");
  for (const result of strict) say("path", result);

  const alias = level === "L1" || level === "L2" ? [LABEL] : [];
  const added = [];
  const removed = [];
  let outcome;
  let kept = null;
  if (missingLabels.length > 0) {
    outcome = "labels-missing";
    if (alias.length > 0) {
      await api.addLabels(owner, repo, number, alias);
      added.push(...alias);
    }
  } else {
    const current = (await api.listIssueLabels(owner, repo, number)).map((label) => label?.name);
    const currentLevels = LEVELS.filter((candidate) => current.includes(LEVEL_LABELS[candidate]));
    const strictest = currentLevels[0];
    const raise = strictest === undefined || levelRank(level) < levelRank(strictest);
    const toAdd = raise ? [LEVEL_LABELS[level], ...alias] : alias;
    if (!raise) kept = strictest;
    if (toAdd.length > 0) {
      await api.addLabels(owner, repo, number, toAdd);
      added.push(...toAdd);
    }
    if (raise) {
      for (const candidate of currentLevels) {
        if (levelRank(candidate) <= levelRank(level)) continue;
        await api.removeIssueLabel(owner, repo, number, LEVEL_LABELS[candidate]);
        removed.push(LEVEL_LABELS[candidate]);
      }
    }
    outcome = raise ? "labeled" : "kept";
  }
  for (const name of added) say("added label", name);
  for (const name of removed) say("removed label", name);

  const lines = ["## Levels", ""];
  if (kept !== null) {
    lines.push(`Level: computed ${level}, kept ${kept}. A level label only gets stricter.`);
  } else {
    lines.push(`Level: computed ${level}.`);
  }
  if (added.length > 0) lines.push("", `Added ${added.map((name) => `\`${name}\``).join(", ")}.`);
  if (removed.length > 0) lines.push("", `Removed ${removed.map((name) => `\`${name}\``).join(", ")}.`);
  if (missingLabels.length > 0) {
    const warning =
      `warning: the label ${missingLabels.join(", ")} does not exist in ${fullName}; no level label changed. ` +
      `Fix: frostyard/core scripts/apply-triage-settings.sh ${fullName} --apply`;
    say(warning);
    lines.push("", `**${escapeCell(warning)}**`);
  }
  if (computed.truncated) {
    say("file list truncated at", files.length);
    lines.push(
      "",
      `The file list is truncated: the GitHub API returned ${files.length} files, its limit is 3000. The level is L1 (fail safe).`,
    );
  }
  if (strict.length > 0) {
    lines.push("", "| Path | Glob or floor | Level | Why |", "| --- | --- | --- | --- |");
    for (const result of strict.slice(0, LEVELS_ROW_LIMIT)) {
      const where = result.source === "glob" ? result.glob : result.source === "floor" ? "org floor" : "default_level";
      lines.push(`| ${escapeCell(result.path)} | ${escapeCell(where)} | ${result.level} | ${escapeCell(result.why ?? "")} |`);
    }
    if (strict.length > LEVELS_ROW_LIMIT) {
      lines.push("", `${strict.length - LEVELS_ROW_LIMIT} more paths are not shown here; the job log lists every path.`);
    }
  }
  await summary(`${lines.join("\n")}\n`);
  return { outcome, level, truncated: computed.truncated, added, removed, missingLabels };
}

// ---- Entry ----------------------------------------------------------------

export async function main(env) {
  const token = env.GITHUB_TOKEN;
  try {
    const step = env.PR_TRIAGE_STEP;
    if (step !== "levels" && step !== "readiness") {
      throw new Error(`unknown PR_TRIAGE_STEP ${JSON.stringify(step)}`);
    }
    const fs = await import("node:fs/promises");
    if (!env.GITHUB_EVENT_PATH) throw new Error("GITHUB_EVENT_PATH is not set");
    if (!token) throw new Error("GITHUB_TOKEN is not set");
    const event = JSON.parse(await fs.readFile(env.GITHUB_EVENT_PATH, "utf8"));
    const api = createGitHubApi({
      token,
      apiUrl: env.GITHUB_API_URL || "https://api.github.com",
      fetch: globalThis.fetch,
    });
    const summary = async (markdown) => {
      if (env.GITHUB_STEP_SUMMARY) await fs.appendFile(env.GITHUB_STEP_SUMMARY, markdown);
    };
    // Untrusted text never starts a line: a line without the prefix is quoted.
    const prefix = step === "levels" ? LEVELS_PREFIX : READINESS_PREFIX;
    const log = (line) => {
      const text = String(line).replace(/[\r\n\u2028\u2029]/g, " ");
      process.stdout.write(`${text.startsWith(prefix) ? text : prefix + JSON.stringify(text)}\n`);
    };
    const run = step === "levels" ? runLevelsStep : runReadinessStep;
    return await run({ api, eventName: env.GITHUB_EVENT_NAME, event, summary, log });
  } catch (error) {
    let message = String(error?.message ?? error);
    if (token) message = message.split(token).join("***");
    message = message.replace(/[\r\n\u2028\u2029]+/g, " ");
    process.stdout.write(`::error::${commandValue(message)}\n`);
    process.exitCode = 1;
    return undefined;
  }
}
