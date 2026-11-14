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
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");

const SCOPE = "Markdown, YAML or another text format";

// Returns the text of the first list item or table row that contains the marker.
function block(text, marker) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.includes(marker));
  if (start < 0) return "";
  const out = [lines[start]];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    // A list item continues on indented lines; a table row is 1 line.
    if (!/^\s+\S/.test(line) || /^\s*[-|]/.test(line)) break;
    out.push(line);
  }
  return flat(out.join("\n"));
}

const sources = [
  { file: "AGENTS.md", find: (t) => block(t, "A script or test that reads Markdown") },
  { file: "docs/specs/pr-review-rubric.md", find: (t) => block(t, "| Hand-written readers tested |") },
  { file: ".github/pull_request_template.md", find: (t) => block(t, "reads Markdown") },
];

for (const source of sources) {
  test(`${source.file}: the hand-written reader rule names the whole scope`, () => {
    const text = source.find(read(source.file));
    assert.notEqual(text, "", `${source.file} has no hand-written reader rule`);
    assert.ok(text.includes(SCOPE), `${source.file} does not name "${SCOPE}": ${text}`);
    assert.match(text, /every file/i, `${source.file} does not name the shapes for every file`);
  });
}

test("block: a checkbox that names only Markdown or YAML fails the scope check", () => {
  const narrow = "- [ ] Script or test reads Markdown or YAML by hand? 1 test case for each\n      input shape that AGENTS.md lists (fences)\n- [ ] Next\n";
  const text = block(narrow, "reads Markdown");
  assert.equal(text.includes(SCOPE), false);
  assert.equal(/every file/i.test(text), false);
  assert.equal(block(narrow, "no such marker"), "");
});
