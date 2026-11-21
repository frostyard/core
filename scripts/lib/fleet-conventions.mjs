import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parse, parseAllDocuments } from "yaml";

import { ciCoverageGaps, lintGaps, lintScriptPaths, namesMakeCi, runsOnPullRequest } from "./ci-gate.mjs";
import { triggerEvents } from "./workflow-triggers.mjs";

export const PULL_REQUEST_TARGET_CALLERS = ["risk-paths.yml", "risk-paths-caller.yml"];

// The org Actions policy allows pull_request_target only for these 2 caller paths
// (docs/design/pull-request-target-policy.md). GitHub does not block another
// workflow in a repository that has the caller (core#273).
export function pullRequestTargetGaps(workflows) {
  return Object.entries(workflows)
    .filter(([name, text]) => triggerEvents(text).includes("pull_request_target")
      && !PULL_REQUEST_TARGET_CALLERS.includes(name))
    .map(([name]) => name)
    .sort();
}

// ADR-0091: no frostyard workflow or action uses anthropics/claude-code-action
// or anthropics/claude-code-base-action. Owners and repository names are
// case-insensitive on GitHub, and a fork or mirror under the same repository
// name is the same action, so the match ignores case and owner.
export const CLAUDE_ACTION = /^claude-code(-base)?-action$/i;
const CLAUDE_ACTION_TEXT = /claude-code(-base)?-action/i;

// The repository that a uses: value names: REPO of OWNER/REPO[/PATH][@REF], or
// the last path segment of a docker:// image without its tag or digest. A local
// ./ path names none: the check reads its files under .github/actions itself.
export function usesRepository(value) {
  const text = value.trim();
  if (/^docker:\/\//i.test(text)) {
    const image = text.slice("docker://".length).split("@")[0];
    return image.split("/").pop().split(":")[0];
  }
  if (text.startsWith("./") || text.startsWith("../")) return "";
  return text.split("@")[0].split("/")[1] ?? "";
}

// The files the check reads: each workflow in .github/workflows (GitHub reads
// no subdirectory there) and each YAML file under .github/actions.
export function isWorkflowOrActionFile(filePath) {
  return /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(filePath)
    || /^\.github\/actions\/.+\.ya?ml$/i.test(filePath);
}

function usesValues(node, out) {
  if (Array.isArray(node)) {
    for (const item of node) usesValues(item, out);
    return;
  }
  if (node === null || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (key.trim().toLowerCase() === "uses" && typeof value === "string") out.push(value.trim());
    usesValues(value, out);
  }
}

// files: path -> text. Returns "<path>: uses <value>" for each uses: value that
// names the action, read with the yaml parser in every document, so quotes, flow
// mappings, anchors and aliases count; a comment or run: text does not. A file
// the parser rejects fails when its text names the action (fail closed).
export function claudeActionGaps(files) {
  const gaps = [];
  for (const [file, text] of Object.entries(files)) {
    const values = [];
    try {
      for (const document of parseAllDocuments(text)) {
        if (document.errors.length > 0) throw document.errors[0];
        usesValues(document.toJS(), values);
      }
    } catch {
      if (CLAUDE_ACTION_TEXT.test(text)) gaps.push(`${file}: not valid YAML and names claude-code-action`);
      continue;
    }
    for (const value of values) {
      if (CLAUDE_ACTION.test(usesRepository(value))) gaps.push(`${file}: uses ${value}`);
    }
  }
  return gaps.sort();
}

export const TRIAGE_CALLER_GRANT = Object.freeze({
  contents: Object.freeze(["read"]),
  "pull-requests": Object.freeze(["write"]),
  checks: Object.freeze(["read", "none"]),
  statuses: Object.freeze(["read", "none"]),
});
export const TRIAGE_CALLER_REQUIRED = Object.freeze({ contents: "read", "pull-requests": "write" });

const isPlainObject = (value) => value !== null && typeof value === "object"
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

// ADR-0086: the reusable workflow sets no permissions. Each calling job must
// grant a narrow token; a workflow-level permissions key does not count.
export function triageCallerGrantGaps(workflows) {
  const gaps = [];
  for (const [file, text] of Object.entries(workflows)) {
    let workflow;
    try {
      workflow = parse(text);
    } catch {
      if (/pr-triage\.ya?ml/i.test(text)) gaps.push(`${file}: not valid YAML`);
      continue;
    }
    if (!isPlainObject(workflow) || !isPlainObject(workflow.jobs)) continue;
    for (const [jobId, job] of Object.entries(workflow.jobs)) {
      if (!isPlainObject(job) || typeof job.uses !== "string"
        || !/(^|\/)\.github\/workflows\/pr-triage\.ya?ml(@|$)/i.test(job.uses)) continue;
      const prefix = `${file}: job ${jobId}: `;
      if (!Object.hasOwn(job, "permissions")) {
        gaps.push(`${prefix}no job permissions; the job would get the default token`);
        continue;
      }
      const permissions = job.permissions;
      if (!isPlainObject(permissions)) {
        gaps.push(`${prefix}permissions must be a mapping, not ${JSON.stringify(permissions)}`);
        continue;
      }
      for (const [key, value] of Object.entries(permissions)) {
        if (!Object.hasOwn(TRIAGE_CALLER_GRANT, key)) {
          gaps.push(`${prefix}permission ${key} is not allowed`);
        } else if (!TRIAGE_CALLER_GRANT[key].includes(value)) {
          gaps.push(`${prefix}permission ${key}: ${JSON.stringify(value)} is not allowed`);
        }
      }
      for (const [key, required] of Object.entries(TRIAGE_CALLER_REQUIRED)) {
        if (!Object.hasOwn(permissions, key)) gaps.push(`${prefix}needs ${key}: ${required}`);
      }
    }
  }
  return gaps.sort();
}

export function summaryLine(results) {
  const total = results.reduce((sum, { workflows = 0 }) => sum + workflows, 0);
  return `${results.length} repositories checked, ${total} workflow files read`;
}

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

  const workflows = await fetchWorkflows(fetchImpl, owner, name);
  failures.push(...(await checkCiGate(fetchImpl, owner, name, makefile, workflows)));
  for (const file of pullRequestTargetGaps(workflows)) {
    failures.push(`pull_request_target: ${file} runs on pull_request_target; only the PR triage caller (risk-paths.yml, risk-paths-caller.yml) may`);
  }
  for (const gap of triageCallerGrantGaps(workflows)) {
    failures.push(`triage caller grant: ${gap}`);
  }
  const actionFiles = {
    ...Object.fromEntries(Object.entries(workflows).map(([file, text]) => [`.github/workflows/${file}`, text])),
    ...(await fetchActionFiles(fetchImpl, owner, name, ".github/actions")),
  };
  for (const gap of claudeActionGaps(actionFiles)) {
    failures.push(`claude-code-action: ${gap} (ADR-0091)`);
  }

  return { label, failures, workflows: Object.keys(workflows).length };
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

// The YAML files under dir, at any depth: path -> text. A repository with no
// such directory has none. A failed request, a listing that is not JSON, or a
// symlink that is not a YAML file (the contents API does not list a linked
// directory) throws, so the repository fails rather than passes unread. The
// contents API answers a symlink to a file with the file's text.
async function fetchActionFiles(fetchImpl, owner, name, dir) {
  const listing = await fetchFile(fetchImpl, owner, name, dir, "application/vnd.github+json");
  if (listing === null) return {};
  let entries;
  try {
    entries = JSON.parse(listing);
  } catch {
    throw new FleetConventionsError(`${owner}/${name}: ${dir} listing is not JSON`);
  }
  if (!Array.isArray(entries)) return {};
  const files = {};
  for (const entry of entries) {
    const entryPath = `${dir}/${entry.name}`;
    if (entry.type === "dir") {
      Object.assign(files, await fetchActionFiles(fetchImpl, owner, name, entryPath));
    } else if ((entry.type === "file" || entry.type === "symlink") && isWorkflowOrActionFile(entryPath)) {
      const text = await fetchFile(fetchImpl, owner, name, entryPath);
      if (text !== null) files[entryPath] = text;
    } else if (entry.type === "symlink") {
      throw new FleetConventionsError(`${owner}/${name}: ${entryPath} is a symlink the check cannot follow`);
    }
  }
  return files;
}

// ADR-0083: `make ci` is the 1 local entry point to the CI gate. Row B12:
// ci.yml runs every part of `make ci`. Row B19: AGENTS.md names `make ci`,
// and no pull-request workflow runs a lint or format check that `make ci`
// does not run.
async function checkCiGate(fetchImpl, owner, name, makefile, workflows) {
  const failures = [];
  const agents = await fetchFile(fetchImpl, owner, name, "AGENTS.md");
  if (agents === null) failures.push("B19: AGENTS.md missing");
  else if (!namesMakeCi(agents)) failures.push("B19: AGENTS.md does not name make ci");

  if (workflows["ci.yml"] === undefined) {
    failures.push("B12: .github/workflows/ci.yml missing");
  } else if (!runsOnPullRequest(workflows["ci.yml"])) {
    failures.push("B12: ci.yml does not run on pull_request");
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
      // A repository whose check failed counts 0 files, also when it read some before the error.
      results.push({ label: `${owner}/${name}`, failures: [error.message], workflows: 0 });
    }
  }
  return results;
}
