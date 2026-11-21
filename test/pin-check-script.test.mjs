import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// ADR-0090: the online check script of the ADR, read from the ADR itself and
// run offline against stand-ins for `git ls-remote` and `gh api .../compare`.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adr = path.join(root, "docs/adr/0090-scope-action-pins-and-check-them-repository-wide.md");

function adrScript() {
  const blocks = [...readFileSync(adr, "utf8").matchAll(/^```bash\n([\s\S]*?)^```$/gm)].map((m) => m[1]);
  const scripts = blocks.filter((block) => block.startsWith("#!/usr/bin/env bash\n"));
  assert.equal(scripts.length, 1, "ADR-0090 has exactly 1 bash script block");
  return scripts[0];
}

// git: answers `ls-remote URL REF...` from $PIN_FIXTURE lines `tag URL REF SHA`,
// in argument order, as git does for a tag and its peeled ^{} entry.
const fakeGit = `#!/usr/bin/env bash
[[ $1 == ls-remote ]] || exit 2
url=$2; shift 2
for ref in "$@"; do
  awk -v u="$url" -v r="$ref" '$1 == "tag" && $2 == u && $3 == r { print $4 "\\t" $3 }' "$PIN_FIXTURE"
done
`;

// gh: answers `api repos/O/R/compare/B...S --jq .status` from $PIN_FIXTURE
// lines `compare O/R B S STATUS`; any other comparison fails, as a 404 does.
const fakeGh = `#!/usr/bin/env bash
[[ $1 == api && $3 == --jq && $4 == .status ]] || exit 2
spec=\${2#repos/}
repo=$(cut -d/ -f1-2 <<<"$spec")
range=\${spec#"$repo"/compare/}
base=\${range%%...*}
head=\${range#*...}
out=$(awk -v r="$repo" -v b="$base" -v h="$head" '$1 == "compare" && $2 == r && $3 == b && $4 == h { print $5 }' "$PIN_FIXTURE")
[[ -n $out ]] || { echo "gh: Not Found (HTTP 404)" >&2; exit 1; }
echo "$out"
`;

const A = "a".repeat(40);
const B = "b".repeat(40);
const C = "c".repeat(40);
const D = "d".repeat(40);

function run({ workflows = {}, actions = {}, fixture = [] }) {
  const dir = mkdtempSync(path.join(tmpdir(), "pin-check-"));
  try {
    const bin = path.join(dir, "bin");
    const repo = path.join(dir, "repo");
    mkdirSync(bin);
    for (const [name, body] of [["git", fakeGit], ["gh", fakeGh]]) {
      writeFileSync(path.join(bin, name), body);
      chmodSync(path.join(bin, name), 0o755);
    }
    for (const [sub, files] of [[".github/workflows", workflows], [".github/actions", actions]]) {
      for (const [name, text] of Object.entries(files)) {
        mkdirSync(path.dirname(path.join(repo, sub, name)), { recursive: true });
        writeFileSync(path.join(repo, sub, name), text);
      }
    }
    mkdirSync(path.join(repo, ".github/workflows"), { recursive: true });
    writeFileSync(path.join(dir, "fixture"), fixture.join("\n") + "\n");
    writeFileSync(path.join(dir, "check.sh"), adrScript());
    const result = spawnSync("bash", [path.join(dir, "check.sh")], {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, PIN_FIXTURE: path.join(dir, "fixture") },
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const steps = (...lines) => `jobs:\n  j:\n    steps:\n${lines.map((l) => `      - ${l}\n`).join("")}`;
const url = (repo) => `https://github.com/${repo}`;

test("a # vX.Y.Z pin passes when its tag names the SHA, lightweight or annotated", () => {
  const out = run({
    workflows: { "a.yml": steps(`uses: actions/checkout@${A} # v7.0.1`, `uses: actions/setup-go/sub@${B} # v6.0.0`) },
    fixture: [
      `tag ${url("actions/checkout")} refs/tags/v7.0.1 ${A}`,
      `tag ${url("actions/setup-go")} refs/tags/v6.0.0 ${D}`,
      `tag ${url("actions/setup-go")} refs/tags/v6.0.0^{} ${B}`,
    ],
  });
  assert.equal(out.stderr, "");
  assert.equal(out.stdout, "checked 2 pins, skipped 0\n");
  assert.equal(out.status, 0);
});

test("a # vX.Y.Z pin falls back to the tag without the v only when vX.Y.Z is missing", () => {
  // bats-core/bats-action: upstream tags 4.1.0, snosi comments # v4.1.0.
  const bats = [`tag ${url("bats-core/bats-action")} refs/tags/4.1.0 ${D}`, `tag ${url("bats-core/bats-action")} refs/tags/4.1.0^{} ${A}`];
  const ok = run({ workflows: { "t.yml": steps(`uses: bats-core/bats-action@${A} # v4.1.0`) }, fixture: bats });
  assert.equal(ok.stderr, "");
  assert.equal(ok.status, 0);
  const plain = run({ workflows: { "t.yml": steps(`uses: bats-core/bats-action@${A} # 4.1.0`) }, fixture: bats });
  assert.equal(plain.status, 0);
  // A v4.1.0 tag that names another commit fails, even when 4.1.0 matches.
  const shadowed = run({
    workflows: { "t.yml": steps(`uses: bats-core/bats-action@${A} # v4.1.0`) },
    fixture: [...bats, `tag ${url("bats-core/bats-action")} refs/tags/v4.1.0 ${C}`],
  });
  assert.equal(shadowed.status, 1);
  assert.equal(shadowed.stderr, `bats-core/bats-action@${A}: tag v4.1.0 is ${C} upstream\n`);
});

test("a # vX.Y.Z pin fails when the tag names another commit or is missing", () => {
  const wrong = run({
    workflows: { "a.yml": steps(`uses: actions/checkout@${A} # v7.0.0`) },
    fixture: [`tag ${url("actions/checkout")} refs/tags/v7.0.0 ${B}`],
  });
  assert.equal(wrong.status, 1);
  assert.equal(wrong.stderr, `actions/checkout@${A}: tag v7.0.0 is ${B} upstream\n`);
  const missing = run({ workflows: { "a.yml": steps(`uses: actions/checkout@${A} # v9.9.9`) } });
  assert.equal(missing.status, 1);
  assert.equal(missing.stderr, `actions/checkout@${A}: tag v9.9.9 is missing upstream\n`);
  assert.equal(missing.stdout, "checked 1 pins, skipped 0\n");
});

test("a branch pin passes only when compare says identical or behind", () => {
  const pin = `uses: systemd/mkosi@${A} # main 2026-11-09`;
  for (const status of ["identical", "behind"]) {
    const out = run({ workflows: { "b.yml": steps(pin) }, fixture: [`compare systemd/mkosi main ${A} ${status}`] });
    assert.equal(out.status, 0, status);
    assert.equal(out.stdout, "checked 1 pins, skipped 0\n", status);
  }
  for (const status of ["ahead", "diverged"]) {
    const out = run({ workflows: { "b.yml": steps(pin) }, fixture: [`compare systemd/mkosi main ${A} ${status}`] });
    assert.equal(out.status, 1, status);
    assert.equal(out.stderr, `systemd/mkosi@${A}: not on main upstream (${status})\n`, status);
  }
  const unknown = run({ workflows: { "b.yml": steps(pin) } });
  assert.equal(unknown.status, 1);
  assert.equal(unknown.stderr, `systemd/mkosi@${A}: not on main upstream (no comparison)\n`);
  const other = run({
    workflows: { "b.yml": steps(`uses: ublue-os/container-storage-action@${A} # stable 2026-02-11`) },
    fixture: [`compare ublue-os/container-storage-action stable ${A} behind`],
  });
  assert.equal(other.status, 0);
});

test("a core reusable workflow pin is checked against core's main, whatever its comment says", () => {
  const caller = (comment) => `jobs:\n  t:\n    uses: frostyard/core/.github/workflows/pr-triage.yml@${A}${comment}\n`;
  for (const comment of [" # core#246 (frostyard/core main, 2026-11-14; core has no release tags)", " # frostyard/core main, 2026-11-14 (core#246)"]) {
    const ok = run({ workflows: { "r.yml": caller(comment) }, fixture: [`compare frostyard/core main ${A} behind`] });
    assert.equal(ok.status, 0, comment);
    const fork = run({ workflows: { "r.yml": caller(comment) }, fixture: [`compare frostyard/core main ${A} ahead`] });
    assert.equal(fork.status, 1, comment);
    assert.equal(fork.stderr, `frostyard/core/.github/workflows/pr-triage.yml@${A}: not on main upstream (ahead)\n`);
  }
});

test("the script prints each pin it does not check and counts them", () => {
  const out = run({
    workflows: {
      "s.yml": steps(
        `uses: oras-project/setup-oras@${A} # v2`,
        `uses: ryand56/r2-upload-action@${B} # v1.5`,
        `uses: actions/setup-node@${C}`,
        "uses: actions/checkout@v7",
        `uses: docker://alpine@sha256:${"e".repeat(64)}`,
        "uses: ./.github/actions/local",
        `uses: "actions/checkout@${D}" # v7.0.1`,
      ),
    },
    actions: { "x/action.yml": `runs:\n  using: composite\n  steps:\n    - uses: actions/cache@${A} # v5.0.0\n` },
    fixture: [`tag ${url("actions/checkout")} refs/tags/v7.0.1 ${D}`, `tag ${url("actions/cache")} refs/tags/v5.0.0 ${A}`],
  });
  assert.equal(out.stderr, "");
  assert.equal(out.status, 0);
  const lines = out.stdout.trimEnd().split("\n");
  assert.deepEqual(lines.slice(0, -1).sort(), [
    "skipped: actions/checkout@v7 #  (not OWNER/REPO[/PATH]@SHA)",
    `skipped: actions/setup-node@${C} #  (the comment names no vX.Y.Z tag and no BRANCH YYYY-MM-DD)`,
    `skipped: docker://alpine@sha256:${"e".repeat(64)} #  (not OWNER/REPO[/PATH]@SHA)`,
    `skipped: oras-project/setup-oras@${A} # v2 (the comment names no vX.Y.Z tag and no BRANCH YYYY-MM-DD)`,
    `skipped: ryand56/r2-upload-action@${B} # v1.5 (the comment names no vX.Y.Z tag and no BRANCH YYYY-MM-DD)`,
  ]);
  // The quoted checkout pin and the action metadata pin are checked; the local action is not a pin.
  assert.equal(lines.at(-1), "checked 2 pins, skipped 5");
});

test("a failing pin does not stop the check of the others", () => {
  const out = run({
    workflows: { "a.yml": steps(`uses: actions/checkout@${A} # v7.0.0`, `uses: systemd/mkosi@${B} # main 2026-11-09`) },
    fixture: [`compare systemd/mkosi main ${B} identical`],
  });
  assert.equal(out.status, 1);
  assert.equal(out.stderr, `actions/checkout@${A}: tag v7.0.0 is missing upstream\n`);
  assert.equal(out.stdout, "checked 2 pins, skipped 0\n");
});
