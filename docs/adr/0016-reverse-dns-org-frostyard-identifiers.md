# 0016 — Reverse-DNS org.frostyard.* identifiers for apps and privileged operations

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

Desktop and system integration surfaces demand collision-proof identifiers:
GTK application IDs, desktop files, icons, PolicyKit action IDs, and
pilothouse's broker operation IDs. These strings become audit-record keys
and polkit policy anchors — they are effectively permanent once deployed.

## Decision

All such identifiers live under the reverse-DNS namespace
**`org.frostyard.`**:

- Application identity: `org.frostyard.<AppName>` (e.g.
  `org.frostyard.ChairLift`) names the GObject application ID, the
  `.desktop` file, the icon, and the polkit policy files; `<vendor>` is
  `Frostyard`.
- PolicyKit actions: `org.frostyard.<AppName>.<action>`, one distinct
  action ID per privileged operation, each pinned to an absolute
  `exec.path` (and `exec.argv1` where a subcommand varies). No passwordless
  rules ship.
- Privileged operation IDs (pilothouse broker):
  `org.frostyard.<product>.<module>.<verb>`, with a **distinct ID per
  danger level** — never a `force=`/`mode=` parameter — so audit records
  are self-describing. Compound verbs use `_` (one `-` inconsistency exists
  in storage and should be harmonized toward `_`).

## Consequences

- Identity is uniform across apps: a polkit rule, an audit query, or a
  desktop database entry is guessable from product + module + verb.
- The distinct-ID-per-danger-level rule trades ID count for audit clarity;
  adding a destructive variant means a new ID and policy entry, on purpose.
- These strings are contracts with deployed policy files — renames are
  breaking changes requiring coordinated policy + code updates.
- Note: image capability labels use a different namespace (`io.snosi.*`,
  [ADR-0017](0017-io-snosi-capability-labels-and-mechanics-tier.md)); that
  split (org identity vs product-internal assertions) is deliberate.

## Alternatives considered

- **Bare names (`chairlift.update`):** collision-prone in system-wide
  namespaces (D-Bus, polkit) and unbrandable.
- **Parameters instead of per-danger IDs:** hides destructive variants from
  polkit policy and audit trails.

## References

- Shapes: [chairlift `data/`](https://github.com/frostyard/chairlift/tree/main/data),
  [pilothouse `internal/broker/api.go`](https://github.com/frostyard/pilothouse/blob/main/internal/broker/api.go),
  [pilothouse `docs/capabilities.md`](https://github.com/frostyard/pilothouse/blob/main/docs/capabilities.md)
- Builds on: [ADR-0001](0001-record-architecture-decisions.md)
- Related: [ADR-0017](0017-io-snosi-capability-labels-and-mechanics-tier.md)
