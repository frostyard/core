# 0039 — Widen `maintenance_programs` within repository schema v1

- **Status:** Accepted
- **Date:** 2026-08-18

## Context

[ADR-0035](0035-author-organization-authority-as-strict-json.md) fixed the
repository declaration's `maintenance_programs` to the closed set `quality`,
`ci`, `security`, `architecture` (`maxItems: 4`) — the four discovery kinds
Fluent's dogfood feeder happened to have — and stated that organization
schemas are immutable once a consumer supports their version, with a
meaningful incompatible change creating a new version.

Fluent now runs those programs from a catalog with per-program cadence
(Fluent's `docs/plans/maintenance-programs.md`, Phases 1–2, 2026-08-18) and
has planned the next entries: `conformance` (does the repository satisfy
core's binding ADRs and canonical surfaces), `triage` (stale, duplicate, and
resolved-but-open issues), `dependencies`, `docs`, and `release`. A repository
cannot opt into any of them: the enum refuses the value, and Fluent honors the
declaration, so no declaration can name a program the schema does not list.

Fluent pins the exact byte digest of every v1 schema it bundles and refuses a
core revision whose schema bytes differ, and it closes the same vocabulary in
its control-plane registry. Adding enum values is therefore never invisible to
the consumer: it is a coordinated change, but not an incompatible one — every
declaration valid before the change is valid after it, and a reader that
knows the old set still reads every old declaration.

Cutting `organization/schemas/v2/` for five new enum values would force every
consumer to carry two repository schema versions, two fixture trees, and two
record vocabularies for a change that adds words to a list.

## Decision

- **Adding values to an enum inside a published schema version is a
  compatible change**, permitted within that version, when every instance
  valid before the change stays valid, no existing value changes meaning, and
  the array bound (`maxItems`) is raised to the new enum length. Removing or
  renaming a value, changing a field's type or requiredness, or adding a
  required field remain incompatible and still create a new schema version
  per ADR-0035.
- Each such widening is one core pull request that changes the schema, the
  spec table, and at least one valid fixture using a new value; the invalid
  `repository-unknown-program.json` fixture keeps proving the enum is still
  closed.
- Consumers that pin schema digests (Fluent) update their bundled copy and
  digest deliberately, **before** the core change merges, so a consumer never
  faces schema bytes it has not reviewed; core does not wait for or verify
  that step.
- **First application:** `maintenance_programs` gains `conformance`, `triage`,
  `dependencies`, `docs`, and `release`, and `maxItems` becomes 9. No
  declaration changes in this decision; a repository opts into a new program
  by declaring it, and Fluent seeds only what it has a catalog entry for and
  reports the rest.

## Consequences

- A new maintenance program is one enum value here plus one catalog entry in
  Fluent, without a schema version.
- Every widening is a two-repository, ordered change; a consumer that lags
  records rejections of the new core revision until it catches up. That
  window is visible (Fluent's `core -- rejections`) and harmless: the active
  snapshot stays.
- ADR-0035's immutability now reads "immutable except for compatible enum
  widening"; this ADR is the record of that narrowing.
- Programs remain names only. Their text, cadence, and child ceilings live in
  Fluent's catalog until a later decision publishes programs as core records.

## Alternatives considered

- **New schema version (v2) per widening:** honors ADR-0035 to the letter but
  multiplies consumer surface (versions, fixtures, record vocabularies) for
  an additive change; rejected as cost without benefit.
- **Open string for `maintenance_programs`:** removes the review that keeps a
  program a shared organization word; rejected.
- **Programs as core records now:** the right end state, but a larger design
  (text, cadence, ceilings as authority); deferred as noted in Fluent's plan.

## References

- Shapes: [organization repository enrollment](../specs/organization-repository-enrollment.md),
  [organization authority](../design/organization-authority.md)
- Builds on: [ADR-0035](0035-author-organization-authority-as-strict-json.md)
- Consumer: Fluent `docs/plans/maintenance-programs.md` Phase 3
