# frostyard/core

The org-wide hub for the [frostyard](https://github.com/frostyard)
organization: shared agent skills, document and repo templates, org-level
authority, issues and discussions, and common assets. It contains no product
application code — other frostyard repos reference or copy what lives here.
Start at [docs/README.md](docs/README.md). Before a packaging, product-shape,
or priority decision, read [docs/tenets.md](docs/tenets.md).

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
- **Publishing a repository's `.deb` packages to repository.frostyard.org
  (register a producer, attest, `publish-deb` dispatch, component and
  codenames, prove installability)** →
  [.agents/skills/frostyard-apt-producer/SKILL.md](.agents/skills/frostyard-apt-producer/SKILL.md)
  — apt-publisher is the single writer
  ([ADR-0055](docs/adr/0055-publish-debian-packages-through-the-apt-publisher.md),
  [ADR-0059](docs/adr/0059-publish-image-only-packages-in-a-separate-apt-component.md)).
- **Designing any Frostyard-branded interface, page, mock, or asset** →
  [.agents/skills/frostyard-design/SKILL.md](.agents/skills/frostyard-design/SKILL.md)
  — brand law, tokens, guidelines, components, UI kits, hero art.
- **Adding a Frostyard-branded ProperDocs + MaterialX docs site to a tool
  repository** →
  [.agents/skills/frostyard-docs-site/SKILL.md](.agents/skills/frostyard-docs-site/SKILL.md)
  — applies the `scaffold/` payload as `site/` and the GitHub Pages workflow
  ([ADR-0070](docs/adr/0070-build-tool-docs-sites-with-materialx-on-github-pages.md)).
- **Creating or conforming a frostyard Go repository** →
  [.agents/skills/frostyard-go-repo/SKILL.md](.agents/skills/frostyard-go-repo/SKILL.md)
  — SDK-first layout, clix CLI, Makefile check gate, GoReleaser Pro + svu
  releases (extracted from updex).
- **General Go practice in a Go repository (style, naming, errors,
  concurrency, tests, lint, security, CLI, layout, dependencies)** → the
  20 vendored `.agents/skills/golang-*/SKILL.md` skills from
  samber/cc-skills-golang; their Frostyard override blocks and
  `frostyard-go-repo` win. Change them only per
  [docs/design/shared-skills.md](docs/design/shared-skills.md#vendored-go-skills),
  which also says how to refresh them from upstream.
- **Onboarding an existing repository into the fleet (core declaration,
  canonical surfaces, mise and Makefile gate, settings + merge queue,
  skills-sync enrollment)** →
  [.agents/skills/frostyard-onboard-repo/SKILL.md](.agents/skills/frostyard-onboard-repo/SKILL.md)
  — agent drafts and probes, Brian runs every state-changing command
  ([ADR-0040](docs/adr/0040-publish-the-repository-settings-contract.md),
  [ADR-0042](docs/adr/0042-adopt-a-merge-queue-on-the-default-branch.md),
  [enrollment spec](docs/specs/organization-repository-enrollment.md)).
- **Planning a multi-step or multi-repo project (a Desk plan thread)** →
  [.agents/skills/frostyard-plan-project/SKILL.md](.agents/skills/frostyard-plan-project/SKILL.md)
  — socratic interview first, decisions as asks anchored to plan sections,
  a task graph of one-PR tasks with evidence-shaped acceptance and release
  tasks at version boundaries, Brian's approval of one revision, then
  delivery and a whole-plan verification.
- **Writing, fixing or reviewing a repository's root `README.md` (a sweep
  issue for baseline row B17, a new repository)** →
  [.agents/skills/frostyard-readme/SKILL.md](.agents/skills/frostyard-readme/SKILL.md)
  — 1 template for each of 10 kinds, content moved to the docs site or
  `docs/`, and a read-only checker for rules R1 to R12
  ([ADR-0072](docs/adr/0072-write-every-readme-to-one-standard.md),
  [README spec](docs/specs/readme.md)).
- **Releasing a suite app (frostnotes, frostmail, frostread, lodge,
  porter): Flatpak candidate, clean-desktop gate, promotion and listing;
  the daemon's attested `.deb` and its snosi sysext** →
  [.agents/skills/frostyard-suite-app-release/SKILL.md](.agents/skills/frostyard-suite-app-release/SKILL.md)
  ([ADR-0058](docs/adr/0058-ship-suite-desktop-apps-as-flatpaks-and-services-as-sysexts.md),
  [ADR-0062](docs/adr/0062-make-desktop-suite-apps-standalone-flatpaks-with-opt-in-lodge.md)).
- **Writing, accepting, amending or superseding an ADR (core or
  repository-local)** →
  [.agents/skills/frostyard-write-adr/SKILL.md](.agents/skills/frostyard-write-adr/SKILL.md)
  — next free number, TEMPLATE, facts-only voice
  ([ADR-0051](docs/adr/0051-adrs-state-facts-not-process.md)), two-way
  links, index line, link-only maintenance
  ([ADR-0033](docs/adr/0033-link-maintenance-in-immutable-adrs.md)).
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
- Every frostyard code repository carries the
  [repository baseline](docs/specs/repository-baseline.md) (rows `B1` to
  `B18`: instruction surface, corrections inbox, docs shape, make gate,
  pinned actions, risk paths, PR template, svu, tool docs site, license,
  fleet Go toolchain, `ci.yml`, Dependabot, `SECURITY.md`, no `CODEOWNERS`,
  no leftover agent-framework trees, README, required status checks), with
  its named exemptions
  ([ADR-0071](docs/adr/0071-hold-every-code-repository-to-one-baseline.md),
  [ADR-0072](docs/adr/0072-write-every-readme-to-one-standard.md),
  [ADR-0076](docs/adr/0076-require-status-checks-on-every-default-branch.md)).
  `scripts/apply-triage-settings.sh` drafts the required-checks ruleset
  (dry run by default; an admin runs `--apply`), and
  `scripts/required-checks-survey.mjs` reads the live state, read only.
  The weekly conformance sweep files the gaps; a new row needs a new ADR.
  A row that restates an existing ADR keeps that ADR's full scope and every
  file it requires (B4 names `mise.toml` and `mise.lock` because ADR-0043
  does); narrowing a row needs an ADR that amends the cited one.
  `test/no-leftover-agent-trees.test.mjs` holds core itself to row B16, and
  `test/readme-check.test.mjs` holds core's `README.md` to row B17.
- ADRs record the decision, not how it was reached. State context, decision,
  and consequences as facts. No narration of who asked, who was consulted, or
  the author's process; that belongs in the PR description
  ([ADR-0051](docs/adr/0051-adrs-state-facts-not-process.md)).

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

- Tools are pinned in [mise.toml](mise.toml)/[mise.lock](mise.lock)
  (ADR-0043): `mise install` provisions the same Node and jq releases Snowcat
  workers, CI, and developers run. `npm run verify` is the credential-free,
  non-mutating gate a read-only reviewer can run (`check:docs`,
  `check:organization`, `test` — nothing formats or writes); `npm run check`
  is the same gate today and is what CI calls, since this repository has
  nothing beyond `verify` for a developer gate to add. `make verify` / `make
  check` / `make ci` are the entry points CI, workers, reviewers, and the
  organization gate invoke ([ADR-0044](docs/adr/0044-expose-the-make-gate-triad-in-every-repository.md));
  each wraps its like-named npm script.
- CI gate: [.github/workflows/ci.yml](.github/workflows/ci.yml) runs `npm ci &&
  make ci` at the root (strict organization authority via
  `scripts/check-organization.mjs`; every doc indexed, every relative link
  resolving, every symlink intact via `scripts/check-docs.mjs`; thresholds in
  `.coverage-thresholds.json`, `never_relax`) and the docs-site scaffold
  build (`node --test
  .agents/skills/frostyard-docs-site/tests/*.test.mjs` builds the MaterialX
  scaffold with `properdocs --strict`). Run both locally before pushing.
- Author repository declarations and canonical surface contracts only under
  [`organization/`](organization/README.md); validate live records and their
  conformance fixtures with `npm run check:organization`
  ([ADR-0035](docs/adr/0035-author-organization-authority-as-strict-json.md)).
  `npm run check:fleet` then checks each `fleet_state: enabled` declaration's
  default branch over the network for `mise.toml`, `mise.lock`, and its
  verify gate ([ADR-0043](docs/adr/0043-pin-repository-tools-in-mise-and-name-the-verify-gate.md)) —
  presence only, run as CI's `fleet-conventions` job, not part of `check`/`verify`.
- Declare every GitHub Actions secret's expiry in
  [.github/secrets-expiry.json](.github/secrets-expiry.json) — metadata only,
  closed schema, `warn_days_before` at least 30 and `never_relax` true
  ([ADR-0045](docs/adr/0045-guard-actions-secret-expiry-in-the-repository.md)).
  `npm run check:secret-expiry` fails once a secret is inside its rotation
  window or past its expiry; `.github/workflows/secrets-expiry.yml` runs it
  daily. It is deliberately outside `verify`/`check` so a pending rotation
  never blocks unrelated PRs. Never read, print, or fingerprint the secret
  itself; rotate it in repository settings and update `expires_on` in the same
  PR.
- Risk paths follow
  [ADR-0068](docs/adr/0068-label-pull-requests-that-touch-high-risk-paths.md),
  [ADR-0078](docs/adr/0078-sort-pull-requests-by-levels-l1-to-l4.md)
  and the [risk-paths spec](docs/specs/risk-paths.md): `.github/risk-paths.json`
  (schema version 2) gives each glob a level from L1 to L4; the floors live
  in `ORG_FLOORS` in `scripts/lib/risk-paths.mjs`. Keep the exports
  `validateRiskPaths`, `matchGlob`, `parseStrictJson` and `matchFiles` and
  their version 1 results: other repositories vendor the library with a
  `sha256` pin. `.github/workflows/pr-triage.yml` embeds
  `scripts/lib/risk-paths.mjs` and `scripts/lib/pr-triage.mjs` verbatim. Edit
  those libraries, then run `npm run sync:risk-paths-workflow`; never edit an
  embedded copy by hand. `npm run check:risk-paths` (in `verify`) fails when a
  copy drifts.
- Conformance alias symlinks are listed in
  [ADR-0029](docs/adr/0029-acmm-conformance-via-canonical-aliases.md) —
  edit their canonical targets, never the aliases.
- Corrections go to 1 file under `.memory/corrections/` (five-field
  schema, canonical form, [ADR-0018](docs/adr/0018-org-wide-agent-instruction-and-knowledge-surfaces.md),
  [ADR-0081](docs/adr/0081-store-each-correction-in-a-file-of-its-own.md);
  `scripts/new-correction.mjs` writes one); in a repository that still has
  `.memory/corrections.jsonl` (core does, until its move PR), 1 line
  appended there. Promote into this file, docs, or skills — never
  duplicate without setting `promoted_to`.
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
