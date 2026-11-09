// PR triage (ADR-0077, ADR-0078, docs/specs/pr-triage.md): the levels step that
// adds the level label level:L1 to level:L4 and, for L1 and L2, the label
// risk:high (ADR-0068, docs/specs/risk-paths.md), the readiness step that
// removes the label ready-for-human when the pull request head moves after the
// label, or when the label comes while CI at the head is not green, and the
// shadow step that writes 1 comment "would auto-merge" on a Dependabot pull
// request that a narrow auto-merge class would take, and enables nothing
// (docs/design/dependabot-shadow.md). `main` picks the step from
// PR_TRIAGE_STEP: `levels`, `readiness` or `shadow`.
//
// The reusable workflow .github/workflows/pr-triage.yml embeds this file
// verbatim, plus 1 trailer line, and scripts/lib/risk-paths.mjs beside it. It
// writes both to the runner temp directory and runs this file with Node, with
// no checkout. Edit this file, then run `npm run sync:risk-paths-workflow`;
// `npm run check:risk-paths` fails when the embedded copy drifts. Never edit
// the embedded copy by hand.
import {
  FILE_LIST_LIMIT,
  LABEL,
  LEVELS,
  LIST_PATH,
  NAME_PATTERN,
  commandValue,
  createGitHubApi,
  escapeCell,
  levelOfPullRequest,
  parseStrictJson,
  validateRiskPaths,
} from "./risk-paths.mjs";

export const READY_LABEL = "ready-for-human";
export const MARKER_PREFIX = "<!-- frostyard:readiness-revoked v1";
const OWN_CHECK_PREFIX = "pr-triage";
const GREEN_CONCLUSIONS = new Set(["success", "neutral", "skipped"]);
const BAD_STATUS_STATES = new Set(["pending", "failure", "error"]);
const SUMMARY_ROW_LIMIT = 50;
const LEVELS_ROW_LIMIT = 500;
const READINESS_PREFIX = "pr-triage: readiness: ";
const LEVELS_PREFIX = "risk-paths: ";
export const LEVEL_LABELS = Object.freeze({ L1: "level:L1", L2: "level:L2", L3: "level:L3", L4: "level:L4" });
const SHA_PATTERN = /^[0-9a-f]{40}$/;

// ---- Dependabot shadow ----------------------------------------------------

export const DEPENDABOT_LOGIN = "dependabot[bot]";
export const SHADOW_MARKER_PREFIX = "<!-- frostyard:dependabot-shadow v1";
export const SHADOW_ACTIONS = ["opened", "synchronize", "reopened"];
const SHADOW_PREFIX = "pr-triage: shadow: ";
const MANIFEST_NAMES = [
  "go.mod",
  "go.sum",
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "Cargo.toml",
  "Cargo.lock",
  "pyproject.toml",
  "poetry.lock",
  "uv.lock",
  "Pipfile",
  "Pipfile.lock",
  "Gemfile",
  "Gemfile.lock",
];
export const MANIFEST_FILES = new Set(MANIFEST_NAMES);
const REQUIREMENTS_PATTERN = /^requirements.*[.]txt$/;
const MINOR_UPDATE_TYPES = new Set(["version-update:semver-patch", "version-update:semver-minor"]);

// The head SHA is read in 1 place only: the readiness step and the shadow step
// both use this helper.
const headShaOf = (pr) => pr?.head?.sha;

// ---- Comments -------------------------------------------------------------

const short = (sha) => sha.slice(0, 12);

// The marker line of a revocation comment; it is also the comment's first line.
export function readinessMarker({ reason, before, after, head }) {
  if (reason === "head-moved") return `${MARKER_PREFIX} reason=head-moved before=${before} after=${after} -->`;
  if (reason === "checks-not-green") return `${MARKER_PREFIX} reason=checks-not-green head=${head} -->`;
  throw new Error(`unknown readiness reason ${JSON.stringify(reason)}`);
}

export function readinessComment({ reason, before, after, head }) {
  const marker = readinessMarker({ reason, before, after, head });
  if (reason === "head-moved") {
    return (
      `${marker}\n` +
      `\`${READY_LABEL}\` came off: the head moved from \`${short(before)}\` to \`${short(after)}\` after the label. ` +
      "Run the checks and the review again at the new head, then add the label again."
    );
  }
  return (
    `${marker}\n` +
    `\`${READY_LABEL}\` came off: CI at \`${short(head)}\` was not green when the label came. ` +
    "Add the label again when every check passes at this head."
  );
}

// ---- Checks ---------------------------------------------------------------

// Returns { relevant, notGreen } for the check runs and commit statuses of a
// head. The check runs of this workflow (names that start with pr-triage) are
// left out: the step cannot wait for itself.
export function evaluateChecks(checkRuns, statuses) {
  const runs = checkRuns.filter((run) => !String(run?.name ?? "").startsWith(OWN_CHECK_PREFIX));
  const notGreen = [];
  for (const run of runs) {
    if (run?.status !== "completed") {
      notGreen.push({ kind: "check run", name: run?.name, state: String(run?.status) });
    } else if (!GREEN_CONCLUSIONS.has(run.conclusion)) {
      notGreen.push({ kind: "check run", name: run.name, state: String(run.conclusion) });
    }
  }
  for (const status of statuses) {
    if (BAD_STATUS_STATES.has(status?.state)) {
      notGreen.push({ kind: "status", name: status.context, state: String(status.state) });
    }
  }
  return { relevant: runs.length + statuses.length, notGreen };
}

// ---- Step -----------------------------------------------------------------

export async function runReadinessStep({ api, eventName, event, summary, log }) {
  const say = (message, value) =>
    log(value === undefined ? `${READINESS_PREFIX}${message}` : `${READINESS_PREFIX}${message} ${JSON.stringify(value)}`);

  if (eventName !== "pull_request_target") {
    throw new Error(`the caller must run on pull_request_target, not ${JSON.stringify(eventName)}`);
  }
  const pr = event?.pull_request;
  const owner = event?.repository?.owner?.login;
  const repo = event?.repository?.name;
  const number = pr?.number;
  if (typeof owner !== "string" || !NAME_PATTERN.test(owner) || typeof repo !== "string" || !NAME_PATTERN.test(repo)) {
    throw new Error("the event has no valid repository owner and name");
  }
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("the event has no valid pull request number");
  const action = event?.action;
  say("repository", `${owner}/${repo}`);
  say("pull request", number);
  say("action", action);

  const done = async (outcome, text) => {
    say(text);
    await summary(`## Readiness\n\n${text}\n`);
    return { outcome };
  };

  let revocation;
  let notGreen = [];
  if (action === "synchronize") {
    const labels = Array.isArray(pr?.labels) ? pr.labels : [];
    if (!labels.some((label) => label?.name === READY_LABEL)) {
      return done("no-label", `the pull request has no \`${READY_LABEL}\` label. No label change.`);
    }
    const { before, after } = event;
    if (typeof before !== "string" || !SHA_PATTERN.test(before)) {
      throw new Error("the event has no valid before (40 hex characters)");
    }
    if (typeof after !== "string" || !SHA_PATTERN.test(after)) {
      throw new Error("the event has no valid after (40 hex characters)");
    }
    revocation = { reason: "head-moved", before, after };
    say("head moved", { before, after });
  } else if (action === "labeled" && event?.label?.name === READY_LABEL) {
    const head = headShaOf(pr);
    if (typeof head !== "string" || !SHA_PATTERN.test(head)) {
      throw new Error("the event has no valid pull request head SHA (40 hex characters)");
    }
    say("head", head);
    const checkRuns = await api.listCheckRuns(owner, repo, head);
    const statuses = await api.listCommitStatuses(owner, repo, head);
    const evaluated = evaluateChecks(checkRuns, statuses);
    say("checks counted", evaluated.relevant);
    if (evaluated.relevant === 0) {
      return done("no-checks", "no check run and no commit status at the head. No label change.");
    }
    if (evaluated.notGreen.length === 0) {
      return done("green", "every check at the head is green. The label stays.");
    }
    notGreen = evaluated.notGreen;
    revocation = { reason: "checks-not-green", head };
    for (const row of notGreen) say("not green", row);
  } else {
    return done("ignored", "the event is not a push to a labeled pull request and not the label being added. No label change.");
  }

  // The marker comment comes first: when the delete fails, a re-run finds the
  // marker and writes no second comment.
  const marker = readinessMarker(revocation);
  const comments = await api.listIssueComments(owner, repo, number);
  const hasMarker = comments.some(
    (comment) => typeof comment?.body === "string" && comment.body.split(/\r?\n/).some((line) => line.trim() === marker),
  );
  if (!hasMarker) {
    await api.createIssueComment(owner, repo, number, readinessComment(revocation));
    say("wrote the marker comment", revocation.reason);
  } else {
    say("the marker comment exists", revocation.reason);
  }
  const removed = await api.removeIssueLabel(owner, repo, number, READY_LABEL);
  say(removed ? "removed label" : "label already gone", READY_LABEL);

  const lines = [
    "## Readiness",
    "",
    `Removed the label \`${READY_LABEL}\`${removed ? "" : " (it was already gone)"}. Reason: \`${revocation.reason}\`.`,
    "",
  ];
  if (notGreen.length > 0) {
    lines.push("| Check | Kind | State |", "| --- | --- | --- |");
    for (const row of notGreen.slice(0, SUMMARY_ROW_LIMIT)) {
      lines.push(`| ${escapeCell(row.name)} | ${row.kind} | ${escapeCell(row.state)} |`);
    }
    if (notGreen.length > SUMMARY_ROW_LIMIT) {
      lines.push("", `${notGreen.length - SUMMARY_ROW_LIMIT} more checks are not shown here; the job log lists every one.`);
    }
  }
  await summary(`${lines.join("\n")}\n`);
  return { outcome: "revoked", reason: revocation.reason, commented: !hasMarker, removed };
}

// ---- Levels step ----------------------------------------------------------

const levelRank = (level) => LEVELS.indexOf(level);

// Adds the level label of the pull request and, for L1 and L2, risk:high. A
// level label only gets stricter: a looser computed level keeps the stricter
// label that the pull request has. Never removes risk:high. Never creates a
// label: the add-labels API creates a missing one, so the step checks first.
export async function runLevelsStep({ api, eventName, event, summary, log }) {
  const say = (message, value) =>
    log(value === undefined ? `${LEVELS_PREFIX}${message}` : `${LEVELS_PREFIX}${message} ${JSON.stringify(value)}`);

  if (eventName !== "pull_request_target") {
    throw new Error(`the caller must run on pull_request_target, not ${JSON.stringify(eventName)}`);
  }
  const pr = event?.pull_request;
  const owner = event?.repository?.owner?.login;
  const repo = event?.repository?.name;
  const number = pr?.number;
  const baseSha = pr?.base?.sha;
  if (typeof owner !== "string" || !NAME_PATTERN.test(owner) || typeof repo !== "string" || !NAME_PATTERN.test(repo)) {
    throw new Error("the event has no valid repository owner and name");
  }
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("the event has no valid pull request number");
  if (typeof baseSha !== "string" || !SHA_PATTERN.test(baseSha)) {
    throw new Error("the event has no valid pull_request.base.sha (40 hex characters)");
  }
  const fullName = `${owner}/${repo}`;
  say("repository", fullName);
  say("pull request", number);
  say("base sha", baseSha);

  const text = await api.getFileAtRef(owner, repo, LIST_PATH, baseSha);
  if (text === null) {
    say(`no list on base: ${LIST_PATH} does not exist at`, baseSha);
    await summary(`## Levels\n\nno list on base: \`${LIST_PATH}\` does not exist at \`${baseSha}\`. No label change.\n`);
    return { outcome: "no-list" };
  }

  let list;
  try {
    list = parseStrictJson(text);
  } catch (error) {
    throw new Error(`${LIST_PATH} at ${baseSha} is not valid: ${error.message}`);
  }
  const validation = validateRiskPaths(list);
  if (!validation.ok) {
    throw new Error(`${LIST_PATH} at ${baseSha} is not valid: ${validation.errors.join("; ")}`);
  }
  say("list entries", list.paths.length);

  if (!(await api.labelExists(owner, repo, LABEL))) {
    throw new Error(
      `label ${LABEL} does not exist in ${fullName}; the accountable owner must create it ` +
        `(gh label create ${LABEL} --repo ${fullName} --color B60205 --description "Touches a high-risk path (ADR-0068)")`,
    );
  }
  const missingLabels = [];
  for (const level of LEVELS) {
    if (!(await api.labelExists(owner, repo, LEVEL_LABELS[level]))) missingLabels.push(LEVEL_LABELS[level]);
  }

  const files = await api.listPullFiles(owner, repo, number);
  say("changed files", files.length);
  const computed = levelOfPullRequest(list, files);
  const level = computed.level;
  say("computed level", level);
  const strict = computed.files.filter((result) => result.level === "L1" || result.level === "L2");
  for (const result of strict) say("path", result);

  const alias = level === "L1" || level === "L2" ? [LABEL] : [];
  const added = [];
  const removed = [];
  let outcome;
  let kept = null;
  if (missingLabels.length > 0) {
    outcome = "labels-missing";
    if (alias.length > 0) {
      await api.addLabels(owner, repo, number, alias);
      added.push(...alias);
    }
  } else {
    const current = (await api.listIssueLabels(owner, repo, number)).map((label) => label?.name);
    const currentLevels = LEVELS.filter((candidate) => current.includes(LEVEL_LABELS[candidate]));
    const strictest = currentLevels[0];
    const raise = strictest === undefined || levelRank(level) < levelRank(strictest);
    const toAdd = raise ? [LEVEL_LABELS[level], ...alias] : alias;
    if (!raise) kept = strictest;
    if (toAdd.length > 0) {
      await api.addLabels(owner, repo, number, toAdd);
      added.push(...toAdd);
    }
    if (raise) {
      for (const candidate of currentLevels) {
        if (levelRank(candidate) <= levelRank(level)) continue;
        await api.removeIssueLabel(owner, repo, number, LEVEL_LABELS[candidate]);
        removed.push(LEVEL_LABELS[candidate]);
      }
    }
    outcome = raise ? "labeled" : "kept";
  }
  for (const name of added) say("added label", name);
  for (const name of removed) say("removed label", name);

  const lines = ["## Levels", ""];
  if (kept !== null) {
    lines.push(`Level: computed ${level}, kept ${kept}. A level label only gets stricter.`);
  } else {
    lines.push(`Level: computed ${level}.`);
  }
  if (added.length > 0) lines.push("", `Added ${added.map((name) => `\`${name}\``).join(", ")}.`);
  if (removed.length > 0) lines.push("", `Removed ${removed.map((name) => `\`${name}\``).join(", ")}.`);
  if (missingLabels.length > 0) {
    const warning =
      `warning: the label ${missingLabels.join(", ")} does not exist in ${fullName}; no level label changed. ` +
      `Fix: frostyard/core scripts/apply-triage-settings.sh ${fullName} --apply`;
    say(warning);
    lines.push("", `**${escapeCell(warning)}**`);
  }
  if (computed.truncated) {
    say("file list truncated at", files.length);
    lines.push(
      "",
      `The file list is truncated: the GitHub API returned ${files.length} files, its limit is 3000. The level is L1 (fail safe).`,
    );
  }
  if (strict.length > 0) {
    lines.push("", "| Path | Glob or floor | Level | Why |", "| --- | --- | --- | --- |");
    for (const result of strict.slice(0, LEVELS_ROW_LIMIT)) {
      const where = result.source === "glob" ? result.glob : result.source === "floor" ? "org floor" : "default_level";
      lines.push(`| ${escapeCell(result.path)} | ${escapeCell(where)} | ${result.level} | ${escapeCell(result.why ?? "")} |`);
    }
    if (strict.length > LEVELS_ROW_LIMIT) {
      lines.push("", `${strict.length - LEVELS_ROW_LIMIT} more paths are not shown here; the job log lists every path.`);
    }
  }
  await summary(`${lines.join("\n")}\n`);
  return { outcome, level, truncated: computed.truncated, added, removed, missingLabels };
}

// ---- Shadow checks -------------------------------------------------------

// A version: an optional leading "v", then 2 or more dot-separated decimal
// numbers, and nothing else. Returns an array of numbers, or null.
export function parseVersion(text) {
  if (typeof text !== "string") return null;
  const match = /^v?([0-9]+(?:[.][0-9]+)+)$/.exec(text);
  if (match === null) return null;
  return match[1].split(".").map((part) => Number(part));
}

// S1: patch or minor only. `updatesText` is the updated-dependencies-json output
// of dependabot/fetch-metadata. A grouped pull request passes when every entry
// passes. A change of the first number is a major update, and so is a change of
// the second number while the first is 0.
export function checkS1(updatesText) {
  const fail = (detail) => ({ pass: false, detail });
  if (typeof updatesText !== "string" || updatesText.trim() === "") return fail("no update metadata");
  let updates;
  try {
    updates = JSON.parse(updatesText);
  } catch {
    return fail("the update metadata is not JSON");
  }
  if (!Array.isArray(updates)) return fail("the update metadata is not an array");
  if (updates.length === 0) return fail("the update metadata has no entry");
  for (let index = 0; index < updates.length; index++) {
    const update = updates[index];
    if (update === null || typeof update !== "object" || Array.isArray(update)) {
      return fail(`entry ${index + 1} is not an object`);
    }
    const named = typeof update.dependencyName === "string" && update.dependencyName !== "";
    const name = named ? update.dependencyName : `entry ${index + 1}`;
    if (!MINOR_UPDATE_TYPES.has(update.updateType)) {
      return fail(`${name}: the update type is ${JSON.stringify(update.updateType)}, not patch or minor`);
    }
    const before = parseVersion(update.prevVersion);
    if (before === null) return fail(`${name}: prevVersion ${JSON.stringify(update.prevVersion)} is not a version`);
    const after = parseVersion(update.newVersion);
    if (after === null) return fail(`${name}: newVersion ${JSON.stringify(update.newVersion)} is not a version`);
    if (before[0] !== after[0]) return fail(`${name}: ${update.prevVersion} to ${update.newVersion} is a major update`);
    if (before[0] === 0 && before[1] !== after[1]) {
      return fail(`${name}: ${update.prevVersion} to ${update.newVersion} is a major update of a 0.x version`);
    }
  }
  return { pass: true, detail: `${updates.length} ${updates.length === 1 ? "update" : "updates"}, patch or minor` };
}

const baseName = (filePath) => String(filePath).split("/").pop();

// S2: manifest and lock files only, and a file list that is not truncated.
export function checkS2(files) {
  if (!Array.isArray(files) || files.length === 0) return { pass: false, detail: "no changed file" };
  if (files.length >= FILE_LIST_LIMIT) {
    return { pass: false, detail: `the file list is truncated at ${files.length} files` };
  }
  for (const entry of files) {
    const filename = entry?.filename;
    if (typeof filename !== "string" || filename === "") return { pass: false, detail: "a changed file has no path" };
    const previous = entry?.previous_filename;
    const paths = typeof previous === "string" && previous !== "" ? [filename, previous] : [filename];
    for (const filePath of paths) {
      const name = baseName(filePath);
      if (MANIFEST_FILES.has(name) || REQUIREMENTS_PATTERN.test(name)) continue;
      return { pass: false, detail: `${filePath} is not a manifest or lock file` };
    }
  }
  return { pass: true, detail: `${files.length} ${files.length === 1 ? "file" : "files"}, manifest and lock files only` };
}

// S3: no risk path. The computed level of the changed paths must be L3 or L4.
// It reads the list only, never the labels of the pull request. Any error fails
// this criterion, and the step itself does not fail.
export function checkS3(listText, files) {
  try {
    if (typeof listText !== "string") return { pass: false, detail: "no list at the base SHA", level: null };
    const list = parseStrictJson(listText);
    const validation = validateRiskPaths(list);
    if (!validation.ok) {
      return { pass: false, detail: `the list is not valid: ${validation.errors.join("; ")}`, level: null };
    }
    const computed = levelOfPullRequest(list, files);
    const level = computed.level;
    if (level !== "L3" && level !== "L4") return { pass: false, detail: `the computed level is ${level}`, level };
    return { pass: true, detail: `the computed level is ${level}`, level };
  } catch (error) {
    return { pass: false, detail: `the level failed: ${error?.message ?? "unknown error"}`, level: null };
  }
}

// S4: the base branch requires at least 1 status check, so that the merge queue
// or the branch protection waits for CI before the merge.
export function checkS4(rules) {
  const checks = [];
  const seen = new Set();
  const list = Array.isArray(rules) ? rules : [];
  for (const rule of list) {
    if (rule?.type !== "required_status_checks") continue;
    const required = rule?.parameters?.required_status_checks;
    if (!Array.isArray(required)) continue;
    for (const entry of required) {
      const context = String(entry?.context ?? "");
      const integrationId = typeof entry?.integration_id === "number" ? entry.integration_id : null;
      const key = JSON.stringify([context, integrationId]);
      if (seen.has(key)) continue;
      seen.add(key);
      checks.push({ context, integration_id: integrationId });
    }
  }
  if (checks.length === 0) return { pass: false, detail: "the base branch requires no status check", checks };
  return { pass: true, detail: `${checks.length} required ${checks.length === 1 ? "check" : "checks"}`, checks };
}

// The marker line. It is the first line of the comment, and 1 comment per head
// holds it. The JSON escapes <, > and & so that a check name cannot end the HTML
// comment, and the text stays valid JSON.
export function shadowMarker({ head, level, checks }) {
  const json = JSON.stringify(checks.map(({ context, integration_id }) => ({ context, integration_id })))
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  return `${SHADOW_MARKER_PREFIX} head=${head} level=${level} checks=${json} -->`;
}

export function shadowComment({ head, level, checks }) {
  const marker = shadowMarker({ head, level, checks });
  return (
    `${marker}\n` +
    `Shadow call: auto-merge would be enabled at \`${short(head)}\` ` +
    `(patch or minor; manifest and lock files only; level ${level}; ${checks.length} required checks). ` +
    "Nothing is enabled. A person still merges."
  );
}

// ---- Shadow step ----------------------------------------------------------

// Reads, and writes at most 1 comment. It never enables auto-merge, approves,
// merges or labels, and it reads no label.
export async function runShadowStep({ api, eventName, event, updates, summary, log }) {
  const say = (message, value) =>
    log(value === undefined ? `${SHADOW_PREFIX}${message}` : `${SHADOW_PREFIX}${message} ${JSON.stringify(value)}`);

  if (eventName !== "pull_request_target") {
    throw new Error(`the caller must run on pull_request_target, not ${JSON.stringify(eventName)}`);
  }
  const pr = event?.pull_request;
  const owner = event?.repository?.owner?.login;
  const repo = event?.repository?.name;
  const number = pr?.number;
  if (typeof owner !== "string" || !NAME_PATTERN.test(owner) || typeof repo !== "string" || !NAME_PATTERN.test(repo)) {
    throw new Error("the event has no valid repository owner and name");
  }
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("the event has no valid pull request number");
  const action = event?.action;
  say("repository", `${owner}/${repo}`);
  say("pull request", number);
  say("action", action);

  const done = async (outcome, text) => {
    say(text);
    await summary(`## Dependabot shadow\n\n${text}\n`);
    return { outcome };
  };

  if (pr?.user?.login !== DEPENDABOT_LOGIN) {
    return done("ignored", `the pull request author is not \`${DEPENDABOT_LOGIN}\`. No comment.`);
  }
  if (!SHADOW_ACTIONS.includes(action)) {
    return done("ignored", `the action is not ${SHADOW_ACTIONS.join(", ")}. No comment.`);
  }
  if (pr?.draft === true) return done("ignored", "the pull request is a draft. No comment.");

  const head = headShaOf(pr);
  if (typeof head !== "string" || !SHA_PATTERN.test(head)) {
    throw new Error("the event has no valid pull request head SHA (40 hex characters)");
  }
  const baseSha = pr?.base?.sha;
  if (typeof baseSha !== "string" || !SHA_PATTERN.test(baseSha)) {
    throw new Error("the event has no valid pull_request.base.sha (40 hex characters)");
  }
  const baseRef = pr?.base?.ref;
  if (typeof baseRef !== "string" || baseRef === "") throw new Error("the event has no pull_request.base.ref");
  say("head", head);
  say("base", { sha: baseSha, ref: baseRef });

  const s1 = checkS1(updates);
  say("S1 patch or minor", s1);
  const files = await api.listPullFiles(owner, repo, number);
  say("changed files", files.length);
  const s2 = checkS2(files);
  say("S2 manifest and lock files", s2);
  let s3;
  try {
    const listText = await api.getFileAtRef(owner, repo, LIST_PATH, baseSha);
    s3 = checkS3(listText, files);
  } catch (error) {
    s3 = { pass: false, detail: `reading the list failed: ${error?.message ?? "unknown error"}`, level: null };
  }
  say("S3 no risk path", { pass: s3.pass, detail: s3.detail, level: s3.level });
  const rules = await api.listBranchRules(owner, repo, baseRef);
  const s4 = checkS4(rules);
  say("S4 required checks", s4);

  const level = typeof s3.level === "string" ? s3.level : null;
  const checks = Array.isArray(s4.checks) ? s4.checks : [];
  const results = [
    { id: "S1 patch or minor", detail: s1.detail, pass: s1.pass },
    { id: "S2 manifest and lock files", detail: s2.detail, pass: s2.pass },
    { id: "S3 no risk path", detail: s3.detail, pass: s3.pass },
    { id: "S4 required checks", detail: s4.detail, pass: s4.pass },
  ];
  const lines = ["## Dependabot shadow", "", "| Criterion | Result | Detail |", "| --- | --- | --- |"];
  for (const result of results) {
    lines.push(`| ${result.id} | ${result.pass ? "pass" : "fail"} | ${escapeCell(result.detail)} |`);
  }
  const failed = results.filter((result) => !result.pass).map((result) => result.id.split(" ")[0]);
  if (failed.length > 0) {
    say("no call: failed", failed);
    lines.push("", `No call: ${failed.join(", ")} did not pass. No comment was written.`);
    await summary(`${lines.join("\n")}\n`);
    return { outcome: "no-call", level, checks, failed };
  }

  const markerPrefix = `${SHADOW_MARKER_PREFIX} head=${head} `;
  const comments = await api.listIssueComments(owner, repo, number);
  const exists = comments.some(
    (comment) =>
      typeof comment?.body === "string" &&
      comment.body.split(/\r?\n/).some((line) => line.trim().startsWith(markerPrefix)),
  );
  if (exists) {
    say("a call for this head exists", head);
    lines.push("", "A shadow call for this head exists. No second comment.");
    await summary(`${lines.join("\n")}\n`);
    return { outcome: "exists", level, checks };
  }
  await api.createIssueComment(owner, repo, number, shadowComment({ head, level, checks }));
  say("wrote the shadow call", head);
  lines.push("", "Wrote the shadow call. Nothing is enabled. A person still merges.");
  await summary(`${lines.join("\n")}\n`);
  return { outcome: "called", level, checks };
}

// ---- Entry ----------------------------------------------------------------

export async function main(env) {
  const token = env.GITHUB_TOKEN;
  try {
    const step = env.PR_TRIAGE_STEP;
    if (step !== "levels" && step !== "readiness" && step !== "shadow") {
      throw new Error(`unknown PR_TRIAGE_STEP ${JSON.stringify(step)}`);
    }
    const fs = await import("node:fs/promises");
    if (!env.GITHUB_EVENT_PATH) throw new Error("GITHUB_EVENT_PATH is not set");
    if (!token) throw new Error("GITHUB_TOKEN is not set");
    const event = JSON.parse(await fs.readFile(env.GITHUB_EVENT_PATH, "utf8"));
    const api = createGitHubApi({
      token,
      apiUrl: env.GITHUB_API_URL || "https://api.github.com",
      fetch: globalThis.fetch,
    });
    const summary = async (markdown) => {
      if (env.GITHUB_STEP_SUMMARY) await fs.appendFile(env.GITHUB_STEP_SUMMARY, markdown);
    };
    // Untrusted text never starts a line: a line without the prefix is quoted.
    const prefix = step === "levels" ? LEVELS_PREFIX : step === "readiness" ? READINESS_PREFIX : SHADOW_PREFIX;
    const log = (line) => {
      const text = String(line).replace(/[\r\n\u2028\u2029]/g, " ");
      process.stdout.write(`${text.startsWith(prefix) ? text : prefix + JSON.stringify(text)}\n`);
    };
    const run = step === "levels" ? runLevelsStep : step === "readiness" ? runReadinessStep : runShadowStep;
    const options = { api, eventName: env.GITHUB_EVENT_NAME, event, summary, log };
    if (step === "shadow") options.updates = env.DEPENDABOT_UPDATES;
    return await run(options);
  } catch (error) {
    let message = String(error?.message ?? error);
    if (token) message = message.split(token).join("***");
    message = message.replace(/[\r\n\u2028\u2029]+/g, " ");
    process.stdout.write(`::error::${commandValue(message)}\n`);
    process.exitCode = 1;
    return undefined;
  }
}
