#!/usr/bin/env node
// Read-only outcome report for the PR acceptance metric
// (docs/specs/pr-acceptance-metric.md): the revert list and the
// escaped-defect count. It reads GitHub through `gh` and never writes.
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { escapedDefects, findReverts } from "./lib/pr-outcomes.mjs";

const execFileAsync = promisify(execFile);
const DAY_MS = 86_400_000;
const PR_LIMIT = 1000;

const USAGE = [
  "Usage: node scripts/pr-outcomes.mjs reverts (--repo owner/name)... --since ISO [--until ISO] [--input FILE] [--json] [--out FILE]",
  "       node scripts/pr-outcomes.mjs escaped (--repo owner/name)... --from ISO --to ISO [--as-of ISO] [--author LOGIN]... [--input FILE] [--json] [--out FILE]",
].join("\n");

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

class TruncatedError extends Error {
  constructor(message) {
    super(message);
    this.name = "TruncatedError";
  }
}

function ghExec(args) {
  return execFileAsync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).then((result) => result.stdout);
}

function parseArgs(argv = []) {
  const [command, ...rest] = argv;
  if (command !== "reverts" && command !== "escaped") {
    throw new UsageError(command === undefined ? "no command given" : `unknown command: ${command}`);
  }

  const allowed = command === "reverts"
    ? new Set(["--repo", "--since", "--until", "--input", "--json", "--out"])
    : new Set(["--repo", "--from", "--to", "--as-of", "--author", "--input", "--json", "--out"]);

  const args = {
    command, repos: [], authors: [], input: null, out: null, json: false,
    since: null, until: null, from: null, to: null, asOf: null,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (!allowed.has(flag)) throw new UsageError(`unknown flag: ${flag}`);
    if (flag === "--json") {
      args.json = true;
      continue;
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) throw new UsageError(`missing value for ${flag}`);
    index += 1;
    if (flag === "--repo") args.repos.push(value);
    else if (flag === "--author") args.authors.push(value);
    else if (flag === "--input") args.input = value;
    else if (flag === "--out") args.out = value;
    else if (flag === "--since") args.since = value;
    else if (flag === "--until") args.until = value;
    else if (flag === "--from") args.from = value;
    else if (flag === "--to") args.to = value;
    else if (flag === "--as-of") args.asOf = value;
  }

  const date = (value, flag) => {
    if (value === null) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new UsageError(`invalid ${flag}: ${value}`);
    return parsed;
  };

  if (command === "reverts") {
    if (args.since === null) throw new UsageError("--since is required");
    args.fromDate = date(args.since, "--since");
    args.toDate = date(args.until, "--until");
  } else {
    if (args.from === null) throw new UsageError("--from is required");
    if (args.to === null) throw new UsageError("--to is required");
    args.fromDate = date(args.from, "--from");
    args.toDate = date(args.to, "--to");
    if (args.toDate.getTime() <= args.fromDate.getTime()) throw new UsageError("--to must be after --from");
    args.asOfDate = date(args.asOf, "--as-of") ?? new Date();
  }

  if (args.repos.length === 0 && args.input === null) {
    throw new UsageError("at least 1 --repo owner/name or --input FILE is required");
  }

  return args;
}

// GitHub search and the commits API take ISO 8601 UTC stamps.
function utcStamp(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// `gh api --paginate --slurp` prints 1 JSON array that holds 1 array per
// page. (Without --slurp, pages print back to back and cannot be split
// safely: a commit message can hold "] [".)
export function parseSlurpedPages(text) {
  const trimmed = String(text ?? "").trim();
  if (trimmed === "") return [];
  const pages = JSON.parse(trimmed);
  if (!Array.isArray(pages) || !pages.every(Array.isArray)) {
    throw new Error("gh api --slurp did not return an array of pages");
  }
  return pages.flat();
}

async function fetchRepository(repository, from, to, exec) {
  const window = `${utcStamp(from)}..${utcStamp(to)}`;
  // Only a PR merged into the default branch is a change (the spec).
  const defaultBranch = String(await exec(["api", `repos/${repository}`, "--jq", ".default_branch"])).trim();

  const prText = await exec([
    "pr", "list", "--repo", repository, "--state", "merged", "--limit", String(PR_LIMIT),
    "--search", `merged:${window} base:${defaultBranch}`,
    "--json", "number,title,body,mergedAt,author,mergeCommit,baseRefName",
  ]);
  const prs = JSON.parse(prText === "" ? "[]" : prText);
  // A full page means more merged PRs may exist: a partial count would be
  // wrong, so it is an error, never a quiet shortfall.
  if (prs.length >= PR_LIMIT) {
    throw new TruncatedError(`${repository}: gh pr list returned ${prs.length} merged PRs for ${window}; the result is truncated (narrow the window)`);
  }

  const changes = prs.map((pr) => ({
    repository,
    kind: "pr",
    number: pr.number,
    title: pr.title ?? "",
    body: pr.body ?? "",
    mergedAt: pr.mergedAt ?? "",
    author: pr.author?.login ?? "",
    mergeCommit: pr.mergeCommit?.oid ?? null,
    base: pr.baseRefName ?? null,
    defaultBranch,
  }));

  const commitText = await exec([
    "api", "--paginate", "--slurp", `repos/${repository}/commits?since=${utcStamp(from)}&until=${utcStamp(to)}&per_page=100`,
  ]);
  for (const commit of parseSlurpedPages(commitText)) {
    const message = String(commit?.commit?.message ?? "");
    const lines = message.split("\n");
    changes.push({
      repository,
      kind: "commit",
      sha: String(commit?.sha ?? ""),
      title: lines[0] ?? "",
      body: lines.slice(1).join("\n").replace(/^\n+/, ""),
      mergedAt: commit?.commit?.committer?.date ?? "",
      author: commit?.author?.login ?? commit?.commit?.author?.name ?? "",
    });
  }
  return changes;
}

export async function fetchChanges({ repositories, from, to, exec = ghExec }) {
  const changes = [];
  for (const repository of repositories) {
    for (const change of await fetchRepository(repository, from, to, exec)) changes.push(change);
  }
  return changes;
}

async function readInput(file) {
  const text = await readFile(file, "utf8");
  const value = JSON.parse(text);
  if (!Array.isArray(value)) throw new TypeError(`${file} must hold a JSON array of changes`);
  return value;
}

function timeOf(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string" && value !== "") return new Date(value).getTime();
  return Number.NaN;
}

// Both modes keep the same changes after they are read, however they were
// read: the repositories of --repo, and the window that was read.
function selectChanges(changes, { repositories, from, to }) {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  return changes.filter((change) => {
    const repository = String(change?.repository ?? "").toLowerCase();
    if (repositories !== null && !repositories.includes(repository)) return false;
    const at = timeOf(change?.mergedAt);
    return at >= fromMs && at <= toMs;
  });
}

// Text output goes to a terminal: a title or a body line from GitHub must not
// carry escape sequences or control characters into it (see clean() in
// scripts/corrections-report.mjs).
function clean(value) {
  return String(value).replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ");
}

function summaryOf(change) {
  return change.kind === "pr" ? `${change.repository}#${change.number} (pr)` : `${change.repository}@${change.sha.slice(0, 12)} (commit)`;
}

function revertsText({ since, until, repositories, reverts }) {
  const lines = [];
  lines.push(`PR reverts: ${since} .. ${until}`);
  lines.push(`Repositories: ${repositories === null ? "(from --input)" : repositories.join(", ")}`);
  lines.push(`Reverts found: ${reverts.length}`);
  for (const revert of reverts) {
    const target = `${revert.reverted.repository}#${revert.reverted.number}`;
    lines.push(`- ${clean(summaryOf(revert.by))} reverts ${clean(target)} "${clean(revert.reverted.title)}" [${revert.rule}]: ${clean(revert.evidence)}`);
  }
  return `${lines.join("\n")}\n`;
}

function escapedText(result) {
  const lines = [];
  lines.push(`Escaped defects: ${result.from} .. ${result.to}`);
  lines.push(`As of: ${result.as_of}`);
  lines.push(result.complete
    ? "Cohort complete: every PR had 7 full days"
    : `incomplete: escapes are not final until ${new Date(new Date(result.to).getTime() + 7 * DAY_MS).toISOString()}`);
  lines.push(`Repositories: ${result.repositories === null ? "(all in the input)" : result.repositories.join(", ")}`);
  lines.push(`Authors: ${result.authors.join(", ")}`);
  const rate = result.rate === null
    ? `no rate (${result.complete ? "empty cohort" : "incomplete cohort"})`
    : result.rate;
  lines.push(`Merged: ${result.merged}; escaped: ${result.escaped}; rate: ${rate}`);
  for (const item of result.items) {
    lines.push(`- ${clean(item.repository)}#${item.number} "${clean(item.title)}"`);
    for (const match of item.by) {
      lines.push(`  - ${clean(match.kind_of_match)} by ${clean(summaryOf(match))}, ${clean(match.rule)}: ${clean(match.evidence)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`${USAGE}\n${error.message}`);
    process.exitCode = 2;
    return;
  }

  const repositories = args.repos.length === 0 ? null : [...new Set(args.repos.map((repo) => repo.toLowerCase()))];
  const input = args.input === null ? null : resolve(args.input);

  if (args.command === "reverts") {
    // --until is optional: the window runs to now when it is absent.
    const until = args.toDate ?? new Date();
    let changes;
    try {
      changes = input === null
        ? await fetchChanges({ repositories, from: args.fromDate, to: until })
        : await readInput(input);
    } catch (error) {
      console.error(error instanceof TruncatedError ? `Error: ${error.message}` : `gh failed: ${error.message}`);
      process.exitCode = 1;
      return;
    }

    let reverts;
    try {
      reverts = findReverts(selectChanges(changes, { repositories, from: args.fromDate, to: until }));
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exitCode = 1;
      return;
    }

    const report = {
      since: args.fromDate.toISOString(),
      until: until.toISOString(),
      repositories,
      reverts,
    };
    const output = args.json ? `${JSON.stringify(report, null, 2)}\n` : revertsText(report);
    if (args.out !== null) {
      try {
        await writeFile(resolve(args.out), output, "utf8");
      } catch (error) {
        console.error(`could not write --out file ${args.out}: ${error.message}`);
        process.exitCode = 1;
        return;
      }
      return;
    }
    process.stdout.write(output);
    return;
  }

  // The escaped-defect fix window reaches 7 days past --to: 1 fetch of the
  // wider window covers the cohort and every change that can escape it.
  const fetchFrom = args.fromDate;
  const fetchTo = new Date(args.toDate.getTime() + 7 * DAY_MS);

  let changes;
  try {
    changes = input === null
      ? await fetchChanges({ repositories, from: fetchFrom, to: fetchTo })
      : await readInput(input);
  } catch (error) {
    console.error(error instanceof TruncatedError ? `Error: ${error.message}` : `gh failed: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  let result;
  try {
    result = escapedDefects(selectChanges(changes, { repositories, from: fetchFrom, to: fetchTo }), {
      from: args.fromDate,
      to: args.toDate,
      asOf: args.asOfDate,
      authors: args.authors.length === 0 ? undefined : args.authors,
      repositories,
    });
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const output = args.json ? `${JSON.stringify(result, null, 2)}\n` : escapedText(result);
  if (args.out !== null) {
    try {
      await writeFile(resolve(args.out), output, "utf8");
    } catch (error) {
      console.error(`could not write --out file ${args.out}: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    return;
  }
  process.stdout.write(output);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
