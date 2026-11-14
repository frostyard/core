// The CI gate readers (ADR-0073, ADR-0083). Hand-written line readers for
// GitHub Actions workflows, Makefiles and package.json scripts; no YAML
// parser, because CI's fleet-conventions job runs without `npm ci`. Each
// reader claims only what its comment says, and test/ci-gate.test.mjs and
// test/repository-baseline.test.mjs test its input shapes.

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
  // `make a b` runs both targets (makeCalls, ADR-0083).
  const runsMake = (target) => commands.some((command) => makeCalls(command).includes(target));
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

// ---------------------------------------------------------------------------
// ADR-0083: `make ci` is the 1 local entry point to the CI gate. The readers
// below find the lint and format checks that a pull-request workflow runs
// and that `make ci` does not.

// The lint and format tools that the check knows, as they appear in a shell
// command. A tool outside this list is not checked. `coveredBy` lists the
// other tools whose run in `make ci` also covers it.
export const LINT_TOOLS = [
  { tool: "golangci-lint", pattern: /(?<![\w-])golangci-lint(?![\w-])/ },
  { tool: "gofmt", pattern: /(?<![\w-])(?:gofmt|go\s+fmt)(?![\w-])/, coveredBy: ["gofumpt"] },
  { tool: "gofumpt", pattern: /(?<![\w-])gofumpt(?![\w-])/ },
  { tool: "goimports", pattern: /(?<![\w-])goimports(?![\w-])/ },
  { tool: "go vet", pattern: /(?<![\w-])go\s+vet(?![\w-])/, coveredBy: ["golangci-lint"] },
  { tool: "staticcheck", pattern: /(?<![\w-])staticcheck(?![\w-])/, coveredBy: ["golangci-lint"] },
  { tool: "shellcheck", pattern: /(?<![\w-])shellcheck(?![\w-])/ },
  { tool: "shfmt", pattern: /(?<![\w-])shfmt(?![\w-])/ },
  { tool: "eslint", pattern: /(?<![\w-])eslint(?![\w-])/ },
  { tool: "prettier", pattern: /(?<![\w-])prettier(?![\w-])/ },
  { tool: "biome", pattern: /(?<![\w-])biome(?![\w-])/ },
  { tool: "ruff", pattern: /(?<![\w-])ruff(?![\w-])/ },
  { tool: "black", pattern: /(?<![\w-])black(?![\w-])/ },
  { tool: "flake8", pattern: /(?<![\w-])flake8(?![\w-])/ },
  { tool: "ansible-lint", pattern: /(?<![\w-])ansible-lint(?![\w-])/ },
  { tool: "yamllint", pattern: /(?<![\w-])yamllint(?![\w-])/ },
  { tool: "markdownlint", pattern: /(?<![\w-])markdownlint(?:-cli2?)?(?![\w-])/ },
  { tool: "actionlint", pattern: /(?<![\w-])actionlint(?![\w-])/ },
  { tool: "hadolint", pattern: /(?<![\w-])hadolint(?![\w-])/ },
  { tool: "rustfmt", pattern: /(?<![\w-])(?:rustfmt|cargo\s+fmt)(?![\w-])/ },
  { tool: "clippy", pattern: /(?<![\w-])(?:cargo\s+clippy|clippy-driver)(?![\w-])/ },
  { tool: "clang-format", pattern: /(?<![\w-])clang-format(?![\w-])/ },
  {
    tool: "npm lint or format script",
    pattern: /(?<![\w-])(?:npm|pnpm|yarn|bun)\s+(?:run(?:-script)?\s+)?(?:lint|format|fmt)(?::[\w:-]+)?(?![\w-])/,
  },
];

// The GitHub Actions that run a lint or format tool, by `owner/name`
// (lower case), and the tool each runs.
export const LINT_ACTIONS = new Map([
  ["golangci/golangci-lint-action", "golangci-lint"],
  ["reviewdog/action-golangci-lint", "golangci-lint"],
  ["dominikh/staticcheck-action", "staticcheck"],
  ["ludeeus/action-shellcheck", "shellcheck"],
  ["reviewdog/action-shellcheck", "shellcheck"],
  ["astral-sh/ruff-action", "ruff"],
  ["chartboost/ruff-action", "ruff"],
  ["psf/black", "black"],
  ["davidanson/markdownlint-cli2-action", "markdownlint"],
  ["ibiqlik/action-yamllint", "yamllint"],
  ["reviewdog/action-actionlint", "actionlint"],
  ["raven-actions/actionlint", "actionlint"],
  ["hadolint/hadolint-action", "hadolint"],
  ["ansible/ansible-lint", "ansible-lint"],
  ["actions-rust-lang/rustfmt", "rustfmt"],
  ["creyd/prettier_action", "prettier"],
  ["github/super-linter", "super-linter"],
  ["super-linter/super-linter", "super-linter"],
  ["wearerequired/lint-action", "lint-action"],
]);

// A Makefile target whose name says it lints or formats.
const LINT_TARGET = /(?:^|[-_])(?:lint|fmt|format|vet)(?:[-_]|$)/;

const indentOf = (line) => line.length - line.trimStart().length;

// A YAML line without its comment: from an unquoted # at the start or after
// a blank. Quotes are tracked so that a # inside them stays.
function stripYamlComment(line) {
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
}

function splitLines(text) {
  return text.replace(/^\uFEFF/, "").split(/\r?\n/);
}

// True when the workflow's top-level `on:` key (also `"on":`, `'on':` or
// `true:`) names `pull_request` or `pull_request_target`, inline or in its
// indented block. A mention elsewhere (an `if:` expression) does not count.
export function runsOnPullRequest(workflowText) {
  const lines = splitLines(workflowText);
  for (let i = 0; i < lines.length; i++) {
    const head = /^(?:on|"on"|'on'|true)\s*:(.*)$/.exec(stripYamlComment(lines[i]));
    if (!head) continue;
    const parts = [head[1]];
    for (let j = i + 1; j < lines.length; j++) {
      const line = stripYamlComment(lines[j]);
      if (line.trim() === "") continue;
      if (indentOf(line) === 0) break;
      parts.push(line);
    }
    return /(?<![\w-])pull_request(?:_target)?(?![\w-])/.test(parts.join("\n"));
  }
  return false;
}

// The `owner/name` of each `uses:` value in the workflow (lower case, no
// `@ref`, no sub-path). Local (`./`) and `docker://` values are left out.
export function workflowActions(workflowText) {
  const actions = [];
  for (const raw of splitLines(workflowText)) {
    const line = stripYamlComment(raw);
    const match = /^\s*(?:-\s+)?uses:\s*["']?([^"'\s]+)/.exec(line);
    if (!match) continue;
    const value = match[1];
    if (value.startsWith("./") || value.startsWith("docker://")) continue;
    const [owner, name] = value.split("@")[0].split("/");
    if (owner && name) actions.push(`${owner}/${name}`.toLowerCase());
  }
  return actions;
}

// The Makefile's rules: target -> { prerequisites, recipe }. A rule line is
// `targets: prerequisites` (or `::`), with an optional `; command`; its
// recipe is the tab-indented lines after it (blank lines and comments do not
// end it). Lines that end in a backslash continue. Variable assignments,
// target-specific variables and pattern rules are not rules here.
export function makeRules(makefileText) {
  const joined = [];
  for (const line of splitLines(makefileText)) {
    const last = joined.length - 1;
    if (last >= 0 && /\\$/.test(joined[last])) joined[last] = `${joined[last].slice(0, -1).trimEnd()} ${line.trim()}`;
    else joined.push(line);
  }
  const rules = new Map();
  const ruleFor = (target) => {
    if (!rules.has(target)) rules.set(target, { prerequisites: [], recipe: [] });
    return rules.get(target);
  };
  let current = [];
  for (const line of joined) {
    if (line.startsWith("\t")) {
      const command = line.trim().replace(/^[@+-]+/, "").trim();
      if (command && !command.startsWith("#")) for (const target of current) ruleFor(target).recipe.push(command);
      continue;
    }
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const rule = /^([^\s:=#][^:=#]*?)\s*::?(?!=)(.*)$/.exec(line);
    if (!rule) {
      current = [];
      continue;
    }
    let [rest, inline] = [rule[2], null];
    const semicolon = rest.indexOf(";");
    if (semicolon >= 0) [rest, inline] = [rest.slice(0, semicolon), rest.slice(semicolon + 1)];
    rest = rest.replace(/#.*$/, "");
    const targets = rule[1].trim().split(/\s+/).filter((target) => !target.includes("%"));
    if (/=/.test(rest)) {
      current = []; // a target-specific variable, not a rule
      continue;
    }
    current = targets;
    for (const target of targets) {
      ruleFor(target).prerequisites.push(...rest.trim().split(/\s+/).filter(Boolean));
      const command = inline === null ? "" : inline.trim().replace(/^[@+-]+/, "").trim();
      if (command && !command.startsWith("#")) ruleFor(target).recipe.push(command);
    }
  }
  return rules;
}

// The targets that 1 shell command runs with `make`, `$(MAKE)` or
// `${MAKE}` in command position: at the start, after `;`, `&&`, `||`, `|`,
// `(`, `then`, `do` or `else` (a recipe's `@`, `-` or `+` prefix allowed),
// and after `VAR=value` words. Quoted text is
// not a command, so `echo "needs make"` calls nothing. A call with -C or -f
// reads another Makefile and is left out.
export function makeCalls(command) {
  const unquoted = command.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, (quoted) => " ".repeat(quoted.length));
  const targets = [];
  const pattern =
    /(?:^|[;&|(]|(?<![\w-])(?:then|do|else)(?![\w-]))\s*[@+-]*(?:[A-Za-z_]\w*=\S*\s+)*(?:make|\$\(MAKE\)|\$\{MAKE\})(?![\w-])([^;&|()#]*)/g;
  for (const match of unquoted.matchAll(pattern)) {
    const words = match[1].trim().split(/\s+/).filter(Boolean);
    if (words.some((word) => /^-(?:C|f)/.test(word) || /^--(?:directory|file|makefile)/.test(word))) continue;
    for (const word of words) if (!word.startsWith("-") && !word.includes("=")) targets.push(word);
  }
  return targets;
}

// What `make <target>` runs: the targets it reaches through prerequisites
// and recipe calls, and their recipe commands. `found` is false when the
// Makefile has no rule for the target.
export function makeReach(makefileText, target) {
  const rules = makeRules(makefileText);
  const targets = new Set();
  const recipe = [];
  const queue = [target];
  while (queue.length > 0) {
    const next = queue.shift();
    if (targets.has(next)) continue;
    targets.add(next);
    const rule = rules.get(next);
    if (!rule) continue;
    queue.push(...rule.prerequisites);
    for (const command of rule.recipe) {
      recipe.push(command);
      queue.push(...makeCalls(command));
    }
  }
  return { found: rules.has(target), targets, recipe };
}

// The npm scripts that the commands run (`npm run X`, `npm run-script X`,
// `npm test`), followed through the scripts' own npm calls. Each name comes
// back with its command.
export function npmScripts(commands, packageJsonText) {
  let scripts = {};
  try {
    scripts = JSON.parse(packageJsonText ?? "{}").scripts ?? {};
  } catch {
    return [];
  }
  const calls = (text) => {
    const names = [];
    for (const match of text.matchAll(/(?<![\w-])npm\s+(?:run|run-script)\s+([\w:.@/-]+)/g)) names.push(match[1]);
    for (const _ of text.matchAll(/(?<![\w-])npm\s+(?:test|t|tst)(?![\w-])/g)) names.push("test");
    return names;
  };
  const reached = new Map();
  const queue = commands.flatMap(calls);
  while (queue.length > 0) {
    const name = queue.shift();
    if (reached.has(name) || typeof scripts[name] !== "string") continue;
    reached.set(name, scripts[name]);
    queue.push(...calls(scripts[name]));
  }
  return [...reached].map(([name, command]) => ({ name, command }));
}

// The repository-relative script files (.sh, .bash, .mjs, .cjs, .js, .py)
// that the commands name with a directory part (`scripts/x.sh`, `./x.sh`),
// at most 20, without absolute paths, `..`, globs or variables. A bare word
// such as `Node.js` is not a path.
export function scriptPaths(commands) {
  const paths = new Set();
  const pattern = /(?<![\w$/.*-])(\.\/)?((?:[\w.-]+\/)*[\w-][\w.-]*\.(?:sh|bash|mjs|cjs|js|py))(?![\w./*-])/g;
  for (const command of commands) {
    for (const match of command.matchAll(pattern)) {
      if (!match[1] && !match[2].includes("/")) continue;
      if (match[2].split("/").includes("..")) continue;
      paths.add(match[2]);
      if (paths.size >= 20) return [...paths];
    }
  }
  return [...paths];
}

// The text that `make <target>` runs: its reached recipe commands, the
// Makefile's variable assignments (a recipe can call a tool through a
// variable), the npm scripts it reaches, and the given script files.
// `targets` is the set of reached targets; `paths` are the script files the
// text names.
export function makeTargetText(makefileText, target, packageJsonText, files = {}) {
  const reach = makeReach(makefileText, target);
  const assignments = splitLines(makefileText).filter((line) => /^\s*(?:export\s+)?[A-Za-z_][\w.]*\s*(?::{1,3}|\?|\+|!)?=/.test(line));
  const scripts = npmScripts(reach.recipe, packageJsonText);
  const commands = [...reach.recipe, ...scripts.map((script) => script.command)];
  const paths = scriptPaths(commands);
  const parts = [...commands, ...assignments, ...scripts.map((script) => `npm run ${script.name}`)];
  for (const filePath of paths) if (typeof files[filePath] === "string") parts.push(files[filePath]);
  return { found: reach.found, targets: reach.targets, text: parts.join("\n"), paths };
}

export function makeCiText(makefileText, packageJsonText, files = {}) {
  return makeTargetText(makefileText, "ci", packageJsonText, files);
}

// The lint and format checks of 1 workflow: each tool that a `run:` command
// calls (LINT_TOOLS), each lint action that a `uses:` names (LINT_ACTIONS),
// and each `make <target>` command whose target name says lint, fmt, format
// or vet.
export function workflowLintChecks(workflowText) {
  const checks = [];
  const commands = workflowCommands(workflowText);
  for (const command of commands) {
    for (const { tool } of LINT_TOOLS.filter(({ pattern }) => pattern.test(command))) checks.push({ tool });
    for (const target of makeCalls(command)) if (LINT_TARGET.test(target)) checks.push({ target });
  }
  for (const action of workflowActions(workflowText)) {
    if (LINT_ACTIONS.has(action)) checks.push({ tool: LINT_ACTIONS.get(action), action });
  }
  return checks;
}

// The `make <target>` lint checks of the pull-request workflows.
function lintTargets(workflows) {
  const targets = [];
  for (const name of Object.keys(workflows).sort()) {
    if (!runsOnPullRequest(workflows[name])) continue;
    for (const check of workflowLintChecks(workflows[name])) if (check.target !== undefined) targets.push({ name, target: check.target });
  }
  return targets;
}

// The script files that lintGaps reads: those that `make ci` names, and
// those that each lint target of a pull-request workflow names.
export function lintScriptPaths({ makefile, packageJson = null, workflows = {} }) {
  if (typeof makefile !== "string") return [];
  const paths = new Set(makeCiText(makefile, packageJson).paths);
  for (const { target } of lintTargets(workflows)) {
    for (const filePath of makeTargetText(makefile, target, packageJson).paths) paths.add(filePath);
  }
  return [...paths];
}

// B19 (ADR-0083): the lint and format checks that a pull-request workflow
// runs and `make ci` does not. `workflows` maps a file name to its text;
// `files` holds the script files that lintScriptPaths names. A tool counts
// as run when the text of `make ci` calls it (or a tool in its `coveredBy`).
// A `make <target>` lint check counts as run when `make ci` reaches the
// target, or when the target calls known tools and `make ci` runs each of
// them. Without a `ci` target there is nothing to compare (row B4 reports
// it).
export function lintGaps({ makefile, packageJson = null, workflows = {}, files = {} }) {
  if (typeof makefile !== "string") return [];
  const ci = makeCiText(makefile, packageJson, files);
  if (!ci.found) return [];
  const runs = (tool) => {
    const entry = LINT_TOOLS.find((candidate) => candidate.tool === tool);
    if (!entry) return false; // a tool with no pattern (super-linter) cannot run in make ci here
    const names = [tool, ...(entry.coveredBy ?? [])];
    return names.some((name) => LINT_TOOLS.find((candidate) => candidate.tool === name).pattern.test(ci.text));
  };
  const gaps = new Set();
  for (const name of Object.keys(workflows).sort()) {
    if (!runsOnPullRequest(workflows[name])) continue;
    for (const check of workflowLintChecks(workflows[name])) {
      if (check.target !== undefined) {
        if (ci.targets.has(check.target)) continue;
        const other = makeTargetText(makefile, check.target, packageJson, files);
        const tools = LINT_TOOLS.filter(({ pattern }) => pattern.test(other.text)).map(({ tool }) => tool);
        if (!other.found || tools.length === 0) gaps.add(`make ${check.target} in ${name}`);
        else for (const tool of tools.filter((candidate) => !runs(candidate))) gaps.add(`make ${check.target} (${tool}) in ${name}`);
      } else if (!runs(check.tool)) {
        gaps.add(`${check.action ? `${check.action} (${check.tool})` : check.tool} in ${name}`);
      }
    }
  }
  return [...gaps];
}

// B19 (ADR-0083): AGENTS.md names `make ci` (not `make ci-x` or `make cix`).
export function namesMakeCi(agentsText) {
  return /(?<![\w-])make ci(?![\w-])/.test(agentsText ?? "");
}
