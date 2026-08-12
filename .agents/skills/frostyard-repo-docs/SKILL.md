---
name: frostyard-repo-docs
description: Create or update a frostyard repo's architecture and reference docs in docs/ (docs/architecture.md, docs/reference/), fold .memory/ learnings in, and migrate any legacy yeti/ or cairn/ AI-docs tree into docs/. Use whenever asked to update a frostyard repo's architecture docs, after landing a significant change, when docs have drifted from the code, or to retire a yeti/ or cairn/ directory.
---

# frostyard-repo-docs — one docs/ tree, kept current by agents

Every frostyard repo keeps its documentation in a single `docs/` tree
([core ADR-0025](../../../docs/adr/0025-consolidate-repository-docs-into-docs.md)).
There is no separate "AI docs" directory — *all* docs are written to be
maximally useful in an agent's context window, and that style is the
requirement this skill enforces. This skill descends from the retired yeti
service's doc-maintainer job
([prompt](https://github.com/frostyard/yeti/blob/main/src/policies/doc-maintainer.md)).

## Step 0 — Migrate a legacy `yeti/` or `cairn/` tree (once per repo)

If the repo has `yeti/` (or `cairn/`) and its content is not yet in `docs/`:

1. Move the content into place with `git mv`:
   - `OVERVIEW.md` → `docs/architecture.md`
   - subsystem/reference docs → `docs/reference/<name>.md` (or merge into an
     existing doc covering the same subject — never keep two)
   - `learnings/*` → fold each into the right doc now and delete it; a
     learning not yet foldable moves to the `.memory/` inbox.
2. Update **every** reference to the old path — it is load-bearing. Search
   broadly (`grep -rIn 'yeti\|cairn' . --exclude-dir=.git`) and expect hits
   in: `AGENTS.md`/`CLAUDE.md`/`.github/copilot-instructions.md`, workflow
   `paths-ignore` lists (rename, don't drop — though `docs/**` is often
   already listed, making the old entry deletable), coverage ignores
   (`codecov.yml`), `.mill.toml` context docs, `.github/prompts/*.md`,
   `.knowledge/README.md`, and doc-consistency tests that pin literal old
   paths (e.g. chairlift's `internal/installcheck`).
3. Run the repo's gate (`make ci` or equivalent). Fix what the move broke;
   weaken nothing.
4. Commit the migration separately from content rewrites:
   `docs: fold yeti/ into docs/ (frostyard/core ADR-0025)`.

## Creating or updating the docs

1. Read the codebase first; if updating, also read `docs/architecture.md`
   **and every doc it links to**. Preserve accurate content, fix anything
   outdated.
2. `docs/architecture.md` is the entry point and must cover:
   - **Purpose** — what this repo does and its role (2–3 sentences)
   - **Architecture** — key directories, modules, how they fit together
   - **Key Patterns** — important conventions, data flow, design decisions
   - **Configuration** — key config values and environment variables
   Keep it 200–500 lines; link out rather than inline detail.
3. Complex subsystems get dedicated docs under `docs/reference/` (one
   subject each), linked from architecture.md. Repos using core's full
   taxonomy put "how it fits together" content in `docs/design/` instead.
4. **Drain the inbox.** `.memory/` entries (corrections, learnings) are
   seeds, not archives: fold each into the right doc — or into `AGENTS.md`
   when it is a rule of engagement — then delete the entry. Drop stale or
   duplicated ones. The inbox must trend toward empty.
5. Mine merged PRs and closed issues since the last docs commit for
   undocumented decisions. Only document what the current code reflects.
6. Docs only — no code changes in the same commit. Commit as:
   `docs: update architecture docs`.

## Capturing learnings between passes

While doing *any* work in a frostyard repo, when you hit a workaround for an
upstream bug (link the issue), a non-obvious pattern required for
correctness, a non-obvious convention, or a hard-won trial-and-error
discovery — fold it into the right `docs/` page immediately if small, or
drop it in `.memory/` to be folded by the next pass. Never write one-off
task notes, obvious knowledge, changelogs, or "append here" sections.

## Writing style (applies to all of docs/)

Optimize for a reader with a context window: dense, factual, structured;
state invariants and the *why* behind them; name exact paths, commands, and
constants; skip marketing prose and content duplicated from the README. If
a fact is enforced by a test or guard, say which one.
