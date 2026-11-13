import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrate = path.join(repoRoot, "scripts/migrate-corrections.mjs");
const check = path.join(repoRoot, "scripts/check-corrections.mjs");

function record(date = "2026-11-04", extra = {}) {
  return { date, scope: "agent", correction: "Use the canonical validator", evidence: "check", promoted_to: "", ...extra };
}

function jsonlText(objects) {
  return objects.map((object) => JSON.stringify(object)).join("\n") + (objects.length ? "\n" : "");
}

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

const roots = [];
test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "core-migrate-corrections-"));
  roots.push(root);
  mkdirSync(path.join(root, ".memory"), { recursive: true });
  return root;
}

// A folder that holds nothing, outside the fixture tree.
function emptyDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "core-migrate-outside-"));
  roots.push(dir);
  return dir;
}

function writeOld(root, objects) {
  writeFileSync(path.join(root, ".memory/corrections.jsonl"), jsonlText(objects));
}

function writeRecords(root, files) {
  const folder = path.join(root, ".memory/corrections");
  mkdirSync(folder, { recursive: true });
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(folder, name), content);
}

// Every path below the root with its bytes, so 2 trees are compared by path and
// content only: never by mtime, order of creation or a temp file left behind.
function snapshot(root) {
  const entries = [];
  function walk(folder) {
    for (const name of readdirSync(folder).sort()) {
      if (name === ".git") continue;
      const absolute = path.join(folder, name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      const stat = lstatSync(absolute);
      if (stat.isDirectory()) {
        entries.push([`${relative}/`, null]);
        walk(absolute);
      } else if (stat.isSymbolicLink()) {
        entries.push([relative, `link:${readlinkSync(absolute)}`]);
      } else {
        entries.push([relative, readFileSync(absolute).toString("base64")]);
      }
    }
  }
  walk(root);
  return entries;
}

function run(root, extra = []) {
  return execFileAsync(process.execPath, [migrate, "--root", root, ...extra], { cwd: root });
}

function runCheck(root, extra = []) {
  return execFileAsync(process.execPath, [check, "--root", root, ...extra], { cwd: root });
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

function copyTree(source, target) {
  mkdirSync(target, { recursive: true });
  for (const name of readdirSync(source)) {
    const from = path.join(source, name);
    const to = path.join(target, name);
    const stat = lstatSync(from);
    if (stat.isDirectory()) copyTree(from, to);
    else writeFileSync(to, readFileSync(from));
  }
}

// ------------------------------------------------------------ the old file --

test("a repository without the old file exits 0 and changes nothing", async () => {
  const root = fixture();
  writeRecords(root, { "2026-11-04-one.json": canonical(record()) });
  const before = snapshot(root);
  const { stdout } = await run(root);
  assert.equal(stdout, "nothing to migrate\n");
  assert.deepEqual(snapshot(root), before);
});

test("a bad line writes nothing", async () => {
  const root = fixture();
  writeFileSync(
    path.join(root, ".memory/corrections.jsonl"),
    `${JSON.stringify(record())}\n{bad json}\n${JSON.stringify({ ...record(), extra: "x" })}\n`,
  );
  const before = snapshot(root);
  await assert.rejects(run(root), (error) =>
    error.code === 1
    && error.stderr.includes(".memory/corrections.jsonl:2: invalid JSON")
    && error.stderr.includes("unknown key(s): extra")
  );
  assert.deepEqual(snapshot(root), before);
  assert.ok(readFileSync(path.join(root, ".memory/corrections.jsonl"), "utf8").includes("{bad json}"));
});

test("a destination clash without --pr leaves every file unchanged", async () => {
  const root = fixture();
  writeOld(root, [record(), record("2026-11-05", { correction: "Second" })]);
  writeRecords(root, { "2026-11-04-legacy-0001.json": canonical(record("2026-11-04", { correction: "Other" })) });
  const before = snapshot(root);
  await assert.rejects(run(root), (error) =>
    error.code === 1 && error.stderr.includes("record file exists with other bytes: .memory/corrections/2026-11-04-legacy-0001.json")
  );
  assert.deepEqual(snapshot(root), before);
});

test("a destination clash with --pr leaves every file unchanged", async () => {
  const root = fixture();
  writeOld(root, [record("2026-11-06", { correction: "New" })]);
  writeRecords(root, {
    "2026-11-01-legacy-0001.json": canonical(record()),
    "2026-11-06-pr-12-1.json": canonical(record("2026-11-06", { correction: "Different" })),
  });
  const before = snapshot(root);
  await assert.rejects(run(root, ["--pr", "12"]), (error) => error.code === 1 && error.stderr.includes("exists with other bytes"));
  assert.deepEqual(snapshot(root), before);
});

test("the old file of 0 lines becomes an empty .gitkeep", async () => {
  const root = fixture();
  writeOld(root, []);
  const { stdout } = await run(root);
  assert.equal(stdout, "migrated 0 records (0 new files, 0 unchanged, 0 promoted)\n");
  assert.deepEqual(readdirSync(path.join(root, ".memory")).sort(), ["corrections"]);
  assert.deepEqual(readdirSync(path.join(root, ".memory/corrections")), [".gitkeep"]);
  assert.equal(readFileSync(path.join(root, ".memory/corrections/.gitkeep"), "utf8"), "");
  const { stdout: ok } = await runCheck(root);
  assert.equal(ok, "ok   corrections: 0 records\n");
});

test("line N becomes <date>-legacy-<NNNN>.json in the canonical form", async () => {
  const root = fixture();
  writeOld(root, [record(), record("2026-11-05", { correction: "Second", promoted_to: "AGENTS.md" })]);
  const { stdout } = await run(root);
  assert.equal(stdout, "migrated 2 records (2 new files, 0 unchanged, 0 promoted)\n");
  assert.deepEqual(readdirSync(path.join(root, ".memory/corrections")).sort(), [
    "2026-11-04-legacy-0001.json",
    "2026-11-05-legacy-0002.json",
  ]);
  assert.deepEqual(
    readFileSync(path.join(root, ".memory/corrections/2026-11-05-legacy-0002.json")),
    canonical(record("2026-11-05", { correction: "Second", promoted_to: "AGENTS.md" })),
  );
  assert.equal(readdirSync(path.join(root, ".memory")).includes("corrections.jsonl"), false);
});

test("2 runs on 2 equal fixtures give byte-equal trees", async () => {
  const first = fixture();
  const second = fixture();
  const objects = [record(), record("2026-11-05", { correction: "Second" })];
  writeOld(first, objects);
  writeOld(second, objects);
  await run(first);
  await run(second);
  assert.deepEqual(snapshot(first), snapshot(second));
});

test("a rerun after a stop gives a tree byte-equal to a clean run", async () => {
  const clean = fixture();
  const partial = fixture();
  const objects = [record(), record("2026-11-05", { correction: "Second" }), record("2026-11-06", { correction: "Third" })];
  writeOld(clean, objects);
  writeOld(partial, objects);
  // What a run that stopped after its first file would leave behind.
  writeRecords(partial, {
    "2026-11-04-legacy-0001.json": canonical(record()),
    ".migrate-2026-11-05-legacy-0002.json.tmp": canonical(record("2026-11-05")),
  });
  await run(partial);
  await run(clean);
  // The leftover temp file of the stopped run is outside the output: compare
  // the records and the old file, which must both be identical.
  const withoutTemp = (entries) => entries.filter(([name]) => !name.endsWith(".tmp"));
  assert.deepEqual(withoutTemp(snapshot(partial)), withoutTemp(snapshot(clean)));
});

test("the migration output passes the validator against the base with the old file", async () => {
  const root = fixture();
  writeOld(root, [record(), record("2026-11-05", { correction: "Second", promoted_to: "AGENTS.md" })]);
  await initGit(root);
  await commitAll(root, "old form");
  const { stdout: head } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
  await run(root);
  const { stdout } = await runCheck(root, ["--base", head.trim()]);
  assert.equal(stdout, "ok   corrections: 2 records, append-only vs " + head.trim() + "\n");
});

test("more than 9999 lines use 5-digit names", async () => {
  const root = fixture();
  const total = 10001;
  const objects = [];
  for (let i = 0; i < total; i++) objects.push(record("2026-11-04", { correction: `Correction ${i + 1}` }));
  writeOld(root, objects);
  const { stdout } = await run(root);
  assert.equal(stdout, `migrated ${total} records (${total} new files, 0 unchanged, 0 promoted)\n`);
  const names = readdirSync(path.join(root, ".memory/corrections")).sort();
  assert.equal(names.length, total);
  assert.equal(names[0], "2026-11-04-legacy-00001.json");
  assert.equal(names[total - 1], "2026-11-04-legacy-10001.json");
});

test("invalid UTF-8 in the old file exits 1 and writes nothing", async () => {
  const root = fixture();
  // A lone 0x80 byte inside a field: a lossy decode would write U+FFFD into
  // the record and no error would show.
  writeFileSync(path.join(root, ".memory/corrections.jsonl"), Buffer.concat([
    Buffer.from('{"date":"2026-11-04","scope":"agent","correction":"a', "utf8"),
    Buffer.from([0x80]),
    Buffer.from('b","evidence":"check","promoted_to":""}\n', "utf8"),
  ]));
  const before = snapshot(root);
  await assert.rejects(run(root), (error) => error.code === 1 && error.stderr.includes("not valid UTF-8"));
  assert.deepEqual(snapshot(root), before);
});

test("a link at a temp name is never followed and its target stays unchanged", async () => {
  const root = fixture();
  const outside = emptyDir();
  const target = path.join(outside, "keep.txt");
  writeFileSync(target, "keep me");
  // The temp path of an earlier fixed form: a write that follows it would
  // land outside the repository.
  symlinkSync(target, path.join(root, ".memory/.migrate-2026-11-04-legacy-0001.json.tmp"));
  writeOld(root, [record()]);

  const { stdout } = await run(root);
  assert.equal(stdout, "migrated 1 records (1 new files, 0 unchanged, 0 promoted)\n");
  assert.equal(readFileSync(target, "utf8"), "keep me");
  assert.deepEqual(readdirSync(outside), ["keep.txt"]);
  // The only temp entry left is the link of the fixture: this run made none.
  assert.deepEqual(readdirSync(path.join(root, ".memory")).filter((name) => name.endsWith(".tmp")), [
    ".migrate-2026-11-04-legacy-0001.json.tmp",
  ]);
});

test("a symbolic link at the folder exits 1 and keeps the old file", async () => {
  const root = fixture();
  const outside = emptyDir();
  writeOld(root, [record()]);
  symlinkSync(outside, path.join(root, ".memory/corrections"));
  const before = snapshot(root);
  await assert.rejects(run(root), (error) =>
    error.code === 1 && error.stderr.includes(".memory/corrections: symbolic link, not followed")
  );
  await assert.rejects(run(root, ["--pr", "7"]), (error) => error.code === 1 && error.stderr.includes("symbolic link, not followed"));
  assert.deepEqual(snapshot(root), before);
  assert.deepEqual(readdirSync(outside), []);
});

test("a symbolic link at .memory exits 1 and keeps the old file", async () => {
  const root = emptyDir();
  const outside = emptyDir();
  writeFileSync(path.join(outside, "corrections.jsonl"), jsonlText([record()]));
  symlinkSync(outside, path.join(root, ".memory"));

  await assert.rejects(run(root), (error) => error.code === 1 && error.stderr.includes(".memory: symbolic link, not followed"));
  assert.deepEqual(readdirSync(outside), ["corrections.jsonl"]);
  assert.deepEqual(readdirSync(root), [".memory"]);
});

test("a file at the folder path exits 1 and keeps the old file", async () => {
  const root = fixture();
  writeOld(root, [record()]);
  writeFileSync(path.join(root, ".memory/corrections"), "not a folder");
  const before = snapshot(root);
  await assert.rejects(run(root), (error) => error.code === 1 && error.stderr.includes(".memory/corrections: not a folder"));
  assert.deepEqual(snapshot(root), before);
});

// ----------------------------------------------------------------- --pr N --

test("--pr without the folder exits 1 and changes nothing", async () => {
  const root = fixture();
  writeOld(root, [record()]);
  const before = snapshot(root);
  await assert.rejects(run(root, ["--pr", "7"]), (error) =>
    error.code === 1 && error.stderr.includes("no .memory/corrections/ folder: run without --pr")
  );
  assert.deepEqual(snapshot(root), before);
});

test("--pr keeps a record whose promoted_to is equal", async () => {
  const root = fixture();
  writeOld(root, [record()]);
  writeRecords(root, { "2026-11-01-legacy-0001.json": canonical(record()) });
  const { stdout } = await run(root, ["--pr", "7"]);
  assert.equal(stdout, "migrated 1 records (0 new files, 1 unchanged, 0 promoted)\n");
  assert.deepEqual(readdirSync(path.join(root, ".memory/corrections")), ["2026-11-01-legacy-0001.json"]);
  assert.equal(readdirSync(path.join(root, ".memory")).includes("corrections.jsonl"), false);
});

test("--pr fills a promotion that main does not have", async () => {
  const root = fixture();
  writeOld(root, [{ ...record(), promoted_to: "AGENTS.md" }]);
  writeRecords(root, { "2026-11-01-legacy-0001.json": canonical(record()) });
  const { stdout } = await run(root, ["--pr", "7"]);
  assert.equal(stdout, "migrated 1 records (0 new files, 0 unchanged, 1 promoted)\n");
  assert.deepEqual(
    readFileSync(path.join(root, ".memory/corrections/2026-11-01-legacy-0001.json")),
    canonical({ ...record(), promoted_to: "AGENTS.md" }),
  );
});

test("--pr keeps a promotion that main already has", async () => {
  const root = fixture();
  writeOld(root, [record()]);
  writeRecords(root, { "2026-11-01-legacy-0001.json": canonical({ ...record(), promoted_to: "AGENTS.md" }) });
  const { stdout } = await run(root, ["--pr", "7"]);
  assert.equal(stdout, "migrated 1 records (0 new files, 1 unchanged, 0 promoted)\n");
  assert.deepEqual(
    readFileSync(path.join(root, ".memory/corrections/2026-11-01-legacy-0001.json")),
    canonical({ ...record(), promoted_to: "AGENTS.md" }),
  );
});

test("--pr fails on 2 different promotions of 1 record", async () => {
  const root = fixture();
  writeOld(root, [{ ...record(), promoted_to: "docs/other.md" }]);
  writeRecords(root, { "2026-11-01-legacy-0001.json": canonical({ ...record(), promoted_to: "AGENTS.md" }) });
  const before = snapshot(root);
  await assert.rejects(run(root, ["--pr", "7"]), (error) =>
    error.code === 1 && error.stderr.includes("2 promotions of 1 record: .memory/corrections/2026-11-01-legacy-0001.json and line 1")
  );
  assert.deepEqual(snapshot(root), before);
});

test("--pr writes a line with no match as <date>-pr-<N>-<k>.json", async () => {
  const root = fixture();
  writeOld(root, [
    record(),
    record("2026-11-06", { correction: "New one" }),
    record("2026-11-07", { correction: "New two" }),
  ]);
  writeRecords(root, { "2026-11-01-legacy-0001.json": canonical(record()) });
  const { stdout } = await run(root, ["--pr", "412"]);
  assert.equal(stdout, "migrated 3 records (2 new files, 1 unchanged, 0 promoted)\n");
  assert.deepEqual(readdirSync(path.join(root, ".memory/corrections")).sort(), [
    "2026-11-01-legacy-0001.json",
    "2026-11-06-pr-412-1.json",
    "2026-11-07-pr-412-2.json",
  ]);
});

test("--pr matches 2 lines with the same key to 2 records in file-name order", async () => {
  const root = fixture();
  const shared = record("2026-11-04", { correction: "Same key" });
  writeOld(root, [shared, { ...shared, promoted_to: "AGENTS.md" }]);
  writeRecords(root, {
    "2026-11-01-legacy-0001.json": canonical({ ...shared, promoted_to: "AGENTS.md" }),
    "2026-11-02-legacy-0002.json": canonical(shared),
  });
  const { stdout } = await run(root, ["--pr", "7"]);
  // Line 1 pairs with the first name (both filled: kept); line 2 pairs with
  // the second name (promoted).
  assert.equal(stdout, "migrated 2 records (0 new files, 1 unchanged, 1 promoted)\n");
  for (const name of ["2026-11-01-legacy-0001.json", "2026-11-02-legacy-0002.json"]) {
    assert.deepEqual(
      readFileSync(path.join(root, ".memory/corrections", name)),
      canonical({ ...shared, promoted_to: "AGENTS.md" }),
    );
  }
});

test("--pr does not match a file whose slug only contains legacy-", async () => {
  const root = fixture();
  writeOld(root, [record("2026-11-04", { correction: "Same key" })]);
  // A record of a pull request: its slug holds "legacy-" but does not start
  // with it, so it is never matched to a line of the old file.
  writeRecords(root, {
    "2026-11-04-pr-12-legacy-note.json": canonical(record("2026-11-04", { correction: "Same key" })),
  });
  const { stdout } = await run(root, ["--pr", "12"]);
  assert.equal(stdout, "migrated 1 records (1 new files, 0 unchanged, 0 promoted)\n");
  assert.deepEqual(readdirSync(path.join(root, ".memory/corrections")).sort(), [
    "2026-11-04-pr-12-1.json",
    "2026-11-04-pr-12-legacy-note.json",
  ]);
  assert.deepEqual(
    readFileSync(path.join(root, ".memory/corrections/2026-11-04-pr-12-legacy-note.json")),
    canonical(record("2026-11-04", { correction: "Same key" })),
  );
});

// ------------------------------------------------------------------ usage --

test("usage errors exit 2", async () => {
  const root = fixture();
  for (const extra of [["--pr", "0"], ["--pr", "-1"], ["--pr", "x"], ["--pr"], ["--unknown"], ["extra"]]) {
    await assert.rejects(run(root, extra), (error) => error.code === 2 && error.stderr.includes("Usage:"), extra.join(" "));
  }
});

test("a copy of a migrated tree is byte-equal (determinism)", async () => {
  const root = fixture();
  writeOld(root, [record(), record("2026-11-05", { correction: "Second" })]);
  await run(root);
  const copy = path.join(os.tmpdir(), `core-migrate-copy-${process.pid}-${Date.now()}`);
  roots.push(copy);
  copyTree(path.join(root, ".memory"), path.join(copy, ".memory"));
  assert.deepEqual(snapshot(copy), snapshot(root));
});
