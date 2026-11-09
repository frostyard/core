import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  DEPENDABOT,
  MIN_CALLS,
  SHADOW_AUTHOR,
  buildReport,
  checkResult,
  classifyCall,
  classifyCallWithReason,
  classifyPull,
  formatReport,
  levelOfPull,
  parseCall,
  parseF4,
  requiredChecksOf,
  timeOf,
  windowRange,
} from "../scripts/lib/dependabot-shadow-report.mjs";
import { shadowMarker } from "../scripts/lib/pr-triage.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(repoRoot, "scripts/dependabot-shadow-report.mjs");
const fixtureDir = path.join(repoRoot, "test/fixtures/dependabot-shadow-report");

const REPO = "frostyard/core";
const SINCE = "2026-11-01";
const UNTIL = "2026-11-14";
const RANGE = windowRange(SINCE, UNTIL);
// 40 hex characters, 1 letter each, so a head is easy to read in a failure.
const sha = (letter) => letter.repeat(40);
const A = sha("a");
const B = sha("b");
const C = sha("c");
const MERGE = "1234567890abcdef1234567890abcdef12345678";
const CALL_AT = `${SINCE}T10:00:00Z`;

// ---- Fixtures -------------------------------------------------------------

function callBody({ head = A, level = "L3", checks = [{ context: "docs-gate", integration_id: 15368 }] } = {}) {
  return `${shadowMarker({ head, level, checks })}\nShadow call: would auto-merge at \`${head.slice(0, 12)}\`. Nothing is enabled.`;
}

const comment = ({ id = 1, number = 12, login = SHADOW_AUTHOR, created_at = CALL_AT, body = callBody() } = {}) => ({
  id,
  number,
  user: { login },
  created_at,
  body,
});

const callOf = ({
  id = 1,
  number = 12,
  head = A,
  level = "L3",
  checks = [{ context: "docs-gate", integration_id: 15368 }],
  created_at = CALL_AT,
} = {}) => ({ id, number, head, level, checks, created_at });

const run = ({
  id = 1,
  name = "docs-gate",
  app = 15368,
  status = "completed",
  conclusion = "success",
  started_at = CALL_AT,
  completed_at = `${SINCE}T10:05:00Z`,
} = {}) => ({ id, name, app: { id: app }, status, conclusion, started_at, completed_at });

const status = ({ context = "docs-gate", state = "success", updated_at = `${SINCE}T10:05:00Z` } = {}) => ({
  context,
  state,
  updated_at,
});

const pull = ({
  number = 12,
  title = "chore(deps): bump ajv",
  state = "open",
  created_at = `${SINCE}T09:00:00Z`,
  merged_at = null,
  closed_at = null,
  merge_commit_sha = null,
  head = A,
  labels = ["level:L3"],
  login = DEPENDABOT,
} = {}) => ({
  number,
  title,
  user: { login },
  state,
  draft: false,
  created_at,
  closed_at,
  merged_at,
  merge_commit_sha,
  head: { sha: head },
  base: { ref: "main" },
  labels: labels.map((name) => ({ name })),
});

const dependabotCommit = (sha) => ({ sha, author: { login: "" }, commit: { author: { name: DEPENDABOT } } });
const personCommit = (sha, login = "bketelsen") => ({ sha, author: { login }, commit: { author: { name: login } } });

function record({
  repo = REPO,
  pulls = [],
  comments = [],
  timelines = {},
  commits = {},
  checkRuns = {},
  statuses = {},
  jobs = {},
  labelEvents = [],
  requiredChecks = {},
  errors = [],
} = {}) {
  return { repo, pulls, comments, timelines, commits, checkRuns, statuses, jobs, labelEvents, requiredChecks, errors };
}

function reportOf(records, options = {}) {
  return buildReport({ since: SINCE, until: UNTIL, asOf: `${UNTIL}T00:00:00Z`, records, ...options });
}

function runCli(args) {
  return execFileAsync(process.execPath, [scriptPath, ...args], { encoding: "utf8", cwd: repoRoot }).then(
    (result) => ({ code: 0, stdout: result.stdout, stderr: result.stderr }),
    (error) => ({ code: error.code, stdout: error.stdout ?? "", stderr: error.stderr ?? "" }),
  );
}

// ---- The marker -----------------------------------------------------------

test("the marker that the shadow step writes parses as 1 call", () => {
  const checks = [
    { context: "docs-gate", integration_id: 15368 },
    { context: "a-context-<with>-html", integration_id: null },
  ];
  const body = `${shadowMarker({ head: A, level: "L2", checks })}\nShadow call: nothing is enabled.`;
  assert.deepEqual(parseCall(comment({ id: 9, number: 42, body })), {
    id: 9,
    number: 42,
    head: A,
    level: "L2",
    checks,
    created_at: CALL_AT,
  });
});

test("a comment by another author, a bad head, bad JSON or no marker is not a call", () => {
  assert.equal(parseCall(comment({ login: "dependabot[bot]" })), null);
  assert.equal(parseCall(comment({ body: "<!-- frostyard:dependabot-shadow v1 head=zzz level=L3 checks=[] -->" })), null);
  assert.equal(parseCall(comment({ body: `<!-- frostyard:dependabot-shadow v1 head=${A} level=L3 checks=[{oops] -->` })), null);
  assert.equal(parseCall(comment({ body: `<!-- frostyard:dependabot-shadow v1 head=${A} level=L9 checks=[] -->` })), null);
  assert.equal(parseCall(comment({ body: "No marker here." })), null);
  assert.equal(parseCall(comment({ body: `<!-- frostyard:dependabot-shadow v1 head=${A} level=L3 checks={} -->` })), null);
});

// ---- Class of 1 call ------------------------------------------------------

test("each call class: would-have-merged, waited, unknown, superseded", () => {
  const call = callOf();
  assert.equal(classifyCall(record({ checkRuns: { [A]: [run()] } }), call, [call]), "would-have-merged");
  assert.equal(classifyCall(record({ checkRuns: { [A]: [run({ conclusion: "failure" })] } }), call, [call]), "waited");
  assert.equal(classifyCall(record(), call, [call]), "unknown");
  // The head moved (a later call with another head) before the run completed.
  const later = callOf({ id: 2, head: B, created_at: `${SINCE}T11:00:00Z` });
  const slow = record({ checkRuns: { [A]: [run({ started_at: `${SINCE}T09:00:00Z`, completed_at: `${SINCE}T12:00:00Z` })] } });
  assert.equal(classifyCall(slow, call, [call, later]), "superseded");
});

test("the class order: a moved head beats a failed check, and a failed check beats a missing one", () => {
  const checks = [
    { context: "docs-gate", integration_id: 15368 },
    { context: "fleet-conventions", integration_id: 15368 },
  ];
  const call = callOf({ checks });
  const later = callOf({ id: 3, head: C, checks, created_at: `${SINCE}T11:00:00Z` });
  const movedAndFailed = record({
    checkRuns: {
      [A]: [
        run({ id: 1, name: "docs-gate", conclusion: "failure", completed_at: null }),
        run({ id: 2, name: "fleet-conventions", started_at: `${SINCE}T10:10:00Z` }),
      ],
    },
  });
  assert.equal(classifyCall(movedAndFailed, call, [call, later]), "superseded");

  const failedAndMissing = record({
    checkRuns: { [A]: [run({ name: "docs-gate", conclusion: "failure" })] },
  });
  assert.equal(classifyCall(failedAndMissing, call, [call]), "waited");
});

test("a pull request with 2 calls: the calls table counts both and the pull request comes from the second", () => {
  const one = record({
    pulls: [pull()],
    comments: [comment({ id: 1 }), comment({ id: 2, body: callBody({ head: B }), created_at: `${SINCE}T13:00:00Z` })],
    timelines: {
      "12": [{ event: "head_ref_force_pushed", created_at: `${SINCE}T11:00:00Z`, actor: { login: DEPENDABOT }, sha: "", committer: { date: null } }],
    },
    checkRuns: {
      [A]: [run({ started_at: `${SINCE}T09:00:00Z`, completed_at: `${SINCE}T12:00:00Z` })],
      [B]: [run({ id: 2, started_at: `${SINCE}T13:00:00Z`, completed_at: `${SINCE}T13:10:00Z` })],
    },
  });
  const report = reportOf([one]);
  assert.equal(report.repos[0].calls.total, 2);
  assert.equal(report.repos[0].calls.superseded, 1);
  assert.equal(report.repos[0].calls.wouldHaveMerged, 1);
  assert.equal(report.repos[0].pulls.agreed, 1);
  assert.equal(report.details.length, 1);
  assert.equal(report.details[0].number, 12);
  assert.deepEqual(report.details[0].calls.map((call) => call.class), ["superseded", "would-have-merged"]);
});

test("superseded by a later call, by a force push, by a commit, and not when the head moved after the checks passed", () => {
  const call = callOf();
  const late = record({ checkRuns: { [A]: [run({ started_at: `${SINCE}T09:00:00Z`, completed_at: `${SINCE}T12:00:00Z` })] } });
  const laterCall = callOf({ id: 2, head: B, created_at: `${SINCE}T11:00:00Z` });
  assert.equal(classifyCall(late, call, [call, laterCall]), "superseded");

  const forcePush = record({
    checkRuns: { [A]: [run({ started_at: `${SINCE}T09:00:00Z`, completed_at: `${SINCE}T12:00:00Z` })] },
    timelines: { "12": [{ event: "head_ref_force_pushed", created_at: `${SINCE}T11:00:00Z`, actor: { login: DEPENDABOT }, sha: "", committer: { date: null } }] },
  });
  assert.equal(classifyCall(forcePush, call, [call]), "superseded");

  // The call head has its committed event, and another commit follows it. Its
  // push time is the first check run at its SHA.
  const committed = record({
    checkRuns: {
      [A]: [run({ started_at: `${SINCE}T09:00:00Z`, completed_at: `${SINCE}T12:00:00Z` })],
      [B]: [run({ id: 7, started_at: `${SINCE}T11:00:00Z`, completed_at: `${SINCE}T11:04:00Z` })],
    },
    timelines: {
      "12": [
        { event: "committed", created_at: `${SINCE}T09:00:00Z`, actor: { login: DEPENDABOT }, sha: A, committer: { date: `${SINCE}T09:00:00Z` } },
        { event: "committed", created_at: `${SINCE}T11:00:00Z`, actor: { login: DEPENDABOT }, sha: B, committer: { date: `${SINCE}T11:00:00Z` } },
      ],
    },
  });
  assert.equal(classifyCall(committed, call, [call]), "superseded");

  // No committed event for the call head: a later commit names the move, and
  // the check run at its SHA gives the push time.
  const commitAfter = record({
    checkRuns: {
      [A]: [run({ started_at: `${SINCE}T09:00:00Z`, completed_at: `${SINCE}T12:00:00Z` })],
      [B]: [run({ id: 7, started_at: `${SINCE}T11:00:00Z`, completed_at: `${SINCE}T11:04:00Z` })],
    },
    timelines: { "12": [{ event: "committed", created_at: `${SINCE}T11:00:00Z`, actor: { login: DEPENDABOT }, sha: B, committer: { date: `${SINCE}T11:00:00Z` } }] },
  });
  assert.equal(classifyCall(commitAfter, call, [call]), "superseded");

  // The same moves, but every check passed first: not superseded.
  const early = record({
    checkRuns: { [A]: [run({ completed_at: `${SINCE}T10:05:00Z` })] },
    timelines: { "12": [{ event: "head_ref_force_pushed", created_at: `${SINCE}T11:00:00Z`, actor: { login: DEPENDABOT }, sha: "", committer: { date: null } }] },
  });
  assert.equal(classifyCall(early, call, [call, laterCall]), "would-have-merged");
});

test("a rerun replaces the earlier run of the same check", () => {
  const call = callOf();
  const fixed = record({
    checkRuns: {
      [A]: [
        run({ id: 1, conclusion: "failure", started_at: `${SINCE}T10:00:00Z` }),
        run({ id: 2, conclusion: "success", started_at: `${SINCE}T10:30:00Z`, completed_at: `${SINCE}T10:35:00Z` }),
      ],
    },
  });
  assert.equal(checkResult(fixed, A, call.checks[0]).result, "pass");
  const broke = record({
    checkRuns: {
      [A]: [
        run({ id: 1, conclusion: "success", started_at: `${SINCE}T10:00:00Z` }),
        run({ id: 2, conclusion: "failure", started_at: `${SINCE}T10:30:00Z`, completed_at: `${SINCE}T10:35:00Z` }),
      ],
    },
  });
  assert.equal(checkResult(broke, A, call.checks[0]).result, "fail");
});

test("a run from another app is ignored when the marker names an app, and counts when it names none", () => {
  const otherApp = record({ checkRuns: { [A]: [run({ app: 99 })] } });
  assert.equal(checkResult(otherApp, A, { context: "docs-gate", integration_id: 15368 }).result, "unknown");
  assert.equal(checkResult(otherApp, A, { context: "docs-gate", integration_id: null }).result, "pass");
});

test("no run and no status is unknown, the commit status is the fallback, and a run in progress is unknown", () => {
  assert.equal(checkResult(record(), A, { context: "docs-gate", integration_id: 15368 }).result, "unknown");
  const pass = checkResult(record({ statuses: { [A]: [status()] } }), A, { context: "docs-gate", integration_id: 15368 });
  assert.equal(pass.result, "pass");
  assert.equal(pass.at, `${SINCE}T10:05:00Z`);
  assert.equal(checkResult(record({ statuses: { [A]: [status({ state: "error" })] } }), A, { context: "docs-gate", integration_id: 15368 }).result, "fail");
  assert.equal(checkResult(record({ statuses: { [A]: [status({ state: "pending" })] } }), A, { context: "docs-gate", integration_id: 15368 }).result, "unknown");
  const running = record({ checkRuns: { [A]: [run({ status: "in_progress", conclusion: null, completed_at: null })] } });
  assert.equal(checkResult(running, A, { context: "docs-gate", integration_id: 15368 }).result, "unknown");
});

// ---- Class of 1 pull request ----------------------------------------------

test("F2 by a revert pull request, and F2 by a failed check at the merge commit", () => {
  const merged = pull({
    state: "closed",
    created_at: `${SINCE}T09:00:00Z`,
    merged_at: `${SINCE}T12:00:00Z`,
    closed_at: `${SINCE}T12:00:00Z`,
    merge_commit_sha: MERGE,
  });
  const revert = pull({ number: 40, title: 'Revert "chore(deps): bump ajv (#12)"', state: "closed", merged_at: "2026-11-03T12:00:00Z", merge_commit_sha: sha("f") });
  const byRevert = record({ pulls: [merged, revert], commits: { "12": [dependabotCommit(A)] }, checkRuns: { [MERGE]: [run()] } });
  assert.equal(classifyPull(byRevert, merged, callOf(), null, { asOf: `${UNTIL}T00:00:00Z` }).class, "F2");

  const failingMerge = record({
    pulls: [merged],
    commits: { "12": [dependabotCommit(A)] },
    checkRuns: { [MERGE]: [run({ conclusion: "failure" })] },
  });
  const result = classifyPull(failingMerge, merged, callOf(), null, { asOf: `${UNTIL}T00:00:00Z` });
  assert.equal(result.class, "F2");
  assert.match(result.detail, /failed at the merge commit/);
  assert.deepEqual(result.notes, []);
  // Still inside 7 days of the merge: the note says the revert window is open.
  assert.deepEqual(classifyPull(byRevert, merged, callOf(), null, { asOf: "2026-11-05T00:00:00Z" }).notes, ["revert window still open"]);
  const open = pull({ state: "open", created_at: `${SINCE}T09:00:00Z`, merged_at: "2026-11-10T12:00:00Z", merge_commit_sha: MERGE });
  assert.deepEqual(classifyPull(record({ pulls: [open, merged] }), open, callOf(), null, { asOf: "2026-11-12T00:00:00Z" }).notes, ["revert window still open"]);
});

test("F3 for a commit that is not Dependabot's", () => {
  const merged = pull({ state: "closed", merged_at: `${SINCE}T12:00:00Z`, closed_at: `${SINCE}T12:00:00Z`, merge_commit_sha: MERGE });
  const withPerson = record({
    pulls: [merged],
    commits: { "12": [dependabotCommit(A), personCommit(B)] },
    checkRuns: { [MERGE]: [run()] },
  });
  assert.equal(classifyPull(withPerson, merged, callOf(), null, { asOf: `${UNTIL}T00:00:00Z` }).class, "F3");
  const onlyDependabot = record({
    pulls: [merged],
    commits: { "12": [dependabotCommit(A)] },
    checkRuns: { [MERGE]: [run()] },
  });
  assert.equal(classifyPull(onlyDependabot, merged, callOf(), null, { asOf: `${UNTIL}T00:00:00Z` }).class, "agreed");
});

test("F1 for a pull request a person closed, agreed for one Dependabot closed, and F4 over an agreed one", () => {
  const closed = pull({ state: "closed", closed_at: `${SINCE}T12:00:00Z` });
  const byPerson = record({
    pulls: [closed],
    timelines: { "12": [{ event: "closed", created_at: `${SINCE}T12:00:00Z`, actor: { login: "bketelsen" }, sha: "", committer: { date: null } }] },
  });
  assert.equal(classifyPull(byPerson, closed, callOf(), null, {}).class, "F1");
  const byDependabot = record({
    pulls: [closed],
    timelines: { "12": [{ event: "closed", created_at: `${SINCE}T12:00:00Z`, actor: { login: DEPENDABOT }, sha: "", committer: { date: null } }] },
  });
  assert.equal(classifyPull(byDependabot, closed, callOf(), null, {}).class, "agreed");
  const f4 = { number: 12, reason: "the checks were green", author: "bketelsen" };
  assert.equal(classifyPull(byDependabot, closed, callOf(), f4, {}).class, "F4");
});

// ---- F4 lines -------------------------------------------------------------

test("the F4 lines of the report issue: applied, not applied, ambiguous, another author, no reason", () => {
  const classed = [
    { repo: "frostyard/core", number: 12, class: "agreed" },
    { repo: "frostyard/core", number: 13, class: "F3" },
    { repo: "frostyard/updex", number: 14, class: "agreed" },
    { repo: "frostyard/core", number: 14, class: "agreed" },
    { repo: "frostyard/updex", number: 15, class: "agreed" },
  ];
  const repos = ["frostyard/core", "frostyard/updex"];
  const issueComments = [
    { user: { login: "bketelsen" }, created_at: `${SINCE}T10:00:00Z`, body: "false: #12 the checks were green 2 minutes later" },
    { user: { login: "bketelsen" }, created_at: `${SINCE}T10:00:00Z`, body: "false: #13 the manifest check was green" },
    { user: { login: "bketelsen" }, created_at: `${SINCE}T10:00:00Z`, body: "false: #14 this names 2 repositories" },
    { user: { login: "bketelsen" }, created_at: `${SINCE}T10:00:00Z`, body: "false: frostyard/updex#15 it was green" },
    { user: { login: "someone-else" }, created_at: `${SINCE}T10:00:00Z`, body: "false: #12 a stranger may not" },
    { user: { login: "bketelsen" }, created_at: `${SINCE}T10:00:00Z`, body: "false: #12" },
  ];
  const lines = parseF4(issueComments, ["bketelsen", "frostyard-machines"], repos, classed);
  assert.equal(lines.length, 4);
  const [applied, notApplied, ambiguous, named] = lines;
  assert.equal(applied.status, "applied");
  assert.equal(applied.number, 12);
  assert.equal(applied.repo, "frostyard/core");
  assert.equal(notApplied.status, "not-applied");
  assert.match(notApplied.why, /classed F3/);
  assert.equal(ambiguous.status, "ambiguous");
  assert.deepEqual(ambiguous.repos, ["frostyard/core", "frostyard/updex"]);
  assert.equal(named.status, "applied");
  assert.equal(named.repo, "frostyard/updex");
  assert.equal(named.number, 15);
  // The default authors are the 2 logins of the brief.
  const withDefault = parseF4([{ user: { login: "frostyard-machines" }, body: "false: #12 machine line" }], undefined, repos, classed);
  assert.equal(withDefault.length, 1);
  assert.equal(withDefault[0].status, "applied");
});

// ---- Window helpers and arguments ----------------------------------------

test("--issue takes a bare number or OWNER/REPO#N, and --f4-author replaces the default", async () => {
  const { parseArgs } = await import("../scripts/dependabot-shadow-report.mjs");
  const bare = parseArgs(["--since", SINCE, "--until", UNTIL, "--issue", "225", REPO]);
  assert.deepEqual(bare.issue, { repo: REPO, number: 225 });
  const named = parseArgs(["--since", SINCE, "--until", UNTIL, "--issue", "frostyard/updex#7", REPO]);
  assert.deepEqual(named.issue, { repo: "frostyard/updex", number: 7 });
  assert.throws(() => parseArgs(["--since", SINCE, "--until", UNTIL, "--issue", "nope", REPO]), /--issue/);
  assert.deepEqual(parseArgs(["--since", SINCE, "--until", UNTIL, "--f4-author", "bketelsen", REPO]).f4Authors, ["bketelsen"]);
});

// ---- The window -----------------------------------------------------------

test("the window is UTC and inclusive: the last second of --until is in, the next day is out", () => {
  const at = (created_at) => reportOf([record({ comments: [comment({ created_at })] })]).repos[0].calls.total;
  assert.equal(at(`${UNTIL}T23:59:59Z`), 1);
  assert.equal(at("2026-11-15T00:00:00Z"), 0);
  assert.equal(at(`${SINCE}T00:00:00Z`), 1);
  assert.equal(at("2026-10-31T23:59:59Z"), 0);
  // 01:00 at +02:00 on the 24th is 23:00Z on the 23rd: the instant decides, not
  // the date in the stamp.
  const report = buildReport({
    since: SINCE,
    until: "2026-11-23",
    asOf: `${UNTIL}T00:00:00Z`,
    records: [record({ comments: [comment({ created_at: "2026-11-24T01:00:00+02:00" })] })],
  });
  assert.equal(report.repos[0].calls.total, 1);
});

test("an invalid date or a window that runs backwards is a usage error", async () => {
  assert.throws(() => windowRange("2026-02-30", SINCE), RangeError);
  assert.throws(() => windowRange("2026-1-5", SINCE), RangeError);
  assert.throws(() => windowRange(UNTIL, SINCE), RangeError);
  for (const args of [
    ["--since", "2026-02-30", "--until", UNTIL, REPO],
    ["--since", "2026-1-5", "--until", UNTIL, REPO],
    ["--since", UNTIL, "--until", SINCE, REPO],
    ["--since", SINCE, "--until", UNTIL],
  ]) {
    const result = await runCli(args);
    assert.equal(result.code, 2, `${args.join(" ")}: ${result.stderr}`);
    assert.match(result.stderr, /Usage:/);
  }
});

// ---- Missed and no metadata ----------------------------------------------

test("a missed pull request, and a pull request with no metadata that is not missed", () => {
  const missedPull = pull({
    number: 20,
    state: "closed",
    created_at: `${SINCE}T09:00:00Z`,
    merged_at: `${SINCE}T12:00:00Z`,
    closed_at: `${SINCE}T12:00:00Z`,
    merge_commit_sha: MERGE,
    head: A,
  });
  const noMetaPull = pull({ number: 21, created_at: `${SINCE}T13:00:00Z`, head: B });
  const one = record({
    pulls: [missedPull, noMetaPull],
    commits: { "20": [dependabotCommit(A)], "21": [dependabotCommit(B)] },
    checkRuns: {
      [A]: [run()],
      [B]: [run({ id: 5000, name: "pr-triage / shadow" })],
    },
    jobs: { 5000: { steps: [{ name: "Fetch the Dependabot metadata", conclusion: "failure" }] } },
    requiredChecks: { main: [{ context: "docs-gate", integration_id: 15368 }] },
  });
  const report = reportOf([one]);
  assert.deepEqual(report.missed.map((item) => item.number), [20]);
  assert.deepEqual(report.noMetadata.map((item) => item.number), [21]);
  assert.equal(report.missed[0].checks[0].result, "pass");

  // No required check on the base branch: a green pull request is not missed.
  const noChecks = reportOf([record({
    pulls: [missedPull],
    commits: { "20": [dependabotCommit(A)] },
    checkRuns: { [A]: [run()] },
  })]);
  assert.deepEqual(noChecks.missed, []);
  // A person's commit: not missed.
  const withPerson = reportOf([record({
    pulls: [missedPull],
    commits: { "20": [personCommit(A)] },
    checkRuns: { [A]: [run()] },
    requiredChecks: { main: [{ context: "docs-gate", integration_id: 15368 }] },
  })]);
  assert.deepEqual(withPerson.missed, []);
});

// ---- Levels ---------------------------------------------------------------

test("the levels table: the strictest label, none, and a lowered pull request", () => {
  const pulls = [
    pull({ number: 1, created_at: `${SINCE}T09:00:00Z`, labels: ["level:L2", "level:L1"] }),
    pull({ number: 2, created_at: `${SINCE}T09:00:00Z`, labels: ["level:L3"] }),
    pull({ number: 3, created_at: `${SINCE}T09:00:00Z`, labels: [] }),
    pull({ number: 4, created_at: `${SINCE}T09:00:00Z`, labels: ["level:L4"] }),
    // Opened before the window: not counted.
    pull({ number: 5, created_at: "2026-10-20T09:00:00Z", labels: ["level:L1"] }),
  ];
  const one = record({
    pulls,
    labelEvents: [
      // A person took level:L1 off #2, which is now L3: lowered.
      { event: "unlabeled", number: 2, label: "level:L1", actor: "bketelsen", created_at: `${SINCE}T10:00:00Z` },
      // The workflow took level:L3 off #2, which is still L3: not lowered.
      { event: "unlabeled", number: 2, label: "level:L3", actor: SHADOW_AUTHOR, created_at: `${SINCE}T10:00:00Z` },
      // A person took level:L4 off #3, which is now none: lowered.
      { event: "unlabeled", number: 3, label: "level:L4", actor: "bketelsen", created_at: `${SINCE}T10:00:00Z` },
    ],
  });
  assert.equal(levelOfPull(pulls[0]), "L1");
  assert.equal(levelOfPull(pulls[2]), "none");
  const report = reportOf([one]);
  assert.deepEqual(report.levels[0], { repo: REPO, opened: 4, L1: 1, L2: 0, L3: 1, L4: 1, none: 1, lowered: 2 });
});

// ---- Verdict and output ---------------------------------------------------

test("the verdict says too few under 10 would-have-merged calls and not at 10", () => {
  const recordWith = (count) =>
    record({
      comments: Array.from({ length: count }, (_, index) =>
        comment({
          id: index + 1,
          number: 100 + index,
          head: sha("a"),
          body: callBody({ head: sha("a") }),
        }),
      ),
      checkRuns: { [A]: [run()] },
    });
  // Every call of this record is on its own pull request, so each is classed.
  assert.equal(MIN_CALLS, 10);
  assert.equal(reportOf([recordWith(9)]).verdict.tooFew, true);
  assert.equal(reportOf([recordWith(9)]).verdict.wouldHaveMerged, 9);
  assert.equal(reportOf([recordWith(10)]).verdict.tooFew, false);
});

test("the Markdown report prints the sections in order and the report enables nothing", () => {
  const report = reportOf([record({ comments: [comment()], checkRuns: { [A]: [run()] } })]);
  const text = formatReport(report);
  assert.match(text, /^# Dependabot shadow report/m);
  assert.match(text, new RegExp(`^Window: ${SINCE} to ${UNTIL} \\(UTC, inclusive\\)$`, "m"));
  const order = ["## Verdict", "## Calls", "## Pull requests", "## Detail", "## F4 lines", "## Missed (value only)", "## No metadata (counted apart)", "## Levels"];
  let last = -1;
  for (const section of order) {
    const at = text.indexOf(section);
    assert.ok(at > last, `${section} must come after the section before it`);
    last = at;
  }
  assert.match(text, /\| Repository \| Opened \| L1 \| L2 \| L3 \| L4 \| none \| Lowered \|/);
  assert.doesNotMatch(text, /## Errors/);
  assert.match(text, /enables no auto-merge/);
});

test("requiredChecksOf keeps each required status check of a branch rule list", () => {
  assert.deepEqual(
    requiredChecksOf([
      { type: "deletion" },
      { type: "required_status_checks", parameters: { required_status_checks: [{ context: "docs-gate", integration_id: 15368 }, { context: "no-app" }] } },
    ]),
    [{ context: "docs-gate", integration_id: 15368 }, { context: "no-app", integration_id: null }],
  );
  assert.deepEqual(requiredChecksOf(null), []);
});

// ---- CLI end to end -------------------------------------------------------

test("the CLI reads the records of a file: the Markdown sections in order, exit 0", async () => {
  const input = path.join(fixtureDir, "core-window.json");
  const result = await runCli(["--input", input, "--since", SINCE, "--until", UNTIL, "--as-of", `${UNTIL}T00:00:00Z`]);
  assert.equal(result.code, 0, result.stderr);
  const order = ["## Verdict", "## Calls", "## Pull requests", "## Detail", "## F4 lines", "## Missed (value only)", "## No metadata (counted apart)", "## Levels"];
  let last = -1;
  for (const section of order) {
    const at = result.stdout.indexOf(section);
    assert.ok(at > last, `${section} must come after the section before it`);
    last = at;
  }
  // 3 calls: 2 would-have-merged (#101, #102) and 1 superseded (#103). The
  // malformed marker on #104 and the marker by a person are not calls.
  assert.match(result.stdout, /\| frostyard\/core \| 1 \| 0 \| 0 \| 2 \| 3 \|/);
  assert.match(result.stdout, /frostyard\/core#105/);
  assert.match(result.stdout, /Fetch the Dependabot metadata/);
  assert.match(result.stdout, /Would-have-merged calls: 2/);
});

test("the CLI exits 1 when a read failed, prints the report, and holds an Errors section", async () => {
  const input = path.join(fixtureDir, "core-errors.json");
  const result = await runCli(["--input", input, "--since", SINCE, "--until", UNTIL]);
  assert.equal(result.code, 1, result.stderr);
  assert.match(result.stdout, /## Errors/);
  assert.match(result.stdout, /HTTP 403/);
  assert.match(result.stdout, /## Verdict/);
});

test("the CLI prints the report object as JSON", async () => {
  const input = path.join(fixtureDir, "core-window.json");
  const result = await runCli(["--input", input, "--since", SINCE, "--until", UNTIL, "--as-of", `${UNTIL}T00:00:00Z`, "--json"]);
  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.since, SINCE);
  assert.equal(report.until, UNTIL);
  assert.equal(report.verdict.wouldHaveMerged, 2);
  assert.equal(report.verdict.tooFew, true);
  assert.equal(report.f4.applied.length, 1);
  assert.deepEqual(report.errors, []);
  assert.equal(report.levels[0].lowered, 1);
});

test("the fixture keeps 1 malformed marker and the report counts no call for it", async () => {
  const data = JSON.parse(await readFile(path.join(fixtureDir, "core-window.json"), "utf8"));
  const record = data.records[0];
  const malformed = record.comments.find((entry) => entry.id === 1004);
  assert.ok(malformed.body.startsWith("<!-- frostyard:dependabot-shadow v1"));
  assert.equal(parseCall(malformed), null);
  assert.equal(parseCall(record.comments.find((entry) => entry.id === 1005)), null);
  assert.equal(timeOf(malformed.created_at) >= RANGE.start, true);
});

test("the level label events keep the label name of the API's label object", async () => {
  const { levelLabelEvents } = await import("../scripts/dependabot-shadow-report.mjs");
  // The shape of `GET repos/{r}/issues/events`: `label` is an object, not a string.
  const events = [
    { event: "unlabeled", label: { name: "level:L1", color: "B60205" }, actor: { login: "frostyard-machines" }, issue: { number: 7 }, created_at: `${SINCE}T11:00:00Z` },
    { event: "labeled", label: { name: "level:L1", color: "B60205" }, actor: { login: SHADOW_AUTHOR }, issue: { number: 7 }, created_at: `${SINCE}T10:00:00Z` },
    { event: "unlabeled", label: { name: "ready-for-human", color: "0E8A16" }, actor: { login: SHADOW_AUTHOR }, issue: { number: 7 }, created_at: `${SINCE}T12:00:00Z` },
  ];
  assert.deepEqual(levelLabelEvents(events), [
    { event: "unlabeled", number: 7, label: "level:L1", actor: "frostyard-machines", created_at: `${SINCE}T11:00:00Z` },
  ]);
});

// ---- The push time of a committed move ------------------------------------

// A timeline where the call head has its own committed event and a later
// committed event follows it: the selection of a move that test C4 of the
// measurement describes.
const committedEvent = ({ sha: commit, date }) => ({
  event: "committed",
  created_at: date,
  actor: { login: DEPENDABOT },
  sha: commit,
  committer: { date },
});

function committedMoveRecord({ pushStart = null, callRun = run({ started_at: `${SINCE}T09:00:00Z`, completed_at: `${SINCE}T10:05:00Z` }) } = {}) {
  const checkRuns = { [A]: [callRun] };
  if (pushStart !== null) {
    checkRuns[B] = [run({ id: 7, started_at: pushStart, completed_at: `${SINCE}T11:04:00Z` })];
  }
  return record({
    checkRuns,
    timelines: {
      "12": [committedEvent({ sha: A, date: `${SINCE}T09:00:00Z` }), committedEvent({ sha: B, date: `${SINCE}T09:00:00Z` })],
    },
  });
}

test("a commit's date is not the push time: the first check run at the new SHA is", () => {
  const call = callOf();
  // The commit is dated 09:00 but its CI starts at 11:00, after the checks
  // passed at 10:05: the head did not move before they passed.
  assert.equal(classifyCall(committedMoveRecord({ pushStart: `${SINCE}T11:00:00Z` }), call, [call]), "would-have-merged");
  // CI starts at 10:02, before the pass at 10:05: superseded.
  assert.equal(classifyCall(committedMoveRecord({ pushStart: `${SINCE}T10:02:00Z` }), call, [call]), "superseded");
});

test("a moved head with no known push time is unknown when every check had passed", () => {
  const call = callOf();
  const outcome = classifyCallWithReason(committedMoveRecord({ pushStart: null }), call, [call]);
  assert.equal(outcome.class, "unknown");
  assert.equal(outcome.reason, `unknown: the head moved to ${B.slice(0, 12)}, and its push time is not known`);
  // The Detail section of the report carries the reason.
  const unproven = committedMoveRecord({ pushStart: null });
  const report = reportOf([record({ ...unproven, pulls: [pull()], comments: [comment()] })]);
  assert.match(formatReport(report), /push time is not known/);
});

test("a moved head with no known push time is superseded when a recorded check failed", () => {
  const call = callOf();
  const failing = committedMoveRecord({
    pushStart: null,
    callRun: run({ started_at: `${SINCE}T09:00:00Z`, completed_at: `${SINCE}T10:05:00Z`, conclusion: "failure" }),
  });
  assert.equal(classifyCall(failing, call, [call]), "superseded");
});

// ---- A call written before the window -------------------------------------

test("mergeCallComments keeps 1 comment for each id and orders the calls by created_at", async () => {
  const { mergeCallComments } = await import("../scripts/dependabot-shadow-report.mjs");
  const existing = [{ id: 2, created_at: `${SINCE}T12:00:00Z` }, { id: 1, created_at: `${SINCE}T10:00:00Z` }];
  const extra = [{ id: 1, created_at: `${SINCE}T10:00:00Z` }, { id: 3, created_at: `${SINCE}T09:00:00Z` }];
  assert.deepEqual(mergeCallComments(existing, extra).map((item) => item.id), [3, 1, 2]);
  // A comment without an id cannot be a duplicate: it is kept.
  assert.equal(mergeCallComments([{ created_at: CALL_AT }], [{ created_at: CALL_AT }]).length, 2);
  assert.deepEqual(mergeCallComments([], []), []);
});

test("a call from before the window keeps its pull request out of missed and out of the calls table", () => {
  const before = record({
    pulls: [pull({ number: 30, state: "closed", created_at: "2026-10-25T09:00:00Z", merged_at: `${SINCE}T12:00:00Z`, closed_at: `${SINCE}T12:00:00Z`, merge_commit_sha: MERGE, head: A })],
    comments: [comment({ id: 9, number: 30, created_at: "2026-10-26T10:00:00Z" })],
    commits: { "30": [dependabotCommit(A)] },
    checkRuns: { [A]: [run()] },
    requiredChecks: { main: [{ context: "docs-gate", integration_id: 15368 }] },
  });
  const report = reportOf([before]);
  assert.deepEqual(report.missed, []);
  assert.deepEqual(report.noMetadata, []);
  assert.equal(report.repos[0].calls.total, 0);
});

// A reader for collectRepo with no network: each route answers 1 endpoint.
function fakeReader(routes) {
  const seen = [];
  const look = (endpoint) => {
    seen.push(endpoint);
    const route = routes.find((entry) => entry.match.test(endpoint));
    if (route === undefined) throw new Error(`no route for ${endpoint}`);
    return route.value;
  };
  return {
    seen,
    async ghGet(endpoint) {
      return JSON.stringify(look(endpoint));
    },
    async pages(endpoint, { key = null } = {}) {
      const value = look(endpoint);
      const list = key === null ? value : value?.[key];
      if (!Array.isArray(list)) throw new Error(`${endpoint} is not a list`);
      return list;
    },
  };
}

test("the collector reads the own comments of a Dependabot pull request that holds no call in the window", async () => {
  const { collectRepo } = await import("../scripts/dependabot-shadow-report.mjs");
  const preWindowCall = { id: 777, user: { login: SHADOW_AUTHOR }, created_at: "2026-10-25T10:00:00Z", body: callBody() };
  const rawPull = {
    number: 20,
    title: "chore(deps): bump jq from 1.8.1 to 1.8.2",
    user: { login: DEPENDABOT },
    state: "closed",
    draft: false,
    created_at: "2026-10-25T09:00:00Z",
    closed_at: `${SINCE}T12:00:00Z`,
    merged_at: `${SINCE}T12:00:00Z`,
    merge_commit_sha: MERGE,
    head: { sha: A },
    base: { ref: "main" },
    labels: [],
    updated_at: `${SINCE}T12:00:00Z`,
  };
  const reader = fakeReader([
    { match: /\/issues\/comments\?since=/, value: [] },
    { match: /\/issues\/20\/comments$/, value: [preWindowCall] },
    { match: /\/issues\/20\/timeline$/, value: [] },
    { match: /\/pulls\/20\/commits$/, value: [{ sha: A, author: null, commit: { author: { name: DEPENDABOT } } }] },
    { match: /\/pulls\?state=all/, value: [rawPull] },
    { match: /\/check-runs\?filter=all$/, value: { total_count: 0, check_runs: [] } },
    { match: /\/status$/, value: { state: "success", statuses: [] } },
    { match: /\/issues\/events$/, value: [] },
    { match: /\/rules\/branches\/main$/, value: [] },
  ]);
  const collected = await collectRepo(REPO, RANGE, reader);
  assert.deepEqual(collected.errors, []);
  assert.deepEqual(collected.comments.map((item) => [item.id, item.number]), [[777, 20]]);
  assert.ok(reader.seen.includes(`repos/${REPO}/issues/20/comments`), "the pull request's own comments were read");
});

// ---- Class precedence -----------------------------------------------------

const mergedPull = (overrides = {}) => pull({
  number: 12,
  state: "closed",
  created_at: `${SINCE}T09:00:00Z`,
  merged_at: `${SINCE}T12:00:00Z`,
  closed_at: `${SINCE}T12:00:00Z`,
  merge_commit_sha: MERGE,
  head: A,
  ...overrides,
});

test("F2 wins over F3 when a revert and a person's commit both hold", () => {
  const revert = pull({
    number: 40,
    title: 'Revert "chore(deps): bump ajv (#12)"',
    state: "closed",
    created_at: `${SINCE}T13:00:00Z`,
    merged_at: "2026-11-03T12:00:00Z",
    closed_at: "2026-11-03T12:00:00Z",
    merge_commit_sha: sha("f"),
  });
  const one = record({
    pulls: [mergedPull(), revert],
    comments: [comment({ id: 1, number: 12 })],
    commits: { "12": [dependabotCommit(A), personCommit(B)] },
    checkRuns: { [A]: [run()], [MERGE]: [run()] },
  });
  const report = reportOf([one]);
  assert.equal(report.repos[0].pulls.F2, 1);
  assert.equal(report.repos[0].pulls.F3, 0);
  assert.equal(report.repos[0].pulls.agreed, 0);
});

test("F3 stays and the F4 line for the same pull request is not applied", () => {
  const one = record({
    pulls: [mergedPull()],
    comments: [comment({ id: 1, number: 12 })],
    commits: { "12": [dependabotCommit(A), personCommit(B)] },
    checkRuns: { [A]: [run()], [MERGE]: [run()] },
  });
  const report = reportOf([one], {
    issueComments: [{ user: { login: "bketelsen" }, created_at: `${SINCE}T13:00:00Z`, body: "false: #12 the CI was green" }],
  });
  assert.equal(report.repos[0].pulls.F3, 1);
  assert.equal(report.repos[0].pulls.F4, 0);
  assert.equal(report.f4.applied.length, 0);
  assert.equal(report.f4.notApplied.length, 1);
  assert.match(report.f4.notApplied[0].why, /classed F3/);
});

test("F1 stays and the F4 line for the same pull request is not applied", () => {
  const closed = pull({ number: 12, state: "closed", created_at: `${SINCE}T09:00:00Z`, closed_at: `${SINCE}T12:00:00Z` });
  const one = record({
    pulls: [closed],
    comments: [comment({ id: 1, number: 12 })],
    timelines: { "12": [{ event: "closed", created_at: `${SINCE}T12:00:00Z`, actor: { login: "bketelsen" }, sha: "", committer: { date: null } }] },
    checkRuns: { [A]: [run()] },
  });
  const report = reportOf([one], {
    issueComments: [{ user: { login: "bketelsen" }, created_at: `${SINCE}T13:00:00Z`, body: "false: #12 the CI was green" }],
  });
  assert.equal(report.repos[0].pulls.F1, 1);
  assert.equal(report.repos[0].pulls.F4, 0);
  assert.equal(report.f4.applied.length, 0);
  assert.match(report.f4.notApplied[0].why, /classed F1/);
});

test("the pull request class comes from the last would-have-merged call, not the first", () => {
  const one = record({
    pulls: [mergedPull({ head: B })],
    comments: [
      comment({ id: 1, number: 12, created_at: `${SINCE}T10:00:00Z`, body: callBody({ head: A }) }),
      comment({
        id: 2,
        number: 12,
        created_at: `${SINCE}T11:00:00Z`,
        body: callBody({ head: B, checks: [{ context: "docs-gate", integration_id: 15368 }, { context: "scaffold-e2e", integration_id: 15368 }] }),
      }),
    ],
    commits: { "12": [dependabotCommit(B)] },
    checkRuns: {
      [A]: [run({ started_at: `${SINCE}T10:00:00Z`, completed_at: `${SINCE}T10:05:00Z` })],
      [B]: [
        run({ id: 2, started_at: `${SINCE}T11:00:00Z`, completed_at: `${SINCE}T11:05:00Z` }),
        run({ id: 3, name: "scaffold-e2e", started_at: `${SINCE}T11:00:00Z`, completed_at: `${SINCE}T11:10:00Z` }),
      ],
      [MERGE]: [
        run({ id: 4, started_at: `${SINCE}T12:00:00Z`, completed_at: `${SINCE}T12:03:00Z` }),
        run({ id: 5, name: "scaffold-e2e", started_at: `${SINCE}T12:00:00Z`, completed_at: `${SINCE}T12:04:00Z`, conclusion: "failure" }),
      ],
    },
  });
  const report = reportOf([one]);
  assert.equal(report.repos[0].calls.wouldHaveMerged, 2);
  assert.equal(report.repos[0].pulls.F2, 1);
  assert.equal(report.repos[0].pulls.agreed, 0);
});

test("the later call by created_at is chosen even when its comment id is lower", () => {
  const one = record({
    pulls: [mergedPull({ head: B })],
    comments: [
      // The later call, with the lower id.
      comment({ id: 2, number: 12, created_at: `${SINCE}T11:00:00Z`, body: callBody({ head: B, checks: [{ context: "scaffold-e2e", integration_id: 15368 }] }) }),
      comment({ id: 9, number: 12, created_at: `${SINCE}T10:00:00Z`, body: callBody({ head: A }) }),
    ],
    commits: { "12": [dependabotCommit(B)] },
    checkRuns: {
      [A]: [run({ started_at: `${SINCE}T10:00:00Z`, completed_at: `${SINCE}T10:05:00Z` })],
      [B]: [run({ id: 2, name: "scaffold-e2e", started_at: `${SINCE}T11:00:00Z`, completed_at: `${SINCE}T11:05:00Z` })],
      [MERGE]: [
        run({ id: 3, started_at: `${SINCE}T12:00:00Z`, completed_at: `${SINCE}T12:03:00Z` }),
        run({ id: 4, name: "scaffold-e2e", started_at: `${SINCE}T12:00:00Z`, completed_at: `${SINCE}T12:04:00Z`, conclusion: "failure" }),
      ],
    },
  });
  const report = reportOf([one]);
  assert.equal(report.repos[0].calls.wouldHaveMerged, 2);
  assert.equal(report.repos[0].pulls.F2, 1);
  assert.equal(report.repos[0].pulls.agreed, 0);
});

test("the collector reads the check runs of a commit that a call's timeline shows after the call head", async () => {
  const { collectRepo } = await import("../scripts/dependabot-shadow-report.mjs");
  const rawPull = {
    number: 21,
    title: "chore(deps): bump node from 22.22 to 22.23",
    user: { login: DEPENDABOT },
    state: "open",
    draft: false,
    created_at: `${SINCE}T09:00:00Z`,
    closed_at: null,
    merged_at: null,
    merge_commit_sha: null,
    head: { sha: A },
    base: { ref: "main" },
    labels: [],
    updated_at: `${SINCE}T12:00:00Z`,
  };
  const callComment = {
    id: 900,
    issue_url: `https://api.github.com/repos/${REPO}/issues/21`,
    user: { login: SHADOW_AUTHOR },
    created_at: CALL_AT,
    body: callBody({ head: A }),
  };
  const reader = fakeReader([
    { match: /\/issues\/comments\?since=/, value: [callComment] },
    { match: /\/issues\/21\/timeline$/, value: [committedEvent({ sha: A, date: `${SINCE}T09:00:00Z` }), committedEvent({ sha: B, date: `${SINCE}T09:00:00Z` })] },
    { match: /\/pulls\/21\/commits$/, value: [] },
    { match: /\/pulls\?state=all/, value: [rawPull] },
    { match: new RegExp(`/commits/${A}/check-runs\\?filter=all$`), value: { total_count: 1, check_runs: [{ id: 1, name: "docs-gate", app: { id: 15368 }, status: "completed", conclusion: "success", started_at: `${SINCE}T09:30:00Z`, completed_at: `${SINCE}T10:05:00Z` }] } },
    { match: new RegExp(`/commits/${B}/check-runs\\?filter=all$`), value: { total_count: 0, check_runs: [] } },
    { match: /\/status$/, value: { state: "success", statuses: [] } },
    { match: /\/issues\/events$/, value: [] },
    { match: /\/rules\/branches\/main$/, value: [] },
  ]);
  const collected = await collectRepo(REPO, RANGE, reader);
  assert.deepEqual(collected.errors, []);
  assert.deepEqual(collected.checkRuns[B], []);
  assert.ok(
    reader.seen.some((endpoint) => endpoint.startsWith(`repos/${REPO}/commits/${B}/check-runs`)),
    "the check runs of the moved head were read",
  );
});
