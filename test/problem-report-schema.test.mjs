// The problem-report schema frostyard.problem/1 (docs/specs/problem-report.md,
// ADR-0069): compile in strict mode, validate every example, reject the
// negative cases, guard the closed shape and the registry, and pin the file.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaDir = path.join(repoRoot, "docs/specs/schemas/problem-report");
const schemaPath = path.join(schemaDir, "v1.json");
const examplesDir = path.join(schemaDir, "examples");
const specPath = path.join(repoRoot, "docs/specs/problem-report.md");

// v1 is immutable after its first sender release (spec rule 5), so a change
// to v1.json must also change this pin on purpose.
const V1_SHA256 = "6c053ee3a9b4fd399d1d011b2be833dc6b17f25e727161fc576b0ce64cc14c3a";

const SCHEMA_ID = "https://frostyard.org/schemas/problem-report/v1.json";
const MESSAGE_ID = "8915bdd215c84cbab0c31c05a1a33e7e";
const MAX_BYTES = 8192;

const schemaBytes = readFileSync(schemaPath);
const schema = JSON.parse(schemaBytes.toString("utf8"));
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

const examples = Object.fromEntries(
  readdirSync(examplesDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => [
      path.basename(name, ".json"),
      JSON.parse(readFileSync(path.join(examplesDir, name), "utf8")),
    ]),
);

function example(kind) {
  assert.ok(examples[kind], `no example for ${kind}`);
  return structuredClone(examples[kind]);
}

function assertValid(doc, what) {
  const ok = validate(doc);
  assert.equal(ok, true, `${what} must validate: ${JSON.stringify(validate.errors)}`);
}

function assertInvalid(doc, what) {
  assert.equal(validate(doc), false, `${what} must be rejected`);
}

// A valid Rust panic record, built from the Go example.
function rustPanic() {
  const doc = example("app_problem");
  doc.detail.app_id = "org.frostyard.Frostmail";
  doc.detail.runtime = "rust";
  doc.detail.component = "gui";
  delete doc.detail.frames;
  doc.detail.location = "src/sync/imap.rs:214";
  return doc;
}

// Every node of the schema with its JSON path and whether it is inside an
// `if` or `then` block.
function* walk(node, at = "#", conditional = false) {
  if (Array.isArray(node)) {
    for (const [i, item] of node.entries()) yield* walk(item, `${at}/${i}`, conditional);
    return;
  }
  if (node === null || typeof node !== "object") return;
  yield { node, at, conditional };
  for (const [key, value] of Object.entries(node)) {
    yield* walk(value, `${at}/${key}`, conditional || key === "if" || key === "then");
  }
}

// ---- Schema ---------------------------------------------------------------

test("v1.json compiles in strict mode and has the published $id", () => {
  assert.equal(typeof validate, "function");
  assert.equal(schema.$id, SCHEMA_ID);
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
});

test("v1.json matches its sha256 pin", () => {
  const actual = createHash("sha256").update(schemaBytes).digest("hex");
  assert.equal(actual, V1_SHA256, "v1.json changed: v1 is immutable after its first sender release");
});

test("every object schema with properties is closed", () => {
  const open = [];
  for (const { node, at, conditional } of walk(schema)) {
    if (conditional || !("properties" in node)) continue;
    if (node.additionalProperties !== false) open.push(at);
  }
  assert.deepEqual(open, []);
});

test("every pattern is anchored and no format keyword is used", () => {
  const unanchored = [];
  const formats = [];
  for (const { node, at } of walk(schema)) {
    if (typeof node.pattern === "string" && !(node.pattern.startsWith("^") && node.pattern.endsWith("$"))) {
      unanchored.push(at);
    }
    if ("format" in node) formats.push(at);
  }
  assert.deepEqual(unanchored, []);
  assert.deepEqual(formats, []);
});

// ---- Examples -------------------------------------------------------------

test("the examples folder has exactly 1 example per kind", () => {
  const files = readdirSync(examplesDir).sort();
  const expected = schema.properties.kind.enum.map((kind) => `${kind}.json`).sort();
  assert.deepEqual(files, expected);
});

for (const kind of schema.properties.kind.enum) {
  test(`example ${kind}.json validates and has kind ${kind}`, () => {
    const doc = example(kind);
    assertValid(doc, `${kind}.json`);
    assert.equal(doc.kind, kind);
  });
}

test("a valid Rust panic record validates", () => {
  assertValid(rustPanic(), "Rust panic");
});

// ---- Size -----------------------------------------------------------------

test("every example serializes to under 8192 bytes", () => {
  for (const [kind, doc] of Object.entries(examples)) {
    assert.ok(Buffer.byteLength(JSON.stringify(doc)) < MAX_BYTES, `${kind}.json is too large`);
  }
});

test("real Go frame shapes of the allowed modules validate", () => {
  for (const frame of [
    "runtime.gopanic",
    "main.main",
    "net/http.(*conn).serve",
    "internal/poll.(*FD).Read",
    "github.com/frostyard/nsl/cmd.run.func1",
    "github.com/frostyard/std/problems.Collect[...]",
    "github.com/emersion/go-imap/v2.Foo",
    "github.com/emersion/go-imap/v2/imapclient.(*Client).read",
    "other",
  ]) {
    const doc = example("app_problem");
    doc.detail.frames = [frame];
    assertValid(doc, `frame ${frame}`);
  }
});

test("a worst-case app_problem (32 frames of 160 characters) is under 8192 bytes", () => {
  const doc = example("app_problem");
  const prefix = "github.com/frostyard/";
  const suffix = ".(*Server).Run";
  const frame = prefix + "x".repeat(160 - prefix.length - suffix.length) + suffix;
  assert.equal(frame.length, 160);
  doc.detail.frames = Array.from({ length: 32 }, () => frame);
  doc.detail.component = "other";
  doc.detail.app_id = "org.frostyard.pilothouse";
  doc.detail.app_version = "999999.999999.999999-alpha.9999";
  assertValid(doc, "worst-case app_problem");
  assert.ok(Buffer.byteLength(JSON.stringify(doc)) < MAX_BYTES);
});

const longestLocation = () => {
  const suffix = ".rs:999999";
  return "src/" + "a".repeat(128 - "src/".length - suffix.length) + suffix;
};

test("a worst-case Rust panic (location of 128 characters) validates and is under 8192 bytes", () => {
  const doc = rustPanic();
  doc.detail.location = longestLocation();
  assert.equal(doc.detail.location.length, 128);
  doc.detail.app_version = "999999.999999.999999-alpha.9999";
  assertValid(doc, "worst-case Rust panic");
  assert.ok(Buffer.byteLength(JSON.stringify(doc)) < MAX_BYTES);
});

// ---- Rejections -----------------------------------------------------------

const rejects = [
  ["an unknown top-level field", () => Object.assign(example("count"), { hostname: "pc" })],
  ["an unknown field in detail", () => {
    const doc = example("count");
    doc.detail.note = "x";
    return doc;
  }],
  ["a detail field of another kind", () => {
    const doc = example("count");
    doc.detail.retries = 1;
    return doc;
  }],
  ["an unknown field in image", () => {
    const doc = example("count");
    doc.image.variant = "nvidia";
    return doc;
  }],
  ["an S8 code with spaces and a colon", () => {
    const doc = example("app_problem");
    doc.detail.class = "error";
    delete doc.detail.frames;
    doc.detail.code = "open: no such file";
    return doc;
  }],
  ["an S1 unit with an instance", () => {
    const doc = example("unit_failed");
    doc.detail.unit = "user@1000.service";
    return doc;
  }],
  ["an S1 unit with a space", () => {
    const doc = example("unit_failed");
    doc.detail.unit = "my unit.service";
    return doc;
  }],
  ["an S7 exe that is an absolute path", () => {
    const doc = example("crash");
    doc.detail.exe = "/usr/bin/gnome-shell";
    return doc;
  }],
  ["a Go frame that is a file path", () => {
    const doc = example("app_problem");
    doc.detail.frames = ["/home/user/x.go:12"];
    return doc;
  }],
  ["a Go frame from a module off the allowlist", () => {
    const doc = example("app_problem");
    doc.detail.frames = ["golang.org/x/sys/unix.Syscall"];
    return doc;
  }],
  ["a Go frame with a dot-dot segment", () => {
    const doc = example("app_problem");
    doc.detail.frames = ["github.com/frostyard/a/../b.x"];
    return doc;
  }],
  ["a Go frame with a mixed-case path after a standard library package", () => {
    const doc = example("app_problem");
    doc.detail.frames = ["fmt/home/brian/Documents/taxes.x"];
    return doc;
  }],
  ["a Go frame of a module that only starts like frostyard", () => {
    const doc = example("app_problem");
    doc.detail.frames = ["github.com/frostyardx/a.b"];
    return doc;
  }],
  ["a Rust location that is an absolute path", () => {
    const doc = rustPanic();
    doc.detail.location = "/home/user/src/main.rs:12";
    return doc;
  }],
  ["a Rust location of 129 characters", () => {
    const doc = rustPanic();
    doc.detail.location = "src/a" + longestLocation().slice(4);
    return doc;
  }],
  ["a Rust location of 8 KB", () => {
    const doc = rustPanic();
    doc.detail.location = "src/" + "a".repeat(8192) + ".rs:1";
    return doc;
  }],
  ["an image.version with a trailing newline", () => {
    const doc = example("count");
    doc.image.version += "\n";
    return doc;
  }],
  ["an S8 code with a trailing newline", () => {
    const doc = example("app_problem");
    doc.detail.class = "error";
    delete doc.detail.frames;
    doc.detail.code = "store.migrate_failed\n";
    return doc;
  }],
  ["image.version 2026-11-04", () => {
    const doc = example("count");
    doc.image.version = "2026-11-04";
    return doc;
  }],
  ["app_version v1.2.3", () => {
    const doc = example("app_problem");
    doc.detail.app_version = "v1.2.3";
    return doc;
  }],
  ["app_version 1.2.3-dev+abc", () => {
    const doc = example("app_problem");
    doc.detail.app_version = "1.2.3-dev+abc";
    return doc;
  }],
  ["client chairlift/v1", () => Object.assign(example("count"), { client: "chairlift/v1" })],
  ["bootc_version 1.2", () => {
    const doc = example("update_stage_failed");
    doc.detail.bootc_version = "1.2";
    return doc;
  }],
  ["schema frostyard.problem/2", () => Object.assign(example("count"), { schema: "frostyard.problem/2" })],
  ["an app_id off the allowlist", () => {
    const doc = example("app_problem");
    doc.detail.app_id = "org.example.Evil";
    return doc;
  }],
  ["an S8 error with no code", () => {
    const doc = example("app_problem");
    doc.detail.class = "error";
    delete doc.detail.frames;
    return doc;
  }],
  ["an S8 panic with a code", () => {
    const doc = example("app_problem");
    doc.detail.code = "resolver.lookup";
    return doc;
  }],
  ["a Go record with location", () => {
    const doc = example("app_problem");
    doc.detail.location = "src/main.rs:12";
    return doc;
  }],
  ["a Rust record with frames", () => {
    const doc = rustPanic();
    doc.detail.frames = ["main.main"];
    return doc;
  }],
  ["33 frames", () => {
    const doc = example("app_problem");
    doc.detail.frames = Array.from({ length: 33 }, () => "runtime.gopanic");
    return doc;
  }],
  ["retries 11", () => {
    const doc = example("tpm_unlock");
    doc.detail.retries = 11;
    return doc;
  }],
  ["shipped false", () => {
    const doc = example("unit_failed");
    doc.detail.shipped = false;
    return doc;
  }],
  ["an uppercase report_id", () => {
    const doc = example("count");
    doc.report_id = doc.report_id.toUpperCase();
    return doc;
  }],
];

test("rejects", async (t) => {
  for (const [name, build] of rejects) {
    await t.test(`rejects ${name}`, () => assertInvalid(build(), name));
  }
});

// ---- Registry drift -------------------------------------------------------

test("the spec registry names the MESSAGE_ID, every enum value and every app_id", () => {
  const spec = readFileSync(specPath, "utf8");
  assert.match(MESSAGE_ID, /^[0-9a-f]{32}$/);
  assert.ok(spec.includes(`\`${MESSAGE_ID}\``), "MESSAGE_ID missing from the spec");
  const missing = [];
  for (const { node, at } of walk(schema)) {
    if (!Array.isArray(node.enum)) continue;
    for (const value of node.enum) {
      if (!spec.includes(`\`${value}\``)) missing.push(`${at}: ${value}`);
    }
  }
  for (const appId of schema.$defs.app_problem.properties.app_id.enum) {
    if (!spec.includes(`\`${appId}\``)) missing.push(`app_id: ${appId}`);
  }
  assert.deepEqual(missing, []);
});
