// Asset ABI and failure-injection checks. No Blender, network, package install or visible browser.
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-assets.test.mjs
// Release completeness is separately mandatory: node la-ladera/tools/blender/people_validate.mjs --complete
import './nice.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { CONTRACT, DEFAULT_ROOT, parseGlb, readGlb, readAccessor, readClipBank, checkClipBytes, decodePrimitive, checkVertexData, compareSkeletons, checkInventory, writeManifest, validatePeople } from '../tools/blender/people_validate.mjs';

function pack(g, bin = Buffer.alloc(0)) {
  let json = Buffer.from(JSON.stringify(g)); json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
  const binary = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]), b = Buffer.alloc(28 + json.length + binary.length);
  b.writeUInt32LE(0x46546c67, 0); b.writeUInt32LE(2, 4); b.writeUInt32LE(b.length, 8);
  b.writeUInt32LE(json.length, 12); b.writeUInt32LE(0x4e4f534a, 16); json.copy(b, 20);
  b.writeUInt32LE(binary.length, 20 + json.length); b.writeUInt32LE(0x004e4942, 24 + json.length); binary.copy(b, 28 + json.length); return b;
}

test('the asset contract freezes the original 30 IDs, 32 clips and 21-bone skin ABI', () => {
  assert.equal(CONTRACT.people.length, 30); assert.equal(new Set(CONTRACT.people.map((p) => p.id)).size, 30);
  assert.equal(CONTRACT.clips.length, 32); assert.equal(CONTRACT.bones.length, 21);
  assert.deepEqual([...CONTRACT.jointOrder].sort(), [...CONTRACT.bones].sort());
  assert.equal(CONTRACT.people.filter((p) => p.baseline).length, 25, 'the frozen source actually shipped only 25 of its 30 declared figures');
  assert.equal(CONTRACT.sourceCommit, '8fa06a5498555afc5dc2b636c06754a4a6b5882c');
});

test('GLB parser rejects truncation, dishonest lengths and bufferViews beyond the binary', () => {
  const good = pack({ asset: { version: '2.0' }, buffers: [{ byteLength: 4 }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }] }, Buffer.alloc(4));
  assert.equal(parseGlb(good).bin.length, 4);
  assert.throws(() => parseGlb(good.subarray(0, good.length - 1)), /length mismatch/);
  const corrupt = Buffer.from(good); corrupt.writeUInt32LE(100000, 12); assert.throws(() => parseGlb(corrupt), /chunk/);
  const overrun = pack({ asset: { version: '2.0' }, buffers: [{ byteLength: 4 }], bufferViews: [{ buffer: 0, byteOffset: 4, byteLength: 4 }] }, Buffer.alloc(4));
  assert.throws(() => parseGlb(overrun), /outside BIN/);
});

test('binary accessor reader honors stride and normalization and rejects overrun', () => {
  const bin = Buffer.from([255, 0, 0, 255, 77, 77, 77, 77, 0, 128, 255, 128, 88, 88, 88, 88]);
  const g = { asset: { version: '2.0' }, buffers: [{ byteLength: bin.length }], bufferViews: [{ buffer: 0, byteLength: bin.length, byteStride: 8 }],
    accessors: [{ bufferView: 0, componentType: 5121, type: 'VEC4', count: 2, normalized: true }] };
  const glb = parseGlb(pack(g, bin));
  assert.deepEqual([...readAccessor(glb, 0)], [1, 0, 0, 1, 0, 128 / 255, 1, 128 / 255]);
  glb.g.accessors[0].count = 3; assert.throws(() => readAccessor(glb, 0), /overruns/);
});

test('all 672 original rotation tracks remain byte-exact after bone-name remapping', () => {
  const bank = readClipBank();
  assert.equal(bank.g.animations.reduce((n, a) => n + a.channels.length, 0), 672);
  for (const node of bank.g.nodes) node.name += '_29';
  assert.equal(checkClipBytes(bank), bank.provenance.rotationSha256);
  const a = bank.g.animations[0], output = bank.g.accessors[a.samplers[0].output], view = bank.g.bufferViews[output.bufferView];
  bank.bin[(view.byteOffset ?? 0) + (output.byteOffset ?? 0)] ^= 1;
  assert.throws(() => checkClipBytes(bank), /output bytes differ from the original clip bank/);
});

function vertexFixture() {
  return { vertices: 3, indices: new Uint32Array([0, 1, 2]), attrs: {
    POSITION: new Float32Array([-0.1, 0, 0, 0.1, 0, 0, 0, 1.7, 0]), NORMAL: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    TEXCOORD_0: new Float32Array([0.25, 0.25, 0.35, 0.25, 0.3, 0.35]), COLOR_0: new Float32Array(Array.from({ length: 3 }, () => [0.5, 0.3, 0.2, 32 / 255]).flat()),
    JOINTS_0: new Float32Array(12), WEIGHTS_0: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
  } };
}
const META = { heightM: 1.7, slots: { top: { id: 2 } } };
test('decoded geometry validation enforces actual triangle count and bounded indices', () => {
  const d = vertexFixture(); assert.equal(checkVertexData(d, META, 1, 'fixture').tris, 1);
  d.indices = new Uint32Array([0, 1, 2, 0, 1, 2]); assert.throws(() => checkVertexData(d, META, 1, 'fixture'), /triangles exceeds/);
  d.indices = new Uint32Array([0, 1, 3]); assert.throws(() => checkVertexData(d, META, 1, 'fixture'), /index outside/);
});
test('in-range UVs spanning the entire atlas are rejected instead of smearing its cells', () => {
  const d = vertexFixture(); d.attrs.TEXCOORD_0 = new Float32Array([0, 0, 1, 0, 0.5, 1]);
  assert.throws(() => checkVertexData(d, META, 1, 'fixture'), /crosses atlas cells/);
});
test('a tiny triangle straddling an atlas edge is rejected despite its small UV span', () => {
  const d = vertexFixture();
  d.attrs.TEXCOORD_0 = new Float32Array([0.37476, 0.30, 0.37549, 0.30, 0.37549, 0.3004]);
  assert.throws(() => checkVertexData(d, META, 1, 'fixture'), /crosses atlas cell column 3/);
  // A quantization-sized excursion is acceptable; an adjacent cell is not.
  d.attrs.TEXCOORD_0[0] = 0.37490;
  assert.doesNotThrow(() => checkVertexData(d, META, 1, 'fixture'));
});
test('invalid weights, foreign joints and interpolated garment-slot alpha cannot pass', () => {
  const cases = [
    ['WEIGHTS_0', 0, 0.5, /unnormalized skin weights/],
    ['WEIGHTS_0', 0, Number.NaN, /non-finite/],
    ['JOINTS_0', 0, 21, /invalid skin joint/],
    ['COLOR_0', 3, 0.333, /invalid recolour alpha/],
    ['POSITION', 4, 100, /actual height/],
  ];
  for (const [attr, offset, value, message] of cases) { const d = vertexFixture(); d.attrs[attr][offset] = value; assert.throws(() => checkVertexData(d, META, 1, 'fixture'), message, attr); }
});

test('LOD swaps require the same joint ordinal, bind matrices and rest transforms', () => {
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const rig = { joints: ['hips', 'head'], parents: { hips: null, head: 'hips' }, bind: new Float64Array([...I, ...I]), world: { hips: I, head: I } };
  assert.doesNotThrow(() => compareSkeletons(rig, structuredClone(rig), 'fixture'));
  let far = structuredClone(rig); far.joints.reverse(); assert.throws(() => compareSkeletons(rig, far, 'fixture'), /joint order/);
  far = structuredClone(rig); far.bind[12] = 0.1; assert.throws(() => compareSkeletons(rig, far, 'fixture'), /bind matrices/);
  far = structuredClone(rig); far.world.head = [...I]; far.world.head[13] = 0.1; assert.throws(() => compareSkeletons(rig, far, 'fixture'), /rest transform/);
});

test('manifest inventory rejects missing files, stale content and files outside assets', () => {
  const temp = mkdtempSync(join(tmpdir(), 'ladera-people-inventory-'));
  try {
    const root = join(temp, 'models'); mkdirSync(root); const data = Buffer.from('one verified generated file'); writeFileSync(join(root, 'body.glb'), data);
    const e = { path: 'body.glb', bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
    assert.doesNotThrow(() => checkInventory(root, [e], ['body.glb']));
    assert.throws(() => checkInventory(root, [], ['body.glb']), /missing inventory entry/);
    assert.throws(() => checkInventory(root, [{ ...e, sha256: '0'.repeat(64) }], ['body.glb']), /stale bytes\/SHA-256/);
    assert.throws(() => checkInventory(root, [{ ...e, path: 'missing.glb' }], ['missing.glb']), /missing file/);
    assert.throws(() => checkInventory(root, [{ ...e, path: '../../../elsewhere.glb' }], []), /escapes assets/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('explicit manifest regeneration preserves the loader block and unrelated metadata', () => {
  const temp = mkdtempSync(join(tmpdir(), 'ladera-people-manifest-'));
  try {
    mkdirSync(join(temp, 'people'));
    const original = { files: [{ path: 'obsolete' }], people: structuredClone(CONTRACT.manifestPeople), note: 'Keep this', provenance: { revision: 7 } };
    writeFileSync(join(temp, 'manifest.people.json'), JSON.stringify(original));
    const glb = pack({ asset: { version: '2.0' }, buffers: [{ byteLength: 4 }], materials: [{ name: 'people_pbr' }] }, Buffer.alloc(4));
    for (const file of ['people.glb', 'people_lod.glb']) writeFileSync(join(temp, 'people', file), glb);
    writeFileSync(join(temp, 'people/people_meta.json'), '{}\n');
    const updated = writeManifest(temp), raw = readFileSync(join(temp, 'manifest.people.json'), 'utf8');
    assert.deepEqual(updated.people, original.people); assert.equal(updated.note, original.note); assert.deepEqual(updated.provenance, original.provenance);
    assert.equal(updated.files.length, 3); assert.ok(raw.endsWith('\n')); assert.deepEqual(JSON.parse(raw), updated);
    assert.doesNotThrow(() => checkInventory(temp, updated.files, ['people/people.glb', 'people/people_lod.glb', 'people/people_meta.json']));
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('a compressed mesh cannot fake its triangle budget through glTF accessor counts', async (t) => {
  const path = resolve(DEFAULT_ROOT, 'people/people.glb');
  if (!existsSync(path)) { t.diagnostic('Optional GLB absent; the complete gate below rejects release completeness.'); return; }
  const glb = readGlb(path), p = glb.g.meshes[0].primitives[0];
  if (!p.extensions?.KHR_draco_mesh_compression) {
    // The raw path is likewise checked against the actual binary accessor's range.
    const ai = p.attributes.POSITION; glb.g.accessors[ai].count = 1000000000;
    await assert.rejects(() => decodePrimitive(glb, p), /overruns/); return;
  }
  const actual = await decodePrimitive(glb, p); assert.ok(actual.indices.length > 3);
  glb.g.accessors[p.indices].count = 3;
  await assert.rejects(() => decodePrimitive(glb, p), /disagrees with decoded Draco triangles/);
});

test('normal validation tolerates absent GLBs; --complete requires both actual bundles', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'ladera-people-missing-'));
  try {
    mkdirSync(join(temp, 'people'));
    writeFileSync(join(temp, 'manifest.people.json'), readFileSync(resolve(DEFAULT_ROOT, 'manifest.people.json')));
    writeFileSync(join(temp, 'people/people_meta.json'), readFileSync(resolve(DEFAULT_ROOT, 'people/people_meta.json')));
    const normal = await validatePeople({ modelsRoot: temp }); assert.equal(normal.ok, true, normal.errors.join('\n')); assert.equal(normal.warnings.filter((m) => m.includes('missing optional GLB')).length, 2);
    const complete = await validatePeople({ modelsRoot: temp, complete: true }); assert.equal(complete.ok, false); assert.ok(complete.errors.some((m) => /missing optional GLB|requires all 30/.test(m)));
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('the installed bundles, when present, satisfy the complete decoded asset gate', async (t) => {
  const both = ['people.glb', 'people_lod.glb'].every((f) => existsSync(resolve(DEFAULT_ROOT, 'people', f)));
  const result = await validatePeople({ complete: true });
  if (!both) { assert.equal(result.ok, false, 'a missing GLB must fail the release gate'); t.diagnostic('Missing optional assets are supported at runtime; this checkout is not release-complete.'); return; }
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.people.length, 30); assert.equal(result.clips, 32);
  assert.ok(result.people.every((p) => p.near.tris <= 8000 && p.far.tris <= 1500));
});
