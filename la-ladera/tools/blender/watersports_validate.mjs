// Independent acceptance gate for the unloaded watersports library.
// node la-ladera/tools/blender/watersports_validate.mjs --complete [--models DIR] [--json]
import '../../tests/nice.mjs';
import { readFileSync, readdirSync, existsSync, realpathSync, statSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { Matrix3, Matrix4, Quaternion, Ray, Vector3 } from '../../vendor/three/build/three.core.min.js';
import { parseGlb } from './furn_validate.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const MODELS = resolve(ROOT, 'assets/models');
export const MAX_GLB_BYTES = 2_500_000;
export const MAX_TEXTURE_BYTES = 4_000_000;
export const MAX_NEAR_TRIANGLES = 1500;
export const MAX_LOD_RATIO = 0.40;
// Kept independent of the editable catalogue: removing a design in both JSON
// files cannot turn a partial library into a successful --complete build.
export const REQUIRED_KEYS = Object.freeze([
  'watersports_windsurf_rig',
  'watersports_windsurf_sand',
  'watersports_windsurf_derigged',
  'watersports_sup_a',
  'watersports_sup_b',
  'watersports_sup_c',
  'watersports_paddle',
  'watersports_kiteboard',
  'watersports_foilboard',
  'watersports_kite_bar',
  'watersports_kite_flying',
  'watersports_kite_sand',
  'watersports_kayak_single',
  'watersports_kayak_double',
  'watersports_rowing_boat',
  'watersports_lancha',
  'watersports_oar',
  'watersports_anchor',
  'watersports_rope_coil',
  'watersports_lifebuoy',
  'watersports_wooden_boat_maria_del_mar',
  'watersports_wooden_boat_la_esperanza',
  'watersports_wooden_boat_san_pedro',
  'watersports_wooden_boat_brisa',
  'watersports_buoy',
  'watersports_bell_buoy',
  'watersports_swimline_segment',
  'watersports_diving_raft',
  'watersports_sunken_moped',
  'watersports_sunken_anchor_tyre',
  'watersports_pier_deck',
  'watersports_pier_pile',
  'watersports_pier_crossbrace',
  'watersports_pier_handrail',
  'watersports_pier_post',
  'watersports_mooring_cleat',
  'watersports_pier_ladder',
  'watersports_rod_holder',
  'watersports_pier_lamp',
  'watersports_bait_crate',
  'watersports_pier_end_platform',
]);
const IDENTITY = new Matrix4();
const finite = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
const positive = (a, n) => finite(a, n) && a.every((x) => x > 0);
const equal = (a, b, e = 1e-4) => finite(a, b.length) && a.every((v, i) => Math.abs(v - b[i]) <= e);
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const textSha256 = (bytes) => sha256(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8'));
const check = (ok, message) => { if (!ok) throw new Error(message); };
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));

function inside(root, path, label) {
  check(typeof path === 'string' && path.length && !isAbsolute(path), `${label}: invalid relative path`);
  const result = resolve(root, path), rel = relative(resolve(root), result);
  check(rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel), `${label}: path escapes directory`);
  if (existsSync(result)) {
    const real = relative(realpathSync(root), realpathSync(result));
    check(real !== '..' && !real.startsWith('..' + sep) && !isAbsolute(real), `${label}: symlink escapes directory`);
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

/** Decode every accessor and count rendered instances; no builder measurements are trusted. */
export function inspectWatersportsGlb(bytesOrPath, label = typeof bytesOrPath === 'string' ? bytesOrPath : 'watersports GLB') {
  const bytes = typeof bytesOrPath === 'string' ? readFileSync(bytesOrPath) : bytesOrPath;
  const parsed = parseGlb(bytes, label), { json: g, accessor } = parsed;
  check(!(g.animations?.length || g.skins?.length || g.cameras?.length), `${label}: offline props must not include animations, skins or cameras`);
  check(g.scenes?.length === 1 && (g.scene ?? 0) === 0, `${label}: expected one default scene`);
  const nodes = g.nodes ?? [], roots = g.scenes[0].nodes ?? [], seen = new Set(), names = new Set(), assets = new Map();
  const checked = new Set(), meshUses = new Map();
  check(roots.length > 0, `${label}: empty scene`);
  for (const n of nodes) {
    check(typeof n.name === 'string' && n.name.length && !names.has(n.name), `${label}: missing or duplicate node name '${n.name}'`);
    names.add(n.name);
  }
  for (const ri of roots) {
    const root = nodes[ri];
    check(root && /^watersports_[a-z0-9_]+$/.test(root.name), `${label}: invalid watersports scene root`);
    check(equal(nodeMatrix(root, label).elements, IDENTITY.elements), `${root.name}: scene root must have identity transform`);
    const result = { key: root.name, triangles: 0, parts: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity],
      materials: new Set(), pivots: [], nodeNames: [], nodes: [], meshIds: new Set(), uvBounds: [Infinity, Infinity, -Infinity, -Infinity] };
    function walk(ni, parent, parentPivots = [], parentName = null) {
      const n = nodes[ni], where = `${label}:${root.name}:${n?.name ?? ni}`;
      check(Number.isInteger(ni) && n && !seen.has(ni), `${where}: cyclic/shared/invalid node`); seen.add(ni);
      check(n.skin == null && n.camera == null && !Object.keys(n.extensions ?? {}).length, `${where}: unsupported node payload`);
      result.nodeNames.push(n.name);
      const local = nodeMatrix(n, where), m = parent.clone().multiply(local);
      const pos = new Vector3().setFromMatrixPosition(m).toArray();
      const localPosition = new Vector3().setFromMatrixPosition(local).toArray();
      result.nodes.push({ name: n.name, parent: parentName, position: pos, localPosition, matrix: m.toArray(), localMatrix: local.toArray(), mesh: n.mesh ?? null });
      let activePivots = parentPivots;
      if (/-pivot_[a-z0-9_]+$/.test(n.name)) {
        check(n.name.startsWith(root.name + '-pivot_'), `${where}: misnamed moving-part pivot`);
        const pivot = { name: n.name, parent: parentName, position: pos, localPosition, matrix: m.toArray(), localMatrix: local.toArray(), triangles: 0 };
        result.pivots.push(pivot);
        activePivots = [...parentPivots, pivot];
      }
      if (n.mesh != null) {
        check(Number.isInteger(n.mesh) && g.meshes?.[n.mesh]?.primitives?.length, `${where}: invalid or empty mesh`);
        result.meshIds.add(n.mesh); meshUses.set(n.mesh, (meshUses.get(n.mesh) ?? 0) + 1);
        for (const p of g.meshes[n.mesh].primitives) {
          check((p.mode ?? 4) === 4 && !p.targets && !p.extensions, `${where}: only uncompressed triangle primitives are supported`);
          const position = accessor(p.attributes?.POSITION), normal = accessor(p.attributes?.NORMAL), uv = accessor(p.attributes?.TEXCOORD_0);
          check(position.type === 'VEC3' && position.componentType === 5126 && !position.normalized
            && normal.type === 'VEC3' && uv.type === 'VEC2' && position.count === normal.count && position.count === uv.count, `${where}: malformed position/normal/UV attributes`);
          const color = p.attributes?.COLOR_0 == null ? null : accessor(p.attributes.COLOR_0);
          check(!color || ([3, 4].includes(color.width) && color.count === position.count && color.values.every((v) => v >= 0 && v <= 1.00001)), `${where}: malformed vertex colour`);
          if (!checked.has(p.attributes.POSITION)) { checkPositionBounds(position, where); checked.add(p.attributes.POSITION); }
          const mat = g.materials?.[p.material]?.name;
          check(mat && /^watersports_(?:atlas|window|alpha|fabric)$/.test(mat), `${where}: unknown watersports library material '${mat}'`);
          result.materials.add(mat); result.parts++;
          for (let i = 0; i < position.count; i++) {
            const len = Math.hypot(normal.values[i * 3], normal.values[i * 3 + 1], normal.values[i * 3 + 2]);
            check(len > 0.98 && len < 1.02, `${where}: non-unit vertex normal`);
            const u = uv.values[i * 2], v = uv.values[i * 2 + 1];
            check(u >= -1e-6 && u <= 1.000001 && v >= -1e-6 && v <= 1.000001, `${where}: atlas UV outside 0..1`);
            result.uvBounds[0] = Math.min(result.uvBounds[0], u); result.uvBounds[1] = Math.min(result.uvBounds[1], v);
            result.uvBounds[2] = Math.max(result.uvBounds[2], u); result.uvBounds[3] = Math.max(result.uvBounds[3], v);
          }
          const index = p.indices == null ? null : accessor(p.indices), count = index?.count ?? position.count;
          check(count > 0 && count % 3 === 0 && (!index || index.type === 'SCALAR'
            && [5121, 5123, 5125].includes(index.componentType) && !index.normalized), `${where}: malformed triangle indices`);
          const used = new Set();
          for (let i = 0; i < count; i += 3) {
            const ids = [0, 1, 2].map((j) => index ? index.values[i + j] : i + j);
            check(ids.every((j) => Number.isInteger(j) && j >= 0 && j < position.count), `${where}: triangle index outside vertex range`);
            ids.forEach((j) => used.add(j));
            const [a, b, c] = ids.map((j) => new Vector3().fromArray(position.values, j * 3));
            const face = b.sub(a).cross(c.sub(a)), area = face.length();
            check(area > 1e-12, `${where}: degenerate triangle`);
            const sum = new Vector3(); for (const j of ids) sum.add(new Vector3().fromArray(normal.values, j * 3));
            check(face.dot(sum) >= -area * 1e-5, `${where}: triangle winding disagrees with normals`);
          }
          for (const j of used) {
            const point = new Vector3().fromArray(position.values, j * 3).applyMatrix4(m).toArray();
            check(point.every(Number.isFinite), `${where}: non-finite transformed vertex`);
            for (let d = 0; d < 3; d++) {
              result.min[d] = Math.min(result.min[d], point[d]); result.max[d] = Math.max(result.max[d], point[d]);
            }
          }
          result.triangles += count / 3; for (const pivot of activePivots) pivot.triangles += count / 3;
        }
      }
      for (const child of n.children ?? []) walk(child, m, activePivots, n.name);
    }
    walk(ri, IDENTITY);
    check(result.triangles > 0 && result.parts > 0, `${root.name}: empty asset`);
    for (const p of result.pivots) check(p.triangles > 0, `${p.name}: empty moving-part pivot`);
    result.size = result.max.map((v, i) => v - result.min[i]);
    result.materials = [...result.materials]; result.meshIds = [...result.meshIds];
    assets.set(root.name, result);
  }
  check(seen.size === nodes.length, `${label}: orphan nodes outside scene roots`);
  return { bytes: parsed.bytes, assets, sharedMeshes: [...meshUses].filter(([, n]) => n > 1).map(([mesh, instances]) => ({ mesh, instances })) };
}

/** Ray-test exterior hull surfaces. Consistent winding alone cannot distinguish
 * an inside-out hull: reversing both indices and normals still passes it.
 * Nearest two-sided intersections from outside identify the physical outer
 * skin independently of mesh names, vertex order or the procedural builder.
 */
export function inspectHullExterior(bytesOrPath, key, { floating = true } = {}) {
  const bytes = typeof bytesOrPath === 'string' ? readFileSync(bytesOrPath) : bytesOrPath;
  const { json: g, accessor } = parseGlb(bytes, key), roots = g.scenes?.[g.scene ?? 0]?.nodes ?? [];
  const root = roots.find((i) => g.nodes[i].name === key);
  check(root != null, `${key}: missing hull root`);
  const triangles = [], min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  function walk(index, parent) {
    const node = g.nodes[index], matrix = parent.clone().multiply(nodeMatrix(node, key));
    const normalMatrix = new Matrix3().getNormalMatrix(matrix);
    if (node.mesh != null) for (const primitive of g.meshes[node.mesh].primitives) {
      const position = accessor(primitive.attributes.POSITION), normal = accessor(primitive.attributes.NORMAL),
        ids = primitive.indices == null ? null : accessor(primitive.indices), count = ids?.count ?? position.count;
      for (let i = 0; i < count; i += 3) {
        const vertices = [0, 1, 2].map((j) => ids ? ids.values[i + j] : i + j);
        const points = vertices.map((v) => new Vector3().fromArray(position.values, v * 3).applyMatrix4(matrix));
        const normals = vertices.map((v) => new Vector3().fromArray(normal.values, v * 3).applyNormalMatrix(normalMatrix));
        for (const p of points) for (let d = 0; d < 3; d++) { min[d] = Math.min(min[d], p.getComponent(d)); max[d] = Math.max(max[d], p.getComponent(d)); }
        triangles.push({ points, normals, material: g.materials?.[primitive.material]?.name });
      }
    }
    for (const child of node.children ?? []) walk(child, matrix);
  }
  walk(root, IDENTITY);
  check(triangles.length > 0, `${key}: empty hull`);
  // Floating craft are tested at the actual waterline and half way down their
  // draft. Beached craft use two lower-hull heights, below seats and gunwales.
  const heights = floating ? [0, min[1] * 0.5] : [0.16, 0.36].map((t) => min[1] + (max[1] - min[1]) * t);
  const zs = [-0.18, 0.07, 0.22].map((t) => (min[2] + max[2]) / 2 + (max[2] - min[2]) * t);
  let samples = 0;
  for (const side of [-1, 1]) for (const y of heights) for (const z of zs) {
    const start = new Vector3(side < 0 ? min[0] - 0.5 : max[0] + 0.5, y, z), ray = new Ray(start, new Vector3(-side, 0, 0));
    let closest = null, distance = Infinity;
    for (const triangle of triangles) {
      if (triangle.material !== 'watersports_atlas') continue;
      const hit = ray.intersectTriangle(...triangle.points, false, new Vector3());
      if (hit) { const d = start.distanceTo(hit); if (d < distance - 1e-7) { distance = d; closest = triangle; } }
    }
    check(closest, `${key}: exterior hull ray misses at y=${y.toFixed(3)}, z=${z.toFixed(3)}`);
    const normal = closest.normals.reduce((sum, n) => sum.add(n), new Vector3()).normalize();
    check(normal.x * side > 0.05, `${key}: nearest exterior hull surface faces inward on ${side > 0 ? 'starboard' : 'port'} side at y=${y.toFixed(3)}, z=${z.toFixed(3)}`);
    samples++;
  }
  // Names and windscreens are transparent layers, not hull thickness. Three
  // stern probes include offsets that clear an outboard; the bow uses the
  // centreline because a pointed stem may be only centimetres across. A miss
  // at a narrow tip is harmless, but actual hits must face outward and cannot
  // hide an oppositely-facing inner cap at the same depth (z-fighting).
  const endY = floating ? 0 : min[1] + (max[1] - min[1]) * 0.36;
  let endSamples = 0;
  for (const [side, x] of [[-1, 0], [-1, (max[0] - min[0]) * 0.2], [-1, -(max[0] - min[0]) * 0.2], [1, 0]]) {
    const start = new Vector3(x, endY, side < 0 ? min[2] - 0.5 : max[2] + 0.5), ray = new Ray(start, new Vector3(0, 0, -side));
    const hits = [];
    for (const triangle of triangles) {
      if (triangle.material !== 'watersports_atlas') continue;
      const hit = ray.intersectTriangle(...triangle.points, false, new Vector3());
      if (!hit) continue;
      const normal = triangle.normals.reduce((sum, n) => sum.add(n), new Vector3()).normalize();
      hits.push({ distance: start.distanceTo(hit), normal });
    }
    if (!hits.length) continue;
    hits.sort((a, b) => a.distance - b.distance);
    const nearest = hits.filter((hit) => hit.distance - hits[0].distance < 0.0001);
    for (let i = 0; i < nearest.length; i++) for (let j = i + 1; j < nearest.length; j++) {
      check(nearest[i].normal.dot(nearest[j].normal) > -0.8,
        `${key}: opposing coplanar hull end caps at ${side < 0 ? 'stern' : 'bow'} (x=${x.toFixed(3)}, y=${endY.toFixed(3)})`);
    }
    check(hits[0].normal.z * side > 0.05, `${key}: nearest exterior hull end faces inward at ${side < 0 ? 'stern' : 'bow'}`);
    endSamples++;
  }
  check(endSamples >= 2, `${key}: too few visible hull end samples`);
  return { key, exteriorSamples: samples, endSamples };
}

/** Verify PNG CRCs, inflate and unfilter the actual raster, including alpha. */
export function inspectAtlasPng(png) {
  check(png.length >= 45 && png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'invalid atlas PNG signature');
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (data) => { let c = 0xffffffff; for (const b of data) c = table[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  let offset = 8, header, ended = false; const chunks = [];
  while (offset < png.length) {
    check(offset + 12 <= png.length, 'truncated atlas PNG chunk');
    const length = png.readUInt32BE(offset), end = offset + 8 + length, type = png.toString('ascii', offset + 4, offset + 8);
    check(end + 4 <= png.length, 'truncated atlas PNG payload');
    check(crc(png.subarray(offset + 4, end)) === png.readUInt32BE(end), `atlas PNG ${type} CRC mismatch`);
    if (!header) { check(type === 'IHDR' && length === 13, 'atlas PNG must begin with IHDR'); header = png.subarray(offset + 8, end); }
    else check(type !== 'IHDR', 'duplicate atlas PNG IHDR');
    if (type === 'IDAT') chunks.push(png.subarray(offset + 8, end));
    if (type === 'IEND') { check(length === 0 && end + 4 === png.length, 'atlas PNG data after IEND'); ended = true; }
    offset = end + 4;
  }
  check(ended && chunks.length, 'atlas PNG lacks image data or IEND');
  const width = header.readUInt32BE(0), height = header.readUInt32BE(4), channels = { 2: 3, 6: 4 }[header[9]];
  check(width > 0 && height > 0 && width <= 2048 && height <= 2048 && header[8] === 8 && channels
    && header[10] === 0 && header[11] === 0 && header[12] === 0, 'atlas must be at most 2048px non-interlaced 8-bit RGB/RGBA PNG');
  const rowBytes = width * channels, stride = rowBytes + 1;
  const encoded = inflateSync(Buffer.concat(chunks), { maxOutputLength: stride * height });
  check(encoded.length === stride * height, 'atlas PNG raster size mismatch');
  const pixels = Buffer.alloc(rowBytes * height);
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < height; y++) {
    const filter = encoded[y * stride]; check(filter <= 4, 'atlas PNG invalid row filter');
    if (filter === 0) { encoded.copy(pixels, y * rowBytes, y * stride + 1, (y + 1) * stride); continue; }
    for (let x = 0; x < rowBytes; x++) {
      const at = y * rowBytes + x, a = x >= channels ? pixels[at - channels] : 0,
        b = y ? pixels[at - rowBytes] : 0, c = y && x >= channels ? pixels[at - rowBytes - channels] : 0;
      const prediction = filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : paeth(a, b, c);
      pixels[at] = (encoded[y * stride + 1 + x] + prediction) & 255;
    }
  }
  let minAlpha = 255, maxAlpha = 255;
  if (channels === 4) { maxAlpha = 0; for (let i = 3; i < pixels.length; i += 4) { minAlpha = Math.min(minAlpha, pixels[i]); maxAlpha = Math.max(maxAlpha, pixels[i]); } }
  return { width, height, channels, bytes: png.length, minAlpha, maxAlpha, pixels };
}

function checkAnchorData(key, anchors, cat, measured) {
  check(anchors && typeof anchors === 'object' && !Array.isArray(anchors), 'missing per-type anchor object');
  const expected = { ...(cat.anchors ?? {}), floating: cat.floating, draftDepth: cat.draftDepth,
    bobAmplitude: cat.bobAmplitude, rockAmplitudeDeg: cat.rockAmplitudeDeg };
  check(JSON.stringify(anchors) === JSON.stringify(expected), 'anchor JSON differs from catalogue/motion metadata');
  const finiteData = (value) => {
    if (typeof value === 'number') return Number.isFinite(value);
    if (Array.isArray(value)) return value.length > 0 && value.length <= 100 && value.every(finiteData);
    if (value && typeof value === 'object') return Object.values(value).every(finiteData);
    return typeof value === 'boolean' || typeof value === 'string';
  };
  check(finiteData(anchors), 'anchors contain null/non-finite/empty coordinate data');
  const point = (p, label) => {
    check(finite(p, 3), `${label}: expected finite metre position`);
    check(p.every((v, i) => v >= measured.min[i] - (i === 1 ? 2 : 1.5) && v <= measured.max[i] + (i === 1 ? 2.3 : 1.5)), `${label}: anchor is implausibly far from its prop`);
  };
  for (const kind of ['feet', 'hands']) if (anchors[kind] != null) {
    check(Array.isArray(anchors[kind]) && anchors[kind].length >= 1 && anchors[kind].length <= 8, `${kind}: invalid anchor list`);
    for (const p of anchors[kind]) point(p, kind);
  }
  if (anchors.stand != null) point(anchors.stand, 'stand');
  if (anchors.floatHeight != null) check(Number.isFinite(anchors.floatHeight) && anchors.floatHeight >= 0 && anchors.floatHeight <= 2, 'invalid board floatHeight');
  if (anchors.ladder != null) {
    point(anchors.ladder.start, 'ladder start'); point(anchors.ladder.end, 'ladder end');
    check(anchors.ladder.end[1] > anchors.ladder.start[1] + 0.2, 'ladder climb end must be above start');
  }
  if (anchors.navKeepOut != null) {
    const poly = anchors.navKeepOut;
    check(Array.isArray(poly) && poly.length >= 3 && poly.length <= 32 && poly.every((p) => finite(p, 2)), 'invalid navigation keep-out polygon');
    let area = 0;
    for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; area += p[0] * q[1] - q[0] * p[1]; }
    check(Math.abs(area) > 0.01, 'collapsed navigation keep-out polygon');
    const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    for (let i = 0; i < poly.length; i++) for (let j = i + 2; j < poly.length; j++) {
      if (i === 0 && j === poly.length - 1) continue;
      const a = poly[i], b = poly[(i + 1) % poly.length], c = poly[j], d = poly[(j + 1) % poly.length];
      check(!(cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0), 'self-intersecting navigation keep-out polygon');
    }
    check(poly.every((p) => Math.abs(p[0]) <= cat.size[0] + 2 && Math.abs(p[1]) <= cat.size[2] + 2), 'keep-out polygon implausibly far from prop');
  }
  if (/sup_|kiteboard|foilboard/.test(key)) check(anchors.feet?.length >= 2 && Number.isFinite(anchors.floatHeight), 'board requires foot positions and float height');
  if (/windsurf_rig/.test(key)) check(anchors.feet?.length >= 2 && anchors.hands?.length >= 2, 'windsurf rider requires foot and hand anchors');
  if (/wooden_boat/.test(key)) check(finite(anchors.stand, 3), 'beached wooden boat requires a person standing position');
  if (/ladder|raft/.test(key)) check(anchors.ladder, 'ladder/raft requires climb start and end');
  if (/raft|pier_deck|pier_end/.test(key)) check(anchors.navKeepOut, 'raft/pier requires navigation keep-out polygon');
}

export function validateWatersports({ models = MODELS, catalogue = resolve(ROOT, 'tools/blender/watersports.catalog.json'),
  anchors, materials = resolve(ROOT, 'tools/blender/watersports.materials.json'), complete = false,
  runtime = true } = {}) {
  models = resolve(models); catalogue = resolve(catalogue); materials = resolve(materials);
  anchors = anchors ? resolve(anchors) : resolve(models, 'watersports/anchors.json');
  const report = { ok: false, complete, assetCount: 0, lodCount: 0, glbBytes: 0, textureBytes: 0, totalBytes: 0,
    maxGlbBytes: MAX_GLB_BYTES, maxTextureBytes: MAX_TEXTURE_BYTES, sharedMeshes: 0, files: [], assets: [], failures: [] };
  const capture = (label, fn) => { try { return fn(); } catch (e) { report.failures.push(`${label}: ${e.message}`); return null; } };
  const manifest = capture('manifest', () => json(resolve(models, 'manifest.watersports.json')));
  if (!manifest) return report;
  const catalogBytes = capture('catalogue', () => readFileSync(catalogue));
  const catalog = catalogBytes && capture('catalogue', () => JSON.parse(catalogBytes));
  const anchorBytes = capture('anchors', () => readFileSync(anchors));
  const anchorData = anchorBytes && capture('anchors', () => JSON.parse(anchorBytes));
  const materialBytes = capture('materials', () => readFileSync(materials));
  const materialData = materialBytes && capture('materials', () => JSON.parse(materialBytes));
  if (!catalog?.assets || !anchorData?.assets || !materialData) return report;
  const declared = new Map(), measured = new Map(), paths = new Set(), texturePaths = new Set();
  capture('manifest', () => {
    check(manifest.version === 1 && manifest.license === 'CC0-1.0', 'version 1 and CC0-1.0 licence required');
    check(Array.isArray(manifest.files) && manifest.files.length > 0, 'no generated GLB files declared');
    check(manifest.generator?.script === 'tools/blender/watersports_build.py', 'missing generator provenance');
    check(manifest.generator.catalogSha256 === textSha256(catalogBytes), 'catalogue LF SHA-256 is missing or stale');
    check(manifest.generator.anchorsSha256 === textSha256(anchorBytes), 'anchors LF SHA-256 is missing or stale');
    check(manifest.generator.materialsSha256 === textSha256(materialBytes), 'materials LF SHA-256 is missing or stale');
    check(catalog.units === 'metres', 'catalogue units must be metres');
    if (complete) check(manifest.complete === true, 'preview/partial library cannot pass complete mode');
  });
  for (const f of Array.isArray(manifest.files) ? manifest.files : []) capture(f.glb ?? 'file', () => {
    check(typeof f.glb === 'string' && /^watersports\/[a-zA-Z0-9_-]+\.glb$/.test(f.glb), 'GLB must be one file under watersports/');
    const path = inside(models, f.glb, 'watersports GLB'); check(!paths.has(path), 'duplicate GLB file'); paths.add(path);
    const bytes = readFileSync(path); report.glbBytes += bytes.length;
    const actual = inspectWatersportsGlb(bytes, f.glb);
    check(f.bytes === bytes.length && f.sha256 === sha256(bytes), 'byte count or SHA-256 differs from generated GLB');
    check(f.assets && typeof f.assets === 'object' && !Array.isArray(f.assets) && Object.keys(f.assets).length, 'empty or malformed assets map');
    const roots = new Set();
    for (const [key, meta] of Object.entries(f.assets)) capture(key, () => {
      const far = key.endsWith('_lod1'), baseKey = far ? key.slice(0, -5) : key, cat = catalog.assets[baseKey];
      check(cat && !declared.has(key), 'unknown or duplicate asset key');
      check(meta?.node === key, 'asset root must equal catalogue key'); roots.add(key); declared.set(key, meta);
      const a = actual.assets.get(key); check(a, 'declared root absent from actual GLB'); measured.set(key, a);
      check(positive(cat.size, 3) && equal(meta.size, cat.size), 'size differs from catalogue');
      check(['floor-centre', 'waterline-centre'].includes(cat.origin) && meta.origin === cat.origin && (!far || meta.lod === 1), 'wrong origin or LOD metadata');
      check(meta.triangles === a.triangles && meta.parts === a.parts, 'triangle/part count differs from actual bytes');
      check(equal(meta.bounds?.min, a.min) && equal(meta.bounds?.max, a.max), 'bounds differ from actual vertices');
      check(a.size.every((v, i) => v <= cat.size[i] + 0.05 && v >= cat.size[i] * 0.70), 'measured metre dimensions outside catalogue envelope (70%..size+5cm)');
      check(typeof cat.floating === 'boolean', 'floating must be explicitly true or false');
      for (const k of ['draftDepth', 'bobAmplitude', 'rockAmplitudeDeg']) check(Number.isFinite(cat[k]) && cat[k] >= 0, `invalid ${k}`);
      if (cat.floating) {
        check(cat.origin === 'waterline-centre' && cat.draftDepth > 0, 'floating prop requires waterline origin and positive draft depth');
        check(Math.abs(a.min[1] + cat.draftDepth) <= 0.03, 'floating geometry draft differs from lowest vertex');
        check(a.min[1] < 0 && a.max[1] >= 0, 'floating object must cross its Y=0 waterline');
        check(cat.bobAmplitude <= 0.5 && cat.rockAmplitudeDeg <= 30, 'floating motion metadata is excessive');
      } else {
        check(cat.origin === 'floor-centre' && Math.abs(a.min[1]) <= 0.02, 'grounded geometry must start at Y=0');
        check(cat.draftDepth === 0 && cat.bobAmplitude === 0 && cat.rockAmplitudeDeg === 0, 'grounded prop must have zero water motion metadata');
      }
      const hard = /lancha/.test(baseKey) ? 2500 : /bell_buoy/.test(baseKey) ? 250 : /(?:^|_)buoy$/.test(baseKey) ? 60 : /pier_pile$/.test(baseKey) ? 16 : MAX_NEAR_TRIANGLES;
      check(a.triangles <= hard, `measured ${a.triangles} triangles exceeds ${hard} limit`);
      if (!far && /watersports_windsurf_(rig|sand)$/.test(baseKey)) check(a.materials.includes('watersports_window'), 'windsurf sail must contain actual transparent window geometry');
      if (/watersports_kite_(flying|sand)$/.test(baseKey)) check(a.materials.includes('watersports_fabric'), 'kite wing requires actual double-sided cloth geometry');
      if (!far && /wooden_boat/.test(baseKey)) check(a.materials.includes('watersports_alpha'), 'wooden fishing boat must use the alpha name atlas on its transom');
      if (!far && /wooden_boat/.test(baseKey)) {
        const boatNames = { maria_del_mar: 'Maria del Mar', la_esperanza: 'La Esperanza', san_pedro: 'San Pedro', brisa: 'Brisa' };
        const suffix = baseKey.slice('watersports_wooden_boat_'.length);
        check(cat.nameText === boatNames[suffix] && manifest.atlas?.tiles?.[cat.nameTile], 'wooden fishing boat requires its specified painted name tile');
      }
      if (/^watersports_(?:kayak_single|kayak_double|rowing_boat|lancha|wooden_boat_\w+)$/.test(baseKey)) inspectHullExterior(bytes, key, { floating: cat.floating });
      const pivots = cat.pivots ?? [];
      check(Array.isArray(pivots), 'invalid pivot specification');
      const expectedNames = pivots.map((p) => `${key}-pivot_${p.id}`), names = a.pivots.map((p) => p.name);
      check(Array.isArray(meta.pivots) && meta.pivots.length === pivots.length && names.length === pivots.length
        && expectedNames.every((n) => meta.pivots.includes(n) && names.includes(n)), 'missing, extra or misnamed separate moving-part pivot');
      for (const p of pivots) {
        check(typeof p.id === 'string' && finite(p.position, 3) && finite(p.axis, 3) && Math.abs(Math.hypot(...p.axis) - 1) < 1e-4, 'invalid pivot position or axis');
        const pivot = a.pivots.find((q) => q.name === `${key}-pivot_${p.id}`);
        check(equal(pivot.localPosition, p.position, 0.003), 'moving-part local pivot location differs from catalogue');
        check(pivot.parent === (p.parent ? `${key}-pivot_${p.parent}` : key), 'moving-part pivot parent differs from catalogue');
      }
      if (!far) checkAnchorData(baseKey, anchorData.assets[baseKey], cat, a);
      report.assets.push(a);
    });
    check(roots.size === actual.assets.size && [...actual.assets.keys()].every((key) => roots.has(key)), 'unregistered scene roots in GLB');
    report.sharedMeshes += actual.sharedMeshes.length;
    report.files.push({ path: f.glb, bytes: bytes.length, roots: actual.assets.size, sharedMeshes: actual.sharedMeshes });
  });
  for (const [key, meta] of declared) capture(key, () => {
    if (key.endsWith('_lod1')) { report.lodCount++; check(declared.has(key.slice(0, -5)), 'orphan LOD1'); return; }
    report.assetCount++;
    check(meta.lod1 === key + '_lod1' && declared.has(meta.lod1), 'missing explicit far LOD');
    const near = measured.get(key), far = measured.get(meta.lod1);
    check(near && far, 'both LODs must contain measurable geometry');
    check(far.triangles <= near.triangles * MAX_LOD_RATIO, 'far LOD exceeds 40% of near triangles');
    check(equal(declared.get(meta.lod1).size, meta.size), 'LOD silhouette metadata differs');
    for (const p of near.pivots) {
      const suffix = p.name.slice(key.length), other = far.pivots.find((q) => q.name === meta.lod1 + suffix);
      check(other && equal(other.position, p.position, 0.002) && equal(other.localMatrix, p.localMatrix, 0.002), 'pivot moves when switching detail');
    }
  });
  capture('shared atlas', () => {
    const a = manifest.atlas;
    check(a && Number.isInteger(a.width) && Number.isInteger(a.height) && a.width <= 2048 && a.height <= 2048, 'missing or oversized shared atlas');
    check(a.maps && Object.keys(a.maps).sort().join(',') === 'baseColor,normal,orm', 'one shared baseColor/normal/orm atlas set required');
    let baseRaster;
    for (const [kind, map] of Object.entries(a.maps)) {
      check(/^\.\.\/textures\/watersports\/[a-zA-Z0-9_-]+\.png$/.test(map.path), `invalid ${kind} atlas path`);
      const path = resolve(models, map.path); check(!texturePaths.has(path), 'atlas maps must have distinct files'); texturePaths.add(path);
      const bytes = readFileSync(path); report.textureBytes += bytes.length;
      const png = inspectAtlasPng(bytes);
      check(png.width === a.width && png.height === a.height && bytes.length === map.bytes && map.sha256 === sha256(bytes), `${kind} atlas dimensions/bytes/SHA-256 differ from manifest`);
      if (kind === 'baseColor') { check(png.channels === 4 && png.minAlpha < 128 && png.maxAlpha === 255, 'baseColor atlas requires opaque paint and real transparent decals/window'); baseRaster = png; }
    }
    check(a.tiles && Object.keys(a.tiles).length > 12, 'atlas must declare its named tile UV rectangles');
    for (const [name, rect] of Object.entries(a.tiles)) check(finite(rect, 4) && rect.every((n) => n >= 0 && n <= 1) && rect[0] < rect[2] && rect[1] < rect[3], `invalid atlas tile ${name}`);
    const tileDigest = (name) => {
      const rect = a.tiles[name], x0 = Math.round(rect[0] * a.width), x1 = Math.round(rect[2] * a.width),
        y0 = Math.round((1 - rect[3]) * a.height), y1 = Math.round((1 - rect[1]) * a.height);
      const hash = createHash('sha256');
      for (let y = y0; y < y1; y++) hash.update(baseRaster.pixels.subarray((y * a.width + x0) * 4, (y * a.width + x1) * 4));
      return hash.digest('hex');
    };
    for (const [key, cat] of Object.entries(catalog.assets)) for (const [kind, variant] of Object.entries(cat.variants ?? {})) {
      check(variant && a.tiles[variant.sourceTile] && Array.isArray(variant.tiles) && new Set(variant.tiles).size === variant.tiles.length && variant.tiles.every((t) => a.tiles[t]), `${key}: invalid ${kind} colourway tiles`);
      if (kind === 'sail' || kind === 'kite') {
        check(variant.tiles.length === 6, `${key}: ${kind} requires six atlas colourways`);
        check(new Set(variant.tiles.map((tile) => JSON.stringify(a.tiles[tile]))).size === 6, `${key}: colourway tiles cannot alias one rectangle`);
        check(new Set(variant.tiles.map(tileDigest)).size === 6, `${key}: colourways must be different raster artwork`);
      }
    }
  });
  capture('material recipe', () => {
    const mats = materialData.materials ?? materialData;
    check(['watersports_atlas', 'watersports_alpha', 'watersports_window', 'watersports_fabric'].every((name) => mats[name]), 'all four named atlas material recipes required');
    const mapNames = Object.fromEntries(Object.entries(manifest.atlas?.maps ?? {}).map(([kind, map]) => [kind, map.path.split('/').at(-1)]));
    for (const [name, m] of Object.entries(mats)) for (const kind of ['baseColor', 'normal', 'orm']) check(m[kind] === mapNames[kind], `${name}: material does not use the one shared ${kind} atlas`);
    check(mats.watersports_alpha.alphaMode === 'MASK' && mats.watersports_alpha.alphaCutoff > 0 && mats.watersports_alpha.alphaCutoff < 1, 'named decals require alpha mask recipe');
    check(mats.watersports_window.alphaMode === 'BLEND' && mats.watersports_window.depthWrite === false, 'sail window requires transparent depth-write-disabled recipe');
    check(mats.watersports_fabric.doubleSided === true, 'thin sail/kite cloth must be double-sided');
  });
  capture('payload', () => {
    for (const path of filesUnder(resolve(models, 'watersports'))) {
      if (path.endsWith('.glb') && !paths.has(path)) { report.glbBytes += statSync(path).size; report.failures.push(`unregistered GLB payload: ${relative(models, path)}`); }
      else if (!path.endsWith('.glb') && path !== anchors) report.failures.push(`unexpected auxiliary model payload: ${relative(models, path)}`);
    }
    for (const path of filesUnder(resolve(models, '../textures/watersports'))) if (!texturePaths.has(path)) {
      report.textureBytes += statSync(path).size; report.failures.push(`unregistered atlas payload: ${relative(models, path)}`);
    }
  });
  report.totalBytes = report.glbBytes + report.textureBytes;
  capture('metadata totals', () => {
    check(manifest.assetCount === report.assetCount && manifest.lodCount === report.lodCount, 'assetCount/lodCount differs from generated roots');
    check(manifest.totalBytes === report.totalBytes, 'totalBytes differs from actual GLBs and textures');
    if (manifest.glbBytes != null) check(manifest.glbBytes === report.glbBytes, 'glbBytes differs from actual GLBs');
    if (manifest.textureBytes != null) check(manifest.textureBytes === report.textureBytes, 'textureBytes differs from actual atlas maps');
    check(report.glbBytes <= MAX_GLB_BYTES, `${report.glbBytes} GLB bytes exceeds ${MAX_GLB_BYTES} budget`);
    check(report.textureBytes <= MAX_TEXTURE_BYTES, `${report.textureBytes} texture bytes exceeds ${MAX_TEXTURE_BYTES} budget`);
  });
  if (complete) capture('complete library', () => {
    check(REQUIRED_KEYS.length > 0 && Object.keys(catalog.assets).length === REQUIRED_KEYS.length && REQUIRED_KEYS.every((key) => catalog.assets[key]), 'catalogue must contain every required watersports design');
    check(Object.keys(anchorData.assets).length === REQUIRED_KEYS.length, 'anchor file must cover every required watersports design');
    for (const key of REQUIRED_KEYS) for (const k of [key, key + '_lod1']) check(declared.has(k) && report.assets.some((a) => a.key === k), `missing complete generated asset ${k}`);
    for (const key of ['watersports_pier_deck', 'watersports_swimline_segment']) {
      const a = measured.get(key);
      check(a && a.nodes.filter((n) => n.mesh != null).length > a.meshIds.length, `${key}: repeated pieces require actual shared GLB mesh references`);
    }
  });
  if (runtime) capture('unloaded runtime', () => {
    const rootManifest = resolve(models, 'manifest.json');
    if (existsSync(rootManifest)) check(!json(rootManifest).files?.includes('manifest.watersports.json'), 'watersports must not be registered for game boot');
    else if (models === MODELS) throw new Error('missing root model manifest');
    for (const path of filesUnder(resolve(ROOT, 'js'))) if (/\.(?:m?js|json)$/.test(path)) {
      check(!/manifest\.watersports\.json|assets\/models\/watersports\//.test(readFileSync(path, 'utf8')), 'game code must not load the watersports library');
    }
  });
  report.ok = report.failures.length === 0;
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--models', '--catalogue', '--anchors', '--materials'].includes(arg)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) { console.error(`${arg} needs a path`); process.exit(2); }
      options[arg.slice(2)] = resolve(args[++i]);
    } else if (arg === '--complete') options.complete = true;
    else if (arg !== '--json') { console.error(`unknown option: ${arg}`); process.exit(2); }
  }
  const r = validateWatersports(options);
  if (args.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} watersports: ${r.assetCount} designs + ${r.lodCount} far LODs`);
    console.log(`GLB ${r.glbBytes.toLocaleString('en-US')} / ${MAX_GLB_BYTES.toLocaleString('en-US')} bytes; textures ${r.textureBytes.toLocaleString('en-US')} / ${MAX_TEXTURE_BYTES.toLocaleString('en-US')} bytes; shared meshes ${r.sharedMeshes}`);
    for (const a of r.assets.filter((item) => !item.key.endsWith('_lod1'))) {
      const far = r.assets.find((item) => item.key === a.key + '_lod1');
      console.log(`  ${a.key}: ${a.triangles}/${far?.triangles ?? '?'} triangles; ${a.pivots.length} pivots; ${a.size.map((n) => n.toFixed(3)).join(' x ')} m`);
    }
    for (const failure of r.failures) console.error(`  ${failure}`);
  }
  process.exitCode = r.ok ? 0 : 1;
}
