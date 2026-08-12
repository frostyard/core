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
