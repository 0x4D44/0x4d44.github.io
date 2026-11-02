// INTERIORS models: the hero furniture GLBs (assets/models/heroes/*.glb, manifest.heroes.json; they override the library's keys) are held to the catalogue they
// replace the stand-ins of: the manifest names real catalogue keys, every model sits inside its catalogue box on y = 0, uses library materials only
// (no textures), carries a valid flag grammar and a bounded cost, and a building built from them draws every modelled key from its GLB.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-catalog.test.mjs
//   A3_MODELS=<dir>    test another models folder (default la-ladera/assets/models)         A3_N=42  buildings in the Node build
//   A3_SABOTAGE=<box|material|texture|flags|heavy|big|fewer|fallback|variants|blanket|magnets|tint>  corrupt the data on purpose so the matching test must FAIL
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe } from '../tools/blender/glb_info.mjs';
import { CATALOG } from '../js/interiors/catalog.js';
import { layoutOf } from '../js/interiors/carcass.js';
import { ALL_DEFS } from '../js/core/matlib.js';
import { furnishedBatch } from './interiors-lib.mjs';
import { buildInterior, loadInteriorAssets } from '../js/interiors/build.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = process.env.A3_MODELS ? resolve(process.env.A3_MODELS) : join(ROOT, 'assets', 'models');
const SAB = process.env.A3_SABOTAGE;
const N = +(process.env.A3_N || 42);
// keep in step with tools/blender/furn_lib.py
const TOP_ALLOW = 0.25, MAX_TRIS = 2500, MAX_BYTES = 10 * 1024 * 1024, MAX_MATS = 10;
const MIN_KEYS = 25;                                                       // the lead's order: the ~25 most visible keys are Blender models
const MIN_FILL = 0.5;                                                      // a model spans at least this much of the catalogue box (a model at the wrong scale shows up here)
const NO_FILL = new Set(['fan_ceiling']);                                  // the rotor is drawn by interiors/anim.js: the model is the motor housing only
const HEROES = ['sofa_3_vinyl', 'sofa_3_fabric', 'armchair_fabric', 'bed_single', 'bed_double', 'fridge', 'stove_gas', 'tv_flat', 'tv_crt', 'chair_plastic', 'chair_wood',
  'table_formica_4', 'wardrobe_2', 'shop_counter_glass', 'pharmacy_counter', 'bookshelf', 'fan_ceiling', 'lamp_floor', 'toilet', 'basin_pedestal'];
const report = (problems, what, lim = +(process.env.A3_LIST || 12)) => assert.equal(problems.length, 0, `${problems.length} ${what}:\n  ` + problems.slice(0, lim).join('\n  '));

// ---------------------------------------------------------------- what the manifest and the GLB files say
const manifest = JSON.parse(readFileSync(join(MODELS, 'manifest.heroes.json'), 'utf8'));
const files = (manifest.files ?? []).map((f) => ({ ...f, info: describe(join(MODELS, f.glb)) }));
if (SAB === 'box') { const a = files[0].info.assets.get('sofa_3_fabric') ?? files[0].info.assets.values().next().value; a.min[1] += 0.6; a.max[1] += 0.6; }
if (SAB === 'material') files[0].info.assets.values().next().value.parts[0].material = 'no_such_material';
if (SAB === 'texture') files[0].info.images = 1;
if (SAB === 'flags') files[0].info.assets.values().next().value.parts[0].name += '-bogus-0';
if (SAB === 'heavy') for (const p of files[0].info.assets.values().next().value.parts) p.tris *= 40;
if (SAB === 'big') files[0].info.bytes += MAX_BYTES;
if (SAB === 'fewer') for (const k of Object.keys(files[0].assets).slice(4)) delete files[0].assets[k];
const entries = files.flatMap((f) => Object.entries(f.assets ?? {}).map(([key, meta]) => ({ key, meta, file: f, asset: f.info.assets.get(meta.node ?? key), cat: CATALOG[key] })));

/** Triangles of the heaviest single drawing of an asset: one made OR unmade state and ONE alternative per p<letter> channel (what build.js draws). */
function drawnTris(parts, key) {
  const flagsOf = (p) => p.name.split('-').slice(1, -1), chans = {};
  for (const p of parts) for (const f of flagsOf(p)) { const m = /^p([a-z])(\d+)$/.exec(f); if (m) (chans[m[1]] ??= new Set()).add(+m[2]); }
  const letters = Object.keys(chans), picks = letters.reduce((acc, l) => acc.flatMap((a) => [...chans[l]].map((k) => ({ ...a, [l]: k }))), [{}]);
  let best = 0;
  for (const state of ['made', 'unmade']) for (const pick of picks) {
    let n = 0;
    for (const p of parts) {
      const fl = flagsOf(p), m = fl.map((f) => /^p([a-z])(\d+)$/.exec(f)).find(Boolean);
      if (fl.includes('made') && state !== 'made') continue;
      if (fl.includes('unmade') && state !== 'unmade') continue;
      if (m && pick[m[1]] !== +m[2]) continue;
      n += p.tris;
    }
    best = Math.max(best, n);
  }
  return best;
}

test('the furniture manifest names catalogue keys, existing GLB files (exact case) and matching nodes', () => {
  const problems = [];
  for (const f of files) {
    const path = join(MODELS, f.glb), dir = dirname(path);
    if (!existsSync(path) || !readdirSync(dir).includes(basename(path))) problems.push(`${f.glb}: no such file (case counts on GitHub Pages)`);
    const named = new Set(Object.values(f.assets ?? {}).map((m) => m.node));
    for (const k of f.info.assets.keys()) if (!named.has(k)) problems.push(`${f.glb}: model '${k}' is in the file but not in the manifest`);
  }
  for (const { key, meta, file, asset, cat } of entries) {
    if (!cat) { problems.push(`${key}: not a catalogue key`); continue; }
    if ((meta.node ?? key) !== key) problems.push(`${key}: node '${meta.node}' is not named after the catalogue key`);
    if (!asset) { problems.push(`${key}: node '${meta.node ?? key}' is not in ${file.glb}`); continue; }
    if (JSON.stringify(meta.footprint) !== JSON.stringify(cat.footprint)) problems.push(`${key}: manifest footprint ${JSON.stringify(meta.footprint)} is not the catalogue's ${JSON.stringify(cat.footprint)}`);
    if (JSON.stringify(meta.tags) !== JSON.stringify(cat.tags)) problems.push(`${key}: manifest tags ${JSON.stringify(meta.tags)} are not the catalogue's ${JSON.stringify(cat.tags)}`);
  }
  report(problems, 'manifest problems');
});

test('every model sits on y = 0 inside its catalogue box and fills it', () => {
  const problems = [];
  for (const { key, asset, cat } of entries) {
    if (!asset || !cat) continue;
    const [W, H0, D] = cat.size, H = Math.max(H0, cat.head ?? 0), lo = asset.min, hi = asset.max, bad = [];
    if (!(lo[1] >= -0.02 && hi[1] <= H + TOP_ALLOW)) bad.push(`y ${lo[1].toFixed(2)}..${hi[1].toFixed(2)} vs 0..${H.toFixed(2)} (+${TOP_ALLOW} for what stands on top)`);
    if (!(lo[0] >= -W / 2 - 0.1 && hi[0] <= W / 2 + 0.1)) bad.push(`x ${lo[0].toFixed(2)}..${hi[0].toFixed(2)} vs +-${(W / 2).toFixed(2)}`);
    if (!(lo[2] >= -D / 2 - 0.12 && hi[2] <= D / 2 + 0.12)) bad.push(`z ${lo[2].toFixed(2)}..${hi[2].toFixed(2)} vs +-${(D / 2).toFixed(2)}`);
    if (!NO_FILL.has(key)) {
      const fx = asset.size[0] / W, fy = (hi[1] - Math.max(lo[1], 0)) / H0, fz = asset.size[2] / D;
      if (fx < MIN_FILL) bad.push(`only ${(fx * 100).toFixed(0)}% of the catalogue width`);
      if (fy < MIN_FILL) bad.push(`only ${(fy * 100).toFixed(0)}% of the catalogue height`);
      if (fz < MIN_FILL * 0.5) bad.push(`only ${(fz * 100).toFixed(0)}% of the catalogue depth`);
    }
    if (bad.length) problems.push(`${key} [${cat.arch}]: ${bad.join('; ')}`);
  }
  report(problems, 'models outside / not filling their catalogue box');
});

test('models are plain: library materials, no textures, flags in the grammar, bounded cost', () => {
  const problems = [];
  let bytes = 0;
  for (const f of files) {
    bytes += f.info.bytes;
    if (f.info.images || f.info.textures) problems.push(`${f.glb}: ${f.info.images} images / ${f.info.textures} textures (materials come from the library, nothing is embedded)`);
    for (const x of f.info.extensions) if (/draco|meshopt|basisu|ktx/i.test(x)) problems.push(`${f.glb}: uses ${x}, which the page's GLTFLoader has no decoder for`);
  }
  if (bytes > MAX_BYTES) problems.push(`the GLBs weigh ${(bytes / 1048576).toFixed(1)} MB (limit ${MAX_BYTES / 1048576})`);
  let worst = { tris: 0 };
  for (const { key, asset, cat } of entries) {
    if (!asset) continue;
    const grammar = new RegExp(`^${key}(-tint)?(-(made|unmade|magnets|p[a-z]\\d+))*-\\d+$`);
    const chans = {}, mats = new Set();
    let made = 0, unmade = 0;
    for (const p of asset.parts) {
      if (!grammar.test(p.name)) problems.push(`${key}: part '${p.name}' is not <key>[-tint][-made|-unmade|-magnets|-p<a-z><k>]-<n>`);
      const base = String(p.material);
      if (!ALL_DEFS[base] || base === 'missing_asset') problems.push(`${key}: part '${p.name}' uses material '${p.material}', which is not in the library`);
      if (!p.normal || !p.uv) problems.push(`${key}: part '${p.name}' lacks ${!p.normal ? 'normals' : 'UVs'}`);
      mats.add(base);
      const fl = p.name.split('-').slice(1, -1);
      if (fl.includes('made')) made++;
      if (fl.includes('unmade')) unmade++;
      for (const t of fl) { const m = /^p([a-z])(\d+)$/.exec(t); if (m) (chans[m[1]] ??= new Set()).add(+m[2]); }
    }
    for (const [ch, ks] of Object.entries(chans)) if (ks.size < 2 || Math.max(...ks) !== ks.size - 1) problems.push(`${key}: channel '${ch}' has alternatives {${[...ks].sort()}} (need 0..n-1, n >= 2)`);
    if (!!made !== !!unmade) problems.push(`${key}: has ${made} 'made' and ${unmade} 'unmade' parts (a bed is drawn made OR unmade, so it needs both)`);
    if (cat?.arch === 'bed' && !made) problems.push(`${key}: a bed needs made and unmade bedding`);
    if (mats.size > MAX_MATS) problems.push(`${key}: ${mats.size} materials (limit ${MAX_MATS})`);
    const drawn = drawnTris(asset.parts, key);
    if (drawn > MAX_TRIS) problems.push(`${key}: ${drawn} triangles in one drawing (limit ${MAX_TRIS})`);
    if (drawn > worst.tris) worst = { key, tris: drawn };
  }
  console.log(`# models: ${entries.length} assets in ${files.length} files, ${(bytes / 1024).toFixed(0)} KB; heaviest drawing ${worst.key} ${worst.tris} triangles`);
  report(problems, 'model problems');
});

test('the heroes are modelled: the ~25 most visible catalogue keys, one of each kind of furniture a person looks at', () => {
  const have = new Set(entries.map((e) => e.key)), arch = new Set(entries.map((e) => e.cat?.arch));
  assert.ok(have.size >= MIN_KEYS, `${have.size} modelled keys (need >= ${MIN_KEYS})`);
  report(HEROES.filter((k) => !have.has(k)), 'hero keys without a model');
  report(['sofa', 'armchair', 'chair', 'table', 'bed', 'dresser', 'cabinet', 'tv', 'tvcrt', 'lamp', 'fanc', 'stove', 'fridge', 'counter', 'sinkunit', 'toilet', 'basin', 'shelf'].filter((a) => !arch.has(a)), 'archetypes without a model');
});

// ---------------------------------------------------------------- a building built from the models (Node, no browser)
const { ctx, bps } = await furnishedBatch({ n: N });
const gltfs = new GLTFLoader();
ctx.assets.entries.clear();
await ctx.assets.init((p) => (p === 'manifest.json' ? { files: ['manifest.furniture.json', 'manifest.heroes.json'] } : JSON.parse(readFileSync(join(MODELS, p), 'utf8'))));
ctx.assets.load = (path) => new Promise((ok, no) => {                       // what Assets.load does in the page, minus fetch
  const b = readFileSync(join(MODELS, path));
  gltfs.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', (g) => { g.scene.updateMatrixWorld(true); ctx.assets.loaded.set(path, g); ok(g); }, no);
});
await loadInteriorAssets(ctx);
const stub = new Map();
ctx.mat = (key) => { let m = stub.get(key); if (!m) stub.set(key, m = { name: key, isMaterial: true, userData: {}, dispose() {} }); return m; };
if (SAB === 'fallback') { const n = ctx.assets.loaded.get(ctx.assets.meta('sofa_3_fabric').glb).scene.getObjectByName('sofa_3_fabric'); n.parent.remove(n); }
const STRIP = { variants: /-unmade|-made/g, blanket: /-pb\d+/g, magnets: /-magnets/g, tint: /-tint/g };     // sabotage: a model loses a flag, so build.js can no longer pick / hide / tint that part
if (STRIP[SAB]) ctx.assets.loaded.forEach((g) => g.scene.traverse((o) => { if (o.isMesh) o.name = o.name.replace(STRIP[SAB], ''); }));
const modelled = new Set(ctx.assets.entries.keys());                              // the library's keys and the heroes'
const meshesOf = (id) => ctx.batch.groups.get(id)?.meshes ?? [];
const trisOf = (id) => meshesOf(id).reduce((n, m) => n + m.geometry.index.count / 3, 0);
const colourSum = (id) => meshesOf(id).reduce((n, m) => n + m.geometry.attributes.color.array.reduce((a, b) => a + b, 0), 0);
let seq = 0;
/** Build ONE record alone in a bare copy of a real building; returns its group id. */
const probe = (rec) => {
  const host = bps[0], bp = { id: `probe${seq++}`, lot: host.lot, frame: host.frame, rooms: [], windows: [], furniture: [{ id: 'p', room: 'r', kind: 'floor', x: 0, z: 0, y: 0, ry: 0, tint: null, ...rec }], interior: null };
  buildInterior(ctx, bp);
  return `${bp.id}.int`;
};

test('the models load the way the page loads them: every manifest key ends up in ctx.interiorGlb', () => {
  report(entries.map((e) => e.key).filter((k) => !ctx.interiorGlb.has(k)), 'manifest keys that did not load');
  report((ctx.errors ?? []).filter((e) => e.stage === 'interiors' && !/^atlas/.test(e.message)).map((e) => e.message), 'interiors load errors');
});

test('a building built from the models: every modelled record is drawn from its GLB, library materials, bounded draw calls, inside the rooms', () => {
  const problems = [];
  let recs = 0, glb = 0, blockers = 0, blockersGlb = 0, blockersCrafted = 0, meshes = [], tris = [];
  for (const bp of bps) {
    buildInterior(ctx, bp);
    const id = `${bp.id}.int`, g = meshesOf(id), st = bp.interior.stats;
    const fromGlb = (r) => modelled.has(r.name) && !layoutOf(CATALOG[r.name]);           // a piece that OPENS (carcass.js layout) is drawn as a hollow carcass with real fronts until its hero has movable parts
    const want = bp.furniture.filter(fromGlb).length;
    if (st.glb !== want) problems.push(`${bp.id}: ${want} modelled records but ${st.glb} drawn from a GLB (${bp.furniture.filter(fromGlb).map((r) => r.name).filter((n, i, a) => a.indexOf(n) === i).slice(0, 6)})`);
    if (st.failed) problems.push(`${bp.id}: ${st.failed} records failed to draw`);
    recs += bp.furniture.length; glb += st.glb;
    for (const r of bp.furniture) if (r.block) { blockers++; if (fromGlb(r)) blockersGlb++; if (modelled.has(r.name) || layoutOf(CATALOG[r.name])) blockersCrafted++; }
    const rooms = bp.rooms, x0 = Math.min(...rooms.map((r) => r.rect.x0)) - 0.6, x1 = Math.max(...rooms.map((r) => r.rect.x1)) + 0.6;
    const z0 = Math.min(...rooms.map((r) => r.rect.z0)) - 0.6, z1 = Math.max(...rooms.map((r) => r.rect.z1)) + 0.6;
    const y0 = Math.min(...rooms.map((r) => r.y ?? 0)) - 0.05, y1 = Math.max(...rooms.map((r) => (r.y ?? 0) + (r.h ?? 2.7))) + 0.2;
    let t = 0, bad = 0;
    for (const m of g) {
      const key = m.userData.matKey, base = key.split('#')[0];
      if (!ALL_DEFS[base] || base === 'missing_asset') problems.push(`${bp.id}: unknown material '${key}'`);
      const p = m.geometry.attributes.position.array;
      t += m.geometry.index.count / 3;
      for (let i = 0; i < p.length; i += 3) {
        const [lx, ly, lz] = bp.frame.toLocal(p[i], p[i + 1], p[i + 2]);
        if (!Number.isFinite(lx + ly + lz) || lx < x0 || lx > x1 || lz < z0 || lz > z1 || ly < y0 || ly > y1) { if (bad++ < 1) problems.push(`${bp.id}: ${key} vertex (${lx.toFixed(2)}, ${ly.toFixed(2)}, ${lz.toFixed(2)}) outside the building rooms`); }
      }
    }
    if (g.length > 36) problems.push(`${bp.id}: ${g.length} materials (limit 36)`);   // 34 before the 177-piece library: its pieces add a few more materials to the busiest interiors
    // the TVs of a building share its screen glow (build.js alternativeSeed): a flat and a tube one at most, not one pair of materials per set (T16 drew four and was the 37th mesh)
    for (const [what, re] of [['flat', /^tv_screen_[ab]$/], ['tube', /^tv_screen_crt_[ab]$/]]) {
      const glows = [...new Set(g.map((m) => m.userData.matKey.split('#')[0]).filter((k) => re.test(k)))];
      if (glows.length > 1) problems.push(`${bp.id}: ${glows.length} ${what} screen glows (${glows}); the TVs of a building share one`);
    }
    if (t > 100000) problems.push(`${bp.id}: ${t} triangles in one interior (limit 100000)`);   // 90000 before the library; the page gate is tests/metrics.mjs (2.5 M triangles, 1800 calls)
    meshes.push(g.length); tris.push(t);
  }
  const s = (a) => [...a].sort((x, y) => x - y);
  console.log(`# built from models: ${bps.length} buildings, ${recs} records, ${glb} from a GLB (${(100 * glb / recs).toFixed(0)}%), of the ${blockers} pieces that stand on the floor ${blockersGlb} (${(100 * blockersGlb / blockers).toFixed(0)}%), ${blockersCrafted} (${(100 * blockersCrafted / blockers).toFixed(0)}%) from a GLB or a hollow openable carcass; meshes/building median ${s(meshes)[meshes.length >> 1]} max ${s(meshes).at(-1)}; triangles median ${s(tris)[tris.length >> 1]} max ${s(tris).at(-1)}`);
  report(problems, 'interior problems');
  report((ctx.errors ?? []).filter((e) => e.stage === 'interiors' && !/^atlas/.test(e.message)).map((e) => `${e.name}: ${e.message}`), 'interior build errors');
  assert.ok(blockersCrafted / blockers >= 0.35, `only ${(100 * blockersCrafted / blockers).toFixed(0)}% of the floor furniture is drawn from a model or a hollow carcass (the models should cover what is seen most)`);
});

test('variants: a made and an unmade bed, the blanket alternatives, fridge magnets and the record tint change what is drawn', () => {
  const bed = { name: 'bed_double', w: 1.4, d: 1.9, h: 1, tint: 0xd9a0a8 };
  const made = probe({ ...bed, flags: {} }), unmade = probe({ ...bed, flags: { unmade: true } });
  assert.ok(trisOf(made) > 0 && trisOf(unmade) > 0, 'a bed drew nothing');
  assert.notEqual(trisOf(made), trisOf(unmade), 'a made and an unmade bed are the same drawing');
  const sets = new Set();
  for (let i = 0; i < 24; i++) sets.add(meshesOf(probe({ ...bed, id: `bed${i}`, flags: {} })).map((m) => m.userData.matKey).sort().join());
  assert.ok(sets.size >= 2, `24 beds, ${sets.size} blanket material sets: the blanket alternatives are never picked`);
  const fr = { name: 'fridge', w: 0.65, d: 0.68, h: 1.7 };
  assert.ok(trisOf(probe({ ...fr, flags: { magnets: true } })) > trisOf(probe({ ...fr, flags: {} })), 'fridge magnets add nothing');
  const sofa = { name: 'sofa_3_fabric', w: 1.9, d: 0.92, h: 0.85 };
  assert.notEqual(colourSum(probe({ ...sofa, tint: 0x9a8a72 })), colourSum(probe({ ...sofa, tint: 0x5a6a8a })), 'the record tint does not reach the model');
});
