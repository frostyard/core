# 0072 — Write every README to one standard

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

On 2026-11-06, the team owns 35 active repositories, not counting archived
repositories and the forks that follow their upstream (hotedge, Logomenu,
incus): 27 in frostyard and 8 in bketelsen. Their root `README.md` files
differ in purpose, shape and size:

- Sizes go from 173 words (snowkit) to 23,892 words (pi-pocket-team).
  18 READMEs have more than 1000 words; 10 have fewer than 700. frostyard/std
  has no `README.md`.
- The long READMEs hold manuals: install matrices, CLI and configuration
  references, build internals, test matrices, release steps and operations
  runbooks (repogen 5132 words, pilothouse 5872, lab 7300, updex 4940).
  repogen has 52 `###` headings; chairlift has 20.
- Some READMEs do not say what the repository is. Most of frostyard-org's
  187 lines are build and documentation internals; the archived www-snowlinux still holds the
  Starlight starter text.
- Status paragraphs grow into history: lab has 17 dates outside code
  blocks, frostread 7, lodge 5, bketelsen/fleet 12.
- lab, a public repository, names 3 private host addresses in its README.
- 14 READMEs link `AGENTS.md`; 2 link `SECURITY.md`. Badges appear in 5:
  CI, OpenSSF Scorecard and coverage. chairlift and repogen use emoji
  headings, which the Frostyard brand rules forbid.
- The short READMEs that work share 1 shape: a lead that says what the
  thing is, a short list of what it does with links, the shortest install,
  a first use, and links to the documentation and to `AGENTS.md` (nsl 749
  words, snowkit 173, lodge 345, core 438, snosi 592).
- ADR-0070 puts user documentation for tools on a documentation site, and
  ADR-0025 puts maintainer documentation in `docs/`. Neither says what stays
  in the README.
- ADR-0071 defines the repository baseline that the weekly conformance
  sweep checks. It has no README row.

## Decision

- **Every repository the team owns has a root `README.md` written to the
  [README spec](../specs/readme.md).** This covers the frostyard code
  repositories of ADR-0071 and the team's bketelsen repositories. Forks and
  archived repositories are out of scope.
- **A README is a front page, not a manual.** It says what the thing is,
  whether a reader can use it, how to start, and where the rest is. User
  guides and references go to the documentation site (ADR-0070). Build
  internals, check lists, runbooks and history go to `docs/` (ADR-0025).
  Host inventories and addresses never go in a public README.
- **Each README declares 1 of 10 kinds** in a comment marker:
  `org`, `image`, `packaging`, `app`, `extension`, `tool`, `website`,
  `service`, `library` and `infrastructure`. The owner picks the first kind,
  in that order, that describes the main thing the repository delivers. The
  kind sets the required sections.
- **Every kind shares a top block and a footer.** The top block holds the
  title, a lead of 1 or 2 paragraphs, a status line with 1 of 5 values
  (`pre-release`, `stable`, `in production`, `maintenance`, `deprecated`)
  and a documentation line. The footer is `## Develop` (the tool setup and
  the gate command) and `## Where to go next` (links to `AGENTS.md`,
  `docs/README.md`, `SECURITY.md` and `LICENSE`).
- **Limits are mechanical:** at most 1000 words, at most 3 badges from a
  fixed list, no heading below `##`, no `##` heading outside the kind's
  list, no emoji, no private address, and at most 2 dates outside code.
- **Core's `frostyard-readme` skill** holds 1 template for each kind and the
  procedure to write or fix a README. Its checker,
  `scripts/check-readme.mjs`, runs the spec's rules R1 to R12 and writes
  nothing. The skills sync carries the skill to every consumer repository
  as a default skill.
- **The repository baseline gains row B17, README.** The weekly
  conformance sweep runs the checker and files gaps as `sweep` issues with
  the key `<repo>/baseline-B17`. Owners fix them in grooming and baseline
  work, not in a wave of pull requests.

## Consequences

- Easier: a reader finds the same 4 answers in the same places in every
  repository. A reviewer and the sweep check a README with 1 command.
- Easier: a README stops drifting from the code, because the parts that
  change with the code (references, runbooks, internals) live next to the
  pages and docs that a change already updates.
- Harder: on 2026-11-06, no README except core's carries the kind marker,
  the status line and the documentation line, so every other repository
  gets a B17 finding. Most
  fixes are small for the short READMEs and a move of content to the site
  or `docs/` for the long ones.
- Harder: the section names are fixed. A README that needs a section the
  spec does not list puts that content in `docs/` and links it, or the spec
  changes by an ADR that amends this one.
- New obligations:
  - A change to a rule changes the checker, its test and the templates in
    the same pull request.
  - bketelsen/agentic-template tells a new repository to write its README
    from the skill, so new repositories start with B17.
  - The conformance sweep names B17 in its row list.

## Alternatives considered

- **Guidance with no checks:** the long READMEs grew while ADR-0025 and
  ADR-0070 already named the places for their content. A rule that no one
  checks does not stop the drift.
- **1 shape for every repository, with no kinds:** a library, a website and
  a package repository answer "how do I start" in different ways; 1 shape
  forces empty or wrong sections.
- **Free section names with a list of synonyms:** the sweep cannot check
  the order or the scope of sections that can have any name.
- **The kind in core's organization declarations:** only enrolled frostyard
  repositories have a declaration, and bketelsen repositories have none.
  The marker in the README travels with the file it describes.
- **A limit in lines:** line wrapping differs (nsl has 749 words in 56
  lines); words measure the reading time.
- **Generate READMEs from a manifest:** a generator adds a tool and a build
  step to every repository for a file that changes a few times a year.

## References

- Shapes: [spec: README](../specs/readme.md),
  [spec: repository baseline](../specs/repository-baseline.md) (row B17),
  [frostyard-readme skill](../../.agents/skills/frostyard-readme/SKILL.md),
  [design: shared skills](../design/shared-skills.md),
  [design: quality loop](../design/quality-loop.md)
- Builds on: [ADR-0025](0025-consolidate-repository-docs-into-docs.md),
  [ADR-0026](0026-distribute-core-skills-via-sync-prs.md),
  [ADR-0069](0069-report-problems-local-first-opt-in-with-one-sender-per-host.md),
  [ADR-0070](0070-build-tool-docs-sites-with-materialx-on-github-pages.md),
  [ADR-0071](0071-hold-every-code-repository-to-one-baseline.md)
- Amended in part by: [ADR-0079](0079-exempt-the-homelab-inventory-wiki-from-the-readme-spec.md)
