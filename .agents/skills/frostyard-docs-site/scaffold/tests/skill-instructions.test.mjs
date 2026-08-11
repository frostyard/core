import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("apply instructions require project-specific landing copy", async () => {
  const skill = await readFile(new URL("../../SKILL.md", import.meta.url), "utf8");

  assert.match(skill, /Fill the four base values and the `landing` object/);
  assert.match(skill, /two short headline beats/);
  assert.match(skill, /exactly three summary points/);
  assert.match(skill, /ask the user for the missing landing copy/);
});
