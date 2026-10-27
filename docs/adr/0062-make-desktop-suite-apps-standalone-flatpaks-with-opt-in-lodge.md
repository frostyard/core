# 0062 — Make each desktop suite app a standalone Flatpak, with lodge as an opt-in mode

- **Status:** Proposed
- **Date:** 2026-10-27

## Context

[ADR-0058](0058-ship-suite-desktop-apps-as-flatpaks-and-services-as-sysexts.md)
ships the suite's desktop apps as Flatpaks and its services as sysexts. On
the desktop side it treats the apps differently:

- frostnotes' Flatpak carries its own notesd and `notesctl`.
- frostmail's Flatpak carries only the UI. A maild for a Linux desktop
  outside the owner's tailnet is "not shipped", so the app needs a maild on
  the host or behind lodge.
- frostread and Porter have no desktop artifact. Each is a lodge app only.

[ADR-0057](0057-run-first-party-apps-behind-lodge.md) keeps the apps' local
modes, and names frostmail's local maild for installs outside the owner's
tailnet.

The suite's repositories are at these points on 2026-10-27:

- **frostnotes.** The Flatpak `org.frostyard.Frostnotes` builds in CI with
  the UI, notesd and `notesctl`. notesd runs in its own sandbox of the same
  app, once per data directory, and the Background portal starts it at
  login. A real Snow desktop passed the startup, background-sync and
  login tests
  ([frostnotes ADR-0031](https://github.com/frostyard/frostnotes/blob/main/docs/adr/0031-the-desktop-app-ships-as-a-flatpak-with-its-own-notesd.md)).
  Its OCI image is not published, and `flatpak-index` does not list it.
  A device notesd syncs with the notesd behind lodge through lodge's
  `/device/notes/` routes
  ([frostnotes ADR-0026](https://github.com/frostyard/frostnotes/blob/main/docs/adr/0026-notesd-runs-as-a-lodge-app.md)).
- **frostmail.** The Flatpak `org.frostyard.Frostmail` builds in CI with
  the Tauri app only: no Go module, no maild and no `mailctl`
  ([frostmail ADR-0045](https://github.com/frostyard/frostmail/blob/main/docs/adr/0045-the-desktop-app-builds-as-a-flatpak-in-ci.md)).
  It reaches a maild on the host
  ([frostmail ADR-0013](https://github.com/frostyard/frostmail/blob/main/docs/adr/0013-app-as-a-local-flatpak.md))
  or a maild behind lodge, and makes "one maild for every client, the
  desktop app included" the owner's mode
  ([frostmail ADR-0041](https://github.com/frostyard/frostmail/blob/main/docs/adr/0041-maild-runs-as-a-lodge-app.md)).
  Its Save As fails with a maild behind lodge, because the sandbox's home
  is read-only. Tag-triggered OCI publication exists; `flatpak-index` does
  not list the app.
- **frostread.** readd and its web UI run behind lodge. There is no
  desktop shell. Save as note goes through notes' MCP endpoint on lodge's
  agent socket
  ([frostread ADR-0004](https://github.com/frostyard/frostread/blob/main/docs/adr/0004-save-as-note-goes-through-notes-mcp-on-the-agent-socket.md)).
- **Porter.** porterd is lodge's app `porter`. It thinks only through
  lodge's inference socket, reaches the other apps only through their
  `/mcp/<id>` endpoints on lodge's agent socket, and owns no data
  ([porter ADR-0003](https://github.com/frostyard/porter/blob/main/docs/adr/0003-porter-is-a-lodge-app-that-owns-no-data.md)).
  Its memory and routines are notes in a Notes vault
  ([porter ADR-0005](https://github.com/frostyard/porter/blob/main/docs/adr/0005-memory-and-routines-live-in-the-vault.md)).
- lodge is tailnet-only (ADR-0057). A desktop reaches it only through
  Tailscale on the host.
- Each of the 5 service repositories has a `v0.1.0` release with the
  `.deb` that its sysext builds from (ADR-0058). `flatpak-index` lists
  Igloo only.

## Decision

**Each desktop suite app works on its own as a Flatpak. lodge is a mode
that the user opts into, per app.** This amends ADR-0058's desktop side in
part. ADR-0058's server side stays as it is.

**Porter is not in this scope.** It stays lodge's app `porter`, as porter
ADR-0003 decides. No Porter Flatpak ships, and no Porter desktop work is
planned. "Suite desktop app" in this ADR means frostnotes, frostmail and
frostread.

### The standalone contract

Every suite desktop app meets this contract before `flatpak-index` lists
it:

- **The Flatpak carries the app's UI, its daemon and its helpers.** The
  daemon runs inside the app's own sandbox, as notesd does
  (frostnotes ADR-0031): it is not a host service, and no system unit or
  user unit ships.
- **Standalone is the default.** A fresh install works with no other
  frostyard installation: no host daemon, no lodge, no Tailscale, no
  sysext and no other suite app.
- **Platform requirements stay.** Flatpak itself, the app's runtime from
  Flathub, and the desktop portals are requirements. A service intrinsic to
  the app, such as a mail account's IMAP and SMTP servers or a model
  provider the user configures, is not a frostyard installation.
- **A daemon that must work without a window** runs in its own sandbox
  of the app, as notesd does, so it keeps running after the last window
  closes, until logout. It asks the Background portal to start it at
  login. When the user refuses, only the start at login stops: the app
  says that the daemon then runs from the app's next launch, not from
  login.
- **Each app keeps its data in its own Flatpak data directory,** or in
  folders the user picks, such as a Notes vault. It reads no other app's
  database or files directly.
- **A real desktop shows it.** The app's repository records a test on a
  fresh desktop with real portals and no other frostyard installation. The
  test installs the release's attested OCI image by its digest, from a
  staged catalogue that lists that digest, and covers the app's core local
  work, a restart and a new login, an update that keeps the data, and each
  lodge mode the app offers. `flatpak-index` then lists the same digest
  that the test used. A test in the build sandbox does not count, because
  that sandbox has no portals. The per-app checks go in Plan 0010.

### The lodge modes

- **lodge is opt-in, per app.** The user selects it explicitly in that
  app. Nothing selects it for the user, and one app's mode does not set
  another's.
- **Each app offers one or both of 2 modes, and says which:**
  - **lodge sync:** the bundled daemon keeps the local data and reconciles
    it with the app's daemon behind lodge. The local data stays usable
    when lodge is unreachable.
  - **lodge connection:** the app uses the app's daemon behind lodge as its
    backend. The local data is not used for that account or data set while
    the connection is on.
- **Data never moves silently.** A mode change does not copy, move, merge
  or delete data unless the user confirms an action that names it.
  Leaving a mode, or losing lodge, leaves the local data where it is.
- **One engine per data set on a desktop.** In lodge connection mode, the
  bundled daemon does not also run background work (rules, sends,
  fetches) for the same account or data set.
- **Each lodge mode is a supported and tested path,** with the same
  standing as standalone. It needs what lodge needs (Tailscale on the
  host, and the app on lodge).

### Per app

| App | Flatpak carries | lodge mode | Decided | Open |
| --- | --- | --- | --- | --- |
| frostnotes | the UI, notesd, `notesctl` | sync, through lodge's `/device/notes/` (frostnotes ADR-0026) | the bundle, notesd's sandbox and lock, the Background portal, the socket path (frostnotes ADR-0031) | publication to GHCR and the `flatpak-index` listing; app settings for background activity and for lodge sync; the clean-install record |
| frostmail | the UI, maild, `mailctl` | connection, through the bridge to `wss://LODGE/app/mail/api` (frostmail ADR-0041) | the UI's Flatpak build and publication (frostmail ADR-0045); maild's lodge mode (frostmail ADR-0041) | maild in the Flatpak (build, lifecycle, data, secrets and permissions); first launch with local account setup; how the app keeps one engine per account; Save As in the sandbox; an optional, explicit move from a host maild |
| frostread | the desktop UI, readd, `readctl` | not decided: sync or connection | readd and its web UI as lodge's `read` app | the desktop shell; isolation of untrusted article content without `lodge-content`; the lodge mode; save as note as an optional link to Notes |

- frostmail's change reverses part of its own ADR-0013, ADR-0041 and
  ADR-0045. frostmail records that in its own new ADR, as frostnotes did in
  ADR-0031. frostread records its desktop design in its own repository.
- An app links to another suite app only through a connection that the
  user permits, and only to that app's daemon interface. Each app stays
  useful when the other app is absent.
- A Flatpak's application ID follows
  [ADR-0016](0016-reverse-dns-org-frostyard-identifiers.md); frostread
  sets its ID in its ADR.

### What ADR-0058 says that this changes

- In ADR-0058's table, frostmail's Flatpak carries maild and `mailctl`,
  and frostread gains a Flatpak. porterd stays a sysext only.
- ADR-0058's "Not shipped: a maild for a Linux desktop outside the owner's
  tailnet" no longer holds. A desktop maild ships inside frostmail's
  Flatpak, for every desktop, the owner's included.
- ADR-0058's "frostnotes' desktop notesd is part of its Flatpak" becomes
  the rule for every app's daemon.
- ADR-0057's local modes are not limited to installs outside the owner's
  tailnet. Local is the default of every desktop install. lodge stays the
  server platform that ADR-0057 decides.

### What stays as ADR-0058 says

- The server track: lodge and each daemon as a sysext, built from a
  `frostyard-<name>` `.deb` that is a build input, for Snosi images and
  Floe. The deferral of lodge's host move to Floe holds. Desktop delivery
  does not wait for the server track, and a desktop user needs none of the
  server packages.
- The Flatpak build and publication rules: built in CI inside the SDK,
  offline; OCI images on GHCR; only attested digests in the catalogue;
  updates with `flatpak update`; AppStream metadata, icons and portals.
- The trust rule. A daemon inside a Flatpak runs as the user, in the
  sandbox, and ships no system service, so "nothing that runs as root or
  ships a system service is a Flatpak" holds.
- A CLI runs as `flatpak run --command=<cli> <app-id>`; no CLI is on the
  desktop `PATH`.

## Consequences

- Notes needs no new design to meet the contract. It needs publication,
  its listing, its settings and a clean-install record.
- frostmail needs the most change of the first 2 apps: a Go module and
  maild in its manifest, offline Go sources as frostnotes has, a lifecycle
  and its permissions. maild uses the network access that the manifest
  already has, and needs write access where it writes. Its packaging work is not a new mail
  engine.
- frostread needs desktop architecture work before its Flatpak exists.
- Porter works only behind lodge. A desktop user who wants Porter needs
  lodge, Tailscale and the other apps on lodge.
- Each app now has up to 3 tested paths: standalone, and one or 2 lodge
  modes. Each lodge mode needs its own tests, and mode changes need tests
  that show that no data moves.
- An owner who uses Mail on the desktop in standalone mode, and on a phone
  through lodge, has 2 separate stores and engines for the same account,
  each with its own rules and send-later. The connection mode avoids that;
  it is the user's choice.
- A start at login needs the Background portal's permission. After a
  refusal, maild's rules and send-later and readd's poller run from the app's first launch in a session until logout, and
  not between login and that launch.
- The Flatpak trust story of ADR-0058 now covers more code: each daemon's
  network access and the user's secrets are inside a Flatpak whose OCI
  remote has no GPG signature. The attestation check at index time stays
  the control.
- `flatpak-index` needs a staged catalogue, apart from the public one,
  that lists a candidate digest for the test.
- Each listing waits for a test on a real desktop. That costs a VM run per
  app, as frostnotes' Snow test did on 2026-10-26.
- Plan 0010 needs a scope correction: the per-app milestones and checks
  of this contract, and its inventory rows for a desktop maild and
  frostread.

## Alternatives considered

- **Keep ADR-0058's desktop side, with Mail as a lodge client:** rejected.
  A desktop user would need a host maild or lodge and Tailscale before Mail
  works.
- **A host maild through a user unit, beside the Flatpak:** rejected. A
  Flatpak cannot install a user unit (frostnotes ADR-0031), and a second
  install path defeats one artifact per app.
- **One suite Flatpak with every app and daemon:** rejected. The apps
  release on their own, and one app must not need another.
- **lodge as the default, with local as the fallback:** rejected. The
  default would need a server, Tailscale and a lodge install before an
  app works.
- **Switch to lodge automatically when lodge is reachable:** rejected. It
  moves the user's data and backend without a choice.
- **A standalone Porter Flatpak:** rejected. Porter thinks through lodge's
  inference layer and reaches the other apps only through lodge's MCP
  endpoints (porter ADR-0003). Without lodge it has no model and no apps
  to act on, and it owns no data of its own.
- **Rewrite ADR-0058:** rejected. Accepted ADRs are immutable; a new ADR
  amends it.

## References

- Shapes: [Plan 0010](../plans/0010-suite-packaging.md) (its scope and
  per-app milestones); `frostyard/flatpak-index`'s `apps.json`; frostnotes'
  [design/app.md](https://github.com/frostyard/frostnotes/blob/main/docs/design/app.md);
  frostmail's
  [design/desktop.md](https://github.com/frostyard/frostmail/blob/main/docs/design/desktop.md)
- Amends in part: [ADR-0058](0058-ship-suite-desktop-apps-as-flatpaks-and-services-as-sysexts.md)
  (the desktop side) and
  [ADR-0057](0057-run-first-party-apps-behind-lodge.md) (the scope of the
  apps' local modes)
- Builds on: [ADR-0016](0016-reverse-dns-org-frostyard-identifiers.md),
  [ADR-0057](0057-run-first-party-apps-behind-lodge.md),
  [ADR-0058](0058-ship-suite-desktop-apps-as-flatpaks-and-services-as-sysexts.md)
- frostnotes:
  [ADR-0026](https://github.com/frostyard/frostnotes/blob/main/docs/adr/0026-notesd-runs-as-a-lodge-app.md),
  [ADR-0031](https://github.com/frostyard/frostnotes/blob/main/docs/adr/0031-the-desktop-app-ships-as-a-flatpak-with-its-own-notesd.md)
- frostmail:
  [ADR-0013](https://github.com/frostyard/frostmail/blob/main/docs/adr/0013-app-as-a-local-flatpak.md),
  [ADR-0041](https://github.com/frostyard/frostmail/blob/main/docs/adr/0041-maild-runs-as-a-lodge-app.md),
  [ADR-0045](https://github.com/frostyard/frostmail/blob/main/docs/adr/0045-the-desktop-app-builds-as-a-flatpak-in-ci.md)
- frostread:
  [ADR-0004](https://github.com/frostyard/frostread/blob/main/docs/adr/0004-save-as-note-goes-through-notes-mcp-on-the-agent-socket.md)
- Porter:
  [ADR-0003](https://github.com/frostyard/porter/blob/main/docs/adr/0003-porter-is-a-lodge-app-that-owns-no-data.md),
  [ADR-0005](https://github.com/frostyard/porter/blob/main/docs/adr/0005-memory-and-routines-live-in-the-vault.md)
