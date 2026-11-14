<!-- The org squash-merges: branch off main, never stack on another PR's
branch. Reviews apply docs/specs/pr-review-rubric.md. -->

## Summary

<!-- What changes and why, in a few sentences. Link the issue(s) this
closes. -->

## Risk tier

<!-- Declare the highest applicable tier — never lower (ADR-0019).
Docs/skills/templates-only changes in this repo are tier 1. Scale
harmonization is tracked in core#13; cite a tier, don't invent a scale.
A `risk:high` label (risk-path match, ADR-0068) means the highest tier. -->

Risk tier: 1 — <!-- justification -->

## Docs housekeeping

<!-- Delete rows that don't apply (no docs touched). -->

- [ ] New docs started from their category's `TEMPLATE.md`
- [ ] Every new doc indexed in `docs/README.md`
- [ ] Cross-links added in both directions (ADR ↔ design ↔ spec ↔ plan)
- [ ] New significant decision recorded as an ADR *first*, in this PR
- [ ] New/edited ADRs are fact-only (context, decision, consequences) — no
      narration of who asked, who was consulted, or the author's process;
      that goes here, in this description
      ([ADR-0051](../docs/adr/0051-adrs-state-facts-not-process.md))
- [ ] Conformance aliases (ADR-0029) untouched — canonical targets edited
      instead

## Verification

<!-- Paste evidence the gates ran locally. -->

- [ ] `node scripts/check-docs.mjs` green
- [ ] Docs-site skill changed? `node --test
      .agents/skills/frostyard-docs-site/tests/*.test.mjs` green
- [ ] Script or test reads Markdown or YAML by hand? 1 test case for each
      input shape that AGENTS.md lists (fences, code spans, comments,
      quoting, folded blocks, CR, BOM, empty file, no final newline)
- [ ] Workflows changed? Every action SHA-pinned (40 chars + `# vX.Y.Z`),
      `permissions: {}`, `persist-credentials: false` (ADR-0021)
