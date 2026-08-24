#!/usr/bin/env node
// Shell-syntax gate: every tracked scripts/*.sh file parses as valid Bash
// (ADR-0021 CI). Parse-only (`bash -n`) — it never executes a script.
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");

const files = execFileSync("git", ["ls-files", "scripts/*.sh"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);

const failures = [];
for (const file of files) {
  try {
    execFileSync("bash", ["-n", file], { cwd: root, stdio: "pipe" });
  } catch (error) {
    const message = String(error.stderr || error.message).trim().split("\n")[0];
    failures.push(`syntax: ${file}: ${message}`);
  }
}

for (const failure of failures) console.error(`FAIL ${failure}`);
const ok = failures.length === 0;
console.log(`${ok ? "ok  " : "FAIL"} bash_syntax: ${files.length - failures.length}/${files.length}`);
process.exit(ok ? 0 : 1);
