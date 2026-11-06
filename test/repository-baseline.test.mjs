import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Repository baseline (ADR-0071, docs/specs/repository-baseline.md) applied to
// core itself, 1 test per row. B2 lives in scripts/check-corrections.mjs; B6 in
// test/risk-paths.test.mjs and scripts/check-risk-paths.mjs; B16 in
// test/no-leftover-agent-trees.test.mjs. B8, B9 and B11 do not apply to core
// (docs/org-adrs.md says why); B10 is checked by the sweep with gh api.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function lsFiles() {
  return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
}
function lsFilesStaged() {
  const out = execFileSync("git", ["ls-files", "-s"], { cwd: root, encoding: "utf8" });
  const modes = new Map();
  for (const line of out.split("\n").filter(Boolean)) {
    const [mode, , , file] = line.split(/\s+/);
    modes.set(file, mode);
  }
  return modes;
}
const read = (file) => readFileSync(path.join(root, file), "utf8");

// B13: the ecosystems Dependabot must name for a given file list.
const MANIFESTS = new Map([
  ["go.mod", "gomod"],
  ["package.json", "npm"],
  ["Cargo.toml", "cargo"],
  ["Dockerfile", "docker"],
  ["Containerfile", "docker"],
]);
export function missingEcosystems(files, dependabotText) {
  const required = new Set(["github-actions"]);
  for (const file of files) {
    if (file.startsWith(".agents/skills/") || file.includes("node_modules/")) continue;
    const ecosystem = MANIFESTS.get(path.basename(file));
    if (ecosystem) required.add(ecosystem);
  }
  const named = new Set(
    [...dependabotText.matchAll(/^\s*-?\s*package-ecosystem:\s*["']?([a-z-]+)["']?\s*$/gm)].map((m) => m[1]),
  );
  return [...required].filter((name) => !named.has(name)).sort();
}

test("B1: AGENTS.md is a regular file and every alias is a symlink to it", () => {
  const modes = lsFilesStaged();
  assert.equal(modes.get("AGENTS.md"), "100644");
  const canonical = realpathSync(path.join(root, "AGENTS.md"));
  for (const alias of ["CLAUDE.md", "GEMINI.md", ".cursorrules", ".github/copilot-instructions.md"]) {
    assert.equal(modes.get(alias), "120000", `${alias} must be a committed symlink`);
    assert.equal(realpathSync(path.join(root, alias)), canonical, `${alias} must resolve to AGENTS.md`);
  }
});

test("B3: the docs shape is in the tree and docs/README.md links docs/org-adrs.md", () => {
  const files = new Set(lsFiles());
  for (const file of [
    "docs/README.md",
    "docs/adr/TEMPLATE.md",
    "docs/design/TEMPLATE.md",
    "docs/specs/TEMPLATE.md",
    "docs/plans/TEMPLATE.md",
    "docs/org-adrs.md",
  ]) {
    assert.ok(files.has(file), `${file} is not tracked`);
  }
  assert.match(read("docs/README.md"), /\(org-adrs\.md\)/);
});

test("B4: the Makefile has the gate triad and mise pins are at the root", () => {
  const makefile = read("Makefile");
  for (const target of ["verify", "check", "ci"]) {
    assert.match(makefile, new RegExp(`^${target}:`, "m"), `Makefile has no ${target} rule`);
  }
  const files = new Set(lsFiles());
  for (const file of ["mise.toml", "mise.lock"]) {
    assert.ok(files.has(file), `${file} is not tracked`);
  }
});

test("B5: every workflow pins its actions by SHA, starts from no permissions and keeps no credentials", () => {
  const dir = path.join(root, ".github/workflows");
  const workflows = readdirSync(dir).filter((name) => /\.ya?ml$/.test(name));
  assert.ok(workflows.length > 0);
  for (const name of workflows) {
    const text = read(path.join(".github/workflows", name));
    for (const line of text.split("\n").filter((l) => /^\s*-?\s*uses:/.test(l))) {
      if (/uses:\s*\.\//.test(line)) continue;
      assert.match(line, /uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\S+/, `${name}: unpinned action: ${line.trim()}`);
    }
    assert.match(text, /^permissions:\s*\{\}\s*$/m, `${name}: no top-level permissions: {}`);
    const checkouts = (text.match(/uses:\s*actions\/checkout@/g) ?? []).length;
    const noCredentials = (text.match(/persist-credentials:\s*false/g) ?? []).length;
    assert.equal(noCredentials, checkouts, `${name}: a checkout keeps credentials`);
  }
});

test("B7: the PR template has a risk tier section", () => {
  assert.match(read(".github/pull_request_template.md"), /^#+ .*Risk tier/m);
});

test("B12: ci.yml runs make ci on pull requests", () => {
  const ci = read(".github/workflows/ci.yml");
  assert.match(ci, /make ci/);
  assert.match(ci, /pull_request/);
});

test("B13: missingEcosystems names each manifest ecosystem that Dependabot skips", () => {
  const files = ["go.mod", "package.json", ".agents/skills/x/go.mod", "docs/README.md"];
  const text = 'version: 2\nupdates:\n  - package-ecosystem: "github-actions"\n';
  assert.deepEqual(missingEcosystems(files, text), ["gomod", "npm"]);
});

test("B13: core's Dependabot configuration covers every manifest in the tree", () => {
  assert.deepEqual(missingEcosystems(lsFiles(), read(".github/dependabot.yml")), []);
});

test("B14: SECURITY.md names GitHub private vulnerability reporting", () => {
  const files = new Set(lsFiles());
  const file = ["SECURITY.md", ".github/SECURITY.md"].find((candidate) => files.has(candidate));
  assert.ok(file, "no SECURITY.md at the root or in .github/");
  assert.match(read(file), /https:\/\/github\.com\/frostyard\/core\/security/);
});

test("B15: core tracks no CODEOWNERS file", () => {
  const files = new Set(lsFiles());
  for (const file of ["CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS"]) {
    assert.ok(!files.has(file), `${file} is tracked`);
  }
});
