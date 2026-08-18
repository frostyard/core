# 0022 — make ci is the canonical gate; TestI* is a reserved test-name prefix

- **Status:** Superseded by [0038](0038-scope-the-test-name-filter-to-chairlift.md)
- **Date:** 2026-08-11

## Context

Frostyard Go repos are worked on by agents and humans who need one local
command whose green result predicts CI green. Some tests need credentials,
GTK, KVM, or root; unit gates must exclude them without maintaining
per-test lists. The mill's deep gate also needs a single target to invoke
per repo.

## Decision

- Every Go repo exposes **`make ci`** (or `make docker-ci`): a single,
  credential-free target that mirrors CI's jobs in CI's fail-fast order
  (tidy → vet → gofmt → lint → unit → race → cross-arch build). Anything
  needing credentials, KVM, network, or a display lives in separate
  workflow files or explicitly separate targets — never inside the gate.
  The mill's `.mill.toml` deep gate invokes this target.
- Unit and race runs filter tests with
  **`-run "^Test[^I]" -skip "Integration"`**. Consequence elevated to a
  rule: **the `TestI` prefix is reserved** for environment-requiring
  integration tests. Ordinary tests must never be named `TestIs…`,
  `TestInit…`, `TestIndex…` etc. — they would be silently skipped, a false
  green.
- Live-host tests gate on explicit env vars
  (`<PRODUCT>_LIVE_<TOOL>=1`), and where a tool is expected present, an
  explicit `<PRODUCT>_REQUIRE_*` variable turns "skip if missing" into a
  failure so CI images cannot silently skip.

## Consequences

- "Local green ⇒ CI green" is a maintained invariant; agents run one
  command before pushing.
- The regex-based reservation is fragile and invisible — this ADR plus
  per-repo AGENTS.md notes are the guardrails; reviewers must catch
  `TestI…` unit-test names.
- Where the gate's test scope is narrowed (e.g. `./internal/...` only),
  repo-level invariants must be asserted by test packages *inside* that
  scope (chairlift's `internal/installcheck` pattern), and coverage claims
  must be read against the actual scope.

## Alternatives considered

- **Build tags for integration tests:** cleaner semantics, but invisible in
  `go test ./...` runs and historically inconsistent across the repos; the
  name-filter convention was already de-facto shared.
- **Per-repo bespoke CI scripts:** exactly the drift a canonical target
  removes.

## References

- Shapes: [chairlift `Makefile`](https://github.com/frostyard/chairlift/blob/main/Makefile),
  [pilothouse `Makefile`](https://github.com/frostyard/pilothouse/blob/main/Makefile),
  [updex `test.yml`](https://github.com/frostyard/updex/blob/main/.github/workflows/test.yml),
  the [frostyard-go-repo skill](../../.agents/skills/frostyard-go-repo/SKILL.md)
- Builds on: [ADR-0012](0012-svu-versioning-and-rolling-dev-prerelease.md)
