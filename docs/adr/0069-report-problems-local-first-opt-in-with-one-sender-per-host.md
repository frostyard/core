# 0069 — Report problems local first, opt-in, with one sender per host

- **Status:** Accepted
- **Date:** 2026-11-04

## Context

Snosi images (snow, snowfield, sundog, floe) and frostyard apps have no
runtime problem reporting. Failed units, failed update stages, image
rollbacks, sysext update failures, TPM unlock retries, integrity errors,
crashes and app panics are visible only on the host, and often only in a
journal that the desktop user cannot read. systemd-coredump is not on the
images, so crashes leave no record at all.

The system journal is `root:systemd-journal`, and the first user of an image
is not in that group. A user can read the own user journal. Flatpak binds
`/run/systemd/journal/socket` into every sandbox, so a Flatpak app can write
to the journal with no extra permission.

An IP address is personal data under the GDPR. A persistent machine ID or
boot ID makes every report from 1 host linkable. Free-text fields (error
messages, paths, command lines, unit instances) can hold user names, host
names and file names. Public raw reports cannot be deleted, and rare
combinations of fields can single out 1 install.

Several repositories take part: snosi (the collector and the Floe sender),
chairlift (the desktop UI and sender), frostyard/std (the Go package and the
Rust crate that write records), the apps that use them, a new intake
repository `frostyard/problem-intake`, and frostyard.org (the privacy page,
the schema copy and the aggregates). They need 1 contract.

## Decision

- **Default off.** Nothing leaves a host until its user (desktops, in
  chairlift) or its admin (Floe, with `snosi-health reporting on`) turns
  reporting on. Turning it off stops sending at once. Consent records the
  schema version; a new version that adds a kind or a field turns sending off
  until the user or admin agrees again.
- **Local first.** The local list of problems works with no network and no
  consent: the chairlift Problems page on desktops, `snosi-health --list` on
  Floe.
- **One sender per host.** chairlift is the only sender on snow, snowfield and
  sundog; `snosi-health` is the only sender on floe. A host that is not a
  snosi image sends nothing.
- **Apps write only to the journal.** Frostyard apps record panics and coded
  errors as journal entries under 1 fixed `MESSAGE_ID`, through the std Go
  package or the Rust crate. Apps never send, never retry and never open a
  network connection for problem records. The error text and the panic
  message stay in the local journal.
- **One contract.** The schema `frostyard.problem/1`, with `$id`
  `https://frostyard.org/schemas/problem-report/v1.json`, the `MESSAGE_ID`,
  the `FROSTYARD_*` journal fields and every enum are defined in
  [the problem report spec](../specs/problem-report.md). Every field is an
  enum, a boolean, a bounded integer, a version with a fixed pattern, or a
  name from an allowlist. No free text, user path, user name, host name or
  exact time is sent; the time is an ISO week.
- **No identifier.** A report carries no machine ID, no boot ID, no account
  and no cookie. Each report has a new random `report_id`, so the user can
  ask for its deletion.
- **IP dropped at the edge.** The intake Worker uses the client IP only as a
  rate-limit key. It does not store, log or forward the IP or any forwarding
  header. The store behind the Worker never receives a client IP.
- **Versions.** A new field, kind or enum value is a new schema version in a
  new file. The intake Worker accepts a version before any sender release
  uses it. Senders map a value of an open enum that they do not know to
  `other`.
- **Retention.** Raw reports are kept under 90 days, snapshots and backups
  included. Raw reports are never published.
- **Aggregates only are public.** frostyard.org publishes the schema, the
  privacy page, the source of every component, and weekly aggregates with
  small cells and their complementary cells suppressed.
- **Counts only from opted-in installs.** Each sender that has reporting on
  sends at most 1 count a week: the host on Floe, each opted-in user on a
  desktop. No count is sent while reporting is off. No download log or
  registry log is used to count installs.

## Consequences

- Easier: 1 schema and 1 registry bind every writer, reader, sender, the
  Worker and the site. A schema test in core rejects an unknown field, a
  free-text value and a bad version pattern. Apps need no consent of their
  own, and a Flatpak app needs no manifest change.
- Easier: the local list helps a user or admin with no network and no
  consent.
- Harder: every new field, kind or enum value needs a new schema version, a
  Worker deploy before the sender release, and a site update. A new kind or
  field also asks for consent again.
- Harder: with no identifier, a fake report looks like a real one. Counts are
  advisory, and 2 users who opt in on 1 desktop count 2 times. Rate limits
  and the closed schema bound abuse.
- Harder: an app's dev build (a version outside the semver pattern) or an app
  ID off the allowlist records only locally.
- New obligations: std gets the Go package and the Rust crate; snosi gets
  `snosi-health`, systemd-coredump and the Floe sender; chairlift gets the
  Problems page and the desktop sender; `frostyard/problem-intake` gets the
  Worker and the aggregation; frostyard.org gets the privacy page, the schema
  copy and the stats page. Each of these records its own design in its
  repository.
- Native crash stacks, front-end errors and a release-health gate are out of
  scope. They need their own decision.

## Alternatives considered

- **Opt-out (on by default):** sends data before any consent. It needs a
  stronger legal basis and loses user trust.
- **Each app sends its own reports:** each app needs its own consent, network
  access and endpoint, and a Flatpak app cannot read the host's consent.
- **A persistent install ID:** it gives exact counts but makes every report
  from 1 host linkable.
- **Public raw reports:** they cannot be deleted by `report_id`, break the
  retention limit, and rare combinations single out installs.
- **Counting installs from GHCR or APT download logs:** it counts hosts that
  did not opt in and needs client IPs.

## References

- Shapes: [spec: problem report](../specs/problem-report.md),
  [design: problem reports](../design/problem-reports.md)
- Builds on: [ADR-0006](0006-os-artifact-versions-are-utc-timestamps.md),
  [ADR-0015](0015-os-release-image-identity.md),
  [ADR-0016](0016-reverse-dns-org-frostyard-identifiers.md),
  [ADR-0046](0046-rename-cayo-server-image-to-floe.md)
