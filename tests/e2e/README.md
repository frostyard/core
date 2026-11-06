# End-to-end tests

The `scaffold-tests` symlink beside this file points at the repo's e2e
suite: [.agents/skills/frostyard-docs-site/tests/](../../.agents/skills/frostyard-docs-site/tests/)
([ADR-0029](../../docs/adr/0029-acmm-conformance-via-canonical-aliases.md)).

For a static-site payload, end-to-end means build-then-assert-on-output: the
suite copies `scaffold/` to a temporary directory, installs
`requirements.txt` with `--require-hashes`, builds the site with `properdocs
build --strict`, and asserts against the final `dist/` output a browser would
receive (the home page and its stylesheet, the Pagefind search index, a guide
page). It also pins the requirements' hashes, the workflow's action pins, the
Makefile fragment, and the skill's instructions to what the scaffold actually
contains.

The suite needs `python3`, and it does not skip when `python3` is missing.

Run it:

```sh
node --test .agents/skills/frostyard-docs-site/tests/*.test.mjs
```

CI runs the same command in the `scaffold-e2e` job of
[.github/workflows/ci.yml](../../.github/workflows/ci.yml).
