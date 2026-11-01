# Shared skills

Living document. Rationale:
[ADR-0026](../adr/0026-distribute-core-skills-via-sync-prs.md).
Executable contracts:
[AGENTS.md](../../AGENTS.md) and
[skills-sync.json](../../.github/skills-sync.json).

## Overview

Core maintains reusable, task-specific procedures in `.agents/skills/`.
Contributors discover the applicable procedure through `AGENTS.md`, read its
canonical `SKILL.md`, and apply it from the repository where the task belongs.

```text
AGENTS.md -> canonical core SKILL.md -> consumer sync (when configured)
```

## Design

`AGENTS.md` is the skill index and states when each procedure applies. Use the
linked canonical skill rather than a copied version:

| Skill | Use it for |
| --- | --- |
| [frostyard-acmm-conformance](../../.agents/skills/frostyard-acmm-conformance/SKILL.md) | Bringing a repository to Hive ACMM conformance |
| [frostyard-apt-producer](../../.agents/skills/frostyard-apt-producer/SKILL.md) | Publishing a repository's `.deb` packages through apt-publisher |
| [frostyard-design](../../.agents/skills/frostyard-design/SKILL.md) | Frostyard-branded interfaces and assets |
| [frostyard-docs-site](../../.agents/skills/frostyard-docs-site/SKILL.md) | Adding an Astro documentation site |
| [frostyard-go-repo](../../.agents/skills/frostyard-go-repo/SKILL.md) | Creating or conforming a Frostyard Go repository |
| [frostyard-onboard-repo](../../.agents/skills/frostyard-onboard-repo/SKILL.md) | Onboarding an existing repository into core + snowcat |
| [frostyard-plan-project](../../.agents/skills/frostyard-plan-project/SKILL.md) | Planning a multi-step project into sequenced Snowcat issues |
| [frostyard-suite-app-release](../../.agents/skills/frostyard-suite-app-release/SKILL.md) | Releasing a suite app's Flatpak and its daemon's sysext |
| [frostyard-write-adr](../../.agents/skills/frostyard-write-adr/SKILL.md) | Writing, accepting, amending or superseding an ADR |
| [frostyard-repo-docs](../../.agents/skills/frostyard-repo-docs/SKILL.md) | Maintaining a repository's documentation tree |

Core owns the canonical copy of every managed skill. A consumer directory with
a `.synced-from-core` marker is core-managed: do not edit it in the consumer,
because the next sync replaces local changes. Make reusable, organization-wide
changes in core; make repository-specific procedures as consumer-local skills.

Only repositories named in
[skills-sync.json](../../.github/skills-sync.json) receive managed skills.
The default assignments apply to every listed consumer, while the repository
entry adds any extra skills. A skill being present in core does not by itself
make it available in every consumer.

## Operational notes

When a skill is missing from a consumer, first determine whether the procedure
is broadly reusable. For shared work, update the canonical core skill and its
sync assignment. For work unique to that repository, add a consumer-local
skill instead. See [skills sync operations](skills-sync-operations.md) for
the sync lifecycle and recovery procedures.

The `.claude/skills` path is a symlink to `.agents/skills`; edit and link the
canonical `.agents/skills` path so all supported agents see the same content.

### Handling a sync pull request

A sync pull request (`chore: sync agent skills from frostyard/core`, branch
`chore/sync-core-skills`) carries content that was already reviewed and
cross-reviewed in core. Brian made a standing exception to the cross-review
rule for it on 2026-11-01: the repository's owner handles it with a tree
check instead.

1. Resolve the consumer's physical skills path first: `.agents/skills/`,
   or the in-repository target of an `.agents` symlink (chairlift and
   pilothouse use `docs/agents/skills/`).
2. Every file the pull request changes lies under one of that consumer's
   managed skill directories (`defaults` plus its extras in
   [skills-sync.json](../../.github/skills-sync.json)).
3. For each managed directory, the recursive tree entries at the pull
   request's head equal those of `.agents/skills/<name>/` at core's current
   `main`: the same relative paths, no extra and no missing entry (a file
   that `rsync --delete` removed is absent on both sides), and the same
   mode, type and object SHA per entry. `gh api
   repos/OWNER/REPO/git/trees/SHA?recursive=1` lists `path`, `mode`, `type`
   and `sha` for both sides. The `.synced-from-core` marker exists only on
   the consumer side; check it separately: its content is the 2 lines
   `scripts/lib/skills-sync-containment.sh` writes for that skill.
4. The repository's CI is green at that head.

When all 4 hold, the owner adds `ready-for-human`. A new push to the sync
branch (each core skill change force-updates it) means the label comes off
until the check passes again at the new head. A pull request that fails the
check is not edited on the reserved branch: fix core, or dispatch the sync
again. Do not close a needed sync pull request: the next run creates
another one.

## References

- Rationale:
  [ADR-0026](../adr/0026-distribute-core-skills-via-sync-prs.md)
- Operations: [Skills sync operations](skills-sync-operations.md)
- Built in:
  [Plan 0001, Phases 1-2](../plans/0001-docs-shape-rollout.md)
