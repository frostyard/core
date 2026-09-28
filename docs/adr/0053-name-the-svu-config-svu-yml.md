# 0053 — Name the svu config file `.svu.yml`

- **Status:** Proposed
- **Date:** 2026-09-28

## Context

svu reads its configuration only from `.svu.yml`. A `.svu.yaml` file is
silently ignored, so svu runs with defaults. [ADR-0012](0012-svu-versioning-and-rolling-dev-prerelease.md)
names `.svu.yaml` in its Decision.

## Decision

The svu configuration file in every frostyard Go repository is `.svu.yml`.
This amends only the filename in ADR-0012; the configuration contents
(`tag.prefix: v`, `always: true`, `v0: true`) and the rest of ADR-0012 are
unchanged.

## Consequences

- The frostyard-go-repo skill prescribes `.svu.yml`.
- A repository carrying `.svu.yaml` must rename it; otherwise its versions
  are computed without the fleet configuration.
- ADR-0012's Decision text still reads `.svu.yaml` because Accepted ADRs are
  immutable; readers follow its link to this ADR.

## Alternatives considered

- **Keep `.svu.yaml`:** svu ignores it.
- **Leave ADR-0012 without a successor note:** its Decision would keep
  prescribing a file svu does not read.

## References

- Shapes: [frostyard-go-repo skill](../../.agents/skills/frostyard-go-repo/SKILL.md)
- Builds on / Amends: [ADR-0012](0012-svu-versioning-and-rolling-dev-prerelease.md)
- Builds on: [ADR-0033](0033-link-maintenance-in-immutable-adrs.md)
