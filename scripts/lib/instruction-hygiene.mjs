// Pure instruction-text helpers shared by the instruction lint and tests.

export function stripFencedBlocks(text) {
  const lines = String(text).split("\n");
  let open = null;
  return lines
    .map((line) => {
      if (open === null) {
        const start = /^[ \t>]*(`{3,}|~{3,})(.*)$/.exec(line);
        if (!start || (start[1][0] === "`" && start[2].includes("`"))) return line;
        open = { char: start[1][0], length: start[1].length };
        return "";
      }
      const end = /^[ \t>]*(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (end && end[1][0] === open.char && end[1].length >= open.length) open = null;
      return "";
    })
    .join("\n");
}

export function extractInlineCodeSpans(text) {
  const stripped = stripFencedBlocks(text);
  const spans = [];
  stripped.split("\n").forEach((line, index) => {
    let offset = 0;
    while (offset < line.length) {
      if (line[offset] !== "`") {
        offset += 1;
        continue;
      }

      let openingLength = 1;
      while (line[offset + openingLength] === "`") openingLength += 1;
      const contentStart = offset + openingLength;
      let closing = contentStart;
      let found = -1;

      while (closing < line.length) {
        if (line[closing] !== "`") {
          closing += 1;
          continue;
        }
        let closingLength = 1;
        while (line[closing + closingLength] === "`") closingLength += 1;
        if (closingLength === openingLength) {
          found = closing;
          break;
        }
        closing += closingLength;
      }

      if (found === -1) {
        offset = contentStart;
        continue;
      }

      let content = line.slice(contentStart, found);
      if (content.startsWith(" ") && content.endsWith(" ") && content.trim() !== "") {
        content = content.slice(1, -1);
      }
      spans.push({ span: content, line: index + 1 });
      offset = found + openingLength;
    }
  });
  return spans;
}

export function normalizePathSpan(span) {
  let normalized = String(span);
  normalized = normalized.replace(/:\d+(?:-\d+)?$/, "");
  normalized = normalized.replace(/#[^#]*$/, "");
  if (normalized.endsWith("/")) normalized = normalized.slice(0, -1);
  return normalized;
}

export function isPathCandidate(span) {
  const value = normalizePathSpan(span);
  return Boolean(
    value &&
      !/\s/u.test(value) &&
      !value.includes("://") &&
      !/[*?\[\]{}<>$|…]/u.test(value) &&
      !value.includes("...") &&
      !value.startsWith("-")
  );
}

export function findRetiredOccurrences(text, name) {
  const source = String(text);
  const needle = String(name);
  if (!needle) return [];
  const found = [];
  let from = 0;
  while (from < source.length) {
    const index = source.indexOf(needle, from);
    if (index === -1) break;
    const before = index > 0 ? source[index - 1] : "";
    const afterIndex = index + needle.length;
    const after = afterIndex < source.length ? source[afterIndex] : "";
    if (
      (before === "" || !/[A-Za-z0-9_.-]/u.test(before)) &&
      (after === "" || !/[A-Za-z0-9_-]/u.test(after))
    ) {
      const line = source.slice(0, index).split("\n").length;
      found.push({ name: needle, line });
    }
    from = index + needle.length;
  }
  return found;
}

export function extractProseSentences(text) {
  const source = stripFencedBlocks(text);
  const lines = source.split("\n");
  const paragraphs = [];
  let current = null;

  for (let index = 0; index < lines.length; index += 1) {
    const original = lines[index];
    if (/^[ \t]*$/.test(original)) {
      if (current) {
        paragraphs.push(current);
        current = null;
      }
      continue;
    }
    let prose = original;
    prose = prose.replace(/^ {0,3}#{1,6}[ \t]+/, "");
    prose = prose.replace(/^ {0,3}(?:[-+*]|\d+[.)])[ \t]+/, "");
    if (!current) current = { text: "", map: [] };
    if (current.text) {
      current.text += " ";
      current.map[current.text.length - 1] = index + 1;
    }
    const start = current.text.length;
    current.text += prose;
    for (let offset = 0; offset < prose.length; offset += 1) {
      current.map[start + offset] = index + 1;
    }
  }
  if (current) paragraphs.push(current);

  const sentences = [];
  for (const paragraph of paragraphs) {
    let start = 0;
    while (start < paragraph.text.length) {
      let boundary = -1;
      for (let index = start; index < paragraph.text.length; index += 1) {
        if (/[.!?]/u.test(paragraph.text[index]) && (index + 1 === paragraph.text.length || /\s/u.test(paragraph.text[index + 1]))) {
          boundary = index;
          break;
        }
      }

      if (boundary === -1) {
        const segment = paragraph.text.slice(start);
        const sentence = normalizeWhitespace(segment);
        if (sentence) {
          const first = segment.search(/[^\s]/u);
          const line = first >= 0 ? (paragraph.map[start + first] ?? 1) : 1;
          sentences.push({ sentence, line });
        }
        break;
      }

      const segment = paragraph.text.slice(start, boundary + 1);
      const sentence = normalizeWhitespace(segment);
      if (sentence) {
        const first = segment.search(/[^\s]/u);
        const line = first >= 0 ? (paragraph.map[start + first] ?? 1) : 1;
        sentences.push({ sentence, line });
      }
      start = boundary + 1;
      while (start < paragraph.text.length && /\s/u.test(paragraph.text[start])) start += 1;
    }
  }
  return sentences;
}

export function normalizeWhitespace(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

export function countWords(text) {
  const trimmed = String(text).trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}

export function countLines(text) {
  const value = String(text);
  if (!value) return 0;
  const lines = value.split(/\r\n|\n|\r/u);
  if (lines.at(-1) === "") lines.pop();
  return lines.length;
}
