# Dev Release Concurrency Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the rolling `dev` release concurrency policy in core and
open independent chairlift and pilothouse pull requests that enforce it.

**Architecture:** Core owns the organization decision and reusable workflow
guidance. Each downstream repository owns a YAML-aware regression test and its
small workflow contract, delivered from a branch based directly on that
repository's `main` branch.

**Tech Stack:** Markdown, GitHub Actions YAML, Go, `gopkg.in/yaml.v3`, GitHub
CLI.

## Global Constraints

- Every rolling GoReleaser `dev` workflow uses the literal group
  `goreleaser-nightly` and `cancel-in-progress: true`.
- Concurrency is declared at workflow top level, not on one job.
- Downstream pull requests are independent branches based directly on each
  repository's `main`; do not stack either on the core branch or on each
  other.
- Do not change workflow triggers, permissions, action references, release
  steps, or repository-dispatch behavior.
- Classify the core pull request as Tier 1 and both downstream workflow pull
  requests as Tier 3 because they change concurrency and release workflow
  behavior.
- Use [ADR-0034](../adr/0034-cancel-stale-rolling-dev-releases.md) as the
  authoritative contract.

---

### Task 1: Publish The Core Policy And Skill Contract

**Files:**
- Modify: `.agents/skills/frostyard-go-repo/SKILL.md:68-79`
- Modify: `docs/adr/0034-cancel-stale-rolling-dev-releases.md:3`
- Modify: `docs/plans/0002-org-portfolio-roadmap.md:95-101`
- Modify: `docs/README.md:60-65`
- Create: `docs/plans/0004-dev-release-concurrency-rollout.md`

**Interfaces:**
- Consumes: ADR-0034's exact `concurrency` YAML contract.
- Produces: accepted organization policy, exact reusable skill guidance, and
  a core pull request that chairlift and pilothouse can cite.

- [ ] **Step 1: Create the core implementation branch**

The approved design commit `6edaa7c` is based directly on core's `main`.
Create the feature branch at the current commit before adding implementation
changes:

```bash
git switch -c policy/dev-release-concurrency
```

Expected: the current branch is `policy/dev-release-concurrency`, containing
`6edaa7c` and no commits from another feature branch.

- [ ] **Step 2: Make the skill contract exact**

Replace the snapshot workflow bullet in
`.agents/skills/frostyard-go-repo/SKILL.md` with:

```markdown
   - `snapshot.yml` — nightly GoReleaser `release --nightly --clean` under
     the `dev` tag after green `main` tests. Use this exact top-level block:

     ```yaml
     concurrency:
       group: goreleaser-nightly
       cancel-in-progress: true
     ```

     Concurrency groups are repository-scoped, so do not substitute the
     project name. Cancelling a stale run selects the newest tested `main`
     commit and prevents overlapping uploads to the singleton release.
```

Keep the existing pitfall warning that points back to step 3.

- [ ] **Step 3: Mark the implemented decision accepted**

In `docs/adr/0034-cancel-stale-rolling-dev-releases.md`, change only:

```markdown
- **Status:** Accepted
```

Do not rewrite the decision or remove the transient-state consequence.

- [ ] **Step 4: Move the rollout from an idea to an active phase**

In `docs/plans/0002-org-portfolio-roadmap.md`, remove the existing issue #10
bullet from `Later / ideas` and insert this phase before that section:

```markdown
## Dev release concurrency rollout

- Apply
  [ADR-0034](../adr/0034-cancel-stale-rolling-dev-releases.md) to chairlift
  and pilothouse through independent pull requests based on each repository's
  `main` branch ([core#10](https://github.com/frostyard/core/issues/10)).
- **Done when:** chairlift and pilothouse both enforce the literal
  `goreleaser-nightly` group with `cancel-in-progress: true` in CI and their
  pull requests are merged.
```

- [ ] **Step 5: Index this plan**

Add this line under `### Plans` in `docs/README.md`:

```markdown
- [Dev release concurrency rollout](plans/0004-dev-release-concurrency-rollout.md)
```

- [ ] **Step 6: Run the core documentation and scaffold gates**

Run:

```bash
node scripts/check-docs.mjs
npm ci
npm test
```

Run the two npm commands from
`.agents/skills/frostyard-docs-site/scaffold/`.

Expected: `check-docs.mjs` reports all thresholds `ok`; the scaffold build
succeeds and all six Node tests pass. Record any `npm audit` advisory count in
the PR without changing dependencies in this focused work.

- [ ] **Step 7: Review and commit the core implementation changes**

Run:

```bash
git diff --check
git status --short
git diff -- .agents/skills/frostyard-go-repo/SKILL.md docs/
```

Expected: only the skill, ADR status, roadmap, docs index, and this plan are
changed after `6edaa7c`.

Commit:

```bash
git add .agents/skills/frostyard-go-repo/SKILL.md docs/README.md docs/adr/0034-cancel-stale-rolling-dev-releases.md docs/plans/0002-org-portfolio-roadmap.md docs/plans/0004-dev-release-concurrency-rollout.md
git commit -m "docs: publish dev release concurrency policy"
```

- [ ] **Step 8: Push and open the core pull request**

Run:

```bash
git push -u origin policy/dev-release-concurrency
gh pr create --repo frostyard/core --base main --head policy/dev-release-concurrency --title "docs: standardize dev release concurrency" --body-file /tmp/opencode/core-10-pr.md
```

Create `/tmp/opencode/core-10-pr.md` from core's pull request template. State
`Closes #10` only after linking both downstream PRs; until then use
`Tracks #10`. Declare `Risk tier: 1` because this repository changes only
docs and a skill. Include the exact successful verification commands and
check every applicable docs-housekeeping item.

Expected: the PR targets `frostyard/core:main`, includes the design and
implementation commits, and contains no downstream repository files.

**Done when:** the core PR publishes accepted ADR-0034, the exact skill
contract, and a green documentation gate.

---

### Task 2: Enforce The Contract In Chairlift

**Files:**
- Modify: `.github/workflows/snapshot.yml:12-14`
- Modify: `internal/installcheck/workflows_test.go`
- Modify: `docs/org-adrs.md`

**Interfaces:**
- Consumes: core ADR-0034's exact top-level concurrency mapping.
- Produces: a chairlift workflow guarded by
  `TestSnapshotWorkflowUsesRollingDevConcurrency`.

- [ ] **Step 1: Prepare an independent chairlift worktree**

From a directory outside the core worktree, clone or update chairlift, then
create a branch from current `origin/main`:

```bash
git fetch origin main
git switch -c ci/dev-release-concurrency origin/main
```

Before editing, read `AGENTS.md`, `.knowledge/README.md`, `.memory/README.md`,
every Markdown file directly under `docs/agents/skills/`, and the synced
`docs/agents/skills/frostyard-go-repo/SKILL.md`.

Expected: `git merge-base --is-ancestor origin/main HEAD` exits zero and the
worktree is clean.

- [ ] **Step 2: Write the failing YAML-aware regression test**

Append this test to `internal/installcheck/workflows_test.go`:

```go
func TestSnapshotWorkflowUsesRollingDevConcurrency(t *testing.T) {
	path := filepath.Join(".github", "workflows", "snapshot.yml")
	workflow := readRepoFile(t, path)

	var config struct {
		Concurrency struct {
			Group            string `yaml:"group"`
			CancelInProgress bool   `yaml:"cancel-in-progress"`
		} `yaml:"concurrency"`
	}
	if err := yaml.Unmarshal([]byte(workflow), &config); err != nil {
		t.Fatalf("parse %s: %v", path, err)
	}
	if config.Concurrency.Group != "goreleaser-nightly" {
		t.Errorf("concurrency group = %q, want goreleaser-nightly", config.Concurrency.Group)
	}
	if !config.Concurrency.CancelInProgress {
		t.Error("cancel-in-progress = false, want true")
	}
}
```

The file already imports `filepath`, `testing`, and `gopkg.in/yaml.v3`; add no
new dependency.

- [ ] **Step 3: Run the focused test and verify the old workflow fails**

Run:

```bash
go test ./internal/installcheck -run '^TestSnapshotWorkflowUsesRollingDevConcurrency$' -count=1
```

Expected: FAIL reporting group `chairlift-dev-release` instead of
`goreleaser-nightly` and `cancel-in-progress = false, want true`.

- [ ] **Step 4: Apply the exact concurrency block**

Replace the existing top-level block in `.github/workflows/snapshot.yml`
with:

```yaml
# Nightlies replace the same dev tag and release. Cancel stale runs before a
# newer one publishes so concurrent GoReleaser uploads cannot collide.
concurrency:
  group: goreleaser-nightly
  cancel-in-progress: true
```

Do not alter the workflow trigger, permissions, snapshot job, or snow
repository dispatch.

- [ ] **Step 5: Record the binding org decision**

Add this line immediately after ADR-0012 in `docs/org-adrs.md`:

```markdown
- [ADR-0034 — Cancel stale rolling dev releases](https://github.com/frostyard/core/blob/main/docs/adr/0034-cancel-stale-rolling-dev-releases.md) — snapshot.yml uses `goreleaser-nightly` with stale-run cancellation
```

- [ ] **Step 6: Run the focused test and full chairlift gate**

Run:

```bash
go test ./internal/installcheck -run '^TestSnapshotWorkflowUsesRollingDevConcurrency$' -count=1
make ci
```

Expected: the focused test passes and `make ci` ends with
`==> CI mirror passed`. `make e2e` is not required because no application,
GTK, installation, or privileged-helper behavior changes.

- [ ] **Step 7: Review and commit the chairlift change**

Run:

```bash
git diff --check
git status --short
git diff -- .github/workflows/snapshot.yml internal/installcheck/workflows_test.go docs/org-adrs.md
```

Expected: exactly those three files changed; the test parses YAML rather than
matching an unscoped text fragment.

Commit:

```bash
git add .github/workflows/snapshot.yml internal/installcheck/workflows_test.go docs/org-adrs.md
git commit -m "ci: cancel stale dev release snapshots"
```

- [ ] **Step 8: Push and open the chairlift pull request**

Run:

```bash
git push -u origin ci/dev-release-concurrency
gh pr create --repo frostyard/chairlift --base main --head ci/dev-release-concurrency --title "ci: cancel stale dev release snapshots" --body-file /tmp/opencode/chairlift-core-10-pr.md
```

Create `/tmp/opencode/chairlift-core-10-pr.md` from chairlift's template.
Link `frostyard/core#10` without closing it. Declare `Tier 3 - High` because
the change alters release concurrency. State that the failure-path test first
failed against queueing and now enforces cancellation, deployment is automatic
on merge, rollback is reverting the concurrency block, and no permissions or
release steps changed.

Expected: the PR targets `frostyard/chairlift:main` and contains one commit.

**Done when:** chairlift's PR has a green focused regression test and
`make ci`, and its diff is limited to the workflow, guard test, and org ADR
index.

---

### Task 3: Enforce The Contract In Pilothouse

**Files:**
- Modify: `.github/workflows/snapshot.yml:10-12`
- Create: `internal/workflowcheck/snapshot_workflow_test.go`
- Modify: `docs/org-adrs.md`

**Interfaces:**
- Consumes: core ADR-0034's exact top-level concurrency mapping.
- Produces: a pilothouse workflow guarded by
  `TestSnapshotWorkflowUsesRollingDevConcurrency`.

- [ ] **Step 1: Prepare an independent pilothouse worktree**

From a directory outside the chairlift and core worktrees, clone or update
pilothouse, then create a branch from current `origin/main`:

```bash
git fetch origin main
git switch -c ci/dev-release-concurrency origin/main
```

Before editing, read `AGENTS.md`, `docs/security/SECURITY-AI.md`,
`.knowledge/README.md`, every Markdown file directly under
`docs/agents/skills/`, and the synced
`docs/agents/skills/frostyard-go-repo/SKILL.md`.

Expected: `git merge-base --is-ancestor origin/main HEAD` exits zero and the
worktree is clean.

- [ ] **Step 2: Write the failing YAML-aware regression test**

Create `internal/workflowcheck/snapshot_workflow_test.go`:

```go
package workflowcheck

import (
	"os"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestSnapshotWorkflowUsesRollingDevConcurrency(t *testing.T) {
	const path = "../../.github/workflows/snapshot.yml"
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read snapshot workflow: %v", err)
	}

	var workflow struct {
		Concurrency struct {
			Group            string `yaml:"group"`
			CancelInProgress bool   `yaml:"cancel-in-progress"`
		} `yaml:"concurrency"`
	}
	if err := yaml.Unmarshal(data, &workflow); err != nil {
		t.Fatalf("parse snapshot workflow: %v", err)
	}
	if workflow.Concurrency.Group != "goreleaser-nightly" {
		t.Errorf("concurrency group = %q, want goreleaser-nightly", workflow.Concurrency.Group)
	}
	if !workflow.Concurrency.CancelInProgress {
		t.Error("cancel-in-progress = false, want true")
	}
}
```

Pilothouse already depends on `gopkg.in/yaml.v3`; do not change `go.mod` or
`go.sum`.

- [ ] **Step 3: Run the focused test and verify the missing block fails**

Run:

```bash
go test ./internal/workflowcheck -run '^TestSnapshotWorkflowUsesRollingDevConcurrency$' -count=1
```

Expected: FAIL reporting an empty concurrency group and
`cancel-in-progress = false, want true`.

- [ ] **Step 4: Add the exact concurrency block**

Insert this block after the `on:` trigger and before `permissions:` in
`.github/workflows/snapshot.yml`:

```yaml
# Nightlies replace the same dev tag and release. Cancel stale runs before a
# newer one publishes so concurrent GoReleaser uploads cannot collide.
concurrency:
  group: goreleaser-nightly
  cancel-in-progress: true
```

Do not alter the workflow trigger, permissions, cross-toolchain setup, or
GoReleaser step.

- [ ] **Step 5: Record the binding org decision**

Add this line immediately after ADR-0012 in `docs/org-adrs.md`:

```markdown
- [ADR-0034 — Cancel stale rolling dev releases](https://github.com/frostyard/core/blob/main/docs/adr/0034-cancel-stale-rolling-dev-releases.md) — snapshot.yml serializes the `dev` release by cancelling stale runs
```

- [ ] **Step 6: Run the focused test and full pilothouse gate**

Run:

```bash
go test ./internal/workflowcheck -run '^TestSnapshotWorkflowUsesRollingDevConcurrency$' -count=1
make ci
```

If native PAM or systemd headers are unavailable, run `make docker-ci`
instead of `make ci` and record that substitution.

Expected: the focused test passes and the selected full gate ends with
`all CI gates passed`. Packaging and VM tiers are not required because no
package contents, installation behavior, or host-image behavior changes.

- [ ] **Step 7: Review and commit the pilothouse change**

Run:

```bash
git diff --check
git status --short
git diff -- .github/workflows/snapshot.yml internal/workflowcheck/snapshot_workflow_test.go docs/org-adrs.md
```

Expected: exactly those three files changed and `go.mod`/`go.sum` are
unchanged.

Commit:

```bash
git add .github/workflows/snapshot.yml internal/workflowcheck/snapshot_workflow_test.go docs/org-adrs.md
git commit -m "ci: serialize dev release snapshots"
```

- [ ] **Step 8: Push and open the pilothouse pull request**

Run:

```bash
git push -u origin ci/dev-release-concurrency
gh pr create --repo frostyard/pilothouse --base main --head ci/dev-release-concurrency --title "ci: serialize dev release snapshots" --body-file /tmp/opencode/pilothouse-core-10-pr.md
```

Create `/tmp/opencode/pilothouse-core-10-pr.md` from pilothouse's template.
Link `frostyard/core#10` without closing it. Declare `Tier 3 - High` because
the change adds release concurrency. State that the failure-path test first
failed when serialization was absent and now enforces cancellation,
deployment is automatic on merge, rollback is removing the concurrency
block, and no permissions, secrets, or release steps changed.

Expected: the PR targets `frostyard/pilothouse:main` and contains one commit.

**Done when:** pilothouse's PR has a green focused regression test and full
CI mirror, and its diff is limited to the workflow, guard test, and org ADR
index.

---

### Task 4: Link The Rollout And Close The Core Issue

**Files:**
- Modify: core pull request description only
- Modify: GitHub issue `frostyard/core#10` only

**Interfaces:**
- Consumes: the three open pull request URLs and their CI results.
- Produces: a traceable rollout in which core#10 closes only when both
  downstream implementations merge.

- [ ] **Step 1: Cross-link all three pull requests**

Edit each PR description with `gh pr edit --body-file` so the core PR lists
the chairlift and pilothouse PR URLs, and each downstream PR lists the core
policy PR URL plus the sibling rollout PR URL.

Retrieve the URLs without guessing pull request numbers:

```bash
gh pr view policy/dev-release-concurrency --repo frostyard/core --json url --jq .url
gh pr view ci/dev-release-concurrency --repo frostyard/chairlift --json url --jq .url
gh pr view ci/dev-release-concurrency --repo frostyard/pilothouse --json url --jq .url
```

Expected: no PR uses a closing keyword for an issue in another repository;
all three links are navigable.

- [ ] **Step 2: Confirm required checks and review state**

Run:

```bash
gh pr checks policy/dev-release-concurrency --repo frostyard/core
gh pr view policy/dev-release-concurrency --repo frostyard/core --json mergeStateStatus,reviewDecision,statusCheckRollup
gh pr checks ci/dev-release-concurrency --repo frostyard/chairlift
gh pr view ci/dev-release-concurrency --repo frostyard/chairlift --json mergeStateStatus,reviewDecision,statusCheckRollup
gh pr checks ci/dev-release-concurrency --repo frostyard/pilothouse
gh pr view ci/dev-release-concurrency --repo frostyard/pilothouse --json mergeStateStatus,reviewDecision,statusCheckRollup
```

Expected before merge: all required checks pass, `mergeStateStatus` is not
`DIRTY`, and each Tier 3 downstream PR has review from someone familiar with
the release workflow.

- [ ] **Step 3: Update the roadmap after downstream merges**

After chairlift and pilothouse merge, update the core branch from `main` if
the core PR is still open, or open a follow-up core docs branch if it already
merged. Mark the roadmap phase complete. The resulting phase must read:

```markdown
## Dev release concurrency rollout ✅ 2026-08-12

- [x] Applied
  [ADR-0034](../adr/0034-cancel-stale-rolling-dev-releases.md) to chairlift
  and pilothouse through independent pull requests based on each repository's
  `main` branch; both pull requests are linked from
  [core#10](https://github.com/frostyard/core/issues/10).
- **Done when:** chairlift and pilothouse both enforce the literal
  `goreleaser-nightly` group with `cancel-in-progress: true` in CI and their
  pull requests are merged. ✅ verified 2026-08-12.
```

Run `node scripts/check-docs.mjs`, commit with
`docs: complete dev release concurrency rollout`, and push the update.

- [ ] **Step 4: Close issue #10 with evidence**

After the core policy and both downstream PRs merge, run:

```bash
core_url=$(gh pr view policy/dev-release-concurrency --repo frostyard/core --json url --jq .url)
chairlift_url=$(gh pr view ci/dev-release-concurrency --repo frostyard/chairlift --json url --jq .url)
pilothouse_url=$(gh pr view ci/dev-release-concurrency --repo frostyard/pilothouse --json url --jq .url)
gh issue close 10 --repo frostyard/core --comment "Standardized on \`goreleaser-nightly\` with \`cancel-in-progress: true\`. Policy: $core_url. Chairlift: $chairlift_url. Pilothouse: $pilothouse_url."
```

Expected: core issue #10 is closed and its final comment links all three
merged PRs.

**Done when:** all three PRs are merged, the portfolio roadmap records the
completed rollout, and core issue #10 closes with links to the evidence.

## References

- Implements:
  [ADR-0034](../adr/0034-cancel-stale-rolling-dev-releases.md)
- Coordinates with:
  [Organization portfolio stewardship](0002-org-portfolio-roadmap.md)
