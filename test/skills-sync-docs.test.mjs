import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Every surface that describes the sync's destination. `.agents/skills/<name>/`
// is the only managed path (ADR-0026), so the retired `docs/agents` layout must
// not come back as an alternative in any of them.
const FILES = [
  "docs/design/shared-skills.md",
  "docs/design/skills-sync-operations.md",
  ".agents/skills/frostyard-onboard-repo/SKILL.md",
  "scripts/lib/skills-sync-repo.sh",
  "scripts/lib/skills-sync-containment.sh",
];

test("no sync surface names the retired docs/agents layout", async () => {
  for (const file of FILES) {
    const text = await readFile(path.join(root, file), "utf8");
    assert.equal(text.includes("docs/agents"), false, `${file} names docs/agents`);
  }
});

test("the sync pull request procedure requires a head current with the default branch", async () => {
  const text = await readFile(path.join(root, "docs/design/shared-skills.md"), "utf8");
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim() === "### Handling a sync pull request");
  assert.notEqual(start, -1, "missing the '### Handling a sync pull request' heading");
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{1,6} /.test(lines[i])) {
      end = i;
      break;
    }
  }
  assert.ok(end > start + 1, "the section is empty");
  // Prose wraps: compare with every run of whitespace as 1 space.
  const section = lines.slice(start, end).join("\n").replace(/\s+/g, " ");
  // The head is compared against the default branch (BRANCH...HEAD_SHA, not
  // the reverse), and only behind_by 0 passes.
  assert.ok(
    section.includes("compare/BRANCH...HEAD_SHA --jq .behind_by` prints `0`"),
    "the procedure must require behind_by 0 for compare/BRANCH...HEAD_SHA",
  );
  assert.ok(
    section.includes("When `behind_by` is not `0`, do not add the label"),
    "the procedure must withhold the label when the head is behind",
  );
  assert.ok(section.includes("gh workflow run sync-skills.yml --repo frostyard/core"));
});
