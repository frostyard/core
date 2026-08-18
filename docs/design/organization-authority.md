# Organization authority

Living document. Rationale:
[ADR-0035](../adr/0035-author-organization-authority-as-strict-json.md) and
[ADR-0036](../adr/0036-publish-versioned-verification-profiles.md), and
[ADR-0037](../adr/0037-publish-executable-organization-goals.md).
Contracts: [repository enrollment](../specs/organization-repository-enrollment.md)
and [verification profiles](../specs/organization-verification-profiles.md), and
[organization goals](../specs/organization-goals.md).

## Overview

The `organization/` tree is core's machine-readable organization authority.
Humans change it through core pull requests; a deterministic validator proves
that one complete Git revision conforms; Snowcat (the coordination service, named Fluent until 2026-08-18 — its ADR-0064) can then import that revision
as an atomic authority snapshot. The implemented foundation covers repository
declarations, the canonical repository-surface contract, reusable
verification-profile contracts, and executable Goal records.

```text
core pull request
      |
      v
strict organization/ tree -- npm run check:organization --> valid Git revision
      |                                                          |
      |                                                          v
      +-----------------------------------------------> Snowcat snapshot import
                                                                 |
                                                                 v
                                                      runtime enrollment state
```

## Design

`organization/schemas/v1/` holds immutable Draft 2020-12 schemas.
`organization/repositories/<owner>/<repository>.json` holds reviewed
repository declarations. `organization/contracts/repository-surfaces/v1.json`
publishes stable surface IDs and their single canonical paths. Fixtures under
`organization/fixtures/v1/` exercise the same parser and schemas as live data.

Immutable verification profiles live at
`organization/contracts/verification-profiles/<id>/v<version>.json`. Each
binds one evidence mode to closed, versioned mechanism identifiers and embeds
the strict parameter schema that future goal and initiative measures use.

Goal records live at `organization/goals/<id>.json`. The common envelope owns
identity, lifecycle, GitHub-principal ownership, and repository applicability;
the Goal body owns its work window, priority, outcome, success measures, and
positive and negative work boundaries. A measure resolves an exact profile and
repository subject independently of the Goal's applicability.

The validator first walks the tree without following symlinks. It accepts only
the known version-one layout, decodes bytes as fatal UTF-8, rejects duplicate
object keys before `JSON.parse`, validates every document against its exact
schema, and applies cross-document rules that JSON Schema cannot express:

- a declaration's owner and repository match its path;
- accountable owner subjects and protected-boundary IDs are unique;
- every surface contract's referenced schema path exists; and
- every verification profile identity matches its path, embeds a closed local
  parameter schema, and stays within its size bound;
- every Goal identity matches its path, resolves only declared repositories and
  profiles, supplies a required measure, and satisfies the referenced profile's
  mode and parameter schema; and
- every valid fixture passes while every invalid fixture is rejected.

The representative `frostyard/core` declaration is deliberately `disabled`.
It exercises the live registry without authorizing runtime participation. A
future change to `enabled` is a distinct reviewed organization decision.

The authority tree and Snowcat runtime state are intentionally separate. A
merged declaration is an input to a later import, not evidence that the
snapshot was activated or the repository became available for work. Runtime
holds, suspensions, leases, and work history remain Snowcat state.

Repository-local governance remains at the canonical path named by the surface
contract. Core owns its schema and common vocabulary, while each repository
owns its policy instance and may narrow authority. A repository declaration
does not embed or replace that local policy.

## Operational notes

Run `npm ci && npm run check` at the repository root. A failure rejects the
candidate core revision; there is no partial acceptance. Invalid fixtures are
expected to fail schema or parser validation and are themselves checked by the
suite.

Schema version one is treated as immutable after acceptance. Add a versioned
schema and contract plus compatible validator support before changing a field,
path, or meaning. Keep disabled declarations rather than deleting them.

The implemented foundation defines Goal records but intentionally publishes no
live Goal yet. Its fixtures exercise the contract without creating organization
intent. Policy, knowledge, criteria-set, and exception formats remain tracked
separately so an unimplemented design is not mistaken for a live authoring
contract.

## References

- Rationale:
  [ADR-0035](../adr/0035-author-organization-authority-as-strict-json.md),
  [ADR-0036](../adr/0036-publish-versioned-verification-profiles.md), and
  [ADR-0037](../adr/0037-publish-executable-organization-goals.md)
- Contracts:
  [repository enrollment](../specs/organization-repository-enrollment.md) and
  [verification profiles](../specs/organization-verification-profiles.md), and
  [organization goals](../specs/organization-goals.md)
- Built in:
  [organization authority rollout — Phases 1–2](../plans/0005-organization-authority-rollout.md)
