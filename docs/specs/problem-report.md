# Spec: Problem report `frostyard.problem/1` and the problem-record registry

This contract governs 2 things. The first is the JSON document that a snosi
host sends when its user or admin opted in to problem reporting: schema
`frostyard.problem/1`, in
[schemas/problem-report/v1.json](schemas/problem-report/v1.json). The second is
the registry of the local journal records that frostyard apps write: the fixed
`MESSAGE_ID`, the `FROSTYARD_*` fields and every enum. Consumers: the std
`problems` Go package and the Rust crate `frostyard-problems` (writers and
readers), `snosi-health` (collector and Floe sender), chairlift (reader and
desktop sender), the intake Worker in `frostyard/problem-intake` (validator),
and frostyard.org (the published copy and the privacy page). The decision
behind it is [ADR-0069](../adr/0069-report-problems-local-first-opt-in-with-one-sender-per-host.md);
[the problem reports design](../design/problem-reports.md) shows where each
piece fits.

## Interface

### Report document

The schema `$id` is `https://frostyard.org/schemas/problem-report/v1.json`
(JSON Schema draft 2020-12). The shape is closed: the envelope, `image` and
each kind's `detail` definition have `additionalProperties: false`, and the
`kind` selects the `detail` definition. All fields of the envelope are
required.

| Field | Type | Constraints |
| --- | --- | --- |
| `schema` | string | Exactly `frostyard.problem/1` |
| `report_id` | string | A random lowercase UUIDv4, new for each report |
| `week` | string | ISO 8601 week in UTC, `^20[2-9][0-9]-W(0[1-9]\|[1-4][0-9]\|5[0-3])$`, such as `2026-W45`: the week the problem was recorded, or the week a `count` is sent |
| `image.id` | enum | `snow`, `snowfield`, `sundog`, `floe` (closed) |
| `image.version` | string | `^[0-9]{14}$` ([ADR-0006](../adr/0006-os-artifact-versions-are-utc-timestamps.md)) |
| `secure` | boolean | `true` when the booted image is the secure-boot variant |
| `client` | string | `chairlift/<semver>` or `snosi-health/<image version>` |
| `kind` | enum | 1 of the 9 kinds below (closed) |
| `detail` | object | The fields of that kind, and no others |

`<semver>` in this spec is
`^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})(-(alpha|beta|rc)\.(0|[1-9][0-9]{0,3}))?$`:
no `v` prefix, no build metadata, and only `alpha`, `beta` or `rc` prereleases.

A minimal valid document:

```json
{
  "schema": "frostyard.problem/1",
  "report_id": "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
  "week": "2026-W45",
  "image": { "id": "floe", "version": "20261031093822" },
  "secure": false,
  "client": "snosi-health/20261031093822",
  "kind": "count",
  "detail": { "install_age": "<6m", "channel": "latest" }
}
```

[schemas/problem-report/examples/](schemas/problem-report/examples/) holds 1
valid document for each kind.

### Kinds and `detail` fields

A field is required unless the table says optional.

| Kind | Field | Type | Constraints |
| --- | --- | --- | --- |
| S1 `unit_failed` | `unit` | string | A unit template name with the instance stripped (`user@.service`): `^[A-Za-z0-9][A-Za-z0-9:_.-]{0,95}@?\.(service\|socket\|timer\|mount\|automount\|swap\|path\|target\|slice\|scope)$` |
| | `result` | enum | `exit-code`, `signal`, `timeout`, `core-dump`, `start-limit-hit`, `other` |
| | `shipped` | boolean | Exactly `true`: only a unit file under `/usr/lib/systemd` is reportable |
| S2 `update_stage_failed` | `target_version` | string | Image version, `^[0-9]{14}$` |
| | `error_class` | enum | `network`, `registry`, `signature`, `disk_space`, `lock`, `other` |
| | `bootc_version` | string | `<semver>` |
| S3 `booted_older_image` | `newer_version` | string | Image version, `^[0-9]{14}$` |
| | `how` | enum | `manual_rollback`, `boot_menu`, `unknown`, `other` |
| S4 `sysext_update_failed` | `feature` | string | `^[a-z0-9][a-z0-9._-]{0,63}$`; only features of origin `image` or `catalog` |
| | `version` | string | `^[0-9A-Za-z][0-9A-Za-z.+~_-]{0,63}$` |
| | `outcome` | enum | `failed`, `held_by_rollback`, `needs_image`, `skipped_unreachable`, `skipped_busy`, `other` |
| | `error_class` | enum, optional | `network`, `http_status`, `signature`, `checksum`, `disk_space`, `link`, `config`, `other` |
| S5 `tpm_unlock` | `outcome` | enum | `ok_after_retry`, `recovery_key`, `passphrase`, `other` |
| | `tpm_rc` | enum | `PCR_CHANGED`, `POLICY_FAIL`, `LOCKOUT`, `other` |
| | `retries` | integer | 0 to 10 |
| S6 `integrity_error` | `subsystem` | enum | `composefs`, `fs-verity`, `dm-verity`, `other` |
| | `count` | enum | `1`, `2-10`, `>10` (closed) |
| S7 `crash` | `exe` | string | Basename of a `/usr` executable, or a Flatpak app ID: `^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$` |
| | `package` | string, optional | Debian package name, `^[a-z0-9][a-z0-9+.-]{1,99}$` |
| | `package_version` | string, optional | Debian version, `^([0-9]{1,4}:)?[0-9][A-Za-z0-9.+~-]{0,63}$` |
| | `signal` | enum | `SIGSEGV`, `SIGABRT`, `SIGBUS`, `SIGILL`, `SIGFPE`, `SIGTRAP`, `SIGSYS`, `other` |
| S8 `app_problem` | `app_id` | enum | The app ID allowlist below (closed) |
| | `app_version` | string | `<semver>`, the release version the app was built as |
| | `runtime` | enum | `go`, `rust` (closed) |
| | `component` | enum | `daemon`, `cli`, `gui`, `shell`, `other` |
| | `class` | enum | `panic`, `error` (closed) |
| | `code` | string | `^[a-z][a-z0-9_.]{0,63}$`. Required when `class` is `error`; absent when `class` is `panic` |
| | `frames` | array of strings | Go panics only (`runtime` `go`, `class` `panic`), optional. 1 to 32 function names, innermost first, each at most 160 characters, each `other` or a name in an allowed module (below) |
| | `location` | string | Rust panics only (`runtime` `rust`, `class` `panic`), optional. Crate-relative `src/…rs:line`, at most 128 characters: `^src/([a-z0-9_]+/){0,8}[a-z0-9_]+\.rs:[1-9][0-9]{0,5}$` |
| S9 `count` | `install_age` | enum | `<1w`, `<1m`, `<6m`, `>=6m` (closed) |
| | `channel` | enum | `latest`, `other` |

**App ID allowlist (S8 `app_id`).** Each ID is the identifier that its
repository already uses ([ADR-0016](../adr/0016-reverse-dns-org-frostyard-identifiers.md)):

| `app_id` | Repository |
| --- | --- |
| `org.frostyard.ChairLift` | frostyard/chairlift |
| `org.frostyard.nsl` | frostyard/nsl |
| `org.frostyard.intuneme` | frostyard/intuneme |
| `org.frostyard.pilothouse` | frostyard/pilothouse |
| `org.frostyard.Frostmail` | frostyard/frostmail |
| `org.frostyard.Frostnotes` | frostyard/frostnotes |
| `org.frostyard.Frostread` | frostyard/frostread |

**Allowed Go frame modules (S8 `frames`).** A frame is a Go function name as
the runtime prints it, with no file path, line or argument. Its import path
starts with 1 of:

- `github.com/frostyard/` (every frostyard module);
- `github.com/emersion/go-imap/v2` (the fork that frostmail vendors);
- a top-level Go standard library package: `archive`, `bufio`, `bytes`,
  `cmp`, `compress`, `container`, `context`, `crypto`, `database`, `debug`,
  `embed`, `encoding`, `errors`, `expvar`, `flag`, `fmt`, `go`, `hash`,
  `html`, `image`, `index`, `internal`, `io`, `iter`, `log`, `maps`, `math`,
  `mime`, `net`, `os`, `path`, `plugin`, `reflect`, `regexp`, `runtime`,
  `slices`, `sort`, `strconv`, `strings`, `structs`, `sync`, `syscall`,
  `testing`, `text`, `time`, `unicode`, `unique`, `unsafe`, `vendor`, `weak`;
  and `main`.

After a standard library package or the go-imap fork, at most 4 more
import path segments follow, each `[a-z0-9_]+`. After `github.com/frostyard`,
1 to 6 segments follow, each `[A-Za-z0-9_-]+`. No segment holds a dot, so no
`..` or file name with an extension fits. Every other frame is `other`. The
schema pattern holds the same rules.

The pattern bounds the shape of a frame; it cannot prove that a value is a
real symbol. A lowercase token such as `fmt/home/brian/documents/taxes.x`
matches it. The std writer takes frames only from the Go runtime's symbol
names, so a real record holds no such value. A forged journal record can
(rule 4): the user who can write to that journal can put a token-shaped name
in it, and the sender shows the exact document before the first send.

### Journal record registry

An app writes 1 journal entry for each problem, with the fields below. Only
`FROSTYARD_*` values can reach a report; `MESSAGE` stays on the host.

| Journal field | Value | Report field (S8) |
| --- | --- | --- |
| `MESSAGE_ID` | Exactly `8915bdd215c84cbab0c31c05a1a33e7e` | none |
| `MESSAGE` | Human text: the panic message or the error text. Local only, never sent | none |
| `PRIORITY` | `2` for a panic, `3` for an error | none |
| `FROSTYARD_SCHEMA` | `frostyard.problem/1`: the schema version whose patterns the values follow | none (selects `schema`) |
| `FROSTYARD_APP_ID` | An allowlisted app ID | `app_id` |
| `FROSTYARD_APP_VERSION` | `<semver>` | `app_version` |
| `FROSTYARD_RUNTIME` | `go` or `rust` | `runtime` |
| `FROSTYARD_COMPONENT` | `daemon`, `cli`, `gui`, `shell`, `other` | `component` |
| `FROSTYARD_CLASS` | `panic` or `error` | `class` |
| `FROSTYARD_CODE` | The code; only when `FROSTYARD_CLASS=error` | `code` |
| `FROSTYARD_FRAMES` | Go panics only: the frames, joined by 1 newline (`\n`), innermost first, at most 32 | `frames` |
| `FROSTYARD_LOCATION` | Rust panics only: `src/…rs:line` | `location` |

A reader also returns the trusted fields that journald adds (`_UID`, `_COMM`,
`_SYSTEMD_UNIT`, `_SYSTEMD_USER_UNIT`) beside the `FROSTYARD_*` fields. These
never go into a report.

### Enum registry

| Enum | Values | Open (has `other`) |
| --- | --- | --- |
| `image.id` | `snow`, `snowfield`, `sundog`, `floe` | no |
| `kind` | `unit_failed`, `update_stage_failed`, `booted_older_image`, `sysext_update_failed`, `tpm_unlock`, `integrity_error`, `crash`, `app_problem`, `count` | no |
| S1 `result` | `exit-code`, `signal`, `timeout`, `core-dump`, `start-limit-hit`, `other` | yes |
| S2 `error_class` | `network`, `registry`, `signature`, `disk_space`, `lock`, `other` | yes |
| S3 `how` | `manual_rollback`, `boot_menu`, `unknown`, `other` | yes |
| S4 `outcome` | `failed`, `held_by_rollback`, `needs_image`, `skipped_unreachable`, `skipped_busy`, `other` | yes |
| S4 `error_class` | `network`, `http_status`, `signature`, `checksum`, `disk_space`, `link`, `config`, `other` | yes |
| S5 `outcome` | `ok_after_retry`, `recovery_key`, `passphrase`, `other` | yes |
| S5 `tpm_rc` | `PCR_CHANGED`, `POLICY_FAIL`, `LOCKOUT`, `other` | yes |
| S6 `subsystem` | `composefs`, `fs-verity`, `dm-verity`, `other` | yes |
| S6 `count` | `1`, `2-10`, `>10` | no |
| S7 `signal` | `SIGSEGV`, `SIGABRT`, `SIGBUS`, `SIGILL`, `SIGFPE`, `SIGTRAP`, `SIGSYS`, `other` | yes |
| S8 `app_id` | the allowlist above | no |
| S8 `runtime` | `go`, `rust` | no |
| S8 `component` | `daemon`, `cli`, `gui`, `shell`, `other` | yes |
| S8 `class` | `panic`, `error` | no |
| S9 `install_age` | `<1w`, `<1m`, `<6m`, `>=6m` | no |
| S9 `channel` | `latest`, `other` | yes |

## Rules

1. **Closed shape.** A validator MUST reject a document with a field that the
   schema does not name, at any level, or a `detail` field of another kind.
2. **No free text.** Every string value is an enum value, an allowlisted name,
   or matches a pattern above. A value that fails its pattern MUST NOT be sent:
   the item stays local and is not reportable.
3. **Unknown values.** A sender MUST map a value of an open enum that it does
   not know to `other`. A value outside a closed enum (an unknown `kind`, an
   app ID off the allowlist) makes the item local only. A Go frame outside the
   allowed modules, or longer than 160 characters, becomes `other`.
4. **Untrusted records.** Anyone can write `FROSTYARD_*` fields to the journal
   with `systemd-cat`. Every reader MUST validate each `FROSTYARD_*` value
   against this spec and MUST drop a record that fails, or whose
   `FROSTYARD_SCHEMA` it does not know.
5. **Versions.** A new field, kind or enum value, or any other change to an
   accepted schema, is a new schema version: `frostyard.problem/N+1` in a new
   file `schemas/problem-report/vN+1.json`, with a new `$id`. An accepted
   version's file never changes. `v1.json` is accepted when the first sender
   release that uses it ships; until then a core PR can correct it.
6. **Deploy order.** The intake Worker MUST accept a schema version before any
   sender release uses it, and keeps accepting each version that a supported
   sender still sends.
7. **Consent.** A version that adds a kind or a field turns sending off until
   the user or admin agrees again. A version that adds only enum values does
   not.
8. **Portable patterns.** Every `pattern` is anchored with `^` and `$` and uses
   only syntax that ECMA-262, Go `regexp` (RE2) and the Rust `regex` crate read
   the same: literals, character classes, groups, alternation and bounded
   repetition. No lookaround, backreference or `format` keyword. Patterns are
   used with no flags: `$` then matches only at the end of the input in all 3
   engines, so a value with a trailing newline fails.
9. **Size.** A document stays under 8 KB serialized; the field limits above
   keep every valid document under it. The longest S8 document (32 frames of
   160 characters, or a `location` of 128 characters) is the largest.
10. **Local record.** An app writes only to the local journal and never sends.
    1 record is 1 journal datagram; a record that does not fit is dropped.
11. **The test.** `test/problem-report-schema.test.mjs` validates every example
    and rejects the negative cases. It pins the sha256 of `v1.json`, so a
    change to the file also changes the test.

## Derived artifacts

| Artifact | Derivation |
| --- | --- |
| frostyard.org `public/schemas/problem-report/v1.json` | A byte copy from a pinned core commit; the site check asserts its sha256 |
| frostyard.org privacy page data table | Generated from that copy |
| `frostyard/problem-intake` request validation | Compiled from `v1.json` |
| std `problems` test vectors (Go and Rust) | Journal fields and S8 payload fields from the registry above |
| `snosi-health` `problems.json` | Holds only report fields of S1–S8, by this spec |
| chairlift report envelope and hints | The envelope and the enums above |

## References

- Rationale: [ADR-0069](../adr/0069-report-problems-local-first-opt-in-with-one-sender-per-host.md)
- Context: [design/problem-reports.md](../design/problem-reports.md)
- Builds on: [ADR-0006](../adr/0006-os-artifact-versions-are-utc-timestamps.md),
  [ADR-0015](../adr/0015-os-release-image-identity.md),
  [ADR-0016](../adr/0016-reverse-dns-org-frostyard-identifiers.md)
