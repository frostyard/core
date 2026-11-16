# 0085 — Build new first-party apps on hearth, with lodge as their hub

- **Status:** Accepted (2026-11-15)
- **Date:** 2026-11-15

## Context

[ADR-0057](0057-run-first-party-apps-behind-lodge.md) runs frostyard's
first-party apps behind lodge. Each app reaches agents through its own
MCP endpoint on lodge
([lodge ADR-0006](https://github.com/frostyard/lodge/blob/main/docs/adr/0006-agents-reach-each-app-through-its-own-mcp-endpoint.md)),
and daemons share code through lodge's Go module `lodge/kit`. On
2026-11-15:

- frostnotes serves 8 MCP tools over 69 RPC methods, and frostmail 20
  tools over 133 methods, through lodge's `/mcp/notes` and `/mcp/mail`.
  Each app has its own scope grammar and about 1,000 hand-written lines of
  MCP code.
- Each app keeps its own copy of `tools/rpcgen`, which generates its
  JSON-RPC code from a YAML schema. The copies drifted, and do not converge
  without a change of what each schema means
  ([lodge ADR-0012](https://github.com/frostyard/lodge/blob/main/docs/adr/0012-the-kit-shares-the-rpc-runtime-not-the-generator.md)).
- Each new agent connection is a root `lodgectl token issue`, a token
  file, an MCP client entry and a scope that only that app reads. Porter,
  the team's journal writer and the owner's personal agent each hold their
  own tokens.
- An agent cannot subscribe to an app's events: frostnotes' `events`
  domain admits the `local`, `session` and `device` callers, not `agent`.
- No shared rule says what a new app's API, MCP tools, permissions and
  events are, so each new app designs them again.

Constraints that hold:

- lodge is the only process on the network and stays on the tailnet
  (lodge
  [ADR-0003](https://github.com/frostyard/lodge/blob/main/docs/adr/0003-lodge-is-the-only-process-on-the-network.md),
  [ADR-0004](https://github.com/frostyard/lodge/blob/main/docs/adr/0004-lodge-stays-on-the-tailnet-and-joins-it-itself.md)).
  It serves TLS on port 443 (ADR-0057), and a new service gets no second
  port.
- Each suite app works on its own; lodge is an opt-in mode
  ([ADR-0062](0062-make-desktop-suite-apps-standalone-flatpaks-with-opt-in-lodge.md)).
  ADR-0062 covers desktop apps only and exempts Porter.
- frostnotes, frostmail, Porter and the agents that use them run on
  lodge's current app contract and must keep working until each moves.
- Identifiers live under `org.frostyard.`
  ([ADR-0016](0016-reverse-dns-org-frostyard-identifiers.md)).

## Decision

New first-party apps are built on **hearth** (`frostyard/hearth`, Go
module `github.com/frostyard/hearth`): a toolkit of Protobuf options,
`protoc` plugins and a Go runtime. **lodge is their hub:** it issues
access, routes MCP and brokers events. This amends ADR-0057 in part.

### Scope

- Every new first-party app is built on hearth. The first is
  `frostyard/frostmarks`, a bookmark manager (lodge app id `marks`).
- frostnotes, frostmail and Porter keep lodge's current contract
  (`/mcp/<id>` with `lgm_` tokens, `agent.sock`, the companion slot).
  Each moves to hearth, or not, by its own decision.
- **An app on hearth works with no lodge.** It runs as its daemon, its
  CLI and a stdio MCP server (`<app>ctl mcp`) that needs no token and acts
  as the local user. This extends ADR-0062's standalone rule to every app
  on hearth, whether it has a desktop artifact or not.
- **hearth imports no lodge, frostyard app or pi-pocket code.** A check
  in hearth's `make ci` enforces it, so the toolkit is usable outside
  frostyard.

### Protobuf and Connect

- An app's API is 1 Protobuf service in the package
  `frostyard.<app>.v1`. `connect-go` generates the Go server and client,
  and `connect-es` the TypeScript client. `buf` lints the files and
  guards the wire with `buf breaking`.
- hearth's plugins (`protoc-gen-hearth-manifest`, `-mcp`, `-authz` and
  `-events`) generate the app's manifest, MCP tools, permission checks and
  event publishers from the same files.
- The server is Connect over HTTP/1.1 on a Unix socket.
- `buf` and the plugins are pinned in `mise.lock`
  ([ADR-0043](0043-pin-repository-tools-in-mise-and-name-the-verify-gate.md),
  [ADR-0023](0023-verified-pinned-downloads.md));
  `buf.lock` pins dependencies by digest; no remote BSR plugin runs; an
  app's `make ci` regenerates the code and fails on a diff.

### Options

hearth defines its options in `proto/frostyard/hearth/v1/options.proto`,
with extension numbers in the range 51370 to 51379 until the Protobuf
global extension registry grants a number:

- `MethodOptions.hearth_rpc` (51370) on every RPC: a required
  `permission` (`<app>:<capability>`); a required `effect`, one of read,
  write (undoable) and outward (irreversible, or leaves the system); a
  non-empty `expose` list of UI, agent or both; an agent description; and
  JSON examples.
- `FieldOptions.hearth_selector` (51371): the selector, such as `folder`,
  that a request field carries.
- `MessageOptions.hearth_event` (51372) on an event: its object, verb,
  selector and read permission.

Generation fails on an RPC with no permission, no effect or an empty
`expose`.

### Manifest and compatibility

- Each app ships a versioned `manifest.json` (`"hearth": 1`, the format's
  major version) that lists its capabilities, selectors, operations and
  events. A JSON Schema in hearth defines the format.
- `hearth manifest diff OLD NEW` runs in the app's `make ci` against the
  default branch. A removed operation, tool or event, or a changed
  permission, effect, selector or topic of an existing one, is breaking.
  A breaking change needs the app's next major version, and lodge asks for
  consent again for that app.
- lodge disables an app whose manifest has a format major it does not
  know, with a reason that names both versions.

### MCP tools

- Only RPCs that `expose` to agents become MCP tools. A tool's input and
  output schemas follow the proto3 JSON mapping; `google.protobuf.Any` and
  maps of messages are refused at generation.
- The effect sets the tool's hints: read is read-only; outward is
  destructive and open-world; write is neither.
- A denied call is a tool error, and a Connect `permission_denied`, that
  names the missing capability and selector value.

### Permissions and trust

- **A grant** is a list of items, each a capability on a selector path.
  An item on path G covers path P when P is G or starts with G + `/`;
  items union. Paths are `/`-separated Unicode NFC with no empty, `.` or
  `..` segment. Standalone, the local user holds every capability on `/`.
- **The app enforces; lodge issues.** The generated check refuses a call
  whose permission the grant lacks for the request's selector value. For
  an RPC on a stored object, the app resolves the object's stored selector
  inside its transaction through a generated hook, never from the
  request. Lists and searches filter results by the grant. A move needs
  the write capability at both ends.
- **Trust.** hearth's lodge adapter reads the `Lodge-Principal` and
  `Lodge-Grant` headers only on the app's lodge socket, after it checks
  that the peer is lodge's user. The app's private socket and its stdio MCP
  server ignore them and act as the local user.

### Events

- An event is a CloudEvents 1.0 envelope in JSON with no `data`: `id` is
  a UUIDv7 for the event, `subject` the object's id, `type`
  `org.frostyard.<app>.<object>.<verb>`, and the extensions `author` (the
  authenticated caller, or `local`) and `selector` (the object's path).
  Consumers read content through the API, with their own grant.
- The topic is `<app>.<object>.<verb>.<selector>.<path segments>`. A read
  grant on a path becomes a topic prefix, so the broker filters events
  before delivery. Generation fails on a read permission whose selector is
  not on the event's topic.
- An app writes each event to an outbox in the change's transaction, and
  a relay publishes it with its stable `id`. Delivery is at least once;
  consumers de-duplicate by `id`. A delete publishes a tombstone, and a
  move publishes `moved_out` on the old path and `moved_in` on the new.
- Standalone, an in-process transport reads the same outbox.

### lodge as the hub

- **Registration.** An app's `app.json` names its hearth manifest. lodge
  serves such an app through its MCP gateway and its Connect route
  `/app/<id>/connect/`, not through `/mcp/<id>`. The app contract's major
  version stays 1.
- **Principals and clients.** A grant belongs to a principal (an agent or
  an outside client). A principal has 1 or more OAuth clients, each with
  the scope `mcp`, `events` or both. Effective access is the principal's
  grant within the client's scope. Revoking a client ends its tokens;
  revoking a principal ends all its clients.
- **OAuth.** lodge is an OAuth 2.1 authorization server per the MCP
  authorization specification, revision 2025-06-18: protected-resource
  and authorization-server metadata, dynamic client registration and PKCE
  S256, over HTTPS only. Access tokens are opaque; refresh tokens rotate;
  grants stay server-side.
- **Consent.** lodge's consent page shows the requested capabilities and
  selectors. Only a login on lodge's admin list approves, narrows or
  declines a request, and nothing is granted by default. An agent asks
  for more access through the gateway's `request_access` tool, which
  queues a consent request.
- **Gateway.** 1 MCP endpoint, `/gateway/mcp`, serves every principal;
  the token selects the principal, and the tools are those of every app
  it holds a grant for, named `<id>_<tool>`. lodge calls the app's Connect
  RPC on its lodge socket with `Lodge-Principal` and `Lodge-Grant`, checks
  the current grant on every call, and sends `tools/list_changed` when a
  grant changes.
- **Broker.** lodge embeds a NATS server with JetStream. Apps publish
  over the Unix socket `/run/lodge/nats.sock`; lodge identifies each by
  its peer uid and lets it publish only under `<id>.`. Outside clients use
  NATS over WebSocket at `/nats` on lodge's existing HTTPS listener, with a
  token of scope `events`. lodge creates and owns each client's durable
  consumer, filtered by the client's read prefixes, and the client can
  only pull and ack on that consumer. A narrowed grant narrows the filter
  at once; a revoke deletes the consumers. A consumer that falls behind
  its stream's retention receives 1 `org.frostyard.lodge.resync` event.
- **No second port.** The gateway, OAuth, consent and the broker's
  WebSocket share lodge's HTTPS listener on port 443; local apps reach the
  broker over a Unix socket.

### What ADR-0057 says that this changes

For apps on hearth only:

- "lodge provides … a per-app MCP endpoint, with tokens whose scope the
  app enforces": an app on hearth has no per-app endpoint. Agents reach it
  through lodge's 1 gateway, with an OAuth token whose grant lodge issues
  and the app enforces.
- "Daemons use the Go module `lodge/kit`": the daemon of an app on hearth
  uses hearth and imports no lodge code.
- "A new app starts from a scaffold skill that depends on both": a new
  app starts from hearth.
- "Fixes to the shared machinery reach every app through `lodge/kit`
  releases": for an app on hearth, they reach it through hearth releases.

Everything else in ADR-0057 stands, and frostnotes, frostmail and Porter
keep all of it.

## Consequences

- An app gets its API, clients, MCP tools, permission checks, events and
  manifest from 1 set of `.proto` files. Its MCP tools cannot drift from
  its API, and an RPC without a declared permission does not build.
- Each agent or outside client has 1 MCP entry for every app on lodge.
  Access starts at a consent page, not at a root `lodgectl` command, and
  a grant change reaches open sessions without a config change.
- A consumer receives only events it may read, and an agent can subscribe
  to events for the first time.
- lodge gains an OAuth server, a consent page and an embedded broker. Its
  rules that no browser route writes and that only the control socket
  issues credentials change for consent; lodge records that, and the
  gateway's relation to lodge ADR-0006, in its own ADRs. lodge needs a
  security review of these parts.
- Two contracts run side by side in lodge until frostnotes, frostmail and
  Porter move: today's `/mcp/<id>` and the hearth gateway. Each move is
  its own decision, and the move is larger than a generator change: a new
  wire protocol and a new schema language.
- Protobuf, Connect and NATS are new in the org. Their tools are pinned
  and verified like any other download
  ([ADR-0023](0023-verified-pinned-downloads.md)).
- The exact contracts (options, manifest schema, topic encoding, lodge's
  routes) live in hearth's and lodge's specs, which change with the code
  that implements them.
- A per-agent grant is a scope guard against wrong or injected calls. It
  is not a wall between agents that run as the same Unix user.
- hearth and frostmarks start as incubating repositories with a decision
  date of 2027-03-31
  ([Plan 0002](../plans/0002-org-portfolio-roadmap.md#incubating-repositories)).
  Each carries the [repository baseline](../specs/repository-baseline.md)
  ([ADR-0071](0071-hold-every-code-repository-to-one-baseline.md)) from
  its first PR.

## Alternatives considered

- **Evolve the YAML schema and `tools/rpcgen` (JSON-RPC over
  WebSocket):** rejected. It is the cheapest later move for frostnotes and
  frostmail, but it keeps a frostyard-only schema language that needs its
  own docs, editor support and compatibility checks, and that nobody
  outside frostyard knows.
- **Code-first Go, with interfaces, doc comments and tags read by a `go
  generate` tool:** rejected. The TypeScript client is weak, and the
  permission rules hide in comments.
- **Each app keeps its own MCP endpoint and tokens (ADR-0057 as it
  stands):** rejected. Each connection stays a manual token, and an agent
  has 1 entry and 1 scope grammar per app.
- **An event broker as a separate service:** rejected. It needs a second
  network endpoint, and its permissions would sit apart from lodge's
  grants.

## References

- Shapes: [Plan 0002](../plans/0002-org-portfolio-roadmap.md#incubating-repositories)
  (hearth and frostmarks as incubating repositories); lodge's
  [app contract](https://github.com/frostyard/lodge/blob/main/docs/specs/app-contract.md)
  and
  [HTTP interface](https://github.com/frostyard/lodge/blob/main/docs/specs/lodge-http.md);
  hearth's and frostmarks' design docs and specs, from their first PRs.
- Amends in part: [ADR-0057](0057-run-first-party-apps-behind-lodge.md)
  (the per-app MCP endpoint; `lodge/kit` as the app library)
- Builds on: [ADR-0016](0016-reverse-dns-org-frostyard-identifiers.md),
  [ADR-0023](0023-verified-pinned-downloads.md),
  [ADR-0043](0043-pin-repository-tools-in-mise-and-name-the-verify-gate.md),
  [ADR-0057](0057-run-first-party-apps-behind-lodge.md),
  [ADR-0062](0062-make-desktop-suite-apps-standalone-flatpaks-with-opt-in-lodge.md),
  [ADR-0071](0071-hold-every-code-repository-to-one-baseline.md)
- lodge:
  [ADR-0003](https://github.com/frostyard/lodge/blob/main/docs/adr/0003-lodge-is-the-only-process-on-the-network.md),
  [ADR-0004](https://github.com/frostyard/lodge/blob/main/docs/adr/0004-lodge-stays-on-the-tailnet-and-joins-it-itself.md),
  [ADR-0006](https://github.com/frostyard/lodge/blob/main/docs/adr/0006-agents-reach-each-app-through-its-own-mcp-endpoint.md),
  [ADR-0012](https://github.com/frostyard/lodge/blob/main/docs/adr/0012-the-kit-shares-the-rpc-runtime-not-the-generator.md)
- External: [MCP authorization, revision 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization),
  [CloudEvents 1.0](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md),
  [Connect](https://connectrpc.com/)
