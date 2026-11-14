import assert from "node:assert/strict";
import test from "node:test";

import {
  LINT_ACTIONS,
  LINT_TOOLS,
  lintGaps,
  lintScriptPaths,
  makeCalls,
  makeCiText,
  makeReach,
  makeRules,
  namesMakeCi,
  npmScripts,
  runsOnPullRequest,
  scriptPaths,
  workflowActions,
  workflowLintChecks,
} from "../scripts/lib/ci-gate.mjs";

// The input shapes of the hand-written readers in scripts/lib/ci-gate.mjs
// (ADR-0083). workflowCommands and ciCoverageGaps are tested in
// test/repository-baseline.test.mjs (row B12).

test("runsOnPullRequest reads the top-level on key in each YAML form", () => {
  const yes = [
    "on: pull_request\n",
    "on: [push, pull_request]\n",
    "on:\n  pull_request:\n    branches: [main]\n",
    "on:\n  - push\n  - pull_request\n",
    "on:\n  # comment\n\n  pull_request: {}\n",
    '"on":\n  pull_request:\n',
    "'on': pull_request_target\n",
    "true:\n  pull_request:\n",
    "name: CI\r\non:\r\n  pull_request:\r\n",
    "\uFEFFon: pull_request",
    "on: [pull_request] # gate\njobs: {}\n",
  ];
  for (const text of yes) assert.equal(runsOnPullRequest(text), true, JSON.stringify(text));
  const no = [
    "",
    "on: push\n",
    "on:\n  push:\n    # pull_request is off\njobs:\n  a:\n    if: github.event_name == 'pull_request'\n",
    "on:\n  pull_requests:\n",
    "jobs:\n  a:\n    on: pull_request\n",
    "on: [push]\nenv:\n  pull_request: 1\n",
  ];
  for (const text of no) assert.equal(runsOnPullRequest(text), false, JSON.stringify(text));
});

test("workflowActions reads uses values without refs, comments, local or docker actions", () => {
  const text = [
    "jobs:",
    "  a:",
    "    steps:",
    "      - uses: golangci/golangci-lint-action@0123456789012345678901234567890123456789 # v9",
    "      - name: md",
    "        uses: 'DavidAnson/markdownlint-cli2-action@abc'",
    '      - uses: "github/codeql-action/init@v3"',
    "      # - uses: ludeeus/action-shellcheck@master",
    "      - uses: ./local-action",
    "      - uses: docker://alpine:3",
    "  b:",
    "    uses: frostyard/core/.github/workflows/pr-triage.yml@main",
  ].join("\n");
  assert.deepEqual(workflowActions(text), [
    "golangci/golangci-lint-action",
    "davidanson/markdownlint-cli2-action",
    "github/codeql-action",
    "frostyard/core",
  ]);
  assert.deepEqual(workflowActions(""), []);
});

test("makeRules reads rule lines, inline recipes, continuations and comments", () => {
  const makefile = [
    "GO ?= go",
    "X ?= a:b",
    "Y := c",
    ".PHONY: verify check ci",
    "verify: ; npm run verify",
    "ci: verify \\",
    "\tlint ## the gate",
    "\t@echo start",
    "",
    "# a comment inside the recipe",
    "\t-$(GO) test \\",
    "\t  ./...",
    "a b: c",
    "\ttrue",
    "ci: VAR = 1",
    "%.o: %.c",
    "\tcc $<",
    "dc::",
    "\techo dc",
  ].join("\r\n");
  const rules = makeRules(makefile);
  assert.deepEqual(rules.get("verify"), { prerequisites: [], recipe: ["npm run verify"] });
  assert.deepEqual(rules.get("ci"), { prerequisites: ["verify", "lint"], recipe: ["echo start", "$(GO) test ./..."] });
  assert.deepEqual(rules.get("a"), { prerequisites: ["c"], recipe: ["true"] });
  assert.deepEqual(rules.get("b"), { prerequisites: ["c"], recipe: ["true"] });
  assert.deepEqual(rules.get("dc"), { prerequisites: [], recipe: ["echo dc"] });
  assert.equal(rules.has("X"), false);
  assert.equal(rules.has("Y"), false);
  assert.equal(rules.has("%.o"), false);
  assert.equal(makeRules("").size, 0);
});

test("makeCalls finds make in command position only, outside quotes, and skips other Makefiles", () => {
  assert.deepEqual(makeCalls("make lint"), ["lint"]);
  assert.deepEqual(makeCalls("@$(MAKE) --no-print-directory lint-version-check"), ["lint-version-check"]);
  assert.deepEqual(makeCalls("${MAKE} a b V=1"), ["a", "b"]);
  assert.deepEqual(makeCalls("cd x && make fmt; true"), ["fmt"]);
  assert.deepEqual(makeCalls("if true; then make vet; fi"), ["vet"]);
  assert.deepEqual(makeCalls("CGO_ENABLED=0 make build"), ["build"]);
  assert.deepEqual(makeCalls('echo "files need formatting (run make fmt)"'), []);
  assert.deepEqual(makeCalls("echo 'needs make 4'"), []);
  assert.deepEqual(makeCalls("echo requires make"), []);
  assert.deepEqual(makeCalls("make -C site build"), []);
  assert.deepEqual(makeCalls("make --file=other.mk lint"), []);
  assert.deepEqual(makeCalls("cmake --build ."), []);
  assert.deepEqual(makeCalls("make ci # comment"), ["ci"]);
  assert.deepEqual(makeCalls(""), []);
});

test("makeReach follows prerequisites and recipe calls, through cycles", () => {
  const makefile = "ci: verify\n\t$(MAKE) race\nverify: lint\n\tgo test ./...\nlint:\n\tgolangci-lint run\nrace: ci\n\tgo test -race ./...\nother:\n\tshfmt -d .\n";
  const reach = makeReach(makefile, "ci");
  assert.equal(reach.found, true);
  assert.deepEqual([...reach.targets].sort(), ["ci", "lint", "race", "verify"]);
  assert.ok(reach.recipe.includes("golangci-lint run"));
  assert.ok(!reach.recipe.includes("shfmt -d ."));
  assert.equal(makeReach("verify:\n\ttrue\n", "ci").found, false);
});

test("npmScripts follows npm run, run-script and test, and tolerates bad package.json", () => {
  const pkg = JSON.stringify({
    scripts: { check: "npm run verify", verify: "npm run lint && npm test", lint: "eslint .", test: "node --test", unused: "prettier -c ." },
  });
  assert.deepEqual(npmScripts(["npm run check"], pkg), [
    { name: "check", command: "npm run verify" },
    { name: "verify", command: "npm run lint && npm test" },
    { name: "lint", command: "eslint ." },
    { name: "test", command: "node --test" },
  ]);
  assert.deepEqual(npmScripts(["npm run-script missing"], pkg), []);
  assert.deepEqual(npmScripts(["npm run check"], "{not json"), []);
  assert.deepEqual(npmScripts(["npm run check"], null), []);
  assert.deepEqual(npmScripts(["pnpm run check"], pkg), []);
});

test("scriptPaths needs a directory part and refuses parents, globs, variables and URLs", () => {
  assert.deepEqual(
    scriptPaths([
      "./lint.sh",
      "bash scripts/check-shell.sh --all",
      'node "scripts/check-docs.mjs"',
      "echo requires Node.js 22",
      "../outside.sh",
      "node --test test/*.test.mjs",
      "$(DIR)/x.sh",
      "curl https://example.com/install.sh",
      "/usr/bin/tool.py",
    ]),
    ["lint.sh", "scripts/check-shell.sh", "scripts/check-docs.mjs"],
  );
  assert.deepEqual(scriptPaths([]), []);
});

test("workflowLintChecks finds tools in run commands, lint actions and lint make targets", () => {
  const text = [
    "on: [pull_request]",
    "jobs:",
    "  lint:",
    "    steps:",
    "      - uses: astral-sh/ruff-action@0123 # v3",
    "      - run: |",
    "          go vet ./...",
    "          test -z \"$(gofmt -l .)\"",
    "      - run: make lint-version-check",
    "      - run: make test",
    "      - name: shellcheck",
    "        run: echo done",
    "      - run: npm run lint:md",
    "      - run: echo golangci-lint-action blackbox",
  ].join("\n");
  assert.deepEqual(workflowLintChecks(text), [
    { tool: "go vet" },
    { tool: "gofmt" },
    { target: "lint-version-check" },
    { tool: "npm lint or format script" },
    { tool: "ruff", action: "astral-sh/ruff-action" },
  ]);
});

test("every lint action names a tool that LINT_TOOLS knows, or 1 that make ci cannot run", () => {
  const tools = new Set(LINT_TOOLS.map(({ tool }) => tool));
  for (const [action, tool] of LINT_ACTIONS) {
    assert.equal(action, action.toLowerCase());
    assert.ok(tools.has(tool) || ["super-linter", "lint-action"].includes(tool), `${action} -> ${tool}`);
  }
});

const ON_PR = "on: [pull_request]\njobs:\n  a:\n    steps:\n";

test("lintGaps accepts a tool that make ci runs, directly, by variable, by npm script or by script file", () => {
  const workflows = {
    "ci.yml": `${ON_PR}      - run: make ci\n`,
    "lint.yml": `${ON_PR}      - run: golangci-lint run\n      - run: npm run lint\n      - run: shellcheck x.sh\n      - run: go vet ./...\n      - run: gofmt -l .\n      - run: make fmt-check\n`,
  };
  const makefile =
    "GOLANGCI ?= golangci-lint\nci: verify\nverify: fmt-check\n\t$(GOLANGCI) run\n\tnpm run check\n\t./scripts/sh.sh\nfmt-check:\n\tgofumpt -l .\n";
  const packageJson = JSON.stringify({ scripts: { check: "npm run lint", lint: "eslint ." } });
  const files = { "scripts/sh.sh": "shellcheck *.sh\n" };
  assert.deepEqual(makeCiText(makefile, packageJson).paths, ["scripts/sh.sh"]);
  assert.deepEqual(lintGaps({ makefile, packageJson, workflows, files }), []);
  // Without the script file, shellcheck is outside make ci.
  assert.deepEqual(lintGaps({ makefile, packageJson, workflows }), ["shellcheck in lint.yml"]);
});

test("lintGaps names each lint check outside make ci, once, by workflow", () => {
  const makefile = "ci: verify\nverify:\n\tgo test ./...\nlint:\n\tgolangci-lint run\n";
  const workflows = {
    "b.yml": `${ON_PR}      - uses: github/super-linter@0123\n      - run: make lint\n      - run: make lint\n`,
    "a.yml": `${ON_PR}      - uses: golangci/golangci-lint-action@0123\n`,
    "release.yml": "on:\n  push:\njobs:\n  a:\n    steps:\n      - run: shellcheck x.sh\n",
  };
  assert.deepEqual(lintGaps({ makefile, workflows }), [
    "golangci/golangci-lint-action (golangci-lint) in a.yml",
    "make lint (golangci-lint) in b.yml",
    "github/super-linter (super-linter) in b.yml",
  ]);
});

test("lintGaps accepts a lint target outside make ci when make ci runs each of its tools", () => {
  // The snowkit shape: verify runs golangci-lint itself, and CI's lint job runs make lint.
  const makefile =
    "lint:\n\t@if command -v golangci-lint >/dev/null 2>&1; then \\\n\t\t$(MAKE) --no-print-directory lint-version-check && \\\n\t\tgolangci-lint run; \\\n\tfi\nverify:\n\t$(MAKE) --no-print-directory lint-version-check\n\tgolangci-lint run\nci: verify\n";
  const workflows = { "ci.yml": `${ON_PR}      - run: make lint\n      - run: make ci\n` };
  assert.deepEqual(lintGaps({ makefile, workflows }), []);
  // A lint target that calls no known tool, or that the Makefile lacks, is a gap by its name.
  const opaque = "ci:\n\ttrue\nfmt-check:\n\t./tools/fmt\n";
  const two = { "ci.yml": `${ON_PR}      - run: make fmt-check\n      - run: make vet\n` };
  assert.deepEqual(lintGaps({ makefile: opaque, workflows: two }), ["make fmt-check in ci.yml", "make vet in ci.yml"]);
});

test("lintScriptPaths names the script files of make ci and of each lint target", () => {
  const makefile = "ci:\n\t./scripts/ci.sh\nlint:\n\tbash scripts/lint.sh\nother:\n\t./scripts/other.sh\n";
  const workflows = { "lint.yml": `${ON_PR}      - run: make lint\n`, "push.yml": "on: push\njobs:\n  a:\n    steps:\n      - run: make fmt\n" };
  assert.deepEqual(lintScriptPaths({ makefile, workflows }), ["scripts/ci.sh", "scripts/lint.sh"]);
  assert.deepEqual(lintScriptPaths({ makefile: null, workflows }), []);
});

test("lintGaps reports nothing without a Makefile or a ci target (row B4 reports that)", () => {
  const workflows = { "lint.yml": `${ON_PR}      - run: shellcheck x.sh\n` };
  assert.deepEqual(lintGaps({ makefile: null, workflows }), []);
  assert.deepEqual(lintGaps({ makefile: "verify:\n\ttrue\n", workflows }), []);
});

test("namesMakeCi matches make ci as a whole command name", () => {
  for (const text of ["Run `make ci`.", "make ci", "make ci before a push", "`make ci`/`make verify`", "make ci\r\n"]) {
    assert.equal(namesMakeCi(text), true, text);
  }
  for (const text of ["", null, "make ci-local", "make cid", "cmake ci", "make  verify", "remake ci"]) {
    assert.equal(namesMakeCi(text), false, String(text));
  }
});
