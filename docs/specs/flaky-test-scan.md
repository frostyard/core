# Spec: Flaky-test scan

This contract governs `scripts/flaky-scan.mjs`, the weekly scan that finds
GitHub Actions jobs which failed and then passed on the same commit, and
files 1 issue per flaky test in the repository where the job ran. Its
consumers are the repository owners (the issues), the daily audit's check
Q1 (the `--out` file, for CI reruns per repository), and the
[quality loop](../design/quality-loop.md), where it is part of the *Observe*
station. It runs locally with `gh` as the machine account, from a weekly
schedule in the owner's Pocket home; it is not a GitHub Actions workflow, so
it needs no cross-repository token.

## Interface

```
node scripts/flaky-scan.mjs [--repo owner/name]... [--profiles DIR]
                            [--days N] [--out FILE] [--apply] [--now ISO]
```

| Flag | Meaning |
| --- | --- |
| `--repo owner/name` | A repository to scan. Repeatable. |
| `--profiles DIR` | Scan every repository under the `repositories:` front-matter key of each `DIR/*.md` agent profile; the profile's file name is the repository's owner. Files that do not end in `.md` are ignored. |
| `--days N` | Window length in days. Default `7`. The window starts at 00:00Z of the day `N` days before `--now`. |
| `--out FILE` | Write the result JSON below to `FILE`. |
| `--apply` | Open issues and post comments. Without it the scan is a dry run. |
| `--now ISO` | The reference time. Default: the current time. |

Exit codes: `0` every repository was read and every write succeeded; `1` a
repository read or a write failed (the other repositories are still scanned
and `--out` is still written); `2` a usage error (no repository, unknown
flag).

### GitHub calls

Reads: `GET repos/{r}/actions/runs?created=>={from}` (paged, at most 10
pages), `GET repos/{r}/actions/runs/{id}/attempts/{n}/jobs`,
`GET repos/{r}/actions/jobs/{job}/logs`, `GET repos/{r}/issues?state=open`
and `GET repos/{r}/issues/{n}/comments`. Writes, only with `--apply`:
`POST repos/{r}/issues` and `POST repos/{r}/issues/{n}/comments`. No other
write exists.

### Result file

```json
{
  "schema_version": 1,
  "generated_at": "2026-11-09T10:30:00.000Z",
  "window": { "from": "2026-11-02", "to": "2026-11-09T10:30:00.000Z" },
  "apply": false,
  "repos": [
    {
      "repo": "frostyard/updex",
      "owner": "lucilla",
      "runs": 42,
      "rerunAttempts": 3,
      "error": null,
      "flaky": [
        {
          "key": "frostyard/updex/ci.yml/test/TestDownload",
          "workflow": "ci.yml",
          "job": "test",
          "test": "TestDownload",
          "events": [
            { "run_id": 1, "attempt": 1, "job_id": 11, "sha": "0123abc…",
              "date": "2026-11-03T12:00:00Z", "url": "https://github.com/…/job/11" }
          ],
          "action": { "type": "open", "issue": null, "reason": null }
        }
      ]
    }
  ]
}
```

| Field | Type | Constraints |
| --- | --- | --- |
| `schema_version` | integer | Exactly `1` |
| `window.from` | `YYYY-MM-DD` | Start of the scanned window (UTC) |
| `window.to` | ISO time | `--now` |
| `apply` | boolean | `true` only with `--apply` |
| `repos[].owner` | string or `null` | The agent profile that lists the repository; `null` for a `--repo` that no profile lists |
| `repos[].runs` | integer or `null` | Workflow runs created in the window, at most 1,000 (the runs API returns no more for 1 query); `null` when the read failed |
| `repos[].rerunAttempts` | integer or `null` | Sum over those runs of `run_attempt − 1`; `null` when the read failed |
| `repos[].error` | string or `null` | Why the repository could not be read, or the first failed write or issue-comment read (the scan goes on with the next key) |
| `repos[].flaky[].key` | string | `repo/workflow/job/test` |
| `repos[].flaky[].action.type` | string | `open`, `comment`, `none` (no new event) or `skip` |
| `repos[].flaky[].action.reason` | string or `null` | `cap` for a skip over a cap; the error of a failed write or comment read |

## Rules

- **Flaky event.** A job (same workflow file, same job name) that concluded
  `failure` or `timed_out` and has a later job that concluded `success` on
  the **same head SHA** — a later attempt of the same run, or a later run of
  the same workflow file — is 1 flaky event. A failure on 1 SHA and a
  success on another SHA is no event. Jobs are deduplicated by job id, so a
  passed job that a rerun copies counts once.
- **Jobs read.** Jobs are read only for (workflow file, head SHA) groups
  with 2 or more attempts in total. The runs list stops at 1,000 runs (10
  pages), the most the runs API returns for 1 query: a busier repository is
  scanned for its newest 1,000 runs, so its scan uses a shorter `--days`.
- **Test name.** From the failed job's log: Go `--- FAIL: Name`, TAP
  `not ok N - name`, pytest `FAILED path::name`; at most 5 distinct names
  per job, and a Go parent test is dropped when a subtest of it failed.
  With no log or no match, the first failed step's name; else the job name.
  Each name is its own key.
- **Dry run by default.** Without `--apply` the scan makes only `GET`
  calls and prints what it would do. A guard refuses every write without
  `--apply`, and every write other than the 2 named above with it.
- **1 issue per key.** An open issue whose body holds
  `<!-- flaky-scan key=KEY -->` is the issue of that key. It gets 1 comment
  that lists only the events whose job is not yet in its body or comments,
  or nothing when there is no new event. A closed issue does not count: a
  key that flakes again after its issue closed gets a new issue.
- **Issue shape.** Title `flaky: <test> (<workflow> / <job>)`; the body
  lists each event (run, attempt, short SHA, date, job URL), names the
  owner when known, and ends with the key marker.
- **Caps.** At most 3 new issues per repository and 15 per run, in order of
  event count (descending), then key. A key over a cap is reported as
  `skip` with reason `cap` and is filed by a later run. Comments have no
  cap.
- **No other action.** The scan creates no label, reruns no job, and edits
  no workflow or file in any repository.
- **CI reruns for Q1.** The daily audit reads `rerunAttempts` from the
  newest `scan.json`; a repository with no scan or an `error` is `null`,
  never `0`.

## Derived artifacts

| Artifact | Derivation |
| --- | --- |
| `~/agents/odrade/reports/<date>-flaky-scan/scan.json` | The weekly schedule's `--out` file; the audit's Q1 reads the newest one |
| `flaky: …` issues | 1 per key, in the repository where the job ran |

## References

- Rationale: [ADR-0019](../adr/0019-governance-as-code-and-risk-tiers.md)
  (the quality loop observes its stream; guardrails only tighten),
  [ADR-0029](../adr/0029-acmm-conformance-via-canonical-aliases.md)
  (ACMM conformance)
- Context: [design/quality-loop.md](../design/quality-loop.md)
- Related: [specs/pr-acceptance-metric.md](pr-acceptance-metric.md)
