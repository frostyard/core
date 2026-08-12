# 0021 — SHA-pinned actions and least-privilege CI workflows

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

GitHub Actions tags are mutable: `uses: some/action@v4` executes whatever
the tag points at today, which is a supply-chain hole in repos that hold
signing keys and publish OS images. Default workflow tokens are similarly
over-broad.

## Decision

- Every external `uses:` reference is pinned to a **full 40-character
  commit SHA**, with the human-readable version kept as a trailing comment
  (`# vX.Y.Z`). Local `./` actions are exempt. Repos enforce this with an
  in-repo test that scans `.github/workflows/` (chairlift, pilothouse, and
  lab each carry one).
- Workflows start from **`permissions: {}`** (or an explicit minimal
  top-level grant) and grant job-scoped permissions only where needed;
  checkouts set **`persist-credentials: false`** unless the job pushes.
- Version-bump automation (Dependabot/Renovate) updates the SHA and the
  comment together; the comment exists for humans and reviewers, the SHA
  is what executes.
- A scheduled **nightly compliance workflow** re-runs the full check suite
  (and pinning tests) with no secrets, so drift or upstream breakage
  surfaces within a day rather than at the next release.

## Consequences

- An upstream tag hijack cannot execute in frostyard CI; updating an action
  is always a reviewed diff.
- Pinned SHAs go stale without automation — the bump-bot plus nightly runs
  are part of the convention, not optional.
- The publish action itself is consumed cross-repo and must be SHA-pinned
  by callers ([ADR-0010](0010-publish-packages-via-repogen-to-r2.md));
  igloo's `@main` reference is recorded drift.

## Alternatives considered

- **Tag pinning (`@v4`):** mutable; precisely the attack this prevents.
- **Vendoring actions:** heavyweight; SHA-pinning gives equivalent
  immutability with normal update flow.

## References

- Shapes: [pilothouse `docs/workflow-action-pinning.md`](https://github.com/frostyard/pilothouse/blob/main/docs/workflow-action-pinning.md),
  [chairlift `internal/installcheck/workflows_test.go`](https://github.com/frostyard/chairlift/blob/main/internal/installcheck/workflows_test.go),
  workflows across snosi/updex/lab
- Builds on: [ADR-0001](0001-record-architecture-decisions.md)
- Related: [ADR-0010](0010-publish-packages-via-repogen-to-r2.md),
  [ADR-0020](0020-ai-automation-trust-boundaries.md)
