# 0006 — OS artifact versions are 14-digit UTC timestamps

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

Every OS image build needs a version usable as: mkosi image version, GHCR
tag, `org.opencontainers.image.version` label, and native artifact filename
component. GPT partition names impose a hard ceiling of 36 UTF-16 code
units, and snosi's native A/B contract budgets partition labels as
`<ImageId>_<version>_{r,v}` — worst case `snowfield` + version + suffix.
Builds are continuous, not release-driven, so semantic versioning carries no
information.

## Decision

An OS artifact version is exactly **14 ASCII digits of UTC time,
`YYYYMMDDHHMMSS`** (`^[0-9]{14}$`). No suffixes of any kind — no `+rN`, no
`-dirty`, no build metadata. The same string is the mkosi version, the
registry tag, the OCI version label, and the filename version field.

Currency comparisons always compare **versions, never digests** — the same
build has a different digest per transport.

GitHub *Release* tags are a separate, human-facing scheme
(`YYYY-MM-DD.N` with a daily counter); they never replace the image version,
which release bodies carry in a machine-readable marker instead.

## Consequences

- Versions sort lexicographically = chronologically; "newer" is a string
  compare everywhere (shell, sysupdate, workers).
- The 14-unit length is load-bearing: the partition-label budget is frozen at
  30 code units (`snowfield_<14>_v` = 26). Any versioning change silently
  breaks partition labelling — hence the frozen regex.
- Two coexisting tag schemes (image `YYYYMMDDHHMMSS`, release `YYYY-MM-DD.N`)
  must not be conflated; this ADR is the record of why both exist.
- Sysext versions deliberately do **not** use this scheme — they derive from
  package versions ([ADR-0007](0007-frostyard-sysext-filename-pattern.md)).

## Alternatives considered

- **Semver:** conveys nothing for timestamp-driven continuous builds and
  invites suffixes that blow the partition-label budget.
- **git describe / short commit:** not ordered, so "is an update available"
  becomes a registry round-trip instead of a compare.

## References

- Shapes: [snosi `mkosi.version`](https://github.com/frostyard/snosi/blob/main/mkosi.version),
  [snosi `docs/native-ab-contracts.md`](https://github.com/frostyard/snosi/blob/main/docs/native-ab-contracts.md),
  [lab secure-install lanes](https://github.com/frostyard/lab/tree/main/argo/workflow-templates)
- Builds on: [ADR-0001](0001-record-architecture-decisions.md)
- Related: [ADR-0007](0007-frostyard-sysext-filename-pattern.md)
