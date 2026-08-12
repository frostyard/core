# 0029 — ACMM conformance via canonical aliases

- **Status:** Accepted
- **Date:** 2026-08-12

## Context

The Hive ACMM evaluation
([core#22–#40](https://github.com/frostyard/core/issues/22)) grades
repositories by checking that fixed paths exist — test suites, templates,
style configs, rubrics, metrics, agent-safety settings. Each criterion lists
acceptable paths and states "the content can follow your project's
conventions." This repo already holds canonical equivalents for much of the
list, at paths fixed by earlier decisions:
[ADR-0002](0002-agent-portable-instruction-surface.md) (one canonical
instruction file with tool-path symlinks),
[ADR-0018](0018-org-wide-agent-instruction-and-knowledge-surfaces.md)
(`.cursorrules` symlink, `.memory/corrections.jsonl` schema,
`.github/prompts/*.prompt.md`),
[ADR-0019](0019-governance-as-code-and-risk-tiers.md) (risk tiers,
deny-by-default agent limits, `never_relax` quality guardrails), and
[ADR-0025](0025-consolidate-repository-docs-into-docs.md) (the four-category
`docs/` shape). Duplicating content into ACMM's paths would guarantee drift —
exactly what ADR-0002 rejected.

## Decision

ACMM's required paths are satisfied by **committed relative symlinks to
canonical content** wherever a canonical equivalent exists, and by genuinely
new artifacts only where none does.

The alias table (edit the targets, never the aliases):

| Alias | Target | Criterion |
| --- | --- | --- |
| `CONTRIBUTING.md` | `AGENTS.md` | contributing guide (#26) |
| `.cursorrules` | `AGENTS.md` | cursor rules (#29; already ADR-0018) |
| `docs/review-rubric.md` | `specs/pr-review-rubric.md` | PR review rubric (#34) |
| `docs/metrics.md` | `specs/pr-acceptance-metric.md` | PR acceptance metric (#33) |
| `docs/quality.md` | `design/quality-loop.md` | quality dashboard (#35) |
| `tests/e2e/scaffold-tests` | `../../.agents/skills/frostyard-docs-site/scaffold/tests` | E2E suite (#23) |

Rules:

- **Directory criteria always get real git trees** (`tests/`, `tests/e2e/`,
  `.github/ISSUE_TEMPLATE/`, `.github/prompts/`, `.memory/`) — an evaluator
  reading the git tree via API sees a symlink as a blob, not a tree.
- **Aliases are not docs**: they get no `docs/README.md` index entries and
  carry no cross-link obligations; the canonical target does.
- Genuinely new artifacts, each doing real work: `.github/workflows/ci.yml`
  (runs the scaffold e2e suite and the docs-integrity gate), PR and issue
  templates, `.github/prompts/` runbooks, `.claude/settings.json`
  (mechanical enforcement of ADR-0019's deny list — never merge PRs, approve
  own work, publish releases, or push to `main`),
  `.claude/session-summary.md`, the `.memory/` inbox seeded per ADR-0018,
  `.editorconfig`, `.prettierrc.json` (editor/agent guidance only, not a CI
  gate), and `.coverage-thresholds.json` enforced by
  `scripts/check-docs.mjs` (docs-index coverage, link integrity, symlink
  resolution — this repo's product is docs, so that is its coverage).

## Consequences

- One canonical body of content per criterion; conformance paths cannot
  drift from it.
- GitHub's web renderer shows a symlinked `.md` as its target path rather
  than its content — the cosmetic cost ADR-0002 already accepted.
- The alias table above is the registry; adding or removing an alias means
  amending it here (a new ADR if the mechanism itself changes).
- `scripts/check-docs.mjs` fails CI on any broken alias, making the lattice
  self-guarding.
- Contingency: if the ACMM evaluator rejects a symlink for one of the five
  file criteria (#26, #29, #33, #34, #35), that alias is replaced by a real
  stub file pointing at the canonical doc — a one-commit change that does
  not reverse this decision.

## Alternatives considered

- **Real duplicate files at the ACMM paths:** guaranteed drift; rejected for
  the same reason ADR-0002 rejected per-tool instruction copies.
- **Content-free stub files:** a second class of "doc" that the index and
  cross-link rules would nominally govern; symlinks are aliases, not docs.
- **Ignore the issues:** the repo stays flagged at ACMM L0 and the platform's
  guardrail features stay unavailable.

## References

- Shapes: [design/quality-loop.md](../design/quality-loop.md),
  [specs/pr-review-rubric.md](../specs/pr-review-rubric.md),
  [specs/pr-acceptance-metric.md](../specs/pr-acceptance-metric.md)
- Builds on: [ADR-0002](0002-agent-portable-instruction-surface.md),
  [ADR-0018](0018-org-wide-agent-instruction-and-knowledge-surfaces.md),
  [ADR-0019](0019-governance-as-code-and-risk-tiers.md),
  [ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md),
  [ADR-0025](0025-consolidate-repository-docs-into-docs.md),
  [ADR-0026](0026-distribute-core-skills-via-sync-prs.md)
