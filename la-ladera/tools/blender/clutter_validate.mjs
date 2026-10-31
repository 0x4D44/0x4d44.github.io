// Validate the files, binary geometry and runtime contract of the street-clutter library.
// No Blender, npm install or WebGL needed: node la-ladera/tools/blender/clutter_validate.mjs --complete
import '../../tests/nice.mjs';
import { readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { readGlb } from './glb_info.mjs';
import engine from '../../js/engine/matdefs.js';
import world from '../../js/world/matdefs.js';
import arch from '../../js/arch/matdefs.js';
import interiors from '../../js/interiors/matdefs.js';
import people from '../../js/people/matdefs.js';

export const REQUIRED_KEYS = Object.freeze([
  'clutter_pole_concrete', 'clutter_pole_wood', 'clutter_tank_black', 'clutter_tank_blue',
  'clutter_dish', 'clutter_washing_line', 'clutter_bin_wheelie', 'clutter_bin_metal',
  'clutter_crate_wood', 'clutter_crate_plastic', 'clutter_tyre', 'clutter_cone',
  'clutter_shrine', 'clutter_umbrella', 'clutter_chair', 'clutter_shutter',
  'clutter_sign', 'clutter_gas_cylinder', 'clutter_helmet',
]);
export const MAX_BYTES = 2_000_000;
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFS = { ...engine, ...world, ...arch, ...interiors, ...people };
// These are visual catalogue contracts, independent of the Blender UV conversion.
// The TextureLoader-backed runtime expects bottom-origin UVs, including an upright decal.
export const DECAL_TILES = Object.freeze({
  clutter_bin_wheelie: 'no_basura', clutter_shutter: 'graffiti_barrio', clutter_sign: 'tienda_sign',
});
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const READERS = {
  5120: [1, 'readInt8', 127], 5121: [1, 'readUInt8', 255],
  5122: [2, 'readInt16LE', 32767], 5123: [2, 'readUInt16LE', 65535],
  5125: [4, 'readUInt32LE', 4294967295], 5126: [4, 'readFloatLE', 1],
};
const check = (condition, message) => { if (!condition) throw new Error(message); };
const finiteArray = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
const natural = (x) => Number.isInteger(x) && x >= 0;
const positive = (a, n) => finiteArray(a, n) && a.every((v) => v > 0);
const eq = (a, b, tolerance = 0.002) => finiteArray(a, b.length) && a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
const triangleLimit = (key) => /^clutter_(pole|tank)_/.test(key) ? 900 : 500;
const mul = (a, b) => {
  const out = Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
};
function matrix(n) {
  if (n.matrix) { check(finiteArray(n.matrix, 16), 'non-finite node matrix'); return n.matrix; }
  const rotation = n.rotation ?? [0, 0, 0, 1], scale = n.scale ?? [1, 1, 1], translation = n.translation ?? [0, 0, 0];
  check(finiteArray(rotation, 4) && finiteArray(scale, 3) && finiteArray(translation, 3), 'invalid node transform');
  check(Math.abs(Math.hypot(...rotation) - 1) < 0.001 && scale.every((v) => v > 0), 'invalid rotation or non-positive scale');
  const [x, y, z, w] = rotation, [sx, sy, sz] = scale, [tx, ty, tz] = translation;
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
const transform = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];

// A path is not allowed to escape its directory, including through a symlink.
function contained(root, rel, label) {
  check(typeof rel === 'string' && rel.length && !rel.includes('\\') && !isAbsolute(rel), `${label}: expected a relative path`);
  const target = resolve(root, rel), r = relative(root, target);
  check(r && !r.startsWith('..' + sep) && r !== '..' && !isAbsolute(r), `${label}: path escapes its directory`);
  const actual = realpathSync(target), rr = relative(realpathSync(root), actual);
  check(rr && !rr.startsWith('..' + sep) && rr !== '..' && !isAbsolute(rr), `${label}: symlink escapes its directory`);
  check(statSync(target).isFile(), `${label}: not a file`);
  return target;
}

function envelope(buf) {
  check(buf.length >= 28 && buf.readUInt32LE(0) === 0x46546c67, 'not a GLB');
  check(buf.readUInt32LE(4) === 2, 'GLB must be version 2');
  check(buf.readUInt32LE(8) === buf.length, 'GLB declared length does not match file');
  const types = []; let offset = 12;
  while (offset < buf.length) {
    check(offset + 8 <= buf.length, 'truncated GLB chunk header');
    const length = buf.readUInt32LE(offset), type = buf.readUInt32LE(offset + 4);
    check(length % 4 === 0 && offset + 8 + length <= buf.length, 'truncated or unaligned GLB chunk');
    types.push(type); offset += 8 + length;
  }
  check(types.length === 2 && types[0] === 0x4e4f534a && types[1] === 0x004e4942, 'expected exactly JSON and binary GLB chunks');
}

/** Independently read actual binary vertices/indices; accessor min/max is checked, never trusted for bounds. */
export function inspectGlb(path, defs = DEFS) {
  const buf = readFileSync(path); envelope(buf);
  const { json: g, bin } = readGlb(path);
  check(g.asset?.version === '2.0', 'glTF asset.version must be 2.0');
  check(!g.images?.length && !g.textures?.length && !g.samplers?.length, 'GLB must contain no images, textures or samplers');
  check(!g.animations?.length && !g.skins?.length, 'clutter must be static and unskinned');
  check(!g.extensionsRequired?.length, 'clutter must load without extension decoders');
  check(g.buffers?.length === 1 && !g.buffers[0].uri, 'GLB must use one embedded geometry buffer, never external/data URIs');
  check(natural(g.buffers[0].byteLength) && g.buffers[0].byteLength > 0 && g.buffers[0].byteLength <= bin.length && bin.length - g.buffers[0].byteLength < 4, 'invalid binary buffer length');
  const dataLimit = g.buffers[0].byteLength;
  const nodes = g.nodes ?? [], names = new Set(), accessors = new Map(), assets = new Map();
  for (const m of g.materials ?? []) {
    check(typeof m.name === 'string' && Object.hasOwn(defs, m.name) && m.name !== 'missing_asset', `unknown library material '${m.name}'`);
    check(!/"[^"]*Texture"\s*:/.test(JSON.stringify(m)), `material '${m.name}' embeds a texture reference`);
  }
  for (const bv of g.bufferViews ?? []) {
    const start = bv.byteOffset ?? 0;
    check(bv.buffer === 0 && natural(start) && natural(bv.byteLength) && start + bv.byteLength <= dataLimit, 'bufferView lies outside binary buffer');
  }
  const accessor = (index, type, attribute) => {
    const a = g.accessors?.[index];
    check(natural(index) && a, `${attribute}: missing accessor`);
    check(a.type === type && !a.sparse, `${attribute}: unsupported accessor type or sparse data`);
    check(natural(a.count) && a.count > 0, `${attribute}: empty or invalid count`);
    const reader = READERS[a.componentType], components = COMPONENTS[a.type], bv = g.bufferViews?.[a.bufferView];
    check(reader && bv, `${attribute}: invalid component or bufferView`);
    const [width, method, denom] = reader, bytes = width * components, stride = bv.byteStride ?? bytes, start = a.byteOffset ?? 0;
    check(natural(start) && start % width === 0 && natural(stride) && stride >= bytes && stride % width === 0, `${attribute}: invalid stride or offset`);
    check(start + (a.count - 1) * stride + bytes <= bv.byteLength, `${attribute}: accessor exceeds bufferView`);
    if (accessors.has(index)) return accessors.get(index);
    const values = Array.from({ length: a.count }, (_, i) => Array.from({ length: components }, (_, k) => {
      const v = bin[method]((bv.byteOffset ?? 0) + start + i * stride + k * width);
      check(Number.isFinite(v), `${attribute}: non-finite binary value`);
      return a.normalized ? Math.max(-1, v / denom) : v;
    }));
    if (a.min || a.max) {
      const min = Array.from({ length: components }, (_, k) => Math.min(...values.map((v) => v[k])));
      const max = Array.from({ length: components }, (_, k) => Math.max(...values.map((v) => v[k])));
      check(eq(a.min, min, 0.0001) && eq(a.max, max, 0.0001), `${attribute}: accessor min/max differs from binary data`);
    }
    accessors.set(index, values); return values;
  };
  const visited = new Set();
  const visit = (index, parent, asset, stack) => {
    check(natural(index) && nodes[index], 'invalid child node index');
    check(!stack.has(index), 'cyclic GLB node hierarchy');
    check(!visited.has(index), 'mesh nodes must belong to exactly one asset');
    visited.add(index); const n = nodes[index];
    check(n.skin == null && !n.weights, 'clutter node has skin or morph weights');
    const m = mul(parent, matrix(n)), chain = new Set(stack); chain.add(index);
    if (n.mesh != null) {
      const mesh = g.meshes?.[n.mesh]; check(mesh?.primitives?.length, 'missing or empty mesh');
      check(!mesh.weights, 'clutter mesh has morph weights');
      for (const p of mesh.primitives) {
        check((p.mode ?? 4) === 4 && !p.targets?.length, 'mesh must contain rigid triangles');
        check(!p.extensions || Object.keys(p.extensions).length === 0, 'geometry extensions are not supported');
        const mat = g.materials?.[p.material]; check(mat, 'primitive needs a named library material');
        const attr = p.attributes ?? {}, pos = accessor(attr.POSITION, 'VEC3', 'POSITION');
        check(g.accessors[attr.POSITION].componentType === 5126, 'POSITION must be unquantized FLOAT');
        const nor = accessor(attr.NORMAL, 'VEC3', 'NORMAL'), uv = accessor(attr.TEXCOORD_0, 'VEC2', 'TEXCOORD_0');
        check(nor.length === pos.length && uv.length === pos.length, 'attribute vertex counts disagree');
        check(nor.every((n) => Math.abs(Math.hypot(...n) - 1) < 0.025), 'normal is not a unit vector');
        if (attr.COLOR_0 != null) {
          const a = g.accessors[attr.COLOR_0]; check(a?.type === 'VEC3' || a?.type === 'VEC4', 'COLOR_0 must be VEC3/VEC4');
          const col = accessor(attr.COLOR_0, a.type, 'COLOR_0');
          check(col.length === pos.length && col.every((v) => v.every((c) => c >= 0 && c <= 1.00001)), 'invalid vertex colours');
        }
        check(!('JOINTS_0' in attr) && !('WEIGHTS_0' in attr), 'skinned attributes are forbidden');
        let indices;
        if (p.indices != null) {
          const a = g.accessors[p.indices];
          check(a && [5121, 5123, 5125].includes(a.componentType) && !a.normalized, 'invalid triangle index component');
          indices = accessor(p.indices, 'SCALAR', 'indices').map((v) => v[0]);
        } else indices = pos.map((_, i) => i);
        check(indices.length % 3 === 0 && indices.length > 0, 'triangle index count must be divisible by three');
        check(indices.every((v) => natural(v) && v < pos.length), 'triangle index outside POSITION accessor');
        const points = pos.map((v) => transform(m, v));
        for (let i = 0; i < indices.length; i += 3) {
          const [a, b, c] = indices.slice(i, i + 3).map((j) => points[j]);
          const u = b.map((v, k) => v - a[k]), v = c.map((x, k) => x - a[k]);
          const area = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
          check(area > 1e-12, 'degenerate triangle');
        }
        for (const j of new Set(indices)) for (let k = 0; k < 3; k++) {
          asset.min[k] = Math.min(asset.min[k], points[j][k]); asset.max[k] = Math.max(asset.max[k], points[j][k]);
        }
        if (mat.name === 'clutter_decal') {
          check(uv.every((u) => u.every((v) => v >= -0.00001 && v <= 1.00001)), 'atlas UVs must be in 0..1');
          const u0 = Math.min(...uv.map((u) => u[0])), v0 = Math.min(...uv.map((u) => u[1]));
          const u1 = Math.max(...uv.map((u) => u[0])), v1 = Math.max(...uv.map((u) => u[1]));
          const y0 = Math.min(...points.map((p) => p[1])), y1 = Math.max(...points.map((p) => p[1]));
          const upright = y1 - y0 > 0.01 && points.every((p, i) =>
            (Math.abs(p[1] - y0) > 0.00001 || Math.abs(uv[i][1] - v0) < 0.00001)
            && (Math.abs(p[1] - y1) > 0.00001 || Math.abs(uv[i][1] - v1) < 0.00001));
          asset.decals.push({ uv: [u0, v0, u1, v1], upright });
        }
        asset.triangles += indices.length / 3; asset.parts++;
        asset.materials.add(mat.name);
      }
    }
    for (const c of n.children ?? []) visit(c, m, asset, chain);
  };
  check(g.scenes?.length === 1 && (g.scene ?? 0) === 0, 'expected one default scene');
  for (const index of g.scenes[0].nodes ?? []) {
    const n = nodes[index]; check(n?.name && !names.has(n.name), 'asset roots need unique catalogue names');
    names.add(n.name); check(eq(matrix(n), I, 0.00001), `${n.name}: root transform must be identity`);
    const asset = { name: n.name, triangles: 0, parts: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], materials: new Set(), decals: [] };
    visit(index, I, asset, new Set());
    check(asset.triangles > 0 && asset.parts <= 8, `${n.name}: empty asset or more than eight material parts`);
    asset.size = asset.max.map((v, i) => v - asset.min[i]); asset.materials = [...asset.materials];
    assets.set(n.name, asset);
  }
  check(assets.size > 0 && visited.size === nodes.length, 'empty scene or orphan GLB nodes');
  return { bytes: buf.length, assets };
}

function listFiles(dir) {
  let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  return entries.flatMap((e) => e.isDirectory() ? listFiles(resolve(dir, e.name)) : [resolve(dir, e.name)]);
}
const jsonFile = (p) => JSON.parse(readFileSync(p, 'utf8'));

function pngSize(png) {
  check(png.length >= 45 && png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'invalid PNG atlas');
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (data) => { let c = 0xffffffff; for (const b of data) c = table[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const compressed = []; let offset = 8, header = null, ended = false;
  while (offset < png.length) {
    check(offset + 12 <= png.length, 'truncated PNG chunk');
    const length = png.readUInt32BE(offset), end = offset + 8 + length, type = png.toString('ascii', offset + 4, offset + 8);
    check(end + 4 <= png.length, 'truncated PNG payload');
    check(crc(png.subarray(offset + 4, end)) === png.readUInt32BE(end), `invalid PNG ${type} CRC`);
    if (!header) { check(type === 'IHDR' && length === 13, 'PNG must start with IHDR'); header = png.subarray(offset + 8, end); }
    else check(type !== 'IHDR', 'duplicate PNG IHDR');
    if (type === 'IDAT') compressed.push(png.subarray(offset + 8, end));
    if (type === 'IEND') { check(length === 0 && end + 4 === png.length, 'PNG has data after IEND'); ended = true; }
    offset = end + 4;
  }
  check(ended && compressed.length, 'PNG has no image data or IEND');
  const width = header.readUInt32BE(0), height = header.readUInt32BE(4), channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[header[9]];
  check(width === 1024 && height === 512 && header[8] === 8 && channels && header[10] === 0 && header[11] === 0 && header[12] === 0, 'atlas must be 1024 x 512 non-interlaced 8-bit PNG');
  const stride = width * channels + 1, raster = inflateSync(Buffer.concat(compressed), { maxOutputLength: stride * height });
  check(raster.length === stride * height, 'PNG decoded raster size mismatch');
  for (let y = 0; y < height; y++) check(raster[y * stride] <= 4, 'invalid PNG row filter');
  return [width, height];
}

/** Returns a serializable report. The default permits an intentionally partial library; --complete requires all 19 families and runtime registration. */
export function validateClutter({ projectRoot = ROOT, complete = false } = {}) {
  const models = resolve(projectRoot, 'assets/models'), manifestPath = resolve(models, 'manifest.clutter.json');
  const report = { complete, ok: false, bytes: 0, limitBytes: MAX_BYTES, baseAssets: 0, lodAssets: 0, assets: [], errors: [] };
  const capture = (label, fn) => { try { return fn(); } catch (e) { report.errors.push(`${label}: ${e.message}`); return null; } };
  const manifest = capture('manifest.clutter.json', () => jsonFile(manifestPath));
  if (!manifest) return report;
  report.bytes = statSync(manifestPath).size;
  const entries = new Map(), measured = new Map(), declaredFiles = new Set(), bytesFiles = new Set([manifestPath]);
  capture('manifest', () => {
    check(manifest.version === 1, 'unsupported version');
    check(manifest.license === 'CC0-1.0', 'expected original CC0-1.0 asset license');
    check(Array.isArray(manifest.files) && manifest.files.length > 0, 'no generated GLB files declared');
  });
  for (const file of Array.isArray(manifest.files) ? manifest.files : []) capture(file.glb ?? 'file', () => {
    check(typeof file.glb === 'string' && file.glb.startsWith('clutter/') && extname(file.glb) === '.glb', 'GLB must be under clutter/');
    const path = contained(models, file.glb, 'GLB'); check(!declaredFiles.has(path), 'duplicate GLB file'); declaredFiles.add(path);
    bytesFiles.add(path);
    const info = inspectGlb(path); const names = new Set();
    check(file.assets && typeof file.assets === 'object' && !Array.isArray(file.assets), 'assets must be a keyed object');
    for (const [key, meta] of Object.entries(file.assets)) {
      check(/^clutter_[a-z0-9_]+$/.test(key) && !entries.has(key), `invalid or duplicate catalogue key '${key}'`);
      check(meta && typeof meta === 'object' && meta.node === key, `${key}: node must equal catalogue key`);
      entries.set(key, meta); names.add(key);
      const actual = info.assets.get(key); check(actual, `${key}: declared node missing from GLB`); measured.set(key, actual);
      check(Array.isArray(meta.tags) && meta.tags.includes(key.endsWith('_lod1') ? 'clutter_lod' : 'clutter'), `${key}: missing catalogue tags`);
      check(positive(meta.footprint, 2) && positive(meta.size, 3), `${key}: missing or invalid metre footprint/size`);
      check(eq(meta.footprint, [meta.size[0], meta.size[2]], 0.001), `${key}: footprint and catalogue size disagree`);
      check(meta.triangles === actual.triangles && meta.parts === actual.parts, `${key}: triangle/part metadata differs from GLB`);
      check(eq(meta.bounds?.min, actual.min) && eq(meta.bounds?.max, actual.max), `${key}: declared bounds differ from binary vertices`);
      const [w, h, d] = meta.size, tolerance = 0.02;
      check(actual.min[0] >= -w / 2 - tolerance && actual.max[0] <= w / 2 + tolerance && actual.min[2] >= -d / 2 - tolerance && actual.max[2] <= d / 2 + tolerance, `${key}: geometry exceeds centred footprint`);
      check(actual.min[1] >= -tolerance && actual.min[1] <= tolerance && actual.max[1] <= h + tolerance, `${key}: base must be at y=0 and top inside catalogue height`);
      check(actual.triangles < triangleLimit(key), `${key}: ${actual.triangles} triangles reaches/exceeds strict limit ${triangleLimit(key)}`);
      if (DECAL_TILES[key]) {
        const tile = DECAL_TILES[key], expected = manifest.atlas?.tiles?.[tile];
        check(finiteArray(expected, 4) && actual.decals.length === 1 && eq(actual.decals[0].uv, expected, 0.00001), `${key}: exported decal UVs do not select atlas tile '${tile}'`);
        check(actual.decals[0].upright, `${key}: decal is vertically flipped after GLB export`);
      }
      report.assets.push({ key, ...actual });
    }
    check(info.assets.size === names.size && [...info.assets.keys()].every((n) => names.has(n)), 'GLB contains unregistered asset roots');
  });
  for (const [key, meta] of entries) capture(key, () => {
    if (key.endsWith('_lod1')) { report.lodAssets++; check(entries.has(key.slice(0, -5)), 'orphan LOD1'); return; }
    report.baseAssets++;
    check(meta.lod1 === key + '_lod1' && entries.has(meta.lod1), 'missing explicit LOD1 asset');
    const base = measured.get(key), lod = measured.get(meta.lod1); check(base && lod, 'cannot measure LOD pair');
    check(lod.triangles <= base.triangles * 0.65, `LOD1 ${lod.triangles} is more than 65% of LOD0 ${base.triangles}`);
    check(eq(entries.get(meta.lod1).footprint, meta.footprint), 'LOD footprint differs from base');
  });
  capture('decal atlas', () => {
    const atlas = manifest.atlas;
    check(atlas && atlas.path === '../textures/clutter/decals.png' && atlas.material === 'clutter_decal', 'expected exactly the shared clutter decal atlas');
    const path = contained(resolve(projectRoot, 'assets/textures'), 'clutter/decals.png', 'atlas'); bytesFiles.add(path);
    const png = readFileSync(path);
    const [width, height] = pngSize(png);
    check(width === atlas.width && height === atlas.height, 'atlas dimensions differ from manifest');
    const tiles = Object.entries(atlas.tiles ?? {}); check(tiles.length >= 2 && tiles.some(([n]) => /graffiti/.test(n)) && tiles.some(([n]) => /poster/.test(n)), 'atlas needs graffiti and poster tiles');
    for (const [name, uv] of tiles) check(finiteArray(uv, 4) && uv.every((n) => n >= 0 && n <= 1) && uv[0] < uv[2] && uv[1] < uv[3], `invalid UV tile '${name}'`);
    if (complete) {
      const textures = jsonFile(resolve(projectRoot, 'assets/textures/manifest.json'));
      check(textures.textures?.clutter_decal?.map === 'clutter/decals.png', 'texture manifest does not register shared atlas');
      check(DEFS.clutter_decal?.uv === 'unit', 'clutter_decal must be a unit-UV library material');
      check([...measured.values()].some((m) => m.materials.includes('clutter_decal')), 'atlas is not used by any generated mesh');
    }
  });
  if (complete) capture('complete catalogue', () => {
    const missing = REQUIRED_KEYS.filter((k) => !entries.has(k)); check(!missing.length, `missing required keys: ${missing.join(', ')}`);
    const runtime = jsonFile(resolve(models, 'manifest.json'));
    check(runtime.files?.includes('manifest.clutter.json'), 'root asset manifest does not register clutter library');
  });
  // Count all files in both delivered payload directories, even undeclared or stale files.
  capture('payload', () => {
    for (const p of listFiles(resolve(models, 'clutter'))) {
      bytesFiles.add(p); check(declaredFiles.has(p), `unregistered payload file '${relative(models, p)}'`);
    }
    for (const p of listFiles(resolve(projectRoot, 'assets/textures/clutter'))) {
      bytesFiles.add(p); check(p === resolve(projectRoot, 'assets/textures/clutter/decals.png'), `unexpected extra atlas/texture '${relative(projectRoot, p)}'`);
    }
  });
  report.bytes = [...bytesFiles].reduce((sum, p) => sum + statSync(p).size, 0);
  if (report.bytes >= MAX_BYTES) report.errors.push(`payload ${report.bytes} bytes reaches/exceeds ${MAX_BYTES} byte library budget`);
  report.ok = report.errors.length === 0;
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), known = args.filter((a) => a !== '--complete' && a !== '--json');
  if (known.length) { console.error('usage: node clutter_validate.mjs [--complete] [--json]'); process.exit(2); }
  const report = validateClutter({ complete: args.includes('--complete') });
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`clutter: ${report.baseAssets} base assets + ${report.lodAssets} LOD1; ${report.bytes.toLocaleString('en-US')} / ${MAX_BYTES.toLocaleString('en-US')} bytes (${report.complete ? 'complete' : 'partial'} mode)`);
    for (const a of report.assets) if (!a.key.endsWith('_lod1')) console.log(`  ${a.key.padEnd(26)} ${String(a.triangles).padStart(3)} triangles, ${a.parts} parts`);
    if (report.ok) console.log('PASS: geometry, catalogue, material names, LODs, atlas and payload.');
    else for (const e of report.errors) console.error(`FAIL: ${e}`);
  }
  process.exitCode = report.ok ? 0 : 1;
}
