#!/usr/bin/env node
// Read-only survey of the required status checks on frostyard repositories
// (ADR-0076 and the repository baseline). It prints a Markdown table, 1 row per
// repository in argument order, and makes only `gh api` GET calls. Exit 0 when
// every read worked, 1 when a read failed (the table is still complete), 2 on a
// usage error. The row logic is in scripts/lib/required-checks-survey.mjs.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { buildRow, formatTable, isNotFound, shortReason } from "./lib/required-checks-survey.mjs";

const execFileAsync = promisify(execFile);

const USAGE = "Usage: node scripts/required-checks-survey.mjs OWNER/REPO...";

function ghGet(endpoint, { raw = false } = {}) {
  const args = ["api"];
  if (raw) args.push("-H", "Accept: application/vnd.github.raw");
  args.push(endpoint);
  return execFileAsync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).then((result) => result.stdout);
}

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

// Every page of a list endpoint, joined (100 items a page). Throws when a page
// read fails or the pages do not end within MAX_PAGES.
async function allPages(endpoint) {
  const items = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const batch = JSON.parse(await ghGet(`${endpoint}?per_page=${PAGE_SIZE}&page=${page}`));
    items.push(...batch);
    if (batch.length < PAGE_SIZE) return items;
  }
  throw new Error(`more than ${MAX_PAGES} pages of ${PAGE_SIZE} for ${endpoint}`);
}

async function attempt(read) {
  try {
    return { value: await read() };
  } catch (error) {
    return { error };
  }
}

// Every read of 1 repository. A failed read is recorded, never thrown.
async function collect(repo) {
  const data = { repo, errors: {} };
  const repository = await attempt(async () => JSON.parse(await ghGet(`repos/${repo}`)));
  if (repository.error) {
    data.errors.repository = shortReason(repository.error);
    data.workflows = {};
  } else {
    data.repository = repository.value;
    const branch = encodeURIComponent(repository.value.default_branch);

    const rules = await attempt(async () => JSON.parse(await ghGet(`repos/${repo}/rules/branches/${branch}`)));
    if (rules.error) data.errors.rules = shortReason(rules.error);
    else data.rules = rules.value;

    const listing = await attempt(async () => JSON.parse(await ghGet(`repos/${repo}/contents/.github/workflows?ref=${branch}`)));
    if (listing.error) {
      // A repository with no .github/workflows directory has no workflows.
      if (isNotFound(listing.error)) data.workflows = {};
      else data.errors.workflows = shortReason(listing.error);
    } else {
      const files = listing.value.filter((entry) => entry.type === "file" && /\.ya?ml$/.test(entry.name));
      const texts = await Promise.all(
        files.map(async (entry) => ({
          name: entry.name,
          ...(await attempt(() => ghGet(`repos/${repo}/contents/.github/workflows/${entry.name}?ref=${branch}`, { raw: true }))),
        })),
      );
      const broken = texts.find((text) => text.error);
      if (broken) data.errors.workflows = `cannot read ${broken.name}: ${shortReason(broken.error)}`;
      else data.workflows = Object.fromEntries(texts.map((text) => [text.name, text.value]));
    }
  }

  const labels = await attempt(() => allPages(`repos/${repo}/labels`));
  if (labels.error) data.errors.labels = shortReason(labels.error);
  else data.labels = labels.value;
  return data;
}

async function main(argv) {
  if (argv.length === 0 || argv.some((arg) => arg.startsWith("-") || !/^[^/\s]+\/[^/\s]+$/.test(arg))) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const rows = [];
  for (const repo of argv) rows.push(buildRow(await collect(repo)));
  process.stdout.write(formatTable(rows));
  const bad = rows.filter((row) => row.failed).length;
  if (bad > 0) process.stderr.write(`${bad} repository row(s) have a read that failed.\n`);
  return bad > 0 ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main(process.argv.slice(2));
}
