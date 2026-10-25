# 0061 — Add the image APT component on the first publication run

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

[ADR-0059](0059-publish-image-only-packages-in-a-separate-apt-component.md)
gives every codename under `debian/` two components, `main` and `image`. Its
step 3 publishes an empty `image` in `trixie` and `forky` by a manual
apt-publisher run, after step 2 is complete. Step 2 holds the component
mechanism, the key file `debian/frostyard.gpg`, the report-only audit of
`main` names that Debian ships, the move workflow and apt-publisher's ADR for
the mechanism.

On 2026-10-25 `trixie` and `forky` publish `main` only. aptly 1.6.3 cannot
add a component with `aptly publish switch`; `aptly publish source add`
followed by `aptly publish update` adds one in one signed `Release`.

apt-publisher reconciles aptly's database with the bucket before every
change. A configuration that names `image` for a codename the bucket serves
without it fails that check. So, between a merge that configures `image` and
a manual run that adds it, every publication request fails closed.

## Decision

**Addition.** apt-publisher adds a configured component that a published
codename lacks by itself, on the first publication run after the
configuration names it. This replaces the manual run of ADR-0059 step 3.

- Every run that publishes (publish, withdraw, rollback, import) adds each
  missing configured component, empty, with `publish source add` and
  `publish update`: one signed `Release` per codename, as one recoverable
  transaction with a pending marker per component.
- A publish run also adds it to every configured codename that it puts no
  package into. So the first run after the change adds `image` to both
  `trixie` and `forky`, reads each back, and purges its CDN cache.
- Once a codename publishes every configured component, runs switch as
  before. Removing a component from a published codename is refused.

**Order.** This amends only step 3 of ADR-0059 and its place in the order of
changes:

- The empty `image` goes live with the first publication run after the
  apt-publisher change that configures `main,image` for `trixie` and `forky`.
  Check: each `Release` lists `Components: image main`, and each
  `image/binary-*/Packages` is empty.
- The rest of step 2 can follow the empty `image`. The key file goes live
  with the first publication run after the apt-publisher change that adds
  it, which uploads it when the bucket copy differs. Check: the key's bytes
  match.
- Step 4 (snosi) starts when both `Release` files list `image`. Step 5 (the
  move) still starts only after step 2 is complete.

## Consequences

- Publication requests never fail closed for the addition: the run that
  meets the new configuration performs it.
- No operator chooses the time of the change. It happens on the next
  producer's publication, also when that producer publishes to one codename
  only.
- A producer's publication run changes the `Release` of a codename it does
  not target, once per added component.
- apt-publisher has no manual workflow for adding a component.
- ADR-0059's step 3 text still names a manual run, because Accepted ADRs are
  immutable; readers follow its link to this ADR.

## Alternatives considered

- **A manual workflow run, as ADR-0059 step 3 says:** rejected. Until it
  runs, every publication request fails closed, or the configuration change
  must wait for an operator.
- **Add `image` only to the codenames a run targets:** rejected. `forky`
  would wait for a producer that publishes to it, and snosi's step 4 needs
  both codenames.

## References

- Builds on / Amends: [ADR-0059](0059-publish-image-only-packages-in-a-separate-apt-component.md)
  (step 3 and the order of steps 2 and 3)
- Builds on: [ADR-0033](0033-link-maintenance-in-immutable-adrs.md),
  [ADR-0055](0055-publish-debian-packages-through-the-apt-publisher.md)
- Shapes: [apt-publisher README](https://github.com/frostyard/apt-publisher/blob/main/README.md)
- Evidence: [apt-publisher#15](https://github.com/frostyard/apt-publisher/pull/15)
  (the two-component mechanism),
  [apt-publisher#16](https://github.com/frostyard/apt-publisher/pull/16)
  (`main,image` for `trixie` and `forky`, and the addition)
