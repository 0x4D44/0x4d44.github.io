// Each mutation changes a private copy of the inputs, then reruns the named
// unchanged positive test. Exit 0 means every mutant was killed for its reason.
import './nice.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { ROOT, sha256, lfBytes, decodePng, crc32 } from '../tools/blender/substation_validate.mjs';

const testFile = resolve(dirname(fileURLToPath(import.meta.url)), 'substation-assets.test.mjs');
const read = p => JSON.parse(readFileSync(p, 'utf8')), write = (p, o) => writeFileSync(p, JSON.stringify(o, null, 2) + '\n');
function fixture() {
  const p = mkdtempSync(join(tmpdir(), 'substation-mutant-'));
  for (const path of ['assets/models/substation', 'assets/models/manifest.substation.json', 'assets/models/manifest.json', 'assets/textures/substation', 'tools/blender/substation.catalog.json', 'tools/blender/substation-plan.uk.json', 'tools/blender/substation-plan.co.json', 'tools/substation_materials.mjs', 'js']) {
    mkdirSync(dirname(resolve(p, path)), { recursive: true }); cpSync(resolve(ROOT, path), resolve(p, path), { recursive: true });
  }
  return p;
}
function manifest(p, fn) { const f = resolve(p, 'assets/models/manifest.substation.json'), m = read(f); fn(m); write(f, m); }
function atlas(p, fn) { const f = resolve(p, 'assets/textures/substation/atlas.json'), a = read(f); fn(a); write(f, a); repinAtlas(p); }
function repinAtlas(p) { const b = lfBytes(readFileSync(resolve(p, 'assets/textures/substation/atlas.json'))); manifest(p, m => { m.textureMetadata.bytesLF = b.length; m.textureMetadata.sha256LF = sha256(b); }); }
function glb(p, fn) {
  const m = read(resolve(p, 'assets/models/manifest.substation.json')), f = m.files.find(f => f.variant === 'shared'), path = resolve(p, 'assets/models', f.glb), b = readFileSync(path);
  const jl = b.readUInt32LE(12), g = JSON.parse(b.toString('utf8', 20, 20 + jl));
  let bin = Buffer.from(b.subarray(28 + jl)); bin = fn(g, bin) ?? bin;
  const text = Buffer.from(JSON.stringify(g)), j = Buffer.alloc((text.length + 3) & ~3, 32); text.copy(j);
  const result = Buffer.alloc(28 + j.length + bin.length); result.writeUInt32LE(0x46546c67); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(j.length, 12); result.writeUInt32LE(0x4e4f534a, 16); j.copy(result, 20); result.writeUInt32LE(bin.length, 20 + j.length); result.writeUInt32LE(0x004e4942, 24 + j.length); bin.copy(result, 28 + j.length);
  writeFileSync(path, result); manifest(p, m => { const x = m.files.find(x => x.glb === f.glb); x.bytes = result.length; x.sha256 = sha256(result); m.modelBytes = m.files.reduce((n, f) => n + f.bytes, 0); for (const v of Object.values(m.variants)) if (v.shared.glb === f.glb) v.shared.sha256 = x.sha256; });
}
function png(image) {
  const chunk = (name, b) => { const c = Buffer.alloc(b.length + 12); c.writeUInt32BE(b.length); c.write(name, 4); b.copy(c, 8); c.writeUInt32BE(crc32(c.subarray(4, 8 + b.length)), 8 + b.length); return c; };
  const h = Buffer.alloc(13); h.writeUInt32BE(image.width); h.writeUInt32BE(image.height, 4); h[8] = 8; h[9] = image.channels === 3 ? 2 : 6;
  const stride = image.width * image.channels, pixels = Buffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y++) image.pixels.copy(pixels, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', h), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
const cases = [
  ['independent GLB decoding and complete inventory', /non-finite/, p => glb(p, (g, b) => { const a = g.accessors[g.meshes[0].primitives[0].attributes.POSITION], v = g.bufferViews[a.bufferView]; b.writeFloatLE(NaN, (v.byteOffset ?? 0) + (a.byteOffset ?? 0)); })],
  ['metre dimensions and base-centred origins', /metre dimensions/, p => { const f = resolve(p, 'tools/blender/substation.catalog.json'), c = read(f); c.assets.substation_grid_transformer.size[0] += 1; write(f, c); manifest(p, m => { m.generator.catalogSha256 = sha256(lfBytes(readFileSync(f))); for (const file of m.files) for (const [key, a] of Object.entries(file.assets)) if (/^substation_grid_transformer(?:_lod1)?$/.test(key)) a.size[0] += 1; }); }],
  ['every far LOD stays within forty percent', /exceed 40%/, p => glb(p, (g, bin) => {
    const root = g.nodes.findIndex(n => n.name === 'substation_grid_transformer_lod1'), meshes = new Set();
    function visit(i) { const n = g.nodes[i]; if (n.mesh != null) meshes.add(n.mesh); (n.children ?? []).forEach(visit); } visit(root);
    for (const i of meshes) for (const primitive of g.meshes[i].primitives) {
      const a = g.accessors[primitive.indices], view = g.bufferViews[a.bufferView], width = { 5121: 1, 5123: 2, 5125: 4 }[a.componentType];
      assert.ok(width && !view.byteStride); const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0), source = bin.subarray(start, start + a.count * width), repeated = Buffer.concat([source, source, source, source, source, source]);
      const padded = Buffer.alloc((repeated.length + 3) & ~3); repeated.copy(padded);
      const offset = bin.length; bin = Buffer.concat([bin, padded]);
      const vi = g.bufferViews.length; g.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: repeated.length, target: 34963 });
      primitive.indices = g.accessors.length; g.accessors.push({ ...a, bufferView: vi, byteOffset: 0, count: a.count * 6 });
    }
    g.buffers[0].byteLength = bin.length; return bin;
  })],
  ['every moving hinge and rotor has a stable named pivot', /missing\/empty named pivot/, p => glb(p, g => { const n = g.nodes.find(n => /substation_grid_transformer-.*(?:door|fan)/.test(n.name) && n.mesh == null); assert.ok(n); n.name = 'substation_grid_transformer-broken_hinge'; })],
  ['both variants bind one byte-identical shared core', /byte-identical/, p => manifest(p, m => { m.variants.co.shared.sha256 = '0'.repeat(64); })],
  ['repeating equipment parts use real mesh instances', /mesh instances|reusable mesh references/, p => glb(p, g => { const root = g.nodes.findIndex(n => n.name === 'substation_grid_transformer'); function visit(i) { const n = g.nodes[i]; if (n.mesh != null) { const mesh = structuredClone(g.meshes[n.mesh]); n.mesh = g.meshes.length; g.meshes.push(mesh); } (n.children ?? []).forEach(visit); } visit(root); })],
  ['texture pixels and full GPU mip chains fit the budgets', /CRC/, p => { const f = resolve(p, 'assets/textures/substation/shared-normal.png'), b = readFileSync(f); b[40] ^= 1; writeFileSync(f, b); }],
  ['UK and Colombian atlases keep their own language', /foreign-language|OCR differs|required label/, p => atlas(p, a => { const c = a.variants.co.cells[0]; c.text = c.detectedText = 'DANGER OF DEATH'; })],
  ['OCR evidence remains bound to each actual atlas cell', /OCR pixel pin/, p => {
    const a = read(resolve(p, 'assets/textures/substation/atlas.json')), uk = a.variants.uk, co = a.variants.co;
    const u = decodePng(readFileSync(resolve(p, 'assets/textures/substation', uk.atlas.path))), c = decodePng(readFileSync(resolve(p, 'assets/textures/substation', co.atlas.path)));
    const [ux, uy, w, h] = uk.cells[0].rect, [cx, cy] = co.cells[0].rect;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) c.pixels[((cy + y) * c.width + cx + x) * c.channels + k] = u.pixels[((uy + y) * u.width + ux + x) * u.channels + k];
    const b = png(c); writeFileSync(resolve(p, 'assets/textures/substation', co.atlas.path), b); atlas(p, a => { a.variants.co.atlas.bytes = b.length; a.variants.co.atlas.sha256 = sha256(b); });
  }],
  ['source pins use the same LF form in CRLF checkouts', /catalogue LF SHA-256 stale/, p => { const f = resolve(p, 'tools/blender/substation.catalog.json'); writeFileSync(f, readFileSync(f, 'utf8') + ' '); }],
  ['library does not enter the game boot graph', /accidentally registered/, p => { const f = resolve(p, 'assets/models/manifest.json'), m = read(f); m.files.push('manifest.substation.json'); write(f, m); }],
  ['yard data pins refer to actual library designs', /yard references unknown asset/, p => { const f = resolve(p, 'tools/blender/substation-plan.co.json'), plan = read(f); Object.values(plan.equipmentTypes)[0].variantBinding.asset = 'substation_missing'; write(f, plan); manifest(p, m => { const pin = m.plans.find(x => x.variant === 'co'), b = lfBytes(readFileSync(f)); pin.bytesLF = b.length; pin.sha256LF = sha256(b); }); }],
  ['all shipped library files are accounted for', /unregistered model payload/, p => writeFileSync(resolve(p, 'assets/models/substation/unregistered.bin'), 'unregistered')],
  ['independent GLB decoding and complete inventory', /UV outside/, p => glb(p, (g, b) => { const a = g.accessors[g.meshes[0].primitives[0].attributes.TEXCOORD_0], v = g.bufferViews[a.bufferView]; b.writeFloatLE(1.25, (v.byteOffset ?? 0) + (a.byteOffset ?? 0)); })],
  ['UK and Colombian atlases keep their own language', /OCR differs.*accents/, p => atlas(p, a => { const c = a.variants.co.cells.find(c => c.text.includes('Ñ')); c.detectedText = c.detectedText.replaceAll('Ñ', 'N'); })],
  ['all shipped library files are accounted for', /GLB byte\/SHA-256 pin differs/, p => manifest(p, m => { m.files[0].sha256 = '0'.repeat(64); })],
  ['UK and Colombian atlases keep their own language', /cell UV does not match/, p => atlas(p, a => { a.variants.co.cells[0].uv[0] += .01; })],
  ['independent GLB decoding and complete inventory', /UVs outside named material cell/, p => glb(p, (g, b) => {
    const a = g.accessors[g.meshes[0].primitives[0].attributes.TEXCOORD_0], v = g.bufferViews[a.bufferView], start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = v.byteStride ?? 8;
    for (let i = 0; i < a.count; i++) b.writeFloatLE((b.readFloatLE(start + i * stride) + .125) % 1, start + i * stride);
  })],
  ['both material variants share five image sources and dispose safely', /exactly five image sources/, p => { const f = resolve(p, 'tools/substation_materials.mjs'), s = readFileSync(f, 'utf8'); assert.ok(s.includes('let shared = cache.get(cacheKey)')); writeFileSync(f, s.replace('let shared = cache.get(cacheKey)', 'let shared = undefined')); }],
  ['uncoloured meshes render with atlas colour and correctly tiled UVs', /must not multiply the atlas by black/, p => { const f = resolve(p, 'tools/substation_materials.mjs'), s = readFileSync(f, 'utf8'); assert.ok(s.includes('vertexColors: false')); writeFileSync(f, s.replace('vertexColors: false', 'vertexColors: true')); }],
  ['UK and Colombian atlases keep their own language', /sign atlas binding differs/, p => manifest(p, m => { m.variants.co.signAtlas = m.variants.uk.signAtlas; })],
  ['both variants bind one byte-identical shared core', /variant file bindings differ/, p => manifest(p, m => { m.variants.uk.files = []; })],
  ['all shipped library files are accounted for', /manifest texture byte\/SHA-256 pin differs/, p => manifest(p, m => { m.textures.find(t => t.path.endsWith('.png')).sha256 = '0'.repeat(64); })],
];

const baseline = spawnSync(process.execPath, [testFile], { encoding: 'utf8', windowsHide: true, timeout: 180000 });
assert.equal(baseline.status, 0, 'Baseline asset tests must pass before mutation checking\n' + baseline.stdout + baseline.stderr);
let killed = 0;
for (const [name, why, mutate] of cases) {
  const p = fixture();
  try {
    mutate(p);
    const result = spawnSync(process.execPath, ['--test-name-pattern', '^substation: ' + name + '$', testFile], { encoding: 'utf8', windowsHide: true, timeout: 180000, env: { ...process.env, SUBSTATION_TEST_PROJECT: p } });
    const output = result.stdout + result.stderr;
    assert.ok(result.status !== 0 && result.status !== null, `SURVIVED/CRASHED ${name}\n${output}`);
    assert.match(output, why, `Mutant failed for the wrong reason: ${name}`); killed++;
    console.log(`KILLED ${name} (${why.source})`);
  } finally { rmSync(p, { recursive: true, force: true }); }
}
console.log(`ASSET MUTATIONS ${killed}/${cases.length} killed; every new asset test failed on its altered input.`);
