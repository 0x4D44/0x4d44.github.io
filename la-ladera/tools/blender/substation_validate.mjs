// Independent inspection of the bytes exported by Blender. No builder imports.
import '../../tests/nice.mjs';
import { readFileSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { Matrix4, Quaternion, Vector3 } from '../../vendor/three/build/three.core.min.js';
import { parseGlb } from './furn_validate.mjs';
import { validateSubstationPlan, validateYardParity } from '../substation_plan.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const MODELS = resolve(ROOT, 'assets/models');
export const LIMITS = Object.freeze({ glb: 6_000_000, textures: 8_000_000, gpu: 40_000_000, near: 3000, transformer: 6000, farRatio: 0.4 });
export const REQUIRED_SHARED = Object.freeze(('grid_transformer distribution_transformer oil_breaker_hv oil_breaker_mv breaker_truck portal_gantry disconnector_centre disconnector_pantograph current_transformer voltage_transformer surge_arrester post_insulator earth_switch busbar_tube busbar_wire_segment bushing insulator_disc insulator_string spacer radiator_fin switchboard_panel control_panel battery_bank charger desk chair schematic_board trench_cover transformer_bund fire_wall oil_store station_service_transformer floodlight_mast lightning_mast earth_marker hazard_board tag_holder gravel_tile concrete_tile dry_weeds').split(' ').map(k => 'substation_' + k));
export const REQUIRED_SITE = Object.freeze(('tower_suspension tower_tension pole_mv pole_lv fence_panel fence_post outrigger gate building_shell building_door louvre window roof').split(' '));
export const REQUIRED_TEXT = Object.freeze({
  uk: ['DANGER OF DEATH', 'DANGER – 132 000 VOLTS', 'KEEP OUT', 'NO UNAUTHORISED ACCESS', 'ELECTRICITY SUBSTATION', 'T1 132/33 kV', 'CB 33-2', 'TX2'],
  co: ['PELIGRO – ALTA TENSIÓN 115 000 V', 'PROHIBIDO EL PASO', 'NO TOCAR', 'SOLO PERSONAL AUTORIZADO', 'SUBESTACIÓN', 'T1 115/34.5 kV', 'OCB 34.5-2', 'S/E'],
});
// A reviewed language allow-list independent of the raster generator. Numeric
// designations and electrical units are deliberately shared technical markings.
const SIGN_TEXTS = [
  ['danger_death', 'DANGER OF DEATH', 'PELIGRO DE MUERTE'],
  ['voltage', 'DANGER – 132 000 VOLTS', 'PELIGRO – ALTA TENSIÓN 115 000 V'],
  ['keep_out', 'KEEP OUT', 'PROHIBIDO EL PASO'],
  ['authorised', 'NO UNAUTHORISED ACCESS', 'SOLO PERSONAL AUTORIZADO'],
  ['substation', 'ELECTRICITY SUBSTATION', 'SUBESTACIÓN'],
  ['grid_rating', 'T1 132/33 kV 40 MVA', 'T1 115/34.5 kV 40 MVA'],
  ['mv_breaker', 'CB 33-2', 'OCB 34.5-2'], ['tx2', 'TX2', 'S/E'],
  ['do_not_touch', 'DO NOT TOUCH', 'NO TOCAR'],
  ['isolate', 'ISOLATE BEFORE MAINTENANCE', 'AISLAR ANTES DEL MANTENIMIENTO'],
  ['earth', 'EARTH CONNECTION', 'CONEXIÓN A TIERRA'], ['battery', 'BATTERY ROOM', 'SALA DE BATERÍAS'],
  ['oil', 'INSULATING OIL', 'ACEITE AISLANTE'], ['fire', 'FIRE POINT', 'PUNTO CONTRA INCENDIOS'],
  ['control', 'CONTROL ROOM', 'SALA DE CONTROL'], ['emergency', 'EMERGENCY EXIT', 'SALIDA DE EMERGENCIA'],
  ['first_aid', 'FIRST AID', 'PRIMEROS AUXILIOS'], ['no_smoking', 'NO SMOKING', 'PROHIBIDO FUMAR'],
  ['live', 'LIVE EQUIPMENT', 'EQUIPO EN TENSIÓN'], ['circuit01', 'CIRCUIT 1', 'CIRCUITO 1'],
  ['circuit02', 'CIRCUIT 2', 'CIRCUITO 2'], ['circuit03', 'CIRCUIT 3', 'CIRCUITO 3'],
  ['dist_rating', 'T2 33/11 kV 15 MVA', 'T2 34.5/13.2 kV 15 MVA'],
  ['charger', 'BATTERY CHARGER', 'CARGADOR DE BATERÍAS'], ['neutral', 'NEUTRAL', 'NEUTRO'],
  ['gate', 'KEEP GATE CLOSED', 'MANTENER CERRADO'], ['inspection', 'SAFETY SIGNS', 'SEÑALIZACIÓN'],
  ['schematic', 'SINGLE LINE DIAGRAM', 'DIAGRAMA UNIFILAR'],
  ['number01', '01', '01'], ['number02', '02', '02'], ['number03', '03', '03'], ['number04', '04', '04'],
];
const CELL_ALIASES = { paint: 'paint_uk', porcelain: 'porcelain_brown', rust: 'rusted_steel', concrete: 'concrete_clean', concrete_weathered: 'concrete_damp', oil: 'oil_stain', render: 'rendered_block', dark: 'steel_dark', vegetation: 'dry_vegetation' };
const check = (v, m) => { if (!v) throw new Error(m); };
const finite = (v, n) => Array.isArray(v) && v.length === n && v.every(Number.isFinite);
const equal = (a, b, e = 1e-4) => finite(a, b?.length) && a.every((v, i) => Math.abs(v - b[i]) <= e);
export const sha256 = b => createHash('sha256').update(b).digest('hex');
export const lfBytes = b => Buffer.from(Buffer.from(b).toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
const json = p => JSON.parse(readFileSync(p, 'utf8'));
export const normalizeText = s => String(s).normalize('NFC').toUpperCase().replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim();
const IDENTITY = new Matrix4();

function within(root, path, label) {
  check(typeof path === 'string' && path.length && !isAbsolute(path), `${label}: invalid relative path`);
  const p = resolve(root, path), rel = relative(resolve(root), p);
  check(rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel), `${label}: path escapes directory`);
  if (existsSync(p)) {
    const actual = relative(realpathSync(root), realpathSync(p));
    check(actual !== '..' && !actual.startsWith('..' + sep) && !isAbsolute(actual), `${label}: symlink escapes directory`);
  }
  return p;
}
function allFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? allFiles(resolve(dir, e.name)) : [resolve(dir, e.name)]);
}
function matrix(n, label) {
  if (n.matrix) {
    check(finite(n.matrix, 16) && !n.translation && !n.rotation && !n.scale, `${label}: invalid matrix/TRS`);
    check(equal([n.matrix[3], n.matrix[7], n.matrix[11], n.matrix[15]], [0, 0, 0, 1]), `${label}: non-affine matrix`);
    const m = new Matrix4().fromArray(n.matrix); check(m.determinant() > 0, `${label}: collapsed/reflected matrix`); return m;
  }
  const t = n.translation ?? [0, 0, 0], q = n.rotation ?? [0, 0, 0, 1], s = n.scale ?? [1, 1, 1];
  check(finite(t, 3) && finite(q, 4) && finite(s, 3) && s.every(v => v > 0), `${label}: invalid transform`);
  check(Math.abs(Math.hypot(...q) - 1) < 1e-4, `${label}: non-unit quaternion`);
  return new Matrix4().compose(new Vector3(...t), new Quaternion(...q), new Vector3(...s));
}

/** Counts every drawn mesh instance, checks actual accessors, normals, UVs and hierarchy. */
export function inspectSubstationGlb(pathOrBytes, label = typeof pathOrBytes === 'string' ? pathOrBytes : 'substation GLB') {
  const bytes = typeof pathOrBytes === 'string' ? readFileSync(pathOrBytes) : Buffer.from(pathOrBytes);
  const parsed = parseGlb(bytes, label), { json: g, accessor } = parsed;
  check(!(g.skins?.length || g.animations?.length || g.cameras?.length), `${label}: unexpected animation/skin/camera`);
  check(g.scenes?.length === 1 && (g.scene ?? 0) === 0, `${label}: expected one default scene`);
  const nodes = g.nodes ?? [], roots = g.scenes[0].nodes ?? [], names = new Set(), seen = new Set(), assets = new Map();
  check(roots.length, `${label}: empty scene`);
  for (const n of nodes) { check(typeof n.name === 'string' && n.name && !names.has(n.name), `${label}: missing/duplicate node name`); names.add(n.name); }
  const checked = new Set();
  for (const ri of roots) {
    const root = nodes[ri]; check(root && /^substation_[a-z0-9_]+$/.test(root.name), `${label}: invalid root`);
    check(equal(matrix(root, label).elements, IDENTITY.elements), `${root.name}: root must be at base centre with identity transform`);
    const a = { key: root.name, triangles: 0, parts: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], pivots: [], nodeNames: [], materials: new Set(), meshRefs: [], primitiveCells: [] };
    function walk(ni, parent, pivot) {
      const n = nodes[ni], where = `${root.name}/${n?.name ?? ni}`;
      check(Number.isInteger(ni) && n && !seen.has(ni), `${where}: cyclic/shared/invalid node`); seen.add(ni);
      check(n.skin == null && n.camera == null && !Object.keys(n.extensions ?? {}).length, `${where}: unsupported node payload`);
      const m = parent.clone().multiply(matrix(n, where)); a.nodeNames.push(n.name);
      if (ni !== ri && n.mesh == null) {
        check(n.name.startsWith(root.name + '-'), `${where}: unnamed part/pivot`);
        pivot = { name: n.name, position: new Vector3().setFromMatrixPosition(m).toArray(), matrix: m.elements.slice(), triangles: 0 };
        a.pivots.push(pivot);
      }
      if (n.mesh != null) {
        check(Number.isInteger(n.mesh) && g.meshes?.[n.mesh]?.primitives?.length, `${where}: missing mesh`); a.meshRefs.push(n.mesh);
        for (const p of g.meshes[n.mesh].primitives) {
          check((p.mode ?? 4) === 4 && !p.targets && !p.extensions, `${where}: only uncompressed triangles supported`);
          const pos = accessor(p.attributes?.POSITION), nor = accessor(p.attributes?.NORMAL), uv = accessor(p.attributes?.TEXCOORD_0);
          check(pos.type === 'VEC3' && pos.componentType === 5126 && !pos.normalized && nor.type === 'VEC3' && uv.type === 'VEC2' && pos.count === nor.count && pos.count === uv.count, `${where}: malformed attributes`);
          const col = p.attributes?.COLOR_0 == null ? null : accessor(p.attributes.COLOR_0);
          check(!col || ([3, 4].includes(col.width) && col.count === pos.count && col.values.every(v => v >= 0 && v <= 1.00001)), `${where}: malformed vertex colour`);
          if (!checked.has(p.attributes.POSITION)) {
            const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
            for (let i = 0; i < pos.count; i++) for (let d = 0; d < 3; d++) { lo[d] = Math.min(lo[d], pos.values[i * 3 + d]); hi[d] = Math.max(hi[d], pos.values[i * 3 + d]); }
            check(equal(pos.min, lo) && equal(pos.max, hi), `${where}: accessor bounds differ from binary vertices`); checked.add(p.attributes.POSITION);
          }
          const mat = g.materials?.[p.material]?.name;
          check(mat && /^substation_[a-z0-9_]+$/.test(mat), `${where}: invalid material '${mat}'`); a.materials.add(mat); a.parts++;
          for (let i = 0; i < pos.count; i++) {
            const l = Math.hypot(nor.values[i * 3], nor.values[i * 3 + 1], nor.values[i * 3 + 2]);
            check(l > 0.98 && l < 1.02, `${where}: non-unit normal`);
            check(uv.values[i * 2] >= -1e-6 && uv.values[i * 2] <= 1.000001 && uv.values[i * 2 + 1] >= -1e-6 && uv.values[i * 2 + 1] <= 1.000001, `${where}: UV outside 0..1`);
          }
          const idx = p.indices == null ? null : accessor(p.indices), count = idx?.count ?? pos.count;
          check(count > 0 && count % 3 === 0 && (!idx || idx.type === 'SCALAR' && [5121, 5123, 5125].includes(idx.componentType) && !idx.normalized), `${where}: invalid triangle indices`);
          const used = new Set();
          for (let i = 0; i < count; i += 3) {
            const ids = [0, 1, 2].map(j => idx ? idx.values[i + j] : i + j);
            check(ids.every(j => Number.isInteger(j) && j >= 0 && j < pos.count), `${where}: index outside vertices`); ids.forEach(j => used.add(j));
            const [v0, v1, v2] = ids.map(j => new Vector3().fromArray(pos.values, j * 3));
            const face = v1.sub(v0).cross(v2.sub(v0)), area = face.length();
            check(area > 1e-12, `${where}: degenerate triangle`);
            const normal = new Vector3(); ids.forEach(j => normal.add(new Vector3().fromArray(nor.values, j * 3)));
            check(face.dot(normal) >= -area * 1e-5, `${where}: winding disagrees with normals`);
          }
          for (const j of used) {
            const v = new Vector3().fromArray(pos.values, j * 3).applyMatrix4(m).toArray(); check(v.every(Number.isFinite), `${where}: non-finite vertex`);
            for (let d = 0; d < 3; d++) { a.min[d] = Math.min(a.min[d], v[d]); a.max[d] = Math.max(a.max[d], v[d]); }
          }
          const uvMin = [Infinity, Infinity], uvMax = [-Infinity, -Infinity];
          for (let j = 0; j < uv.count; j++) for (let d = 0; d < 2; d++) { uvMin[d] = Math.min(uvMin[d], uv.values[j * 2 + d]); uvMax[d] = Math.max(uvMax[d], uv.values[j * 2 + d]); }
          a.primitiveCells.push({ material: mat, node: n.name, uvMin, uvMax });
          a.triangles += count / 3; if (pivot) pivot.triangles += count / 3;
        }
      }
      for (const ci of n.children ?? []) walk(ci, m, pivot);
    }
    walk(ri, IDENTITY, null);
    check(a.triangles > 0 && a.max.every((v, i) => v > a.min[i]), `${root.name}: empty/collapsed asset`);
    a.materials = [...a.materials]; a.size = a.max.map((v, i) => v - a.min[i]);
    a.repeatedMeshInstances = a.meshRefs.length - new Set(a.meshRefs).size;
    assets.set(root.name, a);
  }
  check(seen.size === nodes.length, `${label}: orphan nodes`);
  return { bytes: bytes.length, assets, gltf: g, binary: parsed.bin };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, v) => { let c = v; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export function crc32(b) { let c = 0xffffffff; for (const v of b) c = CRC_TABLE[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
/** Fully unfilters PNG pixels; texture validation never trusts only image headers. */
export function decodePng(b) {
  check(b.length >= 45 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'invalid PNG signature');
  let offset = 8, head, ended = false; const chunks = [];
  while (offset < b.length) {
    check(offset + 12 <= b.length, 'truncated PNG chunk'); const n = b.readUInt32BE(offset), end = offset + 8 + n, type = b.toString('ascii', offset + 4, offset + 8);
    check(end + 4 <= b.length && crc32(b.subarray(offset + 4, end)) === b.readUInt32BE(end), `PNG ${type} CRC/range error`);
    if (!head) { check(type === 'IHDR' && n === 13, 'PNG must begin with IHDR'); head = b.subarray(offset + 8, end); } else check(type !== 'IHDR', 'duplicate PNG header');
    if (type === 'IDAT') chunks.push(b.subarray(offset + 8, end));
    if (type === 'IEND') { check(n === 0 && end + 4 === b.length, 'PNG trailing data'); ended = true; }
    offset = end + 4;
  }
  check(ended && chunks.length, 'PNG missing pixels/end');
  const width = head.readUInt32BE(0), height = head.readUInt32BE(4), channels = { 2: 3, 6: 4 }[head[9]];
  check(width > 0 && height > 0 && width <= 2048 && height <= 2048 && head[8] === 8 && channels && head[10] === 0 && head[11] === 0 && head[12] === 0, 'unsupported PNG dimensions/format');
  const stride = width * channels, raw = inflateSync(Buffer.concat(chunks), { maxOutputLength: (stride + 1) * height });
  check(raw.length === (stride + 1) * height, 'PNG raster size mismatch'); const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]; check(filter <= 4, 'invalid PNG row filter');
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0, c = x >= channels && y ? pixels[(y - 1) * stride + x - channels] : 0, u = y ? pixels[(y - 1) * stride + x] : 0;
      const p = a + u - c, pa = Math.abs(p - a), pb = Math.abs(p - u), pc = Math.abs(p - c);
      const predictor = [0, a, u, Math.floor((a + u) / 2), pa <= pb && pa <= pc ? a : pb <= pc ? u : c][filter];
      pixels[y * stride + x] = (raw[y * (stride + 1) + x + 1] + predictor) & 255;
    }
  }
  return { width, height, channels, pixels };
}
export function cellPixelHash(image, rect) {
  check(finite(rect, 4) && rect.every(Number.isInteger), 'invalid pixel rectangle');
  const [x, y, w, h] = rect; check(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= image.width && y + h <= image.height, 'cell outside atlas');
  const rgb = Buffer.alloc(w * h * 3);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) for (let c = 0; c < 3; c++) rgb[(j * w + i) * 3 + c] = image.pixels[((y + j) * image.width + x + i) * image.channels + c];
  return sha256(rgb);
}
export function gpuBytes(width, height) { let n = 0; for (;;) { n += width * height * 4; if (width === 1 && height === 1) return n; width = Math.max(1, width >> 1); height = Math.max(1, height >> 1); } }

export function validateSubstation({ models = MODELS, project = ROOT, complete = false, variant = 'both', checkPlans = true } = {}) {
  models = resolve(models); project = resolve(project);
  const report = { ok: false, complete, variants: variant === 'both' ? ['uk', 'co'] : [variant], assetCount: 0, lodCount: 0, modelBytes: 0, textureBytes: 0, gpuBytes: 0, sharedIdentity: false, failures: [] };
  const capture = (label, fn) => { try { return fn(); } catch (e) { report.failures.push(`${label}: ${e.message}`); return null; } };
  const manifest = capture('manifest', () => json(resolve(models, 'manifest.substation.json')));
  const catalogueBytes = capture('catalogue', () => readFileSync(resolve(project, 'tools/blender/substation.catalog.json')));
  const catalogue = catalogueBytes && capture('catalogue', () => JSON.parse(catalogueBytes).assets);
  if (!manifest || !catalogue) return report;
  const measured = new Map(), declared = new Map(), files = new Map();
  capture('manifest', () => {
    check(manifest.version === 1 && manifest.license === 'CC0-1.0' && manifest.libraryOnly === true, 'version/licence/libraryOnly contract');
    check(manifest.units === 'metres' && manifest.axes?.up === '+Y' && manifest.axes?.front === '+Z', 'metre axes contract');
    check(manifest.generator?.catalogSha256 === sha256(lfBytes(catalogueBytes)), 'catalogue LF SHA-256 stale');
    if (complete) check(manifest.complete === true, 'partial/preview library cannot pass --complete');
    check(report.variants.every(v => ['uk', 'co'].includes(v)), 'unknown variant');
    if (complete) {
      for (const key of REQUIRED_SHARED) check(catalogue[key]?.shared === true, `required shared type missing: ${key}`);
      for (const v of ['uk', 'co']) for (const key of REQUIRED_SITE) check(catalogue[`substation_${v}_${key}`]?.variant === v, `required site type missing: ${v}/${key}`);
    }
  });
  for (const f of manifest.files ?? []) capture(f.glb ?? 'GLB', () => {
    check(/^substation\/[a-z0-9_]+\.glb$/.test(f.glb), 'GLB must be under substation/');
    const path = within(models, f.glb, 'GLB'); check(!files.has(path), 'duplicate file binding');
    const bytes = readFileSync(path), decoded = inspectSubstationGlb(bytes, f.glb); report.modelBytes += bytes.length; files.set(path, f);
    check(f.bytes === bytes.length && f.sha256 === sha256(bytes), 'GLB byte/SHA-256 pin differs');
    const keys = new Set();
    for (const [key, m] of Object.entries(f.assets ?? {})) capture(key, () => {
      const low = key.endsWith('_lod1'), base = low ? key.slice(0, -5) : key, cat = catalogue[base], a = decoded.assets.get(key);
      check(cat && a && !declared.has(key) && m.node === key, 'unknown/duplicate/absent root');
      keys.add(key); measured.set(key, a); declared.set(key, m);
      check(f.variant === (cat.shared ? 'shared' : cat.variant), 'asset in wrong shared/variant file');
      check(equal(m.size, cat.size) && m.origin === 'floor-centre' && (low ? m.lod === 1 : m.lod1 === key + '_lod1'), 'catalogue size/origin/LOD metadata mismatch');
      check(m.triangles === a.triangles && m.parts === a.parts, 'drawn triangle/part count differs');
      check(equal(m.bounds?.min, a.min) && equal(m.bounds?.max, a.max), 'manifest bounds differ from vertices');
      const tol = 0.03;
      check(equal(a.size, cat.size, tol), `metre dimensions differ: ${JSON.stringify(a.size)} versus ${JSON.stringify(cat.size)}`);
      check(Math.abs(a.min[1]) <= 1e-4 && Math.abs((a.min[0] + a.max[0]) / 2) <= tol && Math.abs((a.min[2] + a.max[2]) / 2) <= tol, 'origin is not ground/base centre');
      const max = /^(substation_grid_transformer|substation_distribution_transformer)$/.test(base) ? LIMITS.transformer : LIMITS.near;
      check(low || a.triangles <= max, `near triangle cap ${max} exceeded`);
      for (const p of cat.pivots ?? []) {
        const suffix = typeof p === 'string' ? p : p.name, name = key + '-' + suffix, actual = a.pivots.find(v => v.name === name);
        check(actual && actual.triangles > 0, `missing/empty named pivot ${name}`);
      }
      for (const pivot of m.pivots ?? []) check(a.pivots.some(p => p.name === pivot.name && equal(p.position, pivot.position)), 'manifest pivot differs from bytes');
    });
    check(keys.size === decoded.assets.size && [...decoded.assets.keys()].every(k => keys.has(k)), 'GLB contains unregistered roots');
  });
  for (const [key, cat] of Object.entries(catalogue)) capture(key + '/LOD', () => {
    const a = measured.get(key), b = measured.get(key + '_lod1');
    if (!complete && !a && !b) return;
    check(a && b, 'near/far pair missing'); report.assetCount++; report.lodCount++;
    check(b.triangles <= a.triangles * LIMITS.farRatio, `far triangles ${b.triangles} exceed 40% of ${a.triangles}`);
    for (const p of cat.pivots ?? []) {
      const suffix = typeof p === 'string' ? p : p.name, pa = a.pivots.find(v => v.name === key + '-' + suffix), pb = b.pivots.find(v => v.name === key + '_lod1-' + suffix);
      check(pa && pb && equal(pa.matrix, pb.matrix), `pivot ${suffix} drifts between LODs`);
    }
    if (cat.requireInstancing) check(a.repeatedMeshInstances > 0, 'repeated parts are not mesh instances');
  });
  capture('shared identity', () => {
    const u = manifest.variants?.uk, c = manifest.variants?.co;
    check(u?.language === 'en' && c?.language === 'es' && equal(u.voltageKV, [132, 33, 11]) && equal(c.voltageKV, [115, 34.5, 13.2]), 'variant voltage/language mismatch');
    check(u.shared?.glb === c.shared?.glb && u.shared?.sha256 === c.shared?.sha256, 'shared geometry must be a single byte-identical file reference');
    const shared = files.get(resolve(models, u.shared?.glb ?? ''));
    check(shared?.variant === 'shared' && shared.sha256 === u.shared.sha256, 'shared binding not equal to checked bytes');
    check((manifest.files ?? []).filter(f => f.variant === 'shared').length === 1, 'shared geometry must be stored once');
    for (const v of ['uk', 'co']) {
      const expected = (manifest.files ?? []).filter(f => f.variant === v).map(f => f.glb).sort();
      const actual = manifest.variants[v].files;
      check(Array.isArray(actual) && JSON.stringify([...actual].sort()) === JSON.stringify(expected), `${v}: variant file bindings differ from checked GLBs`);
    }
    report.sharedIdentity = true;
  });
  capture('model budget', () => {
    check(report.modelBytes <= LIMITS.glb, `GLBs ${report.modelBytes} exceed ${LIMITS.glb}`);
    check(manifest.modelBytes === report.modelBytes, 'model total differs from decoded files');
    for (const p of allFiles(resolve(models, 'substation'))) check(files.has(p), `unregistered model payload: ${p}`);
  });
  const textureRoot = resolve(models, '../textures/substation');
  const atlas = capture('texture metadata', () => json(resolve(textureRoot, 'atlas.json')));
  if (atlas) {
    capture('texture metadata pin', () => {
      const bytes = lfBytes(readFileSync(resolve(textureRoot, 'atlas.json')));
      check(manifest.textureMetadata?.path === '../textures/substation/atlas.json', 'texture metadata path differs');
      check(manifest.textureMetadata?.bytesLF === bytes.length && manifest.textureMetadata?.sha256LF === sha256(bytes), 'texture metadata LF byte/SHA-256 pin differs');
    });
    capture('atlas coordinate contract', () => {
      check(atlas.shared.columns === 8 && atlas.shared.rows === 4 && atlas.shared.gutter === 4 && Object.keys(atlas.shared.cells).length === 32, 'shared atlas grid differs');
      const ids = new Set();
      for (const cell of Object.values(atlas.shared.cells)) {
        check(Number.isInteger(cell.index) && cell.index >= 0 && cell.index < 32 && !ids.has(cell.index), 'shared atlas cell index invalid/duplicate'); ids.add(cell.index);
        const x = cell.index % 8 * 128, y = (3 - Math.floor(cell.index / 8)) * 256;
        check(equal(cell.rect, [x, y, 128, 256]) && equal(cell.uv, [(x + 4) / 1024, (1024 - y - 256 + 4) / 1024, (x + 128 - 4) / 1024, (1024 - y - 4) / 1024]), 'shared cell UV does not match its pixel rectangle');
      }
      for (const v of ['uk', 'co']) for (let i = 0; i < SIGN_TEXTS.length; i++) {
        const cell = atlas.variants[v].cells.find(c => c.id === SIGN_TEXTS[i][0]);
        check(cell && cell.index === i, `${v}: sign cell identity/order differs`);
        const x = i % 4 * 512, y = Math.floor(i / 4) * 128;
        check(equal(cell.rect, [x, y, 512, 128]) && equal(cell.uv, [(x + 8) / 2048, (1024 - y - 128 + 8) / 1024, (x + 512 - 8) / 2048, (1024 - y - 8) / 1024]), `${v}/${cell.id}: cell UV does not match its pixel rectangle`);
      }
    });
    capture('material cells', () => {
      for (const [key, asset] of measured) for (const p of asset.primitiveCells) {
        const bare = p.material.replace(/^substation_/, ''), cell = atlas.shared?.cells?.[CELL_ALIASES[bare] ?? bare];
        const insideCell = uv => p.uvMin[0] >= uv[0] - 1e-5 && p.uvMin[1] >= uv[1] - 1e-5 && p.uvMax[0] <= uv[2] + 1e-5 && p.uvMax[1] <= uv[3] + 1e-5;
        if (p.material === 'substation_signs') {
          const valid = atlas.variants.uk.cells.filter(c => insideCell(c.uv));
          check(valid.length === 1, `${key}/${p.node}: sign UVs cross cells/gutters`);
          const base = key.replace(/_lod1$/, '');
          const role = { substation_grid_transformer: 'grid_rating', substation_distribution_transformer: 'dist_rating', substation_hazard_board: 'voltage', substation_tag_holder: 'mv_breaker', substation_schematic_board: 'schematic' }[base];
          if (role) check(valid[0].id === role, `${key}: sign UVs use wrong role (${valid[0].id}, expected ${role})`);
        } else {
          check(cell && finite(cell.uv, 4) && insideCell(cell.uv), `${key}/${p.node}: UVs outside named material cell ${p.material}`);
        }
      }
      for (const v of ['uk', 'co']) {
        check(manifest.variants[v].signAtlas === '../textures/substation/' + atlas.variants[v].atlas.path, `${v}: sign atlas binding differs from its own language atlas`);
        check(JSON.stringify(manifest.variants[v].materialBindings) === JSON.stringify(atlas.variants[v].materials), `${v}: stale variant material bindings`);
        for (const [name, binding] of Object.entries(atlas.variants[v].materials)) {
          if (name !== 'substation_signs') check(atlas.shared.cells[binding.cell], `${v}: unknown variant paint/porcelain cell`);
        }
      }
    });
    const images = new Map();
    const inspectTexture = (meta, label) => capture(label, () => {
      const path = within(textureRoot, meta.path, label), bytes = readFileSync(path), image = decodePng(bytes);
      check(meta.bytes === bytes.length && meta.sha256 === sha256(bytes), 'texture byte/SHA-256 pin differs');
      check(image.width === meta.width && image.height === meta.height, 'decoded texture dimensions differ');
      check(!images.has(path), 'duplicate bitmap file'); images.set(path, image); report.textureBytes += bytes.length; report.gpuBytes += gpuBytes(image.width, image.height);
      return image;
    });
    for (const channel of ['baseColor', 'normal', 'orm']) {
      const image = inspectTexture(atlas.shared?.[channel], `shared/${channel}`);
      if (image) capture('shared/' + channel + '/shape', () => check(image.width === 1024 && image.height === 1024, 'shared PBR atlas must be 1024 square'));
    }
    for (const v of ['uk', 'co']) {
      const data = atlas.variants?.[v], im = inspectTexture(data?.atlas, `${v}/signs`);
      if (!im) continue;
      capture(v + '/sign-shape', () => check(im.width === 2048 && im.height === 1024, 'sign atlas must be 2048 by 1024'));
      capture(v + '/text', () => {
        const cells = data.cells; check(Array.isArray(cells) && cells.length === SIGN_TEXTS.length, 'incomplete canonical signs/tags');
        const seenIds = new Set(), texts = new Set();
        for (const cell of cells) {
          check(cell.id && !seenIds.has(cell.id), 'duplicate sign cell'); seenIds.add(cell.id);
          check(cell.language === (v === 'uk' ? 'en' : 'es'), 'wrong cell language');
          check(cell.pixelSha256 === cellPixelHash(im, cell.rect), `OCR pixel pin differs: ${cell.id}`);
          const expected = normalizeText(cell.text), detected = normalizeText(cell.detectedText);
          check(expected && detected === expected, `OCR differs from label including accents: ${cell.id}: ${detected} / ${expected}`);
          const canonical = SIGN_TEXTS.find(r => r[0] === cell.id)?.[v === 'uk' ? 1 : 2];
          check(canonical && normalizeText(canonical) === detected, `foreign-language or unapproved canonical text in ${v} atlas: ${cell.id}`);
          check(!/[\uFFFD]/u.test(cell.text + cell.detectedText), 'replacement glyph in sign');
          const foreign = v === 'co' ? /\b(DANGER|DEATH|KEEP|OUT|UNAUTHORISED|ELECTRICITY|VOLTAGE|ACCESS|WARNING|NO ENTRY)\b/ : /\b(PELIGRO|TENSIÓN|PROHIBIDO|PASO|TOCAR|SOLO PERSONAL|SUBESTACIÓN|SEÑALIZACIÓN|ACEITE|TIERRA)\b/;
          check(!foreign.test(detected), `foreign-language text in ${v} atlas: ${detected}`); texts.add(expected);
        }
        for (const text of REQUIRED_TEXT[v]) check([...texts].some(t => t === normalizeText(text) || t.startsWith(normalizeText(text) + ' ')), `required label missing: ${text}`);
        if (v === 'co') check(cells.some(c => c.detectedText.includes('Ñ')), 'Ñ has no detected glyph evidence');
      });
    }
    capture('texture budget', () => {
      for (const p of allFiles(textureRoot)) { if (!images.has(p)) { check(p === resolve(textureRoot, 'atlas.json'), `unregistered texture payload: ${p}`); report.textureBytes += readFileSync(p).length; } }
      check(report.textureBytes <= LIMITS.textures, `textures ${report.textureBytes} exceed ${LIMITS.textures}`);
      check(report.gpuBytes <= LIMITS.gpu, `GPU textures ${report.gpuBytes} exceed ${LIMITS.gpu}`);
      if (atlas.gpuBytesRGBA8WithMips != null) check(atlas.gpuBytesRGBA8WithMips === report.gpuBytes, 'GPU estimate differs from decoded dimensions/full mip chains');
      check(manifest.gpuBytesRGBA8WithMips === report.gpuBytes, 'manifest GPU byte total differs');
    });
    capture('manifest texture pins', () => {
      const seen = new Set();
      check(Array.isArray(manifest.textures), 'manifest texture inventory missing');
      for (const pin of manifest.textures) {
        check(/^\.\.\/textures\/substation\/[a-z0-9.-]+$/.test(pin.path), 'manifest texture path differs');
        const path = within(textureRoot, pin.path.split('/').at(-1), 'texture pin');
        check(!seen.has(path), 'duplicate manifest texture pin'); seen.add(path);
        const bytes = readFileSync(path), im = images.get(path);
        if (im) {
          check(pin.bytes === bytes.length && pin.sha256 === sha256(bytes), 'manifest texture byte/SHA-256 pin differs');
          check(pin.width === im.width && pin.height === im.height && pin.gpuBytes === gpuBytes(im.width, im.height), 'manifest texture dimensions/GPU bytes differ');
        } else {
          check(path === resolve(textureRoot, 'atlas.json'), 'manifest references unknown texture metadata');
          const lf = lfBytes(bytes); check(pin.bytesLF === lf.length && pin.sha256LF === sha256(lf), 'manifest texture LF byte/SHA-256 pin differs');
        }
      }
      check(seen.size === images.size + 1 && [...images.keys()].every(p => seen.has(p)) && seen.has(resolve(textureRoot, 'atlas.json')), 'manifest texture inventory differs from checked files');
    });
  }
  capture('boot isolation', () => {
    const boot = json(resolve(project, 'assets/models/manifest.json')), text = JSON.stringify(boot);
    check(!/substation/i.test(text), 'substation accidentally registered in game boot manifest');
    for (const p of allFiles(resolve(project, 'js'))) if (/\.(m?js|json)$/.test(p)) check(!/manifest\.substation|assets\/(?:models|textures)\/substation/.test(readFileSync(p, 'utf8')), 'game code loads substation library');
  });
  if (checkPlans) capture('yard plan pins', () => {
    check(Array.isArray(manifest.plans) && manifest.plans.length === 2, 'two yard plan pins required');
    const plans = {};
    for (const pin of manifest.plans) {
      const bytes = lfBytes(readFileSync(within(project, pin.path, 'plan')));
      check(pin.sha256LF === sha256(bytes) && pin.bytesLF === bytes.length, 'yard LF byte/SHA-256 pin differs');
      const plan = JSON.parse(bytes); check(['uk', 'co'].includes(plan.variant), 'unknown plan variant'); plans[plan.variant] = plan;
      for (const type of Object.values(plan.equipmentTypes ?? {})) check(catalogue[type.variantBinding?.asset], `yard references unknown asset ${type.variantBinding?.asset}`);
      const result = validateSubstationPlan(plan, { catalogue: { assets: catalogue } });
      check(result.ok, result.failures.join('; '));
    }
    const parity = validateYardParity(plans.uk, plans.co); check(parity.ok, parity.failures.join('; '));
  });
  capture('complete counts', () => { check(manifest.assetCount === report.assetCount, 'manifest asset count differs'); });
  report.ok = report.failures.length === 0; return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), value = k => { const i = args.indexOf(k); return i < 0 ? undefined : args[i + 1]; };
  if (args.includes('--inspect')) {
    const r = inspectSubstationGlb(value('--inspect')); console.log(JSON.stringify([...r.assets.values()]));
  } else {
    const report = validateSubstation({ models: value('--models'), project: value('--project'), variant: value('--variant') ?? 'both', complete: args.includes('--complete'), checkPlans: !args.includes('--geometry-only') });
    if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`${report.ok ? 'PASS' : 'FAIL'} substation --${report.complete ? 'complete' : 'preview'} variants=${report.variants.join(',')}: ${report.assetCount} near + ${report.lodCount} far roots`);
      console.log(`GLB ${report.modelBytes}/${LIMITS.glb} bytes; textures ${report.textureBytes}/${LIMITS.textures} bytes; RGBA8+mips ${report.gpuBytes}/${LIMITS.gpu} bytes; shared byte identity ${report.sharedIdentity ? 'PASS' : 'FAIL'}`);
      for (const f of report.failures) console.log('FAIL ' + f);
    }
    process.exitCode = report.ok ? 0 : 1;
  }
}
