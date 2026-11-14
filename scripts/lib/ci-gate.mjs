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

// The lint and format tools that the check knows. Each pattern matches the
// start of 1 simple command, as commandCalls gives it: the command's name
// without its directory, then its arguments. A tool outside this list is
// not checked. `coveredBy` lists the other tools whose run in `make ci`
// also covers it.
const tool = (name) => new RegExp(`^${name}(?![\\w-])`);
export const LINT_TOOLS = [
  { tool: "golangci-lint", pattern: tool("golangci-lint") },
  { tool: "gofmt", pattern: /^(?:gofmt|go\s+fmt)(?![\w-])/, coveredBy: ["gofumpt"] },
  { tool: "gofumpt", pattern: tool("gofumpt") },
  { tool: "goimports", pattern: tool("goimports") },
  { tool: "go vet", pattern: /^go\s+vet(?![\w-])/, coveredBy: ["golangci-lint"] },
  { tool: "staticcheck", pattern: tool("staticcheck"), coveredBy: ["golangci-lint"] },
  { tool: "shellcheck", pattern: tool("shellcheck") },
  { tool: "shfmt", pattern: tool("shfmt") },
  { tool: "eslint", pattern: tool("eslint") },
  { tool: "prettier", pattern: tool("prettier") },
  { tool: "biome", pattern: tool("biome") },
  { tool: "ruff", pattern: tool("ruff") },
  { tool: "black", pattern: tool("black") },
  { tool: "flake8", pattern: tool("flake8") },
  { tool: "ansible-lint", pattern: tool("ansible-lint") },
  { tool: "yamllint", pattern: tool("yamllint") },
  { tool: "markdownlint", pattern: /^markdownlint(?:-cli2?)?(?![\w-])/ },
  { tool: "actionlint", pattern: tool("actionlint") },
  { tool: "hadolint", pattern: tool("hadolint") },
  { tool: "rustfmt", pattern: /^(?:rustfmt|cargo\s+(?:\+\S+\s+)?fmt)(?![\w-])/ },
  { tool: "clippy", pattern: /^(?:cargo\s+(?:\+\S+\s+)?clippy|clippy-driver)(?![\w-])/ },
  { tool: "clang-format", pattern: tool("clang-format") },
  {
    tool: "npm lint or format script",
    pattern: /^(?:npm|pnpm|yarn|bun)\s+(?:run(?:-script)?\s+)?(?:lint|format|fmt)(?::[\w:-]+)?(?![\w-])/,
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

// The event names of the workflow's top-level `on:` key (also `"on":`,
// `'on':` or `true:`): a scalar (`on: pull_request`), a flow list
// (`[push, pull_request]`, also over several lines), the top-level keys of
// a flow mapping, or a block of mapping keys or
// list items (indented or indentless) at 1 indent. Nested values (branch
// names, inputs) are not events.
export function workflowEvents(workflowText) {
  const lines = splitLines(workflowText);
  const unquote = (word) => word.trim().replace(/^(["'])(.*)\1$/, "$2");
  for (let i = 0; i < lines.length; i++) {
    const head = /^(?:on|"on"|'on'|true)\s*:(.*)$/.exec(stripYamlComment(lines[i]));
    if (!head) continue;
    const inline = head[1].trim();
    if (inline !== "" && !/^[[{]/.test(inline)) return [unquote(inline)].filter(Boolean);
    if (inline !== "") {
      // A flow list or mapping, maybe over several lines: the items at its
      // top level, and for a mapping the key of each item.
      const flow = flowValue([inline, ...lines.slice(i + 1).map(stripYamlComment)].join("\n"));
      const items = splitTopLevel(flow.slice(1, -1));
      return items.map((item) => unquote(inline.startsWith("{") ? splitTopLevel(item, ":")[0] : item)).filter(Boolean);
    }
    const events = [];
    let childIndent = -1;
    let indentless = false;
    for (let j = i + 1; j < lines.length; j++) {
      const line = stripYamlComment(lines[j]);
      if (line.trim() === "") continue;
      const indent = indentOf(line);
      if (childIndent < 0) {
        childIndent = indent;
        indentless = indent === 0 && /^-\s/.test(line);
        if (indent === 0 && !indentless) break;
      }
      if (indent === 0 && !(indentless && /^-\s/.test(line))) break;
      if (indent !== childIndent) continue;
      const item = /^\s*-\s+(.*)$/.exec(line);
      const key = /^\s*(["']?[\w-]+["']?)\s*:/.exec(line);
      if (item) events.push(unquote(item[1].split(":")[0]));
      else if (key) events.push(unquote(key[1]));
    }
    return events.filter(Boolean);
  }
  return [];
}

// The text of the flow collection that starts the text, up to its matching
// close bracket (quotes respected), or the whole text when it does not close.
function flowValue(text) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"') quote = c;
    else if (c === "[" || c === "{") depth += 1;
    else if (c === "]" || c === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(0, i + 1);
    }
  }
  return text;
}

// The parts of a flow collection's body split at the separator at depth 0
// (outside nested brackets and quotes), trimmed.
function splitTopLevel(text, separator = ",") {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = "";
  for (const c of text) {
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"') quote = c;
    else if (c === "[" || c === "{") depth += 1;
    else if (c === "]" || c === "}") depth -= 1;
    else if (c === separator && depth === 0) {
      parts.push(current.trim());
      current = "";
      if (separator === ":") return [...parts, text.slice(text.indexOf(":") + 1).trim()];
      continue;
    }
    current += c;
  }
  parts.push(current.trim());
  return parts;
}

// True when the workflow's events (workflowEvents) include `pull_request`
// or `pull_request_target`.
export function runsOnPullRequest(workflowText) {
  return workflowEvents(workflowText).some((event) => event === "pull_request" || event === "pull_request_target");
}

// The `owner/name` of each `uses:` key in the workflow (lower case, no
// `@ref`, no sub-path). Local (`./`) and `docker://` values are left out.
// The body of a block scalar (`run: |`, `script: >`) is text, not YAML, so
// a `uses:` line inside it does not count.
export function workflowActions(workflowText) {
  const actions = [];
  let blockColumn = -1; // the key column of the block scalar being skipped
  for (const raw of splitLines(workflowText)) {
    if (blockColumn >= 0) {
      if (raw.trim() === "" || indentOf(raw) > blockColumn) continue;
      blockColumn = -1;
    }
    const line = stripYamlComment(raw);
    const block = /^(\s*(?:-\s+)?)["']?[\w.-]+["']?\s*:\s*[|>][-+0-9]*\s*$/.exec(line);
    if (block) {
      blockColumn = block[1].length;
      continue;
    }
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

// Quoted text blanked to spaces of the same length, so that offsets stay.
function blankQuotes(command) {
  return command.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, (quoted) => " ".repeat(quoted.length));
}

// Shell words of a simple argument list, with their quotes removed.
function shellWords(text) {
  const words = [];
  for (const match of text.matchAll(/(?:[^\s'"]+|'[^']*'|"(?:[^"\\]|\\.)*")+/g)) {
    words.push(match[0].replace(/'([^']*)'|"((?:[^"\\]|\\.)*)"/g, (_, single, double) => single ?? double.replace(/\\(.)/g, "$1")));
  }
  return words;
}

// The targets that 1 shell command runs with `make`, `$(MAKE)` or
// `${MAKE}` in command position: at the start, after `;`, `&&`, `||`, `|`,
// `(`, `then`, `do` or `else` (a recipe's `@`, `-` or `+` prefix allowed),
// and after `VAR=value` words. Quoted text is not a command, so
// `echo "needs make"` calls nothing; a quoted argument of a call is a word
// (`make 'ci'` runs `ci`). A call with -C or -f reads another Makefile and
// is left out.
export function makeCalls(command) {
  const blanked = blankQuotes(command);
  const targets = [];
  const pattern =
    /(?:^|[;&|(]|(?<![\w-])(?:then|do|else)(?![\w-]))\s*[@+-]*(?:[A-Za-z_]\w*=\S*\s+)*(?:make|\$\(MAKE\)|\$\{MAKE\})(?![\w-])([^;&|()#]*)/dg;
  for (const match of blanked.matchAll(pattern)) {
    const [start, end] = match.indices[1];
    const words = shellWords(command.slice(start, end));
    if (words.some((word) => /^-(?:C|f)/.test(word) || /^--(?:directory|file|makefile)/.test(word))) continue;
    for (const word of words) if (word && !word.startsWith("-") && !word.includes("=")) targets.push(word);
  }
  return targets;
}

// Words before a command's name that run the command after them, and the
// options of each that take the next word as their value.
const KEYWORDS = new Set(["if", "then", "do", "else", "elif", "while", "until", "!", "exec", "command", "nohup"]);
const WRAPPERS = new Map([
  ["time", "fo"],
  ["nice", "n"],
  ["timeout", "ks"],
  ["sudo", "ugChpUrtDR"],
  ["env", "uCS"],
  ["xargs", "nPLIdsEa"],
  ["npx", "p"],
  ["bunx", "p"],
  ["uvx", "p"],
]);
const LAUNCHERS = [
  ["pipx", "run"],
  ["npm", "exec"],
  ["pnpm", "exec"],
  ["pnpm", "dlx"],
  ["yarn", "dlx"],
  ["go", "run"],
  ["go", "tool"],
  ["python", "-m"],
  ["python3", "-m"],
];
const SHELLS = new Set(["sh", "bash", "dash", "zsh", "ksh", "ash"]);
const basename = (word) => word.replace(/^.*\//, "");

// The words of 1 simple command without the words before its name
// (KEYWORDS, `VAR=value`, WRAPPERS and LAUNCHERS with their options).
function stripPrefixes(words) {
  let rest = [...words];
  if (rest.length > 0) rest[0] = { ...rest[0], value: rest[0].value.replace(/^[@+-]+/, "") };
  const dropOptions = (valued) => {
    while (rest.length > 0 && /^-/.test(rest[0].value)) {
      const option = rest.shift().value;
      if (option === "--") break;
      if (new RegExp(`^-[${valued}]$`).test(option)) rest.shift();
    }
  };
  for (let changed = true; changed && rest.length > 0; ) {
    changed = false;
    const first = rest[0].value;
    const launcher = LAUNCHERS.find(([a, b]) => first === a && rest[1]?.value === b);
    if (first === "" || KEYWORDS.has(first) || /^[A-Za-z_]\w*=/.test(first)) {
      rest.shift();
      changed = true;
    } else if (WRAPPERS.has(first)) {
      rest.shift();
      dropOptions(WRAPPERS.get(first));
      if (first === "timeout") rest.shift(); // the duration
      changed = true;
    } else if (launcher) {
      rest = rest.slice(2);
      dropOptions("");
      changed = true;
    }
  }
  return rest;
}

// The index of the `)` that closes the `$(` before `start`, with nested
// parentheses and quotes respected, or the text's length.
function closeParen(text, start) {
  let depth = 1;
  let quote = null;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (quote === '"' && c === "\\") i += 1;
    } else if (c === "'" || c === '"') quote = c;
    else if (c === "\\") i += 1;
    else if (c === "(") depth += 1;
    else if (c === ")" && --depth === 0) return i;
  }
  return text.length;
}

// The command lines that a double-quoted string's body runs: each `$(...)`
// and backquoted part.
function substitutions(body) {
  const found = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "\\") i += 1;
    else if (body[i] === "$" && body[i + 1] === "(") {
      const end = closeParen(body, i + 2);
      found.push(body.slice(i + 2, end));
      i = end;
    } else if (body[i] === "`") {
      const end = body.indexOf("`", i + 1);
      found.push(body.slice(i + 1, end < 0 ? body.length : end));
      i = end < 0 ? body.length : end;
    }
  }
  return found;
}

// A substitution stands in its word as this placeholder.
const WORD = "\u0000";

// The simple commands of a shell command line, each as its name (without
// its directory or an `@version`) and its arguments. The line is split into
// shell words: quotes join into their word (`"golangci-lint"`,
// `CGO_ENABLED="0"`), and a `$(...)` or backquoted part (also inside double
// quotes) is a command line of its own, with a placeholder in its word
// (`$(go env GOPATH)/bin/staticcheck` runs `staticcheck`). Commands are
// split at `;`, `&`, `|`, `(`, `)`, a line break and `-exec`, outside
// quotes. The word after `-c` or a flag group that ends in c, after a shell
// (`sh -c '...'`, `nsl run -m m sh -lc '...'`), is a command line too; the
// argument of another command's `-c` (`grep -c 'x'`) is not. A `#` at the
// start of a word ends the line. Make references that are left (`$(GO)`)
// become `$GO`, and `$$` becomes `$`. Not read: `eval`, shell functions,
// aliases, here-docs.
export function commandCalls(line) {
  const text = line
    .replace(/\$\(([A-Za-z_][\w.]*)\)|\$\{([A-Za-z_][\w.]*)\}/g, (_, a, b) => `$${a ?? b}`)
    .replace(/\$\$/g, "$");
  return callsIn(text, 0);
}

function callsIn(text, depth) {
  if (depth > 4) return [];
  const nested = [];
  const segments = [[]];
  let word = null; // { value, raw }
  const endWord = () => {
    if (word !== null) segments.at(-1).push(word);
    word = null;
  };
  const add = (value, raw = value) => {
    word ??= { value: "", raw: "" };
    word.value += value;
    word.raw += raw;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "#" && word === null) break;
    if (c === "\\") {
      add(text[i + 1] ?? "", text.slice(i, i + 2));
      i += 1;
    } else if (c === "'") {
      let end = text.indexOf("'", i + 1);
      if (end < 0) end = text.length;
      add(text.slice(i + 1, end));
      i = end;
    } else if (c === '"') {
      let end = i + 1;
      while (end < text.length && text[end] !== '"') end += text[end] === "\\" ? 2 : 1;
      const body = text.slice(i + 1, end);
      const found = substitutions(body);
      nested.push(...found);
      let value = body;
      for (const part of found) value = value.replace(part, WORD);
      add(value.replace(/\$\(\u0000\)|`\u0000`/g, WORD), body);
      i = end;
    } else if (c === "$" && text[i + 1] === "(") {
      const end = closeParen(text, i + 2);
      nested.push(text.slice(i + 2, end));
      add(WORD, text.slice(i, end + 1));
      i = end;
    } else if (c === "`") {
      let end = text.indexOf("`", i + 1);
      if (end < 0) end = text.length;
      nested.push(text.slice(i + 1, end));
      add(WORD, text.slice(i, end + 1));
      i = end;
    } else if (/[;&|()\n]/.test(c)) {
      endWord();
      segments.push([]);
    } else if (/\s/.test(c)) {
      endWord();
    } else {
      add(c);
    }
  }
  endWord();
  const commands = [];
  for (const segment of segments) {
    let current = [];
    for (const w of segment) {
      if (w.value === "-exec") {
        commands.push(current);
        current = [];
      } else current.push(w);
    }
    commands.push(current);
  }
  const calls = [];
  for (const words of commands) {
    const rest = stripPrefixes(words);
    if (rest.length === 0 || rest[0].value === "") continue;
    // A shell, then -c (or -lc, -ec ...), then the code it runs.
    const shell = rest.findIndex((w) => SHELLS.has(basename(w.value)));
    if (shell >= 0) {
      const flag = rest.findIndex((w, k) => k > shell && /^-[A-Za-z]*c$/.test(w.value));
      if (flag >= 0 && rest[flag + 1]) nested.push(rest[flag + 1].raw.replace(/^(['"])([\s\S]*)\1$/, "$2"));
    }
    const name = basename(rest[0].value).replace(/@.*$/, "");
    calls.push([name, ...rest.slice(1).map((w) => w.value)].join(" "));
  }
  for (const body of nested) calls.push(...callsIn(body, depth + 1));
  return calls;
}

// True when 1 of the simple commands (commandCalls) of the lines runs the
// tool. `pnpm x`, `yarn x` and `bun x` also run the binary `x`.
function callsTool(lines, entry) {
  return lines.some((line) =>
    commandCalls(line).some((call) => entry.pattern.test(call) || entry.pattern.test(call.replace(/^(?:pnpm|yarn|bun)\s+/, ""))),
  );
}

// The tools of LINT_TOOLS that the lines run.
export function toolsCalled(lines) {
  return LINT_TOOLS.filter((entry) => callsTool(lines, entry)).map((entry) => entry.tool);
}

// What `make <target>` runs: the targets it reaches through prerequisites
// and recipe calls, and their recipe commands, with the Makefile's
// variables expanded first (expandVariables), so `$(MAKE) $(LINT)` reaches
// the target that LINT names. `found` is false when the
// Makefile has no rule for the target.
export function makeReach(makefileText, target) {
  const rules = makeRules(makefileText);
  const variables = makeVariables(makefileText);
  const targets = new Set();
  const recipe = [];
  const queue = [target];
  while (queue.length > 0) {
    const next = queue.shift();
    if (targets.has(next)) continue;
    targets.add(next);
    const rule = rules.get(next);
    if (!rule) continue;
    queue.push(...expandVariables(rule.prerequisites.join(" "), variables).split(/\s+/).filter(Boolean));
    for (const command of rule.recipe.map((line) => expandVariables(line, variables))) {
      recipe.push(command);
      queue.push(...makeCalls(command));
    }
  }
  return { found: rules.has(target), targets, recipe };
}

// The npm scripts that the commands run (`npm run X`, `npm run-script X`,
// `npm test`) with their `pre` and `post` scripts, followed through the
// scripts' own npm calls. Each name comes back with its command.
export function npmScripts(commands, packageJsonText) {
  let scripts = {};
  try {
    scripts = JSON.parse(packageJsonText ?? "{}").scripts ?? {};
  } catch {
    return [];
  }
  // Each npm invocation of a command (commandCalls: not in a message or a
  // comment), with npm's pre<name> and post<name> scripts unless that
  // invocation has --ignore-scripts.
  const calls = (text) =>
    commandCalls(text).flatMap((call) => {
      const match = /^npm\s+(?:(?:run|run-script)\s+([\w:.@/-]+)|(?:test|t|tst)(?![\w-]))(.*)$/.exec(call);
      if (!match) return [];
      const name = match[1] ?? "test";
      return /(?<![\w-])--ignore-scripts(?![\w-])/.test(match[2]) ? [name] : [`pre${name}`, name, `post${name}`];
    });
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

// The Makefile's variables: name -> value. `?=` sets a variable only when
// it has no value yet; `+=` appends; `=`, `:=`, `::=`, `:::=` and `!=` set.
export function makeVariables(makefileText) {
  const variables = new Map();
  for (const line of splitLines(makefileText)) {
    const match = /^\s*(?:export\s+|override\s+)*([A-Za-z_][\w.]*)\s*(:{1,3}|\?|\+|!)?=\s*(.*)$/.exec(line);
    if (!match || line.startsWith("\t")) continue;
    const [, name, op, value] = match;
    if (op === "?" && variables.has(name)) continue;
    variables.set(name, op === "+" && variables.has(name) ? `${variables.get(name)} ${value}` : value.replace(/\s+#.*$/, ""));
  }
  return variables;
}

// A command with each `$(NAME)` and `${NAME}` that the Makefile defines
// replaced by its value, 5 levels deep. Other references stay.
export function expandVariables(command, variables) {
  let text = command;
  for (let depth = 0; depth < 5; depth++) {
    const next = text.replace(/\$\(([A-Za-z_][\w.]*)\)|\$\{([A-Za-z_][\w.]*)\}/g, (whole, a, b) => variables.get(a ?? b) ?? whole);
    if (next === text) break;
    text = next;
  }
  return text;
}

// What `make <target>` runs: its reached recipe commands with the
// Makefile's variables expanded, the commands of the npm scripts it
// reaches, and the lines of the given script files (without comment
// lines). `targets` is the set of reached targets; `paths` are the script
// files the commands name.
export function makeTargetText(makefileText, target, packageJsonText, files = {}) {
  const reach = makeReach(makefileText, target);
  const variables = makeVariables(makefileText);
  const recipe = reach.recipe.map((command) => expandVariables(command, variables));
  const scripts = npmScripts(recipe, packageJsonText);
  const commands = [...recipe, ...scripts.map((script) => script.command)];
  const paths = scriptPaths(commands);
  const lines = [...commands];
  for (const filePath of paths) {
    if (typeof files[filePath] !== "string") continue;
    lines.push(...splitLines(files[filePath]).filter((line) => !/^\s*(?:#|\/\/)/.test(line)));
  }
  return { found: reach.found, targets: reach.targets, lines, paths };
}

export function makeCiText(makefileText, packageJsonText, files = {}) {
  return makeTargetText(makefileText, "ci", packageJsonText, files);
}

// The lint and format checks of 1 workflow: each tool that a `run:` command
// runs (LINT_TOOLS, by commandCalls), each lint action that a `uses:` names (LINT_ACTIONS),
// and each `make <target>` command whose target name says lint, fmt, format
// or vet.
export function workflowLintChecks(workflowText) {
  const checks = [];
  const commands = workflowCommands(workflowText);
  for (const command of commands) {
    for (const tool of toolsCalled([command])) checks.push({ tool });
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
// as run when a simple command of `make ci` (commandCalls) runs it, or a
// tool in its `coveredBy`.
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
    return names.some((name) => callsTool(ci.lines, LINT_TOOLS.find((candidate) => candidate.tool === name)));
  };
  const gaps = new Set();
  for (const name of Object.keys(workflows).sort()) {
    if (!runsOnPullRequest(workflows[name])) continue;
    for (const check of workflowLintChecks(workflows[name])) {
      if (check.target !== undefined) {
        if (ci.targets.has(check.target)) continue;
        const other = makeTargetText(makefile, check.target, packageJson, files);
        const tools = toolsCalled(other.lines);
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
