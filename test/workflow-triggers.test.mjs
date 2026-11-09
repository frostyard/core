import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { hasTrigger, triggerEvents } from "../scripts/lib/workflow-triggers.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helper = path.join(repoRoot, "scripts/lib/workflow-triggers.mjs");

const JOBS = "jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n";

const PRESENT = {
  "scalar": `name: x\non: merge_group\n${JOBS}`,
  "scalar with a comment": `on: merge_group # queue\n${JOBS}`,
  "quoted scalar": `on: "merge_group"\n${JOBS}`,
  "flow list": `on: [pull_request, merge_group]\n${JOBS}`,
  "flow list over lines": `on: [\n  pull_request,\n  merge_group, # queue\n]\n${JOBS}`,
  "flow mapping": `on: { push: {}, merge_group: {} }\n${JOBS}`,
  "block mapping, key alone": `on:\n  pull_request:\n  merge_group:\n${JOBS}`,
  "block mapping, key with a value": `on:\n  pull_request:\n    branches: [main]\n  merge_group:\n    types: [checks_requested]\n${JOBS}`,
  "block list": `on:\n  - pull_request\n  - merge_group\n${JOBS}`,
  "block list at the key's indent": `on:\n- pull_request\n- merge_group\n${JOBS}`,
  'double-quoted "on" key': `"on":\n  merge_group:\n${JOBS}`,
  "single-quoted 'on' key": `'on':\n  merge_group:\n${JOBS}`,
  "YAML 1.1 true key": `true:\n  merge_group:\n${JOBS}`,
  "CRLF line ends": `on:\r\n  merge_group:\r\n${JOBS}`,
  "key after other top-level keys": `name: x\npermissions: {}\non:\n  merge_group:\njobs: {}\n`,
};

for (const [name, text] of Object.entries(PRESENT)) {
  test(`hasTrigger finds merge_group: ${name}`, () => {
    assert.equal(hasTrigger(text, "merge_group"), true, text);
  });
}

const ABSENT = {
  "other events only": `on:\n  pull_request:\n  push:\n${JOBS}`,
  "scalar of another event": `on: pull_request\n${JOBS}`,
  "flow list without it": `on: [pull_request, push]\n${JOBS}`,
  "merge_group in a comment": `on:\n  pull_request:\n  # merge_group:\n${JOBS}`,
  "merge_group in a trailing comment": `on: pull_request # merge_group\n${JOBS}`,
  "merge_group under jobs": `on:\n  pull_request:\njobs:\n  merge_group:\n    runs-on: x\n  other:\n    steps:\n      - run: echo merge_group\n`,
  "merge_group as a job step name": `on: push\njobs:\n  build:\n    steps:\n      - name: merge_group\n`,
  "merge_group nested under another event": `on:\n  pull_request:\n    branches:\n      - merge_group\n${JOBS}`,
  "a longer event name": `on:\n  merge_group_extra:\n${JOBS}`,
  "no on key": `name: x\n${JOBS}`,
  "empty on key": `on:\njobs: {}\n`,
  "empty text": "",
  "merge_group in the workflow name": `name: merge_group\non: push\n${JOBS}`,
};

for (const [name, text] of Object.entries(ABSENT)) {
  test(`hasTrigger does not find merge_group: ${name}`, () => {
    assert.equal(hasTrigger(text, "merge_group"), false, text);
  });
}

test("hasTrigger takes the event name as a parameter", () => {
  const text = "on:\n  pull_request_target:\n    types: [opened]\n  merge_group:\n";
  assert.equal(hasTrigger(text, "pull_request_target"), true);
  assert.equal(hasTrigger(text, "merge_group"), true);
  assert.equal(hasTrigger(text, "push"), false);
  assert.deepEqual(triggerEvents(text), ["pull_request_target", "merge_group"]);
});

test("the caller workflow of core's pr-triage has no merge_group", () => {
  const text = [
    "name: PR triage",
    "on:",
    "  pull_request_target:",
    "    types: [opened, synchronize, reopened, edited, labeled]",
    "permissions: {}",
    "jobs:",
    "  pr-triage:",
    "    permissions:",
    "      contents: read",
    "      pull-requests: write",
    "    uses: frostyard/core/.github/workflows/pr-triage.yml@0123456789abcdef0123456789abcdef01234567",
    "",
  ].join("\n");
  assert.equal(hasTrigger(text, "merge_group"), false);
  assert.equal(hasTrigger(text, "pull_request_target"), true);
});

test("the CLI exits 0 when the event is present and 1 when it is absent", () => {
  const present = spawnSync("node", [helper, "merge_group"], { input: "on:\n  merge_group:\n", encoding: "utf8" });
  assert.equal(present.status, 0, present.stderr);
  const absent = spawnSync("node", [helper, "merge_group"], { input: "on: push\n", encoding: "utf8" });
  assert.equal(absent.status, 1, absent.stderr);
});

test("the CLI exits 2 without an event", () => {
  const result = spawnSync("node", [helper], { input: "", encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage/);
});
