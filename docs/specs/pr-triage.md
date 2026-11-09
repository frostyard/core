# Spec: PR triage

This contract governs core's reusable workflow `.github/workflows/pr-triage.yml`, its caller, and its steps. The `levels` step adds `risk:high`. The `readiness` step removes `ready-for-human` when the PR head moved after the label, or when CI at the head was not green when the label came. Consumers include the caller in each repository, the embedded libraries (`scripts/lib/risk-paths.mjs`, `scripts/lib/pr-triage.mjs`), the gate `npm run check:risk-paths`, agents that track PRs, cross-reviewers and the accountable owner.

## Interface

The reusable workflow is `frostyard/core/.github/workflows/pr-triage.yml`, with `on: workflow_call`.

| Input | Type | Default | Use |
| --- | --- | --- | --- |
| `dependabot-shadow` | boolean | `true` | Reserved for the Dependabot shadow step. No step reads it yet. |

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

A step after `levels` uses `!cancelled()` in its `if:`, so that it runs after an earlier step failed. A new step goes in this job in the same way.

## Rules

### A. Workflow and caller

- The caller runs on `pull_request_target` with types `opened`, `synchronize`, `reopened`, `edited` and `labeled`.
- The caller pins the reusable workflow to a full 40-character core commit SHA (ADR-0021): `frostyard/core/.github/workflows/pr-triage.yml@<SHA>`.
- Core's own caller, `.github/workflows/risk-paths-caller.yml`, uses the local path `./.github/workflows/pr-triage.yml`. Under `pull_request_target`, the local path resolves to the base branch commit, not to the PR head.
- The caller's job id is `pr-triage`. The check is named `pr-triage / pr-triage`. The `readiness` step leaves out check runs whose name starts with `pr-triage`.
- The caller has no `merge_group` trigger.
- The caller is not a required check.
- [Risk-paths rule C](risk-paths.md#c-required-entries) still covers the caller: the list has a glob that matches `.github/workflows/risk-paths-caller.yml`.
- The workflow embeds 2 libraries verbatim, each in 1 heredoc of the step "Write the triage scripts". The step writes them to `$RUNNER_TEMP/pr-triage/`. `risk-paths.mjs` has no trailer. `pr-triage.mjs` has the trailer line `await main(process.env);`. `pr-triage.mjs` imports `./risk-paths.mjs`.
- `npm run check:risk-paths` fails when 1 embedded copy differs from its library, and names the library. `npm run sync:risk-paths-workflow` rewrites both copies.
- A library does not contain the text `${{`, a tab, a CR, or a line that is a heredoc marker (`RISK_PATHS_EOF`, `PR_TRIAGE_EOF`).
- The job checks out nothing. It runs no code from the PR. The workflow lines outside the heredocs name no head ref, merge ref or head SHA.
- Actions are SHA-pinned.

### B. The `levels` step

The step runs the risk-paths job. Its behavior is the behavior of [risk-paths rule E](risk-paths.md#e-workflow-contract), with no change. It does not run on the type `labeled`: a label change moves no file.

### C. The `readiness` step: triggers

- Trigger 1, the head moved after the label. The action is `synchronize` and `pull_request.labels` has `ready-for-human`. The reason is `head-moved`. The step uses `before` and `after` of the event. Both must be 40 lowercase hex characters.
- Trigger 2, the label came while CI is not green. The action is `labeled` and `label.name` is `ready-for-human`. The reason is `checks-not-green`. The step reads the checks of `pull_request.head.sha`, which must be 40 lowercase hex characters.
- A `synchronize` event on a PR without the label: no API call, no change.
- Any other action, or `labeled` with another label: no change.
- The event name must be `pull_request_target`. Another event name fails the step.
- No sender is exempt. This includes GitHub's "Update branch" button and a bot.

### D. The `readiness` step: check evaluation

- The step reads all pages of `GET /repos/{owner}/{repo}/commits/{head}/check-runs?filter=latest&per_page=100` (the `check_runs` array) and of `GET /repos/{owner}/{repo}/commits/{head}/status?per_page=100` (the `statuses` array).
- The step counts the latest run of each check name (`filter=latest`), as GitHub's checks rollup and merge gate do. An older failed run that a re-run of the same check replaced does not count. The `statuses` array likewise holds the latest status of each context.
- The step does not use the combined `state`: it is `pending` when the commit has 0 statuses.
- The step leaves out check runs whose `name` starts with `pr-triage`.
- A check run is not green when its `status` is not `completed`, or its `conclusion` is not `success`, `neutral` or `skipped`.
- A commit status is not green when its `state` is `pending`, `failure` or `error`.
- With 1 or more checks that are not green, the step revokes the label.
- With every check green, the label stays.
- With no check run left and no status, the label stays.

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

## Derived artifacts

| Artifact | Derivation |
| --- | --- |
| Reusable workflow (`.github/workflows/pr-triage.yml`) | Rule A and the interface tables |
| Libraries (`scripts/lib/risk-paths.mjs`, `scripts/lib/pr-triage.mjs`) | Rules B to F, with the `levels` and `readiness` steps |
| Sync (`scripts/sync-risk-paths-workflow.mjs`, `npm run sync:risk-paths-workflow`) | Rewrite the 2 embedded copies from the libraries |
| Gate (`scripts/check-risk-paths.mjs`, `npm run check:risk-paths`) | Fail when 1 embedded copy drifts |
| Core's caller (`.github/workflows/risk-paths-caller.yml`) | Rule A, with the local reusable workflow path |
| Caller in each repository | Rule A, with the pinned reusable workflow |

Tests: `test/pr-triage.test.mjs`, `test/risk-paths.test.mjs`. These artifacts MUST match this spec.

## References

- Rationale: [ADR-0077](../adr/0077-bind-ready-for-human-to-the-head-commit.md), [ADR-0068](../adr/0068-label-pull-requests-that-touch-high-risk-paths.md), [ADR-0021](../adr/0021-sha-pinned-actions-and-least-privilege-ci.md)
- Context: [risk-paths spec](risk-paths.md), [quality loop](../design/quality-loop.md), [autonomy gate](https://airlock.lunareng.com/docs/autonomy-gate.md)
