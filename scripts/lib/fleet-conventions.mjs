import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { ciCoverageGaps, lintGaps, lintScriptPaths, namesMakeCi } from "./ci-gate.mjs";

const CONTENTS_API = "https://api.github.com/repos";

export class FleetConventionsError extends Error {}

export async function collectEnabledRepositories(repositoriesRoot) {
  const owners = (await readdir(repositoriesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));
  const repositories = [];
  for (const owner of owners) {
    const ownerDir = path.join(repositoriesRoot, owner.name);
    const files = (await readdir(ownerDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const file of files) {
      const declaration = JSON.parse(
        await readFile(path.join(ownerDir, file.name), "utf-8"),
      );
      if (declaration.fleet_state === "enabled") {
        repositories.push({
          owner: declaration.repository.owner,
          name: declaration.repository.name,
        });
      }
    }
  }
  return repositories;
}

async function fetchFile(fetchImpl, owner, name, filePath, accept = "application/vnd.github.raw+json") {
  const url = `${CONTENTS_API}/${owner}/${name}/contents/${filePath}`;
  const headers = { Accept: accept };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  let response;
  try {
    response = await fetchImpl(url, { headers });
  } catch (error) {
    throw new FleetConventionsError(
      `${owner}/${name}: ${filePath} request failed: ${error.message}`,
    );
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new FleetConventionsError(
      `${owner}/${name}: ${filePath} request failed with status ${response.status}`,
    );
  }
  return await response.text();
}

function hasMakeTarget(makefile, target) {
  return new RegExp(`^${target}:`, "m").test(makefile);
}

export async function checkRepository(fetchImpl, owner, name) {
  const label = `${owner}/${name}`;
  const failures = [];

  const miseToml = await fetchFile(fetchImpl, owner, name, "mise.toml");
  if (miseToml === null) {
    failures.push("mise.toml missing");
  } else if (!/^\[tools\]/m.test(miseToml)) {
    failures.push("mise.toml missing [tools] table");
  }

  const miseLock = await fetchFile(fetchImpl, owner, name, "mise.lock");
  if (miseLock === null) {
    failures.push("mise.lock missing");
  } else if (miseLock.trim().length === 0) {
    failures.push("mise.lock is empty");
  }

  const makefile = await fetchFile(fetchImpl, owner, name, "Makefile");
  if (makefile === null) {
    failures.push("Makefile missing");
  } else {
    for (const target of ["verify", "check", "ci"]) {
      if (!hasMakeTarget(makefile, target)) {
        failures.push(`Makefile missing ${target}: target`);
      }
    }
  }

  failures.push(...(await checkCiGate(fetchImpl, owner, name, makefile)));

  return { label, failures };
}

// The workflow files of the repository's default branch: name -> text. A
// repository with no .github/workflows directory has none.
async function fetchWorkflows(fetchImpl, owner, name) {
  const listing = await fetchFile(fetchImpl, owner, name, ".github/workflows", "application/vnd.github+json");
  if (listing === null) return {};
  let entries;
  try {
    entries = JSON.parse(listing);
  } catch {
    throw new FleetConventionsError(`${owner}/${name}: .github/workflows listing is not JSON`);
  }
  if (!Array.isArray(entries)) return {};
  const workflows = {};
  for (const entry of entries) {
    if (entry.type !== "file" || !/\.ya?ml$/.test(entry.name)) continue;
    const text = await fetchFile(fetchImpl, owner, name, `.github/workflows/${entry.name}`);
    if (text !== null) workflows[entry.name] = text;
  }
  return workflows;
}

// ADR-0083: `make ci` is the 1 local entry point to the CI gate. Row B12:
// ci.yml runs every part of `make ci`. Row B19: AGENTS.md names `make ci`,
// and no pull-request workflow runs a lint or format check that `make ci`
// does not run.
async function checkCiGate(fetchImpl, owner, name, makefile) {
  const failures = [];
  const agents = await fetchFile(fetchImpl, owner, name, "AGENTS.md");
  if (agents === null) failures.push("B19: AGENTS.md missing");
  else if (!namesMakeCi(agents)) failures.push("B19: AGENTS.md does not name make ci");

  const workflows = await fetchWorkflows(fetchImpl, owner, name);
  if (workflows["ci.yml"] === undefined) {
    failures.push("B12: .github/workflows/ci.yml missing");
  } else if (makefile !== null) {
    const gaps = ciCoverageGaps(makefile, workflows["ci.yml"]);
    if (gaps.length > 0 && !gaps[0].startsWith("a ci target")) {
      failures.push(`B12: ci.yml does not run ${gaps.join(", ")}`);
    }
  }

  if (makefile !== null) {
    const packageJson = await fetchFile(fetchImpl, owner, name, "package.json");
    const files = {};
    for (const filePath of lintScriptPaths({ makefile, packageJson, workflows })) {
      const text = await fetchFile(fetchImpl, owner, name, filePath);
      if (text !== null) files[filePath] = text;
    }
    for (const gap of lintGaps({ makefile, packageJson, workflows, files })) {
      failures.push(`B19: lint or format outside make ci: ${gap}`);
    }
  }
  return failures;
}

// Check the enabled declarations, or the given repositories
// ([{ owner, name }]) when the list is not empty.
export async function checkFleetConventions(fetchImpl, repositoriesRoot, only = []) {
  const repositories = only.length > 0 ? only : await collectEnabledRepositories(repositoriesRoot);
  const results = [];
  for (const { owner, name } of repositories) {
    try {
      results.push(await checkRepository(fetchImpl, owner, name));
    } catch (error) {
      results.push({ label: `${owner}/${name}`, failures: [error.message] });
    }
  }
  return results;
}
