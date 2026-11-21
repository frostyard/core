# 0088 — Read the action pin in workflow tests, never hard-code it

- **Status:** Accepted
- **Date:** 2026-11-21

## Context

[ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md) pins every
external `uses:` to a full 40-character commit SHA with a `# vX.Y.Z`
comment, has each repository enforce it with an in-repo test, and lets
Dependabot update the SHA and the comment together.
[ADR-0075](0075-batch-routine-pull-requests.md) groups each repository's
action updates into 1 Dependabot pull request for each run.

Some tests and checks go further and compare a pin in the repository's own
workflow with a SHA written in the test. Such a test fails on every
Dependabot bump of that action, even when the new pin keeps every property
ADR-0021 asks for, and the pull request cannot merge until someone adds a
commit that moves the SHA in the test:

- On 2026-11-21, 3 Dependabot pull requests were red only for this reason:
  pilothouse#279 (`TestClaudeReviewWorkflowIsPinnedAndLeastPrivilege` for
  `anthropics/claude-code-action`, `TestImageTierWorkflowRunsOneRootOwnedOrchestrator`
  for `actions/setup-go`), lab#265 (`ACTION_SHA` in
  `tests/test_claude_code_review_workflow.py`) and snosi#1332 (a self-test
  case of `test/build-workflow-permissions-test.py` that replaces the
  literal `systemd/mkosi` SHA). pilothouse#260 needed the same commit on
  2026-11-14.
- lab's correction record `.memory/corrections/2026-11-13-legacy-0018.json`
  calls the red bump of `claude-code-action` by design: the literal SHA is
  meant to force a review of each new commit of an action that runs with a
  secret and a `pull-requests: write` token.
- The same day, a search of the default branches of the frostyard and
  bketelsen repositories that the team checks out found 13 files in 8
  repositories, and 1 core test, whose test or check compares a real
  workflow pin with a literal SHA (the search: a 40-hex string in a test or
  check file that also appears in a `uses:` of the same repository, each
  hit read by hand; synthetic fixtures not counted). The pull request that
  adds this ADR lists them.
- Dependabot's `github-actions` updates change `uses:` lines in workflow
  files and in action metadata files (`action.yml`). They change no other
  file: not a test, and not a list of reviewed SHAs.
- `.github/workflows/**` and `.github/actions/**` are an organization floor
  at L2 ([ADR-0078](0078-sort-pull-requests-by-levels-l1-to-l4.md)), so a
  bump of an action gets `level:L2` and `risk:high`, which routes it to the
  owner's review ([ADR-0068](0068-label-pull-requests-that-touch-high-risk-paths.md)),
  in every repository that runs the triage caller.
- GitHub resolves `owner/repo@SHA` across the repository's fork network, and
  its security hardening guide tells users to check that a pinned SHA comes
  from the action's repository and not from a fork. The version comment is
  the only place a pin says which release it should be.
- `make ci` is offline ([ADR-0083](0083-run-the-ci-gate-locally-as-make-ci.md)):
  a check that needs the network runs in a job of its own.

## Decision

- **A test or check that guards a workflow pin reads the pin from the
  workflow and asserts its properties. It never compares the pin with a
  SHA written in the test.** It may assert, for each pin it guards:
  - the action (`owner/repo` and path) is the expected one, in the expected
    job and step, the expected number of times;
  - the ref is a full 40-character lowercase hex commit SHA, not a tag, a
    branch or a short SHA;
  - the line carries its version comment, `# vX.Y.Z` (or the comment the
    repository's pin rule allows for a pin that has no release tag, such as
    a core reusable workflow pinned to a `main` commit);
  - the same action has 1 SHA across all workflows of the repository;
  - everything else in the workflow: permissions, triggers,
    `persist-credentials`, inputs and step order.
- **A self-test or mutation test that edits a copy of a real workflow takes
  the pin it edits from that copy** (read the line, then replace it). Its
  anchor then survives a bump, and a missing anchor still fails the test.
- **A synthetic fixture**, workflow text that the test writes itself and
  feeds to a checker, may hold any SHA: it does not follow a real workflow.
  A new fixture should use an obvious placeholder
  (`0123456789abcdef0123456789abcdef01234567`) so that a search for live
  pins does not find it.
- **A repository that wants each new commit of an action reviewed** (an
  action that runs with a secret or a write token) keeps that review in the
  pull request, not in a test:
  - the owner reviews the bump pull request (L2 floor, `risk:high`) and
    reads the upstream changes between the old and the new SHA before the
    merge;
  - it may add an online check, in a job outside `make ci`, that resolves
    the tag of each version comment upstream (`git ls-remote`) and fails
    when the tag does not name the pinned commit. The job may run on pull
    requests that change `.github/workflows/**` and in the nightly
    compliance run of ADR-0021. It covers comments that name a tag; a pin
    whose comment names a branch is outside it;
  - it names the actions it reviews this way in its `AGENTS.md` or docs.

  A literal SHA in a test, or a file of reviewed SHAs that a test reads, is
  not used for this.
- **A repository rule or correction that requires a literal SHA in a test
  yields to this decision.** The repository replaces the assertion and
  records the change in a new correction record.

A test that reads the pin, in Go with `gopkg.in/yaml.v3`, which keeps the
line comment:

```go
var (
	commitSHA      = regexp.MustCompile(`^[0-9a-f]{40}$`)
	versionComment = regexp.MustCompile(`^# v\d+\.\d+\.\d+$`)
)

func TestClaudeActionIsPinned(t *testing.T) {
	const action = "anthropics/claude-code-action"
	pins := usesOf(t, "../../.github/workflows/claude-code-review.yml", action)
	if len(pins) != 1 {
		t.Fatalf("want 1 %s step, got %d", action, len(pins))
	}
	if sha := strings.TrimPrefix(pins[0].Value, action+"@"); !commitSHA.MatchString(sha) {
		t.Errorf("%s is pinned to %q, not a full commit SHA", action, sha)
	}
	if !versionComment.MatchString(pins[0].LineComment) {
		t.Errorf("%s pin has comment %q, want # vX.Y.Z", action, pins[0].LineComment)
	}
}

// usesOf returns the value node of every uses: key that names action.
func usesOf(t *testing.T, path, action string) []*yaml.Node {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var doc yaml.Node
	if err := yaml.Unmarshal(data, &doc); err != nil {
		t.Fatalf("parse %s: %v", path, err)
	}
	var found []*yaml.Node
	var walk func(n *yaml.Node)
	walk = func(n *yaml.Node) {
		if n.Kind == yaml.MappingNode {
			for i := 0; i+1 < len(n.Content); i += 2 {
				if n.Content[i].Value == "uses" && strings.HasPrefix(n.Content[i+1].Value, action+"@") {
					found = append(found, n.Content[i+1])
				}
			}
		}
		for _, c := range n.Content {
			walk(c)
		}
	}
	walk(&doc)
	return found
}
```

The check of 1 SHA across workflows collects `pins[i].Value` for the action
from every file in `.github/workflows/` and asserts that the set has 1
member. Core's `test/pr-triage.test.mjs` reads the
`dependabot/fetch-metadata` pin this way in JavaScript with the `yaml`
package. The online tag check, as a script for its own job:

```bash
#!/usr/bin/env bash
# Each `uses: OWNER/REPO[/PATH]@SHA # vX.Y.Z` pins the commit that tag names upstream.
set -euo pipefail
status=0
while read -r ref tag; do
	repo=$(cut -d/ -f1-2 <<<"${ref%@*}")
	want=${ref##*@}
	got=$(git ls-remote "https://github.com/$repo" "refs/tags/$tag" "refs/tags/$tag^{}" | awk 'END { print $1 }')
	if [[ $got != "$want" ]]; then
		echo "$ref: tag $tag is ${got:-missing} upstream" >&2
		status=1
	fi
done < <(grep -rhoE 'uses: *[^ .][^ @]*@[0-9a-f]{40} # v[0-9]+\.[0-9]+\.[0-9]+' .github/workflows |
	sed -E 's/uses: *([^ ]+) # (.*)/\1 \2/' | sort -u)
exit "$status"
```

## Consequences

- Easier: a Dependabot action bump that keeps the pin's properties passes
  `make ci` with no hand-written commit, and the owner's time goes to the
  upstream diff instead of moving a SHA in a test.
- Easier: a pin test states the property it protects (a full SHA, a version
  comment, 1 pin) instead of a value that only says "the SHA has not
  changed".
- Harder: the offline gate no longer notices that a SHA changed. That guard
  is now the owner's review of the bump and, where a repository runs it,
  the online tag check. A bump merged without that review is not stopped by
  a test.
- Harder: the online check needs the network and fails when GitHub cannot
  be reached, when upstream deletes a tag, or when upstream moves it; a
  moved tag is the signal it exists for. A comment that names a moving
  major tag (`# v4`) fails it as soon as upstream moves the tag, so pins
  keep the full `# vX.Y.Z` comment that ADR-0021 asks for. The script
  above reads only unquoted `uses:` lines with a full version comment.
- New obligations: the owners of the files listed in the pull request that
  adds this ADR change them; core's
  [PR review rubric](../specs/pr-review-rubric.md) checks new and changed
  pin tests; bketelsen/agentic-template keeps its pin test in this shape.
- Stays open: a script that writes a workflow with pins of its own (a
  workflow generator) is outside this decision; Dependabot does not update
  it either.

## Alternatives considered

- **Keep literal SHAs and move them by hand in each bump:** every action
  bump that touches such a test needs a hand-written commit before it can
  merge, and the review it forces is the review that the L2 floor already
  routes to the owner.
- **A file of reviewed SHAs that the test compares with:** Dependabot does
  not update that file, so the bump stays red until someone edits it, the
  same hand commit as a literal SHA in the test.
- **Compare each SHA with its tag upstream inside the test:** it needs the
  network inside `make ci`, which ADR-0083 keeps offline.
- **A pin helper that repositories vendor from core:** the pin tests are
  written in Go, Python, shell and JavaScript. One helper serves one
  language and adds a vendored file with its own sync pin to each
  repository, for a check of a few lines. The examples above and core's
  test show the pattern instead.

## References

- Shapes: [spec: PR review rubric](../specs/pr-review-rubric.md) (row
  "Pin tests read the pin"), core's `test/pr-triage.test.mjs`
- Builds on: [ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md),
  [ADR-0068](0068-label-pull-requests-that-touch-high-risk-paths.md),
  [ADR-0075](0075-batch-routine-pull-requests.md),
  [ADR-0078](0078-sort-pull-requests-by-levels-l1-to-l4.md),
  [ADR-0083](0083-run-the-ci-gate-locally-as-make-ci.md)
- External: [GitHub, security hardening for GitHub Actions: using
  third-party actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions#using-third-party-actions)
