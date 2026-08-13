# 0012 — svu-derived versions, make bump, and the rolling dev prerelease

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

Frostyard Go tools release continuously from `main`. Hand-picked version
numbers invite bikeshedding and skipped steps; ad-hoc nightly tags
accumulate into release-list noise; and Debian packaging imposes syntactic
constraints on snapshot versions (must begin with a digit).

## Decision

- **Versions come from svu** over Conventional Commits, configured
  `tag.prefix: v`, `always: true`, `v0: true`. Byte-identical `.svu.yaml`
  exists across the fleet (clix, firn, intuneme, nbc, pm, snowkit,
  chairlift, updex, pilothouse…).
- **`make bump` is the only sanctioned tagging path**: it builds, tests,
  lints, requires a clean tree on `main`, then creates and pushes the svu
  tag.
- **Nightlies are one rolling prerelease under the literal tag `dev`**
  (`keep_single_release: true`), versioned `{{ incmajor .Version }}-dev` so
  it sorts above every real release; snapshot builds are versioned
  `{{ .ShortCommit }}-snapshot`; the tag `continuous` is ignored. Snapshot
  publication triggers via `workflow_run` only after the Tests workflow
  succeeds on `main` — never from an untested commit.
- The snapshot workflow must serialize uploads to the single `dev` release
  via a named concurrency group. Two implementations exist —
  `cancel-in-progress: true` (updex, avoids HTTP 422 collisions) and
  `cancel-in-progress: false` (chairlift/pilothouse, queues instead) — the
  invariant is "no two concurrent uploads"; [ADR-0034](0034-cancel-stale-rolling-dev-releases.md)
  resolves the harmonization work.
- Where Debian snapshot packages are built, version templates start with a
  literal `0.0.0-` because `.ShortCommit` is hex and a Debian version must
  begin with a digit (~3 in 8 commits would otherwise fail).

## Consequences

- Version numbers are a function of history, not opinion; a release is one
  `make bump` away and always green by construction.
- Exactly one `dev` release per repo: testers have a stable URL, and the
  release list stays readable.
- The `incmajor`/`continuous`/concurrency details look like cruft and will
  attract "cleanup" — each removal reintroduces a real failure. This ADR is
  the do-not-simplify record.

## Alternatives considered

- **Hand-tagged semver:** human gatekeeping with no information gain over
  commit history.
- **Dated nightly tags:** unbounded release-list growth; consumers must
  discover the newest instead of following `dev`.

## References

- Shapes: [updex `.goreleaser.yaml` + `snapshot.yml`](https://github.com/frostyard/updex/blob/main/.goreleaser.yaml),
  [chairlift `.svu.yaml`](https://github.com/frostyard/chairlift/blob/main/.svu.yaml),
  [pilothouse `scripts/bump.sh`](https://github.com/frostyard/pilothouse/blob/main/scripts/bump.sh),
  the [frostyard-go-repo skill](../../.agents/skills/frostyard-go-repo/SKILL.md)
- Builds on: [ADR-0011](0011-frostyard-prefixed-package-names.md)
- Refined by: [ADR-0034](0034-cancel-stale-rolling-dev-releases.md)
