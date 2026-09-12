import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";

const execFileAsync = promisify(execFile);

export const RECORD_PATH = ".github/stable-repository.json";
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const FINGERPRINT_PATTERN = /^[0-9A-F]{40}$/;
const REQUIRED_RECORD_KEYS = [
  "schema_version",
  "never_relax",
  "base_url",
  "suite",
  "public_key",
  "metadata",
  "identity",
  "indexes",
  "expected_pool_objects",
  "expected_pool_bytes",
];
const REQUIRED_IDENTITY_KEYS = [
  "Origin",
  "Label",
  "Suite",
  "Codename",
  "Components",
  "Architectures",
];
const REQUIRED_METADATA_KEYS = ["release", "inrelease", "release_gpg"];
const MAX_KEY_BYTES = 1024 * 1024;
const MAX_METADATA_BYTES = 64 * 1024 * 1024;

export class StableRepositoryError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "StableRepositoryError";
    this.details = details;
  }
}

function validateExactKeys(value, required, label, details) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    details.push(`${label} must be an object`);
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!required.includes(key)) details.push(`${label}: unknown field: ${key}`);
  }
  for (const key of required) {
    if (!(key in value)) details.push(`${label}: missing field: ${key}`);
  }
  return true;
}

function validateDigest(value, label, details) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    details.push(`${label} must be a lowercase SHA-256 digest`);
  }
}

function validateRelativePath(value, label, details) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    details.push(`${label} must be a normalized relative path`);
  }
}

export function parseRecord(value) {
  const details = [];
  if (!validateExactKeys(value, REQUIRED_RECORD_KEYS, RECORD_PATH, details)) {
    throw new StableRepositoryError(`${RECORD_PATH} is invalid`, details);
  }

  if (value.schema_version !== 1) {
    details.push(`unsupported schema_version: ${JSON.stringify(value.schema_version)}`);
  }
  if (value.never_relax !== true) {
    details.push("never_relax must be true");
  }
  try {
    const url = new URL(value.base_url);
    if (url.protocol !== "https:") details.push("base_url must use https");
    if (url.username || url.password || url.search || url.hash) {
      details.push("base_url must not contain credentials, a query, or a fragment");
    }
    if (!url.pathname.endsWith("/")) details.push("base_url must end with /");
  } catch {
    details.push("base_url must be an absolute URL");
  }
  if (value.suite !== "stable") details.push("suite must be stable");

  if (
    validateExactKeys(
      value.public_key,
      ["path", "sha256", "fingerprint"],
      "public_key",
      details,
    )
  ) {
    validateRelativePath(value.public_key.path, "public_key.path", details);
    validateDigest(value.public_key.sha256, "public_key.sha256", details);
    if (
      typeof value.public_key.fingerprint !== "string" ||
      !FINGERPRINT_PATTERN.test(value.public_key.fingerprint)
    ) {
      details.push("public_key.fingerprint must be a 40-character uppercase fingerprint");
    }
  }

  if (validateExactKeys(value.metadata, REQUIRED_METADATA_KEYS, "metadata", details)) {
    for (const name of REQUIRED_METADATA_KEYS) {
      const entry = value.metadata[name];
      if (validateExactKeys(entry, ["path", "sha256"], `metadata.${name}`, details)) {
        validateRelativePath(entry.path, `metadata.${name}.path`, details);
        validateDigest(entry.sha256, `metadata.${name}.sha256`, details);
      }
    }
  }

  if (validateExactKeys(value.identity, REQUIRED_IDENTITY_KEYS, "identity", details)) {
    for (const key of REQUIRED_IDENTITY_KEYS) {
      if (typeof value.identity[key] !== "string" || !value.identity[key].trim()) {
        details.push(`identity.${key} must be a non-empty string`);
      }
    }
    if (value.identity.Suite !== "stable" || value.identity.Codename !== "stable") {
      details.push("identity Suite and Codename must both be stable");
    }
  }

  if (
    !Array.isArray(value.indexes) ||
    value.indexes.length === 0 ||
    value.indexes.some((entry) => typeof entry !== "string")
  ) {
    details.push("indexes must be a non-empty array of paths");
  } else {
    const seen = new Set();
    for (const [index, entry] of value.indexes.entries()) {
      validateRelativePath(entry, `indexes[${index}]`, details);
      if (seen.has(entry)) details.push(`indexes contains duplicate path: ${entry}`);
      seen.add(entry);
    }
  }

  for (const field of ["expected_pool_objects", "expected_pool_bytes"]) {
    if (!Number.isSafeInteger(value[field]) || value[field] <= 0) {
      details.push(`${field} must be a positive safe integer`);
    }
  }

  if (details.length > 0) throw new StableRepositoryError(`${RECORD_PATH} is invalid`, details);
  return value;
}

export async function loadRecord(repoRoot) {
  let text;
  try {
    text = await readFile(path.join(repoRoot, RECORD_PATH), "utf8");
  } catch (error) {
    throw new StableRepositoryError(
      `${RECORD_PATH} could not be read: ${error.code ?? error.message}`,
    );
  }
  try {
    return parseRecord(JSON.parse(text));
  } catch (error) {
    if (error instanceof StableRepositoryError) throw error;
    throw new StableRepositoryError(`${RECORD_PATH} is not valid JSON: ${error.message}`);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertDigest(value, expected, label) {
  const actual = sha256(value);
  if (actual !== expected) {
    throw new StableRepositoryError(
      `${label} SHA-256 drift: expected ${expected}, observed ${actual}`,
    );
  }
  return actual;
}

function repositoryUrl(record, relativePath) {
  return new URL(relativePath, record.base_url).href;
}

async function fetchResponse(url, fetchImpl, timeoutMs) {
  let response;
  try {
    response = await fetchImpl(url, {
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new StableRepositoryError(`GET ${url} failed: ${error.message}`);
  }
  if (response.status !== 200) {
    throw new StableRepositoryError(`GET ${url} returned HTTP ${response.status}, expected 200`);
  }
  return response;
}

async function readLimited(response, limit, label) {
  const chunks = [];
  let size = 0;
  if (!response.body) throw new StableRepositoryError(`${label} returned no response body`);
  for await (const chunk of response.body) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > limit) {
      throw new StableRepositoryError(`${label} exceeded the ${limit}-byte safety limit`);
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

async function fetchBuffer(record, relativePath, fetchImpl, timeoutMs, limit) {
  const url = repositoryUrl(record, relativePath);
  const response = await fetchResponse(url, fetchImpl, timeoutMs);
  return readLimited(response, limit, relativePath);
}

function parseStatusFingerprints(status) {
  return status
    .split("\n")
    .filter((line) => line.startsWith("[GNUPG:] VALIDSIG "))
    .map((line) => line.split(/\s+/)[2]);
}

export async function verifyMetadataSignatures({
  publicKey,
  release,
  inrelease,
  releaseGpg,
  expectedFingerprint,
}) {
  const home = await mkdtemp(path.join(os.tmpdir(), "stable-repository-gpg-"));
  try {
    await Promise.all([
      writeFile(path.join(home, "public.key"), publicKey),
      writeFile(path.join(home, "Release"), release),
      writeFile(path.join(home, "InRelease"), inrelease),
      writeFile(path.join(home, "Release.gpg"), releaseGpg),
    ]);

    const { stdout: keyListing } = await execFileAsync(
      "gpg",
      ["--batch", "--with-colons", "--show-keys", "--fingerprint", path.join(home, "public.key")],
      { encoding: "utf8", maxBuffer: 1024 * 1024 },
    );
    const primaryFingerprint = keyListing
      .split("\n")
      .find((line, index, lines) => line.startsWith("fpr:") && lines[index - 1]?.startsWith("pub:"))
      ?.split(":")[9];
    if (primaryFingerprint !== expectedFingerprint) {
      throw new StableRepositoryError(
        `public key fingerprint drift: expected ${expectedFingerprint}, observed ${
          primaryFingerprint ?? "none"
        }`,
      );
    }

    await execFileAsync(
      "gpg",
      ["--batch", "--quiet", "--homedir", home, "--import", path.join(home, "public.key")],
      { encoding: "utf8", maxBuffer: 1024 * 1024 },
    );

    const clearPath = path.join(home, "Release.from-InRelease");
    const { stdout: inlineStatus } = await execFileAsync(
      "gpg",
      [
        "--batch",
        "--quiet",
        "--homedir",
        home,
        "--status-fd",
        "1",
        "--output",
        clearPath,
        "--decrypt",
        path.join(home, "InRelease"),
      ],
      { encoding: "utf8", maxBuffer: 1024 * 1024 },
    );
    const { stdout: detachedStatus } = await execFileAsync(
      "gpg",
      [
        "--batch",
        "--quiet",
        "--homedir",
        home,
        "--status-fd",
        "1",
        "--verify",
        path.join(home, "Release.gpg"),
        path.join(home, "Release"),
      ],
      { encoding: "utf8", maxBuffer: 1024 * 1024 },
    );

    for (const [label, status] of [
      ["InRelease", inlineStatus],
      ["Release.gpg", detachedStatus],
    ]) {
      const fingerprints = parseStatusFingerprints(status);
      if (fingerprints.length !== 1 || fingerprints[0] !== expectedFingerprint) {
        throw new StableRepositoryError(
          `${label} did not produce exactly one valid signature from ${expectedFingerprint}`,
        );
      }
    }

    const clearRelease = await readFile(clearPath);
    if (!clearRelease.equals(release)) {
      throw new StableRepositoryError("InRelease signed payload is not byte-identical to Release");
    }
  } catch (error) {
    if (error instanceof StableRepositoryError) throw error;
    throw new StableRepositoryError(`OpenPGP verification failed: ${error.message}`);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

export function parseRelease(release) {
  const fields = new Map();
  const checksums = new Map();
  let section = "";
  for (const line of release.toString("utf8").split(/\r?\n/)) {
    if (line === "") {
      section = "";
      continue;
    }
    if (/^\S[^:]*:/.test(line)) {
      const separator = line.indexOf(":");
      const key = line.slice(0, separator);
      const value = line.slice(separator + 1).trim();
      if (fields.has(key)) throw new StableRepositoryError(`Release contains duplicate field ${key}`);
      fields.set(key, value);
      section = key;
      continue;
    }
    if (/^\s/.test(line) && section === "SHA256") {
      const match = line.trim().match(/^([0-9a-f]{64})\s+(\d+)\s+(\S+)$/);
      if (!match) throw new StableRepositoryError(`Release has malformed SHA256 entry: ${line}`);
      const [, digest, sizeText, relativePath] = match;
      if (checksums.has(relativePath)) {
        throw new StableRepositoryError(`Release has duplicate SHA256 path ${relativePath}`);
      }
      checksums.set(relativePath, { sha256: digest, size: Number(sizeText) });
    }
  }
  if (!fields.has("SHA256") || checksums.size === 0) {
    throw new StableRepositoryError("Release has no SHA256 index entries");
  }
  return { fields, checksums };
}

function verifyReleaseContract(record, parsed) {
  for (const [key, expected] of Object.entries(record.identity)) {
    const actual = parsed.fields.get(key);
    if (actual !== expected) {
      throw new StableRepositoryError(
        `Release ${key} drift: expected ${JSON.stringify(expected)}, observed ${JSON.stringify(actual)}`,
      );
    }
  }

  const advertised = [...parsed.checksums.keys()].sort();
  const expected = [...record.indexes].sort();
  if (JSON.stringify(advertised) !== JSON.stringify(expected)) {
    throw new StableRepositoryError(
      `Release index set drift: expected ${expected.join(", ")}, observed ${advertised.join(", ")}`,
    );
  }
}

function parsePackages(value, label) {
  const objects = [];
  const stanzas = value
    .toString("utf8")
    .trim()
    .split(/\r?\n\r?\n/);
  for (const [index, stanza] of stanzas.entries()) {
    if (!stanza.trim()) continue;
    const fields = new Map();
    for (const line of stanza.split(/\r?\n/)) {
      if (/^\s/.test(line)) continue;
      const separator = line.indexOf(":");
      if (separator <= 0) {
        throw new StableRepositoryError(`${label} stanza ${index + 1} has malformed field`);
      }
      const key = line.slice(0, separator);
      if (fields.has(key)) {
        throw new StableRepositoryError(`${label} stanza ${index + 1} has duplicate field ${key}`);
      }
      fields.set(key, line.slice(separator + 1).trim());
    }
    const filename = fields.get("Filename");
    const digest = fields.get("SHA256");
    const sizeText = fields.get("Size");
    const details = [];
    validateRelativePath(filename, `${label} stanza ${index + 1} Filename`, details);
    if (typeof filename === "string" && !filename.startsWith("pool/")) {
      details.push(`${label} stanza ${index + 1} Filename must start with pool/`);
    }
    validateDigest(digest, `${label} stanza ${index + 1} SHA256`, details);
    const size = Number(sizeText);
    if (!/^\d+$/.test(sizeText ?? "") || !Number.isSafeInteger(size) || size <= 0) {
      details.push(`${label} stanza ${index + 1} Size must be a positive safe integer`);
    }
    if (details.length > 0) {
      throw new StableRepositoryError(`${label} has an invalid package stanza`, details);
    }
    objects.push({ filename, sha256: digest, size });
  }
  return objects;
}

async function verifyStream(response, expected, label) {
  if (!response.body) throw new StableRepositoryError(`${label} returned no response body`);
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of response.body) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > expected.size) {
      throw new StableRepositoryError(
        `${label} size drift: expected ${expected.size}, observed more than ${expected.size}`,
      );
    }
    hash.update(bytes);
  }
  const digest = hash.digest("hex");
  if (size !== expected.size || digest !== expected.sha256) {
    throw new StableRepositoryError(
      `${label} drift: expected ${expected.size} bytes/${expected.sha256}, observed ${size} bytes/${digest}`,
    );
  }
}

export async function verifyStableRepository(
  record,
  {
    fetchImpl = fetch,
    signatureVerifier = verifyMetadataSignatures,
    timeoutMs = 120_000,
    observedAt = new Date(),
  } = {},
) {
  const keyPromise = fetchBuffer(
    record,
    record.public_key.path,
    fetchImpl,
    timeoutMs,
    MAX_KEY_BYTES,
  );
  const metadataPromises = Object.fromEntries(
    Object.entries(record.metadata).map(([name, entry]) => [
      name,
      fetchBuffer(record, entry.path, fetchImpl, timeoutMs, MAX_METADATA_BYTES),
    ]),
  );
  const [publicKey, release, inrelease, releaseGpg] = await Promise.all([
    keyPromise,
    metadataPromises.release,
    metadataPromises.inrelease,
    metadataPromises.release_gpg,
  ]);

  assertDigest(publicKey, record.public_key.sha256, "public key");
  assertDigest(release, record.metadata.release.sha256, "Release");
  assertDigest(inrelease, record.metadata.inrelease.sha256, "InRelease");
  assertDigest(releaseGpg, record.metadata.release_gpg.sha256, "Release.gpg");

  await signatureVerifier({
    publicKey,
    release,
    inrelease,
    releaseGpg,
    expectedFingerprint: record.public_key.fingerprint,
  });

  const parsedRelease = parseRelease(release);
  verifyReleaseContract(record, parsedRelease);

  const indexes = new Map();
  for (const relativePath of record.indexes) {
    const expected = parsedRelease.checksums.get(relativePath);
    const bytes = await fetchBuffer(
      record,
      `dists/${record.suite}/${relativePath}`,
      fetchImpl,
      timeoutMs,
      MAX_METADATA_BYTES,
    );
    if (bytes.length !== expected.size) {
      throw new StableRepositoryError(
        `${relativePath} size drift: expected ${expected.size}, observed ${bytes.length}`,
      );
    }
    assertDigest(bytes, expected.sha256, relativePath);
    indexes.set(relativePath, bytes);
  }

  for (const relativePath of record.indexes.filter((entry) => entry.endsWith(".gz"))) {
    const plainPath = relativePath.slice(0, -3);
    let inflated;
    try {
      inflated = gunzipSync(indexes.get(relativePath));
    } catch (error) {
      throw new StableRepositoryError(`${relativePath} is not valid gzip: ${error.message}`);
    }
    if (!inflated.equals(indexes.get(plainPath))) {
      throw new StableRepositoryError(`${relativePath} does not expand byte-for-byte to ${plainPath}`);
    }
  }

  const objects = new Map();
  for (const relativePath of record.indexes.filter((entry) => !entry.endsWith(".gz"))) {
    for (const entry of parsePackages(indexes.get(relativePath), relativePath)) {
      if (objects.has(entry.filename)) {
        throw new StableRepositoryError(`package indexes contain duplicate path ${entry.filename}`);
      }
      objects.set(entry.filename, entry);
    }
  }

  const totalBytes = [...objects.values()].reduce((sum, entry) => sum + entry.size, 0);
  if (
    objects.size !== record.expected_pool_objects ||
    totalBytes !== record.expected_pool_bytes
  ) {
    throw new StableRepositoryError(
      `pool manifest drift: expected ${record.expected_pool_objects} objects/` +
        `${record.expected_pool_bytes} bytes, observed ${objects.size} objects/${totalBytes} bytes`,
    );
  }

  for (const entry of objects.values()) {
    const response = await fetchResponse(repositoryUrl(record, entry.filename), fetchImpl, timeoutMs);
    await verifyStream(response, entry, entry.filename);
  }

  return {
    observed_at: observedAt.toISOString(),
    suite: record.suite,
    signer_fingerprint: record.public_key.fingerprint,
    release_sha256: record.metadata.release.sha256,
    inrelease_sha256: record.metadata.inrelease.sha256,
    release_gpg_sha256: record.metadata.release_gpg.sha256,
    indexes: indexes.size,
    pool_objects: objects.size,
    pool_bytes: totalBytes,
  };
}
