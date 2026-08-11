# Frostyard docs-site skill + scaffold — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `skills/frostyard-docs-site/` skill in this design-system repo whose `scaffold/` payload is a complete Astro docs site (Frostyard docs-shell design, Markdown/MDX content, Pagefind search, Cloudflare Workers deploy) that the skill applies to any project repo as `site/`.

**Architecture:** Static Astro 5 site using a content collection loaded from `content/` at the scaffold root. The docs UI kit shell (`ui_kits/docs/`) is translated from its React prototype into Astro components; tokens are vendored copies of this repo's `tokens/*.css`. The skill (SKILL.md) is a documented apply procedure — no executable tooling.

**Tech Stack:** Astro ^5, @astrojs/mdx ^4, Pagefind ^1, wrangler ^4 (dev dep only). No client-side JS except the search component.

**Spec:** `docs/superpowers/specs/2026-07-19-docs-template-design.md` — read it before starting.

## Global Constraints

- Brand copy: sentence case everywhere (headings included); product names lowercase; calm declarative tone; **no emoji ever**; only glyphs `❄ ✦ ↗ ← →`.
- Brand visuals: cold palette only (no warm colors); 1px hairlines `var(--line)` for all separation; corners nearly square (`--radius-tag` 2px etc., pill only for the Source link); no shadows; prose measure 640px.
- Only client-side JS in the built site is the Pagefind search component. Mobile nav is a CSS-only `<details>` disclosure.
- Content schema (exact): `title: string`, `description?: string`, `group: string`, `order: number`.
- Per-project config is exactly one file: `src/site.config.ts` with fields `name`, `kicker`, `sourceUrl`, `url`.
- All work happens in this repo (the design-system worktree). Commit after every task.
- Scratch builds go in `$HOME/.cache/fy-docs-scratch` (reused between tasks; refreshed with rsync).

---

### Task 1: Scaffold project config, content model, sample content

**Files:**
- Create: `skills/frostyard-docs-site/scaffold/package.json`
- Create: `skills/frostyard-docs-site/scaffold/astro.config.mjs`
- Create: `skills/frostyard-docs-site/scaffold/wrangler.jsonc`
- Create: `skills/frostyard-docs-site/scaffold/tsconfig.json`
- Create: `skills/frostyard-docs-site/scaffold/.gitignore`
- Create: `skills/frostyard-docs-site/scaffold/public/favicon.svg`
- Create: `skills/frostyard-docs-site/scaffold/src/site.config.ts`
- Create: `skills/frostyard-docs-site/scaffold/src/content.config.ts`
- Create: `skills/frostyard-docs-site/scaffold/content/getting-started/overview.md`
- Create: `skills/frostyard-docs-site/scaffold/content/getting-started/installation.md`
- Create: `skills/frostyard-docs-site/scaffold/content/concepts/example.mdx`
- Create: `skills/frostyard-docs-site/scaffold/content/reference/cli.md`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `site` config object (`{ name, kicker, sourceUrl, url }` from `src/site.config.ts`); collection `docs` with schema `{ title, description?, group, order }` whose entries have `entry.id` slugs like `getting-started/overview`; npm scripts `dev`, `build`, `preview`, `deploy`.

- [ ] **Step 1: Create the scaffold directory and config files**

`skills/frostyard-docs-site/scaffold/package.json`:

```json
{
  "name": "frostyard-docs-site",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build && pagefind --site dist",
    "preview": "astro preview",
    "deploy": "npm run build && wrangler deploy"
  },
  "dependencies": {
    "@astrojs/mdx": "^4.3.0",
    "astro": "^5.12.0"
  },
  "devDependencies": {
    "pagefind": "^1.3.0",
    "wrangler": "^4.0.0"
  }
}
```

`skills/frostyard-docs-site/scaffold/astro.config.mjs` (the Shiki theme is the "custom cold theme" from the spec — background matches `--surface-code` `#061826`, accents stay ice/sky):

```js
// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import { site } from "./src/site.config.ts";

/* Cold code theme matched to --surface-code and the ice/sky palette. */
const frostyardCold = {
  name: "frostyard-cold",
  type: "dark",
  colors: {
    "editor.background": "#061826",
    "editor.foreground": "#a9d8ef"
  },
  settings: [],
  tokenColors: [
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#5d87a0", fontStyle: "italic" } },
    { scope: ["string", "string.quoted", "string.template"], settings: { foreground: "#8ee3ff" } },
    { scope: ["constant.numeric", "constant.language", "constant.character"], settings: { foreground: "#aee9ff" } },
    { scope: ["keyword", "keyword.control", "storage.type", "storage.modifier"], settings: { foreground: "#47b8ef" } },
    { scope: ["entity.name.function", "support.function"], settings: { foreground: "#8ddbf8" } },
    { scope: ["entity.name.type", "entity.name.tag", "support.type", "support.class"], settings: { foreground: "#c7dce8" } },
    { scope: ["variable", "variable.parameter", "variable.other"], settings: { foreground: "#c7dce8" } },
    { scope: ["punctuation", "meta.brace"], settings: { foreground: "#7799ab" } }
  ]
};

export default defineConfig({
  site: site.url,
  integrations: [mdx()],
  markdown: {
    shikiConfig: { theme: frostyardCold }
  }
});
```

`skills/frostyard-docs-site/scaffold/wrangler.jsonc`:

```jsonc
{
  // "name" is set by the frostyard-docs-site skill from the repo name.
  "name": "example-docs",
  "compatibility_date": "2026-07-01",
  "assets": {
    "directory": "./dist"
  }
}
```

`skills/frostyard-docs-site/scaffold/tsconfig.json`:

```json
{
  "extends": "astro/tsconfigs/base"
}
```

`skills/frostyard-docs-site/scaffold/.gitignore`:

```
node_modules/
dist/
.astro/
```

`skills/frostyard-docs-site/scaffold/public/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#06111d"/><text x="16" y="23" font-size="20" text-anchor="middle" fill="#aee9ff">❄</text></svg>
```

- [ ] **Step 2: Create the per-project config and the content collection**

`skills/frostyard-docs-site/scaffold/src/site.config.ts` (the ONE file a project edits; the skill fills these values):

```ts
export const site = {
  /** Project name — sidebar label + topbar crumb. Lowercase per brand. */
  name: "example",
  /** One-line descriptor under the name in the sidebar. */
  kicker: "A Frostyard project",
  /** "Source ↗" pill in the top bar. */
  sourceUrl: "https://github.com/frostyard/example",
  /** Canonical site URL (sitemap, astro `site`). */
  url: "https://example-docs.bjk.workers.dev"
};
```

`skills/frostyard-docs-site/scaffold/src/content.config.ts`:

```ts
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

export const collections = {
  docs: defineCollection({
    loader: glob({ pattern: "**/*.{md,mdx}", base: "./content" }),
    schema: z.object({
      title: z.string(),
      description: z.string().optional(),
      group: z.string(),
      order: z.number()
    })
  })
};
```

- [ ] **Step 3: Create the four sample content pages**

`skills/frostyard-docs-site/scaffold/content/getting-started/overview.md`:

````markdown
---
title: Overview
description: What this project is and where to start.
group: Getting started
order: 1
---

Replace this page with an overview of your project. When the frostyard-docs-site skill applies this scaffold, it seeds this page from your README.

## What this is

A short, declarative statement of what the tool does and the boundary it keeps.

## Where to start

- Read [installation](/getting-started/installation/) to get set up.
- The section tree on the left is built from frontmatter: `group` names the section, `order` sorts pages.
````

`skills/frostyard-docs-site/scaffold/content/getting-started/installation.md`:

````markdown
---
title: Installation
description: Install the tool and verify it runs.
group: Getting started
order: 2
---

## Install

```sh
curl -fsSL https://example.com/install.sh | sh
```

## Verify

```sh
example --version
```

Headings stay sentence case. Sentences stay short.
````

`skills/frostyard-docs-site/scaffold/content/concepts/example.mdx`:

````mdx
---
title: Callouts and code
description: MDX example showing the Callout component and code blocks.
group: Concepts
order: 10
---

import Callout from "../../src/components/Callout.astro";

Plain Markdown covers most pages. Reach for MDX only when a page needs a component.

## Callout

<Callout label="Boundary">
  The scaffold never touches your application code. Docs live in `site/` and ship as static files.
</Callout>

## Code

```go
package main

import "fmt"

func main() {
	fmt.Println("cold systems, clear boundaries")
}
```
````

`skills/frostyard-docs-site/scaffold/content/reference/cli.md`:

````markdown
---
title: CLI reference
description: Commands and flags.
group: Reference
order: 20
---

## Commands

| Command | Purpose |
| --- | --- |
| `example build` | Build the artifact |
| `example status` | Report state without changing it |

## JSON output

Every command accepts `--json` for machine-readable output.
````

- [ ] **Step 4: Verify the project boots (config + schema parse)**

```bash
TEST="$HOME/.cache/fy-docs-scratch"
mkdir -p "$TEST"
rsync -a --delete --exclude node_modules --exclude dist --exclude .astro \
  skills/frostyard-docs-site/scaffold/ "$TEST/"
cd "$TEST" && npm install && npx astro sync
```

Expected: `npm install` completes; `astro sync` exits 0 with "Types generated" (or equivalent) and no schema/config errors. (`astro build` is NOT expected to work yet — there are no pages until Task 3.)

- [ ] **Step 5: Commit**

```bash
cd /home/bjk/projects/frostyard/design-system/.claude/worktrees/frostyard-docs-template-647ddc
git add skills/frostyard-docs-site
git commit -m "feat(docs-site): scaffold config, content model, sample content"
```

---

### Task 2: Styles — vendored tokens, global.css, docs.css

**Files:**
- Create: `skills/frostyard-docs-site/scaffold/src/styles/tokens/colors.css` (copy of `tokens/colors.css`)
- Create: `skills/frostyard-docs-site/scaffold/src/styles/tokens/typography.css` (copy of `tokens/typography.css`)
- Create: `skills/frostyard-docs-site/scaffold/src/styles/tokens/spacing.css` (copy of `tokens/spacing.css`)
- Create: `skills/frostyard-docs-site/scaffold/src/styles/global.css`
- Create: `skills/frostyard-docs-site/scaffold/src/styles/docs.css`

**Interfaces:**
- Consumes: repo-root `tokens/*.css` (vendored verbatim); class vocabulary of `ui_kits/docs/docs.css`.
- Produces: every `dk-*` class used by Task 3's components and Task 4's search: `dk-topbar dk-brand dk-flake dk-crumb dk-topbar-right dk-source dk-shell dk-side dk-label dk-kicker dk-nav dk-group dk-main dk-disclosure dk-prose dk-eyebrow dk-dash dk-callout dk-next dk-toc dk-toc-sub dk-search dk-search-note`.

- [ ] **Step 1: Vendor the tokens verbatim**

```bash
cd /home/bjk/projects/frostyard/design-system/.claude/worktrees/frostyard-docs-template-647ddc
mkdir -p skills/frostyard-docs-site/scaffold/src/styles/tokens
cp tokens/colors.css tokens/typography.css tokens/spacing.css \
  skills/frostyard-docs-site/scaffold/src/styles/tokens/
diff -r tokens skills/frostyard-docs-site/scaffold/src/styles/tokens
```

Expected: `diff` exits 0 (no output — identical copies).

- [ ] **Step 2: Write global.css**

`skills/frostyard-docs-site/scaffold/src/styles/global.css`:

```css
@import "./tokens/colors.css";
@import "./tokens/typography.css";
@import "./tokens/spacing.css";

*{box-sizing:border-box}
html{scroll-behavior:smooth}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
body{margin:0;background-color:var(--ink);background-image:var(--gradient-page);color:var(--text-body);font-family:var(--font-sans);line-height:1.5}
a{color:var(--link)}
a:hover{color:var(--link-hover)}
```

- [ ] **Step 3: Write docs.css**

Base is `ui_kits/docs/docs.css` translated to production: inline styles from the kit's JSX become classes; adds mobile disclosure, search styles (used by Task 4), and Markdown-element coverage (h3, lists with ✦ bullets, tables, blockquote, hr, img).

`skills/frostyard-docs-site/scaffold/src/styles/docs.css`:

```css
/* ── shell (from ui_kits/docs/docs.css) ─────────────────────────── */
.dk-shell{display:grid;grid-template-columns:230px minmax(0,1fr) 180px;gap:0;max-width:1240px;margin:auto;padding:0 32px}
.dk-topbar{height:64px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);max-width:1240px;margin:auto;padding:0 32px}
.dk-side{border-right:1px solid var(--line);padding:2rem 1.5rem 2rem 0;position:sticky;top:0;height:calc(100vh - 64px);overflow-y:auto}
.dk-group{font:700 .62rem var(--font-mono);letter-spacing:.14em;text-transform:uppercase;color:#7cbddc;margin:1.6rem 0 .6rem}
.dk-group:first-child{margin-top:0}
.dk-nav a{display:block;font-size:.82rem;color:#b7d0df;padding:.38rem 0 .38rem .75rem;border-left:1px solid var(--line);text-decoration:none}
.dk-nav a:hover{color:var(--ice)}
.dk-nav a.active{color:var(--ice);border-left:1px solid var(--sky)}
.dk-main{padding:2.5rem 3rem;min-width:0}
.dk-toc{padding:2.5rem 0 2rem 1.5rem;border-left:1px solid var(--line);position:sticky;top:0;height:calc(100vh - 64px);font-size:.75rem}
.dk-toc p{font:700 .62rem var(--font-mono);letter-spacing:.14em;text-transform:uppercase;color:#7cbddc;margin:0 0 .7rem}
.dk-toc a{display:block;color:#91b8cb;padding:.28rem 0;text-decoration:none}
.dk-toc a:hover{color:var(--ice)}
.dk-toc a.dk-toc-sub{padding-left:.9rem}

/* ── topbar pieces (were inline JSX styles in the kit) ──────────── */
.dk-brand{display:flex;align-items:baseline;gap:1rem}
.dk-brand>a{font-weight:var(--brand-weight);letter-spacing:var(--brand-ls);font-size:1.1rem;color:var(--text-body);text-decoration:none;white-space:nowrap}
.dk-flake{color:var(--ice);font-size:1.35rem;margin-right:.3rem}
.dk-crumb{color:var(--text-footer);font-size:.85rem}
.dk-topbar-right{display:flex;align-items:center;gap:1rem}
.dk-source{font-size:.78rem;border:1px solid var(--line);padding:.45rem .7rem;border-radius:var(--radius-pill);color:#d9f2ff;text-decoration:none;white-space:nowrap}
.dk-source span{color:var(--ice)}

/* ── sidebar header (were inline JSX styles in the kit) ─────────── */
.dk-label{font:700 .62rem var(--font-mono);letter-spacing:.14em;text-transform:uppercase;color:var(--ice);margin-bottom:.2rem}
.dk-kicker{font-size:.72rem;color:var(--text-footer);margin-bottom:1.2rem}

/* ── prose ──────────────────────────────────────────────────────── */
.dk-eyebrow{font:700 .62rem var(--font-mono);letter-spacing:.14em;text-transform:uppercase;color:var(--text-eyebrow);margin:0 0 .8rem}
.dk-dash{width:var(--eyebrow-dash-w);height:1px;background:var(--sky);display:inline-block;vertical-align:middle;margin-right:.6rem}
.dk-prose h1{font-size:2.6rem;letter-spacing:-.06em;line-height:1;margin:0 0 1rem}
.dk-prose h2{font-size:1.4rem;letter-spacing:-.04em;margin:2.4rem 0 .8rem;padding-top:1.4rem;border-top:1px solid var(--line)}
.dk-prose h3{font-size:1.05rem;letter-spacing:-.02em;margin:1.8rem 0 .6rem}
.dk-prose p{font-size:.9rem;color:var(--text-muted);line-height:1.65;margin:0 0 1rem;max-width:640px}
.dk-prose ul,.dk-prose ol{font-size:.9rem;color:var(--text-muted);line-height:1.65;margin:0 0 1rem;max-width:640px;padding-left:1.2rem}
.dk-prose ul{list-style:none;padding-left:0}
.dk-prose ul>li{position:relative;padding-left:1.2rem;margin-bottom:.35rem}
.dk-prose ul>li::before{content:"✦";position:absolute;left:0;top:.28em;color:var(--sky);font-size:.7rem}
.dk-prose ol>li{margin-bottom:.35rem}
.dk-prose strong{color:var(--text-body)}
.dk-prose code{font-family:var(--font-mono);font-size:.78em;color:#8ee3ff;background:var(--surface-code);padding:.15rem .35rem}
.dk-prose pre{background:var(--surface-code);border:1px solid var(--line);padding:1rem 1.2rem;overflow-x:auto;margin:0 0 1rem;max-width:640px;border-radius:0}
.dk-prose pre code{background:none;padding:0;font-size:.76rem;line-height:1.6}
.dk-prose table{border-collapse:collapse;font-size:.84rem;margin:0 0 1rem;max-width:640px;width:100%}
.dk-prose th{font:700 .62rem var(--font-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--text-eyebrow);text-align:left;padding:.5rem .8rem .5rem 0;border-bottom:1px solid var(--line-strong)}
.dk-prose td{color:var(--text-muted);padding:.5rem .8rem .5rem 0;border-bottom:1px solid var(--line)}
.dk-prose blockquote{border-left:2px solid var(--sky);margin:0 0 1rem;padding:.2rem 0 .2rem 1.1rem;max-width:640px}
.dk-prose hr{border:none;border-top:1px solid var(--line);margin:2rem 0}
.dk-prose img{max-width:100%}

/* ── callout + prev/next (from the kit) ─────────────────────────── */
.dk-callout{border:1px solid var(--line);border-left:2px solid var(--sky);background:var(--gradient-panel);padding:.9rem 1.1rem;font-size:.84rem;color:var(--text-muted);margin:0 0 1rem;max-width:640px}
.dk-callout b{color:#93dff7;font:700 .62rem var(--font-mono);letter-spacing:.12em;text-transform:uppercase;display:block;margin-bottom:.35rem}
.dk-callout p{font-size:inherit;margin:0}
.dk-next{display:flex;justify-content:space-between;gap:1rem;margin-top:3rem;border-top:1px solid var(--line);padding-top:1.2rem}
.dk-next a{font-size:.8rem;color:#93e0fb;text-decoration:none}

/* ── mobile nav disclosure (CSS-only) ───────────────────────────── */
.dk-disclosure{display:none;border:1px solid var(--line);margin-bottom:1.6rem}
.dk-disclosure summary{font:700 .62rem var(--font-mono);letter-spacing:.14em;text-transform:uppercase;color:var(--text-eyebrow);padding:.6rem .9rem;cursor:pointer;list-style:none}
.dk-disclosure summary::before{content:"→ ";color:var(--sky)}
.dk-disclosure[open] summary::before{content:"↓ "}
.dk-disclosure .dk-nav{padding:0 .9rem .9rem}

/* ── search (used by Task 4's Search.astro) ─────────────────────── */
.dk-search{position:relative}
.dk-search input{background:var(--surface-code);border:1px solid var(--line);color:var(--text-body);font:inherit;font-size:.8rem;padding:.4rem .6rem;border-radius:var(--radius-tag);width:180px}
.dk-search input:focus{outline:none;border-color:var(--line-strong)}
.dk-search-results{position:absolute;top:calc(100% + 8px);right:0;width:340px;max-height:60vh;overflow-y:auto;background:var(--gradient-panel);border:1px solid var(--line);padding:.4rem;z-index:10}
.dk-search-results a{display:block;padding:.55rem .6rem;text-decoration:none;border-bottom:1px solid var(--line)}
.dk-search-results a:last-child{border-bottom:none}
.dk-search-results a b{display:block;font-size:.8rem;color:var(--text-body)}
.dk-search-results a span{font-size:.72rem;color:var(--text-dim)}
.dk-search-results a span mark{background:none;color:var(--ice)}
.dk-search-note{font-size:.75rem;color:var(--text-dim);margin:.4rem .6rem}

/* ── breakpoints (from the kit; disclosure appears when side hides) ─ */
@media(max-width:1020px){.dk-shell{grid-template-columns:220px minmax(0,1fr)}.dk-toc{display:none}.dk-main{padding:2rem 0 2rem 2rem}}
@media(max-width:700px){.dk-shell{grid-template-columns:1fr}.dk-side{display:none}.dk-main{padding:2rem 0}.dk-disclosure{display:block}.dk-search input{width:130px}}
```

- [ ] **Step 4: Commit**

```bash
git add skills/frostyard-docs-site/scaffold/src/styles
git commit -m "feat(docs-site): vendored tokens, global and docs shell styles"
```

---

### Task 3: Nav helper, components, layout, pages

**Files:**
- Create: `skills/frostyard-docs-site/scaffold/src/lib/nav.ts`
- Create: `skills/frostyard-docs-site/scaffold/src/components/TopBar.astro`
- Create: `skills/frostyard-docs-site/scaffold/src/components/Sidebar.astro`
- Create: `skills/frostyard-docs-site/scaffold/src/components/Toc.astro`
- Create: `skills/frostyard-docs-site/scaffold/src/components/PrevNext.astro`
- Create: `skills/frostyard-docs-site/scaffold/src/components/Callout.astro`
- Create: `skills/frostyard-docs-site/scaffold/src/layouts/DocsLayout.astro`
- Create: `skills/frostyard-docs-site/scaffold/src/pages/[...slug].astro`
- Create: `skills/frostyard-docs-site/scaffold/src/pages/index.astro`
- Create: `skills/frostyard-docs-site/scaffold/src/pages/404.astro`

**Interfaces:**
- Consumes: `site` from `../site.config` (Task 1); collection `docs` (Task 1); `dk-*` classes (Task 2). Task 4 will add `<Search />` into `TopBar.astro`'s `dk-topbar-right` div.
- Produces: `orderedDocs(): Promise<CollectionEntry<"docs">[]>` and `groupDocs(docs): [string, CollectionEntry<"docs">[]][]` from `src/lib/nav.ts`; `DocsLayout` props `{ title: string, description?: string, headings?: {depth,slug,text}[], current?: string, groups, prev?, next? }`; `Callout` props `{ label: string }` with a default slot.

- [ ] **Step 1: Write the nav helper**

`skills/frostyard-docs-site/scaffold/src/lib/nav.ts`:

```ts
import { getCollection, type CollectionEntry } from "astro:content";

export type DocEntry = CollectionEntry<"docs">;

/** All docs, flattened and sorted by `order` — the prev/next sequence. */
export async function orderedDocs(): Promise<DocEntry[]> {
  const docs = await getCollection("docs");
  return docs.sort((a, b) => a.data.order - b.data.order);
}

/**
 * Group ordered docs by `group`. Because input is order-sorted and Map
 * preserves insertion order, groups come out ordered by the minimum
 * `order` they contain (per spec).
 */
export function groupDocs(docs: DocEntry[]): [string, DocEntry[]][] {
  const groups = new Map<string, DocEntry[]>();
  for (const doc of docs) {
    const list = groups.get(doc.data.group) ?? [];
    list.push(doc);
    groups.set(doc.data.group, list);
  }
  return [...groups.entries()];
}
```

- [ ] **Step 2: Write the components**

`skills/frostyard-docs-site/scaffold/src/components/TopBar.astro`:

```astro
---
import { site } from "../site.config";
---
<header class="dk-topbar">
  <div class="dk-brand">
    <a href="/"><span class="dk-flake">❄</span> frostyard</a>
    <span class="dk-crumb">/ docs</span>
  </div>
  <div class="dk-topbar-right">
    <a class="dk-source" href={site.sourceUrl}>Source <span>↗</span></a>
  </div>
</header>
```

`skills/frostyard-docs-site/scaffold/src/components/Sidebar.astro`:

```astro
---
const { groups, current } = Astro.props;
---
<nav class="dk-nav">
  {groups.map(([group, entries]) => (
    <div>
      <div class="dk-group">{group}</div>
      {entries.map((e) => (
        <a
          href={`/${e.id}/`}
          class={e.id === current ? "active" : undefined}
          aria-current={e.id === current ? "page" : undefined}
        >{e.data.title}</a>
      ))}
    </div>
  ))}
</nav>
```

`skills/frostyard-docs-site/scaffold/src/components/Toc.astro`:

```astro
---
const { headings = [] } = Astro.props;
const items = headings.filter((h) => h.depth === 2 || h.depth === 3);
---
{items.length > 0 && (
  <>
    <p>On this page</p>
    {items.map((h) => (
      <a href={`#${h.slug}`} class={h.depth === 3 ? "dk-toc-sub" : undefined}>{h.text}</a>
    ))}
  </>
)}
```

`skills/frostyard-docs-site/scaffold/src/components/PrevNext.astro`:

```astro
---
const { prev = null, next = null } = Astro.props;
---
{(prev || next) && (
  <div class="dk-next">
    <span>{prev && <a href={`/${prev.id}/`}>← {prev.data.title}</a>}</span>
    <span>{next && <a href={`/${next.id}/`}>{next.data.title} →</a>}</span>
  </div>
)}
```

`skills/frostyard-docs-site/scaffold/src/components/Callout.astro`:

```astro
---
const { label } = Astro.props;
---
<div class="dk-callout"><b>{label}</b><slot /></div>
```

- [ ] **Step 3: Write the layout**

`skills/frostyard-docs-site/scaffold/src/layouts/DocsLayout.astro`:

```astro
---
import "../styles/global.css";
import "../styles/docs.css";
import { site } from "../site.config";
import TopBar from "../components/TopBar.astro";
import Sidebar from "../components/Sidebar.astro";
import Toc from "../components/Toc.astro";
import PrevNext from "../components/PrevNext.astro";

const {
  title,
  description,
  headings = [],
  current = "",
  groups,
  prev = null,
  next = null
} = Astro.props;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    {description && <meta name="description" content={description} />}
    <title>{title} — {site.name} docs</title>
  </head>
  <body>
    <TopBar />
    <div class="dk-shell">
      <aside class="dk-side">
        <div class="dk-label">{site.name}</div>
        <div class="dk-kicker">{site.kicker}</div>
        <Sidebar groups={groups} current={current} />
      </aside>
      <main class="dk-main">
        <details class="dk-disclosure">
          <summary>Contents</summary>
          <Sidebar groups={groups} current={current} />
        </details>
        <div class="dk-prose" data-pagefind-body>
          <p class="dk-eyebrow"><span class="dk-dash"></span>{site.name} docs</p>
          <h1>{title}</h1>
          <slot />
          <PrevNext prev={prev} next={next} />
        </div>
      </main>
      <aside class="dk-toc">
        <Toc headings={headings} />
      </aside>
    </div>
  </body>
</html>
```

- [ ] **Step 4: Write the pages**

`skills/frostyard-docs-site/scaffold/src/pages/[...slug].astro`:

```astro
---
import { render } from "astro:content";
import DocsLayout from "../layouts/DocsLayout.astro";
import { orderedDocs, groupDocs } from "../lib/nav";

export async function getStaticPaths() {
  const docs = await orderedDocs();
  return docs.map((entry, i) => ({
    params: { slug: entry.id },
    props: { entry, prev: docs[i - 1] ?? null, next: docs[i + 1] ?? null }
  }));
}

const { entry, prev, next } = Astro.props;
const groups = groupDocs(await orderedDocs());
const { Content, headings } = await render(entry);
---
<DocsLayout
  title={entry.data.title}
  description={entry.data.description}
  headings={headings}
  current={entry.id}
  groups={groups}
  prev={prev}
  next={next}
>
  <Content />
</DocsLayout>
```

`skills/frostyard-docs-site/scaffold/src/pages/index.astro` (redirect to the first doc in order):

```astro
---
import { orderedDocs } from "../lib/nav";

const docs = await orderedDocs();
const target = `/${docs[0].id}/`;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content={`0;url=${target}`} />
    <link rel="canonical" href={new URL(target, Astro.site)} />
    <title>Redirecting</title>
  </head>
  <body>
    <a href={target}>Continue to the docs</a>
  </body>
</html>
```

`skills/frostyard-docs-site/scaffold/src/pages/404.astro`:

```astro
---
import DocsLayout from "../layouts/DocsLayout.astro";
import { orderedDocs, groupDocs } from "../lib/nav";

const groups = groupDocs(await orderedDocs());
---
<DocsLayout title="Page not found" groups={groups}>
  <p>Nothing lives at this address. The section tree covers everything published.</p>
</DocsLayout>
```

- [ ] **Step 5: Build and verify output structure**

```bash
TEST="$HOME/.cache/fy-docs-scratch"
rsync -a --delete --exclude node_modules --exclude dist --exclude .astro \
  skills/frostyard-docs-site/scaffold/ "$TEST/"
cd "$TEST" && npm install && npx astro build
ls dist/index.html dist/404.html \
  dist/getting-started/overview/index.html \
  dist/getting-started/installation/index.html \
  dist/concepts/example/index.html \
  dist/reference/cli/index.html
grep -o 'dk-callout' dist/concepts/example/index.html | head -1
grep -o 'class="astro-code' dist/concepts/example/index.html | head -1
grep -o 'aria-current="page"' dist/reference/cli/index.html | head -1
```

Expected: build exits 0; all six files listed; each grep prints its match (callout rendered, Shiki code block present, active sidebar link marked). If `astro.config.mjs` fails to import `./src/site.config.ts`, the sanctioned fix is renaming that import target to `site.config.ts` at scaffold root and updating the three importers — do not inline the values.

- [ ] **Step 6: Commit**

```bash
cd /home/bjk/projects/frostyard/design-system/.claude/worktrees/frostyard-docs-template-647ddc
git add skills/frostyard-docs-site/scaffold/src
git commit -m "feat(docs-site): docs shell layout, components, and pages"
```

---

### Task 4: Pagefind search

**Files:**
- Create: `skills/frostyard-docs-site/scaffold/src/components/Search.astro`
- Modify: `skills/frostyard-docs-site/scaffold/src/components/TopBar.astro` (add `<Search />`)

**Interfaces:**
- Consumes: `dk-search`, `dk-search-results`, `dk-search-note` classes (Task 2); `data-pagefind-body` on `.dk-prose` (Task 3); the `build` script already runs `pagefind --site dist` (Task 1).
- Produces: the only client-side JS in the site.

- [ ] **Step 1: Write the search component**

`skills/frostyard-docs-site/scaffold/src/components/Search.astro`:

```astro
<div class="dk-search">
  <input id="dk-search-input" type="search" placeholder="Search docs" autocomplete="off" />
  <div id="dk-search-results" class="dk-search-results" hidden></div>
</div>
<script>
  const input = document.getElementById("dk-search-input") as HTMLInputElement | null;
  const panel = document.getElementById("dk-search-results");
  let pagefind: any = null;
  let failed = false;

  async function ensurePagefind() {
    if (pagefind || failed) return pagefind;
    try {
      pagefind = await import(/* @vite-ignore */ "/pagefind/pagefind.js");
      await pagefind.init();
    } catch {
      failed = true;
      if (panel) {
        panel.hidden = false;
        panel.innerHTML =
          '<p class="dk-search-note">The search index is built with the site — run npm run build.</p>';
      }
    }
    return pagefind;
  }

  input?.addEventListener("input", async () => {
    if (!panel) return;
    const q = input.value.trim();
    if (!q) {
      panel.hidden = true;
      panel.innerHTML = "";
      return;
    }
    const pf = await ensurePagefind();
    if (!pf) return;
    const search = await pf.debouncedSearch(q);
    if (!search) return; // superseded by a newer keystroke
    const results = await Promise.all(
      search.results.slice(0, 8).map((r: any) => r.data())
    );
    panel.hidden = false;
    panel.innerHTML = results.length
      ? results
          .map(
            (r: any) =>
              `<a href="${r.url}"><b>${r.meta.title}</b><span>${r.excerpt}</span></a>`
          )
          .join("")
      : '<p class="dk-search-note">No pages match.</p>';
  });

  document.addEventListener("click", (e) => {
    if (panel && e.target instanceof Element && !e.target.closest(".dk-search")) {
      panel.hidden = true;
    }
  });
</script>
```

- [ ] **Step 2: Mount it in the top bar**

In `skills/frostyard-docs-site/scaffold/src/components/TopBar.astro`, add the import and place `<Search />` before the Source link:

```astro
---
import { site } from "../site.config";
import Search from "./Search.astro";
---
<header class="dk-topbar">
  <div class="dk-brand">
    <a href="/"><span class="dk-flake">❄</span> frostyard</a>
    <span class="dk-crumb">/ docs</span>
  </div>
  <div class="dk-topbar-right">
    <Search />
    <a class="dk-source" href={site.sourceUrl}>Source <span>↗</span></a>
  </div>
</header>
```

- [ ] **Step 3: Full build — verify the index generates and search works**

```bash
TEST="$HOME/.cache/fy-docs-scratch"
rsync -a --delete --exclude node_modules --exclude dist --exclude .astro \
  skills/frostyard-docs-site/scaffold/ "$TEST/"
cd "$TEST" && npm install && npm run build
ls dist/pagefind/pagefind.js
grep -c 'dk-search' dist/getting-started/overview/index.html
```

Expected: Pagefind logs indexed pages (4) and writes `dist/pagefind/`; both commands succeed. Then spot-check interactively:

```bash
npm run preview & PREVIEW_PID=$!
sleep 2
curl -s http://localhost:4321/pagefind/pagefind.js | head -c 100
kill $PREVIEW_PID
```

Expected: JS content returned (not a 404 page).

- [ ] **Step 4: Commit**

```bash
cd /home/bjk/projects/frostyard/design-system/.claude/worktrees/frostyard-docs-template-647ddc
git add skills/frostyard-docs-site/scaffold/src/components
git commit -m "feat(docs-site): pagefind search in the top bar"
```

---

### Task 5: CI workflow template, SKILL.md, READMEs

**Files:**
- Create: `skills/frostyard-docs-site/scaffold/.github-workflow-deploy.yml`
- Create: `skills/frostyard-docs-site/SKILL.md`
- Create: `skills/frostyard-docs-site/README.md`
- Modify: `readme.md` (repo root — add the skill to the Index section)

**Interfaces:**
- Consumes: everything the scaffold ships (Tasks 1–4); the apply procedure from the spec.
- Produces: the documented apply procedure Task 6 executes verbatim.

- [ ] **Step 1: Write the disabled CI workflow template**

`skills/frostyard-docs-site/scaffold/.github-workflow-deploy.yml`:

```yaml
# Optional CI deploy for the docs site.
# To enable: move this file to .github/workflows/deploy-docs.yml at the repo
# root, uncomment everything below, and add CLOUDFLARE_API_TOKEN and
# CLOUDFLARE_ACCOUNT_ID as repository secrets. The paths filter means docs
# deploy from the same PRs as code without triggering on unrelated commits.
#
# name: deploy docs
#
# on:
#   push:
#     branches: [main]
#     paths: ["site/**"]
#
# jobs:
#   deploy:
#     runs-on: ubuntu-latest
#     steps:
#       - uses: actions/checkout@v4
#       - uses: actions/setup-node@v4
#         with:
#           node-version: 22
#       - run: npm ci
#         working-directory: site
#       - run: npm run build
#         working-directory: site
#       - uses: cloudflare/wrangler-action@v3
#         with:
#           apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
#           accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
#           workingDirectory: site
```

- [ ] **Step 2: Write SKILL.md**

`skills/frostyard-docs-site/SKILL.md`:

````markdown
---
name: frostyard-docs-site
description: Apply a Frostyard-branded documentation site to an existing project repo. Use when a Frostyard project needs docs that live with source — creates site/ (Astro, Markdown/MDX, Pagefind), seeds content from the README, wires Cloudflare Workers deploy.
user-invocable: true
---

# Frostyard docs site — apply procedure

Adds a static documentation site at `site/` in the current repo, in the Frostyard design language (docs shell: top bar · section tree · prose · TOC). Content is Markdown/MDX in `site/content/`, edited in the same PRs as code. The scaffold payload lives next to this file in `scaffold/`.

Brand rules for any content you write: sentence case headings, product names lowercase, calm declarative tone, no emoji, glyphs limited to `❄ ✦ ↗ ← →`.

## Pre-flight

1. **Abort if `site/` already exists** — never overwrite. Tell the user and stop.
2. Derive config values; when a source is missing, ask the user instead of guessing:
   - `name` — repo name from `git remote get-url origin` (strip `.git`), else the directory name. Lowercase.
   - `kicker` — GitHub description via `gh repo view --json description -q .description`; if empty, ask for a 3–6 word descriptor.
   - `sourceUrl` — the origin remote as an https URL. No remote → ask.
   - `url` — default `https://<name>-docs.bjk.workers.dev`; flag this as a guess in your summary.

## Apply

3. Copy the payload: `cp -R <this skill's directory>/scaffold site` (then delete any `site/node_modules`, `site/dist`, `site/.astro` that came along).
4. Fill the four values in `site/src/site.config.ts`.
5. Set `"name"` in `site/wrangler.jsonc` to `<name>-docs`.
6. Append to the host repo's `.gitignore` (create it if missing):

   ```
   site/node_modules/
   site/dist/
   site/.astro/
   ```

7. Seed content: rewrite `site/content/getting-started/overview.md` from the repo's README (keep the frontmatter shape; follow the brand rules above). Keep `concepts/example.mdx` as the MDX reference. Ask the user whether to keep or delete the remaining sample pages.

## Verify (required before declaring done)

8. `cd site && npm install && npm run build` — must exit 0 (Astro build + Pagefind index).
9. Offer `npm run dev` for a visual look.

## Tell the user about deploys

- `cd site && npm run deploy` → Cloudflare Workers static assets (needs `wrangler login` once).
- Any static host works: serve `site/dist/`.
- CI: move `site/.github-workflow-deploy.yml` to `.github/workflows/deploy-docs.yml`, uncomment it, add `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets.

## Content authoring reference

- Frontmatter (all pages): `title` (string), `description` (optional string), `group` (sidebar section), `order` (number; global sort key — also orders prev/next).
- Plain `.md` needs nothing else. `.mdx` can `import Callout from "../../src/components/Callout.astro"` and use `<Callout label="...">…</Callout>`.
- Two pages must not share a filename-derived slug; the build fails if they do.
````

- [ ] **Step 3: Write the skill README and update the repo index**

`skills/frostyard-docs-site/README.md`:

````markdown
# frostyard-docs-site skill

Applies a Frostyard-branded Astro docs site to any project repo as `site/`. The apply procedure is in `SKILL.md`; the payload is `scaffold/`.

## Install (once, to use from any repo)

```sh
ln -sfn "$HOME/projects/frostyard/design-system/skills/frostyard-docs-site" \
  "$HOME/.claude/skills/frostyard-docs-site"
```

## Maintenance

- `scaffold/src/styles/tokens/*.css` are vendored copies of this repo's `tokens/*.css`. When tokens change, re-copy and commit.
- The shell CSS (`scaffold/src/styles/docs.css`) derives from `ui_kits/docs/docs.css`; keep visual changes in sync manually.
- Repos that applied an older scaffold re-apply by diffing their `site/` against `scaffold/` (automated updates are out of scope).
````

In the repo root `readme.md`, add one line to the `## Index` section, after the `ui_kits/pilothouse/` line:

```markdown
- `skills/frostyard-docs-site/` — skill that applies a production docs site (Astro, this docs shell) to any project repo as `site/`
```

- [ ] **Step 4: Commit**

```bash
git add skills/frostyard-docs-site readme.md
git commit -m "feat(docs-site): apply-skill procedure, CI template, install docs"
```

---

### Task 6: End-to-end apply on a scratch repo + visual verification

**Files:**
- Modify: any scaffold/SKILL.md file where this rehearsal finds a defect (fix + commit).

**Interfaces:**
- Consumes: the SKILL.md procedure (Task 5), executed verbatim as if invoked in a project repo.
- Produces: confidence the skill works end-to-end; fixes for anything that didn't.

- [ ] **Step 1: Create a scratch "project repo"**

```bash
E2E="$HOME/.cache/fy-docs-e2e"
rm -rf "$E2E" && mkdir -p "$E2E" && cd "$E2E"
git init -q
git remote add origin https://github.com/frostyard/frostbite.git
printf '# frostbite\n\nA small tool that keeps cold things cold. It watches a directory and refuses to let anything warm in.\n' > README.md
git add README.md && git commit -qm "init"
```

- [ ] **Step 2: Execute the SKILL.md procedure exactly as written**

Follow `skills/frostyard-docs-site/SKILL.md` step by step against `$E2E`, acting as the skill would: derive `name=frostbite`, `sourceUrl=https://github.com/frostyard/frostbite`, `url=https://frostbite-docs.bjk.workers.dev`; `kicker` has no `gh` source in a scratch repo — per the procedure this is an "ask the user" case; use `Keeps cold things cold` and note that the ask-branch triggered correctly. Copy the scaffold, fill `site/src/site.config.ts`, set wrangler name `frostbite-docs`, append the three `.gitignore` lines, rewrite `overview.md` from the README in brand tone.

Expected: every SKILL.md instruction is executable as written, with no missing information. Any gap found = a SKILL.md defect to fix in Step 5.

- [ ] **Step 3: Verify the applied site builds**

```bash
cd "$E2E/site" && npm install && npm run build
ls dist/pagefind/pagefind.js dist/getting-started/overview/index.html
grep -o "frostbite docs" dist/getting-started/overview/index.html | head -1
grep -o "frostbite-docs" wrangler.jsonc
cd "$E2E" && git status --porcelain | grep -c "^??" && cat .gitignore
```

Expected: build exits 0; eyebrow text "frostbite docs" present; wrangler name set; `.gitignore` contains the three `site/` lines; untracked files are only `site/` content (no `node_modules` noise thanks to the gitignore).

- [ ] **Step 4: Visual comparison against the UI kit**

```bash
cd "$E2E/site" && npm run dev
```

Open `http://localhost:4321/` beside `ui_kits/docs/index.html` (open the kit file via a static server or the design-system preview). Compare, using a browser or rendered-HTML inspection: topbar (wordmark, crumb, search, Source ↗ pill), sidebar (mono group headings, hairline left border, ice active state), prose (h1 scale/tracking, 640px measure, hairline-topped h2s), callout (on the MDX example page), code block (cold Shiki colors on `--surface-code` background), TOC, prev/next row, mobile: narrow the window ≤700px and confirm the Contents disclosure opens/closes with no JS. Fix discrepancies in the scaffold, not in the scratch copy.

- [ ] **Step 5: Fix anything found, re-verify, commit**

Apply fixes to `skills/frostyard-docs-site/` files, re-run Step 3's build to confirm, then:

```bash
cd /home/bjk/projects/frostyard/design-system/.claude/worktrees/frostyard-docs-template-647ddc
git add skills/frostyard-docs-site
git commit -m "fix(docs-site): corrections from end-to-end apply rehearsal"
```

(If nothing needed fixing, skip the commit and say so.)

- [ ] **Step 6: Clean up scratch dirs**

```bash
rm -rf "$HOME/.cache/fy-docs-scratch" "$HOME/.cache/fy-docs-e2e"
```
