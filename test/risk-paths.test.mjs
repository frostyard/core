import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  FILE_LIST_LIMIT,
  LEVELS,
  ORG_FLOORS,
  checkRequiredPaths,
  createGitHubApi,
  levelOfFile,
  levelOfPullRequest,
  matchFiles,
  matchGlob,
  parseStrictJson,
  validateGlob,
  validateRiskPaths,
} from "../scripts/lib/risk-paths.mjs";
import { RISK_PATHS_BLOCK, renderBlock, syncWorkflow } from "../scripts/sync-risk-paths-workflow.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkScript = path.join(repoRoot, "scripts/check-risk-paths.mjs");

const BASE_SHA = "a".repeat(40);

function list(paths) {
  return { schema_version: 1, paths };
}

function validList() {
  return list([
    { glob: ".github/risk-paths.json", why: "governance" },
    { glob: ".github/workflows/**", why: "governance: the caller" },
    { glob: "shared/bootc-secure/**", why: "boot chain" },
  ]);
}

// ---- Matching -------------------------------------------------------------

const specTable = [
  ["**/x", ["x", "a/x", "a/b/x"], ["a/x/y"]],
  ["**", ["x", "a/b", ".github/x.yml"], []],
  ["x*", ["x", "xy"], ["a/x", "a/xy"]],
  ["docs/*.md", ["docs/a.md", "docs/.md"], ["docs/a/b.md", "src/a.md"]],
  ["shared/**", ["shared/a", "shared/a/b"], ["other/a"]],
  [
    ".github/{risk-paths.json,settings.yml}",
    [".github/risk-paths.json", ".github/settings.yml"],
    [".github/workflows/ci.yml"],
  ],
];

for (const [glob, yes, no] of specTable) {
  test(`spec table: ${glob}`, () => {
    assert.deepEqual(validateGlob(glob), []);
    for (const p of yes) assert.equal(matchGlob(glob, p), true, `${glob} must match ${p}`);
    for (const p of no) assert.equal(matchGlob(glob, p), false, `${glob} must not match ${p}`);
  });
}

test("braces, ** and ? match as the spec says", () => {
  assert.equal(matchGlob("{a,b}/x", "a/x"), true);
  assert.equal(matchGlob("{a,b}/x", "b/x"), true);
  assert.equal(matchGlob("{a,b}/x", "c/x"), false);
  assert.equal(matchGlob("{a,b}/{c,d}.md", "b/d.md"), true);
  // "**" matches 0 segments, so a/** also matches the file a itself.
  assert.equal(matchGlob("a/**", "a"), true);
  assert.equal(matchGlob("a/**", "a/b/c"), true);
  assert.equal(matchGlob("a/**/z", "a/z"), true);
  assert.equal(matchGlob("a/**/z", "a/b/c/z"), true);
  assert.equal(matchGlob("a/**/z", "a/b/c/y"), false);
  assert.equal(matchGlob("a?c", "abc"), true);
  assert.equal(matchGlob("a?c", "ac"), false);
  assert.equal(matchGlob("a?c", "a/c"), false);
  assert.equal(matchGlob("*", "a/b"), false);
});

test("* matches a dotfile", () => {
  assert.equal(matchGlob("*", ".env"), true);
  assert.equal(matchGlob("**/*", ".github/.hidden"), true);
});

test("matching is case-sensitive", () => {
  assert.equal(matchGlob("Docs/*.md", "docs/a.md"), false);
  assert.equal(matchGlob("docs/*.md", "docs/A.md"), true);
  assert.equal(matchGlob("docs/a.md", "docs/A.md"), false);
});

test("regex characters in a glob match literally", () => {
  assert.equal(matchGlob("a.b+(c)", "a.b+(c)"), true);
  assert.equal(matchGlob("a.b", "axb"), false);
  assert.equal(matchGlob("my-file$", "my-file$"), true);
});

test("matchFiles: a matching file gives a match, a non-matching file none", () => {
  const value = validList();
  assert.deepEqual(matchFiles(value, [{ filename: ".github/workflows/ci.yml", status: "modified" }]), [
    { path: ".github/workflows/ci.yml", glob: ".github/workflows/**", why: "governance: the caller" },
  ]);
  assert.deepEqual(matchFiles(value, [{ filename: "docs/README.md", status: "modified" }]), []);
});

test("matchFiles: a rename matches by its previous path", () => {
  const matches = matchFiles(validList(), [
    { filename: "elsewhere/key.pem", status: "renamed", previous_filename: "shared/bootc-secure/key.pem" },
  ]);
  assert.deepEqual(matches, [{ path: "shared/bootc-secure/key.pem", glob: "shared/bootc-secure/**", why: "boot chain" }]);
});

// ---- Validation -----------------------------------------------------------

function errorsOf(value) {
  const result = validateRiskPaths(value);
  assert.equal(result.ok, false);
  return result.errors.join("\n");
}

test("a valid list passes", () => {
  assert.deepEqual(validateRiskPaths(validList()), { ok: true, errors: [] });
});

test("validation fails on an unknown top-level key", () => {
  assert.match(errorsOf({ ...validList(), extra: 1 }), /\$: unknown key "extra"/);
});

test("validation fails on an unknown entry key", () => {
  const value = validList();
  value.paths[1].owner = "x";
  assert.match(errorsOf(value), /paths\[1\]: unknown key "owner"/);
});

test("validation fails on schema_version \"1\" and 3", () => {
  assert.match(errorsOf({ ...validList(), schema_version: "1" }), /schema_version: must be the integer 1 or 2/);
  assert.match(errorsOf({ ...validList(), schema_version: 3 }), /schema_version: must be the integer 1 or 2/);
});

test("validation fails on empty paths", () => {
  assert.match(errorsOf(list([])), /paths: must have at least 1 entry/);
});

test("validation fails on a duplicate glob", () => {
  const value = list([
    { glob: "a/**", why: "x" },
    { glob: "a/**", why: "y" },
  ]);
  assert.match(errorsOf(value), /paths\[1\]\.glob: duplicate glob/);
});

test("parseStrictJson fails on a duplicate JSON key at any level", () => {
  assert.throws(() => parseStrictJson('{"schema_version":1,"schema_version":1,"paths":[]}'), /duplicate key "schema_version"/);
  assert.throws(
    () => parseStrictJson('{"schema_version":1,"paths":[{"glob":"a","why":"x","why":"y"}]}'),
    /position \d+: duplicate key "why"/,
  );
  assert.deepEqual(parseStrictJson(' {"a":[1,-2.5e3,true,false,null,"\\u0041\\n"]} '), {
    a: [1, -2500, true, false, null, "A\n"],
  });
  assert.throws(() => parseStrictJson("{'a':1}"), /position 1/);
  assert.throws(() => parseStrictJson('{"a":1} x'), /after the JSON value/);
  assert.throws(() => parseStrictJson('{"a":01}'), /position/);
});

test("parseStrictJson keeps __proto__ an own key, which validation rejects", () => {
  const value = parseStrictJson('{"schema_version":1,"paths":[{"glob":"a","why":"x"}],"__proto__":{}}');
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.match(errorsOf(value), /unknown key "__proto__"/);
});

test("validation fails on an empty or a 201-character why", () => {
  assert.match(errorsOf(list([{ glob: "a", why: "  " }])), /paths\[0\]\.why: must not be empty/);
  assert.match(errorsOf(list([{ glob: "a", why: "x".repeat(201) }])), /paths\[0\]\.why: must be at most 200/);
  assert.equal(validateRiskPaths(list([{ glob: "a", why: "x".repeat(200) }])).ok, true);
  // Code points, not UTF-16 units.
  assert.equal(validateRiskPaths(list([{ glob: "a", why: "😀".repeat(200) }])).ok, true);
});

test("validation fails on a wrong type and collects every error", () => {
  const errors = errorsOf({ schema_version: 1, paths: [{ glob: 3, why: [] }, "x"] });
  assert.match(errors, /paths\[0\]\.glob: must be a string/);
  assert.match(errors, /paths\[0\]\.why: must be a string/);
  assert.match(errors, /paths\[1\]: must be an object/);
  assert.match(errorsOf([]), /top level must be an object/);
});

for (const glob of ["", "/a", "./a", "a//b", "a/", "a/../b", "[ab]", "!a", "a\\b", "a**", "**b/c", "{a}", "{a,}", "{a,{b,c}}", "{a", "a}"]) {
  test(`invalid glob fails: ${JSON.stringify(glob)}`, () => {
    assert.notDeepEqual(validateGlob(glob), []);
    assert.match(errorsOf(list([{ glob, why: "x" }])), /paths\[0\]\.glob/);
  });
}

test("brace expansion above 256 globs fails", () => {
  const group = "{a,b}";
  assert.deepEqual(validateGlob(Array(8).fill(group).join("/")), []);
  assert.match(validateGlob(Array(9).fill(group).join("/")).join(), /more than 256/);
});

// ---- Version 1 results ----------------------------------------------------

const e = (glob, why = "x") => ({ glob, why });

// The expected results were made once with the library before version 2 (the
// library at commit 9a54cb8, before ADR-0078), then written down. A version 1 list
// must keep its result, error by error.
const V1_FIXTURES = [
  ["valid list", () => ({ schema_version: 1, paths: [e(".github/risk-paths.json", "governance"), e(".github/workflows/**", "governance: the caller"), e("shared/bootc-secure/**", "boot chain")] }), {"ok":true,"errors":[]}],
  ["valid 200-character why", () => ({ schema_version: 1, paths: [e("a", "x".repeat(200))] }), {"ok":true,"errors":[]}],
  ["valid braces", () => ({ schema_version: 1, paths: [e("{a,b}/**")] }), {"ok":true,"errors":[]}],
  ["top level array", () => ([]), {"ok":false,"errors":["$: the top level must be an object"]}],
  ["top level null", () => (null), {"ok":false,"errors":["$: the top level must be an object"]}],
  ["top level string", () => ("x"), {"ok":false,"errors":["$: the top level must be an object"]}],
  ["unknown top-level key", () => ({ schema_version: 1, paths: [e("a")], extra: 1 }), {"ok":false,"errors":["$: unknown key \"extra\""]}],
  ["unknown entry key", () => ({ schema_version: 1, paths: [e("a"), { glob: "b", why: "x", owner: "y" }] }), {"ok":false,"errors":["paths[1]: unknown key \"owner\""]}],
  ["level key in a v1 entry", () => ({ schema_version: 1, paths: [{ glob: "a", level: "L1", why: "x" }] }), {"ok":false,"errors":["paths[0]: unknown key \"level\""]}],
  ["default_level key in a v1 list", () => ({ schema_version: 1, default_level: "L3", paths: [e("a")] }), {"ok":false,"errors":["$: unknown key \"default_level\""]}],
  ["missing paths", () => ({ schema_version: 1 }), {"ok":false,"errors":["$: missing key \"paths\""]}],
  ["empty paths", () => ({ schema_version: 1, paths: [] }), {"ok":false,"errors":["paths: must have at least 1 entry"]}],
  ["paths not an array", () => ({ schema_version: 1, paths: {} }), {"ok":false,"errors":["paths: must be an array"]}],
  ["duplicate glob", () => ({ schema_version: 1, paths: [e("a/**"), e("a/**", "y")] }), {"ok":false,"errors":["paths[1].glob: duplicate glob \"a/**\" (also paths[0])"]}],
  ["entries that are not objects", () => ({ schema_version: 1, paths: ["x", null, 3] }), {"ok":false,"errors":["paths[0]: must be an object","paths[1]: must be an object","paths[2]: must be an object"]}],
  ["wrong types", () => ({ schema_version: 1, paths: [{ glob: 3, why: [] }, "x"] }), {"ok":false,"errors":["paths[0].glob: must be a string","paths[0].why: must be a string","paths[1]: must be an object"]}],
  ["missing glob and why", () => ({ schema_version: 1, paths: [{}] }), {"ok":false,"errors":["paths[0]: missing key \"glob\"","paths[0]: missing key \"why\""]}],
  ["blank why", () => ({ schema_version: 1, paths: [e("a", "  ")] }), {"ok":false,"errors":["paths[0].why: must not be empty"]}],
  ["201-character why", () => ({ schema_version: 1, paths: [e("a", "x".repeat(201))] }), {"ok":false,"errors":["paths[0].why: must be at most 200 characters"]}],
  ["every invalid glob", () => ({ schema_version: 1, paths: ["", "/a", "./a", "a//b", "a/", "a/../b", "[ab]", "!a", "a\\b", "a**", "**b/c", "{a}", "{a,}", "{a,{b,c}}", "{a", "a}"].map((g) => e(g)) }), {"ok":false,"errors":["paths[0].glob: \"\": glob is empty","paths[1].glob: \"/a\": a glob must not start with '/'","paths[1].glob: \"/a\": a glob must not have an empty segment","paths[2].glob: \"./a\": a glob must not start with './'","paths[3].glob: \"a//b\": a glob must not have an empty segment","paths[4].glob: \"a/\": a glob must not have an empty segment","paths[5].glob: \"a/../b\": a glob must not have a '..' segment","paths[6].glob: \"[ab]\": \"[\" is not supported","paths[6].glob: \"[ab]\": \"]\" is not supported","paths[7].glob: \"!a\": \"!\" is not supported","paths[8].glob: \"a\\\\b\": \"\\\\\" is not supported","paths[9].glob: \"a**\": '**' must be a whole segment","paths[10].glob: \"**b/c\": '**' must be a whole segment","paths[11].glob: \"{a}\": a brace group needs at least 2 alternatives","paths[12].glob: \"{a,}\": a brace group has an empty alternative","paths[13].glob: \"{a,{b,c}}\": nested braces are not supported","paths[14].glob: \"{a\": unmatched '{'","paths[15].glob: \"a}\": unmatched '}'"]}],
  ["brace expansion above 256 globs", () => ({ schema_version: 1, paths: [e(Array(9).fill("{a,b}").join("/"))] }), {"ok":false,"errors":["paths[0].glob: \"{a,b}/{a,b}/{a,b}/{a,b}/{a,b}/{a,b}/{a,b}/{a,b}/{a,b}\": brace expansion gives more than 256 globs"]}],
  ["several errors at once", () => ({ schema_version: 1, extra: true, paths: [{ glob: "a**", why: "" }, { glob: "a**", why: "x", z: 1 }] }), {"ok":false,"errors":["$: unknown key \"extra\"","paths[0].glob: \"a**\": '**' must be a whole segment","paths[0].why: must not be empty","paths[1]: unknown key \"z\"","paths[1].glob: \"a**\": '**' must be a whole segment","paths[1].glob: duplicate glob \"a**\" (also paths[0])"]}]
];

test("validateRiskPaths gives the same results as before for every v1 fixture", () => {
  for (const [name, make, expected] of V1_FIXTURES) {
    assert.deepEqual(validateRiskPaths(make()), expected, name);
  }
});

// ---- Validation, version 2 ------------------------------------------------

function list2(paths, defaultLevel = "L3") {
  return { schema_version: 2, default_level: defaultLevel, paths };
}

const e2 = (glob, level, why = "x") => ({ glob, level, why });

function validList2() {
  return list2([e2(".github/risk-paths.json", "L2", "quality"), e2(".github/workflows/**", "L2", "workflows"), e2("docs/**", "L4", "docs")]);
}

test("a valid v2 list passes", () => {
  assert.deepEqual(validateRiskPaths(validList2()), { ok: true, errors: [] });
  assert.deepEqual(validateRiskPaths(list2([e2("a", "L1")], "L4")), { ok: true, errors: [] });
});

test("v2 validation fails on a missing default_level", () => {
  const { default_level: _unused, ...value } = validList2();
  assert.deepEqual(validateRiskPaths(value), { ok: false, errors: ['$: missing key "default_level"'] });
});

test("v2 validation fails on a bad default_level and a bad entry level", () => {
  const value = list2([e2("a", "L1"), e2("b", "L2"), e2("c", "L3"), e2("d", "L5"), e2("e", 3)], "l3");
  assert.deepEqual(validateRiskPaths(value), {
    ok: false,
    errors: [
      "default_level: must be 1 of L1, L2, L3, L4",
      "paths[3].level: must be 1 of L1, L2, L3, L4",
      "paths[4].level: must be 1 of L1, L2, L3, L4",
    ],
  });
});

test("v2 validation fails on a missing level in an entry", () => {
  const value = list2([e2("a", "L1"), { glob: "b", why: "x" }]);
  assert.deepEqual(validateRiskPaths(value), { ok: false, errors: ['paths[1]: missing key "level"'] });
});

test("v2 validation keeps the glob, why, duplicate and empty-paths rules", () => {
  const errors = errorsOf(list2([e2("a**", "L1", ""), e2("a**", "L1")]));
  assert.match(errors, /paths\[0\]\.glob: "a\*\*"/);
  assert.match(errors, /paths\[0\]\.why: must not be empty/);
  assert.match(errors, /paths\[1\]\.glob: duplicate glob "a\*\*" \(also paths\[0\]\)/);
  assert.match(errorsOf(list2([])), /paths: must have at least 1 entry/);
  assert.match(errorsOf({ ...validList2(), extra: 1 }), /\$: unknown key "extra"/);
  assert.match(errorsOf(list2([{ ...e2("a", "L1"), owner: "x" }])), /paths\[0\]: unknown key "owner"/);
});

test("a v1 entry with a level key fails", () => {
  assert.deepEqual(validateRiskPaths({ schema_version: 1, paths: [{ glob: "a", level: "L1", why: "x" }] }), {
    ok: false,
    errors: ['paths[0]: unknown key "level"'],
  });
});

test("schema_version 3 fails and checks keys as v1", () => {
  assert.deepEqual(validateRiskPaths({ schema_version: 3, paths: [e("a")] }), {
    ok: false,
    errors: ["schema_version: must be the integer 1 or 2"],
  });
  assert.deepEqual(validateRiskPaths({ schema_version: 3, default_level: "L3", paths: [e("a")] }), {
    ok: false,
    errors: ['$: unknown key "default_level"', "schema_version: must be the integer 1 or 2"],
  });
});

test("a missing schema_version fails", () => {
  assert.deepEqual(validateRiskPaths({ paths: [e("a")] }), {
    ok: false,
    errors: ['$: missing key "schema_version"', "schema_version: must be the integer 1 or 2"],
  });
});

// ---- Levels ---------------------------------------------------------------

test("the levels are frozen and the org floor is frozen", () => {
  assert.deepEqual([...LEVELS], ["L1", "L2", "L3", "L4"]);
  assert.ok(Object.isFrozen(LEVELS));
  assert.ok(Object.isFrozen(ORG_FLOORS) && Object.isFrozen(ORG_FLOORS.L1) && Object.isFrozen(ORG_FLOORS.L1.words));
  assert.ok(Object.isFrozen(ORG_FLOORS.L1.extensions) && Object.isFrozen(ORG_FLOORS.L2) && Object.isFrozen(ORG_FLOORS.L2.globs));
});

test("a v1 list reads as every glob at L1 and default L3", () => {
  const value = validList();
  assert.deepEqual(levelOfFile(value, "shared/bootc-secure/a.sh"), {
    path: "shared/bootc-secure/a.sh",
    level: "L1",
    source: "glob",
    glob: "shared/bootc-secure/**",
    why: "boot chain",
  });
  assert.deepEqual(levelOfFile(value, ".github/workflows/ci.yml").level, "L1");
});

test("a v1 list with no match gives L3", () => {
  assert.deepEqual(levelOfFile(validList(), "docs/a.md"), {
    path: "docs/a.md",
    level: "L3",
    source: "default",
    glob: null,
    why: null,
  });
  assert.equal(levelOfPullRequest(validList(), [{ filename: "docs/a.md" }]).level, "L3");
});

test("the strictest matching glob wins", () => {
  const value = list2([e2("src/**", "L3", "src"), e2("src/auth/**", "L2", "auth"), e2("**/*.go", "L4", "go")]);
  const result = levelOfFile(value, "src/auth/login.go");
  assert.equal(result.level, "L2");
  assert.equal(result.glob, "src/auth/**");
  assert.equal(result.why, "auth");
  assert.equal(result.source, "glob");
});

test("with equal levels the first glob in list order wins", () => {
  const value = list2([e2("src/**", "L2", "first"), e2("**/*.go", "L2", "second")]);
  assert.equal(levelOfFile(value, "src/a.go").glob, "src/**");
  const reversed = list2([e2("**/*.go", "L2", "second"), e2("src/**", "L2", "first")]);
  assert.equal(levelOfFile(reversed, "src/a.go").glob, "**/*.go");
});

test("an L4 glob under an L3 default gives L4", () => {
  const value = list2([e2("docs/**", "L4", "docs")]);
  assert.deepEqual(levelOfFile(value, "docs/a.md"), { path: "docs/a.md", level: "L4", source: "glob", glob: "docs/**", why: "docs" });
});

test("an L4 glob under a floor gives the floor's level", () => {
  const value = list2([e2("**", "L4", "everything")]);
  assert.deepEqual(levelOfFile(value, "docs/keys/a.md"), {
    path: "docs/keys/a.md",
    level: "L1",
    source: "floor",
    glob: null,
    why: 'org floor: path word "keys"',
  });
  assert.equal(levelOfFile(value, ".github/workflows/ci.yml").level, "L2");
  assert.equal(levelOfFile(value, ".github/workflows/ci.yml").source, "floor");
  assert.equal(levelOfFile(value, "docs/a.md").level, "L4");
});

test("a glob at the floor's level keeps the glob as the source", () => {
  const value = list2([e2(".github/workflows/**", "L2", "workflows")]);
  assert.equal(levelOfFile(value, ".github/workflows/ci.yml").source, "glob");
  // A stricter glob beats a looser floor.
  const strict = list2([e2(".github/workflows/**", "L1", "workflows")]);
  assert.equal(levelOfFile(strict, ".github/workflows/ci.yml").level, "L1");
  assert.equal(levelOfFile(strict, ".github/workflows/ci.yml").source, "glob");
  // A default stricter than the floor wins over the floor.
  assert.equal(levelOfFile(list2([e2("a", "L1")], "L1"), ".github/workflows/ci.yml").level, "L1");
});

const FLOOR_WORDS = ["secret", "secrets", "credential", "credentials", "password", "passwords", "passwd", "signing", "keyring", "keyrings", "keys", "gpg", "pgp"];

for (const word of FLOOR_WORDS) {
  test(`floor word ${word} is L1`, () => {
    const value = list2([e2("zzz", "L4")]);
    for (const p of [`${word}/a.txt`, `src/${word}`, `src/a-${word}.txt`, `src/a_${word}_b.txt`, `src/${word}.json`, `src/x.${word}`]) {
      const result = levelOfFile(value, p);
      assert.equal(result.level, "L1", p);
      assert.equal(result.source, "floor", p);
      assert.equal(result.why, `org floor: path word ${JSON.stringify(word)}`, p);
    }
  });
}

test("floor words are case-insensitive", () => {
  const value = list2([e2("zzz", "L4")]);
  assert.equal(levelOfFile(value, "src/Secrets/A.txt").level, "L1");
  assert.equal(levelOfFile(value, "SRC/KEYS/a").level, "L1");
  assert.equal(levelOfFile(value, "src/My-Password.txt").level, "L1");
});

test("a floor word is a whole word: keyboard.go, monkeys and secretary are not L1", () => {
  const value = list2([e2("zzz", "L4")]);
  for (const p of ["keyboard.go", "src/keyboard.go", "monkeys/a.txt", "secretary.md", "keystone/a", "src/mykeys.txt", "passwords2/a"]) {
    assert.equal(levelOfFile(value, p).level, "L3", p);
  }
});

test("src/keys/a.go and debian/keyrings/frostyard.asc are L1", () => {
  const value = validList2();
  assert.equal(levelOfFile(value, "src/keys/a.go").level, "L1");
  assert.equal(levelOfFile(value, "debian/keyrings/frostyard.asc").level, "L1");
});

for (const extension of ["pem", "key", "p12", "pfx", "gpg", "asc"]) {
  test(`floor extension ${extension} is L1`, () => {
    const value = list2([e2("zzz", "L4")]);
    for (const p of [`a/b.${extension}`, `a/b.${extension.toUpperCase()}`, `x.y.${extension}`]) {
      const result = levelOfFile(value, p);
      if (extension === "gpg") {
        // gpg is also a floor word; the word wins.
        assert.equal(result.level, "L1", p);
        continue;
      }
      assert.equal(result.level, "L1", p);
      assert.equal(result.source, "floor", p);
      assert.equal(result.why, `org floor: extension ${JSON.stringify(extension)}`, p);
    }
  });
}

test("cert.PEM is L1; a leading dot and a trailing dot are not an extension", () => {
  const value = list2([e2("zzz", "L4")]);
  assert.equal(levelOfFile(value, "cert.PEM").level, "L1");
  assert.equal(levelOfFile(value, ".key").level, "L3");
  assert.equal(levelOfFile(value, "a/.asc").level, "L3");
  assert.equal(levelOfFile(value, "a/b.pem.").level, "L3");
  assert.equal(levelOfFile(value, "a.pem/b").level, "L3");
  assert.equal(levelOfFile(value, "a/b.pemx").level, "L3");
  assert.equal(levelOfFile(value, "a/key").level, "L3");
  assert.equal(levelOfFile(value, "a/.env").level, "L3");
});

for (const glob of [".github/workflows/**", ".github/actions/**", ".github/risk-paths.json", "policies/**", ".github/policies/**"]) {
  test(`floor glob ${glob} is L2`, () => {
    const value = list2([e2("zzz", "L4")]);
    const p = glob.endsWith("/**") ? `${glob.slice(0, -2)}x/y.yml` : glob;
    assert.deepEqual(levelOfFile(value, p), { path: p, level: "L2", source: "floor", glob: null, why: `org floor: ${glob}` });
  });
}

test("a path near the floor globs is not L2", () => {
  const value = list2([e2("zzz", "L4")]);
  for (const p of [".github/CODEOWNERS", "docs/policies/a.md", ".github/risk-paths.jsonc", "policies2/a"]) {
    assert.equal(levelOfFile(value, p).level, "L3", p);
  }
});

test("0 files gives default_level", () => {
  assert.deepEqual(levelOfPullRequest(list2([e2("a", "L1")], "L4"), []), { level: "L4", truncated: false, files: [] });
  assert.equal(levelOfPullRequest(validList(), []).level, "L3");
});

test("the level of a pull request is the strictest file level", () => {
  const result = levelOfPullRequest(validList2(), [{ filename: "docs/a.md" }, { filename: "src/a.go" }, ".github/workflows/ci.yml"]);
  assert.equal(result.level, "L2");
  assert.equal(result.truncated, false);
  assert.deepEqual(result.files.map((file) => [file.path, file.level]), [
    ["docs/a.md", "L4"],
    ["src/a.go", "L3"],
    [".github/workflows/ci.yml", "L2"],
  ]);
});

test("3000 files give L1 and truncated", () => {
  assert.equal(FILE_LIST_LIMIT, 3000);
  const files = Array.from({ length: 3000 }, (_, i) => ({ filename: `docs/f${i}.md` }));
  const result = levelOfPullRequest(validList2(), files);
  assert.equal(result.level, "L1");
  assert.equal(result.truncated, true);
  assert.equal(levelOfPullRequest(validList2(), files.slice(0, 2999)).truncated, false);
  assert.equal(levelOfPullRequest(validList2(), files.slice(0, 2999)).level, "L4");
});

test("a rename counts both names, each path once", () => {
  const result = levelOfPullRequest(validList2(), [
    { filename: "docs/new.md", previous_filename: ".github/workflows/old.yml", status: "renamed" },
    { filename: "docs/new.md" },
  ]);
  assert.equal(result.level, "L2");
  assert.deepEqual(result.files.map((file) => file.path), ["docs/new.md", ".github/workflows/old.yml"]);
});

// ---- Required paths -------------------------------------------------------

const CALLER = ".github/workflows/risk-paths-caller.yml";

test("checkRequiredPaths: a v1 list that matches passes, a missing match keeps the old text", () => {
  assert.deepEqual(checkRequiredPaths(list([e(".github/risk-paths.json"), e(".github/workflows/**")]), [".github/risk-paths.json", CALLER]), []);
  assert.deepEqual(checkRequiredPaths(list([e(".github/workflows/**")]), [".github/risk-paths.json", CALLER]), [
    "no glob matches the required path .github/risk-paths.json",
  ]);
});

test("checkRequiredPaths: a v2 list at L1 or L2 passes", () => {
  assert.deepEqual(checkRequiredPaths(list2([e2(".github/risk-paths.json", "L1"), e2(".github/workflows/**", "L2")]), [".github/risk-paths.json", CALLER]), []);
});

test("checkRequiredPaths: a v2 glob at L3 or L4 on a required path fails", () => {
  const value = list2([e2(".github/risk-paths.json", "L2"), e2(".github/workflows/**", "L3"), e2("**/*.yml", "L4")]);
  assert.deepEqual(checkRequiredPaths(value, [".github/risk-paths.json", CALLER]), [
    `the glob .github/workflows/** matches the required path ${CALLER} at level L3; it must be L1 or L2`,
    `the glob **/*.yml matches the required path ${CALLER} at level L4; it must be L1 or L2`,
  ]);
  assert.deepEqual(checkRequiredPaths(list2([e2("zzz", "L1")]), [CALLER]), [`no glob matches the required path ${CALLER}`]);
});

// ---- GitHub API client ----------------------------------------------------

function response(status, body, headers = {}) {
  return {
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

test("listPullFiles follows Link rel=next over 3 pages", async () => {
  const requests = [];
  const pages = {
    "https://api.example.test/repos/o/r/pulls/5/files?per_page=100": response(200, [{ filename: "a" }], {
      link: '<https://api.example.test/repositories/1/pulls/5/files?per_page=100&page=2>; rel="next", <https://api.example.test/repositories/1/pulls/5/files?per_page=100&page=3>; rel="last"',
    }),
    "https://api.example.test/repositories/1/pulls/5/files?per_page=100&page=2": response(200, [{ filename: "b" }], {
      link: '<https://api.example.test/repositories/1/pulls/5/files?per_page=100&page=1>; rel="prev", <https://api.example.test/repositories/1/pulls/5/files?per_page=100&page=3>; rel="next"',
    }),
    "https://api.example.test/repositories/1/pulls/5/files?per_page=100&page=3": response(200, [{ filename: "c" }], {
      link: '<https://api.example.test/repositories/1/pulls/5/files?per_page=100&page=2>; rel="prev"',
    }),
  };
  const api = createGitHubApi({
    token: "secret-token",
    apiUrl: "https://api.example.test/",
    fetch: async (url, init) => {
      requests.push({ url, init });
      return pages[url] ?? response(500, {});
    },
  });
  const files = await api.listPullFiles("o", "r", 5);
  assert.deepEqual(files.map((file) => file.filename), ["a", "b", "c"]);
  assert.equal(requests.length, 3);
  for (const { init } of requests) {
    assert.equal(init.headers.Authorization, "Bearer secret-token");
    assert.equal(init.headers["X-GitHub-Api-Version"], "2022-11-28");
    assert.ok(init.headers["User-Agent"]);
  }
});

test("listPullFiles refuses a next link to another host", async () => {
  const api = createGitHubApi({
    token: "t",
    apiUrl: "https://api.example.test",
    fetch: async () => response(200, [], { link: '<https://evil.test/x>; rel="next"' }),
  });
  await assert.rejects(api.listPullFiles("o", "r", 1), /leaves the API host/);
});

test("getFileAtRef reads raw content at the ref and gives null on 404", async () => {
  const requests = [];
  const api = createGitHubApi({
    token: "t",
    apiUrl: "https://api.example.test",
    fetch: async (url, init) => {
      requests.push({ url, init });
      return url.includes("missing") ? response(404, {}) : response(200, '{"x":1}');
    },
  });
  assert.equal(await api.getFileAtRef("o", "r", ".github/risk-paths.json", BASE_SHA), '{"x":1}');
  assert.equal(requests[0].url, `https://api.example.test/repos/o/r/contents/.github/risk-paths.json?ref=${BASE_SHA}`);
  assert.equal(requests[0].init.headers.Accept, "application/vnd.github.raw+json");
  assert.equal(await api.getFileAtRef("o", "r", "missing.json", BASE_SHA), null);
});

test("labelExists URL-encodes the label name and maps 404 to false", async () => {
  const urls = [];
  let status = 200;
  const api = createGitHubApi({
    token: "t",
    apiUrl: "https://api.example.test",
    fetch: async (url) => {
      urls.push(url);
      return response(status, {});
    },
  });
  assert.equal(await api.labelExists("o", "r", "risk:high"), true);
  assert.equal(urls[0], "https://api.example.test/repos/o/r/labels/risk%3Ahigh");
  status = 404;
  assert.equal(await api.labelExists("o", "r", "risk:high"), false);
});

test("addLabels posts to the issues labels API; other errors throw without the token", async () => {
  const requests = [];
  let status = 200;
  const api = createGitHubApi({
    token: "secret-token",
    apiUrl: "https://api.example.test",
    fetch: async (url, init) => {
      requests.push({ url, init });
      return response(status, {});
    },
  });
  await api.addLabels("o", "r", 9, ["risk:high"]);
  assert.equal(requests[0].url, "https://api.example.test/repos/o/r/issues/9/labels");
  assert.equal(requests[0].init.method, "POST");
  assert.deepEqual(JSON.parse(requests[0].init.body), { labels: ["risk:high"] });
  status = 403;
  await assert.rejects(api.addLabels("o", "r", 9, ["risk:high"]), (error) => {
    assert.match(error.message, /POST \/repos\/o\/r\/issues\/9\/labels failed: HTTP 403/);
    assert.ok(!error.message.includes("secret-token"));
    return true;
  });
  status = 404;
  await assert.rejects(api.addLabels("o", "r", 9, ["risk:high"]), /HTTP 404/);
});

// ---- Workflows ------------------------------------------------------------

const workflowPath = path.join(repoRoot, ".github/workflows/pr-triage.yml");
const libraryPath = path.join(repoRoot, "scripts/lib/risk-paths.mjs");
const triageLibraryPath = path.join(repoRoot, "scripts/lib/pr-triage.mjs");

test("the reusable workflow embeds the library verbatim, with no trailer", async () => {
  const [workflow, library] = await Promise.all([readFile(workflowPath, "utf8"), readFile(libraryPath, "utf8")]);
  assert.equal(syncWorkflow(workflow, library, RISK_PATHS_BLOCK), workflow);
  const lines = workflow.split("\n");
  const start = lines.indexOf(RISK_PATHS_BLOCK.startLine);
  const end = lines.indexOf(RISK_PATHS_BLOCK.endLine, start + 1);
  assert.ok(start !== -1 && end > start);
  const embedded = lines.slice(start + 1, end).map((line) => line.replace(/^ {10}/, "")).join("\n");
  assert.equal(embedded, library.replace(/\n$/, ""));
  assert.deepEqual(renderBlock(library, RISK_PATHS_BLOCK), lines.slice(start + 1, end));
});

test("the library has no static import and no expression or heredoc marker", async () => {
  const library = await readFile(libraryPath, "utf8");
  assert.ok(!/^\s*import\s/m.test(library));
  assert.ok(!library.includes("${{"));
  assert.ok(!library.split("\n").includes("RISK_PATHS_EOF"));
});

test("the risk-paths library never reads the head SHA, the head ref or the merge ref", async () => {
  const library = await readFile(libraryPath, "utf8");
  assert.ok(!/head\.sha|head\.ref|head_ref|refs\/pull|merge_commit_sha|\/merge\b/.test(library));
});

// ---- Gate -----------------------------------------------------------------

async function gateFixture(value) {
  const root = await mkdtemp(path.join(os.tmpdir(), "core-risk-paths-gate-"));
  await mkdir(path.join(root, ".github"), { recursive: true });
  await writeFile(path.join(root, ".github/risk-paths.json"), typeof value === "string" ? value : JSON.stringify(value, null, 2));
  return root;
}

function runGate(root) {
  return execFileAsync(process.execPath, [checkScript, "--root", root], { cwd: root });
}

test("check-risk-paths passes on the repository", async () => {
  const { stdout } = await runGate(repoRoot);
  assert.match(stdout, /ok {3}risk_paths: \d+ entries, workflow in sync/);
});

test("core's list puts each script that applies rulesets, settings or labels at L1", async () => {
  // A merge can drop a list entry without a conflict; this test names the
  // scripts that change GitHub settings so that a dropped entry fails.
  const list = parseStrictJson(await readFile(path.join(repoRoot, ".github/risk-paths.json"), "utf8"));
  assert.equal(validateRiskPaths(list).ok, true);
  for (const script of [
    "scripts/apply-repo-settings.sh",
    "scripts/apply-triage-settings.sh",
    "scripts/rollout-merge-queue.sh",
    "scripts/sync-skills.sh",
  ]) {
    const result = levelOfFile(list, script);
    assert.equal(result.level, "L1", `${script} is ${result.level} (${result.source})`);
    assert.equal(result.source, "glob", `${script} needs its own list entry`);
  }
});

test("check-risk-paths passes on a valid fixture list", async () => {
  const root = await gateFixture(validList());
  const { stdout } = await runGate(root);
  assert.match(stdout, /ok {3}risk_paths: 3 entries/);
});

test("check-risk-paths passes on a v2 fixture list", async () => {
  const root = await gateFixture(validList2());
  const { stdout } = await runGate(root);
  assert.match(stdout, /ok {3}risk_paths: 3 entries/);
});

test("check-risk-paths fails on a v2 list with the caller at L3", async () => {
  const root = await gateFixture(
    list2([e2(".github/risk-paths.json", "L2"), e2(".github/workflows/**", "L3", "workflows")]),
  );
  await assert.rejects(runGate(root), (error) =>
    error.stderr.includes(
      `the glob .github/workflows/** matches the required path .github/workflows/risk-paths-caller.yml at level L3; it must be L1 or L2`,
    ),
  );
});

test("check-risk-paths fails on an invalid list", async () => {
  const root = await gateFixture({ schema_version: 1, paths: [{ glob: "a**", why: "x" }] });
  await assert.rejects(runGate(root), (error) => error.stderr.includes("paths[0].glob"));
});

test("check-risk-paths fails on a duplicate JSON key", async () => {
  const root = await gateFixture('{"schema_version":1,"paths":[],"paths":[]}');
  await assert.rejects(runGate(root), (error) => error.stderr.includes("duplicate key"));
});

test("check-risk-paths fails on a list without .github/risk-paths.json", async () => {
  const root = await gateFixture(list([{ glob: ".github/workflows/**", why: "governance" }]));
  await assert.rejects(runGate(root), (error) => error.stderr.includes("no glob matches the required path .github/risk-paths.json"));
});

test("check-risk-paths fails on a list without the caller", async () => {
  const root = await gateFixture(list([{ glob: ".github/risk-paths.json", why: "governance" }]));
  await assert.rejects(runGate(root), (error) =>
    error.stderr.includes("no glob matches the required path .github/workflows/risk-paths-caller.yml"),
  );
});

async function driftFixture() {
  const root = await gateFixture(validList());
  await mkdir(path.join(root, "scripts/lib"), { recursive: true });
  await mkdir(path.join(root, ".github/workflows"), { recursive: true });
  await writeFile(path.join(root, "scripts/lib/risk-paths.mjs"), await readFile(libraryPath, "utf8"));
  await writeFile(path.join(root, "scripts/lib/pr-triage.mjs"), await readFile(triageLibraryPath, "utf8"));
  await writeFile(path.join(root, ".github/workflows/pr-triage.yml"), await readFile(workflowPath, "utf8"));
  return root;
}

test("check-risk-paths passes on a fixture whose copies are in sync", async () => {
  const { stdout } = await runGate(await driftFixture());
  assert.match(stdout, /workflow in sync/);
});

test("check-risk-paths fails when the risk-paths copy drifts", async () => {
  const root = await driftFixture();
  await writeFile(path.join(root, "scripts/lib/risk-paths.mjs"), `${await readFile(libraryPath, "utf8")}// drift\n`);
  await assert.rejects(runGate(root), (error) => {
    assert.ok(error.stderr.includes("does not embed the current scripts/lib/risk-paths.mjs"));
    assert.ok(!error.stderr.includes("current scripts/lib/pr-triage.mjs"));
    return true;
  });
});

test("check-risk-paths fails when the pr-triage copy drifts", async () => {
  const root = await driftFixture();
  await writeFile(path.join(root, "scripts/lib/pr-triage.mjs"), `${await readFile(triageLibraryPath, "utf8")}// drift\n`);
  await assert.rejects(runGate(root), (error) => {
    assert.ok(error.stderr.includes("does not embed the current scripts/lib/pr-triage.mjs"));
    assert.ok(!error.stderr.includes("current scripts/lib/risk-paths.mjs"));
    return true;
  });
});
