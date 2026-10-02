# 0055 — Publish Debian packages through the apt-publisher single writer

- **Status:** Proposed
- **Date:** 2026-10-02

## Context

[ADR-0048](0048-publish-debian-packages-to-explicit-codenames.md) requires
explicit, immutable Debian codenames, one protected production writer,
serialized publication, fail-closed metadata reads and recoverable rollback,
and names Repogen as that writer.
[ADR-0054](0054-remove-four-known-users-gates-from-suite-migration.md)
removed its four-known-users conditions. Repogen's `publish-to-r2` action
refuses `package-type: deb`, so no producer can publish a `.deb` through it.

[`frostyard/apt-publisher`](https://github.com/frostyard/apt-publisher)
implements the single writer with aptly 1.6.3. aptly publishes a
self-contained tree, its own `dists/` and `pool/` under one prefix, and keeps
a database and package pool between runs. Its pool paths
(`pool/main/<p>/<name>/<file>`) are the same paths the legacy suite uses at
the bucket root.

On 2026-10-02 apt-publisher published `trixie` at
`https://repository.frostyard.org/debian/` from the signed legacy `stable`
suite. `stable` itself was not modified. Signed `stable`, at the bucket root
(`dists/stable`, `pool/`), must stay readable and unchanged through at least
2027-09-30 ([ADR-0052](0052-remove-nbc-artifact-retention-gates.md),
ADR-0054).

## Decision

**Writer.** `frostyard/apt-publisher` is the only writer of Frostyard's Debian
metadata, and it publishes with aptly.

- Every workflow that can reach its credentials runs in one concurrency
  group, `apt-repository`, with `queue: max`. Publications, imports,
  rollbacks and withdrawals therefore run one at a time, in arrival order.
- Production signing ([ADR-0014](0014-single-gpg-trust-root.md)'s key) and
  the R2 write credentials for Debian publication exist only in its
  `apt-repository` environment, which only `main` can use.
- Producers build packages and attach them to a GitHub release. After
  migration they hold neither credential.
- Repogen no longer publishes Debian packages. It continues to publish
  sysexts ([ADR-0008](0008-sysext-distribution-and-update-contract.md)).

**Namespace.** Debian packages are published under `debian/` in
`frostyardrepo` and served at `https://repository.frostyard.org/debian/`.

- The tree is `debian/dists/<codename>/`, with by-hash indexes, and
  `debian/pool/`.
- This replaces [ADR-0009](0009-single-artifact-origin-repository-frostyard-org.md)'s
  Debian namespace for every codename.
- The root `dists/` and `pool/` hold only the frozen legacy `stable` suite.

**Codenames.** Publication names explicit codenames: `trixie` (Debian 13) and
`forky` (Debian 14). `stable` is never a write target.

- A version carrying `~debNN` or `+debNN` is published only to the codename
  for Debian NN.
- An unmarked version is published to each codename the request names,
  within the producer's registered codenames.
- When an unmarked artifact goes to both codenames, the same file, with an
  identical digest, is published to each. The producer's registration of
  `forky` is the compatibility record.
- Packages linked against distribution libraries are built once per codename,
  with `~deb13` and `~deb14` versions.

**Producers.** Each producer is registered in apt-publisher's
`config/producers.tsv`, which lists:

- the package-name patterns it may publish;
- the codenames it may publish to;
- whether every `.deb` must carry a GitHub build-provenance attestation from
  its tag workflow; and
- the image repositories to notify.

A reviewed change to that file is the authorization for the producer's future
publications. A producer requests publication of a release with a
`repository_dispatch` of type `publish-deb` carrying `repo`, `tag` and,
optionally, `codenames`.

**Publication.** For each request, the writer:

- downloads the release's `.deb` assets and verifies their attestations when
  the registration requires them;
- before any state change, refuses unknown producers, foreign package names,
  codenames or architectures outside the registration, and `~debNN` markers
  that don't match the target codename;
- restores aptly's state from the private state bucket `frostyard-apt-state`,
  and refuses unless the package set the bucket publishes equals aptly's
  database;
- adds the packages and creates one snapshot per affected codename;
- makes the snapshots visible as a recoverable transaction: pending marker,
  save, publish, clear the marker, save;
- reads the published suite back and checks its signature, index hashes and
  package bytes;
- purges the codename's mutable index URLs from the CDN; and
- downloads each published package with apt through the public URL.

Republishing an existing version with different bytes is refused.

**Record.** Every publication is an aptly snapshot named
`<codename>-<UTC time>-<label>`, kept in aptly's database. The state bucket
keeps every replaced database file under `history/<UTC time>/`. Each publish
run's summary records the producer, the tag and the resulting snapshot for
each codename. This replaces ADR-0048's per-publication manifest.

**Retention and recovery.** Nothing deletes pool files: every switch keeps
`-skip-cleanup`, and deleting files is a separate decision.

- A point-in-time rollback republishes a codename from an earlier snapshot
  and rebuilds the codename's working repository from it.
- A withdrawal removes one version from a codename and publishes a new
  snapshot.

**Trixie seed.** `trixie` holds the full history of signed `stable`. This
replaces ADR-0048's rule that only the packages Snosi needs be populated.

- It was seeded once with all 234 package files of 32 packages, verified
  against `stable`'s signed indexes and imported exactly as reviewed
  (manifest SHA256
  `bd8fcbcfdfe86afe894dce7d500868fc80bcbe21bf6e24c3a670e00562ba6637`). The
  result is snapshot `trixie-20261002T190620Z-import-stable`.
- The seed includes NBC and omarchy-apps versions. Neither project publishes
  new versions: neither is a registered producer, and NBC is never published
  to `forky`. ADR-0047, ADR-0049 and ADR-0052 continue to govern them.
- `forky` receives only producer publications. Nothing is imported into it.

**Retention windows.**

- Signed `stable` stays readable and unchanged through at least 2027-09-30,
  including every pool byte its indexes reference.
- No redirect, symlink or alias points `stable` at a codename.
- `trixie` stays readable for at least 90 days after `forky` is promoted.

**Pinning.** Actions are pinned to full commit SHAs
([ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md)).
apt-publisher pins aptly, rclone and its other tools in `mise.lock`. This
replaces ADR-0048's pinning of a Repogen version and digest.

This ADR supersedes ADR-0048 and ADR-0054, and supersedes ADR-0009 in part
(its Debian namespace).

## Consequences

- One queued writer needs no distributed locking, but it is an availability
  bottleneck.
  - A failed or cancelled run keeps its payload and can be rerun.
  - A nightly audit reports releases whose `.deb` assets are not published.
- Clients move by changing `URIs` to `https://repository.frostyard.org/debian/`
  and `Suites` to a codename. They keep the same keyring.
- Two Debian trees share the bucket: the legacy suite at the root, and
  `debian/`. The pool under `debian/` duplicates the legacy pool's bytes,
  about 3 GiB.
- aptly's state is a stateful dependency.
  - Every run restores the state bucket's database and pool, about 3 GiB.
  - Lost or stale state is refused, never published over. Recovery is a
    forced rollback after inspection.
- A point-in-time rollback also unpublishes other producers' later packages
  in that codename until they are republished.
- A withdrawn version returns if its release is republished; there is no
  blocklist.
- `trixie` serves every version `stable` listed, including NBC and
  omarchy-apps packages. Any of them can be withdrawn one version at a time.
- Migrating a producer takes three changes:
  - register it;
  - replace its Repogen `.deb` step with the `publish-deb` dispatch; and
  - remove its production signing and R2 credentials.
- The writer reads releases with its workflow token, which cannot read another
  private repository. A private producer needs a token with read access to
  its releases, or a public repository.

## Alternatives considered

- **Repogen as the single writer (ADR-0048,
  [Plan 0007](../plans/0007-support-suites-in-repogen.md)).** Rejected: its
  `.deb` path is disabled, and adding codename serialization, recovery and
  rollback would reimplement aptly's snapshots and publication switching.
- **aptly publishing at the bucket root.** Rejected: aptly's pool paths are
  the legacy suite's paths. A file with the same name and different bytes
  would change signed `stable`, which must stay unchanged.
- **Seed `trixie` with only Snosi's packages (ADR-0048).** Rejected: every
  other client of `stable` would have no codename to move to without losing
  packages. A full seed makes `trixie` a superset of `stable`, and versions
  can be withdrawn individually.
- **reprepro.** Rejected: it publishes to a filesystem, not to S3.
- **deb-s3.** Rejected: it is unmaintained and keeps a writer in every
  producer.
- **A hosted repository (Cloudsmith).** Rejected: custom domains are a paid
  feature, and a second host would split the single origin (ADR-0009).

## References

- Shapes: [Debian publication](../design/debian-publication.md),
  [Plan 0009](../plans/0009-debian-publication-through-apt-publisher.md)
- Implemented in: [`frostyard/apt-publisher`](https://github.com/frostyard/apt-publisher)
  ([ADR-0001 there](https://github.com/frostyard/apt-publisher/blob/main/docs/adr/0001-aptly-single-writer.md))
- Supersedes: [ADR-0048](0048-publish-debian-packages-to-explicit-codenames.md),
  [ADR-0054](0054-remove-four-known-users-gates-from-suite-migration.md)
- Supersedes in part: [ADR-0009](0009-single-artifact-origin-repository-frostyard-org.md)
  (Debian namespace)
- Builds on: [ADR-0014](0014-single-gpg-trust-root.md),
  [ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md),
  [ADR-0047](0047-retire-nbc-on-a-proportional-fast-path.md),
  [ADR-0049](0049-retire-omarchy-apps-without-breaking-snosi.md),
  [ADR-0052](0052-remove-nbc-artifact-retention-gates.md)
- Related: [ADR-0056](0056-rebuild-images-after-apt-publication.md)
- Monitored by: [stable repository drift alarm](../design/stable-repository-drift-alarm.md)
