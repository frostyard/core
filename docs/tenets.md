# Tenets

Guiding principles for frostyard projects. When no specific direction exists, follow these tenets.

## How tenets rank

Specific direction comes first: a repository's `AGENTS.md`, its specs, and accepted ADRs win over a tenet. Tenets guide the decisions those documents don't cover yet.

- A decision that departs from a tenet records why in an ADR.
- When an existing ADR conflicts with a tenet, raise the conflict. Don't quietly change the ADR to match the tenet.

## Mission

Frostyard builds bootc Debian images and the tooling to make them comfortable, reliable, and productive for desktop and server use.

## Work with Upstream, not around it

Use as many of the features of modern systemd-based Linux as we can. Work in that ecosystem rather than fighting it. Take the stability of Debian and bring the security and flexibility of modern systemd features. Provide bridges where necessary while Debian's systemd versions catch up to our dreams, and remove each bridge when Debian catches up.

## Delivery

We prefer user-space delivery mechanisms where possible. We put packages in the base and OS images only where the addition is justified by the outcome.

- We use `apt` for what the image itself needs: `frostyard-*` packages ([ADR-0011](https://github.com/frostyard/core/blob/main/docs/adr/0011-frostyard-prefixed-package-names.md)) published through apt-publisher ([ADR-0055](https://github.com/frostyard/core/blob/main/docs/adr/0055-publish-debian-packages-through-the-apt-publisher.md)).
- We prefer `brew` over `apt` for user-space command-line tools.
- We prefer Flatpak for desktop software.
- We prefer systemd-sysext for daemons and system services.
- We use systemd-sysext for GUI tools only where a Flatpak isn't possible or available.

[ADR-0058](https://github.com/frostyard/core/blob/main/docs/adr/0058-ship-suite-desktop-apps-as-flatpaks-and-services-as-sysexts.md) applies this tenet to the suite: Flatpaks for the desktop apps, sysexts for the services.

## Trust what we ship

Everything we ship is signed, pinned, and verifiable. When verification fails, we stop; we don't fall back.

- One GPG trust root, baked into the images ([ADR-0014](https://github.com/frostyard/core/blob/main/docs/adr/0014-single-gpg-trust-root.md)).
- SHA-pinned actions and least-privilege CI ([ADR-0021](https://github.com/frostyard/core/blob/main/docs/adr/0021-sha-pinned-actions-and-least-privilege-ci.md)).
- Version-pinned, checksum-verified downloads ([ADR-0023](https://github.com/frostyard/core/blob/main/docs/adr/0023-verified-pinned-downloads.md)).
- Fail-closed package metadata ([ADR-0048](https://github.com/frostyard/core/blob/main/docs/adr/0048-publish-debian-packages-to-explicit-codenames.md)).

## Updates are safe and can be undone

Every update can be rolled back. We prefer to apply changes at boot rather than change a running system. See the A/B update-state contract ([ADR-0005](https://github.com/frostyard/core/blob/main/docs/adr/0005-native-ab-marker-and-update-state-files.md)) and the sysext update contract ([ADR-0008](https://github.com/frostyard/core/blob/main/docs/adr/0008-sysext-distribution-and-update-contract.md)).

## Lightly Opinionated

We ship mostly stock OS images with light opinions baked in. Quality of life improvements rather than bespoke customization. We leave that for the end user.

## Experiment with impunity

We strive to keep the OS images as stable as possible; we use them for our own desktops and servers. The other software we build (Chairlift, Frostmail, etc.) is experimental. Sometimes it works, sometimes it doesn't.

- Experiments ship in user-space layers (brew, Flatpak, sysext), so they can't destabilize the base image. That boundary is what lets them move fast.
- We experiment, measure success, and retire or promote experiments. An incubating repository has exit criteria and a decision date ([Plan 0002](https://github.com/frostyard/core/blob/main/docs/plans/0002-org-portfolio-roadmap.md)).
- A retirement names its successor, as [ADR-0027](https://github.com/frostyard/core/blob/main/docs/adr/0027-retire-fisherman-superseded-by-firn.md), [ADR-0028](https://github.com/frostyard/core/blob/main/docs/adr/0028-retire-snosi-install-superseded-by-firn.md), and [ADR-0031](https://github.com/frostyard/core/blob/main/docs/adr/0031-retire-dakota-secure-bootc-installer.md) did.

## Users keep their data

The software we build keeps users' data in their own hands. We prefer plain, open formats (frostnotes keeps notes as plain markdown) and self-hosted services. First-party apps run behind lodge on the user's own tailnet ([ADR-0057](https://github.com/frostyard/core/blob/main/docs/adr/0057-run-first-party-apps-behind-lodge.md)).

## If we ship it, we document it

Everything we ship has user documentation on [frostyard.org](https://frostyard.org): what it is, how to install it, update it, and roll it back.

## Agents do the work; people hold the keys

Agents do most of the work in this organization ([ADR-0002](https://github.com/frostyard/core/blob/main/docs/adr/0002-agent-portable-instruction-surface.md), [ADR-0018](https://github.com/frostyard/core/blob/main/docs/adr/0018-org-wide-agent-instruction-and-knowledge-surfaces.md)). Merges, tags, releases, and settings stay with a person ([ADR-0019](https://github.com/frostyard/core/blob/main/docs/adr/0019-governance-as-code-and-risk-tiers.md), [ADR-0020](https://github.com/frostyard/core/blob/main/docs/adr/0020-ai-automation-trust-boundaries.md)).
