# Plan: Post-NBC bootc-only transition (Snosi/Firn)

**Status:** Implementation plan. This document records order and gates; it
does not itself authorize release, publication, credential, or hardware
qualification actions. It does not create new technical or support-policy
requirements: every phase tracks resolution of a gap already named in
Snosi's or Firn's own design docs, ADRs, or roadmap, or an existing gate
already accepted in [ADR-0047](../adr/0047-retire-nbc-on-a-proportional-fast-path.md).
Where a phase requires a new decision, it is named as an open question for
that repository's own owner, not decided here.

This plan covers what "bootc-only" means to *operate*, after ADR-0047's
2026-09-30 NBC/native-A/B support cutoff, as a distinct question from
[Plan 0006](0006-nbc-retirement-and-debian-suite-migration-fast-path.md)'s
retirement/retention sequencing. Plan 0006 answers "how do we wind NBC down
safely." This plan answers "what has to be true for Snosi-on-Firn to be the
sole supported product," and tracks the gap between the support decision
already made (Snosi ADR-0015) and current production-readiness evidence.

## Verified baseline

Observations below are current as of **2026-09-23**, drawn directly from
Snosi (Murbella) and Firn (Sheeana):

- Snosi ADR-0015 already ends native A/B/NBC support on 2026-09-30; bootc is
  the only path going forward regardless of this plan. That decision is not
  reopened here.
- Two distinct installer-ISO lineages exist and must not be conflated: the
  retiring native A/B installer media (`snosi-native-installer_*`, in scope
  of ADR-0047/0050/0052's retention rules) and the current Firn installer ISO
  (`shared/firn-installer/`, published under `isos/native/v1/`), which is
  live production infrastructure outside those ADRs' retention/disposal
  scope — though ADR-0047 separately names it as the supported migration
  path and its evidence source.
- Migration is destructive fresh install, twice over: neither an NBC/native-A/B
  host, nor an existing ordinary bootc host, converts in place. The
  intended path is external backup → boot the Firn installer ISO → fresh
  whole-disk `bootc install` → restore operator data/configuration, per
  Snosi's own `docs/installing.md` ("Firn is the supported installer for
  every published Snosi image family"). [ADR-0031](../adr/0031-retire-dakota-secure-bootc-installer.md)
  separately made Firn "the sole Frostyard installer for secure bootc
  images," retiring only Dakota's test-only secure-installer adapter suite
  that invoked fisherman; it explicitly preserves dakota-iso's own secure
  image/media-build role, which is a distinct responsibility from which
  program performs the install. Firn supplies the installer binary, kiosk
  unit, and install contracts
  ([Firn ADR-0010](https://github.com/frostyard/firn/blob/main/docs/adr/0010-single-installer-iso-in-snosi.md));
  Snosi owns ISO assembly, payload, trust material, signing, publication, and
  ISO end-to-end testing.
- **Known documentation gap:** Snosi's
  [migration runbook](https://github.com/frostyard/snosi/blob/main/docs/nbc-to-bootc-migration.md)
  itself still names "the bootc-installer live ISO (frostyard forks of
  `bootc-installer`/`fisherman`; ISO built from `frostyard/dakota-iso`)" as
  the installer media, and contains no mention of Firn anywhere in the file
  — it missed the Firn migration sweep the rest of Snosi's docs tree
  received. This is the authoritative operator-facing migration procedure,
  and its naming of the retired fisherman-derived installer program
  contradicts `docs/installing.md`'s current statement that Firn is the
  supported installer. (dakota-iso's own secure-media-build role is
  separately retained per ADR-0031 and is not itself in question.) Closing
  this gap is
  Snosi's own documentation fix, tracked explicitly in Phase 3 below rather
  than left implicit.
- The **ordinary** (non-secure) bootc install/update path is validated:
  QEMU/KVM install proof and real published-image update/rollback evidence
  exist
  ([Snosi bootc migration record](https://github.com/frostyard/snosi/blob/main/docs/2026-07-03-bootc-migration-record.md),
  migration runbook above). This is the basis for the existing migration
  runbook.
- The **secure** bootc path (LUKS/MOK/TPM install, update, rotation,
  recovery) is explicitly marked `BLOCKED:` in
  [Snosi's build-pipeline design doc](https://github.com/frostyard/snosi/blob/main/docs/design/build-pipeline.md),
  pending "a Firn-native Snosi lifecycle lane and authorized secure
  artifacts." Only fixture/static contracts are complete; live release
  evidence is not yet proven.
- Firn's own real-hardware install-acceptance gate
  ([Firn roadmap](https://github.com/frostyard/firn/blob/main/docs/plans/roadmap.md),
  Phase 7) is still "in progress." Its stated done-when criterion is that the
  single snosi installer ISO installs both image families successfully on
  real hardware. Firn's automated evidence (RAM-ISO install,
  encryption/TPM, Secure Boot enforcement, boot verification) is strong in
  VM/lab conditions; hosted CI does not execute the root/KVM end-to-end
  suite, and no physical-hardware qualification matrix is recorded in either
  repository.
- The Firn installer ISO is built, has a working CI pipeline (build → boot
  smoke + public-origin verify → promote to a protected environment), and is
  published — but is not confirmed pinned to a specific tested Firn release:
  the ISO resolves `frostyard-firn` from the APT repo at build time with no
  visible version pin, and its shipped catalog (`catalog.json`) points bootc
  products at floating `:latest` GHCR tags rather than digests.
- Firn's supported envelope, as currently evidenced
  ([Firn ADR-0004](https://github.com/frostyard/firn/blob/main/docs/adr/0004-single-installer-scope-and-support-matrix.md)):
  UEFI only (no BIOS); x86-64 only (arm64 is an unscoped roadmap idea, not
  demonstrated); root filesystem btrfs, xfs, or ext4 (ZFS rejected, no
  bootable path); RAID/LVM member target disks refused; Secure Boot requires
  a human to complete MokManager enrollment on first boot (not unattended).
- Neither repository records a physical-device qualification matrix beyond
  Firn's Phase 7 criterion above: SATA, USB, eMMC targets, firmware
  diversity, Wi-Fi-only acquisition, GPU/vendor variation, and suspend/resume
  are unproven, not necessarily unsupported.
- Snosi's own migration runbook lists unresolved items ahead of fleet-wide
  migration: multi-hop upgrades of three or more hops, a `bootc upgrade
  :latest` registry-flow path blocked on an upstream bug, failure-injection
  testing, and a real-hardware soak of at least two weeks.
- ADR-0047's existing migration-readiness gate — unchanged by this plan —
  already requires, for each product/hardware class *reported in use by the
  four known users*: one installation from the published Firn ISO, one
  update to a real published image, one rollback preserving user data, and
  48 hours of normal use spanning at least one real publish. This plan does
  not expand that gate's scope beyond the four known users.
- Fisherman-era conveniences not carried into Firn: Windows-data import, OEM
  detection/Brew setup, audio/Plymouth polish, cache prewarming, and legacy
  recipe conversion. The plan's migration language must not imply any of
  these are available.

## Phase 1 — Record the release-pinning gap

- Observed gap: Snosi's installer-ISO build resolves `frostyard-firn` from
  the APT repo at build time with no visible version pin, and its shipped
  catalog references bootc images by floating `:latest` tag rather than
  digest. No cited Snosi or Firn decision currently requires a specific fix;
  no deadline or resolution is imposed by this plan.
- Source:
  [`mkosi.conf`](https://github.com/frostyard/snosi/blob/main/shared/firn-installer/mkosi.conf),
  [`catalog.json`](https://github.com/frostyard/snosi/blob/main/shared/firn-installer/catalog.json)
- **Done when:** this document records the gap (done, above). If Snosi or
  Firn later make their own decision closing it, link that decision here;
  this phase does not otherwise gate on one existing.

## Phase 2 — Close the secure-bootc-lifecycle blocker

- Snosi's build-pipeline design doc already names this blocker: the
  Firn-native Snosi lifecycle lane and its authorized secure artifacts do
  not yet exist. This phase tracks that blocker's resolution; its design and
  authorization are Snosi's and Firn's own decision, not specified here.
- Source:
  [Snosi build-pipeline design doc](https://github.com/frostyard/snosi/blob/main/docs/design/build-pipeline.md)
- **Done when:** Snosi's build-pipeline doc no longer marks secure bootc
  install/update/rotation/recovery as `BLOCKED:`, backed by live (not
  fixture-only) evidence.

## Phase 3 — Close the migration runbook's own open items and its Firn reference gap

- Snosi's migration runbook already names these as open: a 3+-hop upgrade
  proof, the upstream bug blocking `bootc upgrade :latest`, failure-injection
  testing, and a real-hardware soak of at least two weeks. This phase tracks
  their resolution by Snosi.
- Separately: the same runbook still names the retired fisherman-derived
  installer program as installer media and does not mention Firn anywhere,
  contradicting Snosi's own `docs/installing.md`. This phase tracks Snosi
  correcting the runbook to name Firn as the installer, consistent with what
  the rest of Snosi's docs tree already says. (dakota-iso's separate,
  retained secure-media-build role per ADR-0031 is not in question here.)
- Source:
  [Snosi migration runbook](https://github.com/frostyard/snosi/blob/main/docs/nbc-to-bootc-migration.md)
  §8 and its open-items list (upgrade/failure/soak items); lines naming the
  installer path (Firn reference gap);
  [docs/installing.md](https://github.com/frostyard/snosi/blob/main/docs/installing.md);
  [ADR-0031](../adr/0031-retire-dakota-secure-bootc-installer.md) (narrower
  context: retires only Dakota's test-only secure-installer adapter suite)
- **Done when:** the migration runbook's own open-items list is empty, or
  each remaining item is disclosed there as a named, accepted limitation;
  and the runbook names Firn as the installer program, not the retired
  fisherman-derived path.

## Phase 4 — Close Firn's Phase 7 and confirm ADR-0047's existing gate

- Firn's own roadmap already states Phase 7's done-when criterion: the
  single snosi installer ISO installs both image families successfully on
  real hardware. This phase tracks that criterion closing; the specific
  hardware coverage and test methodology remain Firn's decision.
- Confirm ADR-0047's existing migration-readiness gate (unchanged, not
  expanded here) is satisfied for each configuration reported in use by the
  four known users — this is Snosi's/Frostyard's existing proportional
  obligation, not a new one.
- Source:
  [Firn roadmap](https://github.com/frostyard/firn/blob/main/docs/plans/roadmap.md)
  Phase 7,
  [ADR-0047](../adr/0047-retire-nbc-on-a-proportional-fast-path.md)
  (migration-readiness gate)
- **Done when:** Firn's Phase 7 criterion is met, and ADR-0047's existing
  migration-readiness gate is satisfied for each in-use configuration or its
  limitation is disclosed directly to the affected user.

## Phase 5 — Declare and operate the bootc-only steady state

- Publish the transition status: fresh reinstall is the only migration
  mechanism; the UEFI/x86-64/filesystem/Secure-Boot support envelope
  evidenced above is stated plainly; backup/restore is the operator's
  responsibility; Firn provides no conversion or rollback path from
  native-A/B or NBC.
- Whether and when to remove native A/B installer choices from the live
  Firn ISO's catalog is Snosi's own decision; no cited source requires
  removal or ties it to this plan's Phases 1–4. ADR-0050's/ADR-0052's "NBC
  installer media" category — the retiring native-A/B installer product —
  remains governed separately by ADR-0047/0050/0052 and is a different
  artifact from the live ISO's catalog entries regardless of what Snosi
  decides here.
- Source:
  [ADR-0047](../adr/0047-retire-nbc-on-a-proportional-fast-path.md)
  (support cutoff, unaffected by this plan),
  [Firn ADR-0004](https://github.com/frostyard/firn/blob/main/docs/adr/0004-single-installer-scope-and-support-matrix.md)
  (support envelope)
- **Done when:** the published migration documentation and the Firn ISO's
  catalog agree with each other on one stated support envelope (whatever
  Snosi decides that envelope to be), and this plan's own Phase 1–4 status
  is stated accurately — open items disclosed, not silently treated as
  resolved.

## Later / ideas

- arm64 target support, if demonstrated need arises.
- A physical-device qualification matrix broader than Firn's own Phase 7
  criterion (additional storage controllers, firmware variants, GPU/vendor
  classes), if Firn's own roadmap adopts one.

## Open questions

- **Does Firn's release process pin a tested version into the ISO build, or
  is that solely Snosi's responsibility?** No deadline; a question for
  Sheeana and Murbella to resolve in their own repositories whenever they
  choose to.
- **Is arm64 support in scope at any horizon, or explicitly out of scope?**
  Decided by Snosi/Firn in their own process, not this plan; no deadline.
- **Who owns a physical-device qualification matrix broader than Firn's own
  Phase 7 criterion, if one is ever adopted?** Resolve by Firn, if and when
  Firn's own roadmap raises it.
- **Should Firn's Phase 7 hardware pass also rehearse operator backup/restore
  and document the MokManager first-boot step?** No cited Snosi/Firn source
  currently requires either; raised here as a recommendation for Firn/Snosi
  to accept, modify, or decline in their own process, not mandated by this
  plan.
- **What access or authorization might the Phase 7 hardware pass need from
  Brian, if any?** No cited source establishes this obligation or a
  deadline; an optional consideration for Brian, Murbella, and Sheeana to
  raise directly with each other if and when it becomes relevant.

## References

- Implements alongside:
  [ADR-0047](../adr/0047-retire-nbc-on-a-proportional-fast-path.md)
  (migration-readiness gate, unchanged),
  [ADR-0050](../adr/0050-replace-nbc-retention-date-with-a-completion-condition.md),
  [ADR-0052](../adr/0052-remove-outside-stable-completion-condition.md)
  (Proposed)
- Coordinates with:
  [Plan 0006](0006-nbc-retirement-and-debian-suite-migration-fast-path.md)
  (retirement/retention sequencing, a distinct question from this plan's
  production-readiness question)
- Product context:
  [Snosi migration runbook](https://github.com/frostyard/snosi/blob/main/docs/nbc-to-bootc-migration.md),
  [Snosi ADR-0015](https://github.com/frostyard/snosi/blob/main/docs/adr/0015-retire-native-ab-images-and-nbc-installs.md),
  [Snosi build-pipeline design doc](https://github.com/frostyard/snosi/blob/main/docs/design/build-pipeline.md),
  [Snosi bootc migration record](https://github.com/frostyard/snosi/blob/main/docs/2026-07-03-bootc-migration-record.md),
  [Firn roadmap](https://github.com/frostyard/firn/blob/main/docs/plans/roadmap.md)
  (Phase 7, real-hardware install acceptance),
  [Firn ADR-0004](https://github.com/frostyard/firn/blob/main/docs/adr/0004-single-installer-scope-and-support-matrix.md)
  (support envelope),
  [Firn ADR-0010](https://github.com/frostyard/firn/blob/main/docs/adr/0010-single-installer-iso-in-snosi.md)
  (ISO ownership split)
