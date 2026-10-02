# 0056 — The APT publisher triggers image rebuilds after packages are live

- **Status:** Proposed
- **Date:** 2026-10-02

## Context

[ADR-0013](0013-release-fanout-via-repository-dispatch.md) has each component
dispatch `build` to the image repository it feeds after a successful publish.
It authenticates with `ORG_PAT` and marks the step `continue-on-error`.

Under [ADR-0055](0055-publish-debian-packages-through-the-apt-publisher.md), a
component's release only requests publication. The packages become installable
later, when the queued publish run in `frostyard/apt-publisher` finishes. A
`build` dispatched by the component can start before then, and bake in the
previous version.

On 2026-10-02, several component dispatches could not fire:

- pilothouse's and intuneme's are guarded on the default branch but run on tag
  pushes;
- incus's requires the `daily` branch, while it publishes from `stable`; and
- chairlift's release, omarchy-apps and snowcat-cockpit have none.

## Decision

A component whose release publishes `.deb` packages ends its release workflow
with a `repository_dispatch` of type `publish-deb` to `frostyard/apt-publisher`.

- The payload carries `repo`, `tag` and, optionally, `codenames`.
- It authenticates with an `APT_PUBLISH_TOKEN` that can write Contents of
  `frostyard/apt-publisher` only.
- The step is not `continue-on-error`. If it fails, nothing was published, and
  the release run fails.
- The component does not dispatch `build` itself.

After a publication passes read-back verification and the install canary,
apt-publisher dispatches `build` to each repository in the producer's `notify`
registration, for example `frostyard/snosi`. It authenticates with its
`DISPATCH_TOKEN`, and the event name stays `build`.

A component that publishes nothing through apt-publisher keeps ADR-0013's
mechanism: it dispatches `build` after its own successful publish, with
`ORG_PAT` and `continue-on-error: true`.

The image repositories' scheduled builds remain the backstop, and
apt-publisher's nightly audit reports releases whose packages were never
published.

## Consequences

- Image builds start only after the packages they consume are installable.
- Fan-out targets move from component workflows to apt-publisher's producer
  registry. Moving a component between images is a change to that registry.
- A component's release run fails when its publication request can't be sent.
  A failed publish run fails in apt-publisher and is rerun there.
- `build` remains a contract on the receiving side. apt-publisher's
  `DISPATCH_TOKEN` now carries it as well as `ORG_PAT`.
- Component contract tests that pin a direct `build` dispatch, such as updex's
  `release_workflow_contract_test.go`, change to pin the `publish-deb`
  dispatch.

## Alternatives considered

- **Keep the component's direct `build` dispatch.** Rejected: the build races
  the publish queue and can bake in the previous version.
- **Dispatch both.** Rejected: every release triggers two builds, and the first
  is stale.
- **Image repositories poll `/debian/`.** Rejected: ADR-0013 already rejected
  polling as the primary trigger, for latency and wasted builds.

## References

- Shapes: [Debian publication](../design/debian-publication.md),
  [Plan 0009](../plans/0009-debian-publication-through-apt-publisher.md)
- Supersedes: [ADR-0013](0013-release-fanout-via-repository-dispatch.md)
- Builds on: [ADR-0055](0055-publish-debian-packages-through-the-apt-publisher.md)
