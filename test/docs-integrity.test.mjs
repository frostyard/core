import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("docs gate rejects skill links that escape the synced skills tree", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, ".agents/skills/example/SKILL.md"),
    "[core-only doc](../../../docs/adr/core-only.md)\n",
  );
  await writeFile(path.join(root, "docs/adr/core-only.md"), "# Core only\n");
  await writeFile(
    path.join(root, "docs/README.md"),
    "[Core only](adr/core-only.md)\n[Metric](specs/pr-acceptance-metric.md)\n",
  );

  await assert.rejects(
    runDocsGate(root),
    (error) =>
      error.stderr.includes(
        "SKILL.md -> ../../../docs/adr/core-only.md escapes .agents/skills",
      ),
  );
});

test("docs gate accepts cross-skill links that stay in the synced skills tree", async () => {
  const root = await createFixture();
  await mkdir(
    path.join(root, ".agents/skills/example/docs/superpowers/plans"),
    { recursive: true },
  );
  await mkdir(path.join(root, ".agents/skills/other"), { recursive: true });
  await writeFile(
    path.join(
      root,
      ".agents/skills/example/docs/superpowers/plans/history.md",
    ),
    "[other skill](../../../../other/SKILL.md)\n",
  );
  await writeFile(
    path.join(root, ".agents/skills/other/SKILL.md"),
    "# Other skill\n",
  );

  const { stdout } = await runDocsGate(root);
  assert.match(stdout, /ok   link_integrity: 1\.000/);
});

test("docs gate rejects index coverage from a bare document path without a markdown link", async () => {
  const root = await createFixture();
  await writeFile(path.join(root, "docs/adr/example.md"), "# Example\n");
  await writeFile(
    path.join(root, "docs/README.md"),
    "[Metric](specs/pr-acceptance-metric.md)\n\nSee adr/example.md for details.\n",
  );

  await assert.rejects(
    runDocsGate(root),
    (error) =>
      error.stderr.includes("index: docs/adr/example.md has no line in docs/README.md"),
  );
});

test("docs gate rejects index coverage from a link inside an HTML comment", async () => {
  const root = await createFixture();
  await writeFile(path.join(root, "docs/adr/example.md"), "# Example\n");
  await writeFile(
    path.join(root, "docs/README.md"),
    "[Metric](specs/pr-acceptance-metric.md)\n\n<!-- [Example](adr/example.md) -->\n",
  );

  await assert.rejects(
    runDocsGate(root),
    (error) =>
      error.stderr.includes("index: docs/adr/example.md has no line in docs/README.md"),
  );
});

test("docs gate accepts index coverage from an actual relative markdown link", async () => {
  const root = await createFixture();
  await writeFile(path.join(root, "docs/adr/example.md"), "# Example\n");
  await writeFile(
    path.join(root, "docs/README.md"),
    "[Metric](specs/pr-acceptance-metric.md)\n[Example](adr/example.md)\n",
  );

  const { stdout } = await runDocsGate(root);
  assert.match(stdout, /ok   docs_index_coverage: 1\.000/);
});

test("docs gate accepts valid same-document and cross-document section anchors", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, "docs/adr/example.md"),
    "# Example\n\n## Phase 4 — Supply-chain cleanup\n\n[back to the top](#example)\n",
  );
  await writeFile(
    path.join(root, "docs/README.md"),
    "[Metric](specs/pr-acceptance-metric.md)\n" +
      "[Example](adr/example.md)\n" +
      "[Phase 4](adr/example.md#phase-4--supply-chain-cleanup)\n",
  );

  const { stdout } = await runDocsGate(root);
  assert.match(stdout, /ok   link_integrity: 1\.000/);
  assert.match(stdout, /ok   docs_index_coverage: 1\.000/);
});

test("docs gate rejects a same-document link to a nonexistent section anchor", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, "docs/adr/example.md"),
    "# Example\n\n[missing section](#no-such-heading)\n",
  );
  await writeFile(
    path.join(root, "docs/README.md"),
    "[Metric](specs/pr-acceptance-metric.md)\n[Example](adr/example.md)\n",
  );

  await assert.rejects(
    runDocsGate(root),
    (error) =>
      error.stderr.includes(
        "link: docs/adr/example.md -> #no-such-heading" +
          " has no matching section anchor in docs/adr/example.md",
      ),
  );
});

test("docs gate rejects a cross-document link to a nonexistent section anchor", async () => {
  const root = await createFixture();
  await writeFile(path.join(root, "docs/adr/example.md"), "# Example\n");
  await writeFile(
    path.join(root, "docs/design/uses-example.md"),
    "# Uses example\n\n[phase](../adr/example.md#no-such-heading)\n",
  );
  await writeFile(
    path.join(root, "docs/README.md"),
    "[Metric](specs/pr-acceptance-metric.md)\n" +
      "[Example](adr/example.md)\n" +
      "[Uses](design/uses-example.md)\n",
  );

  await assert.rejects(
    runDocsGate(root),
    (error) =>
      error.stderr.includes(
        "link: docs/design/uses-example.md -> ../adr/example.md#no-such-heading" +
          " has no matching section anchor in docs/adr/example.md",
      ),
  );
});

test("docs gate still reports an unresolvable path before looking at its fragment", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, "docs/adr/example.md"),
    "# Example\n\n[gone](../design/missing.md#anything)\n",
  );
  await writeFile(
    path.join(root, "docs/README.md"),
    "[Metric](specs/pr-acceptance-metric.md)\n[Example](adr/example.md)\n",
  );

  await assert.rejects(
    runDocsGate(root),
    (error) =>
      error.stderr.includes(
        "link: docs/adr/example.md -> ../design/missing.md#anything does not resolve",
      ),
  );
});

test("docs gate rejects a link to a heading that only appears inside a tilde fence", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, "docs/adr/example.md"),
    "# Example\n\n~~~markdown\n## Fenced only heading\n~~~\n",
  );
  await writeFile(
    path.join(root, "docs/README.md"),
    "[Metric](specs/pr-acceptance-metric.md)\n" +
      "[Example](adr/example.md)\n" +
      "[Fenced](adr/example.md#fenced-only-heading)\n",
  );

  await assert.rejects(
    runDocsGate(root),
    (error) =>
      error.stderr.includes(
        "link: docs/README.md -> adr/example.md#fenced-only-heading" +
          " has no matching section anchor in docs/adr/example.md",
      ),
  );
});

test("docs gate still counts real headings around backtick and tilde fences", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, "docs/adr/example.md"),
    "# Example\n\n~~~markdown\n## Fenced only heading\n```\n~~~\n\n" +
      "## Real heading\n\n```markdown\n## Also fenced\n```\n\n## Later heading\n",
  );
  await writeFile(
    path.join(root, "docs/README.md"),
    "[Metric](specs/pr-acceptance-metric.md)\n" +
      "[Example](adr/example.md)\n" +
      "[Real](adr/example.md#real-heading)\n" +
      "[Later](adr/example.md#later-heading)\n",
  );

  const { stdout } = await runDocsGate(root);
  assert.match(stdout, /ok   link_integrity: 1\.000/);
});

test("escaped backticks guard a real link outside the code span", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, ".agents/skills/example/SKILL.md"),
    "\\` [x](missing.md) \\`\n",
  );

  await assert.rejects(runDocsGate(root), (error) =>
    error.stderr.includes("-> missing.md does not resolve"));
});

test("spans match by backtick run length and leave outside links checked", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, ".agents/skills/example/SKILL.md"),
    "`` a ` `` [x](missing.md)\n",
  );

  await assert.rejects(runDocsGate(root), (error) =>
    error.stderr.includes("-> missing.md does not resolve"));
});

test("an unclosed double-backtick run guards a real link", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, ".agents/skills/example/SKILL.md"),
    "`` [x](missing.md) `\n",
  );

  await assert.rejects(runDocsGate(root), (error) =>
    error.stderr.includes("-> missing.md does not resolve"));
});

test("adjacent headings with unpaired backticks guard a real link", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, ".agents/skills/example/SKILL.md"),
    "# First `\n# [x](missing.md) `\n",
  );

  await assert.rejects(runDocsGate(root), (error) =>
    error.stderr.includes("-> missing.md does not resolve"));
});

test("a span that wraps lines guards the link outside its pair", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, ".agents/skills/example/SKILL.md"),
    "`code\ncontinued` [x](missing.md) `tail`\n",
  );

  await assert.rejects(runDocsGate(root), (error) =>
    error.stderr.includes("-> missing.md does not resolve"));
});

test("a standalone GFM table row guards a real link", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, ".agents/skills/example/SKILL.md"),
    "| ` | [x](missing.md) ` |\n",
  );

  await assert.rejects(runDocsGate(root), (error) =>
    error.stderr.includes("-> missing.md does not resolve"));
});

test("a GFM table with header and delimiter guards a real link", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, ".agents/skills/example/SKILL.md"),
    "| Code | Link |\n| --- | --- |\n| ` | [x](missing.md) ` |\n",
  );

  await assert.rejects(runDocsGate(root), (error) =>
    error.stderr.includes("-> missing.md does not resolve"));
});

test("raw HTML with a backtick guards a real link", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, ".agents/skills/example/SKILL.md"),
    "<span title=\"`\">[x](missing.md)`</span>\n",
  );

  await assert.rejects(runDocsGate(root), (error) =>
    error.stderr.includes("-> missing.md does not resolve"));
});

test("an email autolink with a backtick guards a real link", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, ".agents/skills/example/SKILL.md"),
    "<1`@example.com> [x](missing.md) `\n",
  );

  await assert.rejects(runDocsGate(root), (error) =>
    error.stderr.includes("-> missing.md does not resolve"));
});

test("a code span inside link text does not hide the outer link", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, ".agents/skills/example/SKILL.md"),
    "[`code`](missing.md)\n",
  );

  await assert.rejects(runDocsGate(root), (error) =>
    error.stderr.includes("-> missing.md does not resolve"));
});

test("index coverage ignores a link only when it is in a code span", async () => {
  const root = await createFixture();
  await writeFile(path.join(root, "docs/adr/example.md"), "# Example\n");
  await writeFile(
    path.join(root, "docs/README.md"),
    "[Metric](specs/pr-acceptance-metric.md)\n\n`[Example](adr/example.md)`\n",
  );

  await assert.rejects(runDocsGate(root), (error) =>
    error.stderr.includes("index: docs/adr/example.md has no line in docs/README.md"));
});

test("Go generic calls in inline code spans pass link integrity", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, ".agents/skills/example/SKILL.md"),
    "- `errors.AsType[T](err)`\n\n`reflect.TypeAssert[T](v)`\n",
  );

  const { stdout } = await runDocsGate(root);
  assert.match(stdout, /ok   link_integrity: 1\.000/);
});

test("a double-backtick span contains a link by exact run length", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, ".agents/skills/example/SKILL.md"),
    "`` a ` [x](missing.md) ``\n",
  );

  const { stdout } = await runDocsGate(root);
  assert.match(stdout, /ok   link_integrity: 1\.000/);
});

test("a less-than sign without a later greater-than sign permits code spans", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, ".agents/skills/example/SKILL.md"),
    "Go <1.26 and `errors.AsType[T](err)`\n",
  );

  const { stdout } = await runDocsGate(root);
  assert.match(stdout, /ok   link_integrity: 1\.000/);
});

test("naive fence removal does not join a real link across a removed chunk", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, ".agents/skills/example/SKILL.md"),
    "` ```x` y``` [l](missing.md) `\n",
  );

  await assert.rejects(runDocsGate(root), (error) =>
    error.stderr.includes("-> missing.md does not resolve"));
});

test("a list item fence does not hide a later real link", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, ".agents/skills/example/SKILL.md"),
    "- ```\n  code\n  ```\n[x](missing.md)\n\n```\nz\n```\n",
  );

  await assert.rejects(runDocsGate(root), (error) =>
    error.stderr.includes("-> missing.md does not resolve"));
});

test("a backtick in a link destination is not a span delimiter", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, ".agents/skills/example/SKILL.md"),
    "[a](https://example.com/a`b) [x](missing.md) `tail\n",
  );

  await assert.rejects(runDocsGate(root), (error) =>
    error.stderr.includes("-> missing.md does not resolve"));
});

test("a backtick in a link title is not a span delimiter", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, ".agents/skills/example/SKILL.md"),
    "[a](u \"t`\") [x](missing.md) `tail\n",
  );

  await assert.rejects(runDocsGate(root), (error) =>
    error.stderr.includes("-> missing.md does not resolve"));
});

test("a backtick in a full reference label is not a span delimiter", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, ".agents/skills/example/SKILL.md"),
    "[a][b`c] [x](missing.md) `tail\n\n[b`c]: https://example.com\n",
  );

  await assert.rejects(runDocsGate(root), (error) =>
    error.stderr.includes("-> missing.md does not resolve"));
});

test("a Unicode blank line does not hide a real link", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, ".agents/skills/example/SKILL.md"),
    "`head\n\u00a0\nend` [x](missing.md) `tail\n",
  );

  await assert.rejects(runDocsGate(root), (error) =>
    error.stderr.includes("-> missing.md does not resolve"));
});

test("a lone CR line ending does not hide a real link", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, ".agents/skills/example/SKILL.md"),
    "`head\r\r[x](missing.md) `tail\r",
  );

  await assert.rejects(runDocsGate(root), (error) =>
    error.stderr.includes("-> missing.md does not resolve"));
});

test("CRLF line endings still permit a paired code span", async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, ".agents/skills/example/SKILL.md"),
    "Use `errors.AsType[T](err)` here.\r\n",
  );

  const { stdout } = await runDocsGate(root);
  assert.match(stdout, /ok   link_integrity: 1\.000/);
});

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "core-docs-gate-"));
  for (const dir of [
    "scripts",
    "docs/adr",
    "docs/design",
    "docs/specs",
    "docs/plans",
    ".agents/skills/example",
  ]) {
    await mkdir(path.join(root, dir), { recursive: true });
  }
  await copyFile(
    path.join(repoRoot, "scripts/check-docs.mjs"),
    path.join(root, "scripts/check-docs.mjs"),
  );
  await writeFile(
    path.join(root, ".coverage-thresholds.json"),
    JSON.stringify({
      docs_index_coverage: 1,
      link_integrity: 1,
      symlink_resolution: 1,
      never_relax: true,
    }),
  );
  await writeFile(path.join(root, "AGENTS.md"), "# Agents\n");
  await writeFile(path.join(root, "README.md"), "# Fixture\n");
  await writeFile(
    path.join(root, "docs/README.md"),
    "[Metric](specs/pr-acceptance-metric.md)\n",
  );
  await writeFile(
    path.join(root, "docs/specs/pr-acceptance-metric.md"),
    "# Metric\n\n## Definition\n\n## Rules\n",
  );
  // The gate also checks links in docs/org-adrs.md (baseline row B3).
  await writeFile(path.join(root, "docs/org-adrs.md"), "# Org ADRs\n");
  return root;
}

function runDocsGate(root) {
  return execFileAsync(process.execPath, [
    path.join(root, "scripts/check-docs.mjs"),
  ]);
}
