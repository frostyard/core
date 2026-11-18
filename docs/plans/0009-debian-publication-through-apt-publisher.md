# Plan: Debian publication through apt-publisher

**Status:** Active. Governed by [ADR-0055](../adr/0055-publish-debian-packages-through-the-apt-publisher.md)
and [ADR-0056](../adr/0056-rebuild-images-after-apt-publication.md); replaces
[Plan 0006](0006-nbc-retirement-and-debian-suite-migration-fast-path.md) and
[Plan 0007](0007-support-suites-in-repogen.md).

This plan moves every Frostyard Debian producer and consumer from the frozen
legacy `stable` suite to explicit codenames at
`https://repository.frostyard.org/debian/`, published by
[`frostyard/apt-publisher`](https://github.com/frostyard/apt-publisher).

- **Done:** the writer, the seeded `trixie` suite, CDN caching, every
  producer whose packages Snosi installs, Snosi itself (Phases 1–5),
  the validation of `forky` (Phase 6), and steady state (Phase 7).
- **What remains:** the open question on legacy `stable` after
  2027-09-30. "What Repogen becomes" was decided on 2026-11-17 (see
  [Resolved questions](#resolved-questions)).
- **Suites:** `forky` is a 2nd suite beside `trixie`, not its successor.
  `trixie` stays, and it stays the default; nothing is promoted or moved.
  The aim is a pipeline that works for `forky` the day Debian releases it,
  and that a host can switch to now, by choice.

NBC retirement stays with
[Plan 0008](0008-post-nbc-bootc-only-transition.md). omarchy-apps publishes
through apt-publisher since 2026-10-22 (Phase 4), under
[ADR-0060](../adr/0060-publish-omarchy-apps-through-the-apt-publisher.md),
which supersedes
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

## Phase 4 — Move producers (done for Snosi's producers 2026-10-22)

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
- [x] **omarchy-apps.** Governed by
  [ADR-0060](../adr/0060-publish-omarchy-apps-through-the-apt-publisher.md)
  [ADR-0066](../adr/0066-build-only-the-omarchy-apps-packages-that-snosi-uses.md)
  [ADR-0067](../adr/0067-publish-omarchy-apps-on-change-and-keep-the-newest-two.md)
  and [ADR-0082](../adr/0082-verify-the-build-provenance-of-omarchy-apps.md).
  Shipped twelve Omarchy apps until 2026-11-02; since ADR-0066 it builds
  only `voxtype` and `moonlight-qt` (Snosi's sysexts). The other ten served
  the flurry desktop, which Snosi removed.
  - A push to `main` builds, in `debian:trixie`, the amd64 packages whose
    inputs changed (ADR-0067), publishes a GitHub release
    `main-<UTC time>-<short sha>` of exactly those `.deb` files, then
    requests `trixie` (frostyard/omarchy-apps#2). A push that changes no
    app's inputs publishes nothing. The repository holds no signing key and
    no bucket credentials.
  - Its registration keeps the newest two versions of each package
    (`keep` 2, ADR-0067).
  - Registered by exact package names, `trixie` only
    (frostyard/apt-publisher#12).
    - Its versions carry no `~deb13` marker.
    - Attested from `build.yml@refs/heads/main` since
      frostyard/apt-publisher#28 (ADR-0082): the writer verifies the build
      provenance of each `.deb`.
    - `gpu-screen-recorder` is also a Debian package (`forky`, `sid`).
  - `main-20261022024102-da2ea04` was published on 2026-10-22 by
    [publish run 39712749795](https://github.com/frostyard/apt-publisher/actions/runs/39712749795)
    into snapshot
    `trixie-20261022T024221Z-omarchy-apps-main-20261022024102-da2ea04`.
    Its apt canary downloaded all twelve packages from `trixie` amd64
    through the public URL, and the run dispatched `build` to Snosi.

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
- **gchlog.** Retired and archived on 2026-10-21. Its only user was
  first-setup's `Justfile` (`gchlog --write`), and that step is being
  replaced. `frostyard-gchlog` was never published to any suite.
- No producer to migrate:
  - igloo (archived);
  - nbc (archived; [ADR-0052](../adr/0052-remove-nbc-artifact-retention-gates.md));
  - `kapsule` and `kapsule-gnome` (their `Homepage`,
    `github.com/frostyard/kapsule`, does not exist).
- **Done when:** every producer whose packages Snosi installs publishes its
  next release through apt-publisher, and none of their workflows calls
  Repogen's `publish-to-r2` with `package-type: deb`.
  - This held on 2026-10-04 for updex, incus, intuneme, firn, first-setup,
    bootc-debian and chairlift, and on 2026-10-22 for omarchy-apps.
  - Each first release was checked from outside: routing, signature, index
    contents, apt canary, attestation where registered, and legacy `stable`
    unchanged.
- **No separate canary.**
  [ADR-0048](../adr/0048-publish-debian-packages-to-explicit-codenames.md)
  (migration step 3) named `gchlog` as the separately approved Trixie canary.
  That canary never ran. gchlog is retired (2026-10-21), and the seven
  producers above have published to `trixie` through apt-publisher since
  2026-10-02, each checked from outside.

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

## Phase 6 — Build and validate `forky` (done 2026-11-15)

On 2026-10-04 Snosi's secure image builds were failing on Debian's
half-published trixie-backports kernel. `linux-signed-amd64` 7.2.6 was
waiting in `backports-new`, leaving every 6.18+ backports kernel
uninstallable. frostyard/snosi#1043 takes their kernel from `forky` (7.2.8)
until that queue is processed.

- [x] Producers that register `forky` publish to it: unmarked static builds
  directly, and distribution-linked packages as `~deb14` builds. Done on
  2026-11-13, when the last of the seven producers published its first
  `forky` build.
  - Source of the versions and counts below: the `forky` amd64 indexes
    [main](https://repository.frostyard.org/debian/dists/forky/main/binary-amd64/Packages)
    (38 entries) and
    [image](https://repository.frostyard.org/debian/dists/forky/image/binary-amd64/Packages)
    (12 entries), read on 2026-11-15 under the `forky` `InRelease` dated
    2026-11-14 01:57:07 UTC. A count is the number of entries of that
    package name.
  - The registrations are rows of apt-publisher's `config/producers.tsv`.
    A producer whose release step names no codename publishes to every
    codename of its row.
  - **updex:** registered `trixie,forky` in apt-publisher's first commit
    (`38ee348`, 2026-10-02); its release step requests publication since
    frostyard/updex#432 (2026-10-02). `frostyard-updex`: 13 versions,
    2.0.2 to 2.3.1.
  - **intuneme:** registered `trixie,forky` by frostyard/apt-publisher#9
    (2026-10-03); release step frostyard/intuneme#204 (2026-10-03).
    `frostyard-intuneme`: 7 versions, 0.20.3 to 0.23.0.
  - **firn:** registered `trixie,forky` by frostyard/apt-publisher#9
    (2026-10-03); release step frostyard/firn#104 (2026-10-03).
    `frostyard-firn-gui` came with frostyard/firn#122 and its registration
    with frostyard/apt-publisher#17 (both 2026-10-26). `frostyard-firn`:
    10 versions, 0.6.1 to 0.12.0; `frostyard-firn-gui`: 4 versions, 0.10.0
    to 0.12.0.
  - **chairlift:** a smoke test of v0.17.1 on `debian:forky` passed
    (frostyard/chairlift#306, 2026-11-13). frostyard/apt-publisher#50
    (2026-11-13) registers it for `forky`, and
    [publish run 43489626827](https://github.com/frostyard/apt-publisher/actions/runs/43489626827)
    published v0.17.1 there the same day. `frostyard-chairlift` and
    `frostyard-chairlift-system-integration`: 1 version each, 0.17.1.
    first-setup has no producer row (retired by
    frostyard/apt-publisher#32, 2026-11-06).
  - **bootc-debian:** frostyard/bootc-debian#27 (2026-11-13) builds
    Debian 13 and Debian 14 packages from 1 build stamp, and
    frostyard/apt-publisher#50 registers it for `forky`.
    [Publish run 43504005818](https://github.com/frostyard/apt-publisher/actions/runs/43504005818)
    published `bootc-1.17.4-ostree-2026.6-202611132023` on 2026-11-13.
    `bootc` 1.17.4-frostyard202611132023~deb14 and `libostree-1-1`
    2026.6-frostyard202611132023~deb14: 1 version each. That
    `libostree-1-1` sorts above Debian `forky`'s own 2026.6-1.
  - **incus:** frostyard/incus#17 (2026-11-13, on its default branch
    `stable`) adds the Debian 14 build carrying `~deb14`, and
    frostyard/apt-publisher#50 registers it for `forky`. Publish runs
    [43498417064](https://github.com/frostyard/apt-publisher/actions/runs/43498417064)
    (2026-11-13) and
    [43540214881](https://github.com/frostyard/apt-publisher/actions/runs/43540214881)
    (2026-11-14) published `7.6-debian14-202611132003` and
    `7.6-debian14-202611140118`. `incus`, `incus-base`, `incus-client`,
    `incus-extra` and `incus-ui-canonical`: 2 versions each,
    1:7.6-debian14-202611132003~deb14 and
    1:7.6-debian14-202611140118~deb14.
  - **omarchy-apps:** frostyard/omarchy-apps#19 (2026-11-13) installs and
    runs each package in `debian:forky` before it releases, and
    frostyard/apt-publisher#50 registers it for `forky`.
    [Publish run 43491240131](https://github.com/frostyard/apt-publisher/actions/runs/43491240131)
    published `main-20261113192000-4de76c0` to `trixie` and `forky` on
    2026-11-13. `voxtype` 1.1.1-frostyard20261113191850 and `moonlight-qt`
    6.2.0-frostyard20261113191853: 1 version each.
- [x] Build each sysext for each suite. updex picks a sysext by `%w`, the
  host's `VERSION_ID`, and Debian `forky`'s os-release has no `VERSION_ID`
  before Debian releases it (base-files 14.2), so a `forky` image must set
  `VERSION_ID=14`. A host that switches suite must never merge a sysext of
  the other suite. Done on 2026-11-14, except for 2 sysexts that are
  `trixie` only (below).
  - frostyard/snosi#1292 (2026-11-13) makes the Debian release a build
    input, sets `VERSION_ID="14"` on `forky`, and builds Floe on `forky`
    beside `trixie` (Snosi ADR-0037).
  - frostyard/snosi#1306 (2026-11-14) builds Snow, Snowfield, Sundog and
    the sysexts on `forky`. frostyard/snosi#1308 (2026-11-14) publishes the
    `forky` sysexts after the `trixie` publish.
  - frostyard/snosi#1307 (2026-11-14) enables `updex-suite-switch.service`,
    which frostyard-updex 2.3.1 ships (frostyard/updex#516). At boot after
    a suite switch, it links the sysext images of the running suite.
  - [`build.yml` run 43611342770](https://github.com/frostyard/snosi/actions/runs/43611342770)
    (job `build-forky`, at `812e98eb`) published 31 sysext files, all
    `_14_`, and 31 manifests under `manifests/forky/`. `trixie` stayed
    intact: its `_13_` lines in `SHA256SUMS` stayed, and the HTML index
    and the 33 `trixie` manifests were byte-identical. The publication of
    the next main run,
    [43611567059](https://github.com/frostyard/snosi/actions/runs/43611567059),
    was idempotent.
  - `trixie` only: `sunshine` (no upstream `forky` package) and the
    himmelblau sysext.
- [x] Prove clean install, update and rollback on `forky`, without changing
  `trixie` or `stable`. Done on 2026-11-15.
  - Package level, passed on 2026-11-15, amd64 only (the arm64 entries of
    `main` were not tested): each of the 15 package names of the 50 entries
    in the 2 `forky` amd64 indexes above installed from
    `https://repository.frostyard.org/debian/` `forky` (components `main`
    and `image`, `Signed-By` the `debian/frostyard.gpg` key
    `432C452CD2B7F4FF1B5D23264DE6A2016E622F97`). The test used 1 fresh local
    `debian:forky` container for each package family
    (`debian@sha256:15f483ba923e…`), and wrote nothing to the repository.
    - In each container: a clean install of the newest version, and
      `dpkg-query` showed it installed at that version.
    - Every package with 2 or more versions (`frostyard-updex`,
      `frostyard-firn`, `frostyard-firn-gui`, `frostyard-intuneme`, and the
      5 incus packages): after a purge, install N-1, upgrade to N with
      `apt-get install --only-upgrade`, then roll back with
      `apt-get install PKG=N-1 --allow-downgrades`. `dpkg-query` showed
      N-1 after the rollback, and `dpkg --audit` found nothing. The pairs
      were updex 2.3.0 and 2.3.1, firn and firn-gui 0.11.1 and 0.12.0,
      intuneme 0.22.1 and 0.23.0, and incus 202611132003 and
      202611140118.
    - The single-version packages (`bootc`, `libostree-1-1`, both chairlift
      packages, `voxtype`, `moonlight-qt`) were installed clean. Their
      update and rollback stay unproven until a 2nd `forky` version exists.
      `frostyard-chairlift` and `frostyard-chairlift-system-integration`
      conflict with each other by design, so each was installed in its own
      container.
    - The binaries ran: `updex`, `firn`, `intuneme`, `voxtype`, `bootc`
      and `incus` printed their versions. `chairlift` started and stopped
      with "cannot open display". `moonlight-qt` started, found no Wayland
      or X11 display, and stopped because Qt found no usable platform plugin
      (the package ships only `xcb`). The container had no display, so this
      test does not show that either GUI runs.
    - The `InRelease` files of `trixie`, `forky` and legacy `stable` had the
      same `Date` line and SHA-256 before and after the test.
  - Signed images: `forky-publish.yml` (Snosi ADR-0038; every product
    since frostyard/snosi#1309 of 2026-11-14, ADR-0039) published 2 `forky` images of
    each product, N and N+1. Each run made 1 tag, `cosign verify` passed,
    and `latest` did not change. Runs: Floe 43550711663 and 43553230001,
    Snow 43611296094 and 43616447362, Snowfield 43621104199 and
    43624974195, Sundog 43630664360 and 43635094915.
  - Images in the lab: install, update and rollback on the dev lane, with
    Secure Boot and TPM2-LUKS. The update target is the immutable N+1
    version tag, which frostyard/lab#243 (2026-11-14) allows as
    `target_ref`. Each
    product passed `forky`→`forky` and `trixie`→`forky`, in that order in
    the lab runs `dev-snow-bootc-lifecycle-<id>` below:
    - Floe: `k7mtk` and `f8sv7`.
    - Snow: `bp2t9` and `kjsb2`.
    - Sundog: `dpgf5` and `ptsp2`.
    - Snowfield: `6tvjf`, and `j6kwb`, `65xfw` and `zdw24`. The
      `trixie`→`forky` runs pass since frostyard/lab#244 (2026-11-15) lists its kernel
      `7.3.4-1-surface` as a known-defect kernel.
    - The fs-verity notes of these runs are the upstream btrfs defect of
      frostyard/snosi#1130. It is not specific to `forky`.
  - Sysexts in the lab: run `257hz` passed `verified_sysext_probe` on
    `forky` (install). Run `ps9wh` passed `verified_sysext_suite_switch`, a
    mode that frostyard/lab#245 (2026-11-15) adds: it enabled incus, coder and nix on
    `trixie` Snow (`_13_` links) and updated to `forky` Snow, where
    `updex-suite-switch.service` ended `success` and every link named the
    `_14_` file. Then it rolled back to the `_13_` links. This suite switch
    is the sysext update proof of this phase.
  - The `:forky` tag: frostyard/snosi#1313 (2026-11-15, Snosi ADR-0040)
    moves it to a verified `forky` image by dispatch. The first promotions
    moved it to the N+1 digest that the lab proved, and verified each
    digest with `cosign`; `latest` did not change. Floe `3520a458`
    ([run 43669601867](https://github.com/frostyard/snosi/actions/runs/43669601867)),
    Snow `8c99b9d6`
    ([43669674713](https://github.com/frostyard/snosi/actions/runs/43669674713)),
    Sundog `81fd2d5e`
    ([43669719699](https://github.com/frostyard/snosi/actions/runs/43669719699))
    and Snowfield `e5c8b694`
    ([43708659346](https://github.com/frostyard/snosi/actions/runs/43708659346)).
    frostyard/snosi#1315 (2026-11-15) documents that a newer waiting
    dispatch of `forky-publish.yml` cancels an older one.
  - frostyard/snosi#1312 (2026-11-15) documents the `forky` opt-in
    stream: the switch, the rollback, and the way back to `trixie`.
- [x] Rebase or replace Snosi PR #924 once packages and products validate.
  Replaced by frostyard/snosi#1292, which takes the `forky` package
  renames and the `VERSION_ID="14"` handling of #924 and builds `forky` as
  a 2nd suite instead of moving the repository to it. #924 was closed
  unmerged on 2026-11-13.
- **Done when:** `forky` and `trixie` independently install and roll back.
  Both held on 2026-11-15: the package, image and sysext records above.
- Open after this phase:
  - Sysext revision update on `forky` (r to r+1 within `_14_`). It needs
    a 2nd `_14_` revision of a sysext and an updex option that enables a
    pinned older version.
  - Update and rollback of the single-version packages above, when a 2nd
    `forky` version exists.
  - Snowfield on representative Surface hardware: not tested.
  - frostyard/snosi#1130 (an upstream btrfs defect) is open.

## Phase 7 — Steady state (done 2026-11-18)

- [x] Set apt-publisher's `APT_AUDIT_ENABLED=true` once its producers publish
  through it.
  - All eight registered producers do. A manual
    [audit run 40156591706](https://github.com/frostyard/apt-publisher/actions/runs/40156591706)
    on 2026-10-25, at apt-publisher `8804052`, passed. It found every
    `.deb` of each producer's latest release in its codenames:
    updex v2.1.0, incus `7.5.1-debian13-202610231739`, intuneme v0.20.4,
    firn v0.8.0, chairlift v0.11.2, first-setup v0.4.1, bootc-debian
    `bootc-1.16.8-ostree-2026.3-202610040153` and omarchy-apps
    `main-20261023154604-1cbd54d`.
  - The variable was set on 2026-10-25 at 08:11 UTC. The first scheduled
    [audit run 40188675832](https://github.com/frostyard/apt-publisher/actions/runs/40188675832)
    passed the same day, at apt-publisher `c1696ce`. It found every `.deb`
    of all eight producers' latest releases, firn now at v0.9.0.
- [x] The nightly audit passes. The records below were read on 2026-11-18.
  All dates in this record are UTC dates.
  - apt-publisher `main` was `49f436a`
    (`49f436adfbe164a1ed066fa1707ca253899728a5`), the merge of
    frostyard/apt-publisher#56 on 2026-11-17.
  - At that commit, `.github/workflows/audit.yml` runs daily at 06:17 UTC
    (cron `17 6 * * *`) while `APT_AUDIT_ENABLED` is `true`. It runs
    2 independent steps: `scripts/audit-producers.sh` and
    `scripts/audit-debian-names.sh`.
  - `audit-producers.sh` reads each producer's latest GitHub release. Each
    `.deb` asset must be listed, by name, version and architecture, in the
    `Packages` index of at least 1 codename of its row, in that row's
    component. The version is compared without its epoch, and with `~`
    read as `.`. `config/producers.tsv` at `49f436a` has 7 rows, all
    listing `trixie,forky`: updex, intuneme, firn, chairlift and
    omarchy-apps in `main`; incus and bootc-debian in `image`. The 8th
    producer of 2026-10-25, first-setup, left the registry with
    frostyard/apt-publisher#32 on 2026-11-06. `config/codenames.tsv`
    supplies the architectures: `amd64`, `arm64` and `all`.
  - It also compares
    `https://repository.frostyard.org/debian/frostyard.gpg` with
    `keys/frostyard.gpg` byte for byte (frostyard/apt-publisher#18,
    2026-10-28).
  - `audit-debian-names.sh` reads `main` only, not `image`, for each
    codename of `config/codenames.tsv`: `trixie` and `forky`. It reports
    package names that Debian also ships in CODENAME, CODENAME-updates,
    CODENAME-security or CODENAME-backports
    ([ADR-0059](../adr/0059-publish-image-only-packages-in-a-separate-apt-component.md)).
    frostyard/apt-publisher#19 added it on 2026-10-28.
    frostyard/apt-publisher#33 changed it to fetch Debian indexes by hash
    on 2026-11-05.
  - Limits: only the latest release of each producer is audited, not older
    releases. incus releases its Debian 13 and Debian 14 builds separately;
    run 44120229831 audited Debian 13 release `7.6-debian13-202611140125`.
    A `.deb` passes when any 1 codename of its row lists it, not each
    codename. The audit does not read legacy `stable`; the drift alarm
    below does.
  - Source: `gh run list -R frostyard/apt-publisher -w audit -L 10`, read
    on 2026-11-18. All 10 listed runs, from 2026-11-08 to 2026-11-17,
    were scheduled runs on `main` and passed. The 5 latest were:
    - [44120229831](https://github.com/frostyard/apt-publisher/actions/runs/44120229831),
      2026-11-17, at `49f436a`;
    - [43899157794](https://github.com/frostyard/apt-publisher/actions/runs/43899157794),
      2026-11-16, at `f62e4ee`;
    - [43721405405](https://github.com/frostyard/apt-publisher/actions/runs/43721405405),
      2026-11-15, at `f62e4ee`;
    - [43599933175](https://github.com/frostyard/apt-publisher/actions/runs/43599933175),
      2026-11-14, at `f62e4ee`;
    - [43443542322](https://github.com/frostyard/apt-publisher/actions/runs/43443542322),
      2026-11-13, at `e255194`.
  - The log of run 44120229831 lists updex v2.3.1, incus
    `7.6-debian13-202611140125`, intuneme v0.24.0, firn v0.12.0,
    chairlift v0.17.1, bootc-debian
    `bootc-1.17.4-ostree-2026.6-202611132023` and omarchy-apps
    `main-20261113192000-4de76c0`. Its Debian-name step audited `trixie`
    and `forky`, each against the 4 Debian suites named above, with no
    finding.
- [x] Keep `trixie` published beside `forky`: `forky` is not promoted, so
  `trixie` has no end date in this plan. Keep signed `stable` unchanged
  through at least 2027-09-30.
  - This is a standing rule. The tick records that it held when checked
    on 2026-11-18, not that it ended. It stays in force: `stable` through
    at least 2027-09-30, and `trixie` until at least 90 days after a
    `forky` promotion (ADR-0055).
  - The `trixie` and `forky` `InRelease` files were readable on
    2026-11-18 at 00:07 UTC, with the dates recorded below.
  - Core's weekly `stable-repository-drift.yml` checks legacy `stable`
    (cron `23 5 * * 1`, Monday at 05:23 UTC;
    [drift alarm](../design/stable-repository-drift-alarm.md)). Its latest
    scheduled [run 43878961484](https://github.com/frostyard/core/actions/runs/43878961484)
    passed on 2026-11-16 at core `17b49ba`.
- [x] The retention windows are recorded on 2026-11-18.
  - Policy: [ADR-0055](../adr/0055-publish-debian-packages-through-the-apt-publisher.md),
    "Retention windows",
    keeps signed `stable` readable and unchanged through at least
    2027-09-30, with every pool byte its indexes reference. No redirect,
    symlink or alias points `stable` at a codename. `trixie` stays readable
    for at least 90 days after `forky` is promoted. `forky` is not
    promoted, so `trixie` has no end date.
  - Metadata: the following `InRelease` files were read on 2026-11-18 at
    00:07 UTC. None had a `Valid-Until` field:
    - [`trixie`](https://repository.frostyard.org/debian/dists/trixie/InRelease):
      `Date: Mon, 16 Nov 2026 18:25:44 UTC`.
    - [`forky`](https://repository.frostyard.org/debian/dists/forky/InRelease):
      `Date: Mon, 16 Nov 2026 18:26:44 UTC`.
    - [Legacy `stable`](https://repository.frostyard.org/dists/stable/InRelease):
      `Date: Thu, 01 Oct 2026 12:29:12 +0000`. This is the date of the
      signed update that the drift alarm's baseline records (observed on
      2026-10-03).
    - `https://repository.frostyard.org/debian/dists/stable/InRelease`
      returned HTTP 404. No `stable` exists under `/debian/`; no alias
      points it at a codename (ADR-0055).
    - No suite's metadata expires: apt never refuses these indexes as out
      of date. A search of apt-publisher's `scripts/`, `config/` and
      `docs/` at `49f436a` finds no `Valid-Until`.
  - Version retention: column 7, `keep`, of `config/producers.tsv` at
    apt-publisher `49f436a` gives omarchy-apps `2`. The 6 other rows have
    `-`, no limit. The column and value came with
    frostyard/apt-publisher#27 on 2026-11-02 (core ADR-0067, linked in
    Phase 4; apt-publisher ADR-0003). Retention removes a version from the
    index only. Pool files stay, and rollback can restore a pruned version.
  - Index counts read on 2026-11-18 (a count is the number of entries of
    that package name): the `main` amd64 `Packages` index of
    [`trixie`](https://repository.frostyard.org/debian/dists/trixie/main/binary-amd64/Packages)
    lists 2 versions each of `voxtype` and `moonlight-qt`; that of
    [`forky`](https://repository.frostyard.org/debian/dists/forky/main/binary-amd64/Packages)
    lists 1 each.
- **Done when:** the nightly audit passes, and the retention windows are
  recorded in this plan.
  Both held on 2026-11-18:
  - the nightly-audit item above records the passing scheduled runs;
  - the retention-windows item above records policy, metadata and versions.

## Later / ideas

- **Refuse non-canonical asset names.** Refuse any `.deb` whose release asset
  name isn't `<name>_<version>_<arch>.deb`, with the epoch dropped and
  GitHub's `~`→`.` rename accepted. aptly keeps asset names for pool files,
  and first-setup's unversioned legacy asset showed the collision risk.
- **Check which workflow signed an attestation,** not only the tag
  (`--signer-workflow` or a tag pattern). firn's and updex's release
  workflows run on any tag, while their tag rulesets protect only `v*`.

## Resolved questions

- **What Repogen becomes** (decided on 2026-11-17, within Phase 7). Repogen
  stays the sysext publisher only, and Debian packages stay with
  apt-publisher. No sign-and-upload step replaces Repogen. This is the
  split that
  [ADR-0055](../adr/0055-publish-debian-packages-through-the-apt-publisher.md)
  already states: "Repogen no longer publishes Debian packages. It
  continues to publish sysexts". So no new ADR is necessary.
  - On 2026-11-18, a GitHub code search of the frostyard organization for
    `frostyard/repogen` in workflow files found 1 caller: frostyard/snosi
    `.github/workflows/build.yml`. It calls `publish-to-r2` 2 times, for
    the `trixie` and `forky` sysext publications, at repogen v0.7.4
    (released 2026-11-17).
  - Repogen's `publish-to-r2` refuses Debian input: at v0.7.4
    (`c2f9f54`), its
    [`action.yml`](https://github.com/frostyard/repogen/blob/c2f9f54931520d7801c8339db8b9931d8737f395/.github/actions/publish-to-r2/action.yml)
    stops on `package-type: deb`, and on any Debian package in
    `packages-dir`.

## Open questions

- **What happens to legacy `stable` after 2027-09-30.** Expiry alone
  authorizes no removal; it needs its own decision.

## References

- Implements: [Debian publication](../design/debian-publication.md)
- Governed by: [ADR-0055](../adr/0055-publish-debian-packages-through-the-apt-publisher.md),
  [ADR-0056](../adr/0056-rebuild-images-after-apt-publication.md);
  omarchy-apps by [ADR-0060](../adr/0060-publish-omarchy-apps-through-the-apt-publisher.md),
  [ADR-0066](../adr/0066-build-only-the-omarchy-apps-packages-that-snosi-uses.md)
  and [ADR-0067](../adr/0067-publish-omarchy-apps-on-change-and-keep-the-newest-two.md)
- Replaces: [Plan 0006](0006-nbc-retirement-and-debian-suite-migration-fast-path.md),
  [Plan 0007](0007-support-suites-in-repogen.md)
- Coordinates with: [Plan 0008](0008-post-nbc-bootc-only-transition.md)
