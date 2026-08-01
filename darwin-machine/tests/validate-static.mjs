import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const PROJECT = resolve(import.meta.dirname, "..");
const ROOT = resolve(PROJECT, "..");
const read = (path) => readFile(resolve(PROJECT, path), "utf8");

const [html, css, app, worker, sw, manifestText, buildInfoJs, core, minimalText, clumsyText] = await Promise.all([
  read("index.html"), read("styles.css"), read("app.js"), read("worker.js"), read("sw.js"),
  read("manifest.webmanifest"), read("build-info.js"), read("rust/crates/darwin-core/src/lib.rs"),
  read("ancestors/minimal-v1.json"), read("ancestors/clumsy-v1.json"),
]);

const requiredIds = [
  "laboratory", "dish", "dish-wrap", "engine-status", "play", "step", "speed", "preset", "seed", "reset",
  "world-summary", "stat-update", "stat-population", "stat-genotypes", "stat-dominant", "stat-genome", "checksum",
  "inspector-empty", "inspector", "inspector-title", "inspector-meta", "genome-bytes", "parent-diff", "disassembly",
  "registers", "child-progress", "local-resource", "sandbox", "sandbox-output", "population-chart", "genome-chart",
  "top-genotypes", "fossils", "mutation", "mutation-value", "expected-mutation", "bottleneck", "catastrophe",
  "resource-pulse", "save", "export", "import", "file", "saves", "save-dialog", "lab-dialog", "about-dialog",
  "intro", "begin", "intro-skip", "notice", "fatal", "fatal-text", "recover", "reload", "accessible-population",
];
for (const id of requiredIds) assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
assert.equal(new Set(ids).size, ids.length, "duplicate HTML id");
assert.match(html, /<canvas id="dish"[^>]+tabindex="0"[^>]+role="img"/, "dish must be keyboard reachable and described");
assert.match(html, /id="world-summary"[^>]+aria-live="polite"/, "accessible world summary missing");
assert.match(html, /<script type="module" src="\.\/app\.js"><\/script>/, "module entry missing");
assert.match(html, /<script defer src="\/almanac-back\.js"><\/script>/, "shared Almanac back control missing");
assert.doesNotMatch(`${html}\n${css}\n${app}\n${worker}`, /https?:\/\//, "runtime has an external network dependency");
assert.match(css, /@media \(max-width: 430px\)/, "phone layout missing");
assert.match(css, /prefers-reduced-motion/, "reduced motion handling missing");
assert.match(css, /minmax\(0,\s*1fr\)/, "collapsed grids need a zero min-content floor");

const referenced = new Set();
for (const match of html.matchAll(/(?:src|href)="(\.\/[^"?#]+)"/g)) referenced.add(match[1].slice(2));
for (const path of referenced) assert.ok(existsSync(resolve(PROJECT, path)), `referenced asset does not exist: ${path}`);

const manifest = JSON.parse(manifestText);
assert.equal(manifest.start_url, "./");
assert.equal(manifest.scope, "./");
assert.equal(manifest.display, "standalone");
assert.ok(manifest.icons.some((icon) => icon.src === "./icon.svg"));

const buildId = buildInfoJs.match(/APP_BUILD_ID = "([^"]+)"/)?.[1];
const coreBuildId = core.match(/pub const BUILD_ID: &str = "([^"]+)"/)?.[1];
const swBuildId = sw.match(/const BUILD_ID = "([^"]+)"/)?.[1];
assert.ok(buildId, "build-info.js build id missing");
assert.equal(coreBuildId, buildId, "Rust/page build id mismatch");
assert.equal(swBuildId, buildId, "service-worker/page build id mismatch");
assert.match(worker, /wasmId !== APP_BUILD_ID/, "Worker/Wasm handshake missing");
assert.match(worker, /grid\.buffer[^\n]+\[grid\.buffer\]/, "grid snapshot must transfer rather than clone");
assert.match(worker, /16 \* 1024 \* 1024/, "Worker import cap missing");
assert.match(core, /MAX_IMPORT_BYTES: usize = 16 \* 1024 \* 1024/, "core import cap missing");
assert.match(core, /scheduler_params\(self\.seed, self\.update/, "seeded scheduler missing");
assert.match(core, /commit_births\(births\)/, "end-update birth commit missing");
assert.doesNotMatch(core, /fn fitness|fitness_score/i, "release core must not contain a global fitness function");

const minimal = JSON.parse(minimalText);
const clumsy = JSON.parse(clumsyText);
assert.equal(minimal.bytes.length, 16, "minimal ancestor must remain 16 bytes");
assert.equal(clumsy.bytes.length, 64, "clumsy ancestor must remain 64 bytes");
assert.deepEqual(minimal.bytes, [136,240,212,216,17,2,1,98,114,49,129,193,146,1,2,224], "canonical minimal ancestor drifted");
assert.equal(new Set(minimal.bytes.map((b) => b >= 0 && b <= 255)).size, 1, "invalid minimal byte");

const pkgFiles = ["pkg/darwin_wasm.js", "pkg/darwin_wasm_bg.wasm", "pkg/build-info.json"];
for (const path of pkgFiles) assert.ok(existsSync(resolve(PROJECT, path)), `generated asset missing: ${path}`);
const pkgInfo = JSON.parse(await read("pkg/build-info.json"));
assert.equal(pkgInfo.generated, true, "pkg build marker still says generated=false");
assert.equal(pkgInfo.buildId, buildId, "generated package build id mismatch");
const wasmSize = (await stat(resolve(PROJECT, "pkg/darwin_wasm_bg.wasm"))).size;
assert.ok(wasmSize > 10_000, `Wasm payload implausibly small (${wasmSize})`);
assert.ok(wasmSize < 4_000_000, `Wasm payload exceeds provisional 4 MiB budget (${wasmSize})`);
for (const asset of ["./index.html","./styles.css","./app.js","./worker.js","./build-info.js","./pkg/darwin_wasm.js","./pkg/darwin_wasm_bg.wasm","/almanac-back.js"]) {
  assert.ok(sw.includes(JSON.stringify(asset)), `offline cache omits ${asset}`);
}

if (existsSync(resolve(ROOT, "data.js"))) {
  const [data, rootIndex, pkg] = await Promise.all([
    readFile(resolve(ROOT, "data.js"), "utf8"),
    readFile(resolve(ROOT, "index.html"), "utf8"),
    readFile(resolve(ROOT, "package.json"), "utf8"),
  ]);
  assert.match(data, /slug: "darwin-machine"/, "catalog entry missing");
  const shelfCount = [...data.matchAll(/slugs:\s*\[[^\]]*"darwin-machine"[^\]]*\]/gs)].length;
  assert.ok(shelfCount >= 2, `expected Darwin Machine on at least two shelves, found ${shelfCount}`);
  assert.match(rootIndex, /<symbol id="ill-darwin"/, "catalog illustration missing");
  const parsed = JSON.parse(pkg);
  assert.ok(parsed.scripts?.["test:darwin-machine"], "focused root test command missing");
}

console.log(`Darwin Machine static validation passed (${ids.length} unique ids, Wasm ${wasmSize.toLocaleString("en-GB")} bytes).`);
