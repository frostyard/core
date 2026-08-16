# Spec: Organization repository enrollment

This contract governs core-authored repository declarations and the versioned
repository-surface catalog consumed by core validation and Fluent snapshot
import. The JSON Schemas in `organization/schemas/v1/` are the executable
contract; this document names the cross-document invariants.

## Interface

A repository declaration exists only at
`organization/repositories/<owner>/<repository>.json`:

```json
{
  "schema_version": 1,
  "repository": {
    "owner": "frostyard",
    "name": "chairlift",
    "repository_id": "123456789"
  },
  "accountable_owners": [
    {
      "kind": "github-user",
      "login": "bketelsen"
    }
  ],
  "fleet_state": "enabled",
  "maintenance_programs": ["quality", "ci", "security", "architecture"],
  "action_ceiling": [
    "read",
    "write",
    "run-tests",
    "open-issue",
    "open-pr",
    "create-followup"
  ],
  "surface_contract_version": 1
}
```

| Field | Type | Required | Constraints |
| --- | --- | --- | --- |
| `schema_version` | integer | yes | exactly `1` |
| `repository.owner` | string | yes | GitHub owner locator; must match the path directory |
| `repository.name` | string | yes | GitHub repository locator; must match the filename |
| `repository.repository_id` | string | yes | non-zero decimal immutable GitHub repository ID |
| `accountable_owners` | array | yes | one or more unique typed GitHub subjects |
| `fleet_state` | string | yes | `enabled`, `paused`, or `disabled` |
| `maintenance_programs` | array | yes | unique subset of `quality`, `ci`, `security`, `architecture`; non-empty when enabled |
| `action_ceiling` | array | yes | unique subset of the six Fluent v1 actions; non-empty when enabled |
| `surface_contract_version` | integer | yes | exactly `1` in this contract |

An accountable owner is either `{"kind":"github-user","login":"…"}` or
`{"kind":"github-team","slug":"…"}`. Unknown subject kinds and fields are
rejected.

The version-one surface contract exists only at
`organization/contracts/repository-surfaces/v1.json` and contains these exact
surface IDs and canonical repository paths:

| Surface ID | Path | Artifact type | Schema |
| --- | --- | --- | --- |
| `agent-instructions` | `AGENTS.md` | `file` | none |
| `agent-governance` | `policies/agent-governance.json` | `file` | `organization/schemas/v1/repository-agent-governance.schema.json` |
| `agent-skills` | `.agents/skills` | `directory` | none |
| `documentation-index` | `docs/README.md` | `file` | none |

## Rules

- Every JSON document MUST be UTF-8, MUST reject duplicate keys, and MUST
  validate with unknown properties rejected.
- The declaration path owner and repository filename MUST exactly equal
  `repository.owner` and `repository.name`.
- Repository identity is `repository.repository_id`; owner/name is its GitHub
  locator and MUST be reconciled against that ID by the importer.
- Initial enrollment authority requires `fleet_state: "enabled"` in a merged
  core revision. `paused` and `disabled` MUST NOT authorize new work.
- A declaration that has appeared in an imported revision MUST be retained as
  `disabled` rather than deleted. The core validator proves shape, while the
  importing service enforces this historical rule across revisions.
- The surface contract MUST contain each version-one surface exactly once and
  MUST reference an existing schema where `schema_path` is present.
- A canonical file MUST be a regular Git blob and a canonical directory MUST
  be a real Git tree in the enrolled repository. The importer MUST NOT search
  alternate paths or follow compatibility aliases.
- Repository governance MUST use all required version-one top-level fields,
  deny by default, recognize only the closed action/boundary vocabulary, and
  enable all mandatory change and exception controls.
- Version-one protected-boundary `detectors` MUST be empty. A named detector
  requires a deterministic implementation, registry entry, and new governance
  schema version; path patterns and admitted boundary declarations remain
  available in version one.
- Repository policy MAY narrow another authority layer. It MUST NOT widen the
  platform, organization, enrollment, root-work, or delegated ceiling.
- `npm run check:organization` MUST validate live records and both valid and
  invalid conformance fixtures using the same parser and schemas.

## Derived artifacts

| Artifact | Derivation |
| --- | --- |
| Fluent authority snapshot | Atomic import of one validated core Git revision |
| Runtime repository enrollment | Reconciliation of an enabled declaration, immutable repository ID, and required canonical surfaces |
| Repository hold | Failed identity or surface reconciliation without invalidating unrelated snapshot records |

## References

- Rationale:
  [ADR-0035](../adr/0035-author-organization-authority-as-strict-json.md)
- Context: [organization authority](../design/organization-authority.md)
