# 0071 — Hold every code repository to one baseline

- **Status:** Accepted
- **Date:** 2026-11-05
- **Amends in part:** [ADR-0043](0043-pin-repository-tools-in-mise-and-name-the-verify-gate.md)
  (core names one Go minor and one golangci-lint version)

## Context

On 2026-11-05, frostyard has 29 active repositories, 3 of them forks
(hotedge, Logomenu, incus). The org's ADRs define most repository surfaces,
but each ADR covers one surface, and the repositories differ:

- 6 repositories have no `AGENTS.md`; 8 have no `docs/` shape.
- 10 have no `.memory/corrections.jsonl`, 15 have no PR template, 15 have
  no Dependabot configuration, 2 have a `SECURITY.md`, and none has a
  `CODEOWNERS` file.
- 7 public repositories have no license. 16 use MIT; chairlift, firn and
  igloo use GPL-3.0, and igloo inherits it from Ptyxis.
- Go repositories set `go` from 1.24.6 to 1.27.1 and pin 5 golangci-lint
  releases, from v2.3.1 to v2.15.0.
- 3 repositories have no `make ci` and 4 have no `make check`.
- The CI entry workflow is `ci.yml` in 11 repositories and `test.yml` in 7.
  Rulesets require checks by job name, not by workflow file name.
- 4 repositories have `.github/risk-paths.json`.
- Trees from earlier agent frameworks remain at repository roots:
  `docs/superpowers/` (4 repositories), `.planning/`, `.cursor/rules/`,
  committed `.claude/` session files, and `yeti/`.
- Every workflow action is pinned by SHA (ADR-0021), and every released Go
  repository except repogen versions with svu (ADR-0012).

A weekly conformance sweep compares each repository with core's ADRs and
specs and files issues with the label `sweep`. It needs one list to compare
against.

## Decision

- **Every frostyard code repository carries the baseline below.** A code
  repository is a non-archived repository in the frostyard organization
  that is not a fork. The [repository baseline spec](../specs/repository-baseline.md)
  is the exact checklist, with 1 check for each item.
- **Items that existing ADRs define** (this ADR adds no new obligation to
  them):
  1. Instruction surface: `AGENTS.md` is canonical; `CLAUDE.md`,
     `GEMINI.md`, `.cursorrules` and `.github/copilot-instructions.md` are
     committed relative symlinks to it (ADR-0018, ADR-0029).
  2. Corrections inbox: `.memory/corrections.jsonl` with the five-field
     schema (ADR-0018).
  3. Docs shape: `docs/README.md`, `docs/adr/`, `docs/design/`,
     `docs/specs/`, `docs/plans/` and `docs/org-adrs.md` (ADR-0025).
  4. Make gate and tool pins: `make verify`, `make check` and `make ci`,
     with `mise.toml` and `mise.lock` at the root (ADR-0043, ADR-0044;
     `make ci` per ADR-0038).
  5. Actions pinned by full commit SHA, with least-privilege permissions
     (ADR-0021).
  6. Risk paths: the repository has `.github/risk-paths.json` and its
     caller workflow (ADR-0068). In a repository that releases or deploys,
     the list covers at least its release and deploy workflows, signing,
     install scripts and privileged helpers.
  7. PR template: `.github/pull_request_template.md` with a risk tier
     section (ADR-0019).
  8. Versions: a released Go repository versions with svu and
     `.svu.yml` (ADR-0012, ADR-0053).
  9. Tool documentation site: a user-facing tool has a ProperDocs and
     MaterialX site in `site/` on GitHub Pages (ADR-0070).
- **New rules:**
  10. License: every public repository has a `LICENSE` file. The default
      is MIT. A repository keeps GPL-3.0 where it inherits it or already
      uses it (chairlift, firn, igloo); no repository is relicensed.
      File-level SPDX headers can differ from the root `LICENSE` (for
      example, LGPL-2.1-or-later headers in bootc-debian, omarchy-apps and
      snosi stay under a root MIT `LICENSE`), and vendored files keep their
      upstream notices (for example, the MIT notice of the `golang-*`
      skills).
  11. Go toolchain: all Go repositories use one Go minor version and one
      golangci-lint version. The `frostyard-go-repo` skill names both, in
      its "Fleet toolchain" section, and the `@go` skills-sync group
      carries the skill to every Go repository. `go.mod` stays the only Go
      pin in a repository, written as a full `1.x.y` with the named minor;
      `mise.toml` pins the named golangci-lint version. The pair moves
      together: core's skill changes first, in one pull request, then each
      repository follows.
  12. CI entry: `.github/workflows/ci.yml` is the workflow that runs
      `make ci` on pull requests. A repository renames its CI workflow file
      only when a pull request touches it for another reason, and keeps its
      job names, which rulesets require. A changed job name needs the
      matching ruleset change at the same time.
  13. Dependabot: `.github/dependabot.yml` has 1 entry for
      `github-actions` and 1 entry for each other Dependabot ecosystem with
      a manifest in the repository (for example `gomod`, `npm`, `cargo`,
      `docker`). The hash-locked `site/requirements.txt` is refreshed with
      `uv pip compile` by the repository-hygiene line, not by Dependabot.
  14. Security policy: `SECURITY.md` names GitHub private vulnerability
      reporting for the repository as the reporting channel and says which
      versions get fixes.
  15. No `CODEOWNERS` file. Each repository has one owner, and review
      routing does not come from the repository.
  16. No leftover agent-framework trees at the repository root:
      `docs/superpowers/`, `.planning/`, `.cursor/rules/`, `.gaai/`,
      `yeti/` and `cairn/`. `.claude/` holds only `settings.json`, the
      `skills` alias and the `session-summary.md` that ADR-0029 names; any
      other committed `.claude/` file is a leftover. The owner folds true
      facts into `docs/` (plans into `docs/plans/`, codebase maps into
      `docs/design/`, rules into `AGENTS.md`), as ADR-0025 does for
      `yeti/`, and deletes the rest.
- **Exemptions:**
  - Forks (hotedge, Logomenu, incus) follow their upstream and are not
    held to the baseline.
  - frostyard-org is a website and homebrew-tap holds only Homebrew
    formulae. Items 3 (docs shape), 9 (tool site), 8 and 11 (Go) do not
    apply to them. The other items do.
  - Libraries (clix, std, snowkit) have no tool site (item 9); pkg.go.dev
    documents them (ADR-0070).
- **This ADR amends ADR-0043 in part.** ADR-0043 says that core checks
  presence, not versions. The organization gate (`npm run check:fleet`)
  still checks presence only. Core now names one Go minor and one
  golangci-lint version (item 11), and the conformance sweep compares each
  repository with them. ADR-0043's other statements stay: `go.mod` is the
  only Go pin, and the Go and lint pair moves in order as one change.
- **Conformance is found by the weekly sweep, not by a migration wave.**
  The sweep reads the baseline spec and files 1 `sweep` issue for each gap,
  within its limit of issues for each repository. Owners fix the gaps in
  their normal work.

## Consequences

- Easier: an owner, a reviewer and the sweep check a repository against
  one list. A new repository starts complete from bketelsen/agentic-template
  when that template carries the baseline files.
- Easier: the Go and lint versions are visible in one place, and
  version drift becomes a sweep finding instead of a surprise in CI.
- Harder: on 2026-11-05 most repositories miss at least 1 item. The gaps
  arrive as sweep issues over several weeks, at most 5 for each repository
  in each sweep.
- New obligations:
  - bketelsen/agentic-template gains `SECURITY.md`,
    `.github/dependabot.yml` and `LICENSE`, so that new repositories start
    with items 10, 13 and 14.
  - The `frostyard-go-repo` skill keeps its "Fleet toolchain" section
    current. The repository-hygiene line proposes each bump of the pair.
  - Core is a code repository and is held to the baseline too.
  - A new baseline item is a new ADR and a new row in the spec.
- Renaming `test.yml` to `ci.yml` stays a low-priority change and never
  happens on its own.

## Alternatives considered

- **No baseline ADR; each existing ADR stays the only source:** new rules
  (license, Dependabot, `SECURITY.md`, Go versions) would have no source,
  and the sweep would have no single list to compare against.
- **A pull request wave to every repository at once:** many pull requests
  at the same time for owners and the organization owner to read, with no ranking by impact.
  The sweep ranks gaps and spreads them across weeks.
- **A mechanical organization gate for every item:** the gate reads only
  enrolled repositories and checks presence; most items need judgment
  (true facts in a leftover tree, a user-facing tool, ecosystems present).
- **Rename every CI workflow to `ci.yml` now:** a rename that also changes
  job names breaks required checks until rulesets change, for no change in
  behavior.
- **Per-repository Go versions:** the fleet spans Go 1.24 to 1.27 and 5
  golangci-lint releases. Shared skills and workers then meet Go and lint
  pairs that no CI run has proven together.

## References

- Shapes: [spec: repository baseline](../specs/repository-baseline.md),
  [design: quality loop](../design/quality-loop.md),
  [frostyard-go-repo skill](../../.agents/skills/frostyard-go-repo/SKILL.md)
- Builds on: [ADR-0012](0012-svu-versioning-and-rolling-dev-prerelease.md),
  [ADR-0018](0018-org-wide-agent-instruction-and-knowledge-surfaces.md),
  [ADR-0019](0019-governance-as-code-and-risk-tiers.md),
  [ADR-0021](0021-sha-pinned-actions-and-least-privilege-ci.md),
  [ADR-0025](0025-consolidate-repository-docs-into-docs.md),
  [ADR-0029](0029-acmm-conformance-via-canonical-aliases.md),
  [ADR-0038](0038-scope-the-test-name-filter-to-chairlift.md),
  [ADR-0043](0043-pin-repository-tools-in-mise-and-name-the-verify-gate.md),
  [ADR-0044](0044-expose-the-make-gate-triad-in-every-repository.md),
  [ADR-0053](0053-name-the-svu-config-svu-yml.md),
  [ADR-0068](0068-label-pull-requests-that-touch-high-risk-paths.md),
  [ADR-0070](0070-build-tool-docs-sites-with-materialx-on-github-pages.md)
- Amended in part by: [ADR-0073](0073-let-ci-run-the-make-ci-targets-as-separate-jobs.md)
  (item 12, CI entry: separate jobs can run the parts of `make ci`)
- Amended in part by: [ADR-0075](0075-batch-routine-pull-requests.md)
  (item 13, Dependabot: each entry groups its version updates)
- Amended in part by: [ADR-0076](0076-require-status-checks-on-every-default-branch.md)
  (item 18, required status checks: row B18)
- Amended in part by: [ADR-0080](0080-document-the-snosi-images-on-frostyard-org.md)
  (exemptions: snosi has no tool site, item 9)
- Amended in part by: [ADR-0081](0081-store-each-correction-in-a-file-of-its-own.md)
