---
name: frostyard-plan-project
description: Turn a fuzzy multi-step or multi-repo goal into an approved plan and a task graph that agents can deliver one pull request at a time — a socratic interview first, decisions as asks anchored to plan sections, evidence-shaped acceptance criteria, release tasks at version boundaries, Brian's approval of one exact revision, then delivery and a whole-plan verification. Use whenever asked to plan a project, break a large feature into sequenced work, run a plan thread's planning session, or set up cross-repository work.
---

# Plan a project into an approved task graph

A plan turns one goal into settled decisions and a graph of bounded tasks
before any work starts. On the team's Desk this is a **plan thread**: the
desk owns the plan file, the planning session writes it through the `plan`
tool, Brian approves one revision and its graph, Odrade delegates the tasks,
and a whole-plan verification closes it. Without the Desk, the same steps
hold with a plan document and an approval in writing.

Done looks like: every question that changes the shape was answered and
written back into the plan; the graph is valid (below); Brian approved that
exact revision; each task ended as a merged pull request or "no change" with
evidence; and the whole-plan verification passed.

## Steps

1. **Interview first, one question at a time, no drafting yet.** Ask, wait,
   follow up; never send a questionnaire. Cover:
   - the outcome, and why now;
   - non-goals, asked explicitly (a step that exists "in case" is cut here);
   - the observable evidence that means the whole project is done;
   - the repositories touched, their owners, and for every producer and
     consumer pair: does the consumer use the producer **at a version
     boundary** (a release tag, a published module, a pinned package) or
     **from `main`** (a merge is enough)?
   - what is decided and what is open; anything open enough to change the
     shape is resolved now, not deferred into a task;
   - the risky seams, where a discovery would invalidate later tasks: they
     go first;
   - absolute dates for anything relative.

2. **Write the plan in sections.** One section per subject (goal and
   non-goals, design, each risky seam, rollout, done-evidence), each with a
   stable heading. On the Desk, write with `plan write` and the revision you
   read; a stale revision is refused, so read again and merge. The desk owns
   the Decisions and Tasks sections: do not write them.

3. **Turn every open question into an ask anchored to its section.** One
   decision per ask, with 2 to 6 options and up to 5 criteria to weigh them
   (`plan ask`). Put the option you recommend first and say why in the
   section. When an answer comes, write it back into that section in the
   same write that names the ask (`asks: [{ask, gen}]`); an answer not
   written back keeps the plan unsettled. For an expert view, start 1 to 3
   read-only consults on the ask (`plan consult`); their findings attach to
   the decision. Section comments from Brian are settled the same way.
   A question that binds more than one repository and outlives the plan
   becomes an ADR task (see the frostyard-write-adr skill).

4. **Draft the task graph** (`plan tasks`). For each task: an id (`t1`,
   `t2`, …), a one-line title, the **agent who owns the repository**, the
   repository, 1 to 8 acceptance lines, and its deps. Rules that make a
   graph deliverable:
   - **One task is one pull request in one repository.** Work in 2
     repositories is 2 tasks. A task too big to review alone is split.
   - **Acceptance lines are evidence**, things a verifier can observe from
     the merged result: a named check passing, a file or behaviour present, a
     published tag, a measured value. Never intentions ("works well"). They
     are the contract the verification checks; the task's instructions are
     advisory, because the code will have moved when the task runs.
   - **A version-boundary edge gets 2 tasks** in the producing repository,
     because a task with a pull request is done when the pull request
     merges, not when a tag exists:
     - a **release-preparation task** (a pull request: notes, version
       proposal, anything the repository's release process needs);
     - a **release-observation task** with no pull request, depending on
       the preparation task. Its acceptance line is the published release
       ("Brian tagged vX.Y.Z; the release workflow is green"). Its agent
       asks Brian to tag, then records the release URL and the run URL with
       `plan nochange` once the release exists.

     Every consumer that pins the version depends on the observation task.
     A merge alone never satisfies a consumer that pins a version.
   - **Deps form no cycle,** every dep is a task of the same graph, and the
     graph has 1 to 30 tasks. A plan with no code has 1 check task that ends
     as "no change" with evidence.
   - Agents never tag, release, merge, approve, or change settings or
     secrets: a task whose acceptance needs one of those names Brian's step
     in its acceptance line ("Brian tagged vX.Y.Z") and the agent prepares
     it.
   - An org-wide plan also records its phases in core `docs/plans/` (from
     its TEMPLATE, with "Done when" lines and links to the design docs and
     specs each phase implements). Make that a task.

5. **Hunt the gaps before Brian does.** Any task without observable
   acceptance? An edge whose satisfier is ambiguous (merge or release)? A
   task bigger than one pull request? A task given to an agent who does not
   own its repository? A cycle? Fix what you find.

6. **Ready, then approval.** `plan ready` moves the plan to review only when
   nothing is open: no open ask, no answered ask left unwritten, no open
   comment, no running consult, and a valid draft graph for the current
   revision. Brian approves the exact revision and graph on the Desk page,
   or sends it back. Nothing is delegated before approval.

7. **Delivery.** Odrade delegates each ready task (its deps done) to its
   agent, one task thread each. A task is done when its pull request merges,
   or when its agent records "no change" with evidence (`plan nochange`:
   the files, lines, commands and output that show the code already meets
   the acceptance). A task thread with a second pull request is flagged.

8. **Scope change.** When a task discovers that the approved plan is wrong,
   its agent calls `plan revise` with why and the tasks it stops; the plan
   returns to drafting. Done tasks carry into the new graph only when their
   id, agent, repository, acceptance lines and deps are unchanged.

9. **Whole-plan verification.** When every task is done, the lead runs a
   cross-review of the whole set against the approved revision and every
   task's acceptance lines (`~/.pi/agent/skills/cross-review/SKILL.md`:
   reviewer by the coders' model family, 1 review and at most 3
   re-reviews), then records it with `plan verify`, one entry per task. A
   failed task returns to ready for a repair task; a pass closes the plan.

## Pitfalls

- **Writing instructions as if earlier tasks already landed.** Say "after
  t2 merges, …" and keep the acceptance lines load-bearing.
- **A version-consumer edge with no release-observation task:** the
  consumer either waits for a tag nobody planned, or, if it depends only on
  the preparation PR, starts before the release exists.
- **A decision buried in prose.** If Brian has to choose, it is an ask,
  anchored to its section, with options.
- **An answer not written back.** The gate counts it as open until a write
  names the ask at its current generation.
- **Skipping the interview** and generating the plan in one shot: the gaps
  it fills (non-goals, version boundaries, risky seams) come back as stalled
  tasks later.
- **One task, two repositories,** or a task for an agent who does not own
  the repository: the delegation is refused.
