// Independent release gate for the offline substation library. No Blender or
// renderer is used: metre bounds and triangles come from decoded GLB buffers.
import '../../tests/nice.mjs';
import { readFileSync, readdirSync, statSync, realpathSync, existsSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { solveCatenary, catenaryInstances } from '../substation_catenary.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const MAX_MODEL_BYTES = 4_500_000;
export const MAX_TEXTURE_BYTES = 8_000_000;
export const MAX_GPU_BYTES = 40_000_000;
export const MAX_NEAR_TRIANGLES = 3000;
export const MAX_TRANSFORMER_TRIANGLES = 6000;
export const MAX_LOD_RATIO = 0.4;
// Fixed acceptance coverage, independent of the generator's registrations and
// catalogue. Removing an item from both cannot make --complete turn green.
export const REQUIRED_KEYS = Object.freeze([
  'transformer_132_33', 'transformer_33_11', 'breaker_oil_132', 'breaker_oil_33', 'breaker_truck_11',
  'disconnector_centre_132', 'disconnector_centre_33', 'disconnector_pantograph_132',
  'ct_132', 'ct_33', 'cvt_132', 'cvt_33', 'arrester_132', 'arrester_33',
  'post_insulator_132', 'post_insulator_33', 'earth_switch_132', 'earth_switch_33',
  'switchboard_panel_11', 'control_panel', 'battery_bank', 'battery_charger', 'station_transformer',
  'radiator_bank', 'cooling_fan', 'insulator_disc', 'insulator_string_132', 'insulator_string_33', 'conductor_segment', 'conductor_spacer',
  'tower_suspension_132', 'tower_terminal_132', 'pole_hframe_33', 'pole_concrete_11', 'gantry_132', 'gantry_33',
  'busbar_tube', 'bund_large', 'bund_small', 'firewall', 'wall_brick', 'wall_door', 'wall_window', 'roof_flat',
  'door_steel', 'louvre', 'window', 'oil_store', 'fence_panel', 'fence_post', 'gate', 'floodlight_mast', 'lightning_mast',
  'gravel_tile', 'concrete_tile', 'trench_cover', 'sign_danger', 'sign_access', 'sign_touch',
].map((name) => 'substation_' + name));
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const READERS = {
  5120: [1, 'readInt8', 127], 5121: [1, 'readUInt8', 255],
  5122: [2, 'readInt16LE', 32767], 5123: [2, 'readUInt16LE', 65535],
  5125: [4, 'readUInt32LE', 4294967295], 5126: [4, 'readFloatLE', 1],
};
const check = (ok, message) => { if (!ok) throw new Error(message); };
const natural = (n) => Number.isInteger(n) && n >= 0;
const vector = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
const positive = (a, n) => vector(a, n) && a.every((v) => v > 0);
const eq = (a, b, epsilon = 0.002) => vector(a, b.length) && a.every((v, i) => Math.abs(v - b[i]) <= epsilon);
const jsonFile = (path) => JSON.parse(readFileSync(path, 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function contained(root, name, label) {
  check(typeof name === 'string' && name.length && !name.includes('\\') && !isAbsolute(name), `${label}: expected relative path`);
  const path = resolve(root, name), rel = relative(root, path);
  check(rel && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel), `${label}: path escapes allowed directory`);
  const actual = realpathSync(path), actualRel = relative(realpathSync(root), actual);
  check(actualRel && actualRel !== '..' && !actualRel.startsWith('..' + sep) && !isAbsolute(actualRel), `${label}: symlink escapes allowed directory`);
  check(statSync(actual).isFile(), `${label}: expected file`);
  return path;
}

function filesBelow(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? filesBelow(resolve(path, entry.name)) : [resolve(path, entry.name)]);
}

const multiply = (a, b) => {
  const out = Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
};
function matrix(n) {
  if (n.matrix) {
    check(vector(n.matrix, 16) && !n.translation && !n.rotation && !n.scale, 'invalid matrix/TRS combination');
    const m = n.matrix;
    const determinant = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
    check(determinant > 1e-12 && [3, 7, 11].every((i) => Math.abs(m[i]) < 1e-8) && Math.abs(m[15] - 1) < 1e-8, 'matrix must be finite affine and preserve winding');
    return m;
  }
  const t = n.translation ?? [0, 0, 0], r = n.rotation ?? [0, 0, 0, 1], s = n.scale ?? [1, 1, 1];
  check(vector(t, 3) && vector(r, 4) && positive(s, 3) && Math.abs(Math.hypot(...r) - 1) < 0.001, 'invalid node transform');
  const [x, y, z, w] = r, [sx, sy, sz] = s;
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, ...t, 1];
}
const transform = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];

/** Parse container and every accessor, including unused data. Bounds are derived
 * from bytes; accessor min/max declarations are independently checked. */
export function parseGlb(input) {
  const b = Buffer.from(input);
  check(b.length >= 28 && b.readUInt32LE(0) === 0x46546c67, 'invalid GLB magic/header');
  check(b.readUInt32LE(4) === 2 && b.readUInt32LE(8) === b.length, 'GLB version/declared length mismatch');
  let json, bin, offset = 12, count = 0;
  while (offset < b.length) {
    check(offset + 8 <= b.length, 'truncated GLB chunk header');
    const length = b.readUInt32LE(offset), type = b.readUInt32LE(offset + 4);
    check(length > 0 && length % 4 === 0 && offset + 8 + length <= b.length, 'truncated/unaligned GLB chunk');
    check(count < 2 && type === (count === 0 ? 0x4e4f534a : 0x004e4942), 'GLB requires exactly JSON followed by BIN');
    const chunk = b.subarray(offset + 8, offset + 8 + length);
    if (count === 0) json = JSON.parse(chunk.toString('utf8')); else bin = chunk;
    offset += 8 + length; count++;
  }
  check(count === 2 && json?.asset?.version === '2.0', 'GLB requires glTF 2.0 JSON and BIN');
  check(!json.images?.length && !json.textures?.length && !json.samplers?.length, 'embedded/external images and textures are forbidden');
  check(!json.skins?.length && !json.animations?.length, 'substation pieces must be static and unskinned');
  check(!json.extensionsRequired?.length, 'decoder/extension dependencies are forbidden');
  const dependencies = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      check(key !== 'uri' && !/Texture$/.test(key), 'external URI/texture dependencies are forbidden');
      if (key === 'extensions') check(!Object.keys(child).some((name) => /draco|meshopt|basisu|texture/i.test(name)), 'compression/texture extension dependencies are forbidden');
      dependencies(child);
    }
  };
  dependencies(json);
  check(json.buffers?.length === 1 && natural(json.buffers[0].byteLength) && json.buffers[0].byteLength > 0, 'requires one non-empty binary buffer');
  const limit = json.buffers[0].byteLength;
  check(limit <= bin.length && bin.length - limit <= 3, 'invalid binary buffer length');
  check(Array.isArray(json.bufferViews) && Array.isArray(json.accessors), 'missing bufferViews/accessors');
  for (const [i, view] of json.bufferViews.entries()) {
    check(view.buffer === 0 && natural(view.byteOffset ?? 0) && natural(view.byteLength) && view.byteLength > 0 && (view.byteOffset ?? 0) + view.byteLength <= limit, `bufferView ${i}: range exceeds binary buffer`);
    if (view.byteStride != null) check(natural(view.byteStride) && view.byteStride >= 4 && view.byteStride <= 252 && view.byteStride % 4 === 0, `bufferView ${i}: invalid byteStride`);
  }
  const accessors = json.accessors.map((a, i) => {
    const view = json.bufferViews[a.bufferView], reader = READERS[a.componentType], width = WIDTH[a.type];
    check(view && reader && width && !a.sparse, `accessor ${i}: unsupported type/component/view/sparse data`);
    check(natural(a.count) && a.count > 0 && natural(a.byteOffset ?? 0), `accessor ${i}: invalid count/offset`);
    check(!a.normalized || [5120, 5121, 5122, 5123].includes(a.componentType), `accessor ${i}: invalid normalized component`);
    const [bytes, method, divisor] = reader, stride = view.byteStride ?? width * bytes, local = a.byteOffset ?? 0, start = (view.byteOffset ?? 0) + local;
    check(start % bytes === 0 && local % bytes === 0 && stride >= width * bytes && stride % bytes === 0 && local + (a.count - 1) * stride + width * bytes <= view.byteLength, `accessor ${i}: range/alignment exceeds bufferView`);
    const min = Array(width).fill(Infinity), max = Array(width).fill(-Infinity), values = [];
    for (let row = 0; row < a.count; row++) {
      const data = [];
      for (let k = 0; k < width; k++) {
        const raw = bin[method](start + row * stride + k * bytes);
        check(Number.isFinite(raw), `accessor ${i}: non-finite binary value`);
        const value = a.normalized ? Math.max(-1, raw / divisor) : raw;
        data.push(value); min[k] = Math.min(min[k], value); max[k] = Math.max(max[k], value);
      }
      values.push(data);
    }
    for (const [field, expected] of [['min', min], ['max', max]]) if (a[field] != null) {
      check(vector(a[field], width), `accessor ${i}: invalid ${field} metadata`);
      const declared = a.normalized ? a[field].map((v) => Math.max(-1, v / divisor)) : a[field];
      check(eq(declared, expected, 0.0001), `accessor ${i}: ${field} metadata disagrees with binary data`);
    }
    return { ...a, values, minActual: min, maxActual: max };
  });
  return { json, bin, accessors, bytes: b.length };
}

/** Decode primitive data once, then count/bound every actual mesh instance. */
export function inspectGlb(path, materialData) {
  const parsed = parseGlb(readFileSync(path)), { json: g, accessors: data } = parsed;
  const definitions = materialData?.materials ?? materialData ?? {}, tiles = materialData?.atlas?.tiles ?? {};
  check(Array.isArray(g.materials) && g.materials.length > 0, 'missing named materials');
  for (const m of g.materials) check(typeof m.name === 'string' && Object.hasOwn(definitions, m.name), `unknown library material '${m.name}'`);
  const meshes = g.meshes?.map((mesh, mi) => {
    check(Array.isArray(mesh.primitives) && mesh.primitives.length > 0 && !mesh.weights, `mesh ${mi}: empty/morphed mesh`);
    return mesh.primitives.map((primitive, pi) => {
      const label = `mesh ${mi} primitive ${pi}`, attrs = primitive.attributes ?? {};
      check((primitive.mode ?? 4) === 4 && !primitive.targets && !primitive.extensions, `${label}: only plain rigid TRIANGLES supported`);
      const p = data[attrs.POSITION], n = data[attrs.NORMAL], uv = data[attrs.TEXCOORD_0];
      check(p?.type === 'VEC3' && p.componentType === 5126 && vector(p.min, 3) && vector(p.max, 3), `${label}: POSITION must be float VEC3 with bounds`);
      check(n?.type === 'VEC3' && n.count === p.count && uv?.type === 'VEC2' && uv.count === p.count, `${label}: missing/mismatched normals or UVs`);
      check(n.values.every((v) => Math.abs(Math.hypot(...v) - 1) <= 0.025), `${label}: non-unit normal`);
      check(uv.values.every((v) => v.every((c) => c >= -0.00001 && c <= 1.00001)), `${label}: atlas UV outside 0..1`);
      for (const [name, index] of Object.entries(attrs)) {
        const a = data[index]; check(a && a.count === p.count, `${label}: attribute ${name} count mismatch`);
        check(!/^(JOINTS|WEIGHTS)_/.test(name), `${label}: skin attributes forbidden`);
        if (/^COLOR_/.test(name)) check(['VEC3', 'VEC4'].includes(a.type) && a.values.every((v) => v.every((c) => c >= 0 && c <= 1.00001)), `${label}: invalid vertex colours`);
      }
      check(natural(primitive.material) && g.materials[primitive.material], `${label}: missing material`);
      const name = g.materials[primitive.material].name, def = definitions[name], tile = tiles[def.tile ?? name];
      if (tile) check(uv.values.every(([u, v]) => u >= tile[0] - 0.00002 && u <= tile[2] + 0.00002 && v >= tile[1] - 0.00002 && v <= tile[3] + 0.00002), `${label}: UV outside assigned atlas tile '${def.tile ?? name}'`);
      let indices;
      if (primitive.indices != null) {
        const a = data[primitive.indices];
        check(a?.type === 'SCALAR' && [5121, 5123, 5125].includes(a.componentType) && !a.normalized, `${label}: invalid index component`);
        indices = a.values.map((v) => v[0]);
      } else indices = p.values.map((_, i) => i);
      check(indices.length > 0 && indices.length % 3 === 0 && indices.every((i) => natural(i) && i < p.count), `${label}: invalid triangle count/index outside POSITION`);
      for (let t = 0; t < indices.length; t += 3) {
        const ids = indices.slice(t, t + 3), [a, b, c] = ids.map((i) => p.values[i]);
        const u = b.map((v, k) => v - a[k]), v = c.map((q, k) => q - a[k]);
        const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], area = Math.hypot(...cross);
        check(area > 1e-12, `${label}: degenerate triangle ${t / 3}`);
        const normalSum = [0, 1, 2].map((k) => ids.reduce((sum, i) => sum + n.values[i][k], 0));
        check(cross.reduce((sum, x, k) => sum + x * normalSum[k], 0) > area * 1e-5, `${label}: triangle winding disagrees with normals`);
      }
      return { points: p.values, uv: uv.values, indices, triangles: indices.length / 3, material: name };
    });
  });
  check(meshes?.length, 'missing drawable meshes');
  check(Array.isArray(g.nodes) && g.scenes?.length === 1 && (g.scene ?? 0) === 0 && Array.isArray(g.scenes[0].nodes), 'requires one default scene');
  const roots = g.scenes[0].nodes, seen = new Set(), assets = new Map(), usedMeshes = new Set(); let meshInstances = 0;
  const visit = (index, parent, asset) => {
    check(natural(index) && g.nodes[index] && !seen.has(index), 'invalid/cyclic/shared child node');
    seen.add(index); const node = g.nodes[index], m = multiply(parent, matrix(node));
    check(node.skin == null && node.weights == null && node.camera == null, 'skin/morph/camera node forbidden');
    if (node.mesh != null) {
      check(natural(node.mesh) && meshes[node.mesh], 'invalid mesh node'); usedMeshes.add(node.mesh); meshInstances++;
      for (const primitive of meshes[node.mesh]) {
        for (const index of new Set(primitive.indices)) {
          const p = transform(m, primitive.points[index]);
          for (let k = 0; k < 3; k++) { asset.min[k] = Math.min(asset.min[k], p[k]); asset.max[k] = Math.max(asset.max[k], p[k]); }
        }
        asset.triangles += primitive.triangles; asset.parts++;
        asset.materials.add(primitive.material); asset.meshIds.add(node.mesh);
        if (/_sign_|_plate/.test(primitive.material)) for (let t = 0; t < primitive.indices.length; t += 3) {
          const indices = primitive.indices.slice(t, t + 3), points = indices.map((index) => transform(m, primitive.points[index]));
          const y = points.map((point) => point[1]), v = indices.map((index) => primitive.uv[index][1]);
          if (Math.max(...y) - Math.min(...y) > 0.005 && Math.max(...v) - Math.min(...v) > 0.00001) {
            const ym = y.reduce((sum, value) => sum + value, 0) / 3, vm = v.reduce((sum, value) => sum + value, 0) / 3;
            check(y.reduce((sum, value, i) => sum + (value - ym) * (v[i] - vm), 0) > 0, `${primitive.material}: sign/plate UVs are vertically flipped`);
          }
        }
      }
    }
    check(node.children == null || Array.isArray(node.children), 'invalid child array');
    for (const child of node.children ?? []) visit(child, m, asset);
  };
  for (const root of roots) {
    const node = g.nodes[root]; check(node?.name && !assets.has(node.name), 'missing/duplicate named scene root');
    check(eq(matrix(node), IDENTITY, 0.00001), `${node.name}: root transform must be identity`);
    const asset = { name: node.name, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], triangles: 0, parts: 0, materials: new Set(), meshIds: new Set() };
    visit(root, IDENTITY, asset); check(asset.triangles > 0, `${node.name}: empty asset root`);
    asset.size = asset.max.map((v, k) => v - asset.min[k]); asset.materials = [...asset.materials]; asset.meshIds = [...asset.meshIds]; assets.set(node.name, asset);
  }
  check(assets.size > 0 && seen.size === g.nodes.length && usedMeshes.size === meshes.length, 'orphan nodes/meshes or empty GLB scene');
  return { bytes: parsed.bytes, assets, uniqueMeshes: meshes.length, meshInstances, sharedMeshAliases: meshInstances - meshes.length };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (bytes) => { let c = 0xffffffff; for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function inspectPng(input, maxDimension = 2048) {
  const b = Buffer.from(input);
  check(b.length >= 45 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'invalid PNG header');
  let offset = 8, header, ended = false; const chunks = [];
  while (offset < b.length) {
    check(offset + 12 <= b.length, 'truncated PNG chunk');
    const length = b.readUInt32BE(offset), end = offset + 8 + length, type = b.toString('ascii', offset + 4, offset + 8);
    check(end + 4 <= b.length && crc32(b.subarray(offset + 4, end)) === b.readUInt32BE(end), `PNG ${type} payload/CRC invalid`);
    if (!header) { check(type === 'IHDR' && length === 13, 'PNG must begin with IHDR'); header = b.subarray(offset + 8, end); }
    else check(type !== 'IHDR', 'duplicate PNG IHDR');
    if (type === 'IDAT') chunks.push(b.subarray(offset + 8, end));
    if (type === 'IEND') { check(length === 0 && end + 4 === b.length, 'data after PNG IEND'); ended = true; }
    offset = end + 4;
  }
  const width = header.readUInt32BE(0), height = header.readUInt32BE(4), channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[header[9]];
  check(width > 0 && height > 0 && width <= maxDimension && height <= maxDimension, `PNG dimensions exceed ${maxDimension}px atlas cap`);
  check(ended && chunks.length && channels && header[8] === 8 && header[10] === 0 && header[11] === 0 && header[12] === 0, 'requires complete 8-bit non-interlaced PNG');
  const stride = width * channels + 1, raster = inflateSync(Buffer.concat(chunks), { maxOutputLength: stride * height });
  check(raster.length === stride * height, 'PNG decoded raster size mismatch');
  for (let y = 0; y < height; y++) check(raster[y * stride] <= 4, 'invalid PNG row filter');
  return { width, height, bytes: b.length, gpuBytes: width * height * 4 * 4 / 3 };
}

function validateCatalogue(catalogue) {
  check(catalogue.version === 1 && catalogue.units === 'm' && Array.isArray(catalogue.assets) && catalogue.assets.length > 0, 'catalogue requires version1, metre units and asset list');
  const entries = new Map();
  for (const item of catalogue.assets) {
    check(/^substation_[a-z0-9_]+$/.test(item.id) && !item.id.endsWith('_lod1') && !entries.has(item.id), 'invalid/duplicate catalogue id');
    check(positive(item.size, 3) && typeof item.family === 'string' && item.family.length, `${item.id}: missing metre size/family`);
    check(Array.isArray(item.features) && item.features.length > 0 && item.features.every((v) => typeof v === 'string'), `${item.id}: features required`);
    check(item.anchors && typeof item.anchors === 'object', `${item.id}: named anchors required`);
    const anchors = item.anchors;
    for (const group of ['lamps', 'hinges']) {
      check(Array.isArray(anchors[group]), `${item.id}: explicit ${group} anchors required (empty when inapplicable)`);
      for (const anchor of anchors[group]) check(typeof anchor.name === 'string' && vector(anchor.position, 3), `${item.id}: invalid ${group} anchor`);
    }
    if (anchors.hum != null) check(vector(anchors.hum.position, 3) && anchors.hum.frequencyHz === 100, `${item.id}: hum anchor must be 100 Hz`);
    if (/^substation_transformer_(132_33|33_11)$/.test(item.id)) check(anchors.hum != null, `${item.id}: transformer hum anchor required`);
    check(Array.isArray(item.keepOut) && item.keepOut.length >= 3 && item.keepOut.every((v) => vector(v, 2)), `${item.id}: nav keepOut polygon required`);
    const area = item.keepOut.reduce((sum, a, i, points) => { const b = points[(i + 1) % points.length]; return sum + a[0] * b[1] - a[1] * b[0]; }, 0);
    check(Math.abs(area) > 0.000001, `${item.id}: collapsed nav keepOut polygon`);
    entries.set(item.id, item);
  }
  return entries;
}

/** Structural and approximate spatial checks for this visual yard. These are
 * authoring consistency checks, not electrical, fire, earthing or civil design. */
export function validatePlan(plan, catalogueAssets) {
  check(plan.version === 1 && plan.units === 'm', 'yard plan must use metres and version1');
  check(eq(plan.origin, [0, 0, 0], 1e-10), 'yard origin must be the compound centre');
  check(typeof plan.certification === 'string' && /plausible/i.test(plan.certification) && /not engineering.certified/i.test(plan.certification), 'yard plan must disclose plausible, not engineering-certified clearances');
  check(plan.compound?.width === 55 && plan.compound.depth === 40 && eq(plan.compound.bounds?.[0], [-27.5, -20]) && eq(plan.compound.bounds?.[1], [27.5, 20]), 'yard compound must be centred 55 by 40 metres');
  const entries = catalogueAssets instanceof Map ? catalogueAssets : new Map(catalogueAssets.map((item) => [item.id, item]));
  const [low, high] = plan.compound.bounds;
  const inYard = (point, allowance = 0.001) => point[0] >= low[0] - allowance && point[0] <= high[0] + allowance && point[1] >= low[1] - allowance && point[1] <= high[1] + allowance;
  const unique = new Set(), equipment = new Map();
  const position = (item, external = false) => {
    check(typeof item.id === 'string' && item.id.length && !unique.has(item.id), 'yard equipment IDs must be unique'); unique.add(item.id);
    check(entries.has(item.asset), `${item.id}: unknown catalogue asset '${item.asset}'`);
    check(vector(item.position, 3) && Number.isFinite(item.rotationY) && Math.abs(item.rotationY) <= Math.PI * 2 + 0.001, `${item.id}: finite metre position/radian rotation required`);
    check(item.position[1] >= 0 && item.position[1] <= 50, `${item.id}: invalid placement height`);
    check(Array.isArray(item.tags) && item.tags.every((tag) => typeof tag === 'string'), `${item.id}: explicit tags required`);
    if (!external) check(inYard([item.position[0], item.position[2]]), `${item.id}: equipment centre lies outside compound`);
    else check(item.external === true && !inYard([item.position[0], item.position[2]]) && /tower_(suspension|terminal)_132$/.test(item.asset), `${item.id}: external tower must be declared outside compound`);
    equipment.set(item.id, item);
  };
  check(Array.isArray(plan.equipment) && plan.equipment.length > 0 && Array.isArray(plan.towers) && plan.towers.length === 2, 'yard requires equipment and two external line towers');
  for (const item of plan.equipment) position(item);
  for (const item of plan.towers) position(item, true);
  check(plan.towers.some((item) => item.tags.includes('incoming')) && plan.towers.some((item) => item.tags.includes('outgoing')), 'incoming and outgoing tower roles required');
  const count = (asset) => plan.equipment.filter((item) => item.asset === 'substation_' + asset).length;
  check(count('transformer_132_33') === 2 && count('transformer_33_11') === 2, 'yard requires two 40 MVA 132/33 and two 15 MVA 33/11 transformers');
  check(count('switchboard_panel_11') === 12 && plan.building?.panels === 12, 'indoor switchboard must have twelve panels');
  check(count('bund_large') === 2 && count('bund_small') === 2 && count('firewall') >= 1, 'four transformer bunds and separating firewall required');
  check(count('control_panel') >= 1 && count('battery_bank') >= 1 && count('battery_charger') >= 1 && count('oil_store') === 1 && count('floodlight_mast') >= 2 && count('lightning_mast') >= 1, 'yard/control-room service equipment incomplete');
  for (const transformer of plan.equipment.filter((item) => /^substation_transformer_/.test(item.asset))) {
    const bund = equipment.get('BUND-' + transformer.id), cat = entries.get(transformer.asset), bundCat = bund && entries.get(bund.asset);
    check(bund && bundCat && eq([transformer.position[0], transformer.position[2]], [bund.position[0], bund.position[2]], 0.01), `${transformer.id}: matching centred oil bund required`);
    check(bundCat.size[0] >= cat.size[0] + 0.8 && bundCat.size[2] >= cat.size[2] + 0.8, `${transformer.id}: bund must contain transformer footprint with a visible margin`);
  }
  const clear = plan.clearances;
  check(clear && clear.phaseSpacing132 >= 2.5 && clear.phaseSpacing33 >= 1.0 && clear.minimumLiveHeightAtPerimeter >= 4 && clear.liveEquipmentSetbackFromFence >= 3 && clear.serviceAisleWidth >= 3, 'plausible visual phase/perimeter/service clearance metadata required');
  for (const item of plan.equipment.filter((item) => item.tags.includes('live'))) {
    const [x, y, z] = item.position, distance = Math.min(x - low[0], high[0] - x, z - low[1], high[1] - z);
    if (distance < clear.liveEquipmentSetbackFromFence) check(y + entries.get(item.asset).size[1] >= clear.minimumLiveHeightAtPerimeter, `${item.id}: live equipment near fence is below declared out-of-reach height`);
  }
  const phaseGroups = new Map();
  for (const item of plan.equipment.filter((item) => item.phase != null)) {
    check(['A', 'B', 'C'].includes(item.phase) && item.id.endsWith('-' + item.phase), `${item.id}: phase identity is inconsistent`);
    const group = item.id.slice(0, -2);
    if (!phaseGroups.has(group)) phaseGroups.set(group, []);
    phaseGroups.get(group).push(item);
  }
  for (const [name, group] of phaseGroups) {
    check(group.length === 3 && new Set(group.map((item) => item.phase)).size === 3, `${name}: three distinct phase placements required`);
    const required = /132/.test(group[0].asset) ? clear.phaseSpacing132 : clear.phaseSpacing33;
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) check(Math.hypot(group[i].position[0] - group[j].position[0], group[i].position[2] - group[j].position[2]) >= required - 0.01, `${name}: actual phase spacing is below declared visual clearance`);
  }
  check(Array.isArray(plan.bays) && plan.bays.length >= 4, 'four outdoor bays required');
  const bayIds = new Set();
  for (const bay of plan.bays) {
    check(typeof bay.id === 'string' && !bayIds.has(bay.id) && vector(bay.centre, 2) && inYard(bay.centre), 'invalid/duplicate bay'); bayIds.add(bay.id);
    check([132, 33].includes(bay.voltageKV) && Number.isFinite(bay.phaseSpacing) && bay.phaseSpacing >= (bay.voltageKV === 132 ? 2.5 : 1), `${bay.id}: invalid phase spacing`);
  }
  const line = (points, label) => {
    check(Array.isArray(points) && points.length >= 2 && points.every((point) => vector(point, 2) && inYard(point)), `${label}: invalid/out-of-yard polyline`);
    for (let i = 1; i < points.length; i++) check(Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]) > 0.01, `${label}: collapsed segment`);
  };
  check(Array.isArray(plan.trenches) && plan.trenches.length >= 2, 'cable trench data required');
  for (const trench of plan.trenches) { line(trench.polyline, trench.id); check(trench.width >= 0.4 && trench.width <= 2 && trench.depth >= 0.3 && trench.depth <= 2, `${trench.id}: implausible trench section`); }
  line(plan.fence?.polyline, 'fence');
  check(plan.fence.polyline.length >= 5 && eq(plan.fence.polyline[0], plan.fence.polyline.at(-1)) && plan.fence.height >= 2.4, 'fence requires a closed compound perimeter at least 2.4 m high');
  const [from, to] = [plan.fence.gateGap?.fromPoint, plan.fence.gateGap?.toPoint];
  check(vector(from, 2) && vector(to, 2) && inYard(from) && inYard(to), 'fence gate gap requires endpoints');
  const gate = equipment.get(plan.gate?.id);
  check(gate && gate.asset === 'substation_gate' && eq(gate.position, plan.gate.position) && Math.abs(Math.hypot(to[0] - from[0], to[1] - from[1]) - plan.gate.width) < 0.01, 'gate record and fence gap must match');
  check(eq([gate.position[0], gate.position[2]], [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]), 'gate must be centred in the fence gap');
  check((Math.abs(from[0] - to[0]) < 0.001 && (Math.abs(from[0] - low[0]) < 0.001 || Math.abs(from[0] - high[0]) < 0.001))
    || (Math.abs(from[1] - to[1]) < 0.001 && (Math.abs(from[1] - low[1]) < 0.001 || Math.abs(from[1] - high[1]) < 0.001)), 'gate gap must lie on compound boundary');
  const spanIds = new Set(); let conductorInstances = 0;
  check(Array.isArray(plan.spans) && plan.spans.length >= 6 && plan.spans.length <= 256, 'bounded incoming/outgoing catenary recipe data required');
  for (const span of plan.spans) {
    check(typeof span.id === 'string' && !spanIds.has(span.id), 'duplicate/missing conductor span id'); spanIds.add(span.id);
    check([132, 33, 11].includes(span.voltageKV), `${span.id}: unknown span voltage`);
    const curve = solveCatenary(span), instances = catenaryInstances(span); conductorInstances += instances.instances.length;
    for (const axis of [0, 2]) for (const boundary of [low[axis === 0 ? 0 : 1], high[axis === 0 ? 0 : 1]]) {
      const delta = span.end[axis] - span.start[axis]; if (Math.abs(delta) < 1e-8) continue;
      const t = (boundary - span.start[axis]) / delta;
      if (t <= 0 || t >= 1) continue;
      const p = curve.pointAt(t), other = axis === 0 ? p[2] : p[0], minOther = low[axis === 0 ? 1 : 0], maxOther = high[axis === 0 ? 1 : 0];
      if (other >= minOther && other <= maxOther) check(p[1] >= clear.minimumLiveHeightAtPerimeter, `${span.id}: conductor is below declared visual clearance height at fence crossing`);
    }
  }
  return { equipment: plan.equipment.length, towers: plan.towers.length, spans: plan.spans.length, conductorInstances };
}

/** Complete mode requires every authored item, LOD, texture and yard-data file.
 * Model and texture totals include undeclared/stale files; nothing is hidden by
 * omitting it from a manifest. The game manifest must not load this library. */
export function validateSubstation({ projectRoot = ROOT, models: modelOverride, complete = false } = {}) {
  const models = modelOverride ? resolve(modelOverride) : resolve(projectRoot, 'assets/models');
  const manifestPath = resolve(models, 'manifest.substation.json'), library = resolve(models, 'substation');
  const report = { ok: false, complete, baseAssets: 0, lodAssets: 0, modelBytes: 0, textureBytes: 0, gpuBytes: 0, maxTriangles: 0, maxLodRatio: 0, sharedMeshAliases: 0, assets: [], textures: [], errors: [] };
  const capture = (name, fn) => { try { return fn(); } catch (e) { report.errors.push(`${name}: ${e.message}`); return null; } };
  const manifest = capture('manifest', () => jsonFile(manifestPath));
  const catalogue = capture('catalogue', () => jsonFile(resolve(projectRoot, 'tools/blender/substation.catalog.json')));
  const entries = catalogue && capture('catalogue', () => validateCatalogue(catalogue));
  const materials = capture('materials', () => jsonFile(resolve(library, 'materials.json')));
  if (!manifest || !entries || !materials) return report;
  capture('manifest', () => {
    check(manifest.version === 1 && manifest.license === 'CC0-1.0', 'version1 and original CC0-1.0 license required');
    check(!complete || manifest.complete === true, 'complete flag missing');
    check(Array.isArray(manifest.files) && manifest.files.length > 0, 'no generated GLB files');
  });
  capture('materials', () => {
    check(materials.version === 1 && materials.materials && materials.atlas?.tiles, 'material definitions and shared atlas tiles required');
    for (const [name, def] of Object.entries(materials.materials)) {
      check(/^substation_[a-z0-9_]+$/.test(name), `invalid material '${name}'`);
      const tile = materials.atlas.tiles[def.tile ?? name];
      check(vector(tile, 4) && tile.every((v) => v >= 0 && v <= 1) && tile[0] < tile[2] && tile[1] < tile[3], `${name}: missing/invalid tile`);
    }
  });
  const declared = new Set([resolve(library, 'materials.json'), resolve(library, 'substation-plan.json')]);
  const measured = new Map(), metadata = new Map();
  for (const file of Array.isArray(manifest.files) ? manifest.files : []) capture(file.glb ?? 'GLB', () => {
    check(typeof file.glb === 'string' && /^substation\/[a-zA-Z0-9_-]+\.glb$/.test(file.glb), 'GLB path must be within substation/');
    const path = contained(models, file.glb, 'GLB'); check(!declared.has(path), 'duplicate GLB'); declared.add(path);
    const input = readFileSync(path), actual = inspectGlb(path, materials);
    check(file.bytes === actual.bytes, 'declared byte count differs from file');
    check(typeof file.sha256 === 'string' && file.sha256 === hash(input), 'SHA-256 differs from file');
    if (file.sharedMeshAliases != null) check(file.sharedMeshAliases === actual.sharedMeshAliases, 'shared mesh count differs from decoded GLB');
    report.sharedMeshAliases += actual.sharedMeshAliases;
    check(file.assets && typeof file.assets === 'object' && !Array.isArray(file.assets), 'assets must be a keyed object');
    const names = Object.keys(file.assets);
    check(names.length === actual.assets.size && names.every((key) => actual.assets.has(key)), 'GLB root coverage differs from manifest');
    for (const [key, meta] of Object.entries(file.assets)) {
      const far = key.endsWith('_lod1'), base = far ? key.slice(0, -5) : key, cat = entries.get(base), asset = actual.assets.get(key);
      check(cat && !metadata.has(key) && meta.node === key, `${key}: unknown/duplicate catalogue key or mismatched node`);
      check(eq(meta.size, cat.size, 1e-8) && eq(meta.footprint, [cat.size[0], cat.size[2]], 1e-8), `${key}: metre size/footprint differs from catalogue`);
      check(meta.triangles === asset.triangles && meta.parts === asset.parts, `${key}: triangle/part metadata differs from decoded GLB`);
      check(eq(meta.bounds?.min, asset.min) && eq(meta.bounds?.max, asset.max), `${key}: bounds differ from binary geometry`);
      const [w, h, d] = cat.size, minimum = [-w / 2, 0, -d / 2], maximum = [w / 2, h, d / 2];
      check(asset.min.every((v, k) => v >= minimum[k] - 0.02) && asset.max.every((v, k) => v <= maximum[k] + 0.02), `${key}: binary geometry exceeds metre catalogue envelope`);
      check(Math.abs(asset.min[1]) <= 0.02, `${key}: base must be at Y=0`);
      check(asset.size.every((v, k) => v >= cat.size[k] * 0.25), `${key}: geometry collapsed relative to metre catalogue size`);
      const limit = base === 'substation_transformer_132_33' ? MAX_TRANSFORMER_TRIANGLES : MAX_NEAR_TRIANGLES;
      check(asset.triangles <= limit, `${key}: triangle cap ${limit} exceeded by ${asset.triangles}`);
      if (far) report.lodAssets++; else { report.baseAssets++; report.maxTriangles = Math.max(report.maxTriangles, asset.triangles); }
      metadata.set(key, meta); measured.set(key, asset); report.assets.push({ key, ...asset });
    }
  });
  for (const [key, meta] of metadata) if (!key.endsWith('_lod1')) capture(key, () => {
    check(meta.lod1 === key + '_lod1' && metadata.has(meta.lod1), 'missing explicit LOD1');
    const near = measured.get(key), far = measured.get(meta.lod1), ratio = far.triangles / near.triangles;
    report.maxLodRatio = Math.max(report.maxLodRatio, ratio);
    check(ratio <= MAX_LOD_RATIO + 1e-12, `LOD1 ${far.triangles} exceeds40% of near ${near.triangles}`);
  });
  if (complete) capture('complete catalogue', () => {
    check(REQUIRED_KEYS.every((key) => entries.has(key)), `catalogue is missing mandatory equipment: ${REQUIRED_KEYS.filter((key) => !entries.has(key)).join(', ')}`);
    const missing = [...entries.keys()].filter((id) => !metadata.has(id) || !metadata.has(id + '_lod1'));
    check(missing.length === 0, `missing required near/LOD roots: ${missing.join(', ')}`);
    check(report.baseAssets === entries.size && report.lodAssets === entries.size, 'complete near/LOD count mismatch');
    check(report.sharedMeshAliases > 0, 'repeated component geometry must share actual mesh buffers');
  });
  const textures = resolve(projectRoot, 'assets/textures/substation'), declaredTextures = new Set();
  for (const channel of ['map', 'normal', 'orm']) capture(`atlas ${channel}`, () => {
    const rel = materials.atlas[channel];
    check(typeof rel === 'string' && /^\.\.\/\.\.\/textures\/substation\/[a-zA-Z0-9_-]+\.png$/.test(rel), 'atlas path must name shared substation PNG');
    const path = contained(textures, rel.split('/').at(-1), 'atlas');
    check(!declaredTextures.has(path), 'PBR channels require distinct image payloads'); declaredTextures.add(path);
    const info = inspectPng(readFileSync(path), channel === 'map' ? 2048 : 1024); report.gpuBytes += info.gpuBytes; report.textures.push({ channel, ...info });
  });
  if (complete) capture('offline isolation', () => {
    const runtime = jsonFile(resolve(projectRoot, 'assets/models/manifest.json'));
    check(!JSON.stringify(runtime).includes('substation'), 'substation must not be registered in boot manifest');
    const textureManifest = jsonFile(resolve(projectRoot, 'assets/textures/manifest.json'));
    check(!JSON.stringify(textureManifest).includes('substation'), 'substation atlas must not be registered for boot');
    for (const path of filesBelow(resolve(projectRoot, 'js')).filter((path) => extname(path) === '.js')) check(!/substation(?:[\/_.-]|["'])/i.test(readFileSync(path, 'utf8')), `substation must not be imported by production code: ${relative(projectRoot, path)}`);
  });
  if (complete) capture('yard plan', () => {
    const plan = jsonFile(resolve(library, 'substation-plan.json'));
    report.plan = validatePlan(plan, entries);
  });
  capture('model payload', () => {
    const files = filesBelow(library); report.modelBytes = statSync(manifestPath).size + files.reduce((sum, path) => sum + statSync(path).size, 0);
    check(report.modelBytes <= MAX_MODEL_BYTES, `model payload ${report.modelBytes} exceeds ${MAX_MODEL_BYTES} bytes`);
    for (const path of files) check(declared.has(path), `unregistered/stale model payload '${relative(models, path)}'`);
  });
  capture('texture payload', () => {
    const files = filesBelow(textures); report.textureBytes = files.reduce((sum, path) => sum + statSync(path).size, 0);
    check(report.textureBytes <= MAX_TEXTURE_BYTES, `texture payload ${report.textureBytes} exceeds ${MAX_TEXTURE_BYTES} bytes`);
    for (const path of files) check(declaredTextures.has(path), `unregistered/stale texture '${relative(textures, path)}'`);
    check(report.gpuBytes <= MAX_GPU_BYTES, `texture GPU memory ${Math.ceil(report.gpuBytes)} exceeds ${MAX_GPU_BYTES} bytes`);
  });
  report.ok = report.errors.length === 0; return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = { complete: args.includes('--complete') };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root') options.projectRoot = resolve(args[++i]);
    else if (args[i] === '--models') options.models = resolve(args[++i]);
    else if (!['--complete', '--json'].includes(args[i])) { console.error(`unknown option: ${args[i]}`); process.exit(2); }
  }
  const report = validateSubstation(options);
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`substation: ${report.baseAssets} near + ${report.lodAssets} LOD1 (${report.complete ? 'complete' : 'partial'})`);
    console.log(`models: ${report.modelBytes.toLocaleString('en-US')} / ${MAX_MODEL_BYTES.toLocaleString('en-US')} bytes; textures: ${report.textureBytes.toLocaleString('en-US')} / ${MAX_TEXTURE_BYTES.toLocaleString('en-US')} bytes`);
    console.log(`texture GPU RGBA+mips: ${Math.ceil(report.gpuBytes).toLocaleString('en-US')} / ${MAX_GPU_BYTES.toLocaleString('en-US')} bytes; max near: ${report.maxTriangles}; max LOD ratio: ${(report.maxLodRatio * 100).toFixed(2)}%`);
    if (report.ok) console.log('PASS: binary geometry, metre bounds, catalogue, LODs, atlas, payload and offline isolation.');
    else for (const error of report.errors) console.error(`FAIL: ${error}`);
  }
  process.exitCode = report.ok ? 0 : 1;
}
