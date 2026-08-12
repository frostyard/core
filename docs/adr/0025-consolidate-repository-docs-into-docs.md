# 0025 — One docs/ tree per repository; retire the separate AI-docs directory

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

Repos carry two documentation trees: `docs/` (human docs, and now
`org-adrs.md`) and `yeti/`/`cairn/` ("AI-facing" architecture docs,
[ADR-0018](0018-org-wide-agent-instruction-and-knowledge-surfaces.md),
[ADR-0024](0024-rename-ai-docs-directory-to-cairn.md)). The split existed
because the retired yeti *service* needed a directory it owned — an
ownership boundary for a robot, dressed up as an audience boundary. The
audience boundary does not hold: good AI docs (dense, factual, invariants,
exact paths) are simply good docs; content already leaks both ways (updex's
`docs/patterns.md` is pure architecture rationale, `cairn/sdk-api.md` is
reference any human wants); and every new doc costs a triage decision with
no crisp rule. Two trees also means two places to go stale, and the org
already carries two learning inboxes (`cairn/learnings/`, `.memory/`).

## Decision

- **`docs/` is the single documentation tree** in every frostyard repo:
  architecture (`docs/architecture.md`, or `docs/design/` in repos adopting
  core's four-category taxonomy), reference (`docs/reference/`), process
  docs, and org back-links (`docs/org-adrs.md`).
- **"Written for a context window" is a style requirement on all docs, not
  a location**: dense, factual, structured; invariants and the why behind
  them; exact paths, commands, constants; name the test or guard that
  enforces each pinned fact.
- **Agent operating surfaces stay separate from documentation**: rules in
  `AGENTS.md`, task runbooks in `.github/prompts/`, session state in
  `.claude/`, and **one** learnings/corrections inbox at `.memory/` —
  absorbing the old `learnings/` role. The maintenance skill folds
  `.memory/` entries into `docs/` (or `AGENTS.md` for rules) and deletes
  them; the inbox trends toward empty.
- Existing `yeti/` (and the one piloted `cairn/`) trees are **folded into
  `docs/`** by the
  [frostyard-repo-docs skill](../../.agents/skills/frostyard-repo-docs/SKILL.md),
  updating every reference (instruction files, coverage ignores, workflow
  `paths-ignore`, `.mill.toml`, doc-consistency tests) in the same change.
- This supersedes ADR-0024 (the rename is moot once the tree is gone) and
  amends ADR-0018's directory map accordingly. Core itself already models
  the end state: one `docs/` tree, no AI-docs sibling.

## Consequences

- One place to read and one to maintain; no per-doc audience triage; the
  `org-adrs.md`-beside-`cairn/` confusion disappears.
- Agent-maintained churn now lands in `docs/` — grouped under
  `docs/architecture*`/`docs/reference/` so curated pages stay quiet.
- CI ignore lists get simpler where `docs/**` is already excluded (the
  common case); repos pinning old paths in doc-consistency tests update
  them during migration.
- Fewer knowledge stores: `.memory/` is the only inbox, with an explicit
  promotion path — resolving overlap flagged during the org sweep.

## Alternatives considered

- **Keep two trees with a sharper boundary rule:** still two trees, still
  triage per doc, and the fuzzy cases (patterns, references, org ADR
  links) stay fuzzy. Rejected.
- **Centralize into `cairn/` instead:** `docs/` is the conventional,
  discoverable location humans and tooling expect; process docs would sit
  oddly in an AI-named tree. Rejected.

## References

- Shapes: [frostyard-repo-docs skill](../../.agents/skills/frostyard-repo-docs/SKILL.md)
- Builds on: [ADR-0018](0018-org-wide-agent-instruction-and-knowledge-surfaces.md) (amends its directory map)
- Supersedes: [ADR-0024](0024-rename-ai-docs-directory-to-cairn.md)
