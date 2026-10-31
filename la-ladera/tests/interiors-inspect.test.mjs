// Binary and data-contract tests for the close-up object library. Fixtures are independent
// tiny glTF meshes, not output from the Blender generator under test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inspectGlb, parseGlb, validateLibrary, LIMITS } from '../tools/blender/inspect_validate.mjs';

const MATERIALS = {
  inspect_paper_atlas: { uv: 'unit', vertexColors: false },
  inspect_metal_atlas: { uv: 'unit', tex: 'inspect_paper_atlas', vertexColors: false },
  paper: { tex: false, vertexColors: false },
};
const KEY = 'inspect_fixture';
const BOUNDS = { min: [-0.01, -0.01, 0], max: [0.01, 0.01, 0] };
const SIZE = [0.02, 0.02, 0];
const EXPECTED_KEYS = [
  'gold_coin', 'pocket_watch', 'wristwatch', 'ring', 'locket', 'medal_sport', 'medal_service',
  'rosary', 'keys', 'photo_family', 'photo_portrait', 'letter', 'envelope', 'diary', 'notebook',
  'recipe_cards', 'banknotes', 'lottery_ticket', 'lace', 'knickers', 'toy_car', 'toy_top', 'toy_teddy', 'harmonica',
].map((key) => `inspect_${key}`).sort();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8//8/AwMDEwMDAwMDAwAkBgMB/DXemwAAAABJRU5ErkJggg==', 'base64');

function makeGlb(mutate = () => {}, { triangles = 2 } = {}) {
  const g = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0, 2] }],
    nodes: [{ name: KEY, children: [1] }, { name: `${KEY}-face`, mesh: 0 },
      { name: `${KEY}_lod`, children: [3] }, { name: `${KEY}_lod-face`, mesh: 1 }],
    meshes: [], materials: [{ name: 'inspect_paper_atlas' }], buffers: [], bufferViews: [], accessors: [],
  };
  const chunks = []; let size = 0;
  const accessor = (values, width, type, min, max) => {
    const bytes = type === 5126 ? 4 : 2, body = Buffer.alloc(values.length * bytes);
    values.forEach((v, i) => body[type === 5126 ? 'writeFloatLE' : 'writeUInt16LE'](v, i * bytes));
    const vi = g.bufferViews.length, ai = g.accessors.length;
    g.bufferViews.push({ buffer: 0, byteOffset: size, byteLength: body.length });
    g.accessors.push({ bufferView: vi, componentType: type, count: values.length / width,
      type: { 1: 'SCALAR', 2: 'VEC2', 3: 'VEC3' }[width], ...(min ? { min, max } : {}) });
    chunks.push(body); size += body.length;
    const padding = (4 - size % 4) % 4; if (padding) { chunks.push(Buffer.alloc(padding)); size += padding; }
    return ai;
  };
  for (const lod of [false, true]) {
    const positions = lod ? [-0.01, -0.01, 0, 0.01, -0.01, 0, 0, 0.01, 0] : [-0.01, -0.01, 0, 0.01, -0.01, 0, 0.01, 0.01, 0, -0.01, 0.01, 0];
    const n = positions.length / 3;
    const p = accessor(positions, 3, 5126, BOUNDS.min, BOUNDS.max);
    const normal = accessor(Array.from({ length: n }, () => [0, 0, 1]).flat(), 3, 5126);
    const uv = accessor(lod ? [0, 0, 1, 0, 0.5, 1] : [0, 0, 1, 0, 1, 1, 0, 1], 2, 5126);
    const indices = lod ? [0, 1, 2] : triangles === 2 ? [0, 1, 2, 0, 2, 3] : Array.from({ length: triangles }, () => [0, 1, 2]).flat();
    const index = accessor(indices, 1, 5123);
    g.meshes.push({ primitives: [{ attributes: { POSITION: p, NORMAL: normal, TEXCOORD_0: uv }, indices: index, material: 0 }] });
  }
  g.buffers.push({ byteLength: size });
  const bin = Buffer.concat(chunks);
  mutate(g, bin);
  const j = Buffer.from(JSON.stringify(g)), pad = (4 - j.length % 4) % 4;
  const json = Buffer.concat([j, Buffer.alloc(pad, 32)]);
  const header = Buffer.alloc(12), jc = Buffer.alloc(8), bc = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + bin.length, 8);
  jc.writeUInt32LE(json.length, 0); jc.writeUInt32LE(0x4e4f534a, 4);
  bc.writeUInt32LE(bin.length, 0); bc.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jc, json, bc, bin]);
}
const measured = (b) => inspectGlb(b, { materialDefs: MATERIALS });
function offset(g, accessorIndex) { const a = g.accessors[accessorIndex]; return (g.bufferViews[a.bufferView].byteOffset ?? 0) + (a.byteOffset ?? 0); }

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ladera-inspect-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const p of ['assets/models/inspect', 'assets/textures', 'js/interiors', 'dev']) mkdirSync(join(root, p), { recursive: true });
  const manifest = {
    version: 1, sourceRevision: 'a'.repeat(40), integrationStatus: 'blocked-missing-drawer-baseline', budgetBytes: 2_000_000, maxTriangles: 3000,
    atlas: { path: 'assets/textures/inspect_paper_atlas.png', width: 2, height: 2 },
    files: [{ glb: `inspect/${KEY}.glb`, assets: {
      [KEY]: { node: KEY, label: 'Fixture', category: 'papers', lod: `${KEY}_lod`, triangles: 2, drawCalls: 1, bounds: BOUNDS, size: SIZE },
      [`${KEY}_lod`]: { node: `${KEY}_lod`, lodOf: KEY, triangles: 1, drawCalls: 1, bounds: BOUNDS, size: SIZE },
    } }],
  };
  const bindings = { version: 1, status: manifest.integrationStatus, sourceRevision: manifest.sourceRevision,
    requiredSources: ['dev/FEATURE-DRAWERS.md', 'js/interiors/finds.js', 'js/interiors/contents.js'], bindings: {},
    assets: [{ key: KEY, label: 'Fixture', category: 'papers' }] };
  const glb = join(root, `assets/models/inspect/${KEY}.glb`), atlas = join(root, manifest.atlas.path);
  const save = () => {
    writeFileSync(join(root, 'assets/models/manifest.inspect.json'), JSON.stringify(manifest));
    writeFileSync(join(root, 'js/interiors/inspect-bindings.json'), JSON.stringify(bindings));
  };
  save(); writeFileSync(glb, makeGlb()); writeFileSync(atlas, PNG);
  writeFileSync(join(root, 'assets/textures/manifest.json'), JSON.stringify({ textures: { inspect_paper_atlas: { map: 'inspect_paper_atlas.png' } } }));
  return { root, manifest, bindings, glb, atlas, save, validate: (complete = false) => validateLibrary({ root, complete, materialDefs: MATERIALS }) };
}

test('binary fixture: measurements include both asset roots and the actual draw count', () => {
  const result = measured(makeGlb());
  assert.equal(result.assets.size, 2);
  assert.equal(result.assets.get(KEY).triangles, 2);
  assert.equal(result.assets.get(`${KEY}_lod`).triangles, 1);
  assert.equal(result.assets.get(KEY).drawCalls, 1);
  assert.ok(Math.abs(result.assets.get(KEY).size[0] - 0.02) < 1e-8);
});

test('binary fixture: truncated, wrong-version and oversized chunks are rejected', () => {
  const b = makeGlb();
  assert.throws(() => parseGlb(b.subarray(0, 10)), /truncated/);
  assert.throws(() => parseGlb(b.subarray(0, -4)), /declared length/);
  const version = Buffer.from(b); version.writeUInt32LE(1, 4);
  assert.throws(() => parseGlb(version), /version 2/);
  const chunk = Buffer.from(b); chunk.writeUInt32LE(b.length, 12);
  assert.throws(() => parseGlb(chunk), /chunk length/);
});

test('binary fixture: embedded and external texture/buffer resources are forbidden', () => {
  assert.throws(() => measured(makeGlb((g) => { g.images = [{ uri: 'hidden.png' }]; })), /no images/);
  assert.throws(() => measured(makeGlb((g) => { g.textures = [{ source: 0 }]; })), /no images/);
  assert.throws(() => measured(makeGlb((g) => { g.materials[0].pbrMetallicRoughness = { baseColorTexture: { index: 0 } }; })), /texture references/);
  assert.throws(() => measured(makeGlb((g) => { g.buffers[0].uri = 'external.bin'; })), /URI buffer/);
});

test('binary fixture: out-of-range accessors and non-finite binary geometry cannot hide behind valid metadata', () => {
  assert.throws(() => measured(makeGlb((g) => { g.accessors[0].count += 100; })), /exceeds bufferView/);
  assert.throws(() => measured(makeGlb((g, bin) => { bin.writeFloatLE(NaN, offset(g, 0)); })), /non-finite geometry/);
  assert.throws(() => measured(makeGlb((g, bin) => { bin.writeFloatLE(Infinity, offset(g, 1)); })), /non-finite geometry/);
  assert.throws(() => measured(makeGlb((g) => { g.accessors[0].min = [-0.2, -0.2, 0]; })), /accessor bounds/);
});

test('binary fixture: invalid indices, degenerate faces and reversed winding fail', () => {
  const indexOffset = (g) => offset(g, g.meshes[0].primitives[0].indices);
  assert.throws(() => measured(makeGlb((g, bin) => { bin.writeUInt16LE(999, indexOffset(g)); })), /outside vertex data/);
  assert.throws(() => measured(makeGlb((g, bin) => { bin.writeUInt16LE(1, indexOffset(g)); })), /degenerate triangle/);
  assert.throws(() => measured(makeGlb((g, bin) => { const i = indexOffset(g); bin.writeUInt16LE(2, i + 2); bin.writeUInt16LE(1, i + 4); })), /winding/);
});

test('binary fixture: material names and one-material child meshes match the runtime loader', () => {
  assert.throws(() => measured(makeGlb((g) => { g.materials[0].name = 'invented_material'; })), /unknown library material/);
  assert.throws(() => measured(makeGlb((g) => { g.meshes[0].primitives.push(structuredClone(g.meshes[0].primitives[0])); })), /one primitive\/material/);
});

test('binary fixture: missing white COLOR_0 is rejected when the material enables vertex colors', () => {
  const materialDefs = { ...MATERIALS, inspect_paper_atlas: { uv: 'unit' } };
  assert.throws(() => inspectGlb(makeGlb(), { materialDefs }), /enables vertex colors.*COLOR_0/);
  assert.doesNotThrow(() => measured(makeGlb()), 'materials that explicitly disable vertex colors may omit COLOR_0');
});

test('binary fixture: transforms, pivots, cycles and unlisted geometry are checked', () => {
  assert.throws(() => measured(makeGlb((g) => { g.nodes[0].translation = [0.1, 0, 0]; })), /root transform/);
  assert.throws(() => measured(makeGlb((g) => { g.nodes[1].translation = [0.1, 0, 0]; })), /centered within 1 mm/);
  assert.throws(() => measured(makeGlb((g) => { g.nodes[1].scale = [-1, 1, 1]; })), /reflected/);
  assert.throws(() => measured(makeGlb((g) => { g.nodes[1].children = [0]; })), /cyclic/);
  assert.throws(() => measured(makeGlb((g) => { g.nodes.push({ name: 'unlisted' }); })), /orphan nodes/);
});

test('binary fixture: atlas UVs must stay inside the sheet; ordinary metric UVs may repeat', () => {
  const mutate = (g, bin) => bin.writeFloatLE(-0.25, offset(g, g.meshes[0].primitives[0].attributes.TEXCOORD_0));
  assert.throws(() => measured(makeGlb(mutate)), /atlas UVs/);
  assert.throws(() => measured(makeGlb((g, bin) => { mutate(g, bin); g.materials[0].name = 'inspect_metal_atlas'; })), /atlas UVs/);
  assert.doesNotThrow(() => measured(makeGlb((g, bin) => { mutate(g, bin); g.materials[0].name = 'paper'; })));
  assert.throws(() => measured(makeGlb((g) => { delete g.meshes[0].primitives[0].attributes.TEXCOORD_0; })), /atlas requires UVs/);
  assert.doesNotThrow(() => measured(makeGlb((g) => {
    g.materials[0].name = 'paper';
    for (const mesh of g.meshes) delete mesh.primitives[0].attributes.TEXCOORD_0;
  })));
});

test('fixture library: default validation proves file completeness but discloses the absent drawer baseline', async (t) => {
  const f = fixture(t), r = await f.validate();
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.equal(r.integrationStatus, 'blocked-missing-drawer-baseline');
  assert.equal(r.verifiedBindings, 0);
  assert.equal(r.unbound.length, 1);
  assert.ok(r.warnings.some((w) => /missing source: dev\/FEATURE-DRAWERS/.test(w)));
  const counted = ['assets/models/manifest.inspect.json', 'js/interiors/inspect-bindings.json', `assets/models/inspect/${KEY}.glb`, 'assets/textures/inspect_paper_atlas.png'];
  assert.equal(r.totalBytes, counted.reduce((n, p) => n + statSync(join(f.root, p)).size, 0));
});

test('fixture library: metadata cannot understate triangle counts or the byte budget', async (t) => {
  const f = fixture(t);
  f.manifest.files[0].assets[KEY].triangles = 1; f.save();
  let r = await f.validate();
  assert.equal(r.ok, false); assert.ok(r.errors.some((e) => /triangle count differs/.test(e)));
  f.manifest.files[0].assets[KEY].triangles = 2;
  f.manifest.payloadProbe = 'x'.repeat(LIMITS.bytes); f.save();
  r = await f.validate();
  assert.equal(r.ok, false); assert.ok(r.totalBytes >= LIMITS.bytes);
  assert.ok(r.errors.some((e) => /not below 2000000/.test(e)));
});

test('fixture library: an actual over-budget mesh fails even with matching advertised counts', async (t) => {
  const f = fixture(t);
  writeFileSync(f.glb, makeGlb(() => {}, { triangles: 3001 }));
  f.manifest.files[0].assets[KEY].triangles = 3001; f.save();
  const r = await f.validate();
  assert.equal(r.ok, false); assert.ok(r.errors.some((e) => /3001 triangles exceeds/.test(e)));
});

test('fixture library: optional file digests and byte counts are checked against the shipped file', async (t) => {
  const f = fixture(t);
  f.manifest.files[0].sha256 = '0'.repeat(64); f.save();
  let r = await f.validate();
  assert.equal(r.ok, false); assert.ok(r.errors.some((e) => /SHA-256 mismatch/.test(e)));
  delete f.manifest.files[0].sha256;
  f.manifest.files[0].bytes = 12; f.save();
  r = await f.validate();
  assert.equal(r.ok, false); assert.ok(r.errors.some((e) => /byte count differs/.test(e)));
});

test('fixture library: missing LODs, missing files and orphan files fail', async (t) => {
  const f = fixture(t);
  delete f.manifest.files[0].assets[`${KEY}_lod`]; f.save();
  let r = await f.validate();
  assert.equal(r.ok, false); assert.ok(r.errors.some((e) => /unlisted GLB root|missing matching LOD/.test(e)));
  writeFileSync(join(f.root, 'assets/models/inspect/orphan.glb'), makeGlb());
  r = await f.validate();
  assert.ok(r.errors.some((e) => /unlisted runtime file/.test(e)));
  rmSync(f.glb); r = await f.validate();
  assert.equal(r.ok, false); assert.ok(r.errors.some((e) => /ENOENT/.test(e)));
});

test('fixture library: corrupt PNGs and an unregistered atlas mapping fail', async (t) => {
  const f = fixture(t), broken = Buffer.from(PNG); broken[45] ^= 8;
  writeFileSync(f.atlas, broken);
  let r = await f.validate();
  assert.equal(r.ok, false); assert.ok(r.errors.some((e) => /PNG .*checksum/.test(e)));
  writeFileSync(f.atlas, PNG);
  writeFileSync(join(f.root, 'assets/textures/manifest.json'), '{"textures":{}}');
  r = await f.validate();
  assert.equal(r.ok, false); assert.ok(r.errors.some((e) => /not bound by the texture manifest/.test(e)));
});

test('complete mode rejects missing source files and an empty binding map', async (t) => {
  const f = fixture(t), r = await f.validate(true);
  assert.equal(r.ok, false);
  for (const source of f.bindings.requiredSources) assert.ok(r.errors.some((e) => e.includes(`missing source: ${source}`)));
  assert.ok(r.errors.some((e) => /no verified existing find\/content ID bindings/.test(e)));
});

test('complete mode verifies actual exported IDs instead of trusting a verified flag', async (t) => {
  const f = fixture(t);
  writeFileSync(join(f.root, 'dev/FEATURE-DRAWERS.md'), '# Existing drawer feature\n');
  writeFileSync(join(f.root, 'js/interiors/finds.js'), 'export const FINDS = { existing_coin: { id: "existing_coin" } };\n');
  writeFileSync(join(f.root, 'js/interiors/contents.js'), 'export const CONTENTS = [];\n');
  f.bindings.bindings = { invented_coin: { asset: KEY, source: 'js/interiors/finds.js', export: 'FINDS', verified: true } }; f.save();
  let r = await f.validate(true);
  assert.equal(r.ok, false); assert.equal(r.verifiedBindings, 0);
  assert.ok(r.errors.some((e) => /not present in source export FINDS/.test(e)));
  f.bindings.bindings = { existing_coin: { asset: KEY, source: 'js/interiors/finds.js', export: 'FINDS' } }; f.save();
  r = await f.validate(true);
  assert.equal(r.ok, true, r.errors.join('\n')); assert.equal(r.verifiedBindings, 1);
});

test('shipped inspect library contains all 24 requested objects, measured LODs and the shared atlas', async () => {
  const r = await validateLibrary();
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.deepEqual(r.assets.filter((a) => !a.lodOf).map((a) => a.key).sort(), EXPECTED_KEYS);
  assert.equal(r.assets.filter((a) => a.lodOf).length, EXPECTED_KEYS.length);
  assert.ok(r.totalBytes < LIMITS.bytes);
  assert.ok(r.assets.every((a) => a.triangles > 0 && a.triangles <= (a.lodOf ? LIMITS.lodTriangles : LIMITS.triangles)));
  assert.ok(r.assets.some((a) => a.materials.includes('inspect_paper_atlas')));
});
