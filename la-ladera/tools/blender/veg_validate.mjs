// Independent binary checks for the Blender vegetation library. No browser or third-party packages.
import { readFile, readdir, lstat } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

export const TREE_SPECIES = ['eucalyptus', 'cypress', 'palm', 'banana', 'almendro'];
export const VEGETATION_SPECIES = [...TREE_SPECIES, 'agave', 'bougainvillea', 'potted_fern', 'potted_succulent', 'climbing_vine', 'window_box', 'flower_bed', 'wild_grass', 'leafy_shrub'];
export const LIBRARY_MAX_BYTES = 3_000_000;
const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MODELS = resolve(HERE, '../../assets/models');
const COMPONENT = { 5120: [1, 'readInt8', 127], 5121: [1, 'readUInt8', 255], 5122: [2, 'readInt16LE', 32767], 5123: [2, 'readUInt16LE', 65535], 5125: [4, 'readUInt32LE', 4294967295], 5126: [4, 'readFloatLE', 1] };
const ITEMS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const EPS = 0.0002;
const RIGID_HEIGHT = { potted_fern: 0.46, potted_succulent: 0.40, window_box: 0.22, flower_bed: 0.12 };
const insist = (ok, message) => { if (!ok) throw new Error(message); };
const integer = (v) => Number.isInteger(v) && v >= 0;
const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= EPS;
const sha = (b) => createHash('sha256').update(b).digest('hex');
const sameVector = (a, b) => Array.isArray(a) && a.length === b.length && a.every((n, i) => close(n, b[i]));

export function parseVegetationGlb(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  insist(b.length >= 28 && b.readUInt32LE(0) === 0x46546c67, 'invalid GLB magic/header');
  insist(b.readUInt32LE(4) === 2 && b.readUInt32LE(8) === b.length, 'invalid GLB version or declared length');
  const chunks = []; let offset = 12;
  while (offset < b.length) {
    insist(offset + 8 <= b.length, 'truncated GLB chunk header');
    const length = b.readUInt32LE(offset), type = b.readUInt32LE(offset + 4); offset += 8;
    insist(length % 4 === 0 && offset + length <= b.length, 'invalid GLB chunk length/alignment');
    chunks.push({ type, data: b.subarray(offset, offset + length) }); offset += length;
  }
  insist(chunks.length === 2 && chunks[0].type === 0x4e4f534a && chunks[1].type === 0x004e4942, 'GLB must contain exactly JSON then BIN');
  const gltf = JSON.parse(chunks[0].data.toString('utf8').trim()), binary = chunks[1].data;
  insist(gltf.asset?.version === '2.0', 'glTF asset.version must be 2.0');
  insist(gltf.buffers?.length === 1 && !gltf.buffers[0].uri, 'one internal GLB buffer required; external buffers forbidden');
  const n = gltf.buffers[0].byteLength;
  insist(integer(n) && n <= binary.length && binary.length - n <= 3, 'GLB buffer byteLength mismatch');
  return { gltf, binary };
}

export function readVegetationAccessor(gltf, binary, index) {
  const a = gltf.accessors?.[index]; insist(a && !a.sparse, 'missing accessor or unsupported sparse accessor');
  const c = COMPONENT[a.componentType], itemSize = ITEMS[a.type];
  insist(c && itemSize && Number.isInteger(a.count) && a.count > 0, 'invalid accessor component/type/count');
  insist(a.normalized === undefined || typeof a.normalized === 'boolean', 'accessor normalized must be boolean');
  insist(!(a.normalized && a.componentType === 5126), 'FLOAT accessor cannot be normalized');
  const view = gltf.bufferViews?.[a.bufferView]; insist(view && view.buffer === 0, 'invalid accessor bufferView');
  const vb = view.byteOffset ?? 0, ab = a.byteOffset ?? 0, stride = view.byteStride ?? c[0] * itemSize;
  insist([vb, ab, view.byteLength, stride].every(integer), 'invalid accessor byte offsets');
  insist(view.byteStride === undefined || (stride >= 4 && stride <= 252 && stride % 4 === 0), 'invalid glTF accessor stride');
  insist(vb % c[0] === 0 && ab % c[0] === 0 && stride % c[0] === 0 && stride >= itemSize * c[0], 'invalid accessor stride/alignment');
  insist(vb + view.byteLength <= gltf.buffers[0].byteLength && ab + (a.count - 1) * stride + itemSize * c[0] <= view.byteLength, 'accessor exceeds buffer bounds');
  const values = new Array(a.count * itemSize);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < itemSize; k++) {
    let v = binary[c[1]](vb + ab + i * stride + k * c[0]);
    if (a.normalized && a.componentType !== 5126) v = Math.max(-1, v / c[2]);
    insist(Number.isFinite(v), 'non-finite accessor geometry/colour'); values[i * itemSize + k] = v;
  }
  return { ...a, itemSize, values, offset: vb + ab, stride };
}

const CRC = Array.from({ length: 256 }, (_, v) => { for (let k = 0; k < 8; k++) v = v & 1 ? 0xedb88320 ^ (v >>> 1) : v >>> 1; return v >>> 0; });
function crc32(b) { let c = 0xffffffff; for (const v of b) c = CRC[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function readPng(b) {
  insist(b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'invalid PNG signature');
  let offset = 8, width, height, ended = false; const idat = [];
  while (offset < b.length) {
    insist(offset + 12 <= b.length, 'truncated PNG chunk'); const n = b.readUInt32BE(offset), type = b.toString('ascii', offset + 4, offset + 8);
    insist(offset + n + 12 <= b.length, 'PNG chunk exceeds file');
    const p = b.subarray(offset + 8, offset + n + 8);
    insist(crc32(b.subarray(offset + 4, offset + n + 8)) === b.readUInt32BE(offset + n + 8), 'PNG CRC mismatch');
    if (type === 'IHDR') {
      insist(offset === 8 && n === 13 && width === undefined, 'invalid PNG IHDR'); width = p.readUInt32BE(0); height = p.readUInt32BE(4);
      insist(width > 0 && height > 0 && width * height <= 16777216 && p[8] === 8 && p[9] === 6 && p[10] === 0 && p[11] === 0 && p[12] === 0, 'atlas must be noninterlaced 8-bit RGBA PNG');
    } else if (type === 'IDAT') idat.push(p);
    else if (type === 'IEND') { insist(n === 0, 'invalid PNG IEND'); ended = true; offset += n + 12; break; }
    offset += n + 12;
  }
  insist(ended && offset === b.length && width && idat.length, 'incomplete PNG or trailing bytes');
  const stride = width * 4, raw = inflateSync(Buffer.concat(idat), { maxOutputLength: height * (stride + 1) });
  insist(raw.length === height * (stride + 1), 'PNG decoded size mismatch');
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]; insist(filter <= 4, 'unknown PNG filter');
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0, up = y ? pixels[(y - 1) * stride + x] : 0, ul = y && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
      const p = left + up - ul, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - ul);
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : pa <= pb && pa <= pc ? left : pb <= pc ? up : ul;
      pixels[y * stride + x] = (raw[y * (stride + 1) + x + 1] + predictor) & 255;
    }
  }
  return { width, height, pixels };
}

async function checkedFile(modelsDir, name, bytes, hash) {
  insist(typeof name === 'string' && /^vegetation\/[a-z0-9_.-]+\.(glb|png)$/.test(name), 'unsafe asset path');
  const path = resolve(modelsDir, name), rel = relative(modelsDir, path);
  insist(!isAbsolute(rel) && !rel.startsWith('..'), 'asset path escapes models directory');
  const folder = await lstat(resolve(modelsDir, 'vegetation')); insist(folder.isDirectory() && !folder.isSymbolicLink(), 'vegetation directory must not be a symlink');
  const st = await lstat(path); insist(st.isFile() && !st.isSymbolicLink(), 'asset must be a regular file, not a symlink');
  const b = await readFile(path);
  insist(Number.isInteger(bytes) && bytes === b.length, name + ': bytes mismatch');
  insist(typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash) && sha(b) === hash, name + ': sha256 mismatch');
  return b;
}

function geometry(gltf, binary, node, meta, key, atlas) {
  insist(!node.children?.length && node.skin === undefined && node.camera === undefined, 'asset must be an independent root mesh, no leaf hierarchy');
  insist(node.translation === undefined || sameVector(node.translation, [0, 0, 0]), 'node transform must be identity');
  insist(node.scale === undefined || sameVector(node.scale, [1, 1, 1]), 'node transform must be identity');
  insist(node.rotation === undefined || sameVector(node.rotation, [0, 0, 0, 1]), 'node transform must be identity');
  insist(node.matrix === undefined || sameVector(node.matrix, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), 'node matrix must be identity');
  const mesh = gltf.meshes?.[node.mesh]; insist(mesh?.primitives?.length === 1 && !mesh.weights, 'one primitive per mesh required');
  const p = mesh.primitives[0]; insist((p.mode ?? 4) === 4 && p.indices !== undefined && !p.targets && !p.extensions, 'indexed triangles required, no targets/compression');
  const material = gltf.materials?.[p.material], billboard = meta.lod === 'billboard';
  insist(material?.name === (billboard ? 'flora_billboard' : 'flora_vertex'), 'material name must match the library LOD contract');
  const pos = readVegetationAccessor(gltf, binary, p.attributes?.POSITION), normal = readVegetationAccessor(gltf, binary, p.attributes?.NORMAL), uv = readVegetationAccessor(gltf, binary, p.attributes?.TEXCOORD_0), colour = readVegetationAccessor(gltf, binary, p.attributes?.COLOR_0), idx = readVegetationAccessor(gltf, binary, p.indices);
  insist(pos.type === 'VEC3' && pos.componentType === 5126 && !pos.normalized, 'POSITION must be float VEC3');
  insist(normal.type === 'VEC3' && normal.componentType === 5126 && normal.count === pos.count, 'NORMAL count/type mismatch');
  insist(uv.type === 'VEC2' && uv.count === pos.count && (uv.componentType === 5126 || ([5121, 5123].includes(uv.componentType) && uv.normalized)), 'UV count/type mismatch');
  insist(colour.type === 'VEC4' && colour.count === pos.count && (colour.componentType === 5126 || ([5121, 5123].includes(colour.componentType) && colour.normalized)), 'COLOR_0 must be RGBA float or normalized unsigned integer');
  insist(idx.type === 'SCALAR' && [5121, 5123, 5125].includes(idx.componentType) && !idx.normalized && idx.count % 3 === 0, 'invalid indexed triangle accessor');
  const triangles = idx.count / 3; insist(meta.triangles === triangles, 'triangle count mismatch');
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.count; i++) {
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos.values[i * 3 + k]); max[k] = Math.max(max[k], pos.values[i * 3 + k]); }
    insist(Math.abs(Math.hypot(...normal.values.slice(i * 3, i * 3 + 3)) - 1) < 0.035, 'NORMAL must be unit length');
    insist(colour.values.slice(i * 4, i * 4 + 4).every((v) => v >= 0 && v <= 1), 'colour/wind outside normalized [0,1] range');
  }
  for (let i = 0; i < idx.count; i += 3) {
    const ids = idx.values.slice(i, i + 3); insist(ids.every((v) => Number.isInteger(v) && v >= 0 && v < pos.count), 'index outside vertex range');
    const a = ids.map((v) => pos.values.slice(v * 3, v * 3 + 3)), u = a[1].map((v, k) => v - a[0][k]), v = a[2].map((v, k) => v - a[0][k]);
    insist(Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) > 1e-12, 'degenerate triangle');
  }
  const size = max.map((v, k) => v - min[k]);
  insist(sameVector(pos.min, min) && sameVector(pos.max, max), 'POSITION accessor bounds mismatch');
  insist(sameVector(meta.bounds?.min, min) && sameVector(meta.bounds?.max, max) && sameVector(meta.size, size), 'manifest bounds/size mismatch');
  insist(Math.abs(min[1]) <= EPS && size[1] > 0, 'vegetation must have its soil origin at Y=0');
  insist(meta.wind === 'COLOR_0.a' && Number.isFinite(meta.rigidHeight) && meta.rigidHeight >= 0, 'missing wind or rigidHeight contract');
  insist(close(meta.rigidHeight, RIGID_HEIGHT[meta.species] ?? 0), 'rigidHeight differs from species pot/root contract');
  let rigidVertices = 0, flexibleVertices = 0;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.values[i * 3 + 1], alpha = colour.values[i * 4 + 3];
    if (y <= Math.max(min[1] + size[1] * 0.01, meta.rigidHeight) + EPS) { insist(alpha <= 1e-5, 'rigid root/pot vertex has nonzero wind'); rigidVertices++; }
    if (alpha >= 0.25) flexibleVertices++;
  }
  insist(rigidVertices > 0 && flexibleVertices > 0, 'wind requires rigid roots and flexible tips');
  if (billboard) {
    insist(triangles === 2 && pos.count === 4, 'billboard must be one two-triangle quad');
    const tile = atlas?.tiles?.[meta.species]; insist(Array.isArray(tile) && tile.length === 4, 'missing billboard atlas tile');
    let bottomV = 0, topV = 0, bottoms = 0, tops = 0;
    for (let i = 0; i < pos.count; i++) {
      const u = uv.values[i * 2], v = uv.values[i * 2 + 1], y = pos.values[i * 3 + 1];
      insist(u >= tile[0] - EPS && u <= tile[2] + EPS && v >= tile[1] - EPS && v <= tile[3] + EPS, 'billboard UV outside atlas tile');
      if (close(y, min[1])) { bottomV += v; bottoms++; } if (close(y, max[1])) { topV += v; tops++; }
    }
    insist(bottoms && tops && topV / tops < bottomV / bottoms, 'billboard UV V must decrease upward for flipY=false');
  }
  return { key, species: meta.species, lod: meta.lod, triangles, vertices: pos.count, bounds: { min, max }, rigidVertices, flexibleVertices };
}

export async function validateVegetation({ modelsDir = DEFAULT_MODELS, complete = false } = {}) {
  modelsDir = resolve(modelsDir);
  const report = { ok: false, complete, errors: [], warnings: [], files: [], assets: [], stats: { species: 0, assets: 0, glbBytes: 0, atlasBytes: 0, manifestBytes: 0, totalBytes: 0 } };
  const check = async (label, fn) => { try { return await fn(); } catch (e) { report.errors.push(label + ': ' + (e.code === 'ENOENT' ? 'missing file' : e.message)); return undefined; } };
  let manifest;
  await check('manifest.vegetation.json', async () => { const b = await readFile(resolve(modelsDir, 'manifest.vegetation.json')); report.stats.manifestBytes = b.length; manifest = JSON.parse(b); insist(Array.isArray(manifest.files) && manifest.files.length > 0, 'files must be nonempty'); insist(Array.isArray(manifest.species) && new Set(manifest.species).size === manifest.species.length, 'species must be a unique array'); });
  if (!Array.isArray(manifest?.files) || !Array.isArray(manifest.species)) return report;
  const declared = new Set(), seen = new Set(), species = new Set(), families = new Map();
  for (const file of manifest.files) await check(file.glb ?? 'GLB', async () => {
    insist(!declared.has(file.glb), 'duplicate GLB path'); declared.add(file.glb);
    const bytes = await checkedFile(modelsDir, file.glb, file.bytes, file.sha256); report.stats.glbBytes += bytes.length;
    const { gltf, binary } = parseVegetationGlb(bytes);
    for (const k of ['images', 'textures', 'samplers', 'skins', 'animations', 'cameras', 'extensionsRequired']) insist(!gltf[k]?.length, 'GLB may not contain ' + k);
    insist(!JSON.stringify(gltf.materials ?? []).includes('Texture'), 'embedded material texture references forbidden');
    const entries = Object.entries(file.assets ?? {}); insist(entries.length > 0 && entries.length <= 4, 'GLB must contain one species with three LODs and optional billboard');
    insist(gltf.nodes?.length === entries.length && gltf.meshes?.length === entries.length && gltf.scenes?.length === 1 && (gltf.scene ?? 0) === 0 && gltf.scenes[0].nodes?.length === entries.length, 'root node/mesh count must match manifest assets');
    insist(new Set(gltf.scenes[0].nodes).size === entries.length && gltf.scenes[0].nodes.every((n) => Number.isInteger(n) && n >= 0 && n < gltf.nodes.length), 'invalid scene root inventory');
    insist(new Set(gltf.nodes.map((n) => n.mesh)).size === entries.length, 'each asset needs its own mesh');
    const fileSpecies = new Set(entries.map(([, a]) => a.species)); insist(fileSpecies.size === 1, 'one species per GLB');
    for (const [key, meta] of entries) {
      insist(!seen.has(key), 'duplicate manifest asset'); seen.add(key);
      insist(VEGETATION_SPECIES.includes(meta.species) && manifest.species.includes(meta.species), 'unknown or undeclared species'); species.add(meta.species);
      const tree = TREE_SPECIES.includes(meta.species); insist([0, 1, 2, ...(tree ? ['billboard'] : [])].includes(meta.lod), 'invalid species LOD');
      const expected = 'veg_' + meta.species + '_' + (meta.lod === 'billboard' ? 'billboard' : 'lod' + meta.lod);
      insist(key === expected && meta.node === key, 'asset/node naming contract mismatch');
      insist(meta.tags?.includes('vegetation') && meta.tags.includes(tree ? 'tree' : 'plant'), 'missing vegetation/species tags');
      const nodes = gltf.nodes.filter((n) => n.name === meta.node); insist(nodes.length === 1, 'manifest node missing or duplicated');
      const asset = geometry(gltf, binary, nodes[0], meta, key, manifest.atlas); report.assets.push(asset);
      let levels = families.get(meta.species); if (!levels) families.set(meta.species, levels = new Map()); insist(!levels.has(meta.lod), 'duplicate species LOD'); levels.set(meta.lod, asset.triangles);
    }
    report.files.push({ path: file.glb, bytes: bytes.length, sha256: sha(bytes), species: [...fileSpecies][0] });
  });
  await check('billboard atlas', async () => {
    const a = manifest.atlas; insist(a && !declared.has(a.path), 'missing or duplicate atlas path');
    insist(a.path === 'vegetation/billboards.png', 'atlas path must match runtime vegetation/billboards.png'); declared.add(a.path);
    const b = await checkedFile(modelsDir, a.path, a.bytes, a.sha256); report.stats.atlasBytes = b.length; const png = readPng(b);
    insist(a.width === png.width && a.height === png.height, 'atlas dimensions mismatch');
    const tiles = [];
    for (const name of TREE_SPECIES) {
      const t = a.tiles?.[name]; insist(Array.isArray(t) && t.length === 4 && t.every((v) => Number.isFinite(v) && v >= 0 && v <= 1) && t[0] < t[2] && t[1] < t[3], 'invalid or missing atlas tile ' + name);
      insist(!tiles.some((q) => t[0] < q[2] - EPS && t[2] > q[0] + EPS && t[1] < q[3] - EPS && t[3] > q[1] + EPS), 'overlapping atlas tiles'); tiles.push(t);
      let visible = 0, transparent = 0;
      for (let y = Math.ceil(t[1] * png.height); y < Math.floor(t[3] * png.height); y++) for (let x = Math.ceil(t[0] * png.width); x < Math.floor(t[2] * png.width); x++) { const v = png.pixels[(y * png.width + x) * 4 + 3]; if (v > 128) visible++; if (v === 0) transparent++; }
      insist(visible >= 16 && transparent >= 16, 'atlas tile must contain a silhouette and transparent background: ' + name);
    }
  });
  for (const name of manifest.species) await check(name, async () => {
    insist(VEGETATION_SPECIES.includes(name), 'unknown species'); const levels = families.get(name); insist(levels, 'declared species has no valid files');
    if (complete) for (const lod of [0, 1, 2, ...(TREE_SPECIES.includes(name) ? ['billboard'] : [])]) insist(levels.has(lod), 'missing required LOD ' + lod);
    for (const [a, b] of [[0, 1], [1, 2]]) if (levels.has(a) && levels.has(b)) insist(levels.get(a) > levels.get(b), 'LOD triangles must decrease strictly');
    if (TREE_SPECIES.includes(name)) for (const lod of [0, 1, 2]) if (levels.has(lod)) insist(levels.get(lod) <= [2200, 700, 160][lod] && (!complete || levels.get(lod) >= [1400, 360, 60][lod]), 'tree LOD triangle budget outside target');
  });
  if (complete) {
    for (const s of VEGETATION_SPECIES) if (!manifest.species.includes(s) || !species.has(s)) report.errors.push('complete inventory: missing species ' + s);
    await check('runtime registration', async () => { const root = JSON.parse(await readFile(resolve(modelsDir, 'manifest.json'), 'utf8')); insist(root.files?.includes('manifest.vegetation.json'), 'manifest.vegetation.json not registered'); });
  }
  await check('vegetation directory', async () => { for (const entry of await readdir(resolve(modelsDir, 'vegetation'), { withFileTypes: true })) insist(entry.isFile() && declared.has('vegetation/' + entry.name), 'unlisted or unsafe vegetation file ' + entry.name); });
  report.stats.species = species.size; report.stats.assets = report.assets.length;
  report.stats.totalBytes = report.stats.glbBytes + report.stats.atlasBytes + report.stats.manifestBytes;
  if (report.stats.totalBytes >= LIBRARY_MAX_BYTES) report.errors.push('library budget must be under 3,000,000 bytes including manifest');
  if (complete || manifest.totalBytes !== undefined) if (manifest.totalBytes !== report.stats.glbBytes + report.stats.atlasBytes) report.errors.push('manifest totalBytes mismatch (GLBs + atlas; manifest excluded from this field)');
  report.ok = report.errors.length === 0;
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let complete = false, json = false, modelsDir = DEFAULT_MODELS;
  try {
    for (let i = 2; i < process.argv.length; i++) {
      const arg = process.argv[i];
      if (arg === '--complete') complete = true;
      else if (arg === '--json') json = true;
      else if (arg === '--models' && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) modelsDir = process.argv[++i];
      else if (arg === '--help') { console.log('node veg_validate.mjs [--complete] [--models <models-directory>] [--json]'); process.exit(0); }
      else throw new Error('Unknown or incomplete option: ' + arg);
    }
    const report = await validateVegetation({ modelsDir, complete });
    if (json) console.log(JSON.stringify(report, null, 2));
    else { console.log((report.ok ? 'VEGETATION OK' : 'VEGETATION FAILED') + ': ' + report.stats.species + ' species, ' + report.stats.assets + ' meshes, ' + report.stats.totalBytes + ' / ' + LIBRARY_MAX_BYTES + ' bytes'); for (const e of report.errors) console.error(e); }
    if (!report.ok) process.exitCode = 1;
  } catch (e) { console.error(e.message); process.exitCode = 2; }
}
