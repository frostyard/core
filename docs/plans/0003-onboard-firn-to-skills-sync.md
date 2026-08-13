# Firn Skills Sync Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `frostyard/firn` as a skills-sync consumer receiving the default
skills and the `frostyard-go-repo` extra.

**Architecture:** Extend the authoritative repository map in
`.github/skills-sync.json`. The existing sync script will derive Firn's
effective assignment as `defaults + repos.firn`, then create or update its
normal skills-sync pull request.

**Tech Stack:** JSON, jq, Bash, Node.js 20 or newer

## Global Constraints

- Use the unqualified repository slug `firn` under the fixed `frostyard`
  owner.
- Assign `frostyard-go-repo` as Firn's only repository-specific extra.
- Preserve the two existing default skills for every configured consumer.
- Do not change sync script or workflow behavior.

## Phase 1 — Configure and verify Firn

### Task 1: Add the Firn assignment

**Files:**

- Modify: `.github/skills-sync.json:3-13`
- Modify: `docs/design/skills-sync-operations.md:52-57`
- Modify: `docs/README.md:60-64`
- Create: `docs/plans/0003-onboard-firn-to-skills-sync.md`

**Interfaces:**

- Consumes: `.github/skills-sync.json` members `defaults: string[]` and
  `repos: Record<string, string[]>`
- Produces: `repos.firn` with the exact value `["frostyard-go-repo"]`

- [ ] **Step 1: Verify Firn is not already configured**

Run:

```bash
jq -e '.repos | has("firn") | not' .github/skills-sync.json
```

Expected: exit status 0 and output `true`.

- [ ] **Step 2: Add Firn to the repository map**

Add this member to `repos` in `.github/skills-sync.json`:

```json
"firn": ["frostyard-go-repo"]
```

- [ ] **Step 3: Keep the operational design current**

Ensure `docs/design/skills-sync-operations.md` lists `firn` among the current
consumers and states that it receives `frostyard-go-repo` in addition to the
defaults. Keep this plan linked from that design's `Built in` reference.

- [ ] **Step 4: Verify Firn's effective skill assignment**

Run:

```bash
jq -r '(.defaults + .repos.firn) | unique | .[]' .github/skills-sync.json
```

Expected output:

```text
frostyard-acmm-conformance
frostyard-go-repo
frostyard-repo-docs
```

- [ ] **Step 5: Run repository validation**

Run:

```bash
jq empty .github/skills-sync.json
node scripts/check-docs.mjs
```

Expected: both commands exit with status 0; the docs checker reports no
integrity failures.

- [ ] **Step 6: Review and commit the onboarding**

Run:

```bash
git diff --check
git diff -- .github/skills-sync.json docs/design/skills-sync-operations.md docs/plans/0003-onboard-firn-to-skills-sync.md docs/README.md
git add .github/skills-sync.json docs/design/skills-sync-operations.md docs/plans/0003-onboard-firn-to-skills-sync.md docs/README.md
git commit -m "chore: sync skills to firn"
```

Expected: the diff contains only Firn's assignment and its required planning
and operational documentation; the commit succeeds.

- **Done when:** Firn's effective configuration contains all three expected
skills and the docs-integrity gate passes.

## Later / ideas

None.

## Open questions

None.

## References

- Implements: [Skills sync operations](../design/skills-sync-operations.md)
- Rationale:
  [ADR-0026](../adr/0026-distribute-core-skills-via-sync-prs.md)
