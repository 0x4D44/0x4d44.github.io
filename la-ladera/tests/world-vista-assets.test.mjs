// Shipped-asset contract plus deliberate binary/metadata corruption. Fixtures are independent
// six-face cubes, not calls back into the vista generator or validator's geometry helpers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateKit, runCli } from '../tools/blender/vista_validate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), MODELS = resolve(HERE, '../assets/models');
const CATEGORIES = ['facade', 'roof', 'tank', 'rebar', 'stair', 'retaining', 'balcony', 'washing'];
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value));

function encode(g, bin) {
  const json = Buffer.from(JSON.stringify(g)), jp = (json.length + 3) & ~3, bp = (bin.length + 3) & ~3;
  const out = Buffer.alloc(12 + 8 + jp + 8 + bp);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jp, 12); out.writeUInt32LE(0x4e4f534a, 16); out.fill(0x20, 20, 20 + jp); json.copy(out, 20);
  out.writeUInt32LE(bp, 20 + jp); out.writeUInt32LE(0x004e4942, 24 + jp); bin.copy(out, 28 + jp);
  return out;
}

function cube(roots, repeat = 1) {
  const faces = [
    [[1, 0, 0], [[.5, 0, -.5], [.5, 1, -.5], [.5, 1, .5], [.5, 0, .5]]],
    [[-1, 0, 0], [[-.5, 0, .5], [-.5, 1, .5], [-.5, 1, -.5], [-.5, 0, -.5]]],
    [[0, 1, 0], [[-.5, 1, -.5], [-.5, 1, .5], [.5, 1, .5], [.5, 1, -.5]]],
    [[0, -1, 0], [[-.5, 0, .5], [-.5, 0, -.5], [.5, 0, -.5], [.5, 0, .5]]],
    [[0, 0, 1], [[.5, 0, .5], [.5, 1, .5], [-.5, 1, .5], [-.5, 0, .5]]],
    [[0, 0, -1], [[-.5, 0, -.5], [-.5, 1, -.5], [.5, 1, -.5], [.5, 0, -.5]]],
  ];
  const position = [], normal = [], uv = [], color = [], indices = [];
  for (const [n, p] of faces) {
    const base = position.length / 3;
    for (let i = 0; i < 4; i++) { position.push(...p[i]); normal.push(...n); uv.push(i % 2, Math.floor(i / 2)); color.push(.7, .6, .5, 1); }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const views = [], accessors = [], buffers = []; let offset = 0;
  function add(values, type, componentType, extra = {}) {
    const size = componentType === 5126 ? 4 : 2, b = Buffer.alloc(values.length * size);
    values.forEach((v, i) => componentType === 5126 ? b.writeFloatLE(v, i * size) : b.writeUInt16LE(v, i * size));
    views.push({ buffer: 0, byteOffset: offset, byteLength: b.length });
    accessors.push({ bufferView: views.length - 1, componentType, type, count: values.length / ({ VEC3: 3, VEC4: 4, VEC2: 2, SCALAR: 1 }[type]), ...extra });
    buffers.push(b); offset += b.length;
    return accessors.length - 1;
  }
  const POSITION = add(position, 'VEC3', 5126, { min: [-.5, 0, -.5], max: [.5, 1, .5] });
  const NORMAL = add(normal, 'VEC3', 5126), TEXCOORD_0 = add(uv, 'VEC2', 5126), COLOR_0 = add(color, 'VEC4', 5126);
  const index = add(Array.from({ length: repeat }, () => indices).flat(), 'SCALAR', 5123);
  return encode({ asset: { version: '2.0', generator: 'independent six-face test cube' }, scene: 0,
    scenes: [{ nodes: roots.map((_, i) => i) }], nodes: roots.map((name) => ({ name, mesh: 0 })),
    meshes: [{ primitives: [{ attributes: { POSITION, NORMAL, TEXCOORD_0, COLOR_0 }, indices: index, material: 0 }] }],
    materials: [{ name: 'bark_trunk' }], buffers: [{ byteLength: offset }], bufferViews: views, accessors,
  }, Buffer.concat(buffers));
}

function fixture(t, { nearRepeat = 1, farRepeat = 1 } = {}) {
  const root = mkdtempSync(resolve(tmpdir(), 'ladera-vista-validator-'));
  t.after(() => rmSync(root, { recursive: true, force: true })); mkdirSync(resolve(root, 'vista'));
  const pieces = CATEGORIES.flatMap((category) => Array.from({ length: 5 }, (_, i) => {
    const id = `${category}_${i}`;
    return { id, category, near: `vista_${id}`, far: `vista_${id}_far`, size: [1, 1, 1],
      ...(category === 'facade' ? { mounts: { front: { y: 0, z: .5 } } } : {}),
      nearTriangles: 12 * nearRepeat, farTriangles: 12 * farRepeat, stack: { on: ['ground'], supports: [], height: 1, maxLevels: 1 } };
  }));
  const files = ['near', 'far'].map((lod) => ({ glb: `vista/vista_${lod}.glb`, assets: Object.fromEntries(pieces.map((p) => [p[lod], {
    node: p[lod], size: p.size, footprint: [1, 1], origin: 'floor-centre', triangles: p[`${lod}Triangles`],
    category: p.category, lod, piece: p.id, bounds: [[-.5, 0, -.5], [.5, 1, .5]], mounts: p.mounts,
  }])) }));
  for (const lod of ['near', 'far']) writeFileSync(resolve(root, `vista/vista_${lod}.glb`), cube(pieces.map((p) => p[lod]), lod === 'near' ? nearRepeat : farRepeat));
  writeJson(resolve(root, 'manifest.vista.json'), { files });
  writeJson(resolve(root, 'manifest.json'), { files: ['manifest.vista.json'] });
  writeJson(resolve(root, 'vista/placement.json'), { version: 1, units: 'metres', origin: 'floor-centre', palette: ['a66a4c', '6c9994'], pieces });
  return root;
}

function editGlb(root, edit, lod = 'near') {
  const path = resolve(root, `vista/vista_${lod}.glb`), bytes = readFileSync(path), jsonLength = bytes.readUInt32LE(12);
  const g = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')), bin = Buffer.from(bytes.subarray(28 + jsonLength));
  edit(g, bin); writeFileSync(path, encode(g, bin));
}

function editJson(root, path, edit) {
  const full = resolve(root, path), value = JSON.parse(readFileSync(full, 'utf8')); edit(value); writeJson(full, value);
}

function rejects(root, pattern) {
  const result = validateKit({ root, complete: true });
  assert.equal(result.ok, false, 'corrupted kit unexpectedly passed');
  assert.match(result.errors.join('\n'), pattern, JSON.stringify(result, null, 2));
}

test('the shipped vista kit passes complete validation with real GLBs and every required category', () => {
  const result = validateKit({ root: MODELS, complete: true });
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.ok(result.pieces >= 40 && result.pieces <= 60);
  assert.equal(result.assets, result.pieces * 2);
  assert.ok(result.bytes < 2_000_000);
  for (const category of CATEGORIES) assert.ok(result.categories[category] > 0, category);
});

test('independently authored binary cube fixture passes the same complete contract', (t) => {
  const result = validateKit({ root: fixture(t), complete: true });
  assert.equal(result.ok, true, result.errors.join('\n')); assert.equal(result.assets, 80);
});

test('partial generation is reported in normal mode, but --complete rejects a missing far GLB', (t) => {
  const root = fixture(t); unlinkSync(resolve(root, 'vista/vista_far.glb'));
  const partial = validateKit({ root }); assert.equal(partial.ok, true, partial.errors.join('\n'));
  assert.ok(partial.warnings.some((w) => /far.*missing/.test(w))); rejects(root, /vista_far\.glb is missing/);
});

test('an absent far node cannot be concealed by leaving its manifest entry in place', (t) => {
  const root = fixture(t); editGlb(root, (g) => { g.nodes.pop(); g.scenes[0].nodes.pop(); }, 'far');
  rejects(root, /missing node .*_far/);
});

test('a forged material name fails instead of falling back to magenta', (t) => {
  const root = fixture(t); editGlb(root, (g) => { g.materials[0].name = 'not_a_library_material'; }); rejects(root, /unknown library material/);
});

test('GLB header length and chunk alignment are checked before the permissive furniture reader', (t) => {
  const root = fixture(t), path = resolve(root, 'vista/vista_near.glb'), bytes = readFileSync(path);
  bytes.writeUInt32LE(bytes.length - 4, 8); writeFileSync(path, bytes); rejects(root, /header length/);
  bytes.writeUInt32LE(bytes.length, 8); bytes.writeUInt32LE(bytes.readUInt32LE(12) + 1, 12); writeFileSync(path, bytes); rejects(root, /4-byte aligned/);
});

test('binary index values outside the position array fail even when all JSON counts look correct', (t) => {
  const root = fixture(t); editGlb(root, (g, bin) => {
    const accessor = g.accessors[g.meshes[0].primitives[0].indices]; bin.writeUInt16LE(65000, g.bufferViews[accessor.bufferView].byteOffset);
  }); rejects(root, /index outside POSITION bounds/);
});

test('binary degeneracy and reversed winding both fail', (t) => {
  const root = fixture(t); editGlb(root, (g, bin) => { const off = g.bufferViews[4].byteOffset; bin.writeUInt16LE(0, off + 2); }); rejects(root, /degenerate triangle/);
  editGlb(root, (g, bin) => { const off = g.bufferViews[4].byteOffset; bin.writeUInt16LE(2, off + 2); bin.writeUInt16LE(1, off + 4); }); rejects(root, /winding disagrees/);
});

for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0']) test(`non-finite binary ${attribute} cannot hide behind valid metadata`, (t) => {
  const root = fixture(t); editGlb(root, (g, bin) => {
    const a = g.accessors[g.meshes[0].primitives[0].attributes[attribute]]; bin.writeFloatLE(NaN, g.bufferViews[a.bufferView].byteOffset);
  }); rejects(root, /non-finite binary value/);
});

test('accessor counts that escape their buffer view are rejected', (t) => {
  const root = fixture(t); editGlb(root, (g) => { g.accessors[0].count += 1000; }); rejects(root, /range exceeds bufferView/);
});

test('forged accessor bounds and manifest bounds are independently checked against positions', (t) => {
  const root = fixture(t); editGlb(root, (g) => { g.accessors[0].min[0] = -.4; }); rejects(root, /min metadata disagrees/);
  editGlb(root, (g) => { g.accessors[0].min[0] = -.5; });
  editJson(root, 'manifest.vista.json', (g) => { g.files[0].assets.vista_facade_0.bounds[1][1] = 1.2; }); rejects(root, /manifest bounds disagree/);
});

test('embedded images and external buffer URIs are each forbidden', (t) => {
  const root = fixture(t); editGlb(root, (g) => { g.images = [{ bufferView: 0, mimeType: 'image/png' }]; }); rejects(root, /textures\/images are forbidden/);
  editGlb(root, (g) => { delete g.images; g.buffers[0].uri = 'external.bin'; }); rejects(root, /URI dependencies are forbidden/);
});

test('centimetre units, undersized placement cells and impossible stack planes fail', (t) => {
  const root = fixture(t); editJson(root, 'vista/placement.json', (g) => { g.units = 'centimetres'; }); rejects(root, /version\/units\/origin/);
  editJson(root, 'vista/placement.json', (g) => { g.units = 'metres'; g.pieces[0].size[0] = .5; }); rejects(root, /bounds exceed/);
  editJson(root, 'vista/placement.json', (g) => { g.pieces[0].size[0] = 1; g.pieces[0].stack.height = 4; }); rejects(root, /stack.height lies outside/);
});

test('cyclic node graphs fail without recursion overflow', (t) => {
  const root = fixture(t); editGlb(root, (g) => { g.nodes[0].children = [0]; }); rejects(root, /node cycle/);
});

test('facade front mount planes must fit the placement cell and match both LOD manifests', (t) => {
  const root = fixture(t);
  editJson(root, 'vista/placement.json', (g) => { g.pieces[0].mounts.front.z = 2; });
  rejects(root, /front mount lies outside/);
  editJson(root, 'vista/placement.json', (g) => { g.pieces[0].mounts.front.z = .5; });
  editJson(root, 'manifest.vista.json', (g) => { g.files[1].assets.vista_facade_0_far.mounts.front.z = .4; });
  rejects(root, /far: manifest front mount disagrees/);
});

test('the near limit is strictly below 600 triangles and the far limit is at most 60', (t) => {
  rejects(fixture(t, { nearRepeat: 50 }), /near triangle metadata must be 1–599/);
  const atLimit = validateKit({ root: fixture(t, { farRepeat: 5 }), complete: true }); assert.equal(atLimit.ok, true, atLimit.errors.join('\n'));
  rejects(fixture(t, { farRepeat: 6 }), /far triangle metadata must be 1–60/);
});

test('the complete check enforces root-manifest registration and includes every kit file in its byte cap', (t) => {
  const root = fixture(t); editJson(root, 'manifest.json', (g) => { g.files = []; }); rejects(root, /does not register/);
  writeFileSync(resolve(root, 'vista/unused-export.bin'), Buffer.alloc(2_000_000)); rejects(root, /must be below 2,000,000/);
});

test('CLI --complete --root --json returns a nonzero status for corrupt assets', (t) => {
  const root = fixture(t); editGlb(root, (g) => { g.materials[0].name = 'bad_material'; });
  const output = [], errors = [];
  const status = runCli(['--complete', '--root', root, '--json'], { write: (line) => output.push(line), writeError: (line) => errors.push(line) });
  assert.equal(status, 1, errors.join('\n')); assert.equal(JSON.parse(output.join('\n')).ok, false);
});
