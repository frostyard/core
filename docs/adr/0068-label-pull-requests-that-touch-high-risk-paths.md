# 0068 — Label pull requests that touch high-risk paths

- **Status:** Accepted
- **Date:** 2026-11-04

## Context

ADR-0019 makes every PR declare a risk tier. No consumer reads the tier. Risk-tier scales differ between repositories.

Some paths carry more risk than others: boot chain, signing and keys, update verification, auth, publication, secrets and credentials, rulesets and settings, destructive operations.

Every agent acts on GitHub as 1 machine account (`frostyard-machines`). GitHub cannot distinguish agents. A GitHub approval cannot show that the owning agent reviewed a PR. An owner review is a PR comment.

Agents create no labels, rulesets or settings. The accountable owner creates them.

A workflow on `pull_request` runs the PR's own workflow file and its own copy of a path list. A PR can remove a path from the list or edit the workflow and avoid the label.

## Decision

- Each repository lists its high-risk paths in `.github/risk-paths.json`, in the format of [the risk-paths spec](../specs/risk-paths.md).
- A PR that changes, adds, removes or renames a file that matches a listed glob carries the label `risk:high`.
- A reusable workflow in core, `.github/workflows/risk-paths.yml` (`on: workflow_call`), adds the label. Each repository has a caller workflow on `pull_request_target`, pinned to a core commit SHA (ADR-0021). The job reads the list at the PR's base SHA and reads changed files from the GitHub API. It does not check out or run code from the PR head (ADR-0020).
- The workflow adds the label and never removes it. The PR author removes it, with a reason in the PR, only when the risky change leaves the PR.
- When the PR author is not the repository's owner, `ready-for-human` on a `risk:high` PR waits for the owner's review comment on the PR.
- When the author is the owner, the label is the gate: the PR body names each matched path and why the change is safe, and the accountable owner reads every `risk:high` PR before merge.
- A risk-path match puts the PR at the highest tier of the repository's risk-tier scale.
- `.github/risk-paths.json` becomes 1 more surface in `organization/contracts/repository-surfaces/v1.json`.

## Consequences

- Easier: the accountable owner finds PRs to read with `is:pr is:open label:ready-for-human label:risk:high`. The rule lives in each repository, so it applies to every PR, including Dependabot, Renovate and fork PRs, and needs no agent runtime.
- Harder or negative: the owner-review comment is policy, not a mechanical gate, for 1 GitHub login. Action-pin bumps on listed workflows get the label as noise. Each repository needs the label definition before its caller runs. A missing label fails the job. The caller is not a required check, so a failed run does not block merge.
- New obligations: the validator, matcher, reusable workflow, core's own list and caller, and the repository-surfaces entry land in a later change, with tests. The spec describes that code. The spec text and code must agree when the code lands. Pilots are core, updex and snosi. Other repositories follow after the pilots.

## Alternatives considered

- **Agent-runtime sweep:** An agent-runtime sweep sees only PRs that the runtime tracks and only while it runs. The rule stays outside the repository.
- **`pull_request` trigger:** The PR's own list and caller run, so a PR can remove its own label.
- **Mechanical owner-review gate:** GitHub cannot provide this gate while all agents use 1 login.
- **Label plus required owner review for owner-authored PRs:** A second review by the same owner adds cost and no new information.

## References

- Shapes: [spec: risk paths](../specs/risk-paths.md), [quality loop](../design/quality-loop.md)
- Builds on: [ADR-0019](0019-governance-as-code-and-risk-tiers.md), [ADR-0020](0020-ai-automation-trust-boundaries.md), [ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md), [ADR-0035](0035-author-organization-authority-as-strict-json.md)
- Related: [PR review rubric](../specs/pr-review-rubric.md)
- Amended in part by: [ADR-0078](0078-sort-pull-requests-by-levels-l1-to-l4.md)
