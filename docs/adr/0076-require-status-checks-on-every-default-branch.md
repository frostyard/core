# 0076 — Require status checks on every default branch

- **Status:** Accepted
- **Date:** 2026-11-09
- **Amends in part:** [ADR-0071](0071-hold-every-code-repository-to-one-baseline.md)
  (new item 18, row B18)

## Context

GitHub merges a pull request with red or missing CI when no ruleset on its
base branch requires a status check. A green list of pull requests then
says nothing about the acceptance gate.
[core#218](https://github.com/frostyard/core/issues/218) replayed the pull
requests that `frostyard-machines` merged from 2026-10-07 to 2026-11-06: 13
of 26 frostyard repositories had no required status check, and 75 pull
requests failed a merge lane only on that rule.

A read-only survey of the live rules on 2026-11-09 found 37 active
repositories in 3 groups:

- **Required checks, strict, merge queue (5):** core, updex, std, clix and
  firn carry the settings contract of
  [ADR-0040](0040-publish-the-repository-settings-contract.md) and the
  merge queue of [ADR-0042](0042-adopt-a-merge-queue-on-the-default-branch.md).
- **Required checks, not strict, no queue (13):** nsl, frostmail,
  frostnotes, frostread, lodge, porter, bootc-debian, frostyard-org, and
  the bketelsen repositories fleet, trimlights, pi-pocket-team,
  pi-pocket-dune and agentic-template. Each ruleset that requires checks
  was made by hand in the repository.
- **No required status check (19):** apt-publisher, chairlift,
  flatpak-index, homebrew-tap, hotedge, igloo, incus, intuneme, lab,
  Logomenu, omarchy-apps, pilothouse, problem-intake, repogen, snosi,
  snowkit, testsuite, and bketelsen/pi-pocket and bketelsen/truenas-mcp.

The organization ruleset `frostyard` requires a pull request and blocks
deletion and force pushes on every frostyard default branch, but it names
no status check: check names differ in each repository. hotedge, Logomenu
and bketelsen/pi-pocket are forks with no CI job on pull requests.
frostyard/caddyscope and frostyard/frostyard-ai have no owner and no recent
pushes. bketelsen/homewiki takes commits straight to `main`.

Facts about status checks in rulesets:

- A required check whose workflow has a `paths` or `paths-ignore` filter
  stays pending forever on a pull request that the filter skips. A job that
  an `if:` skips reports success.
- Dependabot pull requests get no repository secrets, only `GITHUB_TOKEN`.
- A ruleset requires a check by its check-run name (the job name, for
  example `Verify (make verify)`), not by the workflow name. With an
  integration id, only that app can report it.
- A merge queue needs a repository that an organization owns, and a
  required check must also run on `merge_group` there.

The ADR-0040 contract also sets tag rulesets, merge settings, security
settings and labels. Only enrolled repositories were checked against it.

## Decision

- **Every default branch has required status checks that cover its
  acceptance gate.** This applies to each frostyard code repository
  (ADR-0071) and to the bketelsen repositories that the frostyard agents
  keep (fleet, trimlights, truenas-mcp, pi-pocket-team, pi-pocket-dune,
  agentic-template), except the exemptions below.
- **The repository owner picks the names.** Each required name:
  - **N1:** comes from a job that runs on every `pull_request` to the
    default branch. Its workflow has no `paths` or `paths-ignore` filter,
    and the job has no `if:` that can skip it.
  - **N2:** passes on a Dependabot pull request: the job reads no secret
    other than `GITHUB_TOKEN`. For an existing job, it passed at the head of
    the last merged pull request and of the last Dependabot pull request of
    the last 30 days (if there is one). For a new or changed job, it passed
    at the head of the pull request that adds or changes it, and
    `git grep -n 'secrets\.' <workflow>` shows no secret in the job other
    than `GITHUB_TOKEN`.
  - **N3:** in a repository with a merge queue, the workflow of each
    required job also triggers on `merge_group`.
  - **N4:** is the check-run name that `gh pr checks <n>` shows, not the
    workflow name.
  - **N5:** together, the names cover the acceptance gate: every job of the
    CI entry workflow of item 12 of ADR-0071 (the jobs that run `make ci`
    or its parts,
    [ADR-0073](0073-let-ci-run-the-make-ci-targets-as-separate-jobs.md)),
    or 1 aggregate job that `needs:` all of them, runs with `if: always()`,
    and fails when any of them failed, was cancelled or was skipped. A title
    check or a lint job alone does not meet N5.
- **1 ruleset carries the names.** `scripts/apply-triage-settings.sh`
  manages the repository ruleset `frostyard: required checks` and no other
  ruleset: target the default branch (`~DEFAULT_BRANCH`), enforcement
  `active`, no bypass actors, 1 `required_status_checks` rule. A name from
  GitHub Actions gets integration id 15368; a name that another app reports
  gets none. The script runs as a dry run by default; an organization admin
  runs it with `--apply`. The script also creates the review-level labels
  that the pull-request triage uses.
- **Checks are not strict, and no queue is added**, except in the
  repositories that run the ADR-0042 merge queue: core, updex, std, clix,
  firn and repogen. There, the checks are strict and the ruleset also has
  the `merge_queue` rule with the parameters of ADR-0042
  (`--merge-queue`); the script refuses a repository that an organization
  does not own, and a required name whose workflow has no `merge_group`
  trigger.
- **Repositories outside the ADR-0040 enrolment get required checks
  through this script, not through the whole settings contract.** Existing
  hand-made rulesets stay. GitHub requires each name of each ruleset that
  applies, so the names add up; an existing name that fails N1 to N5 is
  removed by hand from its ruleset.
- **Item 18 of the baseline: required status checks.** The default branch
  has at least 1 required status check. This ADR amends ADR-0071 in part:
  the [repository baseline spec](../specs/repository-baseline.md) gains row
  B18, which counts the check entries that apply to the default branch:
  `gh api repos/{r}/rules/branches/{default} --jq
  '[.[]|select(.type=="required_status_checks")|.parameters.required_status_checks[]]|length'`
  is more than 0. The weekly conformance sweep files a gap as a `sweep`
  issue. N1 to N5 stay the owner's duty; the row checks presence only.
- **Outside the baseline, `node scripts/required-checks-survey.mjs`
  guards the rule.** The baseline covers frostyard code repositories that
  are not forks and exempts incus from every row. For the 6 bketelsen
  repositories and incus, the survey (read only: default branch, required
  names, strict, queue, workflows with `merge_group`, the triage caller, and
  the level labels) runs every 30 days, and a gap goes to the owner.
- **Exemptions:**
  - hotedge, Logomenu (GNOME Shell extension forks) and bketelsen/pi-pocket
    (a fork that tracks its upstream): no CI job on pull requests, and 2, 3
    and 3 merged pull requests. They get no CI job written only to be
    required.
  - frostyard/caddyscope and frostyard/frostyard-ai: no owner, inactive.
  - bketelsen/homewiki: commits go straight to `main`; there are no pull
    requests to gate.

## Consequences

- Easier: a merge is blocked while a required check is red or missing, so
  "CI green" on a pull request means that its acceptance gate passed. A
  later automated step can rely on the required names that the rules API
  returns.
- Harder: a workflow with a path filter cannot be required. A repository
  that wants an image build or another filtered job to gate merges needs an
  aggregate job that always runs; that is a later change in that
  repository.
- Harder: a renamed or removed job blocks every pull request until the
  ruleset changes. Item 12 of ADR-0071 already requires the ruleset change
  at the same time as the rename.
- Harder: a required job that needs a secret blocks Dependabot pull
  requests (N2). The owner skips such a job for `dependabot[bot]` and
  requires the rest, or does not require it.
- In repositories with hand-made rulesets, 2 rulesets name required checks.
  The survey shows the names from both.
- Only an organization admin can apply the ruleset; the bot account
  makes dry runs only.
- bketelsen repositories are user-owned: they cannot have a merge queue,
  and the baseline sweep does not read them.

## Alternatives considered

- **Apply the whole ADR-0040 settings contract to every repository:**
  it also changes tag rulesets, merge settings, security settings and
  labels that most of these repositories were never checked against, and
  makes checks strict with a merge queue.
- **An organization ruleset that requires checks:** check names differ in
  each repository, and a name that a repository does not produce blocks
  every pull request there.
- **A merge queue in every repository:** each pull request runs CI a
  second time. In repositories with long image builds and boot tests, the
  queued run holds those jobs too. The merge click is the same without
  the queue, because checks that are not strict need no branch update.
- **Require 1 check, such as a lint or title check:** it does not prove
  that the gate passed (N5).

## References

- Shapes: [spec: repository baseline](../specs/repository-baseline.md)
  (row B18), [scripts/apply-triage-settings.sh](../../scripts/apply-triage-settings.sh),
  [scripts/required-checks-survey.mjs](../../scripts/required-checks-survey.mjs),
  [design: quality loop](../design/quality-loop.md)
- Builds on: [ADR-0071](0071-hold-every-code-repository-to-one-baseline.md),
  [ADR-0040](0040-publish-the-repository-settings-contract.md),
  [ADR-0042](0042-adopt-a-merge-queue-on-the-default-branch.md),
  [ADR-0073](0073-let-ci-run-the-make-ci-targets-as-separate-jobs.md),
  [ADR-0019](0019-governance-as-code-and-risk-tiers.md)
- Survey: [core#218 — merge-lane: feasibility replay](https://github.com/frostyard/core/issues/218)
- Merge loop background: [Airlock: merge loop](https://airlock.lunareng.com/docs/merge-loop.md)
