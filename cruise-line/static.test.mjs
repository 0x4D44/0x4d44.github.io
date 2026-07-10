import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), "utf8");
const files = [
  "index.html",
  "styles.css",
  "app.mjs",
  "engine.mjs",
  "content.mjs",
  "storage.mjs",
  "icon.svg",
  "manifest.webmanifest",
  "sw.js",
];

test("the static shell is self-contained and internally consistent", () => {
  for (const file of files) assert.doesNotThrow(() => read(file), `${file} exists`);

  const html = read("index.html");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size, "HTML ids are unique");
  for (const reference of ["styles.css", "app.mjs", "manifest.webmanifest", "icon.svg"]) {
    assert.match(html, new RegExp(reference.replace(".", "\\.")), `index references ${reference}`);
  }
  assert.doesNotMatch(html, /https?:\/\//, "the game shell has no runtime CDN dependency");

  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.ok(manifest.icons.some((icon) => icon.src === "icon.svg"));

  const serviceWorker = read("sw.js");
  assert.match(serviceWorker, /CACHE_PREFIX = "wake-and-fortune-"/);
  assert.match(serviceWorker, /key\.startsWith\(CACHE_PREFIX\)/, "cache cleanup is scoped to this app");
  assert.match(serviceWorker, /event\.request\.mode === "navigate"/, "HTML fallback is navigation-only");
  for (const asset of files.filter((file) => !["sw.js", "README.md"].includes(file))) {
    assert.ok(serviceWorker.includes(`./${asset}`), `service worker precaches ${asset}`);
  }
});
