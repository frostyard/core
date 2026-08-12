# 0009 — repository.frostyard.org is the single artifact origin with frozen namespaces

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

Frostyard publishes many artifact kinds — apt/rpm/apk/pacman packages,
sysext images, native A/B disk images, installer ISOs, build manifests.
Shipped `.transfer` files, installers, a Cloudflare Worker, and lab's QA
lanes all hardcode URLs; those bytes live in deployed images and cannot be
rotated cheaply. Storage is one Cloudflare R2 bucket fronted by a CDN.

## Decision

All public artifacts are served from **`https://repository.frostyard.org`**,
backed by the single R2 bucket **`frostyardrepo`**. Path namespaces are
frozen and versioned:

- `pool/` + `dists/` — Debian packages (single `main` component).
- `ext/<name>/` — sysext repositories
  ([ADR-0008](0008-sysext-distribution-and-update-contract.md)).
- `os/native/v1/<product>/x86-64/` — native A/B disk artifacts.
- `isos/` and `isos/native/v1/` — installer ISOs (stable names may redirect
  to immutable versioned objects).
- `manifests/` — build manifests.

Publish tooling takes the **bucket root** as its destination and appends the
frozen path itself — paths are never caller-assembled. In the native
namespaces, `SHA256SUMS` (+ detached `SHA256SUMS.gpg`) is the machine-read
**channel pointer**: it normally lists only the promoted version, is served
`Cache-Control: no-store`, and promotion order is signature-first,
manifest-last, followed by an explicit CDN purge.

## Consequences

- Every repo shares one origin and one bucket; a whole-hostname cache purge
  affects all products — purges are a cross-repo-visible operation.
- The `v1` path segment is the escape hatch: layout changes mean a `v2`
  namespace beside the old one, never mutation of `v1`.
- The bucket, not any git repo, is the source of truth for what is published
  ([ADR-0010](0010-publish-packages-via-repogen-to-r2.md)).
- Known naming trap, now recorded: the native publication path uses the bare
  product name (`os/native/v1/cayo/`), while installer `--product` vocabulary
  uses the `-ab`-suffixed channel name. Do not conflate them.

## Alternatives considered

- **GitHub Releases as the public origin:** no apt/dnf/sysupdate-compatible
  layout, and rate limits on fleet-wide update polling.
- **Per-repo buckets/origins:** multiplies secrets, Worker routes, and
  trust anchors baked into images.

## References

- Shapes: [snosi `shared/native-ab/publish/publish-lib.sh`](https://github.com/frostyard/snosi/blob/main/shared/native-ab/publish/publish-lib.sh),
  [snosi `workers/native-installer-redirect`](https://github.com/frostyard/snosi/tree/main/workers/native-installer-redirect),
  [repogen README](https://github.com/frostyard/repogen/blob/main/README.md)
- Builds on: [ADR-0001](0001-record-architecture-decisions.md)
- Related: [ADR-0008](0008-sysext-distribution-and-update-contract.md),
  [ADR-0010](0010-publish-packages-via-repogen-to-r2.md)
