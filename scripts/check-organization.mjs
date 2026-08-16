#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  OrganizationValidationError,
  validateOrganization,
} from "./lib/organization-validation.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  const result = await validateOrganization(repoRoot);
  console.log(
    `organization authority valid: ${result.repositoryCount} declarations, ` +
      `${result.validFixtureCount} valid fixtures, ` +
      `${result.invalidFixtureCount} rejection fixtures`,
  );
} catch (error) {
  if (error instanceof OrganizationValidationError) {
    console.error(error.message);
    for (const detail of error.details) console.error(`  - ${detail}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
