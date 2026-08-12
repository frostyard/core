# 0014 — One GPG repository key, baked into images, no per-release rotation

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

Signed artifacts span three repos: repogen signs repository metadata and
sysext manifests, snosi bakes verification keys into images, updex and
systemd-sysupdate verify on hosts. Deployed machines can only verify with
keys they already have — key changes reach fleets slowly, through the very
update channel the keys protect.

## Decision

- One **Frostyard repository key**
  (`432C452CD2B7F4FF1B5D23264DE6A2016E622F97`, provided to CI as the
  `REPOGEN_GPG_KEY` secret) signs all repository metadata and every sysext
  `SHA256SUMS.gpg` (detached, binary).
- Images bake the public key at **`/usr/lib/systemd/import-pubring.gpg`**;
  verifiers search `/etc/systemd/import-pubring.gpg` first so admins can
  override.
- The **same key** is reused across suites and releases — dual-publishing
  Debian codenames (trixie/forky) explicitly shares one key; there is no
  per-release rotation.
- CI and QA must verify the signed index **before** trusting any filename
  or digest read from it (gpgv first, then resolve), and must never
  downgrade to an unverified download on failure.
- Signing-adjacent key material is year-stamped in filenames
  (`mok-2026.crt`, `pcr-signing-2026.pub`) so planned rotation is visible
  in the tree.

## Consequences

- Fleet trust is simple and uniform; every consumer verifies against one
  anchor.
- The single key is a single point of compromise, and breaking or losing it
  bricks updates on deployed machines; rotation requires shipping the new
  public key via a still-trusted update first. That cost is accepted and
  now written down.
- The admin-override search order means a host can be repointed at a mirror
  with its own key without rebuilding images.

## Alternatives considered

- **Per-release or per-suite keys:** every rotation is a fleet event with
  the bootstrap problem above; complexity without a matching threat-model
  win at current org size.
- **TLS-only trust (no signatures):** protects transport, not storage; a
  bucket compromise would go undetected.

## References

- Shapes: [repogen sysext signing](https://github.com/frostyard/repogen/tree/main/internal/generator/sysext),
  [snosi `shared/sysext/keys`](https://github.com/frostyard/snosi/tree/main/shared/sysext/keys),
  [updex `manifest/gpg.go`](https://github.com/frostyard/updex/blob/main/manifest/gpg.go),
  [lab verified-download lanes](https://github.com/frostyard/lab/tree/main/argo/workflow-templates)
- Builds on: [ADR-0008](0008-sysext-distribution-and-update-contract.md),
  [ADR-0010](0010-publish-packages-via-repogen-to-r2.md)
- Related: [ADR-0023](0023-verified-pinned-downloads.md)
