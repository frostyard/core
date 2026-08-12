# 0010 — Publish packages through the shared repogen action, incrementally, never deleting

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

Nine-plus repos (updex, chairlift, pilothouse, igloo, firn, nbc, intuneme,
gchlog, snosi, …) publish packages to the org repository. Duplicating
repository-generation logic per repo guarantees drift in signing, layout,
and metadata. Packages already published must survive publishes from repos
that don't hold them locally.

## Decision

- Publication goes through the **shared composite action
  `frostyard/repogen/.github/actions/publish-to-r2`**, which downloads
  existing metadata from R2, runs repogen incrementally over `./dist`, and
  uploads with `aws s3 sync` **without `--delete`**.
- The R2 bucket is the source of truth. There is no garbage collection and
  no unpublish path through the pipeline; removal is a manual bucket
  operation.
- Nightly rebuilds rely on `--skip-duplicates`, keyed on repogen's
  format-aware identity (`name:version:arch` for deb/apk/sysext,
  `name:version:release:arch` for rpm).
- Canonical secret names, identical in every consuming repo:
  `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `REPOGEN_GPG_KEY`, `CLOUDFLARE_ZONE`, `CLOUDFLARE_API_TOKEN`.
- Consumers pin the action to a full commit SHA
  ([ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md)); `@main`
  references (currently igloo) are drift to fix, since an unpinned action
  can change every downstream repo's published output without a downstream
  commit. The action's own `repogen-version: latest` default is the same
  hazard on a second axis and should be pinned by callers.

## Consequences

- One place fixes signing, layouts, and cache purging for every repo.
- "Already published" has a precise meaning (the identity key), so nightly
  republish attempts are no-ops rather than errors or overwrites.
- Never-delete means unbounded growth and no rollback-by-removal; promotion
  is done by moving pointers (`SHA256SUMS`, `latest` tags), not by deleting.
- Failure mode to respect: if incremental metadata cannot be parsed, repogen
  falls back to non-incremental and can truncate published metadata — treat
  that warning as an incident, not noise.

## Alternatives considered

- **Per-repo copies of the publish workflow:** the drift this ADR exists to
  prevent; secret and layout skew across nine repos.
- **`aws s3 sync --delete`:** any single-repo publish would erase every
  other repo's packages.

## References

- Shapes: [repogen `publish-to-r2` action](https://github.com/frostyard/repogen/blob/main/.github/actions/publish-to-r2/action.yml),
  consumer workflows in [updex](https://github.com/frostyard/updex/blob/main/.github/workflows/release.yml),
  [chairlift](https://github.com/frostyard/chairlift/blob/main/.github/workflows/release.yml),
  [pilothouse](https://github.com/frostyard/pilothouse/blob/main/.github/workflows/release.yml)
- Builds on: [ADR-0009](0009-single-artifact-origin-repository-frostyard-org.md)
- Related: [ADR-0014](0014-single-gpg-trust-root.md),
  [ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md)
