// Independent checks of the bytes exported by garments_build.py. No Blender or three.js dependency.
//   node la-ladera/tools/nice.mjs node la-ladera/tools/blender/garments_validate.mjs --complete
// Partial runs still validate every supplied asset; --complete additionally requires the whole catalogue,
// every assortment binding, and no unlisted GLBs/nodes. Budgets count high + low LODs, data and the print atlas.
import { readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG } from '../../js/interiors/catalog.js';
import worldMaterials from '../../js/world/matdefs.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MODELS = resolve(HERE, '../../assets/models');
const DEFAULT_CATALOGUE = join(HERE, 'garments.catalog.json');
export const REQUIRED_GARMENTS = Object.freeze(['swimsuit_onepiece', 'swim_trunks', 'bikini_top', 'bikini_bottom',
  'crop_top', 'tshirt', 'shorts', 'leggings', 'sun_hat', 'straw_hat', 'cap', 'bra', 'underwear', 'panties', 'thong',
  'knickers', 'high_leg_knickers', 'briefs', 'boxers', 'sock_single', 'socks_pair', 'tights', 'nightdress']);
const STATES = ['folded', 'hung', 'flat'];
const LIMITS = Object.freeze({ triangles: 800, lodTriangles: 240, runtimeBytes: 2_000_000 });
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const EPS = 0.001; // one millimetre, including exporter float round-off
const finiteVector = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
const sameSet = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));
const closeVector = (a, b, eps = EPS) => finiteVector(a, b.length) && a.every((v, k) => Math.abs(v - b[k]) <= eps);
const has = (o, key) => !!o && Object.hasOwn(o, key);
const fail = (message) => { throw new Error(message); };
const demand = (condition, message) => { if (!condition) fail(message); };

/** Strict binary reader. Accessors are decoded from BIN bytes, never trusted accessor min/max metadata. */
export function parseGLB(bytes, label = 'GLB') {
  demand(Buffer.isBuffer(bytes), `${label}: expected a Buffer`);
  demand(bytes.length >= 20 && bytes.readUInt32LE(0) === 0x46546c67, `${label}: not a GLB`);
  demand(bytes.readUInt32LE(4) === 2, `${label}: GLB version must be 2`);
  demand(bytes.readUInt32LE(8) === bytes.length, `${label}: header length differs from file length`);
  let json, bin, off = 12, chunks = 0;
  while (off < bytes.length) {
    demand(off + 8 <= bytes.length, `${label}: truncated chunk header`);
    const length = bytes.readUInt32LE(off), type = bytes.readUInt32LE(off + 4);
    demand(length % 4 === 0 && off + 8 + length <= bytes.length, `${label}: invalid chunk length`);
    const data = bytes.subarray(off + 8, off + 8 + length);
    if (type === 0x4e4f534a) {
      demand(chunks === 0 && json === undefined, `${label}: JSON must be the first and only JSON chunk`);
      try { json = JSON.parse(data.toString('utf8')); } catch { fail(`${label}: invalid JSON chunk`); }
    } else if (type === 0x004e4942) {
      demand(json !== undefined && bin === undefined, `${label}: invalid or duplicate BIN chunk`);
      bin = data;
    } else fail(`${label}: unsupported chunk type`);
    off += length + 8; chunks++;
  }
  demand(json?.asset?.version === '2.0' && bin, `${label}: glTF 2.0 JSON and BIN are required`);
  for (const name of ['images', 'textures', 'samplers', 'animations', 'skins']) {
    demand(!json[name]?.length, `${label}: ${name} are forbidden in static garment GLBs`);
  }
  demand(!json.extensionsRequired?.length, `${label}: decoder/required extensions are forbidden`);
  demand(json.buffers?.length === 1 && !json.buffers[0].uri, `${label}: only one internal buffer is allowed`);
  const declaredBytes = json.buffers[0].byteLength;
  demand(Number.isInteger(declaredBytes) && declaredBytes > 0 && declaredBytes <= bin.length && bin.length - declaredBytes <= 3,
    `${label}: invalid buffer byteLength`);
  const component = {
    5120: { bytes: 1, read: 'readInt8', scale: 127, signed: true },
    5121: { bytes: 1, read: 'readUInt8', scale: 255 },
    5122: { bytes: 2, read: 'readInt16LE', scale: 32767, signed: true },
    5123: { bytes: 2, read: 'readUInt16LE', scale: 65535 },
    5125: { bytes: 4, read: 'readUInt32LE', scale: 4294967295 },
    5126: { bytes: 4, read: 'readFloatLE' },
  };
  const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const accessors = (json.accessors ?? []).map((a, ai) => {
    const c = component[a.componentType], width = widths[a.type];
    demand(c && width && !a.sparse, `${label}: accessor ${ai} has unsupported type or sparse storage`);
    demand(Number.isInteger(a.count) && a.count > 0, `${label}: accessor ${ai} has invalid count`);
    demand(!a.normalized || a.componentType !== 5126, `${label}: float accessor ${ai} cannot be normalized`);
    const view = json.bufferViews?.[a.bufferView];
    demand(view && (view.buffer ?? 0) === 0, `${label}: accessor ${ai} has invalid bufferView`);
    const vo = view.byteOffset ?? 0, ao = a.byteOffset ?? 0, length = view.byteLength;
    const stride = view.byteStride ?? width * c.bytes;
    demand([vo, ao, length, stride].every(Number.isInteger) && vo >= 0 && ao >= 0 && length > 0 &&
      stride >= width * c.bytes && stride % c.bytes === 0 && (vo + ao) % c.bytes === 0,
    `${label}: accessor ${ai} has invalid byte layout`);
    demand(vo + length <= declaredBytes && ao + (a.count - 1) * stride + width * c.bytes <= length,
      `${label}: accessor ${ai} is outside its bufferView`);
    const values = new Float64Array(a.count * width);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < width; k++) {
      let value = bin[c.read](vo + ao + i * stride + k * c.bytes);
      demand(Number.isFinite(value), `${label}: accessor ${ai} contains a non-finite value`);
      if (a.normalized) value = c.signed ? Math.max(-1, value / c.scale) : value / c.scale;
      values[i * width + k] = value;
    }
    for (const bound of ['min', 'max']) if (a[bound] !== undefined) {
      demand(finiteVector(a[bound], width), `${label}: accessor ${ai} has invalid ${bound}`);
      for (let k = 0; k < width; k++) {
        let actual = bound === 'min' ? Infinity : -Infinity;
        for (let i = 0; i < a.count; i++) actual = Math[bound](actual, values[i * width + k]);
        // min/max on normalized integer accessors are in the stored component domain.
        let advertised = a[bound][k];
        if (a.normalized) advertised = c.signed ? Math.max(-1, advertised / c.scale) : advertised / c.scale;
        demand(Math.abs(actual - advertised) <= 1e-5, `${label}: accessor ${ai} has stale ${bound}`);
      }
    }
    return { ...a, width, values };
  });
  demand(accessors.length > 0, `${label}: no geometry accessors`);
  for (const [mi, m] of (json.materials ?? []).entries()) {
    demand(m.name === 'laundry', `${label}: material ${mi} '${m.name}' is not the library material 'laundry'`);
    demand(!/"\w*Texture"\s*:/.test(JSON.stringify(m)), `${label}: material ${mi} embeds a texture binding`);
  }
  demand(json.materials?.length > 0 && json.meshes?.length > 0, `${label}: no materials or meshes`);
  for (const [mi, mesh] of json.meshes.entries()) {
    demand(mesh.primitives?.length > 0 && !mesh.weights, `${label}: mesh ${mi} is empty or has morph weights`);
    for (const [pi, p] of mesh.primitives.entries()) {
      const tag = `${label}: mesh ${mi} primitive ${pi}`;
      demand((p.mode ?? 4) === 4 && !p.targets, `${tag} is not static triangle geometry`);
      demand(json.materials[p.material], `${tag} has no valid library material`);
      const attr = p.attributes ?? {};
      const pos = accessors[attr.POSITION], normal = accessors[attr.NORMAL], uv = accessors[attr.TEXCOORD_0], color = accessors[attr.COLOR_0];
      demand(pos?.type === 'VEC3' && pos.componentType === 5126, `${tag} lacks float POSITION`);
      demand(normal?.type === 'VEC3' && normal.componentType === 5126 && normal.count === pos.count, `${tag} lacks matching NORMAL`);
      demand(uv?.type === 'VEC2' && uv.count === pos.count, `${tag} lacks matching TEXCOORD_0`);
      demand(['VEC3', 'VEC4'].includes(color?.type) && color.count === pos.count, `${tag} lacks matching COLOR_0`);
      demand(uv.values.every((v) => v >= -1e-5 && v <= 1.00001), `${tag} UVs must stay in 0..1 for the print atlas`);
      demand(color.values.every((v) => v >= 0 && v <= 1), `${tag} vertex colours must stay in 0..1`);
      for (let i = 0; i < normal.count; i++) {
        const n = Math.hypot(...normal.values.subarray(i * 3, i * 3 + 3));
        demand(Math.abs(n - 1) < 0.02, `${tag} has a non-unit normal`);
      }
      const indices = p.indices === undefined ? null : accessors[p.indices];
      demand(!indices || (indices.type === 'SCALAR' && [5121, 5123, 5125].includes(indices.componentType) && !indices.normalized),
        `${tag} has invalid indices`);
      const ix = indices?.values ?? Uint32Array.from({ length: pos.count }, (_, i) => i);
      demand(ix.length % 3 === 0, `${tag} index count is not divisible by three`);
      for (const index of ix) demand(Number.isInteger(index) && index >= 0 && index < pos.count, `${tag} index is outside POSITION`);
      for (let i = 0; i < ix.length; i += 3) {
        const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
        const u = [0, 1, 2].map((k) => pos.values[b + k] - pos.values[a + k]);
        const v = [0, 1, 2].map((k) => pos.values[c + k] - pos.values[a + k]);
        demand(Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) > 1e-12,
          `${tag} contains a degenerate triangle`);
      }
    }
  }
  const nodes = json.nodes ?? [], parent = new Map(), visiting = new Set(), visited = new Set();
  demand(nodes.length > 0 && json.scenes?.length === 1 && (json.scene ?? 0) === 0, `${label}: one nonempty scene is required`);
  for (const [i, n] of nodes.entries()) {
    demand(n.skin === undefined && !n.weights, `${label}: node ${i} has skin or morph data`);
    demand(n.mesh === undefined || json.meshes[n.mesh], `${label}: node ${i} references a missing mesh`);
    nodeMatrix(n, `${label}: node ${i}`);
    for (const child of n.children ?? []) {
      demand(Number.isInteger(child) && nodes[child] && child !== i && !parent.has(child), `${label}: invalid or multiply parented child node`);
      parent.set(child, i);
    }
  }
  const visit = (i) => {
    demand(nodes[i] && !visiting.has(i), `${label}: missing node or cyclic node hierarchy`);
    if (visited.has(i)) return;
    visiting.add(i); for (const c of nodes[i].children ?? []) visit(c); visiting.delete(i); visited.add(i);
  };
  const roots = json.scenes[0].nodes ?? [];
  demand(roots.length > 0 && new Set(roots).size === roots.length, `${label}: invalid scene roots`);
  for (const root of roots) { demand(!parent.has(root), `${label}: scene root has a parent`); visit(root); }
  demand(visited.size === nodes.length, `${label}: nodes outside the scene (or a disconnected cycle)`);
  return { json, bin, accessors, roots, bytes: bytes.length, label };
}

function nodeMatrix(n, label = 'node') {
  if (n.matrix) {
    demand(!n.translation && !n.rotation && !n.scale && finiteVector(n.matrix, 16), `${label}: invalid matrix/TRS combination`);
    demand(closeVector([n.matrix[3], n.matrix[7], n.matrix[11], n.matrix[15]], [0, 0, 0, 1], 1e-7), `${label}: matrix is not affine`);
    return n.matrix;
  }
  const t = n.translation ?? [0, 0, 0], s = n.scale ?? [1, 1, 1], r = n.rotation ?? [0, 0, 0, 1];
  demand(finiteVector(t, 3) && finiteVector(s, 3) && s.every((x) => x !== 0) && finiteVector(r, 4) && Math.abs(Math.hypot(...r) - 1) < 1e-5,
    `${label}: non-finite or invalid transform`);
  const [x, y, z, w] = r, [sx, sy, sz] = s, [tx, ty, tz] = t;
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
const mulMatrix = (a, b) => {
  const out = Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
};

/** Measure a named scene root, including every descendant's transform. */
export function inspectAsset(glb, name) {
  const { json: g, accessors, roots, label } = glb;
  const matches = g.nodes.map((n, i) => n.name === name ? i : -1).filter((i) => i !== -1);
  demand(matches.length === 1 && roots.includes(matches[0]), `${label}: '${name}' must identify one scene root`);
  demand(closeVector(nodeMatrix(g.nodes[matches[0]]), I, 1e-7), `${label}: '${name}' root transform must be identity`);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], materials = new Set();
  let triangles = 0, parts = 0, vertices = 0;
  const visit = (i, parent) => {
    const n = g.nodes[i], m = mulMatrix(parent, nodeMatrix(n));
    if (n.mesh !== undefined) for (const p of g.meshes[n.mesh].primitives) {
      const pos = accessors[p.attributes.POSITION];
      for (let v = 0; v < pos.count; v++) {
        const [x, y, z] = pos.values.subarray(v * 3, v * 3 + 3);
        const q = [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
        demand(q.every(Number.isFinite), `${label}: '${name}' has non-finite transformed positions`);
        for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], q[k]); max[k] = Math.max(max[k], q[k]); }
      }
      triangles += (p.indices === undefined ? pos.count : accessors[p.indices].count) / 3;
      materials.add(g.materials[p.material].name); parts++; vertices += pos.count;
    }
    for (const c of n.children ?? []) visit(c, m);
  };
  visit(matches[0], I);
  demand(triangles > 0, `${label}: '${name}' has no triangles`);
  return { node: name, triangles, parts, vertices, materials: [...materials].sort(), bounds: { min, max }, size: max.map((v, k) => v - min[k]) };
}

function checkedFile(root, rel) {
  demand(typeof rel === 'string' && rel.length > 0 && !isAbsolute(rel) && !rel.includes('\\') &&
    !rel.split('/').some((p) => p === '..' || p === '.' || p === ''), `unsafe asset path '${rel}'`);
  const path = resolve(root, rel), actual = realpathSync(path), base = realpathSync(root);
  demand(actual.startsWith(base + sep) && statSync(actual).isFile(), `asset path escapes model directory: '${rel}'`);
  return actual;
}
function filesBelow(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    demand(!d.isSymbolicLink(), `symlink in garment library: ${d.name}`);
    const p = join(dir, d.name);
    return d.isDirectory() ? filesBelow(p) : d.isFile() ? [p] : [];
  });
}
function pngSize(bytes) {
  demand(bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.toString('ascii', 12, 16) === 'IHDR', 'print atlas must be a PNG with an IHDR');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

/** Returns a reviewable report; malformed inputs are errors, not silent omissions. */
export function validateGarments({ modelsDir = DEFAULT_MODELS, cataloguePath = DEFAULT_CATALOGUE, complete = false } = {}) {
  const errors = [], warnings = [], measurements = [], runtimeFiles = new Set(), glbs = new Map(), expectedNodes = new Map();
  const check = (condition, message) => { if (!condition) errors.push(message); return !!condition; };
  const attempt = (label, fn) => { try { return fn(); } catch (e) { errors.push(`${label}: ${e.message}`); return null; } };
  const load = (rel) => attempt(rel, () => { const p = checkedFile(modelsDir, rel); runtimeFiles.add(p); return readFileSync(p); });
  const readJSON = (rel) => { const b = load(rel); return b && attempt(rel, () => JSON.parse(b)); };
  const manifest = readJSON('manifest.garments.json');
  const catalogue = attempt('catalogue', () => JSON.parse(readFileSync(cataloguePath, 'utf8')));
  check(!!worldMaterials.laundry && worldMaterials.laundry.vertexColors !== false, 'laundry must remain a registered vertex-colour library material');
  const sourceText = complete ? attempt('sources', () => readFileSync(join(HERE, 'GARMENTS-SOURCES.md'), 'utf8')) : null;
  const citedIds = new Set(sourceText ? [...sourceText.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((m) => m[1]) : []);
  const assets = new Map(), cats = new Map();
  if (catalogue) {
    check(catalogue.schemaVersion === 1 && catalogue.adultOnly === true, 'catalogue must be schemaVersion 1 and adultOnly');
    check(Array.isArray(catalogue.garments), 'catalogue.garments must be an array');
    for (const c of Array.isArray(catalogue.garments) ? catalogue.garments : []) {
      if (!check(c && typeof c.id === 'string' && /^[a-z][a-z0-9_]*$/.test(c.id), 'invalid catalogue garment id')) continue;
      check(!cats.has(c.id), `duplicate catalogue garment '${c.id}'`); cats.set(c.id, c);
      check(c.adultOnly !== false && (!c.ageGroup || c.ageGroup === 'adult'), `${c.id}: catalogue must be adult-only`);
      check(typeof c.label === 'string' && c.label.length > 0, `${c.id}: missing garment label`);
      check(Number.isFinite(c.width) && c.width > 0 && Number.isFinite(c.length) && c.length > 0, `${c.id}: invalid adult dimensions`);
      check(Array.isArray(c.states) && c.states.length > 0 && new Set(c.states).size === c.states.length && c.states.every((s) => STATES.includes(s)), `${c.id}: invalid states`);
      check(Array.isArray(c.variants) && c.variants.length > 0 && new Set(c.variants).size === c.variants.length, `${c.id}: invalid variants`);
      if (complete) {
        const wanted = ['cap', 'straw_hat'].includes(c.id) ? ['hung', 'flat'] : STATES;
        check(sameSet(c.states ?? [], wanted), `${c.id}: complete mode requires ${wanted.join(', ')} states`);
        if (wanted.length < STATES.length) check(typeof c.notApplicable?.folded === 'string' && c.notApplicable.folded.trim().length > 10,
          `${c.id}: folded omission needs a physical reason`);
        check(Array.isArray(c.sourceIds) && c.sourceIds.length > 0 && c.sourceIds.every((id) => citedIds.has(id)),
          `${c.id}: sourceIds must resolve to the provenance document`);
      }
    }
    if (complete) check(sameSet([...cats.keys()], REQUIRED_GARMENTS), 'complete catalogue must cover exactly the 23 requested adult garments');
  }
  let palette, assortments;
  if (manifest) {
    check(manifest.schemaVersion === 1 && manifest.set === 'garments' && manifest.scope === 'objects-only' && manifest.adultOnly === true,
      'manifest must declare schemaVersion 1, garments, objects-only and adultOnly');
    for (const [name, cap] of Object.entries(LIMITS)) {
      check(Number.isInteger(manifest.limits?.[name]) && manifest.limits[name] > 0 && manifest.limits[name] <= cap,
        `manifest limit '${name}' is missing or exceeds ${cap}`);
    }
    palette = readJSON(manifest.palette);
    assortments = readJSON(manifest.assortments);
    const atlas = load(manifest.atlas?.file);
    if (atlas) {
      const size = attempt('print atlas', () => pngSize(atlas));
      if (size) check(size[0] === manifest.atlas?.width && size[1] === manifest.atlas?.height && size[0] === 256 && size[1] === 256,
        'print atlas must match its declared 256 x 256 dimensions');
    }
    if (palette) {
      check(palette.schemaVersion === 1 && palette.material === 'laundry', 'palette must use schemaVersion 1 and the laundry library material');
      check(closeVector(palette.atlas?.size, [256, 256], 0) && closeVector(palette.atlas?.grid, [4, 4], 0), 'palette atlas must be a 4 x 4 grid in 256 x 256 pixels');
      if (typeof palette.atlas?.file === 'string') {
        check(resolve(dirname(resolve(modelsDir, manifest.palette)), palette.atlas.file) === resolve(modelsDir, manifest.atlas?.file ?? ''), 'palette and manifest must point to the same print atlas');
      } else check(false, 'palette atlas path is missing');
      check(palette.variants && typeof palette.variants === 'object' && !Array.isArray(palette.variants), 'palette variants must be an object');
      for (const [id, v] of Object.entries(palette.variants ?? {})) {
        check(v && typeof v === 'object' && /^#[\da-f]{6}$/i.test(v.color), `${id}: invalid palette colour`);
        check(['plain', 'stripe', 'floral', 'football', 'weave'].includes(v?.pattern), `${id}: unsupported palette pattern`);
        check(finiteVector(v?.tile, 2) && v.tile.every((i) => Number.isInteger(i) && i >= 0 && i < 4), `${id}: atlas tile outside 4 x 4 grid`);
        for (const name of ['accent', 'leaf']) if (v?.[name] !== undefined) check(/^#[\da-f]{6}$/i.test(v[name]), `${id}: invalid ${name} colour`);
        if (v?.roughness !== undefined) check(v.roughness >= 0 && v.roughness <= 1, `${id}: invalid roughness`);
      }
      for (const c of cats.values()) for (const id of Array.isArray(c.variants) ? c.variants : []) check(has(palette.variants, id), `${c.id}: unknown variant '${id}'`);
    }
    const readGLB = (rel) => {
      if (glbs.has(rel)) return glbs.get(rel);
      const bytes = load(rel), g = bytes && attempt(rel, () => parseGLB(bytes, rel));
      glbs.set(rel, g); return g;
    };
    const expect = (file, name) => {
      if (!expectedNodes.has(file)) expectedNodes.set(file, new Set());
      check(!expectedNodes.get(file).has(name), `duplicate model binding '${file}:${name}'`); expectedNodes.get(file).add(name);
    };
    const compareGeometry = (key, a, g, lod = false) => {
      if (!g) return null;
      const actual = attempt(key, () => inspectAsset(g, a.node));
      if (!actual) return null;
      const cap = Math.min(lod ? LIMITS.lodTriangles : LIMITS.triangles, manifest.limits?.[lod ? 'lodTriangles' : 'triangles'] ?? Infinity);
      check(actual.triangles <= cap, `${key}: ${actual.triangles} triangles exceed ${cap}`);
      check(a.triangles === actual.triangles, `${key}: declared triangle count differs from GLB (${actual.triangles})`);
      check(actual.size.every((v) => v > 0), `${key}: geometry has zero extent`);
      check(closeVector(a.size, actual.size), `${key}: size differs from GLB`);
      check(closeVector(a.bounds?.min, actual.bounds.min) && closeVector(a.bounds?.max, actual.bounds.max), `${key}: bounds differ from GLB`);
      if (!lod) {
        check(closeVector(a.footprint, [actual.size[0], actual.size[2]]), `${key}: footprint differs from GLB`);
        check(sameSet(a.materials ?? [], actual.materials), `${key}: material metadata differs from GLB`);
        if (a.drawCalls !== undefined) check(a.drawCalls === actual.parts, `${key}: drawCalls differ from primitive count`);
      }
      return actual;
    };
    const checkOrigin = (key, state, actual) => {
      if (!actual) return;
      const { min, max } = actual.bounds;
      if (state === 'hung') {
        check(Math.abs(max[1]) <= EPS && min[1] < 0, `${key}: hung geometry must descend from y=0`);
        check(min[0] <= EPS && max[0] >= -EPS && min[2] <= EPS && max[2] >= -EPS, `${key}: hang point is outside the footprint`);
      } else {
        check(Math.abs(min[1]) <= EPS && Math.abs(min[0] + max[0]) <= EPS * 2 && Math.abs(min[2] + max[2]) <= EPS * 2,
          `${key}: floor geometry must sit at y=0 and be centred in x/z`);
      }
    };
    check(Array.isArray(manifest.files) && manifest.files.length > 0, 'manifest.files must list generated GLBs');
    for (const f of Array.isArray(manifest.files) ? manifest.files : []) {
      if (!check(f && typeof f === 'object', 'invalid manifest file record')) continue;
      const g = readGLB(f.glb);
      check(f.assets && typeof f.assets === 'object' && !Array.isArray(f.assets) && Object.keys(f.assets).length > 0, `${f.glb}: assets must be a nonempty object`);
      for (const [key, a] of Object.entries(f.assets ?? {})) {
        if (!check(a && typeof a === 'object', `${key}: invalid asset record`)) continue;
        check(!assets.has(key), `duplicate asset '${key}'`); assets.set(key, a);
        const c = cats.get(a.garment);
        check(!!c && c.states?.includes(a.state), `${key}: not a catalogue garment/state`);
        check(key === `garment_${a.garment}_${a.state}` && a.node === key, `${key}: key/node must follow garment_<id>_<state>`);
        check(a.adultOnly === true && (!a.ageGroup || a.ageGroup === 'adult'), `${key}: adultOnly must be true`);
        check(sameSet(a.variants ?? [], c?.variants ?? []), `${key}: variant list differs from catalogue`);
        expect(f.glb, a.node);
        const actual = compareGeometry(key, a, g);
        check(a.origin === (a.state === 'hung' ? 'hang-point' : 'floor-centre'), `${key}: wrong origin convention`);
        checkOrigin(key, a.state, actual);
        if (check(a.lod && typeof a.lod === 'object', `${key}: missing LOD`)) {
          check(a.lod.node === `${key}_lod`, `${key}: LOD node must append _lod`);
          check(a.lod.glb !== f.glb, `${key}: LOD must be stored separately from the high-detail set`);
          expect(a.lod.glb, a.lod.node);
          const low = compareGeometry(`${key} LOD`, a.lod, readGLB(a.lod.glb), true);
          checkOrigin(`${key} LOD`, a.state, low);
          if (actual && low) check(low.triangles <= actual.triangles * 0.6, `${key}: LOD must remove at least 40% of triangles`);
          if (actual) measurements.push({ key, ...actual, lodTriangles: low?.triangles ?? null });
        }
      }
    }
    if (complete) {
      for (const c of cats.values()) for (const state of Array.isArray(c.states) ? c.states : []) check(assets.has(`garment_${c.id}_${state}`), `missing required state garment_${c.id}_${state}`);
      for (const [file, names] of expectedNodes) {
        const g = glbs.get(file);
        if (g) check(sameSet(g.roots.map((i) => g.json.nodes[i].name), [...names]), `${file}: unlisted or missing scene roots`);
      }
    }
    if (assortments) {
      check(assortments.schemaVersion === 1 && assortments.adultOnly === true && Array.isArray(assortments.bindings),
        'assortments must be schemaVersion 1, adultOnly and contain bindings');
      const bindingIds = new Set(), kinds = new Set(), assigned = new Set();
      for (const b of Array.isArray(assortments.bindings) ? assortments.bindings : []) {
        if (!check(b && typeof b === 'object', 'invalid assortment binding')) continue;
        check(typeof b.id === 'string' && !bindingIds.has(b.id), `duplicate or invalid assortment '${b.id}'`); bindingIds.add(b.id);
        check(['drawer', 'wardrobe', 'washing_line', 'shop_shelf'].includes(b.kind), `${b.id}: invalid assortment kind`); kinds.add(b.kind);
        check(Array.isArray(b.catalogueKeys) && b.catalogueKeys.length > 0 && b.catalogueKeys.every((key) => Object.hasOwn(CATALOG, key)),
          `${b.id}: catalogueKeys must name existing furniture catalogue entries`);
        check(b.adultOnly !== false && Array.isArray(b.items) && b.items.length > 0, `${b.id}: requires adult items`);
        for (const item of Array.isArray(b.items) ? b.items : []) {
          if (!check(item && typeof item === 'object', `${b.id}: invalid assortment item`)) continue;
          check(Number.isInteger(item.count) && item.count > 0, `${b.id}: item count must be a positive integer`);
          const a = assets.get(item.asset);
          if (!a) { if (complete) check(false, `${b.id}: unknown asset '${item.asset}'`); continue; }
          const cat = cats.get(a.garment); assigned.add(a.garment);
          check(has(palette?.variants, item.variant) && a.variants?.includes(item.variant), `${b.id}: invalid variant '${item.variant}' for ${item.asset}`);
          const allowed = b.kind === 'drawer' ? a.state === 'folded' : b.kind === 'washing_line' ? a.state === 'hung' :
            b.kind === 'shop_shelf' ? ['folded', 'flat'].includes(a.state) : ['folded', 'hung'].includes(a.state) ||
              (a.state === 'flat' && cat?.category === 'hat' && item.support === 'shelf');
          check(allowed, `${b.id}: ${item.asset} state is incompatible with ${b.kind}`);
          check(item.adultOnly !== false && (!item.ageGroup || item.ageGroup === 'adult'), `${b.id}: non-adult assignment`);
        }
      }
      if (complete) {
        check(sameSet([...kinds], ['drawer', 'wardrobe', 'washing_line', 'shop_shelf']), 'complete assortments require drawer, wardrobe, washing_line and shop_shelf');
        for (const id of cats.keys()) check(assigned.has(id), `garment '${id}' is absent from all assortments`);
      }
    }
  }
  const allFiles = attempt('garment directory', () => filesBelow(join(modelsDir, 'garments'))) ?? [];
  for (const path of allFiles) {
    // The teen set has its own strict budget and validation entry point. These
    // two explicit paths are its ownership boundary; other unlisted adult
    // payloads still count and unexpected GLBs still fail complete mode.
    const rel = relative(modelsDir, path).split(sep).join('/');
    if (rel === 'garments/garments_teen.glb' || rel.startsWith('garments/teen/')) continue;
    runtimeFiles.add(realpathSync(path));
    if (complete && path.endsWith('.glb')) check(glbs.has(relative(modelsDir, path).split(sep).join('/')), `unlisted GLB '${relative(modelsDir, path)}'`);
  }
  let runtimeBytes = 0;
  for (const path of runtimeFiles) runtimeBytes += statSync(path).size;
  const cap = Math.min(manifest?.limits?.runtimeBytes ?? LIMITS.runtimeBytes, LIMITS.runtimeBytes);
  check(runtimeBytes <= cap, `runtime library is ${runtimeBytes} bytes, exceeding ${cap}`);
  return { ok: errors.length === 0, mode: complete ? 'complete' : 'partial', errors, warnings, assets: assets.size,
    catalogueGarments: cats.size, runtimeBytes, runtimeBudgetBytes: cap, files: runtimeFiles.size,
    maxTriangles: Math.max(0, ...measurements.map((m) => m.triangles)),
    maxLodTriangles: Math.max(0, ...measurements.map((m) => m.lodTriangles ?? 0)), measurements };
}

// Teen dimensions are an independently maintained contract in metres. These
// adult-reference dimensions are multiplied by 0.7 or 0.9; they are not read
// from mutable manifest/catalogue bounds. Folded ranges describe the parcel,
// whereas hung/flat ranges describe the laid-out garment. This is game-prop
// sizing requested for the set, not a claim that age predicts body dimensions.
export const TEEN_SIZE_CLASSES = Object.freeze({
  small: Object.freeze({ scale: 0.7, ages: Object.freeze([12, 15]) }),
  big: Object.freeze({ scale: 0.9, ages: Object.freeze([16, 19]) }),
});
export const TEEN_LIMITS = Object.freeze({ triangles: 800, lodTriangles: 240, runtimeBytes: 700_000 });
const teenDimension = (width, length, states = STATES, folded) => {
  const longest = Math.max(width, length);
  demand(!states.includes('folded') || (finiteVector(folded, 2) && folded[0] > 0 && folded[1] > folded[0]),
    'each foldable teen style requires an explicit physical parcel range');
  return Object.freeze({ width, length, states: Object.freeze([...states]),
    open: Object.freeze([longest * 0.90, longest * 1.10]),
    folded: folded ? Object.freeze(folded) : null });
};
export const TEEN_DIMENSIONS = Object.freeze({
  tshirt_cream: teenDimension(0.84, 0.71, STATES, [0.38, 0.49]),
  tshirt_teal: teenDimension(0.84, 0.71, STATES, [0.38, 0.49]),
  tshirt_sun: teenDimension(0.84, 0.71, STATES, [0.38, 0.49]),
  shorts_chino: teenDimension(0.54, 0.43, STATES, [0.24, 0.33]),
  crop_top_rib: teenDimension(0.67, 0.38, STATES, [0.37, 0.48]),
  crop_top_boxy: teenDimension(0.84, 0.42, STATES, [0.38, 0.49]),
  lycra_shorts: teenDimension(0.38, 0.48, STATES, [0.22, 0.30]),
  lycra_trousers: teenDimension(0.38, 0.97, STATES, [0.28, 0.37]),
  denim_shorts: teenDimension(0.54, 0.38, STATES, [0.24, 0.33]),
  denim_jeans: teenDimension(0.52, 1.02, STATES, [0.29, 0.39]),
  dress_short: teenDimension(0.70, 0.78, STATES, [0.31, 0.42]),
  dress_knee: teenDimension(0.72, 0.98, STATES, [0.32, 0.43]),
  dress_midi: teenDimension(0.76, 1.18, STATES, [0.34, 0.45]),
  dress_maxi: teenDimension(0.80, 1.38, STATES, [0.39, 0.52]),
  hoodie: teenDimension(1.12, 0.76, STATES, [0.49, 0.65]),
  joggers: teenDimension(0.56, 1.02, STATES, [0.29, 0.39]),
  school_jumper: teenDimension(1.08, 0.70, STATES, [0.48, 0.63]),
  school_polo: teenDimension(0.84, 0.71, STATES, [0.38, 0.49]),
  school_trousers: teenDimension(0.50, 1.02, STATES, [0.29, 0.39]),
  school_skirt: teenDimension(0.68, 0.58, STATES, [0.37, 0.50]),
  socks_pair: teenDimension(0.31, 0.40, ['folded', 'flat'], [0.17, 0.24]),
  cap: teenDimension(0.22, 0.31, ['hung', 'flat']),
  light_jacket: teenDimension(1.16, 0.76, STATES, [0.51, 0.68]),
  underwear_briefs: teenDimension(0.42, 0.30, STATES, [0.23, 0.32]),
  underwear_boxers: teenDimension(0.50, 0.35, STATES, [0.22, 0.31]),
  swim_onepiece: teenDimension(0.46, 0.76, STATES, [0.35, 0.46]),
  swim_shorts: teenDimension(0.50, 0.43, STATES, [0.22, 0.31]),
  school_shoes_pair: teenDimension(0.25, 0.29, ['flat']),
  sandals_pair: teenDimension(0.25, 0.29, ['flat']),
});
export const REQUIRED_TEEN_GARMENTS = Object.freeze(Object.keys(TEEN_DIMENSIONS));
const DEFAULT_TEEN_CATALOGUE = join(HERE, 'garments_teen.catalog.json');
const TEEN_GLB = 'garments/garments_teen.glb';
const TEEN_MANIFEST = 'manifest.garments_teen.json';
export function teenLongestRange(id, sizeClass, state) {
  const expected = TEEN_DIMENSIONS[id], scale = TEEN_SIZE_CLASSES[sizeClass]?.scale;
  demand(expected && scale && expected.states.includes(state), `unknown teen garment/size/state '${id}/${sizeClass}/${state}'`);
  const range = state === 'folded' ? expected.folded : expected.open;
  return range.map((v) => Math.round(v * scale * 1_000_000) / 1_000_000);
}
export function requiredTeenKeys() {
  return REQUIRED_TEEN_GARMENTS.flatMap((id) => Object.keys(TEEN_SIZE_CLASSES).flatMap((size) =>
    TEEN_DIMENSIONS[id].states.map((state) => `garment_${id}_${size}_${state}`)));
}

/** Teen companion set: the same strict GLB reader and geometry measurement. */
export function validateTeenGarments({ modelsDir = DEFAULT_MODELS, cataloguePath = DEFAULT_TEEN_CATALOGUE, complete = false } = {}) {
  const errors = [], warnings = [], measurements = [], runtimeFiles = new Set();
  const check = (condition, message) => { if (!condition) errors.push(message); return !!condition; };
  const attempt = (label, fn) => { try { return fn(); } catch (e) { errors.push(`${label}: ${e.message}`); return null; } };
  const load = (rel) => attempt(rel, () => { const p = checkedFile(modelsDir, rel); runtimeFiles.add(p); return readFileSync(p); });
  const readJSON = (rel) => { const b = load(rel); return b && attempt(rel, () => JSON.parse(b)); };
  const manifest = readJSON(TEEN_MANIFEST);
  const catalogue = attempt('teen catalogue', () => JSON.parse(readFileSync(cataloguePath, 'utf8')));
  const cats = new Map(), assets = new Map(), expectedRoots = new Set(), measured = new Map();
  check(!!worldMaterials.laundry && worldMaterials.laundry.vertexColors !== false, 'laundry must remain a registered vertex-colour library material');
  const checkSizes = (sizes, label) => {
    check(sameSet(Object.keys(sizes ?? {}), Object.keys(TEEN_SIZE_CLASSES)), `${label}: exactly small and big sizes are required`);
    for (const [size, expected] of Object.entries(TEEN_SIZE_CLASSES)) {
      check(sizes?.[size]?.scale === expected.scale && closeVector(sizes?.[size]?.ages, expected.ages, 0),
        `${label}: ${size} must declare scale ${expected.scale} and ages ${expected.ages.join('–')}`);
    }
  };
  if (catalogue) {
    check(catalogue.schemaVersion === 1 && catalogue.ageGroup === 'teen' && catalogue.adultOnly !== true,
      'teen catalogue must be schemaVersion 1 and ageGroup teen');
    checkSizes(catalogue.sizes, 'teen catalogue');
    check(Array.isArray(catalogue.garments), 'teen catalogue.garments must be an array');
    for (const c of Array.isArray(catalogue.garments) ? catalogue.garments : []) {
      if (!check(c && typeof c.id === 'string' && TEEN_DIMENSIONS[c.id], 'unknown teen catalogue garment id')) continue;
      check(!cats.has(c.id), `duplicate teen catalogue garment '${c.id}'`); cats.set(c.id, c);
      const expected = TEEN_DIMENSIONS[c.id];
      check(typeof c.label === 'string' && c.label.length > 0, `${c.id}: missing teen garment label`);
      check(Number.isFinite(c.width) && Number.isFinite(c.length) && Math.abs(c.width - expected.width) < 1e-6 && Math.abs(c.length - expected.length) < 1e-6,
        `${c.id}: reference dimensions must be ${expected.width} x ${expected.length} metres`);
      check(sameSet(c.states, expected.states), `${c.id}: required teen states are ${expected.states.join(', ')}`);
      check(Array.isArray(c.variants) && c.variants.length > 0 && new Set(c.variants).size === c.variants.length, `${c.id}: invalid teen variants`);
      check(Array.isArray(c.variants) && c.variants.includes(c.defaultVariant), `${c.id}: defaultVariant must name an allowed variant`);
    }
    if (complete) check(sameSet([...cats.keys()], REQUIRED_TEEN_GARMENTS),
      `complete teen catalogue must cover exactly the ${REQUIRED_TEEN_GARMENTS.length} requested garment styles`);
  }
  let glb, palette;
  if (manifest) {
    check(manifest.schemaVersion === 1 && manifest.set === 'garments_teen' && manifest.scope === 'objects-only' && manifest.ageGroup === 'teen' && manifest.adultOnly !== true,
      'teen manifest must declare schemaVersion 1, garments_teen, objects-only and ageGroup teen');
    checkSizes(manifest.sizes, 'teen manifest');
    for (const [name, cap] of Object.entries(TEEN_LIMITS)) {
      check(Number.isInteger(manifest.limits?.[name]) && manifest.limits[name] > 0 && manifest.limits[name] <= cap,
        `teen manifest limit '${name}' is missing or exceeds ${cap}`);
    }
    check(manifest.palette === 'garments/teen/palette.json', 'teen palette must be garments/teen/palette.json');
    palette = readJSON(manifest.palette);
    check(manifest.atlas?.file === 'garments/teen/fabrics.png', 'teen atlas must be garments/teen/fabrics.png');
    const atlas = load(manifest.atlas?.file);
    if (atlas) {
      const size = attempt('teen atlas', () => pngSize(atlas));
      if (size) check(closeVector(size, [256, 256], 0) && manifest.atlas.width === 256 && manifest.atlas.height === 256,
        'teen atlas must match its declared 256 x 256 dimensions');
    }
    if (manifest.textures !== undefined) check(Array.isArray(manifest.textures), 'teen textures must be an array');
    for (const texture of Array.isArray(manifest.textures) ? manifest.textures : []) {
      if (!check(texture && /^garments\/teen\/[a-z0-9_-]+\.png$/.test(texture.file), 'teen texture must be a PNG inside garments/teen/')) continue;
      const bytes = load(texture.file), size = bytes && attempt(texture.file, () => pngSize(bytes));
      if (size) check(closeVector(size, [texture.width, texture.height], 0), `${texture.file}: texture dimensions differ from declaration`);
    }
    if (palette) {
      check(palette.schemaVersion === 1 && palette.material === 'laundry', 'teen palette must use schemaVersion 1 and laundry');
      check(closeVector(palette.atlas?.size, [256, 256], 0) && closeVector(palette.atlas?.grid, [4, 4], 0),
        'teen palette atlas must be a 4 x 4 grid in 256 x 256 pixels');
      check(palette.atlas?.file === 'fabrics.png', 'teen palette must point to fabrics.png');
      check(palette.variants && typeof palette.variants === 'object' && !Array.isArray(palette.variants), 'teen palette variants must be an object');
      for (const [id, variant] of Object.entries(palette.variants ?? {})) {
        check(variant && /^#[\da-f]{6}$/i.test(variant.color), `${id}: invalid teen palette colour`);
        check(typeof variant?.pattern === 'string' && variant.pattern.length > 0, `${id}: missing teen fabric pattern`);
        check(finiteVector(variant?.tile, 2) && variant.tile.every((x) => Number.isInteger(x) && x >= 0 && x < 4), `${id}: teen atlas tile outside 4 x 4 grid`);
        check(Number.isFinite(variant?.roughness) && variant.roughness >= 0 && variant.roughness <= 1, `${id}: invalid teen fabric roughness`);
      }
      for (const c of cats.values()) for (const variant of Array.isArray(c.variants) ? c.variants : []) {
        check(has(palette.variants, variant), `${c.id}: unknown teen variant '${variant}'`);
      }
    }
    check(Array.isArray(manifest.files) && manifest.files.length === 1 && manifest.files[0]?.glb === TEEN_GLB,
      'teen manifest must list exactly garments/garments_teen.glb');
    const bytes = load(TEEN_GLB);
    if (bytes) glb = attempt(TEEN_GLB, () => parseGLB(bytes, TEEN_GLB));
    const checkOrigin = (key, state, actual) => {
      const { min, max } = actual.bounds;
      if (state === 'hung') {
        check(Math.abs(max[1]) <= EPS && min[1] < 0, `${key}: hung geometry must descend from y=0`);
        check(min[0] <= EPS && max[0] >= -EPS && min[2] <= EPS && max[2] >= -EPS, `${key}: hang point is outside footprint`);
      } else check(Math.abs(min[1]) <= EPS && Math.abs(min[0] + max[0]) <= EPS * 2 && Math.abs(min[2] + max[2]) <= EPS * 2,
        `${key}: floor geometry must sit at y=0 and be centred in x/z`);
    };
    const measure = (key, a, descriptor, lod = false) => {
      if (!glb) return null;
      const actual = attempt(key, () => inspectAsset(glb, a.node));
      if (!actual) return null;
      const cap = Math.min(lod ? TEEN_LIMITS.lodTriangles : TEEN_LIMITS.triangles,
        manifest.limits?.[lod ? 'lodTriangles' : 'triangles'] ?? Infinity);
      check(actual.triangles <= cap, `${key}: ${actual.triangles} triangles exceed ${cap}`);
      check(a.triangles === actual.triangles, `${key}: declared triangle count differs from GLB (${actual.triangles})`);
      check(actual.size.every((x) => x > 0), `${key}: geometry has zero extent`);
      check(closeVector(a.size, actual.size), `${key}: size differs from GLB`);
      check(closeVector(a.bounds?.min, actual.bounds.min) && closeVector(a.bounds?.max, actual.bounds.max), `${key}: bounds differ from GLB`);
      const range = attempt(key, () => teenLongestRange(descriptor.garment, descriptor.sizeClass, descriptor.state));
      const longest = Math.max(...actual.size);
      if (range) check(longest >= range[0] - EPS && longest <= range[1] + EPS,
        `${key}: longest side ${longest.toFixed(6)} m is outside expected ${range[0].toFixed(6)}–${range[1].toFixed(6)} m`);
      if (!lod) {
        check(closeVector(a.footprint, [actual.size[0], actual.size[2]]), `${key}: footprint differs from GLB`);
        check(sameSet(a.materials ?? [], actual.materials), `${key}: material metadata differs from GLB`);
        if (a.drawCalls !== undefined) check(a.drawCalls === actual.parts, `${key}: drawCalls differ from primitive count`);
      }
      checkOrigin(key, descriptor.state, actual);
      return { ...actual, longestSide: longest, expectedLongestRange: range };
    };
    for (const f of Array.isArray(manifest.files) ? manifest.files : []) {
      if (!check(f && f.assets && typeof f.assets === 'object' && !Array.isArray(f.assets), 'teen assets must be an object')) continue;
      for (const [key, a] of Object.entries(f.assets)) {
        if (!check(a && typeof a === 'object', `${key}: invalid teen asset record`)) continue;
        check(!assets.has(key), `duplicate teen asset '${key}'`); assets.set(key, a);
        const c = cats.get(a.garment), expected = TEEN_DIMENSIONS[a.garment];
        check(!!c && !!expected?.states.includes(a.state) && has(TEEN_SIZE_CLASSES, a.sizeClass), `${key}: not a required teen garment/size/state`);
        check(key === `garment_${a.garment}_${a.sizeClass}_${a.state}` && a.node === key,
          `${key}: key/node must follow garment_<id>_<small|big>_<state>`);
        check(a.ageGroup === 'teen' && a.adultOnly !== true, `${key}: ageGroup must be teen`);
        check(sameSet(a.variants ?? [], c?.variants ?? []), `${key}: variants differ from teen catalogue`);
        check(a.defaultVariant === c?.defaultVariant && Array.isArray(a.variants) && a.variants.includes(a.defaultVariant), `${key}: wrong defaultVariant`);
        check(a.origin === (a.state === 'hung' ? 'hang-point' : 'floor-centre'), `${key}: wrong origin convention`);
        check(!expectedRoots.has(a.node), `duplicate teen scene binding '${a.node}'`); expectedRoots.add(a.node);
        const actual = measure(key, a, a);
        if (check(a.lod && typeof a.lod === 'object', `${key}: missing LOD`)) {
          check(a.lod.glb === TEEN_GLB && a.lod.node === `${key}_lod`, `${key}: LOD must be a matching _lod root in the teen GLB`);
          check(!expectedRoots.has(a.lod.node), `duplicate teen scene binding '${a.lod.node}'`); expectedRoots.add(a.lod.node);
          const low = measure(`${key} LOD`, a.lod, a, true);
          if (actual && low) {
            check(low.triangles <= actual.triangles * 0.6, `${key}: LOD must remove at least 40% of triangles`);
            check(low.size.every((v, i) => Math.abs(v - actual.size[i]) <= Math.max(0.002, actual.size[i] * 0.05)),
              `${key}: LOD dimensions must stay within 5% or 2 mm of the high-detail shape`);
          }
          if (actual) {
            const m = { key, garment: a.garment, sizeClass: a.sizeClass, state: a.state, ...actual,
              lodTriangles: low?.triangles ?? null, lodSize: low?.size ?? null, lodLongestSide: low?.longestSide ?? null };
            measurements.push(m); measured.set(key, m);
          }
        }
      }
    }
    if (complete) {
      const keys = requiredTeenKeys();
      for (const key of keys) check(assets.has(key), `missing required teen state ${key}`);
      check(sameSet([...assets.keys()], keys), 'teen asset keys must exactly match independent required garment/size/state coverage');
      if (glb) check(sameSet(glb.roots.map((i) => glb.json.nodes[i].name), [...expectedRoots]), `${TEEN_GLB}: unlisted or missing scene roots`);
    }
    for (const id of REQUIRED_TEEN_GARMENTS) for (const state of TEEN_DIMENSIONS[id].states) {
      const small = measured.get(`garment_${id}_small_${state}`), big = measured.get(`garment_${id}_big_${state}`);
      if (!small || !big) continue;
      for (const [label, low, high] of [['high', small.size, big.size], ['LOD', small.lodSize, big.lodSize]]) {
        if (low && high) check(closeVector(low.map((v) => v * 9 / 7), high, EPS),
          `garment_${id}_${state} ${label}: small/big dimensions must preserve the 0.7/0.9 size ratio`);
      }
    }
  }
  // Count the entire owned directory, including unreferenced accidental data.
  // Adult GLBs/textures are not part of this independent 700,000-byte set.
  for (const path of attempt('teen directory', () => filesBelow(join(modelsDir, 'garments/teen'))) ?? []) {
    runtimeFiles.add(realpathSync(path));
    if (complete && path.endsWith('.glb')) check(false, `unlisted teen GLB '${relative(modelsDir, path)}'`);
  }
  let runtimeBytes = 0;
  for (const path of runtimeFiles) runtimeBytes += statSync(path).size;
  const cap = Math.min(manifest?.limits?.runtimeBytes ?? TEEN_LIMITS.runtimeBytes, TEEN_LIMITS.runtimeBytes);
  check(runtimeBytes <= cap, `teen runtime library is ${runtimeBytes} bytes, exceeding ${cap}`);
  return { ok: errors.length === 0, set: 'garments_teen', mode: complete ? 'complete' : 'partial', errors, warnings,
    assets: assets.size, catalogueGarments: cats.size, sizeClasses: 2, runtimeBytes, runtimeBudgetBytes: cap, files: runtimeFiles.size,
    maxTriangles: Math.max(0, ...measurements.map((m) => m.triangles)),
    maxLodTriangles: Math.max(0, ...measurements.map((m) => m.lodTriangles ?? 0)), measurements };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = {}; let jsonPath, teen = false, all = false;
  try {
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--complete') options.complete = true;
      else if (args[i] === '--teen') teen = true;
      else if (args[i] === '--all') all = true;
      else if (['--root', '--catalogue', '--json'].includes(args[i])) {
        demand(args[i + 1] && !args[i + 1].startsWith('--'), `${args[i]} requires a path`);
        const flag = args[i++], value = args[i];
        if (flag === '--root') options.modelsDir = resolve(value);
        else if (flag === '--catalogue') options.cataloguePath = resolve(value);
        else jsonPath = value;
      } else if (args[i] === '--help') {
        console.log('usage: garments_validate.mjs [--teen | --all] [--complete] [--root assets/models] [--catalogue file.json] [--json report.json]'); process.exit(0);
      } else fail(`unknown option '${args[i]}'`);
    }
    demand(!(teen && all), '--teen and --all are mutually exclusive');
    demand(!(all && options.cataloguePath), "--all uses each set's own catalogue; --catalogue requires a single set");
    const reports = all ? [validateGarments(options), validateTeenGarments(options)] : [teen ? validateTeenGarments(options) : validateGarments(options)];
    if (jsonPath) writeFileSync(jsonPath, JSON.stringify(all ? { ok: reports.every((r) => r.ok), reports } : reports[0], null, 2) + '\n');
    for (const report of reports) {
      for (const error of report.errors) console.error('ERROR ' + error);
      console.log(`${report.ok ? 'PASS' : 'FAIL'} ${report.set ?? 'garments'} (${report.mode}): ${report.assets} states, ${report.catalogueGarments} garments, ` +
        `${report.runtimeBytes}/${report.runtimeBudgetBytes} bytes, max ${report.maxTriangles}/${report.maxLodTriangles} high/LOD triangles`);
    }
    process.exitCode = reports.every((r) => r.ok) ? 0 : 1;
  } catch (e) { console.error('ERROR ' + e.message); process.exitCode = 1; }
}
