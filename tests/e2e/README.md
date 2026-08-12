# End-to-end tests

The `scaffold-tests` symlink beside this file points at the repo's e2e
suite: [.agents/skills/frostyard-docs-site/scaffold/tests/](../../.agents/skills/frostyard-docs-site/scaffold/tests/)
([ADR-0029](../../docs/adr/0029-acmm-conformance-via-canonical-aliases.md)).

For a static-site payload, end-to-end means build-then-assert-on-output: the
suite runs the real production build (`astro build` + Pagefind indexing) and
asserts against the final `dist/` HTML a browser would receive — landing
page, docs pages, top bar, 404 — plus a consistency check pinning the
skill's apply instructions to what the scaffold actually contains.

Run it:

```
cd ../../.agents/skills/frostyard-docs-site/scaffold
npm ci
npm test        # astro build + pagefind + node --test tests/*.test.mjs
```

CI runs the same commands in the `scaffold-e2e` job of
[.github/workflows/ci.yml](../../.github/workflows/ci.yml).
