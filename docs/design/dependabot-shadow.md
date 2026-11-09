# Dependabot shadow

Living document. Rationale:
[ADR-0019](../adr/0019-governance-as-code-and-risk-tiers.md),
[ADR-0040](../adr/0040-publish-the-repository-settings-contract.md),
[ADR-0042](../adr/0042-adopt-a-merge-queue-on-the-default-branch.md),
[ADR-0075](../adr/0075-batch-routine-pull-requests.md),
[ADR-0078](../adr/0078-sort-pull-requests-by-levels-l1-to-l4.md).
Contracts: [PR triage](../specs/pr-triage.md#g-the-shadow-step).

## Overview

The Dependabot shadow is a measurement of a narrow auto-merge class, and
nothing more. For a Dependabot pull request that the class would take, the
`shadow` step of the reusable workflow `.github/workflows/pr-triage.yml` writes
1 comment that says "would auto-merge". It enables nothing: it never enables
auto-merge, approves, merges or labels, and it reads no label.

```text
Dependabot pull request
  -> S1: patch or minor only
  -> S2: manifest and lock files only
  -> S3: no risk path (computed level L3 or L4)
  -> S4: the base branch requires at least 1 status check
  -> 1 comment for each head SHA, or no comment
```

## Design

The workflow runs the `shadow` step after `readiness`, with
`PR_TRIAGE_STEP: shadow`, and it runs only on `pull_request_target` for a
Dependabot pull request with the action `opened`, `synchronize` or `reopened`
that is not a draft. A step before it, `dependabot/fetch-metadata`, gives S1
its input from `updated-dependencies-json`; that step has
`continue-on-error: true`, so a failure there makes S1 fail and does not fail
the job.

The step reads the pull request twice through the GitHub API: once before the
criteria, and once more before it writes. When the live head is not the head of
its event, it writes nothing and returns `stale`, so a delayed or re-run job
never judges the files of a newer head. Between the 2 reads it reads the changed
files, the risk-paths list at the base SHA, and the branch rules of the base ref.

It writes at most 1 comment for each head SHA. A call comment is a comment of the
author `github-actions[bot]` with the marker line
`<!-- frostyard:dependabot-shadow v1 head=<sha> ...` for this head. Each head
keeps the call comment with the lowest comment id: on both the path that finds a
call and the path that writes one, the step deletes every other call comment of
the head. A comment by another author never counts and is never deleted, and a
comment for another head is never deleted.

Two runs for the same head can both write. A run whose cleanup fails leaves 2
comments, and the next run for the same head removes the extra one.

The exact contract, the criteria S1 to S4, the API reads and the comment bodies
are in [PR triage, section G](../specs/pr-triage.md#g-the-shadow-step). The
library is `scripts/lib/pr-triage.mjs`; the reusable workflow embeds it
verbatim, so the sync gate `npm run check:risk-paths` keeps the copy in step.

## Measurement

**Day 1.** The count starts on the day that every repository with a
caller runs the `shadow` step and has its required checks on (the rollout
check of the required-checks runbook,
[ADR-0076](../adr/0076-require-status-checks-on-every-default-branch.md)).
Before that day, a repository without a required check fails S4. The step
judges only new events (a new Dependabot pull request or a rebase): an open
pull request from before day 1 gets a call at its next rebase.

**Window.** A read-only report script runs on day 21 over the calls of days
1 to 14. Dates are in UTC and inclusive, by the `created_at` of the call
comment. The script counts only marker comments that `github-actions[bot]`
wrote.

**Call.** A call is 1 marker comment. The report judges it against the checks
recorded in its marker, not against the settings of the report day.

**Check result.** For each recorded check: the latest check run with that name
at the call head (`GET commits/{sha}/check-runs?check_name=`, filtered by
`integration_id` when it is not `null`; the latest `started_at` wins), or else
the commit status with that context. `success`, `neutral` and `skipped` pass;
another conclusion fails; no result is unknown.

**Class of 1 call** (the first that holds):

| Class | Meaning |
| --- | --- |
| superseded | The pull request head moved before every recorded check passed: a later call, or a `head_ref_force_pushed` or `committed` event in the timeline. |
| waited | A recorded check failed. |
| unknown | A recorded check has no result. |
| would have merged | Every recorded check passed. |

**Class of 1 pull request**, from its last would-have-merged call (the first
that holds):

| Class | Meaning |
| --- | --- |
| F2 | It merged, and within 7 days a revert of it merged (a pull request whose title starts with `Revert` and names its number), or a required check failed on the default branch at the merge commit. |
| F3 | It merged, and `GET pulls/{n}/commits` has a commit whose author is not `dependabot[bot]`. |
| F1 | A person or an agent, not `dependabot[bot]`, closed it unmerged. This is a disagreement, counted; it is not a safety failure. |
| agreed | None of the above. |

**F4** overrides "agreed": a comment `false: #<n> <reason>` by the owner on
the report issue (given to the script with `--issue <n>`).

**Missed** (for value only): a Dependabot pull request that merged with only
Dependabot commits and green recorded checks, and that has no call.

## What a go-live decision needs

Go-live (a workflow that enables auto-merge for this class) is not built. A
decision to build it needs all of these:

- At least 10 would-have-merged calls. With fewer, the window grows by 2 weeks
  at a time, to 6 weeks at most. Then the report says "too few", and the shadow
  stays as it is until a decision.
- Safety: F2 = 0 and F3 = 0.
- Disagreement: F1 + F4 is 2 or less, each with a reason, and each with a
  criterion change that would have excluded it.
- A new ADR that amends
  [ADR-0019](../adr/0019-governance-as-code-and-risk-tiers.md) (a GitHub
  Actions workflow, not an agent, enables auto-merge for this 1 class),
  [ADR-0042](../adr/0042-adopt-a-merge-queue-on-the-default-branch.md) and
  [ADR-0040](../adr/0040-publish-the-repository-settings-contract.md)
  (`allow_auto_merge` true: the settings contract only tightens in place, so a
  looser value needs an ADR).
- The owner's settings step for each repository (`allow_auto_merge`), and a
  separate workflow change that calls `gh pr merge --auto`. The `shadow` step
  itself never gets that power.

## Operational notes

- The step fails red when the changed-file list or the branch-rule list cannot
  be read. It writes no comment then, so a re-run writes 1 comment for the head.
- An error while reading the risk-paths list fails S3 only: the step then
  writes no comment and still ends green.
- The job summary holds a `## Dependabot shadow` section with 1 row for each
  criterion, so a run's result is readable without the job log.
- The job permissions stay `contents: read` and `pull-requests: write`. The
  step needs no other permission, and it uses `github.token` only.

## References

- Rationale: [ADR-0019](../adr/0019-governance-as-code-and-risk-tiers.md), [ADR-0021](../adr/0021-sha-pinned-actions-and-least-privilege-ci.md), [ADR-0040](../adr/0040-publish-the-repository-settings-contract.md), [ADR-0042](../adr/0042-adopt-a-merge-queue-on-the-default-branch.md), [ADR-0075](../adr/0075-batch-routine-pull-requests.md), [ADR-0076](../adr/0076-require-status-checks-on-every-default-branch.md), [ADR-0077](../adr/0077-bind-ready-for-human-to-the-head-commit.md), [ADR-0078](../adr/0078-sort-pull-requests-by-levels-l1-to-l4.md)
- Contracts: [PR triage](../specs/pr-triage.md), [risk paths](../specs/risk-paths.md)
- Context: [quality loop](quality-loop.md)
