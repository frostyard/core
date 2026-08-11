# Frostyard docs scaffold — design

Date: 2026-07-19
Status: approved (design), pending spec review

## Purpose

A Claude skill in this design-system repo (`skills/frostyard-docs-site/`) that applies a documentation site, in the Frostyard design language, to any existing Frostyard project repo. Docs live with source in a `site/` directory and are edited in the same PRs as code changes. The site is a static Astro build — Markdown/MDX content, no server-side code — deployable to Cloudflare Workers static assets, Pages, or any static host.

The visual and structural source of truth is this design system's docs UI kit (`ui_kits/docs/`): top bar · left section tree · prose column · right "On this page" TOC, in the frostyard-org language (ink background, hairlines, ice accents, mono kickers). The kit's three content packs (snosi / updex / ChairLift) prove the shell is content-agnostic; the scaffold turns that prototype into a production static-site setup.

## Decisions (settled with user)

- **Framework: Astro.** Matches frostyard-org (the live Astro site deployed to Cloudflare Workers). First-class Markdown + MDX via content collections, zero-JS static output, official Cloudflare tooling.
- **Integration: applied to existing repos, not a template repo.** Docs live with source so they change in the same PR as code. Initially designed as a standalone GitHub template repository; rethought at user request.
- **In-repo location: `site/`.** `docs/` is already used for AI instructions in most of the user's repos; `site/` is generally available.
- **Apply mechanism: a Claude skill.** The skill carries the scaffold payload inside itself, so there is no separate scaffold repo to keep in sync. Symlinked into `~/.claude/skills/` once to be invocable from any project.
- **Design system consumption: vendored copy.** The scaffold ships copies of `tokens/{colors,typography,spacing}.css` and an adapted `docs.css`. Zero external dependencies; updates are a manual copy, acceptable for a stable design language.
- **Search: Pagefind.** Static index built at deploy time; search UI in the top bar styled to the shell. Only client-side JS in the site.

## Skill layout (in this repo)

```
skills/frostyard-docs-site/
├── SKILL.md                  # skill entry point: when to use, apply procedure
├── README.md                 # install one-liner (symlink into ~/.claude/skills/), maintenance notes
└── scaffold/                 # the complete payload copied into a target repo's site/
    ├── package.json              # astro, @astrojs/mdx, pagefind, wrangler (dev dep)
    ├── astro.config.mjs          # static output, mdx integration, site from config
    ├── wrangler.jsonc            # Workers static-assets deploy (same pattern as frostyard-org)
    ├── .github-workflow-deploy.yml   # optional CI deploy, shipped commented; skill moves it
    │                                 # to .github/workflows/ only if the user wants CI deploy
    ├── public/
    │   └── favicon.svg           # ❄ mark
    ├── src/
    │   ├── site.config.ts        # THE per-project file: name, kicker, source repo URL, site URL
    │   ├── content.config.ts     # docs collection schema (loads ../content/)
    │   ├── styles/
    │   │   ├── tokens/colors.css       (vendored)
    │   │   ├── tokens/typography.css   (vendored)
    │   │   ├── tokens/spacing.css      (vendored)
    │   │   ├── global.css              # body background, links, resets from kit inline styles
    │   │   └── docs.css                # shell styles adapted from ui_kits/docs/docs.css
    │   ├── layouts/
    │   │   └── DocsLayout.astro  # composes TopBar / Sidebar / prose / Toc / PrevNext
    │   ├── components/
    │   │   ├── TopBar.astro      # ❄ frostyard / docs wordmark, search, Source ↗ pill
    │   │   ├── Sidebar.astro     # grouped section tree, active state
    │   │   ├── Toc.astro         # "On this page" from rendered headings
    │   │   ├── PrevNext.astro    # ← Previous / Next → from flattened order
    │   │   ├── Callout.astro     # dk-callout pattern; MDX-usable
    │   │   └── Search.astro      # Pagefind UI, styled to shell
    │   └── pages/
    │       ├── index.astro       # redirect to first doc
    │       ├── 404.astro         # shell-styled not-found page
    │       └── [...slug].astro   # renders every docs collection entry
    └── content/                  # markdown lives here — GitHub-browsable, edited with code
        ├── getting-started/overview.md
        ├── getting-started/installation.md
        ├── concepts/example.mdx       # demonstrates Callout + code blocks
        └── reference/cli.md
```

In a target repo this lands as `site/` with `content/` at `site/content/`.

## Skill behavior (apply procedure)

When invoked in a project repo, the skill:

1. Refuses to proceed if `site/` already exists (no overwriting).
2. Copies `scaffold/` to `site/`.
3. Fills `src/site.config.ts` from the repo itself: name from the git origin remote, else the directory name; kicker from the GitHub repo description (`gh repo view`); `sourceUrl` from the origin remote; `url` guessed from the user's `<name>.bjk.workers.dev` pattern, flagged for correction.
4. Appends `site/node_modules`, `site/dist`, `site/.astro` to the host repo's `.gitignore`.
5. Seeds starter pages: adapts the repo's README into `content/getting-started/overview.md`; keeps one MDX example demonstrating `Callout` and code blocks; leaves the rest of the sample pages only if the user wants them.
6. Sets the wrangler project name from the repo name.
7. Runs `npm install && npm run build` inside `site/` and confirms the build passes before declaring done.

## Per-project configuration

`src/site.config.ts` exports a single object holding exactly what varied between the UI kit's content packs:

```ts
export const site = {
  name: "snosi",                    // sidebar label + topbar; lowercase per brand
  kicker: "Image build system",     // small line under the name in the sidebar
  sourceUrl: "https://github.com/frostyard/snosi",  // "Source ↗" pill
  url: "https://docs.example.workers.dev",          // canonical URL / sitemap
};
```

Everything else — nav, TOC, prev/next — derives from content. No other file needs editing to adopt the scaffold for a new project.

## Content model

Astro content collection `docs` (glob loader over `site/content/**/*.{md,mdx}`), schema:

- `title: string` — page h1 and sidebar label
- `description?: string` — meta description
- `group: string` — sidebar group heading (e.g. "Getting started", "Concepts", "Reference")
- `order: number` — sort key within and across groups

Sidebar: entries grouped by `group`, groups ordered by the minimum `order` they contain, entries sorted by `order`. Prev/next: the same flattened, ordered list. TOC: h2/h3 headings from Astro's `render()` result. Active states match the kit (`border-left` sky hairline, ice text).

Plain `.md` works everywhere; `.mdx` only needed when using components. `Callout` is the one shipped MDX component (`<Callout label="Rollback">…</Callout>` → the `dk-callout` bordered panel). Code blocks use Shiki with a custom cold theme whose background matches `--surface-code` and whose accent colors stay in the ice/sky palette (no warm colors).

## Rendering & pages

- `[...slug].astro` — `getStaticPaths` over the collection; renders inside `DocsLayout`. The eyebrow line above the h1 reads "{site.name} docs" with the 24px sky dash, per the kit.
- `index.astro` — meta-refresh + canonical redirect to the first doc in order.
- Responsive behavior copied from the kit's breakpoints: TOC drops at ≤1020px, sidebar drops at ≤700px (replaced by a CSS-only `<details>` disclosure above the prose so mobile users can still navigate — the kit hid it entirely; the scaffold must keep nav reachable without adding JS).

## Search

Pagefind runs after the Astro build (`"build": "astro build && pagefind --site dist"`). The `Search.astro` component loads Pagefind on first input, styled with the shell's surface/hairline/ice tokens. No search server; the index ships as static files.

## Deploy

- **Primary: Cloudflare Workers static assets.** `wrangler.jsonc` with `assets.directory = "./dist"`, `npm run deploy` = build + `wrangler deploy`, run from `site/`. Same pattern as frostyard-org (bjk.workers.dev).
- **Also works on**: Cloudflare Pages (point at `site/dist`), GitHub Pages, or any static host — documented in the scaffold's README section of SKILL.md.
- Optional GitHub Actions workflow with a `paths: [site/**]` filter, so docs deploy from the same PRs as code without triggering on unrelated commits. Shipped commented/disabled, since account secrets vary.

## Error handling

- Content schema violations fail the build (zod schema in `content.config.ts`) — misconfigured frontmatter can't ship.
- A custom `404.astro` in the shell style.
- Build fails if two pages share a slug (Astro default behavior, noted in SKILL.md).
- Skill aborts cleanly if `site/` exists or the repo has no git remote to derive config from (asks instead of guessing).

## Verification

- `npm run build` succeeds inside a scaffold applied to a scratch repo; Pagefind index generates.
- `npm run dev` renders and is visually compared against `ui_kits/docs/index.html` (topbar, sidebar grouping, prose measures ~640px, TOC, callout, code block, prev/next).
- The skill's apply procedure walked through once end-to-end on a test repo.

## Out of scope

- Versioned docs, i18n, dark/light switching (the brand is single-theme dark), analytics, comments.
- npm-published token package (vendoring chosen instead).
- Multi-project switcher from the UI kit prototype — each project gets its own docs site; the switcher existed only to prove content-agnosticism.
- Automated scaffold updates for repos that already applied an older version (manual re-apply/diff for now).
