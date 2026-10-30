// Validate the shipped bytes, not a count of builder registrations or catalogue names.
// node la-ladera/tools/blender/furn_validate.mjs [--models PATH] [--complete] [--json]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Matrix4, Quaternion, Vector3 } from '../../vendor/three/build/three.core.min.js';
import { CATALOG } from '../../js/interiors/catalog.js';
import { SHOP_TYPES } from '../../js/core/vocab.js';
import engine from '../../js/engine/matdefs.js';
import arch from '../../js/arch/matdefs.js';
import interiors from '../../js/interiors/matdefs.js';
import world from '../../js/world/matdefs.js';
import people from '../../js/people/matdefs.js';

export const MODELS = resolve(dirname(fileURLToPath(import.meta.url)), '../../assets/models');
const MATERIALS = { ...engine, ...world, ...arch, ...interiors, ...people };
const TYPES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const COMPONENTS = { 5120: [1, 'readInt8', 127], 5121: [1, 'readUInt8', 255], 5122: [2, 'readInt16LE', 32767], 5123: [2, 'readUInt16LE', 65535], 5125: [4, 'readUInt32LE', 4294967295], 5126: [4, 'readFloatLE', 1] };
const check = (ok, message) => { if (!ok) throw new Error(message); };
const finite = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Catalogue height is the usable surface (for placing clutter), not the tip of a tap/net.
// Only these authored fittings may exceed it; new oversized bodies still fail validation.
const FITTINGS = {
  dough_table: [0.025, 0.065, 0.025], table_pingpong: [0.025, 0.155, 0.025],
  workbench: [0.025, 0.14, 0.025], workbench_metal: [0.025, 0.14, 0.025], cobbler_bench: [0.025, 0.14, 0.025],
  stove_gas: [0.025, 0.035, 0.03], washing_machine: [0.025, 0.025, 0.045],
  sink_kitchen: [0.025, 0.195, 0.03], lavadero: [0.025, 0.195, 0.025],
  basin_pedestal: [0.025, 0.165, 0.025], basin_vanity: [0.025, 0.165, 0.025],
  barber_station: [0.025, 0.135, 0.025], cafe_counter: [0.025, 0.155, 0.025],
  oven_baker: [0.025, 0.025, 0.05], butcher_block: [0.025, 0.195, 0.025],
};

/** Deliberately independent from GLTFLoader: detects malformed ranges before WebGL sees them. */
export function parseGlb(bytes, label = 'GLB') {
  const b = Buffer.from(bytes);
  check(b.length >= 20 && b.readUInt32LE(0) === 0x46546c67, `${label}: invalid GLB header`);
  check(b.readUInt32LE(4) === 2 && b.readUInt32LE(8) === b.length, `${label}: version/declared length mismatch`);
  let json, bin;
  for (let p = 12, n = 0; p < b.length; n++) {
    check(p + 8 <= b.length, `${label}: truncated chunk header`);
    const len = b.readUInt32LE(p), type = b.readUInt32LE(p + 4); p += 8;
    check(len % 4 === 0 && p + len <= b.length, `${label}: invalid chunk length`);
    check(n !== 0 || type === 0x4e4f534a, `${label}: JSON must be first`);
    if (type === 0x4e4f534a) { check(!json, `${label}: duplicate JSON`); json = JSON.parse(b.toString('utf8', p, p + len)); }
    if (type === 0x004e4942) { check(!bin, `${label}: duplicate BIN`); bin = b.subarray(p, p + len); }
    p += len;
  }
  check(json?.asset?.version === '2.0' && bin, `${label}: missing glTF 2.0 JSON/BIN`);
  check(json.buffers?.length === 1 && !json.buffers[0].uri, `${label}: must be self-contained`);
  const len = json.buffers[0].byteLength;
  check(Number.isInteger(len) && len > 0 && len <= bin.length && bin.length - len <= 3, `${label}: invalid buffer length`);
  check(!(json.images?.length || json.textures?.length), `${label}: embedded/external textures are forbidden`);
  check(!(json.extensionsRequired?.length), `${label}: requires an unconfigured decoder/extension`);
  const cache = new Map();
  function accessor(index) {
    if (cache.has(index)) return cache.get(index);
    const a = json.accessors?.[index], v = a && json.bufferViews?.[a.bufferView], info = a && COMPONENTS[a.componentType], width = a && TYPES[a.type];
    check(a && v && info && width && !a.sparse, `${label}: accessor ${index} is unsupported/missing`);
    const [sz, method, div] = info, stride = v.byteStride ?? width * sz, vo = v.byteOffset ?? 0, ao = a.byteOffset ?? 0;
    check(v.buffer === 0 && Number.isInteger(v.byteLength) && v.byteLength > 0 && Number.isInteger(vo) && vo >= 0 && vo + v.byteLength <= len, `${label}: accessor ${index} bufferView out of range`);
    check(Number.isInteger(a.count) && a.count > 0 && Number.isInteger(ao) && ao >= 0 && ao % sz === 0 && stride >= width * sz && stride % sz === 0, `${label}: accessor ${index} invalid count/stride`);
    check(ao + (a.count - 1) * stride + width * sz <= v.byteLength, `${label}: accessor ${index} exceeds bufferView`);
    const values = new Float64Array(a.count * width);
    for (let i = 0; i < a.count; i++) for (let j = 0; j < width; j++) {
      let x = bin[method](vo + ao + i * stride + j * sz);
      check(Number.isFinite(x), `${label}: accessor ${index} contains non-finite data`);
      if (a.normalized) x = Math.max(-1, x / div);
      values[i * width + j] = x;
    }
    const result = { ...a, width, values }; cache.set(index, result); return result;
  }
  for (let i = 0; i < (json.accessors?.length ?? 0); i++) accessor(i);
  return { json, bin, accessor, bytes: b.length, label };
}

function matrixOf(n, label) {
  if (n.matrix) { check(finite(n.matrix, 16), `${label}: invalid matrix`); return new Matrix4().fromArray(n.matrix); }
  const t = n.translation ?? [0, 0, 0], r = n.rotation ?? [0, 0, 0, 1], s = n.scale ?? [1, 1, 1];
  check(finite(t, 3) && finite(r, 4) && finite(s, 3) && s.every(x => x > 0), `${label}: invalid node transform`);
  return new Matrix4().compose(new Vector3(...t), new Quaternion(...r), new Vector3(...s));
}

export function inspectAsset(glb, key, meta, cat, materials = MATERIALS) {
  const { json: g, accessor } = glb, label = `${glb.label}:${key}`;
  check(cat, `${label}: unknown catalogue key`);
  check(same(meta.size, cat.size) && same(meta.footprint, cat.footprint) && same(meta.tags, cat.tags), `${label}: size/footprint/tags differ from catalogue`);
  const roots = g.scenes?.[g.scene ?? 0]?.nodes ?? [], named = (g.nodes ?? []).flatMap((n, i) => n.name === meta.node ? [i] : []);
  check(named.length === 1 && roots.includes(named[0]), `${label}: missing/non-unique scene root '${meta.node}'`);
  const root = named[0], lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], seen = new Set();
  let triangles = 0, meshes = 0; const materialNames = new Set(), point = new Vector3(), channels = new Map(), meshIds = new Set();
  function visit(ni, parent) {
    check(!seen.has(ni) && g.nodes?.[ni], `${label}: cyclic/shared/invalid child`); seen.add(ni);
    const n = g.nodes[ni], m = parent.clone().multiply(matrixOf(n, label));
    if (n.mesh != null) {
      for (const flag of (n.name ?? '').split('-')) {
        const pick = /^p([a-z])(\d+)$/.exec(flag);
        if (pick) { if (!channels.has(pick[1])) channels.set(pick[1], new Set()); channels.get(pick[1]).add(+pick[2]); }
      }
      const mesh = g.meshes?.[n.mesh]; check(mesh?.primitives?.length, `${label}: empty mesh`); meshes++; meshIds.add(n.mesh);
      for (const p of mesh.primitives) {
        check((p.mode ?? 4) === 4, `${label}: non-triangle primitive`);
        const pos = accessor(p.attributes?.POSITION), nor = accessor(p.attributes?.NORMAL), uv = accessor(p.attributes?.TEXCOORD_0);
        check(pos.width === 3 && nor.width === 3 && uv.width === 2 && pos.count === nor.count && pos.count === uv.count, `${label}: malformed position/normal/UV attributes`);
        const col = p.attributes?.COLOR_0 != null ? accessor(p.attributes.COLOR_0) : null;
        check(!col || ([3, 4].includes(col.width) && col.count === pos.count && col.values.every(x => x >= 0 && x <= 1.0001)), `${label}: malformed colour attribute`);
        const mat = g.materials?.[p.material]?.name;
        check(mat && materials[mat] && mat !== 'missing_asset', `${label}: undefined material '${mat}'`); materialNames.add(mat);
        for (let i = 0; i < pos.count; i++) {
          const j = i * 3, norm = Math.hypot(...nor.values.subarray(j, j + 3));
          check(norm > 0.95 && norm < 1.05, `${label}: non-unit normal`);
          point.fromArray(pos.values, j).applyMatrix4(m);
          for (let d = 0; d < 3; d++) { const v = point.getComponent(d); lo[d] = Math.min(lo[d], v); hi[d] = Math.max(hi[d], v); }
        }
        const idx = p.indices == null ? null : accessor(p.indices), count = idx?.count ?? pos.count;
        check(count % 3 === 0 && count > 0 && (!idx || (idx.width === 1 && [5121, 5123, 5125].includes(idx.componentType) && !idx.normalized)), `${label}: malformed triangle indices`);
        let real = 0;
        for (let i = 0; i < count; i += 3) {
          const indices = [0, 1, 2].map(k => idx ? idx.values[i + k] : i + k);
          check(indices.every(k => Number.isInteger(k) && k >= 0 && k < pos.count), `${label}: index out of range`);
          const [a, b, c] = indices.map(k => pos.values.subarray(k * 3, k * 3 + 3));
          const ab = b.map((x, d) => x - a[d]), ac = c.map((x, d) => x - a[d]);
          if (Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]) > 1e-12) real++;
        }
        check(real > 0, `${label}: primitive has no non-degenerate triangles`); triangles += count / 3;
      }
    }
    for (const child of n.children ?? []) visit(child, m);
  }
  // Runtime removes the asset root transform, so validate in that same asset-local frame.
  const rootNode = g.nodes[root];
  if (rootNode.mesh != null) visit(root, matrixOf(rootNode, label).invert());
  else for (const child of rootNode.children ?? []) visit(child, new Matrix4());
  check(meshes > 0 && triangles > 0, `${label}: root has no drawable geometry`);
  for (const [channel, choices] of channels) for (let i = 0; i <= Math.max(...choices); i++) check(choices.has(i), `${label}: missing alternative p${channel}${i}`);
  const [w, h, d] = cat.size, tolerance = FITTINGS[key] ?? [0.025, 0.025, 0.025];
  const min = [-w / 2, 0, -d / 2], max = [w / 2, h, d / 2];
  check(lo.every((v, i) => v >= min[i] - (i === 1 ? 0.025 : tolerance[i])) && hi.every((v, i) => v <= max[i] + tolerance[i]), `${label}: geometry outside catalogue bounds: ${JSON.stringify({ lo, hi, size: cat.size })}`);
  check(hi.every((v, i) => v - lo[i] >= Math.min(cat.size[i] * 0.2, 0.005)), `${label}: implausibly collapsed geometry`);
  if (meta.triangles != null) check(meta.triangles === triangles, `${label}: triangle count differs from generated bytes`);
  if (meta.bounds) check(finite(meta.bounds.min, 3) && finite(meta.bounds.max, 3) && lo.every((x, i) => Math.abs(x - meta.bounds.min[i]) < 1e-4) && hi.every((x, i) => Math.abs(x - meta.bounds.max[i]) < 1e-4), `${label}: bounds differ from generated bytes`);
  if (meta.origin != null) check(meta.origin === 'floor-centre', `${label}: unsupported asset origin`);
  return { key, triangles, meshes, meshIds: [...meshIds], bounds: { min: lo, max: hi }, materials: [...materialNames] };
}

const REQUIRED = ['bed_single', 'bed_double', 'bed_bunk', 'bed_cot', 'bed_crib', 'sofa_3_vinyl', 'sofa_3_fabric', 'armchair_vinyl', 'chair_wood', 'chair_plastic', 'chair_metal', 'stool_wood', 'table_formica_4', 'table_wood_6', 'table_plastic', 'wardrobe_2', 'dresser_4', 'wall_unit_big', 'stove_gas', 'gas_cylinder', 'fridge', 'sink_kitchen', 'counter_base', 'pot_stack', 'toilet', 'basin_pedestal', 'shower_tray', 'shower_head_electric', 'mirror_bath', 'tv_flat', 'tv_stand', 'radio_old', 'fan_stand', 'lamp_table', 'rug_small', 'altar_home', 'plant_pot_clay', 'clothesline', 'bucket_big', 'ironing_board', 'desk_school', 'exam_bed', 'medical_scale', 'workbench', 'tool_pegboard', 'bottles_group', 'books_stack', 'box_cardboard_m', 'toy_pile'];

export function validateFurniture({ models = MODELS, manifest, read = p => readFileSync(resolve(models, p)), complete = false, minAssets = 120, maxBytes = 10_000_000, requireCategories = true, checkOrphans = true } = {}) {
  const failures = [], assets = [], files = [], keys = new Set(), paths = new Set(); let totalBytes = 0;
  try { manifest ??= JSON.parse(read('manifest.furniture.json')); } catch (e) { return { ok: false, failures: [`manifest: ${e.message}`], assets, files, totalBytes }; }
  if (!Array.isArray(manifest.files)) return { ok: false, failures: ['manifest.files must be an array'], assets, files, totalBytes };
  for (const f of manifest.files ?? []) {
    try {
      check(typeof f.glb === 'string' && /^furniture\/[a-zA-Z0-9_-]+\.glb$/.test(f.glb) && !paths.has(f.glb), `invalid/duplicate furniture path '${f.glb}'`); paths.add(f.glb);
      const bytes = read(f.glb), glb = parseGlb(bytes, f.glb); totalBytes += glb.bytes;
      if (f.bytes != null) check(f.bytes === glb.bytes, `${f.glb}: byte count differs from generated file`);
      if (f.sha256 != null) check(f.sha256 === createHash('sha256').update(bytes).digest('hex'), `${f.glb}: SHA-256 differs from generated file`);
      check(glb.bytes <= 8_000_000, `${f.glb}: exceeds 8 MB per-file budget`);
      check(f.assets && Object.keys(f.assets).length > 0, `${f.glb}: no named assets`);
      const nodeNames = new Set(), usedMeshes = new Set(); files.push({ glb: f.glb, bytes: glb.bytes, assets: Object.keys(f.assets).length });
      for (const [key, meta] of Object.entries(f.assets)) {
        try {
          check(!keys.has(key), `duplicate asset '${key}'`); keys.add(key);
          check(meta.node === key && !nodeNames.has(meta.node), `${key}: duplicate/aliased asset root`); nodeNames.add(meta.node);
          const asset = inspectAsset(glb, key, meta, CATALOG[key]);
          check(asset.meshIds.some(id => !usedMeshes.has(id)), `${key}: duplicate geometry alias, not another generated asset`);
          asset.meshIds.forEach(id => usedMeshes.add(id)); assets.push(asset);
        } catch (e) { failures.push(e.message); }
      }
    } catch (e) { failures.push(e.message); }
  }
  if (assets.length < minAssets) failures.push(`only ${assets.length} valid generated assets; need >= ${minAssets}`);
  if (totalBytes > maxBytes) failures.push(`furniture GLBs total ${totalBytes} bytes exceeds ${maxBytes}-byte budget`);
  if (manifest.totalBytes != null && manifest.totalBytes !== totalBytes) failures.push('manifest totalBytes differs from generated files');
  if (manifest.assetCount != null && manifest.assetCount !== keys.size) failures.push('manifest assetCount differs from named roots');
  if (manifest.generator?.catalogSha256 && manifest.generator.catalogSha256 !== createHash('sha256').update(JSON.stringify(CATALOG)).digest('hex')) failures.push('manifest catalogue SHA-256 is stale');
  const valid = new Set(assets.map(a => a.key));
  if (complete) for (const key of Object.keys(CATALOG)) if (!valid.has(key)) failures.push(`catalogue asset missing: ${key}`);
  if (requireCategories) {
    for (const key of REQUIRED) if (!valid.has(key)) failures.push(`required furniture category representative missing: ${key}`);
    for (const shop of SHOP_TYPES) if (!assets.some(a => CATALOG[a.key].tags.includes(shop))) failures.push(`shop type has no generated fixture: ${shop}`);
  }
  if (checkOrphans && existsSync(resolve(models, 'furniture'))) for (const name of readdirSync(resolve(models, 'furniture'))) if (name.endsWith('.glb') && !paths.has(`furniture/${name}`)) failures.push(`unmanifested furniture file: ${name}`);
  return { ok: !failures.length, failures, assetCount: assets.length, catalogueCount: Object.keys(CATALOG).length, totalBytes, maxBytes, files, assets };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--models'), report = validateFurniture({ models: i >= 0 ? resolve(process.argv[i + 1]) : MODELS, complete: process.argv.includes('--complete') });
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`${report.ok ? 'PASS' : 'FAIL'} furniture: ${report.assetCount ?? 0}/${report.catalogueCount ?? Object.keys(CATALOG).length} assets; ${report.totalBytes} / ${report.maxBytes ?? 10_000_000} bytes`);
    for (const f of report.files) console.log(`  ${f.glb}: ${f.assets} assets, ${f.bytes} bytes`);
    for (const e of report.failures) console.error(`  ${e}`);
  }
  process.exitCode = report.ok ? 0 : 1;
}
