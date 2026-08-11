import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readOutput = (path) => readFile(new URL(`../dist/${path}`, import.meta.url), "utf8");
const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("root renders the configured project landing page without redirect metadata", async () => {
  const html = await readOutput("index.html");

  assert.match(html, /<title>example docs<\/title>/);
  assert.match(html, /Meet example\./);
  assert.match(html, /Then build\./);
  assert.match(html, /A concise statement of what the project does and who it serves\./);
  assert.match(html, /Start with context/);
  assert.match(html, /Get running/);
  assert.match(html, /Go deeper/);
  assert.match(html, /class="dk-crumb"[^>]*aria-label="Project: example"[^>]*>\/ example<\/span>/);
  assert.match(html, /href="\/getting-started\/overview\/"/);
  assert.match(html, /href="https:\/\/github\.com\/frostyard\/example"/);
  assert.doesNotMatch(html, /http-equiv="refresh"/);
  assert.doesNotMatch(html, /<title>Redirecting<\/title>/);
  assert.doesNotMatch(html, /rel="canonical"[^>]*getting-started\/overview/);
  assert.doesNotMatch(html, /data-pagefind-body/);
});

test("root source retains the explicit empty-content guard", async () => {
  const source = await readSource("src/pages/index.astro");
  assert.match(
    source,
    /No docs content found: add at least one page under content\/ with title\/group\/order frontmatter\./
  );
});

test("landing source keeps decorative content out of the accessibility tree", async () => {
  const source = await readSource("src/pages/index.astro");

  assert.match(source, /<h1>\{site\.landing\.headline\[0\]\}<br \/><span>\{site\.landing\.headline\[1\]\}<\/span><\/h1>/);
  assert.doesNotMatch(source, /<h1>[\s\S]*<em>/);
  assert.match(source, /<span class="dk-landing-number" aria-hidden="true">/);
});

test("landing display headline wraps long unbroken content", async () => {
  const styles = await readSource("src/styles/landing.css");

  assert.match(styles, /\.dk-landing h1\{[^}]*overflow-wrap:break-word/);
  assert.match(styles, /\.dk-landing h1 span\{/);
  assert.doesNotMatch(styles, /\.dk-landing h1 em\{/);
});
