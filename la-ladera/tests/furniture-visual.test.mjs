// Studio checks must inspect actual base-library GLBs, including models whose
// world placements deliberately use opening carcasses or a hero override.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createContext } from '../js/core/ctx.js';
import { CATALOG } from '../js/interiors/catalog.js';
import { layoutOf } from '../js/interiors/carcass.js';
import { buildInterior } from '../js/interiors/build.js';
import { makeFrame } from '../js/core/frame.js';
import { readAssetJson } from './headless.mjs';
import { loadVisualFurniture, drawVisualFurniture } from './furniture-visual-lib.mjs';

function context() {
  const ctx = createContext({ headless: true }), parser = new GLTFLoader(), requests = [];
  ctx.assets.loader.loadAsync = async (path) => {
    requests.push(path);
    const bytes = await readFile(new URL('../' + path.replace(/^\.\//, ''), import.meta.url));
    return parser.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  };
  return { ctx, requests };
}

test('visual source selection inspects base-library geometry and explicitly selected hero overrides', async () => {
  for (const source of ['library', 'runtime']) {
    const { ctx, requests } = context();
    const info = await loadVisualFurniture(ctx, { ...(source === 'runtime' ? { source } : {}), read: readAssetJson });
    assert.deepEqual([...ctx.interiorGlb].sort(), Object.keys(CATALOG).sort());
    assert.equal(info.source, source);
    const expected = source === 'library' ? 'furniture/furn_living.glb' : 'heroes/furn_living.glb';
    assert.equal(ctx.assets.meta('chair_plastic').glb, expected, 'the same key must resolve to the requested source');
    const { group, stats, file } = drawVisualFurniture(ctx, 'chair_plastic');
    assert.equal(file, expected);
    assert.ok(requests.includes('./assets/models/' + expected));
    assert.equal(stats.glb, 1); assert.equal(stats.standin, 0); assert.equal(stats.failed, 0);
    assert.ok(stats.tris > 0 && group.meshes.length > 0);
    assert.ok(group.meshes.every((m) => m.material === ctx.mat(m.userData.matKey)), 'studio uses shared game materials');
    if (source === 'library') assert.ok(requests.every((p) => p.startsWith('./assets/models/furniture/')), 'hero GLBs cannot mask a broken library asset');
    assert.deepEqual(ctx.errors, []);
  }
});

test('studio inspects an openable furniture GLB while the world retains its working carcass', async () => {
  const { ctx } = context();
  await loadVisualFurniture(ctx, { read: readAssetJson });
  assert.ok(layoutOf(CATALOG.nightstand_a), 'this fixture must exercise the opening-furniture policy');
  const sample = drawVisualFurniture(ctx, 'nightstand_a');
  assert.equal(sample.stats.glb, 1); assert.equal(sample.stats.standin, 0);
  assert.ok(sample.group.meshes.length > 0 && sample.stats.tris > 0);
  const bp = { id: 'world-nightstand', lot: {}, frame: makeFrame(0, 0, 0), rooms: [], windows: [], interior: {},
    furniture: [{ id: 'world-nightstand.1', name: 'nightstand_a', x: 0, y: 0, z: 0, ry: 0, kind: 'floor' }] };
  buildInterior(ctx, bp);
  assert.equal(bp.interior.stats.glb, 0);
  assert.equal(bp.interior.stats.standin, 1, 'model inspection must not replace the opening carcass in production');
  assert.equal(bp.interior.stats.failed, 0);
  assert.deepEqual(ctx.errors, []);
});

test('a missing openable GLB root cannot pass studio validation using its procedural carcass', async () => {
  const { ctx } = context();
  const read = async (file) => {
    const manifest = await readAssetJson(file);
    if (file === 'manifest.furniture.json') for (const f of manifest.files) if (f.assets.nightstand_a) f.assets.nightstand_a.node = 'missing-nightstand-root';
    return manifest;
  };
  await assert.rejects(loadVisualFurniture(ctx, { read }), /Missing drawable library GLB for catalogue key nightstand_a/);
  assert.throws(() => drawVisualFurniture(ctx, 'nightstand_a'), /Missing drawable GLB/);
  assert.equal(ctx.batch.groups.has('contact-nightstand_a.int'), false, 'a missing model must never become a rendered sample');
});
