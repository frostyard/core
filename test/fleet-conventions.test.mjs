import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import {
  TRIAGE_CALLER_GRANT,
  TRIAGE_CALLER_REQUIRED,
  checkFleetConventions,
  pullRequestTargetGaps,
  summaryLine,
  triageCallerGrantGaps,
} from "../scripts/lib/fleet-conventions.mjs";

async function makeRepositoriesRoot(declarations) {
  const root = await mkdtemp(path.join(os.tmpdir(), "core-fleet-"));
  for (const declaration of declarations) {
    const ownerDir = path.join(root, declaration.repository.owner);
    await mkdir(ownerDir, { recursive: true });
    await writeFile(
      path.join(ownerDir, `${declaration.repository.name}.json`),
      JSON.stringify(declaration),
    );
  }
  return root;
}

// A fake GitHub contents API. A path that is a prefix directory of files
// answers with the listing JSON, as the API does for a directory.
function fakeFetch(files) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const match = /\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/.exec(url);
    const [, owner, name, filePath] = match;
    const content = files[`${owner}/${name}/${filePath}`];
    if (content !== undefined) {
      return { status: 200, ok: true, text: async () => content };
    }
    const prefix = `${owner}/${name}/${filePath}/`;
    const listing = Object.keys(files)
      .filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
      .map((key) => ({ type: "file", name: key.slice(prefix.length) }));
    if (listing.length > 0) {
      return { status: 200, ok: true, text: async () => JSON.stringify(listing) };
    }
    return { status: 404, ok: false, text: async () => "" };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

const MAKEFILE = "verify:\n\t@true\ncheck:\n\t@true\nci:\n\t@true\n";
const AGENTS = "# repo\n\nRun `make ci` before you push.\n";
const CI_YML = "on: [pull_request]\njobs:\n  ci:\n    steps:\n      - run: make ci\n";

// The files of a repository that passes every check, under owner/name.
function conformant(owner, name, extra = {}) {
  const base = {
    "mise.toml": '[tools]\ngo = "1.26"\n',
    "mise.lock": "lockfile_version = 1\n",
    Makefile: MAKEFILE,
    "AGENTS.md": AGENTS,
    ".github/workflows/ci.yml": CI_YML,
    ...extra,
  };
  return Object.fromEntries(
    Object.entries(base)
      .filter(([, content]) => content !== null)
      .map(([file, content]) => [`${owner}/${name}/${file}`, content]),
  );
}

test("a conformant Go repository and a conformant Node repository pass", async () => {
  const root = await makeRepositoriesRoot([
    {
      repository: { owner: "frostyard", name: "gorepo" },
      fleet_state: "enabled",
    },
    {
      repository: { owner: "frostyard", name: "noderepo" },
      fleet_state: "enabled",
    },
  ]);
  const fetchImpl = fakeFetch({
    "frostyard/gorepo/mise.toml": '[tools]\ngo = "1.26"\n',
    "frostyard/gorepo/mise.lock": "lockfile_version = 1\n",
    "frostyard/gorepo/go.mod": "module example.com/gorepo\n",
    "frostyard/gorepo/Makefile":
      "verify:\n\t@true\ncheck:\n\t@true\nci:\n\t@true\n",
    "frostyard/gorepo/AGENTS.md": AGENTS,
    "frostyard/gorepo/.github/workflows/ci.yml": CI_YML,
    "frostyard/noderepo/mise.toml": '[tools]\nnode = "22"\n',
    "frostyard/noderepo/mise.lock": "lockfile_version = 1\n",
    "frostyard/noderepo/package.json": JSON.stringify({
      scripts: { verify: "npm test", check: "npm test" },
    }),
    "frostyard/noderepo/Makefile":
      "verify:\n\t@true\ncheck:\n\t@true\nci:\n\t@true\n",
    "frostyard/noderepo/AGENTS.md": AGENTS,
    "frostyard/noderepo/.github/workflows/ci.yml": CI_YML,
  });

  const results = await checkFleetConventions(fetchImpl, root);

  assert.deepEqual(results, [
    { label: "frostyard/gorepo", failures: [], workflows: 1 },
    { label: "frostyard/noderepo", failures: [], workflows: 1 },
  ]);
});

test("a repository with package.json but no Makefile fails naming Makefile", async () => {
  const root = await makeRepositoriesRoot([
    {
      repository: { owner: "frostyard", name: "noderepo" },
      fleet_state: "enabled",
    },
  ]);
  const fetchImpl = fakeFetch({
    "frostyard/noderepo/mise.toml": '[tools]\nnode = "22"\n',
    "frostyard/noderepo/mise.lock": "lockfile_version = 1\n",
    "frostyard/noderepo/package.json": JSON.stringify({
      scripts: { verify: "npm test", check: "npm test" },
    }),
  });

  const [result] = await checkFleetConventions(fetchImpl, root);

  assert.equal(result.label, "frostyard/noderepo");
  assert.ok(
    result.failures.some((failure) => failure.includes("Makefile")),
    `expected a Makefile failure, got: ${result.failures.join("; ")}`,
  );
});

test("a repository missing mise.lock fails naming mise.lock", async () => {
  const root = await makeRepositoriesRoot([
    {
      repository: { owner: "frostyard", name: "gorepo" },
      fleet_state: "enabled",
    },
  ]);
  const fetchImpl = fakeFetch({
    "frostyard/gorepo/mise.toml": '[tools]\ngo = "1.26"\n',
    "frostyard/gorepo/go.mod": "module example.com/gorepo\n",
    "frostyard/gorepo/Makefile":
      "verify:\n\t@true\ncheck:\n\t@true\nci:\n\t@true\n",
  });

  const [result] = await checkFleetConventions(fetchImpl, root);

  assert.equal(result.label, "frostyard/gorepo");
  assert.ok(
    result.failures.some((failure) => failure.includes("mise.lock")),
    `expected a mise.lock failure, got: ${result.failures.join("; ")}`,
  );
});

test("a Makefile lacking a verify: target fails naming the target", async () => {
  const root = await makeRepositoriesRoot([
    {
      repository: { owner: "frostyard", name: "gorepo" },
      fleet_state: "enabled",
    },
  ]);
  const fetchImpl = fakeFetch({
    "frostyard/gorepo/mise.toml": '[tools]\ngo = "1.26"\n',
    "frostyard/gorepo/mise.lock": "lockfile_version = 1\n",
    "frostyard/gorepo/go.mod": "module example.com/gorepo\n",
    "frostyard/gorepo/Makefile": "check:\n\t@true\nci:\n\t@true\n",
  });

  const [result] = await checkFleetConventions(fetchImpl, root);

  assert.equal(result.label, "frostyard/gorepo");
  assert.ok(
    result.failures.some((failure) => failure.includes("verify:")),
    `expected a verify: target failure, got: ${result.failures.join("; ")}`,
  );
});

test("a disabled declaration is not fetched", async () => {
  const root = await makeRepositoriesRoot([
    {
      repository: { owner: "frostyard", name: "disabled" },
      fleet_state: "disabled",
    },
  ]);
  const fetchImpl = fakeFetch({});

  const results = await checkFleetConventions(fetchImpl, root);

  assert.deepEqual(results, []);
  assert.deepEqual(fetchImpl.calls, []);
});

test("given repositories replace the enabled declarations", async () => {
  const root = await makeRepositoriesRoot([
    { repository: { owner: "frostyard", name: "declared" }, fleet_state: "enabled" },
  ]);
  const fetchImpl = fakeFetch(conformant("bketelsen", "fleet"));

  const results = await checkFleetConventions(fetchImpl, root, [{ owner: "bketelsen", name: "fleet" }]);

  assert.deepEqual(results, [{ label: "bketelsen/fleet", failures: [], workflows: 1 }]);
  assert.ok(fetchImpl.calls.every((url) => url.includes("/repos/bketelsen/fleet/")));
});

async function checkOne(extra) {
  const root = await makeRepositoriesRoot([
    { repository: { owner: "frostyard", name: "repo" }, fleet_state: "enabled" },
  ]);
  const [result] = await checkFleetConventions(fakeFetch(conformant("frostyard", "repo", extra)), root);
  return result.failures;
}

test("B19: an AGENTS.md that does not name make ci fails", async () => {
  assert.deepEqual(await checkOne({ "AGENTS.md": "Run `make check` and `make ci-local`.\n" }), [
    "B19: AGENTS.md does not name make ci",
  ]);
  assert.deepEqual(await checkOne({ "AGENTS.md": null }), ["B19: AGENTS.md missing"]);
});

test("B12: a missing ci.yml, or a ci.yml that skips part of make ci, fails", async () => {
  assert.deepEqual(await checkOne({ ".github/workflows/ci.yml": null }), [
    "B12: .github/workflows/ci.yml missing",
  ]);
  const makefile = "verify:\n\t@true\ncheck:\n\t@true\nci: verify\n\tgo test -race ./...\n";
  assert.deepEqual(
    await checkOne({ ".github/workflows/ci.yml": "on:\n  push:\n    branches: [main]\njobs:\n  a:\n    steps:\n      - run: make ci\n" }),
    ["B12: ci.yml does not run on pull_request"],
  );
  const workflow = "on: [pull_request]\njobs:\n  a:\n    steps:\n      - run: make verify\n";
  assert.deepEqual(await checkOne({ Makefile: makefile, ".github/workflows/ci.yml": workflow }), [
    "B12: ci.yml does not run go test -race ./...",
  ]);
});

test("B19: a lint job outside make ci fails; the same tool inside make ci passes", async () => {
  const lint =
    "on:\n  pull_request:\njobs:\n  lint:\n    steps:\n      - uses: golangci/golangci-lint-action@0123456789012345678901234567890123456789 # v9\n      - run: shellcheck scripts/*.sh\n";
  assert.deepEqual(await checkOne({ ".github/workflows/lint.yml": lint }), [
    "B19: lint or format outside make ci: shellcheck in lint.yml",
    "B19: lint or format outside make ci: golangci/golangci-lint-action (golangci-lint) in lint.yml",
  ]);
  const makefile = "verify: lint\n\t@true\ncheck:\n\t@true\nci: verify\n\nlint:\n\tgolangci-lint run\n\t./scripts/shell-lint.sh\n";
  assert.deepEqual(
    await checkOne({
      Makefile: makefile,
      ".github/workflows/lint.yml": lint,
      "scripts/shell-lint.sh": "#!/bin/sh\nexec shellcheck scripts/*.sh\n",
    }),
    [],
  );
});

test("B19: a lint check in a workflow that does not run on pull requests is not read", async () => {
  const release = "on:\n  push:\n    tags: ['v*']\njobs:\n  lint:\n    if: github.event_name != 'pull_request'\n    steps:\n      - run: golangci-lint run\n";
  assert.deepEqual(await checkOne({ ".github/workflows/release.yml": release }), []);
});

test("pullRequestTargetGaps allows exactly the 2 PR triage caller names", () => {
  assert.deepEqual(pullRequestTargetGaps({
    "risk-paths.yml": "on: pull_request_target\n",
    "risk-paths-caller.yml": "on: pull_request_target\n",
  }), []);
  assert.deepEqual(pullRequestTargetGaps({
    "risk-paths.yaml": "on: pull_request_target\n",
    "x-risk-paths.yml": "on: pull_request_target\n",
  }), ["risk-paths.yaml", "x-risk-paths.yml"]);
});

test("pullRequestTargetGaps detects block and flow triggers", () => {
  assert.deepEqual(pullRequestTargetGaps({
    "deploy.yml": "on:\n  pull_request_target:\n    types: [labeled]\n",
  }), ["deploy.yml"]);
  assert.deepEqual(pullRequestTargetGaps({
    "deploy.yml": "on: [push, pull_request_target]\n",
  }), ["deploy.yml"]);
});

test("pullRequestTargetGaps ignores comments, jobs and other events", () => {
  assert.deepEqual(pullRequestTargetGaps({
    "comment.yml": "# on: pull_request_target\non: push # pull_request_target\n",
    "jobs.yml": "on: push\njobs:\n  pull_request_target:\n    runs-on: ubuntu-latest\n",
    "pr.yml": "on: pull_request\n",
  }), []);
});

test("pullRequestTargetGaps handles no workflows and sorts gaps", () => {
  assert.deepEqual(pullRequestTargetGaps({}), []);
  assert.deepEqual(pullRequestTargetGaps({
    "z.yml": "on: pull_request_target\n",
    "a.yml": "on: pull_request_target\n",
  }), ["a.yml", "z.yml"]);
});

test("a non-caller pull_request_target workflow fails with its file name", async () => {
  const root = await makeRepositoriesRoot([
    { repository: { owner: "frostyard", name: "repo" }, fleet_state: "enabled" },
  ]);
  const fetchImpl = fakeFetch(conformant("frostyard", "repo", {
    ".github/workflows/publish.yml": "on: pull_request_target\n",
  }));

  const results = await checkFleetConventions(fetchImpl, root);

  assert.deepEqual(results, [{
    label: "frostyard/repo",
    failures: ["pull_request_target: publish.yml runs on pull_request_target; only the PR triage caller (risk-paths.yml, risk-paths-caller.yml) may"],
    workflows: 2,
  }]);
});

test("a .yaml pull_request_target workflow fails with its file name and counts workflows", async () => {
  const root = await makeRepositoriesRoot([
    { repository: { owner: "frostyard", name: "repo" }, fleet_state: "enabled" },
  ]);
  const fetchImpl = fakeFetch(conformant("frostyard", "repo", {
    ".github/workflows/x.yaml": "on: pull_request_target\n",
  }));

  const results = await checkFleetConventions(fetchImpl, root);

  assert.deepEqual(results, [{
    label: "frostyard/repo",
    failures: ["pull_request_target: x.yaml runs on pull_request_target; only the PR triage caller (risk-paths.yml, risk-paths-caller.yml) may"],
    workflows: 2,
  }]);
});

test("summaryLine counts repositories and workflow files, including zero and missing counts", () => {
  assert.equal(summaryLine([]), "0 repositories checked, 0 workflow files read");
  assert.equal(summaryLine([{ workflows: 2 }]), "1 repositories checked, 2 workflow files read");
  assert.equal(summaryLine([{ workflows: 3 }, { workflows: 0 }]), "2 repositories checked, 3 workflow files read");
  assert.equal(summaryLine([{}]), "1 repositories checked, 0 workflow files read");
});

test("a PR triage caller on pull_request_target passes and counts workflows", async () => {
  const root = await makeRepositoriesRoot([
    { repository: { owner: "frostyard", name: "repo" }, fleet_state: "enabled" },
  ]);
  const fetchImpl = fakeFetch(conformant("frostyard", "repo", {
    ".github/workflows/risk-paths.yml": "on: pull_request_target\n",
  }));

  const results = await checkFleetConventions(fetchImpl, root);

  assert.deepEqual(results, [{ label: "frostyard/repo", failures: [], workflows: 2 }]);
});

test("the workflows directory listing is fetched once per repository", async () => {
  const root = await makeRepositoriesRoot([
    { repository: { owner: "frostyard", name: "one" }, fleet_state: "enabled" },
    { repository: { owner: "frostyard", name: "two" }, fleet_state: "enabled" },
  ]);
  const fetchImpl = fakeFetch({
    ...conformant("frostyard", "one"),
    ...conformant("frostyard", "two", {
      ".github/workflows/risk-paths.yml": "on: pull_request_target\n",
    }),
  });

  const results = await checkFleetConventions(fetchImpl, root);

  assert.deepEqual(results.map(({ workflows }) => workflows), [1, 2]);
  const listingCalls = fetchImpl.calls.filter((url) => url.endsWith("/contents/.github/workflows"));
  assert.deepEqual(listingCalls, [
    "https://api.github.com/repos/frostyard/one/contents/.github/workflows",
    "https://api.github.com/repos/frostyard/two/contents/.github/workflows",
  ]);
});

const TRIAGE_USE = `frostyard/core/.github/workflows/pr-triage.yml@${"a".repeat(40)}`;
const REQUIRED_GRANT = "    permissions:\n      contents: read\n      pull-requests: write\n";
const callerWorkflow = (grant = "", uses = TRIAGE_USE, top = "") =>
  `${top}on: pull_request_target\njobs:\n  pr-triage:\n    uses: ${uses}\n${grant}`;
const grantGaps = (text) => triageCallerGrantGaps({ "risk-paths.yml": text });
const gapPrefix = "risk-paths.yml: job pr-triage: ";

test("triage caller grant constants pin and freeze the allowed and required permissions", () => {
  assert.deepEqual(TRIAGE_CALLER_GRANT, {
    contents: ["read"], "pull-requests": ["write"], checks: ["read", "none"], statuses: ["read", "none"],
  });
  assert.deepEqual(TRIAGE_CALLER_REQUIRED, { contents: "read", "pull-requests": "write" });
  assert.ok(Object.isFrozen(TRIAGE_CALLER_GRANT));
  assert.ok(Object.isFrozen(TRIAGE_CALLER_REQUIRED));
  for (const values of Object.values(TRIAGE_CALLER_GRANT)) assert.ok(Object.isFrozen(values));
});

test("triageCallerGrantGaps accepts core's caller and every core workflow on disk", async () => {
  const dir = fileURLToPath(new URL("../.github/workflows/", import.meta.url));
  const caller = await readFile(path.join(dir, "risk-paths-caller.yml"), "utf8");
  assert.deepEqual(triageCallerGrantGaps({ "risk-paths-caller.yml": caller }), []);
  const workflows = {};
  for (const name of await readdir(dir)) {
    if (/\.ya?ml$/.test(name)) workflows[name] = await readFile(path.join(dir, name), "utf8");
  }
  assert.ok(Object.keys(workflows).length > 0);
  assert.deepEqual(triageCallerGrantGaps(workflows), []);
});

test("triageCallerGrantGaps accepts required permissions, all 4 scopes and explicit none", () => {
  for (const grant of [
    REQUIRED_GRANT,
    `${REQUIRED_GRANT}      checks: read\n      statuses: read\n`,
    `${REQUIRED_GRANT}      checks: none\n`,
    `${REQUIRED_GRANT}      checks: none\n      statuses: none\n`,
  ]) assert.deepEqual(grantGaps(callerWorkflow(grant)), []);
});

for (const top of ["", "permissions: write-all\n", "permissions:\n  contents: read\n  pull-requests: write\n"]) {
  test(`triageCallerGrantGaps requires own job permissions despite top-level ${JSON.stringify(top)}`, () => {
    assert.deepEqual(grantGaps(callerWorkflow("", TRIAGE_USE, top)), [
      `${gapPrefix}no job permissions; the job would get the default token`,
    ]);
  });
}

for (const [yamlValue, value] of [["write-all", "write-all"], ["read-all", "read-all"], ["~", null], ["[]", []], ["7", 7]]) {
  test(`triageCallerGrantGaps refuses non-mapping permissions ${yamlValue}`, () => {
    assert.deepEqual(grantGaps(callerWorkflow(`    permissions: ${yamlValue}\n`)), [
      `${gapPrefix}permissions must be a mapping, not ${JSON.stringify(value)}`,
    ]);
  });
}

test("triageCallerGrantGaps names both required permissions in an empty mapping", () => {
  assert.deepEqual(grantGaps(callerWorkflow("    permissions: {}\n")), [
    `${gapPrefix}needs contents: read`, `${gapPrefix}needs pull-requests: write`,
  ]);
});

for (const [grant, reason] of [
  [REQUIRED_GRANT.replace("contents: read", "contents: write"), 'permission contents: "write" is not allowed'],
  [REQUIRED_GRANT.replace("pull-requests: write", "pull-requests: read"), 'permission pull-requests: "read" is not allowed'],
  [`${REQUIRED_GRANT}      issues: write\n`, "permission issues is not allowed"],
  [`${REQUIRED_GRANT}      actions: read\n`, "permission actions is not allowed"],
  [`${REQUIRED_GRANT}      checks: write\n`, 'permission checks: "write" is not allowed'],
  [`${REQUIRED_GRANT}      statuses: write\n`, 'permission statuses: "write" is not allowed'],
  [`${REQUIRED_GRANT}      constructor: read\n`, "permission constructor is not allowed"],
]) {
  test(`triageCallerGrantGaps reports ${reason}`, () => {
    assert.deepEqual(grantGaps(callerWorkflow(grant)), [`${gapPrefix}${reason}`]);
  });
}

test("triageCallerGrantGaps accepts flow mappings, quoted keys and values, comments and blank lines", () => {
  assert.deepEqual(grantGaps(callerWorkflow("    permissions: { contents: read, pull-requests: write }\n")), []);
  assert.deepEqual(grantGaps(callerWorkflow(
    "    permissions:\n      # contents grant\n      \"contents\": 'read'\n\n      # PR grant\n      'pull-requests': \"write\"\n",
  )), []);
});

test("triageCallerGrantGaps checks both jobs with an anchored permissions mapping", () => {
  const text = `on: pull_request_target
jobs:
  first:
    uses: ${TRIAGE_USE}
    permissions: &grant
      contents: read
      pull-requests: write
  second:
    uses: ${TRIAGE_USE}
    permissions: *grant
`;
  assert.deepEqual(grantGaps(text), []);
  assert.deepEqual(grantGaps(text.replace("contents: read", "contents: write")), [
    'risk-paths.yml: job first: permission contents: "write" is not allowed',
    'risk-paths.yml: job second: permission contents: "write" is not allowed',
  ]);
});

test("triageCallerGrantGaps rejects an alias to write-all for each job", () => {
  assert.deepEqual(grantGaps(`on: pull_request_target
jobs:
  first:
    uses: ${TRIAGE_USE}
    permissions: &grant write-all
  second:
    uses: ${TRIAGE_USE}
    permissions: *grant
`), [
    'risk-paths.yml: job first: permissions must be a mapping, not "write-all"',
    'risk-paths.yml: job second: permissions must be a mapping, not "write-all"',
  ]);
});

for (const uses of [
  TRIAGE_USE,
  TRIAGE_USE.replace("frostyard/core", "Frostyard/Core"),
  TRIAGE_USE.replace("pr-triage.yml", "PR-TRIAGE.YAML"),
  "./.github/workflows/pr-triage.yml",
]) {
  test(`triageCallerGrantGaps checks caller uses ${uses}`, () => {
    assert.deepEqual(grantGaps(callerWorkflow("", uses)), [
      `${gapPrefix}no job permissions; the job would get the default token`,
    ]);
  });
}

for (const uses of [
  TRIAGE_USE.replace("pr-triage.yml", "risk-paths.yml"),
  TRIAGE_USE.replace("pr-triage.yml", "my-pr-triage.yml"),
  TRIAGE_USE.replace("pr-triage.yml", "pr-triage.yml.bak"),
]) {
  test(`triageCallerGrantGaps ignores other workflow uses ${uses}`, () => {
    assert.deepEqual(grantGaps(callerWorkflow("", uses)), []);
  });
}

test("triageCallerGrantGaps ignores step-level uses", () => {
  assert.deepEqual(grantGaps(`on: pull_request_target
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: ${TRIAGE_USE}
`), []);
});

test("triageCallerGrantGaps reports only the bad caller job and sorts jobs and files", () => {
  const text = `${callerWorkflow(REQUIRED_GRANT)}  z-bad:\n    uses: ${TRIAGE_USE}\n`;
  assert.deepEqual(grantGaps(text), [
    "risk-paths.yml: job z-bad: no job permissions; the job would get the default token",
  ]);
  const bad = `${text}  a-bad:\n    uses: ${TRIAGE_USE}\n`;
  assert.deepEqual(triageCallerGrantGaps({ "z.yml": bad, "a.yml": bad }), [
    "a.yml: job a-bad: no job permissions; the job would get the default token",
    "a.yml: job z-bad: no job permissions; the job would get the default token",
    "z.yml: job a-bad: no job permissions; the job would get the default token",
    "z.yml: job z-bad: no job permissions; the job would get the default token",
  ]);
});

test("triageCallerGrantGaps reports invalid YAML only when it names a triage workflow", () => {
  const duplicate = `${callerWorkflow(REQUIRED_GRANT)}    permissions: {}\n`;
  assert.deepEqual(grantGaps(duplicate), ["risk-paths.yml: not valid YAML"]);
  assert.deepEqual(grantGaps(`uses: ${TRIAGE_USE}\njobs: [\n`), ["risk-paths.yml: not valid YAML"]);
  assert.deepEqual(grantGaps("jobs: [\n"), []);
  assert.deepEqual(grantGaps("name: first\nname: second\n"), []);
});

for (const name of ["PR-Triage.yaml", "PR-Triage.yml"]) {
  test(`triageCallerGrantGaps reports invalid YAML containing ${name}`, () => {
    assert.deepEqual(grantGaps(`uses: ${TRIAGE_USE.replace("pr-triage.yml", name)}\njobs: [\n`), [
      "risk-paths.yml: not valid YAML",
    ]);
  });
}

test("triageCallerGrantGaps accepts BOM, CRLF and no final newline and handles empty documents", () => {
  const text = `name: PR triage caller\n${callerWorkflow(REQUIRED_GRANT)}`;
  for (const source of ["", "# only a comment\n", text, `\uFEFF${text}`, text.replaceAll("\n", "\r\n"), text.trimEnd()]) {
    assert.deepEqual(grantGaps(source), []);
  }
  const bad = callerWorkflow();
  for (const source of [`\uFEFFname: PR triage caller\n${bad}`, bad.replaceAll("\n", "\r\n"), bad.trimEnd()]) {
    assert.deepEqual(grantGaps(source), [`${gapPrefix}no job permissions; the job would get the default token`]);
  }
});

test("triageCallerGrantGaps ignores documents, jobs and job values that are not plain objects", () => {
  for (const source of ["[]", "plain text", "7", "null", "jobs: []", "jobs: text", "jobs: null", "jobs: { empty: null, list: [], string: text }"]) {
    assert.deepEqual(grantGaps(source), []);
  }
});

test("checkFleetConventions reports a triage caller without its own job permissions", async () => {
  const fetchImpl = fakeFetch(conformant("frostyard", "repo", {
    ".github/workflows/risk-paths.yml": callerWorkflow(),
  }));
  const results = await checkFleetConventions(fetchImpl, "", [{ owner: "frostyard", name: "repo" }]);
  assert.deepEqual(results, [{
    label: "frostyard/repo",
    failures: ["triage caller grant: risk-paths.yml: job pr-triage: no job permissions; the job would get the default token"],
    workflows: 2,
  }]);
});

test("a repository request error reports zero workflow files read", async () => {
  const root = await makeRepositoriesRoot([
    { repository: { owner: "frostyard", name: "repo" }, fleet_state: "enabled" },
  ]);
  const fetchImpl = async () => ({ status: 503, ok: false });

  const results = await checkFleetConventions(fetchImpl, root);

  assert.deepEqual(results, [{
    label: "frostyard/repo",
    failures: ["frostyard/repo: mise.toml request failed with status 503"],
    workflows: 0,
  }]);
});

// fleet-conventions.mjs imports the npm package yaml, so the CI job that runs
// check:fleet must install the dependencies first (core#278: the job ran without
// npm ci and failed with ERR_MODULE_NOT_FOUND).
test("the fleet-conventions CI job runs npm ci before npm run check:fleet", async () => {
  const ciPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".github", "workflows", "ci.yml");
  const ci = parse(await readFile(ciPath, "utf8"));
  const runs = ci.jobs["fleet-conventions"].steps.map((step) => step.run).filter((run) => typeof run === "string");
  const install = runs.indexOf("npm ci");
  const check = runs.indexOf("npm run check:fleet");
  assert.notEqual(check, -1, "the job runs npm run check:fleet");
  assert.notEqual(install, -1, "the job runs npm ci");
  assert.ok(install < check, "npm ci runs before npm run check:fleet");
});
