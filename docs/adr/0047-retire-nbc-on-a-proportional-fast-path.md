# 0047 — Retire NBC on a proportional four-user fast path

- **Status:** Proposed
- **Date:** 2026-09-09

## Context

Snosi ADR-0015 ends support for NBC installations and native A/B images on
2026-09-30. The supported replacement is the equivalent Snosi bootc product
installed with Firn. Support termination, migration readiness, and repository
archive are separate decisions.

The deployed population is approximately four known users: Brian and three
directly reachable friends. Enterprise fleet discovery, a broad hardware
matrix, and a long formal support program are disproportionate at this scale.
The useful safety boundary is direct coordination, preserved recovery
artifacts, and proof on configurations actually in use.

Current evidence is not green: retained Lab data reports no green Firn
installation run, explicit Debian release suites do not exist, and the NBC
repository retains live publication and unresolved safety edges.

## Decision

NBC and native A/B support ends on 2026-09-30. After that date Frostyard
publishes no routine fixes, security updates, dependency refreshes, native
images, or NBC packages. Best-effort migration help remains available through
2026-10-31 for the four known users; it does not extend product support.

Direct outreach is the fleet inventory. Record only each known user's product,
hardware class, migration disposition, and whether help is needed. Frostyard
accepts the residual risk of an undiscovered installation rather than building
fleet telemetry; the final product notice and public EOL documentation remain
available for discovery.

Migration readiness covers configurations reported in use. For each product
and hardware class, require:

- one installation from the published Firn ISO to a blank target;
- one update to a real published image;
- one rollback that preserves user data; and
- 48 hours of normal use spanning at least one real publish.

A failed required case blocks a readiness claim until fixed or disclosed as a
specific limitation. Missing breadth outside the known population does not
move the support cutoff.

Freeze, do not replace or delete, final NBC/native artifacts. Retain binaries,
signed indexes, checksums, and public verification material through
2027-09-30. Retain Git history, source tags, and a manifest of source commits
and artifact digests indefinitely. Test one public download and verification
path before archive.

Brian is interim owner for the support boundary, residual fleet risk, and
emergency publication. A post-cutoff publication requires written approval of
the exact artifact, reason, digest, affected users, test evidence, and rollback.

Archive `frostyard/nbc` only after the EOL README is live, normal publication
and credential access are disabled, open items are dispositioned, active
supported-product dependencies are removed, and retained artifacts pass their
recovery check. Archive remains a separately approved GitHub action.

## Consequences

- Retirement can finish through direct coordination with the affected users.
- Frostyard avoids unnecessary telemetry, test breadth, and support process.
- The replacement path may be described only as narrowly as the evidence.
- An unknown user may learn about EOL only through public notices; that risk is
  accepted.
- Binary artifacts consume storage for one year; source and provenance remain
  indefinitely.

## Alternatives considered

- **Retain the enterprise-shaped evidence program.** Rejected as
  disproportionate to four directly reachable users.
- **Delete artifacts at EOL.** Rejected because migration, rollback, and
  historical verification still depend on them.
- **Delay EOL until every migration gate is green.** Rejected because support
  capacity and migration proof are separate decisions.

## References

- Implements through:
  [Plan 0006](../plans/0006-nbc-retirement-and-debian-suite-migration-fast-path.md)
- Builds on:
  [ADR-0027](0027-retire-fisherman-superseded-by-firn.md),
  [ADR-0028](0028-retire-snosi-install-superseded-by-firn.md), and
  [ADR-0031](0031-retire-dakota-secure-bootc-installer.md)
- Product decision:
  [Snosi ADR-0015](https://github.com/frostyard/snosi/blob/main/docs/adr/0015-retire-native-ab-images-and-nbc-installs.md)

