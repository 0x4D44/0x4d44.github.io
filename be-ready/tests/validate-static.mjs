import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, "..");
const root = resolve(dir, "..");
const read = (p) => readFileSync(p, "utf8");
const html = read(resolve(dir, "index.html"));
const css = read(resolve(dir, "style.css"));
const dataSrc = read(resolve(root, "data.js"));
const rootHtml = read(resolve(root, "index.html"));

assert.match(html, /<meta name="viewport"/);
assert.match(html, /<script defer src="\/almanac-back\.js"><\/script>\s*<\/body>/, "back pill include before </body>");
for (const f of ["style.css", "content.js", "script.js", "app.js"]) {
  assert.match(html, new RegExp(`(href|src)="${f.replace(".", "\\.")}"`), `${f} is linked`);
  assert.ok(existsSync(resolve(dir, f)), `${f} exists`);
}
for (const id of ["calc", "checklist", "water", "power", "cooking", "stove", "whenithappens", "video", "sources", "vid", "transcript", "noMatch"]) {
  assert.match(html, new RegExp(`id="${id}"`), `#${id} present`);
}
assert.ok(!/target="_blank"/.test(html), "same-tab navigation");
assert.match(html, /<video[^>]+poster="poster\.jpg"/);
assert.match(html, /<source src="be-ready-explainer\.mp4"/);
for (const f of ["be-ready-explainer.mp4", "poster.jpg"]) assert.ok(existsSync(resolve(dir, f)), `${f} is committed`);
assert.match(css, /prefers-color-scheme:\s*dark/);
assert.match(css, /@media print/);
assert.match(css, /prefers-reduced-motion/);

const win = {};
vm.runInNewContext(read(resolve(dir, "content.js")), { window: win });
assert.ok(win.BR_ITEMS.length >= 30 && win.BR_CATS.length >= 3);
const ids = win.BR_ITEMS.map((i) => i.id);
assert.equal(new Set(ids).size, ids.length, "item ids unique");
const g = {};
vm.runInNewContext(read(resolve(dir, "script.js")), { window: win, globalThis: g });
assert.ok((win.BR_SCRIPT || g.BR_SCRIPT).length >= 8, "narration script present");

const sandbox = { window: {} };
vm.runInNewContext(dataSrc, sandbox);
const W = sandbox.window;
const e = W.ESSAYS.find((x) => x.slug === "be-ready");
assert.ok(e, "ESSAYS entry exists");
assert.equal(e.url, "https://0x4d44.github.io/be-ready/");
assert.ok(e.tagline.split(/\s+/).length <= 55, "tagline <= 55 words");
const tags = e.tags || [e.tag];
const known = new Set(W.TAG_GROUPS.flatMap((x) => x.tags));
for (const t of tags) assert.ok(known.has(t), `tag ${t} in TAG_GROUPS`);
assert.ok(W.COLLECTIONS.some((c) => c.slugs.includes("be-ready")), "shelved");
assert.ok(rootHtml.includes(`<symbol id="${e.illustration}"`), "sprite symbol exists");
console.log("be-ready static validation: ok");
