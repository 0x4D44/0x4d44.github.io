// Static validation: the document is complete, self-contained, and wired
// into the almanac (catalog entry, sprite icon, root test chain).

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const doc = resolve(import.meta.dirname, "..");
const root = resolve(doc, "..");
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const read = (p) => readFileSync(p, "utf8");

// --- files exist --------------------------------------------------------------
for (const f of ["index.html", "style.css", "game.js", "engine.js", "scenes.js"]) {
  ok(existsSync(join(doc, f)), `${f} exists`);
}

const html = read(join(doc, "index.html"));
const css = read(join(doc, "style.css"));
const js = read(join(doc, "game.js"));

// --- index.html shape ---------------------------------------------------------
ok(html.includes('name="viewport"'), "viewport meta present");
ok(html.includes("<noscript>"), "noscript fallback present");
ok(/<title>[^<]*Brilliancy/i.test(html), "title present");
ok(html.includes('href="./style.css"'), "stylesheet linked");
ok(html.includes('type="module" src="./game.js"'), "game module linked");
for (const sym of ["pc-P", "pc-R", "pc-N", "pc-B", "pc-Q", "pc-K", "orn-coin"]) {
  ok(html.includes(`<symbol id="${sym}"`), `piece symbol ${sym} present`);
}

// --- self-contained: no external network references ---------------------------
for (const [name, text] of [["index.html", html], ["style.css", css], ["game.js", js]]) {
  const external = text
    .replaceAll("http://www.w3.org/2000/svg", "") // SVG namespace, not a fetch
    .match(/https?:\/\//g);
  ok(!external, `${name} makes no external requests`);
}
ok(!html.includes("serviceWorker") && !js.includes("serviceWorker"), "no service worker (deliberate)");
ok(js.includes('"0x4d44.brilliancy.v1"'), "localStorage key namespaced to the document");

// --- almanac wiring -----------------------------------------------------------
const data = read(join(root, "data.js"));
ok(data.includes('slug: "brilliancy"'), "data.js has the catalog entry");
ok(data.includes("https://0x4d44.github.io/brilliancy/"), "catalog entry URL correct");
const rootHtml = read(join(root, "index.html"));
ok(rootHtml.includes('symbol id="ill-brilliancy"'), "root sprite has ill-brilliancy icon");
const pkg = JSON.parse(read(join(root, "package.json")));
for (const script of ["test", "build"]) {
  ok(pkg.scripts[script].includes("brilliancy/tests/validate-static.mjs"),
    `package.json ${script} chain includes brilliancy static validation`);
}
ok(pkg.scripts.test.includes("brilliancy/tests/engine.test.mjs"), "test chain includes engine tests");
ok(pkg.scripts.test.includes("brilliancy/tests/scenes.test.mjs"), "test chain includes scene validation");

console.log(`validate-static: ${checks} checks passed`);
