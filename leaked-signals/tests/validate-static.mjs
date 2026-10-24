// Static guards for "Leaked Signals": catalogue wiring, page hygiene, module graph.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const DOC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolve(DOC, "..");
const read = p => readFileSync(p, "utf8");
const html = read(join(DOC, "index.html"));

test("catalogue entry, sprite symbol and shelf exist", () => {
  const data = read(join(ROOT, "data.js"));
  assert.match(data, /slug: "leaked-signals"/);
  assert.match(data, /url: "https:\/\/0x4d44\.github\.io\/leaked-signals\/"/);
  const m = data.match(/slug: "leaked-signals"[\s\S]*?illustration: "([^"]+)"/);
  assert.ok(read(join(ROOT, "index.html")).includes(`id="${m[1]}"`), "sprite symbol missing");
  assert.match(data, /"leaked-signals"\]/, "not on a shelf");
});
test("page opts in to the shared back pill and has sane head", () => {
  assert.match(html, /<script defer src="\/almanac-back\.js"><\/script>/);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<title>[^<]{3,40}<\/title>/);
});
test("every local module/script reference resolves", () => {
  for (const f of ["app.mjs", "core.mjs", "sites.mjs", "broadcasts.mjs", "field.mjs", "gl.mjs", "tour.mjs", "anatomy.mjs", "stars.js"]) assert.ok(existsSync(join(DOC, f)), f);
  for (const m of read(join(DOC, "app.mjs")).matchAll(/from "(\.\/[^"]+)"/g)) assert.ok(existsSync(join(DOC, m[1])), m[1]);
});
test("star catalogue is well formed and nearest-first", async () => {
  globalThis.window = {}; await import(pathToFileURL(join(DOC, "stars.js")));
  const s = globalThis.window.LEAK_STARS;
  assert.ok(s.n > 9000 && s.ra.length === s.n && s.dec.length === s.n && s.ly.length === s.n);
  assert.ok(Math.max(...s.ly) <= 100.5);
  assert.ok(s.ly[0] < 4.4);
  for (let i = 1; i < s.n; i++) assert.ok(s.ly[i] >= s.ly[i - 1] - 1e-9);
});
test("no Praedex files here", () => assert.ok(!/praedex/i.test(html)));
