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
  assert.equal(invocations.some((line) => isGitSubcommand(line, "push")), false);
  assert.equal(invocations.some((line) => line.startsWith("gh ")), false);
});

test("a changed managed skill follows the sync branch and pull-request path", async () => {
  const fixture = await createFixture();
  await seedConsumerRemote(fixture.remotesDir, "consumer", { "README.md": "seed\n" });

  const { stdout } = await runSync(fixture);

  assert.match(stdout, /consumer: synced/);
  const invocations = await readLog(fixture.log);
  assert.ok(
    invocations.some(
      (line) => isGitSubcommand(line, "push") && line.includes("chore/sync-core-skills"),
    ),
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

  const pushed = await cloneSyncBranch(fixture);
  const synced = await readFile(path.join(pushed, ".agents/skills/demo/SKILL.md"), "utf8");
  assert.equal(synced, "# Demo\n");
  const marker = await readFile(
    path.join(pushed, ".agents/skills/demo/.synced-from-core"),
    "utf8",
  );
  assert.equal(marker, syncedMarker("demo"));
});

// A repository entry (or `defaults`) may name a group as "@<name>"; the script
// replaces it with that group's skills before it syncs anything.
test("a repository entry naming a group syncs every skill in the group", async () => {
  const fixture = await createFixture({
    repos: { consumer: ["@go"] },
    groups: { go: ["demo", "extra"] },
    extraSkills: ["extra"],
  });
  await seedConsumerRemote(fixture.remotesDir, "consumer", { "README.md": "seed\n" });

  const { stdout } = await runSync(fixture);

  assert.match(stdout, /consumer: synced/);
  const pushed = await cloneSyncBranch(fixture);
  for (const skill of ["demo", "extra"]) {
    const synced = await readFile(
      path.join(pushed, `.agents/skills/${skill}/SKILL.md`),
      "utf8",
    );
    assert.equal(synced, coreSkillContent(skill));
    const marker = await readFile(
      path.join(pushed, `.agents/skills/${skill}/.synced-from-core`),
      "utf8",
    );
    assert.equal(marker, syncedMarker(skill));
  }
});

// Every repository's groups resolve before the first clone, so an unknown
// group stops the run with no clone, push or PR.
test("a repository entry naming an unknown group fails the run before any clone", async () => {
  // "consumer" sorts before "later": every repository resolves before the
  // first clone, so the valid one is not synced either.
  const fixture = await createFixture({ repos: { consumer: [], later: ["@missing"] } });
  await seedConsumerRemote(fixture.remotesDir, "consumer", { "README.md": "seed\n" });
  await seedConsumerRemote(fixture.remotesDir, "later", { "README.md": "seed\n" });

  await assert.rejects(runSync(fixture), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /unknown skill group '@missing'/);
    assert.match(error.stderr, /::error::cannot resolve the skills for frostyard\/later/);
    return true;
  });

  const invocations = await readLog(fixture.log);
  assert.equal(
    invocations.some((line) => isGitSubcommand(line, "clone")),
    false,
    `expected no clone, got: ${invocations.join("\n")}`,
  );
  assert.equal(invocations.some((line) => isGitSubcommand(line, "push")), false);
  assert.equal(invocations.some((line) => isGitSubcommand(line, "add")), false);
  assert.equal(invocations.some((line) => line.startsWith("gh ")), false);
});

// An empty effective list must reach the sync as no arguments at all: one
// empty string would resolve to the whole .agents/skills tree and mirror it.
test("an empty effective skill list syncs nothing and leaves the consumer alone", async () => {
  const fixture = await createFixture({ defaults: [], repos: { consumer: [] } });
  await seedConsumerRemote(fixture.remotesDir, "consumer", { "README.md": "seed\n" });

  const { stdout } = await runSync(fixture);

  assert.match(stdout, /consumer: up to date/);
  assert.doesNotMatch(stdout, /consumer: synced/);
  const invocations = await readLog(fixture.log);
  assert.equal(invocations.some((line) => isGitSubcommand(line, "clone")), false);
  assert.equal(invocations.some((line) => isGitSubcommand(line, "push")), false);
  assert.equal(invocations.some((line) => line.startsWith("gh ")), false);
  // No marker file can exist: the sync never mirrored anything, so no sync
  // branch was pushed and the fixture has none to clone.
  await assert.rejects(cloneSyncBranch(fixture));
});

// `defaults` may name a group too, not only a repository entry.
test("a group in defaults syncs every skill in the group", async () => {
  const fixture = await createFixture({
    defaults: ["@go"],
    repos: { consumer: [] },
    groups: { go: ["demo", "extra"] },
    extraSkills: ["extra"],
  });
  await seedConsumerRemote(fixture.remotesDir, "consumer", { "README.md": "seed\n" });

  const { stdout } = await runSync(fixture);

  assert.match(stdout, /consumer: synced/);
  const pushed = await cloneSyncBranch(fixture);
  for (const skill of ["demo", "extra"]) {
    const synced = await readFile(
      path.join(pushed, `.agents/skills/${skill}/SKILL.md`),
      "utf8",
    );
    assert.equal(synced, coreSkillContent(skill));
    const marker = await readFile(
      path.join(pushed, `.agents/skills/${skill}/.synced-from-core`),
      "utf8",
    );
    assert.equal(marker, syncedMarker(skill));
  }
});

// The config shape is validated before any skill is resolved and before the
// first clone, and each problem names itself instead of showing a jq status.
for (const { name, options } of [
  {
    name: "that is not JSON",
    options: { rawConfig: '{ "defaults": ["demo"], "repos": { "consumer": [] }\n' },
  },
  { name: "that is empty", options: { rawConfig: "" } },
  {
    name: "that holds 2 JSON documents",
    options: {
      rawConfig:
        '{ "defaults": ["demo"], "repos": { "consumer": [] } }\n' +
        '{ "defaults": ["demo"], "repos": { "consumer": [] } }\n',
    },
  },
  { name: "whose group is not an array", options: { groups: { go: "demo" } } },
  {
    name: "whose group names another group",
    options: { groups: { go: ["demo", "@other"] } },
  },
  {
    name: "whose repository entry is not an array",
    options: { repos: { consumer: "demo" } },
  },
]) {
  test(`a config ${name} fails the run before any clone`, async () => {
    const fixture = await createFixture(options);
    await seedConsumerRemote(fixture.remotesDir, "consumer", { "README.md": "seed\n" });

    await assert.rejects(runSync(fixture), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /::error::/);
      // The preflight reports the problem itself, never jq's own message.
      assert.doesNotMatch(error.stderr, /jq: error/);
      return true;
    });

    const invocations = await readLog(fixture.log);
    assert.equal(
      invocations.some((line) => isGitSubcommand(line, "clone")),
      false,
      `expected no clone, got: ${invocations.join("\n")}`,
    );
    assert.equal(invocations.some((line) => isGitSubcommand(line, "push")), false);
    assert.equal(invocations.some((line) => line.startsWith("gh ")), false);
  });
}

// sync-skills.sh calls skills_sync_run_repo as an `if` condition, and bash
// ignores `set -e` for every command run inside a function in that
// context — subshells that set -e again included. These tests drive the
// real entry point, not the bare function, so a git/gh failure that only
// `set -e` would catch shows up here as a green run.
for (const { name, env, step } of [
  { name: "staged-diff check", env: { SYNC_SKILLS_TEST_DIFF_FAIL: "1" }, step: "diff --cached --quiet" },
  { name: "push", env: { SYNC_SKILLS_TEST_PUSH_FAIL: "1" }, step: "push" },
  { name: "pull-request list", env: { SYNC_SKILLS_TEST_GH_LIST_FAIL: "1" }, step: "gh pr list" },
  { name: "pull-request create", env: { SYNC_SKILLS_TEST_GH_CREATE_FAIL: "1" }, step: "gh pr create" },
]) {
  test(`a failed ${name} fails the run and does not report the consumer synced`, async () => {
    const fixture = await createFixture({ repos: { consumer: [], later: [] } });
    await seedConsumerRemote(fixture.remotesDir, "consumer", { "README.md": "seed\n" });
    await seedConsumerRemote(fixture.remotesDir, "later", { "README.md": "seed\n" });

    await assert.rejects(runSync(fixture, { ...env, SYNC_SKILLS_TEST_FAIL_REPO: "consumer" }), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /::error::sync failed for frostyard\/consumer/);
      assert.doesNotMatch(error.stdout, /consumer: synced/);
      assert.doesNotMatch(error.stdout, /consumer: PR #/);
      // A per-repository failure is recoverable: later consumers still run.
      assert.match(error.stdout, /later: synced/);
      return true;
    });
    const invocations = await readLog(fixture.log);
    assert.ok(
      invocations.some((line) => line.includes(step)),
      `expected the failing ${step} to run, got: ${invocations.join("\n")}`,
    );
  });
}

test("a failed skill copy fails the run before anything is staged or pushed", async () => {
  const fixture = await createFixture();
  await seedConsumerRemote(fixture.remotesDir, "consumer", { "README.md": "seed\n" });
  const failBin = await mkdtemp(path.join(os.tmpdir(), "sync-skills-failbin-"));
  await writeFile(
    path.join(failBin, "rsync"),
    '#!/usr/bin/env bash\necho "stub: simulated rsync failure" >&2\nexit 23\n',
  );
  await chmod(path.join(failBin, "rsync"), 0o755);

  await assert.rejects(runSync(fixture, {}, failBin), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /::error::sync failed for frostyard\/consumer/);
    assert.doesNotMatch(error.stdout, /consumer: synced/);
    return true;
  });
  const invocations = await readLog(fixture.log);
  assert.equal(invocations.some((line) => isGitSubcommand(line, "push")), false);
  assert.equal(invocations.some((line) => line.startsWith("gh ")), false);
});

test("a failed path resolution fails the run before anything is copied, staged or pushed", async () => {
  const fixture = await createFixture();
  await seedConsumerRemote(fixture.remotesDir, "consumer", { "README.md": "seed\n" });
  const failBin = await mkdtemp(path.join(os.tmpdir(), "sync-skills-failbin-"));
  const rsyncLog = path.join(failBin, "rsync.log");
  // Fail only the clone root's resolution: an empty root once made every
  // absolute destination look contained.
  const { stdout: realRealpath } = await execFileAsync("which", ["realpath"]);
  await writeFile(
    path.join(failBin, "realpath"),
    `#!/usr/bin/env bash
case "\${@: -1}" in
  */.agents*) exec "${realRealpath.trim()}" "$@" ;;
esac
echo "stub: simulated realpath failure" >&2
exit 1
`,
  );
  await writeFile(
    path.join(failBin, "rsync"),
    `#!/usr/bin/env bash\necho rsync >> "${rsyncLog}"\nexit 1\n`,
  );
  await chmod(path.join(failBin, "realpath"), 0o755);
  await chmod(path.join(failBin, "rsync"), 0o755);

  await assert.rejects(runSync(fixture, {}, failBin), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /::error::sync failed for frostyard\/consumer/);
    assert.doesNotMatch(error.stdout, /consumer: (synced|up to date)/);
    return true;
  });
  const invocations = await readLog(fixture.log);
  assert.equal(invocations.some((line) => isGitSubcommand(line, "add")), false);
  assert.equal(invocations.some((line) => isGitSubcommand(line, "push")), false);
  assert.equal(invocations.some((line) => line.startsWith("gh ")), false);
  await assert.rejects(readFile(rsyncLog, "utf8"), { code: "ENOENT" });
});

// The script runs git as `git -c credential.helper=<helper with spaces>
// <subcommand> ...`, so a subcommand match cannot anchor at `git <sub>`.
function isGitSubcommand(line, sub) {
  return (line.startsWith("git ") && line.includes(` ${sub} `)) || line.endsWith(` ${sub}`);
}

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

function coreSkillContent(skill) {
  return skill === "demo" ? "# Demo\n" : `# ${skill}\n`;
}

// clones the pushed sync branch so a test can read the mirrored skills.
async function cloneSyncBranch({ remotesDir }) {
  const pushed = await mkdtemp(path.join(os.tmpdir(), "sync-skills-verify-"));
  await execFileAsync("git", [
    "clone",
    "--quiet",
    "--branch",
    "chore/sync-core-skills",
    path.join(remotesDir, "consumer.git"),
    pushed,
  ]);
  return pushed;
}

// `groups` is written to the config only when a test gives it, so the tests
// that predate groups keep exercising a config without that member.
// `extraSkills` names further core skills beside the by-default `demo` skill;
// `rawConfig` replaces the generated JSON, for an unparseable config.
async function createFixture({
  defaults = ["demo"],
  repos = { consumer: [] },
  groups,
  extraSkills = [],
  rawConfig,
} = {}) {
  const base = await mkdtemp(path.join(os.tmpdir(), "sync-skills-test-"));
  const coreRepo = path.join(base, "core");
  const remotesDir = path.join(base, "remotes");
  const log = path.join(base, "invocations.log");
  await mkdir(coreRepo, { recursive: true });
  await mkdir(remotesDir, { recursive: true });

  await mkdir(path.join(coreRepo, ".github"), { recursive: true });
  for (const skill of ["demo", ...extraSkills]) {
    await mkdir(path.join(coreRepo, ".agents/skills", skill), { recursive: true });
    await writeFile(
      path.join(coreRepo, ".agents/skills", skill, "SKILL.md"),
      coreSkillContent(skill),
    );
  }
  let configText;
  if (rawConfig !== undefined) {
    configText = rawConfig;
  } else {
    const config = { defaults };
    if (groups !== undefined) config.groups = groups;
    config.repos = repos;
    configText = JSON.stringify(config, null, 2) + "\n";
  }
  await writeFile(path.join(coreRepo, ".github/skills-sync.json"), configText);
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
# A push runs inside the clone, whose origin is the redirected bare
# fixture, so the fixture's name identifies the repository being pushed.
if [ "$subcmd" = "diff" ] && [ -n "\${SYNC_SKILLS_TEST_DIFF_FAIL:-}" ]; then
  origin=$("$real_git" remote get-url origin)
  if [ "$(basename "$origin" .git)" = "\${SYNC_SKILLS_TEST_FAIL_REPO:-}" ]; then
    echo "stub: simulated git diff error" >&2
    exit 128
  fi
fi
if [ "$subcmd" = "push" ] && [ -n "\${SYNC_SKILLS_TEST_PUSH_FAIL:-}" ]; then
  origin=$("$real_git" remote get-url origin)
  if [ "$(basename "$origin" .git)" = "\${SYNC_SKILLS_TEST_FAIL_REPO:-}" ]; then
    echo "stub: simulated push failure" >&2
    exit 1
  fi
fi
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
fail_here=0
case " $* " in
  *" frostyard/\${SYNC_SKILLS_TEST_FAIL_REPO:-} "*) fail_here=1 ;;
esac
if [ "\${1:-}" = "pr" ] && [ "\${2:-}" = "list" ]; then
  if [ "$fail_here" = 1 ] && [ -n "\${SYNC_SKILLS_TEST_GH_LIST_FAIL:-}" ]; then
    echo "stub: simulated pr list failure" >&2
    exit 1
  fi
  printf '%s' "\${SYNC_SKILLS_TEST_GH_PR_LIST_OUTPUT:-}"
  exit 0
fi
if [ "\${1:-}" = "pr" ] && [ "\${2:-}" = "create" ]; then
  if [ "$fail_here" = 1 ] && [ -n "\${SYNC_SKILLS_TEST_GH_CREATE_FAIL:-}" ]; then
    echo "stub: simulated pr create failure" >&2
    exit 1
  fi
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

async function runSync({ coreRepo, remotesDir, log, fakeBin, realGit }, extraEnv = {}, firstBin = "") {
  return execFileAsync("bash", [scriptPath], {
    cwd: coreRepo,
    env: {
      ...process.env,
      PATH: `${firstBin ? `${firstBin}:` : ""}${fakeBin}:${process.env.PATH}`,
      GH_TOKEN: "sync-skills-test-token",
      SYNC_SKILLS_TEST_LOG: log,
      SYNC_SKILLS_TEST_REAL_GIT: realGit,
      SYNC_SKILLS_TEST_REMOTES_DIR: remotesDir,
      ...extraEnv,
    },
  });
}
