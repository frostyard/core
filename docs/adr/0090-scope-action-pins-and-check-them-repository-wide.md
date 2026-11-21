# 0090 — Scope action pins and check them repository-wide

- **Status:** Accepted
- **Date:** 2026-11-21
- **Amends in part:** [ADR-0088](0088-read-the-action-pin-in-workflow-tests-never-hard-code-it.md)
  (what a pin test asserts, the online tag check and its script, the
  correction record that overrides an old one),
  [ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md) (the
  `# vX.Y.Z` comment form)

## Context

[ADR-0088](0088-read-the-action-pin-in-workflow-tests-never-hard-code-it.md)
has a test or check that guards a pin read the pin from the workflow and
assert its properties, never a SHA written in the test. It lists what such
a test "may assert": the action, a 40-hex commit SHA, the version comment
and 1 SHA for each action across all workflows. It has an optional online
job that checks each `# vX.Y.Z` comment against its tag upstream.

- In pilothouse (3dadbeb) and chairlift (4cb584a), the literal SHAs in tests
  are the only check that keeps an action on 1 commit across jobs. Their
  [ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md) checks
  (pilothouse `internal/workflowcheck/actions_test.go`, chairlift
  `internal/installcheck/workflows_test.go`) walk every `uses:` and check
  only the 40-hex form. snosi's `test/workflow-pins-test.py` (4b7842a)
  checks the comment, as `# vX[.Y[.Z]]` with a list of branch pins. No
  check of lab (150ca44) or snosi asserts 1 SHA for each action across all
  workflows; snosi's `test/forky-publish-workflow-test.py` compares 2 jobs.
  A test that swaps each literal SHA for a 40-hex pattern drops both
  properties.
- ADR-0088 says "action pin" in its title and "workflow pin" or "pin" in its
  decision, and does not say what a pin covers. The same tests hold other
  hashes: container image digests in a matrix, a `container:` or a
  `services:` key (pilothouse `wantInstallMatrix`, `debian:12@sha256:…`),
  written by hand and repeated in docs and make targets, and the hash pins
  of vendored core files (`scripts/check-template.mjs`). Dependabot's
  `github-actions` updates change neither.
- Some upstreams tag a release without the `v`. bats-core/bats-action has
  the tag `4.1.0`, whose peeled commit is `3566550e…`, and snosi pins that
  commit with `# v4.1.0`. ADR-0088's script asks only for
  `refs/tags/v4.1.0` and exits 1 on snosi's default branch.
- ADR-0088's script reads only unquoted `uses:` lines with a full
  `# vX.Y.Z` comment and drops every other pin without a word. On snosi
  that is 6 pins: `oras-project/setup-oras` (`# v2`),
  `ryand56/r2-upload-action` (`# v1.5`), 3 pins to a `main` commit
  (`systemd/mkosi`, `ublue-os/container-storage-action`,
  `frostyard/changelog-generator`, comment `# main YYYY-MM-DD`) and the core
  reusable workflow. On lab it is 2. snosi's `systemd/mkosi` pin runs in the
  `build` job of `build.yml`, the job that later gets the R2 credentials and
  `REPOGEN_GPG_KEY`.
- Some upstreams tag their releases with 2 parts.
  `ryand56/r2-upload-action` has the release tag `v1.5` and no `v1.5.x`
  tag; snosi pins its commit `33ebb7a…` with `# v1.5`, in the jobs that
  get the R2 credentials. `github/issue-labeler` tags every release
  `vX.Y`; lab pins `v3.5`, its newest release, with `# v3.5`. Such a pin
  has no true `# vX.Y.Z` comment. A major-only tag moves:
  `oras-project/setup-oras` tag `v2` names `v2.0.4`, while snosi's pin
  `# v2` is the commit of `v2.0.3`.
- GitHub's compare API (`GET /repos/OWNER/REPO/compare/BASE...HEAD`)
  resolves a commit across the fork network. A commit of a fork's pull
  request branch, compared with `systemd/mkosi`'s `main`, has status
  `ahead`; a commit on `main` has `identical` or `behind`.
- Correction records are permanent and their schema has no field that marks
  a record replaced ([ADR-0081](0081-store-each-correction-in-a-file-of-its-own.md)).
  lab's `.memory/corrections/2026-11-13-legacy-0018.json` says to keep the
  exact SHA of `anthropics/claude-code-action` in its test.
- After ADR-0088, the owner's review of the bump pull request is the only
  check that stops an unreviewed SHA. The Dependabot shadow's class leaves
  out L1 and L2 pull requests (step S3 of
  [the shadow design](../design/dependabot-shadow.md)), and the go-live that
  would enable auto-merge for that class is not built.
- `gopkg.in/yaml.v3` keeps a line's comment in `yaml.Node.LineComment`; a
  test that decodes `uses` into a Go string loses it. PyYAML drops comments.

## Decision

- **An action pin is the value of a `uses:` key** in a workflow or an action
  metadata file: an action (`OWNER/REPO[/PATH]@REF`), a reusable workflow,
  or a `docker://` action, which is what Dependabot's `github-actions`
  updates change. In ADR-0088, "action pin", "workflow pin" and "pin" all
  mean an action pin. ADR-0088 does not apply to these 2 kinds of hash, and
  a test may keep them literal:
  - container image digests (`IMAGE@sha256:…`) in a matrix, a `container:`
    or a `services:` key;
  - hash pins of vendored core files, such as the vendored-file pins in
    `scripts/check-template.mjs` (a core commit and a sha256 for each
    file).
- **A repository that removes a literal SHA from a test or check has, or
  adds in the same pull request, 1 repository-wide check** over every file
  in `.github/workflows/` (and `.github/actions/`, where it exists). For
  each action pin `OWNER/REPO[/PATH]@SHA`, it asserts:
  - the version comment: `# vX.Y.Z`, or `# vX.Y` when upstream's release
    tags have 2 parts, or the comment that the repository's pin rule allows
    for an action that the rule names as pinned to a branch commit. A
    major-only `# vN` is not a version comment;
  - 1 SHA, at least for each `OWNER/REPO[/PATH]`, across all those files.
    A repository may key the check on `OWNER/REPO`, which is stricter.

  A pin of a frostyard/core reusable workflow
  (`frostyard/core/.github/workflows/FILE@SHA`) is exempt from the
  version comment, because core has no release tags. Its comment names the
  core commit on `main`, for example
  `# core#246 (frostyard/core main, 2026-11-14; core has no release tags)`,
  and the check needs to assert only that a comment is there. The pin stays
  in the 1-SHA check. With the repository-wide check in place, a test of 1
  job needs to assert only the action, the 40-hex form and the step.
- **The repository-wide check belongs in the walker that already checks
  ADR-0021** in the repository (pilothouse
  `internal/workflowcheck/actions_test.go`, chairlift
  `internal/installcheck/workflows_test.go`, snosi
  `test/workflow-pins-test.py`), not in a copy in each job test. It reads
  the comment from the parsed node in Go (`yaml.Node.LineComment` of
  `gopkg.in/yaml.v3`) and from the raw line with a regular expression in
  Python, because PyYAML drops comments.
- **The version comment names the release's tag, and may name it with or
  without its leading `v`.** `# v4.1.0` names the upstream tag `v4.1.0` or,
  when upstream has no such tag, `4.1.0`; `# v1.5` names `v1.5` or `1.5`.
  A `v4.1.0` tag that names another commit fails; the check does not fall
  back to `4.1.0` then.
- This amends 1 statement of ADR-0021, "with the human-readable version
  kept as a trailing comment (`# vX.Y.Z`)": the comment may also be
  `# vX.Y` when upstream's release tags have 2 parts. Everything else in
  ADR-0021 stands.
- **The online check of ADR-0088 is the script below.** It:
  - checks a `# vX.Y.Z` or `# vX.Y` pin against the tag upstream, as
    above;
  - checks a pin to a branch commit, comment `# BRANCH YYYY-MM-DD`, and a
    core reusable workflow pin (branch `main`) with the compare API: the
    status of `compare/BRANCH...SHA` is `identical` or `behind`, so the
    commit is on the upstream branch and not only in a fork;
  - reads each `uses:` key that has its value on the same line, the key
    and the value plain or quoted, in files with LF or CRLF line ends;
  - prints each pin it does not check (a major-only `# v2`, any other
    comment, a ref that is not a 40-hex SHA), and the file and line
    of each `uses:` key it cannot read (a flow mapping, a block scalar,
    `uses:` inside a `run:` text), then the count of pins checked and
    skipped. A line that is a YAML comment is not read.
- **A repository whose correction record requires a literal SHA in a test
  adds a new record** whose `correction` text names the old record's file,
  ADR-0088 and this ADR, and says that it replaces the old record. The old
  record stays as it is.
- This amends ADR-0088 in these statements, and only these:
  - "the line carries its version comment, `# vX.Y.Z` (or the comment the
    repository's pin rule allows for a pin that has no release tag …)" and,
    in Consequences, "pins keep the full `# vX.Y.Z` comment that ADR-0021
    asks for": `# vX.Y` is also a version comment when upstream's release
    tags have 2 parts, and the exception names actions pinned to a branch
    commit, which may have release tags.
  - "It may assert, for each pin it guards: … the line carries its version
    comment … the same action has 1 SHA across all workflows of the
    repository": for a repository that removes a literal SHA, the
    repository-wide check of these 2 properties is required, not optional.
  - The online check "resolves the tag of each version comment upstream
    (`git ls-remote`) and fails when the tag does not name the pinned
    commit": it also tries the tag without the `v`, as above. "It covers
    comments that name a tag; a pin whose comment names a branch is outside
    it" no longer holds: branch pins and core reusable workflow pins are
    checked with the compare API.
  - ADR-0088's tag-check script is replaced by the script below.
  - In Consequences, "A comment that names a moving major tag (`# v4`)
    fails it as soon as upstream moves the tag" and "The script above reads
    only unquoted `uses:` lines with a full version comment" no longer
    hold: the script prints such a pin as skipped, it reads quoted keys
    and values, and it prints each `uses:` line it cannot read.
  - "The repository replaces the assertion and records the change in a new
    correction record": the record also names the old record's file,
    ADR-0088 and this ADR.
  - "the owners of the files listed in the pull request that adds this ADR
    change them": the list is the one in the pull request that adds this
    ADR, which corrects it.

  Everything else in ADR-0088 stands: the rule itself, self-tests and
  mutation tests, synthetic fixtures, the owner's review of the bump pull
  request, its Go example and its alternatives.

The repository-wide check in Go, as an addition to the ADR-0021 walker
that already parses each workflow with `gopkg.in/yaml.v3`:

```go
var (
	actionPin      = regexp.MustCompile(`^([^@]+)@([0-9a-f]{40})$`)
	versionComment = regexp.MustCompile(`^# v\d+\.\d+(\.\d+)?$`)
)

// checkPin runs on the value node of every uses: key of every workflow.
// shas collects the SHAs of each action.
func checkPin(t *testing.T, path string, value *yaml.Node, shas map[string]map[string]bool) {
	t.Helper()
	m := actionPin.FindStringSubmatch(value.Value)
	if m == nil {
		return // ./local, docker:// or not a SHA: the ADR-0021 check reports it
	}
	action, sha := m[1], m[2]
	switch {
	case strings.HasPrefix(action, "frostyard/core/.github/workflows/"):
		// core has no release tags: the comment names the core commit on main
		if value.LineComment == "" {
			t.Errorf("%s:%d: %s has no comment", path, value.Line, action)
		}
	case !versionComment.MatchString(value.LineComment):
		t.Errorf("%s:%d: %s has comment %q, want # vX.Y.Z or # vX.Y", path, value.Line, action, value.LineComment)
	}
	if shas[action] == nil {
		shas[action] = map[string]bool{}
	}
	shas[action][sha] = true
}

// checkOneSHA runs once, after the walk of every workflow.
func checkOneSHA(t *testing.T, shas map[string]map[string]bool) {
	t.Helper()
	for action, set := range shas {
		if len(set) != 1 {
			t.Errorf("%s has %d SHAs across the workflows, want 1", action, len(set))
		}
	}
}
```

The online check, as a script for a job of its own. It needs bash 4, `git`
and an authenticated `gh` (`GH_TOKEN`). It reads lines, not YAML: what it
cannot read, it reports instead of passing over:

```bash
#!/usr/bin/env bash
# Online check of the action pins in .github/workflows and .github/actions (ADR-0088, ADR-0090):
#   OWNER/REPO[/PATH]@SHA # vX.Y[.Z]           tag vX.Y[.Z] (X.Y[.Z] if it is missing) names SHA
#   OWNER/REPO[/PATH]@SHA # BRANCH YYYY-MM-DD  SHA is on BRANCH (compare: identical or behind)
#   frostyard/core/.github/workflows/F@SHA     SHA is on core's main
# It prints every other pin, and every uses: key on a line it cannot read, as skipped.
# Needs bash 4, git and an authenticated gh.
set -euo pipefail
status=0 checked=0 skipped=0
declare -A seen
# 1 line `[- ]uses: VALUE [# COMMENT]`; the key may be quoted, the value may be quoted.
pin='^[[:space:]]*(-[[:space:]]+)?(uses|"uses"|'\''uses'\'')[[:space:]]*:[[:space:]]+([^][:space:]#|>{}&*!"'\''[][^[:space:]]*|"[^"]*"|'\''[^'\'']*'\'')([[:space:]]+#[[:space:]]*(.*))?$'
while IFS= read -r hit; do
	file=${hit%%:*} rest=${hit#*:}
	line=${rest%%:*} text=${rest#*:}
	text=${text%$'\r'}
	text=${text#$'\xef\xbb\xbf'}
	[[ $text =~ ^[[:space:]]*# ]] && continue
	if [[ ! $text =~ $pin ]]; then
		echo "skipped: $file:$line: a uses: key this script cannot read (flow mapping, block scalar, text)"
		skipped=$((skipped + 1))
		continue
	fi
	ref=${BASH_REMATCH[3]} comment=${BASH_REMATCH[5]}
	ref=${ref#[\"\']} && ref=${ref%[\"\']}
	comment=${comment%"${comment##*[![:space:]]}"}
	[[ $ref == ./* || -n ${seen["$ref # $comment"]:-} ]] && continue
	seen["$ref # $comment"]=1
	tag='' branch='' why=''
	if [[ ! $ref =~ ^[^./][^@]*/[^@]+@[0-9a-f]{40}$ ]]; then
		why="not OWNER/REPO[/PATH]@SHA"
	elif [[ $comment =~ ^v?[0-9]+\.[0-9]+(\.[0-9]+)?$ ]]; then
		tag=$comment
	elif [[ $ref == frostyard/core/.github/workflows/* ]]; then
		branch=main
	elif [[ $comment =~ ^([A-Za-z0-9._/-]+)\ [0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
		branch=${BASH_REMATCH[1]}
	else
		why="the comment names no vX.Y[.Z] tag and no BRANCH YYYY-MM-DD"
	fi
	if [[ -n $why ]]; then
		echo "skipped: $ref # $comment ($why)"
		skipped=$((skipped + 1))
		continue
	fi
	checked=$((checked + 1))
	repo=$(cut -d/ -f1-2 <<<"${ref%@*}")
	sha=${ref##*@}
	if [[ -n $tag ]]; then
		for t in "$tag" "${tag#v}"; do
			got=$(git ls-remote "https://github.com/$repo" "refs/tags/$t" "refs/tags/$t^{}" | awk 'END { print $1 }')
			[[ -n $got ]] && break
		done
		[[ $got == "$sha" ]] || { echo "$ref: tag $tag is ${got:-missing} upstream" >&2; status=1; }
	else
		got=$(gh api "repos/$repo/compare/$branch...$sha" --jq .status 2>/dev/null) || got="no comparison"
		[[ $got == identical || $got == behind ]] || { echo "$ref: not on $branch upstream ($got)" >&2; status=1; }
	fi
done < <(grep -rnsE '(^|[[:space:]{,[])["'\'']?uses["'\'']?[[:space:]]*:' .github/workflows .github/actions)
echo "checked $checked pins, skipped $skipped"
exit "$status"
```

## Consequences

- Easier: a repository that drops a literal SHA keeps the 2 properties the
  literal held (the comment and 1 commit for each action), in 1 place for
  the whole repository instead of in each job test.
- Easier: a pin to a branch commit, which ADR-0088's script left out, gets
  an online check that the commit is on the upstream branch. A pass of the
  script states what it did not check.
- Harder: before it removes a literal SHA, a repository whose ADR-0021
  check lacks the comment or the 1-SHA assertion extends it. At the commits
  above, that is pilothouse and chairlift (both), lab (both) and snosi
  (1 SHA for each action).
- Harder: the compare check fails when upstream rewrites or deletes the
  branch, when the comment names the wrong branch, and when the token
  cannot read the repository. It makes 1 API call for each distinct branch
  pin. The script exits with `git`'s error when GitHub cannot be reached.
- A bump of an action pin stays outside any Dependabot auto-merge class:
  the owner's review of the bump pull request is the guard that ADR-0088
  rests on. A class or a go-live that would merge such a bump without that
  review needs an ADR that amends this one.
- Core's `test/repository-baseline.test.mjs` (row B5) asserts the
  `# vX.Y.Z` or `# vX.Y` comment and 1 SHA for each action across core's
  workflows, since core dropped its literal `dependabot/fetch-metadata` SHA
  with ADR-0088. `test/pin-check-script.test.mjs` runs the script above, read
  from this file, with stand-ins for `git` and `gh`.
- New obligations: the owners of the files listed in the pull request that
  adds this ADR change them, each with the repository-wide check in the
  same pull request; a repository with an opposite correction record adds
  the new record.
- Stays open: a pin whose comment names neither a `vX.Y[.Z]` tag nor a
  `BRANCH YYYY-MM-DD` (snosi's `# v2`) is printed as skipped, not checked.
  The comment of the release it pins (`# v2.0.3`) brings it under the
  check.

## Alternatives considered

- **Leave the comment and 1-SHA assertions optional ("may assert"):** a
  migration that swaps each literal for a 40-hex pattern then drops the
  only check that keeps an action on 1 commit across jobs.
- **Assert the comment and 1 SHA in each job test:** a job test that
  decodes steps into structs loses the comment, and a check in each test
  covers only the jobs that have a test.
- **Leave branch pins under "Stays open":** the branch pin is the one pin
  for which the tag check proves nothing, and a pin like snosi's
  `systemd/mkosi` runs in a job with publication secrets. The job is online
  already, and the compare API answers in 1 call.
- **Check a major-only `# v2` against its tag:** that tag moves with each
  upstream release (`oras-project/setup-oras` tag `v2` already names a
  newer commit than snosi's pin, which is `v2.0.3`), so the check fails on
  each upstream release; the comment of the pinned release fixes the pin
  instead. A `vX.Y` release tag such as `v1.5` or `v3.5` names 1 release
  and is checked.
- **Require `# vX.Y.Z` only:** a pin of an upstream whose releases are
  tagged `vX.Y` then has no true comment: a false comment fails the online
  check, and any other comment is skipped for good.
- **A "superseded" field in correction records:** ADR-0081 keeps records
  append-only, and a field would need a schema change in every repository;
  the new record's text says which record wins.

## References

- Shapes: [spec: PR review rubric](../specs/pr-review-rubric.md) (row
  "Pin tests read the pin"), core's `test/repository-baseline.test.mjs`
  and `test/pin-check-script.test.mjs`
- Amends in part: [ADR-0088](0088-read-the-action-pin-in-workflow-tests-never-hard-code-it.md),
  [ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md)
- Builds on: [ADR-0081](0081-store-each-correction-in-a-file-of-its-own.md),
  [ADR-0083](0083-run-the-ci-gate-locally-as-make-ci.md)
- Related: [design: Dependabot shadow](../design/dependabot-shadow.md)
- External: [GitHub REST API, compare two
  commits](https://docs.github.com/en/rest/commits/commits#compare-two-commits)
