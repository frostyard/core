#!/usr/bin/env node
// Read-only Dependabot shadow report (docs/design/dependabot-shadow.md, section
// "Measurement"): the class of every call comment, the class of each pull
// request that a call would have merged, the F4 lines of the report issue, the
// missed and "no metadata" lists, and a levels table for the same window. It
// reads GitHub only through `gh api` GET calls and writes nothing there: it
// enables no auto-merge, approves nothing, merges nothing and labels nothing.
// Exit 0 when every read worked, 1 when a read failed (the report is still
// printed, with an "## Errors" section), 2 on a usage error. The rules are in
// scripts/lib/dependabot-shadow-report.mjs.
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  DEFAULT_F4_AUTHORS,
  DEPENDABOT,
  PR_TRIAGE_JOB_PREFIX,
  SHADOW_AUTHOR,
  SHADOW_MARKER_PREFIX,
  buildReport,
  classifyCall,
  formatReport,
  parseCalls,
  requiredChecksOf,
  timeOf,
  windowRange,
} from "./lib/dependabot-shadow-report.mjs";
import { shortReason } from "./lib/required-checks-survey.mjs";

const execFileAsync = promisify(execFile);

const USAGE = [
  "Usage: node scripts/dependabot-shadow-report.mjs --since YYYY-MM-DD --until YYYY-MM-DD",
  "         [--issue N|OWNER/REPO#N] [--f4-author LOGIN]... [--as-of ISO] [--json]",
  "         [--record FILE] [--input FILE] OWNER/REPO...",
  "",
  "  --since, --until  required; UTC, both days inclusive",
  "  --issue           the report issue that may hold F4 lines (default frostyard/core)",
  "  --f4-author       a login that may write an F4 line; repeatable",
  `                    (default ${DEFAULT_F4_AUTHORS.join(", ")})`,
  "  --as-of           the \"now\" of the report (default: the current time)",
  "  --json            print the report object as JSON",
  "  --record FILE     also write the collected records to FILE",
  "  --input FILE      read records from FILE and make no gh call (it holds the",
  "                    issue comments too)",
  "  --help            print this text",
].join("\n");

const PAGE_SIZE = 100;
const MAX_PAGES = 50;
const DEFAULT_ISSUE_REPO = "frostyard/core";
const REPO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const ISSUE_PATTERN = /^(?:([A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*)#)?(\d+)$/;
const LEVEL_LABEL_PATTERN = /^level:L[1-4]$/;

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

export function parseArgs(argv = []) {
  const args = {
    since: null,
    until: null,
    issue: null,
    f4Authors: [],
    asOf: null,
    json: false,
    record: null,
    input: null,
    repos: [],
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") {
      args.help = true;
      continue;
    }
    if (flag === "--json") {
      args.json = true;
      continue;
    }
    if (!flag.startsWith("--")) {
      if (!REPO_PATTERN.test(flag)) throw new UsageError(`not an OWNER/REPO name: ${flag}`);
      args.repos.push(flag);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new UsageError(`missing value for ${flag}`);
    index += 1;
    if (flag === "--since") args.since = value;
    else if (flag === "--until") args.until = value;
    else if (flag === "--f4-author") args.f4Authors.push(value);
    else if (flag === "--as-of") args.asOf = value;
    else if (flag === "--record") args.record = value;
    else if (flag === "--input") args.input = value;
    else if (flag === "--issue") {
      const match = ISSUE_PATTERN.exec(value);
      if (match === null) throw new UsageError(`--issue takes N or OWNER/REPO#N: ${value}`);
      if (args.issue !== null) throw new UsageError("--issue takes 1 issue");
      const number = Number(match[2]);
      if (!Number.isSafeInteger(number) || number <= 0) throw new UsageError(`not an issue number: ${match[2]}`);
      args.issue = { repo: match[1] ?? DEFAULT_ISSUE_REPO, number };
    } else {
      throw new UsageError(`unknown flag: ${flag}`);
    }
  }

  if (args.help) return args;
  if (args.since === null) throw new UsageError("--since is required");
  if (args.until === null) throw new UsageError("--until is required");
  try {
    args.range = windowRange(args.since, args.until);
  } catch (error) {
    throw new UsageError(error.message);
  }
  if (args.asOf !== null && !Number.isFinite(Date.parse(args.asOf))) throw new UsageError(`invalid --as-of: ${args.asOf}`);
  if (args.repos.length === 0 && args.input === null) throw new UsageError("at least 1 OWNER/REPO or --input FILE is required");
  return args;
}

// ---- Reads (GET only) -----------------------------------------------------

function ghGet(endpoint) {
  return execFileAsync("gh", ["api", endpoint], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).then((result) => result.stdout);
}

function withQuery(endpoint, params) {
  const [base, search] = endpoint.split("?");
  const extra = new URLSearchParams(params).toString();
  return search === undefined ? `${base}?${extra}` : `${base}?${search}&${extra}`;
}

// Every page of a list endpoint, 100 items a page, at most MAX_PAGES pages.
// stop(batch) ends the read early; key names the list inside a page object.
async function pages(endpoint, { key = null, stop = null } = {}) {
  const items = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const value = JSON.parse(await ghGet(withQuery(endpoint, { per_page: PAGE_SIZE, page })));
    const batch = key === null ? value : value?.[key];
    if (!Array.isArray(batch)) throw new Error(`page ${page} of ${endpoint} is not a list`);
    items.push(...batch);
    if (stop !== null && batch.length > 0 && stop(batch)) return items;
    if (batch.length < PAGE_SIZE) return items;
  }
  throw new Error(`more than ${MAX_PAGES} pages of ${PAGE_SIZE} for ${endpoint}`);
}

async function attempt(read) {
  try {
    return { value: await read() };
  } catch (error) {
    return { error };
  }
}

function inRange(range, value) {
  const ms = timeOf(value);
  return Number.isFinite(ms) && ms >= range.start && ms < range.end;
}

// A pull request that a read kept: updated on or after the first day.
function notBefore(range, value) {
  const ms = timeOf(value);
  return Number.isFinite(ms) && ms >= range.start;
}

function numberFromIssueUrl(url) {
  const match = /\/(\d+)$/.exec(String(url ?? ""));
  return match === null ? null : Number(match[1]);
}

const trimPull = (pull) => ({
  number: pull?.number ?? null,
  title: pull?.title ?? "",
  user: { login: pull?.user?.login ?? "" },
  state: pull?.state ?? "",
  draft: pull?.draft === true,
  created_at: pull?.created_at ?? null,
  closed_at: pull?.closed_at ?? null,
  merged_at: pull?.merged_at ?? null,
  merge_commit_sha: pull?.merge_commit_sha ?? null,
  head: { sha: pull?.head?.sha ?? "" },
  base: { ref: pull?.base?.ref ?? "" },
  labels: (pull?.labels ?? []).map((label) => ({ name: typeof label === "string" ? label : (label?.name ?? "") })),
});

const trimComment = (comment) => ({
  id: comment?.id ?? null,
  number: numberFromIssueUrl(comment?.issue_url),
  user: { login: comment?.user?.login ?? "" },
  created_at: comment?.created_at ?? null,
  body: typeof comment?.body === "string" ? comment.body : "",
});

// A comment that may hold a call: the author of every comment github.token
// writes, with a line that starts with the marker prefix. A malformed marker is
// kept here and dropped by parseCall, so the report says nothing about it.
const isCallComment = (comment) =>
  comment?.user?.login === SHADOW_AUTHOR &&
  typeof comment?.body === "string" &&
  comment.body.split(/\r?\n/).some((line) => line.trim().startsWith(SHADOW_MARKER_PREFIX));

const trimTimelineEvent = (event) => ({
  event: event?.event ?? "",
  created_at: event?.created_at ?? null,
  actor: { login: event?.actor?.login ?? "" },
  sha: event?.sha ?? "",
  committer: { date: event?.committer?.date ?? null },
});

const trimCommit = (commit) => ({
  sha: commit?.sha ?? "",
  author: { login: commit?.author?.login ?? "" },
  commit: { author: { name: commit?.commit?.author?.name ?? "" } },
});

const trimCheckRun = (run) => ({
  id: run?.id ?? null,
  name: run?.name ?? "",
  app: { id: run?.app?.id ?? null },
  status: run?.status ?? "",
  conclusion: run?.conclusion ?? null,
  started_at: run?.started_at ?? null,
  completed_at: run?.completed_at ?? null,
});

const trimStatus = (status) => ({
  context: status?.context ?? "",
  state: status?.state ?? "",
  updated_at: status?.updated_at ?? null,
});

const trimStep = (step) => ({ name: step?.name ?? "", conclusion: step?.conclusion ?? null });

// The check runs and the commit statuses of 1 sha each, read once.
async function readChecks(record, shas) {
  for (const sha of shas) {
    if (typeof sha !== "string" || sha === "" || record.checkRuns[sha] !== undefined) continue;
    const runs = await attempt(() => pages(`repos/${record.repo}/commits/${sha}/check-runs?filter=all`, { key: "check_runs" }));
    if (runs.error) record.errors.push(`check runs of ${sha}: ${shortReason(runs.error)}`);
    record.checkRuns[sha] = runs.error ? [] : runs.value.map(trimCheckRun);
    const statuses = await attempt(() => pages(`repos/${record.repo}/commits/${sha}/status`, { key: "statuses" }));
    if (statuses.error) record.errors.push(`commit statuses of ${sha}: ${shortReason(statuses.error)}`);
    record.statuses[sha] = statuses.error ? [] : statuses.value.map(trimStatus);
  }
}

// The steps of each pr-triage check run of a Dependabot head: an Actions check
// run id is its job id.
async function readJobs(record, shas) {
  for (const sha of shas) {
    for (const run of record.checkRuns[sha] ?? []) {
      if (!String(run.name).startsWith(PR_TRIAGE_JOB_PREFIX)) continue;
      const key = String(run.id);
      if (record.jobs[key] !== undefined) continue;
      const job = await attempt(async () => JSON.parse(await ghGet(`repos/${record.repo}/actions/jobs/${run.id}`)));
      if (job.error) {
        record.errors.push(`job ${key}: ${shortReason(job.error)}`);
        record.jobs[key] = { steps: [] };
        continue;
      }
      record.jobs[key] = { steps: (job.value?.steps ?? []).map(trimStep) };
    }
  }
}

async function readLabelEvents(record, range) {
  const events = await attempt(() =>
    pages(`repos/${record.repo}/issues/events`, {
      stop: (batch) =>
        batch.some((event) => {
          const ms = timeOf(event?.created_at);
          return Number.isFinite(ms) && ms < range.start;
        }),
    }),
  );
  if (events.error) {
    record.errors.push(`issue events: ${shortReason(events.error)}`);
    return;
  }
  record.labelEvents = levelLabelEvents(events.value);
}

// The `unlabeled` events of a level label, from `GET repos/{r}/issues/events`.
// The API gives the label as an object: `label.name` holds its name.
export function levelLabelEvents(events) {
  return (events ?? [])
    .filter((event) => event?.event === "unlabeled" && LEVEL_LABEL_PATTERN.test(String(event?.label?.name ?? "")))
    .map((event) => ({
      event: "unlabeled",
      number: event?.issue?.number ?? null,
      label: String(event.label.name),
      actor: event?.actor?.login ?? "",
      created_at: event?.created_at ?? null,
    }));
}

// 1 record for 1 repository. A failed read is recorded, never thrown.
async function collectRepo(repo, range) {
  const record = {
    repo,
    pulls: [],
    comments: [],
    timelines: {},
    commits: {},
    checkRuns: {},
    statuses: {},
    jobs: {},
    labelEvents: [],
    requiredChecks: {},
    errors: [],
  };
  const sinceIso = new Date(range.start).toISOString().replace(/\.\d{3}Z$/, "Z");

  const pulls = await attempt(() =>
    pages(`repos/${repo}/pulls?state=all&sort=updated&direction=desc`, {
      stop: (batch) => {
        const ms = timeOf(batch.at(-1)?.updated_at);
        return Number.isFinite(ms) && ms < range.start;
      },
    }),
  );
  if (pulls.error) record.errors.push(`pull requests: ${shortReason(pulls.error)}`);
  else record.pulls = pulls.value.filter((pull) => notBefore(range, pull?.updated_at)).map(trimPull);

  const comments = await attempt(() =>
    pages(`repos/${repo}/issues/comments?since=${encodeURIComponent(sinceIso)}&sort=created&direction=asc`),
  );
  if (comments.error) record.errors.push(`call comments: ${shortReason(comments.error)}`);
  else record.comments = comments.value.filter(isCallComment).map(trimComment);

  const calls = parseCalls(record);
  const dependabotPulls = record.pulls.filter(
    (pull) => pull.user.login === DEPENDABOT && (inRange(range, pull.created_at) || inRange(range, pull.merged_at)),
  );
  const numbers = new Set([...calls.map((call) => call.number), ...dependabotPulls.map((pull) => pull.number)]);

  for (const number of [...numbers].sort((a, b) => a - b)) {
    const timeline = await attempt(() => pages(`repos/${repo}/issues/${number}/timeline`));
    if (timeline.error) record.errors.push(`timeline of #${number}: ${shortReason(timeline.error)}`);
    else record.timelines[String(number)] = timeline.value.map(trimTimelineEvent);
    const commits = await attempt(() => pages(`repos/${repo}/pulls/${number}/commits`));
    if (commits.error) record.errors.push(`commits of #${number}: ${shortReason(commits.error)}`);
    else record.commits[String(number)] = commits.value.map(trimCommit);
  }

  const dependabotHeads = dependabotPulls.map((pull) => pull.head.sha).filter((sha) => sha !== "");
  await readChecks(record, [...new Set([...calls.map((call) => call.head), ...dependabotHeads])]);
  await readJobs(record, [...new Set(dependabotHeads)]);

  // A merged pull request with a would-have-merged call needs the checks of its
  // merge commit (F2), and those calls are known only after the call heads.
  const allCalls = parseCalls(record);
  const lastWhm = new Map();
  for (const call of allCalls) {
    if (!inRange(range, call.created_at)) continue;
    if (classifyCall(record, call, allCalls) !== "would-have-merged") continue;
    const known = lastWhm.get(call.number);
    if (known === undefined || timeOf(call.created_at) >= timeOf(known.created_at)) lastWhm.set(call.number, call);
  }
  const mergeShas = [];
  for (const number of lastWhm.keys()) {
    const pull = record.pulls.find((entry) => Number(entry.number) === Number(number));
    if (pull === undefined || pull.merged_at === null) continue;
    if (typeof pull.merge_commit_sha === "string" && pull.merge_commit_sha !== "") mergeShas.push(pull.merge_commit_sha);
  }
  await readChecks(record, [...new Set(mergeShas)]);

  await readLabelEvents(record, range);

  const bases = [...new Set(dependabotPulls.map((pull) => pull.base.ref).filter((ref) => ref !== ""))];
  for (const base of bases) {
    const rules = await attempt(async () => JSON.parse(await ghGet(`repos/${repo}/rules/branches/${encodeURIComponent(base)}`)));
    if (rules.error) record.errors.push(`branch rules of ${base}: ${shortReason(rules.error)}`);
    else record.requiredChecks[base] = requiredChecksOf(rules.value);
  }

  return record;
}

async function collectIssueComments(issue) {
  const items = await pages(`repos/${issue.repo}/issues/${issue.number}/comments`);
  return items.map((comment) => ({
    user: { login: comment?.user?.login ?? "" },
    body: typeof comment?.body === "string" ? comment.body : "",
    created_at: comment?.created_at ?? null,
  }));
}

// ---- Main -----------------------------------------------------------------

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`${error.message}\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  const extraErrors = [];
  let records;
  let issueComments = null;

  if (args.input !== null) {
    let data;
    try {
      data = JSON.parse(await readFile(resolve(args.input), "utf8"));
      if (!Array.isArray(data?.records)) throw new TypeError("records must be a JSON array");
    } catch (error) {
      console.error(`cannot read --input ${args.input}: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    const wanted = new Set(args.repos.map((repo) => repo.toLowerCase()));
    records = wanted.size === 0
      ? data.records
      : data.records.filter((record) => wanted.has(String(record?.repo ?? "").toLowerCase()));
    issueComments = Array.isArray(data?.issueComments) ? data.issueComments : null;
  } else {
    records = [];
    for (const repo of args.repos) records.push(await collectRepo(repo, args.range));
    if (args.issue !== null) {
      try {
        issueComments = await collectIssueComments(args.issue);
      } catch (error) {
        extraErrors.push(`comments of ${args.issue.repo}#${args.issue.number}: ${shortReason(error)}`);
      }
    }
  }

  const report = buildReport({
    since: args.since,
    until: args.until,
    records,
    issueComments,
    f4Authors: args.f4Authors.length === 0 ? DEFAULT_F4_AUTHORS : args.f4Authors,
    asOf: args.asOf ?? new Date().toISOString(),
    errors: extraErrors,
  });

  if (args.record !== null) {
    try {
      const body = { since: args.since, until: args.until, records, issueComments };
      await writeFile(resolve(args.record), `${JSON.stringify(body, null, 2)}\n`, "utf8");
    } catch (error) {
      console.error(`cannot write --record ${args.record}: ${error.message}`);
      process.exitCode = 1;
      return;
    }
  }

  process.stdout.write(args.json ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report));
  if (report.errors.length > 0) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`failed: ${String(error?.message ?? error)}`);
    process.exitCode = 1;
  });
}
