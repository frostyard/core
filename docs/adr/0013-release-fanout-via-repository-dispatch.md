# 0013 — Component releases trigger image rebuilds via repository_dispatch "build"

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

OS images bake in frostyard component packages (updex, chairlift,
pilothouse). When a component publishes, the image repos should rebuild
promptly; polling wastes CI and delays pickup, while humans forget to
trigger builds by hand.

## Decision

After a successful publish, a component repo fires a
**`repository_dispatch` with `event-type: build`** at the image repo it
feeds (updex and pilothouse dispatch to `frostyard/snosi`; chairlift
dispatches to `frostyard/snow`), authenticated with the org-level
**`ORG_PAT`** secret. The dispatch step is `continue-on-error: true` — a
failed notification must not fail the release that already published.

## Consequences

- Image freshness is event-driven; a component release propagates to images
  without human action.
- The event name `build` and the `ORG_PAT` secret are unwritten contracts on
  the receiving side — renaming either silently severs the pipeline (the
  dispatch still "succeeds"). This ADR is the record.
- `continue-on-error` means a dropped dispatch is silent; the image repos'
  scheduled builds are the backstop.
- Fan-out targets are per-component knowledge (snosi vs snow); a component
  moving between images means editing its release workflow.

## Alternatives considered

- **Scheduled polling in image repos:** latency and wasted builds; still
  exists as backstop, not primary.
- **Publishing package version bumps as PRs to image repos:** heavier
  machinery for the same signal; images resolve latest packages at build
  time anyway.

## References

- Shapes: [updex `release.yml`](https://github.com/frostyard/updex/blob/main/.github/workflows/release.yml),
  [chairlift `snapshot.yml`](https://github.com/frostyard/chairlift/blob/main/.github/workflows/snapshot.yml),
  [pilothouse `release.yml`](https://github.com/frostyard/pilothouse/blob/main/.github/workflows/release.yml)
- Builds on: [ADR-0010](0010-publish-packages-via-repogen-to-r2.md)
