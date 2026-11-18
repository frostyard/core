# 0087 — Start PR triage by dispatch for bot pull requests

- **Status:** Accepted
- **Date:** 2026-11-17

## Context

Each repository runs core's PR triage on `pull_request_target`
([ADR-0068](0068-label-pull-requests-that-touch-high-risk-paths.md),
[ADR-0078](0078-sort-pull-requests-by-levels-l1-to-l4.md)). The `levels`
step adds `level:L1` to `level:L4`, and `risk:high` at L1 and L2.

GitHub starts no workflow run for an event that `GITHUB_TOKEN` causes, with
2 exceptions: `workflow_dispatch` and `repository_dispatch`
([triggering a workflow from a workflow](https://docs.github.com/en/actions/using-workflows/triggering-a-workflow#triggering-a-workflow-from-a-workflow)).
So a PR that a scheduled workflow opens or updates with `GITHUB_TOKEN` gets
no `pull_request_target` run and no level label. frostyard/bootc-debian#24
changed `download/checksums.json` (level L1) and had no label for 22 hours,
until a person added one
([core#233](https://github.com/frostyard/core/issues/233)). The same
workflows already dispatch `build.yml` and `ci.yml` for their bot PRs, with
`actions: write` on the job.

The Actions event policies of the
[pull_request_target runbook](../design/pull-request-target-policy.md)
target the caller paths `risk-paths.yml` and `risk-paths-caller.yml` and
allow `pull_request_target` there. An event rule is an allowlist for the
workflows it targets.

## Decision

- Core's reusable workflow `.github/workflows/pr-triage.yml` takes a string
  input `pr`. When the caller runs on `workflow_dispatch`, the `levels` step
  reads the PR number from `pr`, refuses any value that is not digits only
  (no sign, no leading zero, a safe integer), and reads the PR from
  `GET /repos/{owner}/{repo}/pulls/{number}`. It takes the base SHA from that
  answer, reads the risk list at that SHA, and sets the labels as on
  `pull_request_target`. A PR that is not open gets no label change.
- On `workflow_dispatch`, only the `levels` step runs. The `readiness` and
  `shadow` steps stay `pull_request_target` only: their triggers need the
  `synchronize` and `labeled` event data and the PR author.
- A repository whose workflows open or update PRs with `GITHUB_TOKEN` adds a
  second caller, `.github/workflows/pr-triage-dispatch.yml`, on
  `workflow_dispatch` with a required input `pr`. Its job has the id
  `pr-triage` and the job grant of
  [ADR-0086](0086-let-each-pr-triage-caller-grant-the-triage-token.md), and
  calls the pinned `pr-triage.yml` with `pr` and `dependabot-shadow: false`.
  The bot job runs `gh workflow run pr-triage-dispatch.yml -f pr=<number>`
  after it creates or updates the PR, with `actions: write` on its job.
- The `pull_request_target` caller keeps its 1 trigger. On
  `pull_request_target`, a non-empty `pr` input fails the `levels` step.

## Consequences

- Easier: a bot PR gets its level label and `risk:high` a few seconds after
  the bot workflow opens it, with no person in the loop.
- Harder or negative: each affected repository carries 1 more workflow
  file, and each bot job needs `actions: write`. A bot workflow that does
  not dispatch still leaves its PR without a label. The dispatch runs at the
  base SHA that the pulls API returns, which can be newer than the base SHA
  when the PR was opened; the labels then follow the newer list, as they do
  after an `edited` event that changes the base.
- Anyone who can dispatch a workflow (write access) can start the `levels`
  step for any open PR of the repository. The step sets labels by the ratchet: it
  never loosens a level label and never removes `risk:high`.
- The `ready-for-human` guard of
  [ADR-0077](0077-bind-ready-for-human-to-the-head-commit.md) still does not
  run for bot pushes made with `GITHUB_TOKEN`. A person or an agent that
  adds `ready-for-human` starts the `labeled` run as before.
- New obligations: after the core release that carries this change, each
  repository whose bot workflow opens PRs with `GITHUB_TOKEN` adds the
  dispatch caller. On the default branches read on 2026-11-18:
  frostyard/bootc-debian and frostyard/omarchy-apps
  (`check-dependencies.yml`, `GITHUB_TOKEN`); frostyard/snosi
  (`check-dependencies.yml` and `check-packages.yml`, token
  `secrets.WORKFLOW_PAT || secrets.GITHUB_TOKEN`, so only while the secret
  `WORKFLOW_PAT` is not set). frostyard/incus opens its sync PRs with the
  token `UPSTREAM_SYNC_TOKEN` (`sync-upstream.yml`), so its PRs start the
  usual events.

## Alternatives considered

- **Open bot PRs with a GitHub App installation token:** the usual events
  start, but the organization needs 1 more App and its secrets, and each bot
  workflow holds a write token of that App.
- **Add `workflow_dispatch` to the `pull_request_target` caller:** the
  Actions event policy for the caller paths is an allowlist of events, so
  the policy would have to allow `workflow_dispatch` there too, and 1 file
  would handle 2 event shapes.
- **A scheduled sweep that labels open PRs with no level label:** a delay
  of up to 1 schedule period, and 1 more scheduled workflow per repository.
  It stays possible as a safety net beside this decision.

## References

- Shapes: [specs/pr-triage.md](../specs/pr-triage.md),
  [specs/risk-paths.md](../specs/risk-paths.md),
  [design/pull-request-target-policy.md](../design/pull-request-target-policy.md)
- Builds on: [ADR-0068](0068-label-pull-requests-that-touch-high-risk-paths.md),
  [ADR-0078](0078-sort-pull-requests-by-levels-l1-to-l4.md),
  [ADR-0086](0086-let-each-pr-triage-caller-grant-the-triage-token.md),
  [ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md)
- Related: [ADR-0077](0077-bind-ready-for-human-to-the-head-commit.md)
