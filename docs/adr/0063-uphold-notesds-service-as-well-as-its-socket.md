# 0063 — Uphold notesd's service as well as its socket

- **Status:** Accepted (2026-10-27)
- **Date:** 2026-10-27

## Context

[ADR-0058](0058-ship-suite-desktop-apps-as-flatpaks-and-services-as-sysexts.md)
gives `notesd` only `frostnotes-lodge.socket` in its `Upholds=` table. Its
own rule says the service is upheld too when the daemon works without a
client.

notesd at `v0.1.0` works without a client. It watches each vault with
fsnotify and a 5-minute rescan, and it prunes versions at start and every
24 h
([frostnotes `internal/vault/watch.go`](https://github.com/frostyard/frostnotes/blob/v0.1.0/internal/vault/watch.go),
[`internal/vault/manager.go`](https://github.com/frostyard/frostnotes/blob/v0.1.0/internal/vault/manager.go)).
`frostnotes.service` has no `Condition*=`, reads nothing in `/etc`, and has
`Requires=` and `After=` on the socket.

With only the socket upheld, notesd starts on the first connection. lodge
polls each app's socket every 15 s
([lodge `internal/apps/apps.go`](https://github.com/frostyard/lodge/blob/v0.1.0/internal/apps/apps.go),
`PollEvery`). So notesd starts after lodge does, and it does not start
while lodge is not running. No suite daemon exits when idle.

## Decision

The `notesd` sysext upholds `frostnotes-lodge.socket` and
`frostnotes.service`, in the drop-in `multi-user.target.d/10-notesd.conf`,
and its preset `40-notesd.preset` enables both.

This row replaces ADR-0058's `notesd` row. The other rows and rules of
ADR-0058 do not change.

## Consequences

- The vault work runs from boot, whether lodge runs or not.
- notesd runs on a host where lodge's sysext is disabled.
- If notesd exits, also with status 0, `Upholds=` starts it again. Its unit
  has `Restart=on-failure`, which does not cover a clean exit. To stop it
  for longer, an administrator disables the feature or masks the unit, as
  ADR-0058 says.
- Snosi's `sysext-upholds-guard` checks the service, and passes it: the
  unit has no condition.
- The `v0.1.0` `.deb` fits: no frostnotes release is needed.

## Alternatives considered

- **Socket only, as ADR-0058's row has it:** rejected. The vault work then
  depends on lodge running and polling, and one sysext's housekeeping
  should not depend on another sysext.

## References

- Amends in part:
  [ADR-0058](0058-ship-suite-desktop-apps-as-flatpaks-and-services-as-sysexts.md)
  (the `notesd` row of the `Upholds=` table)
- Shapes: [Plan 0010](../plans/0010-suite-packaging.md) (Phase 3)
- Snosi's [design/sysexts.md](https://github.com/frostyard/snosi/blob/main/docs/design/sysexts.md)
  (Service Activation Pattern)
