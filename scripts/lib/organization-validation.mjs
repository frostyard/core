import { readFile, readdir, lstat } from "node:fs/promises";
import path from "node:path";

import Ajv2020 from "ajv/dist/2020.js";
import { parseTree, getNodeValue, printParseErrorCode } from "jsonc-parser";

const ORGANIZATION_ROOT = "organization";
const SCHEMA_PATHS = Object.freeze({
  envelope: "organization/schemas/v1/envelope.schema.json",
  repository: "organization/schemas/v1/repository.schema.json",
  surfaces: "organization/schemas/v1/repository-surfaces.schema.json",
  governance:
    "organization/schemas/v1/repository-agent-governance.schema.json",
  verificationProfile:
    "organization/schemas/v1/verification-profile.schema.json",
  goal: "organization/schemas/v1/goal.schema.json",
  settings: "organization/schemas/v1/repository-settings.schema.json",
});
const SURFACE_CONTRACT_PATH =
  "organization/contracts/repository-surfaces/v1.json";
const SETTINGS_CONTRACT_PATH =
  "organization/contracts/repository-settings/v1.json";
const STATIC_FILES = new Set([
  "organization/README.md",
  ...Object.values(SCHEMA_PATHS),
  SURFACE_CONTRACT_PATH,
  SETTINGS_CONTRACT_PATH,
]);
const REPOSITORY_PATH =
  /^organization\/repositories\/([^/]+)\/([^/]+)\.json$/;
const VERIFICATION_PROFILE_PATH =
  /^organization\/contracts\/verification-profiles\/([a-z0-9]+(?:-[a-z0-9]+)*)\/v([1-9][0-9]*)\.json$/;
const GOAL_PATH =
  /^organization\/goals\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/;
const FIXTURE_PATH =
  /^organization\/fixtures\/v1\/(valid|invalid)\/(repository-agent-governance|repository-surfaces|repository-settings|repository|verification-profile|goal)(?:-[a-z0-9-]+)?\.json$/;
const MAX_VERIFICATION_PROFILE_BYTES = 65_536;
const MAX_GOAL_BYTES = 65_536;

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
    VERIFICATION_PROFILE_PATH.test(relativePath) ||
    GOAL_PATH.test(relativePath) ||
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

export function assertSettingsInvariants(data, relativePath) {
  // The settings contract may only tighten: a required-checks ruleset that
  // does not require pull requests, or a tag ruleset that neither blocks
  // deletion nor restricts creation, protects nothing.
  const rules = data.default_branch_ruleset;
  if (rules.require_status_checks && !rules.require_pull_request) {
    throw new OrganizationValidationError(
      `${relativePath}: required status checks need require_pull_request`,
    );
  }
  const tags = data.tag_ruleset;
  if (!tags.block_deletions && !tags.restrict_creation) {
    throw new OrganizationValidationError(
      `${relativePath}: tag ruleset must block deletion or restrict creation`,
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

function nestedSchemaBoundaryErrors(value, trail = []) {
  const errors = [];
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      errors.push(...nestedSchemaBoundaryErrors(item, [...trail, index]));
    }
    return errors;
  }
  if (value === null || typeof value !== "object") return errors;
  for (const [key, item] of Object.entries(value)) {
    const nextTrail = [...trail, key];
    if (
      ["$ref", "$dynamicRef", "$recursiveRef"].includes(key) &&
      (typeof item !== "string" || !item.startsWith("#"))
    ) {
      errors.push(
        `${nextTrail.join(".")}: only document-local ${key} values are allowed`,
      );
    }
    if (trail.length > 0 && ["$id", "$schema"].includes(key)) {
      errors.push(
        `${nextTrail.join(".")}: nested schema identities and dialects are forbidden`,
      );
    }
    errors.push(...nestedSchemaBoundaryErrors(item, nextTrail));
  }
  return errors;
}

export function assertVerificationProfileInvariants(data, relativePath) {
  const pathMatch = VERIFICATION_PROFILE_PATH.exec(relativePath);
  if (
    pathMatch &&
    (data.profile.id !== pathMatch[1] ||
      data.profile.version !== Number(pathMatch[2]))
  ) {
    throw new OrganizationValidationError(
      `${relativePath}: verification profile identity does not match its path`,
    );
  }
  const expectedParameterSchemaId =
    `https://frostyard.org/schemas/organization/verification-profiles/` +
    `${data.profile.id}/v${data.profile.version}-parameters.schema.json`;
  if (
    data.parameter_schema.$schema !==
      "https://json-schema.org/draft/2020-12/schema" ||
    data.parameter_schema.$id !== expectedParameterSchemaId ||
    data.parameter_schema.type !== "object" ||
    data.parameter_schema.additionalProperties !== false
  ) {
    throw new OrganizationValidationError(
      `${relativePath}: parameter schema must be a closed Draft 2020-12 object with its canonical $id`,
    );
  }
  const boundaryErrors = nestedSchemaBoundaryErrors(data.parameter_schema);
  if (boundaryErrors.length > 0) {
    throw new OrganizationValidationError(
      `${relativePath}: parameter schema crosses its document boundary`,
      boundaryErrors,
    );
  }
  try {
    new Ajv2020({ allErrors: true, strict: true }).compile(data.parameter_schema);
  } catch (error) {
    throw new OrganizationValidationError(
      `${relativePath}: parameter schema is not a valid strict Draft 2020-12 schema`,
      [error.message],
    );
  }
}

function canonicalRepositoryId(repositoryId) {
  return `github.com:${repositoryId}`;
}

function verificationProfileKey(profile) {
  return `${profile.id}:v${profile.version}`;
}

function assertRealDate(value, relativePath, field) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new OrganizationValidationError(
      `${relativePath}: ${field} is not a real UTC calendar date`,
    );
  }
}

function assertRealInstant(value, relativePath, field) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf()) || date.toISOString() !== value) {
    throw new OrganizationValidationError(
      `${relativePath}: ${field} is not a canonical UTC millisecond instant`,
    );
  }
}

export function assertGoalInvariants(
  data,
  relativePath,
  repositoryIds,
  verificationProfiles,
) {
  const pathMatch = GOAL_PATH.exec(relativePath);
  if (pathMatch && data.metadata.id !== pathMatch[1]) {
    throw new OrganizationValidationError(
      `${relativePath}: Goal identity does not match its path`,
    );
  }

  const owners = new Set();
  for (const owner of data.metadata.owners) {
    if (owners.has(owner.id)) {
      throw new OrganizationValidationError(
        `${relativePath}: duplicate Goal owner ${owner.id}`,
      );
    }
    owners.add(owner.id);
  }

  if (data.metadata.applies_to.repository_selection === "selected") {
    for (const repositoryId of data.metadata.applies_to.repository_ids) {
      if (!repositoryIds.has(repositoryId)) {
        throw new OrganizationValidationError(
          `${relativePath}: applicable repository is not declared: ${repositoryId}`,
        );
      }
    }
  }

  assertRealDate(data.spec.starts_on, relativePath, "spec.starts_on");
  assertRealDate(data.spec.ends_on, relativePath, "spec.ends_on");
  if (data.spec.starts_on > data.spec.ends_on) {
    throw new OrganizationValidationError(
      `${relativePath}: Goal start date is after its end date`,
    );
  }

  const measureIds = new Set();
  let requiredMeasureCount = 0;
  for (const measure of data.spec.success_measures) {
    if (measureIds.has(measure.id)) {
      throw new OrganizationValidationError(
        `${relativePath}: duplicate success measure ${measure.id}`,
      );
    }
    measureIds.add(measure.id);
    if (measure.required) requiredMeasureCount += 1;

    if (!repositoryIds.has(measure.subject.id)) {
      throw new OrganizationValidationError(
        `${relativePath}: success-measure subject is not declared: ${measure.subject.id}`,
      );
    }
    assertRealInstant(
      measure.observation_window.starts_at,
      relativePath,
      `success measure ${measure.id} observation_window.starts_at`,
    );
    assertRealInstant(
      measure.observation_window.ends_at,
      relativePath,
      `success measure ${measure.id} observation_window.ends_at`,
    );
    if (
      measure.observation_window.starts_at >=
      measure.observation_window.ends_at
    ) {
      throw new OrganizationValidationError(
        `${relativePath}: success measure ${measure.id} observation window is empty or reversed`,
      );
    }

    const profileKey = verificationProfileKey(measure.verification_profile);
    const profile = verificationProfiles.get(profileKey);
    if (!profile) {
      throw new OrganizationValidationError(
        `${relativePath}: unknown verification profile ${profileKey}`,
      );
    }
    if (measure.evidence_mode !== profile.evidence_mode) {
      throw new OrganizationValidationError(
        `${relativePath}: success measure ${measure.id} evidence mode does not match ${profileKey}`,
      );
    }
    const validateParameters = new Ajv2020({
      allErrors: true,
      strict: true,
    }).compile(profile.parameter_schema);
    if (!validateParameters(measure.parameters)) {
      const details = (validateParameters.errors ?? []).map(
        (error) =>
          `${relativePath}/spec/success_measures/${measure.id}/parameters${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
      );
      throw new OrganizationValidationError(
        `${relativePath}: success measure ${measure.id} parameters do not satisfy ${profileKey}`,
        details,
      );
    }
  }
  if (requiredMeasureCount === 0) {
    throw new OrganizationValidationError(
      `${relativePath}: Goal must contain at least one required success measure`,
    );
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
  ajv.addSchema(schemas.envelope);
  return {
    repository: ajv.compile(schemas.repository),
    surfaces: ajv.compile(schemas.surfaces),
    governance: ajv.compile(schemas.governance),
    verificationProfile: ajv.compile(schemas.verificationProfile),
    goal: ajv.compile(schemas.goal),
    settings: ajv.compile(schemas.settings),
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
        : name === "repository-settings"
          ? "settings"
        : name === "verification-profile"
          ? "verificationProfile"
          : name === "goal"
            ? "goal"
          : "governance";
  return { expectation, kind };
}

async function validateOne(
  repoRoot,
  relativePath,
  kind,
  validators,
  availablePaths,
  context = {},
) {
  const absolutePath = path.join(repoRoot, relativePath);
  const bytes = await readFile(absolutePath);
  if (
    kind === "verificationProfile" &&
    bytes.byteLength > MAX_VERIFICATION_PROFILE_BYTES
  ) {
    throw new OrganizationValidationError(
      `${relativePath}: verification profile exceeds ${MAX_VERIFICATION_PROFILE_BYTES} bytes`,
    );
  }
  if (kind === "goal" && bytes.byteLength > MAX_GOAL_BYTES) {
    throw new OrganizationValidationError(
      `${relativePath}: Goal exceeds ${MAX_GOAL_BYTES} bytes`,
    );
  }
  const data = await readStrictJson(absolutePath, relativePath);
  assertValid(validators[kind], data, relativePath);
  if (kind === "repository") {
    assertRepositoryInvariants(data, relativePath);
  } else if (kind === "surfaces") {
    assertSurfaceInvariants(data, relativePath, availablePaths);
  } else if (kind === "governance") {
    assertGovernanceInvariants(data, relativePath);
  } else if (kind === "verificationProfile") {
    assertVerificationProfileInvariants(data, relativePath);
  } else if (kind === "settings") {
    assertSettingsInvariants(data, relativePath);
  } else {
    assertGoalInvariants(
      data,
      relativePath,
      context.repositoryIds,
      context.verificationProfiles,
    );
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
  const liveRepositoryIds = new Set(
    [...repositoryIds.keys()].map(canonicalRepositoryId),
  );

  await validateOne(
    repoRoot,
    SURFACE_CONTRACT_PATH,
    "surfaces",
    validators,
    availablePaths,
  );
  await validateOne(
    repoRoot,
    SETTINGS_CONTRACT_PATH,
    "settings",
    validators,
    availablePaths,
  );

  let verificationProfileCount = 0;
  const verificationProfiles = new Map();
  for (const relativePath of relativePaths.filter((item) =>
    VERIFICATION_PROFILE_PATH.test(item),
  )) {
    const data = await validateOne(
      repoRoot,
      relativePath,
      "verificationProfile",
      validators,
      availablePaths,
    );
    const key = `${data.profile.id}:v${data.profile.version}`;
    if (verificationProfiles.has(key)) {
      throw new OrganizationValidationError(
        `${relativePath}: duplicate verification profile ${key}`,
      );
    }
    verificationProfiles.set(key, data);
    verificationProfileCount += 1;
  }

  let goalCount = 0;
  const goalIds = new Set();
  for (const relativePath of relativePaths.filter((item) =>
    GOAL_PATH.test(item),
  )) {
    const data = await validateOne(
      repoRoot,
      relativePath,
      "goal",
      validators,
      availablePaths,
      {
        repositoryIds: liveRepositoryIds,
        verificationProfiles,
      },
    );
    if (goalIds.has(data.metadata.id)) {
      throw new OrganizationValidationError(
        `${relativePath}: duplicate Goal ${data.metadata.id}`,
      );
    }
    goalIds.add(data.metadata.id);
    goalCount += 1;
  }

  const validFixturePaths = relativePaths.filter(
    (item) => FIXTURE_PATH.exec(item)?.[1] === "valid",
  );
  const fixtureRepositoryIds = new Set();
  for (const relativePath of validFixturePaths) {
    if (fixtureKind(relativePath).kind !== "repository") continue;
    const data = await validateOne(
      repoRoot,
      relativePath,
      "repository",
      validators,
      availablePaths,
    );
    fixtureRepositoryIds.add(canonicalRepositoryId(data.repository.repository_id));
  }
  const fixtureVerificationProfiles = new Map();
  for (const relativePath of validFixturePaths) {
    if (fixtureKind(relativePath).kind !== "verificationProfile") continue;
    const data = await validateOne(
      repoRoot,
      relativePath,
      "verificationProfile",
      validators,
      availablePaths,
    );
    fixtureVerificationProfiles.set(verificationProfileKey(data.profile), data);
  }

  let validFixtureCount = 0;
  let invalidFixtureCount = 0;
  let validVerificationProfileFixtureCount = 0;
  let invalidVerificationProfileFixtureCount = 0;
  let validGoalFixtureCount = 0;
  let invalidGoalFixtureCount = 0;
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
        fixture.kind === "goal"
          ? {
              repositoryIds: fixtureRepositoryIds,
              verificationProfiles: fixtureVerificationProfiles,
            }
          : undefined,
      );
      validFixtureCount += 1;
      if (fixture.kind === "verificationProfile") {
        validVerificationProfileFixtureCount += 1;
      } else if (fixture.kind === "goal") {
        validGoalFixtureCount += 1;
      }
      continue;
    }
    try {
      await validateOne(
        repoRoot,
        relativePath,
        fixture.kind,
        validators,
        availablePaths,
        fixture.kind === "goal"
          ? {
              repositoryIds: fixtureRepositoryIds,
              verificationProfiles: fixtureVerificationProfiles,
            }
          : undefined,
      );
    } catch (error) {
      if (!(error instanceof OrganizationValidationError)) throw error;
      invalidFixtureCount += 1;
      if (fixture.kind === "verificationProfile") {
        invalidVerificationProfileFixtureCount += 1;
      } else if (fixture.kind === "goal") {
        invalidGoalFixtureCount += 1;
      }
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
  if (
    validVerificationProfileFixtureCount === 0 ||
    invalidVerificationProfileFixtureCount === 0
  ) {
    throw new OrganizationValidationError(
      "verification profile contract requires valid and invalid fixtures",
    );
  }
  if (validGoalFixtureCount === 0 || invalidGoalFixtureCount === 0) {
    throw new OrganizationValidationError(
      "Goal contract requires valid and invalid fixtures",
    );
  }

  return {
    repositoryCount,
    verificationProfileCount,
    goalCount,
    validFixtureCount,
    invalidFixtureCount,
  };
}
