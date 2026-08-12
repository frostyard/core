# 0017 — io.snosi.* OCI capability labels and the mechanics QA tier

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

Consumers of frostyard OCI images need machine-checkable security
assertions: installers must refuse images that lack Secure Boot evidence,
and QA (lab) must route images to the right test lanes. Meanwhile PR CI
must exercise the real build path without minting plausible-looking
production images — and PR builds cannot receive signing secrets.

## Decision

- Snosi-specific image assertions use the OCI label namespace
  **`io.snosi.*`**, layered on standard `org.opencontainers.image.*` labels
  (`vendor=frostyard`) and `containers.bootc=1`:
  - `io.snosi.bootc.secureboot-capable=true|false` — the hard gate:
    installers refuse images without `true`; lab lanes select on it.
  - `io.snosi.bootc.secureboot-assembly=<versioned token>` — assembly
    compatibility (e.g. `bootc-1.16.7-storage-digest-v1`).
  - `io.snosi.qa.mechanics-only=true` — QA-only image class.
- **Trusted labels are applied last** by the packager, after all
  caller-supplied labels, so a caller cannot forge or downgrade them. Label
  ordering is a trust mechanism, not cosmetics.
- The **mechanics tier**: PR builds publish under the `:mechanics` tag
  class with `secureboot-capable=false`, `qa.mechanics-only=true`, an
  all-caps "QA ONLY — NOT FOR INSTALLATION" description, no secrets, and no
  writes to the production registry path. Poisoned metadata, not a separate
  registry, is what makes them safe.

## Consequences

- Label *absence* is a hard security signal — tooling must fail closed on
  missing labels, never assume capable.
- The assembly token is versioned so an installer can refuse images
  assembled under an incompatible scheme without parsing versions.
- Namespace tension, recorded deliberately: labels use `io.snosi.*` while
  app identity uses `org.frostyard.*`
  ([ADR-0016](0016-reverse-dns-org-frostyard-identifiers.md)). The split is
  org identity vs product-internal assertion; new label families should
  follow the product namespace of whatever writes them.

## Alternatives considered

- **A separate QA registry for PR images:** images still look real once
  pulled; negative-capability labels travel with the artifact.
- **Encoding capability in the tag name only:** tags are mutable and
  droppable; labels survive digest-addressed pulls.

## References

- Shapes: [snosi `shared/outformat/image/buildah-package.sh`](https://github.com/frostyard/snosi/blob/main/shared/outformat/image/buildah-package.sh),
  [snosi `build-mechanics.yml`](https://github.com/frostyard/snosi/blob/main/.github/workflows/build-mechanics.yml),
  [lab secure-install lanes](https://github.com/frostyard/lab/tree/main/argo/workflow-templates)
- Builds on: [ADR-0016](0016-reverse-dns-org-frostyard-identifiers.md)
