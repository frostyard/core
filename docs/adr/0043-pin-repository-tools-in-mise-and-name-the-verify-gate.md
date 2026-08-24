# 0043 — Pin repository tools in mise and name the verify gate

- **Status:** Accepted
- **Date:** 2026-08-24

## Context

Three fleet repositories (`std`, `clix`, `updex`) each pin `golangci-lint`
as a Makefile variable; `std`'s CI `sed`s that variable out to feed its
lint action. Nothing can *install* from a Makefile variable, so the worker
image Snowcat Cockpit runs was qualified against nothing: `std` and `clix`
skipped lint when the binary was absent (the gate passed while the PR
template claimed lint was clean), `updex` refused to run, and one campaign
lost four workers to in-lease toolchain downloads. On 2026-08-24 the fleet
was also silently split — `std` on 2.13.1, the others on 2.12.2 — and the
same day surfaced the Go/lint seam twice: `std`'s `go.mod` moved to 1.26.7
ahead of the image's 1.26.6, and golangci-lint 2.13.1 embeds Go 1.27's
`gofmt`, which formats one `updex` file differently from Go 1.26's, each
rejecting the other's form.

Read-only reviewers had no safe gate either: `make check` runs `gofmt -w`
in every sample repository, so a reviewer granted no write mutated the
checkout by validating it.

Snowcat's [ADR-0076](https://github.com/frostyard/snowcat/blob/main/docs/adr/0076-pin-repository-tools-in-the-repository-and-qualify-lanes-by-running-them.md)
supersedes an earlier design in which core would own a versioned
execution-profile schema per repository; that design duplicated every pin
in a third file and let a repository declare a tool optional. This ADR is
the core side of the replacement: a convention core names and checks, with
the versions owned by each repository.
[ADR-0022](0022-make-ci-gate-and-test-naming-filter.md) already makes
`make ci` the credential-free gate;
[ADR-0023](0023-verified-pinned-downloads.md) already requires pinned,
checksum-verified downloads with an update check per pin.

## Decision

- **Tool pins live in `mise.toml` with a committed `mise.lock` at the
  repository root.** Every executable a gate invokes beyond the published
  worker base-image baseline is declared there; `mise.lock` is the
  repository's ADR-0023 checksum registry for tools, and `mise outdated`
  (or Renovate's mise manager) is its update check.
- **`go.mod` is the only Go pin**, written as a full `1.x.y` (never a
  floating `1.x`). mise reads it through
  `idiomatic_version_file_enable_tools = ["go"]`; no repository pins Go a
  second time.
- **No tool is optional.** A gate that invokes a tool requires it: `make
  lint` and the gates fail with the install command when the tool is
  absent, never "skipping".
- **Every Go repository exposes the gate triad:** `make verify` —
  credential-free and non-mutating (`go mod tidy -diff`, `gofmt -l`, `go
  vet`, the pinned linter, tests), what a read-only reviewer runs; `make
  check` — the developer gate, which may format; `make ci` — ADR-0022's
  gate, which calls `verify` and adds coverage, race, and cross-builds.
  Conformance is mechanical: `verify` on a clean checkout leaves `git
  status --porcelain` empty.
- **Bump the Go/lint pair in order, as one change:** a `golangci-lint`
  release built with Go N lands before `go.mod` moves to N. CI on that one
  pull request is the compatibility proof; no worker runs a pair CI has
  not passed.
- **Worker images descend from one published base.** Every executor image
  is `ghcr.io/frostyard/snowcat-worker-base` or `FROM` it; the baseline the
  base guarantees is a versioned file in the image's repository, so
  "beyond the baseline" is checkable. A repository that needs what mise
  cannot install (system packages) extends the base with its own image.
- **Core checks presence, not versions.** The organization gate verifies
  that an enabled Go repository has `mise.toml`, `mise.lock`, and the three
  targets; it never reads or compares a version, and the repository
  surfaces contract gains no execution-profile schema.

## Consequences

- A version bump is a one-file change in one repository, and its pull
  request's CI proves the Go/lint pair before any executor sees it.
- The "gate passed but lint never ran" class closes in the gate itself.
- Read-only review is safe by construction: `make verify` is named in
  Snowcat's minted reviewer instructions, and a mutating `verify` is a
  conformance failure a future program can detect mechanically.
- Every Go repository takes one adoption change (`mise.toml`, `mise.lock`,
  the `verify` target, CI installing from the same files); core distributes
  the shared pieces the way it distributes skills
  ([ADR-0026](0026-distribute-core-skills-via-sync-prs.md)).
- Two assumptions are tested by the `std` pilot in Snowcat's rollout plan
  before fleet-wide adoption: that `mise.lock` records URL and checksum for
  every tool and refuses a mismatch, and that mise resolves Go from
  `go.mod` exactly. The plan names the fallback for each (a sibling
  checksum file; `GOTOOLCHAIN=auto` with a prep-time warm).
- Until every enrolled repository declares its linter, the worker base
  image carries the fleet's pinned `golangci-lint` and tracks the highest
  `go` directive in the fleet — a stopgap Snowcat's rollout plan retires.

## Alternatives considered

- **A core-owned execution-profile schema per repository (Snowcat
  ADR-0075):** a third copy of every pin, nothing installable from it, and
  `optional` legitimised the failure mode; superseded by Snowcat ADR-0076.
- **A bespoke `tools.json`:** would need its own installer, CI action, and
  image glue; mise supplies install, missing-tool listing, a checksum lock,
  and an update check for every language the fleet uses.
- **Go `tool` directives:** Go-only, and golangci-lint discourages that
  install path because module merging changes lint results.
- **Pin versions in core:** every bump would then cross two repositories'
  review rules and re-trigger unrelated consumers — the blast-radius
  problem ADR-0023's per-consumer registries exist to avoid.

## References

- Shapes: [design/quality-loop.md](../design/quality-loop.md);
  Snowcat [plans/repository-tooling-rollout.md](https://github.com/frostyard/snowcat/blob/main/docs/plans/repository-tooling-rollout.md)
  (Phases 3, 5–7)
- Builds on: [ADR-0022](0022-make-ci-gate-and-test-naming-filter.md),
  [ADR-0023](0023-verified-pinned-downloads.md),
  [ADR-0026](0026-distribute-core-skills-via-sync-prs.md),
  [ADR-0040](0040-publish-the-repository-settings-contract.md); Snowcat
  [ADR-0076](https://github.com/frostyard/snowcat/blob/main/docs/adr/0076-pin-repository-tools-in-the-repository-and-qualify-lanes-by-running-them.md)
