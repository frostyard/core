# 0045 — Guard Actions-secret expiry with a committed record

- **Status:** Accepted
- **Date:** 2026-08-27

## Context

The skills sync ([ADR-0026](0026-distribute-core-skills-via-sync-prs.md))
depends on one fine-grained personal access token, the core Actions secret
`ORG_PAT`. It expires on 2027-08-11. When it lapses, `sync-skills.sh` fails
late and opaquely — the token is still *present*, so the script's
`GH_TOKEN (ORG_PAT) is not configured` guard stays quiet and every consumer
clone fails with `Resource not accessible by personal access token` instead.

Until now that date lived in two places that cannot fail: a sentence in
[design/skills-sync-operations.md](../design/skills-sync-operations.md) and
[core#15](https://github.com/frostyard/core/issues/15), which is closed.
A prose date and a closed issue are not a control: nothing in the repository
notices the window opening, and nobody is told before the sync breaks.

The obvious mechanisms are all unavailable or wrong here. GitHub does not
expose a fine-grained PAT's expiry to the workflows that consume it, so the
repository cannot discover the date; it can only be told. And the secret
itself must never be read, printed, or fingerprinted by anything in this
repository ([ADR-0020](0020-ai-automation-trust-boundaries.md)) — the guard
has to work from metadata alone.

## Decision

Core carries a **credential-free expiry record** and a **scheduled guard**
that fails ahead of the date.

- **[`.github/secrets-expiry.json`](../../.github/secrets-expiry.json)** is the
  canonical record: `schema_version`, a `never_relax` guardrail, and one entry
  per Actions secret naming its `expires_on` day, its `warn_days_before` lead
  time, its `owner`, the workflows that `used_by` it, and its
  `rotation_runbook`. The schema is **closed** — the validator rejects unknown
  fields — so no field exists that could hold a token value, and the file is
  metadata a reader may see in a public repository.
- **`warn_days_before` has a floor of 30 days** and the record's `never_relax`
  must stay `true`, following [ADR-0019](0019-governance-as-code-and-risk-tiers.md):
  a later change may lengthen the lead time, never shorten it below the floor.
  `ORG_PAT` declares 60 days, which is a rotation window that survives a
  holiday.
- **[`scripts/check-secret-expiry.mjs`](../../scripts/check-secret-expiry.mjs)**
  (logic in [`scripts/lib/secret-expiry.mjs`](../../scripts/lib/secret-expiry.mjs))
  validates the record and classifies each secret against a reference day:
  `ok` outside the window, `expiring` when `days_remaining <=
  warn_days_before`, `expired` after the day passes. Anything but `ok` exits
  non-zero and names the secret, the date, and the runbook. Its only inputs
  are the record and the day; it reads no secret and touches no credential.
- **[`.github/workflows/secrets-expiry.yml`](../../.github/workflows/secrets-expiry.yml)**
  runs the guard daily and on dispatch, with `permissions: {}` at the workflow
  and `contents: read` on the job, SHA-pinned actions, and
  `persist-credentials: false` ([ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md)).
  A failing scheduled run *is* the notification.
- **The guard is not part of `make verify` / `make ci`.** An approaching
  rotation is an operations task, not a defect in the pull request under
  review; blocking every merge for 60 days would teach people to bypass the
  gate. What *is* in the pull-request gate is
  [`test/secret-expiry.test.mjs`](../../test/secret-expiry.test.mjs), which
  injects reference days and pins pass-before-window, fail-inside-window, and
  fail-after-expiry, the schema's floors, and that the guard echoes nothing
  from the environment.

Rotation itself stays a human act: replace the secret in repository settings,
then update `expires_on` in the record in the same pull request.

## Consequences

- The expiry date has exactly one machine-readable home; the design doc and
  the runbook cite it instead of restating it, and core#15 is no longer load
  bearing.
- The repository warns 60 days before the sync would break, every day, without
  anyone holding a calendar reminder.
- The record must be updated when the secret is rotated. If it is not, the
  guard keeps failing on the old date — noisy, but it fails loudly rather than
  silently going stale, which is the intended trade.
- The guard proves nothing about the *actual* token: it enforces the declared
  date. A token revoked early, or one whose declared date was mistyped, is
  outside what this control can see. That is the cost of never reading the
  secret.
- Adding a second secret is one entry in the record; no new workflow or script
  is needed.
- The daily schedule is a new recurring Actions run. GitHub disables scheduled
  workflows in repositories with 60 days of no activity; core is active, and a
  disabled schedule would itself be visible in the Actions tab.

## Alternatives considered

- **Leave it to core#15 and the design doc.** The issue is closed and prose
  cannot fail; this is the state that produced the gap.
- **A calendar or external reminder.** Outside the repository, unreviewable,
  and lost when the owner changes.
- **Query the token's expiry from GitHub at run time.** The API does not
  expose a fine-grained PAT's expiry to the workflow using it, and any such
  probe would mean handling the secret to learn about it.
- **Put the guard in `make verify`.** It would block every unrelated pull
  request for the whole lead window, which is exactly the pressure that gets
  guardrails disabled.
- **Store the record in `organization/`.** That tree is the org-wide authority
  ([ADR-0035](0035-author-organization-authority-as-strict-json.md)) and its
  README excludes credential and repository-local operational instances; this
  record describes one repository's own Actions secrets.

## References

- Shapes: [design/skills-sync-operations.md](../design/skills-sync-operations.md),
  [plans/0001-docs-shape-rollout.md](../plans/0001-docs-shape-rollout.md)
- Executable contracts:
  [.github/secrets-expiry.json](../../.github/secrets-expiry.json),
  [scripts/check-secret-expiry.mjs](../../scripts/check-secret-expiry.mjs),
  [scripts/lib/secret-expiry.mjs](../../scripts/lib/secret-expiry.mjs),
  [.github/workflows/secrets-expiry.yml](../../.github/workflows/secrets-expiry.yml),
  [test/secret-expiry.test.mjs](../../test/secret-expiry.test.mjs)
- Builds on: [ADR-0026](0026-distribute-core-skills-via-sync-prs.md),
  [ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md),
  [ADR-0020](0020-ai-automation-trust-boundaries.md),
  [ADR-0019](0019-governance-as-code-and-risk-tiers.md)
