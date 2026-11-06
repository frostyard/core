# Skills sync operations

Living document. Rationale:
[ADR-0026](../adr/0026-distribute-core-skills-via-sync-prs.md).
Executable contracts:
[skills-sync.json](../../.github/skills-sync.json),
[sync-skills.yml](../../.github/workflows/sync-skills.yml), and
[sync-skills.sh](../../scripts/sync-skills.sh).

## Overview

The skills sync copies selected, core-managed agent skills into Frostyard
repositories and proposes the result through each repository's normal pull
request gate:

```text
core main/config -> sync workflow -> consumer sync branch -> reviewed PR
```

Core is the source of truth for every directory carrying a
`.synced-from-core` marker. Consumer-local skills may coexist beside managed
skills, but edits within a managed skill are replaced on the next sync.

## Design

### Configuration contract

`.github/skills-sync.json` is a JSON object with two required members and one
optional member:

```json
{
  "defaults": [
    "frostyard-repo-docs",
    "frostyard-acmm-conformance"
  ],
  "groups": {
    "go": ["frostyard-go-repo", "golang-testing"]
  },
  "repos": {
    "lab": [],
    "updex": ["@go"]
  }
}
```

- `defaults` is an array of skill directory names assigned to every consumer.
- `repos` maps a repository slug to an array of additional skill names. An
  empty array means the repository receives only the defaults.
- `groups` is optional. Each key is a group name and each value an array of
  skill names. A name written `@name` in `defaults` or in a repository entry
  expands to that group's skill names. An unknown group stops the run before
  any clone, like an unknown skill name. A group holds skill names only: it
  does not nest another `@name`.
- The script checks this shape (exactly 1 JSON document, string arrays,
  object members, no nested group) before it resolves any list or clones any repository; invalid JSON
  or a wrong shape stops the run with an `::error::` line and exit 1. A
  consumer whose effective set is empty is left alone.
- A consumer's effective set is `defaults` plus its repository-specific
  entries, expanded and deduplicated. Every name must identify an existing
  directory under core's `.agents/skills/`.
- Repository keys are unqualified slugs in the `frostyard` organization. The
  script does not accept another owner or an arbitrary clone URL.

Only keys present in `repos` are consumers. The live file is authoritative;
it includes `chairlift`, `clix`, `firn`, `intuneme`, `lab`, `pilothouse`,
`repogen`, `snosi`, `std`, and `updex`. Every one except `lab` and `snosi`
receives the `@go` group in addition to the default skills: that group is
`frostyard-go-repo` plus the vendored Go skills
([shared skills](shared-skills.md#vendored-go-skills)).
`snowcat` and `snowcat-cockpit` left the list when Snowcat was retired and
both repositories were archived
([ADR-0064](../adr/0064-retire-snowcat.md)). `.agents`, `.agents/skills` and
each managed skill directory must be real directories: the script refuses a
symlink at any of them before it writes or stages a file, and the run fails
for that repository.

### Merge and ownership contract

For each consumer, the script shallow-clones its default branch and mirrors
each effective skill into `.agents/skills/<name>/` with `rsync --delete`.
That operation replaces additions, edits, and deletions inside the configured
managed directory. It does not touch sibling repo-local skills and does not
delete a skill directory merely because its name was removed from the config.

Each mirrored directory gets a stable `.synced-from-core` marker containing
the core source URL. The source commit is recorded in the sync commit message
and PR body rather than the marker, avoiding marker-only diffs after unrelated
core commits.

If the staged skill tree changed, the script recreates
`chore/sync-core-skills` from the freshly cloned default branch, commits as
`frostyard-core[bot] <core@frostyard.invalid>`, and force-pushes that reserved
branch. A run that finds a change rebuilds the branch from the current
default branch, so a dispatch or the weekly run brings a stale sync PR up to
date. A run that finds no change (`== REPO: up to date`) leaves the branch
and any open sync PR as they are; that PR is then obsolete. An existing open
PR from the branch is thereby updated; otherwise the script opens one. The automation never pushes to a consumer's default branch,
and the PR must pass that repository's normal review and merge gate. Human
commits must not be placed on the reserved sync branch because the next run
replaces it.

### Trigger and authentication contract

The workflow runs after a push to core's `main` that changes a skill, the
config, the workflow, or the script. It also runs at 05:23 UTC every Monday
to catch drift and accepts manual dispatches. A single concurrency group lets
one run finish before another begins; in-progress runs are not cancelled.

The workflow maps the core Actions secret `SKILLS_SYNC_TOKEN` to the script's required
`GH_TOKEN` environment variable. The fine-grained PAT must have:

- repository access to every configured Frostyard consumer;
- **Contents: Read and write** to clone and push the sync branch;
- **Pull requests: Read and write** to find and create sync PRs; and
- **Metadata: Read**, implied by GitHub.

The workflow grants no permissions to its `GITHUB_TOKEN` and checkout does not
persist credentials.

The token is a fine-grained PAT owned by the machine account
`frostyard-machines`, with resource owner `frostyard` and repository access
limited to the consumers listed in [`.github/skills-sync.json`](../../.github/skills-sync.json).
GitHub shows `frostyard-machines` as the author of every sync PR (the commit
author stays `frostyard-core[bot]`). A maintainer other than
`frostyard-machines` approves the PR under the default-branch ruleset;
`frostyard-machines` cannot approve its own PR.

### Expiry and rotation

`SKILLS_SYNC_TOKEN`'s expiry is declared in
[`.github/secrets-expiry.json`](../../.github/secrets-expiry.json), the
canonical record ([ADR-0045](../adr/0045-guard-actions-secret-expiry-in-the-repository.md)).
That file — not this document, and not the closed
[core#15](https://github.com/frostyard/core/issues/15) — is the one place the
date lives: it currently declares `2027-11-01` with a 60-day
`warn_days_before` lead time. The record is metadata only; its schema is
closed and holds no token value.

[`scripts/check-secret-expiry.mjs`](../../scripts/check-secret-expiry.mjs)
enforces it. `.github/workflows/secrets-expiry.yml` runs the guard daily and
on dispatch, and the job fails — naming the secret, the date, and this
runbook — once the token is within its lead window or past its expiry. The
guard reads no secret, and it is deliberately not part of `make verify` /
`make ci`, so an approaching rotation never blocks unrelated pull requests.
Run it locally with `npm run check:secret-expiry`.

To rotate: create the replacement token while signed in as
`frostyard-machines`, with the permissions listed above,
replace the `SKILLS_SYNC_TOKEN` repository secret, and update `expires_on` in the record
in the same pull request — the guard keeps failing until the record matches
the live token. After replacing the secret, manually dispatch the sync
workflow. An unchanged run proves clone access; the next changed sync also
exercises push and pull-request access.

### Lifecycle changes

- **Change a managed skill:** edit it in core and merge to `main`. Review and
  merge the generated consumer PRs; do not copy the edit into consumers.
- **Onboard a repository:** add it to the repository access of the
  `SKILLS_SYNC_TOKEN` PAT (the token's settings, signed in as
  `frostyard-machines`), add its slug and extras to `repos`, then merge and
  review the generated PR. Give the token access before the config change
  merges, or the next run fails for that repository. Tool-specific
  discovery wiring remains the consumer repository's responsibility.
- **Change assignments:** edit `defaults` or a repository's extras. Additions
  are mirrored on the next run. Removing an assignment stops future updates
  but requires a separate consumer PR to delete the old directory.
- **Offboard a repository:** remove its `repos` entry, then use a consumer PR
  to remove managed directories that should no longer remain. Close any open
  sync PR and delete the reserved branch separately. An archived repository
  accepts none of these: leave its directories, sync PR, and branch as they
  are.

## Operational notes

Runs are idempotent: consumers with no staged change report `up to date`, so
it is safe to dispatch the whole workflow after correcting a partial failure.
Clone and per-repository git/PR failures are recorded, the remaining consumers
are attempted, and the job exits nonzero. An unknown skill name is a config
error that exits immediately.

| Signal | Recovery |
| --- | --- |
| `GH_TOKEN (SKILLS_SYNC_TOKEN) is not configured` | Restore or rotate the core `SKILLS_SYNC_TOKEN` Actions secret, then dispatch the workflow. |
| `Secrets expiry` workflow fails for `SKILLS_SYNC_TOKEN` | The declared expiry is inside its lead window or past. Rotate the token and update `expires_on` in [`.github/secrets-expiry.json`](../../.github/secrets-expiry.json) ([ADR-0045](../adr/0045-guard-actions-secret-expiry-in-the-repository.md)). |
| `Resource not accessible by personal access token` | Check token expiry, consumer repository access, and Contents/Pull requests permissions; update the secret and dispatch. |
| `clone failed for frostyard/<repo>` | Confirm the slug still exists and the token can read it; correct config or access, then dispatch. |
| `skills-sync.json names unknown skill` | Correct the skill name or restore its core directory, then dispatch. Repositories after the failure were not attempted. |
| `sync failed for frostyard/<repo>` | Inspect the preceding push or `gh pr` error, repair repository policy or token access, then dispatch. Other consumers may already be current. |
| Open sync PR is stale | Dispatch the workflow; the reserved branch and open PR are force-updated from the current default branch. |
| Sync PR was closed without merging | Dispatch after correcting the reason; with no open PR, the script recreates one from the refreshed branch. |
| Consumer edits to a managed skill disappear | Reapply the intended change in core. Use a differently named repo-local skill if it must remain consumer-specific. |
| Removed assignment leaves files behind | Delete the obsolete managed directory with a normal PR in the consumer; removal is intentionally not automated. |

## References

- Rationale:
  [ADR-0026](../adr/0026-distribute-core-skills-via-sync-prs.md),
  [ADR-0019](../adr/0019-governance-as-code-and-risk-tiers.md),
  [ADR-0021](../adr/0021-sha-pinned-actions-and-least-privilege-ci.md),
  [ADR-0045](../adr/0045-guard-actions-secret-expiry-in-the-repository.md),
  [ADR-0064](../adr/0064-retire-snowcat.md) (snowcat and snowcat-cockpit
  offboarded)
- Contributor guide: [Shared skills](shared-skills.md)
- Executable contracts:
  [skills-sync.json](../../.github/skills-sync.json),
  [sync-skills.yml](../../.github/workflows/sync-skills.yml),
  [sync-skills.sh](../../scripts/sync-skills.sh),
  [secrets-expiry.json](../../.github/secrets-expiry.json),
  [secrets-expiry.yml](../../.github/workflows/secrets-expiry.yml),
  [check-secret-expiry.mjs](../../scripts/check-secret-expiry.mjs)
- Built in:
  [Plan 0001, Phases 1-2](../plans/0001-docs-shape-rollout.md) and
  [Plan 0003](../plans/0003-onboard-firn-to-skills-sync.md)
