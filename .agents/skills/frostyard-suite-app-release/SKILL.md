---
name: frostyard-suite-app-release
description: Release a Frostyard suite app (frostnotes, frostmail, frostread, lodge, porter) on its two delivery tracks — the desktop Flatpak through an attested release candidate, a clean-desktop gate, promotion and the flatpak-index listing, and the service daemon's attested frostyard-<name> .deb that snosi pins and ships as a sysext. Use whenever preparing, gating, promoting, or debugging a suite app release, adding a suite app to the Flatpak remote, or adding a suite daemon as a sysext.
---

# Release a suite app: Flatpak candidate, gate, promotion, and sysext

A suite app ships on up to two tracks
([core ADR-0058](https://github.com/frostyard/core/blob/main/docs/adr/0058-ship-suite-desktop-apps-as-flatpaks-and-services-as-sysexts.md),
[ADR-0062](https://github.com/frostyard/core/blob/main/docs/adr/0062-make-desktop-suite-apps-standalone-flatpaks-with-opt-in-lodge.md)):

- **Desktop:** a standalone Flatpak (UI, daemon and CLI inside the
  sandbox), an OCI image on `ghcr.io/frostyard/<repo>`, listed by
  [frostyard/flatpak-index](https://github.com/frostyard/flatpak-index) only
  when its digest carries a build-provenance attestation from the app's
  release workflow on a `v*` tag. Desktop apps: frostnotes, frostmail,
  frostread. Porter has no Flatpak.
- **Server:** one sysext per daemon (`lodge`, `notesd`, `maild`, `readd`,
  `porterd`), built by snosi from the app's attested
  `frostyard-<name>_X.Y.Z_amd64.deb`. That `.deb` is a build input: it is
  **not** registered with apt-publisher and not published to
  repository.frostyard.org.

Done looks like: the app's repository records the gate with the tested
digest and date; `flatpak remote-ls frostyard` lists the new version with
that same digest; and, for a daemon, snosi's checksum pin for the new
version is merged and its sysext published.

The app's own `AGENTS.md` section "Releases and dependencies" and its
release plan are the reference for that app. When they and this skill
disagree, the app wins. Today frostmail runs the full candidate flow below
(its plan 0013, Phases 8 to 10); frostnotes' `flatpak.yml` still publishes
straight from the `vX.Y.Z` tag and moves `latest` after the attestation.

**Division of labour (fixed).** Brian pushes every tag (candidate and
release), runs `make bump`, and runs `promote.yml`. Agents prepare the
release PRs, run the gate on a leased VM, record the evidence, and propose
the version (`svu next` is read-only). Agents never tag, push a tag, run
Promote, or change package visibility or secrets.

## Desktop track

1. **Ready the release on `main`.** The app's checks are green, and the
   offline Flatpak sources match the lockfiles and `go.mod`
   (`make flatpak-sources`; CI's `sources` job fails on drift). Propose the
   version from `svu next` and Conventional Commits (on v0, a breaking
   change gives a minor), as an ask to Brian.
2. **Candidate.** Brian pushes `vX.Y.Z-rc.N` on a `main` commit. The app's
   `flatpak.yml` builds inside the Flatpak SDK, offline, pushes the image
   with its version and `sha-<commit>` tags, and attests the digest
   (`actions/attest-build-provenance` with `subject-digest`, on a
   GitHub-hosted runner: flatpak-index rejects self-hosted attestations). A
   candidate never moves `latest`. Record the run URL and the digest:
   `skopeo inspect --no-creds --format '{{.Digest}}' docker://ghcr.io/frostyard/APP:vX.Y.Z-rc.N`.
3. **Gate on a clean desktop.** Take the VM's lease first
   (`~/.pi/agent/bin/lease take RESOURCE THREAD "gate APP vX.Y.Z-rc.N"`,
   renew at least every 30 minutes, release at the end) and restore it to
   its clean snapshot. Build a staged catalogue that lists only the
   candidate's digest and serve it on the VM
   ([flatpak-index "Stage a candidate"](https://github.com/frostyard/flatpak-index#stage-a-candidate)).
   Run the checks ADR-0062's standalone contract requires and the app's plan
   lists: nothing else frostyard is installed; install from the staged
   remote; the core local workflow; close, reopen, log out and in (the
   daemon and the Background portal); `flatpak update` from the previous
   release keeps the data; each lodge mode the app offers, and mode changes
   that move no data. A test in the build sandbox does not count: it has no
   portals. Record each check with the digest, the date, the VM's image
   version and the evidence path in the app's plan. A failed check blocks
   the release; a waiver is Brian's decision, as an ask.
4. **Release tag.** Brian runs `make bump CANDIDATE=vX.Y.Z-rc.N`: it verifies
   the candidate's commit and tags that same commit `vX.Y.Z`. The tag runs
   `release.yml`, which refuses a `vX.Y.Z` that is not a candidate's commit,
   builds the daemon `.deb` from it, attests it, and makes the GitHub
   release. So the `.deb` and the Flatpak of `vX.Y.Z` hold the same code.
   `flatpak.yml` publishes no image for `vX.Y.Z`.
5. **Promote.** Brian runs `promote.yml` with the candidate and the version.
   It builds and attests nothing: it copies the gated digest to `vX.Y.Z` and
   `latest` (`skopeo copy --preserve-digests`), refuses a version tag that
   already points elsewhere, and dispatches flatpak-index's `publish`
   workflow with `FLATPAK_INDEX_DISPATCH_TOKEN`.
6. **Prove the listing.** flatpak-index's `publish` run is green, and
   `flatpak remote-ls --user --app --columns=application,version,commit frostyard`
   (or the deployed `index/static`) shows the version at the gated digest.
   Without the dispatch, only the schedule picks it up, often hours later.

### First listing of an app

- The image package on GHCR must be public: Brian changes its visibility.
- One flatpak-index PR adds the repository to `apps.json` with
  `"workflow": ".github/workflows/flatpak.yml"` (the workflow that attests).
  A digest without a valid attestation from that workflow stops the whole
  deploy, so merge the entry only after the first gated release is attested.
- Brian creates `FLATPAK_INDEX_DISPATCH_TOKEN` (Actions read/write on
  flatpak-index only) in the app repository.
- The Flatpak ships `/app/share/metainfo/APP_ID.metainfo.xml` and its icons;
  the application ID follows
  [ADR-0016](https://github.com/frostyard/core/blob/main/docs/adr/0016-reverse-dns-org-frostyard-identifiers.md).

## Server track: the daemon's sysext

1. **The `.deb` contract** (the app's repository; checked by its tests):
   `frostyard-<name>`, built with nFPM (`make deb`), installs only under
   `/usr` (an `/etc` default comes from `/usr/share/factory/etc/` through a
   `tmpfiles.d` `C` rule); units start through an `Upholds=` drop-in and a
   preset, an upheld unit has no `Condition*=` unless it is a
   `RemainAfterExit=yes` oneshot, and no unit uses `RequiredBy=`; its own
   `sysusers.d` file declares the groups it uses; snosi's base image
   satisfies its `Depends:`.
2. **Release.** The `vX.Y.Z` tag's `release.yml` attaches
   `frostyard-<name>_X.Y.Z_amd64.deb` to the GitHub release and attests it.
   Do not add a `publish-deb` dispatch: suite daemons are not APT producers.
3. **Pin in snosi** (Murbella's repository). snosi's
   `check-dependencies.yml` (`check-sysext-updates`) finds the release,
   verifies its attestation (`gh attestation verify --source-ref
   refs/tags/vX.Y.Z --deny-self-hosted-runners` against the app's
   `release.yml`), and opens a checksum PR on
   `shared/download/sysext-checksums.json`. Its merge builds the sysext,
   repogen publishes it under `ext/<name>/`, and updex installs it on hosts
   that enabled the feature. Updates take effect at the next boot. A suite
   release sends no `build` dispatch.
4. **A new daemon** needs a snosi change first, by its owner: an
   `mkosi.images/<name>/` sysext with the `.deb` as `KEYPACKAGE`, a
   `sysext-checksums.json` entry with its `attestation` object, a
   `required-paths.txt`, and its updex feature (shipped disabled). Ask
   Murbella; do not open it from the app's side.

## Pitfalls

- **Tagging `vX.Y.Z` on a commit other than the candidate's.** `release.yml`
  and Promote refuse it; never "fix" it by moving or re-pushing a tag.
- **A candidate tag that is not `vX.Y.Z-rc.N`.** `flatpak.yml` fails in its
  publish job and publishes nothing.
- **Gating one digest and promoting another.** The listing must be the
  digest the gate tested; a rebuild, even of the same commit, is a new
  digest and needs its own gate.
- **Self-hosted runners.** An attestation from one is rejected by
  flatpak-index and by snosi.
- **Offline sources drift.** A `go.mod`, `go.sum`, Cargo or pnpm change
  without `make flatpak-sources` fails the Flatpak build.
- **Sharing a VM without a lease.** Gate runs restore snapshots; another
  agent's run on the same VM invalidates both.
- **Expecting the APT repository to carry a suite daemon.** It does not
  (ADR-0058); the sysext is the server delivery.
