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
// aren't mistaken for real links. Matches map back to the original text, where
// codeSpanRanges decides whether a match is inside inline code.
const originalIndexText = readFileSync(indexPath, "utf8");
const fenceStrippedIndex = stripWithMap(originalIndexText, /```[\s\S]*?```/g);
const commentStrippedIndex = stripWithMap(fenceStrippedIndex.text, /<!--[\s\S]*?-->/g);
const indexText = commentStrippedIndex.text;
const indexCodeSpanRanges = codeSpanRanges(originalIndexText);
const indexedTargets = new Set();
for (const m of indexText.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
  const fenceStrippedStart = commentStrippedIndex.toOriginal(m.index);
  const fenceStrippedEnd = commentStrippedIndex.toOriginal(m.index + m[0].length);
  const originalStart = fenceStrippedIndex.toOriginal(fenceStrippedStart);
  const originalEnd = fenceStrippedIndex.toOriginal(fenceStrippedEnd);
  if (
    originalEnd - originalStart === m[0].length &&
    isInCodeSpan(indexCodeSpanRanges, originalStart, originalEnd)
  ) continue;
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

// Inline code spans, as [start, end) ranges of the ORIGINAL text (never of a
// fence-stripped text: a removed chunk can join two backticks into a false
// span). CR, LF and CRLF end a line; only spaces and tabs make a blank line.
// Spans count only in a safe run of non-blank lines, so a link-shaped match is
// skipped only when CommonMark would render it as code. A run is unsafe, and
// all its links stay checked, when it has:
// - a `|` (a GFM table cell boundary splits inline contexts);
// - a backslash before a backtick (an escaped backtick is not a delimiter);
// - a `<` with a later `>` (raw HTML and autolinks bind before code spans);
// - a line with an unpaired backtick run (a span may wrap lines, or a heading
//   or other block may end it). Each line of a safe run pairs runs of equal
//   length left to right, which is CommonMark's own pairing;
// - a `](` or `][` outside a computed span, when a backtick comes later in the
//   run. The link consumes that backtick in a destination, title or reference
//   label, so it is not a span delimiter. A `](` inside a real span does not
//   trigger this rule, because it belongs to code such as `AsType[T](err)`.
function codeSpanRanges(text) {
  const lines = [];
  const lineEnding = /\r\n|\r|\n/g;
  let previousEnd = 0;
  let ending;
  while ((ending = lineEnding.exec(text)) !== null) {
    lines.push({ text: text.slice(previousEnd, ending.index), start: previousEnd });
    previousEnd = ending.index + ending[0].length;
  }
  lines.push({ text: text.slice(previousEnd), start: previousEnd });

  const ranges = [];
  let lineIndex = 0;
  while (lineIndex < lines.length) {
    if (/^[ \t]*$/.test(lines[lineIndex].text)) {
      lineIndex++;
      continue;
    }

    const runStartIndex = lineIndex;
    while (lineIndex < lines.length && !/^[ \t]*$/.test(lines[lineIndex].text)) lineIndex++;
    const runLines = lines.slice(runStartIndex, lineIndex);
    const runStart = runLines[0].start;
    const lastLine = runLines[runLines.length - 1];
    const runEnd = lastLine.start + lastLine.text.length;
    const runText = text.slice(runStart, runEnd);

    let unsafe = false;
    if (runLines.some((line) => line.text.includes("|"))) unsafe = true;
    if (!unsafe && runText.includes("\\`")) unsafe = true;

    if (!unsafe) {
      for (let i = runText.indexOf("<"); i !== -1; i = runText.indexOf("<", i + 1)) {
        if (runText.indexOf(">", i + 1) !== -1) {
          unsafe = true;
          break;
        }
      }
    }

    const runRanges = [];
    if (!unsafe) {
      for (const line of runLines) {
        let pos = 0;
        let lineUnpaired = false;
        while (pos < line.text.length) {
          if (line.text[pos] !== "`") {
            pos++;
            continue;
          }

          const opener = pos;
          while (pos < line.text.length && line.text[pos] === "`") pos++;
          const length = pos - opener;

          let search = pos;
          let closerStart = -1;
          let closerEnd = -1;
          while (search < line.text.length) {
            if (line.text[search] !== "`") {
              search++;
              continue;
            }
            const candidate = search;
            while (search < line.text.length && line.text[search] === "`") search++;
            if (search - candidate === length) {
              closerStart = candidate;
              closerEnd = search;
              break;
            }
          }

          if (closerStart === -1) {
            lineUnpaired = true;
            break;
          }

          runRanges.push([line.start + opener, line.start + closerEnd]);
          pos = closerEnd;
        }

        if (lineUnpaired) {
          unsafe = true;
          break;
        }
      }
    }

    if (!unsafe) {
      for (let i = 0; i < runText.length - 1; i++) {
        if (runText[i] !== "]") continue;
        if (runText[i + 1] !== "(" && runText[i + 1] !== "[") continue;
        const position = runStart + i;
        if (isInCodeSpan(runRanges, position, position + 1)) continue;
        if (runText.indexOf("`", i + 2) !== -1) {
          unsafe = true;
          break;
        }
      }
    }

    if (!unsafe) ranges.push(...runRanges);
  }

  return ranges;
}

function isInCodeSpan(ranges, start, end) {
  return ranges.some(([rangeStart, rangeEnd]) => rangeStart <= start && end <= rangeEnd);
}

function stripWithMap(text, regex) {
  const removedIntervals = [];
  let nextOriginal = 0;
  for (const match of text.matchAll(regex)) {
    const start = match.index;
    const end = start + match[0].length;
    if (start < nextOriginal) continue;
    removedIntervals.push([start, end]);
    nextOriginal = end;
  }

  const boundaries = [];
  let stripped = "";
  let originalCursor = 0;
  for (const [start, end] of removedIntervals) {
    const kept = text.slice(originalCursor, start);
    boundaries[stripped.length] = originalCursor;
    for (let i = 0; i < kept.length; i++) {
      stripped += kept[i];
      boundaries[stripped.length] = originalCursor + i + 1;
    }
    originalCursor = end;
  }
  const kept = text.slice(originalCursor);
  boundaries[stripped.length] = originalCursor;
  for (let i = 0; i < kept.length; i++) {
    stripped += kept[i];
    boundaries[stripped.length] = originalCursor + i + 1;
  }

  return {
    text: stripped,
    toOriginal(index) {
      return boundaries[index] ?? text.length;
    },
  };
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
const mdFiles = [
  join(root, "AGENTS.md"),
  join(root, "README.md"),
  join(root, "docs/README.md"),
  join(root, "docs/org-adrs.md"),
];
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
  // Strip fenced code blocks so example links aren't checked; a match is
  // skipped as inline code only when its original range is inside 1 span.
  const originalText = readFileSync(file, "utf8");
  const fenceStripped = stripWithMap(originalText, /```[\s\S]*?```/g);
  const text = fenceStripped.text;
  const codeSpanRangesInText = codeSpanRanges(originalText);
  const isSkillDoc = file.startsWith(skillsRoot + sep);
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const originalStart = fenceStripped.toOriginal(m.index);
    const originalEnd = fenceStripped.toOriginal(m.index + m[0].length);
    if (
      originalEnd - originalStart === m[0].length &&
      isInCodeSpan(codeSpanRangesInText, originalStart, originalEnd)
    ) continue;
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
