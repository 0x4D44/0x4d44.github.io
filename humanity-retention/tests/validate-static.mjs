import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = normalize(join(here, ".."));
const root = normalize(join(appDir, ".."));
const mustExist = [
  "index.html",
  "styles.css",
  "content.js",
  "engine.js",
  "storage.js",
  "audio.js",
  "app.js",
  "manifest.webmanifest",
  "sw.js",
  "icons/icon.svg",
];

for (const file of mustExist) {
  assert.ok(existsSync(join(appDir, file)), `${file} exists`);
}

const index = readFileSync(join(appDir, "index.html"), "utf8");
assert.match(index, /<link rel="stylesheet" href="styles\.css">/, "index links stylesheet");
assert.match(index, /<script type="module" src="app\.js"><\/script>/, "index loads module app");
for (const match of index.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const ref = match[1];
  if (/^(https?:)?\/\//.test(ref) || ref.startsWith("data:")) continue;
  // A root-absolute ref (the shared "/almanac-back.js" back button) resolves from
  // the repo root, not this document's directory. Resolve it rather than skip it,
  // so a typo'd root-absolute path is still caught.
  const target = ref.startsWith("/") ? join(root, ref.slice(1)) : join(appDir, ref);
  assert.ok(existsSync(target), `index reference exists: ${ref}`);
}

const manifest = JSON.parse(readFileSync(join(appDir, "manifest.webmanifest"), "utf8"));
assert.equal(manifest.start_url, "./", "manifest starts at app root");
assert.equal(manifest.scope, "./", "manifest scope is local");
assert.ok(manifest.icons?.length, "manifest has icons");
for (const icon of manifest.icons) {
  assert.ok(existsSync(join(appDir, icon.src)), `manifest icon exists: ${icon.src}`);
}

const sw = readFileSync(join(appDir, "sw.js"), "utf8");
const shell = [...sw.matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((value) => value === "./" || mustExist.includes(value));
for (const file of mustExist.filter((file) => file !== "sw.js")) {
  assert.ok(shell.includes(file) || (file === "index.html" && shell.includes("./")), `service worker precaches ${file}`);
}
assert.match(sw, /startsWith\(CACHE_PREFIX\)/, "service worker cleans only this app's caches");

const data = readFileSync(join(root, "data.js"), "utf8");
assert.match(data, /slug: "humanity-retention"/, "almanac data contains humanity-retention slug");
assert.match(data, /url: "https:\/\/0x4d44\.github\.io\/humanity-retention\/"/, "almanac URL is absolute");

for (const file of ["index.html", "styles.css", "content.js", "engine.js", "app.js"]) {
  const text = readFileSync(join(appDir, file), "utf8");
  assert.doesNotMatch(text, /https?:\/\//, `${file} has no runtime external URL`);
}

console.log("static validation passed");
