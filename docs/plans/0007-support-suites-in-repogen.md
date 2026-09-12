# Plan: Support suites in Repogen

**Status:** Implementation plan. This document records order and gates; it
does not itself authorize credential changes, publication, deployment, merge,
or support announcements.

## Executive decision

Frostyard does **not** currently publish an APT suite named `main`. As observed on **2026-09-12**, production exposes only `dists/stable`; its signed Release metadata says `Origin: Repogen Repository`, `Label: Frostyard Repository`, `Suite: stable`, `Codename: stable`, `Components: main`, and `Architectures: all amd64`. It has no `Acquire-By-Hash` or `Valid-Until` field. `main` is the sole APT **component** and, separately, the common Git default branch. Snosi's operating-system base is Debian **Trixie**, but its Frostyard package source still reads from APT suite `stable`.

Accepted [ADR-0048](../adr/0048-publish-debian-packages-to-explicit-codenames.md) and [Plan 0006](0006-nbc-retirement-and-debian-suite-migration-fast-path.md) already decide the direction: freeze legacy `stable`; publish explicit immutable `trixie` first and `forky` later; make Repogen the sole protected production metadata writer; fail closed; pin tooling; retain compact manifests; and migrate by a canary and then the minimum supported package closure. This plan implements that decision rather than reopening it.

Repogen already generates **one arbitrary codename per invocation**. Keep that as the transaction boundary. Do not build a giant all-suites command and do not expand this into multi-component support. The first problem is safe package selection, strict restoration, immutable shared-pool handling, signed by-hash publication, and a protected writer. In keeping with the accepted proportional fast path, the first Trixie canary is gated only on the bounded R1–R5 safety subset below. Determinism, durable reconciliation, complete failure-injection hardening, sysext correction, and producer migration remain mandatory before expanding the Trixie closure or beginning Forky.

## Verified baseline

Live observations below are a snapshot from **2026-09-12** and can drift:

- `https://repository.frostyard.org/dists/stable/Release` existed; `dists/trixie/Release` and `dists/forky/Release` returned 404.
- Stable Release SHA-256: `067d873d8a51bb2e70b51da4cd488599d5133a47dac289f6ea52924aef6249ab`.
- Stable InRelease SHA-256: `68e35e909b8cbcd5f2d62362f4bee86366a56562e2ae361018564af207cef1c6`.
- Stable Release.gpg SHA-256: `9f1494216e701554a7f2b2a357787349dddf8ce3b7ba71f1a47e001c845d6c11`.
- Stable Release identity is `Origin: Repogen Repository`, `Label: Frostyard Repository`, `Suite: stable`, `Codename: stable`, `Components: main`, `Architectures: all amd64`, dated `Wed, 09 Sep 2026 14:44:02 +0000`; it advertises neither `Acquire-By-Hash` nor `Valid-Until`.
- The InRelease verified under fingerprint `432C452CD2B7F4FF1B5D23264DE6A2016E622F97`, consistent with accepted [ADR-0014](../adr/0014-single-gpg-trust-root.md).
- The two indexes contained 227 package versions across 32 package names: 218 `amd64` entries and 9 `all` entries.
- Snosi commit `5d30936db4a795497b051b8690b4db7f930c334e` declares `Release=trixie` in [`mkosi.conf`](https://github.com/frostyard/snosi/blob/5d30936db4a795497b051b8690b4db7f930c334e/mkosi.conf#L35-L38), but [`frostyard.sources`](https://github.com/frostyard/snosi/blob/5d30936db4a795497b051b8690b4db7f930c334e/mkosi.sandbox/etc/apt/sources.list.d/frostyard.sources#L1-L7) selects Frostyard `Suites: stable`, `Components: main`.
- Repogen commit `ea8cd1f0b2fe4d2370a83dff1feacfa7a4aef9ae` / v0.4.1 already writes `dists/<codename>/main/binary-<arch>` plus shared `pool/main`: [`generator.go`](https://github.com/frostyard/repogen/blob/ea8cd1f0b2fe4d2370a83dff1feacfa7a4aef9ae/internal/generator/deb/generator.go#L35-L66). The component remains intentionally `main` under [repogen ADR-0003](https://github.com/frostyard/repogen/blob/ea8cd1f0b2fe4d2370a83dff1feacfa7a4aef9ae/docs/adr/0003-single-main-component.md).
- The current direct action defaults codename to `stable`, defaults Repogen to mutable `latest`, downloads all of `dists/` while treating failure as first-run state, always asks for incremental generation, and uploads broad repository state without a repository-wide lock: [`action.yml` inputs](https://github.com/frostyard/repogen/blob/ea8cd1f0b2fe4d2370a83dff1feacfa7a4aef9ae/.github/actions/publish-to-r2/action.yml#L64-L118), [restore](https://github.com/frostyard/repogen/blob/ea8cd1f0b2fe4d2370a83dff1feacfa7a4aef9ae/.github/actions/publish-to-r2/action.yml#L303-L313), and [upload](https://github.com/frostyard/repogen/blob/ea8cd1f0b2fe4d2370a83dff1feacfa7a4aef9ae/.github/actions/publish-to-r2/action.yml#L484-L588).
- Repogen catches a whole incremental metadata parse error and falls back to normal generation, which can truncate an index to the current producer's packages: [`generate.go`](https://github.com/frostyard/repogen/blob/ea8cd1f0b2fe4d2370a83dff1feacfa7a4aef9ae/internal/cli/generate.go#L231-L271). A second path in [`parser.go`](https://github.com/frostyard/repogen/blob/ea8cd1f0b2fe4d2370a83dff1feacfa7a4aef9ae/internal/generator/deb/parser.go#L247-L258) skips a failed per-architecture index when another architecture parses, so a corrupt `binary-all/Packages` beside a valid `binary-amd64/Packages` can silently drop all architecture-independent packages.
- All 11 observed Debian publisher workflows omit codename, suite, and Repogen version: `gchlog`, `updex`, `chairlift`, `firn`, `pilothouse`, `intuneme`, `snowcat-cockpit`, `first-setup`, `bootc-debian`, `omarchy-apps`, and `nbc`. Five consume the action at mutable `@main`; older action SHAs still default the downloaded Repogen binary to mutable `latest`.
- The v0.4.1 action downloads the asset specifically named `repogen-linux-amd64`; its observed SHA-256 was `429f832d49433d5ec72679b580f716d192098214dde66812094dfae4fe2bb7c4`. Pins must bind both asset name and digest because the release also contains differently packaged assets.

The accepted policy is therefore **not yet implemented**. Current production remains an implicit, distributed-writer `stable` repository.

## Terms and scope

| Term | Meaning in this plan | Examples |
|---|---|---|
| Debian codename | Upstream OS generation used to build/run an image or package | `trixie`, `forky` |
| APT Suite/Codename | Signed Release fields and `dists/<codename>` selector; both must match | `Suite: trixie`, `Codename: trixie` |
| APT release identity | Consumer-visible Release pinning fields that must be stable and validated | `Origin`, `Label`, `Suite`, `Codename` |
| APT component | Subdivision under a suite; Frostyard intentionally has one | `main` |
| Git branch/ref | Source-control or action reference, unrelated to APT | branch `main`, action `@<SHA>` |
| OCI channel/tag | Image-selection mechanism, separately promoted | `latest`, `trixie`, `forky`, immutable digest |
| Architecture | Package/image CPU or architecture-independent classification | `amd64`, `all` |
| Lab test suite | Behave test grouping, not a Debian distribution | `smoke`, `system`, `sysext` |
| Sysext OS version | Numeric host compatibility encoded in sysext filenames | `13` for Trixie, `14` for Forky |

Scope is APT publication, affected package producers and consumers, image/install/update validation, sysext coexistence where the same Repogen action is involved, and support documentation. The APT component remains `main` only. Homebrew, archived Plow behavior, Git branches, OCI tags, and Lab test-group naming are not alternate APT suites.

## Accepted non-negotiable constraints

These come from ADR-0048/Plan 0006 and related accepted decisions; implementation may choose mechanics but may not silently weaken them:

1. Production writes use explicit matching immutable `codename` and `suite`; `stable` is rejected as a write target.
2. Existing signed `stable` remains byte-preserved and readable through at least **2027-09-30**.
3. Repogen becomes the one protected production metadata writer. Producers submit immutable packages; they do not independently mutate APT metadata after migration.
4. Existing-state reads, signature verification, every architecture index parse, and checksum checks fail closed. Missing state is first-suite creation only when explicitly requested.
5. Action references use full SHAs. Repogen pins bind an exact version, exact asset name, and verified digest. The observed v0.4.1 `repogen-linux-amd64` digest was `429f832d49433d5ec72679b580f716d192098214dde66812094dfae4fe2bb7c4`, but migration targets a new correctness release rather than blessing v0.4.1.
6. Every publication records a compact, durable manifest linking producer provenance, exact artifacts, target codename, tooling, Release identity, and previous/resulting Release digests. This is the accepted proportional record, not a new full-attestation prerequisite.
7. Migration order is frozen baseline and user disposition → bounded Repogen safety/protected-writer subset → `gchlog` Trixie canary → remaining Repogen hardening → minimum Snosi Trixie closure → explicit Trixie consumers → isolated Forky.
8. A package may be reused across codenames only when the exact bytes/digest are identical and compatibility is recorded. Otherwise its Debian version/filename must be suite-distinct.
9. Trixie remains available at least 90 days after Forky promotion and until **all four known users** governed by ADR-0048 confirm migration. Phase 0 must record a disposition for each user; this is not deferred to promotion.
10. NBC is never published to Forky; its lifecycle follows [ADR-0047](../adr/0047-retire-nbc-on-a-proportional-fast-path.md). `omarchy-apps` does not become a future multi-suite publisher; its frozen dependencies follow [ADR-0049](../adr/0049-retire-omarchy-apps-without-breaking-snosi.md).
11. Plan 0006 names Brian as the interim release and exception owner; the remaining ownership question is the backup/successor, not whether an interim owner exists.
12. This plan's authority is advisory. Workflow/environment permissions and secret placement are proposed operational controls, not a claim that ADC's advisory authority is technically enforced.

## Target architecture

```text
producer release
  -> immutable package artifact + compact intake manifest
  -> protected Repogen-owned one-codename workflow
  -> strict restore or explicit initialize
  -> staged signed generation
  -> immutable pool and by-hash objects
  -> InRelease published last
  -> remote verification + result manifest
  -> explicit-suite image/installer/test consumers
```

### Intake, package selection, and release identity

Each request targets exactly one codename and supplies an exact package set. The intake/result record must bind:

- producer repository, source commit/tag, workflow run, and artifact identifier;
- package name, Debian version, architecture, filename, size, and SHA-256;
- requested codename and suite;
- fixed Release identity: initially `Origin: Repogen Repository` and `Label: Frostyard Repository`, matching live continuity, plus component `main` and exact architectures;
- action SHA, Repogen version, exact binary asset name, and binary SHA-256;
- expected prior Release SHA-256, or an explicit initialize marker;
- resulting Release/InRelease digests and signing-key fingerprint after publication.

`Origin` and `Label` are apt pinning keys and cannot drift by caller/default. The protected writer owns their fixed values and rejects conflicting intake. A future cleanup such as changing Origin to `Frostyard` is a separate consumer-tested policy/migration, not part of suite bring-up.

Repogen must not infer target suite from `.deb` metadata or filename: Debian control metadata has no authoritative target-suite field. A Debian transaction scans only `.deb` inputs. The current action's `package-type` download behavior is insufficient because Repogen recursively generates every recognized format found in `packages-dir`; add a format filter or Debian-specific command and reject unrelated recognized artifacts.

### Restore and initialization

Existing suite publication is strict:

1. Fetch current InRelease/Release and required Packages indexes for the target codename only.
2. Verify the signature using the accepted Frostyard key.
3. Require matching path, fixed Origin and Label, Suite, Codename, component `main`, allowed architectures, and the expected `Acquire-By-Hash` policy.
4. Verify Release checksums and require every advertised architecture index to open and parse; one good architecture must not mask another failed one.
5. Require the observed previous Release digest to match the request.
6. Abort on 403, timeout, 5xx, missing expected metadata, invalid signature, checksum mismatch, identity drift, or any parse failure.

Creation is a separate explicit `initialize-suite` operation. It requires the target prefix to be absent and the request to assert no prior Release digest. A 404 does not silently switch ordinary reconcile into initialization. No suite is initialized before signed by-hash output is enabled and remotely verified.

### Shared immutable pool and verifiable collision handling

Retain the accepted shared `pool/main` layout from [repogen ADR-0002](https://github.com/frostyard/repogen/blob/ea8cd1f0b2fe4d2370a83dff1feacfa7a4aef9ae/docs/adr/0002-shared-debian-pool-layout.md). Do not treat an R2/S3 ETag as SHA-256; multipart ETags are not content digests, and legacy `aws s3 sync` objects may lack checksum metadata.

Build the authoritative retained-object map from all signature- and checksum-verified Packages stanzas. For a requested pool path:

- if the path is referenced by retained signed metadata, require the incoming SHA-256 to equal the stanza SHA-256 and, during baseline/backfill, stream and hash the remote object to prove the stanza still matches storage;
- if the path is absent from that verified map, attempt only a conditional create (`If-None-Match: *` or the R2 equivalent); never issue an overwriting PUT;
- if conditional create reports the object already exists, fetch/stream and hash it: identical SHA-256 may be reused and added to the verified map; a different digest or an unreadable object aborts;
- record the verified digest in the publication manifest and, where supported, immutable object checksum metadata for faster later checks, without relying on metadata alone.

This mechanism covers both indexed legacy objects and unindexed extant objects. Package identity checks include digest. `--skip-duplicates` may no-op only for identical bytes. If Trixie and Forky builds differ, their Debian revisions/filenames must differ.

### Deterministic generation and no-op behavior

Generate in a run-specific staging directory. Canonically sort package stanzas by name, Debian version, architecture, and filename; sort arbitrary metadata fields, architectures/components, Release checksum entries, and sysext checksum entries. Use one controlled publication timestamp.

If exact package set, configuration, Release identity, and prior metadata produce no logical change, report a no-op and do not regenerate or resign metadata. Release and InRelease digests remain unchanged. A changed package set generates a new timestamp and signed generation.

### Signing, Valid-Until, by-hash, and ordered publication

Production always generates valid `Release`, clear-signed `InRelease`, and detached `Release.gpg` using the accepted trust root. Reject unsigned output; do not use Repogen's generic raw unsigned `InRelease` behavior in production.

Initial Trixie/Forky Release files preserve the live repository's **absence of `Valid-Until`**. Frostyard does not yet have an accepted automatic resign/refresh SLA, so adding an expiry could break a healthy quiet repository. The absence is asserted in tests and manifests. Adding `Valid-Until` later requires a separately recorded expiry duration, resign cadence, monitoring, outage behavior, and consumer test.

Add `Acquire-By-Hash: yes` and immutable `by-hash/SHA256/<digest>` index objects before any new suite is initialized. Publish in this order:

1. new immutable pool objects;
2. immutable by-hash indexes;
3. canonical Packages and Packages.gz;
4. Release and Release.gpg;
5. **InRelease last** as the generation commit point.

The order is safe for mutations because every initialized suite advertises by-hash; clients holding the prior Release retrieve the immutable indexes named by that Release rather than racing canonical files. Set pool/by-hash caching as immutable. Release metadata should revalidate quickly. Keep old by-hash objects beyond maximum client/CDN cache lifetime. HTML directory indexes are outside the APT transaction and must not publish a misleading partial root.

### Concurrency and durable recovery

ADR-0048's accepted boundary is serialization by codename. Use non-cancelling per-codename serialization only after R4 conditional immutable pool writes and target-scoped uploads pass concurrency tests. Before that point, permit only the single, manually serialized Trixie canary transaction; do not run cross-codename writes. If implementation instead introduces a temporary global Debian lock, record that stricter-but-different mechanic in a follow-up core ADR/decision before use rather than silently diverging from ADR-0048.

GitHub Actions concurrency is not a durable FIFO; one pending run can replace another. The first canary may use one retained, manually supervised request because no competing production request is allowed. Before expanding the Trixie closure, intake manifests must be retained in discoverable durable storage, with scheduled/manual reconciliation able to process accepted but uncompleted requests. A result manifest closes an intake only after remote verification. Retries use prior/resulting digests to distinguish no-op completion from a partial failure.

### Promotion, retention, and rollback

Promotion is not a mutable `stable` or `testing` alias. It means adding an already verified immutable package digest to another codename's package set through a normal target-codename transaction. Compatibility evidence is required even for byte-identical packages.

Do not automatically garbage-collect indexes or pool objects. Initial scale is small. Removal of a stanza is a reviewed suite transaction. Future pool GC must prove the object is unreachable from every retained suite and manifest, respect CDN retention, provide a dry run, and have separate operational authorization.

Rollback changes consumer/image selection back to the known-good explicit Trixie Release or image digest. It does not rewrite Forky, Trixie, or frozen stable. APT source rollback is not necessarily a package downgrade; downgrade/pinning behavior must be tested separately. Whole-image rollback through Firn is a different mechanism and must be verified end to end.

## Repogen-first issue/PR breakdown

The accepted fast path and later hardening are deliberately separated. Dependencies are shown as `R#`.

| ID | Deliverable and likely surfaces | Depends on | Acceptance gate |
|---|---|---|---|
| R1 | Record production contract and compatibility boundary in Repogen docs: one codename per transaction, `main` only, shared immutable pool, fixed Origin/Label, explicit Valid-Until decision, strict existing/create split, Debian publisher separated from sysext behavior. Update `README`, `docs/adr`, `docs/org-adrs.md`, CLI/action docs. | — | Docs reference core ADR-0048, do not claim implementation, preserve current sysext caller behavior, and identify R1–R5 as the canary subset. |
| R2 | Add strict target and input validation in `internal/cli/generate.go` and Debian config: explicit codename/suite, `suite == codename`, production `stable` rejection, fixed Origin/Label, `main` only, allowed arches, identifier/path/control-character checks, Debian-only format filtering. | R1 | Invalid, ambiguous, traversal, mixed-format, identity-drift, non-main, and stable production inputs fail before output changes. |
| R3 | Replace whole and per-architecture parse fallback with strict restore plus explicit initialize across `internal/cli/generate.go` and `internal/generator/deb/parser.go`; verify signed prior metadata in the production entry point. | R2 | Missing/corrupt/unverifiable state and one-of-two architecture corruption fail; initialize succeeds only against an absent target. |
| R4 | Make duplicate and pool handling digest-aware in `internal/utils/package_identity.go`, scanners/generators, and publication preflight. Build the signed-index digest map; conditional-create unindexed paths; stream-hash collisions; never overwrite. | R2 | Indexed and unindexed same-digest reuse succeeds; same-path/different-digest and unreadable-object cases fail before metadata publication; no test depends on ETag-as-SHA. |
| R5 | Implement the bounded protected canary path: exact action and binary asset pins; sole writer credentials; compact manifest; non-cancelling codename serialization; clean staging; mandatory signing; by-hash; target-only ordered upload with InRelease last; remote read-back. | R3, R4 | A single explicitly authorized `gchlog` initialize produces signed by-hash Trixie metadata, real apt install succeeds, stable digests are unchanged, and injected failure leaves no visible incomplete generation. **R1–R5 gate the canary; nothing below does.** |
| R6 | Canonicalize Debian and sysext output in `internal/generator/deb/metadata.go`, `release.go`, and sysext checksum generation; add controlled time and no-op detection. | R3, R4 | Shuffled inputs generate identical bytes; unchanged reconcile leaves Release/InRelease unchanged. |
| R7 | Generalize staged generation/local commit and failure injection across every generator/signing step. | R3–R6 | Failure at every local step preserves prior output; signed output remains mandatory. |
| R8 | Extend the protected path into durable intake/reconciliation with retained requests, scheduled recovery, per-codename concurrency after pool tests, result manifests, and concurrent/failure recovery. | R5–R7 | Same-suite contention loses nothing; cross-suite attempts cannot overwrite pool paths or metadata; coalesced dispatch is recovered; old InRelease remains usable. |
| R9 | Split/deprecate direct Debian use of `.github/actions/publish-to-r2/action.yml` while preserving sysext invocation compatibility; add OSVersion-aware sysext identity and serialize shared checksum reconciliation under a follow-up ADR. | R6–R8 | Existing Snosi sysext caller still produces its layout; OS 13/14 coexist; Debian producers submit but cannot directly publish after cutover. |
| R10 | Release the multi-suite-safe Repogen version; publish immutable named-asset digests and migration/runbook documentation. | R2–R9 | Full Repogen/publisher acceptance matrix passes; workflows pin exact action SHA and exact binary asset/version/digest. |

The canary is intentionally proportionate: R1–R5 do **not** require full supply-chain attestation, generalized durable queue recovery, deterministic no-op behavior, sysext OSVersion correction, or every failure-injection case. After the canary, freeze further Trixie writes until R6–R10 pass; those gates are mandatory before the minimum package closure. This preserves Plan 0006's fast path without accepting unsafe repeated publication.

Sysext correction is coupled but not a canary blocker and not an excuse to break callers. Filenames already encode OSVersion and systemd-sysupdate transfers select `%w`, as accepted in [ADR-0007](../adr/0007-frostyard-sysext-filename-pattern.md). Add OSVersion to Repogen sysext identity (`name:version:osversion:arch`), make duplicate checks digest-aware, and serialize shared `ext/<name>/SHA256SUMS` reconciliation. Add a follow-up ADR rather than silently rewriting accepted ADR-0007.

## Cross-property work matrix

| Property | Current role/assumption | Required change | Order/dependency | Measurable gate |
|---|---|---|---|---|
| **core** | ADR-0048 and Plan 0006 are accepted policy; adjacent lifecycle/signing ADRs govern exceptions; Brian is interim release/exception owner. | Track implementation evidence, four-user dispositions, package/consumer compatibility ledger, Firn-only migration instructions, runbook, rollback, retention, backup/successor ownership, and follow-up pool/sysext/serialization/version ADRs. | Start with R1/Phase 0; continue each phase. | Core status matches live endpoints/manifests; each known user has a disposition; contradictions and user-visible limitations are recorded. |
| **repogen** | One arbitrary codename per run; implicit stable direct action; broad restore/upload; mutable binary; two parse-drop paths; no by-hash/digest collision guard. | Complete R1–R5 for the canary, then R6–R10 before closure expansion; become the sole protected APT metadata writer while preserving sysext via a separate path. | First. | Two signed suites eventually coexist; no-op deterministic; failures/concurrency preserve prior metadata and stable bytes. |
| **snosi** | Debian Trixie base consumes Frostyard `stable`; publishes sysext through Repogen; selected upstream Forky systemd packages do not imply Frostyard Forky support. | First add an explicit Trixie test lane and Release identity/digest assertions; later add isolated Forky. Preserve OS 13 sysexts while adding OS 14. Remove NBC edges per ADR-0047, not by matrixing them. | After Trixie closure; Forky after producer lanes. | Clean supported profiles build from one matching Frostyard codename; recorded Release digest; switch-back and image rollback pass. |
| **bootc-debian** | Critical producer built in `debian:trixie`; dependencies include Trixie-specific `libgpgme11t64`. | Add explicit Trixie/Forky builds, re-derive runtime dependencies (`libgpgme45` on Forky evidence), install-test each, use suite-distinct versions when bytes differ, submit manifests, remove direct writer credentials after cutover. | After central writer; before Forky Snosi. | `bootc` and `libostree-1-1` install in clean matching-suite environments; collision preflight passes. |
| **Incus fork** | Critical five-package family is in stable; source workflow creates Debian 12/13 artifacts, but no checked-in production publication bridge was found. Forky needs `libgpgme45` and `libnet9`. | Identify/document actual publication bridge and owner; add Debian 14 lane/runtime tests; route full cohort through central intake with provenance. | Discovery starts early; blocks Forky Incus/Snosi. | Proven source→artifact→manifest→index chain for all five packages; clean Forky Incus sysext test. **Unresolved bridge is a blocker.** |
| **gchlog** | Chosen Trixie canary; current workflow implicit/mutable; no live stable entry observed. | Produce reproducible Trixie deb, pin workflow/tooling, submit one compact immutable intake, clean-install, record rollback, then freeze Trixie writes until R6–R10. | First production object after R1–R5 and separate publication authorization. | Signed `dists/trixie` canary with by-hash, valid manifest, real apt install, stable digests unchanged. |
| **updex** | Deb producer and sysext consumer; `%w` follows OS VERSION_ID. | Explicit suite submissions; add Debian 13/14 version/comparator fixtures and `%w=13/14` tests. Keep APT and ext publication distinct. | Trixie closure, then Forky. | Matching package installs; each host selects only matching sysext generation. |
| **chairlift** | Deb producer and image update UI; current publication implicit. Stable also contains `frostyard-chairlift-system-integration`. | Build/install/runtime test both packages and suites; submit manifests. Surface image/codename provenance without normalizing raw APT-suite mixing as UX. | Trixie closure; before affected product promotion. | GTK/service and system-integration packages pass both closures; reported codename matches image. |
| **firn** | Deb producer/installer; catalogs OCI `latest`-style channels and uses Trixie bootstrap guests. | Publish per supported suite; carry codename/support separately from OCI ref; suite-qualify channels/digests; produce actionable Firn-only migration instructions; matrix every reported product/hardware class. | After repository closure and image channels. | Published Firn ISO installs every reported class; each class passes one real update and user-data-preserving rollback; limitations are disclosed directly to affected users. |
| **first-setup** | `all` package consumed by Snow; implicit publisher. | Decide whether it remains in Forky Snow. If retained, build/install/UI-test and publish explicitly; otherwise remove/replace dependency before Forky. | Trixie closure; human support choice blocks Forky Snow. | `snow-first-setup` works on each supported generation or has no remaining Forky dependency. |
| **intuneme** | Deb producer consumed by Snow and Sundog. | Validate runtime/service dependencies, publish explicitly, gate both images. | Trixie closure; then Forky products. | Clean install and functional service test on each supported codename. |
| **nbc** | Legacy publisher/dependency; accepted retirement and no Forky. | No Forky package/lane. Preserve stable; only separately approved emergency Trixie publication. Remove from Snosi/Forky and later remove writer credentials under accepted lifecycle. | Retirement alongside Trixie closure. | No NBC in Forky index/image; frozen/recovery artifacts remain reachable. |
| **omarchy-apps** | Retiring Trixie-only publisher; Snosi still uses frozen `voxtype` and `moonlight-qt`. | No multi-suite publisher. Freeze; retain until replacement/removal; Brian makes the ADR-0049 exception decision; remove workflow/credentials under separate operational action. | Does not block Repogen; replacement decision blocks removal from Snosi. | No new Trixie/Forky publication; replacement/removal tested before deindexing. |
| **pilothouse** | Active deb publisher, while observed Snosi sysext downloads a pinned GitHub-release deb rather than APT. | Confirm supported APT consumers during Phase 0 user disposition. Migrate only if one exists; otherwise preserve stable and retire redundant APT publication. | After minimum closure; support disposition. | Consumer/provenance evidence or explicit stable-only classification. |
| **snowcat-cockpit** | Active deb publisher with stable history; no observed Snosi base dependency. | Confirm supported consumers during Phase 0; migrate explicitly or classify stable-only and remove direct writer edge after authorization. | After minimum closure; support disposition. | Matching-suite install test or recorded exclusion. |
| **Lab** | Validation orchestrator; `suite` currently means Behave group, and image refs may be pinned independently. | Add separate `debian-codename` and Frostyard Release/image digest inputs, state keys, results, and suite-qualified polling. Preserve test-suite vocabulary. | Before consumer promotion. | Trixie/Forky lanes assert `/etc/os-release`, repository digest, and image digest. |
| **testsuite** | Identity feature hardcodes Trixie/13. | Parameterize trusted expected codename/version without overloading Behave suite; run same behavior groups for both. | Before Forky promotion. | Identity reports 13/trixie and 14/forky in respective lanes; cross-wiring fails. |
| **frostyard-org** | Website accurately says Trixie; extension sync chooses first matching filename and becomes ambiguous with OS 13/14 coexistence. | Keep Trixie claim until promotion evidence. Make extension availability OS-version/codename aware. Publish support matrix only from live signed/promotion evidence; link Firn-only migration guidance and disclosed limitations. | After verified promotion, not package upload. | Claims match live suites and promotion manifest; dual-generation catalog is unambiguous; affected users have direct disclosure. |
| **historical/out of scope** | Plow is archived historical repository management; Igloo/legacy packages remain in stable; `pm`, `clix`, `std`, Homebrew and ordinary Git branches have no APT edge. | Preserve frozen stable; do not copy mixed historical set. Label Plow historical; require supported consumer/provenance before legacy names enter new suites. | No critical-path implementation. | Stable intact; no unsupported leakage. |

The open [frostyard/snosi#924](https://github.com/frostyard/snosi/pull/924) is evidence/spike, not architecture or readiness. On 2026-09-12 it was draft, conflicting, review-required, and had failing lanes. Rebase/extract proven findings into an isolated current-main Forky lane after Trixie gates, or replace it with smaller changes; do not use it as proof of support.

## Rollout phases, dependencies, and stop conditions

### Phase 0 — Freeze, recoverable baseline, and user disposition

Run recovery and outreach in parallel:

- Snapshot signed stable metadata, all referenced pool-object digests, public-key fingerprint, Release identity, cache headers, and storage version IDs where available.
- Verify offline/public `gpgv`, every Release checksum, pool reachability, and one clean apt install.
- Stream-hash referenced legacy pool objects to establish the verified digest map; do not infer SHA-256 from ETag.
- Inventory which producer repositories hold signing/R2 write secrets without reading or recording secret values.
- Freeze nonessential legacy writes under separate operational authorization.
- Contact and record a disposition for **all four known users** identified by ADR-0048/Plan 0006, including the three other users Plan 0006 says must be contacted. Record in-use product/hardware configurations, supported migration path, direct-disclosure need, and whether Pilothouse/Snowcat Cockpit or other non-closure packages are actually used.
- Record Brian as interim release/exception owner and identify a backup/successor; do not reopen the already assigned interim ownership.

**Gate:** baseline is restorable in rehearsal; read-only probe is green; every known user has a disposition and each in-use configuration is known. **Stop:** unexplained stable drift, unreachable indexed object, unknown user disposition, or absent interim operational coverage. **Blocks:** production canary.

### Phase 1 — Bounded Repogen safety and Trixie canary

Implement R1–R5 only: explicit validation and fixed Release identity, Debian-only input, strict full/per-architecture restore and explicit initialize, verifiable immutable pool writes, exact tooling pins, compact manifest, protected sole writer, mandatory signing/by-hash, target-only ordered upload, and remote verification.

After separate publication authorization, publish exactly one `gchlog` Trixie initialize transaction. Because this is a newly absent prefix with by-hash enabled before first InRelease, there is no legacy Trixie generation to race. Do not accept another Trixie or any Forky publication until Phase 2 passes.

**Gate:** real apt install from signed Trixie; manifest matches public digests/identity; stable is byte-identical; first-publication failure leaves no visible incomplete suite. **Rollback:** remove/disable the unpublished or failed new prefix only under operational authorization; if first InRelease succeeded, retain it and correct forward after Phase 2 rather than rewrite stable. **Stop:** mutable tool, unsigned output, pool uncertainty, broad upload, or stable drift. **Blocks:** closure expansion, not the canary itself.

### Phase 2 — Repogen hardening and durable protected writer

Implement R6–R10 in staging: deterministic/no-op output, complete local failure atomicity, durable retained intake, scheduled/manual recovery, per-codename non-cancelling serialization after conditional-pool concurrency tests, result manifests, Debian/sysext separation, and a pinned correctness release.

**Credential sequence per producer:** verify immutable submission in staging → authorize/perform first central publication → verify public output/manifest → disable/remove producer production signing/R2 credentials and direct Debian action → verify a subsequent request succeeds centrally and a direct mutation attempt lacks credentials. This plan proposes the sequence; it does not claim advisory permissions technically enforce it.

**Gate:** failures before every publish step retain an installable old generation; same-suite contention retains both requests; cross-suite attempts cannot corrupt shared pool; coalesced dispatch recovers; unauthorized producer/suite/path is rejected; canary remains installable. **Stop:** lost intake, mutable dependency, whole-tree upload, unverifiable provenance, or credential duplication after cutover. **Blocks:** minimum Trixie closure.

### Phase 3 — Trixie minimum closure

- Derive the minimum Snosi package closure from a clean build. Expected names include `bootc`, `libostree-1-1`, `frostyard-updex`, `frostyard-chairlift`, `frostyard-chairlift-system-integration`, `snow-first-setup`, `frostyard-intuneme`, `frostyard-firn`, the required five-package Incus family, and frozen Omarchy exceptions only until replaced. Confirm rather than blindly copy this list.
- Publish each package explicitly with provenance. Migrate/remove credentials producer by producer.
- Keep stable bytes unchanged; do not import the 227-entry historical set.

**Gate:** clean Trixie environments resolve/install exact approved closure; package-set manifest has no unsupported stable leakage. **Stop:** other-codename candidate, dependency mismatch, pool collision, unresolved Incus provenance for required packages, or stable change. **Blocks:** Snosi explicit Trixie.

### Phase 4 — Explicit Trixie consumers and accepted use gates

- Switch a nonpublishing Snosi lane from Frostyard `stable` to `trixie`; assert Origin, Label, Suite, Codename, signature, by-hash, and Release digest in image provenance.
- Parameterize Lab/testsuite and make Firn/image channels codename-aware.
- From the published Firn ISO, install **every reported product/hardware class** captured in Phase 0.
- For each reported class, prove one real update and one user-data-preserving rollback. Exercise secure boot/TPM where claimed.
- Publish actionable **Firn-only migration documentation**, not generic repository prose.
- Observe for **48 hours spanning at least one real publication**. Every in-use configuration must be green or its limitation must be disclosed directly to the affected user; public website copy is not a substitute for direct disclosure.
- Promote Trixie consumer defaults only under separate operational/product authorization.

**Gate:** every reported class meets install/update/rollback, the 48-hour window completes across a real publication, Firn-only instructions are actionable, and each known user's in-use configuration is green or directly disclosed. Lab/testsuite provenance is correct and stable remains byte-identical. **Stop:** mixed sources, missing provenance, failed rollback, ambiguous channel, undisclosed limitation, or observation gap. **Blocks:** Forky lane.

### Phase 5 — Isolated Forky

- Add `[trixie,forky]` producer matrices only where support is intended and builds are suite-coupled. Reuse only identical digests with compatibility evidence.
- Fix Forky-specific ABI dependencies in `bootc-debian` and Incus; resolve the Incus publication bridge.
- Add Snosi Forky as isolated lane; do not replace Trixie default. Audit upstream Trixie/backports/vendor sources. Docker may remain Trixie-sourced only with explicit compatibility evidence until appropriate Forky source exists.
- Produce OSVersion 14 sysexts beside retained OSVersion 13. Add immutable/per-codename OCI tags; only separately promoted product channel may move `latest`.

**Gate:** both APT codenames independently verify/install; no leakage; OS 13/14 sysexts select correctly; claimed products/hardware paths pass. **Stop:** unresolved Incus closure, path/digest collision, default-channel race, Trixie regression, or unsupported lane represented as supported. **Blocks:** Forky promotion.

### Phase 6 — Promotion and retention

Promote a verified Forky image channel only after human product-policy authorization. Keep Trixie for ADR-0048's 90-day and all-four-users retention gate and stable through 2027-09-30. Website/release notes change only after promotion evidence. Rollback repoints consumers/default channels to known-good Trixie digests without rewriting suites.

**Gate:** promotion manifest, support matrix, rollback evidence, retention/user dispositions, and credential inventory complete. **Stop:** alerting gap, unresolved user/support disposition, or inability to restore previous channel.

## Acceptance matrix

| Layer | Required cases |
|---|---|
| Repogen unit | Empty/invalid/traversal codename; Suite/Codename mismatch; fixed Origin/Label drift; production stable; non-main component; unknown/duplicate arch; mixed-format input; strict existing vs initialize; corrupt/missing metadata; corrupt one-of-two architecture index; same identity+same digest no-op; same identity/path+different digest failure; ETag not treated as SHA; conditional-create collision; deterministic shuffled ordering; controlled Date; explicit absence of Valid-Until; by-hash; signed-production rejection; sysext OS 13/14 identity. |
| Repogen repository integration | Generate signed Trixie/Forky under one root; mutate either without changing other/stable; identical shared-pool reuse using verified digest; divergent object rejection; `all`/`amd64`; Packages round trip; real `gpgv`; Release/by-hash checks; repeated no-op unchanged; failure preserves prior tree. |
| Publisher failure/concurrency/recovery | Explicit initialize; 403/5xx/timeout/checksum failure closed; exact action/binary asset pin; two same-suite requests retained; cross-suite pool safety; recover coalesced dispatch; failure after each upload stage; cache/read-back/manifest failure cannot report success; old clients acquire by hash. |
| Real APT | Fresh Debian Trixie/Forky with only matching Frostyard source; `apt-get update`, policy, download, install/configure/start; wrong key/tampered metadata/deb fail; repeated update during publish no hash mismatch; no other-codename candidate; source rollback and explicit downgrade/hold behavior. |
| Snosi/Lab/testsuite/Firn | Clean explicit Trixie then isolated Forky; expected `/etc/os-release`, Origin/Label and Release digest; every reported product/hardware class installed from published Firn ISO; one real update and user-data-preserving rollback per class; 48-hour observation across real publication; Firn-only instructions; direct user disclosure for limitations. |
| Sysext | Same extension name/version/arch for OS 13/14 coexists; SHA256SUMS retains both; `%w=13` selects `_13_`, `%w=14` selects `_14_`; concurrent reconciliation loses neither; website reports generation. |
| Stability/isolation | Baseline stable Release, InRelease, Release.gpg, indexes, and referenced pool objects byte-identical; negative allowlist proves no legacy/other-suite leakage. |
| Provenance/credentials | Every index addition traces to producer commit/run/artifact/tooling; compact manifest chain matches remote Release; migrated producers lack production APT signing/R2 write credentials; central rejection covers unknown producer/suite/path. |

## Operational verification and observability

Safe read-only examples, substituting an allowlisted explicit codename:

```sh
curl -fsS "https://repository.frostyard.org/dists/${codename}/InRelease" -o InRelease
gpgv --keyring ./frostyard.gpg InRelease
sha256sum InRelease
```

Verification automation must extract/assert Origin, Label, Suite, Codename, Components, Architectures, Date, the intentional Valid-Until policy, Acquire-By-Hash, signature fingerprint, and manifest Release/InRelease digests. It must decompress every Packages.gz, verify Release checksums, verify every stanza SHA-256 against the streamed pool object, and probe every advertised by-hash object before success. A fresh matching Debian environment uses one deb822 Frostyard source and runs `apt-get update`, `apt-cache policy <canary>`, and real install.

Record and alert on:

- last accepted intake and successful publish per codename;
- current Release/InRelease digests, Origin/Label, Date, Valid-Until policy, package/version counts, key fingerprint, signature/checksum health;
- queued, recovered, rejected, no-op, failed, and collision requests;
- prior/result manifest continuity;
- pool/by-hash reachability, conditional-create conflicts, and stale staging objects;
- any stable digest drift;
- producer credential-removal status;
- consumer image digest, Debian codename, Frostyard Release digest, reported product/hardware class, user disposition, and direct-disclosure state.

Do not log signing material, passphrases, credentials, or commands containing them.

## Risks and tradeoffs

| Risk | Control / stop condition |
|---|---|
| Last-writer-wins metadata loss | Sole writer, retained intake before closure expansion, codename serialization, target-only uploads, prior Release CAS. |
| Shared-pool corruption | Verified signed-index map, streamed SHA-256, conditional create, never overwrite; suite-distinct versions for changed bytes. |
| Silent index truncation | Strict whole/per-architecture restore; no parse fallback; explicit initialize. |
| Release identity drift | Protected fixed Origin/Label and validation; separate future migration for changes. |
| Quiet repository expires | Initially omit Valid-Until; add only with accepted refresh SLA and monitoring. |
| APT cache race | By-hash before initialization, immutable indexes, ordered publish with InRelease last. |
| Wrong packages in suite | Exact intake allowlist, format filter, closure manifest, negative test. |
| Mutable supply chain | Full action SHAs and exact Repogen asset/version/digest. |
| Lost workflow request | One manually serialized canary; retained durable intake/reconciliation before expansion. |
| Sysext regression | Separate path; OSVersion identity and two-generation test. |
| Premature support claim | Docs gate on live signed suite plus product promotion and user evidence. |
| Forky ABI/source gaps | Isolated lane, clean runtime tests, Incus bridge, third-party source audit. |
| Rollback mistaken for downgrade | Test APT policy separately; prefer image/channel rollback where supported. |

Rejected alternatives:

- **One command regenerates every suite:** unnecessary and enlarges lock/failure scope.
- **Continue moving `stable`:** rejected by ADR-0048.
- **Add more APT components:** unrelated; only `main` is supported.
- **Whole-tree synchronization with per-codename locks:** unsafe stale overwrite.
- **Distributed credentials/locks in producers:** duplicates secrets/failure logic.
- **Trust ETag as SHA-256:** incorrect for multipart and legacy objects.
- **Codename-scoped pools/separate buckets now:** conflicts with accepted shared-pool/frozen paths; conditional immutable writes solve immediate risk.
- **New sysext namespace:** unnecessary; OSVersion filenames and `%w` already provide dimension.
- **Block canary on all hardening:** conflicts with Plan 0006 proportional fast path; R1–R5 are enough for one fresh, signed, by-hash canary, after which writes freeze until R6–R10.
- **Immediately replace Repogen with aptly/reprepro:** adds stateful service migration; reconsider only if Repogen fails atomicity/recovery gates or future scale outgrows manifests.
- **Copy all stable packages:** unsafe historical leakage.

## Remaining decisions

### Human policy decisions

1. Based on Phase 0 dispositions, which non-closure packages remain supported in Trixie/Forky, especially Pilothouse, Snowcat Cockpit, and Incus beyond Snosi.
2. Organization-wide Debian revision convention for suite-distinct builds.
3. Whether `snow-first-setup` remains in Forky Snow or is replaced/removed.
4. Brian, as existing interim release/exception owner under Plan 0006/ADR-0049, decides retain/remove successors for frozen `voxtype` and `moonlight-qt`; the open ownership decision is a backup/successor, not the interim assignee.
5. Products, architectures, hardware paths, and rollback promises defining initial Forky support if a lane remains red.
6. When product `latest` moves from Trixie to Forky, customer-facing support window, and whether cross-major rollback is in-place or reinstall-based.
7. Who serves as backup/successor operator for the central writer after the already named interim owner. The requirement to contact all four known users is already accepted and is not an open policy decision.
8. Whether to adopt a `Valid-Until` refresh/expiry SLA later; initial omission is the defined migration behavior.

### Routine engineering decisions once implementation is authorized

Exact CLI/manifest names, staging layout, canonical sort, by-hash construction, conditional R2 request implementation, streaming digest cache, cache headers consistent with transaction, fixture structure, retry mechanics, dashboard presentation, direct user-disclosure recording, and producer credential removal after proven cutover do not require new product policy. The unresolved Incus publication bridge is an evidence task; if no authorized bridge/operator is found, it becomes a human blocker before Forky Incus support.

## First 10 actions after separate implementation authorization

1. Capture/verify signed stable recovery snapshot, stream-hash referenced pool objects, record Release identity/cache/storage evidence, inventory credentials, establish stable-drift alarm, contact all four known users, and record Brian plus backup coverage.
2. Land Repogen production-contract docs defining R1–R5 canary scope, fixed Origin/Label, no Valid-Until initially, one-codename/main-only behavior, immutable pool, strict restore/initialize, and Debian/sysext separation.
3. Implement explicit target/identity validation and Debian-only filtering; reject implicit/invalid/stable inputs before mutation.
4. Implement fail-closed signed restore including every architecture and separate absent-prefix initialize; remove both silent-drop paths.
5. Implement verified digest-map pool handling, streamed SHA-256, conditional create/no-overwrite, digest-aware duplicate checks, and collision tests.
6. Implement the bounded protected canary publisher with exact named-asset pins, compact manifest, sole credentials, mandatory signing/by-hash, target-only staged ordered upload, InRelease last, and remote verification.
7. After separate publication authorization, initialize Trixie with `gchlog`, prove real apt install and unchanged stable, then freeze further new-suite writes.
8. Complete deterministic/no-op generation, comprehensive staged failure atomicity, durable intake/recovery, per-codename concurrency, sysext OSVersion correction, action split, and pinned Repogen release (R6–R10).
9. Derive/publish exact Snosi Trixie closure including `frostyard-chairlift-system-integration`, resolve Incus bridge, and cut over/remove producer credentials one by one.
10. Enable explicit Trixie Snosi/Lab/testsuite/Firn lanes; install every reported class from published Firn ISO, run real update/rollback per class, publish Firn-only instructions, complete the 48-hour real-publication observation, and directly disclose any limitation before Forky work.

## References

- Governing decision:
  [ADR-0048](../adr/0048-publish-debian-packages-to-explicit-codenames.md)
- Coordinates with:
  [Plan 0006](0006-nbc-retirement-and-debian-suite-migration-fast-path.md)
- Related accepted decisions:
  [ADR-0007](../adr/0007-frostyard-sysext-filename-pattern.md),
  [ADR-0009](../adr/0009-single-artifact-origin-repository-frostyard-org.md),
  [ADR-0014](../adr/0014-single-gpg-trust-root.md),
  [ADR-0047](../adr/0047-retire-nbc-on-a-proportional-fast-path.md), and
  [ADR-0049](../adr/0049-retire-omarchy-apps-without-breaking-snosi.md)
