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

## Phase 3 — Cache immutable paths

- [ ] Add a Cloudflare Cache Rule for `/debian/pool/*` and
  `/debian/dists/*/by-hash/*`: eligible for cache, ignore origin headers, edge
  and browser TTL of one year
  ([design: CDN](../design/debian-publication.md)).
- [ ] Leave `InRelease`, `Release`, `Release.gpg` and `Packages*` uncached.
- **Done when:** a second request for a `by-hash` URL returns
  `cf-cache-status: HIT`, while `InRelease` stays `DYNAMIC`.

## Phase 4 — Move producers

For each producer:

1. Register it in apt-publisher's `config/producers.tsv`: package globs,
   codenames, `attested`, and `notify`.
2. Replace its Repogen `.deb` step and any direct `build` dispatch with the
   `publish-deb` dispatch
   ([design: producer release step](../design/debian-publication.md)).
3. Give it an `APT_PUBLISH_TOKEN`.
4. Remove its production signing and R2 secrets.

Producers are ordered by what Snosi installs from the repository (scan of
Snosi `dd0def7`, 2026-10-02):

- [ ] **updex.** Ships `frostyard-updex`, which every image installs.
  - Attested, static Go: `trixie` and `forky`, notify `frostyard/snosi`.
  - Its `release_workflow_contract_test.go` pins the direct Snosi dispatch
    and changes with ADR-0056.
- [ ] **bootc-debian.** Ships `bootc` and `libostree-1-1`, which every OCI
  profile installs.
  - The repository is private, so the writer needs read access to its
    releases.
  - Its releases are manual (`workflow_dispatch`), and it is not attested:
    register it `attested=no` until it adds provenance.
  - It links distribution libraries, so it needs per-codename builds
    (`~deb13`, `~deb14`). Debian `forky` already ships libostree 2026.4-1,
    which is newer than Frostyard's 2026.3.
- [ ] **chairlift.** Ships `frostyard-chairlift` (snow, snowfield and sundog)
  and `frostyard-chairlift-system-integration`.
  - Not attested.
  - puregotk loads GTK4 and libadwaita at runtime, and the package declares no
    `Depends`. Verify it on `forky` before registering `forky`.
- [ ] **intuneme.** Ships `frostyard-intuneme` (snow and sundog). Attested,
  static.
- [ ] **first-setup.** Ships `snow-first-setup`, architecture `all` (snow and
  snowfield). Attested. Its Repogen step is pinned to `@main`.
- [ ] **firn.** Ships `frostyard-firn`, which the firn-installer ISO pins to
  0.6.0. Not attested, static.
- [ ] **incus.** Ships `incus`, `incus-base`, `incus-client`, `incus-extra` and
  `incus-ui-canonical` (the incus sysext).
  - It publishes from the `stable` branch, and is not attested.
  - It links distribution libraries, and its versions carry `-debian13-`,
    which is not a codename marker. Register it for `trixie` only until its
    versions carry `~deb13` or `~deb14`.
  - Its epoch makes apt prefer it over Debian's incus, and
    `incus-ui-canonical` exists only here.
- [ ] **omarchy-apps.** Not migrated
  ([ADR-0049](../adr/0049-retire-omarchy-apps-without-breaking-snosi.md)).
  `voxtype` and `moonlight-qt` stay in `trixie` from the seed until Snosi
  resolves them.

Producers whose packages Snosi does not install from the repository:

- [ ] **pilothouse.** Snosi downloads `frostyard-pilothouse` from its GitHub
  release instead.
  - Its daemon is built with CGO on `ubuntu-latest`. Build it in
    `debian:trixie` before publishing to APT.
  - Not attested.
- [ ] **snowcat-cockpit.** Ships `frostyard-snowcat-cockpit`. Attested, static.
- [ ] **gchlog.** Ships `frostyard-gchlog`, which is not in the legacy suite.
  The repository has been dormant since February 2026.
- No producer to migrate:
  - igloo (archived);
  - nbc (archived; [ADR-0052](../adr/0052-remove-nbc-artifact-retention-gates.md));
  - `kapsule` and `kapsule-gnome` (their `Homepage`,
    `github.com/frostyard/kapsule`, does not exist).
- **Done when:** every producer above publishes its next release through
  apt-publisher, and no producer workflow calls Repogen's `publish-to-r2`
  with `package-type: deb`.

## Phase 5 — Move Snosi to `/debian/` `trixie`

- [ ] Change `mkosi.sandbox/etc/apt/sources.list.d/frostyard.sources` to
  `URIs: https://repository.frostyard.org/debian/` and `Suites: trixie`,
  keeping `frostyard.gpg`. Try it in a test build first.
- [ ] Confirm that Snosi's sysext publication, through Repogen's
  `package-type: sysext` path, writes nothing under `dists/` or `debian/`.
- Requires Phase 3.
- **Done when:** Snosi's default builds install Frostyard packages from
  `/debian/` `trixie`, and the
  [stable repository drift alarm](../design/stable-repository-drift-alarm.md)
  still reports `stable` unchanged.

## Phase 6 — Build and validate `forky`

- [ ] Producers that register `forky` publish to it: unmarked static builds
  directly, and distribution-linked packages as `~deb14` builds.
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
