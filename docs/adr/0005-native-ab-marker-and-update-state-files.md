# 0005 — Transport discrimination by marker file and /run update-state contract

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

Snosi publishes the same products over two transports: bootc/composefs OCI
images and native A/B disk images. Scripts, systemd units, and outside
consumers (chairlift's Updates page) must branch on which transport the
running host uses. `os-release` fields cannot discriminate (`IMAGE_ID` is
identical across transports), and `/run/ostree-booted` is absent on
composefs hosts.

## Decision

- The zero-content marker file **`/usr/lib/snosi/native-ab`** identifies a
  native A/B host. Every conditional — shell (`[[ -e … ]]`), systemd
  (`ConditionPathExists=`), and external consumers — branches on this file
  and nothing else.
- Update progress is published as `key=value` files in `/run/snosi/`:
  **`update-check`** and **`update-staged`**, written by the two stagers at
  fixed paths **`/usr/libexec/bootc-update-stage`** and
  **`/usr/libexec/snosi-sysupdate-stage`** (one per transport).
- These four paths are a cross-repo contract: chairlift detects the host
  update mechanism from the marker and stager paths and reads the `/run`
  state files; its polkit policies pin the stagers by absolute path.

## Consequences

- One shared script serves both transports; units gate natively with no code.
- Renaming any of these paths silently breaks chairlift (its Updates group
  disappears) — they may only change in a coordinated cross-repo change.
- The mechanism is invisible unless documented; new script authors will reach
  for `os-release` and mis-branch. This ADR is the documentation.
- `/run` placement means the state is cleared by the reboot that consumes it,
  by construction ([ADR-0004](0004-product-namespaced-filesystem-tiers.md)).

## Alternatives considered

- **An `os-release` field:** `IMAGE_ID` is deliberately identical across
  transports (branding and sysext compatibility key off it); adding a custom
  field pollutes a spec'd file for one org's need.
- **Kernel cmdline flag:** not visible to unprivileged readers uniformly,
  and mutable at boot.

## References

- Shapes: [snosi `shared/outformat`](https://github.com/frostyard/snosi/tree/main/shared/outformat),
  [chairlift `internal/sysupdate`](https://github.com/frostyard/chairlift/tree/main/internal/sysupdate)
- Builds on: [ADR-0004](0004-product-namespaced-filesystem-tiers.md)
- Related: [ADR-0015](0015-os-release-image-identity.md)
