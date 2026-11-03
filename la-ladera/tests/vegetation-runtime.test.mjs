import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createContext } from '../js/core/ctx.js';
import { Rng } from '../js/core/rng.js';
import { VegetationLibrary, PROCEDURAL_KEEP, vegetationBuilder, vegetationLOD, prepareVegetationGeometry, patchVegetationWind, initVegetation, plantClearOfFurniture, VEGETATION_BUDGET } from '../js/world/vegetation.js';
import * as flora from '../js/world/flora.js';

function geometry(triangles = 12) {
  const g = new THREE.BoxGeometry(1, 2, 1).toNonIndexed(), p = g.getAttribute('position'), c = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) c.set([.3, .6, .2, p.getY(i) > 0 ? 1 : 0], i * 4);
  g.setAttribute('color', new THREE.BufferAttribute(c, 4));
  const idx = new Uint16Array(triangles * 3); for (let i = 0; i < idx.length; i++) idx[i] = i % p.count;
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.translate(0, 1, 0); g.computeBoundingBox(); return g;
}
function context() {
  const ctx = createContext({ headless: true }); ctx.world = {};
  ctx.camera = new THREE.PerspectiveCamera(70, 1.6, .1, 2000); ctx.camera.position.set(0, 2, 0); ctx.camera.lookAt(0, 2, -100); ctx.camera.updateMatrixWorld();
  const mats = new Map(); ctx.mat = (key) => { if (!mats.has(key)) { const m = new THREE.MeshStandardMaterial({ vertexColors: true }); m.name = key; mats.set(key, m); } return mats.get(key); };
  return ctx;
}
function addFamily(lib, species, counts) {
  const levels = counts.map((triangles, lod) => ({ triangles, key: lod === 3 ? 'flora_billboard' : 'flora_vertex', geometry: prepareVegetationGeometry(geometry(triangles)) }));
  const box = levels[0].geometry.boundingBox.clone(); lib.species.set(species, { levels, box, size: box.getSize(new THREE.Vector3()) });
}

test('RGBA wind is separated from albedo without making rigid roots or pots transparent', () => {
  const source = geometry(), g = prepareVegetationGeometry(source);
  assert.equal(source.getAttribute('color').itemSize, 4); assert.equal(g.getAttribute('color').itemSize, 3);
  const wind = [...g.getAttribute('windWeight').array]; assert.ok(wind.includes(0)); assert.ok(wind.includes(1)); assert.ok(Math.abs(g.getAttribute('color').getY(0) - .6) < 1e-6);
  const missing = geometry(); missing.deleteAttribute('color'); assert.throws(() => prepareVegetationGeometry(missing), /RGBA/);
  const bad = geometry(); bad.getAttribute('color').setW(0, NaN); assert.throws(() => prepareVegetationGeometry(bad), /outside/);
});

test('distance LODs have hysteresis, cull small plants and retain far-tree billboards', () => {
  assert.deepEqual([1, 20, 50, 150].map((d) => vegetationLOD('almendro', d)), [0, 1, 2, 3]);
  assert.equal(vegetationLOD('almendro', 14, 0), 0); assert.equal(vegetationLOD('almendro', 15, 0), 1);
  assert.equal(vegetationLOD('almendro', 12, 1), 1); assert.equal(vegetationLOD('almendro', 10, 1), 0);
  assert.equal(vegetationLOD('palm', 1, -1, true), 3);
  assert.deepEqual([1, 8, 18, 30].map((d) => vegetationLOD('wild_grass', d)), [0, 1, 2, -1]);
  assert.equal(vegetationLOD('window_box', 50), -1);
});

test('wind shaders preserve the inherited fog hook and share deformation with shadows', () => {
  const time = { value: 3 }, material = new THREE.MeshStandardMaterial(), depth = new THREE.MeshDepthMaterial(); let inherited = 0;
  material.onBeforeCompile = (shader) => { inherited++; shader.uniforms.fogSentinel = { value: 7 }; };
  patchVegetationWind(material, time); const hook = material.onBeforeCompile; patchVegetationWind(material, time); assert.equal(material.onBeforeCompile, hook);
  patchVegetationWind(depth, time);
  const compile = (m) => { const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '' }; m.onBeforeCompile(sh); return sh; };
  const a = compile(material), b = compile(depth); assert.equal(inherited, 1); assert.equal(a.uniforms.fogSentinel.value, 7);
  assert.equal(a.uniforms.vegTime, time); assert.equal(b.uniforms.vegTime, time); assert.equal(a.vertexShader, b.vertexShader); assert.match(a.vertexShader, /windWeight/); assert.match(a.vertexShader, /instanceMatrix/);
});

test('dense tree populations cannot exceed the main-pass budget or six detailed shadow casters', () => {
  const ctx = context(), lib = new VegetationLibrary(ctx); addFamily(lib, 'almendro', [2144, 592, 116, 2]);
  for (let i = 0; i < 600; i++) lib.place('almendro', (i % 9 - 4) * .45, 0, -2 - Math.floor(i / 9) * .45);
  lib.finalize(); const stats = lib.stats();
  assert.equal(stats.population, 600); assert.ok(stats.instances > 50); assert.ok(stats.triangles <= VEGETATION_BUDGET);
  assert.ok(stats.lods[0] <= 6); assert.ok(stats.lods[1] <= 16); assert.ok(stats.shadowTriangles <= 6 * 2144);
  assert.ok(stats.lods[3] > 0, 'budget pressure must reach billboards'); assert.ok(stats.draws <= 4);
  assert.equal([...lib.batches.values()].reduce((n, b) => n + b.mesh.count * b.triangles, 0), stats.triangles);
});

test('projection changes invalidate visibility even while the camera stays still', () => {
  const ctx = context(); ctx.camera.fov = 30; ctx.camera.aspect = 1; ctx.camera.updateProjectionMatrix();
  const lib = new VegetationLibrary(ctx); addFamily(lib, 'almendro', [2144, 592, 116, 2]); lib.place('almendro', 12, 0, -20); lib.finalize();
  assert.equal(lib.stats().instances, 0); const before = ctx.camera.position.clone();
  ctx.camera.fov = 110; ctx.camera.updateProjectionMatrix(); lib.update();
  assert.ok(ctx.camera.position.equals(before)); assert.equal(lib.stats().instances, 1);
});

test('each existing procedural helper preserves RNG, colliders and occupancy when its visuals are replaced', () => {
  const calls = [
    ['broadTree', (K, r) => flora.broadTree(K, 4, 7, { rng: r })], ['eucalyptus', (K, r) => flora.eucalyptus(K, 4, 7, { rng: r })],
    ['palm', (K, r) => flora.palm(K, 4, 7, { rng: r })], ['cypress', (K, r) => flora.cypress(K, 4, 7, { rng: r })],
    ['banana', (K, r) => flora.banana(K, 4, 7, { rng: r })], ['shrub', (K, r) => flora.shrub(K, 4, 7, { rng: r })],
    ['flowers', (K, r) => flora.shrub(K, 4, 7, { rng: r, flowers: true })], ['agave', (K, r) => flora.agave(K, 4, 7, { rng: r })],
    ['tuft', (K, r) => flora.tuft(K, 4, 7, r)], ['pottedPlant', (K, r) => flora.pottedPlant(K, 4, 7, r)],
    ['drape', (K, r) => flora.drape(K, Array.from({ length: 24 }, (_, i) => ({ x: i * 2, z: 7, nx: 0, nz: 1, y: 4 })), r)],
  ];
  function run(fn, models) {
    const r = new Rng(317), posts = [], taken = [], placed = [], acc = { pos: { length: 0 }, idx: { push() {} } };
    const b = { tris: 0, _acc: () => acc, vert: () => { const n = acc.pos.length / 3; acc.pos.length += 3; return n; } };
    const K = { H: () => 2, atlas: null, b: () => b, post: (...a) => posts.push(a), occ: { take: (...a) => taken.push(a) }, rng: (s) => new Rng(17).fork(s) };
    if (models) K.vegetation = { has: () => true, place: (...a) => { placed.push(a); return true; } };
    fn(K, r); return { next: r.next(), posts, taken, placed, vertices: acc.pos.length };
  }
  for (const [name, fn] of calls) {
    const a = run(fn, false), b = run(fn, true); assert.equal(a.next, b.next, name + ' RNG'); assert.deepEqual(a.posts, b.posts, name + ' colliders'); assert.deepEqual(a.taken, b.taken, name + ' occupancy');
    assert.ok(a.vertices > 0, name + ' procedural fallback emitted no geometry'); assert.equal(b.vertices, 0, name + ' procedural geometry was drawn twice'); assert.ok(b.placed.length > 0, name + ' never used the library');
  }
});

test('mixed mode keeps the procedural builders for the species where main is richer, and ?vegetation=full swaps every one', async () => {
  const mk = (keep) => { const placed = [], mark = { id: 'procedural' }, K = { b: () => mark, vegetation: { keep, place: (sp) => { placed.push(sp); return true; } } }; return { K, placed, mark }; };
  for (const sp of PROCEDURAL_KEEP) { const { K, placed, mark } = mk(PROCEDURAL_KEEP); assert.equal(vegetationBuilder(K, sp, 0, 0, 0, {}), mark, sp + ' must stay procedural'); assert.deepEqual(placed, [], sp + ' must not be queued'); }
  for (const sp of ['palm', 'banana', 'leafy_shrub', 'flower_bed', 'bougainvillea', 'potted_fern']) { const { K, placed, mark } = mk(PROCEDURAL_KEEP); assert.notEqual(vegetationBuilder(K, sp, 0, 0, 0, {}), mark, sp + ' must use the library'); assert.deepEqual(placed, [sp]); }
  const { K, placed, mark } = mk(new Set()); assert.notEqual(vegetationBuilder(K, 'almendro', 0, 0, 0, {}), mark); assert.deepEqual(placed, ['almendro']);
  // initVegetation wires it from the page option: mixed (the default) keeps the set, full empties it
  const ctxFor = (vegetation) => { const ctx = context(); ctx.opts.headless = false; ctx.opts.vegetation = vegetation; ctx.assets = { names: () => ['x'], meta: () => ({ species: 'almendro', lod: 0, glb: 'g', node: 'n' }), load: async () => { throw new Error('no file'); }, loaded: new Map(), root: '' }; return ctx; };
  const mixed = await initVegetation({ ctx: ctxFor('mixed'), b: () => null }), full = await initVegetation({ ctx: ctxFor('full'), b: () => null });
  assert.equal(mixed.keep, PROCEDURAL_KEEP); assert.equal(full.keep.size, 0);
});

test('data-only and explicitly procedural modes perform no model fetch', async () => {
  for (const opts of [{ headless: true }, { vegetation: 'procedural' }]) {
    const ctx = createContext(opts); ctx.world = {}; ctx.assets.names = () => { throw new Error('manifest read despite forced fallback'); }; ctx.assets.load = () => { throw new Error('unexpected model fetch'); };
    assert.equal(await initVegetation({ ctx }), null); assert.equal(ctx.world.vegetation.mode, 'procedural');
  }
});

test('an incomplete loaded species falls back without disabling a complete neighbouring species', async () => {
  const ctx = context(), entries = [], files = new Map();
  for (const species of ['window_box', 'potted_fern']) {
    const scene = new THREE.Group(), glb = 'vegetation/' + species + '.glb';
    for (let lod = 0; lod < 3; lod++) {
      const node = 'veg_' + species + '_lod' + lod; entries.push({ name: node, node, glb, species, lod, tags: ['vegetation', 'plant'] });
      if (species === 'potted_fern' && lod === 2) continue;
      const material = new THREE.MeshStandardMaterial(); material.name = 'flora_vertex'; const mesh = new THREE.Mesh(geometry(), material); mesh.name = node; scene.add(mesh);
    }
    scene.updateMatrixWorld(); files.set(glb, { scene });
  }
  ctx.assets = { names: () => entries.map((e) => e.name), meta: (n) => entries.find((e) => e.name === n), loaded: new Map(), async load(p) { this.loaded.set(p, files.get(p)); return files.get(p); } };
  const lib = await new VegetationLibrary(ctx).load(); assert.equal(lib.has('window_box'), true); assert.equal(lib.has('potted_fern'), false); assert.ok(lib.failed.includes('potted_fern'));
  assert.equal(lib.place('potted_fern', 0, 0, 0), false); assert.equal(lib.place('window_box', 0, 0, 0), true);
});

test('terrace pots clear the full footprint of existing floor furniture, including rotated racks', () => {
  const rack = { room: 'roof', kind: 'floor', x: 3, z: -2, w: 2, d: .4, ry: 0 };
  assert.equal(plantClearOfFurniture([rack], 'roof', 3, -2), false); assert.equal(plantClearOfFurniture([rack], 'roof', 4.2, -2), false); assert.equal(plantClearOfFurniture([rack], 'roof', 4.4, -2), true);
  rack.ry = Math.PI / 4; const c = Math.cos(rack.ry), s = Math.sin(rack.ry), point = (x, z) => [rack.x + x * c + z * s, rack.z - x * s + z * c];
  assert.equal(plantClearOfFurniture([rack], 'roof', ...point(.9, 0)), false); assert.equal(plantClearOfFurniture([rack], 'roof', ...point(0, .45)), false); assert.equal(plantClearOfFurniture([rack], 'roof', ...point(0, .6)), true);
});

test('terrace pot clearance applies only to floor furniture in the same room', () => {
  const f = { room: 'roof', kind: 'floor', x: 1, z: 2, w: 1, d: 1, ry: 0 };
  assert.equal(plantClearOfFurniture([f], 'roof', 1, 2), false); assert.equal(plantClearOfFurniture([f], 'other', 1, 2), true);
  assert.equal(plantClearOfFurniture([{ ...f, kind: 'wall' }], 'roof', 1, 2), true); assert.equal(plantClearOfFurniture([], 'roof', 1, 2), true);
});
