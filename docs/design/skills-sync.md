# Skills sync

Living document. Rationale: [ADR-0026](../adr/0026-distribute-core-skills-via-sync-prs.md).
Built in: [Org docs-shape and skills rollout — Phase 1](../plans/0001-docs-shape-rollout.md).

## Overview

Core owns the shared agent skills in `.agents/skills/` and pushes them into
each consuming repo as reviewable PRs, so every repo carries the current
files without per-repo installation. The mechanism is one config file, one
script, and one workflow:

```
.github/skills-sync.json ──► scripts/sync-skills.sh ──► chore/sync-core-skills PR (per repo)
      (config)                 (run by sync-skills.yml)        (merged through repo review)
```

## Configuration surface

`.github/skills-sync.json` is the single config. Its schema:

```json
{
  "defaults": ["<skill>", "..."],
  "repos": {
    "<repo>": ["<extra skill>", "..."]
  }
}
```

- **`defaults`** — skills every listed repo receives.
- **`repos`** — map of consuming repo name (under `frostyard/`) to its list
  of *extra* skills. An empty array means "defaults only".

The set a repo receives is `(defaults + repos[repo])` deduplicated and
sorted (`jq '... | unique'`). Each named skill must exist as a directory
under core's `.agents/skills/<name>/`; an unknown name fails the run loudly
(`::error::skills-sync.json names unknown skill`). Onboarding a new repo is
one new key in `repos`; a repo that should get only the defaults still needs
its key present (with `[]`) to be synced at all.

## Merge behavior

For each configured repo the script:

1. Shallow-clones the repo with the run token.
2. Resolves `.agents` to its physical directory first, because some repos
   (chairlift, pilothouse) symlink `.agents → docs/agents`; pathspecs must
   match files, not the symlink.
3. Mirrors each selected skill into `.agents/skills/<name>/` with
   `rsync -a --delete`, so the synced directory becomes an exact copy of
   core's. **Only the managed skill directories are touched** — repo-local
   skills are never modified or deleted.
4. Writes a `.synced-from-core` marker into each managed directory naming
   the source. The marker deliberately carries **no commit SHA**: a SHA
   would make every core commit produce a marker-only diff in every
   consumer. Provenance detail lives in the sync commit message instead.
   (ADR-0026's prose describes the marker as naming "the source and
   commit"; the implementation intentionally narrowed it to the source
   only for this churn reason — this doc reflects the running behavior.)
5. If (and only if) the mirror produced a staged diff, commits on branch
   `chore/sync-core-skills` and force-pushes it, then opens the PR — or, if
   one is already open on that branch, reports that the branch was
   force-updated instead of opening a duplicate.

A repo with no drift logs `up to date` and no PR is created.

## Identity and authentication

- **Commit author:** the bot identity `frostyard-core[bot]
  <core@frostyard.invalid>` (set per-commit via `git -c user.name/-c
  user.email`), never a human account.
- **Token:** `GH_TOKEN` must be the org `ORG_PAT` secret, with **repo**
  scope across the org **and Pull requests: read and write** (added in
  rollout Phase 1, [core#15](https://github.com/frostyard/core/issues/15)).
  Its absence fails the run immediately (`GH_TOKEN (ORG_PAT) is not
  configured`). A create failure — e.g. the token missing
  `pull-requests:write` — is surfaced loudly rather than masked by a
  fallback, so a mis-scoped token cannot silently no-op.

## Lifecycle

The workflow `.github/workflows/sync-skills.yml` runs `sync-skills.sh` on:

- every push to `main` that touches any of `.agents/skills/**`,
  `.github/skills-sync.json`, `.github/workflows/sync-skills.yml`, or
  `scripts/sync-skills.sh` (a config, workflow, or script change propagates
  just like a skill edit),
- a weekly cron (`23 5 * * 1`, catches drift and manual-merge stragglers),
  and
- manual `workflow_dispatch`.

The job is guarded to `frostyard/core` and serialized by a `sync-skills`
concurrency group (`cancel-in-progress: false`) so runs never overlap.

Each run opens or force-updates one `chore/sync-core-skills` PR per repo
with drift. Those PRs merge through each repo's normal review gate; nothing
is pushed to a consumer's default branch directly. Removing a skill from the
config **stops updates but does not delete** the directory from consumers —
removal is a manual per-repo PR, because mirroring is scoped to the managed
directories only.

## Operational notes

- **A repo silently gets no skills:** it has no key in `repos`. Add the key
  (with `[]` for defaults-only).
- **`unknown skill` error:** a name in `defaults`/`repos` has no matching
  directory under core's `.agents/skills/`; fix the name or add the skill.
- **Sync run triggers image builds in a consumer:** the non-markdown
  `.synced-from-core` marker escaped a `**/*.md` `paths-ignore`; add
  `.agents/**` to that repo's build ignore (root cause of the 2026-08-12
  snosi build churn, see the rollout plan Phase 2).
- **A local edit to a synced skill vanished:** expected — synced directories
  are `rsync --delete` mirrors of core; edit the skill in core, not in the
  consumer.
- **Re-run on demand:** dispatch `sync-skills.yml`; it is idempotent and
  force-updates the existing branch rather than stacking PRs.
- **Per-tool discovery wiring** (`.claude/skills` symlink, `.mill.toml`
  `skills_dir`, etc.) is each repo's concern under ADR-0002/0018; the sync
  only guarantees the tool-agnostic files exist.

## References

- Rationale: [ADR-0026](../adr/0026-distribute-core-skills-via-sync-prs.md)
- Shapes: [scripts/sync-skills.sh](../../scripts/sync-skills.sh),
  [.github/skills-sync.json](../../.github/skills-sync.json),
  [.github/workflows/sync-skills.yml](../../.github/workflows/sync-skills.yml)
- Built in: [Org docs-shape and skills rollout — Phase 1](../plans/0001-docs-shape-rollout.md)
