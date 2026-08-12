# Tests

This repo's product is docs, skills, and templates — its test surface is
correspondingly two suites, both run by
[.github/workflows/ci.yml](../.github/workflows/ci.yml) on every PR:

| Suite | Lives at | What it proves |
| --- | --- | --- |
| Docs-integrity gate | [scripts/check-docs.mjs](../scripts/check-docs.mjs) | Every doc is indexed in [docs/README.md](../docs/README.md), every relative link resolves, every symlink alias ([ADR-0029](../docs/adr/0029-acmm-conformance-via-canonical-aliases.md)) is intact. Thresholds: [.coverage-thresholds.json](../.coverage-thresholds.json). |
| Scaffold e2e suite | [e2e/](e2e/) → `.agents/skills/frostyard-docs-site/scaffold/tests/` | The docs-site scaffold payload builds and renders correctly end to end. |

The e2e suite lives inside the skill's `scaffold/` directory because it
ships with the payload — consuming repos copy scaffold and tests together.
The [e2e/scaffold-tests](e2e/) symlink aliases it here so the repo's test
surface is discoverable from one place.

Run everything locally:

```
node scripts/check-docs.mjs
cd .agents/skills/frostyard-docs-site/scaffold && npm ci && npm test
```
