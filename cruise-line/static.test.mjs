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
  "guidance.mjs",
  "icon.svg",
  "manifest.webmanifest",
  "sw.js",
];

test("the static shell is self-contained and internally consistent", () => {
  for (const file of files) assert.doesNotThrow(() => read(file), `${file} exists`);

  const html = read("index.html");
  const app = read("app.mjs");
  const css = read("styles.css");
  const storage = read("storage.mjs");
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
  assert.match(serviceWorker, /new URL\(self\.registration\.scope\)/, "fetch handling reads the worker scope");
  assert.match(serviceWorker, /url\.origin === scope\.origin && url\.pathname\.startsWith\(scope\.pathname\)/, "fetch handling stays inside the game scope");
  assert.doesNotMatch(serviceWorker, /caches\.match\(event\.request\)/, "runtime lookups use only the game cache");
  assert.match(serviceWorker, /event\.request\.mode === "navigate"/, "HTML fallback is navigation-only");
  for (const asset of files.filter((file) => !["sw.js", "README.md"].includes(file))) {
    assert.ok(serviceWorker.includes(`./${asset}`), `service worker precaches ${asset}`);
  }

  assert.match(app, /let modalClosable = true;/, "modal closability is tracked");
  assert.match(app, /if \(!modalClosable && !force\) return;/, "every modal close path enforces closability");
  assert.equal([...app.matchAll(/closeModal\(true\)/g)].length, 2, "terminal actions force-close the modal");

  assert.doesNotMatch(app, /baseFare \* fare\) \/ 1_000_000/, "fares are not passed through the millions formatter");
  assert.equal([...app.matchAll(/fareMoney\(market\.baseFare \* (?:fare|value)\)/g)].length, 2, "initial and live fares use one formatter");

  assert.match(app, /function guidanceCard\(tab, forecast\)/, "each department can render contextual guidance");
  assert.match(app, /openGuidanceIntroduction/, "new companies receive the board induction");
  assert.match(storage, /guidanceEnabled: true, guidanceTourComplete: false/, "guidance preferences have stable defaults");
  assert.match(css, /\.adviser-card \{/, "adviser strip is styled");
  assert.match(css, /\.brand > span:last-child \{ min-width: 0; \}/, "long company names can shrink safely");
  assert.match(css, /\.game-nav \{[^}]*overflow-y: auto;/, "short landscape navigation remains scrollable");
  assert.match(css, /@media \(max-height: 560px\)[^{]*\{[^}]*\.game-shell/s, "phone landscape receives the compact game layout");
  assert.match(css, /@media \(pointer: coarse\)/, "touch controls receive a coarse-pointer size floor");
  assert.match(css, /max-height: 92dvh/, "mobile modals follow the dynamic viewport");
  assert.match(app, /class="map-hit" r="4\.5"/, "route-map ports have enlarged hit regions");
});
