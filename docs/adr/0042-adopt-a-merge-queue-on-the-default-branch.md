# 0042 — Adopt a merge queue on the default branch

- **Status:** Accepted
- **Date:** 2026-08-19

## Context

[ADR-0040](0040-publish-the-repository-settings-contract.md)'s repository
settings contract (v1) pins the default-branch ruleset to *strict required
status checks* and *no merge queue*. Strict means a pull request merges only
when its checks ran against the current tip of `main` — the guarantee that
what CI tested is what lands. It is the right guarantee, and the Snowcat
review gate ([Snowcat ADR-0065](https://github.com/frostyard/snowcat/blob/main/docs/adr/0065-gate-worker-pull-requests-behind-bounded-review.md))
relies on it: a pull request reaches a human only after an independent
round passed on its exact head, and the merge is the human's.

The first fleet-scale day (2026-08-19: 25 pull requests across snowcat,
updex, clix, and std, every one reviewed by the gate and merged by one
operator in roughly 45 minutes) showed the cost of strict-without-a-queue:
merging N ready pull requests in a row means, for each one after the first,
*update branch → wait for CI → merge*, by hand. Snowcat's cure sweep updates
a `behind` pull request mechanically, but on its timer, and it raced the
operator twice. The operator judged the 45 minutes acceptable today and
asked that the wait be removed without weakening the guarantee.

GitHub's merge queue is built for exactly this: the human enqueues a
reviewed pull request ("merge when ready"); the queue creates a temporary
branch with the pull request on top of the queue tip, runs the required
checks there, and merges in order — every merge tested against what it
actually lands on, no human between merges. The contract's other rules
(pull request required, conversation resolution, no bypass, no deletion or
force push, no classic protection) are unaffected, and `allow_auto_merge`
stays off: the queue entry is still a human's explicit act per pull request.

## Decision

- The default-branch ruleset of every enrolled repository **requires a merge
  queue**. The repository settings contract's `default_branch_ruleset.merge_queue`
  widens from `const: false` to a boolean whose required value is `true`
  (a compatible widening within schema v1 per [ADR-0039](0039-widen-maintenance-programs-within-schema-v1.md):
  the field, its position, and every other value are unchanged; consumers
  bundle the new schema revision alongside the old).
- The queue's parameters are part of the contract and applied by
  `scripts/apply-repo-settings.sh`: merge method `squash` (the organization
  squash-merges; the conventional pull-request title remains the commit
  subject per ADR-0040), grouping strategy `ALLGREEN`, at most 5 entries built
  at once, minimum 1 and maximum 5 entries merged per group, no minimum wait,
  check response timeout 60 minutes. Required status checks stay strict —
  the queue is what satisfies "up to date" now.
- `allow_auto_merge` stays `false` and approvals stay at zero: the human
  reviews and enqueues; nothing enqueues on a human's behalf. Snowcat never
  enqueues, merges, or dequeues; its cure sweep keeps updating `behind`
  pull requests that are *not* in the queue (foreign ones, or ones a human
  has not yet enqueued).
- Rollout is one script run per repository (`apply-repo-settings.sh
  --required-checks …`), after this ADR is Accepted, and the repository
  settings sweep in Snowcat reports any repository whose ruleset lacks the
  queue as drift until then.

## Consequences

- Merging many reviewed pull requests becomes one click each with no wait
  between; the ordering and the re-test are GitHub's.
- The merge-queue rule requires the repository to be public or the
  organization on a plan that includes merge queues; every enrolled
  frostyard repository is public today. A private enrollee on a plan without
  it would be reported as drift and needs a decision.
- Required checks must be ones the queue can run on its temporary branch:
  workflows triggered on `pull_request` alone do not run there —
  every enrolled repository's CI must also trigger on `merge_group`. That
  is one workflow edit per repository, part of the same rollout.
- `scripts/apply-repo-settings.sh` gains the rule and its parameters;
  Snowcat's `sweep-repository-settings` gains the new schema revision and
  checks the rule's presence and parameters.
- ADR-0040 stays Accepted; this ADR changes one value and its meaning, and
  the reason is recorded.

## Alternatives considered

- **Drop strict required status checks:** rejected; it removes the
  guarantee that the checks ran against what lands, which is the one thing
  the gate's pass is worth.
- **Enable `allow_auto_merge` instead:** rejected; it does not solve the
  up-to-date wait (each pull request still has to be updated and re-tested
  serially), and it makes the merge click non-final.
- **Have Snowcat's cure update branches faster:** adopted *in addition*
  (the verify cadence drops to two minutes), but it only moves the waiting
  into the sweep; the human still merges one at a time after each CI run.
- **Do nothing:** the operator's 45 minutes per fleet day — acceptable today,
  and a growing tax as the fleet grows.

## References

- Builds on: [ADR-0040](0040-publish-the-repository-settings-contract.md),
  [ADR-0039](0039-widen-maintenance-programs-within-schema-v1.md),
  [ADR-0035](0035-author-organization-authority-as-strict-json.md)
- Shapes: `organization/contracts/repository-settings/v1.json`,
  `organization/schemas/v1/repository-settings.schema.json`,
  `scripts/apply-repo-settings.sh` (changed when this ADR is Accepted),
  [organization repository enrollment](../specs/organization-repository-enrollment.md)
- Snowcat side: [Snowcat ADR-0065](https://github.com/frostyard/snowcat/blob/main/docs/adr/0065-gate-worker-pull-requests-behind-bounded-review.md),
  [Snowcat ADR-0061](https://github.com/frostyard/snowcat/blob/main/docs/adr/0061-cure-pull-requests-as-bounded-per-head-work.md),
  the [queue operations runbook](https://github.com/frostyard/snowcat/blob/main/docs/design/queue-operations.md)
