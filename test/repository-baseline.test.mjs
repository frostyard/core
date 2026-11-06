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

// B12 (ADR-0073): the parts of `make ci` that a CI workflow does not run. A
// `make ci` step covers all of them. Otherwise each prerequisite of the `ci`
// target needs a `make <target>` step (extra variables allowed), and each
// command of the `ci` recipe needs a step that runs exactly that command.
// Only the commands of `run:` steps count: comments, step names and other
// keys do not.
export function workflowCommands(workflowText) {
  const indentOf = (line) => line.length - line.trimStart().length;
  // Shell comments: from an unquoted # at the start or after a blank.
  const stripShellComment = (line) => {
    let quote = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === "'" || c === '"') {
        quote = c;
      } else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
        return line.slice(0, i).trim();
      }
    }
    return line.trim();
  };
  const lines = workflowText.split("\n");
  const commands = [];
  let stepsIndent = -1; // indent of the current `steps:` key
  let itemIndent = -1; // indent of the `-` of the steps' list items
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const indent = indentOf(line);
    // A step list can be indented under `steps:` or start at its indent.
    const indentlessItem = indent === stepsIndent && /^\s*-\s/.test(line);
    if (stepsIndent >= 0 && indent <= stepsIndent && !indentlessItem) stepsIndent = itemIndent = -1;
    if (/^\s*steps:\s*(#.*)?$/.test(line)) {
      stepsIndent = indent;
      continue;
    }
    if (stepsIndent < 0) continue;
    const item = /^(\s*)-\s+(.*)$/.exec(line);
    if (item && (itemIndent < 0 || item[1].length === itemIndent)) itemIndent = item[1].length;
    // A step's own `run` key: on the `-` line, or at the item's key indent.
    let value = null;
    let keyIndent = -1;
    if (item && item[1].length === itemIndent && /^run:/.test(item[2])) {
      value = item[2].slice(4);
      keyIndent = itemIndent + 2;
    } else if (itemIndent >= 0 && indent === itemIndent + 2 && /^\s*run:/.test(line)) {
      value = line.trim().slice(4);
      keyIndent = indent;
    }
    if (value === null) continue;
    value = value.trim();
    const quoted = /^'((?:[^']|'')*)'|^"((?:[^"\\]|\\.)*)"/.exec(value);
    if (quoted) {
      // A quoted YAML scalar: its text, decoded; a # inside the quotes is not a YAML comment.
      value = quoted[1] !== undefined ? quoted[1].replace(/''/g, "'") : quoted[2].replace(/\\(.)/g, "$1");
    } else {
      value = value.replace(/(^|\s+)#.*$/, "").trim();
    }
    const block = quoted ? null : /^([|>])[-+]?$/.exec(value);
    if (!block) {
      const command = stripShellComment(value);
      if (command) commands.push(command);
      continue;
    }
    // A block scalar: the lines indented deeper than the key. A literal (|)
    // block runs each line; a folded (>) block joins its lines into 1 command.
    const body = [];
    for (i += 1; i < lines.length; i++) {
      if (lines[i].trim() === "") continue;
      if (indentOf(lines[i]) <= keyIndent) {
        i -= 1;
        break;
      }
      body.push(lines[i].trim());
    }
    const blockCommands = block[1] === ">" ? [body.join(" ")] : body;
    for (const command of blockCommands.map(stripShellComment)) if (command) commands.push(command);
  }
  return commands;
}

export function ciCoverageGaps(makefileText, workflowText) {
  const lines = makefileText.split("\n");
  const start = lines.findIndex((line) => /^ci\s*:(?!=)/.test(line));
  if (start === -1) return ["a ci target in the Makefile"];
  const commands = workflowCommands(workflowText);
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const runsMake = (target) => {
    const pattern = new RegExp(`(^|[;&|]\\s*)make ${escape(target)}(\\s|$)`);
    return commands.some((command) => pattern.test(command));
  };
  if (runsMake("ci")) return [];
  const prerequisites = lines[start].replace(/^ci\s*:/, "").replace(/#.*$/, "").trim().split(/\s+/).filter(Boolean);
  const recipe = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "" || line.startsWith("#")) continue; // blank lines and comments do not end a recipe
    if (!line.startsWith("\t")) break;
    const command = line.trim().replace(/^[@-]+/, "").replace(/\$\(MAKE\)/g, "make");
    if (command && !command.startsWith("#")) recipe.push(command);
  }
  const gaps = prerequisites.filter((target) => !runsMake(target)).map((target) => `make ${target}`);
  for (const command of recipe) {
    const target = /^make (\S+)$/.exec(command);
    if (target ? !runsMake(target[1]) : !commands.includes(command)) gaps.push(command);
  }
  return gaps;
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

test("B12: ciCoverageGaps accepts 1 make ci step", () => {
  const makefile = "ci: verify race ## gate\n\tgo test -race ./...\n";
  assert.deepEqual(ciCoverageGaps(makefile, "on: [pull_request]\njobs:\n  ci:\n    steps:\n      - run: make ci\n"), []);
});

test("B12: ciCoverageGaps accepts separate jobs that run every part of make ci (ADR-0073)", () => {
  const makefile = "verify: lint test\n\tgo vet ./...\nci: verify ui-check app-build ## verify plus the app\n\tgo test -race ./...\n\nother:\n\ttrue\n";
  const ci = [
    "on: [pull_request]",
    "jobs:",
    "  verify:",
    "    steps:",
    "      - run: make verify",
    "  race:",
    "    steps:",
    "      - run: go test -race ./...",
    "  ui:",
    "    steps:",
    "      - run: make ui-check IN_NSL='sh -c'",
    "  app:",
    "    steps:",
    "      - run: make app-build IN_NSL='sh -c'",
  ].join("\n");
  assert.deepEqual(ciCoverageGaps(makefile, ci), []);
  const noApp = ci.replace("make app-build IN_NSL='sh -c'", "make app-test");
  assert.deepEqual(ciCoverageGaps(makefile, noApp), ["make app-build"]);
  const noRace = ci.replace("go test -race ./...", "go test ./...");
  assert.deepEqual(ciCoverageGaps(makefile, noRace), ["go test -race ./..."]);
  assert.deepEqual(ciCoverageGaps("verify:\n\ttrue\n", ci), ["a ci target in the Makefile"]);
});

test("B12: ciCoverageGaps counts only the commands of run steps, whole", () => {
  const makefile = "ci: verify\n\tgo test -race ./...\n\n# the second command\n\tgo vet ./...\n\nother:\n\ttrue\n";
  const steps = "on: [pull_request]\njobs:\n  a:\n    steps:\n      - run: make verify\n      - run: go test -race ./...\n      - run: go vet ./...\n";
  assert.deepEqual(ciCoverageGaps(makefile, steps), []);
  // A comment or a step name is not a command.
  const commented = "on: [pull_request]\n# make ci\njobs:\n  a:\n    steps:\n      - name: make verify\n        run: echo # make verify\n      - run: go test -race ./...\n      - run: go vet ./...\n";
  assert.deepEqual(ciCoverageGaps(makefile, commented), ["make verify"]);
  // A command with an added filter runs fewer tests: it is not the recipe command.
  const filtered = steps.replace("go test -race ./...", "go test -race ./... -run TestOne");
  assert.deepEqual(ciCoverageGaps(makefile, filtered), ["go test -race ./..."]);
  // A blank line and a comment inside the recipe do not end it.
  const noVet = steps.replace("      - run: go vet ./...\n", "");
  assert.deepEqual(ciCoverageGaps(makefile, noVet), ["go vet ./..."]);
  // Block scalars count line by line, without their comments.
  const block = "on: [pull_request]\njobs:\n  a:\n    steps:\n      - run: |\n          # make ci\n          make verify\n          go test -race ./...\n          go vet ./...\n";
  assert.deepEqual(ciCoverageGaps(makefile, block), []);
});

test("B12: ciCoverageGaps ignores run keys outside steps, folded text and shell comments", () => {
  const makefile = "ci: verify\n";
  const covered = "on: [pull_request]\njobs:\n  a:\n    steps:\n      - name: gate\n        run: make verify\n";
  assert.deepEqual(ciCoverageGaps(makefile, covered), []);
  // A `run` key under env is not a step command.
  const envRun = "on: [pull_request]\nenv:\n  run: make ci\njobs:\n  a:\n    env:\n      run: make verify\n    steps:\n      - name: other\n        env:\n          run: make verify\n        run: echo\n";
  assert.deepEqual(ciCoverageGaps(makefile, envRun), ["make verify"]);
  // A folded block is 1 command: here it only prints text.
  const folded = "on: [pull_request]\njobs:\n  a:\n    steps:\n      - run: >\n          echo\n          make verify\n";
  assert.deepEqual(ciCoverageGaps(makefile, folded), ["make verify"]);
  // A shell comment in a block line hides nothing, and a quoted # is kept.
  const comment = "on: [pull_request]\njobs:\n  a:\n    steps:\n      - run: |\n          echo skipped # ; make ci\n          echo '#' ; make verify\n";
  assert.deepEqual(ciCoverageGaps(makefile, comment), []);
  const commentOnly = comment.replace("echo '#' ; make verify", "echo done");
  assert.deepEqual(ciCoverageGaps(makefile, commentOnly), ["make verify"]);
});

test("B12: ciCoverageGaps reads commented steps keys, indentless step lists and quoted run values", () => {
  const makefile = "ci: verify\n";
  const commentedKey = "on: [pull_request]\njobs:\n  a:\n    steps: # required checks\n      - run: make ci\n";
  assert.deepEqual(ciCoverageGaps(makefile, commentedKey), []);
  const indentless = "on: [pull_request]\njobs:\n  a:\n    steps:\n    - name: checkout\n      uses: actions/checkout@v4\n    - run: make ci\n  b:\n    env:\n      run: make verify\n";
  assert.deepEqual(ciCoverageGaps(makefile, indentless), []);
  const singleQuoted = "on: [pull_request]\njobs:\n  a:\n    steps:\n      - run: 'make ci # full gate'\n";
  assert.deepEqual(ciCoverageGaps(makefile, singleQuoted), []);
  const doubleQuoted = "on: [pull_request]\njobs:\n  a:\n    steps:\n      - run: \"echo \\\"#\\\" ; make verify\" # a YAML comment\n";
  assert.deepEqual(ciCoverageGaps(makefile, doubleQuoted), []);
  // Outside the steps of the indentless list, a run key still does not count.
  const afterSteps = indentless.replace("    - run: make ci\n", "    - run: echo\n");
  assert.deepEqual(ciCoverageGaps(makefile, afterSteps), ["make verify"]);
});

test("B12: core's ci.yml runs make ci on pull requests", () => {
  const ci = read(".github/workflows/ci.yml");
  assert.match(ci, /pull_request/);
  assert.deepEqual(ciCoverageGaps(read("Makefile"), ci), []);
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
