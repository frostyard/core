# Frostyard docs landing page - design

Date: 2026-07-23
Status: approved

## Purpose

Replace the scaffolded root-page redirect with a useful project landing page. A reader who opens `/` should receive project context immediately and have a direct route into the documentation without an extra HTTP or meta-refresh navigation.

The landing page combines the existing docs top bar with the project-first hero and bordered three-column row established by `templates/site-page/SitePage.dc.html` and `ui_kits/frostyard-org/Home.jsx`. It remains a concise docs entrance rather than becoming a general marketing site.

## Chosen direction

The selected project-first hybrid has:

- The shared Frostyard docs top bar, including project identity, search, and the Source link.
- A large two-beat project headline, short description, and primary documentation action.
- A secondary source action.
- Three short summary points that orient readers toward context, setup, and deeper material.

The alternatives were a landing page inside the full docs shell and a generated documentation-directory page. The full shell offered less project identity, while the directory emphasized navigation at the expense of explaining the project. The hybrid best balances orientation with fast documentation access.

## Architecture

`src/pages/index.astro` becomes a statically rendered page instead of a redirect document. It imports:

- `TopBar.astro` for the established brand, project identity, search, and source controls.
- `global.css` and `docs.css` for the existing tokens and top-bar styles.
- A new `landing.css` for root-page-only layout and responsive rules.
- `site` from `site.config.ts` for project-specific copy.
- `orderedDocs()` to determine the primary documentation destination.

No new Astro layout or content collection is needed. The root page is not a documentation article, so it does not enter the sidebar, table of contents, or previous/next sequence. It also omits `data-pagefind-body`, keeping its short orientation copy out of Pagefind results and avoiding duplicate search content.

## Configuration

`src/site.config.ts` gains one required `landing` object:

```ts
export const site = {
  name: "example",
  kicker: "A Frostyard project",
  sourceUrl: "https://github.com/frostyard/example",
  url: "https://example-docs.bjk.workers.dev",
  landing: {
    headline: ["Meet example.", "Then build."],
    description: "A concise statement of what the project does and who it serves.",
    points: [
      {
        title: "Start with context",
        description: "Understand what the project does and where its boundary sits."
      },
      {
        title: "Get running",
        description: "Install the project and verify the first successful result."
      },
      {
        title: "Go deeper",
        description: "Move into concepts and reference material when needed."
      }
    ]
  }
};
```

`headline` is an explicit two-string tuple. The first beat uses the sans display treatment and the second uses the existing ice-colored serif accent. This avoids parsing punctuation or embedding presentation markup in configuration.

The eyebrow uses the existing `site.kicker`; it is not duplicated in `landing`. The page requires exactly three points because the visual treatment is a three-column row on desktop. All fields are populated in the scaffold, so no fallback or backward-compatibility behavior is required.

## Rendering and navigation

The page renders in this order:

1. `TopBar` with project identity, search, and Source controls.
2. A hero containing the kicker eyebrow, two-beat headline, description, and actions.
3. A bordered row containing the three configured summary points, numbered `01` through `03`.

The primary "Read the docs" action links to `/${docs[0].id}/`, preserving the existing meaning of global document order as the starting point. The secondary "View source" action links to `site.sourceUrl`. The Frostyard brand link in `TopBar` already links to `/`, so documentation pages naturally return to the landing page.

The shared `TopBar` label changes from the generic `❄ frostyard / docs` to `❄ frostyard / {site.name}`. Frostyard remains the linked parent brand, while the muted breadcrumb displays the configured lowercase project name. This applies consistently to the landing page, documentation pages, and the 404 page. The project name remains text rather than a second link because all pages belong to the same project site.

The landing page retains the current explicit build error when `orderedDocs()` returns no entries. The primary action must always resolve to a real page, and the scaffold's documented content model already requires at least one document.

No redirect metadata, canonical link to the first document, or redirect fallback anchor remains. Astro's configured site URL continues to provide the deployment origin; adding broader SEO metadata is outside this change.

## Visual behavior

The hero adapts the design-system site-page pattern rather than copying its product-specific content or decorative illustration. It uses the existing gradient page background, eyebrow dash, display type, serif accent, ice and sky colors, and button language.

Desktop presentation:

- Content remains within the existing 1240px maximum width and 32px page padding.
- The hero has generous vertical space but stays shorter than a full marketing-page viewport.
- The description keeps a readable narrow measure.
- The summary row uses three equal columns separated by hairlines.

Mobile presentation:

- The top bar keeps its existing breakpoint and control layout.
- The project breadcrumb remains visible on mobile and may truncate safely if a project name exceeds the available space; search and Source controls must not be pushed outside the viewport.
- Hero actions wrap or stack without horizontal overflow.
- Summary points become a single column with horizontal separators.
- Type sizes use `clamp()` so the two-beat headline remains readable without clipping.

The implementation adds no animation and therefore needs no new reduced-motion behavior.

## Scaffold skill behavior

`skills/frostyard-docs-site/SKILL.md` is updated so the apply procedure fills `site.landing` alongside the existing four site values. The skill derives concise project-specific copy from the repository README:

- Two short headline beats that identify the project and its outcome.
- One declarative sentence describing the project's purpose.
- Three distinct summary points covering orientation, setup, and deeper use or reference.

If the README does not contain enough reliable information, the skill asks the user for the missing copy instead of inventing project behavior. Existing brand rules still apply: sentence case, calm declarative language, lowercase product names where required, and no emoji.

The README's maintenance note remains accurate because already-applied scaffolds continue to update by manual diff; automated migration is out of scope.

## Error handling

- A scaffold with no docs fails the build with the existing clear error from `index.astro`.
- Landing configuration is statically imported, so missing properties fail TypeScript or Astro checks rather than producing an incomplete page.
- External source navigation uses the configured URL; the apply skill continues to ask when it cannot derive that URL.
- Long user-supplied copy is constrained by the documented concise-copy requirement and responsive layout, not truncated at runtime.

## Verification

Verification covers:

- `npm run build` succeeds in `skills/frostyard-docs-site/scaffold` and Pagefind still generates its index.
- Generated `dist/index.html` contains the configured headline, description, summary points, first-doc URL, and source URL.
- Landing, documentation, and 404 output display `frostyard / {site.name}` rather than `frostyard / docs`.
- Generated root HTML contains no `http-equiv="refresh"`, redirect title, or canonical link targeting the first document.
- The no-docs guard still reports its explicit error when the collection is empty.
- The root page is absent from Pagefind body indexing.
- Desktop and mobile checks confirm that hero actions wrap safely and the three-column row becomes one column at the scaffold's mobile breakpoint.
- A narrow mobile check confirms that the project-aware top bar stays within the viewport with search and Source controls present.
- Existing documentation pages continue to render their sidebar, TOC, search, and previous/next navigation unchanged.

## Out of scope

- A user-authored Markdown or MDX landing page.
- Generated cards for every documentation group.
- A configurable number of summary points.
- Decorative hero artwork or animation.
- New SEO, analytics, versioning, internationalization, or light-theme support.
- Automated updates for repositories that already contain an older scaffold.
