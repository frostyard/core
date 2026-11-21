import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { isScalar, parseDocument, visit } from "yaml";

import { parse } from "yaml";

import { ciCoverageGaps, lintGaps, namesMakeCi, workflowCommands } from "../scripts/lib/ci-gate.mjs";
import { claudeActionGaps, isWorkflowOrActionFile } from "../scripts/lib/fleet-conventions.mjs";

// B12 (ADR-0073): the comparison of `make ci` with a CI workflow lives in
// scripts/lib/ci-gate.mjs, which the organization gate shares (ADR-0083);
// this file re-exports it.
export { ciCoverageGaps, workflowCommands };

// Repository baseline (ADR-0071, docs/specs/repository-baseline.md) applied to
// core itself, 1 test per row. B2's record rules live in
// scripts/check-corrections.mjs and its tests; the B2 test here holds core's
// tree to the folder form. B6 lives in test/risk-paths.test.mjs and
// scripts/check-risk-paths.mjs; B16 in
// test/no-leftover-agent-trees.test.mjs; B17 in test/readme-check.test.mjs. B19 shares
// scripts/lib/ci-gate.mjs with the organization gate, and B20 shares
// claudeActionGaps in scripts/lib/fleet-conventions.mjs with it. B8, B9 and B11 do not apply to core
// (docs/org-adrs.md says why); B10 and B18 are checked by the sweep with gh api.
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

// B13 (ADR-0075): the `updates` entries that are not grouped. Each entry needs
// exactly 1 group: its `patterns` is exactly ["*"] (flow or block list), and it
// has no `applies-to: security-updates`. A second group (for example a
// specific group beside the catch-all) makes a second version-update PR.
// Returns "<ecosystem> <directory>" for each entry that fails. Line-based,
// like missingEcosystems: it reads the block shape that Dependabot files use,
// with no YAML library. It fails closed: a file whose entries it cannot read
// (no `updates:` entry, or a `package-ecosystem:` line outside a parsed
// entry) returns "(unparsed) updates".
export function ungroupedEntries(dependabotText) {
  const indentOf = (line) => line.length - line.trimStart().length;
  const isDash = (line) => /^\s*-(\s|$)/.test(line);
  const unquote = (value) => value.trim().replace(/^(["'])(.*)\1$/, "$2");
  // YAML comments: from an unquoted # at the start or after a blank.
  const stripComment = (line) => {
    let quote = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === "'" || c === '"') {
        quote = c;
      } else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
        return line.slice(0, i).trimEnd();
      }
    }
    return line.trimEnd();
  };
  // The lines under the key at lines[i]: deeper lines, and list items at the
  // same indent (an indentless block sequence).
  const block = (lines, i) => {
    const k = indentOf(lines[i]);
    const out = [];
    for (let j = i + 1; j < lines.length; j++) {
      const ind = indentOf(lines[j]);
      if (ind > k || (ind === k && isDash(lines[j]))) out.push(lines[j]);
      else break;
    }
    return out;
  };
  // The keys of a mapping block: [name, value, index] at the block's indent.
  const keys = (lines) => {
    if (lines.length === 0) return [];
    const ind = indentOf(lines[0]);
    const out = [];
    lines.forEach((line, i) => {
      const m = indentOf(line) === ind && !isDash(line) && line.match(/^\s*([^\s:][^:]*):(?:\s+(.*))?$/);
      if (m) out.push([unquote(m[1]), m[2] ?? "", i]);
    });
    return out;
  };
  const isStarOnly = (values) => values.length === 1 && values[0] === "*";

  const lines = dependabotText.split("\n").map(stripComment).filter((line) => line.trim() !== "");
  const unparsed = ["(unparsed) updates"];
  const start = lines.findIndex((line) => /^updates:$/.test(line));
  if (start < 0) return unparsed;
  // Each list item of `updates`, with its "- " turned into blanks so the item
  // reads as a mapping block. A standalone "-" starts an item whose keys are
  // on the next, deeper lines.
  const items = [];
  let itemIndent = -1;
  for (const line of block(lines, start)) {
    const m = line.match(/^(\s*)-(?:(\s+)(.*))?$/);
    if (m && (itemIndent < 0 || m[1].length === itemIndent)) {
      itemIndent = m[1].length;
      items.push(m[3] ? [" ".repeat(m[1].length + 1 + m[2].length) + m[3]] : []);
    } else if (items.length > 0) {
      items.at(-1).push(line);
    }
  }
  // Every `package-ecosystem` key in the file, also one in a shape this
  // function does not read (a flow mapping): each must be a parsed entry.
  const ecosystemLines = lines.filter((line) => /package-ecosystem["']?\s*:/.test(line)).length;

  const failing = [];
  let parsed = 0;
  for (const item of items) {
    const fields = new Map(keys(item).map(([name, value, i]) => [name, { value, i }]));
    const ecosystem = unquote(fields.get("package-ecosystem")?.value ?? "");
    if (!ecosystem) continue;
    parsed += 1;
    const directory = fields.has("directory")
      ? unquote(fields.get("directory").value)
      : fields.has("directories")
        ? "(directories)"
        : "(no directory)";
    let groupCount = 0;
    let starGroup = false;
    let securityGroup = false;
    if (fields.has("groups")) {
      const groups = block(item, fields.get("groups").i);
      for (const [, , i] of keys(groups)) {
        groupCount += 1;
        const body = block(groups, i);
        for (const [name, value, j] of keys(body)) {
          if (name === "patterns") {
            const flow = value.match(/^\[(.*)\]$/);
            const values = flow
              ? flow[1].split(",").map(unquote).filter((v) => v !== "")
              : value === ""
                ? block(body, j).map((line) => unquote(line.replace(/^\s*-\s*/, "")))
                : [unquote(value)];
            if (isStarOnly(values)) starGroup = true;
          } else if (name === "applies-to" && unquote(value) === "security-updates") {
            securityGroup = true;
          }
        }
      }
    }
    if (groupCount !== 1 || !starGroup || securityGroup) failing.push(`${ecosystem} ${directory}`);
  }
  if (parsed === 0 || parsed !== ecosystemLines) return [...unparsed, ...failing];
  return failing;
}

// B13 (ADR-0089): the schedule, the entry count and `group-by`. Each entry's
// `schedule` is exactly { interval: monthly } (GitHub runs it on the 1st of
// the month and, with no `time`, picks the time of each file); each
// `package-ecosystem` value is in exactly 1 entry (manifests in several
// directories go in its `directories` list); no group has `group-by`, which
// opens 1 PR for each dependency. Reads the file with the `yaml` parser.
// Returns "<ecosystem> <directory>: schedule", "<ecosystem> <directory>:
// group-by" and "<ecosystem>: <n> entries"; a file that is not valid YAML or
// has no `updates` list of mappings returns "(unparsed) updates" (fails
// closed).
export function entryGaps(dependabotText) {
  const isMapping = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  let doc;
  try {
    doc = parse(dependabotText);
  } catch {
    return ["(unparsed) updates"];
  }
  const updates = isMapping(doc) ? doc.updates : undefined;
  if (!Array.isArray(updates) || updates.length === 0 || !updates.every(isMapping)) {
    return ["(unparsed) updates"];
  }
  const failing = [];
  const counts = new Map();
  for (const entry of updates) {
    const ecosystem = String(entry["package-ecosystem"] ?? "(no ecosystem)");
    const directory =
      typeof entry.directory === "string" ? entry.directory : "directories" in entry ? "(directories)" : "(no directory)";
    counts.set(ecosystem, (counts.get(ecosystem) ?? 0) + 1);
    const schedule = entry.schedule;
    const monthly = isMapping(schedule) && Object.keys(schedule).length === 1 && schedule.interval === "monthly";
    if (!monthly) failing.push(`${ecosystem} ${directory}: schedule`);
    const groups = isMapping(entry.groups) ? Object.values(entry.groups) : [];
    if (groups.some((group) => isMapping(group) && "group-by" in group)) failing.push(`${ecosystem} ${directory}: group-by`);
  }
  for (const [ecosystem, count] of counts) {
    if (count > 1) failing.push(`${ecosystem}: ${count} entries`);
  }
  return failing;
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

// B5 (ADR-0090): read with the yaml parser, every OWNER/REPO[/PATH]@SHA pin of
// the given workflows carries a # vX.Y.Z or # vX.Y comment on its line (a frostyard/core
// reusable workflow pin only a comment, as core has no release tags), and each
// action has 1 SHA across all of them. Returns the gaps and the pins counted.
export function actionPinGaps(files) {
  const gaps = [];
  const shas = new Map();
  let pins = 0;
  for (const { name, text } of files) {
    visit(parseDocument(text), {
      Pair(_, pair) {
        if (!isScalar(pair.key) || pair.key.value !== "uses" || !isScalar(pair.value)) return;
        const match = /^([^@]+)@([0-9a-f]{40})$/.exec(String(pair.value.value));
        if (!match) return;
        const [, action, sha] = match;
        const comment = (pair.value.comment ?? "").trim();
        pins++;
        if (action.startsWith("frostyard/core/.github/workflows/")) {
          if (!comment) gaps.push(`${name}: ${action} has no comment`);
        } else if (!/^v\d+\.\d+(\.\d+)?$/.test(comment)) {
          gaps.push(`${name}: ${action} has comment "${comment}", want # vX.Y.Z or # vX.Y`);
        }
        if (!shas.has(action)) shas.set(action, new Set());
        shas.get(action).add(sha);
      },
    });
  }
  for (const [action, set] of shas) {
    if (set.size !== 1) gaps.push(`${action} has ${set.size} SHAs across the workflows, want 1`);
  }
  return { gaps, pins };
}

test("B5: actionPinGaps wants a # vX.Y.Z or # vX.Y comment and 1 SHA for each action", () => {
  const a = "a".repeat(40);
  const b = "b".repeat(40);
  const wf = (...steps) => `jobs:\n  j:\n    steps:\n${steps.map((s) => `      - ${s}\n`).join("")}`;
  const one = (text) => actionPinGaps([{ name: "w.yml", text }]);
  assert.deepEqual(one(wf(`uses: actions/checkout@${a} # v7.0.1`)), { gaps: [], pins: 1 });
  assert.deepEqual(one(wf(`uses: "actions/checkout@${a}" # v7.0.1`)), { gaps: [], pins: 1 });
  // ADR-0090: an upstream whose releases have 2 parts (r2-upload-action v1.5).
  assert.deepEqual(one(wf(`uses: ryand56/r2-upload-action@${a} # v1.5`)), { gaps: [], pins: 1 });
  assert.deepEqual(
    actionPinGaps([
      { name: "a.yml", text: wf(`uses: actions/checkout@${a} # v7.0.1`) },
      { name: "b.yml", text: wf(`uses: actions/checkout@${a} # v7.0.1`, `uses: actions/setup-node@${b} # v7.1.0`) },
    ]),
    { gaps: [], pins: 3 },
  );
  // Not OWNER/REPO@SHA: the B5 pin pattern reports these, this check skips them.
  assert.deepEqual(one(wf("uses: ./.github/actions/x", "uses: actions/checkout@v7", `uses: docker://alpine@sha256:${"c".repeat(64)}`)), { gaps: [], pins: 0 });
  // A uses: line inside a run block is text, not a pin.
  assert.deepEqual(one(wf(`run: |\n          echo "uses: actions/checkout@${a}"`)), { gaps: [], pins: 0 });
  const comment = {
    none: `uses: actions/checkout@${a}`,
    major: `uses: actions/checkout@${a} # v7`,
    fourParts: `uses: actions/checkout@${a} # v7.0.1.2`,
    branch: `uses: actions/checkout@${a} # main 2026-11-09`,
    nextLine: `uses: actions/checkout@${a}\n        # v7.0.1`,
    trailingText: `uses: actions/checkout@${a} # v7.0.1 (latest)`,
  };
  for (const [name, step] of Object.entries(comment)) {
    const { gaps } = one(wf(step));
    assert.equal(gaps.length, 1, name);
    assert.match(gaps[0], /^w\.yml: actions\/checkout has comment ".*", want # vX\.Y\.Z or # vX\.Y$/, name);
  }
  assert.deepEqual(
    actionPinGaps([
      { name: "a.yml", text: wf(`uses: actions/checkout@${a} # v7.0.1`) },
      { name: "b.yml", text: wf(`uses: actions/checkout@${b} # v7.0.2`) },
    ]).gaps,
    ["actions/checkout has 2 SHAs across the workflows, want 1"],
  );
  assert.deepEqual(one(wf(`uses: actions/checkout@${a} # v7.0.1`, `uses: actions/checkout@${b} # v7.0.1`)).gaps, [
    "actions/checkout has 2 SHAs across the workflows, want 1",
  ]);
  // Nested paths are separate actions.
  assert.deepEqual(one(wf(`uses: github/codeql-action/init@${a} # v4.1.0`, `uses: github/codeql-action/analyze@${b} # v4.1.0`)).gaps, []);
  const core = (c) => `jobs:\n  t:\n    uses: frostyard/core/.github/workflows/pr-triage.yml@${a}${c}\n`;
  assert.deepEqual(one(core(" # core#246 (frostyard/core main, 2026-11-14; core has no release tags)")), { gaps: [], pins: 1 });
  assert.deepEqual(one(core("")).gaps, ["w.yml: frostyard/core/.github/workflows/pr-triage.yml has no comment"]);
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

// B2 (ADR-0081): the corrections live only in .memory/corrections/. The
// retired single file is not tracked, and core's validator reads the folder
// form (its legacy-form line would say "lines (legacy form").
test("B2: core keeps its corrections only as record files in .memory/corrections/", () => {
  const files = lsFiles();
  assert.ok(!files.includes(".memory/corrections.jsonl"), ".memory/corrections.jsonl is tracked");
  const records = files.filter((file) => file.startsWith(".memory/corrections/"));
  assert.ok(records.length > 0, ".memory/corrections/ has no tracked file");
  for (const file of records) {
    assert.match(file, /^\.memory\/corrections\/(\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.json|\.gitkeep)$/, file);
  }
  const out = execFileSync(process.execPath, [path.join(root, "scripts/check-corrections.mjs"), "--root", root], {
    cwd: root,
    encoding: "utf8",
  });
  assert.match(out, /^ok {3}corrections: \d+ records\n$/);
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
  // ADR-0086: only this reusable workflow inherits the calling job's grant.
  const noPermissionsWorkflows = ["pr-triage.yml"];
  for (const name of noPermissionsWorkflows) {
    assert.ok(workflows.includes(name), `${name}: the permission exemption must name an existing workflow`);
  }
  let checkouts = 0;
  for (const name of workflows) {
    const text = read(path.join(".github/workflows", name));
    for (const line of text.split("\n").filter((l) => /^\s*-?\s*uses:/.test(l))) {
      if (/uses:\s*\.\//.test(line)) continue;
      assert.match(line, /uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\S+/, `${name}: unpinned action: ${line.trim()}`);
    }
    if (noPermissionsWorkflows.includes(name)) {
      assert.match(text, /^on:\n {2}workflow_call:\n/m, `${name}: the permission exemption requires workflow_call`);
      assert.equal((text.match(/^on:/gm) ?? []).length, 1, `${name}: exactly 1 trigger block`);
      const triggers = text.split(/^on:\n/m)[1].split(/^\S/m)[0].split("\n").filter((line) => /^ {2}\S/.test(line));
      assert.deepEqual(triggers, ["  workflow_call:"], `${name}: no other trigger may inherit the caller's grant`);
      assert.ok(!/^\s*permissions:/m.test(text), `${name}: the reusable workflow must set no permissions`);
    } else {
      assert.match(text, /^permissions:\s*\{\}\s*$/m, `${name}: no top-level permissions: {}`);
    }
    const result = checkoutCredentials(text);
    assert.deepEqual(result.offenders, [], `${name}: a checkout keeps credentials`);
    checkouts += result.checkouts;
  }
  assert.deepEqual(
    workflows.filter((name) => !/^permissions:\s*\{\}\s*$/m.test(read(path.join(".github/workflows", name)))).sort(),
    ["pr-triage.yml"],
    "only pr-triage.yml omits top-level permissions: {}",
  );
  assert.ok(checkouts > 0, "no actions/checkout step found: the credentials check checked nothing");
  // ADR-0090: core dropped its literal SHA (ADR-0088), so it checks the comment
  // and 1 SHA for each action across every workflow.
  const pinCheck = actionPinGaps(workflows.map((name) => ({ name, text: read(path.join(".github/workflows", name)) })));
  assert.deepEqual(pinCheck.gaps, [], "action pins");
  assert.ok(pinCheck.pins > 0, "no action pin found: the pin check checked nothing");
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

test("B12: ciCoverageGaps counts each target of 1 make call (ADR-0083)", () => {
  const makefile = "ci: verify ui-check desktop-build desktop-build-windows\n\tgo test -race ./...\n";
  const workflow =
    "on: [pull_request]\njobs:\n  a:\n    steps:\n      - run: make verify\n      - run: make ui-check IN_NSL='sh -c'\n      - run: make desktop-build desktop-build-windows\n      - run: go test -race ./...\n";
  assert.deepEqual(ciCoverageGaps(makefile, workflow), []);
  assert.deepEqual(ciCoverageGaps(makefile, workflow.replace(" desktop-build-windows\n", "\n")), ["make desktop-build-windows"]);
  // A quoted target is a target.
  assert.deepEqual(ciCoverageGaps(makefile, "on: [pull_request]\njobs:\n  a:\n    steps:\n      - run: make 'ci'\n"), []);
  // An echo that names make is not a make call.
  assert.deepEqual(ciCoverageGaps("ci: verify\n", "on: [pull_request]\njobs:\n  a:\n    steps:\n      - run: echo 'run make ci'\n"), ["make verify"]);
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

test("B13: ungroupedEntries names each entry without a [\"*\"] group or with a security-updates group (ADR-0075)", () => {
  const text = [
    "# Dependabot",
    "version: 2",
    "updates:",
    "  - package-ecosystem: \"github-actions\" # grouped, flow list",
    "    directory: \"/\"",
    "    groups:",
    "      actions:",
    "        patterns: [\"*\"]",
    "  - package-ecosystem: \"gomod\" # not grouped",
    "    directory: \"/\"",
    "    schedule:",
    "      interval: \"weekly\"",
    "  - package-ecosystem: npm # grouped, block list",
    "    directory: /web",
    "    groups:",
    "      npm:",
    "        patterns:",
    "          - \"*\"",
    "  - package-ecosystem: \"npm\" # grouped for security updates",
    "    directory: \"/app\"",
    "    groups:",
    "      npm:",
    "        applies-to: security-updates",
    "        patterns: [\"*\"]",
    "  - package-ecosystem: \"cargo\" # a group that does not match every dependency",
    "    directory: \"/\"",
    "    groups:",
    "      serde:",
    "        patterns: [\"serde*\"]",
    "  - package-ecosystem: \"docker\" # indentless block list, single quotes",
    "    directory: \"/\"",
    "    groups:",
    "      docker:",
    "        patterns:",
    "        - '*'",
    "        applies-to: version-updates",
    "  - package-ecosystem: \"pip\" # a specific group beside the catch-all: 2 PRs",
    "    directory: \"/\"",
    "    groups:",
    "      react:",
    "        patterns: [\"react*\"]",
    "      all:",
    "        patterns: [\"*\"]",
    "  -",
    "    package-ecosystem: \"bundler\" # standalone dash, not grouped",
    "    directory: \"/\"",
    "  -",
    "    package-ecosystem: \"composer\" # standalone dash, grouped",
    "    directory: \"/\"",
    "    groups:",
    "      composer:",
    "        patterns: [\"*\"]",
    "",
  ].join("\n");
  assert.deepEqual(ungroupedEntries(text), ["gomod /", "npm /app", "cargo /", "pip /", "bundler /"]);
});

test("B13: ungroupedEntries fails closed on a file it cannot read", () => {
  // No `updates:` key, or an `updates:` with no entry: never a pass.
  assert.deepEqual(ungroupedEntries("version: 2\n"), ["(unparsed) updates"]);
  assert.deepEqual(ungroupedEntries("version: 2\nupdates: []\n"), ["(unparsed) updates"]);
  // A `package-ecosystem:` line outside a parsed entry (a flow mapping here).
  const flow = [
    "version: 2",
    "updates:",
    "  - package-ecosystem: \"npm\"",
    "    directory: \"/\"",
    "    groups:",
    "      npm:",
    "        patterns: [\"*\"]",
    "  - { package-ecosystem: \"gomod\",",
    "      directory: \"/\" }",
    "",
  ].join("\n");
  assert.ok(ungroupedEntries(flow).includes("(unparsed) updates"));
});

test("B13: core's Dependabot configuration groups every entry (ADR-0075)", () => {
  assert.deepEqual(ungroupedEntries(read(".github/dependabot.yml")), []);
});

test("B13: entryGaps names each entry that is not monthly, each group-by and each ecosystem in 2 entries (ADR-0089)", () => {
  const text = [
    "# Dependabot",
    "version: 2",
    "updates:",
    "  - package-ecosystem: \"github-actions\" # monthly, quoted",
    "    directory: \"/\"",
    "",
    "    schedule:",
    "      # the 1st of the month",
    "      interval: \"monthly\"",
    "  - package-ecosystem: gomod # weekly",
    "    directory: /",
    "    schedule: { interval: weekly }",
    "  - directories: # several directories in 1 entry; the first key is not the ecosystem",
    "    - /client",
    "    - /ui",
    "    package-ecosystem: npm",
    "    schedule: {interval: 'monthly'}",
    "    groups:",
    "      npm:",
    "        patterns: [\"*\"]",
    "  - package-ecosystem: cargo # monthly with a time",
    "    directory: /",
    "    schedule:",
    "      interval: monthly",
    "      time: \"06:00\"",
    "  - package-ecosystem: docker # no schedule",
    "    directory: /",
    "    env:",
    "      interval: monthly",
    "  - package-ecosystem: pip # first of 2 entries for 1 ecosystem",
    "    directory: /",
    "    schedule:",
    "      interval: monthly",
    "  - package-ecosystem: pip # second entry: a second PR each run",
    "    directory: /site",
    "    schedule:",
    "      interval: >-",
    "        monthly",
    "  -",
    "    package-ecosystem: \"bundler\" # standalone dash, cron",
    "    directory: \"/\"",
    "    schedule:",
    "      interval: cron",
    "      cronjob: \"0 6 1 * *\"",
    "  - package-ecosystem: \"gomodules\" # group-by: 1 PR for each dependency",
    "    directories: [\"/a\", \"/b\"]",
    "    schedule:",
    "      interval: |",
    "        monthly",
    "    groups:",
    "      go:",
    "        patterns: [\"*\"]",
    "        group-by: dependency-name",
    "",
  ].join("\n");
  assert.deepEqual(entryGaps(text), [
    "gomod /: schedule",
    "cargo /: schedule",
    "docker /: schedule",
    "bundler /: schedule",
    "gomodules (directories): schedule",
    "gomodules (directories): group-by",
    "pip: 2 entries",
  ]);
});

test("B13: entryGaps reads CRLF, a BOM and a file with no final newline", () => {
  const lines = ["version: 2", "updates:", "  - package-ecosystem: npm", "    directory: /", "    schedule:", "      interval: monthly"];
  assert.deepEqual(entryGaps(lines.join("\r\n")), []);
  assert.deepEqual(entryGaps(`\uFEFF${lines.join("\n")}\n`), []);
  assert.deepEqual(entryGaps(lines.join("\n").replace("monthly", "monthlyish")), ["npm /: schedule"]);
});

test("B13: entryGaps fails closed on a file it cannot read", () => {
  assert.deepEqual(entryGaps(""), ["(unparsed) updates"]);
  assert.deepEqual(entryGaps("version: 2\n"), ["(unparsed) updates"]);
  assert.deepEqual(entryGaps("version: 2\nupdates: []\n"), ["(unparsed) updates"]);
  assert.deepEqual(entryGaps("version: 2\nupdates:\n  - npm\n"), ["(unparsed) updates"]);
  assert.deepEqual(entryGaps("version: 2\nupdates:\n  - package-ecosystem: [\n"), ["(unparsed) updates"]);
});

test("B13: core's Dependabot configuration runs monthly in 1 entry for each ecosystem (ADR-0089)", () => {
  assert.deepEqual(entryGaps(read(".github/dependabot.yml")), []);
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

test("B19: core's AGENTS.md names make ci, and no pull-request workflow lints outside it (ADR-0083)", () => {
  assert.ok(namesMakeCi(read("AGENTS.md")), "AGENTS.md does not name make ci");
  const workflows = Object.fromEntries(
    readdirSync(path.join(root, ".github/workflows"))
      .filter((name) => /\.ya?ml$/.test(name))
      .map((name) => [name, read(`.github/workflows/${name}`)]),
  );
  assert.deepEqual(lintGaps({ makefile: read("Makefile"), packageJson: read("package.json"), workflows }), []);
});

// B20 (ADR-0091): no workflow or action uses anthropics/claude-code-action or
// anthropics/claude-code-base-action. The organization gate runs the same reader.
const CLAUDE_SHA = "c".repeat(40);
const step = (uses) => `on: pull_request\njobs:\n  review:\n    runs-on: ubuntu-latest\n    steps:\n      - ${uses}\n`;

test("B20: claudeActionGaps fails each uses of either action, quoted, mixed-case or under another owner", () => {
  const failing = {
    plain: `uses: anthropics/claude-code-action@${CLAUDE_SHA} # v1.0.279`,
    base: `uses: anthropics/claude-code-base-action@${CLAUDE_SHA} # v0.0.63`,
    doubleQuoted: `uses: "anthropics/claude-code-action@${CLAUDE_SHA}"`,
    singleQuoted: "uses: 'anthropics/claude-code-action@v1'",
    mixedCase: "uses: Anthropics/Claude-Code-Action@v1",
    upperCase: "uses: ANTHROPICS/CLAUDE-CODE-BASE-ACTION@main",
    noRef: "uses: anthropics/claude-code-action",
    subPath: "uses: anthropics/claude-code-action/review@v1",
    fork: "uses: someone/claude-code-action@v1",
    docker: "uses: docker://ghcr.io/anthropics/claude-code-action:latest",
    flowMapping: "{ name: review, uses: anthropics/claude-code-action@v1 }",
    quotedKey: '"uses": anthropics/claude-code-action@v1',
    upperKey: "USES: anthropics/claude-code-action@v1",
  };
  for (const [name, line] of Object.entries(failing)) {
    const gaps = claudeActionGaps({ ".github/workflows/review.yml": step(line) });
    assert.equal(gaps.length, 1, name);
    assert.match(gaps[0], /^\.github\/workflows\/review\.yml: uses \S*claude-code-(base-)?action/i, name);
  }
  // A composite action and a reusable workflow call count too.
  const composite = "runs:\n  using: composite\n  steps:\n    - uses: anthropics/claude-code-action@v1\n";
  assert.deepEqual(claudeActionGaps({ ".github/actions/review/action.yml": composite }), [
    ".github/actions/review/action.yml: uses anthropics/claude-code-action@v1",
  ]);
  const reusable = "on: pull_request\njobs:\n  review:\n    uses: anthropics/claude-code-action/.github/workflows/review.yml@v1\n";
  assert.equal(claudeActionGaps({ ".github/workflows/r.yml": reusable }).length, 1);
  // An anchor and its alias, a merge key and a second document are read.
  const anchored = "x: &claude anthropics/claude-code-action@v1\njobs:\n  a:\n    steps:\n      - uses: *claude\n";
  assert.deepEqual(claudeActionGaps({ ".github/workflows/a.yml": anchored }), [".github/workflows/a.yml: uses anthropics/claude-code-action@v1"]);
  const merged = "base: &s\n  uses: anthropics/claude-code-action@v1\njobs:\n  a:\n    steps:\n      - <<: *s\n";
  assert.ok(claudeActionGaps({ ".github/workflows/m.yml": merged }).length >= 1, "merge key");
  const twoDocs = `on: push\n---\n${step("uses: anthropics/claude-code-action@v1")}`;
  assert.equal(claudeActionGaps({ ".github/workflows/d.yml": twoDocs }).length, 1, "second document");
  // Fail closed: a file the parser rejects fails when it names the action.
  assert.deepEqual(claudeActionGaps({ ".github/workflows/bad.yml": "jobs: [\n  uses: anthropics/claude-code-action@v1\n" }), [
    ".github/workflows/bad.yml: not valid YAML and names claude-code-action",
  ]);
  const laughs = `a: &a [x, x, x, x, x, x, x, x, x, x]\nb: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]\nc: [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b, *b]\nd: anthropics/claude-code-action\n`;
  assert.deepEqual(claudeActionGaps({ ".github/workflows/l.yml": laughs }), [".github/workflows/l.yml: not valid YAML and names claude-code-action"]);
  // Gaps are sorted across files.
  assert.deepEqual(
    claudeActionGaps({ "b.yml": step("uses: anthropics/claude-code-action@v1"), "a.yml": step("uses: anthropics/claude-code-base-action@v1") }),
    ["a.yml: uses anthropics/claude-code-base-action@v1", "b.yml: uses anthropics/claude-code-action@v1"],
  );
});

test("B20: claudeActionGaps passes a name in a comment, a run step, a step name or a doc", () => {
  const mention = [
    "# Replaced anthropics/claude-code-action (ADR-0091).",
    "on: pull_request",
    "jobs:",
    "  review:",
    "    name: no anthropics/claude-code-action here",
    "    runs-on: ubuntu-latest",
    "    steps:",
    `      - uses: actions/checkout@${CLAUDE_SHA} # v7.0.1 (not anthropics/claude-code-action)`,
    "        with:",
    "          persist-credentials: false",
    "      - run: |",
    "          echo 'uses: anthropics/claude-code-action@v1'",
    "        env:",
    "          NOTE: anthropics/claude-code-action",
    "",
  ].join("\n");
  assert.deepEqual(claudeActionGaps({ ".github/workflows/review.yml": mention }), []);
  // Near names that are other actions pass.
  // Only the repository name counts: another repository's subaction or a local
  // directory of that name is not the action (its action.yml is read itself).
  for (const uses of [
    "anthropics/claude-code-actions@v1",
    "anthropics/claude-code@v1",
    "x/my-claude-code-action@v1",
    "owner/tools/claude-code-action@v1",
    "claude-code-action@v1",
    "./.github/actions/claude-code-action",
    "docker://ghcr.io/anthropics/claude-code-action-runner:1",
  ]) {
    assert.deepEqual(claudeActionGaps({ ".github/workflows/w.yml": step(`uses: ${uses}`) }), [], uses);
  }
  // Invalid YAML that does not name the action is left to the other checks.
  assert.deepEqual(claudeActionGaps({ ".github/workflows/bad.yml": "jobs: [\n" }), []);
  assert.deepEqual(claudeActionGaps({ ".github/workflows/empty.yml": "" }), []);
  // The check reads only workflows and the YAML files under .github/actions.
  for (const file of [".github/workflows/ci.yml", ".github/workflows/ci.YAML", ".github/actions/review/action.yml", ".github/actions/a/b/action.yaml"]) {
    assert.ok(isWorkflowOrActionFile(file), file);
  }
  for (const file of ["docs/adr/0091-x.md", ".github/actions/review/README.md", ".github/workflows/sub/w.yml", ".github/dependabot.yml", "test/fixtures/w.yml"]) {
    assert.ok(!isWorkflowOrActionFile(file), file);
  }
});

test("B20: claudeActionGaps reads every YAML input shape with the parser", () => {
  const one = (text) => claudeActionGaps({ "w.yml": text });
  const hit = ["w.yml: uses anthropics/claude-code-action@v1"];
  const shapes = {
    folded: "jobs:\n  a:\n    steps:\n      - uses: >-\n          anthropics/claude-code-action@v1\n",
    literal: "jobs:\n  a:\n    steps:\n      - uses: |-\n          anthropics/claude-code-action@v1\n",
    indentless: "jobs:\n  a:\n    steps:\n    - name: review\n      uses: anthropics/claude-code-action@v1\n",
    notFirstKey: "jobs:\n  a:\n    steps:\n      - name: review\n        id: r\n        uses: anthropics/claude-code-action@v1\n",
    commentsAndBlanks: "jobs:\n  a:\n    steps:\n      - name: review\n\n        # a comment\n        uses: anthropics/claude-code-action@v1 # v1.0.0\n",
    flowKey: "jobs: { a: { steps: [ { \"uses\": \"anthropics/claude-code-action@v1\" } ] } }\n",
    crlf: "jobs:\r\n  a:\r\n    steps:\r\n      - uses: anthropics/claude-code-action@v1\r\n",
    bom: "\uFEFFjobs:\n  a:\n    steps:\n      - uses: anthropics/claude-code-action@v1\n",
    noFinalNewline: "jobs:\n  a:\n    steps:\n      - uses: anthropics/claude-code-action@v1",
    replacementChar: "name: \uFFFD\uFFFD\njobs:\n  a:\n    steps:\n      - uses: anthropics/claude-code-action@v1\n",
    // A uses key under another mapping counts too: the check fails closed.
    underWith: "jobs:\n  a:\n    steps:\n      - uses: ./local\n        with:\n          uses: anthropics/claude-code-action@v1\n",
  };
  for (const [name, text] of Object.entries(shapes)) assert.deepEqual(one(text), hit, name);
  // A match inside a longer word or a URL is not the action.
  for (const uses of ["anthropics/claude-code-actionx@v1", "anthropics/xclaude-code-action@v1", "https://example.com/claude-code-actions"]) {
    assert.deepEqual(one(step(`uses: ${uses}`)), [], uses);
  }
  assert.deepEqual(one("\uFEFF"), []);
  assert.deepEqual(one("# only a comment naming anthropics/claude-code-action\n"), []);
});

test("B20: no core workflow or action uses claude-code-action (ADR-0091)", () => {
  const files = lsFiles().filter(isWorkflowOrActionFile);
  assert.ok(files.some((file) => file.startsWith(".github/workflows/")), "no workflow found: the check checked nothing");
  assert.deepEqual(claudeActionGaps(Object.fromEntries(files.map((file) => [file, read(file)]))), []);
});
