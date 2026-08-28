// Credential-free coverage for the secret-expiry guard (ADR-0045). Every case
// injects a reference date; nothing here reads or needs a real secret.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  MINIMUM_WARN_DAYS,
  SecretExpiryError,
  evaluate,
  loadRecord,
  parseRecord,
  todayUtc,
} from "../scripts/lib/secret-expiry.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const guard = path.join(repoRoot, "scripts/check-secret-expiry.mjs");
const DAY_MS = 86_400_000;

const record = loadRecord(repoRoot);
const orgPat = record.secrets.find((secret) => secret.name === "ORG_PAT");

/** Shift a `YYYY-MM-DD` day by whole days, staying in UTC. */
function shiftDay(day, days) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date) + days * DAY_MS).toISOString().slice(0, 10);
}

function runGuard(today, env = {}) {
  return execFileAsync(process.execPath, [guard], {
    cwd: repoRoot,
    env: { ...process.env, SECRET_EXPIRY_TODAY: today, ...env },
  });
}

test("the committed record pins the documented ORG_PAT expiry and a lead time of at least 30 days", () => {
  assert.ok(orgPat, "the record must carry an ORG_PAT entry");
  assert.equal(orgPat.expires_on, "2027-08-11");
  assert.ok(
    orgPat.warn_days_before >= MINIMUM_WARN_DAYS,
    `warn_days_before must be >= ${MINIMUM_WARN_DAYS}, got ${orgPat.warn_days_before}`,
  );
  assert.equal(record.never_relax, true);
  assert.ok(orgPat.used_by.includes(".github/workflows/sync-skills.yml"));
});

test("the guard passes on the day before the rotation window opens", async () => {
  const dayBeforeWindow = shiftDay(orgPat.expires_on, -(orgPat.warn_days_before + 1));
  const { stdout } = await runGuard(dayBeforeWindow);
  assert.match(stdout, /ok {3}ORG_PAT expires on 2027-08-11/);
  assert.match(stdout, /ok {3}secret_expiry: 1\/1 outside their rotation window/);
});

test("the guard fails on the first day inside the rotation window", async () => {
  const windowOpens = shiftDay(orgPat.expires_on, -orgPat.warn_days_before);
  await assert.rejects(runGuard(windowOpens), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /FAIL ORG_PAT expires on 2027-08-11/);
    assert.match(error.stderr, /inside its \d+-day rotation window/);
    assert.match(error.stderr, /docs\/design\/skills-sync-operations\.md/);
    return true;
  });
});

test("the guard fails the day after expiry", async () => {
  const afterExpiry = shiftDay(orgPat.expires_on, 1);
  await assert.rejects(runGuard(afterExpiry), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /FAIL ORG_PAT expired on 2027-08-11 \(1 day\(s\) ago\)/);
    return true;
  });
});

test("the guard passes well before the rotation window", async () => {
  const { stdout } = await runGuard("2026-01-01");
  assert.match(stdout, /ok {3}secret_expiry: 1\/1/);
});

test("the guard never echoes secret material present in the environment", async () => {
  const canary = "totally-not-a-real-token-3f9c2a";
  const afterExpiry = shiftDay(orgPat.expires_on, 1);
  await assert.rejects(runGuard(afterExpiry, { ORG_PAT: canary, GH_TOKEN: canary }), (error) => {
    assert.ok(!`${error.stdout}${error.stderr}`.includes(canary));
    return true;
  });
  const { stdout, stderr } = await runGuard("2026-01-01", { ORG_PAT: canary, GH_TOKEN: canary });
  assert.ok(!`${stdout}${stderr}`.includes(canary));
});

test("evaluate classifies the window boundaries exactly", () => {
  const fixture = {
    schema_version: 1,
    never_relax: true,
    description: "fixture",
    secrets: [
      {
        name: "FIXTURE_PAT",
        kind: "github-fine-grained-pat",
        purpose: "fixture",
        expires_on: "2027-08-11",
        warn_days_before: 30,
        owner: "fixture",
        used_by: [".github/workflows/sync-skills.yml"],
        rotation_runbook: "docs/design/skills-sync-operations.md",
      },
    ],
  };
  const stateOn = (day) => evaluate(fixture, day).findings[0].state;
  assert.equal(stateOn("2027-07-11"), "ok"); // 31 days out
  assert.equal(stateOn("2027-07-12"), "expiring"); // exactly 30 days out
  assert.equal(stateOn("2027-08-11"), "expiring"); // expiry day itself
  assert.equal(stateOn("2027-08-12"), "expired");
  assert.equal(evaluate(fixture, "2027-07-11").ok, true);
  assert.equal(evaluate(fixture, "2027-07-12").ok, false);
});

test("the schema rejects a lead time shorter than the floor", () => {
  const invalid = structuredClone(record);
  invalid.secrets[0].warn_days_before = MINIMUM_WARN_DAYS - 1;
  assert.throws(() => parseRecord(invalid), (error) => {
    assert.ok(error instanceof SecretExpiryError);
    assert.ok(error.details.some((detail) => detail.includes("warn_days_before must be an integer")));
    return true;
  });
});

test("the schema rejects a relaxed never_relax guardrail", () => {
  const invalid = structuredClone(record);
  invalid.never_relax = false;
  assert.throws(() => parseRecord(invalid), (error) =>
    error.details.some((detail) => detail.includes("never_relax must be true")),
  );
});

test("the closed schema rejects any field that could hold secret material", () => {
  const invalid = structuredClone(record);
  invalid.secrets[0].value = "a-token";
  assert.throws(() => parseRecord(invalid), (error) =>
    error.details.some((detail) => detail === "secrets[0]: unknown field: value"),
  );
});

test("the schema rejects an impossible expiry date", () => {
  const invalid = structuredClone(record);
  invalid.secrets[0].expires_on = "2027-02-30";
  assert.throws(() => parseRecord(invalid), (error) =>
    error.details.some((detail) => detail.includes("is not a real calendar date")),
  );
});

test("todayUtc yields a calendar day the guard accepts", () => {
  assert.match(todayUtc(new Date("2026-08-27T23:59:59Z")), /^2026-08-27$/);
  assert.equal(typeof evaluate(record, todayUtc()).ok, "boolean");
});
