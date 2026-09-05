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

// Every stub below records whether GH_TOKEN was present in its own
// environment — the string "present" or "absent" and nothing else. The
// value is never written, so the log these tests read back can never hold
// a credential even if the scoping under test regresses.
const TOKEN_PROBE = `token_probe() {
  if [ -n "\${GH_TOKEN:-}" ]; then
    printf 'token %s present\\n' "$1" >> "$SYNC_TEST_LOG"
  else
    printf 'token %s absent\\n' "$1" >> "$SYNC_TEST_LOG"
  fi
}`;

// Stub `git` and `gh` so these tests never touch the network or GitHub:
// every subcommand that would otherwise reach github.com (clone, push, pr
// list/create) is faked and logged; every other subcommand (init, add,
// diff, checkout, commit) runs the real git binary against the local
// scratch clone so the function's real control flow is exercised.
const GIT_STUB = `#!/usr/bin/env bash
set -euo pipefail
${TOKEN_PROBE}
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
token_probe "git $subcmd"
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
${TOKEN_PROBE}
token_probe "gh $1-$2"
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

// The sync copy path. Always shimmed so its environment is recorded, then
// delegated to the real rsync when the machine has one (a `real-rsync`
// symlink is installed beside this stub); a sandbox without rsync falls
// back to a minimal implementation covering exactly the `rsync -a --delete
// <src>/ <dst>/` shape scripts/lib/skills-sync-containment.sh invokes, so
// these tests stay runnable either way.
const RSYNC_STUB = `#!/usr/bin/env bash
set -euo pipefail
${TOKEN_PROBE}
token_probe rsync
if command -v real-rsync >/dev/null 2>&1; then
  exec real-rsync "$@"
fi
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

// A second unauthenticated local helper: skills_sync_run_repo and the
// containment checks both canonicalize paths with it.
const REALPATH_STUB = `#!/usr/bin/env bash
set -euo pipefail
${TOKEN_PROBE}
token_probe realpath
exec real-realpath "$@"
`;

function probedPassthroughStub(label, target) {
  return `#!/usr/bin/env bash
set -euo pipefail
${TOKEN_PROBE}
token_probe ${label}
exec ${target} "$@"
`;
}

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

// Least privilege at the subprocess boundary: the ORG_PAT is org-wide and
// write-capable, so only the four calls that authenticate to GitHub may
// see it. Everything else the sync runs — the local git commands against
// the temporary clone, and the copy path that mirrors skills into it —
// must run with no GH_TOKEN in its environment at all.
test("supplies GH_TOKEN only to the subprocesses that authenticate to GitHub", async () => {
  const { env, log, coreRoot } = await setupFixture();

  await runRepo(env, ["example-repo", coreRoot, "chore/sync", "abc123", "bot", "bot@example.invalid", "example"]);

  const probes = await readTokenProbes(log);
  assert.deepEqual(
    probes.filter(([, state]) => state === "present").map(([label]) => label).sort(),
    ["gh pr-create", "gh pr-list", "git clone", "git push"],
    `unexpected set of token-bearing subprocesses in:\n${probes.map((p) => p.join(" ")).join("\n")}`,
  );

  // Assert positively on the local work too, so a future refactor that
  // simply stopped running these commands could not silently pass above.
  for (const label of ["git add", "git diff", "git checkout", "git commit", "mktemp", "rsync", "realpath"]) {
    assert.deepEqual(
      probes.filter(([name]) => name === label).map(([, state]) => state).at(0),
      "absent",
      `expected ${label} to run without GH_TOKEN, probes:\n${probes.map((p) => p.join(" ")).join("\n")}`,
    );
  }

  const logText = await readFile(log, "utf8");
  assert.doesNotMatch(logText, new RegExp(FAKE_TOKEN));
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

  await writeFile(path.join(binDir, "rsync"), RSYNC_STUB);
  await chmod(path.join(binDir, "rsync"), 0o755);
  if (await hasCommand("rsync")) {
    await execFileAsync("ln", ["-s", await which("rsync"), path.join(binDir, "real-rsync")]);
  }

  await writeFile(path.join(binDir, "realpath"), REALPATH_STUB);
  await chmod(path.join(binDir, "realpath"), 0o755);
  await execFileAsync("ln", ["-s", await which("realpath"), path.join(binDir, "real-realpath")]);

  for (const command of ["dirname", "mktemp"]) {
    const target = `real-${command}`;
    await writeFile(path.join(binDir, command), probedPassthroughStub(command, target));
    await chmod(path.join(binDir, command), 0o755);
    await execFileAsync("ln", ["-s", await which(command), path.join(binDir, target)]);
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

// Returns [label, "present" | "absent"] for every `token <label> <state>`
// line the stubs recorded, in invocation order.
async function readTokenProbes(log) {
  const text = await readFile(log, "utf8");
  return text
    .split("\n")
    .filter((line) => line.startsWith("token "))
    .map((line) => {
      const rest = line.slice("token ".length);
      const cut = rest.lastIndexOf(" ");
      return [rest.slice(0, cut), rest.slice(cut + 1)];
    });
}

async function assertCloneDirRemoved(logText) {
  const match = logText.match(/git .*clone --quiet --depth 1 \S+ (\S+)/);
  assert.ok(match, `expected a clone invocation in log:\n${logText}`);
  const dir = match[1];
  await assert.rejects(access(dir), `expected ${dir} to have been removed`);
}
