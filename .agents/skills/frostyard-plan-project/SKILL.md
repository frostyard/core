---
name: frostyard-plan-project
description: Turn a fuzzy multi-step or multi-repo goal into an umbrella issue plus dependency-linked slice issues the Snowcat queue can import and deliver in order, through a socratic interview that fills the gaps before anything is written. Use whenever asked to plan a project, break a large feature into sequenced issues, or set up cross-repository work for Snowcat.
---

# Plan a project into sequenced Snowcat issues

Turn one project goal into an umbrella issue (the plan record) and one
bounded slice issue per step, each labeled for Snowcat import, with
`depends-on:` lines encoding delivery order — including edges that cross
repositories. Done looks like: the human approved the shape before any issue
existed, every slice issue is created, every `depends-on:` URL points at
another created issue, and the graph has no cycle.

Snowcat's contract for these issues is
[snowcat ADR-0066](https://github.com/frostyard/snowcat/blob/main/docs/adr/0066-sequence-project-slices-on-observed-predecessor-delivery.md):
a `depends-on:` line only ever delays the issue that carries it, and a
predecessor is satisfied only when its work item is completed **and** its
artifacts are observed delivered — pull requests merged, releases published.
Humans do the merging and publishing, so every edge has a person at it; the
plan is re-checked against reality at every seam for free.

## Steps

1. **Interview first — one question at a time, no drafting yet.** Ask, wait,
   follow up; never present a questionnaire. Cover, in whatever order the
   conversation goes:
   - The outcome, and why now.
   - Non-goals, asked explicitly — never inferred. A step that exists "in
     case" or "while we're in there" is cut here.
   - What observable evidence means the whole project is done.
   - The repositories touched, and for every producer/consumer pair: does
     the consumer use the producer **at a version boundary** (release tag,
     published module) or **as a sibling checkout** (a merge is enough)?
   - What is already decided versus genuinely open. Anything open enough to
     change the shape gets resolved in the interview, not deferred into an
     issue.
   - The risky seams — where implementation discoveries are most likely to
     invalidate later steps. These deserve the earliest slices.
   - Absolute dates for anything relative ("next weekend" → 2026-08-23).
2. **Shape the slices.** For each slice: repository, a one-line objective,
   acceptance criteria, and predecessors. Two rules are load-bearing:
   - **Acceptance criteria are the binding contract and must be
     evidence-shaped** — things a verifier can observe (a passing named
     check, a merged pull request, a published tag, a measured behavior),
     never intentions ("works well"). Instructions are advisory: the
     codebase will have moved by the time later slices run, and a worker
     facing a stale slice blocks it rather than guessing — that is the
     designed failure mode, and good criteria are what make it safe.
   - **One slice is one pull request of work.** Bigger means split; a slice
     that cannot be reviewed alone is not a slice.
   Where an edge crosses a version boundary, insert a **release slice** in
   the producing repository: its work is preparing the release (notes,
   version bump, whatever that repo's process needs), a human publishes the
   tag, and its artifact is the release URL. A merge alone never satisfies a
   version-consumer edge.
3. **Draw the graph and hunt gaps.** Render the slice DAG as a `mermaid`
   graph destined for the umbrella body. Then interrogate the shape before
   the human does: any slice without observable criteria? any edge whose
   satisfier is ambiguous (merge vs. release)? any slice bigger than one
   pull request? any cycle? Fix what you find, then present the whole plan —
   slices, criteria, graph — and get explicit approval. **Create nothing on
   GitHub before approval.**
4. **Author the umbrella issue** in the project's primary repository: goal,
   non-goals, done-evidence, the mermaid DAG, and a slice index whose links
   are filled in as slices are created. Do **not** apply the Snowcat import
   label to the umbrella — it is the plan record, not work, and a
   `depends-on:` pointing at it would never be satisfied.
5. **Author one issue per slice** in that slice's own repository, in
   dependency order so predecessor URLs exist when cited: objective,
   context, acceptance criteria, a link to the umbrella, and one line per
   predecessor of exactly `depends-on: <full https issue URL>` — its own
   line, the full URL, since Snowcat resolves these by source reference.
   Apply the repository's Snowcat import label (default `snowcat`). Each
   issue must stand alone as one bounded, verifiable work item; where the
   repository carries an issue-writing skill (snowcat's
   `write-snowcat-issues`), its rules govern the body.
6. **Verify and report.** Every `depends-on:` URL resolves to an issue you
   created (or a pre-existing one the human named); the graph is acyclic;
   the umbrella's slice index carries real links. Report the umbrella URL,
   the slice URLs in dependency order, and any edge the human must service
   by hand (tags to publish). Until a Snowcat host enforces the predecessor
   gate, the operator paces admission manually — admit a slice only after
   its predecessors delivered; the issue format is identical either way.

## Pitfalls

- **Instructions written as if earlier slices already landed.** Say "after
  <predecessor> lands, …" and keep the criteria the load-bearing part;
  precise instructions about code that doesn't exist yet are the part of the
  plan that rots.
- **A version-consumer edge with no release slice.** Merging the producer's
  pull request publishes nothing; the consumer stays blocked until a tag
  exists that nobody planned to cut.
- **Cycles.** Snowcat does not reject them; the items in the cycle are all
  simply never eligible, silently. The gap hunt in step 3 is the only
  cycle check.
- **Labeling the umbrella for import**, or pointing `depends-on:` at the
  umbrella — either way something waits forever on an issue that is not
  work.
- **Skipping the interview and generating the plan in one shot.** The
  socratic pass exists because the gaps it fills (non-goals, version
  boundaries, risky seams) are exactly the ones that surface as stalled
  slices three weeks later.
