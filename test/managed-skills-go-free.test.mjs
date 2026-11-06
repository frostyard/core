import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FORBIDDEN = /^(.*\.go|go\.mod|go\.sum|go\.work)$/;

// Walk dir recursively; return the paths of files that a Go tool would pick up.
export async function findGoFiles(dir) {
  const found = [];
  let checked = 0;
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        checked += 1;
        if (FORBIDDEN.test(entry.name)) found.push(full);
      }
    }
  }
  await walk(dir);
  return { found, checked };
}

// Every skill the sync can deliver: defaults, groups and repository entries,
// with each `@group` reference expanded wherever it appears.
export function managedSkills(config) {
  const groups = config.groups ?? {};
  const names = new Set();
  const add = (list) => {
    for (const item of list) {
      if (item.startsWith("@")) {
        assert.ok(groups[item.slice(1)], `unknown group ${item}`);
        add(groups[item.slice(1)]);
      } else {
        names.add(item);
      }
    }
  };
  add(config.defaults ?? []);
  for (const list of Object.values(groups)) add(list);
  for (const list of Object.values(config.repos ?? {})) add(list);
  return [...names].sort();
}

test("managed skills hold no Go source or module files", async () => {
  const config = JSON.parse(await readFile(path.join(root, ".github/skills-sync.json"), "utf8"));
  const names = managedSkills(config);
  assert.ok(names.length >= 20, `expected at least 20 managed skills, got ${names.length}`);
  let files = 0;
  const offenders = [];
  for (const name of names) {
    const dir = path.join(root, ".agents/skills", name);
    const info = await stat(dir).catch(() => null);
    assert.ok(info?.isDirectory(), `managed skill directory missing: .agents/skills/${name}`);
    const result = await findGoFiles(dir);
    files += result.checked;
    offenders.push(...result.found.map((f) => path.relative(root, f)));
  }
  assert.ok(files > 0, "the walk checked no files");
  console.log(`managed-skills-go-free: ${names.length} skills, ${files} files checked`);
  assert.deepEqual(offenders, [], `Go files in managed skills:\n${offenders.join("\n")}`);
});

test("findGoFiles finds .go and go.mod files and ignores .md files", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "go-free-"));
  try {
    await mkdir(path.join(dir, "sub"));
    await writeFile(path.join(dir, "sub", "a.go"), "package a\n");
    await writeFile(path.join(dir, "go.mod"), "module x\n");
    await writeFile(path.join(dir, "notes.md"), "# n\n");
    const { found, checked } = await findGoFiles(dir);
    assert.equal(checked, 3);
    assert.deepEqual(
      found.map((f) => path.relative(dir, f)).sort(),
      ["go.mod", path.join("sub", "a.go")],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("managedSkills expands @group references in defaults and repos", () => {
  const names = managedSkills({
    defaults: ["base", "@go"],
    groups: { go: ["golang-cli"], extra: ["frostyard-x"] },
    repos: { a: ["@extra"], b: ["only-b"], c: [] },
  });
  assert.deepEqual(names, ["base", "frostyard-x", "golang-cli", "only-b"]);
  assert.ok(!names.some((n) => n.startsWith("@")));
});
