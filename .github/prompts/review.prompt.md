# Review a pull request

Review the given frostyard/core PR against the org rubric. You are reviewing,
not merging: never approve-and-merge in one act, and never merge a PR you
authored ([ADR-0019](../../docs/adr/0019-governance-as-code-and-risk-tiers.md)).

1. Read [AGENTS.md](../../AGENTS.md) — the working conventions and
   documentation rules the diff must satisfy.
2. Apply every row of the
   [PR review rubric](../../docs/specs/pr-review-rubric.md)
   (`docs/review-rubric.md` resolves to the same file). Check each row
   independently; cite file and line for every failure.
3. Run the gates the rubric names:
   - `node scripts/check-docs.mjs`
   - if `.agents/skills/frostyard-docs-site/**` changed:
     `node --test .agents/skills/frostyard-docs-site/tests/*.test.mjs`
4. If the diff touches `.github/workflows/`, verify every `uses:` is a
   full 40-char SHA with a `# vX.Y.Z` comment (`# vX.Y` when upstream's
   release tags have 2 parts), `permissions: {}` at top level, and
   `persist-credentials: false` on checkouts
   ([ADR-0021](../../docs/adr/0021-sha-pinned-actions-and-least-privilege-ci.md)).
   A test that guards an action pin (a `uses:` value) reads it from the
   workflow and never names the SHA of a real pin; a PR that removes a
   literal SHA has or adds a repository-wide check of the version comment
   and of 1 SHA for each action
   ([ADR-0088](../../docs/adr/0088-read-the-action-pin-in-workflow-tests-never-hard-code-it.md),
   [ADR-0090](../../docs/adr/0090-scope-action-pins-and-check-them-repository-wide.md)).
5. Confirm the PR body declares a risk tier (highest applicable, never
   lower) in the template's Risk tier section.
6. If the diff adds or edits an ADR, confirm its text states context,
   decision, and consequences as facts only — no narration of who asked, who
   was consulted, or the author's process
   ([ADR-0051](../../docs/adr/0051-adrs-state-facts-not-process.md)). Flag
   any such narration as a rubric failure; it belongs in the PR description,
   not the ADR.
7. Report findings as review comments ordered by severity; state plainly
   when a row passes. A PR with any failing rubric row gets "request
   changes", not silence.
