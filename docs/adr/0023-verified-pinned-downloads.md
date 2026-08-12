# 0023 — External downloads are version-pinned and checksum-verified

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

Builds and CI lanes across the org fetch external artifacts: upstream
binaries into OS images, tools into credential-bearing pods, installer
media into QA lanes. A bare `curl` of a `latest` URL makes the build
non-reproducible and hands execution to whoever controls the origin — in
some cases inside pods holding org credentials.

## Decision

- **No build or workflow fetches an external artifact directly.** Every
  download resolves through a pinned URL **and** an expected SHA256, and a
  mismatch deletes the file and fails loudly.
- URLs are pinned to a version or commit — never `latest`, never a branch.
- Pins live in **one declared registry per consumer**, so updating a pin is
  a reviewed diff and unrelated consumers don't re-trigger each other's CI
  (snosi splits `sysext-checksums.json` / `image-checksums.json` /
  `package-versions.json` for exactly this reason; lab pins inline as
  paired `<TOOL>VER`/`<TOOL>SHA` variables; dakota uses
  `SECURE_*_SHA256`).
- Adding a pinned download **requires adding a matching update-check** (a
  scheduled workflow that flags new upstream versions), so pinning doesn't
  quietly become staleness.
- Where an artifact is resolved from a signed index rather than pinned
  directly, the index signature is verified *before* any filename or digest
  in it is trusted ([ADR-0014](0014-single-gpg-trust-root.md)), and
  failure never downgrades to an unverified fetch.

## Consequences

- Supply-chain compromise of an upstream origin is detected at fetch time;
  builds are reproducible per pin-set.
- Every new dependency costs a registry entry plus an update check — a
  deliberate speed bump.
- The per-consumer registry split is load-bearing for CI cost: collapsing
  the files reintroduces cross-triggering.

## Alternatives considered

- **TLS-only trust:** protects transport, not a compromised or re-tagged
  origin.
- **One org-wide checksum registry:** every pin bump would trigger every
  consumer's CI; per-consumer registries scope the blast radius.

## References

- Shapes: [snosi `shared/download/verified-download.sh`](https://github.com/frostyard/snosi/blob/main/shared/download/verified-download.sh),
  [lab `manifests/publish-results.yaml`](https://github.com/frostyard/lab/blob/main/manifests/publish-results.yaml)
- Builds on: [ADR-0014](0014-single-gpg-trust-root.md)
- Related: [ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md)
