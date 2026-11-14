# Spec: PR triage

This contract governs core's reusable workflow `.github/workflows/pr-triage.yml`, its caller, and its 3 steps. The `levels` step adds 1 label `level:L1` to `level:L4`, and `risk:high` at L1 and L2. The `readiness` step removes `ready-for-human` when the PR head moved after the label, or when CI at the head was not green when the label came. The `shadow` step writes 1 comment, "would auto-merge", on a Dependabot PR that a narrow auto-merge class would take ([Dependabot shadow](../design/dependabot-shadow.md)). It enables nothing. Consumers include the caller in each repository, the embedded libraries (`scripts/lib/risk-paths.mjs`, `scripts/lib/pr-triage.mjs`), the gate `npm run check:risk-paths`, agents that track PRs, cross-reviewers and the accountable owner.

## Interface

The reusable workflow is `frostyard/core/.github/workflows/pr-triage.yml`, with `on: workflow_call`.

| Input | Type | Default | Use |
| --- | --- | --- | --- |
| `dependabot-shadow` | boolean | `true` | Turns the `shadow` step and its metadata step on or off. It only writes a comment. |

| Part | Value |
| --- | --- |
| Workflow name | `PR triage` |
| Top-level permissions | `{}` |
| Job | `pr-triage`: `runs-on: ubuntu-latest`, `timeout-minutes: 5` |
| Job permissions | `contents: read` and `pull-requests: write`, no other |
| Secrets | None. The steps use `github.token` only. |
| Checkout | None |

The job runs these steps in order:

| Step | `if:` | `PR_TRIAGE_STEP` |
| --- | --- | --- |
| Write the triage scripts | always | not set |
| `levels` | `${{ github.event.action != 'labeled' }}` | `levels` |
| `readiness` | `${{ !cancelled() && (github.event.action == 'synchronize' \|\| (github.event.action == 'labeled' && github.event.label.name == 'ready-for-human')) }}` | `readiness` |
| Fetch the Dependabot metadata | `${{ !cancelled() && inputs.dependabot-shadow && github.event.pull_request.user.login == 'dependabot[bot]' && contains(fromJSON('["opened","synchronize","reopened"]'), github.event.action) }}` | not set |
| `shadow` | `${{ !cancelled() && inputs.dependabot-shadow && github.event.pull_request.user.login == 'dependabot[bot]' && contains(fromJSON('["opened","synchronize","reopened"]'), github.event.action) }}` | `shadow` |

A step after `levels` uses `!cancelled()` in its `if:`, so that it runs after an earlier step failed. A new step goes in this job in the same way.

## Rules

### A. Workflow and caller

- The caller runs on `pull_request_target` with types `opened`, `synchronize`, `reopened`, `edited` and `labeled`.
- The caller pins the reusable workflow to a full 40-character core commit SHA (ADR-0021): `frostyard/core/.github/workflows/pr-triage.yml@<SHA>`.
- Core's own caller, `.github/workflows/risk-paths-caller.yml`, uses the local path `./.github/workflows/pr-triage.yml`. Under `pull_request_target`, the local path resolves to the base branch commit, not to the PR head.
- The caller's job id is `pr-triage`. The check is named `pr-triage / pr-triage`. The `readiness` step leaves out check runs whose name starts with `pr-triage`.
- The caller has no `merge_group` trigger.
- The caller is not a required check.
- A PR that a workflow opens or pushes with `GITHUB_TOKEN` starts no workflow ([GitHub](https://docs.github.com/en/actions/using-workflows/triggering-a-workflow#triggering-a-workflow-from-a-workflow)): the caller and CI do not run on it, so the PR gets no level label, no readiness check and no required check until a person or another token pushes to it or sends another event.
- [Risk-paths rule C](risk-paths.md#c-required-entries) still covers the caller: the list has a glob that matches `.github/workflows/risk-paths-caller.yml`.
- The workflow embeds 2 libraries verbatim, each in 1 heredoc of the step "Write the triage scripts". The step writes them to `$RUNNER_TEMP/pr-triage/`. `risk-paths.mjs` has no trailer. `pr-triage.mjs` has the trailer line `await main(process.env);`. `pr-triage.mjs` imports `./risk-paths.mjs`.
- `npm run check:risk-paths` fails when 1 embedded copy differs from its library, and names the library. `npm run sync:risk-paths-workflow` rewrites both copies.
- A library does not contain the text `${{`, a tab, a CR, or a line that is a heredoc marker (`RISK_PATHS_EOF`, `PR_TRIAGE_EOF`).
- The job checks out nothing. It runs no code from the PR. The workflow lines outside the heredocs name no head ref, merge ref or head SHA.
- Actions are SHA-pinned.

### B. The `levels` step

The step computes the level of the PR and sets the level label by the ratchet, with `risk:high` as the alias of L1 and L2 ([ADR-0078](../adr/0078-sort-pull-requests-by-levels-l1-to-l4.md)). Its behavior is the behavior of [risk-paths rules D and E](risk-paths.md#e-workflow-contract). It does not run on the type `labeled`: a label change moves no file.

### C. The `readiness` step: triggers

- Trigger 1, the head moved after the label. The action is `synchronize` and `pull_request.labels` has `ready-for-human`. The reason is `head-moved`. The step uses `before` and `after` of the event. Both must be 40 lowercase hex characters.
- Trigger 2, the label came while CI is not green. The action is `labeled` and `label.name` is `ready-for-human`. The reason is `checks-not-green`. The step reads the checks of `pull_request.head.sha`, which must be 40 lowercase hex characters.
- A `synchronize` event on a PR without the label: no API call, no change.
- Any other action, or `labeled` with another label: no change.
- The event name must be `pull_request_target`. Another event name fails the step.
- No sender is exempt. This includes GitHub's "Update branch" button and a bot.

### D. The `readiness` step: check evaluation

- The step reads all pages of `GET /repos/{owner}/{repo}/commits/{head}/check-runs?filter=latest&per_page=100` (the `check_runs` array) and of `GET /repos/{owner}/{repo}/commits/{head}/status?per_page=100` (the `statuses` array).
- `filter=latest` gives the latest run of each check name in each check suite. Each workflow run is a check suite of its own, so the list can hold more than 1 run of the same check name, for example a run that a newer workflow run of the same check cancelled ([frostyard/updex#515](https://github.com/frostyard/updex/pull/515)).
- The step counts only the newest run of each check name and app. The app is `app.id`, else `app.slug`. The newest run is the run with the highest `id`. An older run that a newer run of the same check replaced does not count, also when it failed or was cancelled. A newest run that is cancelled, failed or not completed counts as not green. When a run of a group has no `id` that is a safe integer, every run of that group counts. The `statuses` array holds the latest status of each context.
- The step does not use the combined `state`: it is `pending` when the commit has 0 statuses.
- The step leaves out check runs whose `name` starts with `pr-triage`.
- A check run is not green when its `status` is not `completed`, or its `conclusion` is not `success`, `neutral` or `skipped`.
- A commit status is not green when its `state` is `pending`, `failure` or `error`.
- With 1 or more checks that are not green, the step revokes the label.
- With every check green, the label stays.
- With no check run left and no status, the label stays.
- Readiness unknown. When the check-run read or the commit-status read gets HTTP 403, the token cannot read checks. This happens in a private repository: there, the job permissions `contents: read` and `pull-requests: write` do not cover check runs and commit statuses ([bketelsen/fleet run 42646228960](https://github.com/bketelsen/fleet/actions/runs/42646228960)). The step then stops with the outcome `unknown`. It writes a `::notice::` annotation and a `## Readiness` section that start with `readiness unknown`, changes no label, writes no comment, and passes. After a 403 on the check runs, it does not read the statuses.
- Only HTTP 403 gives `unknown`. The step reads the status from the `status` field of the client error, not from its message. Any other HTTP status, or a network error, on these reads fails the step.

### E. The `readiness` step: revoke

The step revokes in this order:

1. It reads all pages of `GET /repos/{owner}/{repo}/issues/{number}/comments?per_page=100`. When no line of a comment body is the marker line of this revocation, it posts 1 comment.
2. It sends `DELETE /repos/{owner}/{repo}/issues/{number}/labels/ready-for-human`. HTTP 200 and 404 both count as done.

Any other API error fails the step. The `pr-triage` check then shows red. A re-run finds the marker and writes no second comment.

The marker line is the first line of the comment. The comment bodies are:

```
<!-- frostyard:readiness-revoked v1 reason=head-moved before=<sha> after=<sha> -->
`ready-for-human` came off: the head moved from `<before 12>` to `<after 12>` after the label. Run the checks and the review again at the new head, then add the label again.
```

```
<!-- frostyard:readiness-revoked v1 reason=checks-not-green head=<sha> -->
`ready-for-human` came off: CI at `<head 12>` was not green when the label came. Add the label again when every check passes at this head.
```

`<sha>` is the full SHA. `<x 12>` is its first 12 characters.

The step writes a `## Readiness` section to the job summary with the result. For `checks-not-green`, it adds a table of the checks that were not green, at most 50 rows.

### F. Limits

- The step is best effort. It does not prove that the review ran at the SHA that the label approved. For exact head-bound approval, see the [autonomy gate](https://airlock.lunareng.com/docs/autonomy-gate.md).
- The step runs seconds to minutes after the event. A label can stay on a PR in that time.
- A push and a label in the same second can race: the label can come off although the review ran at the new head. The error is on the side of removal. The step never keeps a label in doubt.
- A failed run leaves a stale label and a red `pr-triage` check.
- Open case: review at A, push B, CI on B green, then the label. The step keeps the label, because nothing moved after it and CI is green.
- A workflow that itself runs on `labeled` can be pending at that moment. The step then revokes the label.
- The workflow never adds `ready-for-human`. A person or an agent adds it again.
- In a private repository, only trigger 1 (`head-moved`) works. Trigger 2 gives readiness unknown (rule D). The workflow does not ask for `checks: read` and `statuses: read`: a reusable workflow cannot get more permissions than its caller grants, so each caller would need a change first. A secondary rate limit also answers HTTP 403. It then gives readiness unknown and not a red run. In both cases, the label stays, as it does after a failed run.

### G. The shadow step

The step is a measurement. It writes 1 comment that says what a narrow auto-merge class would do. It never enables auto-merge, approves, merges or labels, and it reads no label of the PR ([ADR-0019](../adr/0019-governance-as-code-and-risk-tiers.md) still holds).

**When it runs.** `pull_request.user.login` is `dependabot[bot]`, `event.action` is `opened`, `synchronize` or `reopened`, and the PR is not a draft (`pull_request.draft` is not `true`). Otherwise the step makes no API call and writes no comment; its job summary says why.

**Event validation.** The event name is `pull_request_target`. The owner and the repository name match the name pattern, the PR number is a positive integer, `pull_request.head.sha` and `pull_request.base.sha` are 40 lowercase hex characters, and `pull_request.base.ref` is a non-empty string. A bad value fails the step.

**Live head.** The step reads the pull request with `GET /repos/{owner}/{repo}/pulls/{number}` after the event validation. When its head is not the event head, the step returns `stale` and makes no other API call: the summary says that the head moved from `<event head 12>` to `<live head 12>`, or to a head that is unknown, and no comment is written. The step reads the pull request once more after all 4 criteria pass, before it reads the comments. When the head moved again, it returns `stale` with the level and the checks, and writes no comment. A delayed or re-run job therefore never judges the files of a newer head.

The step evaluates 4 criteria.

**S1: patch or minor only.** The input is the `updated-dependencies-json` output of `dependabot/fetch-metadata`, in `DEPENDABOT_UPDATES`.

- The text parses with `JSON.parse` to a non-empty array.
- Every entry is an object whose `updateType` is exactly `version-update:semver-patch` or `version-update:semver-minor`.
- `prevVersion` and `newVersion` both parse as a version: an optional leading `v`, then 2 or more dot-separated decimal numbers (`[0-9]+`), and nothing else. The numbers compare exactly, with no size limit: the step uses `BigInt`, so 2 versions that differ only above 2^53 are not equal.
- The first number of the 2 versions is equal. When the first number is 0, the second number is equal too. A change from `0.3` to `0.4` is therefore major.
- A grouped PR passes only when every entry passes.

An empty or missing string, invalid JSON, a non-array, an empty array, or any failing entry fails S1. The detail names the first failing entry by `dependencyName` and the reason. The metadata step has `continue-on-error: true`: a failure there makes S1 fail, and it does not fail the job.

**S2: manifest and lock files only.** The step reads all pages of `GET /repos/{owner}/{repo}/pulls/{number}/files?per_page=100`. Each `filename` and each `previous_filename` (a rename) has a base name (the text after the last `/`) in this set, or it matches `^requirements.*\.txt$`:

`go.mod`, `go.sum`, `package.json`, `package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`, `Cargo.toml`, `Cargo.lock`, `pyproject.toml`, `poetry.lock`, `uv.lock`, `Pipfile`, `Pipfile.lock`, `Gemfile`, `Gemfile.lock`.

0 files fails. A list of 3000 files or more fails, because the GitHub API truncated it. The detail names the first path that fails.

**S3: no risk path.** The step reads `GET /repos/{owner}/{repo}/contents/.github/risk-paths.json?ref={base sha}`. No list at the base SHA fails. A list that does not parse or does not validate fails. Otherwise the computed level of `levelOfPullRequest(list, files)` must be `L3` or `L4`. The step uses the computed level only, never a label on the PR: a PR with the label `level:L1` on it but a computed L3 passes. Any error fails S3, and the step does not fail.

**S4: required checks exist.** The step reads all pages of `GET /repos/{owner}/{repo}/rules/branches/{ref}?per_page=100`, with each part of the ref encoded. It collects each entry of `parameters.required_status_checks` of each rule whose `type` is `required_status_checks` as `{ context, integration_id }`; a missing `integration_id` is `null`. It drops exact duplicates (the same context and the same integration_id) and keeps first-seen order. 1 or more entries pass. 0 entries fail.

**Call comments.** A call comment of this head is a comment whose author (`user.login`) is `github-actions[bot]` (the author of every comment that `github.token` writes), whose `id` is a positive integer, and that has a marker line for this head: a line of its body, trimmed, starts with `<!-- frostyard:dependabot-shadow v1 head=<head> `. A comment by another author never counts, never stops a call, and is never deleted.

**Dedupe.** Each head keeps at most 1 comment: the call comment with the lowest comment id. On both paths below, the step keeps that comment and deletes every other call comment of this head with `DELETE /repos/{owner}/{repo}/issues/comments/{id}`. A run whose cleanup failed therefore leaves a duplicate that the next run for the same head removes.

**Comment.** When all 4 criteria pass and the live head is the event head, the step reads all pages of `GET /repos/{owner}/{repo}/issues/{number}/comments?per_page=100`.

- With 1 or more call comment of this head, the step writes nothing, applies the dedupe, and reports `exists`, with `deduplicated: true` when it deleted 1 or more comments.
- Else it writes 1 comment with `POST /repos/{owner}/{repo}/issues/{number}/comments`, which returns the comment with its id (a positive integer; else the step fails). It then reads the comments again and applies the dedupe. When the kept comment is not its own, it removed its own comment and reports `exists` with `deduplicated: true`. Else it reports `called`.

The write follows a read, so 2 runs for the same head can both write. The second list can also lag behind the write, so the step counts its own comment as a call comment even when the list does not hold it yet.

The marker is the first line of the comment:

```
<!-- frostyard:dependabot-shadow v1 head=<sha> level=<level> checks=<json> -->
```

`<json>` is `JSON.stringify` of the required checks, each `{ context, integration_id }`, with every `<` replaced by `\u003c`, `>` by `\u003e` and `&` by `\u0026`. A check name therefore cannot end the HTML comment, and the text stays valid JSON.

The second line of the comment is:

```
Shadow call: auto-merge would be enabled at `<head 12>` (patch or minor; manifest and lock files only; level <level>; <n> required checks). Nothing is enabled. A person still merges.
```

`<sha>` is the full SHA, `<head 12>` its first 12 characters, and `<n>` the number of required checks.

**Errors.** An error from the pull request read, the file list or the rule list fails the step, and then no comment is written. An error while reading the risk list fails S3 only. A comment POST that returns no positive integer id fails the step.

**Summary.** The step writes a `## Dependabot shadow` section: a table `| Criterion | Result | Detail |` with 1 row for each criterion S1 to S4 (`pass` or `fail`, the detail through `escapeCell`), then 1 line: the comment was written, a call for this head exists (with the count of the duplicates it removed), the head moved so no comment was written, or no call.

## Derived artifacts

| Artifact | Derivation |
| --- | --- |
| Reusable workflow (`.github/workflows/pr-triage.yml`) | Rule A and the interface tables |
| Libraries (`scripts/lib/risk-paths.mjs`, `scripts/lib/pr-triage.mjs`) | Rules B to G, with the `levels`, `readiness` and `shadow` steps |
| Sync (`scripts/sync-risk-paths-workflow.mjs`, `npm run sync:risk-paths-workflow`) | Rewrite the 2 embedded copies from the libraries |
| Gate (`scripts/check-risk-paths.mjs`, `npm run check:risk-paths`) | Fail when 1 embedded copy drifts |
| Core's caller (`.github/workflows/risk-paths-caller.yml`) | Rule A, with the local reusable workflow path |
| Caller in each repository | Rule A, with the pinned reusable workflow |

Tests: `test/pr-triage.test.mjs`, `test/risk-paths.test.mjs`. These artifacts MUST match this spec.

## References

- Rationale: [ADR-0077](../adr/0077-bind-ready-for-human-to-the-head-commit.md), [ADR-0068](../adr/0068-label-pull-requests-that-touch-high-risk-paths.md), [ADR-0078](../adr/0078-sort-pull-requests-by-levels-l1-to-l4.md), [ADR-0021](../adr/0021-sha-pinned-actions-and-least-privilege-ci.md)
- Context: [risk-paths spec](risk-paths.md), [Dependabot shadow](../design/dependabot-shadow.md), [quality loop](../design/quality-loop.md), [autonomy gate](https://airlock.lunareng.com/docs/autonomy-gate.md)
