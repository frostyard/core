import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Repository baseline row B16 (ADR-0071), applied to core itself: no tracked
// file sits in a leftover agent-framework tree, at the root or inside a skill
// payload that the sync copies to other repositories.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LEFTOVER = /(^|\/)(docs\/superpowers|\.planning|\.cursor\/rules|\.gaai|yeti|cairn)\//;
const CLAUDE_ALLOWED = new Set([".claude/settings.json", ".claude/skills", ".claude/session-summary.md"]);

export function findLeftovers(files) {
  return files.filter(
    (file) => LEFTOVER.test(file) || (file.startsWith(".claude/") && !CLAUDE_ALLOWED.has(file)),
  );
}

test("findLeftovers flags each leftover tree and allows the ADR-0029 .claude files", () => {
  const files = [
    ".agents/skills/frostyard-design/docs/superpowers/specs/old.md",
    "docs/superpowers/plans/p.md",
    ".planning/codebase/map.md",
    ".cursor/rules/go.mdc",
    "yeti/OVERVIEW.md",
    ".claude/transcript.md",
    ".claude/settings.json",
    ".claude/skills",
    ".claude/session-summary.md",
    "docs/design/overview.md",
  ];
  assert.deepEqual(findLeftovers(files), files.slice(0, 6));
});

test("core tracks no file in a leftover agent-framework tree", () => {
  const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  assert.ok(files.length > 100, `git ls-files listed only ${files.length} files`);
  assert.deepEqual(findLeftovers(files), []);
});
