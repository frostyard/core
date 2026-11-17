import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILL = ".agents/skills/frostyard-contributor-review/SKILL.md";

// Prose wraps: compare with every run of whitespace as 1 space.
async function skillText() {
  const text = await readFile(path.join(root, SKILL), "utf8");
  return text.replace(/\s+/g, " ");
}

// AGENTS.md: a text that says a PR gets risk:high holds for both schema
// versions, for organization floors and for the PR that adds the first list.
test("the risk-path guidance keeps every case of the risk:high rule", async () => {
  const text = await skillText();
  for (const phrase of [
    "A pull request at L1 or L2 gets `risk:high`",
    "an organization floor puts it there",
    "A version 1 list has no levels, and each of its matches counts as L1",
    "With no list at the base, as in the pull request that adds the first list, the workflow adds no label",
  ]) {
    assert.ok(text.includes(phrase), `${SKILL} must say: ${phrase}`);
  }
});

// The approve-or-merge rule lets a human or a brief ask for the review; a
// narrower "a maintainer asked" drops a case of it.
test("the bot approval rule keeps every condition", async () => {
  const text = await skillText();
  for (const phrase of [
    "approves or merges, never both",
    "once it approved at any head, it does not merge, even after the approval is dismissed",
    "approves only a pull request that it did not open or push to",
    "a human or a brief asked for the review",
    "the review at the current head has no blocking point, and the required checks pass",
  ]) {
    assert.ok(text.includes(phrase), `${SKILL} must say: ${phrase}`);
  }
  assert.equal(text.includes("maintainer asked for the review"), false, "the rule must not narrow who asks");
});
