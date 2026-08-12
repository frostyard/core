# 0025 — One docs/ tree per repository, in core's four-category shape

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
no crisp rule. Meanwhile core already has a docs shape organized by the
question a doc answers — `adr/` (why), `design/` (how it fits together),
`specs/` (exact contracts), `plans/` (order of work) — and the org sweep
surfaced many repo-local decisions with no home to be recorded in.

## Decision

- **Every frostyard repo adopts core's `docs/` shape**: `docs/README.md`
  (category table + index) and the four categories `docs/adr/`,
  `docs/design/`, `docs/specs/`, `docs/plans/`, each seeded with core's
  `TEMPLATE.md`. Core's cross-linking and housekeeping rules travel with
  the shape: new docs start from the category template, every new doc is
  indexed, decisions get an ADR first, links are bidirectional.
- **Repo-local decisions get repo-local ADRs** in that repo's `docs/adr/`;
  org-wide decisions live in core. `docs/org-adrs.md` holds the back-links
  to the core ADRs that bind the repo, linked from the index.
- **"Written for a context window" is a style requirement on all docs, not
  a location**: dense, factual, structured; invariants and the why behind
  them; exact paths, commands, constants; name the test or guard that
  enforces each pinned fact.
- **Legacy `yeti/`/`cairn/` trees fold into the shape** via the
  [frostyard-repo-docs skill](../../.agents/skills/frostyard-repo-docs/SKILL.md):
  `OVERVIEW.md` → `docs/design/overview.md` (the living how-it-fits doc),
  contract/reference docs → `docs/specs/`, learnings folded in or moved to
  the inbox — updating every reference (instruction files, coverage
  ignores, workflow `paths-ignore`, `.mill.toml`, doc-consistency tests)
  in the same change. Pre-existing uncategorized `docs/*.md` files are
  indexed as-is and categorized opportunistically, not force-moved.
- **Agent operating surfaces stay separate from documentation**: rules in
  `AGENTS.md`, task runbooks in `.github/prompts/`, session state in
  `.claude/`, and **one** learnings/corrections inbox at `.memory/` —
  absorbing the old `learnings/` role, drained into `docs/` (or
  `AGENTS.md` for rules) by the maintenance skill.
- This supersedes ADR-0024 (the rename is moot once the tree is gone) and
  amends ADR-0018's directory map accordingly.

## Consequences

- One shape everywhere: an agent or human landing in any frostyard repo
  finds why/how/what/when in the same four places, and repo-local
  decisions finally have a recording surface.
- No per-doc audience triage; the `org-adrs.md`-beside-`cairn/` confusion
  disappears.
- Migration is more than a rename: each repo gains the scaffold, an index,
  and the documentation rules. The skill makes this mechanical.
- Agent-maintained churn lands in `docs/design/` and `docs/specs/`;
  curated process docs stay quiet.
- CI ignore lists get simpler where `docs/**` is already excluded (the
  common case); repos pinning old paths in doc-consistency tests update
  them during migration.
- Fewer knowledge stores: `.memory/` is the only inbox, with an explicit
  promotion path — resolving overlap flagged during the org sweep.

## Alternatives considered

- **A lightweight per-repo layout (`docs/architecture.md` +
  `docs/reference/`) with optional graduation to the full shape:** the
  first version of this ADR. Rejected same-day: two sanctioned layouts
  reintroduce a triage decision, and the org wants one shape everywhere
  from the start.
- **Keep two trees with a sharper boundary rule:** still two trees, still
  triage per doc. Rejected.
- **Centralize into `cairn/` instead:** `docs/` is the conventional,
  discoverable location humans and tooling expect. Rejected.

## References

- Shapes: [frostyard-repo-docs skill](../../.agents/skills/frostyard-repo-docs/SKILL.md),
  core's [docs/README.md](../README.md) (the canonical category table)
- Builds on: [ADR-0001](0001-record-architecture-decisions.md),
  [ADR-0018](0018-org-wide-agent-instruction-and-knowledge-surfaces.md) (amends its directory map)
- Supersedes: [ADR-0024](0024-rename-ai-docs-directory-to-cairn.md)
