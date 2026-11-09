import assert from "node:assert/strict";
import test from "node:test";

import { backfillRepository, formatReport, parseArgs, recordingApi } from "../scripts/lib/pr-triage-backfill.mjs";
import { validateRiskPaths } from "../scripts/lib/risk-paths.mjs";

const BASE = "b".repeat(40);
const SHA_2 = "e".repeat(40);
const OWNER = "frostyard";
const REPO = "std";

const listText = () =>
  JSON.stringify({
    schema_version: 2,
    default_level: "L3",
    paths: [{ glob: "signing/**", level: "L1", why: "signing and keys" }],
  });

const file = (filename) => ({ filename, status: "modified" });
const callsOf = (calls, method) => calls.filter((call) => call.method === method);

// An in-memory GitHub client: the labels on each pull request, the labels of
// the repository, the list text at each base SHA, and the files of each pull
// request. Every call is recorded.
function fakeApi({
  lists = null,
  list = listText(),
  repoLabels = ["risk:high", "level:L1", "level:L2", "level:L3", "level:L4"],
  labelsOn = {},
  filesOn = {},
  failFiles = [],
  failAdd = [],
  failRemove = [],
} = {}) {
  const calls = [];
  const prLabels = new Map(Object.entries(labelsOn).map(([number, names]) => [Number(number), [...names]]));
  const files = new Map(Object.entries(filesOn).map(([number, names]) => [Number(number), names.map(file)]));
  const state = {
    async getFileAtRef(owner, repo, path, ref) {
      calls.push({ method: "getFileAtRef", args: [owner, repo, path, ref] });
      if (lists === null) return list;
      if (lists instanceof Map) return lists.has(ref) ? lists.get(ref) : null;
      return Object.hasOwn(lists, ref) ? lists[ref] : null;
    },
    async listPullFiles(owner, repo, number) {
      calls.push({ method: "listPullFiles", args: [owner, repo, number] });
      if (failFiles.includes(number)) throw new Error(`HTTP 500 for pull request ${number}`);
      return files.get(number) ?? [];
    },
    async labelExists(owner, repo, name) {
      calls.push({ method: "labelExists", args: [owner, repo, name] });
      return repoLabels.includes(name);
    },
    async listIssueLabels(owner, repo, number) {
      calls.push({ method: "listIssueLabels", args: [owner, repo, number] });
      return (prLabels.get(number) ?? []).map((name) => ({ name }));
    },
    async addLabels(owner, repo, number, names) {
      calls.push({ method: "addLabels", args: [owner, repo, number, names] });
      if (failAdd.includes(number)) throw new Error(`HTTP 500 adding labels to ${number}`);
      prLabels.set(number, [...(prLabels.get(number) ?? []), ...names]);
    },
    async removeIssueLabel(owner, repo, number, name) {
      calls.push({ method: "removeIssueLabel", args: [owner, repo, number, name] });
      if (failRemove.includes(number)) throw new Error(`HTTP 500 removing ${name} from ${number}`);
      const had = (prLabels.get(number) ?? []).includes(name);
      prLabels.set(number, (prLabels.get(number) ?? []).filter((label) => label !== name));
      return had;
    },
  };
  return { api: state, calls, labelsOf: (number) => prLabels.get(number) ?? [] };
}

const backfill = (api, pulls, apply = false) =>
  backfillRepository({ api, owner: OWNER, repo: REPO, pulls, apply });

test("the test list passes validateRiskPaths", () => {
  assert.deepEqual(validateRiskPaths(JSON.parse(listText())), { ok: true, errors: [] });
});

// ---- Dry run and apply ----------------------------------------------------

test("dry run plans add level:L3 and writes nothing", async () => {
  const { api, calls, labelsOf } = fakeApi({ filesOn: { 12: ["README.md"] } });
  const rows = await backfill(api, [{ number: 12, baseSha: BASE }]);
  assert.deepEqual(rows, [
    { number: 12, outcome: "labeled", level: "L3", added: ["level:L3"], removed: [], missingLabels: [], error: null },
  ]);
  assert.deepEqual(callsOf(calls, "addLabels"), []);
  assert.deepEqual(callsOf(calls, "removeIssueLabel"), []);
  assert.deepEqual(labelsOf(12), []);
});

test("apply adds level:L3 once, and a second dry run plans no change", async () => {
  const { api, calls, labelsOf } = fakeApi({ filesOn: { 12: ["README.md"] } });
  const pulls = [{ number: 12, baseSha: BASE }];
  const applied = await backfill(api, pulls, true);
  assert.equal(applied[0].outcome, "labeled");
  assert.deepEqual(applied[0].added, ["level:L3"]);
  const addCalls = callsOf(calls, "addLabels");
  assert.equal(addCalls.length, 1);
  assert.deepEqual(addCalls[0].args, [OWNER, REPO, 12, ["level:L3"]]);
  assert.ok(labelsOf(12).includes("level:L3"));

  const again = await backfill(api, pulls, false);
  assert.equal(again[0].outcome, "kept");
  assert.deepEqual(again[0].added, []);
  assert.deepEqual(again[0].removed, []);
  assert.equal(callsOf(calls, "addLabels").length, 1);
});

test("a stricter label than the computed level keeps the label", async () => {
  const { api, calls } = fakeApi({ filesOn: { 12: ["README.md"] }, labelsOn: { 12: ["level:L1"] } });
  const rows = await backfill(api, [{ number: 12, baseSha: BASE }]);
  assert.equal(rows[0].outcome, "kept");
  assert.equal(rows[0].level, "L3");
  assert.deepEqual(rows[0].added, []);
  assert.deepEqual(rows[0].removed, []);
  assert.deepEqual(callsOf(calls, "addLabels"), []);
  assert.deepEqual(callsOf(calls, "removeIssueLabel"), []);
});

test("a stricter computed level adds the level and risk:high and removes the looser label", async () => {
  const { api, calls } = fakeApi({ filesOn: { 12: ["signing/key.go"] }, labelsOn: { 12: ["level:L3"] } });
  const rows = await backfill(api, [{ number: 12, baseSha: BASE }], true);
  assert.deepEqual(rows[0].added, ["level:L1", "risk:high"]);
  assert.deepEqual(rows[0].removed, ["level:L3"]);
  assert.deepEqual(callsOf(calls, "addLabels").map((call) => call.args[3]), [["level:L1", "risk:high"]]);
  assert.deepEqual(callsOf(calls, "removeIssueLabel").map((call) => call.args[3]), ["level:L3"]);
});

test("a label the pull request already has is not added again", async () => {
  const { api, calls } = fakeApi({
    filesOn: { 12: ["signing/key.go"] },
    labelsOn: { 12: ["level:L1", "risk:high"] },
  });
  const rows = await backfill(api, [{ number: 12, baseSha: BASE }], true);
  assert.equal(rows[0].outcome, "kept");
  assert.equal(rows[0].level, "L1");
  assert.deepEqual(rows[0].added, []);
  assert.deepEqual(rows[0].removed, []);
  assert.deepEqual(callsOf(calls, "addLabels"), []);
  assert.deepEqual(callsOf(calls, "removeIssueLabel"), []);
});

// ---- No list, missing labels ---------------------------------------------

test("no list at the base SHA makes the row no-list with no change", async () => {
  const { api, calls } = fakeApi({ lists: new Map(), filesOn: { 12: ["README.md"] } });
  const rows = await backfill(api, [{ number: 12, baseSha: BASE }]);
  assert.deepEqual(rows, [{ number: 12, outcome: "no-list", level: null, added: [], removed: [], missingLabels: [], error: null }]);
  assert.deepEqual(callsOf(calls, "addLabels"), []);
  assert.deepEqual(callsOf(calls, "listPullFiles"), []);
});

test("a repository without a level label is labels-missing, and an L1 pull request plans risk:high only", async () => {
  const { api, calls } = fakeApi({
    repoLabels: ["risk:high", "level:L1", "level:L2", "level:L3"],
    filesOn: { 12: ["signing/key.go"] },
  });
  const rows = await backfill(api, [{ number: 12, baseSha: BASE }]);
  assert.equal(rows[0].outcome, "labels-missing");
  assert.equal(rows[0].level, "L1");
  assert.deepEqual(rows[0].added, ["risk:high"]);
  assert.deepEqual(rows[0].removed, []);
  assert.deepEqual(callsOf(calls, "addLabels"), []);
});

test("a labels-missing row keeps the missing names for the report", async () => {
  const { api } = fakeApi({ repoLabels: ["risk:high", "level:L1", "level:L2", "level:L3"], filesOn: { 12: ["README.md"] } });
  const rows = await backfill(api, [{ number: 12, baseSha: BASE }]);
  assert.equal(rows[0].outcome, "labels-missing");
  assert.deepEqual(rows[0].missingLabels, ["level:L4"]);
  assert.deepEqual(rows[0].added, []);
});

// ---- Errors and order ----------------------------------------------------

test("apply records no change when the real add fails", async () => {
  const { api, labelsOf } = fakeApi({ filesOn: { 12: ["README.md"] }, failAdd: [12] });
  const rows = await backfill(api, [{ number: 12, baseSha: BASE }], true);
  assert.equal(rows[0].outcome, "error");
  assert.match(rows[0].error, /HTTP 500 adding labels to 12/);
  assert.deepEqual(rows[0].added, []);
  assert.deepEqual(labelsOf(12), []);
  const report = formatReport([{ repository: "frostyard/std", rows, error: null }], { apply: true });
  assert.doesNotMatch(report, /change\(s\) made/);
  assert.match(report, /^1 error\(s\): see the rows above\.$/m);
});

test("apply keeps the add that worked when the removal after it fails", async () => {
  const { api, labelsOf } = fakeApi({
    filesOn: { 12: ["signing/key.go"] },
    labelsOn: { 12: ["level:L3"] },
    failRemove: [12],
  });
  const rows = await backfill(api, [{ number: 12, baseSha: BASE }], true);
  assert.equal(rows[0].outcome, "error");
  assert.deepEqual(rows[0].added, ["level:L1", "risk:high"]);
  assert.deepEqual(rows[0].removed, []);
  assert.deepEqual(labelsOf(12).sort(), ["level:L1", "level:L3", "risk:high"]);
  const report = formatReport([{ repository: "frostyard/std", rows, error: null }], { apply: true });
  assert.match(report, /\| #12 \| — \| error \| add `level:L1`, `risk:high`; HTTP 500 removing level:L3 from 12 \|/);
  assert.match(report, /^2 change\(s\) made on 1 pull request\(s\)\.$/m);
});

test("apply records no removal when the label was already gone", async () => {
  const { api } = fakeApi({ labelsOn: { 12: [] } });
  const wrapped = recordingApi(api, { apply: true });
  await wrapped.removeIssueLabel(OWNER, REPO, 12, "level:L4");
  assert.deepEqual(wrapped.removes, []);
});

test("a failing pull request makes 1 error row and the next one is still handled", async () => {
  const { api } = fakeApi({
    filesOn: { 12: ["README.md"], 13: ["README.md"] },
    labelsOn: { 12: ["level:L3"] },
    failFiles: [12],
  });
  const rows = await backfill(api, [
    { number: 13, baseSha: SHA_2 },
    { number: 12, baseSha: BASE },
  ]);
  assert.deepEqual(rows.map((row) => row.number), [12, 13]);
  assert.equal(rows[0].outcome, "error");
  assert.match(rows[0].error, /HTTP 500 for pull request 12/);
  assert.equal(rows[1].outcome, "labeled");
  assert.deepEqual(rows[1].added, ["level:L3"]);
});

test("the list is read at each pull request's base SHA", async () => {
  const { api, calls } = fakeApi({ filesOn: { 12: ["README.md"], 13: ["README.md"] } });
  await backfill(api, [
    { number: 12, baseSha: BASE },
    { number: 13, baseSha: SHA_2 },
  ]);
  assert.deepEqual(callsOf(calls, "getFileAtRef").map((call) => call.args[3]), [BASE, SHA_2]);
});

// ---- recordingApi --------------------------------------------------------

test("recordingApi records a planned change and resets it", async () => {
  const { api, calls } = fakeApi({ labelsOn: { 12: ["bug", "level:L4"] } });
  const wrapped = recordingApi(api, { apply: false });
  await wrapped.addLabels(OWNER, REPO, 12, ["level:L3", "level:L3", "bug"]);
  await wrapped.removeIssueLabel(OWNER, REPO, 12, "level:L4");
  assert.deepEqual(wrapped.adds, [{ number: 12, labels: ["level:L3"] }]);
  assert.deepEqual(wrapped.removes, [{ number: 12, name: "level:L4" }]);
  assert.equal(await wrapped.getFileAtRef(OWNER, REPO, "x", BASE), listText());
  assert.deepEqual(callsOf(calls, "addLabels"), []);
  assert.deepEqual(callsOf(calls, "removeIssueLabel"), []);
  wrapped.reset();
  assert.deepEqual(wrapped.adds, []);
  assert.deepEqual(wrapped.removes, []);
});

// ---- formatReport --------------------------------------------------------

const row = (over) => ({ number: 1, outcome: "labeled", level: "L3", added: [], removed: [], error: null, ...over });

test("formatReport ends with the no-change line when nothing is planned", () => {
  const report = formatReport(
    [{ repository: "frostyard/std", rows: [row({ outcome: "kept" })], error: null }],
    { apply: false },
  );
  assert.match(report, /^## frostyard\/std$/m);
  assert.match(report, /\| PR \| Level \| Outcome \| Change \|/);
  assert.match(report, /\| #1 \| L3 \| kept \| no change \|/);
  assert.match(report, /No change: every open pull request has its level label\.\n$/);
});

test("formatReport counts 1 change per label and ends with the dry-run line", () => {
  const report = formatReport(
    [
      {
        repository: "frostyard/std",
        rows: [
          row({ number: 2, level: "L1", added: ["level:L1", "risk:high"], removed: ["level:L3"] }),
          row({ number: 3, outcome: "kept", level: "L3" }),
          row({ number: 4, outcome: "error", level: null, error: "HTTP 500 for pull request 4" }),
        ],
        error: null,
      },
    ],
    { apply: false },
  );
  assert.match(report, /\| #2 \| L1 \| labeled \| add `level:L1`, `risk:high`; remove `level:L3` \|/);
  assert.match(report, /\| #3 \| L3 \| kept \| no change \|/);
  assert.match(report, /\| #4 \| — \| error \| HTTP 500 for pull request 4 \|/);
  assert.match(report, /^3 change\(s\) planned on 1 pull request\(s\); re-run with --apply to make them\.$/m);
});

test("formatReport counts no-list rows and errors and does not claim every label", () => {
  const report = formatReport(
    [
      {
        repository: "frostyard/core",
        rows: [row({ number: 140, outcome: "no-list", level: null }), row({ number: 141, outcome: "error", level: null, error: "boom" })],
        error: null,
      },
    ],
    { apply: false },
  );
  assert.match(report, /^1 pull request\(s\) have no list at their base SHA: no level label, as in the workflow; each gets one at its next event\.$/m);
  assert.match(report, /^1 error\(s\): see the rows above\.$/m);
  assert.match(report, /No change\.\n$/);
  assert.doesNotMatch(report, /every open pull request has its level label/);
});

test("formatReport names a repository that lacks level labels and does not claim every label", () => {
  const report = formatReport(
    [
      {
        repository: "frostyard/std",
        rows: [row({ outcome: "labels-missing", level: "L3", missingLabels: ["level:L4"] })],
        error: null,
      },
    ],
    { apply: false },
  );
  assert.match(report, /\| #1 \| L3 \| labels-missing \| no level label: the repository lacks `level:L4` \|/);
  assert.match(
    report,
    /^frostyard\/std lacks the label\(s\) `level:L4`: its pull requests get no level label\. Fix: frostyard\/core scripts\/apply-triage-settings\.sh frostyard\/std --apply$/m,
  );
  assert.match(report, /No change\.\n$/);
  assert.doesNotMatch(report, /every open pull request has its level label/);
});

test("formatReport with apply ends with the made line", () => {
  const report = formatReport(
    [{ repository: "frostyard/std", rows: [row({ added: ["level:L3"] })], error: null }],
    { apply: true },
  );
  assert.match(report, /^1 change\(s\) made on 1 pull request\(s\)\.$/m);
});

test("formatReport shows a repository error and an empty repository", () => {
  const report = formatReport(
    [
      { repository: "frostyard/std", rows: [], error: "gh: Not Found (HTTP 404)" },
      { repository: "frostyard/core", rows: [], error: null },
    ],
    { apply: false },
  );
  assert.match(report, /Could not list the open pull requests: gh: Not Found \(HTTP 404\)/);
  assert.match(report, /No open pull request\./);
});

// ---- parseArgs -----------------------------------------------------------

test("parseArgs reads --apply and a repository", () => {
  assert.deepEqual(parseArgs(["--apply", "frostyard/std"]), { repos: ["frostyard/std"], apply: true, help: false });
  assert.deepEqual(parseArgs(["frostyard/std", "frostyard/core"]), {
    repos: ["frostyard/std", "frostyard/core"],
    apply: false,
    help: false,
  });
  assert.deepEqual(parseArgs(["--help"]), { repos: [], apply: false, help: true });
});

test("parseArgs rejects no repository, a bad repository and an unknown option", () => {
  const usage = (argv) => {
    try {
      parseArgs(argv);
    } catch (error) {
      return error;
    }
    return null;
  };
  assert.equal(usage([]).name, "UsageError");
  assert.match(usage([]).message, /no repository/);
  for (const bad of ["std", "owner/", "/repo", "owner/re/po", "owner/re po", "-x/re"]) {
    assert.equal(usage([bad])?.name, "UsageError", bad);
  }
  assert.match(usage(["frostyard/std", "--frobnicate"]).message, /unknown option/);
});
