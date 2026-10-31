// Delivery gates plus corrupt-file tests. These validate bytes, not generator claims.
import './nice.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb } from '../tools/blender/glb_info.mjs';
import { SPECIES, inspectAnimalGlb, validateAnimalLibrary } from '../tools/blender/animals_validate.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function glbBytes(g, raw) {
  const json = Buffer.from(JSON.stringify(g)), padded = Buffer.alloc((json.length + 3) & ~3, 0x20); json.copy(padded);
  const bin = Buffer.alloc((raw.length + 3) & ~3); raw.copy(bin);
  const out = Buffer.alloc(12 + 8 + padded.length + 8 + bin.length);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(padded.length, 12); out.writeUInt32LE(0x4e4f534a, 16); padded.copy(out, 20);
  const b = 20 + padded.length; out.writeUInt32LE(bin.length, b); out.writeUInt32LE(0x004e4942, b + 4); bin.copy(out, b + 8);
  return out;
}

// A tiny valid, animated tetrahedron: the data format is realistic but the art is
// intentionally unrelated to the generator, so a matching generator bug cannot pass.
function specimen(id = 'dog', far = false) {
  const chunks = [], g = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name: id, children: [1] }, { name: id + '_body', mesh: 0 }], materials: [{ name: 'fur' }],
    buffers: [{ byteLength: 0 }], bufferViews: [], accessors: [], meshes: [] };
  let length = 0;
  const accessor = (values, type, componentType = 5126, extra = {}) => {
    const array = componentType === 5126 ? new Float32Array(values.flat()) : new Uint16Array(values.flat());
    const raw = Buffer.from(array.buffer), padded = Buffer.alloc((raw.length + 3) & ~3); raw.copy(padded);
    const view = g.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: raw.length }) - 1;
    length += padded.length; chunks.push(padded);
    const sizes = { SCALAR: 1, VEC3: 3, VEC4: 4 };
    return g.accessors.push({ bufferView: view, componentType, count: values.flat().length / sizes[type], type, ...extra }) - 1;
  };
  const position = accessor([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], 'VEC3', 5126, { min: [0, 0, 0], max: [1, 1, 1] });
  const normal = accessor(Array.from({ length: 4 }, () => [0, 1, 0]), 'VEC3');
  const indices = accessor([0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2], 'SCALAR', 5123);
  g.meshes.push({ primitives: [{ attributes: { POSITION: position, NORMAL: normal }, indices, material: 0 }] });
  if (!far) {
    const input = accessor([0, 0.5, 1], 'SCALAR'), output = accessor([[0, 0, 0], [0, 0.03, 0], [0, 0, 0]], 'VEC3');
    g.animations = ['idle', 'walk', 'eat'].map((name) => ({ name, samplers: [{ input, output, interpolation: 'LINEAR' }], channels: [{ sampler: 0, target: { node: 1, path: 'translation' } }] }));
  }
  g.buffers[0].byteLength = length;
  return { json: g, bin: Buffer.concat(chunks) };
}

function temporary(t) {
  const dir = mkdtempSync(join(tmpdir(), 'ladera-animal-assets-'));
  t.after(() => rmSync(dir, { recursive: true, force: true })); return dir;
}
function writeSpecimen(dir, model = specimen(), name = 'sample.glb') {
  const path = join(dir, name); writeFileSync(path, glbBytes(model.json, model.bin)); return path;
}
function library(t) {
  const dir = temporary(t), dest = join(dir, 'animals'); mkdirSync(dest);
  const manifest = { version: 1, license: 'CC0-1.0', animals: {}, files: [] };
  for (const id of SPECIES) {
    const paths = [id + '.glb', id + '_lod.glb'], infos = [];
    for (let i = 0; i < 2; i++) {
      const node = id + (i ? '_lod' : ''), path = writeSpecimen(dest, specimen(node, !!i), paths[i]);
      infos.push(inspectAnimalGlb(path, { node, far: !!i }));
      manifest.files.push({ glb: 'animals/' + paths[i], assets: { [node]: { node } } });
    }
    manifest.animals[id] = { glb: 'animals/' + paths[0], lod: 'animals/' + paths[1], node: id, lodNode: id + '_lod',
      clips: { idle: 'idle', walk: 'walk', eat: 'eat' }, triangles: infos[0].triangles, lodTriangles: infos[1].triangles,
      bytes: infos[0].bytes, lodBytes: infos[1].bytes, size: infos[0].size, caged: id.endsWith('_caged') };
  }
  writeFileSync(join(dest, 'CREDITS.md'), '# Test specimens\nCC0-1.0\n' + SPECIES.join('\n'));
  const save = () => writeFileSync(join(dir, 'manifest.animals.json'), JSON.stringify(manifest)); save();
  return { dir, manifest, save };
}

test('the shipped seven-species library passes the complete byte-level delivery gate', () => {
  const report = validateAnimalLibrary({ modelsDir: join(ROOT, 'assets/models'), complete: true });
  assert.equal(report.ok, true, report.failures.join('\n'));
  assert.equal(report.animals.length, 7); assert.ok(report.bytes > 0 && report.bytes <= 2_000_000);
});

test('a complete independent fixture passes and a missing/empty library only passes fallback mode', (t) => {
  const { dir } = library(t), report = validateAnimalLibrary({ modelsDir: dir, complete: true });
  assert.deepEqual(report.failures, []); assert.equal(report.ok, true);
  const empty = temporary(t);
  assert.equal(validateAnimalLibrary({ modelsDir: empty }).ok, true);
  assert.equal(validateAnimalLibrary({ modelsDir: empty, complete: true }).ok, false);
  writeFileSync(join(empty, 'manifest.animals.json'), '{"files":[],"animals":{}}');
  assert.equal(validateAnimalLibrary({ modelsDir: empty }).ok, true);
  assert.equal(validateAnimalLibrary({ modelsDir: empty, complete: true }).ok, false);
});

test('complete mode rejects absent species, missing LODs, inaccurate metadata and absent credits', (t) => {
  const { dir, manifest, save } = library(t);
  delete manifest.animals.mule; save();
  assert.match(validateAnimalLibrary({ modelsDir: dir, complete: true }).failures.join('\n'), /missing species 'mule'/);
  manifest.animals.dog.lod = 'animals/gone.glb'; save();
  assert.match(validateAnimalLibrary({ modelsDir: dir, complete: true }).failures.join('\n'), /missing far LOD/);
  manifest.animals.cat.bytes++; save();
  assert.match(validateAnimalLibrary({ modelsDir: dir, complete: true }).failures.join('\n'), /metadata mismatch/);
  rmSync(join(dir, 'animals/CREDITS.md'));
  assert.match(validateAnimalLibrary({ modelsDir: dir, complete: true }).failures.join('\n'), /missing animals\/CREDITS.md/);
});

test('the library budget includes all shipped animal files, not just manifest-listed GLBs', (t) => {
  const { dir } = library(t);
  writeFileSync(join(dir, 'animals/forgotten-source.blend'), Buffer.alloc(2_000_000));
  const report = validateAnimalLibrary({ modelsDir: dir, complete: true });
  assert.equal(report.ok, false); assert.ok(report.bytes > report.budgetBytes);
  assert.match(report.failures.join('\n'), /exceeds 2000000/);
});

test('texture-free means neither image bytes nor material texture references nor external buffers', (t) => {
  const dir = temporary(t);
  for (const fault of [
    (g) => { g.images = [{ bufferView: 0, mimeType: 'image/png' }]; },
    (g) => { g.materials[0].pbrMetallicRoughness = { baseColorTexture: { index: 0 } }; },
    (g) => { g.buffers[0].uri = 'https://example.invalid/animal.bin'; },
    (g) => { g.materials[0].name = 'not_in_matlib'; },
  ]) {
    const model = specimen(); fault(model.json);
    assert.throws(() => inspectAnimalGlb(writeSpecimen(dir, model), { node: 'dog' }), /texture|buffer|material/);
  }
});

test('malformed envelopes, cyclic hierarchies, out-of-range indices and NaN vertices fail', (t) => {
  const dir = temporary(t), good = writeSpecimen(dir);
  const bytes = readFileSync(good); bytes.writeUInt32LE(bytes.length - 4, 8); writeFileSync(good, bytes);
  assert.throws(() => inspectAnimalGlb(good, { node: 'dog' }), /length/);
  const cycle = specimen(); cycle.json.nodes[1].children = [0];
  assert.throws(() => inspectAnimalGlb(writeSpecimen(dir, cycle), { node: 'dog' }), /cyclic/);
  const badIndex = specimen(), view = badIndex.json.bufferViews[badIndex.json.accessors[2].bufferView];
  badIndex.bin.writeUInt16LE(500, view.byteOffset);
  assert.throws(() => inspectAnimalGlb(writeSpecimen(dir, badIndex), { node: 'dog' }), /index out of range/);
  const nan = specimen(); nan.bin.writeFloatLE(NaN, 0);
  assert.throws(() => inspectAnimalGlb(writeSpecimen(dir, nan), { node: 'dog' }), /non-finite/);
  const overrun = specimen(); overrun.json.accessors[0].count = 999;
  assert.throws(() => inspectAnimalGlb(writeSpecimen(dir, overrun), { node: 'dog' }), /overrun/);
});

test('a far LOD cannot hide more than 300 triangles in repeated visible mesh nodes', (t) => {
  const dir = temporary(t), model = specimen('dog_lod', true);
  for (let i = 0; i < 75; i++) { model.json.nodes.push({ mesh: 0 }); model.json.nodes[0].children.push(model.json.nodes.length - 1); }
  assert.throws(() => inspectAnimalGlb(writeSpecimen(dir, model), { node: 'dog_lod', far: true }), /304 triangles exceeds 300/);
});

test('skin joint indices and weights are checked in the actual vertex data', (t) => {
  const dir = temporary(t), model = specimen(), g = model.json;
  const add = (array, componentType) => {
    const raw = Buffer.from(array.buffer), offset = model.bin.length;
    model.bin = Buffer.concat([model.bin, raw]); g.buffers[0].byteLength = model.bin.length;
    const bufferView = g.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: raw.length }) - 1;
    return g.accessors.push({ bufferView, componentType, count: 4, type: 'VEC4' }) - 1;
  };
  const joints = add(new Uint16Array(16), 5123), weights = add(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 5126);
  g.skins = [{ joints: [0] }]; g.nodes[1].skin = 0;
  Object.assign(g.meshes[0].primitives[0].attributes, { JOINTS_0: joints, WEIGHTS_0: weights });
  assert.equal(inspectAnimalGlb(writeSpecimen(dir, model), { node: 'dog' }).triangles, 4);
  model.bin.writeFloatLE(0.25, g.bufferViews[g.accessors[weights].bufferView].byteOffset);
  assert.throws(() => inspectAnimalGlb(writeSpecimen(dir, model), { node: 'dog' }), /weights.*sum to one/);
  model.bin.writeFloatLE(1, g.bufferViews[g.accessors[weights].bufferView].byteOffset);
  model.bin.writeUInt16LE(5, g.bufferViews[g.accessors[joints].bufferView].byteOffset);
  assert.throws(() => inspectAnimalGlb(writeSpecimen(dir, model), { node: 'dog' }), /joint index out of range/);
});

test('clip names cannot disguise static poses, broken loops or invalid target nodes', (t) => {
  const dir = temporary(t);
  for (const [fault, pattern] of [
    [(m) => { m.json.animations[1].name = 'not_walk'; }, /missing\/duplicate walk/],
    [(m) => { m.json.animations[0].channels = []; }, /empty animation/],
    [(m) => { m.json.animations[0].channels[0].target.node = 999; }, /invalid animation/],
    [(m) => {
      const a = m.json.accessors[m.json.animations[0].samplers[0].output], start = m.json.bufferViews[a.bufferView].byteOffset;
      m.bin.fill(0, start, start + 36);
    }, /no changing pose/],
    [(m) => {
      const a = m.json.accessors[m.json.animations[0].samplers[0].output], start = m.json.bufferViews[a.bufferView].byteOffset;
      m.bin.writeFloatLE(0.5, start + 28);
    }, /does not loop/],
  ]) {
    const model = specimen(); fault(model);
    assert.throws(() => inspectAnimalGlb(writeSpecimen(dir, model), { node: 'dog' }), pattern);
  }
});

test('manifest traversal and an unregistered asset cannot bypass the delivered file set', (t) => {
  const { dir, manifest, save } = library(t);
  manifest.animals.dog.glb = 'animals/../../outside.glb'; save();
  assert.match(validateAnimalLibrary({ modelsDir: dir, complete: true }).failures.join('\n'), /invalid animal path/);
  manifest.animals.dog.glb = 'animals/dog.glb'; manifest.files = []; save();
  assert.match(validateAnimalLibrary({ modelsDir: dir, complete: true }).failures.join('\n'), /absent from manifest files/);
});

test('actual GLB reader and validator agree on payload byte size', (t) => {
  const dir = temporary(t), path = writeSpecimen(dir), parsed = readGlb(path), info = inspectAnimalGlb(path, { node: 'dog' });
  assert.equal(info.bytes, parsed.bytes); assert.equal(info.triangles, 4); assert.equal(info.animations.length, 3);
});
