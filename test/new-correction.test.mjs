import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts/new-correction.mjs");
const check = path.join(repoRoot, "scripts/check-corrections.mjs");
const usage = "Usage: node scripts/new-correction.mjs --root DIR --date YYYY-MM-DD --slug SLUG --scope S --correction C --evidence E [--promoted-to PATH]";

const roots = [];
test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "core-new-correction-"));
  roots.push(root);
  return root;
}

// A folder that holds nothing, outside the fixture tree.
function emptyDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "core-new-correction-outside-"));
  roots.push(dir);
  return dir;
}

function args(root, extra = []) {
  return [
    "--root", root,
    "--date", "2026-11-13",
    "--slug", "agent-scope-rule-3f9a",
    "--scope", "agent",
    "--correction", "Read both forms while repositories move",
    "--evidence", "review of PR 412",
    ...extra,
  ];
}

function run(root, extra) {
  return execFileAsync(process.execPath, [script, ...(extra === undefined ? args(root) : args(root, extra))], { cwd: root });
}

function tree(root) {
  try {
    return readdirSync(root, { recursive: true }).map(String).sort();
  } catch {
    return [];
  }
}

test("the helper writes 1 canonical record and prints its path", async () => {
  const root = fixture();
  const { stdout } = await run(root);
  assert.equal(stdout, ".memory/corrections/2026-11-13-agent-scope-rule-3f9a.json\n");
  const name = "2026-11-13-agent-scope-rule-3f9a.json";
  const expected = Buffer.from(`${JSON.stringify({
    date: "2026-11-13",
    scope: "agent",
    correction: "Read both forms while repositories move",
    evidence: "review of PR 412",
    promoted_to: "",
  }, null, 2)}\n`, "utf8");
  assert.deepEqual(readFileSync(path.join(root, ".memory/corrections", name)), expected);
  assert.deepEqual(readdirSync(path.join(root, ".memory/corrections")), [name]);
});

test("the written record passes the validator, also with --promoted-to", async () => {
  const root = fixture();
  await run(root);
  const { stdout } = await run(root, ["--slug", "second", "--promoted-to", "AGENTS.md"]);
  assert.equal(stdout, ".memory/corrections/2026-11-13-second.json\n");
  const { stdout: ok } = await execFileAsync(process.execPath, [check, "--root", root], { cwd: root });
  assert.equal(ok, "ok   corrections: 2 records\n");
});

test("a missing option exits 2", async () => {
  const root = fixture();
  const full = args(root);
  // From --date on: --root is the 1 option that defaults to the script's root.
  for (let i = 2; i < full.length; i += 2) {
    const without = [...full.slice(0, i), ...full.slice(i + 2)];
    await assert.rejects(execFileAsync(process.execPath, [script, ...without], { cwd: root }), (error) =>
      error.code === 2 && error.stderr.includes(usage), full[i]
    );
  }
  assert.deepEqual(tree(root), []);
});

test("an unknown option or a value that is a path exits 2", async () => {
  const root = fixture();
  await assert.rejects(execFileAsync(process.execPath, [script, ...args(root), "--unknown", "x"], { cwd: root }), (error) =>
    error.code === 2 && error.stderr.includes(usage)
  );
  await assert.rejects(execFileAsync(process.execPath, [script, ...args(root), "--root"], { cwd: root }), (error) =>
    error.code === 2 && error.stderr.includes(usage)
  );
});

test("a date that is not real exits 1 and writes nothing", async () => {
  const root = fixture();
  for (const date of ["2026-02-30", "2026-13-01", "2026-8-11", "20261113", ""]) {
    await assert.rejects(run(root, ["--date", date]), (error) => error.code === 1 && error.stderr.includes("invalid --date"), date);
  }
  assert.deepEqual(tree(root), []);
});

test("a slug outside the rule exits 1 and writes nothing", async () => {
  const root = fixture();
  for (const slug of ["Agent", "two words", "trailing-", "-leading", "UPPER", "a".repeat(61), "legacy-0001"]) {
    await assert.rejects(run(root, ["--slug", slug]), (error) => error.code === 1 && error.stderr.includes("invalid --slug"), slug);
  }
  assert.deepEqual(tree(root), []);
});

test("a slug of exactly 60 characters is accepted", async () => {
  const root = fixture();
  const slug = "a".repeat(60);
  const { stdout } = await run(root, ["--slug", slug]);
  assert.equal(stdout, `.memory/corrections/2026-11-13-${slug}.json\n`);
});

test("an empty scope, correction or evidence exits 1 and writes nothing", async () => {
  const root = fixture();
  for (const option of ["--scope", "--correction", "--evidence"]) {
    await assert.rejects(run(root, [option, "  "]), (error) => error.code === 1 && error.stderr.includes(`${option} is empty`), option);
  }
  assert.deepEqual(tree(root), []);
});

// Every repository moved to the folder (ADR-0081), so the helper writes only
// the folder form. A stale tree that still has the retired single file gets
// the record file too, and the validator then refuses the tree with both
// forms: the refusal lives in 1 place, the gate.
test("the helper writes only the folder form; the validator refuses a tree that still has the old file", async () => {
  const root = fixture();
  mkdirSync(path.join(root, ".memory"), { recursive: true });
  writeFileSync(path.join(root, ".memory/corrections.jsonl"), "");
  await run(root);
  assert.deepEqual(tree(root), [
    ".memory",
    ".memory/corrections",
    ".memory/corrections.jsonl",
    ".memory/corrections/2026-11-13-agent-scope-rule-3f9a.json",
  ]);
  await assert.rejects(execFileAsync(process.execPath, [check, "--root", root]), (error) =>
    error.code === 1 && error.stderr.includes("both .memory/corrections.jsonl and .memory/corrections/ exist; finish the migration")
  );
});

test("an existing record name exits 1 and does not change the file", async () => {
  const root = fixture();
  await run(root);
  const name = "2026-11-13-agent-scope-rule-3f9a.json";
  const before = readFileSync(path.join(root, ".memory/corrections", name));
  await assert.rejects(run(root, ["--correction", "Another text"]), (error) =>
    error.code === 1 && error.stderr.includes(`record exists: .memory/corrections/${name}`)
  );
  assert.deepEqual(readFileSync(path.join(root, ".memory/corrections", name)), before);
});

test("a symbolic link at the folder exits 1 and the outside folder stays empty", async () => {
  const root = fixture();
  const outside = emptyDir();
  mkdirSync(path.join(root, ".memory"), { recursive: true });
  symlinkSync(outside, path.join(root, ".memory/corrections"));
  await assert.rejects(run(root), (error) =>
    error.code === 1 && error.stderr.includes(".memory/corrections: symbolic link, not followed")
  );
  assert.deepEqual(readdirSync(outside), []);
  assert.deepEqual(readdirSync(path.join(root, ".memory")), ["corrections"]);
});

test("a symbolic link at .memory exits 1 and the outside folder stays empty", async () => {
  const root = fixture();
  const outside = emptyDir();
  symlinkSync(outside, path.join(root, ".memory"));
  await assert.rejects(run(root), (error) => error.code === 1 && error.stderr.includes(".memory: symbolic link, not followed"));
  assert.deepEqual(readdirSync(outside), []);
});

test("a file at the folder path exits 1 and nothing is written", async () => {
  const root = fixture();
  mkdirSync(path.join(root, ".memory"), { recursive: true });
  writeFileSync(path.join(root, ".memory/corrections"), "not a folder");
  await assert.rejects(run(root), (error) => error.code === 1 && error.stderr.includes(".memory/corrections: not a folder"));
  assert.deepEqual(tree(root), [".memory", ".memory/corrections"]);
});

test("a record with a text value that starts with -- is written as given", async () => {
  const root = fixture();
  await run(root, ["--correction", "-- a quoted value"]);
  const { stdout: ok } = await execFileAsync(process.execPath, [check, "--root", root], { cwd: root });
  assert.equal(ok, "ok   corrections: 1 records\n");
  const text = readFileSync(path.join(root, ".memory/corrections/2026-11-13-agent-scope-rule-3f9a.json"), "utf8");
  assert.ok(text.includes('"correction": "-- a quoted value"'));
});
