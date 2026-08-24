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
  return root;
}

function runDocsGate(root) {
  return execFileAsync(process.execPath, [
    path.join(root, "scripts/check-docs.mjs"),
  ]);
}
