// Actual-asset lifecycle tests for the opt-in wardrobe. No network, browser, Blender or game boot.
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-wear-runtime.test.mjs
import './nice.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, copyFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { gunzipSync, gzipSync } from 'node:zlib';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CharacterLibrary } from '../js/people/rig.js';
import { WearLibrary, loadWearGltf, validateOutfit, WEAR_FITS, WEAR_GARMENTS } from '../js/people/wear.js';
import { skinShade, slotRatio } from '../js/people/look.js';
import { readGlb, parseGlb, decodePrimitive } from '../tools/blender/people_validate.mjs';
import { readPoseBank, skinInfo, sampleRotations, poseMatrices, skinPositions, ClosedSurface } from '../tools/blender/people_wear_math.mjs';
import { wearSources } from '../tools/people_wear_data.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'), MODELS = resolve(ROOT, 'assets/models');
const PEOPLE = ['w_joven', 'm_tendero', 'w_vecina'];
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const bufferOf = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const standard = [{ id: 'tshirt', variant: 'plain_teal' }, { id: 'trousers', variant: 'plain_navy' }, { id: 'shoes', variant: 'plain_charcoal' }];
const cpuDocs = new WeakMap();
const unpackWear = (bytes) => bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
function assertLayerGeometry(item, lod) {
  const source = (lod ? item.source.far : item.source.near).geometry, live = item.mesh.geometry;
  assert.notEqual(live, source, 'a live correction can overwrite the shared garment template');
  assert.notEqual(live.attributes.position, source.attributes.position, 'correction position buffer is not private');
  assert.equal(live.index, source.index, 'garment selected the wrong LOD index buffer');
  for (const name of ['uv', 'skinIndex', 'skinWeight', 'color']) assert.equal(live.attributes[name], source.attributes[name], `${name}: immutable source attribute was duplicated`);
}

function pack(g, bin) {
  let json = Buffer.from(JSON.stringify(g));
  json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
  bin = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]);
  const out = Buffer.alloc(28 + json.length + bin.length);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(json.length, 12); out.writeUInt32LE(0x4e4f534a, 16); json.copy(out, 20);
  out.writeUInt32LE(bin.length, 20 + json.length); out.writeUInt32LE(0x004e4942, 24 + json.length); bin.copy(out, 28 + json.length);
  return out;
}

/** Preserve real geometry, source bone order/transforms and animation bytes; only browser texture loading is removed. */
async function sourceGltf(path) {
  const doc = readGlb(path), g = structuredClone(doc.g), chunks = [doc.bin];
  let length = doc.bin.length;
  const add = (values, itemSize, joints = false, indices = false, position = false) => {
    const padding = (4 - length % 4) % 4;
    if (padding) { chunks.push(Buffer.alloc(padding)); length += padding; }
    const array = joints ? new Uint16Array(values) : indices ? new Uint32Array(values) : new Float32Array(values);
    const bytes = Buffer.from(array.buffer), vi = g.bufferViews.length;
    g.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: bytes.length });
    chunks.push(bytes); length += bytes.length;
    const ai = g.accessors.length;
    const accessor = { bufferView: vi, componentType: joints ? 5123 : indices ? 5125 : 5126, count: values.length / itemSize, type: ['SCALAR', 'VEC2', 'VEC3', 'VEC4'][itemSize - 1] };
    if (position) {
      accessor.min = [Infinity, Infinity, Infinity]; accessor.max = [-Infinity, -Infinity, -Infinity];
      for (let n = 0; n < values.length; n++) { const axis = n % 3; accessor.min[axis] = Math.min(accessor.min[axis], values[n]); accessor.max[axis] = Math.max(accessor.max[axis], values[n]); }
    }
    g.accessors.push(accessor);
    return ai;
  };
  for (let i = 0; i < g.meshes.length; i++) {
    for (let j = 0; j < g.meshes[i].primitives.length; j++) {
      const p = g.meshes[i].primitives[j], d = await decodePrimitive(doc, doc.g.meshes[i].primitives[j]);
      p.attributes = Object.fromEntries(Object.entries(d.attrs).map(([name, values]) => [name, add(values, name === 'POSITION' || name === 'NORMAL' ? 3 : name.startsWith('TEXCOORD') ? 2 : 4, name.startsWith('JOINTS'), false, name === 'POSITION')]));
      p.indices = add(d.indices, 1, false, true);
      delete p.extensions;
    }
  }
  g.materials = (g.materials ?? []).map((m) => ({ name: m.name, doubleSided: m.doubleSided, pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.85 } }));
  delete g.images; delete g.textures; delete g.samplers; delete g.extensionsUsed; delete g.extensionsRequired;
  g.buffers = [{ byteLength: length }];
  return new GLTFLoader().parseAsync(bufferOf(pack(g, Buffer.concat(chunks))), '');
}

const manifest = read(resolve(MODELS, 'manifest.people-wear.json'));
const meta = read(resolve(MODELS, 'people/people_meta.json'));
const [near, far] = await Promise.all(['people.glb', 'people_lod.glb'].map((p) => sourceGltf(resolve(MODELS, 'people', p))));
const characters = new CharacterLibrary().parse(near, meta, far);

async function fixture(ids = PEOPLE) {
  const wear = new WearLibrary().parse(structuredClone(manifest));
  cpuDocs.set(wear, new Map());
  const atlas = new THREE.DataTexture(new Uint8Array(4), 1, 1); atlas.name = 'test atlas, shared source';
  wear.setAtlas(atlas, { owned: true });
  for (const id of ids) {
    const bytes = unpackWear(readFileSync(resolve(MODELS, manifest.fits[id].file)));
    cpuDocs.get(wear).set(id, parseGlb(bytes));
    await wear.parseFit(id, await new GLTFLoader().parseAsync(bufferOf(bytes), ''));
  }
  return wear;
}

/** An isolated emitted GLB can exercise the target gate before asset promotion.
 * Normal release runs use committed assets and never skip missing targets. */
async function seatedFixture() {
  const preview = process.env.LADERA_WEAR_TARGET_PREVIEW;
  if (!preview) return fixture(['m_tendero']);
  const id = 'm_tendero', root = resolve(preview), source = structuredClone(manifest);
  source.fits[id] = { ...source.fits[id], ...read(resolve(root, `${id}.fit.json`)) };
  const wear = new WearLibrary().parse(source), bytes = unpackWear(readFileSync(resolve(root, source.fits[id].file)));
  cpuDocs.set(wear, new Map([[id, parseGlb(bytes)]]));
  wear.setAtlas(new THREE.DataTexture(new Uint8Array(4), 1, 1), { owned: true });
  await wear.parseFit(id, await new GLTFLoader().parseAsync(bufferOf(bytes), ''));
  return wear;
}

async function posedBodySurfaces(wear, id, clipName, phase) {
  const document = cpuDocs.get(wear).get(id), fit = wear.manifest.fits[id], clip = readPoseBank().find((row) => row.name === clipName);
  const surfaces = [];
  for (const [name, components] of [[fit.bodyNode, fit.bodyComponents], [fit.bodyLodNode, fit.bodyFarComponents], [fit.proxyNode, fit.proxyComponents]]) {
    const node = document.g.nodes.find((row) => row.name === name), decoded = await decodePrimitive(document, document.g.meshes[node.mesh].primitives[0]);
    surfaces.push(new ClosedSurface(decoded, components ?? null, name).pose(skinPositions(decoded, poseMatrices(skinInfo(document, name), sampleRotations(clip, clip.duration * phase)))));
  }
  return surfaces;
}

test('lossless gzip loading preserves exact GLB bytes, resource roots and direct-GLB compatibility', async () => {
  const bytes = unpackWear(readFileSync(resolve(MODELS, manifest.fits.m_tendero.file))), zipped = gzipSync(bytes);
  const oldFetch = globalThis.fetch, paths = [], parsed = [];
  const loader = { loadAsync: async (url) => { paths.push(url); return 'direct'; }, parseAsync: async (array, path) => { parsed.push(path); assert.deepEqual(Buffer.from(array), bytes); return 'parsed'; } };
  try {
    globalThis.fetch = async () => new Response(zipped);
    assert.equal(await loadWearGltf(loader, 'https://wear.invalid/assets/models/wear/m_tendero.glb.gz'), 'parsed');
    globalThis.fetch = async () => new Response(bytes, { headers: { 'Content-Encoding': 'gzip' } });
    assert.equal(await loadWearGltf(loader, 'https://wear.invalid/assets/models/wear/m_tendero.glb.gz'), 'parsed', 'an HTTP-decoded response was decompressed twice');
    assert.deepEqual(parsed, ['https://wear.invalid/assets/models/wear/', 'https://wear.invalid/assets/models/wear/']);
    globalThis.fetch = () => { throw new Error('direct GLB bypassed the existing loader'); };
    assert.equal(await loadWearGltf(loader, './wear/m_tendero.glb'), 'direct'); assert.deepEqual(paths, ['./wear/m_tendero.glb']);
    const corrupt = Buffer.from(zipped); corrupt[corrupt.length - 5] ^= 1;
    globalThis.fetch = async () => new Response(corrupt);
    await assert.rejects(() => loadWearGltf(loader, 'https://wear.invalid/m_tendero.glb.gz'));
    globalThis.fetch = async () => new Response('not a GLB');
    await assert.rejects(() => loadWearGltf(loader, 'https://wear.invalid/m_tendero.glb.gz'), /not a GLB/);
    globalThis.fetch = async () => new Response('missing', { status: 404 });
    await assert.rejects(() => loadWearGltf(loader, 'https://wear.invalid/m_tendero.glb.gz'), /HTTP 404/);
  } finally { globalThis.fetch = oldFetch; }
});

test('CPU pose targets share packed data without GPU attributes and reject malformed input before registering a fit', async () => {
  const id = 'm_tendero', document = parseGlb(unpackWear(readFileSync(resolve(MODELS, manifest.fits[id].file))));
  const json = structuredClone(document.g), chunks = [document.bin], targetAccessors = [], targetViews = [];
  let bytes = document.bin.length;
  const activation = { parentJoint: 'hips', thighJoints: ['thigh_l', 'thigh_r'], startRadians: Math.PI / 4, fullRadians: 4 * Math.PI / 9 };
  for (const design of [['trousers', 'jeans'], ['leggings']]) for (const [lod, key] of ['node', 'lodNode'].entries()) {
    const nodes = design.map((gid) => json.nodes.find((node) => node.name === manifest.fits[id].garments[gid][key]));
    const originalBases = nodes.map((node) => json.meshes[node.mesh].primitives[0].attributes.POSITION), count = json.accessors[originalBases[0]].count;
    assert.ok(originalBases.every((base) => json.accessors[base].count === count), 'the reused trouser/jean design has incompatible target counts');
    // Use the actual source positions, with independent LOD accessors as the
    // production target writer does. This remains valid against older assets
    // whose two LODs still borrow one position pool.
    const decoded = await decodePrimitive(document, document.g.meshes[nodes[0].mesh].primitives[0]), positions = new Float32Array(decoded.attrs.POSITION);
    const basePadding = (4 - bytes % 4) % 4;
    if (basePadding) { chunks.push(Buffer.alloc(basePadding)); bytes += basePadding; }
    const baseView = json.bufferViews.length, baseAccessor = json.accessors.length, baseData = Buffer.from(positions.buffer);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i++) { min[i % 3] = Math.min(min[i % 3], positions[i]); max[i % 3] = Math.max(max[i % 3], positions[i]); }
    json.bufferViews.push({ buffer: 0, byteOffset: bytes, byteLength: baseData.length, target: 34962 });
    json.accessors.push({ bufferView: baseView, componentType: 5126, type: 'VEC3', count, min, max });
    chunks.push(baseData); bytes += baseData.length;
    for (const node of nodes) json.meshes[node.mesh].primitives[0].attributes.POSITION = baseAccessor;
    const delta = new Float32Array(count * 3); delta[0] = 0.001 * (lod + 1);
    const padding = (4 - bytes % 4) % 4;
    if (padding) { chunks.push(Buffer.alloc(padding)); bytes += padding; }
    const view = json.bufferViews.length, accessor = json.accessors.length, data = Buffer.from(delta.buffer);
    json.bufferViews.push({ buffer: 0, byteOffset: bytes, byteLength: data.length });
    json.accessors.push({ bufferView: view, componentType: 5126, type: 'VEC3', count });
    chunks.push(data); bytes += data.length; targetAccessors.push(accessor); targetViews.push(view);
    for (const node of nodes) node.extras = { ...node.extras, poseTarget: { version: 1, kind: 'seated', deltaAccessor: accessor, basePositionAccessor: baseAccessor, activation: structuredClone(activation) } };
  }
  json.buffers = [{ byteLength: bytes }];
  const sourceManifest = structuredClone(manifest);
  sourceManifest.fits[id].poseTargetCpuBytes = targetAccessors.reduce((sum, accessor) => sum + json.accessors[accessor].count * 12, 0);
  const binary = Buffer.concat(chunks), makeGltf = (g = json, bin = binary) => new GLTFLoader().parseAsync(bufferOf(pack(g, bin)), '');
  const valid = new WearLibrary().parse(structuredClone(sourceManifest)), gltf = await makeGltf();
  try {
    const fit = await valid.parseFit(id, gltf), trousers = fit.garments.get('trousers'), jeans = fit.garments.get('jeans');
    for (const [lod, key] of ['near', 'far'].entries()) {
      const geometry = trousers[key].geometry, descriptor = geometry.userData.poseTarget;
      assert.ok(descriptor.delta instanceof Float32Array);
      assert.equal(descriptor.delta.length, geometry.attributes.position.count * 3);
      assert.equal(descriptor.delta, jeans[key].geometry.userData.poseTarget.delta, 'a shared design duplicated its CPU target');
      assert.equal(descriptor.delta.buffer, await gltf.parser.getDependency('bufferView', targetViews[lod]), 'target data was copied into a renderer attribute');
      assert.equal(descriptor.delta[0], Math.fround(0.001 * (lod + 1)));
      assert.deepEqual(geometry.morphAttributes, {});
      for (const attr of Object.values(geometry.attributes)) assert.notEqual(attr.array, descriptor.delta, 'a CPU target became a GPU stream');
    }
    assert.notEqual(trousers.near.geometry.userData.poseTarget.delta, trousers.far.geometry.userData.poseTarget.delta, 'near and far lost their independent targets');
  } finally { valid.dispose(); }

  const mutateTarget = (g) => g.nodes.find((node) => node.name === manifest.fits[id].garments.trousers.node).extras.poseTarget;
  const cases = [
    ['unsupported target', (g) => { mutateTarget(g).kind = 'unknown'; }],
    ['different immutable base', (g) => { mutateTarget(g).basePositionAccessor = targetAccessors[0]; }],
    ['invalid activation', (g) => { mutateTarget(g).activation.fullRadians = 0; }],
    ['incorrect component type', (g) => { g.accessors[targetAccessors[0]].componentType = 5123; }],
    ['incorrect vertex count', (g) => { g.accessors[targetAccessors[0]].count--; }],
    ['normalized target', (g) => { g.accessors[targetAccessors[0]].normalized = true; }],
    ['GPU buffer target', (g) => { g.bufferViews[targetViews[0]].target = 34962; }],
    ['interleaved target', (g) => { g.bufferViews[targetViews[0]].byteStride = 12; }],
    ['misaligned target', (g) => { g.accessors[targetAccessors[0]].byteOffset = 2; }],
    ['truncated target', (g) => { g.bufferViews[targetViews[0]].byteLength -= 4; }],
    ['nonfinite target', (g, bin) => { bin.writeFloatLE(Infinity, g.bufferViews[targetViews[0]].byteOffset); }],
    ['conflicting pooled target', (g) => { mutateTarget(g).deltaAccessor = g.accessors.length; g.accessors.push({ ...g.accessors[targetAccessors[0]] }); }],
    // Jeans retains the shared accessor, so a byte-count-only check would miss
    // this loss of the required trouser-node descriptor.
    ['missing declared target alias', (g) => { delete g.nodes.find((node) => node.name === manifest.fits[id].garments.trousers.node).extras.poseTarget; }, /missing required seated pose target/],
    ['CPU byte inventory mismatch', (g, bin, m) => { m.fits[id].poseTargetCpuBytes += 4; }],
    ['invalid CPU byte inventory', (g, bin, m) => { m.fits[id].poseTargetCpuBytes = -1; }],
  ];
  for (const [label, mutate, pattern = /pose target/] of cases) {
    const g = structuredClone(json), bin = Buffer.from(binary), m = structuredClone(sourceManifest); mutate(g, bin, m);
    const broken = await makeGltf(g, bin), wear = new WearLibrary().parse(m);
    try {
      await assert.rejects(() => wear.parseFit(id, broken), pattern, label);
      assert.equal(wear.fits.size, 0, `${label}: invalid fit was registered`);
      broken.scene.traverse((node) => { if (node.geometry) assert.equal(node.geometry.userData.poseTarget, undefined, `${label}: a partial target descriptor escaped validation`); });
    } finally { wear._disposeGltf(broken); wear.dispose(); }
  }
});

test('generated sources reject invented reused designs and colours absent from the original design', () => {
  const temp = mkdtempSync(resolve(tmpdir(), 'people-wear-source-'));
  try {
    for (const path of ['tools/blender/people_wear.catalog.json', 'tools/blender/people_contract.json', 'assets/models/people/people_meta.json', 'assets/models/manifest.garments.json', 'assets/models/garments/palette.json']) {
      const target = resolve(temp, path); mkdirSync(dirname(target), { recursive: true }); copyFileSync(resolve(ROOT, path), target);
    }
    const source = resolve(temp, 'tools/blender/people_wear.catalog.json'), catalogue = read(source);
    assert.equal(wearSources(temp).catalogue.garments.length, 23);
    catalogue.garments[0].sourceDesign = 'invented_source_design'; writeFileSync(source, JSON.stringify(catalogue));
    assert.throws(() => wearSources(temp), /absent from the Part A/);
    catalogue.garments[0].sourceDesign = 'tshirt'; catalogue.garments[0].variants.push('straw_natural'); writeFileSync(source, JSON.stringify(catalogue));
    assert.throws(() => wearSources(temp), /reused Part A source design/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('default construction and all original resident instantiations make no wardrobe requests or appearance changes', () => {
  let calls = 0;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = () => { calls++; throw new Error('unexpected default wardrobe fetch'); };
  try {
    const wear = new WearLibrary();
    assert.equal(wear.manifest, null); assert.equal(wear.fits.size, 0); assert.equal(wear.atlas, null);
    for (const id of characters.ids()) {
      const inst = characters.instantiate(id);
      assert.equal(inst.wear, undefined, id);
      assert.equal(inst.mesh.geometry, characters.geometry(id, 0, null), id);
      assert.equal(inst.lod, 0, id);
      assert.equal(Object.keys(inst.bones).length, 21, id);
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = oldFetch; }
});

test('actual seated targets prepare independent LOD uploads before the mixer returns and remain inactive while standing', async (t) => {
  const wear = await seatedFixture(); t.after(() => wear.dispose());
  const surfaces = await posedBodySurfaces(wear, 'm_tendero', 'sit_idle', 0.25), point = new THREE.Vector3();
  const bary = [[1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]];
  let vertices = 0, faces = 0;
  for (const id of ['leggings', 'trousers', 'jeans']) {
    const inst = characters.instantiate('m_tendero'), source = wear.fits.get(inst.id).garments.get(id);
    for (const lod of ['near', 'far']) assert.ok(source[lod].geometry.userData.poseTarget?.delta instanceof Float32Array, `${id}/${lod}: emitted seated target is missing`);
    const templates = [source.near, source.far].map((node) => node.geometry.attributes.position.array.slice());
    wear.dress(inst, [{ id, variant: 'plain_charcoal' }], { context: 'studio' });
    const state = inst.wear, entry = state.meshes[0], nearGeometry = state.correction.geometry(entry, 0), farGeometry = state.correction.geometry(entry, 1);
    assert.notEqual(nearGeometry.attributes.position, farGeometry.attributes.position, `${id}: LODs share a mutable target stream`);
    assert.notEqual(nearGeometry.attributes.normal, farGeometry.attributes.normal, `${id}: LOD normals share a mutable stream`);
    characters.play(inst, 'idle_a', { fade: 0, time: 0.27 }); inst.mixer.update(0);
    assert.equal(state.correction.lastReport.targetWeight, 0); assert.equal(state.correction.lastReport.targetCount, 0);
    const standing = [nearGeometry, farGeometry].map((geometry) => geometry.attributes.position.array.slice());
    const versions = [nearGeometry, farGeometry].map((geometry) => geometry.attributes.position.version);
    characters.play(inst, 'sit_idle', { fade: 0, time: 0.25 });
    assert.equal(inst.mixer.update(0), inst.mixer);
    assert.equal(state.correction.lastReport.targetWeight, 1, `${id}: actual bilateral thigh flexion did not activate its target`);
    assert.ok(state.correction.lastReport.targetCount > 0);
    assert.ok(state.correction.lastReport.maxBindPush <= 0.18 && state.correction.lastReport.maxPush <= 0.18, `${id}: total correction bound was exceeded`);
    for (const [lod, geometry] of [nearGeometry, farGeometry].entries()) assert.ok(geometry.attributes.position.version > versions[lod], `${id}/LOD${lod}: target upload was not ready when mixer.update returned`);
    // No manual correction call repairs this frame. Read the buffers exactly as
    // the renderer receives them after animation, including each face interior.
    inst.root.updateMatrixWorld(true); inst.mesh.skeleton.update();
    let maxUploadedBind = 0, maxUploadedPose = 0;
    for (const lod of [0, 1]) {
      const serial = state.correction.lastReport.serial;
      characters.setLod(inst, lod); assertLayerGeometry(entry, lod);
      assert.equal(state.correction.lastReport.serial, serial, `${id}/LOD${lod}: LOD selection repaired a target that was not ready after animation`);
      const mesh = entry.mesh, position = mesh.geometry.attributes.position, indices = mesh.geometry.index.array, posed = new Float64Array(position.count * 3);
      const baseGeometry = (lod ? source.far : source.near).geometry, base = baseGeometry.attributes.position;
      const control = new THREE.SkinnedMesh(baseGeometry, mesh.material), basePoint = new THREE.Vector3();
      control.bind(mesh.skeleton, mesh.bindMatrix); control.bindMatrixInverse.copy(mesh.bindMatrixInverse);
      for (const vertex of new Set(indices)) {
        mesh.getVertexPosition(vertex, point); posed.set([point.x, point.y, point.z], vertex * 3);
        control.getVertexPosition(vertex, basePoint);
        const bindMove = Math.hypot(position.getX(vertex) - base.getX(vertex), position.getY(vertex) - base.getY(vertex), position.getZ(vertex) - base.getZ(vertex)), poseMove = point.distanceTo(basePoint);
        assert.ok(bindMove <= 0.180000001 && poseMove <= 0.180000001, `${id}/LOD${lod}: actual upload moved more than 180 mm from its immutable base`);
        maxUploadedBind = Math.max(maxUploadedBind, bindMove); maxUploadedPose = Math.max(maxUploadedPose, poseMove);
        for (const surface of surfaces) assert.equal(surface.insideXYZ(point.x, point.y, point.z), null, `${id}/LOD${lod}/${vertex}: rendered target vertex is inside ${surface.label}`);
        vertices++;
      }
      for (let i = 0; i < indices.length; i += 3) for (const weights of bary) {
        const q = [0, 1, 2].map((axis) => weights.reduce((sum, weight, corner) => sum + weight * posed[indices[i + corner] * 3 + axis], 0));
        for (const surface of surfaces) assert.equal(surface.insideXYZ(...q), null, `${id}/LOD${lod}/triangle${i / 3}: rendered target face is inside ${surface.label}`);
        faces++;
      }
    }
    assert.ok(Math.abs(state.correction.lastReport.maxBindPush - maxUploadedBind) < 0.000002, `${id}: reported bind bound omitted target displacement`);
    assert.ok(Math.abs(state.correction.lastReport.maxPush - maxUploadedPose) < 0.000002, `${id}: reported posed bound omitted target displacement`);
    const seated = [nearGeometry, farGeometry].map((geometry) => geometry.attributes.position.array.slice());
    inst.root.position.set(4, -0.8, 2); inst.root.rotation.set(0.23, -0.71, 0.14); inst.root.scale.set(1.1, 0.95, 1.25);
    wear.update(inst, { force: true });
    assert.equal(state.correction.lastReport.targetWeight, 1);
    for (const [lod, geometry] of [nearGeometry, farGeometry].entries()) for (let i = 0; i < seated[lod].length; i++) assert.ok(Math.abs(geometry.attributes.position.array[i] - seated[lod][i]) < 0.000002, `${id}/LOD${lod}: root placement changed its local seated target`);
    characters.play(inst, 'idle_a', { fade: 0, time: 0.27 }); inst.mixer.update(0);
    assert.equal(state.correction.lastReport.targetWeight, 0); assert.equal(state.correction.lastReport.targetCount, 0);
    for (const [lod, geometry] of [nearGeometry, farGeometry].entries()) {
      for (let i = 0; i < standing[lod].length; i++) assert.ok(Math.abs(geometry.attributes.position.array[i] - standing[lod][i]) < 0.000002, `${id}/LOD${lod}: seated target accumulated into the standing look`);
      assert.deepEqual((lod ? source.far : source.near).geometry.attributes.position.array, templates[lod], `${id}/LOD${lod}: immutable source positions changed`);
    }
    wear.restore(inst);
  }
  t.diagnostic(`${vertices} actual target vertices and ${faces} face probes clear; source ${process.env.LADERA_WEAR_TARGET_PREVIEW ?? 'committed wearable assets'}`);
});

test('target displacement keeps the immutable total-bound origin and restores the original look on an activated violation', async (t) => {
  const wear = await seatedFixture(); t.after(() => wear.dispose());
  const inst = characters.instantiate('m_tendero'), original = { geometry: inst.mesh.geometry, material: inst.mesh.material, mixerUpdate: inst.mixer.update };
  const source = wear.fits.get(inst.id).garments.get('leggings').near, descriptor = source.geometry.userData.poseTarget;
  assert.ok(descriptor?.delta instanceof Float32Array, 'the emitted near leggings target is missing');
  wear.dress(inst, [{ id: 'leggings', variant: 'plain_charcoal' }], { context: 'studio' });
  characters.play(inst, 'idle_a', { fade: 0, time: 0.27 }); inst.mixer.update(0);
  const state = inst.wear, position = state.meshes[0].mesh.geometry.attributes.position, standing = position.array.slice();
  const used = [...new Set(source.geometry.index.array)], base = source.geometry.attributes.position;
  const vertex = used.reduce((a, b) => base.getY(a) <= base.getY(b) ? a : b), saved = descriptor.delta.slice(vertex * 3, vertex * 3 + 3);
  try {
    // An outward target can require no extra push-out. It must nevertheless be
    // rejected once active: resetting the bound origin to the target would let
    // this 190 mm input pass a nominal 180 mm correction cap.
    descriptor.delta.set([base.getX(vertex) < 0 ? -0.19 : 0.19, 0, 0], vertex * 3);
    wear.update(inst, { force: true });
    assert.equal(state.correction.lastReport.targetWeight, 0); assert.deepEqual(position.array, standing, 'inactive target altered standing geometry');
    characters.play(inst, 'sit_idle', { fade: 0, time: 0.25 });
    assert.throws(() => inst.mixer.update(0), /bound|exceeds/, 'activated target reset the correction bound origin');
    assert.equal(inst.wear, undefined); assert.equal(inst.mesh.geometry, original.geometry); assert.equal(inst.mesh.material, original.material);
    assert.equal(inst.mixer.update, original.mixerUpdate); assert.equal(wear.update(inst), false);
  } finally { descriptor.delta.set(saved, vertex * 3); }
});

test('real generated garments preserve all 32 clips and clear the actual posed body in both LODs', async (t) => {
  const wear = await fixture(); t.after(() => wear.dispose());
  assert.equal(characters.clips.size, 32);
  const point = new THREE.Vector3();
  const bank = new Map(readPoseBank().map((clip) => [clip.name, clip]));
  let sampled = 0, independentlyCompared = 0, largestDifference = 0, correctedFrames = 0, clearedVertices = 0;
  for (const id of PEOPLE) {
    const inst = characters.instantiate(id), skeleton = inst.mesh.skeleton, bones = Object.values(inst.bones), mixer = inst.mixer;
    wear.dress(inst, standard);
    assert.equal(inst.mixer, mixer);
    assert.equal(inst.mesh.skeleton, skeleton);
    assert.deepEqual(Object.values(inst.bones), bones);
    for (const { mesh } of inst.wear.meshes) assert.equal(mesh.skeleton, skeleton);
    assert.equal(inst.wear.identity.skeleton, skeleton);
    const doc = cpuDocs.get(wear).get(id), cpu = new Map(), surfaces = [], info = manifest.fits[id];
    for (const [name, components] of [[info.bodyNode, info.bodyComponents], [info.bodyLodNode, info.bodyFarComponents], [info.proxyNode, info.proxyComponents]]) {
      const node = doc.g.nodes.find((n) => n.name === name), decoded = await decodePrimitive(doc, doc.g.meshes[node.mesh].primitives[0]);
      surfaces.push({ decoded, rig: skinInfo(doc, node.name), surface: new ClosedSurface(decoded, components ?? null, name) });
    }
    for (const item of inst.wear.meshes) {
      const node = doc.g.nodes.find((n) => n.name === item.source.near.name);
      const control = new THREE.SkinnedMesh(item.source.near.geometry, item.mesh.material);
      control.bind(item.mesh.skeleton, item.mesh.bindMatrix);
      cpu.set(item.mesh.name, { decoded: await decodePrimitive(doc, doc.g.meshes[node.mesh].primitives[0]), rig: skinInfo(doc, node.name), control });
    }
    for (const lod of [0, 1]) {
      characters.setLod(inst, lod);
      for (const clip of characters.clips.keys()) {
        inst.mixer.stopAllAction(); inst.cur = null;
        characters.play(inst, clip, { fade: 0, time: 0.37 });
        inst.mixer.update(0); inst.root.updateMatrixWorld(true); skeleton.update();
        if (inst.wear.correction.lastReport.correctedVertices) correctedFrames++;
        for (const row of surfaces) row.surface.pose(skinPositions(row.decoded, poseMatrices(row.rig, sampleRotations(bank.get(clip), characters.clip(clip).duration * 0.37))));
        for (const mesh of [inst.mesh, inst.wear.identity, ...inst.wear.meshes.map((g) => g.mesh)]) {
          const reference = lod === 0 && cpu.get(mesh.name);
          const checked = reference && skinPositions(reference.decoded, poseMatrices(reference.rig, sampleRotations(bank.get(clip), characters.clip(clip).duration * 0.37)));
          if (reference) reference.control.bindMatrixInverse.copy(mesh.bindMatrixInverse);
          const used = mesh.geometry.index?.array ?? Array.from({ length: mesh.geometry.attributes.position.count }, (_, i) => i);
          for (let n = 0; n < used.length; n += Math.max(1, Math.floor(used.length / 12))) {
            mesh.getVertexPosition(used[n], point);
            assert.ok([point.x, point.y, point.z].every(Number.isFinite), `${id}/${clip}/${mesh.name}: nonfinite deformation`);
            assert.ok(Math.max(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)) < 4, `${id}/${clip}/${mesh.name}: exploded skin`);
            if (checked) {
              // This source control verifies the unchanged rig/32-clip contract
              // independently of the optional per-pose garment correction.
              reference.control.getVertexPosition(used[n], point);
              const v = used[n], difference = Math.hypot(point.x - checked[v * 3], point.y - checked[v * 3 + 1], point.z - checked[v * 3 + 2]);
              largestDifference = Math.max(largestDifference, difference);
              assert.ok(difference < 0.000002, `${id}/${clip}/${mesh.name}/${v}: CPU collision pose differs from Three.js by ${difference} m`);
              independentlyCompared++;
            }
            sampled++;
          }
          if (cpu.has(mesh.name)) for (const vertex of new Set(used)) {
            mesh.getVertexPosition(vertex, point);
            for (const row of surfaces) assert.equal(row.surface.insideXYZ(point.x, point.y, point.z), null, `${id}/${clip}/LOD${lod}/${mesh.name}/${vertex}: actual Three.js vertex remains inside ${row.surface.label}`);
            clearedVertices++;
          }
        }
      }
    }
  }
  assert.ok(sampled > 10000, `only ${sampled} actual posed vertices checked`);
  assert.ok(independentlyCompared > 3000, `only ${independentlyCompared} independent CPU/Three positions compared`);
  assert.ok(correctedFrames > 0, 'the all-clip check never exercised a pose correction');
  assert.ok(clearedVertices > 100000, `only ${clearedVertices} actual corrected garment vertices checked`);
  t.diagnostic(`${independentlyCompared} unchanged-rig CPU/Three comparisons (max ${largestDifference} m); ${clearedVertices} actual corrected vertices outside the body; ${correctedFrames} corrected frames`);
});

test('bad garment, colour, archetype, slot and context replacements leave a live outfit intact', async (t) => {
  const wear = await fixture(['m_tendero']); t.after(() => wear.dispose());
  const inst = characters.instantiate('m_tendero');
  wear.dress(inst, standard);
  const state = inst.wear, geometry = inst.mesh.geometry, children = [...inst.mesh.parent.children], materials = wear.materials.size;
  const cases = [
    [[{ id: 'unknown_garment' }], {}, /unknown garment/],
    [[{ id: 'tshirt', variant: 'not_in_palette' }, { id: 'trousers' }], {}, /colour/],
    [[{ id: 'blouse' }, { id: 'trousers' }], {}, /wardrobe/],
    [[{ id: 'tshirt' }, { id: 'shirt' }, { id: 'trousers' }], {}, /more than once/],
    [[{ id: 'swim_trunks' }], {}, /beach/],
    [[{ id: 'tshirt' }], {}, /coverage/],
    [standard, { context: 'made_up_context' }, /context/],
  ];
  for (const [items, options, error] of cases) {
    assert.throws(() => wear.dress(inst, items, options), error);
    assert.equal(inst.wear, state); assert.equal(inst.mesh.geometry, geometry);
    assert.deepEqual(inst.mesh.parent.children, children);
    assert.equal(wear.materials.size, materials, 'invalid input allocated wardrobe materials');
  }
  const far = wear.fits.get(inst.id).garments.get('tshirt').far;
  const saved = far.skeleton.boneInverses[0].elements[12];
  far.skeleton.boneInverses[0].elements[12] += 0.1;
  assert.throws(() => wear.dress(inst, standard), /inverse bind matrix/);
  assert.equal(inst.wear, state); assert.deepEqual(inst.mesh.parent.children, children);
  far.skeleton.boneInverses[0].elements[12] = saved;
});

test('children and teens cannot enter any wardrobe context, even with relabelled live metadata', async (t) => {
  const wear = await fixture(['m_tendero']); t.after(() => wear.dispose());
  const excluded = meta.people.filter((p) => (p.tags ?? []).some((tag) => ['kid', 'teen'].includes(tag)));
  assert.equal(excluded.length, 7);
  for (const person of excluded) {
    const inst = characters.instantiate(person.id), original = inst.mesh.geometry;
    for (const context of ['daily', 'beach', 'private', 'studio']) assert.throws(() => wear.dress(inst, standard, { context }), /adult/);
    inst.meta = { ...inst.meta, kind: 'man', tags: ['man', 'adult'] };
    assert.throws(() => wear.dress(inst, standard, { context: 'studio' }), /adult/);
    assert.equal(inst.mesh.geometry, original); assert.equal(inst.wear, undefined);
  }
  const forged = characters.instantiate('t_boy');
  forged.id = 'm_tendero'; forged.meta = characters.info('m_tendero');
  assert.throws(() => wear.dress(forged, standard), /inverse bind matrix|joint order|bind matrix/);
  assert.equal(forged.wear, undefined);
  for (const id of ['m_elder', 'w_elder', 'm_abuelo', 'w_beata']) assert.ok(WEAR_FITS[id], `${id}: elder omitted`);
});

test('original far-LOD custom appearance restores exactly; wearable layers change LOD together', async (t) => {
  const wear = await fixture(['w_joven']); t.after(() => wear.dispose());
  const inst = characters.instantiate('w_joven', { top: '#8a4561', bottom: '#283c51' });
  characters.setLod(inst, 1);
  const original = { geometry: inst.mesh.geometry, material: inst.mesh.material, skeleton: inst.mesh.skeleton, variant: inst.variant, children: [...inst.mesh.parent.children], castShadow: inst.mesh.castShadow };
  const fit = wear.fits.get(inst.id);
  wear.dress(inst, standard);
  let originalNear = null;
  inst.meta.node.traverse((node) => { if (node.isSkinnedMesh && !originalNear) originalNear = node; });
  assert.equal(inst.wear.identity.geometry.attributes.position, originalNear.geometry.attributes.position, 'identity did not borrow the original near head attributes');
  assert.notEqual(inst.wear.identity.geometry.attributes.position, original.geometry.attributes.position, 'initial far LOD incorrectly became the identity source');
  assert.equal(inst.wear.identity.geometry.attributes.color, inst.nearGeometry.attributes.color, 'identity uploaded a new un-recoloured source colour buffer');
  assert.notEqual(inst.wear.identity.geometry.attributes.color, originalNear.geometry.attributes.color, 'identity lost the existing near variant colour reference');
  assert.equal(inst.lod, 1); assert.equal(inst.mesh.geometry, (fit.bodyLod ?? fit.body).geometry);
  for (const item of inst.wear.meshes) assertLayerGeometry(item, 1);
  for (const lod of [0, 1, 0]) {
    assert.equal(characters.setLod(inst, lod), true);
    assert.equal(inst.lod, lod);
    assert.equal(inst.mesh.geometry, (lod ? fit.bodyLod ?? fit.body : fit.body).geometry);
    for (const item of inst.wear.meshes) assertLayerGeometry(item, lod);
  }
  assert.equal(wear.restore(inst), true); assert.equal(wear.restore(inst), false);
  assert.equal(inst.lod, 1); assert.equal(inst.mesh.geometry, original.geometry); assert.equal(inst.mesh.material, original.material);
  assert.equal(inst.mesh.skeleton, original.skeleton); assert.equal(inst.variant, original.variant); assert.equal(inst.mesh.castShadow, original.castShadow);
  assert.deepEqual(inst.mesh.parent.children, original.children);
});

test('replacing an active outfit keeps its current LOD and does not make a hidden resident visible', async (t) => {
  const wear = await fixture(['m_tendero']); t.after(() => wear.dispose());
  const inst = characters.instantiate('m_tendero'), originalGeometry = inst.mesh.geometry;
  inst.mesh.visible = false;
  wear.dress(inst, standard);
  characters.setLod(inst, 1);
  wear.dress(inst, [{ id: 'shirt', variant: 'plain_cream' }, { id: 'jeans', variant: 'plain_navy' }]);
  assert.equal(inst.lod, 1, 'replacement reset the current far LOD to the original near LOD');
  assert.equal(inst.mesh.geometry, wear.fits.get(inst.id).bodyLod.geometry);
  assert.equal(inst.mesh.visible, false, 'appearance change made the original hidden body visible');
  assert.equal(inst.wear.identity.visible, false);
  for (const item of inst.wear.meshes) { assert.equal(item.mesh.visible, false); assertLayerGeometry(item, 1); }
  wear.restore(inst);
  assert.equal(inst.lod, 0, 'restore lost the original appearance snapshot');
  assert.equal(inst.mesh.geometry, originalGeometry); assert.equal(inst.mesh.visible, false);
});

test('palette variants share one atlas Source and never rewrite source geometry or material colours', async (t) => {
  const wear = await fixture(['m_tendero']); t.after(() => wear.dispose());
  const a = characters.instantiate('m_tendero'), b = characters.instantiate('m_tendero');
  const source = wear.fits.get('m_tendero').garments.get('tshirt').near;
  const sourceColor = source.material.color.clone(), uv = Buffer.from(source.geometry.attributes.uv.array.buffer).toString('hex');
  wear.dress(a, standard);
  wear.dress(b, [{ id: 'tshirt', variant: 'stripe_navy' }, { id: 'trousers', variant: 'plain_charcoal' }]);
  const ma = a.wear.meshes.find((g) => g.id === 'tshirt').mesh, mb = b.wear.meshes.find((g) => g.id === 'tshirt').mesh;
  assert.notEqual(ma.geometry, mb.geometry, 'two residents shared mutable correction geometry');
  assert.notEqual(ma.geometry.attributes.position, mb.geometry.attributes.position, 'one resident pose can mutate another');
  assert.equal(ma.geometry.attributes.uv, source.geometry.attributes.uv); assert.equal(mb.geometry.attributes.uv, source.geometry.attributes.uv);
  assert.notEqual(ma.material, mb.material); assert.equal(ma.material.map.source, mb.material.map.source);
  assert.equal(ma.material.map.source, wear.atlas.source); assert.notDeepEqual(ma.material.map.offset, mb.material.map.offset);
  assert.equal(source.material.color.equals(sourceColor), true);
  assert.equal(Buffer.from(source.geometry.attributes.uv.array.buffer).toString('hex'), uv);
});

test('mixed geometry with and without COLOR_0 keeps correct materials through dressing and LOD swaps', async (t) => {
  const wear = await fixture(['m_tendero', 'w_vecina']); t.after(() => wear.dispose());
  const plain = wear.fits.get('m_tendero').garments.get('tshirt'), coloured = wear.fits.get('w_vecina').garments.get('tshirt');
  const whiteAttribute = (geometry) => new THREE.BufferAttribute(new Uint8Array(geometry.attributes.position.count * 4).fill(255), 4, true);
  // Exercise a mixed transition explicitly even after every shipped fit has been
  // regenerated: the original regression turned an attribute-free garment black.
  plain.near.geometry.deleteAttribute('color');
  plain.far.geometry.setAttribute('color', whiteAttribute(plain.far.geometry));
  coloured.near.geometry.setAttribute('color', whiteAttribute(coloured.near.geometry));
  const a = characters.instantiate('m_tendero'), b = characters.instantiate('w_vecina');
  wear.dress(a, standard); wear.dress(b, standard);
  const ma = a.wear.meshes.find((g) => g.id === 'tshirt').mesh, mb = b.wear.meshes.find((g) => g.id === 'tshirt').mesh;
  assert.equal(ma.material.vertexColors, false, 'no-COLOR_0 garment would render black');
  assert.equal(mb.material.vertexColors, true, 'existing vertex shading was dropped');
  assert.notEqual(ma.material, mb.material, 'incompatible vertex-colour shader states shared one material');
  assert.equal(ma.material.map.source, mb.material.map.source, 'colour-presence variants duplicated the atlas image');
  characters.setLod(a, 1); assert.equal(ma.material.vertexColors, true);
  characters.setLod(a, 0); assert.equal(ma.material.vertexColors, false);
});

test('the optional body preserves the resident skin shade, shares its cached tint and restores the original material', async (t) => {
  const wear = await fixture(['m_tendero']); t.after(() => wear.dispose());
  const meta = characters.info('m_tendero'), skin = skinShade(meta.slots.skin, 0.8, 0.7), ratio = slotRatio(meta.slots.skin, skin);
  const a = characters.instantiate('m_tendero', { skin }), b = characters.instantiate('m_tendero', { skin });
  const originalMaterial = a.mesh.material, source = wear.fits.get(a.id).body.material, before = source.color.clone();
  characters.setLod(a, 1);
  wear.dress(a, standard); wear.dress(b, standard);
  const owned = a.mesh.material;
  assert.notEqual(owned, source, 'skin recolouring mutated the shared generated body material');
  assert.equal(owned, b.mesh.material, 'identical skin shades allocated duplicate body materials');
  for (const [axis, i] of [['r', 0], ['g', 1], ['b', 2]]) assert.ok(Math.abs(owned.color[axis] - before[axis] * ratio[i]) < 1e-12, `${axis}: generated body ignored the existing skin shade`);
  assert.equal(source.color.equals(before), true);
  assert.equal(a.wear.identity.geometry.attributes.color, a.nearGeometry.attributes.color);
  let disposed = 0; owned.addEventListener('dispose', () => { disposed++; });
  wear.restore(a); assert.equal(a.mesh.material, originalMaterial); assert.equal(a.lod, 1);
  wear.dispose(); assert.equal(disposed, 1); assert.equal(wear.bodyMaterials.size, 0);
});

test('the existing mixer updates private correction streams before returning, without drift or borrowed-buffer disposal', async (t) => {
  const wear = await fixture(['m_tendero']); t.after(() => wear.dispose());
  const inst = characters.instantiate('m_tendero'), originalUpdate = inst.mixer.update;
  let calls = 0;
  inst.mixer.update = function (...args) { calls++; return originalUpdate.apply(this, args); };
  const previous = Object.getOwnPropertyDescriptor(inst.mixer, 'update');
  wear.dress(inst, standard);
  const state = inst.wear, firstSerial = state.correction.lastReport.serial;
  const templates = state.meshes.map((entry) => ({ position: entry.source.near.geometry.attributes.position, bytes: Buffer.from(entry.source.near.geometry.attributes.position.array.buffer).toString('hex') }));
  const position = state.meshes[0].mesh.geometry.attributes.position, initialVersion = position.version;
  assert.notEqual(inst.mixer.update, previous.value);
  characters.play(inst, 'sweep', { fade: 0, time: 0.37 });
  assert.equal(inst.mixer.update(0), inst.mixer, 'wrapping changed the original mixer return value');
  assert.equal(calls, 1); assert.ok(state.correction.lastReport.serial > firstSerial);
  assert.ok(position.version > initialVersion, 'the upload was not ready when mixer.update returned');
  const posed = position.array.slice(), serial = state.correction.lastReport.serial;
  assert.equal(wear.update(inst).serial, serial, 'an unchanged pose rebuilt its corrections');
  for (let i = 0; i < 3; i++) { wear.update(inst, { force: true }); assert.deepEqual(position.array, posed, 'push-out accumulated across repeated frames'); }
  inst.root.position.set(3, 1, -2); inst.root.rotation.y = 0.71; inst.root.scale.setScalar(1.2);
  wear.update(inst, { force: true });
  for (let i = 0; i < posed.length; i++) assert.ok(Math.abs(position.array[i] - posed[i]) < 0.000002, `world placement changed local clearance at ${i}`);
  inst.bones.forearm_l.rotation.x += 0.01;
  const beforeManual = state.correction.lastReport.serial;
  assert.ok(wear.update(inst).serial > beforeManual, 'manual bone edits were not detected');
  for (const { position, bytes } of templates) assert.equal(Buffer.from(position.array.buffer).toString('hex'), bytes, 'source bind positions were overwritten');
  let disposed = 0;
  for (const entry of state.meshes) for (const lod of [0, 1]) state.correction.geometry(entry, lod).addEventListener('dispose', (event) => {
    assert.deepEqual(Object.keys(event.target.attributes).sort(), ['normal', 'position'], 'borrowed UV or skin buffers reached WebGL disposal');
    assert.equal(event.target.index, null, 'shared LOD index reached WebGL disposal'); disposed++;
  });
  wear.restore(inst);
  assert.deepEqual(Object.getOwnPropertyDescriptor(inst.mixer, 'update'), previous, 'the pre-existing mixer method descriptor was not restored');
  assert.equal(inst.mixer.update(0), inst.mixer); assert.equal(calls, 2); assert.equal(disposed, state.meshes.length * 2);
  assert.equal(wear.update(inst), false);
});

test('finished callbacks can replace or restore outfits before the existing mixer returns', async (t) => {
  const first = await fixture(['w_vecina']), second = await fixture(['w_vecina']);
  t.after(() => { first.dispose(); second.dispose(); });
  const doc = cpuDocs.get(first).get('w_vecina'), info = manifest.fits.w_vecina, clip = readPoseBank().find((row) => row.name === 'sweep'), surfaces = [];
  for (const [name, components] of [[info.bodyNode, info.bodyComponents], [info.bodyLodNode, info.bodyFarComponents], [info.proxyNode, info.proxyComponents]]) {
    const node = doc.g.nodes.find((row) => row.name === name), decoded = await decodePrimitive(doc, doc.g.meshes[node.mesh].primitives[0]);
    surfaces.push(new ClosedSurface(decoded, components ?? null, name).pose(skinPositions(decoded, poseMatrices(skinInfo(doc, name), sampleRotations(clip, characters.clip('sweep').duration)))));
  }
  const replacement = [{ id: 'shirt', variant: 'plain_teal' }, { id: 'jeans', variant: 'plain_navy' }], point = new THREE.Vector3();
  let checked = 0;
  for (const mode of ['same library', 'different library', 'nested replacement', 'restore', 'replace then restore']) {
    const inst = characters.instantiate('w_vecina'), original = { geometry: inst.mesh.geometry, material: inst.mesh.material, mixer: inst.mixer }, baseUpdate = inst.mixer.update;
    let originalCalls = 0, events = 0;
    inst.mixer.update = function (...args) { originalCalls++; return baseUpdate.apply(this, args); };
    const descriptor = Object.getOwnPropertyDescriptor(inst.mixer, 'update');
    first.dress(inst, standard);
    inst.mixer.addEventListener('finished', () => {
      events++;
      if (mode === 'same library') first.dress(inst, replacement);
      else if (mode === 'different library') second.dress(inst, replacement);
      else if (mode === 'nested replacement') { second.dress(inst, replacement); first.dress(inst, replacement); }
      else if (mode === 'restore') first.restore(inst);
      else { second.dress(inst, replacement); second.restore(inst); }
    });
    const action = characters.play(inst, 'sweep', { once: true, fade: 0, time: 0 });
    assert.equal(inst.mixer.update(action.getClip().duration + 0.01), inst.mixer, mode);
    assert.equal(events, 1); assert.equal(originalCalls, 1); assert.equal(inst.mixer, original.mixer);
    const state = inst.wear;
    if (state) {
      assert.equal(state.library, mode === 'different library' ? second : first, mode);
      assert.equal(state.mixerUpdate, descriptor.value, `${mode}: replacement retained an obsolete wrapper`);
      // The renderer updates world matrices before drawing. Check the real live
      // buffers at that point, without calling wear.update to repair the frame.
      inst.root.updateMatrixWorld(true); inst.mesh.skeleton.update();
      for (const { mesh } of state.meshes) for (const vertex of new Set(mesh.geometry.index.array)) {
        mesh.getVertexPosition(vertex, point);
        for (const surface of surfaces) assert.equal(surface.insideXYZ(point.x, point.y, point.z) === null, true, `${mode}: replacement vertex ${vertex} is inside ${surface.label} when mixer.update returns`);
        checked++;
      }
      const serial = state.correction.lastReport.serial;
      assert.equal(state.library.update(inst).serial, serial, `${mode}: the caller still had to repair a stale correction`);
      state.library.restore(inst);
    }
    assert.equal(inst.wear, undefined); assert.equal(first.active.has(inst), false); assert.equal(second.active.has(inst), false);
    assert.equal(inst.mesh.geometry, original.geometry); assert.equal(inst.mesh.material, original.material);
    assert.deepEqual(Object.getOwnPropertyDescriptor(inst.mixer, 'update'), descriptor, `${mode}: original mixer descriptor changed`);
  }
  assert.ok(checked > 1000, `only ${checked} callback-replacement vertices checked`);
});

test('candidate geometry failures preserve the live outfit; later correction failures restore the original look', async (t) => {
  const wear = await fixture(['m_tendero']); t.after(() => wear.dispose());
  const inst = characters.instantiate('m_tendero'), original = { geometry: inst.mesh.geometry, material: inst.mesh.material, update: inst.mixer.update };
  wear.dress(inst, standard);
  const state = inst.wear, hook = inst.mixer.update, fit = wear.fits.get(inst.id), proxy = fit.gltf.scene.getObjectByName(fit.info.proxyNode), index = proxy.geometry.index.array, value = index[0];
  try {
    index[0] = index[1];
    assert.throws(() => wear.dress(inst, [{ id: 'shirt' }, { id: 'jeans' }]), /degenerate|collapsed|nonmanifold/);
    assert.equal(inst.wear, state); assert.equal(inst.mixer.update, hook);
  } finally { index[0] = value; }
  inst.bones.chest.quaternion.x = NaN;
  assert.throws(() => wear.update(inst), /invalid posed bone matrix/);
  assert.equal(inst.wear, undefined); assert.equal(inst.mesh.geometry, original.geometry); assert.equal(inst.mesh.material, original.material);
  assert.equal(inst.mixer.update, original.update); assert.equal(Object.hasOwn(inst.mixer, 'update'), false, 'a restored instance retained an update override');
});

test('disposing a live library restores its residents and disposes only resources it owns', async () => {
  const wear = await fixture(['m_tendero', 'w_vecina']);
  const instances = ['m_tendero', 'w_vecina'].map((id) => characters.instantiate(id, { top: '#627363' }));
  const originals = instances.map((inst) => ({ geometry: inst.mesh.geometry, material: inst.mesh.material, update: inst.mixer.update }));
  let originalDisposals = 0, ownGeometryDisposals = 0, atlasDisposals = 0;
  const listener = () => { originalDisposals++; };
  const sharedTexture = new THREE.Texture(); sharedTexture.addEventListener('dispose', listener);
  const originalMap = originals[0].material.map; originals[0].material.map = sharedTexture;
  for (const o of originals) { o.geometry.addEventListener('dispose', listener); o.material.addEventListener('dispose', listener); }
  wear.atlas.addEventListener('dispose', () => { atlasDisposals++; });
  const ownGeometry = wear.fits.get('m_tendero').body.geometry;
  ownGeometry.addEventListener('dispose', () => { ownGeometryDisposals++; });
  try {
    for (const inst of instances) wear.dress(inst, standard);
    let detachedAttributes = 0;
    for (const fit of wear.fits.values()) for (const geometry of fit.identityGeometries.values()) {
      const borrowed = new Set(Object.values(geometry.attributes)), owned = new Set([fit.identityIndex]);
      fit.gltf.scene.traverse((node) => {
        if (!node.geometry) return;
        for (const attribute of Object.values(node.geometry.attributes)) owned.add(attribute);
        if (node.geometry.index) owned.add(node.geometry.index);
      });
      geometry.addEventListener('dispose', () => {
        const disposalStreams = new Set(Object.values(geometry.attributes));
        assert.deepEqual(disposalStreams, owned, 'unrendered template streams had no registered disposal owner');
        for (const attribute of disposalStreams) assert.ok(!borrowed.has(attribute), 'an original resident buffer reached the wardrobe disposal event');
        assert.ok([...disposalStreams].some((attribute) => attribute.isInterleavedBufferAttribute), 'interleaved GPU stream ownership was not exercised');
        for (const entry of fit.garments.values()) for (const source of [entry.near, entry.far]) assert.ok(disposalStreams.has(source.geometry.index), 'borrowed LOD index lacked final disposal ownership');
        assert.equal(geometry.index, fit.identityIndex, 'the owned identity index was lost before disposal');
        detachedAttributes++;
      });
    }
    wear.dispose(); wear.dispose();
    for (let i = 0; i < instances.length; i++) {
      assert.equal(instances[i].wear, undefined);
      assert.equal(instances[i].mesh.geometry, originals[i].geometry); assert.equal(instances[i].mesh.material, originals[i].material);
      assert.equal(instances[i].mixer.update, originals[i].update); assert.equal(Object.hasOwn(instances[i].mixer, 'update'), false);
    }
    assert.equal(originalDisposals, 0, 'borrowed character geometry/material/atlas was disposed');
    assert.equal(ownGeometryDisposals, 1); assert.equal(atlasDisposals, 1);
    assert.equal(detachedAttributes, 2);
    assert.equal(wear.fits.size, 0); assert.equal(wear.materials.size, 0);
    assert.throws(() => wear.dress(instances[0], standard), /disposed/);
  } finally {
    originals[0].material.map = originalMap;
    for (const o of originals) { o.geometry.removeEventListener('dispose', listener); o.material.removeEventListener('dispose', listener); }
    sharedTexture.removeEventListener('dispose', listener); sharedTexture.dispose(); wear.dispose();
  }
});

test('all generated garment entries can be inspected on each of the three adult body types', () => {
  for (const id of PEOPLE) for (const garment of Object.values(WEAR_GARMENTS)) {
    assert.deepEqual(validateOutfit(id, [{ id: garment.id, variant: garment.variants[0] }], { context: 'studio' }), [{ id: garment.id, variant: garment.variants[0] }]);
  }
});
