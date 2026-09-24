# 0052 — Remove NBC/native-A/B artifact retention gates

- **Status:** Accepted
- **Date:** 2026-09-24

## Context

[ADR-0047](0047-retire-nbc-on-a-proportional-fast-path.md) ends
NBC/native-A/B support on 2026-09-30 and requires final artifacts to be
retained through 2027-09-30. [ADR-0050](0050-replace-nbc-retention-date-with-a-completion-condition.md)
replaces that date for artifacts outside signed `stable` with recorded
dispositions for the four known users and currency of documentation that
references those artifacts. Before this ADR's acceptance, those completion
conditions remained in force.

[ADR-0048](0048-publish-debian-packages-to-explicit-codenames.md) separately
requires the signed `stable` repository to remain readable and unchanged
through at least 2027-09-30. The repository includes NBC `.deb` packages.
Signed indexes can reference package bytes under `pool/`, outside `dists/`;
keeping only the signed index files cannot keep the repository readable.
The [stable repository drift alarm](../design/stable-repository-drift-alarm.md)
checks those referenced pool objects as well as the signed metadata.

Retiring NBC/native-A/B installer media is distinct from the current Firn
installer ISO used for the supported Snosi bootc migration path. The latter
is live production infrastructure, not a retiring NBC/native-A/B artifact.

## Decision

After 2026-09-30, no **NBC/native-A/B-specific** minimum artifact retention
duration or completion condition applies. This replaces ADR-0047's
2027-09-30 retention mandate for final NBC/native-A/B binaries, signed
indexes, checksums, and public verification material, and ADR-0050's
four-user-disposition and documentation-currency retention conditions for
artifacts outside signed `stable`. The rule covers retiring native A/B images,
retiring native A/B installer media, verification material, and existing NBC
repository `.deb`s, whether held inside or outside the signed `stable` APT
tree. Open dispositions, the 2026-10-31 best-effort help cutoff, or a stale
migration runbook do not extend NBC-specific artifact retention. Existing
debs may remain published; no deletion is required.

This removal of an NBC-specific obligation does **not** relax ADR-0048's
independent floor. Keep signed `stable` readable and unchanged through at
least 2027-09-30, including every package byte its signed indexes reference,
even if the `.deb` is stored under `pool/` rather than `dists/`. Do not
rewrite or delete signed `stable` or any referenced deb under this decision.
Any proposed change to that floor requires a separate explicit decision by
Brian. After the floor expires, this ADR still grants no deletion authority.

ADR-0047's support cutoff, four-user outreach, best-effort help window,
migration-readiness requirements, post-cutoff publication controls, and
`frostyard/nbc` archive preconditions remain in force. Retain Git history,
source tags, and the manifest of source commits and artifact digests
indefinitely. Its archive recovery check is an archive precondition for the
artifacts then retained, not a new minimum artifact-retention duration.

Retiring native A/B images is approved in principle, not ordered or
authorized for production deletion by this ADR. Each specific production
artifact deletion requires separate Brian authorization identifying the
objects and impact; the same separate authorization applies to repository
archival, publication, signing, and credential changes, with ADR-0047's
applicable preconditions and controls intact. Before any such action,
surface open user dispositions and stale EOL or recovery instructions
(including the runbook's last-resort NBC reinstall path) for review, without
making their resolution an artifact-retention gate. Nothing here authorizes
changes to the live Firn installer ISO.

## Consequences

- Retiring images, installer media, verification material, and existing debs
  have no NBC-specific one-year floor or four-user/documentation completion
  gate; keeping existing debs remains permitted.
- An independently protected deb in `pool/` cannot be removed while its
  bytes are referenced by signed `stable` under ADR-0048. Removing an index
  alone or leaving a broken index does not satisfy that ADR.
- Unresolved users or misleading recovery instructions are no longer
  automatic retention blockers; separately authorized actions must surface
  those risks without treating this decision as operational permission.
- ADR-0047's support, migration, provenance, and archive obligations remain
  separate from artifact retention. The production Firn installer remains
  outside this retirement scope.
- ADR-0050's four-user-disposition and documentation-currency conditions no
  longer apply to artifacts outside signed `stable`; ADR-0048's floor is
  unaffected.

## Alternatives considered

- **Remove only the outside-`stable` completion condition.** Rejected: it
  would leave NBC debs out of the no-NBC-specific-retention rule and obscure
  the distinction between that rule and ADR-0048's independent suite floor.
- **Treat package objects under `pool/` as outside signed `stable`.** Rejected:
  signed indexes reference those bytes; removing them would break the
  repository's readability and immutability.
- **Require deletion when the retention gate ends.** Rejected: absence of a
  minimum does not require removal or authorize a production mutation.

## References

- Amends (artifact-retention mandate only):
  [ADR-0047](0047-retire-nbc-on-a-proportional-fast-path.md)
- Amends (outside-`stable` completion condition and NBC-only scope of the
  no-calendar-floor rule only; not its account of ADR-0048 or its other
  historical clauses):
  [ADR-0050](0050-replace-nbc-retention-date-with-a-completion-condition.md)
- Preserves (signed `stable` and referenced bytes):
  [ADR-0048](0048-publish-debian-packages-to-explicit-codenames.md)
- Builds on: [ADR-0033](0033-link-maintenance-in-immutable-adrs.md)
- Shapes: [Plan 0006](../plans/0006-nbc-retirement-and-debian-suite-migration-fast-path.md),
  [stable repository drift alarm](../design/stable-repository-drift-alarm.md)
