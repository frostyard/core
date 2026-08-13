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
| [frostyard-design](../../.agents/skills/frostyard-design/SKILL.md) | Frostyard-branded interfaces and assets |
| [frostyard-docs-site](../../.agents/skills/frostyard-docs-site/SKILL.md) | Adding an Astro documentation site |
| [frostyard-go-repo](../../.agents/skills/frostyard-go-repo/SKILL.md) | Creating or conforming a Frostyard Go repository |
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

## References

- Rationale:
  [ADR-0026](../adr/0026-distribute-core-skills-via-sync-prs.md)
- Operations: [Skills sync operations](skills-sync-operations.md)
- Built in:
  [Plan 0001, Phases 1-2](../plans/0001-docs-shape-rollout.md)
