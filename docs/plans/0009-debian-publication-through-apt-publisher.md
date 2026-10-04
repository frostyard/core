# Plan: Debian publication through apt-publisher

**Status:** Active. Governed by [ADR-0055](../adr/0055-publish-debian-packages-through-the-apt-publisher.md)
and [ADR-0056](../adr/0056-rebuild-images-after-apt-publication.md); replaces
[Plan 0006](0006-nbc-retirement-and-debian-suite-migration-fast-path.md) and
[Plan 0007](0007-support-suites-in-repogen.md).

This plan moves every Frostyard Debian producer and consumer from the frozen
legacy `stable` suite to explicit codenames at
`https://repository.frostyard.org/debian/`, published by
[`frostyard/apt-publisher`](https://github.com/frostyard/apt-publisher). The
writer and the seeded `trixie` suite exist. What remains is producers,
caching, Snosi, and `forky`. NBC and omarchy-apps retirement stay with
[Plan 0008](0008-post-nbc-bootc-only-transition.md) and
[ADR-0049](../adr/0049-retire-omarchy-apps-without-breaking-snosi.md).

## Phase 1 — Writer and infrastructure (done 2026-10-02)

- [x] apt-publisher's publish, import, rollback, withdraw, audit and
  check-secrets workflows, with 120 end-to-end checks against a local S3
  server ([design](../design/debian-publication.md)).
- [x] The private state bucket `frostyard-apt-state`, an R2 token, and the
  `apt-repository` environment limited to `main`.
- [x] Seven secrets, confirmed by check-secrets run 37048085445.
- [x] A trial against real R2 under a scratch prefix: publish, deep verify, a
  canary through the CDN, withdraw, rollback, and a 30-URL purge. The prefix
  was removed afterwards.
- **Done when:** check-secrets passes and the R2 trial passes end to end.
  Both did on 2026-10-02.

## Phase 2 — Seed `trixie` from signed `stable` (done 2026-10-02)

- [x] The import-stable review (run 37050674184) verified 234 files of 32
  packages against `stable`'s signed indexes. No two different files share a
  package, version and architecture.
- [x] The import-stable publish (run 37051548490) imported exactly that
  manifest and published snapshot `trixie-20261002T190620Z-import-stable`.
- **Done when:** `/debian/dists/trixie/InRelease` verifies with
  `frostyard.gpg`, its indexes list the 234 reviewed files, apt downloads
  packages through the public URL, and `stable` is unchanged. All held on
  2026-10-02.

## Phase 3 — Cache immutable paths (done 2026-10-03)

- [x] The Cloudflare Cache Rule `apt immutable` caches
  `repository.frostyard.org` paths under `/debian/pool/` and
  `/debian/dists/**/by-hash/` at the edge for one year.
  - Status codes of 400 and up are `no-store`.
  - Browser TTL respects the origin.
  - Details are in the [design doc's CDN section](../design/debian-publication.md).
- [x] `InRelease`, `Release`, `Release.gpg` and `Packages*` stay uncached.
- **Done when:** a second request for a `by-hash` URL returns
  `cf-cache-status: HIT`, while `InRelease` stays `DYNAMIC`. This held on
  2026-10-03:
  - a `by-hash` index and a pool `.deb` went `MISS`, then `HIT`;
  - a missing file was `BYPASS` both times;
  - `InRelease` was `DYNAMIC`.

## Phase 4 — Move producers (done for Snosi's producers 2026-10-04)

For each producer:

1. Register it in apt-publisher's `config/producers.tsv`: package globs,
   codenames, `attested`, and `notify`.
2. Replace its Repogen `.deb` step and any direct `build` dispatch with the
   `publish-deb` dispatch
   ([design: producer release step](../design/debian-publication.md)).
3. Give it an `APT_PUBLISH_TOKEN`.
4. Remove its production signing and R2 secrets.

Step 4 was done for every producer at once on 2026-10-03. The organization's
R2 and Repogen signing secrets are now limited to Snosi, for sysext
publication. Until then, producers pinned to `publish-to-r2` commits that
predate its `.deb` refusal could still write signed `stable`:

- incus at `v0.4.1` did on 2026-09-16;
- firn at `6648671` did on 2026-10-01.

See the
[drift alarm's baseline provenance](../design/stable-repository-drift-alarm.md).

Producers are ordered by what Snosi installs from the repository (scan of
Snosi `dd0def7`, 2026-10-02):

- [x] **updex.** Ships `frostyard-updex`, which every image installs.
  - Attested, static Go: `trixie` and `forky`, notify `frostyard/snosi`.
  - Its release workflow and `release_workflow_contract_test.go` now pin
    the `publish-deb` request (frostyard/updex#432).
  - v2.0.2 was published on 2026-10-02 by
    [publish run 37058743496](https://github.com/frostyard/apt-publisher/actions/runs/37058743496).
    It was `forky`'s first publication.
- [x] **bootc-debian.** Ships `bootc` and `libostree-1-1`, which every OCI
  profile installs.
  - Made public on 2026-10-04, so the writer reads its releases with its
    workflow token.
  - A manual Build run on `main` publishes a GitHub release of exactly those
    two `.deb` files, then requests `trixie` (frostyard/bootc-debian#8).
  - Versions end in `~deb13`; GitHub lists the assets with `.` in place of
    `~`.
  - Registered `trixie` only and `attested=no`, because its provenance names
    `refs/heads/main` (frostyard/apt-publisher#10).
  - `bootc-1.16.8-ostree-2026.3-202610040153` was published on 2026-10-04
    by [publish run 37170106018](https://github.com/frostyard/apt-publisher/actions/runs/37170106018).
- [x] **chairlift.** Ships `frostyard-chairlift` (snow, snowfield and sundog)
  and `frostyard-chairlift-system-integration`.
  - Attested from tag runs since frostyard/chairlift#239.
  - `trixie` only, amd64 and arm64. puregotk loads GTK4 and libadwaita at
    runtime and the package declares no `Depends`, so `forky` waits for a
    smoke test.
  - Its dead `build` dispatch to the archived `frostyard/snow` was removed.
  - v0.11.2 was published on 2026-10-04 by
    [publish run 37170541501](https://github.com/frostyard/apt-publisher/actions/runs/37170541501).
- [x] **intuneme.** Ships `frostyard-intuneme` (snow and sundog). Attested,
  static, `trixie` and `forky` (frostyard/intuneme#204). v0.20.3 was
  published on 2026-10-04 by [publish run 37163711657](https://github.com/frostyard/apt-publisher/actions/runs/37163711657).
- [x] **first-setup.** Ships `snow-first-setup`, architecture `all` (snow and
  snowfield).
  - Attested, `trixie` only (frostyard/first-setup#30).
  - The release asset is now versioned, and the tag must match
    `debian/changelog`.
  - v0.4.1 was published on 2026-10-04 by
    [publish run 37163781456](https://github.com/frostyard/apt-publisher/actions/runs/37163781456).
- [x] **firn.** Ships `frostyard-firn`, which the firn-installer ISO pins to
  0.6.0.
  - Attested since frostyard/firn#104, static, `trixie` and `forky`,
    amd64 and arm64.
  - v0.6.1 was published on 2026-10-04 by
    [publish run 37163739499](https://github.com/frostyard/apt-publisher/actions/runs/37163739499).
- [x] **incus.** Ships `incus`, `incus-base`, `incus-client`, `incus-extra` and
  `incus-ui-canonical` (the incus sysext).
  - Each push to the protected `stable` branch builds Debian 13 amd64, then
    publishes a GitHub release holding exactly those five `.deb` files, then
    requests `trixie` (frostyard/incus#6). The release job is generated by
    `sync-docker-build.py`.
  - Registered by exact package names, `trixie` only, `attested=no`.
    - Its versions carry `-debian13-`, which is not a codename marker.
    - Its attestations name `refs/heads/stable`, not the release tag the
      writer checks.
  - Incus 7.5.1 (frostyard/incus#7) was published on 2026-10-03 by
    [publish run 37153494023](https://github.com/frostyard/apt-publisher/actions/runs/37153494023)
    as `1:7.5.1-debian13-202610032056`.
  - Its epoch makes apt prefer it over Debian's incus, and
    `incus-ui-canonical` exists only here.
- [ ] **omarchy-apps.** Not migrated
  ([ADR-0049](../adr/0049-retire-omarchy-apps-without-breaking-snosi.md)).
  `voxtype` and `moonlight-qt` stay in `trixie` from the seed until Snosi
  resolves them.

Producers whose packages Snosi does not install from the repository:

Not ported, by decision on 2026-10-04. Their Repogen `.deb` steps fail for
lack of credentials, so nothing writes legacy `stable`. Port them if they
ever need APT publication.

- **pilothouse.** Snosi downloads `frostyard-pilothouse` from its GitHub
  release instead.
  - Its daemon is built with CGO on `ubuntu-latest`. Build it in
    `debian:trixie` before publishing to APT.
  - Not attested.
- **snowcat-cockpit.** Ships `frostyard-snowcat-cockpit`. Attested, static.
- **gchlog.** Ships `frostyard-gchlog`, which is not in the legacy suite.
  The repository has been dormant since February 2026.
- No producer to migrate:
  - igloo (archived);
  - nbc (archived; [ADR-0052](../adr/0052-remove-nbc-artifact-retention-gates.md));
  - `kapsule` and `kapsule-gnome` (their `Homepage`,
    `github.com/frostyard/kapsule`, does not exist).
- **Done when:** every producer whose packages Snosi installs publishes its
  next release through apt-publisher, and none of their workflows calls
  Repogen's `publish-to-r2` with `package-type: deb`.
  - This held on 2026-10-04 for updex, incus, intuneme, firn, first-setup,
    bootc-debian and chairlift. omarchy-apps is retired.
  - Each first release was checked from outside: routing, signature, index
    contents, apt canary, attestation where registered, and legacy `stable`
    unchanged.

## Phase 5 — Move Snosi to `/debian/` `trixie` (done 2026-10-03)

- [x] `mkosi.sandbox/etc/apt/sources.list.d/frostyard.sources` reads
  `URIs: https://repository.frostyard.org/debian/` and `Suites: trixie`,
  keeping `frostyard.gpg` (frostyard/snosi#1042).
  - Before the change, a sandboxed apt comparison resolved every Frostyard
    package Snosi installs to the same version from both sources, except
    `frostyard-updex` (2.0.1 to 2.0.2).
  - The PR's image builds fetched updex 2.0.2 from `/debian/` `trixie`.
- [x] Snosi's sysext publication, through Repogen's `package-type: sysext`
  path, writes nothing under `dists/` or `debian/`. After the post-merge
  sysext publication on 2026-10-03, `stable`, `trixie` and `forky` kept their
  earlier `InRelease` dates.
- Requires Phase 3.
- **Done when:** Snosi's default builds install Frostyard packages from
  `/debian/` `trixie`, and the
  [stable repository drift alarm](../design/stable-repository-drift-alarm.md)
  still reports `stable` unchanged. Both held on 2026-10-03:
  - the post-merge sysext, image and installer-ISO builds passed;
  - the alarm passed on its re-baselined record (frostyard/core#153,
    [run 37151554483](https://github.com/frostyard/core/actions/runs/37151554483)).

## Phase 6 — Build and validate `forky`

On 2026-10-04 Snosi's secure image builds were failing on Debian's
half-published trixie-backports kernel. `linux-signed-amd64` 7.2.6 was
waiting in `backports-new`, leaving every 6.18+ backports kernel
uninstallable. frostyard/snosi#1043 takes their kernel from `forky` (7.2.8)
until that queue is processed.

- [ ] Producers that register `forky` publish to it: unmarked static builds
  directly, and distribution-linked packages as `~deb14` builds.
  - Done for updex, intuneme and firn.
  - chairlift and first-setup wait for a smoke test on a `forky` image.
  - bootc-debian needs a `debian:forky` build with `~deb14` versions and
    per-codename `Depends`. Its ostree must be at least 2026.4, because
    `forky` ships libostree 2026.4-1 (frostyard/bootc-debian#5).
  - incus needs a Debian 14 build carrying `~deb14`.
- [ ] Prove clean install, update and rollback on `forky`, without changing
  `trixie` or `stable`.
- [ ] Rebase or replace Snosi PR #924 once packages and products validate.
- **Done when:** `forky` and `trixie` independently install and roll back.

## Phase 7 — Steady state

- [ ] Set apt-publisher's `APT_AUDIT_ENABLED=true` once its producers publish
  through it.
- [ ] Keep `trixie` readable for at least 90 days after `forky` is promoted,
  and signed `stable` unchanged through at least 2027-09-30.
- **Done when:** the nightly audit passes, and the retention windows are
  recorded in this plan.

## Later / ideas

- **Refuse non-canonical asset names.** Refuse any `.deb` whose release asset
  name isn't `<name>_<version>_<arch>.deb`, with the epoch dropped and
  GitHub's `~`→`.` rename accepted. aptly keeps asset names for pool files,
  and first-setup's unversioned legacy asset showed the collision risk.
- **Check which workflow signed an attestation,** not only the tag
  (`--signer-workflow` or a tag pattern). firn's and updex's release
  workflows run on any tag, while their tag rulesets protect only `v*`.

## Open questions

- **What Repogen becomes,** whether it keeps only sysexts or is replaced by a
  small sign-and-upload step. Decide by Phase 7.
- **What happens to legacy `stable` after 2027-09-30.** Expiry alone
  authorizes no removal; it needs its own decision.

## References

- Implements: [Debian publication](../design/debian-publication.md)
- Governed by: [ADR-0055](../adr/0055-publish-debian-packages-through-the-apt-publisher.md),
  [ADR-0056](../adr/0056-rebuild-images-after-apt-publication.md)
- Replaces: [Plan 0006](0006-nbc-retirement-and-debian-suite-migration-fast-path.md),
  [Plan 0007](0007-support-suites-in-repogen.md)
- Coordinates with: [Plan 0008](0008-post-nbc-bootc-only-transition.md)
