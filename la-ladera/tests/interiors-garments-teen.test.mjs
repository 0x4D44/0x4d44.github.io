// The teen garment library at run time: the generated data module against the independent teen contract in tools/blender/garments_validate.mjs, the catalogue and asset
// registration, one GLB request for all 162 keys, the tint rule, recovery from a missing or wrong file, the generator's refusals, and the drawer / wardrobe / locker recipes in
// dev/garments/teen-assortments.json. The adult and child libraries (and the whole furnished world) are held by interiors-garments.test.mjs.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-garments-teen.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { newCtx } from './interiors-lib.mjs';
import { CATALOG } from '../js/interiors/catalog.js';
import { GARMENTS, VARIANTS, STATES, GARMENT_FILES } from '../js/interiors/garments_data.js';
import { GARMENT_KEYS, lodFile, registerGarmentAssets } from '../js/interiors/garments.js';
import { buildInterior, loadGarmentAssets, glbParts } from '../js/interiors/build.js';
import { garmentsDataModule } from '../tools/garments_data.mjs';
import { REQUIRED_TEEN_GARMENTS, TEEN_DIMENSIONS, TEEN_SIZE_CLASSES, requiredTeenKeys } from '../tools/blender/garments_validate.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = join(ROOT, 'assets', 'models');
const TEEN_GLB = 'garments/garments_teen.glb';
const readJSON = (...p) => JSON.parse(readFileSync(join(...p), 'utf8'));
const report = (problems, what, lim = +(process.env.A3_LIST || 12)) => assert.equal(problems.length, 0, `${problems.length} ${what}:\n  ` + problems.slice(0, lim).join('\n  '));
const sizeOf = (style, size) => `${style}_${size}`;
const SIZES = Object.keys(TEEN_SIZE_CLASSES);                                                    // small, big
const teenKeys = GARMENT_KEYS.filter((k) => CATALOG[k].sizeTag === 'teen');
const otherKeys = GARMENT_KEYS.filter((k) => CATALOG[k].sizeTag !== 'teen');

// ---------------------------------------------------------------- the data module, against the contract the validator keeps apart from every manifest
test('data module: 29 styles in two sizes, 162 states, each size a design of its own, exactly what the independent teen contract requires', () => {
  const problems = [];
  assert.equal(readFileSync(join(ROOT, 'js', 'interiors', 'garments_data.js'), 'utf8').replace(/\r\n/g, '\n'), garmentsDataModule(MODELS), 'js/interiors/garments_data.js is out of date: run `node la-ladera/tools/garments_data.mjs > la-ladera/js/interiors/garments_data.js`');
  assert.deepEqual([...teenKeys].sort(), [...requiredTeenKeys()].sort(), 'the data module\'s teen keys are not the validator\'s own garment/size/state list');
  assert.equal(teenKeys.length, 162);
  assert.deepEqual(Object.fromEntries(STATES.map((s) => [s, teenKeys.filter((k) => CATALOG[k].state === s).length])), { flat: 58, folded: 52, hung: 52 });
  assert.equal(REQUIRED_TEEN_GARMENTS.length, 29);
  for (const style of REQUIRED_TEEN_GARMENTS) for (const size of SIZES) {
    const id = sizeOf(style, size), g = GARMENTS[id];
    if (!g) { problems.push(`${id}: no design`); continue; }
    if (g.sizeTag !== 'teen' || g.sizeClass !== size) problems.push(`${id}: size tag ${g.sizeTag}, size class ${g.sizeClass}`);
    if (STATES.filter((s) => g[s]).sort().join() !== [...TEEN_DIMENSIONS[style].states].sort().join()) problems.push(`${id}: states ${STATES.filter((s) => g[s])}, the contract says ${TEEN_DIMENSIONS[style].states}`);
    if (!g.v.length || g.v.some((v) => !(v in VARIANTS))) problems.push(`${id}: variants ${g.v}`);
  }
  assert.equal(Object.keys(GARMENTS).filter((id) => GARMENTS[id].sizeTag === 'teen').length, 58, 'a teen design the contract does not know');
  report(problems, 'teen designs that differ from the contract');
});

test('data module: a big teen garment is the small one at 9/7 (the shared meshes behind the 0.7 and 0.9 nodes), in every state', () => {
  const problems = [];
  for (const style of REQUIRED_TEEN_GARMENTS) for (const s of TEEN_DIMENSIONS[style].states) {
    const small = GARMENTS[sizeOf(style, 'small')][s], big = GARMENTS[sizeOf(style, 'big')][s];
    for (let i = 0; i < 3; i++) if (Math.abs(big[i] - small[i] * 9 / 7) > 0.003 + 0.01 * big[i]) problems.push(`${style}/${s}: axis ${i} is ${small[i]} small and ${big[i]} big (expected ${(small[i] * 9 / 7).toFixed(3)})`);
    if (big[3] !== small[3]) problems.push(`${style}/${s}: ${small[3]} LOD triangles small, ${big[3]} big (one shared mesh)`);
  }
  report(problems, 'size classes that are not one pattern at two scales');
});

test('data module: the teen palette is its own table of 16 colours and no id is shared with the adult one', () => {
  const adult = readJSON(MODELS, 'garments', 'palette.json').variants, teen = readJSON(MODELS, 'garments', 'teen', 'palette.json').variants;
  assert.equal(Object.keys(teen).length, 16);
  assert.deepEqual(Object.keys(teen).filter((id) => id in adult), [], 'a palette id both libraries use would have to mean one colour');
  for (const [id, v] of Object.entries(teen)) assert.equal(VARIANTS[id], parseInt(v.color.slice(1), 16), `${id}: the tint is not the palette's colour`);
  for (const [id, v] of Object.entries(adult)) assert.equal(VARIANTS[id], parseInt(v.color.slice(1), 16), `${id}: an adult colour changed`);
  assert.equal(Object.keys(VARIANTS).length, Object.keys(adult).length + Object.keys(teen).length);
});

// ---------------------------------------------------------------- the catalogue and the registration
test('catalogue and registration: a teen key carries its size class and points at the one teen GLB; the adult and child keys keep their own files and carry no size class', () => {
  const problems = [], entries = new Map(), ctx = { assets: { entries } };
  assert.equal(registerGarmentAssets(ctx), GARMENT_KEYS.length);
  assert.deepEqual(GARMENT_FILES.teen, { flat: TEEN_GLB, folded: TEEN_GLB, hung: TEEN_GLB });
  for (const sizeTag of ['adult', 'child']) for (const s of STATES) {
    if (GARMENT_FILES[sizeTag][s] === TEEN_GLB || GARMENT_FILES[sizeTag][s] !== lodFile(s, sizeTag)) problems.push(`${sizeTag}/${s}: ${GARMENT_FILES[sizeTag][s]}`);
  }
  for (const s of STATES) if (lodFile(s) !== GARMENT_FILES.adult[s] || lodFile(s, 'teen') !== TEEN_GLB) problems.push(`${s}: lodFile answers ${lodFile(s)} and ${lodFile(s, 'teen')}`);
  for (const key of GARMENT_KEYS) {
    const c = CATALOG[key], e = entries.get(key), teen = c.sizeTag === 'teen';
    if (teen && !(c.sizeClass === GARMENTS[c.garment].sizeClass && SIZES.includes(c.sizeClass) && c.garment.endsWith('_' + c.sizeClass))) problems.push(`${key}: catalogue size class ${c.sizeClass}`);
    if (!teen && 'sizeClass' in c) problems.push(`${key}: an ${c.sizeTag} piece gained a size class`);
    const expected = { name: key, glb: lodFile(c.state, c.sizeTag), node: key + '_lod', sizeTag: c.sizeTag, ...(teen ? { sizeClass: c.sizeClass } : {}), tags: ['garment', c.sizeTag] };
    if (JSON.stringify(e) !== JSON.stringify(expected)) problems.push(`${key}: registered as ${JSON.stringify(e)}, expected ${JSON.stringify(expected)}`);
    if (!c.tags.includes('teen') !== !teen) problems.push(`${key}: catalogue tags ${c.tags}`);
  }
  const kept = new Map([[teenKeys[0], { footprint: [1, 1], glb: 'elsewhere.glb' }]]);
  registerGarmentAssets({ assets: { entries: kept } });
  assert.equal(kept.get(teenKeys[0]).glb, TEEN_GLB, 'a manifest entry registered later is still pointed at the LOD in the teen GLB');
  assert.deepEqual(kept.get(teenKeys[0]).footprint, [1, 1], 'the rest of an existing entry is kept');
  report(problems, 'catalogue / registration problems');
});

test('the clothes are not in the root manifest: index.html prefetches every manifest it lists, and loadGarmentAssets registers the three libraries itself', () => {
  const listed = readJSON(MODELS, 'manifest.json').files;
  assert.deepEqual(listed.filter((f) => /garment/i.test(f)), [], 'a garment manifest in the root list adds a fetch to every boot and puts clothes keys in the furniture registry');
});

// ---------------------------------------------------------------- loading: the models as the page loads them
const gltfs = new GLTFLoader();
const stub = new Map();
const requested = [];
const fromDisk = (path) => readFileSync(join(MODELS, path));
/** A context that loaded the clothes the way the page does; `fetchFile(path)` is what the network says (bytes, or an error). */
async function boot(fetchFile = fromDisk) {
  const ctx = await newCtx();
  ctx.mat = (key) => { let m = stub.get(key); if (!m) stub.set(key, m = { name: key, isMaterial: true, userData: {}, dispose() {} }); return m; };
  ctx.assets.load = (path) => new Promise((ok, no) => {
    requested.push(path);
    let b; try { b = fetchFile(path); } catch (e) { return no(e); }
    gltfs.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', (g) => { g.scene.updateMatrixWorld(true); ctx.assets.loaded.set(path, g); ok(g); }, no);
  });
  requested.length = 0;
  const before = (ctx.errors ?? []).length, warn = console.warn;
  console.warn = () => {};                                                                       // (assets.preload logs each file it could not load)
  try { await loadGarmentAssets(ctx); } finally { console.warn = warn; }
  return { ctx, errors: (ctx.errors ?? []).slice(before) };
}
let seq = 0;
const trisIn = (ctx, id) => (ctx.batch.groups.get(id)?.meshes ?? []).reduce((n, m) => n + m.geometry.index.count / 3, 0);
const meanColour = (ctx, id) => {
  let r = 0, g = 0, b = 0, n = 0;
  for (const m of ctx.batch.groups.get(id)?.meshes ?? []) { const a = m.geometry.attributes.color; for (let i = 0; i < a.count; i++) { r += a.getX(i); g += a.getY(i); b += a.getZ(i); n++; } }
  return [r / n, g / n, b / n];
};
/** Build one building holding a record per key (laid out in rows; nothing here is placement) and say what the builder made of it. */
function build(ctx, keys, tint = null) {
  const id = `TEEN${seq++}`, furniture = keys.map((name, i) => {
    const c = CATALOG[name];
    return { id: `${id}.${i}`, name, kind: c.wall ? 'wall' : 'floor', x: (i % 20) * 0.8, y: c.hang ? 1.5 : 0, z: Math.floor(i / 20) * 0.9, ry: 0, w: c.size[0], d: c.size[2], h: c.size[1], tint, flags: {} };
  });
  const bp = { id, lot: { x: 0, y: 0, z: 0, rotY: 0 }, furniture, interior: {} };
  const before = (ctx.errors ?? []).length;
  buildInterior(ctx, bp);
  return { id: `${id}.int`, st: bp.interior.stats, tris: trisIn(ctx, `${id}.int`), errors: (ctx.errors ?? []).slice(before) };
}

test('loading: one request serves every teen key; each is one tint part of the data\'s triangles, at the size the data says (small and big differ only by their node scale)', async () => {
  const { ctx, errors } = await boot();
  report(errors.map((e) => e.message), 'errors while loading the models');
  assert.deepEqual(requested.filter((p) => /teen/.test(p)), [TEEN_GLB], 'the teen keys are one file: one request');
  report(GARMENT_KEYS.filter((k) => !ctx.garmentGlb.has(k)), 'garment keys that did not load');
  const problems = [], box = new Map();
  for (const key of teenKeys) {
    const c = CATALOG[key], parts = glbParts(ctx, key);
    if (parts.length !== 1) { problems.push(`${key}: ${parts.length} parts`); continue; }
    const [p] = parts;
    if (!p.tint || !p.colored || p.matKey !== 'laundry') problems.push(`${key}: tint ${p.tint}, colored ${p.colored}, material ${p.matKey}`);
    if (p.geometry.index.count / 3 !== GARMENTS[c.garment][c.state][3]) problems.push(`${key}: ${p.geometry.index.count / 3} triangles in the LOD, ${GARMENTS[c.garment][c.state][3]} in the data`);
    p.geometry.computeBoundingBox();
    const { min, max } = p.geometry.boundingBox, size = [max.x - min.x, max.y - min.y, max.z - min.z];
    box.set(key, size);
    for (let i = 0; i < 3; i++) if (Math.abs(size[i] - c.size[i]) > Math.max(0.003, 0.055 * c.size[i])) problems.push(`${key}: axis ${i} is ${size[i].toFixed(3)} m drawn, ${c.size[i]} m in the data`);
    if (c.state === 'hung' ? Math.abs(max.y) > 0.002 : Math.abs(min.y) > 0.002) problems.push(`${key}: ${c.state} model starts at y ${c.state === 'hung' ? max.y : min.y}`);
  }
  for (const style of REQUIRED_TEEN_GARMENTS) for (const s of TEEN_DIMENSIONS[style].states) {
    const small = box.get(`garment_${style}_small_${s}`), big = box.get(`garment_${style}_big_${s}`);
    if (small && big) for (let i = 0; i < 3; i++) if (Math.abs(big[i] - small[i] * 9 / 7) > 0.0005) problems.push(`${style}/${s}: drawn ${small[i].toFixed(4)} small and ${big[i].toFixed(4)} big on axis ${i}`);
  }
  report(problems, 'teen models that do not load as the data says');
});

test('drawing: all 162 teen records build from their GLB (no stand-in, no failure) into exactly the triangles the data counts', async () => {
  const { ctx } = await boot();
  const r = build(ctx, teenKeys, 0x6f8f72), want = teenKeys.reduce((n, k) => n + GARMENTS[CATALOG[k].garment][CATALOG[k].state][3], 0);
  report(r.errors.map((e) => e.message), 'errors while building');
  assert.deepEqual({ records: r.st.records, glb: r.st.glb, standin: r.st.standin, failed: r.st.failed }, { records: 162, glb: 162, standin: 0, failed: 0 });
  assert.equal(r.tris, want, 'the building holds other triangles than the LODs');
});

test('tint: a teen garment wears the record\'s colour like an adult one; with no tint it keeps its fold shading; a furniture part is tinted only by its own flag', async () => {
  const { ctx } = await boot();
  const lin = (hex) => { const c = new THREE.Color().setHex(hex); return [c.r, c.g, c.b]; };
  const ratio = (key, hex) => {
    const plain = build(ctx, [key]), worn = build(ctx, [key], hex), a = meanColour(ctx, plain.id), b = meanColour(ctx, worn.id);
    assert.equal(plain.tris, worn.tris);
    return b.map((v, i) => v / a[i]);
  };
  for (const hex of [0x43817c, 0xb85c38]) {
    const expected = lin(hex);
    for (const key of ['garment_tshirt_teal_small_flat', 'garment_dress_maxi_big_hung', 'garment_school_shoes_pair_big_flat', 'garment_cap_small_hung', 'garment_tshirt_flat']) {   // the last is an adult tee: the rule is one for every library
      const got = ratio(key, hex);
      for (let i = 0; i < 3; i++) assert.ok(Math.abs(got[i] - expected[i]) <= 0.012 + 0.05 * expected[i], `${key}: channel ${i} is ${got[i].toFixed(3)} times its shading under ${hex.toString(16)}, expected ${expected[i].toFixed(3)}`);
    }
  }
  const shade = meanColour(ctx, build(ctx, ['garment_hoodie_big_flat']).id);
  assert.ok(shade.every((v) => v > 0.3), `an untinted teen garment is drawn at its own shading (${shade.map((v) => v.toFixed(2))})`);
  // the loader's rule for a part with no flag in its name: a garment is one cloth (tint), anything else is drawn as it is
  const root = (name, ...meshes) => { const g = new THREE.Group(); g.name = name; for (const m of meshes) g.add(m); return g; };
  const mesh = (name) => {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)); geometry.setIndex([0, 1, 2]);
    const m = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); m.material.name = 'laundry'; m.name = name; return m;
  };
  const flagged = 'chair_plastic', cloth = 'garment_hoodie_big_flat', meta = ctx.assets.meta;
  ctx.assets.meta = (n) => (n === flagged || n === cloth ? { glb: 'x.glb', node: n } : meta.call(ctx.assets, n));
  ctx.assets.loaded.set('x.glb', { scene: root('scene', root(flagged, mesh('plain'), mesh(`${flagged}-tint-0`), mesh(`${flagged}-made-1`)), root(cloth, mesh('plain'), mesh(`${cloth}-made-1`))) });
  ctx.interiorGlbParts = new Map();                                                              // (parts are read once per key: forget the real ones)
  const bits = (n) => glbParts(ctx, n).map((p) => [p.tint, p.made]);
  assert.deepEqual(bits(flagged), [[false, false], [true, false], [false, true]], 'a furniture part is a tint part only when its name says so');
  assert.deepEqual(bits(cloth), [[true, false], [false, true]], 'a garment part with no flag is a tint part, one with a flag keeps it');
});

// ---------------------------------------------------------------- recovery: a missing or wrong file costs the look of the clothes it holds, nothing else
const isTeen = (k) => CATALOG[k].sizeTag === 'teen';
function standIns(ctx, keys) {
  const problems = [];
  for (const key of keys) {
    const r = build(ctx, [key], 0x4b8981), t = r.tris;
    if (r.st.failed || r.st.glb || r.st.standin !== 1 || t < 2 || t > 40 || r.errors.length) problems.push(`${key}: ${JSON.stringify(r.st && { glb: r.st.glb, standin: r.st.standin, failed: r.st.failed })}, ${t} triangles, ${r.errors.length} errors`);
  }
  return problems;
}

test('recovery: without the teen file the adult and child clothes load and every teen garment is a patch of cloth; the game still builds', async () => {
  const { ctx, errors } = await boot((path) => { if (path === TEEN_GLB) throw new Error('404 ' + path); return fromDisk(path); });
  report(errors.map((e) => e.message), 'errors while loading without the teen file (a missing model is a stand-in, not an error)');
  assert.deepEqual(requested.filter((p) => /teen/.test(p)), [TEEN_GLB]);
  assert.deepEqual(GARMENT_KEYS.filter((k) => ctx.garmentGlb.has(k)).sort(), [...otherKeys].sort(), 'exactly the adult and child keys load');
  report(standIns(ctx, teenKeys.filter((_, i) => i % 9 === 0)), 'teen stand-in problems');
  assert.equal(build(ctx, otherKeys.slice(0, 10)).st.glb, 10, 'the adult and child clothes still draw from their models');
});

test('recovery: a teen file without the teen nodes (the wrong GLB under its name) loads nothing and leaves the stand-ins', async () => {
  const { ctx, errors } = await boot((path) => (path === TEEN_GLB ? fromDisk(lodFile('flat', 'adult')) : fromDisk(path)));
  report(errors.map((e) => e.message), 'errors while loading a teen file that carries none of the teen nodes');
  assert.deepEqual(GARMENT_KEYS.filter((k) => ctx.garmentGlb.has(k)).sort(), [...otherKeys].sort(), 'a key whose node is not in its file is not a loaded model');
  report(standIns(ctx, teenKeys.filter((_, i) => i % 11 === 0)), 'teen stand-in problems');
});

test('recovery: the libraries are independent: without the adult and child files the teen clothes still draw from the teen GLB', async () => {
  const { ctx, errors } = await boot((path) => { if (path !== TEEN_GLB && /^garments(?:-child)?\//.test(path)) throw new Error('404 ' + path); return fromDisk(path); });
  report(errors.map((e) => e.message), 'errors while loading without the adult and child files');
  assert.deepEqual(GARMENT_KEYS.filter((k) => ctx.garmentGlb.has(k)).sort(), [...teenKeys].sort());
  const r = build(ctx, teenKeys.filter((_, i) => i % 5 === 0));
  assert.equal(r.st.glb, r.st.records);
  assert.equal(r.st.standin + r.st.failed, 0);
});

// ---------------------------------------------------------------- the generator
test('generator: a teen manifest that is not the teen library, a size class it does not know, or a colour two palettes disagree on is refused, never written into the module', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'ladera-teen-data-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const files = ['garments/assortments.json', 'garments/palette.json', 'garments/teen/palette.json', 'manifest.garments.json', 'manifest.garments-child.json', 'manifest.garments_teen.json'];
  const fresh = (name) => {                                                                       // a models directory of just the JSON the generator reads
    const to = join(dir, name);
    for (const f of files) { mkdirSync(dirname(join(to, f)), { recursive: true }); cpSync(join(MODELS, f), join(to, f)); }
    return to;
  };
  const edit = (models, file, fn) => { const p = join(models, file), j = JSON.parse(readFileSync(p, 'utf8')); fn(j); writeFileSync(p, JSON.stringify(j)); };
  const teenAssets = (j) => Object.values(j.files[0].assets);
  assert.equal(garmentsDataModule(fresh('ok')), garmentsDataModule(MODELS), 'the fixture of copied manifests is not the real thing');
  const refused = [
    ['not the teen set', 'manifest.garments_teen.json', (j) => { j.set = 'garments'; }, /expected the garments_teen set of ageGroup 'teen'/],
    ['another age group', 'manifest.garments_teen.json', (j) => { j.ageGroup = 'child'; }, /expected the garments_teen set of ageGroup 'teen'/],
    ['an asset of another age group', 'manifest.garments_teen.json', (j) => { delete teenAssets(j)[7].ageGroup; }, /ageGroup must be 'teen'/],
    ['a size class it does not know', 'manifest.garments_teen.json', (j) => { teenAssets(j)[3].sizeClass = 'medium'; }, /invalid garment key/],
    ['a size class missing', 'manifest.garments_teen.json', (j) => { delete teenAssets(j)[3].sizeClass; }, /invalid garment key/],
    ['a size class it does not know, in its key too', 'manifest.garments_teen.json', (j) => { const [k, a] = Object.entries(j.files[0].assets)[3]; delete j.files[0].assets[k]; a.sizeClass = 'medium'; j.files[0].assets[`garment_${a.garment}_medium_${a.state}`] = a; }, /invalid garment key/],
    ['a key that is not <style>_<size>_<state>', 'manifest.garments_teen.json', (j) => { const [k, a] = Object.entries(j.files[0].assets)[2]; delete j.files[0].assets[k]; j.files[0].assets[`garment_${a.garment}_${a.state}`] = a; }, /invalid garment key/],
    ['the wrong palette', 'manifest.garments_teen.json', (j) => { j.palette = 'garments/palette.json'; }, /must use its own palette and atlas/],
    ['two LOD files for one pose', 'manifest.garments_teen.json', (j) => { teenAssets(j)[0].lod.glb = 'garments/elsewhere.glb'; }, /more than one LOD pack/],
    ['variants that differ between poses', 'manifest.garments_teen.json', (j) => { const [a, b] = teenAssets(j).filter((x) => x.garment === 'denim_jeans' && x.sizeClass === 'big'); b.variants = [...a.variants, 'jersey_cream']; }, /the variants differ between states/],
    ['an unknown fabric', 'manifest.garments_teen.json', (j) => { teenAssets(j)[0].variants = ['no_such_fabric']; }, /unknown or empty palette variants/],
    ['a colour the adult table has too', 'garments/teen/palette.json', (j) => { j.variants.plain_teal = { ...j.variants.jersey_teal, color: '#010203' }; }, /palette variant plain_teal has two colours/],
  ];
  for (const [label, file, fn, message] of refused) {
    const models = fresh(label.replace(/\W+/g, '-'));
    edit(models, file, fn);
    assert.throws(() => garmentsDataModule(models), message, `${label}: the generator wrote a module`);
  }
});

// ---------------------------------------------------------------- the recipes: dev/garments/teen-assortments.json (source data for a later placement pass)
const RECIPES = readJSON(ROOT, 'dev', 'garments', 'teen-assortments.json');
const LOCKER_STYLES = new Set(['school_polo', 'school_jumper', 'school_trousers', 'school_skirt', 'socks_pair', 'school_shoes_pair', 'cap']);
const HANG_CLEARANCE = 0.1;                                                                       // metres between a hung garment's lowest point and the host's floor
const styleOf = (c) => c.garment.replace(/_(?:small|big)$/, '');
/** What is wrong with a recipe file, judged against the data module, the contract's own state lists and the furniture catalogue. */
function recipeProblems(file) {
  const out = [], bad = (m) => out.push(m);
  if (file.schemaVersion !== 1 || file.sizeTag !== 'teen') bad('the file must be schemaVersion 1 and sizeTag teen');
  for (const [size, { ages }] of Object.entries(TEEN_SIZE_CLASSES)) if (JSON.stringify(file.sizeClasses?.[size]?.ages) !== JSON.stringify(ages)) bad(`sizeClasses.${size} must carry the ages ${ages}`);
  if (!Array.isArray(file.bindings) || !file.bindings.length) { bad('no bindings'); return out; }
  const ids = new Set(), stocked = new Set(), mirror = new Map();
  for (const b of file.bindings) {
    const at = b.id;
    if (typeof b.id !== 'string' || ids.has(b.id)) bad(`${at}: duplicate or missing id`);
    ids.add(b.id);
    if (b.sizeTag !== 'teen' || !SIZES.includes(b.sizeClass) || !String(b.id).endsWith('_' + b.sizeClass)) bad(`${at}: sizeTag teen and a size class that ends its id are required`);
    if (!['drawer', 'wardrobe'].includes(b.kind)) bad(`${at}: kind must be drawer or wardrobe`);
    if (!b.roomKinds?.length || !b.roomKinds.every((r) => ['teen_bedroom', 'school_locker'].includes(r))) bad(`${at}: roomKinds must be teen_bedroom or school_locker`);
    const locker = b.roomKinds?.includes('school_locker');
    const hosts = (b.catalogueKeys ?? []).map((k) => [k, CATALOG[k]]);
    if (!hosts.length || hosts.some(([, c]) => !c)) bad(`${at}: catalogueKeys must name furniture catalogue entries (${hosts.filter(([, c]) => !c).map(([k]) => k)})`);
    for (const [k, c] of hosts) {
      if (!c) continue;
      const tags = c.tags ?? [];
      if (locker ? !(tags.includes('lockers') || tags.includes('cubby')) : b.kind === 'drawer' ? !tags.includes('dresser') : !tags.includes('wardrobe')) bad(`${at}: host ${k} (${tags}) is not a place for a ${locker ? 'school locker' : b.kind} recipe`);
    }
    if (!Array.isArray(b.items) || !b.items.length) bad(`${at}: no items`);
    const lines = [];
    for (const it of b.items ?? []) {
      const c = CATALOG[it.asset];
      if (!c || c.arch !== 'garment' || c.sizeTag !== 'teen') { bad(`${at}: ${it.asset} is not a teen garment key`); continue; }
      const style = styleOf(c), g = GARMENTS[c.garment];
      if (it.sizeTag !== 'teen' || it.sizeClass !== b.sizeClass || c.sizeClass !== b.sizeClass) bad(`${at}: ${it.asset} is not of the binding's size class ${b.sizeClass}`);
      if (!Number.isInteger(it.count) || it.count < 1) bad(`${at}: ${it.asset} needs a positive integer count`);
      if (!g.v.includes(it.variant)) bad(`${at}: ${it.asset} has no variant ${it.variant}`);
      stocked.add(`${style}/${c.sizeClass}`);
      const pose = b.kind === 'drawer' ? c.state === 'folded'
        : c.state === 'hung' ? it.support === 'hanger'
        : c.state === 'folded' ? !it.support || it.support === 'shelf'
        : it.support === 'shelf' && !TEEN_DIMENSIONS[style].states.includes('folded');             // a flat garment on a shelf is a style with no folded state: cap, shoes, sandals
      if (!pose) bad(`${at}: ${it.asset} (support ${it.support ?? 'none'}) does not suit a ${b.kind}`);
      if (locker && !LOCKER_STYLES.has(style)) bad(`${at}: ${style} does not belong in a school locker`);
      for (const [k, h] of hosts) {
        if (!h) continue;
        if (c.state === 'hung' ? c.size[1] + HANG_CLEARANCE > h.size[1] : c.size[0] > h.size[0] || c.size[2] > h.size[2]) bad(`${at}: ${it.asset} (${c.size.join(' x ')}) does not fit ${k} (${h.size.join(' x ')})`);
      }
      lines.push(`${style}/${c.state}/${it.variant}/${it.count}/${it.support ?? ''}`);
    }
    mirror.set(b.id, { size: b.sizeClass, base: String(b.id).replace(/_(?:small|big)$/, ''), kind: b.kind, rooms: b.roomKinds, hosts: b.catalogueKeys, stock: lines.join('|') });
  }
  for (const style of REQUIRED_TEEN_GARMENTS) for (const size of SIZES) if (!stocked.has(`${style}/${size}`)) bad(`${style}/${size} is stocked by no recipe`);
  for (const m of mirror.values()) if (m.size === 'small') {
    const twin = mirror.get(`${m.base}_big`);
    if (!twin || JSON.stringify({ ...twin, size: 0, base: 0 }) !== JSON.stringify({ ...m, size: 0, base: 0 })) bad(`${m.base}: the small and the big recipe do not hold the same stock`);
  }
  for (const kind of ['drawer', 'wardrobe']) if (!file.bindings.some((b) => b.kind === kind)) bad(`no ${kind} recipe`);
  for (const size of SIZES) if (!file.bindings.some((b) => b.sizeClass === size && b.roomKinds?.includes('school_locker') && b.catalogueKeys?.includes('locker_pair'))) bad(`no ${size} school locker recipe for locker_pair`);
  return out;
}

test('recipes: the drawer, wardrobe and locker recipes are 7 per size over the 29 styles, valid against the data module and the furniture catalogue', () => {
  report(recipeProblems(RECIPES), 'recipe problems');
  assert.equal(RECIPES.bindings.length, 14);
  assert.equal(RECIPES.bindings.reduce((n, b) => n + b.items.length, 0), 68);
  for (const size of SIZES) assert.equal(RECIPES.bindings.filter((b) => b.sizeClass === size).length, 7);
  assert.deepEqual(RECIPES.roomKinds, ['teen_bedroom', 'school_locker']);
});

test('recipes: the checks fail on a recipe that is wrong in each way they know', () => {
  const find = (id) => (file) => file.bindings.find((b) => b.id === id);
  const first = (b) => b.items[0];
  const mutations = [
    ['an item of the other size class', (f) => { first(find('teen_drawer_tops_small')(f)).asset = first(find('teen_drawer_tops_small')(f)).asset.replace('_small_', '_big_'); }, /not of the binding's size class small/],
    ['an item that says the other size class', (f) => { first(find('teen_drawer_tops_small')(f)).sizeClass = 'big'; }, /not of the binding's size class small/],
    ['an asset that does not exist', (f) => { first(find('teen_drawer_tops_big')(f)).asset = 'garment_blazer_big_folded'; }, /not a teen garment key/],
    ['an adult garment', (f) => { first(find('teen_drawer_tops_big')(f)).asset = 'garment_tshirt_folded'; }, /not a teen garment key/],
    ['a variant the design does not have', (f) => { first(find('teen_drawer_tops_big')(f)).variant = 'plain_teal'; }, /has no variant plain_teal/],
    ['a count of zero', (f) => { first(find('teen_drawer_tops_big')(f)).count = 0; }, /positive integer count/],
    ['a hung garment in a drawer', (f) => { first(find('teen_drawer_tops_big')(f)).asset = 'garment_tshirt_cream_big_hung'; }, /does not suit a drawer/],
    ['a hung garment with no hanger', (f) => { delete first(find('teen_wardrobe_daily_big')(f)).support; }, /does not suit a wardrobe/],
    ['a flat garment with no shelf', (f) => { delete first(find('teen_wardrobe_shelf_big')(f)).support; }, /does not suit a wardrobe/],
    ['a flat T-shirt on a shelf (it has a folded state)', (f) => { Object.assign(first(find('teen_wardrobe_shelf_big')(f)), { asset: 'garment_tshirt_cream_big_flat', variant: 'jersey_cream' }); }, /does not suit a wardrobe/],
    ['a host that is not in the furniture catalogue', (f) => { find('teen_drawer_tops_big')(f).catalogueKeys = ['dresser_4', 'dresser_99']; }, /must name furniture catalogue entries \(dresser_99\)/],
    ['a drawer recipe on a wardrobe', (f) => { find('teen_drawer_tops_big')(f).catalogueKeys = ['wardrobe_2']; }, /is not a place for a drawer recipe/],
    ['a locker recipe on a dresser', (f) => { find('teen_school_locker_big')(f).catalogueKeys = ['dresser_4']; }, /is not a place for a school locker recipe/],
    ['a parcel too deep for its cubby', (f) => { find('teen_school_locker_big')(f).items.push({ asset: 'garment_swim_onepiece_big_folded', variant: 'swim_blue', count: 1, sizeTag: 'teen', sizeClass: 'big' }); }, /garment_swim_onepiece_big_folded \(.*\) does not fit cubby_shelf/],
    ['swimwear in a school locker', (f) => { find('teen_school_locker_small')(f).items.push({ asset: 'garment_swim_shorts_small_folded', variant: 'swim_blue', count: 1, sizeTag: 'teen', sizeClass: 'small' }); }, /swim_shorts does not belong in a school locker/],
    ['a hung drop that does not clear its host', (f) => { find('teen_school_locker_big')(f).items.push({ asset: 'garment_school_trousers_big_hung', variant: 'twill_navy', count: 1, sizeTag: 'teen', sizeClass: 'big', support: 'hanger' }); }, /garment_school_trousers_big_hung \(.*\) does not fit cubby_shelf/],
    ['a style that no recipe stocks', (f) => { for (const b of f.bindings) b.items = b.items.filter((i) => !/dress_maxi/.test(i.asset)); }, /dress_maxi\/small is stocked by no recipe/],
    ['a duplicated binding id', (f) => { f.bindings[1].id = f.bindings[0].id; }, /duplicate or missing id/],
    ['a big recipe that drifts from its small twin', (f) => { find('teen_drawer_bottoms_big')(f).items[0].count = 2; }, /teen_drawer_bottoms: the small and the big recipe do not hold the same stock/],
    ['no school locker for locker_pair', (f) => { for (const b of f.bindings) if (b.roomKinds.includes('school_locker')) b.catalogueKeys = ['cubby_shelf']; }, /no small school locker recipe for locker_pair/],
    ['the wrong ages on a size class', (f) => { f.sizeClasses.big.ages = [15, 19]; }, /sizeClasses.big must carry the ages 16,19/],
  ];
  for (const [label, mutate, message] of mutations) {
    const file = structuredClone(RECIPES);
    mutate(file);
    const problems = recipeProblems(file);
    assert.ok(problems.length, `${label}: the recipe checks found nothing wrong`);
    assert.match(problems.join('\n'), message, `${label}: ${problems.slice(0, 3).join(' / ')}`);
  }
});
