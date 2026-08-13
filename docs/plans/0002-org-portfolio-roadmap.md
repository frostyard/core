# Plan: Organization portfolio stewardship

This plan turns core from a shared-material repository into the visible
planning surface for Frostyard's repository portfolio. It establishes a
reviewable lifecycle map, measurable adoption of core-managed practices, and
a quarterly priority cadence without replacing repository-local roadmaps.

## Baseline — 2026-08-12

- 57 organization repositories: 38 active and 19 archived.
- 24 active repositories received commits in the preceding 30 days.
- Core-managed skills are configured for 9 active repositories.
- Core has one indexed rollout plan, one recorded contributor, and no
  discussions despite organization discussions being enabled.
- Core distributes reusable skills, templates, documentation, scaffolds, and
  assets without a declared license.

The baseline is a starting measurement, not a target. Repository activity
alone does not determine strategic importance or maintenance status.

## Portfolio lifecycle

Every repository will have one explicit state in the portfolio map:

| State | Meaning | Review expectation |
| --- | --- | --- |
| Strategic | Required for a current organization outcome | Named outcome and near-term milestone |
| Maintained | Supported and accepting routine change | Named maintainer or team and current support surface |
| Incubating | Exploring a capability or product direction | Exit criteria and decision date |
| Maintenance | Supported for existing consumers; limited investment | Compatibility and security commitment |
| Superseded | Replaced by a named canonical repository | Migration path and archival trigger |
| Archive candidate | No supported future is intended | Owner confirmation before archival |

The map must name a canonical successor for every superseded repository and
must distinguish inactivity from an intentional maintenance posture.

## Phase 1 — Publish the portfolio map (near-term)

- Inventory all 57 repositories by product or organization capability.
- Assign each repository a lifecycle state, accountable owner, canonical
  successor where applicable, and last review date.
- Identify the organization-level outcomes for the next 90 days and map each
  outcome to the repositories that deliver it.
- Link repository-local plans rather than duplicating their implementation
  details in core.
- **Done when:** every repository appears exactly once in an indexed portfolio
  map, every active repository has an explicit lifecycle state, and every
  strategic repository is tied to a measurable 90-day outcome.

## Phase 2 — Make shared-practice adoption measurable (near-term)

- Resolve [core#57](https://github.com/frostyard/core/issues/57) by defining
  which lifecycle states are eligible for core-managed skill sync and which
  exclusions are intentional.
- Record coverage, latest successful sync, and sync lag for eligible
  repositories; set a target and review threshold before expanding the list.
- Sequence onboarding by strategic importance and risk rather than repository
  age. Keep rollout mechanics aligned with
  [ADR-0026](../adr/0026-distribute-core-skills-via-sync-prs.md).
- Complete the supply-chain work already sequenced in
  [Plan 0001](0001-docs-shape-rollout.md#phase-4--supply-chain-cleanup)
  before treating repository coverage as healthy.
- **Done when:** every eligible repository is either covered by sync or has a
  dated blocker, and the portfolio review reports both coverage and sync lag.

## Phase 3 — Clarify reuse and contribution governance (near-term)

- Resolve [core#58](https://github.com/frostyard/core/issues/58) with explicit
  licensing for code/scaffolds, documentation, and brand assets.
- Adopt a Code of Conduct and reporting path appropriate for the organization
  hub.
- Start one discussion for each proposed quarterly priority before promoting
  it into this roadmap, so maintainers and consumers can supply evidence.
- Use the existing [quality loop](../design/quality-loop.md) and
  [PR acceptance metric](../specs/pr-acceptance-metric.md) for changes to core;
  portfolio health metrics remain observational and must not bypass repository
  review gates.
- **Done when:** downstream reuse rights and contribution expectations are
  explicit, and the next quarterly priorities have an open evidence-gathering
  discussion.

## Phase 4 — Establish the quarterly review cadence

- Review lifecycle assignments and 90-day outcomes quarterly.
- Promote, maintain, supersede, or retire incubating work based on stated exit
  criteria rather than activity alone.
- Record changed organization-level decisions as ADRs and update this plan as
  work lands.
- Track four portfolio signals: strategic outcomes delivered, eligible
  repositories covered by core sync, median sync lag, and repositories with
  overdue lifecycle reviews.
- **Done when:** one quarterly review has updated the portfolio map, recorded
  decisions and owners, and published the next set of measurable outcomes.

## Later / ideas

- Standardize rolling GoReleaser snapshot concurrency across the Go
  repository portfolio under
  [ADR-0034](../adr/0034-cancel-stale-rolling-dev-releases.md), beginning with
  chairlift and pilothouse ([core#10](https://github.com/frostyard/core/issues/10)).
- Publish a generated organization dashboard after the lifecycle map and
  metric definitions are stable.
- Add external adoption indicators only where a repository has a user-facing
  product and a reliable signal.
- Define a standard end-of-life communication template for superseded
  repositories.

## Open questions

- **Who approves lifecycle-state changes?** Decide before Phase 1 completes;
  record an ADR if this introduces a new organization governance boundary.
- **Which repositories are eligible for mandatory core-managed skills?**
  Resolve through [core#57](https://github.com/frostyard/core/issues/57) by
  Phase 2.
- **How are mixed-license assets represented?** Resolve through
  [core#58](https://github.com/frostyard/core/issues/58) by Phase 3.

## References

- Tracks: [core#56](https://github.com/frostyard/core/issues/56)
- Builds on:
  [ADR-0025](../adr/0025-consolidate-repository-docs-into-docs.md),
  [ADR-0026](../adr/0026-distribute-core-skills-via-sync-prs.md),
  [ADR-0034](../adr/0034-cancel-stale-rolling-dev-releases.md)
- Coordinates with:
  [Plan 0001 — Org docs-shape and skills rollout](0001-docs-shape-rollout.md)
- Uses:
  [Quality loop](../design/quality-loop.md),
  [PR acceptance metric](../specs/pr-acceptance-metric.md)
