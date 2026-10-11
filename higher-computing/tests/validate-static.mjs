// Contract checks on the shipped files of "Blocks, Wings & Broadsides":
// the Almanac's conventions, the links between the six pages, the question
// bank, the video files, and every SQL mission run against the real seed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const PROJECT = resolve(import.meta.dirname, "..");
const ROOT = resolve(PROJECT, "..");
const PAGES = ["index.html", "software.html", "systems.html", "database.html", "web.html", "exam.html"];
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
    assert.doesNotMatch(src, /fonts\.googleapis|fonts\.gstatic/, `${name}: no Google Fonts`);
  }
  const css = await read("style.css") + await read("fonts/fonts.css");
  assert.doesNotMatch(css, /url\(\s*["']?https?:/i, "no remote CSS asset");
  assert.match(css, /prefers-reduced-motion/);
  for (const m of css.matchAll(/url\(([^)'"]+\.woff2)\)/g)) assert.ok(await exists(resolve(PROJECT, "fonts", m[1])), `font ${m[1]} is shipped`);
});

test("local scripts, links and anchors resolve", async () => {
  const ids = Object.fromEntries(PAGES.map((p) => [p, new Set([...html[p].matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))]));
  for (const [name, src] of Object.entries(html)) {
    for (const m of src.matchAll(/<script[^>]+src="([^"/][^"]*)"/g)) assert.ok(await exists(resolve(PROJECT, m[1])), `${name}: ${m[1]} exists`);
    for (const m of src.matchAll(/<(?:a|link)\b[^>]*\shref="([^"]+)"/g)) {
      const href = m[1];
      if (/^(https?:|mailto:|data:|\/)/.test(href)) continue;
      const [file, hash] = href.split("#");
      const target = file || name;
      if (PAGES.includes(target)) {
        if (hash) assert.ok(ids[target].has(hash), `${name}: ${href} points at a real id`);
      } else {
        assert.ok(await exists(resolve(PROJECT, file)), `${name}: ${href} exists`);
      }
    }
  }
});

test("every check placeholder has a question, and every question is well-formed", async () => {
  const { window } = run([[await read("quiz.js"), "quiz.js"]]);
  const Q = window.HC_QUIZ;
  const used = new Set();
  for (const [name, src] of Object.entries(html)) {
    for (const m of src.matchAll(/data-check="([^"]+)"/g)) {
      assert.ok(Q[m[1]], `${name}: check ${m[1]} exists in quiz.js`);
      used.add(m[1]);
    }
  }
  for (const [id, set] of Object.entries(Q)) {
    assert.ok(used.has(id), `question set ${id} is placed on a page`);
    assert.ok(set.title && set.questions.length > 0, `${id}: title and questions`);
    for (const q of set.questions) {
      if (q.type !== "open") {
        assert.ok(Array.isArray(q.opts) && q.opts.length >= 2, `${id}: options`);
        assert.ok(Number.isInteger(q.a) && q.a >= 0 && q.a < q.opts.length, `${id}: answer index in range`);
        assert.ok(q.why, `${id}: explanation`);
      } else {
        assert.ok(q.marks >= 1 && q.model, `${id}: marks and marking guidance`);
      }
    }
  }
});

test("every video ships with its captions and poster", async () => {
  const refs = new Set();
  for (const src of Object.values(html)) for (const m of src.matchAll(/(?:src|poster)="(videos\/[^"]+)"/g)) refs.add(m[1]);
  assert.ok(refs.size >= 18, "six videos, each with mp4 + vtt + jpg");
  for (const r of refs) assert.ok(await exists(resolve(PROJECT, r)), `${r} exists`);
  for (const r of refs) if (r.endsWith(".vtt")) assert.match(await read(r), /^WEBVTT/, `${r} is WebVTT`);
});

test("every SQL mission's model answer runs against the seed and returns rows", async () => {
  const sqlSrc = await read("vendor/sql-wasm.js");
  const wasmBinary = await readFile(resolve(PROJECT, "vendor/sql-wasm.wasm"));
  const module = { exports: {} };
  const box = run([[sqlSrc, "sql-wasm.js"]], { module, exports: module.exports, require: () => ({}), __dirname: PROJECT, process: undefined });
  const initSqlJs = module.exports.default || module.exports || box.initSqlJs;
  const SQL = await (typeof initSqlJs === "function" ? initSqlJs : box.initSqlJs)({ wasmBinary });
  const { SEED, MISSIONS, lint } = run([[await read("ddd.js"), "ddd.js"]], {
    window: { HC: { el() {}, svg() {}, reduced: true } },
    document: { readyState: "loading", addEventListener() {}, getElementById: () => null },
  }).window.HC_DB;
  assert.ok(MISSIONS.length >= 15);
  for (const m of MISSIONS) {
    if (m.free) continue;
    const db = new SQL.Database();
    db.exec(SEED);
    const res = db.exec(m.sol + (m.check ? ";" + m.check : ""));
    const last = res[res.length - 1];
    assert.ok(last && last.values.length > 0, `${m.t}: returns rows`);
    assert.equal(lint(m.sol).length, 0, `${m.t}: model answer passes the Higher-subset lint`);
    db.close();
  }
});

test("the catalog lists the page and puts it on a shelf", async () => {
  const { window } = run([[await readFile(resolve(ROOT, "data.js"), "utf8"), "data.js"]]);
  const entry = window.ESSAYS.find((e) => e.slug === "higher-computing");
  assert.ok(entry, "ESSAYS entry");
  assert.equal(entry.url, "https://0x4d44.github.io/higher-computing/");
  assert.ok(entry.tagline.split(/\s+/).length <= 55, "tagline is a hook, not a spec");
  for (const t of entry.tags) assert.ok(window.TAGS.includes(t), `tag ${t} has a chip`);
  assert.ok(window.COLLECTIONS.some((c) => c.slugs.includes("higher-computing")), "on a shelf");
  const index = await readFile(resolve(ROOT, "index.html"), "utf8");
  assert.match(index, new RegExp(`<symbol id="${entry.illustration}"`), "illustration symbol exists");
});
