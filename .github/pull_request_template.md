<!-- The org squash-merges: branch off main, never stack on another PR's
branch. Reviews apply docs/specs/pr-review-rubric.md. -->

## Summary

<!-- What changes and why, in a few sentences. Link the issue(s) this
closes. -->

## Risk tier

<!-- Declare the highest applicable tier — never lower (ADR-0019).
Docs/skills/templates-only changes in this repo are tier 1. Scale
harmonization is tracked in core#13; cite a tier, don't invent a scale. -->

Risk tier: 1 — <!-- justification -->

## Docs housekeeping

<!-- Delete rows that don't apply (no docs touched). -->

- [ ] New docs started from their category's `TEMPLATE.md`
- [ ] Every new doc indexed in `docs/README.md`
- [ ] Cross-links added in both directions (ADR ↔ design ↔ spec ↔ plan)
- [ ] New significant decision recorded as an ADR *first*, in this PR
- [ ] Conformance aliases (ADR-0029) untouched — canonical targets edited
      instead

## Verification

<!-- Paste evidence the gates ran locally. -->

- [ ] `node scripts/check-docs.mjs` green
- [ ] Scaffold changed? `npm ci && npm test` in
      `.agents/skills/frostyard-docs-site/scaffold/` green
- [ ] Workflows changed? Every action SHA-pinned (40 chars + `# vX.Y.Z`),
      `permissions: {}`, `persist-credentials: false` (ADR-0021)
