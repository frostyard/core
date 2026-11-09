# 0078 — Sort pull requests by levels L1 to L4

- **Status:** Accepted (amends [ADR-0068](0068-label-pull-requests-that-touch-high-risk-paths.md) in part)
- **Date:** 2026-11-09

## Context

ADR-0068 gives a PR 1 binary label: `risk:high` when a changed path matches a glob in `.github/risk-paths.json`, else nothing. The accountable owner merges about 70 PRs a day across the organization (977 merges in the 14 days before 2026-11-08). A PR without `risk:high` can be a 1-line README fix or a 2000-line change to ordinary code. The label does not say how much of the diff the owner must read.

Paths differ in what a mistake costs. A change to signing keys, the boot chain or a ruleset can harm every installed system. A change to a CI workflow or to the risk list itself changes what the gates check. A change to ordinary code with tests is caught by CI and review. A change to a how-to page or test data has a small blast radius.

17 repositories vendor `scripts/lib/risk-paths.mjs` with a `sha256` pin and call `validateRiskPaths`, `matchGlob` and `parseStrictJson` in their own gates. 32 repositories call core's reusable workflow, each pinned to a core commit SHA (ADR-0021). The callers and the lists move in 1 wave, 1 PR for each repository.

Rules, agent instructions and saved queries name `risk:high`: the owner-review rule of ADR-0068, the agent rules, and the owner's query `is:pr is:open label:ready-for-human label:risk:high`.

Agents create no labels (ADR-0068). A label that does not exist in a repository cannot be added to a PR without creating it: the add-labels API creates a missing label.

The levels idea and its review effort per level come from Airlock's [levels](https://airlock.lunareng.com/docs/levels.md) and [repository policy](https://airlock.lunareng.com/docs/repo-policy.md).

## Decision

- Each PR carries 1 level label, from `level:L1` (strictest) to `level:L4`. A level is a path-based review hint for a person. It gives no agent a right to merge; ADR-0019 and ADR-0042 do not change.

  | Level | Label | The owner reads | Typical paths |
  | --- | --- | --- | --- |
  | L1 | `level:L1` | Every line. The PR body names each L1 path and why the change is safe. | Signing, keys, secrets, boot chain, publication, rulesets and settings |
  | L2 | `level:L2` | The whole diff of the matched paths | CI workflows, the risk list, policy files, release config |
  | L3 | `level:L3` | Title, body, file list and CI; a skim of the diff | Ordinary code with tests (the usual default) |
  | L4 | `level:L4` | Title and CI | How-to docs, README, test data |

- `.github/risk-paths.json` gets schema version 2: a required `default_level` and a required `level` for each glob. The [risk-paths spec](../specs/risk-paths.md) is the contract. A version 1 list stays valid and reads as each glob at L1 and a default of L3, so a repository that has not moved has at L1 every PR that has `risk:high` under ADR-0068. The floors below can add PRs at L1 or L2.
- The level of 1 file is the strictest level of its matching globs, else `default_level`, then the organization floor when the floor is stricter. The level of a PR is the strictest file level over every changed path, both names of a rename. A file list at the API limit of 3000 files gives L1. A PR with no list at its base SHA gets no level label.
- Organization floors are a constant in `scripts/lib/risk-paths.mjs`. A repository cannot change them:
  - L1 when a path word is 1 of `secret`, `secrets`, `credential`, `credentials`, `password`, `passwords`, `passwd`, `signing`, `keyring`, `keyrings`, `keys`, `gpg`, `pgp`, or when the file extension is 1 of `pem`, `key`, `p12`, `pfx`, `gpg`, `asc`.
  - L2 for `.github/workflows/**`, `.github/actions/**`, `.github/risk-paths.json`, `policies/**` and `.github/policies/**`. Every change to the list is therefore at least L2. The list is read at the base SHA, so a PR cannot lower its own level.
- The `levels` step of `pr-triage.yml` sets the label by a ratchet. It adds the computed level when the PR has no level label or a looser one, and then removes the looser level labels. It never lowers a level. Only the PR author lowers a level, by hand, with the reason in the PR.
- `risk:high` stays as the alias of L1 and L2. The step adds it when the computed level is L1 or L2 and never removes it. Every rule that names `risk:high` keeps its meaning until a later ADR retires the alias. The owner-review rule of ADR-0068 now applies to L1 and L2.
- When 1 of the 4 level labels does not exist in a repository, the step adds only `risk:high` (for L1 and L2) and writes a warning with the missing labels and the settings command. It does not fail and creates no label. A missing `risk:high` still fails the step.
- Rule C of the spec stays in the gates: in a version 2 list, each glob that matches the list file or the caller workflow has level L1 or L2.
- `validateRiskPaths`, `matchGlob`, `parseStrictJson` and `matchFiles` keep their names and their version 1 results. `LEVELS`, `levelOfFile`, `levelOfPullRequest` and `checkRequiredPaths` are new exports.

This ADR amends these statements of ADR-0068: a match puts a PR at L1 or L2 instead of 1 binary class, and `risk:high` becomes an alias of those 2 levels. The owner-review rule, the `pull_request_target` caller pinned to a core SHA, the list read at the base SHA, and "agents create no labels" stay.

## Consequences

- Easier: the owner sorts the merge list by label, merges L4 and L3 on a skim and in batches, and reads L1 line by line. A Dependabot shadow and the agent desk can read the level from a label.
- New obligations: each repository moves its list to version 2 in the owner wave, by the grading rule of the spec, and re-vendors `scripts/lib/risk-paths.mjs` with new `sha256` pins. Its own gate adds the rule C level check (`checkRequiredPaths`). The accountable owner creates the 4 level labels in each repository with core's settings script.
- Until the labels exist, PRs get only `risk:high` and a warning in the job summary. PRs opened before the labels exist get no level label until a backfill runs.
- Known noise, accepted as fail safe: tests and units with a floor word in the name go to L1, for example `test/no-private-keys-test.sh` or `frostmail-secrets-key.service`. An action-pin bump in a workflow is at least L2.
- Harder or negative: a level is a hint from paths, not from the content of the change. A risky change in a path at L3 or L4 stays at that level. A level label from a ratchet can stay stricter than the computed level after the risky file leaves the PR, until the author lowers it.
- The step reads the labels of the PR and of the repository on each run: 4 more API reads per run.

## Alternatives considered

- **Keep the binary `risk:high`:** It marks about the same PRs as L1 and L2 together and says nothing about the rest of the list, which is most of the merge load.
- **Retire `risk:high` at once:** Rules, agent instructions and saved queries name it. A rename at the same time as the new levels drops a guard where a reference is missed.
- **Levels from the content of the diff (size, an AI classifier):** A path rule is predictable, testable and set by the repository owner. A classifier adds a model to a gate.
- **Repository-defined floors:** A repository could then lower the level of its own keys or workflows. The floors guard what every repository has in common.
- **A loosening rule that compares the list at base and head:** Every change to the list is at least L2 by the floor, which is simpler and reaches the same reader.

## References

- Shapes: [spec: risk paths](../specs/risk-paths.md), [spec: PR triage](../specs/pr-triage.md), [quality loop](../design/quality-loop.md)
- Amends: [ADR-0068](0068-label-pull-requests-that-touch-high-risk-paths.md)
- Builds on: [ADR-0019](0019-governance-as-code-and-risk-tiers.md), [ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md), [ADR-0042](0042-adopt-a-merge-queue-on-the-default-branch.md), [ADR-0075](0075-batch-routine-pull-requests.md), [ADR-0077](0077-bind-ready-for-human-to-the-head-commit.md)
- Sources: [Airlock levels](https://airlock.lunareng.com/docs/levels.md), [Airlock repository policy](https://airlock.lunareng.com/docs/repo-policy.md)
