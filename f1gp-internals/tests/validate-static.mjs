// Contract checks on the shipped files of "Inside Formula One Grand Prix":
// the Almanac's conventions, the site's own navigation, and the publication
// rules (no local paths or personal details, no remote runtime dependency).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const PROJECT = resolve(import.meta.dirname, "..");
const ROOT = resolve(PROJECT, "..");
const nav = await readFile(resolve(PROJECT, "chapters.js"), "utf8");
const css = await readFile(resolve(PROJECT, "style.css"), "utf8");
const catalog = await readFile(resolve(ROOT, "data.js"), "utf8");

// The chapter list is declared once, in chapters.js.
const chapterFiles = [...nav.matchAll(/\["(\d\d-[a-z-]+\.html)", "(\d\d)", "([^"]+)"\]/g)].map((m) => ({
  file: m[1], num: m[2], title: m[3],
}));
const pages = ["index.html", ...chapterFiles.map((c) => c.file)];
const html = Object.fromEntries(await Promise.all(
  pages.map(async (p) => [p, await readFile(resolve(PROJECT, p), "utf8")]),
));

test("chapters.js lists twelve chapters and every one exists", async () => {
  assert.equal(chapterFiles.length, 12);
  const onDisk = (await readdir(PROJECT)).filter((f) => f.endsWith(".html")).sort();
  assert.deepEqual(onDisk, [...pages].sort(), "no unlisted or missing page");
});

test("every page follows the Almanac contract", () => {
  for (const [name, src] of Object.entries(html)) {
    assert.match(src, /<link rel="stylesheet" href="style\.css">/, `${name} loads style.css`);
    assert.match(src, /<script src="chapters\.js"><\/script>/, `${name} loads chapters.js`);
    assert.match(src, /<script defer src="\/almanac-back\.js"><\/script>\s*<\/body>/, `${name} has the back pill`);
    assert.match(src, /<nav class="toc" aria-label="Contents"><\/nav>/, `${name} has the contents rail`);
    assert.doesNotMatch(src, /<(?:script|link)[^>]+(?:src|href)="https?:\/\//i, `${name}: no remote runtime dependency`);
    assert.match(src, /<main class="chapter[^"]*" id="main">/, `${name} has one chapter main`);
  }
  assert.doesNotMatch(css, /url\(\s*["']?https?:\/\//i, "no remote CSS asset");
  assert.doesNotMatch(css, /@import/i, "no imported stylesheet");
});

test("each chapter's kicker and h1 match chapters.js", () => {
  for (const c of chapterFiles) {
    const src = html[c.file];
    assert.match(src, new RegExp(`<p class="kicker">Chapter ${c.num}</p>`), `${c.file} kicker`);
    const h1 = src.match(/<h1>([\s\S]*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, "").trim();
    assert.equal(h1, c.title, `${c.file} h1`);
  }
});

test("section ids are unique and every in-site link resolves", () => {
  for (const [name, src] of Object.entries(html)) {
    const ids = [...src.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length, `${name}: duplicate id among ${ids.length}`);
    for (const m of src.matchAll(/<h2(?![^>]*\sid=)/g)) assert.fail(`${name}: an h2 without an id at ${m.index}`);
    for (const m of src.matchAll(/href="((?:\d\d-[a-z-]+|index)\.html)(?:#([^"]+))?"/g)) {
      const target = html[m[1]];
      assert.ok(target, `${name} links to missing ${m[1]}`);
      if (m[2]) assert.match(target, new RegExp(`\\sid="${m[2]}"`), `${name} links to missing #${m[2]} in ${m[1]}`);
    }
  }
});

test("every diagram is accessible and scales", () => {
  for (const [name, src] of Object.entries(html)) {
    for (const m of src.matchAll(/<svg\b([^>]*)>/g)) {
      const attrs = m[1];
      assert.match(attrs, /viewBox="0 0 (\d+) \d+"/, `${name}: svg without viewBox`);
      assert.ok(Number(attrs.match(/viewBox="0 0 (\d+)/)[1]) <= 720, `${name}: svg wider than 720 units`);
      assert.match(attrs, /role="img"/, `${name}: svg without role`);
      assert.match(attrs, /aria-label="[^"]{10,}"/, `${name}: svg without a description`);
      assert.doesNotMatch(attrs, /\swidth="\d/, `${name}: svg with a fixed width`);
    }
  }
});

test("nothing private is published", () => {
  const forbidden = [
    [/\/Users\/|[A-Z]:\\(?:Users|language)/, "a local filesystem path"],
    [/[\w.+-]+@[\w-]+\.[\w.]+/, "an email address"],
    [/\bdeltic\b/i, "internal fleet tooling"],
    [/\bpraedex\b/i, "an internal project"],
    [/\b(?:api[_ -]?key|secret|password|keychain)\b/i, "credential material"],
  ];
  for (const [name, src] of Object.entries(html)) {
    for (const [re, what] of forbidden) assert.doesNotMatch(src, re, `${name} contains ${what}`);
  }
});

test("the catalog lists the site and shelves it", () => {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(catalog, sandbox, { filename: "data.js" });
  const entry = sandbox.window.ESSAYS.find((e) => e.slug === "f1gp-internals");
  assert.ok(entry, "catalog entry");
  assert.equal(entry.url, "https://0x4d44.github.io/f1gp-internals/");
  assert.equal(entry.illustration, "ill-f1gp");
  assert.equal(entry.real, true);
  assert.ok(entry.words > 50000 && entry.readingMin > 200, "word count and reading time are filled in");
  const shelves = sandbox.window.COLLECTIONS.filter((c) => c.slugs.includes("f1gp-internals")).map((c) => c.id);
  assert.ok(shelves.length >= 1, "on at least one shelf");
});
