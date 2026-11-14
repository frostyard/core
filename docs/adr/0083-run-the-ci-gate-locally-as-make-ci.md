# 0083 — Run the CI gate locally as `make ci`

- **Status:** Accepted
- **Date:** 2026-11-13
- **Amends in part:** [ADR-0071](0071-hold-every-code-repository-to-one-baseline.md)
  (the organization gate checks presence only)
- **Amends in part:** [ADR-0044](0044-expose-the-make-gate-triad-in-every-repository.md)
  (what the organization gate checks)
- **Amends in part:** [ADR-0073](0073-let-ci-run-the-make-ci-targets-as-separate-jobs.md)
  (where `ciCoverageGaps` lives)

## Context

[ADR-0044](0044-expose-the-make-gate-triad-in-every-repository.md) gives
every repository the targets `make verify`, `make check` and `make ci`, and
[ADR-0071](0071-hold-every-code-repository-to-one-baseline.md) row B12 with
[ADR-0073](0073-let-ci-run-the-make-ci-targets-as-separate-jobs.md) makes
`.github/workflows/ci.yml` run every part of `make ci`. Nothing requires the
other direction: a pull-request workflow can run a check that `make ci`
does not run, and nothing requires `AGENTS.md` to name the target.

A review of the check runs and logs of the 552 pull requests that the
machine account opened from 2026-11-07 to 2026-11-14 found 28 with a real
CI failure (the other red commits were cancelled runs). 6 of the 28 failed only on lint or format, and 5 of those 6 came
from changes rolled out to many repositories at once:

- shellcheck SC2034 in `tests/check-baseline-test.sh` of apt-publisher,
  bootc-debian and omarchy-apps (1 rollout);
- golangci-lint ST1018 in repogen;
- ansible-lint `yaml[line-length]` in bketelsen/fleet.

9 more failed on a repository's own test that its local gate runs, 4 of
them from 1 rollout of 35 pull requests pushed from temporary clones.

The organization gate (`npm run check:fleet`, CI's required
`fleet-conventions` job) reads only the `fleet_state: enabled`
declarations and checks only the presence of `mise.toml`, `mise.lock` and
the 3 targets.

## Decision

- **`make ci` is the 1 local entry point to the CI gate** in every
  frostyard code repository (ADR-0071 scope) and in the bketelsen
  repositories that
  [ADR-0076](0076-require-status-checks-on-every-default-branch.md) names
  (fleet, trimlights, truenas-mcp, pi-pocket-team, pi-pocket-dune,
  agentic-template).
  - `make ci` runs every check that `.github/workflows/ci.yml` runs on a
    pull request, lint and format included. A check that needs network
    access or a credential when it runs (a vulnerability database, a
    GitHub API read, a package install inside the test) stays in a job of
    its own, as ADR-0022 and
    [ADR-0038](0038-scope-the-test-name-filter-to-chairlift.md) say.
  - No workflow that runs on pull requests runs a lint or format check
    that `make ci` does not run. A `make <target>` lint job outside
    `make ci` passes only when `make ci` runs each tool that the target
    calls.
  - `AGENTS.md` names `make ci` as the command to run before a push.
  - Row B12 stays: `ci.yml` runs every part of `make ci`, in 1 of the 2
    forms of ADR-0073. A `run:` command `make a b` runs both targets.
- **A change rolled out to many repositories runs `make ci` in each clone
  before it pushes** there. A pass in 1 repository proves nothing for
  another.
- **The repository baseline gains row B19** (local CI gate) for the 2
  mechanical parts: `AGENTS.md` names `make ci`, and no pull-request
  workflow lints or formats outside `make ci`. The comparison of the
  other checks of `ci.yml` with `make ci` is a judgment that the
  conformance sweep makes.
- **The organization gate checks rows B12 and B19** beside the presence
  part of B4, with the readers in `scripts/lib/ci-gate.mjs`. It reads the
  enabled declarations, or the repositories given as `OWNER/REPO`
  arguments. The lint check knows the tools in `LINT_TOOLS` and the
  actions in `LINT_ACTIONS` of that file and follows `make ci` through
  prerequisites, recipe `make` calls, Makefile variables, npm scripts and
  the script files that a recipe names.
- **This ADR amends ADR-0071 in part.** These statements of ADR-0071 are
  no longer true:
  - "The organization gate (`npm run check:fleet`) still checks presence
    only." It now also reads `AGENTS.md`, `ci.yml` and the other workflow
    files (rows B12 and B19).
  - The reason given for rejecting "a mechanical organization gate for
    every item", "the gate reads only enrolled repositories and checks
    presence": the gate reads given repositories too, and checks B12 and
    B19. The rejection stays: most items still need judgment.
- **This ADR amends ADR-0044 in part.** "The organization gate checks
  presence the same way for every repository: `Makefile` with the three
  targets, plus `mise.toml` and `mise.lock` (ADR-0043)" is no longer the
  whole check: the gate also checks rows B12 and B19 for every repository
  the same way. To follow `make ci`, it reads `package.json` scripts when
  a recipe calls `npm`; it names no gate in a manifest.
- **This ADR amends ADR-0073 in part.** "core's
  `test/repository-baseline.test.mjs` holds the comparison as the
  function `ciCoverageGaps`" is no longer true: the function lives in
  `scripts/lib/ci-gate.mjs`, and the test file re-exports it.
- Everything else in ADR-0071, ADR-0044 and ADR-0073 stands.

## Consequences

- Easier: an agent or a rollout runs 1 command in each repository, and a
  green `make ci` predicts the lint, format and offline test jobs of CI.
- Easier: the gaps are visible. On 2026-11-13,
  `node scripts/check-fleet-conventions.mjs` over the 29 frostyard code
  repositories and the 6 bketelsen repositories fails 6 of them; the
  enabled declarations (clix, core, firn, std, updex) pass.
- Harder: `fleet-conventions` is a required check of core, so a change in
  an enabled repository that breaks B12 or B19 blocks core's pull
  requests until the repository is fixed. This is already true for B4.
- Harder: the lint check knows only the listed tools and actions. A tool
  outside `LINT_TOOLS`, or a script that `make ci` calls through a path
  the reader does not follow, gives a false pass or a false gap; the list
  grows with the fleet.
- Harder: a repository whose `make ci` must also run a lint job that CI
  runs in parallel either calls the same tools in a `make ci` target or
  makes CI's job call a target that `make ci` reaches.
- New obligations: owners fix their B19 gaps from sweep issues;
  bketelsen/agentic-template keeps `make ci` named in its `AGENTS.md`.

## Alternatives considered

- **A rollout rule only, with no check:** the rule exists for
  `make verify` already, and a pull-request workflow can still run a lint
  job that no local target runs.
- **Require that `make ci` runs every `run:` command of `ci.yml`:**
  setup steps (`npm ci`, `go mod download`) and network checks
  (govulncheck) are `run:` commands too, and no line reader tells them
  from checks without a list for each repository.
- **Check only the enabled declarations:** they are 5 of 35 repositories,
  and the failures came from the others.

## References

- Shapes: [spec: repository baseline](../specs/repository-baseline.md)
  (rows B12 and B19), [design: quality loop](../design/quality-loop.md)
- Builds on: [ADR-0022](0022-make-ci-gate-and-test-naming-filter.md),
  [ADR-0038](0038-scope-the-test-name-filter-to-chairlift.md),
  [ADR-0043](0043-pin-repository-tools-in-mise-and-name-the-verify-gate.md),
  [ADR-0044](0044-expose-the-make-gate-triad-in-every-repository.md),
  [ADR-0071](0071-hold-every-code-repository-to-one-baseline.md),
  [ADR-0073](0073-let-ci-run-the-make-ci-targets-as-separate-jobs.md),
  [ADR-0076](0076-require-status-checks-on-every-default-branch.md)
