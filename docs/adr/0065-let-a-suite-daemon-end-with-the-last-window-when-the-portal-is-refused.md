# 0065 — Let a suite daemon end with the last window when the Background portal is refused

- **Status:** Accepted (2026-11-01)
- **Date:** 2026-11-01

## Context

[ADR-0062](0062-make-desktop-suite-apps-standalone-flatpaks-with-opt-in-lodge.md)
sets the standalone contract of a desktop suite app. For a daemon that must
work without a window, it says:

- the daemon runs in its own sandbox of the app and keeps running after the
  last window closes, until logout;
- it asks the Background portal to start it at login;
- when the user refuses, only the start at login stops, and the daemon then
  runs from the app's next launch.

Its Consequences add that after a refusal, maild's rules and send-later and
readd's poller run from the app's first launch in a session until logout.

Frostmail's desktop Flatpak does not behave that way. In its clean-install
gate (frostmail plan 0013, Phase 9, 2026-10-29, GNOME 48 with
xdg-desktop-portal 1.20.3), with the portal refused, maild and its sandbox
instance ended when the last window closed, and the next window started maild
again. The cause was not traced. Frostmail records this as its accepted
behaviour in
[frostmail ADR-0046](https://github.com/frostyard/frostmail/blob/main/docs/adr/0046-the-desktop-flatpak-carries-its-own-maild.md)
and its
[design/desktop.md](https://github.com/frostyard/frostmail/blob/main/docs/design/desktop.md).
Frostnotes' notesd behaves the same on GNOME 48: with the permission off,
the desktop ends notesd about 45 seconds after the last window closes
([frostnotes design/app.md](https://github.com/frostyard/frostnotes/blob/main/docs/design/app.md)).
ADR-0062 and the 2 apps' records disagree.

## Decision

ADR-0062's rule for a refused Background portal is replaced:

- **With the portal allowed,** nothing changes: the daemon starts at login
  and keeps running after the last window closes, until logout.
- **With the portal refused,** the start at login stops, and the daemon may
  run only while a window of the app is open: it may end with the last
  window, and the next window starts it again. An app may keep its daemon
  running until logout instead; either behaviour meets the contract.
- **The app tells the user.** After a refusal, the app says 2 things: when
  its background work (for example rules, send-later, sync, a feed poller)
  runs (only while a window is open, or until logout, whichever it does),
  and where the user can allow background running.
- **The clean-install gate checks it** on a second VM with the portal
  refused, and records the behaviour it observed.

This replaces ADR-0062's sentence "the app says that the daemon then runs
from the app's next launch, not from login" and its Consequences bullet
that background work runs "from the app's first launch in a session until
logout". Every other part of ADR-0062 stands.

## Consequences

- Frostmail's and frostnotes' daemons meet the contract as they behave
  today. Frostnotes already tells the user (its settings text names the
  stop after the last window and how to allow background running).
  Frostmail shows no such text yet, so it needs one.
- Records that still state the old rule change in their own repositories:
  frostnotes ADR-0031 (notesd after the last window), and frostread
  ADR-0008 and its plan 0002 (readd's poller, whose desktop shell is not
  built yet).
- With the portal refused, background work such as maild's rules and
  send-later and readd's poller can stop between the last window and the
  next launch, not only between login and the first launch. A user who wants
  it to run without a window allows the portal.
- The contract no longer requires work after the last window that a
  refused portal can prevent on some desktops, and whose cause on GNOME is
  not known.
- An app's documents state its behaviour after a refusal, and its gate
  records it.

## Alternatives considered

- **Keep ADR-0062's rule and change frostmail:** it needs a cause that is
  not traced and may be the desktop's, and a gate that proves it on each
  desktop; a refused portal is the user's choice to limit background work.
- **Require every app to stop with the last window:** an app that can keep
  its daemon until logout loses nothing the user asked to stop.

## References

- Amends in part:
  [ADR-0062](0062-make-desktop-suite-apps-standalone-flatpaks-with-opt-in-lodge.md)
  (the daemon after a refused Background portal)
- Shapes: [Plan 0010](../plans/0010-suite-packaging.md) (the per-app
  clean-install checks); the `frostyard-suite-app-release` skill's gate
- Builds on:
  [ADR-0058](0058-ship-suite-desktop-apps-as-flatpaks-and-services-as-sysexts.md),
  [ADR-0062](0062-make-desktop-suite-apps-standalone-flatpaks-with-opt-in-lodge.md)
- frostmail:
  [ADR-0046](https://github.com/frostyard/frostmail/blob/main/docs/adr/0046-the-desktop-flatpak-carries-its-own-maild.md)
