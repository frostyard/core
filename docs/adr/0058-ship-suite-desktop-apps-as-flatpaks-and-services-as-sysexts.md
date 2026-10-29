# 0058 — Ship the suite's desktop apps as Flatpaks and its services as sysexts

- **Status:** Accepted (2026-10-26)
- **Date:** 2026-10-23

## Context

frostyard's first-party suite runs behind lodge
([ADR-0057](0057-run-first-party-apps-behind-lodge.md)). It has two kinds of
artifact:

- **Desktop apps**, run by one user in a graphical session: frostmail's and
  frostnotes' Tauri apps (`org.frostyard.Frostmail`,
  `org.frostyard.Frostnotes`, [ADR-0016](0016-reverse-dns-org-frostyard-identifiers.md)).
- **Services**, run by systemd as system users on lodge's host: lodge
  itself, and the daemons of its apps, notesd (`notes`), maild (`mail`),
  readd (`read`, frostread) and porterd (`porter`). Each app ships a manifest
  and a web build under `/usr/share/lodge/apps/<id>/`, a socket unit, a
  service unit and a `sysusers.d` entry, per lodge's
  [app contract](https://github.com/frostyard/lodge/blob/main/docs/specs/app-contract.md).

None of them has a release artifact:

- No suite repository has a release tag, a `.deb` or a published Flatpak.
- frostmail's app installs as a local Flatpak bundle that wraps a binary
  built outside the Flatpak SDK
  ([frostmail ADR-0013](https://github.com/frostyard/frostmail/blob/main/docs/adr/0013-app-as-a-local-flatpak.md)).
- lodge ships a tarball and `packaging/install.sh`. Its roadmap left
  "debs through apt-publisher, or a sysext" open.
- frostnotes' roadmap (M6) names a container image for the hub and
  frostyard apt packages.
- The apps' `stage.sh` scripts stage maild, mailctl, readd, readctl and
  porterd in `/usr/local/bin`. notesd's unit and lodge's `install.sh` use
  `/usr/bin`. On lodge's host the services run from `/opt/lodge/bin` and
  `/usr/local/bin`, with units in `/etc/systemd/system/`, so a staged tree
  does not match the host.

The constraints:

- frostyard's images are image-based. Snosi bind-mounts `/var/usrlocal` over
  `/usr/local` and `/var/opt` over `/opt`, so a sysext payload there is
  shadowed at runtime. Snosi builds sysexts as `/usr`-only overlays and
  starts their services with `Upholds=`
  ([snosi ADR-0004](https://github.com/frostyard/snosi/blob/main/docs/adr/0004-sysext-authoring-rules.md)).
- Sysexts already have a filename pattern
  ([ADR-0007](0007-frostyard-sysext-filename-pattern.md)), a distribution
  and update contract ([ADR-0008](0008-sysext-distribution-and-update-contract.md)),
  a signing key ([ADR-0014](0014-single-gpg-trust-root.md)) and an exhaustive
  index ([ADR-0032](0032-incremental-sysext-indexes-are-exhaustive.md)).
  Snosi builds them, Repogen publishes them, and updex installs them.
- frostyard has a Flatpak remote, `frostyard/flatpak-index`: apps push OCI
  images to GHCR, and the repository publishes the catalogue on GitHub Pages.
- An upheld unit with an unmet `Condition*=` is retried forever
  ([snosi#1100](https://github.com/frostyard/snosi/issues/1100)). Snosi's
  `check-upholds-guard.sh` checks only units defined in snosi, not units a
  package ships.
- Shipped units never use `RequiredBy=`
  ([ADR-0030](0030-no-requiredby-enablement-in-shipped-units.md)).

## Decision

**Desktop apps are Flatpaks. Services are sysexts.** Every suite artifact is
one or the other, or is not shipped.

### What goes where

| Artifact | Ships as | Name |
| --- | --- | --- |
| frostmail's app | Flatpak | `org.frostyard.Frostmail` |
| frostnotes' app, with its own notesd and `notesctl` inside | Flatpak | `org.frostyard.Frostnotes` |
| lodge and lodgectl, the shell's bundle, units, `sysusers.d` and `tmpfiles.d` | sysext | `lodge` |
| notesd and notesctl, as lodge's `notes` app | sysext | `notesd` |
| maild and mailctl, as lodge's `mail` app | sysext | `maild` |
| readd and readctl, as lodge's `read` app | sysext | `readd` |
| porterd, as lodge's `porter` app | sysext | `porterd` |

- **An app's web build ships in its daemon's sysext,** under
  `/usr/share/lodge/apps/<id>/`. It has no artifact of its own. The sysext
  makes those files read-only and owned by root, as the app contract
  requires.
- **A CLI ships with its daemon:** in the sysext on lodge's host; inside the
  Flatpak on a desktop, run as `flatpak run --command=<cli> <app-id>`.
- **frostnotes' desktop notesd is part of its Flatpak.** The desktop app
  stays local-first against its own notesd
  ([frostnotes ADR-0026](https://github.com/frostyard/frostnotes/blob/main/docs/adr/0026-notesd-runs-as-a-lodge-app.md)),
  and the Flatpak starts it.
- **Not shipped:** a maild for a Linux desktop outside the owner's tailnet;
  the development tools (`readdev`, `lodgeprobe`, `dev/fakeapp`); the
  libraries `lodge/kit`, `@frostyard/lodge-client` and `@frostyard/lodge-ui`,
  which stay git tags. frostmail's Windows install is outside this decision.
  *Amended: a desktop maild now ships inside frostmail's Flatpak
  ([ADR-0062](0062-make-desktop-suite-apps-standalone-flatpaks-with-opt-in-lodge.md);
  frostmail [ADR-0046](https://github.com/frostyard/frostmail/blob/main/docs/adr/0046-the-desktop-flatpak-carries-its-own-maild.md)).*

### Sysexts

- **Sysexts are for Snosi images.** A server that runs the suite's sysexts
  runs Floe. A Snosi sysext is built as a delta over Snosi's base image, and
  only Snosi images test and boot it.
- **One sysext per service.** Its name is the daemon's name, as in the
  table. Each is built from one `.deb`, `frostyard-<name>`
  ([ADR-0011](0011-frostyard-prefixed-package-names.md)), which is its
  `KEYPACKAGE`.
- **The `.deb` is a build input, not a published package.** Each service
  repository's release attaches `frostyard-<name>_<version>_amd64.deb`, with
  a build-provenance attestation, to its GitHub release. Snosi downloads it
  with `verified_download` and a SHA-256 pinned in
  `shared/download/sysext-checksums.json`, as it does for
  `frostyard-pilothouse`. The `.deb` is not registered with apt-publisher
  and not published to `repository.frostyard.org/debian/`.
- **The `.deb`'s contents.** It installs only under `/usr`, except an `/etc`
  file that a `tmpfiles.d` `C` rule restores from `/usr/share/factory/etc/`.
  Snosi's base image satisfies its `Depends:`.
- **Versions** come from svu tags (`vX.Y.Z`,
  [ADR-0012](0012-svu-versioning-and-rolling-dev-prerelease.md)). The tag
  gives the `.deb` version, the `version` in each `app.json`, and, through
  `KEYPACKAGE`, the sysext version. Files are named
  `<name>_<version>_13_x86-64.raw.zst` (ADR-0007).
- **A release reaches Snosi through its checksum pin.** The
  `check-sysext-updates` job of Snosi's `check-dependencies.yml` finds the
  new release and opens a checksum pull request; its merge builds and
  publishes the sysext. A `build` dispatch
  ([ADR-0056](0056-rebuild-images-after-apt-publication.md)) rebuilds
  images only, so a suite release does not send one.
- **Distribution** follows ADR-0008: Snosi builds the images, Repogen
  publishes them under `ext/<name>/` with a signed `SHA256SUMS.gpg`, and
  updex installs them. Each sysext is an updex feature, shipped disabled,
  with its transfer file in the base image.
- **Payloads are `/usr` only.** Binaries are in `/usr/bin`; units in
  `/usr/lib/systemd/system/`; `sysusers.d` and `tmpfiles.d` entries in
  `/usr/lib/`; lodge's example configuration in
  `/usr/share/lodge/config.example.json`. The configuration in `/etc`
  (`/etc/lodge/`, `/etc/porter/`, `/etc/frostread/`) belongs to the host's
  administrator, and no sysext ships it.
- **Units start with `Upholds=`,** from a drop-in
  `/usr/lib/systemd/system/multi-user.target.d/10-<name>.conf`, and a
  preset `40-<name>.preset` that enables the same units, as Snosi's service
  sysexts do (snosi ADR-0004):

  | Sysext | Upheld |
  | --- | --- |
  | `lodge` | `lodge.service` |
  | `notesd` | `frostnotes-lodge.socket` |
  | `maild` | `frostmail.socket`, `frostmail.service` |
  | `readd` | `frostread.socket`, `frostread.service` |
  | `porterd` | `frostporter.socket`, `frostporter.service` |

  An app's socket is upheld, so the socket owns its path and group and
  starts the service on demand. The service is upheld too when the daemon
  works without a client: maild's rules and send-later, readd's feed
  poller and porterd's routines.
- **Socket units keep their default dependencies,** so they start after
  `sysinit.target`, when the `sysusers.d` entries of every merged sysext
  have applied.
- **An upheld unit has no `Condition*=`** unless it is a
  `RemainAfterExit=yes` oneshot ([snosi#1100](https://github.com/frostyard/snosi/issues/1100)),
  and **no shipped unit uses `RequiredBy=`** (ADR-0030). Each service
  repository's tests check both, and Snosi checks the upheld units in each
  sysext's delta at build time, the units its `.deb` ships included.
- **Each app's sysext declares the groups it uses.** Its own `sysusers.d`
  file (`/usr/lib/sysusers.d/<name>.conf`, never a path that another
  sysext ships) carries `g lodge -` and the `lodge-apps` and
  `lodge-agents` memberships it needs, so its socket starts without lodge's
  sysext. lodge's sysext creates the same groups for lodge.
- **lodge comes first.** An app is reachable only through lodge, and updex
  features have no dependencies, so each app's documentation says to
  enable `lodge` first. Transfers do not use `RequisiteFeatures=` while
  updex does not enforce it
  ([updex#455](https://github.com/frostyard/updex/issues/455)).
- **Updates take effect at the next boot.** At boot Snosi merges the
  sysexts, then runs `systemd-sysusers`, `systemd-tmpfiles --create` and a
  daemon reload, and `Upholds=` starts the units. To update without a
  reboot, the administrator runs the same 3 steps and restarts the units.
  Each sysext's `extension-release` sets `EXTENSION_RELOAD_MANAGER=1`, so a
  refresh reloads the unit files.

### Flatpaks

- **Built in CI inside the Flatpak SDK** with `flatpak-builder`, from
  vendored crates and an offline pnpm store, on the GNOME runtime. The local
  bundle of frostmail ADR-0013 stays a development path.
- **Published through `frostyard/flatpak-index`:** a release pushes the OCI
  image to `ghcr.io/frostyard/<repo>`, public, tagged `latest`, `vX.Y.Z` and
  `sha-<commit>`, and attests the image digest
  (`attest-build-provenance` with `subject-digest`). The app is listed in
  `apps.json`.
- **The catalogue lists only attested digests.** flatpak-index lists a
  digest only when `gh attestation verify` passes for it, signed by the
  app's release workflow on a tag. If one app fails, the catalogue is not
  deployed, and the last verified catalogue stays live.
- **Updates** are `flatpak update` from the `frostyard` remote, which serves
  `latest`.
- **Trust** comes from HTTPS to the catalogue and GHCR, from the digests
  the catalogue lists, and from the attestation check at index time. An OCI
  remote has no GPG signature. That is acceptable for desktop apps in user
  scope only: nothing that runs as root or ships a system service is a
  Flatpak.
- Each Flatpak ships AppStream metadata and icons, and asks for portals
  rather than broad file-system access where a portal exists.
- Snosi's images do not preinstall the suite's Flatpaks. Their core set
  installs from Flathub only.

This supersedes, in part, frostmail
[ADR-0013](https://github.com/frostyard/frostmail/blob/main/docs/adr/0013-app-as-a-local-flatpak.md)
(how the app is built and installed for release). It replaces the
`/usr/local/bin` and `/opt/lodge/bin` paths that the apps' `stage.sh`
scripts, lodge's `install.sh` and the host use. It answers lodge's open
packaging question and replaces frostnotes M6's container image and apt
packages.

## Consequences

- Each service repository needs a release pipeline: svu tags, a `.deb`
  built from its staged tree, and an attestation. Each desktop app needs a
  `flatpak-builder` manifest with offline sources.
- A service release reaches a host through Snosi: a checksum pull request,
  a sysext build, a Repogen publication and a reboot. The weekly check sets
  the pace unless the check is run by hand or by a release's trigger.
- Snosi gains 5 sysexts, 5 features and 5 transfer files to maintain, and
  a build-time check of upheld units in each sysext's delta.
- An upheld unit restarts when it stops. To stop a service for longer, an
  administrator disables its feature or masks the unit.
- Between an update and the next boot, the running daemon keeps its old
  binary. A first enable without a reboot needs `systemd-sysusers` and
  `systemd-tmpfiles` by hand, or the app's socket fails on its group.
- Binaries move from `/usr/local/bin` and `/opt/lodge/bin` to `/usr/bin`.
- lodge's host, a Debian 13 virtual machine, uses the sysexts only after a
  fresh install of Floe; there is no conversion in place. lodge's and the
  apps' state in `/var/lib/` and their configuration in `/etc/` are carried
  across. Until then the host keeps its hand-installed services. On Floe,
  no hand-installed unit in `/etc/systemd/system/` overrides a sysext's
  unit.
- A plain Debian host is not supported for the sysexts: there, `/usr` is
  read-only while a sysext is merged, so `apt` upgrades fail, and the host
  lacks what Snosi's base image provides.
- A sysext's release must be public: `verified_download` has no
  credentials, and the sysext publishes the binaries on
  `repository.frostyard.org` in any case. frostread's repository, which is
  private, is made public before its sysext is built.
- Flatpaks carry a weaker trust story than sysexts: no GPG, and the
  attestation is checked once, at index time, not by the client.
- frostnotes' desktop sync runs only while its Flatpak runs notesd, unless
  the app asks the Background portal to start at login.
- Desktop users who want `notesctl` or `mailctl` in a shell use
  `flatpak run --command=`. No CLI is on the desktop `PATH`.

## Alternatives considered

- **Debian packages through apt-publisher for everything:** rejected.
  Image-based hosts install no packages at runtime, and the apps would need
  a second path for them. If a plain Debian host needs the services later,
  the same `.deb` files can be registered with apt-publisher then.
- **The sysexts on plain Debian 13, with updex:** rejected.
  Snosi does not test its sysexts there, `apt` cannot upgrade a host whose
  `/usr` is a merged overlay, and the host would need its own keyring and
  boot-time setup.
- **One sysext for the whole suite:** rejected. A sysext's version comes
  from one `KEYPACKAGE` (ADR-0007), and the apps release on their own.
- **Sysexts built in each app's repository:** rejected. Snosi holds the
  sysext build guards, and Repogen and the signing key publish them.
- **Container images for the services:** rejected. The app contract needs
  a system user per app, `SO_PEERCRED` on Unix sockets, and web files owned
  by root under `/usr/share/lodge/`; containers add a layer between each of
  those and the host.
- **Sysexts for the desktop apps:** rejected. A Flatpak runs on any
  distribution, in a sandbox, and updates without a reboot or an image
  build. Snow's core desktop apps are Flatpaks already.

## References

- Shapes: [Plan 0010](../plans/0010-suite-packaging.md); lodge's
  [app contract](https://github.com/frostyard/lodge/blob/main/docs/specs/app-contract.md)
  (Install layout) and
  [roadmap](https://github.com/frostyard/lodge/blob/main/docs/plans/0001-roadmap.md);
  frostnotes' [roadmap](https://github.com/frostyard/frostnotes/blob/main/docs/plans/0002-roadmap.md)
  (M6); frostmail's [roadmap](https://github.com/frostyard/frostmail/blob/main/docs/plans/0002-roadmap.md)
  (M6)
- Builds on: [ADR-0007](0007-frostyard-sysext-filename-pattern.md),
  [ADR-0008](0008-sysext-distribution-and-update-contract.md),
  [ADR-0011](0011-frostyard-prefixed-package-names.md),
  [ADR-0012](0012-svu-versioning-and-rolling-dev-prerelease.md),
  [ADR-0014](0014-single-gpg-trust-root.md),
  [ADR-0016](0016-reverse-dns-org-frostyard-identifiers.md),
  [ADR-0030](0030-no-requiredby-enablement-in-shipped-units.md),
  [ADR-0032](0032-incremental-sysext-indexes-are-exhaustive.md),
  [ADR-0057](0057-run-first-party-apps-behind-lodge.md)
- Snosi: [ADR-0004](https://github.com/frostyard/snosi/blob/main/docs/adr/0004-sysext-authoring-rules.md),
  [design/sysexts.md](https://github.com/frostyard/snosi/blob/main/docs/design/sysexts.md),
  [`check-upholds-guard.sh`](https://github.com/frostyard/snosi/blob/main/check-upholds-guard.sh)
- Flatpak remote: [`frostyard/flatpak-index`](https://github.com/frostyard/flatpak-index)
- Related: [ADR-0056](0056-rebuild-images-after-apt-publication.md);
  [snosi#1100](https://github.com/frostyard/snosi/issues/1100),
  [updex#455](https://github.com/frostyard/updex/issues/455),
  [flatpak-index#2](https://github.com/frostyard/flatpak-index/issues/2)
- Amended in part by: [ADR-0062](0062-make-desktop-suite-apps-standalone-flatpaks-with-opt-in-lodge.md)
  (the desktop side: each app is a standalone Flatpak with its daemon)
- Amended in part by: [ADR-0063](0063-uphold-notesds-service-as-well-as-its-socket.md)
  (the `notesd` row: its service is upheld too)
- Amended in part, on frostmail's side, by: frostmail
  [ADR-0046](https://github.com/frostyard/frostmail/blob/main/docs/adr/0046-the-desktop-flatpak-carries-its-own-maild.md)
  (Accepted 2026-10-28: maild and `mailctl` ship inside frostmail's Flatpak,
  as ADR-0062 decides)
- Supersedes in part: frostmail
  [ADR-0013](https://github.com/frostyard/frostmail/blob/main/docs/adr/0013-app-as-a-local-flatpak.md)
  (the release build and install of the app)
