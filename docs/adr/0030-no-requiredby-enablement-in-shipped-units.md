# 0030 — Shipped systemd units never use RequiredBy= enablement

- **Status:** Accepted
- **Date:** 2026-08-12

## Context

Frostyard OS images (snosi and successors) apply preset policy at first
boot, materializing shipped units' `[Install]` sections as enablement
symlinks in the machine's persistent `/etc` — state that outlives the
image that created it. When a later image retires a unit, a persisted
`.wants` link dangles harmlessly, but a persisted `.requires` link (from
`RequiredBy=`) becomes a `Requires=` on a unit that fails to load. That
invalidates PID 1's very first transaction — starting `default.target` —
and the machine dies at "Failed to isolate default target" before any
service runs, before the journal persists, and before any runtime
migration could possibly fire.

This bricked real hardware on 2026-08-12: snosi's `e08311f` retired
`snow-linux-live-setup.service` (`RequiredBy=multi-user.target`,
`RequiredBy=display-manager.service`); image `20260812205454` failed all
three counted boots on every install whose first boot predated the
retirement, while fresh installs — and therefore every CI boot test —
passed. A/B fallback saved the machines; nothing saved the update.

`WantedBy=` has no such failure mode, and hard startup ordering can
always be expressed from the dependent unit's side.

## Decision

Units shipped in Frostyard-built images, sysexts, and packages do not use
`RequiredBy=` (or hand-shipped `*.requires/` links) for enablement. Where
a hard dependency is genuinely needed, the *dependent* unit declares
`Requires=`/`BindsTo=` in its `[Unit]` section, or the repository's
static-wants-in-/usr pattern is used — mechanisms that live in `/usr` and
update atomically with the image, leaving no persisted `/etc` state to go
stale. `WantedBy=` remains the normal enablement mechanism.

Repositories that ship unit payloads enforce this with a CI guard (snosi:
`check-required-by-guard.sh`, ADR-0013 there), with a per-line
escape-hatch comment for the rare provably-safe exception. OS images
whose boot path can do so additionally prune stale `.requires` links
defensively before PID 1 sees them (snosi: the native A/B initrd's
etc-overlay module), because third-party packages can still ship
`RequiredBy=` units and packages get dropped from images.

## Consequences

- Retiring or renaming a shipped unit is always safe with respect to
  persisted enablement; unit removal no longer requires a migration
  story for `/etc`.
- Authors must express hard dependencies in the dependent direction,
  which matches systemd upstream practice.
- Third-party (distro-packaged) `RequiredBy=` units remain possible;
  image repos are expected to carry the defensive prune where their boot
  architecture allows it.

## Alternatives considered

- **Per-retirement no-op stub units:** permanent name cruft, easy to
  forget, and a mask variant is itself boot-fatal for required units.
- **Runtime migration services:** structurally impossible — the failure
  precedes all services.
- **Policy without enforcement:** this exact hazard shipped once already;
  a convention that CI does not check will regress.

## References

- Shapes: snosi
  [ADR-0013](https://github.com/frostyard/snosi/blob/main/docs/adr/0013-no-requiredby-enablement-prune-stale-requires.md)
  (guard + initrd prune implementation)
- Builds on: [ADR-0004](0004-product-namespaced-filesystem-tiers.md)
  (/run/snosi runtime-state reporting path used by the prune)
