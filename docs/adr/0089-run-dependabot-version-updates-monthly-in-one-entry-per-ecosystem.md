# 0089 — Run Dependabot version updates monthly, in 1 entry for each ecosystem

- **Status:** Accepted
- **Date:** 2026-11-21
- **Amends in part:** [ADR-0071](0071-hold-every-code-repository-to-one-baseline.md)
  (item 13, Dependabot)
- **Amends in part:** [ADR-0075](0075-batch-routine-pull-requests.md)
  (the Dependabot bullet of its decision)

## Context

[ADR-0075](0075-batch-routine-pull-requests.md) gives each `updates` entry
in `.github/dependabot.yml` exactly 1 group with `patterns: ["*"]`, so each
entry opens at most 1 version-update pull request for each run. On
2026-11-21, 33 of the 36 non-archived frostyard repositories have a
`.github/dependabot.yml` (`gh repo list frostyard --no-archived`, then
`gh api repos/frostyard/<repo>/contents/.github/dependabot.yml`; caddyscope,
hotedge and Logomenu have none). Their 76 entries all have
`interval: weekly`. bketelsen/agentic-template, the template for new
repositories, has 1 entry with `interval: weekly`.

From 2026-11-17 to 2026-11-20 (UTC, by creation date), Dependabot opened 46
pull requests in 27 frostyard repositories and 7 in bketelsen repositories
(GitHub search `org:frostyard is:pr author:app/dependabot
created:2026-11-17..2026-11-20`, and the same with `user:bketelsen`). Each
one takes a cross-review and an owner merge.

An entry covers its `directory`, or each directory of its `directories`
list. 4 repositories have 2 or more entries for 1 ecosystem in different
directories: firn (`gomod` in `/` and `/gui`), hearth (`gomod` in `/` and
`/examples/notes-lite`), lab (`npm` in `/` and `/site`) and lodge (`gomod`
in `/` and `/kit`; `npm` in `/dev/mcp-e2e`, `/client`, `/ui` and `/shell`).
Each of those entries opens its own pull request. An entry with a
`directories` list and 1 catch-all group opens 1 pull request for all its
directories: bketelsen/fleet#124, "bump the opentofu group across 2
directories with 1 update", changed `tofu/minideb` and `tofu/selfie` from 1
entry. pilothouse (`docker`), pocketgo (`gomod`) and repogen
(`github-actions`) already use `directories`.

GitHub's
[Dependabot options reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#schedule-)
states:

- `interval: monthly` runs on the first day of each month. `day` applies
  only to `interval: weekly`. Another day of the month needs
  `interval: cron` with a `cronjob` expression.
- With no `time`, Dependabot picks a random time for all the updates of 1
  configuration file.
- `cooldown` applies to version updates only. With no `cooldown`, a new
  version waits 3 days before a version update takes it.
- A group without `applies-to` applies to version updates only.

Security updates are a repository setting, not a `dependabot.yml` schedule:
Dependabot opens one when a Dependabot alert opens for a dependency with a
fixed version. The repository-settings contract
([ADR-0040](0040-publish-the-repository-settings-contract.md),
`organization/contracts/repository-settings/v1.json`) requires
`dependabot_security_updates: true`.

## Decision

- **Version updates run monthly.** The `schedule` of each `updates` entry
  holds only `interval: monthly`: no `day`, no `time`, no `timezone` and no
  `cronjob`. GitHub runs it on the 1st of each month, at a time it picks for
  each file, so the organization's runs spread over that day.
- **1 entry for each ecosystem.** Each `package-ecosystem` value appears in
  exactly 1 entry. An ecosystem with manifests in several directories lists
  them in that entry's `directories` (globs allowed), not in a second
  entry. With ADR-0075's 1 catch-all group, each ecosystem opens at most 1
  version-update pull request a month, for all its directories. The
  entry's group has no `group-by`.
- **Other settings stay with the repository.** `commit-message`,
  `open-pull-requests-limit`, `labels`, `ignore`, `allow`, `exclude-paths`
  and `cooldown` stay as each repository sets them; an `ignore` or `allow`
  of a merged entry applies to all its directories. Core requires no
  `cooldown`.
- **Security updates stay on and immediate.** The schedule does not apply
  to them. The group keeps no `applies-to: security-updates` (ADR-0075), so
  each security update stays 1 pull request, and the repository setting
  `dependabot_security_updates` stays `true` (ADR-0040).
- **Row B13 checks it.** The baseline row adds the schedule, the 1-entry
  rule and the absence of `group-by`, and `entryGaps` in core's
  `test/repository-baseline.test.mjs` holds core's own file to them.

ADR-0071 item 13 ("1 entry for `github-actions` and 1 entry for each other
Dependabot ecosystem with a manifest") stays and is now exact: 1 entry, not
1 or more. ADR-0075's Dependabot bullet stays: 1 group with
`patterns: ["*"]` for each entry, no second group, no
`applies-to: security-updates`. Its consequence "each Dependabot entry makes
at most 1 version-update pull request for each run" stays; a run is now
monthly. No other statement of ADR-0071 or ADR-0075 changes.

## Consequences

- Easier: each ecosystem of a repository opens at most 1 version-update
  pull request a month. The 76 weekly entries of 2026-11-21 become at most
  69 monthly entries (firn, hearth and lab lose 1 entry each, lodge 4).
- Easier: version-update pull requests arrive on 1 known day, so owners
  review and merge them in 1 batch; level labels
  ([ADR-0078](0078-sort-pull-requests-by-levels-l1-to-l4.md)) sort the
  batch.
- Harder: a version update waits up to 1 month. A fix that is not a
  security advisory (a bug fix in a dependency) needs a manual update or a
  manual Dependabot run (the repository's Insights → Dependency graph →
  Dependabot → "Check for updates").
- Harder: each grouped pull request holds up to 1 month of updates, for all
  directories of the ecosystem, so ADR-0075's "a grouped pull request fails
  as a whole when 1 update breaks it" happens more often. The owner adds an
  `ignore` entry or splits the update by hand.
- Harder: all version-update pull requests of the organization open on the
  1st of the month, which can fall on a weekend; cross-reviews take them
  over the following days.
- Harder: a repository that needs an `ignore` for 1 directory only gives
  it to all directories of the entry. A repository whose own accepted ADR
  needs a second entry is a "conflict" finding of the sweep
  ([spec](../specs/repository-baseline.md)).
- Newly required: each repository with a `dependabot.yml` changes its
  intervals and merges its multi-directory entries; the weekly sweep files
  the gap under row B13. A repository-local check of `dependabot.yml`
  (lodge's `internal/workflowcheck`) changes with it.
- The Dependabot shadow's 14-day window
  ([design](../design/dependabot-shadow.md)) holds at most 1 monthly run, so
  it reaches 10 calls more slowly.

## Alternatives considered

- **`interval: cron` with a day for each repository:** spreads the
  organization's pull requests over the month, but needs a table of days
  that every new repository joins and a check that parses cron
  expressions. Grouped monthly pull requests are few enough for 1 day.
- **`interval: monthly` with 1 fixed `time` for every repository:** opens
  every pull request of the organization at the same minute; GitHub's
  random time for each file spreads them with no setting.
- **A `multi-ecosystem-groups` group for each repository:** 1 pull request
  a month for all ecosystems, but 1 broken update blocks every ecosystem,
  and the group carries its own schedule and settings.
- **`interval: weekly` with a longer `cooldown`:** delays each version but
  keeps 1 pull request a week for each entry that has a version past its
  cooldown.
- **Fewer ecosystems (drop `github-actions` updates):** leaves SHA-pinned
  actions ([ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md))
  without updates.

## References

- Shapes: [spec: repository baseline](../specs/repository-baseline.md)
  (row B13), [.github/dependabot.yml](../../.github/dependabot.yml),
  [test/repository-baseline.test.mjs](../../test/repository-baseline.test.mjs)
- Builds on: [ADR-0071](0071-hold-every-code-repository-to-one-baseline.md),
  [ADR-0075](0075-batch-routine-pull-requests.md),
  [ADR-0040](0040-publish-the-repository-settings-contract.md)
