# Spec: Stable repository drift alarm

This contract governs the read-only verifier for Frostyard's frozen `stable`
APT repository and the committed baseline consumed by that verifier.

## Interface

`npm run check:stable-repository` reads
`.github/stable-repository.json`, performs a complete public verification, and
exits zero only when every check passes. Success output is one JSON object.
Failure output starts with `FAIL stable_repository:` and exits nonzero.

The baseline is a closed JSON object:

| Field | Type | Required | Constraints |
| --- | --- | --- | --- |
| `schema_version` | integer | yes | Exactly `1` |
| `never_relax` | boolean | yes | Exactly `true` |
| `base_url` | URL string | yes | HTTPS, absolute, no credentials/query/fragment |
| `suite` | string | yes | Exactly `stable` |
| `public_key` | object | yes | Relative path, SHA-256, exact uppercase fingerprint |
| `metadata` | object | yes | Exact paths and SHA-256 for Release, InRelease, Release.gpg |
| `identity` | object | yes | Exact six Release identity fields |
| `indexes` | string array | yes | Unique normalized paths advertised by Release SHA256 |
| `expected_pool_objects` | integer | yes | Positive exact object count |
| `expected_pool_bytes` | integer | yes | Positive exact aggregate bytes |

Unknown fields, path traversal, duplicate paths, non-HTTPS origins, and
non-`stable` suite identity are invalid.

## Rules

- The verifier MUST hash the fetched public key and all three metadata files
  before parsing or trusting them.
- InRelease and Release.gpg MUST each have exactly one valid signature from
  the configured ADR-0014 primary fingerprint.
- The clear-signed InRelease payload MUST equal Release byte-for-byte.
- Release identity and its SHA256 index-path set MUST equal the baseline.
- Every advertised index MUST match its signed size and SHA-256; each gzip
  index MUST expand byte-for-byte to its plain counterpart.
- Pool filenames and digests MUST be read only from verified plain indexes.
- Every pool path MUST be unique, normalized, under `pool/`, and its public
  bytes MUST match the signed size and streamed SHA-256.
- Any network, parsing, signature, identity, checksum, count, or size failure
  MUST produce a nonzero exit. The verifier MUST NOT repair or mutate state.
- The workflow MUST receive no secret and MUST have no permission beyond
  reading its own repository contents.
- Passing fixtures or a candidate workflow MUST NOT be represented as an
  installed or observed production canary.

## Derived artifacts

| Artifact | Derivation |
| --- | --- |
| Scheduled alarm result | Complete execution against the committed baseline |
| Success JSON | Public metadata identity, observation time, and aggregate counts |

## References

- Rationale:
  [ADR-0014](../adr/0014-single-gpg-trust-root.md),
  [ADR-0048](../adr/0048-publish-debian-packages-to-explicit-codenames.md)
- Context:
  [stable repository drift alarm design](../design/stable-repository-drift-alarm.md)
