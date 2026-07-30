import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TEST_DIR, "..");
const REPO_ROOT = resolve(ROOT, "..");
const read = (name) => readFileSync(join(ROOT, name), "utf8");

const html = read("index.html");
const css = read("styles.css");
const app = read("app.js");
const engine = read("engine.js");
const worker = read("sw.js");
const manifest = JSON.parse(read("manifest.webmanifest"));
const rootPackage = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));

const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
assert.ok(ids.length >= 80, `expected the complete game shell, found ${ids.length} ids`);
assert.equal(new Set(ids).size, ids.length, "HTML ids must be unique");

const localReferences = [...html.matchAll(/\s(?:src|href)=["']([^"']+)["']/g)]
  .map((match) => match[1])
  .filter((value) => !/^(?:https?:|data:|#|mailto:)/.test(value));
const missingReferences = localReferences.filter((value) => {
  const pathname = value.split(/[?#]/, 1)[0];
  if (!pathname) return false;
  return !existsSync(pathname.startsWith("/")
    ? join(REPO_ROOT, pathname.slice(1))
    : join(ROOT, pathname));
});
assert.deepEqual(missingReferences, [], "every local document reference must exist");

assert.equal(manifest.start_url, "./");
assert.equal(manifest.scope, "./");
assert.equal(manifest.display, "standalone");
assert.ok(manifest.icons?.some(({ src }) => src === "icon.svg"), "manifest must include the local icon");

const externalRuntimeReferences = [...`${html}\n${css}\n${app}\n${engine}`
  .matchAll(/(?:src|href)=["']https?:\/\/[^"']+|url\(\s*["']?https?:\/\//gi)];
assert.deepEqual(externalRuntimeReferences, [], "the game must remain dependency-free at runtime");

assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;/,
  "the global hidden guard must keep author display rules from exposing overlays");

const coreMatch = worker.match(/const CORE\s*=\s*(\[[\s\S]*?\]);/);
assert.ok(coreMatch, "service worker must declare its offline core");
const core = vm.runInNewContext(coreMatch[1]);
for (const asset of ["index.html", "styles.css", "engine.js", "app.js", "manifest.webmanifest", "icon.svg"]) {
  assert.ok(core.includes(`./${asset}`), `${asset} must be precached`);
}

const prefix = worker.match(/const PREFIX\s*=\s*["']([^"']+)["']/)?.[1];
const suffix = worker.match(/const CACHE\s*=\s*`\$\{PREFIX\}([^`]+)`/)?.[1];
assert.ok(prefix && suffix, "service worker cache name must use a document-specific prefix");
const currentCache = `${prefix}${suffix}`;
const deletedCaches = [];
const listeners = {};
const cacheStorage = {
  keys: async () => [`${prefix}old`, currentCache, "sibling-app-v9"],
  delete: async (key) => { deletedCaches.push(key); return true; },
  match: async () => ({ source: "cache" }),
  open: async () => ({ addAll: async () => {}, put: async () => {} }),
};
const workerSelf = {
  addEventListener(type, listener) { listeners[type] = listener; },
  skipWaiting: async () => {},
  clients: { claim: async () => {} },
  registration: { scope: "https://example.test/game-of-dracula/" },
  location: { origin: "https://example.test" },
};
vm.runInNewContext(worker, {
  self: workerSelf,
  caches: cacheStorage,
  fetch: async () => ({ ok: true, type: "basic", clone() { return this; } }),
  URL,
  Response,
});

let activation;
listeners.activate({ waitUntil(promise) { activation = promise; } });
await activation;
assert.deepEqual(deletedCaches, [`${prefix}old`],
  "activation must retire only stale Game of Dracula caches, never sibling caches");

const dispatchFetch = async (request) => {
  let responsePromise = null;
  listeners.fetch({
    request,
    respondWith(promise) { responsePromise = promise; },
  });
  if (responsePromise) await responsePromise;
  return Boolean(responsePromise);
};
assert.equal(await dispatchFetch({
  method: "GET",
  url: "https://example.test/sibling-app/app.js",
  mode: "cors",
}), false, "out-of-scope requests must not be intercepted");
assert.equal(await dispatchFetch({
  method: "GET",
  url: "https://example.test/game-of-dracula/app.js",
  mode: "cors",
}), true, "in-scope GET requests must use the cache strategy");
assert.equal(await dispatchFetch({
  method: "POST",
  url: "https://example.test/game-of-dracula/save",
  mode: "cors",
}), false, "non-GET requests must not be intercepted");

for (const [name, source] of [["engine.js", engine], ["app.js", app], ["sw.js", worker]]) {
  new vm.Script(source, { filename: name });
}

const validatorCommand = "node game-of-dracula/tests/validate-static.mjs";
for (const scriptName of ["test:game-of-dracula", "test", "build"]) {
  assert.ok(rootPackage.scripts[scriptName]?.includes(validatorCommand),
    `${scriptName} must invoke the Game of Dracula static validator`);
}

console.log(`Game of Dracula static validation passed (${ids.length} ids, ${core.length} offline entries).`);
