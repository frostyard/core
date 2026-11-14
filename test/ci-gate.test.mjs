import assert from "node:assert/strict";
import test from "node:test";

import {
  LINT_ACTIONS,
  LINT_TOOLS,
  commandCalls,
  expandVariables,
  lintGaps,
  lintScriptPaths,
  makeCalls,
  makeCiText,
  makeReach,
  makeRules,
  makeVariables,
  namesMakeCi,
  npmScripts,
  runsOnPullRequest,
  scriptPaths,
  toolsCalled,
  workflowActions,
  workflowEvents,
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

// Review findings of core#253, round 1: 1 guard each.

test("workflowEvents reads event names at 1 level only, also from indentless lists and flow mappings", () => {
  assert.deepEqual(workflowEvents("on:\n- push\n- pull_request\njobs: {}\n"), ["push", "pull_request"]);
  assert.equal(runsOnPullRequest("on:\n- push\n- pull_request\n"), true);
  assert.equal(runsOnPullRequest("on:\n  push:\n    branches: [pull_request]\n"), false);
  assert.equal(runsOnPullRequest("on:\n  workflow_dispatch:\n    inputs:\n      pull_request:\n        type: string\n"), false);
  assert.deepEqual(workflowEvents("on: {push: {branches: [main]}, pull_request: {}}\n").includes("pull_request"), true);
  assert.deepEqual(workflowEvents("on:\n  'pull_request':\n  push:\n"), ["pull_request", "push"]);
  assert.deepEqual(workflowEvents("on: [push]\n"), ["push"]);
  assert.deepEqual(workflowEvents("name: x\n"), []);
});

test("workflowActions skips the body of a block scalar, such as a heredoc in run: |", () => {
  const text = [
    "on: [pull_request]",
    "jobs:",
    "  a:",
    "    steps:",
    "      - run: |",
    "          cat <<'EOF'",
    "          uses: astral-sh/ruff-action@v3",
    "          EOF",
    "        env:",
    "          X: 1",
    "      - uses: golangci/golangci-lint-action@0123",
    "      - name: note",
    "        run: >-",
    "          uses: wearerequired/lint-action@v2",
  ].join("\n");
  assert.deepEqual(workflowActions(text), ["golangci/golangci-lint-action"]);
  assert.deepEqual(lintGaps({ makefile: "ci:\n\tgolangci-lint run\n", workflows: { "ci.yml": text } }), []);
});

test("makeCalls keeps quoted targets of a make call", () => {
  assert.deepEqual(makeCalls("make 'ci'"), ["ci"]);
  assert.deepEqual(makeCalls('$(MAKE) "lint" V=1'), ["lint"]);
  assert.deepEqual(makeCalls("echo 'make fmt' && make \"vet\""), ["vet"]);
  assert.deepEqual(workflowLintChecks('on: [pull_request]\njobs:\n  a:\n    steps:\n      - run: make "lint"\n'), [{ target: "lint" }]);
  assert.deepEqual(makeReach('ci:\n\t$(MAKE) "lint"\nlint:\n\tshfmt -d .\n', "ci").recipe, ['$(MAKE) "lint"', "shfmt -d ."]);
});

test("commandCalls splits a line into shell words and simple commands, and drops prefixes, paths and comments", () => {
  const W = "\u0000";
  assert.deepEqual(commandCalls('test -z "$(gofmt -l .)"'), [`test -z ${W}`, "gofmt -l ."]);
  assert.deepEqual(commandCalls("test -z `gofmt -l .`"), [`test -z ${W}`, "gofmt -l ."]);
  assert.deepEqual(commandCalls("sh -c 'shellcheck x.sh'"), ["sh -c shellcheck x.sh", "shellcheck x.sh"]);
  assert.deepEqual(commandCalls("echo start; ./bin/golangci-lint run && sudo -E env A=1 shfmt -d . # shellcheck"), [
    "echo start",
    "golangci-lint run",
    "shfmt -d .",
  ]);
  assert.deepEqual(commandCalls("find . -name '*.sh' -exec shellcheck {} +"), ["find . -name *.sh", "shellcheck {} +"]);
  assert.deepEqual(commandCalls("npx --yes eslint . | xargs -0 prettier -c"), ["eslint .", "prettier -c"]);
  assert.deepEqual(commandCalls("go run github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.1.0 run"), ["golangci-lint run"]);
  assert.deepEqual(commandCalls("$(GO) vet ./... && $$(go env GOPATH)/bin/staticcheck"), ["$GO vet ./...", "staticcheck", "go env GOPATH"]);
  // A quoted string is part of its word: an argument stays an argument.
  assert.deepEqual(commandCalls("printf '%s\\n' shellcheck"), ["printf %s\\n shellcheck"]);
  assert.deepEqual(commandCalls('msg="run shellcheck first"'), []);
  assert.deepEqual(commandCalls("a\\ b c"), ["a b c"]);
  assert.deepEqual(commandCalls(""), []);
});

test("toolsCalled counts a tool only in command position, not in a message, a comment or an installer's arguments", () => {
  const none = [
    'echo "Install shellcheck"',
    "echo Install shellcheck && true",
    "true # shellcheck later",
    "printf '%s\\n' shellcheck",
    "rustup toolchain install stable --profile minimal --component clippy,rustfmt",
    "go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.1.0",
    "sudo apt-get install -y shellcheck shfmt",
    'msg="run shellcheck first"',
  ];
  for (const line of none) assert.deepEqual(toolsCalled([line]), [], line);
  assert.deepEqual(toolsCalled(['test -z "$(gofmt -l .)"']), ["gofmt"]);
  assert.deepEqual(toolsCalled(["sh -c 'cd web && cargo fmt --check && cargo clippy -- -D warnings'"]), ["rustfmt", "clippy"]);
  assert.deepEqual(toolsCalled(["pnpm biome check ."]), ["biome"]);
  assert.deepEqual(toolsCalled(["pnpm run lint:md"]), ["npm lint or format script"]);
  assert.deepEqual(toolsCalled(["python3 -m black --check ."]), ["black"]);
});

test("lintGaps does not count a tool that make ci only names in a message, comment or script comment", () => {
  const workflows = { "lint.yml": `${ON_PR}      - run: shellcheck x.sh\n      - run: echo "Install golangci-lint"\n` };
  const message = "ci:\n\t@echo \"Install shellcheck\" # shellcheck\n\t./scripts/check.sh\n";
  const files = { "scripts/check.sh": "#!/bin/sh\n# shellcheck is optional\ntrue\n" };
  assert.deepEqual(lintGaps({ makefile: message, workflows, files }), ["shellcheck in lint.yml"]);
  const real = { "scripts/check.sh": "#!/bin/sh\nshellcheck x.sh\n" };
  assert.deepEqual(lintGaps({ makefile: message, workflows, files: real }), []);
});

test("lintGaps counts only the Makefile variables that make ci uses", () => {
  const makefile = "LINTER := golangci-lint\nci:\n\ttrue\nlint:\n\t$(LINTER) run\n";
  assert.deepEqual(makeVariables(makefile).get("LINTER"), "golangci-lint");
  assert.equal(expandVariables("$(LINTER) run ${LINTER}", makeVariables(makefile)), "golangci-lint run golangci-lint");
  const workflows = { "ci.yml": `${ON_PR}      - run: make lint\n      - uses: golangci/golangci-lint-action@0123\n` };
  assert.deepEqual(lintGaps({ makefile, workflows }), [
    "make lint (golangci-lint) in ci.yml",
    "golangci/golangci-lint-action (golangci-lint) in ci.yml",
  ]);
  const used = "LINTER ?= golangci-lint\nLINTER ?= other\nci:\n\t$(LINTER) run\nlint:\n\t$(LINTER) run\n";
  assert.deepEqual(lintGaps({ makefile: used, workflows }), []);
});

test("npmScripts follows the pre and post scripts that npm runs, unless --ignore-scripts", () => {
  const pkg = JSON.stringify({ scripts: { pretest: "eslint .", test: "node --test", posttest: "prettier -c .", prelint: "true" } });
  assert.deepEqual(
    npmScripts(["npm test"], pkg).map(({ name }) => name),
    ["pretest", "test", "posttest"],
  );
  assert.deepEqual(npmScripts(["npm test --ignore-scripts"], pkg).map(({ name }) => name), ["test"]);
  const workflows = { "lint.yml": `${ON_PR}      - run: npx eslint .\n` };
  assert.deepEqual(lintGaps({ makefile: "ci:\n\tnpm test\n", packageJson: pkg, workflows }), []);
});

// Review findings of core#253, round 2: 1 guard each.

test("a message that starts with a tool name, or holds a command separator, runs nothing", () => {
  assert.deepEqual(toolsCalled(['echo "shellcheck is optional"', "echo 'example; shellcheck x.sh'", "echo \"a && shellcheck\""]), []);
  const workflows = { "lint.yml": `${ON_PR}      - run: shellcheck x.sh\n` };
  assert.deepEqual(lintGaps({ makefile: 'ci:\n\t@echo "shellcheck is optional"\n', workflows }), ["shellcheck in lint.yml"]);
  assert.deepEqual(lintGaps({ makefile: "ci:\n\t@echo 'example; shellcheck x.sh'\n", workflows }), ["shellcheck in lint.yml"]);
  assert.deepEqual(lintGaps({ makefile: "ci:\n\tbash -c 'shellcheck x.sh'\n", workflows }), []);
  assert.deepEqual(lintGaps({ makefile: "IN ?= nsl run -m m sh -lc\nci:\n\t$(IN) 'cd x && shellcheck x.sh'\n", workflows }), []);
});

test("npmScripts follows only npm invocations, each with its own --ignore-scripts", () => {
  const pkg = JSON.stringify({ scripts: { test: "eslint .", pretest: "prettier -c .", a: "true", prea: "biome check ." } });
  assert.deepEqual(npmScripts(["echo npm test"], pkg), []);
  assert.deepEqual(npmScripts(["true # npm test"], pkg), []);
  assert.deepEqual(npmScripts(['echo "run npm test"'], pkg), []);
  assert.deepEqual(npmScripts(["npm run a --ignore-scripts && npm test"], pkg).map(({ name }) => name), ["a", "pretest", "test"]);
  const workflows = { "lint.yml": `${ON_PR}      - run: npx eslint .\n` };
  assert.deepEqual(lintGaps({ makefile: "ci:\n\techo npm test\n", packageJson: pkg, workflows }), ["eslint in lint.yml"]);
});

test("workflowEvents reads a flow collection over several lines, at its top level only", () => {
  assert.deepEqual(workflowEvents("on: [push,\n     pull_request]\njobs: {}\n"), ["push", "pull_request"]);
  assert.equal(runsOnPullRequest("on: [push, # comment\n  'pull_request']\n"), true);
  assert.deepEqual(
    workflowEvents("on: {workflow_dispatch: {inputs: {x: {type: string}, pull_request: {type: boolean}}}}\n"),
    ["workflow_dispatch"],
  );
  assert.equal(runsOnPullRequest("on: {push: {branches: [main, pull_request]}}\n"), false);
  assert.deepEqual(workflowEvents("on: {push: {}, \"pull_request\": {types: [opened]}}\n"), ["push", "pull_request"]);
});

test("commandCalls skips the values of wrapper options", () => {
  assert.deepEqual(commandCalls("xargs -P 4 -n 1 shellcheck"), ["shellcheck"]);
  assert.deepEqual(commandCalls("sudo -u root shellcheck x.sh"), ["shellcheck x.sh"]);
  assert.deepEqual(commandCalls("env -u UNUSED shellcheck x.sh"), ["shellcheck x.sh"]);
  assert.deepEqual(commandCalls("timeout 5m golangci-lint run"), ["golangci-lint run"]);
  assert.deepEqual(commandCalls("nice -n 5 shfmt -d ."), ["shfmt -d ."]);
  assert.deepEqual(commandCalls("timeout2 x"), ["timeout2 x"]);
});

test("makeReach expands variables before it follows prerequisites and recipe make calls", () => {
  const makefile = "LINT_TARGET := lint\nDEPS = vet\nci: $(DEPS)\n\t$(MAKE) $(LINT_TARGET)\nlint:\n\tshellcheck x.sh\nvet:\n\tgo vet ./...\n";
  assert.deepEqual([...makeReach(makefile, "ci").targets].sort(), ["ci", "lint", "vet"]);
  const workflows = { "lint.yml": `${ON_PR}      - run: shellcheck x.sh\n      - run: make lint\n` };
  assert.deepEqual(lintGaps({ makefile, workflows }), []);
});

// Review findings of core#253, round 3: 1 guard each.

test("only a shell's -c argument is code: grep -c 'shellcheck' runs grep", () => {
  assert.deepEqual(toolsCalled(["grep -c 'shellcheck' Makefile", "wc -c 'shellcheck.txt'"]), []);
  assert.deepEqual(toolsCalled(["/bin/bash -ec 'shellcheck x.sh'"]), ["shellcheck"]);
  assert.deepEqual(toolsCalled(["nsl run -m m sh -lc 'cd x && shellcheck y'"]), ["shellcheck"]);
  const workflows = { "lint.yml": `${ON_PR}      - run: shellcheck x.sh\n` };
  assert.deepEqual(lintGaps({ makefile: "ci:\n\tgrep -c 'shellcheck' Makefile\n", workflows }), ["shellcheck in lint.yml"]);
});

test("quoted command names, quoted assignments and substituted paths still run their tool", () => {
  assert.deepEqual(toolsCalled(['"golangci-lint" run']), ["golangci-lint"]);
  assert.deepEqual(toolsCalled(['CGO_ENABLED="0" golangci-lint run']), ["golangci-lint"]);
  assert.deepEqual(toolsCalled(["$(go env GOPATH)/bin/staticcheck ./..."]), ["staticcheck"]);
  assert.deepEqual(npmScripts(['npm run "check"'], JSON.stringify({ scripts: { check: "eslint ." } })), [{ name: "check", command: "eslint ." }]);
  const workflows = { "lint.yml": `${ON_PR}      - run: golangci-lint run\n      - run: staticcheck ./...\n` };
  const makefile = 'ci:\n\tCGO_ENABLED="0" "golangci-lint" run\n\t$$(go env GOPATH)/bin/staticcheck ./...\n';
  assert.deepEqual(lintGaps({ makefile, workflows }), []);
});

test("a shell name in another command's arguments does not make text code", () => {
  assert.deepEqual(toolsCalled(["echo sh -c 'shellcheck x.sh'", "printf '%s' bash -c 'shellcheck x'"]), []);
  assert.deepEqual(toolsCalled(["sudo -u root bash -e -c 'shellcheck x.sh'"]), ["shellcheck"]);
  const workflows = { "lint.yml": `${ON_PR}      - run: shellcheck x.sh\n` };
  assert.deepEqual(lintGaps({ makefile: "ci:\n\t@echo sh -c 'shellcheck x.sh'\n", workflows }), ["shellcheck in lint.yml"]);
  assert.deepEqual(lintGaps({ makefile: "ci:\n\t/bin/bash -ec 'shellcheck x.sh'\n", workflows }), []);
});

// Review finding of core#253, round 4: 1 guard.

test("a shell's option values do not hide its -c code", () => {
  for (const line of [
    "bash -o pipefail -c 'shellcheck x.sh'",
    "bash -eo pipefail -c 'shellcheck x.sh'",
    "bash +o posix -O extglob -c 'shellcheck x.sh'",
    "bash -c -o pipefail 'shellcheck x.sh'",
    "bash --norc --rcfile /dev/null -ec 'shellcheck x.sh'",
  ]) {
    assert.deepEqual(toolsCalled([line]), ["shellcheck"], line);
  }
  assert.deepEqual(toolsCalled(["bash -o pipefail 'shellcheck.sh'", "bash -- -c"]), []);
  const workflows = { "lint.yml": `${ON_PR}      - run: shellcheck x.sh\n` };
  assert.deepEqual(lintGaps({ makefile: "ci:\n\tbash -o pipefail -c 'shellcheck x.sh'\n", workflows }), []);
  assert.deepEqual(lintGaps({ makefile: "ci:\n\t@echo bash -o pipefail -c 'shellcheck x.sh'\n", workflows }), ["shellcheck in lint.yml"]);
});
