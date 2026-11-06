// Scaffold end-to-end check: build the payload the way a consuming repository
// does (locked ProperDocs + MaterialX), then assert on the rendered output and
// on the templates that ship with it. Only `node:` modules; Node >= 22.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scaffoldDir = join(skillDir, "scaffold");
const templatesDir = join(skillDir, "templates");

function run(command, args, cwd, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error) {
    assert.fail(`cannot run ${command}: ${result.error.message}`);
  }
  if (!allowFailure) {
    assert.equal(
      result.status,
      0,
      `${command} ${args.join(" ")} failed with status ${result.status}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  }
  return result;
}

// A virtual environment with pip, from python3 -m venv. Some distributions ship
// python3 without ensurepip, so the Debian and Ubuntu package python3-venv is
// missing until it is installed. When `python3 -m venv` fails that way, the
// environment is made without pip and pip is seeded by ensurepip, then by uv.
function makeVenv(workDir) {
  const venvDir = join(workDir, "venv");
  const first = run("python3", ["-m", "venv", venvDir], workDir, { allowFailure: true });
  if (first.status === 0) return venvDir;

  run("python3", ["-m", "venv", "--without-pip", venvDir], workDir);
  const python = join(venvDir, "bin", "python");
  const seed = spawnSync(python, ["-m", "ensurepip", "--upgrade"], { cwd: workDir, encoding: "utf8" });
  if (seed.status === 0) return venvDir;

  const uv = spawnSync("uv", ["--version"], { cwd: workDir, encoding: "utf8" });
  assert.equal(
    uv.status,
    0,
    "python3 cannot create a virtual environment with pip here (install python3-venv, or uv); this test does not skip",
  );
  run("uv", ["pip", "install", "--python", python, "pip"], workDir);
  return venvDir;
}

test("the scaffold builds with the locked requirements and renders a site", (t) => {
  const python = spawnSync("python3", ["--version"], { encoding: "utf8" });
  assert.equal(
    python.error,
    undefined,
    "python3 is required to build the scaffold; this test does not skip when it is missing",
  );

  const workDir = mkdtempSync(join(tmpdir(), "frostyard-docs-site-"));
  t.after(() => rmSync(workDir, { recursive: true, force: true }));
  cpSync(scaffoldDir, workDir, { recursive: true });

  const venvDir = makeVenv(workDir);
  run(join(venvDir, "bin", "pip"), ["install", "-q", "--require-hashes", "-r", "requirements.txt"], workDir);
  run(join(venvDir, "bin", "properdocs"), ["build", "--strict", "-f", "properdocs.yml"], workDir);

  const dist = join(workDir, "dist");
  const homePath = join(dist, "index.html");
  assert.ok(existsSync(homePath), `the build wrote no ${homePath}`);
  const home = readFileSync(homePath, "utf8");
  assert.match(home, /stylesheets\/frostyard\.css/, "the home page does not load the Frostyard stylesheet");
  assert.doesNotMatch(home, /made with/i, "the home page carries a generator credit; extra.generator must stay false");

  // MaterialX indexes search with Pagefind: an entry point plus at least one
  // built index under search/index/.
  const search = join(dist, "search");
  assert.ok(existsSync(join(search, "pagefind-entry.json")), "the build wrote no dist/search/pagefind-entry.json");
  const indexes = readdirSync(join(search, "index")).filter((name) => name.endsWith(".pf_index"));
  assert.ok(indexes.length > 0, "the build wrote no search index (*.pf_index) under dist/search/index/");

  assert.ok(existsSync(join(dist, "guides", "example", "index.html")), "the build wrote no guides/example page");
});

test("every locked requirement carries at least one hash", () => {
  const lines = readFileSync(join(scaffoldDir, "requirements.txt"), "utf8").split("\n");
  const requirements = [];
  for (const line of lines) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const requirement = /^([a-z0-9._-]+==\S*)/i.exec(line);
    if (requirement) {
      requirements.push({ name: requirement[1], hashes: 0 });
      continue;
    }
    if (requirements.length > 0 && line.includes("--hash=sha256:")) {
      requirements[requirements.length - 1].hashes++;
    }
  }
  assert.ok(requirements.length > 0, "scaffold/requirements.txt names no requirement");
  const unhashed = requirements.filter((entry) => entry.hashes === 0).map((entry) => entry.name);
  assert.deepEqual(unhashed, [], `these requirements have no --hash=sha256: line: ${unhashed.join(", ")}`);
});

test("the site workflow pins every action and keeps least privilege", () => {
  const workflow = readFileSync(join(templatesDir, "site.yml"), "utf8");
  const usesLines = workflow.split("\n").filter((line) => /^\s*-?\s*uses:\s*\S/.test(line));
  assert.ok(usesLines.length > 0, "templates/site.yml uses no action");
  for (const line of usesLines) {
    const action = /uses:\s*(\S+)/.exec(line)[1];
    assert.match(action, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, `${action} is not a 40-character SHA pin`);
    assert.match(line, /#\s*v\d+\.\d+\.\d+/, `${action} has no "# vX.Y.Z" comment`);
  }
  assert.match(workflow, /^permissions: \{\}$/m, "templates/site.yml has no top-level permissions: {}");
  assert.match(workflow, /persist-credentials: false/, "templates/site.yml does not disable persisted credentials");
});

test("the Makefile fragment installs a hash-locked environment and builds strictly", () => {
  const fragment = readFileSync(join(templatesDir, "site.mk"), "utf8");
  assert.match(fragment, /--require-hashes/, "templates/site.mk does not install with --require-hashes");
  assert.match(fragment, /--strict/, "templates/site.mk does not build with --strict");
});

test("the skill instructions name the current toolchain and nothing retired", () => {
  const skill = readFileSync(join(skillDir, "SKILL.md"), "utf8");
  for (const expected of ["frostyard.github.io", "uv pip compile", "make site"]) {
    assert.ok(skill.includes(expected), `SKILL.md does not name ${expected}`);
  }
  // Spelled in parts so a repository-wide grep for the retired Astro toolchain
  // does not match this test file.
  for (const retired of ["wrangl" + "er", "Cloud" + "flare", "n" + "pm"]) {
    assert.ok(!skill.includes(retired), `SKILL.md still names ${retired}`);
  }
});
