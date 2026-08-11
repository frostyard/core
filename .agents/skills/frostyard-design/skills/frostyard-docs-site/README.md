# frostyard-docs-site skill

Applies a Frostyard-branded Astro docs site to any project repo as `site/`. The apply procedure is in `SKILL.md`; the payload is `scaffold/`.

## Install (once, to use from any repo)

```sh
ln -sfn "$HOME/projects/frostyard/design-system/skills/frostyard-docs-site" \
  "$HOME/.claude/skills/frostyard-docs-site"
```

## Maintenance

- `scaffold/src/styles/tokens/*.css` are vendored copies of this repo's `tokens/*.css`. When tokens change, re-copy and commit.
- The shell CSS (`scaffold/src/styles/docs.css`) derives from `ui_kits/docs/docs.css`; keep visual changes in sync manually.
- Repos that applied an older scaffold re-apply by diffing their `site/` against `scaffold/` (automated updates are out of scope).
