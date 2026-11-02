// INTERIORS garments: some rooms are messy (clothes on the bed, over a chair, on a hook, on the floor), others neat (js/interiors/garments.js). Held to: the tidiness of a room is
// deterministic and varied (neat / lived-in / messy over the 109 real buildings), it follows who lives there (students messier, the abuela's room never messy), shops, the clinic, the
// school, the chapel and the hall stay neat (a dressmaker shows its stock on its tables), a child's room and a child's bed are never touched, a garment lies on a surface or on bare
// floor (never inside furniture, never on the lanes people walk, never in a door's sweep), the budgets hold, the game boots and draws the same rooms from the GLBs or from stand-ins when
// the files are absent, and the committed data module is what the generator makes of the manifests.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-garments.test.mjs
//   A3_LIST=40 shows more of a failing list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe } from '../tools/blender/glb_info.mjs';
import { inspectAsset, parseGLB, validateGarments } from '../tools/blender/garments_validate.mjs';
import { furnishedBatch, obbOf, corners, penetration, rectOb, roomOf, catalogOf, landing } from './interiors-lib.mjs';
import { CATALOG } from '../js/interiors/catalog.js';
import { GARMENTS, VARIANTS, STATES, ASSORTMENTS, GARMENT_FILES } from '../js/interiors/garments_data.js';
import { GARMENT_KEYS, ALL_GARMENT_KEYS, PAGE_GARMENT_SIZES, garmentKey, lodFile, registerGarmentAssets, tidinessOf, classOf, isChildRoom, walkLanes, uOf, CLASS, NEAT_LOTS, CHILD_ROLES, LIMITS, STOCK_HOSTS, KIND_SHIFT, garmentsOff } from '../js/interiors/garments.js';
import { mkObb } from '../js/interiors/layout.js';
import { garmentsDataModule } from '../tools/garments_data.mjs';
import { drawStandin } from '../js/interiors/standins.js';
import { MeshBuilder } from '../js/core/mesh.js';
import { buildInterior, loadInteriorAssets, loadGarmentAssets } from '../js/interiors/build.js';
import { loadInteriorAssets as pageLoad, loadGarmentAssets as pageClothes } from '../js/interiors/index.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = join(ROOT, 'assets', 'models');
const report = (problems, what, lim = +(process.env.A3_LIST || 12)) => assert.equal(problems.length, 0, `${problems.length} ${what}:\n  ` + problems.slice(0, lim).join('\n  '));
const isGarment = (f) => catalogOf(f)?.arch === 'garment';
const fmt = (n) => n.toFixed(2);

// ---------------------------------------------------------------- the library's files
const manifest = JSON.parse(readFileSync(join(MODELS, 'manifest.garments.json'), 'utf8'));
const childManifest = JSON.parse(readFileSync(join(MODELS, 'manifest.garments-child.json'), 'utf8'));
const childCatalogue = JSON.parse(readFileSync(join(ROOT, 'tools', 'blender', 'garments-child.catalog.json'), 'utf8'));
const assetRows = (man, sizeTag) => man.files.flatMap((f) => Object.entries(f.assets).map(([key, a]) => ({ key, a, file: f.glb, sizeTag })));
const teenManifest = JSON.parse(readFileSync(join(MODELS, 'manifest.garments-teen.json'), 'utf8'));
const adultAssets = assetRows(manifest, 'adult'), childAssets = assetRows(childManifest, 'child'), teenAssets = assetRows(teenManifest, 'teen');
const assets = [...adultAssets, ...childAssets];                                               // (what a load of the clothes asks for unless it names the libraries)
const isGarmentFile = (path) => /^(?:garments|garments-child|garments-teen)\//.test(path);
const CHILD_IDS = [
  'child_school_shirt', 'child_school_polo', 'child_pinafore', 'child_school_trousers', 'child_school_shorts',
  'child_tshirt', 'child_hoodie', 'child_jeans', 'child_skirt', 'child_dress', 'child_pyjama_top', 'child_pyjama_bottoms',
  'child_cardigan', 'child_socks_pair', 'child_shoes', 'child_cap', 'child_backpack', 'child_swim_trunks',
  'child_swimsuit_onepiece', 'child_rash_vest',
];

test('the committed data module is what the generator makes of the manifests (the drift guard)', () => {
  const have = readFileSync(join(ROOT, 'js', 'interiors', 'garments_data.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(have, garmentsDataModule(MODELS), 'js/interiors/garments_data.js is out of date: run `node la-ladera/tools/garments_data.mjs > la-ladera/js/interiors/garments_data.js`');
  const problems = [];
  assert.equal(GARMENT_KEYS.length, assets.length, `${GARMENT_KEYS.length} keys in the data module, ${assets.length} assets in the manifest`);
  for (const { key, a, sizeTag } of assets) {
    const g = GARMENTS[a.garment]?.[a.state];
    if (!g) { problems.push(`${key}: not in the data module`); continue; }
    if (GARMENTS[a.garment].sizeTag !== sizeTag) problems.push(`${key}: generated size tag is ${GARMENTS[a.garment].sizeTag}, expected ${sizeTag}`);
    if (a.lod.glb !== lodFile(a.state, sizeTag) || a.lod.node !== key + '_lod') problems.push(`${key}: the manifest's LOD is ${a.lod.glb}#${a.lod.node}, the loader asks for ${lodFile(a.state, sizeTag)}#${key}_lod`);
    if (g[3] !== a.lod.triangles) problems.push(`${key}: ${g[3]} LOD triangles in the data module, ${a.lod.triangles} in the manifest`);
    if (key !== garmentKey(a.garment, a.state)) problems.push(`${key}: not the key garmentKey() makes (${garmentKey(a.garment, a.state)})`);
    for (const v of a.variants) if (!(v in VARIANTS)) problems.push(`${key}: variant ${v} has no colour`);
  }
  report(problems, 'data module / manifest mismatches');
});

test('the LOD models exist in the files the loader names (exact case), one node per garment key', () => {
  const problems = [];
  for (const sizeTag of ['adult', 'child']) for (const state of STATES) {
    const file = lodFile(state, sizeTag), path = join(MODELS, file);
    if (!existsSync(path) || !readdirSync(dirname(path)).includes(basename(path))) { problems.push(`${file}: no such file (case counts on GitHub Pages)`); continue; }
    const info = describe(path);
    const keys = GARMENT_KEYS.filter((k) => CATALOG[k]?.state === state && CATALOG[k]?.sizeTag === sizeTag);
    for (const key of keys) if (!info.assets.has(key + '_lod')) problems.push(`${file}: no node ${key}_lod`);
    if (info.assets.size !== keys.length) problems.push(`${file}: ${info.assets.size} nodes, ${keys.length} expected garment keys`);
    if (GARMENT_FILES[sizeTag]?.[state] !== file) problems.push(`${sizeTag}/${state}: the generated file map differs from the loader`);
    if (sizeTag === 'adult' && lodFile(state) !== file) problems.push(`${state}: a one-argument lodFile call no longer uses the adult pack`);
  }
  report(problems, 'LOD files without their nodes');
});

test('catalogue: every garment key is a flat, non-blocking piece of the library\'s size, and a hung one hangs', () => {
  const problems = [];
  for (const [id, g] of Object.entries(GARMENTS)) for (const s of STATES) {
    if (!g[s]) continue;
    const key = garmentKey(id, s), c = CATALOG[key];
    if (!c) { problems.push(`${key}: not in the catalogue`); continue; }
    if (c.arch !== 'garment' || c.block !== false || c.garment !== id || c.state !== s) problems.push(`${key}: arch ${c.arch} block ${c.block} garment ${c.garment} state ${c.state}`);
    if (c.sizeTag !== g.sizeTag || !c.tags.includes(g.sizeTag)) problems.push(`${key}: catalogue size tag does not match ${g.sizeTag}`);
    if (c.size.some((v, i) => Math.abs(v - g[s][i]) > 1e-9)) problems.push(`${key}: size ${c.size} is not the library's ${g[s].slice(0, 3)}`);
    if (s === 'hung' && !(c.wall && c.hang)) problems.push(`${key}: a hung garment is a wall piece that hangs`);
    if (s !== 'hung' && (c.wall || c.hang)) problems.push(`${key}: a ${s} garment lies, it does not hang`);
  }
  report(problems, 'catalogue problems');
});

test('assets: every key is pointed at its LOD file and node; a context without assets is left alone', () => {
  const entries = new Map(), ctx = { assets: { entries } };
  assert.equal(registerGarmentAssets(ctx), GARMENT_KEYS.length);
  const problems = [];
  for (const { key, a, sizeTag } of assets) {
    const e = entries.get(key);
    if (!e || e.glb !== a.lod.glb || e.node !== a.lod.node) problems.push(`${key}: ${JSON.stringify(e)} (the manifest says ${a.lod.glb}#${a.lod.node})`);
    if (e?.sizeTag !== sizeTag || !e?.tags?.includes(sizeTag)) problems.push(`${key}: asset registration lost the ${sizeTag} size tag`);
  }
  report(problems, 'garment keys not pointed at their LOD');
  entries.set(GARMENT_KEYS[0], { glb: 'elsewhere.glb', node: 'x', footprint: [1, 1] });
  registerGarmentAssets(ctx);
  assert.equal(entries.get(GARMENT_KEYS[0]).glb, lodFile(CATALOG[GARMENT_KEYS[0]].state, CATALOG[GARMENT_KEYS[0]].sizeTag), 'a manifest entry the lead registered later is still pointed at the LOD (the full-detail models are not drawn in a merged interior)');
  assert.equal(entries.get(GARMENT_KEYS[0]).footprint?.[0], 1, 'the rest of an existing entry is kept');
  assert.equal(registerGarmentAssets({}), 0);
  assert.equal(registerGarmentAssets(null), 0);
});

test('stand-ins: every garment draws a cloth patch inside its own box', () => {
  const problems = [];
  for (const key of GARMENT_KEYS) {
    const c = CATALOG[key], b = new MeshBuilder(), n = drawStandin(b, { id: 'g', name: key, x: 0, z: 0, y: 0, ry: 0, tint: 0x4b8981, w: c.size[0], d: c.size[2], h: c.size[1], kind: c.wall ? 'wall' : 'floor' }, c);
    if (!n || b.tris < 2) { problems.push(`${key}: drew nothing`); continue; }
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const acc of b.accs.values()) for (let i = 0; i < acc.pos.length; i += 3) for (let k = 0; k < 3; k++) { const v = acc.pos[i + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
    const [W, H, D] = c.size;                                                              // a stand-in fills the record's own box: its y is the bottom edge, a hung one included (the GLB is lifted by its drop, the patch is not)
    if (!(lo[0] >= -W / 2 - 0.02 && hi[0] <= W / 2 + 0.02 && lo[2] >= -D / 2 - 0.02 && hi[2] <= D / 2 + 0.02 && lo[1] >= -0.02 && hi[1] <= H + 0.02)) problems.push(`${key}: x ${fmt(lo[0])}..${fmt(hi[0])} y ${fmt(lo[1])}..${fmt(hi[1])} z ${fmt(lo[2])}..${fmt(hi[2])} vs ${W}x${H}x${D}`);
    if (hi[1] - lo[1] < H * 0.5) problems.push(`${key}: a patch ${fmt(hi[1] - lo[1])} m tall for a garment ${fmt(H)} m tall`);
    if (b.tris > 40) problems.push(`${key}: ${b.tris} triangles for a patch of cloth`);
  }
  report(problems, 'garment stand-ins');
});

test('child library: all 20 everyday designs and 57 applicable states are explicitly tagged for ages 6 to 10', () => {
  assert.equal(childCatalogue.schemaVersion, 1);
  assert.equal(childCatalogue.sizeTag, 'child');
  assert.equal(childManifest.sizeTag, 'child');
  assert.equal(childManifest.scope, 'objects-only');
  assert.deepEqual(childCatalogue.ageRange, [6, 10]);
  assert.deepEqual(childManifest.ageRange, [6, 10]);
  assert.deepEqual(childCatalogue.roomKinds, ['child_bedroom', 'school_locker'], 'the intended room kinds must remain explicit source data');
  assert.deepEqual(childCatalogue.garments.map((g) => g.id).sort(), [...CHILD_IDS].sort());
  assert.deepEqual(Object.entries(GARMENTS).filter(([, g]) => g.sizeTag === 'child').map(([id]) => id).sort(), [...CHILD_IDS].sort());
  assert.equal(childAssets.length, 57);
  assert.equal(adultAssets.length, 67, 'all adult garment states remain available');
  assert.equal(Object.values(GARMENTS).filter((g) => g.sizeTag === 'adult').length, 23, 'all 23 adult designs remain available');
  assert.equal(new Set(assets.map(({ key }) => key)).size, assets.length, 'child and adult keys cannot collide');
  const rigid = new Set(['child_shoes', 'child_cap', 'child_backpack']);
  for (const g of childCatalogue.garments) {
    assert.equal(g.sizeTag, 'child', g.id);
    const expected = rigid.has(g.id) ? ['flat', 'hung'] : ['flat', 'folded', 'hung'];
    assert.deepEqual([...g.states].sort(), expected, `${g.id}: applicable object states`);
    if (rigid.has(g.id)) assert.ok(g.notApplicable?.folded?.trim().length > 10, `${g.id}: explain why folding is not applicable`);
    assert.deepEqual(childAssets.filter(({ a }) => a.garment === g.id).map(({ a }) => a.state).sort(), expected, `${g.id}: manifest states`);
    for (const { key, a } of childAssets.filter(({ a }) => a.garment === g.id)) {
      assert.equal(a.sizeTag, 'child', key);
      assert.ok(GARMENT_KEYS.includes(key) && CATALOG[key]?.sizeTag === 'child', `${key}: child catalogue binding`);
    }
  }
});

test('child library: independently decoded GLBs satisfy the complete 900-triangle contract and retain useful LODs', () => {
  const r = validateGarments({ child: true, complete: true });
  assert.deepEqual(r.errors, [], 'regenerate the child object library; manifest claims alone are insufficient');
  assert.equal(r.ok, true);
  assert.equal(r.catalogueGarments, 20);
  assert.equal(r.assets, 57);
  assert.ok(r.maxTriangles > 0 && r.maxTriangles <= 900, `child near maximum ${r.maxTriangles}, limit 900`);
  assert.ok(r.maxLodTriangles > 0 && r.maxLodTriangles <= 240, `child LOD maximum ${r.maxLodTriangles}, limit 240`);
  const decoded = new Map();
  const get = (file) => {
    if (!decoded.has(file)) decoded.set(file, parseGLB(readFileSync(join(MODELS, file)), file));
    return decoded.get(file);
  };
  for (const { key, a, file } of childAssets) {
    const near = inspectAsset(get(file), a.node), far = inspectAsset(get(a.lod.glb), a.lod.node);
    assert.ok(near.triangles > 0 && near.triangles <= 900, `${key}: ${near.triangles} actual triangles`);
    assert.ok(far.triangles > 0 && far.triangles <= 240, `${key}: ${far.triangles} actual LOD triangles`);
    assert.ok(far.triangles <= near.triangles * 0.6, `${key}: LOD must remove at least 40% of triangles`);
    assert.equal(near.triangles, a.triangles, `${key}: measured near triangles`);
    assert.equal(far.triangles, GARMENTS[a.garment][a.state][3], `${key}: the runtime must count actual LOD triangles`);
    assert.deepEqual(near.materials, ['laundry'], `${key}: same library material as the adult clothes`);
    assert.deepEqual(far.materials, ['laundry'], `${key}: same LOD material as the adult clothes`);
  }
});

test('child library: source dimensions are 60% adult length and actual exported tees keep that scale', () => {
  assert.equal(childCatalogue.scale, 0.6);
  assert.equal(childManifest.scale, 0.6);
  for (const g of childCatalogue.garments) {
    assert.equal(g.scale, 0.6, g.id);
    assert.ok(Number.isFinite(g.adultReferenceLength) && g.adultReferenceLength > 0, `${g.id}: adult length reference`);
    assert.ok(Math.abs(g.length - g.adultReferenceLength * 0.6) < 1e-8, `${g.id}: ${g.length} m is not 60% of ${g.adultReferenceLength} m`);
  }
  for (const [state, axis] of [['flat', 2], ['hung', 1]]) {
    const adult = adultAssets.find(({ a }) => a.garment === 'tshirt' && a.state === state);
    const child = childAssets.find(({ a }) => a.garment === 'child_tshirt' && a.state === state);
    const measure = (row) => inspectAsset(parseGLB(readFileSync(join(MODELS, row.file)), row.file), row.a.node).size[axis];
    const adultLength = measure(adult), childLength = measure(child), ratio = childLength / adultLength;
    assert.ok(ratio >= 0.55 && ratio <= 0.65, `${state}: child tee ${childLength.toFixed(3)} m / adult tee ${adultLength.toFixed(3)} m = ${ratio.toFixed(3)} (target 0.60)`);
  }
});

test('child library: one shared print atlas stays below six megabytes of GPU texture including mipmaps', () => {
  assert.equal(childManifest.palette, manifest.palette, 'the child garments reuse the adult palette');
  assert.equal(childManifest.atlas.file, manifest.atlas.file, 'the child garments reuse the adult atlas, with no second allocation');
  const png = readFileSync(join(MODELS, childManifest.atlas.file));
  assert.ok(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'the shared atlas is a PNG');
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert.equal(width, childManifest.atlas.width);
  assert.equal(height, childManifest.atlas.height);
  assert.ok(width > 0 && height > 0);
  let w = width, h = height, gpuBytes = 0;
  for (;;) {
    gpuBytes += w * h * 4;                                                                     // conservative RGBA8 allocation, every mip level through 1 x 1
    if (w === 1 && h === 1) break;
    w = Math.max(1, Math.floor(w / 2)); h = Math.max(1, Math.floor(h / 2));
  }
  assert.ok(gpuBytes <= 6_000_000, `${width} x ${height} atlas needs ${gpuBytes} GPU bytes including mipmaps`);
  assert.equal(readdirSync(join(MODELS, 'garments-child')).filter((name) => /\.(png|jpe?g|webp|ktx2?)$/i.test(name)).length, 0, 'child models must not quietly ship a duplicate or extra atlas');
  console.log(`# child garments: one shared ${width}x${height} atlas, ${gpuBytes} bytes RGBA8 including all mip levels; no additional texture allocation`);
});

// ---------------------------------------------------------------- the world
const real = await furnishedBatch({ real: true });
const { ctx, bps } = real;
const roomsOf = (bp) => Object.entries(bp.interior.garments.rooms).map(([rid, r]) => ({ bp, rid, ...r, rec: bp.interior.rooms[rid], room: roomOf(bp, rid) }));
const allRooms = bps.flatMap(roomsOf);
const hhOf = (bp, hid) => bp.interior.hh.find((h) => h.id === hid);
const garmentsOf = (bp) => bp.furniture.filter(isGarment);

test('furnishing raises no errors and the pass ran in every building', () => {
  report((ctx.errors ?? []).map((e) => `${e.building ?? e.room}: ${e.message}`), 'furnish errors');
  report(bps.filter((b) => !b.interior?.garments).map((b) => b.id), 'buildings the garments pass did not run in');
  assert.ok(!garmentsOff(), 'the off switch is set');
});

test('tidiness is a pure function of the building, the room and the household', () => {
  const bp = { id: 'L1', lot: { kind: 'house' } }, room = { id: 'L1.f1.r2' }, hh = { id: 'L1.hh0', kind: 'family', tidy: 0.6 };
  const a = tidinessOf(bp, room, hh, 'bedroom');
  assert.deepEqual(tidinessOf({ ...bp }, { ...room }, { ...hh }, 'bedroom'), a);
  const ms = new Set();
  for (let i = 0; i < 40; i++) ms.add(tidinessOf({ ...bp, id: 'L' + i }, room, hh, 'bedroom').level);
  assert.equal(ms.size, 3, `forty houses of one household, ${[...ms]} states: the room's own hash must spread them over neat, lived-in and messy`);
  assert.equal(uOf('a', 'b'), uOf('a', 'b'));
  assert.notEqual(uOf('a', 'b'), uOf('b', 'a'));
  const tidy = (kind, t) => tidinessOf(bp, room, { id: 'h', kind, tidy: t }, 'bedroom').m;
  assert.ok(tidy('students', 0.6) > tidy('family', 0.6) && tidy('family', 0.6) > tidy('elder', 0.6), 'students > family > elder');
  assert.ok(tidy('family', 0.3) > tidy('family', 0.9), 'a household that cares less leaves more about');
  assert.equal(tidinessOf(bp, room, { id: 'h', kind: 'elder', tidy: 0.1 }, 'bedroom', 'elder').level === 'messy', false, 'the abuela\'s own room is never messy');
  for (const cls of ['living', 'kitchen']) for (let i = 0; i < 60; i++) assert.notEqual(tidinessOf({ ...bp, id: 'L' + i }, room, { id: 'h', kind: 'students', tidy: 0.25 }, cls).level, 'messy', `${cls} is at most lived-in`);
});

test('the same seed gives the same clothes in the same places; another seed gives others; no other piece moves', async () => {
  const sig = (bps2) => bps2.map((b) => [b.id, JSON.stringify(b.interior.garments.rooms), garmentsOf(b).map((f) => [f.id, f.name, f.room, f.kind, f.x, f.y, f.z, f.ry, f.tint, f.parent, f.flags?.variant].join(':')).join('|'),
    b.furniture.filter((f) => isBed(f)).map((f) => !!f.flags?.unmade).join('')].join('#')).join('\n');
  const a = await furnishedBatch({ n: 24 }), b = await furnishedBatch({ n: 24 }), c = await furnishedBatch({ n: 24, seed: 11 });
  assert.equal(sig(a.bps), sig(b.bps), 'two runs of one seed differ');
  assert.notEqual(sig(a.bps), sig(c.bps), 'another seed gives the same clothes');
  assert.ok(a.bps.some((x) => garmentsOf(x).length), 'no garments in 24 synthetic buildings');
  globalThis.__noGarments = true;
  let off;
  try { off = await furnishedBatch({ n: 24 }); } finally { delete globalThis.__noGarments; }
  const core = (bps2) => bps2.map((x) => x.id + ':' + x.furniture.filter((f) => !isGarment(f)).map((f) => [f.id, f.name, f.room, f.kind, f.x, f.y, f.z, f.ry, f.block].join(',')).join(';')).join('\n');
  assert.equal(core(a.bps), core(off.bps), 'the garments pass moved, added or removed another piece of furniture');
  assert.ok(off.bps.every((x) => x.interior.garments.off === true && garmentsOf(x).length === 0), 'the off switch (?garments=0) still puts clothes out');
  const beds = off.bps.flatMap((x) => x.furniture.filter(isBed));
  assert.ok(beds.some((f) => f.flags?.unmade) && beds.some((f) => !f.flags?.unmade), 'with the pass off the beds keep what the room furnisher drew (some made, some not)');
});
const isBed = (f) => ['bed', 'mattress'].includes(catalogOf(f)?.arch);

test('over the 109 real buildings: neat, lived-in and messy bedrooms all occur; bathrooms vary; kitchens and living rooms are at most lived-in', () => {
  const by = (cls) => allRooms.filter((r) => r.cls === cls);
  const share = (rooms, level) => rooms.filter((r) => r.level === level).length / Math.max(1, rooms.length);
  const bed = by('bedroom').filter((r) => r.level !== 'child');
  for (const level of ['neat', 'lived', 'messy']) assert.ok(share(bed, level) >= 0.15 && share(bed, level) <= 0.55, `bedrooms ${level}: ${fmt(100 * share(bed, level))}% (${bed.length} bedrooms; each state wants 15..55%)`);
  const bath = by('bathroom');
  assert.ok(share(bath, 'neat') >= 0.3 && share(bath, 'lived') >= 0.1 && bath.some((r) => r.level === 'messy'), `bathrooms: ${['neat', 'lived', 'messy'].map((l) => l + ' ' + fmt(100 * share(bath, l)) + '%')}`);
  for (const cls of ['living', 'kitchen']) {
    assert.equal(by(cls).filter((r) => r.level === 'messy' || r.garments > CLASS[cls].cap).length, 0, `${cls}: messy, or over its cap of ${CLASS[cls].cap}`);
    assert.ok(share(by(cls), 'neat') >= 0.4, `${cls}: only ${fmt(100 * share(by(cls), 'neat'))}% neat`);
  }
  const homes = bps.filter((b) => !NEAT_LOTS.has(b.lot.kind) && b.interior.garments.rooms && !['kiosk'].includes(b.lot.kind));
  const withClothes = homes.filter((b) => garmentsOf(b).length);
  assert.ok(withClothes.length / homes.length >= 0.4, `clothes in ${withClothes.length} of ${homes.length} homes: the feature is hardly seen`);
  const msg = bed.filter((r) => r.level === 'messy'), liv = bed.filter((r) => r.level === 'lived');
  assert.ok(msg.reduce((n, r) => n + r.garments, 0) / msg.length >= 3, 'a messy bedroom holds three clothes or more on average');
  assert.ok(liv.reduce((n, r) => n + r.garments, 0) / liv.length >= 0.8, 'a lived-in bedroom has something out');
  console.log(`# garments: ${bps.length} buildings, ${allRooms.length} rooms; bedrooms (not a child's) ${bed.length}: neat ${fmt(100 * share(bed, 'neat'))}% lived ${fmt(100 * share(bed, 'lived'))}% messy ${fmt(100 * share(bed, 'messy'))}%; clothes in ${withClothes.length}/${homes.length} homes, ${bps.reduce((n, b) => n + garmentsOf(b).length, 0)} garments`);
});

test('the household sets the mess: students leave more about than families, the elders\' own rooms are never messy', async () => {
  const mean = (rows) => rows.reduce((n, r) => n + r.m, 0) / rows.length;
  // The bedrooms of the default world and of seeds 11 and 23 (each world is A2's planner on another seed): since A2's planner gives the second household of a building a living room
  // where it had two bedrooms, the default world alone has 7 student bedrooms where 10 are asked. The guard and the verdicts are unchanged.
  const worlds = [real];
  for (const seed of [11, 23]) worlds.push(await furnishedBatch({ real: true, seed }));
  const beds = worlds.flatMap((w) => w.bps.flatMap(roomsOf)).filter((r) => r.cls === 'bedroom' && r.level !== 'child');
  const kind = (k) => beds.filter((r) => hhOf(r.bp, r.rec.hh)?.kind === k);
  assert.ok(kind('students').length >= 10 && kind('elder').length >= 10, `${kind('students').length} student and ${kind('elder').length} elder bedrooms: too few to compare`);
  assert.ok(mean(kind('students')) > mean(kind('family')) + 0.05 && mean(kind('family')) > mean(kind('elder')) + 0.05, `mean mess: students ${fmt(mean(kind('students')))}, family ${fmt(mean(kind('family')))}, elder ${fmt(mean(kind('elder')))}`);
  report(beds.filter((r) => r.rec.role === 'elder' && r.level === 'messy').map((r) => r.rid), 'elder rooms that are messy');
  assert.ok(KIND_SHIFT.students > 0 && KIND_SHIFT.elder < 0);
});

test('shops, the clinic, the school, the chapel and the hall are neat: no clothes but a dressmaker\'s stock on its tables', () => {
  for (const kind of NEAT_LOTS) assert.equal(classOf({ lot: { kind } }, { type: 'bedroom' }, null), null, `a bedroom in a ${kind}`);
  assert.deepEqual([...NEAT_LOTS].sort(), ['chapel', 'clinic', 'hall', 'school']);
  assert.equal(classOf({ lot: { kind: 'house' } }, { type: 'bedroom' }, null), 'bedroom');
  assert.equal(classOf({ lot: { kind: 'house' } }, { type: 'shop' }, null), null, 'a shop is never untidy');
  assert.equal(classOf({ lot: { kind: 'house' } }, { type: 'bathroom', outdoor: true }, null), null, 'a yard is not a room');
  assert.equal(classOf({ lot: { kind: 'house' } }, { type: 'bedroom', noFurnish: true }, null), null);
  const problems = [];
  for (const bp of bps) {
    const lk = bp.lot.kind;
    for (const f of garmentsOf(bp)) {
      const r = bp.interior.garments.rooms[f.room];
      if (NEAT_LOTS.has(lk)) problems.push(`${bp.id} (${lk}): ${f.name} in ${f.room}`);
      else if (!r || r.cls === null) {
        const par = bp.furniture.find((x) => x.id === f.parent);
        if (!(bp.lot.shop === 'modista' && f.flags?.stock && par && STOCK_HOSTS.has(par.name) && f.kind === 'top')) problems.push(`${bp.id} (${lk}${bp.lot.shop ? '/' + bp.lot.shop : ''}): ${f.name} in the unclassed room ${f.room}`);
      }
    }
  }
  report(problems, 'clothes where only neatness belongs');
  report(allRooms.filter((r) => r.cls === null && (r.level !== 'neat' || r.rec?.tidy !== 'neat')).map((r) => r.rid), 'unclassed rooms that are not neat');
  const shops = bps.filter((b) => b.lot.shop === 'modista');
  assert.ok(shops.length >= 1 && shops.every((b) => garmentsOf(b).some((f) => f.flags?.stock)), 'a dressmaker\'s shop shows no stock');
  const names = new Set(ASSORTMENTS.filter((a) => a.kind === 'shop_shelf' && a.id !== 'shop_flat_swimwear').flatMap((a) => a.items.map((i) => i[0])));
  report(shops.flatMap((b) => garmentsOf(b).filter((f) => f.flags?.stock && !names.has(f.name)).map((f) => `${b.id}: ${f.name}`)), 'stock outside the library\'s shop recipes');
});

test('a child\'s room and a child\'s bed are never touched (the library is adult clothing)', () => {
  const problems = [];
  for (const bp of bps) {
    for (const f of garmentsOf(bp)) {
      const rec = bp.interior.rooms[f.room], par = bp.furniture.find((x) => x.id === f.parent);
      if (CHILD_ROLES.has(rec?.role)) problems.push(`${bp.id}: ${f.name} in the ${rec.role} room ${f.room}`);
      if (bp.furniture.some((x) => x.room === f.room && ['bed_crib', 'bed_bunk'].includes(x.name))) problems.push(`${bp.id}: ${f.name} in ${f.room}, which holds a crib or a bunk`);
      if (par && !['bed', 'mattress', 'chair', 'sofa', 'armchair'].includes(catalogOf(par)?.arch) && !STOCK_HOSTS.has(par.name)) problems.push(`${bp.id}: ${f.name} on a ${par.name}`);
      if (f.kind === 'floor' || f.kind === 'wall') {
        const bad = bp.furniture.find((x) => x.room === f.room && /^(toy_pile|doll)/.test(x.name) && Math.hypot(x.x - f.x, x.z - f.z) < 0.3);
        if (bad) problems.push(`${bp.id}: ${f.name} within 0.3 m of ${bad.name}`);
      }
    }
  }
  report(problems, 'clothes near a child');
  const kids = allRooms.filter((r) => CHILD_ROLES.has(r.rec?.role) && r.cls === 'bedroom');
  assert.ok(kids.length >= 10, `${kids.length} children's bedrooms in the world: the test has nothing to protect`);
  report(kids.filter((r) => r.level !== 'child' || r.garments).map((r) => `${r.rid}: ${r.level}, ${r.garments} garments`), 'children\'s rooms the pass did not skip');
  const cribs = bps.flatMap((b) => b.furniture.filter((f) => f.name === 'bed_crib' || f.name === 'bed_bunk').map((f) => b.interior.garments.rooms[f.room]));
  report(cribs.filter((r) => r && r.level !== 'child').map((r) => `${r.level}`), 'rooms with a crib or a bunk that the pass did not skip');
  for (const role of CHILD_ROLES) assert.equal(isChildRoom({ role, items: [] }, 'bedroom'), true, role);
  assert.equal(isChildRoom({ role: 'master', items: [{ name: 'toy_pile' }, { name: 'school_bag' }] }, 'bedroom'), false, 'toys in the parents\' room do not make it a child\'s');
  assert.equal(isChildRoom({ role: 'master', items: [{ name: 'bed_crib' }] }, 'bedroom'), true);
  assert.equal(isChildRoom({ role: 'guest', items: [{ name: 'bed_cot' }] }, 'bedroom'), false, 'a camp bed is a guest\'s');
});

test('the beds follow the room: made in a neat one, mostly unmade in a messy one', () => {
  const bedsOf = (rooms) => rooms.flatMap((r) => r.bp.furniture.filter((f) => f.room === r.rid && isBed(f)));
  const beds = (level) => bedsOf(allRooms.filter((r) => r.level === level && r.cls));
  report(beds('neat').filter((f) => f.flags?.unmade).map((f) => f.id), 'unmade beds in neat rooms');
  // a room the pass never classes keeps the furnisher's bed: only the camp of a half-built house (a mattress among the cement bags, special.js) is unmade there
  report(bedsOf(allRooms.filter((r) => !r.cls && r.bp.lot.kind !== 'unfinished')).filter((f) => f.flags?.unmade).map((f) => f.id), 'unmade beds in the rooms that are always neat');
  const messy = beds('messy'), unmade = messy.filter((f) => f.flags?.unmade).length;
  assert.ok(messy.length >= 10 && unmade / messy.length >= 0.7, `${unmade} of ${messy.length} beds unmade in messy rooms`);
  const lived = beds('lived');
  assert.ok(lived.some((f) => f.flags?.unmade) && lived.some((f) => !f.flags?.unmade), 'lived-in rooms have some beds made and some not');
});

test('placement: a garment lies on a bed, a seat or a table, hangs on a wall, or lies on bare floor away from the furniture, the doors and the lanes', () => {
  const problems = [];
  for (const bp of bps) {
    const recs = bp.furniture, blockers = recs.filter((f) => f.kind === 'floor' && f.block);
    const floorG = [];
    for (const f of garmentsOf(bp)) {
      const c = catalogOf(f), room = roomOf(bp, f.room), y0 = room?.y ?? 0, tag = `${bp.id} ${f.room} ${f.name}`;
      if (!room) { problems.push(`${tag}: unknown room`); continue; }
      if (f.block) problems.push(`${tag}: blocks`);
      if (f.tint !== VARIANTS[f.flags?.variant]) problems.push(`${tag}: tint ${f.tint} is not variant ${f.flags?.variant}`);
      if (!(c.garment in GARMENTS) || !GARMENTS[c.garment].v.includes(f.flags?.variant)) problems.push(`${tag}: variant ${f.flags?.variant} is not the garment's`);
      const o = obbOf(f), inRoom = corners(o).every(([x, z]) => x >= room.rect.x0 - 0.01 && x <= room.rect.x1 + 0.01 && z >= room.rect.z0 - 0.01 && z <= room.rect.z1 + 0.01);
      if (c.state === 'hung') {
        if (f.kind !== 'wall' || !f.wallSide) problems.push(`${tag}: a hung garment is on a wall (kind ${f.kind}, side ${f.wallSide})`);
        if (f.y - y0 < 0.3 || f.y - y0 + f.h > 1.95) problems.push(`${tag}: hangs from ${fmt(f.y - y0 + f.h)} m to ${fmt(f.y - y0)} m`);
        for (const b of blockers) if (b.room === f.room && b.y + b.h > f.y + 0.01 && penetration(o, obbOf(b)) > 0.005) problems.push(`${tag}: hangs through ${b.name}`);
      } else if (f.kind === 'top') {
        const par = recs.find((x) => x.id === f.parent), pc = par && catalogOf(par);
        if (!par || par.room !== f.room) { problems.push(`${tag}: no parent`); continue; }
        const [px, pz] = [f.x - par.x, f.z - par.z], cs = Math.cos(par.ry), sn = Math.sin(par.ry), lx = px * cs - pz * sn, lz = px * sn + pz * cs;
        if (Math.abs(lx) > par.w / 2 + 0.01 || Math.abs(lz) > par.d / 2 + 0.01) problems.push(`${tag}: its centre is off ${par.name}`);
        if (Math.abs(f.y - (par.y + pc.size[1] + (pc.topAdd ?? 0))) > 0.005) problems.push(`${tag}: ${fmt(f.y - par.y)} m above ${par.name}, its top is ${fmt(pc.size[1] + (pc.topAdd ?? 0))}`);
        if (['bed', 'mattress'].includes(pc.arch)) {                                         // inside the sheet (a hand over the edge), clear of the pillows at the head
          const over = corners(o).map(([x, z]) => { const dx = x - par.x, dz = z - par.z; return [dx * cs - dz * sn, dx * sn + dz * cs]; });
          if (over.some(([a, b]) => Math.abs(a) > par.w / 2 + 0.08 || b < -par.d / 2 + 0.44 || b > par.d / 2 + 0.08)) problems.push(`${tag}: not on the sheet of ${par.name}`);
        }
        for (const b of blockers) if (b.id !== par.id && b.room === f.room && !STOCK_HOSTS.has(par.name) && penetration(o, obbOf(b)) > 0.05) problems.push(`${tag}: pushes into ${b.name}`);
      } else if (f.kind === 'floor') {
        floorG.push(f);
        if (Math.abs(f.y - y0) > 0.01) problems.push(`${tag}: floats at ${fmt(f.y - y0)} m`);
        if (!inRoom) problems.push(`${tag}: leaves its room`);
        for (const b of recs) if (b.room === f.room && b.kind === 'floor' && b !== f && !isGarment(b) && (b.block || (catalogOf(b)?.size[1] ?? 0) >= 0.04) && penetration(o, obbOf(b)) > 0) problems.push(`${tag}: inside ${b.name}`);
      } else problems.push(`${tag}: kind ${f.kind}`);
    }
    for (let i = 0; i < floorG.length; i++) for (let j = i + 1; j < floorG.length; j++) if (floorG[i].room === floorG[j].room && penetration(obbOf(floorG[i]), obbOf(floorG[j])) > 0.01) problems.push(`${bp.id} ${floorG[i].room}: ${floorG[i].name} lies on ${floorG[j].name}`);
    // the lanes and the doors' sweeps: no garment on the floor where people walk
    for (const f of floorG) {
      const L = bp.interior.layouts.get(f.room);
      if (L && walkLanes(L).hits(mkObb(f.x, f.z, f.w, f.d, f.ry))) problems.push(`${bp.id} ${f.room}: ${f.name} lies on a walking lane`);
    }
    for (const d of bp.doors) for (const rid of d.rooms) {
      const r = rid && roomOf(bp, rid), L = r && landing(bp, d, rid, 0.4); if (!L) continue;
      const inward = [Math.sign(L.local[0] - d.x) * Math.abs(d.nx), Math.sign(L.local[1] - d.z) * Math.abs(d.nz)];
      const zone = Math.abs(d.nx) > 0.5
        ? rectOb(inward[0] > 0 ? r.rect.x0 : r.rect.x1 - 0.7, d.z - d.w / 2, inward[0] > 0 ? r.rect.x0 + 0.7 : r.rect.x1, d.z + d.w / 2)
        : rectOb(d.x - d.w / 2, inward[1] > 0 ? r.rect.z0 : r.rect.z1 - 0.7, d.x + d.w / 2, inward[1] > 0 ? r.rect.z0 + 0.7 : r.rect.z1);
      for (const f of floorG) if (f.room === rid && penetration(obbOf(f), zone) > 0.01) problems.push(`${bp.id} door ${d.id}: ${f.name} lies in the 0.7 m in front of it`);
    }
  }
  report(problems, 'placement problems');
});

test('budgets: at most 72 garments and 11000 triangles a building, 12 a bedroom; an interior already near its limit gets none', () => {
  // the brief's numbers, written out here: loosening one in garments.js is a red test, not a quiet change (the interior's own limit leaves a tenth for the estimate's error: the page's cap is 100000)
  assert.deepEqual(LIMITS, { building: 72, tris: 11000, interior: 90000 });
  assert.deepEqual(Object.fromEntries(Object.entries(CLASS).map(([k, v]) => [k, v.cap])), { bedroom: 12, bathroom: 5, living: 3, kitchen: 2 });
  const problems = [];
  let total = 0, tris = 0;
  for (const bp of bps) {
    const g = bp.interior.garments, recs = garmentsOf(bp);
    const t = recs.reduce((n, f) => n + GARMENTS[catalogOf(f).garment][catalogOf(f).state][3], 0);
    total += recs.length; tris += t;
    if (recs.length !== g.garments || t !== g.tris) problems.push(`${bp.id}: the pass counted ${g.garments} garments / ${g.tris} triangles, the records hold ${recs.length} / ${t}`);
    if (recs.length > LIMITS.building) problems.push(`${bp.id}: ${recs.length} garments (limit ${LIMITS.building})`);
    if (t > LIMITS.tris) problems.push(`${bp.id}: ${t} garment triangles (limit ${LIMITS.tris})`);
    if (recs.length && g.est + t > LIMITS.interior) problems.push(`${bp.id}: ${g.est} + ${t} estimated triangles in one interior (limit ${LIMITS.interior})`);
    if (g.est >= LIMITS.interior && recs.length) problems.push(`${bp.id}: an interior of ${g.est} triangles was given ${recs.length} garments`);
    for (const [rid, r] of Object.entries(g.rooms)) {
      const cap = r.cls ? CLASS[r.cls].cap : 8, n = recs.filter((f) => f.room === rid).length;
      if (n > cap || n !== r.garments) problems.push(`${bp.id} ${rid}: ${n} garments (cap ${cap}, the pass counted ${r.garments})`);
    }
  }
  console.log(`# garments: ${total} in the world, ${tris} LOD triangles (${(tris / Math.max(1, total)).toFixed(0)} each), heaviest building ${Math.max(...bps.map((b) => b.interior.garments.tris))}`);
  report(problems, 'budget problems');
  assert.ok(bps.some((b) => b.interior.garments.est >= LIMITS.interior), 'no real interior is near its limit: the test of the rule has nothing to hold');
});

// ---------------------------------------------------------------- the models: from the GLBs, and without them
const gltfs = new GLTFLoader();
const stub = new Map();
ctx.mat = (key) => { let m = stub.get(key); if (!m) stub.set(key, m = { name: key, isMaterial: true, userData: {}, dispose() {} }); return m; };
const requested = [];                                                                            // every file the last boot() asked the asset loader for
/** Load the models the way the page does (index.js: the furniture's and the clothes', two loads and two sets); `steps` runs only some of them, in that order ('page' is index.js's own entry, 'pageClothes' its
 *  clothes load alone: main.js's `?lazy=1` boot calls that one; 'clothes' is build.js's own, which asks for the adult and child libraries unless told otherwise). */
async function boot(withGarments, steps = ['page']) {
  ctx.assets.entries.clear(); ctx.assets.loaded.clear(); requested.length = 0;
  ctx.interiorGlb = ctx.garmentGlb = undefined;                                                  // a context nothing has loaded into yet
  await ctx.assets.init((p) => JSON.parse(readFileSync(join(MODELS, p), 'utf8')));
  ctx.assets.load = (path) => new Promise((ok, no) => {
    requested.push(path);
    if (!withGarments && isGarmentFile(path)) return no(new Error('404 ' + path));              // neither size set is there: what the page's fetch would say
    const b = readFileSync(join(MODELS, path));
    gltfs.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', (g) => { g.scene.updateMatrixWorld(true); ctx.assets.loaded.set(path, g); ok(g); }, no);
  });
  const before = (ctx.errors ?? []).length, warn = console.warn;
  console.warn = () => {};                                                                       // (assets.preload logs each file it could not load)
  const loads = { furniture: loadInteriorAssets, clothes: loadGarmentAssets, page: pageLoad, pageClothes };
  try { for (const s of steps) await loads[s](ctx); } finally { console.warn = warn; }
  return (ctx.errors ?? []).slice(before);
}
const trisOf = (id) => (ctx.batch.groups.get(id)?.meshes ?? []).reduce((n, m) => n + m.geometry.index.count / 3, 0);
const drop = (id) => { const g = ctx.batch.groups.get(id); if (!g) return; for (const m of g.meshes) m.geometry?.dispose?.(); g.obj.removeFromParent?.(); ctx.batch.groups.delete(id); };     // (a hundred big interiors would stay in memory)
let seq = 0;
/** Build a building's interior as it is, and again without its garment records (copies under fresh ids: a batch group keeps every mesh ever built into it). */
function builtWithAndWithout(bp) {
  const full = { ...bp, id: `${bp.id}-full${seq++}` }, plain = { ...bp, id: `${bp.id}-plain${seq++}`, furniture: bp.furniture.filter((f) => !isGarment(f)) };
  buildInterior(ctx, full);
  const st = { ...bp.interior.stats };
  buildInterior(ctx, plain);
  const out = { st, withG: trisOf(`${full.id}.int`), without: trisOf(`${plain.id}.int`) };
  drop(`${full.id}.int`); drop(`${plain.id}.int`);
  return out;
}
const sample = () => bps.filter((b) => b.interior.garments.garments >= 6).slice(0, 6);
const INTERIOR_CAP = 100000;                                                                     // the brief's cap on one interior's triangles

test('with the library\'s files: every garment loads and draws from its LOD model, its triangles are the ones the data counts, and no interior goes over 100000 because of its clothes', async () => {
  const errors = await boot(true);
  report(errors.map((e) => e.message), 'errors while loading the models');
  report(ALL_GARMENT_KEYS.filter((k) => !ctx.garmentGlb.has(k)), 'garment keys that did not load (the page loads the adult, child and teen libraries)');
  const problems = [];
  const dressed = bps.filter((b) => b.interior.garments.garments > 0);
  assert.ok(dressed.length >= 60, `${dressed.length} buildings with clothes`);
  let most = 0, heaviest = '';
  for (const bp of dressed) {
    const r = builtWithAndWithout(bp), g = bp.interior.garments;
    if (r.st.failed) problems.push(`${bp.id}: ${r.st.failed} records failed to draw`);
    if (r.withG - r.without !== g.tris) problems.push(`${bp.id}: the garments draw ${r.withG - r.without} triangles, the pass counted ${g.tris}`);
    if (r.withG > INTERIOR_CAP && r.without <= INTERIOR_CAP) problems.push(`${bp.id}: ${r.without} triangles, ${r.withG} with its clothes (the cap is ${INTERIOR_CAP})`);
    if (r.withG > most) { most = r.withG; heaviest = bp.id; }
  }
  console.log(`# garments: ${dressed.length} dressed interiors built from the GLBs; the busiest has ${most} triangles with its clothes (${heaviest})`);
  report(problems, 'garment drawing problems');
  report((ctx.errors ?? []).filter((e) => e.stage === 'interiors' && !/^atlas/.test(e.message)).map((e) => `${e.name}: ${e.message}`), 'interior build errors');
});

test('without the library\'s files: the game still boots, and every garment is drawn as a patch of cloth', async () => {
  const errors = await boot(false);
  report(errors.map((e) => e.message), 'errors while loading without the garment files (a missing model is a stand-in, not an error)');
  assert.equal(ALL_GARMENT_KEYS.filter((k) => ctx.garmentGlb.has(k)).length, 0, 'a garment key loaded although its files are absent');
  assert.ok(ctx.interiorGlb.has('bed_single') || ctx.interiorGlb.size > 20, 'the furniture models should still load');
  const problems = [];
  for (const bp of sample()) {
    const r = builtWithAndWithout(bp), g = bp.interior.garments;
    if (r.st.failed) problems.push(`${bp.id}: ${r.st.failed} records failed to draw`);
    if (r.withG - r.without < 2 * g.garments) problems.push(`${bp.id}: ${g.garments} garments add only ${r.withG - r.without} triangles of stand-in`);
  }
  report(problems, 'stand-in drawing problems');
  report((ctx.errors ?? []).filter((e) => e.stage === 'interiors' && !/^atlas/.test(e.message)).map((e) => `${e.name}: ${e.message}`), 'interior build errors');
  await boot(true);
});

// ---------------------------------------------------------------- the furniture library's view
// tools/blender/furn_validate.mjs hashes JSON.stringify(CATALOG) into assets/models/manifest.furniture.json and wants a Blender model for every Object.keys(CATALOG);
// tests/furniture-runtime.test.mjs and furniture-world.test.mjs count ctx.interiorGlb against those keys and every request the furniture load makes.
test('the clothes are invisible to the furniture pipeline: not in the keys it lists, not in the catalogue it hashes, not a property of the pieces it sizes', () => {
  const man = JSON.parse(readFileSync(join(MODELS, 'manifest.furniture.json'), 'utf8')), keys = Object.keys(CATALOG);
  assert.equal(createHash('sha256').update(JSON.stringify(CATALOG)).digest('hex'), man.generator.catalogSha256, 'the catalogue the pipeline hashes is not the one the furniture models were made from: something the clothes add shows in Object.keys or JSON.stringify');
  const shown = ALL_GARMENT_KEYS.filter((k) => keys.includes(k) || !CATALOG[k]);
  assert.equal(shown.length, 0, `${shown.length} garment keys enumerable, or not reachable as CATALOG[key]: ${shown.slice(0, 4)}`);
  assert.ok(!keys.some((k) => CATALOG[k].garment || CATALOG[k].arch === 'garment'), 'a garment piece among the keys');
  for (const k of ['bed_single', 'bed_double', 'chair_plastic']) {
    assert.ok(typeof CATALOG[k].topAdd === 'number', `${k}: no topAdd for what lies on it`);
    assert.ok(!Object.keys(CATALOG[k]).includes('topAdd') && !JSON.stringify(CATALOG[k]).includes('topAdd'), `${k}: topAdd shows in the piece's own keys`);
  }
});

test('the two loads are apart: the furniture load asks for no garment file and keeps no garment key; the clothes load fills ctx.garmentGlb and leaves ctx.interiorGlb alone; ?garments=0 asks for nothing', async () => {
  const garmentFiles = () => requested.filter(isGarmentFile);
  await boot(true, ['furniture']);
  assert.deepEqual(garmentFiles(), [], 'the furniture load asked for a garment file');
  assert.ok(ctx.interiorGlb.size > 20 && ctx.interiorGlb.has('bed_single'), 'the furniture models should load');
  assert.equal(ctx.garmentGlb?.size ?? 0, 0, 'the furniture load filled the clothes\' set');
  const furniture = [...ctx.interiorGlb].sort();
  await boot(true, ['clothes', 'furniture']);                                                    // the clothes first: their registered keys must not turn into furniture roots when the furniture loads
  assert.deepEqual([...ctx.interiorGlb].sort(), furniture, 'the furniture set is not what the furniture load alone makes');
  assert.equal(ALL_GARMENT_KEYS.filter((k) => ctx.interiorGlb.has(k)).length, 0, 'a garment key in the furniture set');
  // The page loads all three libraries (the loose clothes of a house are drawn from each: garments.js EXTRAS), build.js's own load the adult and child ones unless it is told otherwise.
  const six = [...new Set(assets.map(({ a }) => a.lod.glb))].sort(), nine = [...new Set([...assets, ...teenAssets].map(({ a }) => a.lod.glb))].sort();
  assert.equal(six.length, 6); assert.equal(nine.length, 9);
  assert.deepEqual([...PAGE_GARMENT_SIZES].sort(), Object.keys(GARMENT_FILES).sort(), 'the page loads every library there is');
  await boot(true, ['page']);                                                                    // index.js's entry (main.js calls it) does both, each into its own set
  assert.deepEqual([...ctx.interiorGlb].sort(), furniture, 'the page entry\'s furniture set is not what the furniture load alone makes');
  assert.deepEqual([...ctx.garmentGlb].sort(), [...ALL_GARMENT_KEYS].sort(), 'the page entry did not load the clothes of all three libraries');
  assert.deepEqual(garmentFiles().sort(), nine, 'the page entry asks for the nine LOD files (adult, child, teen; flat, folded, hung) and nothing else');
  await boot(true, ['pageClothes']);                                                             // the clothes alone, as main.js's `?lazy=1` boot asks for them
  assert.deepEqual([...ctx.garmentGlb].sort(), [...ALL_GARMENT_KEYS].sort(), 'the page\'s clothes load did not load all three libraries');
  assert.deepEqual(garmentFiles().sort(), nine, 'the page\'s clothes load asks for the nine LOD files and nothing else');
  assert.equal(ctx.interiorGlb, undefined, 'the page\'s clothes load touched the furniture set');
  const main = readFileSync(join(ROOT, 'js', 'main.js'), 'utf8');
  assert.match(main, /import \{[^}]*\bloadGarmentAssets\b[^}]*\} from '\.\/interiors\/index\.js'/, 'main.js takes its clothes load from the interiors entry (index.js), which asks for the three libraries; build.js\'s asks for two');
  assert.doesNotMatch(main, /interiors\/build\.js/, 'main.js reaches past the interiors entry into build.js');
  await boot(true, ['clothes']);
  assert.deepEqual(garmentFiles().sort(), six, 'the clothes load asks for all six adult/child LOD files and nothing else');
  assert.deepEqual([...ctx.garmentGlb].sort(), [...GARMENT_KEYS].sort(), 'every garment key, and only those, loaded');
  ctx.assets.loaded.clear(); ctx.assets.load = (path) => Promise.reject(new Error('404 ' + path));      // a retry is a fresh load: files that are gone now leave their keys on the stand-ins
  const warn = console.warn; console.warn = () => {};
  try { await loadGarmentAssets(ctx); } finally { console.warn = warn; }
  assert.equal(ctx.garmentGlb.size, 0, 'a retry kept the clothes of the load before');
  globalThis.__noGarments = true;
  try { await boot(true, ['clothes']); } finally { delete globalThis.__noGarments; }
  assert.deepEqual(garmentFiles(), [], 'the clothes are switched off and a garment file was asked for');
  assert.equal(ctx.garmentGlb.size, 0);
  assert.equal(GARMENT_KEYS.filter((k) => ctx.assets.has(k)).length, 0, 'the clothes are switched off and their keys were registered');
  globalThis.__noGarments = true;
  try { await boot(true, ['page']); } finally { delete globalThis.__noGarments; }
  assert.deepEqual(garmentFiles(), [], 'the clothes are switched off and the page entry asked for a garment file');
  assert.equal(ALL_GARMENT_KEYS.filter((k) => ctx.assets.has(k)).length, 0, 'the clothes are switched off and the page entry registered their keys');
  await boot(true);
});
