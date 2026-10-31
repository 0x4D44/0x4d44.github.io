// The release gate reads the shipped binary geometry. Fault-injection cases prove a manifest cannot conceal missing or corrupt data.
// node --import ./la-ladera/tests/register.mjs --test --test-reporter=tap la-ladera/tests/goods-assets.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CATALOG } from '../js/interiors/catalog.js';
import { GOODS_CATALOG } from '../js/interiors/goods-catalog.js';
import { GOODS_ASSORTMENTS, GOODS_FIXTURES } from '../js/interiors/goods-assortments.js';
import { goodsAssetReady, planGoodsForFixture } from '../js/interiors/goods.js';
import { buildGoods } from '../js/interiors/goods-render.js';
import { ROOT, GOODS_BUDGET, TRIANGLE_LIMIT, validateGoods, readGoodsGlb, inspectGoodsGlb } from '../tools/blender/goods_validate.mjs';

const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const saveJson = (path, value) => writeFileSync(path, JSON.stringify(value));
const miniDefs = { goods_surface: { tex: false, vertexColors: true } };

/** Encode a modified document without changing its geometry. Used only to inject realistic file defects. */
function encode(g, bin) {
  const raw = Buffer.from(JSON.stringify(g)), j = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 32); raw.copy(j);
  const b = Buffer.alloc(Math.ceil(bin.length / 4) * 4); bin.copy(b);
  const out = Buffer.alloc(12 + 8 + j.length + 8 + b.length);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(j.length, 12); out.writeUInt32LE(0x4e4f534a, 16); j.copy(out, 20);
  const off = 20 + j.length; out.writeUInt32LE(b.length, off); out.writeUInt32LE(0x004e4942, off + 4); b.copy(out, off + 8);
  return out;
}

function miniGlb(triangles = 1) {
  const bin = Buffer.alloc(132 + 6 * triangles), views = [], accessors = [];
  let off = 0;
  const attribute = (values, type, extra = {}) => {
    const start = off;
    for (const v of values) { bin.writeFloatLE(v, off); off += 4; }
    views.push({ buffer: 0, byteOffset: start, byteLength: off - start });
    accessors.push({ bufferView: views.length - 1, componentType: 5126, count: 3, type, ...extra });
    return accessors.length - 1;
  };
  const POSITION = attribute([-.05, 0, 0, .05, 0, 0, 0, .1, 0], 'VEC3', { min: [-.05, 0, 0], max: [.05, .1, 0] });
  const NORMAL = attribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 'VEC3');
  const TEXCOORD_0 = attribute([0, 0, 1, 0, .5, 1], 'VEC2');
  const COLOR_0 = attribute(new Array(9).fill(1), 'VEC3');
  for (let i = 0; i < triangles * 3; i++) bin.writeUInt16LE(i % 3, off + i * 2);
  views.push({ buffer: 0, byteOffset: off, byteLength: triangles * 6 });
  accessors.push({ bufferView: views.length - 1, componentType: 5123, count: triangles * 3, type: 'SCALAR' });
  return encode({ asset: { version: '2.0' }, buffers: [{ byteLength: bin.length }], bufferViews: views, accessors,
    materials: [{ name: 'goods_surface' }], meshes: [{ primitives: [{ attributes: { POSITION, NORMAL, TEXCOORD_0, COLOR_0 }, indices: 4, material: 0 }] }],
    nodes: [{ name: 'goods_test', mesh: 0 }, { name: 'goods_test__lod1', mesh: 0 }], scenes: [{ nodes: [0, 1] }], scene: 0 }, bin);
}

function defect(input, mutate) {
  const { json: g, bin } = readGoodsGlb(input), bytes = Buffer.from(bin); mutate(g, bytes); return encode(g, bytes);
}

async function sandbox(fn) {
  const root = mkdtempSync(join(tmpdir(), 'ladera-goods-test-'));
  const manifest = json(resolve(ROOT, 'assets/models/manifest.goods.json'));
  const files = ['assets/models/manifest.goods.json', 'assets/models/manifest.json', 'assets/textures/manifest.json',
    'js/interiors/goods-catalog.js', 'js/interiors/goods-assortments.js', 'assets/textures/' + manifest.atlas.file,
    ...manifest.files.map((set) => 'assets/models/' + set.glb)];
  for (const file of files) { const target = resolve(root, file); mkdirSync(dirname(target), { recursive: true }); copyFileSync(resolve(ROOT, file), target); }
  writeFileSync(resolve(root, 'package.json'), '{"type":"module"}');
  const check = () => validateGoods({ root, complete: true, catalog: GOODS_CATALOG, assortments: GOODS_ASSORTMENTS, fixtures: GOODS_FIXTURES, fixtureCatalog: CATALOG });
  try { return await fn({ root, manifest, check }); } finally { rmSync(root, { recursive: true, force: true }); }
}

let actualAssets;
async function loadActualAssets() {
  actualAssets ??= (async () => {
    const manifest = json(resolve(ROOT, 'assets/models/manifest.goods.json')), loaded = new Map(), entries = new Map();
    for (const set of manifest.files) {
      const b = readFileSync(resolve(ROOT, 'assets/models', set.glb));
      const gltf = await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
      gltf.scene.updateMatrixWorld(true); loaded.set(set.glb, gltf);
      for (const [key, meta] of Object.entries(set.assets)) entries.set(key, { glb: set.glb, ...meta });
    }
    return { loaded, meta: (key) => entries.get(key) };
  })();
  return actualAssets;
}

test('complete goods release has every real model, LOD and atlas within the inclusive payload budget', async () => {
  const report = await validateGoods({ complete: true });
  assert.equal(report.ok, true, report.errors.join('\n'));
  assert.equal(report.assets, Object.keys(GOODS_CATALOG).length);
  assert.equal(report.lods, report.assets);
  assert.ok(report.maxTriangles < TRIANGLE_LIMIT && report.maxLodTriangles < TRIANGLE_LIMIT);
  assert.ok(report.bytes < GOODS_BUDGET);
  console.log(`# goods: ${report.assets} models + ${report.lods} LODs, ${report.atlas.labels} atlas labels, ${report.bytes} bytes; max ${report.maxTriangles}/${report.maxLodTriangles} triangles`);
});

test('the same shipped GLBs parse in Three.js and supply usable near and far nodes', async () => {
  const ctx = { assets: await loadActualAssets() };
  for (const key of Object.keys(GOODS_CATALOG)) assert.equal(goodsAssetReady(ctx, key), true, `${key}: not usable in the actual runtime loader`);
});

test('real goods batch to at most two room materials and switch near/far/culled at world-relative distances', async () => {
  const materials = new Map(), ctx = { assets: await loadActualAssets(), goodsAssets: { atlasReady: true }, errors: [], mat(key) {
    if (!materials.has(key)) { const m = new THREE.MeshStandardMaterial({ vertexColors: true }); m.name = key; materials.set(key, m); }
    return materials.get(key);
  } };
  const f = { id: 'fixture', name: 'shelf_tienda', room: 'room', x: 3, y: 2.8, z: -4, ry: 0 };
  const bp = { id: 'test-shop', lot: { x: 97, y: 11, z: -61, rotY: 0.71 }, goods: planGoodsForFixture(f, 'tienda') };
  const object = new THREE.Group(), result = buildGoods(ctx, bp, { obj: object });
  assert.deepEqual(ctx.errors, []); assert.equal(result.stats.drawn, bp.goods.length); assert.equal(result.replaced.has(f.id), true);
  assert.equal(result.stats.nearTriangles, bp.goods.reduce((n, p) => n + ctx.assets.meta(p.name).triangles, 0));
  assert.equal(result.stats.farTriangles, bp.goods.reduce((n, p) => n + ctx.assets.meta(p.name).lodTriangles, 0));
  assert.ok(result.stats.nearCalls <= 2 && result.stats.farCalls <= 2 && result.stats.farTriangles < result.stats.nearTriangles);
  const lod = object.children[0]; assert.ok(lod.isLOD); assert.equal(lod.levels.length, 3);
  object.updateMatrixWorld(true);
  const inverseLot = new THREE.Matrix4().makeRotationY(bp.lot.rotY).setPosition(bp.lot.x, bp.lot.y, bp.lot.z).invert();
  const p = new THREE.Vector3(), [W, H, D] = CATALOG[f.name].size;
  lod.levels[0].object.traverse((mesh) => {
    if (!mesh.isMesh) return;
    assert.equal(mesh.castShadow, false);
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      p.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverseLot);
      assert.ok(Math.abs(p.x - f.x) <= W / 2 + 0.002 && Math.abs(p.z - f.z) <= D / 2 + 0.002 && p.y >= f.y - 0.002 && p.y <= f.y + H + 0.002, 'batched geometry retains its fixture location after a translated/rotated building transform');
    }
  });
  const camera = new THREE.PerspectiveCamera();
  for (const [distance, visible] of [[2, 0], [12, 1], [30, 2], [2, 0]]) {
    camera.position.copy(lod.position).add(new THREE.Vector3(0, 0, distance)); camera.updateMatrixWorld(true); lod.update(camera);
    assert.deepEqual(lod.levels.map((level) => level.object.visible), [0, 1, 2].map((i) => i === visible), `distance ${distance}`);
  }
  object.traverse((mesh) => { if (mesh.isMesh) mesh.geometry.dispose(); });
  for (const m of materials.values()) m.dispose();
});

test('binary reader rejects truncated data, invalid accessor counts, NaNs and indices beyond the vertices', () => {
  const base = miniGlb(); assert.deepEqual(inspectGoodsGlb(base, { materials: miniDefs }).errors, []);
  assert.throws(() => readGoodsGlb(base.subarray(0, -4)), /length|truncat/);
  for (const [name, mutate, pattern] of [
    ['overrun', (g) => { g.accessors[0].count = 500; }, /exceeds bufferView/],
    ['NaN', (g, b) => { b.writeFloatLE(NaN, g.bufferViews[0].byteOffset); }, /non-finite/],
    ['index', (g, b) => { b.writeUInt16LE(99, g.bufferViews[4].byteOffset); }, /index beyond/],
  ]) {
    const result = inspectGoodsGlb(defect(base, mutate), { materials: miniDefs });
    assert.ok(result.errors.some((e) => pattern.test(e)), `${name}: ${result.errors.join('; ')}`);
  }
});

test('binary validation detects false bounds, inward triangle winding and the strict 400-triangle ceiling', () => {
  const base = miniGlb();
  const lying = inspectGoodsGlb(defect(base, (g) => { g.accessors[0].max[0] = 0; }), { materials: miniDefs });
  assert.ok(lying.errors.some((e) => /min\/max disagree/.test(e)));
  const reversed = inspectGoodsGlb(defect(base, (g, b) => { const o = g.bufferViews[4].byteOffset; b.writeUInt16LE(2, o + 2); b.writeUInt16LE(1, o + 4); }), { materials: miniDefs });
  assert.ok(reversed.errors.some((e) => /winding/.test(e)));
  assert.deepEqual(inspectGoodsGlb(miniGlb(399), { materials: miniDefs }).errors, []);
  assert.ok(inspectGoodsGlb(miniGlb(400), { materials: miniDefs }).errors.some((e) => /under 400/.test(e)));
});

test('unknown materials, embedded textures and duplicate node names cannot pass binary validation', () => {
  const cases = [
    [(g) => { g.materials[0].name = 'invented_material'; }, /unknown.*material/],
    [(g) => { g.images = [{ bufferView: 0, mimeType: 'image/png' }]; }, /textures are forbidden/],
    [(g) => { g.nodes[1].name = g.nodes[0].name; }, /duplicate node/],
  ];
  for (const [mutate, pattern] of cases) assert.ok(inspectGoodsGlb(defect(miniGlb(), mutate), { materials: miniDefs }).errors.some((e) => pattern.test(e)));
});

test('--complete rejects declared assets with no GLB file or absent named roots', async () => {
  await sandbox(async ({ root, manifest, check }) => {
    rmSync(resolve(root, 'assets/models', manifest.files[0].glb));
    const report = await check(); assert.equal(report.ok, false); assert.ok(report.errors.some((e) => /ENOENT|not present/.test(e)));
  });
  await sandbox(async ({ root, manifest, check }) => {
    const file = resolve(root, 'assets/models', manifest.files[0].glb), key = Object.keys(manifest.files[0].assets)[0];
    writeFileSync(file, defect(readFileSync(file), (g) => { g.nodes.find((n) => n.name === key).name = 'deleted_asset'; }));
    const report = await check(); assert.equal(report.ok, false); assert.ok(report.errors.some((e) => e.includes(key) && /not present/.test(e)));
  });
});

test('complete validation measures child-node transforms and ignores false triangle-count promises', async () => {
  await sandbox(async ({ root, manifest, check }) => {
    const file = resolve(root, 'assets/models', manifest.files[0].glb), key = Object.keys(manifest.files[0].assets)[0];
    writeFileSync(file, defect(readFileSync(file), (g) => {
      const asset = g.nodes.find((n) => n.name === key), child = g.nodes[asset.children[0]];
      child.translation = [2, 0, 0];
    }));
    const report = await check(); assert.equal(report.ok, false); assert.ok(report.errors.some((e) => /binary geometry exceeds/.test(e)), report.errors.join('\n'));
  });
  await sandbox(async ({ root, manifest, check }) => {
    Object.values(manifest.files[0].assets)[0].triangles = 1;
    saveJson(resolve(root, 'assets/models/manifest.goods.json'), manifest);
    const report = await check(); assert.equal(report.ok, false); assert.ok(report.errors.some((e) => /triangle count.*differs from actual/.test(e)));
  });
});

test('complete validation requires the real decoded atlas and its shared texture registration', async () => {
  await sandbox(async ({ root, manifest, check }) => {
    const file = resolve(root, 'assets/textures', manifest.atlas.file); writeFileSync(file, readFileSync(file).subarray(0, 40));
    const report = await check(); assert.equal(report.ok, false); assert.ok(report.errors.some((e) => /^atlas:/.test(e)));
  });
  await sandbox(async ({ root, check }) => {
    const file = resolve(root, 'assets/textures/manifest.json'), m = json(file);
    for (const key of Object.keys(m.textures)) if (key.startsWith('goods')) delete m.textures[key]; saveJson(file, m);
    const report = await check(); assert.equal(report.ok, false); assert.ok(report.errors.some((e) => /atlas not registered/.test(e)));
  });
});

test('payload accounting includes unlisted files and rejects a library over two million bytes', async () => {
  await sandbox(async ({ root, check }) => {
    writeFileSync(resolve(root, 'assets/models/goods/unlisted.bin'), Buffer.alloc(GOODS_BUDGET));
    const report = await check(); assert.equal(report.ok, false); assert.ok(report.bytes > GOODS_BUDGET);
    assert.ok(report.errors.some((e) => /unlisted goods payload/.test(e)) && report.errors.some((e) => /payload.*under 2000000/.test(e)));
  });
});
