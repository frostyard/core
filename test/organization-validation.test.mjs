import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  OrganizationValidationError,
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
    repositoryCount: 1,
    verificationProfileCount: 0,
    validFixtureCount: 4,
    invalidFixtureCount: 10,
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
