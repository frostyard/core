import { readFile, readdir, lstat } from "node:fs/promises";
import path from "node:path";

import Ajv2020 from "ajv/dist/2020.js";
import { parseTree, getNodeValue, printParseErrorCode } from "jsonc-parser";

const ORGANIZATION_ROOT = "organization";
const SCHEMA_PATHS = Object.freeze({
  repository: "organization/schemas/v1/repository.schema.json",
  surfaces: "organization/schemas/v1/repository-surfaces.schema.json",
  governance:
    "organization/schemas/v1/repository-agent-governance.schema.json",
});
const SURFACE_CONTRACT_PATH =
  "organization/contracts/repository-surfaces/v1.json";
const STATIC_FILES = new Set([
  "organization/README.md",
  ...Object.values(SCHEMA_PATHS),
  SURFACE_CONTRACT_PATH,
]);
const REPOSITORY_PATH =
  /^organization\/repositories\/([^/]+)\/([^/]+)\.json$/;
const FIXTURE_PATH =
  /^organization\/fixtures\/v1\/(valid|invalid)\/(repository-agent-governance|repository-surfaces|repository)(?:-[a-z0-9-]+)?\.json$/;

export class OrganizationValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "OrganizationValidationError";
    this.details = details;
  }
}

function formatLocation(relativePath, node) {
  return `${relativePath}:${node.offset}`;
}

function duplicateKeyErrors(node, relativePath, trail = []) {
  if (!node) return [];
  const errors = [];
  if (node.type === "object") {
    const seen = new Set();
    for (const property of node.children ?? []) {
      const [keyNode, valueNode] = property.children ?? [];
      const key = keyNode?.value;
      if (seen.has(key)) {
        const location = [...trail, key].join(".") || "<root>";
        errors.push(
          `${formatLocation(relativePath, keyNode)} duplicate key ${JSON.stringify(location)}`,
        );
      }
      seen.add(key);
      errors.push(
        ...duplicateKeyErrors(valueNode, relativePath, [...trail, key]),
      );
    }
  } else if (node.type === "array") {
    for (const [index, child] of (node.children ?? []).entries()) {
      errors.push(...duplicateKeyErrors(child, relativePath, [...trail, index]));
    }
  }
  return errors;
}

export async function readStrictJson(filePath, displayPath = filePath) {
  const bytes = await readFile(filePath);
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new OrganizationValidationError(`${displayPath}: invalid UTF-8`, [
      error.message,
    ]);
  }

  const parseErrors = [];
  const tree = parseTree(source, parseErrors, {
    allowEmptyContent: false,
    allowTrailingComma: false,
    disallowComments: true,
  });
  if (parseErrors.length > 0 || !tree) {
    const details = parseErrors.map(
      ({ error, offset }) =>
        `${displayPath}:${offset} ${printParseErrorCode(error)}`,
    );
    throw new OrganizationValidationError(`${displayPath}: invalid JSON`, details);
  }

  const duplicates = duplicateKeyErrors(tree, displayPath);
  if (duplicates.length > 0) {
    throw new OrganizationValidationError(
      `${displayPath}: duplicate JSON object key`,
      duplicates,
    );
  }
  return getNodeValue(tree);
}

async function walkFiles(absoluteDirectory, relativeDirectory) {
  const files = [];
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const absolute = path.join(absoluteDirectory, entry.name);
    const relative = path.posix.join(relativeDirectory, entry.name);
    const stats = await lstat(absolute);
    if (stats.isSymbolicLink()) {
      throw new OrganizationValidationError(
        `${relative}: symlinks are forbidden in organization authority`,
      );
    }
    if (stats.isDirectory()) {
      files.push(...(await walkFiles(absolute, relative)));
      continue;
    }
    if (!stats.isFile()) {
      throw new OrganizationValidationError(
        `${relative}: only regular files and directories are allowed`,
      );
    }
    files.push(relative);
  }
  return files;
}

function assertRecognizedPath(relativePath) {
  if (
    STATIC_FILES.has(relativePath) ||
    REPOSITORY_PATH.test(relativePath) ||
    FIXTURE_PATH.test(relativePath)
  ) {
    return;
  }
  throw new OrganizationValidationError(
    `${relativePath}: unrecognized organization authority path`,
  );
}

function assertValid(validate, data, relativePath) {
  if (validate(data)) return;
  const details = (validate.errors ?? []).map(
    (error) =>
      `${relativePath}${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
  );
  throw new OrganizationValidationError(
    `${relativePath}: schema validation failed`,
    details,
  );
}

function subjectKey(subject) {
  return subject.kind === "github-user"
    ? `github-user:${subject.login.toLowerCase()}`
    : `github-team:${subject.slug}`;
}

export function assertRepositoryInvariants(data, relativePath) {
  const match = REPOSITORY_PATH.exec(relativePath);
  if (match) {
    const [, pathOwner, pathRepository] = match;
    if (
      data.repository.owner !== pathOwner ||
      data.repository.name !== pathRepository
    ) {
      throw new OrganizationValidationError(
        `${relativePath}: declared repository ${data.repository.owner}/${data.repository.name} does not match its path`,
      );
    }
  }

  const subjects = new Set();
  for (const subject of data.accountable_owners) {
    const key = subjectKey(subject);
    if (subjects.has(key)) {
      throw new OrganizationValidationError(
        `${relativePath}: duplicate accountable owner ${key}`,
      );
    }
    subjects.add(key);
  }
}

export function assertSurfaceInvariants(data, relativePath, availablePaths) {
  const expected = new Set([
    "agent-instructions",
    "agent-governance",
    "agent-skills",
    "documentation-index",
  ]);
  for (const surface of data.surfaces) {
    if (!expected.delete(surface.id)) {
      throw new OrganizationValidationError(
        `${relativePath}: duplicate or unknown surface ${surface.id}`,
      );
    }
    if (surface.schema_path && !availablePaths.has(surface.schema_path)) {
      throw new OrganizationValidationError(
        `${relativePath}: schema path does not exist: ${surface.schema_path}`,
      );
    }
  }
  if (expected.size > 0) {
    throw new OrganizationValidationError(
      `${relativePath}: missing surfaces: ${[...expected].join(", ")}`,
    );
  }
}

export function assertGovernanceInvariants(data, relativePath) {
  const ids = new Set();
  for (const boundary of data.protected_boundaries) {
    if (ids.has(boundary.id)) {
      throw new OrganizationValidationError(
        `${relativePath}: duplicate protected boundary ${boundary.id}`,
      );
    }
    ids.add(boundary.id);
  }
}

async function createValidators(repoRoot) {
  const schemas = {};
  for (const [kind, relativePath] of Object.entries(SCHEMA_PATHS)) {
    schemas[kind] = await readStrictJson(
      path.join(repoRoot, relativePath),
      relativePath,
    );
  }
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  return {
    repository: ajv.compile(schemas.repository),
    surfaces: ajv.compile(schemas.surfaces),
    governance: ajv.compile(schemas.governance),
  };
}

function fixtureKind(relativePath) {
  const match = FIXTURE_PATH.exec(relativePath);
  if (!match) return undefined;
  const [, expectation, name] = match;
  const kind =
    name === "repository"
      ? "repository"
      : name === "repository-surfaces"
        ? "surfaces"
        : "governance";
  return { expectation, kind };
}

async function validateOne(
  repoRoot,
  relativePath,
  kind,
  validators,
  availablePaths,
) {
  const data = await readStrictJson(
    path.join(repoRoot, relativePath),
    relativePath,
  );
  assertValid(validators[kind], data, relativePath);
  if (kind === "repository") {
    assertRepositoryInvariants(data, relativePath);
  } else if (kind === "surfaces") {
    assertSurfaceInvariants(data, relativePath, availablePaths);
  } else {
    assertGovernanceInvariants(data, relativePath);
  }
  return data;
}

export async function validateOrganization(repoRoot) {
  const organizationRoot = path.join(repoRoot, ORGANIZATION_ROOT);
  const relativePaths = await walkFiles(organizationRoot, ORGANIZATION_ROOT);
  for (const relativePath of relativePaths) assertRecognizedPath(relativePath);
  const availablePaths = new Set(relativePaths);
  const validators = await createValidators(repoRoot);

  let repositoryCount = 0;
  const repositoryIds = new Map();
  for (const relativePath of relativePaths.filter((item) =>
    REPOSITORY_PATH.test(item),
  )) {
    const data = await validateOne(
      repoRoot,
      relativePath,
      "repository",
      validators,
      availablePaths,
    );
    const priorPath = repositoryIds.get(data.repository.repository_id);
    if (priorPath) {
      throw new OrganizationValidationError(
        `${relativePath}: repository ID ${data.repository.repository_id} is already declared by ${priorPath}`,
      );
    }
    repositoryIds.set(data.repository.repository_id, relativePath);
    repositoryCount += 1;
  }

  await validateOne(
    repoRoot,
    SURFACE_CONTRACT_PATH,
    "surfaces",
    validators,
    availablePaths,
  );

  let validFixtureCount = 0;
  let invalidFixtureCount = 0;
  for (const relativePath of relativePaths.filter((item) =>
    FIXTURE_PATH.test(item),
  )) {
    const fixture = fixtureKind(relativePath);
    if (fixture.expectation === "valid") {
      await validateOne(
        repoRoot,
        relativePath,
        fixture.kind,
        validators,
        availablePaths,
      );
      validFixtureCount += 1;
      continue;
    }
    try {
      await validateOne(
        repoRoot,
        relativePath,
        fixture.kind,
        validators,
        availablePaths,
      );
    } catch (error) {
      if (!(error instanceof OrganizationValidationError)) throw error;
      invalidFixtureCount += 1;
      continue;
    }
    throw new OrganizationValidationError(
      `${relativePath}: invalid fixture was unexpectedly accepted`,
    );
  }

  if (validFixtureCount === 0 || invalidFixtureCount === 0) {
    throw new OrganizationValidationError(
      "organization fixture corpus must contain valid and invalid examples",
    );
  }

  return {
    repositoryCount,
    validFixtureCount,
    invalidFixtureCount,
  };
}
