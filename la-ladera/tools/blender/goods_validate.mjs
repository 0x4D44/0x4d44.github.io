// Validate the shipped goods, including the actual GLB vertex/index bytes. No Blender, browser or npm install required.
//   node la-ladera/tools/blender/goods_validate.mjs --complete [--root la-ladera] [--json report.json]
// Partial mode checks every present asset. --complete additionally requires every catalogue key, family, LOD,
// assortment reference and atlas binding to be shipped and registered. A manifest alone never counts as a model.
import '../../tests/nice.mjs';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
import { SHOP_TYPES } from '../../js/core/vocab.js';
import engine from '../../js/engine/matdefs.js';
import world from '../../js/world/matdefs.js';
import arch from '../../js/arch/matdefs.js';
import interiors from '../../js/interiors/matdefs.js';
import people from '../../js/people/matdefs.js';

export const GOODS_BUDGET = 2_000_000;
export const TRIANGLE_LIMIT = 400; // strictly under, not <=
export const REQUIRED_CATEGORIES = ['fruit', 'vegetable', 'bread', 'cheese', 'jar', 'tin', 'bottle', 'sack', 'meat', 'flower', 'newspaper', 'shoes', 'toy', 'hardware', 'pharmacy', 'cafe'];
export const REQUIRED_FIXTURES = ['shelf_tienda', 'shelf_ferre', 'shelf_pharma', 'shelf_papel', 'shelf_shoes', 'shelf_fabric', 'shelf_cafe', 'chips_rack', 'butcher_block', 'cafe_counter'];
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFS = { ...engine, ...world, ...arch, ...interiors, ...people };
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const FORMATS = {
  5120: [1, 'readInt8', 127], 5121: [1, 'readUInt8', 255],
  5122: [2, 'readInt16LE', 32767], 5123: [2, 'readUInt16LE', 65535],
  5125: [4, 'readUInt32LE', 4294967295], 5126: [4, 'readFloatLE', null],
};
const finite = (a, length) => Array.isArray(a) && a.length === length && a.every(Number.isFinite);
const positive = (a, length) => finite(a, length) && a.every((n) => n > 0);
const same = (a, b, eps = 1e-6) => finite(a, b?.length) && a.every((n, k) => Math.abs(n - b[k]) < eps);
const requireThat = (ok, message) => { if (!ok) throw new Error(message); };

/** Strict GLB container reader. Reject truncation, trailing bytes, external buffers and unsupported compressed data. */
export function readGoodsGlb(input) {
  const buf = Buffer.isBuffer(input) ? input : readFileSync(input);
  requireThat(buf.length >= 20, 'GLB is truncated');
  requireThat(buf.readUInt32LE(0) === 0x46546c67 && buf.readUInt32LE(4) === 2, 'expected glTF 2 GLB');
  requireThat(buf.readUInt32LE(8) === buf.length, 'GLB header length differs from actual bytes');
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    requireThat(off + 8 <= buf.length, 'truncated GLB chunk header');
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    requireThat(len % 4 === 0 && off + 8 + len <= buf.length, 'GLB chunk length/alignment is invalid');
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) {
      requireThat(off === 12 && json === null, 'GLB must have one first JSON chunk');
      json = JSON.parse(body.toString('utf8'));
    } else if (type === 0x004e4942) {
      requireThat(json !== null && bin === null, 'GLB must have one BIN chunk after JSON');
      bin = body;
    } else throw new Error('unexpected GLB chunk');
    off += 8 + len;
  }
  requireThat(json?.asset?.version === '2.0' && bin, 'GLB lacks glTF 2 JSON or BIN');
  requireThat(json.buffers?.length === 1 && !json.buffers[0].uri, 'goods must use one internal binary buffer');
  const n = json.buffers[0].byteLength;
  requireThat(Number.isInteger(n) && n > 0 && n <= bin.length && bin.length - n <= 3, 'GLB buffer byteLength is invalid');
  for (const ext of json.extensionsRequired ?? []) requireThat(!/compression|draco|meshopt|quantization/i.test(ext), `unsupported compressed geometry: ${ext}`);
  return { json, bin, bytes: buf.length };
}

/** Decode an accessor with buffer-view bounds, byteStride, normalization and finite-value checks. */
export function readGoodsAccessor(glb, index) {
  const { json: g, bin } = glb, a = g.accessors?.[index];
  requireThat(a && !a.sparse, `accessor ${index}: missing or sparse`);
  const fmt = FORMATS[a.componentType], components = COMPONENTS[a.type];
  requireThat(fmt && components, `accessor ${index}: unsupported format`);
  const view = g.bufferViews?.[a.bufferView];
  requireThat(view && (view.buffer ?? 0) === 0 && !view.extensions, `accessor ${index}: invalid or compressed bufferView`);
  const [size, getter, denominator] = fmt, packed = size * components;
  const count = a.count, stride = view.byteStride ?? packed, start = view.byteOffset ?? 0, offset = a.byteOffset ?? 0;
  requireThat(Number.isInteger(count) && count > 0 && count <= 100_000, `accessor ${index}: invalid count`);
  requireThat(Number.isInteger(stride) && stride >= packed && stride % size === 0, `accessor ${index}: invalid byteStride`);
  requireThat(Number.isInteger(start) && start >= 0 && Number.isInteger(offset) && offset >= 0 && (start + offset) % size === 0, `accessor ${index}: invalid byteOffset`);
  requireThat(Number.isInteger(view.byteLength) && view.byteLength > 0 && start + view.byteLength <= g.buffers[0].byteLength, `accessor ${index}: bufferView outside buffer`);
  requireThat(offset + (count - 1) * stride + packed <= view.byteLength, `accessor ${index}: data exceeds bufferView`);
  const values = new Array(count);
  for (let i = 0; i < count; i++) {
    const row = new Array(components);
    for (let c = 0; c < components; c++) {
      let v = bin[getter](start + offset + i * stride + c * size);
      if (a.normalized && denominator != null) v = Math.max(-1, v / denominator);
      requireThat(Number.isFinite(v), `accessor ${index}: non-finite value`);
      row[c] = v;
    }
    values[i] = row;
  }
  return { values, accessor: a };
}

const multiply = (a, b) => {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
};
const transform = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
function nodeMatrix(n) {
  if (n.matrix) {
    requireThat(finite(n.matrix, 16) && !n.translation && !n.rotation && !n.scale, 'invalid node matrix/TRS');
    requireThat(Math.abs(n.matrix[3]) + Math.abs(n.matrix[7]) + Math.abs(n.matrix[11]) + Math.abs(n.matrix[15] - 1) < 1e-6, 'node matrix is not affine');
    return n.matrix;
  }
  const t = n.translation ?? [0, 0, 0], q = n.rotation ?? [0, 0, 0, 1], s = n.scale ?? [1, 1, 1];
  requireThat(finite(t, 3) && finite(q, 4) && finite(s, 3) && s.every((v) => Math.abs(v) > 1e-9), 'invalid node TRS');
  requireThat(Math.abs(Math.hypot(...q) - 1) < 1e-4, 'node quaternion is not normalized');
  const [x, y, z, w] = q, [sx, sy, sz] = s;
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    ...t, 1];
}

/** Inspect every scene root from decoded geometry. Bounds are measured from vertices, never accessor min/max claims. */
export function inspectGoodsGlb(input, { materials = DEFS } = {}) {
  const glb = readGoodsGlb(input), g = glb.json;
  const errors = [], roots = new Map(), names = new Map(), accessors = new Map();
  const problem = (message) => errors.push(message);
  if ((g.images?.length ?? 0) || (g.textures?.length ?? 0) || (g.samplers?.length ?? 0)) problem('embedded/external GLB textures are forbidden; use the shared material library');
  if ((g.animations?.length ?? 0) || (g.skins?.length ?? 0)) problem('goods must be static meshes');
  for (const m of g.materials ?? []) {
    if (!m.name || !materials[m.name]) problem(`unknown library material '${m.name}'`);
    if (Object.keys(m.pbrMetallicRoughness ?? {}).some((k) => /Texture$/.test(k)) || m.normalTexture || m.occlusionTexture || m.emissiveTexture) problem(`${m.name}: glTF texture binding is forbidden`);
  }
  for (const [i, n] of (g.nodes ?? []).entries()) {
    if (typeof n.name !== 'string' || !n.name) problem(`node ${i} has no stable name`);
    else if (names.has(n.name)) problem(`duplicate node name '${n.name}'`);
    else names.set(n.name, i);
  }
  const acc = (i) => { if (!accessors.has(i)) accessors.set(i, readGoodsAccessor(glb, i)); return accessors.get(i); };
  const rootIndices = g.scenes?.[g.scene ?? 0]?.nodes;
  requireThat(Array.isArray(rootIndices) && rootIndices.length, 'GLB has no active scene roots');
  const reached = new Set();
  function visit(index, parent, report, chain) {
    requireThat(Number.isInteger(index) && g.nodes?.[index], `missing node ${index}`);
    requireThat(!chain.has(index), `node ${index}: cycle in hierarchy`);
    requireThat(!reached.has(index), `node ${index}: referenced more than once`);
    reached.add(index);
    const n = g.nodes[index], matrix = multiply(parent, nodeMatrix(n));
    if (n.mesh != null) {
      const mesh = g.meshes?.[n.mesh];
      requireThat(mesh?.primitives?.length, `${n.name}: missing mesh`);
      for (const prim of mesh.primitives) {
        requireThat((prim.mode ?? 4) === 4 && !prim.extensions && !prim.targets, `${n.name}: only uncompressed static triangles are supported`);
        const pos = acc(prim.attributes?.POSITION);
        requireThat(pos.accessor.type === 'VEC3' && pos.accessor.componentType === 5126 && !pos.accessor.normalized, `${n.name}: positions must be float VEC3`);
        const count = pos.values.length, mat = g.materials?.[prim.material]?.name;
        requireThat(mat && materials[mat], `${n.name}: missing/unknown material '${mat}'`);
        const normal = acc(prim.attributes?.NORMAL), uv = acc(prim.attributes?.TEXCOORD_0), color = acc(prim.attributes?.COLOR_0);
        requireThat(normal.accessor.type === 'VEC3' && normal.values.length === count, `${n.name}: invalid normals`);
        requireThat(uv.accessor.type === 'VEC2' && uv.values.length === count, `${n.name}: invalid UVs`);
        requireThat(['VEC3', 'VEC4'].includes(color.accessor.type) && color.values.length === count, `${n.name}: missing/invalid vertex colors`);
        requireThat(normal.values.every((v) => Math.abs(Math.hypot(...v) - 1) < 0.02), `${n.name}: non-unit normals`);
        requireThat(color.values.every((v) => v.every((c) => c >= -1e-5 && c <= 1.00001)), `${n.name}: vertex color outside 0..1`);
        if (materials[mat].uv === 'unit') requireThat(uv.values.every((v) => v.every((c) => c >= -1e-6 && c <= 1.000001)), `${n.name}: label UV outside atlas`);
        let indices;
        if (prim.indices != null) {
          const ix = acc(prim.indices);
          requireThat(ix.accessor.type === 'SCALAR' && [5121, 5123, 5125].includes(ix.accessor.componentType) && !ix.accessor.normalized, `${n.name}: invalid indices`);
          indices = ix.values.map((v) => v[0]);
          requireThat(indices.every((v) => v < count), `${n.name}: index beyond vertex count`);
        } else indices = Array.from({ length: count }, (_, i) => i);
        requireThat(indices.length % 3 === 0, `${n.name}: triangle index count is not divisible by 3`);
        for (let t = 0; t < indices.length; t += 3) {
          const ids = indices.slice(t, t + 3), [p, q, r] = ids.map((i) => pos.values[i]);
          const a = q.map((v, k) => v - p[k]), b = r.map((v, k) => v - p[k]);
          const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
          const avg = [0, 1, 2].map((k) => ids.reduce((s, i) => s + normal.values[i][k], 0));
          const scale = Math.hypot(...cross) * Math.hypot(...avg);
          if (scale > 1e-12) requireThat(cross.reduce((s, v, k) => s + v * avg[k], 0) >= -0.001 * scale, `${n.name}: triangle winding opposes its outward normals`);
        }
        const part = { name: n.name, material: mat, triangles: indices.length / 3, vertices: count, uv: uv.values };
        report.triangles += part.triangles; report.parts.push(part);
        const actualMin = [Infinity, Infinity, Infinity], actualMax = [-Infinity, -Infinity, -Infinity];
        for (const p of pos.values) for (let k = 0; k < 3; k++) { actualMin[k] = Math.min(actualMin[k], p[k]); actualMax[k] = Math.max(actualMax[k], p[k]); }
        requireThat(same(actualMin, pos.accessor.min, 2e-5) && same(actualMax, pos.accessor.max, 2e-5), `${n.name}: POSITION min/max disagree with binary geometry`);
        for (const p of pos.values) {
          const q = transform(matrix, p);
          requireThat(q.every(Number.isFinite), `${n.name}: non-finite transformed vertex`);
          for (let k = 0; k < 3; k++) { report.min[k] = Math.min(report.min[k], q[k]); report.max[k] = Math.max(report.max[k], q[k]); }
        }
      }
    }
    const next = new Set(chain); next.add(index);
    for (const child of n.children ?? []) visit(child, matrix, report, next);
  }
  for (const index of rootIndices) {
    const name = g.nodes?.[index]?.name ?? `node${index}`;
    const report = { name, triangles: 0, parts: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    try {
      // Runtime removes the asset root transform. Identity here makes file, manifest and runtime coordinates agree.
      requireThat(same(nodeMatrix(g.nodes[index]), I), `${name}: asset root transform must be identity`);
      visit(index, I, report, new Set());
      requireThat(report.parts.length && report.triangles > 0, `${name}: empty asset node`);
      requireThat(report.triangles < TRIANGLE_LIMIT, `${name}: ${report.triangles} triangles; each LOD must be under ${TRIANGLE_LIMIT}`);
    } catch (e) { problem(`${name}: ${e.message}`); }
    roots.set(name, report);
  }
  if (reached.size !== (g.nodes?.length ?? 0)) problem('GLB contains unreachable nodes');
  return { ...glb, roots, errors, materialNames: (g.materials ?? []).map((m) => m.name) };
}

function contained(root, path) {
  requireThat(typeof path === 'string' && path && !isAbsolute(path) && !path.includes('\\'), `invalid relative asset path '${path}'`);
  const abs = resolve(root, path), rel = relative(root, abs);
  requireThat(rel !== '..' && !rel.startsWith('..' + sep), `asset path escapes root: ${path}`);
  return abs;
}

function diskFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((f) => f.isDirectory() ? diskFiles(resolve(dir, f.name)) : [resolve(dir, f.name)]);
}

function pngSize(path) {
  const b = readFileSync(path);
  requireThat(b.length >= 33 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && b.toString('ascii', 12, 16) === 'IHDR', 'atlas must be an actual PNG');
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[b[25]];
  requireThat(w > 0 && h > 0 && w <= 2048 && h <= 2048 && b[24] === 8 && channels && b[26] === 0 && b[27] === 0 && b[28] === 0, 'atlas must be an 8-bit noninterlaced PNG <=2048²');
  const idat = []; let end = false;
  for (let off = 8; off < b.length;) {
    requireThat(off + 12 <= b.length, 'PNG chunk header is truncated');
    const len = b.readUInt32BE(off), kind = b.toString('ascii', off + 4, off + 8);
    requireThat(off + 12 + len <= b.length, 'PNG chunk is truncated');
    if (kind === 'IDAT') idat.push(b.subarray(off + 8, off + 8 + len));
    off += 12 + len;
    if (kind === 'IEND') { requireThat(off === b.length && len === 0, 'invalid PNG end'); end = true; }
  }
  requireThat(end && idat.length, 'PNG has no image data/end');
  const row = w * channels + 1, pixels = inflateSync(Buffer.concat(idat), { maxOutputLength: row * h });
  requireThat(pixels.length === row * h, 'PNG decoded image length is invalid');
  for (let y = 0; y < h; y++) requireThat(pixels[y * row] <= 4, 'PNG uses an invalid row filter');
  return [w, h];
}

async function dataModule(root, name) {
  const path = contained(root, `js/interiors/${name}`);
  requireThat(existsSync(path), `missing data module ${name}`);
  return import(pathToFileURL(path).href);
}

/** Return a complete evidence report; no thrown error for a malformed/missing deliverable. */
export async function validateGoods({ root = ROOT, complete = false, catalog, assortments, fixtures, fixtureCatalog, materials = DEFS } = {}) {
  root = resolve(root);
  const report = { ok: false, complete, assets: 0, lods: 0, categories: [], bytes: 0, budget: GOODS_BUDGET, files: [], maxTriangles: 0, maxLodTriangles: 0, errors: [], warnings: [] };
  const fail = (message) => report.errors.push(message), requireComplete = (ok, message) => { if (!ok) (complete ? report.errors : report.warnings).push(message); };
  const counted = new Set(), countFile = (path) => {
    if (counted.has(path)) return;
    counted.add(path);
    const bytes = statSync(path).size;
    report.bytes += bytes; report.files.push({ path: relative(root, path).split(sep).join('/'), bytes });
  };
  const jsonFile = (path) => JSON.parse(readFileSync(path, 'utf8'));
  const manifestPath = resolve(root, 'assets/models/manifest.goods.json');
  let manifest;
  try { manifest = jsonFile(manifestPath); countFile(manifestPath); }
  catch (e) { fail(`manifest.goods.json missing or invalid: ${e.message}`); report.ok = false; return report; }
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.files)) { fail('manifest.goods.json must contain a files array'); return report; }
  try { catalog ??= (await dataModule(root, 'goods-catalog.js')).GOODS_CATALOG; }
  catch (e) { fail(e.message); catalog = {}; }
  try { const data = await dataModule(root, 'goods-assortments.js'); assortments ??= data.GOODS_ASSORTMENTS; fixtures ??= data.GOODS_FIXTURES; }
  catch (e) { requireComplete(false, e.message); assortments = {}; }
  try { fixtureCatalog ??= (await dataModule(root, 'catalog.js')).CATALOG; }
  catch (e) { fail(e.message); fixtureCatalog = {}; }
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) { fail('GOODS_CATALOG must be an object'); catalog = {}; }
  for (const p of ['goods-catalog.js', 'goods-assortments.js']) {
    const path = resolve(root, 'js/interiors', p);
    if (existsSync(path)) countFile(path);
  }
  const modelsRoot = resolve(root, 'assets/models'), texturesRoot = resolve(root, 'assets/textures');
  const entries = new Map(), rootsByFile = new Map(), categories = new Set(), labelIds = new Set();
  requireComplete(Array.isArray(manifest.files) && manifest.files.length > 0, 'goods manifest has no GLB files');
  for (const set of Array.isArray(manifest.files) ? manifest.files : []) {
    if (!set || typeof set !== 'object' || !set.assets || typeof set.assets !== 'object' || Array.isArray(set.assets)) { fail('GLB manifest entry must have an assets object'); continue; }
    let path, data;
    try {
      path = contained(modelsRoot, set.glb);
      requireThat(extname(path).toLowerCase() === '.glb', `${set.glb}: expected .glb`);
      requireThat(!rootsByFile.has(path), `${set.glb}: duplicate file declaration`);
      data = inspectGoodsGlb(path, { materials }); countFile(path); rootsByFile.set(path, data);
      data.errors.forEach((e) => fail(`${set.glb}: ${e}`));
    } catch (e) { fail(`${set.glb ?? 'GLB'}: ${e.message}`); }
    const declaredNodes = new Set();
    for (const [key, meta] of Object.entries(set.assets ?? {})) {
      const label = `${set.glb}/${key}`, c = catalog?.[key];
      if (entries.has(key)) fail(`${key}: duplicate catalogue key in manifest`);
      entries.set(key, meta);
      if (!meta || typeof meta !== 'object' || Array.isArray(meta)) { fail(`${key}: asset metadata must be an object`); continue; }
      if (!c) { fail(`${key}: not in GOODS_CATALOG`); continue; }
      report.assets++;
      if (!/^[a-z][a-z0-9_]+$/.test(key)) fail(`${key}: invalid stable catalogue key`);
      if (!positive(meta.size, 3) || !positive(meta.footprint, 2)) { fail(`${key}: size and footprint must be positive metres`); continue; }
      if (!same(meta.size, c.size) || !same(meta.footprint, c.footprint)) fail(`${key}: manifest size/footprint differs from catalogue`);
      if (meta.footprint[0] + 1e-6 < meta.size[0] || meta.footprint[1] + 1e-6 < meta.size[2]) fail(`${key}: footprint does not enclose size`);
      if (!fixtureCatalog?.[key]) requireComplete(false, `${key}: goods key is not registered in the interior CATALOG`);
      else if (!same(fixtureCatalog[key].size, c.size) || !same(fixtureCatalog[key].footprint, c.footprint)) fail(`${key}: interior CATALOG size/footprint differs from goods metadata`);
      if (!Array.isArray(meta.tags) || !meta.tags.includes('goods') || !meta.category || meta.category !== c.category) fail(`${key}: missing/mismatched goods category`);
      if (meta.category) categories.add(meta.category);
      if (meta.labelId) labelIds.add(meta.labelId);
      if ((meta.labelId ?? null) !== (c.labelId ?? null)) fail(`${key}: label ID differs from catalogue`);
      if (meta.node !== key || typeof meta.lodNode !== 'string' || meta.lodNode === meta.node) fail(`${key}: missing stable near/far node names`);
      for (const [nodeName, expectedTris, far] of [[meta.node, meta.triangles, false], [meta.lodNode, meta.lodTriangles, true]]) {
        if (declaredNodes.has(nodeName)) fail(`${label}: node '${nodeName}' used twice`);
        declaredNodes.add(nodeName);
        const n = data?.roots.get(nodeName);
        if (!n) { fail(`${label}: ${far ? 'LOD' : 'asset'} node '${nodeName}' is not present in the GLB`); continue; }
        if (far) report.lods++;
        const eps = 0.002, w = meta.footprint[0], h = meta.size[1], d = meta.footprint[1];
        if (!(n.min[0] >= -w / 2 - eps && n.max[0] <= w / 2 + eps && n.min[2] >= -d / 2 - eps && n.max[2] <= d / 2 + eps && n.min[1] >= -eps && n.max[1] <= h + eps)) fail(`${label}: '${nodeName}' binary geometry exceeds its footprint/height`);
        if (!(Math.abs(n.min[1]) <= 0.005)) fail(`${label}: '${nodeName}' does not stand on y=0`);
        if (!Number.isInteger(expectedTris) || expectedTris !== n.triangles) fail(`${label}: '${nodeName}' manifest triangle count ${expectedTris} differs from actual ${n.triangles}`);
        report[far ? 'maxLodTriangles' : 'maxTriangles'] = Math.max(report[far ? 'maxLodTriangles' : 'maxTriangles'], n.triangles);
      }
      if (!(meta.lodTriangles < TRIANGLE_LIMIT && meta.lodTriangles <= meta.triangles)) fail(`${key}: LOD must not exceed the near mesh or triangle budget`);
    }
    if (data) for (const name of data.roots.keys()) if (!declaredNodes.has(name)) fail(`${set.glb}: undeclared asset root '${name}'`);
  }
  for (const key of Object.keys(catalog ?? {})) requireComplete(entries.has(key), `${key}: catalogue asset not generated in manifest`);
  requireComplete(entries.size > 0, 'goods library is empty');
  report.categories = [...categories].sort();

  // Required coverage is independent of the manifest, so deleting both a record and its model cannot fake completeness.
  for (const category of REQUIRED_CATEGORIES) requireComplete(categories.has(category), `required goods category '${category}' is missing`);
  const usedKeys = new Set(), usedFixtures = new Set();
  for (const [shop, mapping] of Object.entries(assortments ?? {})) {
    if (!SHOP_TYPES.includes(shop)) fail(`assortments: unknown shop type '${shop}'`);
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) { fail(`assortments/${shop}: expected fixture mapping`); continue; }
    for (const [fixture, keys] of Object.entries(mapping)) {
      usedFixtures.add(fixture);
      if (!fixtureCatalog[fixture]) fail(`assortments/${shop}: unknown fixture '${fixture}'`);
      if (!fixtures?.[fixture]) fail(`assortments/${shop}: no support surfaces for '${fixture}'`);
      if (!Array.isArray(keys) || !keys.length) { fail(`assortments/${shop}/${fixture}: goods list is empty/invalid`); continue; }
      for (const key of keys) {
        usedKeys.add(key);
        if (!catalog[key]) fail(`assortments/${shop}/${fixture}: unknown good '${key}'`);
        requireComplete(entries.has(key), `assortments/${shop}/${fixture}: '${key}' has no generated model`);
      }
    }
  }
  for (const [key, spec] of Object.entries(fixtures ?? {})) {
    if (!fixtureCatalog[key]) fail(`support surfaces: unknown fixture '${key}'`);
    if (!(Array.isArray(spec?.surfaces) && spec.surfaces.length) && !['shelf', 'rack', 'chips', 'case', 'top', 'crate', 'fruitstand', 'round'].includes(spec?.layout)) fail(`${key}: unknown goods surface layout '${spec?.layout}'`);
    if (!Number.isInteger(spec?.maxItems) || spec.maxItems < 1 || spec.maxItems > 96) fail(`${key}: maxItems must be a bounded integer (1..96)`);
    if (spec?.rows != null && (!Number.isInteger(spec.rows) || spec.rows < 1 || spec.rows > 12)) fail(`${key}: invalid shelf row count`);
    if (spec?.gap != null && (!Number.isFinite(spec.gap) || spec.gap < 0 || spec.gap > 0.2)) fail(`${key}: invalid stock spacing`);
    if (spec?.surfaces != null && !Array.isArray(spec.surfaces)) fail(`${key}: surfaces must be an array`);
    for (const surface of Array.isArray(spec?.surfaces) ? spec.surfaces : []) if (!surface || !positive([surface.w, surface.d, surface.h], 3) || !Number.isFinite(surface.y) || surface.y < 0 || (surface.x != null && !Number.isFinite(surface.x)) || (surface.z != null && !Number.isFinite(surface.z))) fail(`${key}: invalid support surface dimensions/position`);
    if (spec?.obstacles != null && !Array.isArray(spec.obstacles)) fail(`${key}: obstacles must be an array`);
    for (const obstacle of Array.isArray(spec?.obstacles) ? spec.obstacles : []) if (!obstacle || !positive([obstacle.w, obstacle.d, obstacle.h], 3) || !finite([obstacle.x ?? 0, obstacle.y ?? 0, obstacle.z ?? 0], 3)) fail(`${key}: invalid fixture obstacle dimensions/position`);
  }
  for (const shop of SHOP_TYPES) requireComplete(Object.keys(assortments?.[shop] ?? {}).length > 0, `shop '${shop}' has no assortment data`);
  for (const fixture of REQUIRED_FIXTURES) requireComplete(usedFixtures.has(fixture), `required fixture '${fixture}' has no shop assortment`);
  for (const key of Object.keys(catalog ?? {})) requireComplete(usedKeys.has(key), `${key}: generated good is unused by every shop assortment`);
  report.shops = Object.keys(assortments ?? {}).length;
  report.fixtures = usedFixtures.size;

  try {
    const a = manifest.atlas;
    requireThat(a && typeof a.file === 'string' && Array.isArray(a.labels) && a.labels.length, 'manifest has no single labelled atlas');
    const path = contained(texturesRoot, a.file); countFile(path);
    const dimensions = pngSize(path);
    requireThat(same(dimensions, [a.width, a.height], 0.1), 'atlas PNG dimensions differ from manifest');
    requireThat(a.width <= 2048 && a.height <= 2048, 'atlas exceeds 2048x2048');
    const ids = new Set();
    for (const label of a.labels) {
      requireThat(typeof label.id === 'string' && label.id && !ids.has(label.id), 'atlas has duplicate/missing label IDs'); ids.add(label.id);
      requireThat(typeof label.brand === 'string' && label.brand.trim().length >= 3 && typeof label.product === 'string' && label.product.trim(), `${label.id}: invented Spanish brand/product metadata is missing`);
      requireThat(finite(label.rect, 4) && label.rect[0] >= 0 && label.rect[1] >= 0 && label.rect[2] > 0 && label.rect[3] > 0 && label.rect[0] + label.rect[2] <= a.width && label.rect[1] + label.rect[3] <= a.height, `${label.id}: label tile leaves atlas`);
    }
    for (let i = 0; i < a.labels.length; i++) for (let j = i + 1; j < a.labels.length; j++) {
      const [x, y, w, h] = a.labels[i].rect, [u, v, s, t] = a.labels[j].rect;
      requireThat(Math.min(x + w, u + s) <= Math.max(x, u) || Math.min(y + h, v + t) <= Math.max(y, v), `atlas labels '${a.labels[i].id}' and '${a.labels[j].id}' overlap`);
    }
    for (const id of labelIds) requireThat(ids.has(id), `asset references missing atlas label '${id}'`);
    const labels = new Map(a.labels.map((label) => [label.id, label]));
    for (const set of manifest.files ?? []) {
      if (!set?.glb || !set.assets || typeof set.assets !== 'object') continue;
      const data = rootsByFile.get(contained(modelsRoot, set.glb));
      if (!data) continue;
      for (const [key, meta] of Object.entries(set.assets ?? {})) {
        if (!meta || typeof meta !== 'object') continue;
        const label = labels.get(meta.labelId);
        const near = data.roots.get(meta.node), nearLabels = near?.parts.filter((p) => p.material === 'goods_label') ?? [];
        if (!label) { requireThat(nearLabels.length === 0, `${key}: labelled mesh has no atlas label ID`); continue; }
        requireThat(nearLabels.length > 0, `${key}: declared label has no near-mesh UVs`);
        const [x, y, w, h] = label.rect, u0 = x / a.width, u1 = (x + w) / a.width;
        // MaterialLib uses ordinary TextureLoader flipY=true. Blender's exported V coordinate is 1-imageRow.
        const v0 = 1 - (y + h) / a.height, v1 = 1 - y / a.height;
        for (const node of [meta.node, meta.lodNode]) for (const part of data.roots.get(node)?.parts ?? []) {
          if (part.material !== 'goods_label') continue;
          requireThat(part.uv.every(([u, v]) => u >= u0 + 1 / a.width && u <= u1 - 1 / a.width && v >= v0 + 1 / a.height && v <= v1 - 1 / a.height), `${key}: label UVs leave their padded '${meta.labelId}' atlas tile`);
        }
      }
    }
    const textures = jsonFile(resolve(texturesRoot, 'manifest.json')).textures;
    const material = materials.goods_label;
    const textureKey = typeof material?.tex === 'string' ? material.tex : 'goods_label';
    requireComplete(textures?.[textureKey]?.map === a.file, 'atlas not registered at the material texture key in the texture manifest');
    requireComplete(material?.uv === 'unit', 'goods_label must be a unit-UV library material');
    report.atlas = { file: a.file, dimensions, labels: a.labels.length };
  } catch (e) { fail(`atlas: ${e.message}`); }
  try {
    const rootManifest = jsonFile(resolve(modelsRoot, 'manifest.json'));
    requireComplete(rootManifest.files?.includes('manifest.goods.json'), 'manifest.goods.json is not registered in assets/models/manifest.json');
  } catch (e) { requireComplete(false, `root asset manifest missing/invalid: ${e.message}`); }
  for (const path of diskFiles(resolve(modelsRoot, 'goods'))) {
    if (!counted.has(path)) { countFile(path); fail(`unlisted goods payload: ${relative(root, path)}`); }
  }
  for (const path of diskFiles(texturesRoot).filter((p) => /^goods[_.-]/.test(p.split(sep).at(-1)))) {
    if (!counted.has(path)) { countFile(path); fail(`unlisted goods texture: ${relative(root, path)}`); }
  }
  if (!(report.bytes < GOODS_BUDGET)) fail(`goods payload ${report.bytes} bytes must be under ${GOODS_BUDGET}`);
  report.ok = report.errors.length === 0;
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), value = (key) => { const i = args.indexOf(key); return i < 0 ? undefined : args[i + 1]; };
  if (args.includes('--help')) {
    console.log('usage: node la-ladera/tools/blender/goods_validate.mjs [--complete] [--root la-ladera] [--json report.json]');
  } else {
    const report = await validateGoods({ root: value('--root') ?? ROOT, complete: args.includes('--complete') });
    if (value('--json')) writeFileSync(value('--json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 1;
  }
}
