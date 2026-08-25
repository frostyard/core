import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const authLibPath = path.join(repoRoot, "scripts/lib/skills-sync-auth.sh");

const FAKE_TOKEN = "fake-test-token-do-not-use-1234567890";

test("skills_sync_credential_helper is a template, never the literal token value", async () => {
  const { stdout } = await execFileAsync("bash", [
    "-c",
    `GH_TOKEN='${FAKE_TOKEN}'; source "${authLibPath}"; skills_sync_credential_helper`,
  ]);
  const helper = stdout.trim();
  assert.doesNotMatch(helper, new RegExp(FAKE_TOKEN));
  assert.match(helper, /\$GH_TOKEN/);
});

test("skills_sync_credential_helper authenticates git from the environment, not an argument", async () => {
  const { stdout: helperOut } = await execFileAsync("bash", [
    "-c",
    `source "${authLibPath}"; skills_sync_credential_helper`,
  ]);
  const helper = helperOut.trim();

  const scratch = await mkdtemp(path.join(os.tmpdir(), "cred-helper-"));
  const { stdout } = await fillCredential(helper, scratch, FAKE_TOKEN);
  assert.match(stdout, /username=x-access-token/);
  assert.match(stdout, new RegExp(`password=${FAKE_TOKEN}`));
});

function fillCredential(helper, cwd, token) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const child = execFile(
      "git",
      ["-c", `credential.helper=${helper}`, "credential", "fill"],
      { cwd, env: { ...process.env, GH_TOKEN: token } },
      (error) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      },
    );
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.stdin.end("protocol=https\nhost=github.com\n\n");
  });
}
