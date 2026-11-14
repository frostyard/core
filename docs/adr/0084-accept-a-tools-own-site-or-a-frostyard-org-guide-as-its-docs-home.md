# 0084 — Accept a tool's own site or a frostyard.org guide as its docs home

- **Status:** Accepted
- **Date:** 2026-11-14
- **Amends in part:** [ADR-0070](0070-build-tool-docs-sites-with-materialx-on-github-pages.md)
  (which user documentation meets the rule for a tool)
- **Amends in part:** [ADR-0071](0071-hold-every-code-repository-to-one-baseline.md)
  (item 9, tool documentation site)
- **Amends in part:** [ADR-0080](0080-document-the-snosi-images-on-frostyard-org.md)
  (its statement about every other user-facing tool)

## Context

ADR-0070 gives each user-facing tool one ProperDocs and MaterialX site in
`site/` on GitHub Pages. ADR-0071 item 9 and baseline row B9 hold each
user-facing tool to that layout. The conformance sweep applies the row as
a list of paths in `site/`.

On 2026-11-12, the sweep filed B9 findings against tools that already
have user documentation:

- frostyard/intuneme has its own MkDocs site with the MaterialX theme at
  `https://frostyard.github.io/intuneme/`, built from its root
  `mkdocs.yml` by its `docs.yml` workflow. Its `README.md` links the site
  ([frostyard/intuneme#276](https://github.com/frostyard/intuneme/issues/276)).
- frostyard.org, built from frostyard/frostyard-org, has a full guide for
  4 tools. At commit `32baa97` of that repository:
  `src/content/docs/docs/tools/updex.md`,
  `src/content/docs/docs/tools/igloo.md`,
  `src/content/docs/docs/apps/frostread.md` and
  `src/content/docs/docs/apps/porter.md`. Each page covers installation,
  updates and roll back
  ([frostyard/updex#507](https://github.com/frostyard/updex/issues/507),
  [frostyard/igloo#16](https://github.com/frostyard/igloo/issues/16),
  [frostyard/frostread#74](https://github.com/frostyard/frostread/issues/74),
  [frostyard/porter#37](https://github.com/frostyard/porter/issues/37)).
- frostyard/repogen has no user documentation outside its `docs/` tree
  ([frostyard/repogen#98](https://github.com/frostyard/repogen/issues/98)).

A second set of user pages in `site/` repeats pages that users already
read, and the two copies drift. ADR-0080 accepted the same reason for
snosi.

## Decision

- **A user-facing tool has 1 user documentation home.** The home is 1 of:
  - **its own documentation site:** a site built from the repository's own
    tree, with any generator, that answers at a public URL; or
  - **a full guide on frostyard.org:** a page of its own under
    `src/content/docs/docs/` in frostyard/frostyard-org that covers at
    least installation and updates, not only a short description.
- **`README.md` links that home.** It is the target of the README's
  documentation line ([README spec](../specs/readme.md)).
- **A new site uses ADR-0070's layout.** A tool that has no home and gets
  a site gets the ProperDocs and MaterialX site in `site/` on GitHub Pages,
  made with the `frostyard-docs-site` skill. A tool can instead get a full
  guide on frostyard.org.
- **An existing site is not moved only for its layout.** A site that
  another generator builds, or that is in another path, meets the row as
  it is. Its owner can move it to ADR-0070's layout for other reasons.
- **Row B9 checks the home, not the `site/` paths.** The baseline spec
  states the check for each form of home.

This decision makes these statements of ADR-0070 false. Each now holds
only for a site in ADR-0070's layout, or changes as stated:

- "A user-facing tool has one documentation site, in `site/`, built with
  ProperDocs and the MaterialX theme." The layout applies to a new site
  only; an existing site of another generator or in another path, or a
  full frostyard.org guide, also meets the rule.
- "GitHub Pages hosts the site at `https://frostyard.github.io/<repo>/`",
  "`.github/workflows/site.yml` builds the site in strict mode on every
  pull request that touches it, and builds and deploys it from `main`"
  and "The repository's Pages source is GitHub Actions": these hold for a
  site in the layout. An existing site keeps its own build workflow, host
  and URL; row B9 does not require it to build on pull requests.
- "The site holds installation, guides, concepts and reference", "A
  change to user-visible behavior updates the affected site pages in the
  same pull request" and "`README.md` links to the site", for a tool whose
  home is a frostyard.org guide: the guide holds the user pages, a change
  to user-visible behavior updates them in a second pull request in
  frostyard/frostyard-org, and `README.md` links the guide.
- "frostyard.org ... describes each tool briefly and links to the tool's
  site": frostyard.org can also hold a tool's full guide.
- In its consequences, "every tool site has the same layout, build,
  preview command and URL pattern", "A broken link or anchor fails the
  pull request", "Hosting needs no secret and no account outside GitHub",
  "a site change and a code change land in the same pull request" and "a
  repository with a site needs Python 3 and its own workflow": these hold
  for a site in the layout, not for every tool's home.
- In its consequences, "intuneme moves to the pinned `site/` layout" and
  "chairlift, updex, repogen and firn get sites; igloo gets one when it
  has user documentation": intuneme keeps its site, and a tool without a
  home gets a site or a full frostyard.org guide.
- In its consequences, "pilothouse moves from Astro to MaterialX" and
  "Repositories that applied the Astro scaffold keep a working copy until
  they move": an Astro site that the repository builds and that answers
  at a public URL meets the rule and does not have to move. A site that
  is not deployed is no home; ADR-0070 records pilothouse's site as never
  deployed on 2026-11-05.

This decision makes this statement of ADR-0071 false:

- Item 9, "a user-facing tool has a ProperDocs and MaterialX site in
  `site/` on GitHub Pages (ADR-0070)". Item 9 is now: a user-facing tool
  has 1 user documentation home, as this ADR defines it, and `README.md`
  links it.

This decision makes these statements of ADR-0080 false:

- "every other user-facing tool has its own site". Every other
  user-facing tool has 1 user documentation home, as this ADR defines it.
- "frostyard/firn ... keeps its own tool site under ADR-0070": firn's
  home is its own site or a full frostyard.org guide, as for every other
  tool. ADR-0080's snosi exemption still does not cover firn.

The rest of ADR-0070, ADR-0071 and ADR-0080 stays as it is: the layout,
the hash lock, the strict build and the `site.yml` workflow of a new site;
libraries document on pkg.go.dev; lab's exemption; snosi's exemption from
row B9; and every other baseline item.

## Consequences

- Easier: a tool with user documentation that users already read meets
  row B9 with no second copy of its pages. The sweep files B9 only where a
  tool has no home, or where `README.md` does not link it.
- Easier: frostyard.org guides and their tools follow the same pattern as
  snosi's pages (ADR-0080).
- Harder: tool homes no longer share 1 layout, build or URL pattern. A
  reader of 2 tools can meet 2 generators and 2 hosts.
- Harder: an existing site keeps its own build. intuneme's site installs
  its Python requirements unpinned (ADR-0070 rejected that layout for new
  sites), so a dependency release can break its build with no change in
  the repository. Row B9 does not file that; the owner fixes a broken
  build like any other red workflow.
- Harder: for a tool whose home is a frostyard.org guide, a change to
  user-visible behavior cannot update its user pages in the same pull
  request. A second pull request in frostyard/frostyard-org updates them.
- No check script holds the list of homes; the sweep reads each
  repository's `README.md` and the home it links.

## Alternatives considered

- **Keep row B9 as the `site/` paths, and give each tool with a home an
  exemption, as ADR-0080 did for snosi:** the exemption list grows with
  each tool, and each entry restates the same reason.
- **Move every existing home to a ProperDocs site in `site/`:** it copies
  pages that users already read and gives them nothing new; the two copies
  drift.
- **Accept any page that mentions the tool:** a short description that
  links elsewhere is not user documentation, and a tool with only that has
  no home.

## References

- Shapes: [spec: repository baseline](../specs/repository-baseline.md)
  (row B9), [spec: README](../specs/readme.md) (documentation line
  targets),
  [frostyard-docs-site skill](../../.agents/skills/frostyard-docs-site/SKILL.md)
- Builds on: [ADR-0070](0070-build-tool-docs-sites-with-materialx-on-github-pages.md),
  [ADR-0071](0071-hold-every-code-repository-to-one-baseline.md),
  [ADR-0080](0080-document-the-snosi-images-on-frostyard-org.md)
- Related: [ADR-0072](0072-write-every-readme-to-one-standard.md),
  [design: quality loop](../design/quality-loop.md)
