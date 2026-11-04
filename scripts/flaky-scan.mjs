#!/usr/bin/env node
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";

import {
  FlakyScanError,
  parseProfiles,
  parseArgs,
  resolveRepos,
  scanRepositories,
  scanWindow,
} from "./lib/flaky-scan.mjs";

function usage() {
  return "Usage: node scripts/flaky-scan.mjs [--repo owner/name]... [--profiles DIR] [--days N] [--out FILE] [--apply] [--now ISO]";
}

function ghExec(args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        error.message = `${error.message}${stderr ? `: ${String(stderr).trim()}` : ""}`;
        reject(error);
      } else {
        resolve(stdout);
      }
    });
    child.stdin.end(input);
  });
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`${usage()}\n${error.message}`);
    process.exitCode = 2;
    return;
  }

  let profileInfo;
  try {
    profileInfo = await parseProfiles(args.profiles);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
    return;
  }

  const repos = resolveRepos(args.repos, profileInfo);
  if (repos.length === 0) {
    console.error(`${usage()}\nAt least 1 repository is required`);
    process.exitCode = 2;
    return;
  }

  let now;
  try {
    now = args.now ? new Date(args.now) : new Date();
    if (Number.isNaN(now.valueOf())) throw new FlakyScanError(`invalid --now: ${args.now}`);
  } catch (error) {
    console.error(`${usage()}\n${error.message}`);
    process.exitCode = 2;
    return;
  }

  const window = scanWindow(now, args.days);
  const repoResults = await scanRepositories({
    repos,
    exec: ghExec,
    apply: args.apply,
    window,
    log: (line) => {
      if (line.startsWith("failed ")) console.error(line);
      else console.log(line);
    },
  });

  const report = {
    schema_version: 1,
    generated_at: now.toISOString(),
    window,
    apply: args.apply,
    repos: repoResults,
  };

  if (args.out) {
    try {
      await writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    } catch (error) {
      console.error(`could not write --out file ${args.out}: ${error.message}`);
      process.exitCode = 1;
      return;
    }
  }

  process.exitCode = repoResults.some((repo) => repo.error !== null || repo.runs === null) ? 1 : 0;
}

await main();
