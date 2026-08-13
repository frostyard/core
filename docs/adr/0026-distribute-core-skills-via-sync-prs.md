# 0026 — Distribute core agent skills to repos via sync PRs from core

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

Shared agent skills live in core's `.agents/skills/`
([ADR-0002](0002-agent-portable-instruction-surface.md)), but agents work
inside individual repos and read files from the repo they are in. Skills
must therefore exist *as files in each consuming repo*, and they go stale
the moment core's copy changes. GitHub has no native org-wide file
installation: the org `.github` repo only propagates community-health
files, and required workflows don't place files. The Claude plugin
marketplace (`frostyard-ai`) distributes to Claude Code only — the org's
multi-agent stance rules it out as the sole channel. Submodules update
cleanly via Dependabot but are invisible to agents and CI that don't
recurse them.

## Decision

- Core pushes skills out: the workflow
  `.github/workflows/sync-skills.yml` runs `scripts/sync-skills.sh` on
  every push to `main` touching `.agents/skills/**` (plus a weekly cron
  and manual dispatch), mirrors the configured skills into each consuming
  repo's `.agents/skills/<name>/`, and opens (or force-updates) a PR on
  the branch `chore/sync-core-skills`, authenticated with the org `ORG_PAT`
  secret ([ADR-0013](0013-release-fanout-via-repository-dispatch.md)
  precedent).
- `.github/skills-sync.json` is the single config: `defaults` (skills
  every listed repo gets) plus per-repo extras.
- Every synced skill directory carries a `.synced-from-core` marker naming
  the source and commit; **synced skills are edited in core only** — local
  edits are overwritten by the next sync PR.
- Sync PRs merge through each repo's normal review gate; nothing pushes to
  a default branch directly (consistent with
  [ADR-0019](0019-governance-as-code-and-risk-tiers.md)'s agent limits).
- The commit author is the bot identity `frostyard-core[bot]
  <core@frostyard.invalid>` (lab's `.invalid` bot-email precedent).

## Consequences

- Repos get skill updates as reviewable PRs with zero per-repo
  installation; a new repo is onboarded by one line in the config.
- Skill edits in core now fan out as PR churn in every consuming repo —
  batching edits is kind; the weekly cron catches drift and manual-merge
  stragglers.
- Removing a skill from the config stops updates but does not delete the
  directory from consumers; removal is a manual PR (mirroring is scoped to
  the managed dirs only, so repo-local skills are never touched).
- Per-tool discovery wiring (e.g. `.claude/skills` symlink,
  `.mill.toml` skills_dir) remains each repo's concern under ADR-0002/0018;
  the sync only guarantees the tool-agnostic files exist.
- `ORG_PAT` must have repo scope across the org and be available to core's
  workflows; its absence fails the run loudly, not silently.

## Alternatives considered

- **Claude plugin marketplace as the only channel:** Claude-only; violates
  the tool-agnostic surface rule. Kept as a complementary channel.
- **Submodule on core + Dependabot bumps:** GitHub-native, but
  uninitialized submodules make skills silently absent for most agents
  and CI checkouts.
- **Pull-based scheduled workflow in each repo:** the puller itself must
  be installed and kept current in every repo — the same distribution
  problem, recursed.

## References

- Operational design:
  [Skills sync operations](../design/skills-sync-operations.md)
- Shapes: [.github/workflows/sync-skills.yml](../../.github/workflows/sync-skills.yml),
  [scripts/sync-skills.sh](../../scripts/sync-skills.sh),
  [.github/skills-sync.json](../../.github/skills-sync.json)
- Builds on: [ADR-0002](0002-agent-portable-instruction-surface.md),
  [ADR-0018](0018-org-wide-agent-instruction-and-knowledge-surfaces.md),
  [ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md) (the
  workflow follows its pinning/permissions rules)
