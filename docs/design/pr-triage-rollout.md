# PR triage rollout: settings runbook

Living document. Rationale:
[ADR-0076](../adr/0076-require-status-checks-on-every-default-branch.md)
(required status checks),
[ADR-0078](../adr/0078-sort-pull-requests-by-levels-l1-to-l4.md)
(levels L1 to L4),
[ADR-0042](../adr/0042-adopt-a-merge-queue-on-the-default-branch.md)
(merge queue).
Contracts: [repository baseline, row B18](../specs/repository-baseline.md),
[PR triage](../specs/pr-triage.md), [risk paths](../specs/risk-paths.md).
Names: the owners' comments on the tracking issue
[core#222](https://github.com/frostyard/core/issues/222).

## Overview

This runbook is the settings step of the PR triage rollout. The bot account
cannot change repository settings, so an organization admin does this step
once in each repository:

1. Create the repository ruleset `frostyard: required checks` with the
   required status checks that the repository owner named on core#222
   (ADR-0076). Only frostyard/repogen also gets strict checks and the merge
   queue.
2. Create the 4 level labels `level:L1` to `level:L4` that the `levels` step
   of `pr-triage.yml` adds (ADR-0078).
3. Do the hand steps: 1 required name to remove (nsl) and 1 to add (firn) in
   an existing ruleset that the script does not change.

```text
owner's names (core#222) --> ruleset "frostyard: required checks" --> merge blocked until the gate is green
level labels level:L1..L4 --> pr-triage levels step labels each PR --> merge list sorted by level
```

Each step is given first as a path in the GitHub web UI. The command of
`scripts/apply-triage-settings.sh` does the same thing and is an extra. The
bot made each dry run below; it changed nothing.

Not in this runbook (exempt from ADR-0076, no row): frostyard/hotedge,
frostyard/Logomenu and bketelsen/pi-pocket (forks with no CI job on pull
requests), frostyard/caddyscope and frostyard/frostyard-ai (no owner,
inactive), bketelsen/homewiki (no pull requests).

## Design

### Before you start

- Every repository below has the label `risk:high`, which the `levels` step
  needs (read on 2026-11-09). frostyard/incus got it on 2026-11-09.
- The owners' pull requests that add the `pr-triage` caller and the jobs
  behind the names have merged, except in bootc-debian, apt-publisher and
  omarchy-apps. Their 3 rows say "waiting for the comment": do them only when
  the condition in the row holds.
- A name that a ruleset requires must report on every pull request. An open
  pull request whose head is older than a newly required job shows that check
  as "Expected — Waiting for status". Push to it, or use "Update branch", to
  run the job.
- No ruleset below has a bypass actor. A red or missing required check then
  blocks every merge, also an admin's merge.

### Step 1: the ruleset `frostyard: required checks`

Web UI, for each repository with required names in the table:

1. GitHub > *owner/repo* > Settings > Rules > Rulesets > New ruleset >
   New branch ruleset.
2. Ruleset Name: `frostyard: required checks`. Enforcement status: Active.
   Bypass list: empty.
3. Target branches: Add target > Include default branch.
4. Branch rules: turn on "Require status checks to pass". Turn off every other
   rule; a new ruleset can start with "Restrict deletions" and "Block force
   pushes" on (the organization ruleset `frostyard` already has them for the
   frostyard repositories).
5. Under "Require status checks to pass":
   - "Do not require status checks on creation": off.
   - "Require branches to be up to date before merging": on only for
     frostyard/repogen; off everywhere else.
   - Add checks: type each name of the row exactly (case, spaces and
     brackets count). Source: GitHub Actions. A name followed by "(any app)"
     outside its code span: type the name without "(any app)", and set
     Source: any source.
6. frostyard/repogen only: turn on "Require merge queue" with the ADR-0042
   values: Merge method "Squash and merge", Build concurrency 5, Minimum
   group size 1, Maximum group size 5, Wait time to meet minimum group size 0
   minutes, "Require all queue entries to pass required checks" on, Status
   check timeout 60 minutes.
7. Create.

### Step 2: the level labels

Web UI: GitHub > *owner/repo* > Issues > Labels > New label (or
`https://github.com/<owner>/<repo>/labels`). Create each label that is
missing; do not change a label that exists.

| Name | Description | Color |
| --- | --- | --- |
| `level:L1` | Read every line | `#B60205` |
| `level:L2` | Read the diff | `#D93F0B` |
| `level:L3` | Skim | `#FBCA04` |
| `level:L4` | Title and CI | `#0E8A16` |

On 2026-11-09 no repository below had any of the 4 labels.

### Step 3: hand steps in existing rulesets

The script writes only the ruleset `frostyard: required checks`. These 2
changes are in other rulesets:

- **frostyard/nsl, remove `release-config`.** GitHub > frostyard/nsl >
  Settings > Rules > Rulesets > `main: required checks` > "Require status
  checks to pass" > remove `release-config` > Save changes. The owner's
  comment lists it under `remove:`: the job needs the `GORELEASER_KEY`
  secret, so it fails on a Dependabot pull request (N2).
- **frostyard/firn, add `Graphical installer gate`.** GitHub >
  frostyard/firn > Settings > Rules > Rulesets > `frostyard: default branch`
  > "Require status checks to pass" > Add checks > `Graphical installer gate`
  (Source: GitHub Actions) > Save changes. The owner's comment lists it beside
  the 4 names that this ruleset requires today. The job is in `ci.yml`, which
  triggers on `pull_request` and `merge_group` (N1, N3), and it passed in the
  `merge_group` run of 2026-11-09. It goes in the ADR-0040 ruleset, which
  holds firn's strict checks and its merge queue, not in a second ruleset
  from the script. A later `scripts/apply-repo-settings.sh` run for firn must
  pass all 5 names.

Extra, as `gh` commands (an admin's token; each reads the ruleset, changes 1
name, and writes it back):

```sh
gh api repos/frostyard/nsl/rulesets/26537150 \
  | jq '{name, target, enforcement, conditions, rules: [.rules[] | if .type == "required_status_checks" then .parameters.required_status_checks |= map(select(.context != "release-config")) else . end]}' \
  | gh api -X PUT repos/frostyard/nsl/rulesets/26537150 --input -

gh api repos/frostyard/firn/rulesets/21100673 \
  | jq '{name, target, enforcement, conditions, rules: [.rules[] | if .type == "required_status_checks" then .parameters.required_status_checks += [{"context": "Graphical installer gate", "integration_id": 15368}] else . end]}' \
  | gh api -X PUT repos/frostyard/firn/rulesets/21100673 --input -
```

### The command (extra)

`scripts/apply-triage-settings.sh` does steps 1 and 2 for 1 repository. Run
it from a clone of frostyard/core at `main`, with `gh` signed in as an
organization admin (bketelsen repositories: as their owner), and with `jq`
and Node.js. Without `--apply` it is a dry run that prints each change as a
`WOULD` line and its JSON body. With `--apply` it makes the changes. A second
run prints "already matches". With `--merge-queue` (repogen only) it first
checks that the workflow of each required name triggers on `merge_group`,
and refuses otherwise.

### Repositories

Group A has strict checks and the merge queue from ADR-0040 and ADR-0042;
it gets the level labels only. Group B has a hand-made ruleset with required
checks; it keeps that ruleset, and the names of both rulesets add up. Group C
had no required status check.

| Repository | Owner | Group | Required names (core#222) | Queue | Hand step |
| --- | --- | --- | --- | --- | --- |
| [frostyard/core](#frostyardcore) | Lucilla | A | none: labels only | yes (ADR-0042, kept) |  |
| [frostyard/updex](#frostyardupdex) | Lucilla | A | none: labels only | yes (ADR-0042, kept) |  |
| [frostyard/std](#frostyardstd) | Lucilla | A | none: labels only | yes (ADR-0042, kept) |  |
| [frostyard/clix](#frostyardclix) | Lucilla | A | none: labels only | yes (ADR-0042, kept) |  |
| [frostyard/firn](#frostyardfirn) | Murbella | A | labels only; see the hand step | yes (ADR-0042, kept) | add `Graphical installer gate` to ruleset `frostyard: default branch` |
| [frostyard/nsl](#frostyardnsl) | Duncan | B | `verify`, `vulncheck` | no | remove `release-config` from ruleset `main: required checks` |
| [frostyard/frostmail](#frostyardfrostmail) | Irulan | B | `Verify (make verify)`, `Race detector`, `Windows (go test)`, `App UI (make ui-check)`, `App shell (make app-build, app-test)`, `Windows app (installer, WebView2 e2e)`, `Flatpak (build and test)`, `Flatpak sources (make flatpak-sources)`, `Snapshot .deb (make deb)` | no |  |
| [frostyard/frostnotes](#frostyardfrostnotes) | Irulan | B | `Verify (make verify)`, `Race detector`, `App UI (make ui-check)`, `App shell (make app-build, app-test)`, `Flatpak (build and test)`, `Flatpak sources (make flatpak-sources)`, `Snapshot .deb (make deb)` | no |  |
| [frostyard/frostread](#frostyardfrostread) | Irulan | B | `Verify (make verify)`, `Race detector and cross-builds (make race cross)`, `web bundle (make web-check)`, `Desktop app (make app-check app-build)`, `Snapshot .deb (make deb)`, `Flatpak sources (make flatpak-sources)`, `Flatpak (build and test)` | no |  |
| [frostyard/lodge](#frostyardlodge) | Irulan | B | `Verify (make verify)`, `Race detector and cross-builds (make race cross)`, `lodge-client (make client-check)`, `lodge-ui (make ui-check)`, `the shell (make shell-check)`, `The kit off Linux (go test on Windows)`, `Snapshot .deb (make deb)` | no |  |
| [frostyard/porter](#frostyardporter) | Irulan | B | `Verify (make verify)`, `Race detector (make race)`, `Web bundle (make web-check)`, `Snapshot .deb (make deb)` | no |  |
| [frostyard/bootc-debian](#frostyardbootc-debian) | Lucilla | B | `ci` (waiting for the comment) | no |  |
| [frostyard/frostyard-org](#frostyardfrostyard-org) | Tamalane | B | `ci`, `Workers Builds: frostyard-org` (any app) | no |  |
| [bketelsen/fleet](#bketelsenfleet) | Teg | B | `pytest`, `ansible-lint`, `tofu` | no |  |
| [bketelsen/trimlights](#bketelsentrimlights) | Irulan | B | `check` | no |  |
| [bketelsen/pi-pocket-team](#bketelsenpi-pocket-team) | Sheeana | B | `Test` | no |  |
| [bketelsen/pi-pocket-dune](#bketelsenpi-pocket-dune) | Sheeana | B | `Check` | no |  |
| [bketelsen/agentic-template](#bketelsenagentic-template) | Lucilla | B | `verify` | no |  |
| [frostyard/apt-publisher](#frostyardapt-publisher) | Lucilla | C | `ci` (waiting for the comment) | no |  |
| [frostyard/chairlift](#frostyardchairlift) | Duncan | C | `Lint`, `Unit Tests`, `Race Detection`, `E2E`, `Verify`, `Build (linux, amd64)`, `Build (linux, arm64)` | no |  |
| [frostyard/flatpak-index](#frostyardflatpak-index) | Lucilla | C | `Test` | no |  |
| [frostyard/homebrew-tap](#frostyardhomebrew-tap) | Lucilla | C | `Test` | no |  |
| [frostyard/igloo](#frostyardigloo) | Duncan | C | `verify`, `test`, `Build` | no |  |
| [frostyard/incus](#frostyardincus) | Lucilla | C | `Build Incus (Debian Trixie)` | no |  |
| [frostyard/intuneme](#frostyardintuneme) | Duncan | C | `Verify`, `Vulncheck`, `Build` | no |  |
| [frostyard/lab](#frostyardlab) | Murbella | C | `CI result` | no |  |
| [frostyard/omarchy-apps](#frostyardomarchy-apps) | Lucilla | C | `ci` (waiting for the comment) | no |  |
| [frostyard/pilothouse](#frostyardpilothouse) | Duncan | C | `Lint`, `Security Scan`, `Unit Tests`, `Race Detection`, `Verify`, `Build (linux, amd64)`, `Build (linux, arm64)` | no |  |
| [frostyard/problem-intake](#frostyardproblem-intake) | Murbella | C | `ci` | no |  |
| [frostyard/repogen](#frostyardrepogen) | Lucilla | C | `make ci` | yes |  |
| [frostyard/snosi](#frostyardsnosi) | Murbella | C | `verify`, `shell-lint`, `publication-guard-tests`, `runtime-etc-guard`, `bootc-secure-contracts`, `mkosi-config-sanity`, `installer-redirect-worker` | no |  |
| [frostyard/snowkit](#frostyardsnowkit) | Duncan | C | `Lint`, `Unit Tests`, `Race Detection`, `Verify`, `Vulnerability Check` | no |  |
| [frostyard/testsuite](#frostyardtestsuite) | Murbella | C | `Repository gate` | no |  |
| [bketelsen/truenas-mcp](#bketelsentruenas-mcp) | Moneo | C | `Lint`, `Verify`, `Tests`, `Build (linux, amd64)`, `Build (linux, arm64)`, `Build (darwin, arm64)`, `Build (windows, amd64)` | no |  |

#### frostyard/core

- Owner: Lucilla. Group A. Merge queue: yes (ADR-0042, kept).
- Required names: no change; the ruleset `frostyard: default branch` (ADR-0040) keeps them.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/core --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
  NOTE  no --required-check or --required-check-any given; the ruleset "frostyard: required checks" is not touched (labels still applied)
WOULD  POST repos/frostyard/core/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/core/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/core/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/core/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
4 change(s) planned for frostyard/core; re-run with --apply to make them.
```

#### frostyard/updex

- Owner: Lucilla. Group A. Merge queue: yes (ADR-0042, kept).
- Required names: no change; the ruleset `frostyard: default branch` (ADR-0040) keeps them.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/updex --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
  NOTE  no --required-check or --required-check-any given; the ruleset "frostyard: required checks" is not touched (labels still applied)
WOULD  POST repos/frostyard/updex/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/updex/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/updex/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/updex/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
4 change(s) planned for frostyard/updex; re-run with --apply to make them.
```

#### frostyard/std

- Owner: Lucilla. Group A. Merge queue: yes (ADR-0042, kept).
- Required names: no change; the ruleset `frostyard: default branch` (ADR-0040) keeps them.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/std --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
  NOTE  no --required-check or --required-check-any given; the ruleset "frostyard: required checks" is not touched (labels still applied)
WOULD  POST repos/frostyard/std/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/std/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/std/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/std/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
4 change(s) planned for frostyard/std; re-run with --apply to make them.
```

#### frostyard/clix

- Owner: Lucilla. Group A. Merge queue: yes (ADR-0042, kept).
- Required names: no change; the ruleset `frostyard: default branch` (ADR-0040) keeps them.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/clix --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
  NOTE  no --required-check or --required-check-any given; the ruleset "frostyard: required checks" is not touched (labels still applied)
WOULD  POST repos/frostyard/clix/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/clix/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/clix/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/clix/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
4 change(s) planned for frostyard/clix; re-run with --apply to make them.
```

#### frostyard/firn

- Owner: Murbella. Group A. Merge queue: yes (ADR-0042, kept).
- Required names: the 4 names of the ruleset `frostyard: default branch` stay; the owner's comment adds 1 (see the hand step).
- Hand step: add `Graphical installer gate` to ruleset `frostyard: default branch` ([step 3](#step-3-hand-steps-in-existing-rulesets)).

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/firn --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
  NOTE  no --required-check or --required-check-any given; the ruleset "frostyard: required checks" is not touched (labels still applied)
WOULD  POST repos/frostyard/firn/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/firn/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/firn/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/firn/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
4 change(s) planned for frostyard/firn; re-run with --apply to make them.
```

#### frostyard/nsl

- Owner: Duncan. Group B. Merge queue: no.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6741951453): `verify`, `vulncheck`.
- Hand step: remove `release-config` from ruleset `main: required checks` ([step 3](#step-3-hand-steps-in-existing-rulesets)).

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/nsl --required-check verify --required-check vulncheck --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/frostyard/nsl/rulesets (create the required-checks ruleset: 2 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"verify","integration_id":15368},{"context":"vulncheck","integration_id":15368}]}}]}
WOULD  POST repos/frostyard/nsl/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/nsl/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/nsl/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/nsl/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for frostyard/nsl; re-run with --apply to make them.
```

#### frostyard/frostmail

- Owner: Irulan. Group B. Merge queue: no.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6742145574): `Verify (make verify)`, `Race detector`, `Windows (go test)`, `App UI (make ui-check)`, `App shell (make app-build, app-test)`, `Windows app (installer, WebView2 e2e)`, `Flatpak (build and test)`, `Flatpak sources (make flatpak-sources)`, `Snapshot .deb (make deb)`.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/frostmail --required-check 'Verify (make verify)' --required-check 'Race detector' --required-check 'Windows (go test)' --required-check 'App UI (make ui-check)' --required-check 'App shell (make app-build, app-test)' --required-check 'Windows app (installer, WebView2 e2e)' --required-check 'Flatpak (build and test)' --required-check 'Flatpak sources (make flatpak-sources)' --required-check 'Snapshot .deb (make deb)' --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/frostyard/frostmail/rulesets (create the required-checks ruleset: 9 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"Verify (make verify)","integration_id":15368},{"context":"Race detector","integration_id":15368},{"context":"Windows (go test)","integration_id":15368},{"context":"App UI (make ui-check)","integration_id":15368},{"context":"App shell (make app-build, app-test)","integration_id":15368},{"context":"Windows app (installer, WebView2 e2e)","integration_id":15368},{"context":"Flatpak (build and test)","integration_id":15368},{"context":"Flatpak sources (make flatpak-sources)","integration_id":15368},{"context":"Snapshot .deb (make deb)","integration_id":15368}]}}]}
WOULD  POST repos/frostyard/frostmail/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/frostmail/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/frostmail/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/frostmail/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for frostyard/frostmail; re-run with --apply to make them.
```

#### frostyard/frostnotes

- Owner: Irulan. Group B. Merge queue: no.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6742145997): `Verify (make verify)`, `Race detector`, `App UI (make ui-check)`, `App shell (make app-build, app-test)`, `Flatpak (build and test)`, `Flatpak sources (make flatpak-sources)`, `Snapshot .deb (make deb)`.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/frostnotes --required-check 'Verify (make verify)' --required-check 'Race detector' --required-check 'App UI (make ui-check)' --required-check 'App shell (make app-build, app-test)' --required-check 'Flatpak (build and test)' --required-check 'Flatpak sources (make flatpak-sources)' --required-check 'Snapshot .deb (make deb)' --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/frostyard/frostnotes/rulesets (create the required-checks ruleset: 7 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"Verify (make verify)","integration_id":15368},{"context":"Race detector","integration_id":15368},{"context":"App UI (make ui-check)","integration_id":15368},{"context":"App shell (make app-build, app-test)","integration_id":15368},{"context":"Flatpak (build and test)","integration_id":15368},{"context":"Flatpak sources (make flatpak-sources)","integration_id":15368},{"context":"Snapshot .deb (make deb)","integration_id":15368}]}}]}
WOULD  POST repos/frostyard/frostnotes/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/frostnotes/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/frostnotes/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/frostnotes/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for frostyard/frostnotes; re-run with --apply to make them.
```

#### frostyard/frostread

- Owner: Irulan. Group B. Merge queue: no.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6742146462): `Verify (make verify)`, `Race detector and cross-builds (make race cross)`, `web bundle (make web-check)`, `Desktop app (make app-check app-build)`, `Snapshot .deb (make deb)`, `Flatpak sources (make flatpak-sources)`, `Flatpak (build and test)`.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/frostread --required-check 'Verify (make verify)' --required-check 'Race detector and cross-builds (make race cross)' --required-check 'web bundle (make web-check)' --required-check 'Desktop app (make app-check app-build)' --required-check 'Snapshot .deb (make deb)' --required-check 'Flatpak sources (make flatpak-sources)' --required-check 'Flatpak (build and test)' --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/frostyard/frostread/rulesets (create the required-checks ruleset: 7 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"Verify (make verify)","integration_id":15368},{"context":"Race detector and cross-builds (make race cross)","integration_id":15368},{"context":"web bundle (make web-check)","integration_id":15368},{"context":"Desktop app (make app-check app-build)","integration_id":15368},{"context":"Snapshot .deb (make deb)","integration_id":15368},{"context":"Flatpak sources (make flatpak-sources)","integration_id":15368},{"context":"Flatpak (build and test)","integration_id":15368}]}}]}
WOULD  POST repos/frostyard/frostread/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/frostread/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/frostread/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/frostread/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for frostyard/frostread; re-run with --apply to make them.
```

#### frostyard/lodge

- Owner: Irulan. Group B. Merge queue: no.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6741973773): `Verify (make verify)`, `Race detector and cross-builds (make race cross)`, `lodge-client (make client-check)`, `lodge-ui (make ui-check)`, `the shell (make shell-check)`, `The kit off Linux (go test on Windows)`, `Snapshot .deb (make deb)`.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/lodge --required-check 'Verify (make verify)' --required-check 'Race detector and cross-builds (make race cross)' --required-check 'lodge-client (make client-check)' --required-check 'lodge-ui (make ui-check)' --required-check 'the shell (make shell-check)' --required-check 'The kit off Linux (go test on Windows)' --required-check 'Snapshot .deb (make deb)' --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/frostyard/lodge/rulesets (create the required-checks ruleset: 7 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"Verify (make verify)","integration_id":15368},{"context":"Race detector and cross-builds (make race cross)","integration_id":15368},{"context":"lodge-client (make client-check)","integration_id":15368},{"context":"lodge-ui (make ui-check)","integration_id":15368},{"context":"the shell (make shell-check)","integration_id":15368},{"context":"The kit off Linux (go test on Windows)","integration_id":15368},{"context":"Snapshot .deb (make deb)","integration_id":15368}]}}]}
WOULD  POST repos/frostyard/lodge/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/lodge/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/lodge/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/lodge/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for frostyard/lodge; re-run with --apply to make them.
```

#### frostyard/porter

- Owner: Irulan. Group B. Merge queue: no.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6741858914): `Verify (make verify)`, `Race detector (make race)`, `Web bundle (make web-check)`, `Snapshot .deb (make deb)`.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/porter --required-check 'Verify (make verify)' --required-check 'Race detector (make race)' --required-check 'Web bundle (make web-check)' --required-check 'Snapshot .deb (make deb)' --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/frostyard/porter/rulesets (create the required-checks ruleset: 4 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"Verify (make verify)","integration_id":15368},{"context":"Race detector (make race)","integration_id":15368},{"context":"Web bundle (make web-check)","integration_id":15368},{"context":"Snapshot .deb (make deb)","integration_id":15368}]}}]}
WOULD  POST repos/frostyard/porter/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/porter/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/porter/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/porter/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for frostyard/porter; re-run with --apply to make them.
```

#### frostyard/bootc-debian

- Owner: Lucilla. Group B. Merge queue: no.
- Required names: `ci` expected. The owner's comment on core#222 is not there yet (read 2026-11-09 16:00 UTC). Its bot pull requests (branch `auto-update-checksums`, opened by `check-dependencies.yml` with `GITHUB_TOKEN`) start no `pull_request` workflow; only `build.yml` runs on them, by a `workflow_dispatch`. So `ci` does not report on them today. Do this row only after `check-dependencies.yml` also dispatches `ci.yml` on that branch, and the owner's comment is on core#222.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/bootc-debian --required-check ci --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/frostyard/bootc-debian/rulesets (create the required-checks ruleset: 1 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"ci","integration_id":15368}]}}]}
WOULD  POST repos/frostyard/bootc-debian/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/bootc-debian/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/bootc-debian/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/bootc-debian/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for frostyard/bootc-debian; re-run with --apply to make them.
```

#### frostyard/frostyard-org

- Owner: Tamalane. Group B. Merge queue: no.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6741491586): `ci`, `Workers Builds: frostyard-org` (any app).

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/frostyard-org --required-check ci --required-check-any 'Workers Builds: frostyard-org' --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/frostyard/frostyard-org/rulesets (create the required-checks ruleset: 2 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"ci","integration_id":15368},{"context":"Workers Builds: frostyard-org"}]}}]}
WOULD  POST repos/frostyard/frostyard-org/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/frostyard-org/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/frostyard-org/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/frostyard-org/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for frostyard/frostyard-org; re-run with --apply to make them.
```

#### bketelsen/fleet

- Owner: Teg. Group B. Merge queue: no.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6743163891): `pytest`, `ansible-lint`, `tofu`.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh bketelsen/fleet --required-check pytest --required-check ansible-lint --required-check tofu --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/bketelsen/fleet/rulesets (create the required-checks ruleset: 3 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"pytest","integration_id":15368},{"context":"ansible-lint","integration_id":15368},{"context":"tofu","integration_id":15368}]}}]}
WOULD  POST repos/bketelsen/fleet/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/bketelsen/fleet/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/bketelsen/fleet/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/bketelsen/fleet/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for bketelsen/fleet; re-run with --apply to make them.
```

#### bketelsen/trimlights

- Owner: Irulan. Group B. Merge queue: no.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6741908871): `check`.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh bketelsen/trimlights --required-check check --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/bketelsen/trimlights/rulesets (create the required-checks ruleset: 1 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"check","integration_id":15368}]}}]}
WOULD  POST repos/bketelsen/trimlights/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/bketelsen/trimlights/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/bketelsen/trimlights/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/bketelsen/trimlights/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for bketelsen/trimlights; re-run with --apply to make them.
```

#### bketelsen/pi-pocket-team

- Owner: Sheeana. Group B. Merge queue: no.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6742160029): `Test`.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh bketelsen/pi-pocket-team --required-check Test --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/bketelsen/pi-pocket-team/rulesets (create the required-checks ruleset: 1 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"Test","integration_id":15368}]}}]}
WOULD  POST repos/bketelsen/pi-pocket-team/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/bketelsen/pi-pocket-team/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/bketelsen/pi-pocket-team/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/bketelsen/pi-pocket-team/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for bketelsen/pi-pocket-team; re-run with --apply to make them.
```

#### bketelsen/pi-pocket-dune

- Owner: Sheeana. Group B. Merge queue: no.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6741931398): `Check`.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh bketelsen/pi-pocket-dune --required-check Check --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/bketelsen/pi-pocket-dune/rulesets (create the required-checks ruleset: 1 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"Check","integration_id":15368}]}}]}
WOULD  POST repos/bketelsen/pi-pocket-dune/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/bketelsen/pi-pocket-dune/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/bketelsen/pi-pocket-dune/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/bketelsen/pi-pocket-dune/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for bketelsen/pi-pocket-dune; re-run with --apply to make them.
```

#### bketelsen/agentic-template

- Owner: Lucilla. Group B. Merge queue: no.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6741855591): `verify`.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh bketelsen/agentic-template --required-check verify --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/bketelsen/agentic-template/rulesets (create the required-checks ruleset: 1 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"verify","integration_id":15368}]}}]}
WOULD  POST repos/bketelsen/agentic-template/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/bketelsen/agentic-template/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/bketelsen/agentic-template/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/bketelsen/agentic-template/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for bketelsen/agentic-template; re-run with --apply to make them.
```

#### frostyard/apt-publisher

- Owner: Lucilla. Group C. Merge queue: no.
- Required names: `ci` expected. The owner's comment on core#222 is not there yet (read 2026-11-09 16:00 UTC). `ci` runs on every pull request today. Do this row only after the owner's comment is on core#222.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/apt-publisher --required-check ci --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/frostyard/apt-publisher/rulesets (create the required-checks ruleset: 1 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"ci","integration_id":15368}]}}]}
WOULD  POST repos/frostyard/apt-publisher/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/apt-publisher/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/apt-publisher/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/apt-publisher/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for frostyard/apt-publisher; re-run with --apply to make them.
```

#### frostyard/chairlift

- Owner: Duncan. Group C. Merge queue: no.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6741994998): `Lint`, `Unit Tests`, `Race Detection`, `E2E`, `Verify`, `Build (linux, amd64)`, `Build (linux, arm64)`.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/chairlift --required-check Lint --required-check 'Unit Tests' --required-check 'Race Detection' --required-check E2E --required-check Verify --required-check 'Build (linux, amd64)' --required-check 'Build (linux, arm64)' --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/frostyard/chairlift/rulesets (create the required-checks ruleset: 7 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"Lint","integration_id":15368},{"context":"Unit Tests","integration_id":15368},{"context":"Race Detection","integration_id":15368},{"context":"E2E","integration_id":15368},{"context":"Verify","integration_id":15368},{"context":"Build (linux, amd64)","integration_id":15368},{"context":"Build (linux, arm64)","integration_id":15368}]}}]}
WOULD  POST repos/frostyard/chairlift/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/chairlift/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/chairlift/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/chairlift/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for frostyard/chairlift; re-run with --apply to make them.
```

#### frostyard/flatpak-index

- Owner: Lucilla. Group C. Merge queue: no.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6742207029): `Test`.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/flatpak-index --required-check Test --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/frostyard/flatpak-index/rulesets (create the required-checks ruleset: 1 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"Test","integration_id":15368}]}}]}
WOULD  POST repos/frostyard/flatpak-index/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/flatpak-index/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/flatpak-index/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/flatpak-index/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for frostyard/flatpak-index; re-run with --apply to make them.
```

#### frostyard/homebrew-tap

- Owner: Lucilla. Group C. Merge queue: no.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6742204534): `Test`.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/homebrew-tap --required-check Test --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/frostyard/homebrew-tap/rulesets (create the required-checks ruleset: 1 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"Test","integration_id":15368}]}}]}
WOULD  POST repos/frostyard/homebrew-tap/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/homebrew-tap/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/homebrew-tap/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/homebrew-tap/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for frostyard/homebrew-tap; re-run with --apply to make them.
```

#### frostyard/igloo

- Owner: Duncan. Group C. Merge queue: no.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6741881240): `verify`, `test`, `Build`.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/igloo --required-check verify --required-check test --required-check Build --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/frostyard/igloo/rulesets (create the required-checks ruleset: 3 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"verify","integration_id":15368},{"context":"test","integration_id":15368},{"context":"Build","integration_id":15368}]}}]}
WOULD  POST repos/frostyard/igloo/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/igloo/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/igloo/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/igloo/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for frostyard/igloo; re-run with --apply to make them.
```

#### frostyard/incus

- Owner: Lucilla. Group C. Merge queue: no.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6742422275): `Build Incus (Debian Trixie)`.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/incus --required-check 'Build Incus (Debian Trixie)' --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/frostyard/incus/rulesets (create the required-checks ruleset: 1 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"Build Incus (Debian Trixie)","integration_id":15368}]}}]}
WOULD  POST repos/frostyard/incus/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/incus/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/incus/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/incus/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for frostyard/incus; re-run with --apply to make them.
```

#### frostyard/intuneme

- Owner: Duncan. Group C. Merge queue: no.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6742150926): `Verify`, `Vulncheck`, `Build`.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/intuneme --required-check Verify --required-check Vulncheck --required-check Build --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/frostyard/intuneme/rulesets (create the required-checks ruleset: 3 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"Verify","integration_id":15368},{"context":"Vulncheck","integration_id":15368},{"context":"Build","integration_id":15368}]}}]}
WOULD  POST repos/frostyard/intuneme/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/intuneme/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/intuneme/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/intuneme/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for frostyard/intuneme; re-run with --apply to make them.
```

#### frostyard/lab

- Owner: Murbella. Group C. Merge queue: no.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6743220546): `CI result`.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/lab --required-check 'CI result' --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/frostyard/lab/rulesets (create the required-checks ruleset: 1 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"CI result","integration_id":15368}]}}]}
WOULD  POST repos/frostyard/lab/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/lab/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/lab/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/lab/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for frostyard/lab; re-run with --apply to make them.
```

#### frostyard/omarchy-apps

- Owner: Lucilla. Group C. Merge queue: no.
- Required names: `ci` expected. The owner's comment on core#222 is not there yet (read 2026-11-09 16:00 UTC). Its bot pull requests (branch `update-upstream-versions`, opened by `check-dependencies.yml` with `GITHUB_TOKEN`) start no `pull_request` workflow; only `build.yml` runs on them, by a `workflow_dispatch`. So `ci` does not report on them today. Do this row only after `check-dependencies.yml` also dispatches `ci.yml` on that branch, and the owner's comment is on core#222.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/omarchy-apps --required-check ci --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/frostyard/omarchy-apps/rulesets (create the required-checks ruleset: 1 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"ci","integration_id":15368}]}}]}
WOULD  POST repos/frostyard/omarchy-apps/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/omarchy-apps/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/omarchy-apps/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/omarchy-apps/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for frostyard/omarchy-apps; re-run with --apply to make them.
```

#### frostyard/pilothouse

- Owner: Duncan. Group C. Merge queue: no.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6741995412): `Lint`, `Security Scan`, `Unit Tests`, `Race Detection`, `Verify`, `Build (linux, amd64)`, `Build (linux, arm64)`.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/pilothouse --required-check Lint --required-check 'Security Scan' --required-check 'Unit Tests' --required-check 'Race Detection' --required-check Verify --required-check 'Build (linux, amd64)' --required-check 'Build (linux, arm64)' --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/frostyard/pilothouse/rulesets (create the required-checks ruleset: 7 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"Lint","integration_id":15368},{"context":"Security Scan","integration_id":15368},{"context":"Unit Tests","integration_id":15368},{"context":"Race Detection","integration_id":15368},{"context":"Verify","integration_id":15368},{"context":"Build (linux, amd64)","integration_id":15368},{"context":"Build (linux, arm64)","integration_id":15368}]}}]}
WOULD  POST repos/frostyard/pilothouse/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/pilothouse/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/pilothouse/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/pilothouse/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for frostyard/pilothouse; re-run with --apply to make them.
```

#### frostyard/problem-intake

- Owner: Murbella. Group C. Merge queue: no.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6741828499): `ci`.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/problem-intake --required-check ci --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/frostyard/problem-intake/rulesets (create the required-checks ruleset: 1 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"ci","integration_id":15368}]}}]}
WOULD  POST repos/frostyard/problem-intake/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/problem-intake/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/problem-intake/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/problem-intake/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for frostyard/problem-intake; re-run with --apply to make them.
```

#### frostyard/repogen

- Owner: Lucilla. Group C. Merge queue: yes.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6741866014): `make ci`.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/repogen --required-check 'make ci' --merge-queue --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
  preflight: make ci -> .github/workflows/ci.yml (merge_group: yes)
WOULD  POST repos/frostyard/repogen/rulesets (create the required-checks ruleset: 1 check(s), merge queue)
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":true,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"make ci","integration_id":15368}]}},{"type":"merge_queue","parameters":{"merge_method":"SQUASH","grouping_strategy":"ALLGREEN","max_entries_to_build":5,"min_entries_to_merge":1,"max_entries_to_merge":5,"min_entries_to_merge_wait_minutes":0,"check_response_timeout_minutes":60}}]}
WOULD  POST repos/frostyard/repogen/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/repogen/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/repogen/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/repogen/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for frostyard/repogen; re-run with --apply to make them.
```

#### frostyard/snosi

- Owner: Murbella. Group C. Merge queue: no.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6743083516): `verify`, `shell-lint`, `publication-guard-tests`, `runtime-etc-guard`, `bootc-secure-contracts`, `mkosi-config-sanity`, `installer-redirect-worker`.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/snosi --required-check verify --required-check shell-lint --required-check publication-guard-tests --required-check runtime-etc-guard --required-check bootc-secure-contracts --required-check mkosi-config-sanity --required-check installer-redirect-worker --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/frostyard/snosi/rulesets (create the required-checks ruleset: 7 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"verify","integration_id":15368},{"context":"shell-lint","integration_id":15368},{"context":"publication-guard-tests","integration_id":15368},{"context":"runtime-etc-guard","integration_id":15368},{"context":"bootc-secure-contracts","integration_id":15368},{"context":"mkosi-config-sanity","integration_id":15368},{"context":"installer-redirect-worker","integration_id":15368}]}}]}
WOULD  POST repos/frostyard/snosi/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/snosi/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/snosi/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/snosi/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for frostyard/snosi; re-run with --apply to make them.
```

#### frostyard/snowkit

- Owner: Duncan. Group C. Merge queue: no.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6741881687): `Lint`, `Unit Tests`, `Race Detection`, `Verify`, `Vulnerability Check`.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/snowkit --required-check Lint --required-check 'Unit Tests' --required-check 'Race Detection' --required-check Verify --required-check 'Vulnerability Check' --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/frostyard/snowkit/rulesets (create the required-checks ruleset: 5 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"Lint","integration_id":15368},{"context":"Unit Tests","integration_id":15368},{"context":"Race Detection","integration_id":15368},{"context":"Verify","integration_id":15368},{"context":"Vulnerability Check","integration_id":15368}]}}]}
WOULD  POST repos/frostyard/snowkit/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/snowkit/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/snowkit/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/snowkit/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for frostyard/snowkit; re-run with --apply to make them.
```

#### frostyard/testsuite

- Owner: Murbella. Group C. Merge queue: no.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6741828098): `Repository gate`.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh frostyard/testsuite --required-check 'Repository gate' --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/frostyard/testsuite/rulesets (create the required-checks ruleset: 1 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"Repository gate","integration_id":15368}]}}]}
WOULD  POST repos/frostyard/testsuite/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/frostyard/testsuite/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/frostyard/testsuite/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/frostyard/testsuite/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for frostyard/testsuite; re-run with --apply to make them.
```

#### bketelsen/truenas-mcp

- Owner: Moneo. Group C. Merge queue: no.
- Required names, from [the owner's comment](https://github.com/frostyard/core/issues/222#issuecomment-6741537520): `Lint`, `Verify`, `Tests`, `Build (linux, amd64)`, `Build (linux, arm64)`, `Build (darwin, arm64)`, `Build (windows, amd64)`.

Command (with `--apply`; the dry run is the same command without it):

```sh
scripts/apply-triage-settings.sh bketelsen/truenas-mcp --required-check Lint --required-check Verify --required-check Tests --required-check 'Build (linux, amd64)' --required-check 'Build (linux, arm64)' --required-check 'Build (darwin, arm64)' --required-check 'Build (windows, amd64)' --apply
```

Dry run (2026-11-09T15:45:24Z, JSON bodies in compact form):

```text
WOULD  POST repos/bketelsen/truenas-mcp/rulesets (create the required-checks ruleset: 7 check(s))
{"name":"frostyard: required checks","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"Lint","integration_id":15368},{"context":"Verify","integration_id":15368},{"context":"Tests","integration_id":15368},{"context":"Build (linux, amd64)","integration_id":15368},{"context":"Build (linux, arm64)","integration_id":15368},{"context":"Build (darwin, arm64)","integration_id":15368},{"context":"Build (windows, amd64)","integration_id":15368}]}}]}
WOULD  POST repos/bketelsen/truenas-mcp/labels (create label level:L1)
{"name":"level:L1","color":"B60205","description":"Read every line"}
WOULD  POST repos/bketelsen/truenas-mcp/labels (create label level:L2)
{"name":"level:L2","color":"D93F0B","description":"Read the diff"}
WOULD  POST repos/bketelsen/truenas-mcp/labels (create label level:L3)
{"name":"level:L3","color":"FBCA04","description":"Skim"}
WOULD  POST repos/bketelsen/truenas-mcp/labels (create label level:L4)
{"name":"level:L4","color":"0E8A16","description":"Title and CI"}
5 change(s) planned for bketelsen/truenas-mcp; re-run with --apply to make them.
```

## Operational notes

- The dry runs above ran at 2026-11-09T15:45:24Z as `frostyard-machines`,
  with core at `17c84bf`. Settings and labels
  can change after that. Run the dry run again just before `--apply`; it must
  print the same `WOULD` lines.
- After the steps, `node scripts/required-checks-survey.mjs OWNER/REPO...`
  (read only) shows for each repository the required names, strict, queue,
  the `pr-triage` caller and how many of the 4 level labels exist. Each row
  must show the names of its table row (with the names of a group B ruleset),
  4/4 level labels, and for repogen strict and queue yes.
- When `--apply` or a web UI step fails (for example a name that GitHub
  refuses), stop for that repository and put the repository and the error
  text in a comment on core#222. The repository owner corrects the name, or
  this runbook gets a corrected command. Nothing is retried as the bot.
- A renamed or removed job blocks every pull request until the ruleset
  changes. The owner changes the ruleset in the same change as the rename
  (item 12 of ADR-0071).
- In frostyard/repogen, the merge button becomes "Merge when ready": the
  queue runs `make ci` on the tip of `main` with the pull request, then
  merges it.
- The `levels` step labels a pull request on its next event (opened,
  synchronize, reopened, edited). Pull requests that were open before the
  labels existed get their level label in the rollout check, by a backfill.

## References

- Rationale: [ADR-0076](../adr/0076-require-status-checks-on-every-default-branch.md),
  [ADR-0078](../adr/0078-sort-pull-requests-by-levels-l1-to-l4.md),
  [ADR-0077](../adr/0077-bind-ready-for-human-to-the-head-commit.md),
  [ADR-0042](../adr/0042-adopt-a-merge-queue-on-the-default-branch.md),
  [ADR-0040](../adr/0040-publish-the-repository-settings-contract.md),
  [ADR-0071](../adr/0071-hold-every-code-repository-to-one-baseline.md)
- Contracts: [specs/repository-baseline.md](../specs/repository-baseline.md)
  (row B18), [specs/pr-triage.md](../specs/pr-triage.md),
  [specs/risk-paths.md](../specs/risk-paths.md)
- Tools: [scripts/apply-triage-settings.sh](../../scripts/apply-triage-settings.sh),
  [scripts/required-checks-survey.mjs](../../scripts/required-checks-survey.mjs)
- Names: [core#222](https://github.com/frostyard/core/issues/222); background:
  [core#218](https://github.com/frostyard/core/issues/218)
- Context: [design: quality loop](quality-loop.md),
  [design: Dependabot shadow](dependabot-shadow.md)
