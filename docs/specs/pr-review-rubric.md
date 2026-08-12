# Spec: PR review rubric

One paragraph: the checklist every frostyard/core pull-request review
applies. Consumers: human reviewers, the
[review runbook](../../.github/prompts/review.prompt.md), and the
[PR template](../../.github/pull_request_template.md), whose sections mirror
these checks. `docs/review-rubric.md` is a conformance alias for this file
([ADR-0029](../adr/0029-acmm-conformance-via-canonical-aliases.md)).

## Interface

Every review verifies each row; a PR merges only when all applicable rows
pass.

| Check | How to verify |
| --- | --- |
| Risk tier declared | PR body has a "Risk tier" section declaring the **highest applicable** tier — never lower ([ADR-0019](../adr/0019-governance-as-code-and-risk-tiers.md)). Docs/skills-only changes in this repo are tier 1 (the precedent set by `scripts/sync-skills.sh` PR bodies). Scale harmonization is open work ([core#13](https://github.com/frostyard/core/issues/13)) — cite the tier, don't invent a scale. |
| Docs housekeeping | New docs start from their category `TEMPLATE.md`, are indexed in [docs/README.md](../README.md), and cross-link in both directions. New significant decision ⇒ ADR first, in the same change. |
| Workflows least-privilege | Any new or changed workflow uses full 40-char SHA-pinned actions with a `# vX.Y.Z` comment, top-level `permissions: {}`, and `persist-credentials: false` ([ADR-0021](../adr/0021-sha-pinned-actions-and-least-privilege-ci.md)). |
| Docs-integrity gate green | `node scripts/check-docs.mjs` passes: every doc indexed, every relative link resolving, every symlink alias intact (thresholds in `.coverage-thresholds.json`). |
| Scaffold suite green | If `.agents/skills/frostyard-docs-site/scaffold/**` changed: `npm ci && npm test` in the scaffold passes (CI runs it either way). |
| Agent limits respected | The PR was not merged, approved, or released by the agent that authored it ([ADR-0019](../adr/0019-governance-as-code-and-risk-tiers.md)); mechanically backed by `.claude/settings.json`. |
| Boundary respected | Content belongs to core (org-wide shared material) — nothing repo-specific, no secrets, no personal data (AGENTS.md "Repository boundary"). |

## Rules

- Each check is independently verifiable from the PR diff plus the commands
  named in its row — a review MUST NOT rely on out-of-band context.
- Rubric changes ride with the artifact that enforces them (the gate script,
  the workflow, or the template) in the same PR.
- The org squash-merges: the review covers the squashed result, not
  intermediate commits.

## References

- Rationale: [ADR-0019](../adr/0019-governance-as-code-and-risk-tiers.md),
  [ADR-0029](../adr/0029-acmm-conformance-via-canonical-aliases.md)
- Context: [design/quality-loop.md](../design/quality-loop.md)
