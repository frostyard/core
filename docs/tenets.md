# Tenets

Guiding principles for frostyard projects. When no specific direction exists follow these tenets.

## Mission

Frostyard builds bootc Debian images and the tooling to make them comfortable, reliable, and productive for desktop and server use.

## Work with Upstream, not around it

Use as many of the features of modern systemd-based Linux as we can. Work in that ecosystem rather than fighting it. Take the stability of Debian and bring the security and flexibility of modern systemd features. Provide bridges where necessary while Debian's systemd versions catch up to our dreams.

## Delivery

We prefer user-space delivery mechanisms where possible. We put packages in the base and OS images only where the addition is justified by the outcome.

- we prefer `brew` over `apt` for user-space tools
- we prefer Flatpak for desktop software distribution
- we prefer systemd-sysext for daemons, or GUI tools where flatpaks aren't possible or available

## Lightly Opinionated

We ship mostly stock OS images with light opinions baked in. Quality of life improvements rather than bespoke customization. We leave that for the end user.

## Experiment with impunity

We strive to keep the OS images as stable as possible, we use them for our own desktops and servers. The other software we build (Chairlift, Frostmail, etc.) is experimental. Sometimes it works, sometimes it doesn't. We experiment, measure success, and retire or promote experiments.
