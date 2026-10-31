// Validate the files that are actually shipped, independently of the Blender generator.
//   node la-ladera/tools/blender/animals_validate.mjs --complete [--json]
//   node la-ladera/tools/blender/animals_validate.mjs --models /tmp/models --complete
// An absent/empty library is an intentional fallback only without --complete.
import '../../tests/nice.mjs';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb } from './glb_info.mjs';
// These are the same maps merged by core/matlib.js; importing the definitions keeps
// this CLI dependency-free (it does not need THREE or the browser import-map hook).
import engine from '../../js/engine/matdefs.js';
import world from '../../js/world/matdefs.js';
import arch from '../../js/arch/matdefs.js';
import interiors from '../../js/interiors/matdefs.js';
import people from '../../js/people/matdefs.js';

export const SPECIES = Object.freeze(['dog', 'cat', 'pigeon', 'hen', 'mule', 'parrot_caged', 'canary_caged']);
export const CLIPS = Object.freeze(['idle', 'walk', 'eat']);
export const BUDGET_BYTES = 2_000_000;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MATERIALS = new Set(Object.keys({ ...engine, ...world, ...arch, ...interiors, ...people }));
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const TYPES = {
  5120: [1, 'readInt8', 127], 5121: [1, 'readUInt8', 255],
  5122: [2, 'readInt16LE', 32767], 5123: [2, 'readUInt16LE', 65535],
  5125: [4, 'readUInt32LE', 4294967295], 5126: [4, 'readFloatLE', null],
};
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const insist = (condition, message) => { if (!condition) throw new Error(message); };
const integer = (v) => Number.isInteger(v) && v >= 0;
const finiteVector = (v, n) => Array.isArray(v) && v.length === n && v.every(Number.isFinite);
const same = (a, b, eps = 1e-4) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= eps);

function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}
function matrix(n) {
  if (n.matrix) { insist(finiteVector(n.matrix, 16), 'invalid node matrix'); return n.matrix; }
  const t = n.translation ?? [0, 0, 0], s = n.scale ?? [1, 1, 1], q = n.rotation ?? [0, 0, 0, 1];
  insist(finiteVector(t, 3) && finiteVector(s, 3) && finiteVector(q, 4), 'invalid node transform');
  insist(s.every((v) => Math.abs(v) > 1e-8) && Math.abs(Math.hypot(...q) - 1) < 1e-3, 'degenerate node scale/rotation');
  const [x, y, z, w] = q, [sx, sy, sz] = s;
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, ...t, 1];
}
const transform = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];

/** Strict envelope check before reusing the furniture pipeline's GLB reader. */
function glbEnvelope(path) {
  const data = readFileSync(path);
  insist(data.length >= 28 && data.readUInt32LE(0) === 0x46546c67, 'invalid GLB header');
  insist(data.readUInt32LE(4) === 2 && data.readUInt32LE(8) === data.length, 'GLB version/declared length mismatch');
  let offset = 12, count = 0;
  while (offset < data.length) {
    insist(offset + 8 <= data.length, 'truncated GLB chunk header');
    const length = data.readUInt32LE(offset), type = data.readUInt32LE(offset + 4);
    insist(length % 4 === 0 && offset + 8 + length <= data.length, 'invalid GLB chunk length');
    insist(type === (count === 0 ? 0x4e4f534a : 0x004e4942) && count < 2, 'expected exactly JSON then BIN chunks');
    offset += 8 + length; count++;
  }
  insist(count === 2 && offset === data.length, 'GLB needs one JSON and one BIN chunk');
}

/** Decode and inspect actual accessor bytes; min/max metadata alone is not evidence. */
function accessorReader(g, bin) {
  const cache = new Map();
  return (index, expected = null) => {
    insist(integer(index) && g.accessors?.[index], `unknown accessor ${index}`);
    const a = g.accessors[index];
    insist(!expected || a.type === expected, `accessor ${index}: expected ${expected}, got ${a.type}`);
    if (cache.has(index)) return cache.get(index);
    const size = COMPONENTS[a.type], spec = TYPES[a.componentType], view = g.bufferViews?.[a.bufferView];
    insist(size && spec && view && !a.sparse, `accessor ${index}: unsupported or missing buffer layout`);
    insist(integer(a.count) && a.count > 0 && a.count <= 100_000, `accessor ${index}: invalid count`);
    insist(view.buffer === 0 && integer(view.byteLength) && integer(view.byteOffset ?? 0), `accessor ${index}: invalid buffer view`);
    const [width, method, norm] = spec, packed = width * size, stride = view.byteStride ?? packed;
    const offset = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    insist(integer(a.byteOffset ?? 0) && offset % width === 0 && integer(stride) && stride >= packed && stride % width === 0, `accessor ${index}: invalid offset/stride`);
    insist((a.byteOffset ?? 0) + (a.count - 1) * stride + packed <= view.byteLength && (view.byteOffset ?? 0) + view.byteLength <= g.buffers[0].byteLength, `accessor ${index}: buffer overrun`);
    const values = [];
    for (let i = 0; i < a.count; i++) {
      const row = [];
      for (let j = 0; j < size; j++) {
        let v = bin[method](offset + i * stride + j * width);
        if (a.normalized && norm) v = Math.max(-1, v / norm);
        insist(Number.isFinite(v), `accessor ${index}: non-finite data`); row.push(v);
      }
      values.push(row);
    }
    for (const key of ['min', 'max']) if (a[key]) insist(finiteVector(a[key], size), `accessor ${index}: invalid ${key}`);
    cache.set(index, values); return values;
  };
}

function textureReference(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([k, v]) => /texture$/i.test(k) || textureReference(v));
}

/** Validate one real GLB. Throws with a concise diagnostic; used by the library gate and mutation tests. */
export function inspectAnimalGlb(path, { node, far = false, clips = Object.fromEntries(CLIPS.map((c) => [c, c])) } = {}) {
  glbEnvelope(path);
  const { json: g, bin, bytes } = readGlb(path);
  insist(g.asset?.version === '2.0', 'glTF asset version must be 2.0');
  insist(!g.images?.length && !g.textures?.length && !textureReference(g.materials), 'textures/images are forbidden');
  insist(!g.extensionsRequired?.length, 'required extensions are not supported by this plain GLB pipeline');
  insist(g.buffers?.length === 1 && !g.buffers[0].uri && integer(g.buffers[0].byteLength) && bin && g.buffers[0].byteLength <= bin.length && bin.length - g.buffers[0].byteLength <= 3, 'expected one embedded BIN buffer');
  insist(Array.isArray(g.nodes) && g.nodes.length && g.nodes.length < 256, 'missing/excessive node hierarchy');
  const roots = g.scenes?.[g.scene ?? 0]?.nodes;
  insist(Array.isArray(roots) && roots.length === 1 && g.nodes[roots[0]]?.name === node, `scene root must be '${node}'`);
  const root = roots[0], seen = new Set(), matrices = new Map(), read = accessorReader(g, bin);
  const visit = (i, parent) => {
    insist(integer(i) && g.nodes[i] && !seen.has(i), 'cyclic, duplicated or invalid node hierarchy');
    seen.add(i); const n = g.nodes[i], m = multiply(parent, matrix(n)); matrices.set(i, m);
    for (const child of n.children ?? []) visit(child, m);
  };
  visit(root, IDENTITY);
  for (const m of g.materials ?? []) insist(m.name !== 'missing_asset' && MATERIALS.has(m.name), `unknown library material '${m.name}'`);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  let triangles = 0, primitives = 0, vertices = 0;
  for (const i of seen) {
    const n = g.nodes[i];
    if (n.mesh == null) continue;
    const mesh = g.meshes?.[n.mesh]; insist(mesh?.primitives?.length, `node ${i}: missing mesh`);
    let skin = null;
    if (n.skin != null) {
      skin = g.skins?.[n.skin]; insist(skin?.joints?.length && skin.joints.every((j) => seen.has(j)), `node ${i}: invalid skin joints`);
      if (skin.inverseBindMatrices != null) insist(read(skin.inverseBindMatrices, 'MAT4').length === skin.joints.length, 'skin inverse-bind count mismatch');
    }
    for (const p of mesh.primitives) {
      insist((p.mode ?? 4) === 4 && !p.targets?.length && !p.extensions, 'only uncompressed triangle meshes are supported');
      insist(integer(p.material) && g.materials?.[p.material], 'mesh is missing a named library material');
      const pos = read(p.attributes?.POSITION, 'VEC3'), normal = read(p.attributes?.NORMAL, 'VEC3');
      const positionAccessor = g.accessors[p.attributes.POSITION];
      insist(positionAccessor.componentType === 5126 && finiteVector(positionAccessor.min, 3) && finiteVector(positionAccessor.max, 3), 'positions need FLOAT data and finite declared bounds');
      const actualMin = [0, 1, 2].map((k) => Math.min(...pos.map((v) => v[k]))), actualMax = [0, 1, 2].map((k) => Math.max(...pos.map((v) => v[k])));
      insist(same(actualMin, positionAccessor.min) && same(actualMax, positionAccessor.max), 'position accessor bounds do not match actual vertices');
      insist(normal.length === pos.length && normal.every((v) => Math.abs(Math.hypot(...v) - 1) < 0.03), 'missing/invalid normals');
      const colorIndex = p.attributes.COLOR_0;
      if (colorIndex != null) {
        const colors = read(colorIndex); insist(['VEC3', 'VEC4'].includes(g.accessors[colorIndex].type) && colors.length === pos.length && colors.flat().every((v) => v >= 0 && v <= 1), 'invalid vertex colours');
      }
      if (p.attributes.TEXCOORD_0 != null) insist(read(p.attributes.TEXCOORD_0, 'VEC2').length === pos.length, 'UV count mismatch');
      const indices = p.indices == null ? pos.map((_, k) => [k]) : read(p.indices, 'SCALAR');
      if (p.indices != null) insist([5121, 5123, 5125].includes(g.accessors[p.indices].componentType) && !g.accessors[p.indices].normalized, 'invalid index component type');
      insist(indices.length % 3 === 0 && indices.every(([v]) => integer(v) && v < pos.length), 'triangle index out of range/count mismatch');
      if (skin) {
        const joints = read(p.attributes.JOINTS_0, 'VEC4'), weights = read(p.attributes.WEIGHTS_0, 'VEC4');
        insist([5121, 5123].includes(g.accessors[p.attributes.JOINTS_0].componentType) && !g.accessors[p.attributes.JOINTS_0].normalized, 'invalid skin joint component type');
        insist(joints.length === pos.length && weights.length === pos.length, 'skin attribute count mismatch');
        insist(joints.every((v) => v.every((j) => integer(j) && j < skin.joints.length)), 'skin joint index out of range');
        insist(weights.every((v) => v.every((w) => w >= 0 && w <= 1) && Math.abs(v.reduce((s, w) => s + w, 0) - 1) < 0.005), 'skin weights must be finite and sum to one');
      }
      for (const v of pos) {
        const q = transform(matrices.get(i), v);
        for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); }
      }
      triangles += indices.length / 3; primitives++; vertices += pos.length;
    }
  }
  const limit = far ? 300 : 3000, size = hi.map((v, i) => v - lo[i]);
  insist(triangles > 0 && triangles <= limit, `${triangles} triangles exceeds ${limit} or mesh is empty`);
  insist(size.every((v) => Number.isFinite(v) && v > 0 && v < 8), 'invalid animal dimensions (metres)');
  insist(lo[1] >= -0.025 && lo[1] <= 0.05, `floor origin is misplaced: minY=${lo[1]}`);
  const animations = [];
  if (!far) {
    insist(g.animations?.length === 3, 'near model must contain exactly idle, walk and eat clips');
    for (const kind of CLIPS) {
      insist(typeof clips[kind] === 'string' && clips[kind].length, `manifest needs ${kind} clip`);
      const matches = g.animations.filter((a) => a.name === clips[kind]);
      insist(matches.length === 1, `missing/duplicate ${kind} clip '${clips[kind]}'`);
      const animation = matches[0]; insist(animation.channels?.length, `${kind}: empty animation channels`);
      let changed = false, duration = 0, maxKeys = 0;
      for (const channel of animation.channels) {
        const sampler = animation.samplers?.[channel.sampler], target = channel.target;
        insist(sampler && seen.has(target?.node) && ['translation', 'rotation', 'scale'].includes(target.path), `${kind}: invalid animation target/sampler`);
        insist(['LINEAR', 'STEP'].includes(sampler.interpolation ?? 'LINEAR'), `${kind}: unsupported interpolation`);
        const times = read(sampler.input, 'SCALAR').map(([v]) => v), count = times.length;
        const vals = read(sampler.output, target.path === 'rotation' ? 'VEC4' : 'VEC3');
        insist(g.accessors[sampler.input].componentType === 5126 && g.accessors[sampler.output].componentType === 5126, `${kind}: animation accessors must use FLOAT data`);
        insist(count >= 2 && count <= 12 && vals.length === count, `${kind}: expected 2–12 matching keyframes per sampler`);
        insist(Math.abs(times[0]) < 1e-5 && times.every((v, k) => v >= 0 && (!k || v > times[k - 1])), `${kind}: invalid keyframe times`);
        if (target.path === 'rotation') insist(vals.every((v) => Math.abs(Math.hypot(...v) - 1) < 0.002), `${kind}: non-unit rotation quaternion`);
        if (target.path === 'scale') insist(vals.every((v) => v.every((x) => x > 0)), `${kind}: invalid animated scale`);
        const end = vals.at(-1), equivalent = same(vals[0], end) || (target.path === 'rotation' && same(vals[0], end.map((v) => -v)));
        insist(equivalent, `${kind}: clip does not loop at its endpoints`);
        changed ||= vals.some((v) => !same(v, vals[0], 1e-6));
        duration = Math.max(duration, times.at(-1)); maxKeys = Math.max(maxKeys, count);
      }
      insist(changed, `${kind}: animation has no changing pose`);
      insist(duration >= 0.2 && duration <= 4, `${kind}: clip duration ${duration} is outside 0.2–4 seconds`);
      animations.push({ name: kind, duration, maxKeys });
    }
  }
  return { bytes, triangles, primitives, vertices, min: lo, max: hi, size, materials: (g.materials ?? []).map((m) => m.name), animations };
}

function safeFile(base, rel) {
  insist(typeof rel === 'string' && /^animals\/[a-zA-Z0-9_.\/-]+$/.test(rel) && !rel.split('/').includes('..'), `invalid animal path '${rel}'`);
  const path = resolve(base, rel);
  if (existsSync(path)) insist(!relative(realpathSync(base), realpathSync(path)).startsWith('..' + sep), `animal path escapes models directory: ${rel}`);
  return path;
}
function filesWithin(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? filesWithin(resolve(dir, e.name)) : [resolve(dir, e.name)]);
}

/** Returns a report, including failures, instead of throwing on malformed deliveries. */
export function validateAnimalLibrary({ modelsDir = resolve(ROOT, 'assets/models'), manifestPath = resolve(modelsDir, 'manifest.animals.json'), complete = false } = {}) {
  const report = { ok: false, complete, bytes: 0, budgetBytes: BUDGET_BYTES, animals: [], failures: [] };
  const fail = (message) => report.failures.push(message);
  let manifest;
  try {
    if (!existsSync(manifestPath)) {
      if (complete) fail('missing manifest.animals.json');
      report.ok = !report.failures.length; return report;
    }
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    insist(manifest && typeof manifest === 'object', 'invalid manifest');
    const entries = Object.entries(manifest.animals ?? {});
    if (!entries.length) {
      if (complete) fail('animal manifest is empty');
      report.ok = !report.failures.length; return report;
    }
    insist(manifest.version === 1 && manifest.license === 'CC0-1.0', 'manifest requires version 1 and CC0-1.0 licence');
    for (const id of SPECIES) if (!manifest.animals[id] && complete) fail(`missing species '${id}'`);
    for (const [id] of entries) if (!SPECIES.includes(id)) fail(`unknown species '${id}'`);
    const referenced = new Set();
    for (const [id, meta] of entries) {
      const row = { id }; report.animals.push(row);
      try {
        insist(meta && typeof meta === 'object' && meta.node === id && (meta.lodNode ?? id + '_lod') === id + '_lod', 'incorrect asset root names');
        insist(finiteVector(meta.size, 3) && meta.size.every((v) => v > 0), 'missing/invalid size metadata');
        insist(meta.caged === id.endsWith('_caged'), 'caged metadata does not match species');
        for (const far of [false, true]) {
          const rel = far ? meta.lod : meta.glb, path = safeFile(modelsDir, rel), node = far ? (meta.lodNode ?? id + '_lod') : meta.node;
          insist(rel.endsWith('.glb') && existsSync(path), `missing ${far ? 'far LOD' : 'near'} GLB '${rel}'`);
          referenced.add(path);
          const info = inspectAnimalGlb(path, { node, far, clips: meta.clips }); row[far ? 'far' : 'near'] = info;
          const tris = far ? meta.lodTriangles : meta.triangles, bytes = far ? meta.lodBytes : meta.bytes;
          insist(tris === info.triangles && bytes === info.bytes, `${rel}: triangle/byte metadata mismatch (actual ${info.triangles} tris, ${info.bytes} bytes)`);
          if (!far) insist(same(meta.size, info.size, 0.025), `${rel}: size metadata mismatch`);
          const registered = manifest.files?.some((f) => f.glb === rel && Object.values(f.assets ?? {}).some((a) => a.node === node));
          insist(registered, `${rel}: absent from manifest files/assets registry`);
        }
      } catch (e) { fail(`${id}: ${e.message}`); }
    }
    const creditsPath = safeFile(modelsDir, manifest.credits ?? 'animals/CREDITS.md');
    insist(existsSync(creditsPath), 'missing animals/CREDITS.md');
    const credits = readFileSync(creditsPath, 'utf8');
    insist(/CC0(?:-1\.0|\s+1\.0)/i.test(credits), 'credits must record CC0-1.0');
    for (const [id] of entries) insist(credits.includes(id), `credits missing '${id}' provenance`);
    const all = filesWithin(resolve(modelsDir, 'animals'));
    for (const path of all) if (path.endsWith('.glb') && !referenced.has(path)) fail(`unlisted animal GLB: ${relative(modelsDir, path)}`);
    report.bytes = [...new Set([...all, manifestPath, creditsPath])].reduce((total, p) => total + statSync(p).size, 0);
    if (report.bytes > BUDGET_BYTES) fail(`animal library ${report.bytes} bytes exceeds ${BUDGET_BYTES}`);
  } catch (e) { fail(e.message); }
  report.ok = report.failures.length === 0;
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), opt = (key) => { const i = args.indexOf(key); return i < 0 ? undefined : args[i + 1]; };
  const manifestPath = opt('--manifest') && resolve(opt('--manifest'));
  const modelsDir = opt('--models') ? resolve(opt('--models')) : manifestPath ? dirname(manifestPath) : undefined;
  const report = validateAnimalLibrary({ modelsDir, manifestPath, complete: args.includes('--complete') });
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    for (const row of report.animals) console.log(`${row.id.padEnd(15)} near=${row.near?.triangles ?? '?'} far=${row.far?.triangles ?? '?'} triangles`);
    console.log(`${report.ok ? 'ANIMALS OK' : 'ANIMALS FAILED'}: ${report.animals.length}/${SPECIES.length} species; ${report.bytes}/${BUDGET_BYTES} bytes${report.complete ? '; complete mode' : ''}`);
    for (const error of report.failures) console.error(`  ${error}`);
  }
  process.exitCode = report.ok ? 0 : 1;
}
