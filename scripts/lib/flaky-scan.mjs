import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export class FlakyScanError extends Error {
  constructor(message) {
    super(message);
    this.name = "FlakyScanError";
  }
}

const WRITE_FLAGS = ["--method", "-X", "-f", "-F", "--field", "--raw-field", "--input"];

export function makeGh({ exec, apply }) {
  return async (args, options = {}) => {
    const writes = args.some((arg) => WRITE_FLAGS.includes(arg));

    if (!apply) {
      if (writes) throw new FlakyScanError("refusing GitHub write because --apply is not set");
      return exec(args, options);
    }

    if (!writes) return exec(args, options);

    const issue = /^repos\/[^/]+\/[^/]+\/issues$/;
    const comment = /^repos\/[^/]+\/[^/]+\/issues\/\d+\/comments$/;
    const allowed =
      args.length === 6 &&
      args[0] === "api" &&
      args[1] === "--method" &&
      args[2] === "POST" &&
      (issue.test(args[3]) || comment.test(args[3])) &&
      args[4] === "--input" &&
      args[5] === "-";
    if (!allowed) throw new FlakyScanError("refusing an unknown GitHub write shape");
    return exec(args, options);
  };
}

export function parseNow(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new FlakyScanError(`invalid --now: ${String(value)}`);
  return date;
}

export function scanWindow(now = new Date(), days = 7) {
  const date = parseNow(now);
  const count = Number(days);
  if (!Number.isInteger(count) || count < 1) throw new FlakyScanError("--days must be a positive integer");
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - count * 86_400_000;
  return { from: new Date(start).toISOString().slice(0, 10), to: date.toISOString() };
}

export async function parseProfiles(dir) {
  if (!dir) return { ownerByRepo: new Map(), repos: [] };
  let names;
  try {
    names = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    throw new FlakyScanError(`profiles directory could not be read: ${error.code ?? error.message}`);
  }

  const files = names
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const ownerByRepo = new Map();
  const repos = [];
  for (const name of files) {
    const owner = name.slice(0, -3);
    const file = path.join(dir, name);
    let text;
    try {
      text = await readFile(file, "utf8");
    } catch (error) {
      throw new FlakyScanError(`profile could not be read: ${file}: ${error.code ?? error.message}`);
    }

    const lines = text.replace(/\r/g, "").split("\n");
    let inFrontMatter = false;
    let frontMatterSeen = 0;
    let inRepositories = false;
    for (const line of lines) {
      if (/^---\s*$/.test(line)) {
        frontMatterSeen += 1;
        if (frontMatterSeen === 1) inFrontMatter = true;
        if (frontMatterSeen === 2) break;
        continue;
      }
      if (!inFrontMatter) continue;
      if (/^repositories:\s*$/.test(line)) {
        inRepositories = true;
        continue;
      }
      if (inRepositories) {
        if (/^\S/.test(line)) {
          inRepositories = false;
          continue;
        }
        const match = /^\s{2}([^\s:]+\/[^\s:]+)\s*:/.exec(line);
        if (!match) continue;
        const repo = match[1];
        if (!ownerByRepo.has(repo)) {
          ownerByRepo.set(repo, owner);
          repos.push(repo);
        }
      }
    }
  }
  return { ownerByRepo, repos };
}

export function resolveRepos(repoArgs = [], profileInfo = null) {
  const profile = profileInfo ?? { ownerByRepo: new Map(), repos: [] };
  const ownerByRepo = profile.ownerByRepo ?? new Map();
  const result = [];
  const seen = new Set();

  for (const repo of repoArgs) {
    if (seen.has(repo)) continue;
    seen.add(repo);
    result.push({ repo, owner: ownerByRepo.get(repo) ?? null });
  }
  for (const repo of profile.repos ?? []) {
    if (seen.has(repo)) continue;
    seen.add(repo);
    result.push({ repo, owner: ownerByRepo.get(repo) ?? null });
  }
  return result;
}

export function parseArgs(argv = []) {
  const result = { repos: [], profiles: null, days: 7, out: null, apply: false, now: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--repo" || arg === "--profiles" || arg === "--days" || arg === "--out" || arg === "--now") {
      if (i + 1 >= argv.length) throw new FlakyScanError(`missing value for ${arg}`);
      const key = arg.slice(2);
      if (key === "repo") result.repos.push(argv[++i]);
      else result[key] = argv[++i];
    } else if (arg.startsWith("--repo=")) {
      const value = arg.slice("--repo=".length);
      if (!value) throw new FlakyScanError("missing value for --repo");
      result.repos.push(value);
    } else if (arg.startsWith("--profiles=")) {
      const value = arg.slice("--profiles=".length);
      if (!value) throw new FlakyScanError("missing value for --profiles");
      result.profiles = value;
    } else if (arg.startsWith("--days=")) {
      const value = arg.slice("--days=".length);
      if (!value) throw new FlakyScanError("missing value for --days");
      result.days = value;
    } else if (arg.startsWith("--out=")) {
      const value = arg.slice("--out=".length);
      if (!value) throw new FlakyScanError("missing value for --out");
      result.out = value;
    } else if (arg.startsWith("--now=")) {
      const value = arg.slice("--now=".length);
      if (!value) throw new FlakyScanError("missing value for --now");
      result.now = value;
    } else if (arg === "--apply") {
      result.apply = true;
    } else {
      throw new FlakyScanError(`unknown flag: ${arg}`);
    }
  }
  if (!/^\d+$/.test(String(result.days)) || Number(result.days) < 1) {
    throw new FlakyScanError("--days must be a positive integer");
  }
  result.days = Number(result.days);
  return result;
}

export function workflowFile(pathName) {
  const at = String(pathName ?? "").indexOf("@");
  const stripped = at >= 0 ? String(pathName).slice(0, at) : String(pathName ?? "");
  const slash = stripped.lastIndexOf("/");
  return slash >= 0 ? stripped.slice(slash + 1) : stripped;
}

function stripSuffix(value) {
  const at = String(value ?? "").indexOf("@");
  return at >= 0 ? String(value).slice(0, at) : String(value ?? "");
}

export function groupRuns(runs) {
  const groups = new Map();
  for (const run of runs) {
    const pathName = stripSuffix(run.path);
    const sha = run.head_sha;
    if (!sha) continue;
    const key = `${pathName}@${sha}`;
    if (!groups.has(key)) groups.set(key, { path: pathName, sha, runs: [] });
    groups.get(key).runs.push(run);
  }
  return groups;
}

function readItems(value, key) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value[key])) return value[key];
  return [];
}

function asDateValue(job) {
  const value = job.completed_at ?? job.started_at;
  const ms = value ? Date.parse(value) : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function compareIds(a, b) {
  const left = String(a);
  const right = String(b);
  if (/^\d+$/.test(left) && /^\d+$/.test(right)) return Number(left) - Number(right);
  return left.localeCompare(right);
}

export function detectFlakyEvents(runs, jobsByAttempt) {
  if (!Array.isArray(runs)) throw new TypeError("runs must be an array");
  if (!(jobsByAttempt instanceof Map)) throw new TypeError("jobsByAttempt must be a Map");

  const groups = groupRuns(runs);
  const detected = [];
  for (const group of groups.values()) {
    const attempts = group.runs.reduce((sum, run) => sum + Math.max(Number(run.run_attempt ?? 1), 1), 0);
    if (attempts < 2) continue;

    const deduped = [];
    const seenIds = new Set();
    for (const run of group.runs) {
      const runAttemptCount = Math.max(Number(run.run_attempt ?? 1), 1);
      for (let attempt = 1; attempt <= runAttemptCount; attempt += 1) {
        const jobs = jobsByAttempt.get(`${run.id}:${attempt}`) ?? [];
        for (const sourceJob of jobs) {
          if (sourceJob.id == null || seenIds.has(sourceJob.id)) continue;
          seenIds.add(sourceJob.id);
          deduped.push({
            ...sourceJob,
            run_id: sourceJob.run_id ?? run.id,
            run_attempt: sourceJob.run_attempt ?? attempt,
          });
        }
      }
    }

    const byName = new Map();
    for (const job of deduped) {
      if (!byName.has(job.name)) byName.set(job.name, []);
      byName.get(job.name).push(job);
    }

    for (const jobs of byName.values()) {
      jobs.sort((a, b) => asDateValue(a) - asDateValue(b) || compareIds(a.id, b.id));
      for (let i = 0; i < jobs.length; i += 1) {
        const failed = jobs[i];
        if (!["failure", "timed_out"].includes(failed.conclusion)) continue;
        const laterSuccess = jobs.slice(i + 1).some((success) =>
          success.conclusion === "success" &&
          (String(success.run_id) !== String(failed.run_id) ||
            Number(success.run_attempt) > Number(failed.run_attempt))
        );
        if (!laterSuccess) continue;
        detected.push({
          event: {
            run_id: failed.run_id ?? null,
            attempt: failed.run_attempt ?? null,
            job_id: failed.id,
            sha: group.sha,
            date: failed.completed_at ?? null,
            url: failed.html_url ?? null,
          },
          job: failed,
          workflow: workflowFile(group.path),
        });
      }
    }
  }
  return detected;
}

export function parseTestNames(log, job = {}) {
  const names = [];
  const goNames = new Set();
  if (typeof log === "string") {
    for (const rawLine of log.split(/\r?\n/)) {
      const line = rawLine.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z /, "");
      let match = /^\s*--- FAIL: (\S+)/.exec(line);
      if (match) {
        const name = match[1];
        if (!names.includes(name)) {
          names.push(name);
          goNames.add(name);
        }
        continue;
      }
      match = /^\s*not ok \d+ - (.+?)(\s+#.*)?$/.exec(line);
      if (match) {
        const name = match[1].trim();
        if (name && !names.includes(name)) names.push(name);
        continue;
      }
      match = /^FAILED (\S+::\S+)/.exec(line);
      if (match) {
        const name = match[1];
        if (!names.includes(name)) names.push(name);
      }
    }
  }

  const filtered = names.filter((name) => {
    if (!goNames.has(name)) return true;
    return !names.some((other) => other !== name && other.startsWith(`${name}/`));
  });
  if (filtered.length > 0) return filtered.slice(0, 5);
  if (Array.isArray(job.steps)) {
    const step = job.steps.find((item) => ["failure", "timed_out"].includes(item.conclusion));
    if (step?.name) return [step.name];
  }
  if (job.name) return [job.name];
  return [];
}

export function markerForKey(key) {
  const safe = String(key).replace(/-->/g, "_").replace(/[\r\n]/g, "_");
  return `<!-- flaky-scan key=${safe} -->`;
}

export function issueTitle(test, workflow, job) {
  const shortTest = String(test).slice(0, 120);
  return `flaky: ${shortTest} (${workflow} / ${job})`;
}

function eventLine(event) {
  const sha = event.sha ? String(event.sha).slice(0, 7) : "";
  const url = event.url ?? "";
  const date = event.date ?? "";
  return `- [run ${event.run_id} attempt ${event.attempt}](${url}) · \`${sha}\` · ${date}`;
}

export function issueBody({ repo, owner, key, events }) {
  const ownership = owner ? ` The owner is ${owner}.` : "";
  const lines = [
    `The job failed and then passed on the same SHA for ${repo}.${ownership}`,
    "Found by `scripts/flaky-scan.mjs` in frostyard/core",
    "",
  ];
  for (const event of events) lines.push(eventLine(event));
  lines.push(markerForKey(key));
  return lines.join("\n");
}

export function commentBody(events) {
  return events.map(eventLine).join("\n");
}

async function ghJson(exec, args) {
  const stdout = await exec(args, { input: undefined });
  if (typeof stdout !== "string") return stdout;
  try {
    return JSON.parse(stdout);
  } catch {
    return stdout;
  }
}

/** Every UTC day from `window.from` to the day of `window.to`, as `YYYY-MM-DD`. */
export function windowDays(window) {
  const days = [];
  const last = String(window.to).slice(0, 10);
  let ms = Date.parse(`${window.from}T00:00:00Z`);
  while (Number.isFinite(ms)) {
    const day = new Date(ms).toISOString().slice(0, 10);
    if (day > last) break;
    days.push(day);
    ms += 86_400_000;
  }
  return days;
}

/** A run of a GitHub-generated workflow (Dependabot, CodeQL default setup): no file in the repository. */
export function isDynamicRun(run) {
  return String(run.path ?? "").startsWith("dynamic/");
}

/**
 * Read the runs 1 day at a time: the runs API returns at most 1,000 runs (10
 * pages) for 1 query, so a busy repository is read in full unless 1 day alone
 * has 1,000 runs. Such a day is listed in `truncatedDays`.
 */
async function fetchAllRuns(exec, repo, window) {
  const byId = new Map();
  const truncatedDays = [];
  for (const day of windowDays(window)) {
    for (let page = 1; page <= 10; page += 1) {
      const value = await ghJson(exec, ["api", `repos/${repo}/actions/runs?created=${day}&per_page=100&page=${page}`]);
      const pageRuns = readItems(value, "workflow_runs");
      for (const run of pageRuns) if (!byId.has(run.id)) byId.set(run.id, run);
      if (pageRuns.length < 100) break;
      if (page === 10) truncatedDays.push(day);
    }
  }
  return { runs: [...byId.values()].filter((run) => !isDynamicRun(run)), truncatedDays };
}

const SERVER_ERROR = /HTTP 5\d\d/;

/**
 * Retry a read once after a GitHub 5xx answer. Writes are never retried: a
 * 5xx on a POST can still have created the issue or the comment.
 */
export function withReadRetry(gh, { delayMs = 2000 } = {}) {
  return async (args, options = {}) => {
    try {
      return await gh(args, options);
    } catch (error) {
      const write = args.some((arg) => WRITE_FLAGS.includes(arg));
      if (write || !SERVER_ERROR.test(errorText(error))) throw error;
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return gh(args, options);
    }
  };
}

async function fetchJobs(exec, repo, run, attempt) {
  const jobs = [];
  for (let page = 1; ; page += 1) {
    const value = await ghJson(exec, ["api", `repos/${repo}/actions/runs/${run.id}/attempts/${attempt}/jobs?per_page=100&page=${page}`]);
    const pageJobs = readItems(value, "jobs");
    jobs.push(...pageJobs);
    if (pageJobs.length < 100) break;
  }
  return jobs;
}

async function fetchAllOpenIssues(exec, repo) {
  const issues = [];
  for (let page = 1; ; page += 1) {
    const value = await ghJson(exec, ["api", `repos/${repo}/issues?state=open&per_page=100&page=${page}`]);
    const pageIssues = Array.isArray(value) ? value : [];
    for (const issue of pageIssues) if (!issue.pull_request) issues.push(issue);
    if (pageIssues.length < 100) break;
  }
  return issues;
}

async function fetchAllComments(exec, repo, issueNumber) {
  const comments = [];
  for (let page = 1; ; page += 1) {
    const value = await ghJson(exec, ["api", `repos/${repo}/issues/${issueNumber}/comments?per_page=100&page=${page}`]);
    const pageComments = Array.isArray(value) ? value : [];
    comments.push(...pageComments);
    if (pageComments.length < 100) break;
  }
  return comments;
}

function errorText(error) {
  return error?.message ? String(error.message) : String(error);
}

export async function scanRepository({
  repo,
  owner = null,
  exec,
  apply = false,
  window,
  gh = null,
  issueOpensBefore = 0,
  globalIssueCap = 15,
  log = () => {},
  retryDelayMs = 2000,
}) {
  const guarded = gh ?? makeGh({ exec, apply });
  const reader = withReadRetry(guarded, { delayMs: retryDelayMs });
  const failed = (error) => ({
    repo, owner, runs: null, rerunAttempts: null, truncatedDays: null, error: errorText(error), flaky: [],
  });
  let runs;
  let truncatedDays;
  try {
    ({ runs, truncatedDays } = await fetchAllRuns(reader, repo, window));
  } catch (error) {
    return failed(error);
  }
  for (const day of truncatedDays) log(`warn ${repo}: ${day} has 1000 runs or more; the runs API returns no more`);

  let rerunAttempts = 0;
  for (const run of runs) rerunAttempts += Math.max(Number(run.run_attempt ?? 1) - 1, 0);

  const groups = groupRuns(runs);
  const jobsByAttempt = new Map();
  try {
    for (const group of groups.values()) {
      const sum = group.runs.reduce((total, run) => total + Math.max(Number(run.run_attempt ?? 1), 1), 0);
      if (sum < 2) continue;
      for (const run of group.runs) {
        const count = Math.max(Number(run.run_attempt ?? 1), 1);
        for (let attempt = 1; attempt <= count; attempt += 1) {
          const jobs = await fetchJobs(reader, repo, run, attempt);
          jobsByAttempt.set(`${run.id}:${attempt}`, jobs);
        }
      }
    }
  } catch (error) {
    return failed(error);
  }

  const detected = detectFlakyEvents(runs, jobsByAttempt);
  const groupedEvents = new Map();
  for (const detectedRecord of detected) {
    const { event, job: failedJob, workflow } = detectedRecord;
    let names = [];
    try {
      const logText = await reader(["api", `repos/${repo}/actions/jobs/${failedJob.id}/logs`], { input: undefined });
      names = parseTestNames(String(logText), failedJob);
    } catch {
      names = parseTestNames("", failedJob);
    }
    if (names.length === 0) names = [failedJob.name];

    for (const test of names) {
      const key = `${repo}/${workflow}/${failedJob.name}/${test}`;
      if (!groupedEvents.has(key)) {
        groupedEvents.set(key, { key, workflow, job: failedJob.name, test, events: [] });
      }
      groupedEvents.get(key).events.push(event);
    }
  }

  let openIssues;
  try {
    openIssues = await fetchAllOpenIssues(reader, repo);
  } catch (error) {
    return failed(error);
  }

  const flaky = [];
  let issueOpens = 0;
  let globalWriteError = null;
  const ordered = [...groupedEvents.values()].sort((a, b) => b.events.length - a.events.length || a.key.localeCompare(b.key));

  for (const item of ordered) {
    let foundIssue = null;
    const marker = markerForKey(item.key);
    for (const issue of openIssues) {
      if (typeof issue.body === "string" && issue.body.includes(marker)) {
        foundIssue = issue;
        break;
      }
    }

    if (!foundIssue) {
      if (issueOpens >= 3 || issueOpensBefore + issueOpens >= globalIssueCap) {
        flaky.push({ key: item.key, workflow: item.workflow, job: item.job, test: item.test, events: item.events,
          action: { type: "skip", issue: null, reason: "cap" } });
        log(`skip ${repo}: ${item.key} (cap)`);
        continue;
      }

      const title = issueTitle(item.test, item.workflow, item.job);
      const body = issueBody({ repo, owner, key: item.key, events: item.events });
      if (apply) {
        try {
          const response = await guarded(["api", "--method", "POST", `repos/${repo}/issues`, "--input", "-"],
            { input: JSON.stringify({ title, body }) });
          const parsed = typeof response === "string" ? JSON.parse(response) : response;
          const number = parsed?.number;
          flaky.push({ key: item.key, workflow: item.workflow, job: item.job, test: item.test, events: item.events,
            action: { type: "open", issue: number ?? null, reason: null } });
          issueOpens += 1;
          if (number != null) openIssues.push({ number, body, pull_request: null });
          log(`opened ${repo}#${number ?? "?"}: ${title}`);
        } catch (error) {
          const message = errorText(error);
          globalWriteError ??= message;
          flaky.push({ key: item.key, workflow: item.workflow, job: item.job, test: item.test, events: item.events,
            action: { type: "open", issue: null, reason: message } });
          issueOpens += 1;
          log(`failed ${repo}: ${message}`);
        }
      } else {
        flaky.push({ key: item.key, workflow: item.workflow, job: item.job, test: item.test, events: item.events,
          action: { type: "open", issue: null, reason: null } });
        issueOpens += 1;
        log(`would open ${repo}: ${title}`);
      }
      continue;
    }

    let comments = [];
    try {
      comments = await fetchAllComments(reader, repo, foundIssue.number);
    } catch (error) {
      const message = errorText(error);
      globalWriteError ??= message;
      flaky.push({ key: item.key, workflow: item.workflow, job: item.job, test: item.test, events: item.events,
        action: { type: "comment", issue: foundIssue.number, reason: message } });
      log(`failed ${repo}#${foundIssue.number}: ${message}`);
      continue;
    }

    const issueText = typeof foundIssue.body === "string" ? foundIssue.body : "";
    const newEvents = item.events.filter((event) => {
      const needle = `/job/${event.job_id}`;
      if (issueText.includes(needle)) return false;
      return !comments.some((comment) => typeof comment.body === "string" && comment.body.includes(needle));
    });

    if (newEvents.length === 0) {
      flaky.push({ key: item.key, workflow: item.workflow, job: item.job, test: item.test, events: item.events,
        action: { type: "none", issue: foundIssue.number, reason: null } });
      continue;
    }

    if (apply) {
      try {
        await guarded(["api", "--method", "POST", `repos/${repo}/issues/${foundIssue.number}/comments`, "--input", "-"],
          { input: JSON.stringify({ body: commentBody(newEvents) }) });
        flaky.push({ key: item.key, workflow: item.workflow, job: item.job, test: item.test, events: item.events,
          action: { type: "comment", issue: foundIssue.number, reason: null } });
        log(`commented ${repo}#${foundIssue.number} (${newEvents.length} new events)`);
      } catch (error) {
        const message = errorText(error);
        globalWriteError ??= message;
        flaky.push({ key: item.key, workflow: item.workflow, job: item.job, test: item.test, events: item.events,
          action: { type: "comment", issue: foundIssue.number, reason: message } });
        log(`failed ${repo}: ${message}`);
      }
    } else {
      flaky.push({ key: item.key, workflow: item.workflow, job: item.job, test: item.test, events: item.events,
        action: { type: "comment", issue: foundIssue.number, reason: null } });
      log(`would comment ${repo}#${foundIssue.number} (${newEvents.length} new events)`);
    }
  }

  return { repo, owner, runs: runs.length, rerunAttempts, truncatedDays, error: globalWriteError, flaky };
}

export async function scanRepositories({ repos, exec, apply = false, window, log = () => {}, retryDelayMs = 2000 }) {
  const all = [];
  let openedGlobal = 0;
  for (const entry of repos) {
    const result = await scanRepository({
      repo: entry.repo,
      owner: entry.owner ?? null,
      exec,
      apply,
      window,
      issueOpensBefore: openedGlobal,
      globalIssueCap: 15,
      log,
      retryDelayMs,
    });

    for (const item of result.flaky) {
      if (item.action.type === "open") openedGlobal += 1;
    }
    all.push(result);
  }
  return all;
}
