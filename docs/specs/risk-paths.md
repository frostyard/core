# Spec: Risk paths

This contract governs `.github/risk-paths.json`, its validation, matching and level behavior, and the `levels` step of the reusable workflow that labels pull requests with `level:L1` to `level:L4` and `risk:high`. Consumers include the core validator and matcher (`scripts/lib/risk-paths.mjs`), the gate `npm run check:risk-paths` (`scripts/check-risk-paths.mjs`), the reusable workflow, cross-reviewers and the accountable owner.

## Interface

A repository stores `.github/risk-paths.json` at the repository root. The file is a strict JSON object. Schema version 2 gives each glob a level ([ADR-0078](../adr/0078-sort-pull-requests-by-levels-l1-to-l4.md)):

```json
{
  "schema_version": 2,
  "default_level": "L3",
  "paths": [
    { "glob": ".github/risk-paths.json", "level": "L2", "why": "governance: the list" },
    { "glob": ".github/workflows/risk-paths.yml", "level": "L2", "why": "governance: the caller" },
    { "glob": "signing/**", "level": "L1", "why": "signing and keys" },
    { "glob": "docs/how-to/**", "level": "L4", "why": "how-to documentation" }
  ]
}
```

| Field | Type | Required | Constraints |
| --- | --- | --- | --- |
| `schema_version` | integer | yes | `1` or `2` |
| `default_level` | string | yes in v2; not allowed in v1 | 1 of `L1`, `L2`, `L3`, `L4` |
| `paths` | array | yes | At least 1 entry |
| `paths[].glob` | string | yes | Non-empty, valid glob syntax, unique in the file |
| `paths[].level` | string | yes in v2; not allowed in v1 | 1 of `L1`, `L2`, `L3`, `L4` |
| `paths[].why` | string | yes | Non-empty after trim, at most 200 characters |

Validation is deny-by-default (ADR-0019). An unknown key at any level fails. A `schema_version` other than `1` or `2` fails. A wrong type fails. A level outside the 4 values fails. A duplicate glob fails. A glob outside the syntax fails. A duplicate JSON key fails. An invalid file fails the workflow job and adds no label.

A version 1 list stays valid. It has no `default_level` and no `level`:

```json
{
  "schema_version": 1,
  "paths": [
    { "glob": "shared/bootc-secure/**", "why": "boot chain" },
    { "glob": ".github/risk-paths.json", "why": "governance" }
  ]
}
```

A version 1 list reads as: each glob at L1, and `default_level` L3. For a version 1 list, `validateRiskPaths` gives the same result as before version 2 existed.

### Levels

| Level | Label | The accountable owner reads | Typical paths |
| --- | --- | --- | --- |
| L1 | `level:L1` | Every line. The PR body names each L1 path and why the change is safe. | Signing, keys, secrets, boot chain, publication, rulesets and settings |
| L2 | `level:L2` | The whole diff of the matched paths | CI workflows, the risk list, policy files, release config |
| L3 | `level:L3` | Title, body, file list and CI; a skim of the diff | Ordinary code with tests (the usual default) |
| L4 | `level:L4` | Title and CI | How-to docs, README, test data |

L1 is the strictest level. "Stricter" means a lower number. A level is a review hint for a person. It gives no agent the right to merge (ADR-0019, ADR-0042).

## Rules

### A. Glob syntax

- Globs and changed paths are relative to the repository root.
- Separators are `/`.
- A glob has no leading `/` or `./`, no empty segment, and no `..` segment. Validation fails for these forms.
- A glob matches the whole path.
- Matching is case-sensitive.
- `*` matches 0 or more characters except `/`.
- `?` matches 1 character except `/`.
- `**` as a whole segment matches 0 or more whole segments. `**/x` matches `x` and `a/b/x`. `a/**` matches every file under `a/`.
- `{a,b,c}` matches 1 of the comma-separated alternatives. Nesting is not supported. An empty alternative is not supported. One glob expands to at most 256 brace alternatives in all (for example, 8 groups of 2 give 256); validation fails above that limit.
- A dotfile or dot folder matches like any other name. `*` matches `.env`.
- Character classes (`[...]`), negation (`!`), backslash escapes and `**` mixed with other characters in 1 segment, such as `a**`, are not supported. Validation fails for these forms.
- A glob with no `/` matches only at the root. Use `**/name` to match that name anywhere. The glob `**` alone is the exception: it matches every path.

| Glob | Matches | Does not match |
| --- | --- | --- |
| `**/x` | `x`, `a/x`, `a/b/x` | `a/x/y` |
| `**` | `x`, `a/b`, `.github/x.yml` | (nothing) |
| `x*` | `x`, `xy` | `a/x`, `a/xy` |
| `docs/*.md` | `docs/a.md`, `docs/.md` | `docs/a/b.md`, `src/a.md` |
| `shared/**` | `shared/a`, `shared/a/b` | `other/a` |
| `.github/{risk-paths.json,settings.yml}` | `.github/risk-paths.json`, `.github/settings.yml` | `.github/workflows/ci.yml` |

### B. Categories

Each `why` of an entry at L1 or L2 (every entry of a version 1 list) MUST name 1 category:

- boot chain
- signing and keys
- update verification
- auth
- publication
- secrets and credentials
- rulesets and settings
- destructive operations (delete, prune, wipe, disk erase, migrate)
- supply chain (the tool and dependency pins that CI installs, such as `mise.toml`, `mise.lock`, `go.mod`, `go.sum`)
- governance (the list, the caller, policy files)

Where the repository has a governance policy with protected boundaries, the `why` MUST name 1 protected-boundary identifier instead:

- Core uses `protected_boundaries[].id` in `policies/agent-governance.json`.
- Snosi uses `protectedBoundaries[]` in `policies/agent-governance.json`.

For an entry at L3 or L4, `why` is free text, such as `how-to documentation`.

The validator checks the constraints of the field table (a string, non-empty after trim, at most 200 characters).

The gates check the category or boundary name, not `validateRiskPaths`: `checkWhyCategories(list, boundaries)` gives 1 error string for each entry at L1 or L2 (each entry of a version 1 list) whose `why`, trimmed, is not a name and does not start with a name and a colon, such as `governance: the list`. Names are case-sensitive. `boundaries` comes from `protectedBoundaryIds(policy)`, which reads `protected_boundaries[].id` and `protectedBoundaries[]`; when it is empty, the names are the categories above (`WHY_CATEGORIES`). Core's `scripts/check-risk-paths.mjs` reads the policy at `policies/agent-governance.json` (`--policy PATH` names another file). A gate of a repository that vendors the library can call `checkWhyCategories` too. A review checks that the named category fits the path.

### C. Required entries

Every list MUST include a glob that matches:

- `.github/risk-paths.json`
- The caller workflow file itself

In a version 2 list, each glob that matches 1 of these 2 paths MUST have level `L1` or `L2`.

The gates check rule C, not `validateRiskPaths`: core's `scripts/check-risk-paths.mjs`, and the gate of each repository that vendors the library. Both call `checkRequiredPaths(list, [".github/risk-paths.json", <caller>])`, which gives 1 error string for each problem.

### D. Matching and levels

Changed files are every file in the PR file list: added, modified, removed and renamed.

For a rename, both the new path and the previous path are matched.

The level of 1 path (`levelOfFile(list, path)`):

1. The strictest level of all globs that match the path. With a tie, the first matching glob in list order names the source. When no glob matches, `default_level`.
2. The organization floor of the path (rule G), when it is stricter than step 1.

A glob may set a level looser than `default_level`, such as an L4 glob under an L3 default. A stricter matching glob or a floor still wins.

The level of 1 PR (`levelOfPullRequest(list, files)`) is the strictest path level over every changed path. A PR with 0 changed files gets `default_level`. A file list of 3000 entries or more (the API limit) gives L1 (fail safe).

| List | Changed path | Level | Source |
| --- | --- | --- | --- |
| v1, `signing/**` | `signing/a.sh` | L1 | glob |
| v1, `signing/**` | `src/main.go` | L3 | default |
| v2, default L3, `docs/how-to/**` L4 | `docs/how-to/install.md` | L4 | glob |
| v2, default L3, `docs/how-to/**` L4 | `docs/how-to/rotate-keys.md` | L1 | floor (word `keys`) |
| v2, default L4 | `.github/workflows/ci.yml` | L2 | floor |
| v2, default L3 | `keyboard.go` | L3 | default |
| v2, default L3 | `debian/keyrings/frostyard.asc` | L1 | floor (word `keyrings`, extension `asc`) |

With a version 1 list, every PR that matches a glob is at L1 and gets `risk:high`, as before version 2. A floor can also put a PR with no match at L1 or L2; it then gets `risk:high` too.

### E. Workflow contract

The reusable workflow is `frostyard/core/.github/workflows/pr-triage.yml`, with `on: workflow_call`. Its contract is the [PR triage spec](pr-triage.md). The `levels` step of that workflow does the work that this section describes.

- The caller runs on `pull_request_target` with types `opened`, `synchronize`, `reopened`, `edited` and `labeled`. An `edited` event includes a change of the base branch: the job then reads the list at the new base SHA and matches the current file list. The `levels` step runs on every listed type except `labeled`: a label change moves no file.
- The caller pins the reusable workflow to a full 40-character core commit SHA (ADR-0021): `frostyard/core/.github/workflows/pr-triage.yml@<SHA>`. During the move to `pr-triage.yml`, a caller of the older `frostyard/core/.github/workflows/risk-paths.yml@<SHA>` stays valid at its pinned SHA.
- Core's own caller, `.github/workflows/risk-paths-caller.yml`, is the 1 exception to the SHA pin. It uses the local path `./.github/workflows/pr-triage.yml`. Under `pull_request_target`, the local path resolves to the base branch commit, not to the PR head.
- The caller has no `merge_group` trigger.
- The caller is not a required check.
- The workflow has top-level `permissions: {}`.
- The job has `contents: read` and `pull-requests: write`. It has no other permission.
- Actions are SHA-pinned.
- The job checks out nothing. The reusable workflow embeds `scripts/lib/risk-paths.mjs` and `scripts/lib/pr-triage.mjs` verbatim in 2 heredocs, writes them to files, and runs `pr-triage.mjs` with Node. `npm run check:risk-paths` fails when an embedded copy differs from its library.
- Code that the job runs comes only from `frostyard/core` at a pinned commit, never from the PR's repository.
- The job reads `.github/risk-paths.json` at `github.event.pull_request.base.sha`.
- The job MUST NOT check out, read as code or run anything from the PR head or the merge ref.
- The changed files come from `GET /repos/{owner}/{repo}/pulls/{number}/files`, all pages.
- The GitHub API returns at most 3000 files for 1 PR. When the list has 3000 or more entries, the level is L1 and the job summary says that the file list is truncated. This behavior is fail safe.
- With no list at the base SHA, for example in a PR that adds the list, the job writes "no list on base" to the job summary, adds no label and passes.
- An invalid list fails the job with the validation errors, before any label call.
- On every run with a valid list, the job checks that `risk:high` exists (`GET /repos/{owner}/{repo}/labels/risk:high`) before it reads the file list. When `risk:high` does not exist, the job fails with a message that names the label and says that the accountable owner must create it.
- The job then checks the 4 level labels `level:L1` to `level:L4` in the same way. The job MUST NOT create a label: the add-labels API creates a missing label, so these checks come first.
- **Alias.** When the computed level is L1 or L2, the job adds `risk:high`. The job never removes `risk:high`.
- **Missing level labels.** When 1 of the 4 level labels does not exist, the job changes no level label. It writes a warning to the job summary and the log with the missing names and the fix `scripts/apply-triage-settings.sh <owner>/<repo> --apply` in core. The job does not fail.
- **Ratchet.** Else the job reads the PR's labels (`GET /repos/{owner}/{repo}/issues/{number}/labels`, all pages). When the PR has no level label, or the computed level is stricter than its strictest level label, the job adds the label of the computed level, then removes each level label that is looser than the computed level. When the computed level is the same or looser, the job changes no level label, and the job summary says so, for example `computed L3, kept L1`.
- The job summary has a `## Levels` section with the computed level and the label changes, and 1 row for each changed path at L1 or L2: path, matching glob or floor, level and `why`. It shows at most 500 rows and the number of rows that it does not show. The job log lists every row.

### F. Label rule

1. The workflow adds `risk:high` at L1 and L2 and never removes it. The PR author removes it only when the risky change leaves the PR, and writes the reason in the PR. `risk:high` is the alias of L1 and L2 until a later ADR retires it.
2. The repository owner is the agent whose profile lists the repository. When no agent profile lists it, the owner is the accountable owner (`accountable_owners` in `organization/repositories/`).
3. For an author who is not the owner, `ready-for-human` on a `risk:high` PR waits for the owner's review comment on the PR, about the matched paths. The cross-review gives the reviewer the matched paths.
4. For an owner author, the label is the gate. The PR body names each matched path and says why the change is safe. The accountable owner reads every `risk:high` PR before merge, with `is:pr is:open label:ready-for-human label:risk:high`.
5. A PR with `risk:high` (L1 or L2) is at the highest tier of the repository's risk-tier scale in the PR template.
6. The workflow never lowers a level label. Only the PR author lowers it, by hand, when the stricter change leaves the PR, and writes the reason in the PR.
7. The accountable owner reads each PR as the level table of the interface says.

Rules 3, 4, 6 and 7 are policy. All agents use 1 GitHub login, so GitHub cannot check these rules mechanically.

### G. Organization floors

The floors are a constant (`ORG_FLOORS`) in `scripts/lib/risk-paths.mjs`. A list cannot change them.

| Floor | Level | Matches |
| --- | --- | --- |
| Path word | L1 | `secret`, `secrets`, `credential`, `credentials`, `password`, `passwords`, `passwd`, `signing`, `keyring`, `keyrings`, `keys`, `gpg`, `pgp` |
| File extension | L1 | `pem`, `key`, `p12`, `pfx`, `gpg`, `asc` |
| Glob | L2 | `.github/workflows/**`, `.github/actions/**`, `.github/risk-paths.json`, `policies/**`, `.github/policies/**` |

- Path words: the path in lower case, split at `/`, `.`, `-` and `_`. `debian/keyrings/frostyard.asc` has the words `debian`, `keyrings`, `frostyard` and `asc`. `keyboard.go` has no floor word.
- File extension: the text after the last `.` of the last path segment, in lower case. A segment with no `.`, or with only a leading `.` (such as `.env`), has no extension.
- The floor on `.github/risk-paths.json` makes every change to the list at least L2. The job reads the list at the base SHA, so a PR cannot lower its own level.
- Known noise, accepted as fail safe: a test or a unit with a floor word in its name goes to L1, such as `test/no-private-keys-test.sh` or `frostmail-secrets-key.service`.

### H. Grading rule (version 1 to version 2)

A repository moves its list to version 2 by this rule:

- `default_level`: `L3`.
- A version 1 glob whose `why` names boot chain, signing and keys, update verification, auth, publication, secrets and credentials, rulesets and settings, destructive operations, or supply chain (or a protected boundary of those kinds): `L1`.
- A version 1 glob whose `why` names governance or workflows and permissions (the list, the caller, CI workflows, policy files): `L2`. When unsure: `L1`.
- L4 globs are optional. An L4 glob never covers `docs/adr/**`, `docs/specs/**`, `AGENTS.md`, `policies/**` or the whole `docs/**`.

The PR that converts the list changes the list, so it is at least L2 (rule G), and the accountable owner reads it.

## Derived artifacts

| Artifact | Derivation |
| --- | --- |
| Core validator and matcher (`scripts/lib/risk-paths.mjs`) | Implement this interface and validation contract (`validateRiskPaths`, `matchGlob`, `parseStrictJson`, `matchFiles`), the levels (`LEVELS`, `levelOfFile`, `levelOfPullRequest`), the floors (`ORG_FLOORS`, rule G), rule B (`WHY_CATEGORIES`, `protectedBoundaryIds`, `checkWhyCategories`) and rule C (`checkRequiredPaths`) |
| PR triage library (`scripts/lib/pr-triage.mjs`) | Pick the step, and run the `levels` step (rule E), the readiness step and the Dependabot shadow step ([PR triage spec](pr-triage.md)) |
| Gate (`scripts/check-risk-paths.mjs`, `npm run check:risk-paths`) | Validate a list, rule B (with the protected boundaries of `policies/agent-governance.json` when it has any) and rule C (with the level check of version 2), and fail when an embedded copy of a library in the reusable workflow drifts |
| Reusable workflow (`.github/workflows/pr-triage.yml`) | Embed `scripts/lib/risk-paths.mjs` (no trailer) and `scripts/lib/pr-triage.mjs` (with the trailer `await main(process.env);`) verbatim, run with Node with no checkout, and add labels |
| Sync (`scripts/sync-risk-paths-workflow.mjs`, `npm run sync:risk-paths-workflow`) | Rewrite the 2 embedded copies from the libraries |
| Caller in each repository | Run `pull_request_target` with the pinned reusable workflow |
| Core's caller (`.github/workflows/risk-paths-caller.yml`) | Run `pull_request_target` with the local path `./.github/workflows/pr-triage.yml` |
| Core's list (`.github/risk-paths.json`) | Version 2 by the grading rule (rule H); name 1 `protected_boundaries[].id` of `policies/agent-governance.json` in each `why` |
| Gate of a repository that vendors the library (`scripts/check-template.mjs` or similar) | Validate the list with the vendored `validateRiskPaths` and check rule C with `checkRequiredPaths` |
| `repository-surfaces` v1 entry | Declare `.github/risk-paths.json` as a repository surface ([enrollment spec](organization-repository-enrollment.md)) |

Tests: `test/risk-paths.test.mjs`, `test/pr-triage.test.mjs`. These artifacts MUST match this spec.

## References

- Rationale: [ADR-0068](../adr/0068-label-pull-requests-that-touch-high-risk-paths.md), [ADR-0078](../adr/0078-sort-pull-requests-by-levels-l1-to-l4.md), [ADR-0019](../adr/0019-governance-as-code-and-risk-tiers.md), [ADR-0020](../adr/0020-ai-automation-trust-boundaries.md), [ADR-0021](../adr/0021-sha-pinned-actions-and-least-privilege-ci.md), [ADR-0077](../adr/0077-bind-ready-for-human-to-the-head-commit.md)
- Context: [PR triage spec](pr-triage.md), [Airlock levels](https://airlock.lunareng.com/docs/levels.md), [quality loop](../design/quality-loop.md), [PR review rubric](pr-review-rubric.md), [organization repository enrollment](organization-repository-enrollment.md) (the `risk-paths` surface)
