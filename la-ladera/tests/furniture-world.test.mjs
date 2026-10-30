// Full-page regression for the furniture replacement: real world generation, all buildings,
// actual model HTTP requests, and bounded render work at representative entrances.
// FPS is deliberately not measured: this test also runs on software WebGL (SwiftShader).
// Run: CHROME_PATH=/path/to/chrome node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/furniture-world.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';

const KINDS = ['house', 'apartments', 'shophouse', 'school', 'clinic', 'workshop'];
const MAX_CALLS = 1800, MAX_TRIANGLES = 2_500_000;

test('the full world uses GLBs for every furniture placement and stays within render budgets', { timeout: 300_000 }, async (t) => {
  let browser;
  try {
    browser = await launch({ width: 1280, height: 720 });
    const p = browser.page, responses = new Map(), listener = p.b.listeners.get(p.sid);
    p.b.listeners.set(p.sid, (message) => {
      if (message.method === 'Network.responseReceived') {
        const { url, status } = message.params.response, path = new URL(url).pathname;
        if (path.includes('/assets/models/furniture/')) responses.set(path, status);
      }
      listener(message);
    });
    // No lots/skip flags: this must exercise the complete production boot and furnishing path.
    await browser.open('la-ladera/index.html?autostart&manual&dpr=1');
    const world = await p.fn(async () => {
      const api = window.__ladera, ctx = api.ctx;
      const { CATALOG } = await import('/la-ladera/js/interiors/catalog.js');
      const keys = Object.keys(CATALOG).sort();
      return {
        catalogue: keys, loaded: [...ctx.interiorGlb].sort(), errors: api.errors(),
        files: [...new Set(keys.map((key) => ctx.assets.meta(key)?.glb))],
        buildings: [...ctx.buildings.values()].map((bp) => ({
          id: bp.id, kind: bp.lot.kind, records: bp.furniture.length,
          models: bp.furniture.filter((r) => !r.decal).length,
          decals: bp.furniture.filter((r) => !!r.decal).length,
          unknown: bp.furniture.filter((r) => !r.decal && !CATALOG[r.name]).map((r) => r.name),
          stats: bp.interior?.stats ?? null,
        })),
      };
    });
    assert.ok(world.catalogue.length >= 120, 'the shipped library must meet the minimum asset coverage');
    assert.deepEqual(world.loaded, world.catalogue, 'every catalogue key must be an actual drawable GLB asset');
    assert.ok(world.buildings.length >= 40, `only ${world.buildings.length} buildings; this was not a full world`);
    let models = 0, decals = 0, failures = 0;
    for (const bp of world.buildings) {
      assert.deepEqual(bp.unknown, [], `${bp.id}: unknown furniture records`);
      assert.ok(bp.stats, `${bp.id}: interior was never built`);
      assert.equal(bp.stats.records, bp.records, `${bp.id}: dropped furnishing records`);
      assert.equal(bp.stats.glb, bp.models, `${bp.id}: non-decal furniture silently fell back`);
      assert.equal(bp.stats.standin, bp.decals, `${bp.id}: only decals should use procedural drawing`);
      assert.equal(bp.stats.failed, 0, `${bp.id}: furniture failed to draw`);
      models += bp.stats.glb; decals += bp.stats.standin; failures += bp.stats.failed;
    }
    assert.ok(models > 0, 'no model placements were made');
    assert.equal(failures, 0);
    assert.deepEqual(world.errors, [], 'full-page boot errors');
    for (const file of world.files) {
      assert.ok(typeof file === 'string' && file.startsWith('furniture/'), `invalid model path ${file}`);
      assert.equal(responses.get('/la-ladera/assets/models/' + file), 200, `${file}: no successful browser model request`);
    }
    t.diagnostic(`whole world: ${world.catalogue.length} loaded catalogue assets in ${world.files.length} GLBs; ${world.buildings.length} buildings, ${models} GLB placements, ${decals} procedural decals, ${failures} failed records`);

    // Pick the most furnished building of each kind so a tiny specimen cannot hide excessive render work.
    const selected = KINDS.map((kind) => {
      const bp = world.buildings.filter((x) => x.kind === kind).sort((a, b) => b.models - a.models || a.id.localeCompare(b.id))[0];
      assert.ok(bp, `no ${kind} available for the representative render check`);
      return { id: bp.id, kind };
    });
    const views = await p.fn((selected) => {
      const api = window.__ladera, ctx = api.ctx, out = [];
      api.setQuality('high'); api.step(3); api.render();
      const snapshot = (id, kind) => {
        const s = api.state();
        return { id, kind, calls: s.drawCalls, triangles: s.triangles, interiorVisible: id === 'spawn' || ctx.batch.groups.get(id + '.int')?.obj.visible === true };
      };
      out.push(snapshot('spawn', 'street'));
      for (const { id, kind } of selected) {
        api.enter(id); api.step(3); api.render();
        out.push(snapshot(id, kind));
      }
      return { views: out, errors: api.errors() };
    }, selected);
    for (const view of views.views) {
      assert.equal(view.interiorVisible, true, `${view.id}: furniture was hidden during the budget check`);
      assert.ok(Number.isFinite(view.calls) && view.calls > 0 && view.calls <= MAX_CALLS, `${view.id}/${view.kind}: ${view.calls} draw calls (limit ${MAX_CALLS})`);
      assert.ok(Number.isFinite(view.triangles) && view.triangles > 0 && view.triangles <= MAX_TRIANGLES, `${view.id}/${view.kind}: ${view.triangles} triangles (limit ${MAX_TRIANGLES})`);
      t.diagnostic(`${view.id}/${view.kind}: ${view.calls} draw calls, ${view.triangles} triangles`);
    }
    assert.deepEqual(views.errors, [], 'errors after entering and rendering furnished buildings');
    assert.deepEqual(p.summary(), { errors: [], netErrors: [], consoleErrors: [], consoleWarnings: [] }, 'browser/model request errors');
  } finally { if (browser) await browser.close(); }
});
