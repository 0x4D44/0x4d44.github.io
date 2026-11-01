// Positive asset invariants plus one killed input/module mutation per test.
import './nice.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from '../vendor/three/build/three.core.min.js';
import { parseGlb } from '../tools/blender/furn_validate.mjs';
import { validateWatersports, inspectWatersportsGlb, inspectHullExterior, inspectAtlasPng, sha256, textSha256,
  ROOT, MODELS, REQUIRED_KEYS, MAX_GLB_BYTES, MAX_TEXTURE_BYTES } from '../tools/blender/watersports_validate.mjs';
import { CASES } from './watersports-mutations.mjs';

const MUTATION = process.env.WATERSPORTS_MUTATION;
const MANIFEST = 'manifest.watersports.json';
const errors = (r) => r.failures.join('\n');
const mutated = (id, fn) => { if (MUTATION === id) fn(); };
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ladera-watersports-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of ['assets/models/' + MANIFEST, 'assets/models/manifest.json', 'assets/models/watersports',
    'assets/textures/watersports', 'tools/blender/watersports.catalog.json', 'tools/blender/watersports.materials.json']) {
    cpSync(resolve(ROOT, path), resolve(root, path), { recursive: true });
  }
  return { root, models: resolve(root, 'assets/models'), catalogue: resolve(root, 'tools/blender/watersports.catalog.json'),
    materials: resolve(root, 'tools/blender/watersports.materials.json'), anchors: resolve(root, 'assets/models/watersports/anchors.json') };
}
function manifest(f) { return json(resolve(f.models ?? f, MANIFEST)); }
function changeManifest(f, fn) { const m = manifest(f); fn(m); writeJson(resolve(f.models, MANIFEST), m); }
function validate(f) { return validateWatersports({ ...f, complete: true }); }
function allGood(f) { const r = validate(f); assert.equal(r.ok, true, errors(r)); return r; }
function encode(g, bin) {
  const text = Buffer.from(JSON.stringify(g)), n = Math.ceil(text.length / 4) * 4, len = Math.ceil(bin.length / 4) * 4;
  const b = Buffer.alloc(12 + 8 + n + 8 + len);
  b.writeUInt32LE(0x46546c67, 0); b.writeUInt32LE(2, 4); b.writeUInt32LE(b.length, 8);
  b.writeUInt32LE(n, 12); b.writeUInt32LE(0x4e4f534a, 16); b.fill(32, 20, 20 + n); text.copy(b, 20);
  b.writeUInt32LE(len, 20 + n); b.writeUInt32LE(0x004e4942, 24 + n); bin.copy(b, 28 + n);
  return b;
}
function editGlb(f, edit, key = REQUIRED_KEYS[0]) {
  const m = manifest(f), file = m.files.find((x) => x.assets[key]); assert.ok(file, `missing physical ${key}`);
  const path = resolve(f.models, file.glb), { json: g, bin } = parseGlb(readFileSync(path));
  edit(g, bin, file.assets);
  const bytes = encode(g, bin); writeFileSync(path, bytes);
  changeManifest(f, (n) => {
    const target = n.files.find((x) => x.glb === file.glb); target.bytes = bytes.length; target.sha256 = sha256(bytes); target.assets = file.assets;
    n.glbBytes = n.files.reduce((sum, x) => sum + x.bytes, 0); n.totalBytes = n.glbBytes + n.textureBytes;
  });
  return path;
}
function primitive(g) { return g.meshes.find((m) => m.primitives?.length).primitives[0]; }
function offset(g, index, vertex = 0, width = 3, bytes = 4) {
  const a = g.accessors[index], v = g.bufferViews[a.bufferView];
  return (v.byteOffset ?? 0) + (a.byteOffset ?? 0) + vertex * (v.byteStride ?? width * bytes);
}
function inspectAll(f) { return manifest(f).files.map((x) => inspectWatersportsGlb(resolve(f.models, x.glb))); }
function repinText(f) { changeManifest(f, (m) => {
  m.generator.catalogSha256 = textSha256(readFileSync(f.catalogue));
  m.generator.anchorsSha256 = textSha256(readFileSync(f.anchors));
}); }
async function lineModule(t, mutation, from, to) {
  const original = resolve(ROOT, 'tools/watersports-lines.mjs');
  if (MUTATION !== mutation) return import(pathToFileURL(original));
  const root = mkdtempSync(join(tmpdir(), 'ladera-watersports-line-mutant-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = readFileSync(original, 'utf8'); assert.equal(source.split(from).length, 2, `unique mutation site ${mutation}`);
  const file = resolve(root, 'lines.mjs'); writeFileSync(file, source.replace(from, to)); return import(pathToFileURL(file));
}
function point(array, n) { return Array.from(array.subarray(n * 3, n * 3 + 3)); }
function close(actual, expected, epsilon = 1e-5) {
  assert.equal(actual.length, expected.length); actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= epsilon, `${v} != ${expected[i]}`));
}

test('W01 complete requested inventory has physical near and far assets within both byte budgets', (t) => {
  const f = fixture(t); mutated('complete', () => rmSync(resolve(f.models, manifest(f).files[0].glb)));
  const r = allGood(f);
  assert.equal(r.assetCount, REQUIRED_KEYS.length); assert.equal(r.lodCount, REQUIRED_KEYS.length);
  assert.ok(r.glbBytes > 10_000 && r.glbBytes <= MAX_GLB_BYTES); assert.ok(r.textureBytes <= MAX_TEXTURE_BYTES);
});

test('W02 positions are finite floats and accessor extrema match their actual binary', (t) => {
  const f = fixture(t); mutated('nan', () => editGlb(f, (g, b) => b.writeFloatLE(NaN, offset(g, primitive(g).attributes.POSITION))));
  for (const r of inspectAll(f)) for (const a of r.assets.values()) assert.ok([...a.min, ...a.max, ...a.size].every(Number.isFinite));
});

test('W03 every accessor stays inside its own buffer view', (t) => {
  const f = fixture(t); mutated('accessor', () => editGlb(f, (g) => { g.accessors[primitive(g).attributes.POSITION].count += 1_000_000; }));
  inspectAll(f);
});

test('W04 actual exported UV coordinates stay inside the shared atlas', (t) => {
  const f = fixture(t); mutated('uv', () => editGlb(f, (g, b) => b.writeFloatLE(1.5, offset(g, primitive(g).attributes.TEXCOORD_0, 0, 2))));
  for (const r of inspectAll(f)) for (const a of r.assets.values()) assert.ok(a.uvBounds.every((v) => v >= -1e-6 && v <= 1.000001));
});

test('W05 triangle indices address existing vertices and no faces collapse', (t) => {
  const f = fixture(t); mutated('index', () => editGlb(f, (g, b) => {
    const p = primitive(g), a = g.accessors[p.indices], size = { 5121: 1, 5123: 2, 5125: 4 }[a.componentType];
    b[{ 5121: 'writeUInt8', 5123: 'writeUInt16LE', 5125: 'writeUInt32LE' }[a.componentType]](g.accessors[p.attributes.POSITION].count, offset(g, p.indices, 0, 1, size));
  }));
  inspectAll(f);
});

test('W06 named asset roots preserve metre scale and identity transforms', (t) => {
  const f = fixture(t); mutated('transform', () => editGlb(f, (g) => { g.nodes[g.scenes[0].nodes[0]].scale = [-1, 1, 1]; }));
  inspectAll(f);
});

test('W07 exported normals are unit vectors aligned with triangle winding', (t) => {
  const f = fixture(t); mutated('normal', () => editGlb(f, (g, b) => {
    const at = offset(g, primitive(g).attributes.NORMAL); for (let i = 0; i < 3; i++) b.writeFloatLE(0, at + i * 4);
  }));
  inspectAll(f);
});

test('W08 every piece has an explicit far LOD at no more than forty percent', (t) => {
  const f = fixture(t); mutated('lod', () => changeManifest(f, (m) => { for (const file of m.files) { const key = Object.keys(file.assets).find((k) => k.endsWith('_lod1')); if (key) { delete file.assets[key]; break; } } }));
  const r = allGood(f);
  for (const a of r.assets.filter((a) => !a.key.endsWith('_lod1'))) assert.ok(r.assets.find((b) => b.key === a.key + '_lod1').triangles <= a.triangles * 0.4);
});

test('W09 drawn-instance triangle counts obey tiny-prop and boat caps', (t) => {
  const f = fixture(t); mutated('triangles', () => editGlb(f, (g, _b, metas) => {
    const key = REQUIRED_KEYS[0], root = g.nodes.find((n) => n.name === key), used = new Set();
    function visit(n) { if (n.mesh != null && !used.has(n.mesh)) { used.add(n.mesh); const m = g.meshes[n.mesh]; m.primitives = Array.from({ length: 100 }, () => m.primitives.map((p) => structuredClone(p))).flat(); } for (const i of n.children ?? []) visit(g.nodes[i]); }
    visit(root); metas[key].triangles *= 100; metas[key].parts *= 100;
  }));
  allGood(f);
});

test('W10 moving parts remain drawable independent pivots at matching LOD positions', (t) => {
  const f = fixture(t); mutated('pivot', () => editGlb(f, (g) => {
    const n = g.nodes.find((n) => n.name.endsWith('-pivot_sail')); assert.ok(n); n.name += '_broken';
  }, 'watersports_windsurf_rig'));
  const r = allGood(f); assert.ok(r.assets.some((a) => a.pivots.length >= 2));
});

test('W11 byte counts and SHA-256 pins match every physical GLB', (t) => {
  const f = fixture(t); mutated('hash', () => changeManifest(f, (m) => { m.files[0].sha256 = '0'.repeat(64); }));
  allGood(f);
});

test('W12 shared PBR PNGs decode with valid CRCs dimensions and real alpha', (t) => {
  const f = fixture(t), m = manifest(f);
  mutated('png', () => { const path = resolve(f.models, m.atlas.maps.baseColor.path), b = readFileSync(path); b[100] ^= 1; writeFileSync(path, b); });
  for (const [kind, map] of Object.entries(m.atlas.maps)) {
    const p = inspectAtlasPng(readFileSync(resolve(f.models, map.path)));
    assert.ok(p.width <= 2048 && p.height <= 2048); if (kind === 'baseColor') assert.ok(p.minAlpha < 128 && p.maxAlpha === 255);
  }
});

test('W13 floor origins waterline drafts and motion numbers agree with real geometry', (t) => {
  const f = fixture(t); mutated('draft', () => { const c = json(f.catalogue), key = Object.keys(c.assets).find((k) => c.assets[k].floating); c.assets[key].draftDepth += 0.4; writeJson(f.catalogue, c); repinText(f); });
  allGood(f);
});

test('W14 rider climb standing and navigation anchors are complete finite and usable', (t) => {
  const f = fixture(t); mutated('anchors', () => {
    const c = json(f.catalogue), a = json(f.anchors), key = Object.keys(a.assets).find((k) => a.assets[k].ladder); assert.ok(key);
    a.assets[key].ladder.end[1] = a.assets[key].ladder.start[1] - 0.5; c.assets[key].anchors.ladder = a.assets[key].ladder;
    writeJson(f.catalogue, c); writeJson(f.anchors, a); repinText(f);
  });
  allGood(f);
});

test('W15 watersports remains absent from the game boot manifest', (t) => {
  const f = fixture(t); mutated('boot', () => { const path = resolve(f.models, 'manifest.json'), m = json(path); m.files.push(MANIFEST); writeJson(path, m); });
  allGood(f);
});

test('W16 repeated kit planks and swim floats reuse mesh data as actual instances', (t) => {
  const f = fixture(t);
  const candidate = inspectAll(f).flatMap((r) => [...r.assets.values()]).find((a) => !a.key.endsWith('_lod1') && /deck|swimline/.test(a.key)
    && a.nodes.filter((n) => n.mesh != null).length > a.meshIds.length);
  assert.ok(candidate, 'at least one plank/float kit must contain actual shared geometry');
  mutated('instances', () => editGlb(f, (g) => {
    const root = g.nodes.find((n) => n.name === candidate.key);
    function visit(n) { if (n.mesh != null) { g.meshes.push(structuredClone(g.meshes[n.mesh])); n.mesh = g.meshes.length - 1; } for (const i of n.children ?? []) visit(g.nodes[i]); }
    visit(root);
  }, candidate.key));
  const actual = inspectAll(f).flatMap((r) => [...r.assets.values()]).find((a) => a.key === candidate.key);
  assert.ok(actual.nodes.filter((n) => n.mesh != null).length > actual.meshIds.length, 'repeated pieces must retain shared GLB mesh references');
  for (const key of ['watersports_pier_deck', 'watersports_swimline_segment']) {
    const a = inspectAll(f).flatMap((r) => [...r.assets.values()]).find((a) => a.key === key);
    assert.ok(a && a.nodes.filter((n) => n.mesh != null).length > a.meshIds.length, `${key}: mesh instances required`);
  }
});

test('W17 sail and kite variants each name six distinct shared-atlas colourways', (t) => {
  const f = fixture(t); mutated('colourways', () => { const c = json(f.catalogue); const key = Object.keys(c.assets).find((k) => c.assets[k].variants?.sail); c.assets[key].variants.sail.tiles.pop(); writeJson(f.catalogue, c); repinText(f); });
  allGood(f);
  const c = json(f.catalogue); assert.ok(Object.values(c.assets).some((a) => a.variants?.sail)); assert.ok(Object.values(c.assets).some((a) => a.variants?.kite));
});

test('W18 text pins accept LF and CRLF checkouts but reject changed content', (t) => {
  const f = fixture(t);
  for (const path of [f.catalogue, f.anchors, f.materials]) {
    const lf = readFileSync(path, 'utf8').replace(/\r\n/g, '\n'), crlf = lf.replace(/\n/g, '\r\n');
    assert.equal(textSha256(Buffer.from(lf)), textSha256(Buffer.from(crlf))); writeFileSync(path, crlf);
  }
  mutated('textpin', () => { const c = json(f.catalogue); c.units = 'centimetres'; writeJson(f.catalogue, c); });
  allGood(f);
});

test('W19 nearest exterior hull surfaces face outwards even when normals and winding agree', (t) => {
  const f = fixture(t);
  mutated('hull-exterior', () => editGlb(f, (g, bin) => {
    const root = g.nodes.find((n) => n.name === 'watersports_kayak_single'), normals = new Set(), indices = new Set();
    function visit(node) {
      if (node.mesh != null) for (const p of g.meshes[node.mesh].primitives) {
        normals.add(p.attributes.NORMAL); indices.add(p.indices);
      }
      for (const child of node.children ?? []) visit(g.nodes[child]);
    }
    visit(root);
    for (const id of normals) {
      const a = g.accessors[id];
      for (let i = 0; i < a.count; i++) for (let d = 0; d < 3; d++) { const at = offset(g, id, i) + d * 4; bin.writeFloatLE(-bin.readFloatLE(at), at); }
    }
    for (const id of indices) {
      const a = g.accessors[id], size = { 5121: 1, 5123: 2, 5125: 4 }[a.componentType],
        read = { 5121: 'readUInt8', 5123: 'readUInt16LE', 5125: 'readUInt32LE' }[a.componentType],
        write = { 5121: 'writeUInt8', 5123: 'writeUInt16LE', 5125: 'writeUInt32LE' }[a.componentType];
      for (let i = 0; i < a.count; i += 3) {
        const x = offset(g, id, i, 1, size), y = offset(g, id, i + 2, 1, size), first = bin[read](x);
        bin[write](bin[read](y), x); bin[write](first, y);
      }
    }
  }, 'watersports_kayak_single'));
  // This still succeeds for the mutant: finite data, winding and normals agree.
  // The exterior-ray assertion below therefore catches a separate regression.
  inspectAll(f);
  const catalogue = json(f.catalogue);
  let tested = 0;
  for (const file of manifest(f).files) for (const key of Object.keys(file.assets)) {
    const base = key.endsWith('_lod1') ? key.slice(0, -5) : key;
    if (!/^watersports_(?:kayak_single|kayak_double|rowing_boat|lancha|wooden_boat_\w+)$/.test(base)) continue;
    const result = inspectHullExterior(resolve(f.models, file.glb), key, { floating: catalogue.assets[base].floating });
    assert.equal(result.exteriorSamples, 12); assert.ok(result.endSamples >= 2); tested++;
  }
  assert.equal(tested, 16, 'two LODs for both kayaks, rowing boat, lancha and all four named fishing boats');
  // Reproduce the observed black-transom defect independently of the builder:
  // find the two oppositely-facing stern planes in decoded geometry and move
  // only the inner cap vertices onto the outer one. Topology, normals and
  // winding remain valid; the semantic overlap gate must reject the result.
  const caps = fixture(t), boat = 'watersports_wooden_boat_maria_del_mar';
  const capPath = editGlb(caps, (g, bin) => {
    const root = g.nodes.find((n) => n.name === boat), faces = [];
    function visit(node) {
      if (node.mesh != null) for (const p of g.meshes[node.mesh].primitives) {
        if (g.materials[p.material].name !== 'watersports_atlas') continue;
        const indices = g.accessors[p.indices], size = { 5121: 1, 5123: 2, 5125: 4 }[indices.componentType],
          read = { 5121: 'readUInt8', 5123: 'readUInt16LE', 5125: 'readUInt32LE' }[indices.componentType];
        for (let i = 0; i < indices.count; i += 3) {
          const vertices = [0, 1, 2].map((j) => bin[read](offset(g, p.indices, i + j, 1, size))),
            zs = vertices.map((v) => bin.readFloatLE(offset(g, p.attributes.POSITION, v) + 8)),
            nz = vertices.map((v) => bin.readFloatLE(offset(g, p.attributes.NORMAL, v) + 8));
          if (Math.max(...zs) - Math.min(...zs) < 1e-5 && Math.abs(nz.reduce((n, v) => n + v, 0) / 3) > 0.99)
            faces.push({ position: p.attributes.POSITION, vertices, z: zs[0], nz: nz[0] });
        }
      }
      for (const child of node.children ?? []) visit(g.nodes[child]);
    }
    visit(root);
    const outer = Math.min(...faces.filter((f) => f.nz < 0).map((f) => f.z)),
      inner = Math.min(...faces.filter((f) => f.nz > 0 && f.z > outer + 0.001).map((f) => f.z));
    assert.ok(Number.isFinite(outer) && Number.isFinite(inner) && inner - outer < 1, 'independent stern planes found');
    const changed = new Set();
    for (const face of faces.filter((f) => f.nz > 0 && Math.abs(f.z - inner) < 1e-5)) {
      for (const vertex of face.vertices) bin.writeFloatLE(outer, offset(g, face.position, vertex) + 8);
      changed.add(face.position);
    }
    assert.ok(changed.size > 0, 'inner stern-cap vertices changed');
    for (const id of changed) {
      const a = g.accessors[id]; a.min = [Infinity, Infinity, Infinity]; a.max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < a.count; i++) for (let d = 0; d < 3; d++) {
        const value = bin.readFloatLE(offset(g, id, i) + d * 4); a.min[d] = Math.min(a.min[d], value); a.max[d] = Math.max(a.max[d], value);
      }
    }
  }, boat);
  inspectWatersportsGlb(capPath);
  assert.throws(() => inspectHullExterior(capPath, boat, { floating: false }), /opposing coplanar hull end caps/);
  t.diagnostic('Coplanar stern-cap negative control: generic binary checks passed; exterior overlap assertion rejected it.');
});

test('L01 catenary points and line segments preserve both unequal-height endpoints', async (t) => {
  const { sampleCatenary, catenarySegments } = await lineModule(t, 'line-end', 'points.set(end, segments * 3);', 'points.set([end[0], end[1] + 1, end[2]], segments * 3);');
  const start = [2, 1.2, -3], end = [12, 24, 5], options = { segments: 16, slack: 0.02 }, points = sampleCatenary(start, end, options), lines = catenarySegments(start, end, options);
  close(point(points, 0), start); close(point(points, 16), end);
  for (let i = 0; i < 16; i++) { close(point(lines, i * 2), point(points, i)); close(point(lines, i * 2 + 1), point(points, i + 1)); }
});

test('L02 horizontal and sloping catenaries sag and preserve requested arc length', async (t) => {
  const { sampleCatenary } = await lineModule(t, 'line-sag', 'const length = distance * (1 + slack);', 'const length = distance * (1 + slack * 0.1);');
  for (const end of [[10, 0, 0], [9, 6, 3]]) {
    const start = [0, 0, 0], slack = 0.12, points = sampleCatenary(start, end, { segments: 256, slack });
    const middle = point(points, 128); assert.ok(middle[1] < end[1] / 2 - 0.5);
    let length = 0; for (let i = 0; i < 256; i++) { const a = point(points, i), b = point(points, i + 1); length += Math.hypot(...a.map((v, d) => b[d] - v)); }
    assert.ok(Math.abs(length - Math.hypot(...end) * (1 + slack)) < 0.002);
  }
});

test('L03 taut vertical and coincident catenary limits remain finite and deterministic', async (t) => {
  const { sampleCatenary } = await lineModule(t, 'line-degenerate', 'yAt = (t) => start[1] + t * dy;', 'yAt = (t) => start[1] + t * dy / distance;');
  for (const [a, b, slack] of [[[0, 2, 0], [0, 2, 0], 0.1], [[0, 1, 0], [0, 5, 0], 0.1], [[1, 2, 3], [5, 4, 8], 0]]) {
    const points = sampleCatenary(a, b, { slack, segments: 20 }); assert.ok(points.every(Number.isFinite));
    assert.deepEqual(points, sampleCatenary(a, b, { slack, segments: 20 })); close(point(points, 0), a); close(point(points, 20), b);
    if (slack === 0) close(point(points, 10), a.map((v, i) => (v + b[i]) / 2));
  }
  const integerEndpoints = sampleCatenary(new Uint8Array([10, 0, 0]), new Uint8Array([0, 0, 0]), { slack: 0, segments: 2 });
  close(point(integerEndpoints, 0), [10, 0, 0]); close(point(integerEndpoints, 1), [5, 0, 0]); close(point(integerEndpoints, 2), [0, 0, 0]);
});

test('L04 catenary input guards bound allocations and reject non-finite coordinates', async (t) => {
  const { sampleCatenary, catenarySegments } = await lineModule(t, 'line-bounds', "if (!Number.isInteger(segments) || segments < 1 || segments > 256)", 'if (false)');
  assert.throws(() => sampleCatenary([0, 0, 0], [1, 1, 1], { segments: 257 }), /segments/);
  assert.throws(() => sampleCatenary([NaN, 0, 0], [1, 1, 1]), /finite/);
  assert.throws(() => sampleCatenary([0, 0, 0], [1, 1, 1], { slack: -1 }), /slack/);
  assert.throws(() => sampleCatenary([0, 0, 0], [200000, 0, 0]), /span/);
  assert.throws(() => catenarySegments([0, 0, 0], [1, 1, 1], { segments: 4 }, new Float32Array(2)), /target/);
});

test('L05 runtime segment updates reuse their allocated buffer and refresh bounds', async (t) => {
  const { catenarySegments, makeCatenaryLineSegments } = await lineModule(t, 'line-buffer', 'const result = target ?? new Float32Array(count * 6);', 'const result = new Float32Array(count * 6);');
  const target = new Float32Array(48); assert.equal(catenarySegments([0, 0, 0], [3, 5, 1], { segments: 8 }, target), target);
  const lines = makeCatenaryLineSegments(THREE, [0, 0, 0], [1, 2, 3], { segments: 8 }), attribute = lines.geometry.getAttribute('position'), buffer = attribute.array;
  lines.userData.updateEndpoints([2, 0, 0], [10, 2, 0]); assert.equal(lines.geometry.getAttribute('position').array, buffer);
  close(point(buffer, 0), [2, 0, 0]); close(point(buffer, 15), [10, 2, 0]); assert.ok(lines.geometry.boundingSphere.radius > 4);
  lines.geometry.dispose(); lines.material.dispose();
});

test('V01 atlas variants clone affected geometry and preserve unrelated UVs and source instances', async (t) => {
  const sourceFile = resolve(ROOT, 'tools/watersports-variants.mjs');
  let module = pathToFileURL(sourceFile);
  if (MUTATION === 'variant') {
    const root = mkdtempSync(join(tmpdir(), 'ladera-watersports-variant-mutant-')); t.after(() => rmSync(root, { recursive: true, force: true }));
    const source = readFileSync(sourceFile, 'utf8'); assert.ok(source.includes('.clone()'), 'variant mutation site exists');
    const file = resolve(root, 'variants.mjs'); writeFileSync(file, source.replace('.clone()', '')); module = pathToFileURL(file);
  }
  const { applyWatersportsVariant } = await import(module);
  const atlas = { tiles: { a: [0, 0, 0.25, 0.25], b: [0.5, 0.5, 0.75, 0.75] } };
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0.05, 0.05, 0.15, 0.05, 0.05, 0.15], 2));
  const untouched = g.clone(); untouched.setAttribute('uv', new THREE.Float32BufferAttribute([0.9, 0.9, 0.8, 0.9, 0.9, 0.8], 2));
  const one = new THREE.Mesh(g), two = new THREE.Mesh(g), other = new THREE.Mesh(untouched), root = new THREE.Group(); root.add(one, two, other);
  const original = Array.from(g.attributes.uv.array), unrelated = Array.from(untouched.attributes.uv.array);
  assert.equal(applyWatersportsVariant(root, atlas, 'a', 'b'), 2);
  assert.notEqual(one.geometry, g); assert.equal(two.geometry, one.geometry); assert.equal(other.geometry, untouched);
  assert.deepEqual(Array.from(g.attributes.uv.array), original); assert.deepEqual(Array.from(untouched.attributes.uv.array), unrelated);
  close(Array.from(one.geometry.attributes.uv.array), original.map((v) => v + 0.5));
});

// The runner's one-to-one table must remain synchronized with actual tests.
assert.equal(CASES.length, 25);
