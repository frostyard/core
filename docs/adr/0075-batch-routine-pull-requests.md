# 0075 — Group Dependabot updates and sync skills once a day

- **Status:** Accepted
- **Date:** 2026-11-07
- **Amends in part:** [ADR-0071](0071-hold-every-code-repository-to-one-baseline.md)
  (item 13, Dependabot)
- **Amends in part:** [ADR-0026](0026-distribute-core-skills-via-sync-prs.md)
  (the sync trigger)

## Context

From 2026-10-07 to 2026-11-06 (UTC), the frostyard organization opened 1229
pull requests. Dependabot opened 215 of them. ADR-0071 item 13 requires an
entry in `.github/dependabot.yml` for each ecosystem, but no grouping, so
Dependabot opens 1 pull request for each dependency update. frostyard/lodge,
frostmail, frostnotes and porter already group: each `updates` entry has
`groups: { <name>: { patterns: ["*"] } }`. A Dependabot group without
`applies-to` applies to version updates only; security updates stay 1 pull
request each.

In the same window, `.github/workflows/sync-skills.yml` ran 17 times: 13
runs from `push` on 2 days (6 on 2026-11-01, 7 on 2026-11-06) and 4 weekly
`schedule` runs. The sync opened 25 pull requests in 10 consumer
repositories. Each run that finds a change force-pushes
`chore/sync-core-skills` in each consumer, so each push run restarts CI on
each open sync pull request. Each run makes a new commit (a new timestamp,
so a new SHA), also when the open sync pull request already holds the same
tree on the same base. `scripts/lib/skills-sync-repo.sh` already updates an
open sync pull request and does not open a second one.

[core#218](https://github.com/frostyard/core/issues/218) replayed the 585
pull requests that `frostyard-machines` merged in the same window. A faster
merge lane selects 26 of them (0.8 a day) and saves about 0.4 to 0.8 minutes
a day. The cost is the number of pull requests, not the merge time of each.

## Decision

- **Dependabot groups version updates.** Each `updates` entry in
  `.github/dependabot.yml` has a `groups` entry with 1 group whose
  `patterns` is `["*"]`, so each entry makes at most 1 version-update pull
  request for each run. The group has no `applies-to: security-updates`;
  security updates stay ungrouped. The rest of ADR-0071 item 13 stays (1
  entry for `github-actions` and 1 for each other ecosystem with a
  manifest; `site/requirements.txt` is refreshed by the hygiene line).
- **The skills sync runs once a day.** `sync-skills.yml` runs on the
  schedule `23 5 * * *` (05:23 UTC, before 07:00 America/New_York all year)
  and on `workflow_dispatch` for an urgent sync. It has no `push` trigger.
  This replaces ADR-0026's "every push to `main` touching
  `.agents/skills/**` (plus a weekly cron and manual dispatch)". The rest of
  ADR-0026 stays: the config, the marker, the review gate and the bot
  identity.
- **A run does not push a current sync branch.** When the remote
  `chore/sync-core-skills` already holds the same tree on the same parent
  (the current default-branch tip), the run does not push it. The run still
  force-pushes an open sync pull request's branch when the content or the
  base changed, and never opens a second pull request. A current branch
  with no open pull request gets a new pull request.

## Consequences

- Easier: each Dependabot entry makes at most 1 version-update pull request
  for each run, and several core skill changes on 1 day make 1 push in each
  consumer. A daily run does not restart CI on an unchanged open sync pull
  request, and does not remove its readiness label.
- Harder: a skill change reaches the consumers up to 1 day later. An urgent
  change needs a manual dispatch
  (`gh workflow run sync-skills.yml --repo frostyard/core`).
- Harder: a grouped pull request fails as a whole when 1 update breaks it.
  The owner adds an `ignore` entry for that dependency, or splits the update
  by hand.
- Baseline row B13 checks the groups; `ungroupedEntries` in core's
  `test/repository-baseline.test.mjs` holds core's own file to it, and the
  conformance sweep files the gap in other repositories.

## Alternatives considered

- **A faster merge lane:** core#218 shows a saving of less than 1 minute a
  day; the number of pull requests stays the same.
- **A weekly sync only:** a skill fix waits up to 7 days to reach the
  consumers.
- **Dependabot groups by update type (patch, minor, major):** up to 3 pull
  requests for each entry and run, and no gain for review.

## References

- Shapes: [spec: repository baseline](../specs/repository-baseline.md)
  (row B13), [design: skills sync operations](../design/skills-sync-operations.md),
  [design: shared skills](../design/shared-skills.md),
  [.github/workflows/sync-skills.yml](../../.github/workflows/sync-skills.yml),
  [scripts/lib/skills-sync-repo.sh](../../scripts/lib/skills-sync-repo.sh),
  [.github/dependabot.yml](../../.github/dependabot.yml)
- Builds on: [ADR-0071](0071-hold-every-code-repository-to-one-baseline.md),
  [ADR-0026](0026-distribute-core-skills-via-sync-prs.md)
- Replay: [core#218 — merge-lane: feasibility replay](https://github.com/frostyard/core/issues/218)
