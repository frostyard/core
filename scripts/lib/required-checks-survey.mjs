// Pure logic of scripts/required-checks-survey.mjs: build one table row from
// the API data of a repository and format the Markdown table. No I/O here.
import { hasTrigger } from "./workflow-triggers.mjs";

export const LEVEL_LABELS = ["level:L1", "level:L2", "level:L3", "level:L4"];

export const COLUMNS = [
  "Repository",
  "Default branch",
  "Required checks",
  "Strict",
  "Queue",
  "`merge_group` in",
  "PR-triage caller",
  "Level labels",
];

const CALLER_PATTERN =
  /^\s*(?:-\s+)?uses:\s*["']?(?:frostyard\/core\/\.github\/workflows\/(risk-paths|pr-triage)\.yml@([^\s"'#]+)|\.\/\.github\/workflows\/(risk-paths|pr-triage)\.yml)["']?\s*(?:#.*)?$/;

/**
 * The pr-triage and risk-paths callers in one workflow file: strings like
 * `risk-paths.yml → risk-paths.yml@1b02a1290263` (core) or
 * `risk-paths.yml → ./risk-paths.yml` (local), one for each distinct target.
 */
export function parseCallers(fileName, yamlText) {
  const found = [];
  for (const line of String(yamlText).split(/\r?\n/)) {
    const match = CALLER_PATTERN.exec(line);
    if (!match) continue;
    const text = match[1]
      ? `${fileName} → ${match[1]}.yml@${match[2].slice(0, 12)}`
      : `${fileName} → ./${match[3]}.yml`;
    if (!found.includes(text)) found.push(text);
  }
  return found;
}

/** The required-checks cells from the rules that apply to the default branch. */
export function summarizeRules(rules) {
  const contexts = new Map();
  let strictRules = 0;
  let statusRules = 0;
  let queue = false;
  for (const rule of rules) {
    if (rule.type === "merge_queue") queue = true;
    if (rule.type !== "required_status_checks") continue;
    statusRules += 1;
    if (rule.parameters?.strict_required_status_checks_policy === true) strictRules += 1;
    for (const check of rule.parameters?.required_status_checks ?? []) {
      const anyApp = check.integration_id === undefined || check.integration_id === null;
      const text = `\`${check.context}\`${anyApp ? " (any app)" : ""}`;
      contexts.set(text, check.context);
    }
  }
  const sorted = [...contexts.entries()].sort(
    ([textA, contextA], [textB, contextB]) => (contextA < contextB ? -1 : contextA > contextB ? 1 : textA < textB ? -1 : textA > textB ? 1 : 0),
  );
  return {
    checks: sorted.length === 0 ? "none" : sorted.map(([text]) => text).join(", "),
    strict: statusRules === 0 ? "-" : strictRules > 0 ? "yes" : "no",
    queue: queue ? "yes" : "no",
  };
}

/** The `merge_group` and caller cells from `{fileName: yamlText}`. */
export function summarizeWorkflows(workflows) {
  const names = Object.keys(workflows).sort();
  const withQueue = names.filter((name) => hasTrigger(workflows[name], "merge_group"));
  const callers = names.flatMap((name) => parseCallers(name, workflows[name]));
  return {
    mergeGroup: withQueue.length === 0 ? "none" : withQueue.join(", "),
    callers: callers.length === 0 ? "none" : callers.join(", "),
  };
}

/** `n/4`: how many of level:L1 to level:L4 the label list holds (any case). */
export function countLevelLabels(labels) {
  const names = new Set(labels.map((label) => String(label.name).toLowerCase()));
  return `${LEVEL_LABELS.filter((label) => names.has(label.toLowerCase())).length}/${LEVEL_LABELS.length}`;
}

const failed = (reason) => `error: ${reason}`;

/**
 * One table row, as an array of cells, from what the reads returned:
 *   { repo, repository, rules, workflows, labels, errors }
 * `repository` is GET repos/{r}; `rules` is GET rules/branches/{default};
 * `workflows` is {fileName: yamlText} ({} when the repository has none);
 * `labels` is GET labels. A read that failed is missing and has a reason in
 * `errors.repository|rules|workflows|labels`. `failed` tells whether any did.
 */
export function buildRow({ repo, repository, rules, workflows, labels, errors = {} }) {
  const noBranch = errors.repository ? `no default branch (${errors.repository})` : null;
  const rulesError = errors.rules ?? noBranch;
  const workflowsError = errors.workflows ?? noBranch;
  const summary = rulesError ? null : summarizeRules(rules);
  const files = workflowsError ? null : summarizeWorkflows(workflows);
  const cells = [
    repo,
    errors.repository ? failed(errors.repository) : repository.default_branch,
    summary ? summary.checks : failed(rulesError),
    summary ? summary.strict : failed(rulesError),
    summary ? summary.queue : failed(rulesError),
    files ? files.mergeGroup : failed(workflowsError),
    files ? files.callers : failed(workflowsError),
    errors.labels ? failed(errors.labels) : countLevelLabels(labels),
  ];
  return { cells, failed: Object.keys(errors).length > 0 };
}

const escapeCell = (text) => String(text).replaceAll("|", "\\|").replaceAll("\n", " ");

/** The Markdown table for rows from `buildRow` (argument order kept). */
export function formatTable(rows) {
  const line = (cells) => `| ${cells.map(escapeCell).join(" | ")} |`;
  return [line(COLUMNS), line(COLUMNS.map(() => "---")), ...rows.map((row) => line(row.cells))].join("\n") + "\n";
}

/** A short reason from a failed `gh api` call: its first stderr line, at most 100 characters. */
export function shortReason(error) {
  const text = String(error?.stderr || error?.message || error || "unknown error");
  const first = text.split("\n").map((line) => line.trim()).find(Boolean) ?? "unknown error";
  return first.length > 100 ? `${first.slice(0, 97)}...` : first;
}

/** True when a failed `gh api` call is an HTTP 404. */
export function isNotFound(error) {
  return /HTTP 404|Not Found/.test(String(error?.stderr || error?.message || ""));
}
