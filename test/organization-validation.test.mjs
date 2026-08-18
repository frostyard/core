import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  OrganizationValidationError,
  assertGoalInvariants,
  assertRepositoryInvariants,
  assertVerificationProfileInvariants,
  readStrictJson,
  validateOrganization,
} from "../scripts/lib/organization-validation.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("the live organization tree and fixture corpus validate", async () => {
  const result = await validateOrganization(repoRoot);
  assert.deepEqual(result, {
    repositoryCount: 3,
    verificationProfileCount: 0,
    goalCount: 0,
    validFixtureCount: 6,
    invalidFixtureCount: 14,
  });
});

test("strict JSON rejects duplicate keys before JSON.parse can erase them", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "core-org-json-"));
  const fixture = path.join(temp, "duplicate.json");
  await writeFile(fixture, '{"state":"enabled","state":"disabled"}\n');
  await assert.rejects(
    readStrictJson(fixture, "duplicate.json"),
    (error) =>
      error instanceof OrganizationValidationError &&
      error.message.includes("duplicate JSON object key"),
  );
});

test("strict JSON rejects invalid UTF-8", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "core-org-utf8-"));
  const fixture = path.join(temp, "invalid-utf8.json");
  await writeFile(fixture, Uint8Array.from([0x7b, 0x22, 0x80, 0x22, 0x7d]));
  await assert.rejects(
    readStrictJson(fixture, "invalid-utf8.json"),
    (error) =>
      error instanceof OrganizationValidationError &&
      error.message.includes("invalid UTF-8"),
  );
});

test("repository declaration identity must match its canonical path", () => {
  const declaration = {
    accountable_owners: [{ kind: "github-user", login: "bketelsen" }],
    repository: { owner: "frostyard", name: "chairlift" },
  };
  assert.throws(
    () =>
      assertRepositoryInvariants(
        declaration,
        "organization/repositories/frostyard/updex.json",
      ),
    /does not match its path/,
  );
});

test("verification profile identity must match its canonical path", () => {
  const profile = verificationProfile();
  assert.throws(
    () =>
      assertVerificationProfileInvariants(
        profile,
        "organization/contracts/verification-profiles/other-profile/v1.json",
      ),
    /identity does not match its path/,
  );
});

test("verification profile parameter schemas cannot delegate authority", () => {
  const profile = verificationProfile();
  profile.parameter_schema.properties = {
    result: { $dynamicRef: "https://example.com/result.schema.json" },
  };
  assert.throws(
    () =>
      assertVerificationProfileInvariants(
        profile,
        "organization/contracts/verification-profiles/test-profile/v1.json",
      ),
    /crosses its document boundary/,
  );
});

test("Goal identity must match its canonical path", async () => {
  const goal = await validGoal();
  assert.throws(
    () =>
      assertGoalInvariants(
        goal,
        "organization/goals/another-goal.json",
        new Set(["github.com:123456789"]),
        new Map([["required-check-reliability:v1", verificationProfile()]]),
      ),
    /identity does not match its path/,
  );
});

test("Goal dates are real UTC calendar dates", async () => {
  const goal = await validGoal();
  goal.spec.starts_on = "2026-02-30";
  assert.throws(
    () =>
      assertGoalInvariants(
        goal,
        "organization/goals/improve-ci-reliability-2026-q4.json",
        new Set(["github.com:123456789"]),
        new Map([["required-check-reliability:v1", verificationProfile()]]),
      ),
    /not a real UTC calendar date/,
  );
});

test("organization authority rejects symlinks instead of following them", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "core-org-link-"));
  await mkdir(path.join(temp, "organization"));
  await symlink(
    path.join(repoRoot, "organization", "README.md"),
    path.join(temp, "organization", "README.md"),
  );
  await assert.rejects(
    validateOrganization(temp),
    (error) =>
      error instanceof OrganizationValidationError &&
      error.message.includes("symlinks are forbidden"),
  );
});

function verificationProfile() {
  return {
    evidence_mode: "observational",
    profile: { id: "test-profile", version: 1 },
    parameter_schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://frostyard.org/schemas/organization/verification-profiles/test-profile/v1-parameters.schema.json",
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  };
}

async function validGoal() {
  return readStrictJson(
    path.join(repoRoot, "organization/fixtures/v1/valid/goal.json"),
    "organization/fixtures/v1/valid/goal.json",
  );
}
