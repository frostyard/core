# 0004 — Product-namespaced filesystem paths, split by lifetime tier

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

Frostyard tools ship files onto Linux hosts: trust material, generated
metadata, persistent state, runtime state, admin config. Without a rule, each
tool picks ad-hoc paths, state lands in the wrong lifetime tier (e.g.
reboot-pending state in `/var` surviving the reboot that should clear it),
and cross-repo consumers have no stable discovery path. Meanwhile two
namespaces are in live use: `frostyard` (org) and per-product names
(`snosi`, `pilothouse`, `chairlift`).

## Decision

Every product owns a path family named after the product, split by systemd
file-hierarchy lifetime semantics:

- `/usr/lib/<product>/` — immutable image/package config and trust material
  (e.g. snosi's `bootc-secure.json`, `mok.crt`, the `native-ab` marker).
- `/usr/share/<product>/` — immutable generated metadata and vendor defaults
  (e.g. snosi's `enablement-manifest.txt`; chairlift's package-owned
  `config.yml`).
- `/etc/<product>/` — administrator-owned config; never created or
  overwritten by packaging (pilothouse, chairlift).
- `/var/lib/<product>/` — persistent machine state (pilothouse's bbolt
  stores; snosi's first-boot and drift state; lab's `/var/lib/snosi-lab`
  cache root).
- `/run/<product>/` — volatile inter-process state cleared at boot (snosi's
  `update-check`/`update-staged`; pilothouse's `broker.sock`).

The **org namespace `frostyard`** is reserved for org-level identity and
provenance that must be discoverable across products
([ADR-0003](0003-image-provenance-in-usr-share-frostyard.md)); everything
implementation-specific uses the product namespace. CLIs and systemd units
carry the product prefix (`snosi-*`).

## Consequences

- Cross-repo consumers (chairlift reads `/run/snosi/*`; updex writes
  `/etc/updex/catalogs.d`) get stable, guessable paths.
- Choosing the tier is now a design act: putting state in the wrong tier is a
  reviewable violation, not a taste question.
- Packaging must respect ownership: systemd (`RuntimeDirectory=`,
  `StateDirectory=`) owns `/run` and `/var/lib` entries; packages must not
  install into them (pilothouse enforces this as "forbidden roots").
- The org/product dividing line requires judgment; this ADR records the rule
  so exceptions are deliberate.

## Alternatives considered

- **One shared `/usr/share/frostyard` for everything:** collapses products
  into one bag; file ownership and packaging conflicts become likely.
- **FHS ad hoc per tool:** the status quo this replaces — undiscoverable and
  inconsistent lifetimes.

## References

- Shapes: [snosi](https://github.com/frostyard/snosi) in-image trees,
  [pilothouse packaging](https://github.com/frostyard/pilothouse/blob/main/.goreleaser.yaml),
  [chairlift `CONFIG.md`](https://github.com/frostyard/chairlift/blob/main/CONFIG.md)
- Builds on: [ADR-0003](0003-image-provenance-in-usr-share-frostyard.md)
- Related: [ADR-0005](0005-native-ab-marker-and-update-state-files.md)
