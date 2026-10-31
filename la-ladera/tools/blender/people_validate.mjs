#!/usr/bin/env node
// Validate the bytes consumed by the unchanged CharacterLibrary, not the builder's triangle claims.
// node la-ladera/tools/blender/people_validate.mjs --complete [--json]
// --root <models-dir> checks a scratch export. --inventory prints the files/bytes/SHA-256 entries.
// --write-manifest explicitly updates ONLY manifest.people.json.files after both exports, the
// shared external atlas and metadata exist. --complete never writes anything.
import '../../tests/nice.mjs';
import { readFileSync, writeFileSync, renameSync, rmSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { dirname, resolve, relative, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import PEOPLE_MATERIALS from '../../js/people/matdefs.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CONTRACT = JSON.parse(readFileSync(resolve(HERE, 'people_contract.json'), 'utf8'));
export const DEFAULT_ROOT = resolve(HERE, '../../assets/models');
export const LIMITS = Object.freeze({ near: 8000, far: 1500, uvTriangleSpan: 0.128, uvCellTolerance: 0.00015, bytes: 14 * 1048576, fileBytes: 8 * 1048576 });
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const TYPES = { 5120: [1, 'getInt8', 127], 5121: [1, 'getUint8', 255], 5122: [2, 'getInt16', 32767], 5123: [2, 'getUint16', 65535], 5125: [4, 'getUint32', 4294967295], 5126: [4, 'getFloat32', 1] };
const SLOT_IDS = { top: 2, bottom: 3, shoes: 4, hat: 5, accessory: 6, inner: 7, skin: 8 };
const canon = (name) => name.replace(/_\d+$/, '');
const hash = (data) => createHash('sha256').update(data).digest('hex');
const posix = (p) => p.split(sep).join('/');
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const sameSet = (a, b) => a.length === b.length && new Set(a).size === a.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
const close = (a, b, tolerance = 0.0002) => a.length === b.length && a.every((v, i) => Number.isFinite(v) && Math.abs(v - b[i]) <= tolerance);
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Strict GLB 2 parser. Truncated buffers and out-of-range views are rejected. */
export function parseGlb(bytes, label = 'GLB') {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  assert(b.length >= 28 && b.readUInt32LE(0) === 0x46546c67, `${label}: invalid GLB header`);
  assert(b.readUInt32LE(4) === 2 && b.readUInt32LE(8) === b.length, `${label}: GLB version/length mismatch`);
  let g, bin;
  for (let off = 12; off < b.length;) {
    assert(off + 8 <= b.length, `${label}: truncated chunk header`);
    const size = b.readUInt32LE(off), type = b.readUInt32LE(off + 4); off += 8;
    assert(size % 4 === 0 && off + size <= b.length, `${label}: truncated/unaligned chunk`);
    if (type === 0x4e4f534a) {
      assert(!g && off === 20, `${label}: JSON must be the first and only JSON chunk`);
      g = JSON.parse(b.toString('utf8', off, off + size));
    } else if (type === 0x004e4942) { assert(!bin, `${label}: duplicate BIN chunk`); bin = b.subarray(off, off + size); }
    else throw new Error(`${label}: unsupported GLB chunk ${type.toString(16)}`);
    off += size;
  }
  assert(g?.asset?.version === '2.0' && bin, `${label}: missing glTF 2 JSON/BIN`);
  assert(g.buffers?.length === 1 && !g.buffers[0].uri, `${label}: expected one internal geometry buffer`);
  assert(g.buffers[0].byteLength <= bin.length && bin.length - g.buffers[0].byteLength <= 3, `${label}: BIN byteLength mismatch`);
  for (const [i, v] of (g.bufferViews ?? []).entries()) {
    assert(v.buffer === 0 && Number.isSafeInteger(v.byteLength) && v.byteLength >= 0 && Number.isSafeInteger(v.byteOffset ?? 0) && (v.byteOffset ?? 0) >= 0 && (v.byteOffset ?? 0) + v.byteLength <= g.buffers[0].byteLength,
      `${label}: bufferView ${i} outside BIN`);
  }
  return { g, bin, bytes: b.length, sha256: hash(b), label };
}

export const readGlb = (path) => parseGlb(readFileSync(path), path);

/** Read interleaved/normalized binary accessors, including animation samples and inverse bind matrices. */
export function readAccessor(glb, index) {
  const { g, bin, label } = glb, a = g.accessors?.[index];
  assert(a, `${label}: missing accessor ${index}`);
  assert(!a.sparse, `${label}: sparse accessor ${index} is outside the people export contract`);
  const t = TYPES[a.componentType], width = COMPONENTS[a.type];
  assert(t && width && Number.isSafeInteger(a.count) && a.count > 0, `${label}: invalid accessor ${index}`);
  const v = g.bufferViews?.[a.bufferView];
  assert(v, `${label}: accessor ${index} has no bufferView (compressed attributes must be decoded)`);
  const stride = v.byteStride ?? t[0] * width, offset = a.byteOffset ?? 0;
  assert(Number.isSafeInteger(offset) && offset >= 0 && Number.isSafeInteger(stride) && stride >= t[0] * width && offset + (a.count - 1) * stride + width * t[0] <= v.byteLength, `${label}: accessor ${index} overruns bufferView`);
  const data = new DataView(bin.buffer, bin.byteOffset + (v.byteOffset ?? 0), v.byteLength), out = new Float64Array(a.count * width);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < width; k++) {
    let n = data[t[1]](offset + i * stride + k * t[0], true);
    if (a.normalized) n = Math.max(-1, n / t[2]);
    out[i * width + k] = n;
  }
  return out;
}

function accessorPayload(glb, index) {
  const a = glb.g.accessors[index], v = glb.g.bufferViews[a.bufferView], width = TYPES[a.componentType][0] * COMPONENTS[a.type];
  // readAccessor performs the range checks, but compare the original binary representation,
  // including signed zero, rather than a rounded/retimed floating-point approximation.
  readAccessor(glb, index);
  const stride = v.byteStride ?? width, start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0), rows = [];
  for (let i = 0; i < a.count; i++) rows.push(glb.bin.subarray(start + i * stride, start + i * stride + width));
  return Buffer.concat(rows);
}

export function readClipBank() {
  const bank = JSON.parse(gunzipSync(readFileSync(resolve(HERE, 'people_clips.json.gz'))));
  assert(bank.schema === 1, 'unknown animation source-bank schema');
  for (const key of ['bones', 'clips', 'fps', 'clipFrames', 'oneShotClips']) assert(JSON.stringify(bank.contract[key]) === JSON.stringify(CONTRACT[key]), `source-bank ${key} disagrees with frozen contract`);
  return { g: bank.gltf, bin: Buffer.from(bank.binaryBase64, 'base64'), label: 'people_clips.json.gz', provenance: bank.provenance };
}

/** Every quaternion and keyframe time must retain its original raw bytes after node remapping. */
export function checkClipBytes(glb) {
  const bank = readClipBank(), original = new Map(bank.g.animations.map((a) => [a.name, a]));
  assert(sameSet((glb.g.animations ?? []).map((a) => a.name), [...original.keys()]), 'clip-bank comparison requires all 32 animations');
  const tracks = (doc, animation) => new Map(animation.channels.filter((c) => c.target.path === 'rotation').map((c) => [canon(doc.g.nodes[c.target.node].name), animation.samplers[c.sampler]]));
  for (const a of glb.g.animations) {
    const actual = tracks(glb, a), wanted = tracks(bank, original.get(a.name));
    assert(sameSet([...actual.keys()], [...wanted.keys()]), `${a.name}: rotation targets differ from the original bank`);
    for (const [bone, reference] of wanted) {
      const sampler = actual.get(bone);
      assert((sampler.interpolation ?? 'LINEAR') === (reference.interpolation ?? 'LINEAR'), `${a.name}/${bone}: interpolation changed`);
      for (const key of ['input', 'output']) {
        const x = glb.g.accessors[sampler[key]], y = bank.g.accessors[reference[key]];
        assert(x.componentType === y.componentType && x.type === y.type && x.count === y.count && !!x.normalized === !!y.normalized, `${a.name}/${bone}: ${key} sample format/count changed`);
        assert(accessorPayload(glb, sampler[key]).equals(accessorPayload(bank, reference[key])), `${a.name}/${bone}: ${key} bytes differ from the original clip bank`);
      }
    }
  }
  return bank.provenance.rotationSha256;
}

let dracoPromise;
async function draco() {
  if (!dracoPromise) dracoPromise = (async () => {
    const dir = resolve(HERE, '../../vendor/three/examples/jsm/libs/draco/gltf');
    // The vendored UMD module lives below a type:module package. Give it its documented
    // CommonJS export object without installing a second decoder or changing repository files.
    const scope = { module: { exports: {} }, exports: {}, console };
    vm.runInNewContext(readFileSync(resolve(dir, 'draco_wasm_wrapper.js'), 'utf8'), scope, { filename: 'draco_wasm_wrapper.js' });
    return scope.module.exports({ wasmBinary: new Uint8Array(readFileSync(resolve(dir, 'draco_decoder.wasm'))) });
  })();
  return dracoPromise;
}

/** Decode the real topology and attributes. A lying accessor count cannot bypass the budget. */
export async function decodePrimitive(glb, primitive) {
  const { g, bin, label } = glb, ext = primitive.extensions?.KHR_draco_mesh_compression;
  const attrs = {};
  assert((primitive.mode ?? 4) === 4 && primitive.indices != null, `${label}: people must be indexed triangles`);
  if (!ext) {
    for (const [name, ai] of Object.entries(primitive.attributes)) attrs[name] = readAccessor(glb, ai);
    return { attrs, indices: readAccessor(glb, primitive.indices), vertices: g.accessors[primitive.attributes.POSITION].count };
  }
  const d = await draco(), decoder = new d.Decoder(), buffer = new d.DecoderBuffer(), mesh = new d.Mesh();
  try {
    const view = g.bufferViews[ext.bufferView]; assert(view, `${label}: missing Draco bufferView`);
    const src = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    buffer.Init(src, src.byteLength);
    assert(decoder.GetEncodedGeometryType(buffer) === d.TRIANGULAR_MESH, `${label}: Draco data is not a mesh`);
    const status = decoder.DecodeBufferToMesh(buffer, mesh);
    assert(status.ok() && mesh.ptr, `${label}: Draco decode failed: ${status.error_msg()}`);
    const vertices = mesh.num_points(), count = mesh.num_faces() * 3;
    assert(g.accessors[primitive.indices]?.count === count, `${label}: index accessor count disagrees with decoded Draco triangles`);
    for (const [name, ai] of Object.entries(primitive.attributes)) {
      const a = g.accessors[ai];
      if (ext.attributes[name] == null) { attrs[name] = readAccessor(glb, ai); continue; }
      const attr = decoder.GetAttributeByUniqueId(mesh, ext.attributes[name]);
      assert(attr?.ptr && a.count === vertices && COMPONENTS[a.type] === attr.num_components(), `${label}: ${name} accessor disagrees with decoded Draco attribute`);
      const values = new d.DracoFloat32Array();
      try {
        assert(decoder.GetAttributeFloatForAllPoints(mesh, attr, values), `${label}: cannot decode ${name}`);
        const out = new Float64Array(values.size());
        for (let i = 0; i < out.length; i++) out[i] = values.GetValue(i);
        // Draco's float getter already normalizes integer attributes (e.g. COLOR_0).
        attrs[name] = out;
      } finally { d.destroy(values); }
    }
    const ptr = d._malloc(count * 4);
    let indices;
    try { decoder.GetTrianglesUInt32Array(mesh, count * 4, ptr); indices = new Uint32Array(d.HEAPU32.buffer, ptr, count).slice(); }
    finally { d._free(ptr); }
    return { attrs, indices, vertices };
  } finally { d.destroy(mesh); d.destroy(buffer); d.destroy(decoder); }
}

function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}
function nodeMatrix(n) {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1], t = n.translation ?? [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, ...t, 1];
}
function parentMap(g) {
  const parents = new Map();
  for (const [i, n] of g.nodes.entries()) for (const c of n.children ?? []) {
    assert(g.nodes[c] && c !== i && !parents.has(c), `node ${i}: invalid child or multiply-parented node ${c}`); parents.set(c, i);
  }
  return parents;
}

/** The joint ordinal is part of the geometry-only LOD ABI: names alone are insufficient. */
export function compareSkeletons(near, far, id) {
  assert(JSON.stringify(near.joints) === JSON.stringify(far.joints), `${id}: far LOD joint order differs from near`);
  assert(close(near.bind, far.bind, 0.002), `${id}: far inverse bind matrices differ from near`);
  for (const bone of near.joints) {
    assert(near.parents[bone] === far.parents[bone], `${id}: far parent differs for ${bone}`);
    assert(close(near.world[bone], far.world[bone], 0.002), `${id}: far rest transform differs for ${bone}`);
  }
}

function inspectCharacter(glb, id, expected) {
  const { g, label } = glb, nodes = g.nodes, rootName = `person_${id}`;
  const roots = nodes.map((n, i) => n.name === rootName ? i : -1).filter((i) => i >= 0);
  assert(roots.length === 1, `${label}: expected exactly one ${rootName}`);
  const root = roots[0], parents = parentMap(g), descendants = new Set();
  const visit = (i) => { assert(!descendants.has(i), `${id}: cyclic node graph`); descendants.add(i); for (const c of nodes[i].children ?? []) visit(c); }; visit(root);
  const meshes = [...descendants].filter((i) => nodes[i].mesh != null);
  assert(meshes.length === 1 && nodes[meshes[0]].name === `${rootName}_mesh`, `${id}: requires one skinned ${rootName}_mesh (the loader swaps only one geometry)`);
  const node = nodes[meshes[0]], mesh = g.meshes[node.mesh], skin = g.skins?.[node.skin];
  assert(mesh?.primitives?.length === 1, `${id}: requires one material primitive, for one draw call and complete LOD replacement`);
  assert(mesh.primitives[0].material === 0, `${id}: primitive does not use the shared material`);
  assert(close(nodeMatrix(nodes[root]), identity()) && close(nodeMatrix(node), identity()), `${id}: armature/mesh transforms must be applied in metre scale`);
  assert(skin && skin.joints.length === CONTRACT.bones.length && skin.joints.every((j) => descendants.has(j)), `${id}: missing/foreign skin joints`);
  const joints = skin.joints.map((j) => canon(nodes[j].name));
  assert(sameSet(joints, CONTRACT.bones), `${id}: bone names differ from the 21-bone contract`);
  // Exporters may reorder the joint table. JOINTS_0 indexes that file's own table;
  // compatibility with the old library is by bone name, hierarchy and rest pose.
  // Geometry-only LOD swaps are stricter: compareSkeletons requires the new near
  // and far tables to have exactly the same ordering and inverse bind matrices.
  const bind = readAccessor(glb, skin.inverseBindMatrices);
  assert(g.accessors[skin.inverseBindMatrices].type === 'MAT4' && bind.length === 21 * 16, `${id}: inverse bind matrix count/type mismatch`);
  const cache = new Map(), visiting = new Set();
  const worldMatrix = (i) => {
    if (cache.has(i)) return cache.get(i);
    assert(!visiting.has(i), `${id}: cyclic transform graph`); visiting.add(i);
    const local = nodeMatrix(nodes[i]); assert(local.every(Number.isFinite), `${id}: non-finite node transform`);
    const world = parents.has(i) ? multiply(worldMatrix(parents.get(i)), local) : local; cache.set(i, world); visiting.delete(i); return world;
  };
  const world = {}, boneParents = {}, meshWorld = worldMatrix(meshes[0]);
  for (const [k, j] of skin.joints.entries()) {
    const name = joints[k], n = nodes[j], parent = skin.joints.includes(parents.get(j)) ? canon(nodes[parents.get(j)].name) : null;
    const ref = CONTRACT.restOrientation[name], q = n.rotation ?? [0, 0, 0, 1];
    assert(parent === ref.parent, `${id}: hierarchy changed at ${name}`);
    assert(close(q, ref.rotation, 0.002) || close(q, ref.rotation.map((v) => -v), 0.002), `${id}: rest orientation changed at ${name}; shared clips would retarget incorrectly`);
    if (expected?.restTranslations?.[name]) assert(close(n.translation ?? [0, 0, 0], expected.restTranslations[name], 0.004), `${id}: anatomical/rest scale changed at ${name}`);
    world[name] = worldMatrix(j); boneParents[name] = parent;
    assert(close(multiply(world[name], [...bind.slice(k * 16, (k + 1) * 16)]), meshWorld, 0.004), `${id}: incorrect inverse bind matrix for ${name}`);
  }
  return { primitive: mesh.primitives[0], joints, bind, world, parents: boneParents };
}

/** Checks real decoded attributes, including every vertex's joint weights and recolour slot code. */
export function checkVertexData(decoded, meta, limit, label) {
  const { attrs: a, indices, vertices } = decoded;
  const widths = { POSITION: 3, NORMAL: 3, TEXCOORD_0: 2, COLOR_0: 4, JOINTS_0: 4, WEIGHTS_0: 4 };
  for (const [key, width] of Object.entries(widths)) assert(a[key]?.length === vertices * width, `${label}: missing or malformed ${key}`);
  assert(!a.JOINTS_1 && !a.WEIGHTS_1, `${label}: more than four joint influences are outside the runtime contract`);
  assert(indices.length > 0 && indices.length % 3 === 0 && indices.length / 3 <= limit, `${label}: ${indices.length / 3} triangles exceeds ${limit}`);
  for (const i of indices) assert(Number.isSafeInteger(i) && i >= 0 && i < vertices, `${label}: triangle index outside vertex buffer`);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], slotCounts = {};
  const allowedSlots = new Set(Object.values(meta.slots ?? {}).map((s) => s.id));
  let maxWeightError = 0;
  for (let i = 0; i < vertices; i++) {
    for (const [key, width] of Object.entries(widths)) for (let k = 0; k < width; k++) assert(Number.isFinite(a[key][i * width + k]), `${label}: non-finite ${key} at vertex ${i}`);
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a.POSITION[i * 3 + k]); hi[k] = Math.max(hi[k], a.POSITION[i * 3 + k]); }
    const nlen = Math.hypot(...a.NORMAL.slice(i * 3, i * 3 + 3)); assert(nlen > 0.8 && nlen < 1.2, `${label}: invalid vertex normal ${i}`);
    for (let k = 0; k < 2; k++) assert(a.TEXCOORD_0[i * 2 + k] >= -0.003 && a.TEXCOORD_0[i * 2 + k] <= 1.003, `${label}: UV outside shared atlas at ${i}`);
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      const joint = a.JOINTS_0[i * 4 + k], w = a.WEIGHTS_0[i * 4 + k], c = a.COLOR_0[i * 4 + k];
      assert(Number.isInteger(joint) && joint >= 0 && joint < 21, `${label}: invalid skin joint at vertex ${i}`);
      assert(w >= 0 && w <= 1.001, `${label}: invalid skin weight at vertex ${i}`); sum += w;
      assert(c >= -0.001 && c <= 1.001, `${label}: vertex colour outside [0,1] at ${i}`);
    }
    maxWeightError = Math.max(maxWeightError, Math.abs(sum - 1));
    assert(Math.abs(sum - 1) <= 0.018, `${label}: unnormalized skin weights at vertex ${i}: ${sum}`);
    const alpha = a.COLOR_0[i * 4 + 3], slot = Math.round(alpha * 255 / 16);
    if (Math.abs(alpha - 1) <= 0.003) slotCounts.fixed = (slotCounts.fixed ?? 0) + 1;
    else {
      assert(allowedSlots.has(slot) && Math.abs(alpha - slot * 16 / 255) <= 0.003, `${label}: invalid recolour alpha ${alpha} at vertex ${i} (slot ${slot})`);
      slotCounts[slot] = (slotCounts[slot] ?? 0) + 1;
    }
  }
  // The shared atlas is 8 x 8 cells. Clamping broken full-face [0,1] UVs would
  // satisfy a bounds check while still smearing skin, eyes and cloth together.
  // Both original LODs stay within one cell per triangle (measured max 0.124448).
  let maxUvSpan = 0, maxUvCellOvershoot = 0;
  for (let i = 0; i < indices.length; i += 3) for (let axis = 0; axis < 2; axis++) {
    const u = a.TEXCOORD_0[indices[i] * 2 + axis], v = a.TEXCOORD_0[indices[i + 1] * 2 + axis], w = a.TEXCOORD_0[indices[i + 2] * 2 + axis];
    const low = Math.min(u, v, w), high = Math.max(u, v, w), span = high - low; maxUvSpan = Math.max(maxUvSpan, span);
    assert(span <= LIMITS.uvTriangleSpan, `${label}: triangle ${i / 3} crosses atlas cells (UV span ${span.toFixed(5)} > ${LIMITS.uvTriangleSpan})`);
    // A small triangle can still straddle a tile edge. Infer the authored cell
    // from its centroid and require every corner inside that cell. The 12-bit
    // Draco UV quantizer has at most 0.000123 half-step error over [0,1]; this
    // allowance is smaller than the atlas half-pixel inset (0.000244 at 2048px).
    const cell = Math.max(0, Math.min(7, Math.floor((u + v + w) / 3 * 8)));
    const overshoot = Math.max(0, cell / 8 - low, high - (cell + 1) / 8);
    maxUvCellOvershoot = Math.max(maxUvCellOvershoot, overshoot);
    assert(overshoot <= LIMITS.uvCellTolerance, `${label}: triangle ${i / 3} crosses atlas cell ${axis === 0 ? 'column' : 'row'} ${cell} (UV overshoot ${overshoot.toFixed(7)} > ${LIMITS.uvCellTolerance})`);
  }
  const height = hi[1] - lo[1];
  assert(Math.abs(lo[1]) <= 0.025, `${label}: soles are not at y=0 (${lo[1]})`);
  assert(Math.abs(height - meta.heightM) <= 0.045, `${label}: actual height ${height.toFixed(4)} m disagrees with metadata ${meta.heightM}`);
  assert(hi[0] - lo[0] < 1.5 && hi[2] - lo[2] < 1.0, `${label}: implausibly wide/deep rest-pose body`);
  return { tris: indices.length / 3, vertices, min: lo, max: hi, heightM: height, slotCounts, maxWeightError, maxUvSpan, maxUvCellOvershoot };
}

function checkMeta(meta, complete) {
  assert(Array.isArray(meta.people) && meta.people.length > 0, 'people_meta.json: no people');
  const ids = meta.people.map((p) => p.id), expectedIds = CONTRACT.people.map((p) => p.id);
  assert(new Set(ids).size === ids.length && ids.every((id) => expectedIds.includes(id)), 'people_meta.json: duplicate or unknown IDs');
  if (complete) assert(sameSet(ids, expectedIds), `people_meta.json: complete requires all 30 IDs; missing: ${expectedIds.filter((id) => !ids.includes(id)).join(', ')}`);
  assert(meta.fps === CONTRACT.fps && JSON.stringify(meta.clipFrames) === JSON.stringify(CONTRACT.clipFrames), 'people_meta.json: clip timing contract changed');
  assert(sameSet(meta.oneShotClips ?? [], CONTRACT.oneShotClips) && sameSet(meta.loopClips ?? [], CONTRACT.clips.filter((n) => !CONTRACT.oneShotClips.includes(n))), 'people_meta.json: loop/one-shot clip contract changed');
  for (const p of meta.people) {
    const ref = CONTRACT.people.find((x) => x.id === p.id);
    assert(p.kind === ref.kind && ref.tags.every((t) => p.tags.includes(t)), `${p.id}: cast kind/tags changed`);
    assert(sameSet(p.clips ?? [], CONTRACT.clips), `${p.id}: requires the same 32 clips`);
    for (const key of ['heightM', 'eyeHeightM', 'shoulderWidthM', 'hipHeightM', 'seatRootDropM', 'seatedEyeHeightM', 'seatedHeadTopM', 'legLengthM', 'walkSpeedMps', 'walkFastSpeedMps', 'runSpeedMps']) assert(Number.isFinite(p[key]), `${p.id}: missing/non-finite ${key}`);
    assert(Math.abs(p.heightM - ref.declaredHeightM) < 0.12, `${p.id}: figure is no longer at its authored metre scale`);
    for (const key of ['hipHeightM', 'legLengthM', 'seatRootDropM']) if (ref.baseline) assert(Math.abs(p[key] - ref.baseline[key]) <= 0.004, `${p.id}: functional scale ${key} changed`);
    assert(Math.abs(p.hipHeightM - p.seatRootDropM - meta.seatHipM) <= 0.002, `${p.id}: seated hip offset is inconsistent`);
    assert(p.slots && Object.keys(p.slots).length > 0, `${p.id}: no recolour slots`);
    for (const [name, s] of Object.entries(p.slots)) assert(s.id === SLOT_IDS[name] && /^#[0-9a-f]{6}$/i.test(s.hex) && s.gain > 0 && s.gain <= 2, `${p.id}: invalid ${name} recolour slot`);
  }
  return ids;
}

function checkAnimations(glb) {
  const { g } = glb;
  assert(sameSet((g.animations ?? []).map((a) => a.name), CONTRACT.clips), 'near GLB must contain exactly the original 32 named clips');
  for (const a of g.animations) {
    const rotations = a.channels.filter((c) => c.target?.path === 'rotation'), names = rotations.map((c) => canon(g.nodes[c.target.node]?.name ?? ''));
    assert(sameSet(names, CONTRACT.bones), `${a.name}: requires one rotation track per canonical bone`);
    let duration = 0;
    for (const c of rotations) {
      const s = a.samplers[c.sampler]; assert(s && ['LINEAR', 'STEP'].includes(s.interpolation ?? 'LINEAR'), `${a.name}: unsupported rotation interpolation`);
      const times = readAccessor(glb, s.input), values = readAccessor(glb, s.output);
      assert(g.accessors[s.input].type === 'SCALAR' && g.accessors[s.output].type === 'VEC4' && times.length >= 2 && values.length === times.length * 4, `${a.name}: malformed rotation track`);
      for (let i = 0; i < times.length; i++) {
        assert(Number.isFinite(times[i]) && times[i] >= 0 && (i === 0 || times[i] > times[i - 1]), `${a.name}: invalid keyframe times`);
        const qlen = Math.hypot(...values.slice(i * 4, i * 4 + 4)); assert(Math.abs(qlen - 1) < 0.005, `${a.name}: invalid quaternion at sample ${i}`);
        if (s.interpolation === 'STEP') assert(close([...values.slice(i * 4, i * 4 + 4)], [...values.slice(0, 4)], 0.0002), `${a.name}: a moving bone uses STEP interpolation`);
      }
      duration = Math.max(duration, times[times.length - 1] - times[0]);
    }
    assert(Math.abs(duration - CONTRACT.clipFrames[a.name] / CONTRACT.fps) < 0.05, `${a.name}: clip duration changed (${duration})`);
  }
  checkClipBytes(glb);
}

function safePath(root, path) {
  assert(typeof path === 'string' && path.length && !isAbsolute(path) && !/^[a-z]+:|[\\\0?#]/i.test(path), `unsafe asset path: ${path}`);
  const full = resolve(root, path), allowed = resolve(root, '..'), rel = relative(allowed, full);
  assert(rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel), `asset path escapes assets/: ${path}`);
  return full;
}

function referencedFiles(modelsRoot, manifest, glbs) {
  const p = manifest.people, files = new Set([p.dir + p.glb, p.dir + p.lod, p.dir + p.meta]);
  assert(PEOPLE_MATERIALS.people_pbr?.vertexColors && PEOPLE_MATERIALS.people_pbr.uv === 'unit', 'people_pbr must be registered as a vertex-coloured unit-UV library material');
  const textureFiles = new Set();
  for (const glb of glbs) {
    assert((glb.g.materials ?? []).length === 1 && glb.g.materials[0].name === 'people_pbr', `${glb.label}: requires shared named people_pbr material`);
    for (const img of glb.g.images ?? []) {
      assert(img.bufferView == null && typeof img.uri === 'string' && !img.uri.startsWith('data:'), `${glb.label}: embedded image; use the shared external atlas`);
      const path = safePath(dirname(glb.label), img.uri), rel = posix(relative(modelsRoot, path)); files.add(rel); textureFiles.add(rel);
    }
  }
  // One UV atlas may have an albedo image, a tangent-space normal image and packed ORM.
  // These are shared by every resident; independent per-person atlases are forbidden.
  assert(textureFiles.size <= 3, 'people GLBs must share one atlas layout with at most three external PBR maps');
  return [...files].sort();
}

function checkLibraryTextureBindings(glb) {
  const texturesRoot = resolve(DEFAULT_ROOT, '../textures');
  const entry = JSON.parse(readFileSync(resolve(texturesRoot, 'manifest.json'), 'utf8')).textures?.[PEOPLE_MATERIALS.people_pbr.tex];
  assert(entry, 'texture manifest has no people_pbr library atlas binding');
  const g = glb.g, m = g.materials[0];
  for (const [field, slot] of [['map', m.pbrMetallicRoughness?.baseColorTexture], ['normal', m.normalTexture], ['rough', m.pbrMetallicRoughness?.metallicRoughnessTexture]]) {
    if (!slot) continue;
    const uri = g.images[g.textures[slot.index].source].uri;
    assert(typeof entry[field] === 'string' && resolve(texturesRoot, entry[field]) === resolve(dirname(glb.label), uri), `people_pbr ${field}: library and glTF do not share the same atlas image`);
  }
}

export function checkInventory(modelsRoot, entries, required) {
  assert(Array.isArray(entries), 'manifest.people.json: files must be an array');
  const paths = entries.map((e) => e.path);
  assert(new Set(paths).size === paths.length, 'manifest.people.json: duplicate inventory paths');
  for (const path of required) assert(paths.includes(path), `manifest.people.json: missing inventory entry ${path}`);
  for (const e of entries) {
    const path = safePath(modelsRoot, e.path); assert(existsSync(path) && statSync(path).isFile(), `manifest.people.json: missing file ${e.path}`);
    const data = readFileSync(path);
    assert(e.bytes === data.length && e.sha256 === hash(data), `manifest.people.json: stale bytes/SHA-256 for ${e.path}`);
  }
}

/** No mutations: used by regeneration after both LODs and metadata have been written. */
export function makeInventory(modelsRoot = DEFAULT_ROOT) {
  const manifest = JSON.parse(readFileSync(resolve(modelsRoot, 'manifest.people.json'), 'utf8')), p = manifest.people;
  const glbs = [p.glb, p.lod].map((name) => readGlb(safePath(modelsRoot, p.dir + name)));
  return referencedFiles(modelsRoot, manifest, glbs).map((path) => {
    const data = readFileSync(safePath(modelsRoot, path)); return { path, bytes: data.length, sha256: hash(data) };
  });
}

/** Explicit regeneration step: preserve the people block and all unrelated manifest keys. */
export function writeManifest(modelsRoot = DEFAULT_ROOT) {
  const path = resolve(modelsRoot, 'manifest.people.json'), manifest = JSON.parse(readFileSync(path, 'utf8'));
  manifest.files = makeInventory(modelsRoot);
  const temporary = path + `.people-${process.pid}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(manifest, null, 2) + '\n');
    renameSync(temporary, path);
  } finally { rmSync(temporary, { force: true }); }
  return manifest;
}

/** Complete is a release gate; ordinary validation tolerates absent optional GLBs for fallback checkouts. */
export async function validatePeople({ modelsRoot = DEFAULT_ROOT, complete = false } = {}) {
  modelsRoot = resolve(modelsRoot);
  const errors = [], warnings = [], report = { ok: false, complete, people: [], clips: 0, bytes: 0, files: [], errors, warnings };
  const attempt = async (fn) => { try { return await fn(); } catch (e) { errors.push(e.message); return null; } };
  const manifest = await attempt(() => JSON.parse(readFileSync(resolve(modelsRoot, 'manifest.people.json'), 'utf8')));
  if (!manifest) return report;
  await attempt(() => { for (const [key, value] of Object.entries(CONTRACT.manifestPeople)) assert(manifest.people?.[key] === value, `manifest.people.${key} must remain ${JSON.stringify(value)}`); });
  if (errors.length) return report;
  const p = manifest.people, metaPath = safePath(modelsRoot, p.dir + p.meta);
  const meta = await attempt(() => JSON.parse(readFileSync(metaPath, 'utf8'))); if (!meta) return report;
  const ids = await attempt(() => checkMeta(meta, complete)); if (!ids) return report;
  const glbs = [];
  for (const [level, name] of [['near', p.glb], ['far', p.lod]]) {
    const path = safePath(modelsRoot, p.dir + name);
    if (!existsSync(path)) { (complete ? errors : warnings).push(`${level}: missing optional GLB ${posix(relative(modelsRoot, path))}${complete ? ' (--complete requires it)' : '; missing-asset boot behavior must be checked in headless Chrome'}`); glbs.push(null); continue; }
    glbs.push(await attempt(() => readGlb(path)));
  }
  const [near, far] = glbs;
  if (near) await attempt(() => { checkAnimations(near); report.clips = near.g.animations.length; });
  if (far) await attempt(() => assert(!far.g.animations?.length && !far.g.images?.length, 'far GLB must reuse near materials/clips without duplicating textures or animations'));
  for (const [level, glb] of [['near', near], ['far', far]]) if (glb) await attempt(() => {
    const actual = (glb.g.nodes ?? []).map((n) => n.name).filter((name) => name?.startsWith('person_') && !name.endsWith('_mesh')).map((name) => name.slice(7));
    assert(sameSet(actual, ids), `${level}: GLB character IDs disagree with metadata`);
    assert(glb.bytes <= LIMITS.fileBytes, `${level}: GLB exceeds 8 MiB per-file budget`);
  });
  for (const id of ids) {
    const m = meta.people.find((x) => x.id === id), ref = CONTRACT.people.find((x) => x.id === id), row = { id };
    const rigs = {};
    for (const [level, glb] of [['near', near], ['far', far]]) if (glb) await attempt(async () => {
      const rig = inspectCharacter(glb, id, ref); rigs[level] = rig;
      const decoded = await decodePrimitive(glb, rig.primitive);
      row[level] = checkVertexData(decoded, m, LIMITS[level], `${level}/${id}`);
      if (level === 'near') assert(m.tris === row.near.tris, `${id}: metadata tris ${m.tris} disagrees with actual ${row.near.tris}`);
    });
    if (rigs.near && rigs.far) await attempt(() => compareSkeletons(rigs.near, rigs.far, id));
    report.people.push(row);
  }
  if (near && far) {
    const required = await attempt(() => referencedFiles(modelsRoot, manifest, glbs));
    if (required) {
      if (complete && modelsRoot === DEFAULT_ROOT) await attempt(() => checkLibraryTextureBindings(near));
      for (const path of required) await attempt(() => {
        const full = safePath(modelsRoot, path); assert(existsSync(full), `missing external asset ${path}`);
        assert(statSync(full).size <= LIMITS.fileBytes, `${path}: file exceeds 8 MiB`);
        report.files.push({ path, bytes: statSync(full).size, sha256: hash(readFileSync(full)) });
      });
      if (complete || manifest.files?.length) await attempt(() => checkInventory(modelsRoot, manifest.files, required));
      else warnings.push('manifest.people.json has no file inventory; --complete will reject it');
    }
  }
  report.bytes = report.files.reduce((sum, f) => sum + f.bytes, 0);
  if (report.bytes > LIMITS.bytes) errors.push(`people payload ${(report.bytes / 1048576).toFixed(2)} MiB exceeds 14 MiB`);
  report.ok = !errors.length;
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), rootAt = args.indexOf('--root'), root = rootAt < 0 ? DEFAULT_ROOT : resolve(args[rootAt + 1] ?? '');
  try {
    if (args.includes('--write-manifest')) {
      assert(!args.includes('--complete') && !args.includes('--inventory'), '--write-manifest is a separate explicit action; run --complete afterward');
      const manifest = writeManifest(root);
      console.log(JSON.stringify({ manifest: resolve(root, 'manifest.people.json'), files: manifest.files.length, bytes: manifest.files.reduce((n, f) => n + f.bytes, 0) }, null, 2));
    } else if (args.includes('--inventory')) console.log(JSON.stringify(makeInventory(root), null, 2));
    else {
      const report = await validatePeople({ modelsRoot: root, complete: args.includes('--complete') });
      if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
      else {
        for (const p of report.people) console.log(`${p.id.padEnd(17)} near ${String(p.near?.tris ?? '-').padStart(5)} / ${LIMITS.near}  far ${String(p.far?.tris ?? '-').padStart(4)} / ${LIMITS.far}`);
        for (const warning of report.warnings) console.log('WARN ' + warning);
        for (const error of report.errors) console.error('FAIL ' + error);
        console.log(`${report.ok ? 'PEOPLE OK' : 'PEOPLE FAILED'}: ${report.people.length} IDs, ${report.clips} clips, ${(report.bytes / 1048576).toFixed(2)} MiB${report.complete ? ' (complete)' : ''}`);
      }
      if (!report.ok) process.exitCode = 1;
    }
  } catch (e) { console.error('FAIL ' + e.message); process.exitCode = 1; }
}
