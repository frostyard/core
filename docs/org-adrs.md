# Org ADRs in core

Core is the home of the organization's ADRs. Every ADR in [adr/](adr/) is
org-wide: it binds core itself and every frostyard repository. Other
repositories link these ADRs from their own `docs/org-adrs.md`. The full index
is [README.md](README.md#decisions-adrs).

## Baseline decisions that bind core

These decisions make up the [repository baseline](specs/repository-baseline.md)
([ADR-0071](adr/0071-hold-every-code-repository-to-one-baseline.md)). Each line
names what the decision binds in core and where it lives here.

- [ADR-0018 — Org-wide agent instruction and knowledge surfaces](adr/0018-org-wide-agent-instruction-and-knowledge-surfaces.md)
  — `AGENTS.md` is the canonical instruction surface; the corrections inbox is
  [.memory/corrections.jsonl](../.memory/README.md).
- [ADR-0019 — Repository governance as machine-readable policy with risk tiers](adr/0019-governance-as-code-and-risk-tiers.md)
  — every PR declares a risk tier in
  [.github/pull_request_template.md](../.github/pull_request_template.md).
- [ADR-0021 — SHA-pinned actions and least-privilege CI workflows](adr/0021-sha-pinned-actions-and-least-privilege-ci.md)
  — every `uses:` in [.github/workflows/](../.github/workflows/) is a full
  commit SHA; workflows start from `permissions: {}`.
- [ADR-0025 — One docs/ tree per repository, in core's four-category shape](adr/0025-consolidate-repository-docs-into-docs.md)
  — this [docs/](README.md) tree holds adr, design, specs and plans, each with
  its `TEMPLATE.md`.
- [ADR-0029 — ACMM conformance via canonical aliases](adr/0029-acmm-conformance-via-canonical-aliases.md)
  — the alias symlinks `CLAUDE.md`, `GEMINI.md`, `.cursorrules`,
  `CONTRIBUTING.md`, `.github/copilot-instructions.md`,
  `docs/quality.md`, `docs/metrics.md`, `docs/review-rubric.md` and
  `tests/e2e/scaffold-tests`, and the `.claude/skills` alias, all point at
  canonical targets.
- [ADR-0040 — Publish the repository settings contract](adr/0040-publish-the-repository-settings-contract.md)
  — [SECURITY.md](../SECURITY.md) states the support policy, and private
  vulnerability reporting is on; core publishes the settings contract under
  [organization/](../organization/README.md).
- [ADR-0043 — Pin repository tools in mise and name the verify gate](adr/0043-pin-repository-tools-in-mise-and-name-the-verify-gate.md)
  — tool versions are pinned in [mise.toml](../mise.toml) and
  [mise.lock](../mise.lock); `npm run verify` is the verify gate.
- [ADR-0044 — Expose the make gate triad in every repository](adr/0044-expose-the-make-gate-triad-in-every-repository.md)
  — the [Makefile](../Makefile) has the `verify`, `check` and `ci` targets.
- [ADR-0051 — ADRs state facts only, not the process that produced them](adr/0051-adrs-state-facts-not-process.md)
  — an ADR in `adr/` states context, decision and consequences as facts.
- [ADR-0068 — Label pull requests that touch high-risk paths](adr/0068-label-pull-requests-that-touch-high-risk-paths.md)
  — core lists its risk globs in [.github/risk-paths.json](../.github/risk-paths.json);
  its caller [risk-paths-caller.yml](../.github/workflows/risk-paths-caller.yml)
  uses the local reusable workflow.
- [ADR-0071 — Hold every code repository to one baseline](adr/0071-hold-every-code-repository-to-one-baseline.md)
  — core carries the whole baseline: [LICENSE](../LICENSE) (MIT),
  [dependabot.yml](../.github/dependabot.yml), a
  [ci.yml](../.github/workflows/ci.yml) that runs `make ci`,
  [SECURITY.md](../SECURITY.md), no `CODEOWNERS`, and no leftover
  agent-framework tree. [test/repository-baseline.test.mjs](../test/repository-baseline.test.mjs)
  and [test/no-leftover-agent-trees.test.mjs](../test/no-leftover-agent-trees.test.mjs)
  hold core to the rows.
- [ADR-0072 — Write every README to one standard](adr/0072-write-every-readme-to-one-standard.md)
  — core's [README](../README.md) is of the `org` kind (row B17);
  [test/readme-check.test.mjs](../test/readme-check.test.mjs) holds it to
  the [README spec](specs/readme.md).
- [ADR-0073 — Let CI run the `make ci` targets as separate jobs](adr/0073-let-ci-run-the-make-ci-targets-as-separate-jobs.md)
  — core uses the first form: 1 `make ci` step in
  [ci.yml](../.github/workflows/ci.yml); `ciCoverageGaps` in
  [test/repository-baseline.test.mjs](../test/repository-baseline.test.mjs)
  checks both forms.

## Rows that do not apply to core

The [repository baseline](specs/repository-baseline.md) has 3 rows that do
not apply to core, because core has no Go module and is not a user-facing tool:

- **B8 (svu versions)** and **B11 (Go toolchain)** do not apply: core has no
  `go.mod` and makes no releases
  ([ADR-0012](adr/0012-svu-versioning-and-rolling-dev-prerelease.md),
  [ADR-0053](adr/0053-name-the-svu-config-svu-yml.md)).
- **B9 (tool documentation site)** does not apply: core is not a user-facing
  tool. It ships no command, application or service. Its user documentation is
  this [docs/](README.md) tree
  ([ADR-0070](adr/0070-build-tool-docs-sites-with-materialx-on-github-pages.md)).
