# 0082 — Verify the build provenance of omarchy-apps

- **Status:** Accepted; amends [ADR-0060](0060-publish-omarchy-apps-through-the-apt-publisher.md) and [ADR-0066](0066-build-only-the-omarchy-apps-packages-that-snosi-uses.md) in part
- **Date:** 2026-11-13

## Context

[ADR-0060](0060-publish-omarchy-apps-through-the-apt-publisher.md) registers
`frostyard/omarchy-apps` with the apt-publisher as `attested=no`, because its
build provenance names `refs/heads/main`, not the release tag that the writer
checked. [ADR-0066](0066-build-only-the-omarchy-apps-packages-that-snosi-uses.md)
keeps `attested=no`. ADR-0060 records the consequence: the writer trusts the
release assets as downloaded.

- omarchy-apps's
  [`build.yml`](https://github.com/frostyard/omarchy-apps/blob/main/.github/workflows/build.yml)
  attests every `.deb` of a release with `actions/attest-build-provenance`
  in its run on `main`.
- [apt-publisher ADR-0004](https://github.com/frostyard/apt-publisher/blob/main/docs/adr/0004-pin-the-signer-workflow-of-attested-producers.md)
  (frostyard/apt-publisher#28, merged 2026-11-03) adds the registration value
  `WORKFLOW@refs/heads/BRANCH`. For it, the writer passes
  `--signer-workflow`, `--source-ref refs/heads/BRANCH` and
  `--deny-self-hosted-runners` to `gh attestation verify` for each `.deb`.
- The same change registers omarchy-apps as `build.yml@refs/heads/main`, and
  [`config/producers.tsv`](https://github.com/frostyard/apt-publisher/blob/main/config/producers.tsv)
  holds that row. No producer is `attested=no`.
- On 2026-11-13, both `.deb` files of omarchy-apps's newest release,
  `main-20261102170521-31f199e`, pass that check.

## Decision

omarchy-apps is an attested producer of the Frostyard APT repository. Its
`attested` value in the apt-publisher's `config/producers.tsv` is
`build.yml@refs/heads/main`.

For each `.deb` in an omarchy-apps release, the writer verifies a GitHub
build-provenance attestation from
`frostyard/omarchy-apps/.github/workflows/build.yml`, run on
`refs/heads/main` on a GitHub-hosted runner. A `.deb` that fails the check
stops the publication before any state changes.

This amends these statements:

- ADR-0060's registration item "`attested=no`", and its reason "The build
  provenance names `refs/heads/main`, not the release tag that the writer
  checks". For omarchy-apps, the writer now checks the registered branch
  ref `refs/heads/main`, not a release tag.
- ADR-0060's consequence "The writer verifies no attestation for
  omarchy-apps. It trusts the release assets as downloaded".
- ADR-0066's statement that "`attested=no`" stands.

Everything else in ADR-0060 and ADR-0066, as
[ADR-0067](0067-publish-omarchy-apps-on-change-and-keep-the-newest-two.md)
amends them, stands.

## Consequences

- The writer refuses a `.deb` that `build.yml` on `main` did not build, such
  as a release asset that is replaced or uploaded by hand.
- The integrity of `main` still matters: a commit on `main` produces packages
  that pass the check.
- The release tag is not bound to the attested commit, as apt-publisher
  ADR-0004 records for every branch producer.
- A rename of `build.yml`, or a release from another branch, needs a
  `producers.tsv` change first. Until then, the writer refuses omarchy-apps's
  publications.
- Each `.deb` costs one `gh attestation verify` call per publication.

## Alternatives considered

- **Set the registration back to `attested=no`.** Rejected because it drops a
  check that `build.yml` already supports and the writer runs at little cost.
- **Edit ADR-0060 and ADR-0066 in place.** Rejected because Accepted ADRs
  change only by a new ADR
  ([ADR-0033](0033-link-maintenance-in-immutable-adrs.md)).

## References

- Amends in part: [ADR-0060](0060-publish-omarchy-apps-through-the-apt-publisher.md),
  [ADR-0066](0066-build-only-the-omarchy-apps-packages-that-snosi-uses.md)
- Builds on: [ADR-0055](0055-publish-debian-packages-through-the-apt-publisher.md)
- Related: [ADR-0067](0067-publish-omarchy-apps-on-change-and-keep-the-newest-two.md)
- Shapes: [Plan 0009](../plans/0009-debian-publication-through-apt-publisher.md)
- Implemented in: [`frostyard/apt-publisher`](https://github.com/frostyard/apt-publisher)
  ([ADR-0004 there](https://github.com/frostyard/apt-publisher/blob/main/docs/adr/0004-pin-the-signer-workflow-of-attested-producers.md))
  and [`frostyard/omarchy-apps`](https://github.com/frostyard/omarchy-apps)
