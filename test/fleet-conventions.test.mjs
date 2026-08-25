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

function fakeFetch(files) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const match = /\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/.exec(url);
    const [, owner, name, filePath] = match;
    const content = files[`${owner}/${name}/${filePath}`];
    if (content === undefined) {
      return { status: 404, ok: false, text: async () => "" };
    }
    return { status: 200, ok: true, text: async () => content };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
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
    "frostyard/noderepo/mise.toml": '[tools]\nnode = "22"\n',
    "frostyard/noderepo/mise.lock": "lockfile_version = 1\n",
    "frostyard/noderepo/package.json": JSON.stringify({
      scripts: { verify: "npm test", check: "npm test" },
    }),
    "frostyard/noderepo/Makefile":
      "verify:\n\t@true\ncheck:\n\t@true\nci:\n\t@true\n",
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
