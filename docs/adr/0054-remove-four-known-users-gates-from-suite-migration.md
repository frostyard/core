# 0054 — Remove four-known-users gates from suite migration

- **Status:** Proposed
- **Date:** 2026-10-02

## Context

[ADR-0048](0048-publish-debian-packages-to-explicit-codenames.md) governs the
suite migration in [Plan 0006](../plans/0006-nbc-retirement-and-debian-suite-migration-fast-path.md)
and [Plan 0007](../plans/0007-support-suites-in-repogen.md). It requires
Trixie to remain readable for at least 90 days after Forky promotion **“and
until all four known users confirm migration.”** That confirmation condition
also appears as user-disposition gates in the plans. ADR-0048 separately
requires signed `stable` to remain readable and unchanged through at least
2027-09-30 and names `gchlog` as the separately approved Trixie canary.

## Decision

Remove the four-known-users confirmation condition for Trixie retention and
every user-disposition gate on the suite migration established by ADR-0048.
Trixie remains readable for at least 90 days after Forky promotion; no user
confirmation is a condition for ending that minimum window.

Keep the signed `stable` repository readable and unchanged through at least
2027-09-30, including its signed indexes and every referenced `pool/` package
byte. Do not redirect, symlink, or alias the `stable` suite to a codename.
`gchlog` remains the Trixie canary under separate publication authorization.
All other ADR-0048 decisions remain in force.

## Consequences

- Suite migration and Trixie retention no longer depend on individual user
  replies or recorded dispositions. User support remains communication, not
  a publication, promotion, or retention gate.
- The signed `stable` recovery source remains available and byte-preserved
  through its existing floor, independently of Trixie's 90-day minimum.
- **Negative:** Trixie may be removed after its minimum retention period
  without confirmation that all four known users have migrated. Communicate
  migration and support limitations without representing contact as a gate.
- Publication, credentials, and repository mutations still need separate
  authorization; this decision does not authorize removal of either suite.

## Alternatives considered

- **Keep confirmation as a Trixie removal prerequisite:** rejected because an
  unanswered or open disposition would extend the suite retention indefinitely.
- **Replace `stable` with a codename alias:** rejected because it would change
  the signed recovery source's identity and bytes.

## References

- Supersedes in part: [ADR-0048](0048-publish-debian-packages-to-explicit-codenames.md)
  (four-known-users conditions only)
- Shapes: [Plan 0006](../plans/0006-nbc-retirement-and-debian-suite-migration-fast-path.md),
  [Plan 0007](../plans/0007-support-suites-in-repogen.md)
- Builds on: [ADR-0033](0033-link-maintenance-in-immutable-adrs.md),
  [ADR-0052](0052-remove-nbc-artifact-retention-gates.md)
