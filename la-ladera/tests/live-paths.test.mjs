// GitHub Pages serves from a case-sensitive Linux file system; this machine is Windows, which accepts a path in ANY case. An import such as
// './Core/mesh.js' or a texture 'Brick.jpg' therefore works here, passes every test and the whole page 404s live. This test checks, with exact
// case against the directory listings, every path the SOURCE names: module imports (static and literal dynamic), import-map targets, index.html
// references, CSS url()s, literal asset paths in the code, and every file the asset manifests name. tests/live-paths.mjs does the same for what the
// running page really requests (dynamic strings, GLB-internal textures).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');      // .../la-ladera
const REPO = resolve(ROOT, '..');

/** True when every segment of the path below the repo root equals a directory entry exactly (a case-insensitive file system would say yes to any case). */
export function exactCase(abs) {
  let dir = REPO;
  for (const part of relative(REPO, abs).split(sep)) {
    if (!part || part === '..') return false;
    let names; try { names = readdirSync(dir); } catch { return false; }
    if (!names.includes(part)) return false;
    dir = join(dir, part);
  }
  return true;
}
const isFile = (abs) => { try { return statSync(abs).isFile(); } catch { return false; } };
const isDir = (abs) => { try { return statSync(abs).isDirectory(); } catch { return false; } };
const walk = (dir, exts, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out); else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
};

const IMPORT_RE = /\b(?:import|export)\s+(?:[^'"()]*?\bfrom\s+)?['"]([^'"\n]+)['"]|\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g;
const ASSET_RE = /['"`]((?:\.{1,2}\/|)assets\/[^'"`\n$]*)['"`]/g;
const FILE_EXT = /\.(?:jpe?g|png|webp|gif|svg|glb|gltf|json|bin|mp3|ogg|wav|ktx2|woff2?|css|js|mjs)$/i;      // what counts as "a file name" (a timestamp like 15:04:35.673Z does not)
const MAP = { three: 'vendor/three/build/three.module.min.js', 'three/addons/': 'vendor/three/examples/jsm/' };    // index.html import map

/** Problems found in one JS source (a list of strings). `file` is the absolute path the text lives at. */
export function checkSource(file, text) {
  const bad = [];
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2];
    if (spec.includes('\\')) { bad.push(`backslash in import '${spec}'`); continue; }
    let abs;
    if (spec.startsWith('./') || spec.startsWith('../')) abs = join(dirname(file), spec);
    else if (spec === 'three') abs = join(ROOT, MAP.three);
    else if (spec.startsWith('three/addons/')) abs = join(ROOT, MAP['three/addons/'], spec.slice('three/addons/'.length));
    else { bad.push(`bare import '${spec}' is not in the import map`); continue; }
    if (!isFile(abs)) bad.push(`import '${spec}' does not exist`);
    else if (!exactCase(abs)) bad.push(`import '${spec}' exists only with another letter case`);
  }
  for (const m of text.matchAll(ASSET_RE)) {                                   // asset URLs resolve against the page (la-ladera/index.html), not the module
    const abs = join(ROOT, m[1].replace(/^\.\//, ''));
    const folder = m[1].endsWith('/');
    if (!folder && !FILE_EXT.test(m[1])) continue;                              // a prefix such as './assets/textures/tex' that code completes at run time
    if (folder ? !isDir(abs) : !isFile(abs)) bad.push(`asset ${folder ? 'folder ' : ''}'${m[1]}' does not exist`);
    else if (!exactCase(abs)) bad.push(`asset '${m[1]}' exists only with another letter case`);
  }
  return bad;
}

test('exactCase sees a wrong-case path that Windows would accept', () => {
  assert.equal(exactCase(join(ROOT, 'js', 'main.js')), true);
  assert.equal(exactCase(join(ROOT, 'JS', 'main.js')), false, 'a capitalised folder must not pass');
  assert.equal(exactCase(join(ROOT, 'js', 'Main.js')), false, 'a capitalised file must not pass');
  assert.equal(exactCase(join(ROOT, 'js', 'nope.js')), false);
});

test('checkSource flags a wrong-case import, a missing file, a bare specifier and a missing asset (and passes the right ones)', () => {
  const f = join(ROOT, 'js', 'people', 'x.js');
  assert.deepEqual(checkSource(f, "import { CONFIG } from '../core/config.js';\nimport * as THREE from 'three';\nexport * from './dialogue.js';\nconst m = await import('../core/mesh.js');"), []);
  assert.match(checkSource(f, "import { CONFIG } from '../Core/config.js';").join(), /another letter case/);
  assert.match(checkSource(f, "import { x } from '../core/nope.js';").join(), /does not exist/);
  assert.match(checkSource(f, "import x from 'lodash';").join(), /bare import/);
  assert.match(checkSource(f, "const u = './assets/textures/Asphalt.jpg';").join(), /(another letter case|does not exist)/);
  assert.match(checkSource(f, "const u = './assets/Textures/';").join(), /(another letter case|does not exist)/);
  assert.deepEqual(checkSource(f, "const u = './assets/textures/asphalt.jpg', d = './assets/models/';"), []);
});

test('every module import and asset path named in js/ is exact-case and exists', () => {
  const bad = [], files = walk(join(ROOT, 'js'), ['.js', '.mjs']);
  assert.ok(files.length >= 100, `scanned ${files.length} source files`);                  // not a vacuous pass: the page has 130+
  for (const file of files) for (const p of checkSource(file, readFileSync(file, 'utf8'))) bad.push(`${relative(ROOT, file)}: ${p}`);
  assert.deepEqual(bad, []);
});

test('index.html: every local reference and import-map target is exact-case and exists', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)].map((m) => m[1]);
  const map = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  if (map) refs.push(...Object.values(JSON.parse(map[1]).imports));
  const bad = [];
  for (const r of refs) {
    if (/^(https?:|data:|mailto:|#|\/)/.test(r)) continue;
    const abs = join(ROOT, r.split(/[?#]/)[0]);
    if (!isFile(abs) && !isDir(abs)) bad.push(`${r} does not exist`); else if (!exactCase(abs)) bad.push(`${r} exists only with another letter case`);
  }
  assert.ok(refs.length >= 4, 'found the stylesheet, the script and the import map');
  assert.deepEqual(bad, []);
});

test('css: every url() is exact-case and exists', () => {
  const bad = [];
  for (const file of walk(join(ROOT, 'css'), ['.css'])) {
    for (const m of readFileSync(file, 'utf8').matchAll(/url\(\s*['"]?([^)'"]+?)['"]?\s*\)/g)) {
      if (/^(data:|https?:|#)/.test(m[1])) continue;
      const abs = join(dirname(file), m[1].split(/[?#]/)[0]);
      if (!isFile(abs)) bad.push(`${relative(ROOT, file)}: ${m[1]} does not exist`); else if (!exactCase(abs)) bad.push(`${relative(ROOT, file)}: ${m[1]} exists only with another letter case`);
    }
  }
  assert.deepEqual(bad, []);
});

test('every file the asset manifests name is exact-case and exists', () => {
  const bad = []; let n = 0;
  const leaves = (v, dir, out) => {                                            // string leaves with a file extension; an object's `dir` prefixes its siblings
    if (typeof v === 'string') { if (FILE_EXT.test(v)) out.push(join(dir, v)); return; }
    if (Array.isArray(v)) { for (const x of v) leaves(x, dir, out); return; }
    if (v && typeof v === 'object') { const d = typeof v.dir === 'string' ? join(dir, v.dir) : dir; for (const [k, x] of Object.entries(v)) if (k !== 'dir') leaves(x, d, out); }
  };
  for (const file of walk(join(ROOT, 'assets'), ['.json'])) {
    if (!/manifest/.test(file)) continue;
    const out = []; leaves(JSON.parse(readFileSync(file, 'utf8')), dirname(file), out);
    for (const abs of out) { n++; if (!isFile(abs)) bad.push(`${relative(ROOT, file)}: ${relative(ROOT, abs)} does not exist`); else if (!exactCase(abs)) bad.push(`${relative(ROOT, file)}: ${relative(ROOT, abs)} exists only with another letter case`); }
  }
  assert.ok(n >= 30, `checked ${n} manifest files`);
  assert.deepEqual(bad, []);
});
