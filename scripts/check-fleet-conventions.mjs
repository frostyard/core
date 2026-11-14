#!/usr/bin/env node
// Organization gate (ADR-0043, ADR-0044, ADR-0083): reads each enabled
// declaration's default branch over the GitHub API, or each OWNER/REPO given
// as an argument, and prints 1 line per repository. Exit 1 when a repository
// fails, 2 on a usage error. Read only.

import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkFleetConventions } from "./lib/fleet-conventions.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoriesRoot = path.join(repoRoot, "organization", "repositories");

const USAGE = "Usage: node scripts/check-fleet-conventions.mjs [OWNER/REPO...]";
const only = [];
for (const argument of process.argv.slice(2)) {
  const match = /^([A-Za-z0-9][A-Za-z0-9_.-]*)\/([A-Za-z0-9][A-Za-z0-9_.-]*)$/.exec(argument);
  if (!match) {
    console.error(USAGE);
    process.exit(2);
  }
  only.push({ owner: match[1], name: match[2] });
}

const results = await checkFleetConventions(fetch, repositoriesRoot, only);

let failed = false;
for (const { label, failures } of results) {
  if (failures.length === 0) {
    console.log(`ok ${label}`);
  } else {
    failed = true;
    console.log(`FAIL ${label}: ${failures.join("; ")}`);
  }
}

// A gate that read no repository proves nothing.
console.log(`${results.length} repositories checked`);
if (results.length === 0) {
  console.log("FAIL no repository to check");
  failed = true;
}

if (failed) process.exitCode = 1;
