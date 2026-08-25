# 0044 — Expose the make gate triad in every repository

- **Status:** Accepted
- **Date:** 2026-08-24

## Context

[ADR-0043](0043-pin-repository-tools-in-mise-and-name-the-verify-gate.md)
names the gate triad — `make verify` (credential-free, non-mutating),
`make check` (developer, may format), `make ci` (ADR-0022's gate) — for
*every Go repository*. The two Node repositories in the fleet,
`frostyard/snowcat` and `frostyard/core`, adopted the same convention on
2026-08-24 as npm scripts instead (`npm run verify`, `npm run check`), and
every consumer of the gate grew a language branch to cope:

- Snowcat's minted reviewer instructions name `make verify` "when it
  exists"; on 2026-08-24 a reviewer of core#118 ran `make verify` in core,
  got `No rule to make target 'verify'`, fell back to reading the pull
  request's description, and returned a false `block` while the head's
  CI was green.
- The conformance discovery program in Snowcat's catalog says "`make
  verify` where a Makefile declares it, `npm run verify` where
  `package.json` declares it".
- core's `fleet-conventions` check (core#118) carries a Go branch (Makefile
  targets) and a Node branch (`package.json` scripts).
- Snowcat Cockpit's lanes, the `review-snowcat-queue` and
  `work-snowcat-queue` skills, and this repository's own instructions each
  describe the gate twice.

Every worker image already carries `make` in its baseline; `node` and
`npm` are there too. Nothing about the Node repositories requires a
different entry point — only their scripts happen to live in
`package.json`.

## Decision

- **Every enrolled repository exposes `make verify`, `make check`, and
  `make ci` at its root**, whatever its language. These three targets are
  the only entry points CI workflows, Snowcat workers, reviewers, and
  organization checks invoke; a repository's language-specific commands
  (`npm run …`, `go test …`, `cargo …`) live behind them.
- **The targets keep ADR-0043's contracts:** `verify` is credential-free
  and leaves `git status --porcelain` empty; `check` may format; `ci`
  calls `verify` and adds what CI alone runs. A Node repository's
  Makefile wraps its npm scripts (`verify: ; npm run verify`), and the npm
  scripts remain for developers — the Makefile is the contract, not a
  replacement for the tooling.
- **The organization gate checks presence the same way for every
  repository:** `Makefile` with the three targets, plus `mise.toml` and
  `mise.lock` (ADR-0043). No per-language branch, no manifest that names
  the gate.
- **Instructions name `make verify` unconditionally.** A missing target is
  a conformance gap to report, never a reason to skip the gate or to infer
  a check's state from anything but the head's own check runs.

## Consequences

- `frostyard/snowcat` and `frostyard/core` each add a Makefile whose three
  targets wrap their npm scripts (one change each, queue work).
- core's `check-fleet-conventions.mjs` drops its Node branch and requires
  the Makefile targets everywhere; Snowcat's conformance program text,
  reviewer and fix instructions, and the two Snowcat skills drop their
  "where it exists" / "npm run verify" clauses.
- A new repository of any language onboards with the same three targets;
  the `frostyard-onboard-repo` skill's audit gains one line.
- `make` becomes a hard dependency of every gate. It is in the worker
  baseline and on every developer host the fleet has met; a host without
  it fails at the first target with a clear error.
- Developers on Node repositories may keep typing `npm run verify`; only
  automation is required to go through `make`.

## Alternatives considered

- **Keep per-language gate names and document them in a manifest** (an
  execution-profile field or a `gates` file): ADR-0043 already rejected a
  schema for this — presence of a known target is checkable, a manifest
  needs a schema, a validator, and a second thing to drift.
- **A different runner (`just`, `task`) as the universal entry point:**
  not in the worker baseline or on developer hosts; `make` already is, and
  the Go repositories already standardized on it.
- **Teach every consumer both spellings:** that is the status quo that
  produced the false block; each new consumer would need the same branch.

## References

- Shapes: [design/quality-loop.md](../design/quality-loop.md);
  Snowcat [plans/repository-tooling-rollout.md](https://github.com/frostyard/snowcat/blob/main/docs/plans/repository-tooling-rollout.md)
  (Phase 6)
- Builds on: [ADR-0022](0022-make-ci-gate-and-test-naming-filter.md),
  [ADR-0043](0043-pin-repository-tools-in-mise-and-name-the-verify-gate.md)
