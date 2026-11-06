# Problem reports

Living document. Rationale: [ADR-0069](../adr/0069-report-problems-local-first-opt-in-with-one-sender-per-host.md),
[ADR-0074](../adr/0074-publish-verified-fault-records-as-public-issues.md).
Contracts: [specs/problem-report.md](../specs/problem-report.md).

## Overview

Snosi hosts collect problems locally and show them to the user or admin. A
host sends reports only after its user or admin opts in, through 1 sender per
host. Reports go through an intake Worker, which drops the client IP, to a
private store. frostyard.org publishes the schema and weekly aggregates.

```
app (std problems, Go or Rust) ──► local journal (MESSAGE_ID, FROSTYARD_*)
system sources ──► snosi-health ──► /var/lib/snosi-health/problems.json
                                         │
          chairlift Problems page ◄──────┤ (desktops: snow, snowfield, sundog)
          snosi-health --list     ◄──────┘ (floe)
                  │ opt-in only
                  ▼
   report.frostyard.org (Worker: schema check, IP drop, rate limit)
                  │                         │
                  ▼                         ▼
     private store (raw, < 90 days)   weekly aggregates ──► frostyard.org
```

## Design

| Piece | Repository | Role |
| --- | --- | --- |
| Schema `frostyard.problem/1`, `MESSAGE_ID`, field and enum registry | frostyard/core | The 1 contract ([spec](../specs/problem-report.md)) |
| Go package `github.com/frostyard/std/problems` and Rust crate `frostyard-problems` | frostyard/std | Write app records to the journal; read them back with the trusted journal fields |
| updex last-run record | frostyard/updex | Says why a sysext feature update failed (an input of S4) |
| `snosi-health` | frostyard/snosi | Root collector on all 4 images; `--list`; the Floe sender with admin consent |
| Problems page and desktop sender | frostyard/chairlift | Local list; per-user consent; the only sender on desktops |
| Intake Worker and aggregation | frostyard/problem-intake | Schema check, IP drop, rate limit, forward to the store, weekly aggregates |
| Privacy page, schema copy, stats page | frostyard/frostyard-org | Publishes the schema, retention, sources and aggregates |

- **Records.** An app records a panic or a coded error as 1 journal entry with
  the fixed `MESSAGE_ID`. The error text stays in `MESSAGE`; only the
  `FROSTYARD_*` values can reach a report. Records from user processes are in
  the user journal, which chairlift reads; records from system services are
  in the system journal, which `snosi-health` reads.
- **System problems.** `snosi-health` runs as root from a timer, reads the
  system sources (failed units, update state, bootc status, the updex
  last-run record, TPM unlock lines, integrity errors, systemd-coredump) and
  writes only report fields to a world-readable file. Readable details stay
  in a file for the `sudo` group or in the journal.
- **Sending.** The sender builds a document that the schema accepts, shows it
  before the first send (chairlift) or prints it under `--dry-run`
  (`snosi-health send`), and records each `report_id` locally.
- **Validation in depth.** Writers map unknown values to `other`; readers
  drop records that fail the spec; the Worker rejects a document that fails
  the schema.
- **Public fault issues.** A triage job in frostyard/problem-intake may open
  1 public GitHub issue (label `problem-report`) for each problem key in the
  repository that owns the faulty code. It publishes only the closed list of
  public fields of
  [ADR-0074](../adr/0074-publish-verified-fault-records-as-public-issues.md),
  each verified against a public source, and only for problems first seen on
  or after the cutoff that the frostyard.org privacy page states. The job is
  not built yet; frostyard/problem-intake `docs/specs/triage.md` will hold its
  contract.

## Operational notes

- A schema change follows rule 5 and rule 6 of the spec: a new version file,
  the Worker deploys it first, then sender releases use it.
- `test/problem-report-schema.test.mjs` in core pins the sha256 of `v1.json`
  and validates the examples in `docs/specs/schemas/problem-report/examples/`.
- With no journal socket, an app records nothing and reports no error.

## References

- Rationale: [ADR-0069](../adr/0069-report-problems-local-first-opt-in-with-one-sender-per-host.md),
  [ADR-0074](../adr/0074-publish-verified-fault-records-as-public-issues.md)
- Contracts: [specs/problem-report.md](../specs/problem-report.md)
- Built in: the problem-reporting plan of the Desk, which tracks the work in
  each repository listed above
