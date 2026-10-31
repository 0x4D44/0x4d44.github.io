// Contract/adversarial tests: synthetic binary fixtures are deliberately damaged to prove the validator's gates.
//   node la-ladera/tools/nice.mjs node --test --test-concurrency=1 la-ladera/tests/garments.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { inspectAsset, parseGLB, REQUIRED_GARMENTS, validateGarments } from '../tools/blender/garments_validate.mjs';

const STATES = ['folded', 'hung', 'flat'];
const writeJSON = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
const crc32 = (data) => {
  let crc = 0xffffffff;
  for (const b of data) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
};
function png() {
  const chunk = (type, bytes) => {
    const b = Buffer.alloc(bytes.length + 12); b.writeUInt32BE(bytes.length); b.write(type, 4); bytes.copy(b, 8);
    b.writeUInt32BE(crc32(b.subarray(4, -4)), b.length - 4); return b;
  };
  const h = Buffer.alloc(13); h.writeUInt32BE(256); h.writeUInt32BE(256, 4); h[8] = 8; h[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', h),
    chunk('IDAT', deflateSync(Buffer.alloc(256 * (256 * 4 + 1)))), chunk('IEND', Buffer.alloc(0))]);
}

/** A tetrahedron and a two-triangle silhouette share their extents; tiny fixtures keep the tests cheap. */
function glb(names, { state = 'flat', low = false, editJSON, editBIN } = {}) {
  const positions = [-0.1, 0, -0.1, 0.1, 0, -0.1, 0, 0.2, 0, 0, 0, 0.1];
  if (state === 'hung') for (let i = 1; i < positions.length; i += 3) positions[i] -= 0.2;
  const arrays = [positions, [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], [0, 0, 1, 0, 0.5, 1, 0.5, 0], Array(16).fill(1),
    low ? [0, 1, 2, 0, 2, 3] : [0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]];
  let offset = 0;
  const views = [], blobs = arrays.map((values, ai) => {
    const b = Buffer.alloc(values.length * (ai === 4 ? 2 : 4));
    values.forEach((v, i) => ai === 4 ? b.writeUInt16LE(v, i * 2) : b.writeFloatLE(v, i * 4));
    views.push({ buffer: 0, byteOffset: offset, byteLength: b.length }); offset += b.length; return b;
  });
  const bin = Buffer.concat(blobs);
  const bounds = state === 'hung' ? { min: [-0.1, -0.2, -0.1], max: [0.1, 0, 0.1] } : { min: [-0.1, 0, -0.1], max: [0.1, 0.2, 0.1] };
  const json = { asset: { version: '2.0' }, buffers: [{ byteLength: bin.length }], bufferViews: views,
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', ...bounds },
      { bufferView: 1, componentType: 5126, count: 4, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: 4, type: 'VEC2' },
      { bufferView: 3, componentType: 5126, count: 4, type: 'VEC4' },
      { bufferView: 4, componentType: 5123, count: arrays[4].length, type: 'SCALAR' },
    ], materials: [{ name: 'laundry' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2, COLOR_0: 3 }, indices: 4, material: 0 }] }],
    nodes: names.flatMap((name, i) => [{ name, children: [i * 2 + 1] }, { name: name + '-mesh', mesh: 0 }]),
    scenes: [{ nodes: names.map((_, i) => i * 2) }], scene: 0 };
  editJSON?.(json); editBIN?.(bin, json);
  const jsonString = JSON.stringify(json), j = Buffer.from(jsonString.padEnd(Math.ceil(Buffer.byteLength(jsonString) / 4) * 4, ' '));
  const header = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + j.length + bin.length, 8);
  jh.writeUInt32LE(j.length); jh.writeUInt32LE(0x4e4f534a, 4); bh.writeUInt32LE(bin.length); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jh, j, bh, bin]);
}

function fixture(t, { complete = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ladera-garments-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const models = join(dir, 'models'), root = join(models, 'garments'); mkdirSync(root, { recursive: true });
  const ids = complete ? REQUIRED_GARMENTS : ['tshirt'];
  const catalogue = { schemaVersion: 1, adultOnly: true, garments: ids.map((id) => ({ id, label: id,
    category: ['cap', 'sun_hat', 'straw_hat'].includes(id) ? 'hat' : 'clothing', width: 0.2, length: 0.2,
    states: ['cap', 'straw_hat'].includes(id) ? ['hung', 'flat'] : STATES,
    ...(['cap', 'straw_hat'].includes(id) ? { notApplicable: { folded: 'Stiff brim/crown must keep its shape.' } } : {}),
    sourceIds: ['freesewing-teagan'], variants: ['plain'] })) };
  const manifest = { schemaVersion: 1, set: 'garments', scope: 'objects-only', adultOnly: true,
    limits: { triangles: 800, lodTriangles: 240, runtimeBytes: 2_000_000 },
    palette: 'garments/palette.json', assortments: 'garments/assortments.json',
    atlas: { file: 'garments/prints.png', width: 256, height: 256 }, files: [] };
  for (const state of STATES) {
    const names = catalogue.garments.filter((c) => c.states.includes(state)).map((c) => `garment_${c.id}_${state}`);
    const file = `garments/garments_${state}.glb`, lod = `garments/garments_${state}_lod.glb`;
    writeFileSync(join(models, file), glb(names, { state })); writeFileSync(join(models, lod), glb(names.map((n) => n + '_lod'), { state, low: true }));
    const bounds = state === 'hung' ? { min: [-0.1, -0.2, -0.1], max: [0.1, 0, 0.1] } : { min: [-0.1, 0, -0.1], max: [0.1, 0.2, 0.1] };
    manifest.files.push({ glb: file, assets: Object.fromEntries(names.map((node) => [node, {
      node, garment: node.slice(8, -state.length - 1), state, adultOnly: true, size: [0.2, 0.2, 0.2], footprint: [0.2, 0.2], bounds,
      origin: state === 'hung' ? 'hang-point' : 'floor-centre', triangles: 4, materials: ['laundry'], variants: ['plain'],
      lod: { glb: lod, node: node + '_lod', triangles: 2, size: [0.2, 0.2, 0.2], bounds },
    }])) });
  }
  const items = (state) => catalogue.garments.filter((c) => c.states.includes(state)).map((c) => ({ asset: `garment_${c.id}_${state}`, variant: 'plain', count: 1 }));
  const assortments = { schemaVersion: 1, adultOnly: true, bindings: [
    { id: 'drawers', kind: 'drawer', catalogueKeys: ['dresser_4'], items: items('folded') },
    { id: 'wardrobes', kind: 'wardrobe', catalogueKeys: ['wardrobe_2'], items: items('hung') },
    { id: 'lines', kind: 'washing_line', catalogueKeys: ['clothesline'], items: items('hung') },
    { id: 'shelves', kind: 'shop_shelf', catalogueKeys: ['shelf_fabric'], items: items('flat') },
  ] };
  writeJSON(join(models, 'manifest.garments.json'), manifest);
  writeJSON(join(dir, 'catalogue.json'), catalogue);
  writeJSON(join(root, 'assortments.json'), assortments);
  writeJSON(join(root, 'palette.json'), { schemaVersion: 1, material: 'laundry', atlas: { file: 'prints.png', size: [256, 256], grid: [4, 4] },
    variants: { plain: { color: '#6d829a', pattern: 'plain', tile: [0, 0], roughness: 0.95 } } });
  writeFileSync(join(root, 'prints.png'), png());
  return { models, root, manifest, catalogue, assortments, cataloguePath: join(dir, 'catalogue.json'),
    validate: (all = complete) => validateGarments({ modelsDir: models, cataloguePath: join(dir, 'catalogue.json'), complete: all }),
    saveManifest: () => writeJSON(join(models, 'manifest.garments.json'), manifest),
    saveAssortments: () => writeJSON(join(root, 'assortments.json'), assortments),
    saveCatalogue: () => writeJSON(join(dir, 'catalogue.json'), catalogue) };
}
const rejects = (report, pattern) => { assert.equal(report.ok, false); assert.match(report.errors.join('\n'), pattern); };

test('complete library requires all 23 adult garments and 67 applicable object states', (t) => {
  const f = fixture(t), r = f.validate();
  assert.deepEqual(r.errors, []); assert.equal(r.ok, true); assert.equal(r.assets, 67); assert.equal(r.catalogueGarments, 23);
  assert.ok(r.runtimeBytes > 0 && r.runtimeBytes < 2_000_000); assert.equal(r.maxTriangles, 4); assert.equal(r.maxLodTriangles, 2);
});

test('partial mode validates a development subset but cannot masquerade as complete', (t) => {
  const f = fixture(t, { complete: false }); assert.equal(f.validate(false).ok, true);
  rejects(f.validate(true), /exactly the 23 requested/);
});

test('missing generated GLB fails, restoring its real bytes recovers the library', (t) => {
  const f = fixture(t), path = join(f.root, 'garments_hung.glb'), bytes = readFileSync(path);
  unlinkSync(path); rejects(f.validate(), /ENOENT/);
  writeFileSync(path, bytes); assert.equal(f.validate().ok, true);
});

test('missing a required state cannot be hidden by an otherwise valid manifest', (t) => {
  const f = fixture(t); delete f.manifest.files[0].assets.garment_tshirt_folded; f.saveManifest();
  rejects(f.validate(), /missing required state garment_tshirt_folded/);
});

test('unlisted model files and unlisted scene roots fail complete mode', (t) => {
  const f = fixture(t); writeFileSync(join(f.root, 'accidental.glb'), glb(['extra']));
  rejects(f.validate(), /unlisted GLB/); unlinkSync(join(f.root, 'accidental.glb'));
  const file = f.manifest.files[0], names = [...Object.keys(file.assets), 'hidden_extra'];
  writeFileSync(join(f.models, file.glb), glb(names)); rejects(f.validate(), /unlisted or missing scene roots/);
});

test('recolouring metadata cannot silently name an unknown material', () => {
  assert.throws(() => parseGLB(glb(['item'], { editJSON: (g) => { g.materials[0].name = 'new_material'; } })), /not the library material/);
});

test('embedded textures, skins and animations are forbidden', () => {
  for (const field of ['images', 'textures', 'skins', 'animations']) {
    assert.throws(() => parseGLB(glb(['item'], { editJSON: (g) => { g[field] = [{}]; } })), new RegExp(field + ' are forbidden'));
  }
});

test('binary corruption is read from accessor bytes, including NaN and invalid indices', () => {
  assert.throws(() => parseGLB(glb(['item'], { editBIN: (b) => b.writeFloatLE(NaN, 0) })), /non-finite/);
  assert.throws(() => parseGLB(glb(['item'], { editBIN: (b, g) => b.writeUInt16LE(999, g.bufferViews[4].byteOffset) })), /index is outside/);
});

test('degenerate triangles and stale accessor bounds are rejected', () => {
  assert.throws(() => parseGLB(glb(['item'], { editBIN: (b, g) => b.writeUInt16LE(1, g.bufferViews[4].byteOffset) })), /degenerate triangle/);
  assert.throws(() => parseGLB(glb(['item'], { editJSON: (g) => { g.accessors[0].max[1] = 0.9; } })), /stale max/);
});

test('missing normals, UVs and colours cannot become invisible bad exports', () => {
  for (const field of ['NORMAL', 'TEXCOORD_0', 'COLOR_0']) {
    assert.throws(() => parseGLB(glb(['item'], { editJSON: (g) => { delete g.meshes[0].primitives[0].attributes[field]; } })), new RegExp(field));
  }
  assert.throws(() => parseGLB(glb(['item'], { editBIN: (b, g) => b.writeFloatLE(5, g.bufferViews[2].byteOffset) })), /UVs must stay/);
});

test('truncated files, buffer overreads and scene cycles fail cleanly', () => {
  const bytes = glb(['item']); assert.throws(() => parseGLB(bytes.subarray(0, -4)), /header length/);
  assert.throws(() => parseGLB(glb(['item'], { editJSON: (g) => { g.accessors[0].count = 9999; } })), /outside its bufferView/);
  assert.throws(() => parseGLB(glb(['item'], { editJSON: (g) => { g.nodes[1].children = [0]; } })), /scene root has a parent|cyclic/);
});

test('measurement includes child transforms and rejects moved asset origins', () => {
  const g = parseGLB(glb(['item'], { editJSON: (d) => { d.nodes[1].translation = [0, 0.3, 0]; } }));
  const a = inspectAsset(g, 'item'); assert.ok(Math.abs(a.bounds.min[1] - 0.3) < 1e-6);
  const moved = parseGLB(glb(['item'], { editJSON: (d) => { d.nodes[0].translation = [0, 0.3, 0]; } }));
  assert.throws(() => inspectAsset(moved, 'item'), /root transform must be identity/);
});

test('metadata bounds and footprint are independently compared with geometry', (t) => {
  const f = fixture(t), a = f.manifest.files[0].assets.garment_tshirt_folded;
  a.footprint = [20, 20]; a.bounds.min = [-20, 0, -20]; f.saveManifest();
  rejects(f.validate(), /footprint differs from GLB/); rejects(f.validate(), /bounds differ from GLB/);
});

test('LOD must be both under its cap and a meaningful simplification', (t) => {
  const f = fixture(t), file = f.manifest.files[0];
  for (const a of Object.values(file.assets)) a.lod.triangles = 4;
  writeFileSync(join(f.root, 'garments_folded_lod.glb'), glb(Object.keys(file.assets).map((n) => n + '_lod'))); f.saveManifest();
  rejects(f.validate(), /remove at least 40%/);
});

test('triangle limits cannot be raised in manifest data', (t) => {
  const f = fixture(t); f.manifest.limits.triangles = 9000; f.saveManifest();
  rejects(f.validate(), /limit 'triangles'.*exceeds 800/);
});

test('all runtime files count towards the byte budget, including unreferenced data', (t) => {
  const f = fixture(t); writeFileSync(join(f.root, 'extra-payload.bin'), Buffer.alloc(2_000_000));
  rejects(f.validate(), /runtime library.*exceeding 2000000/);
});

test('unsafe referenced paths cannot escape the model directory', (t) => {
  const f = fixture(t); f.manifest.files[0].glb = '../outside.glb'; f.saveManifest();
  rejects(f.validate(), /unsafe asset path/);
});

test('adult scope and applicable state exceptions are required', (t) => {
  const f = fixture(t); f.manifest.adultOnly = false; f.catalogue.garments.find((g) => g.id === 'cap').notApplicable = {};
  f.saveManifest(); f.saveCatalogue(); const r = f.validate();
  rejects(r, /adultOnly/); rejects(r, /folded omission needs a physical reason/);
});

test('provenance IDs and furniture catalogue bindings must resolve to existing contracts', (t) => {
  const f = fixture(t); f.catalogue.garments[0].sourceIds = ['invented-source'];
  f.assortments.bindings[0].catalogueKeys = ['invented-drawer']; f.saveCatalogue(); f.saveAssortments();
  const r = f.validate(); rejects(r, /sourceIds must resolve/); rejects(r, /catalogueKeys must name existing/);
});

test('assortments reject incompatible states and unknown palette variants', (t) => {
  const f = fixture(t); f.assortments.bindings[0].items[0] = { asset: 'garment_tshirt_hung', variant: 'missing', count: 1 }; f.saveAssortments();
  const r = f.validate(); rejects(r, /invalid variant 'missing'/); rejects(r, /incompatible with drawer/);
});

test('stiff flat hats are allowed on a wardrobe shelf but other flat garments are not', (t) => {
  const f = fixture(t), binding = f.assortments.bindings[1];
  binding.items.push({ asset: 'garment_straw_hat_flat', variant: 'plain', count: 1, support: 'shelf' }); f.saveAssortments();
  assert.equal(f.validate().ok, true);
  binding.items.push({ asset: 'garment_tshirt_flat', variant: 'plain', count: 1, support: 'shelf' }); f.saveAssortments();
  rejects(f.validate(), /garment_tshirt_flat state is incompatible with wardrobe/);
});

test('the checked-in garment library satisfies the complete export contract', () => {
  const r = validateGarments({ complete: true });
  assert.deepEqual(r.errors, [], 'regenerate with garments_build.py; a manifest alone is not a library');
  assert.equal(r.assets, 67); assert.equal(r.ok, true);
});
