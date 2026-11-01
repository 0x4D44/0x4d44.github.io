// Actual-export acceptance and adversarial checks for the teen companion set.
// node --test --test-concurrency=1 la-ladera/tests/garments-teen.test.mjs
// LADERA_TEEN_MODELS / LADERA_TEEN_CATALOGUE select isolated temporary exports.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { inspectAsset, parseGLB, REQUIRED_TEEN_GARMENTS, requiredTeenKeys, TEEN_DIMENSIONS,
  TEEN_LIMITS, TEEN_SIZE_CLASSES, teenLongestRange, validateTeenGarments } from '../tools/blender/garments_validate.mjs';

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(THIS_FILE), '..');
const MODELS = resolve(process.env.LADERA_TEEN_MODELS ?? join(ROOT, 'assets/models'));
const CATALOGUE = resolve(process.env.LADERA_TEEN_CATALOGUE ?? join(ROOT, 'tools/blender/garments_teen.catalog.json'));
const IS_MUTANT = process.env.LADERA_TEEN_MUTANT === '1';
const MANIFEST = 'manifest.garments-teen.json';
const DIRECTORY = 'garments-teen';
const pack = (state, lod = false) => `${DIRECTORY}/garments_${state}${lod ? '_lod' : ''}.glb`;
const PACKS = ['flat', 'folded', 'hung'].flatMap((s) => [pack(s), pack(s, true)]);
const EPS = 0.001;
const readManifest = () => JSON.parse(readFileSync(join(MODELS, MANIFEST), 'utf8'));
const readExport = () => new Map(PACKS.map((file) => [file, parseGLB(readFileSync(join(MODELS, file)), file)]));
const nodeFile = (node) => pack(node.replace(/_lod$/, '').split('_').at(-1), node.endsWith('_lod'));
const inspectNode = (exports, node) => inspectAsset(exports.get(nodeFile(node)), node);
const writeJSON = (path, value) => writeFileSync(path, JSON.stringify(value) + '\n');
const assetEntries = (manifest) => manifest.files.flatMap((f) => Object.entries(f.assets));
const filesBelow = (path) => readdirSync(path, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? filesBelow(join(path, e.name)) : [join(path, e.name)]);
const runtimeBytes = (models) => [join(models, MANIFEST), ...filesBelow(join(models, DIRECTORY))]
  .reduce((bytes, path) => bytes + statSync(path).size, 0);
const fingerprint = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const validate = (modelsDir = MODELS, cataloguePath = CATALOGUE) => validateTeenGarments({ modelsDir, cataloguePath, complete: true });
const rejects = (report, pattern) => { assert.equal(report.ok, false); assert.match(report.errors.join('\n'), pattern); };

test('teen acceptance: every required key and LOD exists in the generated GLB', () => {
  const manifest = readManifest(), glb = readExport(), entries = assetEntries(manifest), keys = requiredTeenKeys();
  assert.equal(REQUIRED_TEEN_GARMENTS.length, 29);
  assert.equal(keys.length, 162);
  assert.equal(manifest.files.length, 3);
  assert.deepEqual(manifest.files.map((f) => f.glb).sort(), ['flat', 'folded', 'hung'].map((s) => pack(s)).sort());
  assert.deepEqual(entries.map(([key]) => key).sort(), keys.toSorted(), 'every independent garment/size/state key must exist');
  const actualRoots = [...glb.values()].flatMap((g) => g.roots.map((i) => g.json.nodes[i].name)).sort();
  assert.deepEqual(actualRoots, keys.flatMap((key) => [key, `${key}_lod`]).sort());
  for (const [key, a] of entries) {
    assert.equal(a.node, key);
    assert.equal(a.lod.node, `${key}_lod`);
    assert.equal(a.lod.glb, pack(a.state, true));
    assert.notEqual(a.lod.glb, pack(a.state), 'LODs must never load the high-detail pack');
    assert.ok(inspectNode(glb, key).triangles > 0);
    assert.ok(inspectNode(glb, a.lod.node).triangles > 0);
  }
});

test('teen acceptance: every piece is inside its real dimension range', () => {
  const manifest = readManifest(), glb = readExport(), sizes = new Map();
  for (const [key, a] of assetEntries(manifest)) {
    const [min, max] = teenLongestRange(a.styleId, a.sizeClass, a.state);
    for (const [label, descriptor] of [[key, a], [`${key} LOD`, a.lod]]) {
      const actual = inspectNode(glb, descriptor.node), longest = Math.max(...actual.size);
      assert.ok(longest >= min - EPS && longest <= max + EPS,
        `${label}: longest side ${longest.toFixed(6)} m outside expected ${min.toFixed(6)}–${max.toFixed(6)} m`);
      assert.ok(actual.size.every((v) => v > 0), `${label}: every axis must have positive extent`);
      actual.size.forEach((v, i) => assert.ok(Math.abs(v - descriptor.size[i]) <= EPS, `${label}: metadata differs from real geometry`));
      sizes.set(descriptor.node, actual.size);
    }
    const high = sizes.get(key), low = sizes.get(a.lod.node);
    assert.ok(low.every((v, i) => Math.abs(v - high[i]) <= Math.max(0.002, high[i] * 0.05)),
      `${key}: LOD dimensions must stay within 5% or 2 mm of the high-detail shape`);
  }
  for (const id of REQUIRED_TEEN_GARMENTS) for (const state of TEEN_DIMENSIONS[id].states) for (const suffix of ['', '_lod']) {
    const small = sizes.get(`garment_teen_${id}_small_${state}${suffix}`), big = sizes.get(`garment_teen_${id}_big_${state}${suffix}`);
    assert.ok(small && big, `${id}/${state}${suffix}: both sizes must be present`);
    small.forEach((v, axis) => assert.ok(Math.abs(v * 9 / 7 - big[axis]) <= EPS, `${id}/${state}${suffix}: small and big must have 7:9 extent ratio`));
  }
});

test('teen acceptance: every piece stays within its high and LOD triangle budgets', () => {
  const manifest = readManifest(), glb = readExport();
  for (const [key, a] of assetEntries(manifest)) {
    const high = inspectNode(glb, a.node), low = inspectNode(glb, a.lod.node);
    assert.ok(high.triangles <= TEEN_LIMITS.triangles, `${key}: ${high.triangles} triangles exceed 800`);
    assert.ok(low.triangles <= TEEN_LIMITS.lodTriangles, `${key} LOD: ${low.triangles} triangles exceed 240`);
    assert.ok(low.triangles <= high.triangles * 0.6, `${key}: LOD must remove at least 40% of triangles`);
    assert.equal(a.triangles, high.triangles, `${key}: high triangle metadata must match actual batches`);
    assert.equal(a.lod.triangles, low.triangles, `${key}: LOD triangle metadata must match actual batches`);
  }
});

test('teen acceptance: complete generated payload stays under 3500000 bytes', () => {
  for (const file of PACKS) assert.ok(statSync(join(MODELS, file)).size > 0, `real generated pack ${file} must be present`);
  const bytes = runtimeBytes(MODELS);
  assert.ok(bytes <= TEEN_LIMITS.runtimeBytes, `teen runtime payload ${bytes} exceeds 3500000 bytes`);
});

test('the checked-in teen library satisfies the extended independent validator', () => {
  const report = validate();
  assert.deepEqual(report.errors, [], 'regenerate the real teen GLB, manifest and fabrics together');
  assert.equal(report.ok, true);
  assert.equal(report.assets, 162);
  assert.equal(report.catalogueGarments, 29);
  assert.equal(report.runtimeBytes, runtimeBytes(MODELS));
  assert.equal(report.sizeClasses, Object.keys(TEEN_SIZE_CLASSES).length);
});

test('dress lengths, size classes, sock pair states and single-state shoe pairs remain explicit', () => {
  const glb = readExport(), ids = ['dress_short', 'dress_knee', 'dress_midi', 'dress_maxi'];
  for (const sizeClass of ['small', 'big']) {
    const lengths = ids.map((id) => inspectNode(glb, `garment_teen_${id}_${sizeClass}_hung`).size[1]);
    assert.ok(lengths.every((length, i) => i === 0 || length > lengths[i - 1] + 0.07), 'four visibly different dress lengths are required');
  }
  assert.deepEqual(TEEN_DIMENSIONS.socks_pair.states, ['folded', 'flat']);
  assert.deepEqual(TEEN_DIMENSIONS.school_shoes_pair.states, ['flat']);
  assert.deepEqual(TEEN_DIMENSIONS.sandals_pair.states, ['flat']);
});

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'ladera-teen-mutation-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const models = join(dir, 'models');
  mkdirSync(models, { recursive: true });
  cpSync(join(MODELS, DIRECTORY), join(models, DIRECTORY), { recursive: true });
  cpSync(join(MODELS, MANIFEST), join(models, MANIFEST));
  cpSync(CATALOGUE, join(dir, 'catalogue.json'));
  return { models, cataloguePath: join(dir, 'catalogue.json'), glb: join(models, pack('flat')), lod: join(models, pack('flat', true)), manifest: join(models, MANIFEST) };
}

/** Preserve the real binary vertex/index streams; mutate glTF structure only. */
function mutateGLB(path, edit) {
  const parsed = parseGLB(readFileSync(path));
  edit(parsed.json, parsed);
  const content = Buffer.from(JSON.stringify(parsed.json)), json = Buffer.alloc(Math.ceil(content.length / 4) * 4, 0x20);
  content.copy(json);
  const bin = parsed.bin, header = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + bin.length, 8);
  jh.writeUInt32LE(json.length); jh.writeUInt32LE(0x4e4f534a, 4);
  bh.writeUInt32LE(bin.length); bh.writeUInt32LE(0x004e4942, 4);
  writeFileSync(path, Buffer.concat([header, jh, json, bh, bin]));
}
function descendantMeshes(g, root) {
  const indices = [], visit = (index) => {
    const n = g.nodes[index]; if (n.mesh !== undefined) indices.push(n.mesh);
    for (const child of n.children ?? []) visit(child);
  };
  visit(g.nodes.findIndex((n) => n.name === root)); return [...new Set(indices)];
}
function assertAcceptanceFails(t, f, label, reason) {
  // Invoke this same test file, filtered to the four actual-byte acceptance
  // gates. A caught validator error alone would not prove those tests fail.
  const env = { ...process.env, LADERA_TEEN_MODELS: f.models, LADERA_TEEN_CATALOGUE: f.cataloguePath, LADERA_TEEN_MUTANT: '1' };
  // A nested runner must not inherit the parent's internal test-child marker.
  // Node 22 otherwise disables --test and bypasses the selected acceptance gates.
  delete env.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=tap',
    '--test-name-pattern=^teen acceptance:', THIS_FILE], {
    encoding: 'utf8', timeout: 30_000, windowsHide: true,
    env,
  });
  assert.ifError(child.error);
  assert.equal(child.status, 1, 'the real acceptance process must fail with assertion errors, not runner startup failure');
  const output = child.stdout + child.stderr;
  assert.match(output, new RegExp(`not ok \\d+ - teen acceptance: ${label}`));
  assert.match(output, reason);
  const marker = output.split('\n').filter((line) => /not ok|# fail|longest side|triangles exceed|payload .* exceeds/.test(line));
  t.diagnostic(`Deliberately damaged export: node:test exit ${child.status}`);
  for (const line of marker) t.diagnostic(line);
}

test('removing a real key makes the key acceptance test fail', { skip: IS_MUTANT }, (t) => {
  const f = fixture(t), manifest = JSON.parse(readFileSync(f.manifest, 'utf8'));
  delete manifest.files.find((f) => f.glb === pack('flat')).assets.garment_teen_tshirt_cream_small_flat; writeJSON(f.manifest, manifest);
  rejects(validate(f.models, f.cataloguePath), /missing required teen state garment_teen_tshirt_cream_small_flat/);
  assertAcceptanceFails(t, f, 'every required key', /every independent garment\/size\/state key must exist/);
});

for (const suffix of ['', '_lod']) test(`oversize real ${suffix ? 'LOD' : 'high'} piece makes the size acceptance test fail`, { skip: IS_MUTANT }, (t) => {
  const f = fixture(t), original = fingerprint(join(MODELS, pack('flat', !!suffix))), key = `garment_teen_tshirt_cream_small_flat${suffix}`;
  mutateGLB(suffix ? f.lod : f.glb, (g) => {
    const root = g.nodes.find((n) => n.name === key);
    assert.ok(root?.children?.length, 'export must have child meshes beneath an identity root');
    for (const index of root.children) {
      const child = g.nodes[index];
      if (child.matrix) { for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) child.matrix[col * 4 + row] *= 3; }
      else child.scale = (child.scale ?? [1, 1, 1]).map((x) => x * 3);
    }
  });
  rejects(validate(f.models, f.cataloguePath), /longest side .* outside expected/);
  assertAcceptanceFails(t, f, 'every piece is inside', /longest side .* outside expected/);
  assert.equal(fingerprint(join(MODELS, pack('flat', !!suffix))), original, 'negative test must leave the checked-in GLB untouched');
});

for (const suffix of ['', '_lod']) test(`extra real ${suffix ? 'LOD' : 'high'} triangle batches make the triangle acceptance test fail`, { skip: IS_MUTANT }, (t) => {
  const f = fixture(t), original = fingerprint(join(MODELS, pack('flat', !!suffix))), key = `garment_teen_tshirt_cream_small_flat${suffix}`;
  mutateGLB(suffix ? f.lod : f.glb, (g, parsed) => {
    const mesh = g.meshes[descendantMeshes(g, key)[0]], batch = structuredClone(mesh.primitives[0]);
    const batchTriangles = (batch.indices === undefined ? parsed.accessors[batch.attributes.POSITION].count : parsed.accessors[batch.indices].count) / 3;
    const cap = suffix ? 240 : 800;
    for (let i = 0; i < Math.ceil((cap + 1) / batchTriangles); i++) mesh.primitives.push(structuredClone(batch));
  });
  rejects(validate(f.models, f.cataloguePath), suffix ? /triangles exceed 240/ : /triangles exceed 800/);
  assertAcceptanceFails(t, f, 'every piece stays within', suffix ? /triangles exceed 240/ : /triangles exceed 800/);
  assert.equal(fingerprint(join(MODELS, pack('flat', !!suffix))), original);
});

test('extra payload makes the same byte-budget acceptance test fail', { skip: IS_MUTANT }, (t) => {
  const f = fixture(t);
  writeFileSync(join(f.models, 'garments-teen/teen/accidental-payload.bin'), Buffer.alloc(3_500_000));
  rejects(validate(f.models, f.cataloguePath), /teen runtime library .* exceeding 3500000/);
  assertAcceptanceFails(t, f, 'complete generated payload', /teen runtime payload .* exceeds 3500000/);
});

test('mutable catalogue and manifest cannot relax independent dimensions or budgets', { skip: IS_MUTANT }, (t) => {
  const f = fixture(t), manifest = JSON.parse(readFileSync(f.manifest, 'utf8')), catalogue = JSON.parse(readFileSync(f.cataloguePath, 'utf8'));
  manifest.limits = { triangles: 8000, lodTriangles: 2400, runtimeBytes: 7_000_000 };
  catalogue.garments[0].width *= 10;
  writeJSON(f.manifest, manifest); writeJSON(f.cataloguePath, catalogue);
  const report = validate(f.models, f.cataloguePath);
  rejects(report, /reference dimensions must be/);
  for (const cap of [800, 240, 3500000]) rejects(report, new RegExp(`limit '.*'.*exceeds ${cap}`));
});

test('unlisted teen GLBs are rejected instead of hiding inside the payload budget', { skip: IS_MUTANT }, (t) => {
  const f = fixture(t);
  writeFileSync(join(f.models, 'garments-teen/teen/unlisted.glb'), Buffer.alloc(16));
  rejects(validate(f.models, f.cataloguePath), /unlisted teen GLB/);
});

test('malformed variant lists are reported without aborting validation', { skip: IS_MUTANT }, (t) => {
  const f = fixture(t), manifest = JSON.parse(readFileSync(f.manifest, 'utf8')), catalogue = JSON.parse(readFileSync(f.cataloguePath, 'utf8'));
  catalogue.garments[0].variants = {};
  manifest.files.find((f) => f.glb === pack('flat')).assets.garment_teen_tshirt_cream_small_flat.variants = {};
  writeJSON(f.manifest, manifest); writeJSON(f.cataloguePath, catalogue);
  const report = validate(f.models, f.cataloguePath);
  rejects(report, /invalid teen variants/);
  rejects(report, /wrong defaultVariant/);
});

function runCLI(args) {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [join(ROOT, 'tools/blender/garments_validate.mjs'), ...args], {
    encoding: 'utf8', timeout: 30_000, windowsHide: true, env,
  });
  assert.ifError(result.error);
  return { ...result, output: result.stdout + result.stderr };
}

test('complete CLI validates all three libraries by default and honors explicit size selectors', { skip: IS_MUTANT }, () => {
  for (const args of [['--complete'], ['--all', '--complete']]) {
    const r = runCLI(args);
    assert.equal(r.status, 0, r.output);
    assert.match(r.output, /^PASS garments \(complete\): 67 states, 23 garments,/m);
    assert.match(r.output, /^PASS garments-child \(complete\): 57 states, 20 garments,/m);
    assert.match(r.output, /^PASS garments-teen \(complete\): 162 states, 29 garments,/m);
    assert.equal(r.output.split('\n').filter((line) => line.startsWith('PASS ')).length, 3);
  }
  for (const [selector, name] of [['adult', 'garments'], ['child', 'garments-child'], ['teen', 'garments-teen']]) {
    const r = runCLI([`--${selector}`, '--complete']);
    assert.equal(r.status, 0, r.output);
    assert.match(r.output, new RegExp(`^PASS ${name} \\(complete\\):`, 'm'));
    assert.equal(r.output.split('\n').filter((line) => line.startsWith('PASS ')).length, 1);
  }
  const legacy = runCLI(['--complete', '--root', MODELS, '--catalogue', join(ROOT, 'tools/blender/garments.catalog.json')]);
  assert.equal(legacy.status, 0, `the unchanged adult builder CLI must remain valid: ${legacy.output}`);
  assert.match(legacy.output, /^PASS garments \(complete\): 67 states,/m);
  assert.equal(legacy.output.split('\n').filter((line) => line.startsWith('PASS ')).length, 1);
  const ambiguous = runCLI(['--all', '--catalogue', join(ROOT, 'tools/blender/garments.catalog.json')]);
  assert.equal(ambiguous.status, 1);
  assert.match(ambiguous.output, /cannot be combined/);
  const mixed = runCLI(['--teen', '--child', '--complete']);
  assert.equal(mixed.status, 1);
  assert.match(mixed.output, /mutually exclusive/);
});

test('teen recipes cover both sizes with drawers, wardrobes and school lockers', () => {
  const manifest = readManifest(), assets = new Map(assetEntries(manifest));
  const recipes = JSON.parse(readFileSync(join(MODELS, 'garments-teen/assortments.json'), 'utf8'));
  assert.equal(recipes.sizeTag, 'teen');
  assert.deepEqual(recipes.roomKinds.toSorted(), ['school_locker', 'teen_bedroom']);
  for (const size of ['small', 'big']) {
    const bindings = recipes.bindings.filter((b) => b.sizeClass === size), assigned = new Set();
    assert.ok(bindings.some((b) => b.kind === 'drawer' && b.roomKinds.includes('teen_bedroom')), `${size}: drawer recipe missing`);
    assert.ok(bindings.some((b) => b.kind === 'wardrobe' && b.roomKinds.includes('teen_bedroom')), `${size}: wardrobe recipe missing`);
    assert.ok(bindings.some((b) => b.kind === 'wardrobe' && b.roomKinds.includes('school_locker') && b.catalogueKeys.includes('locker_pair')),
      `${size}: school locker recipe missing`);
    for (const binding of bindings) {
      assert.equal(binding.sizeTag, 'teen');
      for (const item of binding.items) {
        const asset = assets.get(item.asset);
        assert.ok(asset, `${binding.id}: unknown recipe asset ${item.asset}`);
        assert.equal(item.sizeTag, 'teen');
        assert.equal(item.sizeClass, size);
        assert.equal(asset.sizeClass, size);
        assert.ok(asset.variants.includes(item.variant), `${binding.id}: recipe variant unavailable`);
        assert.ok(Number.isInteger(item.count) && item.count > 0);
        if (binding.kind === 'drawer') assert.equal(asset.state, 'folded');
        if (asset.state === 'flat') assert.equal(item.support, 'shelf');
        assigned.add(asset.styleId);
      }
    }
    assert.deepEqual([...assigned].sort(), [...REQUIRED_TEEN_GARMENTS].sort(), `${size}: every style needs an explicit recipe`);
  }
});

test('extra teen texture pages are rejected even when the byte budget still passes', { skip: IS_MUTANT }, (t) => {
  const f = fixture(t);
  cpSync(join(f.models, 'garments-teen/teen/fabrics.png'), join(f.models, 'garments-teen/teen/duplicate.png'));
  assert.ok(runtimeBytes(f.models) < TEEN_LIMITS.runtimeBytes, 'this mutation must isolate texture-page policy from payload size');
  rejects(validate(f.models, f.cataloguePath), /additional teen texture page/);
});
