// Release assets are checked independently, then copied to isolated fixtures for corruption tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { validateVegetation, parseVegetationGlb, readVegetationAccessor, VEGETATION_SPECIES, LIBRARY_MAX_BYTES } from '../tools/blender/veg_validate.mjs';
const MODELS = fileURLToPath(new URL('../assets/models/', import.meta.url));
const CLI = fileURLToPath(new URL('../tools/blender/veg_validate.mjs', import.meta.url));
const hash = (b) => createHash('sha256').update(b).digest('hex');
const getManifest = async (dir) => JSON.parse(await readFile(resolve(dir, 'manifest.vegetation.json'), 'utf8'));
const putManifest = (dir, m) => writeFile(resolve(dir, 'manifest.vegetation.json'), JSON.stringify(m, null, 2) + '\n');
async function fixture(fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'ladera-veg-test-'));
  try { await cp(resolve(MODELS, 'vegetation'), resolve(dir, 'vegetation'), { recursive: true }); for (const f of ['manifest.vegetation.json', 'manifest.json']) await cp(resolve(MODELS, f), resolve(dir, f)); await fn(dir); }
  finally { await rm(dir, { recursive: true, force: true }); }
}
function encode(gltf, binary) {
  const raw = Buffer.from(JSON.stringify(gltf)), json = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 32); raw.copy(json);
  const bin = Buffer.alloc(Math.ceil(binary.length / 4) * 4); binary.copy(bin);
  const b = Buffer.alloc(28 + json.length + bin.length); b.writeUInt32LE(0x46546c67); b.writeUInt32LE(2, 4); b.writeUInt32LE(b.length, 8);
  b.writeUInt32LE(json.length, 12); b.writeUInt32LE(0x4e4f534a, 16); json.copy(b, 20); b.writeUInt32LE(bin.length, 20 + json.length); b.writeUInt32LE(0x004e4942, 24 + json.length); bin.copy(b, 28 + json.length); return b;
}
const primitive = (g, name = 'veg_eucalyptus_lod0') => g.meshes[g.nodes.find((n) => n.name === name).mesh].primitives[0];
async function mutateGlb(dir, edit, species = 'eucalyptus') {
  const m = await getManifest(dir), f = m.files.find((f) => f.glb === 'vegetation/' + species + '.glb'), path = resolve(dir, f.glb);
  const parsed = parseVegetationGlb(await readFile(path)); const replacement = await edit(parsed.gltf, parsed.binary, f);
  const bytes = encode(parsed.gltf, replacement ?? parsed.binary); await writeFile(path, bytes); f.bytes = bytes.length; f.sha256 = hash(bytes);
  m.totalBytes = m.files.reduce((n, f) => n + f.bytes, 0) + m.atlas.bytes; await putManifest(dir, m);
}
async function mutateManifest(dir, fn) { const m = await getManifest(dir); await fn(m); await putManifest(dir, m); }
async function reject(dir, pattern) { const r = await validateVegetation({ modelsDir: dir, complete: true }); assert.equal(r.ok, false, 'corrupt fixture unexpectedly passed'); assert.match(r.errors.join('\n'), pattern); }
function setValue(g, b, index, vertex, component, value) {
  const a = readVegetationAccessor(g, b, index), size = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType], method = { 5121: 'writeUInt8', 5123: 'writeUInt16LE', 5125: 'writeUInt32LE', 5126: 'writeFloatLE' }[a.componentType];
  if (a.normalized && a.componentType !== 5126) value = Math.round(value * ({ 5121: 255, 5123: 65535, 5125: 4294967295 }[a.componentType]));
  b[method](value, a.offset + vertex * a.stride + component * size);
}
function floatAttribute(g, b, semantic, values, count, itemSize = 4) {
  const start = Math.ceil(b.length / 4) * 4, next = Buffer.alloc(start + values.length * 4); b.copy(next); values.forEach((v, i) => next.writeFloatLE(v, start + i * 4));
  const view = g.bufferViews.push({ buffer: 0, byteOffset: start, byteLength: values.length * 4 }) - 1;
  const accessor = g.accessors.push({ bufferView: view, componentType: 5126, type: 'VEC' + itemSize, count }) - 1;
  primitive(g).attributes[semantic] = accessor; g.buffers[0].byteLength = next.length; return next;
}
function removeAsset(g, f, key) {
  const ni = g.nodes.findIndex((n) => n.name === key), mi = g.nodes[ni].mesh; g.nodes.splice(ni, 1); g.meshes.splice(mi, 1);
  for (const n of g.nodes) if (n.mesh > mi) n.mesh--; g.scenes[0].nodes = g.scenes[0].nodes.filter((n) => n !== ni).map((n) => n > ni ? n - 1 : n); delete f.assets[key];
}

test('complete checked-in vegetation library has every requested species within its full byte budget', async () => {
  const r = await validateVegetation({ complete: true }); assert.deepEqual(r.errors, []); assert.equal(r.ok, true); assert.equal(r.stats.species, 14); assert.equal(r.stats.assets, 47); assert.ok(r.stats.totalBytes < LIBRARY_MAX_BYTES);
  assert.deepEqual([...new Set(r.assets.map((a) => a.species))].sort(), [...VEGETATION_SPECIES].sort());
});
test('binary accessor decoding finds rigid roots and flexible tips in the actual exported mesh', async () => {
  const { gltf: g, binary: b } = parseVegetationGlb(await readFile(resolve(MODELS, 'vegetation/eucalyptus.glb'))), p = primitive(g), c = readVegetationAccessor(g, b, p.attributes.COLOR_0);
  assert.equal(c.itemSize, 4); const wind = c.values.filter((_, i) => i % 4 === 3); assert.ok(wind.includes(0)); assert.ok(wind.some((v) => v >= .25)); assert.ok(wind.every((v) => v >= 0 && v <= 1));
});
test('CLI complete mode emits a machine-readable report and exits successfully', () => {
  const p = spawnSync(process.execPath, [CLI, '--complete', '--json'], { encoding: 'utf8' }); assert.equal(p.status, 0, p.stderr); assert.equal(JSON.parse(p.stdout).stats.assets, 47);
});
test('CLI rejects unknown options with exit 2', () => { const p = spawnSync(process.execPath, [CLI, '--unknown'], { encoding: 'utf8' }); assert.equal(p.status, 2); assert.match(p.stderr, /Unknown/); });
test('missing manifest fails complete mode', () => fixture(async (d) => { await rm(resolve(d, 'manifest.vegetation.json')); await reject(d, /manifest.*missing/); }));
test('malformed manifest fails rather than silently passing', () => fixture(async (d) => { await writeFile(resolve(d, 'manifest.vegetation.json'), '{bad'); await reject(d, /manifest/); }));
test('missing generated GLB is an error', () => fixture(async (d) => { await rm(resolve(d, 'vegetation/eucalyptus.glb')); await reject(d, /eucalyptus.*missing/); }));
test('manifest file byte counts must match disk', () => fixture(async (d) => { await mutateManifest(d, (m) => m.files[0].bytes++); await reject(d, /bytes mismatch/); }));
test('GLB hashes must match actual bytes', () => fixture(async (d) => { await mutateManifest(d, (m) => m.files[0].sha256 = '0'.repeat(64)); await reject(d, /sha256 mismatch/); }));
test('invalid GLB magic is rejected independently of its valid file hash', () => fixture(async (d) => {
  const m = await getManifest(d), f = m.files[0], b = await readFile(resolve(d, f.glb)); b[0] = 0; await writeFile(resolve(d, f.glb), b); f.sha256 = hash(b); await putManifest(d, m); await reject(d, /GLB magic/);
}));
test('GLB declared length must match its binary container', () => fixture(async (d) => { const m = await getManifest(d), f = m.files[0], b = await readFile(resolve(d, f.glb)); b.writeUInt32LE(b.length - 4, 8); await writeFile(resolve(d, f.glb), b); f.sha256 = hash(b); await putManifest(d, m); await reject(d, /declared length/); }));
test('GLBs may not carry images or textures', () => fixture(async (d) => { await mutateGlb(d, (g) => { g.images = [{ uri: 'data:image/png;base64,AA==' }]; g.textures = [{ source: 0 }]; }); await reject(d, /images|textures/); }));
test('external buffers and unsafe manifest paths are rejected', async () => {
  await fixture(async (d) => { await mutateGlb(d, (g) => { g.buffers[0].uri = 'external.bin'; }); await reject(d, /external buffers/); });
  await fixture(async (d) => { await mutateManifest(d, (m) => m.files[0].glb = '../escaped.glb'); await reject(d, /unsafe asset path/); });
});
test('per-leaf child nodes are rejected', () => fixture(async (d) => { await mutateGlb(d, (g) => { g.nodes[0].children = [1]; }); await reject(d, /independent root mesh/); }));
test('multiple primitives break the one-draw asset contract', () => fixture(async (d) => { await mutateGlb(d, (g) => { const m = g.meshes[g.nodes[0].mesh]; m.primitives.push(structuredClone(m.primitives[0])); }); await reject(d, /one primitive/); }));
test('glTF materials must name the correct registered library material', () => fixture(async (d) => { await mutateGlb(d, (g) => { g.materials[primitive(g).material].name = 'unregistered_leaf'; }); await reject(d, /material name/); }));
test('mesh node transforms must already be baked', () => fixture(async (d) => { await mutateGlb(d, (g) => { g.nodes[0].translation = [1, 0, 0]; }); await reject(d, /identity/); }));
test('wind colour attributes are required', () => fixture(async (d) => { await mutateGlb(d, (g) => { delete primitive(g).attributes.COLOR_0; }); await reject(d, /accessor/); }));
test('RGB without wind alpha is rejected', () => fixture(async (d) => { await mutateGlb(d, (g) => { g.accessors[primitive(g).attributes.COLOR_0].type = 'VEC3'; }); await reject(d, /COLOR_0.*RGBA/); }));
test('non-finite positions are rejected', () => fixture(async (d) => { await mutateGlb(d, (g, b) => { setValue(g, b, primitive(g).attributes.POSITION, 0, 0, NaN); }); await reject(d, /non-finite/); }));
test('vertex albedo and wind must stay in normalized range', () => fixture(async (d) => { await mutateGlb(d, (g, b) => { const c = readVegetationAccessor(g, b, primitive(g).attributes.COLOR_0); c.values[0] = 2; return floatAttribute(g, b, 'COLOR_0', c.values, c.count); }); await reject(d, /normalized.*range/); }));
test('root vertices cannot sway', () => fixture(async (d) => { await mutateGlb(d, (g, b) => { const p = primitive(g), a = readVegetationAccessor(g, b, p.attributes.POSITION); let root = 0; for (let i = 1; i < a.count; i++) if (a.values[i * 3 + 1] < a.values[root * 3 + 1]) root = i; setValue(g, b, p.attributes.COLOR_0, root, 3, 1); }); await reject(d, /rigid root\/pot/); }));
test('a mesh with no flexible tips is invalid wind data', () => fixture(async (d) => { await mutateGlb(d, (g, b) => { const p = primitive(g), c = readVegetationAccessor(g, b, p.attributes.COLOR_0); for (let i = 0; i < c.count; i++) setValue(g, b, p.attributes.COLOR_0, i, 3, 0); }); await reject(d, /flexible tips/); }));
test('indices may not reference absent vertices', () => fixture(async (d) => { await mutateGlb(d, (g, b) => { const p = primitive(g); setValue(g, b, p.indices, 0, 0, g.accessors[p.attributes.POSITION].count + 1); }); await reject(d, /index outside/); }));
test('degenerate indexed triangles are rejected', () => fixture(async (d) => { await mutateGlb(d, (g, b) => { const p = primitive(g), a = readVegetationAccessor(g, b, p.indices); setValue(g, b, p.indices, 1, 0, a.values[0]); }); await reject(d, /degenerate triangle/); }));
test('manifest triangle counts are checked against actual indices', () => fixture(async (d) => { await mutateManifest(d, (m) => Object.values(m.files[0].assets)[0].triangles++); await reject(d, /triangle count mismatch/); }));
test('manifest bounds must describe the actual positions', () => fixture(async (d) => { await mutateManifest(d, (m) => Object.values(m.files[0].assets)[0].bounds.max[0] += 1); await reject(d, /manifest bounds/); }));
test('manifest size must equal measured extent', () => fixture(async (d) => { await mutateManifest(d, (m) => Object.values(m.files[0].assets)[0].size[1] += 1); await reject(d, /bounds\/size/); }));
test('accessor min/max cannot conceal different geometry bounds', () => fixture(async (d) => { await mutateGlb(d, (g) => { g.accessors[primitive(g).attributes.POSITION].min[0] -= 1; }); await reject(d, /accessor bounds/); }));
test('malformed strides and sparse accessors cannot bypass buffer bounds', async () => {
  await fixture(async (d) => { await mutateGlb(d, (g) => { g.bufferViews[g.accessors[primitive(g).attributes.POSITION].bufferView].byteStride = 1; }); await reject(d, /stride/); });
  await fixture(async (d) => { await mutateGlb(d, (g) => { g.accessors[primitive(g).attributes.POSITION].sparse = { count: 1 }; }); await reject(d, /sparse accessor/); });
});
test('normals must be finite unit vectors', () => fixture(async (d) => { await mutateGlb(d, (g, b) => { const a = primitive(g).attributes.NORMAL; for (let i = 0; i < 3; i++) setValue(g, b, a, 0, i, 0); }); await reject(d, /unit length/); }));
test('complete mode detects a species removed from both files and manifest', () => fixture(async (d) => { const m = await getManifest(d), f = m.files.find((f) => f.glb.includes('potted_fern')); m.files = m.files.filter((q) => q !== f); m.species = m.species.filter((s) => s !== 'potted_fern'); await rm(resolve(d, f.glb)); await putManifest(d, m); await reject(d, /missing species potted_fern/); }));
test('complete mode requires each tree billboard', () => fixture(async (d) => { await mutateGlb(d, (g, b, f) => removeAsset(g, f, 'veg_eucalyptus_billboard')); await reject(d, /missing required LOD billboard/); }));
test('LOD geometry counts must strictly decrease', () => fixture(async (d) => { await mutateGlb(d, (g, b, f) => { const a = g.nodes.find((n) => n.name === 'veg_eucalyptus_lod0'), c = g.nodes.find((n) => n.name === 'veg_eucalyptus_lod1'); [a.mesh, c.mesh] = [c.mesh, a.mesh]; const am = f.assets[a.name], cm = f.assets[c.name]; for (const k of ['triangles', 'bounds', 'size', 'rigidHeight']) [am[k], cm[k]] = [cm[k], am[k]]; }); await reject(d, /decrease strictly/); }));
test('the shared billboard atlas must exist at the runtime texture path', async () => {
  await fixture(async (d) => { await rm(resolve(d, 'vegetation/billboards.png')); await reject(d, /atlas.*missing/); });
  await fixture(async (d) => { const m = await getManifest(d); await cp(resolve(d, m.atlas.path), resolve(d, 'vegetation/renamed.png')); await rm(resolve(d, m.atlas.path)); m.atlas.path = 'vegetation/renamed.png'; await putManifest(d, m); await reject(d, /atlas path must match runtime/); });
});
test('atlas hash verifies the external texture bytes', () => fixture(async (d) => { await mutateManifest(d, (m) => m.atlas.sha256 = '0'.repeat(64)); await reject(d, /sha256 mismatch/); }));
test('PNG dimensions must match atlas metadata', () => fixture(async (d) => { await mutateManifest(d, (m) => m.atlas.width++); await reject(d, /dimensions mismatch/); }));
test('PNG CRC remains independently checked after its file hash is updated', () => fixture(async (d) => { const m = await getManifest(d), b = await readFile(resolve(d, m.atlas.path)); b[29] ^= 1; await writeFile(resolve(d, m.atlas.path), b); m.atlas.sha256 = hash(b); await putManifest(d, m); await reject(d, /PNG CRC/); }));
test('billboard UVs must stay within their species tile and face the PNG correctly', async () => {
  await fixture(async (d) => { await mutateGlb(d, (g, b) => { const p = primitive(g, 'veg_eucalyptus_billboard'); setValue(g, b, p.attributes.TEXCOORD_0, 0, 0, .9); }); await reject(d, /UV outside/); });
  await fixture(async (d) => { await mutateGlb(d, (g, b) => { const p = primitive(g, 'veg_eucalyptus_billboard'), a = readVegetationAccessor(g, b, p.attributes.TEXCOORD_0); for (let i = 0; i < a.count; i++) setValue(g, b, p.attributes.TEXCOORD_0, i, 1, 1 - a.values[i * 2 + 1]); }); await reject(d, /V must decrease/); });
});
test('complete mode requires runtime manifest registration', () => fixture(async (d) => { await writeFile(resolve(d, 'manifest.json'), '{"files":[]}'); await reject(d, /not registered/); }));
test('the byte ceiling includes the manifest and unlisted files cannot hide in the library', async () => {
  await fixture(async (d) => { await mutateManifest(d, (m) => m.padding = 'x'.repeat(LIBRARY_MAX_BYTES)); await reject(d, /library budget/); });
  await fixture(async (d) => { await writeFile(resolve(d, 'vegetation/unlisted.glb'), 'extra'); await reject(d, /unlisted/); });
});
