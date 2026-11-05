# Perform an instruction hygiene review

Review the current agent instruction files periodically. Cover a global
`AGENTS.md`, agent profiles, skills `SKILL.md` files and runbooks. Look for
contradictions, dead rules, duplicate guidance and unnecessary cuts. The
cadence is monthly on the first Sunday. An owner can also run this review on a
repository's `AGENTS.md` in a hygiene line.

[ADR-0018](../../docs/adr/0018-org-wide-agent-instruction-and-knowledge-surfaces.md)
defines the instruction-surface policy.

1. Run the mechanical lint:

   ```text
   node scripts/check-instructions.mjs --root <checkout> [--retired NAME]... [--ignore-ref-file FILE] [--budget FILE] [--base <ref of last month>] <files>
   ```

   A backticked path is checked when it starts with `~/`, `./`, `../` or
   `/var/home/`, when its first folder exists, or when it has a file extension
   or a top-level folder name (`docs/`, `scripts/`, `.github/`). A reference to
   another repository that the lint cannot resolve goes in the
   `--ignore-ref-file` list, 1 exact reference per line, after the owner checks
   it. Fix or list each other error before the blind review.

2. Prepare the blind input. The operator concatenates the CURRENT text of the
   selected files only. Each file starts with `=== <path> ===` and line numbers,
   for example `nl -ba`.

   Give the reviewer no git history, blame, diffs, PR threads, commit messages,
   author names or previous review reports. Strip author lines from any file.

3. The reviewer is a model from another model family than the authors of the
   files. For example, files written on Claude use `openai/gpt-6.1-sol`. Files
   written on GPT use a Claude model.

   The reviewer is read-only. It changes no file, runs no command that writes,
   opens no PR or issue and uses no tools other than reading the given text.

4. Paste this brief to the reviewer:

   ```text
   The operator prepared blind, current instruction text only. Review it for:
   contradictions, dead rules, duplicates and cuts.

   Do not use git history, blame, diffs, PR threads, commit messages, author
   names or previous review reports. Do not change files, write commands, open
   PRs or issues, or use tools other than reading the text below.

   Return at most 15 items, ordered by importance. For each item, provide:
   - kind: contradiction, dead rule, duplicate or cut
   - the exact quote or quotes, with file:line for each
   - 1 sentence that explains why
   - a proposed change that cuts text or adds new words that keep the meaning

   A contradiction means 2 rules that cannot both hold. A dead rule names a
   retired thing, a superseded rule or a tool that no longer exists. Do not
   return an item without a quote and file:line. Do not add praise or a summary
   of the files.
   ```

5. The owner of the files decides each item after the review. Accepted cuts go
   in 1 PR to the repository that holds the files. The PR body lists every
   accepted item and every rejected item. The reviewer output is not an order.
