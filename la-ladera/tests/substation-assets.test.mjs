import './nice.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from '../vendor/three/build/three.core.min.js';
import { ROOT, LIMITS, validateSubstation, inspectSubstationGlb, decodePng, gpuBytes, cellPixelHash, normalizeText, lfBytes, sha256 } from '../tools/blender/substation_validate.mjs';

export const PROJECT = resolve(process.env.SUBSTATION_TEST_PROJECT ?? ROOT);
const MODELS = resolve(PROJECT, 'assets/models'), TEXTURES = resolve(PROJECT, 'assets/textures/substation');
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const manifest = () => read(resolve(MODELS, 'manifest.substation.json'));
let cached;
function valid() {
  cached ??= validateSubstation({ models: MODELS, project: PROJECT, complete: true });
  assert.equal(cached.ok, true, cached.failures.join('\n'));
  return cached;
}
function decoded() { return manifest().files.map(f => ({ ...f, decoded: inspectSubstationGlb(resolve(MODELS, f.glb)) })); }

test('substation: independent GLB decoding and complete inventory', () => {
  const r = valid(); assert.ok(r.assetCount >= 66); assert.equal(r.assetCount, r.lodCount);
  for (const f of decoded()) assert.equal(f.decoded.assets.size, Object.keys(f.assets).length);
});
test('substation: metre dimensions and base-centred origins', () => {
  valid(); const cat = read(resolve(PROJECT, 'tools/blender/substation.catalog.json')).assets;
  for (const f of decoded()) for (const [key, a] of f.decoded.assets) {
    const c = cat[key.replace(/_lod1$/, '')];
    a.size.forEach((v, i) => assert.ok(Math.abs(v - c.size[i]) <= 0.03, `${key} axis ${i}`));
    assert.ok(Math.abs(a.min[1]) <= 1e-4, key + ' ground origin');
  }
});
test('substation: every far LOD stays within forty percent', () => {
  valid();
  for (const f of decoded()) for (const [key, a] of f.decoded.assets) if (!key.endsWith('_lod1')) {
    const far = f.decoded.assets.get(key + '_lod1'); assert.ok(far, key + ' far root');
    assert.ok(far.triangles <= a.triangles * 0.4, key + ' drawn triangle ratio');
    assert.ok(a.triangles <= (/^substation_(grid|distribution)_transformer$/.test(key) ? 6000 : 3000), key + ' cap');
  }
});
test('substation: every moving hinge and rotor has a stable named pivot', () => {
  valid(); const cat = read(resolve(PROJECT, 'tools/blender/substation.catalog.json')).assets;
  let count = 0;
  for (const f of decoded()) for (const [key, a] of f.decoded.assets) if (!key.endsWith('_lod1')) {
    const far = f.decoded.assets.get(key + '_lod1');
    for (const p of cat[key].pivots ?? []) {
      const suffix = typeof p === 'string' ? p : p.name;
      const nearPivot = a.pivots.find(v => v.name === key + '-' + suffix), farPivot = far.pivots.find(v => v.name === key + '_lod1-' + suffix);
      assert.ok(nearPivot?.triangles > 0 && farPivot?.triangles > 0, key + '/' + suffix);
      nearPivot.matrix.forEach((v, i) => assert.ok(Math.abs(v - farPivot.matrix[i]) < 1e-4)); count++;
    }
  }
  assert.ok(count >= 15, 'doors, blades, fans and gate leaves all have pivots');
});
test('substation: both variants bind one byte-identical shared core', () => {
  const r = valid(), m = manifest(); assert.equal(r.sharedIdentity, true);
  assert.deepEqual(m.variants.uk.shared, m.variants.co.shared);
  assert.equal(m.files.filter(f => f.variant === 'shared').length, 1);
  const f = m.files.find(f => f.variant === 'shared');
  assert.equal(sha256(readFileSync(resolve(MODELS, f.glb))), m.variants.co.shared.sha256);
});
test('substation: repeating equipment parts use real mesh instances', () => {
  valid(); const all = new Map(decoded().flatMap(f => [...f.decoded.assets]));
  for (const key of ['substation_grid_transformer', 'substation_distribution_transformer', 'substation_insulator_string']) {
    assert.ok(all.get(key).repeatedMeshInstances > 0, key + ' has reusable mesh references');
  }
});
test('substation: texture pixels and full GPU mip chains fit the budgets', () => {
  const r = valid(); assert.ok(r.modelBytes <= LIMITS.glb && r.textureBytes <= LIMITS.textures && r.gpuBytes <= LIMITS.gpu);
  const a = read(resolve(TEXTURES, 'atlas.json'));
  const textures = ['baseColor', 'normal', 'orm'].map(k => a.shared[k]).concat(['uk', 'co'].map(v => a.variants[v].atlas));
  let total = 0;
  for (const t of textures) { const p = decodePng(readFileSync(resolve(TEXTURES, t.path))); total += gpuBytes(p.width, p.height); assert.ok(p.width <= 2048 && p.height <= 2048); }
  assert.equal(total, r.gpuBytes); assert.ok(total <= 40_000_000);
});
test('substation: UK and Colombian atlases keep their own language', () => {
  valid(); const a = read(resolve(TEXTURES, 'atlas.json'));
  for (const [v, data] of Object.entries(a.variants)) {
    assert.ok(data.cells.length >= 20); assert.ok(data.ocr.engine.toLowerCase().includes('tesseract'));
    for (const c of data.cells) { assert.equal(c.language, v === 'uk' ? 'en' : 'es'); assert.equal(normalizeText(c.detectedText), normalizeText(c.text)); }
  }
  assert.ok(a.variants.co.cells.some(c => c.detectedText.includes('Ñ')));
  assert.ok(a.variants.co.cells.some(c => c.detectedText.includes('TENSIÓN')));
  assert.ok(a.variants.co.cells.some(c => c.detectedText.includes('SUBESTACIÓN')));
});
test('substation: OCR evidence remains bound to each actual atlas cell', () => {
  valid(); const a = read(resolve(TEXTURES, 'atlas.json'));
  for (const data of Object.values(a.variants)) {
    const image = decodePng(readFileSync(resolve(TEXTURES, data.atlas.path)));
    for (const cell of data.cells) assert.equal(cellPixelHash(image, cell.rect), cell.pixelSha256, cell.id);
  }
});
test('substation: source pins use the same LF form in CRLF checkouts', () => {
  valid();
  const b = readFileSync(resolve(PROJECT, 'tools/blender/substation.catalog.json'));
  const lf = lfBytes(b), crlf = Buffer.from(lf.toString('utf8').replace(/\n/g, '\r\n'));
  assert.equal(sha256(lfBytes(crlf)), manifest().generator.catalogSha256);
  assert.equal(sha256(lf), manifest().generator.catalogSha256);
});
test('substation: library does not enter the game boot graph', () => {
  valid(); const boot = read(resolve(PROJECT, 'assets/models/manifest.json'));
  assert.doesNotMatch(JSON.stringify(boot), /substation/i); assert.equal(manifest().libraryOnly, true);
});
test('substation: yard data pins refer to actual library designs', () => {
  valid(); const cat = read(resolve(PROJECT, 'tools/blender/substation.catalog.json')).assets, pins = manifest().plans;
  assert.equal(pins.length, 2);
  for (const pin of pins) {
    const bytes = lfBytes(readFileSync(resolve(PROJECT, pin.path))); assert.equal(sha256(bytes), pin.sha256LF);
    const p = JSON.parse(bytes);
    for (const type of Object.values(p.equipmentTypes)) assert.ok(cat[type.variantBinding.asset], type.variantBinding.asset);
  }
});
test('substation: all shipped library files are accounted for', () => {
  const r = valid(), m = manifest(); assert.equal(m.modelBytes, r.modelBytes);
  assert.ok(m.files.every(f => f.bytes > 0 && /^[a-f0-9]{64}$/.test(f.sha256)));
});
test('substation: both material variants share five image sources and dispose safely', async () => {
  valid(); const { loadSubstationMaterials } = await import(pathToFileURL(resolve(PROJECT, 'tools/substation_materials.mjs')));
  const a = read(resolve(TEXTURES, 'atlas.json')); let loads = 0;
  class TextureLoader { async loadAsync(path) { loads++; return new THREE.Texture({ src: path }); } }
  const T = { ...THREE, TextureLoader };
  const [uk, co] = await Promise.all(['uk', 'co'].map(v => loadSubstationMaterials(T, a, v, 'https://example.invalid/substation/')));
  assert.equal(loads, 5, 'Both variants must load exactly five image sources, including shared PBR maps');
  assert.equal(uk.get('substation_paint').map.source, co.get('substation_paint').map.source, 'Variant cell shifts must retain one shared Source');
  let disposed = 0; uk.get('substation_galvanised').map.addEventListener('dispose', () => disposed++);
  uk.dispose(); assert.equal(disposed, 0, 'CO still owns the shared PBR maps');
  co.dispose(); assert.equal(disposed, 1, 'Last consumer releases the shared map exactly once');
});
test('substation: uncoloured meshes render with atlas colour and correctly tiled UVs', async () => {
  valid(); const { loadSubstationMaterials, mapSubstationUvs } = await import(pathToFileURL(resolve(PROJECT, 'tools/substation_materials.mjs')));
  const a = read(resolve(TEXTURES, 'atlas.json'));
  class TextureLoader { async loadAsync(path) { return new THREE.Texture({ src: path }); } }
  const materials = await loadSubstationMaterials({ ...THREE, TextureLoader }, a, 'co', 'https://example.invalid/substation/');
  const geometry = new THREE.BoxGeometry(1, 1, 1), mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ name: 'substation_gravel' }));
  materials.apply(mesh);
  assert.equal(mesh.material.vertexColors, false, 'Missing vertex colours must not multiply the atlas by black');
  mapSubstationUvs(geometry, a, 'substation_gravel');
  const uv = geometry.attributes.uv, [u0, v0, u1, v1] = a.shared.cells.gravel.uv;
  for (let i = 0; i < uv.count; i++) { assert.ok(uv.getX(i) >= u0 && uv.getX(i) <= u1); assert.ok(uv.getY(i) >= v0 && uv.getY(i) <= v1); }
  materials.dispose(); geometry.dispose();
});
