import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts/check-corrections.mjs");

function record(date = "2026-11-04", extra = {}) {
  return { date, scope: "agent", correction: "Use the canonical validator", evidence: "check", promoted_to: "", ...extra };
}

// The canonical bytes of a record (ADR-0081): 5 fields in 1 order, 2-space
// indent, 1 final newline.
function canonical(value) {
  const ordered = {
    date: value.date,
    scope: value.scope,
    correction: value.correction,
    evidence: value.evidence,
    promoted_to: value.promoted_to,
  };
  return Buffer.from(`${JSON.stringify(ordered, null, 2)}\n`, "utf8");
}

function jsonlText(objects) {
  return objects.map((object) => JSON.stringify(object)).join("\n") + (objects.length ? "\n" : "");
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "core-corrections-gate-"));
  await mkdir(path.join(root, ".memory"), { recursive: true });
  return root;
}

async function writeJsonl(root, objects) {
  await writeFile(path.join(root, ".memory/corrections.jsonl"), jsonlText(objects));
}

// files: name in the folder -> content (Buffer or text).
async function writeRecords(root, files) {
  const folder = path.join(root, ".memory/corrections");
  await mkdir(folder, { recursive: true });
  for (const [name, content] of Object.entries(files)) await writeFile(path.join(folder, name), content);
}

async function removeJsonl(root) {
  await rm(path.join(root, ".memory/corrections.jsonl"), { force: true });
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

// ---------------------------------------------------------------- the head --

test("repository corrections file passes", async () => {
  const { stdout } = await run(repoRoot);
  assert.match(stdout, /ok {3}corrections: [1-9]\d* lines \(legacy form: migrate to \.memory\/corrections\/\)/);
});

test("valid 2-line file passes", async () => {
  const root = await fixture();
  await writeJsonl(root, [record(), record("2026-11-05", { correction: "Second correction" })]);
  const { stdout } = await run(root);
  assert.match(stdout, /ok {3}corrections: 2 lines \(legacy form/);
});

test("a sixth field fails and names it", async () => {
  const root = await fixture();
  await writeFile(path.join(root, ".memory/corrections.jsonl"), JSON.stringify({ ...record(), extra: "bad" }) + "\n");
  await assert.rejects(run(root), (error) => error.stderr.includes("unknown key(s): extra"));
});

test("2026-8-11 fails as an invalid date", async () => {
  const root = await fixture();
  await writeJsonl(root, [record("2026-8-11")]);
  await assert.rejects(run(root), (error) => error.stderr.includes("invalid date: 2026-8-11"));
});

test("2026-13-01 fails as an invalid date", async () => {
  const root = await fixture();
  await writeJsonl(root, [record("2026-13-01")]);
  await assert.rejects(run(root), (error) => error.stderr.includes("invalid date: 2026-13-01"));
});

test("2026-02-30 fails as an invalid date", async () => {
  const root = await fixture();
  await writeJsonl(root, [record("2026-02-30")]);
  await assert.rejects(run(root), (error) => error.stderr.includes("invalid date: 2026-02-30"));
});

test("empty correction fails, empty evidence fails, empty promoted_to passes", async () => {
  const root = await fixture();
  await writeJsonl(root, [{ ...record(), correction: "  ", evidence: "" }]);
  await assert.rejects(run(root), (error) => error.stderr.includes("correction is empty") && error.stderr.includes("evidence is empty") && error.stdout.includes("2 problem(s)"));

  await writeJsonl(root, [record()]);
  await run(root);
});

test("invalid JSON, array, non-string value, and missing field fail", async () => {
  const root = await fixture();
  await writeFile(path.join(root, ".memory/corrections.jsonl"), "{bad json}\n[]\n" + JSON.stringify({ ...record(), date: 20261104 }) + "\n" + JSON.stringify({ date: "2026-11-04", scope: "agent", correction: "x", evidence: "y" }) + "\n");
  await assert.rejects(run(root), (error) =>
    error.stderr.includes("invalid JSON")
    && error.stderr.includes("not a plain object")
    && error.stderr.includes("value for date is not a string")
    && error.stderr.includes("missing key(s): promoted_to")
  );
});

test("blank line in the middle fails", async () => {
  const root = await fixture();
  await writeFile(path.join(root, ".memory/corrections.jsonl"), JSON.stringify(record()) + "\n\n" + JSON.stringify(record()) + "\n");
  await assert.rejects(run(root), (error) => error.stderr.includes("blank line"));
});

test("a repository without records passes", async () => {
  const root = await fixture();
  await rm(path.join(root, ".memory"), { recursive: true });
  const { stdout } = await run(root);
  assert.match(stdout, /ok {3}corrections: no records/);
});

test("only the folder form passes, with or without .gitkeep", async () => {
  const root = await fixture();
  await removeJsonl(root);
  await writeRecords(root, {
    "2026-11-04-one.json": canonical(record()),
    "2026-11-05-two.json": canonical(record("2026-11-05", { correction: "Second" })),
    ".gitkeep": "",
  });
  const { stdout } = await run(root);
  assert.match(stdout, /ok {3}corrections: 2 records\n$/);

  await writeRecords(root, { ".gitkeep": "" });
  await rm(path.join(root, ".memory/corrections/2026-11-04-one.json"));
  await rm(path.join(root, ".memory/corrections/2026-11-05-two.json"));
  const empty = await run(root);
  assert.match(empty.stdout, /ok {3}corrections: 0 records/);
});

test("an empty folder counts as no records", async () => {
  const root = await fixture();
  await removeJsonl(root);
  await mkdir(path.join(root, ".memory/corrections"), { recursive: true });
  const { stdout } = await run(root);
  assert.match(stdout, /ok {3}corrections: no records/);
});

test("both forms fail with the migration text", async () => {
  const root = await fixture();
  await writeJsonl(root, [record()]);
  await writeRecords(root, { "2026-11-04-one.json": canonical(record()) });
  await assert.rejects(run(root), (error) =>
    error.code === 1
    && error.stderr.includes("both .memory/corrections.jsonl and .memory/corrections/ exist; finish the migration")
    && error.stdout.includes("FAIL corrections: 1 problem(s)")
  );
});

test("a duplicate key fails, also when one copy is escaped", async () => {
  const root = await fixture();
  const line = JSON.stringify(record());
  await writeFile(path.join(root, ".memory/corrections.jsonl"), line.replace("{", '{"correction":"hidden",') + "\n");
  await assert.rejects(run(root), (error) => error.stderr.includes("duplicate key(s): correction"));

  await writeFile(path.join(root, ".memory/corrections.jsonl"), line.replace("{", '{"\\u0063orrection":"hidden",') + "\n");
  await assert.rejects(run(root), (error) => error.stderr.includes("duplicate key(s): correction"));
});

test("--file exits 2", async () => {
  const root = await fixture();
  await assert.rejects(run(root, ["--file", path.join(root, ".memory/corrections.jsonl")]), (error) =>
    error.code === 2 && error.stderr.includes("Usage: node scripts/check-corrections.mjs [--root DIR] [--base REF]")
  );
});

// -------------------------------------------------------- the folder rules --

test("folder: a bad file name fails", async () => {
  const root = await fixture();
  await removeJsonl(root);
  await writeRecords(root, { "2026-11-04-Bad_Slug.json": canonical(record()) });
  await assert.rejects(run(root), (error) =>
    error.stderr.includes("FAIL corrections: .memory/corrections/2026-11-04-Bad_Slug.json: bad file name")
  );
});

test("folder: a slug longer than 60 characters fails", async () => {
  const root = await fixture();
  await removeJsonl(root);
  const slug = "a".repeat(61);
  await writeRecords(root, { [`2026-11-04-${slug}.json`]: canonical(record()) });
  await assert.rejects(run(root), (error) => error.stderr.includes("slug longer than 60 characters"));

  await writeRecords(root, { [`2026-11-04-${"a".repeat(60)}.json`]: canonical(record()) });
  await rm(path.join(root, `.memory/corrections/2026-11-04-${slug}.json`));
  const { stdout } = await run(root);
  assert.match(stdout, /1 records/);
});

test("folder: a name date other than the record date fails", async () => {
  const root = await fixture();
  await removeJsonl(root);
  await writeRecords(root, { "2026-11-05-one.json": canonical(record("2026-11-04")) });
  await assert.rejects(run(root), (error) => error.stderr.includes("name date 2026-11-05 does not equal date 2026-11-04"));
});

test("folder: compact JSON is not the canonical form", async () => {
  const root = await fixture();
  await removeJsonl(root);
  await writeRecords(root, { "2026-11-04-one.json": JSON.stringify(record()) + "\n" });
  await assert.rejects(run(root), (error) => error.stderr.includes("not in canonical form"));
});

test("folder: another key order is not the canonical form", async () => {
  const root = await fixture();
  await removeJsonl(root);
  const swapped = record();
  const text = JSON.stringify({
    scope: swapped.scope,
    date: swapped.date,
    correction: swapped.correction,
    evidence: swapped.evidence,
    promoted_to: swapped.promoted_to,
  }, null, 2);
  await writeRecords(root, { "2026-11-04-one.json": `${text}\n` });
  await assert.rejects(run(root), (error) => error.stderr.includes("not in canonical form"));
});

test("folder: a missing final newline is not the canonical form", async () => {
  const root = await fixture();
  await removeJsonl(root);
  await writeRecords(root, { "2026-11-04-one.json": canonical(record()).subarray(0, canonical(record()).length - 1) });
  await assert.rejects(run(root), (error) => error.stderr.includes("not in canonical form"));
});

test("folder: a non-empty .gitkeep fails", async () => {
  const root = await fixture();
  await removeJsonl(root);
  await writeRecords(root, { ".gitkeep": "x" });
  await assert.rejects(run(root), (error) => error.stderr.includes(".memory/corrections/.gitkeep: .gitkeep is not empty"));
});

test("folder: a symbolic link fails and is not followed", async () => {
  const root = await fixture();
  await removeJsonl(root);
  const outside = path.join(root, "outside.json");
  await writeFile(outside, canonical(record()));
  await mkdir(path.join(root, ".memory/corrections"), { recursive: true });
  await symlink(outside, path.join(root, ".memory/corrections/2026-11-04-one.json"));
  await assert.rejects(run(root), (error) => error.stderr.includes("symbolic link, not followed"));
});

test("folder: a subfolder fails", async () => {
  const root = await fixture();
  await removeJsonl(root);
  await mkdir(path.join(root, ".memory/corrections/sub"), { recursive: true });
  await writeFile(path.join(root, ".memory/corrections/sub/x.json"), canonical(record()));
  await assert.rejects(run(root), (error) => error.stderr.includes("not a regular file"));
});

test("folder: invalid UTF-8 fails", async () => {
  const root = await fixture();
  await removeJsonl(root);
  const bytes = canonical(record());
  // A lone 0x80 byte can never be part of valid UTF-8 text.
  const broken = Buffer.concat([bytes.subarray(0, 5), Buffer.from([0x80]), bytes.subarray(5)]);
  await writeRecords(root, { "2026-11-04-one.json": broken });
  await assert.rejects(run(root), (error) => error.stderr.includes("invalid UTF-8"));
});

test("folder: a duplicate key fails", async () => {
  const root = await fixture();
  await removeJsonl(root);
  const text = canonical(record()).toString("utf8");
  await writeRecords(root, { "2026-11-04-one.json": text.replace("{", '{"correction": "hidden",') });
  await assert.rejects(run(root), (error) => error.stderr.includes("duplicate key(s): correction"));
});

test("folder: the content rules of a record apply", async () => {
  const root = await fixture();
  await removeJsonl(root);
  const withExtra = `${JSON.stringify({ ...record(), correction: "  ", extra: "bad" }, null, 2)}\n`;
  await writeRecords(root, { "2026-11-04-one.json": withExtra });
  await assert.rejects(run(root), (error) =>
    error.stderr.includes("correction is empty") && error.stderr.includes("unknown key(s): extra")
  );

  await writeRecords(root, { "2026-11-04-one.json": canonical(record("2026-02-30")) });
  await assert.rejects(run(root), (error) => error.stderr.includes("invalid date: 2026-02-30"));
});

test("every problem is listed and the count is the number of problems", async () => {
  const root = await fixture();
  await removeJsonl(root);
  await writeRecords(root, {
    "bad-name.json": canonical(record()),
    "2026-11-04-one.json": JSON.stringify(record()) + "\n",
    ".gitkeep": "x",
  });
  await assert.rejects(run(root), (error) => error.stdout.includes("FAIL corrections: 3 problem(s)"));
});

test("a symbolic link at .memory fails, with and without --base", async () => {
  const root = await fixture();
  await removeJsonl(root);
  await writeRecords(root, { "2026-11-04-one.json": canonical(record()) });
  await initGit(root);
  await commitAll(root);
  // The records move behind a relative link: the paths the gate reads still
  // resolve, so a gate that follows the link would pass.
  await rename(path.join(root, ".memory"), path.join(root, "archive"));
  await symlink("archive", path.join(root, ".memory"), "dir");

  await assert.rejects(run(root), (error) =>
    error.code === 1 && error.stderr.includes("FAIL corrections: .memory: symbolic link, not followed")
  );
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) =>
    error.code === 1 && error.stderr.includes("FAIL corrections: .memory: symbolic link, not followed")
  );
});

// ------------------------------------------------------------------ --base --

test("base removal of line 1 or last line fails", async () => {
  const root = await fixture();
  await writeJsonl(root, [record(), record("2026-11-05", { correction: "Second" })]);
  await initGit(root);
  await commitAll(root);

  await writeJsonl(root, [record("2026-11-05", { correction: "Second" })]);
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) => /removed|changed/.test(error.stderr));

  await writeJsonl(root, [record()]);
  await commitAll(root, "one line base");
  await writeJsonl(root, []);
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) => error.stderr.includes("removed"));
});

test("base promotion from empty promoted_to passes", async () => {
  const root = await fixture();
  await writeJsonl(root, [record()]);
  await initGit(root);
  await commitAll(root);
  await writeJsonl(root, [{ ...record(), promoted_to: "AGENTS.md" }]);
  const { stdout } = await run(root, ["--base", "HEAD"]);
  assert.match(stdout, /append-only vs HEAD/);
});

test("base correction change fails and filled promoted_to change fails", async () => {
  const root = await fixture();
  await writeJsonl(root, [record()]);
  await initGit(root);
  await commitAll(root);
  await writeJsonl(root, [{ ...record(), correction: "Changed" }]);
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) => error.stderr.includes("changed"));

  await writeJsonl(root, [{ ...record(), promoted_to: "AGENTS.md" }]);
  await commitAll(root, "promote");
  await writeJsonl(root, [{ ...record(), promoted_to: "docs/other.md" }]);
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) => error.stderr.includes("changed"));
});

test("base accepts valid append and rejects invalid append", async () => {
  const root = await fixture();
  await writeJsonl(root, [record()]);
  await initGit(root);
  await commitAll(root);
  await writeJsonl(root, [record(), record("2026-11-05", { correction: "Appended" })]);
  await run(root, ["--base", "HEAD"]);

  await writeFile(path.join(root, ".memory/corrections.jsonl"), JSON.stringify(record()) + "\n" + "{bad}\n");
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) => error.stderr.includes("invalid JSON"));
});

test("base absent file passes and nosuchref fails", async () => {
  const root = await fixture();
  await initGit(root);
  await execFileAsync("git", ["commit", "--quiet", "--allow-empty", "-m", "empty"], { cwd: root });
  await writeJsonl(root, [record()]);
  await run(root, ["--base", "HEAD"]);

  await assert.rejects(run(root, ["--base", "nosuchref"]), (error) => error.stderr.includes("base ref nosuchref does not exist"));
});

test("base: a removed old file fails", async () => {
  const root = await fixture();
  await writeJsonl(root, [record()]);
  await initGit(root);
  await commitAll(root);
  await execFileAsync("rm", ["-rf", path.join(root, ".memory")]);
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) => error.code === 1 && error.stderr.includes("removed (it exists at HEAD)"));
  const { stdout } = await run(root);
  assert.match(stdout, /no records/);
});

test("base: an unreadable base object fails instead of passing", async () => {
  const root = await fixture();
  await writeJsonl(root, [record()]);
  await initGit(root);
  await commitAll(root);
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD:.memory/corrections.jsonl"], { cwd: root });
  const blob = stdout.trim();
  await rm(path.join(root, ".git/objects", blob.slice(0, 2), blob.slice(2)));
  await writeJsonl(root, [record("2026-11-05", { correction: "Replaced" })]);
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) => error.code === 1 && error.stderr.includes("cannot read"));
});

test("base: a missing file with a bad ref fails", async () => {
  const root = await fixture();
  await initGit(root);
  await execFileAsync("git", ["-c", "user.email=test@example.invalid", "-c", "user.name=Test", "commit", "--quiet", "--allow-empty", "-m", "empty"], { cwd: root });
  await rm(path.join(root, ".memory"), { recursive: true });
  await assert.rejects(run(root, ["--base", "nosuchref"]), (error) => error.code === 1 && error.stderr.includes("does not exist"));
});

test("base: a bad ref with a folder fails", async () => {
  const root = await fixture();
  await removeJsonl(root);
  await writeRecords(root, { "2026-11-04-one.json": canonical(record()) });
  await initGit(root);
  await commitAll(root);
  await assert.rejects(run(root, ["--base", "nosuchref"]), (error) =>
    error.code === 1 && error.stderr.includes("base ref nosuchref does not exist")
  );
});

test("base: an unreadable base record file fails instead of passing", async () => {
  const root = await fixture();
  await removeJsonl(root);
  await writeRecords(root, { "2026-11-04-one.json": canonical(record()) });
  await initGit(root);
  await commitAll(root);
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD:.memory/corrections/2026-11-04-one.json"], { cwd: root });
  const blob = stdout.trim();
  await rm(path.join(root, ".git/objects", blob.slice(0, 2), blob.slice(2)));
  await writeRecords(root, { "2026-11-04-one.json": canonical(record("2026-11-05")) });
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) => error.code === 1 && error.stderr.includes("cannot read"));
});

test("base folder to folder: the same records pass", async () => {
  const root = await fixture();
  await removeJsonl(root);
  await writeRecords(root, { "2026-11-04-one.json": canonical(record()), ".gitkeep": "" });
  await initGit(root);
  await commitAll(root);
  const { stdout } = await run(root, ["--base", "HEAD"]);
  assert.match(stdout, /ok {3}corrections: 1 records, append-only vs HEAD/);
});

test("base folder: .gitkeep removed when the first record comes passes", async () => {
  const root = await fixture();
  await removeJsonl(root);
  await writeRecords(root, { ".gitkeep": "" });
  await initGit(root);
  await commitAll(root);
  await rm(path.join(root, ".memory/corrections/.gitkeep"));
  await writeRecords(root, { "2026-11-04-one.json": canonical(record()) });
  const { stdout } = await run(root, ["--base", "HEAD"]);
  assert.match(stdout, /ok {3}corrections: 1 records, append-only vs HEAD/);
});

test("base folder: a new record passes, and a promotion of an empty promoted_to passes", async () => {
  const root = await fixture();
  await removeJsonl(root);
  await writeRecords(root, { "2026-11-04-one.json": canonical(record()) });
  await initGit(root);
  await commitAll(root);

  await writeRecords(root, { "2026-11-05-two.json": canonical(record("2026-11-05")) });
  await run(root, ["--base", "HEAD"]);

  await commitAll(root, "second record");
  await writeRecords(root, { "2026-11-04-one.json": canonical({ ...record(), promoted_to: "AGENTS.md" }) });
  const { stdout } = await run(root, ["--base", "HEAD"]);
  assert.match(stdout, /ok {3}corrections: 2 records, append-only vs HEAD/);
});

test("base folder: a removed record fails", async () => {
  const root = await fixture();
  await removeJsonl(root);
  await writeRecords(root, { "2026-11-04-one.json": canonical(record()) });
  await initGit(root);
  await commitAll(root);
  await rm(path.join(root, ".memory/corrections/2026-11-04-one.json"));
  await writeRecords(root, { "2026-11-04-renamed.json": canonical(record()) });
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) =>
    error.stderr.includes("FAIL corrections: .memory/corrections/2026-11-04-one.json: record removed (it exists at HEAD)")
  );
});

test("base folder: a changed record fails", async () => {
  const root = await fixture();
  await removeJsonl(root);
  await writeRecords(root, { "2026-11-04-one.json": canonical(record()) });
  await initGit(root);
  await commitAll(root);
  await writeRecords(root, { "2026-11-04-one.json": canonical({ ...record(), correction: "Changed" }) });
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) =>
    error.stderr.includes("record changed (only an empty promoted_to may be filled)")
  );
});

test("base folder: a changed filled promoted_to fails", async () => {
  const root = await fixture();
  await removeJsonl(root);
  await writeRecords(root, { "2026-11-04-one.json": canonical({ ...record(), promoted_to: "AGENTS.md" }) });
  await initGit(root);
  await commitAll(root);
  await writeRecords(root, { "2026-11-04-one.json": canonical({ ...record(), promoted_to: "docs/other.md" }) });
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) => error.stderr.includes("record changed"));
});

test("base folder: a new legacy- record fails", async () => {
  const root = await fixture();
  await removeJsonl(root);
  await writeRecords(root, { "2026-11-04-one.json": canonical(record()) });
  await initGit(root);
  await commitAll(root);
  await writeRecords(root, { "2026-11-05-legacy-0001.json": canonical(record("2026-11-05")) });
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) =>
    error.stderr.includes("new legacy- record (legacy- is reserved for the move from .memory/corrections.jsonl)")
  );
});

test("base folder: the old file at the head fails", async () => {
  const root = await fixture();
  await removeJsonl(root);
  await writeRecords(root, { "2026-11-04-one.json": canonical(record()) });
  await initGit(root);
  await commitAll(root);
  await rm(path.join(root, ".memory/corrections"), { recursive: true });
  await writeJsonl(root, [record()]);
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) =>
    error.stderr.includes("is retired in this repository; add a file under .memory/corrections/")
  );
});

test("base folder: a removed folder fails", async () => {
  const root = await fixture();
  await removeJsonl(root);
  await writeRecords(root, { "2026-11-04-one.json": canonical(record()) });
  await initGit(root);
  await commitAll(root);
  await rm(path.join(root, ".memory/corrections"), { recursive: true });
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) =>
    error.stderr.includes("FAIL corrections: .memory/corrections: removed (it exists at HEAD)")
  );
});

test("base folder with only .gitkeep: removing it fails", async () => {
  const root = await fixture();
  await removeJsonl(root);
  await writeRecords(root, { ".gitkeep": "" });
  await initGit(root);
  await commitAll(root);
  await rm(path.join(root, ".memory/corrections"), { recursive: true });
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) =>
    error.stderr.includes(".memory/corrections: removed (it exists at HEAD)")
  );
});

test("base old file: the move to the folder passes, and a promotion of a moved record passes", async () => {
  const root = await fixture();
  await writeJsonl(root, [record(), record("2026-11-05", { correction: "Second" })]);
  await initGit(root);
  await commitAll(root);
  await removeJsonl(root);
  await writeRecords(root, {
    "2026-11-04-legacy-0001.json": canonical(record()),
    "2026-11-05-legacy-0002.json": canonical({ ...record("2026-11-05", { correction: "Second" }), promoted_to: "AGENTS.md" }),
  });
  const { stdout } = await run(root, ["--base", "HEAD"]);
  assert.match(stdout, /ok {3}corrections: 2 records, append-only vs HEAD/);
});

test("base old file: a move that drops a line fails", async () => {
  const root = await fixture();
  await writeJsonl(root, [record(), record("2026-11-05", { correction: "Second" })]);
  await initGit(root);
  await commitAll(root);
  await removeJsonl(root);
  await writeRecords(root, { "2026-11-04-legacy-0001.json": canonical(record()) });
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) =>
    error.stderr.includes("FAIL corrections: .memory/corrections/2026-11-05-legacy-0002.json: missing legacy- record for line 2")
  );
});

test("base old file: a move that changes a line fails", async () => {
  const root = await fixture();
  await writeJsonl(root, [record()]);
  await initGit(root);
  await commitAll(root);
  await removeJsonl(root);
  await writeRecords(root, { "2026-11-04-legacy-0001.json": canonical({ ...record(), correction: "Changed" }) });
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) =>
    error.stderr.includes("record differs from line 1 of .memory/corrections.jsonl")
  );
});

test("base old file: a bad byte in the old file fails the move", async () => {
  const root = await fixture();
  // The base line holds a lone 0x80: a lossy decode would read it as U+FFFD
  // and accept the record the head shows.
  await writeFile(path.join(root, ".memory/corrections.jsonl"), Buffer.concat([
    Buffer.from('{"date":"2026-11-04","scope":"agent","correction":"a', "utf8"),
    Buffer.from([0x80]),
    Buffer.from('b","evidence":"check","promoted_to":""}\n', "utf8"),
  ]));
  await initGit(root);
  await commitAll(root);
  await removeJsonl(root);
  await writeRecords(root, { "2026-11-04-legacy-0001.json": canonical(record("2026-11-04", { correction: "a\uFFFDb" })) });
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) =>
    error.code === 1 && error.stderr.includes(".memory/corrections.jsonl at HEAD is not valid UTF-8")
  );
});

test("base old file: an extra legacy- file with no number fails", async () => {
  const root = await fixture();
  await writeJsonl(root, [record()]);
  await initGit(root);
  await commitAll(root);
  await removeJsonl(root);
  await writeRecords(root, {
    "2026-11-04-legacy-0001.json": canonical(record()),
    "2026-11-04-legacy-x.json": canonical(record("2026-11-05")),
  });
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) =>
    error.stderr.includes("FAIL corrections: .memory/corrections/2026-11-04-legacy-x.json: legacy- record for no line in")
  );
});

test("base old file: a move with an extra legacy- file fails", async () => {
  const root = await fixture();
  await writeJsonl(root, [record()]);
  await initGit(root);
  await commitAll(root);
  await removeJsonl(root);
  await writeRecords(root, {
    "2026-11-04-legacy-0001.json": canonical(record()),
    "2026-11-04-legacy-0002.json": canonical(record("2026-11-05")),
  });
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) =>
    error.stderr.includes("legacy- record for line 2 but .memory/corrections.jsonl has 1 line(s) at HEAD")
  );
});

test("base old file: a moved record that loses a filled promoted_to fails", async () => {
  const root = await fixture();
  await writeJsonl(root, [{ ...record(), promoted_to: "AGENTS.md" }]);
  await initGit(root);
  await commitAll(root);
  await removeJsonl(root);
  await writeRecords(root, { "2026-11-04-legacy-0001.json": canonical(record()) });
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) =>
    error.stderr.includes("record differs from line 1 of .memory/corrections.jsonl")
  );
});

test("base old file: neither form at the head fails", async () => {
  const root = await fixture();
  await writeJsonl(root, [record()]);
  await initGit(root);
  await commitAll(root);
  await rm(path.join(root, ".memory"), { recursive: true });
  await assert.rejects(run(root, ["--base", "HEAD"]), (error) =>
    error.stderr.includes("FAIL corrections: .memory/corrections.jsonl: removed (it exists at HEAD)")
  );
});

// --------------------------------------------------------------- the script --

test("the default root works from a path with spaces", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "core corrections "));
  const root = path.join(parent, "repo with space");
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await mkdir(path.join(root, ".memory"), { recursive: true });
  await copyFile(script, path.join(root, "scripts/check-corrections.mjs"));
  await writeJsonl(root, [record()]);
  const { stdout } = await execFileAsync(process.execPath, [path.join(root, "scripts/check-corrections.mjs")], { cwd: os.tmpdir() });
  assert.match(stdout, /ok {3}corrections: 1 lines \(legacy form/);
});

test("the default root finds a folder form without --root", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "core corrections folder "));
  const root = path.join(parent, "repo");
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await copyFile(script, path.join(root, "scripts/check-corrections.mjs"));
  await writeRecords(root, { "2026-11-04-one.json": canonical(record()) });
  const { stdout } = await execFileAsync(process.execPath, [path.join(root, "scripts/check-corrections.mjs")], { cwd: os.tmpdir() });
  assert.match(stdout, /ok {3}corrections: 1 records/);
  assert.deepEqual(await readdir(path.join(root, ".memory/corrections")), ["2026-11-04-one.json"]);
});

test("unknown option exits 2", async () => {
  const root = await fixture();
  await assert.rejects(run(root, ["--unknown"]), (error) => error.code === 2 && error.stderr.includes("Usage:"));
});
