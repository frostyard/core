#!/usr/bin/env node
// Read-only report for the corrections inbox of local git checkouts: the
// folder form .memory/corrections/ (1 file for each record) and the old form
// .memory/corrections.jsonl, both read while repositories move (ADR-0081).
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const usage = "Usage: node scripts/corrections-report.mjs --root DIR [--depth N] [--ref REF] [--json] [--out FILE]";
const requiredFields = ["date", "scope", "correction", "evidence", "promoted_to"];
const OLD = ".memory/corrections.jsonl";
const DIR = ".memory/corrections";
const NAME = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/;

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

// The order of the records: by date, then by the path each record comes from
// (byte order), then by line (a folder record has no line, counted as 0).
function compareSource(a, b) {
  return Buffer.compare(Buffer.from(a ?? "", "utf8"), Buffer.from(b ?? "", "utf8"));
}

function compareLines(a, b) {
  return compareText(a.date, b.date)
    || compareSource(a.source, b.source)
    || (a.line ?? 0) - (b.line ?? 0)
    || compareText(a.correction, b.correction)
    || compareText(a.evidence, b.evidence);
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

// GIT_NO_LAZY_FETCH: in a partial clone, a missing object is an error, not
// a fetch from the promisor remote. The report never touches the network
// and never writes objects into a clone.
function git(folder, args) {
  return execFileSync("git", ["-C", folder, ...args], {
    stdio: "pipe",
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_NO_LAZY_FETCH: "1" },
  });
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

// The commit a ref names in 1 checkout, or null. Most refs (origin/main) are
// the same in every worktree of a clone; HEAD is not.
function resolveRef(folder, ref) {
  try {
    return git(folder, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`]).trim() || null;
  } catch {
    return null;
  }
}

function parseRecord(text) {
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

function parseLines(text, found) {
  for (const [index, lineText] of splitLines(text).entries()) {
    const lineNumber = index + 1;
    const parsed = parseRecord(lineText);
    if (parsed.error) {
      found.problems.push({ source: OLD, line: lineNumber, reason: parsed.error });
      continue;
    }
    found.records.push({ ...parsed.value, source: OLD, line: lineNumber });
  }
}

// 1 entry of the folder form, in either form (a Git tree entry or a directory
// entry): its bytes via read(), or the reason it cannot be a record.
function folderEntry(name, mode, read, lost) {
  if (name === ".gitkeep") return null;
  const source = `${DIR}/${name}`;
  if (mode === "link") return { source, problem: "symbolic link, not followed" };
  if (mode !== "file") return { source, problem: "not a regular file" };
  if (!NAME.test(name)) return { source, problem: "not a record file name" };
  let text;
  try {
    text = read();
  } catch {
    return { source, problem: lost };
  }
  const parsed = parseRecord(text);
  if (parsed.error) return { source, problem: parsed.error };
  return { source, record: parsed.value };
}

function addFolderEntry(entry, found) {
  if (entry === null) return;
  if (entry.problem) {
    found.problems.push({ source: entry.source, line: null, reason: entry.problem });
    return;
  }
  found.records.push({ ...entry.record, source: entry.source, line: null });
}

function cannotRead(ref, error) {
  return `cannot read ${ref}: ${String(error.stderr || error.message).trim().split("\n")[0]}`;
}

// Reads both forms at a commit, not in the working tree, so a line on an
// unmerged branch or an uncommitted edit is not counted. Returns
// { absent: true } or { records, problems } (the problems are sources with
// the reason they cannot be read).
function readAtCommit(folder, commit, ref) {
  const entryOf = (tree, name) => {
    for (const item of git(folder, ["ls-tree", "-z", tree]).split("\0")) {
      const match = item.match(/^(\d+) (\w+) ([0-9a-f]+)\t(.*)$/s);
      if (match && match[4] === name) return { mode: match[1], type: match[2], oid: match[3] };
    }
    return null;
  };
  const blob = (oid) => git(folder, ["cat-file", "blob", oid]);
  const found = { records: [], problems: [] };

  let memory;
  try {
    memory = entryOf(commit, ".memory");
  } catch (error) {
    found.problems.push({ source: ".memory", line: null, reason: cannotRead(ref, error) });
    return found;
  }
  if (!memory) return { absent: true };
  if (memory.mode === "120000") {
    found.problems.push({ source: ".memory", line: null, reason: "symbolic link, not followed" });
    return found;
  }
  if (memory.type !== "tree") return { absent: true };

  // The old form: 1 JSON object for each line.
  let legacy;
  try {
    legacy = entryOf(memory.oid, "corrections.jsonl");
  } catch (error) {
    found.problems.push({ source: OLD, line: null, reason: cannotRead(ref, error) });
    legacy = null;
  }
  if (legacy) {
    if (legacy.mode === "120000") found.problems.push({ source: OLD, line: null, reason: "symbolic link, not followed" });
    else if (legacy.type === "blob") {
      try {
        parseLines(blob(legacy.oid), found);
      } catch {
        // Also a blob that a partial clone does not hold: it is not fetched.
        found.problems.push({ source: OLD, line: null, reason: `cannot read file at ${ref}` });
      }
    }
  }

  // The folder form: 1 file for each record.
  let corrections;
  try {
    corrections = entryOf(memory.oid, "corrections");
  } catch (error) {
    found.problems.push({ source: DIR, line: null, reason: cannotRead(ref, error) });
    corrections = null;
  }
  if (corrections) {
    if (corrections.mode === "120000") found.problems.push({ source: DIR, line: null, reason: "symbolic link, not followed" });
    else if (corrections.type !== "tree") found.problems.push({ source: DIR, line: null, reason: "not a folder" });
    else {
      let listed;
      try {
        listed = git(folder, ["ls-tree", "-z", corrections.oid]).split("\0");
      } catch (error) {
        found.problems.push({ source: DIR, line: null, reason: cannotRead(ref, error) });
        listed = [];
      }
      for (const item of listed) {
        const match = item.match(/^(\d+) (\w+) ([0-9a-f]+)\t(.*)$/s);
        if (!match) continue;
        const mode = match[1] === "120000" ? "link" : match[2] === "blob" ? "file" : "other";
        addFolderEntry(
          folderEntry(match[4], mode, () => blob(match[3]), `cannot read file at ${ref}`),
          found,
        );
      }
    }
  }

  if (found.records.length === 0 && found.problems.length === 0) return { absent: true };
  return found;
}

// Both forms of 1 checkout in its working tree.
function readWorkingTree(folder) {
  const found = { records: [], problems: [] };
  const memoryFolder = resolve(folder, ".memory");
  let stat;
  try {
    stat = lstatSync(memoryFolder);
  } catch (error) {
    if (!absent(error)) found.problems.push({ source: ".memory", line: null, reason: `cannot read: ${error.code ?? error.message}` });
    return found;
  }
  if (stat.isSymbolicLink()) {
    found.problems.push({ source: ".memory", line: null, reason: "symbolic link, not followed" });
    return found;
  }
  if (!stat.isDirectory()) return found;

  const legacyPath = resolve(memoryFolder, "corrections.jsonl");
  try {
    stat = lstatSync(legacyPath);
  } catch (error) {
    if (!absent(error)) found.problems.push({ source: OLD, line: null, reason: `cannot read: ${error.code ?? error.message}` });
    stat = null;
  }
  if (stat) {
    if (stat.isSymbolicLink()) found.problems.push({ source: OLD, line: null, reason: "symbolic link, not followed" });
    else if (stat.isFile()) {
      try {
        parseLines(readFileSync(legacyPath, "utf8"), found);
      } catch {
        found.problems.push({ source: OLD, line: null, reason: "cannot read file" });
      }
    }
  }

  const correctionsFolder = resolve(memoryFolder, "corrections");
  try {
    stat = lstatSync(correctionsFolder);
  } catch (error) {
    if (!absent(error)) found.problems.push({ source: DIR, line: null, reason: `cannot read: ${error.code ?? error.message}` });
    return found;
  }
  if (stat.isSymbolicLink()) {
    found.problems.push({ source: DIR, line: null, reason: "symbolic link, not followed" });
    return found;
  }
  if (!stat.isDirectory()) {
    found.problems.push({ source: DIR, line: null, reason: "not a folder" });
    return found;
  }
  let names;
  try {
    names = readdirSync(correctionsFolder).sort(compareText);
  } catch (error) {
    found.problems.push({ source: DIR, line: null, reason: `cannot read: ${error.code ?? error.message}` });
    return found;
  }
  for (const name of names) {
    const path = resolve(correctionsFolder, name);
    let entryStat;
    try {
      entryStat = lstatSync(path);
    } catch (error) {
      found.problems.push({ source: `${DIR}/${name}`, line: null, reason: `cannot read: ${error.code ?? error.message}` });
      continue;
    }
    const mode = entryStat.isSymbolicLink() ? "link" : entryStat.isFile() ? "file" : "other";
    addFolderEntry(folderEntry(name, mode, () => readFileSync(path, "utf8"), "cannot read file"), found);
  }
  return found;
}

// Only "no such path" means "no corrections": every other error is listed as
// unreadable, so a checkout is never left out without a trace.
function absent(error) {
  return error?.code === "ENOENT" || error?.code === "ENOTDIR";
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

// The permanent identity of a record: line N of the old file and the record
// file <date>-legacy-<digits>.json that line N became are the same record, and
// every other record file is named by its file name. Content is not identity:
// 2 distinct records may hold the same 4 fields, and a checkout may hold a
// different set of them, so a merge by content would move a promotion.
const LEGACY_FILE = /^(\d{4}-\d{2}-\d{2})-legacy-(\d+)\.json$/;

function recordIdentity(line) {
  if (line.source === OLD) return `legacy:${Number(line.line)}`;
  const name = line.source.startsWith(`${DIR}/`) ? line.source.slice(DIR.length + 1) : line.source;
  const match = LEGACY_FILE.exec(name);
  // 4 digits and 5 digits name the same line, so the number counts, not its
  // padding.
  return match ? `legacy:${Number(match[2])}` : `file:${name}`;
}

function mergeCheckouts(checkouts) {
  const merged = new Map();

  for (const checkout of checkouts.sort((a, b) => compareText(a.path, b.path))) {
    for (const line of checkout.lines) {
      // The record that is kept brings its own source and line.
      const identity = recordIdentity(line);
      const existing = merged.get(identity);
      if (!existing) {
        merged.set(identity, { ...line });
      } else if (existing.promoted_to.trim() === "" && line.promoted_to.trim() !== "") {
        merged.set(identity, { ...line });
      }
    }
  }
  return [...merged.values()].sort(compareLines);
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

// What a checkout that does not hold the ref keeps in its working tree: 1
// entry for each form it has, or for the reason it cannot be read.
function workingTreeSources(folder, ref) {
  const sources = [];
  const memoryFolder = resolve(folder, ".memory");
  let stat;
  try {
    stat = lstatSync(memoryFolder);
  } catch (error) {
    if (absent(error)) return sources;
    return [{ source: ".memory", reason: `ref not found: ${ref}; cannot read: ${error.code ?? error.message}` }];
  }
  // Neither a link nor a file is read: the records of a checkout are at the
  // path the checkout names, never behind a link that leaves it.
  if (stat.isSymbolicLink()) return [{ source: ".memory", reason: `ref not found: ${ref}; symbolic link, not followed` }];
  if (!stat.isDirectory()) return sources;
  for (const source of [OLD, DIR]) {
    try {
      lstatSync(resolve(folder, source));
      sources.push({ source, reason: `ref not found: ${ref}` });
    } catch (error) {
      if (!absent(error)) sources.push({ source, reason: `ref not found: ${ref}; cannot read: ${error.code ?? error.message}` });
    }
  }
  return sources;
}

function buildReport(root, maxDepth, ref = null) {
  const checkouts = discoverRepositories(root, maxDepth);
  const repositoryMap = new Map();
  const unreadable = [];
  const repositoriesScanned = checkouts.length;

  const repositoryFor = (checkout, known = null) => {
    const name = known ?? (remoteName(checkout.absolute) || `local:${checkout.path}`);
    if (!repositoryMap.has(name)) repositoryMap.set(name, { name, checkouts: [] });
    return repositoryMap.get(name);
  };
  // With a ref, the worktrees of 1 clone are 1 group (their shared git
  // folder). The group's identity is the first remote that any of its
  // worktrees names, and a commit is read once per group.
  const groupOf = new Map();
  if (ref !== null) {
    const groups = new Map();
    for (const checkout of checkouts) {
      const key = commonDir(checkout.absolute) ?? `checkout:${checkout.absolute}`;
      if (!groups.has(key)) groups.set(key, { key, firstPath: checkout.path, remote: null, read: new Map() });
      const group = groups.get(key);
      group.remote ??= remoteName(checkout.absolute);
      groupOf.set(checkout, group);
    }
  }

  for (const checkout of checkouts) {
    if (ref !== null) {
      const group = groupOf.get(checkout);
      const name = group.remote ?? `local:${group.firstPath}`;
      const commit = resolveRef(checkout.absolute, ref);
      if (commit === null) {
        // Without the ref, a checkout with a working-tree form is listed, so
        // it is never left out without a trace; one without records has
        // nothing to report.
        const sources = workingTreeSources(checkout.absolute, ref);
        if (sources.length > 0) {
          const repository = repositoryFor(checkout, name);
          repository.checkouts.push({ path: checkout.path, lines: [] });
          for (const { source, reason } of sources) {
            unreadable.push({ repository: name, path: `${checkout.path}/${source}`, source, line: null, reason });
          }
        }
        continue;
      }
      const seen = group.read.has(commit);
      if (!seen) group.read.set(commit, readAtCommit(checkout.absolute, commit, ref));
      const result = group.read.get(commit);
      if (result.absent) continue;
      const repository = repositoryFor(checkout, name);
      repository.checkouts.push({
        path: checkout.path,
        lines: result.records.map((record) => ({ ...record, path: checkout.path })),
      });
      if (seen) continue;
      for (const problem of result.problems) {
        unreadable.push({
          repository: name,
          path: `${checkout.path}/${problem.source}`,
          source: problem.source,
          line: problem.line,
          reason: problem.reason,
        });
      }
      continue;
    }

    const found = readWorkingTree(checkout.absolute);
    if (found.records.length === 0 && found.problems.length === 0) continue;
    const repository = repositoryFor(checkout);
    repository.checkouts.push({
      path: checkout.path,
      lines: found.records.map((record) => ({ ...record, path: checkout.path })),
    });
    for (const problem of found.problems) {
      unreadable.push({
        repository: repository.name,
        path: `${checkout.path}/${problem.source}`,
        source: problem.source,
        line: problem.line,
        reason: problem.reason,
      });
    }
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
        source: line.source,
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

  const recordCount = repositories.reduce((sum, repository) => sum + repository.lines.length, 0);
  const pendingCount = repositories.reduce((sum, repository) => sum + repository.pending.length, 0);
  const groups = groupScopes(repositories);

  return {
    schema_version: 1,
    root,
    ref,
    repositories_scanned: repositoriesScanned,
    repositories_with_corrections: repositories.length,
    lines: recordCount,
    records: recordCount,
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

// The path a record comes from: the old file with its line, or the record file.
function sourceOf(line) {
  return line.line === null ? `(${clean(line.source)})` : `(${clean(line.source)}:${line.line})`;
}

function textReport(report) {
  const lines = [];
  lines.push(`Corrections report: ${report.root}${report.ref === null ? " (working trees)" : ` (at ${clean(report.ref)})`}`);
  lines.push(`Repositories scanned: ${report.repositories_scanned}; with corrections: ${report.repositories_with_corrections}; lines: ${report.lines}; records: ${report.records}; pending: ${report.pending}`);

  lines.push("");
  lines.push("## Pending (promoted_to is empty)");
  const pendingRepositories = report.repositories.filter((repository) => repository.pending.length > 0);
  if (pendingRepositories.length === 0) {
    lines.push("(none)");
  } else {
    for (const repository of pendingRepositories) {
      lines.push(`### ${clean(repository.name)} (${clean(repository.paths.join(", "))})`);
      for (const line of [...repository.pending].sort(compareLines)) {
        lines.push(`- ${clean(line.date)} [${clean(line.scope)}] ${clean(line.correction)} — evidence: ${clean(line.evidence)} ${sourceOf(line)}`);
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
        lines.push(`- ${clean(line.date)} ${clean(line.correction)} — evidence: ${clean(line.evidence)} ${sourceOf(line)}`);
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
        lines.push(`- ${clean(line.repository)} ${clean(line.date)} ${clean(line.correction)} — evidence: ${clean(line.evidence)} ${sourceOf(line)}`);
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
      source: line.source,
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
      source: line.source,
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
    records: report.records,
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
