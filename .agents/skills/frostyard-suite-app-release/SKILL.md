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
  frostread. frostread has no `flatpak.yml` yet (its plan 0002 adds it and
  uses the candidate flow below). lodge and porter have no Flatpak.
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
(its plan 0013, Phases 8 to 10). frostnotes' `flatpak.yml` still publishes
straight from the `vX.Y.Z` tag and moves `latest` after the attestation,
with no candidate and no gate before the listing; whether it moves to the
candidate flow is Brian's decision. Repositories without a candidate flow
(frostnotes, lodge, porter, frostread today) release with `make bump`,
which Brian runs: it tags `svu next` and pushes the tag.

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
3. **Gate on a clean desktop.** The gate is required before an app's
   **first listing** (ADR-0062; flatpak-index "Stage a candidate"). For a
   later release, run it when the app's own release plan requires it:
   frostmail's plan 0013 gates each candidate. Whether every release of
   every app must pass the gate is not decided yet; until it is, follow the
   app's plan and say in the release PR which applies. Take the VM's lease
   first
   (`~/.pi/agent/bin/lease take RESOURCE THREAD "gate APP vX.Y.Z-rc.N"`,
   renew at least every 30 minutes, release at the end) and restore it to
   its clean snapshot. Build a staged catalogue that lists only the
   candidate's digest and serve it on the VM
   ([flatpak-index "Stage a candidate"](https://github.com/frostyard/flatpak-index#stage-a-candidate)).
   Run the checks ADR-0062's standalone contract requires and the app's plan
   lists (the per-app lists are also in core Plan 0010):
   - nothing else frostyard is installed (no lodge, Tailscale, host
     daemon, sysext or other suite app);
   - install from the staged remote;
   - the core local workflow;
   - close and reopen the window (the daemon keeps working), log out and
     in (the daemon starts at login through the Background portal);
     refuse the portal on a second VM: the daemon then starts with the
     first window only and stops with the last;
   - `flatpak update` from a baseline candidate (`rc.1`) to the release
     candidate keeps the data, and the new build replaces the old daemon,
     never the reverse; a release that changes the database schema tests
     its migration in this gate;
   - each lodge mode the app offers, and mode changes both ways: no data
     moves or disappears, and no second daemon runs.

   All checks pass on **one** candidate digest. A test in the build sandbox
   does not count: it has no portals. Record each check with the digest, the
   date, the VM's image version and the evidence path in the app's plan. A
   failed check blocks the release; a waiver is Brian's decision, as an ask.
4. **Release tag.** Brian runs `make bump CANDIDATE=vX.Y.Z-rc.N`: it verifies
   the candidate's commit and tags that same commit `vX.Y.Z`. The tag runs
   `release.yml`, which refuses a `vX.Y.Z` that is not a candidate's commit,
   builds the daemon `.deb` from it, attests it, and makes the GitHub
   release. So the `.deb` and the Flatpak of `vX.Y.Z` hold the same code.
   `flatpak.yml` publishes no image for `vX.Y.Z`.
5. **Promote.** Brian runs `promote.yml` with the candidate and the version.
   It builds and attests nothing: it copies the gated digest to `vX.Y.Z` and
   `latest` (`skopeo copy --preserve-digests`). It refuses a version tag that
   already points elsewhere, a missing `vX.Y.Z` git tag or one on another
   commit, and a candidate without an attestation from `flatpak.yml`. If
   `FLATPAK_INDEX_DISPATCH_TOKEN` is set, it dispatches flatpak-index's
   `publish` workflow.
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

1. **The `.deb` contract** (the app's repository; its tests and snosi's
   build guards check it): `frostyard-<name>`, built with nFPM
   (`make deb`), installs only under `/usr` and ships no file at a path
   snosi's base image ships (an example configuration goes under
   `/usr/share/<app>/`, as lodge's `config.example.json`); its own
   `sysusers.d` file declares the groups it uses, user `lodge` included;
   its units install with `WantedBy=`; an upheld unit has no `Condition*=` unless
   it is a `Type=oneshot` with `RemainAfterExit=yes`; no unit uses
   `RequiredBy=`; snosi's base image satisfies its `Depends:`. The
   `Upholds=` drop-in and the preset are **not** in the `.deb`: snosi ships
   them in the sysext (step 4).
2. **Release.** The `vX.Y.Z` tag's `release.yml` attaches
   `frostyard-<name>_X.Y.Z_amd64.deb` to the GitHub release and attests it.
   Do not add a `publish-deb` dispatch: suite daemons are not APT producers.
3. **Pin in snosi** (Murbella's repository). snosi's
   `check-dependencies.yml` (`check-sysext-updates`) runs weekly (Monday
   09:00 UTC) or on dispatch, not on each release. It verifies the
   attestation (`gh attestation verify --signer-workflow
   <repository>/<workflow> --source-ref refs/tags/vX.Y.Z
   --deny-self-hosted-runners`, from the checksum entry's `attestation`
   object) and opens or updates the PR on branch
   `auto-update-sysext-checksums`, which can carry other sysext updates. A
   pin can also be made by hand in a snosi PR, by its owner. The merge to
   snosi `main` builds the sysext, and repogen publishes it under
   `ext/<name>/`. On hosts that enabled the feature, `updex-update.timer`
   applies it at the next boot; an interactive `sudo updex features update`
   merges it at once (`EXTENSION_RELOAD_MANAGER=1`, updex 2.1.3 or later),
   and the running daemon keeps its old binary until it restarts. A suite
   release sends no `build` dispatch.
4. **A new daemon** is a snosi change by its owner. Ask Murbella; do not
   open it from the app's side. With `notesd` as the model, it needs:
   `mkosi.images/<name>/mkosi.conf` (`KEYPACKAGE` and the full
   `FinalizeScripts=` guard list); `mkosi.postinst.chroot`
   (`verified_download`, `assert_deb_dependencies_satisfied`, `dpkg -i`);
   `mkosi.extra/` with the `Upholds=` drop-in, the preset and
   `extension-release.<name>` (`EXTENSION_RELOAD_MANAGER=1`);
   `required-paths.txt` and the entry in the root `mkosi.conf` list; the
   updex `<name>.feature` (`Enabled=false`) and `<name>.transfer` in the
   **base** image, so hosts see the feature only after a new OS image; the
   `sysext-checksums.json` entry with its `attestation` object, plus the
   per-key check and `pin_attested` call in `check-dependencies.yml`
   (without them no automatic pin PR comes); the checks in
   `test/suite-sysexts-test.sh`; and its rows in snosi's
   `docs/design/sysexts.md` and the suite lists.

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
