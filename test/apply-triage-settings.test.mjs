import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(repoRoot, "scripts/apply-triage-settings.sh");
const settingsScriptPath = path.join(repoRoot, "scripts/apply-repo-settings.sh");

// A fixture slug: no test here resolves a real repository.
const REPO = "frostyard/triage-fixture";
const RULESET = "frostyard: required checks";
const SHA = "0123456789abcdef0123456789abcdef01234567";

// A fake `gh` on PATH. It answers GET calls from a JSON route table
// (endpoint string -> JSON value, or {raw: text} for a raw file) and *records*
// every other call instead of making it. The method is derived as real
// `gh api` derives it: -X wins, else a body (--input, -f) makes it a POST.
// A GET with no route fails loudly (exit 4) instead of answering an empty body.
const GH_STUB = `#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
appendFileSync(process.env.TRIAGE_TEST_CALLS, "gh " + args.join(" ") + "\\n");
if (args[0] !== "api") { console.error("gh stub: unsupported subcommand " + args[0]); process.exit(3); }
let method = "", endpoint = "", filter = "", hasInput = false, hasField = false;
for (let i = 1; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "-X" || arg === "--method") method = args[++i];
  else if (arg === "--jq") filter = args[++i];
  else if (arg === "--input") { hasInput = true; i += 1; }
  else if (arg === "-f" || arg === "-F" || arg === "--field" || arg === "--raw-field") { hasField = true; i += 1; }
  else if (arg === "-H" || arg === "--header") i += 1;
  else if (!arg.startsWith("-") && !endpoint) endpoint = arg;
}
const effective = method || (hasInput || hasField ? "POST" : "GET");
if (effective !== "GET") {
  const body = hasInput ? readFileSync(0, "utf8") : "";
  appendFileSync(process.env.TRIAGE_TEST_MUTATIONS, JSON.stringify({ method: effective, endpoint, body: body ? JSON.parse(body) : null }) + "\\n");
  process.exit(0);
}
const routes = JSON.parse(readFileSync(process.env.TRIAGE_TEST_ROUTES, "utf8"));
if (!(endpoint in routes)) { console.error("gh stub: no route for GET " + endpoint); process.exit(4); }
const route = routes[endpoint];
if (route && typeof route === "object" && "raw" in route) { process.stdout.write(route.raw); process.exit(0); }
const text = JSON.stringify(route);
if (filter) {
  const result = spawnSync("jq", ["-c", filter], { input: text, encoding: "utf8" });
  process.stdout.write(result.stdout);
  process.exit(result.status);
}
process.stdout.write(text + "\\n");
`;

const CALLER_WORKFLOW = `name: PR triage
on:
  pull_request_target:
    types: [opened, synchronize, reopened, edited, labeled]
permissions: {}
jobs:
  pr-triage:
    permissions:
      contents: read
      pull-requests: write
    uses: frostyard/core/.github/workflows/pr-triage.yml@${SHA}
`;
const CI_WITH_QUEUE = `name: CI
on:
  pull_request:
  merge_group:
jobs:
  verify:
    name: Verify
    runs-on: ubuntu-latest
    steps:
      - run: make verify
`;
const CI_WITHOUT_QUEUE = CI_WITH_QUEUE.replace("  merge_group:\n", "");

const LABELS = [
  { name: "level:L1", color: "B60205", description: "Read every line" },
  { name: "level:L2", color: "D93F0B", description: "Read the diff" },
  { name: "level:L3", color: "FBCA04", description: "Skim" },
  { name: "level:L4", color: "0E8A16", description: "Title and CI" },
];

const MERGE_QUEUE_PARAMETERS = {
  merge_method: "SQUASH",
  grouping_strategy: "ALLGREEN",
  max_entries_to_build: 5,
  min_entries_to_merge: 1,
  max_entries_to_merge: 5,
  min_entries_to_merge_wait_minutes: 0,
  check_response_timeout_minutes: 60,
};

function desiredBody(checks, { queue = false } = {}) {
  return {
    name: RULESET,
    target: "branch",
    enforcement: "active",
    bypass_actors: [],
    conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
    rules: [
      {
        type: "required_status_checks",
        parameters: {
          strict_required_status_checks_policy: queue,
          do_not_enforce_on_create: false,
          required_status_checks: checks,
        },
      },
      ...(queue ? [{ type: "merge_queue", parameters: MERGE_QUEUE_PARAMETERS }] : []),
    ],
  };
}

// What GET repos/{r}/rulesets/{id} returns: the body plus fields GitHub adds.
function liveRuleset(id, body) {
  return { ...body, id, source_type: "Repository", source: REPO, current_user_can_bypass: "never", created_at: "2026-11-01T00:00:00Z" };
}

// The routes of a healthy organization-owned repository whose last merged pull
// request ran ci.yml (job "Verify", with merge_group) and the pr-triage caller.
function world({ ownerType = "Organization", rulesets = [], rulesetBodies = {}, labels = LABELS, workflows = {} } = {}) {
  const e = (suffix = "") => `repos/${REPO}${suffix}`;
  const files = { ".github/workflows/ci.yml": CI_WITH_QUEUE, ".github/workflows/risk-paths.yml": CALLER_WORKFLOW, ...workflows };
  const routes = {
    [e()]: { full_name: REPO, default_branch: "main", owner: { type: ownerType } },
    [e("/rulesets?includes_parents=false&per_page=100")]: rulesets,
    [e("/labels?per_page=100")]: labels,
    [e("/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=50")]: [
      { number: 9, merged_at: null, head: { sha: "f".repeat(40) } },
      { number: 8, merged_at: "2026-11-02T10:00:00Z", head: { sha: SHA } },
      { number: 7, merged_at: "2026-11-01T10:00:00Z", head: { sha: "e".repeat(40) } },
    ],
    [e(`/actions/runs?head_sha=${SHA}&per_page=100`)]: {
      workflow_runs: [
        { id: 101, path: ".github/workflows/ci.yml" },
        { id: 102, path: ".github/workflows/risk-paths.yml" },
      ],
    },
    [e("/actions/runs/101/jobs?per_page=100")]: { jobs: [{ name: "Verify" }] },
    [e("/actions/runs/102/jobs?per_page=100")]: { jobs: [{ name: "pr-triage / pr-triage" }] },
  };
  for (const [file, text] of Object.entries(files)) routes[e(`/contents/${file}?ref=main`)] = { raw: text };
  for (const [id, body] of Object.entries(rulesetBodies)) routes[e(`/rulesets/${id}`)] = body;
  return routes;
}

async function setup(routes) {
  const base = await mkdtemp(path.join(os.tmpdir(), "apply-triage-settings-"));
  const binDir = path.join(base, "bin");
  await mkdir(binDir, { recursive: true });
  await writeFile(path.join(binDir, "gh"), GH_STUB);
  await chmod(path.join(binDir, "gh"), 0o755);
  const callsLog = path.join(base, "calls.log");
  const mutationsLog = path.join(base, "mutations.log");
  const routesFile = path.join(base, "routes.json");
  await writeFile(callsLog, "");
  await writeFile(mutationsLog, "");
  await writeFile(routesFile, JSON.stringify(routes));
  return {
    callsLog,
    mutationsLog,
    env: {
      ...process.env,
      // The fake gh runs on the node that runs this test, whatever the shims say.
      PATH: `${binDir}${path.delimiter}${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}`,
      TRIAGE_TEST_CALLS: callsLog,
      TRIAGE_TEST_MUTATIONS: mutationsLog,
      TRIAGE_TEST_ROUTES: routesFile,
    },
  };
}

async function run(fixture, args) {
  try {
    const { stdout, stderr } = await execFileAsync("bash", [scriptPath, REPO, ...args], { env: fixture.env, cwd: repoRoot });
    return { status: 0, stdout, stderr };
  } catch (error) {
    return { status: error.code, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

async function mutations(fixture) {
  return (await readFile(fixture.mutationsLog, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

// The planned changes of a dry run or an apply: each header line and its pretty JSON body.
function plannedChanges(stdout) {
  const lines = stdout.split("\n");
  const found = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(WOULD|APPLY) {2}([A-Z]+) (\S+) \((.*)\)$/.exec(lines[index]);
    if (!match) continue;
    let end = index + 1;
    while (end < lines.length && lines[end] !== "}") end += 1;
    found.push({
      verb: match[1],
      method: match[2],
      endpoint: match[3],
      reason: match[4],
      body: JSON.parse(lines.slice(index + 1, end + 1).join("\n")),
    });
  }
  return found;
}

const ruleEndpoint = `repos/${REPO}/rulesets`;
const actionsCheck = (context) => ({ context, integration_id: 15368 });

test("a repository with no ruleset: the dry run plans a POST with the exact body", async () => {
  const fixture = await setup(world());
  const { status, stdout } = await run(fixture, ["--required-check", "Verify", "--required-check", "Lint (go, 1.25)"]);

  assert.equal(status, 0, stdout);
  const planned = plannedChanges(stdout);
  assert.equal(planned.length, 1, stdout);
  assert.equal(planned[0].verb, "WOULD");
  assert.equal(planned[0].method, "POST");
  assert.equal(planned[0].endpoint, ruleEndpoint);
  assert.deepEqual(planned[0].body, desiredBody([actionsCheck("Verify"), actionsCheck("Lint (go, 1.25)")]));
  assert.match(stdout, new RegExp(`^1 change\\(s\\) planned for ${REPO}; re-run with --apply to make them\\.$`, "m"));
  assert.doesNotMatch(stdout, /^APPLY/m);
  assert.deepEqual(await mutations(fixture), [], "a dry run must make no mutating call");
});

test("duplicate names collapse and the argument order is kept", async () => {
  const fixture = await setup(world());
  const { stdout } = await run(fixture, ["--required-check", "B", "--required-check", "A", "--required-check", "B"]);

  const [change] = plannedChanges(stdout);
  assert.deepEqual(change.body.rules[0].parameters.required_status_checks, [actionsCheck("B"), actionsCheck("A")]);
});

test("--required-check-any writes an entry with no integration_id", async () => {
  const fixture = await setup(world());
  const { stdout } = await run(fixture, ["--required-check", "Verify", "--required-check-any", "ext/check"]);

  const [change] = plannedChanges(stdout);
  const checks = change.body.rules[0].parameters.required_status_checks;
  assert.deepEqual(checks, [actionsCheck("Verify"), { context: "ext/check" }]);
  assert.equal("integration_id" in checks[1], false);
});

test("the same ruleset (checks reordered, extra GitHub fields): no change, no WOULD", async () => {
  const checks = [actionsCheck("Verify"), { context: "ext/check" }];
  const current = liveRuleset(41, desiredBody([...checks].reverse()));
  // A missing integration_id and a null one mean the same.
  current.rules[0].parameters.required_status_checks[0].integration_id = null;
  const fixture = await setup(
    world({ rulesets: [{ id: 41, name: RULESET, target: "branch", source_type: "Repository" }], rulesetBodies: { 41: current } }),
  );
  const { status, stdout } = await run(fixture, ["--required-check", "Verify", "--required-check-any", "ext/check"]);

  assert.equal(status, 0, stdout);
  assert.match(stdout, new RegExp(`^${REPO} already matches\\.$`, "m"), stdout);
  assert.doesNotMatch(stdout, /^(WOULD|APPLY)/m, stdout);
  assert.deepEqual(await mutations(fixture), []);
});

test("different rules: the dry run plans a PUT of the ruleset id", async () => {
  const current = liveRuleset(41, desiredBody([actionsCheck("Old name")]));
  const fixture = await setup(
    world({ rulesets: [{ id: 41, name: RULESET, target: "branch", source_type: "Repository" }], rulesetBodies: { 41: current } }),
  );
  const { stdout } = await run(fixture, ["--required-check", "Verify"]);

  const planned = plannedChanges(stdout);
  assert.equal(planned.length, 1, stdout);
  assert.equal(planned[0].method, "PUT");
  assert.equal(planned[0].endpoint, `${ruleEndpoint}/41`);
  assert.deepEqual(planned[0].body, desiredBody([actionsCheck("Verify")]));
  assert.deepEqual(await mutations(fixture), []);
});

test("--required-check and --required-check-any for one name differ: an integration_id change plans a PUT", async () => {
  const current = liveRuleset(41, desiredBody([{ context: "Verify" }]));
  const fixture = await setup(
    world({ rulesets: [{ id: 41, name: RULESET, target: "branch", source_type: "Repository" }], rulesetBodies: { 41: current } }),
  );
  const { stdout } = await run(fixture, ["--required-check", "Verify"]);

  assert.equal(plannedChanges(stdout)[0].method, "PUT");
});

test("missing labels: one POST for each missing label only, with the fixed colors and descriptions", async () => {
  const fixture = await setup(world({ labels: [{ name: "LEVEL:l1" }, { name: "level:L3" }, { name: "bug" }] }));
  const { status, stdout } = await run(fixture, []);

  assert.equal(status, 0, stdout);
  const planned = plannedChanges(stdout);
  assert.deepEqual(
    planned.map((change) => [change.method, change.endpoint, change.body]),
    [
      ["POST", `repos/${REPO}/labels`, { name: "level:L2", color: "D93F0B", description: "Read the diff" }],
      ["POST", `repos/${REPO}/labels`, { name: "level:L4", color: "0E8A16", description: "Title and CI" }],
    ],
  );
  assert.deepEqual(await mutations(fixture), []);
});

test("all labels present (any case): the repository already matches", async () => {
  const fixture = await setup(world({ labels: LABELS.map((label) => ({ name: label.name.toLowerCase() })) }));
  const { stdout } = await run(fixture, []);

  assert.match(stdout, new RegExp(`^${REPO} already matches\\.$`, "m"), stdout);
});

test("every label body carries the specified color and description", async () => {
  const fixture = await setup(world({ labels: [] }));
  const { stdout } = await run(fixture, []);

  assert.deepEqual(
    plannedChanges(stdout).map((change) => change.body),
    LABELS,
  );
});

test("no required name: labels only, a NOTE, and no ruleset call", async () => {
  const fixture = await setup(world({ labels: [] }));
  const { status, stdout } = await run(fixture, ["--apply"]);

  assert.equal(status, 0, stdout);
  assert.match(stdout, /^ {2}NOTE .*not touched/m, stdout);
  const calls = await readFile(fixture.callsLog, "utf8");
  assert.doesNotMatch(calls, /rulesets/, calls);
  assert.deepEqual(
    (await mutations(fixture)).map((call) => [call.method, call.endpoint]),
    LABELS.map(() => ["POST", `repos/${REPO}/labels`]),
  );
});

test("--merge-queue with no required name is a usage error", async () => {
  const fixture = await setup(world());
  const { status, stderr } = await run(fixture, ["--merge-queue"]);

  assert.equal(status, 2);
  assert.match(stderr, /--merge-queue needs at least one/);
  assert.equal(await readFile(fixture.callsLog, "utf8"), "", "a usage error reads nothing");
});

test("an unknown flag and a missing repository are usage errors", async () => {
  const fixture = await setup(world());
  assert.equal((await run(fixture, ["--nope"])).status, 2);
  const result = await execFileAsync("bash", [scriptPath], { env: fixture.env }).catch((error) => error);
  assert.equal(result.code, 2);
});

test("--merge-queue sets strict true and adds the merge_queue rule; the preflight passes with the pr-triage caller", async () => {
  const fixture = await setup(world());
  const { status, stdout } = await run(fixture, ["--required-check", "Verify", "--merge-queue"]);

  assert.equal(status, 0, stdout);
  assert.match(stdout, /^ {2}preflight: Verify -> \.github\/workflows\/ci\.yml \(merge_group: yes\)$/m, stdout);
  const [change] = plannedChanges(stdout);
  assert.deepEqual(change.body, desiredBody([actionsCheck("Verify")], { queue: true }));
  assert.equal(change.body.rules[0].parameters.strict_required_status_checks_policy, true);
  const calls = await readFile(fixture.callsLog, "utf8");
  // The latest merged pull request's head was read, and only the workflow that reports the check.
  assert.match(calls, new RegExp(`actions/runs\\?head_sha=${SHA}`));
  assert.match(calls, /contents\/\.github\/workflows\/ci\.yml\?ref=main/);
  assert.doesNotMatch(calls, /contents\/\.github\/workflows\/risk-paths\.yml/);
  assert.deepEqual(await mutations(fixture), []);
});

test("without --merge-queue the preflight is skipped and strict is false", async () => {
  const fixture = await setup(world());
  const { stdout } = await run(fixture, ["--required-check", "Verify"]);

  const [change] = plannedChanges(stdout);
  assert.equal(change.body.rules[0].parameters.strict_required_status_checks_policy, false);
  assert.equal(change.body.rules.length, 1);
  assert.doesNotMatch(stdout, /preflight/);
  assert.doesNotMatch(await readFile(fixture.callsLog, "utf8"), /actions\/runs|\/pulls/);
});

test("the preflight refuses a required job in a workflow with no merge_group, and plans nothing", async () => {
  const fixture = await setup(world({ workflows: { ".github/workflows/ci.yml": CI_WITHOUT_QUEUE } }));
  const { status, stdout, stderr } = await run(fixture, ["--required-check", "Verify", "--merge-queue", "--apply"]);

  assert.equal(status, 1);
  assert.match(stderr, /Verify/);
  assert.match(stderr, /\.github\/workflows\/ci\.yml/);
  assert.match(stderr, /no merge_group trigger/);
  assert.doesNotMatch(stdout, /^(WOULD|APPLY)/m, stdout);
  assert.deepEqual(await mutations(fixture), []);
  assert.doesNotMatch(await readFile(fixture.callsLog, "utf8"), /rulesets|labels/, "nothing after the refusal is read");
});

test("the preflight refuses a required name that no job reports", async () => {
  const fixture = await setup(world());
  const { status, stderr } = await run(fixture, ["--required-check", "Verify", "--required-check", "Nonexistent job", "--merge-queue"]);

  assert.equal(status, 1);
  assert.match(stderr, /"Nonexistent job" matches no job/);
});

test("the preflight refuses a --required-check-any name that no Actions job reports", async () => {
  const fixture = await setup(world());
  const { status, stderr } = await run(fixture, ["--required-check", "Verify", "--required-check-any", "ext/check", "--merge-queue"]);

  assert.equal(status, 1);
  assert.match(stderr, /"ext\/check" matches no job/);
});

test("the preflight refuses a repository with no merged pull request", async () => {
  const routes = world();
  routes[`repos/${REPO}/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=50`] = [{ number: 9, merged_at: null, head: { sha: SHA } }];
  const fixture = await setup(routes);
  const { status, stderr } = await run(fixture, ["--required-check", "Verify", "--merge-queue"]);

  assert.equal(status, 1);
  assert.match(stderr, /no merged pull request/);
});

test("a user-owned repository with --merge-queue is refused before anything else is read", async () => {
  const fixture = await setup(world({ ownerType: "User" }));
  const { status, stdout, stderr } = await run(fixture, ["--required-check", "Verify", "--merge-queue", "--apply"]);

  assert.equal(status, 1);
  assert.match(stderr, /owned by a User account; a merge queue needs an organization-owned repository/);
  assert.doesNotMatch(stdout, /^(WOULD|APPLY)/m, stdout);
  assert.deepEqual(await mutations(fixture), []);
  assert.doesNotMatch(await readFile(fixture.callsLog, "utf8"), /pulls|rulesets|labels/);
});

test("a user-owned repository without --merge-queue is fine", async () => {
  const fixture = await setup(world({ ownerType: "User" }));
  const { status } = await run(fixture, ["--required-check", "Verify"]);

  assert.equal(status, 0);
});

test("--apply makes exactly the expected mutations, in order", async () => {
  const fixture = await setup(world({ labels: [{ name: "level:L2" }] }));
  const { status, stdout } = await run(fixture, ["--required-check", "Verify", "--merge-queue", "--apply"]);

  assert.equal(status, 0, stdout);
  assert.match(stdout, /^APPLY {2}POST repos\/frostyard\/triage-fixture\/rulesets \(/m, stdout);
  assert.doesNotMatch(stdout, /^WOULD/m, stdout);
  assert.match(stdout, new RegExp(`^4 change\\(s\\) applied to ${REPO}\\.$`, "m"), stdout);
  const done = await mutations(fixture);
  assert.deepEqual(
    done.map((call) => [call.method, call.endpoint]),
    [
      ["POST", ruleEndpoint],
      ["POST", `repos/${REPO}/labels`],
      ["POST", `repos/${REPO}/labels`],
      ["POST", `repos/${REPO}/labels`],
    ],
  );
  assert.deepEqual(done[0].body, desiredBody([actionsCheck("Verify")], { queue: true }));
  assert.deepEqual(
    done.slice(1).map((call) => call.body.name),
    ["level:L1", "level:L3", "level:L4"],
  );
});

test("--apply repairs a drifted ruleset with one PUT", async () => {
  const current = liveRuleset(41, desiredBody([actionsCheck("Verify")]));
  const fixture = await setup(
    world({ rulesets: [{ id: 41, name: RULESET, target: "branch", source_type: "Repository" }], rulesetBodies: { 41: current } }),
  );
  const { status } = await run(fixture, ["--required-check", "Verify", "--merge-queue", "--apply"]);

  assert.equal(status, 0);
  const done = await mutations(fixture);
  assert.equal(done.length, 1);
  assert.equal(done[0].method, "PUT");
  assert.equal(done[0].endpoint, `${ruleEndpoint}/41`);
  assert.deepEqual(done[0].body, desiredBody([actionsCheck("Verify")], { queue: true }));
});

test("another ruleset (another name, an organization ruleset, another target) is never changed or deleted", async () => {
  const fixture = await setup(
    world({
      rulesets: [
        { id: 7, name: "frostyard: default branch", target: "branch", source_type: "Repository" },
        { id: 8, name: RULESET, target: "branch", source_type: "Organization" },
        { id: 9, name: RULESET, target: "tag", source_type: "Repository" },
        { id: 10, name: "something else", target: "branch", source_type: "Repository" },
      ],
    }),
  );
  const { status, stdout } = await run(fixture, ["--required-check", "Verify", "--apply"]);

  assert.equal(status, 0, stdout);
  const done = await mutations(fixture);
  const rulesetCalls = done.filter((call) => call.endpoint.includes("/rulesets"));
  assert.deepEqual(
    rulesetCalls.map((call) => [call.method, call.endpoint]),
    [["POST", ruleEndpoint]],
    "only the new ruleset is created; ids 7 to 10 are untouched",
  );
  assert.equal(done.some((call) => call.method === "PUT" || call.method === "DELETE"), false);
  assert.doesNotMatch(await readFile(fixture.callsLog, "utf8"), /rulesets\/\d+/, "no other ruleset is even read");
});

test("the merge_queue parameters equal the ones in apply-repo-settings.sh (ADR-0042)", async () => {
  const extract = (text) => {
    const match = /\{type:"merge_queue", parameters:\{([^}]*)\}\}/.exec(text);
    assert.ok(match, "a merge_queue rule with parameters is present");
    return match[1];
  };
  const mine = extract(await readFile(scriptPath, "utf8"));
  const theirs = extract(await readFile(settingsScriptPath, "utf8"));
  assert.equal(mine, theirs);

  // And the body the script sends carries exactly those parameters.
  const parsed = Object.fromEntries(
    theirs.split(",").map((pair) => {
      const [key, value] = pair.split(":").map((part) => part.trim());
      return [key, /^\d+$/.test(value) ? Number(value) : value.replaceAll('"', "")];
    }),
  );
  assert.deepEqual(parsed, MERGE_QUEUE_PARAMETERS);
  const fixture = await setup(world());
  const { stdout } = await run(fixture, ["--required-check", "Verify", "--merge-queue"]);
  const queueRule = plannedChanges(stdout)[0].body.rules.find((rule) => rule.type === "merge_queue");
  assert.deepEqual(queueRule.parameters, parsed);
});
