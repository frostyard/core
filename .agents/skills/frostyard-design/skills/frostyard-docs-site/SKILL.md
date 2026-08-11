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
   - `landing` — derive project-specific copy from reliable README statements: two short headline beats, one declarative purpose sentence, and exactly three summary points covering orientation, setup, and deeper use or reference. If the README does not support any of these values, ask the user for the missing landing copy instead of inventing project behavior.

## Apply

3. Copy the payload: `cp -R <this skill's directory>/scaffold site` (then delete any `site/node_modules`, `site/dist`, `site/.astro` that came along).
4. Fill the four base values and the `landing` object in `site/src/site.config.ts`. Keep landing values concise and follow the brand rules above.
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
