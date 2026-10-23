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
| frostread | `readd`, `readctl`, the `read` web build, `frostread.service`, `frostread.socket`, `sysusers.d` | sysext `readd` | **does not fit cleanly:** the repository is private, so snosi cannot read its release without a token |
| frostread | `readdev` | not shipped | development only |
| porter | `porterd`, the `porter` web build, `frostporter.service`, `frostporter.socket`, `sysusers.d` | sysext `porterd` | stages `/usr/local/bin` today; the host runs `/opt/lodge/bin/porterd` |

Two more facts do not fit cleanly:

- **lodge's host** is a Debian 13 virtual machine, not a Snosi image. Its
  services run from `/opt/lodge/bin` and `/usr/local/bin`, with units and
  `sysusers.d` entries in `/etc`. It has no updex and no frostyard transfer
  definitions.
- **A web app inside lodge** has no package of its own. It ships in its
  daemon's sysext, under `/usr/share/lodge/apps/<id>/`.

## Phase 0 — Agree the contract (small)

- Brian accepts or amends ADR-0058.
- Lucilla's and Murbella's answers to the [open questions](#open-questions)
  are recorded here, and each answer that changes ADR-0058 is made in it
  while it is Proposed.
- Decide lodge's host: Floe, or Debian 13 with updex (see the open
  questions).
- **Done when:** ADR-0058 is Accepted, and every open question that blocks
  Phase 3 or Phase 5 has an answer in this plan.

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
- Each repository's packaging test (lodge's `internal/packagecheck`,
  frostmail's `internal/lodge/package_test.go`, and a new one where none
  exists) checks the staged tree:
  - every path is under `/usr`;
  - no unit has `RequiredBy=` ([ADR-0030](../adr/0030-no-requiredby-enablement-in-shipped-units.md));
  - no service that a sysext upholds has a `Condition*=`
    ([snosi#1100](https://github.com/frostyard/snosi/issues/1100));
  - `systemd-analyze verify` passes on the units.
- Update lodge's app contract (Install layout), its `packaging/README.md`,
  the new-lodge-app scaffold's `stage.sh`, frostread's `specs/api.md` and
  porter's roadmap, which name the old paths.
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
    nFPM ([ADR-0011](../adr/0011-frostyard-prefixed-package-names.md));
  - attests the `.deb` with `actions/attest-build-provenance`;
  - attaches it to the GitHub release.
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
[snosi ADR-0004](https://github.com/frostyard/snosi/blob/main/docs/adr/0004-sysext-authoring-rules.md)):

- `mkosi.images/<name>/` for `lodge`, `notesd`, `maild`, `readd` and
  `porterd`: `KEYPACKAGE=frostyard-<name>`, the `.deb` through
  `verified_download` with its entry in `shared/download/sysext-checksums.json`,
  and its version check in the `check-sysext-updates` job.
- In each image: the `Upholds=` drop-in
  `multi-user.target.d/10-<name>.conf`, a preset, and `required-paths.txt`
  listing the binaries, the units, the `sysusers.d` entry, the manifest and
  the drop-in.
- In the base image: `sysupdate.<name>.d/<name>.feature` (`Enabled=false`)
  and `<name>.transfer`, matching `<name>_@v_%w_%a.raw.zst` (ADR-0007).
- Repogen publishes each under `ext/<name>/` with a signed `SHA256SUMS.gpg`
  ([ADR-0014](../adr/0014-single-gpg-trust-root.md)).
- The update path: a suite release, then Snosi's checksum bump, then a
  sysext build and publication. Per open question 1, a release can
  dispatch `build` instead of waiting for the scheduled check.
- **Done when:** `https://repository.frostyard.org/ext/index` lists the 5
  sysexts with signed checksums, and on a test VM `updex features enable
  lodge` and `updex features enable porterd`, then a reboot, give a lodge
  whose `lodgectl apps` shows `porter` up at its release version.

## Phase 4 — lodge's host runs the sysexts (medium)

- Take the rollback archive first: the binaries, units, `sysusers.d`
  entries and app bundles that are on the host now. The state in
  `/var/lib/<user>` and the configuration in `/etc` stay; no sysext touches
  them.
- Prepare the host as Phase 0 decided: Floe, or Debian 13 with updex and
  the 5 transfer and feature definitions.
- Remove the hand-installed units from `/etc/systemd/system/` and the
  `sysusers.d` entries from `/etc/sysusers.d/`, then the binaries in
  `/opt/lodge/bin` and `/usr/local/bin` and the app bundles in
  `/usr/share/lodge/` that a sysext now provides.
- Enable the features for lodge and the 4 apps, and merge.
- Coordinate with frostnotes M4 Phase 7, which retires the M2 hub on the
  same host from 2026-10-26.
- **Done when:** lodge and the 4 apps run from sysexts; no unit of theirs
  is in `/etc/systemd/system/`; `lodgectl apps` shows each app at its
  release version; and `updex features update` moves one app to a newer
  release, which runs after the update step that open question 3 settles.

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
  `latest`, `vX.Y.Z` and `sha-<commit>`, and attests it.
- Brian makes each GHCR package public, and stores
  `FLATPAK_INDEX_DISPATCH_TOKEN` if the remote should refresh at once.
- **Done when:** on Snow, `flatpak install frostyard org.frostyard.Frostmail`
  installs the app and it opens mail through lodge; `flatpak install
  frostyard org.frostyard.Frostnotes` opens a vault with its own notesd;
  and `flatpak update` moves each to a newer release.

## Phase 6 — The remote lists the apps (small)

- `frostyard/flatpak-index`: add `frostyard/frostmail` and
  `frostyard/frostnotes` to `apps.json`, and the two apps to its README.
- Apply the answer to open question 6 (attestations in the index).
- **Done when:** `flatpak remote-ls frostyard` lists both apps, with their
  names and icons from AppStream.

## Phase 7 — The records follow (small)

- lodge's roadmap: the packaging question answered, with a link to
  ADR-0058.
- frostmail: an ADR that supersedes ADR-0013's release path; the M6 line
  in its roadmap.
- frostnotes: M6 in its roadmap (no hub container image, no apt packages).
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

## Open questions

For Lucilla (flatpak-index, updex, apt-publisher), by Phase 0:

1. **Releases to Snosi.** Should a suite release dispatch `build` to Snosi
   ([ADR-0056](../adr/0056-rebuild-images-after-apt-publication.md)'s path
   for components that publish nothing through apt-publisher), or does
   Snosi's scheduled checksum check suffice?
2. **No apt publication.** The `.deb` files are build inputs on GitHub
   releases only. Does apt-publisher need any registration for them? Or
   should Snosi read them from `repository.frostyard.org/debian/` with
   `Packages=` instead?
3. **Updates to a running service.** After `updex features enable` or
   `update` and a refresh, does updex run `systemd-sysusers`,
   `systemd-tmpfiles --create` and a restart of the units that the
   refreshed sysext ships? If not, what is the supported step: a reboot, or
   an updex hook?
4. **Feature dependencies.** Can an updex feature require another (`maild`
   requires `lodge`)? If not, the app's documentation says so.
5. **updex on plain Debian 13.** Is `frostyard-updex` with transfer and
   feature files in `/etc/sysupdate.<name>.d/` a supported install on a
   host that is not a Snosi image?
6. **Flatpak trust.** Should `build-index.py` list only images with a valid
   build-provenance attestation from the app's release workflow, and fail
   closed otherwise? Is an OCI remote without GPG acceptable, or does the
   remote need another signature?

For Murbella (Snosi sysexts), by Phase 0:

1. **The pattern.** Do 5 sysexts on `pilothouse`'s pattern
   (`verified_download` of a release `.deb`, `sysext-checksums.json`,
   `check-sysext-updates`) fit Snosi, with the names `lodge`, `notesd`,
   `maild`, `readd` and `porterd`?
2. **Socket-activated apps.** Should `Upholds=` name each app's `.service`
   (which `Requires=` its socket) or its `.socket`? Is a preset file needed
   besides the drop-in?
3. **Package-shipped units.** `check-upholds-guard.sh` skips units that a
   package ships. Is a check in each suite repository enough, or should
   Snosi also check a sysext's upheld units at build time?
4. **Plain Debian 13.** Does a Snosi sysext (`BaseTrees=base`, its
   `extension-release`) merge on a plain Debian 13 host? Or must lodge's
   host run Floe?
5. **Boot order.** The app sockets use `SocketGroup=lodge`, a group from
   lodge's sysext. Do `sysusers.d` entries from merged sysexts always apply
   before sockets start?
6. **A private release.** frostread is private. Can `verified_download`
   use a token, or must frostread's repository be public first?
7. **Core flatpaks.** Should Snow's `flatpaks/snow.json` list the suite's
   Flatpaks? They come from the `frostyard` remote, not Flathub.

For Brian, by Phase 4:

- **lodge's host:** move it to Floe, or keep Debian 13 with updex.
  Recommended: Floe, unless the answer to Murbella's question 4 shows that
  Snosi sysexts merge cleanly on Debian 13.

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
