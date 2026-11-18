# 0086 — Let each PR triage caller grant the triage token

- **Status:** Accepted
- **Date:** 2026-11-17
- **Amends in part:** [ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md)
  (top-level `permissions: {}` in every workflow)

## Context

Core's reusable workflow `.github/workflows/pr-triage.yml` runs the PR
triage job of [ADR-0068](0068-label-pull-requests-that-touch-high-risk-paths.md),
[ADR-0077](0077-bind-ready-for-human-to-the-head-commit.md) and
[ADR-0078](0078-sort-pull-requests-by-levels-l1-to-l4.md) for every caller.
Until this ADR it had top-level `permissions: {}` and the job permissions
`contents: read` and `pull-requests: write`, as
[ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md) requires of
every workflow.

The `readiness` step reads `GET commits/{sha}/check-runs` and
`GET commits/{sha}/status`. In a private repository these reads need
`checks: read` and `statuses: read`; a public repository allows them without
the grant. Without it, the step gets HTTP 403 and reports readiness unknown
([core#227](https://github.com/frostyard/core/issues/227),
[bketelsen/fleet run 42646228960](https://github.com/bketelsen/fleet/actions/runs/42646228960)).

GitHub's rules for a reusable workflow
([reusing workflow configurations](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations)):

- The `GITHUB_TOKEN` permissions that the caller passes can only be
  downgraded, not elevated, by the called workflow.
- A top-level `permissions: {}` in the called workflow downgrades every job
  that sets no permissions of its own to no permissions.
- "If `jobs.<job_id>.permissions` is not specified in the calling job, the
  called workflow will have the default permissions for the `GITHUB_TOKEN`."
  A repository or organization can set that default to read and write for
  every scope. The page does not say whether a workflow-level `permissions`
  of the caller counts as that default.

So a fixed grant in `pr-triage.yml` that adds `checks: read` and
`statuses: read` asks for more than a caller with only `contents: read` and
`pull-requests: write` grants, public callers included. 34 repositories
have a caller, 2 of them private: frostyard/apt-publisher and
bketelsen/fleet (section "Inventory of pull_request_target workflows" of
[the pull_request_target policy](../design/pull-request-target-policy.md),
read on 2026-11-09).

## Decision

- `.github/workflows/pr-triage.yml` has no `permissions` key: not at the
  top level and not on its job. Its job gets the grant of the calling job.
- Each job that calls `pr-triage.yml` sets `permissions` on the job, as a
  mapping, with `contents: read` and `pull-requests: write`. It may add
  `checks` and `statuses`, each with `read` or `none`, and no other
  permission. A private repository adds `checks: read` and
  `statuses: read`, so that the `readiness` step can read the checks.
- `npm run check:fleet` fails a repository when a job that calls
  `pr-triage.yml` has no job-level `permissions` (a workflow-level
  `permissions` does not count, so the rule holds whatever GitHub takes as
  the default), has a string such as
  `write-all` or `read-all`, or grants a scope or a value outside the list
  above. The [PR triage spec](../specs/pr-triage.md) states the same rule
  for every caller, also for callers outside the enabled declarations that
  the gate reads.
- This amends 1 statement of ADR-0021: "Workflows start from
  `permissions: {}` (or an explicit minimal top-level grant)" no longer
  holds for `pr-triage.yml`. For that file, the explicit minimal grant is
  on the calling job, with `permissions: {}` at the top of the caller.
  Everything else in ADR-0021 stands, also for every other workflow,
  reusable or not: SHA pins, job-scoped grants only where needed,
  `persist-credentials: false`, version-bump automation and the nightly
  compliance run.

## Consequences

- Easier: a private caller gets a working `readiness` step with 1 change to
  its own job permissions. A public caller needs no change, and no caller
  breaks when core releases this workflow.
- Harder or negative: the least privilege of the triage job now rests on
  each caller, not on core. A caller that sets no permissions at all hands
  the default token, which can be read and write for every scope, to a job
  on `pull_request_target`. `check:fleet` catches this only in the enabled
  declarations; other callers rely on the spec and on review. The job still
  checks out nothing and runs no code from the PR
  ([ADR-0020](0020-ai-automation-trust-boundaries.md)), so a wide grant
  widens what a bug in core's pinned scripts could do, not what the PR
  author can do.
- The baseline row B5 test in core
  (`test/repository-baseline.test.mjs`) exempts `pr-triage.yml` from the
  top-level `permissions: {}` rule, and only that file.
- New obligations: the 2 private callers add `checks: read` and
  `statuses: read` after core's release that carries this change.

## Alternatives considered

- **Add `checks: read` and `statuses: read` to the job in `pr-triage.yml`:**
  the called job then asks for more than a caller that grants only
  `contents: read` and `pull-requests: write` passes, which GitHub does not
  allow, so all 34 callers must change before they move to the core
  release.
- **Keep the fixed grant and accept readiness unknown in private
  repositories:** the head-moved trigger still works there, but a label
  that comes while CI is red stays, which is the case that
  [ADR-0077](0077-bind-ready-for-human-to-the-head-commit.md) exists for.
- **A second reusable workflow for private callers:** 2 copies of the same
  job and of its embedded scripts to keep in step, for 2 callers.

## References

- Shapes: [specs/pr-triage.md](../specs/pr-triage.md),
  [specs/risk-paths.md](../specs/risk-paths.md),
  [specs/repository-baseline.md](../specs/repository-baseline.md),
  [design/pull-request-target-policy.md](../design/pull-request-target-policy.md)
- Builds on: [ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md),
  [ADR-0068](0068-label-pull-requests-that-touch-high-risk-paths.md),
  [ADR-0077](0077-bind-ready-for-human-to-the-head-commit.md),
  [ADR-0083](0083-run-the-ci-gate-locally-as-make-ci.md)
- Related: [ADR-0020](0020-ai-automation-trust-boundaries.md),
  [ADR-0087](0087-start-pr-triage-by-dispatch-for-bot-pull-requests.md)
