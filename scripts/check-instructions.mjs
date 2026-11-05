#!/usr/bin/env node
// Instruction-hygiene gate: dead references, retired names, duplicate prose,
// file budgets, and size growth across agent instruction Markdown files.
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  countLines,
  countWords,
  extractInlineCodeSpans,
  extractProseSentences,
  findRetiredOccurrences,
  isBarePathShaped,
  isPathCandidate,
  normalizePathSpan,
} from "./lib/instruction-hygiene.mjs";

class UsageError extends Error {}

function usage(message) {
  if (message) console.error(`usage error: ${message}`);
  console.error("Usage: node scripts/check-instructions.mjs [options] PATH...");
  console.error("Options:");
  console.error("  --root DIR             root for relative paths (default: current directory)");
  console.error("  --home DIR             value of ~ (default: os.homedir())");
  console.error("  --retired NAME         retired name; repeatable");
  console.error("  --retired-file FILE    file containing one retired name per line");
  console.error("  --ignore-ref SPAN      backticked reference not to check (exact); repeatable");
  console.error("  --ignore-ref-file FILE file containing one ignored reference per line");
  console.error("  --budget FILE          JSON size budget");
  console.error("  --base REF             compare line and word growth since REF");
  console.error("  --min-words N          minimum words in a duplicate sentence (default: 8)");
  console.error("  --help                 print this usage");
}

function parsePositiveInteger(value, label) {
  if (!/^\d+$/.test(value)) throw new UsageError(`${label} must be a positive integer`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new UsageError(`${label} must be a positive integer`);
  }
  return number;
}

function parseArgs(argv) {
  const options = {
    root: path.resolve(process.cwd()),
    home: os.homedir(),
    retired: [],
    retiredFiles: [],
    ignoreRefs: [],
    ignoreRefFiles: [],
    budget: null,
    base: null,
    minWords: 8,
    help: false,
    inputs: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") {
      options.help = true;
    } else if (arg === "--root" || arg === "--home" || arg === "--retired-file" || arg === "--ignore-ref-file" || arg === "--budget" || arg === "--base" || arg === "--min-words") {
      if (index + 1 >= argv.length) throw new UsageError(`missing value for ${arg}`);
      const value = argv[index + 1];
      if (value.startsWith("--")) throw new UsageError(`missing value for ${arg}`);
      index += 1;
      if (arg === "--root") options.root = path.resolve(value);
      if (arg === "--home") options.home = path.resolve(value);
      if (arg === "--retired-file") options.retiredFiles.push(value);
      if (arg === "--ignore-ref-file") options.ignoreRefFiles.push(value);
      if (arg === "--budget") options.budget = value;
      if (arg === "--base") options.base = value;
      if (arg === "--min-words") options.minWords = parsePositiveInteger(value, "--min-words");
    } else if (arg === "--retired" || arg === "--ignore-ref") {
      if (index + 1 >= argv.length) throw new UsageError(`missing value for ${arg}`);
      const value = argv[index + 1];
      if (value.startsWith("--")) throw new UsageError(`missing value for ${arg}`);
      index += 1;
      if (!value) throw new UsageError(`${arg} requires a value`);
      if (arg === "--retired") options.retired.push(value);
      else options.ignoreRefs.push(normalizePathSpan(value));
    } else if (arg.startsWith("-")) {
      throw new UsageError(`unknown option: ${arg}`);
    } else {
      options.inputs.push(arg);
    }
  }
  return options;
}

function displayPath(file, root) {
  const relative = path.relative(root, file);
  if (
    relative &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  ) {
    return relative.split(path.sep).join("/");
  }
  return file.split(path.sep).join("/");
}

function collectMarkdownFiles(inputs, root) {
  const files = new Set();

  function walk(directory) {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      throw new UsageError(`cannot read input directory: ${directory}`);
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      if (entry.isSymbolicLink()) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) files.add(path.resolve(full));
    }
  }

  for (const input of inputs) {
    const resolved = path.resolve(input);
    if (!existsSync(resolved)) throw new UsageError(`input path does not exist: ${input}`);
    const stat = lstatSync(resolved);
    if (stat.isDirectory()) {
      walk(resolved);
    } else if (stat.isFile() && resolved.endsWith(".md")) {
      files.add(resolved);
    } else {
      throw new UsageError(`input path is not a Markdown file or folder: ${input}`);
    }
  }

  return [...files].sort((left, right) => displayPath(left, root).localeCompare(displayPath(right, root)));
}

// Reads names from the command line and from list files (one per line, `#`
// starts a comment line).
function loadNameList(names, files, label, normalize = (name) => name) {
  const all = [...names];
  for (const file of files) {
    let text;
    try {
      text = readFileSync(path.resolve(file), "utf8");
    } catch (error) {
      throw new UsageError(`cannot read ${label} ${file}: ${error.message}`);
    }
    for (const line of text.split(/\r?\n/u)) {
      const name = line.trim();
      if (name && !name.startsWith("#")) all.push(normalize(name));
    }
  }
  return [...new Set(all)].sort((left, right) => left.localeCompare(right));
}

function parseBudget(rawPath, root) {
  let text;
  const budgetPath = path.resolve(rawPath);
  try {
    text = readFileSync(budgetPath, "utf8");
  } catch (error) {
    throw new UsageError(`cannot read budget file ${rawPath}: ${error.message}`);
  }

  let budget;
  try {
    budget = JSON.parse(text);
  } catch (error) {
    throw new UsageError(`bad budget JSON ${rawPath}: ${error.message}`);
  }

  if (!budget || typeof budget !== "object" || Array.isArray(budget)) {
    throw new UsageError("budget must be a JSON object");
  }
  const topUnknown = Object.keys(budget).filter((key) => key !== "schema_version" && key !== "files");
  if (topUnknown.length) throw new UsageError(`budget unknown key: ${topUnknown[0]}`);
  if (budget.schema_version !== 1) throw new UsageError("budget schema_version must be 1");
  if (!Array.isArray(budget.files)) throw new UsageError("budget files must be an array");

  const entries = new Map();
  for (let index = 0; index < budget.files.length; index += 1) {
    const entry = budget.files[index];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new UsageError(`budget files[${index}] must be an object`);
    }
    const unknown = Object.keys(entry).filter((key) => key !== "path" && key !== "max_lines" && key !== "max_words");
    if (unknown.length) throw new UsageError(`budget files[${index}]: unknown key: ${unknown[0]}`);
    if (typeof entry.path !== "string" || entry.path === "") {
      throw new UsageError(`budget files[${index}].path must be a relative string`);
    }
    if (path.isAbsolute(entry.path) || entry.path === ".." || entry.path.startsWith(`..${path.sep}`)) {
      throw new UsageError(`budget files[${index}].path must be relative to --root`);
    }

    const limits = {};
    for (const field of ["max_lines", "max_words"]) {
      if (Object.hasOwn(entry, field)) {
        if (!Number.isSafeInteger(entry[field]) || entry[field] < 1) {
          throw new UsageError(`budget files[${index}].${field} must be a positive integer`);
        }
        limits[field] = entry[field];
      }
    }
    if (!limits.max_lines && !limits.max_words) {
      throw new UsageError(`budget files[${index}] must set max_lines or max_words`);
    }
    entries.set(path.resolve(root, entry.path), limits);
  }
  return entries;
}

function gitTop(file) {
  try {
    return path.resolve(execFileSync("git", ["-C", path.dirname(file), "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim());
  } catch {
    return null;
  }
}

function verifyRef(top, ref) {
  try {
    execFileSync("git", ["-C", top, "rev-parse", "--verify", `${ref}^{commit}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

function gitFileAtRef(top, ref, file) {
  const relative = path.relative(top, file).split(path.sep).join("/");
  try {
    return execFileSync("git", ["-C", top, "show", `${ref}:${relative}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function signed(number) {
  return number >= 0 ? `+${number}` : String(number);
}

function existsCandidate(resolved) {
  try {
    return existsSync(resolved);
  } catch {
    return false;
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    process.exit(0);
  }
  if (options.inputs.length === 0) throw new UsageError("missing input path");

  const files = collectMarkdownFiles(options.inputs, options.root);
  const retired = loadNameList(options.retired, options.retiredFiles, "retired-file");
  const ignoredRefs = new Set(loadNameList(options.ignoreRefs, options.ignoreRefFiles, "ignore-ref-file", normalizePathSpan));
  const budget = options.budget ? parseBudget(options.budget, options.root) : null;

  const records = [];
  let errors = 0;
  let warnings = 0;

  function addRecord(severity, file, line, text) {
    records.push({ severity, file, line: line ?? 0, text });
    if (severity === "error") errors += 1;
    if (severity === "warning") warnings += 1;
  }

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const display = displayPath(file, options.root);

    for (const { span, line } of extractInlineCodeSpans(text)) {
      if (!isPathCandidate(span)) continue;
      const candidate = normalizePathSpan(span);
      if (ignoredRefs.has(candidate)) continue;
      // A span with no slash is checked only when it is a file name
      // (`AGENTS.md`); plain words, commands and identifiers stay out.
      if (!candidate.includes("/") && !isBarePathShaped(candidate)) continue;
      const fileDir = path.dirname(file);
      // The places the reference may resolve to; any one is enough.
      let targets;
      if (candidate.startsWith("~/")) {
        targets = [path.resolve(options.home, candidate.slice(2))];
      } else if (candidate.startsWith("/var/home/")) {
        targets = [path.resolve(candidate)];
      } else if (candidate.startsWith("./") || candidate.startsWith("../")) {
        targets = [path.resolve(fileDir, candidate)];
      } else if (candidate.startsWith("/")) {
        continue; // other absolute paths and slash commands are not checked
      } else {
        // A bare relative span is a path when its first segment exists, or
        // when it is path-shaped (a file extension or a known top-level
        // folder); this skips `owner/name` and other slash-separated words.
        const first = candidate.split("/")[0];
        const firstExists =
          existsCandidate(path.resolve(options.root, first)) || existsCandidate(path.resolve(fileDir, first));
        if (!firstExists && !isBarePathShaped(candidate)) continue;
        targets = [path.resolve(options.root, candidate), path.resolve(fileDir, candidate)];
      }
      if (!targets.some(existsCandidate)) {
        addRecord("error", display, line, `FAIL dead_reference: ${display}:${line}: \`${span}\` does not exist`);
      }
    }

    for (const retiredName of retired) {
      for (const occurrence of findRetiredOccurrences(text, retiredName)) {
        addRecord("error", display, occurrence.line, `FAIL retired_name: ${display}:${occurrence.line}: ${retiredName}`);
      }
    }

    const lines = countLines(text);
    const words = countWords(text);
    addRecord("info", display, null, `info size: ${display}: ${lines} lines, ${words} words`);

    const limits = budget?.get(path.resolve(file));
    if (limits?.max_lines && lines > limits.max_lines) {
      addRecord("warning", display, null, `WARN size_budget: ${display}: ${lines} lines > max_lines ${limits.max_lines}`);
    }
    if (limits?.max_words && words > limits.max_words) {
      addRecord("warning", display, null, `WARN size_budget: ${display}: ${words} words > max_words ${limits.max_words}`);
    }

    if (options.base) {
      const top = gitTop(file);
      if (top) {
        if (!verifyRef(top, options.base)) throw new UsageError(`bad git ref: ${options.base}`);
        const oldText = gitFileAtRef(top, options.base, file);
        if (oldText === null) {
          addRecord("info", display, null, `info growth: ${display}: new since ${options.base}`);
        } else {
          const oldLines = countLines(oldText);
          const oldWords = countWords(oldText);
          const lineGrowth = lines - oldLines;
          const wordGrowth = words - oldWords;
          addRecord("info", display, null, `info growth: ${display}: ${signed(lineGrowth)} lines, ${signed(wordGrowth)} words since ${options.base}`);
          if (lineGrowth > 0 || wordGrowth > 0) {
            addRecord("warning", display, null, `WARN size_growth: ${display}: ${signed(lineGrowth)} lines, ${signed(wordGrowth)} words since ${options.base}`);
          }
        }
      }
    }
  }

  const sentencesByText = new Map();
  for (const file of files) {
    const display = displayPath(file, options.root);
    const text = readFileSync(file, "utf8");
    for (const { sentence, line } of extractProseSentences(text)) {
      const words = sentence.split(/\s+/u).filter(Boolean).length;
      if (words < options.minWords) continue;
      if (!sentencesByText.has(sentence)) sentencesByText.set(sentence, []);
      const locations = sentencesByText.get(sentence);
      const key = `${display}:${line}`;
      if (!locations.some((location) => location.key === key)) locations.push({ key, display, line });
    }
  }

  for (const [sentence, locations] of sentencesByText) {
    const filesForSentence = new Set(locations.map((location) => location.display));
    if (filesForSentence.size < 2) continue;
    locations.sort((left, right) => left.display.localeCompare(right.display) || left.line - right.line);
    const first = locations[0];
    const quote = sentence.slice(0, 80);
    addRecord("warning", first.display, first.line, `WARN duplicate_sentence: "${quote}" in ${locations.map((location) => `${location.key}`).join(", ")}`);
  }

  records.sort((left, right) =>
    left.file.localeCompare(right.file) ||
    left.line - right.line ||
    left.text.localeCompare(right.text)
  );
  for (const record of records) console.log(record.text);

  if (errors === 0) {
    console.log(`ok   instructions: ${files.length} files, 0 errors, ${warnings} warnings`);
    process.exit(0);
  }
  console.log(`FAIL instructions: ${files.length} files, ${errors} errors, ${warnings} warnings`);
  process.exit(1);
} catch (error) {
  if (error instanceof UsageError) {
    usage(error.message);
    process.exit(2);
  }
  throw error;
}
