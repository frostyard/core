# .memory/ — corrections inbox

The single sanctioned inbox for durable learned corrections
([ADR-0018](../docs/adr/0018-org-wide-agent-instruction-and-knowledge-surfaces.md),
confirmed by
[ADR-0025](../docs/adr/0025-consolidate-repository-docs-into-docs.md); its
form is set by
[ADR-0081](../docs/adr/0081-store-each-correction-in-a-file-of-its-own.md)).

## Record files

Each correction is 1 file in `.memory/corrections/`. 2 pull requests that
each add a record add 2 different files, so they do not conflict.

- **Name:** `<date>-<slug>.json`, matching
  `^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.json$`. The date part
  equals the record's `date`; the slug has at most 60 characters.
  - A record from a pull request: slug `pr-<N>-<words>`, for example
    `2026-11-13-pr-412-cache-key.json`. 2 records in 1 pull request use
    different words.
  - A record with no pull request: 2 to 5 words and 4 random hexadecimal
    characters, for example `2026-11-13-agent-scope-rule-3f9a.json`.
  - The slug prefix `legacy-` is reserved for the move from the old file
    (below).
- **Content:** 1 JSON object with exactly 5 string fields, in this order:
  `date` (a real `YYYY-MM-DD` date), `scope`, `correction`, `evidence` (not
  empty), and `promoted_to` (`""`, or the path the record was promoted to).
- **Canonical form:** the file text is exactly
  `JSON.stringify(record, null, 2) + "\n"`, with the keys in the order
  above. Formatters do not rewrite these files.

  ```json
  {
    "date": "2026-11-13",
    "scope": "ci",
    "correction": "Pin the cache key to mise.lock.",
    "evidence": "frostyard/pocket#412, cross-review of head 1a2b3c4",
    "promoted_to": "test/cache-key.test.mjs"
  }
  ```

- **Permanent:** a record file is never removed or renamed. Its text never
  changes, except that an empty `promoted_to` is filled once.
- The folder holds only record files, and an optional empty `.gitkeep` for a
  repository with no records. No subfolder, no symbolic link.
- `promoted_to` starts empty; when a correction graduates into
  [AGENTS.md](../AGENTS.md), a doc under [docs/](../docs/README.md), or a
  skill, set it to that path. Promotion is the only sanctioned duplication —
  the `frostyard-repo-docs` maintenance pass drains this inbox.
- Never record credentials or non-public vulnerability details.
- A blocking review point adds a record in the PR that fixes it
  ([quality loop](../docs/design/quality-loop.md), Learn station).

## The old file during the rollout

Until its move PR merges, a repository keeps `.memory/corrections.jsonl`:
1 JSON object for each line, the same 5 fields, append-only. There, a new
record is 1 line at the end of that file. Core itself still has the old
file. A repository has the old file or the folder, never both; after the
folder exists, the old file does not come back.

## Tools

- `scripts/check-corrections.mjs` (in `make verify`) checks either form.
  With `--base origin/main` it also checks that no record is removed,
  renamed or changed except a filled empty `promoted_to`, that the old file
  does not come back after the move, and that a move keeps every line of
  the old file as its `legacy-` record.
- `scripts/new-correction.mjs --root . --date YYYY-MM-DD --slug pr-412-cache-key --scope … --correction … --evidence … [--promoted-to PATH]`
  writes 1 record file in canonical form. Its use is optional: the validator
  checks a file written by hand the same way.
- `scripts/migrate-corrections.mjs --root .` moves the old file into the
  folder: line `N` becomes `<date>-legacy-<NNNN>.json`, and the old file is
  deleted. An open PR that still added lines to the old file merges `main`,
  keeps its own version of the old file, and runs it with `--pr <N>`: its
  new lines become `<date>-pr-<N>-<k>.json` files.
- `scripts/corrections-report.mjs` is the weekly promotion report for local
  checkouts ([quality loop](../docs/design/quality-loop.md), Learn station);
  it reads both forms, and `--ref origin/main` reads them at that ref, once
  per clone, not in the working trees.
