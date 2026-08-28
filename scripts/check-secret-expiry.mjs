#!/usr/bin/env node
// Secret-expiry gate (ADR-0045): fail before a documented Actions secret
// lapses. Reads only `.github/secrets-expiry.json` and a reference date; it
// never reads, resolves, or prints the secret itself. Run on a schedule by
// .github/workflows/secrets-expiry.yml, not by the pull-request gate — an
// approaching rotation is an operations task, not a reason to block merges.
//
// Override the reference day with SECRET_EXPIRY_TODAY=YYYY-MM-DD (tests only).
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SecretExpiryError, evaluate, loadRecord, todayUtc } from "./lib/secret-expiry.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  const record = loadRecord(repoRoot);
  const today = process.env.SECRET_EXPIRY_TODAY?.trim() || todayUtc();
  const report = evaluate(record, today);

  for (const finding of report.findings) {
    const line = `${finding.state === "ok" ? "ok  " : "FAIL"} ${finding.message}`;
    if (finding.state === "ok") console.log(line);
    else console.error(line);
  }

  const failing = report.findings.filter((finding) => finding.state !== "ok").length;
  console.log(
    `${report.ok ? "ok  " : "FAIL"} secret_expiry: ` +
      `${report.findings.length - failing}/${report.findings.length} outside their rotation window ` +
      `(as of ${report.today})`,
  );
  process.exit(report.ok ? 0 : 1);
} catch (error) {
  if (error instanceof SecretExpiryError) {
    console.error(`FAIL ${error.message}`);
    for (const detail of error.details) console.error(`  - ${detail}`);
    process.exit(1);
  }
  throw error;
}
