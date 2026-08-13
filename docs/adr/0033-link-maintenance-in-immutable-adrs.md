# 0033 — Permit link-only maintenance in immutable ADRs

- **Status:** Accepted
- **Date:** 2026-08-12

## Context

[ADR-0001](0001-record-architecture-decisions.md) makes Accepted ADRs
immutable so later edits cannot erase what was decided or why. Supersession
preserves the same historical record while directing readers to a new
decision.

Link targets do not share that permanence. Files move, repositories are
archived, and obsolete implementation artifacts are deleted. ADR-0024 is the
concrete failure: it accurately records the short-lived `frostyard-cairn`
skill, but both relative links to that deleted skill are dead after
[ADR-0025](0025-consolidate-repository-docs-into-docs.md) replaced it with
`frostyard-repo-docs`.

The docs-integrity gate skipped every relative link in a Superseded ADR to
avoid forcing edits to historical records. That protects immutability by
allowing link rot, leaving readers unable to inspect the evidence the record
names.

## Decision

ADR immutability protects the **semantic record**, not a broken URL. Accepted
and Superseded ADRs permit narrowly scoped link maintenance under these
rules:

- A repair changes only the link destination and the minimum surrounding
  label needed to identify it as historical, moved, or superseded. It does
  not rewrite the decision, rationale, consequences, alternatives, date, or
  status (except the established Accepted-to-Superseded transition).
- A moved artifact points to its new canonical location when it is still the
  same artifact.
- A retired artifact that matters to the historical decision points to an
  immutable commit or tag permalink and is labeled **historical**.
- A current successor may be added as a separately labeled link. It never
  silently replaces a historical target whose content or role differed.
- If accurate repair requires changing a claim or recording new behavior, it
  requires a follow-up ADR rather than an edit to the old one.

Relative links in Superseded ADRs are checked by `scripts/check-docs.mjs`
under the same link-integrity requirement as every other indexed document.
Superseded status is not an exemption from a navigable historical record.

## Consequences

- Readers can inspect the artifact an ADR actually referenced and follow a
  clearly identified successor without confusing the two.
- The docs gate catches future internal link rot in Superseded ADRs.
- ADR-0024 can point at the last committed `frostyard-cairn` skill and name
  `frostyard-repo-docs` as its successor without changing the historical
  decision.
- **Negative:** immutable ADR files can now receive tiny maintenance diffs,
  so review must reject any repair that changes meaning under cover of fixing
  a link.
- External URLs remain outside the local link check. Commit/tag permalinks
  reduce that risk for retired artifacts hosted in git.

## Alternatives considered

- **Never alter an Accepted or Superseded ADR byte:** preserves a pure archive
  but knowingly leaves evidence inaccessible and forces readers to mine git
  history without a starting revision.
- **Silently retarget dead links to current successors:** changes historical
  meaning when the successor has a different role or procedure.
- **Exempt all Superseded ADRs from link checks:** the previous behavior;
  convenient, but it makes link rot invisible until a reader reports it.
- **Copy retired artifacts into a permanent archive directory:** duplicates
  git history and creates another content surface to maintain.

## References

- Shapes: [docs-integrity gate](../../scripts/check-docs.mjs),
  [ADR template](TEMPLATE.md),
  repaired [ADR-0024](0024-rename-ai-docs-directory-to-cairn.md)
- Builds on: [ADR-0001](0001-record-architecture-decisions.md),
  [ADR-0029](0029-acmm-conformance-via-canonical-aliases.md)
- Tracks: [core#54](https://github.com/frostyard/core/issues/54)
