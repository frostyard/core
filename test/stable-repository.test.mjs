import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

import {
  StableRepositoryError,
  loadRecord,
  parseRecord,
  verifyMetadataSignatures,
  verifyStableRepository,
} from "../scripts/lib/stable-repository.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fixture() {
  const publicKey = Buffer.from("fixture public key\n");
  const releaseGpg = Buffer.from("fixture detached signature\n");
  const packagesAll = Buffer.from(
    "Package: fixture-data\nVersion: 1\nArchitecture: all\n" +
      "Filename: pool/main/f/fixture/fixture-data_1_all.deb\nSize: 4\n" +
      `SHA256: ${sha256("data")}\n`,
  );
  const packagesAmd64 = Buffer.from(
    "Package: fixture\nVersion: 1\nArchitecture: amd64\n" +
      "Filename: pool/main/f/fixture/fixture_1_amd64.deb\nSize: 6\n" +
      `SHA256: ${sha256("binary")}\n`,
  );
  const indexes = new Map([
    ["main/binary-all/Packages", packagesAll],
    ["main/binary-all/Packages.gz", gzipSync(packagesAll)],
    ["main/binary-amd64/Packages", packagesAmd64],
    ["main/binary-amd64/Packages.gz", gzipSync(packagesAmd64)],
  ]);
  const checksumLines = [...indexes]
    .map(([name, bytes]) => ` ${sha256(bytes)} ${bytes.length} ${name}`)
    .join("\n");
  const release = Buffer.from(
    "Origin: Repogen Repository\nLabel: Frostyard Repository\nSuite: stable\n" +
      "Codename: stable\nComponents: main\nArchitectures: all amd64\n" +
      `SHA256:\n${checksumLines}\n`,
  );
  const inrelease = Buffer.from("fixture clear signature\n");
  const record = parseRecord({
    schema_version: 1,
    never_relax: true,
    base_url: "https://fixture.invalid/",
    suite: "stable",
    public_key: {
      path: "public.key",
      sha256: sha256(publicKey),
      fingerprint: "0123456789ABCDEF0123456789ABCDEF01234567",
    },
    metadata: {
      release: { path: "dists/stable/Release", sha256: sha256(release) },
      inrelease: { path: "dists/stable/InRelease", sha256: sha256(inrelease) },
      release_gpg: { path: "dists/stable/Release.gpg", sha256: sha256(releaseGpg) },
    },
    identity: {
      Origin: "Repogen Repository",
      Label: "Frostyard Repository",
      Suite: "stable",
      Codename: "stable",
      Components: "main",
      Architectures: "all amd64",
    },
    indexes: [...indexes.keys()],
    expected_pool_objects: 2,
    expected_pool_bytes: 10,
  });
  const bodies = new Map([
    ["public.key", publicKey],
    ["dists/stable/Release", release],
    ["dists/stable/InRelease", inrelease],
    ["dists/stable/Release.gpg", releaseGpg],
    ...[...indexes].map(([name, bytes]) => [`dists/stable/${name}`, bytes]),
    ["pool/main/f/fixture/fixture-data_1_all.deb", Buffer.from("data")],
    ["pool/main/f/fixture/fixture_1_amd64.deb", Buffer.from("binary")],
  ]);
  const fetchImpl = async (url) => {
    const name = new URL(url).pathname.slice(1);
    return bodies.has(name) ? new Response(bodies.get(name), { status: 200 }) : new Response("", { status: 404 });
  };
  const signatureVerifier = async ({ release: signedRelease }) => {
    assert.deepEqual(signedRelease, release);
  };
  return { bodies, fetchImpl, indexes, record, release, signatureVerifier };
}

test("the committed baseline pins the correction-forward stable candidate", async () => {
  const record = await loadRecord(repoRoot);
  assert.equal(record.base_url, "https://repository.frostyard.org/");
  assert.equal(record.public_key.fingerprint, "432C452CD2B7F4FF1B5D23264DE6A2016E622F97");
  assert.equal(
    record.metadata.release.sha256,
    "c363d215c449aa257d9392a9dbbfcf2666732062f30b529ad294f571f372cd92",
  );
  assert.equal(
    record.metadata.inrelease.sha256,
    "edf980f5503fc524c4aeaec87bd797670e3bb93960cd7bcf8b637bb7b9e5afe6",
  );
  assert.equal(
    record.metadata.release_gpg.sha256,
    "a5d95a0bbb0272f539a5738971055b2a77cba1b45d12f3c1209fad3d5cc90232",
  );
  assert.equal(record.expected_pool_objects, 228);
  assert.equal(record.expected_pool_bytes, 2965276828);
});

test("the verifier accepts an exact signed-index fixture", async () => {
  const item = fixture();
  const report = await verifyStableRepository(item.record, {
    fetchImpl: item.fetchImpl,
    signatureVerifier: item.signatureVerifier,
    observedAt: new Date("2026-09-12T18:05:35Z"),
  });
  assert.deepEqual(report, {
    observed_at: "2026-09-12T18:05:35.000Z",
    suite: "stable",
    signer_fingerprint: "0123456789ABCDEF0123456789ABCDEF01234567",
    release_sha256: item.record.metadata.release.sha256,
    inrelease_sha256: item.record.metadata.inrelease.sha256,
    release_gpg_sha256: item.record.metadata.release_gpg.sha256,
    indexes: 4,
    pool_objects: 2,
    pool_bytes: 10,
  });
});

test("metadata drift fails before signature verification", async () => {
  const item = fixture();
  item.bodies.set("dists/stable/Release", Buffer.concat([item.release, Buffer.from("drift\n")]));
  let signatureCalls = 0;
  await assert.rejects(
    verifyStableRepository(item.record, {
      fetchImpl: item.fetchImpl,
      signatureVerifier: async () => {
        signatureCalls += 1;
      },
    }),
    /Release SHA-256 drift/,
  );
  assert.equal(signatureCalls, 0);
});

test("identity and pool-object drift fail closed", async () => {
  const identity = fixture();
  const changed = Buffer.from(identity.release.toString().replace("Suite: stable", "Suite: testing"));
  identity.bodies.set("dists/stable/Release", changed);
  identity.record.metadata.release.sha256 = sha256(changed);
  identity.signatureVerifier = async () => {};
  await assert.rejects(
    verifyStableRepository(identity.record, {
      fetchImpl: identity.fetchImpl,
      signatureVerifier: identity.signatureVerifier,
    }),
    /Release Suite drift/,
  );

  const pool = fixture();
  pool.bodies.set("pool/main/f/fixture/fixture_1_amd64.deb", Buffer.from("broken"));
  await assert.rejects(
    verifyStableRepository(pool.record, {
      fetchImpl: pool.fetchImpl,
      signatureVerifier: pool.signatureVerifier,
    }),
    /fixture_1_amd64\.deb drift/,
  );
});

test("missing indexes and compressed-index divergence fail closed", async () => {
  const missing = fixture();
  missing.bodies.delete("dists/stable/main/binary-all/Packages");
  await assert.rejects(
    verifyStableRepository(missing.record, {
      fetchImpl: missing.fetchImpl,
      signatureVerifier: missing.signatureVerifier,
    }),
    /returned HTTP 404/,
  );

  const compressed = fixture();
  const changedGzip = gzipSync(Buffer.from("different\n"));
  compressed.bodies.set("dists/stable/main/binary-all/Packages.gz", changedGzip);
  compressed.record.metadata.release.sha256 = sha256(compressed.release);
  const releaseText = compressed.release
    .toString()
    .replace(
      new RegExp(
        `${sha256(compressed.indexes.get("main/binary-all/Packages.gz"))} \\d+ main/binary-all/Packages.gz`,
      ),
      `${sha256(changedGzip)} ${changedGzip.length} main/binary-all/Packages.gz`,
    );
  compressed.release = Buffer.from(releaseText);
  compressed.bodies.set("dists/stable/Release", compressed.release);
  compressed.record.metadata.release.sha256 = sha256(compressed.release);
  compressed.signatureVerifier = async () => {};
  await assert.rejects(
    verifyStableRepository(compressed.record, {
      fetchImpl: compressed.fetchImpl,
      signatureVerifier: compressed.signatureVerifier,
    }),
    /does not expand byte-for-byte/,
  );
});

test("the closed record schema rejects weakening and unsafe paths", () => {
  const item = fixture();
  const invalid = structuredClone(item.record);
  invalid.never_relax = false;
  invalid.public_key.value = "secret";
  invalid.indexes[0] = "../Packages";
  assert.throws(
    () => parseRecord(invalid),
    (error) =>
      error instanceof StableRepositoryError &&
      error.details.includes("never_relax must be true") &&
      error.details.includes("public_key: unknown field: value") &&
      error.details.includes("indexes[0] must be a normalized relative path"),
  );
});

test("real OpenPGP verification accepts the fixture signer and rejects tampering", async () => {
  const signerHome = await mkdtemp(path.join(os.tmpdir(), "stable-repository-signer-"));
  try {
    await execFileAsync(
      "gpg",
      [
        "--batch",
        "--quiet",
        "--homedir",
        signerHome,
        "--passphrase",
        "",
        "--quick-generate-key",
        "Stable Repository Fixture <fixture@example.invalid>",
        "ed25519",
        "sign",
        "0",
      ],
      { encoding: "utf8" },
    );
    const { stdout: listing } = await execFileAsync(
      "gpg",
      ["--batch", "--homedir", signerHome, "--with-colons", "--list-keys", "--fingerprint"],
      { encoding: "utf8" },
    );
    const fingerprint = listing
      .split("\n")
      .find((line, index, lines) => line.startsWith("fpr:") && lines[index - 1]?.startsWith("pub:"))
      .split(":")[9];
    const { stdout: publicKey } = await execFileAsync(
      "gpg",
      ["--batch", "--homedir", signerHome, "--armor", "--export", fingerprint],
      { encoding: "buffer" },
    );
    const release = Buffer.from("Origin: Fixture\nSHA256:\n");
    const releasePath = path.join(signerHome, "Release");
    const inreleasePath = path.join(signerHome, "InRelease");
    const releaseGpgPath = path.join(signerHome, "Release.gpg");
    await writeFile(releasePath, release);
    await execFileAsync(
      "gpg",
      [
        "--batch",
        "--quiet",
        "--homedir",
        signerHome,
        "--armor",
        "--local-user",
        fingerprint,
        "--output",
        inreleasePath,
        "--clearsign",
        releasePath,
      ],
      { encoding: "utf8" },
    );
    await execFileAsync(
      "gpg",
      [
        "--batch",
        "--quiet",
        "--homedir",
        signerHome,
        "--local-user",
        fingerprint,
        "--output",
        releaseGpgPath,
        "--detach-sign",
        releasePath,
      ],
      { encoding: "utf8" },
    );
    const [inrelease, releaseGpg] = await Promise.all([
      readFile(inreleasePath),
      readFile(releaseGpgPath),
    ]);

    await verifyMetadataSignatures({
      publicKey,
      release,
      inrelease,
      releaseGpg,
      expectedFingerprint: fingerprint,
    });
    await assert.rejects(
      verifyMetadataSignatures({
        publicKey,
        release: Buffer.concat([release, Buffer.from("tampered\n")]),
        inrelease,
        releaseGpg,
        expectedFingerprint: fingerprint,
      }),
      /OpenPGP verification failed/,
    );
  } finally {
    await rm(signerHome, { recursive: true, force: true });
  }
});
