# 0018 — Org-wide agent instruction and knowledge surfaces

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

Every frostyard repo is maintained by whichever coding agent is available.
[ADR-0002](0002-agent-portable-instruction-surface.md) fixed the canonical
instruction surface for this repo; the same problem exists fleet-wide, and
beyond instructions the repos have grown several kinds of agent-facing
knowledge (architecture docs, learned corrections, task prompts, harvested
skills) with no stated boundaries between them.

## Decision

Fleet-wide, every repo carries:

- **One canonical instruction file, `AGENTS.md`**, with `CLAUDE.md`,
  `GEMINI.md`, `.cursorrules`, and `.github/copilot-instructions.md` as
  committed symlinks to it (per ADR-0002). Known drift: updex has the
  symlink reversed (`AGENTS.md → CLAUDE.md`) — direction should be fixed to
  match the standard.
- **`yeti/`** — architecture and decision-rationale documentation written
  for AI consumption, not humans (`OVERVIEW.md` first); excluded from
  coverage and from expensive CI path filters.
- **`.memory/`** — durable learned corrections; where structured, an
  append-only `corrections.jsonl` with the fixed five-field schema
  `{date, scope, correction, evidence, promoted_to}` and a stated promotion
  path into `AGENTS.md`/`yeti/`/skills. Never credentials or non-public
  vulnerability details.
- **`.knowledge/README.md`** — a pointer-only discovery stub naming where
  the repo's real stores live; never content.
- **A skills directory** (`docs/agents/skills/` in mill-onboarded repos,
  `.agents/skills/` here) — one durable lesson per file, kebab-case
  imperative filename.
- **`.github/prompts/*.prompt.md`** — task-shaped runbook prompts.
- Agent-surface paths (`.claude/**`, `.memory/**`, `.knowledge/**`,
  `yeti/**`, `skills/**`) are `paths-ignore`d in expensive build workflows.

## Consequences

- An agent landing in any frostyard repo finds the same map: rules in
  `AGENTS.md`, architecture in `yeti/`, corrections in `.memory/`,
  procedures in skills.
- The kind-boundaries prevent the stores collapsing into competing piles;
  promotion is the only sanctioned duplication.
- Forgetting the path filter when adding an agent directory costs full
  image builds on doc-only commits — treat the filter list as part of this
  convention.

## Alternatives considered

- **Per-tool instruction copies:** rejected in ADR-0002; guaranteed drift.
- **One knowledge pile:** rules, rationale, and corrections have different
  lifetimes and trust levels; mixing them makes every read a triage.

## References

- Shapes: agent surfaces in [snosi](https://github.com/frostyard/snosi),
  [pilothouse](https://github.com/frostyard/pilothouse),
  [chairlift](https://github.com/frostyard/chairlift),
  [updex](https://github.com/frostyard/updex),
  [lab](https://github.com/frostyard/lab); the millify skill wires these.
- Builds on: [ADR-0002](0002-agent-portable-instruction-surface.md)
- Related: [ADR-0019](0019-governance-as-code-and-risk-tiers.md)
- Amended by: [ADR-0024](0024-rename-ai-docs-directory-to-cairn.md)
  (superseded), then [ADR-0025](0025-consolidate-repository-docs-into-docs.md) —
  the separate AI-docs tree is folded into `docs/`, and `.memory/` becomes
  the single learnings inbox
