import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkFleetConventions } from "../scripts/lib/fleet-conventions.mjs";

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
    { label: "frostyard/gorepo", failures: [] },
    { label: "frostyard/noderepo", failures: [] },
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

  assert.deepEqual(results, [{ label: "bketelsen/fleet", failures: [] }]);
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
