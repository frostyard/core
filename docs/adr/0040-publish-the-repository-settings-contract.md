# 0040 — Publish the repository settings contract

- **Status:** Accepted
- **Date:** 2026-08-18

## Context

The organization tree ([ADR-0035](0035-author-organization-authority-as-strict-json.md))
says which repositories are in the fleet, what programs they run, and which
files they must carry (the surfaces contract). It says nothing about the
GitHub *repository settings* that decide whether that maintenance is safe:
whether merged branches are deleted, whether the default branch can be pushed
to directly, which checks are required and from which producer, what
permissions a workflow token gets, whether secret scanning is on.

A survey of the five fleet repositories on 2026-08-18 found no default-branch
ruleset or protection anywhere; workflow tokens with `write` and the right to
approve pull requests on four of five; secret scanning off everywhere;
Dependabot alerts off on one; branch deletion on merge on one; two without a
license. Fluent's own required-checks evaluator
([Fluent ADR-0056](https://github.com/frostyard/fluent/blob/main/docs/adr/0056-derive-required-checks-from-enforced-github-rules.md))
had already specified the v1 default-branch ruleset that nothing had enabled.
Each of these is an admin action a person clicks or forgets; none is reviewed,
none is recorded, and drift is invisible.

## Decision

- Core publishes **one repository settings contract**,
  `organization/contracts/repository-settings/v1.json`, validated by
  `organization/schemas/v1/repository-settings.schema.json` and conformance
  fixtures, alongside the surfaces contract and under the same rules: strict
  JSON, closed vocabularies, immutable schema version once a consumer supports
  it (compatible enum widening per [ADR-0039](0039-widen-maintenance-programs-within-schema-v1.md)).
- Version one is **organization-wide**: every enrolled repository must match
  every value. It covers merge hygiene (delete branch on merge, suggest
  updating branches, no auto-merge, merge methods and commit-message
  defaults so the conventional pull-request title becomes the commit subject,
  wiki and projects off), the default-branch ruleset (active, no bypass, pull
  request required with zero approvals, conversation resolution required,
  strict required status checks, no deletion or force push, no merge queue,
  no classic protection — the Fluent ADR-0056 shape), a tag ruleset on `v*`
  (no deletion or force update, creation restricted), Actions token
  permissions (read, cannot approve pull requests), security features
  (Dependabot alerts and security updates, secret scanning with push
  protection, private vulnerability reporting), metadata (license,
  description, the `frostyard` topic), and the labels the fleet depends on
  (`fluent`). Values a repository may legitimately differ on — visibility,
  discussions, code scanning, the exact required-check names — are
  deliberately not in version one; they are observed, not required, until a
  later version adds per-repository declarations.
- **The contract is read, not applied, by Fluent.** Fluent's conformance
  sweep compares each enrolled repository's live settings with the contract
  through read-only GitHub calls and proposes drift for the operator; Fluent
  holds no admin credential and changes no setting.
- **Applying is a human act, scripted here**: `scripts/apply-repo-settings.sh
  <owner/repo>` issues the exact idempotent GitHub API calls the contract
  implies (dry-run by default), and takes the repository's required-check
  names as arguments because the contract does not carry them. An operator
  runs it once per repository and again whenever Fluent reports drift.
- The contract may only tighten in place: a change that would relax a value
  is a new ADR, not an edit.

## Consequences

- Repository safety settings become reviewed organization decisions with a
  digest, like declarations and surfaces; drift becomes a proposal in
  Fluent's inbox rather than a surprise.
- Enabling the default-branch ruleset changes how every fleet repository is
  updated: no direct pushes to `main`, every change through a pull request
  whose named checks pass. Fluent's required-checks evaluator finally has
  enforced rules to observe.
- Version one cannot express per-repository variance; a repository that
  needs it (a private repository, discussions on) is a finding until a later
  version — acceptable for a five-repository fleet, revisited with the first
  real exception.
- Consumers that pin schema digests (Fluent) bundle the new schema before
  this merges; older Fluent revisions accept a core tree without the contract
  (it is an addition, like verification profiles were).

## Alternatives considered

- **Per-repository settings inside each declaration:** rejected for version
  one; adds a field to the declaration schema (a compatibility question under
  ADR-0039) for variance the fleet does not yet have.
- **Enforce from Fluent with an admin token:** rejected; Fluent's boundary is
  read and propose, and an admin credential in the coordinator is a wider
  blast radius than any setting it would fix.
- **Organization-level rulesets and GitHub's own policy features only:**
  useful later, but they are not reviewable JSON in core and do not cover
  merge hygiene, Actions permissions, or labels; the contract can point at
  them once they exist.

## References

- Shapes: [organization repository enrollment](../specs/organization-repository-enrollment.md),
  [organization authority](../design/organization-authority.md),
  Fluent's [maintenance programs plan](https://github.com/frostyard/fluent/blob/main/docs/plans/maintenance-programs.md)
  and [required-check ruleset operations](https://github.com/frostyard/fluent/blob/main/docs/design/required-check-ruleset-operations.md)
- Builds on: [ADR-0035](0035-author-organization-authority-as-strict-json.md),
  [ADR-0019](0019-governance-as-code-and-risk-tiers.md),
  [ADR-0039](0039-widen-maintenance-programs-within-schema-v1.md)
