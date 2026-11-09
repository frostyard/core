#!/usr/bin/env node
// Backfill of the level labels on open pull requests (ADR-0078,
// docs/specs/pr-triage.md). It reads the open pull requests of each repository
// with `gh api` and runs the levels step on the base SHA of each one, so the
// label set is the label set the workflow would set.
//
// Read-only without --apply: it prints a Markdown plan and writes nothing. With
// --apply it writes only labels on open pull requests, as the signed-in `gh`
// account: it adds a missing level label and risk:high at L1 and L2, and it
// removes a looser level label. It never creates a label, never comments and
// never touches a closed pull request. The logic is in
// scripts/lib/pr-triage-backfill.mjs.
//
// Exit 0 when every read and write worked, 1 when 1 pull request or repository
// had an error (the report is still complete), 2 on a usage error or when the
// token or the GitHub API is not available.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { backfillRepository, formatReport, parseArgs } from "./lib/pr-triage-backfill.mjs";
import { createGitHubApi } from "./lib/risk-paths.mjs";

const execFileAsync = promisify(execFile);

const USAGE = "Usage: node scripts/pr-triage-backfill.mjs [--apply] OWNER/REPO...";

const MAX_BUFFER = 64 * 1024 * 1024;

const firstLine = (error) => String(error?.stderr || error?.message || error).trim().split("\n")[0];

async function token() {
  const fromEnv = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (fromEnv) return fromEnv;
  const { stdout } = await execFileAsync("gh", ["auth", "token"], { encoding: "utf8" });
  const value = stdout.trim();
  if (value === "") throw new Error("gh auth token printed no token");
  return value;
}

// The open pull requests, drafts included, as { number, baseSha }.
async function listOpenPulls(repo) {
  const { stdout } = await execFileAsync(
    "gh",
    ["api", "--paginate", `repos/${repo}/pulls?state=open&per_page=100`, "--jq", ".[] | [.number, .base.sha] | @tsv"],
    { encoding: "utf8", maxBuffer: MAX_BUFFER },
  );
  const pulls = [];
  for (const line of stdout.split("\n")) {
    if (line.trim() === "") continue;
    const [number, baseSha] = line.split("\t");
    pulls.push({ number: Number(number), baseSha });
  }
  return pulls;
}

async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    if (error?.name !== "UsageError") throw error;
    process.stderr.write(`${error.message}\n${USAGE}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  let api;
  try {
    api = createGitHubApi({ token: await token(), fetch: globalThis.fetch });
  } catch (error) {
    process.stderr.write(`cannot read the GitHub token: ${firstLine(error)}\n`);
    return 2;
  }

  const results = [];
  for (const repo of args.repos) {
    const [owner, name] = repo.split("/");
    let pulls;
    try {
      pulls = await listOpenPulls(repo);
    } catch (error) {
      results.push({ repository: repo, rows: [], error: firstLine(error) });
      continue;
    }
    results.push({ repository: repo, rows: await backfillRepository({ api, owner, repo: name, pulls, apply: args.apply }) });
  }

  process.stdout.write(formatReport(results, { apply: args.apply }));
  const failed = results.some((result) => result.error || result.rows.some((row) => row.error));
  if (failed) process.stderr.write("1 or more pull requests or repositories had an error; the report above names each one.\n");
  return failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main(process.argv.slice(2));
}
