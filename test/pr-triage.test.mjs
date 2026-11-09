import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createGitHubApi } from "../scripts/lib/risk-paths.mjs";
import {
  LEVEL_LABELS,
  MARKER_PREFIX,
  READY_LABEL,
  main,
  readinessComment,
  readinessMarker,
  runLevelsStep,
  runReadinessStep,
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
  assert.equal(code.match(/GITHUB_TOKEN: \$\{\{ github\.token \}\}/g).length, 2);
  assert.ok(!/secrets\./.test(code));
});

test("the workflow writes the scripts, then runs the 2 steps with exact conditions", async () => {
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
