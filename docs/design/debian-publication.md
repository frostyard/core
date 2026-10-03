# Debian publication

Living document. Rationale:
[ADR-0055](../adr/0055-publish-debian-packages-through-the-apt-publisher.md),
[ADR-0056](../adr/0056-rebuild-images-after-apt-publication.md).
Contracts: the [apt-publisher README](https://github.com/frostyard/apt-publisher/blob/main/README.md).

## Overview

Frostyard's Debian packages are published by one writer,
[`frostyard/apt-publisher`](https://github.com/frostyard/apt-publisher), to
`https://repository.frostyard.org/debian/` under explicit codenames (`trixie`,
`forky`). Producers attach `.deb` files to a tagged GitHub release and ask the
writer to publish them. The writer validates, publishes with aptly, verifies
the result through the public URL, and then notifies the image repositories.

```
producer tag release ──publish-deb──► apt-publisher (one queue: apt-repository)
  .deb assets + attestations             │ validate ─► aptly ─► R2 frostyardrepo/debian/
                                         │ read-back verify ─► CDN purge ─► apt canary
                                         └──build──► image repositories (snosi)

apt clients ──► https://repository.frostyard.org/debian/  trixie | forky  (main)
legacy      ──► https://repository.frostyard.org/         stable (frozen)
```

## Design

**Registry.** `config/producers.tsv` in apt-publisher lists, for each
producer repository:

- the package-name globs it may publish;
- the codenames it may publish to;
- whether its `.deb` files must carry build-provenance attestations; and
- which repositories receive a `build` dispatch after a successful publish.

`config/codenames.tsv` maps each codename to its Debian major version and
architectures (`amd64`, `arm64`, `all`). A `~debNN` or `+debNN` version
marker routes a package only to the codename for Debian NN.

**Workflows.** All of apt-publisher's writing workflows share the
`apt-repository` concurrency group with `queue: max`, and the `apt-repository`
environment, which is limited to `main`.

| Workflow | Trigger | Effect |
| --- | --- | --- |
| publish | `repository_dispatch` `publish-deb`, or manual | Publishes one producer release |
| import-stable | manual | Reviews, then imports, the legacy `stable` suite into a codename |
| rollback | manual | Republishes a codename from an earlier snapshot |
| withdraw | manual | Removes one version from a codename |
| check-secrets | manual | Checks each secret without publishing |
| audit | nightly (once enabled), manual | Reports producers' latest releases that are not published |

**Storage.**

- `frostyardrepo/debian/` holds aptly's published tree: `dists/<codename>/`
  with by-hash indexes, and `pool/`.
- The private bucket `frostyard-apt-state` holds aptly's database, its package
  pool, pending-publication markers (`txn/`), and every replaced database file
  (`history/`).
- Each run restores that state, as on a fresh runner.

**Signing.** The [ADR-0014](../adr/0014-single-gpg-trust-root.md) key
(`432C452CD2B7F4FF1B5D23264DE6A2016E622F97`) signs `InRelease` and
`Release.gpg`. It is the key that signs the legacy `stable` suite, so clients
keep `frostyard.gpg`.

**Client configuration.**

```
Types: deb
URIs: https://repository.frostyard.org/debian/
Suites: trixie
Components: main
Signed-By: /etc/apt/keyrings/frostyard.gpg
```

**Producer release step.** The final step of a producer's release workflow:

```yaml
- name: Request APT publication
  uses: peter-evans/repository-dispatch@28959ce8df70de7be546dd1250a005dd32156697 # v4
  with:
    token: ${{ secrets.APT_PUBLISH_TOKEN }}
    repository: frostyard/apt-publisher
    event-type: publish-deb
    client-payload: '{"repo": "${{ github.repository }}", "tag": "${{ github.ref_name }}"}'
```

**CDN.** The `frostyard.org` zone's Cache Rule `apt immutable` caches only
the repository paths that never change under the same name.

- It matches
  `http.host eq "repository.frostyard.org" and (starts_with(http.request.uri.path, "/debian/pool/") or (starts_with(http.request.uri.path, "/debian/dists/") and http.request.uri.path contains "/by-hash/"))`.
- Matching paths are eligible for cache, with an edge TTL of 1 year that
  ignores cache-control headers.
- A Status code TTL of `no-store` for codes of 400 and up keeps errors out
  of the cache. The TTL override otherwise applies to every status code.
- Browser TTL respects the origin.
- Everything else is uncached (`DYNAMIC`), including the mutable indexes.
  After each publish, the writer purges the mutable index URLs
  (`InRelease`, `Release`, `Release.gpg`, `Packages*`) as a safety net.

## Operational notes

- **A failed or cancelled publish run** keeps its payload: rerun it from the
  Actions page. The audit lists releases that never got published.
- **"The bucket … does not match aptly's database"** means the state is lost
  or stale, or something else changed the bucket. Inspect it first, then run
  rollback with `force` and the snapshot the bucket should serve.
- **A bad version:** withdraw it, which removes that version only. A rollback
  also removes later packages of other producers in that codename.
- **After rotating a secret,** run check-secrets.
- **Private producers:** the publish workflow's token cannot download releases
  from another private repository.
- **The legacy `stable` suite** at the bucket root is watched by the
  [stable repository drift alarm](stable-repository-drift-alarm.md). Nothing in
  apt-publisher writes outside `debian/`.

## References

- Rationale: [ADR-0055](../adr/0055-publish-debian-packages-through-the-apt-publisher.md),
  [ADR-0056](../adr/0056-rebuild-images-after-apt-publication.md),
  [ADR-0014](../adr/0014-single-gpg-trust-root.md)
- Contracts: [apt-publisher README](https://github.com/frostyard/apt-publisher/blob/main/README.md)
- Built in: [Plan 0009](../plans/0009-debian-publication-through-apt-publisher.md)
