# 0027 — Retire fisherman; firn is the frostyard bootc installer

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

- [fisherman](https://github.com/frostyard/fisherman) is frostyard's Go
  installer for bootc OS images: GPT partitioning, LUKS, `bootc install
  to-filesystem` via podman, TPM2 enrollment, and the secure-install
  (schema-1) contract.
- [firn](https://github.com/frostyard/firn) was created as a
  GPL-3.0-only, copy-with-attribution rewrite of fisherman
  ([firn ADR-0003](https://github.com/frostyard/firn/blob/main/docs/adr/0003-rewrite-fisherman-as-firn.md)),
  scoped to be the **single** installer for every snosi image family —
  bootc and native A/B alike
  ([firn ADR-0004](https://github.com/frostyard/firn/blob/main/docs/adr/0004-single-installer-scope-and-support-matrix.md)) —
  delivered on one installer ISO built in snosi
  ([firn ADR-0010](https://github.com/frostyard/firn/blob/main/docs/adr/0010-single-installer-iso-in-snosi.md)).
- firn has now shipped and is validated on the bootc path: the single
  installer ISO is merged into snosi (PR #693), and firn performs bootc
  installs — including encrypted snow with `tpm2-luks-passphrase` — from
  that ISO, verified end to end in VMs
  ([firn ADR-0012](https://github.com/frostyard/firn/blob/main/docs/adr/0012-bootc-install-from-ram-installer.md)).
- Keeping fisherman in service alongside firn means two installers
  covering the same responsibility, drifting apart over time.

## Decision

**firn is the frostyard installer for bootc OS images; fisherman is
retired.** Its repository is archived and receives no further feature
development. firn carries fisherman's proven install logic forward as
copy-with-attribution — fisherman's origin and per-file provenance are
preserved in firn's `NOTICE` and file headers, and its incident comments
travel with the ported code. Any fisherman capability firn does not yet
implement is tracked in firn's roadmap, not by keeping fisherman alive.

snosi-install (the bash A/B installer fisherman never covered) is retired
in the companion [ADR-0028](0028-retire-snosi-install-superseded-by-firn.md).

## Consequences

- One bootc installer to maintain, test, and release (firn), driven by
  firn's recipe-schema and progress-protocol contracts rather than a
  second Go codebase.
- fisherman's git history, attribution, and hard-won incident knowledge
  are preserved (archived repo plus firn's ported code and `NOTICE`).
- **Negative:** fisherman-only features not yet ported — Windows data
  slurp, OEM vendor detection, cache pre-warming, the full secure-install
  schema-1 path — are unavailable until firn implements them (firn
  roadmap "Later"). Anyone still invoking fisherman must migrate to firn
  plus a recipe.
- firn's medium is the all-in-RAM single ISO, so its bootc install
  mechanics differ from fisherman's live-media approach
  ([firn ADR-0012](https://github.com/frostyard/firn/blob/main/docs/adr/0012-bootc-install-from-ram-installer.md)):
  fisherman is not a reference for how firn installs, only for what it installs.

## Alternatives considered

- **Keep fisherman for bootc, firn for A/B:** rejected — two installers
  for one job, defeating the consolidation firn ADR-0004/0010 exist to
  achieve.
- **Freeze but do not archive fisherman:** rejected — a live-looking repo
  invites drift and accidental use; archiving states the decision plainly
  while keeping the history readable.

## References

- Shapes: [firn](https://github.com/frostyard/firn),
  [firn ADR-0003](https://github.com/frostyard/firn/blob/main/docs/adr/0003-rewrite-fisherman-as-firn.md),
  [firn ADR-0004](https://github.com/frostyard/firn/blob/main/docs/adr/0004-single-installer-scope-and-support-matrix.md),
  [firn ADR-0010](https://github.com/frostyard/firn/blob/main/docs/adr/0010-single-installer-iso-in-snosi.md),
  [firn ADR-0012](https://github.com/frostyard/firn/blob/main/docs/adr/0012-bootc-install-from-ram-installer.md)
- Source: retired [fisherman `internal/install/bootc.go`](https://github.com/frostyard/fisherman/blob/main/internal/install/bootc.go)
- Related: [ADR-0028](0028-retire-snosi-install-superseded-by-firn.md) (retires the A/B installer)
