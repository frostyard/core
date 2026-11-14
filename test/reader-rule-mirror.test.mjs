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
// This test reads Markdown by hand, so the AGENTS.md reader rule applies to it.
// Its contract is narrow and fails closed:
//   1. the bytes decode as UTF-8 with no error, hold no CR and start with no BOM;
//   2. the file has no fence line (``` or ~~~ after any indent, blockquote
//      marker or list marker), so no copy of the rule can hide in a code block;
//   3. the marker is on exactly 1 line, and that line starts at column 0 with
//      the item's opening text;
//   4. the item is that line plus the next non-blank lines that start with the
//      item's continuation indent (a table row is 1 line).
// The table below has 1 case for each shape that the rule lists for Markdown
// and for every file, with its outcome under this contract. It reads no YAML.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SCOPE = "Markdown, YAML or another text format";
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

// Returns { text } for the 1 item that holds the marker, or { error }.
function ruleItem(bytes, { marker, start, indent }) {
  let source;
  try {
    source = decoder.decode(bytes);
  } catch {
    return { error: "invalid UTF-8" };
  }
  if (source.includes("\r") || source.startsWith("\uFEFF")) return { error: "a CR or a BOM" };
  const lines = source.split("\n");
  if (lines.some((line) => /^(?:\s|>|[-*+]\s|\d+[.)]\s)*(```|~~~)/.test(line))) return { error: "a fence line" };
  const hits = lines.flatMap((line, index) => (line.includes(marker) ? [index] : []));
  if (hits.length !== 1) return { error: `${hits.length} lines hold the marker, not 1` };
  const first = lines[hits[0]];
  if (!first.startsWith(start)) return { error: "the line does not start with the item's opening text" };
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
  if (!item.text.includes(SCOPE)) return "it does not name the whole scope";
  if (!/\bevery file\b/i.test(item.text)) return "it does not name the shapes for every file";
  return null;
}

const AGENTS = { marker: "A script or test that reads Markdown", start: "- A script or test that reads Markdown,", indent: "  " };
const RUBRIC = { marker: "Hand-written readers tested", start: "| Hand-written readers tested |", indent: null };
const TEMPLATE = { marker: "Script or test reads Markdown", start: "- [ ] Script or test reads Markdown,", indent: "      " };

for (const [file, shape] of [
  ["AGENTS.md", AGENTS],
  ["docs/specs/pr-review-rubric.md", RUBRIC],
  [".github/pull_request_template.md", TEMPLATE],
]) {
  test(`${file}: the hand-written reader rule names the whole scope`, () => {
    assert.equal(checkScope(ruleItem(readFileSync(path.join(root, file)), shape)), null);
  });
}

const FULL =
  "- [ ] Script or test reads Markdown, YAML or another text format by hand?\n" +
  "      1 test case for each input shape that AGENTS.md lists for that format\n" +
  "      and for every file (fences)\n";
const NARROW = "- [ ] Script or test reads Markdown or YAML by hand? 1 test case for each\n      input shape (fences)\n";
const FULL_LINE = FULL.split("\n")[0];
const utf8 = (text) => Buffer.from(text, "utf8");

// [shape, bytes, expected: null (passes) or a pattern of the error]
const cases = [
  // Markdown
  ["a backtick fence beside a narrow checkbox", utf8(`\`\`\`markdown\n${FULL}\`\`\`\n\n${NARROW}`), /a fence line/],
  ["a 4-backtick fence alone", utf8(`\`\`\`\`\n${FULL}\`\`\`\`\n`), /a fence line/],
  ["a tilde fence alone", utf8(`~~~\n${FULL}~~~\n`), /a fence line/],
  ["a fence inside a blockquote", utf8(`> \`\`\`\n> ${FULL_LINE}\n> \`\`\`\n${NARROW}`), /a fence line/],
  ["a fence inside a list", utf8(`- item\n\n  ~~~\n  ${FULL_LINE}\n  ~~~\n`), /a fence line/],
  ["a fence that opens a list item", utf8(`1. \`\`\`\n   ${FULL_LINE}\n   \`\`\`\n`), /a fence line/],
  ["the checkbox in a blockquote", utf8(`> ${FULL_LINE}\n>       and for every file\n`), /does not start/],
  ["the checkbox in a nested list", utf8(`- [ ] Parent\n  ${FULL_LINE}\n        and for every file\n`), /does not start/],
  ["the checkbox as indented code", utf8(`    ${FULL_LINE}\n          and for every file\n`), /does not start/],
  ["the checkbox in a 1-backtick code span", utf8(`Use \`${FULL_LINE} every file\` here.\n`), /does not start/],
  ["the checkbox in a 2-backtick code span", utf8(`Use \`\`${FULL_LINE} every file\`\` here.\n`), /does not start/],
  ["the checkbox after an escaped backtick", utf8(`\\\`${FULL_LINE} every file\n`), /does not start/],
  // A list item interrupts a paragraph, so an open code span cannot run across it: the item is real.
  ["a code span opened on the line before", utf8(`Text with \`an open span\n${FULL}`), null],
  ["the checkbox in a table cell", utf8(`| a | b |\n| --- | --- |\n| x | ${FULL_LINE} every file |\n`), /does not start/],
  ["the checkbox in a link destination", utf8(`[x](${FULL_LINE.replace(/ /g, "%20")}) every file\n`), /0 lines hold/],
  ["the checkbox in link text", utf8(`[${FULL_LINE}](x.md) every file\n`), /does not start/],
  ["CRLF line ends", utf8(FULL.replace(/\n/g, "\r\n")), /a CR or a BOM/],
  ["lone CR line ends", utf8(FULL.replace(/\n/g, "\r")), /a CR or a BOM/],
  ["U+00A0 after the dash", utf8(FULL.replace("- [ ]", "-\u00a0[ ]")), /does not start/],
  ["U+00A0 as continuation indent", utf8(FULL.replace(/\n {6}/g, "\n\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0")), /does not name the shapes for every file/],
  // Every file
  ["an empty file", utf8(""), /0 lines hold/],
  ["no final newline", utf8(FULL.trimEnd()), null],
  ["a BOM", utf8(`\uFEFF${FULL}`), /a CR or a BOM/],
  ["invalid UTF-8", Buffer.concat([utf8(FULL), Buffer.from([0xff, 0xfe, 0x0a])]), /invalid UTF-8/],
  ["the marker inside a longer word", utf8(FULL.replace("reads Markdown,", "reads Markdownish,")), /does not start/],
  ["the marker inside a URL", utf8(`https://example.org/#${FULL_LINE} every file\n`), /does not start/],
  ["'every file' inside a longer word", utf8(FULL.replace("every file", "every filesystem")), /does not name the shapes for every file/],
  // The item's limits
  ["the full checkbox", utf8(FULL), null],
  ["the full checkbox before another item", utf8(`${FULL}- [ ] Workflows changed?\n`), null],
  ["a narrow checkbox", utf8(NARROW), /does not start/],
  ["the scope after a blank line", utf8("- [ ] Script or test reads Markdown, by hand?\n\n      Markdown, YAML or another text format, every file\n"), /does not name the whole scope/],
  ["the scope in the next item", utf8("- [ ] Script or test reads Markdown, by hand?\n- [ ] Markdown, YAML or another text format, every file\n"), /does not name the whole scope/],
];

for (const [shape, bytes, expected] of cases) {
  test(`ruleItem: ${shape}`, () => {
    const result = checkScope(ruleItem(bytes, TEMPLATE));
    if (expected === null) assert.equal(result, null);
    else assert.match(String(result), expected);
  });
}

test("ruleItem: a rubric row is 1 line", () => {
  const row = "| Hand-written readers tested | A reader of Markdown, YAML or another text format has a case for every file shape. |\n";
  assert.equal(checkScope(ruleItem(utf8(row), RUBRIC)), null);
  const split = "| Hand-written readers tested | A reader of Markdown |\n  YAML or another text format, every file\n";
  assert.match(String(checkScope(ruleItem(utf8(split), RUBRIC))), /does not name the whole scope/);
});
