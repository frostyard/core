import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  KINDS,
  checkReadme,
  readKind,
} from "../.agents/skills/frostyard-readme/scripts/check-readme.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(
  repoRoot,
  ".agents/skills/frostyard-readme/scripts/check-readme.mjs",
);
const templatesDir = path.join(
  repoRoot,
  ".agents/skills/frostyard-readme/templates",
);

const REPO_FILES = ["AGENTS.md", "docs/README.md", "SECURITY.md", "LICENSE"];
const allFiles = (target) => REPO_FILES.includes(target);
const noFiles = () => false;

const F = "```";

// A `tool` README that follows docs/specs/readme.md, used as the base of every
// rule test. Each test changes 1 part of it.
const valid = [
  "<!-- readme-kind: tool -->",
  '<img src="assets/icon.svg" alt="nsl icon" width="112" align="right">',
  "",
  "# nsl",
  "",
  "[![CI](https://github.com/frostyard/nsl/actions/workflows/ci.yml/badge.svg)](https://github.com/frostyard/nsl/actions/workflows/ci.yml)",
  "",
  "**Leave the host alone. Work in another distro.**",
  "",
  "nsl gives you persistent Linux machines on a Linux host, as WSL does on",
  "Windows. Each machine is a whole distro with its own packages and services.",
  "",
  "**Status:** pre-release. The tested host is Snow Linux 13.",
  "**Documentation:** [frostyard.github.io/nsl](https://frostyard.github.io/nsl/)",
  "",
  "## What it does",
  "",
  "nsl starts a machine and attaches your terminal to it, and keeps it.",
  "See the [user guide](https://frostyard.github.io/nsl/use/) for more.",
  "",
  "## Install",
  "",
  `${F}sh`,
  "curl -fsSL https://frostyard.github.io/nsl/install.sh | sh",
  F,
  "",
  "## Use",
  "",
  `${F}sh`,
  "nsl create work",
  "nsl enter work",
  F,
  "",
  "## Develop",
  "",
  `${F}sh`,
  "# install the tools, then run the gate",
  "mise install",
  "make ci",
  F,
  "",
  "## Where to go next",
  "",
  "- [AGENTS.md](AGENTS.md) holds the agent rules.",
  "- [docs/README.md](docs/README.md) indexes the documentation.",
  "- [SECURITY.md](SECURITY.md) says how to report a problem.",
  "- [LICENSE](LICENSE) is the license.",
].join("\n");

const check = (text, has = allFiles) => checkReadme(text, has);
const rules = (text, has = allFiles) => check(text, has).map((f) => f.rule);

function broke(base, from, to) {
  const changed = base.replace(from, to);
  assert.notEqual(changed, base, `the fixture does not hold ${JSON.stringify(from)}`);
  return changed;
}

test("the tool fixture passes every rule", () => {
  assert.deepEqual(check(valid, allFiles), []);
  assert.equal(readKind(valid), "tool");
});

test("R1: the kind marker is required, unique and known", () => {
  const missing = broke(valid, "<!-- readme-kind: tool -->\n", "");
  assert.ok(rules(missing).includes("R1"));

  const unknown = broke(valid, "readme-kind: tool", "readme-kind: tui");
  assert.ok(rules(unknown).includes("R1"));

  const twice = `<!-- readme-kind: tool -->\n${valid}`;
  assert.ok(rules(twice).includes("R1"));
});

test("R2: the first heading is the only level-1 heading", () => {
  const secondTitle = broke(valid, "## Use", "# Usage\n\n## Use");
  assert.ok(rules(secondTitle).includes("R2"));

  const noTitle = broke(valid, "# nsl\n", "");
  assert.ok(rules(noTitle).includes("R2"));

  const indentedTitle = broke(valid, "## Use", " # Second title\n\n## Use");
  assert.ok(
    rules(indentedTitle).includes("R2"),
    "a level-1 heading with 1 leading space is still a title",
  );
});

test("R3: the top block has a lead paragraph and at most 130 words", () => {
  const noLead = broke(
    valid,
    "nsl gives you persistent Linux machines on a Linux host, as WSL does on\nWindows. Each machine is a whole distro with its own packages and services.\n",
    "",
  );
  assert.ok(rules(noLead).includes("R3"));

  const longLead = broke(
    valid,
    "**Status:**",
    `${Array.from({ length: 140 }, (_, i) => `word${i}`).join(" ")}\n\n**Status:**`,
  );
  assert.ok(rules(longLead).includes("R3"));
});

test("R4: 1 status line with a known value and at most 40 words", () => {
  const unknownValue = broke(valid, "**Status:** pre-release.", "**Status:** soon.");
  assert.ok(rules(unknownValue).includes("R4"));

  const missing = broke(valid, "**Status:** pre-release. The tested host is Snow Linux 13.\n", "");
  assert.ok(rules(missing).includes("R4"));

  const tooLong = broke(
    valid,
    "**Status:** pre-release. The tested host is Snow Linux 13.",
    `**Status:** pre-release. ${Array.from({ length: 45 }, (_, i) => `word${i}`).join(" ")}`,
  );
  assert.ok(rules(tooLong).includes("R4"));
});

test("R4: a status line inside a fenced block does not count", () => {
  const fenced = broke(
    valid,
    "**Status:** pre-release.",
    `${F}text\n**Status:** stable.\n${F}\n\n**Status:** pre-release.`,
  );
  assert.deepEqual(check(fenced, allFiles), []);
});

test("R5: the documentation line holds a link, and a library links pkg.go.dev", () => {
  const noLink = broke(
    valid,
    "**Documentation:** [frostyard.github.io/nsl](https://frostyard.github.io/nsl/)",
    "**Documentation:** see the website",
  );
  assert.ok(rules(noLink).includes("R5"));

  const library = broke(valid, "readme-kind: tool", "readme-kind: library");
  assert.ok(rules(library).includes("R5"), "a library without pkg.go.dev fails R5");

  const goLibrary = broke(
    library,
    "[frostyard.github.io/nsl](https://frostyard.github.io/nsl/)",
    "[pkg.go.dev/github.com/frostyard/nsl](https://pkg.go.dev/github.com/frostyard/nsl)",
  );
  assert.deepEqual(check(goLibrary, allFiles), []);
});

test("R5: a library reads the link destination, not the link text", () => {
  const library = broke(valid, "readme-kind: tool", "readme-kind: library");
  const bad = broke(
    library,
    "[frostyard.github.io/nsl](https://frostyard.github.io/nsl/)",
    "[https://pkg.go.dev/](https://example.org/)",
  );
  assert.ok(rules(bad).includes("R5"));
  const notHttps = broke(
    library,
    "[frostyard.github.io/nsl](https://frostyard.github.io/nsl/)",
    "[pkg.go.dev](ftp://pkg.go.dev/github.com/frostyard/nsl)",
  );
  assert.ok(rules(notHttps).includes("R5"), "a non-https pkg.go.dev link fails R5");
});

test("R5: a documentation line inside a fenced block does not count", () => {
  const fenced = broke(
    valid,
    "**Documentation:**",
    `${F}text\n**Documentation:** [site](https://example.org/)\n${F}\n\n**Documentation:**`,
  );
  assert.deepEqual(check(fenced, allFiles), []);
});

test("R6: at most 3 badges, in the top block, from the allowed sources", () => {
  const badSource = broke(
    valid,
    "https://github.com/frostyard/nsl/actions/workflows/ci.yml/badge.svg",
    "https://example.org/discount.svg",
  );
  assert.ok(rules(badSource).includes("R6"));

  const four = broke(
    valid,
    "**Leave the host alone.",
    `${[
      "[![Go](https://pkg.go.dev/badge/github.com/frostyard/nsl.svg)](https://pkg.go.dev/github.com/frostyard/nsl)",
      "[![Scorecard](https://api.scorecard.dev/projects/github.com/frostyard/nsl/badge)](https://scorecard.dev/)",
      "[![Release](https://img.shields.io/github/v/release/frostyard/nsl)](https://github.com/frostyard/nsl/releases)",
    ].join("\n")}\n\n**Leave the host alone.`,
  );
  const findings = check(four, allFiles).filter((f) => f.rule === "R6");
  assert.ok(findings.some((f) => f.message.includes("4 badges")));

  const outsideTop = `${valid}\n[![CI](https://github.com/frostyard/nsl/actions/workflows/ci.yml/badge.svg)](https://github.com/frostyard/nsl/actions/workflows/ci.yml)\n`;
  assert.ok(rules(outsideTop).includes("R6"));
});

test("R6: an allowed source name inside another host is not allowed", () => {
  const bad = broke(
    valid,
    "https://github.com/frostyard/nsl/actions/workflows/ci.yml/badge.svg",
    "https://example.org/api.scorecard.dev/a.svg",
  );
  assert.ok(rules(bad).includes("R6"));
});

test("R7: the sections match the kind's table", () => {
  const unknownName = broke(valid, "## What it does", "## Overview");
  assert.ok(rules(unknownName).includes("R7"));

  const usage = broke(valid, "## Use", "## Usage");
  assert.ok(
    rules(usage).includes("R7"),
    '"Usage" does not start with "Use"',
  );

  const wrongOrder = valid
    .replace("## Install", "## SLOT")
    .replace("## Use", "## Install")
    .replace("## SLOT", "## Use");
  assert.ok(rules(wrongOrder).includes("R7"));

  const developElsewhere = `${valid}\n## Limits\n\n- 1 limit.\n`;
  assert.ok(rules(developElsewhere).includes("R7"));

  const wrongKind = broke(
    valid,
    "readme-kind: tool",
    "readme-kind: app",
  );
  assert.ok(
    rules(wrongKind).includes("R7"),
    "an app needs What it does and Install only, so Use is not allowed",
  );
});

test("R7: a heading matches when it starts with the name", () => {
  const installedApps = broke(valid, "## Install", "## Install apps");
  assert.deepEqual(check(installedApps, allFiles), []);

  const indentedSection = broke(valid, "## Install", "  ## Install");
  assert.deepEqual(
    check(indentedSection, allFiles),
    [],
    "a level-2 heading with 2 leading spaces is still the Install section",
  );

  const optionalSection = broke(
    valid,
    "## Develop",
    "## Credits\n\nThe projects it draws on.\n\n## Develop",
  );
  assert.deepEqual(check(optionalSection, allFiles), [], "Credits is optional for every kind");
});

test("R8: no heading is deeper than level 2", () => {
  const deeper = broke(valid, "## Develop", "### Commit style\n\n## Develop");
  assert.ok(rules(deeper).includes("R8"));

  const indented = broke(valid, "## Develop", " ### Internals\n\n## Develop");
  assert.ok(
    rules(indented).includes("R8"),
    "a level-3 heading with 1 leading space is still a heading",
  );
});

test("R9: the Develop section has a fenced make line", () => {
  const noMake = broke(valid, "make ci", "npm test");
  assert.ok(rules(noMake).includes("R9"));

  const makeCheck = broke(valid, "make ci", "make check");
  assert.deepEqual(check(makeCheck, allFiles), []);

  const prose = broke(
    valid,
    `${F}sh\n# install the tools, then run the gate\nmise install\nmake ci\n${F}`,
    `${F}sh\nmise install\n${F}\n\nRun \`make ci\` in the repository root.`,
  );
  assert.ok(rules(prose).includes("R9"), "a make line outside a fence is not enough");
});

test("R10: Where to go next links the files the tree has", () => {
  const noLicenseLink = broke(
    valid,
    "- [SECURITY.md](SECURITY.md) says how to report a problem.\n- [LICENSE](LICENSE) is the license.",
    "- [SECURITY.md](SECURITY.md) says how to report a problem.",
  );
  assert.ok(rules(noLicenseLink).includes("R10"));

  const noLicenseInTree = (target) => target !== "LICENSE" && allFiles(target);
  assert.deepEqual(
    check(noLicenseLink, noLicenseInTree),
    [],
    "R10 does not ask for LICENSE when the tree has none",
  );

  const noSecurityLink = broke(valid, "- [SECURITY.md](SECURITY.md) says how to report a problem.\n", "");
  assert.ok(rules(noSecurityLink).includes("R10"));

  const nestedSecurity = broke(
    noSecurityLink,
    "- [docs/README.md](docs/README.md) indexes the documentation.",
    "- [docs/README.md](docs/README.md) indexes the documentation.\n- [.github/SECURITY.md](.github/SECURITY.md) says how to report a problem.",
  );
  const hasNested = (target) =>
    target === ".github/SECURITY.md" ? true : target === "SECURITY.md" ? false : allFiles(target);
  assert.deepEqual(
    check(nestedSecurity, hasNested),
    [],
    ".github/SECURITY.md satisfies R10",
  );

  const anchors = broke(valid, "- [AGENTS.md](AGENTS.md) holds the agent rules.", "- [AGENTS.md](./AGENTS.md#top) holds the agent rules.");
  assert.deepEqual(check(anchors, allFiles), [], "a ./ prefix and a #fragment are dropped");
});

test("R10: each SECURITY.md location is required only where it exists", () => {
  const nestedOnly = broke(
    valid,
    "- [SECURITY.md](SECURITY.md) says how to report a problem.",
    "- [.github/SECURITY.md](.github/SECURITY.md) says how to report a problem.",
  );
  const hasBoth = (target) =>
    target === ".github/SECURITY.md" ? true : allFiles(target);
  assert.ok(
    rules(nestedOnly, hasBoth).includes("R10"),
    "a nested link does not stand in for the SECURITY.md the tree has",
  );

  const hasNestedNotTop = (target) =>
    target === ".github/SECURITY.md"
      ? true
      : target === "SECURITY.md"
        ? false
        : allFiles(target);
  assert.ok(
    rules(valid, hasNestedNotTop).includes("R10"),
    "a top-level link does not stand in for .github/SECURITY.md",
  );
});

test("R10: footer links inside a fenced block do not count", () => {
  const fenced = broke(
    valid,
    "- [LICENSE](LICENSE) is the license.",
    `${F}md\n- [LICENSE](LICENSE) is the license.\n${F}`,
  );
  assert.ok(rules(fenced).includes("R10"));
});

test("R11: the README has at most 1000 words", () => {
  const long = `${valid}\n${Array.from({ length: 1010 }, (_, i) => `word${i}`).join(" ")}\n`;
  assert.ok(rules(long).includes("R11"));
});

test("R12: no emoji, no private IPv4, at most 2 dates, no tree drawing", () => {
  assert.ok(rules(`${valid}\nA sparkle: \u2728\n`).includes("R12"));
  assert.ok(rules(`${valid}\nThe host is 192.168.1.10.\n`).includes("R12"));
  assert.ok(rules(`${valid}\nSee 172.20.0.5 and 100.64.3.2.\n`).includes("R12"));
  assert.ok(rules(`${valid}\n- 2026-01-02\n- 2026-01-03\n- 2026-01-04\n`).includes("R12"));
  assert.ok(rules(`${valid}\n\u251c\u2500\u2500 src\n`).includes("R12"));
});

test("R12: a copyright sign, a trademark and 2 dates pass", () => {
  const fine = `${valid}\n\u00a9 2026 Frostyard, \u00ae and \u2122 are kept.\n- 2026-01-02\n- 2026-01-03\n`;
  assert.deepEqual(check(fine, allFiles), []);
});

test("R12: QEMU 10.0.13 is not a private address", () => {
  const qemu = broke(
    valid,
    "**Status:** pre-release. The tested host is Snow Linux 13.",
    "**Status:** pre-release. The tested host runs QEMU 10.0.13 and 3.4.5.",
  );
  assert.deepEqual(check(qemu, allFiles), []);
});

test("a # comment inside a fenced block is not a heading", () => {
  const commented = broke(valid, "# install the tools, then run the gate", "# install the tools and run the gate");
  assert.deepEqual(check(commented, allFiles), []);
  assert.equal(readKind(commented), "tool");
});

test("a fenced block hides ## lines from the section rules", () => {
  const fenced = broke(
    valid,
    "nsl enter work",
    "nsl enter work\n## Not a section",
  );
  assert.deepEqual(check(fenced, allFiles), []);
});

test("every template passes, and each of the 10 kinds has one", () => {
  assert.ok(
    existsSync(templatesDir),
    `the templates folder ${templatesDir} is missing`,
  );
  const files = readdirSync(templatesDir)
    .filter((file) => file.endsWith(".md.tmpl"))
    .sort();
  for (const file of files) {
    const text = readFileSync(path.join(templatesDir, file), "utf8");
    assert.deepEqual(
      check(text, allFiles),
      [],
      `template ${file} passes with the 4 repository files present`,
    );
    assert.equal(
      readKind(text),
      file.replace(/\.md\.tmpl$/, ""),
      `the marker kind of ${file} is its file name`,
    );
  }
  const kinds = files.map((file) => file.replace(/\.md\.tmpl$/, ""));
  for (const kind of Object.keys(KINDS)) {
    assert.ok(kinds.includes(kind), `there is a template for ${kind}`);
  }
});

const coreReadmePath = path.join(repoRoot, "README.md");

test("core's own README.md passes the checker", () => {
  assert.ok(existsSync(coreReadmePath), "core README.md is missing");
  const text = readFileSync(coreReadmePath, "utf8");
  const findings = checkReadme(text, (target) =>
    existsSync(path.join(repoRoot, target)),
  );
  assert.deepEqual(findings, []);
});

function runCli(args, cwd) {
  try {
    const stdout = execFileSync(process.execPath, [scriptPath, ...args], {
      encoding: "utf8",
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      status: typeof error.status === "number" ? error.status : 1,
      stdout: String(error.stdout ?? ""),
      stderr: String(error.stderr ?? ""),
    };
  }
}

function writeRepo(dir, readme) {
  writeFileSync(path.join(dir, "README.md"), readme);
  writeFileSync(path.join(dir, "AGENTS.md"), "# agent rules\n");
  writeFileSync(path.join(dir, "LICENSE"), "MIT\n");
  writeFileSync(path.join(dir, "SECURITY.md"), "# security\n");
  mkdirSync(path.join(dir, "docs"), { recursive: true });
  writeFileSync(path.join(dir, "docs/README.md"), "# docs\n");
}

function tempDir(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "readme-check-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("the CLI passes a good README and prints the ok line", (t) => {
  const dir = tempDir(t);
  writeRepo(dir, valid);
  const result = runCli([dir], dir);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^ok README\.md \(tool, \d+ words\)\n$/);
});

test("the CLI fails a bad README and prints a FAIL line", (t) => {
  const dir = tempDir(t);
  writeRepo(dir, broke(valid, "**Status:** pre-release.", "**Status:** soon."));
  const result = runCli([dir], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^FAIL R\d+ /m);
  assert.ok(result.stdout.includes("FAIL R4 "), result.stdout);
});

test("the CLI reports a missing README.md", (t) => {
  const dir = tempDir(t);
  const result = runCli([dir], dir);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.trim(), "FAIL R2 README.md is missing");
});

test("the CLI reads a ref with --ref", (t) => {
  const dir = tempDir(t);
  writeRepo(dir, valid);
  const git = (...args) => execFileSync("git", args, { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
  git("init");
  git("add", "README.md", "AGENTS.md", "LICENSE", "SECURITY.md", "docs/README.md");
  git(
    "-c",
    "user.name=README Check",
    "-c",
    "user.email=readme-check@example.org",
    "commit",
    "-m",
    "a passing README",
  );
  writeFileSync(path.join(dir, "README.md"), broke(valid, "**Status:** pre-release.", "**Status:** soon."));
  const result = runCli(["--ref", "HEAD", dir], dir);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^ok README\.md \(tool, \d+ words\)\n$/);
});

test("the CLI refuses a wrong argument", () => {
  const result = runCli(["--nope"], repoRoot);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /^usage: node check-readme\.mjs /m);
});
