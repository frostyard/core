# 0079 — Exempt the homelab inventory wiki from the README spec

- **Status:** Accepted
- **Date:** 2026-11-11
- **Amends in part:** [ADR-0072](0072-write-every-readme-to-one-standard.md)
  (the scope of "every repository the team owns")

## Context

ADR-0072 holds the root `README.md` of every repository the team owns,
the team's bketelsen repositories included, to the
[README spec](../specs/readme.md). The spec's kind table lists
bketelsen/homewiki as an `infrastructure` example.

bketelsen/homewiki is a private inventory wiki of the homelab. Its
`AGENTS.md` makes `README.md` and every `.md` under `docs/` wiki pages, and
puts addresses, MAC addresses, serial numbers and device details in scope.
Its `README.md` is the first wiki page: the page index and the inventory
table of the estate. At commit `73d253c`, the README checker fails it on
rules R1, R4, R5, R9, R10 and R12: no kind marker, no status line, no
documentation line, no `Develop` and no `Where to go next` section, 10
private IPv4 addresses and 25 dates outside code.

A README written to the spec is a front page with at most 2 dates and no
private address. A wiki index page of a dated inventory holds addresses
and dates by design. One file cannot do both jobs.

## Decision

- **bketelsen/homewiki is outside the scope of ADR-0072 and the README
  spec.** Its root `README.md` is the wiki's page index, and the wiki's own
  rules (`AGENTS.md`) set its content. Rules R1 to R12 do not apply to it,
  and the conformance sweep files no B17 finding for it.
- The rest of ADR-0072 stays as it is: every other repository the team
  owns, forks and archived repositories excepted, has a root `README.md`
  written to the README spec.

## Consequences

- Easier: the wiki keeps 1 file as its first page and its index, with no
  second front page to keep in step.
- Harder: a reader of bketelsen/homewiki does not find the 4 standard
  answers in the standard places. The repository is private, and its
  readers are the people and agents that keep the homelab.
- ADR-0072's rule that host inventories and addresses never go in a public
  README still binds every public repository. The exemption rests on a
  private repository: a change of homewiki to public needs a new ADR
  first.
- The README spec names the exemption and drops homewiki from its kind
  examples. The checker and its templates do not change: the exemption
  is in scope, not in a rule.

## Alternatives considered

- **A short conforming README that links the wiki pages, with the
  inventory only in `docs/index.md`:** the wiki then has 2 front pages,
  and `README.md` stays a wiki page that the wiki's rules govern. At
  commit `73d253c`, `README.md` and `docs/index.md` already differ.
- **An `inventory` kind in the spec:** a new kind and its sections for 1
  private repository adds checker code and a template that nothing else
  uses.

## References

- Shapes: [spec: README](../specs/readme.md)
- Builds on: [ADR-0072](0072-write-every-readme-to-one-standard.md),
  [ADR-0071](0071-hold-every-code-repository-to-one-baseline.md)
