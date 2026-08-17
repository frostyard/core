# Spec: Organization verification profiles

This contract governs the immutable verification-profile definitions published
by Core and consumed by Fluent when it validates and executes success measures.
The JSON Schema in `organization/schemas/v1/verification-profile.schema.json`
is the executable document contract; this spec pins its path and cross-field
invariants.

## Interface

A verification profile exists only at
`organization/contracts/verification-profiles/<id>/v<version>.json`:

```json
{
  "schema_version": 1,
  "profile": {
    "id": "required-check-reliability",
    "version": 1
  },
  "description": "Evaluate required-check conclusions over a declared repository and time window.",
  "evidence_mode": "observational",
  "mechanism": {
    "kind": "observational-evaluator",
    "source_adapter": {
      "id": "github-check-runs",
      "version": 1
    },
    "evaluator": {
      "id": "conclusive-run-rate",
      "version": 1
    }
  },
  "parameter_schema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://frostyard.org/schemas/organization/verification-profiles/required-check-reliability/v1-parameters.schema.json",
    "type": "object",
    "additionalProperties": false,
    "required": ["minimum_rate"],
    "properties": {
      "minimum_rate": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      }
    }
  }
}
```

| Field | Type | Required | Constraints |
| --- | --- | --- | --- |
| `schema_version` | integer | yes | exactly `1` |
| `profile.id` | string | yes | kebab-case ID matching the path |
| `profile.version` | integer | yes | positive integer matching the path version |
| `description` | string | yes | one non-empty line, at most 1,024 characters |
| `evidence_mode` | string | yes | `deterministic`, `observational`, or `human-attested` |
| `mechanism` | object | yes | exact mode-specific versioned mechanism binding |
| `parameter_schema` | object | yes | embedded closed Draft 2020-12 object schema |

The mode-specific mechanism shapes are:

| Evidence mode | `mechanism.kind` | Required bindings |
| --- | --- | --- |
| `deterministic` | `deterministic-evaluator` | `evaluator` |
| `observational` | `observational-evaluator` | `source_adapter`, `evaluator` |
| `human-attested` | `attestation-policy` | `attestation_policy` |

Each binding contains only a kebab-case `id` and positive integer `version`.

## Rules

- The declared profile ID and version MUST exactly match its canonical path.
- A profile document MUST be no larger than 65,536 bytes.
- `parameter_schema.$schema` MUST be JSON Schema Draft 2020-12.
- `parameter_schema.$id` MUST be
  `https://frostyard.org/schemas/organization/verification-profiles/<id>/v<version>-parameters.schema.json`.
- The parameter schema root MUST have `type: "object"` and
  `additionalProperties: false`.
- Every `$ref`, `$dynamicRef`, and `$recursiveRef` in the parameter schema MUST
  be document-local. Nested `$id` and `$schema` keywords are forbidden. The
  schema MUST compile in the pinned strict validator without loading external
  resources.
- Core MUST retain an accepted profile version unchanged. A changed parameter
  or mechanism contract MUST use a new positive version.
- Core validation MUST NOT claim that a profile is executable by a consumer.
  Fluent MUST independently recognize every named binding before activating a
  snapshot containing a success measure that references the profile.
- A success measure referencing a profile MUST separately declare its exact
  subject and absolute observation window, and its parameters MUST validate
  against the embedded schema. Those fields belong to the future goal or
  initiative schema, not to the reusable profile.
- `npm run check:organization` MUST validate live profiles and both valid and
  invalid profile fixtures through the same parser, schema, size bound, and
  invariant checks.

## Derived artifacts

| Artifact | Derivation |
| --- | --- |
| Fluent verification registry requirement | Exact mode-specific mechanism IDs and versions named by an activated profile |
| Success-measure parameter validator | The retained profile's embedded `parameter_schema` |
| Verification evidence | Subject, window, profile identity, parameters, mechanism versions, source facts, and result retained by Fluent |

## References

- Rationale:
  [ADR-0036](../adr/0036-publish-versioned-verification-profiles.md)
- Context: [organization authority](../design/organization-authority.md)
- Consumer contract: [organization goals](organization-goals.md)
