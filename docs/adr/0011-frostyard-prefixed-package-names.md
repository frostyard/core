# 0011 — Distro packages are named frostyard-&lt;tool&gt;; binaries stay &lt;tool&gt;

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

Frostyard tools ship as deb/rpm/apk packages into shared distro namespaces
where names like `updex` or `pilothouse` could collide with, or be
squatted by, unrelated packages. Users, however, type the tool name.

## Decision

- Every distro package is named **`frostyard-<tool>`**
  (`frostyard-updex`, `frostyard-pilothouse`, `frostyard-chairlift`);
  GoReleaser `project_name` and the installed binary remain the bare tool
  name.
- Package filenames use nFPM's `{{ .ConventionalFileName }}`; binaries
  install to `/usr/bin`.
- Standard auxiliary payload paths: bash completion in
  `/etc/bash_completion.d/<tool>`, fish in
  `/usr/share/fish/completions/<tool>.fish`, zsh in
  `/usr/share/zsh/site-functions/_<tool>`, man page in
  `/usr/share/man/man1/<tool>.1.gz` — generated at release time from the
  binary itself, never committed.
- A renamed tool keeps a `/usr/bin/<oldname>` compat symlink indefinitely
  (e.g. `instex` → `updex`).

## Consequences

- `apt search frostyard` enumerates the org's tooling; the prefix brands and
  namespaces at once.
- Package name ≠ binary name surprises newcomers exactly once; this ADR is
  the record.
- The rename-symlink rule makes tool renames cheap for users and permanent
  for packagers.

## Alternatives considered

- **Bare tool names as package names:** collision/squatting risk in distro
  namespaces, and no org grouping.
- **Prefixing the binaries too:** hostile ergonomics; nobody wants to type
  `frostyard-updex`.

## References

- Shapes: [updex `.goreleaser.yaml`](https://github.com/frostyard/updex/blob/main/.goreleaser.yaml),
  [pilothouse `.goreleaser.yaml`](https://github.com/frostyard/pilothouse/blob/main/.goreleaser.yaml),
  [chairlift `.goreleaser.yaml`](https://github.com/frostyard/chairlift/blob/main/.goreleaser.yaml)
- Builds on: [ADR-0001](0001-record-architecture-decisions.md)
- Related: [ADR-0010](0010-publish-packages-via-repogen-to-r2.md),
  [ADR-0012](0012-svu-versioning-and-rolling-dev-prerelease.md)
