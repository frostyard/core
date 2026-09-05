# 0046 — Rename the cayo server image to floe

- **Status:** Accepted
- **Date:** 2026-09-05

## Context

Snosi publishes the headless server product as `cayo` in both bootc OCI and
native A/B forms. The name also appears in Firn, lab, Pilothouse, Frostyard's
websites, installed-system update configuration, GHCR package identities, and
the native artifact path on `repository.frostyard.org`.

The product needs one name across those repositories and artifacts. A floe is
a flat slab of floating sea ice that can bear weight. It fits the server's
role and keeps the shared naming relationship with Snow: "Snow falls, Floe
holds you up."

Two installed systems use cayo. One uses bootc and enforces an exact
signature-policy scope for `ghcr.io/frostyard/cayo`. The other uses native A/B,
where `cayo` is part of partition labels, sysupdate matching patterns, entry
tokens, and the publication path. Those facts rule out an unsequenced rename.

## Decision

Rename the headless server product from `cayo` to `floe` across active
Frostyard repositories and publication paths:

- The bootc image becomes `ghcr.io/frostyard/floe` and reports `floe` as its
  image identity.
- The native profile becomes `floe-ab`; its artifact channel moves to
  `os/native/v1/floe/x86-64/` and all labels, transfer patterns, and entry
  tokens use `floe`.
- Firn, lab, Pilothouse, `frostyard.github.io`, and `frostyard-org` adopt the
  new name. Old website routes redirect to their floe replacements.

The cutover follows a fixed order. Snosi first publishes one final cayo image
whose signature policy trusts both the cayo and floe GHCR repositories. Every
bootc cayo install must boot that release before the floe image is published.
After the rename, operators switch bootc systems to floe and prove a normal
floe-to-floe update. The cayo trust scope is removed only after both known
systems no longer need a cayo rollback deployment.

Native cayo installs do not change channels in place. Sysupdate instance
accounting depends on the existing cayo label pattern, so operators reinstall
them from the new ISO. The one known native cayo installation will reinstall
as bootc floe.

Old artifacts are frozen, not deleted:

- GHCR retains all `frostyard/cayo` digests because installed rollback
  deployments may reference them. The package stops receiving updates.
- `os/native/v1/cayo/` remains readable but receives no new artifacts.
- The archived pre-Snosi `frostyard/cayo` repository remains archived and
  unchanged.
- Fisherman, bootc-installer, and dakota-iso are dormant and superseded. Their
  cayo references remain historical and receive no rename work.

## Consequences

- The active server product has one identity, floe, across both transports and
  every current consumer.
- The bootc migration requires an operational checkpoint between the trust
  pre-staging release and the rename release. Skipping it can strand an
  installed system behind its exact repository policy.
- Native cayo installations require backup and reinstall rather than an
  update. No label or sysupdate channel migration mechanism will be built.
- Old GHCR and R2 artifacts consume storage indefinitely, but existing
  deployments and signed indexes remain usable for rollback and audit.
- Historical ADRs, plans, run records, and dormant repositories keep the old
  name. Permanent website redirects are the only active compatibility routes.

## Alternatives considered

- **Rename every publisher and consumer at once.** Rejected because a running
  cayo bootc image cannot pull from the floe repository until its exact
  signature policy trusts that repository.
- **Publish floe under the old artifact identities.** Rejected because it
  leaves cayo embedded in the active product contract and does not complete
  the rename.
- **Migrate native A/B labels and channels in place.** Rejected because
  sysupdate accounts for instances through the existing label pattern. A
  second pattern would describe a different channel, not rename the installed
  slots safely.
- **Delete old packages and native indexes after migration.** Rejected because
  bootc rollback deployments retain digest references and the signed native
  indexes are useful historical evidence.

## References

- Implementation plan: [Snosi cayo-to-floe rename plan](https://github.com/frostyard/snosi/blob/main/docs/plans/2026-08-26-cayo-floe-rename-plan.md)
- Builds on: [ADR-0006](0006-os-artifact-versions-are-utc-timestamps.md),
  [ADR-0009](0009-single-artifact-origin-repository-frostyard-org.md),
  [ADR-0015](0015-os-release-image-identity.md),
  [ADR-0017](0017-io-snosi-capability-labels-and-mechanics-tier.md),
  [ADR-0027](0027-retire-fisherman-superseded-by-firn.md),
  [ADR-0028](0028-retire-snosi-install-superseded-by-firn.md), and
  [ADR-0031](0031-retire-dakota-secure-bootc-installer.md)
