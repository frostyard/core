<!-- readme-kind: org -->
# core

core is the org-wide hub of the [frostyard](https://github.com/frostyard)
organization. It holds the decisions, specs and plans that bind every
frostyard repository, the agent skills and templates they share, and the
machine-readable organization authority. It holds no product code.

**Status:** in production.

**Documentation:** [docs/README.md](docs/README.md)

## What is here

| Path | What it is |
| --- | --- |
| `docs/` | The org's ADRs, designs, specs and plans, by the question each answers ([index](docs/README.md)); [tenets](docs/tenets.md) come first |
| `.agents/skills/` | The shared agent skills; the skills sync copies them to enrolled repositories ([shared skills](docs/design/shared-skills.md)) |
| `organization/` | Repository declarations, contracts, schemas and fixtures ([organization authority](organization/README.md)) |
| `templates/`, `assets/` | Document and repository templates; logos, badges and other shared media |
| `scripts/`, `test/` | The validators of this repository and their tests |

## Use

- A frostyard repository carries the
  [repository baseline](docs/specs/repository-baseline.md) and follows the
  [ADRs](docs/README.md#decisions-adrs) that apply to it.
- An agent in any frostyard repository follows the skill that
  [AGENTS.md](AGENTS.md) names for its task.
- An org-wide proposal starts as an
  [issue](https://github.com/frostyard/core/issues) or a
  [discussion](https://github.com/frostyard/core/discussions); a decision
  becomes an ADR (frostyard-write-adr skill).

## Develop

```sh
mise install   # the pinned Node and jq
npm ci
make ci        # what CI runs
```

Edit canonical paths only, start each branch from `main`, and declare the
risk tier in the pull request; [AGENTS.md](AGENTS.md) has the rules.
The aliases are symlinks: on Windows, clone with `core.symlinks=true`.

## Where to go next

- [AGENTS.md](AGENTS.md): the rules for agents and contributors.
- [docs/README.md](docs/README.md): the index of decisions, designs, specs
  and plans.
- [SECURITY.md](SECURITY.md): report a vulnerability privately.
- [LICENSE](LICENSE): MIT.
