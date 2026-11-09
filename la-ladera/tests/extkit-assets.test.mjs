// Every test has a real input mutant. extkit-mutations.mjs reruns each exact
// named test and accepts only its assertion failure, never a process crash.
import './nice.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ROOT, MANIFEST, CATALOGUE, MATERIALS, MAX_GLB_BYTES, MAX_TEXTURE_BYTES, MAX_GPU_BYTES,
  parseGlb, inspectGlb, inspectPng,
  inspectKtx2, decodeKtx2, seamMetrics, validateCatalogue, validateMaterialDefinitions,
  inspectTextures, validateNormalPixels, validateInventory, validateDormancy, validateExtkit,
} from '../tools/blender/extkit_validate.mjs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const saveJson = (path, data) => writeFileSync(path, JSON.stringify(data));
const injected = (id) => process.env.EXTKIT_MUTANT === id;
const message = (report) => report.errors.join('\n');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const catalogue = () => readJson(resolve(ROOT, CATALOGUE));
const definitions = () => readJson(resolve(ROOT, MATERIALS));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ladera-extkit-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of [MANIFEST, CATALOGUE, 'assets/models/extkit', 'assets/textures/extkit', 'assets/models/manifest.json', 'assets/textures/manifest.json']) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    cpSync(resolve(ROOT, path), resolve(root, path), { recursive: true });
  }
  return root;
}
function editJson(root, path, edit) { const file = resolve(root, path), json = readJson(file); edit(json); saveJson(file, json); }
function refreshArtifact(root, path) {
  const bytes = readFileSync(resolve(root, path));
  editJson(root, MANIFEST, (m) => {
    const entry = m.artifacts.find((f) => f.path === path);
    assert.ok(entry, `fixture artifact not found: ${path}`);
    entry.bytes = bytes.length; entry.sha256 = sha(bytes);
  });
}
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
    const start = offset;
    for (const value of values) { binary.writeFloatLE(value, offset); offset += 4; }
    views.push({ buffer: 0, byteOffset: start, byteLength: offset - start });
    accessors.push({ bufferView: views.length - 1, componentType: 5126, type, count: 3, ...extras });
    return accessors.length - 1;
  };
  const POSITION = attribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 'VEC3', { min: [0, 0, 0], max: [1, 1, 0] });
  const NORMAL = attribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 'VEC3');
  const TEXCOORD_0 = attribute([0, 0, 1, 0, 0, 1], 'VEC2');
  binary.writeUInt16LE(0, offset); binary.writeUInt16LE(1, offset + 2); binary.writeUInt16LE(2, offset + 4);
  views.push({ buffer: 0, byteOffset: offset, byteLength: 6 });
  accessors.push({ bufferView: views.length - 1, componentType: 5123, count: 3, type: 'SCALAR' });
  return encode({ asset: { version: '2.0' }, buffers: [{ byteLength: binary.length }], bufferViews: views, accessors,
    materials: [{ name: 'extkit_steel' }], meshes: [{ primitives: [{ attributes: { POSITION, NORMAL, TEXCOORD_0 }, indices: 3, material: 0 }] }],
    nodes: [{ name: 'extkit_fixture', mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0 }, binary);
}
function defect(bytes, edit) { const { json, bin } = parseGlb(bytes), copy = Buffer.from(bin); edit(json, copy); return encode(json, copy); }
function inspectMini(t, bytes, materials = { materials: { extkit_steel: { tile: 'extkit_steel' } }, atlas: { tiles: { extkit_steel: [0, 0, 1, 1] } } }) {
  const dir = mkdtempSync(join(tmpdir(), 'extkit-glb-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'fixture.glb'); writeFileSync(path, bytes);
  return inspectGlb(path, materials);
}
function rejectMini(t, id, mutate, pattern) {
  const bytes = injected(id) ? mini() : defect(mini(), mutate);
  assert.throws(() => inspectMini(t, bytes), pattern);
}
function editGlb(root, file, edit) {
  const path = 'assets/models/' + file.glb, bytes = defect(readFileSync(resolve(root, path)), edit);
  writeFileSync(resolve(root, path), bytes);
  editJson(root, MANIFEST, (m) => { const f = m.files.find((f) => f.glb === file.glb); f.bytes = bytes.length; f.sha256 = sha(bytes); });
  refreshArtifact(root, path);
}
function firstWall(channel = 'map') {
  const m = definitions(); return readFileSync(resolve(ROOT, 'assets/models/extkit', m.walls[0][channel]));
}
function rejectCatalogue(id, edit, pattern) {
  const c = catalogue(); if (!injected(id)) edit(c);
  assert.throws(() => validateCatalogue(c), pattern);
}

const CASES = [
  { id: 'complete', name: 'the complete dormant library decodes every near and LOD root inside all budgets', run(t) {
    const root = fixture(t);
    if (injected('complete')) rmSync(resolve(root, 'assets/models/extkit/extkit_lod.glb'));
    const report = validateExtkit({ projectRoot: root, complete: true });
    assert.equal(report.ok, true, message(report));
    assert.equal(report.baseAssets, catalogue().assets.length); assert.equal(report.lodAssets, report.baseAssets);
    assert.ok(report.glbBytes > 50_000 && report.glbBytes <= MAX_GLB_BYTES);
    assert.ok(report.textureBytes > 1000 && report.textureBytes <= MAX_TEXTURE_BYTES);
    assert.ok(report.gpuBytes > 30_000_000 && report.gpuBytes <= MAX_GPU_BYTES);
    assert.ok(report.maxLodRatio <= .4 && report.maxTriangles <= 6000 && report.maxSmallTriangles <= 2000);
    assert.equal(report.textures.length, 39);
    console.log(`# extkit: ${report.baseAssets} near + ${report.lodAssets} LOD; GLBs ${report.glbBytes}; textures ${report.textureBytes}; GPU ${report.gpuBytes} bytes`);
  } },
  { id: 'family_coverage', name: 'fixed family requirements reject a catalogue with all six plants removed', run() {
    rejectCatalogue('family_coverage', (c) => { c.assets = c.assets.filter((a) => a.family !== 'plant'); }, /required family plant/);
  } },
  { id: 'tank_variants', name: 'tank capacity colour and stand combinations are checked independently', run() {
    rejectCatalogue('tank_variants', (c) => { c.assets.find((a) => a.id === 'extkit_tank_500_blue_block').params.stand = 'steel'; }, /water tanks missing 500 litre blue block/);
  } },
  { id: 'rebar_variants', name: 'all three rebar lengths must include both rust levels', run() {
    rejectCatalogue('rebar_variants', (c) => { c.assets.find((a) => a.id === 'extkit_rebar_55_heavy').params.rustLevel = 'light'; }, /rebar missing length 0.55 rust heavy/);
  } },
  { id: 'pipe_variants', name: 'pipe and drain catalogues retain their straight elbow tee and wall bracket designs', run() {
    rejectCatalogue('pipe_variants', (c) => { c.assets.find((a) => a.id === 'extkit_drain_tee').params.shape = 'elbow'; }, /drain missing tee/);
  } },
  { id: 'grille_patterns', name: 'eight grille names cannot disguise duplicate pattern parameters', run() {
    rejectCatalogue('grille_patterns', (c) => { c.assets.find((a) => a.id === 'extkit_grille_8').params.pattern = 0; }, /eight distinct patterns/);
  } },
  { id: 'anchors', name: 'every piece has a valid wall side height range clearance and facade zones', run() {
    rejectCatalogue('anchors', (c) => { c.assets[0].anchors.heightRange = [4, 1]; }, /invalid height range/);
    const bad = catalogue(); bad.assets[0].anchors.facadeZones = ['front'];
    assert.throws(() => validateCatalogue(bad), /invalid facade zones/);
    bad.assets[0].anchors.facadeZones = ['roof']; bad.assets[0].anchors.normal = [0, 0, 0];
    assert.throws(() => validateCatalogue(bad), /unit normal/);
  } },
  { id: 'small_classification', name: 'small prop triangle limits cannot be bypassed by relabelling the catalogue flag', run() {
    rejectCatalogue('small_classification', (c) => { c.assets.find((a) => a.family === 'satellite_dish').smallProp = false; }, /small-prop classification/);
  } },
  { id: 'short_cables', name: 'facade cable assets remain short instancing segments rather than long span meshes', run() {
    rejectCatalogue('short_cables', (c) => { c.assets.find((a) => a.family === 'cable_segment').size[0] = 6; }, /short instancing segments/);
  } },
  { id: 'design_cap', name: 'catalogue growth beyond the one hundred and twenty design cap is rejected', run() {
    rejectCatalogue('design_cap', (c) => {
      while (c.assets.length <= 120) c.assets.push({ ...structuredClone(c.assets[0]), id: `extkit_extra_${c.assets.length}` });
    }, /1\.\.120 designs/);
  } },
  { id: 'binary_header', name: 'GLB headers and complete chunk lengths are checked against the actual buffer', run() {
    assert.throws(() => parseGlb(injected('binary_header') ? mini() : mini().subarray(0, -4)), /length|truncated/);
  } },
  { id: 'accessor_range', name: 'accessors cannot overrun their binary buffer views', run() {
    const bytes = injected('accessor_range') ? mini() : defect(mini(), (g) => { g.accessors[0].count = 1_000_000; });
    assert.throws(() => parseGlb(bytes), /range.*bufferView/);
  } },
  { id: 'nonfinite', name: 'NaN vertex values are rejected even when the manifest is otherwise plausible', run(t) {
    rejectMini(t, 'nonfinite', (g, b) => { b.writeFloatLE(NaN, g.bufferViews[g.accessors[0].bufferView].byteOffset); }, /non-finite/);
  } },
  { id: 'indices', name: 'triangle indices must refer to existing binary position vertices', run(t) {
    rejectMini(t, 'indices', (g, b) => { b.writeUInt16LE(600, g.bufferViews[g.accessors[3].bufferView].byteOffset); }, /index outside/);
  } },
  { id: 'accessor_bounds', name: 'declared position bounds cannot conceal different binary geometry', run(t) {
    rejectMini(t, 'accessor_bounds', (g) => { g.accessors[0].max[0] = 15; }, /metadata disagrees/);
  } },
  { id: 'winding', name: 'triangle winding and degenerate faces are checked against actual normals', run(t) {
    rejectMini(t, 'winding', (g, b) => {
      const at = g.bufferViews[g.accessors[3].bufferView].byteOffset; b.writeUInt16LE(2, at + 2); b.writeUInt16LE(1, at + 4);
    }, /winding disagrees/);
    assert.throws(() => inspectMini(t, defect(mini(), (g, b) => { b.writeUInt16LE(0, g.bufferViews[g.accessors[3].bufferView].byteOffset + 2); })), /degenerate/);
  } },
  { id: 'normals', name: 'binary normal vectors must have unit length', run(t) {
    rejectMini(t, 'normals', (g, b) => { b.writeFloatLE(0, g.bufferViews[g.accessors[1].bufferView].byteOffset + 8); }, /non-unit normal/);
  } },
  { id: 'uv_range', name: 'every UV coordinate stays in the atlas unit square', run(t) {
    rejectMini(t, 'uv_range', (g, b) => { b.writeFloatLE(4, g.bufferViews[g.accessors[2].bufferView].byteOffset); }, /atlas UV outside/);
  } },
  { id: 'uv_cell', name: 'unit-square UVs selecting another material cell are also rejected', run(t) {
    const bytes = defect(mini(), (g, b) => {
      const at = g.bufferViews[g.accessors[2].bufferView].byteOffset;
      for (let k = 0; k < 6; k++) b.writeFloatLE(b.readFloatLE(at + k * 4) * (injected('uv_cell') ? .2 : .8), at + k * 4);
    });
    assert.throws(() => inspectMini(t, bytes, { materials: { extkit_steel: { tile: 'extkit_steel' } }, atlas: { tiles: { extkit_steel: [0, 0, .25, .25] } } }), /outside assigned atlas tile/);
  } },
  { id: 'dependencies', name: 'packed GLBs remain texture-free static core glTF with no external dependencies', run(t) {
    rejectMini(t, 'dependencies', (g) => { g.images = [{ uri: 'data:image/png;base64,AAAA' }]; }, /images and textures/);
    assert.throws(() => parseGlb(defect(mini(), (g) => { g.extensionsRequired = ['KHR_draco_mesh_compression']; })), /dependencies/);
    assert.throws(() => parseGlb(defect(mini(), (g) => { g.animations = [{}]; })), /static and unskinned/);
  } },
  { id: 'material_names', name: 'only declared external atlas material names may be used by geometry', run(t) {
    rejectMini(t, 'material_names', (g) => { g.materials[0].name = 'missing_material'; }, /unknown library material/);
  } },
  { id: 'node_graph', name: 'cyclic orphan and duplicate scene nodes cannot conceal missing pieces', run(t) {
    rejectMini(t, 'node_graph', (g) => { g.nodes[0].children = [0]; }, /cyclic/);
    assert.throws(() => inspectMini(t, defect(mini(), (g) => { g.nodes.push({ name: 'orphan' }); })), /orphan/);
    assert.throws(() => inspectMini(t, defect(mini(), (g) => { g.nodes.push({ ...g.nodes[0] }); g.scenes[0].nodes.push(1); })), /duplicate/);
  } },
  { id: 'root_transform', name: 'piece roots have identity transforms rather than hidden rotations or offsets', run(t) {
    rejectMini(t, 'root_transform', (g) => { g.nodes[0].translation = [1, 0, 0]; }, /root transform must be identity/);
  } },
  { id: 'shared_geometry', name: 'repeated mesh instances count toward triangle totals and transformed bounds', run(t) {
    const bytes = defect(mini(), (g) => {
      g.nodes = [{ name: 'extkit_fixture', children: [1, 2] }, { name: 'first', mesh: 0 },
        { name: 'second', mesh: 0, translation: [injected('shared_geometry') ? 20 : 2, 0, 0] }];
    });
    const result = inspectMini(t, bytes), asset = result.assets.get('extkit_fixture');
    assert.equal(result.uniqueMeshes, 1); assert.equal(result.sharedMeshAliases, 1);
    assert.equal(asset.triangles, 2); assert.deepEqual(asset.max, [3, 1, 0]);
  } },
  { id: 'metric_origin', name: 'metre envelopes and floor-centred origins are measured from transformed shipped vertices', run(t) {
    const root = fixture(t), m = readJson(resolve(root, MANIFEST));
    if (!injected('metric_origin')) editGlb(root, m.files[0], (g) => {
      const node = g.nodes[g.scenes[0].nodes[0]], child = node.children?.[0] ?? g.scenes[0].nodes[0];
      g.nodes[child].translation = [100, 0, 0];
    });
    const report = validateExtkit({ projectRoot: root, complete: true });
    assert.equal(report.ok, false); assert.match(message(report), /bounds differ|metre catalogue envelope|root transform/);
  } },
  { id: 'manifest_counts', name: 'forged triangle and part counts fail against decoded GLB primitives', run(t) {
    const root = fixture(t);
    if (!injected('manifest_counts')) editJson(root, MANIFEST, (m) => { Object.values(m.files[0].assets)[0].triangles = 1; });
    const report = validateExtkit({ projectRoot: root, complete: true });
    assert.equal(report.ok, false); assert.match(message(report), /triangle\/part metadata/);
  } },
  { id: 'measured_anchors', name: 'wall anchors follow the decoded near rear plane even when all metadata and hashes agree', run(t) {
    const root = fixture(t), key = 'extkit_laundry_balcony';
    if (!injected('measured_anchors')) {
      let changed;
      editJson(root, CATALOGUE, (c) => {
        const item = c.assets.find((asset) => asset.id === key);
        item.anchors.position[2] -= 0.01;
        changed = structuredClone(item.anchors);
      });
      editJson(root, MANIFEST, (m) => {
        for (const file of m.files) for (const id of [key, key + '_lod1']) {
          if (file.assets[id]) file.assets[id].anchors = structuredClone(changed);
        }
      });
      refreshArtifact(root, CATALOGUE);
    }
    // A stale checksum or catalogue/manifest disagreement must not be the
    // reason this bad placement is rejected.
    assert.equal(validateInventory(root, readJson(resolve(root, MANIFEST))), 43);
    const report = validateExtkit({ projectRoot: root, complete: true });
    assert.equal(report.ok, false);
    assert.match(message(report), /attachment anchor differs from decoded near geometry rear clearance plane/);
    assert.equal(report.errors.length, 1, message(report));
  } },
  { id: 'lod_ratio', name: 'near geometry relabelled as LOD fails the forty-percent triangle ceiling', run(t) {
    const root = fixture(t), manifest = readJson(resolve(root, MANIFEST));
    if (!injected('lod_ratio')) {
      const near = manifest.files.find((f) => f.glb.endsWith('_near.glb')), far = manifest.files.find((f) => f.glb.endsWith('_lod.glb'));
      const parsed = parseGlb(readFileSync(resolve(root, 'assets/models', near.glb)));
      for (const node of parsed.json.nodes) node.name += '_lod1';
      const bytes = encode(parsed.json, parsed.bin), path = 'assets/models/' + far.glb;
      writeFileSync(resolve(root, path), bytes);
      editJson(root, MANIFEST, (m) => {
        const f = m.files.find((f) => f.glb === far.glb); f.assets = {};
        for (const [key, value] of Object.entries(near.assets)) f.assets[key + '_lod1'] = { ...value, node: key + '_lod1' };
        f.sharedMeshAliases = near.sharedMeshAliases; f.bytes = bytes.length; f.sha256 = sha(bytes);
      });
      refreshArtifact(root, path);
    }
    const report = validateExtkit({ projectRoot: root, complete: true });
    assert.equal(report.ok, false); assert.match(message(report), /exceeds 40%/);
  } },
  { id: 'small_triangle_cap', name: 'duplicated small-prop instances exceed the two-thousand triangle cap despite honest metadata', run(t) {
    const root = fixture(t), manifest = readJson(resolve(root, MANIFEST));
    if (!injected('small_triangle_cap')) {
      const key = 'extkit_cable_thin', file = manifest.files.find((f) => f.assets[key]), before = file.assets[key];
      const copies = Math.floor(2000 / before.triangles) + 1; let instances = 0;
      editGlb(root, file, (g) => {
        const asset = g.nodes.find((node) => node.name === key), children = [...asset.children];
        assert.ok(children.every((i) => g.nodes[i].mesh != null && !g.nodes[i].children?.length));
        for (let i = 1; i < copies; i++) for (const child of children) {
          asset.children.push(g.nodes.length); g.nodes.push({ ...g.nodes[child], name: `${key}-duplicate-${i}-${child}` }); instances++;
        }
      });
      editJson(root, MANIFEST, (m) => {
        const f = m.files.find((f) => f.glb === file.glb); f.assets[key].triangles *= copies; f.assets[key].parts *= copies;
        if (f.sharedMeshAliases != null) f.sharedMeshAliases += instances;
      });
    }
    const report = validateExtkit({ projectRoot: root, complete: true });
    assert.equal(report.ok, false); assert.match(message(report), /triangle cap 2000 exceeded/);
  } },
  { id: 'complete_roots', name: 'a catalogue entry without both actual packed roots fails complete validation', run(t) {
    const root = fixture(t);
    if (!injected('complete_roots')) {
      editJson(root, CATALOGUE, (c) => { c.assets.push({ ...structuredClone(c.assets[0]), id: 'extkit_tank_required_extra' }); });
      refreshArtifact(root, CATALOGUE);
    }
    const report = validateExtkit({ projectRoot: root, complete: true });
    assert.equal(report.ok, false); assert.match(message(report), /missing required near\/LOD roots/);
  } },
  { id: 'hash_inventory', name: 'the manifest checks SHA-256 and byte sizes of every payload and catalogue file', run(t) {
    const root = fixture(t);
    if (!injected('hash_inventory')) editJson(root, MANIFEST, (m) => { m.artifacts.find((f) => f.path === MATERIALS).sha256 = '0'.repeat(64); });
    assert.throws(() => validateInventory(root, readJson(resolve(root, MANIFEST))), /artifact SHA-256 differs/);
  } },
  { id: 'unlisted_payload', name: 'unlisted stale model files cannot escape the hashed payload inventory', run(t) {
    const root = fixture(t);
    if (!injected('unlisted_payload')) writeFileSync(resolve(root, 'assets/models/extkit/obsolete.bin'), Buffer.from('undeclared'));
    assert.throws(() => validateInventory(root, readJson(resolve(root, MANIFEST))), /inventory omits payload/);
  } },
  { id: 'namespace_paths', name: 'manifest paths cannot leave the exterior-kit namespace', run(t) {
    const root = fixture(t);
    if (!injected('namespace_paths')) editJson(root, MANIFEST, (m) => { m.artifacts[0].path = 'assets/models/extkit/../../manifest.json'; });
    assert.throws(() => validateInventory(root, readJson(resolve(root, MANIFEST))), /path must stay within/);
  } },
  { id: 'glb_budget', name: 'stale GLB bytes are counted against the four-point-five-million-byte library cap', run(t) {
    const root = fixture(t);
    if (!injected('glb_budget')) writeFileSync(resolve(root, 'assets/models/extkit/obsolete.glb'), Buffer.alloc(MAX_GLB_BYTES + 1));
    const report = validateExtkit({ projectRoot: root, complete: true });
    assert.equal(report.ok, false); assert.ok(report.glbBytes > MAX_GLB_BYTES); assert.match(message(report), /GLB payload.*exceeds/);
  } },
  { id: 'texture_budget', name: 'all texture disk bytes including undeclared files count against eight million bytes', run(t) {
    const root = fixture(t);
    if (!injected('texture_budget')) writeFileSync(resolve(root, 'assets/textures/extkit/obsolete.bin'), Buffer.alloc(MAX_TEXTURE_BYTES + 1));
    assert.throws(() => inspectTextures(root, definitions()), /texture payload.*exceeds/);
  } },
  { id: 'atlas_png', name: 'shared atlas planes have complete independently inflated PNG data and valid CRCs', run() {
    const m = definitions();
    for (const channel of ['map', 'normal', 'orm']) {
      let bytes = readFileSync(resolve(ROOT, 'assets/models/extkit', m.atlas[channel]));
      if (injected('atlas_png') && channel === 'map') bytes = bytes.subarray(0, 50);
      assert.doesNotThrow(() => inspectPng(bytes));
      const info = inspectPng(bytes); assert.deepEqual([info.width, info.height], [512, 512]);
    }
  } },
  { id: 'ktx_container', name: 'compressed wall textures reject truncated KTX2 headers and payloads', run() {
    const bytes = firstWall();
    assert.throws(() => inspectKtx2(injected('ktx_container') ? bytes : bytes.subarray(0, -4)), /KTX2/);
  } },
  { id: 'ktx_mips', name: 'every KTX2 mip declares the independently expected GPU block byte count', run() {
    const bytes = Buffer.from(firstWall());
    if (!injected('ktx_mips')) bytes.writeBigUInt64LE(123n, 96);
    assert.throws(() => inspectKtx2(bytes), /mip.*block byte length/);
  } },
  { id: 'ktx_dfd', name: 'KTX2 colour space and channel descriptors cannot contradict the GPU format', run() {
    const bytes = Buffer.from(firstWall());
    if (!injected('ktx_dfd')) bytes[bytes.readUInt32LE(48) + 14] = 1;
    assert.throws(() => inspectKtx2(bytes), /DFD colour model or transfer/);
  } },
  { id: 'ktx_zlib', name: 'KTX2 compressed payloads are actually inflated rather than trusted by their headers', run() {
    const bytes = Buffer.from(firstWall());
    if (!injected('ktx_zlib')) bytes[Number(bytes.readBigUInt64LE(80))] ^= 0xff;
    assert.throws(() => inspectKtx2(bytes), /ZLIB/);
  } },
  { id: 'ktx_gpu', name: 'GPU memory is measured from all native BC1 and BC5 mip blocks', run() {
    let normal = Buffer.from(firstWall('normal'));
    if (injected('ktx_gpu')) normal = firstWall('map');
    const color = inspectKtx2(firstWall()), n = inspectKtx2(normal);
    const count = (bytesPerBlock) => Array.from({ length: 11 }, (_, i) => Math.ceil(Math.max(1, 1024 >> i) / 4) ** 2 * bytesPerBlock).reduce((a, b) => a + b, 0);
    assert.equal(color.gpuBytes, count(8)); assert.equal(n.gpuBytes, count(16));
    assert.equal(n.vkFormat, 141); assert.equal(color.vkFormat, 132);
  } },
  { id: 'decoded_seams', name: 'seam checks inspect decoded compressed pixel edges rather than producer promises', run() {
    const decoded = decodeKtx2(firstWall());
    if (injected('decoded_seams')) decoded.pixels[0] = (decoded.pixels[0] + 100) % 256;
    const seam = seamMetrics(decoded);
    assert.ok(seam.horizontalMax <= 1 && seam.verticalMax <= 1, JSON.stringify(seam));
  } },
  { id: 'normal_hemisphere', name: 'BC5 normal pixels leave a real positive Z component to reconstruct', run() {
    const decoded = decodeKtx2(firstWall('normal'));
    if (!injected('normal_hemisphere')) { decoded.pixels[0] = 255; decoded.pixels[1] = 255; }
    assert.throws(() => validateNormalPixels(decoded), /outside the unit hemisphere/);
  } },
  { id: 'wall_coverage', name: 'all twelve distinct 1024-square wall material definitions are required', run() {
    const m = definitions();
    if (!injected('wall_coverage')) m.walls.pop();
    assert.throws(() => validateMaterialDefinitions(m), /twelve seamless wall materials/);
  } },
  { id: 'wall_resolution', name: 'wall material definitions cannot silently reduce the requested 1024 resolution', run() {
    const m = definitions();
    if (!injected('wall_resolution')) m.walls[0].size = [512, 512];
    assert.throws(() => validateMaterialDefinitions(m), /1024 square/);
  } },
  { id: 'pbr_semantics', name: 'external PBR bindings distinguish sRGB albedo linear normals and ordered ORM channels', run() {
    const m = definitions();
    if (!injected('pbr_semantics')) m.colorSpace.normal = 'srgb';
    assert.throws(() => validateMaterialDefinitions(m), /colour-space semantics/);
    const bad = definitions(); bad.ormChannels = ['roughness', 'occlusion', 'metallic'];
    assert.throws(() => validateMaterialDefinitions(bad), /ORM channels/);
  } },
  { id: 'atlas_overlap', name: 'shared atlas cells cannot overlap even if all UVs remain inside the unit square', run() {
    const m = definitions();
    if (!injected('atlas_overlap')) { const keys = Object.keys(m.atlas.tiles); m.atlas.tiles[keys[1]] = [...m.atlas.tiles[keys[0]]]; }
    assert.throws(() => validateMaterialDefinitions(m), /atlas tiles overlap/);
  } },
  { id: 'drawn_strings', name: 'unreviewed or decomposed drawn lettering cannot bypass the Colombian Spanish audit', run() {
    rejectCatalogue('drawn_strings', (c) => { c.drawnStrings = ['Menu\u0301 del dia']; }, /valid NFC Unicode/);
  } },
  { id: 'library_flag', name: 'a complete asset manifest must explicitly declare libraryOnly true', run(t) {
    const root = fixture(t);
    if (!injected('library_flag')) editJson(root, MANIFEST, (m) => { m.libraryOnly = false; });
    const report = validateExtkit({ projectRoot: root, complete: true });
    assert.equal(report.ok, false); assert.match(message(report), /libraryOnly must be true/);
  } },
  { id: 'complete_flag', name: 'a partial release cannot pass the complete acceptance command', run(t) {
    const root = fixture(t);
    if (!injected('complete_flag')) editJson(root, MANIFEST, (m) => { m.complete = false; });
    const report = validateExtkit({ projectRoot: root, complete: true });
    assert.equal(report.ok, false); assert.match(message(report), /complete flag is false/);
  } },
  { id: 'boot_isolation', name: 'the dormant exterior kit must not enter either production boot registry', run(t) {
    const root = fixture(t);
    if (!injected('boot_isolation')) editJson(root, 'assets/models/manifest.json', (m) => { m.extkit = 'extkit/extkit_near.glb'; });
    assert.throws(() => validateDormancy(root), /must not be registered in boot manifest/);
  } },
  { id: 'js_isolation', name: 'no production JavaScript module may import or otherwise reference the exterior kit', run(t) {
    const root = fixture(t);
    if (!injected('js_isolation')) { mkdirSync(resolve(root, 'js'), { recursive: true }); writeFileSync(resolve(root, 'js/illegal.js'), "import '../../tools/blender/extkit_validate.mjs';\n"); }
    assert.throws(() => validateDormancy(root), /must stay dormant/);
  } },
  { id: 'cli', name: 'the complete validator CLI succeeds using the same Node runtime as the tests', run() {
    const args = [fileURLToPath(new URL('../tools/blender/extkit_validate.mjs', import.meta.url)), '--complete', '--json'];
    if (injected('cli')) args.push('--root', join(tmpdir(), 'extkit-deliberately-absent-fixture'));
    const result = spawnSync(process.execPath, args, { encoding: 'utf8', windowsHide: true, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr || result.stdout); assert.equal(JSON.parse(result.stdout).ok, true);
  } },
];

if (process.argv.includes('--list-mutations')) console.log(JSON.stringify(CASES.map(({ id, name }) => ({ id, name }))));
else for (const { name, run } of CASES) test(name, run);
