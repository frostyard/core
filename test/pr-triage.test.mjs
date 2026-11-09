import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { FILE_LIST_LIMIT, createGitHubApi } from "../scripts/lib/risk-paths.mjs";
import {
  DEPENDABOT_LOGIN,
  LEVEL_LABELS,
  MANIFEST_FILES,
  MARKER_PREFIX,
  READY_LABEL,
  SHADOW_ACTIONS,
  SHADOW_MARKER_PREFIX,
  checkS1,
  checkS2,
  checkS3,
  checkS4,
  main,
  parseVersion,
  readinessComment,
  readinessMarker,
  runLevelsStep,
  runReadinessStep,
  runShadowStep,
  shadowComment,
  shadowMarker,
} from "../scripts/lib/pr-triage.mjs";
import { PR_TRIAGE_BLOCK, RISK_PATHS_BLOCK, renderBlock, syncWorkflow } from "../scripts/sync-risk-paths-workflow.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BEFORE = "a".repeat(40);
const AFTER = "b".repeat(40);
const HEAD = "c".repeat(40);

const labels = (...names) => names.map((name) => ({ name }));

function syncEvent({ prLabels = labels(READY_LABEL), before = BEFORE, after = AFTER } = {}) {
  return {
    action: "synchronize",
    before,
    after,
    pull_request: { number: 7, labels: prLabels, head: { sha: after } },
    repository: { name: "core", owner: { login: "frostyard" } },
  };
}

function labeledEvent({ label = READY_LABEL, head = HEAD } = {}) {
  return {
    action: "labeled",
    label: { name: label },
    pull_request: { number: 7, labels: labels(label), head: { sha: head } },
    repository: { name: "core", owner: { login: "frostyard" } },
  };
}

const run = (name, conclusion = "success", status = "completed") => ({ name, status, conclusion });

// A fake API that records every call. `fail` maps a method name to an Error.
function fakeApi({ comments = [], checkRuns = [], statuses = [], removed = true, fail = {} } = {}) {
  const calls = [];
  const record = (method, args, result) => {
    calls.push({ method, args });
    if (fail[method]) throw fail[method];
    return result;
  };
  const api = {
    async listIssueComments(...args) {
      return record("listIssueComments", args, comments);
    },
    async createIssueComment(...args) {
      return record("createIssueComment", args);
    },
    async removeIssueLabel(...args) {
      return record("removeIssueLabel", args, removed);
    },
    async listCheckRuns(...args) {
      return record("listCheckRuns", args, checkRuns);
    },
    async listCommitStatuses(...args) {
      return record("listCommitStatuses", args, statuses);
    },
  };
  return { api, calls };
}

async function step(api, { eventName = "pull_request_target", ev } = {}) {
  const summaries = [];
  const logs = [];
  const result = await runReadinessStep({
    api,
    eventName,
    event: ev,
    summary: (markdown) => summaries.push(markdown),
    log: (line) => logs.push(line),
  });
  return { result, summary: summaries.join(""), logs };
}

const names = (calls) => calls.map((call) => call.method);
const httpError = (message) => new Error(message);

// ---- Comments -------------------------------------------------------------

test("the marker and comment bodies are exact", () => {
  assert.equal(READY_LABEL, "ready-for-human");
  assert.equal(MARKER_PREFIX, "<!-- frostyard:readiness-revoked v1");
  assert.equal(
    readinessComment({ reason: "head-moved", before: BEFORE, after: AFTER }),
    `<!-- frostyard:readiness-revoked v1 reason=head-moved before=${BEFORE} after=${AFTER} -->\n` +
      `\`ready-for-human\` came off: the head moved from \`${"a".repeat(12)}\` to \`${"b".repeat(12)}\` after the label. ` +
      "Run the checks and the review again at the new head, then add the label again.",
  );
  assert.equal(
    readinessComment({ reason: "checks-not-green", head: HEAD }),
    `<!-- frostyard:readiness-revoked v1 reason=checks-not-green head=${HEAD} -->\n` +
      `\`ready-for-human\` came off: CI at \`${"c".repeat(12)}\` was not green when the label came. ` +
      "Add the label again when every check passes at this head.",
  );
  assert.equal(readinessMarker({ reason: "checks-not-green", head: HEAD }).split("\n").length, 1);
  assert.throws(() => readinessMarker({ reason: "other" }), /unknown readiness reason/);
});

// ---- Head moved -----------------------------------------------------------

test("synchronize with the label writes 1 marker comment, then removes the label", async () => {
  const { api, calls } = fakeApi({ comments: [{ body: "unrelated" }] });
  const { result, summary } = await step(api, { ev: syncEvent() });
  assert.deepEqual(result, { outcome: "revoked", reason: "head-moved", commented: true, removed: true });
  assert.deepEqual(names(calls), ["listIssueComments", "createIssueComment", "removeIssueLabel"]);
  assert.deepEqual(calls[0].args, ["frostyard", "core", 7]);
  assert.deepEqual(calls[1].args, [
    "frostyard",
    "core",
    7,
    readinessComment({ reason: "head-moved", before: BEFORE, after: AFTER }),
  ]);
  assert.deepEqual(calls[2].args, ["frostyard", "core", 7, "ready-for-human"]);
  assert.match(summary, /^## Readiness/);
});

test("synchronize without the label makes no API call", async () => {
  const { api, calls } = fakeApi();
  const { result, summary } = await step(api, { ev: syncEvent({ prLabels: labels("risk:high") }) });
  assert.deepEqual(result, { outcome: "no-label" });
  assert.equal(calls.length, 0);
  assert.match(summary, /no `ready-for-human` label/);
});

test("a re-run after the comment was written and the delete failed writes no second comment", async () => {
  const marker = readinessMarker({ reason: "head-moved", before: BEFORE, after: AFTER });
  const { api, calls } = fakeApi({ comments: [{ body: `${marker}\nsome text` }] });
  const { result } = await step(api, { ev: syncEvent() });
  assert.deepEqual(result, { outcome: "revoked", reason: "head-moved", commented: false, removed: true });
  assert.deepEqual(names(calls), ["listIssueComments", "removeIssueLabel"]);
});

test("a marker for another push does not stop the comment", async () => {
  const other = readinessMarker({ reason: "head-moved", before: AFTER, after: HEAD });
  const { api, calls } = fakeApi({ comments: [{ body: other }] });
  await step(api, { ev: syncEvent() });
  assert.deepEqual(names(calls), ["listIssueComments", "createIssueComment", "removeIssueLabel"]);
});

test("DELETE 404 counts as done", async () => {
  const { api } = fakeApi({ removed: false });
  const { result } = await step(api, { ev: syncEvent() });
  assert.deepEqual(result, { outcome: "revoked", reason: "head-moved", commented: true, removed: false });
});

test("an API error on DELETE fails the step", async () => {
  const { api } = fakeApi({ fail: { removeIssueLabel: httpError("GitHub API DELETE x failed: HTTP 500") } });
  await assert.rejects(step(api, { ev: syncEvent() }), /HTTP 500/);
});

test("an API error on the comment POST fails the step and keeps the label", async () => {
  const { api, calls } = fakeApi({ fail: { createIssueComment: httpError("GitHub API POST x failed: HTTP 403") } });
  await assert.rejects(step(api, { ev: syncEvent() }), /HTTP 403/);
  assert.ok(!names(calls).includes("removeIssueLabel"));
});

test("an API error on the comment list fails the step and keeps the label", async () => {
  const { api, calls } = fakeApi({ fail: { listIssueComments: httpError("boom") } });
  await assert.rejects(step(api, { ev: syncEvent() }), /boom/);
  assert.deepEqual(names(calls), ["listIssueComments"]);
});

// ---- Label added ----------------------------------------------------------

async function labeled(options) {
  const { api, calls } = fakeApi(options);
  const out = await step(api, { ev: labeledEvent() });
  return { ...out, calls };
}

test("labeled reads the check runs and the statuses of the head, not the combined state", async () => {
  const { calls } = await labeled({ checkRuns: [run("ci")] });
  assert.deepEqual(calls[0], { method: "listCheckRuns", args: ["frostyard", "core", HEAD] });
  assert.deepEqual(calls[1], { method: "listCommitStatuses", args: ["frostyard", "core", HEAD] });
});

for (const [title, checkRuns] of [
  ["a queued check", [run("ci", null, "queued")]],
  ["an in-progress check", [run("ci", null, "in_progress")]],
  ["a failed check", [run("ci", "failure")]],
  ["a cancelled check", [run("ci", "cancelled")]],
  ["a timed-out check", [run("ci", "timed_out")]],
  ["a check with action_required", [run("ci", "action_required")]],
  ["a green and a failed check", [run("lint"), run("ci", "failure")]],
]) {
  test(`labeled with ${title} revokes`, async () => {
    const { result, calls, summary } = await labeled({ checkRuns });
    assert.deepEqual(result, { outcome: "revoked", reason: "checks-not-green", commented: true, removed: true });
    assert.deepEqual(names(calls).slice(2), ["listIssueComments", "createIssueComment", "removeIssueLabel"]);
    assert.equal(calls[3].args[3], readinessComment({ reason: "checks-not-green", head: HEAD }));
    assert.match(summary, /\| Check \| Kind \| State \|/);
    assert.match(summary, /\| ci \| check run \|/);
  });
}

for (const state of ["pending", "failure", "error"]) {
  test(`labeled with a ${state} commit status revokes`, async () => {
    const { result, summary } = await labeled({
      checkRuns: [run("ci")],
      statuses: [{ context: "legacy/ci", state }],
    });
    assert.equal(result.outcome, "revoked");
    assert.equal(result.reason, "checks-not-green");
    assert.match(summary, new RegExp(`legacy/ci \\| status \\| ${state}`));
  });
}

test("labeled with only a pending status and no check run revokes", async () => {
  const { result } = await labeled({ statuses: [{ context: "legacy/ci", state: "pending" }] });
  assert.equal(result.outcome, "revoked");
});

test("labeled with every check green keeps the label", async () => {
  const { result, calls } = await labeled({
    checkRuns: [run("a", "success"), run("b", "neutral"), run("c", "skipped")],
    statuses: [{ context: "legacy/ci", state: "success" }],
  });
  assert.deepEqual(result, { outcome: "green" });
  assert.deepEqual(names(calls), ["listCheckRuns", "listCommitStatuses"]);
});

test("labeled with no check and no status does nothing", async () => {
  const { result, calls } = await labeled();
  assert.deepEqual(result, { outcome: "no-checks" });
  assert.deepEqual(names(calls), ["listCheckRuns", "listCommitStatuses"]);
});

test("the step's own pr-triage run is left out", async () => {
  const own = run("pr-triage / pr-triage", null, "in_progress");
  const { result } = await labeled({ checkRuns: [own, run("ci")] });
  assert.deepEqual(result, { outcome: "green" });
  const alone = await labeled({ checkRuns: [own] });
  assert.deepEqual(alone.result, { outcome: "no-checks" });
});

test("another check whose name only contains pr-triage still counts", async () => {
  const { result } = await labeled({ checkRuns: [run("not pr-triage", "failure")] });
  assert.equal(result.outcome, "revoked");
});

test("the summary lists at most 50 checks that are not green and escapes cells", async () => {
  const checkRuns = Array.from({ length: 60 }, (_, index) => run(`ci|${index}\n*`, "failure"));
  const { summary } = await labeled({ checkRuns });
  assert.equal(summary.split("\n").filter((line) => line.startsWith("| ci")).length, 50);
  assert.match(summary, /10 more checks are not shown here/);
  assert.match(summary, /\| ci\\\|0 \\\* \| check run \| failure \|/);
});

test("labeled with another label does nothing", async () => {
  const { api, calls } = fakeApi();
  const { result } = await step(api, { ev: labeledEvent({ label: "risk:high" }) });
  assert.deepEqual(result, { outcome: "ignored" });
  assert.equal(calls.length, 0);
});

test("any other action does nothing", async () => {
  const { api, calls } = fakeApi();
  const ev = { ...syncEvent(), action: "edited" };
  const { result } = await step(api, { ev });
  assert.deepEqual(result, { outcome: "ignored" });
  assert.equal(calls.length, 0);
});

// ---- Validation -----------------------------------------------------------

test("a wrong event name throws", async () => {
  const { api } = fakeApi();
  await assert.rejects(step(api, { eventName: "pull_request", ev: syncEvent() }), /pull_request_target/);
});

test("an invalid owner, repository or pull request number throws", async () => {
  const { api } = fakeApi();
  const bad = (change) => {
    const ev = syncEvent();
    change(ev);
    return step(api, { ev });
  };
  await assert.rejects(bad((ev) => (ev.repository.owner.login = "a/b")), /owner and name/);
  await assert.rejects(bad((ev) => (ev.repository.name = "")), /owner and name/);
  await assert.rejects(bad((ev) => (ev.pull_request.number = 0)), /pull request number/);
});

test("an invalid before, after or head SHA throws", async () => {
  const { api, calls } = fakeApi();
  await assert.rejects(step(api, { ev: syncEvent({ before: "main" }) }), /before/);
  await assert.rejects(step(api, { ev: syncEvent({ after: "B".repeat(40) }) }), /after/);
  await assert.rejects(step(api, { ev: labeledEvent({ head: "abc" }) }), /head SHA/);
  assert.equal(calls.length, 0);
});

// ---- Levels step ----------------------------------------------------------

const BASE_SHA = "d".repeat(40);

function levelsEvent(overrides = {}) {
  return {
    pull_request: { number: 7, base: { sha: BASE_SHA }, head: { sha: HEAD, ref: "feature" } },
    repository: { name: "core", owner: { login: "frostyard" } },
    ...overrides,
  };
}

const levelsList = (defaultLevel = "L3") =>
  JSON.stringify({
    schema_version: 2,
    default_level: defaultLevel,
    paths: [
      { glob: "secure/**", level: "L1", why: "boot chain" },
      { glob: ".github/workflows/**", level: "L2", why: "workflows" },
      { glob: "docs/**", level: "L4", why: "docs" },
    ],
  });

const v1List = JSON.stringify({ schema_version: 1, paths: [{ glob: "secure/**", why: "boot chain" }] });

// A fake API. `existing` lists the labels that exist in the repository, `current` the labels on the pull request.
function levelsApi({
  lists = { [BASE_SHA]: levelsList() },
  files = [],
  existing = ["risk:high", ...Object.values(LEVEL_LABELS)],
  current = [],
  removed = true,
} = {}) {
  const calls = [];
  const api = {
    async getFileAtRef(owner, repo, filePath, ref) {
      calls.push({ method: "getFileAtRef", args: [owner, repo, filePath, ref] });
      return Object.hasOwn(lists, ref) ? lists[ref] : null;
    },
    async listPullFiles(owner, repo, number) {
      calls.push({ method: "listPullFiles", args: [owner, repo, number] });
      return files;
    },
    async labelExists(owner, repo, name) {
      calls.push({ method: "labelExists", args: [owner, repo, name] });
      return existing.includes(name);
    },
    async listIssueLabels(owner, repo, number) {
      calls.push({ method: "listIssueLabels", args: [owner, repo, number] });
      return labels(...current);
    },
    async addLabels(owner, repo, number, names) {
      calls.push({ method: "addLabels", args: [owner, repo, number, names] });
    },
    async removeIssueLabel(owner, repo, number, name) {
      calls.push({ method: "removeIssueLabel", args: [owner, repo, number, name] });
      return removed;
    },
  };
  return { api, calls };
}

async function levels(api, { eventName = "pull_request_target", ev = levelsEvent() } = {}) {
  const summaries = [];
  const logs = [];
  const result = await runLevelsStep({
    api,
    eventName,
    event: ev,
    summary: (markdown) => summaries.push(markdown),
    log: (line) => logs.push(line),
  });
  return { result, summary: summaries.join(""), logs };
}

const file = (filename) => ({ filename, status: "modified" });
const callsOf = (calls, method) => calls.filter((call) => call.method === method);
const addedLabels = (calls) => callsOf(calls, "addLabels").flatMap((call) => call.args[3]);
const removedLabels = (calls) => callsOf(calls, "removeIssueLabel").map((call) => call.args[3]);

test("LEVEL_LABELS names the 4 level labels", () => {
  assert.deepEqual(LEVEL_LABELS, { L1: "level:L1", L2: "level:L2", L3: "level:L3", L4: "level:L4" });
});

test("levels with no list on base makes no label call", async () => {
  const { api, calls } = levelsApi({ lists: {} });
  const { result, summary } = await levels(api);
  assert.deepEqual(result, { outcome: "no-list" });
  assert.match(summary, /no list on base/);
  assert.deepEqual(calls.map((call) => call.method), ["getFileAtRef"]);
});

test("levels reads the list at the base SHA, never at the head SHA", async () => {
  const { api, calls } = levelsApi({
    lists: { [HEAD]: levelsList("L1"), [BASE_SHA]: levelsList("L3") },
    files: [file("src/a.go")],
  });
  const { result } = await levels(api);
  assert.equal(result.level, "L3");
  assert.deepEqual(callsOf(calls, "getFileAtRef"), [
    { method: "getFileAtRef", args: ["frostyard", "core", ".github/risk-paths.json", BASE_SHA] },
  ]);
  assert.ok(!JSON.stringify(calls).includes(HEAD));
});

test("levels ratchets up: L3 present, computed L1 adds level:L1 and risk:high, removes level:L3", async () => {
  const { api, calls } = levelsApi({ files: [file("secure/a.sh")], current: ["level:L3"] });
  const { result, summary } = await levels(api);
  assert.equal(result.outcome, "labeled");
  assert.equal(result.level, "L1");
  assert.deepEqual(callsOf(calls, "addLabels"), [
    { method: "addLabels", args: ["frostyard", "core", 7, ["level:L1", "risk:high"]] },
  ]);
  assert.deepEqual(removedLabels(calls), ["level:L3"]);
  assert.deepEqual(result.added, ["level:L1", "risk:high"]);
  assert.deepEqual(result.removed, ["level:L3"]);
  assert.match(summary, /^## Levels/);
  assert.match(summary, /computed L1/);
});

test("levels removes every level label looser than the computed level", async () => {
  const { api, calls } = levelsApi({ files: [file(".github/workflows/ci.yml")], current: ["level:L3", "level:L4", "bug"] });
  const { result } = await levels(api);
  assert.equal(result.level, "L2");
  assert.deepEqual(addedLabels(calls), ["level:L2", "risk:high"]);
  assert.deepEqual(removedLabels(calls).sort(), ["level:L3", "level:L4"]);
});

test("levels does not loosen: L1 present, computed L3 changes no level label", async () => {
  const { api, calls } = levelsApi({ files: [file("src/a.go")], current: ["level:L1", "risk:high"] });
  const { result, summary } = await levels(api);
  assert.equal(result.outcome, "kept");
  assert.equal(result.level, "L3");
  assert.deepEqual(addedLabels(calls), []);
  assert.deepEqual(removedLabels(calls), []);
  assert.match(summary, /computed L3, kept L1/);
});

test("levels with the same level label already present changes nothing", async () => {
  const { api, calls } = levelsApi({ files: [file("src/a.go")], current: ["level:L3"] });
  const { result, summary } = await levels(api);
  assert.equal(result.outcome, "kept");
  assert.equal(callsOf(calls, "addLabels").length, 0);
  assert.match(summary, /computed L3, kept L3/);
});

test("levels adds the level label when the pull request has none", async () => {
  const { api, calls } = levelsApi({ files: [file("src/a.go")], current: ["bug"] });
  const { result } = await levels(api);
  assert.equal(result.outcome, "labeled");
  assert.deepEqual(callsOf(calls, "addLabels"), [{ method: "addLabels", args: ["frostyard", "core", 7, ["level:L3"]] }]);
  assert.deepEqual(removedLabels(calls), []);
});

for (const [name, filename, level, alias] of [
  ["L1", "secure/a.sh", "L1", true],
  ["L2", ".github/workflows/ci.yml", "L2", true],
  ["L3", "src/a.go", "L3", false],
  ["L4", "docs/a.md", "L4", false],
]) {
  test(`levels ${alias ? "adds" : "does not add"} risk:high for ${name}`, async () => {
    const { api, calls } = levelsApi({ files: [file(filename)] });
    const { result } = await levels(api);
    assert.equal(result.level, level);
    assert.equal(addedLabels(calls).includes("risk:high"), alias);
    assert.ok(addedLabels(calls).includes(`level:${level}`));
  });
}

test("levels never removes risk:high", async () => {
  const scenarios = [
    levelsApi({ files: [file("src/a.go")], current: ["risk:high", "level:L1"] }),
    levelsApi({ files: [file("docs/a.md")], current: ["risk:high", "level:L2"] }),
    levelsApi({ files: [file("docs/a.md")], current: ["risk:high", "level:L4"] }),
    levelsApi({ files: [file("src/a.go")], current: ["risk:high"] }),
    levelsApi({ files: [file("src/a.go")], current: ["risk:high"], existing: ["risk:high"] }),
  ];
  for (const { api, calls } of scenarios) {
    await levels(api);
    assert.ok(!removedLabels(calls).includes("risk:high"));
  }
});

test("levels with a missing level label adds only risk:high, warns and does not fail", async () => {
  const { api, calls } = levelsApi({
    files: [file("secure/a.sh")],
    existing: ["risk:high", "level:L1", "level:L2"],
    current: ["level:L3"],
  });
  const { result, summary, logs } = await levels(api);
  assert.equal(result.outcome, "labels-missing");
  assert.deepEqual(result.missingLabels, ["level:L3", "level:L4"]);
  assert.deepEqual(addedLabels(calls), ["risk:high"]);
  assert.equal(callsOf(calls, "listIssueLabels").length, 0);
  assert.equal(callsOf(calls, "removeIssueLabel").length, 0);
  assert.match(summary, /level:L3, level:L4/);
  assert.ok(summary.includes("frostyard/core scripts/apply-triage-settings.sh frostyard/core --apply"));
  assert.ok(logs.some((line) => line.includes("warning") && line.includes("apply-triage-settings.sh frostyard/core --apply")));
});

test("levels with a missing level label and a computed L3 changes no label", async () => {
  const { api, calls } = levelsApi({ files: [file("src/a.go")], existing: ["risk:high"] });
  const { result } = await levels(api);
  assert.equal(result.outcome, "labels-missing");
  assert.equal(callsOf(calls, "addLabels").length, 0);
});

test("levels never adds a label that does not exist", async () => {
  const existing = ["risk:high", "level:L1", "level:L2", "level:L4"];
  const { api, calls } = levelsApi({ files: [file("src/a.go")], existing });
  await levels(api);
  for (const name of addedLabels(calls)) assert.ok(existing.includes(name), name);
});

test("levels with no risk:high label fails before it reads the file list", async () => {
  const { api, calls } = levelsApi({ files: [file("secure/a.sh")], existing: ["level:L1"] });
  await assert.rejects(levels(api), (error) => {
    assert.match(error.message, /label risk:high does not exist in frostyard\/core/);
    assert.match(error.message, /accountable owner must create it/);
    return true;
  });
  assert.equal(callsOf(calls, "listPullFiles").length, 0);
  assert.equal(callsOf(calls, "addLabels").length, 0);
});

test("levels fails on an invalid list and makes no label call", async () => {
  const { api, calls } = levelsApi({
    lists: { [BASE_SHA]: '{"schema_version":3,"paths":[{"glob":"/a","why":""}]}' },
    files: [file("a")],
  });
  await assert.rejects(levels(api), (error) => {
    assert.match(error.message, /schema_version/);
    assert.match(error.message, /paths\[0\]\.glob/);
    assert.match(error.message, /paths\[0\]\.why/);
    return true;
  });
  assert.deepEqual(calls.map((call) => call.method), ["getFileAtRef"]);
});

test("levels fails on a duplicate JSON key in the list", async () => {
  const { api, calls } = levelsApi({ lists: { [BASE_SHA]: '{"schema_version":1,"schema_version":1,"paths":[]}' } });
  await assert.rejects(levels(api), /duplicate key/);
  assert.deepEqual(calls.map((call) => call.method), ["getFileAtRef"]);
});

test("levels reads a v1 list: every glob is L1, the default is L3", async () => {
  const hit = levelsApi({ lists: { [BASE_SHA]: v1List }, files: [file("secure/a.sh")] });
  assert.equal((await levels(hit.api)).result.level, "L1");
  const miss = levelsApi({ lists: { [BASE_SHA]: v1List }, files: [file("src/a.go")] });
  assert.equal((await levels(miss.api)).result.level, "L3");
});

test("levels with a truncated file list gives L1", async () => {
  const files = Array.from({ length: 3000 }, (_, i) => file(`docs/f${i}.md`));
  const { api, calls } = levelsApi({ files });
  const { result, summary } = await levels(api);
  assert.equal(result.level, "L1");
  assert.equal(result.truncated, true);
  assert.deepEqual(addedLabels(calls), ["level:L1", "risk:high"]);
  assert.match(summary, /truncated/);
});

test("levels with 0 files gives the default level", async () => {
  const { api } = levelsApi({ lists: { [BASE_SHA]: levelsList("L4") }, files: [] });
  assert.equal((await levels(api)).result.level, "L4");
});

test("levels counts both names of a rename", async () => {
  const { api } = levelsApi({
    files: [{ filename: "docs/a.md", previous_filename: "secure/a.sh", status: "renamed" }],
  });
  assert.equal((await levels(api)).result.level, "L1");
});

test("levels summary has a row for each L1 or L2 path, with the floor named, and escapes cells", async () => {
  const { api } = levelsApi({
    files: [file("secure/a|b`<c>.sh"), file("src/keys/a.go"), file("docs/a.md"), file("src/a.go")],
  });
  const { summary, logs } = await levels(api);
  assert.match(summary, /\| Path \| Glob or floor \| Level \| Why \|/);
  assert.match(summary, /secure\/a\\\|b\\`&lt;c&gt;\.sh/);
  assert.match(summary, /\| src\/keys\/a\.go \| org floor \| L1 \| org floor: path word "keys" \|/);
  assert.ok(!summary.includes("docs/a.md"));
  assert.ok(!summary.includes("src/a.go"));
  for (const line of logs) assert.ok(line.startsWith("risk-paths: "), line);
});

test("levels summary shows 500 rows and the count of the rest; the log lists every path", async () => {
  const files = Array.from({ length: 503 }, (_, i) => file(`secure/f${i}.sh`));
  const { api } = levelsApi({ files });
  const { summary, logs } = await levels(api);
  assert.equal(summary.split("\n").filter((line) => line.startsWith("| secure/")).length, 500);
  assert.match(summary, /3 more paths are not shown/);
  assert.equal(logs.filter((line) => line.startsWith("risk-paths: path ")).length, 503);
  assert.ok(logs.some((line) => line.includes("secure/f502.sh")));
});

test("levels fails on a wrong event name, a base SHA that is not 40 hex characters and a bad number", async () => {
  const { api, calls } = levelsApi();
  await assert.rejects(levels(api, { eventName: "pull_request" }), /must run on pull_request_target/);
  const badSha = levelsEvent();
  badSha.pull_request.base.sha = "main";
  await assert.rejects(levels(api, { ev: badSha }), /base\.sha/);
  const badNumber = levelsEvent();
  badNumber.pull_request.number = 0;
  await assert.rejects(levels(api, { ev: badNumber }), /pull request number/);
  await assert.rejects(levels(api, { ev: levelsEvent({ repository: { name: "a b", owner: { login: "x" } } }) }), /owner and name/);
  assert.equal(calls.length, 0);
});

test("levels only calls the methods it may call", async () => {
  const allowed = new Set(["getFileAtRef", "listPullFiles", "labelExists", "listIssueLabels", "addLabels", "removeIssueLabel"]);
  const scenarios = [
    levelsApi({ lists: {} }),
    levelsApi({ files: [file("secure/a.sh")], current: ["level:L3"] }),
    levelsApi({ files: [file("src/a.go")], current: ["level:L1"] }),
    levelsApi({ files: [file("src/a.go")], existing: ["risk:high"] }),
  ];
  for (const { api, calls } of scenarios) {
    await levels(api);
    for (const call of calls) assert.ok(allowed.has(call.method), call.method);
  }
});

// ---- Shadow step ----------------------------------------------------------

const shadowUpdate = (overrides = {}) => ({
  dependencyName: "left-pad",
  updateType: "version-update:semver-patch",
  prevVersion: "1.2.3",
  newVersion: "1.2.4",
  ...overrides,
});
const updatesOf = (entries) => JSON.stringify(entries);
const PATCH_UPDATES = updatesOf([shadowUpdate()]);

const shadowList = (defaultLevel = "L3") =>
  JSON.stringify({
    schema_version: 2,
    default_level: defaultLevel,
    paths: [
      { glob: "secure/**", level: "L1", why: "boot chain" },
      { glob: ".github/workflows/**", level: "L2", why: "workflows" },
      { glob: "docs/**", level: "L4", why: "docs" },
    ],
  });

const shadowRules = () => [
  { type: "required_status_checks", parameters: { required_status_checks: [{ context: "ci" }] } },
];
const CI_CHECKS = [{ context: "ci", integration_id: null }];
const GO_FILES = [file("go.mod"), file("go.sum")];

function shadowEvent(pr = {}, overrides = {}) {
  return {
    action: "opened",
    pull_request: {
      number: 12,
      draft: false,
      user: { login: DEPENDABOT_LOGIN },
      labels: [],
      head: { sha: HEAD },
      base: { sha: BASE_SHA, ref: "main" },
      ...pr,
    },
    repository: { name: "core", owner: { login: "frostyard" } },
    ...overrides,
  };
}

// A fake API for the shadow step. It carries no label and no merge method.
function shadowApi({ files = GO_FILES, list = shadowList(), rules = shadowRules(), comments = [], fail = {} } = {}) {
  const calls = [];
  const record = (method, args, value) => {
    calls.push({ method, args });
    if (fail[method]) throw fail[method];
    return value;
  };
  const api = {
    async listPullFiles(...args) {
      return record("listPullFiles", args, files);
    },
    async getFileAtRef(...args) {
      return record("getFileAtRef", args, list);
    },
    async listBranchRules(...args) {
      return record("listBranchRules", args, rules);
    },
    async listIssueComments(...args) {
      return record("listIssueComments", args, comments);
    },
    async createIssueComment(...args) {
      return record("createIssueComment", args);
    },
  };
  return { api, calls };
}

async function shadow(api, { eventName = "pull_request_target", ev = shadowEvent(), updates = PATCH_UPDATES } = {}) {
  const summaries = [];
  const logs = [];
  const result = await runShadowStep({
    api,
    eventName,
    event: ev,
    updates,
    summary: (markdown) => summaries.push(markdown),
    log: (line) => logs.push(line),
  });
  return { result, summary: summaries.join(""), logs };
}

test("the shadow constants, marker and comment bodies are exact", () => {
  assert.equal(DEPENDABOT_LOGIN, "dependabot[bot]");
  assert.equal(SHADOW_MARKER_PREFIX, "<!-- frostyard:dependabot-shadow v1");
  assert.deepEqual(SHADOW_ACTIONS, ["opened", "synchronize", "reopened"]);
  assert.ok(MANIFEST_FILES instanceof Set);
  for (const name of ["go.mod", "go.sum", "package-lock.json", "Cargo.lock", "poetry.lock", "Gemfile.lock"]) {
    assert.ok(MANIFEST_FILES.has(name), name);
  }
  assert.equal(MANIFEST_FILES.has("requirements.txt"), false);
  const checks = [{ context: "ci", integration_id: null }, { context: "lint", integration_id: 4 }];
  assert.equal(
    shadowMarker({ head: HEAD, level: "L3", checks }),
    `<!-- frostyard:dependabot-shadow v1 head=${HEAD} level=L3 checks=` +
      '[{"context":"ci","integration_id":null},{"context":"lint","integration_id":4}] -->',
  );
  assert.equal(
    shadowComment({ head: HEAD, level: "L3", checks }),
    `<!-- frostyard:dependabot-shadow v1 head=${HEAD} level=L3 checks=` +
      '[{"context":"ci","integration_id":null},{"context":"lint","integration_id":4}] -->\n' +
      `Shadow call: auto-merge would be enabled at \`${"c".repeat(12)}\` ` +
      "(patch or minor; manifest and lock files only; level L3; 2 required checks). " +
      "Nothing is enabled. A person still merges.",
  );
});

test("the shadow step writes 1 comment when S1 to S4 all pass", async () => {
  const { api, calls } = shadowApi({ comments: [{ body: "unrelated" }] });
  const { result, summary } = await shadow(api);
  assert.deepEqual(result, { outcome: "called", level: "L3", checks: CI_CHECKS });
  assert.deepEqual(names(calls), ["listPullFiles", "getFileAtRef", "listBranchRules", "listIssueComments", "createIssueComment"]);
  assert.deepEqual(calls[0].args, ["frostyard", "core", 12]);
  assert.deepEqual(calls[1].args, ["frostyard", "core", ".github/risk-paths.json", BASE_SHA]);
  assert.deepEqual(calls[2].args, ["frostyard", "core", "main"]);
  assert.deepEqual(calls[3].args, ["frostyard", "core", 12]);
  assert.deepEqual(calls[4].args, ["frostyard", "core", 12, shadowComment({ head: HEAD, level: "L3", checks: CI_CHECKS })]);
  assert.match(summary, /^## Dependabot shadow/);
  assert.match(summary, /\| Criterion \| Result \| Detail \|/);
  assert.match(summary, /\| S1 patch or minor \| pass \|/);
  assert.match(summary, /\| S4 required checks \| pass \|/);
  assert.match(summary, /Wrote the shadow call/);
});

const ONE_FAILURE = [
  {
    id: "S1",
    title: "a major update",
    updates: updatesOf([shadowUpdate({ updateType: "version-update:semver-major" })]),
    options: { files: GO_FILES, list: shadowList(), rules: shadowRules() },
  },
  {
    id: "S2",
    title: "a file that is not a manifest or lock file",
    updates: PATCH_UPDATES,
    options: { files: [file("README.md")], list: shadowList(), rules: shadowRules() },
  },
  {
    id: "S3",
    title: "no list at the base SHA",
    updates: PATCH_UPDATES,
    options: { files: GO_FILES, list: null, rules: shadowRules() },
  },
  {
    id: "S4",
    title: "no required status check",
    updates: PATCH_UPDATES,
    options: { files: GO_FILES, list: shadowList(), rules: [] },
  },
];

for (const scenario of ONE_FAILURE) {
  test(`the shadow step fails only ${scenario.id} with ${scenario.title}: no comment, no comment list`, async () => {
    const { api, calls } = shadowApi(scenario.options);
    const { result, summary } = await shadow(api, { updates: scenario.updates });
    assert.equal(result.outcome, "no-call");
    assert.deepEqual(result.failed, [scenario.id]);
    assert.ok(!names(calls).includes("listIssueComments"), "no comment list");
    assert.ok(!names(calls).includes("createIssueComment"), "no comment");
    assert.match(summary, new RegExp(`\\| ${scenario.id} [a-z ]+\\| fail \\|`));
  });
}

test("parseVersion reads a v prefix and 2 or more dot-separated numbers", () => {
  assert.deepEqual(parseVersion("1.2.3"), [1, 2, 3]);
  assert.deepEqual(parseVersion("v1.2"), [1, 2]);
  assert.deepEqual(parseVersion("1.2.3.4"), [1, 2, 3, 4]);
  assert.deepEqual(parseVersion("0.0.1"), [0, 0, 1]);
  for (const bad of ["1", "1.2.3-rc1", "1.2.3+build", "2024-01-02", "abc123def", "", "v", "1.", ".1.2", "1..2", undefined, null, 1.2]) {
    assert.equal(parseVersion(bad), null, String(bad));
  }
});

test("checkS1 passes patch and minor updates only", () => {
  const pass = (entries) => checkS1(updatesOf(entries)).pass;
  assert.equal(pass([shadowUpdate()]), true);
  assert.equal(pass([shadowUpdate({ updateType: "version-update:semver-minor", prevVersion: "1.2.3", newVersion: "1.3.0" })]), true);
  assert.equal(pass([shadowUpdate({ prevVersion: "v1.2.3" })]), true);
  assert.equal(pass([shadowUpdate({ prevVersion: "0.3.1", newVersion: "0.3.2" })]), true);
  assert.equal(pass([shadowUpdate({ updateType: "version-update:semver-major" })]), false);
  assert.equal(pass([shadowUpdate({ prevVersion: "1.2.0", newVersion: "2.0.0", updateType: "version-update:semver-minor" })]), false);
  assert.equal(pass([shadowUpdate({ prevVersion: "0.3.1", newVersion: "0.4.0", updateType: "version-update:semver-minor" })]), false);
  assert.equal(pass([shadowUpdate({ updateType: "version-update:security" })]), false);
  assert.equal(
    pass([
      shadowUpdate(),
      shadowUpdate({ dependencyName: "other", updateType: "version-update:semver-minor", prevVersion: "1.3.0", newVersion: "1.4.0" }),
    ]),
    true,
  );
  assert.equal(
    pass([
      shadowUpdate(),
      shadowUpdate({ dependencyName: "other", updateType: "version-update:semver-major", prevVersion: "1.3.0", newVersion: "2.0.0" }),
    ]),
    false,
  );
});

test("checkS1 fails a version it cannot parse, and names the entry", () => {
  for (const version of ["1.2.3-rc1", "1.2.3+build", "2024-01-02", "abc123def", "", "1"]) {
    assert.equal(checkS1(updatesOf([shadowUpdate({ prevVersion: version })])).pass, false, version);
    assert.equal(checkS1(updatesOf([shadowUpdate({ newVersion: version })])).pass, false, version);
  }
  const missing = checkS1(updatesOf([{ dependencyName: "left-pad", updateType: "version-update:semver-patch" }]));
  assert.equal(missing.pass, false);
  assert.match(missing.detail, /left-pad/);
  const grouped = checkS1(
    updatesOf([
      shadowUpdate(),
      shadowUpdate({ dependencyName: "big-lib", updateType: "version-update:semver-major", prevVersion: "1.0.0", newVersion: "2.0.0" }),
      shadowUpdate({ dependencyName: "later", updateType: "version-update:semver-major", prevVersion: "1.0.0", newVersion: "3.0.0" }),
    ]),
  );
  assert.ok(grouped.detail.includes("big-lib"));
  assert.ok(!grouped.detail.includes("later"));
});

test("checkS1 fails on empty or malformed update metadata", () => {
  for (const text of ["", "   ", "[]", "{", '{"a":1}', "null", '"x"', "[1]"]) {
    assert.equal(checkS1(text).pass, false, text);
  }
  assert.equal(checkS1(undefined).pass, false);
  assert.equal(checkS1(null).pass, false);
});

test("checkS2 passes manifest and lock files only", () => {
  assert.equal(checkS2(GO_FILES).pass, true);
  assert.equal(checkS2([file("sub/dir/package-lock.json")]).pass, true);
  assert.equal(checkS2([file("requirements.txt")]).pass, true);
  assert.equal(checkS2([file("requirements-dev.txt")]).pass, true);
  assert.equal(checkS2([{ filename: "go.mod", previous_filename: "old/go.mod", status: "renamed" }]).pass, true);
  const readme = checkS2([file("README.md")]);
  assert.equal(readme.pass, false);
  assert.match(readme.detail, /README\.md/);
  assert.equal(checkS2([{ filename: "go.mod", previous_filename: "docs/README.md", status: "renamed" }]).pass, false);
  assert.equal(checkS2([]).pass, false);
  assert.equal(checkS2(undefined).pass, false);
  const many = Array.from({ length: FILE_LIST_LIMIT }, () => file("go.mod"));
  assert.equal(checkS2(many).pass, false);
  assert.match(checkS2(many).detail, /truncated/);
});

test("checkS3 wants the computed level at L3 or L4 and fails on any error", () => {
  const none = checkS3(null, GO_FILES);
  assert.equal(none.pass, false);
  assert.equal(none.level, null);
  assert.match(none.detail, /no list at the base SHA/);
  assert.equal(checkS3("{", GO_FILES).pass, false);
  assert.equal(checkS3('{"schema_version":3,"paths":[]}', GO_FILES).pass, false);
  const loose = checkS3(shadowList("L3"), GO_FILES);
  assert.equal(loose.pass, true);
  assert.equal(loose.level, "L3");
  assert.equal(checkS3(shadowList("L4"), GO_FILES).pass, true);
  const strict = checkS3(shadowList("L3"), [file("secure/a.sh")]);
  assert.equal(strict.pass, false);
  assert.equal(strict.level, "L1");
});

test("checkS4 collects the required checks of every rule and drops exact duplicates", () => {
  assert.equal(checkS4([]).pass, false);
  assert.equal(checkS4(undefined).pass, false);
  assert.equal(checkS4([{ type: "deletion" }]).pass, false);
  assert.equal(checkS4([{ type: "required_status_checks", parameters: {} }]).pass, false);
  const two = checkS4([
    {
      type: "required_status_checks",
      parameters: { required_status_checks: [{ context: "ci" }, { context: "lint", integration_id: 7 }] },
    },
    { type: "required_status_checks", parameters: { required_status_checks: [{ context: "ci" }, { context: "review" }] } },
  ]);
  assert.equal(two.pass, true);
  assert.deepEqual(two.checks, [
    { context: "ci", integration_id: null },
    { context: "lint", integration_id: 7 },
    { context: "review", integration_id: null },
  ]);
  assert.deepEqual(checkS4([{ type: "required_status_checks", parameters: { required_status_checks: [{ context: "<x>" }] } }]).checks, [
    { context: "<x>", integration_id: null },
  ]);
});

test("the shadow marker escapes <, > and & and stays valid JSON", () => {
  const checks = [{ context: "ci <a> & b", integration_id: null }];
  const marker = shadowMarker({ head: HEAD, level: "L3", checks });
  assert.ok(marker.endsWith(" -->"));
  assert.ok(!marker.slice(0, -4).includes("-->"));
  assert.ok(!marker.includes("<a>"));
  const json = /checks=(.*) -->$/.exec(marker)[1];
  assert.ok(json.includes("\\u003c"));
  assert.ok(json.includes("\\u003e"));
  assert.ok(json.includes("\\u0026"));
  assert.deepEqual(JSON.parse(json), checks);
});

test("the shadow step ignores the labels of the pull request", async () => {
  const { api, calls } = shadowApi();
  const { result } = await shadow(api, { ev: shadowEvent({ labels: [{ name: "level:L1" }, { name: "risk:high" }] }) });
  assert.equal(result.outcome, "called");
  assert.equal(result.level, "L3");
  assert.ok(!names(calls).some((method) => /label/i.test(method)));
});

test("the shadow step writes 1 comment for each head", async () => {
  const existing = shadowMarker({ head: HEAD, level: "L3", checks: CI_CHECKS });
  const { api, calls } = shadowApi({ comments: [{ body: "unrelated" }, { body: `older\n  ${existing}  \nmore` }] });
  const { result, summary } = await shadow(api);
  assert.deepEqual(result, { outcome: "exists", level: "L3", checks: CI_CHECKS });
  assert.deepEqual(names(calls), ["listPullFiles", "getFileAtRef", "listBranchRules", "listIssueComments"]);
  assert.match(summary, /A shadow call for this head exists/);
  const other = shadowMarker({ head: BASE_SHA, level: "L3", checks: CI_CHECKS });
  const again = shadowApi({ comments: [{ body: other }] });
  const second = await shadow(again.api);
  assert.equal(second.result.outcome, "called");
  assert.equal(callsOf(again.calls, "createIssueComment").length, 1);
});

test("the shadow step ignores a pull request that is not Dependabot's, another action and a draft", async () => {
  const cases = [
    shadowEvent({ user: { login: "frostyard-machines" } }),
    shadowEvent({ user: undefined }),
    { ...shadowEvent(), action: "edited" },
    { ...shadowEvent(), action: "labeled" },
    shadowEvent({ draft: true }),
  ];
  for (const ev of cases) {
    const { api, calls } = shadowApi();
    const { result, summary } = await shadow(api, { ev });
    assert.deepEqual(result, { outcome: "ignored" });
    assert.equal(calls.length, 0);
    assert.match(summary, /^## Dependabot shadow/);
    assert.match(summary, /No comment\./);
  }
});

test("the shadow step fails on a wrong event name, a bad owner, number, head, base SHA or base ref", async () => {
  const { api, calls } = shadowApi();
  await assert.rejects(shadow(api, { eventName: "pull_request" }), /must run on pull_request_target/);
  await assert.rejects(
    shadow(api, { ev: shadowEvent({}, { repository: { name: "a b", owner: { login: "x" } } }) }),
    /owner and name/,
  );
  await assert.rejects(shadow(api, { ev: shadowEvent({ number: 0 }) }), /pull request number/);
  await assert.rejects(shadow(api, { ev: shadowEvent({ head: { sha: "abc" } }) }), /head SHA/);
  await assert.rejects(shadow(api, { ev: shadowEvent({ head: { sha: "C".repeat(40) } }) }), /head SHA/);
  await assert.rejects(shadow(api, { ev: shadowEvent({ base: { sha: "main", ref: "main" } }) }), /base\.sha/);
  await assert.rejects(shadow(api, { ev: shadowEvent({ base: { sha: BASE_SHA, ref: "" } }) }), /base\.ref/);
  assert.equal(calls.length, 0);
});

test("an error from the file list or the rule list fails the shadow step, with no comment", async () => {
  const files = shadowApi({ fail: { listPullFiles: httpError("GitHub API GET x failed: HTTP 500") } });
  await assert.rejects(shadow(files.api), /HTTP 500/);
  assert.ok(!names(files.calls).includes("createIssueComment"));
  const rules = shadowApi({ fail: { listBranchRules: httpError("GitHub API GET y failed: HTTP 502") } });
  await assert.rejects(shadow(rules.api), /HTTP 502/);
  assert.ok(!names(rules.calls).includes("createIssueComment"));
});

test("an error while reading the list fails S3 only, and the step does not throw", async () => {
  const { api, calls } = shadowApi({ fail: { getFileAtRef: httpError("GitHub API GET z failed: HTTP 500") } });
  const { result } = await shadow(api);
  assert.equal(result.outcome, "no-call");
  assert.deepEqual(result.failed, ["S3"]);
  assert.ok(!names(calls).includes("createIssueComment"));
});

test("the shadow step calls only the 5 methods it may call and has no label or merge method", async () => {
  const allowed = new Set(["listPullFiles", "getFileAtRef", "listBranchRules", "listIssueComments", "createIssueComment"]);
  const existing = shadowMarker({ head: HEAD, level: "L3", checks: CI_CHECKS });
  const scenarios = [
    shadowApi(),
    shadowApi({ list: null }),
    shadowApi({ comments: [{ body: existing }] }),
    shadowApi({ fail: { getFileAtRef: httpError("boom") } }),
  ];
  for (const { api, calls } of scenarios) {
    await shadow(api).catch(() => undefined);
    for (const call of calls) assert.ok(allowed.has(call.method), call.method);
  }
  const { api } = shadowApi();
  for (const name of [
    "addLabels",
    "removeIssueLabel",
    "listIssueLabels",
    "labelExists",
    "approvePullRequest",
    "enableAutoMerge",
    "mergePullRequest",
  ]) {
    assert.equal(api[name], undefined, name);
  }
});

// ---- main -----------------------------------------------------------------

test("main fails on an unknown PR_TRIAGE_STEP and redacts the token", async () => {
  const saved = process.exitCode;
  const write = process.stdout.write;
  let out = "";
  process.stdout.write = (chunk) => {
    out += chunk;
    return true;
  };
  try {
    const result = await main({ GITHUB_TOKEN: "secret-token", PR_TRIAGE_STEP: "other\nsecret-token" });
    assert.equal(result, undefined);
    assert.equal(process.exitCode, 1);
  } finally {
    process.stdout.write = write;
    process.exitCode = saved;
  }
  assert.match(out, /^::error::unknown PR_TRIAGE_STEP/);
  assert.ok(!out.includes("secret-token"));
  assert.equal(out.trimEnd().split("\n").length, 1);
});

test("main fails when no step is set", async () => {
  const saved = process.exitCode;
  const write = process.stdout.write;
  process.stdout.write = () => true;
  try {
    await main({ GITHUB_TOKEN: "t" });
    assert.equal(process.exitCode, 1);
  } finally {
    process.stdout.write = write;
    process.exitCode = saved;
  }
});

test("main runs the shadow step with PR_TRIAGE_STEP=shadow and the shadow log prefix", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pr-triage-shadow-"));
  const eventPath = path.join(dir, "event.json");
  const summaryPath = path.join(dir, "summary.md");
  await writeFile(eventPath, JSON.stringify(shadowEvent({ user: { login: "frostyard-machines" } })));
  const saved = process.exitCode;
  const write = process.stdout.write;
  let out = "";
  process.stdout.write = (chunk) => {
    out += chunk;
    return true;
  };
  try {
    const result = await main({
      GITHUB_TOKEN: "t",
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_STEP_SUMMARY: summaryPath,
      GITHUB_EVENT_NAME: "pull_request_target",
      PR_TRIAGE_STEP: "shadow",
      DEPENDABOT_UPDATES: "",
    });
    assert.deepEqual(result, { outcome: "ignored" });
    assert.equal(process.exitCode, saved);
  } finally {
    process.stdout.write = write;
    process.exitCode = saved;
  }
  assert.ok(out.split("\n").some((line) => line.startsWith("pr-triage: shadow: ")), out);
  assert.match(await readFile(summaryPath, "utf8"), /## Dependabot shadow/);
});

// ---- GitHub API client: the new methods -----------------------------------

function response(status, body, headers = {}) {
  return {
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

function client(fetch) {
  return createGitHubApi({ token: "secret-token", apiUrl: "https://api.example.test", fetch });
}

test("listCheckRuns asks for the latest run of each check name and reads the check_runs of 2 pages", async () => {
  const requests = [];
  const api = client(async (url, init) => {
    requests.push({ url, init });
    if (url.endsWith("per_page=100")) {
      return response(200, { total_count: 2, check_runs: [{ name: "a" }] }, {
        link: '<https://api.example.test/repositories/1/commits/x/check-runs?per_page=100&page=2>; rel="next"',
      });
    }
    return response(200, { total_count: 2, check_runs: [{ name: "b" }] });
  });
  const runs = await api.listCheckRuns("o", "r", HEAD);
  assert.deepEqual(runs.map((item) => item.name), ["a", "b"]);
  // filter=latest is explicit: an older failed run that a re-run replaced must not revoke the label.
  assert.equal(requests[0].url, `https://api.example.test/repos/o/r/commits/${HEAD}/check-runs?filter=latest&per_page=100`);
  assert.equal(requests[0].init.method, "GET");
  assert.equal(requests[0].init.headers.Authorization, "Bearer secret-token");
});

test("listCommitStatuses reads the statuses of 2 pages from the combined status body", async () => {
  const requests = [];
  const api = client(async (url) => {
    requests.push(url);
    if (url.endsWith("per_page=100")) {
      return response(200, { state: "pending", statuses: [{ context: "a", state: "success" }] }, {
        link: '<https://api.example.test/repositories/1/commits/x/status?per_page=100&page=2>; rel="next"',
      });
    }
    return response(200, { state: "pending", statuses: [{ context: "b", state: "failure" }] });
  });
  const statuses = await api.listCommitStatuses("o", "r", HEAD);
  assert.deepEqual(statuses.map((item) => item.context), ["a", "b"]);
  assert.equal(requests[0], `https://api.example.test/repos/o/r/commits/${HEAD}/status?per_page=100`);
  const none = await client(async () => response(200, { state: "pending", statuses: [] })).listCommitStatuses("o", "r", HEAD);
  assert.deepEqual(none, []);
});

test("the paginated lists refuse a body without the array and a link to another host", async () => {
  await assert.rejects(client(async () => response(200, { check_runs: "x" })).listCheckRuns("o", "r", HEAD), /not an array/);
  await assert.rejects(client(async () => response(200, {})).listCommitStatuses("o", "r", HEAD), /not an array/);
  await assert.rejects(client(async () => response(200, {})).listIssueComments("o", "r", 1), /not an array/);
  const evil = client(async () => response(200, [], { link: '<https://evil.test/x>; rel="next"' }));
  await assert.rejects(evil.listIssueComments("o", "r", 1), /leaves the API host/);
});

test("listIssueComments reads 2 pages of comments", async () => {
  const urls = [];
  const api = client(async (url) => {
    urls.push(url);
    return url.endsWith("per_page=100")
      ? response(200, [{ body: "a" }], { link: '<https://api.example.test/repositories/1/issues/5/comments?page=2>; rel="next"' })
      : response(200, [{ body: "b" }]);
  });
  assert.deepEqual((await api.listIssueComments("o", "r", 5)).map((item) => item.body), ["a", "b"]);
  assert.equal(urls[0], "https://api.example.test/repos/o/r/issues/5/comments?per_page=100");
});

test("createIssueComment posts the body; an error throws without the token", async () => {
  const requests = [];
  let status = 201;
  const api = client(async (url, init) => {
    requests.push({ url, init });
    return response(status, {});
  });
  await api.createIssueComment("o", "r", 9, "hello");
  assert.equal(requests[0].url, "https://api.example.test/repos/o/r/issues/9/comments");
  assert.equal(requests[0].init.method, "POST");
  assert.deepEqual(JSON.parse(requests[0].init.body), { body: "hello" });
  status = 403;
  await assert.rejects(api.createIssueComment("o", "r", 9, "hello"), (error) => {
    assert.match(error.message, /POST \/repos\/o\/r\/issues\/9\/comments failed: HTTP 403/);
    assert.ok(!error.message.includes("secret-token"));
    return true;
  });
});

test("removeIssueLabel gives true on 200, false on 404 and throws on 500", async () => {
  const requests = [];
  let status = 200;
  const api = client(async (url, init) => {
    requests.push({ url, init });
    return response(status, []);
  });
  assert.equal(await api.removeIssueLabel("o", "r", 9, "ready-for-human"), true);
  assert.equal(requests[0].url, "https://api.example.test/repos/o/r/issues/9/labels/ready-for-human");
  assert.equal(requests[0].init.method, "DELETE");
  status = 404;
  assert.equal(await api.removeIssueLabel("o", "r", 9, "ready-for-human"), false);
  status = 500;
  await assert.rejects(api.removeIssueLabel("o", "r", 9, "ready-for-human"), (error) => {
    assert.match(error.message, /HTTP 500/);
    assert.ok(!error.message.includes("secret-token"));
    return true;
  });
});

test("listIssueLabels reads 2 pages of labels", async () => {
  const urls = [];
  const api = client(async (url) => {
    urls.push(url);
    return url.includes("page=2")
      ? response(200, [{ name: "level:L1" }])
      : response(200, [{ name: "bug" }], {
          link: '<https://api.example.test/repositories/1/issues/9/labels?per_page=100&page=2>; rel="next"',
        });
  });
  assert.deepEqual((await api.listIssueLabels("o", "r", 9)).map((label) => label.name), ["bug", "level:L1"]);
  assert.equal(urls[0], "https://api.example.test/repos/o/r/issues/9/labels?per_page=100");
  assert.equal(urls.length, 2);
});

test("listBranchRules reads 2 pages and encodes each part of the branch", async () => {
  const urls = [];
  const api = client(async (url) => {
    urls.push(url);
    return url.includes("page=2")
      ? response(200, [{ type: "deletion" }])
      : response(200, [{ type: "required_status_checks" }], {
          link: '<https://api.example.test/repositories/1/rules/branches/main?per_page=100&page=2>; rel="next"',
        });
  });
  const rules = await api.listBranchRules("o", "r", "release/v1");
  assert.deepEqual(rules.map((rule) => rule.type), ["required_status_checks", "deletion"]);
  assert.equal(urls[0], "https://api.example.test/repos/o/r/rules/branches/release/v1?per_page=100");
  assert.equal(urls[1], "https://api.example.test/repositories/1/rules/branches/main?per_page=100&page=2");
  const encoded = [];
  const other = client(async (url) => {
    encoded.push(url);
    return response(200, []);
  });
  assert.deepEqual(await other.listBranchRules("o", "r", "a b/c#d"), []);
  assert.equal(encoded[0], "https://api.example.test/repos/o/r/rules/branches/a%20b/c%23d?per_page=100");
  await assert.rejects(client(async () => response(200, {})).listBranchRules("o", "r", "main"), /not an array/);
});

test("a network error never carries the token", async () => {
  const api = client(async () => {
    throw new Error("connect failed");
  });
  await assert.rejects(api.listCheckRuns("o", "r", HEAD), (error) => {
    assert.ok(!error.message.includes("secret-token"));
    return true;
  });
});

// ---- Workflows ------------------------------------------------------------

const workflowPath = path.join(repoRoot, ".github/workflows/pr-triage.yml");
const callerPath = path.join(repoRoot, ".github/workflows/risk-paths-caller.yml");
const libraryPath = path.join(repoRoot, "scripts/lib/risk-paths.mjs");
const triageLibraryPath = path.join(repoRoot, "scripts/lib/pr-triage.mjs");

const STARTS = new Set([RISK_PATHS_BLOCK.startLine.trim(), PR_TRIAGE_BLOCK.startLine.trim()]);
const ENDS = new Set([RISK_PATHS_BLOCK.endLine.trim(), PR_TRIAGE_BLOCK.endLine.trim()]);

function codeLines(text) {
  return text.split("\n").filter((line) => !/^\s*#/.test(line));
}

// Every line of a workflow outside the embedded heredocs.
function outsideBlocks(text) {
  const out = [];
  let inBlock = false;
  for (const line of text.split("\n")) {
    if (STARTS.has(line.trim())) {
      out.push(line);
      inBlock = true;
    } else if (ENDS.has(line.trim())) {
      inBlock = false;
      out.push(line);
    } else if (!inBlock) out.push(line);
  }
  return out;
}

function jobPermissions(lines) {
  const start = lines.findIndex((line) => /^ {4}permissions:\s*$/.test(line));
  assert.notEqual(start, -1, "the job has a permissions block");
  const permissions = [];
  for (const line of lines.slice(start + 1)) {
    const match = /^ {6}([a-z-]+):\s*(\S+)\s*$/.exec(line);
    if (!match) break;
    permissions.push(`${match[1]}: ${match[2]}`);
  }
  return permissions.sort();
}

function embedded(workflow, block) {
  const lines = workflow.split("\n");
  const start = lines.indexOf(block.startLine);
  const end = lines.indexOf(block.endLine, start + 1);
  assert.ok(start !== -1 && end > start);
  return { start, end, body: lines.slice(start + 1, end), lines };
}

test("the workflow embeds both libraries verbatim: risk-paths without a trailer, pr-triage with it", async () => {
  const [workflow, risk, triage] = await Promise.all([
    readFile(workflowPath, "utf8"),
    readFile(libraryPath, "utf8"),
    readFile(triageLibraryPath, "utf8"),
  ]);
  assert.equal(syncWorkflow(syncWorkflow(workflow, risk, RISK_PATHS_BLOCK), triage, PR_TRIAGE_BLOCK), workflow);
  const unindent = (lines) => lines.map((line) => line.replace(/^ {10}/, "")).join("\n");
  const first = embedded(workflow, RISK_PATHS_BLOCK);
  const second = embedded(workflow, PR_TRIAGE_BLOCK);
  assert.equal(unindent(first.body), risk.replace(/\n$/, ""));
  assert.equal(unindent(second.body), `${triage.replace(/\n$/, "")}\nawait main(process.env);`);
  assert.deepEqual(first.body, renderBlock(risk, RISK_PATHS_BLOCK));
  assert.deepEqual(second.body, renderBlock(triage, PR_TRIAGE_BLOCK));
  assert.ok(!unindent(first.body).includes("await main("));
});

test("the pr-triage library imports only risk-paths.mjs and holds no expression, marker, tab or CR", async () => {
  const library = await readFile(triageLibraryPath, "utf8");
  const imports = [...library.matchAll(/^import\s[^;]*?from\s+"([^"]+)";/gms)].map((match) => match[1]);
  assert.deepEqual(imports, ["./risk-paths.mjs"]);
  assert.equal((library.match(/^\s*import\s/gm) ?? []).length, 1);
  assert.ok(!/\bimport\(/.test(library.replace(/await import\("node:fs\/promises"\)/, "")));
  assert.ok(!library.includes("${{"));
  assert.ok(!/\t|\r/.test(library));
  const lines = library.split("\n").map((line) => line.trim());
  assert.ok(!lines.includes("PR_TRIAGE_EOF") && !lines.includes("RISK_PATHS_EOF"));
});

test("the pr-triage library reads the head SHA only as an API query value", async () => {
  const library = await readFile(triageLibraryPath, "utf8");
  assert.ok(!/head\??\.ref|head_ref|refs\/pull|merge_commit_sha|\/merge\b/.test(library));
  assert.equal((library.match(/head\??\.sha/g) ?? []).length, 1);
});

test("the workflow has the input, the job, the permissions and no checkout", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const lines = outsideBlocks(workflow);
  const code = codeLines(lines.join("\n")).join("\n");
  assert.match(code, /^name: PR triage$/m);
  assert.match(
    code,
    /^on:\n {2}workflow_call:\n {4}inputs:\n {6}dependabot-shadow:\n {8}description: [^\n]+\n {8}type: boolean\n {8}default: true\n\npermissions: \{\}$/m,
  );
  assert.match(code, /^jobs:\n {2}pr-triage:\n {4}runs-on: ubuntu-latest\n {4}timeout-minutes: 5\n {4}permissions:/m);
  assert.deepEqual(jobPermissions(codeLines(lines.join("\n"))), ["contents: read", "pull-requests: write"]);
  assert.ok(!workflow.includes("actions/checkout"));
  assert.match(code, /node-version: "22"/);
  assert.equal((code.match(/^ {2}[a-z-]+:$/gm) ?? []).filter((line) => line.trim() === "pr-triage:").length, 1);
  const uses = codeLines(lines.join("\n")).filter((line) => /\buses:/.test(line));
  assert.ok(uses.length > 0);
  for (const line of uses) assert.match(line, /uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40}(\s|$)/);
  assert.equal(code.match(/GITHUB_TOKEN: \$\{\{ github\.token \}\}/g).length, 3);
  assert.ok(!/secrets\./.test(code));
});

test("the workflow writes the scripts, then runs the levels, readiness and shadow steps with exact conditions", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const text = outsideBlocks(workflow).join("\n");
  assert.ok(text.includes('mkdir -p "$RUNNER_TEMP/pr-triage"'));
  assert.ok(text.includes("      - name: Write the triage scripts\n        run: |\n"));
  assert.ok(text.indexOf("risk-paths.mjs") < text.indexOf("pr-triage/pr-triage.mjs\" <<"));
  assert.ok(text.includes("      - name: Add level labels and risk:high\n        id: levels\n"));
  assert.ok(
    text.includes(
      "        id: levels\n" +
        "        if: ${{ github.event.action != 'labeled' }}\n" +
        "        env:\n" +
        "          GITHUB_TOKEN: ${{ github.token }}\n" +
        "          PR_TRIAGE_STEP: levels\n" +
        '        run: node "$RUNNER_TEMP/pr-triage/pr-triage.mjs"\n',
    ),
  );
  assert.ok(
    text.includes(
      "        id: readiness\n" +
        "        if: ${{ !cancelled() && (github.event.action == 'synchronize' || (github.event.action == 'labeled' && github.event.label.name == 'ready-for-human')) }}\n" +
        "        env:\n" +
        "          GITHUB_TOKEN: ${{ github.token }}\n" +
        "          PR_TRIAGE_STEP: readiness\n" +
        '        run: node "$RUNNER_TEMP/pr-triage/pr-triage.mjs"\n',
    ),
  );
  const shadowIf =
    "${{ !cancelled() && inputs.dependabot-shadow && github.event.pull_request.user.login == 'dependabot[bot]' && " +
    "contains(fromJSON('[\"opened\",\"synchronize\",\"reopened\"]'), github.event.action) }}";
  assert.ok(
    text.includes(
      "      - name: Fetch the Dependabot metadata\n" +
        "        id: deps\n" +
        `        if: ${shadowIf}\n` +
        "        continue-on-error: true\n" +
        "        uses: dependabot/fetch-metadata@21025c705c08248db411dc16f3619e6b5f9ea21a # v2.5.0\n" +
        "        with:\n" +
        "          github-token: ${{ github.token }}\n" +
        "      - name: Write the Dependabot shadow call\n" +
        "        id: shadow\n" +
        `        if: ${shadowIf}\n` +
        "        env:\n" +
        "          GITHUB_TOKEN: ${{ github.token }}\n" +
        "          PR_TRIAGE_STEP: shadow\n" +
        "          DEPENDABOT_UPDATES: ${{ steps.deps.outputs.updated-dependencies-json }}\n" +
        '        run: node "$RUNNER_TEMP/pr-triage/pr-triage.mjs"\n',
    ),
  );
  assert.ok(
    text.includes("        uses: dependabot/fetch-metadata@21025c705c08248db411dc16f3619e6b5f9ea21a # v2.5.0\n"),
  );
  assert.ok(
    text.includes("        description: Run the Dependabot shadow step (docs/design/dependabot-shadow.md). " +
      "It only writes a comment; it never enables auto-merge.\n"),
  );
});

test("the workflow lines outside the heredocs never name a head or merge ref", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const text = outsideBlocks(workflow).join("\n");
  assert.ok(!/head\.sha|head\.ref|head_ref|refs\/pull|merge_commit_sha|\/merge\b/.test(text));
});

test("the caller runs only on pull_request_target with the 5 types", async () => {
  const caller = await readFile(callerPath, "utf8");
  const lines = codeLines(caller);
  const text = lines.join("\n");
  assert.match(text, /^name: PR triage caller$/m);
  assert.match(
    text,
    /^on:\n {2}pull_request_target:\n {4}types: \[opened, synchronize, reopened, edited, labeled\]\n\npermissions: \{\}$/m,
  );
  assert.ok(!text.includes("merge_group"));
  const triggers = text.split(/^on:\n/m)[1].split(/^\S/m)[0].split("\n").filter((line) => /^ {2}\S/.test(line));
  assert.deepEqual(triggers, ["  pull_request_target:"]);
  assert.match(text, /^jobs:\n {2}pr-triage:\n {4}permissions:/m);
  assert.deepEqual(jobPermissions(lines), ["contents: read", "pull-requests: write"]);
  assert.match(text, /^ {4}uses: \.\/\.github\/workflows\/pr-triage\.yml$/m);
  assert.ok(!/actions\/checkout|head\.sha|head\.ref/.test(caller));
});
