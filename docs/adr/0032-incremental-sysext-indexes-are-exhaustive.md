# 0032 — Treat incremental sysext indexes as exhaustive

- **Status:** Accepted
- **Date:** 2026-08-12

## Context

[ADR-0008](0008-sysext-distribution-and-update-contract.md) defines
`ext/index` as the sorted discovery list for a sysext repository. It also
records a then-current defect: a partial publish rebuilt the index from only
that run and dropped every other extension name. Consumers were consequently
told not to treat the index as exhaustive.

Repogen fixed that defect in
[repogen#35](https://github.com/frostyard/repogen/pull/35). Incremental
generation now discovers existing extension directories from their
`SHA256SUMS` manifests and merges those names with the current run. A
regression test starts with an existing `alpha` manifest, publishes only
`beta`, and requires the resulting index to contain both names in sorted
order.

ADR-0008 is Accepted and therefore immutable. The repaired behavior needs a
follow-up decision so the current cross-repository discovery contract no
longer presents the historical defect as an active client constraint.

## Decision

After a successful **incremental** sysext generation, `ext/index` is the
exhaustive discovery list for the restored repository metadata:

- Repogen unions names from the current package set with immediate
  directories under `ext/` that contain a regular `SHA256SUMS` manifest.
- It deduplicates the union, sorts it lexicographically, and writes one name
  per line with a trailing newline.
- It does not use the previous `ext/index` as a database. `SHA256SUMS`
  remains the authoritative evidence that an existing extension is
  publishable, as established by ADR-0008.
- Non-directories and extension directories without a regular manifest are
  not discoverable and therefore are not included.

Consumers may treat `ext/index` produced by a successful incremental publish
as exhaustive. They do not need a workaround that independently scans
extension directories.

This does not change non-incremental generation or the fallback described by
[ADR-0010](0010-publish-packages-via-repogen-to-r2.md): if published metadata
cannot be restored or parsed and publication falls back to non-incremental
mode, truncation remains an incident condition.

## Consequences

- Partial publishes preserve every previously published, manifest-backed
  extension in the discovery index.
- Publisher and consumer now share one explicit testable meaning of
  "exhaustive"; duplicate downstream discovery logic can be removed.
- An incomplete directory is intentionally invisible until it has a regular
  `SHA256SUMS`, preventing half-published extension names from entering the
  catalog.
- **Negative:** the guarantee depends on restoring existing metadata and
  remaining in incremental mode. It does not make ADR-0010's parse-failure
  fallback safe.

## Alternatives considered

- **Annotate ADR-0008 in place:** rejected — Accepted ADRs are immutable; a
  follow-up preserves both the historical defect and its resolution.
- **Merge the previous `ext/index` instead of scanning manifests:** rejected
  — the old index can contain stale names, while manifests are already the
  incremental source of truth.
- **Keep telling clients the index may be partial:** rejected — that would
  preserve workarounds for a defect covered by an implementation regression
  test and weaken the discovery contract.

## References

- Shapes:
  [repogen sysext generator spec](https://github.com/frostyard/repogen/blob/main/docs/specs/generators.md#systemd-sysext-internalgeneratorsysext),
  [index implementation](https://github.com/frostyard/repogen/blob/4c75b796779b5918079a676e9d55f69576fe5310/internal/generator/sysext/generator.go#L208-L259),
  [regression test](https://github.com/frostyard/repogen/blob/4c75b796779b5918079a676e9d55f69576fe5310/internal/generator/sysext/generator_test.go#L542-L586)
- Builds on:
  [ADR-0008](0008-sysext-distribution-and-update-contract.md),
  [ADR-0010](0010-publish-packages-via-repogen-to-r2.md)
- Tracks: [core#49](https://github.com/frostyard/core/issues/49)
