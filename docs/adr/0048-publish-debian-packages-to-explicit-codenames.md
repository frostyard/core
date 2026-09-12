# 0048 — Publish Debian packages to explicit codenames

- **Status:** Accepted
- **Date:** 2026-09-09

## Context

Frostyard's public APT repository exposes only the signed `stable` suite,
indexing 227 package versions across 32 names. At least eleven workflows can
publish through Repogen. Inspected callers omit codename, suite, and Repogen
version; some reference the shared action at `@main`.

Explicit `trixie` and `forky` suites do not exist. Current publication
rewrites shared metadata without cross-repository serialization, and a failed
metadata download can be treated as an empty repository.

[ADR-0010](0010-publish-packages-via-repogen-to-r2.md) established shared,
incremental, non-deleting publication. Its per-producer writer model and
implicit release identity are no longer safe for parallel Debian releases.
This ADR supersedes ADR-0010.

## Decision

Every supported Debian publisher and automated consumer names an explicit,
immutable codename. Production publication requires matching `codename` and
`suite` values. `stable` is rejected as a write target.

Keep the current signed `stable` repository readable and unchanged through
at least 2027-09-30 as a legacy recovery source. Supported automated consumers
do not follow it.

Repogen becomes the single production metadata writer:

- producers build and provide immutable packages;
- one protected Repogen workflow verifies, signs, and publishes;
- producer repositories lose production signing and R2 write access after
  migration;
- publication is serialized by codename; and
- inability to read the current production suite is fatal.

Pin all actions to full commit SHAs and Repogen to an immutable version and
digest. Continue using the signing trust root in
[ADR-0014](0014-single-gpg-trust-root.md).

Each publish records a compact manifest: producer repository, source commit,
workflow run, package identity and digest, codename, action SHA, Repogen
version and digest, previous Release digest, and resulting Release digest.
Full supply-chain attestation is deferred at the current scale.

Migration order is mandatory:

1. freeze nonessential writes and snapshot signed `stable`;
2. make missing inputs, mutable tooling, and failed metadata reads fail closed;
3. publish `gchlog` as the separately approved Trixie canary;
4. populate the smallest Trixie package set required by Snosi and switch its
   test consumers to `trixie`;
5. prove clean install, update, one concurrent publication attempt, and
   rollback while `stable` is unchanged; then
6. build and validate an isolated Forky package set.

Forky reuses a Trixie artifact only when its digest is identical and
compatibility is recorded. Trixie remains readable for at least 90 days after
Forky promotion and until all four known users confirm migration. Rollback
changes the consumer to Trixie; it never rewrites either suite.

NBC is never published to Forky and receives only an exact, approved emergency
publication. `omarchy-apps` is excluded from the future publisher set.

## Consequences

- Trixie and Forky can coexist without a writable alias changing identity.
- One writer and one credential boundary avoid distributed locking machinery.
- Producer migration requires coordinated credential removal.
- The single Repogen workflow is an accepted availability bottleneck.
- Existing objects remain available through the retention window.
- Every workflow, credential, publication, and R2 mutation remains separately
  approved.

## Alternatives considered

- **Continue writing `stable`.** Rejected because publication, promotion,
  consumer policy, and rollback remain ambiguous.
- **Give every producer a distributed R2 lock.** Rejected because one protected
  writer is simpler for eleven producers and four users.
- **Require full attestations before Trixie.** Rejected as disproportionate; a
  signed repository and durable manifest are sufficient now.
- **Publish Forky first.** Rejected because no explicit rollback source exists.

## References

- Implements through:
  [Plan 0006](../plans/0006-nbc-retirement-and-debian-suite-migration-fast-path.md)
- Detailed implementation sequence:
  [Plan 0007](../plans/0007-support-suites-in-repogen.md)
- Supersedes:
  [ADR-0010](0010-publish-packages-via-repogen-to-r2.md)
- Builds on:
  [ADR-0009](0009-single-artifact-origin-repository-frostyard-org.md),
  [ADR-0014](0014-single-gpg-trust-root.md),
  [ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md), and
  [ADR-0023](0023-verified-pinned-downloads.md)
