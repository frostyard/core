# Plan: Post-NBC bootc-only transition (Snosi/Firn)

**Status:** Draft. This plan sequences Snosi/Firn bootc-only operations after
the 2026-09-30 NBC/native A/B support cutoff in
[ADR-0047](../adr/0047-retire-nbc-on-a-proportional-fast-path.md). It
coordinates with [Plan 0006](0006-nbc-retirement-and-debian-suite-migration-fast-path.md)
but does not replace its Debian-suite work or decide retention policy.
[ADR-0050](../adr/0050-replace-nbc-retention-date-with-a-completion-condition.md)
is Accepted and its outside-`stable` completion conditions still apply;
[ADR-0052](../adr/0052-remove-nbc-artifact-retention-gates.md) is Proposed,
not operative. Four-user outreach and readiness are support work, **not** a
new artifact-retention condition. The support cutoff does not wait for a
readiness pass, and a failed case must be disclosed rather than hidden.

This is an order of work, not production authority. Approval or merge of this
plan authorizes no production writes, signing or signed-repository mutation,
publication, artifact deletion, credential change, or repository archival.
Each later action needs its own approval; Brian separately authorizes exact
emergency publications and any proposed object disposal or archive. Request
Murbella's Snosi and Sheeana's Firn technical review, Ben's image/sysext
architecture input, and Odrade's cross-repository coordination before
presenting production actions for approval.

## Evidence boundary

- [ADR-0046](../adr/0046-rename-cayo-server-image-to-floe.md) documents a
  bootc cayo-to-floe image switch after signature-policy pre-staging and an
  update proof; **do not** describe existing bootc hosts as necessarily
  requiring reinstall. Native cayo A/B channel/label migration instead needs
  backup and fresh bootc install. The
  [Snosi migration runbook](https://github.com/frostyard/snosi/blob/main/docs/nbc-to-bootc-migration.md)
  must be reconciled with the currently published Firn installer rather than
  treated as proof of today's ISO or installed-host procedure.
- [ADR-0009](../adr/0009-single-artifact-origin-repository-frostyard-org.md)
  defines the origin and namespaces but says the **bucket**, not git, is the
  publication source of truth. Historical `snosi-native-installer_*` media
  and the live Firn ISO are different lineages even when installer paths
  overlap. [ADR-0031](../adr/0031-retire-dakota-secure-bootc-installer.md)
  retired Dakota's fisherman-derived test-only installer adapters, **not**
  dakota-iso's separate secure-media-build role. These decisions alone do not
  establish which objects exist today.
- Before promoting a catalog, declaring readiness, or asking Brian to delete,
  Snosi/Firn owners must confirm dated claims against read-only,
  commit-pinned source, publication manifests and run records (including
  failures), plus current public/bucket observations. A historical CI pass,
  fixture/static-contract check, VM/lab run, or unpublished ISO is not a
  successful production-media, real-hardware run. Record source commit,
  observation date, run/artifact digests and tested hardware for every claim.

## Phase 1 — Post-cutoff notices and user disposition

- After 2026-09-30 issue a durable public EOL notice and direct notice to
  Brian and the other three known users: no routine NBC/native A/B support or
  security updates; supported replacement is the corresponding bootc product
  installed with Firn. Give a fresh-install, external backup/restore and
  verification checklist, the risk of overwriting the target, and best-effort
  help through 2026-10-31 without promising continued NBC support.
- Record each user's in-use product and hardware class, migration disposition
  (including open or declined), and whether assistance is needed, as
  [ADR-0047](../adr/0047-retire-nbc-on-a-proportional-fast-path.md) requires.
  Include specific Secure Boot or sysext needs where reported; do not create
  fleet telemetry or reinterpret an open disposition as an artifact-retention
  release. Feed reported classes into Phase 4, not into a shifted EOL date.
- **Done when:** the public and four direct notices have dated evidence and a
  recorded disposition/help state for each known user (open states explicitly
  shown); backup and reinstall instructions point to the currently supported
  installer, with any unproven path labeled as such.

## Phase 2 — Stop routine native A/B publication

- Propose separately approved disabling of routine NBC package builds and
  native A/B image publication **after** the cutoff and notices, including
  the specific workflows, destinations, credentials and affected consumers.
  Do not treat this as permission to mutate a signed repository, delete
  existing packages or objects, or archive a repository. Existing debs may
  remain. Plan 0006 owns the parallel explicit-suite and archive sequencing;
  [ADR-0048](../adr/0048-publish-debian-packages-to-explicit-codenames.md)
  rejects `stable` as a write target.
- Preserve ADR-0047's narrow emergency exception: Brian's written approval
  identifies the **exact** artifact, reason, digest, affected users, test
  evidence and rollback before any post-cutoff publication. Keep the normal
  path stopped without silently disabling that separately authorized route.
- **Done when:** an approved, independently executed shutdown has recorded
  workflow/credential/publication-state evidence for each routine producer,
  no routine NBC/native A/B publication remains, and the separately approved
  exact-artifact emergency path and existing readable recovery material are
  documented. A proposal alone does not satisfy this phase.

## Phase 3 — Align Snosi/Firn operator surfaces

- In Snosi/Firn-owned changes reconcile the
  [migration runbook](https://github.com/frostyard/snosi/blob/main/docs/nbc-to-bootc-migration.md)
  with [Snosi installing guidance](https://github.com/frostyard/snosi/blob/main/docs/installing.md)
  and the live Firn ISO: document native A/B-to-bootc backup/fresh install,
  existing bootc update and rollback separately, the last-resort NBC reinstall
  and its dependency on old media, and any unsupported convenience or failed
  recovery path. Do not revive fisherman-derived installer adapters or confuse
  their retirement with Dakota's media-build responsibility.
- Propose bootc-only supported choices in the Snosi catalog and Firn ISO,
  remove or quarantine legacy Firn A/B recipes/selection paths as separately
  approved implementation work, and test what actually ships. Do **not**
  delete or retire the live Firn ISO when retiring historical native installer
  media. Preserve historical evidence and document any compatibility impact.
  Decide the pinning question below **before** catalog promotion, applying
  [ADR-0023](../adr/0023-verified-pinned-downloads.md)'s verified-pinned
  download contract where it governs a build/workflow fetch.
- **Done when:** reviewed Snosi/Firn runbook, catalog, ISO selection and recipe
  changes agree on supported bootc choices and backup/recovery behavior; the
  published Firn ISO still installs the intended product, and the recorded
  pinning decision and verification evidence match the promoted catalog.

## Phase 4 — Prove readiness for reported configurations

- For **each product/hardware class actually reported in use** in Phase 1,
  capture [ADR-0047](../adr/0047-retire-nbc-on-a-proportional-fast-path.md)'s
  full 48-hour normal-use period spanning a real publication, an install to a
  blank target **from the published Firn ISO**, an installed-host update to a
  real published image, and a user-data-preserving rollback. Distinguish
  bootc image switching after trust-policy pre-staging (ADR-0046) from native
  A/B conversion; do not impose fresh reinstall on every existing bootc host.
- In the applicable secure configuration record real-hardware Secure Boot
  enforcement, MOK enrollment and TPM/LUKS unlock/recovery observations across
  install, update and rollback; verify signed sysext origin/signature,
  activation and update on the installed image. Preserve failure and recovery
  traces, expected digests, product/hardware/firmware and public media IDs.
  Track the [Firn roadmap](https://github.com/frostyard/firn/blob/main/docs/plans/roadmap.md)'s
  real-hardware installation acceptance separately from fixture/VM/lab lanes.
- **Done when:** each in-use class has dated, commit/run/digest-pinned
  published-media real-hardware install, published-image update, rollback and
  48-hour evidence, with Secure Boot/MOK/TPM and signed sysext observations
  for the classes using them; any failed or missing case is disclosed to the
  affected user as a specific limitation rather than claimed green. Fixture,
  static, VM/lab and unpublished-media passes are recorded as lower-tier
  evidence, never substituted for production proof. No enterprise-scale
  matrix or new fleet telemetry is required.

## Phase 5 — Inventory before any disposal request

- Create a reviewable **object-by-object** inventory from read-only bucket
  listing, public origin responses and historical publication manifests;
  reconcile discrepancies and missing/deleted objects before calling it
  exhaustive. Enumerate actual published keys and versions, not inferred
  names: `os/native/v1/<product>/x86-64/` including historical `cayo` and
  any `floe` or Snow variants actually found; `isos/` and `isos/native/v1/`
  including `snosi-native-installer_*` separately from live Firn media;
  channel `SHA256SUMS` and detached `SHA256SUMS.gpg`, stable-name redirects
  and pointers, `manifests/` and every referenced checksum/signature. Include
  any GHCR digest or other external recovery reference implicated by the
  objects, without treating an R2 listing as a registry listing.
- For **each exact key/version/digest**, record producer repository/commit and
  manifest/run, public URL, current consumers and signed-index or rollback
  references, user/runbook reliance (especially §8's last-resort NBC
  reinstall), verification and recoverability from the public origin, and
  proposed keep/replace/delete disposition with consequences if unavailable.
  Mark unknown provenance or inaccessible listings **unverified**, not empty.
  Surface installed rollback/recovery risks and open user dispositions to
  Brian before requesting separate per-object authorization; never infer
  permission from a retention rule ending. Retain Git history, source tags
  and the source-commit/artifact-digest manifest indefinitely under ADR-0047.
- Protect signed `stable` metadata and **every** referenced `pool/` package
  byte, even outside `dists/`, readable and unchanged through at least
  2027-09-30 under
  [ADR-0048](../adr/0048-publish-debian-packages-to-explicit-codenames.md).
  Existing debs may remain. Until Proposed ADR-0052 is Accepted,
  [ADR-0050](../adr/0050-replace-nbc-retention-date-with-a-completion-condition.md)'s
  outside-`stable` disposition and documentation completion conditions remain
  operative; four-user **readiness** is independent of those retention gates.
  Inventory is not a delete instruction and the live Firn ISO is not a
  retiring native installer object.
- **Done when:** bucket reality and manifests have been reconciled into an
  auditable exact-object ledger with unresolved gaps explicit, stable-suite
  protection and runbook/rollback dependencies marked, and Brian has the
  risks and a per-object proposal for a **separate** authorization decision.
  No deletion or archive is a done-when requirement or authorized by this
  plan's approval or merge.

## Later / ideas

- Expand hardware coverage only for demonstrated needs beyond the reported
  classes; keep failed/unproven cases visible until resolved.

## Open questions

- **Which immutable Firn package version is built into the published ISO, and
  is the install-time GHCR catalog bound to a tested digest rather than a
  floating tag?** Snosi/Firn (Murbella and Sheeana, with Ben's architecture
  input) decide and record the owner, pin/update mechanism, verification and
  rollback before Phase 3 catalog promotion; align build/workflow fetches
  with [ADR-0023](../adr/0023-verified-pinned-downloads.md). Do not presume
  the current ISO or catalog is pinned without commit- and artifact-pinned
  evidence; record an architecture change in the product repository.

## References

- Implements the post-cutoff and migration-readiness portions of
  [ADR-0047](../adr/0047-retire-nbc-on-a-proportional-fast-path.md); preserves
  [ADR-0048](../adr/0048-publish-debian-packages-to-explicit-codenames.md)'s
  signed-`stable` floor and coordinates with
  [Plan 0006](0006-nbc-retirement-and-debian-suite-migration-fast-path.md).
- Retention boundary: Accepted
  [ADR-0050](../adr/0050-replace-nbc-retention-date-with-a-completion-condition.md);
  Proposed, not operative
  [ADR-0052](../adr/0052-remove-nbc-artifact-retention-gates.md).
- Artifact and installer context:
  [ADR-0009](../adr/0009-single-artifact-origin-repository-frostyard-org.md),
  [ADR-0023](../adr/0023-verified-pinned-downloads.md),
  [ADR-0031](../adr/0031-retire-dakota-secure-bootc-installer.md),
  [ADR-0046](../adr/0046-rename-cayo-server-image-to-floe.md),
  [Snosi ADR-0015](https://github.com/frostyard/snosi/blob/main/docs/adr/0015-retire-native-ab-images-and-nbc-installs.md),
  [Snosi migration runbook](https://github.com/frostyard/snosi/blob/main/docs/nbc-to-bootc-migration.md),
  [Firn roadmap](https://github.com/frostyard/firn/blob/main/docs/plans/roadmap.md).
