# 0003 — Record image provenance in /usr/share/frostyard

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

Frostyard OS images (snow, snowfield, cayo) are immutable and built from many
apt packages whose versions change every build. A running system, a support
script, or a changelog tool needs to answer "what exactly is in this image and
when was it built?" without registry access. The dpkg database is not a stable
answer: on native A/B images it is relocated into the immutable root, and its
format is not a friendly diffing surface.

## Decision

Every Frostyard image writes two provenance files into the org-namespaced
directory `/usr/share/frostyard/` at build time:

- `<IMAGE_ID>.packages.txt` — the full package inventory, as emitted by
  `apt list --installed`.
- `<IMAGE_ID>_build_date` — the build timestamp, UTC ISO-8601
  (`date -u +"%Y-%m-%dT%H:%M:%SZ"`).

Files are keyed by `IMAGE_ID`, and the same build writes `IMAGE_ID` into
`os-release` `ID=`, so a running system can locate *its own* manifest
unambiguously (see [ADR-0015](0015-os-release-image-identity.md)). The
inventory write deliberately has no `|| true`: if apt is ever dropped from an
image, the build must fail loudly rather than ship an empty manifest.

## Consequences

- Consumers (e.g. snosi's `packagediff.sh`) have one stable discovery path
  across all products; new products inherit it for free.
- The `apt list --installed` output format becomes an implicit contract —
  changing the generator breaks every diffing consumer.
- The naming asymmetry (`.packages.txt` dot-suffixed vs `_build_date`
  underscore, no extension) is frozen as-is; renaming now would break readers.
- Tension to watch: provenance sits in the org namespace
  (`/usr/share/frostyard`) while sibling generated metadata
  (`features.json`, `enablement-manifest.txt`) sits in the product namespace
  (`/usr/share/snosi`). [ADR-0004](0004-product-namespaced-filesystem-tiers.md)
  records the dividing rule.

## Alternatives considered

- **`/usr/share/<product>/`:** breaks any consumer that must work across
  products; the manifest is org-level provenance, not product implementation.
- **OCI labels only:** unavailable at runtime on the host without registry
  access, and absent entirely on native A/B disk images.
- **Rely on the dpkg database:** relocated on native A/B images, transport-
  specific, and a poor diff surface.

## References

- Shapes: [snosi `shared/scripts/common-postinst.sh`](https://github.com/frostyard/snosi/blob/main/shared/scripts/common-postinst.sh),
  [snosi `packagediff.sh`](https://github.com/frostyard/snosi/blob/main/packagediff.sh)
- Builds on: [ADR-0001](0001-record-architecture-decisions.md)
- Related: [ADR-0004](0004-product-namespaced-filesystem-tiers.md),
  [ADR-0015](0015-os-release-image-identity.md)
