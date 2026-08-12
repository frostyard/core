# 0024 — Rename the AI-facing docs directory from yeti/ to cairn/

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

[ADR-0018](0018-org-wide-agent-instruction-and-knowledge-surfaces.md)
records `yeti/` as the AI-facing architecture-docs directory. The name came
from the **yeti** automation service whose `doc-maintainer` job created and
maintained those directories — and that service is now retired. The name
carries no meaning of its own, and the convention it anchored (agents keep
the docs current) needs a new home: a skill any agent can follow instead of
a scheduled service.

## Decision

- The AI-facing architecture docs directory is named **`cairn/`** — a cairn
  is a stack of stones left to mark the trail for whoever follows, which is
  precisely this directory's job. `cairn/OVERVIEW.md` is the entry point;
  durable not-yet-folded lessons live in `cairn/learnings/`.
- New repos use `cairn/` from the start. Existing `yeti/` directories are a
  **legacy alias**: migrated to `cairn/` opportunistically by the
  [frostyard-cairn skill](../../.agents/skills/frostyard-cairn/SKILL.md)
  the next time it touches a repo, in a dedicated rename commit that also
  updates every reference (instruction files, coverage ignores, workflow
  `paths-ignore`, `.mill.toml` context docs, doc-consistency tests).
- Maintenance moves from the retired yeti service to the skill: any agent
  finishing significant work runs it; the content rules (OVERVIEW structure,
  learnings folded in and deleted, 200–500 line OVERVIEW cap, docs-only
  commits) carry over from the yeti doc-maintainer prompt unchanged.

## Consequences

- The convention survives its tool; the skill is the single place the
  procedure lives.
- Until a repo migrates, tooling that discovers AI docs must check both
  `cairn/` and `yeti/`; the skill removes this ambiguity one repo at a time.
- The rename touches load-bearing references (path filters that keep doc
  commits from triggering image builds; chairlift's doc-consistency tests
  pin `yeti/OVERVIEW.md` strings) — which is why migration is a deliberate
  skill step with the repo gate run afterward, never a bare `git mv`.
- This ADR amends ADR-0018's directory name; everything else in ADR-0018
  stands.

## Alternatives considered

- **Keep `yeti/`:** zero migration, but the name is a dangling reference to
  a retired service and means nothing to newcomers.
- **`atlas/` / descriptive names (`agentdocs/`):** collide with well-known
  products or read as generic; `cairn` is short, unclaimed in this space,
  on-theme, and describes the function.

## References

- Shapes: [frostyard-cairn skill](../../.agents/skills/frostyard-cairn/SKILL.md)
- Builds on: [ADR-0018](0018-org-wide-agent-instruction-and-knowledge-surfaces.md) (amends its directory name)
- Source: retired yeti [doc-maintainer job](https://github.com/frostyard/yeti/blob/main/src/jobs/doc-maintainer.ts)
  and [policy prompt](https://github.com/frostyard/yeti/blob/main/src/policies/doc-maintainer.md)
