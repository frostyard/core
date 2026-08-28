import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(repoRoot, "scripts/apply-repo-settings.sh");
const contractPath = path.join(
  repoRoot,
  "organization/contracts/repository-settings/v1.json",
);
const contract = JSON.parse(await readFile(contractPath, "utf8"));

// A fixture slug: no test here resolves a real repository.
const REPO = "frostyard/apply-repo-settings-fixture";

// The representative drift path is one boolean on the repository object
// (ADR-0040 `.repository`), which the script cures with a single PATCH.
const DRIFT_KEY = "delete_branch_on_merge";
const DRIFT_WANT = contract.repository[DRIFT_KEY];
assert.equal(
  typeof DRIFT_WANT,
  "boolean",
  `the repository settings contract must still carry a boolean .repository.${DRIFT_KEY}`,
);
const DRIFT_OBSERVED = !DRIFT_WANT;

// These tests exercise the command contract of scripts/apply-repo-settings.sh —
// the dry-run/apply mutation boundary — not the shape of the rulesets it
// composes, so every run passes --no-rulesets.
const BASE_ARGS = [REPO, "--no-rulesets"];

// A fake `gh` on PATH. It answers the contract's read endpoints from JSON
// fixtures on disk and *records* every mutating call instead of making one, so
// the tests need no network, no credential, and no real repository. An
// endpoint the script was not expected to reach fails loudly rather than
// returning an empty body that would look like conformance.
const GH_STUB = `#!/usr/bin/env bash
set -euo pipefail

printf 'gh %s\\n' "$*" >> "$APPLY_TEST_CALLS"

sub="\${1:-}"
shift || true
if [ "$sub" != api ]; then
  echo "gh stub: unsupported subcommand: $sub" >&2
  exit 3
fi

method=""
endpoint=""
jq_filter=""
has_input=0
implies_post=0
fields=""
awaiting=""
for arg in "$@"; do
  if [ -n "$awaiting" ]; then
    case "$awaiting" in
      -X) method="$arg" ;;
      --jq) jq_filter="$arg" ;;
      --input) has_input=1; implies_post=1 ;;
      -f) implies_post=1; fields="$fields $arg" ;;
    esac
    awaiting=""
    continue
  fi
  case "$arg" in
    -X|--method) awaiting=-X ;;
    --jq) awaiting=--jq ;;
    --input) awaiting=--input ;;
    -f|--raw-field|-F|--field) awaiting=-f ;;
    -H|--header) awaiting=-H ;;
    -*) ;;
    *) if [ -z "$endpoint" ]; then endpoint="$arg"; fi ;;
  esac
done

# Derive the method real gh api would use, not just the one spelled out:
# an explicit -X/--method wins, otherwise a request body (--input, -f/-F and
# their long forms) makes it a POST, otherwise it is a GET. Deriving it is the
# point — a dry-run regression that mutates through an implicit POST must be
# observed here, not answered from a fixture.
effective_method="$method"
if [ -z "$effective_method" ]; then
  if [ "$implies_post" = 1 ]; then
    effective_method=POST
  else
    effective_method=GET
  fi
fi

# Every effective non-GET call mutates GitHub. Record it; never answer it from
# a fixture, so a test can assert exactly what would have been sent.
if [ "$effective_method" != GET ]; then
  body=""
  if [ "$has_input" = 1 ]; then
    # One record per call: the script sends pretty-printed JSON on stdin.
    body="$(cat)"
    body="$(printf '%s' "$body" | jq -c . 2>/dev/null || printf '%s' "$body" | tr '\\n' ' ')"
  elif [ -n "$fields" ]; then
    # No stdin body: record the field arguments that made this a POST.
    body="$(printf '%s' "$fields" | sed 's/^ //' | tr '\\n' ' ')"
  fi
  printf '%s\\t%s\\t%s\\n' "$effective_method" "$endpoint" "$body" >> "$APPLY_TEST_MUTATIONS"
  exit 0
fi

fixtures="$APPLY_TEST_FIXTURES"
case "$endpoint" in
  "repos/$APPLY_TEST_REPO")
    payload="$(cat "$fixtures/repo.json")"
    ;;
  repos/*/actions/permissions/workflow)
    payload="$(cat "$fixtures/workflow.json")"
    ;;
  repos/*/vulnerability-alerts)
    # 204 = enabled, 404 = disabled; real gh exits non-zero on the 404.
    if [ "$(cat "$fixtures/vulnerability-alerts.status")" = 204 ]; then
      echo "HTTP/2.0 204 No Content"
      exit 0
    fi
    echo "HTTP/2.0 404 Not Found"
    exit 1
    ;;
  repos/*/private-vulnerability-reporting)
    payload="$(cat "$fixtures/private-vulnerability-reporting.json")"
    ;;
  repos/*/labels*)
    payload="$(cat "$fixtures/labels.json")"
    ;;
  *)
    echo "gh stub: unexpected endpoint: $endpoint" >&2
    exit 4
    ;;
esac

if [ -n "$jq_filter" ]; then
  printf '%s' "$payload" | jq -r "$jq_filter"
else
  printf '%s\\n' "$payload"
fi
`;

const hasJq = await commandExists("jq");
const skip = hasJq
  ? false
  : "jq is required by scripts/apply-repo-settings.sh and is not on PATH";

test(
  "the default invocation plans a drifted setting and issues no mutating call",
  { skip },
  async () => {
    const fixture = await setupFixture(driftedRepository());

    const { stdout } = await run(fixture, BASE_ARGS);

    assert.match(
      stdout,
      new RegExp(`^ {2}${DRIFT_KEY}: ${DRIFT_OBSERVED} -> ${DRIFT_WANT}$`, "m"),
      `expected the drift to be reported:\n${stdout}`,
    );
    assert.match(
      stdout,
      new RegExp(`^WOULD {2}PATCH repos/${REPO} `, "m"),
      `expected a planned, unapplied PATCH:\n${stdout}`,
    );
    assert.match(
      stdout,
      new RegExp(
        `^1 change\\(s\\) planned for ${REPO}; re-run with --apply to make them\\.$`,
        "m",
      ),
      stdout,
    );
    assert.doesNotMatch(stdout, /^APPLY/m, stdout);

    // The boundary itself: the dry run reached GitHub only to read.
    const calls = await readFile(fixture.callsLog, "utf8");
    assert.match(
      calls,
      new RegExp(`^gh api repos/${REPO}$`, "m"),
      `expected the script to read the repository object:\n${calls}`,
    );
    assert.doesNotMatch(calls, /-X (PATCH|PUT|POST|DELETE)/, calls);
    assert.equal(await readFile(fixture.mutationsLog, "utf8"), "");
  },
);

test("--apply issues exactly the expected mutation", { skip }, async () => {
  const fixture = await setupFixture(driftedRepository());

  const { stdout } = await run(fixture, [...BASE_ARGS, "--apply"]);

  assert.match(
    stdout,
    new RegExp(`^APPLY {2}PATCH repos/${REPO} `, "m"),
    stdout,
  );
  assert.match(
    stdout,
    new RegExp(`^1 change\\(s\\) applied to ${REPO}\\.$`, "m"),
    stdout,
  );

  const mutations = (await readFile(fixture.mutationsLog, "utf8"))
    .split("\n")
    .filter(Boolean);
  assert.equal(
    mutations.length,
    1,
    `expected exactly one mutating call, got:\n${mutations.join("\n")}`,
  );
  const [method, endpoint, body] = mutations[0].split("\t");
  assert.equal(method, "PATCH");
  assert.equal(endpoint, `repos/${REPO}`);
  assert.deepEqual(JSON.parse(body), { [DRIFT_KEY]: DRIFT_WANT });
});

test(
  "an already-conformant repository is idempotent in both modes",
  { skip },
  async () => {
    for (const args of [BASE_ARGS, [...BASE_ARGS, "--apply"]]) {
      const fixture = await setupFixture(conformantRepository());

      const { stdout } = await run(fixture, args);

      assert.match(
        stdout,
        new RegExp(
          `^${REPO} already matches the repository settings contract\\.$`,
          "m",
        ),
        `${args.join(" ")}:\n${stdout}`,
      );
      const calls = await readFile(fixture.callsLog, "utf8");
      assert.match(calls, new RegExp(`^gh api repos/${REPO}$`, "m"), calls);
      assert.doesNotMatch(calls, /-X (PATCH|PUT|POST|DELETE)/, calls);
      assert.equal(await readFile(fixture.mutationsLog, "utf8"), "");
    }
  },
);

// The dry-run assertions above are only as strong as the harness's notion of
// "mutating". Real `gh api` sends POST whenever a request body is supplied, so
// a regression could mutate GitHub without ever spelling `-X`. Pin that the
// fake gh derives the effective method the same way.
test(
  "the fake gh records a body-bearing call with no -X as a POST mutation",
  { skip },
  async () => {
    const fixture = await setupFixture(conformantRepository());

    await execFileAsync(
      "bash",
      [
        "-c",
        `printf '%s' '{"${DRIFT_KEY}":${DRIFT_WANT}}' | gh api "repos/$APPLY_TEST_REPO" --input -`,
      ],
      { env: fixture.env },
    );
    await execFileAsync(
      "bash",
      ["-c", `gh api "repos/$APPLY_TEST_REPO/labels" -f name=queued`],
      { env: fixture.env },
    );

    const mutations = (await readFile(fixture.mutationsLog, "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split("\t"));
    assert.equal(
      mutations.length,
      2,
      `expected both implicit POSTs to be recorded, got:\n${mutations.join("\n")}`,
    );

    const [input, field] = mutations;
    assert.equal(input[0], "POST");
    assert.equal(input[1], `repos/${REPO}`);
    assert.deepEqual(JSON.parse(input[2]), { [DRIFT_KEY]: DRIFT_WANT });

    assert.equal(field[0], "POST");
    assert.equal(field[1], `repos/${REPO}/labels`);
    assert.equal(field[2], "name=queued");
  },
);

// A GitHub repository object that already satisfies every setting the contract
// names, derived from the contract itself so the fixture cannot drift from it.
function conformantRepository() {
  const status = (wanted) => ({ status: wanted === true ? "enabled" : "disabled" });
  return {
    full_name: REPO,
    default_branch: "main",
    visibility: "public",
    description: "Hermetic fixture for the repository settings contract.",
    license: { spdx_id: "MIT" },
    topics: [...contract.metadata.topics_include],
    ...contract.repository,
    security_and_analysis: {
      secret_scanning: status(contract.security.secret_scanning),
      secret_scanning_push_protection: status(
        contract.security.secret_scanning_push_protection,
      ),
      dependabot_security_updates: status(
        contract.security.dependabot_security_updates,
      ),
    },
  };
}

function driftedRepository() {
  return { ...conformantRepository(), [DRIFT_KEY]: DRIFT_OBSERVED };
}

async function setupFixture(repository) {
  const base = await mkdtemp(path.join(os.tmpdir(), "apply-repo-settings-"));
  const binDir = path.join(base, "bin");
  const fixtures = path.join(base, "fixtures");
  const callsLog = path.join(base, "calls.log");
  const mutationsLog = path.join(base, "mutations.log");

  await mkdir(binDir, { recursive: true });
  await mkdir(fixtures, { recursive: true });
  await writeFile(callsLog, "");
  await writeFile(mutationsLog, "");

  await writeFile(path.join(binDir, "gh"), GH_STUB);
  await chmod(path.join(binDir, "gh"), 0o755);

  await writeJson(path.join(fixtures, "repo.json"), repository);
  await writeJson(path.join(fixtures, "workflow.json"), {
    default_workflow_permissions: contract.actions.default_workflow_permissions,
    can_approve_pull_request_reviews:
      contract.actions.can_approve_pull_request_reviews,
  });
  await writeFile(
    path.join(fixtures, "vulnerability-alerts.status"),
    contract.security.vulnerability_alerts === true ? "204" : "404",
  );
  await writeJson(path.join(fixtures, "private-vulnerability-reporting.json"), {
    enabled: contract.security.private_vulnerability_reporting === true,
  });
  // Mixed case on purpose: the script matches required labels case-insensitively.
  await writeJson(
    path.join(fixtures, "labels.json"),
    contract.labels.required.map((name) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
    })),
  );

  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH}`,
    APPLY_TEST_CALLS: callsLog,
    APPLY_TEST_MUTATIONS: mutationsLog,
    APPLY_TEST_FIXTURES: fixtures,
    APPLY_TEST_REPO: REPO,
    // No credential is present or needed.
    GH_TOKEN: "",
    GITHUB_TOKEN: "",
  };
  return { env, callsLog, mutationsLog };
}

function writeJson(file, value) {
  return writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function run({ env }, args) {
  return new Promise((resolve, reject) => {
    execFile("bash", [scriptPath, ...args], { env }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        error.message = `${error.message}\nstdout:\n${stdout}\nstderr:\n${stderr}`;
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

async function commandExists(command) {
  try {
    await execFileAsync("command", ["-v", command], { shell: "/bin/bash" });
    return true;
  } catch {
    return false;
  }
}
