# 0037 — Publish executable organization goals

- **Status:** Accepted
- **Date:** 2026-08-17

## Context

Core can publish immutable verification profiles, but it cannot yet express an
organization outcome that Fluent can apply without asking a model to interpret
scope, priority, or success. A goal must influence future discovery and
admission without becoming work, authorization, or proof that its outcome was
achieved.

Repository names, user logins, and team slugs can change. Using them as joins
would let an identity change alter the meaning of an accepted Core revision.
Goal applicability and measurement subject are also different: several
repositories may contribute to an organization outcome while one measure
observes only one repository.

## Decision

Core publishes version-one Goal records at
`organization/goals/<id>.json`. Each record uses the common organization
envelope and declares lifecycle, accountable GitHub principals, repository
applicability, an inclusive UTC-date work window, one priority band, a bounded
outcome, required success measures, encouraged work, and excluded work.

Owners and repository references use source-native immutable numeric
identities qualified by `github.com`; mutable logins, slugs, and repository
names are display locators only. Applicability is either every enrolled
repository or an explicit non-empty set of repository identities declared in
the same Core catalog. A success measure separately names one typed subject,
an absolute UTC observation window, one exact verification-profile version,
and parameters accepted by that profile.

Goal lifecycle states are `planned`, `active`, `paused`, `completed`, and
`cancelled`. `completed` and `cancelled` are terminal. Accepted transitions are
`planned` to `active`, `paused`, or `cancelled`; `active` to `paused`,
`completed`, or `cancelled`; and `paused` to `active`, `completed`, or
`cancelled`. Once a Goal has appeared in an activated Core snapshot, later
snapshots retain it rather than deleting it. Core validates one candidate tree;
Fluent enforces retention and transitions against activation history.

A Goal is eligible to influence new work only while its status is `active`,
the evaluation date is within its inclusive start and end dates, and the
repository is both enrolled and applicable. It may supply bounded discovery
context and a default priority band during admission. It never creates work,
admits work, grants actions, resolves competing goals, or changes already
admitted work. Admission freezes the cited Goal revision with the work item.

Measurements report outcome evidence but never change Goal lifecycle
automatically. Core lifecycle changes remain reviewed pull requests. Core
publishes no live Goal until every referenced profile mechanism is supported by
Fluent; fixtures establish the contract without activating organization intent.

## Consequences

- Organization direction becomes deterministic input without entering the
  authorization path.
- Immutable identities survive repository renames and principal locator
  changes, at the cost of less convenient hand authoring.
- Goal applicability, measurement subjects, and historical admitted-work
  context remain independently explainable.
- Goal authors must select executable verification profiles and supply valid
  parameters before a record can be accepted.
- Core can validate candidate shape and references, while Fluent must retain
  Goal history and reject illegal lifecycle changes or deletion.
- The v1 success-measure subject registry initially supports GitHub
  repositories; an organization-wide result can use several repository
  measures until a separately registered aggregate subject exists.

## Alternatives considered

- **Treat a Goal as a work generator:** rejected because an outcome statement
  is not evidence of a repository gap and would bypass admission.
- **Use repository slugs and principal logins as identities:** rejected because
  mutable locators are unsafe authority joins.
- **Use one scope field for applicability and measurement:** rejected because
  the repositories expected to act need not be the exact subject observed.
- **Embed prose, queries, or scripts as success rules:** rejected because
  results would be non-reproducible or would move executable authority into
  Core.
- **Complete a Goal automatically from measurements:** rejected because a
  reviewed organization lifecycle decision is broader than one computed
  result.

## References

- Shapes: [organization authority](../design/organization-authority.md),
  [organization goals](../specs/organization-goals.md), and
  [organization authority rollout](../plans/0005-organization-authority-rollout.md)
- Builds on: [ADR-0035](0035-author-organization-authority-as-strict-json.md),
  [ADR-0036](0036-publish-versioned-verification-profiles.md),
  [Fluent ADR-0009](https://github.com/frostyard/fluent/blob/main/docs/adr/0009-apply-goals-through-discovery-and-admission.md), and
  [Fluent ADR-0039](https://github.com/frostyard/fluent/blob/main/docs/adr/0039-use-typed-source-native-subject-identities.md)
