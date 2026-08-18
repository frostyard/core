# 0038 — make ci stays canonical; the TestI/Integration name filter is chairlift-only

- **Status:** Accepted
- **Date:** 2026-08-18

## Context

[ADR-0022](0022-make-ci-gate-and-test-naming-filter.md) made two decisions
at once: every Go repo exposes a credential-free `make ci` gate, and unit
and race runs filter tests with `-run "^Test[^I]" -skip "Integration"`,
reserving the `TestI` prefix for environment-requiring integration tests.
The filter was written for chairlift, whose GTK/KVM/root-requiring tests
needed excluding without per-test lists, and it was stated as if it applied
to every repository.

Applied org-wide it does the opposite of what a gate is for. On 2026-08-17
Fluent's discovery workers found, in updex, that two hermetic in-process CLI
tests named `TestCLIIntegration_*` never ran in pull-request CI because the
inherited `-skip "Integration"` matched them — a silently misleading green
(updex issue and pull request pending) — and, separately, that updex's `docs/org-adrs.md`
described a filter its `test.yml` no longer ran while seven ordinary unit
tests carried the reserved `TestI` prefix. Both findings were correct about
their facts and contradicted each other about which document was
authoritative. The name filter is a fragile, invisible convention (ADR-0022
says so itself); it should bind only the repository whose test suite it was
designed for.

## Decision

- **`make ci` remains the canonical gate** for every Go repo, exactly as
  ADR-0022 states: one credential-free target mirroring CI's jobs in CI's
  fail-fast order; environment-requiring tests gate on explicit
  `<PRODUCT>_LIVE_*` / `<PRODUCT>_REQUIRE_*` variables and never sit inside
  the gate.
- **The `-run "^Test[^I]" -skip "Integration"` filter and the `TestI`
  reservation apply to `frostyard/chairlift` only.** No other repository
  filters unit or race runs by test name; every hermetic test runs in the
  gate and in pull-request CI. Environment-requiring tests self-skip through
  the env-var gates above (`t.Skip` unless `<PRODUCT>_LIVE_*` is set), which
  is visible in `go test -v` output where a name filter is not.
- A repository that later needs chairlift's mechanism adopts it through its
  own repo-local ADR that names this one, rather than by inheritance.
- Repositories that list ADR-0022 as binding in `docs/org-adrs.md` update
  the entry to this ADR and remove any restatement of the name filter from
  their `AGENTS.md`; the frostyard-go-repo skill continues to describe
  `make ci` and does not describe the filter.

This ADR supersedes ADR-0022. The `make ci` and env-var-gating decisions are
carried forward unchanged; only the scope of the name filter changes.

## Consequences

- updex and every non-chairlift Go repo run all hermetic tests in PR CI;
  the two `TestCLIIntegration_*` tests start running, and the seven `TestI*`
  unit tests in updex are no longer misnamed.
- chairlift keeps its filter and its `TestI` reservation, now as an explicit
  repo-scoped rule; its reviewers still have to catch `TestI…` unit names.
- Any repo that had adopted the filter by inheritance and relies on it to
  hide slow or environment-bound tests must move those tests behind env-var
  gates; that is a one-time cleanup, and the tests become visible in
  `-v` output.
- `docs/org-adrs.md` in consuming repos and the Fluent architecture-gap
  finding on updex have an unambiguous direction: comply with `make ci`,
  drop the filter, keep the test names.

## Alternatives considered

- **Keep the filter org-wide and rename updex's two tests:** rejected; it
  preserves a mechanism that hides tests silently and forces every repo to
  reason about a regex the ADR itself calls fragile.
- **Delete the filter everywhere including chairlift:** rejected; chairlift's
  suite was built around it and has repo-level invariants that assume the
  narrowed scope (`internal/installcheck`).
- **Amend ADR-0022 in place:** rejected; ADRs are semantically immutable
  ([ADR-0033](0033-link-maintenance-in-immutable-adrs.md) permits link
  maintenance only).

## References

- Supersedes: [ADR-0022](0022-make-ci-gate-and-test-naming-filter.md)
- Shapes: [chairlift `Makefile`](https://github.com/frostyard/chairlift/blob/main/Makefile),
  [updex `test.yml`](https://github.com/frostyard/updex/blob/main/.github/workflows/test.yml),
  the [frostyard-go-repo skill](../../.agents/skills/frostyard-go-repo/SKILL.md)
- Builds on: [ADR-0033](0033-link-maintenance-in-immutable-adrs.md)
