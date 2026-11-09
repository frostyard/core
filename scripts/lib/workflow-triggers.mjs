#!/usr/bin/env node
// Tell whether a GitHub Actions workflow lists an event under its `on:` key.
// Core carries no YAML dependency (package.json: ajv and jsonc-parser only), so
// this reads the one shape that matters: the top-level `on:` key and the event
// names it holds. Supported forms:
//   on: merge_group                      (scalar)
//   on: [pull_request, merge_group]      (flow list; may span lines)
//   on: { merge_group: {} }              (flow mapping; may span lines)
//   on:\n  merge_group:\n  ...           (block mapping, with or without a value)
//   on:\n  - merge_group                 (block list, indented or not)
//   "on": / 'on': / true:                (quoted key; the YAML 1.1 boolean key)
// Comments and the keys of other top-level sections (for example `jobs:`) are
// ignored. CLI: `node scripts/lib/workflow-triggers.mjs <event> < workflow.yml`
// exits 0 when the event is present and 1 when it is absent (2: usage error).
import { fileURLToPath } from "node:url";

// Drop a trailing comment: a `#` at line start or after whitespace, outside quotes.
function stripComment(line) {
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "#" && (index === 0 || /\s/.test(line[index - 1]))) {
      return line.slice(0, index);
    }
  }
  return line;
}

function unquote(text) {
  const value = text.trim();
  if (value.length >= 2) {
    const first = value[0];
    if ((first === '"' || first === "'") && value.endsWith(first)) return value.slice(1, -1);
  }
  return value;
}

// The key of a `key:` or `key: value` text, or null when the text is no mapping entry.
function entryKey(text) {
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === ":" && (index === text.length - 1 || /\s/.test(text[index + 1]))) {
      return unquote(text.slice(0, index));
    }
  }
  return null;
}

// Split a flow collection's inner text at top-level commas.
function splitFlow(inner) {
  const items = [];
  let depth = 0;
  let quote = null;
  let current = "";
  for (const char of inner) {
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "[" || char === "{") depth += 1;
    else if (char === "]" || char === "}") depth -= 1;
    if (char === "," && depth === 0 && !quote) {
      items.push(current);
      current = "";
    } else current += char;
  }
  items.push(current);
  return items.map((item) => item.trim()).filter(Boolean);
}

function flowDepth(text) {
  let depth = 0;
  let quote = null;
  for (const char of text) {
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "[" || char === "{") depth += 1;
    else if (char === "]" || char === "}") depth -= 1;
  }
  return depth;
}

function inlineEvents(value, lines, next) {
  const text = value.trim();
  if (text === "" ) return { events: [], next };
  if (text[0] !== "[" && text[0] !== "{") return { events: [unquote(text)], next };
  let joined = text;
  let cursor = next;
  while (flowDepth(joined) > 0 && cursor < lines.length) {
    joined += ` ${stripComment(lines[cursor]).trim()}`;
    cursor += 1;
  }
  const inner = joined.slice(1, joined.lastIndexOf(text[0] === "[" ? "]" : "}"));
  const events = splitFlow(inner).map((item) => (text[0] === "{" ? (entryKey(item) ?? unquote(item)) : unquote(item)));
  return { events, next: cursor };
}

/** The event names listed under the top-level `on:` key of a workflow text. */
export function triggerEvents(yamlText) {
  const lines = String(yamlText).split(/\r?\n/);
  const events = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = stripComment(lines[index]);
    const match = /^(?:on|"on"|'on'|true|True|TRUE)\s*:(?:\s+(.*))?$/.exec(line.trimEnd());
    if (!match) continue;
    const rest = match[1] ?? "";
    if (rest.trim() !== "") {
      events.push(...inlineEvents(rest, lines, index + 1).events);
      continue;
    }
    // Block form: read the lines that belong to the key.
    let childIndent = null;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const body = stripComment(lines[cursor]).trimEnd();
      if (body.trim() === "") continue;
      const indent = body.length - body.trimStart().length;
      const text = body.trim();
      if (indent === 0 && !text.startsWith("- ") && text !== "-") break;
      if (childIndent === null) childIndent = indent;
      if (indent !== childIndent) continue;
      if (text.startsWith("- ")) events.push(unquote(text.slice(2)));
      else {
        const key = entryKey(text);
        if (key !== null) events.push(key);
      }
    }
  }
  return events;
}

/** True when the workflow text lists `event` under its top-level `on:` key. */
export function hasTrigger(yamlText, event) {
  return triggerEvents(yamlText).includes(event);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const event = process.argv[2];
  if (!event || process.argv.length !== 3) {
    process.stderr.write("Usage: node scripts/lib/workflow-triggers.mjs <event> < workflow.yml\n");
    process.exit(2);
  }
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  process.exit(hasTrigger(Buffer.concat(chunks).toString("utf8"), event) ? 0 : 1);
}
