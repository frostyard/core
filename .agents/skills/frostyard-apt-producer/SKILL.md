---
name: frostyard-apt-producer
description: Make a repository a producer for the Frostyard APT repository (repository.frostyard.org/debian) — register it with frostyard/apt-publisher, attest its .deb release assets, request publication with a publish-deb dispatch, choose the main or image component and the codenames, and prove the packages are installable. Use whenever a repository starts, changes, or debugs publishing .deb packages to repository.frostyard.org, or when a release's packages are missing from the APT repository.
---

# Publish a repository's .deb packages through apt-publisher

[frostyard/apt-publisher](https://github.com/frostyard/apt-publisher) is the
only writer of `https://repository.frostyard.org/debian/`
([core ADR-0055](https://github.com/frostyard/core/blob/main/docs/adr/0055-publish-debian-packages-through-the-apt-publisher.md)).
A producer builds `.deb` files, attaches them to a GitHub release, and asks
apt-publisher to publish that release. The producer holds no signing key and
no R2 credential. Done looks like: the producer is registered, its release
workflow sends the dispatch, one real release ran apt-publisher's `publish`
workflow green, and `apt-get` installs the new version from the public URL
in a disposable container.

apt-publisher's
[README](https://github.com/frostyard/apt-publisher#readme) is the reference
for the publisher's internals; its `config/producers.tsv` header is the
reference for each registration field. When this skill and those disagree,
apt-publisher wins.

**Division of labour (fixed).** Agents draft the two pull requests and run
read-only checks. Brian tags releases, shares the `APT_PUBLISH_TOKEN` secret,
and runs any workflow that writes the repository by hand (move, withdraw,
rollback). The machine account never tags, releases, or changes secrets.

## Steps

1. **Collect the facts, read-only.**
   - The package names in one real release:
     `gh release view TAG -R OWNER/REPO --json assets --jq '.assets[].name'`,
     then `dpkg-deb -f FILE Package Version Architecture Depends` on each
     downloaded `.deb`. Register exact names, or a glob that matches only this
     repository's names (`frostyard-<name>*`). A loose glob such as
     `libostree-*` could shadow Debian's packages.
   - **Component** ([core ADR-0059](https://github.com/frostyard/core/blob/main/docs/adr/0059-publish-image-only-packages-in-a-separate-apt-component.md)):
     `image` when Debian ships a binary package of the same name in a suite a
     host of that codename can enable (the codename, `-updates`, `-security`,
     `-backports`), or when the package depends on a Frostyard package that
     does. Otherwise `main`. Check each name with
     `rmadison -s trixie,trixie-updates,trixie-security,trixie-backports NAME`
     (and the same for `forky`), or the Debian package search.
   - **Codenames.** A statically linked package (Go with `CGO_ENABLED=0`, or
     `Architecture: all` with no distribution-specific `Depends`) can go to
     `trixie,forky` as one file. A package linked against distribution
     libraries is built once per codename with a `~deb13` / `~deb14` version
     suffix; apt-publisher routes each build to its codename only and refuses
     a mismatch. Register only the codenames you built and tested for.
   - **Attestation.** Can every `.deb` carry a build-provenance attestation
     from a workflow run on the release tag? apt-publisher checks
     `gh attestation verify FILE --repo OWNER/REPO --source-ref refs/tags/TAG
     --deny-self-hosted-runners`. A repository that releases from a branch
     push or a manual run on `main` cannot meet this: register it
     `attested=no` and say why in a comment line.
   - **Notify.** The image repositories that rebuild after a publication.
     Today every producer lists `frostyard/snosi`
     ([ADR-0056](https://github.com/frostyard/core/blob/main/docs/adr/0056-rebuild-images-after-apt-publication.md)).
     Use `-` for none.
   - **Visibility.** apt-publisher reads releases with its own workflow token.
     A private producer needs a token that can read its releases, or a public
     repository (ADR-0055 consequences).

2. **Producer pull request: attest and dispatch.** In the release workflow,
   after the job that creates the GitHub release with the `.deb` assets:

   ```yaml
       permissions:
         contents: write
         id-token: write        # attest-build-provenance
         attestations: write
       steps:
         # ... build, create the release ...
         - uses: actions/attest-build-provenance@<40-char sha> # vX.Y.Z
           with:
             subject-path: dist/*.deb
         - name: Request APT publication
           uses: peter-evans/repository-dispatch@<40-char sha> # vX.Y.Z
           with:
             token: ${{ secrets.APT_PUBLISH_TOKEN }}
             repository: frostyard/apt-publisher
             event-type: publish-deb
             client-payload: '{"repo": "${{ github.repository }}", "tag": "${{ github.ref_name }}"}'
   ```

   - Copy the pinned SHAs from a current producer
     ([updex's `release.yml`](https://github.com/frostyard/updex/blob/main/.github/workflows/release.yml))
     rather than inventing them
     ([ADR-0021](https://github.com/frostyard/core/blob/main/docs/adr/0021-sha-pinned-actions-and-least-privilege-ci.md)).
   - Do not mark the dispatch `continue-on-error` and do not guard it: when
     the request fails, nothing was published and the release run must fail.
   - Leave `codenames` out of the payload unless one release targets fewer
     codenames than the registration; the registration is the default.
   - Remove any old publication step and its secret references from the
     workflow: repogen's `publish-to-r2` Debian path, a direct R2 upload, a
     `build` dispatch to snosi (apt-publisher sends it after the packages
     are live). Deleting the now unused signing or R2 secrets is Brian's
     step: name them in an ask.
   - The `.deb` must be attached to the release before the dispatch runs;
     apt-publisher downloads the release's assets, nothing else.

3. **apt-publisher pull request: register.** Add one row to
   `config/producers.tsv` (tab-separated, columns in this order):

   ```text
   # One comment line: what it is, why these codenames, why attested=no if so.
   frostyard/REPO	name-a,name-b	trixie,forky	yes	frostyard/snosi	main
   ```

   Run `make verify` in apt-publisher (`tests/check-config.sh` validates the
   file). Then the routing check, with no credentials, against the real
   assets: `scripts/publish.sh --producer frostyard/REPO --debs ./dist
   --dry-run`. The merged row is the authorization for every later
   publication; review it like a permission change.

4. **Ask Brian for the secret.** `APT_PUBLISH_TOKEN` is an organization
   secret shared with selected repositories; it needs Contents read/write on
   `frostyard/apt-publisher` only. Put the request in your report's asks.
   Without it the dispatch step fails, and nothing is published.

5. **Prove it on one real release.** After both pull requests merge and Brian
   tags a release:
   - The producer's release run is green, including the dispatch step.
   - apt-publisher's `publish` run for that tag is green
     (`gh run list -R frostyard/apt-publisher -w publish -L 5`). Its summary
     names the producer, the tag and the new snapshot per codename; its log
     shows the read-back and the canary passing.
   - Publication and download check through the public URL:
     `scripts/apt-canary.sh trixie amd64 NAME=VERSION` in an apt-publisher
     checkout (use `trixie/image` for the image component). It downloads
     the package with apt in a temporary root; it does not install it.
   - Installation check, in a disposable container or VM only (never on a
     shared host), of the tested codename (for example `debian:trixie`):
     add the keyring and a sources entry as in apt-publisher's README
     "Clients" block, with `Suites:` set to that codename and `Components:`
     set to the producer's registered component (`main`, or `main image`
     for an `image` producer: the README block enables `main` only). Then
     `apt-get update && apt-get install -y NAME=VERSION`, and run the
     package's own smoke command (for example `NAME --version`). This
     proves dependencies and maintainer scripts.
   - The next nightly `audit` run (06:17 UTC) does not list the release as
     missing.
   Report the run URLs, the downloaded version, and the installation result
   with its container image.

## Changing an existing registration

- **More codenames** (for example `forky` after a forky build passes a smoke
  test): edit the codenames column. The next release publishes there; an
  older release reaches it only if someone reruns its publication.
- **Component change** (`main` → `image` or back): edit the column, then
  Brian runs apt-publisher's `move` workflow, `dry_run` first, right after
  the merge. Until the move runs, that producer's publications fail closed
  on the one-component-per-name rule. A move is reverted by a forward move,
  never by a rollback.
- **New package names:** add them to the packages column before the release
  that first ships them, or that release is refused.

## Pitfalls

- **Assets missing at dispatch time.** A workflow that uploads `.deb` files
  in a later job than the dispatch makes apt-publisher fetch a release with
  no packages. Dispatch last.
- **Attestation from the wrong ref.** An attestation made by a run on a
  branch (a push to `main`, or a manual run on `main`) does not match
  `refs/tags/TAG`; with `attested=yes` the publication is refused.
- **Rebuilt bytes under an existing version.** Republishing a version with
  different bytes is refused. Fix by releasing a new version, never by
  replacing release assets.
- **A `dev` or nightly prerelease.** With `attested=yes`, an untagged nightly
  is refused, which is wanted: a version such as `1.0.0.dev` sorts above
  real releases. Never dispatch for prereleases.
- **`~debNN` on GitHub.** GitHub lists asset names with `.` in place of `~`
  (`bootc_1.16.8-1.deb13_amd64.deb`); routing reads the version from the
  package, so this is harmless. Do not rename files to "fix" it.
- **A failed or cancelled publish run** keeps its payload: rerun it from the
  Actions page instead of re-tagging.
- **Withdrawal and rollback** are apt-publisher operations Brian runs
  (`withdraw`, `rollback` workflows). A rollback unpublishes every later
  publication in that codename, other producers' too.
