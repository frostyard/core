# 0091 — Run no Claude Code action in frostyard workflows

- **Status:** Accepted
- **Date:** 2026-11-21
- **Extends:** [ADR-0020](0020-ai-automation-trust-boundaries.md) (which AI
  automation runs in CI); no statement of ADR-0020 changes

## Context

- On 2026-11-21, 3 frostyard repositories run
  [`anthropics/claude-code-action`](https://github.com/anthropics/claude-code-action)
  in `.github/workflows/claude-code-review.yml` on their default branch:
  chairlift (`c21d2d9`, v1.0.278), lab (`8f3d218`, v1.0.278) and pilothouse
  (`c36577a`, v1.0.279). Each job reads the Actions secret
  `ANTHROPIC_API_KEY`. In lab and pilothouse the job that runs the action
  holds `pull-requests: write` and runs on `pull_request`; chairlift splits a
  read-only review job from a publish job and starts on
  `workflow_dispatch`.
- None of the 3 has an `ANTHROPIC_API_KEY` repository secret, and the
  workflows have not run a model: the runs of 2026-11-21 in lab (run
  44866361893) and pilothouse (run 44893195473) logged that the secret is
  not configured and skipped the review, and chairlift's workflow has 0
  runs.
- No other non-archived repository of frostyard or bketelsen that is not a
  fork (204 repositories, default branches, read on 2026-11-21) uses
  `anthropics/claude-code-action` or `anthropics/claude-code-base-action` in
  `.github/workflows/` or `.github/actions/`. frostyard/updex has a workflow
  named `claude-code-review.yml` that only requests a Copilot review; it runs
  no Claude action.
- The action releases often. chairlift merged 5 Dependabot bumps of it from
  2026-10-16 to 2026-11-08 (chairlift #243, #251, #256, #274, #280). A test
  that wrote its SHA turned a pilothouse bump red
  ([ADR-0088](0088-read-the-action-pin-in-workflow-tests-never-hard-code-it.md)).
- Every frostyard pull request that pocketd agents open gets a pocketd
  cross-review: an agent that did not write the pull request reviews it at
  its head commit against the
  [PR review rubric](../specs/pr-review-rubric.md) and gives a verdict.
  `ready-for-human` says that the cross-review passed at the head
  ([ADR-0077](0077-bind-ready-for-human-to-the-head-commit.md)). The
  cross-review runs outside GitHub Actions and reads no Actions secret.
- Copilot review stays request-on-ready where a repository requests it
  ([ADR-0041](0041-retire-copilot-review-apply-where-snowcat-gates-review.md)).
- The [repository baseline](../specs/repository-baseline.md) has rows B1 to
  B19, and no row about which AI actions a workflow may use
  ([ADR-0071](0071-hold-every-code-repository-to-one-baseline.md)).

## Decision

- **No Claude Code action.** No frostyard repository uses
  `anthropics/claude-code-action` or `anthropics/claude-code-base-action`,
  at any ref, as a step, a job's reusable workflow, or a step of a composite
  action, in any file under `.github/workflows/` or `.github/actions/`. A
  fork or mirror under the same repository name counts as the action.
- **The cross-review replaces the Claude review.** The AI review of a
  frostyard pull request is pocketd's cross-review (Context). A repository
  that runs the action removes the workflow, the tests that pin it, the
  Dependabot entries or groups that exist only for it, and the docs that
  describe the Claude review as live. An `ANTHROPIC_API_KEY` Actions secret
  that exists then has no reader, and an owner deletes it.
- **A repository-local guard may sit beside row B20.** A test in the
  repository's own CI that fails on the action, the secret name or a
  Claude Code CLI in `.github/` catches them before the merge and can cover
  more than row B20; row B20 stays the organization's check.
- **Baseline row B20** records the rule in the
  [repository baseline](../specs/repository-baseline.md). A `uses:` value
  (under any mapping, `with:` included) counts when, read with the `yaml`
  parser in every document of the file, it
  names `claude-code-action` or `claude-code-base-action` as its repository
  (case-insensitive, quoted or not, under any owner, with or without a ref
  or path). A name in a comment, a step name, a `run:` text, or a file
  outside `.github/workflows/*.y[a]ml` and `.github/actions/**/*.y[a]ml`
  does not count. A file that the parser rejects and whose text names the
  action fails.
- **The check.** `claudeActionGaps` in `scripts/lib/fleet-conventions.mjs`
  implements row B20. The organization gate (`npm run check:fleet`) runs it
  on the default branch of each `fleet_state: enabled` repository, or of
  each `OWNER/REPO` it gets, and fails a repository whose
  `.github/workflows` or `.github/actions` it cannot read.
  `test/repository-baseline.test.mjs` holds core's own tree to it.
- ADR-0020's trust boundaries keep governing the AI automation that stays
  (Copilot review requests, the `ai-fix-requested` handoff).

## Consequences

- No frostyard workflow can give a model an Anthropic API key or a token in
  a pull request job; the Dependabot bumps of the action, and 3 workflows
  that skip the review on every run, go away.
- No AI review comment comes from CI. A pull request that no pocketd agent
  reviews (for example one from an outside contributor) gets the Copilot
  review where the repository requests it, and the owner's review.
- Until chairlift, lab and pilothouse remove their workflow,
  `node scripts/check-fleet-conventions.mjs frostyard/<repo>` fails them on
  row B20 and the weekly sweep files a `baseline-B20` finding for each. None
  of the 3 is `fleet_state: enabled`, so core's `fleet-conventions` job stays
  green meanwhile.
- The check sees what is merged on a default branch. A workflow that adds
  the action on a pull request branch is seen after the merge; review of
  `.github/workflows/**` (level L2 or L1, `risk:high`) covers it before
  ([risk paths](../specs/risk-paths.md)).
- The check does not see the action behind another repository's reusable
  workflow or composite action that wraps it, nor a Claude Code CLI that a
  `run:` step installs. Row B20 does not cover them; a reviewer does.
- The 7 enabled repositories are checked on every core CI run; the other
  code repositories only by the weekly sweep or an explicit `OWNER/REPO`
  run.
- [ADR-0088](0088-read-the-action-pin-in-workflow-tests-never-hard-code-it.md)
  and [ADR-0090](0090-scope-action-pins-and-check-them-repository-wide.md)
  name `claude-code-action` as an example of a pin; their decisions do not
  depend on it and they stay as they are.

## Alternatives considered

- **Keep the Claude review as an advisory check:** it repeats the
  cross-review, works only once an API key is put in Actions secrets, and
  in 2 of the 3 repositories gives the model a job with
  `pull-requests: write`.
- **Split each Claude review into an analysis job and a publish job
  (ADR-0020's shape, as chairlift has):** removes the write token from the
  model's job but keeps the secret, the bumps and a second review of what the
  cross-review already reviews.
- **An organization Actions policy that blocks the action:** an owner
  setting that the bot account can neither apply nor read, like the
  [pull_request_target policy](../design/pull-request-target-policy.md), so
  core cannot test it; it covers no bketelsen repository. It can be added
  beside row B20 and is not needed for it.
- **A check in each repository's own CI instead of row B20:** 1 copy per
  repository drifts, and a repository without the copy is not checked; the
  organization gate and the sweep hold the rule once. A local guard beside
  row B20 is allowed (Decision).

## References

- Shapes: [specs/repository-baseline.md](../specs/repository-baseline.md)
  (row B20),
  [design/pull-request-target-policy.md](../design/pull-request-target-policy.md#code-guard)
  (the code guard), [design/quality-loop.md](../design/quality-loop.md)
- Builds on: [ADR-0020](0020-ai-automation-trust-boundaries.md),
  [ADR-0071](0071-hold-every-code-repository-to-one-baseline.md),
  [ADR-0077](0077-bind-ready-for-human-to-the-head-commit.md),
  [ADR-0041](0041-retire-copilot-review-apply-where-snowcat-gates-review.md)
- Related: [ADR-0083](0083-run-the-ci-gate-locally-as-make-ci.md) (the
  organization gate),
  [ADR-0088](0088-read-the-action-pin-in-workflow-tests-never-hard-code-it.md),
  [ADR-0090](0090-scope-action-pins-and-check-them-repository-wide.md)
