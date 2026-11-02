# 0066 — Build only the omarchy-apps packages that Snosi uses

- **Status:** Accepted; amends [ADR-0060](0060-publish-omarchy-apps-through-the-apt-publisher.md) in part
- **Date:** 2026-11-02

## Context

[ADR-0060](0060-publish-omarchy-apps-through-the-apt-publisher.md) makes
`frostyard/omarchy-apps` an active producer of twelve packages: `aether`,
`cliamp`, `gpu-screen-recorder`, `herdr`, `hyprland-preview-share-picker`,
`moonlight-qt`, `omacalc`, `omacut`, `omawrite`, `tensaku`, `ttfx` and
`voxtype`. Each push to its `main` builds and publishes all twelve to
`trixie`.

The twelve were built for Snosi's flurry desktop, an Omarchy replica.
frostyard/snosi#908 removed the flurry image on 2026-08-31.

On 2026-11-02 the remaining Frostyard consumers of these packages are two
Snosi sysexts:

- `voxtype`: Snosi's `mkosi.images/voxtype/mkosi.conf`
  (`Packages=voxtype`) and `required-paths.txt`, its `sysupdate.voxtype.d`
  transfer, and the frostyard.org page `docs/sysexts/voxtype`.
- `moonlight-qt`: Snosi's `mkosi.images/moonlight/mkosi.conf`
  (`Packages=moonlight-qt`) and `required-paths.txt`, and the frostyard.org
  page `docs/sysexts/moonlight`.

No Snosi image, sysext, package list or script, no other Frostyard
repository, and no frostyard.org page names the other ten.

`trixie` `main` lists seven versions of each of the twelve packages, all
amd64. Seventy of those versions belong to the ten unused packages. Legacy
`stable` lists two versions of each of the twelve.

## Decision

omarchy-apps builds and publishes two packages, `voxtype` and
`moonlight-qt`.

- The build matrix, the release check and the weekly upstream check list
  only those two. The recipes of the other ten leave the repository; Git
  history keeps them.
- The apt-publisher registration of omarchy-apps names only `moonlight-qt`
  and `voxtype`. It changes after the first two-package release is
  published, so that no release is refused in between.
- Versions of the ten removed packages that are already published stay in
  `trixie`, in legacy `stable` and in the pool. Withdrawing or deleting them
  is a separate decision.

This amends the following statements of ADR-0060: "an active producer of its
twelve packages", "the twelve exact package names", "builds the twelve amd64
packages", "All twelve package names receive new versions again; none is
frozen" and "Each merge to omarchy-apps's `main` publishes all twelve
packages". Everything else in ADR-0060 stands: publication through the
apt-publisher, `trixie` only, `attested=no`, a release on each push to
`main`, and the `build` dispatch to Snosi.

## Consequences

- Each push to omarchy-apps's `main` builds two packages instead of twelve,
  and its upstream checks follow two upstreams.
- The ten removed packages get no new versions. A host that installed one
  keeps its installed version and receives no updates while the published
  versions stay in the index.
- After the registration changes, the apt-publisher refuses any
  omarchy-apps release that holds one of the ten names, including a re-run
  of an older twelve-package release.
- The `forky` question in ADR-0060 now concerns only `voxtype` and
  `moonlight-qt`: `gpu-screen-recorder` no longer needs a name decision.
- A Frostyard image that needs one of the ten again restores its recipe from
  Git history and its registration, under a new ADR.

## Alternatives considered

- **Keep building all twelve.** Rejected because ten packages have no
  Frostyard consumer and each push rebuilds and republishes them.
- **Retire omarchy-apps and move the two packages to Snosi or another
  producer.** Rejected because omarchy-apps already builds both packages
  from pinned, verified sources and publishes them through the
  apt-publisher; moving them changes the producer without reducing the work.
- **Withdraw the published versions in the same change.** Rejected because
  withdrawal changes what installed hosts see and is not readily reversed;
  it is decided separately.

## References

- Amends in part: [ADR-0060](0060-publish-omarchy-apps-through-the-apt-publisher.md)
- Builds on: [ADR-0055](0055-publish-debian-packages-through-the-apt-publisher.md)
- Shapes: [Plan 0009](../plans/0009-debian-publication-through-apt-publisher.md)
