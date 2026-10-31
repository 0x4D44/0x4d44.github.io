// Inspect assets: validate the shipped bytes, not the generator's claims.
//   node la-ladera/tools/blender/inspect_validate.mjs [--complete] [--json] [--root la-ladera]
// --complete also requires verified bindings to the existing drawer/content data.
import '../../tests/register.mjs';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const { ALL_DEFS } = await import('../../js/core/matlib.js');

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const LIMITS = Object.freeze({ bytes: 2_000_000, triangles: 3000, lodTriangles: 700, centre: 0.001 });
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const TYPES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const COMPONENTS = {
  5120: [1, 'readInt8'], 5121: [1, 'readUInt8'], 5122: [2, 'readInt16LE'],
  5123: [2, 'readUInt16LE'], 5125: [4, 'readUInt32LE'], 5126: [4, 'readFloatLE'],
};
const fail = (message) => { throw new Error(message); };
const check = (ok, message) => { if (!ok) fail(message); };
const uint = (n) => Number.isSafeInteger(n) && n >= 0;
const vector = (v, n) => Array.isArray(v) && v.length === n && v.every(Number.isFinite);
const near = (a, b, epsilon = 0.00002) => Math.abs(a - b) <= epsilon;
const mulM = (a, b) => Array.from({ length: 16 }, (_, n) => {
  const row = n % 4, col = Math.floor(n / 4);
  return a[row] * b[col * 4] + a[row + 4] * b[col * 4 + 1] + a[row + 8] * b[col * 4 + 2] + a[row + 12] * b[col * 4 + 3];
});
const xform = (m, p) => [0, 1, 2].map((k) => m[k] * p[0] + m[k + 4] * p[1] + m[k + 8] * p[2] + m[k + 12]);

function nodeMatrix(n) {
  let m;
  if (n.matrix != null) {
    check(n.translation == null && n.rotation == null && n.scale == null, 'node mixes matrix and TRS transforms');
    check(vector(n.matrix, 16), 'node matrix is not finite');
    m = n.matrix;
  } else {
    const t = n.translation ?? [0, 0, 0], q = n.rotation ?? [0, 0, 0, 1], s = n.scale ?? [1, 1, 1];
    check(vector(t, 3) && vector(q, 4) && vector(s, 3), 'node TRS is not finite');
    check(near(Math.hypot(...q), 1, 0.0001), 'node quaternion is not normalized');
    const [x, y, z, w] = q, [sx, sy, sz] = s;
    m = [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
      2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
      2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, ...t, 1];
  }
  check([3, 7, 11].every((i) => near(m[i], 0, 1e-8)) && near(m[15], 1, 1e-8), 'node matrix is not affine');
  const determinant = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
  check(determinant > 1e-12, 'node transform is singular or reflected');
  return m;
}

/** Strict GLB reader. Invalid/truncated files fail before any geometry is examined. */
export function parseGlb(buffer) {
  const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  check(b.length >= 20, 'truncated GLB header');
  check(b.readUInt32LE(0) === 0x46546c67, 'not a binary glTF file');
  check(b.readUInt32LE(4) === 2, 'GLB must be version 2');
  check(b.readUInt32LE(8) === b.length, 'GLB declared length does not match file');
  let off = 12, json, bin;
  while (off < b.length) {
    check(off + 8 <= b.length, 'truncated GLB chunk header');
    const length = b.readUInt32LE(off), type = b.readUInt32LE(off + 4);
    check(length % 4 === 0 && off + 8 + length <= b.length, 'invalid GLB chunk length');
    const chunk = b.subarray(off + 8, off + 8 + length);
    if (type === 0x4e4f534a) {
      check(off === 12 && json == null, 'GLB must begin with exactly one JSON chunk');
      json = JSON.parse(chunk.toString('utf8'));
    } else if (type === 0x004e4942) {
      check(json != null && bin == null, 'GLB must have exactly one BIN chunk after JSON');
      bin = chunk;
    } else fail('unsupported GLB chunk');
    off += 8 + length;
  }
  check(json && bin, 'GLB needs JSON and BIN chunks');
  check(json.asset?.version === '2.0', 'glTF asset version must be 2.0');
  check(json.buffers?.length === 1 && !json.buffers[0].uri, 'GLB may not reference an external or embedded URI buffer');
  const length = json.buffers[0].byteLength;
  check(uint(length) && length > 0 && length <= bin.length && bin.length - length <= 3, 'BIN length does not match glTF buffer');
  for (const v of json.bufferViews ?? []) {
    check(v.buffer === 0 && uint(v.byteOffset ?? 0) && uint(v.byteLength) && v.byteLength > 0, 'invalid bufferView');
    check((v.byteOffset ?? 0) + v.byteLength <= length, 'bufferView exceeds BIN buffer');
  }
  return { json, bin, bytes: b.length };
}

function accessorReader(g, bin) {
  const cache = new Map();
  return (index) => {
    if (cache.has(index)) return cache.get(index);
    check(uint(index) && index < (g.accessors?.length ?? 0), `invalid accessor index ${index}`);
    const a = g.accessors[index], component = COMPONENTS[a.componentType], width = TYPES[a.type];
    check(component && width, `accessor ${index}: unsupported component/type`);
    check(!a.sparse, `accessor ${index}: sparse geometry is not supported`);
    check(uint(a.count) && a.count > 0, `accessor ${index}: invalid count`);
    check(uint(a.bufferView) && a.bufferView < (g.bufferViews?.length ?? 0), `accessor ${index}: invalid bufferView`);
    const v = g.bufferViews[a.bufferView], [bytes, method] = component, packed = bytes * width;
    const stride = v.byteStride ?? packed, local = a.byteOffset ?? 0;
    check(uint(local) && local % bytes === 0, `accessor ${index}: misaligned offset`);
    check(uint(stride) && stride >= packed && stride <= 252 && stride % bytes === 0, `accessor ${index}: invalid stride`);
    check(local + (a.count - 1) * stride + packed <= v.byteLength, `accessor ${index}: data exceeds bufferView`);
    const start = (v.byteOffset ?? 0) + local;
    check(start % bytes === 0, `accessor ${index}: misaligned data`);
    check(!a.normalized || [5120, 5121, 5122, 5123].includes(a.componentType), `accessor ${index}: invalid normalization`);
    const rows = [];
    for (let i = 0; i < a.count; i++) {
      const row = [];
      for (let k = 0; k < width; k++) {
        let value = bin[method](start + i * stride + k * bytes);
        check(Number.isFinite(value), `accessor ${index}: non-finite geometry`);
        if (a.normalized) {
          const den = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[a.componentType];
          value = Math.max(-1, value / den);
        }
        row.push(value);
      }
      rows.push(row);
    }
    const result = { ...a, rows, width };
    cache.set(index, result);
    return result;
  };
}

function textureReference(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, v]) => /Texture$/.test(key) || textureReference(v));
}

/** Measure every vertex/index of each scene-root asset, including child transforms. */
export function inspectGlb(buffer, { materialDefs = ALL_DEFS } = {}) {
  const { json: g, bin, bytes } = parseGlb(buffer);
  check(!(g.images?.length || g.textures?.length || g.samplers?.length), 'GLB must contain no images, textures or samplers');
  check(!textureReference(g.materials), 'GLB materials may not contain texture references');
  check(!(g.skins?.length || g.animations?.length), 'inspect GLB must be static, with no skins or animations');
  check(g.scenes?.length === 1 && (g.scene ?? 0) === 0, 'inspect GLB must contain one default scene');
  check(Array.isArray(g.nodes) && g.nodes.length > 0 && g.scenes[0].nodes?.length > 0, 'GLB has no asset nodes');
  const materials = g.materials ?? [];
  check(materials.length > 0, 'GLB has no materials');
  for (const m of materials) check(typeof m.name === 'string' && Object.hasOwn(materialDefs, m.name), `unknown library material '${m.name}'`);
  const names = new Set();
  for (const node of g.nodes) {
    check(typeof node.name === 'string' && node.name.length > 0 && !names.has(node.name), `missing or duplicate node name '${node.name}'`);
    names.add(node.name);
  }
  const read = accessorReader(g, bin), visited = new Set(), usedMeshes = new Set(), assets = new Map();
  const visit = (index, parent, asset) => {
    check(uint(index) && index < g.nodes.length, `invalid node index ${index}`);
    check(!visited.has(index), `node '${g.nodes[index].name}' is shared or cyclic`);
    visited.add(index);
    const node = g.nodes[index], matrix = mulM(parent, nodeMatrix(node));
    check(node.skin == null && !node.weights, `node '${node.name}' has unsupported deformation`);
    if (node.mesh != null) {
      check(uint(node.mesh) && node.mesh < (g.meshes?.length ?? 0), `node '${node.name}' has an invalid mesh`);
      usedMeshes.add(node.mesh);
      const mesh = g.meshes[node.mesh];
      check(mesh.primitives?.length === 1, `mesh '${node.name}' must have one primitive/material; Assets.instance uses one material per child`);
      const p = mesh.primitives[0];
      check((p.mode ?? 4) === 4 && !p.targets && !p.extensions, `mesh '${node.name}' must contain ordinary static triangles`);
      check(uint(p.material) && p.material < materials.length, `mesh '${node.name}' has no valid material`);
      const material = materials[p.material].name;
      const usesAtlas = material === 'inspect_paper_atlas' || materialDefs[material]?.tex === 'inspect_paper_atlas';
      check(materialDefs[material].vertexColors === false || Object.hasOwn(p.attributes ?? {}, 'COLOR_0'),
        `mesh '${node.name}': material '${material}' enables vertex colors, so COLOR_0 (white for untinted geometry) is required`);
      const pos = read(p.attributes?.POSITION), nor = read(p.attributes?.NORMAL);
      const uv = p.attributes?.TEXCOORD_0 == null ? null : read(p.attributes.TEXCOORD_0);
      check(pos.type === 'VEC3' && pos.componentType === 5126, `mesh '${node.name}': positions must be float VEC3`);
      check(nor.type === 'VEC3' && nor.count === pos.count, `mesh '${node.name}': invalid normals`);
      check(!uv || (uv.type === 'VEC2' && uv.count === pos.count), `mesh '${node.name}': invalid UVs`);
      check(!usesAtlas || uv, `mesh '${node.name}': paper atlas requires UVs`);
      for (const n of nor.rows) check(near(Math.hypot(...n), 1, 0.015), `mesh '${node.name}': normals must have unit length`);
      for (const [semantic, ai] of Object.entries(p.attributes ?? {})) {
        const attribute = read(ai);
        check(attribute.count === pos.count, `mesh '${node.name}': ${semantic} count differs from positions`);
        if (semantic === 'COLOR_0') check(['VEC3', 'VEC4'].includes(attribute.type) && attribute.rows.every((r) => r.every((n) => n >= 0 && n <= 1)), `mesh '${node.name}': invalid vertex colors`);
      }
      if (usesAtlas) check(uv.rows.every((r) => r.every((n) => n >= -1e-6 && n <= 1 + 1e-6)), `mesh '${node.name}': atlas UVs leave [0,1]`);
      check(vector(pos.min, 3) && vector(pos.max, 3), `mesh '${node.name}': POSITION needs finite min/max`);
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const row of pos.rows) {
        const point = xform(matrix, row);
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k], row[k]); hi[k] = Math.max(hi[k], row[k]);
          asset.bounds.min[k] = Math.min(asset.bounds.min[k], point[k]); asset.bounds.max[k] = Math.max(asset.bounds.max[k], point[k]);
        }
      }
      check(lo.every((v, k) => near(v, pos.min[k], 1e-6)) && hi.every((v, k) => near(v, pos.max[k], 1e-6)), `mesh '${node.name}': accessor bounds do not match binary positions`);
      let indices;
      if (p.indices != null) {
        const a = read(p.indices);
        check(a.type === 'SCALAR' && !a.normalized && [5121, 5123, 5125].includes(a.componentType), `mesh '${node.name}': invalid index component type`);
        indices = a.rows.map((r) => r[0]);
      } else indices = Array.from({ length: pos.count }, (_, i) => i);
      check(indices.length > 0 && indices.length % 3 === 0, `mesh '${node.name}': index count is not a positive triangle count`);
      check(indices.every((i) => uint(i) && i < pos.count), `mesh '${node.name}': index points outside vertex data`);
      for (let at = 0; at < indices.length; at += 3) {
        const ids = indices.slice(at, at + 3), [a, b, c] = ids.map((i) => pos.rows[i]);
        const ab = b.map((v, k) => v - a[k]), ac = c.map((v, k) => v - a[k]);
        const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
        check(Math.hypot(...cross) > 1e-12, `mesh '${node.name}': degenerate triangle`);
        const normal = [0, 1, 2].map((k) => ids.reduce((sum, i) => sum + nor.rows[i][k], 0));
        check(cross.reduce((sum, v, k) => sum + v * normal[k], 0) >= -1e-15, `mesh '${node.name}': winding disagrees with normals`);
      }
      asset.triangles += indices.length / 3;
      asset.drawCalls++;
      asset.materials.add(material);
    }
    check(node.children == null || Array.isArray(node.children), `node '${node.name}': children must be an array`);
    for (const child of node.children ?? []) visit(child, matrix, asset);
  };
  for (const index of g.scenes[0].nodes) {
    check(uint(index) && index < g.nodes.length, 'invalid scene root');
    const root = g.nodes[index];
    check(nodeMatrix(root).every((v, i) => near(v, I[i], 1e-6)), `asset '${root.name}': root transform must be identity (inspection resets it)`);
    const asset = { node: root.name, triangles: 0, drawCalls: 0, bounds: { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }, materials: new Set() };
    visit(index, I, asset);
    check(asset.triangles > 0, `asset '${root.name}' has no triangles`);
    asset.size = asset.bounds.max.map((v, k) => v - asset.bounds.min[k]);
    check(asset.size.every((v) => Number.isFinite(v) && v >= 0) && Math.max(...asset.size) >= 0.002 && Math.max(...asset.size) <= 1, `asset '${root.name}': scale is not handheld metres`);
    check(asset.bounds.min.every((v, k) => Math.abs((v + asset.bounds.max[k]) / 2) <= LIMITS.centre), `asset '${root.name}': bounds are not centered within 1 mm of the inspect pivot`);
    asset.materials = [...asset.materials].sort();
    check(!assets.has(root.name), `duplicate asset root '${root.name}'`);
    assets.set(root.name, asset);
  }
  check(visited.size === g.nodes.length, 'GLB contains orphan nodes');
  check(usedMeshes.size === (g.meshes?.length ?? 0), 'GLB contains orphan meshes');
  return { bytes, assets, materials: materials.map((m) => m.name) };
}

function localPath(root, path) {
  check(typeof path === 'string' && path.length > 0 && !isAbsolute(path) && !path.includes('\\'), `invalid relative path '${path}'`);
  const full = resolve(root, path), rel = relative(root, full);
  check(rel && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel), `path escapes library: '${path}'`);
  return full;
}
function listFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? listFiles(resolve(dir, d.name)) : [resolve(dir, d.name)]);
}
function equalBounds(meta, actual) {
  return vector(meta?.min, 3) && vector(meta?.max, 3) && ['min', 'max'].every((s) => meta[s].every((v, k) => near(v, actual[s][k])));
}
function datasetHasId(data, id) {
  if (data instanceof Map) return data.has(id);
  if (Array.isArray(data)) return data.some((record) => record && typeof record === 'object' && record.id === id);
  return !!data && typeof data === 'object' && Object.hasOwn(data, id);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, i) => {
  let n = i; for (let k = 0; k < 8; k++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0;
});
function pngCrc(data) {
  let n = 0xffffffff; for (const byte of data) n = CRC_TABLE[(n ^ byte) & 255] ^ (n >>> 8); return (n ^ 0xffffffff) >>> 0;
}
function inspectPng(data) {
  check(data.length >= 33 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'paper atlas is not a PNG');
  let off = 8, header, ended = false; const parts = [];
  while (off < data.length) {
    check(off + 12 <= data.length, 'truncated PNG chunk');
    const length = data.readUInt32BE(off), type = data.toString('ascii', off + 4, off + 8);
    check(off + length + 12 <= data.length, 'PNG chunk exceeds file');
    check(pngCrc(data.subarray(off + 4, off + 8 + length)) === data.readUInt32BE(off + 8 + length), `PNG ${type} checksum mismatch`);
    const body = data.subarray(off + 8, off + 8 + length);
    if (type === 'IHDR') {
      check(off === 8 && length === 13, 'invalid PNG header');
      header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), bits: body[8], type: body[9] };
      check(body[10] === 0 && body[11] === 0 && body[12] === 0, 'atlas PNG must use standard compression/filtering without interlacing');
    } else if (type === 'IDAT') parts.push(body);
    else if (type === 'IEND') { check(length === 0 && off + 12 === data.length, 'invalid PNG end/trailing data'); ended = true; }
    off += length + 12;
  }
  check(header && ended && parts.length > 0, 'PNG needs IHDR, IDAT and IEND');
  const { width, height, bits, type } = header;
  check(width > 0 && height > 0 && width <= 4096 && height <= 4096, 'paper atlas dimensions exceed 4096');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  check(channels && [1, 2, 4, 8, 16].includes(bits) && (type === 0 || type === 3 || bits >= 8) && !(type === 3 && bits === 16), 'invalid PNG color depth');
  const row = Math.ceil(width * channels * bits / 8) + 1, expected = height * row;
  const pixels = inflateSync(Buffer.concat(parts), { maxOutputLength: expected + 1 });
  check(pixels.length === expected, 'PNG decompressed byte count is incorrect');
  for (let y = 0; y < height; y++) check(pixels[y * row] <= 4, 'PNG has an invalid row filter');
  return header;
}

/** Validate runtime files, inventory, LODs and (optionally) existing gameplay IDs. */
export async function validateLibrary({ root = ROOT, complete = false, materialDefs = ALL_DEFS,
  manifestPath = 'assets/models/manifest.inspect.json', bindingsPath = 'js/interiors/inspect-bindings.json' } = {}) {
  root = resolve(root);
  const report = { ok: false, complete, integrationStatus: 'unknown', errors: [], warnings: [], assets: [], totalBytes: 0, budgetBytes: LIMITS.bytes, files: [], verifiedBindings: 0 };
  const guard = (fn, prefix = '') => { try { return fn(); } catch (e) { report.errors.push(prefix + e.message); return null; } };
  const counted = new Set();
  const count = (file) => {
    if (!counted.has(file)) { counted.add(file); const bytes = statSync(file).size; report.totalBytes += bytes; report.files.push({ path: relative(root, file).split(sep).join('/'), bytes }); }
  };
  const jsonFile = (path) => { const file = localPath(root, path); const data = JSON.parse(readFileSync(file, 'utf8')); count(file); return data; };
  const manifest = guard(() => jsonFile(manifestPath), 'manifest: '), bindings = guard(() => jsonFile(bindingsPath), 'bindings: ');
  if (!manifest || !bindings) return report;
  report.integrationStatus = manifest.integrationStatus;
  guard(() => {
    check(manifest.version === 1 && bindings.version === 1, 'manifest and bindings must use version 1');
    check(/^[0-9a-f]{40}$/.test(manifest.sourceRevision ?? '') && manifest.sourceRevision === bindings.sourceRevision, 'manifest/bindings need the same pinned sourceRevision');
    check(typeof manifest.integrationStatus === 'string' && bindings.status === manifest.integrationStatus, 'manifest/bindings integration statuses differ');
    check(Number.isFinite(manifest.budgetBytes) && manifest.budgetBytes > 0 && manifest.budgetBytes <= LIMITS.bytes, 'runtime budget may not exceed 2,000,000 bytes');
    check(Number.isInteger(manifest.maxTriangles) && manifest.maxTriangles > 0 && manifest.maxTriangles <= LIMITS.triangles, 'triangle limit may not exceed 3000');
    check(Array.isArray(manifest.files) && manifest.files.length > 0, 'manifest has no model files');
    check(Array.isArray(bindings.assets) && bindings.assets.length > 0, 'bindings inventory has no assets');
    check(Array.isArray(bindings.requiredSources), 'bindings.requiredSources must be an array');
    check(bindings.bindings && typeof bindings.bindings === 'object' && !Array.isArray(bindings.bindings), 'bindings.bindings must be an object');
  });
  report.budgetBytes = Math.min(LIMITS.bytes, manifest.budgetBytes || LIMITS.bytes);
  const declared = new Map(), measured = new Map(), glbs = new Set();
  for (const file of Array.isArray(manifest.files) ? manifest.files : []) guard(() => {
    check(typeof file.glb === 'string' && /^inspect\/[a-z0-9_]+\.glb$/.test(file.glb), `inspect GLB path is invalid: ${file.glb}`);
    const path = localPath(resolve(root, 'assets/models'), file.glb);
    check(!glbs.has(path), `duplicate GLB '${file.glb}'`); glbs.add(path);
    const data = readFileSync(path); count(path);
    if (file.bytes != null) check(file.bytes === data.length, `${file.glb}: declared byte count differs from file`);
    if (file.sha256 != null) check(file.sha256 === createHash('sha256').update(data).digest('hex'), `${file.glb}: SHA-256 mismatch`);
    const result = inspectGlb(data, { materialDefs });
    check(file.assets && typeof file.assets === 'object' && Object.keys(file.assets).length > 0, `${file.glb}: no declared assets`);
    const seenNodes = new Set();
    for (const [key, metadata] of Object.entries(file.assets)) {
      check(/^inspect_[a-z0-9_]+$/.test(key) && !declared.has(key), `invalid or duplicate asset key '${key}'`);
      check(metadata && metadata.node === key, `${key}: root node must equal asset key`);
      check(!seenNodes.has(metadata.node), `${key}: root declared twice`); seenNodes.add(metadata.node);
      const actual = result.assets.get(metadata.node);
      check(actual, `${key}: root node is absent from ${file.glb}`);
      declared.set(key, metadata); measured.set(key, actual);
      check(actual.triangles <= Math.min(LIMITS.triangles, manifest.maxTriangles || LIMITS.triangles), `${key}: ${actual.triangles} triangles exceeds limit`);
      check(metadata.triangles === actual.triangles, `${key}: manifest triangle count differs from binary geometry`);
      check(metadata.drawCalls === actual.drawCalls, `${key}: manifest draw-call count differs from binary geometry`);
      check(equalBounds(metadata.bounds, actual.bounds), `${key}: manifest bounds differ from binary geometry`);
      check(vector(metadata.size, 3) && metadata.size.every((v, i) => near(v, actual.size[i])), `${key}: manifest size differs from binary geometry`);
      report.assets.push({ key, glb: file.glb, ...actual, lodOf: metadata.lodOf ?? null });
    }
    check(seenNodes.size === result.assets.size && [...result.assets.keys()].every((key) => seenNodes.has(key)), `${file.glb}: unlisted GLB root nodes`);
  }, 'model: ');
  for (const path of listFiles(resolve(root, 'assets/models/inspect'))) guard(() => {
    check(glbs.has(path), `unlisted runtime file '${relative(root, path)}'`);
  });
  const high = new Set([...declared].filter(([, m]) => !m.lodOf).map(([key]) => key));
  const inventory = new Set();
  for (const entry of Array.isArray(bindings.assets) ? bindings.assets : []) guard(() => {
    check(entry && high.has(entry.key), `inventory asset '${entry?.key}' has no high-detail model`);
    check(!inventory.has(entry.key), `duplicate inventory asset '${entry.key}'`); inventory.add(entry.key);
    check(typeof entry.label === 'string' && entry.label.trim() && typeof entry.category === 'string' && entry.category.trim(), `${entry.key}: inventory label/category missing`);
  });
  for (const key of high) guard(() => {
    check(inventory.has(key), `${key}: high-detail asset is absent from inventory`);
    const meta = declared.get(key), lod = declared.get(meta.lod), a = measured.get(key), b = measured.get(meta.lod);
    check(typeof meta.label === 'string' && meta.label && typeof meta.category === 'string' && meta.category, `${key}: label/category missing`);
    check(meta.lod === `${key}_lod` && lod?.lodOf === key && b, `${key}: missing matching LOD`);
    check(b.triangles < a.triangles && b.triangles <= LIMITS.lodTriangles, `${key}: LOD must reduce geometry and use at most ${LIMITS.lodTriangles} triangles`);
    check(a.size.every((v, i) => Math.abs(v - b.size[i]) <= Math.max(0.003, v * 0.2)), `${key}: LOD changes the physical size by more than 20% / 3 mm`);
  });
  for (const [key, meta] of declared) if (meta.lodOf) guard(() => {
    check(high.has(meta.lodOf) && declared.get(meta.lodOf).lod === key, `${key}: orphan or inconsistent LOD`);
  });
  guard(() => {
    const atlas = manifest.atlas, file = localPath(root, atlas?.path);
    check(atlas.path.startsWith('assets/textures/') && atlas.path.endsWith('.png'), 'paper atlas must be one external PNG under assets/textures');
    const data = readFileSync(file); count(file);
    const { width, height } = inspectPng(data);
    const digest = createHash('sha256').update(data).digest('hex');
    if (atlas.sha256 != null) check(atlas.sha256 === digest, 'atlas SHA-256 mismatch');
    if (atlas.metadata != null) {
      const metadata = jsonFile(atlas.metadata);
      check(metadata.width === width && metadata.height === height, 'atlas metadata dimensions differ from PNG');
      if (metadata.sha256 != null) check(metadata.sha256 === digest, 'atlas metadata SHA-256 mismatch');
    }
    if (atlas.width != null) check(atlas.width === width, 'atlas width differs from PNG');
    if (atlas.height != null) check(atlas.height === height, 'atlas height differs from PNG');
    const material = atlas.material ?? 'inspect_paper_atlas', def = materialDefs[material];
    check(def?.uv === 'unit', `atlas material '${material}' is not registered with unit UVs`);
    const textures = JSON.parse(readFileSync(localPath(root, 'assets/textures/manifest.json'), 'utf8'));
    const name = typeof def.tex === 'string' ? def.tex : material;
    check(textures.textures?.[name]?.map === atlas.path.slice('assets/textures/'.length), 'paper atlas is not bound by the texture manifest');
  }, 'atlas: ');
  if (report.totalBytes >= report.budgetBytes) report.errors.push(`runtime library ${report.totalBytes} bytes is not below ${report.budgetBytes} bytes`);

  const integrationProblems = [], sourcePaths = new Set(Array.isArray(bindings.requiredSources) ? bindings.requiredSources : []);
  for (const required of ['dev/FEATURE-DRAWERS.md', 'js/interiors/finds.js', 'js/interiors/contents.js']) {
    if (!sourcePaths.has(required)) integrationProblems.push(`required source is not declared: ${required}`);
    sourcePaths.add(required);
  }
  for (const source of sourcePaths) {
    try { check(existsSync(localPath(root, source)), `missing source: ${source}`); }
    catch (e) { integrationProblems.push(e.message); }
  }
  const bound = new Set(), pairs = Object.entries(bindings.bindings ?? {});
  if (!pairs.length) integrationProblems.push('no verified existing find/content ID bindings; asset library is not integrated');
  for (const [id, binding] of pairs) {
    try {
      check(id && binding && typeof binding === 'object' && high.has(binding.asset), `binding '${id}' has no valid inspect asset`);
      check(/^js\/interiors\/(finds|contents|papers[^/]*)\.js$/.test(binding.source ?? ''), `binding '${id}' must name an existing find/content source`);
      check(typeof binding.export === 'string' && binding.export, `binding '${id}' must identify its source export`);
      const source = localPath(root, binding.source);
      check(existsSync(source), `binding '${id}' source is missing: ${binding.source}`);
      const module = await import(pathToFileURL(source).href);
      check(Object.hasOwn(module, binding.export) && datasetHasId(module[binding.export], id), `binding '${id}' is not present in source export ${binding.export}`);
      bound.add(binding.asset); report.verifiedBindings++;
    } catch (e) { integrationProblems.push(e.message); }
  }
  const unbound = [...high].filter((key) => !bound.has(key));
  report.unbound = unbound;
  if (unbound.length) integrationProblems.push(`${unbound.length} inspection assets lack verified existing ID bindings`);
  if (integrationProblems.length && !String(manifest.integrationStatus).startsWith('blocked-')) report.errors.push('integration status must disclose the missing/unverified drawer baseline');
  (complete ? report.errors : report.warnings).push(...integrationProblems);
  report.ok = report.errors.length === 0;
  return report;
}

async function main() {
  const args = process.argv.slice(2), opts = {}; let json = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--complete') opts.complete = true;
    else if (args[i] === '--json') json = true;
    else if (['--root', '--manifest', '--bindings'].includes(args[i])) {
      const key = { '--root': 'root', '--manifest': 'manifestPath', '--bindings': 'bindingsPath' }[args[i]];
      if (!args[i + 1] || args[i + 1].startsWith('--')) fail(`${args[i]} requires a path`);
      opts[key] = args[++i];
    } else fail(`unknown argument '${args[i]}'`);
  }
  const report = await validateLibrary(opts);
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`${report.ok ? 'PASS' : 'FAIL'} inspect assets: ${report.assets.filter((a) => !a.lodOf).length} objects, ${report.assets.filter((a) => a.lodOf).length} LODs; ${report.totalBytes.toLocaleString('en')} / ${report.budgetBytes.toLocaleString('en')} bytes`);
    console.log(`Integration: ${report.integrationStatus}; verified existing ID bindings: ${report.verifiedBindings}`);
    for (const a of report.assets) console.log(`  ${a.key.padEnd(33)} ${String(a.triangles).padStart(4)} tris  ${a.drawCalls} draws`);
    for (const warning of report.warnings) console.log(`WARNING: ${warning}`);
    for (const error of report.errors) console.error(`ERROR: ${error}`);
  }
  process.exitCode = report.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch((e) => { console.error(`ERROR: ${e.message}`); process.exitCode = 1; });
}
