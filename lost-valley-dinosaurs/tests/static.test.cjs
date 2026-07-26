"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");
const html = read("index.html");
const css = read("styles.css");
const engine = read("engine.js");
const app = read("app.js");
const serviceWorker = read("sw.js");
const manifest = JSON.parse(read("manifest.webmanifest"));

const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "HTML IDs must be unique");
assert.ok(ids.length >= 80, `expected the full game UI, found only ${ids.length} IDs`);

for (const reference of ["styles.css", "engine.js", "app.js", "manifest.webmanifest", "icon.svg"]) {
  assert.ok(html.includes(reference), `index.html must reference ${reference}`);
  assert.ok(fs.existsSync(path.join(ROOT, reference)), `${reference} must exist`);
}
assert.ok(html.includes('<script defer src="/almanac-back.js"></script>'), "shared Almanac navigation must be included");
assert.ok(html.includes('aria-live="polite"'), "the UI must expose a polite live region");
assert.match(css, /prefers-reduced-motion\s*:\s*reduce/, "reduced motion must be supported");
assert.match(html, /role="application"/, "the interactive board must be named for assistive technology");

const externalRuntimeReferences = [...`${html}\n${css}\n${app}\n${engine}`.matchAll(/(?:src|href)=["']https?:\/\/[^"']+|url\(\s*["']?https?:\/\//gi)];
assert.deepEqual(externalRuntimeReferences, [], "the game must remain dependency-free and offline-capable");

assert.equal(manifest.name, "Lost Valley of the Dinosaurs");
assert.equal(manifest.start_url, "./");
assert.equal(manifest.scope, "./");
assert.equal(manifest.display, "standalone");
assert.ok(Array.isArray(manifest.icons) && manifest.icons.some(({ src }) => src === "icon.svg"));

const coreMatch = serviceWorker.match(/const CORE\s*=\s*(\[[\s\S]*?\]);/);
assert.ok(coreMatch, "service worker must declare its offline core");
const core = vm.runInNewContext(coreMatch[1]);
assert.ok(core.length >= 7, "offline core must include the whole application shell");
for (const entry of core) {
  if (entry === "./") continue;
  const localPath = entry.replace(/^\.\//, "");
  assert.ok(fs.existsSync(path.join(ROOT, localPath)), `offline entry ${entry} must exist`);
}

for (const [name, source] of [["engine.js", engine], ["app.js", app], ["sw.js", serviceWorker]]) {
  new vm.Script(source, { filename: name });
}

assert.match(engine, /const CARD_DEFS\s*=\s*\[/, "card distribution must be explicit and auditable");
assert.match(app, /track\[i\]\[0\].*track\[i\]\[1\]/, "volcano cone coordinates must use tuple indexing");
assert.doesNotMatch(app, /track\[i\]\.x|track\[i\]\.y/, "volcano tuple regression must not return");

console.log(`✓ ${ids.length} unique HTML IDs and named interactive regions`);
console.log("✓ zero external runtime dependencies");
console.log(`✓ manifest and ${core.length}-entry offline application shell`);
console.log("✓ engine, renderer and service worker parse as JavaScript");
console.log("✓ shared Almanac navigation, live announcements and reduced motion");
console.log("✓ volcano coordinate regression is pinned by source audit");
