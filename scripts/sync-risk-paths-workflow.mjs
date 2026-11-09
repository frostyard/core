#!/usr/bin/env node
// Rewrites the embedded copies of scripts/lib/risk-paths.mjs and
// scripts/lib/pr-triage.mjs in .github/workflows/pr-triage.yml (ADR-0068,
// ADR-0077, docs/specs/pr-triage.md). With --check it writes nothing and exits
// 1 when a copy differs.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const WORKFLOW_PATH = ".github/workflows/pr-triage.yml";
export const INDENT = "          ";
export const TRAILER = "await main(process.env);";

// One block descriptor for each embedded library. `trailer` is a line that the
// block holds after the library, or null.
export const RISK_PATHS_BLOCK = {
  libraryPath: "scripts/lib/risk-paths.mjs",
  startLine: `${INDENT}cat > "$RUNNER_TEMP/pr-triage/risk-paths.mjs" <<'RISK_PATHS_EOF'`,
  endLine: `${INDENT}RISK_PATHS_EOF`,
  marker: "RISK_PATHS_EOF",
  trailer: null,
};
export const PR_TRIAGE_BLOCK = {
  libraryPath: "scripts/lib/pr-triage.mjs",
  startLine: `${INDENT}cat > "$RUNNER_TEMP/pr-triage/pr-triage.mjs" <<'PR_TRIAGE_EOF'`,
  endLine: `${INDENT}PR_TRIAGE_EOF`,
  marker: "PR_TRIAGE_EOF",
  trailer: TRAILER,
};
export const BLOCKS = [RISK_PATHS_BLOCK, PR_TRIAGE_BLOCK];
export const LIBRARY_PATH = RISK_PATHS_BLOCK.libraryPath;

// The block between startLine and endLine, as the workflow must hold it.
export function renderBlock(libraryText, block = RISK_PATHS_BLOCK) {
  if (libraryText.includes("${{")) {
    throw new Error(`${block.libraryPath} must not contain the text "\${{" (GitHub expression syntax)`);
  }
  const lines = libraryText.replace(/\n$/, "").split("\n");
  if (lines.some((line) => line.trim() === block.marker)) {
    throw new Error(`${block.libraryPath} must not contain a ${block.marker} line`);
  }
  if (lines.some((line) => line.includes("\t") || line.includes("\r"))) {
    throw new Error(`${block.libraryPath} must not contain tab or CR characters`);
  }
  const all = block.trailer === null ? lines : [...lines, block.trailer];
  return all.map((line) => (line === "" ? "" : `${INDENT}${line}`));
}

// Returns { start, end, lines } for the embedded block of a workflow text.
export function findBlock(workflowText, block = RISK_PATHS_BLOCK) {
  const lines = workflowText.split("\n");
  const start = lines.indexOf(block.startLine);
  const end = start === -1 ? -1 : lines.indexOf(block.endLine, start + 1);
  if (start === -1 || end === -1 || lines.indexOf(block.startLine, start + 1) !== -1) {
    throw new Error(`${WORKFLOW_PATH} must hold exactly 1 block from "${block.startLine.trim()}" to "${block.endLine.trim()}"`);
  }
  return { start, end, lines };
}

// Returns the workflow text with 1 block replaced from its library text.
export function syncWorkflow(workflowText, libraryText, block = RISK_PATHS_BLOCK) {
  const { start, end, lines } = findBlock(workflowText, block);
  return [...lines.slice(0, start + 1), ...renderBlock(libraryText, block), ...lines.slice(end)].join("\n");
}

// Returns the workflow text with every block replaced from its library file under root.
function syncAll(root, workflowText) {
  let next = workflowText;
  for (const block of BLOCKS) {
    next = syncWorkflow(next, readFileSync(resolve(root, block.libraryPath), "utf8"), block);
  }
  return next;
}

// Returns null when the workflow is in sync, else a message.
// The message names each library whose copy drifted.
export function checkSync(root) {
  const workflow = readFileSync(resolve(root, WORKFLOW_PATH), "utf8");
  const problems = [];
  for (const block of BLOCKS) {
    const library = readFileSync(resolve(root, block.libraryPath), "utf8");
    if (syncWorkflow(workflow, library, block) !== workflow) {
      problems.push(`${WORKFLOW_PATH} does not embed the current ${block.libraryPath}; run npm run sync:risk-paths-workflow`);
    }
  }
  return problems.length === 0 ? null : problems.join("\n");
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
    const workflowFile = resolve(root, WORKFLOW_PATH);
    const workflow = readFileSync(workflowFile, "utf8");
    const next = syncAll(root, workflow);
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
