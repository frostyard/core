#!/usr/bin/env node
// Read-only report for .memory/corrections.jsonl files in local git checkouts.
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const usage = "Usage: node scripts/corrections-report.mjs --root DIR [--depth N] [--ref REF] [--json] [--out FILE]";
const requiredFields = ["date", "scope", "correction", "evidence", "promoted_to"];

function plainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function splitLines(text) {
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function relativePath(root, folder) {
  const value = relative(root, folder);
  return value === "" ? "." : value.split(sep).join("/");
}

// The repository identity is the host plus the full path, so 2 remotes on
// different hosts or in different namespaces never merge. SSH, scp-style and
// HTTPS forms of 1 repository give the same identity. A github.com remote
// shows as owner/name; any other host keeps its host in the name.
export function parseRemoteUrl(value) {
  if (!value) return null;
  const remote = value.trim();
  let host;
  let path;

  const scp = remote.match(/^(?:[^@/]+@)?([^:/]+):(.+)$/);
  if (scp && !remote.includes("://")) {
    host = scp[1];
    path = scp[2];
  } else {
    try {
      const url = new URL(remote);
      // A non-default port is part of the identity: 2 ports are 2 servers.
      // URL already drops 80 and 443 for http(s); ssh is not a special
      // scheme, so its default 22 is dropped here.
      const port = url.port && !(url.protocol === "ssh:" && url.port === "22") ? `:${url.port}` : "";
      host = `${url.hostname}${port}`;
      path = decodeURIComponent(url.pathname);
    } catch {
      return null;
    }
  }

  if (!host || !path) return null;
  host = host.toLowerCase();
  const parts = path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (parts.length < 2) return null;
  if (parts.at(-1).endsWith(".git")) parts[parts.length - 1] = parts.at(-1).slice(0, -4);
  if (!parts.at(-1)) return null;
  if (host === "github.com") return parts.join("/").toLowerCase();
  return `${host}/${parts.join("/")}`;
}

function remoteName(folder) {
  try {
    const output = execFileSync("git", ["-C", folder, "config", "--get", "remote.origin.url"], {
      stdio: "pipe",
      encoding: "utf8",
    }).trim();
    return parseRemoteUrl(output);
  } catch {
    return null;
  }
}

function git(folder, args) {
  return execFileSync("git", ["-C", folder, ...args], { stdio: "pipe", encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

// The shared git folder of a checkout: every worktree of 1 clone has the same
// one, so its refs and its file at a ref are read once.
function commonDir(folder) {
  try {
    return git(folder, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim() || null;
  } catch {
    return null;
  }
}

// Reads .memory/corrections.jsonl at a ref (such as origin/main), not in the
// working tree, so a line on an unmerged branch or an uncommitted edit is not
// counted. Returns { text }, { absent: true } or { error }.
function readAtRef(folder, ref) {
  let commit;
  try {
    commit = git(folder, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`]).trim();
  } catch {
    return { error: `ref not found: ${ref}`, missingRef: true };
  }
  // 1 tree at a time: `ls-tree` given a folder path lists the folder's
  // content, not the folder's own entry.
  const entry = (tree, name) => {
    for (const item of git(folder, ["ls-tree", "-z", tree]).split("\0")) {
      const match = item.match(/^(\d+) (\w+) ([0-9a-f]+)\t(.*)$/s);
      if (match && match[4] === name) return { mode: match[1], type: match[2], oid: match[3] };
    }
    return null;
  };
  let memory;
  let file;
  try {
    memory = entry(commit, ".memory");
    if (!memory) return { absent: true };
    if (memory.mode === "120000") return { error: "symbolic link, not followed", path: ".memory" };
    if (memory.type !== "tree") return { absent: true };
    file = entry(memory.oid, "corrections.jsonl");
  } catch (error) {
    return { error: `cannot read ${ref}: ${String(error.stderr || error.message).trim().split("\n")[0]}` };
  }
  if (!file) return { absent: true };
  if (file.mode === "120000") return { error: "symbolic link, not followed" };
  if (file.type !== "blob") return { absent: true };
  try {
    return { text: git(folder, ["cat-file", "blob", file.oid]) };
  } catch {
    return { error: "cannot read file" };
  }
}

function discoverRepositories(root, maxDepth) {
  const found = [];

  function walk(folder, depth) {
    let gitEntry;
    try {
      gitEntry = lstatSync(`${folder}/.git`);
    } catch {
      gitEntry = null;
    }
    if (gitEntry && (gitEntry.isDirectory() || gitEntry.isFile())) {
      found.push({ absolute: folder, path: relativePath(root, folder) });
      return;
    }

    if (depth >= maxDepth) return;

    let entries;
    try {
      entries = readdirSync(folder, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => compareText(a.name, b.name));
    for (const entry of entries) {
      if (entry.name === "node_modules") continue;
      if (entry.isSymbolicLink()) continue;
      const child = resolve(folder, entry.name);
      let childStat;
      try {
        childStat = lstatSync(child);
      } catch {
        continue;
      }
      if (!childStat.isDirectory()) continue;
      walk(child, depth + 1);
    }
  }

  walk(root, 0);
  return found.sort((a, b) => compareText(a.path, b.path));
}

function parseLine(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { error: "invalid JSON" };
  }
  if (!plainObject(value)) return { error: "not a plain object" };

  const missing = requiredFields.filter((field) => !Object.hasOwn(value, field));
  if (missing.length > 0) return { error: `missing field(s): ${missing.join(", ")}` };
  for (const field of requiredFields) {
    if (typeof value[field] !== "string") return { error: `value for ${field} is not a string` };
  }
  return { value };
}

function mergeCheckouts(checkouts) {
  const merged = new Map();

  for (const checkout of checkouts.sort((a, b) => compareText(a.path, b.path))) {
    for (const line of checkout.lines) {
      const key = JSON.stringify([line.date, line.scope, line.correction, line.evidence]);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...line });
      } else if (existing.promoted_to.trim() === "" && line.promoted_to.trim() !== "") {
        merged.set(key, { ...line });
      }
    }
  }
  return [...merged.values()].sort((a, b) =>
    compareText(a.date, b.date)
    || a.line - b.line
    || compareText(a.scope, b.scope)
    || compareText(a.correction, b.correction)
    || compareText(a.evidence, b.evidence)
  );
}

export function groupScopes(repositories) {
  const inRepository = [];
  const across = new Map();

  for (const repository of [...repositories].sort((a, b) => compareText(a.name, b.name))) {
    const scopes = new Map();
    for (const line of repository.lines) {
      const key = line.scope.trim().toLowerCase();
      if (!scopes.has(key)) scopes.set(key, { scope: line.scope, lines: [] });
      scopes.get(key).lines.push(line);
    }

    for (const [key, group] of [...scopes].sort((a, b) => compareText(a[0], b[0]))) {
      const pending = group.lines
        .filter((line) => line.promoted_to.trim() === "")
        .sort(compareLines);
      if (group.lines.length >= 2 && pending.length > 0) {
        inRepository.push({
          repository: repository.name,
          scope: group.scope,
          key,
          lines: group.lines.length,
          promoted: group.lines.length - pending.length,
          pending,
        });
      }

      if (!across.has(key)) across.set(key, { scope: group.scope, repositories: new Map() });
      const cross = across.get(key);
      for (const line of group.lines) cross.repositories.set(repository.name, true);
      cross.lines = [...(cross.lines || []), ...group.lines.map((line) => ({ ...line, repository: repository.name }))];
    }
  }

  const repeatedAcrossRepositories = [];
  for (const [key, group] of [...across].sort((a, b) => compareText(a[0], b[0]))) {
    const repositoryNames = [...group.repositories.keys()].sort(compareText);
    if (repositoryNames.length < 2) continue;
    const pending = group.lines
      .filter((line) => line.promoted_to.trim() === "")
      .sort((a, b) => compareText(a.repository, b.repository) || compareLines(a, b));
    if (pending.length === 0) continue;
    repeatedAcrossRepositories.push({
      scope: group.scope,
      key,
      repositories: repositoryNames,
      lines: group.lines.length,
      promoted: group.lines.length - pending.length,
      pending,
    });
  }

  inRepository.sort((a, b) => compareText(a.repository, b.repository) || compareText(a.key, b.key));
  return { inRepository, acrossRepositories: repeatedAcrossRepositories };
}

function compareLines(a, b) {
  return compareText(a.date, b.date)
    || (a.line ?? 0) - (b.line ?? 0)
    || compareText(a.correction, b.correction)
    || compareText(a.evidence, b.evidence);
}

function parseCorrections(text, name, checkout, unreadable) {
  const lines = [];
  for (const [index, lineText] of splitLines(text).entries()) {
    const lineNumber = index + 1;
    const parsed = parseLine(lineText);
    if (parsed.error) {
      unreadable.push({ repository: name, path: `${checkout.path}/.memory/corrections.jsonl`, line: lineNumber, reason: parsed.error });
      continue;
    }
    const value = parsed.value;
    lines.push({
      date: value.date,
      scope: value.scope,
      correction: value.correction,
      evidence: value.evidence,
      promoted_to: value.promoted_to,
      path: checkout.path,
      line: lineNumber,
    });
  }
  return lines;
}

function buildReport(root, maxDepth, ref = null) {
  const checkouts = discoverRepositories(root, maxDepth);
  const repositoryMap = new Map();
  const unreadable = [];
  let repositoriesScanned = checkouts.length;

  // Only "no such path" means "no corrections": every other error (a denied
  // folder, a symbolic link out of the checkout) is listed as unreadable, so
  // a checkout is never left out without a trace.
  const absent = (error) => error?.code === "ENOENT" || error?.code === "ENOTDIR";
  const repositoryFor = (checkout) => {
    const name = remoteName(checkout.absolute) || `local:${checkout.path}`;
    if (!repositoryMap.has(name)) repositoryMap.set(name, { name, checkouts: [] });
    return repositoryMap.get(name);
  };
  const skip = (checkout, path, reason) => {
    const repository = repositoryFor(checkout);
    repository.checkouts.push({ path: checkout.path, lines: [] });
    unreadable.push({ repository: repository.name, path: `${checkout.path}/${path}`, line: null, reason });
  };

  // With a ref, the worktrees of 1 clone share their refs: read the file once
  // per shared git folder and list the other worktrees as paths only.
  const readClones = new Map();

  for (const checkout of checkouts) {
    if (ref !== null) {
      const shared = commonDir(checkout.absolute);
      if (shared !== null && readClones.has(shared)) {
        readClones.get(shared)?.checkouts.push({ path: checkout.path, lines: [] });
        continue;
      }
      const result = readAtRef(checkout.absolute, ref);
      // A checkout without the ref and without a working-tree file has
      // nothing to report; with the file, the missing ref is listed.
      if (result.missingRef && !existsSync(resolve(checkout.absolute, ".memory/corrections.jsonl"))) result.absent = true;
      if (result.absent) {
        if (shared !== null) readClones.set(shared, null);
        continue;
      }
      const repository = repositoryFor(checkout);
      if (shared !== null) readClones.set(shared, repository);
      if (result.error) {
        skip(checkout, result.path ?? ".memory/corrections.jsonl", result.error);
        continue;
      }
      repository.checkouts.push({ path: checkout.path, lines: parseCorrections(result.text, repository.name, checkout, unreadable) });
      continue;
    }

    const memoryFolder = resolve(checkout.absolute, ".memory");
    const correctionsFile = resolve(memoryFolder, "corrections.jsonl");
    let stat;
    try {
      stat = lstatSync(memoryFolder);
    } catch (error) {
      if (!absent(error)) skip(checkout, ".memory", `cannot read: ${error.code ?? error.message}`);
      continue;
    }
    if (stat.isSymbolicLink()) {
      skip(checkout, ".memory", "symbolic link, not followed");
      continue;
    }
    if (!stat.isDirectory()) continue;
    try {
      stat = lstatSync(correctionsFile);
    } catch (error) {
      if (!absent(error)) skip(checkout, ".memory/corrections.jsonl", `cannot read: ${error.code ?? error.message}`);
      continue;
    }
    if (stat.isSymbolicLink()) {
      skip(checkout, ".memory/corrections.jsonl", "symbolic link, not followed");
      continue;
    }
    if (!stat.isFile()) continue;

    const repository = repositoryFor(checkout);
    const name = repository.name;

    let text;
    try {
      text = readFileSync(correctionsFile, "utf8");
    } catch {
      unreadable.push({ repository: name, path: `${checkout.path}/.memory/corrections.jsonl`, line: null, reason: "cannot read file" });
      repository.checkouts.push({ path: checkout.path, lines: [] });
      continue;
    }

    repository.checkouts.push({ path: checkout.path, lines: parseCorrections(text, name, checkout, unreadable) });
  }

  const repositories = [];
  for (const repository of [...repositoryMap.values()].sort((a, b) => compareText(a.name, b.name))) {
    const paths = [...new Set(repository.checkouts.map((checkout) => checkout.path))].sort(compareText);
    const lines = mergeCheckouts(repository.checkouts);
    const pending = lines
      .filter((line) => line.promoted_to.trim() === "")
      .sort(compareLines)
      .map((line) => ({
        date: line.date,
        scope: line.scope,
        correction: line.correction,
        evidence: line.evidence,
        path: line.path,
        line: line.line,
      }));
    repositories.push({ name: repository.name, paths, lines, pending });
  }

  unreadable.sort((a, b) =>
    compareText(a.repository, b.repository)
    || compareText(a.path, b.path)
    || (a.line ?? 0) - (b.line ?? 0)
    || compareText(a.reason, b.reason)
  );

  const repositoriesWithCorrections = repositories.length;
  const lineCount = repositories.reduce((sum, repository) => sum + repository.lines.length, 0);
  const pendingCount = repositories.reduce((sum, repository) => sum + repository.pending.length, 0);
  const groups = groupScopes(repositories);

  return {
    schema_version: 1,
    root,
    ref,
    repositories_scanned: repositoriesScanned,
    repositories_with_corrections: repositoriesWithCorrections,
    lines: lineCount,
    pending: pendingCount,
    repositories,
    repeated_in_repository: groups.inRepository,
    repeated_across_repositories: groups.acrossRepositories,
    unreadable,
  };
}

// Text output is for a terminal and for Markdown: a correction written in
// another repository must not inject escape sequences or break a list item.
function clean(value) {
  return String(value).replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ");
}

function textReport(report) {
  const lines = [];
  lines.push(`Corrections report: ${report.root}${report.ref === null ? " (working trees)" : ` (at ${clean(report.ref)})`}`);
  lines.push(`Repositories scanned: ${report.repositories_scanned}; with corrections: ${report.repositories_with_corrections}; lines: ${report.lines}; pending: ${report.pending}`);

  lines.push("");
  lines.push("## Pending (promoted_to is empty)");
  const pendingRepositories = report.repositories.filter((repository) => repository.pending.length > 0);
  if (pendingRepositories.length === 0) {
    lines.push("(none)");
  } else {
    for (const repository of pendingRepositories) {
      lines.push(`### ${clean(repository.name)} (${clean(repository.paths.join(", "))})`);
      for (const line of [...repository.pending].sort(compareLines)) {
        lines.push(`- ${clean(line.date)} [${clean(line.scope)}] ${clean(line.correction)} — evidence: ${clean(line.evidence)}`);
      }
    }
  }

  lines.push("");
  lines.push("## Repeated scopes in 1 repository");
  if (report.repeated_in_repository.length === 0) {
    lines.push("(none)");
  } else {
    for (const group of report.repeated_in_repository) {
      lines.push(`### ${clean(group.repository)}: ${clean(group.scope)} (${group.lines} lines, ${group.promoted} promoted)`);
      for (const line of group.pending) {
        lines.push(`- ${clean(line.date)} ${clean(line.correction)} — evidence: ${clean(line.evidence)}`);
      }
    }
  }

  lines.push("");
  lines.push("## Scopes in 2 or more repositories");
  if (report.repeated_across_repositories.length === 0) {
    lines.push("(none)");
  } else {
    for (const group of report.repeated_across_repositories) {
      lines.push(`### ${clean(group.scope)}: ${clean(group.repositories.join(", "))} (${group.lines} lines, ${group.promoted} promoted)`);
      for (const line of group.pending) {
        lines.push(`- ${clean(line.repository)} ${clean(line.date)} ${clean(line.correction)} — evidence: ${clean(line.evidence)}`);
      }
    }
  }

  lines.push("");
  lines.push("## Unreadable lines");
  if (report.unreadable.length === 0) {
    lines.push("(none)");
  } else {
    for (const item of report.unreadable) {
      lines.push(`- ${clean(item.repository)} ${clean(item.path)}${item.line === null ? "" : `:${item.line}`}: ${clean(item.reason)}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function jsonReport(report) {
  const repositories = report.repositories.map((repository) => ({
    name: repository.name,
    paths: repository.paths,
    lines: repository.lines.length,
    pending: repository.pending,
  }));
  const repeatedInRepository = report.repeated_in_repository.map((group) => ({
    repository: group.repository,
    scope: group.scope,
    lines: group.lines,
    promoted: group.promoted,
    pending: group.pending.map((line) => ({
      date: line.date,
      correction: line.correction,
      evidence: line.evidence,
      path: line.path,
      line: line.line,
    })),
  }));
  const repeatedAcrossRepositories = report.repeated_across_repositories.map((group) => ({
    scope: group.scope,
    repositories: group.repositories,
    lines: group.lines,
    promoted: group.promoted,
    pending: group.pending.map((line) => ({
      repository: line.repository,
      date: line.date,
      correction: line.correction,
      evidence: line.evidence,
      path: line.path,
      line: line.line,
    })),
  }));

  return `${JSON.stringify({
    schema_version: 1,
    root: report.root,
    ref: report.ref,
    repositories_scanned: report.repositories_scanned,
    repositories_with_corrections: report.repositories_with_corrections,
    lines: report.lines,
    pending: report.pending,
    repositories,
    repeated_in_repository: repeatedInRepository,
    repeated_across_repositories: repeatedAcrossRepositories,
    unreadable: report.unreadable,
  }, null, 2)}\n`;
}

function usageError() {
  console.error(usage);
  process.exit(2);
}

function main() {
  let root;
  let depth = 3;
  let json = false;
  let out;
  let ref = null;
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--root" || arg === "--depth" || arg === "--out" || arg === "--ref") {
      if (i + 1 >= args.length) usageError();
      const value = args[++i];
      if (!value || value.startsWith("--")) usageError();
      if (arg === "--root") root = resolve(value);
      if (arg === "--depth") {
        if (!/^[-+]?\d+$/.test(value)) usageError();
        depth = Number(value);
        if (!Number.isInteger(depth) || depth < 0) usageError();
      }
      if (arg === "--out") out = resolve(value);
      if (arg === "--ref") {
        // A ref name or a revision such as origin/main or HEAD~1: never an
        // option for git, and never a range.
        if (!/^[A-Za-z0-9][A-Za-z0-9._\/@{}~^-]*$/.test(value) || value.includes("..")) usageError();
        ref = value;
      }
    } else if (arg === "--json") {
      json = true;
    } else {
      usageError();
    }
  }

  if (!root) usageError();
  let rootStat;
  try {
    rootStat = statSync(root);
  } catch {
    usageError();
  }
  if (!rootStat.isDirectory()) usageError();

  if (out) {
    const parent = dirname(out);
    let parentStat;
    try {
      parentStat = statSync(parent);
    } catch {
      console.error(`Error: --out parent folder does not exist: ${parent}`);
      process.exit(2);
    }
    if (!parentStat.isDirectory()) {
      console.error(`Error: --out parent folder is not a folder: ${parent}`);
      process.exit(2);
    }
  }

  const report = buildReport(root, depth, ref);
  const output = json ? jsonReport(report) : textReport(report);

  if (out) {
    try {
      writeFileSync(out, output, "utf8");
    } catch (error) {
      console.error(`Error: cannot write --out file: ${error.message}`);
      process.exit(2);
    }
  } else {
    process.stdout.write(output);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
