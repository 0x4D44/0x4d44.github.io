// Real shipped-file checks plus malicious/corrupt input fixtures. Each test has
// a deliberate input mutation; substation-mutations.mjs runs it and requires
// the named assertion to fail. Mutations never alter repository assets or gates.
import './nice.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT, MAX_MODEL_BYTES, MAX_TEXTURE_BYTES, MAX_GPU_BYTES, parseGlb, inspectGlb, inspectPng, validatePlan, validateSubstation } from '../tools/blender/substation_validate.mjs';

const MANIFEST = 'assets/models/manifest.substation.json';
const CATALOGUE = 'tools/blender/substation.catalog.json';
const MATERIALS = 'assets/models/substation/materials.json';
const PLAN = 'assets/models/substation/substation-plan.json';
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const saveJson = (path, data) => writeFileSync(path, JSON.stringify(data));
const message = (report) => report.errors.join('\n');
const injected = (id) => process.env.SUBSTATION_MUTANT === id;

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ladera-substation-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of [MANIFEST, CATALOGUE, 'assets/models/substation', 'assets/textures/substation', 'assets/models/manifest.json', 'assets/textures/manifest.json']) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    cpSync(resolve(ROOT, path), resolve(root, path), { recursive: true });
  }
  return root;
}
function editJson(root, path, edit) { const file = resolve(root, path), json = readJson(file); edit(json); saveJson(file, json); }
function encode(json, binary) {
  const raw = Buffer.from(JSON.stringify(json)), j = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 32); raw.copy(j);
  const b = Buffer.alloc(Math.ceil(binary.length / 4) * 4); binary.copy(b);
  const out = Buffer.alloc(28 + j.length + b.length);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(j.length, 12); out.writeUInt32LE(0x4e4f534a, 16); j.copy(out, 20);
  out.writeUInt32LE(b.length, 20 + j.length); out.writeUInt32LE(0x004e4942, 24 + j.length); b.copy(out, 28 + j.length);
  return out;
}
function mini() {
  const binary = Buffer.alloc(102), views = [], accessors = []; let offset = 0;
  const attribute = (values, type, extras = {}) => {
    const start = offset; for (const value of values) { binary.writeFloatLE(value, offset); offset += 4; }
    views.push({ buffer: 0, byteOffset: start, byteLength: offset - start });
    accessors.push({ bufferView: views.length - 1, componentType: 5126, type, count: 3, ...extras }); return accessors.length - 1;
  };
  const POSITION = attribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 'VEC3', { min: [0, 0, 0], max: [1, 1, 0] });
  const NORMAL = attribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 'VEC3');
  const TEXCOORD_0 = attribute([0, 0, 1, 0, 0, 1], 'VEC2');
  binary.writeUInt16LE(0, offset); binary.writeUInt16LE(1, offset + 2); binary.writeUInt16LE(2, offset + 4);
  views.push({ buffer: 0, byteOffset: offset, byteLength: 6 });
  accessors.push({ bufferView: views.length - 1, componentType: 5123, count: 3, type: 'SCALAR' });
  return encode({ asset: { version: '2.0' }, buffers: [{ byteLength: binary.length }], bufferViews: views, accessors,
    materials: [{ name: 'substation_steel' }], meshes: [{ primitives: [{ attributes: { POSITION, NORMAL, TEXCOORD_0 }, indices: 3, material: 0 }] }],
    nodes: [{ name: 'substation_fixture', mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0 }, binary);
}
function defect(bytes, edit) { const { json, bin } = parseGlb(bytes), copy = Buffer.from(bin); edit(json, copy); return encode(json, copy); }
function inspectMini(t, bytes, definitions = { materials: { substation_steel: { tile: 'steel' } }, atlas: { tiles: { steel: [0, 0, 1, 1] } } }) {
  const dir = mkdtempSync(join(tmpdir(), 'substation-glb-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'fixture.glb'); writeFileSync(path, bytes);
  return inspectGlb(path, definitions);
}
function editGlb(root, file, edit, updateHash = true) {
  const path = resolve(root, 'assets/models', file.glb), bytes = defect(readFileSync(path), edit); writeFileSync(path, bytes);
  if (updateHash) editJson(root, MANIFEST, (manifest) => {
    const metadata = manifest.files.find((entry) => entry.glb === file.glb);
    metadata.bytes = bytes.length; metadata.sha256 = createHash('sha256').update(bytes).digest('hex');
  });
}
const rejectMini = (t, id, mutate, pattern) => {
  // A rejection test's mutation replaces its corrupt fixture with valid data;
  // the unchanged assert.throws must then fail. This checks the test itself.
  const bytes = injected(id) ? mini() : defect(mini(), mutate);
  assert.throws(() => inspectMini(t, bytes), pattern);
};

const CASES = [
  { id: 'complete', name: 'complete library decodes every catalogue item and LOD within all byte budgets', run(t) {
    const root = fixture(t);
    if (injected('complete')) { const m = readJson(resolve(root, MANIFEST)); rmSync(resolve(root, 'assets/models', m.files[0].glb)); }
    const report = validateSubstation({ projectRoot: root, complete: true });
    assert.equal(report.ok, true, message(report));
    const catalogue = readJson(resolve(root, CATALOGUE));
    assert.equal(report.baseAssets, catalogue.assets.length); assert.equal(report.lodAssets, catalogue.assets.length);
    assert.ok(report.modelBytes > 50_000 && report.modelBytes <= MAX_MODEL_BYTES);
    assert.ok(report.textureBytes > 1000 && report.textureBytes <= MAX_TEXTURE_BYTES && report.gpuBytes <= MAX_GPU_BYTES);
    assert.ok(report.maxLodRatio <= 0.4);
    console.log(`# substation: ${report.baseAssets} near + ${report.lodAssets} LOD1; models ${report.modelBytes}; textures ${report.textureBytes}; GPU ${Math.ceil(report.gpuBytes)} bytes`);
  } },
  { id: 'metric', name: 'metre dimensions come from transformed binary vertices rather than manifest promises', run(t) {
    const root = fixture(t), manifest = readJson(resolve(root, MANIFEST));
    if (!injected('metric')) editGlb(root, manifest.files[0], (g) => {
      const rootNode = g.nodes[g.scenes[0].nodes[0]];
      const index = rootNode.children?.[0] ?? g.scenes[0].nodes[0];
      g.nodes[index].translation = [100, 0, 0];
    });
    const report = validateSubstation({ projectRoot: root, complete: true });
    assert.equal(report.ok, false); assert.match(message(report), /bounds differ|exceeds metre|root transform/);
  } },
  { id: 'binary_header', name: 'binary parser rejects truncated containers and accessor overruns', run(t) {
    const bytes = injected('binary_header') ? mini() : mini().subarray(0, -4);
    assert.throws(() => parseGlb(bytes), /length|truncated/);
    assert.throws(() => parseGlb(defect(mini(), (g) => { g.accessors[0].count = 1_000_000; })), /range.*bufferView/);
  } },
  { id: 'nonfinite', name: 'binary parser rejects non-finite vertex data', run(t) {
    rejectMini(t, 'nonfinite', (g, b) => { b.writeFloatLE(NaN, g.bufferViews[g.accessors[0].bufferView].byteOffset); }, /non-finite/);
  } },
  { id: 'indices', name: 'binary parser rejects triangle indices outside the real vertex array', run(t) {
    rejectMini(t, 'indices', (g, b) => { b.writeUInt16LE(60, g.bufferViews[g.accessors[3].bufferView].byteOffset); }, /index outside/);
  } },
  { id: 'bounds', name: 'accessor min and max cannot conceal changed binary positions', run(t) {
    rejectMini(t, 'bounds', (g) => { g.accessors[0].max[0] = 50; }, /metadata disagrees/);
  } },
  { id: 'winding', name: 'inward winding and degenerate faces are rejected independently of triangle totals', run(t) {
    rejectMini(t, 'winding', (g, b) => { const at = g.bufferViews[g.accessors[3].bufferView].byteOffset; b.writeUInt16LE(2, at + 2); b.writeUInt16LE(1, at + 4); }, /winding disagrees/);
    assert.throws(() => inspectMini(t, defect(mini(), (g, b) => { const at = g.bufferViews[g.accessors[3].bufferView].byteOffset; b.writeUInt16LE(0, at + 2); })), /degenerate/);
  } },
  { id: 'normals', name: 'exported normal vectors must be finite and unit length', run(t) {
    rejectMini(t, 'normals', (g, b) => { b.writeFloatLE(0, g.bufferViews[g.accessors[1].bufferView].byteOffset + 8); }, /non-unit normal/);
  } },
  { id: 'uv', name: 'atlas coordinates must remain inside their assigned tile', run(t) {
    rejectMini(t, 'uv', (g, b) => { b.writeFloatLE(4, g.bufferViews[g.accessors[2].bufferView].byteOffset); }, /atlas UV outside/);
  } },
  { id: 'tile_binding', name: 'unit UV coordinates selecting a different atlas cell are rejected', run(t) {
    const bytes = defect(mini(), (g, b) => {
      const at = g.bufferViews[g.accessors[2].bufferView].byteOffset;
      for (let k = 0; k < 6; k++) b.writeFloatLE(b.readFloatLE(at + k * 4) * (injected('tile_binding') ? 0.25 : 0.75), at + k * 4);
    });
    assert.throws(() => inspectMini(t, bytes, { materials: { substation_steel: { tile: 'steel' } }, atlas: { tiles: { steel: [0, 0, 0.5, 0.5] } } }), /outside assigned atlas tile/);
  } },
  { id: 'sign_orientation', name: 'warning lettering retains upright texture orientation after Blender export', run(t) {
    const bytes = defect(mini(), (g, b) => {
      g.materials[0].name = 'substation_sign_danger';
      if (!injected('sign_orientation')) {
        const at = g.bufferViews[g.accessors[2].bufferView].byteOffset;
        for (let k = 0; k < 3; k++) b.writeFloatLE(1 - b.readFloatLE(at + k * 8 + 4), at + k * 8 + 4);
      }
    });
    assert.throws(() => inspectMini(t, bytes, { materials: { substation_sign_danger: { tile: 'danger' } }, atlas: { tiles: { danger: [0, 0, 1, 1] } } }), /vertically flipped/);
  } },
  { id: 'dependencies', name: 'unknown materials and embedded image dependencies are rejected', run(t) {
    rejectMini(t, 'dependencies', (g) => { g.materials[0].name = 'unregistered_material'; }, /unknown library material/);
    assert.throws(() => inspectMini(t, defect(mini(), (g) => { g.images = [{ uri: 'data:image/png;base64,AAAA' }]; })), /images and textures/);
  } },
  { id: 'node_graph', name: 'cyclic, duplicate and orphan nodes cannot masquerade as a complete asset', run(t) {
    rejectMini(t, 'node_graph', (g) => { g.nodes[0].children = [0]; }, /cyclic/);
    assert.throws(() => inspectMini(t, defect(mini(), (g) => { g.nodes.push({ name: 'orphan' }); })), /orphan/);
    assert.throws(() => inspectMini(t, defect(mini(), (g) => { g.nodes.push({ ...g.nodes[0] }); g.scenes[0].nodes.push(1); })), /duplicate/);
  } },
  { id: 'shared_mesh', name: 'mesh instancing is accepted while every instance contributes triangles and metre bounds', run(t) {
    const input = defect(mini(), (g) => {
      g.nodes = [{ name: 'substation_fixture', children: [1, 2] }, { name: 'first', mesh: 0 }, { name: 'second', mesh: 0, translation: [injected('shared_mesh') ? 20 : 2, 0, 0] }];
    });
    const result = inspectMini(t, input), asset = result.assets.get('substation_fixture');
    assert.equal(result.uniqueMeshes, 1); assert.equal(asset.triangles, 2); assert.deepEqual(asset.max, [3, 1, 0]);
  } },
  { id: 'metadata', name: 'a forged triangle count and checksum fail against the generated file bytes', run(t) {
    const root = fixture(t);
    if (!injected('metadata')) editJson(root, MANIFEST, (m) => { Object.values(m.files[0].assets)[0].triangles = 1; });
    let report = validateSubstation({ projectRoot: root, complete: true });
    assert.equal(report.ok, false); assert.match(message(report), /triangle\/part metadata/);
    editJson(root, MANIFEST, (m) => { m.files[0].sha256 = '0'.repeat(64); });
    report = validateSubstation({ projectRoot: root, complete: true });
    assert.match(message(report), /SHA-256/);
  } },
  { id: 'lod', name: 'full-detail geometry relabelled as LOD cannot evade the forty-percent cap', run(t) {
    const root = fixture(t), manifest = readJson(resolve(root, MANIFEST));
    if (!injected('lod')) {
      const near = manifest.files.find((f) => Object.keys(f.assets).some((k) => !k.endsWith('_lod1')));
      const far = manifest.files.find((f) => Object.keys(f.assets).every((k) => k.endsWith('_lod1')));
      assert.ok(near && far, 'separate packed near and LOD files are required by this pipeline');
      const parsed = parseGlb(readFileSync(resolve(root, 'assets/models', near.glb)));
      for (const n of parsed.json.nodes) n.name = n.name + '_lod1';
      const bytes = encode(parsed.json, parsed.bin); writeFileSync(resolve(root, 'assets/models', far.glb), bytes);
      editJson(root, MANIFEST, (m) => {
        const dest = m.files.find((f) => f.glb === far.glb); dest.assets = {};
        for (const [key, value] of Object.entries(near.assets)) dest.assets[key + '_lod1'] = { ...value, node: key + '_lod1' };
        if (near.sharedMeshAliases != null) dest.sharedMeshAliases = near.sharedMeshAliases;
        dest.bytes = bytes.length; dest.sha256 = createHash('sha256').update(bytes).digest('hex');
      });
    }
    const report = validateSubstation({ projectRoot: root, complete: true });
    assert.equal(report.ok, false); assert.match(message(report), /exceeds40%/);
  } },
  { id: 'triangle_cap', name: 'duplicated real mesh instances exceed the per-piece triangle cap even with honest metadata', run(t) {
    const root = fixture(t), manifest = readJson(resolve(root, MANIFEST));
    if (!injected('triangle_cap')) {
      const key = 'substation_conductor_segment', file = manifest.files.find((f) => f.assets[key]), before = file.assets[key];
      const copies = Math.floor(3000 / before.triangles) + 1;
      let addedInstances = 0;
      editGlb(root, file, (g) => {
        const asset = g.nodes.find((n) => n.name === key), children = [...asset.children];
        assert.ok(children.length && children.every((i) => g.nodes[i].mesh != null && !g.nodes[i].children?.length));
        for (let n = 1; n < copies; n++) for (const child of children) {
          asset.children.push(g.nodes.length); g.nodes.push({ ...g.nodes[child], name: `${key}-duplicate-${n}-${child}` }); addedInstances++;
        }
      });
      editJson(root, MANIFEST, (m) => {
        const f = m.files.find((f) => f.glb === file.glb); f.assets[key].triangles *= copies; f.assets[key].parts *= copies;
        if (f.sharedMeshAliases != null) f.sharedMeshAliases += addedInstances;
      });
    }
    const report = validateSubstation({ projectRoot: root, complete: true });
    assert.equal(report.ok, false); assert.match(message(report), /triangle cap 3000 exceeded/);
  } },
  { id: 'paths', name: 'manifest paths cannot escape the substation payload directory', run(t) {
    const root = fixture(t);
    if (!injected('paths')) editJson(root, MANIFEST, (m) => { m.files[0].glb = '../outside.glb'; });
    const report = validateSubstation({ projectRoot: root, complete: true });
    assert.equal(report.ok, false); assert.match(message(report), /path must be within/);
  } },
  { id: 'stale_budget', name: 'undeclared and stale files still count against the strict model budget', run(t) {
    const root = fixture(t);
    if (!injected('stale_budget')) writeFileSync(resolve(root, 'assets/models/substation/obsolete.bin'), Buffer.alloc(MAX_MODEL_BYTES + 1));
    const report = validateSubstation({ projectRoot: root, complete: true });
    assert.equal(report.ok, false); assert.ok(report.modelBytes > MAX_MODEL_BYTES); assert.match(message(report), /model payload.*exceeds/);
  } },
  { id: 'atlas', name: 'the PBR atlas channels contain complete independently decoded PNG rasters', run(t) {
    const root = fixture(t), materials = readJson(resolve(root, MATERIALS));
    for (const channel of ['map', 'normal', 'orm']) {
      const path = resolve(root, 'assets/models/substation', materials.atlas[channel]);
      let data = readFileSync(path);
      if (injected('atlas') && channel === 'map') data = data.subarray(0, 50);
      const info = inspectPng(data, channel === 'map' ? 2048 : 1024);
      assert.ok(info.width > 0 && info.height > 0 && info.gpuBytes > 0);
    }
  } },
  { id: 'anchors', name: 'equipment exposes named lamp, hinge, hum and noncollapsed navigation data', run(t) {
    const root = fixture(t);
    if (injected('anchors')) editJson(root, CATALOGUE, (c) => { c.assets[0].keepOut = [[0, 0], [0, 0], [0, 0]]; });
    const report = validateSubstation({ projectRoot: root, complete: true }); assert.equal(report.ok, true, message(report));
    const cat = readJson(resolve(root, CATALOGUE));
    const hum = cat.assets.filter((a) => a.anchors.hum);
    assert.ok(hum.length >= 2, 'power transformer families require hum anchors');
    assert.ok(hum.every((a) => a.anchors.hum.frequencyHz === 100));
    assert.ok(cat.assets.some((a) => a.anchors.lamps.length) && cat.assets.some((a) => a.anchors.hinges.length));
  } },
  { id: 'isolation', name: 'the offline library and atlas cannot enter the production boot manifests', run(t) {
    const root = fixture(t);
    if (!injected('isolation')) editJson(root, 'assets/models/manifest.json', (m) => { m.files.push('manifest.substation.json'); });
    const report = validateSubstation({ projectRoot: root, complete: true });
    assert.equal(report.ok, false); assert.match(message(report), /must not be registered/);
  } },
  { id: 'plan_units', name: 'yard layout remains explicit metre data with a visual-clearance qualification', run(t) {
    const root = fixture(t);
    if (!injected('plan_units')) editJson(root, PLAN, (p) => { p.units = 'feet'; });
    const report = validateSubstation({ projectRoot: root, complete: true });
    assert.equal(report.ok, false); assert.match(message(report), /yard plan must use metres/);
  } },
  { id: 'plan_refs', name: 'yard placements resolve every equipment type to an actual catalogue asset', run() {
    const plan = readJson(resolve(ROOT, PLAN)), catalogue = readJson(resolve(ROOT, CATALOGUE));
    if (!injected('plan_refs')) plan.equipment[0].asset = 'substation_does_not_exist';
    assert.throws(() => validatePlan(plan, catalogue.assets), /unknown catalogue asset/);
  } },
  { id: 'plan_clearance', name: 'live conductor fence crossings respect the declared visual clearance height', run() {
    const plan = readJson(resolve(ROOT, PLAN)), catalogue = readJson(resolve(ROOT, CATALOGUE));
    if (!injected('plan_clearance')) { plan.spans[0].start[1] = 2; plan.spans[0].end[1] = 2; }
    assert.throws(() => validatePlan(plan, catalogue.assets), /clearance height at fence crossing/);
  } },
  { id: 'plan_phases', name: 'three-phase equipment positions retain their declared spacing', run() {
    const plan = readJson(resolve(ROOT, PLAN)), catalogue = readJson(resolve(ROOT, CATALOGUE));
    if (!injected('plan_phases')) plan.equipment.find((item) => item.id === 'CT-132-1-B').position = [...plan.equipment.find((item) => item.id === 'CT-132-1-A').position];
    assert.throws(() => validatePlan(plan, catalogue.assets), /actual phase spacing/);
  } },
  { id: 'plan_required', name: 'the yard data includes the full twelve-panel indoor switchboard', run() {
    const plan = readJson(resolve(ROOT, PLAN)), catalogue = readJson(resolve(ROOT, CATALOGUE));
    if (!injected('plan_required')) plan.equipment = plan.equipment.filter((item) => item.id !== '11KV-PANEL-12');
    assert.throws(() => validatePlan(plan, catalogue.assets), /twelve panels/);
  } },
  { id: 'plan_boundary', name: 'ordinary equipment centres stay within the compound while line towers are external', run() {
    const plan = readJson(resolve(ROOT, PLAN)), catalogue = readJson(resolve(ROOT, CATALOGUE));
    if (!injected('plan_boundary')) plan.equipment.find((item) => item.id === 'FLOOD-1').position[0] = 100;
    assert.throws(() => validatePlan(plan, catalogue.assets), /centre lies outside compound/);
  } },
  { id: 'cli', name: 'complete validator CLI returns success under the executing Node runtime', run(t) {
    const args = [fileURLToPath(new URL('../tools/blender/substation_validate.mjs', import.meta.url)), '--complete', '--json'];
    if (injected('cli')) args.push('--root', join(tmpdir(), 'substation-does-not-exist-500ad'));
    const result = spawnSync(process.execPath, args, { encoding: 'utf8', windowsHide: true, timeout: 120_000 });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr || result.stdout); assert.equal(JSON.parse(result.stdout).ok, true);
  } },
];

if (process.argv.includes('--list-mutations')) console.log(JSON.stringify(CASES.map(({ id, name }) => ({ id, name }))));
else for (const { name, run } of CASES) test(name, run);
