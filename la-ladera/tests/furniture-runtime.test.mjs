// Runtime proof: parse the checked-in Blender files with the actual vendored GLTFLoader,
// then feed them through the same batched interior renderer used by the page.
// Run: node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/furniture-runtime.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createContext } from '../js/core/ctx.js';
import { makeFrame } from '../js/core/frame.js';
import { CATALOG } from '../js/interiors/catalog.js';
import { loadInteriorAssets, glbParts, buildInterior } from '../js/interiors/build.js';
import { drawStandin, tintFor } from '../js/interiors/standins.js';
import { MeshBuilder } from '../js/core/mesh.js';
import { furnishedBatch } from './interiors-lib.mjs';
import { readAssetJson } from './headless.mjs';

let serial = 0;
const near = (a, b, label = '') => assert.ok(Math.abs(a - b) < 2e-5, `${label}: ${a} != ${b}`);
const ctxNew = () => createContext({ headless: true });
function triangle(marker = 0, color = null) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([marker, 0, 0, marker + 0.2, 0, 0, marker, 0.3, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0.2, 0, 0, 0.3], 2));
  if (color) g.setAttribute('color', new THREE.Float32BufferAttribute([...color, ...color, ...color], 3));
  g.setIndex([0, 1, 2]);
  return g;
}
function fixture(ctx, name = 'chair_plastic', specifications = [{ flags: [], marker: 0 }]) {
  const scene = new THREE.Group(), node = new THREE.Group(); node.name = name; scene.add(node);
  specifications.forEach(({ flags = [], marker = 0, color, material = 'plastic_solid', geometry }, i) => {
    const mat = new THREE.MeshStandardMaterial(); mat.name = material;
    const mesh = new THREE.Mesh(geometry ?? triangle(marker, color), mat);
    mesh.name = [name, ...flags, i].join('-'); node.add(mesh);
  });
  scene.updateMatrixWorld(true);
  ctx.assets.entries.set(name, { name, node: name, glb: 'fixture.glb', ...CATALOG[name] });
  ctx.assets.loaded.set('fixture.glb', { scene }); ctx.interiorGlb = new Set([name]);
  return node;
}
function render(ctx, rec, lot = {}) {
  const id = `runtime-${++serial}`, bp = {
    id, lot, frame: makeFrame(lot.x ?? 0, lot.y ?? 0, lot.z ?? 0, lot.rotY ?? 0),
    furniture: [{ id: 'stable-record', name: 'chair_plastic', x: 0, y: 0, z: 0, ry: 0, kind: 'floor', ...rec }],
    rooms: [], windows: [], interior: {},
  };
  buildInterior(ctx, bp);
  return { bp, stats: bp.interior.stats, group: ctx.batch.groups.get(`${id}.int`) };
}
const rawPositions = (group) => group.meshes.flatMap((m) => Array.from(m.geometry.attributes.position.array));

test('checked-in GLBs load as real furniture and render in furnished buildings', async () => {
  const ctx = ctxNew(), requests = [];
  await ctx.assets.init(readAssetJson);
  const names = ctx.assets.names().filter((n) => CATALOG[n]);
  assert.ok(names.length >= 120, `furniture manifest has ${names.length} assets; >= 120 required`);
  const parser = new GLTFLoader();
  ctx.assets.loader.loadAsync = async (path) => {
    requests.push(path);
    const bytes = await readFile(new URL('../' + path.replace(/^\.\//, ''), import.meta.url));
    return parser.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  };
  await loadInteriorAssets(ctx);
  assert.equal(ctx.interiorGlb.size, names.length, 'every declared furniture root must load');
  assert.equal(requests.length, new Set(names.map((n) => ctx.assets.meta(n).glb)).size, 'one load per shared GLB');
  for (const name of names) assert.ok(glbParts(ctx, name).length, `${name} has no drawable parts`);

  // Real furnishing records, rather than artificial manifest counters, must take the GLB branch.
  const { bps } = await furnishedBatch({ n: 3 });
  let records = 0, drawn = 0;
  for (const bp of bps) {
    buildInterior(ctx, bp);
    const expected = bp.furniture.filter((r) => !r.decal && names.includes(r.name)).length;
    assert.equal(bp.interior.stats.glb, expected, `${bp.id}: model records silently fell back`);
    assert.equal(bp.interior.stats.failed, 0);
    records += bp.furniture.length; drawn += expected;
    for (const m of ctx.batch.groups.get(`${bp.id}.int`).meshes) {
      assert.equal(m.material, ctx.mat(m.userData.matKey), 'rebind exported material names to the shared material library');
      assert.notEqual(m.userData.matKey, 'missing_asset');
    }
  }
  assert.ok(drawn > 30, `only ${drawn} furniture records used GLBs`);
  assert.deepEqual(ctx.errors, []);
  console.log(`# actual furniture runtime: ${names.length} roots, ${requests.length} files; ${drawn}/${records} records use GLBs in three furnished buildings (decals retain procedural drawing)`);
});

test('a missing model file keeps the complete procedural record', async () => {
  const ctx = ctxNew();
  fixture(ctx); ctx.assets.loaded.clear();
  ctx.assets.loader.loadAsync = async () => { throw new Error('test: missing GLB'); };
  const warnings = [], warn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try { await loadInteriorAssets(ctx); } finally { console.warn = warn; }
  assert.equal(warnings.length, 1);
  assert.equal(ctx.interiorGlb.size, 0);
  const { stats, group } = render(ctx);
  assert.equal(stats.glb, 0); assert.equal(stats.standin, 1); assert.equal(stats.failed, 0);
  const reference = new MeshBuilder();
  drawStandin(reference, { id: 'stable-record', x: 0, y: 0, z: 0, ry: 0, kind: 'floor' }, CATALOG.chair_plastic);
  assert.equal(stats.tris, reference.tris, 'fallback is the full chair, not a placeholder cube');
  assert.ok(group.meshes.length);
});

test('a failed shared-file load can be retried and concurrent loads stay deduplicated', async () => {
  const ctx = ctxNew(); let calls = 0;
  ctx.assets.loader.loadAsync = async () => {
    calls++;
    if (calls === 1) throw new Error('test: transient download failure');
    return { scene: new THREE.Group() };
  };
  await assert.rejects(ctx.assets.load('retry.glb'), /transient/);
  const a = ctx.assets.load('retry.glb'), b = ctx.assets.load('retry.glb');
  assert.equal(a, b);
  const loaded = await a;
  assert.equal(calls, 2); assert.equal(ctx.assets.loaded.get('retry.glb'), loaded);
  assert.equal(await ctx.assets.load('retry.glb'), loaded); assert.equal(calls, 2);
});

test('missing named roots do not count as integrated and do not poison a later load', async () => {
  const ctx = ctxNew(), node = fixture(ctx); node.name = 'wrong_name';
  ctx.assets.preload = async () => {};
  await loadInteriorAssets(ctx);
  assert.equal(ctx.interiorGlb.size, 0);
  assert.equal(render(ctx).stats.standin, 1);
  node.name = 'chair_plastic';
  await loadInteriorAssets(ctx);
  assert.deepEqual([...ctx.interiorGlb], ['chair_plastic']);
  assert.equal(render(ctx).stats.glb, 1);
});

test('an invalid second mesh falls back without leaving a partial model in the batch', () => {
  const ctx = ctxNew(), broken = triangle(); broken.attributes.position.setX(1, NaN);
  fixture(ctx, 'chair_plastic', [{ marker: 10 }, { geometry: broken }]);
  const { stats, group } = render(ctx);
  assert.equal(stats.glb, 0); assert.equal(stats.standin, 1); assert.equal(stats.failed, 0);
  assert.equal(ctx.errors.length, 1); assert.match(ctx.errors[0].message, /model fallback.*non-finite/);
  assert.ok(rawPositions(group).every(Number.isFinite));
  assert.ok(rawPositions(group).every((v) => Math.abs(v) < 2), 'partial marker mesh leaked into the fallback');
});

test('an unknown exported material falls back before missing-material magenta can render', async () => {
  const ctx = ctxNew(); fixture(ctx, 'chair_plastic', [{ material: 'absent_from_material_library' }]);
  ctx.assets.preload = async () => {};
  await loadInteriorAssets(ctx);
  assert.equal(ctx.interiorGlb.size, 0);
  assert.equal(ctx.errors.length, 1); assert.match(ctx.errors[0].message, /unknown material/);
  const { stats, group } = render(ctx);
  assert.equal(stats.standin, 1);
  assert.ok(group.meshes.every((m) => m.userData.matKey !== 'missing_asset'));
});

test('made/unmade, magnets and independent variation channels select only their intended parts', () => {
  const ctx = ctxNew();
  fixture(ctx, 'bed_single', [
    { marker: 0 }, { marker: 10, flags: ['made'] }, { marker: 20, flags: ['unmade'] },
    { marker: 30, flags: ['magnets'] }, { marker: 40, flags: ['pa0'] }, { marker: 50, flags: ['pa1'] },
    { marker: 60, flags: ['pb0'] }, { marker: 70, flags: ['pb1'] },
  ]);
  const get = (flags) => {
    const result = render(ctx, { name: 'bed_single', flags });
    return { result, markers: rawPositions(result.group).filter((_, i) => i % 9 === 0) };
  };
  const made = get({}), unmade = get({ unmade: true, magnets: true }), repeat = get({});
  assert.equal(made.result.stats.prims, 4); assert.equal(unmade.result.stats.prims, 5);
  assert.ok(made.markers.includes(10) && !made.markers.includes(20) && !made.markers.includes(30));
  assert.ok(unmade.markers.includes(20) && unmade.markers.includes(30) && !unmade.markers.includes(10));
  assert.equal(made.markers.filter((n) => n === 40 || n === 50).length, 1);
  assert.equal(made.markers.filter((n) => n === 60 || n === 70).length, 1);
  assert.deepEqual(made.markers, repeat.markers, 'variants must be stable for a record id');
});

test('tints multiply linear vertex shades without changing the shared GLB or another instance', () => {
  const ctx = ctxNew(), shade = [0.5, 0.25, 0.75];
  const node = fixture(ctx, 'chair_plastic', [{ color: shade, flags: ['tint'] }]);
  const source = Array.from(node.children[0].geometry.attributes.color.array);
  const a = render(ctx, { tint: 0xff8040 }), b = render(ctx, { tint: 0x4080ff });
  const ca = a.group.meshes[0].geometry.attributes.color, cb = b.group.meshes[0].geometry.attributes.color;
  const ta = new THREE.Color(tintFor(CATALOG.chair_plastic, 0xff8040)), tb = new THREE.Color(0x4080ff);
  for (let i = 0; i < 3; i++) {
    near(ca.getComponent(0, i), shade[i] * [ta.r, ta.g, ta.b][i]);
    near(cb.getComponent(0, i), shade[i] * [tb.r, tb.g, tb.b][i]);
  }
  assert.deepEqual(Array.from(node.children[0].geometry.attributes.color.array), source);
  assert.deepEqual(Array.from(glbParts(ctx, 'chair_plastic')[0].geometry.attributes.color.array), source);
  assert.equal(glbParts(ctx, 'chair_plastic')[0].tinted.size, 2);
});

test('asset hierarchy transforms, record rotation and building frame compose once', () => {
  const ctx = ctxNew(), node = fixture(ctx);
  node.position.set(70, 80, 90); node.rotation.y = 0.4; node.children[0].position.set(0.25, 0.1, -0.2);
  const lot = { x: 11, y: 4, z: -8, rotY: 0.7 };
  const { group } = render(ctx, { x: 2, y: 1, z: -3, ry: 1.2 }, lot);
  const expected = new THREE.Vector3(0.25, 0.1, -0.2)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), 1.2).add(new THREE.Vector3(2, 1, -3))
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.7).add(new THREE.Vector3(11, 4, -8));
  const p = group.meshes[0].geometry.attributes.position;
  near(p.getX(0), expected.x); near(p.getY(0), expected.y); near(p.getZ(0), expected.z);
});

test('wall stretch and ceiling offsets preserve the source model origins', () => {
  const wall = ctxNew(); fixture(wall, 'clothesline');
  const c = CATALOG.clothesline;
  const { group } = render(wall, { name: 'clothesline', kind: 'wall', x: 1, y: 2, z: 3, w: c.size[0] * 2, h: c.size[1] * 3 });
  const p = group.meshes[0].geometry.attributes.position;
  near(p.getX(0), 1); near(p.getZ(0), 3); near(p.getX(1), 1.4); near(p.getY(2), 2.9);
  const ceiling = ctxNew(); fixture(ceiling, 'bulb_bare');
  const g = render(ceiling, { name: 'bulb_bare', kind: 'ceil', y: 2.8 }).group.meshes[0].geometry;
  near(g.attributes.position.getY(0), 2.8 - CATALOG.bulb_bare.size[1]);
});
