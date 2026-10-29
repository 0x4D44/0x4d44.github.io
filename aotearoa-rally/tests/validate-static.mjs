// Static audit of the shipped game folder. No browser, no network.
//   node tests/validate-static.mjs        (exit 1 and a list of problems when anything is wrong)

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname, relative, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(ROOT, "..");
const problems = [];
const notes = [];
const bad = (m) => problems.push(m);
const rel = (p) => relative(ROOT, p).split(sep).join("/");

const TEXT_EXT = new Set([".html", ".mjs", ".js", ".css", ".json", ".svg", ".md", ".txt"]);
const SKIP_DIRS = new Set([".scratch", "node_modules", ".git"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const files = walk(ROOT);
const isVendor = (p) => rel(p).startsWith("vendor/");

// ---------------------------------------------------------------- index.html
const indexPath = join(ROOT, "index.html");
if (!existsSync(indexPath)) bad("index.html is missing");
const html = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "";

const refRe = /\b(?:src|href)\s*=\s*"([^"]+)"/g;
for (const m of html.matchAll(refRe)) {
  const ref = m[1];
  if (ref.startsWith("#") || ref.startsWith("data:")) continue;
  if (/^(?:https?:)?\/\//i.test(ref)) { bad(`index.html: external reference ${ref}`); continue; }
  if (ref === "/almanac-back.js") { if (!existsSync(join(REPO, "almanac-back.js"))) bad("repo root almanac-back.js is missing"); continue; }
  if (ref.startsWith("/")) { bad(`index.html: root-absolute reference ${ref} (every path must be relative)`); continue; }
  if (!existsSync(resolve(ROOT, ref))) bad(`index.html: ${ref} does not exist`);
}
if (!/<script defer src="\/almanac-back\.js"><\/script>\s*<\/body>/.test(html)) bad('index.html: missing `<script defer src="/almanac-back.js"></script>` just before </body>');
if (!/<meta name="viewport"/.test(html)) bad("index.html: viewport meta missing");
if (!/<meta name="theme-color"/.test(html)) bad("index.html: theme-color meta missing");
if (!/id="nogl"/.test(html)) bad("index.html: WebGL2-unsupported message (#nogl) missing");
if (!/id="loading"/.test(html)) bad("index.html: loading screen (#loading) missing");
if (!/rel="icon"/.test(html)) bad("index.html: favicon link missing");
if (!existsSync(join(ROOT, "favicon.svg"))) bad("favicon.svg missing");

// import map
let importMap = {};
const im = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
if (!im) bad("index.html: import map missing");
else {
  try { importMap = JSON.parse(im[1]).imports || {}; } catch (e) { bad("index.html: import map is not valid JSON: " + e.message); }
}
for (const [k, v] of Object.entries(importMap)) {
  if (/^(?:https?:)?\/\//i.test(v)) bad(`import map ${k} -> external ${v}`);
  else if (!existsSync(resolve(ROOT, v))) bad(`import map ${k} -> ${v} does not exist`);
}
for (const need of ["three", "three/addons"]) if (!importMap[need]) bad(`import map lacks "${need}"`);
if (!/type="module" src="\.\/game\.mjs"/.test(html)) bad("index.html: game.mjs module script missing");

// ---------------------------------------------------------------- module graph
const SELF_REL = "tests/validate-static.mjs";
const jsFiles = files.filter((p) => /\.(mjs|js)$/.test(p) && !isVendor(p) && !rel(p).startsWith("tools/"));
const importRe = /(?:^|[\s;}])(?:import|export)\s+(?:[^'"()]*?\s+from\s+)?["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;
const graph = new Map();
const litRe = /["'](\.{1,2}\/[\w./-]+\.mjs)["']/g; // module paths passed as plain strings, e.g. tryImport("stage", "./core/stage.mjs")
for (const p of jsFiles) {
  if (rel(p) === SELF_REL) continue;
  const src = readFileSync(p, "utf8");
  const deps = [];
  for (const m of src.matchAll(importRe)) deps.push(m[1] || m[2]);
  for (const m of src.matchAll(litRe)) if (!deps.includes(m[1])) deps.push(m[1]);
  graph.set(p, deps);
  for (const spec of deps) {
    if (spec.startsWith(".") || spec.startsWith("/")) {
      const target = spec.startsWith("/") ? join(ROOT, spec) : resolve(dirname(p), spec);
      if (!existsSync(target)) bad(`${rel(p)}: import "${spec}" does not resolve`);
    } else if (spec.startsWith("node:")) {
      const inBrowser = !/^(tests|tools)\//.test(rel(p)) && !/^core\/.*\.mjs$/.test(rel(p)) && !rel(p).startsWith("core/");
      if (inBrowser) bad(`${rel(p)}: browser module imports ${spec}`);
    } else if (!importMap[spec]) bad(`${rel(p)}: bare import "${spec}" is not in the import map`);
  }
}
// reachability from game.mjs: everything pulled in must be browser-safe
const seen = new Set();
(function visit(p) {
  if (!existsSync(p) || seen.has(p) || !graph.has(p)) return;
  seen.add(p);
  for (const spec of graph.get(p)) if (spec.startsWith(".")) visit(resolve(dirname(p), spec));
})(join(ROOT, "game.mjs"));
notes.push(`module graph: ${seen.size} modules reachable from game.mjs, ${jsFiles.length} js files audited`);
for (const p of seen) {
  const src = readFileSync(p, "utf8");
  if (/\b(?:require|process\.|__dirname|fs\.)\b/.test(src.replace(/\/\/.*$/gm, "")) && !rel(p).startsWith("tests/")) bad(`${rel(p)}: uses Node-only globals but is reachable from the browser entry`);
}

// ---------------------------------------------------------------- external URLs, forbidden words, console
const URL_OK = [/http:\/\/www\.w3\.org\/(?:2000\/svg|1999\/xlink)/, /https?:\/\/github\.com\/mrdoob/];
const FORBIDDEN = [
  /McRae/i, /\bColin\b/, /\bSubaru\b/i, /\bMitsubishi\b/i, /\bToyota\b/i, /\bCitro[eë]n\b/i, /\bPeugeot\b/i, /\bSk?oda\b/i, /\bHyundai\b/i, /\bLancia\b/i,
  /\bAudi\b/i, /\bMazda\b/i, /\bNissan\b/i, /\bHonda\b/i, /\bVolkswagen\b/i, /\bRenault\b/i, /\bDatsun\b/i, /\bImpreza\b/i, /\bLancer\b/i,
  /\bFord (?:Fiesta|Focus|Escort|Mustang|Motor|Racing)/i, /\bSega\b/i, /\bPorsche\b/i, /\bBMW\b/i, /\bMini Cooper\b/i, /\bTrackmania\b/i, /\bRed Bull\b/i, /\bMonster Energy\b/i, /\bCastrol\b/i, /\bMichelin\b/i, /\bPirelli\b/i,
];
const SELF = "tests/validate-static.mjs";
for (const p of files) {
  const r = rel(p);
  if (!TEXT_EXT.has(extname(p).toLowerCase())) continue;
  if (isVendor(p) || r === SELF || r === "CONTRACTS.md" || r.startsWith("tools/") || r.startsWith("tests/dynamics-")) continue;
  const src = readFileSync(p, "utf8");
  let t = src;
  for (const ok of URL_OK) t = t.replace(new RegExp(ok.source, "g"), "");
  if (!r.startsWith("tests/") && /https?:\/\//i.test(t.replace(/\/\/[^\n]*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, ""))) bad(`${r}: external URL in shipped code`);
  if (/@import\s+url\(\s*['"]?https?:/i.test(src)) bad(`${r}: remote CSS import`);
  for (const re of FORBIDDEN) if (re.test(src)) bad(`${r}: forbidden term ${re}`);
  if (!r.startsWith("tests/") && !r.startsWith("tools/") && /\.(mjs|js)$/.test(p)) {
    const code = src.replace(/\/\/[^\n]*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const m = code.match(/\bconsole\.(log|debug|info|warn|trace|dir|table|time)\b/);
    if (m) bad(`${r}: console.${m[1]} left in shipped code`);
  }
}

// ---------------------------------------------------------------- assets and budgets
const KB = 1024, MB = 1024 * 1024;
let assetsTotal = 0, uiTotal = 0;
for (const p of files) {
  const r = rel(p);
  const size = statSync(p).size;
  if (r.startsWith("assets/")) {
    assetsTotal += size;
    if (r.startsWith("assets/ui/")) uiTotal += size;
    if (/\.(png|jpe?g|webp|avif)$/i.test(r) && size > 600 * KB) bad(`${r}: texture ${(size / KB) | 0} KB exceeds 600 KB`);
    if (r.startsWith("assets/ui/") && size > 350 * KB) bad(`${r}: UI image ${(size / KB) | 0} KB exceeds 350 KB`);
    if (!/\.(png|jpe?g|webp|avif|svg|json|txt|md|bin|woff2)$/i.test(r)) bad(`${r}: unexpected asset type`);
  }
  if (/\.(mjs|js|css|html)$/.test(r) && !isVendor(p) && size > 600 * KB) bad(`${r}: code file ${(size / KB) | 0} KB looks too large`);
}
if (assetsTotal > 28 * MB) bad(`assets total ${(assetsTotal / MB).toFixed(1)} MB exceeds 28 MB`);
if (uiTotal > 3 * MB) bad(`assets/ui total ${(uiTotal / MB).toFixed(1)} MB exceeds 3 MB`);
notes.push(`assets: ${(assetsTotal / MB).toFixed(2)} MB total, ${(uiTotal / MB).toFixed(2)} MB UI art`);

for (const id of ["waitomo", "whakarewarewa", "coromandel", "otago", "remarkables", "fiordland"]) if (!existsSync(join(ROOT, `assets/ui/card-${id}.webp`))) bad(`assets/ui/card-${id}.webp missing`);
for (const n of ["keyart", "loading"]) if (!existsSync(join(ROOT, `assets/ui/${n}.webp`))) bad(`assets/ui/${n}.webp missing`);

// CSS url() references
for (const p of files.filter((f) => f.endsWith(".css"))) {
  const css = readFileSync(p, "utf8");
  for (const m of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
    const u = m[1];
    if (u.startsWith("data:") || u.startsWith("#")) continue;
    if (/^(?:https?:)?\/\//i.test(u)) bad(`${rel(p)}: external url(${u})`);
    else if (!existsSync(resolve(dirname(p), u))) bad(`${rel(p)}: url(${u}) does not exist`);
  }
}
// UI modules referencing ./assets/ui/<name>.webp literally
for (const p of jsFiles.filter((f) => rel(f).startsWith("ui/") || rel(f) === "game.mjs")) {
  for (const m of readFileSync(p, "utf8").matchAll(/assets\/ui\/([\w-]+\.(?:webp|png|jpg|svg))/g)) if (!existsSync(join(ROOT, "assets/ui", m[1]))) bad(`${rel(p)}: references missing assets/ui/${m[1]}`);
}

// ---------------------------------------------------------------- licences and package
const lic = join(ROOT, "vendor/THREE-LICENSE.txt");
if (!existsSync(lic)) bad("vendor/THREE-LICENSE.txt missing");
else if (!/MIT|Permission is hereby granted/i.test(readFileSync(lic, "utf8"))) bad("vendor/THREE-LICENSE.txt does not look like the MIT licence");
for (const f of ["three.module.min.js", "three-addons.min.js"]) if (!existsSync(join(ROOT, "vendor", f))) bad(`vendor/${f} missing`);
try {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  if (pkg.type !== "module") bad('package.json: "type" must be "module"');
  for (const s of ["test", "validate", "browser", "shoot"]) if (!pkg.scripts || !pkg.scripts[s]) bad(`package.json: script "${s}" missing`);
} catch (e) { bad("package.json unreadable: " + e.message); }
const cr = readFileSync(join(ROOT, "ui/screens.mjs"), "utf8");
if (!/Three\.js/.test(cr) || !/MIT/.test(cr)) bad("credits screen must name Three.js and its MIT licence");

// ---------------------------------------------------------------- report
for (const n of notes) console.log("  " + n);
if (problems.length) {
  console.error(`validate-static: ${problems.length} problem(s)`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log("validate-static: ok");
