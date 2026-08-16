# 0020 — Trust boundaries for AI automation in CI

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

Frostyard repos run AI reviewers and AI fixers in CI. A model given a
write-capable token, or run against attacker-controlled PR code, is a
privilege-escalation path: PR content is untrusted input, and review text
itself can carry injected instructions.

## Decision

- **The model never holds a write token.** AI analysis runs in a job with
  read-only permissions and returns schema-validated JSON; a *separate* job
  with only `pull-requests: write` and no AI credential re-validates and
  posts the result.
- **Privileged workflows never check out or execute PR-controlled code**
  (`pull_request_target` jobs carry this as a mandatory comment; review
  jobs check out the base branch).
- **Automation is idempotent via hidden HTML markers** in posted comments —
  `<!-- <job>:<id> -->` (e.g. `<!-- copilot-review-apply:<reviewId> -->`,
  `<!-- ai-fix-requested:N -->`) — so retriggered workflows never
  double-post or double-apply.
- **The `ai-fix-requested` label** is the standard trigger to hand an issue
  to the Copilot agent, authenticated by the fleet-wide secret
  **`COPILOT_ASSIGNMENT_TOKEN`** — one canonical name, **no aliases**
  (historical spellings `COPILOT_AGENT_TOKEN`, `COPILOT_ASSIGN_PAT` must
  not be retained; aliases hide drift). It must be a user-scoped token (an
  installation `GITHUB_TOKEN` cannot start the agent), and its absence
  fails loudly with the exact string
  `COPILOT_ASSIGNMENT_TOKEN is not configured`, never a silent skip.
- Machine-readable release-note data uses the same hidden-marker technique
  (e.g. snosi's `<!-- snow-tag: NNNNNNNNNNNNNN -->`).

## Consequences

- A prompt-injected model can at worst emit bad JSON that a dumb validator
  rejects; it cannot merge, push, or post directly.
- The analyze/publish split doubles job count per AI workflow — accepted.
- Secret-name canonicalization makes failures uniform across repos and
  lets one fleet doc (snosi's) govern rollout ordering.

## Alternatives considered

- **One job with both AI credential and write token:** the exact
  escalation path this ADR forbids.
- **Deduplication by searching comment text:** brittle against edits;
  hidden markers are stable keys.

## References

- Shapes: [chairlift `claude-code-review.yml`](https://github.com/frostyard/chairlift/blob/main/.github/workflows/claude-code-review.yml),
  [snosi `docs/copilot-automation-secret.md`](https://github.com/frostyard/snosi/blob/main/docs/copilot-automation-secret.md),
  [lab `docs/automated-review.md`](https://github.com/frostyard/lab/blob/main/docs/automated-review.md),
  ai-fix workflows in updex/pilothouse
- Builds on: [ADR-0019](0019-governance-as-code-and-risk-tiers.md)
- Related: [ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md)
- Extended by:
  [ADR-0035](0035-author-organization-authority-as-strict-json.md), which
  publishes strict organization authority without storing provider credentials
  or worker execution state
