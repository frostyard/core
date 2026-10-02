# Plan: Debian suite migration fast path

**Status:** Active. Governed by
[ADR-0048](../adr/0048-publish-debian-packages-to-explicit-codenames.md) as
amended by [ADR-0054](../adr/0054-remove-four-known-users-gates-from-suite-migration.md).

This plan sequences explicit Debian suites. Each GitHub, workflow, credential,
R2, publication, and archive mutation requires separate approval. No phase
authorizes production action merely by this plan's adoption.

## Phase 1 — Accept the suite boundary

- Apply [ADR-0048](../adr/0048-publish-debian-packages-to-explicit-codenames.md)
  as amended by [ADR-0054](../adr/0054-remove-four-known-users-gates-from-suite-migration.md):
  explicit immutable codenames, a protected single writer, and independent
  signed-`stable` and Trixie retention windows.
- **Done when:** ADR-0048 and ADR-0054 are Accepted on `core/main`; no
  implementation is authorized by acceptance alone.

## Phase 2 — Freeze and snapshot signed `stable`

- Freeze nonessential legacy writes under separate authorization.
- Snapshot signed `stable`, its indexes and referenced `pool/` bytes, with an
  immutable manifest; do not delete or rewrite objects. Preserve its readable,
  unchanged signed repository through at least 2027-09-30. Do not create a
  `stable`-to-codename redirect, symlink, or alias suite.
- **Done when:** signed `stable` is recoverable and its referenced bytes are
  verified, without a user-outreach prerequisite.

## Phase 3 — Establish explicit Trixie

- Make Repogen fail closed on missing inputs, mutable tools, and metadata reads.
- Add the protected single-writer path and per-codename serialization.
- Present `gchlog`'s exact Trixie canary, owned by **Lucilla** (Keeper of
  packages and sysext delivery, owner of `frostyard/gchlog`),
  for separate publication authorization.
- Populate only packages required by current Snosi builds and switch a test
  build to explicit `trixie`.
- **Done when:** Trixie install/update, conflicting publication, and rollback
  checks pass while signed `stable` remains unchanged.

## Phase 4 — Build and validate Forky

- Define and publish the smallest required package set only to `forky`.
- Prove isolation, clean install, update, and rollback to unchanged Trixie.
- Rebase and update Snosi PR #924, or replace it with a smaller current-main
  change, only after package and product validation passes.
- **Done when:** Forky and explicit Trixie independently install and rollback
  without rewriting either suite or signed `stable`.

## Phase 5 — Retain Trixie

- Keep Trixie readable for at least 90 days after Forky promotion under
  [ADR-0054](../adr/0054-remove-four-known-users-gates-from-suite-migration.md).
- Preserve signed `stable` separately through at least 2027-09-30 with its
  referenced `pool/` bytes unchanged and no codename alias.
- **Done when:** the minimum retention windows and rollback evidence are
  recorded; no expiry alone authorizes a suite removal.

## Out of scope

NBC and native A/B retirement and transition work belong to
[Plan 0008](0008-post-nbc-bootc-only-transition.md),
[ADR-0052](../adr/0052-remove-nbc-artifact-retention-gates.md), and
[ADR-0047](../adr/0047-retire-nbc-on-a-proportional-fast-path.md).
`omarchy-apps` retirement belongs to
[ADR-0049](../adr/0049-retire-omarchy-apps-without-breaking-snosi.md).
These are not suite-migration gates.

## References

- Implements: [ADR-0048](../adr/0048-publish-debian-packages-to-explicit-codenames.md)
  as amended by [ADR-0054](../adr/0054-remove-four-known-users-gates-from-suite-migration.md)
- Coordinates with: [Organization portfolio stewardship](0002-org-portfolio-roadmap.md),
  [Repogen multi-suite implementation plan](0007-support-suites-in-repogen.md)
- Separate retirement work: [Plan 0008](0008-post-nbc-bootc-only-transition.md),
  [ADR-0047](../adr/0047-retire-nbc-on-a-proportional-fast-path.md),
  [ADR-0052](../adr/0052-remove-nbc-artifact-retention-gates.md),
  [ADR-0049](../adr/0049-retire-omarchy-apps-without-breaking-snosi.md)
