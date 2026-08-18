# Spec: Organization repository enrollment

This contract governs core-authored repository declarations and the versioned
repository-surface catalog consumed by core validation and Snowcat snapshot
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
| `maintenance_programs` | array | yes | unique subset of `quality`, `ci`, `security`, `architecture`, `conformance`, `triage`, `dependencies`, `docs`, `release` (widened within v1 by [ADR-0039](../adr/0039-widen-maintenance-programs-within-schema-v1.md)); non-empty when enabled |
| `action_ceiling` | array | yes | unique subset of the six Snowcat v1 actions; non-empty when enabled |
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

### Repository settings contract

The version-one repository settings contract lives only at
`organization/contracts/repository-settings/v1.json`, validated by
`organization/schemas/v1/repository-settings.schema.json`
([ADR-0040](../adr/0040-publish-the-repository-settings-contract.md)). It is
organization-wide: every enrolled repository is expected to match every value.

| Section | What it fixes |
| --- | --- |
| `repository` | delete branch on merge, suggest updating branches, no auto-merge, allowed merge methods, merge/squash commit title and message defaults, wiki/projects/issues, web sign-off |
| `actions` | default workflow token permissions, whether workflows may approve pull requests |
| `security` | Dependabot alerts and security updates, secret scanning and push protection, private vulnerability reporting |
| `default_branch_ruleset` | active, no bypass, pull request required with the approval count, conversation resolution, strict required status checks, no deletion or force push, no merge queue, no classic protection |
| `tag_ruleset` | tag pattern, no deletion or force update, creation restricted |
| `metadata` | license and description required, topics that must be present |
| `labels` | labels the fleet depends on |

The contract names no per-repository values (visibility, discussions, code
scanning, the exact required-check contexts); those are observed by the
consumer, not required, until a later version. Snowcat reads the contract and
proposes drift; `scripts/apply-repo-settings.sh <owner/repo> [--apply]
[--required-checks "<ctx>,…"]` applies it — dry-run by default, idempotent,
never deleting a ruleset it did not create, and never writing a license or
description (those are pull requests and settings the operator makes). The
tag ruleset it creates lets repository admins bypass, so a maintainer's
`make bump` still creates the tag and nobody else can.

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
- The repository settings contract MUST require a pull request whenever it
  requires status checks, and its tag ruleset MUST block deletion or restrict
  creation; a change that relaxes any value is a new ADR, not an edit.

## Derived artifacts

| Artifact | Derivation |
| --- | --- |
| Snowcat authority snapshot | Atomic import of one validated core Git revision |
| Runtime repository enrollment | Reconciliation of an enabled declaration, immutable repository ID, and required canonical surfaces |
| Repository hold | Failed identity or surface reconciliation without invalidating unrelated snapshot records |

## References

- Rationale:
  [ADR-0035](../adr/0035-author-organization-authority-as-strict-json.md),
  [ADR-0039](../adr/0039-widen-maintenance-programs-within-schema-v1.md)
  (compatible enum widening within a schema version),
  [ADR-0040](../adr/0040-publish-the-repository-settings-contract.md)
  (repository settings contract)
- Context: [organization authority](../design/organization-authority.md)
