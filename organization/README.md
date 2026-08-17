# Organization authority

This directory is the canonical machine-readable organization authority
described by [ADR-0035](../docs/adr/0035-author-organization-authority-as-strict-json.md).
Change it through a reviewed pull request to core.

The implemented version-one slice contains:

- `repositories/<owner>/<repository>.json` — repository declarations;
- `contracts/repository-surfaces/v1.json` — canonical repository surfaces;
- `contracts/verification-profiles/<id>/v<version>.json` — immutable success-
  measure verification contracts;
- `goals/<id>.json` — reviewed organization outcomes that can influence future
  discovery and admission without granting authority;
- `schemas/v1/` — immutable JSON Schema Draft 2020-12 contracts; and
- `fixtures/v1/` — positive and rejection conformance examples.

Copy a valid fixture when authoring a record, then run:

```sh
npm ci
npm run check:organization
```

Do not add credentials, worker configuration, leases, execution history, or
repository-local policy instances here. Retain a repository declaration with
`"fleet_state": "disabled"` when opting out; do not delete it.

Exact fields and invariants are documented in the
[repository enrollment spec](../docs/specs/organization-repository-enrollment.md)
and [verification-profile spec](../docs/specs/organization-verification-profiles.md).
Goal fields and cross-record rules are in the
[organization Goal spec](../docs/specs/organization-goals.md). The current tree
contains Goal fixtures but no live Goal.
