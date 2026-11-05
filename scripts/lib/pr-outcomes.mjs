// Pure functions behind the PR acceptance metric's revert rule and its
// escaped-defect count (docs/specs/pr-acceptance-metric.md). No I/O, no
// GitHub: an audit imports these and feeds them changes it read itself.

const DAY_MS = 86_400_000;

// --- Words ---------------------------------------------------------------

// A word is a run of letters, digits, "-" and "_" (the spec: a letter is any
// Unicode letter and a digit any Unicode number). Every word test uses that
// boundary, so "éfix" and "revertß" are 1 word each, not a fix or revert word.
const WORD_CLASS = "\\p{L}\\p{N}_-";
const REVERT_WORD = new RegExp(
  `(?<![${WORD_CLASS}])reverts?(?![${WORD_CLASS}])|(?<![${WORD_CLASS}])rever(?:ted|ting)(?![${WORD_CLASS}])`,
  "iu",
);
const REVERT_WORD_ALL = new RegExp(REVERT_WORD.source, "giu");
const FIX_WORDS = new Set([
  "fix", "fixes", "fixed", "fixing", "fixup", "hotfix", "bugfix", "bug",
  "regression", "regressed", "broke", "broken", "breaks", "breakage",
  "repair", "repairs", "repaired",
]);

function isFixWord(text) {
  return FIX_WORDS.has(String(text).toLowerCase());
}

function hasRevertWord(text) {
  return REVERT_WORD.test(String(text ?? ""));
}

// --- Times ---------------------------------------------------------------

function toDate(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value === "number") return new Date(value);
  return new Date(value === undefined || value === null ? Number.NaN : String(value));
}

function isoOrNull(date) {
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

// --- References ----------------------------------------------------------

// The 3 reference forms of the spec, matched left to right in 1 pass so the
// "owner/name#N" form is never also seen as "#N". A bare "#N" that follows a
// letter, a digit, "/" or "&" is no reference, and an "owner/name#N" that
// follows a letter, a digit, ".", "_", "-" or "/" is none.
const REFERENCE = new RegExp(
  [
    String.raw`https://github\.com/([A-Za-z0-9][A-Za-z0-9._-]*)/([A-Za-z0-9][A-Za-z0-9._-]*)/pull/(\d+)`,
    String.raw`(?<![\p{L}\p{N}._/-])([A-Za-z0-9][A-Za-z0-9._-]*)/([A-Za-z0-9][A-Za-z0-9._-]*)#(\d+)`,
    String.raw`(?<![\p{L}\p{N}/&])#(\d+)`,
  ].join("|"),
  "gu",
);

export function parseReferences(text, repository) {
  const own = String(repository ?? "").toLowerCase();
  const value = String(text ?? "");
  const found = [];
  REFERENCE.lastIndex = 0;
  let match;
  while ((match = REFERENCE.exec(value)) !== null) {
    const [, urlOwner, urlName, urlNumber, shortOwner, shortName, shortNumber, bareNumber] = match;
    const owner = urlOwner ?? shortOwner ?? null;
    const name = urlName ?? shortName ?? null;
    found.push({
      repository: owner === null ? own : `${owner}/${name}`.toLowerCase(),
      number: Number(urlNumber ?? shortNumber ?? bareNumber),
      index: match.index,
      length: match[0].length,
    });
  }
  return found;
}

// A commit whose subject ends with " (#N)" or starts with "Merge pull request
// #N" is the commit of PR N, not a change of its own.
export function prCommitNumber(subject) {
  const text = String(subject ?? "");
  const squash = / \(#(\d+)\)$/.exec(text);
  if (squash) return Number(squash[1]);
  const merge = /^Merge pull request #(\d+)(?!\d)/.exec(text);
  if (merge) return Number(merge[1]);
  return null;
}

// --- Changes -------------------------------------------------------------

function oidOf(value) {
  if (typeof value === "string") return value.trim().toLowerCase() || null;
  if (value !== null && typeof value === "object" && typeof value.oid === "string") {
    return value.oid.trim().toLowerCase() || null;
  }
  return null;
}

function branchOf(value) {
  return typeof value === "string" && value !== "" ? value : null;
}

function toChange(item) {
  if (item === null || typeof item !== "object" || Array.isArray(item)) return null;
  const kind = item.kind;
  if (kind !== "pr" && kind !== "commit") return null;
  const repository = String(item.repository ?? "").toLowerCase();
  if (repository === "") return null;
  const title = String(item.title ?? "");
  if (kind === "commit" && prCommitNumber(title) !== null) return null;
  const authorValue = item.author;
  const login = authorValue !== null && typeof authorValue === "object" ? authorValue.login : authorValue;
  const change = {
    repository,
    kind,
    title,
    body: typeof item.body === "string" ? item.body : "",
    mergedAt: toDate(item.mergedAt),
    author: String(login ?? "").toLowerCase(),
  };
  if (kind === "pr") {
    const number = Number(item.number);
    if (!Number.isFinite(number)) return null;
    const base = branchOf(item.base);
    const defaultBranch = branchOf(item.defaultBranch);
    // A PR merged into another branch than the default one is no change.
    if (base !== null && defaultBranch !== null && base !== defaultBranch) return null;
    change.number = number;
    change.mergeCommit = oidOf(item.mergeCommit);
    change.base = base;
    change.defaultBranch = defaultBranch;
  } else {
    const sha = String(item.sha ?? "");
    if (sha === "") return null;
    change.sha = sha;
  }
  return change;
}

function changeKey(change) {
  return change.kind === "pr"
    ? `${change.repository}#${change.number}`
    : `${change.repository}@${change.sha.toLowerCase()}`;
}

function prKey(repository, number) {
  return `${String(repository).toLowerCase()}#${Number(number)}`;
}

// The fields 2 records of 1 PR must agree on.
const PR_FIELDS = ["title", "body", "mergedAt", "author", "mergeCommit"];

function sameMoment(a, b) {
  const left = a.getTime();
  const right = b.getTime();
  return left === right || (Number.isNaN(left) && Number.isNaN(right));
}

function differingFields(a, b) {
  return PR_FIELDS.filter((field) => (field === "mergedAt"
    ? !sameMoment(a.mergedAt, b.mergedAt)
    : a[field] !== b[field]));
}

// 1 PR (repository and number) is 1 change, however often the input holds it;
// 2 records that disagree about the PR are an error, not a guess. A commit is
// no change of its own when its SHA is a PR's merge commit of the same input.
export function normalizeChanges(raw) {
  if (!Array.isArray(raw)) throw new TypeError("changes must be an array");
  const byKey = new Map();
  const order = [];

  for (const item of raw) {
    const change = toChange(item);
    if (change === null) continue;
    const key = changeKey(change);
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, change);
      order.push(change);
      continue;
    }
    if (change.kind !== "pr") continue;
    const fields = differingFields(existing, change);
    if (fields.length > 0) {
      throw new TypeError(`PR ${change.repository}#${change.number} has 2 records in the input that differ in ${fields.join(", ")}`);
    }
  }

  const mergeCommits = new Set();
  for (const change of order) {
    if (change.kind === "pr" && change.mergeCommit !== null) {
      mergeCommits.add(`${change.repository}@${change.mergeCommit}`);
    }
  }
  return order.filter((change) => change.kind === "pr" || !mergeCommits.has(changeKey(change)));
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function changeOrder(a, b) {
  return compareText(a.repository, b.repository)
    || compareText(a.kind, b.kind)
    || (a.kind === "pr" ? a.number - b.number : compareText(a.sha, b.sha));
}

function bySummary(change) {
  const summary = {
    repository: change.repository,
    kind: change.kind,
    title: change.title,
    mergedAt: change.mergedAt,
  };
  if (change.kind === "pr") summary.number = change.number;
  else summary.sha = change.sha;
  return summary;
}

// --- Reverts -------------------------------------------------------------

// The PR of a quoted title that merged last before the change: with 2 or more
// PRs of 1 repository holding the same title, rule 1 names only that one.
function latestBefore(candidates, change) {
  let best = null;
  for (const pr of candidates) {
    if (changeKey(pr) === changeKey(change)) continue;
    if (!(pr.mergedAt.getTime() < change.mergedAt.getTime())) continue;
    if (best === null
      || pr.mergedAt.getTime() > best.mergedAt.getTime()
      || (pr.mergedAt.getTime() === best.mergedAt.getTime() && pr.number > best.number)) {
      best = pr;
    }
  }
  return best;
}

// 1 entry per (change C, reverted PR P) pair, by the first rule that matches:
// "quoted-title", then "title", then "body". P is a merged PR in the input, C
// merges after P, and a change never reverts itself.
export function findReverts(changes) {
  const normalized = normalizeChanges(changes);
  const merged = new Map();
  for (const change of normalized) {
    if (change.kind === "pr") merged.set(prKey(change.repository, change.number), change);
  }

  // Rule 1 quotes a title and holds no reference, so it is read inside the
  // change's own repository (the GitHub "Revert" button only reverts there).
  // Identical titles keep every PR, and latestBefore picks 1 of them.
  const quoted = new Map();
  const quote = (key, pr) => {
    if (!quoted.has(key)) quoted.set(key, []);
    quoted.get(key).push(pr);
  };
  for (const pr of merged.values()) {
    quote(`${pr.repository}|Revert "${pr.title}"`, pr);
    quote(`${pr.repository}|Revert "${pr.title} (#${pr.number})"`, pr);
  }

  const found = [];
  const seen = new Set();
  const record = (change, target, rule, evidence) => {
    if (changeKey(change) === changeKey(target)) return;
    if (!(change.mergedAt.getTime() > target.mergedAt.getTime())) return;
    const key = `${changeKey(change)} -> ${changeKey(target)}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({
      reverted: { repository: target.repository, number: target.number, title: target.title },
      by: bySummary(change),
      rule,
      evidence,
    });
  };
  const resolve = (reference) => merged.get(prKey(reference.repository, reference.number)) ?? null;

  for (const change of normalized) {
    // Rule 1: C's title is Revert "T", T P's title or P's squash subject.
    const candidates = quoted.get(`${change.repository}|${change.title}`);
    if (candidates !== undefined) {
      const target = latestBefore(candidates, change);
      if (target !== null) record(change, target, "quoted-title", change.title);
    }

    // Rule 2: C's title holds a revert word and a reference to P, any order.
    if (hasRevertWord(change.title)) {
      for (const reference of parseReferences(change.title, change.repository)) {
        const target = resolve(reference);
        if (target) record(change, target, "title", change.title);
      }
    }

    // Rule 3: 1 line of C's body holds a revert word, then a reference to P.
    for (const line of bodyLines(change.body)) {
      if (!hasRevertWord(line)) continue;
      const references = parseReferences(line, change.repository);
      if (references.length === 0) continue;
      let word;
      REVERT_WORD_ALL.lastIndex = 0;
      while ((word = REVERT_WORD_ALL.exec(line)) !== null) {
        const after = word.index + word[0].length;
        for (const reference of references) {
          if (reference.index < after) continue;
          const target = resolve(reference);
          if (target) record(change, target, "body", line);
        }
      }
    }
  }

  return found.sort((a, b) =>
    changeOrder(a.by, b.by)
    || compareText(a.reverted.repository, b.reverted.repository)
    || a.reverted.number - b.reverted.number
  );
}

function bodyLines(body) {
  return String(body ?? "").split("\n");
}

// --- Names P as fixed ----------------------------------------------------

// A marker per sentence end: ".", "!", "?" or ";" followed by a space or the
// line end.
function sentenceEndLength(line, index) {
  const char = line[index];
  if (char !== "." && char !== "!" && char !== "?" && char !== ";") return 0;
  if (index + 1 === line.length || line[index + 1] === " ") return 1;
  return 0;
}

const WORD = new RegExp(`[${WORD_CLASS}]+`, "uy");

// 1 token per word, per reference and per sentence end, in order. A reference
// counts as 1 word.
function tokenizeLine(line, repository) {
  const references = parseReferences(line, repository);
  const referenceAt = new Map();
  for (const reference of references) referenceAt.set(reference.index, reference);

  const tokens = [];
  let index = 0;
  while (index < line.length) {
    const reference = referenceAt.get(index);
    if (reference) {
      tokens.push({ type: "ref", index, reference });
      index += reference.length;
      continue;
    }
    const end = sentenceEndLength(line, index);
    if (end > 0) {
      tokens.push({ type: "end", index });
      index += end;
      continue;
    }
    WORD.lastIndex = index;
    const word = WORD.exec(line);
    if (word) {
      tokens.push({ type: "word", index, text: word[0] });
      index += word[0].length;
      continue;
    }
    index += 1;
  }
  return tokens;
}

// A reference names a fix when a fix word stands at most 3 words away on
// either side and no sentence end stands between. The scan reads at most 4
// tokens each way, so 1 line is read in linear time, and namesAsFixed and the
// escaped-defect count share it.
function referenceNamesFix(tokens, position) {
  for (let offset = 1; offset <= 4; offset += 1) {
    const token = tokens[position - offset];
    if (token === undefined || token.type === "end") break;
    if (token.type === "word" && isFixWord(token.text)) return true;
  }
  for (let offset = 1; offset <= 4; offset += 1) {
    const token = tokens[position + offset];
    if (token === undefined || token.type === "end") break;
    if (token.type === "word" && isFixWord(token.text)) return true;
  }
  return false;
}

// The PRs 1 line names as fixed, 1 per reference that a fix word reaches.
function lineFixedKeys(line, repository) {
  const tokens = tokenizeLine(line, repository);
  const keys = new Set();
  tokens.forEach((token, position) => {
    if (token.type !== "ref" || !referenceNamesFix(tokens, position)) return;
    keys.add(prKey(token.reference.repository, token.reference.number));
  });
  return keys;
}

function fixMatchWhere(change, target) {
  const normalized = toChange(change);
  if (normalized === null) return null;
  const targetKey = prKey(target.repository, target.number);
  if (lineFixedKeys(normalized.title, normalized.repository).has(targetKey)) {
    return { where: "title", line: normalized.title };
  }
  for (const line of bodyLines(normalized.body)) {
    if (lineFixedKeys(line, normalized.repository).has(targetKey)) return { where: "body", line };
  }
  return null;
}

export function namesAsFixed(change, target) {
  const match = fixMatchWhere(change, target);
  return match === null ? null : match.line;
}

// Every PR a change names as fixed, 1 entry per (line, PR) match. Used by the
// escaped-defect count in 1 pass over the changes.
function fixedTargets(change) {
  const matches = [];
  const lines = [["title", change.title], ...bodyLines(change.body).map((line) => ["body", line])];
  for (const [where, line] of lines) {
    for (const key of lineFixedKeys(line, change.repository)) matches.push({ key, where, line });
  }
  return matches;
}

// --- Escaped defects -----------------------------------------------------

function requireDate(value, name) {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${name} must be a date or a date string`);
  return date;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort(compareText);
}

// The escaped-defect count of the spec: the cohort's PRs merged in [from, to)
// by the given authors, and each PR that a change merged in (P, P + 7 days]
// reverts or names as fixed.
export function escapedDefects(changes, options = {}) {
  const from = requireDate(options.from, "from");
  const to = requireDate(options.to, "to");
  const asOf = requireDate(options.asOf, "asOf");
  const authors = uniqueSorted((options.authors ?? ["frostyard-machines"]).map((author) => String(author).toLowerCase()));
  const repositories = options.repositories === undefined || options.repositories === null
    ? null
    : uniqueSorted(options.repositories.map((repository) => String(repository).toLowerCase()));

  const normalized = normalizeChanges(changes);
  const complete = asOf.getTime() >= to.getTime() + 7 * DAY_MS;

  const cohort = normalized.filter((change) =>
    change.kind === "pr"
    && authors.includes(change.author)
    && change.mergedAt.getTime() >= from.getTime()
    && change.mergedAt.getTime() < to.getTime()
    && (repositories === null || repositories.includes(change.repository))
  );

  const reverts = findReverts(normalized);
  const byTarget = new Map();
  for (const revert of reverts) {
    const key = prKey(revert.reverted.repository, revert.reverted.number);
    if (!byTarget.has(key)) byTarget.set(key, []);
    byTarget.get(key).push({ kindOfMatch: "revert", change: revert.by, rule: revert.rule, evidence: revert.evidence });
  }
  const fixes = new Map();
  for (const change of normalized) {
    for (const match of fixedTargets(change)) {
      if (!fixes.has(match.key)) fixes.set(match.key, []);
      fixes.get(match.key).push({ kindOfMatch: "fix", change, rule: match.where, evidence: match.line });
    }
  }

  const items = [];
  const seen = new Set();
  for (const pr of cohort) {
    const key = prKey(pr.repository, pr.number);
    if (seen.has(key)) continue;
    const windowEnd = pr.mergedAt.getTime() + 7 * DAY_MS;
    const matches = [...(byTarget.get(key) ?? []), ...(fixes.get(key) ?? [])]
      .filter((match) => {
        const at = match.change.mergedAt.getTime();
        return at > pr.mergedAt.getTime() && at <= windowEnd;
      })
      .map((match) => {
        const entry = {
          repository: match.change.repository,
          kind: match.change.kind,
          kind_of_match: match.kindOfMatch,
          rule: match.rule,
          evidence: match.evidence,
        };
        if (match.change.kind === "pr") entry.number = match.change.number;
        else entry.sha = match.change.sha;
        entry.title = match.change.title;
        return entry;
      })
      .sort(compareMatches);
    if (matches.length === 0) continue;
    seen.add(key);
    items.push({
      repository: pr.repository,
      number: pr.number,
      title: pr.title,
      mergedAt: pr.mergedAt,
      by: matches,
    });
  }

  items.sort((a, b) => compareText(a.repository, b.repository) || a.number - b.number);

  return {
    from: isoOrNull(from),
    to: isoOrNull(to),
    as_of: isoOrNull(asOf),
    complete,
    authors,
    repositories,
    merged: cohort.length,
    escaped: items.length,
    rate: complete && cohort.length > 0 ? items.length / cohort.length : null,
    items,
  };
}

function compareMatches(a, b) {
  const rank = { revert: 0, fix: 1 };
  return compareText(a.repository, b.repository)
    || compareText(a.kind, b.kind)
    || (a.kind === "pr" ? a.number - b.number : compareText(a.sha, b.sha))
    || (rank[a.kind_of_match] ?? 2) - (rank[b.kind_of_match] ?? 2)
    || compareText(a.kind_of_match, b.kind_of_match)
    || compareText(a.rule, b.rule)
    || compareText(a.evidence, b.evidence);
}
