# 0041 — Retire copilot-review-apply where Snowcat gates review

- **Status:** Accepted
- **Date:** 2026-08-19

## Context

[ADR-0020](0020-ai-automation-trust-boundaries.md) named the
`copilot-review-apply` workflow as one of its shapes: on a Copilot
pull-request review, a job asks the Copilot coding agent to "address every
actionable finding", idempotent per review through a hidden marker. Five
repositories carry it today — chairlift, lab, pilothouse, snosi, testsuite.

Two days of operating Snowcat's queue across the fleet (2026-08-18/19)
showed the shape's failure mode. Copilot's automatic review ran at its
default *Lite* effort level and flagged non-issues and proposed broken
changes; `copilot-review-apply` then applied them, which pushed a new head,
which Copilot reviewed again — a review→fix→push→re-review loop with no round
cap, because the marker bounds one review, not the pull request. Snowcat's
pull-request cure read the unresolved Copilot threads as decay and sent a
second fixer at the same review. Two automated actors, one pull request, no
bound.

Snowcat now gates worker pull requests behind bounded review
([Snowcat ADR-0065](https://github.com/frostyard/snowcat/blob/main/docs/adr/0065-gate-worker-pull-requests-behind-bounded-review.md)):
in a gated repository a worker's pull request stays a draft until an
independent, read-only review round passes — at most three rounds per pull
request, each block turned into one bounded fix — and only then becomes
ready for a human and for Copilot. The effort level is a separate fact: it is
not a ruleset option but an organization (or repository) setting under
*Copilot → Code review → Review effort level*, and the organization's is now
*Balanced*.

## Decision

- **`copilot-review-apply` is retired.** Repositories that carry the workflow
  remove it and its documentation (chairlift `docs/quality.md`, lab
  `docs/automated-review.md`, pilothouse `docs/ai-fix-workflow.md` and
  `docs/design/agent-workflows.md`, snosi `docs/design/ci-cd.md` and its
  path-filter test, testsuite `docs/copilot-review-apply.md`, and the tests
  that pin the secret name in those workflows). Nothing in the fleet asks an
  AI fixer to act on an AI reviewer's findings without a per-pull-request
  bound; the bounded fixer for worker pull requests is Snowcat's review gate.
- **Copilot reviews what a human is about to review.** Automatic Copilot
  review remains request-on-ready (the updex `claude-code-review.yml` shape:
  `pull_request_target` on non-drafts, a review request and nothing else) or
  the ruleset rule without *review draft pull requests*; it is never asked to
  review a draft. The organization's effort level is *Balanced*; a repository
  may override it but not below.
- **Findings route to people.** A Copilot finding on a ready pull request is
  for the maintainer; where the pull request is a Snowcat worker's, Snowcat's
  cure treats an unresolved thread as decay and the worker replies or proposes
  a change, as ADR-0061 there already says. No workflow dispatches the Copilot
  coding agent against a review.
- The `ai-fix-requested` issue handoff and the `COPILOT_ASSIGNMENT_TOKEN`
  rules of ADR-0020 are unchanged: an issue a human labels is a bounded ask;
  a review is not.

## Consequences

- The Copilot review loop cannot recur: the only automated fixer on a pull
  request is bounded by rounds and by the draft quiet zone, and Copilot sees
  only pull requests that are ready.
- Five repositories lose a workflow and a doc page; the `copilot-review-apply`
  marker shape in ADR-0020 becomes historical (ADR-0020 stays Accepted; this
  ADR narrows its examples, it does not reverse its trust boundaries).
- Maintainers address Copilot findings themselves, or leave them to Snowcat's
  cure where the pull request is a worker's — one more thing to read, one
  fewer thing to undo.
- Repositories outside Snowcat's gate keep request-on-ready review only; they
  get no automated fixer at all, which is the state before
  `copilot-review-apply` existed.

## Alternatives considered

- **Keep the workflow and cap it per pull request:** rejected; a cap in a
  workflow is a second, weaker copy of the bound Snowcat already enforces, and
  it still pits two fixers against one review where Snowcat is on.
- **Keep the workflow but only for `changes_requested` reviews:** rejected;
  Copilot submits *Comment* reviews, so the trigger would be dead code that
  invites re-enabling.
- **Turn Copilot review off:** rejected; at *Balanced* on a ready pull request
  it is a useful second reader for the human. The problem was the loop and
  the level, not the reviewer.

## References

- Builds on: [ADR-0020](0020-ai-automation-trust-boundaries.md),
  [ADR-0019](0019-governance-as-code-and-risk-tiers.md)
- Snowcat side: [Snowcat ADR-0065](https://github.com/frostyard/snowcat/blob/main/docs/adr/0065-gate-worker-pull-requests-behind-bounded-review.md)
  and [Snowcat ADR-0061](https://github.com/frostyard/snowcat/blob/main/docs/adr/0061-cure-pull-requests-as-bounded-per-head-work.md)
- Shapes: the per-repository removal issues (one per repository, labelled
  for the fleet's queues where enrolled)
