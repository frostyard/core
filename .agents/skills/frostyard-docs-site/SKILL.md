---
name: frostyard-docs-site
description: Apply a Frostyard-branded ProperDocs + MaterialX documentation site to a frostyard tool repository. Use when a tool that people install needs user documentation beside its source — creates site/ from the scaffold payload, the site.yml GitHub Pages workflow, and the make site and make site-serve targets.
user-invocable: true
---

# frostyard docs site — apply procedure

## Purpose and scope

A frostyard repository whose product people install gets a documentation site
at `site/`, next to the source, so that pages change in the same pull request
as the behavior they describe. ProperDocs builds it with the MaterialX theme,
and GitHub Pages serves it at `https://frostyard.github.io/PROJECT/`. The
layout and its reasons are in frostyard/core:
[ADR-0070](https://github.com/frostyard/core/blob/main/docs/adr/0070-build-tool-docs-sites-with-materialx-on-github-pages.md).

- **A tool needs 1 user documentation home**: a CLI, a daemon, a suite app.
  The home is its own site or a full guide on frostyard.org
  ([ADR-0084](https://github.com/frostyard/core/blob/main/docs/adr/0084-accept-a-tools-own-site-or-a-frostyard-org-guide-as-its-docs-home.md)).
  Apply this skill only to a tool that has no home and gets a new site.
- **An existing site stays as it is**: a site that another generator
  builds, or that is in another path, is not moved only for its layout.
- **Libraries do not**: clix, std and snowkit use pkg.go.dev only.
- **frostyard.org stays an Astro site.** It links to each tool site, or
  holds the tool's full guide.
- **frostyard/lab's Astro QA dashboard is exempt.**
- **frostyard/snosi has no site**: frostyard.org documents its images and
  sysexts
  ([ADR-0080](https://github.com/frostyard/core/blob/main/docs/adr/0080-document-the-snosi-images-on-frostyard-org.md)).

The payload is in [scaffold/](scaffold/). It is copied as `site/`:

- `properdocs.yml` — site name, URL, navigation, theme, plugins, Markdown
  extensions.
- `requirements.in` and `requirements.txt` — the MaterialX requirement and the
  hash-locked closure.
- `content/` — the pages, the Frostyard stylesheet and the logo placeholder.

The templates that go outside `site/` are in [templates/](templates/):
[site.yml](templates/site.yml) for `.github/workflows/`, and
[site.mk](templates/site.mk) for the Makefile.

## Brand rules

These rules hold for every word and pixel you write:

- **Sentence case headings.** Only the first word and proper names take a
  capital.
- **Product names lowercase**: `nsl`, `snosi`, `updex`, not Nsl or Snosi.
- **A calm declarative tone.** Say what the tool does. Do not promise, sell or
  exclaim.
- **No emoji.** Glyphs are limited to `❄ ✦ ↗ ← →`.
- **The palette comes only from `content/stylesheets/frostyard.css`**, which
  holds the Frostyard tokens. Do not add a colour anywhere else.
- **`font: false` stays.** It keeps the site free of Google Fonts requests, so
  the page loads no font from a third party.

## Pre-flight

1. **Abort if `site/` already exists.** Never overwrite it. Tell the user and
   stop.
   - A repository that still has the retired Astro site converts by hand: move
     its pages into `site/content/`, then apply this skill. Do not delete the
     old tree for the user.
2. Derive two values, and ask the user when a source is missing instead of
   guessing:
   - `PROJECT` — the repository name from `git remote get-url origin`
     (lowercase, without `.git`).
   - `PROJECT_DESCRIPTION` — one sentence, from
     `gh repo view --json description -q .description`.
3. Read the README and `docs/` before you write pages. They are the source of
   every fact the site states.

## Apply

4. Copy the payload: `cp -R <this skill's directory>/scaffold site`.
5. Replace both placeholders in `site/properdocs.yml` and in every page under
   `site/content/`. `grep -rn 'PROJECT' site` must print nothing when you are
   done. The `copyright:` line names MIT; change it to the repository's own
   license when that is not MIT (chairlift, firn and igloo use GPL-3.0).
6. Copy `templates/site.yml` to `.github/workflows/site.yml`. It builds the
   site on a pull request and deploys it from `main`.
7. Paste `templates/site.mk` into the repository's `Makefile`, and add `site`
   and `site-serve` to its `.PHONY` line. `make ci` does not build the site.
8. Add these lines to `.gitignore`, creating the file if it is missing:

   ```
   site/dist/
   build/
   ```

9. Seed `site/content/` from the README and from `docs/`. `docs/` keeps the
   maintainer contracts (ADRs, designs, specs, plans); the site is for users.
   Replace the placeholder paragraphs with real pages, and delete the sample
   pages the repository does not need.
10. Point `README.md` at the site: one line under the description, with the
    site URL. The README stays the short entry on GitHub.
11. Add one line to `docs/org-adrs.md` for core ADR-0070: the decision, and
    why it binds this repository. The file lists the org decisions the
    repository follows, so the layout decision sits beside the others.

## Verify

12. `make site` must exit 0. Strict mode fails the build on a broken relative
    link or a missing anchor.
13. Offer `make site-serve` for a visual check: the preview listens at
    `http://127.0.0.1:8000/PROJECT/`.
14. Open a pull request. Do not merge it.

## Brian's step: enable Pages

GitHub Pages must use "GitHub Actions" as its source. The machine account must
not change repository settings, so hand this command to Brian:

```sh
gh api -X POST repos/frostyard/PROJECT/pages -f build_type=workflow
```

## Maintenance

- **Refresh the lock** when a dependency moves:
  `uv pip compile --universal --generate-hashes site/requirements.in -o site/requirements.txt`.
  The repository's hygiene line does this; a hand edit of
  `requirements.txt` breaks `--require-hashes`.
- **Keep the stylesheet in step.** `content/stylesheets/frostyard.css` is a
  copy of this skill's file. When the Frostyard tokens change, re-copy it.
- **Keep the pages true.** A change to user-visible behavior changes the
  affected page in the same pull request.

## Authoring

- **Navigation** is the `nav:` list in `site/properdocs.yml`. A page that is
  not in `nav` is a warning, and `--strict` turns a warning into a failure.
- **`--strict`** fails on an unrecognized link, an absolute link and a
  dangling anchor. Use relative `.md` links between pages.
- **Blocks**: use an admonition (`!!! note`), a tabbed block (`=== "Title"`),
  a collapsible block (`??? note`) and a fenced code block with the `mermaid`
  language. The extensions for them are already configured.
- **The hero** on the home page uses the `fy-*` classes from the stylesheet:
  `fy-hero`, `fy-hero__text`, `fy-eyebrow`, `fy-hero__lede`, `fy-hero__icon`,
  and the `grid cards` container for the summary blocks.
