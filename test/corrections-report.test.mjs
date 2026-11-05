import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmodSync, lstatSync, mkdirSync, symlinkSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts/corrections-report.mjs");
const { parseRemoteUrl } = await import(script);

function line(date, scope, correction, evidence = "review", promotedTo = "") {
  return { date, scope, correction, evidence, promoted_to: promotedTo };
}

async function initRepo(root, name) {
  await execFileAsync("git", ["init", "--quiet"], { cwd: root });
  await execFileAsync("git", ["remote", "add", "origin", `https://github.com/frostyard/${name}.git`], { cwd: root });
}

const fixtures = [];
const denied = [];
test.after(() => {
  // Restore every denied folder first: a fixture removed before it would
  // leave a later chmod with no folder (ENOENT).
  for (const folder of denied) chmodSync(folder, 0o755);
  for (const root of fixtures) rmSync(root, { recursive: true, force: true });
});

async function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "core-corrections-report-"));
  fixtures.push(root);
  return root;
}

function writeJsonl(folder, objects) {
  mkdirSync(path.join(folder, ".memory"), { recursive: true });
  writeFileSync(
    path.join(folder, ".memory/corrections.jsonl"),
    objects.map((object) => JSON.stringify(object)).join("\n") + (objects.length ? "\n" : ""),
  );
}

function run(root, extra = []) {
  return execFileAsync(process.execPath, [script, "--root", root, ...extra], { cwd: root });
}

function snapshotTree(root) {
  const entries = [];
  function walk(folder) {
    const absolute = folder;
    const relative = path.relative(root, absolute).split(path.sep).join("/") || ".";
    const stat = lstatSync(absolute);
    entries.push({ path: relative, size: stat.size, mtime: stat.mtimeMs, type: stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other" });
    if (!stat.isDirectory()) return;
    for (const name of readdirSync(absolute).sort()) walk(path.join(absolute, name));
  }
  walk(root);
  return entries;
}

test("a scope with 2 pending lines in 1 repository is reported in repository repeats", async () => {
  const root = await fixture();
  const repo = path.join(root, "repo-a");
  mkdirSync(repo);
  await initRepo(repo, "repo-a");
  writeJsonl(repo, [
    line("2026-11-04", "Agent", "First correction"),
    line("2026-11-05", "agent", "Second correction"),
  ]);

  const { stdout } = await run(root);
  assert.match(stdout, /## Repeated scopes in 1 repository/);
  assert.match(stdout, /owner\/name.*repo-a|frostyard\/repo-a/);
  assert.match(stdout, /### frostyard\/repo-a: Agent \(2 lines, 0 promoted\)/);
  assert.match(stdout, /- 2026-11-04 First correction/);
  assert.match(stdout, /- 2026-11-05 Second correction/);
});

test("1 pending line in repository A and 1 in repository B is reported across repositories", async () => {
  const root = await fixture();
  for (const name of ["repo-a", "repo-b"]) {
    const repo = path.join(root, name);
    mkdirSync(repo);
    await initRepo(repo, name);
  }
  writeJsonl(path.join(root, "repo-a"), [line("2026-11-04", "Shared scope", "Correction A")]);
  writeJsonl(path.join(root, "repo-b"), [line("2026-11-05", "shared scope", "Correction B")]);

  const { stdout } = await run(root);
  assert.match(stdout, /## Scopes in 2 or more repositories/);
  assert.match(stdout, /### Shared scope: frostyard\/repo-a, frostyard\/repo-b \(2 lines, 0 promoted\)/);
  assert.match(stdout, /- frostyard\/repo-a 2026-11-04 Correction A/);
  assert.match(stdout, /- frostyard\/repo-b 2026-11-05 Correction B/);
});

test("promoted lines are excluded and 2 promoted lines create no repeat", async () => {
  const root = await fixture();
  const repo = path.join(root, "repo-a");
  mkdirSync(repo);
  await initRepo(repo, "repo-a");
  writeJsonl(repo, [
    line("2026-11-04", "Pending scope", "Pending correction"),
    line("2026-11-04", "Promoted scope", "Promoted one", "review", "AGENTS.md"),
    line("2026-11-05", "Promoted scope", "Promoted two", "review", "docs/quality.md"),
  ]);

  const { stdout } = await run(root);
  assert.match(stdout, /- 2026-11-04 \[Pending scope\] Pending correction/);
  assert.doesNotMatch(stdout, /Promoted one|Promoted two/);
  assert.doesNotMatch(stdout, /Promoted scope/);
  assert.doesNotMatch(stdout, /- 2026-11-04 \[Promoted scope\]/);
});

test("two checkouts of one repository merge and prefer promoted state", async () => {
  const root = await fixture();
  for (const name of ["repo-a", "repo-a-worktree"]) {
    const repo = path.join(root, name);
    mkdirSync(repo);
    await initRepo(repo, "repo-a");
  }
  const duplicate = line("2026-11-04", "Same state", "One correction");
  writeJsonl(path.join(root, "repo-a"), [duplicate]);
  writeJsonl(path.join(root, "repo-a-worktree"), [{ ...duplicate, promoted_to: "AGENTS.md" }]);

  const { stdout } = await run(root);
  assert.match(stdout, /Repositories scanned: 2; with corrections: 1; lines: 1; pending: 0/);
  assert.doesNotMatch(stdout, /- 2026-11-04 \[Same state\]/);
  assert.doesNotMatch(stdout, /Repeated scopes in 1 repository[\s\S]*frostyard\/repo-a: Same state|One correction/);

  const { stdout: jsonOut } = await run(root, ["--json"]);
  const report = JSON.parse(jsonOut);
  assert.equal(report.repositories.length, 1);
  assert.equal(report.repositories[0].lines, 1);
  assert.equal(report.repositories[0].pending.length, 0);
});

test("--json contains the required fields and repeated groups", async () => {
  const root = await fixture();
  const repo = path.join(root, "repo-a");
  mkdirSync(repo);
  await initRepo(repo, "repo-a");
  writeJsonl(repo, [
    line("2026-11-04", "Repeat", "One"),
    line("2026-11-05", "Repeat", "Two"),
  ]);

  const { stdout } = await run(root, ["--json"]);
  const report = JSON.parse(stdout);
  assert.equal(report.schema_version, 1);
  assert.equal(report.root, root);
  assert.equal(report.repositories_scanned, 1);
  assert.equal(report.repositories_with_corrections, 1);
  assert.equal(report.lines, 2);
  assert.equal(report.pending, 2);
  assert.equal(report.repositories[0].name, "frostyard/repo-a");
  assert.deepEqual(report.repositories[0].paths, ["repo-a"]);
  assert.equal(report.repositories[0].lines, 2);
  assert.equal(report.repositories[0].pending.length, 2);
  assert.equal(report.repeated_in_repository[0].repository, "frostyard/repo-a");
  assert.equal(report.repeated_in_repository[0].scope, "Repeat");
  assert.equal(report.repeated_in_repository[0].lines, 2);
  assert.equal(report.repeated_in_repository[0].promoted, 0);
  assert.equal(report.repeated_in_repository[0].pending.length, 2);
  assert.ok(Array.isArray(report.repeated_across_repositories));
  assert.ok(Array.isArray(report.unreadable));
});

test("--out writes only the report file and missing parent exits 2", async () => {
  const root = await fixture();
  const repo = path.join(root, "repo-a");
  mkdirSync(repo);
  await initRepo(repo, "repo-a");
  writeJsonl(repo, [line("2026-11-04", "Scope", "Correction")]);

  const out = path.join(root, "report.txt");
  const { stdout, stderr } = await run(root, ["--out", out]);
  assert.equal(stdout, "");
  assert.equal(stderr, "");
  assert.match(readFileSync(out, "utf8"), /^Corrections report:/);

  await assert.rejects(run(root, ["--out", path.join(root, "missing/report.txt")]), (error) =>
    error.code === 2 && error.stderr.includes("parent folder")
  );
});

test("a run with --json does not change any fixture path, size or mtime", async () => {
  const root = await fixture();
  const repo = path.join(root, "repo-a");
  mkdirSync(repo);
  await initRepo(repo, "repo-a");
  writeJsonl(repo, [line("2026-11-04", "Scope", "Correction")]);
  const before = snapshotTree(root);
  await run(root, ["--json"]);
  const after = snapshotTree(root);
  assert.deepEqual(after, before);
});

test("usage and root errors exit 2", async () => {
  await assert.rejects(execFileAsync(process.execPath, [script]), (error) =>
    error.code === 2 && error.stderr.includes("Usage:")
  );

  const missing = path.join(os.tmpdir(), `missing-${process.pid}-${Date.now()}`);
  await assert.rejects(execFileAsync(process.execPath, [script, "--root", missing]), (error) =>
    error.code === 2 && error.stderr.includes("Usage:")
  );

  const root = await fixture();
  await assert.rejects(run(root, ["--depth", "-1"]), (error) =>
    error.code === 2 && error.stderr.includes("Usage:")
  );
  await assert.rejects(run(root, ["--root", "--json"]), (error) =>
    error.code === 2 && error.stderr.includes("Usage:")
  );
});

test("an unreadable JSON line is reported and the run exits 0", async () => {
  const root = await fixture();
  const repo = path.join(root, "repo-a");
  mkdirSync(repo);
  await initRepo(repo, "repo-a");
  mkdirSync(path.join(repo, ".memory"));
  writeFileSync(path.join(repo, ".memory/corrections.jsonl"), "{bad json}\n");

  const { stdout } = await run(root);
  assert.match(stdout, /## Unreadable lines/);
  assert.match(stdout, /- frostyard\/repo-a repo-a\/\.memory\/corrections\.jsonl:1: invalid JSON/);
});

test("depth limits discovery and node_modules is skipped", async () => {
  const root = await fixture();
  const shallow = path.join(root, "shallow");
  mkdirSync(shallow);
  await initRepo(shallow, "shallow");
  writeJsonl(shallow, [line("2026-11-04", "Scope", "Shallow")]);

  const deep = path.join(root, "level", "deep");
  mkdirSync(deep, { recursive: true });
  await initRepo(deep, "deep");
  writeJsonl(deep, [line("2026-11-04", "Scope", "Deep")]);

  const skipped = path.join(root, "node_modules", "dependency");
  mkdirSync(skipped, { recursive: true });
  await initRepo(skipped, "dependency");
  writeJsonl(skipped, [line("2026-11-04", "Scope", "Skipped")]);

  const depth1 = await run(root, ["--depth", "1"]);
  assert.match(depth1.stdout, /Repositories scanned: 1;/);
  assert.match(depth1.stdout, /frostyard\/shallow/);
  assert.doesNotMatch(depth1.stdout, /frostyard\/deep|frostyard\/dependency/);

  const depth2 = await run(root, ["--depth", "2"]);
  assert.match(depth2.stdout, /Repositories scanned: 2;/);
  assert.match(depth2.stdout, /frostyard\/deep/);
  assert.doesNotMatch(depth2.stdout, /frostyard\/dependency/);
});

test("text output replaces control characters from correction text", async () => {
  const root = await fixture();
  const repo = path.join(root, "repo-a");
  mkdirSync(repo);
  await initRepo(repo, "repo-a");
  writeJsonl(repo, [line("2026-11-04", "Scope", "Line one\n## Fake heading \u001b[31mred")]);

  const { stdout } = await run(root);
  assert.match(stdout, /- 2026-11-04 \[Scope\] Line one ## Fake heading  \[31mred — evidence: review/);
  assert.doesNotMatch(stdout, /\u001b/);
  assert.doesNotMatch(stdout, /^## Fake heading/m);
});

test("remote identity keeps the host and the full path", () => {
  for (const remote of [
    "https://github.com/frostyard/core.git",
    "https://github.com/frostyard/core",
    "git@github.com:frostyard/core.git",
    "ssh://git@github.com/frostyard/core.git",
    "https://GitHub.com/Frostyard/Core.git",
  ]) {
    assert.equal(parseRemoteUrl(remote), "frostyard/core", remote);
  }
  assert.equal(parseRemoteUrl("https://git.example.net/frostyard/core.git"), "git.example.net/frostyard/core");
  assert.equal(parseRemoteUrl("git@git.example.net:frostyard/core.git"), "git.example.net/frostyard/core");
  assert.equal(parseRemoteUrl("https://gitlab.com/group/sub/core.git"), "gitlab.com/group/sub/core");
  assert.notEqual(parseRemoteUrl("https://gitlab.com/group/sub/core.git"), parseRemoteUrl("https://gitlab.com/other/sub/core.git"));
  assert.equal(parseRemoteUrl("ssh://git@github.com:22/frostyard/core.git"), "frostyard/core");
  assert.equal(parseRemoteUrl("https://git.example.net:443/team/core.git"), "git.example.net/team/core");
  assert.equal(parseRemoteUrl("https://git.example.net:8443/team/core.git"), "git.example.net:8443/team/core");
  assert.notEqual(parseRemoteUrl("https://git.example.net:8443/team/core.git"), parseRemoteUrl("https://git.example.net:9443/team/core.git"));
  assert.equal(parseRemoteUrl("ssh://git@git.example.net:2222/team/core.git"), "git.example.net:2222/team/core");
  assert.equal(parseRemoteUrl("/srv/git/core.git"), null);
  assert.equal(parseRemoteUrl("file:///srv/git/core.git"), null);
});

test("2 repositories with the same owner/name on different hosts do not merge", async () => {
  const root = await fixture();
  const shared = line("2026-11-04", "Scope", "Same correction");
  for (const [name, remote, promoted] of [
    ["github", "https://github.com/frostyard/core.git", "AGENTS.md"],
    ["mirror", "https://git.example.net/frostyard/core.git", ""],
  ]) {
    const repo = path.join(root, name);
    mkdirSync(repo);
    await execFileAsync("git", ["init", "--quiet"], { cwd: repo });
    await execFileAsync("git", ["remote", "add", "origin", remote], { cwd: repo });
    writeJsonl(repo, [{ ...shared, promoted_to: promoted }]);
  }

  const report = JSON.parse((await run(root, ["--json"])).stdout);
  assert.deepEqual(report.repositories.map((repository) => repository.name), ["frostyard/core", "git.example.net/frostyard/core"]);
  assert.equal(report.pending, 1);
  assert.equal(report.repositories[1].pending[0].correction, "Same correction");
});

test("a .memory symbolic link is not followed and is listed as unreadable", async () => {
  const root = await fixture();
  const outside = await fixture();
  writeJsonl(outside, [line("2026-11-04", "Outside", "Outside correction")]);
  const repo = path.join(root, "repo-a");
  mkdirSync(repo);
  await initRepo(repo, "repo-a");
  symlinkSync(path.join(outside, ".memory"), path.join(repo, ".memory"));

  const { stdout } = await run(root);
  assert.doesNotMatch(stdout, /Outside correction/);
  assert.match(stdout, /- frostyard\/repo-a repo-a\/\.memory: symbolic link, not followed/);
});

test("a denied .memory folder is listed as unreadable, not left out", { skip: process.getuid?.() === 0 && "root reads any folder" }, async () => {
  const root = await fixture();
  const repo = path.join(root, "repo-a");
  mkdirSync(repo);
  await initRepo(repo, "repo-a");
  writeJsonl(repo, [line("2026-11-04", "Scope", "Hidden correction")]);
  const memory = path.join(repo, ".memory");
  chmodSync(memory, 0o000);
  denied.push(memory);

  const { stdout } = await run(root);
  chmodSync(memory, 0o755);
  assert.match(stdout, /- frostyard\/repo-a repo-a\/\.memory\/corrections\.jsonl: cannot read: EACCES/);
  assert.match(stdout, /with corrections: 1;/);
});

// --ref reads the file at a ref (such as origin/main), so a line on an
// unmerged branch, an uncommitted edit, or a second worktree of 1 clone
// is not counted (ACMM scorecard B6, 2026-11-04).
const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
  GIT_CONFIG_NOSYSTEM: "1",
};

function gitIn(folder, args) {
  return execFileAsync("git", ["-C", folder, "-c", "commit.gpgsign=false", ...args], { env: gitEnv });
}

async function commitAll(folder, message) {
  await gitIn(folder, ["add", "-A"]);
  await gitIn(folder, ["commit", "--quiet", "-m", message]);
}

// A clone whose origin/main holds 1 committed line, with a feature branch
// that adds a second line in a second worktree, and an uncommitted third
// line in the main worktree.
async function cloneWithBranch(root) {
  const repo = path.join(root, "repo-a");
  mkdirSync(repo);
  await initRepo(repo, "repo-a");
  await gitIn(repo, ["checkout", "--quiet", "-b", "main"]);
  writeJsonl(repo, [line("2026-11-01", "Merged", "Merged correction")]);
  await commitAll(repo, "merged line");
  await gitIn(repo, ["update-ref", "refs/remotes/origin/main", "HEAD"]);

  const worktree = path.join(root, "repo-a-feature");
  await gitIn(repo, ["worktree", "add", "--quiet", "-b", "feature", worktree]);
  writeJsonl(worktree, [
    line("2026-11-01", "Merged", "Merged correction"),
    line("2026-11-02", "Branch", "Branch-only correction"),
  ]);
  await commitAll(worktree, "branch line");

  writeJsonl(repo, [
    line("2026-11-01", "Merged", "Merged correction"),
    line("2026-11-03", "Edit", "Uncommitted correction"),
  ]);
  return { repo, worktree };
}

test("--ref reads only the file at the ref, once per clone", async () => {
  const root = await fixture();
  await cloneWithBranch(root);

  const { stdout: trees } = await run(root, ["--json"]);
  const treeReport = JSON.parse(trees);
  assert.equal(treeReport.ref, null);
  assert.equal(treeReport.lines, 3, "working trees count the branch and the uncommitted lines");

  const { stdout } = await run(root, ["--ref", "origin/main", "--json"]);
  const report = JSON.parse(stdout);
  assert.equal(report.ref, "origin/main");
  assert.equal(report.repositories_scanned, 2);
  assert.equal(report.repositories_with_corrections, 1);
  assert.equal(report.lines, 1);
  assert.deepEqual(report.repositories[0].paths, ["repo-a", "repo-a-feature"]);
  assert.deepEqual(report.repositories[0].pending.map((item) => item.correction), ["Merged correction"]);
  assert.deepEqual(report.unreadable, []);

  const { stdout: text } = await run(root, ["--ref", "origin/main"]);
  assert.match(text, /^Corrections report: .* \(at origin\/main\)\n/);
  assert.doesNotMatch(text, /Branch-only correction|Uncommitted correction/);
});

test("--ref lists a checkout with the file but without the ref, and skips one without both", async () => {
  const root = await fixture();
  const withFile = path.join(root, "repo-a");
  const without = path.join(root, "repo-b");
  for (const [folder, name] of [[withFile, "repo-a"], [without, "repo-b"]]) {
    mkdirSync(folder);
    await initRepo(folder, name);
  }
  writeJsonl(withFile, [line("2026-11-04", "Scope", "Local correction")]);

  const { stdout } = await run(root, ["--ref", "origin/main", "--json"]);
  const report = JSON.parse(stdout);
  assert.equal(report.lines, 0);
  assert.deepEqual(report.unreadable, [
    { repository: "frostyard/repo-a", path: "repo-a/.memory/corrections.jsonl", line: null, reason: "ref not found: origin/main" },
  ]);
});

test("--ref does not follow a committed symbolic link and reports bad lines at the ref", async () => {
  const root = await fixture();
  const linked = path.join(root, "repo-a");
  mkdirSync(linked);
  await initRepo(linked, "repo-a");
  mkdirSync(path.join(linked, ".memory"));
  symlinkSync("/etc/hostname", path.join(linked, ".memory/corrections.jsonl"));
  await commitAll(linked, "link");

  const bad = path.join(root, "repo-b");
  mkdirSync(bad);
  await initRepo(bad, "repo-b");
  mkdirSync(path.join(bad, ".memory"));
  writeFileSync(path.join(bad, ".memory/corrections.jsonl"), `${JSON.stringify(line("2026-11-04", "Ok", "Good"))}\nnot json\n`);
  await commitAll(bad, "bad line");

  const { stdout } = await run(root, ["--ref", "HEAD", "--json"]);
  const report = JSON.parse(stdout);
  assert.equal(report.lines, 1);
  assert.deepEqual(report.unreadable, [
    { repository: "frostyard/repo-a", path: "repo-a/.memory/corrections.jsonl", line: null, reason: "symbolic link, not followed" },
    { repository: "frostyard/repo-b", path: "repo-b/.memory/corrections.jsonl", line: 2, reason: "invalid JSON" },
  ]);
});

test("--ref refuses a value that git could read as an option", async () => {
  const root = await fixture();
  for (const value of ["-h", "--output=x", "main..x", "a b"]) {
    await assert.rejects(run(root, ["--ref", value]), (error) =>
      error.code === 2 && error.stderr.includes("Usage:"), value
    );
  }
});

test("--ref checks each worktree for a file when the clone has no such ref", async () => {
  const root = await fixture();
  const repo = path.join(root, "repo-a");
  mkdirSync(repo);
  await initRepo(repo, "repo-a");
  writeFileSync(path.join(repo, "README"), "x\n");
  await commitAll(repo, "first");
  const worktree = path.join(root, "repo-a-wt");
  await gitIn(repo, ["worktree", "add", "--quiet", "-b", "feature", worktree]);
  writeJsonl(worktree, [line("2026-11-04", "Scope", "Uncommitted correction")]);

  const { stdout } = await run(root, ["--ref", "origin/main", "--json"]);
  const report = JSON.parse(stdout);
  assert.equal(report.lines, 0);
  assert.deepEqual(report.unreadable, [
    { repository: "frostyard/repo-a", path: "repo-a-wt/.memory/corrections.jsonl", line: null, reason: "ref not found: origin/main" },
  ]);
});

test("--ref names a clone by the remote of any of its worktrees", async () => {
  const root = await fixture();
  const repo = path.join(root, "repo-a");
  mkdirSync(repo);
  await gitIn(repo, ["init", "--quiet"]);
  await gitIn(repo, ["config", "extensions.worktreeConfig", "true"]);
  writeJsonl(repo, [line("2026-11-01", "Merged", "Merged correction")]);
  await commitAll(repo, "merged line");
  await gitIn(repo, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  const worktree = path.join(root, "repo-a-wt");
  await gitIn(repo, ["worktree", "add", "--quiet", "-b", "feature", worktree]);
  await gitIn(worktree, ["config", "--worktree", "remote.origin.url", "https://github.com/frostyard/repo-a.git"]);

  const { stdout } = await run(root, ["--ref", "origin/main", "--json"]);
  const report = JSON.parse(stdout);
  assert.deepEqual(report.repositories.map((repository) => [repository.name, repository.paths]), [
    ["frostyard/repo-a", ["repo-a", "repo-a-wt"]],
  ]);
  assert.equal(report.lines, 1);
});

test("--ref never fetches a blob that a partial clone does not hold", async () => {
  const source = await fixture();
  await gitIn(source, ["init", "--quiet", "-b", "main"]);
  await gitIn(source, ["config", "uploadpack.allowFilter", "true"]);
  writeJsonl(source, [line("2026-11-01", "Remote", "Remote-only correction")]);
  await commitAll(source, "line");

  const root = await fixture();
  const clone = path.join(root, "repo-a");
  await execFileAsync("git", ["clone", "--quiet", "--filter=blob:none", "--no-checkout", `file://${source}`, clone], { env: gitEnv });
  const { stdout: oid } = await gitIn(clone, ["rev-parse", "origin/main:.memory/corrections.jsonl"]);
  const missing = () => execFileAsync("git", ["-C", clone, "cat-file", "-e", oid.trim()], { env: { ...gitEnv, GIT_NO_LAZY_FETCH: "1" } });
  await assert.rejects(missing(), "the fixture's blob starts missing");

  const { stdout } = await run(root, ["--ref", "origin/main", "--json"]);
  const report = JSON.parse(stdout);
  assert.equal(report.lines, 0);
  assert.equal(report.unreadable.length, 1);
  assert.equal(report.unreadable[0].reason, "cannot read file at origin/main");
  await assert.rejects(missing(), "the report must not fetch the blob");
});
