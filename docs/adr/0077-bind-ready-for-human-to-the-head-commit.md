# 0077 — Bind `ready-for-human` to the head commit

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

`ready-for-human` says that the cross-review passed at the PR head, CI is green, and nothing else is pending (ADR-0068 and the agent rules). The label does not name a commit. A later push leaves the label on a head that nobody reviewed. A label added while CI is red or pending makes the same false claim.

Agents add and remove the label with 1 GitHub login. An agent runtime sweep removes the label for PRs that it tracks, and only while it runs. A reusable workflow in core runs for every PR in every repository that has a caller, with no agent runtime ([ADR-0068](0068-label-pull-requests-that-touch-high-risk-paths.md)).

GitHub gives a `pull_request_target` event the old and the new head SHA on `synchronize`, and the label name on `labeled`. A check run of the workflow that handles the event is itself in progress.

## Decision

- Core's reusable workflow is `.github/workflows/pr-triage.yml`. It replaces `risk-paths.yml`. It runs 2 steps from 1 job: `levels` (the `risk:high` behavior of ADR-0068, unchanged) and `readiness`.
- The `readiness` step removes `ready-for-human` on 2 triggers: a `synchronize` event on a PR that has the label (the head moved after the label), and a `labeled` event for the label while CI at the head is not green. CI is not green when a check run is not completed, or has a conclusion other than `success`, `neutral` or `skipped`, or when a commit status is `pending`, `failure` or `error`. Check runs of the `pr-triage` job are left out.
- The step writes 1 comment with a marker line first, then removes the label. A re-run finds the marker and writes no second comment. An API error other than HTTP 404 on the removal fails the step.
- No sender is exempt, also GitHub's "Update branch".
- The limits are: best effort, not proof of the reviewed SHA, a delay of seconds to minutes, a stale label after a failed run, and a race when a push and a label come in the same second. The error is on the side of removal. The [PR triage spec](../specs/pr-triage.md) lists them.
- Agent sessions that track PRs keep their own sweep. It also unreadies a PR for failing checks, changes requested and blocking comments. An agent treats a removal after a head change as a reason to review again.
- The rule for agents stays: add `ready-for-human` only when the review passed at the current head.
- The caller runs on `opened`, `synchronize`, `reopened`, `edited` and `labeled`. The caller's job id is `pr-triage`.

## Consequences

- Easier: a PR that carries `ready-for-human` has no push after the label, unless a run failed or is still pending. The owner's query `is:pr is:open label:ready-for-human` is more reliable.
- Every repository moves its caller to `pr-triage.yml` and adds the `labeled` type, with a new SHA pin. A caller of the older `frostyard/core/.github/workflows/risk-paths.yml@<SHA>` stays valid at its pinned SHA until it moves, and then has no readiness step.
- Harder or negative: the workflow needs `pull-requests: write` for the removal and the comment (the permission that the `levels` step already has). A failed run leaves a stale label and a red check. A race can remove a label that was right. A workflow that runs on `labeled` can be pending when the label comes, and the step then revokes the label.
- The workflow does not bind the approval to the SHA that the review read. A head-bound approval needs a gate that records the reviewed SHA ([autonomy gate](https://airlock.lunareng.com/docs/autonomy-gate.md)).
- The job has room for further steps. They use `!cancelled()` in `if:`, so they run after an earlier step failed.

## Alternatives considered

- **Agent-runtime sweep only:** It sees only the PRs that the runtime tracks, and only while it runs. It stays as a second layer.
- **A required status check on the head:** The label is not a commit. A check needs a tool that binds the review to the SHA.
- **Do nothing and rely on the agent rule:** A push by another agent or by "Update branch" leaves the label on a head that no one reviewed.

## References

- Shapes: [spec: PR triage](../specs/pr-triage.md), [spec: risk paths](../specs/risk-paths.md), core issue [#218](https://github.com/frostyard/core/issues/218)
- Builds on: [ADR-0068](0068-label-pull-requests-that-touch-high-risk-paths.md), [ADR-0019](0019-governance-as-code-and-risk-tiers.md), [ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md), [ADR-0042](0042-adopt-a-merge-queue-on-the-default-branch.md)
