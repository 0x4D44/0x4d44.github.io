// Validate the vehicle GLBs and shared paint atlas from their actual bytes.
// node la-ladera/tools/blender/vehicles_validate.mjs [--models DIR] [--atlas PNG] [--complete] [--runtime] [--json]
// A staged --models directory may be validated before the root runtime manifests are installed.
import '../../tests/nice.mjs';
import { readFileSync, readdirSync, existsSync, statSync, realpathSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { Matrix4, Quaternion, Vector3 } from '../../vendor/three/build/three.core.min.js';
import { parseGlb } from './furn_validate.mjs';
import engine from '../../js/engine/matdefs.js';
import world from '../../js/world/matdefs.js';
import arch from '../../js/arch/matdefs.js';
import interiors from '../../js/interiors/matdefs.js';
import people from '../../js/people/matdefs.js';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const MODELS = resolve(ROOT, 'assets/models');
export const MAX_BYTES = 3_000_000;
export const MAX_NEAR_TRIANGLES = 6000;
export const MAX_FAR_TRIANGLES = 600;
export const REQUIRED_KEYS = Object.freeze([
  'vehicle_hatchback_a', 'vehicle_hatchback_b', 'vehicle_pickup', 'vehicle_chiva', 'vehicle_colectivo',
  'vehicle_motorbike', 'vehicle_tricycle', 'vehicle_handcart', 'vehicle_bicycle', 'vehicle_rubbish_cart',
]);
const WHEELS = Object.freeze(Object.fromEntries(REQUIRED_KEYS.map((key) => [key,
  /motorbike|bicycle|handcart|rubbish_cart/.test(key) ? 2 : key === 'vehicle_tricycle' ? 3 : 4])));
const MATERIALS = { ...engine, ...world, ...arch, ...interiors, ...people };
const ATLAS_PATH = '../textures/vehicles/paint.png';
const IDENTITY = new Matrix4();
const finite = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
const positive = (a, n) => finite(a, n) && a.every((x) => x > 0);
const equal = (a, b, e = 1e-4) => finite(a, b.length) && a.every((v, i) => Math.abs(v - b[i]) <= e);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const check = (condition, message) => { if (!condition) throw new Error(message); };
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));

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
    const m = new Matrix4().fromArray(n.matrix);
    check(m.determinant() > 0, `${label}: reflected or collapsed transform`);
    return m;
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

function atlasCell(u, v, label) {
  check(u >= 0 && u <= 1 && v >= 0 && v <= 1, `${label}: paint atlas UV outside 0..1`);
  const x = Math.min(3, Math.floor(u * 4)), y = Math.min(3, Math.floor(v * 4)), gutter = 8 / 1024 - 2e-6;
  check(u >= x / 4 + gutter && u <= (x + 1) / 4 - gutter
    && v >= y / 4 + gutter && v <= (y + 1) / 4 - gutter, `${label}: paint atlas UV enters tile gutter`);
  return y * 4 + x;
}

/** Independent GLB inspection: counts rendered indices, transforms actual positions and verifies wheel pivot subtrees. */
export function inspectVehicleGlb(bytesOrPath, label = typeof bytesOrPath === 'string' ? bytesOrPath : 'vehicle GLB') {
  const bytes = typeof bytesOrPath === 'string' ? readFileSync(bytesOrPath) : bytesOrPath;
  const parsed = parseGlb(bytes, label), { json: g, accessor } = parsed;
  check(!(g.animations?.length || g.skins?.length || g.cameras?.length), `${label}: parked vehicles must not include animations, skins or cameras`);
  check(g.scenes?.length === 1 && (g.scene ?? 0) === 0, `${label}: expected one default scene`);
  const nodes = g.nodes ?? [], roots = g.scenes[0].nodes ?? [], seen = new Set(), names = new Set(), assets = new Map();
  const checkedPositions = new Set();
  check(roots.length > 0, `${label}: empty scene`);
  for (const n of nodes) {
    check(typeof n.name === 'string' && n.name.length && !names.has(n.name), `${label}: missing or duplicate node name '${n.name}'`);
    names.add(n.name);
  }
  for (const ri of roots) {
    const root = nodes[ri];
    check(root && /^vehicle_[a-z0-9_]+$/.test(root.name), `${label}: invalid vehicle scene root`);
    check(equal(nodeMatrix(root, label).elements, IDENTITY.elements), `${root.name}: scene root must have identity transform`);
    const result = { key: root.name, triangles: 0, parts: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity],
      materials: new Set(), wheels: [], paintCells: new Set(), nodeNames: [], meshIds: new Set() };
    function walk(ni, parent, wheel = null) {
      const n = nodes[ni], where = `${label}:${root.name}:${n?.name ?? ni}`;
      check(Number.isInteger(ni) && n && !seen.has(ni), `${where}: cyclic/shared/invalid node`); seen.add(ni);
      check(n.skin == null && n.camera == null && !Object.keys(n.extensions ?? {}).length, `${where}: unsupported node payload`);
      result.nodeNames.push(n.name);
      const m = parent.clone().multiply(nodeMatrix(n, where));
      if (/\-wheel_[a-z0-9]+$/.test(n.name)) {
        check(wheel === null && n.name.startsWith(root.name + '-wheel_'), `${where}: nested or misnamed wheel pivot`);
        const pivot = new Vector3().setFromMatrixPosition(m).toArray();
        const axle = new Vector3(1, 0, 0).transformDirection(m);
        check(axle.x > 0.99999 && Math.abs(axle.y) < 1e-4 && Math.abs(axle.z) < 1e-4, `${where}: wheel axle must remain +X`);
        wheel = { name: n.name, pivot, triangles: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
        result.wheels.push(wheel);
      }
      if (n.mesh != null) {
        check(Number.isInteger(n.mesh) && g.meshes?.[n.mesh]?.primitives?.length, `${where}: invalid or empty mesh`);
        result.meshIds.add(n.mesh);
        for (const p of g.meshes[n.mesh].primitives) {
          check((p.mode ?? 4) === 4 && !p.targets && !p.extensions, `${where}: only uncompressed triangle primitives are supported`);
          const pos = accessor(p.attributes?.POSITION), nor = accessor(p.attributes?.NORMAL), uv = accessor(p.attributes?.TEXCOORD_0);
          check(pos.type === 'VEC3' && pos.componentType === 5126 && !pos.normalized
            && nor.type === 'VEC3' && uv.type === 'VEC2' && pos.count === nor.count && pos.count === uv.count, `${where}: malformed position/normal/UV attributes`);
          const color = p.attributes?.COLOR_0 == null ? null : accessor(p.attributes.COLOR_0);
          check(color && [3, 4].includes(color.width) && color.count === pos.count && color.values.every((v) => v >= 0 && v <= 1.00001), `${where}: missing or malformed linear vertex colour`);
          if (!checkedPositions.has(p.attributes.POSITION)) { checkPositionBounds(pos, where); checkedPositions.add(p.attributes.POSITION); }
          const mat = g.materials?.[p.material]?.name;
          check(mat && MATERIALS[mat] && mat !== 'missing_asset', `${where}: unknown library material '${mat}'`);
          result.materials.add(mat); result.parts++;
          const cells = mat === 'vehicle_paint' ? [] : null;
          for (let i = 0; i < pos.count; i++) {
            const len = Math.hypot(nor.values[i * 3], nor.values[i * 3 + 1], nor.values[i * 3 + 2]);
            check(len > 0.98 && len < 1.02, `${where}: non-unit vertex normal`);
            if (cells) cells.push(atlasCell(uv.values[i * 2], uv.values[i * 2 + 1], where));
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
            if (cells) {
              check(cells[ids[0]] === cells[ids[1]] && cells[ids[1]] === cells[ids[2]], `${where}: paint triangle crosses atlas cells`);
              result.paintCells.add(cells[ids[0]]);
            }
          }
          for (const j of used) {
            const point = new Vector3().fromArray(pos.values, j * 3).applyMatrix4(m).toArray();
            check(point.every(Number.isFinite), `${where}: non-finite transformed vertex`);
            for (const box of wheel ? [result, wheel] : [result]) for (let d = 0; d < 3; d++) {
              box.min[d] = Math.min(box.min[d], point[d]); box.max[d] = Math.max(box.max[d], point[d]);
            }
          }
          result.triangles += count / 3; if (wheel) wheel.triangles += count / 3;
        }
      }
      for (const child of n.children ?? []) walk(child, m, wheel);
    }
    walk(ri, IDENTITY);
    check(result.triangles > 0 && result.parts > 0, `${root.name}: empty asset`);
    for (const w of result.wheels) {
      check(w.triangles > 0 && w.max.every((v, i) => v > w.min[i]), `${w.name}: empty or collapsed wheel subtree`);
      check([1, 2].every((d) => Math.abs((w.min[d] + w.max[d]) / 2 - w.pivot[d]) <= 0.025), `${w.name}: pivot does not lie at wheel axle centre`);
      check(w.pivot[1] > 0 && w.min[1] >= -0.02, `${w.name}: wheel below ground or pivot at ground`);
    }
    for (let i = 0; i < result.wheels.length; i++) for (let j = i + 1; j < result.wheels.length; j++) {
      check(new Vector3(...result.wheels[i].pivot).distanceTo(new Vector3(...result.wheels[j].pivot)) > 0.1, `${root.name}: coincident wheel pivots`);
    }
    result.size = result.max.map((v, i) => v - result.min[i]);
    result.materials = [...result.materials]; result.paintCells = [...result.paintCells]; result.meshIds = [...result.meshIds];
    assets.set(root.name, result);
  }
  check(seen.size === nodes.length, `${label}: orphan nodes outside the scene roots`);
  return { bytes: parsed.bytes, assets };
}

/** Checks PNG chunk CRCs and decoded raster, not merely the 24-byte width/height header. */
export function inspectPaintPng(png) {
  check(png.length >= 45 && png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'invalid paint PNG signature');
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (data) => { let c = 0xffffffff; for (const b of data) c = table[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  let offset = 8, header, ended = false; const chunks = [];
  while (offset < png.length) {
    check(offset + 12 <= png.length, 'truncated paint PNG chunk');
    const length = png.readUInt32BE(offset), end = offset + 8 + length, type = png.toString('ascii', offset + 4, offset + 8);
    check(end + 4 <= png.length, 'truncated paint PNG payload');
    check(crc(png.subarray(offset + 4, end)) === png.readUInt32BE(end), `paint PNG ${type} CRC mismatch`);
    if (!header) { check(type === 'IHDR' && length === 13, 'paint PNG must begin with IHDR'); header = png.subarray(offset + 8, end); }
    else check(type !== 'IHDR', 'duplicate paint PNG IHDR');
    if (type === 'IDAT') chunks.push(png.subarray(offset + 8, end));
    if (type === 'IEND') { check(length === 0 && end + 4 === png.length, 'paint PNG data after IEND'); ended = true; }
    offset = end + 4;
  }
  check(ended && chunks.length, 'paint PNG lacks image data or IEND');
  const width = header.readUInt32BE(0), height = header.readUInt32BE(4), channels = { 2: 3, 6: 4 }[header[9]];
  check(width === 1024 && height === 1024 && header[8] === 8 && channels
    && header[10] === 0 && header[11] === 0 && header[12] === 0, 'paint atlas must be 1024 x 1024 non-interlaced 8-bit RGB/RGBA PNG');
  const stride = width * channels + 1, pixels = inflateSync(Buffer.concat(chunks), { maxOutputLength: stride * height });
  check(pixels.length === stride * height, 'paint PNG raster size mismatch');
  for (let y = 0; y < height; y++) check(pixels[y * stride] <= 4, 'paint PNG invalid row filter');
  return { width, height, bytes: png.length };
}

export function validateVehicles({ models = MODELS, atlas, complete = false, runtime = resolve(models) === MODELS } = {}) {
  models = resolve(models);
  const report = { ok: false, complete, assetCount: 0, lodCount: 0, totalBytes: 0, payloadBytes: 0, maxBytes: MAX_BYTES, files: [], assets: [], failures: [] };
  const capture = (label, fn) => { try { return fn(); } catch (e) { report.failures.push(`${label}: ${e.message}`); return null; } };
  const manifestFile = resolve(models, 'manifest.vehicles.json');
  const manifest = capture('manifest', () => json(manifestFile));
  if (!manifest) return report;
  const catalogueFile = resolve(ROOT, 'tools/blender/vehicles.catalog.json');
  const catalogueBytes = capture('catalogue', () => readFileSync(catalogueFile));
  const catalogue = catalogueBytes && capture('catalogue', () => JSON.parse(catalogueBytes).assets);
  if (!catalogue) return report;
  const declared = new Map(), measured = new Map(), files = new Set(), counted = new Set([manifestFile]);
  capture('manifest', () => {
    check(manifest.version === 1 && manifest.license === 'CC0-1.0', 'version 1 and CC0-1.0 licence required');
    check(Array.isArray(manifest.files) && manifest.files.length > 0, 'no generated GLB files declared');
    check(manifest.generator?.script === 'tools/blender/vehicles_build.py', 'missing generator provenance');
    check(manifest.generator?.catalogSha256 === sha256(catalogueBytes), 'catalogue SHA-256 is missing or stale');
    if (complete) check(manifest.complete === true, 'preview/partial library cannot pass complete mode');
  });
  for (const f of Array.isArray(manifest.files) ? manifest.files : []) capture(f.glb ?? 'file', () => {
    check(typeof f.glb === 'string' && /^vehicles\/[a-zA-Z0-9_-]+\.glb$/.test(f.glb), 'GLB must be one file under vehicles/');
    const path = inside(models, f.glb, 'vehicle GLB');
    check(!files.has(path), 'duplicate GLB file'); files.add(path); counted.add(path);
    const bytes = readFileSync(path); report.totalBytes += bytes.length;
    // Inspect first: corruption reports the binary fault as well as stale-hash failures in separate mutation tests.
    const actual = inspectVehicleGlb(bytes, f.glb);
    check(f.bytes === bytes.length && f.sha256 === sha256(bytes), 'byte count or SHA-256 differs from generated GLB');
    check(f.assets && typeof f.assets === 'object' && !Array.isArray(f.assets) && Object.keys(f.assets).length, 'empty or malformed assets map');
    const roots = new Set();
    for (const [key, meta] of Object.entries(f.assets)) capture(key, () => {
      const low = key.endsWith('_lod1'), baseKey = low ? key.slice(0, -5) : key, cat = catalogue[baseKey];
      check(cat && REQUIRED_KEYS.includes(baseKey) && !declared.has(key), 'unknown or duplicate asset key');
      check(meta?.node === key, 'asset root must equal catalogue key'); roots.add(key); declared.set(key, meta);
      const a = actual.assets.get(key); check(a, 'declared root absent from actual GLB'); measured.set(key, a);
      check(positive(meta.size, 3) && positive(meta.footprint, 2) && equal(meta.size, cat.size)
        && equal(meta.footprint, cat.footprint) && equal(meta.footprint, [cat.size[0], cat.size[2]]), 'size/footprint differs from catalogue');
      check(Array.isArray(meta.tags) && meta.tags.includes(low ? 'vehicle-lod' : 'vehicle') && meta.tags.includes(cat.family), 'missing vehicle/family tags');
      check(meta.origin === 'floor-centre' && (!low || meta.lod === 1), 'wrong origin or LOD metadata');
      check(meta.triangles === a.triangles && (meta.parts == null || meta.parts === a.parts), 'triangle/part count differs from actual bytes');
      check(equal(meta.bounds?.min, a.min) && equal(meta.bounds?.max, a.max), 'bounds differ from actual vertices');
      const [w, h, d] = cat.size;
      check(a.min[0] >= -w / 2 - 0.02 && a.max[0] <= w / 2 + 0.02 && a.min[2] >= -d / 2 - 0.02
        && a.max[2] <= d / 2 + 0.02 && Math.abs(a.min[1]) <= 0.02 && a.max[1] <= h + 0.02, 'geometry exceeds centred footprint or ground/height envelope');
      check(a.size.every((v, i) => v >= cat.size[i] * 0.70), 'collapsed geometry does not fill the catalogue silhouette');
      check(a.triangles <= (low ? MAX_FAR_TRIANGLES : MAX_NEAR_TRIANGLES), `measured ${a.triangles} triangles exceeds ${low ? MAX_FAR_TRIANGLES : MAX_NEAR_TRIANGLES} limit`);
      const expected = cat.wheels.map((code) => `${key}-wheel_${code}`), actualNames = a.wheels.map((wheel) => wheel.name);
      check(expected.length === WHEELS[baseKey] && Array.isArray(meta.wheels) && meta.wheels.length === expected.length
        && new Set(meta.wheels).size === expected.length && expected.every((name) => meta.wheels.includes(name) && actualNames.includes(name))
        && actualNames.length === expected.length, 'missing, extra or misnamed separate wheel pivot nodes');
      check(a.materials.includes('vehicle_paint'), 'shared paint atlas is not used by this vehicle');
      check(Number.isInteger(cat.paintTile) && cat.paintTile >= 0 && cat.paintTile < 16 && meta.paintTile === cat.paintTile
        && a.paintCells.includes(cat.paintTile), 'paint UVs do not select the catalogue paint tile (check Blender V conversion)');
      report.assets.push({ ...a });
    });
    check(roots.size === actual.assets.size && [...actual.assets.keys()].every((key) => roots.has(key)), 'unregistered scene roots in GLB');
    report.files.push({ path: f.glb, bytes: bytes.length, roots: actual.assets.size });
  });
  for (const [key, meta] of declared) capture(key, () => {
    if (key.endsWith('_lod1')) { report.lodCount++; check(declared.has(key.slice(0, -5)), 'orphan LOD1'); return; }
    report.assetCount++;
    check(meta.lod1 === key + '_lod1' && declared.has(meta.lod1), 'missing explicit far LOD');
    const near = measured.get(key), far = measured.get(meta.lod1);
    check(near && far, 'both LODs must contain measurable geometry');
    check(far.triangles <= near.triangles * 0.35, 'far LOD exceeds 35% of near triangles');
    check(equal(declared.get(meta.lod1).size, meta.size) && equal(declared.get(meta.lod1).footprint, meta.footprint), 'LOD silhouette metadata differs');
    for (let i = 0; i < near.wheels.length; i++) {
      const code = near.wheels[i].name.slice(key.length), other = far.wheels.find((wheel) => wheel.name === meta.lod1 + code);
      check(other && equal(other.pivot, near.wheels[i].pivot, 0.002), 'LOD wheel axles move when switching detail');
    }
  });
  const atlasFile = atlas ? resolve(atlas) : resolve(models, ATLAS_PATH);
  capture('paint atlas', () => {
    const a = manifest.atlas;
    check(a?.path === ATLAS_PATH && a.material === 'vehicle_paint', 'unexpected paint atlas path/material'); counted.add(atlasFile);
    const bytes = readFileSync(atlasFile); report.totalBytes += bytes.length;
    const png = inspectPaintPng(bytes);
    check(a.width === png.width && a.height === png.height && a.bytes === bytes.length && a.sha256 === sha256(bytes), 'paint atlas dimensions/bytes/SHA-256 differ from manifest');
    check(MATERIALS.vehicle_paint?.uv === 'unit', 'vehicle_paint is not registered as a unit-UV library material');
    const tiles = Object.entries(a.tiles ?? {});
    check(tiles.length === 16, 'paint atlas must declare all sixteen tiles');
    const cells = new Set();
    for (const [name, uv] of tiles) {
      check(finite(uv, 4) && uv[0] < uv[2] && uv[1] < uv[3], `invalid tile ${name}`);
      const c = atlasCell(uv[0], uv[1], name); check(c === atlasCell(uv[2], uv[3], name) && !cells.has(c), `duplicate or crossing tile ${name}`); cells.add(c);
    }
  });
  capture('payload', () => {
    for (const path of filesUnder(resolve(models, 'vehicles'))) { counted.add(path); if (!files.has(path)) report.failures.push(`unregistered payload file: ${relative(models, path)}`); }
    for (const path of filesUnder(dirname(atlasFile))) { counted.add(path); if (path !== atlasFile) report.failures.push(`unexpected extra atlas payload: ${path}`); }
  });
  for (const path of counted) capture('payload ' + relative(models, path), () => { report.payloadBytes += statSync(path).size; });
  capture('metadata totals', () => {
    check(manifest.assetCount === report.assetCount && manifest.lodCount === report.lodCount, 'assetCount/lodCount differs from generated roots');
    check(manifest.totalBytes === report.totalBytes, 'totalBytes differs from actual GLBs and paint atlas');
    check(report.payloadBytes < MAX_BYTES, `${report.payloadBytes} byte library payload reaches/exceeds ${MAX_BYTES} budget`);
  });
  if (complete) capture('complete library', () => {
    check(Object.keys(catalogue).length === REQUIRED_KEYS.length && REQUIRED_KEYS.every((key) => catalogue[key]), 'catalogue must contain the ten required vehicle designs');
    for (const key of REQUIRED_KEYS) for (const k of [key, key + '_lod1']) {
      check(declared.has(k) && report.assets.some((a) => a.key === k), `missing complete generated asset ${k}`);
    }
  });
  if (complete && runtime) capture('runtime registration', () => {
    check(json(resolve(models, 'manifest.json')).files?.includes('manifest.vehicles.json'), 'root model manifest does not register vehicles');
    const textureManifest = json(resolve(models, '../textures/manifest.json'));
    check(textureManifest.textures?.vehicle_paint?.map === 'vehicles/paint.png', 'texture manifest does not register shared paint atlas');
  });
  report.ok = report.failures.length === 0;
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--models' || a === '--atlas') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) { console.error(`${a} needs a path`); process.exit(2); }
      options[a.slice(2)] = resolve(args[++i]);
    } else if (a === '--complete' || a === '--runtime') options[a.slice(2)] = true;
    else if (a !== '--json') { console.error(`unknown option: ${a}`); process.exit(2); }
  }
  const report = validateVehicles(options);
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`${report.ok ? 'PASS' : 'FAIL'} vehicles: ${report.assetCount} designs + ${report.lodCount} far LODs; ${report.payloadBytes.toLocaleString('en-US')} / ${MAX_BYTES.toLocaleString('en-US')} bytes including atlas and manifest`);
    for (const a of report.assets.filter((asset) => !asset.key.endsWith('_lod1'))) {
      const far = report.assets.find((asset) => asset.key === a.key + '_lod1');
      console.log(`  ${a.key}: ${a.triangles} / ${far?.triangles ?? '?'} triangles, ${a.wheels.length} wheel pivots`);
    }
    for (const failure of report.failures) console.error(`  ${failure}`);
  }
  process.exitCode = report.ok ? 0 : 1;
}
