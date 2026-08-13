# Documentation

Docs are split by the question they answer:

| Directory | Question | Contents |
| --- | --- | --- |
| [adr/](adr/) | **Why** did we choose this? | Architecture Decision Records — immutable once accepted; superseded, never edited |
| [design/](design/) | **How** does it fit together? | Living documents describing the current architecture |
| [specs/](specs/) | **What exactly** is the contract? | Precise, testable interface definitions |
| [plans/](plans/) | **When/in what order** do we build? | Roadmaps and phase plans; updated as work lands |

## Index

### Decisions (ADRs)

- [0001 — Record architecture decisions](adr/0001-record-architecture-decisions.md)
- [0002 — Agent-portable instruction surface](adr/0002-agent-portable-instruction-surface.md)
- [0003 — Record image provenance in /usr/share/frostyard](adr/0003-image-provenance-in-usr-share-frostyard.md)
- [0004 — Product-namespaced filesystem paths, split by lifetime tier](adr/0004-product-namespaced-filesystem-tiers.md)
- [0005 — Transport discrimination by marker file and /run update-state contract](adr/0005-native-ab-marker-and-update-state-files.md)
- [0006 — OS artifact versions are 14-digit UTC timestamps](adr/0006-os-artifact-versions-are-utc-timestamps.md)
- [0007 — The Frostyard sysext filename pattern and derived versions](adr/0007-frostyard-sysext-filename-pattern.md)
- [0008 — Sysext distribution layout and update contract](adr/0008-sysext-distribution-and-update-contract.md)
- [0009 — repository.frostyard.org is the single artifact origin](adr/0009-single-artifact-origin-repository-frostyard-org.md)
- [0010 — Publish packages through the shared repogen action](adr/0010-publish-packages-via-repogen-to-r2.md)
- [0011 — Distro packages are named frostyard-&lt;tool&gt;](adr/0011-frostyard-prefixed-package-names.md)
- [0012 — svu-derived versions, make bump, and the rolling dev prerelease](adr/0012-svu-versioning-and-rolling-dev-prerelease.md)
- [0013 — Component releases trigger image rebuilds via repository_dispatch](adr/0013-release-fanout-via-repository-dispatch.md)
- [0014 — One GPG repository key, baked into images](adr/0014-single-gpg-trust-root.md)
- [0015 — os-release is the image identity surface](adr/0015-os-release-image-identity.md)
- [0016 — Reverse-DNS org.frostyard.* identifiers](adr/0016-reverse-dns-org-frostyard-identifiers.md)
- [0017 — io.snosi.* OCI capability labels and the mechanics QA tier](adr/0017-io-snosi-capability-labels-and-mechanics-tier.md)
- [0018 — Org-wide agent instruction and knowledge surfaces](adr/0018-org-wide-agent-instruction-and-knowledge-surfaces.md)
- [0019 — Repository governance as machine-readable policy with risk tiers](adr/0019-governance-as-code-and-risk-tiers.md)
- [0020 — Trust boundaries for AI automation in CI](adr/0020-ai-automation-trust-boundaries.md)
- [0021 — SHA-pinned actions and least-privilege CI workflows](adr/0021-sha-pinned-actions-and-least-privilege-ci.md)
- [0022 — make ci is the canonical gate; TestI* is reserved](adr/0022-make-ci-gate-and-test-naming-filter.md)
- [0023 — External downloads are version-pinned and checksum-verified](adr/0023-verified-pinned-downloads.md)
- [0024 — Rename the AI-facing docs directory from yeti/ to cairn/](adr/0024-rename-ai-docs-directory-to-cairn.md) *(superseded by 0025)*
- [0025 — One docs/ tree per repository, in core's four-category shape](adr/0025-consolidate-repository-docs-into-docs.md)
- [0026 — Distribute core agent skills to repos via sync PRs from core](adr/0026-distribute-core-skills-via-sync-prs.md)
- [0027 — Retire fisherman; firn is the frostyard bootc installer](adr/0027-retire-fisherman-superseded-by-firn.md)
- [0028 — Retire snosi-install; firn is the frostyard A/B installer](adr/0028-retire-snosi-install-superseded-by-firn.md)
- [0029 — ACMM conformance via canonical aliases](adr/0029-acmm-conformance-via-canonical-aliases.md)
- [0030 — Shipped systemd units never use RequiredBy= enablement](adr/0030-no-requiredby-enablement-in-shipped-units.md)
- [0031 — Retire Dakota's secure bootc installer; firn owns the path](adr/0031-retire-dakota-secure-bootc-installer.md)

### Design

- [Quality loop](design/quality-loop.md)
- [Skills sync operations](design/skills-sync-operations.md)

### Specs

- [PR review rubric](specs/pr-review-rubric.md)
- [PR acceptance metric](specs/pr-acceptance-metric.md)

### Plans

- [Org docs-shape and skills rollout](plans/0001-docs-shape-rollout.md)
- [Organization portfolio stewardship](plans/0002-org-portfolio-roadmap.md)

## Conventions

- **New docs start from their category's `TEMPLATE.md`** (in each directory).
- New decision → new ADR with the next number; if it reverses an old one, mark
  the old one `Superseded by NNNN` rather than editing it.
- Design docs are updated in place to always reflect reality.
- Specs change only alongside the code that implements them.
- Cross-links between categories are mandatory in both directions — see the
  documentation rules in [AGENTS.md](../AGENTS.md) (CLAUDE.md/GEMINI.md are
  symlinks to it, ADR-0002).
- Adding a doc means adding it to the index above.
- Conformance alias symlinks (`docs/quality.md`, `docs/metrics.md`,
  `docs/review-rubric.md` — [ADR-0029](adr/0029-acmm-conformance-via-canonical-aliases.md))
  are not docs and are not indexed — edit their canonical targets.
