# 0034 — Cancel stale rolling dev releases

- **Status:** Proposed
- **Date:** 2026-08-12

## Context

Frostyard Go repositories publish snapshots to the singleton `dev` release
defined by [ADR-0012](0012-svu-versioning-and-rolling-dev-prerelease.md).
Overlapping GoReleaser runs can both recreate that release and upload assets
with identical names, causing HTTP 422 `already_exists` failures.

Repositories have not applied one concurrency contract. Updex uses the
`goreleaser-nightly` group with `cancel-in-progress: true`; chairlift uses the
project-specific `chairlift-dev-release` group with
`cancel-in-progress: false`; and pilothouse does not serialize snapshot runs.
The variants obscure which behavior a new repository should copy.

## Decision

Every workflow that publishes Frostyard's rolling GoReleaser `dev` release
uses this exact top-level concurrency block:

```yaml
concurrency:
  group: goreleaser-nightly
  cancel-in-progress: true
```

GitHub Actions scopes concurrency groups to a repository, so the group does
not include the project name. Cancelling an active stale run favors the newest
commit whose `main` test workflow succeeded while ensuring that only one run
writes the singleton release at a time.

The [frostyard-go-repo skill](../../.agents/skills/frostyard-go-repo/SKILL.md)
is the canonical workflow guidance. Chairlift and pilothouse are aligned with
that guidance as part of the rollout tracked in the
[org portfolio roadmap](../plans/0002-org-portfolio-roadmap.md).

## Consequences

- Snapshot publication consistently selects the newest tested `main` commit
  instead of spending release capacity on every superseded commit.
- Overlapping runs cannot upload identically named assets to the `dev`
  release.
- The literal group name can be copied between repositories without
  substitution because concurrency groups are repository-scoped.
- A cancelled run may stop after partially changing the `dev` release. The
  newest run repairs it by recreating and publishing the complete release;
  consumers may briefly observe that transition, as they already can during
  any rolling-release replacement.

## Alternatives considered

- **Queue with `cancel-in-progress: false`:** this prevents simultaneous
  uploads, but an older active run can publish immediately before the newest
  pending run replaces it. GitHub retains at most one pending run, so this
  does not preserve every intermediate snapshot.
- **Use a project-specific group:** `<project>-dev-release` is unambiguous but
  adds substitution work without isolation because concurrency groups do not
  cross repository boundaries.
- **Derive the group from workflow metadata:** a dynamic expression avoids a
  literal but makes a small, shared operational contract harder to recognize
  and audit.

## References

- Shapes: the
  [frostyard-go-repo skill](../../.agents/skills/frostyard-go-repo/SKILL.md)
  and [org portfolio roadmap](../plans/0002-org-portfolio-roadmap.md)
- Builds on:
  [ADR-0012](0012-svu-versioning-and-rolling-dev-prerelease.md)
- Tracks: [core issue #10](https://github.com/frostyard/core/issues/10)
