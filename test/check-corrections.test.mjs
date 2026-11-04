import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts/check-corrections.mjs");

function valid(date = "2026-11-04", correction = "Use the canonical validator") {
  return { date, scope: "agent", correction, evidence: "check", promoted_to: "" };
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "core-corrections-gate-"));
  await mkdir(path.join(root, ".memory"), { recursive: true });
  return root;
}

async function writeJsonl(root, objects) {
  await writeFile(
    path.join(root, ".memory/corrections.jsonl"),
    objects.map((object) => JSON.stringify(object)).join("\n") + (objects.length ? "\n" : ""),
  );
}

async function initGit(root) {
  await execFileAsync("git", ["init", "--quiet"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "Test"], { cwd: root });
}

async function commitAll(root, message = "base") {
  await execFileAsync("git", ["add", "-A"], { cwd: root });
  await execFileAsync("git", ["-c", "user.email=test@example.invalid", "-c", "user.name=Test", "commit", "--quiet", "-m", message], { cwd: root });
}

function run(root, extra = []) {
  return execFileAsync(process.execPath, [script, "--root", root, ...extra], { cwd: root });
}

test("repository corrections file passes", async () => {
  const { stdout } = await run(repoRoot);
  assert.match(stdout, /ok {3}corrections: [1-9]\d* lines/);
});

test("valid 2-line file passes", async () => {
  const root = await fixture();
  await writeJsonl(root, [valid(), valid("2026-11-05", "Second correction")]);
  const { stdout } = await run(root);
  assert.match(stdout, /ok {3}corrections: 2 lines/);
});

test("a sixth field fails and names it", async () => {
  const root = await fixture();
  await writeFile(path.join(root, ".memory/corrections.jsonl"), JSON.stringify({ ...valid(), extra: "bad" }) + "\n");
  await assert.rejects(run(root), (error) => error.stderr.includes("unknown key(s): extra"));
});

test("2026-8-11 fails as an invalid date", async () => {
  const root = await fixture();
  await writeJsonl(root, [valid("2026-8-11")]);
  await assert.rejects(run(root), (error) => error.stderr.includes("invalid date: 2026-8-11"));
});

test("2026-13-01 fails as an invalid date", async () => {
  const root = await fixture();
  await writeJsonl(root, [valid("2026-13-01")]);
  await assert.rejects(run(root), (error) => error.stderr.includes("invalid date: 2026-13-01"));
});

test("2026-02-30 fails as an invalid date", async () => {
  const root = await fixture();
  await writeJsonl(root, [valid("2026-02-30")]);
  await assert.rejects(run(root), (error) => error.stderr.includes("invalid date: 2026-02-30"));
});

test("empty correction fails, empty evidence fails, empty promoted_to passes", async () => {
  const root = await fixture();
  await writeJsonl(root, [{ ...valid(), correction: "  ", evidence: "" }]);
  await assert.rejects(run(root), (error) => error.stderr.includes("correction is empty") && error.stderr.includes("evidence is empty") && error.stdout.includes("2 problem(s)"));

  await writeJsonl(root, [valid()]);
  await run(root);
});

test("invalid JSON, array, non-string value, and missing field fail", async () => {
  const root = await fixture();
  await writeFile(path.join(root, ".memory/corrections.jsonl"), "{bad json}\n[]\n" + JSON.stringify({ ...valid(), date: 20261104 }) + "\n" + JSON.stringify({ date: "2026-11-04", scope: "agent", correction: "x", evidence: "y" }) + "\n");
  await assert.rejects(run(root), (error) =>
    error.stderr.includes("invalid JSON")
    && error.stderr.includes("not a plain object")
    && error.stderr.includes("value for date is not a string")
    && error.stderr.includes("missing key(s): promoted_to")
  );
});

test("blank line in the middle fails", async () => {
  const root = await fixture();
  await writeFile(path.join(root, ".memory/corrections.jsonl"), JSON.stringify(valid()) + "\n\n" + JSON.stringify(valid()) + "\n");
  await assert.rejects(run(root), (error) => error.stderr.includes("blank line"));
});

test("missing file passes with no file", async () => {
  const root = await fixture();
  await execFileAsync("rm", ["-rf", path.join(root, ".memory")]);
  const { stdout } = await run(root);
  assert.match(stdout, /ok {3}corrections: no file/);
});

test("base removal of line 1 or last line fails", async () => {
  const root = await fixture();
  await writeJsonl(root, [valid(), valid("2026-11-05", "Second")]);
  await initGit(root);
  await commitAll(root);

  await writeJsonl(root, [valid("2026-11-05", "Second")]);
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) => /removed|changed/.test(error.stderr));

  await writeJsonl(root, [valid()]);
  await commitAll(root, "one line base");
  await writeJsonl(root, []);
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) => error.stderr.includes("removed"));
});

test("base promotion from empty promoted_to passes", async () => {
  const root = await fixture();
  await writeJsonl(root, [valid()]);
  await initGit(root);
  await commitAll(root);
  await writeJsonl(root, [{ ...valid(), promoted_to: "AGENTS.md" }]);
  const { stdout } = await run(root, ["--base", "HEAD"]);
  assert.match(stdout, /append-only vs HEAD/);
});

test("base correction change fails and filled promoted_to change fails", async () => {
  const root = await fixture();
  await writeJsonl(root, [valid()]);
  await initGit(root);
  await commitAll(root);
  await writeJsonl(root, [{ ...valid(), correction: "Changed" }]);
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) => error.stderr.includes("changed"));

  await writeJsonl(root, [{ ...valid(), promoted_to: "AGENTS.md" }]);
  await commitAll(root, "promote");
  await writeJsonl(root, [{ ...valid(), promoted_to: "docs/other.md" }]);
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) => error.stderr.includes("changed"));
});

test("base accepts valid append and rejects invalid append", async () => {
  const root = await fixture();
  await writeJsonl(root, [valid()]);
  await initGit(root);
  await commitAll(root);
  await writeJsonl(root, [valid(), valid("2026-11-05", "Appended")]);
  await run(root, ["--base", "HEAD"]);

  await writeFile(path.join(root, ".memory/corrections.jsonl"), JSON.stringify(valid()) + "\n" + "{bad}\n");
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) => error.stderr.includes("invalid JSON"));
});

test("base absent file passes and nosuchref fails", async () => {
  const root = await fixture();
  await initGit(root);
  await execFileAsync("git", ["commit", "--quiet", "--allow-empty", "-m", "empty"], { cwd: root });
  await writeJsonl(root, [valid()]);
  await run(root, ["--base", "HEAD"]);

  await assert.rejects(run(root, ["--base", "nosuchref"]), (error) => error.stderr.includes("base ref nosuchref does not exist"));
});

test("base: a removed file fails", async () => {
  const root = await fixture();
  await writeJsonl(root, [valid()]);
  await initGit(root);
  await commitAll(root);
  await execFileAsync("rm", ["-rf", path.join(root, ".memory")]);
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) => error.code === 1 && error.stderr.includes("file removed"));
  const { stdout } = await run(root);
  assert.match(stdout, /no file/);
});

test("a duplicate key fails, also when one copy is escaped", async () => {
  const root = await fixture();
  const line = JSON.stringify(valid());
  await writeFile(path.join(root, ".memory/corrections.jsonl"), line.replace("{", '{"correction":"hidden",') + "\n");
  await assert.rejects(run(root), (error) => error.stderr.includes("duplicate key(s): correction"));

  await writeFile(path.join(root, ".memory/corrections.jsonl"), line.replace("{", '{"\\u0063orrection":"hidden",') + "\n");
  await assert.rejects(run(root), (error) => error.stderr.includes("duplicate key(s): correction"));
});

test("base: an absolute --file inside the root is compared, not skipped", async () => {
  const root = await fixture();
  await writeJsonl(root, [valid()]);
  await initGit(root);
  await commitAll(root);
  await writeJsonl(root, [{ ...valid(), correction: "Changed" }]);
  const absolute = path.join(root, ".memory/corrections.jsonl");
  await assert.rejects(run(root, ["--file", absolute, "--base", "HEAD"]), (error) => error.code === 1 && error.stderr.includes("line changed"));
});

test("a --file outside the root exits 2", async () => {
  const root = await fixture();
  await assert.rejects(run(root, ["--file", "../outside.jsonl"]), (error) => error.code === 2 && error.stderr.includes("inside --root"));
});

test("base: an unreadable base object fails instead of passing", async () => {
  const root = await fixture();
  await writeJsonl(root, [valid()]);
  await initGit(root);
  await commitAll(root);
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD:.memory/corrections.jsonl"], { cwd: root });
  const blob = stdout.trim();
  await rm(path.join(root, ".git/objects", blob.slice(0, 2), blob.slice(2)));
  await writeJsonl(root, [valid("2026-11-05", "Replaced")]);
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) => error.code === 1 && error.stderr.includes("cannot read"));
});

test("base: a missing file with a bad ref fails", async () => {
  const root = await fixture();
  await initGit(root);
  await execFileAsync("git", ["-c", "user.email=test@example.invalid", "-c", "user.name=Test", "commit", "--quiet", "--allow-empty", "-m", "empty"], { cwd: root });
  await rm(path.join(root, ".memory"), { recursive: true });
  await assert.rejects(run(root, ["--base", "nosuchref"]), (error) => error.code === 1 && error.stderr.includes("does not exist"));
});

test("the default root works from a path with spaces", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "core corrections "));
  const root = path.join(parent, "repo with space");
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await mkdir(path.join(root, ".memory"), { recursive: true });
  await copyFile(script, path.join(root, "scripts/check-corrections.mjs"));
  await writeJsonl(root, [valid()]);
  const { stdout } = await execFileAsync(process.execPath, [path.join(root, "scripts/check-corrections.mjs")], { cwd: os.tmpdir() });
  assert.match(stdout, /ok {3}corrections: 1 lines/);
});

test("unknown option exits 2", async () => {
  const root = await fixture();
  await assert.rejects(run(root, ["--unknown"]), (error) => error.code === 2 && error.stderr.includes("Usage:"));
});
