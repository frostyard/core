# Spec: Repository baseline

The exact checklist of what every frostyard code repository carries
([ADR-0071](../adr/0071-hold-every-code-repository-to-one-baseline.md)).
The weekly conformance sweep reads this spec at core's `origin/main` and
checks each repository it sweeps against every row that applies; a row
that fails is a `sweep` finding with the row's ID in its key. Owners and
reviewers use the same rows. The organization gate
(`npm run check:fleet`) stays narrower: it checks only the presence part of
B4 (ADR-0043 and ADR-0044), and only for enabled repositories.

## Interface

Each row has an ID (`B1` to `B16`), the rule, its source, and a read-only
check. Run each check in a clone of the repository at the commit you read
(`git ls-tree`, `git show <commit>:<path>`, or `gh api`); nothing writes.

| ID | Item | Rule | Source | Check |
| --- | --- | --- | --- | --- |
| B1 | Instruction surface | `AGENTS.md` is a regular file. `CLAUDE.md`, `GEMINI.md`, `.cursorrules` and `.github/copilot-instructions.md` are committed relative symlinks to it. | [ADR-0018](../adr/0018-org-wide-agent-instruction-and-knowledge-surfaces.md), [ADR-0029](../adr/0029-acmm-conformance-via-canonical-aliases.md) | `git ls-tree <commit> AGENTS.md CLAUDE.md GEMINI.md .cursorrules .github/copilot-instructions.md`: mode `100644` for `AGENTS.md`, mode `120000` for the others, and each link target resolves to `AGENTS.md`. |
| B2 | Corrections inbox | `.memory/corrections.jsonl` exists; each line is a JSON object with exactly `date`, `scope`, `correction`, `evidence`, `promoted_to`. | [ADR-0018](../adr/0018-org-wide-agent-instruction-and-knowledge-surfaces.md) | The file is in the tree; every line parses and has the 5 fields (core's `scripts/check-corrections.mjs` rules). |
| B3 | Docs shape | `docs/README.md`, `docs/adr/`, `docs/design/`, `docs/specs/`, `docs/plans/`, each category with its `TEMPLATE.md`, and `docs/org-adrs.md` that lists the core ADRs that bind the repository. | [ADR-0025](../adr/0025-consolidate-repository-docs-into-docs.md) | The paths are in the tree; `docs/README.md` links `org-adrs.md`. |
| B4 | Make gate and tool pins | The root `Makefile` has the targets `verify`, `check` and `ci`; `ci` runs `verify`. `mise.toml` and `mise.lock` are at the root. | [ADR-0043](../adr/0043-pin-repository-tools-in-mise-and-name-the-verify-gate.md), [ADR-0044](../adr/0044-expose-the-make-gate-triad-in-every-repository.md), [ADR-0038](../adr/0038-scope-the-test-name-filter-to-chairlift.md) | `git show <commit>:Makefile` has a rule for each of the 3 targets, and `git ls-tree --name-only <commit> mise.toml mise.lock` prints both names. |
| B5 | Pinned, least-privilege actions | Every `uses:` in `.github/workflows/` is a 40-character commit SHA with a version comment; each workflow has top-level `permissions: {}` or read-only permissions; checkouts set `persist-credentials: false`. | [ADR-0021](../adr/0021-sha-pinned-actions-and-least-privilege-ci.md) | `git grep -nE 'uses: [^ ]+@' <commit> -- .github/workflows` shows no tag or branch ref (local `./` actions excepted). |
| B6 | Risk paths | `.github/risk-paths.json` (the risk-paths spec format) and the caller workflow exist. In a repository that releases or deploys, the list covers its release and deploy workflows, signing, install scripts and privileged helpers. | [ADR-0068](../adr/0068-label-pull-requests-that-touch-high-risk-paths.md), [risk-paths spec](risk-paths.md) | The file and a workflow that calls core's `risk-paths.yml` are in the tree. When the repository has a release workflow, a deploy workflow or tags, each release or deploy workflow path matches a listed glob. |
| B7 | PR template | `.github/pull_request_template.md` exists and has a risk tier section. | [ADR-0019](../adr/0019-governance-as-code-and-risk-tiers.md) | The file is in the tree and has a heading that contains `Risk tier`. |
| B8 | svu versions | A released Go repository has `.svu.yml` (never `.svu.yaml`) and a `bump` target that tags with `svu next`. | [ADR-0012](../adr/0012-svu-versioning-and-rolling-dev-prerelease.md), [ADR-0053](../adr/0053-name-the-svu-config-svu-yml.md) | The repository has `go.mod` and a release workflow: then `.svu.yml` is in the tree, `.svu.yaml` is not, and the `Makefile` calls `svu`. |
| B9 | Tool documentation site | A user-facing tool has `site/properdocs.yml`, `site/content/`, `site/requirements.in`, a hashed `site/requirements.txt`, `make site` and `make site-serve`, and `.github/workflows/site.yml` that builds in strict mode on pull requests and deploys to GitHub Pages from `main`. `README.md` links `https://frostyard.github.io/<repo>/`. | [ADR-0070](../adr/0070-build-tool-docs-sites-with-materialx-on-github-pages.md) | The paths are in the tree; `site/requirements.txt` has `--hash=` lines; the `site` recipe runs `properdocs build --strict`; `curl -sI https://frostyard.github.io/<repo>/` answers 200. |
| B10 | License | A public repository has `LICENSE`: MIT, or GPL-3.0 where the repository inherits it or already uses it. | ADR-0071 | `gh api repos/frostyard/<repo> --jq .license.spdx_id` is `MIT` or `GPL-3.0`, and `LICENSE` is in the tree. Not a finding: an existing GPL-3.0 license, a file-level SPDX header that differs from the root `LICENSE`, or an upstream notice on a vendored file. |
| B11 | Go toolchain | `go.mod` has `go 1.<minor>.<patch>` with the minor named in the `frostyard-go-repo` skill's "Fleet toolchain" section; `mise.toml` pins the golangci-lint version named there; no other file pins a different golangci-lint version. | ADR-0071, [ADR-0043](../adr/0043-pin-repository-tools-in-mise-and-name-the-verify-gate.md), [frostyard-go-repo](../../.agents/skills/frostyard-go-repo/SKILL.md#fleet-toolchain) | Compare `git show <commit>:go.mod`, `git show <commit>:mise.toml` and `git grep -n 'golangci-lint' <commit> -- Makefile .github/workflows` with the skill at core's `origin/main`. |
| B12 | CI entry | `.github/workflows/ci.yml` runs `make ci` on pull requests: in 1 job, or as separate jobs that together run each prerequisite of the `ci` target as `make <target>` and each command of its recipe. | ADR-0071, [ADR-0073](../adr/0073-let-ci-run-the-make-ci-targets-as-separate-jobs.md) | The file is in the tree and runs on `pull_request`. It has a `make ci` step; or, for each prerequisite of `ci:` in `git show <commit>:Makefile`, a `make <target>` step (extra variables allowed), and each command of the `ci` recipe as a step. A part of `make ci` that no job runs is the finding. A `test.yml` that runs `make ci` is a low-severity finding: rename it only with another change, and keep its job names. |
| B13 | Dependabot | `.github/dependabot.yml` has an entry for `github-actions` and an entry for each other Dependabot ecosystem with a manifest in the repository (`gomod` for `go.mod`, `npm` for `package.json`, `cargo` for `Cargo.toml`, `docker` for a `Dockerfile` or `Containerfile`). | ADR-0071 | Compare the `package-ecosystem` values with the manifests in `git ls-tree -r --name-only <commit>`. `site/requirements.txt` needs no entry. |
| B14 | Security policy | `SECURITY.md` (at the root or in `.github/`) names GitHub private vulnerability reporting for the repository and says which versions get fixes. | ADR-0071, [ADR-0040](../adr/0040-publish-the-repository-settings-contract.md) | The file is in the tree and links `https://github.com/frostyard/<repo>/security`. |
| B15 | No CODEOWNERS | No `CODEOWNERS` file at the root, in `.github/` or in `docs/`. | ADR-0071 | `git ls-tree <commit> CODEOWNERS .github/CODEOWNERS docs/CODEOWNERS` prints nothing. |
| B16 | No leftover agent-framework trees | None of `docs/superpowers/`, `.planning/`, `.cursor/rules/`, `.gaai/`, `yeti/` or `cairn/` at the root. `.claude/` holds only `settings.json`, `skills` and `session-summary.md`. | ADR-0071, [ADR-0025](../adr/0025-consolidate-repository-docs-into-docs.md), [ADR-0029](../adr/0029-acmm-conformance-via-canonical-aliases.md) | `git ls-tree --name-only <commit> docs/superpowers .planning .cursor/rules .gaai yeti cairn` prints nothing, and `git ls-tree --name-only <commit> .claude/` prints no other name. Skill payloads under `.agents/skills/` are not the root. |

## Rules

- A code repository is a non-archived repository in the frostyard
  organization that is not a fork. Every row applies to it unless the
  table below exempts it.
- Exemptions:

  | Repository | Rows that do not apply | Why |
  | --- | --- | --- |
  | hotedge, Logomenu, incus | all | forks that follow their upstream |
  | frostyard-org | B3, B8, B9, B11 | a website, not a tool; it links to tool sites |
  | homebrew-tap | B3, B8, B9, B11 | Homebrew formulae only |
  | clix, std, snowkit | B9 | libraries: pkg.go.dev documents them |
  | lab | B9 | its Astro site is a QA dashboard, not tool documentation |

- The release and deploy part of B6 applies only to a repository that
  releases or deploys; B8 and B11 only
  to a repository with `go.mod`; B9 only to a user-facing tool (a
  repository that ships a command, an application or a service that people
  install); B10 only to a public repository.
- A finding names the row ID, quotes the row's rule, and shows the check's
  output at a named commit. The sweep's key for it is
  `<repo>/baseline-<ID>` (for example `updex/baseline-B13`).
- A row that conflicts with a repository's own accepted ADR is a
  "conflict" finding that quotes both; the sweep does not choose.
- A new row, or a change to a row's rule, comes with a new or amending ADR
  in core.

## References

- Rationale: [ADR-0071](../adr/0071-hold-every-code-repository-to-one-baseline.md),
  [ADR-0070](../adr/0070-build-tool-docs-sites-with-materialx-on-github-pages.md),
  [ADR-0073](../adr/0073-let-ci-run-the-make-ci-targets-as-separate-jobs.md) (row B12)
- Context: [design: quality loop](../design/quality-loop.md)
