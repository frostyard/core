#!/usr/bin/env node
// Rewrites the embedded copy of scripts/lib/risk-paths.mjs in
// .github/workflows/risk-paths.yml (ADR-0068, docs/specs/risk-paths.md).
// With --check it writes nothing and exits 1 when the copy differs.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const LIBRARY_PATH = "scripts/lib/risk-paths.mjs";
export const WORKFLOW_PATH = ".github/workflows/risk-paths.yml";
export const INDENT = "          ";
export const START_LINE = `${INDENT}node --input-type=module <<'RISK_PATHS_EOF'`;
export const END_LINE = `${INDENT}RISK_PATHS_EOF`;
export const TRAILER = "await main(process.env);";

// The block between START_LINE and END_LINE, as the workflow must hold it.
export function renderBlock(libraryText) {
  if (libraryText.includes("${{")) {
    throw new Error(`${LIBRARY_PATH} must not contain the text "\${{" (GitHub expression syntax)`);
  }
  const lines = libraryText.replace(/\n$/, "").split("\n");
  if (lines.some((line) => line.trim() === "RISK_PATHS_EOF")) {
    throw new Error(`${LIBRARY_PATH} must not contain a RISK_PATHS_EOF line`);
  }
  if (lines.some((line) => line.includes("\t") || line.includes("\r"))) {
    throw new Error(`${LIBRARY_PATH} must not contain tab or CR characters`);
  }
  return [...lines, TRAILER].map((line) => (line === "" ? "" : `${INDENT}${line}`));
}

// Returns { start, end, lines } for the embedded block of a workflow text.
export function findBlock(workflowText) {
  const lines = workflowText.split("\n");
  const start = lines.indexOf(START_LINE);
  const end = start === -1 ? -1 : lines.indexOf(END_LINE, start + 1);
  if (start === -1 || end === -1 || lines.indexOf(START_LINE, start + 1) !== -1) {
    throw new Error(`${WORKFLOW_PATH} must hold exactly 1 block from "${START_LINE.trim()}" to "${END_LINE.trim()}"`);
  }
  return { start, end, lines };
}

// Returns the workflow text with the block replaced from the library text.
export function syncWorkflow(workflowText, libraryText) {
  const { start, end, lines } = findBlock(workflowText);
  return [...lines.slice(0, start + 1), ...renderBlock(libraryText), ...lines.slice(end)].join("\n");
}

// Returns null when the workflow is in sync, else a message.
export function checkSync(root) {
  const library = readFileSync(resolve(root, LIBRARY_PATH), "utf8");
  const workflow = readFileSync(resolve(root, WORKFLOW_PATH), "utf8");
  if (syncWorkflow(workflow, library) === workflow) return null;
  return `${WORKFLOW_PATH} does not embed the current ${LIBRARY_PATH}; run npm run sync:risk-paths-workflow`;
}

function cli() {
  const usage = "Usage: node scripts/sync-risk-paths-workflow.mjs [--check] [--root DIR]";
  let root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  let check = false;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--check") check = true;
    else if (args[i] === "--root" && args[i + 1] && !args[i + 1].startsWith("--")) root = resolve(args[++i]);
    else {
      console.error(usage);
      process.exit(2);
    }
  }
  try {
    if (check) {
      const problem = checkSync(root);
      if (problem) {
        console.error(`FAIL risk_paths_workflow: ${problem}`);
        process.exit(1);
      }
      console.log("ok   risk_paths_workflow: in sync");
      return;
    }
    const library = readFileSync(resolve(root, LIBRARY_PATH), "utf8");
    const workflowFile = resolve(root, WORKFLOW_PATH);
    const workflow = readFileSync(workflowFile, "utf8");
    const next = syncWorkflow(workflow, library);
    if (next === workflow) {
      console.log("ok   risk_paths_workflow: already in sync");
    } else {
      writeFileSync(workflowFile, next);
      console.log(`ok   risk_paths_workflow: rewrote ${WORKFLOW_PATH}`);
    }
  } catch (error) {
    console.error(`FAIL risk_paths_workflow: ${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) cli();
