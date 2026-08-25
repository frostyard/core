# Quality loop

Living document. Rationale:
[ADR-0019](../adr/0019-governance-as-code-and-risk-tiers.md),
[ADR-0029](../adr/0029-acmm-conformance-via-canonical-aliases.md).
Contracts: [specs/pr-review-rubric.md](../specs/pr-review-rubric.md),
[specs/pr-acceptance-metric.md](../specs/pr-acceptance-metric.md).
`docs/quality.md` is a conformance alias for this file (ADR-0029).

## Overview

How change quality is proposed, gated, observed, and learned from in this
repo. One loop, five stations:

```
PR template ──► review rubric ──► CI gates ──► corrections ──► promotion
(risk tier)     (spec)            (ci.yml)     (.memory/)      (AGENTS.md,
     ▲                                                          docs, skills)
     └────────────── acceptance metric (spec) observes the stream ─────────┘
```

## Design

- **Declare** — [.github/pull_request_template.md](../../.github/pull_request_template.md)
  makes every PR state its risk tier (highest applicable, never lower —
  ADR-0019) and walk the docs-housekeeping checklist.
- **Review** — the [PR review rubric](../specs/pr-review-rubric.md) is the
  contract a review applies; the
  [review runbook](../../.github/prompts/review.prompt.md) is its task-shaped
  form for agents.
- **Gate** — [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
  (ADR-0021-compliant) runs two jobs on every PR:
  - *docs-gate*: `node scripts/check-docs.mjs` checks docs-index coverage,
    relative-link integrity, and symlink resolution against
    [.coverage-thresholds.json](../../.coverage-thresholds.json) — all 1.0,
    `never_relax: true` (the ADR-0019 guardrail: the loop may tighten, never
    loosen). This is the coverage gate for a repo whose product is docs.
  - *scaffold-e2e*: the docs-site scaffold suite
    (`.agents/skills/frostyard-docs-site/scaffold/tests/`, aliased at
    `tests/e2e/scaffold-tests`) — `npm ci`, then `npm test` builds the real
    site (Astro + Pagefind) and asserts on the final `dist/` HTML.
- **Gate (fleet Go repositories)** — every enabled Go repository pins its
  tools in `mise.toml`/`mise.lock` (Go only in `go.mod`), requires them
  (no "skipping"), and exposes `make verify` (non-mutating; what a
  read-only reviewer runs), `make check` (developer, may format), and
  `make ci` (ADR-0022's gate, which calls `verify`)
  ([ADR-0043](../adr/0043-pin-repository-tools-in-mise-and-name-the-verify-gate.md)),
  exposed as the same three `make` targets in every repository whatever
  its language
  ([ADR-0044](../adr/0044-expose-the-make-gate-triad-in-every-repository.md));
  the organization gate checks presence, never versions, via
  `scripts/check-fleet-conventions.mjs` (`npm run check:fleet`) and CI's
  `fleet-conventions` job.
- **Learn** — corrections land in
  [.memory/corrections.jsonl](../../.memory/README.md) (append-only,
  five-field schema, ADR-0018) and are promoted into `AGENTS.md`, docs, or
  skills; promotion is the only sanctioned duplication.
- **Enforce mechanically** — [.claude/settings.json](../../.claude/settings.json)
  denies the ADR-0019 forbidden acts at the tool layer: merging PRs
  (`gh pr merge`), approving own work (`gh pr review --approve`), publishing
  releases (`gh release`), and pushing to `main`; session state lives in
  [.claude/session-summary.md](../../.claude/session-summary.md) (ADR-0025).
- **Observe** — the [PR acceptance metric](../specs/pr-acceptance-metric.md)
  summarizes the stream; it informs, never gates.

## Operational notes

Re-run every gate locally before pushing:

```
node scripts/check-docs.mjs
cd .agents/skills/frostyard-docs-site/scaffold && npm ci && npm test
```

Failure modes: a broken alias or missing index line fails docs-gate (fix the
canonical target or the index, never the alias); scaffold-e2e failures mean
the scaffold payload regressed — fix before merge, since consuming repos
copy it as-is.

## References

- Rationale: [ADR-0019](../adr/0019-governance-as-code-and-risk-tiers.md),
  [ADR-0021](../adr/0021-sha-pinned-actions-and-least-privilege-ci.md),
  [ADR-0029](../adr/0029-acmm-conformance-via-canonical-aliases.md),
  [ADR-0043](../adr/0043-pin-repository-tools-in-mise-and-name-the-verify-gate.md),
  [ADR-0044](../adr/0044-expose-the-make-gate-triad-in-every-repository.md)
- Contracts: [specs/pr-review-rubric.md](../specs/pr-review-rubric.md),
  [specs/pr-acceptance-metric.md](../specs/pr-acceptance-metric.md)
- Built in: the 2026-08-12 ACMM conformance PR
  (closes [core#22–#41](https://github.com/frostyard/core/issues/22))
