# pull_request_target event policy: settings runbook

Living document. Rationale:
[ADR-0068](../adr/0068-label-pull-requests-that-touch-high-risk-paths.md)
(the caller runs on `pull_request_target`),
[ADR-0077](../adr/0077-bind-ready-for-human-to-the-head-commit.md)
(readiness),
[ADR-0078](../adr/0078-sort-pull-requests-by-levels-l1-to-l4.md)
(levels),
[ADR-0020](../adr/0020-ai-automation-trust-boundaries.md)
(no pull request code in a privileged job),
[ADR-0021](../adr/0021-sha-pinned-actions-and-least-privilege-ci.md)
(SHA pins, least privilege).
Contracts: [PR triage](../specs/pr-triage.md),
[risk paths](../specs/risk-paths.md).

## Overview

From 2026-12-02, GitHub blocks every workflow run that the
`pull_request_target` event starts in a public repository, unless an
applicable Actions event policy allows the event
([default policy](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target#default-policy-for-pull_request_target),
[changelog 2026-11-02](https://github.blog/changelog/2026-11-02-pull_request_target-blocked-by-default-december-2)).
Private and internal repositories are not affected.

The PR triage caller of each repository runs only on `pull_request_target`
(ADR-0068, [PR triage spec](../specs/pr-triage.md)). A blocked caller run
has no job: no level label, no `risk:high`, and no removal of
`ready-for-human` after a push. Merges are not blocked, because the caller is
not a required check. The guard of ADR-0077 then stops without a signal.

This runbook keeps the caller running and keeps the default block for every
other workflow. The bot account cannot change Actions policies, so an owner
does each step:

1. The organization frostyard: 1 organization policy that allows
   `pull_request_target` only for the 2 caller paths.
2. The account bketelsen: 1 repository policy in each public repository with
   a caller (5 repositories). A personal account has no organization
   policies.
3. A test on 1 public repository: the caller runs, and an unrelated
   `pull_request_target` workflow stays blocked.

```text
pull_request_target event
  ├── workflow .github/workflows/risk-paths.yml or risk-paths-caller.yml
  │     └── the policy of this runbook allows the event ──► PR triage runs
  └── any other workflow
        └── no policy allows the event ──► the default policy blocks the run
```

## Design

### How the policy works

These facts come from the GitHub docs
([about Actions policies](https://docs.github.com/en/actions/concepts/about-actions-policies),
[governing execution](https://docs.github.com/en/actions/how-tos/administer/control-workflow-execution),
[REST API](https://docs.github.com/en/rest/actions/policies)), read on
2026-11-09:

- An Actions policy is at the enterprise, organization or repository level.
  Its UI is Settings > Actions > Policies, separate from Settings > Actions >
  General.
- A policy has a target (repositories, and optionally workflow file paths),
  an enforcement status, and rules. The 2 rule types are actor rules (who can
  start a run) and event rules (which events can start a run).
- An event rule is an allowlist. For each targeted workflow, only the listed
  events can start a run.
- Workflow file targeting (workflow path include and exclude, globs allowed)
  scopes a policy to some workflow files. The GitHub changelog names it as the
  way to allow specific workflows.
- Enforcement status Evaluate is for GitHub Enterprise Cloud only.
  Frostyard is on the Team plan and bketelsen is a personal account, so both
  use Active.
- The UI names in the steps below come from the GitHub docs. A label on the
  page can differ a little; the values do not change.
- An actor rule with no `dependabot[bot]` entry stops the workflows that
  Dependabot starts. This runbook uses no actor rule.

What the brownout of 2026-11-09 (16:00 to 18:00 UTC) showed: the default
policy blocked the caller runs. Each blocked run has the conclusion
`startup_failure`, 0 jobs and 0 check runs, and names the caller path, for
example `.github/workflows/risk-paths-caller.yml` in
[frostyard/core run 42660432264](https://github.com/frostyard/core/actions/runs/42660432264).
The policy decision is on the run of the caller file. The reusable workflow
`pr-triage.yml` is a job of that run (`jobs.pr-triage.uses`), not a run of
its own. So a policy that targets the caller path covers the pinned
reusable workflow too. The test below confirms this. If a caller run is
still blocked, read both names in its error (the event and the workflow
file). Only when the error names the event `workflow_call` and a caller
path, add `workflow_call` to the allowed events of the same policy. For any
other event or workflow file, do not change the policy: stop and report
(step 3).

Two caller paths exist: `.github/workflows/risk-paths.yml` in 32
repositories, and `.github/workflows/risk-paths-caller.yml` in
frostyard/core and frostyard/problem-intake. Both go in the policy.

### Step 1: the organization policy (frostyard)

Web UI, as an organization owner:

1. GitHub > frostyard (organization) > Settings > Actions > Policies > New
   policy.
2. Name: `frostyard: allow pull_request_target for the PR triage caller`.
3. Enforcement status: Active.
4. Target repositories: All repositories.
5. Target workflows: include `.github/workflows/risk-paths.yml` and
   `.github/workflows/risk-paths-caller.yml`. Exclude: none.
6. Restrict actors: off (no actor rule).
7. Restrict events: on. Allowed events: `pull_request_target` only.
8. Require lockfile: off.
9. Create.

All repositories is correct here: the policy changes only the 2 caller
paths, and a new repository that adds the caller is covered at once. The
event rule also stops any other event for these 2 files; the caller has no
other trigger.

### Step 2: the repository policies (bketelsen)

Web UI, as the account owner, in each repository of this list:
bketelsen/agentic-template, bketelsen/pi-pocket-dune,
bketelsen/pi-pocket-team, bketelsen/trimlights, bketelsen/truenas-mcp.

1. GitHub > bketelsen/*repo* > Settings > Actions > Policies > New policy.
2. Name: `allow pull_request_target for the PR triage caller`.
3. Enforcement status: Active.
4. Target workflows: include `.github/workflows/risk-paths.yml`. Exclude:
   none.
5. Restrict actors: off. Restrict events: on, allowed events:
   `pull_request_target` only. Require lockfile: off.
6. Create.

bketelsen/fleet is private and needs no policy. A new public bketelsen
repository that starts from bketelsen/agentic-template has the caller, and
needs this step when it is created.

### Step 3: the test on frostyard/homebrew-tap

frostyard/homebrew-tap is public and has 2 `pull_request_target` workflows:
the caller (`risk-paths.yml`, workflow `PR triage`) and `publish.yml`
(workflow `brew pr-pull`, type `labeled`). 1 label event starts both, so 1
action shows the allow and the block.

When: the default policy is enforced only in the brownout of 2026-11-16,
16:00 to 18:00 UTC, and from 2026-12-02. At other times it evaluates only,
and every run continues. Then only Policy insights shows the result (check
5).

1. **Bot pull request.** An agent opens a small docs pull request in
   frostyard/homebrew-tap. Expected: GitHub > frostyard/homebrew-tap >
   Actions > PR triage shows a run with the conclusion success; the pull
   request has the check `pr-triage / pr-triage` and a label `level:L1` to
   `level:L4`.
2. **Label.** When CI at the head is green, add `ready-for-human`. Expected:
   a PR triage run with success, and the label stays. In the same minute,
   Actions > brew pr-pull shows a run with the conclusion "Startup failure"
   and no job (during enforcement). This is the unrelated workflow, blocked.
3. **Push revocation.** The agent pushes 1 commit to the pull request.
   Expected: a PR triage run with success; `ready-for-human` comes off, with
   a comment that says the label came off because the head moved.
4. **Dependabot pull request.** On an open Dependabot pull request (or after
   a comment `@dependabot recreate`), expected: a PR triage run with success
   and a level label.
5. **Policy insights.** GitHub > frostyard > Settings > Actions > Policies >
   Policy insights. Expected: no PR triage run of frostyard/homebrew-tap
   after step 1 is in the list of blocked (or "would be blocked") runs; the
   `brew pr-pull` runs are in it.

If check 2 shows a `brew pr-pull` run that is not blocked during
enforcement, the policy of step 1 has taken the default policy off the whole
repository, not only off the 2 files. Then add a second organization policy:
name `frostyard: block pull_request_target outside the PR triage caller`,
Active, All repositories, target workflows include all and exclude the 2
caller paths, Restrict events on with every event of the list except
`pull_request_target`. Run the test again.

If a PR triage run is blocked, stop. Put the run link and its error text in
an issue in frostyard/core; nothing is retried as the bot.

### Inventory of pull_request_target workflows

Read on 2026-11-09 from the default branch of each non-archived repository
of frostyard and bketelsen (331 repositories).

| Repository | Workflow | Owner | Call | Reason |
| --- | --- | --- | --- | --- |
| frostyard: bootc-debian, clix, flatpak-index, homebrew-tap, incus, omarchy-apps, repogen, std, updex | `risk-paths.yml` | Lucilla | keep: step 1 | PR triage caller (ADR-0068) |
| frostyard/core | `risk-paths-caller.yml` | Lucilla | keep: step 1 | PR triage caller, local path |
| frostyard: firn, lab, snosi, testsuite | `risk-paths.yml` | Murbella | keep: step 1 | PR triage caller |
| frostyard/problem-intake | `risk-paths-caller.yml` | Murbella | keep: step 1 | PR triage caller |
| frostyard: chairlift, igloo, intuneme, nsl, pilothouse, snowkit | `risk-paths.yml` | Duncan | keep: step 1 | PR triage caller |
| frostyard: frostmail, frostnotes, frostread, lodge, porter | `risk-paths.yml` | Irulan | keep: step 1 | PR triage caller |
| frostyard/frostyard-org | `risk-paths.yml` | Tamalane | keep: step 1 | PR triage caller |
| bketelsen: agentic-template (Lucilla), pi-pocket-dune, pi-pocket-team (Sheeana), trimlights (Irulan), truenas-mcp (Moneo) | `risk-paths.yml` | as named | keep: step 2 | PR triage caller |
| frostyard/apt-publisher, bketelsen/fleet | `risk-paths.yml` | Lucilla, Teg | keep: no step | private: the default policy does not apply |
| frostyard/updex | `claude-code-review.yml` | Lucilla | move to `pull_request`, after the test | it only requests a Copilot review with `pull-requests: write`; frostyard/lab and frostyard/pilothouse run their review workflow on `pull_request` and skip fork pull requests; until it moves, each pull request event makes 1 blocked run with no check run |
| frostyard/homebrew-tap | `publish.yml` | Lucilla | move to `pull_request`, after the test | every pull request head is a branch of the tap, and the job has never run (51 runs, all skipped); a fork pull request then gets a read-only token and cannot push |
| bketelsen forks: bluefin-1 (`cherry-pick-to-stable.yml`), dakota (`pr-triage.yml`), hive (`ai-fix.yml`, `copilot-automation.yml`, `greetings.yml`, `pr-verifier.yml`), incus (`triage.yml`), openchamber (`label-merge-conflict.yml`, `pr-review.yml`) | upstream workflows | bketelsen (account owner) | leave blocked | forks with 0 `pull_request_target` runs; no policy |

Not a trigger: frostyard/core `pr-triage.yml` (`workflow_call` only) and
frostyard/snosi `validate.yml` (the word is in a comment).

### Hardening of the caller and pr-triage

The default policy exists because a privileged job that runs pull request
code is the main attack. Checked on 2026-11-09 against the GitHub hardening
list, at core `781c8b1` and on each caller:

| Point | Result |
| --- | --- |
| No checkout of pull request code | Pass. No caller and no pr-triage step checks out code. The job writes its scripts from the workflow file, reads the list at `pull_request.base.sha` through the contents API, and the changed files through the pulls API. |
| Pull request text is data | Pass. No `run:` step expands a title, a branch name or a path with `${{ }}`. The scripts read the event from `GITHUB_EVENT_PATH`; `if:` expressions use only the action, the label name and the author login. |
| Readiness uses the head and rejects pending checks | Pass. On `synchronize` with the label, the label comes off. On `labeled`, the step reads the check runs and statuses at `pull_request.head.sha`; a check that is queued, in progress or pending, or that is not success, neutral or skipped, takes the label off. |
| Readiness and missing checks | Known gap, by the spec: a head with 0 check runs and 0 statuses keeps the label, and HTTP 403 (private repositories) gives "unknown". A missing required check still blocks the merge through the required-checks ruleset (ADR-0076). A blocked run (`startup_failure`) makes no check run, so readiness cannot see it. |
| Least-privilege token | Pass. Each caller has `permissions: {}` at the top and `contents: read`, `pull-requests: write` on the job. The job uses no secret except `github.token` and saves no cache. frostyard/updex has 1 more job in the caller, `actions/labeler` at a SHA pin, with the same permissions. |
| Caller and core pin protected | Pass. Every caller pins `frostyard/core/.github/workflows/pr-triage.yml` to a 40-character SHA (core uses the local path). The caller path is at L1 in 9 repositories and at L2 in the others, through the org floor `.github/workflows/**`; both levels add `risk:high`. In core, `pr-triage.yml` and its 2 libraries are at L2. |

With this policy, the 2 caller paths are the only files that can run on
`pull_request_target`. A pull request that changes a caller gets `risk:high`
(L1 or L2), and under `pull_request_target` the caller of the base branch
runs, not the caller of the pull request.

### The API (extra)

The same steps as `gh` commands. They need an owner's token with the scope
`admin:org` (organization) or admin access to the repository; the bot
cannot run them.

```sh
# Step 1, organization policy
gh api -X POST orgs/frostyard/actions/policies \
  -H "X-GitHub-Api-Version: 2026-03-10" --input - <<'EOF'
{
  "name": "frostyard: allow pull_request_target for the PR triage caller",
  "enforcement": "active",
  "conditions": {
    "repository_name": { "include": ["~ALL"], "exclude": [] },
    "workflow_path": {
      "include": [".github/workflows/risk-paths.yml", ".github/workflows/risk-paths-caller.yml"],
      "exclude": []
    }
  },
  "rules": [
    { "type": "restrict_action_events", "parameters": { "allowed_events": ["pull_request_target"] } }
  ]
}
EOF

# Step 2, for each of the 5 bketelsen repositories
for repo in agentic-template pi-pocket-dune pi-pocket-team trimlights truenas-mcp; do
  gh api -X POST "repos/bketelsen/$repo/actions/policies" \
    -H "X-GitHub-Api-Version: 2026-03-10" --input - <<'EOF'
{
  "name": "allow pull_request_target for the PR triage caller",
  "enforcement": "active",
  "conditions": {
    "workflow_path": { "include": [".github/workflows/risk-paths.yml"], "exclude": [] }
  },
  "rules": [
    { "type": "restrict_action_events", "parameters": { "allowed_events": ["pull_request_target"] } }
  ]
}
EOF
done

# Read back: the policies that apply to 1 repository, with parent levels
gh api -H "X-GitHub-Api-Version: 2026-03-10" \
  "repos/frostyard/homebrew-tap/actions/policies?has_parents=true"
```

## Operational notes

- Do steps 1 and 2 before 2026-11-16 16:00 UTC: the brownout then is the
  last live test before enforcement on 2026-12-02.
- During a brownout, and from 2026-12-02 without a policy, pull requests
  that change in the window get no level label, and a push does not take
  `ready-for-human` off. After the policy exists, a push or a label change
  on the pull request starts the caller again.
- A new caller path (a renamed file) is blocked until it is in the policy.
  Keep the file names `risk-paths.yml` (and `risk-paths-caller.yml` in core
  and problem-intake), or change the policy in the same change.
- A new `pull_request_target` workflow outside the 2 paths stays blocked.
  That is the intended state; move it to `pull_request`, or give it its own
  policy with the same review as this one.
- Policy changes are owner settings, as are rulesets
  ([PR triage rollout](pr-triage-rollout.md)).

## References

- Rationale: [ADR-0068](../adr/0068-label-pull-requests-that-touch-high-risk-paths.md),
  [ADR-0077](../adr/0077-bind-ready-for-human-to-the-head-commit.md),
  [ADR-0078](../adr/0078-sort-pull-requests-by-levels-l1-to-l4.md),
  [ADR-0076](../adr/0076-require-status-checks-on-every-default-branch.md),
  [ADR-0020](../adr/0020-ai-automation-trust-boundaries.md),
  [ADR-0021](../adr/0021-sha-pinned-actions-and-least-privilege-ci.md)
- Contracts: [specs/pr-triage.md](../specs/pr-triage.md),
  [specs/risk-paths.md](../specs/risk-paths.md)
- GitHub: [securely using pull_request_target](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target),
  [governing execution of workflows](https://docs.github.com/en/actions/how-tos/administer/control-workflow-execution),
  [REST API for Actions policies](https://docs.github.com/en/rest/actions/policies),
  [changelog 2026-09-17](https://github.blog/changelog/2026-09-17-workflow-execution-protections-in-github-actions-generally-available)
- Context: [design: PR triage rollout](pr-triage-rollout.md),
  [design: quality loop](quality-loop.md)
