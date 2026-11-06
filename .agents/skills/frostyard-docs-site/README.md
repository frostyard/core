# frostyard-docs-site skill

Applies a Frostyard-branded ProperDocs + MaterialX documentation site to a
frostyard tool repository as `site/`, with a GitHub Pages workflow and the
`make site` targets that build it. The apply procedure is in
[SKILL.md](SKILL.md).

## Layout

- `scaffold/` — the payload a repository copies as `site/`: the ProperDocs
  configuration, the hash-locked requirements, the pages, the Frostyard
  stylesheet and the logo placeholder.
- `templates/` — the files that live outside `site/`: `site.yml` becomes
  `.github/workflows/site.yml`, and `site.mk` is pasted into the repository's
  `Makefile`.
- `tests/` — the scaffold build test. It stays with this skill; a consuming
  repository copies `scaffold/` only.

## Test

From the repository root:

```sh
node --test .agents/skills/frostyard-docs-site/tests/*.test.mjs
```

The test needs `python3`; it copies `scaffold/` to a temporary directory,
installs `requirements.txt` with `--require-hashes`, builds the site with
`--strict`, and asserts on the rendered output. It also checks the requirement
hashes, the workflow's action pins and the Makefile fragment.

## Maintenance

- `scaffold/requirements.txt` is a `uv pip compile --universal
  --generate-hashes` lock of `scaffold/requirements.in`. Regenerate it, never
  edit it by hand.
- `scaffold/content/stylesheets/frostyard.css` holds the Frostyard tokens from
  `../frostyard-design/tokens/colors.css`; keep the two in step.
- A repository that applied an older copy updates by diffing its `site/`
  against `scaffold/`.
