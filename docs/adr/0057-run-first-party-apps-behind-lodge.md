# 0057 — Run frostyard's first-party apps behind lodge

- **Status:** Proposed
- **Date:** 2026-10-18

## Context

frostmail and frostnotes are built the same way: a per-user Go daemon owns the
data and serves JSON-RPC on a Unix socket, and thin clients (a Tauri app, a
CLI, an MCP server) connect to it. frostnotes copied frostmail's machinery when
it started: the RPC contract generator, the RPC runtime and server, the event
broker, secrets, the development gateway, the task runner and the app's
transport. About 8,000 lines sit at the same paths in both repositories.

The copies drift apart:

- frostmail's RPC server, secrets, paths and test harness gained a Windows
  layer that frostnotes lacks.
- frostnotes' RPC server answers a panicking handler with an internal error
  and keeps serving; frostmail's exits.
- No frostmail commit cites frostnotes.

Both apps now need the same new capabilities:

- access from browsers and phones on the owner's tailnet. frostnotes' M4 plan
  put a TLS node, sign-in by tailnet identity, browser sessions, a web build
  server and an MCP endpoint with scoped tokens inside notesd;
- one always-on mail daemon for every client, since rules, send-later and
  reminders run only while maild runs (frostmail ADR-0024 and ADR-0025);
- agent access through MCP.

More first-party apps are planned, starting with a personal-assistant agent
that reads mail, calendars, tasks and notes. Each new app would repeat the
sign-in, serving and MCP work. An assistant also needs one place that scopes
its access to each app.

## Decision

frostyard's first-party apps run behind **lodge** (`frostyard/lodge`), a web
shell that is the only process on the network.

- **lodge is tailnet-only.** It joins the tailnet as its own node and serves
  TLS on port 443. It signs browsers in by their tailnet identity, checked
  against allow-lists of logins and nodes. It has no public endpoint.
- **An app is a daemon behind lodge.** Each app's daemon:
  - listens on a Unix socket that only lodge may connect to;
  - runs as its own system user;
  - learns its caller from headers lodge sets.
- **lodge serves every app's web bundle** from read-only files owned by root,
  so no daemon serves code to the browser.
- **One address, one shell.** Browsers load lodge's shell page, which switches
  between apps that stay loaded in frames. Each app has permanent URLs under
  lodge's address.
- **lodge provides the shared services:**
  - sign-in and sessions;
  - a per-app MCP endpoint, with tokens whose scope the app enforces;
  - a separate origin for untrusted content;
  - an inference layer that routes apps' model requests to configured
    providers and holds their credentials.
- **Shared code is a library, not a template.** Daemons use the Go module
  `lodge/kit`, and app frontends use `@frostyard/lodge-client`. A new app
  starts from a scaffold skill that depends on both.
- **frostnotes and frostmail are the first apps.** A personal-assistant agent
  follows. Like any agent, it reaches other apps only through scoped MCP
  tokens.
- **Apps keep their local modes:** frostnotes' desktop app with its own
  notesd, and frostmail's local maild for installs outside the owner's
  tailnet.

The contract between lodge and its apps is lodge's
[app contract](https://github.com/frostyard/lodge/blob/main/docs/specs/app-contract.md).

## Consequences

- Sign-in, serving, MCP tokens and model access are built and reviewed once,
  in lodge, instead of in each daemon.
- Fixes to the shared machinery reach every app through `lodge/kit` releases.
  frostmail and frostnotes move onto it and drop their copies.
- One host holds every app's data and credentials behind HTTPS. lodge's
  sign-in and the per-app system users are the boundary. lodge needs a
  security review before apps move behind it.
- Apps depend on the major version of lodge's contract, so a contract change
  is coordinated across apps.
- frostnotes' devices relocate from notesd's hub address to lodge's.
- frostnotes' M4 changes scope to run notes inside lodge.
- frostyard has one more repository to enroll and maintain.

## Alternatives considered

- **Keep copying, or start apps from a template repository.** Rejected: a
  template copies once at birth, and the copies drift as frostmail's and
  frostnotes' have.
- **One binary that links every app.** Rejected: one app's crash or release
  stops the others, and every app's dependencies land in one module.
- **Each app serving its own web UI, sign-in and MCP endpoint,** as
  frostnotes' M4 first planned. Rejected: every app repeats the same
  security-critical work, with no single address or sign-in.
- **A windowed desktop in the browser.** Rejected: windows inside a page fight
  the browser's tabs, history and shortcuts, and do not work on a phone.
- **One repository for lodge and its apps.** Rejected: frostyard enrolls,
  gates and governs each repository separately
  ([ADR-0019](0019-governance-as-code-and-risk-tiers.md),
  [ADR-0044](0044-expose-the-make-gate-triad-in-every-repository.md)).

## References

- Shapes: lodge's
  [overview](https://github.com/frostyard/lodge/blob/main/docs/design/overview.md),
  [app contract](https://github.com/frostyard/lodge/blob/main/docs/specs/app-contract.md),
  [HTTP interface](https://github.com/frostyard/lodge/blob/main/docs/specs/lodge-http.md),
  [client protocol](https://github.com/frostyard/lodge/blob/main/docs/specs/lodge-client.md),
  [roadmap](https://github.com/frostyard/lodge/blob/main/docs/plans/0001-roadmap.md),
  and its ADRs, starting with
  [0003](https://github.com/frostyard/lodge/blob/main/docs/adr/0003-lodge-is-the-only-process-on-the-network.md).
- Builds on: [ADR-0002](0002-agent-portable-instruction-surface.md),
  [ADR-0019](0019-governance-as-code-and-risk-tiers.md),
  [ADR-0044](0044-expose-the-make-gate-triad-in-every-repository.md).
- frostnotes:
  [ADR-0004](https://github.com/frostyard/frostnotes/blob/main/docs/adr/0004-a-notes-daemon-with-thin-clients.md),
  [ADR-0012](https://github.com/frostyard/frostnotes/blob/main/docs/adr/0012-agents-reach-notes-through-mcp.md),
  [roadmap](https://github.com/frostyard/frostnotes/blob/main/docs/plans/0002-roadmap.md).
- frostmail:
  [ADR-0002](https://github.com/frostyard/frostmail/blob/main/docs/adr/0002-daemon-and-thin-clients.md),
  [ADR-0013](https://github.com/frostyard/frostmail/blob/main/docs/adr/0013-app-as-a-local-flatpak.md),
  [ADR-0024](https://github.com/frostyard/frostmail/blob/main/docs/adr/0024-rules-run-in-maild-on-new-mail.md),
  [ADR-0025](https://github.com/frostyard/frostmail/blob/main/docs/adr/0025-maild-keeps-send-later-remind-me-and-undo-send.md).
- Related: [ADR-0058](0058-ship-suite-desktop-apps-as-flatpaks-and-services-as-sysexts.md)
  (how the suite ships).
