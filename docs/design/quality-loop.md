# Quality loop

Living document. Rationale:
[ADR-0018](../adr/0018-org-wide-agent-instruction-and-knowledge-surfaces.md),
[ADR-0019](../adr/0019-governance-as-code-and-risk-tiers.md),
[ADR-0029](../adr/0029-acmm-conformance-via-canonical-aliases.md),
[ADR-0068](../adr/0068-label-pull-requests-that-touch-high-risk-paths.md).
Contracts: [specs/pr-review-rubric.md](../specs/pr-review-rubric.md),
[specs/pr-acceptance-metric.md](../specs/pr-acceptance-metric.md),
[specs/risk-paths.md](../specs/risk-paths.md).
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
- **Flag risk paths** — each repository lists its high-risk paths in
  `.github/risk-paths.json`; core's reusable workflow labels a PR that
  touches 1 path with `risk:high`; the label routes the PR to the owner's
  review or the accountable owner's read ([ADR-0068](../adr/0068-label-pull-requests-that-touch-high-risk-paths.md),
  [risk paths spec](../specs/risk-paths.md)).
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
    (`.agents/skills/frostyard-docs-site/tests/`, aliased at
    `tests/e2e/scaffold-tests`) — installs the hash-locked requirements and
    builds the real site with `properdocs build --strict` (ProperDocs +
    MaterialX), then asserts on the final `dist/` output.
- **Gate (fleet repositories)** — every enabled repository pins its
  tools in `mise.toml`/`mise.lock`, requires them
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
- **Sweep (every code repository)** — the
  [repository baseline](../specs/repository-baseline.md) lists, as rows
  `B1` to `B16`, what every frostyard code repository carries
  ([ADR-0071](../adr/0071-hold-every-code-repository-to-one-baseline.md)),
  including the tool docs site
  ([ADR-0070](../adr/0070-build-tool-docs-sites-with-materialx-on-github-pages.md))
  and the fleet Go and golangci-lint versions. The weekly conformance sweep
  reads it at core's `origin/main` and files one `sweep` issue for each
  failed row; owners fix the gaps in normal work. The organization gate
  stays the presence check above.
- **Learn** — corrections land in
  [.memory/corrections.jsonl](../../.memory/README.md) (append-only,
  five-field schema, ADR-0018) and are promoted into `AGENTS.md`, docs, or
  skills; promotion is the only sanctioned duplication.
  `scripts/check-corrections.mjs` (`npm run check:corrections`, part of
  `make verify`) validates every line; with `--base <ref>` it also enforces
  append-only, where the only allowed change to an existing line is an empty
  `promoted_to` that is filled.
  - **Blocker to guard.** When a review (cross-review, owner review, or a
    human) finds a blocking point, the PR that fixes it also adds a guard in
    the same PR: a targeted test that fails without the fix (preferred), or
    an `AGENTS.md` rule when no test can catch it. The same PR appends one
    line to `.memory/corrections.jsonl`: `evidence` names the PR and the
    review, and `promoted_to` names the test or the rule.
  - **Lessons live in the repository.** A lesson about one repository goes
    into that repository by PR — a test, an `AGENTS.md` rule, or a
    corrections line — so other agents, other tools, and humans see it.
    Agent-private memory keeps only an agent's role, its owner's
    preferences, lessons that span repositories, and facts of one machine.
  - **Weekly promotion.** Each week (the Friday hygiene line) each owner runs
    `node scripts/corrections-report.mjs --root ~/projects --ref origin/main`
    against its local checkouts, after a `git fetch` in each. With `--ref` it
    reads each `.memory/corrections.jsonl` at that ref, once per clone, so a
    line on an unmerged branch, an uncommitted edit, or a second worktree is
    not counted; a checkout that has the file but not the ref is listed as
    unreadable. Without `--ref` it reads the working trees. It reads only
    and lists, per repository, the lines with an empty `promoted_to`, and
    the scopes that repeat (2 or more lines in 1
    repository, or 1 scope in 2 or more repositories). A repeat in 1
    repository becomes an `AGENTS.md` rule or a test; a repeat across
    repositories becomes a core skill or ADR; the owner then fills
    `promoted_to` by PR.
- **Enforce mechanically** — [.claude/settings.json](../../.claude/settings.json)
  denies the ADR-0019 forbidden acts at the tool layer: merging PRs
  (`gh pr merge`), approving own work (`gh pr review --approve`), publishing
  releases (`gh release`), and pushing to `main`; session state lives in
  [.claude/session-summary.md](../../.claude/session-summary.md) (ADR-0025).
- **Observe** — the [PR acceptance metric](../specs/pr-acceptance-metric.md)
  summarizes the stream; it informs, never gates. Its revert rule and its
  escaped-defect count (PRs reverted, or named as fixed, within 7 days of
  merge) are computed by `scripts/pr-outcomes.mjs`, read-only. The weekly
  [flaky-test scan](../specs/flaky-test-scan.md)
  (`scripts/flaky-scan.mjs`) finds Actions jobs that failed and then passed
  on the same SHA, files 1 issue per flaky test in the repository where it
  ran, and records rerun counts for the fleet metrics.

## Operational notes

Re-run every gate locally before pushing:

```
node scripts/check-docs.mjs
node --test .agents/skills/frostyard-docs-site/tests/*.test.mjs
```

Failure modes: a broken alias or missing index line fails docs-gate (fix the
canonical target or the index, never the alias); scaffold-e2e failures mean
the scaffold payload regressed — fix before merge, since consuming repos
copy it as-is.

## References

- Rationale: [ADR-0018](../adr/0018-org-wide-agent-instruction-and-knowledge-surfaces.md),
  [ADR-0019](../adr/0019-governance-as-code-and-risk-tiers.md),
  [ADR-0021](../adr/0021-sha-pinned-actions-and-least-privilege-ci.md),
  [ADR-0029](../adr/0029-acmm-conformance-via-canonical-aliases.md),
  [ADR-0068](../adr/0068-label-pull-requests-that-touch-high-risk-paths.md),
  [ADR-0043](../adr/0043-pin-repository-tools-in-mise-and-name-the-verify-gate.md),
  [ADR-0044](../adr/0044-expose-the-make-gate-triad-in-every-repository.md),
  [ADR-0070](../adr/0070-build-tool-docs-sites-with-materialx-on-github-pages.md),
  [ADR-0071](../adr/0071-hold-every-code-repository-to-one-baseline.md)
- Contracts: [specs/pr-review-rubric.md](../specs/pr-review-rubric.md),
  [specs/pr-acceptance-metric.md](../specs/pr-acceptance-metric.md),
  [specs/risk-paths.md](../specs/risk-paths.md),
  [specs/flaky-test-scan.md](../specs/flaky-test-scan.md),
  [specs/repository-baseline.md](../specs/repository-baseline.md)
- Built in: the 2026-08-12 ACMM conformance PR
  (closes [core#22–#41](https://github.com/frostyard/core/issues/22))
