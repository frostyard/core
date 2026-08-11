# Docs Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the scaffold root redirect with a project-first landing page and identify the configured project in the shared top bar.

**Architecture:** Keep the landing page as a standalone static Astro page that composes the existing `TopBar` and navigation ordering without entering the docs content collection. Add one landing-specific stylesheet and a typed `site.landing` configuration object; verify generated output with Node's built-in test runner so no test dependency is added.

**Tech Stack:** Astro 5, TypeScript, CSS, Pagefind, Node.js built-in `node:test`

## Global Constraints

- Preserve static output; add no server-side code or client-side JavaScript beyond the existing Pagefind search.
- Add no dependencies.
- Use `❄ frostyard / {site.name}` on the landing, documentation, and 404 pages.
- Keep the root page outside sidebar ordering, previous/next navigation, TOC generation, and Pagefind body indexing.
- Keep exactly three configured landing summary points.
- Follow Frostyard copy rules: sentence case headings, lowercase product names, calm declarative tone, no emoji, and glyphs limited to `❄ ✦ ↗ ← →`.
- Retain the explicit no-docs build error.
- Do not add fallback or migration behavior for scaffolds already applied to other repositories.

---

## File Structure

- Modify `skills/frostyard-docs-site/scaffold/package.json` to expose the build-backed Node test suite.
- Create `skills/frostyard-docs-site/scaffold/tests/top-bar.test.mjs` to verify shared project identity in generated pages.
- Modify `skills/frostyard-docs-site/scaffold/src/components/TopBar.astro` to render `site.name` as the breadcrumb.
- Modify `skills/frostyard-docs-site/scaffold/src/styles/docs.css` only for shared top-bar truncation and narrow-screen sizing.
- Create `skills/frostyard-docs-site/scaffold/tests/landing-page.test.mjs` to verify root output and the retained empty-content guard.
- Modify `skills/frostyard-docs-site/scaffold/src/site.config.ts` to define the typed project-specific landing content.
- Replace `skills/frostyard-docs-site/scaffold/src/pages/index.astro` with the static landing page.
- Create `skills/frostyard-docs-site/scaffold/src/styles/landing.css` for hero, actions, summary row, and responsive layout.
- Create `skills/frostyard-docs-site/scaffold/tests/skill-instructions.test.mjs` to verify that scaffold application populates landing content.
- Modify `skills/frostyard-docs-site/SKILL.md` to derive landing copy from the target repository README and ask when evidence is insufficient.

---

### Task 1: Project-Aware Shared Top Bar

**Files:**
- Modify: `skills/frostyard-docs-site/scaffold/package.json:5-10`
- Create: `skills/frostyard-docs-site/scaffold/tests/top-bar.test.mjs`
- Modify: `skills/frostyard-docs-site/scaffold/src/components/TopBar.astro:5-14`
- Modify: `skills/frostyard-docs-site/scaffold/src/styles/docs.css:18-24,80-82`

**Interfaces:**
- Consumes: `site.name: string` from `src/site.config.ts`.
- Produces: `.dk-crumb` containing `/ ${site.name}` and an accessible `Project: ${site.name}` label on every page using `TopBar`.
- Produces: `npm test`, which builds the scaffold and runs every `tests/*.test.mjs` file.

- [ ] **Step 1: Add the test command and failing top-bar output test**

Change the `scripts` object in `skills/frostyard-docs-site/scaffold/package.json` to:

```json
"scripts": {
  "dev": "astro dev",
  "build": "astro build && pagefind --site dist",
  "test": "npm run build && node --test tests/*.test.mjs",
  "preview": "astro preview",
  "deploy": "npm run build && wrangler deploy"
}
```

Create `skills/frostyard-docs-site/scaffold/tests/top-bar.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readOutput = (path) => readFile(new URL(`../dist/${path}`, import.meta.url), "utf8");

test("shared top bar identifies the configured project", async () => {
  const [docsPage, notFoundPage] = await Promise.all([
    readOutput("getting-started/overview/index.html"),
    readOutput("404.html")
  ]);

  for (const html of [docsPage, notFoundPage]) {
    assert.match(html, /class="dk-crumb"[^>]*aria-label="Project: example"[^>]*>\/ example<\/span>/);
    assert.doesNotMatch(html, /class="dk-crumb"[^>]*>\/ docs<\/span>/);
  }
});
```

- [ ] **Step 2: Run the test and verify it fails for the generic breadcrumb**

Run:

```bash
cd skills/frostyard-docs-site/scaffold
npm test
```

Expected: Astro and Pagefind build successfully, then `top-bar.test.mjs` fails because generated pages contain `/ docs` rather than `/ example`.

- [ ] **Step 3: Render the project name in the shared top bar**

Replace `skills/frostyard-docs-site/scaffold/src/components/TopBar.astro` with:

```astro
---
import { site } from "../site.config";
import Search from "./Search.astro";
---
<header class="dk-topbar">
  <div class="dk-brand">
    <a href="/"><span class="dk-flake">❄</span> frostyard</a>
    <span class="dk-crumb" aria-label={`Project: ${site.name}`}>/ {site.name}</span>
  </div>
  <div class="dk-topbar-right">
    <Search />
    <a class="dk-source" href={site.sourceUrl}>Source <span>↗</span></a>
  </div>
</header>
```

- [ ] **Step 4: Add safe truncation and narrow-screen sizing**

Update the existing top-bar rules in `skills/frostyard-docs-site/scaffold/src/styles/docs.css` to:

```css
.dk-brand{display:flex;align-items:baseline;gap:1rem;min-width:0}
.dk-brand>a{flex:0 0 auto;font-weight:var(--brand-weight);letter-spacing:var(--brand-ls);font-size:1.1rem;color:var(--text-body);text-decoration:none;white-space:nowrap}
.dk-flake{color:var(--ice);font-size:1.35rem;margin-right:.3rem}
.dk-crumb{min-width:2ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-footer);font-size:.85rem}
.dk-topbar-right{display:flex;align-items:center;gap:1rem;flex:0 1 auto;min-width:0}
```

Replace the existing `@media(max-width:700px)` rule with:

```css
@media(max-width:700px){.dk-topbar{padding:0 var(--container-pad-mobile);gap:.75rem}.dk-brand{flex:1 1 auto;gap:.5rem;overflow:hidden}.dk-topbar-right{gap:.5rem}.dk-shell{grid-template-columns:1fr}.dk-side{display:none}.dk-main{padding:2rem 0}.dk-disclosure{display:block}.dk-search input{width:min(130px,24vw)}.dk-source{padding:.4rem .55rem}}
```

- [ ] **Step 5: Run the top-bar test and full build**

Run:

```bash
cd skills/frostyard-docs-site/scaffold
npm test
```

Expected: build exits 0, Pagefind indexes the docs, and `shared top bar identifies the configured project` passes.

- [ ] **Step 6: Commit the shared top-bar change**

```bash
git add skills/frostyard-docs-site/scaffold/package.json \
  skills/frostyard-docs-site/scaffold/tests/top-bar.test.mjs \
  skills/frostyard-docs-site/scaffold/src/components/TopBar.astro \
  skills/frostyard-docs-site/scaffold/src/styles/docs.css
git commit -m "feat(docs-site): identify project in top bar"
```

---

### Task 2: Static Project Landing Page

**Files:**
- Create: `skills/frostyard-docs-site/scaffold/tests/landing-page.test.mjs`
- Modify: `skills/frostyard-docs-site/scaffold/src/site.config.ts:1-10`
- Modify: `skills/frostyard-docs-site/scaffold/src/pages/index.astro:1-21`
- Create: `skills/frostyard-docs-site/scaffold/src/styles/landing.css`

**Interfaces:**
- Consumes: `orderedDocs(): Promise<DocEntry[]>` from `src/lib/nav.ts`.
- Consumes: `TopBar` from Task 1.
- Produces: `site.landing.headline: readonly [string, string]`, `description: string`, and exactly three `{ title, description }` points.
- Produces: `/` as a static project landing page whose primary action targets `/${docs[0].id}/`.

- [ ] **Step 1: Write the failing landing-page output test**

Create `skills/frostyard-docs-site/scaffold/tests/landing-page.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readOutput = (path) => readFile(new URL(`../dist/${path}`, import.meta.url), "utf8");
const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("root renders the configured project landing page without redirect metadata", async () => {
  const html = await readOutput("index.html");

  assert.match(html, /<title>example docs<\/title>/);
  assert.match(html, /Meet example\./);
  assert.match(html, /Then build\./);
  assert.match(html, /A concise statement of what the project does and who it serves\./);
  assert.match(html, /Start with context/);
  assert.match(html, /Get running/);
  assert.match(html, /Go deeper/);
  assert.match(html, /class="dk-crumb"[^>]*aria-label="Project: example"[^>]*>\/ example<\/span>/);
  assert.match(html, /href="\/getting-started\/overview\/"/);
  assert.match(html, /href="https:\/\/github\.com\/frostyard\/example"/);
  assert.doesNotMatch(html, /http-equiv="refresh"/);
  assert.doesNotMatch(html, /<title>Redirecting<\/title>/);
  assert.doesNotMatch(html, /rel="canonical"[^>]*getting-started\/overview/);
  assert.doesNotMatch(html, /data-pagefind-body/);
});

test("root source retains the explicit empty-content guard", async () => {
  const source = await readSource("src/pages/index.astro");
  assert.match(
    source,
    /No docs content found: add at least one page under content\/ with title\/group\/order frontmatter\./
  );
});
```

- [ ] **Step 2: Run the suite and verify the landing test fails against the redirect page**

Run:

```bash
cd skills/frostyard-docs-site/scaffold
npm test
```

Expected: the Task 1 top-bar test passes; `root renders the configured project landing page without redirect metadata` fails because `dist/index.html` is still the redirect document.

- [ ] **Step 3: Add the typed landing configuration**

Replace `skills/frostyard-docs-site/scaffold/src/site.config.ts` with:

```ts
type LandingPoint = {
  title: string;
  description: string;
};

type SiteConfig = {
  name: string;
  kicker: string;
  sourceUrl: string;
  url: string;
  landing: {
    headline: readonly [string, string];
    description: string;
    points: readonly [LandingPoint, LandingPoint, LandingPoint];
  };
};

export const site = {
  /** Project name - sidebar label + topbar crumb. Lowercase per brand. */
  name: "example",
  /** One-line descriptor under the name in the sidebar and landing eyebrow. */
  kicker: "A Frostyard project",
  /** Source links in the top bar and landing hero. */
  sourceUrl: "https://github.com/frostyard/example",
  /** Canonical site URL (sitemap, astro `site`). */
  url: "https://example-docs.bjk.workers.dev",
  /** Project-specific root-page copy. Keep each value concise. */
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
} satisfies SiteConfig;
```

- [ ] **Step 4: Replace the redirect with the static landing markup**

Replace `skills/frostyard-docs-site/scaffold/src/pages/index.astro` with:

```astro
---
import "../styles/global.css";
import "../styles/docs.css";
import "../styles/landing.css";
import TopBar from "../components/TopBar.astro";
import { orderedDocs } from "../lib/nav";
import { site } from "../site.config";

const docs = await orderedDocs();
if (docs.length === 0) {
  throw new Error("No docs content found: add at least one page under content/ with title/group/order frontmatter.");
}
const startUrl = `/${docs[0].id}/`;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="description" content={site.landing.description} />
    <title>{site.name} docs</title>
  </head>
  <body>
    <TopBar />
    <main class="dk-landing">
      <section class="dk-landing-hero">
        <p class="dk-landing-eyebrow"><span class="dk-dash"></span>{site.kicker}</p>
        <h1>{site.landing.headline[0]}<br /><em>{site.landing.headline[1]}</em></h1>
        <p class="dk-landing-lede">{site.landing.description}</p>
        <div class="dk-landing-actions">
          <a class="dk-landing-action dk-landing-action-primary" href={startUrl}>Read the docs <span>→</span></a>
          <a class="dk-landing-action dk-landing-action-secondary" href={site.sourceUrl}>View source <span>↗</span></a>
        </div>
      </section>
      <section class="dk-landing-summary" aria-label="Documentation paths">
        {site.landing.points.map((point, index) => (
          <article>
            <span class="dk-landing-number">{String(index + 1).padStart(2, "0")}</span>
            <h2>{point.title}</h2>
            <p>{point.description}</p>
          </article>
        ))}
      </section>
    </main>
  </body>
</html>
```

- [ ] **Step 5: Add landing-specific desktop and mobile styles**

Create `skills/frostyard-docs-site/scaffold/src/styles/landing.css`:

```css
.dk-landing{max-width:var(--container-max);margin:auto;padding:0 var(--container-pad) 5rem}
.dk-landing-hero{display:flex;min-height:500px;max-width:820px;flex-direction:column;justify-content:center;padding:5rem 0 6rem}
.dk-landing-eyebrow{font:var(--text-eyebrow-weight) var(--text-eyebrow-size) var(--font-sans);letter-spacing:var(--text-eyebrow-ls);text-transform:uppercase;color:var(--text-eyebrow);margin:0 0 1.1rem}
.dk-landing h1{font-size:var(--text-display-size);font-weight:var(--text-display-weight);letter-spacing:var(--text-display-ls);line-height:var(--text-display-lh);margin:0}
.dk-landing h1 em{font-family:var(--font-serif-accent);font-weight:400;color:var(--ice)}
.dk-landing-lede{max-width:565px;margin:2rem 0 2.4rem;color:var(--text-muted);font-size:var(--text-lede-size);line-height:1.65}
.dk-landing-actions{display:flex;flex-wrap:wrap;gap:.8rem}
.dk-landing-action{display:inline-flex;align-items:center;justify-content:center;gap:.55rem;min-height:44px;padding:.7rem 1rem;border:1px solid transparent;border-radius:var(--radius-button);font-size:.84rem;font-weight:700;text-decoration:none}
.dk-landing-action-primary{background:var(--ice);color:var(--ink)}
.dk-landing-action-primary:hover{background:var(--link-hover);color:var(--ink)}
.dk-landing-action-secondary{border-color:var(--line-strong);color:var(--text-body)}
.dk-landing-action-secondary:hover{border-color:var(--sky);color:var(--ice)}
.dk-landing-action:focus-visible{outline:2px solid var(--sky);outline-offset:3px}
.dk-landing-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.dk-landing-summary article{padding:2.25rem 2rem 2.4rem}
.dk-landing-summary article:first-child{padding-left:0}
.dk-landing-summary article+article{border-left:1px solid var(--line)}
.dk-landing-number{font-family:var(--font-mono);font-size:var(--text-mono-size);color:var(--sky)}
.dk-landing-summary h2{font-size:1.08rem;margin:.75rem 0}
.dk-landing-summary p{color:var(--text-dim);font-size:.91rem;line-height:1.6;margin:0}

@media(max-width:700px){
  .dk-landing{padding:0 var(--container-pad-mobile) 3rem}
  .dk-landing-hero{min-height:auto;padding:4.5rem 0}
  .dk-landing h1{font-size:clamp(3rem,15vw,4.5rem)}
  .dk-landing-lede{font-size:1rem;margin:1.5rem 0 2rem}
  .dk-landing-actions{align-items:stretch;flex-direction:column}
  .dk-landing-summary{grid-template-columns:1fr}
  .dk-landing-summary article{padding:1.6rem 0}
  .dk-landing-summary article+article{border-top:1px solid var(--line);border-left:0}
}
```

- [ ] **Step 6: Run the complete output suite**

Run:

```bash
cd skills/frostyard-docs-site/scaffold
npm test
```

Expected: build exits 0; Pagefind completes; both top-bar assertions pass; both landing tests pass; Node reports 3 passing tests and 0 failures.

- [ ] **Step 7: Check the page at desktop and mobile widths**

Run:

```bash
cd skills/frostyard-docs-site/scaffold
npm run dev -- --host 127.0.0.1
```

Open `/` at 1440x900 and 390x844. At desktop width, expect a two-beat hero followed by three equal summary columns. At mobile width, expect no horizontal overflow, readable headline wrapping, stacked actions, one-column summary points, a visible or safely truncated `/ example` breadcrumb, and visible search and Source controls.

- [ ] **Step 8: Commit the landing page**

```bash
git add skills/frostyard-docs-site/scaffold/src/site.config.ts \
  skills/frostyard-docs-site/scaffold/src/pages/index.astro \
  skills/frostyard-docs-site/scaffold/src/styles/landing.css \
  skills/frostyard-docs-site/scaffold/tests/landing-page.test.mjs
git commit -m "feat(docs-site): add scaffold landing page"
```

---

### Task 3: Landing Copy Apply Instructions

**Files:**
- Create: `skills/frostyard-docs-site/scaffold/tests/skill-instructions.test.mjs`
- Modify: `skills/frostyard-docs-site/SKILL.md:13-40`

**Interfaces:**
- Consumes: the required `site.landing` shape from Task 2.
- Produces: apply instructions that populate two headline beats, one description, and exactly three summary points from README evidence or direct user input.

- [ ] **Step 1: Write the failing skill-instruction contract test**

Create `skills/frostyard-docs-site/scaffold/tests/skill-instructions.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("apply instructions require project-specific landing copy", async () => {
  const skill = await readFile(new URL("../../SKILL.md", import.meta.url), "utf8");

  assert.match(skill, /Fill the four base values and the `landing` object/);
  assert.match(skill, /two short headline beats/);
  assert.match(skill, /exactly three summary points/);
  assert.match(skill, /ask the user for the missing landing copy/);
});
```

- [ ] **Step 2: Run the suite and verify only the new instruction test fails**

Run:

```bash
cd skills/frostyard-docs-site/scaffold
npm test
```

Expected: build and existing output tests pass; `apply instructions require project-specific landing copy` fails because `SKILL.md` still says to fill only four configuration values.

- [ ] **Step 3: Extend pre-flight derivation rules for landing copy**

In `skills/frostyard-docs-site/SKILL.md`, add this bullet after the existing `url` bullet in step 2:

```markdown
   - `landing` — derive project-specific copy from reliable README statements: two short headline beats, one declarative purpose sentence, and exactly three summary points covering orientation, setup, and deeper use or reference. If the README does not support any of these values, ask the user for the missing landing copy instead of inventing project behavior.
```

- [ ] **Step 4: Update the configuration apply step**

Replace current apply step 4 in `skills/frostyard-docs-site/SKILL.md` with:

```markdown
4. Fill the four base values and the `landing` object in `site/src/site.config.ts`. Keep landing values concise and follow the brand rules above.
```

Keep the remaining numbered steps in their current order.

- [ ] **Step 5: Run all tests and inspect the production output**

Run:

```bash
cd skills/frostyard-docs-site/scaffold
npm test
```

Expected: Astro build and Pagefind exit 0; Node reports 4 passing tests and 0 failures; `git diff --check` produces no output.

Confirm these generated files exist:

```text
skills/frostyard-docs-site/scaffold/dist/index.html
skills/frostyard-docs-site/scaffold/dist/getting-started/overview/index.html
skills/frostyard-docs-site/scaffold/dist/404.html
skills/frostyard-docs-site/scaffold/dist/pagefind/pagefind.js
```

- [ ] **Step 6: Review scope before committing**

Run:

```bash
git status --short
git diff --stat
git diff -- skills/frostyard-docs-site
```

Expected: only the scaffold and skill files named in this plan are modified or added. Existing unrelated `.claude/` and `.superpowers/` files remain untracked and unstaged.

- [ ] **Step 7: Commit the apply instructions and contract test**

```bash
git add skills/frostyard-docs-site/SKILL.md \
  skills/frostyard-docs-site/scaffold/tests/skill-instructions.test.mjs
git commit -m "docs(docs-site): generate project landing copy"
```

- [ ] **Step 8: Perform final verification from the committed tree**

Run:

```bash
cd skills/frostyard-docs-site/scaffold
npm test
cd ../../..
git status --short
```

Expected: build exits 0, all 4 tests pass, and status shows no tracked changes. Untracked `.claude/` and `.superpowers/` may remain because they predate implementation and are outside this feature.
