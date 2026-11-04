import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  createGitHubApi,
  matchFiles,
  matchGlob,
  parseStrictJson,
  runRiskPathsJob,
  validateGlob,
  validateRiskPaths,
} from "../scripts/lib/risk-paths.mjs";
import { renderBlock, syncWorkflow } from "../scripts/sync-risk-paths-workflow.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkScript = path.join(repoRoot, "scripts/check-risk-paths.mjs");

const BASE_SHA = "a".repeat(40);
const HEAD_SHA = "b".repeat(40);

function list(paths) {
  return { schema_version: 1, paths };
}

function validList() {
  return list([
    { glob: ".github/risk-paths.json", why: "governance" },
    { glob: ".github/workflows/**", why: "governance: the caller" },
    { glob: "shared/bootc-secure/**", why: "boot chain" },
  ]);
}

// ---- Matching -------------------------------------------------------------

const specTable = [
  ["**/x", ["x", "a/x", "a/b/x"], ["a/x/y"]],
  ["**", ["x", "a/b", ".github/x.yml"], []],
  ["x*", ["x", "xy"], ["a/x", "a/xy"]],
  ["docs/*.md", ["docs/a.md", "docs/.md"], ["docs/a/b.md", "src/a.md"]],
  ["shared/**", ["shared/a", "shared/a/b"], ["other/a"]],
  [
    ".github/{risk-paths.json,settings.yml}",
    [".github/risk-paths.json", ".github/settings.yml"],
    [".github/workflows/ci.yml"],
  ],
];

for (const [glob, yes, no] of specTable) {
  test(`spec table: ${glob}`, () => {
    assert.deepEqual(validateGlob(glob), []);
    for (const p of yes) assert.equal(matchGlob(glob, p), true, `${glob} must match ${p}`);
    for (const p of no) assert.equal(matchGlob(glob, p), false, `${glob} must not match ${p}`);
  });
}

test("braces, ** and ? match as the spec says", () => {
  assert.equal(matchGlob("{a,b}/x", "a/x"), true);
  assert.equal(matchGlob("{a,b}/x", "b/x"), true);
  assert.equal(matchGlob("{a,b}/x", "c/x"), false);
  assert.equal(matchGlob("{a,b}/{c,d}.md", "b/d.md"), true);
  // "**" matches 0 segments, so a/** also matches the file a itself.
  assert.equal(matchGlob("a/**", "a"), true);
  assert.equal(matchGlob("a/**", "a/b/c"), true);
  assert.equal(matchGlob("a/**/z", "a/z"), true);
  assert.equal(matchGlob("a/**/z", "a/b/c/z"), true);
  assert.equal(matchGlob("a/**/z", "a/b/c/y"), false);
  assert.equal(matchGlob("a?c", "abc"), true);
  assert.equal(matchGlob("a?c", "ac"), false);
  assert.equal(matchGlob("a?c", "a/c"), false);
  assert.equal(matchGlob("*", "a/b"), false);
});

test("* matches a dotfile", () => {
  assert.equal(matchGlob("*", ".env"), true);
  assert.equal(matchGlob("**/*", ".github/.hidden"), true);
});

test("matching is case-sensitive", () => {
  assert.equal(matchGlob("Docs/*.md", "docs/a.md"), false);
  assert.equal(matchGlob("docs/*.md", "docs/A.md"), true);
  assert.equal(matchGlob("docs/a.md", "docs/A.md"), false);
});

test("regex characters in a glob match literally", () => {
  assert.equal(matchGlob("a.b+(c)", "a.b+(c)"), true);
  assert.equal(matchGlob("a.b", "axb"), false);
  assert.equal(matchGlob("my-file$", "my-file$"), true);
});

test("matchFiles: a matching file gives a match, a non-matching file none", () => {
  const value = validList();
  assert.deepEqual(matchFiles(value, [{ filename: ".github/workflows/ci.yml", status: "modified" }]), [
    { path: ".github/workflows/ci.yml", glob: ".github/workflows/**", why: "governance: the caller" },
  ]);
  assert.deepEqual(matchFiles(value, [{ filename: "docs/README.md", status: "modified" }]), []);
});

test("matchFiles: a rename matches by its previous path", () => {
  const matches = matchFiles(validList(), [
    { filename: "elsewhere/key.pem", status: "renamed", previous_filename: "shared/bootc-secure/key.pem" },
  ]);
  assert.deepEqual(matches, [{ path: "shared/bootc-secure/key.pem", glob: "shared/bootc-secure/**", why: "boot chain" }]);
});

// ---- Validation -----------------------------------------------------------

function errorsOf(value) {
  const result = validateRiskPaths(value);
  assert.equal(result.ok, false);
  return result.errors.join("\n");
}

test("a valid list passes", () => {
  assert.deepEqual(validateRiskPaths(validList()), { ok: true, errors: [] });
});

test("validation fails on an unknown top-level key", () => {
  assert.match(errorsOf({ ...validList(), extra: 1 }), /\$: unknown key "extra"/);
});

test("validation fails on an unknown entry key", () => {
  const value = validList();
  value.paths[1].owner = "x";
  assert.match(errorsOf(value), /paths\[1\]: unknown key "owner"/);
});

test("validation fails on schema_version 2 and \"1\"", () => {
  assert.match(errorsOf({ ...validList(), schema_version: 2 }), /schema_version/);
  assert.match(errorsOf({ ...validList(), schema_version: "1" }), /schema_version/);
});

test("validation fails on empty paths", () => {
  assert.match(errorsOf(list([])), /paths: must have at least 1 entry/);
});

test("validation fails on a duplicate glob", () => {
  const value = list([
    { glob: "a/**", why: "x" },
    { glob: "a/**", why: "y" },
  ]);
  assert.match(errorsOf(value), /paths\[1\]\.glob: duplicate glob/);
});

test("parseStrictJson fails on a duplicate JSON key at any level", () => {
  assert.throws(() => parseStrictJson('{"schema_version":1,"schema_version":1,"paths":[]}'), /duplicate key "schema_version"/);
  assert.throws(
    () => parseStrictJson('{"schema_version":1,"paths":[{"glob":"a","why":"x","why":"y"}]}'),
    /position \d+: duplicate key "why"/,
  );
  assert.deepEqual(parseStrictJson(' {"a":[1,-2.5e3,true,false,null,"\\u0041\\n"]} '), {
    a: [1, -2500, true, false, null, "A\n"],
  });
  assert.throws(() => parseStrictJson("{'a':1}"), /position 1/);
  assert.throws(() => parseStrictJson('{"a":1} x'), /after the JSON value/);
  assert.throws(() => parseStrictJson('{"a":01}'), /position/);
});

test("parseStrictJson keeps __proto__ an own key, which validation rejects", () => {
  const value = parseStrictJson('{"schema_version":1,"paths":[{"glob":"a","why":"x"}],"__proto__":{}}');
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.match(errorsOf(value), /unknown key "__proto__"/);
});

test("validation fails on an empty or a 201-character why", () => {
  assert.match(errorsOf(list([{ glob: "a", why: "  " }])), /paths\[0\]\.why: must not be empty/);
  assert.match(errorsOf(list([{ glob: "a", why: "x".repeat(201) }])), /paths\[0\]\.why: must be at most 200/);
  assert.equal(validateRiskPaths(list([{ glob: "a", why: "x".repeat(200) }])).ok, true);
  // Code points, not UTF-16 units.
  assert.equal(validateRiskPaths(list([{ glob: "a", why: "😀".repeat(200) }])).ok, true);
});

test("validation fails on a wrong type and collects every error", () => {
  const errors = errorsOf({ schema_version: 1, paths: [{ glob: 3, why: [] }, "x"] });
  assert.match(errors, /paths\[0\]\.glob: must be a string/);
  assert.match(errors, /paths\[0\]\.why: must be a string/);
  assert.match(errors, /paths\[1\]: must be an object/);
  assert.match(errorsOf([]), /top level must be an object/);
});

for (const glob of ["", "/a", "./a", "a//b", "a/", "a/../b", "[ab]", "!a", "a\\b", "a**", "**b/c", "{a}", "{a,}", "{a,{b,c}}", "{a", "a}"]) {
  test(`invalid glob fails: ${JSON.stringify(glob)}`, () => {
    assert.notDeepEqual(validateGlob(glob), []);
    assert.match(errorsOf(list([{ glob, why: "x" }])), /paths\[0\]\.glob/);
  });
}

test("brace expansion above 256 globs fails", () => {
  const group = "{a,b}";
  assert.deepEqual(validateGlob(Array(8).fill(group).join("/")), []);
  assert.match(validateGlob(Array(9).fill(group).join("/")).join(), /more than 256/);
});

// ---- Job ------------------------------------------------------------------

function event(overrides = {}) {
  return {
    pull_request: { number: 7, base: { sha: BASE_SHA }, head: { sha: HEAD_SHA, ref: "feature" } },
    repository: { name: "core", owner: { login: "frostyard" } },
    ...overrides,
  };
}

function fakeApi({ lists = {}, files = [], label = true } = {}) {
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
      return label;
    },
    async addLabels(owner, repo, number, labels) {
      calls.push({ method: "addLabels", args: [owner, repo, number, labels] });
    },
  };
  return { api, calls };
}

async function runJob(api, { eventName = "pull_request_target", ev = event() } = {}) {
  const summaries = [];
  const logs = [];
  const result = await runRiskPathsJob({
    api,
    eventName,
    event: ev,
    summary: (markdown) => summaries.push(markdown),
    log: (line) => logs.push(line),
  });
  return { result, summary: summaries.join(""), logs };
}

function methods(calls) {
  return new Set(calls.map((call) => call.method));
}

const ALLOWED_METHODS = new Set(["getFileAtRef", "listPullFiles", "labelExists", "addLabels"]);

test("job reads the list at the base SHA, never at the head SHA", async () => {
  const { api, calls } = fakeApi({
    lists: {
      [HEAD_SHA]: JSON.stringify(list([{ glob: "src/**", why: "auth" }])),
      [BASE_SHA]: JSON.stringify(list([{ glob: "secure/**", why: "boot chain" }])),
    },
    files: [{ filename: "src/login.go", status: "modified" }],
  });
  const { result, summary } = await runJob(api);
  assert.equal(result.outcome, "no-match");
  assert.match(summary, /no high-risk path changed/);
  const reads = calls.filter((call) => call.method === "getFileAtRef");
  assert.deepEqual(reads, [{ method: "getFileAtRef", args: ["frostyard", "core", ".github/risk-paths.json", BASE_SHA] }]);
  assert.ok(!JSON.stringify(calls).includes(HEAD_SHA));
  assert.ok(!methods(calls).has("addLabels"));
});

test("job adds risk:high once on a match and writes path, glob and why", async () => {
  const { api, calls } = fakeApi({
    lists: { [BASE_SHA]: JSON.stringify(validList()) },
    files: [
      { filename: ".github/workflows/ci.yml", status: "modified" },
      { filename: "shared/bootc-secure/a|b`<c>.sh", status: "added" },
      { filename: "README.md", status: "modified" },
    ],
  });
  const { result, summary, logs } = await runJob(api);
  assert.equal(result.outcome, "labeled");
  assert.equal(result.matches.length, 2);
  const adds = calls.filter((call) => call.method === "addLabels");
  assert.deepEqual(adds, [{ method: "addLabels", args: ["frostyard", "core", 7, ["risk:high"]] }]);
  assert.match(summary, /\| \.github\/workflows\/ci\.yml \| \.github\/workflows\/\\\*\\\* \| governance: the caller \|/);
  // Untrusted file names are escaped in the summary.
  assert.match(summary, /shared\/bootc-secure\/a\\\|b\\`&lt;c&gt;\.sh/);
  for (const line of logs) assert.ok(line.startsWith("risk-paths: "), line);
});

test("job summary shows 500 matches, the count of the rest, and the log has every match", async () => {
  const files = Array.from({ length: 503 }, (_, i) => ({ filename: `shared/bootc-secure/f${i}.sh`, status: "added" }));
  const { api } = fakeApi({ lists: { [BASE_SHA]: JSON.stringify(validList()) }, files });
  const { result, summary, logs } = await runJob(api);
  assert.equal(result.outcome, "labeled");
  assert.equal(result.matches.length, 503);
  assert.equal(summary.split("\n").filter((line) => line.startsWith("| shared/bootc-secure/")).length, 500);
  assert.match(summary, /3 more matches are not shown/);
  assert.equal(logs.filter((line) => line.startsWith("risk-paths: match ")).length, 503);
  assert.ok(logs.some((line) => line.includes("shared/bootc-secure/f502.sh")));
});

test("job with no list on base passes with no label call", async () => {
  const { api, calls } = fakeApi();
  const { result, summary } = await runJob(api);
  assert.equal(result.outcome, "no-list");
  assert.match(summary, /no list on base/);
  assert.deepEqual([...methods(calls)], ["getFileAtRef"]);
});

test("job fails when risk:high does not exist and adds nothing", async () => {
  const { api, calls } = fakeApi({
    lists: { [BASE_SHA]: JSON.stringify(validList()) },
    files: [{ filename: ".github/workflows/ci.yml", status: "modified" }],
    label: false,
  });
  await assert.rejects(runJob(api), (error) => {
    assert.match(error.message, /label risk:high does not exist in frostyard\/core/);
    assert.match(error.message, /accountable owner must create it/);
    return true;
  });
  assert.ok(!methods(calls).has("addLabels"));
  assert.ok(!methods(calls).has("listPullFiles"));
});

test("job checks the label also when nothing matches", async () => {
  const { api, calls } = fakeApi({ lists: { [BASE_SHA]: JSON.stringify(validList()) }, label: false });
  await assert.rejects(runJob(api), /risk:high does not exist/);
  assert.ok(methods(calls).has("labelExists"));
});

test("job adds the label when the file list is truncated at 3000", async () => {
  const files = Array.from({ length: 3000 }, (_, i) => ({ filename: `docs/f${i}.md`, status: "added" }));
  const { api, calls } = fakeApi({ lists: { [BASE_SHA]: JSON.stringify(validList()) }, files });
  const { result, summary } = await runJob(api);
  assert.equal(result.outcome, "labeled");
  assert.equal(result.truncated, true);
  assert.equal(calls.filter((call) => call.method === "addLabels").length, 1);
  assert.match(summary, /truncated/);
});

test("job fails on an invalid list and adds nothing", async () => {
  const { api, calls } = fakeApi({
    lists: { [BASE_SHA]: '{"schema_version":2,"paths":[{"glob":"/a","why":""}]}' },
    files: [{ filename: "a", status: "added" }],
  });
  await assert.rejects(runJob(api), (error) => {
    assert.match(error.message, /schema_version/);
    assert.match(error.message, /paths\[0\]\.glob/);
    assert.match(error.message, /paths\[0\]\.why/);
    return true;
  });
  assert.ok(!methods(calls).has("addLabels"));
});

test("job fails on a duplicate JSON key in the list", async () => {
  const { api, calls } = fakeApi({ lists: { [BASE_SHA]: '{"schema_version":1,"schema_version":1,"paths":[]}' } });
  await assert.rejects(runJob(api), /duplicate key/);
  assert.ok(!methods(calls).has("addLabels"));
});

test("job fails on a wrong event name", async () => {
  const { api, calls } = fakeApi();
  await assert.rejects(runJob(api, { eventName: "pull_request" }), /must run on pull_request_target/);
  assert.equal(calls.length, 0);
});

test("job fails on a base SHA that is not 40 hex characters", async () => {
  const { api } = fakeApi();
  const ev = event();
  ev.pull_request.base.sha = "main";
  await assert.rejects(runJob(api, { ev }), /base\.sha/);
});

test("job never calls a method that removes a label", async () => {
  const scenarios = [
    fakeApi(),
    fakeApi({ lists: { [BASE_SHA]: JSON.stringify(validList()) } }),
    fakeApi({ lists: { [BASE_SHA]: JSON.stringify(validList()) }, files: [{ filename: ".github/risk-paths.json", status: "removed" }] }),
  ];
  for (const { api, calls } of scenarios) {
    await runJob(api);
    for (const method of methods(calls)) assert.ok(ALLOWED_METHODS.has(method), method);
  }
});

// ---- GitHub API client ----------------------------------------------------

function response(status, body, headers = {}) {
  return {
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

test("listPullFiles follows Link rel=next over 3 pages", async () => {
  const requests = [];
  const pages = {
    "https://api.example.test/repos/o/r/pulls/5/files?per_page=100": response(200, [{ filename: "a" }], {
      link: '<https://api.example.test/repositories/1/pulls/5/files?per_page=100&page=2>; rel="next", <https://api.example.test/repositories/1/pulls/5/files?per_page=100&page=3>; rel="last"',
    }),
    "https://api.example.test/repositories/1/pulls/5/files?per_page=100&page=2": response(200, [{ filename: "b" }], {
      link: '<https://api.example.test/repositories/1/pulls/5/files?per_page=100&page=1>; rel="prev", <https://api.example.test/repositories/1/pulls/5/files?per_page=100&page=3>; rel="next"',
    }),
    "https://api.example.test/repositories/1/pulls/5/files?per_page=100&page=3": response(200, [{ filename: "c" }], {
      link: '<https://api.example.test/repositories/1/pulls/5/files?per_page=100&page=2>; rel="prev"',
    }),
  };
  const api = createGitHubApi({
    token: "secret-token",
    apiUrl: "https://api.example.test/",
    fetch: async (url, init) => {
      requests.push({ url, init });
      return pages[url] ?? response(500, {});
    },
  });
  const files = await api.listPullFiles("o", "r", 5);
  assert.deepEqual(files.map((file) => file.filename), ["a", "b", "c"]);
  assert.equal(requests.length, 3);
  for (const { init } of requests) {
    assert.equal(init.headers.Authorization, "Bearer secret-token");
    assert.equal(init.headers["X-GitHub-Api-Version"], "2022-11-28");
    assert.ok(init.headers["User-Agent"]);
  }
});

test("listPullFiles refuses a next link to another host", async () => {
  const api = createGitHubApi({
    token: "t",
    apiUrl: "https://api.example.test",
    fetch: async () => response(200, [], { link: '<https://evil.test/x>; rel="next"' }),
  });
  await assert.rejects(api.listPullFiles("o", "r", 1), /leaves the API host/);
});

test("getFileAtRef reads raw content at the ref and gives null on 404", async () => {
  const requests = [];
  const api = createGitHubApi({
    token: "t",
    apiUrl: "https://api.example.test",
    fetch: async (url, init) => {
      requests.push({ url, init });
      return url.includes("missing") ? response(404, {}) : response(200, '{"x":1}');
    },
  });
  assert.equal(await api.getFileAtRef("o", "r", ".github/risk-paths.json", BASE_SHA), '{"x":1}');
  assert.equal(requests[0].url, `https://api.example.test/repos/o/r/contents/.github/risk-paths.json?ref=${BASE_SHA}`);
  assert.equal(requests[0].init.headers.Accept, "application/vnd.github.raw+json");
  assert.equal(await api.getFileAtRef("o", "r", "missing.json", BASE_SHA), null);
});

test("labelExists URL-encodes the label name and maps 404 to false", async () => {
  const urls = [];
  let status = 200;
  const api = createGitHubApi({
    token: "t",
    apiUrl: "https://api.example.test",
    fetch: async (url) => {
      urls.push(url);
      return response(status, {});
    },
  });
  assert.equal(await api.labelExists("o", "r", "risk:high"), true);
  assert.equal(urls[0], "https://api.example.test/repos/o/r/labels/risk%3Ahigh");
  status = 404;
  assert.equal(await api.labelExists("o", "r", "risk:high"), false);
});

test("addLabels posts to the issues labels API; other errors throw without the token", async () => {
  const requests = [];
  let status = 200;
  const api = createGitHubApi({
    token: "secret-token",
    apiUrl: "https://api.example.test",
    fetch: async (url, init) => {
      requests.push({ url, init });
      return response(status, {});
    },
  });
  await api.addLabels("o", "r", 9, ["risk:high"]);
  assert.equal(requests[0].url, "https://api.example.test/repos/o/r/issues/9/labels");
  assert.equal(requests[0].init.method, "POST");
  assert.deepEqual(JSON.parse(requests[0].init.body), { labels: ["risk:high"] });
  status = 403;
  await assert.rejects(api.addLabels("o", "r", 9, ["risk:high"]), (error) => {
    assert.match(error.message, /POST \/repos\/o\/r\/issues\/9\/labels failed: HTTP 403/);
    assert.ok(!error.message.includes("secret-token"));
    return true;
  });
  status = 404;
  await assert.rejects(api.addLabels("o", "r", 9, ["risk:high"]), /HTTP 404/);
});

// ---- Workflows ------------------------------------------------------------

const workflowPath = path.join(repoRoot, ".github/workflows/risk-paths.yml");
const callerPath = path.join(repoRoot, ".github/workflows/risk-paths-caller.yml");
const libraryPath = path.join(repoRoot, "scripts/lib/risk-paths.mjs");

function codeLines(text) {
  return text.split("\n").filter((line) => !/^\s*#/.test(line));
}

// The YAML lines of a workflow outside the embedded heredoc.
function yamlLines(text) {
  const out = [];
  let inBlock = false;
  for (const line of codeLines(text)) {
    if (line.trim() === "node --input-type=module <<'RISK_PATHS_EOF'") inBlock = true;
    else if (line.trim() === "RISK_PATHS_EOF") inBlock = false;
    else if (!inBlock) out.push(line);
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

test("the reusable workflow embeds the library verbatim plus the trailer", async () => {
  const [workflow, library] = await Promise.all([readFile(workflowPath, "utf8"), readFile(libraryPath, "utf8")]);
  assert.equal(syncWorkflow(workflow, library), workflow);
  const lines = workflow.split("\n");
  const start = lines.findIndex((line) => line.trim() === "node --input-type=module <<'RISK_PATHS_EOF'");
  const end = lines.findIndex((line, index) => index > start && line.trim() === "RISK_PATHS_EOF");
  const embedded = lines.slice(start + 1, end).map((line) => line.replace(/^ {10}/, "")).join("\n");
  assert.equal(embedded, `${library.replace(/\n$/, "")}\nawait main(process.env);`);
  assert.deepEqual(renderBlock(library), lines.slice(start + 1, end));
});

test("the library has no static import and no expression or heredoc marker", async () => {
  const library = await readFile(libraryPath, "utf8");
  assert.ok(!/^\s*import\s/m.test(library));
  assert.ok(!library.includes("${{"));
  assert.ok(!library.split("\n").includes("RISK_PATHS_EOF"));
});

test("the reusable workflow checks out nothing and keeps least privilege", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const lines = yamlLines(workflow);
  const text = lines.join("\n");
  assert.ok(!workflow.includes("actions/checkout"));
  assert.ok(!/head\.sha|head\.ref|head_ref|refs\/pull|merge_commit_sha|\/merge\b/.test(workflow));
  assert.match(text, /^on:\n {2}workflow_call: \{\}$/m);
  assert.match(text, /^permissions: \{\}$/m);
  assert.deepEqual(jobPermissions(lines), ["contents: read", "pull-requests: write"]);
  const uses = lines.filter((line) => /\buses:/.test(line));
  assert.ok(uses.length > 0);
  for (const line of uses) assert.match(line, /uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40}(\s|$)/);
  assert.match(text, /timeout-minutes: 5/);
  assert.match(text, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
});

test("the caller runs only on pull_request_target with the 4 types", async () => {
  const caller = await readFile(callerPath, "utf8");
  const lines = codeLines(caller);
  const text = lines.join("\n");
  assert.match(text, /^on:\n {2}pull_request_target:\n {4}types: \[opened, synchronize, reopened, edited\]\n\npermissions: \{\}$/m);
  assert.ok(!text.includes("merge_group"));
  const triggers = text.split(/^on:\n/m)[1].split(/^\S/m)[0].split("\n").filter((line) => /^ {2}\S/.test(line));
  assert.deepEqual(triggers, ["  pull_request_target:"]);
  assert.deepEqual(jobPermissions(lines), ["contents: read", "pull-requests: write"]);
  assert.match(text, /^ {4}uses: \.\/\.github\/workflows\/risk-paths\.yml$/m);
  assert.ok(!/actions\/checkout|head\.sha|head\.ref/.test(caller));
});

// ---- Gate -----------------------------------------------------------------

async function gateFixture(value) {
  const root = await mkdtemp(path.join(os.tmpdir(), "core-risk-paths-gate-"));
  await mkdir(path.join(root, ".github"), { recursive: true });
  await writeFile(path.join(root, ".github/risk-paths.json"), typeof value === "string" ? value : JSON.stringify(value, null, 2));
  return root;
}

function runGate(root) {
  return execFileAsync(process.execPath, [checkScript, "--root", root], { cwd: root });
}

test("check-risk-paths passes on the repository", async () => {
  const { stdout } = await runGate(repoRoot);
  assert.match(stdout, /ok {3}risk_paths: \d+ entries, workflow in sync/);
});

test("check-risk-paths passes on a valid fixture list", async () => {
  const root = await gateFixture(validList());
  const { stdout } = await runGate(root);
  assert.match(stdout, /ok {3}risk_paths: 3 entries/);
});

test("check-risk-paths fails on an invalid list", async () => {
  const root = await gateFixture({ schema_version: 1, paths: [{ glob: "a**", why: "x" }] });
  await assert.rejects(runGate(root), (error) => error.stderr.includes("paths[0].glob"));
});

test("check-risk-paths fails on a duplicate JSON key", async () => {
  const root = await gateFixture('{"schema_version":1,"paths":[],"paths":[]}');
  await assert.rejects(runGate(root), (error) => error.stderr.includes("duplicate key"));
});

test("check-risk-paths fails on a list without .github/risk-paths.json", async () => {
  const root = await gateFixture(list([{ glob: ".github/workflows/**", why: "governance" }]));
  await assert.rejects(runGate(root), (error) => error.stderr.includes("no glob matches the required path .github/risk-paths.json"));
});

test("check-risk-paths fails on a list without the caller", async () => {
  const root = await gateFixture(list([{ glob: ".github/risk-paths.json", why: "governance" }]));
  await assert.rejects(runGate(root), (error) =>
    error.stderr.includes("no glob matches the required path .github/workflows/risk-paths-caller.yml"),
  );
});

test("check-risk-paths fails when the embedded copy drifts", async () => {
  const root = await gateFixture(validList());
  await mkdir(path.join(root, "scripts/lib"), { recursive: true });
  await mkdir(path.join(root, ".github/workflows"), { recursive: true });
  const library = await readFile(libraryPath, "utf8");
  await writeFile(path.join(root, "scripts/lib/risk-paths.mjs"), `${library}// drift\n`);
  await writeFile(path.join(root, ".github/workflows/risk-paths.yml"), await readFile(workflowPath, "utf8"));
  await assert.rejects(runGate(root), (error) => error.stderr.includes("does not embed the current scripts/lib/risk-paths.mjs"));
});
