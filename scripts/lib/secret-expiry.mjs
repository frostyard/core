// Secret-expiry guard (ADR-0045). Reads `.github/secrets-expiry.json` — a
// credential-free record of *when* each Actions secret expires — and reports
// which entries have entered their rotation window or lapsed.
//
// This module never reads, resolves, fingerprints, or prints secret material:
// the record schema is closed and has no field that can hold a token value, and
// nothing here touches `process.env`. The only inputs are the committed record
// and a reference date.
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Path of the canonical record, relative to the repository root. */
export const RECORD_PATH = ".github/secrets-expiry.json";

/**
 * Floor on `warn_days_before`. ADR-0019's `never_relax` guardrail applies: a
 * record may lengthen its lead time, never shorten it below this.
 */
export const MINIMUM_WARN_DAYS = 30;

const REQUIRED_SECRET_KEYS = [
  "name",
  "kind",
  "purpose",
  "expires_on",
  "warn_days_before",
  "owner",
  "used_by",
  "rotation_runbook",
];
const REQUIRED_RECORD_KEYS = ["schema_version", "never_relax", "description", "secrets"];
const DAY_MS = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/** A record that does not satisfy the closed schema. */
export class SecretExpiryError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "SecretExpiryError";
    this.details = details;
  }
}

/**
 * Parse a UTC calendar day. Returns epoch milliseconds at 00:00:00Z.
 * Rejects anything that is not a real `YYYY-MM-DD` day.
 */
export function parseDay(value, label) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw new SecretExpiryError(`${label} must be a YYYY-MM-DD date, got ${JSON.stringify(value)}`);
  }
  const [year, month, day] = value.split("-").map(Number);
  const ms = Date.UTC(year, month - 1, day);
  const round = new Date(ms);
  if (
    round.getUTCFullYear() !== year ||
    round.getUTCMonth() !== month - 1 ||
    round.getUTCDate() !== day
  ) {
    throw new SecretExpiryError(`${label} is not a real calendar date: ${value}`);
  }
  return ms;
}

/** Today as a `YYYY-MM-DD` UTC day string. */
export function todayUtc(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * Validate the record strictly. Unknown keys are rejected, so a field holding
 * secret material cannot be smuggled into the file without failing the gate.
 */
export function parseRecord(value) {
  const details = [];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new SecretExpiryError(`${RECORD_PATH} must be a JSON object`);
  }
  for (const key of Object.keys(value)) {
    if (!REQUIRED_RECORD_KEYS.includes(key)) details.push(`unknown record field: ${key}`);
  }
  for (const key of REQUIRED_RECORD_KEYS) {
    if (!(key in value)) details.push(`missing record field: ${key}`);
  }
  if ("schema_version" in value && value.schema_version !== 1) {
    details.push(`unsupported schema_version: ${JSON.stringify(value.schema_version)}`);
  }
  if ("never_relax" in value && value.never_relax !== true) {
    details.push("never_relax must be true (ADR-0019: the guard may tighten, never loosen)");
  }
  if ("description" in value && (typeof value.description !== "string" || !value.description.trim())) {
    details.push("description must be a non-empty string");
  }
  if (!Array.isArray(value.secrets) || value.secrets.length === 0) {
    details.push("secrets must be a non-empty array");
    throw new SecretExpiryError(`${RECORD_PATH} is invalid`, details);
  }

  const seen = new Set();
  value.secrets.forEach((entry, index) => {
    const at = `secrets[${index}]`;
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      details.push(`${at} must be an object`);
      return;
    }
    for (const key of Object.keys(entry)) {
      if (!REQUIRED_SECRET_KEYS.includes(key)) details.push(`${at}: unknown field: ${key}`);
    }
    for (const key of REQUIRED_SECRET_KEYS) {
      if (!(key in entry)) details.push(`${at}: missing field: ${key}`);
    }
    if (typeof entry.name !== "string" || !SECRET_NAME_PATTERN.test(entry.name)) {
      details.push(`${at}: name must be an uppercase Actions secret name`);
    } else if (seen.has(entry.name)) {
      details.push(`${at}: duplicate secret name: ${entry.name}`);
    } else {
      seen.add(entry.name);
    }
    for (const key of ["kind", "purpose", "owner", "rotation_runbook"]) {
      if (typeof entry[key] !== "string" || !entry[key].trim()) {
        details.push(`${at}: ${key} must be a non-empty string`);
      }
    }
    if (
      !Array.isArray(entry.used_by) ||
      entry.used_by.length === 0 ||
      entry.used_by.some((path) => typeof path !== "string" || !path.trim())
    ) {
      details.push(`${at}: used_by must be a non-empty array of repository paths`);
    }
    try {
      parseDay(entry.expires_on, `${at}: expires_on`);
    } catch (error) {
      details.push(error.message);
    }
    if (!Number.isInteger(entry.warn_days_before) || entry.warn_days_before < MINIMUM_WARN_DAYS) {
      details.push(
        `${at}: warn_days_before must be an integer of at least ${MINIMUM_WARN_DAYS}, got ` +
          `${JSON.stringify(entry.warn_days_before)}`,
      );
    }
  });

  if (details.length > 0) throw new SecretExpiryError(`${RECORD_PATH} is invalid`, details);
  return value;
}

/** Read and validate the committed record from a repository root. */
export function loadRecord(repoRoot) {
  const path = join(repoRoot, RECORD_PATH);
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new SecretExpiryError(`${RECORD_PATH} could not be read: ${error.code ?? error.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new SecretExpiryError(`${RECORD_PATH} is not valid JSON: ${error.message}`);
  }
  return parseRecord(parsed);
}

/**
 * Evaluate a validated record against a `YYYY-MM-DD` reference day.
 *
 * State per secret:
 * - `expired`  — the expiry day has passed;
 * - `expiring` — `days_remaining <= warn_days_before` (the rotation window);
 * - `ok`       — outside the window.
 *
 * `ok: true` only when every secret is `ok`.
 */
export function evaluate(record, today) {
  const reference = parseDay(today, "reference date");
  const findings = record.secrets.map((secret) => {
    const daysRemaining = Math.round((parseDay(secret.expires_on, "expires_on") - reference) / DAY_MS);
    const state =
      daysRemaining < 0 ? "expired" : daysRemaining <= secret.warn_days_before ? "expiring" : "ok";
    return {
      name: secret.name,
      state,
      daysRemaining,
      expiresOn: secret.expires_on,
      warnDaysBefore: secret.warn_days_before,
      owner: secret.owner,
      rotationRunbook: secret.rotation_runbook,
      message: describe(secret, state, daysRemaining),
    };
  });
  return { ok: findings.every((finding) => finding.state === "ok"), today, findings };
}

function describe(secret, state, daysRemaining) {
  const rotate = `rotate it and update ${RECORD_PATH}; runbook: ${secret.rotation_runbook}`;
  if (state === "expired") {
    return (
      `${secret.name} expired on ${secret.expires_on} ` +
      `(${Math.abs(daysRemaining)} day(s) ago) — ${rotate}`
    );
  }
  if (state === "expiring") {
    return (
      `${secret.name} expires on ${secret.expires_on} in ${daysRemaining} day(s), ` +
      `inside its ${secret.warn_days_before}-day rotation window — ${rotate}`
    );
  }
  return (
    `${secret.name} expires on ${secret.expires_on} in ${daysRemaining} day(s); ` +
    `warns at ${secret.warn_days_before} day(s)`
  );
}
