#!/usr/bin/env node
// 1-shot move of .memory/corrections.jsonl into .memory/corrections/ (ADR-0081).
// Line N of the old file becomes <date>-legacy-<NNNN>.json; with --pr, the
// line is matched to the legacy- record that main already holds, and a line
// with no match becomes <date>-pr-<N>-<k>.json. Every output is planned and
// checked before 1 byte is written, so a failure changes nothing.
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const usage = "Usage: node scripts/migrate-corrections.mjs --root DIR [--pr N]";
const OLD = ".memory/corrections.jsonl";
const DIR = ".memory/corrections";
const NAME = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/;
const REQUIRED = ["date", "scope", "correction", "evidence", "promoted_to"];
const KEY_FIELDS = ["date", "scope", "correction", "evidence"];

let root = scriptRoot;
let pr;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--root" || arg === "--pr") {
    if (i + 1 >= args.length) {
      console.error(usage);
      process.exit(2);
    }
    const value = args[++i];
    if (!value || value.startsWith("--")) {
      console.error(usage);
      process.exit(2);
    }
    if (arg === "--root") root = resolve(value);
    if (arg === "--pr") {
      if (!/^[1-9]\d*$/.test(value)) {
        console.error(usage);
        process.exit(2);
      }
      pr = value;
    }
  } else {
    console.error(usage);
    process.exit(2);
  }
}

function compareBytes(a, b) {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function splitLines(text) {
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

// Top-level member names of a JSON object text, in order, decoded. JSON.parse
// keeps only the last of duplicate names, so duplicates are found here.
function memberNames(text) {
  const names = [];
  let depth = 0;
  let expectName = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      let j = i + 1;
      while (text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      if (depth === 1 && expectName) {
        names.push(JSON.parse(text.slice(i, j + 1)));
        expectName = false;
      }
      i = j;
    } else if (char === "{" || char === "[") {
      depth++;
      expectName = char === "{" && depth === 1;
    } else if (char === "}" || char === "]") {
      depth--;
    } else if (char === "," && depth === 1) {
      expectName = true;
    }
  }
  return names;
}

function plainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// The line rules of the old form, unchanged (ADR-0018): 1 JSON object for each
// line, exactly the 5 string fields, a real date, no empty text.
function lineProblems(text) {
  const problems = [];
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { problems: ["invalid JSON"], record: null };
  }
  if (!plainObject(value)) return { problems: ["not a plain object"], record: null };

  const names = memberNames(text);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicates.length > 0) problems.push(`duplicate key(s): ${[...new Set(duplicates)].join(", ")}`);

  const keys = Object.keys(value);
  const missing = REQUIRED.filter((key) => !Object.hasOwn(value, key));
  const unknown = keys.filter((key) => !REQUIRED.includes(key));
  if (missing.length > 0 || unknown.length > 0) {
    const parts = [];
    if (missing.length > 0) parts.push(`missing key(s): ${missing.join(", ")}`);
    if (unknown.length > 0) parts.push(`unknown key(s): ${unknown.join(", ")}`);
    problems.push(parts.join("; "));
  }

  for (const key of REQUIRED) {
    if (Object.hasOwn(value, key) && typeof value[key] !== "string") {
      problems.push(`value for ${key} is not a string`);
    }
  }

  if (typeof value.date === "string" && !validDate(value.date)) problems.push(`invalid date: ${value.date}`);
  for (const key of ["scope", "correction", "evidence"]) {
    if (typeof value[key] === "string" && value[key].trim() === "") problems.push(`${key} is empty`);
  }
  return { problems, record: value };
}

// The canonical bytes: exactly these 5 fields, in this order, 2-space indent,
// 1 final newline (ADR-0081).
function canonicalBytes(record) {
  const ordered = {};
  for (const key of REQUIRED) ordered[key] = record[key];
  return Buffer.from(`${JSON.stringify(ordered, null, 2)}\n`, "utf8");
}

function recordKey(record) {
  return JSON.stringify(KEY_FIELDS.map((field) => record[field]));
}

function stop(message) {
  console.error(message);
  console.log("FAIL corrections: 1 problem(s)");
  process.exit(1);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const oldPath = resolve(root, OLD);
if (!existsSync(oldPath)) {
  console.log("nothing to migrate");
  process.exit(0);
}

let text;
try {
  text = readFileSync(oldPath, "utf8");
} catch (error) {
  stop(`cannot read ${OLD}: ${error.code ?? error.message}`);
}

const lines = splitLines(text);
const records = [];
const problems = [];
for (let i = 0; i < lines.length; i++) {
  const number = i + 1;
  const line = lines[i];
  if (line.trim() === "") {
    problems.push(`FAIL corrections: ${OLD}:${number}: blank line`);
    continue;
  }
  const { problems: lineProblemsFound, record } = lineProblems(line);
  for (const problem of lineProblemsFound) problems.push(`FAIL corrections: ${OLD}:${number}: ${problem}`);
  records.push(record);
}
if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.log(`FAIL corrections: ${problems.length} problem(s)`);
  process.exit(1);
}

// ---- plan every output, check every destination, write nothing yet ----

const dirPath = resolve(root, DIR);
const outputs = []; // { name, bytes, action: "new" | "unchanged" | "promoted" }

function planNew(name, bytes) {
  const target = resolve(dirPath, name);
  if (existsSync(target)) {
    let existing;
    try {
      existing = readFileSync(target);
    } catch (error) {
      stop(`cannot read ${DIR}/${name}: ${error.code ?? error.message}`);
    }
    if (sha256(existing) !== sha256(bytes)) stop(`record file exists with other bytes: ${DIR}/${name}`);
    outputs.push({ name, bytes, action: "unchanged" });
    return;
  }
  outputs.push({ name, bytes, action: "new" });
}

if (pr === undefined) {
  const width = lines.length > 9999 ? 5 : 4;
  for (let i = 0; i < records.length; i++) {
    const number = i + 1;
    planNew(`${records[i].date}-legacy-${String(number).padStart(width, "0")}.json`, canonicalBytes(records[i]));
  }
} else {
  let dirStat = null;
  try {
    dirStat = lstatSync(dirPath);
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "ENOTDIR") stop(`cannot read ${DIR}: ${error.code ?? error.message}`);
  }
  if (dirStat === null || !dirStat.isDirectory()) stop(`no ${DIR}/ folder: run without --pr`);

  let names;
  try {
    names = readdirSync(dirPath);
  } catch (error) {
    stop(`cannot read ${DIR}: ${error.code ?? error.message}`);
  }
  // A record that came from the old file has a slug that starts with
  // "legacy-". A slug such as pr-12-legacy-note is a record of a pull request
  // and is never matched.
  const legacyNames = names.filter((entry) => {
    const match = NAME.exec(entry);
    return match !== null && match[2].startsWith("legacy-");
  });
  const legacy = [];
  for (const name of legacyNames.sort(compareBytes)) {
    let bytes;
    try {
      bytes = readFileSync(resolve(dirPath, name));
    } catch (error) {
      stop(`cannot read ${DIR}/${name}: ${error.code ?? error.message}`);
    }
    let record;
    try {
      record = JSON.parse(bytes.toString("utf8"));
    } catch {
      stop(`${DIR}/${name} is not a record: invalid JSON`);
    }
    if (!plainObject(record) || !KEY_FIELDS.every((field) => typeof record[field] === "string")) {
      stop(`${DIR}/${name} is not a record`);
    }
    legacy.push({ name, record, promoted: typeof record.promoted_to === "string" ? record.promoted_to : "" });
  }

  // The k-th line with a key matches the k-th legacy- record (by file name)
  // with the same key.
  const filesByKey = new Map();
  for (const file of legacy) {
    const key = recordKey(file.record);
    if (!filesByKey.has(key)) filesByKey.set(key, []);
    filesByKey.get(key).push(file);
  }
  const linesByKey = new Map();
  for (const [index, record] of records.entries()) {
    const key = recordKey(record);
    if (!linesByKey.has(key)) linesByKey.set(key, []);
    linesByKey.get(key).push(index);
  }
  const match = new Map();
  for (const [key, indexes] of linesByKey) {
    const files = filesByKey.get(key) ?? [];
    for (let i = 0; i < Math.min(indexes.length, files.length); i++) match.set(indexes[i], files[i]);
  }

  let unmatched = 0;
  for (const [index, record] of records.entries()) {
    const file = match.get(index);
    if (file === undefined) {
      unmatched++;
      planNew(`${record.date}-pr-${pr}-${unmatched}.json`, canonicalBytes(record));
      continue;
    }
    if (record.promoted_to === file.promoted) {
      outputs.push({ name: file.name, bytes: null, action: "unchanged" });
      continue;
    }
    if (record.promoted_to !== "" && file.promoted === "") {
      outputs.push({ name: file.name, bytes: canonicalBytes(record), action: "promoted" });
      continue;
    }
    if (record.promoted_to === "" && file.promoted !== "") {
      outputs.push({ name: file.name, bytes: null, action: "unchanged" });
      continue;
    }
    stop(`2 promotions of 1 record: ${DIR}/${file.name} and line ${index + 1} of ${OLD}`);
  }
}

// ---- write, then delete the old file ----

try {
  mkdirSync(dirPath, { recursive: true });
} catch (error) {
  stop(`cannot create ${DIR}: ${error.code ?? error.message}`);
}

for (const output of outputs) {
  if (output.bytes === null) continue;
  const target = resolve(dirPath, output.name);
  const temp = resolve(root, ".memory", `.migrate-${output.name}.tmp`);
  try {
    writeFileSync(temp, output.bytes);
    renameSync(temp, target);
  } catch (error) {
    // Never remove a file this run already wrote: a promoted output replaces
    // a record that main already holds, and a record is never removed. A
    // rerun after the stop is the recovery: it writes the same bytes.
    rmSync(temp, { force: true });
    stop(`cannot write ${DIR}/${output.name}: ${error.code ?? error.message}`);
  }
}

try {
  const recordsInFolder = readdirSync(dirPath).filter((name) => name.endsWith(".json"));
  if (recordsInFolder.length === 0 && !existsSync(resolve(dirPath, ".gitkeep"))) {
    writeFileSync(resolve(dirPath, ".gitkeep"), "");
  }
} catch (error) {
  stop(`cannot read ${DIR}: ${error.code ?? error.message}`);
}

try {
  rmSync(oldPath);
} catch (error) {
  stop(`cannot remove ${OLD}: ${error.code ?? error.message}`);
}

const count = (action) => outputs.filter((output) => output.action === action).length;
console.log(`migrated ${records.length} records (${count("new")} new files, ${count("unchanged")} unchanged, ${count("promoted")} promoted)`);
