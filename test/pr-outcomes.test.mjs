import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  escapedDefects,
  findReverts,
  namesAsFixed,
  normalizeChanges,
  parseReferences,
  prCommitNumber,
} from "../scripts/lib/pr-outcomes.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(repoRoot, "scripts/pr-outcomes.mjs");
const { fetchChanges } = await import(cli);

const tempFolders = [];
test.after(async () => {
  for (const folder of tempFolders) await rm(folder, { recursive: true, force: true });
});

function pr(repository, number, title, mergedAt, { body = "", author = "frostyard-machines" } = {}) {
  return { repository, kind: "pr", number, title, body, mergedAt, author };
}

function commit(repository, sha, title, mergedAt, { body = "", author = "someone" } = {}) {
  return { repository, kind: "commit", sha, title, body, mergedAt, author };
}

// bketelsen/fleet#99: the hand-written revert the rule before 2026-11-05
// missed. It has no "Reverts" line; the revert is in the title only.
const FLEET_94 = pr("bketelsen/fleet", 94, "Escape regex backslashes in Jinja string literals", "2026-10-28T19:51:51Z");
const FLEET_99 = pr(
  "bketelsen/fleet",
  99,
  "Revert #94: Ansible 2.19 keeps \\ in Jinja literals (breaks Team VM preview)",
  "2026-10-29T01:50:45Z",
  { body: "**Urgent revert.** PR #94 broke the regexes it touched when Ansible renders them." },
);

const WINDOW = { from: "2026-10-01T00:00:00Z", to: "2026-11-01T00:00:00Z", asOf: "2026-11-08T00:00:00Z" };

function escaped(changes, options = {}) {
  return escapedDefects(changes, { ...WINDOW, ...options });
}

// --- References and commit subjects --------------------------------------

test("references: the 3 forms, lower-case repositories, and no reference after a letter, digit, / or &", () => {
  assert.deepEqual(parseReferences("Reverts frostyard/core#12", "bketelsen/fleet"), [
    { repository: "frostyard/core", number: 12, index: 8, length: 17 },
  ]);
  assert.deepEqual(parseReferences("Reverts Frostyard/Core#12", "bketelsen/fleet"), [
    { repository: "frostyard/core", number: 12, index: 8, length: 17 },
  ]);
  assert.deepEqual(parseReferences("see https://github.com/Frostyard/Core/pull/7 for it", "bketelsen/fleet"), [
    { repository: "frostyard/core", number: 7, index: 4, length: 40 },
  ]);
  assert.deepEqual(parseReferences("Reverts #94.", "Bketelsen/Fleet"), [
    { repository: "bketelsen/fleet", number: 94, index: 8, length: 3 },
  ]);

  // 1 reference of the owner/name form is 1 reference, never also a "#N".
  assert.deepEqual(parseReferences("frostyard/updex#12", "frostyard/core").map((ref) => ref.repository), ["frostyard/updex"]);

  for (const text of ["abc#12", "a1#12", "x/#12", "&#12", "a/b/c#12"]) {
    assert.deepEqual(parseReferences(text, "bketelsen/fleet"), [], text);
  }
});

test("prCommitNumber reads the squash subject and the merge commit subject only", () => {
  assert.equal(prCommitNumber("fix: escape the regex (#94)"), 94);
  assert.equal(prCommitNumber("Merge pull request #94 from frostyard/fix-regex"), 94);
  assert.equal(prCommitNumber("Revert #94: keep the backslash"), null);
  assert.equal(prCommitNumber("(#94) is not at the end"), null);
  assert.equal(prCommitNumber("Merge pull request #"), null);
  assert.equal(prCommitNumber("x Merge pull request #94"), null);
  assert.equal(prCommitNumber(""), null);
});

// --- normalizeChanges -----------------------------------------------------

test("normalizeChanges lower-cases, dates, and drops a PR's own commit", () => {
  const normalized = normalizeChanges([
    { repository: "Bketelsen/Fleet", kind: "pr", number: 94, title: "T", body: null, mergedAt: "2026-10-28T19:51:51Z", author: { login: "Frostyard-Machines" } },
    commit("bketelsen/fleet", "a".repeat(40), "fix: escape (#94)", "2026-10-29T00:00:00Z"),
    commit("bketelsen/fleet", "b".repeat(40), "Merge pull request #94 from frostyard/fix", "2026-10-29T00:00:00Z"),
    commit("bketelsen/fleet", "c".repeat(40), "Revert \"X\"", "2026-10-29T00:00:00Z", { author: { login: "Frostyard-Machines" } }),
  ]);

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].repository, "bketelsen/fleet");
  assert.equal(normalized[0].author, "frostyard-machines");
  assert.equal(normalized[0].body, "");
  assert.equal(normalized[0].mergedAt instanceof Date, true);
  assert.equal(normalized[0].mergedAt.toISOString(), "2026-10-28T19:51:51.000Z");
  assert.equal(normalized[1].title, 'Revert "X"');
  assert.equal(normalized[1].sha, "c".repeat(40));
});

// --- The fleet#99 vector --------------------------------------------------

test("fleet#99 reverts fleet#94 by the title rule", () => {
  const reverts = findReverts([FLEET_94, FLEET_99]);
  assert.equal(reverts.length, 1);
  assert.equal(reverts[0].reverted.repository, "bketelsen/fleet");
  assert.equal(reverts[0].reverted.number, 94);
  assert.equal(reverts[0].reverted.title, FLEET_94.title);
  assert.equal(reverts[0].by.kind, "pr");
  assert.equal(reverts[0].by.number, 99);
  assert.equal(reverts[0].rule, "title");
  assert.equal(reverts[0].evidence, FLEET_99.title);
});

test("fleet#94 is 1 escape over a complete cohort, whatever matched from where", () => {
  const result = escaped([FLEET_94, FLEET_99]);
  assert.equal(result.complete, true);
  assert.equal(result.merged, 2);
  assert.equal(result.escaped, 1);
  assert.equal(result.rate, 0.5);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].repository, "bketelsen/fleet");
  assert.equal(result.items[0].number, 94);
  assert.equal(result.items[0].mergedAt.toISOString(), "2026-10-28T19:51:51.000Z");
  // 1 pair with fleet#99: it reverts 94 by title, and its body ("PR #94 broke
  // the regexes ...") also names 94 as fixed.
  assert.equal(result.items[0].by.length, 2);
  assert.deepEqual(result.items[0].by[0], {
    repository: "bketelsen/fleet",
    kind: "pr",
    number: 99,
    kind_of_match: "revert",
    rule: "title",
    evidence: FLEET_99.title,
    title: FLEET_99.title,
  });
  assert.equal(result.items[0].by[1].kind_of_match, "fix");
  assert.equal(result.items[0].by[1].rule, "body");
  assert.equal(result.items[0].by[1].evidence, "**Urgent revert.** PR #94 broke the regexes it touched when Ansible renders them.");
});

// --- Rules 1, 2 and 3 ----------------------------------------------------

test("rule 1: the GitHub button quoted title alone, and with a body line", () => {
  const target = pr("frostyard/core", 12, "Fix the flag", "2026-10-02T00:00:00Z");
  const alone = pr("frostyard/core", 20, 'Revert "Fix the flag"', "2026-10-03T00:00:00Z");
  assert.equal(findReverts([target, alone])[0].rule, "quoted-title");

  const withBody = pr("frostyard/core", 21, 'Revert "Fix the flag"', "2026-10-03T00:00:00Z", {
    body: "Reverts frostyard/core#12",
  });
  const reverts = findReverts([target, withBody]);
  assert.equal(reverts.length, 1);
  assert.equal(reverts[0].rule, "quoted-title");
  assert.equal(reverts[0].evidence, 'Revert "Fix the flag"');
});

test("rule 3 alone: a body line with the revert word before the reference", () => {
  const target = pr("frostyard/core", 12, "Fix the flag", "2026-10-02T00:00:00Z");
  const change = pr("frostyard/core", 20, "Undo the flag change", "2026-10-03T00:00:00Z", {
    body: "Some context.\n\nReverts frostyard/core#12\n",
  });
  const reverts = findReverts([target, change]);
  assert.equal(reverts.length, 1);
  assert.equal(reverts[0].rule, "body");
  assert.equal(reverts[0].evidence, "Reverts frostyard/core#12");
});

test("rule 1 with the squash subject: Revert \"X (#94)\"", () => {
  const target = pr("frostyard/core", 94, "X", "2026-10-02T00:00:00Z");
  const change = pr("frostyard/core", 95, 'Revert "X (#94)"', "2026-10-03T00:00:00Z");
  const reverts = findReverts([target, change]);
  assert.equal(reverts.length, 1);
  assert.equal(reverts[0].rule, "quoted-title");
  assert.equal(reverts[0].reverted.number, 94);
});

test("rule 2 across repositories: revert: undo frostyard/updex#12", () => {
  const target = pr("frostyard/updex", 12, "Change the default flag", "2026-10-02T00:00:00Z");
  const change = pr("frostyard/core", 30, "revert: undo frostyard/updex#12", "2026-10-03T00:00:00Z");
  const reverts = findReverts([target, change]);
  assert.equal(reverts.length, 1);
  assert.equal(reverts[0].reverted.repository, "frostyard/updex");
  assert.equal(reverts[0].reverted.number, 12);
  assert.equal(reverts[0].rule, "title");
});

test("negative: a revert word with no reference, a closed PR number, an early revert, a self-reference", () => {
  const target = pr("frostyard/core", 12, "Fix the flag", "2026-10-02T00:00:00Z");
  const noReference = pr("frostyard/core", 20, "Revert the flag change", "2026-10-03T00:00:00Z");
  assert.deepEqual(findReverts([target, noReference]), []);

  const otherNumber = pr("frostyard/core", 21, "Revert #77", "2026-10-03T00:00:00Z");
  assert.deepEqual(findReverts([target, otherNumber]), []);

  const early = pr("frostyard/core", 22, "Revert #12", "2026-10-01T00:00:00Z");
  assert.deepEqual(findReverts([target, early]), []);

  const itself = pr("frostyard/core", 12, "Revert #12", "2026-10-02T00:00:00Z");
  assert.deepEqual(findReverts([itself]), []);
});

test("negative: #94 after a letter or & is no reference; a reference before the revert word is no body revert", () => {
  const target = pr("frostyard/core", 94, "X", "2026-10-02T00:00:00Z");
  assert.deepEqual(findReverts([target, pr("frostyard/core", 95, "Revert a#94", "2026-10-03T00:00:00Z")]), []);
  assert.deepEqual(findReverts([target, pr("frostyard/core", 96, "Revert &#94", "2026-10-03T00:00:00Z")]), []);
  const referenceFirst = pr("frostyard/core", 97, "Undo the change", "2026-10-03T00:00:00Z", {
    body: "#94 is reverted here",
  });
  assert.deepEqual(findReverts([target, referenceFirst]), []);
});

test("negative: a cross-repository #N resolves to the change's own repository", () => {
  const target = pr("frostyard/core", 94, "X", "2026-10-02T00:00:00Z");
  const change = pr("frostyard/other", 95, "Revert #94", "2026-10-03T00:00:00Z");
  assert.deepEqual(findReverts([target, change]), []);
});

// --- Names P as fixed ----------------------------------------------------

function fixLine(line, repository = "frostyard/core", number = 94) {
  return namesAsFixed(pr(repository, 95, line, "2026-10-03T00:00:00Z"), { repository, number });
}

test("fix-name vectors: the 4 positive lines name #94", () => {
  assert.equal(fixLine("fix: escape the regex broken by #94"), "fix: escape the regex broken by #94");
  assert.equal(fixLine("Fixes #94"), "Fixes #94");
  assert.equal(fixLine("PR #94 broke the regexes"), "PR #94 broke the regexes");
  assert.equal(fixLine("fix(#94): restore the flag"), "fix(#94): restore the flag");
});

test("fix-name vectors: a sentence end or more than 3 words between breaks the match", () => {
  assert.equal(fixLine("Fixes the typo. #94 adds a flag"), null);
  assert.equal(fixLine("Fixes #12 and builds on top of #94"), null);
  assert.equal(fixLine("fix the one two three #94"), null);
  assert.equal(fixLine("fix the one two #94"), "fix the one two #94");
});

test("fix-name lines are read in the body too, and another repository does not match", () => {
  const change = pr("frostyard/core", 95, "Restore the flag", "2026-10-03T00:00:00Z", {
    body: "Context.\n\nFixes #94\n",
  });
  assert.equal(namesAsFixed(change, { repository: "frostyard/core", number: 94 }), "Fixes #94");
  assert.equal(namesAsFixed(change, { repository: "frostyard/other", number: 94 }), null);
  assert.equal(namesAsFixed(commit("frostyard/core", "d".repeat(40), "fix: escape (#94)", "2026-10-03T00:00:00Z"), { repository: "frostyard/core", number: 94 }), null);
});

// --- Windows and cohort bounds ------------------------------------------

test("escape window: 7 days exactly counts, 1 ms later does not, and before P does not", () => {
  const merged = "2026-10-15T00:00:00Z";
  const target = pr("frostyard/core", 12, "Fix the flag", merged);

  const exactly = escaped([target, pr("frostyard/core", 20, "Revert #12", "2026-10-22T00:00:00.000Z")]);
  assert.equal(exactly.escaped, 1);

  const oneMsLate = escaped([target, pr("frostyard/core", 20, "Revert #12", "2026-10-22T00:00:00.001Z")]);
  assert.equal(oneMsLate.escaped, 0);

  const before = escaped([target, pr("frostyard/core", 20, "Revert #12", "2026-10-14T00:00:00Z")]);
  assert.equal(before.escaped, 0);
});

test("cohort window: a PR at from is in, a PR at to is out, and the author filter is case-insensitive", () => {
  const atFrom = pr("frostyard/core", 1, "First", "2026-10-01T00:00:00Z", { author: "Frostyard-Machines" });
  const atTo = pr("frostyard/core", 2, "Last", "2026-11-01T00:00:00Z");
  const result = escaped([atFrom, atTo]);
  assert.equal(result.merged, 1);
  assert.equal(result.items.length, 0);

  const another = pr("frostyard/core", 3, "Third", "2026-10-02T00:00:00Z", { author: "someone" });
  assert.equal(escaped([another]).merged, 0);
});

test("a change by another author still escapes a cohort PR", () => {
  const target = pr("frostyard/core", 12, "Fix the flag", "2026-10-02T00:00:00Z");
  const fix = pr("frostyard/other", 40, "Restore the flag", "2026-10-03T00:00:00Z", {
    author: "bketelsen",
    body: "Fixes frostyard/core#12",
  });
  const result = escaped([target, fix]);
  assert.equal(result.merged, 1);
  assert.equal(result.escaped, 1);
  assert.equal(result.items[0].by[0].kind_of_match, "fix");
  assert.equal(result.items[0].by[0].rule, "body");
  assert.equal(result.items[0].by[0].repository, "frostyard/other");
  assert.equal(result.items[0].by[0].number, 40);
});

test("an incomplete cohort has no rate until to + 7 days", () => {
  const target = pr("frostyard/core", 12, "Fix the flag", "2026-10-02T00:00:00Z");
  const revert = pr("frostyard/core", 20, "Revert #12", "2026-10-03T00:00:00Z", { author: "bketelsen" });

  const incomplete = escaped([target, revert], { asOf: "2026-11-07T23:59:59.999Z" });
  assert.equal(incomplete.complete, false);
  assert.equal(incomplete.rate, null);
  assert.equal(incomplete.escaped, 1);

  const complete = escaped([target, revert], { asOf: "2026-11-08T00:00:00Z" });
  assert.equal(complete.complete, true);
  assert.equal(complete.rate, 1);

  const empty = escaped([], {});
  assert.equal(empty.merged, 0);
  assert.equal(empty.rate, null);
});

test("an escaped PR with 2 fixing changes counts once and names both", () => {
  const target = pr("frostyard/core", 12, "Fix the flag", "2026-10-02T00:00:00Z");
  const first = pr("frostyard/core", 20, "Repair the flag", "2026-10-03T00:00:00Z", { body: "Fixes #12", author: "bketelsen" });
  const second = pr("frostyard/core", 21, "revert: undo #12", "2026-10-04T00:00:00Z", { author: "bketelsen" });
  const result = escaped([target, first, second]);
  assert.equal(result.merged, 1);
  assert.equal(result.escaped, 1);
  assert.equal(result.rate, 1);
  assert.equal(result.items[0].by.length, 2);
  assert.deepEqual(result.items[0].by.map((match) => [match.number, match.kind_of_match, match.rule]), [
    [20, "fix", "body"],
    [21, "revert", "title"],
  ]);
});

test("a commit that is a PR's squash commit is no change; a direct commit revert is", () => {
  const squash = commit("bketelsen/fleet", "a".repeat(40), "fix: escape (#94)", "2026-10-29T00:00:00Z", {
    body: "Fixes #94",
  });
  const result = escaped([FLEET_94, squash]);
  assert.equal(result.items.length, 0);

  const direct = commit("bketelsen/fleet", "b".repeat(40), 'Revert "X"', "2026-10-29T00:00:00Z", {
    body: "This reverts #94.",
  });
  const reverts = findReverts([FLEET_94, direct]);
  assert.equal(reverts.length, 1);
  assert.equal(reverts[0].rule, "body");
  assert.equal(reverts[0].by.kind, "commit");
  assert.equal(reverts[0].by.sha, "b".repeat(40));

  const viaCommit = escaped([FLEET_94, direct]);
  assert.equal(viaCommit.escaped, 1);
  assert.equal(viaCommit.items[0].by[0].kind, "commit");
  assert.equal(viaCommit.items[0].by[0].sha, "b".repeat(40));
});

test("repositories limits the cohort, not the changes that escape it", () => {
  const inside = pr("frostyard/core", 12, "Fix the flag", "2026-10-02T00:00:00Z");
  const outside = pr("frostyard/other", 13, "Fix the thing", "2026-10-02T00:00:00Z");
  const revert = pr("bketelsen/fleet", 20, "Revert frostyard/core#12", "2026-10-03T00:00:00Z");
  const result = escaped([inside, outside, revert], { repositories: ["frostyard/core"] });
  assert.equal(result.merged, 1);
  assert.equal(result.escaped, 1);
  assert.deepEqual(result.repositories, ["frostyard/core"]);
});

// --- Reads through gh ----------------------------------------------------

test("fetch: the PR search and the commits API use the window, and 1000 PRs is an error", async () => {
  const calls = [];
  // --slurp: 1 array of pages. The second page's message holds "] [", which
  // a split of back-to-back pages would break.
  const commitBody = JSON.stringify([[{
    sha: "a".repeat(40),
    commit: {
      message: 'Revert "X"\n\nThis reverts #94.\n',
      committer: { date: "2026-10-29T01:50:45Z" },
      author: { name: "Frostyard Machines" },
    },
    author: null,
  }], [{
    sha: "b".repeat(40),
    commit: {
      message: "docs: tick [x] [y]\n\n]\n[",
      committer: { date: "2026-10-30T00:00:00Z" },
      author: { name: "Frostyard Machines" },
    },
    author: { login: "frostyard-machines" },
  }]]);
  const exec = async (args) => {
    calls.push(args);
    if (args[0] === "pr") {
      return JSON.stringify([{ number: 94, title: "Escape regex backslashes", body: null, mergedAt: "2026-10-28T19:51:51Z", author: { login: "frostyard-machines" } }]);
    }
    if (args[0] === "api") return commitBody;
    throw new Error(`unexpected: ${args.join(" ")}`);
  };

  const changes = await fetchChanges({
    repositories: ["bketelsen/fleet"],
    from: new Date("2026-10-01T00:00:00Z"),
    to: new Date("2026-11-08T00:00:00Z"),
    exec,
  });

  assert.deepEqual(calls[0], [
    "pr", "list", "--repo", "bketelsen/fleet", "--state", "merged", "--limit", "1000",
    "--search", "merged:2026-10-01T00:00:00Z..2026-11-08T00:00:00Z",
    "--json", "number,title,body,mergedAt,author",
  ]);
  assert.deepEqual(calls[1], [
    "api", "--paginate", "--slurp", "repos/bketelsen/fleet/commits?since=2026-10-01T00:00:00Z&until=2026-11-08T00:00:00Z&per_page=100",
  ]);

  const normalized = normalizeChanges(changes);
  assert.equal(normalized.length, 3);
  assert.equal(normalized[2].title, "docs: tick [x] [y]");
  assert.equal(normalized[1].title, 'Revert "X"');
  assert.equal(normalized[1].body, "This reverts #94.\n");
  assert.equal(normalized[1].author, "frostyard machines");
  assert.equal(findReverts(normalized).length, 1);

  const truncatedExec = async (args) => {
    if (args[0] === "pr") {
      return JSON.stringify(Array.from({ length: 1000 }, (_, index) => ({ number: index + 1, title: "t", body: null, mergedAt: "2026-10-05T00:00:00Z", author: { login: "frostyard-machines" } })));
    }
    return "[]";
  };
  await assert.rejects(
    fetchChanges({ repositories: ["bketelsen/fleet"], from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-11-08T00:00:00Z"), exec: truncatedExec }),
    /truncated/,
  );
});

// --- The CLI -------------------------------------------------------------

async function fixtureFile(changes) {
  const folder = await mkdtemp(path.join(os.tmpdir(), "pr-outcomes-"));
  tempFolders.push(folder);
  const file = path.join(folder, "changes.json");
  await writeFile(file, JSON.stringify(changes), "utf8");
  return file;
}

test("CLI: escaped --input --json prints the result object", async () => {
  const file = await fixtureFile([FLEET_94, FLEET_99]);
  const { stdout } = await execFileAsync(process.execPath, [
    cli, "escaped", "--input", file, "--from", WINDOW.from, "--to", WINDOW.to, "--as-of", WINDOW.asOf, "--json",
  ], { cwd: repoRoot });

  const parsed = JSON.parse(stdout);
  assert.equal(parsed.complete, true);
  assert.equal(parsed.from, "2026-10-01T00:00:00.000Z");
  assert.equal(parsed.to, "2026-11-01T00:00:00.000Z");
  assert.equal(parsed.as_of, "2026-11-08T00:00:00.000Z");
  assert.equal(parsed.merged, 2);
  assert.equal(parsed.escaped, 1);
  assert.equal(parsed.rate, 0.5);
  assert.deepEqual(parsed.authors, ["frostyard-machines"]);
  assert.equal(parsed.repositories, null);
  assert.equal(parsed.items[0].mergedAt, "2026-10-28T19:51:51.000Z");
  assert.equal(parsed.items[0].by[0].number, 99);
  assert.equal(parsed.items[0].by[0].kind_of_match, "revert");
});

test("CLI: text output names the window, the rate and the evidence, with no control characters", async () => {
  const noisy = pr("bketelsen/fleet", 100, "Revert #94: \u001b[31mred\u001b[0m", "2026-10-29T02:00:00Z", { author: "bketelsen" });
  const file = await fixtureFile([FLEET_94, noisy]);
  const { stdout } = await execFileAsync(process.execPath, [
    cli, "escaped", "--input", file, "--from", WINDOW.from, "--to", WINDOW.to, "--as-of", WINDOW.asOf,
  ], { cwd: repoRoot });

  assert.match(stdout, /Escaped defects: 2026-10-01T00:00:00\.000Z \.\. 2026-11-01T00:00:00\.000Z/);
  assert.match(stdout, /Cohort complete/);
  assert.match(stdout, /Merged: 1; escaped: 1; rate: 1/);
  assert.match(stdout, /- bketelsen\/fleet#94 "Escape regex backslashes in Jinja string literals"/);
  assert.match(stdout, /revert by bketelsen\/fleet#100 \(pr\), title: Revert #94: /);
  assert.equal(stdout.includes("\u001b"), false);

  const incomplete = await execFileAsync(process.execPath, [
    cli, "escaped", "--input", file, "--from", WINDOW.from, "--to", WINDOW.to, "--as-of", "2026-11-01T00:00:00Z",
  ], { cwd: repoRoot });
  assert.match(incomplete.stdout, /incomplete: escapes are not final until 2026-11-08T00:00:00\.000Z/);
  assert.match(incomplete.stdout, /rate: no rate \(incomplete cohort\)/);
});

test("CLI: reverts --input lists the revert, and a usage error exits 2", async () => {
  const file = await fixtureFile([FLEET_94, FLEET_99]);
  const { stdout } = await execFileAsync(process.execPath, [
    cli, "reverts", "--input", file, "--since", "2026-10-01T00:00:00Z",
  ], { cwd: repoRoot });
  assert.match(stdout, /Reverts found: 1/);
  assert.match(stdout, /- bketelsen\/fleet#99 \(pr\) reverts bketelsen\/fleet#94/);

  const json = await execFileAsync(process.execPath, [
    cli, "reverts", "--input", file, "--since", "2026-10-01T00:00:00Z", "--json",
  ], { cwd: repoRoot });
  assert.equal(JSON.parse(json.stdout).reverts[0].rule, "title");

  for (const argv of [
    ["escaped", "--input", file, "--from", "2026-10-01T00:00:00Z"],
    ["escaped", "--input", file, "--from", "2026-11-01T00:00:00Z", "--to", "2026-10-01T00:00:00Z"],
    ["reverts", "--since", "not-a-date"],
    ["reverts", "--since", "2026-10-01T00:00:00Z"],
    ["reverts", "--input", file, "--since", "2026-10-01T00:00:00Z", "--from", "2026-10-01T00:00:00Z"],
    ["outcomes"],
  ]) {
    await assert.rejects(execFileAsync(process.execPath, [cli, ...argv], { cwd: repoRoot }), (error) => {
      assert.equal(error.code, 2, argv.join(" "));
      assert.match(error.stderr, /^Usage: node scripts\/pr-outcomes\.mjs/m, argv.join(" "));
      return true;
    });
  }
});
