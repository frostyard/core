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

## References

- Rationale:
  [ADR-0014](../adr/0014-single-gpg-trust-root.md),
  [ADR-0048](../adr/0048-publish-debian-packages-to-explicit-codenames.md)
- Contracts:
  [stable repository drift alarm](../specs/stable-repository-drift-alarm.md)
- Built in:
  [Plan 0007 first action](../plans/0007-support-suites-in-repogen.md#first-10-actions-after-separate-implementation-authorization)
