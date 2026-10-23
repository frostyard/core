# 0058 — Ship the suite's desktop apps as Flatpaks and its services as sysexts

- **Status:** Proposed
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

### Sysexts

- **One sysext per service.** Its name is the daemon's name, as in the
  table. Each is built from one `.deb`, `frostyard-<name>`
  ([ADR-0011](0011-frostyard-prefixed-package-names.md)), which is its
  `KEYPACKAGE`.
- **The `.deb` is a build input, not a published package.** Each service
  repository's release attaches `frostyard-<name>_<version>_amd64.deb`, with
  a build-provenance attestation, to its GitHub release. Snosi downloads it
  with a pinned checksum, as it does for `frostyard-pilothouse`. The `.deb`
  is not published to `repository.frostyard.org/debian/`.
- **Versions** come from svu tags (`vX.Y.Z`,
  [ADR-0012](0012-svu-versioning-and-rolling-dev-prerelease.md)). The tag
  gives the `.deb` version, the `version` in each `app.json`, and, through
  `KEYPACKAGE`, the sysext version. Files are named
  `<name>_<version>_13_x86-64.raw.zst` (ADR-0007).
- **Distribution** follows ADR-0008: Snosi builds the images, Repogen
  publishes them under `ext/<name>/` with a signed `SHA256SUMS.gpg`, and
  updex installs them. Each sysext is an updex feature, shipped disabled,
  with its transfer file.
- **Payloads are `/usr` only.** Binaries are in `/usr/bin`; units in
  `/usr/lib/systemd/system/`; `sysusers.d` and `tmpfiles.d` entries in
  `/usr/lib/`; lodge's example configuration in
  `/usr/share/lodge/config.example.json`. The configuration in `/etc`
  (`/etc/lodge/`, `/etc/porter/`, `/etc/frostread/`) belongs to the host's
  administrator, and no sysext ships it.
- **A service starts with `Upholds=`,** from a drop-in
  `/usr/lib/systemd/system/multi-user.target.d/10-<name>.conf`, as snosi's
  service sysexts do (snosi ADR-0004). An app's socket starts with its
  service, through the service's `Requires=`.
- **An upheld unit has no `Condition*=`** unless it is a
  `RemainAfterExit=yes` oneshot, and **no shipped unit uses `RequiredBy=`**
  (ADR-0030). Each service repository's own tests check both, because
  snosi's guard does not read units a package ships.
- **An app's sysext needs lodge's:** lodge's sysext creates the groups
  `lodge`, `lodge-apps` and `lodge-agents`, and `/run/lodge/apps`.

### Flatpaks

- **Built in CI inside the Flatpak SDK** with `flatpak-builder`, from
  vendored crates and an offline pnpm store, on the GNOME runtime. The local
  bundle of frostmail ADR-0013 stays a development path.
- **Published through `frostyard/flatpak-index`:** a release pushes the OCI
  image to `ghcr.io/frostyard/<repo>`, public, tagged `latest`, `vX.Y.Z` and
  `sha-<commit>`, with a build-provenance attestation. The app is listed in
  `apps.json`.
- **Updates** are `flatpak update` from the `frostyard` remote, which serves
  `latest`.
- **Trust** comes from HTTPS to the catalogue and GHCR, and from the image
  digests the catalogue lists. An OCI remote has no GPG signature.
- Each Flatpak ships AppStream metadata and icons, and asks for portals
  rather than broad file-system access where a portal exists.

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
- A service release reaches a host through snosi: a checksum bump, a sysext
  build and a Repogen publication. A fix is not live until snosi rebuilds.
- Snosi gains 5 sysexts, 5 features and 5 transfer files to maintain.
- An upheld service restarts when it stops. To stop a service for longer, an
  administrator disables its feature or masks the unit.
- On a live update, the running daemon keeps its old binary until it
  restarts. On first enable, the `sysusers.d` and `tmpfiles.d` entries apply
  at the next boot unless something runs them.
- Binaries move from `/usr/local/bin` and `/opt/lodge/bin` to `/usr/bin`.
  lodge's host needs `systemd-sysext`, updex and frostyard's transfer
  definitions. Its hand-installed units in `/etc/systemd/system/` override
  the sysexts' units, and its migration removes them.
- A private repository's release is not readable by snosi's build without a
  token. frostread is private.
- Flatpaks carry a weaker signature story than sysexts: no GPG, only HTTPS,
  digests and attestations that a client does not check.
- frostnotes' desktop sync runs only while its Flatpak runs notesd, unless
  the app asks the Background portal to start at login.
- Desktop users who want `notesctl` or `mailctl` in a shell use
  `flatpak run --command=`. No CLI is on the desktop `PATH`.

## Alternatives considered

- **Debian packages through apt-publisher for everything:** rejected.
  Image-based hosts install no packages at runtime, and the apps would need
  a second path for them.
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
- Supersedes in part: frostmail
  [ADR-0013](https://github.com/frostyard/frostmail/blob/main/docs/adr/0013-app-as-a-local-flatpak.md)
  (the release build and install of the app)
