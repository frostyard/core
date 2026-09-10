# 0049 — Retire omarchy-apps without breaking Snosi

- **Status:** Proposed
- **Date:** 2026-09-09

## Context

`frostyard/omarchy-apps` is no longer strategic, but it is not
dependency-free. Its workflow can publish twelve packages to implicit
`stable` after a push to `main`. Merging its open dependency update would
trigger that publication.

The signed public index contains two versions of each package. Current Snosi
builds still consume `voxtype` and `moonlight-qt` as sysext inputs.
Archiving or deindexing everything before resolving those consumers would hide
an active product dependency.

## Decision

Retire `omarchy-apps` as a publisher, not as an artifact deletion:

- after this ADR is accepted, separately approve disabling repository Actions;
- close the current dependency update without merging;
- publish no new package versions from this repository;
- preserve current package objects and signed metadata; and
- remove production signing and R2 access after confirming credential scope.

Keep `voxtype` and `moonlight-qt` indexed until Snosi removes them or names a
successor whose explicit Trixie packages pass install and rollback tests.
Freeze the other ten package names. Deindexing or deletion is a later decision.

After the two consumers are resolved, replace active workflows with an EOL
notice, then separately approve repository archive. Preserve Git history,
recipes, checksums, and package manifests indefinitely.

Brian is interim owner of the retain-or-remove decision for `voxtype` and
`moonlight-qt`. Keeping current versions available during the suite migration
is the default; it implies neither support nor further releases.

## Consequences

- An obsolete publisher can stop producing unreviewed changes quickly.
- Snosi keeps building while its real dependencies are resolved.
- Frozen packages may age; they remain unsupported.
- The 24-object cohort and its provenance remain available.
- Archive follows dependency and credential cleanup instead of replacing it.

## Alternatives considered

- **Archive and delete immediately.** Rejected because Snosi consumes two
  packages and deletion is not readily reversible.
- **Leave publication active.** Rejected because a routine merge republishes
  all twelve packages through the legacy path.
- **Transfer all twelve packages.** Rejected because only two have known active
  Frostyard consumers.

## References

- Implements through:
  [Plan 0006](../plans/0006-nbc-retirement-and-debian-suite-migration-fast-path.md)
- Builds on:
  [ADR-0010](0010-publish-packages-via-repogen-to-r2.md) and
  [ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md)
- Related:
  [ADR-0048](0048-publish-debian-packages-to-explicit-codenames.md)

