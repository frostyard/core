---
name: frostyard-write-adr
description: Write, accept, amend, or supersede an Architecture Decision Record in a frostyard repository — core for org-wide decisions, the repository's own docs/adr/ otherwise — with the next free number, the TEMPLATE, facts-only voice, mandatory two-way links, the index line, and the owner consultations the decision needs. Use whenever a decision needs recording, an ADR must be proposed, accepted, amended or superseded, or a design doc, spec or plan change rests on a decision that no ADR records yet.
---

# Write an ADR

An ADR records **why** a decision was made. Frostyard keeps them in
`docs/adr/` in every repository
([core ADR-0025](https://github.com/frostyard/core/blob/main/docs/adr/0025-consolidate-repository-docs-into-docs.md)).
Done looks like: one PR that adds the ADR from the template, links every doc
it shapes in both directions, indexes it, updates the affected design docs,
specs and plans in the same change, and passes the repository's docs gate
(`node scripts/check-docs.mjs` or `make ci`).

## Steps

1. **Is it an ADR, and whose?**
   - An ADR is for a decision someone made between real alternatives. A
     description of how something works is a design doc; an exact contract is
     a spec; an order of work is a plan.
   - **Core** (`frostyard/core/docs/adr/`) when the decision binds more than
     one repository or the organization: packaging and delivery, shared
     conventions, product shape. Read core's `docs/tenets.md` first for a
     packaging, product-shape, or priority decision.
   - **Repository-local** when it binds that repository only. A repository
     that a core ADR binds lists it in its `docs/org-adrs.md`.
   - **Consult the owner of every repository the decision touches** before
     the PR is ready, and give them the draft. Owners' facts and objections go
     into the decision or its consequences; who said what goes into the PR
     description, never into the ADR.
   - A decision only Brian can take (scope, a trade-off, a policy) is an ask
     to him first. Write the ADR after he answers, or write it as
     **Proposed** and say in the PR which ask it waits on.

2. **Take the next free number.** The highest number in `docs/adr/` plus
   one, **and** not claimed by an open PR:

   ```bash
   ls docs/adr | grep -E '^[0-9]{4}-' | sort | tail -1
   gh pr list -R OWNER/REPO --state open --json number,files \
     --jq '.[] | select(any(.files[]; .path | test("^docs/adr/[0-9]{4}-"))) | .number'
   ```

   Two open PRs with the same number collide on merge. Filename:
   `NNNN-kebab-case-imperative-title.md`.

3. **Start from `docs/adr/TEMPLATE.md`** and keep its sections: Status, Date,
   Context, Decision, Consequences, Alternatives considered, References.
   - **Status.** `Proposed` while it waits for a decision;
     `Accepted` (optionally `Accepted (YYYY-MM-DD)`) once decided. Accepting
     a Proposed ADR is its own small PR that changes the status line (and
     the index line, if it marks the status).
   - **Date** is absolute (`2026-11-01`). Convert every relative date in the
     text too.
   - **Context:** facts and constraints only, with numbers, paths, versions
     and links a reader can check. No solution yet.
   - **Decision:** active voice, present tense, with just enough mechanism to
     be unambiguous (paths, names, values). Say what it supersedes or amends.
   - **Consequences:** what becomes easier, harder, or newly required,
     including the negative ones and what stays open.
   - **Alternatives:** each with why it was rejected, in one or two
     sentences.
   - **References:** every design doc, spec and plan it shapes, and every
     ADR it builds on.

4. **Facts, not process**
   ([core ADR-0051](https://github.com/frostyard/core/blob/main/docs/adr/0051-adrs-state-facts-not-process.md)).
   No "Brian asked", "after consulting X", "we discussed", "the agent
   found", desk ask ids, or session history in the ADR. Put that in the PR
   description. Before you finish, search your text for names, "asked",
   "consulted", "decided to", and "we".

5. **Links, both ways.** The ADR links what it shapes; each design doc, spec
   and plan it shapes links back to it in its References (or rationale
   line). A plan phase that the decision settles links the ADR. Relative
   paths inside a repository; full GitHub URLs across repositories. The docs
   gate checks that each relative link resolves and each `#anchor` exists.

6. **Update what the decision changes, in the same PR.** Living design docs
   and plans are edited to match. A spec changes only alongside the code
   that implements it: if the code comes later, the spec change comes with
   it, and the ADR's Consequences say so.

7. **Index it.** Add one line to `docs/README.md` under Decisions, in the
   form of its neighbours:

   ```text
   - [NNNN — Title](adr/NNNN-title.md)
   ```

   Core's AGENTS.md skill index does not list ADRs.

8. **Open the PR.** Risk tier from the PR template (docs-only is tier 1 in
   core; an ADR that changes the organization authority tree or a gate is
   higher). Tick the docs-housekeeping rows, including "ADR is fact-only".
   Put the decision trail (asks, consultations, findings) in the
   description.

## Amend or supersede an accepted ADR

Accepted ADRs are semantically immutable. Never rewrite one.

- **Amend in part:** a new ADR whose title or status line says
  "amends ADR-NNNN in part", stating exactly which statements change and
  which stay. In the old ADR, add only a reference line (link-only
  maintenance,
  [core ADR-0033](https://github.com/frostyard/core/blob/main/docs/adr/0033-link-maintenance-in-immutable-adrs.md)):

  ```text
  - Amended in part by: [ADR-MMMM](MMMM-title.md)
  ```

- **Supersede:** a new ADR that replaces the decision. Change the old ADR's
  status line to "Superseded by", linking the new ADR, and mark its index
  line the same way (core's `docs/README.md` shows ADR-0049 as an example).
  Nothing else in the old ADR changes.
- **Fix a dead link:** allowed under ADR-0033: change only the destination
  and the smallest label needed (for example "historical"); a retired
  artifact points to a commit or tag permalink.
- A change of claim, behaviour or rationale is always a new ADR.

## Pitfalls

- **Number collision** with another open PR (step 2).
- **Narration in the ADR** ("as requested on the desk", reviewer names):
  the review rubric's "ADR voice" row rejects it.
- **Editing an Accepted ADR's decision** to "keep it current": write the
  amending ADR instead and link it.
- **One-way links.** The gate catches a broken link, not a missing
  back-link; check the targets by hand.
- **Deciding for another owner.** An ADR that changes a repository whose
  owner did not see the draft is not ready.
- **Relative dates** ("next week", "after the release"): replace them with
  dates or conditions a reader can check.
