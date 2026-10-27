// Contract checks on the shipped files of "Planes, Plans & Pennants":
// the Almanac's conventions, the links between the eight pages, the question
// banks, and the widget placeholders each page script expects.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const PROJECT = resolve(import.meta.dirname, "..");
const ROOT = resolve(PROJECT, "..");
const PAGES = ["index.html", "standards.html", "forms.html", "cad.html", "dtp.html", "tech.html", "assignment.html", "exam.html", "papers.html"];
const WIDGET_PAGES = PAGES.filter((p) => p !== "index.html").map((p) => [p, p.replace(".html", ".js")]);
const html = Object.fromEntries(await Promise.all(PAGES.map(async (p) => [p, await readFile(resolve(PROJECT, p), "utf8")])));
const read = (p) => readFile(resolve(PROJECT, p), "utf8");
const exists = (p) => stat(p).then(() => true, () => false);

function run(files, extra = {}) {
  const sandbox = { window: {}, console, ...extra };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const [src, name] of files) vm.runInContext(src, sandbox, { filename: name });
  return sandbox;
}

test("every page follows the Almanac contract", async () => {
  for (const [name, src] of Object.entries(html)) {
    assert.match(src, /<script defer src="\/almanac-back\.js"><\/script>\s*<\/body>/, `${name}: back pill before </body>`);
    assert.doesNotMatch(src, /<(?:script|link)[^>]+(?:src|href)="https?:\/\//i, `${name}: no remote runtime dependency`);
    assert.doesNotMatch(src, /\b(?:src|href)=["']?https?:\/\/(?!0x4d44\.github\.io)[^"' >]*\.(?:png|jpe?g|gif|webp|svg|woff2?|css|js)\b/i, `${name}: no remote asset`);
    assert.match(src, /<meta name="viewport"/, `${name}: viewport meta`);
    assert.match(src, /<meta name="description" content="[^"]{80,}"/, `${name}: a real description`);
    assert.match(src, /<link rel="stylesheet" href="fonts\/fonts\.css">/, `${name}: self-hosted fonts`);
    assert.equal((src.match(/<h1\b/g) || []).length, 1, `${name}: exactly one h1`);
    assert.doesNotMatch(src, /TODO/, `${name}: no TODO left`);
    assert.match(src, /<main id="main">/, `${name}: main landmark`);
  }
  const css = await read("style.css") + await read("fonts/fonts.css");
  assert.doesNotMatch(css, /url\(\s*["']?https?:/i, "no remote CSS asset");
  assert.match(css, /prefers-reduced-motion/);
  for (const m of css.matchAll(/url\(([^)'"]+\.woff2)\)/g)) assert.ok(await exists(resolve(PROJECT, "fonts", m[1])), `font ${m[1]} is shipped`);
});

test("local scripts, links and anchors resolve, and ids are unique", async () => {
  const ids = Object.fromEntries(PAGES.map((p) => [p, [...html[p].matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])]));
  for (const p of PAGES) assert.equal(new Set(ids[p]).size, ids[p].length, `${p}: duplicate id ${ids[p].find((x, i) => ids[p].indexOf(x) !== i)}`);
  for (const [name, src] of Object.entries(html)) {
    for (const m of src.matchAll(/<script[^>]+src="([^"/][^"]*)"/g)) assert.ok(await exists(resolve(PROJECT, m[1])), `${name}: ${m[1]} exists`);
    for (const m of src.matchAll(/<(?:a|link)\b[^>]*\shref="([^"]+)"/g)) {
      const href = m[1];
      if (/^(https?:|mailto:|data:|\/|\.\.\/)/.test(href)) continue;
      const [file, hash] = href.split("#");
      const target = file || name;
      if (PAGES.includes(target)) { if (hash) assert.ok(ids[target].includes(hash), `${name}: ${href} points at a real id`); }
      else assert.ok(await exists(resolve(PROJECT, file)), `${name}: ${href} exists`);
    }
  }
});

test("every widget placeholder is mounted by its page script", async () => {
  for (const [page, script] of WIDGET_PAGES) {
    const js = await read(script);
    for (const m of html[page].matchAll(/class="widget"[^>]*\sid="([^"]+)"|id="([^"]+)"[^>]*class="widget"/g)) {
      const id = m[1] || m[2];
      assert.match(js, new RegExp(`mount\\(\\s*["']${id}["']`), `${page}: ${id} has a mount() in ${script}`);
    }
    for (const m of js.matchAll(/mount\(\s*["']([^"']+)["']/g)) assert.match(html[page], new RegExp(`id="${m[1]}"`), `${script}: ${m[1]} has a placeholder in ${page}`);
  }
});

test("every check placeholder has a question set, and every question is well-formed", async () => {
  const quizFiles = ["standards", "forms", "cad", "dtp", "tech", "assignment", "exam"];
  const { window } = run(await Promise.all(quizFiles.map(async (q) => [await read(`quiz-${q}.js`), `quiz-${q}.js`])));
  const Q = window.HG_QUIZ;
  const used = new Set();
  for (const [name, src] of Object.entries(html)) for (const m of src.matchAll(/data-check="([^"]+)"/g)) { assert.ok(Q[m[1]], `${name}: check ${m[1]} exists`); used.add(m[1]); }
  for (const [id, set] of Object.entries(Q)) {
    assert.ok(used.has(id), `question set ${id} is placed on a page`);
    assert.ok(set.title && set.questions.length >= 3, `${id}: title and at least three questions`);
    for (const q of set.questions) {
      assert.ok(q.q && q.q.length > 12, `${id}: question text`);
      if (q.type !== "open") {
        assert.ok(Array.isArray(q.opts) && q.opts.length >= 4, `${id}: options`);
        assert.ok(Number.isInteger(q.a) && q.a >= 0 && q.a < q.opts.length, `${id}: answer index in range`);
        assert.equal(new Set(q.opts).size, q.opts.length, `${id}: options are distinct`);
        assert.ok(q.why, `${id}: explanation`);
      } else assert.ok(q.marks >= 1 && q.model, `${id}: marks and marking guidance`);
    }
  }
});

test("the catalog lists the page and puts it on a shelf", async () => {
  const { window } = run([[await readFile(resolve(ROOT, "data.js"), "utf8"), "data.js"]]);
  const entry = window.ESSAYS.find((e) => e.slug === "higher-graphic-communication");
  assert.ok(entry, "ESSAYS entry");
  assert.equal(entry.url, "https://0x4d44.github.io/higher-graphic-communication/");
  assert.ok(entry.tagline.split(/\s+/).length <= 55, "tagline is a hook, not a spec");
  for (const t of entry.tags) assert.ok(window.TAGS.includes(t), `tag ${t} has a chip`);
  assert.ok(window.COLLECTIONS.some((c) => c.slugs.includes("higher-graphic-communication")), "on a shelf");
  const index = await readFile(resolve(ROOT, "index.html"), "utf8");
  assert.match(index, new RegExp(`<symbol id="${entry.illustration}"`), "illustration symbol exists");
});
