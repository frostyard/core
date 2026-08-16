# 0035 — Author organization authority as strict JSON

- **Status:** Accepted
- **Date:** 2026-08-16

## Context

Core already records organization-wide intent, standards, and governance, but
only as prose. Fluent needs a reviewed, machine-readable authority surface for
repository enrollment and canonical repository contracts. Inferring authority
from GitHub organization membership, repository topics, local files, or a
Fluent database toggle would let mutable implementation state bypass core's
pull-request review history.

Repository-local policy must remain in the repository that enforces it. Core's
role is different: it authorizes fleet participation, publishes the canonical
shape that repositories must implement, and gives every consumer one place to
read each organization decision.

## Decision

Core owns a strict, versioned JSON tree under `organization/`. The first
vertical slice contains repository enrollment declarations, a versioned
repository-surface contract, their JSON Schemas, and conformance fixtures. The
canonical command `npm run check:organization` validates the complete tree;
CI runs that command with exact dependencies from the root lockfile.

Repository declarations live only at
`organization/repositories/<owner>/<repository>.json`. Each declaration binds
an immutable GitHub repository ID to its owner/name locator, accountable
owners, fleet state, maintenance programs, action ceiling, and one surface
contract version. The path and declared owner/name must match exactly. Initial
enrollment is authorized only by a valid `enabled` declaration merged to the
configured core branch. `paused` and `disabled` narrow authority; declarations
are tombstoned as `disabled`, not deleted.

The version-one surface contract lives only at
`organization/contracts/repository-surfaces/v1.json`. It names the canonical
repository paths for portable instructions, repository governance, skills,
and the documentation index. A repository may use relative symlinks as
compatibility aliases, but the canonical surface itself must be real content.

All organization JSON rejects duplicate keys, invalid UTF-8, unknown fields,
unknown versions, symlinks, and unrecognized paths. Schemas use JSON Schema
Draft 2020-12 and are immutable once a consumer supports their version. A
meaningful incompatible change creates a new version rather than silently
changing version one.

Core stores no provider credentials, worker configuration, execution state,
leases, or repository-specific implementation policy in this tree. Fluent
imports a validated core revision and records runtime enrollment separately;
the presence of a declaration is authority input, not proof that Fluent has
observed or acted on it.

Later records for goals, policies, knowledge, criteria sets, and exceptions
will extend this tree through follow-up decisions. They do not become accepted
formats merely because their future paths have been discussed.

## Consequences

- Enrollment authority becomes a reviewed core change with a stable Git
  revision instead of mutable control-plane configuration.
- Core can publish one canonical path and schema per repository surface while
  repositories retain stricter local policy and enforcement.
- A disabled declaration remains auditable and cannot disappear accidentally.
- Consumers can reject the whole authority snapshot before activation when
  any structural record is invalid.
- Core now contains executable repository-support tooling and organization
  authority that may name one repository; its former “nothing specific to a
  single repository” boundary is narrowed accordingly.
- Schema evolution requires explicit versions, fixtures, validator support,
  and consumer rollout.

## Alternatives considered

- **Keep enrollment in Fluent's database:** rejected because it bypasses the
  organization review trail and creates a second authority.
- **Use GitHub topics or organization membership:** rejected because neither
  carries accountable ownership, programs, ceilings, or an immutable
  repository identity.
- **Let each repository choose its own declaration and policy paths:** rejected
  because discovery rules and adapters would make accidental diversity a
  permanent contract.
- **Move repository-local governance into core:** rejected because enforcement
  must travel with the repository and local boundaries differ. Core publishes
  the schema and contract; repositories own conforming instances.
- **Delete declarations to opt out:** rejected because absence is ambiguous and
  loses the explicit historical state.

## References

- Shapes: [organization authority design](../design/organization-authority.md),
  [repository enrollment contract](../specs/organization-repository-enrollment.md),
  and [organization authority rollout](../plans/0005-organization-authority-rollout.md)
- Builds on: [ADR-0018](0018-org-wide-agent-instruction-and-knowledge-surfaces.md),
  [ADR-0019](0019-governance-as-code-and-risk-tiers.md),
  [ADR-0020](0020-ai-automation-trust-boundaries.md), and
  [ADR-0033](0033-link-maintenance-in-immutable-adrs.md)
