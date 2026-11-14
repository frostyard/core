# 0073 — Let CI run the `make ci` targets as separate jobs

- **Status:** Accepted
- **Date:** 2026-11-06
- **Amends in part:** [ADR-0071](0071-hold-every-code-repository-to-one-baseline.md)
  (item 12, CI entry)

## Context

ADR-0071 item 12 says that `.github/workflows/ci.yml` is the workflow that
runs `make ci` on pull requests, and baseline row B12 checks that the file
runs `make ci`.

On 2026-11-06, 5 suite repositories (frostmail, frostnotes, frostread,
lodge, porter) run every part of `make ci` on pull requests, but as
separate jobs of `ci.yml`, not as 1 `make ci` step. Their `ci` target
builds the desktop or web app; 1 job that runs `make ci` builds it again
after the app jobs, about 45 minutes in all. The separate jobs run in
parallel and the ruleset requires each job by name.

| Repository | `ci` prerequisites | `ci` recipe | Separate `ci.yml` jobs |
| --- | --- | --- | --- |
| frostmail | `verify ui-check app-test app-build` | `go test -race ./...` | `verify`, `race`, `ui`, `app` |
| frostnotes | `verify ui-check app-build app-test` | `go test -race -timeout 25m ./...` | `verify`, `race`, `ui`, `app` |
| frostread | `verify race cross web-check app-check app-build` | none | `verify`, `race`, `web`, `app` |
| lodge | `verify race cross client-check ui-check shell-check` | none | `verify`, `race`, `client`, `ui`, `shell` |
| porter | `verify race web-check` | none | `verify`, `race`, `web` |

## Decision

- **CI runs `make ci` on pull requests in 1 of 2 forms.** Either a job of
  `.github/workflows/ci.yml` runs `make ci`, or the jobs of `ci.yml`
  together run every part of `make ci`: each prerequisite of the `ci`
  target as `make <target>` (extra variables such as `IN_NSL='sh -c'` are
  allowed), and each command of the `ci` recipe as the same command.
- `make ci` stays the 1 command that a developer, a worker and a reviewer
  run (ADR-0044). A target added to `ci` in the second form needs a job
  step in the same pull request.
- The rest of ADR-0071 item 12 stays: `ci.yml` is the file name, and a
  rename keeps the job names that rulesets require.

## Consequences

- Easier: an app repository keeps its parallel jobs and does not build the
  app twice.
- Harder: in the second form, `ci.yml` and the `ci` target can drift. The
  conformance sweep compares them (baseline row B12); a part of `make ci`
  that no job runs is a finding.
- core's `test/repository-baseline.test.mjs` holds the comparison as the
  function `ciCoverageGaps`, with a fixture for each form.

## Alternatives considered

- **Keep 1 `make ci` step and require it:** each app pull request waits
  about 45 minutes for a second app build, for no new evidence.
- **Exempt the 5 repositories from B12:** an exemption checks nothing, and
  their jobs could stop running a part of `make ci` with no finding.
- **Let each job call `make ci` with a variable that selects a part:** it
  changes 5 Makefiles and their rulesets, and the plain `make ci` stays the
  same.

## References

- Shapes: [spec: repository baseline](../specs/repository-baseline.md)
  (row B12)
- Builds on: [ADR-0071](0071-hold-every-code-repository-to-one-baseline.md),
  [ADR-0044](0044-expose-the-make-gate-triad-in-every-repository.md),
  [ADR-0038](0038-scope-the-test-name-filter-to-chairlift.md)
- Amended in part by: [ADR-0083](0083-run-the-ci-gate-locally-as-make-ci.md)
  (`ciCoverageGaps` lives in `scripts/lib/ci-gate.mjs`; `make a b` runs both targets)
