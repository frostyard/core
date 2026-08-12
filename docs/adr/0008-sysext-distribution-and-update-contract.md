# 0008 — Sysext distribution layout and update contract

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

There is no upstream specification for "a systemd-sysext repository". Snosi
builds the images, repogen publishes them, systemd-sysupdate and updex
consume them on hosts, and lab's QA transfers exercise the whole path. Each
side needs an exact on-disk/on-URL contract or incremental publishing and
host updates silently break.

## Decision

**Server side (repogen invents the format):**

- Each extension lives under `ext/<name>/` at the repository root,
  containing the images, `SHA256SUMS` (shasum convention: `<hash>` +
  two spaces + `<filename>`, deduplicated), an optional detached **binary**
  signature `SHA256SUMS.gpg`, and a generated `<name>.transfer`.
- `SHA256SUMS` is the database: incremental runs recover prior state by
  re-reading it. `ext/index` is a sorted newline list of extension names — a
  discovery API for tooling (sysupdate never reads it).
- Generated transfers set `Verify=true` iff a GPG signer was configured,
  `[Source] Path=<base-url>/ext/<name>/`, and
  `[Target] Path=/var/lib/extensions.d/`.

**Client side (updex semantics):**

- Downloads stage into `/var/lib/extensions.d`; updex manages the activation
  symlink `/var/lib/extensions/<component>.<ext>` itself. Upstream's
  `CurrentSymlink` is legacy state that updex actively removes.
- GPG verification is **default-on**: omitting `Verify=` means yes, and the
  `--verify` flag can only force-enable, never disable.

## Consequences

- Any alternate publisher must reproduce these paths exactly or incremental
  mode loses all previously published packages.
- The generator dictates client trust posture — an unsigned repository
  yields `Verify=false` transfers; signing infrastructure is therefore part
  of publication, not an add-on ([ADR-0014](0014-single-gpg-trust-root.md)).
- Known defect to own: `ext/index` is rebuilt from the current run only, so
  publishing one extension truncates the catalog for all others — consumers
  must not treat it as exhaustive until fixed.
- The two-directory staging/activation split means a wrong link name renders
  a sysext invisible; the naming formula lives in updex and is contract.

## Alternatives considered

- **Wait for an upstream repo format:** none exists; sysupdate only defines
  the transfer file, not the server layout.
- **JSON index instead of `SHA256SUMS`:** a second artifact to sign and keep
  consistent; the checksum file is already required and serves as both
  integrity record and database.

## References

- Shapes: [repogen `internal/generator/sysext`](https://github.com/frostyard/repogen/tree/main/internal/generator/sysext),
  [updex `sysext/manager.go`](https://github.com/frostyard/updex/blob/main/sysext/manager.go),
  [snosi shipped transfers](https://github.com/frostyard/snosi/tree/main/mkosi.images/base/mkosi.extra/usr/lib)
- Builds on: [ADR-0007](0007-frostyard-sysext-filename-pattern.md),
  [ADR-0009](0009-single-artifact-origin-repository-frostyard-org.md)
- Related: [ADR-0014](0014-single-gpg-trust-root.md)
