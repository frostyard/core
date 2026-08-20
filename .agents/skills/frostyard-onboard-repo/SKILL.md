---
name: frostyard-onboard-repo
description: Bring one existing repository into the frostyard fleet end to end — core declaration, canonical surfaces, settings and merge queue, Snowcat enrollment, queue opt-in, and a proven work loop — drafting every file and printing every state-changing command for the operator to run. Use whenever asked to onboard a repository, add a repo to the fleet, or enroll a repository in core or snowcat.
---

# Onboard a repository into core + snowcat

Take one existing repository (code and CI already present) into the fleet:
declared in core's organization authority, carrying the four canonical
surfaces, conformant to the settings contract with a merge queue, `enrolled`
in Snowcat's control plane, opted into the queue — and proven, not presumed:
done means the engine has been observed running one work item for this
repository. The reference this skill follows is the snowcat runbook's
[Onboard a repository](https://github.com/frostyard/snowcat/blob/main/docs/design/queue-operations.md#onboard-a-repository)
section.

**Division of labor (fixed):** the agent drafts every file, opens every pull
request, and runs read-only probes; the OPERATOR runs every state-changing
command — ruleset apply, merge-queue rollout, core activation, snowcat
toggles — from the exact command list this skill prints, in order. Never run
those yourself. Out of scope: de-boarding (a repository leaves the fleet via
a `disabled` declaration, retained forever, never deleted) and platform
bootstrap (host, tailnet, tokens — the snowcat runbook's install sections
own those).

## Steps

1. **Intake — one question at a time.** Collect: the `<owner>/<name>` slug;
   public or private; the accountable owner(s) (GitHub logins/team slugs);
   which maintenance programs the repository should declare, from exactly
   `quality, ci, security, architecture, conformance, triage, dependencies,
   docs, release` (an enabled declaration needs at least one); review gate
   on (recommend on) and foreign-PR cure on (recommend off); the CI check
   contexts to require on the default branch (e.g.
   `"check (node 24),check (node 26)"` or Go equivalents); and any
   skills-sync extras (`frostyard-go-repo` for a Go repository).
2. **Audit, read-only.** Probe and report gaps before drafting anything:
   - `gh api repos/<owner>/<name> --jq '{id,private,default_branch}'` — the
     numeric id becomes the declaration's `repository_id` (as a string); for
     a private repository, confirm the snowcat host's `SNOWCAT_GITHUB_TOKEN`
     can read it, and note that the cure/review sweeps use GraphQL, which
     needs the token even on public repositories.
   - The four canonical surfaces at the default-branch head: `AGENTS.md`,
     `policies/agent-governance.json`, `.agents/skills/` (**a real git tree
     — the enrollment probe reads the tree API, where a symlink is a blob,
     and refuses it**), `docs/README.md`. Missing docs shape or aliases →
     run the `frostyard-repo-docs` / `frostyard-acmm-conformance` /
     `frostyard-go-repo` skills first, as their own pull requests.
   - Every CI workflow that triggers on `pull_request` also triggers on
     `merge_group` — the merge-queue rollout refuses the repository
     otherwise; a missing trigger is one workflow edit, drafted in step 3.
3. **Draft the repository-side pull request.** One PR to the target
   repository: `policies/agent-governance.json` started from core's valid
   fixture (`organization/fixtures/v1/valid/repository-agent-governance.json`)
   — the only per-repository content is the `protected_boundaries` paths;
   every other field is fixed by the schema's constants — plus any missing
   surfaces, aliases, or the `merge_group` trigger from the audit. The
   operator reviews and merges (governance changes are review-required by
   the very policy being added).
4. **Draft the core pull request.** One PR to `frostyard/core`, three files:
   - `organization/repositories/<owner>/<name>.json` — copy an existing
     declaration (snowcat's is the fullest), set identity, owners,
     `fleet_state: "enabled"`, the chosen programs, and the standard
     six-action ceiling.
   - `test/organization-validation.test.mjs` — bump `repositoryCount` (the
     count is pinned; `npm test` fails otherwise).
   - `.github/skills-sync.json` — add the repository with its extras so it
     receives the shared skills.
   Run core's `npm ci && npm run check` before opening. The operator merges.
5. **Print the settings commands.** From a core checkout, for the operator
   (dry-run first — the script prints `WOULD` lines and touches nothing):

       scripts/apply-repo-settings.sh <owner>/<name> --required-checks "<ctx>[,<ctx>…]"
       scripts/apply-repo-settings.sh <owner>/<name> --required-checks "…" --apply
       scripts/rollout-merge-queue.sh <owner>/<name> --apply

   This applies the settings contract (ADR-0040) and merge queue (ADR-0042)
   and creates the `snowcat` import label the timers depend on. The script
   never writes a LICENSE or description — relay its `NOTE` lines.
6. **Print the host activation sequence.** After both PRs merge, for the
   operator on the snowcat host (`set -a; . /etc/snowcat/env; set +a`
   first):

       npm run --silent control -- metadata            # note lastTransactionSequence
       npm run --silent core -- activate <lastTransactionSequence>
       npm run --silent repository -- status           # want "effectiveState": "enrolled"

   `core -- activate` runs the reconciliation pass itself;
   `npm run --silent repository -- reconcile` re-runs it and converges. A
   state other than `enrolled` names what is missing (`awaiting-surfaces`,
   `surface-held`, `github-held`, …); `npm run --silent core -- readiness`
   explains a refusal to activate.
7. **Print the queue opt-in and gates** (the toggles require the opt-in
   first):

       npm run --silent queue -- opt-in <owner>/<name>
       npm run --silent queue -- review-gate <owner>/<name> on
       npm run --silent queue -- cure-foreign <owner>/<name> on   # only if chosen

8. **Verify: prove the loop.** Onboarding is done only when observed:
   - `npm run --silent queue -- seed-dogfood --enrolled` (or the 00:15 UTC
     timer) creates discovery roots for exactly the declared programs — an
     enrolled repository missing the opt-in is reported `notOptedIn`.
   - One item is claimed and completed
     (`npm run --silent queue -- watch --repository <owner>/<name>`, or the
     `/progress` page); with the gate on, its draft pull request passes a
     review round and the artifact verifies.
   - Optionally, label one issue `snowcat` and watch the 15-minute import
     propose it.
   Report the evidence (item ids, event sequences, PR URLs) back to the
   operator; the fleet's timers handle everything from here.

## Pitfalls

- **The declaration count test.** Core's `npm test` pins `repositoryCount`;
  a declaration PR without the test bump fails CI.
- **Toggles before opt-in.** `review-gate`/`cure-foreign` fail with
  `repository is not opted in: <slug>` until `queue -- opt-in` has run.
- **`SNOWCAT_CONTROL_DB` set before enrollment.** With the variable set,
  `claim_work` returns `null` for any repository not yet `enrolled` — items
  look stuck. Check `repository -- status` before suspecting the queue.
- **`.agents/skills` as a symlink.** Fine for local tooling, fatal for
  enrollment: the surface probe requires a real tree at the head.
- **Missing `merge_group` trigger.** `rollout-merge-queue.sh` skips the
  repository and exits nonzero; fix CI first (step 2's audit catches it).
- **Declaring programs the repository can't sustain.** Every declared
  program seeds discovery work on its own cadence; start with the small set
  (`quality, ci, dependencies, docs` is the fleet's floor) and widen by a
  later core PR.
- **Deleting a declaration.** Never — a repository that leaves the fleet is
  set `fleet_state: "disabled"` and retained.
