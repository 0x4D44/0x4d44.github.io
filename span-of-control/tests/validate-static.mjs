import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = normalize(join(here, ".."));

const mustExist = [
  "index.html", "styles.css", "app.js", "engine.js", "content.js", "storage.js",
  "manifest.webmanifest", "sw.js", "icons/icon.svg",
  "fonts/public-sans.woff2", "fonts/courier-prime-400.woff2",
  "fonts/courier-prime-700.woff2", "fonts/playfair-italic.woff2",
];
for (const file of mustExist) assert.ok(existsSync(join(appDir, file)), `${file} exists`);

const index = readFileSync(join(appDir, "index.html"), "utf8");
assert.match(index, /<link rel="stylesheet" href="styles\.css" \/>/, "index links stylesheet");
assert.match(index, /<script type="module" src="app\.js"><\/script>/, "index loads module app");
assert.match(index, /<link rel="manifest" href="manifest\.webmanifest" \/>/, "index links manifest");
for (const match of index.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const ref = match[1];
  if (ref.startsWith("#")) continue;
  assert.ok(!/^(https?:)?\/\//.test(ref), `no runtime external URL: ${ref}`);
  assert.ok(existsSync(join(appDir, ref)), `index reference exists: ${ref}`);
}

const manifest = JSON.parse(readFileSync(join(appDir, "manifest.webmanifest"), "utf8"));
assert.equal(manifest.start_url, "./", "manifest starts at app root");
assert.equal(manifest.scope, "./", "manifest scope is local");
assert.ok(manifest.icons?.length, "manifest has icons");
for (const icon of manifest.icons) assert.ok(existsSync(join(appDir, icon.src)), `manifest icon exists: ${icon.src}`);

const sw = readFileSync(join(appDir, "sw.js"), "utf8");
assert.match(sw, /CACHE_NAME = CACHE_PREFIX \+ "v2"/, "sw cache version pinned (bump this assertion WITH the sw version)");
assert.match(sw, /startsWith\(CACHE_PREFIX\)/, "sw cleans only this app's cache family");
for (const file of mustExist.filter((f) => f !== "sw.js")) {
  assert.ok(sw.includes(`"${file}"`), `service worker precaches ${file}`);
}

// No runtime network beyond our own directory: fonts are self-hosted, scripts
// local. The only tolerated http(s) literal is the SVG xmlns namespace token.
for (const file of ["index.html", "styles.css", "app.js", "engine.js", "content.js", "storage.js", "sw.js"]) {
  const text = readFileSync(join(appDir, file), "utf8")
    .replaceAll("http://www.w3.org/2000/svg", "");
  assert.doesNotMatch(text, /https?:\/\//, `${file} has no runtime external URL`);
  assert.doesNotMatch(text, /TODO|FIXME|lorem ipsum/i, `${file} has no unfinished placeholder`);
}

for (const file of ["app.js", "engine.js", "content.js", "storage.js", "sw.js"]) {
  execFileSync(process.execPath, ["--check", join(appDir, file)], { stdio: "pipe" });
}

const app = readFileSync(join(appDir, "app.js"), "utf8");
assert.match(app, /navigator\.serviceWorker\.register\("\.\/sw\.js"\)/, "app registers the service worker");

const storageSrc = readFileSync(join(appDir, "storage.js"), "utf8");
assert.match(storageSrc, /0x4d44\.spanofcontrol\.v1/, "storage key is namespaced and versioned");

console.log("span-of-control static validation passed");
