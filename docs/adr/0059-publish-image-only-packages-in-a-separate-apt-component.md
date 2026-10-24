# 0059 — Publish image-only packages in a separate APT component

- **Status:** Proposed
- **Date:** 2026-10-24

## Context

`https://repository.frostyard.org/debian/` publishes one component, `main`,
per codename ([ADR-0055](0055-publish-debian-packages-through-the-apt-publisher.md)).
Two kinds of package share it:

- **Packages for any Debian host.** Frostyard tools such as
  `frostyard-updex` and `frostyard-firn`. Debian has no package with their
  names ([ADR-0011](0011-frostyard-prefixed-package-names.md)).
- **Builds that Frostyard images need instead of Debian's.** They replace
  Debian packages of the same name:
  - `libostree-1-1` (frostyard/bootc-debian), version
    `2026.3-frostyard202610040153~deb13` in `trixie`. Debian 13 ships
    `2025.2-1`. Frostyard's build `Conflicts:` and `Replaces:` `ostree` and
    `libostree-dev`. Debian's `flatpak` depends on `libostree-1-1`.
  - `bootc` (frostyard/bootc-debian), linked against that `libostree-1-1`.
    Debian 13 has no `bootc`.
  - `incus`, `incus-base`, `incus-client`, `incus-extra` and
    `incus-ui-canonical` (frostyard/incus), versions `1:7.5.1-debian13-…`.
    Debian 13 ships `incus`, `incus-base`, `incus-client` and `incus-extra`
    `6.0.4-2+deb13u11` through `trixie-security`; it has no
    `incus-ui-canonical`. The `1:` epoch makes every Frostyard build sort above every Debian
    version, including future security updates and forky's `7.0.x`.

On 2026-10-24 `trixie` lists 82 files of these 7 packages, about 2.8 GB.

Without a pin, apt on a plain Debian 13 host that adds `main` selects
Frostyard's builds as the candidates for `libostree-1-1` and Debian's four
`incus` packages. `apt upgrade` replaces Debian's `incus` packages, and
Debian's `libostree-1-1` when neither `ostree` nor `libostree-dev` is
installed; with either installed, the Conflicts hold the library upgrade back
and `apt full-upgrade` can remove them to install it. A replaced package no
longer receives Debian's security updates. The frostyard.org
[APT repository page](https://frostyard.org/docs/tools/apt-repository/)
works around this with a pin (`Pin: release o=Frostyard`,
`Pin-Priority: 100`). A host without the pin is exposed.

Snosi is the only consumer of these builds. It installs them at image build
time from `mkosi.sandbox/etc/apt/sources.list.d/frostyard.sources`
(`Components: main`), which every snosi image and sysext build shares
(snosi [ADR-0020](https://github.com/frostyard/snosi/blob/main/docs/adr/0020-scope-third-party-apt-sources.md)).
Installed images carry no Frostyard APT source: a `snow` image
(`IMAGE_VERSION=20261023083815`) has only `trixie.sources` and
`debian-backports.sources` in `/etc/apt/sources.list.d/`. Images update as a
whole, not through apt.

The page fetches the signing key from `https://repository.frostyard.org/public.key`.
That file is the armored form of apt-publisher's `keys/frostyard.gpg` (the
[ADR-0014](0014-single-gpg-trust-root.md) key). It was uploaded on
2026-01-14, and no repository or workflow writes or checks it.

aptly 1.6.3 publishes several components under one codename and one signed
`Release`. `aptly publish source replace` followed by `aptly publish update`
adds a component to an existing publication in one update, and
`aptly publish switch -component=main,image` switches both in one `Release`.
Each component has its own pool path, `pool/<component>/…`.

## Decision

**Component.** Every codename under `debian/` publishes two components:

- `main`: packages that a plain Debian host of that codename may install.
- `image`: packages built for Frostyard images that replace or depend on a
  replacement of a Debian package. Only Frostyard image builds enable it.

The name describes the consumer, not a product, so it survives image renames
([ADR-0046](0046-rename-cayo-server-image-to-floe.md)). Each codename
publishes `image` even when it is empty, so one sources stanza works for
every codename.

**Rule for `image`.** A package belongs in `image` when Debian ships a binary
package of the same name in a suite a host of that codename can enable (the
codename, `-updates`, `-security`, `-backports`), or when it depends on a
Frostyard package that does. A package name is published in one component
per codename only.

**Packages that move.** `bootc`, `libostree-1-1`, `incus`, `incus-base`,
`incus-client`, `incus-extra` and `incus-ui-canonical`, with every version
`trixie` lists, for every architecture. They leave `main` and appear in
`image` in one publication per codename. No other package moves: no other
package in `main` has a Debian name in `trixie`. `gpu-screen-recorder`
(omarchy-apps) has a Debian name in `forky` only, and omarchy-apps is
registered for `trixie` only.

**Routing.** apt-publisher's `config/producers.tsv` gains a `component`
column. frostyard/bootc-debian and frostyard/incus are registered for
`image`; every other producer for `main`. A producer's packages go only to
its registered component. Producers change nothing: the `publish-deb`
payload stays `{repo, tag, codenames?}`.

**Publisher obligations.** apt-publisher applies its existing guarantees to
each component:

- reconciliation compares the package set of every component with aptly's
  database;
- a publication switches all components of a codename in one `Release`, as
  one recoverable transaction;
- read-back, CDN purge, the apt canary and the audit cover each component;
- a rollback names one snapshot per component. A snapshot taken before the
  move is not a rollback target: the move is reverted only by a forward
  change;
- publication refuses a package name that the codename already publishes in
  the other component.

The nightly audit also reports every `main` package whose name Debian ships
for that codename in the suites above. It is report-only. Moving such a
producer to `image` is a reviewed registration change.

**How snosi enables it.** `mkosi.sandbox/etc/apt/sources.list.d/frostyard.sources`
lists `Components: main image`. No new sources file is added, so snosi
ADR-0020's allowlist does not change. Every snosi image and sysext build sees
both components. No other repository enables `image`, and the frostyard.org
page does not document it.

**Published key.** apt-publisher publishes the binary keyring
`keys/frostyard.gpg` at `debian/frostyard.gpg`, served at
`https://repository.frostyard.org/debian/frostyard.gpg` (SHA256
`7c270b81dfc4084753c9aacadffe436c23f066301e2e0c371261889ee3e3557f` today).

- apt-publisher is its only writer. It uploads the file when the bucket copy
  differs, and every publication reads it back and compares bytes.
- Hosts install it directly as `/etc/apt/keyrings/frostyard.gpg`; no
  `gpg --dearmor` step is needed.
- `/public.key` stays readable and unchanged. It is no longer the documented
  location.

**Migration of hosts and images.**

- **Snosi images and sysexts:** the sandbox change above. Package versions do
  not change, so built images contain the same packages. Installed images
  need nothing: they have no Frostyard APT source.
- **Plain hosts with the pin:** nothing changes. The pin is no longer needed
  and can be deleted.
- **Plain hosts that installed a Frostyard `libostree-1-1`, `bootc` or
  `incus*`:** the package stays installed and no longer upgrades from
  Frostyard. apt does not replace it with Debian's lower version by itself.
  The frostyard.org page documents the disposition of each package:
  - `libostree-1-1` and the installed ones of `incus`, `incus-base`,
    `incus-client` and `incus-extra` return to Debian's version, the `incus`
    packages in one command (`apt install <package>=<Debian version> …`);
  - `bootc` and `incus-ui-canonical` have no Debian package and are removed
    (`apt remove`).
- **Clients of the legacy `stable` suite:** nothing changes. `stable` stays
  frozen (ADR-0055), with its old versions of these packages in `main`.

**Order of changes.** Each step is complete before the next starts.

1. This ADR is accepted.
2. apt-publisher: two components per codename, the `component` column (all
   producers still `main`), the per-component obligations, the key file, the
   Debian-name audit, and a manual move workflow in the `apt-repository`
   concurrency group. Its repository ADR records the mechanism.
3. apt-publisher, manual run: publish an empty `image` in `trixie` and
   `forky`, and the key at `debian/frostyard.gpg`. Check: each `Release`
   lists `Components: image main`, and the key's bytes match.
4. snosi: `Components: main image`, and its integration contract. Check: a
   build passes with `image` empty.
5. apt-publisher: register frostyard/bootc-debian and frostyard/incus for
   `image`, then run the move workflow at once. It moves every published
   version whose component differs from its producer's registration. A
   publication request between the merge and the move fails closed on the
   one-component rule; it is rerun after the move. Check: `main` lists none
   of the 7 packages, `image` lists all 82 files, and a snosi build passes.
6. frostyard.org: the APT page drops the pin, uses
   `https://repository.frostyard.org/debian/frostyard.gpg`, and documents the
   return to Debian's version. The core
   [Debian publication](../design/debian-publication.md) design and the
   apt-publisher README describe both components.

Repogen does not change. Its
[ADR-0003](https://github.com/frostyard/repogen/blob/main/docs/adr/0003-single-main-component.md)
governs repogen's own generator, which no longer writes Frostyard's Debian
metadata (ADR-0055).

## Consequences

- A plain Debian host that adds the repository as documented never receives
  Frostyard's `libostree-1-1`, `bootc` or `incus*`, with or without a pin.
  Debian's security updates for those packages keep reaching it.
- The guarantee holds only while `main` follows the rule. The audit reports
  a new Debian name in `main` (for example when Debian adds a package to
  `trixie-backports`) only after the fact, at most one day later.
- The move uploads about 2.8 GB under `debian/pool/image/`. The copies under
  `debian/pool/main/` stay, because nothing deletes pool files. aptly's state
  pool does not grow: it stores each file once.
- apt-publisher's scripts, tests and recovery procedures grow a component
  dimension. Rollback and recovery name one snapshot per component.
- Snapshots taken before the move cannot be rolled back to.
- Hosts that already installed a Frostyard build keep it until an operator
  returns it to Debian's version or removes it. Because of the `1:` epoch,
  returning the `incus` packages is a downgrade that apt asks to confirm.
- Snosi depends on the `image` component. A host that enables `image` by
  hand gets the builds without support.
- The documented key URL moves under `debian/`, where its writer reads it
  back. Hosts no longer need `gpg` to install the key.

## Alternatives considered

- **Keep one component and require the pin:** rejected. A host without the
  pin is exposed, and the pin also lowers the priority of every Frostyard
  package.
- **A separate prefix for images (for example `debian-image/`):** rejected.
  It needs a second aptly publication tree with its own pool, signed indexes
  and reconciliation, and an additional repository URI in snosi.
- **A separate codename under `debian/` (for example `trixie-image`):**
  rejected. Each Debian codename gets a second signed publication that the
  writer must switch, reconcile and roll back in step with the first, and
  the extra codenames break the rule that a codename names a Debian release
  (ADR-0055). A component gives the same separation under one signed
  `Release` per codename.
- **Name the component `snosi` or `bootc`:** rejected. Products are renamed,
  and `incus` is not bootc.
- **Version the builds below Debian's:** rejected. Snosi needs them to win
  over Debian's packages in its own builds. Without the `1:` epoch, every new
  `incus` build would also sort below the builds already published.
- **Move only the newest version of each package:** rejected. It saves about
  2.5 GB of R2 storage, but leaves older versions installable from `main`
  and removes them from snosi's builds.
- **Refuse Debian names at publication time:** rejected. It makes every
  publication depend on a Debian mirror. Registrations are reviewed, and the
  nightly audit catches names that Debian adds later.
- **Name `/public.key` as the key location:** rejected. It has no writer and
  no check, and it is outside the `debian/` tree that ADR-0055 gives
  apt-publisher.

## References

- Shapes: [Debian publication](../design/debian-publication.md),
  [apt-publisher README](https://github.com/frostyard/apt-publisher/blob/main/README.md),
  snosi [`frostyard.sources`](https://github.com/frostyard/snosi/blob/main/mkosi.sandbox/etc/apt/sources.list.d/frostyard.sources)
  and [integration contracts](https://github.com/frostyard/snosi/blob/main/docs/integration-contracts.md),
  the frostyard.org [APT repository page](https://github.com/frostyard/frostyard-org/blob/main/src/content/docs/docs/tools/apt-repository.md)
- Builds on: [ADR-0011](0011-frostyard-prefixed-package-names.md),
  [ADR-0014](0014-single-gpg-trust-root.md),
  [ADR-0055](0055-publish-debian-packages-through-the-apt-publisher.md),
  snosi [ADR-0020](https://github.com/frostyard/snosi/blob/main/docs/adr/0020-scope-third-party-apt-sources.md)
- Related: repogen
  [ADR-0003](https://github.com/frostyard/repogen/blob/main/docs/adr/0003-single-main-component.md),
  [ADR-0049](0049-retire-omarchy-apps-without-breaking-snosi.md)
