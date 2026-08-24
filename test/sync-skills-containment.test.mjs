import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const libPath = path.join(repoRoot, "scripts/lib/skills-sync-containment.sh");

test("rejects an escaping .agents symlink without touching the outside sentinel", async () => {
  const { dir, coreRoot, outside } = await createFixture();
  await writeFile(path.join(outside, "sentinel"), "untouched\n");
  await symlink(outside, path.join(dir, ".agents"), "dir");

  await assert.rejects(
    runSyncRepo(dir, coreRoot, ["example"]),
    (error) => error.stderr.includes(".agents/skills root escapes the cloned repository root"),
  );
  assert.deepEqual(await readdir(outside), ["sentinel"]);
});

test("rejects an escaping existing managed-skill destination symlink without touching the outside sentinel", async () => {
  const { dir, coreRoot, outside } = await createFixture();
  await writeFile(path.join(outside, "sentinel"), "untouched\n");
  await mkdir(path.join(dir, ".agents/skills"), { recursive: true });
  await symlink(outside, path.join(dir, ".agents/skills/example"), "dir");

  await assert.rejects(
    runSyncRepo(dir, coreRoot, ["example"]),
    (error) =>
      error.stderr.includes(
        "managed-skill destination 'example' escapes the cloned repository root",
      ),
  );
  assert.deepEqual(await readdir(outside), ["sentinel"]);
});

test("rejects an in-clone .agents/skills symlink that resolves to the clone root itself", async () => {
  const { dir, coreRoot } = await createFixture();
  await mkdir(path.join(dir, ".agents"), { recursive: true });
  await symlink("..", path.join(dir, ".agents/skills"), "dir");

  await assert.rejects(
    runSyncRepo(dir, coreRoot, ["example"]),
    (error) => error.stderr.includes(".agents/skills root escapes the cloned repository root"),
  );
  assert.deepEqual(await readdir(dir), [".agents"]);
});

test("rejects a later escaping destination without mutating an earlier valid one", async () => {
  const { dir, coreRoot, outside } = await createFixture();
  await mkdir(path.join(coreRoot, ".agents/skills/second"), { recursive: true });
  await writeFile(path.join(coreRoot, ".agents/skills/second/SKILL.md"), "# Second\n");
  await writeFile(path.join(outside, "sentinel"), "untouched\n");
  await mkdir(path.join(dir, ".agents/skills"), { recursive: true });
  await symlink(outside, path.join(dir, ".agents/skills/second"), "dir");

  await assert.rejects(
    runSyncRepo(dir, coreRoot, ["example", "second"]),
    (error) =>
      error.stderr.includes(
        "managed-skill destination 'second' escapes the cloned repository root",
      ),
  );
  assert.deepEqual(await readdir(outside), ["sentinel"]);
  await assert.rejects(readdir(path.join(dir, ".agents/skills/example")));
});

test("syncs a skill into a normal .agents directory", async () => {
  const { dir, coreRoot } = await createFixture();

  await runSyncRepo(dir, coreRoot, ["example"]);

  const marker = await readFile(
    path.join(dir, ".agents/skills/example/.synced-from-core"),
    "utf8",
  );
  assert.match(marker, /Managed by frostyard\/core/);
  const synced = await readFile(
    path.join(dir, ".agents/skills/example/SKILL.md"),
    "utf8",
  );
  assert.equal(synced, "# Example\n");
});

test("syncs a skill through an in-repository .agents -> docs/agents symlink", async () => {
  const { dir, coreRoot } = await createFixture();
  await mkdir(path.join(dir, "docs/agents"), { recursive: true });
  await symlink("docs/agents", path.join(dir, ".agents"), "dir");

  await runSyncRepo(dir, coreRoot, ["example"]);

  const marker = await readFile(
    path.join(dir, "docs/agents/skills/example/.synced-from-core"),
    "utf8",
  );
  assert.match(marker, /Managed by frostyard\/core/);
});

async function createFixture() {
  const base = await mkdtemp(path.join(os.tmpdir(), "sync-skills-containment-"));
  const dir = path.join(base, "clone");
  const coreRoot = path.join(base, "core");
  const outside = path.join(base, "outside");
  await mkdir(dir, { recursive: true });
  await mkdir(path.join(coreRoot, ".agents/skills/example"), { recursive: true });
  await writeFile(path.join(coreRoot, ".agents/skills/example/SKILL.md"), "# Example\n");
  await mkdir(outside, { recursive: true });
  return { dir, coreRoot, outside };
}

function runSyncRepo(dir, coreRoot, skills) {
  const harness = 'lib="$1"; dir="$2"; core_root="$3"; shift 3; source "$lib"; skills_sync_sync_repo "$dir" "$core_root" "$@"';
  return execFileAsync("bash", [
    "-c",
    harness,
    "sync-skills-containment-test",
    libPath,
    dir,
    coreRoot,
    ...skills,
  ]);
}
