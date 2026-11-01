# 0064 — Retire Snowcat

- **Status:** Accepted
- **Date:** 2026-11-01

## Context

Snowcat is the coordination service that imported core's organization
authority as a snapshot, enrolled repositories, and ran queued agent work
against them ([design/organization-authority.md](../design/organization-authority.md)).
`frostyard/snowcat` and its operator UI `frostyard/snowcat-cockpit` are
archived on GitHub; snowcat's last push is 2026-10-17. No host runs the
service.

Core still treats both repositories as live:

- `organization/repositories/frostyard/snowcat.json` and
  `snowcat-cockpit.json` declare `fleet_state: "enabled"`, so
  `npm run check:fleet` keeps fetching them.
- `.github/skills-sync.json` lists both as skills-sync consumers
  ([ADR-0026](0026-distribute-core-skills-via-sync-prs.md)). An archived
  repository refuses every push, so every sync run that has a change for
  them gets a refused push there.
- The `frostyard-onboard-repo` and `frostyard-plan-project` skills describe
  Snowcat enrollment, the Snowcat queue, and Snowcat issue import as the
  current procedure.

## Decision

- Snowcat is retired. Frostyard runs no Snowcat service and enrolls no
  repository in one.
- The `snowcat` and `snowcat-cockpit` declarations are kept and set to
  `fleet_state: "disabled"`, per the retention rule of the
  [enrollment spec](../specs/organization-repository-enrollment.md#rules).
  Their other fields are unchanged.
- Both repositories leave `.github/skills-sync.json`. The managed skill
  directories already in them stay as archived history.
- No service imports the organization authority tree. The tree stays the
  reviewed record of which repositories the fleet maintains, and the
  validators, `npm run check:fleet`, and `scripts/apply-repo-settings.sh`
  keep reading it.

## Consequences

- `check:fleet` no longer fetches the two archived repositories, and the
  skills sync no longer attempts a push that must fail.
- The skills sync's last pull request in snowcat-cockpit (#55) stays open:
  an archived repository accepts no close. The reserved
  `chore/sync-core-skills` branch stays with it.
- Accepted ADRs and completed plans that name Snowcat as the importer, the
  queue, or the review gate remain as history
  ([ADR-0041](0041-retire-copilot-review-apply-where-snowcat-gates-review.md)
  through [ADR-0044](0044-expose-the-make-gate-triad-in-every-repository.md),
  [Plan 0005](../plans/0005-organization-authority-rollout.md)). Their
  repository-side decisions (no `copilot-review-apply`, merge queue, mise
  pins, the make gate triad) still bind; only the Snowcat runtime behind them
  is gone. In particular, Snowcat's bounded review gate no longer holds
  worker pull requests as drafts.
- The `frostyard-onboard-repo` and `frostyard-plan-project` skills, and their
  lines in core's `AGENTS.md` skill index, describe a retired system until a
  later change rewrites or retires them.
- The settings contract still requires the `snowcat` label
  (`organization/contracts/repository-settings/v1.json`). The label is
  inert; removing it needs a new contract version.
- Re-enabling Snowcat is a new ADR plus an `enabled` declaration change, not
  a revert of this one.

## Alternatives considered

- **Delete the two declarations:** the enrollment spec requires a
  declaration that appeared in an imported revision to be retained as
  `disabled`.
- **Keep the declarations `enabled` and only drop the skills-sync entries:**
  an `enabled` declaration authorizes work and is fetched by `check:fleet`;
  it would state as current a repository that cannot change.

## References

- Shapes: [design/organization-authority.md](../design/organization-authority.md),
  [design/skills-sync-operations.md](../design/skills-sync-operations.md),
  [specs/organization-repository-enrollment.md](../specs/organization-repository-enrollment.md)
- Builds on: [ADR-0026](0026-distribute-core-skills-via-sync-prs.md),
  [ADR-0035](0035-author-organization-authority-as-strict-json.md),
  [ADR-0041](0041-retire-copilot-review-apply-where-snowcat-gates-review.md)
