# frostyard/core

The org-wide hub for the [frostyard](https://github.com/frostyard)
organization: shared agent skills, document and repo templates, org-level
authority, issues and discussions, and common assets. It contains no product
application code — other frostyard repos reference or copy what lives here.
Start at [docs/README.md](docs/README.md).

This file (`AGENTS.md`) is the CANONICAL agent instructions — `CLAUDE.md`,
`GEMINI.md`, `CONTRIBUTING.md`, `.cursorrules`, and
`.github/copilot-instructions.md` are symlinks to it, and `.claude/skills`
symlinks to `.agents/skills/`
([ADR-0002](docs/adr/0002-agent-portable-instruction-surface.md),
[ADR-0029](docs/adr/0029-acmm-conformance-via-canonical-aliases.md)). Edit
only the canonical paths; keep content tool-agnostic.

## Skills (follow these for common tasks)

Step-by-step procedures live in [.agents/skills/](.agents/skills/); follow
them rather than improvising, whichever agent you are:

<!-- One bullet per skill: **When to use it** → [.agents/skills/<name>/SKILL.md].
Add a skill whenever you find yourself re-explaining a multi-step procedure.
Start from .agents/skills/TEMPLATE/SKILL.md. -->

- **Bringing a repo to Hive ACMM conformance (open `acmm` issues,
  fleet-management prerequisites)** →
  [.agents/skills/frostyard-acmm-conformance/SKILL.md](.agents/skills/frostyard-acmm-conformance/SKILL.md)
  — canonical aliases per
  [ADR-0029](docs/adr/0029-acmm-conformance-via-canonical-aliases.md), real
  trees for directory criteria, docs-integrity gate.
- **Designing any Frostyard-branded interface, page, mock, or asset** →
  [.agents/skills/frostyard-design/SKILL.md](.agents/skills/frostyard-design/SKILL.md)
  — brand law, tokens, guidelines, components, UI kits, hero art.
- **Adding a Frostyard-branded Astro docs site to a project repo** →
  [.agents/skills/frostyard-docs-site/SKILL.md](.agents/skills/frostyard-docs-site/SKILL.md)
  — applies the `scaffold/` payload as `site/`.
- **Creating or conforming a frostyard Go repository** →
  [.agents/skills/frostyard-go-repo/SKILL.md](.agents/skills/frostyard-go-repo/SKILL.md)
  — SDK-first layout, clix CLI, Makefile check gate, GoReleaser Pro + svu
  releases (extracted from updex).
- **Onboarding an existing repository into the fleet (core declaration,
  canonical surfaces, settings + merge queue, Snowcat enrollment and queue
  opt-in, proven work loop)** →
  [.agents/skills/frostyard-onboard-repo/SKILL.md](.agents/skills/frostyard-onboard-repo/SKILL.md)
  — agent drafts and probes, operator runs every state-changing command
  ([ADR-0040](docs/adr/0040-publish-the-repository-settings-contract.md),
  [ADR-0042](docs/adr/0042-adopt-a-merge-queue-on-the-default-branch.md),
  [enrollment spec](docs/specs/organization-repository-enrollment.md)).
- **Planning a multi-step or multi-repo project into sequenced
  Snowcat-importable issues** →
  [.agents/skills/frostyard-plan-project/SKILL.md](.agents/skills/frostyard-plan-project/SKILL.md)
  — socratic interview first, umbrella issue + `depends-on:` slice issues,
  evidence-shaped criteria, release slices at version boundaries, human
  approval before any issue is created (snowcat ADR-0066).
- **Scaffolding or updating a repo's docs/ tree, or retiring a legacy
  `yeti/`/`cairn/` tree** →
  [.agents/skills/frostyard-repo-docs/SKILL.md](.agents/skills/frostyard-repo-docs/SKILL.md)
  — core's four-category shape (adr/design/specs/plans) in every repo,
  agent-maintained
  ([ADR-0025](docs/adr/0025-consolidate-repository-docs-into-docs.md);
  replaces the retired yeti doc-maintainer).

## Working conventions (org-wide)

- The org **squash-merges PRs**: branch every PR off `main`, never stack a
  branch on another PR's branch — after the base squash-merges, the stacked
  PR conflicts and needs `git rebase --onto origin/main <old-base-tip>`.
- Current org-wide work is sequenced in
  [docs/plans/0001-docs-shape-rollout.md](docs/plans/0001-docs-shape-rollout.md);
  update it as phases land.
- Every PR declares its risk tier (highest applicable, never lower) in the
  PR template's Risk tier section; reviews apply
  [docs/specs/pr-review-rubric.md](docs/specs/pr-review-rubric.md)
  ([ADR-0019](docs/adr/0019-governance-as-code-and-risk-tiers.md)).

## Code conventions (live — the code exists)

<!-- The most important section. Rules here must describe the code AS IT IS,
not aspirations — an agent that follows a stale rule produces broken work.
Graduate a rule into this list only when the code enforcing or exemplifying
it has landed; until then it lives in a design doc as intent.

Write rules imperatively and concretely, each with enough mechanism to be
followed without asking ("Storage only via db.Open(slug, migrations)" — not
"use the database layer"). Point at one canonical example in the code for
every structural rule. Rules that remove a degree of freedom are the
valuable ones: every choice an agent doesn't have to make is a failure mode
removed. -->

- CI gate: [.github/workflows/ci.yml](.github/workflows/ci.yml) runs `npm ci &&
  npm run check` at the root (strict organization authority via
  `scripts/check-organization.mjs`; every doc indexed, every relative link
  resolving, every symlink intact via `scripts/check-docs.mjs`; thresholds in
  `.coverage-thresholds.json`, `never_relax`) and the docs-site scaffold
  e2e suite (`npm ci && npm test` in
  `.agents/skills/frostyard-docs-site/scaffold/`). Run both locally before
  pushing.
- Author repository declarations and canonical surface contracts only under
  [`organization/`](organization/README.md); validate live records and their
  conformance fixtures with `npm run check:organization`
  ([ADR-0035](docs/adr/0035-author-organization-authority-as-strict-json.md)).
- Conformance alias symlinks are listed in
  [ADR-0029](docs/adr/0029-acmm-conformance-via-canonical-aliases.md) —
  edit their canonical targets, never the aliases.
- Corrections go to `.memory/corrections.jsonl` (append-only five-field
  schema, [ADR-0018](docs/adr/0018-org-wide-agent-instruction-and-knowledge-surfaces.md));
  promote into this file, docs, or skills — never duplicate without
  setting `promoted_to`.
- Task runbooks live in [.github/prompts/](.github/prompts/README.md) as
  `*.prompt.md`; rules stay here.

## Repository boundary

This repo hosts org-wide shared material only:

- **In scope:** agent skills (`.agents/skills/`), document/repo templates
  (`templates/`), shared assets like logos and badges (`assets/`), org-level
  docs (`docs/`), machine-readable organization authority (`organization/`),
  repository-support validation (`scripts/` and `test/`), and org-wide issues
  and discussions on GitHub.
- **Out of scope:** application code, secrets or credentials, personal data,
  worker execution state, and repository-specific implementation or policy
  instances. Organization enrollment declarations may identify one repository;
  code and local policy remain in the repository they serve.
- **This repository's own policy instance:** `policies/agent-governance.json`
  is core's canonical agent-governance surface under its own
  repository-surfaces contract v1; Snowcat reads it at the observed
  default-branch head when enrolling core in the fleet. Deny by default;
  read, write, and run-tests allowed; issues, pull requests, and follow-ups
  review-required; review-required at high risk: workflows and the scripts
  that mutate GitHub state, the organization authority tree, the shared
  skills and templates every repository receives, and the validators and
  tests that gate them. Change it only alongside the matching ADR or design
  change.

## Documentation rules (enforced)

Docs live in `docs/` in four categories. **Every new doc starts from its
category's `TEMPLATE.md`** and follows its structure:

- `docs/adr/` — why we decided. Semantically immutable once Accepted;
  [link-only maintenance](docs/adr/0033-link-maintenance-in-immutable-adrs.md)
  preserves navigability, while reversals are new ADRs that mark the old one
  Superseded.
- `docs/design/` — how it fits together. Living; updated in place to match
  reality.
- `docs/specs/` — exact contracts. Change only alongside implementing code.
- `docs/plans/` — order of work. Phases with "Done when" outcomes.

### Cross-linking is mandatory

A doc without its required links is incomplete — do not finish a docs change
until they exist, in both directions:

- **ADR** → links every design doc/spec it shapes, and prior ADRs it builds on.
- **Design doc** → links the ADR(s) providing its rationale, the spec(s)
  pinning its contracts, and the roadmap phase that builds it.
- **Spec** → links its motivating ADR(s) and the design doc showing where it
  fits.
- **Plan** → every phase links the design docs/specs it implements; resolved
  open questions become ADRs.

When you touch a doc, verify its links still hold (targets exist, section
anchors valid) and add the back-links on the targets. Use relative paths.

### Housekeeping

- New doc ⇒ add a line to the index in [docs/README.md](docs/README.md).
- New significant decision ⇒ new ADR *first*, then update the affected design
  docs/specs in the same change.
- Convert relative dates ("next weekend") to absolute dates in all docs.
