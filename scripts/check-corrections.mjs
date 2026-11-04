#!/usr/bin/env node
// Append-only JSONL gate for .memory/corrections.jsonl (ADR-0018).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const scriptRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");
const usage = "Usage: node scripts/check-corrections.mjs [--root DIR] [--file PATH] [--base REF]";

let root = scriptRoot;
let file = ".memory/corrections.jsonl";
let base;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--root" || arg === "--file" || arg === "--base") {
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
    if (arg === "--file") file = value;
    if (arg === "--base") base = value;
  } else {
    console.error(usage);
    process.exit(2);
  }
}

const absoluteFile = resolve(root, file);
const failures = [];

function addFailure(line, message) {
  failures.push(line ? `${file}:${line}: ${message}` : `${file}: ${message}`);
}

function splitLines(text) {
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function plainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function parseObject(text) {
  try {
    const value = JSON.parse(text);
    return plainObject(value) ? value : null;
  } catch {
    return null;
  }
}

if (!existsSync(absoluteFile)) {
  // A file that the base has and the head lost is a removal, not "no file".
  if (base !== undefined) {
    let onBase = false;
    try {
      execFileSync("git", ["-C", root, "cat-file", "-e", `${base}:${file}`], { stdio: "pipe" });
      onBase = true;
    } catch {
      onBase = false;
    }
    if (onBase) {
      console.error(`FAIL corrections: ${file}: file removed (it exists at ${base})`);
      console.log("FAIL corrections: 1 problem(s)");
      process.exit(1);
    }
  }
  console.log("ok   corrections: no file");
  process.exit(0);
}

const text = readFileSync(absoluteFile, "utf8");
const lines = splitLines(text);
const required = ["date", "scope", "correction", "evidence", "promoted_to"];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const number = i + 1;
  if (line.trim() === "") {
    addFailure(number, "blank line");
    continue;
  }

  let value;
  try {
    value = JSON.parse(line);
  } catch {
    addFailure(number, "invalid JSON");
    continue;
  }

  if (!plainObject(value)) {
    addFailure(number, "not a plain object");
    continue;
  }

  const keys = Object.keys(value);
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  const unknown = keys.filter((key) => !required.includes(key));
  if (missing.length > 0 || unknown.length > 0) {
    const parts = [];
    if (missing.length > 0) parts.push(`missing key(s): ${missing.join(", ")}`);
    if (unknown.length > 0) parts.push(`unknown key(s): ${unknown.join(", ")}`);
    addFailure(number, parts.join("; "));
  }

  for (const key of required) {
    if (Object.hasOwn(value, key) && typeof value[key] !== "string") {
      addFailure(number, `value for ${key} is not a string`);
    }
  }

  if (typeof value.date === "string") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value.date)) {
      addFailure(number, `invalid date: ${value.date}`);
    } else {
      const [year, month, day] = value.date.split("-").map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        addFailure(number, `invalid date: ${value.date}`);
      }
    }
  }

  for (const key of ["scope", "correction", "evidence"]) {
    if (typeof value[key] === "string" && value[key].trim() === "") {
      addFailure(number, `${key} is empty`);
    }
  }
}

if (base !== undefined) {
  try {
    execFileSync("git", ["-C", root, "rev-parse", "--verify", `${base}^{commit}`], { stdio: "pipe" });
  } catch {
    addFailure(null, `base ref ${base} does not exist`);
  }

  let baseText;
  if (failures.every((failure) => !failure.includes(`base ref ${base} does not exist`))) {
    try {
      baseText = execFileSync("git", ["-C", root, "show", `${base}:${file}`], { encoding: "utf8", stdio: "pipe" });
    } catch {
      baseText = null;
    }

    if (baseText !== null) {
      const baseLines = splitLines(baseText);
      for (let i = 0; i < baseLines.length; i++) {
        const number = i + 1;
        if (i >= lines.length) {
          addFailure(number, "line removed");
          continue;
        }
        if (lines[i] === baseLines[i]) continue;

        const baseObject = parseObject(baseLines[i]);
        const currentObject = parseObject(lines[i]);
        const promotable = baseObject !== null && currentObject !== null
          && baseObject.date === currentObject.date
          && baseObject.scope === currentObject.scope
          && baseObject.correction === currentObject.correction
          && baseObject.evidence === currentObject.evidence
          && baseObject.promoted_to === ""
          && typeof currentObject.promoted_to === "string"
          && currentObject.promoted_to !== "";

        if (!promotable) {
          addFailure(number, "line changed (only an empty promoted_to may be filled)");
        }
      }
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL corrections: ${failure}`);
  console.log(`FAIL corrections: ${failures.length} problem(s)`);
  process.exit(1);
}

console.log(`ok   corrections: ${lines.length} lines${base !== undefined ? `, append-only vs ${base}` : ""}`);
