import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Every Markdown table row in core's tracked Markdown files belongs to a table.
// A row that is cut off from its table (by a paragraph or a blank line between
// the rows) renders as plain text, and the reader loses that row: a spec's
// exemption table did this once. Fenced code blocks are skipped.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const isRow = (line) => {
  const t = line.trim();
  return t.length > 1 && t.startsWith("|") && t.endsWith("|");
};
const isDelimiter = (line) => /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(line.trim()) && line.includes("-");

// Returns the 1-based line numbers of table rows that are in no table: the row
// before is not a table row, and the row after is not a delimiter row (so it is
// no header either).
export function orphanTableRows(text) {
  const lines = text.split("\n");
  const orphans = [];
  let fence = null;
  for (let i = 0; i < lines.length; i += 1) {
    // CommonMark: a fence closes only with the same character, at least as
    // many of them, and nothing but spaces after them.
    const fenceMatch = /^\s*(`{3,}|~{3,})(.*)$/.exec(lines[i]);
    if (fence === null && fenceMatch) {
      fence = { char: fenceMatch[1][0], length: fenceMatch[1].length };
      continue;
    }
    if (fence !== null) {
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence.char &&
        fenceMatch[1].length >= fence.length &&
        fenceMatch[2].trim() === ""
      ) {
        fence = null;
      }
      continue;
    }
    if (fence !== null || !isRow(lines[i])) continue;
    const prevIsRow = i > 0 && isRow(lines[i - 1]);
    const nextIsDelimiter = i + 1 < lines.length && isDelimiter(lines[i + 1]);
    if (!prevIsRow && !nextIsDelimiter) orphans.push(i + 1);
  }
  return orphans;
}

test("orphanTableRows finds a row cut off from its table by a paragraph", () => {
  const text = [
    "| Repository | Why |",
    "| --- | --- |",
    "| a | one |",
    "",
    "A note between the rows.",
    "| b | two |",
    "",
  ].join("\n");
  assert.deepEqual(orphanTableRows(text), [6]);
});

test("orphanTableRows finds a row cut off from its table by a blank line", () => {
  const text = ["  | A | B |", "  | --- | --- |", "  | a | b |", "", "  | c | d |"].join("\n");
  assert.deepEqual(orphanTableRows(text), [5]);
});

test("orphanTableRows accepts whole tables, indented tables and fenced code", () => {
  const text = [
    "Text before.",
    "| A | B |",
    "| :--- | ---: |",
    "| a | b |",
    "",
    "- item:",
    "",
    "  | A |",
    "  | --- |",
    "  | a |",
    "",
    "```text",
    "| not a table |",
    "```",
  ].join("\n");
  assert.deepEqual(orphanTableRows(text), []);
});

test("orphanTableRows closes a fence only with the same character, length and no info text", () => {
  const backticks = ["````markdown", "```text", "| example |", "```", "````", "| outside |"].join("\n");
  assert.deepEqual(orphanTableRows(backticks), [6]);
  const tildes = ["~~~~", "~~~", "| example |", "~~~~ text", "| still code |", "~~~~~", "| outside |"].join("\n");
  assert.deepEqual(orphanTableRows(tildes), [7]);
  const mixed = ["```", "~~~", "| example |", "```", "| outside |"].join("\n");
  assert.deepEqual(orphanTableRows(mixed), [5]);
});

test("every table row in the tracked Markdown files belongs to a table", () => {
  const files = execFileSync("git", ["ls-files", "-z", "--", "*.md"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  let checked = 0;
  const findings = [];
  for (const file of files) {
    let text;
    try {
      text = readFileSync(path.join(root, file), "utf8");
    } catch {
      continue; // a symlink to a missing target is docs-integrity's job
    }
    checked += 1;
    for (const line of orphanTableRows(text)) findings.push(`${file}:${line}`);
  }
  assert.ok(checked > 100, `checked ${checked} Markdown files; expected more than 100`);
  assert.deepEqual(findings, [], `table rows outside a table:\n${findings.join("\n")}`);
});
