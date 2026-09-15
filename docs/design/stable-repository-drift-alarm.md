# Stable repository drift alarm

Living document. Rationale:
[ADR-0014](../adr/0014-single-gpg-trust-root.md),
[ADR-0048](../adr/0048-publish-debian-packages-to-explicit-codenames.md).
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

The correction-forward candidate baseline was observed on 2026-09-15 after a
signed stable update dated 2026-09-14T23:16:54Z. Relative to the verified
2026-09-12 snapshot, all 227 prior package entries were unchanged and the
signed indexes added exactly
`pool/main/f/frostyard-updex/frostyard-updex_2.0.1_amd64.deb`
(4,182,782 bytes, SHA-256
`51e2ac000b3749d39809ab8df36d6b319b2b97010531bd42f36544dddcea84bf`).
That identity matches the public Updex v2.0.1 release asset and the successful
[Updex release workflow](https://github.com/frostyard/updex/actions/runs/34908032866),
which uploaded the same path while producing the observed Release timestamp.
All four signed indexes and the added pool object were checked against signed
SHA-256 metadata before this candidate baseline was recorded. This provenance
explains the observed delta; it does not substitute for independent review or
authorize a future stable mutation.

## References

- Rationale:
  [ADR-0014](../adr/0014-single-gpg-trust-root.md),
  [ADR-0048](../adr/0048-publish-debian-packages-to-explicit-codenames.md)
- Contracts:
  [stable repository drift alarm](../specs/stable-repository-drift-alarm.md)
- Built in:
  [Plan 0007 first action](../plans/0007-support-suites-in-repogen.md#first-10-actions-after-separate-implementation-authorization)
