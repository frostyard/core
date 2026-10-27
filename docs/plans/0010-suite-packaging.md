# Plan: Suite packaging — Flatpaks and sysexts

This plan ships frostyard's suite as
[ADR-0058](../adr/0058-ship-suite-desktop-apps-as-flatpaks-and-services-as-sysexts.md)
decides: frostmail's and frostnotes' desktop apps as Flatpaks from
`frostyard/flatpak-index`, and lodge and its app daemons as sysexts that
Snosi builds, Repogen publishes and updex installs. It builds on lodge's
platform ([ADR-0057](../adr/0057-run-first-party-apps-behind-lodge.md)) and
on the sysext contract ([ADR-0007](../adr/0007-frostyard-sysext-filename-pattern.md),
[ADR-0008](../adr/0008-sysext-distribution-and-update-contract.md)). It
answers lodge's open packaging question and replaces frostnotes' and
frostmail's M6 packaging lines. The Flatpak track (Phases 5 and 6) does not
depend on the sysext track (Phases 1 to 4); they can run side by side.

## Inventory

Every artifact of the five suite repositories, and its side.

| Repository | Artifact | Side | Notes |
| --- | --- | --- | --- |
| lodge | `lodge`, `lodgectl`, the shell's bundle, `lodge.service`, `sysusers.d`, `tmpfiles.d`, the example configuration | sysext `lodge` | the example moves from `/etc/lodge/` to `/usr/share/lodge/` |
| lodge | `kit/`, `client/`, `ui/` | not shipped | libraries, pinned by git tag |
| lodge | `dev/fakeapp`, the `e2e` build | not shipped | development only |
| frostnotes | `notesd -lodge`, `notesctl`, the `notes` web build, `frostnotes.service`, `frostnotes-lodge.socket`, `sysusers.d` | sysext `notesd` | already stages `/usr/bin` |
| frostnotes | the Tauri app | Flatpak `org.frostyard.Frostnotes` | **does not fit cleanly:** it needs its own notesd, which ships inside the Flatpak |
| frostnotes | `notesctl` on a desktop (`notesctl mcp` for an agent, `notesctl sync`) | inside the Flatpak | **does not fit cleanly:** run with `flatpak run --command=notesctl` |
| frostnotes | the M2 hub (`notesd -hub`, user `notes`) | not shipped | retired by frostnotes M4 Phase 7 |
| frostmail | `maild --lodge`, `mailctl`, the `mail` web build, `frostmail.service`, `frostmail.socket`, `sysusers.d` | sysext `maild` | stages `/usr/local/bin` today |
| frostmail | the Tauri app | Flatpak `org.frostyard.Frostmail` | a lodge client on the tailnet ([frostmail ADR-0041](https://github.com/frostyard/frostmail/blob/main/docs/adr/0041-maild-runs-as-a-lodge-app.md)) |
| frostmail | a local maild on a Linux desktop, with `maild.service` (user) and `mailctl` | not shipped | **does not fit cleanly:** a desktop daemon outside lodge; development only until a later decision |
| frostmail | the Windows install | not in this plan | frostmail M7 |
| frostmail | `tools/lodgeprobe` | not shipped | development only |
| frostread | `readd`, `readctl`, the `read` web build, `frostread.service`, `frostread.socket`, `sysusers.d` | sysext `readd` | **does not fit cleanly:** the repository is private, and Snosi's `verified_download` has no credentials, so it becomes public before Phase 3 builds `readd` |
| frostread | `readdev` | not shipped | development only |
| porter | `porterd`, the `porter` web build, `frostporter.service`, `frostporter.socket`, `sysusers.d` | sysext `porterd` | stages `/usr/local/bin` today; the host runs `/opt/lodge/bin/porterd` |

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
  with the units in ADR-0058's table.
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
and Snosi's `main`. Two points need a decision before Snosi builds
`notesd` and `maild`; the other 3 sysexts can be built now.

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

- *A1 — uphold both,* `frostnotes-lodge.socket` and `frostnotes.service`.
  The vault work runs from boot, whether lodge is enabled or not. A new
  ADR amends ADR-0058's table (one row), as ADR-0061 amends ADR-0059.
- *A2 — keep the socket only,* as ADR-0058 has it. notesd starts only on
  the first connection: lodge's poll makes one within 15 s of lodge's
  start. Once started, notesd stays up, also if lodge stops later. Without
  lodge, or before its first poll, the vault work does not run. No record
  changes.

**Recommendation: A1.** It meets ADR-0058's own rule ("the service is
upheld too when the daemon works without a client"), costs one line, and
does not make notesd's housekeeping depend on another sysext.

**(b) maild: the secrets key before the service.** `frostmail.service` has
`LoadCredentialEncrypted=frostmail-secrets-key:/etc/credstore.encrypted/frostmail-secrets-key`.
Until root makes that file, systemd fails the unit before maild runs, and
maild refuses a key that does not open `secrets.sealed`
([frostmail ADR-0044](https://github.com/frostyard/frostmail/blob/main/docs/adr/0044-seal-the-servers-secrets-with-a-systemd-credential.md)).
maild works without a client (IMAP IDLE, rules, send-later, reminders), so
ADR-0058 upholds the service. With no key, maild then fails every 2 s
until the key exists. With only the socket upheld, lodge's first poll
starts the same loop through `Restart=on-failure`.

- *B1 — make the key at first start.* frostmail's `.deb` ships a oneshot
  `frostmail-secrets-key.service` with
  `ConditionPathExists=!/etc/credstore.encrypted/frostmail-secrets-key`
  that seals 32 random bytes with `systemd-creds encrypt --with-key=auto`,
  as `scripts/seal-mail-secrets.sh --apply` already does.
  `frostmail.service` gets `Requires=` and `After=` on it. The oneshot is
  pulled, not upheld, so its condition is a clean skip. The table stays.
  Needs a frostmail ADR that amends ADR-0044 (the key is made on the host
  at first start, not by hand) and a `v0.1.1` release; `maild` then builds
  from `v0.1.1`.
- *B2 — uphold a setup oneshot.* Snosi's `maild` sysext upholds
  `frostmail-sysext-setup.service` (`Type=oneshot`, `RemainAfterExit=yes`,
  no condition, `Wants=frostmail.socket frostmail.service`), the pattern of
  `k3s` and `himmelblau`, and ships drop-ins that give the socket and the
  service `ConditionPathExists=/etc/credstore.encrypted/frostmail-secrets-key`.
  Without the key, neither starts, and lodge shows mail down. After root
  makes the key, `systemctl start frostmail.socket` or a reboot starts it.
  No frostmail release; ADR-0058's table changes for `maild`.
- *B3 — keep the table, document the order.* Uphold both units as ADR-0058
  has it; the operations doc says to make the key before `updex features
  enable maild`. Without the key, the journal gets about 53 lines a minute;
  when root makes the key, the next retry starts maild, with no reboot. A
  drop-in with `RestartSec=30s` cuts the noise to about 12 lines a minute.

**Recommendation: B1.** The sysext works with no hand step, nothing loops
on a fresh host, and the unit contract stays in frostmail, where it also
serves the hand-installed host. A restored `secrets.sealed` under another
host's key still fails, as ADR-0044 records; the operations doc covers that
case.

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
| `notesd` | `frostyard/frostnotes` | [`frostyard-notesd_0.1.0_amd64.deb`](https://github.com/frostyard/frostnotes/releases/download/v0.1.0/frostyard-notesd_0.1.0_amd64.deb) | `5d064b6295ffae653ad034a01d8c8caf7d21e47217a5f68396a95a09af0f3685` | `frostnotes-lodge.socket`; with A1 also `frostnotes.service` | `frostnotes.conf`: user `frostnotes`, `g lodge`, in `lodge-apps` | none (`StateDirectory=`, `RuntimeDirectory=`) |
| `maild` | `frostyard/frostmail` | [`frostyard-maild_0.1.0_amd64.deb`](https://github.com/frostyard/frostmail/releases/download/v0.1.0/frostyard-maild_0.1.0_amd64.deb) | `edb2af7fc74b677865fa2dea2fe86ae8e324e1770186df43152fa67078675968` | per (b): B1 and B3 `frostmail.socket`, `frostmail.service`; B2 only `frostmail-sysext-setup.service` (the socket and the service carry the condition and are never upheld) | `frostmail.conf`: user `frostmail`, `g lodge`, in `lodge-apps` | none |
| `readd` | `frostyard/frostread` | [`frostyard-readd_0.1.0_amd64.deb`](https://github.com/frostyard/frostread/releases/download/v0.1.0/frostyard-readd_0.1.0_amd64.deb) | `d879d6fd345ff374d63562cb9080f5075c669574e75e1bf4d8411ead88e1beff` | `frostread.socket`, `frostread.service` | `frostread.conf`: user `frostread`, `g lodge`, in `lodge-apps`, `lodge-agents` | none |
| `porterd` | `frostyard/porter` | [`frostyard-porterd_0.1.0_amd64.deb`](https://github.com/frostyard/porter/releases/download/v0.1.0/frostyard-porterd_0.1.0_amd64.deb) | `f541a649275b767e644eaf58bc476b01adc7261cd6bbbf8afc2f317ae274acd7` | `frostporter.socket`, `frostporter.service` | `frostporter.conf`: user `frostporter`, `g lodge`, in `lodge-apps`, `lodge-agents` | none |

Each SHA-256 matches the release asset's `digest` and a download on
2026-10-27, and goes in `sysext-checksums.json`. No upheld unit in the 5
`.deb` files has a `Condition*=`, so `sysext-upholds-guard` passes them.
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

## Phase 5 — The Flatpaks (large)

In frostmail and frostnotes:

- A `flatpak-builder` manifest, `org.frostyard.Frostmail.json` and
  `org.frostyard.Frostnotes.json`, on `org.gnome.Platform//51`, with
  vendored crates (`flatpak-cargo-generator`) and an offline pnpm store.
  The build runs in CI and needs no host tools.
- AppStream metadata (`/app/share/metainfo/<id>.metainfo.xml`) and icons.
- Permissions: frostmail as frostmail ADR-0041 has it (`--share=network`,
  the portals for notifications, OpenURI and files; the file chooser
  portal instead of read-only home access). frostnotes: notesd inside the
  Flatpak, file-system access to the vaults' folders, and the Background
  portal for sync at login.
- A CI job builds and tests the Flatpak on every pull request, as Igloo's
  workflow does. A `v*` tag pushes the OCI image to
  `ghcr.io/frostyard/frostmail` and `ghcr.io/frostyard/frostnotes`, tagged
  `latest`, `vX.Y.Z` and `sha-<commit>`, and attests the image digest
  (`attest-build-provenance` with `subject-digest`).
- Brian makes each GHCR package public, and stores
  `FLATPAK_INDEX_DISPATCH_TOKEN` if the remote should refresh at once.
- **Done when:** on Snow, `flatpak install frostyard org.frostyard.Frostmail`
  installs the app and it opens mail through lodge; `flatpak install
  frostyard org.frostyard.Frostnotes` opens a vault with its own notesd;
  and `flatpak update` moves each to a newer release.

## Phase 6 — The remote lists the apps (small)

- First, `frostyard/flatpak-index` lists only attested digests and fails
  closed, and its `publish.yml` actions are SHA-pinned
  ([flatpak-index#2](https://github.com/frostyard/flatpak-index/issues/2)).
- Then add `frostyard/frostmail` and `frostyard/frostnotes` to `apps.json`,
  and the two apps to its README.
- **Done when:** `flatpak remote-ls frostyard` lists both apps, with their
  names and icons from AppStream, and a test image without an attestation
  stops the catalogue's deployment.

## Phase 7 — The records follow (small)

- lodge's roadmap: the packaging question answered, with a link to
  ADR-0058.
- frostmail: an ADR that supersedes ADR-0013's release path; the M6 line
  in its roadmap.
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
- A Flatpak or a sysext for a Linux maild outside the owner's tailnet.
- `EXTENSION_RESTART_UNITS=` in each sysext, when Snosi's systemd is 262 or
  newer, so a refresh restarts the daemons without a reboot.
- `RequisiteFeatures=lodge` on each app's transfer, after
  [updex#455](https://github.com/frostyard/updex/issues/455) is fixed.
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
- **notesd's service** and **maild's secrets key** (Brian, before Phase 3
  builds `notesd` and `maild`): points (a) and (b) of the
  [Phase 3 brief](#phase-3-brief-2026-10-27).
- **Decisions for Brian:** make the 2 GHCR packages public (Phase 5).

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
  `EXTENSION_RESTART_UNITS=` needs systemd 262.
- **Feature dependencies** (Lucilla): none. `RequisiteFeatures=` is parsed
  but not enforced
  ([updex#455](https://github.com/frostyard/updex/issues/455)).
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

## References

- Implements: [ADR-0058](../adr/0058-ship-suite-desktop-apps-as-flatpaks-and-services-as-sysexts.md);
  lodge's [app contract](https://github.com/frostyard/lodge/blob/main/docs/specs/app-contract.md)
  (Install layout); snosi's
  [design/sysexts.md](https://github.com/frostyard/snosi/blob/main/docs/design/sysexts.md)
- Related: [ADR-0057](../adr/0057-run-first-party-apps-behind-lodge.md),
  [Plan 0009](0009-debian-publication-through-apt-publisher.md);
  lodge's [roadmap](https://github.com/frostyard/lodge/blob/main/docs/plans/0001-roadmap.md);
  frostnotes' [roadmap](https://github.com/frostyard/frostnotes/blob/main/docs/plans/0002-roadmap.md);
  frostmail's [roadmap](https://github.com/frostyard/frostmail/blob/main/docs/plans/0002-roadmap.md);
  [`frostyard/flatpak-index`](https://github.com/frostyard/flatpak-index)
