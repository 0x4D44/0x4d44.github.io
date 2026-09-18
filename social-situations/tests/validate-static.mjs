import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, "..");
const root = resolve(dir, "..");
const html = readFileSync(resolve(dir, "index.html"), "utf8");
const css = readFileSync(resolve(dir, "style.css"), "utf8");
const js = readFileSync(resolve(dir, "app.js"), "utf8");
const data = readFileSync(resolve(root, "data.js"), "utf8");

assert.match(html, /Social Situations as Learnable Systems/);
assert.match(html, /id="xyz"/);
assert.match(html, /id="maps"/);
assert.match(html, /\/almanac-back\.js/);
assert.match(html, /style\.css/);
assert.match(html, /app\.js/);
for (const id of ["x","y","z","map-tabs","map-card","phrase-grid"]) {
  assert.match(html, new RegExp(`id="${id}"`));
}
for (const name of ["Lecture","Laboratory","Group work","Ask staff for help"]) {
  assert.match(js, new RegExp(name));
}
assert.match(css, /@media\(max-width:560px\)/);
assert.ok(!/target="_blank"/.test(html), "Almanac navigation stays in the same tab");

assert.match(data, /slug: "social-situations"/);
assert.match(data, /illustration: "ill-teenbrain"/);
const collections = data.slice(data.indexOf("window.COLLECTIONS"));
for (const shelf of ["life","health","science"]) {
  const re = new RegExp(`id: "${shelf}"[\\s\\S]*?slugs: \\[[^\\]]*"social-situations"`);
  assert.match(collections, re, `social-situations is on the ${shelf} shelf`);
}
console.log("social-situations static validation: ok");
