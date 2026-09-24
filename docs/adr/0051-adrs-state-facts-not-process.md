# 0051 — ADRs state facts only, not the process that produced them

- **Status:** Accepted
- **Date:** 2026-09-23

## Context

An ADR is a durable record of a decision, not a transcript of the
conversation that produced it. Process detail — who asked for a change, who
was consulted, what they said, and how the author reached the conclusion —
is accurate at the time of writing but decays: it duplicates the PR
discussion, adds no information a future reader needs to apply the decision,
and blurs the line between the decision and its history. Neither the ADR
template, `AGENTS.md`, nor the PR review rubric named a check for this, so
nothing forced its removal before an ADR merged.

## Decision

Every ADR states context, decision, and consequences as facts. It does not
narrate who asked for the decision, who was consulted, what they said, or
the author's process in reaching it; that belongs in the PR description, not
the ADR. This applies to every ADR, new or amended, regardless of who
authored it.

The rule is placed in every surface that produces or checks an ADR:

- `docs/adr/TEMPLATE.md`'s comment block, next to the immutability note,
  since every new ADR starts from this template.
- `AGENTS.md` under "Working conventions (org-wide)", since every agent in
  this repository reads it.
- `docs/specs/pr-review-rubric.md`, as a new "ADR voice" check row, so a
  human or agent reviewer has a named check to apply.
- `.github/prompts/review.prompt.md`, as a corresponding numbered step, so
  the review runbook actually exercises the rubric row.
- `.github/pull_request_template.md`, as a Docs housekeeping checklist item,
  so the author sees the rule before requesting review, not only after.

## Consequences

- A reviewer has a specific, independently verifiable check for ADR
  narration instead of relying on general judgment.
- Authors must move process narrative — who was asked, who was consulted,
  what they said — into the PR description. This is a small extra step but
  keeps the ADR itself durable and free of transient conversational detail.
- Existing ADRs written before this rule are not retroactively edited; the
  rule governs new and amended text going forward.

## Alternatives considered

- **Leave it to reviewer judgment.** Rejected: reviewer judgment provides no
  named, independently verifiable check, and process narration in ADR text
  can pass review undetected without one.
- **Add the rule only to the rubric, not the template or AGENTS.md.**
  Rejected: an author following only the template would have no signal at
  draft time, and would rely on a reviewer catching it after the fact.

## References

- Shapes: [docs/adr/TEMPLATE.md](TEMPLATE.md),
  [AGENTS.md](../../AGENTS.md),
  [docs/specs/pr-review-rubric.md](../specs/pr-review-rubric.md),
  [.github/prompts/review.prompt.md](../../.github/prompts/review.prompt.md),
  [.github/pull_request_template.md](../../.github/pull_request_template.md)
- Builds on: [ADR-0019](0019-governance-as-code-and-risk-tiers.md)
  (review rubric as the enforcement surface)
- Evidence: [core#137](https://github.com/frostyard/core/pull/137)
  (ADR-0050, an ADR whose narration this rule now prohibits)
