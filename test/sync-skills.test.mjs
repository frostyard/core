import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(repoRoot, "scripts/sync-skills.sh");

// Stubs `git clone`/`gh` so the script under test performs no network access
// and needs no real GH_TOKEN: a fake `git` on PATH redirects the script's
// `https://.../frostyard/<repo>.git` clone URL to a local bare fixture repo
// (every other git subcommand passes through to the real binary), and a
// fake `gh` records `pr list`/`pr create` invocations and answers them from
// a fixture-controlled, no-existing-PR response. The script clones and
// pushes as `git -c credential.helper=<helper> <subcommand> ...`
// (scripts/lib/skills-sync-auth.sh), so the shim locates the subcommand by
// skipping `-c <value>` pairs rather than reading `$1`, and the push it
// forwards lands in the same local bare repo the clone was redirected to.
test("an up-to-date consumer performs no push or pull-request creation", async () => {
  const fixture = await createFixture();
  await seedConsumerRemote(fixture.remotesDir, "consumer", {
    "README.md": "seed\n",
    ".agents/skills/demo/SKILL.md": "# Demo\n",
    ".agents/skills/demo/.synced-from-core": syncedMarker("demo"),
  });

  const { stdout } = await runSync(fixture);

  assert.match(stdout, /consumer: up to date/);
  const invocations = await readLog(fixture.log);
  assert.equal(invocations.some((line) => line.startsWith("git push")), false);
  assert.equal(invocations.some((line) => line.startsWith("gh ")), false);
});

test("a changed managed skill follows the sync branch and pull-request path", async () => {
  const fixture = await createFixture();
  await seedConsumerRemote(fixture.remotesDir, "consumer", { "README.md": "seed\n" });

  const { stdout } = await runSync(fixture);

  assert.match(stdout, /consumer: synced/);
  const invocations = await readLog(fixture.log);
  assert.ok(
    invocations.some((line) => /^git (-c \S.* )?push -qf origin chore\/sync-core-skills$/.test(line)),
    `expected a push of chore/sync-core-skills, got: ${invocations.join("\n")}`,
  );
  assert.ok(
    invocations.some(
      (line) =>
        line.startsWith("gh pr list ") &&
        line.includes("--repo frostyard/consumer") &&
        line.includes("--head chore/sync-core-skills"),
    ),
    `expected a pr list against the sync branch, got: ${invocations.join("\n")}`,
  );
  assert.ok(
    invocations.some(
      (line) =>
        line.startsWith("gh pr create ") &&
        line.includes("--repo frostyard/consumer") &&
        line.includes("--head chore/sync-core-skills") &&
        line.includes("chore: sync agent skills from frostyard/core"),
    ),
    `expected a pr create for the sync branch, got: ${invocations.join("\n")}`,
  );

  const pushed = await mkdtemp(path.join(os.tmpdir(), "sync-skills-verify-"));
  await execFileAsync("git", [
    "clone",
    "--quiet",
    "--branch",
    "chore/sync-core-skills",
    path.join(fixture.remotesDir, "consumer.git"),
    pushed,
  ]);
  const synced = await readFile(path.join(pushed, ".agents/skills/demo/SKILL.md"), "utf8");
  assert.equal(synced, "# Demo\n");
  const marker = await readFile(
    path.join(pushed, ".agents/skills/demo/.synced-from-core"),
    "utf8",
  );
  assert.equal(marker, syncedMarker("demo"));
});

function syncedMarker(skill) {
  return `Managed by frostyard/core — edit there, not here (ADR-0026).\nSource: https://github.com/frostyard/core/tree/main/.agents/skills/${skill}\n`;
}

async function readLog(log) {
  try {
    return (await readFile(log, "utf8")).split("\n").filter(Boolean);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function createFixture() {
  const base = await mkdtemp(path.join(os.tmpdir(), "sync-skills-test-"));
  const coreRepo = path.join(base, "core");
  const remotesDir = path.join(base, "remotes");
  const log = path.join(base, "invocations.log");
  await mkdir(coreRepo, { recursive: true });
  await mkdir(remotesDir, { recursive: true });

  await mkdir(path.join(coreRepo, ".github"), { recursive: true });
  await mkdir(path.join(coreRepo, ".agents/skills/demo"), { recursive: true });
  await writeFile(path.join(coreRepo, ".agents/skills/demo/SKILL.md"), "# Demo\n");
  await writeFile(
    path.join(coreRepo, ".github/skills-sync.json"),
    JSON.stringify({ defaults: ["demo"], repos: { consumer: [] } }, null, 2) + "\n",
  );
  await gitInit(coreRepo);
  await execFileAsync("git", ["add", "-A"], { cwd: coreRepo });
  await execFileAsync("git", ["commit", "--quiet", "-m", "seed core"], { cwd: coreRepo });

  const { fakeBin, realGit } = await writeFakeBinaries(base);
  return { coreRepo, remotesDir, log, fakeBin, realGit };
}

async function gitInit(dir) {
  await execFileAsync("git", ["init", "--quiet", "-b", "main"], { cwd: dir });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  await execFileAsync("git", ["config", "user.name", "Sync Skills Test"], { cwd: dir });
}

async function seedConsumerRemote(remotesDir, name, files) {
  const bareDir = path.join(remotesDir, `${name}.git`);
  await execFileAsync("git", ["init", "--quiet", "--bare", "-b", "main", bareDir]);

  const working = await mkdtemp(path.join(os.tmpdir(), `sync-skills-seed-${name}-`));
  await gitInit(working);
  for (const [relPath, content] of Object.entries(files)) {
    const filePath = path.join(working, relPath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }
  await execFileAsync("git", ["add", "-A"], { cwd: working });
  await execFileAsync("git", ["commit", "--quiet", "-m", "seed consumer"], { cwd: working });
  await execFileAsync("git", ["remote", "add", "origin", bareDir], { cwd: working });
  await execFileAsync("git", ["push", "--quiet", "origin", "main"], { cwd: working });
}

async function writeFakeBinaries(base) {
  const fakeBin = path.join(base, "fake-bin");
  await mkdir(fakeBin, { recursive: true });
  const { stdout: realGit } = await execFileAsync("which", ["git"]);

  await writeFile(
    path.join(fakeBin, "git"),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'git %s\\n' "$*" >> "\${SYNC_SKILLS_TEST_LOG}"
real_git="\${SYNC_SKILLS_TEST_REAL_GIT}"
# Find the subcommand without consuming argv: the script under test runs
# clone/push as \`git -c credential.helper=... <subcommand> ...\`, so the
# subcommand is the first argument that is neither a flag nor a -c value.
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
if [ "$subcmd" = "clone" ]; then
  # Redirect the github.com URL to the local bare fixture for that repo;
  # every other argument (flags, credential helper, destination) is kept.
  args=()
  for arg in "$@"; do
    case "$arg" in
      https://github.com/frostyard/*.git)
        repo="\${arg#https://github.com/frostyard/}"
        repo="\${repo%.git}"
        args+=("\${SYNC_SKILLS_TEST_REMOTES_DIR}/\${repo}.git")
        ;;
      *) args+=("$arg") ;;
    esac
  done
  exec "$real_git" "\${args[@]}"
fi
exec "$real_git" "$@"
`,
  );
  await chmod(path.join(fakeBin, "git"), 0o755);

  await writeFile(
    path.join(fakeBin, "gh"),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'gh %s\\n' "$*" >> "\${SYNC_SKILLS_TEST_LOG}"
if [ "\${1:-}" = "pr" ] && [ "\${2:-}" = "list" ]; then
  printf '%s' "\${SYNC_SKILLS_TEST_GH_PR_LIST_OUTPUT:-}"
  exit 0
fi
if [ "\${1:-}" = "pr" ] && [ "\${2:-}" = "create" ]; then
  echo "https://github.com/example/consumer/pull/1"
  exit 0
fi
echo "unstubbed gh invocation: $*" >&2
exit 1
`,
  );
  await chmod(path.join(fakeBin, "gh"), 0o755);

  // scripts/lib/skills-sync-containment.sh shells out to `rsync -a
  // --delete`. Real CI (ubuntu-latest) and most dev machines have it; a
  // sandbox that doesn't gets a minimal fallback covering exactly that
  // invocation shape, so these tests stay runnable without a real rsync.
  if (!(await hasCommand("rsync"))) {
    await writeFile(
      path.join(fakeBin, "rsync"),
      `#!/usr/bin/env bash
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
`,
    );
    await chmod(path.join(fakeBin, "rsync"), 0o755);
  }

  return { fakeBin, realGit: realGit.trim() };
}

async function hasCommand(cmd) {
  try {
    await execFileAsync("bash", ["-c", 'command -v "$1"', "has-command", cmd]);
    return true;
  } catch {
    return false;
  }
}

async function runSync({ coreRepo, remotesDir, log, fakeBin, realGit }) {
  return execFileAsync("bash", [scriptPath], {
    cwd: coreRepo,
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      GH_TOKEN: "sync-skills-test-token",
      SYNC_SKILLS_TEST_LOG: log,
      SYNC_SKILLS_TEST_REAL_GIT: realGit,
      SYNC_SKILLS_TEST_REMOTES_DIR: remotesDir,
    },
  });
}
