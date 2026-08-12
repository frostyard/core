# 0028 — Retire snosi-install; firn is the frostyard A/B installer

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

- `snosi-install` (the bash native-A/B installer at
  [snosi `shared/native-installer`](https://github.com/frostyard/snosi))
  installs snosi's native A/B disk images: fetch and gpgv-verify the
  signed artifact index, stream the compressed image to disk while
  hashing it, relocate/grow the GPT, LUKS-encrypt `/var`, enroll TPM
  against the UKI's signed PCR 11, and stage MOK enrollment under Secure
  Boot.
- [firn](https://github.com/frostyard/firn) ports that logic to Go
  (behaviour-preserving, structure-fixed) as the A/B half of the single
  installer for all snosi families
  ([firn ADR-0004](https://github.com/frostyard/firn/blob/main/docs/adr/0004-single-installer-scope-and-support-matrix.md)),
  with the accepted stream-then-verify risk carried forward and the
  A/B-specific decisions recorded in
  [firn ADR-0008](https://github.com/frostyard/firn/blob/main/docs/adr/0008-ab-var-filesystem-choice.md)
  (`/var` filesystem) and
  [firn ADR-0009](https://github.com/frostyard/firn/blob/main/docs/adr/0009-ab-installs-require-partition-isolation.md)
  (partition isolation).
- The single installer ISO is the successor to `shared/native-installer`
  ([firn ADR-0010](https://github.com/frostyard/firn/blob/main/docs/adr/0010-single-installer-iso-in-snosi.md))
  and is merged into snosi (PR #693), which drives A/B installs through
  firn and removed the dead first-boot/live-setup wiring in the same
  change. firn's A/B path is validated end to end in nested VMs.
- Keeping the bash installer in service alongside firn means two A/B
  installers to keep in step.

## Decision

**firn is the frostyard installer for native A/B images; snosi-install
is retired.** The bash `native-installer` and its wiring are removed from
snosi (begun in #693), and firn's A/B path — the same recipe-driven
binary that serves the bootc path — is the sole A/B installer. Its origin
is preserved in firn's
[`NOTICE`](https://github.com/frostyard/firn/blob/main/NOTICE)
(`frostyard/snosi, shared/native-installer`).

This is the companion to
[ADR-0027](0027-retire-fisherman-superseded-by-firn.md), which retires
fisherman on the bootc side; together they make firn the one frostyard OS
installer.

## Consequences

- A/B install logic is now Go with unit tests (the hand-rolled awk
  account editing is reimplemented against fixture passwd/group/shadow
  files), sharing one codebase, test surface, and release with the bootc
  path.
- The stream-then-verify decision (no 2× scratch space on live media)
  moves into firn as a documented, accepted risk rather than living only
  in bash.
- **Negative:** any `snosi-install` script behaviour not yet ported must
  be filed against firn, not fixed in the retired script. Homelab/CI that
  invoked `/usr/libexec/snosi-install` must migrate to
  `firn install <recipe> --confirm <disk>`.

## Alternatives considered

- **Keep snosi-install for A/B, firn for bootc:** rejected — two
  installers for one job, the split firn ADR-0004/0010 exist to remove.
- **Port A/B into a second Go binary rather than firn's shared engine:**
  rejected — the recipe schema, progress protocol, disk/LUKS/TPM code,
  and installer ISO are shared between families; a separate binary would
  duplicate all of it.

## References

- Shapes: [firn](https://github.com/frostyard/firn),
  [firn ADR-0004](https://github.com/frostyard/firn/blob/main/docs/adr/0004-single-installer-scope-and-support-matrix.md),
  [firn ADR-0008](https://github.com/frostyard/firn/blob/main/docs/adr/0008-ab-var-filesystem-choice.md),
  [firn ADR-0009](https://github.com/frostyard/firn/blob/main/docs/adr/0009-ab-installs-require-partition-isolation.md),
  [firn ADR-0010](https://github.com/frostyard/firn/blob/main/docs/adr/0010-single-installer-iso-in-snosi.md)
- Source: retired snosi-install, recorded in firn's
  [`NOTICE`](https://github.com/frostyard/firn/blob/main/NOTICE) (snosi `shared/native-installer`)
- Related: [ADR-0027](0027-retire-fisherman-superseded-by-firn.md) (retires the bootc installer)
