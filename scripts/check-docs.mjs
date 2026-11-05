#!/usr/bin/env node
// Docs-integrity gate: index coverage, relative-link integrity, symlink
// resolution — thresholds in .coverage-thresholds.json (ADR-0029; the
// never_relax guardrail follows ADR-0019). Zero dependencies; Node >= 20.
import { readFileSync, readdirSync, lstatSync, existsSync, realpathSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const thresholds = JSON.parse(readFileSync(join(root, ".coverage-thresholds.json"), "utf8"));

if (thresholds.never_relax !== true) {
  console.error("FATAL: .coverage-thresholds.json never_relax must be true (ADR-0019: the loop may tighten, never loosen).");
  process.exit(1);
}

const failures = [];
const rate = (pass, total) => (total === 0 ? 1 : pass / total);

// ---- 1. Index coverage: every doc in the four categories is indexed. ----
const indexPath = join(root, "docs/README.md");
// Strip fenced code blocks and HTML comments so example/commented-out links
// aren't mistaken for real links.
const indexText = readFileSync(indexPath, "utf8")
  .replace(/```[\s\S]*?```/g, "")
  .replace(/<!--[\s\S]*?-->/g, "");
const indexedTargets = new Set();
for (const m of indexText.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
  const target = m[1];
  if (/^[a-z][a-z+.-]*:/i.test(target) || target.startsWith("#")) continue;
  indexedTargets.add(resolve(dirname(indexPath), target.split("#")[0]));
}
const categories = ["adr", "design", "specs", "plans"];
let docsTotal = 0;
let docsIndexed = 0;
for (const cat of categories) {
  for (const name of readdirSync(join(root, "docs", cat))) {
    if (!name.endsWith(".md") || name === "TEMPLATE.md") continue;
    docsTotal++;
    if (indexedTargets.has(join(root, "docs", cat, name))) docsIndexed++;
    else failures.push(`index: docs/${cat}/${name} has no line in docs/README.md`);
  }
}

// ---- 2. Link integrity: relative md links resolve, fragments included. ----
// GitHub-style heading slugs, so a link may only name a section that exists.
const slugify = (heading) =>
  heading
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/[*_~]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
const normalizeFragment = (fragment) => {
  try {
    return decodeURIComponent(fragment).toLowerCase();
  } catch {
    return fragment.toLowerCase();
  }
};
// CommonMark fenced code blocks, backtick and tilde alike: up to three leading
// spaces, three or more fence characters, closed by at least as many of the
// same character (or by the end of the document). Fenced lines are blanked
// rather than removed so surviving line anchors stay intact.
function stripFences(text) {
  const lines = text.split("\n");
  let open = null;
  return lines
    .map((line) => {
      if (open === null) {
        const start = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
        // A backtick fence's info string may not itself contain a backtick.
        if (!start || (start[1][0] === "`" && start[2].includes("`"))) return line;
        open = { char: start[1][0], length: start[1].length };
        return "";
      }
      const end = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (end && end[1][0] === open.char && end[1].length >= open.length) open = null;
      return "";
    })
    .join("\n");
}
// Code spans, conservatively. The text is cut into runs of non-blank lines;
// every Markdown block lies inside 1 run, and no block crosses a line inside
// it. In each line, a run of N backticks opens a span that closes at the next
// run of exactly N backticks (CommonMark); a backtick after an odd number of
// backslashes is literal. When every backtick run of every line in the run is
// paired, and no line holds a table cell boundary or a possible HTML tag or
// autolink, those pairs are CommonMark's pairs for any split of the run into
// blocks, so the spans are dropped and a link-shaped example in them is not
// read as a link. Otherwise (a span that wraps, a literal backtick, a table
// row, inline HTML) the whole run stays as it is: its links are all checked.
// A line with another inline context in it (a GFM table cell boundary `|`,
// or a `<` that may open raw HTML or an autolink, whose attribute or URL can
// hold a literal backtick) counts as ambiguous, like an unpaired run.
const AMBIGUOUS_LINE = /(^|[^\\])(\\\\)*(\||<[A-Za-z\/!?])/;
function lineCodeSpans(line) {
  const spans = [];
  let unpaired = AMBIGUOUS_LINE.test(line) && line.includes("`");
  let i = 0;
  while (i < line.length) {
    if (line[i] !== "`") {
      i++;
      continue;
    }
    let backslashes = 0;
    while (i - backslashes - 1 >= 0 && line[i - backslashes - 1] === "\\") backslashes++;
    let opener = 0;
    while (line[i + opener] === "`") opener++;
    if (backslashes % 2 === 1) {
      // The first backtick is escaped; the rest of the run opens a span.
      i++;
      continue;
    }
    let j = i + opener;
    let closeAt = -1;
    while (j < line.length) {
      if (line[j] !== "`") {
        j++;
        continue;
      }
      let run = 0;
      while (line[j + run] === "`") run++;
      if (run === opener) {
        closeAt = j;
        break;
      }
      j += run;
    }
    if (closeAt === -1) {
      unpaired = true;
      i += opener;
      continue;
    }
    spans.push([i, closeAt + opener]);
    i = closeAt + opener;
  }
  return { spans, unpaired };
}

function stripCodeSpans(text) {
  const lines = text.split("\n");
  const out = [];
  let block = [];
  const flush = () => {
    const parsed = block.map(lineCodeSpans);
    if (parsed.some((p) => p.unpaired)) {
      out.push(...block);
    } else {
      block.forEach((line, k) => {
        let kept = "";
        let at = 0;
        for (const [from, to] of parsed[k].spans) {
          kept += line.slice(at, from);
          at = to;
        }
        out.push(kept + line.slice(at));
      });
    }
    block = [];
  };
  for (const line of lines) {
    if (line.trim() === "") {
      flush();
      out.push(line);
    } else {
      block.push(line);
    }
  }
  flush();
  return out.join("\n");
}

const anchorCache = new Map();
function anchorsOf(path) {
  const cached = anchorCache.get(path);
  if (cached) return cached;
  const anchors = new Set();
  anchorCache.set(path, anchors);
  let body;
  try {
    body = stripFences(readFileSync(path, "utf8"));
  } catch {
    return anchors; // unreadable target; the path check already reported it
  }
  const used = new Map();
  for (const m of body.matchAll(/^ {0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm)) {
    const slug = slugify(m[1]);
    if (!slug) continue;
    const seen = used.get(slug) ?? 0;
    used.set(slug, seen + 1);
    anchors.add(seen === 0 ? slug : `${slug}-${seen}`);
  }
  // Explicit HTML anchors: <a id="x">, <a name="x">, or id="x" on any tag.
  for (const m of body.matchAll(/<[^>]*\s(?:id|name)=["']([^"']+)["']/g)) {
    anchors.add(m[1].toLowerCase());
  }
  return anchors;
}
const mdFiles = [join(root, "AGENTS.md"), join(root, "README.md"), join(root, "docs/README.md")];
for (const cat of categories) {
  for (const name of readdirSync(join(root, "docs", cat))) {
    if (name.endsWith(".md") && name !== "TEMPLATE.md") mdFiles.push(join(root, "docs", cat, name));
  }
}
const skillsRoot = join(root, ".agents", "skills");
(function collectSkillDocs(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = lstatSync(path);
    if (stat.isDirectory()) collectSkillDocs(path);
    else if (name.endsWith(".md")) mdFiles.push(path);
  }
})(skillsRoot);
let linksTotal = 0;
let linksOk = 0;
for (const file of mdFiles) {
  // Strip fenced code blocks and inline code spans so example links, and
  // code such as `errors.AsType[*T](err)`, aren't checked as links.
  const text = stripCodeSpans(
    readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, ""),
  );
  const isSkillDoc = file.startsWith(skillsRoot + sep);
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = m[1];
    if (
      /^[a-z][a-z+.-]*:/i.test(target) ||
      (isSkillDoc && target.startsWith("/"))
    ) continue; // external or site-root path
    const hash = target.indexOf("#");
    const targetPath = hash === -1 ? target : target.slice(0, hash);
    const fragment = hash === -1 ? "" : normalizeFragment(target.slice(hash + 1));
    if (targetPath === "") {
      if (fragment === "") continue; // a bare "#" links nowhere in particular
      linksTotal++;
      if (anchorsOf(file).has(fragment)) linksOk++;
      else failures.push(`link: ${relative(root, file)} -> ${target} has no matching section anchor in ${relative(root, file)}`);
      continue;
    }
    linksTotal++;
    const path = resolve(dirname(file), targetPath);
    if (
      isSkillDoc &&
      path !== skillsRoot &&
      !path.startsWith(skillsRoot + sep)
    ) {
      failures.push(`link: ${relative(root, file)} -> ${target} escapes .agents/skills`);
    } else if (!existsSync(path)) {
      failures.push(`link: ${relative(root, file)} -> ${target} does not resolve`);
    } else if (fragment !== "" && path.endsWith(".md") && !anchorsOf(path).has(fragment)) {
      failures.push(`link: ${relative(root, file)} -> ${target} has no matching section anchor in ${relative(root, path)}`);
    } else linksOk++;
  }
}

// ---- 3. Symlink resolution: every repo symlink resolves inside the repo. ----
const SKIP_DIRS = new Set([".git", "node_modules", "dist"]);
const symlinks = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) symlinks.push(path);
    else if (stat.isDirectory() && !SKIP_DIRS.has(name)) walk(path);
  }
})(root);
let linksResolved = 0;
for (const path of symlinks) {
  try {
    const real = realpathSync(path);
    if (real === root || real.startsWith(root + sep)) linksResolved++;
    else failures.push(`symlink: ${relative(root, path)} escapes the repo (${real})`);
  } catch {
    failures.push(`symlink: ${relative(root, path)} is broken`);
  }
}

// ---- 4. Pinned headings: metric prose cannot drift silently (ADR-0019). ----
const metric = readFileSync(join(root, "docs/specs/pr-acceptance-metric.md"), "utf8");
for (const heading of ["## Definition", "## Rules"]) {
  if (!metric.split("\n").includes(heading)) {
    failures.push(`pin: docs/specs/pr-acceptance-metric.md is missing the "${heading}" heading`);
  }
}

// ---- Report against thresholds. ----
const results = {
  docs_index_coverage: rate(docsIndexed, docsTotal),
  link_integrity: rate(linksOk, linksTotal),
  symlink_resolution: rate(linksResolved, symlinks.length),
};
for (const failure of failures) console.error(`FAIL ${failure}`);
let ok = failures.length === 0;
for (const [key, value] of Object.entries(results)) {
  const required = thresholds[key];
  const met = value >= required;
  if (!met) ok = false;
  console.log(`${met ? "ok  " : "FAIL"} ${key}: ${value.toFixed(3)} (required ${required})`);
}
console.log(`checked: ${docsTotal} docs, ${linksTotal} links, ${symlinks.length} symlinks`);
process.exit(ok ? 0 : 1);
