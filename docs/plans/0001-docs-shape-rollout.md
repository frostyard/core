# Plan: Org docs-shape and skills rollout

One paragraph: takes every frostyard repo from implicit conventions to the
recorded state — core's four-category `docs/` shape
([ADR-0025](../adr/0025-consolidate-repository-docs-into-docs.md)) with
org ADR back-links, core-managed skills installed by sync
([ADR-0026](../adr/0026-distribute-core-skills-via-sync-prs.md)), and the
2026-08-11 org sweep's repo-local findings written down as repo-local ADRs.
updex is the completed reference (updex#256, #257 merged).

## Phase 1 — Unblock the skills sync (tiny) ✅ 2026-08-11

- [x] Add **Pull requests: Read and write** to `ORG_PAT`
  ([core#15](https://github.com/frostyard/core/issues/15); token now
  expires 2027-08-11), then dispatch `sync-skills.yml`.
- **Done when:** `chore/sync-core-skills` PRs are open in snosi, updex,
  chairlift, pilothouse, lab, and repogen, and the sync run is green.
  ✅ snosi#695, updex#258, chairlift#197, pilothouse#188, lab#107,
  repogen#26; run 31556216685 green.

## Phase 2 — Merge sync PRs, migrate the yeti/ repos ✅ 2026-08-12

- [x] Merge each repo's sync PR (installs `frostyard-repo-docs` +
  `frostyard-go-repo` per `.github/skills-sync.json`) — all six merged
  2026-08-11/12, including the round-2 markdown-fix syncs.
- [x] Run the [frostyard-repo-docs](../../.agents/skills/frostyard-repo-docs/SKILL.md)
  migration (step 0) in snosi, chairlift, pilothouse, repogen — merged as
  repogen#27, pilothouse#189, chairlift#198, snosi#697 (the last also adds
  `.agents/**` + `docs/**` to the build `paths-ignore`; root cause of the
  sync-triggered image builds was the non-markdown `.synced-from-core`
  marker escaping the `**/*.md` ignore).
- [x] Then clix, std, intuneme (also carry `yeti/`; now in
  `.github/skills-sync.json`) — clix#25 and std#14 merged (both also fixed
  their agent surface: they had only a real CLAUDE.md, no AGENTS.md or
  symlinks); intuneme#184 open, awaiting owner review. Each created its
  `docs/org-adrs.md`. Found during intuneme's migration: its snosi release
  dispatch never fires on tag runs
  ([core#20](https://github.com/frostyard/core/issues/20)).
- [ ] Follow-up: pilothouse `docs/design/overview.md` is 4,935 lines —
  run the skill's maintenance pass to split it toward the 200–500 cap.
- Migration-time per-repo notes: chairlift's
  `internal/installcheck/documentation_test.go` pins literal `yeti/` paths;
  chairlift/pilothouse have `.agents → docs/agents` symlinks; repogen's
  `gh` defaults to the upstream fork parent (`--repo frostyard/repogen`
  always) — record that in repogen's agent instructions during its PR;
  updex's `.github/copilot-instructions.md` is a real file, not a symlink —
  decide merge-or-exception and apply the same call in other repos.
- **Done when:** no frostyard repo contains a `yeti/` or `cairn/`
  directory, and each migrated repo's `docs/README.md` indexes the four
  categories. ✅ verified 2026-08-12 across all nine synced repos
  (intuneme#184 was the last merge). The pilothouse overview split remains
  as a follow-up item above.

## Phase 3 — Repo-local ADRs from the sweep

- [x] Write the 2026-08-11 sweep's repo-local ADR-worthy findings into each
  repo's `docs/adr/` — all six PRs written 2026-08-12, every claim
  re-verified against code before recording (several sweep claims were
  corrected or reframed by the evidence): updex#261 (9 ADRs),
  repogen#30 (11), lab#111 (10, plus lab's docs scaffold — it had been
  skipped in Phase 2's migration list since it carried no yeti/),
  chairlift#201 (10), pilothouse#194 (11), snosi#700 (12).
- Also in this phase: pilothouse#193 split its 4,935-line design overview
  into 10 subsystem docs (overview now 498 lines, within the skill's cap).
- **Done when:** each of the six swept repos has at least its top sweep
  findings recorded as numbered ADRs, indexed, and cross-linked to the
  core ADRs in `docs/org-adrs.md`. *(Pending: owner merges of the PRs
  above.)*

## Phase 4 — Supply-chain cleanup

- Work [core#16](https://github.com/frostyard/core/issues/16) (secret-bearing
  `publish-to-r2@main`), [#17](https://github.com/frostyard/core/issues/17)
  (mutable-branch refs), then [#18](https://github.com/frostyard/core/issues/18)
  (org-wide SHA pinning, ⚠-marked repos first).
- **Done when:** #16 and #17 are closed and #18's ⚠-marked repos are pinned
  with enforcement tests where a harness exists.

## Later / ideas

- Remaining drift issues [core#1–#14](https://github.com/frostyard/core/issues)
  not already covered above (risk-tier harmonization #13, dev-release
  concurrency #10, mkdocs taxonomy #14, updex/repogen config drift).
- Extend `skills-sync.json` to more repos as they onboard.
- Archive the retired `yeti` repo (noted in #18).

## Open questions

- **Where does the ORG_PAT contract live?** Resolve with core#15 — likely a
  core design doc; record as an ADR only if the token model itself changes.
  By Phase 1.

## References

- Implements: [ADR-0025](../adr/0025-consolidate-repository-docs-into-docs.md),
  [ADR-0026](../adr/0026-distribute-core-skills-via-sync-prs.md); tracks
  [ADR-0021](../adr/0021-sha-pinned-actions-and-least-privilege-ci.md)
  adoption (Phase 4).
