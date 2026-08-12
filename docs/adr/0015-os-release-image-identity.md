# 0015 — os-release is the image identity surface; resolve VARIANT_ID → IMAGE_ID → ID

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

Host tools need to know *which Frostyard image* they are running on: updex
expands sysupdate specifiers, provenance files are keyed per image
([ADR-0003](0003-image-provenance-in-usr-share-frostyard.md)), and sysext
compatibility matching keys off image identity. The identity must also
cover non-frostyard hosts (ublue/Fedora variants) that updex supports.

## Decision

- Snosi builds write the product's **`IMAGE_ID` into `os-release` `ID=`**
  (and keep `IMAGE_ID` itself), so identity is readable through the
  standard file with standard tools.
- Consumers resolve identity by reading `/etc/os-release` then
  `/usr/lib/os-release` (first readable wins) and preferring
  **`VARIANT_ID`, then `IMAGE_ID`, then `ID`** — `VARIANT_ID` is what
  ublue-os and Fedora variants set, `IMAGE_ID` is what frostyard images
  set, `ID` is the last resort.
- In native A/B profiles, `ImageId` deliberately stays the bootc product
  name (`cayo`, not `cayo-ab`): branding, os-release, and sysext matching
  key off `ImageId`, while transport is expressed in the channel name and
  detected via the marker file
  ([ADR-0005](0005-native-ab-marker-and-update-state-files.md)).

## Consequences

- One cross-repo contract couples snosi (writer) and updex (reader);
  changing what snosi writes requires checking the resolution ladder.
- os-release identity answers "which product", **not** "which transport" —
  it is identical across bootc and native A/B by design; tools needing the
  transport must use the marker file, never `IMAGE_ID`.
- Non-frostyard hosts resolve correctly without special-casing because the
  ladder tries their key first.

## Alternatives considered

- **A custom frostyard identity file:** os-release is already universal,
  spec'd, and read by every tool; a private file adds a parser everywhere.
- **`IMAGE_ID` first in the ladder:** would misidentify ublue variants that
  set both `IMAGE_ID` (base image) and `VARIANT_ID` (actual variant).

## References

- Shapes: [snosi `shared/scripts/common-postinst.sh`](https://github.com/frostyard/snosi/blob/main/shared/scripts/common-postinst.sh),
  [updex `config/transfer.go`](https://github.com/frostyard/updex/blob/main/config/transfer.go)
- Builds on: [ADR-0003](0003-image-provenance-in-usr-share-frostyard.md),
  [ADR-0005](0005-native-ab-marker-and-update-state-files.md)
