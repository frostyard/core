#!/usr/bin/env node
// Risk-path list gate (ADR-0068, docs/specs/risk-paths.md): strict JSON and
// the field table of .github/risk-paths.json (versions 1 and 2, ADR-0078), the
// categories of rule B (the protected boundaries of the governance policy, when
// it has any), the required entries (rule C), and, where the library and the
// reusable workflow live, the embedded copies in that workflow.
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LIST_PATH,
  checkRequiredPaths,
  checkWhyCategories,
  parseStrictJson,
  protectedBoundaryIds,
  validateRiskPaths,
} from "./lib/risk-paths.mjs";
import { LIBRARY_PATH, WORKFLOW_PATH, checkSync } from "./sync-risk-paths-workflow.mjs";

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const usage = "Usage: node scripts/check-risk-paths.mjs [--root DIR] [--file PATH] [--caller PATH] [--policy PATH]";

let root = scriptRoot;
let file = LIST_PATH;
let caller = ".github/workflows/risk-paths-caller.yml";
let policyFile = "policies/agent-governance.json";
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--root" || arg === "--file" || arg === "--caller" || arg === "--policy") {
    const value = args[i + 1];
    if (!value || value.startsWith("--")) {
      console.error(usage);
      process.exit(2);
    }
    i++;
    if (arg === "--root") root = resolve(value);
    if (arg === "--file") file = value;
    if (arg === "--caller") caller = value;
    if (arg === "--policy") policyFile = value;
  } else {
    console.error(usage);
    process.exit(2);
  }
}

const failures = [];
let entries = 0;
let named = 0;
const absoluteFile = resolve(root, file);

if (!existsSync(absoluteFile)) {
  failures.push(`${file}: file does not exist`);
} else {
  let list;
  try {
    list = parseStrictJson(readFileSync(absoluteFile, "utf8"));
  } catch (error) {
    failures.push(`${file}: ${error.message}`);
  }
  if (list !== undefined) {
    const validation = validateRiskPaths(list);
    for (const error of validation.errors) failures.push(`${file}: ${error}`);
    if (validation.ok) {
      entries = list.paths.length;
      // Rule B: with a governance policy that has protected boundaries, each
      // L1 or L2 why names a boundary; else it names a category.
      let boundaries = [];
      let policyRead = true;
      const absolutePolicy = resolve(root, policyFile);
      if (existsSync(absolutePolicy)) {
        try {
          boundaries = protectedBoundaryIds(parseStrictJson(readFileSync(absolutePolicy, "utf8")));
        } catch (error) {
          policyRead = false;
          failures.push(`${policyFile}: ${error.message}`);
        }
      }
      if (policyRead) {
        for (const error of checkWhyCategories(list, boundaries)) failures.push(`${file}: ${error}`);
        named = list.paths.filter((entry) => list.schema_version !== 2 || entry.level === "L1" || entry.level === "L2").length;
      }
      // Rule C: the list and the caller workflow are always L1 or L2.
      for (const error of checkRequiredPaths(list, [LIST_PATH, caller])) failures.push(`${file}: ${error}`);
    }
  }
}

// The sync check applies where the library and the reusable workflow live
// (core). A repository that vendors the library has no pr-triage.yml: there
// the check is skipped with a note. In core, test/risk-paths.test.mjs requires
// "workflow in sync" on core's own run, so a missing workflow still fails.
// Only ENOENT means absent: lstat does not follow a symlink, and any other
// error (EACCES, ENOTDIR, a symlink loop on read) fails the gate.
let synced = false;
let skipNote = "";
if (existsSync(resolve(root, LIBRARY_PATH))) {
  let workflow = "present";
  try {
    lstatSync(resolve(root, WORKFLOW_PATH));
  } catch (error) {
    workflow = error.code === "ENOENT" ? "absent" : "unreadable";
    if (workflow === "unreadable") failures.push(`${WORKFLOW_PATH}: ${error.message}`);
  }
  if (workflow === "absent") {
    skipNote = `, workflow sync skipped (no ${WORKFLOW_PATH})`;
  } else if (workflow === "present") {
    try {
      const problem = checkSync(root);
      if (problem) failures.push(problem);
      else synced = true;
    } catch (error) {
      failures.push(error.message);
    }
  }
}

for (const failure of failures) console.error(`FAIL risk-paths: ${failure}`);
if (failures.length > 0) {
  console.log(`FAIL risk_paths: ${failures.length} problem(s)`);
  process.exit(1);
}
const kind = named === 0 ? "" : `, ${named} at L1 or L2 name a category or boundary`;
console.log(`ok   risk_paths: ${entries} entries${kind}${synced ? ", workflow in sync" : skipNote}`);
