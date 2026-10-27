# Plan: Suite packaging — Flatpaks and sysexts

This plan ships frostyard's suite as
[ADR-0058](../adr/0058-ship-suite-desktop-apps-as-flatpaks-and-services-as-sysexts.md)
decides, as
[ADR-0062](../adr/0062-make-desktop-suite-apps-standalone-flatpaks-with-opt-in-lodge.md)
amends it: each desktop suite app (frostnotes, frostmail, frostread) is a
standalone Flatpak from `frostyard/flatpak-index` that carries its UI, its
daemon and its helpers, with lodge as an opt-in mode per app. Porter stays
lodge's app `porter`, with no Flatpak. lodge and its app daemons are
sysexts that Snosi builds, Repogen publishes and updex installs. It builds
on lodge's platform ([ADR-0057](../adr/0057-run-first-party-apps-behind-lodge.md)) and
on the sysext contract ([ADR-0007](../adr/0007-frostyard-sysext-filename-pattern.md),
[ADR-0008](../adr/0008-sysext-distribution-and-update-contract.md)). It
answers lodge's open packaging question and replaces frostnotes' and
frostmail's M6 packaging lines. The Flatpak track (Phases 5a to 5c and 6)
does not depend on the sysext track (Phases 1 to 4); they can run side by
side.

## Inventory

Every artifact of the five suite repositories, and its side.

| Repository | Artifact | Side | Notes |
| --- | --- | --- | --- |
| lodge | `lodge`, `lodgectl`, the shell's bundle, `lodge.service`, `sysusers.d`, `tmpfiles.d`, the example configuration | sysext `lodge` | the example moves from `/etc/lodge/` to `/usr/share/lodge/` |
| lodge | `kit/`, `client/`, `ui/` | not shipped | libraries, pinned by git tag |
| lodge | `dev/fakeapp`, the `e2e` build | not shipped | development only |
| frostnotes | `notesd -lodge`, `notesctl`, the `notes` web build, `frostnotes.service`, `frostnotes-lodge.socket`, `sysusers.d` | sysext `notesd` | already stages `/usr/bin` |
| frostnotes | the Tauri app | Flatpak `org.frostyard.Frostnotes` | notesd ships inside the Flatpak, in the app's own sandbox ([frostnotes ADR-0031](https://github.com/frostyard/frostnotes/blob/main/docs/adr/0031-the-desktop-app-ships-as-a-flatpak-with-its-own-notesd.md)) |
| frostnotes | `notesctl` on a desktop (`notesctl mcp` for an agent, `notesctl sync`) | inside the Flatpak | **does not fit cleanly:** run with `flatpak run --command=notesctl` |
| frostnotes | the M2 hub (`notesd -hub`, user `notes`) | not shipped | retired by frostnotes M4 Phase 7 |
| frostmail | `maild --lodge`, `mailctl`, the `mail` web build, `frostmail.service`, `frostmail.socket`, `sysusers.d` | sysext `maild` | stages `/usr/local/bin` today |
| frostmail | the Tauri app | Flatpak `org.frostyard.Frostmail` | carries the UI, maild and `mailctl`; lodge connection mode ([frostmail ADR-0041](https://github.com/frostyard/frostmail/blob/main/docs/adr/0041-maild-runs-as-a-lodge-app.md)); [ADR-0062](../adr/0062-make-desktop-suite-apps-standalone-flatpaks-with-opt-in-lodge.md) |
| frostmail | maild and `mailctl` on a desktop | inside the Flatpak | ADR-0062: no user unit ships |
| frostmail | the Windows install | not in this plan | frostmail M7 |
| frostmail | `tools/lodgeprobe` | not shipped | development only |
| frostread | `readd`, `readctl`, the `read` web build, `frostread.service`, `frostread.socket`, `sysusers.d` | sysext `readd` | **does not fit cleanly:** the repository is private, and Snosi's `verified_download` has no credentials, so it becomes public before Phase 3 builds `readd` |
| frostread | `readdev` | not shipped | development only |
| frostread | the desktop UI, readd, `readctl` | Flatpak (its ID set in a frostread ADR, per [ADR-0016](../adr/0016-reverse-dns-org-frostyard-identifiers.md)) | **not designed yet:** the desktop shell, content isolation and the lodge mode are open (ADR-0062) |
| porter | `porterd`, the `porter` web build, `frostporter.service`, `frostporter.socket`, `sysusers.d` | sysext `porterd` | stages `/usr/local/bin` today; the host runs `/opt/lodge/bin/porterd`; no Flatpak (ADR-0062) |

Two more facts do not fit cleanly:

- **lodge's host** is a Debian 13 virtual machine, not a Snosi image. Its
  services run from `/opt/lodge/bin` and `/usr/local/bin`, with units and
  `sysusers.d` entries in `/etc`. The sysexts are for Snosi images
  (ADR-0058), so the host uses them only after a fresh install of Floe
  (Phase 4).
- **A web app inside lodge** has no package of its own. It ships in its
  daemon's sysext, under `/usr/share/lodge/apps/<id>/`.

## Phase 0 — Agree the contract (small)

- *Done 2026-10-23:* Lucilla (flatpak-index, updex, apt-publisher) and
  Murbella (Snosi) answered the first round of questions on
  [core#159](https://github.com/frostyard/core/pull/159). Their answers are
  in ADR-0058 and in [Answered](#answered) below.
- *Done 2026-10-26:* ADR-0058 is Accepted.
- *Decided 2026-10-23:* lodge's host does not move to Floe for now. It
  stays the hand-installed virtual machine, because a sysext deploy is too
  slow during rapid development. Phase 4 is deferred; Phases 1 to 3 still
  ship.
- Brian makes frostread's repository public before Phase 3 builds `readd`.
  ✅ 2026-10-27: it is public.
- **Done when:** ADR-0058 is Accepted, and the host decision is recorded
  here. ✅ 2026-10-26: both hold.

## Phase 1 — The `/usr` layout in each service repository (small)

In lodge, frostnotes, frostmail, frostread and porter:

- Stage binaries in `/usr/bin`, and set each unit's `ExecStart=` to match:
  frostmail (`maild`, `mailctl`), frostread (`readd`, `readctl`) and porter
  (`porterd`) move from `/usr/local/bin`.
- lodge: install `config.example.json` as
  `/usr/share/lodge/config.example.json`. `install.sh` keeps working for a
  host without sysexts.
- frostnotes: add a staging script like the other apps' `stage.sh`; today
  `make lodge-app` lays out only the manifest and the web build.
- Each app's own `sysusers.d` file (`/usr/lib/sysusers.d/<user>.conf`)
  carries `g lodge -` beside its user and its `lodge-apps` and
  `lodge-agents` memberships, so its socket's `SocketGroup=lodge` resolves
  without lodge's sysext.
- Socket units keep their default dependencies.
- frostnotes: while notesd syncs as a device of the M2 hub (until M4
  Phase 7), check whether its service must run without a client; if so,
  its row in ADR-0058's `Upholds=` table gains `frostnotes.service`.
- Each repository's packaging test (lodge's `internal/packagecheck`,
  frostmail's `internal/lodge/package_test.go`, and a new one where none
  exists) checks the staged tree:
  - every path is under `/usr`;
  - no unit has `RequiredBy=` ([ADR-0030](../adr/0030-no-requiredby-enablement-in-shipped-units.md));
  - no unit that ADR-0058 upholds has a `Condition*=`
    ([snosi#1100](https://github.com/frostyard/snosi/issues/1100));
  - `systemd-analyze verify` passes on the units.
- Update lodge's app contract (Install layout), its `packaging/README.md`,
  the new-lodge-app scaffold's `stage.sh` and `sysusers.d` template,
  frostread's `specs/api.md` and porter's roadmap, which name the old paths.
- **Done when:** in each of the 5 repositories, the staging target writes
  only `/usr` paths, and `make check` passes with the new tests.

## Phase 2 — A release with a `.deb` in each service repository (medium)

- Add `.svu.yml` and `make bump`
  ([ADR-0012](../adr/0012-svu-versioning-and-rolling-dev-prerelease.md),
  [ADR-0053](../adr/0053-name-the-svu-config-svu-yml.md)), and a release
  workflow on `v*` tags that:
  - builds the binaries (`CGO_ENABLED=0`, `linux/amd64`) and the web build;
  - stamps the tag's version into `app.json`;
  - builds `frostyard-<name>_<version>_amd64.deb` from the staged tree with
    nFPM ([ADR-0011](../adr/0011-frostyard-prefixed-package-names.md)),
    whose `Version:` is the tag without the `v`, and whose `Depends:`
    Snosi's base image satisfies;
  - attests the `.deb` with `actions/attest-build-provenance`;
  - attaches it to the GitHub release.
- The `.deb` is not registered with apt-publisher, and the release sends no
  `publish-deb` or `build` dispatch.
- Actions are SHA-pinned with `permissions: {}`
  ([ADR-0021](../adr/0021-sha-pinned-actions-and-least-privilege-ci.md)).
- Package names: `frostyard-lodge`, `frostyard-notesd`, `frostyard-maild`,
  `frostyard-readd`, `frostyard-porterd`.
- Brian pushes the first tag in each repository; the machine account does
  not tag or release.
- If a CI job is renamed, the repository's required-checks ruleset changes
  with it.
- **Done when:** each of the 5 repositories has a `v0.1.0` release with an
  attested `.deb`, and `dpkg-deb -c` lists only `/usr` paths.

## Phase 3 — Five sysexts in Snosi (medium)

On the pattern of Snosi's `pilothouse` sysext
([design/sysexts.md](https://github.com/frostyard/snosi/blob/main/docs/design/sysexts.md),
[snosi ADR-0004](https://github.com/frostyard/snosi/blob/main/docs/adr/0004-sysext-authoring-rules.md)),
for `lodge`, `notesd`, `maild`, `readd` and `porterd`:

- `mkosi.images/<name>/`: `mkosi.conf` with the full `FinalizeScripts=`
  guard line and `KEYPACKAGE=frostyard-<name>`; `mkosi.postinst.chroot`
  (`verified_download`, `assert_deb_dependencies_satisfied`, `dpkg -i`);
  `required-paths.txt` listing the binaries, the units, the `sysusers.d`
  entry, the manifest, the drop-in and the preset.
- In each image: the `Upholds=` drop-in
  `multi-user.target.d/10-<name>.conf` and the preset `40-<name>.preset`,
  with the units in ADR-0058's table, as ADR-0063 amends it.
- `EXTENSION_RELOAD_MANAGER=1` in each sysext's `extension-release`.
- `shared/download/sysext-checksums.json`: the URL, SHA-256 and version of
  each `.deb`; and a release-check block for each in the
  `check-sysext-updates` job of `check-dependencies.yml`.
- In the base image: `usr/lib/sysupdate.<name>.d/<name>.feature`
  (`Enabled=false`) and `<name>.transfer`, matching
  `<name>_@v_%w_%a.raw.zst` (ADR-0007).
- The build-matrix rows and the rows in `docs/design/sysexts.md`.
- A build-time check of upheld units in each sysext's delta, the units a
  `.deb` ships included (a `sysext-upholds-guard` finalize script). It
  landed on 2026-10-23 ([snosi#1113](https://github.com/frostyard/snosi/issues/1113)).
- Repogen publishes each sysext under `ext/<name>/` with a signed
  `SHA256SUMS.gpg` ([ADR-0014](../adr/0014-single-gpg-trust-root.md)).
- The update path: a suite release, then `check-sysext-updates` (weekly, or
  run by hand), a reviewed checksum pull request, and its merge, which
  builds and publishes the sysext.
- **Done when:** `https://repository.frostyard.org/ext/index` lists the 5
  sysexts with signed checksums, and on a Floe test VM `updex features
  enable lodge` and `updex features enable porterd`, then a reboot, give a
  lodge whose `lodgectl apps` shows `porter` up at its release version.

### Phase 3 brief (2026-10-27)

The facts below were checked on 2026-10-27 against the `v0.1.0` releases
and Snosi's `main`. Brian decided both points on 2026-10-27. `lodge`,
`notesd`, `readd` and `porterd` can be built now from `v0.1.0`. `maild`
waits for frostmail `v0.1.1` (point (b)).

Facts that shape both points:

- **lodge polls every app's socket.** lodge asks each installed app's
  `/health` on `/run/lodge/apps/<id>.sock` every 15 s (`internal/apps/apps.go`,
  `PollEvery`). So while lodge runs, an upheld socket starts its service
  within 15 s, and no app daemon exits when idle. A socket-only uphold does
  not keep a service down.
- **The default start limit does not stop this failure loop.** In a test
  on systemd 257 (a Debian 13 container; Snosi runs 262, which was not
  tested), an upheld service that fails at start restarts every
  `RestartSec=`. frostmail's unit (`RestartSec=2`) made 80 attempts in 3
  minutes, about 53 journal lines a minute, and never reached
  `start-limit-hit`: the default limit is 5 starts in 10 s, and starts
  about 2.25 s apart never put more than 5 in one 10 s window. A failed condition is a different case: a skipped
  start does not count toward the limit, so an upheld unit whose condition
  fails is retried in bursts about every 10 s, forever (snosi#1100). An
  upheld `RemainAfterExit=yes` oneshot that `Wants=` the unit runs once,
  with no loop.

**(a) notesd: uphold `frostnotes.service` too?** notesd works without a
client: it watches each vault (fsnotify and a 5-minute rescan) and prunes
versions at start and every 24 h (`internal/vault/watch.go`,
`internal/vault/manager.go`). It syncs only a vault that has a remote; a
fresh host has none. Its unit has no `Condition*=` and needs nothing in
`/etc`.

**Decided 2026-10-27: uphold both**
([ADR-0063](../adr/0063-uphold-notesds-service-as-well-as-its-socket.md)).
The `notesd` sysext upholds `frostnotes-lodge.socket` and
`frostnotes.service`, and its preset enables both. The vault work then
runs from boot, and it does not depend on lodge.

**(b) maild: the secrets key before the service.** `frostmail.service` has
`LoadCredentialEncrypted=frostmail-secrets-key:/etc/credstore.encrypted/frostmail-secrets-key`.
Until root makes that file, systemd fails the unit before maild runs, and
maild refuses a key that does not open `secrets.sealed`
([frostmail ADR-0044](https://github.com/frostyard/frostmail/blob/main/docs/adr/0044-seal-the-servers-secrets-with-a-systemd-credential.md)).
maild works without a client (IMAP IDLE, rules, send-later, reminders), so
ADR-0058 upholds the service. With no key, maild then fails every 2 s
until the key exists. With only the socket upheld, lodge's first poll
starts the same loop through `Restart=on-failure`.

**Decided 2026-10-27: frostmail's `.deb` makes the key at first start.**
The `.deb` ships a oneshot `frostmail-secrets-key.service` with
`ConditionPathExists=!/etc/credstore.encrypted/frostmail-secrets-key`
that seals 32 random bytes with `systemd-creds encrypt --with-key=auto
--name=frostmail-secrets-key`, as `scripts/seal-mail-secrets.sh --apply`
does. `frostmail.service` gets `Requires=` and `After=` on it. The
oneshot is pulled, not upheld, so its condition is a clean skip.
ADR-0058's `maild` row stays (`frostmail.socket`, `frostmail.service`).
A restored `secrets.sealed` under another host's key still fails, as
frostmail ADR-0044 records; the operations doc covers that case.

**Follow-up for Irulan (frostmail):**

- A frostmail ADR that amends frostmail ADR-0044: the key is made on the
  host at first start, not by hand.
- The oneshot unit in the `.deb`, and the `Requires=` and `After=` in
  `frostmail.service`.
- frostmail's packaging test covers the new unit: no `RequiredBy=`, and
  `systemd-analyze verify` passes.
- A `v0.1.1` release with an attested `.deb`. Brian pushes the tag.

Snosi builds `maild` from `v0.1.1`, and it lists
`/usr/lib/systemd/system/frostmail-secrets-key.service` in its
`required-paths.txt`.

**Build spec for Snosi.** Common to all 5, on the `pilothouse` pattern:

- `mkosi.images/<name>/mkosi.conf` with `KEYPACKAGE=frostyard-<name>`,
  `CompressOutput=zstd`, `CompressLevel=19`, and pilothouse's full
  `FinalizeScripts=` line (`sysext-usr-only`, `sysext-required-paths`,
  `sysext-strip-icon-cache`, `sysext-no-private-keys`,
  `sysext-no-base-owned`, `sysext-upholds-guard`). Base-built, not
  `gui-base`.
- `mkosi.postinst.chroot`: `verified_download "<name>"`,
  `assert_deb_dependencies_satisfied`, `dpkg -i`. Each `.deb` declares only
  `Depends: systemd`. No `mkosi.finalize`: no `.deb` ships `/etc`.
- `shared/download/sysext-checksums.json`, key `<name>`: the URL, SHA-256
  and version below. The `check-sysext-updates` block for each runs, before
  it writes a pin, `gh attestation verify "$TMP" --repo frostyard/<repo>
  --signer-workflow frostyard/<repo>/.github/workflows/release.yml
  --source-ref refs/tags/v${VER} --deny-self-hosted-runners`, and fails
  closed. Today that job pins any download by its SHA-256 alone. All 5
  `v0.1.0` assets passed this check on 2026-10-27. Whether the job's token
  needs `attestations: read` for it is not yet checked.
- `mkosi.extra/usr/lib/extension-release.d/extension-release.<name>` with
  `EXTENSION_RELOAD_MANAGER=1`. mkosi at Snosi's pin (`5ca453a`) keeps the
  keys of a shipped `extension-release` file and adds only the missing ones
  (`configure_extension_release` runs after the extra trees).
- The drop-in `multi-user.target.d/10-<name>.conf` and the preset
  `40-<name>.preset` with the same units (table below).
- `required-paths.txt`: the binaries, the units, the `sysusers.d` file, the
  `app.json` (apps) or the shell's `index.html` (lodge), the drop-in, the
  preset and the `extension-release` file.
- In the base image: `usr/lib/sysupdate.<name>.d/<name>.feature`
  (`Enabled=false`) and `<name>.transfer` (`Features=<name>`, `Verify=true`,
  source `https://repository.frostyard.org/ext/<name>/`, `MatchPattern=`
  `<name>_@v_%w_%a.raw.zst` and the 3 other suffixes, `CurrentSymlink=<name>.raw`).
  The `v0.1.0` builds publish `<name>_0.1.0_13_x86-64.raw.zst`.
- The root `mkosi.conf` `Dependencies=`, the build-matrix rows, and the rows
  in `docs/design/sysexts.md`.

| Sysext | Repository | `.deb` (`v0.1.0`) | SHA-256 | Upheld and preset | `sysusers.d` | `tmpfiles.d` |
| --- | --- | --- | --- | --- | --- | --- |
| `lodge` | `frostyard/lodge` | [`frostyard-lodge_0.1.0_amd64.deb`](https://github.com/frostyard/lodge/releases/download/v0.1.0/frostyard-lodge_0.1.0_amd64.deb) | `0841d7376b0fbdc1e0f0f36987c516995bd92d70722118ef38ab850450243a3e` | `lodge.service` | `lodge.conf`: user `lodge`, groups `lodge-apps`, `lodge-agents` | `lodge.conf`: `/run/lodge`, `/run/lodge/apps` (root), `/var/lib/lodge` |
| `notesd` | `frostyard/frostnotes` | [`frostyard-notesd_0.1.0_amd64.deb`](https://github.com/frostyard/frostnotes/releases/download/v0.1.0/frostyard-notesd_0.1.0_amd64.deb) | `5d064b6295ffae653ad034a01d8c8caf7d21e47217a5f68396a95a09af0f3685` | `frostnotes-lodge.socket`, `frostnotes.service` (ADR-0063) | `frostnotes.conf`: user `frostnotes`, `g lodge`, in `lodge-apps` | none (`StateDirectory=`, `RuntimeDirectory=`) |
| `maild` | `frostyard/frostmail` | `frostyard-maild_0.1.1_amd64.deb` (not released yet; `v0.1.0` lacks the key unit) | pin from the `v0.1.1` release | `frostmail.socket`, `frostmail.service` | `frostmail.conf`: user `frostmail`, `g lodge`, in `lodge-apps` | none |
| `readd` | `frostyard/frostread` | [`frostyard-readd_0.1.0_amd64.deb`](https://github.com/frostyard/frostread/releases/download/v0.1.0/frostyard-readd_0.1.0_amd64.deb) | `d879d6fd345ff374d63562cb9080f5075c669574e75e1bf4d8411ead88e1beff` | `frostread.socket`, `frostread.service` | `frostread.conf`: user `frostread`, `g lodge`, in `lodge-apps`, `lodge-agents` | none |
| `porterd` | `frostyard/porter` | [`frostyard-porterd_0.1.0_amd64.deb`](https://github.com/frostyard/porter/releases/download/v0.1.0/frostyard-porterd_0.1.0_amd64.deb) | `f541a649275b767e644eaf58bc476b01adc7261cd6bbbf8afc2f317ae274acd7` | `frostporter.socket`, `frostporter.service` | `frostporter.conf`: user `frostporter`, `g lodge`, in `lodge-apps`, `lodge-agents` | none |

Each of the 4 pinned SHA-256 values matches the release asset's `digest`
and a download on 2026-10-27, and goes in `sysext-checksums.json`.
`maild`'s `.deb` gets its attestation check and its SHA-256 at `v0.1.1`.
No upheld unit in the 5 `.deb` files has a `Condition*=`, so
`sysext-upholds-guard` passes them.
The configuration in
`/etc` (`/etc/lodge/config.json`, `/etc/porter/porter.json`,
`/etc/frostread/frostread.json`) is optional: each daemon starts with
defaults when it is missing.

## Phase 4 — lodge's host on Floe (medium; deferred)

*Deferred 2026-10-23:* lodge's host stays the hand-installed virtual
machine while the suite is in rapid development, and the suite keeps
deploying to it as today. Revisit the move later.

- Take the rollback archive first: lodge's and the apps' state in
  `/var/lib/`, their configuration in `/etc/` (`/etc/lodge/`,
  `/etc/porter/`, `/etc/frostread/`, `/etc/lodge/lodge.env`), and the
  hand-installed binaries, units and app bundles.
- Install Floe fresh with Firn in a new UEFI virtual machine; there is no
  conversion in place. Secure Boot is optional.
- Restore the state and the configuration, enable the features for lodge
  and the 4 apps, and reboot. lodge keeps its tsnet state, so its 2 nodes
  keep their names.
- Keep the old virtual machine stopped, not deleted, until the new one
  passes its checks.
- Record the install as Floe fresh-install evidence in lab.
- Coordinate with frostnotes M4 Phase 7, which retires the M2 hub from
  2026-10-26: the move happens before Phase 7 or after it, not during it.
- **Done when:** lodge and the 4 apps run from sysexts on Floe;
  `lodgectl apps` shows each app at its release version; and after a newer
  release, `updex features update` and a reboot run the new version.

## Phase 5 — Common rules (small)

The rules below hold for each app in Phases 5a to 5c:

- A `flatpak-builder` manifest, on `org.gnome.Platform//51`, built in CI
  inside the SDK with offline sources: vendored crates
  (`flatpak-cargo-generator`), an offline pnpm store, and offline Go
  sources for an app with a Go module. The build needs no host tools.
- AppStream metadata (`/app/share/metainfo/<id>.metainfo.xml`), icons and
  the portals.
- A CI job builds the Flatpak on every pull request. A `v*` tag pushes the
  OCI image to `ghcr.io/frostyard/<repo>`, tagged `latest`, `vX.Y.Z` and
  `sha-<commit>`, and attests the digest (`attest-build-provenance` with
  `subject-digest`).
- Brian makes each GHCR package public, and stores
  `FLATPAK_INDEX_DISPATCH_TOKEN` if the remote should refresh at once.
- A Flatpak ships no system unit and no user unit ([ADR-0062](../adr/0062-make-desktop-suite-apps-standalone-flatpaks-with-opt-in-lodge.md)).
  A CLI runs as `flatpak run --command=<cli> <app-id>`.

**The standalone check** (ADR-0062). The app's repository records a test on
a fresh desktop with real portals and no other frostyard installation. The
test installs the release's attested OCI image by its digest, from a
staged catalogue that lists that digest. It covers the app's core local
work, a restart and a new login, an update that keeps the data, and each
lodge mode the app offers, with a mode change that moves no data. Then
`flatpak-index` lists the same digest. A test in the build sandbox does
not count: that sandbox has no portals.

## Phase 5a — Notes as a standalone Flatpak (medium)

`org.frostyard.Frostnotes` already carries the UI, notesd and `notesctl`,
and notesd runs in its own sandbox (frostnotes ADR-0031). What is left:

- Publication: the OCI image to `ghcr.io/frostyard/frostnotes`, and the
  `flatpak-index` listing.
- App settings for background activity, and for lodge sync.
- Permissions: file-system access to the vaults' folders, and the
  Background portal for sync at login.
- The clean-install record.
- **Done when:** Notes passes the standalone check, with its core local
  work: open a vault, edit, and background sync at login.

## Phase 5b — Mail as a standalone Flatpak (large)

`org.frostyard.Frostmail` comes to carry the UI, maild and `mailctl`
(ADR-0062):

- maild in the Flatpak: build with a Go module and offline Go sources; its
  lifecycle in its own sandbox; its data; its secrets; its permissions,
  including write access where it writes.
- First launch, with local account setup.
- One engine per account in lodge connection mode (frostmail ADR-0041).
- Save As inside the sandbox.
- Permissions: `--share=network`, the portals for notifications, OpenURI
  and files (the file chooser portal, not read-only access to the home
  directory), and write access where maild writes.
- An optional, explicit move from a host maild, which the user confirms.
- frostmail's own ADR, which records the reversal of parts of its
  ADR-0013, ADR-0041 and ADR-0045.
- **Done when:** Mail passes the standalone check, with its core local
  work: add an account and read, send, rules and send-later.

## Phase 5c — Read as a standalone Flatpak (large)

This phase depends on frostread's ADR for the desktop design and its app
ID. Nothing else waits for it.

- frostread's ADR: the desktop design and the app's ID
  ([ADR-0016](../adr/0016-reverse-dns-org-frostyard-identifiers.md)).
- The desktop shell.
- Isolation of untrusted article content without `lodge-content`.
- The lodge mode: sync or connection.
- Save as note, as an optional link to Notes.
- **Done when:** Read passes the standalone check, with its core local
  work: add a source, read and poll.

Porter has no Phase 5 item: it stays lodge's app `porter` (ADR-0062,
porter ADR-0003).

## Phase 6 — The remote lists the apps (small)

- First, `frostyard/flatpak-index` lists only attested digests and fails
  closed, and its `publish.yml` actions are SHA-pinned
  ([flatpak-index#2](https://github.com/frostyard/flatpak-index/issues/2)).
- Then add `frostyard/frostnotes`, `frostyard/frostmail` and
  `frostyard/frostread` to `apps.json`, and the 3 apps to its README. Each
  app goes in only after its Phase 5 check passes, with the same digest.
- A staged catalogue, apart from the public one, lists a candidate digest
  for a Phase 5 test (ADR-0062).
- **Done when:** `flatpak remote-ls frostyard` lists the 3 apps, each one
  after its check, with their names and icons from AppStream, and a test
  image without an attestation still stops the catalogue's deployment.

## Phase 7 — The records follow (small)

- lodge's roadmap: the packaging question answered, with a link to
  ADR-0058.
- frostmail: an ADR that supersedes ADR-0013's release path (its ADR for
  ADR-0062, with maild in the Flatpak); the M6 line in its roadmap.
- frostnotes: M6 in its roadmap (no hub container image, no apt packages).
- Each app's operations doc: enable `lodge` first; updates take effect at
  the next boot; without a reboot, run `systemd-sysusers`,
  `systemd-tmpfiles --create --graceful`, `systemctl daemon-reload` and a
  restart of the app's units.
- Each repository's `AGENTS.md` and packaging README: install from the
  sysext or the Flatpak.
- frostyard.org: a page for each sysext and each Flatpak.
- **Done when:** no doc in the 5 repositories names `/usr/local/bin`,
  `/opt/lodge/bin` or "debs through apt-publisher" as an install path.

## Later / ideas

- An `arm64` build of each `.deb` and sysext, when Snosi builds `arm64`
  sysexts.
- A `beta` tag for the Flatpaks, served as a second branch of the remote.
- `EXTENSION_RESTART_UNITS=` in each sysext, when Snosi's systemd is 262 or
  newer, so a refresh restarts the daemons without a reboot.
- `RequisiteFeatures=lodge` on each app's transfer. updex v2.1.1 and later
  enforce it ([updex#469](https://github.com/frostyard/updex/pull/469)),
  which fixed [updex#455](https://github.com/frostyard/updex/issues/455).
- One combined feature (for example `lodge-suite`) that the 5 transfers
  list, if one switch for the whole suite is wanted.
- The suite's Flatpaks in Snow's core set: needs a per-entry remote in the
  core-set format, the `frostyard` remote in the images and Firn support.
  A separate decision, after Phase 6.
- `apt install frostyard-lodge` on a plain Debian host: register the 5
  repositories with apt-publisher and add the `publish-deb` dispatch
  (ADR-0055, ADR-0056).

## Open questions

- **A faster trigger for suite releases** (Murbella, by Phase 3): keep the
  weekly `check-sysext-updates` run and run it by hand when needed, or add
  a `repository_dispatch` type (for example `sysext-release`) that a suite
  release sends (`ORG_PAT`, `continue-on-error: true`) and that starts the
  check. Either way the pin changes through a reviewed pull request.
- **`EXTENSION_RELOAD_MANAGER=1`** (Murbella, by Phase 3): confirm the
  shipped `extension-release` file that the
  [Phase 3 brief](#phase-3-brief-2026-10-27) proposes.
- **maild's secrets key** (Irulan, before Phase 3 builds `maild`): the
  frostmail ADR and the `v0.1.1` release that decision (b) of the
  [Phase 3 brief](#phase-3-brief-2026-10-27) needs.
- **Decisions for Brian:** make each app's GHCR package public (Phase 5a
  to 5c).

## Answered

On [core#159](https://github.com/frostyard/core/pull/159), 2026-10-23:

- **Releases to Snosi** (Lucilla, Murbella): a `build` dispatch rebuilds
  images only. A sysext's `.deb` changes only through its pin in
  `sysext-checksums.json`, which the `check-sysext-updates` job of
  `check-dependencies.yml` bumps in a pull request.
- **apt-publisher** (Lucilla): no registration. The `.deb` files stay on
  GitHub releases. `Packages=` from `debian/` is not used: it would make the
  daemons installable with apt, fail for a private repository, and still
  not rebuild the sysexts.
- **Updates to a running service** (Lucilla, Murbella): updex runs only
  `systemd-sysext refresh`, and has no hook. The supported path is a reboot:
  Snosi's `reload-sysext.service` runs `systemd-sysusers`,
  `systemd-tmpfiles` and a daemon reload after the boot merge.
  `EXTENSION_RESTART_UNITS=` needs systemd 262. Since updex v2.1.2, a
  scheduled `updex features update` run (`updex-update.service`) whose
  sources are all unreachable is a skip: it logs 1 line and exits 0, so
  an offline host does not stay `degraded`. An interactive run and every
  other failure still fail
  ([updex#472](https://github.com/frostyard/updex/pull/472),
  [updex ADR-0018](https://github.com/frostyard/updex/blob/main/docs/adr/0018-skip-an-update-run-when-every-source-is-unreachable.md)).
- **Feature dependencies** (Lucilla): none in the transfers; each app's
  documentation says to enable `lodge` first (ADR-0058). On 2026-10-23
  `RequisiteFeatures=` was parsed but not enforced
  ([updex#455](https://github.com/frostyard/updex/issues/455)). updex
  v2.1.1 and later enforce it as an AND gate in every feature path
  ([updex#469](https://github.com/frostyard/updex/pull/469),
  [updex ADR-0017](https://github.com/frostyard/updex/blob/main/docs/adr/0017-apply-the-feature-activation-rule-in-every-feature-path.md)),
  so `RequisiteFeatures=lodge` is now possible: see Later / ideas.
- **updex on plain Debian 13** (Lucilla): updex is supported there, with
  Frostyard's key as `/etc/systemd/import-pubring.gpg` and a boot-time unit
  like `reload-sysext.service`. **Snosi sysexts on plain Debian 13**
  (Murbella): they merge, but Snosi does not support or test it, and `apt`
  upgrades fail while `/usr` is a merged overlay. So the sysexts are for
  Snosi images, and lodge's host would run Floe.
- **Flatpak trust** (Lucilla): list only attested digests, fail closed
  ([flatpak-index#2](https://github.com/frostyard/flatpak-index/issues/2)).
  An OCI remote without GPG is acceptable for desktop apps in user scope
  only.
- **The pilothouse pattern and the names** (Murbella): they fit; the 5
  names are free.
- **`Upholds=`** (Murbella): uphold the socket of a socket-activated app,
  and the service too for a daemon that works without a client; ship the
  preset beside the drop-in.
- **Package-shipped units** (Murbella): the suite repositories' check is
  not enough alone; Snosi adds a build-time delta check.
- **Boot order** (Murbella): at boot, `sysusers.d` entries apply before
  `sockets.target`. At runtime nothing reruns them, and an app's socket
  needs group `lodge` from its own `sysusers.d` file when lodge's sysext is
  not enabled.
- **A private release** (Murbella): `verified_download` has no
  credentials. frostread's repository becomes public first.
- **Core Flatpaks** (Murbella): not now; Firn installs the core set from
  Flathub only.

On the Phase 3 brief ([core#169](https://github.com/frostyard/core/pull/169)),
after its merge, 2026-10-27:

- **notesd's service** (Brian): upheld with its socket
  ([ADR-0063](../adr/0063-uphold-notesds-service-as-well-as-its-socket.md)).
- **maild's secrets key** (Brian): frostmail's `.deb` makes it at first
  start; frostmail records it in an ADR and releases `v0.1.1`.

## References

- Implements: [ADR-0058](../adr/0058-ship-suite-desktop-apps-as-flatpaks-and-services-as-sysexts.md),
  [ADR-0062](../adr/0062-make-desktop-suite-apps-standalone-flatpaks-with-opt-in-lodge.md),
  [ADR-0063](../adr/0063-uphold-notesds-service-as-well-as-its-socket.md);
  lodge's [app contract](https://github.com/frostyard/lodge/blob/main/docs/specs/app-contract.md)
  (Install layout); snosi's
  [design/sysexts.md](https://github.com/frostyard/snosi/blob/main/docs/design/sysexts.md)
- Related: [ADR-0057](../adr/0057-run-first-party-apps-behind-lodge.md),
  [Plan 0009](0009-debian-publication-through-apt-publisher.md);
  lodge's [roadmap](https://github.com/frostyard/lodge/blob/main/docs/plans/0001-roadmap.md);
  frostnotes' [roadmap](https://github.com/frostyard/frostnotes/blob/main/docs/plans/0002-roadmap.md);
  frostmail's [roadmap](https://github.com/frostyard/frostmail/blob/main/docs/plans/0002-roadmap.md);
  [`frostyard/flatpak-index`](https://github.com/frostyard/flatpak-index)
