import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("bash syntax gate passes on the repository's current tracked scripts", async () => {
  const root = await createFixture();
  for (const name of await readdir(path.join(repoRoot, "scripts"))) {
    if (name.endsWith(".sh")) {
      await copyFile(
        path.join(repoRoot, "scripts", name),
        path.join(root, "scripts", name),
      );
    }
  }
  await track(root);

  const { stdout } = await runScriptsGate(root);
  assert.match(stdout, /ok {3}bash_syntax: 3\/3/);
});

test("bash syntax gate fails a tracked script with invalid Bash syntax", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, "scripts/broken.sh"),
    "#!/usr/bin/env bash\nif [ -z \"$1\" ]; then\n  echo missing\n",
  );
  await track(root);

  await assert.rejects(
    runScriptsGate(root),
    (error) => error.stderr.includes("FAIL syntax: scripts/broken.sh"),
  );
});

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "core-scripts-gate-"));
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await copyFile(
    path.join(repoRoot, "scripts/check-scripts.mjs"),
    path.join(root, "scripts/check-scripts.mjs"),
  );
  await execFileAsync("git", ["init", "--quiet"], { cwd: root });
  return root;
}

async function track(root) {
  await execFileAsync("git", ["add", "-A"], { cwd: root });
}

function runScriptsGate(root) {
  return execFileAsync(process.execPath, [
    path.join(root, "scripts/check-scripts.mjs"),
  ], { cwd: root });
}
