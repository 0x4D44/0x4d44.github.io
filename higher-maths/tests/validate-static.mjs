// Contract checks on the shipped files of "Chart, Compass & Calculus":
// the Almanac's conventions, the links between the six pages, the question
// bank, and the widget placeholders each page script expects.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const PROJECT = resolve(import.meta.dirname, "..");
const ROOT = resolve(PROJECT, "..");
const PAGES = ["index.html", "algebra.html", "geometry.html", "trig.html", "calculus.html", "exam.html", "papers.html"];
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
    assert.match(src, /<meta name="viewport"/, `${name}: viewport meta`);
    assert.match(src, /<meta name="description" content="[^"]{80,}"/, `${name}: a real description`);
    assert.match(src, /<link rel="stylesheet" href="fonts\/fonts\.css">/, `${name}: self-hosted fonts`);
    assert.equal((src.match(/<h1\b/g) || []).length, 1, `${name}: exactly one h1`);
  }
  for (const [name, src] of Object.entries(html)) {
    assert.match(src, /<script defer src="vendor\/katex\/katex\.min\.js"><\/script>/, `${name}: self-hosted KaTeX`);
    // inside $…$ a bare "<" followed by a letter would start an HTML tag: use \\lt
    const bad = [];
    const check = (m) => { if (/<[a-z]/i.test(m)) bad.push(m.slice(0, 60)); };
    const text = src.replace(/<script[\s\S]*?<\/script>/g, "").replace(/\$\$([\s\S]*?)\$\$/g, (m, x) => { check(x); return ""; });
    text.split("$").forEach((seg, i) => { if (i % 2) check(seg); });
    assert.deepEqual(bad, [], `${name}: no raw "<" inside maths`);
  }
  const css = await read("style.css") + await read("fonts/fonts.css") + await read("vendor/katex/katex.min.css");
  assert.doesNotMatch(css, /url\(\s*["']?https?:/i, "no remote CSS asset");
  assert.match(css, /prefers-reduced-motion/);
  for (const m of css.matchAll(/url\(([^)'"]+\.woff2)\)/g)) assert.ok(await exists(resolve(PROJECT, "fonts", m[1])) || await exists(resolve(PROJECT, "vendor/katex", m[1])), `font ${m[1]} is shipped`);
});

test("local scripts, links and anchors resolve, and ids are unique", async () => {
  const ids = Object.fromEntries(PAGES.map((p) => [p, [...html[p].matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])]));
  for (const p of PAGES) assert.equal(new Set(ids[p]).size, ids[p].length, `${p}: duplicate id`);
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
  for (const [page, script] of [["algebra.html", "algebra.js"], ["geometry.html", "geometry.js"], ["trig.html", "trig.js"], ["calculus.html", "calculus.js"]]) {
    const js = await read(script);
    for (const m of html[page].matchAll(/class="widget" id="([^"]+)"/g)) assert.match(js, new RegExp(`mount\\("${m[1]}"`), `${page}: ${m[1]} has a mount() in ${script}`);
    for (const m of js.matchAll(/mount\("([^"]+)"/g)) assert.match(html[page], new RegExp(`id="${m[1]}"`), `${script}: ${m[1]} has a placeholder in ${page}`);
  }
});

test("every check placeholder has a question set, and every question is well-formed", async () => {
  const { window } = run([[await read("quiz.js"), "quiz.js"]]);
  const Q = window.HM_QUIZ;
  const used = new Set();
  for (const [name, src] of Object.entries(html)) for (const m of src.matchAll(/data-check="([^"]+)"/g)) { assert.ok(Q[m[1]], `${name}: check ${m[1]} exists`); used.add(m[1]); }
  for (const [id, set] of Object.entries(Q)) {
    assert.ok(used.has(id), `question set ${id} is placed on a page`);
    assert.ok(set.title && set.questions.length >= 3, `${id}: title and at least three questions`);
    for (const q of set.questions) {
      if (q.type !== "open") {
        assert.ok(Array.isArray(q.opts) && q.opts.length >= 4, `${id}: options`);
        assert.ok(Number.isInteger(q.a) && q.a >= 0 && q.a < q.opts.length, `${id}: answer index in range`);
        assert.equal(new Set(q.opts).size, q.opts.length, `${id}: options are distinct`);
        assert.ok(q.why, `${id}: explanation`);
      } else assert.ok(q.marks >= 1 && q.model, `${id}: marks and marking guidance`);
    }
  }
});

test("the number and polynomial formatters behave", async () => {
  const doc = { readyState: "complete", addEventListener() {}, querySelectorAll: () => [], documentElement: { setAttribute() {}, removeAttribute() {} } };
  const mm = () => ({ matches: false, addEventListener() {} });
  const box = run([[await read("common.js"), "common.js"]], {
    window: { addEventListener() {}, matchMedia: mm }, document: doc, localStorage: { getItem: () => null, setItem() {} }, matchMedia: () => ({ matches: false, addEventListener() {} }),
    MutationObserver: class { observe() {} }, setTimeout, clearTimeout, getComputedStyle: () => ({ getPropertyValue: () => "" }),
  });
  const HM = box.window.HM;
  assert.equal(HM.n(2.5), "2.5");
  assert.equal(HM.n(-3.456, 2), "−3.46");
  assert.equal(HM.n(-0.0001, 2), "0");
  assert.equal(HM.fracTex(0.75), "\\tfrac{3}{4}");
  assert.equal(HM.fracTex(-1.5), "-\\tfrac{3}{2}");
  assert.equal(HM.fracTex(4), "4");
  assert.equal(HM.polyTex([2, 1, -13, 6]), "2x^{3} + x^{2} - 13x + 6");
  assert.equal(HM.polyTex([1, 0, -7, 6]), "x^{3} - 7x + 6");
});

test("the catalog lists the page and puts it on a shelf", async () => {
  const { window } = run([[await readFile(resolve(ROOT, "data.js"), "utf8"), "data.js"]]);
  const entry = window.ESSAYS.find((e) => e.slug === "higher-maths");
  assert.ok(entry, "ESSAYS entry");
  assert.equal(entry.url, "https://0x4d44.github.io/higher-maths/");
  assert.ok(entry.tagline.split(/\s+/).length <= 55, "tagline is a hook, not a spec");
  for (const t of entry.tags) assert.ok(window.TAGS.includes(t), `tag ${t} has a chip`);
  assert.ok(window.COLLECTIONS.some((c) => c.slugs.includes("higher-maths")), "on a shelf");
  const index = await readFile(resolve(ROOT, "index.html"), "utf8");
  assert.match(index, new RegExp(`<symbol id="${entry.illustration}"`), "illustration symbol exists");
});
