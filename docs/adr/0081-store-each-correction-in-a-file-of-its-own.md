# 0081 — Store each correction in a file of its own

- **Status:** Accepted
- **Date:** 2026-11-13
- **Amends in part:** [ADR-0018](0018-org-wide-agent-instruction-and-knowledge-surfaces.md)
  (the `.memory/` bullet: the form of the corrections inbox)
- **Amends in part:** [ADR-0071](0071-hold-every-code-repository-to-one-baseline.md)
  (item 2, corrections inbox)

## Context

ADR-0018 keeps learned corrections in `.memory/corrections.jsonl`: 1 JSON
object for each line, with the fields `date`, `scope`, `correction`,
`evidence` and `promoted_to`, append-only. ADR-0071 item 2 and baseline row
B2 hold every code repository to that file. The quality loop's "Blocker to
guard" rule makes the pull request that fixes a blocking review point add 1
line to it ([design: quality loop](../design/quality-loop.md)).

- On 2026-11-13, 36 repositories have the file, with 838 records in all.
  Every file passes core's `scripts/check-corrections.mjs`. 19 repositories
  run a byte-equal copy of that validator in `make verify`, and in
  `make ci` with `--base`, which also checks that no line is removed or
  changed, except that an empty `promoted_to` is filled. 2
  repositories run their own port of its rules: frostread in Go and
  homebrew-tap in Python. 14 repositories run no check of the file.
- Each new record goes to the end of the same file. 2 open pull requests
  that each add 1 record change the same lines at the end of the file, so
  the second one conflicts after the first one merges. It then needs a
  merge of `main` and a new head, and each new head needs its readiness
  gates again ([ADR-0077](0077-bind-ready-for-human-to-the-head-commit.md)).
- `.gitattributes` `merge=union` does not remove the conflict on GitHub.
  GitHub computes the mergeability of a pull request, the merge button's
  merge and the merge queue's merge on the server, without a working tree,
  and its documentation names no support for merge attributes. With git
  2.47.3, `git merge-tree --write-tree` in a bare clone reports the
  conflict for 2 branches that each append 1 line to a file marked
  `merge=union`; the same merge in a working tree is clean.
- 2 branches that each add a different new file in 1 folder merge without
  a conflict in a bare clone too.
- The pi-pocket-team audit (check Q1) reads the records that a pull request
  adds, to find the guard of each blocking review point in the same pull
  request.

## Decision

- **Each correction record is 1 file in the folder `.memory/corrections/`.**
  This replaces the append-only file `.memory/corrections.jsonl` of
  ADR-0018. The 5 fields, their meaning, the promotion path and the rule
  "never credentials or non-public vulnerability details" stay as ADR-0018
  says.
- **Folder.** `.memory/corrections/` holds only regular files named
  `*.json`, and an optional empty `.gitkeep` for a repository with no
  records. It has no subfolder and no symbolic link. `.memory/README.md`
  stays at its path.
- **File name.** The name matches
  `^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.json$`. The date part
  equals the record's `date`. The slug (the second group) has at most 60
  characters.
  - A record that a pull request adds has the slug `pr-<N>-<words>`, where
    `<N>` is the pull request number, for example
    `2026-11-13-pr-412-cache-key.json`. 2 records in 1 pull request use
    different words.
  - A record without a pull request has a slug of 2 to 5 words and 4
    random hexadecimal characters, for example
    `2026-11-13-agent-scope-rule-3f9a.json`.
  - A slug that starts with `legacy-` is reserved for records that come
    from `.memory/corrections.jsonl` (cut-over, below).
- **File content.** 1 JSON object with exactly the 5 string fields, in
  this order: `date`, `scope`, `correction`, `evidence`, `promoted_to`.
  `date` is a real `YYYY-MM-DD` date. `scope`, `correction` and `evidence`
  are not empty. `promoted_to` is `""` or the path of the rule, document,
  test or skill that the record was promoted to.
- **Canonical form.** The file text is exactly
  `JSON.stringify(record, null, 2) + "\n"`, with the keys in the order
  above. Formatters do not rewrite these files; a repository whose
  formatter reads JSON excludes `.memory/corrections/`.
- **Records are permanent.** A record file is never removed or renamed.
  Its text never changes, except that an empty `promoted_to` is filled
  once.
- **Cut-over.**
  - A repository has `.memory/corrections.jsonl` or `.memory/corrections/`,
    never both. A repository that has neither has no records yet.
  - 1 pull request for each repository moves the file into the folder.
    Line `N` (counted from 1) becomes `<date>-legacy-<NNNN>.json`, with `N`
    in 4 digits (5 digits for a file of more than 9999 lines). Every
    record keeps every field value; only the text form changes to the
    canonical form. The pull request deletes `.memory/corrections.jsonl`.
  - After the folder exists in a repository's default branch,
    `.memory/corrections.jsonl` does not come back there, and no new
    record is added to it.
  - An open pull request that added lines to `.memory/corrections.jsonl`
    before the move merges `main` and converts its added lines to record
    files named `<date>-pr-<N>-<k>.json` (`k` = 1, 2, … in line order). A
    line that `main` already has as a `legacy-` record is not written
    again. A promotion that the pull request made is kept; 2 different
    promotions of 1 record are an error.
- **Validation.** Core's `scripts/check-corrections.mjs` checks the folder
  form (name, content, date, canonical form) and, during the cut-over, the
  old file form. It refuses a tree with both forms. With `--base`, it also
  refuses:
  - a removed or renamed record, and a changed record other than a filled
    empty `promoted_to`;
  - a removed folder, also a folder that held only `.gitkeep`, and a
    removed old file with no folder at the head;
  - the old file at a head whose base has the folder;
  - a new `legacy-` file at a head whose base has the folder;
  - a move that does not keep every line of the base file as its
    `legacy-` record, or that adds a `legacy-` file with no line in the
    base file.

  A base reference that does not resolve, or a Git object that cannot be
  read, is a failure, so the `--base` check never passes without a
  comparison. A repository whose gate runs that validator with `--base`
  enforces the cut-over automatically.
- **This ADR amends ADR-0018 in part.** In its `.memory/` bullet, "an
  append-only `corrections.jsonl` with the fixed five-field schema" becomes
  "a folder `.memory/corrections/` with 1 file for each record, in the
  fixed five-field schema; a record is never removed or renamed, and only
  an empty `promoted_to` is filled". The other statements of ADR-0018
  stay.
- **This ADR amends ADR-0071 in part.** Item 2 becomes "Corrections inbox:
  `.memory/corrections/` with 1 file for each record (ADR-0018,
  ADR-0081)". Until a repository's move merges, its
  `.memory/corrections.jsonl` meets item 2. ADR-0071 adds no obligation to
  item 2, so row B2 of the baseline spec follows this ADR. The other
  statements of ADR-0071 stay.

## Consequences

- Easier: 2 pull requests that each add a record add 2 different files,
  so they never conflict. The guard and its record stay in the same pull
  request, so the review and audit check Q1 still see both together.
- Easier: a promotion changes 1 line of 1 file, and a reviewer reads a new
  record as 1 small file with 1 field on each line.
- Harder: 2 pull requests that fill `promoted_to` of the same record still
  conflict. This is rare: a promotion is 1 pull request after the weekly
  report.
- Harder: readers of the records read a folder instead of 1 file, and they
  read both forms while repositories move, and for old commits after that.
  The order of the change:
  - Before the first move merges in any repository: core's validator and
    `scripts/corrections-report.mjs` read both forms, the pi-pocket-team
    audit check Q1 reads both forms and runs live, and the agent
    instruction rules name both forms. The audit stores each result for
    ever, so a result from the old reader on a moved repository is never
    read again.
  - bketelsen/agentic-template moves first of the 36 repositories, and its
    diff is the pattern for the repositories made from it.
  - The frostread and homebrew-tap ports, and each validator copy, change
    in the move pull request of their own repository.
- New obligations:
  - Core ships validator support for the folder form, a migration script
    that writes the `legacy-` files and the `pr-<N>-<k>` files from 1 old
    file, and a helper that writes 1 record in canonical form. Row B2 of
    the [repository baseline spec](../specs/repository-baseline.md), the
    [quality loop](../design/quality-loop.md), the
    [review rubric](../specs/pr-review-rubric.md), `.memory/README.md` and
    the shared skills change with that code, not with this ADR. Until every
    repository moves, text that tells an agent where to add a record names
    both forms.
  - Each of the 36 repositories gets 1 move pull request from its owner.
    In the 17 repositories whose `.github/risk-paths.json` lists
    `scripts/check-corrections.mjs`, the move updates the validator copy,
    so that pull request is high risk
    ([ADR-0068](0068-label-pull-requests-that-touch-high-risk-paths.md)).
  - The text of all 838 existing records changes to the canonical form;
    every value stays. The validator's `--base` check on each move proves
    that no record is lost or changed.
- Repositories without a `--base` gate (the 2 ports and the 14 without a
  check) do not refuse the old file or a removed record automatically.
  There, the instruction rules, the cross-review and the weekly
  conformance sweep, which reads row B2 at each default branch, are the
  controls. This ADR adds no gate to them.
- An old commit can still hold `.memory/corrections.jsonl`, so the
  report keeps its reader for the old form after every repository moves.

## Alternatives considered

- **`merge=union` in `.gitattributes`:** GitHub's server-side merges do
  not apply it, so the conflict stays on every pull request.
- **Write the records after the merge:** a workflow that writes to `main`
  needs a ruleset bypass, and a second pull request for each record
  doubles the pull requests. The record also leaves the pull request that
  adds its guard, so the review and audit check Q1 cannot see both.
- **Keep the JSONL file and insert each line in date order:** 2 pull
  requests on the same date, or on adjacent lines, still conflict.
- **1 JSONL file for each pull request:** a record without a pull request
  needs a second name rule, and a promotion edits a file with many
  records.
- **Merge `main` into each pull request with the union driver by a bot:**
  each merge makes a new head, which repeats the readiness gates on every
  pull request.
- **Freeze the old file and add new records only to the folder:** every
  reader keeps 2 forms in each repository for ever.

## References

- Shapes: [spec: repository baseline](../specs/repository-baseline.md)
  (row B2), [design: quality loop](../design/quality-loop.md) (Learn
  station), [spec: PR review rubric](../specs/pr-review-rubric.md),
  [`.memory/README.md`](../../.memory/README.md),
  [frostyard-acmm-conformance skill](../../.agents/skills/frostyard-acmm-conformance/SKILL.md),
  [bketelsen/agentic-template](https://github.com/bketelsen/agentic-template)
- Amends in part: [ADR-0018](0018-org-wide-agent-instruction-and-knowledge-surfaces.md),
  [ADR-0071](0071-hold-every-code-repository-to-one-baseline.md)
- Builds on: [ADR-0025](0025-consolidate-repository-docs-into-docs.md),
  [ADR-0033](0033-link-maintenance-in-immutable-adrs.md),
  [ADR-0068](0068-label-pull-requests-that-touch-high-risk-paths.md),
  [ADR-0077](0077-bind-ready-for-human-to-the-head-commit.md)
- Related: [ADR-0029](0029-acmm-conformance-via-canonical-aliases.md)
  (its context names the file; the ACMM criterion needs only `.memory/`)
