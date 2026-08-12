# 0007 — The Frostyard sysext filename pattern and derived versions

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

Frostyard ships ~23 systemd-sysext overlays. systemd-sysupdate and updex
match updates purely by filename pattern, and repogen parses filenames to
build repository metadata — there is no manifest; **the filename is the
metadata store**. Three repos must agree byte-for-byte: snosi (producer),
repogen (publisher), updex (consumer). Debian package versions contain
epochs (`:`) which are filename-hostile.

## Decision

Sysext images are named
**`<name>_<version>_<osversion>_<arch>.raw[.zst|.xz|.gz]`**:

- Exactly four underscore-separated fields; no underscores inside a field.
  Underscores (not fedora-sysexts' hyphens) are the "Frostyard pattern".
- `<arch>` uses systemd naming (`x86-64`, never `x86_64`).
- `<osversion>` is the numeric `VERSION_ID` (trixie→`13`, forky→`14`),
  matching sysupdate's `%w` expansion.
- `<version>` is **derived, not authored**: it is the version of one declared
  `KEYPACKAGE` in the build manifest, with the Debian epoch separator `:`
  rewritten to `+`, plus an optional snosi-side `SYSEXT_REVISION` appended as
  `+rN` to force republication of tree-only fixes (publishing is
  skip-duplicates keyed on the versioned filename).
- Transfer files match with `<name>_@v_%w_%a.raw[.zst|.xz|.gz]`.

Because `+`, `:`, and `~` appear in derived versions, version comparison for
sysexts is dpkg-style, not semver (semver treats everything after `+` as
ignorable build metadata and collapses distinct versions to equal).

## Consequences

- A builder emitting `x86_64`, an extra underscore, or an unrewritten epoch
  silently drops out of the repository — repogen logs a debug line and skips.
  snosi's `sysextmv.sh` classifier (`*_*_*_*.*` glob) is equally strict.
- Forgetting a `SYSEXT_REVISION` bump means a content fix is silently never
  republished; forgetting the epoch rewrite means sysupdate never sees
  updates. Neither produces a build error — the grammar must be enforced by
  guards at build time.
- repogen's identity key for sysexts is `name:version:arch` (osversion
  excluded) — same name+version on two OS versions is treated as one package
  for conflict detection.

## Alternatives considered

- **fedora-sysexts hyphenated naming:** hyphens legitimately appear inside
  names and versions, making the grammar unparseable without a manifest.
- **A sidecar manifest per image:** two artifacts to keep in sync; the
  filename must be pattern-matchable by systemd-sysupdate anyway.

## References

- Shapes: [snosi `shared/sysext/postoutput/sysext-postoutput.sh`](https://github.com/frostyard/snosi/blob/main/shared/sysext/postoutput/sysext-postoutput.sh),
  [repogen sysext generator](https://github.com/frostyard/repogen/tree/main/internal/generator/sysext),
  [updex `docs/patterns.md`](https://github.com/frostyard/updex/blob/main/docs/patterns.md)
- Builds on: [ADR-0006](0006-os-artifact-versions-are-utc-timestamps.md)
- Related: [ADR-0008](0008-sysext-distribution-and-update-contract.md)
