import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  buildRow,
  countLevelLabels,
  formatTable,
  parseCallers,
  summarizeRules,
  summarizeWorkflows,
} from "../scripts/lib/required-checks-survey.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(repoRoot, "scripts/required-checks-survey.mjs");
const fixtureDir = path.join(repoRoot, "test/fixtures/required-checks-survey");

// Recorded with read-only `gh api` calls on 2026-11-08, trimmed to the fields the code reads.
const FIXTURES = {};
for (const slug of ["frostyard/updex", "frostyard/repogen", "bketelsen/pi-pocket-team"]) {
  FIXTURES[slug] = JSON.parse(await readFile(path.join(fixtureDir, `${slug.replace("/", "--")}.json`), "utf8"));
}

function rowFor(slug, overrides = {}) {
  const fixture = FIXTURES[slug];
  return buildRow({
    repo: slug,
    repository: { default_branch: fixture.default_branch },
    rules: fixture.rules,
    workflows: fixture.workflows,
    labels: fixture.labels,
    errors: {},
    ...overrides,
  });
}

const CORE_SHA = "1b02a129026329cef2b46d1fbd0465a863c1cd81";

test("frostyard/updex: checks, strict, queue, merge_group files, caller", () => {
  const row = rowFor("frostyard/updex");
  assert.equal(row.failed, false);
  assert.deepEqual(row.cells, [
    "frostyard/updex",
    "main",
    "`Build (linux, amd64)`, `Build (linux, arm64)`, `Conventional PR title`, `Docs integrity`, `E2E Tests`, `Lint`, `Race Detection`, `Security Scan`, `Unit Tests`, `Verify`",
    "yes",
    "yes",
    "ci.yml, pr-title.yml",
    `risk-paths.yml → risk-paths.yml@${CORE_SHA.slice(0, 12)}`,
    "0/4",
  ]);
});

test("frostyard/repogen: no required check", () => {
  const row = rowFor("frostyard/repogen");
  assert.deepEqual(row.cells.slice(2, 6), ["none", "-", "no", "none"]);
});

test("bketelsen/pi-pocket-team: a check, not strict", () => {
  const row = rowFor("bketelsen/pi-pocket-team");
  assert.deepEqual(row.cells.slice(2, 6), ["`Test`", "no", "no", "none"]);
});

test("summarizeRules: a context with no integration_id is marked, contexts are unique and sorted", () => {
  const summary = summarizeRules([
    { type: "required_status_checks", parameters: { strict_required_status_checks_policy: false, required_status_checks: [{ context: "b", integration_id: 15368 }, { context: "a" }] } },
    { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: "b", integration_id: 15368 }, { context: "c", integration_id: null }] } },
  ]);
  assert.deepEqual(summary, { checks: "`a` (any app), `b`, `c` (any app)", strict: "yes", queue: "no" });
});

test("summarizeRules: no rule gives none and -, a merge_queue rule gives yes", () => {
  assert.deepEqual(summarizeRules([{ type: "deletion" }]), { checks: "none", strict: "-", queue: "no" });
  assert.equal(summarizeRules([{ type: "merge_queue", parameters: {} }]).queue, "yes");
});

test("parseCallers: core callers pinned by ref, local callers, either target", () => {
  const text = [
    "jobs:",
    "  a:",
    `    uses: frostyard/core/.github/workflows/pr-triage.yml@${CORE_SHA} # core main`,
    "  b:",
    "    uses: ./.github/workflows/risk-paths.yml",
    "  c:",
    `    uses: "frostyard/core/.github/workflows/risk-paths.yml@v1.2.3"`,
    "  d:",
    `    uses: frostyard/core/.github/workflows/pr-triage.yml@${CORE_SHA}`,
  ].join("\n");
  assert.deepEqual(parseCallers("triage.yml", text), [
    `triage.yml → pr-triage.yml@${CORE_SHA.slice(0, 12)}`,
    "triage.yml → ./risk-paths.yml",
    "triage.yml → risk-paths.yml@v1.2.3",
  ]);
});

test("parseCallers: ignores comments, other actions and other core workflows", () => {
  const text = [
    `# uses: frostyard/core/.github/workflows/pr-triage.yml@${CORE_SHA}`,
    "      - uses: actions/checkout@v4",
    `    uses: frostyard/core/.github/workflows/other.yml@${CORE_SHA}`,
    "    uses: someone/else/.github/workflows/pr-triage.yml@main",
  ].join("\n");
  assert.deepEqual(parseCallers("x.yml", text), []);
  assert.deepEqual(parseCallers("x.yml", ""), []);
});

test("summarizeWorkflows: merge_group files by name; none when no file has it", () => {
  const summary = summarizeWorkflows({
    "z.yml": "on: [merge_group]\njobs: {}\n",
    "a.yml": "on:\n  merge_group:\njobs: {}\n",
    "m.yml": "on: push\njobs:\n  merge_group:\n",
  });
  assert.equal(summary.mergeGroup, "a.yml, z.yml");
  assert.equal(summary.callers, "none");
  assert.deepEqual(summarizeWorkflows({}), { mergeGroup: "none", callers: "none" });
});

test("countLevelLabels counts level:L1 to level:L4 in any case", () => {
  assert.equal(countLevelLabels([]), "0/4");
  assert.equal(countLevelLabels([{ name: "bug" }, { name: "level:l1" }, { name: "LEVEL:L4" }, { name: "level:L5" }]), "2/4");
  assert.equal(countLevelLabels(["L1", "L2", "L3", "L4"].map((n) => ({ name: `level:${n}` }))), "4/4");
});

test("buildRow: a failed read puts an error in the cells it cannot fill", () => {
  const noRepo = buildRow({ repo: "x/y", workflows: {}, labels: [], errors: { repository: "gh: Not Found (HTTP 404)" } });
  assert.equal(noRepo.failed, true);
  assert.equal(noRepo.cells[1], "error: gh: Not Found (HTTP 404)");
  assert.match(noRepo.cells[2], /^error: no default branch/);
  assert.match(noRepo.cells[6], /^error: no default branch/);
  assert.equal(noRepo.cells[7], "0/4", "the label read did not fail");

  const noRules = buildRow({ repo: "x/y", repository: { default_branch: "main" }, workflows: {}, labels: [], errors: { rules: "HTTP 403" } });
  assert.deepEqual(noRules.cells.slice(1, 8), ["main", "error: HTTP 403", "error: HTTP 403", "error: HTTP 403", "none", "none", "0/4"]);
});

test("formatTable: header, separator, rows in order, pipes escaped", () => {
  const table = formatTable([{ cells: ["a/b", "main", "`x|y`", "-", "no", "none", "none", "0/4"] }, { cells: ["c/d", "main", "none", "-", "no", "none", "none", "1/4"] }]);
  const lines = table.trimEnd().split("\n");
  assert.equal(lines.length, 4);
  assert.equal(lines[0], "| Repository | Default branch | Required checks | Strict | Queue | `merge_group` in | PR-triage caller | Level labels |");
  assert.equal(lines[1], "| --- | --- | --- | --- | --- | --- | --- | --- |");
  assert.ok(lines[2].includes("`x\\|y`"));
  assert.ok(lines[3].startsWith("| c/d |"));
});

// ---- End to end: the script with a fake gh that serves the fixtures ----------

// The fake gh answers only GET reads of the fixtures; any other call fails it.
const GH_STUB = `#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.SURVEY_TEST_CALLS, "gh " + args.join(" ") + "\\n");
const writing = args.some((arg) => ["-X", "--method", "--input", "-f", "-F", "--field", "--raw-field"].includes(arg));
if (args[0] !== "api" || writing) { console.error("gh stub: unsupported call"); process.exit(3); }
const endpoint = args.filter((arg, i) => i > 0 && !arg.startsWith("-") && args[i - 1] !== "-H").pop();
const fail = (message) => { console.error(message); process.exit(1); };
const match = /^repos\\/([^/]+\\/[^/?]+)(?:\\/(.*))?$/.exec(endpoint);
if (!match) fail("gh stub: unexpected endpoint " + endpoint);
const [, slug, rest = ""] = match;
let fixture;
try { fixture = JSON.parse(readFileSync(process.env.SURVEY_TEST_FIXTURES + "/" + slug.replace("/", "--") + ".json", "utf8")); }
catch { fail("gh: Not Found (HTTP 404)"); }
const out = (value) => process.stdout.write(typeof value === "string" ? value : JSON.stringify(value) + "\\n");
if (rest === "") out({ default_branch: fixture.default_branch });
else if (rest === "rules/branches/" + fixture.default_branch) {
  if (fixture.fail_rules) fail("gh: Resource not accessible by integration (HTTP 403)");
  out(fixture.rules);
} else if (rest === "labels?per_page=100") out(fixture.labels);
else if (rest === "contents/.github/workflows?ref=" + fixture.default_branch) {
  if (fixture.no_workflows_dir) fail("gh: Not Found (HTTP 404)");
  out(Object.keys(fixture.workflows).map((name) => ({ name, type: "file" })));
} else {
  const file = /^contents\\/\\.github\\/workflows\\/([^?]+)\\?ref=/.exec(rest);
  if (!file || !(file[1] in fixture.workflows) || !args.includes("Accept: application/vnd.github.raw")) fail("gh stub: no route for " + endpoint);
  out(fixture.workflows[file[1]]);
}
`;

async function setupGh(extraFixtures = {}) {
  const base = await mkdtemp(path.join(os.tmpdir(), "required-checks-survey-"));
  const binDir = path.join(base, "bin");
  const fixtures = path.join(base, "fixtures");
  await mkdir(binDir, { recursive: true });
  await mkdir(fixtures, { recursive: true });
  await writeFile(path.join(binDir, "gh"), GH_STUB);
  await chmod(path.join(binDir, "gh"), 0o755);
  for (const [slug, fixture] of Object.entries({ ...FIXTURES, ...extraFixtures })) {
    await writeFile(path.join(fixtures, `${slug.replace("/", "--")}.json`), JSON.stringify(fixture));
  }
  const callsLog = path.join(base, "calls.log");
  await writeFile(callsLog, "");
  return {
    callsLog,
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}`,
      SURVEY_TEST_FIXTURES: fixtures,
      SURVEY_TEST_CALLS: callsLog,
    },
  };
}

async function survey(fixture, args) {
  try {
    const { stdout, stderr } = await execFileAsync("node", [scriptPath, ...args], { env: fixture.env, cwd: repoRoot });
    return { status: 0, stdout, stderr };
  } catch (error) {
    return { status: error.code, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

const EXPECTED_TABLE = `| Repository | Default branch | Required checks | Strict | Queue | \`merge_group\` in | PR-triage caller | Level labels |
| --- | --- | --- | --- | --- | --- | --- | --- |
| frostyard/updex | main | \`Build (linux, amd64)\`, \`Build (linux, arm64)\`, \`Conventional PR title\`, \`Docs integrity\`, \`E2E Tests\`, \`Lint\`, \`Race Detection\`, \`Security Scan\`, \`Unit Tests\`, \`Verify\` | yes | yes | ci.yml, pr-title.yml | risk-paths.yml → risk-paths.yml@1b02a1290263 | 0/4 |
| frostyard/repogen | main | none | - | no | none | risk-paths.yml → risk-paths.yml@1b02a1290263 | 0/4 |
| bketelsen/pi-pocket-team | main | \`Test\` | no | no | none | risk-paths.yml → risk-paths.yml@1b02a1290263 | 0/4 |
`;

test("the script prints the whole table for the recorded repositories, using GET reads only", async () => {
  const fixture = await setupGh();
  const { status, stdout, stderr } = await survey(fixture, ["frostyard/updex", "frostyard/repogen", "bketelsen/pi-pocket-team"]);

  assert.equal(status, 0, stderr);
  assert.equal(stdout, EXPECTED_TABLE);
  const calls = (await readFile(fixture.callsLog, "utf8")).split("\n").filter(Boolean);
  assert.ok(calls.length >= 3 * 4, calls.join("\n"));
  assert.ok(calls.every((call) => call.startsWith("gh api ")), calls.join("\n"));
  assert.ok(calls.every((call) => !/ (-X|--method|--input|-f|-F)\b/.test(call)), calls.join("\n"));
});

test("a read that fails marks its cells, the table is complete, and the exit code is 1", async () => {
  const fixture = await setupGh({
    "frostyard/blocked": { ...FIXTURES["frostyard/repogen"], repo: "frostyard/blocked", fail_rules: true },
  });
  const { status, stdout, stderr } = await survey(fixture, ["frostyard/blocked", "frostyard/missing", "frostyard/repogen"]);

  assert.equal(status, 1);
  const lines = stdout.trimEnd().split("\n");
  assert.equal(lines.length, 5, stdout);
  assert.match(lines[2], /^\| frostyard\/blocked \| main \| error: gh: Resource not accessible by integration \(HTTP 403\) \| error: .* \| error: .* \| none \| risk-paths\.yml → risk-paths\.yml@1b02a1290263 \| 0\/4 \|$/);
  assert.match(lines[3], /^\| frostyard\/missing \| error: gh: Not Found \(HTTP 404\) \| error: no default branch/);
  assert.match(lines[3], /\| error: gh: Not Found \(HTTP 404\) \|$/, "the label read failed too");
  assert.match(lines[4], /^\| frostyard\/repogen \| main \| none \| - \| no \|/, "the rows after a failure are still read");
  assert.match(stderr, /2 repository row\(s\)/);
});

test("a repository with no .github/workflows directory has no workflows and is not an error", async () => {
  const fixture = await setupGh({
    "frostyard/bare": { ...FIXTURES["frostyard/repogen"], repo: "frostyard/bare", no_workflows_dir: true },
  });
  const { status, stdout } = await survey(fixture, ["frostyard/bare"]);

  assert.equal(status, 0);
  assert.match(stdout.trimEnd().split("\n")[2], /^\| frostyard\/bare \| main \| none \| - \| no \| none \| none \| 0\/4 \|$/);
});

test("no argument, an option, or a malformed slug is a usage error (exit 2)", async () => {
  const fixture = await setupGh();
  for (const args of [[], ["--json"], ["frostyard"], ["frostyard/updex/extra"]]) {
    const result = await survey(fixture, args);
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /Usage: node scripts\/required-checks-survey\.mjs OWNER\/REPO\.\.\./);
    assert.equal(result.stdout, "");
  }
  assert.equal(await readFile(fixture.callsLog, "utf8"), "", "a usage error reads nothing");
});
