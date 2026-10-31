// Validate the shipped vista kit, including the GLB binary data (not only exporter metadata).
// node --import ./la-ladera/tests/register.mjs la-ladera/tools/blender/vista_validate.mjs --complete [--root <models>] [--json]
import { readFileSync, existsSync, readdirSync, lstatSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { ALL_DEFS } from '../../js/core/matlib.js';
import { readGlb, describe } from './glb_info.mjs';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../assets/models');
export const VISTA_CATEGORIES = Object.freeze(['facade', 'roof', 'tank', 'rebar', 'stair', 'retaining', 'balcony', 'washing']);
const COMPONENTS = { 5120: [1, 'readInt8', 127], 5121: [1, 'readUInt8', 255], 5122: [2, 'readInt16LE', 32767], 5123: [2, 'readUInt16LE', 65535], 5125: [4, 'readUInt32LE', 4294967295], 5126: [4, 'readFloatLE', 1] };
const WIDTHS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const integer = (v) => Number.isSafeInteger(v) && v >= 0;
const vector = (v, length) => Array.isArray(v) && v.length === length && v.every(Number.isFinite);
const close = (a, b, tolerance = 0.00005) => Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
const materialKnown = (name) => typeof name === 'string' && /^[a-zA-Z0-9_]+(?:#[0-9a-fA-F]{6})?$/.test(name) && Object.hasOwn(ALL_DEFS, name.split('#')[0]);

function safePath(root, name) {
  assert(typeof name === 'string' && name.length && !name.includes('\\'), 'invalid relative asset path');
  const path = resolve(root, name), rel = relative(root, path);
  assert(rel && rel !== '..' && !rel.startsWith('..' + sep) && !rel.startsWith(sep), `asset path escapes models directory: ${name}`);
  return path;
}

function strictContainer(path) {
  const bytes = readFileSync(path);
  assert(bytes.length >= 28, 'GLB header/chunks are truncated');
  assert(bytes.readUInt32LE(0) === 0x46546c67, 'GLB magic is invalid');
  assert(bytes.readUInt32LE(4) === 2, 'GLB version must be 2');
  assert(bytes.readUInt32LE(8) === bytes.length, 'GLB header length does not match file length');
  const types = [];
  for (let offset = 12; offset < bytes.length;) {
    assert(offset + 8 <= bytes.length, 'GLB chunk header is truncated');
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    assert(length > 0 && length % 4 === 0, 'GLB chunk length must be positive and 4-byte aligned');
    assert(offset + 8 + length <= bytes.length, 'GLB chunk exceeds file length');
    types.push(type); offset += length + 8;
  }
  assert(types.length === 2 && types[0] === 0x4e4f534a && types[1] === 0x004e4942, 'GLB must contain one JSON chunk followed by one BIN chunk');
  return readGlb(path);                         // reuse the furniture reader after checking its container boundaries
}

function noDependencies(g) {
  assert(g.asset?.version === '2.0', 'glTF asset.version must be 2.0');
  assert(!(g.images?.length) && !(g.textures?.length), 'embedded or external textures/images are forbidden');
  assert(!(g.skins?.length) && !(g.animations?.length), 'vista pieces must be static, without skin or animation dependencies');
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert(key !== 'uri', 'external/data URI dependencies are forbidden');
      assert(!/Texture$/.test(key), `texture reference ${key} is forbidden`);
      if (key === 'extensions') assert(!Object.keys(child).some((x) => /draco|meshopt|texture|basisu/i.test(x)), 'compressed/texture extension dependency is forbidden');
      visit(child);
    }
  };
  visit(g);
}

function binaryAccessors(g, bin) {
  assert(Array.isArray(g.buffers) && g.buffers.length === 1, 'exactly one internal buffer is required');
  const length = g.buffers[0].byteLength;
  assert(integer(length) && length > 0 && bin && length <= bin.length && bin.length - length <= 3, 'internal buffer byteLength is invalid');
  assert(Array.isArray(g.bufferViews) && Array.isArray(g.accessors), 'bufferViews/accessors are required');
  for (const [i, view] of g.bufferViews.entries()) {
    assert(view.buffer === 0 && integer(view.byteOffset ?? 0) && integer(view.byteLength) && view.byteLength > 0, `bufferView ${i}: invalid buffer/range`);
    assert((view.byteOffset ?? 0) + view.byteLength <= length, `bufferView ${i}: range exceeds internal buffer`);
    if (view.byteStride != null) assert(integer(view.byteStride) && view.byteStride >= 4 && view.byteStride <= 252 && view.byteStride % 4 === 0, `bufferView ${i}: invalid byteStride`);
  }
  return g.accessors.map((a, i) => {
    const view = g.bufferViews[a.bufferView], component = COMPONENTS[a.componentType], width = WIDTHS[a.type];
    assert(view && component && width && !a.sparse, `accessor ${i}: unsupported/missing view, componentType, type or sparse data`);
    assert(integer(a.count) && a.count > 0 && integer(a.byteOffset ?? 0), `accessor ${i}: invalid count/offset`);
    const [bytes, read, divisor] = component, stride = view.byteStride ?? width * bytes, local = a.byteOffset ?? 0, offset = (view.byteOffset ?? 0) + local;
    assert(offset % bytes === 0 && local % bytes === 0 && stride >= width * bytes && stride % bytes === 0, `accessor ${i}: invalid alignment/stride`);
    assert(local + (a.count - 1) * stride + width * bytes <= view.byteLength, `accessor ${i}: range exceeds bufferView`);
    assert(!a.normalized || [5120, 5121, 5122, 5123].includes(a.componentType), `accessor ${i}: invalid normalized component type`);
    const values = [], min = Array(width).fill(Infinity), max = Array(width).fill(-Infinity);
    for (let n = 0; n < a.count; n++) {
      const row = [];
      for (let k = 0; k < width; k++) {
        let v = bin[read](offset + n * stride + k * bytes);
        assert(Number.isFinite(v), `accessor ${i}: non-finite binary value`);
        if (a.normalized) v = Math.max(-1, v / divisor);
        row.push(v); min[k] = Math.min(min[k], v); max[k] = Math.max(max[k], v);
      }
      values.push(row);
    }
    // POSITION bounds are checked against the binary values below. Other bounds, if supplied,
    // use the underlying integer representation for normalized glTF accessors.
    for (const key of ['min', 'max']) if (a[key] != null) {
      assert(vector(a[key], width), `accessor ${i}: invalid ${key} metadata`);
      const expected = key === 'min' ? min : max;
      for (let k = 0; k < width; k++) assert(close(a.normalized ? Math.max(-1, a[key][k] / divisor) : a[key][k], expected[k]), `accessor ${i}: ${key} metadata disagrees with binary data`);
    }
    return { ...a, values, actualMin: min, actualMax: max };
  });
}

function validatePrimitives(g, data) {
  assert(Array.isArray(g.meshes) && g.meshes.length > 0, 'GLB has no meshes');
  assert(Array.isArray(g.materials) && g.materials.length > 0, 'GLB has no named library materials');
  for (const m of g.materials) assert(materialKnown(m.name), `unknown library material: ${m.name}`);
  for (const [mi, mesh] of g.meshes.entries()) {
    assert(Array.isArray(mesh.primitives) && mesh.primitives.length > 0, `mesh ${mi}: no primitives`);
    for (const [pi, p] of mesh.primitives.entries()) {
      const label = `mesh ${mi} primitive ${pi}`, pos = data[p.attributes?.POSITION], norm = data[p.attributes?.NORMAL];
      assert((p.mode ?? 4) === 4 && !p.targets, `${label}: only static TRIANGLES are allowed`);
      assert(integer(p.material) && g.materials[p.material], `${label}: missing library material`);
      assert(pos?.type === 'VEC3' && pos.componentType === 5126 && vector(pos.min, 3) && vector(pos.max, 3), `${label}: POSITION must be float VEC3 with bounds`);
      assert(norm?.type === 'VEC3' && norm.componentType === 5126 && norm.count === pos.count, `${label}: matching float NORMAL required`);
      for (const [name, index] of Object.entries(p.attributes)) {
        const a = data[index]; assert(a && a.count === pos.count, `${label}: ${name} has missing/mismatched vertex data`);
        if (name.startsWith('TEXCOORD_')) assert(a.type === 'VEC2', `${label}: ${name} must be VEC2`);
        if (name.startsWith('COLOR_')) {
          assert(a.type === 'VEC3' || a.type === 'VEC4', `${label}: ${name} must be VEC3/VEC4`);
          assert(a.values.every((v) => v.every((n) => n >= 0 && n <= 1.00001)), `${label}: ${name} must be normalized colours in [0,1]`);
        }
      }
      for (const n of norm.values) assert(Math.abs(Math.hypot(...n) - 1) < 0.002, `${label}: NORMAL is not unit length`);
      let indices;
      if (p.indices != null) {
        const idx = data[p.indices];
        assert(idx?.type === 'SCALAR' && [5121, 5123, 5125].includes(idx.componentType) && !idx.normalized, `${label}: invalid index accessor`);
        indices = idx.values.map((v) => v[0]);
      } else indices = Array.from({ length: pos.count }, (_, n) => n);
      assert(indices.length > 0 && indices.length % 3 === 0, `${label}: index count must be a positive multiple of three`);
      assert(indices.every((n) => integer(n) && n < pos.count), `${label}: index outside POSITION bounds`);
      for (let t = 0; t < indices.length; t += 3) {
        const ids = indices.slice(t, t + 3), [a, b, c] = ids.map((n) => pos.values[n]);
        const u = b.map((v, k) => v - a[k]), v = c.map((v, k) => v - a[k]);
        const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], area = Math.hypot(...cross);
        assert(area > 1e-10, `${label}: degenerate triangle ${t / 3}`);
        const sum = [0, 1, 2].map((k) => ids.reduce((n, id) => n + norm.values[id][k], 0));
        assert(cross.reduce((n, value, k) => n + value * sum[k], 0) > area * 1e-5, `${label}: triangle ${t / 3} winding disagrees with normals`);
      }
    }
  }
}

function worldBounds(g, data) {
  assert(Array.isArray(g.nodes) && g.nodes.length > 0 && g.scenes?.length === 1, 'one scene with named asset roots is required');
  const roots = g.scenes[0].nodes, parents = new Map(), visited = new Set(), names = new Set(), assets = new Map();
  assert(Array.isArray(roots) && roots.length > 0 && new Set(roots).size === roots.length, 'invalid/duplicate scene roots');
  const matrix = (n) => {
    if (n.matrix) {
      assert(vector(n.matrix, 16) && !n.translation && !n.rotation && !n.scale, 'invalid node matrix/TRS');
      const m = new Matrix4().fromArray(n.matrix);
      assert(m.determinant() > 1e-9 && [3, 7, 11].every((i) => close(n.matrix[i], 0)) && close(n.matrix[15], 1), 'node matrix must be nonsingular, affine and preserve winding');
      return m;
    }
    const t = n.translation ?? [0, 0, 0], r = n.rotation ?? [0, 0, 0, 1], s = n.scale ?? [1, 1, 1];
    assert(vector(t, 3) && vector(r, 4) && vector(s, 3) && s.every((v) => v > 0) && Math.abs(Math.hypot(...r) - 1) < 0.0001, 'invalid finite node TRS');
    return new Matrix4().compose(new Vector3(...t), new Quaternion(...r), new Vector3(...s));
  };
  const visit = (index, parent, root, chain) => {
    assert(integer(index) && g.nodes[index], `invalid node index ${index}`);
    assert(!chain.has(index), `node cycle at ${index}`);
    assert(!visited.has(index), `node ${index} has multiple parents/roots`);
    visited.add(index); const n = g.nodes[index], transform = new Matrix4().multiplyMatrices(parent, matrix(n));
    const nextChain = new Set(chain).add(index);
    if (n.mesh != null) {
      assert(integer(n.mesh) && g.meshes[n.mesh], `node ${index}: invalid mesh`);
      const asset = assets.get(root) ?? { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      for (const p of g.meshes[n.mesh].primitives) for (const v of data[p.attributes.POSITION].values) {
        const q = new Vector3(...v).applyMatrix4(transform).toArray();
        for (let k = 0; k < 3; k++) { asset.min[k] = Math.min(asset.min[k], q[k]); asset.max[k] = Math.max(asset.max[k], q[k]); }
      }
      assets.set(root, asset);
    }
    assert(n.children == null || Array.isArray(n.children), `node ${index}: invalid children`);
    for (const child of n.children ?? []) { parents.set(child, index); visit(child, transform, root, nextChain); }
  };
  for (const root of roots) {
    const name = g.nodes[root]?.name;
    assert(typeof name === 'string' && name.length && !names.has(name), 'missing/duplicate asset root name');
    names.add(name); visit(root, new Matrix4(), name, new Set());
    assert(assets.has(name), `asset ${name}: no mesh data`);
  }
  assert(visited.size === g.nodes.length, 'GLB contains unreachable nodes');
  for (const a of assets.values()) a.size = a.max.map((v, k) => v - a.min[k]);
  return assets;
}

function inspectGlb(path) {
  const { json: g, bin } = strictContainer(path);
  noDependencies(g); const data = binaryAccessors(g, bin); validatePrimitives(g, data);
  const bounds = worldBounds(g, data), description = describe(path);  // same asset/material accounting as furniture
  for (const [name, a] of description.assets) Object.assign(a, bounds.get(name));
  return description;
}

/** Normal mode validates whatever has been generated. Complete mode also requires every shipped contract. */
export function validateKit({ root = DEFAULT_ROOT, complete = false } = {}) {
  root = resolve(root);
  const report = { ok: false, complete, root, errors: [], warnings: [], pieces: 0, assets: 0, files: 0, bytes: 0, categories: {}, nearTriangles: 0, farTriangles: 0 };
  const fail = (message) => report.errors.push(message), missing = (message) => (complete ? report.errors : report.warnings).push(message);
  const attempt = (label, fn) => { try { return fn(); } catch (error) { fail(`${label}: ${error.message}`); return null; } };
  const readJson = (name) => attempt(name, () => JSON.parse(readFileSync(safePath(root, name), 'utf8')));
  const manifestPath = resolve(root, 'manifest.vista.json'), placementPath = resolve(root, 'vista/placement.json');
  const tally = (path) => {
    if (!existsSync(path)) return;
    const s = lstatSync(path); assert(!s.isSymbolicLink(), `kit may not contain symbolic links: ${path}`);
    if (s.isDirectory()) for (const name of readdirSync(path)) tally(resolve(path, name));
    else { report.bytes += s.size; report.files++; }
  };
  attempt('payload', () => { tally(resolve(root, 'vista')); tally(manifestPath); assert(report.bytes < 2_000_000, `kit is ${report.bytes} bytes; must be below 2,000,000`); });
  if (!existsSync(manifestPath)) missing('manifest.vista.json is missing');
  if (!existsSync(placementPath)) missing('vista/placement.json is missing');
  const manifest = existsSync(manifestPath) ? readJson('manifest.vista.json') : null;
  const placement = existsSync(placementPath) ? readJson('vista/placement.json') : null;
  const registered = new Map(), descriptions = new Map(), files = new Set();
  if (manifest) attempt('manifest', () => {
    assert(Array.isArray(manifest.files), 'files must be an array');
    for (const file of manifest.files) {
      assert(typeof file.glb === 'string' && /^vista\/[^/]+\.glb$/.test(file.glb), 'each GLB must be inside vista/');
      assert(!files.has(file.glb), `duplicate GLB entry ${file.glb}`); files.add(file.glb);
      assert(file.assets && typeof file.assets === 'object' && !Array.isArray(file.assets), `assets missing for ${file.glb}`);
      for (const [name, metadata] of Object.entries(file.assets)) {
        assert(!registered.has(name), `duplicate asset key ${name}`);
        assert(metadata && typeof metadata.node === 'string' && metadata.node === name, `${name}: manifest node must match asset key`);
        registered.set(name, { file: file.glb, metadata });
      }
      const path = safePath(root, file.glb);
      if (!existsSync(path)) { missing(`${file.glb} is missing`); continue; }
      const d = attempt(file.glb, () => inspectGlb(path));
      if (d) {
        descriptions.set(file.glb, d); report.assets += d.assets.size;
        for (const name of d.assets.keys()) assert(Object.hasOwn(file.assets, name), `${file.glb}: unregistered node ${name}`);
        for (const name of Object.keys(file.assets)) assert(d.assets.has(name), `${file.glb}: missing node ${name}`);
      }
    }
    if (complete) assert(files.size > 0, 'no GLB files declared');
  });
  // Reject stray/unregistered GLBs too: a forgotten export still consumes the download budget.
  if (existsSync(resolve(root, 'vista'))) for (const name of readdirSync(resolve(root, 'vista'))) if (name.endsWith('.glb') && !files.has(`vista/${name}`)) fail(`unregistered GLB vista/${name}`);
  if (placement) attempt('placement', () => {
    assert(placement.version === 1 && placement.units === 'metres' && placement.origin === 'floor-centre', 'version/units/origin must be 1/metres/floor-centre');
    assert(Array.isArray(placement.pieces), 'pieces must be an array');
    assert(Array.isArray(placement.palette) && placement.palette.length >= 2 && placement.palette.every((c) => typeof c === 'string' && /^#?[0-9a-fA-F]{6}$/.test(c)), 'palette must contain at least two hex colours');
    report.pieces = placement.pieces.length;
    if (complete) assert(report.pieces >= 40 && report.pieces <= 60, `expected 40–60 logical pieces, got ${report.pieces}`);
    const ids = new Set(), expected = new Set();
    for (const p of placement.pieces) attempt(`piece ${p.id}`, () => {
      assert(typeof p.id === 'string' && /^[a-z][a-z0-9_]*$/.test(p.id) && !ids.has(p.id), 'invalid/duplicate id'); ids.add(p.id);
      assert(VISTA_CATEGORIES.includes(p.category), `unknown category ${p.category}`);
      report.categories[p.category] = (report.categories[p.category] ?? 0) + 1;
      assert(p.near === `vista_${p.id}` && p.far === `${p.near}_far`, 'near/far node naming mismatch');
      assert(vector(p.size, 3) && p.size.every((v) => v > 0 && v <= 50), 'size must be positive dimensions in metres, each at most 50m');
      assert(p.stack && Array.isArray(p.stack.on) && p.stack.on.length && Array.isArray(p.stack.supports), 'stack must describe on/supports categories');
      for (const [key, allowGround] of [['on', true], ['supports', false]]) {
        const list = p.stack[key]; assert(new Set(list).size === list.length && list.every((s) => VISTA_CATEGORIES.includes(s) || (allowGround && s === 'ground')), `stack.${key}: invalid/duplicate category`);
      }
      assert(Number.isFinite(p.stack.height) && p.stack.height >= 0 && p.stack.height <= p.size[1] + 0.03, 'stack.height lies outside the piece');
      assert(integer(p.stack.maxLevels) && p.stack.maxLevels >= 1 && p.stack.maxLevels <= 8, 'stack.maxLevels must be 1–8');
      assert(!p.stack.supports.length || p.stack.height > 0, 'supporting piece needs a positive stacking plane');
      const needsFrontMount = p.category === 'facade' && (complete || p.mounts != null);
      if (needsFrontMount) {
        const front = p.mounts?.front;
        assert(front && Number.isFinite(front.y) && Number.isFinite(front.z), 'facade front mount needs finite y/z coordinates');
        assert(front.y >= 0 && front.y <= p.size[1] && front.z >= 0 && front.z <= p.size[2] / 2, 'facade front mount lies outside its height/front envelope');
      }
      for (const lod of ['near', 'far']) {
        const name = p[lod]; expected.add(name);
        const declared = p[`${lod}Triangles`], limit = lod === 'near' ? 599 : 60;
        assert(integer(declared) && declared > 0 && declared <= limit, `${lod} triangle metadata must be 1–${limit}`);
        report[`${lod}Triangles`] += declared;
        const entry = registered.get(name);
        if (!entry) { missing(`${name} is not registered in manifest`); continue; }
        const actual = descriptions.get(entry.file)?.assets.get(name); if (!actual) continue;
        assert(actual.tris === declared && actual.tris <= limit, `${lod}: actual triangles ${actual.tris} disagree with declared ${declared} or exceed ${limit}`);
        // size is the centred placement cell, not a demand that slender columns/laundry fill it.
        const lo = [-p.size[0] / 2, 0, -p.size[2] / 2], hi = [p.size[0] / 2, p.size[1], p.size[2] / 2];
        assert(Math.abs(actual.min[1]) <= 0.025, `${lod}: origin is not on the floor`);
        assert(actual.min.every((v, k) => v >= lo[k] - 0.01) && actual.max.every((v, k) => v <= hi[k] + 0.01), `${lod}: binary bounds exceed the floor-centre placement size ${p.size}`);
        const m = entry.metadata;
        if (needsFrontMount) {
          const front = m.mounts?.front;
          assert(front && Number.isFinite(front.y) && Number.isFinite(front.z) && close(front.y, p.mounts.front.y) && close(front.z, p.mounts.front.z), `${lod}: manifest front mount disagrees with placement`);
        }
        assert(m.origin === 'floor-centre' && m.lod === lod && m.piece === p.id, `${lod}: manifest origin/lod/piece mismatch`);
        assert(vector(m.footprint, 2) && close(m.footprint[0], p.size[0]) && close(m.footprint[1], p.size[2]), `${lod}: manifest footprint mismatch`);
        assert(Array.isArray(m.bounds) && vector(m.bounds[0], 3) && vector(m.bounds[1], 3) && m.bounds[0].every((v, k) => close(v, actual.min[k])) && m.bounds[1].every((v, k) => close(v, actual.max[k])), `${lod}: manifest bounds disagree with binary positions`);
        assert(m.triangles != null && m.size != null && m.category != null, `${lod}: missing triangle/size/category metadata`);
        for (const field of ['triangles', 'tris']) if (m[field] != null) assert(m[field] === actual.tris, `${lod}: manifest ${field} mismatch`);
        if (m.category != null) assert(m.category === p.category, `${lod}: manifest category mismatch`);
        if (m.size != null) assert(vector(m.size, 3) && m.size.every((v, k) => close(v, p.size[k])), `${lod}: manifest size mismatch`);
      }
    });
    for (const name of registered.keys()) assert(expected.has(name), `manifest asset ${name} is absent from placement data`);
    if (complete) for (const category of VISTA_CATEGORIES) assert(report.categories[category] > 0, `missing required category ${category}`);
  });
  if (complete) {
    if (!existsSync(resolve(root, 'manifest.json'))) fail('root manifest.json is missing');
    else { const index = readJson('manifest.json'); if (index && (!Array.isArray(index.files) || !index.files.includes('manifest.vista.json'))) fail('root manifest.json does not register manifest.vista.json'); }
  }
  report.ok = report.errors.length === 0;
  return report;
}

/** Shared CLI entry, injectable only at its output boundary so tests need no child process. */
export function runCli(args, { write = console.log, writeError = console.error } = {}) {
  let root = DEFAULT_ROOT;
  try {
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--root') { assert(args[i + 1] && !args[i + 1].startsWith('--'), '--root needs a directory'); root = args[++i]; }
      else assert(['--complete', '--json'].includes(args[i]), `unknown argument ${args[i]}`);
    }
    const report = validateKit({ root, complete: args.includes('--complete') });
    if (args.includes('--json')) write(JSON.stringify(report, null, 2));
    else {
      write(`vista: ${report.ok ? 'PASS' : 'FAIL'} ${report.pieces} pieces / ${report.assets} nodes / ${report.bytes.toLocaleString('en-GB')} bytes; near=${report.nearTriangles} far=${report.farTriangles} triangles`);
      for (const warning of report.warnings) write(`  pending: ${warning}`);
      for (const error of report.errors) writeError(`  ERROR: ${error}`);
    }
    return report.ok ? 0 : 1;
  } catch (error) { writeError(error.message); return 1; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2));
}
