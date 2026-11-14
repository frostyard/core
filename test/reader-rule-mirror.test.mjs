import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// The rule for hand-written readers lives in 3 places: the AGENTS.md rule, the
// review rubric row and the PR template checkbox. The rubric's rows mirror the
// template, so all 3 must name the same scope: Markdown, YAML or another text
// format, and the shapes for every file. A checkbox that names fewer formats
// lets an author skip the tests that the rubric asks for.
//
// This is no Markdown reader. Its contract is narrow and fails closed: the
// marker is on exactly 1 line of the file, that line starts with the item's
// opening text, and the item is that line plus the lines after it that start
// with the item's continuation indent. A 2nd copy of the marker anywhere (a
// fenced example, a quote, a code span) fails, and so does a CR or a BOM.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

const SCOPE = "Markdown, YAML or another text format";

// Returns { text } for the 1 item that holds the marker, or { error }.
function ruleItem(source, { marker, start, indent }) {
  if (source.includes("\r") || source.startsWith("\uFEFF")) return { error: "a CR or a BOM" };
  const lines = source.split("\n");
  const hits = lines.flatMap((line, index) => (line.includes(marker) ? [index] : []));
  if (hits.length !== 1) return { error: `${hits.length} lines hold "${marker}", not 1` };
  const first = lines[hits[0]];
  if (!first.startsWith(start)) return { error: `the line does not start with "${start}"` };
  const out = [first];
  if (indent !== null) {
    for (let i = hits[0] + 1; i < lines.length && lines[i].startsWith(indent) && lines[i].trim() !== ""; i += 1) {
      out.push(lines[i]);
    }
  }
  return { text: out.join("\n").replace(/\s+/g, " ") };
}

function checkScope(item) {
  if (item.error) return item.error;
  if (!item.text.includes(SCOPE)) return `it does not name "${SCOPE}"`;
  if (!/every file/i.test(item.text)) return "it does not name the shapes for every file";
  return null;
}

const AGENTS = { marker: "A script or test that reads Markdown", start: "- A script or test that reads Markdown", indent: "  " };
const RUBRIC = { marker: "Hand-written readers tested", start: "| Hand-written readers tested |", indent: null };
const TEMPLATE = { marker: "Script or test reads Markdown", start: "- [ ] Script or test reads Markdown", indent: "      " };

for (const [file, shape] of [
  ["AGENTS.md", AGENTS],
  ["docs/specs/pr-review-rubric.md", RUBRIC],
  [".github/pull_request_template.md", TEMPLATE],
]) {
  test(`${file}: the hand-written reader rule names the whole scope`, () => {
    assert.equal(checkScope(ruleItem(read(file), shape)), null);
  });
}

const full =
  "- [ ] Script or test reads Markdown, YAML or another text format by hand?\n" +
  "      1 test case for each input shape that AGENTS.md lists for that format\n" +
  "      and for every file (fences)\n";
const narrow =
  "- [ ] Script or test reads Markdown or YAML by hand? 1 test case for each\n" +
  "      input shape that AGENTS.md lists (fences)\n";

test("ruleItem: the full checkbox passes, also with no final newline and a following item", () => {
  assert.equal(checkScope(ruleItem(full, TEMPLATE)), null);
  assert.equal(checkScope(ruleItem(full.trimEnd(), TEMPLATE)), null);
  assert.equal(checkScope(ruleItem(`${full}- [ ] Workflows changed?\n`, TEMPLATE)), null);
});

test("ruleItem: a narrow checkbox fails the scope check", () => {
  assert.match(checkScope(ruleItem(narrow, TEMPLATE)), /does not name "Markdown, YAML or another text format"/);
});

test("ruleItem: the scope on a line after a blank line or a new item does not count", () => {
  const cut = "- [ ] Script or test reads Markdown by hand?\n\n      Markdown, YAML or another text format, every file\n";
  assert.match(checkScope(ruleItem(cut, TEMPLATE)), /does not name/);
  const next = "- [ ] Script or test reads Markdown by hand?\n- [ ] Markdown, YAML or another text format, every file\n";
  assert.match(checkScope(ruleItem(next, TEMPLATE)), /does not name/);
});

test("ruleItem: a full example in a fence beside a narrow checkbox fails", () => {
  const fenced = `Example:\n\n\`\`\`markdown\n${full}\`\`\`\n\n${narrow}`;
  assert.match(checkScope(ruleItem(fenced, TEMPLATE)), /2 lines hold/);
});

test("ruleItem: a marker only in prose or a code span fails", () => {
  const prose = "The `- [ ] Script or test reads Markdown, YAML or another text format` box, every file.\n";
  assert.match(checkScope(ruleItem(prose, TEMPLATE)), /does not start with/);
});

test("ruleItem: an empty file, a CR and a BOM fail", () => {
  assert.match(checkScope(ruleItem("", TEMPLATE)), /0 lines hold/);
  assert.match(checkScope(ruleItem(full.replace(/\n/g, "\r\n"), TEMPLATE)), /a CR or a BOM/);
  assert.match(checkScope(ruleItem(`\uFEFF${full}`, TEMPLATE)), /a CR or a BOM/);
});

test("ruleItem: a rubric row is 1 line", () => {
  const row = "| Hand-written readers tested | A reader of Markdown, YAML or another text format has a case for every file shape. |\n";
  assert.equal(checkScope(ruleItem(row, RUBRIC)), null);
  const split = "| Hand-written readers tested | A reader of Markdown |\n  YAML or another text format, every file\n";
  assert.match(checkScope(ruleItem(split, RUBRIC)), /does not name/);
});
