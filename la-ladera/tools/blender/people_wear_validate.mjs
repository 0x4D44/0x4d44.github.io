#!/usr/bin/env node
// Validate the exported wearable library. The collision gate recomputes posing
// and point-in-body tests; a saved report cannot certify changed input bytes.
import '../../tests/nice.mjs';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { dirname, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, parseGlb, readAccessor, decodePrimitive, CONTRACT } from './people_validate.mjs';
import { buildWearManifest, wearDataModule, checkPeopleWearSourceInputs } from '../people_wear_data.mjs';
import { skinInfo, compareSkin, readPoseBank, poseSamples, sampleRotations, poseMatrices, skinPositions, usedVertices, ClosedSurface, checkPenetrations, blendedMatrix, inverseVector, transform, closestUnionExit, pushOutPose } from './people_wear_math.mjs';
import { preparePoseTarget } from '../../js/people/wear_pose.js';
import { boundedAuthorExit } from './people_wear_fit_search.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../../assets/models');
export const LIMITS = Object.freeze({ nearTriangles: 1800, farTriangles: 600, gpuBytes: 12000000, fileBytes: 8 * 1048576 });
export const COMPRESSED_MODEL_BYTES = 6000000;
const need = (ok, message) => { if (!ok) throw new Error(message); };
const hash = b => createHash('sha256').update(b).digest('hex');
const same = (a, b) => a.length === b.length && new Set(a).size === a.length && a.every(x => b.includes(x));
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const WIDTHS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/** GPU/accounting checks use the real decompressed glTF, while inventories and
 * report fingerprints continue to hash the exact shipped compressed bytes. */
export function readWearGlb(path) {
  const bytes = readFileSync(path), gzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const glb = parseGlb(gzip ? gunzipSync(bytes, { maxOutputLength: 32 * 1048576 }) : bytes, path);
  return { ...glb, shippedBytes: bytes.length, shippedSha256: hash(bytes), gzip };
}

export function safePath(root, path) {
  need(typeof path === 'string' && path.length > 0 && !isAbsolute(path) && !/^[a-z]+:/i.test(path), 'wearable path must be local and relative');
  const full = resolve(root, path), rel = relative(root, full);
  need(rel !== '..' && !rel.startsWith('..' + sep), `wearable path escapes models: ${path}`); return full;
}
function node(glb, name) {
  const found = glb.g.nodes.map((n, i) => n.name === name ? i : -1).filter(i => i >= 0);
  need(found.length === 1 && glb.g.nodes[found[0]].mesh != null, `missing/duplicate wearable node ${name}`); return found[0];
}

export function checkWearLodBudget(near, far, label = 'wearable') {
  need(Number.isSafeInteger(near) && near > 0 && Number.isSafeInteger(far) && far > 0,
    `${label}: LOD triangle counts must be positive integers`);
  need(far * 5 <= near * 2, `${label}: far LOD exceeds 40% of its near mesh`);
  return far / near;
}

export function checkWearModelBudget(bytes) {
  need(Number.isSafeInteger(bytes) && bytes > 0 && bytes <= COMPRESSED_MODEL_BYTES,
    'wear compressed model payload exceeds 6,000,000 bytes or is invalid');
  return bytes;
}
const decodeCache = new WeakMap();
const poseDeltaCache = new WeakMap();
/** Resolve the CPU-only target from actual glTF bytes. Supplying the verified
 * skin prepares its rest-frame activation; otherwise return the raw descriptor
 * for packing tests and authoring. No target accessor is a renderer attribute. */
export function readWearPoseTarget(glb, nodeOrName, rig = null) {
  const n = typeof nodeOrName === 'string' ? glb.g.nodes[node(glb, nodeOrName)] : nodeOrName;
  const target = n?.extras?.poseTarget; if (target == null) return null;
  const label = `${n.name ?? 'wearable'}: pose target`, primitives = glb.g.meshes?.[n.mesh]?.primitives;
  need(target.version === 1 && target.kind === 'seated' && Number.isSafeInteger(target.deltaAccessor) && target.deltaAccessor >= 0,
    `${label}: unsupported descriptor`);
  need(primitives?.length === 1 && !primitives[0].targets?.length, `${label}: requires a CPU-only single primitive`);
  const primitive = primitives[0], base = glb.g.accessors?.[primitive.attributes?.POSITION];
  need(Number.isSafeInteger(target.basePositionAccessor) && target.basePositionAccessor === primitive.attributes?.POSITION,
    `${label}: reference does not match immutable base POSITION`);
  need(base?.componentType === 5126 && base.type === 'VEC3' && Number.isSafeInteger(base.count) && base.count > 0,
    `${label}: invalid immutable base POSITION`);
  const a = glb.g.accessors?.[target.deltaAccessor], view = glb.g.bufferViews?.[a?.bufferView], offset = a?.byteOffset ?? 0;
  need(a && a.componentType === 5126 && a.type === 'VEC3' && a.count === base.count && !a.normalized && !a.sparse && Number.isSafeInteger(a.bufferView),
    `${label}: expected one Float32 VEC3 delta per base vertex`);
  need(view && !Object.hasOwn(view, 'target') && !Object.hasOwn(view, 'byteStride') && (view.buffer ?? 0) === 0 &&
    Number.isSafeInteger(view.byteLength) && view.byteLength >= 0 && Number.isSafeInteger(view.byteOffset ?? 0) && (view.byteOffset ?? 0) >= 0 && (view.byteOffset ?? 0) % 4 === 0 &&
    Number.isSafeInteger(offset) && offset >= 0 && offset % 4 === 0 && offset + base.count * 12 <= view.byteLength &&
    (view.byteOffset ?? 0) + view.byteLength <= glb.bin.length, `${label}: invalid packed CPU buffer range`);
  const values = readAccessor(glb, target.deltaAccessor);
  need(values.length === base.count * 3 && values.every(Number.isFinite), `${label}: non-finite or truncated delta`);
  let cache = poseDeltaCache.get(glb); if (!cache) poseDeltaCache.set(glb, cache = new Map());
  let delta = cache.get(target.deltaAccessor);
  if (!delta || !delta.every((value, i) => value === values[i])) { delta = Float32Array.from(values); cache.set(target.deltaAccessor, delta); }
  const descriptor = { version: target.version, kind: target.kind, delta, activation: target.activation };
  // Preparation also checks the exact supported activation policy. A metadata
  // mutation cannot silently change the anatomy/angle that drives the target.
  if (rig) return preparePoseTarget(descriptor, rig.jointNames, rig.worlds);
  const aPolicy = descriptor.activation;
  need(aPolicy?.parentJoint === 'hips' && Array.isArray(aPolicy.thighJoints) && aPolicy.thighJoints.length === 2 && aPolicy.thighJoints[0] === 'thigh_l' && aPolicy.thighJoints[1] === 'thigh_r' &&
    aPolicy.startRadians === Math.PI / 4 && aPolicy.fullRadians === 4 * Math.PI / 9, `${label}: unsupported seated activation`);
  return descriptor;
}
async function geometry(glb, name) {
  const ni = node(glb, name), n = glb.g.nodes[ni], mesh = glb.g.meshes[n.mesh];
  need(mesh?.primitives?.length === 1, `${name}: expected one indexed material primitive`);
  const primitive = mesh.primitives[0]; let decoded;
  checkAccessorAlignment(glb, primitive, name);
  if (primitive.extensions?.KHR_draco_mesh_compression) decoded = await decodePrimitive(glb, primitive);
  else {
    let cache = decodeCache.get(glb); if (!cache) { cache = new Map(); decodeCache.set(glb, cache); }
    const get = ai => { if (!cache.has(ai)) cache.set(ai, readAccessor(glb, ai)); return cache.get(ai); };
    need((primitive.mode ?? 4) === 4 && primitive.indices != null, `${name}: expected indexed triangles`);
    decoded = { attrs: Object.fromEntries(Object.entries(primitive.attributes).map(([key, ai]) => [key, get(ai)])), indices: get(primitive.indices), vertices: glb.g.accessors[primitive.attributes.POSITION]?.count };
  }
  const rig = skinInfo(glb, ni), poseTarget = readWearPoseTarget(glb, n, rig);
  if (poseTarget) decoded.poseTarget = poseTarget;
  return { name, nodeIndex: ni, node: n, primitive, decoded, rig };
}
export { geometry as readWearGeometry };
export function checkAccessorAlignment(glb, primitive, label = 'wearable') {
  for (const [name, ai] of Object.entries(primitive.attributes ?? {})) {
    const a = glb.g.accessors?.[ai], v = glb.g.bufferViews?.[a?.bufferView];
    need(a && Number.isSafeInteger(a.count) && a.count > 0 && !a.sparse, `${label}/${name}: invalid vertex accessor`);
    if (name === 'POSITION') need(a.type === 'VEC3' && a.componentType === 5126 && !a.normalized, `${label}: POSITION must use float32 VEC3`);
    if (name === 'NORMAL') {
      need(a.type === 'VEC3' && (a.componentType === 5126 && !a.normalized || [5120, 5122].includes(a.componentType) && a.normalized), `${label}: invalid NORMAL format`);
      if (a.componentType !== 5126) need(glb.g.extensionsRequired?.includes('KHR_mesh_quantization') && glb.g.extensionsUsed?.includes('KHR_mesh_quantization'), `${label}: quantized NORMAL requires KHR_mesh_quantization`);
    }
    if (name === 'JOINTS_0') need(a.type === 'VEC4' && [5121, 5123].includes(a.componentType) && !a.normalized, `${label}: JOINTS_0 must use unnormalized unsigned integers`);
    if (name === 'WEIGHTS_0' || name === 'TEXCOORD_0' || name === 'COLOR_0') {
      const types = name === 'WEIGHTS_0' ? ['VEC4'] : name === 'TEXCOORD_0' ? ['VEC2'] : ['VEC3', 'VEC4'];
      need(types.includes(a.type) && (a.componentType === 5126 && !a.normalized || [5121, 5123].includes(a.componentType) && a.normalized), `${label}: invalid ${name} format`);
    }
    if (primitive.extensions?.KHR_draco_mesh_compression && !v) continue;
    need(a && v, `${label}: missing ${name} accessor buffer`);
    const elementBytes = COMPONENT_BYTES[a.componentType] * WIDTHS[a.type], stride = v.byteStride ?? elementBytes;
    need((v.byteOffset ?? 0) % 4 === 0 && (a.byteOffset ?? 0) % 4 === 0 && stride % 4 === 0, `${label}/${name}: vertex attributes require 4-byte-aligned offsets and stride`);
    need(stride >= elementBytes && stride <= 252 && (!v.target || v.target === 34962), `${label}/${name}: invalid vertex stride/target`);
  }
  const index = glb.g.accessors?.[primitive.indices];
  need(index?.type === 'SCALAR' && [5121, 5123, 5125].includes(index.componentType) && !index.normalized, `${label}: invalid triangle index format`);
  const view = glb.g.bufferViews?.[index.bufferView];
  if (view) need(!view.byteStride && (!view.target || view.target === 34963) && (view.byteOffset ?? 0) % 4 === 0 && (index.byteOffset ?? 0) % COMPONENT_BYTES[index.componentType] === 0, `${label}: invalid triangle index buffer alignment/target`);
}
export function checkGeometry(decoded, triangleLimit, label) {
  const { attrs: a, indices, vertices } = decoded;
  need(Number.isInteger(vertices) && vertices > 0 && indices.length > 0 && indices.length % 3 === 0, `${label}: empty/malformed geometry`);
  need(indices.length / 3 <= triangleLimit, `${label}: ${indices.length / 3} triangles exceeds ${triangleLimit}`);
  for (const [key, width] of Object.entries({ POSITION: 3, NORMAL: 3, TEXCOORD_0: 2, JOINTS_0: 4, WEIGHTS_0: 4 })) {
    need(a[key]?.length === vertices * width && a[key].every(Number.isFinite), `${label}: missing/non-finite ${key}`);
  }
  for (const i of indices) need(Number.isSafeInteger(i) && i >= 0 && i < vertices, `${label}: index outside vertex pool`);
  for (const i of usedVertices(decoded)) {
    let w = 0;
    for (let k = 0; k < 4; k++) {
      const j = a.JOINTS_0[i * 4 + k], v = a.WEIGHTS_0[i * 4 + k];
      need(Number.isInteger(j) && j >= 0 && j < 21, `${label}: invalid skin joint`);
      need(v >= 0 && v <= 1, `${label}: invalid skin weight`); w += v;
    }
    need(Math.abs(w - 1) < 0.0001, `${label}: unnormalised skin weights`);
    const n = Math.hypot(...a.NORMAL.subarray(i * 3, i * 3 + 3)); need(n > 0.98 && n < 1.02, `${label}: non-unit normal`);
    need(a.TEXCOORD_0[i * 2] >= -1e-7 && a.TEXCOORD_0[i * 2] <= 1.0000001 && a.TEXCOORD_0[i * 2 + 1] >= -1e-7 && a.TEXCOORD_0[i * 2 + 1] <= 1.0000001, `${label}: UV outside atlas`);
  }
  return { triangles: indices.length / 3, usedVertices: usedVertices(decoded).length };
}

/** A declared complete-cut artwork choice must exist in the emitted triangles.
 * Compare expanded corner attributes so independent near/far compaction can
 * reorder rows without hiding an omitted face or an unchanged detailed cut. */
export function checkTopologyChoices(fit, entries, label = 'wearable') {
  if (fit.topologyChoices == null) return;
  need(typeof fit.topologyChoices === 'object' && !Array.isArray(fit.topologyChoices), `${label}: invalid topology choices`);
  for (const [gid, choice] of Object.entries(fit.topologyChoices)) {
    need(fit.garments?.[gid] && choice?.nearCut === 'complete-far-cut' && choice.sourceLod === 1, `${label}/${gid}: unsupported complete-cut choice`);
    const near = entries.find(entry => entry.gid === gid && entry.lod === 0)?.decoded;
    const far = entries.find(entry => entry.gid === gid && entry.lod === 1)?.decoded;
    need(near && far && near.indices.length === far.indices.length, `${label}/${gid}: declared complete-cut geometry omits or changes faces`);
    const semantics = Object.keys(near.attrs).sort();
    need(semantics.join('/') === Object.keys(far.attrs).sort().join('/'), `${label}/${gid}: complete-cut attribute sets differ`);
    for (const name of semantics) {
      const a = near.attrs[name], b = far.attrs[name], width = a.length / near.vertices;
      need(Number.isSafeInteger(width) && width > 0 && b.length === far.vertices * width, `${label}/${gid}/${name}: complete-cut attribute widths differ`);
      for (let corner = 0; corner < near.indices.length; corner++) for (let k = 0; k < width; k++)
        need(a[near.indices[corner] * width + k] === b[far.indices[corner] * width + k], `${label}/${gid}/${name}: declared complete-cut geometry differs at triangle ${Math.floor(corner / 3)}`);
    }
  }
}

/** Count the buffers actually created for glTF mesh attributes, sharing one GPU
 * allocation for a reused accessor or an interleaved attribute buffer. */
export function geometryGpuBytes(glb) {
  const unique = new Map(), g = glb.g;
  const add = (ai, attribute) => {
    const a = g.accessors?.[ai]; need(a && COMPONENT_BYTES[a.componentType] && WIDTHS[a.type], 'invalid GPU accessor');
    const v = g.bufferViews?.[a.bufferView], stride = v?.byteStride;
    const key = attribute && stride ? `interleaved:${a.bufferView}:${a.componentType}` : `accessor:${ai}`;
    const size = attribute && stride ? v.byteLength : a.count * COMPONENT_BYTES[a.componentType] * WIDTHS[a.type];
    need(Number.isSafeInteger(size) && size > 0, 'invalid GPU buffer byte count'); unique.set(key, size);
  };
  for (const mesh of g.meshes ?? []) for (const p of mesh.primitives ?? []) { for (const ai of Object.values(p.attributes ?? {})) add(ai, true); add(p.indices, false); }
  for (const n of g.nodes ?? []) if (n.extras?.sourceIndicesAccessor != null || n.extras?.sourceIndices) {
    if (n.extras.sourceIndicesAccessor != null) add(n.extras.sourceIndicesAccessor, false);
    else {
      const indices = n.extras.sourceIndices;
      need(Array.isArray(indices) && indices.length > 0 && indices.every(i => Number.isSafeInteger(i) && i >= 0), `${n.name}: invalid borrowed identity indices`);
      unique.set(`borrowed:${n.name}`, indices.length * (Math.max(...indices) > 65535 ? 4 : 2));
    }
  }
  return [...unique.values()].reduce((a, b) => a + b, 0);
}
export function imageDimensions(bytes) {
  const b = Buffer.from(bytes);
  if (b.length >= 24 && b.subarray(1, 4).toString() === 'PNG') return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b.length >= 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const tag = b.toString('ascii', 12, 16);
    if (tag === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (tag === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (tag === 'VP8L' && b[20] === 0x2f) { const x = b.readUInt32LE(21); return [(x & 0x3fff) + 1, ((x >>> 14) & 0x3fff) + 1]; }
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 8 < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      const length = b.readUInt16BE(i + 2); need(length >= 2, 'malformed JPEG image'); i += length + 2;
    }
  }
  throw new Error('unsupported or malformed atlas image header');
}
export function checkGpuBudget(geometryBytes, textures) {
  let textureBytes = 0;
  for (const t of textures) {
    const [w, h] = imageDimensions(t.bytes);
    need(w > 0 && h > 0 && w <= 4096 && h <= 4096, `${t.path}: invalid atlas dimensions`);
    if (t.width != null) need(t.width === w && t.height === h, `${t.path}: atlas dimensions disagree with bytes`);
    textureBytes += Math.ceil(w * h * 4 * 4 / 3);
  }
  const gpuBytes = geometryBytes + textureBytes;
  need(gpuBytes < LIMITS.gpuBytes, `wearable GPU growth ${gpuBytes} bytes exceeds strict 12 MB bound`);
  return { geometryBytes, textureBytes, gpuBytes, gpuMiB: +(gpuBytes / 1048576).toFixed(4) };
}

function ranges(entry, fit, key) { return fit[key] ?? entry.node.extras?.components ?? null; }

async function retainedIdentity(glb, fit, id, sourceGlb) {
  const name = fit.sourceVisibleNode ?? fit.identityNode, ni = glb.g.nodes.findIndex(n => n.name === name), n = glb.g.nodes[ni];
  need(n, `${id}: missing retained identity node`);
  if (n.mesh != null) return geometry(glb, name);
  need(sourceGlb && n.extras?.sourceNode === `person_${id}_mesh` && fit.identitySource === 'people/people.glb', `${id}: invalid borrowed identity source`);
  const source = await geometry(sourceGlb, n.extras.sourceNode), ai = n.extras.sourceIndicesAccessor;
  const indices = ai == null ? n.extras.sourceIndices : Array.from(readAccessor(glb, ai));
  if (ai != null) need(glb.g.accessors[ai].type === 'SCALAR' && glb.g.accessors[ai].componentType === 5123 && !glb.g.accessors[ai].normalized, `${id}: invalid identity index accessor`);
  need(Array.isArray(indices) && indices.length >= 300 && indices.length % 3 === 0 && indices.every(i => Number.isSafeInteger(i) && i >= 0 && i < source.decoded.vertices), `${id}: invalid retained source indices`);
  const sourceTriangles = new Set();
  for (let i = 0; i < source.decoded.indices.length; i += 3) sourceTriangles.add(Array.from(source.decoded.indices.subarray(i, i + 3)).join(','));
  for (let i = 0; i < indices.length; i += 3) need(sourceTriangles.has(indices.slice(i, i + 3).join(',')), `${id}: identity triangle is absent from original source`);
  const a = source.decoded.attrs;
  for (const i of new Set(indices)) {
    let headWeight = 0; for (let k = 0; k < 4; k++) if (['head', 'neck'].includes(source.rig.jointNames[a.JOINTS_0[i * 4 + k]])) headWeight += a.WEIGHTS_0[i * 4 + k];
    const slot = a.COLOR_0 ? Math.round(a.COLOR_0[i * 4 + 3] * 255 / 16) : -1;
    need(headWeight > 0.72 && ![2, 3, 4, 5, 6, 7].includes(slot), `${id}: borrowed identity includes non-head/clothing vertices`);
  }
  // The vendored GLTFLoader calls SkinnedMesh.normalizeSkinWeights(). Preserve
  // its FLOAT32 result for the borrowed Draco source, whose decoded weights can
  // differ from one by ~2e-4. New wearable weights must already sum to one.
  const weights = new Float32Array(a.WEIGHTS_0);
  for (const i of new Set(indices)) {
    let sum = 0; for (let k = 0; k < 4; k++) sum += Math.abs(weights[i * 4 + k]);
    need(Math.abs(sum - 1) <= 0.018, `${id}: malformed source identity weights`);
    for (let k = 0; k < 4; k++) weights[i * 4 + k] /= sum;
  }
  return { name, nodeIndex: ni, node: n, primitive: source.primitive, rig: source.rig, decoded: { ...source.decoded, attrs: { ...a, WEIGHTS_0: weights }, indices: Uint32Array.from(indices) } };
}

/** Direct binary inspection is separately exported for mutation tests: changing
 * a vertex must reach the geometric predicate, rather than only a hash check. */
export async function inspectFit(glb, fit, { id, sourceGlb = null, garmentIds = Object.keys(fit.garments ?? {}), samples = poseSamples(), collision = true, push = false, issueLimit = 24, onProgress = null } = {}) {
  need(typeof id === 'string' && fit.bodyNode && fit.garments, 'incomplete wearable fit');
  const body = await geometry(glb, fit.bodyNode); checkGeometry(body.decoded, Infinity, body.name);
  need(fit.bodyLodNode, `${id}: missing far body`);
  const farBody = await geometry(glb, fit.bodyLodNode); checkGeometry(farBody.decoded, Infinity, farBody.name); compareSkin(farBody.rig, body.rig, farBody.name);
  checkWearLodBudget(body.decoded.indices.length / 3, farBody.decoded.indices.length / 3, `${id}/body`);
  need(!body.decoded.poseTarget && !farBody.decoded.poseTarget, `${id}: collision body may not have a garment pose target`);
  if (sourceGlb) compareSkin(body.rig, skinInfo(sourceGlb, `person_${id}_mesh`), `${id}/body`);
  const entries = [], actualIds = Object.keys(fit.garments);
  need(same(actualIds, garmentIds), `${id}: incomplete/unknown garment fits`);
  for (const gid of garmentIds) {
    const m = fit.garments[gid];
    need(m.node && m.lodNode, `${id}/${gid}: near/far node required`);
    for (const [lod, name, limit] of [[0, m.node, LIMITS.nearTriangles], [1, m.lodNode, LIMITS.farTriangles]]) {
      const e = await geometry(glb, name), stats = checkGeometry(e.decoded, limit, name); compareSkin(e.rig, body.rig, name);
      if (lod === 0 && m.tris != null) need(stats.triangles === m.tris, `${name}: triangle metadata disagrees with binary`);
      if (lod === 1 && m.farTris != null) need(stats.triangles === m.farTris, `${name}: far triangle metadata disagrees with binary`);
      if ((fit.poseTargetCpuBytes ?? 0) > 0 && ['trousers', 'jeans', 'leggings'].includes(gid)) need(e.decoded.poseTarget, `${name}: missing required seated pose target`);
      entries.push({ ...e, gid, lod, stats });
    }
    checkWearLodBudget(entries.at(-2).stats.triangles, entries.at(-1).stats.triangles, `${id}/${gid}`);
  }
  checkTopologyChoices(fit, entries, id);
  const bodySurface = new ClosedSurface(body.decoded, ranges(body, fit, 'bodyComponents'), body.name), farBodySurface = new ClosedSurface(farBody.decoded, ranges(farBody, fit, 'bodyFarComponents'), farBody.name), surfaces = [bodySurface, farBodySurface];
  let proxy = null, identity = null, proxySurface = null;
  if (fit.proxyNode || fit.sourceVisibleNode || fit.identityNode) {
    need(fit.proxyNode && (fit.sourceVisibleNode || fit.identityNode), `${id}: retained identity requires a validated closed proxy`);
    proxy = await geometry(glb, fit.proxyNode); identity = await retainedIdentity(glb, fit, id, sourceGlb);
    need(!proxy.decoded.poseTarget, `${id}: collision proxy may not have a garment pose target`);
    checkGeometry(proxy.decoded, Infinity, proxy.name); checkGeometry(identity.decoded, Infinity, identity.name);
    compareSkin(proxy.rig, body.rig, proxy.name); compareSkin(identity.rig, body.rig, identity.name);
    proxySurface = new ClosedSurface(proxy.decoded, ranges(proxy, fit, 'proxyComponents'), proxy.name); surfaces.push(proxySurface);
  }
  const summary = { id, garments: garmentIds.length, maxNearTriangles: Math.max(...entries.filter(e => e.lod === 0).map(e => e.stats.triangles)), maxFarTriangles: Math.max(...entries.filter(e => e.lod === 1).map(e => e.stats.triangles)),
    geometryBytes: geometryGpuBytes(glb), bodyComponents: bodySurface.components.length, farBodyComponents: farBodySurface.components.length, proxyComponents: proxySurface?.components.length ?? 0,
    poses: 0, clipCoverage: {}, vertexChecks: 0, verticesPerPose: 0, rawRestChecks: 0, rawRestClear: false, proxyEnclosureChecks: 0, identityVerticesPerPose: 0,
    correctedVertices: 0, targetVertices: 0, pushedVertices: 0, maxTargetWeight: 0, maxPosePush: 0, maxBindPush: 0, finalPenetrations: 0,
    issues: [], sourceVisibleNode: identity?.name ?? null };
  // All garments sharing a position/joint/weight accessor pool are posed once.
  // Near/far index subsets identify the actual used vertices in that pool.
  const pools = new Map();
  for (const e of entries) {
    const a = e.primitive.attributes, key = `${a.POSITION}/${a.JOINTS_0}/${a.WEIGHTS_0}/${e.node.skin}`;
    if (!pools.has(key)) pools.set(key, { decoded: e.decoded, rig: e.rig, vertices: new Map(), positions: new Float64Array(e.decoded.attrs.POSITION.length), correctedBind: new Float32Array(e.decoded.attrs.POSITION.length) });
    const pool = pools.get(key);
    need(Boolean(pool.decoded.poseTarget) === Boolean(e.decoded.poseTarget) && (!e.decoded.poseTarget || pool.decoded.poseTarget.delta === e.decoded.poseTarget.delta),
      `${e.name}: shared position/skin pool has conflicting pose targets`);
    for (const v of usedVertices(e.decoded)) { if (!pool.vertices.has(v)) pool.vertices.set(v, []); pool.vertices.get(v).push(`${e.gid}:${e.lod}`); }
  }
  for (const pool of pools.values()) pool.used = Uint32Array.from(pool.vertices.keys());
  summary.verticesPerPose = [...pools.values()].reduce((n, p) => n + p.used.length, 0);
  summary.poseTargetCpuBytes = [...new Set(entries.map(e => e.decoded.poseTarget?.delta).filter(Boolean))].reduce((sum, delta) => sum + delta.byteLength, 0);
  if (fit.poseTargetCpuBytes != null) need(summary.poseTargetCpuBytes === fit.poseTargetCpuBytes, `${id}: pose target CPU byte metadata disagrees with binary`);
  const bodyPoolShared = body.rig.skinIndex === farBody.rig.skinIndex && ['POSITION', 'JOINTS_0', 'WEIGHTS_0'].every(k => body.decoded.attrs[k] === farBody.decoded.attrs[k]);
  const farBodyUsed = usedVertices(farBody.decoded), bodyUsed = bodyPoolShared ? Uint32Array.from(new Set([...usedVertices(body.decoded), ...farBodyUsed])) : usedVertices(body.decoded);
  const bodyPositions = new Float64Array(body.decoded.attrs.POSITION.length), farBodyPositions = bodyPoolShared ? bodyPositions : new Float64Array(farBody.decoded.attrs.POSITION.length);
  const proxyUsed = proxy && usedVertices(proxy.decoded), proxyPositions = proxy && new Float64Array(proxy.decoded.attrs.POSITION.length);
  const identityUsed = identity && usedVertices(identity.decoded), identityPositions = identity && new Float64Array(identity.decoded.attrs.POSITION.length);
  summary.identityVerticesPerPose = identityUsed?.length ?? 0;
  if (!collision) return summary;
  need(samples.length > 0 && samples[0].clipName === 'rest' && CONTRACT.clips.every(n => samples.some(p => p.clipName === n)), `${id}: collision sweep omitted a clip/rest pose`);
  for (const sample of samples) {
    const rotations = sampleRotations(sample.clip, sample.time), matrices = poseMatrices(body.rig, rotations);
    bodySurface.pose(skinPositions(body.decoded, matrices, bodyPositions, bodyUsed));
    farBodySurface.pose(bodyPoolShared ? bodyPositions : skinPositions(farBody.decoded, farBody.rig.skinIndex === body.rig.skinIndex ? matrices : poseMatrices(farBody.rig, rotations), farBodyPositions, farBodyUsed));
    if (proxy) {
      proxySurface.pose(skinPositions(proxy.decoded, proxy.rig.skinIndex === body.rig.skinIndex ? matrices : poseMatrices(proxy.rig, rotations), proxyPositions, proxyUsed));
      skinPositions(identity.decoded, poseMatrices(identity.rig, rotations), identityPositions, identityUsed);
      for (const v of identityUsed) {
        const i = v * 3, x = identityPositions[i], y = identityPositions[i + 1], z = identityPositions[i + 2];
        if (!proxySurface.insideXYZ(x, y, z) && !proxySurface.components.some(part => proxySurface.nearest([x, y, z], part).distance < 0.00001)) {
          summary.issues.push({ kind: 'proxy-enclosure', vertex: v, clip: sample.clipName, time: sample.time });
          if (summary.issues.length >= issueLimit) return summary;
        }
        summary.proxyEnclosureChecks++;
      }
    }
    for (const pool of pools.values()) {
      const pm = pool.rig.skinIndex === body.rig.skinIndex ? matrices : poseMatrices(pool.rig, rotations);
      if (sample.clipName === 'rest') {
        // Authored input must be clear before any correction. A corrupt rest
        // vertex cannot be silently healed and certified by the runtime path.
        skinPositions(pool.decoded, pm, pool.positions, pool.used);
        summary.rawRestChecks += pool.used.length;
      } else {
        try {
          const corrected = pushOutPose(pool.decoded, pm, surfaces, { used: pool.used, padding: 0.002, maxDistance: 0.18, out: { bindPositions: pool.correctedBind, posedPositions: pool.positions } });
          summary.correctedVertices += corrected.count; summary.maxPosePush = Math.max(summary.maxPosePush, corrected.maxPush); summary.maxBindPush = Math.max(summary.maxBindPush, corrected.maxBindPush);
          summary.targetVertices += corrected.targetCount; summary.pushedVertices += corrected.pushCount; summary.maxTargetWeight = Math.max(summary.maxTargetWeight, corrected.targetWeight);
        } catch (error) {
          summary.issues.push({ kind: 'pose-correction', garments: [...new Set([...pool.vertices.values()].flat())], clip: sample.clipName, time: sample.time, message: error.message });
          return summary;
        }
      }
      // Independent final gate reads the actual posed float32 upload, rather
      // than trusting the correction helper's success/count fields.
      const issues = checkPenetrations(surfaces, pool.decoded, pool.positions, pm, { limit: issueLimit - summary.issues.length, push, used: pool.used });
      summary.finalPenetrations += issues.length;
      for (const issue of issues) summary.issues.push({ kind: 'penetration', ...issue, garments: pool.vertices.get(issue.vertex), positionAccessor: entries.find(e => e.decoded.attrs.POSITION === pool.decoded.attrs.POSITION)?.primitive.attributes.POSITION, clip: sample.clipName, time: sample.time });
      summary.vertexChecks += pool.used.length;
      if (summary.issues.length >= issueLimit) return summary;
    }
    if (sample.clipName === 'rest') { if (summary.issues.length) return summary; summary.rawRestClear = true; }
    summary.poses++;
    summary.clipCoverage[sample.clipName] = (summary.clipCoverage[sample.clipName] ?? 0) + 1;
    if (onProgress && summary.poses % 50 === 0) onProgress(summary);
  }
  return summary;
}

/** Authoring utility only. This changes the supplied in-memory GLB and returns
 * rebuilt bytes; it does not certify them. Run validateWear on the final bytes.
 * A small authoring sample set can find a good cut quickly, followed by the full
 * independent release sweep and corrections at any reported failing pose. */
export async function pushOutFit(glb, fit, { id, samples = null, passes = 8, padding = 0.002, maxMove = 0.18, localIterations = 8, onPass = null } = {}) {
  const clips = readPoseBank();
  samples ??= [{ clip: null, clipName: 'rest', time: 0 }, ...clips.flatMap(clip => [0, 0.25, 0.5, 0.75, 1].map(t => ({ clip, clipName: clip.name, time: clip.duration * t })))];
  const body = await geometry(glb, fit.bodyNode), farBody = await geometry(glb, fit.bodyLodNode), proxy = await geometry(glb, fit.proxyNode);
  const surfaces = [new ClosedSurface(body.decoded, ranges(body, fit, 'bodyComponents'), body.name), new ClosedSurface(farBody.decoded, ranges(farBody, fit, 'bodyFarComponents'), farBody.name), new ClosedSurface(proxy.decoded, ranges(proxy, fit, 'proxyComponents'), proxy.name)];
  const bodyUsed = usedVertices(body.decoded), farBodyUsed = usedVertices(farBody.decoded), proxyUsed = usedVertices(proxy.decoded), bodyPos = new Float64Array(body.decoded.attrs.POSITION.length), farBodyPos = new Float64Array(farBody.decoded.attrs.POSITION.length), proxyPos = new Float64Array(proxy.decoded.attrs.POSITION.length);
  const pools = new Map();
  for (const [gid, m] of Object.entries(fit.garments)) for (const [lod, name] of [[0, m.node], [1, m.lodNode]]) {
    const e = await geometry(glb, name), a = e.primitive.attributes, key = `${a.POSITION}/${a.JOINTS_0}/${a.WEIGHTS_0}/${e.node.skin}`;
    if (!pools.has(key)) pools.set(key, { decoded: e.decoded, rig: e.rig, entries: [], vertices: new Set(), original: e.decoded.attrs.POSITION.slice(), positions: new Float64Array(e.decoded.attrs.POSITION.length) });
    const pool = pools.get(key); pool.entries.push({ ...e, gid, lod }); for (const v of usedVertices(e.decoded)) pool.vertices.add(v);
  }
  for (const pool of pools.values()) pool.used = Uint32Array.from(pool.vertices);
  const report = { id, authoringOnly: true, samples: samples.length, passes: [], movedVertices: 0, maxDisplacement: 0, boundedSearches: 0, converged: false };
  const moved = new Set();
  for (let pass = 0; pass < passes; pass++) {
    let corrections = 0, unresolved = 0;
    for (const sample of samples) {
      const rotations = sampleRotations(sample.clip, sample.time), bm = poseMatrices(body.rig, rotations);
      surfaces[0].pose(skinPositions(body.decoded, bm, bodyPos, bodyUsed));
      surfaces[1].pose(skinPositions(farBody.decoded, poseMatrices(farBody.rig, rotations), farBodyPos, farBodyUsed));
      surfaces[2].pose(skinPositions(proxy.decoded, poseMatrices(proxy.rig, rotations), proxyPos, proxyUsed));
      for (const [poolKey, pool] of pools) {
        const matrices = pool.rig.skinIndex === body.rig.skinIndex ? bm : poseMatrices(pool.rig, rotations), a = pool.decoded.attrs;
        skinPositions(pool.decoded, matrices, pool.positions, pool.used);
        for (const vertex of pool.used) {
          const at = vertex * 3; let point = Array.from(pool.positions.subarray(at, at + 3)), matrix = null;
          for (let local = 0; local < localIterations; local++) {
            const surface = surfaces.find(s => s.insideXYZ(...point)); if (!surface) break;
            const correction = closestUnionExit(surfaces, point, { padding }); if (!correction) break;
            matrix ??= blendedMatrix(a, vertex, matrices);
            let delta = inverseVector(matrix, correction.deltaWorld);
            const current = Array.from(a.POSITION.subarray(at, at + 3)), original = Array.from(pool.original.subarray(at, at + 3));
            let candidate = current.map((value, k) => value + delta[k]);
            let displacement = Math.hypot(...candidate.map((value, k) => value - original[k]));
            if (displacement > maxMove && maxMove > padding && maxMove <= .18) {
              report.boundedSearches++;
              const alternative = boundedAuthorExit(surfaces, original, current, matrix, { padding, maxMove });
              if (alternative) { candidate = alternative.target; delta = alternative.deltaBind; displacement = alternative.displacement; }
            }
            need(displacement <= maxMove, `${id}/${pool.entries[0].gid}: push-out would exceed ${maxMove} m at vertex ${vertex}, ${sample.clipName}/${sample.time}; ` + JSON.stringify({
              displacement, original, candidate, deltaBind: delta,
              components: correction.components, joints: Array.from(a.JOINTS_0.subarray(vertex * 4, vertex * 4 + 4)).map(j => pool.rig.jointNames[j]), weights: Array.from(a.WEIGHTS_0.subarray(vertex * 4, vertex * 4 + 4)),
            }));
            a.POSITION.set(candidate, at);
            report.maxDisplacement = Math.max(report.maxDisplacement, displacement); moved.add(`${poolKey}/${vertex}`); corrections++;
            point = transform(matrix, Array.from(a.POSITION.subarray(at, at + 3)));
          }
          if (surfaces.some(s => s.insideXYZ(...point))) unresolved++;
        }
      }
    }
    const row = { pass: pass + 1, corrections, unresolved }; report.passes.push(row); if (onPass) onPass(row);
    if (!corrections && !unresolved) { report.converged = true; break; }
  }
  report.movedVertices = moved.size;
  // Append independent corrected attribute accessors: the original exporter may
  // deduplicate normal buffers belonging to different cuts, so overwriting a
  // shared buffer in place would silently change a different garment.
  const chunks = [Buffer.from(glb.bin.subarray(0, glb.g.buffers[0].byteLength))]; let length = chunks[0].length;
  const append = (data, accessor, stride = null) => {
    const pad = (4 - length % 4) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); length += pad; }
    const vi = glb.g.bufferViews.length; glb.g.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: data.length, target: 34962, ...(stride ? { byteStride: stride } : {}) }); chunks.push(data); length += data.length;
    const ai = glb.g.accessors.length; glb.g.accessors.push({ ...accessor, bufferView: vi }); return ai;
  };
  for (const pool of pools.values()) {
    const p = pool.decoded.attrs.POSITION, count = p.length / 3, posBytes = Buffer.alloc(count * 12), normalBytes = Buffer.alloc(count * 4), normal = new Float64Array(p.length);
    const seenTriangles = new Set();
    for (const e of pool.entries.filter(e => e.lod === 0)) {
      const ix = e.decoded.indices;
      for (let i = 0; i < ix.length; i += 3) {
        const key = `${ix[i]},${ix[i + 1]},${ix[i + 2]}`; if (seenTriangles.has(key)) continue; seenTriangles.add(key);
        const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3, x = p[b] - p[a], y = p[b + 1] - p[a + 1], z = p[b + 2] - p[a + 2], u = p[c] - p[a], v = p[c + 1] - p[a + 1], w = p[c + 2] - p[a + 2];
        const n = [y * w - z * v, z * u - x * w, x * v - y * u];
        for (const at of [a, b, c]) for (let k = 0; k < 3; k++) normal[at + k] += n[k];
      }
    }
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++) {
      let norm = Math.hypot(...normal.subarray(i * 3, i * 3 + 3));
      if (norm < 1e-12) { normal.set(pool.decoded.attrs.NORMAL.subarray(i * 3, i * 3 + 3), i * 3); norm = Math.hypot(...normal.subarray(i * 3, i * 3 + 3)); }
      for (let k = 0; k < 3; k++) { posBytes.writeFloatLE(p[i * 3 + k], i * 12 + k * 4); min[k] = Math.min(min[k], p[i * 3 + k]); max[k] = Math.max(max[k], p[i * 3 + k]); normalBytes.writeInt8(Math.round(normal[i * 3 + k] / norm * 127), i * 4 + k); }
    }
    const pi = append(posBytes, { componentType: 5126, type: 'VEC3', count, min, max });
    const ni = append(normalBytes, { componentType: 5120, normalized: true, type: 'VEC3', count }, 4);
    for (const e of pool.entries) { e.primitive.attributes.POSITION = pi; e.primitive.attributes.NORMAL = ni; }
  }
  glb.g.buffers[0].byteLength = length;
  // Remove obsolete copies after remapping. Keeping old position/normal buffers
  // would pay the download cost twice even though the GPU no longer used them.
  const bin = compactBuffers(glb.g, Buffer.concat(chunks));
  let json = Buffer.from(JSON.stringify(glb.g)); json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
  const binary = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]), output = Buffer.alloc(28 + json.length + binary.length);
  output.writeUInt32LE(0x46546c67, 0); output.writeUInt32LE(2, 4); output.writeUInt32LE(output.length, 8); output.writeUInt32LE(json.length, 12); output.writeUInt32LE(0x4e4f534a, 16); json.copy(output, 20);
  output.writeUInt32LE(binary.length, 20 + json.length); output.writeUInt32LE(0x004e4942, 24 + json.length); binary.copy(output, 28 + json.length);
  report.gpuGeometryBytes = geometryGpuBytes(glb); report.bytes = output.length;
  return { report, bytes: output };
}

export function compactBuffers(g, bin) {
  const used = new Set(), add = ai => { if (ai != null) { need(Number.isSafeInteger(ai) && ai >= 0 && g.accessors?.[ai], 'compaction references an invalid accessor'); used.add(ai); } };
  for (const mesh of g.meshes ?? []) for (const p of mesh.primitives ?? []) {
    Object.values(p.attributes ?? {}).forEach(add); add(p.indices);
    for (const t of p.targets ?? []) Object.values(t).forEach(add);
  }
  for (const s of g.skins ?? []) add(s.inverseBindMatrices);
  for (const a of g.animations ?? []) for (const s of a.samplers) { add(s.input); add(s.output); }
  for (const n of g.nodes ?? []) {
    add(n.extras?.sourceIndicesAccessor);
    if (n.extras?.poseTarget) {
      readWearPoseTarget({ g, bin }, n);
      add(n.extras.poseTarget.deltaAccessor); add(n.extras.poseTarget.basePositionAccessor);
    }
  }
  const accessorOrder = [...used].sort((a, b) => a - b), accessorMap = new Map(accessorOrder.map((a, i) => [a, i]));
  const views = new Set(accessorOrder.map(a => g.accessors[a].bufferView));
  for (const image of g.images ?? []) if (image.bufferView != null) views.add(image.bufferView);
  for (const mesh of g.meshes ?? []) for (const p of mesh.primitives ?? []) if (p.extensions?.KHR_draco_mesh_compression) views.add(p.extensions.KHR_draco_mesh_compression.bufferView);
  const viewOrder = [...views].sort((a, b) => a - b), viewMap = new Map(viewOrder.map((v, i) => [v, i]));
  const out = [], newViews = []; let length = 0;
  for (const vi of viewOrder) {
    const v = g.bufferViews[vi], pad = (4 - length % 4) % 4; if (pad) { out.push(Buffer.alloc(pad)); length += pad; }
    out.push(Buffer.from(bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength))); newViews.push({ ...v, byteOffset: length }); length += v.byteLength;
  }
  g.accessors = accessorOrder.map(a => ({ ...g.accessors[a], bufferView: viewMap.get(g.accessors[a].bufferView) })); g.bufferViews = newViews;
  const remap = o => { for (const k of Object.keys(o)) o[k] = accessorMap.get(o[k]); };
  for (const mesh of g.meshes ?? []) for (const p of mesh.primitives ?? []) {
    remap(p.attributes); p.indices = accessorMap.get(p.indices); for (const t of p.targets ?? []) remap(t);
    if (p.extensions?.KHR_draco_mesh_compression) p.extensions.KHR_draco_mesh_compression.bufferView = viewMap.get(p.extensions.KHR_draco_mesh_compression.bufferView);
  }
  for (const s of g.skins ?? []) s.inverseBindMatrices = accessorMap.get(s.inverseBindMatrices);
  for (const a of g.animations ?? []) for (const s of a.samplers) { s.input = accessorMap.get(s.input); s.output = accessorMap.get(s.output); }
  for (const n of g.nodes ?? []) {
    if (n.extras?.sourceIndicesAccessor != null) n.extras.sourceIndicesAccessor = accessorMap.get(n.extras.sourceIndicesAccessor);
    if (n.extras?.poseTarget) {
      n.extras.poseTarget.deltaAccessor = accessorMap.get(n.extras.poseTarget.deltaAccessor);
      n.extras.poseTarget.basePositionAccessor = accessorMap.get(n.extras.poseTarget.basePositionAccessor);
    }
  }
  for (const image of g.images ?? []) if (image.bufferView != null) image.bufferView = viewMap.get(image.bufferView);
  g.buffers = [{ byteLength: length }]; return Buffer.concat(out);
}

export function adultIds(meta) {
  return meta.people.filter(p => !p.tags.some(t => ['kid', 'teen', 'boy', 'girl'].includes(t)) && (p.tags.includes('adult') || p.tags.includes('elder'))).map(p => p.id);
}
export function checkWearPolicy(manifest, meta, palette) {
  const adults = adultIds(meta), required = ['tshirt', 'shirt', 'blouse', 'jumper', 'trousers', 'jeans', 'skirt', 'dress', 'shorts', 'leggings', 'cap', 'sun_hat', 'straw_hat', 'socks_pair', 'shoes', 'briefs', 'boxers', 'bra', 'bikini_top', 'bikini_bottom', 'swimsuit_onepiece', 'swim_trunks', 'rash_vest'];
  need(manifest.schemaVersion === 1 && manifest.adultOnly === true && manifest.defaultEnabled === false, 'wearable policy must be adult-only and disabled by default');
  need(same(Object.keys(manifest.fits ?? {}), adults), 'wearable policy includes nonadult fit or omits an adult');
  need(same(manifest.bones ?? [], CONTRACT.bones) && same(manifest.clips ?? [], CONTRACT.clips), 'wearable manifest must preserve all 21 bones and 32 clips');
  need(Array.isArray(manifest.garments) && same(manifest.garments.map(g => g.id), required), 'wearable catalogue omits a required design or has duplicate IDs');
  need(manifest.evidenceBodies?.length === 3 && new Set(manifest.evidenceBodies).size === 3 && manifest.evidenceBodies.every(id => adults.includes(id)), 'contact sheet requires three distinct adult body fits');
  for (const g of manifest.garments) {
    need(g.source === 'original-generated' || g.source === 'CC0', `${g.id}: garment source is not generated/CC0`);
    need(g.maxTriangles <= LIMITS.nearTriangles && g.maxTriangles > 0, `${g.id}: invalid triangle limit`);
    need(g.variants?.length > 0 && new Set(g.variants).size === g.variants.length && g.variants.every(v => Object.hasOwn(palette.variants, v)), `${g.id}: unknown/duplicate colour set`);
    need(g.occupies?.length > 0 && new Set(g.occupies).size === g.occupies.length, `${g.id}: missing/duplicate clothing slots`);
    need(g.archetypes?.length > 0 && g.archetypes.every(a => manifest.archetypes[a]?.garments?.includes(g.id)), `${g.id}: invalid archetype eligibility`);
    if (['bikini_top', 'bikini_bottom', 'swimsuit_onepiece', 'swim_trunks', 'rash_vest'].includes(g.id)) need(g.contexts.includes('beach') && !g.contexts.includes('daily'), `${g.id}: swimwear must remain beach-only`);
  }
  return { adults: adults.length, garments: required.length };
}
export function checkInventory(root, files) {
  need(Array.isArray(files) && files.length > 0, 'wearable inventory is empty');
  const seen = new Set();
  for (const f of files) {
    need(!seen.has(f.path), `duplicate wearable inventory ${f.path}`); seen.add(f.path);
    const path = safePath(root, f.path); need(existsSync(path), `missing wearable file ${f.path}`);
    const b = readFileSync(path);
    need(b.length === f.bytes && hash(b) === f.sha256, `stale bytes/SHA-256 for ${f.path}`);
    need(b.length <= LIMITS.fileBytes, `${f.path}: file exceeds 8 MiB`);
  }
  return seen;
}

function sampleCoverage(samples) {
  const counts = {};
  for (const sample of samples) counts[sample.clipName] = (counts[sample.clipName] ?? 0) + 1;
  return counts;
}
function correctionSummary(fits) {
  return { mode: 'pose-time', padding: 0.002, maxDistance: 0.18, resetFromAuthoredPositions: true,
    rawRestClear: fits.every(f => f.rawRestClear), rawRestChecks: fits.reduce((n, f) => n + f.rawRestChecks, 0),
    correctedVertices: fits.reduce((n, f) => n + f.correctedVertices, 0), maxPosePush: Math.max(0, ...fits.map(f => f.maxPosePush)),
    maxBindPush: Math.max(0, ...fits.map(f => f.maxBindPush)), finalPenetrations: fits.reduce((n, f) => n + f.finalPenetrations, 0) };
}

/** Bind split reports to all inputs and to the checker implementation. Re-read
 * at the end of a sweep so concurrent rebuilds cannot produce a mixed report. */
function inputSnapshot(root, metadata, manifest, samples, mode) {
  const project = resolve(root, '../..'), paths = new Set(['wear/metadata.json', 'people/people.glb', 'people/people_lod.glb', 'people/people_meta.json', 'people/people_albedo.jpg', 'people/people_normal.jpg', 'people/people_orm.jpg', 'manifest.people.json', 'manifest.json', 'manifest.garments.json', 'garments/prints.png']);
  if (manifest) { paths.add('manifest.people-wear.json'); paths.add(manifest.palette); for (const f of manifest.files ?? []) paths.add(f.path); }
  const atlas = manifest?.atlas ?? metadata.atlas;
  if (atlas?.file) paths.add(atlas.file.startsWith('wear/') ? atlas.file : `wear/${atlas.file}`);
  for (const fit of Object.values(metadata.fits)) paths.add(fit.file.startsWith('wear/') ? fit.file : `wear/${fit.file}`);
  const files = [...paths].sort().map(path => { const b = readFileSync(safePath(root, path)); return { path: `assets/models/${path}`, bytes: b.length, sha256: hash(b) }; });
  for (const [id, fit] of Object.entries(metadata.fits)) {
    const report = fit.bodySourceProvenance?.componentsReport;
    if (!report) continue; // A diagnostic pre-inventory build can retain inline provenance.
    need(report.path === `dev/wear/body-provenance/${id}.json` && report.form === 'LF', `${id}: invalid body provenance path or form`);
    const b = Buffer.from(readFileSync(resolve(project, report.path), 'utf8').replace(/\r\n/g, '\n'));
    need(b.length === report.bytes && hash(b) === report.sha256, `${id}: body provenance report changed`);
    files.push({ path: report.path, form: 'LF', bytes: b.length, sha256: hash(b) });
  }
  for (const path of ['tools/blender/people_clips.json.gz', 'tools/blender/people_contract.json', 'tools/blender/people_wear.catalog.json',
    'tools/blender/people_wear_build.py', 'tools/blender/people_wear_shapes.py', 'tools/blender/people_wear_fit_faces.mjs', 'tools/blender/people_wear_fit_targets.mjs',
    'tools/blender/people_wear_body.py', 'tools/blender/people_wear_body_guard.py', 'tools/blender/people_wear_lod.py', 'tools/blender/people_wear_fit_search.mjs',
    'tools/blender/people_build.py', 'tools/blender/people_cast.py',
    'tools/blender/people_body.py', 'tools/blender/people_body_limbs.py', 'tools/blender/people_tex.py', 'tools/blender/people_head.py',
    'tools/blender/people_validate.mjs', 'tools/blender/people_wear_math.mjs', 'tools/blender/people_wear_validate.mjs', 'tools/people_wear_data.mjs',
    'js/people/wear_data.js', 'js/people/wear_geometry.js', 'js/people/wear_pose.js', 'js/people/wear_correction.js', 'js/people/wear.js', 'js/people/rig.js',
    'vendor/three/build/three.core.min.js', 'vendor/three/examples/jsm/loaders/GLTFLoader.js']) {
    const b = readFileSync(resolve(project, path)); files.push({ path, bytes: b.length, sha256: hash(b) });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  const sampling = { mode, samples: samples.length, clips: sampleCoverage(samples), sha256: hash(JSON.stringify(samples.map(s => [s.clipName, s.time]))) };
  return { sha256: hash(JSON.stringify({ files, sampling })), files, sampling };
}

/** Pure report merger, also exercised by deliberate missing/changed-input
 * mutations. The CLI obtains `expected` from a fresh structural/inventory scan.
 * A partial, failed, stale, or structure-only report can never become complete. */
export function mergeWearReports(reports, expected) {
  need(Array.isArray(reports) && reports.length > 0, 'no wearable split reports provided');
  need(expected.inventoryVerified && expected.inputs?.sha256 && expected.fits?.length > 0, 'aggregation requires current verified inputs');
  const wanted = new Map(expected.fits.map(f => [f.id, f])), fits = new Map();
  for (const report of reports) {
    need(report.schema === 2 && report.inventoryVerified && report.collisionChecked, 'partial report did not run the verified collision gate');
    need(report.inputs?.sha256 === expected.inputs.sha256 && JSON.stringify(report.inputs) === JSON.stringify(expected.inputs), 'split report inputs changed; rerun the affected sweep');
    need(report.mode === expected.mode && report.samplesPerFit === expected.samplesPerFit && report.requiredClipCount === CONTRACT.clips.length, 'split report pose plan changed');
    need(report.ok && Array.isArray(report.issues) && report.issues.length === 0 && report.fits?.length > 0, 'a failed or empty split report cannot certify clearance');
    for (const fit of report.fits) {
      need(wanted.has(fit.id) && !fits.has(fit.id), `duplicate or unknown split fit ${fit.id}`);
      need(fit.poses === expected.samplesPerFit && JSON.stringify(fit.clipCoverage) === JSON.stringify(expected.inputs.sampling.clips), `${fit.id}: split report omitted a pose or clip`);
      need(Array.isArray(fit.issues) && fit.issues.length === 0 && fit.verticesPerPose > 0 && fit.vertexChecks === fit.verticesPerPose * fit.poses,
        `${fit.id}: incomplete garment vertex coverage`);
      need(fit.identityVerticesPerPose > 0 && fit.proxyEnclosureChecks === fit.identityVerticesPerPose * fit.poses, `${fit.id}: incomplete retained-head enclosure coverage`);
      need(fit.rawRestClear && fit.rawRestChecks === fit.verticesPerPose, `${fit.id}: raw rest input was not independently clear`);
      need(fit.finalPenetrations === 0 && Number.isSafeInteger(fit.correctedVertices) && fit.correctedVertices >= 0 &&
        Number.isFinite(fit.maxPosePush) && fit.maxPosePush >= 0 && fit.maxPosePush <= 0.18 && Number.isFinite(fit.maxBindPush) && fit.maxBindPush >= 0 && fit.maxBindPush <= 0.18,
      `${fit.id}: invalid or excessive pose correction`);
      const original = wanted.get(fit.id);
      for (const key of ['garments', 'maxNearTriangles', 'maxFarTriangles', 'geometryBytes', 'bodyComponents', 'farBodyComponents', 'proxyComponents', 'sourceVisibleNode', 'verticesPerPose', 'identityVerticesPerPose'])
        need(fit[key] === original[key], `${fit.id}: split report geometry changed`);
      fits.set(fit.id, fit);
    }
  }
  need(fits.size === wanted.size && [...wanted.keys()].every(id => fits.has(id)), 'split reports omit one or more adult fits');
  const ordered = [...wanted.keys()].map(id => fits.get(id));
  return { ...expected, ok: true, complete: true, collisionChecked: true, selectedComplete: true, fits: ordered, correction: correctionSummary(ordered), issues: [], aggregatedReports: reports.length };
}

export async function validateWear({ root = ROOT, mode = 'all', fitIds = null, push = false, issueLimit = 24, inventory = true, collision = true, onProgress = null } = {}) {
  need(Number.isInteger(issueLimit) && issueLimit > 0, 'issue limit must be a positive integer (it stops only an already failed sweep)');
  const metadataPath = resolve(root, 'wear/metadata.json'); need(existsSync(metadataPath), 'wear metadata is missing');
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')), meta = JSON.parse(readFileSync(resolve(root, 'people/people_meta.json'), 'utf8'));
  const adults = adultIds(meta);
  const available = Object.keys(metadata.fits ?? {});
  need(metadata.schema === 1 && available.length > 0 && available.every(id => adults.includes(id)) && same(metadata.fitIds ?? available, available), 'wear fit IDs must be adult and elder residents');
  if (inventory) need(same(available, adults), 'wearable metadata omits an adult fit');
  const peopleBytes = readFileSync(resolve(root, 'people/people.glb')), clipBytes = readFileSync(resolve(HERE, 'people_clips.json.gz'));
  need(metadata.sourcePeopleSha256 === hash(peopleBytes), 'wearable source people bytes changed; rebuild required');
  need(metadata.sourceClipBankSha256 === hash(clipBytes), 'wearable source clip bank changed; rebuild required');
  checkPeopleWearSourceInputs(metadata.sourceInputs, resolve(root, '../..'));
  const manifestPath = resolve(root, 'manifest.people-wear.json'), manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
  if (inventory) {
    need(manifest, 'wearable manifest missing'); checkInventory(root, manifest.files);
    checkWearPolicy(manifest, meta, JSON.parse(readFileSync(safePath(root, manifest.palette), 'utf8')));
    const project = resolve(root, '../..');
    need(JSON.stringify(manifest) === JSON.stringify(buildWearManifest(project)), 'wearable manifest differs from its source data and measured inventory');
    need(readFileSync(resolve(project, 'js/people/wear_data.js'), 'utf8') === wearDataModule(project), 'generated wearable runtime table has drifted');
  }
  const selected = fitIds ?? available; need(selected.length > 0 && new Set(selected).size === selected.length && selected.every(id => available.includes(id)), 'unsupported/duplicate/nonadult wearable fit');
  const sourceGlb = readGlb(resolve(root, 'people/people.glb')), samples = poseSamples(readPoseBank(), mode), fits = [];
  const inputs = inputSnapshot(root, metadata, manifest, samples, mode);
  let geometryBytes = 0, modelBytes = 0; const images = new Map(), fileRefs = new Set();
  const atlas = manifest?.atlas ?? metadata.atlas;
  need(atlas?.file, 'wearable shared atlas is missing');
  const atlasFile = atlas.file.startsWith('wear/') ? atlas.file : `wear/${atlas.file}`, atlasPath = safePath(root, atlasFile);
  images.set(atlasPath, { path: atlasFile, bytes: readFileSync(atlasPath), ...(atlas.size ? { width: atlas.size[0], height: atlas.size[1] } : {}) });
  for (const id of available) {
    const fit = metadata.fits[id], file = fit.file.startsWith('wear/') ? fit.file : `wear/${fit.file}`;
    need(!fileRefs.has(file), `${id}: each exact fit needs its own recorded file`); fileRefs.add(file);
    const path = safePath(root, file), glb = readWearGlb(path); geometryBytes += geometryGpuBytes(glb);
    modelBytes += glb.shippedBytes;
    for (const image of glb.g.images ?? []) {
      need(image.uri && !image.bufferView && !/^[a-z]+:/i.test(image.uri), `${file}: embedded/remote images are forbidden`);
      const path = resolve(dirname(safePath(root, file)), image.uri), rel = relative(root, path).split(sep).join('/');
      need(!rel.startsWith('../'), `${file}: image escapes model tree`);
      // Source people maps already consume GPU memory in the unchanged scene.
      if (!rel.startsWith('people/')) images.set(path, { path: rel, bytes: readFileSync(path) });
    }
    if (selected.includes(id)) {
      if (onProgress) onProgress({ phase: 'start', id, fits: selected.length, samples: samples.length });
      const result = await inspectFit(glb, fit, { id, sourceGlb, garmentIds: manifest?.garments?.map(g => g.id) ?? Object.keys(fit.garments), samples, collision, push, issueLimit,
        onProgress: onProgress ? state => { if (state.poses % 250 === 0) onProgress({ phase: 'poses', id, poses: state.poses, samples: samples.length, issues: state.issues.length }); } : null });
      fits.push(result);
      if (onProgress) onProgress({ phase: 'done', id, poses: result.poses, samples: samples.length, vertexChecks: result.vertexChecks, issues: result.issues.length });
    }
  }
  need(images.size <= 3, 'wearable atlas uses more than one PBR page set');
  const gpu = checkGpuBudget(geometryBytes, [...images.values()]);
  if (inventory) checkWearModelBudget(modelBytes);
  need(inputSnapshot(root, metadata, manifest, samples, mode).sha256 === inputs.sha256, 'wearable input bytes changed during the sweep; rerun against a stable build');
  const issues = fits.flatMap(f => f.issues.map(i => ({ fit: f.id, ...i })));
  const selectedComplete = collision && fits.every(f => f.poses === samples.length);
  return { ok: issues.length === 0, schema: 2, mode, requiredClipCount: CONTRACT.clips.length, samplesPerFit: samples.length,
    inventoryVerified: inventory, collisionChecked: collision, selectedComplete, complete: inventory && selected.length === adults.length && selectedComplete, inputs,
    fits, correction: correctionSummary(fits), ...gpu, modelBytes, modelLimitBytes: COMPRESSED_MODEL_BYTES, files: [...fileRefs], imageFiles: [...images.values()].map(i => i.path), issues, sourcePeopleSha256: hash(peopleBytes), sourceClipBankSha256: hash(clipBytes) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2), value = name => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1]; };
  try {
    if (value('--solve-fit')) {
      const root = value('--root') ? resolve(value('--root')) : ROOT, metadata = JSON.parse(readFileSync(resolve(root, 'wear/metadata.json'))), id = value('--solve-fit'), fit = metadata.fits[id];
      need(fit, 'unknown authoring fit'); need(value('--out'), 'author push-out requires an explicit --out file'); const path = safePath(root, fit.file.startsWith('wear/') ? fit.file : `wear/${fit.file}`);
      const result = await pushOutFit(readWearGlb(path), fit, { id, passes: Number(value('--passes') ?? 8), padding: Number(value('--padding') ?? 0.002), maxMove: Number(value('--max-move') ?? 0.18),
        ...(argv.includes('--rest-only') ? { samples: [{ clip: null, clipName: 'rest', time: 0 }] } : {}),
        onPass: argv.includes('--progress') ? row => console.error(JSON.stringify({ phase: 'authoring-pass', id, ...row })) : null });
      writeFileSync(resolve(value('--out')), result.bytes);
      if (value('--report')) writeFileSync(resolve(value('--report')), JSON.stringify(result.report, null, 2) + '\n');
      console.log(JSON.stringify(result.report)); process.exitCode = 0;
    } else {
    const options = { root: value('--root') ? resolve(value('--root')) : ROOT, mode: value('--mode') ?? 'all', fitIds: value('--fit')?.split(',') ?? null, push: argv.includes('--push'), issueLimit: Number(value('--limit') ?? 24), inventory: !argv.includes('--build-scan'), collision: !argv.includes('--structure-only'),
      onProgress: argv.includes('--progress') ? row => console.error(JSON.stringify(row)) : null };
    let report;
    if (value('--aggregate')) {
      need(!options.fitIds && options.inventory && options.collision, 'aggregation cannot omit inventory, adult fits or collision coverage');
      const expected = await validateWear({ ...options, collision: false });
      report = mergeWearReports(value('--aggregate').split(',').map(p => JSON.parse(readFileSync(resolve(p), 'utf8'))), expected);
    } else report = await validateWear(options);
    if (value('--report')) writeFileSync(resolve(value('--report')), JSON.stringify(report, null, 2) + '\n');
    if (argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else console.log(JSON.stringify({ ok: report.ok, complete: report.complete, fits: report.fits.length, samplesPerFit: report.samplesPerFit, vertexChecks: report.fits.reduce((n, f) => n + f.vertexChecks, 0), gpuMiB: report.gpuMiB, issues: report.issues.slice(0, 12) }, null, 2));
    process.exitCode = report.ok ? 0 : 1;
    }
  } catch (error) { console.error(error.stack ?? String(error)); process.exitCode = 1; }
}
