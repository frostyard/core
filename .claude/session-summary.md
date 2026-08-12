# Session summary

Ephemeral session state — agents replace the block below at session end
(session state lives in `.claude/`,
[ADR-0025](../docs/adr/0025-consolidate-repository-docs-into-docs.md)).
The canonical org-work state is
[docs/plans/0001-docs-shape-rollout.md](../docs/plans/0001-docs-shape-rollout.md);
durable learnings go to [.memory/](../.memory/README.md), never here.

## Current state

- Plan 0001 Phases 1–3 complete (2026-08-12): skills synced org-wide,
  `yeti/` retired, 63 repo-local ADRs merged across six repos.
- ACMM conformance PR in flight: closes core#22–#41 via ADR-0029's alias
  lattice plus new CI, templates, and agent-surface artifacts.

## Last landed

- Plan 0001 Phase 3 (six repo-local ADR PRs + pilothouse overview split).

## Next

- Plan 0001 Phase 4 — supply-chain cleanup (core#16, #17, #18).
