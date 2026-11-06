# 0070 — Build tool docs sites with ProperDocs and MaterialX on GitHub Pages

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

On 2026-11-05, 6 frostyard repositories have a documentation site or a site
configuration, built 3 ways (MaterialX, MkDocs, Astro) on 2 hosts:

| Repository | Generator | Host | State |
| --- | --- | --- | --- |
| nsl | ProperDocs + MaterialX in `site/`, hash-locked `site/requirements.txt`, `make site` | GitHub Pages (`site.yml`) | live |
| intuneme | MkDocs + MaterialX, root `mkdocs.yml`, unpinned `pip install` | GitHub Pages (`docs.yml`) | live |
| lab | Astro in `site/` | GitHub Pages (`pages.yml`) | live, a QA dashboard |
| pilothouse | Astro, core's `frostyard-docs-site` scaffold | Cloudflare Workers | never deployed: the deploy workflow sits in `site/`, not in `.github/workflows/` |
| frostyard-org | Astro, the whole repository | Cloudflare | the organization site |
| chairlift | MkDocs, no theme | none | an internal navigation for quality docs |

Tools with real user documentation in `docs/` and no site: chairlift, updex,
repogen and firn.

Core's `frostyard-docs-site` skill scaffolds an Astro site with Pagefind and
Cloudflare Workers. It needs Node, a Cloudflare API token and account secret,
and a manual workflow move. nsl's layout needs Python, a hash-locked
requirements file, and GitHub Pages, which needs no secret.

The upstream MkDocs is no longer maintained, and Material for MkDocs is in
maintenance mode. ProperDocs is the maintained MkDocs 1.6 successor.
MaterialX (`mkdocs-materialx`) is a maintained Material theme that runs on
it.

Go libraries (clix, std, snowkit) publish their API documentation on
pkg.go.dev from their module source.

## Decision

- **A user-facing tool has one documentation site, in `site/`, built with
  ProperDocs and the MaterialX theme.** A user-facing tool is a repository
  that ships a command, an application or a service that people install.
  The layout is nsl's:
  - `site/properdocs.yml` configures the site, with `docs_dir: content` and
    `site_dir: dist`. `site/dist/` is never committed.
  - `site/content/` holds the pages as Markdown.
    `site/content/stylesheets/frostyard.css` applies the Frostyard palette
    from the `frostyard-design` tokens.
  - `site/requirements.in` names the top-level requirement.
    `site/requirements.txt` locks every dependency with hashes, made by
    `uv pip compile --universal --generate-hashes site/requirements.in -o site/requirements.txt`.
  - `make site` installs the lock into `build/site-venv` with
    `pip install --require-hashes` and runs
    `properdocs build --strict -f site/properdocs.yml`. `make site-serve`
    previews the site. `make ci` does not build the site.
- **GitHub Pages hosts the site at `https://frostyard.github.io/<repo>/`.**
  `.github/workflows/site.yml` builds the site in strict mode on every pull
  request that touches it, and builds and deploys it from `main`. Its
  actions are pinned by commit SHA and its permissions are least-privilege
  (ADR-0021). The repository's Pages source is GitHub Actions.
- **The site is for users; `docs/` is for maintainers.** The site holds
  installation, guides, concepts and reference. `docs/` keeps the ADRs,
  designs, specs and plans (ADR-0025). A change to user-visible behavior
  updates the affected site pages in the same pull request. `README.md`
  links to the site.
- **Libraries have no site.** Their documentation is pkg.go.dev and their
  `README.md`.
- **frostyard.org stays an Astro site** in frostyard-org. It describes each
  tool briefly and links to the tool's site.
- **Exempt:** lab's Astro site, which is a QA dashboard, not tool
  documentation.
- **Core's `frostyard-docs-site` skill applies this layout.** Its
  `scaffold/` is the `site/` payload, built from nsl's site; its
  `templates/` hold `site.yml` and the Makefile fragment; its `tests/` build
  the scaffold in strict mode in core's `scaffold-e2e` CI job. The skill
  keeps the Frostyard brand rules: sentence case headings, lowercase
  product names, no emoji, the Frostyard palette only, and no web-font
  requests (`font: false`).

## Consequences

- Easier: every tool site has the same layout, build, preview command and
  URL pattern. A broken link or anchor fails the pull request. Hosting
  needs no secret and no account outside GitHub.
- Easier: a site change and a code change land in the same pull request.
- Harder: a repository with a site needs Python 3 and its own workflow
  beside its language toolchain. The hash lock needs a refresh with
  `uv pip compile` when MaterialX releases; the repository-hygiene line
  does it.
- New obligations: enabling Pages with GitHub Actions as its source is a
  repository-settings change that the organization owner makes. intuneme moves to the
  pinned `site/` layout; pilothouse moves from Astro to MaterialX;
  chairlift, updex, repogen and firn get sites; igloo gets one when it has
  user documentation. The weekly conformance sweep files these gaps
  against the [repository baseline](../specs/repository-baseline.md); there
  is no single migration wave.
- Repositories that applied the Astro scaffold keep a working copy until
  they move; core no longer maintains the Astro payload.

## Alternatives considered

- **Keep the Astro scaffold on Cloudflare Workers:** it needs Node, a
  Cloudflare token and account secret, and a manual workflow step that one
  repository missed. It gives no capability a tool site needs that
  MaterialX lacks.
- **MkDocs with Material for MkDocs:** both are in maintenance mode.
- **Zensical:** new, and incompatible with the MkDocs plugin ecosystem.
- **Publish `docs/` as the site:** those documents are contracts and
  history for maintainers, not guides for users.
- **Unpinned `pip install` (intuneme's layout):** a dependency release can
  change or break the site with no change in the repository.
- **A site for libraries too:** pkg.go.dev already renders the API from
  source, and a second copy drifts.

## References

- Shapes: [frostyard-docs-site skill](../../.agents/skills/frostyard-docs-site/SKILL.md),
  [spec: repository baseline](../specs/repository-baseline.md),
  [design: shared skills](../design/shared-skills.md),
  [design: quality loop](../design/quality-loop.md)
- Builds on: [ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md),
  [ADR-0025](0025-consolidate-repository-docs-into-docs.md),
  [ADR-0044](0044-expose-the-make-gate-triad-in-every-repository.md)
- Exemplar: nsl
  [ADR-0018](https://github.com/frostyard/nsl/blob/main/docs/adr/0018-user-documentation-site.md),
  [`site/`](https://github.com/frostyard/nsl/tree/main/site)
- Related: [ADR-0071](0071-hold-every-code-repository-to-one-baseline.md)
