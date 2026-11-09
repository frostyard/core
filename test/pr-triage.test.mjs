import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createGitHubApi } from "../scripts/lib/risk-paths.mjs";
import {
  MARKER_PREFIX,
  READY_LABEL,
  main,
  readinessComment,
  readinessMarker,
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

test("listCheckRuns reads the check_runs of 2 pages", async () => {
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
  assert.equal(requests[0].url, `https://api.example.test/repos/o/r/commits/${HEAD}/check-runs?per_page=100`);
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
