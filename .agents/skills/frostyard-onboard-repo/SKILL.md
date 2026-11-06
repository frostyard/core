---
name: frostyard-onboard-repo
description: Bring one existing repository into the frostyard fleet end to end — core declaration, canonical surfaces, the Makefile and mise gate, settings and merge queue, and skills-sync enrollment — drafting every file and printing every state-changing command for Brian to run, then proving each part. Use whenever asked to onboard a repository, add a repo to the fleet, declare a repository in core, or enroll a repository in the skills sync.
---

# Onboard a repository into the fleet

Take one existing repository (code and CI already present) into the fleet:
declared in core's organization authority, carrying the four canonical
surfaces and the gate conventions, conformant to the settings contract with a
merge queue, and receiving core's shared skills. Done means each part is
observed, not presumed: `npm run check:fleet` reports the repository `ok`, a
dry run of `apply-repo-settings.sh` reports no change, and the first
skills-sync pull request exists in the repository.

The Snowcat enrollment and queue steps this skill once had are gone: Snowcat
is retired
([core ADR-0064](https://github.com/frostyard/core/blob/main/docs/adr/0064-retire-snowcat.md)).

**Division of labour (fixed).** The agent drafts every file, opens every pull
request, and runs read-only probes. Brian runs every state-changing command
on settings, rulesets, the merge queue and secrets, from the exact list this
skill prints, in order, and merges the pull requests. The machine account
never changes settings, rulesets, secrets or collaborators. Out of scope:
leaving the fleet (a `disabled` declaration, retained, never deleted) and
assigning the repository to an agent's roster (Brian's decision: an ask).

## Steps

1. **Intake, one question at a time.** Collect: the `owner/name` slug;
   public or private; the accountable owner(s) (GitHub logins or team
   slugs); the maintenance programs to declare, from exactly `quality, ci,
   security, architecture, conformance, triage, dependencies, docs,
   release` (start small: `quality, ci, dependencies, docs`); the CI check
   contexts to require on the default branch (compare with `gh pr checks`
   on a recent PR: a name no PR produces makes every merge wait forever);
   and the skills-sync group: `@go` for a Go repository, which is
   `frostyard-go-repo` plus the vendored `golang-*` skills.

2. **Audit, read-only.** Report the gaps before drafting anything:
   - `gh api repos/OWNER/NAME --jq '{id,private,default_branch,archived}'`.
     The numeric `id` becomes `repository_id` (a string). Refuse an archived
     repository.
   - The four canonical surfaces at the default-branch head
     ([enrollment spec](https://github.com/frostyard/core/blob/main/docs/specs/organization-repository-enrollment.md)):
     `AGENTS.md`, `policies/agent-governance.json`, `.agents/skills/` (a real
     git tree, not a symlink: the tree API shows a symlink as a blob), and
     `docs/README.md`.
   - `mise.toml` and `mise.lock`
     ([ADR-0043](https://github.com/frostyard/core/blob/main/docs/adr/0043-pin-repository-tools-in-mise-and-name-the-verify-gate.md)),
     and a root `Makefile` with `verify`, `check` and `ci` targets
     ([ADR-0044](https://github.com/frostyard/core/blob/main/docs/adr/0044-expose-the-make-gate-triad-in-every-repository.md)).
   - Every workflow that runs on `pull_request` also runs on `merge_group`
     ([ADR-0042](https://github.com/frostyard/core/blob/main/docs/adr/0042-adopt-a-merge-queue-on-the-default-branch.md));
     the merge-queue rollout skips the repository otherwise.
   - Missing docs shape or instruction aliases: run the
     `frostyard-repo-docs` (and, if wanted, `frostyard-acmm-conformance`)
     skills first, each as its own pull request. A Go repository receives
     `frostyard-go-repo`, and the rest of the `@go` group, from the skills
     sync.

3. **Repository pull request.** One PR to the repository:
   `policies/agent-governance.json` started from core's valid fixture
   (`organization/fixtures/v1/valid/repository-agent-governance.json`; only
   `protected_boundaries` is per repository), plus any missing surface,
   `mise.toml`/`mise.lock`, Makefile targets, or `merge_group` trigger from
   the audit. Brian reviews and merges it.

4. **Core pull request.** One PR to `frostyard/core`:
   - `organization/repositories/OWNER/NAME.json`: copy a current
     declaration (for example `updex.json`), set the identity, owners,
     `fleet_state: "enabled"`, the programs and the action ceiling.
   - `test/organization-validation.test.mjs`: bump `repositoryCount` (the
     count is pinned; `npm test` fails otherwise).
   - `.github/skills-sync.json`: add the repository with its extras —
     `["@go"]` for a Go repository — and update `groups` only if a new
     group is needed.
   Run `npm ci && npm run check` and `npm run check:fleet` (it fetches the
   new repository's `mise.toml`, `mise.lock` and verify gate) before opening.
   Ask Brian, in the report's asks, to add the repository to the repository
   access of the `SKILLS_SYNC_TOKEN` fine-grained PAT (owned by
   `frostyard-machines`) before this PR merges: the skills sync clones and pushes
   with it ([design/skills-sync-operations.md](https://github.com/frostyard/core/blob/main/docs/design/skills-sync-operations.md)).

5. **Print the settings commands for Brian.** From a core checkout, dry run
   first (the scripts print `WOULD` lines and change nothing):

       scripts/apply-repo-settings.sh OWNER/NAME --required-checks "CTX[,CTX…]"
       scripts/apply-repo-settings.sh OWNER/NAME --required-checks "CTX[,CTX…]" --apply
       scripts/rollout-merge-queue.sh OWNER/NAME
       scripts/rollout-merge-queue.sh OWNER/NAME --apply

   They apply the settings contract
   ([ADR-0040](https://github.com/frostyard/core/blob/main/docs/adr/0040-publish-the-repository-settings-contract.md))
   and the merge queue. Use `--required-check "NAME"` (repeatable) for a
   context that contains a comma, such as a matrix job. The scripts never
   write a LICENSE or description: relay their `NOTE` lines as PRs or asks.

6. **Prove it.** After both PRs merge and Brian ran step 5:
   - `npm run check:fleet` in core reports `ok OWNER/NAME`.
   - The dry run of `apply-repo-settings.sh` with the same checks prints no
     `WOULD` line.
   - The next skills-sync run (a dispatch, the Monday cron, or the merge of
     the core PR) opens `chore: sync agent skills from frostyard/core` in the
     repository, and its CI is green.
   Report the run URLs and PR links.

## Pitfalls

- **The declaration count test.** A declaration PR without the
  `repositoryCount` bump fails core's CI.
- **`.agents/skills` as a symlink.** The surface check needs a real tree,
  and the skills sync refuses a symlinked `.agents` or `.agents/skills`
  before it writes a file: make both real directories before enrollment.
- **Missing `merge_group` trigger.** Every queue entry waits for checks that
  never run; fix CI before the merge queue.
- **Required checks that no PR produces.** Merges block until the check
  times out; copy the names from `gh pr checks`.
- **`SKILLS_SYNC_TOKEN` without access** to the new repository: the sync fails for it
  (since core#177, the run is red, naming the repository).
- **Deleting a declaration.** Never. A repository that leaves the fleet is
  set `fleet_state: "disabled"` and kept.
- **Declaring programs the repository cannot sustain.** Start with the small
  set and widen with a later core PR.
