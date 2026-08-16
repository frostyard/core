# 0019 — Repository governance as machine-readable policy with risk tiers

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

With agents doing much of the work, prose rules ("don't merge your own PR")
are unenforceable and drift-prone. The org needed governance that
automation can evaluate, tests can pin, and reviews can reference — and a
shared vocabulary for how much scrutiny a change deserves.

## Decision

- Each repo carries **machine-readable policy files** — `policies/*.json`
  or `.github/policies/*.json` (`agent-governance.json`,
  `ai-governance.json`, `repository.yaml`) — versioned with an explicit
  `schema_version`/`version` field, **deny-by-default**
  (`defaultDecision: "deny"`), validated by an in-repo test that rejects
  unknown schema versions. Agents may never merge PRs, publish releases,
  deploy production, or approve their own exceptions; named protected
  boundaries (signing, credentials, installers, publication, …) require
  rejection-path tests.
- **`.github/auto-qa-tuning.json`** governs the self-tuning quality loop
  (rolling window, minimum sample, regression thresholds) with
  **`never_relax`** guardrails on required checks, security checks, and
  coverage — the loop may tighten, never loosen.
- Every PR declares a **risk tier** ("highest applicable, never lower") in
  a fixed PR-template section, checked by the review rubric. Tier counts
  currently diverge (3 tiers in updex, 4 in snosi/chairlift/pilothouse,
  Low/Medium/High in lab); the classification requirement is the decision,
  harmonizing the scale is open work.
- Where docs define metrics or contracts the policies reference, a unit
  test pins the doc's headings/formulas so prose and policy cannot drift
  apart silently.

## Consequences

- "May the agent do X?" has a greppable, testable answer; weakening a
  guardrail is a schema-visible, reviewed act.
- Policy edits are themselves governed ("editing this policy is not an
  exception to it").
- Duplicated tier tables across docs are a known drift risk; the per-repo
  tests are the mitigation until scales are harmonized.

## Alternatives considered

- **Prose-only policy:** unenforceable by automation, invisible to tests.
- **Org-central policy repo only:** per-repo automation needs the file
  locally and per-repo boundaries differ; core records the *shape*, repos
  hold the instances.

## References

- Shapes: [snosi `policies/`](https://github.com/frostyard/snosi/tree/main/policies),
  [updex `.github/policies/ai-governance.json`](https://github.com/frostyard/updex/blob/main/.github/policies/ai-governance.json),
  [lab `policies/agent-governance.json`](https://github.com/frostyard/lab/blob/main/policies/agent-governance.json),
  [pilothouse `policies/repository.yaml`](https://github.com/frostyard/pilothouse/blob/main/policies/repository.yaml),
  risk-tier docs in each repo
- Builds on: [ADR-0018](0018-org-wide-agent-instruction-and-knowledge-surfaces.md)
- Related: [ADR-0020](0020-ai-automation-trust-boundaries.md)
- Extended by:
  [ADR-0035](0035-author-organization-authority-as-strict-json.md), which keeps
  repository policy instances local while core publishes their canonical
  schema and the organization enrollment authority
