# 0060 — Publish omarchy-apps through the apt-publisher

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

[ADR-0049](0049-retire-omarchy-apps-without-breaking-snosi.md) retired
`frostyard/omarchy-apps` as a publisher. It published no new package
versions, kept `voxtype` and `moonlight-qt` indexed for Snosi, froze the
other ten package names, and planned to archive the repository. The risk it
addressed was the legacy path: any merge to `main` republished all twelve
packages to implicit `stable` through Repogen's `publish-to-r2`.

That path is closed:

- Since 2026-10-03 the organization's `R2_*` and `REPOGEN_GPG_KEY` secrets
  reach only Snosi ([Plan 0009](../plans/0009-debian-publication-through-apt-publisher.md),
  Phase 4).
- [ADR-0055](0055-publish-debian-packages-through-the-apt-publisher.md) makes
  `frostyard/apt-publisher` the single Debian writer. Before it changes any state, it
  refuses unregistered producers, package names outside a producer's
  registration, codenames the producer may not publish to, and architectures
  the target codename does not publish.

Snosi still builds its `voxtype` and `moonlight` sysexts from the
`voxtype` and `moonlight-qt` packages.

## Decision

omarchy-apps is an active producer of its twelve packages, and publishes them
through the apt-publisher as ADR-0055 describes.

- **Registration** (frostyard/apt-publisher#12): the twelve exact package
  names, `trixie` only, `attested=no`, notify `frostyard/snosi`.
  - The versions carry no `~deb13` marker.
  - The build provenance names `refs/heads/main`, not the release tag that
    the writer checks.
- **Release** (frostyard/omarchy-apps#2): each push to `main` builds the
  twelve amd64 packages in `debian:trixie`, publishes a GitHub release
  `main-<UTC time>-<short sha>` of exactly those `.deb` files, and sends
  `publish-deb` for `trixie`. The repository holds no signing key and no
  bucket credentials.
- The first release, `main-20261022024102-da2ea04`, was published on
  2026-10-22 by
  [publish run 39712749795](https://github.com/frostyard/apt-publisher/actions/runs/39712749795).

ADR-0049's credential removal stands. Its freeze of new versions and its plans
to disable Actions and to archive the repository no longer apply.

## Consequences

- Snosi's `voxtype` and `moonlight` sysexts can take new versions without a
  successor producer.
- All twelve package names receive new versions again; none is frozen.
- Each merge to omarchy-apps's `main` publishes all twelve packages. Its
  dependency updates need review like any other producer's.
- The writer verifies no attestation for omarchy-apps. It trusts the release
  assets as downloaded, so the integrity of `main` and of the release matters.
- `forky` needs its own build. `gpu-screen-recorder` is also a Debian package
  in `forky`, so a `forky` registration needs a decision about that name first.
- The apt-publisher's nightly audit covers omarchy-apps like every registered
  producer.

## Alternatives considered

- **Keep ADR-0049's freeze.** Rejected because new `voxtype` and
  `moonlight-qt` versions would first need a new producer, while the writer
  already removes the risk that the freeze addressed.
- **Publish only `voxtype` and `moonlight-qt`.** Rejected because the
  workflow builds all twelve apps together, and the registration already
  limits publication to those exact names.

## References

- Supersedes: [ADR-0049](0049-retire-omarchy-apps-without-breaking-snosi.md)
- Builds on: [ADR-0055](0055-publish-debian-packages-through-the-apt-publisher.md),
  [ADR-0056](0056-rebuild-images-after-apt-publication.md)
- Related: [ADR-0059](0059-publish-image-only-packages-in-a-separate-apt-component.md)
- Shapes: [Plan 0009](../plans/0009-debian-publication-through-apt-publisher.md)
