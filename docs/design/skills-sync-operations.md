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

`.github/skills-sync.json` is a JSON object with two required members:

```json
{
  "defaults": [
    "frostyard-repo-docs",
    "frostyard-acmm-conformance"
  ],
  "repos": {
    "lab": [],
    "updex": ["frostyard-go-repo"]
  }
}
```

- `defaults` is an array of skill directory names assigned to every consumer.
- `repos` maps a repository slug to an array of additional skill names. An
  empty array means the repository receives only the defaults.
- A consumer's effective set is `defaults` plus its repository-specific
  entries, deduplicated. Every name must identify an existing directory under
  core's `.agents/skills/`.
- Repository keys are unqualified slugs in the `frostyard` organization. The
  script does not accept another owner or an arbitrary clone URL.

Only keys present in `repos` are consumers. The live file is authoritative;
it includes `chairlift`, `clix`, `firn`, `intuneme`, `lab`, `pilothouse`,
`repogen`, `snosi`, `std`, and `updex`. Firn receives the
`frostyard-go-repo` extra in addition to the default skills. A regular
`.agents/` directory and a `.agents` symlink are both supported: the script
resolves the physical target before writing or staging files.

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
branch. An existing open PR from the branch is thereby updated; otherwise the
script opens one. The automation never pushes to a consumer's default branch,
and the PR must pass that repository's normal review and merge gate. Human
commits must not be placed on the reserved sync branch because the next run
replaces it.

### Trigger and authentication contract

The workflow runs after a push to core's `main` that changes a skill, the
config, the workflow, or the script. It also runs at 05:23 UTC every Monday
to catch drift and accepts manual dispatches. A single concurrency group lets
one run finish before another begins; in-progress runs are not cancelled.

The workflow maps the core Actions secret `ORG_PAT` to the script's required
`GH_TOKEN` environment variable. The fine-grained PAT must have:

- repository access to every configured Frostyard consumer;
- **Contents: Read and write** to clone and push the sync branch;
- **Pull requests: Read and write** to find and create sync PRs; and
- **Metadata: Read**, implied by GitHub.

The workflow grants no permissions to its `GITHUB_TOKEN` and checkout does not
persist credentials. The current `ORG_PAT` expires on 2027-08-11; rotation and
expiry follow-up is tracked in
[core#15](https://github.com/frostyard/core/issues/15). After replacing the
secret, manually dispatch the workflow. An unchanged run proves clone access;
the next changed sync also exercises push and pull-request access.

### Lifecycle changes

- **Change a managed skill:** edit it in core and merge to `main`. Review and
  merge the generated consumer PRs; do not copy the edit into consumers.
- **Onboard a repository:** confirm `ORG_PAT` can access it, add its slug and
  extras to `repos`, then merge and review the generated PR. Tool-specific
  discovery wiring remains the consumer repository's responsibility.
- **Change assignments:** edit `defaults` or a repository's extras. Additions
  are mirrored on the next run. Removing an assignment stops future updates
  but requires a separate consumer PR to delete the old directory.
- **Offboard a repository:** remove its `repos` entry, then use a consumer PR
  to remove managed directories that should no longer remain. Close any open
  sync PR and delete the reserved branch separately.

## Operational notes

Runs are idempotent: consumers with no staged change report `up to date`, so
it is safe to dispatch the whole workflow after correcting a partial failure.
Clone and per-repository git/PR failures are recorded, the remaining consumers
are attempted, and the job exits nonzero. An unknown skill name is a config
error that exits immediately.

| Signal | Recovery |
| --- | --- |
| `GH_TOKEN (ORG_PAT) is not configured` | Restore or rotate the core `ORG_PAT` Actions secret, then dispatch the workflow. |
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
  [ADR-0021](../adr/0021-sha-pinned-actions-and-least-privilege-ci.md)
- Contributor guide: [Shared skills](shared-skills.md)
- Executable contracts:
  [skills-sync.json](../../.github/skills-sync.json),
  [sync-skills.yml](../../.github/workflows/sync-skills.yml),
  [sync-skills.sh](../../scripts/sync-skills.sh)
- Built in:
  [Plan 0001, Phases 1-2](../plans/0001-docs-shape-rollout.md) and
  [Plan 0003](../plans/0003-onboard-firn-to-skills-sync.md)
