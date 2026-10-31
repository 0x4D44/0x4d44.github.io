// Static acceptance checks for Skyblitz.
//
// Gameplay lives in the *.test.mjs suites and real interaction in ui-nav.test.mjs / audio.test.mjs. This file guards the wiring none of those would
// notice: that the page is self-contained, that every file it reaches exists with the EXACT case (GitHub Pages is case-sensitive, the Windows dev
// machine is not), that the shipped size stays in budget and nothing debug ships, that test browsers can never clip a real desktop cursor, and that
// the game is joined up to the almanac catalogue.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

// ---- stylesheets and inline styles: no other origin through url() or @import, and every local url() resolves with exact case ----
// (Pages serves everything in the tree, so every .css and every <style> / style="" in any .html counts, tests/lab included.)
const servedFiles = walk(appDir, (abs) => /[\\/](node_modules|\.git)$/.test(abs));
const cssTargets = (text) => {
  const t = text.replace(/\/\*[\s\S]*?\*\//g, " "), out = [];
  for (const m of t.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s"']*))\s*\)/gi)) out.push((m[1] ?? m[2] ?? m[3] ?? "").trim());
  for (const m of t.matchAll(/@import\s+(?:"([^"]+)"|'([^']+)')/gi)) out.push((m[1] ?? m[2]).trim());
  return out;
};
const isRemoteRef = (u) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(u) || /^https?:/i.test(u);
const isLocalRef = (u) => u !== "" && !isRemoteRef(u) && !/^(?:data|blob|about|javascript):|^#/i.test(u);
const styleHolders = servedFiles.filter((f) => /\.(css|html?)$/i.test(f));
check(styleHolders.some((f) => f.endsWith(`${sep}style.css`)), "style.css is part of the style scan");
for (const f of styleHolders) {
  const raw = readFileSync(f, "utf8");
  const text = /\.html?$/i.test(f) ? [...raw.replace(/<!--[\s\S]*?-->/g, " ").matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>|\bstyle\s*=\s*"([^"]*)"|\bstyle\s*=\s*'([^']*)'/gi)].map((m) => m[1] ?? m[2] ?? m[3]).join("\n") : raw;
  const targets = cssTargets(text);
  const remote = targets.filter(isRemoteRef);
  check(remote.length === 0, `${rel(f)} reaches nothing off the network through url() or @import (${remote.slice(0, 2).join(", ")})`);
  for (const u of targets.filter(isLocalRef)) check(existsExact(resolve(dirname(f), u.split(/[?#]/)[0])), `${rel(f)} refers to ${u} in a stylesheet, which must exist with exactly that case`);
}
const pageRefs = [];
for (const f of servedFiles.filter((p) => /\.html?$/i.test(p))) for (const m of readFileSync(f, "utf8").replace(/<!--[\s\S]*?-->/g, " ").matchAll(/\b(?:src|href)\s*=\s*["'](?:https?:)?\/\/[^"']+["']/gi)) pageRefs.push(`${rel(f)}: ${m[0]}`);
check(pageRefs.length === 0, `no page under skyblitz/ (tests/lab included) loads anything from another origin (found: ${pageRefs.join(", ")})`);

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

// ---- the vendored addons are a closed set (E-30): they import each other, and the tests may import them too ----
// vendor/addons holds only what src/ reaches (EffectComposer -> MaskPass, UnrealBloomPass -> CopyShader ...). A dependency pruned or mis-cased there
// would only show as a failed module load at boot, so every import inside the folder, and every addon import in tests/ and the lab pages, must resolve.
const addonRoot = resolve(appDir, imports["three/addons/"] ?? "vendor/addons/");
const addonFiles = existsSync(addonRoot) ? walk(addonRoot).filter((f) => f.endsWith(".js")) : [];
check(addonFiles.length > 0, `vendor/addons holds the addons the game imports (${addonFiles.length} files)`);
let addonDeps = 0;
for (const f of addonFiles) {
  for (const m of stripComments(readFileSync(f, "utf8")).matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)) {
    addonDeps += 1;
    check(existsExact(resolve(dirname(f), m[1])), `${rel(f)} imports ${m[1]}, which must be vendored with exactly that case`);
  }
}
for (const f of walk(join(appDir, "tests"), (abs) => /[\\/]node_modules$/.test(abs)).filter((p) => /\.(m?js|html?)$/i.test(p))) {
  for (const m of readFileSync(f, "utf8").matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']three\/addons\/([^"']+)["']/g)) {
    addonDeps += 1;
    check(existsExact(resolve(addonRoot, m[1])), `${rel(f)} imports three/addons/${m[1]}, which must be vendored with exactly that case`);
  }
}
console.log(`  vendored addons checked: ${addonFiles.length} files, ${addonDeps} imports`);

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

// ---- play('id') literals name a real track or a real SFX, with exactly that case (a typo is silent at run time: the player just hears nothing) ----
const musicIds = new Set(readdirSync(musicDir).filter((n) => n !== "stingers" && statSync(join(musicDir, n)).isDirectory()));
let sfxNames = new Set();
try { sfxNames = new Set((await import(pathToFileURL(join(srcDir, "audio", "sfx.js")).href)).SFX_NAMES); } catch (e) { check(false, `src/audio/sfx.js loads, so the SFX names can be listed (${e.message})`); }
check(musicIds.size >= 6 && sfxNames.size >= 40, `the track list (${musicIds.size}) and the SFX list (${sfxNames.size}) were read`);
let playCalls = 0;
for (const [f, text] of texts) {
  for (const m of text.matchAll(/\.play\(\s*(["'`])([^"'`$\\]+)\1/g)) {
    playCalls += 1;
    const id = m[2], music = f.endsWith(`${sep}music.js`);
    check(music ? musicIds.has(id) : sfxNames.has(id) || musicIds.has(id), `${rel(f)} plays '${id}', which must be ${music ? "a track folder under assets/music" : "an SFX in audio/sfx.js or a track folder under assets/music"} with exactly that case`);
  }
}
check(playCalls >= 30, `the play('...') sweep saw the audio call sites (${playCalls})`);

// ---- size budget and nothing that must not ship ----
const shipped = walk(appDir, (abs) => /[\\/](tests|node_modules)$/.test(abs) || /[\\/]assets[\\/](music-src|tex-src)$/.test(abs));
const bytes = shipped.reduce((n, f) => n + statSync(f).size, 0);
check(bytes <= 25 * 1024 * 1024, `shipped size ${(bytes / 1048576).toFixed(1)} MB stays within the 25 MB budget`);
const big = shipped.filter((f) => statSync(f).size > 3 * 1024 * 1024).map(rel);
check(big.length === 0, `no shipped file is over 3 MB (${big.join(", ")})`);
const stray = shipped.filter((f) => /\.(zip|psd|7z|rar|log|tmp|bak|orig)$/i.test(f) || /(^|[\\/])(_dbg|scratch|\.scratch)/i.test(relative(appDir, f))).map(rel);
check(stray.length === 0, `no debug, scratch or archive file ships (${stray.join(", ")})`);
check(!existsSync(join(appDir, "tests", "_dbg.mjs")), "the stray tests/_dbg.mjs debug file is gone");

// Pages serves the WHOLE tree: tests/, the lab pages and the *-src folders are public too, so the archive and size scans cover every file in it (E-22).
{
  const MB = 1024 * 1024, mb = (n) => `${(n / MB).toFixed(1)} MB`;
  const sizes = servedFiles.map((f) => [f, statSync(f).size]);
  check(sizes.length > 100, `the served-file sweep saw the whole tree (${sizes.length} files)`);
  const archives = sizes.filter(([f]) => /\.(zip|7z|rar|tar|tgz|gz|bz2|xz|zst|lz4|jar|psd)$/i.test(f)).map(([f, n]) => `${rel(f)} (${mb(n)})`);
  check(archives.length === 0, `no archive of any size is served from skyblitz/, tests and source folders included (${archives.join(", ")})`);
  const huge = sizes.filter(([, n]) => n > 5 * MB).map(([f, n]) => `${rel(f)} (${mb(n)})`);
  check(huge.length === 0, `no served file is over 5 MB, audio dumps in the source folders included (${huge.join(", ")})`);
  for (const [f, n] of sizes) if (n > 1.5 * MB && n <= 5 * MB) console.log(`  warning: ${rel(f)} is ${mb(n)} and is served as it is`);
}

// ---- policy: a test browser must never be able to clip the real desktop cursor ----
for (const [f, text] of texts) {
  check(!/\b(requestPointerLock|exitPointerLock|pointerLockElement)\b/.test(text), `${rel(f)} takes no pointer lock (even headless Chrome would clip the real cursor)`);
  check(!/\bconsole\s*\.\s*(log|debug|info)\s*\(/.test(text) || f.endsWith(`${sep}debug.js`), `${rel(f)} leaves no console.log in production code`);   // `\s*`: "console.log (" and a line break before the dot are still calls
  check(!/\bdebugger\b/.test(text), `${rel(f)} leaves no debugger statement`);
}

// Three's default checks every program's link log synchronously, which stalls shader compilation; players get it off, tests and ?debug keep it on.
// The right-hand side is evaluated against a fake game (this.manual, this.params.has): falsy for a bare URL, truthy for ?manual and for ?debug. That rejects
// `= true`, `= 1`, `= !!1`, `= this.manual || true` and every other truthy spelling, and a check that is never on.
{
  const assign = (texts.get(join(srcDir, "game.js")) ?? "").match(/renderer\.debug\.checkShaderErrors\s*=\s*([^;]+);/);
  check(Boolean(assign) && /^[\w\s.!()'"|&,?:]+$/.test(assign[1]), "game.js assigns renderer.debug.checkShaderErrors a plain expression");
  if (assign && /^[\w\s.!()'"|&,?:]+$/.test(assign[1])) {
    // `debugFlag` (debug.js: `?debug` unless it is debug=0 / false / off / no, R2-E-13) is given to the expression as a stub that reads the flag list the same way
    const verdict = (manual, flags) => { try { return Boolean(new Function("debugFlag", `return (${assign[1]});`).call({ manual, params: { has: (k) => flags.includes(k) } }, (p) => p.has("debug"))); } catch { return undefined; } };
    check(verdict(false, []) === false, "game.js turns the synchronous shader-link check off for players (renderer.debug.checkShaderErrors must be false on a bare URL)");
    check(verdict(true, []) === true && verdict(false, ["debug"]) === true, "game.js keeps the shader-link check on for ?manual and ?debug runs (renderer.debug.checkShaderErrors)");
  }
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
