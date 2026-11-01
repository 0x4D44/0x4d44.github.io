// Integration contract for the child + teen libraries. Adult tests stay unchanged.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/garments-integration.test.mjs
import './nice.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Assets } from '../js/core/assets.js';
import { GARMENTS, SIZED_GARMENTS, SIZED_VARIANTS } from '../js/interiors/garments_data.js';
import { GARMENT_KEYS } from '../js/interiors/garments.js';
import { loadSizedGarmentAssets } from '../js/interiors/garments-sized.js';
import { loadInteriorAssets as pageLoad } from '../js/interiors/index.js';
import { glbParts } from '../js/interiors/build.js';
import { garmentsDataModule } from '../tools/garments_data.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = join(ROOT, 'assets/models');
const read = (p) => JSON.parse(readFileSync(join(MODELS, p), 'utf8'));
const AGES = ['child', 'teen'];
const manifests = Object.fromEntries(AGES.map((age) => [age, read(`manifest.garments_${age}.json`)]));
const rows = AGES.flatMap((age) => manifests[age].files.flatMap((f) => Object.entries(f.assets).map(([source, a]) => ({ age, source, a, glb: f.glb, key: `garment_${age}_${source.slice(8)}` }))));
const keys = rows.map((r) => r.key).sort();
const rounded = (n) => Math.round(n * 1000) / 1000;

async function context({ onlySized = true, missingManifest = null, failures = new Set(), editScene = null } = {}) {
  const ctx = { errors: [] }, calls = [];
  const assets = new Assets(ctx); ctx.assets = assets;
  await assets.init((p) => {
    if (p === missingManifest) return null;
    const value = read(p);
    if (p === 'manifest.json' && onlySized) value.files = value.files.filter((f) => /^manifest\.garments_(child|teen)\.json$/.test(f));
    return value;
  });
  const parser = new GLTFLoader();
  assets.loader.loadAsync = async (url) => {
    const path = url.slice(assets.root.length); calls.push(path);
    if (failures.has(path)) throw new Error(`fixture 404 ${path}`);
    const b = readFileSync(join(MODELS, path));
    const gl = await new Promise((ok, no) => parser.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', ok, no));
    editScene?.(gl.scene, path);
    return gl;
  };
  return { ctx, calls, failures };
}
async function quiet(fn) { const warn = console.warn; console.warn = () => {}; try { return await fn(); } finally { console.warn = warn; } }
const childFile = 'garments/garments_child.glb', teenFile = 'garments/garments_teen.glb';
const sizedCalls = (calls) => calls.filter((p) => p === childFile || p === teenFile);

test('sized data preserves every age, size, state, palette and original source root', () => {
  assert.equal(Object.keys(GARMENTS).length, 23, 'adult data remains the original 23 designs');
  assert.equal(rows.filter((r) => r.age === 'child').length, 90);
  assert.equal(rows.filter((r) => r.age === 'teen').length, 162);
  assert.deepEqual(Object.keys(SIZED_GARMENTS).sort(), keys);
  for (const { age, a, glb, key } of rows) {
    const g = SIZED_GARMENTS[key];
    assert.deepEqual(g, { age, size: a.sizeClass, garment: a.garment, state: a.state, variants: a.variants,
      dimensions: a.size.map(rounded), glb, node: a.node, lod: { glb: a.lod.glb, node: a.lod.node, triangles: a.lod.triangles } }, key);
    assert.ok(['small', 'big'].includes(g.size), key);
    for (const variant of a.variants) assert.equal(SIZED_VARIANTS[age][variant], Number(read(manifests[age].palette).variants[variant].color.replace('#', '0x')), `${key}/${variant}`);
  }
  const generated = readFileSync(join(ROOT, 'js/interiors/garments_data.js'), 'utf8');
  assert.match(generated, /^\/\/ INTERIORS \(A3\): the garment library as plain data \(assets\/models\/manifest\.garments\.json, garments\/palette\.json, garments\/assortments\.json\), so the furnishing code,\n/);
  assert.equal(generated, garmentsDataModule(MODELS), 'generated module must match the generator byte for byte');
});

test('manifest loading keeps overlapping child and teen source keys distinct', async () => {
  const root = read('manifest.json');
  for (const age of AGES) assert.equal(root.files.filter((f) => f === `manifest.garments_${age}.json`).length, 1);
  const { ctx } = await context({ onlySized: false }), a = ctx.assets;
  assert.equal(a.names('child').length, 90); assert.equal(a.names('teen').length, 162);
  const child = new Set(rows.filter((r) => r.age === 'child').map((r) => r.source));
  assert.equal(rows.filter((r) => r.age === 'teen' && child.has(r.source)).length, 56, 'the original libraries contain 56 collision cases');
  for (const r of rows) {
    const entry = a.meta(r.key);
    assert.ok(entry, r.key);
    assert.equal(entry.glb, r.glb, r.key); assert.equal(entry.node, r.a.node, r.key);
    assert.equal(entry.age, r.age, r.key); assert.equal(entry.sizeClass, r.a.sizeClass, r.key);
    assert.ok(entry.tags.includes(r.age) && entry.tags.includes(r.a.sizeClass), r.key);
    assert.equal(a.has(r.source), false, `${r.source}: an ambiguous age-free alias must not be registered`);
  }
});

test('page startup loads both sized libraries once and draws their measured LOD roots', async () => {
  const { ctx, calls } = await context();
  const cached = rows.find((r) => r.age === 'child' && r.a.triangles > r.a.lod.triangles);
  await ctx.assets.preload([cached.key]);
  const trianglesOf = (parts) => parts.reduce((sum, p) => sum + (p.geometry.index?.count ?? p.geometry.attributes.position.count) / 3, 0);
  assert.equal(trianglesOf(ctx.assets.parts(cached.key)), cached.a.triangles, 'fixture caches a detail root before startup');
  await pageLoad(ctx);
  assert.ok(ctx.sizedGarmentGlb instanceof Set, 'page startup must initialize the sized garment ready set');
  assert.deepEqual([...ctx.sizedGarmentGlb].sort(), keys);
  assert.deepEqual([...ctx.garmentGlb].sort(), [...GARMENT_KEYS].sort(), 'adult ready set stays separate');
  assert.deepEqual(sizedCalls(calls).sort(), [childFile, teenFile]);
  for (const { key, a } of rows) {
    assert.equal(ctx.assets.meta(key).node, a.lod.node, key);
    const triangles = glbParts(ctx, key).reduce((sum, p) => sum + (p.geometry.index?.count ?? p.geometry.attributes.position.count) / 3, 0);
    assert.equal(triangles, a.lod.triangles, `${key}: draw the LOD, never the full scene or detail root`);
  }
  assert.equal(trianglesOf(ctx.assets.parts(cached.key)), cached.a.lod.triangles, 'cached detail parts must be invalidated when selecting LOD');
  await loadSizedGarmentAssets(ctx);
  assert.deepEqual(sizedCalls(calls).sort(), [childFile, teenFile], 'a second request must reuse both loaded GLBs');
  assert.deepEqual(ctx.errors, []);
});

test('missing libraries fall back independently and a failed download can be retried', async () => {
  const absent = await context({ missingManifest: 'manifest.garments_child.json' });
  await loadSizedGarmentAssets(absent.ctx);
  assert.deepEqual([...absent.ctx.sizedGarmentGlb].sort(), rows.filter((r) => r.age === 'teen').map((r) => r.key).sort());
  assert.deepEqual(absent.calls, [teenFile], 'missing manifest must not trigger a guessed fetch');
  const failed = await context({ failures: new Set([childFile]) });
  await quiet(() => loadSizedGarmentAssets(failed.ctx));
  assert.equal(failed.ctx.sizedGarmentGlb.size, 162);
  assert.ok([...failed.ctx.sizedGarmentGlb].every((key) => key.startsWith('garment_teen_')));
  failed.failures.clear();
  await loadSizedGarmentAssets(failed.ctx);
  assert.deepEqual([...failed.ctx.sizedGarmentGlb].sort(), keys, 'retry must populate the recovered child library');
  assert.equal(failed.calls.filter((f) => f === childFile).length, 2);
  assert.equal(failed.calls.filter((f) => f === teenFile).length, 1, 'successful teen file stays cached');
  assert.deepEqual(failed.ctx.errors, []);
});

test('a missing named LOD root cannot be reported as a loaded garment', async () => {
  const target = rows.find((r) => r.age === 'child' && r.a.state === 'flat');
  const { ctx } = await context({ editScene: (scene, path) => { if (path === childFile) scene.getObjectByName(target.a.lod.node).name = 'removed_lod_fixture'; } });
  await loadSizedGarmentAssets(ctx);
  assert.equal(ctx.sizedGarmentGlb.has(target.key), false, target.key);
  assert.equal(ctx.sizedGarmentGlb.size, keys.length - 1, 'only the missing root falls back');
  assert.equal(ctx.interiorGlbParts.has(target.key), false, 'missing root must not leave cached parts');
});

test('garments off clears sized readiness without requesting either library', async () => {
  const { ctx, calls } = await context();
  ctx.sizedGarmentGlb = new Set(keys);
  globalThis.__noGarments = true;
  try { await loadSizedGarmentAssets(ctx); } finally { delete globalThis.__noGarments; }
  assert.equal(ctx.sizedGarmentGlb.size, 0);
  assert.deepEqual(calls, []);
  const empty = {}; await loadSizedGarmentAssets(empty);
  assert.equal(empty.sizedGarmentGlb.size, 0, 'missing asset registry remains harmless');
});

test('the generator rejects duplicate sized keys instead of overwriting garments', (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'ladera-sized-generator-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  cpSync(MODELS, temp, { recursive: true, filter: (path) => !path.endsWith('.glb') && !path.endsWith('.png') && !path.endsWith('.jpg') });
  const manifest = structuredClone(manifests.teen);
  manifest.files.push(manifest.files[0]);
  writeFileSync(join(temp, 'manifest.garments_teen.json'), JSON.stringify(manifest));
  assert.throws(() => garmentsDataModule(temp), /duplicate sized garment/);
});
