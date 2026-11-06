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
  const section = lines.slice(start, end).join("\n");
  assert.match(section, /behind_by/);
  assert.match(section, /gh workflow run sync-skills\.yml/);
});
