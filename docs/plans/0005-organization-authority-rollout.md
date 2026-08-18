# Plan: Organization authority rollout

This plan delivers core's machine-readable authority surface in independently
reviewable slices. It complements the
[organization portfolio roadmap](0002-org-portfolio-roadmap.md): the portfolio
plan describes desired outcomes across repositories, while this plan delivers
the authority records and validation consumed by Snowcat.

## Phase 1 — Repository enrollment foundation (complete)

- Establish the [organization authority design](../design/organization-authority.md)
  and [repository enrollment contract](../specs/organization-repository-enrollment.md).
- Add strict version-one repository, surface-contract, and repository-governance
  schemas, valid and invalid fixtures, a disabled live declaration, and the
  pinned validator.
- Run the validator and tests in core CI.
- **Done when:** `npm run check` validates the complete organization tree and
  conformance corpus from a clean install, including the disabled
  `frostyard/core` declaration.

## Phase 2 — Organization context records

- Publish versioned
  [verification profiles](../specs/organization-verification-profiles.md) before
  accepting [Goals](../specs/organization-goals.md) or initiatives with
  executable success measures. Profiles
  bind evidence modes to closed consumer mechanisms; they are contracts, not a
  sixth organization record kind.
- Specify and implement the version-one Goal record with typed ownership,
  applicability, lifecycle, executable success measures, and fixture-only
  examples.
- Specify and implement versioned policy, knowledge, criteria-set, and exception
  records in the
  [organization authority design](../design/organization-authority.md).
- Add cross-record reference validation and representative records only after
  each format has an accepted decision.
- **Done when:** every accepted context kind has one canonical path, strict
  schema, positive fixture, rejection fixture, and indexed author guidance.

## Phase 3 — Snowcat snapshot import

- Implement atomic import of the
  [repository enrollment contract](../specs/organization-repository-enrollment.md)
  and organization context records in Snowcat.
- Preserve source revision, content hashes, validation results, and activation
  history without giving core credentials or execution state.
- **Done when:** Snowcat can activate one fully valid core revision, reject an
  invalid candidate without partial state, and show the active source revision.

## Phase 4 — Repository conformance and enrollment

- Migrate opted-in repositories to the canonical surfaces in the
  [repository enrollment contract](../specs/organization-repository-enrollment.md).
- Change declarations to `enabled` only in the same reviewed sequence that
  establishes immutable identity, local policy, and required surfaces.
- **Done when:** each enabled declaration reconciles to its GitHub repository
  ID and required canonical surfaces, while one broken repository is held
  without blocking unrelated enrolled repositories.

## Later / ideas

- Generate human-readable catalog pages from validated records without making
  generated output authoritative.
- Add editor integrations that validate a changed declaration before commit.

## Open questions

- **Named detector registry:** define deterministic non-path detectors before a
  governance schema version permits non-empty `detectors`; resolve before the
  first repository needs one.
- **Named-member merge policy:** decide the exact branch protection and
  CODEOWNERS requirements for enrollment changes before the first declaration
  becomes `enabled`.

## References

- Implements: [organization authority](../design/organization-authority.md),
  [repository enrollment](../specs/organization-repository-enrollment.md), and
  [verification profiles](../specs/organization-verification-profiles.md), and
  [organization goals](../specs/organization-goals.md)
- Rationale:
  [ADR-0035](../adr/0035-author-organization-authority-as-strict-json.md) and
  [ADR-0036](../adr/0036-publish-versioned-verification-profiles.md), and
  [ADR-0037](../adr/0037-publish-executable-organization-goals.md)
