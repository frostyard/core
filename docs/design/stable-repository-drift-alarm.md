# Stable repository drift alarm

Living document. Rationale:
[ADR-0014](../adr/0014-single-gpg-trust-root.md),
[ADR-0055](../adr/0055-publish-debian-packages-through-the-apt-publisher.md).
Contracts:
[stable repository drift alarm](../specs/stable-repository-drift-alarm.md).

## Overview

The stable repository drift alarm is a credential-free, read-only check of
the frozen public `stable` APT suite. It compares the public key and all three
signed metadata files with the accepted baseline, verifies both signatures,
checks the fixed Release identity and signed indexes, then streams every
referenced pool object through SHA-256.

```text
committed baseline -> HTTPS reads -> signature and identity checks
                   -> signed index checks -> streamed pool checks -> status
```

The candidate workflow is not an installed production canary until it is
separately approved, merged, dispatched against a safe test condition, and
observed by a human.

## Design

`.github/stable-repository.json` is the closed, nonsecret baseline record.
`scripts/check-stable-repository.mjs` loads it and delegates verification to
`scripts/lib/stable-repository.mjs`. The library:

1. fetches without credentials and rejects redirects or non-200 responses;
2. verifies the pinned public-key and Release/InRelease/Release.gpg bytes;
3. uses an isolated temporary GnuPG home to verify the exact ADR-0014 signer;
4. requires the InRelease payload to equal Release byte-for-byte;
5. requires the exact Origin, Label, Suite, Codename, Components,
   Architectures and signed index set;
6. verifies every index size and SHA-256, including gzip/plain equivalence;
7. derives a unique pool manifest only from the verified plain indexes; and
8. streams every referenced object and verifies its signed size and SHA-256.

The scheduled workflow has only `contents: read`, receives no secret, never
writes the repository or artifact origin, and does not attempt rollback,
purge, deletion, or repair. Its nonzero exit is the alarm signal.

## Operational notes

Run `npm run check:stable-repository` for a complete live observation. The
current pool is about 2.8 GiB, so the candidate schedule is weekly. Tests use
explicit fixture records and an ephemeral fixture signing key; fixture
success is not production evidence.

Any missing response, timeout, redirect, digest mismatch, signature failure,
identity drift, index-set change, malformed stanza, duplicate pool path, or
object mismatch fails closed. The command emits only the observation time,
public digests, signer fingerprint, and aggregate counts on success. It does
not read or print credentials.

Changes to the committed baseline require independent review and the exact
human authority applicable to the underlying stable mutation. A digest update
must never be used to silence an unexplained alarm.

## Baseline provenance

The current baseline was observed on 2026-10-03, after a signed stable update
dated 2026-10-01T12:29:12Z. It records 234 pool objects totalling
3,145,098,600 bytes. Compared with the 2026-09-15 baseline:

- The 228 prior pool paths are all still present, with the baseline's exact
  aggregate size (2,965,276,828 bytes). None of those objects was modified
  after 2026-09-14.
- The signed indexes added exactly the six objects below, each checked
  against signed SHA-256 metadata and matched byte for byte to its build
  output.
- The Release identity fields are unchanged.

| Pool path | Bytes | SHA-256 | Source |
| --- | --- | --- | --- |
| `pool/main/i/incus/incus_7.4-debian13-202609161516_amd64.deb` | 77,980,124 | `c68e64c3ad6ca077e787173a838fc646bf81e419417b7e31cf50ea9edd4a5609` | incus Build (Docker) [run 35110668051](https://github.com/frostyard/incus/actions/runs/35110668051), `stable` branch, artifact `debian-trixie-amd64` |
| `pool/main/i/incus-base/incus-base_7.4-debian13-202609161516_amd64.deb` | 50,643,388 | `a1507124f705b21b3f7be915422e1999a9ccdd098dfef484fc807267ce40d7f4` | same run and artifact |
| `pool/main/i/incus-client/incus-client_7.4-debian13-202609161516_amd64.deb` | 7,671,832 | `49a2226d0ce7b68b7235f44f40a1e288b8cc1dd211fcd782b7d1ae4763b7a0fe` | same run and artifact |
| `pool/main/i/incus-extra/incus-extra_7.4-debian13-202609161516_amd64.deb` | 36,563,136 | `2c923a9d9e74d54fd847a2a705a2eaba4fc7ed8e153411662229626e8e4f939b` | same run and artifact |
| `pool/main/i/incus-ui-canonical/incus-ui-canonical_7.4-debian13-202609161516_amd64.deb` | 3,645,836 | `6dc8bf902c6b4e9c48f571d3385c23840be190adbd27da4205ad0889876c024f` | same run and artifact |
| `pool/main/f/frostyard-firn/frostyard-firn_0.6.0_amd64.deb` | 3,317,456 | `0ede651e4bd79a110fc0d6b08a90a78365a6a87f9c04fa3e51e11dd8c5757cfa` | firn v0.6.0 release asset; [release run 36861895977](https://github.com/frostyard/firn/actions/runs/36861895977) |

The incus objects were uploaded at 2026-09-16 15:18 UTC, as run 35110668051
finished. The firn object was uploaded as release run 36861895977 finished at
2026-10-01T12:29:26Z, producing the observed Release timestamp. Both
workflows called Repogen's `publish-to-r2` action at a commit that predates
its refusal of `package-type: deb`:

- incus, `v0.4.1`;
- firn, `6648671cec7015231fac1f278f09ee5799281bc9`.

Both were therefore able to write the frozen suite. The alarm reported the
incus delta on its 2026-09-21 and 2026-09-28 runs.

On 2026-10-03 the organization's R2 and Repogen signing secrets were limited
to the repositories that still need them. Debian packages publish through
`frostyard/apt-publisher` instead
([ADR-0055](../adr/0055-publish-debian-packages-through-the-apt-publisher.md)).

This provenance explains the observed delta. It does not substitute for
independent review or authorize a future stable mutation.

### Previous baseline (2026-09-15)

The previous baseline was observed on 2026-09-15, after a signed stable
update dated 2026-09-14T23:16:54Z. Relative to the verified 2026-09-12
snapshot, all 227 prior package entries were unchanged, and the signed
indexes added exactly
`pool/main/f/frostyard-updex/frostyard-updex_2.0.1_amd64.deb`
(4,182,782 bytes, SHA-256
`51e2ac000b3749d39809ab8df36d6b319b2b97010531bd42f36544dddcea84bf`). That
object matches the public Updex v2.0.1 release asset and the successful
[Updex release workflow](https://github.com/frostyard/updex/actions/runs/34908032866),
which uploaded the same path while producing the observed Release timestamp.

## References

- Rationale:
  [ADR-0014](../adr/0014-single-gpg-trust-root.md),
  [ADR-0055](../adr/0055-publish-debian-packages-through-the-apt-publisher.md)
  (signed-`stable` floor; first recorded in
  [ADR-0048](../adr/0048-publish-debian-packages-to-explicit-codenames.md))
- Accepted NBC-specific policy clarification (does not change this verifier):
  [ADR-0052](../adr/0052-remove-nbc-artifact-retention-gates.md)
- Contracts:
  [stable repository drift alarm](../specs/stable-repository-drift-alarm.md)
- Built in:
  [Plan 0007 first action](../plans/0007-support-suites-in-repogen.md#first-10-actions-after-separate-implementation-authorization)
