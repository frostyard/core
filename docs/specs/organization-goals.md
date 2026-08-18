# Spec: Organization goals

This contract governs version-one Goal records published by Core and consumed
by Snowcat. The executable schemas are
`organization/schemas/v1/envelope.schema.json` and
`organization/schemas/v1/goal.schema.json`; this spec pins their canonical
path, cross-record rules, and runtime interpretation.

## Interface

A Goal exists only at `organization/goals/<metadata.id>.json`:

```json
{
  "schema_version": 1,
  "kind": "goal",
  "metadata": {
    "id": "improve-ci-reliability-2026-q4",
    "status": "active",
    "owners": [
      {
        "kind": "github-user",
        "id": "github.com:37492",
        "login": "bketelsen"
      }
    ],
    "applies_to": {
      "repository_selection": "selected",
      "repository_ids": ["github.com:123456789"]
    }
  },
  "spec": {
    "starts_on": "2026-10-01",
    "ends_on": "2026-12-31",
    "priority": "high",
    "outcome": "Required checks remain conclusive and reliable while repositories evolve.",
    "success_measures": [
      {
        "id": "required-checks-stay-reliable",
        "required": true,
        "evidence_mode": "observational",
        "subject": {
          "kind": "github-repository",
          "id": "github.com:123456789"
        },
        "observation_window": {
          "starts_at": "2026-10-01T00:00:00.000Z",
          "ends_at": "2026-10-31T23:59:59.999Z"
        },
        "verification_profile": {
          "id": "required-check-reliability",
          "version": 1
        },
        "parameters": {
          "minimum_rate": 0.95
        }
      }
    ],
    "encouraged_work": [
      "Reduce flaky or inconclusive required checks without adding product features."
    ],
    "excluded_work": [
      "Do not weaken required checks or branch protection to improve the rate."
    ]
  }
}
```

The common envelope contains exactly `schema_version`, `kind`, `metadata`, and
`spec`. IDs are lowercase kebab case. Owners are bounded typed GitHub
principals. A GitHub user ID is `github.com:<positive-numeric-user-id>`; a team
ID is `github.com:<positive-numeric-organization-id>:team:<positive-numeric-team-id>`.
The accompanying login or slug is a display locator, not the authority key.

Applicability has exactly one of these shapes:

- `{"repository_selection":"all-enrolled"}`; or
- `{"repository_selection":"selected","repository_ids":[...]}` with one or
  more unique `github.com:<positive-numeric-repository-id>` values.

## Rules

- The Goal ID MUST match its filename and be unique in the candidate tree.
- Owners and success-measure IDs MUST be unique within the Goal. Every selected
  repository and every repository measurement subject MUST resolve to a
  repository declaration in the same authority catalog.
- `starts_on` and `ends_on` are ISO `YYYY-MM-DD` UTC calendar dates and the
  start MUST be on or before the end. They govern eligibility for new work,
  not an observation source's timestamp precision.
- Status MUST be `planned`, `active`, `paused`, `completed`, or `cancelled`.
  Priority MUST be `high`, `normal`, or `low`.
- `success_measures` MUST contain at least one required measure. Each measure
  MUST declare exactly one evidence mode, one typed subject, an absolute UTC
  millisecond observation window with start before end, one exact profile
  identity, and a parameter object.
- A referenced verification profile MUST exist in the same catalog. Its
  evidence mode MUST equal the measure mode, and the measure parameters MUST
  validate against the profile's embedded parameter schema.
- Observation windows MAY begin before or end after the Goal work window. This
  permits a baseline or delayed outcome measurement without changing work
  eligibility.
- `outcome`, each encouraged-work entry, and each excluded-work entry MUST be a
  bounded non-empty single line. Both work lists MUST be non-empty.
- A Goal is eligible to influence new work only when status is `active`, the
  evaluation date is within the inclusive Goal dates, and the target is an
  enrolled applicable repository.
- Goal priority supplies only the default admission priority. Multiple cited
  Goals use the highest band rather than adding bands. A worker cannot assign
  or change queue priority.
- Admission MUST freeze the exact Goal record, Core source revision, accepted
  references, and derived priority with the work item. Later Goal changes apply
  only to future discovery and admission.
- Goal measurements MUST NOT change Goal lifecycle. Only an accepted Core
  revision may do so.
- Across activated snapshots, Snowcat MUST reject deletion, a change of stable
  identity, and a lifecycle transition outside the table in ADR-0037.
- Core validates fixtures with fixture repositories and profiles. Live Goals
  resolve only against live declarations and profiles; fixtures never grant
  live authority.

## Derived artifacts

| Artifact | Derivation |
| --- | --- |
| Applicable active Goals | Active status + inclusive date check + enrolled repository + applicability |
| Discovery context | Bounded snapshot of applicable active Goals selected by the maintenance program |
| Admission default | Highest priority band among admitted applicable Goal references |
| Success-measure evaluator | Exact retained verification profile + validated parameters + subject + window |
| Historical work context | Frozen Goal payload and source revision accepted at admission |

## References

- Rationale: [ADR-0037](../adr/0037-publish-executable-organization-goals.md)
- Context: [organization authority](../design/organization-authority.md) and
  [verification profiles](organization-verification-profiles.md)
- Delivery: [organization authority rollout — Phases 2–3](../plans/0005-organization-authority-rollout.md)
