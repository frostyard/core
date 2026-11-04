# Spec: Risk paths

This contract governs `.github/risk-paths.json`, its validation and matching behavior, and the reusable workflow that labels pull requests. Consumers include the core validator and matcher (`scripts/lib/risk-paths.mjs`, later change), the reusable workflow, cross-reviewers and the accountable owner.

## Interface

A repository stores `.github/risk-paths.json` at the repository root. The file is a strict JSON object:

```json
{
  "schema_version": 1,
  "paths": [
    { "glob": "shared/bootc-secure/**", "why": "boot chain" },
    { "glob": ".github/risk-paths.json", "why": "governance" }
  ]
}
```

| Field | Type | Required | Constraints |
| --- | --- | --- | --- |
| `schema_version` | integer | yes | Exactly `1` |
| `paths` | array | yes | At least 1 entry |
| `paths[].glob` | string | yes | Non-empty, valid glob syntax, unique in the file |
| `paths[].why` | string | yes | Non-empty after trim, at most 200 characters |

Validation is deny-by-default (ADR-0019). An unknown key at any level fails. Another `schema_version` fails. A wrong type fails. A duplicate glob fails. A glob outside the syntax fails. A duplicate JSON key fails. An invalid file fails the workflow job and adds no label.

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
- `{a,b,c}` matches 1 of the comma-separated alternatives. Nesting is not supported. An empty alternative is not supported.
- A dotfile or dot folder matches like any other name. `*` matches `.env`.
- Character classes (`[...]`), negation (`!`), backslash escapes and `**` mixed with other characters in 1 segment, such as `a**`, are not supported. Validation fails for these forms.
- A glob with no `/` matches only at the root. Use `**/name` to match that name anywhere.

| Glob | Matches | Does not match |
| --- | --- | --- |
| `**/x` | `x`, `a/x`, `a/b/x` | `a/x/y` |
| `docs/*.md` | `docs/a.md`, `docs/.md` | `docs/a/b.md`, `src/a.md` |
| `shared/**` | `shared/a`, `shared/a/b` | `other/a` |
| `.github/{risk-paths.json,settings.yml}` | `.github/risk-paths.json`, `.github/settings.yml` | `.github/workflows/ci.yml` |

### B. Categories

Each `why` MUST name 1 category:

- boot chain
- signing and keys
- update verification
- auth
- publication
- secrets and credentials
- rulesets and settings
- destructive operations (delete, prune, wipe, disk erase, migrate)
- governance (the list, the caller, policy files)

Where the repository has a governance policy with protected boundaries, the `why` MUST name 1 protected-boundary identifier instead:

- Core uses `protected_boundaries[].id` in `policies/agent-governance.json`.
- Snosi uses `protectedBoundaries[]` in `policies/agent-governance.json`.

The validator checks only that `why` is non-empty. A review checks the category or boundary name.

### C. Required entries

Every list MUST include:

- `.github/risk-paths.json`
- The caller workflow file itself

### D. Matching

Changed files are every file in the PR file list: added, modified, removed and renamed.

For a rename, both the new path and the previous path are matched.

A PR matches when at least 1 changed path matches at least 1 glob.

### E. Workflow contract

The reusable workflow is `frostyard/core/.github/workflows/risk-paths.yml`, with `on: workflow_call`.

- The caller runs on `pull_request_target` with types `opened`, `synchronize` and `reopened`.
- The caller pins the reusable workflow to a full 40-character core commit SHA (ADR-0021).
- The caller has no `merge_group` trigger.
- The caller is not a required check.
- The workflow has top-level `permissions: {}`.
- The job has `contents: read` and `pull-requests: write`. It has no other permission.
- Actions are SHA-pinned.
- A checkout sets `persist-credentials: false`.
- Code that the job runs comes only from `frostyard/core` at a pinned commit, never from the PR's repository.
- The job reads `.github/risk-paths.json` at `github.event.pull_request.base.sha`.
- The job MUST NOT check out, read as code or run anything from the PR head or the merge ref.
- The changed files come from `GET /repos/{owner}/{repo}/pulls/{number}/files`, all pages.
- The GitHub API returns at most 3000 files for 1 PR. When the list has 3000 entries, the job adds the label and writes that the file list is truncated. This behavior is fail safe.
- With no list at the base SHA, for example in a PR that adds the list, the job writes "no list on base" to the job summary and passes.
- Before it adds the label, the job checks that `risk:high` exists (`GET /repos/{owner}/{repo}/labels/risk:high`). The job MUST NOT create the label: the add-labels API creates a missing label, so this check comes first.
- On a match, the job adds `risk:high` with the caller's `GITHUB_TOKEN` and writes each matched path, glob and `why` to the job summary.
- With no match, the job changes no label.
- The job never removes `risk:high`.
- When `risk:high` does not exist in the repository, the job fails with a message that names the label and says that the accountable owner must create it.
- An invalid list fails the job with the validation errors.

### F. Label rule

1. The workflow adds `risk:high` and never removes it. The PR author removes it only when the risky change leaves the PR, and writes the reason in the PR.
2. The repository owner is the agent whose profile lists the repository. When no agent profile lists it, the owner is the accountable owner (`accountable_owners` in `organization/repositories/`).
3. For an author who is not the owner, `ready-for-human` on a `risk:high` PR waits for the owner's review comment on the PR, about the matched paths. The cross-review gives the reviewer the matched paths.
4. For an owner author, the label is the gate. The PR body names each matched path and says why the change is safe. The accountable owner reads every `risk:high` PR before merge, with `is:pr is:open label:ready-for-human label:risk:high`.
5. A risk-path match means the highest tier of the repository's risk-tier scale in the PR template.

Rules 3 and 4 are policy. All agents use 1 GitHub login, so GitHub cannot check these rules mechanically.

## Derived artifacts

| Artifact | Derivation |
| --- | --- |
| Core validator and matcher (`scripts/lib/risk-paths.mjs`) | Implement this interface and validation contract |
| Reusable workflow | Execute the workflow contract and add labels |
| Caller in each repository | Run `pull_request_target` with the pinned reusable workflow |
| `repository-surfaces` v1 entry | Declare `.github/risk-paths.json` as a repository surface |

These artifacts land with their tests in a later change. They MUST match this spec.

## References

- Rationale: [ADR-0068](../adr/0068-label-pull-requests-that-touch-high-risk-paths.md), [ADR-0019](../adr/0019-governance-as-code-and-risk-tiers.md), [ADR-0020](../adr/0020-ai-automation-trust-boundaries.md), [ADR-0021](../adr/0021-sha-pinned-actions-and-least-privilege-ci.md)
- Context: [quality loop](../design/quality-loop.md), [PR review rubric](pr-review-rubric.md)
