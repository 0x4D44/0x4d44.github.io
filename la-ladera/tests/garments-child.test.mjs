// Child export contract and adversarial checks against the actual shipped GLB bytes.
//   node la-ladera/tools/nice.mjs node --test --test-isolation=none --test-concurrency=1 la-ladera/tests/garments-child.test.mjs
// GARMENTS_CHILD_MODELS_DIR selects a temporary model tree for deliberate failing TAP runs.
// GARMENTS_CHILD_PROOF_DIR optionally saves those intentional-failure TAP transcripts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHILD_GARMENTS, CHILD_LIMITS, CHILD_SIZES, inspectAsset, parseGLB,
  validateChildGarments, validateGarments,
} from '../tools/blender/garments_validate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODELS = resolve(process.env.GARMENTS_CHILD_MODELS_DIR || join(HERE, '../assets/models'));
const VALIDATOR = resolve(HERE, '../tools/blender/garments_validate.mjs');
const MANIFEST = 'manifest.garments_child.json';
const GLB = 'garments/garments_child.glb';
const SIZES = ['small', 'big'];
const ALL_STATES = ['folded', 'hung', 'flat'];
// Independent coverage list: neither missing catalogue entries nor extra garment types can
// silently change the acceptance surface by changing the generated manifest.
const EXPECTED = Object.freeze({
  tshirt_teal: ALL_STATES, tshirt_coral: ALL_STATES, tshirt_motif: ALL_STATES,
  shorts: ALL_STATES, cotton_dress: ALL_STATES, hoodie: ALL_STATES,
  joggers: ALL_STATES, school_jumper: ALL_STATES, school_polo: ALL_STATES,
  school_trousers: ALL_STATES, school_skirt: ALL_STATES, school_tie: ALL_STATES,
  socks_pair: ['folded', 'flat'], cap: ['hung', 'flat'], light_jacket: ALL_STATES,
  school_shoes: ['flat'], sandals: ['flat'],
});
const EXPECTED_KEYS = Object.entries(EXPECTED).flatMap(([id, states]) =>
  SIZES.flatMap((size) => states.map((state) => `garment_${id}_${size}_${state}`)));
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const writeJSON = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const rejects = (report, pattern) => {
  assert.equal(report.ok, false, 'damaged exported bytes must be rejected');
  assert.match(report.errors.join('\n'), pattern);
};

function library(models = MODELS) {
  const manifest = json(join(models, MANIFEST));
  const bytes = readFileSync(join(models, GLB));
  return { manifest, bytes, glb: parseGLB(bytes, GLB),
    assets: Object.fromEntries(manifest.files.flatMap((f) => Object.entries(f.assets))) };
}

/** Keep the real source assets untouched, including when a mutation test throws. */
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'ladera-child-garments-test-'));
  const models = join(dir, 'models'); mkdirSync(models);
  const protectedFiles = [MANIFEST, GLB, 'manifest.garments.json', 'garments/palette.json', 'garments/prints.png'];
  const hashes = protectedFiles.map((path) => [path, sha256(readFileSync(join(MODELS, path)))]);
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
    for (const [path, hash] of hashes) assert.equal(sha256(readFileSync(join(MODELS, path))), hash, `source ${path} changed`);
  });
  cpSync(join(MODELS, 'garments'), join(models, 'garments'), { recursive: true });
  for (const name of [MANIFEST, 'manifest.garments.json', 'manifest.json']) cpSync(join(MODELS, name), join(models, name));
  const f = { models, ...library(models) };
  f.saveManifest = () => writeJSON(join(models, MANIFEST), f.manifest);
  f.validate = () => validateChildGarments({ modelsDir: models, complete: true });
  return f;
}

/** A standards-compliant GLB re-packer; no corrupt-header shortcut is used by a budget test. */
function packGLB(g, sourceBIN) {
  const text = JSON.stringify(g), bytes = Buffer.from(text);
  const j = Buffer.alloc(Math.ceil(bytes.length / 4) * 4, 0x20); bytes.copy(j);
  const b = Buffer.alloc(Math.ceil(sourceBIN.length / 4) * 4); sourceBIN.copy(b);
  const h = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  h.writeUInt32LE(0x46546c67); h.writeUInt32LE(2, 4); h.writeUInt32LE(28 + j.length + b.length, 8);
  jh.writeUInt32LE(j.length); jh.writeUInt32LE(0x4e4f534a, 4);
  bh.writeUInt32LE(b.length); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([h, jh, j, bh, b]);
}

function meshIndices(g, rootName) {
  const root = g.nodes.findIndex((n) => n.name === rootName);
  assert.ok(root >= 0, `mutation target ${rootName} exists`);
  const meshes = new Set();
  const visit = (i) => {
    const node = g.nodes[i];
    if (node.mesh !== undefined) meshes.add(node.mesh);
    for (const child of node.children ?? []) visit(child);
  };
  visit(root); return [...meshes];
}

// Refresh every affected item, including geometry shared between the two sizes.
// This prevents size/triangle mutation tests from passing merely because metadata is stale.
function installGeometry(f, g, bin) {
  const bytes = packGLB(g, bin), parsed = parseGLB(bytes, 'mutated child GLB');
  for (const file of f.manifest.files) {
    if (file.sha256 !== undefined) file.sha256 = sha256(bytes);
    if (file.bytes !== undefined) file.bytes = bytes.length;
    for (const asset of Object.values(file.assets)) for (const a of [asset, asset.lod]) {
      const actual = inspectAsset(parsed, a.node);
      a.size = actual.size; a.bounds = actual.bounds; a.triangles = actual.triangles;
      if (a.footprint !== undefined) a.footprint = [actual.size[0], actual.size[2]];
      if (a.drawCalls !== undefined) a.drawCalls = actual.parts;
    }
  }
  writeFileSync(join(f.models, GLB), bytes); f.saveManifest();
  f.bytes = bytes; f.glb = parsed;
  return parsed;
}

function scaleBinaryPositions(f, node, factor) {
  const g = structuredClone(f.glb.json), bin = Buffer.from(f.glb.bin);
  const accessorIds = new Set(meshIndices(g, node).flatMap((mi) =>
    g.meshes[mi].primitives.map((p) => p.attributes.POSITION)));
  for (const ai of accessorIds) {
    const a = g.accessors[ai], view = g.bufferViews[a.bufferView];
    assert.equal(a.componentType, 5126, 'POSITION must use float32');
    const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = view.byteStride ?? 12;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < a.count; v++) for (let axis = 0; axis < 3; axis++) {
      const offset = start + v * stride + axis * 4;
      bin.writeFloatLE(bin.readFloatLE(offset) * factor, offset);
      const value = bin.readFloatLE(offset);
      min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
    }
    a.min = min; a.max = max;
  }
  return installGeometry(f, g, bin);
}

/** Append real, in-range triangle indices to one batch, crossing the requested piece cap. */
function addTriangleBatch(f, node, cap) {
  const g = structuredClone(f.glb.json), mi = meshIndices(g, node)[0];
  const p = g.meshes[mi].primitives[0];
  const original = p.indices === undefined
    ? Array.from({ length: f.glb.accessors[p.attributes.POSITION].count }, (_, i) => i)
    : [...f.glb.accessors[p.indices].values];
  const before = inspectAsset(f.glb, node).triangles;
  const extra = Math.max(1, Math.floor(cap - before + 1));
  const indices = [...original, ...Array.from({ length: extra }, () => original.slice(0, 3)).flat()];
  const width = Math.max(...indices) <= 65535 ? 2 : 4;
  const added = Buffer.alloc(indices.length * width);
  indices.forEach((value, i) => width === 2 ? added.writeUInt16LE(value, i * width) : added.writeUInt32LE(value, i * width));
  const oldLength = g.buffers[0].byteLength, offset = Math.ceil(oldLength / 4) * 4;
  const bin = Buffer.concat([f.glb.bin.subarray(0, oldLength), Buffer.alloc(offset - oldLength), added]);
  const view = g.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: added.length, target: 34963 }) - 1;
  p.indices = g.accessors.push({ bufferView: view, componentType: width === 2 ? 5123 : 5125, count: indices.length, type: 'SCALAR' }) - 1;
  g.buffers[0].byteLength = bin.length;
  const changed = installGeometry(f, g, bin);
  assert.ok(inspectAsset(changed, node).triangles > cap, 'mutation crossed the actual triangle budget');
  return changed;
}

function cliMustFail(f, pattern) {
  const run = spawnSync(process.execPath, [VALIDATOR, '--child', '--complete', '--root', f.models], {
    encoding: 'utf8', timeout: 30_000, windowsHide: true,
  });
  assert.equal(run.error, undefined);
  assert.equal(run.status, 1, `CLI should fail:\n${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout + run.stderr, pattern);
}

/** Run the ordinary acceptance assertion against broken input and require a failing TAP result. */
function ordinaryTestMustFail(t, f, namePattern, errorPattern, proofName) {
  const env = { ...process.env, GARMENTS_CHILD_MODELS_DIR: f.models };
  delete env.NODE_TEST_CONTEXT; delete env.GARMENTS_CHILD_PROOF_DIR;
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', '--test-concurrency=1',
    `--test-name-pattern=^${namePattern}$`, fileURLToPath(import.meta.url)], {
    encoding: 'utf8', env, timeout: 30_000, windowsHide: true,
  });
  assert.equal(run.error, undefined);
  assert.equal(run.status, 1, `ordinary acceptance test must fail on damaged input:\n${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /# fail 1\b/);
  assert.match(run.stdout + run.stderr, errorPattern);
  if (process.env.GARMENTS_CHILD_PROOF_DIR) {
    const dir = resolve(process.env.GARMENTS_CHILD_PROOF_DIR); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${proofName}.tap`), (run.stdout + run.stderr).replace(/[\t ]+$/gm, ''));
  }
  t.diagnostic(`${proofName}: the ordinary acceptance test failed as expected (exit 1; TAP fail 1).`);
}

test('every required everyday garment key exists in both sizes and every applicable state', () => {
  assert.equal(Object.keys(EXPECTED).length, 17); assert.equal(EXPECTED_KEYS.length, 90);
  assert.deepEqual(Object.keys(CHILD_GARMENTS).sort(), Object.keys(EXPECTED).sort());
  for (const [id, states] of Object.entries(EXPECTED)) assert.deepEqual([...CHILD_GARMENTS[id].states].sort(), [...states].sort(), id);
  const { manifest, glb, assets } = library();
  assert.equal(manifest.files.length, 1); assert.equal(manifest.files[0].glb, GLB);
  assert.deepEqual(Object.keys(assets).sort(), [...EXPECTED_KEYS].sort());
  assert.deepEqual(glb.roots.map((i) => glb.json.nodes[i].name).sort(),
    EXPECTED_KEYS.flatMap((key) => [key, `${key}_lod`]).sort());
  for (const key of EXPECTED_KEYS) {
    assert.equal(assets[key].node, key); assert.equal(assets[key].lod.node, `${key}_lod`);
    assert.equal(assets[key].lod.glb, GLB);
  }
});

test('every piece stays inside its independent real dimension range in metres, including LOD', () => {
  const { glb, assets } = library();
  for (const [id, states] of Object.entries(EXPECTED)) for (const sizeClass of SIZES) for (const state of states) {
    const key = `garment_${id}_${sizeClass}_${state}`;
    const range = CHILD_GARMENTS[id].longestSide[sizeClass][state];
    assert.ok(range[0] > 0 && range[1] >= range[0], `real bounds required for ${key}`);
    for (const a of [assets[key], assets[key].lod]) {
      const measured = inspectAsset(glb, a.node), longest = Math.max(...measured.size);
      assert.ok(longest >= range[0] && longest <= range[1], `${a.node}: actual longest side ${longest} m outside ${range.join('..')} m`);
      assert.ok(measured.size.every((v) => v > 0), `${a.node}: positive extents`);
      for (let axis = 0; axis < 3; axis++) assert.ok(Math.abs(a.size[axis] - measured.size[axis]) <= 0.001, `${a.node}: measured size axis ${axis}`);
    }
  }
});

test('every piece stays inside its actual 800-triangle or 240-triangle LOD budget', () => {
  const { glb, assets } = library();
  assert.equal(CHILD_LIMITS.triangles, 800); assert.equal(CHILD_LIMITS.lodTriangles, 240);
  for (const key of EXPECTED_KEYS) {
    const a = assets[key], high = inspectAsset(glb, a.node), low = inspectAsset(glb, a.lod.node);
    assert.ok(high.triangles > 0 && high.triangles <= 800, `${key}: ${high.triangles} actual triangles exceed 800`);
    assert.ok(low.triangles > 0 && low.triangles <= 240, `${key}: ${low.triangles} actual LOD triangles exceed 240`);
    assert.ok(low.triangles <= high.triangles * 0.6, `${key}: LOD removes at least 40%`);
    assert.equal(a.triangles, high.triangles, key); assert.equal(a.lod.triangles, low.triangles, `${key} LOD`);
  }
});

test('the generated child GLB and child manifest together stay within 700000 bytes', () => {
  assert.equal(CHILD_LIMITS.runtimeBytes, 700_000);
  const bytes = statSync(join(MODELS, GLB)).size + statSync(join(MODELS, MANIFEST)).size;
  assert.ok(bytes > 0 && bytes <= 700_000, `child files use ${bytes}/700000 bytes`);
  const report = validateChildGarments({ modelsDir: MODELS, complete: true });
  assert.equal(report.runtimeBytes, bytes, 'shared adult palette/atlas are reused, not counted twice');
});

test('small and big assets carry the declared age bands and approximately 55/75 percent sizing', () => {
  assert.equal(CHILD_SIZES.small.scale, 0.55); assert.equal(CHILD_SIZES.big.scale, 0.75);
  assert.deepEqual(CHILD_SIZES.small.ages, [4, 7]); assert.deepEqual(CHILD_SIZES.big.ages, [8, 12]);
  const { glb, assets } = library(), expectedRatio = 0.75 / 0.55;
  for (const [id, states] of Object.entries(EXPECTED)) for (const state of states) {
    const measured = SIZES.map((sizeClass) => {
      const a = assets[`garment_${id}_${sizeClass}_${state}`];
      assert.equal(a.childOnly, true); assert.equal(a.ageGroup, 'child'); assert.equal(a.sizeClass, sizeClass);
      return Math.max(...inspectAsset(glb, a.node).size);
    });
    assert.ok(Math.abs(measured[1] / measured[0] / expectedRatio - 1) <= 0.05, `${id}/${state}: small and big dimensions agree with declared relative sizes`);
  }
});

test('the child set reuses the adult fabric palette and atlas without embedded textures', () => {
  const { manifest, glb, assets } = library();
  assert.equal(manifest.palette, 'garments/palette.json');
  assert.equal(manifest.atlas.file, 'garments/prints.png');
  assert.equal(manifest.atlas.width, 256); assert.equal(manifest.atlas.height, 256);
  const palette = json(join(MODELS, manifest.palette));
  for (const a of Object.values(assets)) {
    assert.ok(a.variants.length > 0, `${a.node}: colour variants required`);
    for (const variant of a.variants) assert.ok(Object.hasOwn(palette.variants, variant), `${a.node}: ${variant} exists in adult palette`);
    assert.ok(a.variants.includes(a.defaultVariant), `${a.node}: default colour is a shared palette variant`);
  }
  for (const name of ['images', 'textures', 'samplers', 'animations', 'skins']) assert.equal(glb.json[name]?.length ?? 0, 0, name);
  assert.ok(glb.json.materials.every((m) => m.name === 'laundry'));
});

test('the child library remains an object-only companion outside the main registration manifest', () => {
  const { manifest } = library();
  assert.equal(manifest.set, 'garments_child'); assert.equal(manifest.scope, 'objects-only');
  assert.equal(manifest.childOnly, true); assert.equal(manifest.ageGroup, 'child'); assert.equal(manifest.units, 'metres');
  assert.doesNotMatch(readFileSync(join(MODELS, 'manifest.json'), 'utf8'), /garments_child|garment_\w+_(?:small|big)_/);
});

test('the checked-in child library passes the complete validator with actual generated files', () => {
  const r = validateChildGarments({ modelsDir: MODELS, complete: true });
  assert.deepEqual(r.errors, [], 'regenerate the child GLB; a manifest alone is not a library');
  assert.equal(r.ok, true); assert.equal(r.assets, 90); assert.equal(r.catalogueGarments, 17);
  assert.equal(r.runtimeBudgetBytes, 700_000);
});

test('an oversized binary mesh fails the real-size gate even after its metadata is refreshed', (t) => {
  const f = fixture(t), target = 'garment_tshirt_teal_small_flat';
  scaleBinaryPositions(f, target, 10);
  const r = f.validate(); rejects(r, /longest side.*outside.*metres/);
  assert.doesNotMatch(r.errors.join('\n'), /stale (?:min|max)|size differs from GLB|bounds differ from GLB/);
  cliMustFail(f, /longest side.*outside.*metres/);
  ordinaryTestMustFail(t, f, 'every piece stays inside its independent real dimension range in metres, including LOD',
    /actual longest side.*outside/, 'reject-oversize');
});

test('an undersized binary mesh fails the lower real-size bound with accurate metadata', (t) => {
  const f = fixture(t); scaleBinaryPositions(f, 'garment_tshirt_teal_small_flat', 0.25);
  const r = f.validate(); rejects(r, /longest side.*outside.*metres/);
  assert.doesNotMatch(r.errors.join('\n'), /stale (?:min|max)|size differs from GLB|bounds differ from GLB/);
  ordinaryTestMustFail(t, f, 'every piece stays inside its independent real dimension range in metres, including LOD',
    /actual longest side.*outside/, 'reject-undersize');
});

test('an extra valid high-detail triangle batch fails the 800-triangle gate', (t) => {
  const f = fixture(t); addTriangleBatch(f, 'garment_tshirt_teal_small_flat', 800);
  const r = f.validate(); rejects(r, /triangles exceed 800/);
  assert.doesNotMatch(r.errors.join('\n'), /degenerate triangle|index is outside|declared triangle count differs/);
  cliMustFail(f, /triangles exceed 800/);
  ordinaryTestMustFail(t, f, 'every piece stays inside its actual 800-triangle or 240-triangle LOD budget',
    /actual triangles exceed 800/, 'reject-high-triangles');
});

test('an extra valid LOD triangle batch fails the 240-triangle gate', (t) => {
  const f = fixture(t); addTriangleBatch(f, 'garment_tshirt_teal_small_flat_lod', 240);
  const r = f.validate(); rejects(r, /triangles exceed 240/);
  assert.doesNotMatch(r.errors.join('\n'), /degenerate triangle|index is outside|declared triangle count differs/);
  cliMustFail(f, /triangles exceed 240/);
  ordinaryTestMustFail(t, f, 'every piece stays inside its actual 800-triangle or 240-triangle LOD budget',
    /actual LOD triangles exceed 240/, 'reject-lod-triangles');
});

test('a missing required key fails independently of the remaining GLB geometry', (t) => {
  const f = fixture(t); delete f.manifest.files[0].assets.garment_school_polo_big_hung; f.saveManifest();
  rejects(f.validate(), /missing required state garment_school_polo_big_hung/);
  ordinaryTestMustFail(t, f, 'every required everyday garment key exists in both sizes and every applicable state',
    /not ok.*every required everyday garment key/, 'reject-missing-key');
});

test('valid extra GLB payload fails the combined file-size gate', (t) => {
  const f = fixture(t), g = structuredClone(f.glb.json);
  g.asset.extras = { ...g.asset.extras, deliberateBudgetProbe: 'x'.repeat(700_000) };
  installGeometry(f, g, f.glb.bin);
  const r = f.validate(); rejects(r, /runtime child library.*exceeding 700000/);
  assert.doesNotMatch(r.errors.join('\n'), /header length|invalid JSON|invalid chunk/);
  cliMustFail(f, /runtime child library.*exceeding 700000/);
  ordinaryTestMustFail(t, f, 'the generated child GLB and child manifest together stay within 700000 bytes',
    /child files use.*700000 bytes/, 'reject-payload-budget');
});

test('child budget limits cannot be relaxed by editing manifest data', (t) => {
  const f = fixture(t); f.manifest.limits = { triangles: 801, lodTriangles: 241, runtimeBytes: 700_001 }; f.saveManifest();
  const r = f.validate();
  rejects(r, /triangles.*800/); rejects(r, /lodTriangles.*240/); rejects(r, /runtimeBytes.*700000/);
});

test('declared child scale and age bands cannot contradict the fixed size contract', (t) => {
  const f = fixture(t);
  f.manifest.sizes.small.scale = 0.9;
  f.manifest.files[0].assets.garment_tshirt_teal_small_flat.ages = [18, 99];
  f.saveManifest();
  const r = f.validate(); rejects(r, /size declaration/); rejects(r, /age band/);
});

test('adult validation accepts its exact child companion but rejects an extra child-prefixed GLB', (t) => {
  const f = fixture(t);
  const adult = () => validateGarments({ modelsDir: f.models, complete: true });
  assert.deepEqual(adult().errors, [], 'the companion must not invalidate the existing adult library');
  cpSync(join(f.models, GLB), join(f.models, 'garments/garments_child_extra.glb'));
  rejects(adult(), /unlisted GLB.*garments_child_extra\.glb/);
});
