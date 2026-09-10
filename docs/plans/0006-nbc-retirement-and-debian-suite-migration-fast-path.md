# Plan: NBC retirement and Debian suite migration fast path

This plan sequences proportional NBC retirement, explicit Debian suites, and
`omarchy-apps` retirement. No implementation phase begins until its Proposed
ADR is accepted by a human. Every GitHub, workflow, credential, R2,
publication, and archive mutation is separately presented for approval.

## Phase 1 — Accept the operating boundary

- Review and accept
  [ADR-0047](../adr/0047-retire-nbc-on-a-proportional-fast-path.md),
  [ADR-0048](../adr/0048-publish-debian-packages-to-explicit-codenames.md),
  and
  [ADR-0049](../adr/0049-retire-omarchy-apps-without-breaking-snosi.md).
- Name Brian as interim release and exception owner.
- **Done when:** the ADRs are Accepted on `core/main`. Merging this plan while
  they remain Proposed authorizes no implementation.

## Phase 2 — Freeze risk and contact the fleet

- Present the exact `omarchy-apps` Actions-disable and PR-close actions.
- Freeze routine NBC work and prepare its EOL README.
- Contact the other three known users and record product, hardware, and
  migration disposition.
- Snapshot signed `stable` and create an immutable manifest without deleting
  or rewriting objects.
- **Done when:** no unapproved retirement-path publication can occur, every
  known user has a disposition, and `stable` is recoverable.

## Phase 3 — Establish explicit Trixie

- Make Repogen fail closed on missing inputs, mutable tools, and metadata reads.
- Add the protected single-writer path and per-codename serialization.
- Present `gchlog`'s exact Trixie canary for approval.
- Populate only packages required by current Snosi builds and switch a test
  build to explicit `trixie`.
- **Done when:** Trixie install/update, conflicting publication, and rollback
  checks pass while `stable` remains unchanged.

## Phase 4 — Prove the actual migration path

- Install every reported product/hardware class from the published Firn ISO.
- Run one real update and one user-data-preserving rollback per class.
- Observe 48 hours of use spanning at least one real publication.
- Make actionable migration documentation Firn-only.
- **Done when:** each in-use configuration is green or its limitation is
  disclosed directly to the affected user.

## Phase 5 — Build and validate Forky

- Define and publish the smallest required package set only to `forky`.
- Prove isolation, clean install, update, and rollback to unchanged Trixie.
- Rebase and update Snosi PR #924, or replace it with a smaller current-main
  change, only after package and product gates pass.
- **Done when:** known users can move to Forky and return to explicit Trixie
  without rewriting either suite.

## Phase 6 — Complete retirement

- Apply separately approved NBC EOL, backlog, publication, and credential
  actions.
- Remove native A/B from supported surfaces while preserving history.
- Resolve `voxtype` and `moonlight-qt`, then remove `omarchy-apps` workflows
  and credentials.
- Verify retained artifacts and present exact archive settings for approval.
- **Done when:** both retirement repositories have no active publication,
  credential, or supported-product edges and their artifacts remain verifiable.

## Later / ideas

- Replace Brian as interim owner if the contributor group grows.
- Expand validation only when new users or hardware create demonstrated need.
- Add stronger attestations or external locking only if one writer is
  insufficient.

## Open questions

- **Which products and hardware are in use?** Resolve by direct outreach.
- **Retain or remove `voxtype` and `moonlight-qt`?** Brian decides before
  Phase 6; frozen existing versions are the default.

## References

- Implements:
  [ADR-0047](../adr/0047-retire-nbc-on-a-proportional-fast-path.md),
  [ADR-0048](../adr/0048-publish-debian-packages-to-explicit-codenames.md),
  and
  [ADR-0049](../adr/0049-retire-omarchy-apps-without-breaking-snosi.md)
- Coordinates with:
  [Organization portfolio stewardship](0002-org-portfolio-roadmap.md)

