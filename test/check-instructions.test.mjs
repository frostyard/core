// Coverage for the instruction-hygiene lint. Fixtures are temporary and the
// CLI is exercised through execFile with the real Node executable.
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  extractInlineCodeSpans,
  extractProseSentences,
  isPathCandidate,
  normalizePathSpan,
  stripFencedBlocks,
} from "../scripts/lib/instruction-hygiene.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const guard = path.join(repoRoot, "scripts/check-instructions.mjs");

function tempDir() {
  return mkdtempSync(path.join(os.tmpdir(), "instruction-hygiene-"));
}

function runGuard(cwd, args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [guard, ...args], { cwd }, (error, stdout, stderr) => {
      resolve({
        code: typeof error?.code === "number" ? error.code : error ? 1 : 0,
        stdout: String(stdout),
        stderr: String(stderr),
      });
    });
  });
}

function withTemp(run) {
  const dir = tempDir();
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("dead docs/missing.md reference fails when docs exists", async () => {
  const dir = tempDir();
  try {
    mkdirSync(path.join(dir, "docs"));
    writeFileSync(path.join(dir, "AGENTS.md"), "See `docs/missing.md` here.\n");
    const result = await runGuard(dir, ["--root", dir, "AGENTS.md"]);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /FAIL dead_reference: AGENTS\.md:1:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dead docs/missing.md reference passes after the file exists", async () => {
  const dir = tempDir();
  try {
    mkdirSync(path.join(dir, "docs"));
    writeFileSync(path.join(dir, "docs/missing.md"), "exists\n");
    writeFileSync(path.join(dir, "AGENTS.md"), "See `docs/missing.md` here.\n");
    const result = await runGuard(dir, ["--root", dir, "AGENTS.md"]);
    assert.equal(result.code, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("home-relative dead and present paths", async () => {
  const dir = tempDir();
  try {
    writeFileSync(path.join(dir, "AGENTS.md"), "See `~/x/y.md` here.\n");
    const missing = await runGuard(dir, ["--root", dir, "--home", dir, "AGENTS.md"]);
    assert.equal(missing.code, 1);
    assert.match(missing.stdout, /dead_reference: AGENTS\.md:1/);

    mkdirSync(path.join(dir, "x"));
    writeFileSync(path.join(dir, "x/y.md"), "exists\n");
    const present = await runGuard(dir, ["--root", dir, "--home", dir, "AGENTS.md"]);
    assert.equal(present.code, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("retired name respects boundaries and retired-file works", async () => {
  const dir = tempDir();
  try {
    writeFileSync(path.join(dir, "AGENTS.md"), "See bketelsen/stomp#4 here.\n");
    const present = await runGuard(dir, ["--root", dir, "--retired", "bketelsen/stomp", "AGENTS.md"]);
    assert.equal(present.code, 1);
    assert.match(present.stdout, /retired_name: AGENTS\.md:1: bketelsen\/stomp/);

    writeFileSync(path.join(dir, "AGENTS.md"), "See bketelsen/stomped here.\n");
    const boundary = await runGuard(dir, ["--root", dir, "--retired", "bketelsen/stomp", "AGENTS.md"]);
    assert.equal(boundary.code, 0);

    writeFileSync(path.join(dir, "AGENTS.md"), "See bketelsen/stomp#4 here.\n");
    writeFileSync(path.join(dir, "retired.txt"), "# comment\n\nbketelsen/stomp\n");
    const fromFile = await runGuard(dir, ["--root", dir, "--retired-file", "retired.txt", "AGENTS.md"]);
    assert.equal(fromFile.code, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unresolved-looking spans are skipped", async () => {
  const dir = tempDir();
  try {
    writeFileSync(path.join(dir, "AGENTS.md"), "`frostyard/core` `make ci` `src/**/*.ts`\n");
    const result = await runGuard(dir, ["--root", dir, "AGENTS.md"]);
    assert.equal(result.code, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dead path inside a fenced block is ignored", async () => {
  const dir = tempDir();
  try {
    writeFileSync(path.join(dir, "AGENTS.md"), "```text\n`docs/missing.md`\n```\n");
    const result = await runGuard(dir, ["--root", dir, "AGENTS.md"]);
    assert.equal(result.code, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("line suffix is removed before checking a script path", async () => {
  const dir = tempDir();
  try {
    mkdirSync(path.join(dir, "scripts"));
    writeFileSync(path.join(dir, "scripts/x.sh"), "echo ok\n");
    writeFileSync(path.join(dir, "AGENTS.md"), "Run `scripts/x.sh:12` here.\n");
    const result = await runGuard(dir, ["--root", dir, "AGENTS.md"]);
    assert.equal(result.code, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("duplicate sentence warns only for 2 or more files and 8+ words", async () => {
  const dir = tempDir();
  try {
    const sentence = "Repeated sentence has exactly ten words for instruction lint testing.";
    writeFileSync(path.join(dir, "A.md"), `${sentence}\n`);
    writeFileSync(path.join(dir, "B.md"), `${sentence}\n`);
    const duplicate = await runGuard(dir, ["--root", dir, "A.md", "B.md"]);
    assert.equal(duplicate.code, 0);
    assert.match(duplicate.stdout, /WARN duplicate_sentence:/);

    writeFileSync(path.join(dir, "A.md"), "This is short.\n");
    writeFileSync(path.join(dir, "B.md"), "This is short.\n");
    const shortResult = await runGuard(dir, ["--root", dir, "A.md", "B.md"]);
    assert.equal(shortResult.code, 0);
    assert.doesNotMatch(shortResult.stdout, /duplicate_sentence/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("budget limits warn and unknown budget keys are usage errors", async () => {
  const dir = tempDir();
  try {
    writeFileSync(path.join(dir, "AGENTS.md"), "1\n2\n3\n4\n5\n");
    writeFileSync(path.join(dir, "budget.json"), JSON.stringify({
      schema_version: 1,
      files: [{ path: "AGENTS.md", max_lines: 2 }],
    }));
    const limited = await runGuard(dir, ["--root", dir, "--budget", "budget.json", "AGENTS.md"]);
    assert.equal(limited.code, 0);
    assert.match(limited.stdout, /WARN size_budget: AGENTS\.md: 5 lines > max_lines 2/);

    writeFileSync(path.join(dir, "budget.json"), JSON.stringify({
      schema_version: 1,
      surprise: true,
      files: [],
    }));
    const unknown = await runGuard(dir, ["--root", dir, "--budget", "budget.json", "AGENTS.md"]);
    assert.equal(unknown.code, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("base ref reports line growth", async () => {
  const dir = tempDir();
  try {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    writeFileSync(path.join(dir, "AGENTS.md"), "1\n2\n");
    execFileSync("git", ["-C", dir, "add", "AGENTS.md"]);
    execFileSync("git", ["-C", dir, "-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "base", "-q"]);
    writeFileSync(path.join(dir, "AGENTS.md"), "1\n2\n3\n4\n5\n");

    const result = await runGuard(dir, ["--root", dir, "--base", "HEAD", "AGENTS.md"]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /info growth: AGENTS\.md: \+3 lines, \+3 words since HEAD/);
    assert.match(result.stdout, /WARN size_growth: AGENTS\.md:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("missing PATH and nonexistent input are usage errors", async () => {
  const dir = tempDir();
  try {
    const missingPath = await runGuard(dir, ["--root", dir]);
    assert.equal(missingPath.code, 2);

    const nonexistent = await runGuard(dir, ["--root", dir, "missing.md"]);
    assert.equal(nonexistent.code, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("library extracts spans and skips fenced blocks", () => {
  const text = "A `docs/a.md` span.\n```text\n`docs/b.md`\n```\n~~~\n`docs/c.md`\n~~~\n";
  assert.deepEqual(extractInlineCodeSpans(text), [{ span: "docs/a.md", line: 1 }]);
  assert.doesNotMatch(stripFencedBlocks(text), /docs\/b\.md|docs\/c\.md/);

  assert.equal(normalizePathSpan("scripts/x.sh:12"), "scripts/x.sh");
  assert.equal(normalizePathSpan("docs/a.md#guide"), "docs/a.md");
  assert.equal(normalizePathSpan("docs/a.md/"), "docs/a.md");
  assert.equal(isPathCandidate("src/**/*.ts"), false);
  assert.equal(isPathCandidate("make ci"), false);
  assert.equal(isPathCandidate("docs/a.md"), true);

  const sentences = extractProseSentences("# Heading words here and more words.\n\n- Short list.\n");
  assert.ok(sentences.some((entry) => entry.sentence === "Heading words here and more words."));
});
