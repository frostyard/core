# 0067 — Publish omarchy-apps packages on change, and keep the newest two

- **Status:** Accepted; amends [ADR-0055](0055-publish-debian-packages-through-the-apt-publisher.md), [ADR-0060](0060-publish-omarchy-apps-through-the-apt-publisher.md) and [ADR-0066](0066-build-only-the-omarchy-apps-packages-that-snosi-uses.md) in part
- **Date:** 2026-11-02

## Context

[ADR-0060](0060-publish-omarchy-apps-through-the-apt-publisher.md) and
[ADR-0066](0066-build-only-the-omarchy-apps-packages-that-snosi-uses.md)
make each push to `frostyard/omarchy-apps`'s `main` build and publish its
packages, `voxtype` and `moonlight-qt`, to `trixie`.

- A version is `<upstream>-frostyard<UTC build time>`. A push that changes
  neither an app's upstream pin nor its recipe still publishes a new version
  of that app, with the same upstream binary.
- On 2026-11-02 `trixie` `main` lists eight versions of each of the two
  packages. Six of the eight `voxtype` versions are builds of `0.7.5` and two
  of `1.1.1`; six of the `moonlight-qt` versions are builds of `6.1.0` and
  two of `6.2.0`.
- Each publication also sends a `build` dispatch to Snosi
  ([ADR-0056](0056-rebuild-images-after-apt-publication.md)), which rebuilds
  its images.

[ADR-0055](0055-publish-debian-packages-through-the-apt-publisher.md)
removes a version from a codename only through a manual withdrawal of one
version, or a point-in-time rollback. No version leaves the index otherwise,
so the list grows with every publication.

## Decision

**Publish on change.** omarchy-apps publishes an app only when the inputs of
that app change.

- An app's inputs are its recipe `apps/<app>.sh`, its entry in
  `download/checksums.json` (upstream version, URL and SHA256), and the
  shared build files `build.sh`, `lib/deb.sh` and
  `download/verified-download.sh`. Their SHA256 digest goes into the
  package's control field `Frostyard-Inputs: sha256:<digest>`.
- A push to `main` reads the published `trixie` `main` amd64 index. It builds
  and publishes the apps whose newest published version does not carry the
  current digest, and no others. A push that changes no app's inputs
  publishes nothing.
- A manual run of the Build workflow on `main` names one app in its `rebuild`
  input, and publishes that app whatever its digest.
- Pull requests and runs on other branches build every app and publish
  nothing.

**Keep the newest versions.** A producer's registration in the
apt-publisher's `config/producers.tsv` has a seventh column, `keep`: a
positive count N, or `-` for no limit.

- When a producer with a count publishes, the apt-publisher keeps, in each
  target codename, the newest N versions of each package name that matches
  the producer's globs, for each architecture, in the producer's component.
  It removes every older version from the index in the same snapshot and the
  same publication as the new packages.
- A release that holds a version older than the newest N is refused before
  any state changes.
- Pool files stay, as for every withdrawal and rollback.
- `frostyard/omarchy-apps` has `keep` 2. Every other producer has `-`.

This amends these statements:

- ADR-0055's list of what a registration holds, and its two ways to remove a
  version: a retention count adds a third.
- ADR-0060's **Release** rule, in which each push to `main` builds the
  packages, publishes a release of them and sends `publish-deb`: a push to
  `main` now does so only for the apps whose inputs changed.
- ADR-0066's statement that "a release on each push to `main`" stands, with
  the same change.

Everything else in those ADRs stands.

## Consequences

- omarchy-apps publishes a version, and Snosi rebuilds for it, only when an
  upstream pin, a recipe or a shared build file changes.
- The Debian base image and the packages that apt installs during a build are
  not inputs. A Debian change that matters needs a manual `rebuild`.
- A push to `main` fails when the published index cannot be read, instead of
  publishing every app. A push that comes before the previous publication is
  in the index can publish one more version of the same inputs; the count
  removes it later.
- The first publication after the change builds both apps again, because no
  published version carries the field yet.
- `trixie` lists at most two versions of each omarchy-apps package after its
  first publication with the count. A host that installed an older version
  keeps it, but apt cannot install that version again.
- A version that the count removed comes back only through a rollback to an
  earlier snapshot. Republishing its release is refused while two newer
  versions are listed. A withdrawal of the newest version leaves one.
- Other producers keep every version until their registration sets a count.

## Alternatives considered

- **Detect changes from the pushed commits.** Rejected because a failed or
  cancelled run loses the change: the next push no longer sees it. The
  published index records what is published.
- **omarchy-apps requests withdrawals after it publishes.** Rejected because
  it needs a second writer request and a second publication for each release,
  and a failure between the two leaves extra versions.
- **Keep versions for a time, not a count.** Rejected because omarchy-apps
  publishes rarely and at no fixed rate; a time window can remove every
  version but one, or keep many.
- **Keep every version.** Rejected because the index then grows with every
  rebuild of the same inputs.

## References

- Amends in part: [ADR-0055](0055-publish-debian-packages-through-the-apt-publisher.md),
  [ADR-0060](0060-publish-omarchy-apps-through-the-apt-publisher.md),
  [ADR-0066](0066-build-only-the-omarchy-apps-packages-that-snosi-uses.md)
- Builds on: [ADR-0056](0056-rebuild-images-after-apt-publication.md)
- Shapes: [Debian publication](../design/debian-publication.md),
  [Plan 0009](../plans/0009-debian-publication-through-apt-publisher.md)
- Implemented in: [`frostyard/omarchy-apps`](https://github.com/frostyard/omarchy-apps)
  and [`frostyard/apt-publisher`](https://github.com/frostyard/apt-publisher)
  ([ADR-0003 there](https://github.com/frostyard/apt-publisher/blob/main/docs/adr/0003-keep-the-newest-versions-of-a-producer.md))
