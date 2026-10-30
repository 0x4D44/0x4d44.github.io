// Byte-level acceptance and deliberately corrupt fixtures for the Blender furniture pipeline.
// node --test la-ladera/tests/interiors-catalog.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATALOG } from '../js/interiors/catalog.js';
import { parseGlb, validateFurniture, MODELS } from '../tools/blender/furn_validate.mjs';

function encode(g, binary) {
  const raw = Buffer.from(JSON.stringify(g)), json = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 0x20); raw.copy(json);
  const bin = Buffer.alloc(Math.ceil(binary.length / 4) * 4); binary.copy(bin);
  const out = Buffer.alloc(28 + json.length + bin.length);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(json.length, 12); out.writeUInt32LE(0x4e4f534a, 16); json.copy(out, 20);
  out.writeUInt32LE(bin.length, 20 + json.length); out.writeUInt32LE(0x004e4942, 24 + json.length); bin.copy(out, 28 + json.length);
  return out;
}

function fixture() {
  const key = 'box_cardboard_m', cat = CATALOG[key], binary = Buffer.alloc(152);
  const p = [-0.25, 0, -0.2, 0.25, 0, -0.2, 0, 0.4, 0.2, 0, 0, 0.2];
  p.forEach((v, i) => binary.writeFloatLE(v, i * 4));
  for (let i = 0; i < 4; i++) binary.writeFloatLE(1, 48 + i * 12 + 4);
  [0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2].forEach((v, i) => binary.writeUInt16LE(v, 128 + i * 2));
  const g = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: key, children: [1] }, { mesh: 0 }],
    buffers: [{ byteLength: binary.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 48 }, { buffer: 0, byteOffset: 48, byteLength: 48 }, { buffer: 0, byteOffset: 96, byteLength: 32 }, { buffer: 0, byteOffset: 128, byteLength: 24 }],
    accessors: [{ bufferView: 0, componentType: 5126, type: 'VEC3', count: 4 }, { bufferView: 1, componentType: 5126, type: 'VEC3', count: 4 }, { bufferView: 2, componentType: 5126, type: 'VEC2', count: 4 }, { bufferView: 3, componentType: 5123, type: 'SCALAR', count: 12 }],
    materials: [{ name: 'cardboard' }], meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }] };
  const meta = { node: key, size: cat.size, footprint: cat.footprint, tags: cat.tags };
  return { key, g, binary, manifest: { files: [{ glb: 'furniture/test.glb', assets: { [key]: structuredClone(meta) } }] } };
}

function run(f, overrides = {}) {
  return validateFurniture({ manifest: f.manifest, read: () => encode(f.g, f.binary), minAssets: 1, requireCategories: false, checkOrphans: false, ...overrides });
}

test('shipped furniture has actual geometry, required coverage, valid metadata and stays below 10 MB', () => {
  const manifestList = JSON.parse(readFileSync(`${MODELS}/manifest.json`));
  assert.ok(manifestList.files.includes('manifest.furniture.json'), 'boot must load the furniture manifest');
  const report = validateFurniture({ complete: true });
  assert.equal(report.ok, true, report.failures.join('\n'));
  assert.ok(report.assetCount >= 120);
  assert.ok(report.totalBytes > 0 && report.totalBytes <= 10_000_000);
});

test('validator accepts a well-formed metric fixture', () => {
  const result = run(fixture()); assert.equal(result.ok, true, result.failures.join('\n'));
  assert.equal(result.assets[0].triangles, 4);
});

for (const [name, mutate, match] of [
  ['empty manifest', f => { f.manifest.files = []; }, /only 0 valid/],
  ['non-array manifest', f => { f.manifest.files = {}; }, /must be an array/],
  ['stale catalogue metadata', f => { f.manifest.files[0].assets[f.key].size[1] *= 2; }, /differ from catalogue/],
  ['wrong asset root', f => { f.g.nodes[0].name = 'not_the_asset'; }, /missing\/non-unique scene root/],
  ['empty root', f => { f.g.nodes[0].children = []; }, /no drawable geometry/],
  ['duplicate alias', f => { f.manifest.files[0].assets.box_cardboard_s = f.manifest.files[0].assets[f.key]; }, /aliased asset root/],
  ['duplicate geometry under a new root', f => {
    const c = CATALOG.box_cardboard_l;
    f.g.nodes.push({ name: c.name, children: [3] }, { mesh: 0 }); f.g.scenes[0].nodes.push(2);
    f.manifest.files[0].assets[c.name] = { node: c.name, size: c.size, footprint: c.footprint, tags: c.tags };
  }, /duplicate geometry alias/],
  ['out of range accessor', f => { f.g.accessors[0].count = 10000; }, /exceeds bufferView/],
  ['non-finite vertex', f => { f.binary.writeFloatLE(NaN, 0); }, /non-finite data/],
  ['invalid triangle index', f => { f.binary.writeUInt16LE(600, 128); }, /index out of range/],
  ['unknown material', f => { f.g.materials[0].name = 'unregistered_material'; }, /undefined material/],
  ['incorrect model scale', f => { f.g.nodes[1].scale = [100, 100, 100]; }, /outside catalogue bounds/],
  ['embedded texture', f => { f.g.images = [{ bufferView: 0 }]; }, /textures are forbidden/],
  ['external buffer', f => { f.g.buffers[0].uri = 'missing.bin'; }, /self-contained/],
  ['unsafe path', f => { f.manifest.files[0].glb = '../private.glb'; }, /invalid\/duplicate furniture path/],
  ['false byte count', f => { f.manifest.files[0].bytes = 1; }, /byte count differs/],
  ['false digest', f => { f.manifest.files[0].sha256 = '0'.repeat(64); }, /SHA-256 differs/],
  ['false geometry bounds', f => { f.manifest.files[0].assets[f.key].bounds = { min: [0, 0, 0], max: [0, 0, 0] }; }, /bounds differ/],
  ['false triangle count', f => { f.manifest.files[0].assets[f.key].triangles = 500; }, /triangle count differs/],
  ['missing variation choice', f => { f.g.nodes[1].name = `${f.key}-pa1-0`; }, /missing alternative pa0/],
]) test(`validator rejects ${name}`, () => {
  const f = fixture(); mutate(f); const result = run(f);
  assert.equal(result.ok, false); assert.match(result.failures.join('\n'), match);
});

test('validator rejects missing files, missing categories and a breached budget', () => {
  assert.equal(run(fixture(), { read() { throw new Error('ENOENT'); } }).ok, false);
  assert.match(run(fixture(), { maxBytes: 1 }).failures.join('\n'), /exceeds 1-byte budget/);
  assert.match(run(fixture(), { requireCategories: true }).failures.join('\n'), /category representative missing/);
});

test('validator rejects malformed/truncated GLB containers', () => {
  const f = fixture(), bytes = encode(f.g, f.binary);
  assert.throws(() => parseGlb(bytes.subarray(0, bytes.length - 4)), /declared length/);
  const corrupt = Buffer.from(bytes); corrupt.writeUInt32LE(0, 0);
  assert.throws(() => parseGlb(corrupt), /invalid GLB header/);
});
