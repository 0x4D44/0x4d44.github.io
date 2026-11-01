// Independent acceptance gate for the dormant beach-props library.
// Reads actual GLB accessors, PNG pixels and hashes; never imports builder code.
import '../../tests/nice.mjs';
import { readFileSync, readdirSync, existsSync, statSync, realpathSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { Matrix4, Quaternion, Vector3 } from '../../vendor/three/build/three.core.min.js';
import { parseGlb } from './furn_validate.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const MODELS = resolve(ROOT, 'assets/models');
export const CATALOGUE = resolve(ROOT, 'tools/blender/beach_props.catalog.json');
export const MAX_GLB_BYTES = 3_000_000;
export const MAX_TEXTURE_BYTES = 6_000_000;
export const MANIFEST = 'manifest.beach_props.json';
export const SIGN_TEXTS = Object.freeze({
  zona_bano: 'Zona de baño', bandera_roja: 'Bandera roja', prohibido_paso: 'Prohibido el paso',
  cocadas: 'Cocadas', ceviche: 'Ceviche', jugos: 'Jugos naturales', helados: 'Helados',
  alquiler_tablas: 'Alquiler de tablas', cooperativa: 'Cooperativa de pescadores', salvavidas: 'Salvavidas',
});
const numbered = (n) => Array.from({ length: n }, (_, i) => String(i + 1).padStart(2, '0'));
export const REQUIRED_KEYS = Object.freeze([
  ...numbered(6).flatMap((i) => ['open', 'furled'].map((state) => `beach_parasol_${i}_${state}`)),
  ...['lounger_plastic_blue', 'lounger_wood_canvas', 'chair_plastic_coral', 'chair_wood_canvas', 'chair_folding_steel'].map((s) => 'beach_' + s),
  ...numbered(12).flatMap((i) => ['flat', 'draped'].map((state) => `beach_towel_${i}_${state}`)),
  ...numbered(4).map((i) => `beach_bag_${i}`),
  ...['cool_box', 'thermos', 'flipflops_pair', 'flipflop_left', 'flipflop_right', 'bucket_spade', 'sandcastle',
    'ball_buried', 'pool_ring_deflated', 'volleyball_court', 'volleyball_ball', 'seawall_stones', 'fishing_net',
    'seaweed', 'shell_conch', 'shell_scallop', 'palm_small', 'palm_large', 'kiosk', 'vendor_cart', 'cooler_stand',
    'sign_easel', 'lifeguard_tower', 'rescue_buoy', 'first_aid', 'red_flag', 'lamp', 'bench', 'bin', 'bike_rack',
    'fountain', 'railing', 'steps_small', 'steps_medium', 'steps_wide', 'shower'].map((s) => 'beach_' + s),
  ...[1, 2, 3].flatMap((i) => [`beach_groyne_rock_${i}`, `beach_driftwood_${i}`]),
  ...Object.keys(SIGN_TEXTS).map((s) => 'beach_sign_' + s),
]);
const MATERIAL_NAMES = ['beach_props', 'beach_props_alpha'];
const MAP_NAMES = ['albedo', 'normal', 'orm'];
const IDENTITY = new Matrix4();
const finite = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
const positive = (a, n) => finite(a, n) && a.every((v) => v > 0);
const equal = (a, b, tolerance = 1e-4) => finite(a, b.length) && a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const check = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const textSha256 = (bytes) => sha256(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')));

function inside(root, path, label) {
  check(typeof path === 'string' && path.length && !isAbsolute(path), `${label}: invalid relative path`);
  const result = resolve(root, path), rel = relative(resolve(root), result);
  check(rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel), `${label}: path escapes directory`);
  if (existsSync(result)) {
    const actual = relative(realpathSync(root), realpathSync(result));
    check(actual !== '..' && !actual.startsWith('..' + sep) && !isAbsolute(actual), `${label}: symlink escapes directory`);
  }
  return result;
}

function filesUnder(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((e) => e.isDirectory()
    ? filesUnder(resolve(path, e.name)) : [resolve(path, e.name)]);
}

function nodeMatrix(n, label) {
  if (n.matrix) {
    check(finite(n.matrix, 16) && !n.translation && !n.rotation && !n.scale, `${label}: invalid matrix/TRS combination`);
    check(equal([n.matrix[3], n.matrix[7], n.matrix[11], n.matrix[15]], [0, 0, 0, 1]), `${label}: non-affine transform`);
    const result = new Matrix4().fromArray(n.matrix);
    check(result.determinant() > 0, `${label}: reflected or collapsed transform`);
    return result;
  }
  const t = n.translation ?? [0, 0, 0], r = n.rotation ?? [0, 0, 0, 1], s = n.scale ?? [1, 1, 1];
  check(finite(t, 3) && finite(r, 4) && positive(s, 3), `${label}: invalid node transform`);
  check(Math.abs(Math.hypot(...r) - 1) < 1e-4, `${label}: non-unit quaternion`);
  return new Matrix4().compose(new Vector3(...t), new Quaternion(...r), new Vector3(...s));
}

function checkPositionBounds(a, label) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < a.count; i++) for (let d = 0; d < 3; d++) {
    min[d] = Math.min(min[d], a.values[i * 3 + d]); max[d] = Math.max(max[d], a.values[i * 3 + d]);
  }
  check(equal(a.min, min) && equal(a.max, max), `${label}: POSITION min/max differs from binary vertices`);
}

export function atlasCell(u, v, label = 'beach atlas') {
  check(Number.isFinite(u) && Number.isFinite(v) && u >= 0 && u <= 1 && v >= 0 && v <= 1, `${label}: atlas UV outside 0..1`);
  const x = Math.min(7, Math.floor(u * 8)), y = Math.min(7, Math.floor(v * 8)), gutter = 8 / 2048 - 2e-6;
  check(u >= x / 8 + gutter && u <= (x + 1) / 8 - gutter
    && v >= y / 8 + gutter && v <= (y + 1) / 8 - gutter, `${label}: atlas UV enters tile gutter`);
  return y * 8 + x;
}

/** Count every drawn instance, apply all transforms and inspect its actual attributes. */
export function inspectBeachGlb(bytesOrPath, label = typeof bytesOrPath === 'string' ? bytesOrPath : 'beach GLB') {
  const bytes = typeof bytesOrPath === 'string' ? readFileSync(bytesOrPath) : bytesOrPath;
  const parsed = parseGlb(bytes, label), { json: g, accessor } = parsed;
  check(!(g.animations?.length || g.skins?.length || g.cameras?.length), `${label}: static props cannot contain animations, skins or cameras`);
  check(g.scenes?.length === 1 && (g.scene ?? 0) === 0, `${label}: expected one default scene`);
  const nodes = g.nodes ?? [], roots = g.scenes[0].nodes ?? [], seen = new Set(), names = new Set(), assets = new Map();
  const checkedPositions = new Set(), meshUse = new Map();
  check(roots.length > 0, `${label}: empty scene`);
  for (const n of nodes) {
    check(typeof n.name === 'string' && n.name.length && !names.has(n.name), `${label}: missing or duplicate node name '${n.name}'`);
    names.add(n.name);
  }
  for (const m of g.materials ?? []) {
    check(MATERIAL_NAMES.includes(m.name), `${label}: unknown beach material '${m.name}'`);
    if (m.name === 'beach_props_alpha') {
      check(m.alphaMode === 'MASK' && Math.abs((m.alphaCutoff ?? 0.5) - 0.5) < 1e-6 && m.doubleSided === true, `${label}: alpha cards require double-sided MASK with cutoff 0.5`);
    } else check((m.alphaMode ?? 'OPAQUE') === 'OPAQUE', `${label}: opaque material must remain opaque`);
  }
  for (const ri of roots) {
    const root = nodes[ri];
    check(root && /^beach_[a-z0-9_]+$/.test(root.name), `${label}: invalid beach scene root`);
    check(equal(nodeMatrix(root, label).elements, IDENTITY.elements), `${root.name}: scene root must have identity transform`);
    const result = { key: root.name, triangles: 0, parts: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity],
      materials: new Set(), cells: new Set(), pivots: [], nodeNames: [], meshIds: new Set(), components: [] };
    function walk(ni, parent, pivot = null) {
      const n = nodes[ni], where = `${label}:${root.name}:${n?.name ?? ni}`;
      check(Number.isInteger(ni) && n && !seen.has(ni), `${where}: cyclic/shared/invalid node`); seen.add(ni);
      check(n.skin == null && n.camera == null && !Object.keys(n.extensions ?? {}).length, `${where}: unsupported node payload`);
      result.nodeNames.push(n.name);
      const matrix = parent.clone().multiply(nodeMatrix(n, where));
      if (/-pivot_[a-z0-9_]+$/.test(n.name)) {
        check(pivot === null && n.name.startsWith(root.name + '-pivot_'), `${where}: nested or misnamed pivot`);
        pivot = { name: n.name, position: new Vector3().setFromMatrixPosition(matrix).toArray(), triangles: 0,
          axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((a) => new Vector3(...a).transformDirection(matrix).toArray()) };
        result.pivots.push(pivot);
      }
      if (n.mesh != null) {
        check(Number.isInteger(n.mesh) && g.meshes?.[n.mesh]?.primitives?.length, `${where}: invalid or empty mesh`);
        meshUse.set(n.mesh, (meshUse.get(n.mesh) ?? 0) + 1); result.meshIds.add(n.mesh);
        const component = { name: n.name, triangles: 0, materials: new Set(), cells: new Set() };
        for (const p of g.meshes[n.mesh].primitives) {
          check((p.mode ?? 4) === 4 && !p.targets && !p.extensions, `${where}: only uncompressed triangles are supported`);
          const pos = accessor(p.attributes?.POSITION), nor = accessor(p.attributes?.NORMAL), uv = accessor(p.attributes?.TEXCOORD_0);
          check(pos.type === 'VEC3' && pos.componentType === 5126 && !pos.normalized
            && nor.type === 'VEC3' && uv.type === 'VEC2' && pos.count === nor.count && pos.count === uv.count, `${where}: malformed position/normal/UV attributes`);
          if (p.attributes?.COLOR_0 != null) {
            const color = accessor(p.attributes.COLOR_0);
            check([3, 4].includes(color.width) && color.count === pos.count && color.values.every((v) => v >= 0 && v <= 1.00001), `${where}: malformed linear vertex colour`);
          }
          if (!checkedPositions.has(p.attributes.POSITION)) { checkPositionBounds(pos, where); checkedPositions.add(p.attributes.POSITION); }
          const mat = g.materials?.[p.material]?.name;
          check(MATERIAL_NAMES.includes(mat), `${where}: unknown beach material '${mat}'`);
          result.materials.add(mat); component.materials.add(mat); result.parts++;
          const cells = [];
          for (let i = 0; i < pos.count; i++) {
            const length = Math.hypot(nor.values[i * 3], nor.values[i * 3 + 1], nor.values[i * 3 + 2]);
            check(length > 0.98 && length < 1.02, `${where}: non-unit vertex normal`);
            cells.push(atlasCell(uv.values[i * 2], uv.values[i * 2 + 1], where));
          }
          const index = p.indices == null ? null : accessor(p.indices), count = index?.count ?? pos.count;
          check(count > 0 && count % 3 === 0 && (!index || index.type === 'SCALAR'
            && [5121, 5123, 5125].includes(index.componentType) && !index.normalized), `${where}: malformed triangle indices`);
          const used = new Set();
          for (let i = 0; i < count; i += 3) {
            const ids = [0, 1, 2].map((j) => index ? index.values[i + j] : i + j);
            check(ids.every((j) => Number.isInteger(j) && j >= 0 && j < pos.count), `${where}: triangle index outside vertex range`);
            ids.forEach((j) => used.add(j));
            const [a, b, c] = ids.map((j) => new Vector3().fromArray(pos.values, j * 3));
            const face = b.sub(a).cross(c.sub(a)), area = face.length();
            check(area > 1e-12, `${where}: degenerate triangle`);
            const normal = new Vector3(); for (const j of ids) normal.add(new Vector3().fromArray(nor.values, j * 3));
            check(face.dot(normal) >= -area * 1e-5, `${where}: triangle winding disagrees with normals`);
            check(cells[ids[0]] === cells[ids[1]] && cells[ids[1]] === cells[ids[2]], `${where}: triangle crosses atlas cells`);
            result.cells.add(cells[ids[0]]); component.cells.add(cells[ids[0]]);
          }
          for (const j of used) {
            const point = new Vector3().fromArray(pos.values, j * 3).applyMatrix4(matrix).toArray();
            check(point.every(Number.isFinite), `${where}: non-finite transformed vertex`);
            for (let d = 0; d < 3; d++) { result.min[d] = Math.min(result.min[d], point[d]); result.max[d] = Math.max(result.max[d], point[d]); }
          }
          result.triangles += count / 3; component.triangles += count / 3; if (pivot) pivot.triangles += count / 3;
        }
        component.materials = [...component.materials]; component.cells = [...component.cells]; result.components.push(component);
      }
      for (const child of n.children ?? []) walk(child, matrix, pivot);
    }
    walk(ri, IDENTITY);
    check(result.triangles > 0 && result.parts > 0, `${root.name}: empty asset`);
    for (const p of result.pivots) check(p.triangles > 0, `${p.name}: pivot must own drawable geometry`);
    result.size = result.max.map((v, i) => v - result.min[i]);
    result.materials = [...result.materials]; result.cells = [...result.cells]; result.meshIds = [...result.meshIds];
    assets.set(root.name, result);
  }
  check(seen.size === nodes.length, `${label}: orphan nodes outside scene roots`);
  return { bytes: parsed.bytes, assets, sharedMeshes: [...meshUse].filter(([, uses]) => uses > 1).map(([id, uses]) => ({ id, uses })) };
}

/** Decode CRC-checked PNG chunks and every PNG row filter, without an image library. */
export function inspectBeachPng(bytes, label = 'beach PNG') {
  const b = Buffer.from(bytes);
  check(b.length >= 45 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${label}: invalid PNG signature`);
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (data) => { let c = 0xffffffff; for (const v of data) c = table[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  let offset = 8, header, ended = false; const chunks = [];
  while (offset < b.length) {
    check(offset + 12 <= b.length, `${label}: truncated PNG chunk`);
    const length = b.readUInt32BE(offset), end = offset + 8 + length, type = b.toString('ascii', offset + 4, offset + 8);
    check(end + 4 <= b.length, `${label}: truncated PNG payload`);
    check(crc(b.subarray(offset + 4, end)) === b.readUInt32BE(end), `${label}: PNG ${type} CRC mismatch`);
    if (!header) { check(type === 'IHDR' && length === 13, `${label}: PNG must begin with IHDR`); header = b.subarray(offset + 8, end); }
    else check(type !== 'IHDR', `${label}: duplicate PNG IHDR`);
    if (type === 'IDAT') chunks.push(b.subarray(offset + 8, end));
    if (type === 'IEND') { check(length === 0 && end + 4 === b.length, `${label}: data after PNG IEND`); ended = true; }
    offset = end + 4;
  }
  check(ended && chunks.length, `${label}: PNG lacks image data or IEND`);
  const width = header.readUInt32BE(0), height = header.readUInt32BE(4), channels = { 2: 3, 6: 4 }[header[9]];
  check(width > 0 && height > 0 && width <= 2048 && height <= 2048 && header[8] === 8 && channels
    && header[10] === 0 && header[11] === 0 && header[12] === 0, `${label}: expected <=2048px noninterlaced 8-bit RGB/RGBA PNG`);
  const stride = width * channels, raw = inflateSync(Buffer.concat(chunks), { maxOutputLength: (stride + 1) * height });
  check(raw.length === (stride + 1) * height, `${label}: PNG raster size mismatch`);
  const pixels = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]; check(filter <= 4, `${label}: invalid PNG row filter`);
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0, up = y ? pixels[(y - 1) * stride + x] : 0;
      const before = y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : paeth(left, up, before);
      pixels[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255;
    }
  }
  return { width, height, channels, bytes: b.length, pixels };
}

function polygon(points, label) {
  check(Array.isArray(points) && points.length >= 3 && points.every((p) => finite(p, 2)), `${label}: invalid keep-out polygon`);
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]; area += a[0] * b[1] - b[0] * a[1];
    check(Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-5, `${label}: duplicate keep-out vertex`);
  }
  check(Math.abs(area) > 0.01, `${label}: collapsed keep-out polygon`);
  const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < points.length; i++) for (let j = i + 2; j < points.length; j++) {
    if (i === 0 && j === points.length - 1) continue;
    const a = points[i], b = points[(i + 1) % points.length], c = points[j], d = points[(j + 1) % points.length];
    check(!(orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0), `${label}: self-intersecting keep-out polygon`);
  }
}

function checkAnchors(anchors, cat, label) {
  check(anchors && typeof anchors === 'object' && !Array.isArray(anchors), `${label}: anchors object required`);
  const spot = (s, name) => check(s && finite(s.position, 3) && Number.isFinite(s.yaw), `${label}: invalid ${name} position/yaw`);
  for (const s of anchors.seats ?? []) { spot(s, 'seat'); check(Number.isFinite(s.seatHeight) && s.seatHeight > 0 && s.seatHeight <= cat.size[1] + 0.05, `${label}: invalid seat height`); }
  for (const s of anchors.lie ?? []) { spot(s, 'lie-down'); check(s.length > 0 && s.width > 0 && Number.isFinite(s.length + s.width), `${label}: invalid lie-down size`); }
  if (anchors.light) check(finite(anchors.light.position, 3) && finite(anchors.light.color, 3)
    && anchors.light.color.every((v) => v >= 0 && v <= 1), `${label}: invalid light position/color`);
  for (const h of anchors.hinges ?? []) check(typeof h.name === 'string' && finite(h.position, 3) && finite(h.axis, 3)
    && Math.abs(Math.hypot(...h.axis) - 1) < 1e-4, `${label}: invalid hinge anchor`);
  for (const h of anchors.hands ?? []) check(finite(h.position, 3) && ['left', 'right'].includes(h.side), `${label}: invalid hand anchor`);
  if (anchors.keepOut) polygon(anchors.keepOut, label);
  if (label === 'beach_lamp') check(anchors.light, `${label}: lamp requires a light anchor`);
  if (/^beach_(?:chair_|lounger_|bench$)|^beach_towel_\d+_draped$/.test(label)) check(anchors.seats?.length, `${label}: seat anchor required`);
  if (/^beach_lounger_|^beach_towel_\d+_flat$/.test(label)) check(anchors.lie?.length, `${label}: lie-down anchor required`);
  if (label === 'beach_vendor_cart') check(anchors.hands?.length === 2 && new Set(anchors.hands.map((h) => h.side)).size === 2, `${label}: left and right hand anchors required`);
  if (['beach_volleyball_court', 'beach_kiosk', 'beach_lifeguard_tower'].includes(label)) check(anchors.keepOut, `${label}: navigation keep-out polygon required`);
  for (const p of cat.pivots ?? []) if (['hinge', 'flap'].includes(p.motion)) {
    const anchor = anchors.hinges?.find((h) => h.name === p.name);
    check(anchor && equal(anchor.position, p.position) && equal(anchor.axis, p.axis), `${label}: hinge/flap anchor must match physical pivot`);
  }
}

export function validateBeachProps({ models = MODELS, catalogue = CATALOGUE, textures, complete = false, rootManifest = resolve(ROOT, 'assets/models/manifest.json') } = {}) {
  models = resolve(models); catalogue = resolve(catalogue);
  const textureDirectory = textures ? resolve(textures) : resolve(models, '../textures/beach_props');
  const report = { ok: false, complete, assetCount: 0, lodCount: 0, totalGlbBytes: 0, totalTextureBytes: 0,
    maxGlbBytes: MAX_GLB_BYTES, maxTextureBytes: MAX_TEXTURE_BYTES, files: [], assets: [], sharedMeshes: 0, failures: [] };
  const capture = (label, fn) => { try { return fn(); } catch (e) { report.failures.push(`${label}: ${e.message}`); return null; } };
  const manifest = capture('manifest', () => readJson(resolve(models, MANIFEST)));
  const catBytes = capture('catalogue', () => readFileSync(catalogue));
  const catDocument = catBytes && capture('catalogue', () => JSON.parse(catBytes));
  const cats = catDocument?.assets;
  if (!manifest || !cats) return report;
  const declared = new Map(), measured = new Map(), registeredFiles = new Set();
  capture('manifest', () => {
    check(manifest.version === 1 && manifest.license === 'CC0-1.0', 'version 1 and CC0-1.0 licence required');
    check(Array.isArray(manifest.files) && manifest.files.length, 'no generated GLB files declared');
    check(manifest.generator?.script === 'tools/blender/beach_props_build.py' && /^5\./.test(manifest.generator?.blender), 'Blender 5.x generator provenance required');
    check(manifest.generator?.catalogSha256 === textSha256(catBytes), 'catalogue LF SHA-256 is missing or stale');
    check(catDocument.version === 1 && catDocument.units === 'metres', 'catalogue must use version 1 and metres');
    if (complete) check(manifest.complete === true, 'preview/partial library cannot pass complete mode');
  });
  for (const [key, cat] of Object.entries(cats)) capture(key + ' catalogue', () => {
    check(/^beach_[a-z0-9_]+$/.test(key) && !key.endsWith('_lod1'), 'invalid catalogue key');
    check(positive(cat.size, 3) && positive(cat.footprint, 2) && equal(cat.footprint, [cat.size[0], cat.size[2]]), 'invalid metre size/footprint');
    check(typeof cat.family === 'string' && typeof cat.description === 'string' && cat.description.length > 10, 'family and description required');
    const max = ['beach_kiosk', 'beach_lifeguard_tower'].includes(key) ? 3000 : key === 'beach_lamp' ? 150 : 2000;
    check(Number.isInteger(cat.triangleCap) && cat.triangleCap > 0 && cat.triangleCap <= max, 'catalogue triangle cap exceeds task limit');
    checkAnchors(cat.anchors, cat, key);
    check(Array.isArray(cat.atlasCells) && cat.atlasCells.length && cat.atlasCells.every((c) => typeof c === 'string'), 'explicit atlas cells required');
    for (const p of cat.pivots ?? []) check(typeof p.name === 'string' && /^[a-z0-9_]+$/.test(p.name) && finite(p.position, 3)
      && finite(p.axis, 3) && Math.abs(Math.hypot(...p.axis) - 1) < 1e-4, 'invalid pivot definition');
    check(new Set((cat.pivots ?? []).map((p) => p.name)).size === (cat.pivots ?? []).length, 'duplicate catalogue pivot names');
  });
  for (const file of Array.isArray(manifest.files) ? manifest.files : []) capture(file.glb ?? 'GLB', () => {
    check(typeof file.glb === 'string' && /^beach_props\/[a-zA-Z0-9_-]+\.glb$/.test(file.glb), 'GLB must be a file under beach_props/');
    const path = inside(models, file.glb, 'beach GLB');
    check(!registeredFiles.has(path), 'duplicate GLB file'); registeredFiles.add(path);
    const bytes = readFileSync(path), actual = inspectBeachGlb(bytes, file.glb);
    check(file.bytes === bytes.length && file.sha256 === sha256(bytes), 'byte count or SHA-256 differs from generated GLB');
    check(file.assets && typeof file.assets === 'object' && !Array.isArray(file.assets) && Object.keys(file.assets).length, 'empty or malformed assets map');
    report.sharedMeshes += actual.sharedMeshes.length;
    check(same(file.sharedMeshes, actual.sharedMeshes), 'shared mesh metadata differs from actual instances');
    const roots = new Set();
    for (const [key, meta] of Object.entries(file.assets)) capture(key, () => {
      const low = key.endsWith('_lod1'), baseKey = low ? key.slice(0, -5) : key, cat = cats[baseKey];
      check(cat && !declared.has(key), 'unknown or duplicate asset key');
      check(meta?.node === key, 'asset root must equal catalogue key'); roots.add(key); declared.set(key, meta);
      const a = actual.assets.get(key); check(a, 'declared root absent from actual GLB'); measured.set(key, a);
      check(equal(meta.size, cat.size) && equal(meta.footprint, cat.footprint), 'size/footprint differs from catalogue');
      check(meta.origin === 'floor-centre' && (!low || meta.lod === 1), 'wrong origin or LOD metadata');
      check(meta.triangles === a.triangles && meta.parts === a.parts, 'triangle/part count differs from actual bytes');
      check(equal(meta.bounds?.min, a.min) && equal(meta.bounds?.max, a.max), 'bounds differ from actual vertices');
      const [w, h, d] = cat.size;
      check(a.min[0] >= -w / 2 - 0.02 && a.max[0] <= w / 2 + 0.02 && a.min[2] >= -d / 2 - 0.02
        && a.max[2] <= d / 2 + 0.02 && Math.abs(a.min[1]) <= 0.02 && a.max[1] <= h + 0.02, 'geometry exceeds centred footprint or ground/height envelope');
      check(a.size.every((v, i) => cat.size[i] <= 0.05 || v >= cat.size[i] * 0.60 - 0.005), 'geometry does not fill the catalogue silhouette');
      check(a.triangles <= cat.triangleCap, `measured ${a.triangles} triangles exceeds ${cat.triangleCap} limit`);
      check(same(meta.anchors, cat.anchors), 'anchors differ from catalogue');
      check(same(meta.pivots, cat.pivots) && same(meta.atlasCells, cat.atlasCells), 'pivot/atlas metadata differs from catalogue');
      const expectedPivots = cat.pivots ?? [];
      check(a.pivots.length === expectedPivots.length, 'missing or extra independent pivots');
      for (const p of expectedPivots) {
        const match = a.pivots.find((candidate) => candidate.name === `${key}-pivot_${p.name}`);
        check(match && equal(match.position, p.position, 0.002), 'pivot name/position differs from catalogue');
        check(equal(match.axes[0], [1, 0, 0]) && equal(match.axes[1], [0, 1, 0]) && equal(match.axes[2], [0, 0, 1]), 'pivot local axes must remain aligned with catalogue');
      }
      const cells = manifest.textures?.cells ?? {};
      check(cat.atlasCells.every((cell) => Number.isInteger(cells[cell]) && a.cells.includes(cells[cell])), 'geometry does not select required catalogue atlas cells (check V conversion)');
      if (!low && /volleyball_(court|net)$/.test(baseKey)) {
        const net = a.components.filter((c) => /net/.test(c.name) && c.materials.includes('beach_props_alpha'));
        check(net.length === 1 && net[0].triangles === 12, 'volleyball alpha net must be one separately named 12-triangle component');
      }
      report.assets.push(a);
    });
    check(roots.size === actual.assets.size && [...actual.assets.keys()].every((key) => roots.has(key)), 'unregistered scene roots in GLB');
    report.files.push({ path: file.glb, bytes: bytes.length, roots: actual.assets.size });
  });
  for (const [key, meta] of declared) capture(key + ' LOD pairing', () => {
    if (key.endsWith('_lod1')) { report.lodCount++; check(declared.has(key.slice(0, -5)), 'orphan LOD1'); return; }
    report.assetCount++;
    check(meta.lod1 === key + '_lod1' && declared.has(meta.lod1), 'missing explicit far LOD');
    const near = measured.get(key), far = measured.get(meta.lod1);
    check(near && far, 'both LODs must contain measurable geometry');
    check(far.triangles <= near.triangles * 0.40, 'far LOD exceeds 40% of near triangles');
    check(equal(declared.get(meta.lod1).size, meta.size) && equal(declared.get(meta.lod1).footprint, meta.footprint), 'LOD silhouette metadata differs');
    for (const pivot of near.pivots) {
      const other = far.pivots.find((candidate) => candidate.name === meta.lod1 + pivot.name.slice(key.length));
      check(other && equal(other.position, pivot.position, 0.002), 'LOD pivot moves when switching detail');
    }
  });
  capture('shared PBR atlas', () => {
    const atlas = manifest.textures;
    check(atlas && atlas.width === 2048 && atlas.height === 2048 && atlas.grid === 8 && atlas.gutter === 8 && atlas.cellSize === 256, 'expected one shared 2048px PBR atlas, 8x8 padded cells');
    check(same(Object.keys(atlas.maps ?? {}).sort(), [...MAP_NAMES].sort()), 'one albedo, normal and ORM map required');
    const symbols = Object.entries(atlas.cells ?? {}), cells = new Set();
    check(symbols.length > 40, 'atlas cell catalogue incomplete');
    for (const [symbol, value] of symbols) {
      check(typeof symbol === 'string' && Number.isInteger(value) && value >= 0 && value < 64 && !cells.has(value), `invalid/duplicate atlas cell ${symbol}`); cells.add(value);
    }
    for (const [suffix, text] of Object.entries(SIGN_TEXTS)) {
      check(atlas.signTexts?.['sign_' + suffix] === text && cats['beach_sign_' + suffix]?.text === text, `missing or incorrect Spanish sign: ${text}`);
    }
    for (const map of MAP_NAMES) {
      const info = atlas.maps[map], expected = `../textures/beach_props/${map}.png`;
      check(info.path === expected, `${map}: unexpected atlas path`);
      const path = inside(textureDirectory, `${map}.png`, 'atlas map'), bytes = readFileSync(path), png = inspectBeachPng(bytes, map);
      check(info.bytes === bytes.length && info.sha256 === sha256(bytes), `${map}: atlas bytes/SHA-256 differ from manifest`);
      check(png.width === atlas.width && png.height === atlas.height && png.channels === (map === 'albedo' ? 4 : 3), `${map}: dimensions/channel count differ from shared layout`);
      if (map === 'albedo') {
        const printSignatures = new Set();
        for (const id of numbered(12)) {
          const cell = atlas.cells['towel_' + id]; check(Number.isInteger(cell), `missing towel print ${id}`);
          const hash = createHash('sha256'), x0 = (cell % 8) * 256 + 8, y0 = (7 - Math.floor(cell / 8)) * 256 + 8;
          for (let y = y0; y < y0 + 240; y++) hash.update(png.pixels.subarray((y * png.width + x0) * 4, (y * png.width + x0 + 240) * 4));
          printSignatures.add(hash.digest('hex'));
        }
        check(printSignatures.size === 12, 'twelve towel prints must be distinct decoded image cells');
        for (const cell of atlas.alphaCells ?? []) {
          check(Number.isInteger(cell) && cells.has(cell), 'invalid alpha cell');
          let opaque = 0, transparent = 0;
          const x0 = (cell % 8) * 256 + 8, y0 = (7 - Math.floor(cell / 8)) * 256 + 8;
          for (let y = y0; y < y0 + 240; y += 3) for (let x = x0; x < x0 + 240; x += 3) {
            const alpha = png.pixels[(y * png.width + x) * 4 + 3]; if (alpha < 128) transparent++; else opaque++;
          }
          check(opaque > 10 && transparent > 10, `alpha cell ${cell} lacks both cutouts and visible pixels`);
        }
      }
    }
    check(same(Object.keys(manifest.materials ?? {}).sort(), [...MATERIAL_NAMES].sort()), 'two manifest materials must share the atlas');
    for (const name of MATERIAL_NAMES) {
      const m = manifest.materials[name];
      check(m.uv === 'unit' && m.map === atlas.maps.albedo.path && m.normal === atlas.maps.normal.path && m.orm === atlas.maps.orm.path, `${name}: material must bind all shared PBR maps`);
      check(m.alphaMode === (name.endsWith('_alpha') ? 'MASK' : 'OPAQUE'), `${name}: incorrect material alpha mode`);
      if (name.endsWith('_alpha')) check(m.alphaCutoff === 0.5 && m.doubleSided === true, 'alpha cards require double-sided MASK cutoff 0.5');
    }
  });
  capture('payload', () => {
    for (const path of filesUnder(resolve(models, 'beach_props'))) {
      report.totalGlbBytes += statSync(path).size;
      if (!registeredFiles.has(path)) report.failures.push(`unregistered payload file: ${relative(models, path)}`);
    }
    for (const path of filesUnder(textureDirectory)) {
      report.totalTextureBytes += statSync(path).size;
      if (!MAP_NAMES.some((name) => path === resolve(textureDirectory, name + '.png'))) report.failures.push(`unregistered texture payload: ${path}`);
    }
  });
  capture('metadata totals', () => {
    check(manifest.assetCount === report.assetCount && manifest.lodCount === report.lodCount, 'assetCount/lodCount differs from generated roots');
    check(manifest.totalGlbBytes === report.totalGlbBytes, 'totalGlbBytes differs from actual files');
    check(manifest.totalTextureBytes === report.totalTextureBytes, 'totalTextureBytes differs from actual files');
  });
  capture('GLB budget', () => check(report.totalGlbBytes <= MAX_GLB_BYTES, `${report.totalGlbBytes} GLB bytes exceeds ${MAX_GLB_BYTES} budget`));
  capture('texture budget', () => check(report.totalTextureBytes <= MAX_TEXTURE_BYTES, `${report.totalTextureBytes} texture bytes exceeds ${MAX_TEXTURE_BYTES} budget`));
  if (complete) capture('complete library', () => {
    check(REQUIRED_KEYS.every((key) => cats[key]), 'catalogue is missing required beach designs or variants');
    for (const key of Object.keys(cats)) for (const k of [key, key + '_lod1']) {
      check(declared.has(k) && report.assets.some((a) => a.key === k), `missing complete generated asset ${k}`);
    }
    for (const family of ['lounge', 'towel', 'beach', 'sport', 'vendor', 'lifeguard', 'promenade', 'shore', 'plant', 'sign']) {
      check(Object.values(cats).some((cat) => cat.family === family), `required family missing: ${family}`);
    }
    check(report.sharedMeshes > 0, 'repeated pieces must share at least one actual glTF mesh resource');
  });
  capture('dormant runtime registration', () => {
    const runtime = readJson(rootManifest);
    check(!runtime.files?.includes(MANIFEST), 'offline library must not be registered for game loading');
  });
  report.ok = report.failures.length === 0;
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--models', '--catalogue', '--textures', '--root-manifest'].includes(arg)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) { console.error(`${arg} needs a path`); process.exit(2); }
      options[arg === '--root-manifest' ? 'rootManifest' : arg.slice(2)] = resolve(args[++i]);
    } else if (arg === '--complete') options.complete = true;
    else if (arg !== '--json') { console.error(`unknown option: ${arg}`); process.exit(2); }
  }
  const report = validateBeachProps(options);
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`${report.ok ? 'PASS' : 'FAIL'} beach props: ${report.assetCount} designs + ${report.lodCount} far LODs`);
    console.log(`GLB ${report.totalGlbBytes.toLocaleString('en-US')} / ${MAX_GLB_BYTES.toLocaleString('en-US')} bytes; textures ${report.totalTextureBytes.toLocaleString('en-US')} / ${MAX_TEXTURE_BYTES.toLocaleString('en-US')} bytes; ${report.sharedMeshes} shared mesh resources`);
    for (const file of report.files) console.log(`  ${file.path}: ${file.roots} roots, ${file.bytes.toLocaleString('en-US')} bytes`);
    for (const failure of report.failures) console.error(`  ${failure}`);
  }
  process.exitCode = report.ok ? 0 : 1;
}
