import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoLibPath = path.join(repoRoot, "scripts/lib/skills-sync-repo.sh");

const FAKE_TOKEN = "fake-test-token-do-not-use-1234567890";

// Stub `git` and `gh` so these tests never touch the network or GitHub:
// every subcommand that would otherwise reach github.com (clone, push, pr
// list/create) is faked and logged; every other subcommand (init, add,
// diff, checkout, commit) runs the real git binary against the local
// scratch clone so the function's real control flow is exercised.
const GIT_STUB = `#!/usr/bin/env bash
set -euo pipefail
printf 'git %s\\n' "$*" >> "$SYNC_TEST_LOG"
dest="\${!#}"
# Find the subcommand without consuming argv — "$@" must reach real-git
# intact below, and a commit call carries two -c flags, not one.
subcmd=""
skip_next=0
for arg in "$@"; do
  if [ "$skip_next" = 1 ]; then
    skip_next=0
    continue
  fi
  case "$arg" in
    -c) skip_next=1 ;;
    -*) ;;
    *) subcmd="$arg"; break ;;
  esac
done
case "$subcmd" in
  clone)
    if [ -n "\${SYNC_TEST_CLONE_FAIL:-}" ]; then
      echo "stub: simulated clone failure" >&2
      exit 1
    fi
    real-git init -q "$dest"
    if [ -n "\${SYNC_TEST_ESCAPE_TARGET:-}" ]; then
      ln -s "$SYNC_TEST_ESCAPE_TARGET" "$dest/.agents"
    fi
    ;;
  push)
    if [ -n "\${SYNC_TEST_PUSH_FAIL:-}" ]; then
      echo "stub: simulated push failure" >&2
      exit 1
    fi
    ;;
  *)
    exec real-git "$@"
    ;;
esac
`;

const GH_STUB = `#!/usr/bin/env bash
set -euo pipefail
printf 'gh %s\\n' "$*" >> "$SYNC_TEST_LOG"
case "$1 $2" in
  "pr list")
    echo ""
    ;;
  "pr create")
    echo "https://github.com/frostyard/stub/pull/1"
    ;;
esac
`;

const RSYNC_FALLBACK = `#!/usr/bin/env bash
set -euo pipefail
src=""
dst=""
for arg in "$@"; do
  case "$arg" in
    -*) ;;
    *) if [ -z "$src" ]; then src="$arg"; else dst="$arg"; fi ;;
  esac
done
mkdir -p "$dst"
find "$dst" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -a "\${src%/}/." "$dst"
`;

test("removes the clone directory and never leaks the token on a successful sync", async () => {
  const { env, log, coreRoot } = await setupFixture();

  const { stdout } = await runRepo(env, ["example-repo", coreRoot, "chore/sync", "abc123", "bot", "bot@example.invalid", "example"]);

  assert.match(stdout, /== example-repo: synced/);
  const logText = await readFile(log, "utf8");
  assert.doesNotMatch(logText, new RegExp(FAKE_TOKEN));
  assert.match(logText, /git -c credential\.helper=.*clone --quiet --depth 1 https:\/\/github\.com\/frostyard\/example-repo\.git/);
  assert.match(logText, /gh pr create/);
  await assertCloneDirRemoved(logText);
});

test("removes the clone directory when the clone fails", async () => {
  const { env, log, coreRoot } = await setupFixture();
  env.SYNC_TEST_CLONE_FAIL = "1";

  await assert.rejects(
    runRepo(env, ["example-repo", coreRoot, "chore/sync", "abc123", "bot", "bot@example.invalid", "example"]),
    (error) => error.code === 1 && /clone failed for frostyard\/example-repo/.test(error.stderr),
  );
  const logText = await readFile(log, "utf8");
  await assertCloneDirRemoved(logText);
});

test("removes the clone directory when the push fails", async () => {
  const { env, log, coreRoot } = await setupFixture();
  env.SYNC_TEST_PUSH_FAIL = "1";

  await assert.rejects(
    runRepo(env, ["example-repo", coreRoot, "chore/sync", "abc123", "bot", "bot@example.invalid", "example"]),
    (error) => error.code === 1 && /sync failed for frostyard\/example-repo/.test(error.stderr),
  );
  const logText = await readFile(log, "utf8");
  assert.match(logText, /git .*push -qf origin chore\/sync/);
  await assertCloneDirRemoved(logText);
});

test("removes the clone directory when an unknown skill is named", async () => {
  const { env, log, coreRoot } = await setupFixture();

  await assert.rejects(
    runRepo(env, ["example-repo", coreRoot, "chore/sync", "abc123", "bot", "bot@example.invalid", "not-a-real-skill"]),
    (error) => error.code === 2 && /unknown skill 'not-a-real-skill'/.test(error.stderr),
  );
  const logText = await readFile(log, "utf8");
  await assertCloneDirRemoved(logText);
});

test("removes the clone directory when the mirrored tree escapes containment", async () => {
  const { env, log, coreRoot, outside } = await setupFixture();
  env.SYNC_TEST_ESCAPE_TARGET = outside;

  await assert.rejects(
    runRepo(env, ["example-repo", coreRoot, "chore/sync", "abc123", "bot", "bot@example.invalid", "example"]),
    (error) => error.code === 1 && /sync failed for frostyard\/example-repo/.test(error.stderr),
  );
  const logText = await readFile(log, "utf8");
  await assertCloneDirRemoved(logText);
});

async function setupFixture() {
  const base = await mkdtemp(path.join(os.tmpdir(), "sync-skills-run-repo-"));
  const binDir = path.join(base, "bin");
  const coreRoot = path.join(base, "core");
  const outside = path.join(base, "outside");
  const log = path.join(base, "log.txt");

  await mkdir(binDir, { recursive: true });
  await mkdir(path.join(coreRoot, ".agents/skills/example"), { recursive: true });
  await writeFile(path.join(coreRoot, ".agents/skills/example/SKILL.md"), "# Example\n");
  await mkdir(outside, { recursive: true });
  await writeFile(log, "");

  await writeFile(path.join(binDir, "git"), GIT_STUB);
  await writeFile(path.join(binDir, "gh"), GH_STUB);
  await chmod(path.join(binDir, "git"), 0o755);
  await chmod(path.join(binDir, "gh"), 0o755);
  await execFileAsync("ln", ["-s", await which("git"), path.join(binDir, "real-git")]);

  // scripts/lib/skills-sync-containment.sh shells out to `rsync -a
  // --delete`. Real CI (ubuntu-latest) and most dev machines have it; a
  // sandbox that doesn't gets a minimal fallback covering exactly that
  // invocation shape, so these tests stay runnable without a real rsync.
  if (!(await hasCommand("rsync"))) {
    await writeFile(path.join(binDir, "rsync"), RSYNC_FALLBACK);
    await chmod(path.join(binDir, "rsync"), 0o755);
  }

  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH}`,
    GH_TOKEN: FAKE_TOKEN,
    SYNC_TEST_LOG: log,
  };
  return { env, log, coreRoot, outside };
}

async function hasCommand(cmd) {
  try {
    await which(cmd);
    return true;
  } catch {
    return false;
  }
}

async function which(cmd) {
  const { stdout } = await execFileAsync("command", ["-v", cmd], { shell: "/bin/bash" });
  return stdout.trim();
}

function runRepo(env, args) {
  const harness = `set -uo pipefail; source "${repoLibPath}"; skills_sync_run_repo "$@"`;
  return new Promise((resolve, reject) => {
    execFile(
      "bash",
      ["-c", harness, "sync-skills-run-repo-test", ...args],
      { env },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      },
    );
  });
}

async function assertCloneDirRemoved(logText) {
  const match = logText.match(/git .*clone --quiet --depth 1 \S+ (\S+)/);
  assert.ok(match, `expected a clone invocation in log:\n${logText}`);
  const dir = match[1];
  await assert.rejects(access(dir), `expected ${dir} to have been removed`);
}
