# Organization authority

Living document. Rationale:
[ADR-0035](../adr/0035-author-organization-authority-as-strict-json.md).
Contracts:
[repository enrollment](../specs/organization-repository-enrollment.md).

## Overview

The `organization/` tree is core's machine-readable organization authority.
Humans change it through core pull requests; a deterministic validator proves
that one complete Git revision conforms; Fluent can then import that revision
as an atomic authority snapshot. The first implemented slice covers repository
declarations and the canonical repository-surface contract.

```text
core pull request
      |
      v
strict organization/ tree -- npm run check:organization --> valid Git revision
      |                                                          |
      |                                                          v
      +-----------------------------------------------> Fluent snapshot import
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

The validator first walks the tree without following symlinks. It accepts only
the known version-one layout, decodes bytes as fatal UTF-8, rejects duplicate
object keys before `JSON.parse`, validates every document against its exact
schema, and applies cross-document rules that JSON Schema cannot express:

- a declaration's owner and repository match its path;
- accountable owner subjects and protected-boundary IDs are unique;
- every surface contract's referenced schema path exists; and
- every valid fixture passes while every invalid fixture is rejected.

The representative `frostyard/core` declaration is deliberately `disabled`.
It exercises the live registry without authorizing runtime participation. A
future change to `enabled` is a distinct reviewed organization decision.

The authority tree and Fluent runtime state are intentionally separate. A
merged declaration is an input to a later import, not evidence that the
snapshot was activated or the repository became available for work. Runtime
holds, suspensions, leases, and work history remain Fluent state.

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

The first slice intentionally does not define goals, policies, knowledge,
criteria-set, or exception record formats. Their rollout is tracked separately
so an unimplemented design is not mistaken for a live authoring contract.

## References

- Rationale:
  [ADR-0035](../adr/0035-author-organization-authority-as-strict-json.md)
- Contracts:
  [repository enrollment](../specs/organization-repository-enrollment.md)
- Built in:
  [organization authority rollout — Phase 1](../plans/0005-organization-authority-rollout.md#phase-1--repository-enrollment-foundation-complete)
