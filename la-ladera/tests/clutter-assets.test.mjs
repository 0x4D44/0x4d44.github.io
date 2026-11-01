// The complete library must exist on disk. Corruptions exercise binary data and the
// fallback boundary; these tests cannot pass merely because a manifest names assets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { inspectGlb, validateClutter, ROOT, REQUIRED_KEYS, MAX_BYTES } from '../tools/blender/clutter_validate.mjs';
import { readGlb } from '../tools/blender/glb_info.mjs';

const MODEL = 'assets/models/clutter/clutter.glb';
const MANIFEST = 'assets/models/manifest.clutter.json';
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ladera-clutter-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const p of [MANIFEST, 'assets/models/manifest.json', 'assets/models/clutter', 'assets/textures/clutter', 'assets/textures/manifest.json']) cpSync(resolve(ROOT, p), resolve(root, p), { recursive: true });
  return root;
}
function editJson(root, p, fn) {
  const file = resolve(root, p), json = JSON.parse(readFileSync(file, 'utf8')); fn(json); writeFileSync(file, JSON.stringify(json));
}
function encodeGlb(json, binary) {
  const body = Buffer.from(JSON.stringify(json)), length = Math.ceil(body.length / 4) * 4, blen = Math.ceil(binary.length / 4) * 4;
  const out = Buffer.alloc(12 + 8 + length + 8 + blen);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(length, 12); out.writeUInt32LE(0x4e4f534a, 16); out.fill(32, 20, 20 + length); body.copy(out, 20);
  out.writeUInt32LE(blen, 20 + length); out.writeUInt32LE(0x004e4942, 24 + length); binary.copy(out, 28 + length);
  return out;
}
function editGlb(root, fn) {
  const file = resolve(root, MODEL), { json, bin } = readGlb(file); fn(json, bin); writeFileSync(file, encodeGlb(json, bin));
}
const errorText = (r) => r.errors.join('\n');

test('complete clutter library ships all 19 requested families and cheaper LODs under the byte budget', () => {
  const result = validateClutter({ complete: true });
  assert.equal(result.ok, true, errorText(result));
  assert.equal(result.baseAssets, REQUIRED_KEYS.length);
  assert.equal(result.lodAssets, REQUIRED_KEYS.length);
  assert.ok(result.bytes > 20_000 && result.bytes < MAX_BYTES, 'real GLBs and atlas, not an empty manifest');
  assert.ok(result.assets.some((a) => a.materials.includes('clutter_decal')), 'the atlas is actually used');
});

test('exported bin, shutter and sign decals select their intended atlas cells and remain upright', () => {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, MANIFEST), 'utf8'));
  const { assets } = inspectGlb(resolve(ROOT, MODEL));
  for (const [key, tile] of [['clutter_bin_wheelie', 'no_basura'], ['clutter_shutter', 'graffiti_barrio'], ['clutter_sign', 'tienda_sign']]) {
    const a = assets.get(key), expected = manifest.atlas.tiles[tile];
    assert.equal(a.decals.length, 1, `${key}: a real exported decal exists`);
    assert.ok(a.decals[0].uv.every((v, i) => Math.abs(v - expected[i]) < 1e-6), `${key}: wrong atlas cell after Blender's V conversion`);
    assert.equal(a.decals[0].upright, true, `${key}: lower game-Y corners must use lower V`);
    assert.equal(assets.get(key + '_lod1').decals.length, 0, 'distant LOD omits small lettering');
  }
});

test('TEETH: Blender-style vertical UV reversal is caught even though every UV remains inside 0..1', (t) => {
  const root = fixture(t); editGlb(root, (g, bin) => {
    const node = g.nodes.find((n) => n.name === 'clutter_sign');
    for (const child of node.children) for (const p of g.meshes[g.nodes[child].mesh].primitives) {
      if (g.materials[p.material].name !== 'clutter_decal') continue;
      const a = g.accessors[p.attributes.TEXCOORD_0], bv = g.bufferViews[a.bufferView];
      assert.equal(a.componentType, 5126);
      for (let i = 0; i < a.count; i++) {
        const offset = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (bv.byteStride ?? 8) + 4;
        bin.writeFloatLE(1 - bin.readFloatLE(offset), offset);
      }
      delete a.min; delete a.max;
    }
  });
  const r = validateClutter({ projectRoot: root, complete: true });
  assert.equal(r.ok, false); assert.match(errorText(r), /decal UVs do not select atlas tile|decal is vertically flipped/);
});

test('TEETH: a manifest with no generated library cannot pass complete mode', (t) => {
  const root = fixture(t); editJson(root, MANIFEST, (m) => { m.files = []; });
  const r = validateClutter({ projectRoot: root, complete: true });
  assert.equal(r.ok, false); assert.match(errorText(r), /no generated GLB|missing required keys/);
});

test('TEETH: missing GLB is detected even when all catalogue entries still exist', (t) => {
  const root = fixture(t); rmSync(resolve(root, MODEL));
  const r = validateClutter({ projectRoot: root, complete: true });
  assert.equal(r.ok, false); assert.match(errorText(r), /ENOENT/);
});

test('TEETH: material names must resolve through the actual library definitions', (t) => {
  const root = fixture(t); editGlb(root, (g) => { g.materials[0].name = 'invented_clutter_material'; });
  const r = validateClutter({ projectRoot: root, complete: true });
  assert.equal(r.ok, false); assert.match(errorText(r), /unknown library material/);
});

test('TEETH: GLB textures are forbidden even when their URI is external', (t) => {
  const root = fixture(t); editGlb(root, (g) => { g.images = [{ uri: 'hidden.png' }]; g.textures = [{ source: 0 }]; });
  const r = validateClutter({ projectRoot: root, complete: true });
  assert.equal(r.ok, false); assert.match(errorText(r), /no images, textures/);
});

test('TEETH: corrupt binary positions are caught independently of plausible accessor min/max', (t) => {
  const root = fixture(t); editGlb(root, (g, bin) => {
    const a = g.accessors[g.meshes[0].primitives[0].attributes.POSITION], bv = g.bufferViews[a.bufferView];
    bin.writeFloatLE(Number.NaN, (bv.byteOffset ?? 0) + (a.byteOffset ?? 0));
  });
  assert.throws(() => inspectGlb(resolve(root, MODEL)), /non-finite binary value/);
});

test('TEETH: forged accessor bounds cannot hide geometry outside the footprint', (t) => {
  const root = fixture(t); editGlb(root, (g, bin) => {
    const a = g.accessors[g.meshes[0].primitives[0].attributes.POSITION], bv = g.bufferViews[a.bufferView];
    bin.writeFloatLE(800, (bv.byteOffset ?? 0) + (a.byteOffset ?? 0));
  });
  const r = validateClutter({ projectRoot: root, complete: true });
  assert.equal(r.ok, false); assert.match(errorText(r), /accessor min\/max differs from binary data/);
});

test('TEETH: invalid index ranges are rejected rather than counted as triangles', (t) => {
  const root = fixture(t); editGlb(root, (g, bin) => {
    const p = g.meshes[0].primitives[0], a = g.accessors[p.indices], bv = g.bufferViews[a.bufferView], pos = g.accessors[p.attributes.POSITION];
    const offset = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const bad = pos.count + 10;
    if (a.componentType === 5125) bin.writeUInt32LE(bad, offset);
    else if (a.componentType === 5123) bin.writeUInt16LE(bad, offset);
    else bin.writeUInt8(Math.min(255, bad), offset);
    delete a.min; delete a.max;
  });
  assert.throws(() => inspectGlb(resolve(root, MODEL)), /triangle index outside/);
});

test('TEETH: manifest triangle counts are independently measured', (t) => {
  const root = fixture(t); editJson(root, MANIFEST, (m) => { m.files[0].assets.clutter_helmet.triangles = 1; });
  const r = validateClutter({ projectRoot: root, complete: true });
  assert.equal(r.ok, false); assert.match(errorText(r), /triangle\/part metadata differs/);
});

test('TEETH: actual over-budget geometry fails even with truthful manifest triangle counts', (t) => {
  const root = fixture(t), base = JSON.parse(readFileSync(resolve(root, MANIFEST), 'utf8')).files[0].assets.clutter_tyre;
  const repeats = Math.ceil(500 / base.triangles);
  assert.ok(repeats * base.parts <= 8, 'fixture uses a plausible number of shared-material parts');
  editGlb(root, (g) => {
    const n = g.nodes.find((n) => n.name === 'clutter_tyre');
    for (const child of n.children) {
      const mesh = g.meshes[g.nodes[child].mesh], original = [...mesh.primitives];
      mesh.primitives = Array.from({ length: repeats }, () => original.map((p) => structuredClone(p))).flat();
    }
  });
  editJson(root, MANIFEST, (m) => { const a = m.files[0].assets.clutter_tyre; a.triangles *= repeats; a.parts *= repeats; });
  const r = validateClutter({ projectRoot: root, complete: true });
  assert.equal(r.ok, false); assert.match(errorText(r), /triangles reaches\/exceeds strict limit 500/);
});

test('TEETH: a too-small declared footprint fails even when geometry itself is valid', (t) => {
  const root = fixture(t); editJson(root, MANIFEST, (m) => {
    const a = m.files[0].assets.clutter_umbrella; a.footprint = [0.1, 0.1]; a.size[0] = a.size[2] = 0.1;
  });
  const r = validateClutter({ projectRoot: root, complete: true });
  assert.equal(r.ok, false); assert.match(errorText(r), /exceeds centred footprint/);
});

test('TEETH: missing LOD and runtime registration cannot pass the complete gate', (t) => {
  const root = fixture(t); editJson(root, MANIFEST, (m) => { delete m.files[0].assets.clutter_helmet.lod1; });
  editJson(root, 'assets/models/manifest.json', (m) => { m.files = m.files.filter((n) => n !== 'manifest.clutter.json'); });
  const r = validateClutter({ projectRoot: root, complete: true });
  assert.equal(r.ok, false); assert.match(errorText(r), /missing explicit LOD1/); assert.match(errorText(r), /root asset manifest/);
});

test('TEETH: an LOD that repeats the full-detail tyre is rejected using measured triangle counts', (t) => {
  const root = fixture(t);
  editGlb(root, (g) => {
    const near = g.nodes.find((n) => n.name === 'clutter_tyre'), far = g.nodes.find((n) => n.name === 'clutter_tyre_lod1');
    assert.equal(near.children.length, far.children.length, 'both tyre levels have one shared-material part');
    for (let i = 0; i < near.children.length; i++) g.nodes[far.children[i]].mesh = g.nodes[near.children[i]].mesh;
  });
  editJson(root, MANIFEST, (m) => {
    const a = m.files[0].assets, near = a.clutter_tyre, far = a.clutter_tyre_lod1;
    for (const k of ['triangles', 'parts', 'bounds']) far[k] = near[k];
  });
  const r = validateClutter({ projectRoot: root, complete: true });
  assert.equal(r.ok, false); assert.match(errorText(r), /LOD1 .* more than 65%/);
});

test('TEETH: a removed atlas or a second texture fails validation', (t) => {
  const root = fixture(t); rmSync(resolve(root, 'assets/textures/clutter/decals.png'));
  writeFileSync(resolve(root, 'assets/textures/clutter/extra.png'), 'not a second permitted atlas');
  const r = validateClutter({ projectRoot: root, complete: true });
  assert.equal(r.ok, false); assert.match(errorText(r), /decal atlas: ENOENT/); assert.match(errorText(r), /extra atlas\/texture/);
});

test('TEETH: corrupt atlas image bytes fail even when PNG dimensions remain correct', (t) => {
  const root = fixture(t), path = resolve(root, 'assets/textures/clutter/decals.png'), png = readFileSync(path);
  png[png.length - 16] ^= 1; writeFileSync(path, png);
  const r = validateClutter({ projectRoot: root, complete: true });
  assert.equal(r.ok, false); assert.match(errorText(r), /PNG .*CRC|PNG payload|PNG chunk/);
});

test('TEETH: unregistered payload bytes count towards the strict 2 MB budget', (t) => {
  const root = fixture(t); writeFileSync(resolve(root, 'assets/models/clutter/stale.glb'), Buffer.alloc(MAX_BYTES));
  const r = validateClutter({ projectRoot: root, complete: true });
  assert.equal(r.ok, false); assert.ok(r.bytes >= MAX_BYTES); assert.match(errorText(r), /unregistered payload/); assert.match(errorText(r), /byte library budget/);
});

test('TEETH: catalogue paths cannot escape the model directory', (t) => {
  const root = fixture(t); editJson(root, MANIFEST, (m) => { m.files[0].glb = 'clutter/../../../../outside.glb'; });
  const r = validateClutter({ projectRoot: root, complete: true });
  assert.equal(r.ok, false); assert.match(errorText(r), /path escapes/);
});
