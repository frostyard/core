import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  detectFlakyEvents,
  issueBody,
  makeGh,
  parseProfiles,
  parseTestNames,
  resolveRepos,
  scanRepositories,
  scanWindow,
  windowDays,
  withReadRetry,
} from "../scripts/lib/flaky-scan.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const cli = path.join(repoRoot, "scripts/flaky-scan.mjs");

function run({ id, attempt = 1, sha = "a".repeat(40), workflow = ".github/workflows/ci.yml" }) {
  return { id, run_attempt: attempt, head_sha: sha, path: workflow };
}

function job({ id, name = "test", conclusion = "failure", attempt = 1, runId = 100, sha = "a".repeat(40), completed = "2026-11-01T12:00:00Z", url = null, steps = [] }) {
  return {
    id,
    name,
    conclusion,
    run_attempt: attempt,
    run_id: runId,
    head_sha: sha,
    completed_at: completed,
    started_at: completed,
    html_url: url ?? `https://github.com/o/r/actions/runs/${runId}/job/${id}`,
    steps,
  };
}

test("detection: rerun and later run on the same SHA", () => {
  const sha = "1".repeat(40);
  const rerun = run({ id: 10, attempt: 2, sha });
  const jobs = new Map([
    ["10:1", [job({ id: 101, runId: 10, attempt: 1, sha })]],
    ["10:2", [job({ id: 102, runId: 10, attempt: 2, sha, conclusion: "success", completed: "2026-11-01T12:01:00Z" })]],
  ]);
  const rerunResult = detectFlakyEvents([rerun], jobs);
  assert.equal(rerunResult.length, 1);
  assert.deepEqual(rerunResult[0].event, {
    run_id: 10,
    attempt: 1,
    job_id: 101,
    sha,
    date: "2026-11-01T12:00:00Z",
    url: "https://github.com/o/r/actions/runs/10/job/101",
  });
  assert.equal(rerunResult[0].workflow, "ci.yml");

  const first = run({ id: 20, attempt: 1, sha });
  const later = run({ id: 21, attempt: 1, sha });
  const laterJobs = new Map([
    ["20:1", [job({ id: 201, runId: 20, sha })]],
    ["21:1", [job({ id: 202, runId: 21, sha, conclusion: "success", completed: "2026-11-01T13:00:00Z" })]],
  ]);
  assert.equal(detectFlakyEvents([first, later], laterJobs).length, 1);
});

test("detection: cross-SHA, success-then-failure, and standalone attempts", async () => {
  const shaA = "a".repeat(40);
  const shaB = "b".repeat(40);

  const crossShaRuns = [
    run({ id: 30, attempt: 1, sha: shaA }),
    run({ id: 31, attempt: 1, sha: shaB }),
  ];
  const crossShaJobs = new Map([
    ["30:1", [job({ id: 300, name: "test", runId: 30, attempt: 1, sha: shaA, conclusion: "failure", completed: "2026-11-01T12:00:00Z" })]],
    ["31:1", [job({ id: 310, name: "test", runId: 31, attempt: 1, sha: shaB, conclusion: "success", completed: "2026-11-01T13:00:00Z" })]],
  ]);
  assert.equal(detectFlakyEvents(crossShaRuns, crossShaJobs).length, 0);

  assert.equal(detectFlakyEvents([
    run({ id: 32, attempt: 1, sha: shaA }),
  ], new Map([
    ["32:1", [job({ id: 320, name: "test", runId: 32, conclusion: "failure", sha: shaA })]],
  ])).length, 0);

  const successThenFailure = detectFlakyEvents([
    run({ id: 33, attempt: 2, sha: shaA }),
  ], new Map([
    ["33:1", [job({ id: 331, name: "test", runId: 33, attempt: 1, conclusion: "success", completed: "2026-11-01T11:00:00Z", sha: shaA })]],
    ["33:2", [job({ id: 332, name: "test", runId: 33, attempt: 2, conclusion: "failure", completed: "2026-11-01T12:00:00Z", sha: shaA })]],
  ]));
  assert.equal(successThenFailure.length, 0);

  const calls = [];
  const exec = async (args) => {
    calls.push(args);
    const key = args.join(" ");
    if (key.includes("/actions/runs?")) {
      return JSON.stringify({ workflow_runs: [
        run({ id: 40, attempt: 1, sha: shaA }),
        run({ id: 41, attempt: 1, sha: shaB }),
        run({ id: 42, attempt: 2, sha: shaA }),
      ] });
    }
    if (key.includes("/attempts/1/jobs") && key.includes("/runs/40/")) {
      return JSON.stringify({ jobs: [job({ id: 400, name: "test", runId: 40, attempt: 1, sha: shaA, conclusion: "failure", completed: "2026-11-01T12:00:00Z" })] });
    }
    if (key.includes("/attempts/1/jobs") && key.includes("/runs/41/")) {
      return JSON.stringify({ jobs: [job({ id: 410, name: "test", runId: 41, attempt: 1, sha: shaB, conclusion: "success", completed: "2026-11-01T13:00:00Z" })] });
    }
    if (key.includes("/attempts/1/jobs") && key.includes("/runs/42/")) {
      return JSON.stringify({ jobs: [job({ id: 420, name: "other", runId: 42, attempt: 1, sha: shaA, conclusion: "failure", completed: "2026-11-01T11:00:00Z" })] });
    }
    if (key.includes("/attempts/2/jobs") && key.includes("/runs/42/")) {
      return JSON.stringify({ jobs: [job({ id: 421, name: "other", runId: 42, attempt: 2, sha: shaA, conclusion: "failure", completed: "2026-11-01T14:00:00Z" })] });
    }
    if (key.includes("/actions/jobs/")) return "";
    if (key.includes("/issues?state=open")) return "[]";
    throw new Error(`unexpected: ${key}`);
  };
  const result = await scanRepositories({
    repos: [{ repo: "o/r", owner: null }], exec, apply: false,
    window: { from: "2026-10-28", to: "2026-11-04T12:00:00Z" },
  });
  assert.equal(result[0].flaky.length, 0);
  assert.equal(calls.filter((args) => args.join(" ").includes("/attempts/")).length, 3);
});

test("same-attempt success does not create a flaky event", () => {
  const sha = "b".repeat(40);
  const rerun = run({ id: 49, attempt: 2, sha });
  const jobs = new Map([
    ["49:1", [
      job({ id: 490, name: "test", runId: 49, attempt: 1, sha, conclusion: "failure", completed: "2026-11-01T12:00:00Z" }),
      job({ id: 491, name: "test", runId: 49, attempt: 1, sha, conclusion: "success", completed: "2026-11-01T12:01:00Z" }),
    ]],
  ]);
  assert.equal(detectFlakyEvents([rerun], jobs).length, 0);

  const sameAttemptWithFailure = new Map([
    ["49:1", [
      job({ id: 492, name: "test", runId: 49, attempt: 1, sha, conclusion: "failure", completed: "2026-11-01T12:00:00Z" }),
      job({ id: 493, name: "test", runId: 49, attempt: 1, sha, conclusion: "success", completed: "2026-11-01T12:01:00Z" }),
    ]],
    ["49:2", [job({ id: 494, name: "test", runId: 49, attempt: 2, sha, conclusion: "failure", completed: "2026-11-01T12:02:00Z" })]],
  ]);
  assert.equal(detectFlakyEvents([rerun], sameAttemptWithFailure).length, 0);
});

test("dedupe keeps the first job id", () => {
  const sha = "c".repeat(40);
  const jobs = new Map([
    ["50:1", [job({ id: 501, name: "test", runId: 50, attempt: 1, sha, conclusion: "failure", completed: "2026-11-01T12:00:00Z" })]],
    ["50:2", [
      job({ id: 501, name: "test", runId: 50, attempt: 2, sha, conclusion: "failure", completed: "2026-11-01T12:01:00Z" }),
      job({ id: 502, name: "test", runId: 50, attempt: 2, sha, conclusion: "success", completed: "2026-11-01T12:02:00Z" }),
    ]],
  ]);
  const result = detectFlakyEvents([run({ id: 50, attempt: 2, sha })], jobs);
  assert.equal(result.length, 1);
  assert.equal(result[0].event.job_id, 501);
});

test("dry run records no write and action is open", async () => {
  const sha = "d".repeat(40);
  const calls = [];
  const exec = async (args, options = {}) => {
    calls.push({ args, input: options.input });
    const key = args.join(" ");
    if (key.includes("/actions/runs?")) return JSON.stringify({ workflow_runs: [run({ id: 60, attempt: 2, sha })] });
    if (key.includes("/attempts/1/jobs")) return JSON.stringify({ jobs: [job({ id: 601, name: "test", runId: 60, attempt: 1, sha })] });
    if (key.includes("/attempts/2/jobs")) return JSON.stringify({ jobs: [job({ id: 602, name: "test", runId: 60, attempt: 2, sha, conclusion: "success", completed: "2026-11-02T12:00:00Z" })] });
    if (key.includes("/actions/jobs/601/logs")) return "FAILED tests/a.py::test_a\n";
    if (key.includes("/issues?state=open")) return "[]";
    throw new Error(`unexpected: ${key}`);
  };
  const lines = [];
  const result = await scanRepositories({ repos: [{ repo: "o/r", owner: null }], exec, apply: false,
    window: { from: "2026-10-28", to: "2026-11-04T12:00:00Z" }, log: (line) => lines.push(line) });
  assert.equal(result[0].flaky[0].action.type, "open");
  assert.deepEqual(lines, ["would open o/r: flaky: tests/a.py::test_a (ci.yml / test)"]);
  assert.equal(calls.filter((call) => call.args.includes("--method")).length, 0);
});

test("open marker comments only new events and an already reported event gives none", async () => {
  const sha = "e".repeat(40);
  const marker = "<!-- flaky-scan key=o/r/ci.yml/test/tests/a.py::test_a -->";

  async function scan(apply, issueBodyText) {
    const calls = [];
    const exec = async (args, options = {}) => {
      calls.push({ args, input: options.input });
      const key = args.join(" ");
      if (key.includes("/actions/runs?")) return JSON.stringify({ workflow_runs: [run({ id: 70, attempt: 2, sha })] });
      if (key.includes("/attempts/1/jobs")) return JSON.stringify({ jobs: [job({ id: 701, name: "test", runId: 70, attempt: 1, sha })] });
      if (key.includes("/attempts/2/jobs")) return JSON.stringify({ jobs: [job({ id: 702, name: "test", runId: 70, attempt: 2, sha, conclusion: "success", completed: "2026-11-02T12:00:00Z" })] });
      if (key.includes("/actions/jobs/701/logs")) return "FAILED tests/a.py::test_a\n";
      if (key.includes("/issues?state=open")) return JSON.stringify([{ number: 12, body: `${issueBodyText}\n${marker}` }]);
      if (key.includes("/issues/12/comments?")) return "[]";
      if (key === "api --method POST repos/o/r/issues/12/comments --input -") return "{}";
      throw new Error(`unexpected: ${key}`);
    };
    const result = await scanRepositories({ repos: [{ repo: "o/r", owner: null }], exec, apply,
      window: { from: "2026-10-28", to: "2026-11-04T12:00:00Z" } });
    return { result, calls };
  }

  const newEvent = await scan(true, "No job reference");
  assert.equal(newEvent.result[0].flaky[0].action.type, "comment");
  const issuePost = ["api", "--method", "POST", "repos/o/r/issues", "--input", "-"];
  assert.equal(newEvent.calls.filter((call) => JSON.stringify(call.args) === JSON.stringify(issuePost)).length, 0);
  const commentPost = newEvent.calls.find((call) => call.args.join(" ").includes("issues/12/comments") && call.args.includes("--method"));
  assert.ok(commentPost);
  assert.match(commentPost.input, /\/job\/701/);
  assert.equal(commentPost.input.includes(marker), false);

  const reported = await scan(true, "https://github.com/o/r/actions/runs/70/job/701");
  assert.equal(reported.result[0].flaky[0].action.type, "none");
  assert.equal(reported.calls.filter((call) => call.args.includes("--method") && call.args.join(" ").includes("comments")).length, 0);
});

test("comments read failure keeps completed opens and preserves the 15-run cap", async () => {
  let issuePostCount = 0;
  const exec = async (args) => {
    const key = args.join(" ");
    if (key.includes("/actions/runs?")) {
      const repoMatch = key.match(/repos\/([^/]+\/[^/]+)\/actions\/runs/);
      const repo = repoMatch?.[1];
      const repoIndex = repo ? Number(repo.slice(-1)) : 0;
      const keyCount = repoIndex === 0 ? 4 : 3;
      const runs = [];
      for (let i = 0; i < keyCount; i += 1) {
        runs.push(run({ id: 2000 + repoIndex * 100 + i, attempt: 2, sha: String(i + 1).repeat(40) }));
      }
      return JSON.stringify({ workflow_runs: runs });
    }
    if (key.includes("/attempts/")) {
      const runMatch = key.match(/runs\/([0-9]+)\/attempts\/([12])/);
      const runId = Number(runMatch?.[1]);
      const attempt = Number(runMatch?.[2]);
      const index = runId % 100;
      const conclusion = attempt === 1 ? "failure" : "success";
      return JSON.stringify({ jobs: [job({
        id: runId * 10 + (attempt === 2 ? 1 : 0),
        name: `job-${index}`,
        runId,
        attempt,
        sha: String(index + 1).repeat(40),
        conclusion,
        completed: attempt === 1 ? "2026-11-01T12:00:00Z" : "2026-11-01T12:01:00Z",
      })] });
    }
    if (key.includes("/actions/jobs/")) return "";
    if (key.includes("/issues?state=open")) {
      if (key.includes("repos/o/r0/issues")) {
        return JSON.stringify([{ number: 44, body: "<!-- flaky-scan key=o/r0/ci.yml/job-3/job-3 -->" }]);
      }
      return "[]";
    }
    if (key.includes("/issues/44/comments?")) throw new Error("comments unavailable");
    if (key.includes("--method POST") && key.includes("/issues --input -")) {
      issuePostCount += 1;
      return JSON.stringify({ number: 100 + issuePostCount });
    }
    throw new Error(`unexpected: ${key}`);
  };

  const repos = [];
  for (let r = 0; r < 6; r += 1) repos.push({ repo: `o/r${r}`, owner: null });
  const lines = [];
  const result = await scanRepositories({ repos, exec, apply: true,
    window: { from: "2026-10-28", to: "2026-11-04T12:00:00Z" }, log: (line) => lines.push(line) });

  const repo0Opens = result[0].flaky.filter((item) => item.action.type === "open").length;
  assert.equal(repo0Opens, 3);
  assert.notEqual(result[0].error, null);
  assert.equal(result[0].flaky.some((item) => item.action.type === "comment" && item.action.reason === "comments unavailable"), true);

  const opens = result.reduce((sum, item) => sum + item.flaky.filter((entry) => entry.action.type === "open").length, 0);
  assert.equal(opens, 15);
  assert.equal(issuePostCount, 15);
  assert.equal(lines.some((line) => line === "failed o/r0#44: comments unavailable"), true);
});

test("caps: 5 keys in one repo and 15 opens plus 3 skips across 6 repos", async () => {
  async function makeScan(repoCount, keysPerRepo) {
    let issuePostCount = 0;
    const exec = async (args, options = {}) => {
      const key = args.join(" ");
      if (key.includes("/actions/runs?")) {
        const repoMatch = key.match(/repos\/([^/]+\/[^/]+)\/actions\/runs/);
        const repo = repoMatch?.[1];
        const repoIndex = repo ? Number(repo.slice(-1)) : 0;
        const runs = [];
        for (let i = 0; i < keysPerRepo; i += 1) {
          runs.push(run({ id: 1000 + repoIndex * 100 + i, attempt: 2, sha: String(i + 1).repeat(40) }));
        }
        return JSON.stringify({ workflow_runs: runs });
      }
      if (key.includes("/attempts/")) {
        const runMatch = key.match(/runs\/([0-9]+)\/attempts\/([12])/);
        const runId = Number(runMatch?.[1]);
        const attempt = Number(runMatch?.[2]);
        const index = runId % 100;
        return JSON.stringify({ jobs: [job({
          id: runId * 10 + (attempt === 2 ? 1 : 0),
          name: `job-${index}`,
          runId,
          attempt,
          sha: String(index + 1).repeat(40),
          conclusion: attempt === 1 ? "failure" : "success",
          completed: attempt === 1 ? "2026-11-01T12:00:00Z" : "2026-11-01T12:01:00Z",
        })] });
      }
      if (key.includes("/actions/jobs/")) return "";
      if (key.includes("/issues?state=open")) return "[]";
      if (key === "api --method POST repos/o/r/issues --input -" || key.includes("--method POST") && key.includes("/issues --input -")) {
        issuePostCount += 1;
        return JSON.stringify({ number: 100 + issuePostCount });
      }
      throw new Error(`unexpected: ${key}`);
    };
    const repos = [];
    for (let r = 0; r < repoCount; r += 1) repos.push({ repo: `o/r${r}`, owner: null });
    const result = await scanRepositories({ repos, exec, apply: true,
      window: { from: "2026-10-28", to: "2026-11-04T12:00:00Z" } });
    return { result, issuePostCount: () => issuePostCount };
  }

  const five = await makeScan(1, 5);
  assert.equal(five.result[0].flaky.filter((item) => item.action.type === "open").length, 3);
  assert.equal(five.result[0].flaky.filter((item) => item.action.type === "skip").length, 2);

  const six = await makeScan(6, 3);
  const opens = six.result.reduce((sum, item) => sum + item.flaky.filter((entry) => entry.action.type === "open").length, 0);
  const skips = six.result.reduce((sum, item) => sum + item.flaky.filter((entry) => entry.action.type === "skip").length, 0);
  assert.equal(opens, 15);
  assert.equal(skips, 3);
  assert.equal(six.issuePostCount(), 15);
});

test("guard rejects dry-run writes and unknown apply writes", async () => {
  let called = false;
  const exec = async () => { called = true; return "ok"; };
  const dry = makeGh({ exec, apply: false });
  await assert.rejects(dry(["api", "--method", "POST", "repos/o/r/issues", "--input", "-"], { input: "{}" }));
  assert.equal(called, false);

  const apply = makeGh({ exec, apply: true });
  await assert.rejects(apply(["api", "--method", "POST", "repos/o/r/issues/1/comments", "-X", "POST"], { input: "{}" }));
  await assert.rejects(apply(["api", "--method", "DELETE", "repos/o/r/issues", "--input", "-"], { input: "{}" }));
});

test("test name parsing: Go, TAP, pytest, and step fallback", () => {
  assert.deepEqual(parseTestNames("2026-11-01T12:00:00Z --- FAIL: TestSuite/Sub\n--- FAIL: TestSuite\n--- FAIL: TestOther\n", { name: "job" }), ["TestSuite/Sub", "TestOther"]);
  assert.deepEqual(parseTestNames("  not ok 3 - should work  # todo\n", { name: "job" }), ["should work"]);
  assert.deepEqual(parseTestNames("FAILED tests/test_api.py::test_login\n", { name: "job" }), ["tests/test_api.py::test_login"]);
  assert.deepEqual(parseTestNames("no match", { name: "job", steps: [{ name: "unit", conclusion: "failure" }] }), ["unit"]);
  assert.deepEqual(parseTestNames("no match", { name: "fallback job", steps: [] }), ["fallback job"]);
});

test("scanner log fetch throws and uses the failed step name", async () => {
  const sha = "f".repeat(40);
  const exec = async (args) => {
    const key = args.join(" ");
    if (key.includes("/actions/runs?")) return JSON.stringify({ workflow_runs: [run({ id: 80, attempt: 2, sha })] });
    if (key.includes("/attempts/1/jobs")) return JSON.stringify({ jobs: [job({ id: 801, name: "test", runId: 80, attempt: 1, sha, steps: [{ name: "unit", conclusion: "failure" }] })] });
    if (key.includes("/attempts/2/jobs")) return JSON.stringify({ jobs: [job({ id: 802, name: "test", runId: 80, attempt: 2, sha, conclusion: "success", completed: "2026-11-02T12:00:00Z" })] });
    if (key.includes("/actions/jobs/801/logs")) throw new Error("log unavailable");
    if (key.includes("/issues?state=open")) return "[]";
    throw new Error(`unexpected: ${key}`);
  };
  const result = await scanRepositories({ repos: [{ repo: "o/r", owner: null }], exec, apply: false,
    window: { from: "2026-10-28", to: "2026-11-04T12:00:00Z" } });
  assert.equal(result[0].flaky[0].key.endsWith("/unit"), true);
});

test("--out JSON shape is pinned in the CLI output", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "flaky-out-"));
  const fake = path.join(temp, "gh");
  const log = path.join(temp, "gh.log");
  const fixture = path.join(temp, "fixture.json");
  const out = path.join(temp, "out.json");

  await writeFile(fake, `#!/usr/bin/env node
import fs from "node:fs";
const fixture = JSON.parse(fs.readFileSync(process.env.FLAKY_FIXTURE, "utf8"));
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FLAKY_LOG, JSON.stringify(args) + "\\n");
const key = args.join(" ");
if (!Object.hasOwn(fixture.responses, key)) {
  process.stderr.write("unknown path: " + key + "\\n");
  process.exit(1);
}
const response = fixture.responses[key];
process.stdout.write(typeof response === "string" ? response : JSON.stringify(response));
`, "utf8");
  await chmod(fake, 0o755);

  const sha = "f".repeat(40);
  await writeFile(fixture, JSON.stringify({ responses: {
    ...Object.fromEntries(["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"]
      .map((day) => [`api repos/o/r/actions/runs?created=${day}&per_page=100&page=1`, { workflow_runs: [] }])),
    "api repos/o/r/actions/runs?created=2026-11-01&per_page=100&page=1": { workflow_runs: [run({ id: 90, attempt: 2, sha })] },
    "api repos/o/r/actions/runs/90/attempts/1/jobs?per_page=100&page=1": { jobs: [job({ id: 901, name: "test", runId: 90, attempt: 1, sha })] },
    "api repos/o/r/actions/runs/90/attempts/2/jobs?per_page=100&page=1": { jobs: [job({ id: 902, name: "test", runId: 90, attempt: 2, sha, conclusion: "success", completed: "2026-11-02T12:00:00Z" })] },
    "api repos/o/r/actions/jobs/901/logs": "FAILED tests/a.py::test_a\n",
    "api repos/o/r/issues?state=open&per_page=100&page=1": [],
  } }), "utf8");

  const env = { ...process.env, PATH: `${temp}:${process.env.PATH}`, FLAKY_FIXTURE: fixture, FLAKY_LOG: log };
  const { stdout } = await execFileAsync(process.execPath, [cli, "--repo", "o/r", "--out", out, "--now", "2026-11-04T12:00:00.000Z"], { cwd: repoRoot, env });
  assert.equal(stdout.trim(), "would open o/r: flaky: tests/a.py::test_a (ci.yml / test)");

  const parsed = JSON.parse(await readFile(out, "utf8"));
  assert.deepEqual(parsed, {
    schema_version: 1,
    generated_at: "2026-11-04T12:00:00.000Z",
    window: { from: "2026-10-28", to: "2026-11-04T12:00:00.000Z" },
    apply: false,
    repos: [{
      repo: "o/r", owner: null, runs: 1, rerunAttempts: 1, truncatedDays: [], error: null,
      flaky: [{
        key: "o/r/ci.yml/test/tests/a.py::test_a",
        workflow: "ci.yml", job: "test", test: "tests/a.py::test_a",
        events: [{ run_id: 90, attempt: 1, job_id: 901, sha, date: "2026-11-01T12:00:00Z", url: "https://github.com/o/r/actions/runs/90/job/901" }],
        action: { type: "open", issue: null, reason: null },
      }],
    }],
  });

  const calls = (await readFile(log, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(calls.some((args) => args.includes("--method")), false);
});

test("profile parsing and CLI usage", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "flaky-profiles-"));
  const profiles = path.join(temp, "profiles");
  await mkdir(profiles);
  await writeFile(path.join(profiles, "zeta.md"), "---\nrepositories:\n  zeta/repo: ./zeta\n---\n", "utf8");
  await writeFile(path.join(profiles, "alpha.md"), "---\nrepositories:\n  alpha/repo: ./alpha\n---\n", "utf8");
  await writeFile(path.join(profiles, "alpha.md.bak"), "---\nrepositories:\n  bad/repo: ./bad\n---\n", "utf8");

  const parsed = await parseProfiles(profiles);
  assert.deepEqual(parsed.repos, ["alpha/repo", "zeta/repo"]);
  assert.deepEqual(resolveRepos(["alpha/repo", "extra/repo"], parsed), [
    { repo: "alpha/repo", owner: "alpha" },
    { repo: "extra/repo", owner: null },
    { repo: "zeta/repo", owner: "zeta" },
  ]);
  assert.deepEqual(scanWindow(new Date("2026-11-04T12:34:56.000Z"), 7), {
    from: "2026-10-28", to: "2026-11-04T12:34:56.000Z",
  });
  assert.equal(issueBody({ repo: "o/r", owner: null, key: "o/r/a", events: [] }).split("\n").at(-1), "<!-- flaky-scan key=o/r/a -->");

  await assert.rejects(execFileAsync(process.execPath, [cli], { cwd: repoRoot }), (error) => {
    assert.equal(error.code, 2);
    assert.match(error.stderr, /At least 1 repository is required/);
    return true;
  });
});

const WEEK = { from: "2026-10-28", to: "2026-11-04T12:00:00.000Z" };

test("windowDays lists every UTC day from the start to the day of --now", () => {
  assert.deepEqual(windowDays(WEEK), [
    "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04",
  ]);
});

test("runs are read 1 day at a time, deduped by id, and a day with 1000 runs is reported", async () => {
  const calls = [];
  const lines = [];
  const exec = async (args) => {
    const key = args.join(" ");
    calls.push(key);
    const match = /actions\/runs\?created=(\d{4}-\d\d-\d\d)&per_page=100&page=(\d+)$/.exec(key);
    if (match) {
      const [, day, page] = match;
      if (day === "2026-10-30") {
        // 10 full pages: the API limit for 1 query.
        const base = 100_000 + Number(page) * 100;
        return JSON.stringify({ workflow_runs: Array.from({ length: 100 }, (_, i) => run({ id: base + i, sha: `${base + i}`.padStart(40, "0") })) });
      }
      // The same run on 2 days counts once.
      if (day === "2026-11-01" || day === "2026-11-02") return JSON.stringify({ workflow_runs: [run({ id: 7, sha: "7".repeat(40) })] });
      return JSON.stringify({ workflow_runs: [] });
    }
    if (key.includes("/issues?state=open")) return "[]";
    throw new Error(`unexpected: ${key}`);
  };
  const [result] = await scanRepositories({ repos: [{ repo: "o/r", owner: null }], exec, window: WEEK, log: (line) => lines.push(line) });
  const runCalls = calls.filter((key) => key.includes("/actions/runs?"));
  assert.equal(runCalls.filter((key) => key.includes("created=2026-10-30")).length, 10);
  assert.equal(runCalls.length, 7 + 10);
  assert.equal(runCalls.some((key) => key.includes(">=")), false);
  assert.equal(result.runs, 1000 + 1);
  assert.deepEqual(result.truncatedDays, ["2026-10-30"]);
  assert.deepEqual(lines, ["warn o/r: 2026-10-30 has 1000 runs or more; the runs API returns no more"]);
});

test("GitHub-generated dynamic runs (Dependabot) are no flaky events and are not counted", async () => {
  const sha = "9".repeat(40);
  const dependabot = "dynamic/dependabot/dependabot-updates";
  const calls = [];
  const exec = async (args) => {
    const key = args.join(" ");
    calls.push(key);
    if (key.includes("/actions/runs?created=2026-11-01&")) {
      // 2 ecosystems on 1 SHA: 1 fails, 1 passes, same job name.
      return JSON.stringify({ workflow_runs: [run({ id: 1, sha, workflow: dependabot }), run({ id: 2, sha, workflow: dependabot })] });
    }
    if (key.includes("/actions/runs?")) return JSON.stringify({ workflow_runs: [] });
    if (key.includes("/attempts/1/jobs") && key.includes("runs/1/")) {
      return JSON.stringify({ jobs: [job({ id: 11, name: "Dependabot", runId: 1, sha, conclusion: "failure" })] });
    }
    if (key.includes("/attempts/1/jobs") && key.includes("runs/2/")) {
      return JSON.stringify({ jobs: [job({ id: 21, name: "Dependabot", runId: 2, sha, conclusion: "success", completed: "2026-11-01T13:00:00Z" })] });
    }
    if (key.includes("/actions/jobs/")) return "";
    if (key.includes("/issues?state=open")) return "[]";
    throw new Error(`unexpected: ${key}`);
  };
  const [result] = await scanRepositories({ repos: [{ repo: "o/r", owner: null }], exec, window: WEEK });
  assert.deepEqual(result.flaky, []);
  assert.equal(result.runs, 0);
  assert.equal(calls.some((key) => key.includes("/attempts/")), false);
});

test("a 5xx read is retried once; a 5xx write is not retried", async () => {
  let runsCalls = 0;
  const exec = async (args) => {
    const key = args.join(" ");
    if (key.includes("/actions/runs?created=2026-10-28&")) {
      runsCalls += 1;
      if (runsCalls === 1) throw new Error("gh: Server Error (HTTP 502)");
    }
    if (key.includes("/actions/runs?")) return JSON.stringify({ workflow_runs: [] });
    if (key.includes("/issues?state=open")) return "[]";
    throw new Error(`unexpected: ${key}`);
  };
  const [result] = await scanRepositories({ repos: [{ repo: "o/r", owner: null }], exec, window: WEEK, retryDelayMs: 0 });
  assert.equal(runsCalls, 2);
  assert.equal(result.error, null);
  assert.equal(result.runs, 0);

  let attempts = 0;
  const flaky = withReadRetry(async () => { attempts += 1; throw new Error("gh: Server Error (HTTP 503)"); }, { delayMs: 0 });
  await assert.rejects(flaky(["api", "repos/o/r/issues?state=open&per_page=100&page=1"]));
  assert.equal(attempts, 2);

  attempts = 0;
  await assert.rejects(flaky(["api", "--method", "POST", "repos/o/r/issues", "--input", "-"], { input: "{}" }));
  assert.equal(attempts, 1);

  attempts = 0;
  const notFound = withReadRetry(async () => { attempts += 1; throw new Error("gh: Not Found (HTTP 404)"); }, { delayMs: 0 });
  await assert.rejects(notFound(["api", "repos/o/r/actions/runs?created=2026-10-28&per_page=100&page=1"]));
  assert.equal(attempts, 1);
});
