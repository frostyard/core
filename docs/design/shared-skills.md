# Shared skills

Living document. Rationale:
[ADR-0026](../adr/0026-distribute-core-skills-via-sync-prs.md).
Executable contracts:
[AGENTS.md](../../AGENTS.md) and
[skills-sync.json](../../.github/skills-sync.json).

## Overview

Core maintains reusable, task-specific procedures in `.agents/skills/`.
Contributors discover the applicable procedure through `AGENTS.md`, read its
canonical `SKILL.md`, and apply it from the repository where the task belongs.

```text
AGENTS.md -> canonical core SKILL.md -> consumer sync (when configured)
```

## Design

`AGENTS.md` is the skill index and states when each procedure applies. Use the
linked canonical skill rather than a copied version:

| Skill | Use it for |
| --- | --- |
| [frostyard-acmm-conformance](../../.agents/skills/frostyard-acmm-conformance/SKILL.md) | Bringing a repository to Hive ACMM conformance |
| [frostyard-apt-producer](../../.agents/skills/frostyard-apt-producer/SKILL.md) | Publishing a repository's `.deb` packages through apt-publisher |
| [frostyard-design](../../.agents/skills/frostyard-design/SKILL.md) | Frostyard-branded interfaces and assets |
| [frostyard-docs-site](../../.agents/skills/frostyard-docs-site/SKILL.md) | Adding a ProperDocs + MaterialX documentation site (GitHub Pages) |
| [frostyard-go-repo](../../.agents/skills/frostyard-go-repo/SKILL.md) | Creating or conforming a Frostyard Go repository |
| [frostyard-onboard-repo](../../.agents/skills/frostyard-onboard-repo/SKILL.md) | Onboarding an existing repository into the fleet and the skills sync |
| [frostyard-plan-project](../../.agents/skills/frostyard-plan-project/SKILL.md) | Planning a multi-step project into an approved task graph |
| [frostyard-suite-app-release](../../.agents/skills/frostyard-suite-app-release/SKILL.md) | Releasing a suite app's Flatpak and its daemon's sysext |
| [frostyard-write-adr](../../.agents/skills/frostyard-write-adr/SKILL.md) | Writing, accepting, amending or superseding an ADR |
| `golang-*` (20 skills, [list](#vendored-go-skills)) | General Go practice in Go repositories, vendored from samber/cc-skills-golang |
| [frostyard-repo-docs](../../.agents/skills/frostyard-repo-docs/SKILL.md) | Maintaining a repository's documentation tree |

Core owns the canonical copy of every managed skill. A consumer directory with
a `.synced-from-core` marker is core-managed: do not edit it in the consumer,
because the next sync replaces local changes. Make reusable, organization-wide
changes in core; make repository-specific procedures as consumer-local skills.

Only repositories named in
[skills-sync.json](../../.github/skills-sync.json) receive managed skills.
The default assignments apply to every listed consumer, while the repository
entry adds any extra skills. A skill being present in core does not by itself
make it available in every consumer.

## Vendored Go skills

Core vendors 20 general Go skills from
[samber/cc-skills-golang](https://github.com/samber/cc-skills-golang)
(MIT) at commit `bb1d43d98a3f8ab639a0042f90d0ec524e39a477`. Each lives in
`.agents/skills/golang-<name>/` with the upstream `LICENSE`, its `SKILL.md`
and the `references/` files it links. `evals/` and `assets/` are not
vendored. Upstream's `golang-cli/assets/examples/` Go files are vendored as
1 Markdown file, `golang-cli/references/examples.md`, because a managed
skill must hold no `.go` file or `go.mod`: consumer guards, gofmt and lint
walk the repository. `test/managed-skills-go-free.test.mjs` enforces it.
The skills sync delivers them, with
`frostyard-go-repo`, only to Go repositories: the `@go` group in
[skills-sync.json](../../.github/skills-sync.json)
([skills sync operations](skills-sync-operations.md#configuration-contract)).

### Selection

| Vendored | Why |
| --- | --- |
| `golang-code-style` | Style rules for every Go change |
| `golang-naming` | Naming rules for every Go change |
| `golang-error-handling` | Error creation, wrapping and logging |
| `golang-concurrency` | Goroutines, channels and sync primitives |
| `golang-context` | `context.Context` propagation; SDK methods take a context |
| `golang-testing` | Table-driven tests, fuzzing, coverage |
| `golang-stretchr-testify` | testify in pilothouse (direct dependency) |
| `golang-lint` | golangci-lint use and `nolint` rules |
| `golang-modernize` | Current Go idioms (`frostyard-go-repo` asks for them) |
| `golang-safety` | Nil, aliasing and conversion bugs |
| `golang-security` | Injection, crypto, path traversal, gosec |
| `golang-performance` | Optimization patterns after profiling |
| `golang-troubleshooting` | Root-cause debugging, race detection, Delve |
| `golang-structs-interfaces` | Type and interface design |
| `golang-data-structures` | Slices, maps and containers |
| `golang-documentation` | Godoc comments and examples |
| `golang-cli` | CLI structure, exit codes, I/O, signals |
| `golang-spf13-cobra` | cobra, which every frostyard CLI uses through clix |
| `golang-project-layout` | Module and package layout |
| `golang-dependency-management` | `go.mod`, upgrades, govulncheck |

| Not vendored | Why |
| --- | --- |
| `golang-benchmark` | `golang-performance` covers the method; its CI regression setup adds tools and workflows |
| `golang-gopls` | Needs a gopls MCP server or a Claude Code plugin; the longest description |
| `golang-refactoring` | Its workflow uses stacked PRs, which the org's squash merges forbid, and leans on gopls |
| `golang-continuous-integration` | Its templates hold Dependabot auto-merge and an AI review workflow, against core's rules |
| `golang-dependency-injection`, `golang-google-wire`, `golang-uber-dig`, `golang-uber-fx` | No frostyard repository uses a DI library |
| `golang-samber-do`, `-hot`, `-lo`, `-mo`, `-oops`, `-ro`, `-slog` | The author's own libraries; no frostyard repository uses them |
| `golang-graphql`, `golang-grpc`, `golang-swagger` | No frostyard repository serves these APIs |
| `golang-database` | No frostyard repository uses `database/sql` |
| `golang-observability` | No frostyard repository exports metrics or traces |
| `golang-spf13-viper` | Only clix uses Viper; consumers get configuration from clix |
| `golang-design-patterns` | Overlaps `golang-structs-interfaces` and `frostyard-go-repo`; leans on the DI skills |
| `golang-how-to` | Writes an always-load directive into a repository's agent files |
| `golang-pkg-go-dev` | A research helper with its own tool dependencies |
| `golang-popular-libraries` | A library catalogue; a new dependency needs the owner's approval |
| `golang-stay-updated` | News feeds, not repository practice |

### Overrides

Core's ADRs, a repository's `AGENTS.md` and `frostyard-go-repo` win over a
vendored skill. Each `SKILL.md` opens with an attribution and a
**Frostyard override** block that says so; `grep -rn "Frostyard override"
.agents/skills/golang-*` lists every edit. The changes from upstream are:

- Every skill: the `allowed-tools` front-matter field is removed (it
  pre-approves `Bash(git:*)` and similar in Claude Code); description pointers
  to unvendored skills are removed and `samber/cc-skills-golang@golang-x`
  becomes `golang-x`; tools are pinned in mise
  ([ADR-0043](../adr/0043-pin-repository-tools-in-mise-and-name-the-verify-gate.md)),
  never `go install …@latest`, `go get -tool` or `brew`; the gate is
  `make verify`/`check`/`ci`
  ([ADR-0044](../adr/0044-expose-the-make-gate-triad-in-every-repository.md));
  a third-party module a skill suggests needs the owner's approval.
- `golang-cli`: upstream's `assets/examples/` Go files are 1 Markdown file,
  `references/examples.md`, with the code unchanged in fenced blocks, so no
  managed skill holds a `.go` file or `go.mod`
  (`test/managed-skills-go-free.test.mjs`).
- `golang-error-handling`: standard-library wrapping per
  `frostyard-go-repo`; no `samber/oops` or `samber/slog-*`.
- `golang-testing` and its `integration-testing.md`: live-environment tests
  self-skip on `<PRODUCT>_LIVE_*`
  ([ADR-0038](../adr/0038-scope-the-test-name-filter-to-chairlift.md)), not
  a `//go:build integration` tag; assertions follow the repository.
- `golang-stretchr-testify`: only where testify is a direct dependency.
- `golang-lint`: the repository's own `.golangci.yml` (from updex) decides;
  upstream's recommended configuration is not vendored; no extra Makefile
  targets.
- `golang-modernize` and its `tooling.md`: `go.mod` holds the only, full
  `1.x.y` Go pin and moves with golangci-lint as one change; actions stay
  SHA-pinned ([ADR-0021](../adr/0021-sha-pinned-actions-and-least-privilege-ci.md));
  no AI review workflow
  ([ADR-0020](../adr/0020-ai-automation-trust-boundaries.md)).
- `golang-documentation` and its references: the `docs/` shape of
  `frostyard-repo-docs`
  ([ADR-0025](../adr/0025-consolidate-repository-docs-into-docs.md));
  `CONTRIBUTING.md` stays a symlink to `AGENTS.md`
  ([ADR-0029](../adr/0029-acmm-conformance-via-canonical-aliases.md)); no
  `CHANGELOG.md` (GoReleaser groups) and no `llms.txt` without approval;
  install docs name the APT repository
  ([ADR-0055](../adr/0055-publish-debian-packages-through-the-apt-publisher.md)).
- `golang-cli`, `golang-spf13-cobra` and `golang-project-layout`
  (`config.md`, `directory-layouts.md`): clix and the SDK-first layout of
  `frostyard-go-repo`; no `pkg/`, no Viper layering, no always-load
  directive written into agent files.
- `golang-dependency-management` and its `automated-updates.md`: tools in
  mise, not `tool` directives; nothing auto-merges
  ([ADR-0042](../adr/0042-adopt-a-merge-queue-on-the-default-branch.md)).
- `golang-performance`: the example alert rules are not vendored.
- Link fixes: links to assets that are not vendored become plain text;
  `golang-documentation` links `#readmemd` and `#distribution`, and
  `golang-troubleshooting/references/methodology.md` links `../SKILL.md`
  (upstream's anchors and path do not resolve).
- Code spans: core's docs gate reads a generic call such as
  `errors.AsType[T]` with its argument list in 1 code span as a link.
  `golang-error-handling`, `golang-safety` and
  `golang-modernize/references/versions.md` write those 3 generic calls as
  the code span `X[T]` followed by `(v)`, each with a marked HTML comment.
  A refresh keeps these edits until the gate learns code spans.

### Description budget

A session loads each skill's `description`. The 20 vendored descriptions
total 10,437 characters (upstream: 12,195 for the same 20). A Go
repository's session loads them; so does a session in core, where they also
sit in `.agents/skills/`.

### Refresh from upstream

Refresh about once a quarter, or when a Go release changes the advice
(a repository-hygiene pass is a good moment). In one pull request:

1. Clone upstream and pick the new commit `NEW`; the old one is `OLD` (the
   SHA above and in each attribution line).
2. For each vendored skill, apply only upstream's change:
   `git -C <upstream> diff OLD NEW -- skills/golang-<name>/SKILL.md
   skills/golang-<name>/references | git apply -p2
   --directory=.agents/skills --reject`. For `golang-cli`, diff
   upstream's `skills/golang-cli/assets/examples` by hand and copy the
   changes into the fenced blocks of `references/examples.md`; `git apply`
   must never create a `.go` file there. The overrides are small and
   marked, so most hunks apply; resolve each `.rej` file by hand in favour
   of the override, then delete it.
3. Read upstream's diff for new advice that conflicts with core and add a
   marked override for it; re-check new description pointers.
4. Replace `OLD` with `NEW` in every attribution line and in this section;
   update the description budget.
5. Run `make verify` and a cross-review. After the merge, the sync opens
   the consumer pull requests.

## Operational notes

When a skill is missing from a consumer, first determine whether the procedure
is broadly reusable. For shared work, update the canonical core skill and its
sync assignment. For work unique to that repository, add a consumer-local
skill instead. See [skills sync operations](skills-sync-operations.md) for
the sync lifecycle and recovery procedures.

The `.claude/skills` path is a symlink to `.agents/skills`; edit and link the
canonical `.agents/skills` path so all supported agents see the same content.

### Handling a sync pull request

A sync pull request (`chore: sync agent skills from frostyard/core`, branch
`chore/sync-core-skills`) carries content that was already reviewed and
cross-reviewed in core. Brian made a standing exception to the cross-review
rule for it on 2026-11-01: the repository's owner handles it with a tree
check instead.

1. Resolve the consumer's physical skills path first: `.agents/skills/`,
   or the in-repository target of an `.agents` symlink (chairlift and
   pilothouse use `docs/agents/skills/`).
2. Every file the pull request changes lies under one of that consumer's
   managed skill directories (`defaults` plus its extras in
   [skills-sync.json](../../.github/skills-sync.json)).
3. For each managed directory, the recursive tree entries at the pull
   request's head equal those of `.agents/skills/<name>/` at core's current
   `main`: the same relative paths, no extra and no missing entry (a file
   that `rsync --delete` removed is absent on both sides), and the same
   mode, type and object SHA per entry. `gh api
   repos/OWNER/REPO/git/trees/SHA?recursive=1` lists `path`, `mode`, `type`
   and `sha` for both sides. The `.synced-from-core` marker exists only on
   the consumer side; check it separately: its content is the 2 lines
   `scripts/lib/skills-sync-containment.sh` writes for that skill.
4. The repository's CI is green at that head.

When all 4 hold, the owner adds `ready-for-human`. A new push to the sync
branch (each core skill change force-updates it) means the label comes off
until the check passes again at the new head. A pull request that fails the
check is not edited on the reserved branch: fix core, or dispatch the sync
again. Do not close a needed sync pull request: the next run creates
another one.

## References

- Rationale:
  [ADR-0026](../adr/0026-distribute-core-skills-via-sync-prs.md);
  [ADR-0070](../adr/0070-build-tool-docs-sites-with-materialx-on-github-pages.md)
  (the `frostyard-docs-site` skill);
  [ADR-0071](../adr/0071-hold-every-code-repository-to-one-baseline.md)
  (the Fleet toolchain table in `frostyard-go-repo`, carried by `@go`)
- Operations: [Skills sync operations](skills-sync-operations.md)
- Built in:
  [Plan 0001, Phases 1-2](../plans/0001-docs-shape-rollout.md)
