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
  isBarePathShaped,
  isPathCandidate,
  normalizePathSpan,
  stripFencedBlocks,
  findRetiredOccurrences,
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

async function withTemp(run) {
  const dir = tempDir();
  try {
    return await run(dir);
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

test("dead docs/missing.md reference fails when docs does not exist (T863)", async () => {
  await withTemp(async (dir) => {
    writeFileSync(path.join(dir, "AGENTS.md"), "See `docs/missing.md` here.\n");
    const missing = await runGuard(dir, ["--root", dir, "AGENTS.md"]);
    assert.equal(missing.code, 1, missing.stdout);
    assert.match(missing.stdout, /FAIL dead_reference: AGENTS\.md:1: `docs\/missing\.md` does not exist/);

    mkdirSync(path.join(dir, "docs"));
    writeFileSync(path.join(dir, "docs/missing.md"), "exists\n");
    const present = await runGuard(dir, ["--root", dir, "AGENTS.md"]);
    assert.equal(present.code, 0, present.stdout);
  });
});

test("a missing root-level file fails and passes once it exists (T863)", async () => {
  await withTemp(async (dir) => {
    mkdirSync(path.join(dir, "sub"));
    writeFileSync(path.join(dir, "sub/AGENTS.md"), "Read `MISSING.md` and `mise.toml` first.\n");
    const missing = await runGuard(dir, ["--root", dir, "sub/AGENTS.md"]);
    assert.equal(missing.code, 1, missing.stdout);
    assert.match(missing.stdout, /FAIL dead_reference: sub\/AGENTS\.md:1: `MISSING\.md` does not exist/);
    assert.match(missing.stdout, /FAIL dead_reference: sub\/AGENTS\.md:1: `mise\.toml` does not exist/);

    writeFileSync(path.join(dir, "MISSING.md"), "exists\n");
    writeFileSync(path.join(dir, "mise.toml"), "[tools]\n");
    const present = await runGuard(dir, ["--root", dir, "sub/AGENTS.md"]);
    assert.equal(present.code, 0, present.stdout);
  });
});

test("a top-level folder name makes an extensionless span a path (T863)", async () => {
  await withTemp(async (dir) => {
    writeFileSync(path.join(dir, "AGENTS.md"), "See `test/e2e/` and `.github/workflows`.\n");
    const missing = await runGuard(dir, ["--root", dir, "AGENTS.md"]);
    assert.equal(missing.code, 1, missing.stdout);
    assert.match(missing.stdout, /`test\/e2e\/` does not exist/);
    assert.match(missing.stdout, /`\.github\/workflows` does not exist/);
  });
});

test("plain words, versions, commands, URLs, globs and identifiers stay unreported (T863)", async () => {
  await withTemp(async (dir) => {
    const text = [
      "Use `e.g.` and `i.e.` and `v1.2` and `v1.2.3` and `1.24` here.",
      "Run `make ci`, `npm run check`, `gh`, `git`, `node --test` and `mise install`.",
      "See `frostyard/core`, `bketelsen/stomp#4`, `owner/name#12` and `origin/main`.",
      "See `https://example.com/a.md`, `github.com/frostyard/std/x.go` and `repository.frostyard.org`.",
      "Globs: `*.md`, `src/**/*.ts`, `docs/*.md` and `{a,b}.json`.",
      "Code: `JSON.parse`, `process.env`, `options.root`, `os.homedir`, `.md`, `_test.go` and `.env`.",
      "Models: `deepseek/deepseek-flash`, `github-copilot/gpt-6.1-sol` and `@scope/pkg`.",
      "",
    ].join("\n");
    writeFileSync(path.join(dir, "AGENTS.md"), text);
    const result = await runGuard(dir, ["--root", dir, "AGENTS.md"]);
    assert.equal(result.code, 0, result.stdout);
    assert.doesNotMatch(result.stdout, /dead_reference/);
  });
});

test("--ignore-ref and --ignore-ref-file skip exact references", async () => {
  await withTemp(async (dir) => {
    writeFileSync(path.join(dir, "AGENTS.md"), "Edit `go.mod` and `docs/tenets.md:4`.\n");
    const flagged = await runGuard(dir, ["--root", dir, "AGENTS.md"]);
    assert.equal(flagged.code, 1, flagged.stdout);

    const ignored = await runGuard(dir, ["--root", dir, "--ignore-ref", "go.mod", "--ignore-ref", "docs/tenets.md", "AGENTS.md"]);
    assert.equal(ignored.code, 0, ignored.stdout);

    writeFileSync(path.join(dir, "ignore.txt"), "# cross-repository references\ngo.mod\ndocs/tenets.md\n");
    const fromFile = await runGuard(dir, ["--root", dir, "--ignore-ref-file", "ignore.txt", "AGENTS.md"]);
    assert.equal(fromFile.code, 0, fromFile.stdout);

    const partial = await runGuard(dir, ["--root", dir, "--ignore-ref", "go.mod", "AGENTS.md"]);
    assert.equal(partial.code, 1, partial.stdout);
    assert.match(partial.stdout, /`docs\/tenets\.md:4` does not exist/);
  });
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
    writeFileSync(path.join(dir, "AGENTS.md"), "See https://github.com/bketelsen/stomp/issues/4 here.\n");
    const url = await runGuard(dir, ["--root", dir, "--retired", "bketelsen/stomp", "AGENTS.md"]);
    assert.equal(url.code, 1);
    assert.match(url.stdout, /retired_name: AGENTS\.md:1: bketelsen\/stomp/);

    writeFileSync(path.join(dir, "AGENTS.md"), "See xbketelsen/stomp here.\n");
    const embedded = await runGuard(dir, ["--root", dir, "--retired", "bketelsen/stomp", "AGENTS.md"]);
    assert.equal(embedded.code, 0);

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

test("dead path inside blockquote and nested-list fences is ignored", async () => {
  const dir = tempDir();
  try {
    writeFileSync(path.join(dir, "AGENTS.md"), "> ```text\n> `~/missing.md`\n> ```\n");
    const blockquote = await runGuard(dir, ["--root", dir, "--home", dir, "AGENTS.md"]);
    assert.equal(blockquote.code, 0);

    writeFileSync(path.join(dir, "AGENTS.md"), "  - item\n      ```text\n      `~/missing.md`\n      ```\n");
    const nested = await runGuard(dir, ["--root", dir, "--home", dir, "AGENTS.md"]);
    assert.equal(nested.code, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("four-space fence does not hide an following reference", async () => {
  const dir = tempDir();
  try {
    writeFileSync(path.join(dir, "AGENTS.md"), "    ```text\n\nSee `~/missing.md`.\n");
    const result = await runGuard(dir, ["--root", dir, "--home", dir, "AGENTS.md"]);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /dead_reference: AGENTS\.md:3:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ended blockquote fence does not hide an following reference", async () => {
  const dir = tempDir();
  try {
    writeFileSync(path.join(dir, "AGENTS.md"), "> ```text\n> example\n\nSee `~/missing.md`.\n");
    const result = await runGuard(dir, ["--root", dir, "--home", dir, "AGENTS.md"]);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /dead_reference: AGENTS\.md:4:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fence in a list item and ended list item are handled", async () => {
  const dir = tempDir();
  try {
    writeFileSync(path.join(dir, "AGENTS.md"), "1. Step\n\n   ```text\n   `~/missing.md`\n   ```\n");
    const inList = await runGuard(dir, ["--root", dir, "--home", dir, "AGENTS.md"]);
    assert.equal(inList.code, 0);

    writeFileSync(path.join(dir, "AGENTS.md"), "1. Step\n\n   ```text\n   example\n\nSee `~/missing.md`.\n");
    const afterList = await runGuard(dir, ["--root", dir, "--home", dir, "AGENTS.md"]);
    assert.equal(afterList.code, 1);
    assert.match(afterList.stdout, /dead_reference: AGENTS\.md:6:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a fence in the parent item after a nested list ends is skipped, and text after the list is checked", async () => {
  const dir = tempDir();
  try {
    const nested = "  - outer\n    - inner\n      text\n\n    ```text\n    `~/missing.md`\n    ```\n";
    writeFileSync(path.join(dir, "AGENTS.md"), nested);
    const inParent = await runGuard(dir, ["--root", dir, "--home", dir, "AGENTS.md"]);
    assert.equal(inParent.code, 0, inParent.stdout);

    writeFileSync(path.join(dir, "AGENTS.md"), `${nested}\nSee \`~/missing.md\`.\n`);
    const afterList = await runGuard(dir, ["--root", dir, "--home", dir, "AGENTS.md"]);
    assert.equal(afterList.code, 1);
    assert.match(afterList.stdout, /dead_reference: AGENTS\.md:9:/);
    assert.doesNotMatch(afterList.stdout, /AGENTS\.md:6:/);
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

test("prose punctuation inside code spans stays in the sentence", async () => {
  const dir = tempDir();
  try {
    // The referenced files exist, so the run tests only duplicate detection.
    mkdirSync(path.join(dir, "docs"));
    writeFileSync(path.join(dir, "docs/alpha.md"), "alpha\n");
    writeFileSync(path.join(dir, "docs/beta.md"), "beta\n");
    writeFileSync(path.join(dir, "A.md"), "Read `docs/alpha.md` before starting any work on this project.\n");
    writeFileSync(path.join(dir, "B.md"), "Read `docs/beta.md` before starting any work on this project.\n");
    const differing = await runGuard(dir, ["--root", dir, "A.md", "B.md"]);
    assert.equal(differing.code, 0);
    assert.doesNotMatch(differing.stdout, /duplicate_sentence/);

    writeFileSync(path.join(dir, "A.md"), "Read `docs/alpha.md` before starting any work on this project.\n");
    writeFileSync(path.join(dir, "B.md"), "Read `docs/alpha.md` before starting any work on this project.\n");
    const repeated = await runGuard(dir, ["--root", dir, "A.md", "B.md"]);
    assert.equal(repeated.code, 0);
    assert.match(repeated.stdout, /WARN duplicate_sentence: "Read `docs\/alpha\.md` before starting any work on this project\."/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("double-backtick code spans normalize outer spaces", async () => {
  const dir = tempDir();
  try {
    writeFileSync(path.join(dir, "AGENTS.md"), "`` ~/missing.md ``\n");
    const missing = await runGuard(dir, ["--root", dir, "--home", dir, "AGENTS.md"]);
    assert.equal(missing.code, 1);
    assert.match(missing.stdout, /dead_reference: AGENTS\.md:1:/);

    mkdirSync(path.join(dir, "missing.md"), { recursive: true });
    rmSync(path.join(dir, "missing.md"), { recursive: true, force: true });
    writeFileSync(path.join(dir, "missing.md"), "present\n");
    const present = await runGuard(dir, ["--root", dir, "--home", dir, "AGENTS.md"]);
    assert.equal(present.code, 0);
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

test("base ref reports word growth at the same line count", async () => {
  const dir = tempDir();
  try {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    writeFileSync(path.join(dir, "AGENTS.md"), "one\n");
    execFileSync("git", ["-C", dir, "add", "AGENTS.md"]);
    execFileSync("git", ["-C", dir, "-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "base", "-q"]);
    writeFileSync(path.join(dir, "AGENTS.md"), "one two three\n");

    const result = await runGuard(dir, ["--root", dir, "--base", "HEAD", "AGENTS.md"]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /WARN size_growth: AGENTS\.md: \+0 lines, \+2 words since HEAD/);
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
  assert.equal(isBarePathShaped("MISSING.md"), true);
  assert.equal(isBarePathShaped("docs/missing.md"), true);
  assert.equal(isBarePathShaped("docs/agents"), true);
  assert.equal(isBarePathShaped(".golangci.yml"), true);
  for (const word of ["e.g.", "v1.2", "1.24", "make", "frostyard/core", "JSON.parse", "process.env", ".md", "_test.go", "github.com/a/b.md", "../a.md", "~/a.md"]) {
    assert.equal(isBarePathShaped(word), false, word);
  }

  assert.deepEqual(extractInlineCodeSpans("a ``x`y`` b"), [{ span: "x`y", line: 1 }]);
  assert.deepEqual(findRetiredOccurrences("https://github.com/bketelsen/stomp/issues/4", "bketelsen/stomp"), [{ name: "bketelsen/stomp", line: 1 }]);

  const sentences = extractProseSentences("# Heading words here and more words.\n\n- Short list.\n");
  assert.ok(sentences.some((entry) => entry.sentence === "Heading words here and more words."));
  assert.doesNotMatch(stripFencedBlocks("> ```text\n> `~/missing.md`\n> ```\n"), /missing\.md|```/u);
});
