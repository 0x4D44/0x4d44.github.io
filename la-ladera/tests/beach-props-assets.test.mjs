// Every acceptance test has a real broken-input mutation. Run the companion
// beach-props-mutations.mjs harness to prove each selected test turns red.
import './nice.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { parseGlb } from '../tools/blender/furn_validate.mjs';
import { validateBeachProps, inspectBeachPng, ROOT, CATALOGUE, MANIFEST, MAX_GLB_BYTES, MAX_TEXTURE_BYTES } from '../tools/blender/beach_props_validate.mjs';

const digest = (b) => createHash('sha256').update(b).digest('hex');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ladera-beach-props-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of ['assets/models/' + MANIFEST, 'assets/models/manifest.json', 'assets/models/beach_props', 'assets/textures/beach_props']) {
    cpSync(resolve(ROOT, path), resolve(root, path), { recursive: true });
  }
  const catalogue = resolve(root, 'beach_props.catalog.json'); cpSync(CATALOGUE, catalogue);
  return { root, models: resolve(root, 'assets/models'), textures: resolve(root, 'assets/textures/beach_props'),
    catalogue, rootManifest: resolve(root, 'assets/models/manifest.json'), complete: true };
}
const manifestOf = (f) => readJson(resolve(f.models, MANIFEST));
function editManifest(f, fn) {
  const m = manifestOf(f); fn(m); writeFileSync(resolve(f.models, MANIFEST), JSON.stringify(m)); return m;
}
function encode(json, bin) {
  const data = Buffer.from(JSON.stringify(json)), jl = Math.ceil(data.length / 4) * 4, bl = Math.ceil(bin.length / 4) * 4;
  const result = Buffer.alloc(28 + jl + bl);
  result.writeUInt32LE(0x46546c67, 0); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(jl, 12); result.writeUInt32LE(0x4e4f534a, 16); result.fill(32, 20, 20 + jl); data.copy(result, 20);
  result.writeUInt32LE(bl, 20 + jl); result.writeUInt32LE(0x004e4942, 24 + jl); bin.copy(result, 28 + jl);
  return result;
}
function editGlb(f, fn, choose = () => true) {
  const m = manifestOf(f), file = m.files.find((entry) => Object.keys(entry.assets).some(choose));
  assert.ok(file, 'mutation requires a matching generated GLB');
  const path = resolve(f.models, file.glb), parsed = parseGlb(readFileSync(path));
  fn(parsed.json, parsed.bin, file.assets);
  const data = encode(parsed.json, parsed.bin); writeFileSync(path, data);
  editManifest(f, (updated) => {
    const entry = updated.files.find((candidate) => candidate.glb === file.glb);
    entry.bytes = data.length; entry.sha256 = digest(data); entry.assets = file.assets;
    updated.totalGlbBytes = updated.files.reduce((total, entry) => total + entry.bytes, 0);
  });
}
const firstPrimitive = (g) => g.meshes.find((mesh) => mesh.primitives?.length).primitives[0];
function offsetOf(g, accessor, i = 0) {
  const a = g.accessors[accessor], view = g.bufferViews[a.bufferView], width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const bytes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
  return (view.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (view.byteStride ?? width * bytes);
}
function editCatalogue(f, select, mutate) {
  const catalog = readJson(f.catalogue), entry = Object.entries(catalog.assets).find(([key, cat]) => select(cat, key));
  assert.ok(entry, 'mutation requires a matching catalogue design');
  const [key, cat] = entry; mutate(cat);
  const bytes = Buffer.from(JSON.stringify(catalog)); writeFileSync(f.catalogue, bytes);
  editManifest(f, (manifest) => {
    manifest.generator.catalogSha256 = digest(bytes);
    for (const file of manifest.files) for (const k of [key, key + '_lod1']) if (file.assets[k]) file.assets[k].anchors = cat.anchors;
  });
}
function duplicateDraws(g, rootName, factor) {
  const root = g.nodes.find((node) => node.name === rootName), visited = new Set();
  assert.ok(root);
  function visit(node) {
    if (node.mesh != null && !visited.has(node.mesh)) {
      visited.add(node.mesh);
      const mesh = g.meshes[node.mesh], original = mesh.primitives;
      mesh.primitives = Array.from({ length: factor }, () => original.map((primitive) => structuredClone(primitive))).flat();
    }
    for (const child of node.children ?? []) visit(g.nodes[child]);
  }
  visit(root);
}

function encodePng(png) {
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (data) => { let c = 0xffffffff; for (const v of data) c = table[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length); out.write(type, 4, 4, 'ascii'); data.copy(out, 8);
    out.writeUInt32BE(crc(out.subarray(4, data.length + 8)), data.length + 8); return out;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(png.width, 0); header.writeUInt32BE(png.height, 4); header[8] = 8; header[9] = png.channels === 4 ? 6 : 2;
  const stride = png.width * png.channels, raw = Buffer.alloc((stride + 1) * png.height);
  for (let y = 0; y < png.height; y++) png.pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const CASES = [
  { id: 'complete', name: 'all requested near and far assets exist as actual GLB roots',
    broken: 'remove a generated GLB',
    mutate: (f) => rmSync(resolve(f.models, manifestOf(f).files[0].glb)),
    check: (r, f) => { const n = Object.keys(readJson(f.catalogue).assets).length; assert.equal(r.assetCount, n); assert.equal(r.lodCount, n); assert.equal(r.assets.length, n * 2); } },
  { id: 'partial', name: 'complete mode requires a complete build', broken: 'mark manifest as a partial preview',
    mutate: (f) => editManifest(f, (m) => { m.complete = false; }) },
  { id: 'lod-root', name: 'every near asset has its named independent far root', broken: 'rename one actual far root',
    mutate: (f) => editGlb(f, (g) => { g.nodes.find((n) => n.name.endsWith('_lod1')).name = 'beach_missing_lod1'; }) },
  { id: 'lf-text', name: 'catalogue pins accept CRLF checkout text and reject changed text', broken: 'change a description without repinning after CRLF conversion',
    prepare: (f) => writeFileSync(f.catalogue, readFileSync(f.catalogue, 'utf8').replace(/\r?\n/g, '\r\n')),
    mutate: (f) => { const c = readJson(f.catalogue); Object.values(c.assets)[0].description += ' altered'; writeFileSync(f.catalogue, JSON.stringify(c)); } },
  { id: 'glb-pin', name: 'SHA-256 pins match the exported bytes', broken: 'replace a GLB hash with zeros',
    mutate: (f) => editManifest(f, (m) => { m.files[0].sha256 = '0'.repeat(64); }) },
  { id: 'nan', name: 'actual decoded positions contain finite values', broken: 'write a binary NaN position and repin the GLB',
    mutate: (f) => editGlb(f, (g, b) => b.writeFloatLE(NaN, offsetOf(g, firstPrimitive(g).attributes.POSITION))) },
  { id: 'accessor', name: 'accessors stay inside their buffer views', broken: 'expand a POSITION accessor count beyond its bytes',
    mutate: (f) => editGlb(f, (g) => { g.accessors[firstPrimitive(g).attributes.POSITION].count += 1_000_000; }) },
  { id: 'index', name: 'triangle indices reference real vertices', broken: 'write a triangle index equal to vertex count',
    mutate: (f) => editGlb(f, (g, b) => {
      const p = firstPrimitive(g), a = g.accessors[p.indices], count = g.accessors[p.attributes.POSITION].count;
      const method = { 5121: 'writeUInt8', 5123: 'writeUInt16LE', 5125: 'writeUInt32LE' }[a.componentType];
      assert.ok(method); b[method](count, offsetOf(g, p.indices)); delete a.min; delete a.max;
    }) },
  { id: 'bounds', name: 'binary position bounds match the advertised metre envelopes', broken: 'move a real vertex 100 metres while leaving plausible metadata',
    mutate: (f) => editGlb(f, (g, b) => b.writeFloatLE(100, offsetOf(g, firstPrimitive(g).attributes.POSITION))) },
  { id: 'root-origin', name: 'scene roots have an identity base-centre transform', broken: 'translate a scene root above the floor',
    mutate: (f) => editGlb(f, (g) => { const n = g.nodes[g.scenes[0].nodes[0]]; delete n.matrix; n.translation = [0, 1, 0]; }) },
  { id: 'normal', name: 'exported normals remain unit length', broken: 'zero one vertex normal',
    mutate: (f) => editGlb(f, (g, b) => { const offset = offsetOf(g, firstPrimitive(g).attributes.NORMAL); for (let i = 0; i < 3; i++) b.writeFloatLE(0, offset + i * 4); }) },
  { id: 'uv-range', name: 'all UV coordinates stay inside the unit atlas', broken: 'write a UV coordinate of 1.25',
    mutate: (f) => editGlb(f, (g, b) => b.writeFloatLE(1.25, offsetOf(g, firstPrimitive(g).attributes.TEXCOORD_0))) },
  { id: 'uv-gutter', name: 'triangle UVs stay inside padded cells', broken: 'move a UV into a cell boundary gutter',
    mutate: (f) => editGlb(f, (g, b) => b.writeFloatLE(0.125, offsetOf(g, firstPrimitive(g).attributes.TEXCOORD_0))) },
  { id: 'uv-design', name: 'atlas cells select each catalogue design with the correct V orientation', broken: 'vertically reverse every UV in one GLB',
    mutate: (f) => editGlb(f, (g, b) => {
      const visited = new Set();
      for (const p of g.meshes.flatMap((m) => m.primitives)) {
        const id = p.attributes.TEXCOORD_0; if (visited.has(id)) continue; visited.add(id);
        for (let i = 0; i < g.accessors[id].count; i++) { const offset = offsetOf(g, id, i) + 4; b.writeFloatLE(1 - b.readFloatLE(offset), offset); }
      }
    }) },
  { id: 'near-cap', name: 'near meshes obey actual per-type triangle caps', broken: 'repeat near draw primitives 100 times and update declared counts',
    mutate: (f) => editGlb(f, (g, _b, assets) => {
      const key = Object.keys(assets).find((k) => !k.endsWith('_lod1'));
      duplicateDraws(g, key, 100); assets[key].triangles *= 100; assets[key].parts *= 100;
    }) },
  { id: 'lod-ratio', name: 'every far LOD draws no more than forty percent of near triangles', broken: 'increase one far mesh beyond forty percent with truthful metadata',
    mutate: (f) => editGlb(f, (g, _b, assets) => {
      const key = Object.keys(assets).find((k) => k.endsWith('_lod1')), near = assets[key.slice(0, -5)];
      const factor = Math.floor(near.triangles * 0.4 / assets[key].triangles) + 1;
      duplicateDraws(g, key, factor); assets[key].triangles *= factor; assets[key].parts *= factor;
    }) },
  { id: 'materials', name: 'only the shared dormant PBR materials occur in texture-free GLBs', broken: 'insert an embedded or external texture',
    mutate: (f) => editGlb(f, (g) => { g.images = [{ uri: 'rogue.png' }]; g.textures = [{ source: 0 }]; }) },
  { id: 'alpha', name: 'cutout nets and palm cards use double-sided alpha masking', broken: 'switch cutout material from MASK to BLEND',
    mutate: (f) => editGlb(f, (g) => {
      const m = g.materials.find((m) => m.name === 'beach_props_alpha'); assert.ok(m); m.alphaMode = 'BLEND';
    }, (key) => /volleyball|palm/.test(key)) },
  { id: 'net-twelve', name: 'the near volleyball alpha net is exactly twelve triangles', broken: 'remove one indexed net triangle and truthfully update its total',
    mutate: (f) => editGlb(f, (g, _b, assets) => {
      const key = 'beach_volleyball_court', node = g.nodes.find((n) => n.mesh != null && n.name.startsWith(key + '-') && n.name.includes('volleyball_net'));
      assert.ok(node, 'separate alpha net mesh is required');
      const p = g.meshes[node.mesh].primitives.find((p) => g.materials[p.material].name === 'beach_props_alpha');
      assert.ok(p); g.accessors[p.indices].count -= 3; assets[key].triangles -= 1;
    }, (key) => key === 'beach_volleyball_court') },
  { id: 'pivots', name: 'spinning and flapping parts retain independent drawable pivots', broken: 'rename a required physical pivot',
    mutate: (f) => {
      const cats = readJson(f.catalogue).assets, key = Object.keys(cats).find((key) => cats[key].pivots?.length);
      editGlb(f, (g) => {
        const pivot = g.nodes.find((n) => n.name === `${key}-pivot_${cats[key].pivots[0].name}`);
        assert.ok(pivot); pivot.name = key + '-merged_part';
      }, (k) => k === key);
    } },
  { id: 'anchors', name: 'seat anchors contain a usable position, yaw and positive seat height', broken: 'set a seat height to minus one in both catalogue and manifest',
    mutate: (f) => editCatalogue(f, (cat) => cat.anchors.seats?.length, (cat) => { cat.anchors.seats[0].seatHeight = -1; }) },
  { id: 'light-anchor', name: 'the bollard lamp provides its light position and colour', broken: 'remove the lamp light anchor from catalogue and manifest',
    mutate: (f) => editCatalogue(f, (_cat, key) => key === 'beach_lamp', (cat) => { delete cat.anchors.light; }) },
  { id: 'keep-out', name: 'court, kiosk and tower navigation polygons are nondegenerate', broken: 'collapse a keep-out polygon to one line in catalogue and manifest',
    mutate: (f) => editCatalogue(f, (cat) => cat.anchors.keepOut, (cat) => { cat.anchors.keepOut = [[0, 0], [1, 0], [2, 0]]; }) },
  { id: 'png', name: 'all PBR maps decode as CRC-checked PNG rasters', broken: 'corrupt an albedo PNG chunk byte',
    mutate: (f) => { const path = resolve(f.textures, 'albedo.png'), b = readFileSync(path); b[b.length - 16] ^= 1; writeFileSync(path, b); },
    check: (_r, f) => { for (const name of ['albedo', 'normal', 'orm']) assert.equal(inspectBeachPng(readFileSync(resolve(f.textures, name + '.png'))).width, 2048); } },
  { id: 'texture-pin', name: 'PBR maps are individually SHA-256 pinned', broken: 'replace the normal-map hash with zeros',
    mutate: (f) => editManifest(f, (m) => { m.textures.maps.normal.sha256 = '0'.repeat(64); }) },
  { id: 'prints', name: 'the twelve towels use twelve distinct decoded print cells', broken: 'copy one towel print over another and repin the PNG',
    mutate: (f) => {
      const manifest = manifestOf(f), path = resolve(f.textures, 'albedo.png'), png = inspectBeachPng(readFileSync(path));
      const first = manifest.textures.cells.towel_01, second = manifest.textures.cells.towel_02;
      const sx = (first % 8) * 256, sy = (7 - Math.floor(first / 8)) * 256;
      const dx = (second % 8) * 256, dy = (7 - Math.floor(second / 8)) * 256;
      for (let y = 0; y < 256; y++) {
        const source = ((sy + y) * png.width + sx) * 4, target = ((dy + y) * png.width + dx) * 4;
        png.pixels.copy(png.pixels, target, source, source + 256 * 4);
      }
      const bytes = encodePng(png); writeFileSync(path, bytes);
      editManifest(f, (m) => {
        m.textures.maps.albedo.bytes = bytes.length; m.textures.maps.albedo.sha256 = digest(bytes);
        m.totalTextureBytes = Object.values(m.textures.maps).reduce((sum, map) => sum + map.bytes, 0);
      });
    } },
  { id: 'signs', name: 'all ten Spanish signs retain their exact requested wording', broken: 'remove the ñ from Zona de baño metadata',
    mutate: (f) => editManifest(f, (m) => { m.textures.signTexts.sign_zona_bano = 'Zona de bano'; }) },
  { id: 'instances', name: 'repeated parts share actual glTF mesh resources', broken: 'clone every multiply referenced mesh into per-node copies',
    mutate: (f) => {
      for (const file of manifestOf(f).files) {
        const key = Object.keys(file.assets)[0];
        editGlb(f, (g) => {
          const seen = new Set();
          for (const node of g.nodes) if (node.mesh != null) {
            if (seen.has(node.mesh)) { g.meshes.push(structuredClone(g.meshes[node.mesh])); node.mesh = g.meshes.length - 1; }
            else seen.add(node.mesh);
          }
        }, (candidate) => candidate === key);
      }
      editManifest(f, (m) => { for (const file of m.files) file.sharedMeshes = []; });
    }, check: (r) => assert.ok(r.sharedMeshes > 0) },
  { id: 'roster', name: 'the independent required roster cannot shrink with the catalogue', broken: 'remove the conch design from the catalogue and repin its text',
    mutate: (f) => {
      const c = readJson(f.catalogue); delete c.assets.beach_shell_conch;
      const bytes = Buffer.from(JSON.stringify(c)); writeFileSync(f.catalogue, bytes);
      editManifest(f, (m) => { m.generator.catalogSha256 = digest(bytes); });
    } },
  { id: 'glb-budget', name: 'all generated model bytes count toward the three-megabyte limit', broken: 'add an unregistered three-megabyte GLB payload',
    mutate: (f) => writeFileSync(resolve(f.models, 'beach_props/stale.glb'), Buffer.alloc(MAX_GLB_BYTES)),
    check: (r) => { assert.equal(MAX_GLB_BYTES, 3_000_000); assert.ok(r.totalGlbBytes <= 3_000_000); } },
  { id: 'texture-budget', name: 'all generated texture bytes count toward the six-megabyte limit', broken: 'add an unregistered six-megabyte texture payload',
    mutate: (f) => writeFileSync(resolve(f.textures, 'stale.bin'), Buffer.alloc(MAX_TEXTURE_BYTES)),
    check: (r) => { assert.equal(MAX_TEXTURE_BYTES, 6_000_000); assert.ok(r.totalTextureBytes <= 6_000_000); } },
  { id: 'dormant', name: 'the runtime root manifest does not load this library', broken: 'register the offline manifest in the game root manifest',
    mutate: (f) => { const m = readJson(f.rootManifest); m.files.push(MANIFEST); writeFileSync(f.rootManifest, JSON.stringify(m)); } },
  { id: 'hierarchy', name: 'every GLB node belongs to exactly one valid asset hierarchy', broken: 'append an unreferenced orphan node',
    mutate: (f) => editGlb(f, (g) => { g.nodes.push({ name: 'beach_orphan_node' }); }) },
];

if (process.argv.includes('--list-mutations')) {
  console.log(JSON.stringify(CASES.map(({ id, name, broken }) => ({ id, name, broken }))));
  process.exit(0);
}

for (const scenario of CASES) test(`[${scenario.id}] ${scenario.name}`, (t) => {
  const f = fixture(t); scenario.prepare?.(f);
  if (process.env.BEACH_PROPS_MUTANT === scenario.id) scenario.mutate(f);
  const report = validateBeachProps(f);
  assert.equal(report.ok, true, report.failures.join('\n'));
  scenario.check?.(report, f);
});
