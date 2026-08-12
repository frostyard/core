---
name: frostyard-cairn
description: Create, update, or migrate a frostyard repo's AI-facing architecture docs — the cairn/ directory (formerly yeti/), entry point cairn/OVERVIEW.md, with learnings folded in. Use whenever asked to update cairn/ or yeti/ docs, after landing a significant change in a frostyard repo, when the AI docs have drifted from the code, or to perform the one-time yeti/ → cairn/ rename.
---

# frostyard-cairn — AI-facing architecture docs

A cairn is a stack of stones left to mark the trail for whoever follows.
`cairn/` is exactly that for a repository: architecture, key patterns, and
decision rationale written **for AI agents, not humans** — detailed context
an agent reads before planning or implementing, not a user guide.

This skill replaces the retired **yeti** service's `doc-maintainer` job
([orchestration](https://github.com/frostyard/yeti/blob/main/src/jobs/doc-maintainer.ts),
[prompt](https://github.com/frostyard/yeti/blob/main/src/policies/doc-maintainer.md)).
Naming decision: [core ADR-0024](../../../docs/adr/0024-rename-ai-docs-directory-to-cairn.md);
the surrounding surface map is [core ADR-0018](../../../docs/adr/0018-org-wide-agent-instruction-and-knowledge-surfaces.md).

## Step 0 — Migrate `yeti/` → `cairn/` (once per repo)

If the repo has `yeti/` and no `cairn/`:

1. `git mv yeti cairn`.
2. Update **every** reference to the old path — it is load-bearing in
   surprising places. Search broadly (`grep -rIl 'yeti' .` excluding
   `.git/`) and expect hits in:
   - `AGENTS.md` / `CLAUDE.md` / `.github/copilot-instructions.md`
   - workflow `paths-ignore` lists (they keep doc commits from triggering
     image builds — do not drop the entry, rename it)
   - coverage ignores (`codecov.yml`), lint excludes
   - `.mill.toml` context-doc lists, `.github/prompts/*.md`
   - doc-consistency tests that pin literal `yeti/OVERVIEW.md` strings
     (e.g. chairlift's `internal/installcheck`)
3. Run the repo's gate (`make ci` or equivalent). Fix what the rename broke;
   weaken nothing.
4. Commit the rename **separately** from any content changes:
   `docs: rename yeti/ to cairn/ (frostyard/core ADR-0024)`.

If a repo still has `yeti/` and you are not doing the migration now, treat
`yeti/` as `cairn/` for all steps below.

## Creating or updating the docs

1. `mkdir -p cairn` if missing.
2. Read the codebase to understand its current structure, purpose, and key
   patterns. If updating, also read `cairn/OVERVIEW.md` **and every doc it
   links to** first; preserve accurate content, update anything outdated.
3. `cairn/OVERVIEW.md` is the entry point and must cover:
   - **Purpose** — what this repo does and its role (2–3 sentences)
   - **Architecture** — key directories, modules, how they fit together
   - **Key Patterns** — important conventions, data flow, design decisions
   - **Configuration** — key config values and environment variables
4. Complex subsystems get dedicated docs (`cairn/build-pipeline.md`,
   `cairn/api-design.md`, …), one subject each, linked from OVERVIEW.md.
5. **Fold in learnings.** Files in `cairn/learnings/` are seeds, not
   archives: merge each into the right topic doc (or OVERVIEW's Key
   Patterns), then **delete the learnings file**. Drop stale or duplicated
   learnings. The directory must trend toward empty.
6. Mine recent history for undocumented decisions: merged PRs and closed
   issues since the last docs commit often contain rationale worth
   capturing. Only document what the current code actually reflects.
7. Keep OVERVIEW.md concise (200–500 lines); dedicated docs may be longer.
8. Docs only — **no code changes** in the same commit. Commit as:
   `docs: update cairn architecture docs`.

## Capturing learnings between maintenance passes

While doing *any* work in a frostyard repo, when you hit a workaround for an
upstream bug (link the issue), a non-obvious pattern required for
correctness, a non-obvious convention, or a hard-won trial-and-error
discovery — write it to `cairn/learnings/<slug>.md` and commit it with the
work. Do **not** write one-off task notes, obvious knowledge, or ephemeral
state, and never create changelog files or "append here" sections. The next
maintenance pass folds these in (step 5).

## Writing style

Optimize for an agent's context window: dense, factual, structured; state
invariants and the *why* behind them; name exact paths, commands, and
constants; skip marketing prose and duplicated README content. If a fact is
enforced by a test or guard, say which one.
