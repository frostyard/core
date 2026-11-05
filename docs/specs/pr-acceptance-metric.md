# Spec: PR acceptance metric

One paragraph: defines the single quality metric this repo tracks for its
pull-request stream — the acceptance rate — precisely enough that any agent
or human computes the same number from the same window. Consumers: the
[quality loop](../design/quality-loop.md) and periodic org reviews.
`docs/metrics.md` is a conformance alias for this file
([ADR-0029](../adr/0029-acmm-conformance-via-canonical-aliases.md)).
`scripts/check-docs.mjs` pins this file's two `##` headings so prose and
tooling cannot drift apart silently
([ADR-0019](../adr/0019-governance-as-code-and-risk-tiers.md)).

## Definition

```
acceptance_rate = (merged PRs not subsequently reverted) / (PRs opened)
```

over a rolling window of the **last 30 PRs opened** (or 90 days, whichever
is smaller).

| Term | Meaning |
| --- | --- |
| PRs opened | All PRs opened against `main` in the window, including still-open and closed-unmerged ones |
| Merged | Squash-merged to `main` |
| Reverted | A later change reverts the PR by the [revert rule](#revert-rule) |

Data source:

```
gh pr list --repo frostyard/core --state all --limit 30 \
  --json number,state,mergedAt,title
```

### Revert rule

A **change** is a PR merged into its repository's default branch, or a
commit on the default branch that is no PR's merge or squash commit. A PR
merged into another branch is no change and is in no cohort. A commit's
title is its subject line and its body is the rest of its message. A
commit is the commit of PR N, not a change of its own, when its SHA is PR
N's merge commit, or its subject ends with ` (#N)` or starts with
`Merge pull request #N`. 1 PR (repository and number) is 1 change, however
often the input holds it; 2 records of 1 PR that differ in any field (title,
body, merge time, author, merge commit, base or default branch) are an
error, not a choice.

A **reference** to PR N of repository `owner/name` is 1 of these forms:

| Form | Resolves to |
| --- | --- |
| `#N` | PR N of the change's own repository |
| `owner/name#N` | PR N of `owner/name` (case-insensitive) |
| `https://github.com/owner/name/pull/N` | PR N of `owner/name` |

A `#N` that follows a letter, a digit, `/` or `&` is no reference, and an
`owner/name#N` that follows a letter, a digit, `.`, `_`, `-` or `/` is
none. In this spec a **letter** is any Unicode letter (`\p{L}`) and a
**digit** any Unicode number (`\p{N}`). A
reference resolves only to a **merged** PR that is in the input of the
computation; a reference to an issue, an open PR, or a PR outside the input
matches nothing.

Change C **reverts** merged PR P when C merged after P, C is not P, and 1
of these is true:

1. **Quoted title.** C's title is `Revert "T"`, where T is P's title, or
   P's title followed by ` (#P)` (the subject of P's squash commit). When
   2 or more merged PRs of C's repository have title T, C reverts by this
   rule only the one that merged last before C, and of 2 merged at the same
   instant the one with the larger number (rules 2 and 3 can still name
   another).
2. **Revert word and reference in the title.** C's title holds a revert
   word and a reference to P, in any order (`Revert #94: …`,
   `revert: undo frostyard/updex#12`, `Revert "Title (#94)"`).
3. **Reverts line in the body.** 1 line of C's body holds a revert word
   and, after it on the same line, a reference to P
   (`Reverts frostyard/core#12`, `This reverts #94.`).

A **revert word** is `revert`, `reverts`, `reverted` or `reverting`, as a
whole word in any case. The rule covers the GitHub "Revert" button
(title rule 1, body rule 3) and a hand-written revert such as
bketelsen/fleet#99, titled `Revert #94: …` with no `Reverts` line, which
reverted bketelsen/fleet#94 (2026-10-28/29). The rule before 2026-11-05
(rules 1 and 3 with `Reverts owner/name#N` only) missed fleet#99.

### Escaped defects

The escaped-defect count is the share of merged PRs that needed a revert
or a named fix soon after merge.

- **Cohort:** the PRs by the given authors (default `frostyard-machines`,
  the agents' machine account) merged into the default branch in a
  half-open UTC window `[from, to)`, in the given repositories.
- **Complete:** a cohort is complete when the computation's `as_of` time is
  at least `to` + 7 days (7 × 24 hours). Then every PR in it had 7 full
  days after its merge. An incomplete cohort has no rate: its escapes are
  not final.
- **Escaped:** PR P of the cohort escaped when a change C (any author, any
  repository of the input) merged in `(P.merged, P.merged + 7 days]` and
  C reverts P (the [revert rule](#revert-rule)) or C names P as fixed.
- **Names P as fixed:** in C's title, or in 1 line of C's body, a fix word
  and a reference to P stand with at most 3 words between them, in either
  order, and no sentence end between them. A **fix word** is 1 of `fix`,
  `fixes`, `fixed`, `fixing`, `fixup`, `hotfix`, `bugfix`, `bug`,
  `regression`, `regressed`, `broke`, `broken`, `breaks`, `breakage`,
  `repair`, `repairs`, `repaired`, as a whole word in any case. A **word**
  is a run of letters, digits, `-` and `_`; 1 reference counts as 1 word. A
  **sentence end** is `.`, `!`, `?` or `;` followed by a space or the line
  end. So `fix: escape the regex broken by #94`, `Fixes #94`,
  `PR #94 broke the regexes` and `fix(#94): …` name #94; `Fixes the typo.
  #94 adds a flag` and `Fixes #12 and builds on top of #94` do not.
- **Rate:** `escaped / merged`, over the cohort; an escaped PR counts once,
  however many changes revert or fix it.

Computed by `scripts/pr-outcomes.mjs` (`node scripts/pr-outcomes.mjs
escaped …`, or `reverts` for the revert list), whose functions in
`scripts/lib/pr-outcomes.mjs` an audit can import. Each escape names the
change and the rule or line that matched, so a reviewer can check it.
Thresholds and minimum samples belong to the review that reads the count,
not to this spec.

### Fleet variant: decided acceptance

A second, fleet-wide number exists beside this one. It is **not** the same
number, and the two MUST NOT be compared or substituted for each other:

```
decided_acceptance = (merged − reverted) / (merged + closed unmerged)
```

| | `acceptance_rate` (this spec) | `decided_acceptance` (fleet) |
| --- | --- | --- |
| Scope | frostyard/core only | every repository the agents work in, one row per repository and one per agent |
| Window | last 30 PRs opened, clipped to 90 days | PRs decided (merged or closed unmerged) in the last 30 days |
| Denominator | PRs opened, including still-open PRs | decided PRs only; open PRs are excluded |
| Reverted | the [revert rule](#revert-rule) | the same rule, per repository |
| Computed by | anyone, from the command above | check Q1 of the daily audit (bketelsen/pi-pocket-team `audit/`), from a daily record of decided PRs summed over 30 days |

Q1 reports the days its 30-day sum covers and the changes it matched as
reverts. Its thresholds and findings belong to the audit, not to this spec.

## Rules

- The window slides by PR count first (last 30 opened), clipped to 90 days —
  a quiet quarter MUST NOT let stale history dominate.
- A reverted PR counts against acceptance even if the revert is itself later
  reverted (churn is the signal).
- Draft PRs are excluded until marked ready.
- The metric is observational: it never gates a merge by itself; gates live
  in the [review rubric](pr-review-rubric.md) and CI.

## References

- Rationale: [ADR-0019](../adr/0019-governance-as-code-and-risk-tiers.md),
  [ADR-0029](../adr/0029-acmm-conformance-via-canonical-aliases.md)
- Context: [design/quality-loop.md](../design/quality-loop.md)
- Code: [scripts/lib/pr-outcomes.mjs](../../scripts/lib/pr-outcomes.mjs),
  [scripts/pr-outcomes.mjs](../../scripts/pr-outcomes.mjs), tests in
  [test/pr-outcomes.test.mjs](../../test/pr-outcomes.test.mjs)
