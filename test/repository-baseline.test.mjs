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

// B5: the checkout steps of a workflow, and the 1-based line of each one that
// does not set persist-credentials: false in its own `with:` mapping. Comments
// do not count, and the same key under `env:` or another step does not count.
export function checkoutCredentials(text) {
  const indentOf = (line) => line.length - line.trimStart().length;
  const lines = text.split("\n").map((line) => (/^\s*#/.test(line) ? "" : line.replace(/\s+#.*$/, "")));
  let checkouts = 0;
  const offenders = [];
  for (let i = 0; i < lines.length; i++) {
    const start = /^(\s*)-\s+(\S.*)$/.exec(lines[i]);
    if (!start) continue;
    const indent = start[1].length;
    // Each step line keeps its own indent; the first line's text starts after "- ".
    const step = [{ indent: lines[i].indexOf(start[2]), text: start[2].trim() }];
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === "") continue;
      if (indentOf(lines[j]) <= indent) break;
      step.push({ indent: indentOf(lines[j]), text: lines[j].trim() });
    }
    const keyIndent = step[0].indent;
    const own = (re) => step.findIndex((line) => line.indent === keyIndent && re.test(line.text));
    if (own(/^uses:\s*actions\/checkout@/) < 0) continue;
    checkouts++;
    const withAt = own(/^with:$/);
    let safe = false;
    if (withAt >= 0) {
      for (let k = withAt + 1; k < step.length && step[k].indent > keyIndent; k++) {
        const isChild = step[k].indent === step[withAt + 1].indent;
        if (isChild && /^persist-credentials:\s*(false|"false"|'false')$/.test(step[k].text)) safe = true;
      }
    }
    if (!safe) offenders.push(i + 1);
  }
  return { checkouts, offenders };
}

test("B5: checkoutCredentials flags each checkout step that keeps credentials", () => {
  const checkout = "      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2";
  const run = (body) => checkoutCredentials(`    steps:\n${body}\n      - run: true\n`);
  const good = [checkout, "        with:", "          persist-credentials: false"].join("\n");
  assert.deepEqual(run(good), { checkouts: 1, offenders: [] });
  const named = ["      - name: Checkout", checkout.replace("      - ", "        "), "        with:", "          fetch-depth: 0", "          persist-credentials: 'false'"].join("\n");
  assert.deepEqual(run(named), { checkouts: 1, offenders: [] });
  const bad = {
    missing: checkout,
    commented: [checkout, "        with:", "          # persist-credentials: false", "          fetch-depth: 0"].join("\n"),
    trailing: [checkout, "        with:", "          fetch-depth: 0 # persist-credentials: false"].join("\n"),
    underEnv: [checkout, "        env:", '          persist-credentials: "false"'].join("\n"),
    stepLevel: [checkout, "        persist-credentials: false"].join("\n"),
    nextStep: [checkout, "      - uses: actions/setup-node@x", "        with:", "          persist-credentials: false"].join("\n"),
    truthy: [checkout, "        with:", "          persist-credentials: true"].join("\n"),
  };
  for (const [name, body] of Object.entries(bad)) {
    assert.deepEqual(run(body), { checkouts: 1, offenders: [2] }, name);
  }
  const namedEnv = ["      - name: Checkout", checkout.replace("      - ", "        "), "        env:", "          persist-credentials: false"].join("\n");
  assert.deepEqual(run(namedEnv), { checkouts: 1, offenders: [2] });
});

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
  let checkouts = 0;
  for (const name of workflows) {
    const text = read(path.join(".github/workflows", name));
    for (const line of text.split("\n").filter((l) => /^\s*-?\s*uses:/.test(l))) {
      if (/uses:\s*\.\//.test(line)) continue;
      assert.match(line, /uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\S+/, `${name}: unpinned action: ${line.trim()}`);
    }
    assert.match(text, /^permissions:\s*\{\}\s*$/m, `${name}: no top-level permissions: {}`);
    const result = checkoutCredentials(text);
    assert.deepEqual(result.offenders, [], `${name}: a checkout keeps credentials`);
    checkouts += result.checkouts;
  }
  assert.ok(checkouts > 0, "no actions/checkout step found: the credentials check checked nothing");
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
