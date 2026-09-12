#!/usr/bin/env node
// Read-only stable repository drift alarm. The committed record pins the
// public key, signer, metadata bytes, Release identity, indexes, and pool.
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  StableRepositoryError,
  loadRecord,
  verifyStableRepository,
} from "./lib/stable-repository.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  const report = await verifyStableRepository(await loadRecord(repoRoot));
  console.log(JSON.stringify({ status: "ok", ...report }));
} catch (error) {
  if (error instanceof StableRepositoryError) {
    console.error(`FAIL stable_repository: ${error.message}`);
    for (const detail of error.details) console.error(`  - ${detail}`);
    process.exit(1);
  }
  throw error;
}
