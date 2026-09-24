# 0050 — Replace the NBC/native-A/B retention date with a completion condition

- **Status:** Proposed
- **Date:** 2026-09-23

## Context

[ADR-0047](0047-retire-nbc-on-a-proportional-fast-path.md) freezes final
NBC/native A/B artifacts and requires: "Retain binaries, signed indexes,
checksums, and public verification material through 2027-09-30. Retain Git
history, source tags, and a manifest of source commits and artifact digests
indefinitely." This ADR supersedes only that calendar retention clause; the
rest of ADR-0047 — the 2026-09-30 support cutoff, the four-user fast path,
migration readiness gates, interim ownership, and the archive precondition
for `frostyard/nbc` — is unaffected and remains Accepted.

Brian asked for the fixed one-year date to be removed. Before drafting,
Murbella (keeper of `snosi`) was consulted on whether anything in Snosi's
domain is load-bearing against that calendar horizon. Her answer:

- `bootc rollback` and native A/B's dual-slot rollback are both host-local;
  neither reaches back to retained registry/R2 artifacts.
- Snosi's documented migration path is fresh reinstall from the current Firn
  ISO plus operator backup/restore — not an update hop from, or in-place
  conversion of, retained nbc/native-A/B artifacts.
- Snosi's own commitment to the four known users is best-effort migration
  help through **2026-10-31** only (per ADR-0047), a much shorter horizon
  than 2027-09-30.
- One documented edge case does assume retained nbc install media exists:
  the migration runbook's "backing out" path (§8), which reinstalls nbc
  media to reverse a migration. It is already framed as a discouraged
  last resort, not a guarantee.

Her conclusion: the 2027-09-30 date is not load-bearing for any Snosi
guarantee. The only real dependency is the four known users' migration
disposition.

Separately, Accepted [ADR-0048](0048-publish-debian-packages-to-explicit-codenames.md)
independently requires: "Keep the current signed `stable` repository readable
and unchanged through at least 2027-09-30 as a legacy recovery source." NBC's
`.deb` packages, their signed indexes, and their checksums are published
inside that shared `stable` suite, alongside every other legacy package.
ADR-0048's floor was decided for the whole suite's recovery value, not for
NBC specifically, and this ADR does not touch it. Anything ADR-0050 says
about removing a calendar floor therefore applies only to the part of
ADR-0047's frozen artifact set that ADR-0048 does not already govern:
native A/B disk images, NBC installer media, and any public verification
material held outside the signed `stable` APT tree.

## Decision

ADR-0047's calendar retention clause — "Retain binaries, signed indexes,
checksums, and public verification material through 2027-09-30" — is
replaced as follows:

- **Artifacts inside signed `stable`** (NBC `.deb` packages, their indexes,
  and their checksums): unchanged. ADR-0048's independent floor — readable
  and unchanged through at least 2027-09-30 — continues to apply. This ADR
  does not shorten it.
- **Artifacts outside signed `stable`** (native A/B disk images, NBC
  installer media, and verification material not part of the APT tree):
  the calendar floor is removed and replaced with a completion condition.
  These are retained until **both** of the following hold:
  - each of the four known users' migration disposition is explicitly
    recorded as resolved — migrated, or the user has declined migration and
    accepted EOL. The 2026-10-31 best-effort help-window closing ends
    Frostyard's obligation to *assist*; it does not by itself resolve a
    disposition that is still open, and
  - any EOL notice or recovery documentation that references these
    artifacts — including the migration runbook's last-resort
    nbc-reinstall "backing out" path — is completed, or the affected
    artifact is retained until that documentation is completed, removed, or
    explicitly re-flagged as unavailable, in that order. No artifact this
    condition covers is removed while documentation still describes it as
    available.

Where an item is later found to exist in both categories, the later of the
two rules controls.

Retention under the completion condition ends only when Brian confirms both
of its sub-conditions are met, as part of the same approval ADR-0047 already
requires for archiving `frostyard/nbc`. Git history, source tags, and the
manifest of source commits and artifact digests continue to be retained
indefinitely, unchanged from ADR-0047.

This ADR does not authorize deletion of anything. Disposal remains a
separately approved action under ADR-0047's existing archive precondition
(EOL README live, publication and credential access disabled, open items
dispositioned, supported-product dependencies removed, retained artifacts
pass their recovery check).

## Consequences

- For NBC packages published in signed `stable`, nothing changes: ADR-0048's
  floor through at least 2027-09-30 still governs them, and this ADR does not
  create a contradiction by claiming otherwise.
- For native A/B disk images and NBC installer media outside `stable`,
  retention duration now tracks actual recorded disposition for the four
  known users rather than an arbitrary calendar date chosen before any of
  them had migrated.
- Frostyard's best-effort help obligation still ends 2026-10-31 per
  ADR-0047; that date no longer doubles as a retention trigger. An open
  disposition after that date keeps the covered artifacts until it is
  actually resolved — potentially past 2027-09-30 — which the prior fixed
  date would not have captured.
- If every disposition resolves early, the outside-`stable` artifacts could
  in principle be released before 2027-09-30 — but only through the same
  approval gate ADR-0047 already requires for archive, and never ahead of
  the documentation condition above.
- The last-resort nbc-reinstall "backing out" path in Snosi's migration
  runbook must be tracked explicitly and resolved (completed, removed, or
  re-flagged unavailable) before any install media it depends on is removed
  — not after. This is now a named, ordered precondition for archive, not a
  silent gap.
- Readers of ADR-0047 alone will still see "through 2027-09-30" in its
  immutable text; ADR-0047's own References now link forward to this ADR as
  its amendment (link-only maintenance under ADR-0033), and this ADR is the
  correction of record for the scope described above.

## Alternatives considered

- **Shorten the fixed date instead of removing it.** Rejected: any new
  calendar date would be as arbitrary as the one being replaced, and
  Murbella's answer showed the real dependency is a condition (migration
  disposition), not a duration.
- **Leave ADR-0047's date in place and treat it as a floor, not a target.**
  Rejected: Brian's instruction was to remove the one-year mandate, not
  reinterpret it; an unstated "floor" invites exactly the ambiguity this ADR
  exists to resolve.
- **Amend ADR-0047 directly.** Rejected: ADR-0047 is Accepted and
  semantically immutable; ADR-0033 permits only link-destination repairs to
  an Accepted ADR, not a change to its retention obligation. A new ADR is
  the correct mechanism.

## References

- Supersedes (retention clause only, and only for artifacts outside signed
  `stable`; all other clauses of ADR-0047 remain Accepted and in force):
  [ADR-0047](0047-retire-nbc-on-a-proportional-fast-path.md)
- Does not affect (signed `stable`'s independent retention floor, which
  continues to cover NBC's published packages, indexes, and checksums):
  [ADR-0048](0048-publish-debian-packages-to-explicit-codenames.md)
- Builds on:
  [ADR-0033](0033-link-maintenance-in-immutable-adrs.md) (why this is a new
  ADR rather than an edit to 0047)
- Implements through:
  [Plan 0006](../plans/0006-nbc-retirement-and-debian-suite-migration-fast-path.md)
- Product context:
  [Snosi migration runbook](https://github.com/frostyard/snosi/blob/main/docs/nbc-to-bootc-migration.md)
  (§8, the last-resort backing-out path this ADR's condition names)
