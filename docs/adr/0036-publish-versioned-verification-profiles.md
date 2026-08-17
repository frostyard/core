# 0036 — Publish versioned verification profiles

- **Status:** Accepted
- **Date:** 2026-08-16

## Context

Organization goals and delivery initiatives need success measures that can be
verified rather than interpreted from free-form prose. A measure has to name
what is observed, over which window, and how evidence becomes a conclusive
result. Core must review that meaning, while Fluent must execute only code it
explicitly supports. Letting a Core record embed a query language, script, or
remote schema would move executable authority across the trust boundary and
make old decisions change when external content changes.

The evidence model distinguishes deterministic checks, observations over a
window, and attributed human attestations. Those modes need versioned bindings
to concrete Fluent mechanisms and closed parameter contracts before a goal
schema can make every success measure executable.

## Decision

Core publishes immutable verification-profile definitions at
`organization/contracts/verification-profiles/<id>/v<version>.json`. A profile
binds exactly one evidence mode to one kind of mechanism:

- `deterministic` binds a versioned deterministic evaluator;
- `observational` binds a versioned trusted-source adapter and evaluator; and
- `human-attested` binds a versioned attestation policy.

Every profile embeds a strict JSON Schema Draft 2020-12 parameter schema. The
schema is a closed object, has the canonical profile-specific root `$id`, uses
only document-local references, forbids nested identities and dialect changes,
and travels with the profile revision. The complete profile is limited to
65,536 bytes. Profile identity must match its canonical path, and an existing
`(id, version)` is immutable.

A verification profile is a contract, not a sixth organization record kind.
It does not carry lifecycle, applicability, or authority by itself. A future
goal or initiative success measure will declare its subject and observation
window, reference one exact profile version, and supply parameters that
validate against that profile.

Core validates and publishes profiles but never executes them. Fluent owns a
closed registry of implementations for the versioned adapter, evaluator, and
attestation-policy identifiers. It rejects activation of an authority snapshot
that contains a referenced profile it cannot execute. Neither side downloads
code or schema dependencies named by a profile.

## Consequences

- Success-measure meaning can be reviewed and versioned independently of each
  goal while remaining mechanically executable by a supporting consumer.
- Fluent can add a new implementation deliberately and can reject unsupported
  contracts before admitting dependent work.
- Historical measurements retain the exact profile and parameter contract that
  produced them.
- Adding a new measurement mechanism requires coordinated Core contract and
  Fluent implementation work; arbitrary one-off expressions are not accepted.
- Core's organization validator now recognizes another canonical contract
  family and must preserve its fixtures and size/ref checks.

## Alternatives considered

- **Embed a generic metrics expression language in each measure:** rejected
  because it creates a second programming language, expands the security
  boundary, and makes bounded validation much harder.
- **Store only prose and ask a model to judge it:** rejected because the same
  evidence can produce different answers and cannot form an executable
  acceptance contract.
- **Allow scripts or remote schema references:** rejected because a reviewed
  Core revision would no longer contain all executable meaning.
- **Make profiles a sixth organization record kind:** rejected because profiles
  define verification mechanics rather than organization intent or lifecycle.

## References

- Shapes: [organization authority design](../design/organization-authority.md),
  [organization verification profiles](../specs/organization-verification-profiles.md),
  and [organization authority rollout](../plans/0005-organization-authority-rollout.md)
- Builds on: [ADR-0020](0020-ai-automation-trust-boundaries.md) and
  [ADR-0035](0035-author-organization-authority-as-strict-json.md)
- Consumer evidence semantics:
  [Fluent ADR-0031](https://github.com/frostyard/fluent/blob/main/docs/adr/0031-separate-delivery-from-outcome-achievement.md)
