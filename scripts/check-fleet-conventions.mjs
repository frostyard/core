#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkFleetConventions } from "./lib/fleet-conventions.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoriesRoot = path.join(repoRoot, "organization", "repositories");

const results = await checkFleetConventions(fetch, repositoriesRoot);

let failed = false;
for (const { label, failures } of results) {
  if (failures.length === 0) {
    console.log(`ok ${label}`);
  } else {
    failed = true;
    console.log(`FAIL ${label}: ${failures.join("; ")}`);
  }
}

if (failed) process.exitCode = 1;
