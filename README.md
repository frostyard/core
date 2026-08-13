# core

The org-wide hub for the [frostyard](https://github.com/frostyard)
organization. This repo hosts the shared material every frostyard project
draws on — agent skills, templates, assets, org-level docs — and is the home
for org-wide [issues](https://github.com/frostyard/core/issues) and
[discussions](https://github.com/frostyard/core/discussions). It contains no
application code.

Built from [agentic-template](https://github.com/bketelsen/agentic-template):
one canonical `AGENTS.md` instruction surface for every coding agent, a
four-question docs taxonomy, and skills as first-class files.

## What lives here

- **`.agents/skills/`** — org-wide agent skills, shared across frostyard
  repos (`.claude/skills` is a symlink). Includes the
  [Frostyard design system](.agents/skills/frostyard-design/) (migrated from
  the archived `frostyard/design-system` repo, history preserved) and the
   [docs-site scaffolding skill](.agents/skills/frostyard-docs-site/). See the
   [shared-skills guide](docs/design/shared-skills.md) for discovery and
   ownership.
- **`templates/`** — document and repository templates for starting new
  frostyard work.
- **`assets/`** — shared assets: logos, badges, diagrams, and other common
  media.
- **`docs/`** — org-level documentation, split by the question it answers
  (see [docs/README.md](docs/README.md)).
- **Issues & Discussions** — org-wide planning, proposals, and conversation
  that spans more than one repo.

## Layout

```
AGENTS.md                     canonical agent instructions (the law)
CLAUDE.md → AGENTS.md         symlink for Claude Code
GEMINI.md → AGENTS.md         symlink for Gemini CLI
.github/copilot-instructions.md → AGENTS.md
.agents/skills/               canonical skills; TEMPLATE/SKILL.md to copy
.claude/skills → .agents/skills
templates/                    doc & repo templates for new frostyard work
assets/                       shared logos, badges, diagrams, media
docs/README.md                taxonomy + index (every doc gets a line)
docs/adr/                     why — immutable decisions + TEMPLATE.md
docs/design/                  how — living architecture docs + TEMPLATE.md
docs/specs/                   what — testable contracts + TEMPLATE.md
docs/plans/                   when — phased plans + TEMPLATE.md
```

Symlinks require Linux/macOS (or `core.symlinks=true` on Windows); GitHub's
web renderer shows symlinks as their target path, which is cosmetic only.

## Contributing

Make shared-material changes in this repository, not in a consuming project's
copy. Start from a fresh branch off `main`; do not stack a branch on another
PR branch.

1. Edit canonical paths only. `AGENTS.md` is the source for the instruction
   aliases (including `CONTRIBUTING.md`), and `.agents/skills/` is the source
   for the `.claude/skills` alias.
2. Put docs in the appropriate `docs/` category, start new docs from that
   category's `TEMPLATE.md`, add them to `docs/README.md`, and maintain the
   required cross-links. Update skills, templates, and assets at their
   canonical paths.
3. Run `node scripts/check-docs.mjs` before opening a documentation change.
   When changing the docs-site scaffold, also run `npm ci && npm test` from
   `.agents/skills/frostyard-docs-site/scaffold/`.
4. Open a PR from the branch, declare its risk tier, and complete the
   applicable housekeeping items in the PR template. Core squash-merges PRs;
   do not merge your own change.
