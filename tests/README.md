# Tests

This repo's product is docs, skills, and templates — its test surface is
correspondingly two suites, both run by
[.github/workflows/ci.yml](../.github/workflows/ci.yml) on every PR:

| Suite | Lives at | What it proves |
| --- | --- | --- |
| Docs-integrity gate | [scripts/check-docs.mjs](../scripts/check-docs.mjs) | Every doc is indexed in [docs/README.md](../docs/README.md), every relative link resolves, every symlink alias ([ADR-0029](../docs/adr/0029-acmm-conformance-via-canonical-aliases.md)) is intact. Thresholds: [.coverage-thresholds.json](../.coverage-thresholds.json). |
| Scaffold e2e suite | [e2e/](e2e/) → `.agents/skills/frostyard-docs-site/tests/` | The docs-site scaffold payload builds with the hash-locked ProperDocs and MaterialX requirement and renders correctly end to end. |

The e2e suite lives with the skill, beside its `scaffold/` payload but not
inside it: a consuming repository copies `scaffold/` only, so the test ships
with the skill in this repository. The [e2e/scaffold-tests](e2e/) symlink
aliases it here so the repo's test surface is discoverable from one place.

Run everything locally (the scaffold test needs `python3`):

```
node scripts/check-docs.mjs
node --test .agents/skills/frostyard-docs-site/tests/*.test.mjs
```
