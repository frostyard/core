import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

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

async function fetchFile(fetchImpl, owner, name, filePath) {
  const url = `${CONTENTS_API}/${owner}/${name}/contents/${filePath}`;
  const headers = { Accept: "application/vnd.github.raw+json" };
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

  const goMod = await fetchFile(fetchImpl, owner, name, "go.mod");
  if (goMod !== null) {
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
  } else {
    const packageJson = await fetchFile(
      fetchImpl,
      owner,
      name,
      "package.json",
    );
    if (packageJson === null) {
      failures.push("neither go.mod nor package.json found");
    } else {
      let parsed;
      try {
        parsed = JSON.parse(packageJson);
      } catch (error) {
        parsed = {};
        failures.push(`package.json is not valid JSON: ${error.message}`);
      }
      if (!parsed.scripts?.verify) {
        failures.push("package.json scripts.verify missing");
      }
      if (!parsed.scripts?.check) {
        failures.push("package.json scripts.check missing");
      }
    }
  }

  return { label, failures };
}

export async function checkFleetConventions(fetchImpl, repositoriesRoot) {
  const repositories = await collectEnabledRepositories(repositoriesRoot);
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
