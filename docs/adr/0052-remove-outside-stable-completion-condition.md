# 0052 — Remove the outside-`stable` completion condition; keep separate approval for disposal

- **Status:** Proposed
- **Date:** 2026-09-23

## Context

[ADR-0050](0050-replace-nbc-retention-date-with-a-completion-condition.md)
replaced ADR-0047's fixed 2027-09-30 retention date, for NBC/native-A/B
artifacts outside signed `stable`, with a completion condition: each of the
four known users' migration disposition recorded as resolved, and Snosi's
migration-runbook §8 documentation resolved before any dependent artifact is
removed.

"Artifacts outside signed `stable`" names two distinct lineages that must not
be conflated: ADR-0050's "NBC installer media" category — the retiring
native A/B installer product (`snosi-native-installer_*`) frozen under
ADR-0047 — and the current, actively operated Firn installer ISO
(`shared/firn-installer/`, published under `isos/native/v1/`) that is Snosi's
live production install path. Only the retiring native A/B lineage is in
scope of ADR-0047's, ADR-0050's, and this ADR's retention/disposal rules.
The live Firn ISO is not frozen and not retiring; it is outside that
retention/disposal scope, though ADR-0047 separately names it as the
supported migration path and its evidence source.

Signed `stable` — which holds NBC's `.deb` packages, their indexes, and their
checksums — is governed independently by Accepted
[ADR-0048](0048-publish-debian-packages-to-explicit-codenames.md): "Keep the
current signed `stable` repository readable and unchanged through at least
2027-09-30 as a legacy recovery source." ADR-0050 did not touch that floor;
this ADR does not either.

ADR-0047 separately gates archiving the `frostyard/nbc` repository on several
preconditions, including that "retained artifacts pass their recovery check."
That clause conditions repository-archival readiness — it requires artifacts
to still exist at the moment the archive action is tested — on whatever
artifacts remain present at that time. It does not set a minimum retention
duration for the artifacts themselves, and this ADR does not change or rely
on that clause.

No mechanism in either `frostyard/core` or `frostyard/snosi` tracks the four
known users' migration disposition as a live, machine-readable signal; it is
a fact tracked outside both repositories. ADR-0050's completion condition was
the only place that currency was asserted before an artifact could be
removed.

## Decision

For NBC/native-A/B artifacts outside signed `stable` — native A/B disk
images, NBC installer media (the retiring native A/B installer product,
not the current Firn installer ISO), and public verification material not
part of the signed `stable` APT tree —
ADR-0050's completion condition is removed in full. No minimum retention
duration or condition applies to any of these three categories.

Any deletion or archival action affecting these artifacts requires Brian's
separate written approval naming the exact artifact(s) and reason, in
addition to (for repository archival) the preconditions ADR-0047 already
states. This extends ADR-0047's existing approval requirement, previously
scoped to "a post-cutoff publication" and to archiving `frostyard/nbc`, to
cover deletion of individual retained artifacts short of full repository
archive.

Before approving disposal of any artifact under this ADR, the approval
should record confirmation of two facts, as a named non-binding
recommendation rather than a structural gate:

- all four known users' migration disposition is current per the migration
  runbook, and
- Snosi's `docs/nbc-to-bootc-migration.md` §8 reflects current state.

Neither confirmation blocks approval; both are named so that re-deriving
this checklist does not depend on tribal memory once the structural
condition is gone.

Signed `stable`'s NBC packages, indexes, and checksums remain governed by
ADR-0048's floor, unchanged. Git history, source tags, and the manifest of
source commits and artifact digests remain retained indefinitely, unchanged
from ADR-0047. ADR-0047's `frostyard/nbc` archive preconditions (EOL README
live, publication and credential access disabled, open items dispositioned,
supported-product dependencies removed, retained artifacts pass their
recovery check) are unchanged.

## Consequences

- No calendar date, per-user disposition, or documentation state constrains
  how long these artifacts may be kept; Brian may approve disposal at any
  time, or never.
- Removing the structural condition also removes the only existing trigger
  that forces re-verification of user disposition and runbook currency before
  disposal; the named non-binding recommendation is the sole remaining
  safeguard, and it does not block approval if skipped.
- The distinction between ADR-0050's "NBC installer media" category (the
  retiring native A/B installer product) and the live Firn installer ISO is
  now explicit in the record: a future action under a broad reading of
  "installer media" cannot mistakenly target live production infrastructure
  under this ADR's authorization.
- Signed `stable` is unaffected; ADR-0048's floor through at least 2027-09-30
  continues to govern NBC's published packages.
- ADR-0047's repository-archive preconditions, including the recovery check,
  are unaffected and do not reintroduce a retention floor this ADR removes.

## Alternatives considered

- **Keep ADR-0050's completion condition as a hard gate.** Rejected: it
  would keep a structural retention condition in place after that
  requirement has been removed.
- **Remove the condition with no replacement language at all.** Rejected: no
  other mechanism tracks the four known users' migration disposition or the
  migration runbook's currency; a named non-binding recommendation preserves
  that checklist without restoring a structural gate.
- **Leave "installer media" undisambiguated.** Rejected: ADR-0050's "NBC
  installer media" category and the current Firn installer ISO are different
  artifacts at different lifecycle stages; an undisambiguated scope risks
  authorizing deletion of live production infrastructure.

## References

- Supersedes (completion condition for artifacts outside signed `stable`
  only; ADR-0050's scope split between `stable` and non-`stable` artifacts,
  and all other clauses of ADR-0047, remain Accepted and in force):
  [ADR-0050](0050-replace-nbc-retention-date-with-a-completion-condition.md)
- Does not affect: [ADR-0047](0047-retire-nbc-on-a-proportional-fast-path.md)
  (archive preconditions, four-user fast path, support cutoff),
  [ADR-0048](0048-publish-debian-packages-to-explicit-codenames.md)
  (signed `stable` floor)
- Builds on: [ADR-0033](0033-link-maintenance-in-immutable-adrs.md)
- Implements through:
  [Plan 0006](../plans/0006-nbc-retirement-and-debian-suite-migration-fast-path.md)
- Coordinates with:
  [Plan 0008](../plans/0008-post-nbc-bootc-only-transition.md) (bootc
  production-readiness, a distinct question from this ADR's retention scope)
- Product context:
  [Snosi migration runbook](https://github.com/frostyard/snosi/blob/main/docs/nbc-to-bootc-migration.md)
  (§8, the documentation this ADR's non-binding recommendation names)
