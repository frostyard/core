# 0074 — Publish verified fault records as public issues in the owner repository

- **Status:** Accepted; amends [ADR-0069](0069-report-problems-local-first-opt-in-with-one-sender-per-host.md) in part
- **Date:** 2026-11-06

## Context

[ADR-0069](0069-report-problems-local-first-opt-in-with-one-sender-per-host.md)
states "Raw reports are never published" and "Aggregates only are public":
frostyard.org publishes the schema, the privacy page, the sources and weekly
aggregates with cells from 1 to 4 suppressed. The privacy page at
<https://frostyard.org/privacy/problem-reports/> says "We never publish single
reports".

Opt-in reports reach a self-hosted GlitchTip through the intake Worker of
[frostyard/problem-intake](https://github.com/frostyard/problem-intake)
([problem-intake ADR-0003](https://github.com/frostyard/problem-intake/blob/main/docs/adr/0003-intake-worker-validates-strips-and-forwards.md)).
GlitchTip groups each event by the fingerprint `[kind, class, ...groupKey]`
of `src/envelope.ts`. The class is the class-like detail field of each kind
(`result`, `error_class`, `how`, `outcome`, `subsystem`, `signal`, `class`), and the
group key holds only `unit`, `feature`, `tpm_rc`, `exe`, or `app_id` with
`code`, the first 3 `frames` or `location`. The event ID is the `report_id` without
dashes ([problem-intake ADR-0005](https://github.com/frostyard/problem-intake/blob/main/docs/adr/0005-the-worker-sends-no-report-id-tag.md)).
GlitchTip keeps events for 72 days
([problem-intake ADR-0004](https://github.com/frostyard/problem-intake/blob/main/docs/adr/0004-glitchtip-env-file-and-72-day-retention.md)),
and a user can have 1 report deleted by its `report_id`.

GlitchTip is private. The owner of a faulty app or image does not see a fault
there as tracked work in the repository where the fix lands, and a fix PR has
nothing public to name. The repositories that own reportable code
(the 7 apps of the S8 `app_id` allowlist in the
[problem report spec](../specs/problem-report.md), frostyard/snosi and
frostyard/updex) are public.

The intake is public. Anyone can send a document that the schema accepts, and
the schema patterns bound the shape of a value, not its truth: a forged,
path-shaped frame matches the frame pattern (the S8 `frames` section of the
spec shows one). A value
copied from a report into a public place can therefore carry any text that
fits a pattern.

A version alone can say much: an image id and an image version that few hosts
run can point to those hosts, and a list of versions seen for 1 fault can
trace 1 host's update path.

## Decision

This ADR amends ADR-0069's "Aggregates only are public" in part: besides the
aggregates, a **public fault issue** as defined here may be published. The
rest of ADR-0069 stays in force, including "Raw reports are never published":
a fault issue is not a report and holds no value that only a report proves.

- **1 issue for each problem key.** The problem-intake triage job opens at most
  1 GitHub issue for each problem key, in the repository that owns the faulty
  code (routing by kind and `app_id`), with the label `problem-report`. The
  job runs at most once a day, so an issue's creation time tells no more
  than the day of a report. The
  problem key is the first 16 hex characters of the SHA-256 of the GlitchTip
  fingerprint above; the key itself is published, the fingerprint values
  only as the table below allows. frostyard/problem-intake
  `docs/specs/triage.md` defines it.
- **Closed list of public fields.** Every issue holds the kind, the class, and
  the newest verified version: the app version for `app_problem`, else each
  image id with its newest verified image version (1 problem key can cover
  several images, because the fingerprint holds no image id). A list of
  versions for 1 image or app is never published. Then, for each kind, only:

  | Kind | Public fields |
  | --- | --- |
  | `app_problem` | `app_id`, `runtime`, `component`, and `code` (class `error`) or `frames` or `location` (class `panic`) |
  | `unit_failed` | `unit`, `result` |
  | `update_stage_failed` | `error_class`, `target_version` |
  | `booted_older_image` | `how`, `newer_version` |
  | `sysext_update_failed` | `feature`, `outcome`, `error_class` if present, the newest verified `feature_version` if any |
  | `tpm_unlock` | `outcome`, `tpm_rc`, the variant |
  | `integrity_error` | `subsystem`, the variant |

  The variant is the standard or the secure-boot image (the report's
  `secure`), and only these 2 kinds show it. `crash` and `count` have no row:
  they are never filed. A new row or a new field is a new ADR.
- **Each value verified against a public source.** A value is published only
  after the job finds it in a public source of the organization: a release tag
  of the owner repository, the source at that tag (a code literal, a Go
  function, a Rust file and line), a published image tag of
  `ghcr.io/frostyard/<image>`, the published sysext index on
  repository.frostyard.org, or an allowlist in frostyard/problem-intake
  (units, features). A value that fails its check is never published; a
  problem whose fields fail is held and filed later or never. Frames of
  other modules become their top package name only.
- **Never published.** No issue, comment or public status holds a
  `report_id`, an event ID, a `week`, a `client`, any count (also the S6
  `count` bucket, `retries` or a number of reports), any day, a
  `bootc_version`, `shipped`, `secure` outside the 2 kinds above, a host
  name, a user name, a path or free text. Besides the public fields, an
  issue body holds only the line `Problem key: <key>`, the line
  `GlitchTip issue: <ids>` (internal GlitchTip issue row numbers, never an
  event ID or a GlitchTip URL), and a fixed footer that links
  <https://frostyard.org/privacy/problem-reports/#public-bug-reports>. The
  job's later comments on the issue hold only fixed text, its marker, and
  fix boundaries and versions that it verified.
- **Cutoff.** The job files only problems that GlitchTip first saw on or after
  a cutoff: 00:00 UTC of the date that the frostyard.org privacy page states
  in its section `public-bug-reports`. Until that section is live, the job
  files nothing. A problem first seen before the cutoff is never filed.
- **Deletion and opting out.** Deleting a report, or turning reporting off,
  does not remove, edit or close an issue: an issue holds no identifier of a
  report and only values that exist in public source.
- **Residue.** An issue tells that 1 or more opted-in installs sent a report
  with these values; its creation time tells about when the first report
  came; and a rare image and version can point to few hosts. The privacy
  page states this residue in its section `public-bug-reports`.

## Consequences

- Easier: a fault becomes tracked work in the owner repository, and a fix PR
  closes it with `Fixes #N`. The fix loop can check releases against new
  reports with no private data in public.
- Easier: a forged report cannot put new text into an issue. It can only name
  real code at a real release.
- Harder: a forged report can still open 1 issue about a fault that no host
  had. The issue says "from opt-in problem reports", not "confirmed", and the
  job limits new issues for each run.
- Harder: an issue can exist because of 1 report, and it stays after that
  report is deleted. The residue above is the accepted cost.
- Harder: users who opted in before the privacy page section see no new
  consent prompt; the cutoff and the page section are the notice. A schema
  change is not part of this decision, so rule 7 of the spec does not apply.
- New obligations: frostyard.org adds the privacy page section
  `public-bug-reports` (what an issue holds, what it never holds, the residue,
  the cutoff date, deletion) before the first issue. frostyard/problem-intake
  records the triage job, its verification rules and the problem key in its
  own ADR, `docs/specs/triage.md`, routes and allowlists, and a test that
  rejects a field outside the table above. Texts that promise "never
  published" without this exception (problem-intake docs, the chairlift
  opt-in text, the Floe `snosi-health reporting` text) are fixed by their
  owners before the job runs.
- Weekly aggregates keep the 1-to-4 suppression of ADR-0069; an issue holds
  no count, so that rule does not apply to it.

## Alternatives considered

- **A private repository `frostyard/problem-reports` with the issues:** no
  change to ADR-0069, but each owner copies every fault into a public issue by
  hand, and the fix PR cannot name the private issue.
- **Public issues with the values copied from GlitchTip, unverified:** a forged
  report then puts any pattern-valid text, such as a path-shaped frame, into a
  public issue.
- **No publication; owners read GlitchTip:** faults stay out of the owner's
  tracked work, and each owner needs GlitchTip access.

## References

- Shapes: [spec: problem report](../specs/problem-report.md),
  [design: problem reports](../design/problem-reports.md),
  frostyard/problem-intake `docs/specs/triage.md`, the frostyard.org privacy
  page section `public-bug-reports`
- Amends in part: [ADR-0069](0069-report-problems-local-first-opt-in-with-one-sender-per-host.md)
- Builds on: [ADR-0006](0006-os-artifact-versions-are-utc-timestamps.md),
  [ADR-0016](0016-reverse-dns-org-frostyard-identifiers.md),
  [ADR-0033](0033-link-maintenance-in-immutable-adrs.md)
