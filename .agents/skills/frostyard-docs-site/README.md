# frostyard-docs-site skill

Applies a Frostyard-branded Astro docs site to any project repo as `site/`. The apply procedure is in `SKILL.md`; the payload is `scaffold/`.

## Install (once, to use from any repo)

Run this from any clone of the core repository:

```sh
core_dir=$(git rev-parse --show-toplevel)
mkdir -p "$HOME/.claude/skills"
ln -sfn "$core_dir/.agents/skills/frostyard-docs-site" \
  "$HOME/.claude/skills/frostyard-docs-site"
```

This installs a symlink in Claude Code's user-level skill-discovery directory;
the source remains the checkout you ran the command from.

## Maintenance

- `scaffold/src/styles/tokens/*.css` are vendored copies of the design system's `../frostyard-design/tokens/*.css`. When tokens change, re-copy and commit.
- The shell CSS (`scaffold/src/styles/docs.css`) derives from `../frostyard-design/ui_kits/docs/docs.css`; keep visual changes in sync manually.
- Repos that applied an older scaffold re-apply by diffing their `site/` against `scaffold/` (automated updates are out of scope).
