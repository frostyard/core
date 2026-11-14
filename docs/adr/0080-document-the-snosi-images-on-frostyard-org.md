# 0080 — Document the snosi images on frostyard.org

- **Status:** Accepted
- **Date:** 2026-11-11
- **Amends in part:** [ADR-0070](0070-build-tool-docs-sites-with-materialx-on-github-pages.md)
  (the repositories that get a tool site)
- **Amends in part:** [ADR-0071](0071-hold-every-code-repository-to-one-baseline.md)
  (the exemptions from item 9, tool site)

## Context

ADR-0070 gives each user-facing tool, "a repository that ships a command,
an application or a service that people install", one ProperDocs and
MaterialX site in `site/` on GitHub Pages. It says that frostyard.org describes each tool briefly and links to
the tool's site. ADR-0071 item 9 and baseline row B9 hold each user-facing
tool to that site.

frostyard/snosi builds the operating system images (snow, snowfield,
sundog, floe) and their sysexts. The conformance sweep applied row B9 to
snosi
([frostyard/snosi#1239](https://github.com/frostyard/snosi/issues/1239)).

The user documentation of the images and sysexts is already on
frostyard.org, built from frostyard/frostyard-org. At commit `b68da18` of
that repository, `src/content/docs/docs/images/` holds 6 pages (the base
image, the 4 images, and install and update), and
`src/content/docs/docs/sysexts/` holds 35 pages (an index, a management
page and 1 page for each sysext). The snosi `README.md` links
`https://frostyard.org/docs/` as its documentation, and the README spec
names frostyard.org/docs as the documentation line target of the `image`
kind. snosi has no `site/` directory.

A second site in snosi repeats the same pages, and the two copies drift.

## Decision

- **frostyard.org is the user documentation site of snosi.** The pages of
  the images and the sysexts stay in frostyard/frostyard-org, under
  `src/content/docs/docs/images/` and `src/content/docs/docs/sysexts/`.
- **snosi has no tool site.** ADR-0070's site layout and ADR-0071 item 9
  do not apply to snosi, and the conformance sweep files no B9 finding for
  it. The baseline spec lists the exemption.
- The rest of ADR-0070 and ADR-0071 stays as it is: every other
  user-facing tool has its own site, and snosi stays held to every other
  baseline item.

## Consequences

- Easier: the images and sysexts have 1 set of user pages, on the site
  that users of the images already read.
- Harder: a change to image or sysext behavior in snosi cannot update its
  user pages in the same pull request. A second pull request in
  frostyard/frostyard-org updates them.
- frostyard/firn, the installer, is a separate repository. It keeps its
  own tool site under ADR-0070; this exemption does not cover it.
- The baseline spec and the `frostyard-docs-site` skill name the
  exemption. No check script holds a per-repository list.

## Alternatives considered

- **A ProperDocs site in snosi that holds the image and sysext pages:**
  it duplicates the frostyard.org pages, or it moves them out of the site
  that the organization's other pages link to.
- **A ProperDocs site in snosi that only links to frostyard.org:** it
  meets the form of row B9 and gives users nothing new.

## References

- Shapes: [spec: repository baseline](../specs/repository-baseline.md),
  [frostyard-docs-site skill](../../.agents/skills/frostyard-docs-site/SKILL.md)
- Builds on: [ADR-0070](0070-build-tool-docs-sites-with-materialx-on-github-pages.md),
  [ADR-0071](0071-hold-every-code-repository-to-one-baseline.md)
- Related: [ADR-0072](0072-write-every-readme-to-one-standard.md)
  ([spec: README](../specs/readme.md), the `image` kind)
- Source: [frostyard/snosi#1239](https://github.com/frostyard/snosi/issues/1239)
- Amended in part by: [ADR-0084](0084-accept-a-tools-own-site-or-a-frostyard-org-guide-as-its-docs-home.md)
  (every other user-facing tool has 1 user documentation home)
