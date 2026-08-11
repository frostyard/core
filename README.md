# agentic-template

A GitHub template for projects built and maintained by LLM agents. It contains
no code — just the documentation structure and agent rules that make one-shot
agent work reliable, extracted from [bespoke](https://github.com/bketelsen/bespoke),
where this structure has held up across every coding agent thrown at it.

## Why this works

Agents succeed when the repository answers their questions before they ask:

- **One law, every agent.** `AGENTS.md` is the canonical instruction file;
  `CLAUDE.md`, `GEMINI.md`, and `.github/copilot-instructions.md` are symlinks
  to it, so Claude Code, Copilot, Gemini, and whatever comes next all read the
  same rules. Skills live once in `.agents/skills/` (`.claude/skills` is a
  symlink). No drift, ever.
- **Docs split by the question they answer.** `docs/adr/` (why — immutable),
  `docs/design/` (how — living), `docs/specs/` (what exactly — testable
  contracts), `docs/plans/` (when — phases with "Done when" outcomes). An agent
  that needs rationale, mechanism, contract, or sequence knows exactly where to
  look — and where to write.
- **Templates as enforcement.** Every category has a `TEMPLATE.md`; every new
  doc starts from it. Structure you don't have to think about is structure that
  stays consistent.
- **Mandatory cross-linking.** ADRs link the designs they shape; designs link
  their ADRs, specs, and roadmap phase; specs link back. A doc without its
  links is defined as incomplete, so the graph stays navigable from any entry
  point.
- **Live conventions only.** AGENTS.md's code-conventions section describes the
  code *as it is* — rules graduate in when the enforcing code lands. Agents
  following stale rules produce broken work; this structure makes stale rules a
  category error.
- **Skills over improvisation.** Multi-step procedures that repeat become
  `.agents/skills/<name>/SKILL.md` files with a frontmatter description agents
  can select on. Explaining a procedure twice means it should become a skill.

## Using this template

1. Click **Use this template** on GitHub (or `gh repo create myproject
   --template bketelsen/agentic-template`).
2. In `AGENTS.md`: replace the title and intro, then fill in the commented
   placeholder sections as your project takes shape — especially the project
   check command (`just check` / `make check` / …) that gates "done".
3. Set the dates in `docs/adr/0001` and `0002` to today; they're pre-accepted
   because this template implements them.
4. Write your first real ADR (0003) for your first significant choice —
   language, framework, storage — and keep going from there.
5. Delete this "Using this template" section and make the README describe your
   project.

## Layout

```
AGENTS.md                     canonical agent instructions (the law)
CLAUDE.md → AGENTS.md         symlink for Claude Code
GEMINI.md → AGENTS.md         symlink for Gemini CLI
.github/copilot-instructions.md → AGENTS.md
.agents/skills/               canonical skills; TEMPLATE/SKILL.md to copy
.claude/skills → .agents/skills
docs/README.md                taxonomy + index (every doc gets a line)
docs/adr/                     why — immutable decisions + TEMPLATE.md
docs/design/                  how — living architecture docs + TEMPLATE.md
docs/specs/                   what — testable contracts + TEMPLATE.md
docs/plans/                   when — phased plans + TEMPLATE.md
```

Symlinks require Linux/macOS (or `core.symlinks=true` on Windows); GitHub's
web renderer shows symlinks as their target path, which is cosmetic only.
