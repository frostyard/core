# 0031 — Retire Dakota's secure bootc installer; firn owns the path

- **Status:** Accepted
- **Date:** 2026-08-12

## Context

- [dakota-iso](https://github.com/frostyard/dakota-iso) builds Frostyard's
  secure Snow media and also supplied a test-only Task 9 adapter suite. Its
  `bootc-secure-installer-runner.sh` booted that media and invoked fisherman;
  companion recovery/update adapters, a shared runner library, tests, and
  documentation supported the same external secure-install harness. The lab
  exercised it through the `run-secure-install-tests` lane.
- [ADR-0027](0027-retire-fisherman-superseded-by-firn.md) made firn the
  bootc installer but recorded secure-install schema-1 as an unported gap.
  Keeping Dakota's adapter and the lab lane was temporary coverage for that
  gap, not a second long-term installer architecture.
- firn now implements schema-1 for bootc
  ([firn ADR-0014](https://github.com/frostyard/firn/blob/main/docs/adr/0014-port-secure-install-schema-1-for-bootc.md)):
  it verifies the image contract, stages the Debian shim, MOK-signed
  systemd-boot, and MokManager chain on the ESP, and stages MOK enrollment
  with `mokutil`.
- The replacement is proven at three levels: unit tests under firn's
  `internal/secureboot`, an enforced-Secure-Boot E2E, and the lab firn
  install matrix. On 2026-08-12, firn v0.3.1 installed and booted all three
  bootc + Secure Boot cells under enforced Secure Boot.

## Decision

**firn is the sole Frostyard installer for secure bootc images; Dakota's
secure bootc installer adapter suite is retired.**

The retired Dakota surface is the test-only Task 9 adapter suite:
`test/bootc-secure-installer-runner.sh`, its recovery/update companion
adapters, the shared runner support, and tests, documentation, or wiring
whose only purpose is that external secure-install lane. The lab
`run-secure-install-tests` WorkflowTemplate, submit manifest, watcher, and
dashboard wiring are retired with it. Firn's `run-firn-install-tests`
matrix owns bootc + Secure Boot install-and-boot coverage.

This does **not** retire dakota-iso's secure image/media-build role. Its
`secure_snosi=1` media assembly, signed boot artifacts, and independent
secure-media validation remain in scope for Dakota until a separate
decision supersedes them. Installed-image update, recovery, and runtime
bootloader reconciliation also remain image-owned responsibilities; this
decision retires only the obsolete external installer adapters that tested
those paths through the Dakota/Fisherman lane.

## Consequences

- Frostyard has one supported secure bootc installation path and one current
  lab owner for it: firn.
- Dakota no longer carries test adapters for an installer it does not own.
  Code shared with secure media construction must be retained or separated
  rather than deleted with the adapters.
- The old lab lane's historical evidence remains in git history; current
  evidence comes from firn's unit, E2E, and matrix coverage.
- **Negative:** the Dakota lane's exact harness-specific assertion and
  reporting shape disappears. Any lifecycle assertion still required for
  the installed image must live with the image or its lab lane, not keep the
  retired installer adapter alive.

## Alternatives considered

- **Keep the Dakota lane as defense in depth:** rejected — it exercises
  fisherman through a second installer surface, so green results would not
  validate the supported firn path and the two implementations would drift.
- **Wrap firn in the Dakota Task 9 adapters:** rejected — firn has its own
  recipe contract, E2E, and lab WorkflowTemplate; preserving the old adapter
  protocol adds indirection without adding coverage.
- **Retire Dakota's secure media build at the same time:** rejected — image
  construction and installer execution are separate responsibilities, and
  firn supersedes only the latter.

## References

- Builds on: [ADR-0027](0027-retire-fisherman-superseded-by-firn.md),
  [ADR-0028](0028-retire-snosi-install-superseded-by-firn.md)
- Replacement:
  [firn secureboot package](https://github.com/frostyard/firn/tree/main/internal/secureboot),
  [enforced-Secure-Boot E2E](https://github.com/frostyard/firn/blob/main/test/e2e-bootc-secure.sh),
  [lab matrix](https://github.com/frostyard/lab/blob/main/argo/firn-install-test.yaml),
  [lab WorkflowTemplate](https://github.com/frostyard/lab/blob/main/argo/workflow-templates/run-firn-install-tests.yaml)
- Retired source:
  [Dakota installer adapter](https://github.com/frostyard/dakota-iso/blob/22dfa973c4e64ef916c2ed53758c87febe1a892d/test/bootc-secure-installer-runner.sh),
  [lab lane removal](https://github.com/frostyard/lab/commit/40bf235bccf5)
- Tracks: [core#59](https://github.com/frostyard/core/issues/59)
