# .memory/ — corrections inbox

The single sanctioned inbox for durable learned corrections
([ADR-0018](../docs/adr/0018-org-wide-agent-instruction-and-knowledge-surfaces.md),
confirmed by
[ADR-0025](../docs/adr/0025-consolidate-repository-docs-into-docs.md)).

Contract:

- `corrections.jsonl` is **append-only** — one JSON object per line, five
  fields, all required:

  ```json
  {"date": "YYYY-MM-DD", "scope": "…", "correction": "…", "evidence": "…", "promoted_to": ""}
  ```

- `promoted_to` starts empty; when a correction graduates into
  [AGENTS.md](../AGENTS.md), a doc under [docs/](../docs/README.md), or a
  skill, set it to that path. Promotion is the only sanctioned duplication —
  the `frostyard-repo-docs` maintenance pass drains this inbox.
- Never record credentials or non-public vulnerability details.
- `scripts/check-corrections.mjs` validates this file in `make verify`;
  `node scripts/check-corrections.mjs --base origin/main` also checks that
  existing lines are unchanged except a filled `promoted_to`.
  `scripts/corrections-report.mjs` is the weekly promotion report for local
  checkouts ([quality loop](../docs/design/quality-loop.md), Learn station).
  A blocking
  review point adds a line here in the PR that fixes it
  ([quality loop](../docs/design/quality-loop.md), Learn station).
