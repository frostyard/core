# Spec: README

The exact shape of the root `README.md` of every repository the team owns
([ADR-0072](../adr/0072-write-every-readme-to-one-standard.md)). Owners and
agents write a README to it with the
[frostyard-readme skill](../../.agents/skills/frostyard-readme/SKILL.md),
which holds a template for each kind. The weekly conformance sweep checks it
as row B17 of the [repository baseline](repository-baseline.md). The
checker `.agents/skills/frostyard-readme/scripts/check-readme.mjs` runs
rules R1 to R12; `test/readme-check.test.mjs` holds the checker, the
templates and core's own `README.md` to them.

A README answers 4 questions for a first-time reader, in this order: what
is it, can I use it, how do I start, and where is the rest. Everything else
lives in the documentation site (user guides, [ADR-0070](../adr/0070-build-tool-docs-sites-with-materialx-on-github-pages.md))
or in `docs/` (decisions, designs, specs, plans, runbooks,
[ADR-0025](../adr/0025-consolidate-repository-docs-into-docs.md)).

## Interface

### Kinds

Each README declares 1 kind. The kind sets the sections between the top
block and `## Develop`.

| Kind | What the repository delivers | Examples (2026-11-06) |
| --- | --- | --- |
| `org` | the org hub or the repository template | core, bketelsen/agentic-template |
| `image` | operating system images and their sysexts | snosi |
| `packaging` | packages built from other sources, or a package repository or remote | apt-publisher, bootc-debian, omarchy-apps, flatpak-index, homebrew-tap |
| `app` | a desktop application with a window (GTK, Tauri, Flatpak) | chairlift, igloo, frostnotes, frostmail |
| `extension` | an extension to another program (a GNOME Shell extension, a Pi Pocket extension) | bketelsen/pi-pocket-team, bketelsen/pi-pocket-dune |
| `tool` | a command that people install and run (CLI, TUI, installer, MCP server) | nsl, updex, repogen, firn, intuneme, bketelsen/truenas-mcp |
| `website` | a website that people read | frostyard-org |
| `service` | a daemon, worker or web application that runs on a host and serves people over a network | lodge, porter, frostread, pilothouse, problem-intake, bketelsen/trimlights |
| `library` | a module that other code imports, with no command | clix, std, snowkit |
| `infrastructure` | configuration, pipelines, test suites or records for the team's own machines | lab, testsuite, bketelsen/fleet, bketelsen/pi-pocket-config |

**Pick the kind.** Go down the table from `org` to `infrastructure` and take
the first row that describes the main thing the repository delivers: the
thing a first-time reader most likely came for. A repository that delivers
more than 1 thing takes 1 kind and names the others in `What it does` or
`What is here`. Examples: updex is an SDK and a CLI, so it is a `tool`;
frostnotes has a daemon, a CLI and a desktop app, so it is an `app`; repogen
generates package repositories but ships a command, so it is a `tool`; lab
serves a QA dashboard, but it is the QA pipeline, so it is
`infrastructure`. The owner decides; the marker (R1) records the decision,
and the table above is not a rule.

### Layout

```markdown
<!-- readme-kind: tool -->
<img src="assets/icon.svg" alt="nsl icon" width="112" align="right">

# nsl

[![CI](https://github.com/frostyard/nsl/actions/workflows/ci.yml/badge.svg)](https://github.com/frostyard/nsl/actions/workflows/ci.yml)

**Leave the host alone. Work in another distro.**

nsl gives you persistent Linux machines on a Linux host, as WSL does on
Windows. Each machine is a whole distro with its own packages and services.

**Status:** pre-release. The tested host is Snow Linux 13.

**Documentation:** [frostyard.github.io/nsl](https://frostyard.github.io/nsl/)

## What it does
## Install
## Use
## Develop
## Where to go next
```

The **top block** is everything before the first `##` heading: the kind
marker, an optional icon, the title, optional badges, an optional tagline,
the lead, the status line and the documentation line, in that order.

| Part | Required | Content |
| --- | --- | --- |
| Kind marker | yes | `<!-- readme-kind: <kind> -->`, 1 line; the first line is best |
| Icon | no | 1 `<img>` of the product's icon or logo, at most 128 px wide, before or after the title |
| Title | yes | `# <name>`: the product's name as the product writes it (`nsl`, `Igloo`, `frostyard.org`) |
| Badges | no | at most 3, from the list in R6, on 1 line under the title |
| Tagline | no | 1 bold line of at most 12 words |
| Lead | yes | 1 or 2 short paragraphs. The first sentence says what the thing is and who it is for. No history, no internals |
| Status line | yes | `**Status:** <value>.` and at most 1 more sentence (R4) |
| Documentation line | yes | `**Documentation:**` and the link where the full documentation is (R5) |

The status line and the documentation line are 2 paragraphs, with a blank
line between them, so that each renders on its own line.

### Sections

Each `##` heading starts with 1 of the names below (case does not matter, so
`## Install apps` and `## Installation` match `Install`). The kind's
required sections come first, in the order shown. Optional sections can go
between them. `## Develop` and `## Where to go next` are always the last 2.
No other `##` heading is allowed.

| Kind | Required, in order | Optional, for this kind |
| --- | --- | --- |
| `org` | `What is here`, `Use` | |
| `image` | `Images`, `Install` | |
| `packaging` | `What it publishes`, `Install` | `Add a package` |
| `app` | `What it does`, `Install` | `Remove` |
| `extension` | `What it does`, `Install` | `Settings`, `Remove` |
| `tool` | `What it does`, `Install`, `Use` | |
| `website` | `What the site covers`, `Deploy` | |
| `service` | `What it does`, `Deploy` | `Interface` |
| `library` | `What it does`, `Install`, `Use` | |
| `infrastructure` | `What is here`, `Use` | |

Optional for every kind: `Requirements`, `How it works`, `Problem records`,
`Privacy`, `Limits`, `Credits`.

The content of each section, below, guides the owner and the reviewer. The
sweep checks only the rules R1 to R12.

| Section | Content |
| --- | --- |
| `What it does` | At most 8 bullets or table rows, 1 or 2 sentences each, each with a link to the page that tells more. A library lists its packages in a table (snowkit) |
| `What is here` | A table of the top-level parts: path and what it is, at most 10 rows |
| `What it publishes` | A table: each package or app, what it is, and where it goes (component, codename, remote) |
| `What the site covers` | At most 8 bullets with links to the live pages |
| `Images` | A table: each image, its purpose and its base |
| `Install` | The shortest supported way to install or to add the repository, remote or tap, in at most 10 command lines, and a link to the other ways |
| `Use` | 1 to 5 commands that give a first result, or a library example of at most 20 lines, and a link to the reference. For `org` and `infrastructure`: how a reader uses the repository, with links |
| `Deploy` | Where it runs and how a change reaches production, in 1 paragraph, with links to the runbooks in `docs/` |
| `Interface` | The endpoints or the contract, in a table of at most 10 rows, or a link to the spec |
| `Requirements` | What the host needs, in 1 paragraph or a short list |
| `How it works` | 1 paragraph and a link to the design document |
| `Problem records` | What the program writes to the local journal and what it sends (ADR-0069), in 1 paragraph, and the command that shows the records |
| `Privacy` | The privacy rules, at most 6 bullets |
| `Limits` | The known limits, at most 6 bullets, with links to their issues |
| `Credits` | The projects it draws on |
| `Settings` | The settings, in a table of at most 10 rows |
| `Remove` | The commands that remove it, and what they keep |
| `Add a package` | 1 paragraph and a link to the procedure in `docs/` |
| `Develop` | 1 code block of at most 10 lines that sets up the tools and runs the gate (`mise install`, `make ci`), and a link to the full build guide |
| `Where to go next` | A list with a link to each of `AGENTS.md`, `docs/README.md`, `SECURITY.md` and `LICENSE` that the repository has, 1 line each |

## Rules

Each rule has an ID, a read-only check, and the checker's output prefix.
Run the checker from a core checkout at `origin/main`:

```sh
node .agents/skills/frostyard-readme/scripts/check-readme.mjs --ref <commit> <clone>
```

It reads `README.md` at `<commit>` in `<clone>` (`git show`), or the
working tree without `--ref`. It prints 1 `FAIL R<n>` line for each failed
rule and exits 1, or prints `ok` and exits 0. It writes nothing.

| ID | Rule | Check |
| --- | --- | --- |
| R1 | Kind marker | Exactly 1 line is `<!-- readme-kind: <kind> -->`, and `<kind>` is in the kinds table. |
| R2 | Title | Outside fenced code, the first heading is the only `#` heading. |
| R3 | Top block | The top block has a lead paragraph before the status line, and at most 130 words, without the marker, images and badges. |
| R4 | Status line | The top block has 1 line that starts with `**Status:**`, then 1 of `pre-release`, `stable`, `in production`, `maintenance` or `deprecated`; the line has at most 40 words. |
| R5 | Documentation line | The top block has 1 line that starts with `**Documentation:**` and holds at least 1 link. A `library` links `https://pkg.go.dev/`. |
| R6 | Badges | At most 3 badges (`[![`), all in the top block, each 1 of: a GitHub Actions workflow badge, OpenSSF Scorecard (`api.scorecard.dev`), Go reference (`pkg.go.dev/badge`), coverage (`codecov.io`), latest release (`img.shields.io/github/v/release`). |
| R7 | Sections | The `##` headings outside fenced code match the kind's sections table: every required section in order, only allowed names, `Develop` then `Where to go next` last. |
| R8 | Heading depth | Outside fenced code, no heading is deeper than `##`. |
| R9 | Develop | The `Develop` section has a fenced code block with a `make ci`, `make check` or `make verify` line. |
| R10 | Links | The `Where to go next` section links each of `AGENTS.md`, `docs/README.md`, `SECURITY.md` (or `.github/SECURITY.md`) and `LICENSE` that is in the tree. |
| R11 | Length | The file has at most 1000 words (`wc -w README.md`). |
| R12 | Kept out | No emoji (Unicode `Extended_Pictographic`, except ©, ® and ™); no private IPv4 address (`10/8`, `172.16/12`, `192.168/16`, `100.64/10`), in code blocks too; at most 2 dates in `YYYY-MM-DD` form outside fenced code; no tree drawing (`├──`, `└──`). |

Status values:

| Value | Meaning |
| --- | --- |
| `pre-release` | It works and the owner uses it; behavior and formats can change with no migration path. |
| `stable` | Releases keep compatibility within a major version; `SECURITY.md` names the versions that get fixes. |
| `in production` | It is deployed or published from `main`, with no versioned releases: a website, a service, a package repository, infrastructure, core. |
| `maintenance` | It gets fixes only, no new features. |
| `deprecated` | Do not start to use it; the status line names the replacement. |

Documentation line targets:

| Kind | Link |
| --- | --- |
| A user-facing tool (baseline B9) | `https://frostyard.github.io/<repo>/` |
| `library` | `https://pkg.go.dev/github.com/frostyard/<repo>` |
| `website` | the live site |
| `image` | the image's user documentation (frostyard.org/docs for snosi), or `docs/README.md` |
| Other | `docs/README.md` |

### What stays out of a README

The README links to these; it does not hold them. R7, R8, R11 and R12 catch
most of them.

| Content | Where it goes |
| --- | --- |
| User guides, the full install matrix, the CLI and configuration reference, troubleshooting | The tool's documentation home: its site or its frostyard.org guide (ADR-0070, ADR-0084), or `docs/` when there is none |
| Build internals, pipeline stages, how the parts fit | `docs/design/` (ADR-0025) |
| Long check lists, test matrices, release and verification steps | `docs/` (a runbook, a design or a spec), or the skill that runs them |
| Operations runbooks: deploy, update, roll back, recover | `docs/`, linked from `Deploy` |
| History, milestones, what changed and when | Release notes, `docs/plans/`, the ADRs |
| Repository layout trees | `What is here` (top level only) and `AGENTS.md` |
| Host inventories, addresses, account names | `docs/` of a private repository; never a public README |
| Agent rules | `AGENTS.md` |

### Other rules

- The rules apply to the root `README.md` only. `docs/README.md` and other
  READMEs in subdirectories follow their own templates.
- Examples use documentation addresses (`192.0.2.0/24`, `example.org`), not
  real ones.
- Headings use sentence case and products keep their own spelling, as the
  frostyard-design brand rules say.
- A fork follows its upstream README and is out of scope (ADR-0071). Its
  README starts with 1 line that links the file that says how the fork
  differs (Logomenu's `FROSTYARD.md`).
- An archived repository is out of scope.
- bketelsen/homewiki is out of scope
  ([ADR-0079](../adr/0079-exempt-the-homelab-inventory-wiki-from-the-readme-spec.md)):
  it is a private inventory wiki, and its root `README.md` is the wiki's
  page index, which the wiki's own `AGENTS.md` governs.
- A finding names the rule ID and quotes the checker's line. Its sweep key
  is `<repo>/baseline-B17`.
- A rule that conflicts with a repository's own accepted ADR is a
  "conflict" finding that quotes both; the sweep does not choose.
- A change to a rule changes the checker, its test and the templates in
  the same pull request, and needs an ADR that amends ADR-0072.

## Derived artifacts

| Artifact | Derivation |
| --- | --- |
| `.agents/skills/frostyard-readme/scripts/check-readme.mjs` | Implements R1 to R12 and the kinds and sections tables. |
| `.agents/skills/frostyard-readme/templates/<kind>.md.tmpl` | 1 template for each kind; each passes the checker. |
| `test/readme-check.test.mjs` | Holds the checker to each rule, every template, and core's `README.md`. |
| [Repository baseline](repository-baseline.md) row B17 | Points the sweep at this spec. |

## References

- Rationale: [ADR-0072](../adr/0072-write-every-readme-to-one-standard.md),
  [ADR-0079](../adr/0079-exempt-the-homelab-inventory-wiki-from-the-readme-spec.md),
  [ADR-0071](../adr/0071-hold-every-code-repository-to-one-baseline.md),
  [ADR-0070](../adr/0070-build-tool-docs-sites-with-materialx-on-github-pages.md),
  [ADR-0084](../adr/0084-accept-a-tools-own-site-or-a-frostyard-org-guide-as-its-docs-home.md),
  [ADR-0025](../adr/0025-consolidate-repository-docs-into-docs.md)
- Context: [design: quality loop](../design/quality-loop.md),
  [design: shared skills](../design/shared-skills.md)
