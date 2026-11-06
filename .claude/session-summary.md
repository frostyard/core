# Session summary

Ephemeral session state — agents replace the block below at session end
(session state lives in `.claude/`,
[ADR-0025](../docs/adr/0025-consolidate-repository-docs-into-docs.md)).
The canonical org-work state is
[docs/plans/0001-docs-shape-rollout.md](../docs/plans/0001-docs-shape-rollout.md);
durable learnings go to [.memory/](../.memory/README.md), never here.

## Current state

- The repository baseline ([ADR-0071](../docs/adr/0071-hold-every-code-repository-to-one-baseline.md),
  [spec](../docs/specs/repository-baseline.md)) is the standard for every
  frostyard code repository.
- Core carries the baseline itself: `SECURITY.md`,
  `.github/dependabot.yml`, `docs/org-adrs.md`, and
  `test/repository-baseline.test.mjs`, which holds core to the rows.

## Last landed

- core#204 — ADR-0071, ADR-0070 and the repository baseline spec.
- core#203 — MIT `LICENSE`.
- core#202 — managed skills guarded against Go files.

## Next

- The baseline rollout across the fleet, one PR per repository.
- The B9 and B11 follow-ups stay per repository.
