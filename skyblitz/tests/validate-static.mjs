// Static acceptance checks for Skyblitz.
//
// Gameplay lives in the *.test.mjs suites and real interaction in ui-nav.test.mjs / audio.test.mjs. This file guards the wiring none of those would
// notice: that the page is self-contained, that every file it reaches exists with the EXACT case (GitHub Pages is case-sensitive, the Windows dev
// machine is not), that the shipped size stays in budget and nothing debug ships, that test browsers can never clip a real desktop cursor, and that
// the game is joined up to the almanac catalogue.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = normalize(join(here, ".."));
const root = normalize(join(appDir, ".."));
const srcDir = join(appDir, "src");

const failures = [];
let checks = 0;
function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function walk(dir, skip = () => false) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (skip(abs)) continue;
    if (statSync(abs).isDirectory()) out.push(...walk(abs, skip));
    else out.push(abs);
  }
  return out;
}

// True only when every path segment below the repo root matches a directory entry byte for byte.
function existsExact(abs) {
  let cur = root;
  for (const seg of relative(root, abs).split(sep)) {
    let names;
    try { names = readdirSync(cur); } catch { return false; }
    if (!names.includes(seg)) return false;
    cur = join(cur, seg);
  }
  return true;
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const rel = (abs) => relative(root, abs).split(sep).join("/");

// ---- document basics ----
const htmlPath = join(appDir, "index.html");
check(existsSync(htmlPath), "skyblitz/index.html exists");
const html = existsSync(htmlPath) ? readFileSync(htmlPath, "utf8") : "";
check(/<meta\b[^>]*name=["']viewport["']/i.test(html), "a viewport meta is present");
check(/<title>[^<]*Skyblitz[^<]*<\/title>/i.test(html), "the title names Skyblitz");
check(/<meta\b[^>]*name=["']description["']/i.test(html), "a description meta is present");
check(/<script\b[^>]*\bdefer\b[^>]*src=["']\/almanac-back\.js["']/i.test(html), "the shared \"back to the almanac\" script is included (defer, /almanac-back.js)");
check(/<script\b[^>]*type=["']module["'][^>]*src=["']src\/main\.js["']/i.test(html) && existsSync(join(srcDir, "main.js")), "the page boots the module src/main.js");
check(existsSync(join(root, ".nojekyll")), ".nojekyll is present at the repo root");

// ---- self-contained: nothing may be fetched from another origin ----
const externalRefs = [...html.matchAll(/\b(?:src|href)\s*=\s*["'](https?:)?\/\/[^"']+["']/gi)].map((m) => m[0]);
check(externalRefs.length === 0, `the page loads nothing from another origin (found: ${externalRefs.join(", ")})`);
const sources = walk(srcDir).filter((f) => f.endsWith(".js"));
check(sources.length > 40, `the module tree is present (${sources.length} files under src/)`);
const texts = new Map(sources.map((f) => [f, stripComments(readFileSync(f, "utf8"))]));
for (const [f, text] of texts) {
  const remote = [...text.matchAll(/["'`](https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^"'`]*["'`]/gi)].map((m) => m[0]);
  check(remote.length === 0, `${rel(f)} reaches nothing off the network (${remote.slice(0, 2).join(", ")})`);
}

// ---- importmap and vendored three ----
const imap = html.match(/<script type=["']importmap["']>([\s\S]*?)<\/script>/);
let imports = {};
try { imports = JSON.parse(imap?.[1] ?? "{}").imports ?? {}; } catch { /* reported below */ }
check(Boolean(imports.three) && existsExact(resolve(appDir, imports.three)), "the importmap maps three to a vendored file that exists");
check(Boolean(imports["three/addons/"]) && existsExact(resolve(appDir, imports["three/addons/"])), "the importmap maps three/addons/ to a vendored folder that exists");

// ---- every import resolves, with exact case ----
let relImports = 0, addonImports = 0;
for (const [f, text] of texts) {
  for (const m of text.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)) {
    relImports += 1;
    const target = resolve(dirname(f), m[1]);
    check(existsExact(target), `${rel(f)} imports ${m[1]}, which must exist with exactly that case`);
  }
  for (const m of text.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']three\/addons\/([^"']+)["']/g)) {
    addonImports += 1;
    check(existsExact(resolve(appDir, imports["three/addons/"] ?? "vendor/addons/", m[1])), `${rel(f)} imports three/addons/${m[1]}, which must be vendored with exactly that case`);
  }
}
check(relImports > 100, `the import sweep saw the whole module graph (${relImports} relative imports)`);
console.log(`  imports checked: ${relImports} relative, ${addonImports} three addons`);

// ---- asset references ----
const assetsJs = readFileSync(join(srcDir, "assets.js"), "utf8");
const textures = [...assetsJs.matchAll(/\bT\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
check(textures.length >= 25, `assets.js lists its textures (${textures.length})`);
for (const file of textures) check(existsExact(join(appDir, "assets", "tex", file)), `texture assets/tex/${file} exists with exactly that case`);
const musicDir = join(appDir, "assets", "music");
for (const id of readdirSync(musicDir).filter((n) => statSync(join(musicDir, n)).isDirectory())) {
  const metaPath = join(musicDir, id, "meta.json");
  if (!existsSync(metaPath)) { check(false, `assets/music/${id}/meta.json exists`); continue; }
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  if (id === "stingers") {
    for (const name of Object.keys(meta)) check(existsExact(join(musicDir, id, `${name}.ogg`)), `sting assets/music/stingers/${name}.ogg exists`);
  } else {
    check(Object.keys(meta.stems ?? {}).length >= 3, `assets/music/${id}/meta.json lists its stems`);
    for (const st of Object.values(meta.stems ?? {})) check(existsExact(join(musicDir, id, st.file)), `stem assets/music/${id}/${st.file} exists with exactly that case`);
  }
}

// ---- size budget and nothing that must not ship ----
const shipped = walk(appDir, (abs) => /[\\/](tests|node_modules)$/.test(abs) || /[\\/]assets[\\/](music-src|tex-src)$/.test(abs));
const bytes = shipped.reduce((n, f) => n + statSync(f).size, 0);
check(bytes <= 25 * 1024 * 1024, `shipped size ${(bytes / 1048576).toFixed(1)} MB stays within the 25 MB budget`);
const big = shipped.filter((f) => statSync(f).size > 3 * 1024 * 1024).map(rel);
check(big.length === 0, `no shipped file is over 3 MB (${big.join(", ")})`);
const stray = shipped.filter((f) => /\.(zip|psd|7z|rar|log|tmp|bak|orig)$/i.test(f) || /(^|[\\/])(_dbg|scratch|\.scratch)/i.test(relative(appDir, f))).map(rel);
check(stray.length === 0, `no debug, scratch or archive file ships (${stray.join(", ")})`);
check(!existsSync(join(appDir, "tests", "_dbg.mjs")), "the stray tests/_dbg.mjs debug file is gone");

// ---- policy: a test browser must never be able to clip the real desktop cursor ----
for (const [f, text] of texts) {
  check(!/\b(requestPointerLock|exitPointerLock|pointerLockElement)\b/.test(text), `${rel(f)} takes no pointer lock (even headless Chrome would clip the real cursor)`);
  check(!/\bconsole\.(log|debug|info)\(/.test(text) || f.endsWith(`${sep}debug.js`), `${rel(f)} leaves no console.log in production code`);
  check(!/\bdebugger\b/.test(text), `${rel(f)} leaves no debugger statement`);
}

// ---- catalogue wiring ----
const dataPath = join(root, "data.js"), indexPath = join(root, "index.html");
const data = readFileSync(dataPath, "utf8"), catalogue = readFileSync(indexPath, "utf8");
check(/slug:\s*["']skyblitz["']/.test(data), "data.js lists the skyblitz slug");
check(/url:\s*["']https:\/\/0x4d44\.github\.io\/skyblitz\/["']/.test(data), "data.js points at the published URL");
const entry = data.match(/\{[^{}]*slug:\s*["']skyblitz["'][\s\S]{0,1400}?\n\s*\}/);
check(Boolean(entry), "the skyblitz catalogue entry can be read");
if (entry) {
  const illustration = entry[0].match(/illustration:\s*["']([^"']+)["']/);
  check(Boolean(illustration), "the entry names an illustration symbol");
  if (illustration) check(new RegExp(`<symbol\\s+id=["']${illustration[1]}["']`).test(catalogue), `the sprite in index.html defines <symbol id="${illustration[1]}">`);
  check(/date:\s*["']\d{4}-\d{2}-\d{2}/.test(entry[0]), "the entry has an ISO date");
  check(/real:\s*true/.test(entry[0]), "the entry is marked published");
  const tagline = entry[0].match(/tagline:\s*["']([^"']+)["']/);
  check(Boolean(tagline), "the entry has a tagline");
  check(!tagline || tagline[1].split(/\s+/).length <= 60, `the tagline stays short (${tagline ? tagline[1].split(/\s+/).length : 0} words)`);
}
check(/COLLECTIONS[\s\S]*["']skyblitz["']/.test(data), "skyblitz sits on a shelf in window.COLLECTIONS");

if (failures.length) {
  console.error(`skyblitz static checks failed (${failures.length}/${checks}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`skyblitz static checks passed (${checks})`);
