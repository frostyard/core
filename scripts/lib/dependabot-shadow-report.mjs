// The rules of the Dependabot shadow report (docs/design/dependabot-shadow.md,
// section "Measurement"): the class of 1 call, the class of 1 pull request,
// the F4 lines of the report issue, the missed and "no metadata" lists, the
// levels table, and the Markdown output. Pure functions only: no I/O, no `gh`,
// no clock (the time comes in as an argument). The CLI that reads GitHub is
// scripts/dependabot-shadow-report.mjs; it builds 1 record for each repository
// and this file reads only that record.
//
// The marker constants and the author of a call comment come from
// scripts/lib/pr-triage.mjs, so the report and the step can never disagree on
// them. That file runs `main` only from its own entry point, so importing it
// has no side effect; `test/dependabot-shadow-report.test.mjs` holds the
// round trip.
import { SHADOW_AUTHOR, SHADOW_MARKER_PREFIX } from "./pr-triage.mjs";

export { SHADOW_AUTHOR, SHADOW_MARKER_PREFIX };

export const PASS_CONCLUSIONS = Object.freeze(["success", "neutral", "skipped"]);
export const DEPENDABOT = "dependabot[bot]";
export const PR_TRIAGE_JOB_PREFIX = "pr-triage";
export const METADATA_STEP = "Fetch the Dependabot metadata";
export const MIN_CALLS = 10;
export const REVERT_DAYS = 7;
// Who may write an F4 line when --f4-author is not given.
export const DEFAULT_F4_AUTHORS = Object.freeze(["bketelsen", "frostyard-machines"]);

const DAY_MS = 86_400_000;
const LEVEL_NAMES = ["L1", "L2", "L3", "L4"];
const LEVEL_LABELS = new Map(LEVEL_NAMES.map((name) => [`level:${name}`, name]));
// A PR with no level label is the loosest there is.
const LEVEL_RANK = new Map([...LEVEL_NAMES.map((name, index) => [name, index + 1]), ["none", LEVEL_NAMES.length + 1]]);
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const MARKER_PATTERN = /^<!-- frostyard:dependabot-shadow v1 head=([0-9a-f]{40}) level=L([1-4]) checks=(\[.*\]) -->$/;
const F4_LINE_PATTERN = /^false:\s+(?:([A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*))?#(\d+)\s+(\S.*)$/;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ---- Time -----------------------------------------------------------------

// The instant of a GitHub timestamp, or NaN. Every window test uses the UTC
// instant of a stamp, never a local time.
export function timeOf(value) {
  if (typeof value !== "string" || value === "") return Number.NaN;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

// A strict calendar day: 4 digits, 2 digits, 2 digits, and a real date.
export function isDay(value) {
  if (typeof value !== "string" || !DAY_PATTERN.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(ms)) return false;
  return new Date(ms).toISOString().slice(0, 10) === value;
}

// The window [since T00:00:00Z, (until + 1 day) T00:00:00Z): both days are in.
export function windowRange(since, until) {
  if (!isDay(since)) throw new RangeError(`invalid date for --since: ${String(since)} (want YYYY-MM-DD)`);
  if (!isDay(until)) throw new RangeError(`invalid date for --until: ${String(until)} (want YYYY-MM-DD)`);
  const start = Date.parse(`${since}T00:00:00Z`);
  const end = Date.parse(`${until}T00:00:00Z`) + DAY_MS;
  if (end <= start) throw new RangeError(`--since ${since} is after --until ${until}`);
  return { start, end, since, until };
}

function inWindow(range, value) {
  const ms = timeOf(value);
  return Number.isFinite(ms) && ms >= range.start && ms < range.end;
}

export function short(value) {
  return String(value ?? "").slice(0, 12);
}

// A title or a reason from GitHub must not carry a control character into the
// output.
function clean(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").trim();
}

// ---- Calls ----------------------------------------------------------------

// The marker line of 1 comment, as 1 call, or null when the comment is not a
// call: another author, no marker line, bad JSON, a head that is not 40 hex.
export function parseCall(comment) {
  if (comment?.user?.login !== SHADOW_AUTHOR) return null;
  const number = Number(comment?.number);
  if (!Number.isSafeInteger(number) || number <= 0) return null;
  const body = typeof comment?.body === "string" ? comment.body : "";
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith(SHADOW_MARKER_PREFIX)) continue;
    const match = MARKER_PATTERN.exec(line);
    if (!match) continue;
    let parsed;
    try {
      parsed = JSON.parse(match[3]);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    const checks = [];
    let good = true;
    for (const entry of parsed) {
      const context = entry?.context;
      const integration = entry?.integration_id ?? null;
      const integrationGood = integration === null || Number.isSafeInteger(integration);
      if (typeof context !== "string" || context === "" || !integrationGood) {
        good = false;
        break;
      }
      checks.push({ context, integration_id: integration });
    }
    if (!good) continue;
    if (!SHA_PATTERN.test(match[1])) continue;
    return {
      id: comment?.id ?? null,
      number,
      head: match[1],
      level: `L${match[2]}`,
      checks,
      created_at: comment?.created_at ?? null,
    };
  }
  return null;
}

// Every call of 1 record, oldest first.
export function parseCalls(record) {
  const calls = [];
  for (const comment of record?.comments ?? []) {
    const call = parseCall(comment);
    if (call !== null) calls.push(call);
  }
  return calls.sort((a, b) => {
    const at = timeOf(a.created_at);
    const bt = timeOf(b.created_at);
    if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
    if (Number.isFinite(at) && !Number.isFinite(bt)) return -1;
    if (!Number.isFinite(at) && Number.isFinite(bt)) return 1;
    const ai = Number.isFinite(Number(a.id)) ? Number(a.id) : 0;
    const bi = Number.isFinite(Number(b.id)) ? Number(b.id) : 0;
    return ai - bi;
  });
}

// The calls of 1 number that are in the window.
export function callsInWindow(calls, range) {
  return calls.filter((call) => inWindow(range, call.created_at));
}

// ---- Check results --------------------------------------------------------

// A rerun replaces the earlier run: the latest started_at wins (tie: higher id).
function laterRun(a, b) {
  const at = timeOf(a?.started_at);
  const bt = timeOf(b?.started_at);
  const av = Number.isFinite(at) ? at : Number.NEGATIVE_INFINITY;
  const bv = Number.isFinite(bt) ? bt : Number.NEGATIVE_INFINITY;
  if (av !== bv) return av < bv ? -1 : 1;
  const ai = Number.isFinite(Number(a?.id)) ? Number(a.id) : 0;
  const bi = Number.isFinite(Number(b?.id)) ? Number(b.id) : 0;
  return ai === bi ? 0 : ai < bi ? -1 : 1;
}

function latestStatus(statuses) {
  let best = statuses[0];
  for (const status of statuses) {
    if (timeOf(status?.updated_at) >= timeOf(best?.updated_at)) best = status;
  }
  return best;
}

// 1 recorded check at 1 sha: the latest check run of that name, from the
// recorded app when the marker names 1, else the commit status of that context.
export function checkResult(record, sha, check) {
  const context = String(check?.context ?? "");
  const integration = check?.integration_id ?? null;
  const key = String(sha ?? "");
  const runs = (record?.checkRuns?.[key] ?? []).filter(
    (run) => run?.name === context && (integration === null || run?.app?.id === integration),
  );
  if (runs.length > 0) {
    const run = runs.reduce((best, candidate) => (laterRun(candidate, best) > 0 ? candidate : best));
    if (run.status !== "completed") {
      return { result: "unknown", at: null, source: `check run ${run.id} (${String(run.status ?? "no status")})` };
    }
    if (PASS_CONCLUSIONS.includes(run.conclusion)) {
      return { result: "pass", at: run.completed_at ?? null, source: `check run ${run.id}` };
    }
    return { result: "fail", at: run.completed_at ?? null, source: `check run ${run.id} (${String(run.conclusion ?? "no conclusion")})` };
  }
  const statuses = (record?.statuses?.[key] ?? []).filter((status) => status?.context === context);
  if (statuses.length > 0) {
    const status = latestStatus(statuses);
    if (status.state === "success") return { result: "pass", at: status.updated_at ?? null, source: "commit status" };
    if (status.state === "failure" || status.state === "error") {
      return { result: "fail", at: status.updated_at ?? null, source: `commit status (${String(status.state)})` };
    }
    return { result: "unknown", at: null, source: `commit status (${String(status.state ?? "no state")})` };
  }
  return { result: "unknown", at: null, source: "no result" };
}

// The result of every check that the marker of 1 call records.
export function checkResultsFor(record, call) {
  return (call?.checks ?? []).map((check) => ({
    context: check.context,
    integration_id: check.integration_id ?? null,
    ...checkResult(record, call.head, check),
  }));
}

// ---- Class of 1 call ------------------------------------------------------

// The bounds of the push time of 1 commit SHA. No timestamp the record holds is
// the push itself, so the record gives 2 bounds:
// - the commit date is the earliest push time (a commit is pushed after it is
//   made), NaN when the event holds no date;
// - the first pr-triage run at that SHA is the latest push time, because that
//   workflow runs only on pull_request_target events, so its run came after the
//   SHA became a pull request head. A run of another name can come from another
//   branch, so it does not count. Infinity when the record holds no such run.
function pushBoundsOf(record, sha) {
  let upper = Number.POSITIVE_INFINITY;
  for (const run of record?.checkRuns?.[String(sha ?? "")] ?? []) {
    if (!String(run?.name ?? "").startsWith(PR_TRIAGE_JOB_PREFIX)) continue;
    const ms = timeOf(run?.started_at);
    if (Number.isFinite(ms) && ms < upper) upper = ms;
  }
  return { upper };
}

// An instant as an ISO stamp, or null.
const isoOf = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z") : null);

// The times the head moved away from the call head: known move times, and the
// commits that moved it with the bounds of their push time.
function movesOf(record, call, allCalls) {
  const createdMs = timeOf(call.created_at);
  const moves = [];
  const committed = [];
  for (const other of allCalls ?? []) {
    if (other === call) continue;
    // 1 comment is 1 call: a known id names it, and an unknown id cannot.
    if (call.id !== null && other?.id === call.id) continue;
    if (other?.number !== call.number) continue;
    if (other?.head === call.head) continue;
    const at = timeOf(other?.created_at);
    if (Number.isFinite(at) && at > createdMs) moves.push(at);
  }
  const timeline = record?.timelines?.[String(call.number)] ?? [];
  for (const event of timeline) {
    if (event?.event !== "head_ref_force_pushed") continue;
    const at = timeOf(event?.created_at);
    if (Number.isFinite(at) && at > createdMs) moves.push(at);
  }
  // A commit that another commit follows in timeline order moved the head; with
  // no committed event for the call head, a later commit date did.
  const callIndex = timeline.findIndex((event) => event?.event === "committed" && event?.sha === call.head);
  timeline.forEach((event, index) => {
    if (event?.event !== "committed") return;
    if (event?.sha === call.head) return;
    const committedAt = timeOf(event?.committer?.date);
    if (callIndex >= 0) {
      if (index <= callIndex) return;
    } else if (!(Number.isFinite(committedAt) && committedAt > createdMs)) {
      return;
    }
    const sha = String(event?.sha ?? "");
    committed.push({ sha, lower: committedAt, ...pushBoundsOf(record, sha) });
  });
  return { moves, committed };
}

// The class of 1 call and, when the class needs it, the reason why. allCalls is
// every call of the same repository.
export function classifyCallWithReason(record, call, allCalls = []) {
  const results = checkResultsFor(record, call);
  let passedAt;
  if (results.length === 0) {
    // No recorded check: nothing passed, so the head cannot have moved before
    // the checks passed. Class 3 (unknown) then holds.
    passedAt = Number.NEGATIVE_INFINITY;
  } else if (results.every((result) => result.result === "pass")) {
    passedAt = results.reduce((max, result) => {
      const ms = timeOf(result.at);
      return Number.isFinite(ms) ? Math.max(max, ms) : max;
    }, Number.NEGATIVE_INFINITY);
  } else {
    passedAt = Number.POSITIVE_INFINITY;
  }
  const { moves, committed } = movesOf(record, call, allCalls);
  const movedAt = moves.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...moves);
  // A known move time before the pass is proof.
  if (movedAt < passedAt) return { class: "superseded", reason: null };

  // A committed move: the bounds of its push time decide.
  const proven = [];
  const uncertain = [];
  for (const move of committed) {
    if (passedAt === Number.POSITIVE_INFINITY) {
      // The checks never all passed, and the head moved after the call: no time
      // is needed, the move proves superseded.
      proven.push(move);
    } else if (move.upper < passedAt) {
      proven.push(move);
    } else if (Number.isFinite(move.lower) && move.lower >= passedAt) {
      // The commit was made after the pass, so the push came after it too.
      continue;
    } else {
      uncertain.push(move);
    }
  }
  if (proven.length > 0) {
    return {
      class: "superseded",
      reason: `superseded: the head moved to ${short(proven[0].sha)}, at or before ${isoOf(proven[0].upper) ?? "an unknown time"}, before the recorded checks passed`,
    };
  }
  if (uncertain.length > 0) {
    const move = uncertain[0];
    return {
      class: "unknown",
      reason: `unknown: the head moved to ${short(move.sha)} between ${isoOf(move.lower) ?? "an unknown time"} and ${isoOf(move.upper) ?? "an unknown time"}, and the recorded checks passed at ${isoOf(passedAt) ?? "an unknown time"}`,
    };
  }
  if (results.some((result) => result.result === "fail")) return { class: "waited", reason: null };
  if (results.length === 0 || results.some((result) => result.result === "unknown")) return { class: "unknown", reason: null };
  return { class: "would-have-merged", reason: null };
}

// The class of 1 call: superseded, waited, unknown, or would-have-merged.
export function classifyCall(record, call, allCalls = []) {
  return classifyCallWithReason(record, call, allCalls).class;
}

// ---- Class of 1 pull request ----------------------------------------------

const isMerged = (pull) => Number.isFinite(timeOf(pull?.merged_at ?? null));

// A pull request whose title starts with "Revert" and names #<n>, merged within
// REVERT_DAYS days after this one.
function revertOf(record, pull, mergedMs) {
  const pattern = new RegExp(`#${pull.number}(?!\\d)`);
  for (const other of record?.pulls ?? []) {
    if (typeof other?.title !== "string" || !other.title.startsWith("Revert")) continue;
    if (!pattern.test(other.title)) continue;
    const otherMs = timeOf(other?.merged_at ?? null);
    if (!Number.isFinite(otherMs)) continue;
    const distance = otherMs - mergedMs;
    if (distance >= 0 && distance <= REVERT_DAYS * DAY_MS) return other;
  }
  return null;
}

// Author of a commit: the linked login, else the name the commit records.
function commitAuthor(commit) {
  const login = commit?.author?.login;
  if (typeof login === "string" && login !== "") return login;
  const name = commit?.commit?.author?.name;
  return typeof name === "string" ? name : "";
}

// The first commit of the pull request that Dependabot did not write.
function foreignCommit(record, number) {
  for (const commit of record?.commits?.[String(number)] ?? []) {
    const author = commitAuthor(commit);
    if (author !== DEPENDABOT) return { commit, author };
  }
  return null;
}

function lastEventActor(record, number, name) {
  const timeline = record?.timelines?.[String(number)] ?? [];
  let actor = null;
  for (const event of timeline) {
    if (event?.event !== name) continue;
    actor = event?.actor?.login ?? "";
  }
  return actor;
}

// The class of 1 pull request, from its last would-have-merged call, plus a
// note when its revert window is still open. f4 is the applied F4 line of this
// pull request, or null.
export function classifyPull(record, pull, lastWhmCall, f4 = null, options = {}) {
  const notes = [];
  const asOfMs = timeOf(options?.asOf ?? null);
  const mergedMs = timeOf(pull?.merged_at ?? null);
  const merged = Number.isFinite(mergedMs);
  if (merged && Number.isFinite(asOfMs) && mergedMs + REVERT_DAYS * DAY_MS > asOfMs) {
    notes.push("revert window still open");
  }

  if (merged) {
    const revert = revertOf(record, pull, mergedMs);
    if (revert !== null) {
      const days = Math.floor((timeOf(revert.merged_at) - mergedMs) / DAY_MS);
      return { class: "F2", detail: `revert #${revert.number} merged ${days} day(s) after the merge`, notes };
    }
    for (const check of lastWhmCall?.checks ?? []) {
      const result = checkResult(record, pull?.merge_commit_sha ?? null, check);
      if (result.result === "fail") {
        return {
          class: "F2",
          detail: `recorded check \`${clean(check.context)}\` failed at the merge commit ${short(pull?.merge_commit_sha)} (${result.source})`,
          notes,
        };
      }
    }
    const foreign = foreignCommit(record, pull.number);
    if (foreign !== null) {
      return {
        class: "F3",
        detail: `commit ${short(foreign.commit?.sha)} was written by ${clean(foreign.author === "" ? "an unknown author" : foreign.author)}`,
        notes,
      };
    }
  }

  if (pull?.state === "closed" && !merged) {
    const closer = lastEventActor(record, pull.number, "closed");
    if (closer !== DEPENDABOT) {
      return {
        class: "F1",
        detail: closer === null ? "closed with no closed event to name the actor" : `closed by ${clean(closer)}`,
        notes,
      };
    }
  }

  if (f4 !== null && f4 !== undefined) {
    return { class: "F4", detail: `owner line "false: ${clean(f4.reason)}"`, notes };
  }
  const detail = merged
    ? "merged with Dependabot commits only, no revert and no failed check at the merge commit"
    : pull?.state === "closed"
      ? "closed by dependabot[bot] without a merge"
      : "still open";
  return { class: "agreed", detail, notes };
}

// ---- F4 lines -------------------------------------------------------------

// Every line of the report issue that may set a class, resolved against the
// pull requests this report classed. authors: the allowed logins. repos: the
// report repositories, to name a bare #<n>. classed: [{ repo, number, class }].
export function parseF4(issueComments, authors = DEFAULT_F4_AUTHORS, repos = [], classed = []) {
  const allowed = new Set(authors ?? []);
  const known = new Map();
  for (const entry of classed ?? []) {
    known.set(`${entry.repo}#${entry.number}`, entry.class);
  }
  const lines = [];
  for (const comment of issueComments ?? []) {
    const login = comment?.user?.login;
    if (!allowed.has(login)) continue;
    for (const raw of String(comment?.body ?? "").split(/\r?\n/)) {
      const text = raw.trim();
      if (!text.startsWith("false:")) continue;
      const match = F4_LINE_PATTERN.exec(text);
      if (match === null) continue;
      lines.push({
        repo: match[1] ?? null,
        number: Number(match[2]),
        reason: match[3].trim(),
        author: login,
        created_at: comment?.created_at ?? null,
        text,
      });
    }
  }

  const reportRepos = [...new Set(repos ?? [])];
  return lines.map((line) => {
    const resolved = { ...line };
    let targets;
    if (line.repo !== null) {
      if (!reportRepos.includes(line.repo)) {
        resolved.status = "not-applied";
        resolved.why = `${line.repo} is not a repository of this report`;
        return resolved;
      }
      targets = [line.repo];
    } else {
      targets = reportRepos.filter((repo) => known.has(`${repo}#${line.number}`));
      if (targets.length > 1) {
        resolved.status = "ambiguous";
        resolved.why = `#${line.number} is classed in ${targets.join(", ")}; name the repository`;
        resolved.repos = targets;
        return resolved;
      }
      if (targets.length === 0) {
        resolved.status = "not-applied";
        resolved.why = `no classed pull request #${line.number} in this report`;
        return resolved;
      }
    }
    resolved.repo = targets[0];
    const pullClass = known.get(`${resolved.repo}#${line.number}`);
    if (pullClass === undefined) {
      resolved.status = "not-applied";
      resolved.why = `#${line.number} is not classed: it has no would-have-merged call in the window`;
      return resolved;
    }
    if (pullClass !== "agreed") {
      resolved.status = "not-applied";
      resolved.why = `#${line.number} is classed ${pullClass}, not agreed`;
      return resolved;
    }
    resolved.status = "applied";
    return resolved;
  });
}

// ---- Derived lists --------------------------------------------------------

// The required status checks of 1 branch rule list.
export function requiredChecksOf(rules) {
  const checks = [];
  const seen = new Set();
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (rule?.type !== "required_status_checks") continue;
    const required = rule?.parameters?.required_status_checks;
    if (!Array.isArray(required)) continue;
    for (const entry of required) {
      const context = String(entry?.context ?? "");
      const integration = typeof entry?.integration_id === "number" ? entry.integration_id : null;
      const key = JSON.stringify([context, integration]);
      if (seen.has(key)) continue;
      seen.add(key);
      checks.push({ context, integration_id: integration });
    }
  }
  return checks;
}

export const isDependabotPull = (pull) => pull?.user?.login === DEPENDABOT;

export function callsOnPull(calls, number) {
  return (calls ?? []).filter((call) => call.number === number);
}

// The pr-triage check run of 1 head whose "Fetch the Dependabot metadata" step
// failed, or null.
export function noMetadataRun(record, pull) {
  const head = String(pull?.head?.sha ?? "");
  for (const run of record?.checkRuns?.[head] ?? []) {
    if (!String(run?.name ?? "").startsWith(PR_TRIAGE_JOB_PREFIX)) continue;
    const steps = record?.jobs?.[String(run.id)]?.steps ?? [];
    if (steps.some((step) => step?.name === METADATA_STEP && step?.conclusion === "failure")) return run;
  }
  return null;
}

// "No metadata": a Dependabot pull request of the window with no call at any
// head, whose metadata step failed. It is never a call and never missed.
export function noMetadataPull(record, pull, calls, range) {
  if (!isDependabotPull(pull)) return null;
  if (!inWindow(range, pull?.created_at) && !inWindow(range, pull?.merged_at)) return null;
  if (callsOnPull(calls, pull.number).length > 0) return null;
  const run = noMetadataRun(record, pull);
  return run === null ? null : { run };
}

// Missed (value only): a Dependabot pull request that merged in the window with
// Dependabot commits only, no call at any head, no failed metadata step, and
// every required check of its base branch green at its head. The required
// checks are read on the report day, because a missed pull request has no
// marker to carry them.
export function missedPull(record, pull, calls, range) {
  if (!isDependabotPull(pull)) return null;
  const mergedMs = timeOf(pull?.merged_at ?? null);
  if (!Number.isFinite(mergedMs) || mergedMs < range.start || mergedMs >= range.end) return null;
  if (callsOnPull(calls, pull.number).length > 0) return null;
  if (foreignCommit(record, pull.number) !== null) return null;
  if (noMetadataRun(record, pull) !== null) return null;
  const checks = record?.requiredChecks?.[String(pull?.base?.ref ?? "")] ?? [];
  if (checks.length === 0) return null;
  const results = checks.map((check) => ({
    context: check.context,
    integration_id: check.integration_id ?? null,
    ...checkResult(record, pull?.head?.sha ?? "", check),
  }));
  if (!results.every((result) => result.result === "pass")) return null;
  return { checks: results };
}

// ---- Levels ---------------------------------------------------------------

// The strictest level label of 1 pull request, or "none".
export function levelOfPull(pull) {
  let best = "none";
  for (const label of pull?.labels ?? []) {
    const name = typeof label === "string" ? label : label?.name;
    const level = LEVEL_LABELS.get(name);
    if (level === undefined) continue;
    if (LEVEL_RANK.get(level) < LEVEL_RANK.get(best)) best = level;
  }
  return best;
}

// Did a person or an agent take a stricter level label off this pull request?
function isLowered(record, pull) {
  const current = levelOfPull(pull);
  const currentRank = LEVEL_RANK.get(current);
  return (record?.labelEvents ?? []).some((event) => {
    if (event?.event !== "unlabeled") return false;
    if (Number(event?.number) !== Number(pull?.number)) return false;
    if (event?.actor === SHADOW_AUTHOR) return false;
    const level = LEVEL_LABELS.get(event?.label);
    if (level === undefined) return false;
    return LEVEL_RANK.get(level) < currentRank;
  });
}

// ---- The report -----------------------------------------------------------

const emptyCalls = () => ({ superseded: 0, waited: 0, unknown: 0, wouldHaveMerged: 0, total: 0 });
const emptyPulls = () => ({ F2: 0, F3: 0, F1: 0, F4: 0, agreed: 0 });

// 1 report over the records that the CLI (or --input) read.
export function buildReport({ since, until, records = [], issueComments = null, f4Authors = DEFAULT_F4_AUTHORS, asOf = null, errors = [] } = {}) {
  const range = windowRange(since, until);
  const repoRows = [];
  const details = [];
  const missed = [];
  const noMetadata = [];
  const levels = [];
  const allErrors = [];
  const classed = [];
  const classedPulls = new Map();
  const totals = { calls: emptyCalls(), pulls: emptyPulls() };

  for (const record of records ?? []) {
    const repo = String(record?.repo ?? "");
    const calls = parseCalls(record);
    const windowedCalls = callsInWindow(calls, range);
    const counts = emptyCalls();
    const pullCounts = emptyPulls();
    const callsByNumber = new Map();
    for (const call of windowedCalls) {
      const outcome = classifyCallWithReason(record, call, calls);
      const classOf = outcome.class;
      counts.total += 1;
      if (classOf === "would-have-merged") counts.wouldHaveMerged += 1;
      else if (classOf === "superseded") counts.superseded += 1;
      else if (classOf === "waited") counts.waited += 1;
      else counts.unknown += 1;
      if (!callsByNumber.has(call.number)) callsByNumber.set(call.number, []);
      callsByNumber.get(call.number).push({
        head: call.head,
        created_at: call.created_at,
        class: classOf,
        reason: outcome.reason,
        checks: checkResultsFor(record, call),
      });
    }

    // The last would-have-merged call of each pull request, by created_at.
    const lastWhm = new Map();
    for (const call of windowedCalls) {
      if (classifyCall(record, call, calls) !== "would-have-merged") continue;
      const known = lastWhm.get(call.number);
      if (known === undefined || timeOf(call.created_at) >= timeOf(known.created_at)) lastWhm.set(call.number, call);
    }

    const detailRows = new Map();
    for (const [number, callRows] of callsByNumber) {
      const pull = record?.pulls?.find((entry) => Number(entry?.number) === Number(number));
      detailRows.set(number, { repo, number, title: clean(pull?.title ?? ""), calls: callRows, pull: null });
    }
    for (const [number, call] of [...lastWhm].sort((a, b) => a[0] - b[0])) {
      const pull = record?.pulls?.find((entry) => Number(entry?.number) === Number(number))
        ?? { number, title: "", state: "open", merged_at: null, labels: [] };
      const base = classifyPull(record, pull, call, null, { asOf });
      classed.push({ repo, number, class: base.class });
      classedPulls.set(`${repo}#${number}`, { repo, number, record, pull, base, call });
      detailRows.get(number).pull = base;
    }
    details.push(...[...detailRows.values()].sort((a, b) => a.number - b.number));

    for (const pull of record?.pulls ?? []) {
      const miss = missedPull(record, pull, calls, range);
      if (miss !== null) {
        missed.push({
          repo,
          number: pull.number,
          title: clean(pull.title),
          merged_at: pull.merged_at,
          merge_commit_sha: pull?.merge_commit_sha ?? null,
          checks: miss.checks,
        });
        continue;
      }
      const noMeta = noMetadataPull(record, pull, calls, range);
      if (noMeta !== null) {
        noMetadata.push({
          repo,
          number: pull.number,
          title: clean(pull.title),
          created_at: pull?.created_at ?? null,
          merged_at: pull?.merged_at ?? null,
          check_run: noMeta.run.id,
        });
      }
    }

    const opened = (record?.pulls ?? []).filter((pull) => inWindow(range, pull?.created_at));
    const row = { repo, opened: opened.length, L1: 0, L2: 0, L3: 0, L4: 0, none: 0, lowered: 0 };
    for (const pull of opened) {
      row[levelOfPull(pull)] += 1;
      if (isLowered(record, pull)) row.lowered += 1;
    }
    levels.push(row);

    repoRows.push({ repo, calls: counts, pulls: pullCounts });
    callTotalsInto(totals.calls, counts);
  }

  // F4: the pull request classes are known, so a line can be applied or listed.
  const repoList = repoRows.map((row) => row.repo);
  const f4Lines = parseF4(issueComments, f4Authors, repoList, classed);
  const f4 = { applied: [], notApplied: [], ambiguous: [] };
  for (const line of f4Lines) {
    if (line.status === "ambiguous") f4.ambiguous.push(line);
    else if (line.status === "applied") f4.applied.push(line);
    else f4.notApplied.push(line);
  }
  for (const line of f4.applied) {
    const entry = classedPulls.get(`${line.repo}#${line.number}`);
    if (entry === undefined) continue;
    const final = classifyPull(entry.record, entry.pull, entry.call, line, { asOf });
    entry.base = final;
    for (const detail of details) {
      if (detail.repo === line.repo && Number(detail.number) === Number(line.number)) detail.pull = final;
    }
  }
  for (const entry of classedPulls.values()) {
    const row = repoRows.find((candidate) => candidate.repo === entry.repo);
    if (row === undefined) continue;
    row.pulls[entry.base.class] += 1;
    totals.pulls[entry.base.class] += 1;
  }

  for (const record of records ?? []) {
    for (const error of record?.errors ?? []) allErrors.push(`${String(record?.repo ?? "")}: ${clean(error)}`);
  }
  for (const error of errors ?? []) allErrors.push(clean(error));

  return {
    since,
    until,
    asOf,
    repos: repoRows,
    totals,
    details,
    missed,
    noMetadata,
    levels,
    f4,
    errors: allErrors,
    verdict: {
      wouldHaveMerged: totals.calls.wouldHaveMerged,
      tooFew: totals.calls.wouldHaveMerged < MIN_CALLS,
      f2: totals.pulls.F2,
      f3: totals.pulls.F3,
      f1PlusF4: totals.pulls.F1 + totals.pulls.F4,
    },
  };
}

function callTotalsInto(target, counts) {
  target.superseded += counts.superseded;
  target.waited += counts.waited;
  target.unknown += counts.unknown;
  target.wouldHaveMerged += counts.wouldHaveMerged;
  target.total += counts.total;
}

// ---- Markdown -------------------------------------------------------------

function table(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((cells) => `| ${cells.join(" | ")} |`),
  ];
}

const bullet = (text) => `- ${text}`;

function f4LineText(line) {
  const target = line.repo === null ? `#${line.number}` : `${line.repo}#${line.number}`;
  const parts = [`${target} by ${clean(line.author)}: ${clean(line.reason)}`];
  if (line.status === "not-applied") parts.push(`(${clean(line.why)})`);
  if (line.status === "ambiguous") parts.push(`(${clean(line.why)})`);
  return parts.join(" ");
}

// The Markdown report, in the order that the measurement reads it.
export function formatReport(report) {
  const lines = [];
  lines.push("# Dependabot shadow report", "");
  lines.push(`Window: ${report.since} to ${report.until} (UTC, inclusive)`, "");
  lines.push("Read only: this report enables no auto-merge, approves nothing, merges nothing and labels nothing.", "");

  const verdict = report.verdict;
  lines.push("## Verdict", "");
  lines.push(bullet(`Would-have-merged calls: ${verdict.wouldHaveMerged}`));
  if (verdict.tooFew) lines.push(bullet(`too few (fewer than ${MIN_CALLS})`));
  lines.push(bullet(`Safety: F2 = ${verdict.f2}, F3 = ${verdict.f3}`));
  lines.push(bullet(`Disagreement: F1 + F4 = ${verdict.f1PlusF4}`), "");

  lines.push("## Calls", "");
  const callRows = report.repos.map((row) => [
    row.repo,
    row.calls.superseded,
    row.calls.waited,
    row.calls.unknown,
    row.calls.wouldHaveMerged,
    row.calls.total,
  ]);
  if (report.repos.length > 1) {
    const totals = report.repos.reduce((sum, row) => {
      callTotalsInto(sum, row.calls);
      return sum;
    }, emptyCalls());
    callRows.push(["Total", totals.superseded, totals.waited, totals.unknown, totals.wouldHaveMerged, totals.total]);
  }
  lines.push(...table(["Repository", "Superseded", "Waited", "Unknown", "Would have merged", "Total"], callRows), "");

  lines.push("## Pull requests", "");
  const pullRows = report.repos.map((row) => [
    row.repo,
    row.pulls.F2,
    row.pulls.F3,
    row.pulls.F1,
    row.pulls.F4,
    row.pulls.agreed,
  ]);
  if (report.repos.length > 1) {
    pullRows.push([
      "Total",
      report.totals.pulls.F2,
      report.totals.pulls.F3,
      report.totals.pulls.F1,
      report.totals.pulls.F4,
      report.totals.pulls.agreed,
    ]);
  }
  lines.push(...table(["Repository", "F2", "F3", "F1", "F4", "agreed"], pullRows), "");

  lines.push("## Detail", "");
  if (report.details.length === 0) lines.push("- none", "");
  for (const detail of report.details) {
    const title = detail.title === "" ? "" : ` "${detail.title}"`;
    lines.push(`### ${detail.repo}#${detail.number}${title}`, "");
    for (const call of detail.calls) {
      lines.push(`- call \`${short(call.head)}\` at ${clean(call.created_at)}: ${call.class}`);
      if (call.reason) lines.push(`  - ${clean(call.reason)}`);
      for (const check of call.checks) {
        const at = check.at === null ? "" : ` at ${clean(check.at)}`;
        lines.push(`  - \`${clean(check.context)}\`: ${check.result}${at} (${clean(check.source)})`);
      }
      if (call.checks.length === 0) lines.push("  - no recorded check");
    }
    if (detail.pull !== null) {
      lines.push(`- pull request: ${detail.pull.class} — ${clean(detail.pull.detail)}`);
      for (const note of detail.pull.notes ?? []) lines.push(`- note: ${clean(note)}`);
    } else {
      lines.push("- pull request: no would-have-merged call in the window, so not classed");
    }
    lines.push("");
  }

  lines.push("## F4 lines", "");
  lines.push("Applied:", "");
  lines.push(...(report.f4.applied.length === 0 ? ["- none"] : report.f4.applied.map((line) => bullet(f4LineText(line)))), "");
  lines.push("Not applied:", "");
  lines.push(...(report.f4.notApplied.length === 0 ? ["- none"] : report.f4.notApplied.map((line) => bullet(f4LineText(line)))), "");
  lines.push("Ambiguous:", "");
  lines.push(...(report.f4.ambiguous.length === 0 ? ["- none"] : report.f4.ambiguous.map((line) => bullet(f4LineText(line)))), "");

  lines.push("## Missed (value only)", "");
  if (report.missed.length === 0) lines.push("- none");
  for (const miss of report.missed) {
    const checks = miss.checks.map((check) => `\`${clean(check.context)}\` ${check.result}`).join(", ");
    lines.push(bullet(`${miss.repo}#${miss.number} "${miss.title}" merged at ${clean(miss.merged_at)}: ${checks}`));
  }
  lines.push("", "_Missed is an upper bound: the report does not judge S1 to S3 again, so a major update or a risk path that the shadow rightly skipped is listed too. It uses the required checks of the base branch on the report day, because a missed pull request has no marker; calls are the marker comments this report read (from the window start)._", "");

  lines.push("## No metadata (counted apart)", "");
  if (report.noMetadata.length === 0) lines.push("- none");
  for (const item of report.noMetadata) {
    lines.push(bullet(`${item.repo}#${item.number} "${item.title}": check run ${item.check_run} has a failed "${METADATA_STEP}" step`));
  }
  lines.push("");

  lines.push("## Levels", "");
  const levelRows = report.levels.map((row) => [
    row.repo,
    row.opened,
    row.L1,
    row.L2,
    row.L3,
    row.L4,
    row.none,
    row.lowered,
  ]);
  if (report.levels.length > 1) {
    const sums = { opened: 0, L1: 0, L2: 0, L3: 0, L4: 0, none: 0, lowered: 0 };
    for (const row of report.levels) {
      for (const key of Object.keys(sums)) sums[key] += row[key];
    }
    levelRows.push(["Total", sums.opened, sums.L1, sums.L2, sums.L3, sums.L4, sums.none, sums.lowered]);
  }
  lines.push(...table(["Repository", "Opened", "L1", "L2", "L3", "L4", "none", "Lowered"], levelRows), "");

  if (report.errors.length > 0) {
    lines.push("## Errors", "");
    for (const error of report.errors) lines.push(bullet(clean(error)));
    lines.push("");
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}
