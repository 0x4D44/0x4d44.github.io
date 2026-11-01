// Actual-file and corruption tests for the parked-vehicle offline acceptance gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parseGlb } from '../tools/blender/furn_validate.mjs';
import { validateVehicles, inspectVehicleGlb, inspectPaintPng, ROOT, MODELS, REQUIRED_KEYS, MAX_BYTES } from '../tools/blender/vehicles_validate.mjs';

const MANIFEST = 'manifest.vehicles.json';
const digest = (b) => createHash('sha256').update(b).digest('hex');
const errors = (r) => r.failures.join('\n');
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ladera-vehicles-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const p of ['assets/models/' + MANIFEST, 'assets/models/manifest.json', 'assets/models/vehicles',
    'assets/textures/vehicles', 'assets/textures/manifest.json']) cpSync(resolve(ROOT, p), resolve(root, p), { recursive: true });
  return { root, models: resolve(root, 'assets/models') };
}
function manifestOf(models = MODELS) { return JSON.parse(readFileSync(resolve(models, MANIFEST), 'utf8')); }
function editManifest(models, fn) {
  const m = manifestOf(models); fn(m); writeFileSync(resolve(models, MANIFEST), JSON.stringify(m)); return m;
}
function encode(json, bin) {
  const j = Buffer.from(JSON.stringify(json)), jlen = Math.ceil(j.length / 4) * 4, blen = Math.ceil(bin.length / 4) * 4;
  const b = Buffer.alloc(12 + 8 + jlen + 8 + blen);
  b.writeUInt32LE(0x46546c67, 0); b.writeUInt32LE(2, 4); b.writeUInt32LE(b.length, 8);
  b.writeUInt32LE(jlen, 12); b.writeUInt32LE(0x4e4f534a, 16); b.fill(32, 20, 20 + jlen); j.copy(b, 20);
  b.writeUInt32LE(blen, 20 + jlen); b.writeUInt32LE(0x004e4942, 24 + jlen); bin.copy(b, 28 + jlen);
  return b;
}
function editGlb(models, fn, key = REQUIRED_KEYS[0]) {
  const m = manifestOf(models), file = m.files.find((f) => f.assets[key]);
  assert.ok(file, `${key}: a physical GLB must be present for mutation tests`);
  const path = resolve(models, file.glb), parsed = parseGlb(readFileSync(path));
  fn(parsed.json, parsed.bin, file.assets);
  const b = encode(parsed.json, parsed.bin); writeFileSync(path, b);
  editManifest(models, (updated) => {
    const f = updated.files.find((f) => f.glb === file.glb); f.bytes = b.length; f.sha256 = digest(b);
    f.assets = file.assets; updated.totalBytes = updated.files.reduce((n, f) => n + f.bytes, 0) + updated.atlas.bytes;
  });
  return path;
}
function firstPrimitive(g) { return g.meshes.find((m) => m.primitives?.length).primitives[0]; }
function offsetOf(g, accessor, i = 0, width = 3, bytes = 4) {
  const a = g.accessors[accessor], v = g.bufferViews[a.bufferView];
  return (v.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (v.byteStride ?? width * bytes);
}

test('complete vehicle library ships ten distinct designs, separate wheels, real far LODs and one shared atlas below 3 MB', () => {
  const r = validateVehicles({ complete: true });
  assert.equal(r.ok, true, errors(r));
  assert.equal(r.assetCount, REQUIRED_KEYS.length); assert.equal(r.lodCount, REQUIRED_KEYS.length);
  assert.ok(r.totalBytes > 50_000 && r.payloadBytes < MAX_BYTES);
  assert.equal(r.assets.length, REQUIRED_KEYS.length * 2);
  for (const a of r.assets) {
    assert.ok(a.materials.includes('vehicle_paint'), `${a.key}: paint really has exported UVs`);
    assert.ok(a.wheels.every((w) => w.triangles > 0), `${a.key}: wheel names are drawable pivot subtrees`);
  }
  const a = r.assets.find((a) => a.key === 'vehicle_hatchback_a'), b = r.assets.find((a) => a.key === 'vehicle_hatchback_b');
  assert.notDeepEqual(a.size, b.size, 'the hatchbacks have different measured silhouettes');
});

test('complete mode rejects empty metadata and missing generated GLBs', (t) => {
  const f = fixture(t), m = manifestOf(f.models);
  rmSync(resolve(f.models, m.files[0].glb));
  let r = validateVehicles({ models: f.models, complete: true });
  assert.equal(r.ok, false); assert.match(errors(r), /ENOENT/);
  editManifest(f.models, (m) => { m.files = []; m.assetCount = 0; m.lodCount = 0; });
  r = validateVehicles({ models: f.models, complete: true });
  assert.equal(r.ok, false); assert.match(errors(r), /no generated GLB files|missing complete generated asset/);
});

test('partial output cannot be relabelled as the complete requested catalogue', (t) => {
  const f = fixture(t); editManifest(f.models, (m) => { m.complete = false; });
  const r = validateVehicles({ models: f.models, complete: true });
  assert.equal(r.ok, false); assert.match(errors(r), /preview\/partial/);
});

test('complete mode rejects a manifest that lost its actual far-LOD root', (t) => {
  const f = fixture(t);
  editGlb(f.models, (g) => { g.nodes.find((n) => n.name === REQUIRED_KEYS[0] + '_lod1').name = 'vehicle_unregistered_lod1'; });
  const r = validateVehicles({ models: f.models, complete: true });
  assert.equal(r.ok, false); assert.match(errors(r), /declared root absent|nested or misnamed wheel/);
});

test('GLB parser rejects a truncated file even when its declared length is forged', () => {
  const m = manifestOf(), b = readFileSync(resolve(MODELS, m.files[0].glb));
  const cut = Buffer.from(b.subarray(0, b.length - 16)); cut.writeUInt32LE(cut.length, 8);
  assert.throws(() => inspectVehicleGlb(cut), /invalid chunk length|truncated/);
});

test('actual binary NaN positions fail despite plausible metadata, hashes and accessor bounds', (t) => {
  const f = fixture(t), path = editGlb(f.models, (g, b) => {
    const p = firstPrimitive(g); b.writeFloatLE(NaN, offsetOf(g, p.attributes.POSITION));
  });
  assert.throws(() => inspectVehicleGlb(path), /non-finite/);
});

test('accessors may not read beyond their buffer view or index vertices that do not exist', (t) => {
  const f = fixture(t), path = editGlb(f.models, (g) => {
    g.accessors[firstPrimitive(g).attributes.POSITION].count += 1_000_000;
  });
  assert.throws(() => inspectVehicleGlb(path), /exceeds bufferView/);
  const other = fixture(t), bad = editGlb(other.models, (g, b) => {
    const p = firstPrimitive(g), a = g.accessors[p.indices], vertexCount = g.accessors[p.attributes.POSITION].count;
    const bytes = { 5121: 1, 5123: 2, 5125: 4 }[a.componentType], offset = offsetOf(g, p.indices, 0, 1, bytes);
    b[{ 5121: 'writeUInt8', 5123: 'writeUInt16LE', 5125: 'writeUInt32LE' }[a.componentType]](vertexCount, offset);
    delete a.min; delete a.max;
  });
  assert.throws(() => inspectVehicleGlb(bad), /triangle index outside/);
});

test('forged POSITION min/max cannot conceal a displaced vertex outside the street footprint', (t) => {
  const f = fixture(t), path = editGlb(f.models, (g, b) => {
    b.writeFloatLE(200, offsetOf(g, firstPrimitive(g).attributes.POSITION));
  });
  assert.throws(() => inspectVehicleGlb(path), /min\/max differs from binary vertices/);
});

test('library materials and texture-free GLB contract are enforced independently of file hashes', (t) => {
  const f = fixture(t), path = editGlb(f.models, (g) => { g.materials[0].name = 'vehicle_missing_material'; });
  assert.throws(() => inspectVehicleGlb(path), /unknown library material/);
  const other = fixture(t), external = editGlb(other.models, (g) => {
    g.images = [{ uri: 'unshared-paint.png' }]; g.textures = [{ source: 0 }];
  });
  assert.throws(() => inspectVehicleGlb(external), /textures are forbidden/);
});

test('wheels cannot be merely names merged into the body or pivots at the ground', (t) => {
  const f = fixture(t);
  editGlb(f.models, (g) => {
    const n = g.nodes.find((n) => n.name === REQUIRED_KEYS[0] + '-wheel_fl');
    assert.ok(n); n.name += '_merged';
  });
  let r = validateVehicles({ models: f.models, complete: true });
  assert.equal(r.ok, false); assert.match(errors(r), /missing, extra or misnamed separate wheel/);
  const other = fixture(t), path = editGlb(other.models, (g) => {
    const n = g.nodes.find((n) => n.name === REQUIRED_KEYS[0] + '-wheel_fl');
    n.translation = [0, 0, 0]; delete n.matrix;
  });
  assert.throws(() => inspectVehicleGlb(path), /wheel below ground|pivot at ground/);
});

test('truthful metadata does not excuse a far LOD that exceeds 600 triangles', (t) => {
  const f = fixture(t), key = REQUIRED_KEYS[0] + '_lod1';
  editGlb(f.models, (g, _bin, entries) => {
    const root = g.nodes.find((n) => n.name === key), visited = new Set();
    const add = (node) => {
      if (node.mesh != null && !visited.has(node.mesh)) {
        visited.add(node.mesh); const mesh = g.meshes[node.mesh]; mesh.primitives = Array.from({ length: 20 }, () => mesh.primitives.map((p) => structuredClone(p))).flat();
      }
      for (const child of node.children ?? []) add(g.nodes[child]);
    };
    add(root); entries[key].triangles *= 20; if (entries[key].parts) entries[key].parts *= 20;
  });
  const r = validateVehicles({ models: f.models, complete: true });
  assert.equal(r.ok, false); assert.match(errors(r), /exceeds 600 limit|far LOD exceeds/);
});

test('paint UVs must select one padded tile instead of bleeding across the atlas', (t) => {
  const f = fixture(t), path = editGlb(f.models, (g, b) => {
    const p = g.meshes.flatMap((m) => m.primitives).find((p) => g.materials[p.material].name === 'vehicle_paint');
    b.writeFloatLE(0.25, offsetOf(g, p.attributes.TEXCOORD_0, 0, 2));
  });
  assert.throws(() => inspectVehicleGlb(path), /paint atlas UV enters tile gutter/);
});

test('a vertical atlas reversal cannot silently turn a catalogue paint into a different tile', (t) => {
  const f = fixture(t);
  editGlb(f.models, (g, b) => {
    const done = new Set();
    for (const p of g.meshes.flatMap((m) => m.primitives)) {
      if (g.materials[p.material].name !== 'vehicle_paint' || done.has(p.attributes.TEXCOORD_0)) continue;
      done.add(p.attributes.TEXCOORD_0);
      const uv = g.accessors[p.attributes.TEXCOORD_0];
      for (let i = 0; i < uv.count; i++) {
        const offset = offsetOf(g, p.attributes.TEXCOORD_0, i, 2) + 4;
        b.writeFloatLE(1 - b.readFloatLE(offset), offset);
      }
    }
  });
  const r = validateVehicles({ models: f.models, complete: true });
  assert.equal(r.ok, false); assert.match(errors(r), /paint UVs do not select the catalogue paint tile/);
});

test('paint PNG corruption and missing atlas bytes are detected', (t) => {
  const f = fixture(t), atlas = resolve(f.root, 'assets/textures/vehicles/paint.png'), b = readFileSync(atlas);
  b[b.length - 16] ^= 1;
  assert.throws(() => inspectPaintPng(b), /CRC mismatch|truncated/);
  rmSync(atlas);
  const r = validateVehicles({ models: f.models, complete: true });
  assert.equal(r.ok, false); assert.match(errors(r), /paint atlas: ENOENT/);
});

test('unregistered generated payload counts toward the strict whole-library budget', (t) => {
  const f = fixture(t); writeFileSync(resolve(f.models, 'vehicles/stale.glb'), Buffer.alloc(MAX_BYTES));
  const r = validateVehicles({ models: f.models, complete: true });
  assert.equal(r.ok, false); assert.ok(r.payloadBytes > MAX_BYTES);
  assert.match(errors(r), /unregistered payload file/); assert.match(errors(r), /byte library payload reaches\/exceeds/);
});

test('published library registration, byte hashes and catalogue hash cannot silently become stale', (t) => {
  const f = fixture(t); editManifest(f.models, (m) => { m.files[0].sha256 = '0'.repeat(64); m.generator.catalogSha256 = '0'.repeat(64); });
  const r = validateVehicles({ models: f.models, complete: true });
  assert.equal(r.ok, false); assert.match(errors(r), /SHA-256 is missing or stale/); assert.match(errors(r), /SHA-256 differs/);
  const other = fixture(t), path = resolve(other.models, 'manifest.json'), m = JSON.parse(readFileSync(path, 'utf8'));
  m.files = m.files.filter((name) => name !== MANIFEST); writeFileSync(path, JSON.stringify(m));
  const registration = validateVehicles({ models: other.models, complete: true, runtime: true });
  assert.equal(registration.ok, false); assert.match(errors(registration), /root model manifest does not register vehicles/);
});
