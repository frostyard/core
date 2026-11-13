#!/usr/bin/env node
// Write 1 correction record as 1 file in .memory/corrections/ (ADR-0081): the
// canonical bytes, under the name <date>-<slug>.json, never over an existing
// record. A repository that still has .memory/corrections.jsonl gets a line
// there instead, so this helper refuses it.
import { existsSync, lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const usage = "Usage: node scripts/new-correction.mjs --root DIR --date YYYY-MM-DD --slug SLUG --scope S --correction C --evidence E [--promoted-to PATH]";
const OLD = ".memory/corrections.jsonl";
const DIR = ".memory/corrections";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MAX = 60;

const options = { scope: null, correction: null, evidence: null, "promoted-to": null };
let root = scriptRoot;
let date;
let slug;
const args = process.argv.slice(2);

function usageError() {
  console.error(usage);
  process.exit(2);
}

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (!["--root", "--date", "--slug", "--scope", "--correction", "--evidence", "--promoted-to"].includes(arg)) usageError();
  if (i + 1 >= args.length) usageError();
  const value = args[++i];
  // A text option may start with "--" (a quoted value); a path or a name may
  // not, and --root is never empty.
  if (arg === "--root" && (!value || value.startsWith("--"))) usageError();
  if ((arg === "--date" || arg === "--slug") && value.startsWith("--")) usageError();
  if (arg === "--root") root = resolve(value);
  if (arg === "--date") date = value;
  if (arg === "--slug") slug = value;
  if (arg !== "--root" && arg !== "--date" && arg !== "--slug") options[arg.slice(2)] = value;
}

if (date === undefined || slug === undefined) usageError();
for (const key of ["scope", "correction", "evidence"]) if (options[key] === null) usageError();

function fail(message) {
  console.error(`FAIL corrections: ${message}`);
  process.exit(1);
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const expected = new Date(Date.UTC(year, month - 1, day));
  return expected.getUTCFullYear() === year && expected.getUTCMonth() === month - 1 && expected.getUTCDate() === day;
}

if (!validDate(date)) fail(`invalid --date: ${date} (want a real YYYY-MM-DD date)`);
if (!SLUG.test(slug)) fail(`invalid --slug: ${slug} (want lowercase words joined by -)`);
if (slug.length > SLUG_MAX) fail(`invalid --slug: ${slug} is longer than ${SLUG_MAX} characters`);
if (slug.startsWith("legacy-")) fail(`invalid --slug: ${slug} (legacy- is reserved for the move from ${OLD})`);
for (const key of ["scope", "correction", "evidence"]) {
  if (options[key].trim() === "") fail(`--${key} is empty`);
}

if (existsSync(resolve(root, OLD))) fail(`this repository still has ${OLD}: add 1 line there`);

const record = {
  date,
  scope: options.scope,
  correction: options.correction,
  evidence: options.evidence,
  promoted_to: options["promoted-to"] ?? "",
};
const name = `${date}-${slug}.json`;
const folder = resolve(root, DIR);

// The record lives at .memory/corrections. A symbolic link or a file at either
// path part is refused before the write, so the record never leaves its path
// unseen. The folder is created only when it does not exist.
function lstatOrNull(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    fail(`cannot read ${path}: ${error.code ?? error.message}`);
  }
}

const memory = lstatOrNull(resolve(root, ".memory"));
if (memory !== null) {
  if (memory.isSymbolicLink()) fail(".memory: symbolic link, not followed");
  if (!memory.isDirectory()) fail(".memory: not a folder");
}
const existing = lstatOrNull(folder);
if (existing !== null) {
  if (existing.isSymbolicLink()) fail(`${DIR}: symbolic link, not followed`);
  if (!existing.isDirectory()) fail(`${DIR}: not a folder`);
} else {
  try {
    mkdirSync(folder, { recursive: true });
  } catch (error) {
    fail(`cannot create ${DIR}: ${error.code ?? error.message}`);
  }
}
const target = resolve(folder, name);
try {
  writeFileSync(target, Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8"), { flag: "wx" });
} catch (error) {
  if (error.code === "EEXIST") fail(`record exists: ${DIR}/${name}`);
  fail(`cannot write ${DIR}/${name}: ${error.code ?? error.message}`);
}

console.log(`${DIR}/${name}`);
