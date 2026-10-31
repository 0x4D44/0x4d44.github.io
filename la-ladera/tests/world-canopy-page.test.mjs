// The booted game wears the canopy sheet (assets/textures/foliage_cards.png, world/cards.js): the material is bound to the loaded image through the manifest, clamped and cut out at 0.5, the three tree
// species draw cards from cells 0, 1 and 4 of it, and the boot is as clean as without it (no console warning, no 404). The node side of this (card geometry, anchors, triangle counts, the fallback)
// is world-canopy.test.mjs.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-canopy-page.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';

let b, p, page, problems;
before(async () => {
  b = await launch({ width: 640, height: 360 });
  p = await b.open('la-ladera/index.html?autostart&manual');
  page = await p.eval(`(() => {
    const ctx = __ladera.ctx, T = ctx.THREE, m = ctx.matlib.cache.get('foliage_cards');
    const cell = (u, v) => (u < 0.25 ? 0 : u < 0.5 ? 1 : u < 0.75 ? 2 : 3) + (v < 0.5 ? 4 : 0);
    const meshes = [], tris = { cards: 0, painted: 0 }, cells = {};
    ctx.scene.traverse((o) => {
      if (!o.isMesh) return;
      const n = (o.geometry.index ? o.geometry.index.count : o.geometry.getAttribute('position').count) / 3;
      if (o.material === m) {
        meshes.push(o); tris.cards += n;
        const uv = o.geometry.getAttribute('uv');
        for (let i = 0; i < uv.count; i++) { const k = cell(uv.getX(i), uv.getY(i)); cells[k] = (cells[k] ?? 0) + 1; }
      } else if (o.material.name === 'foliage' || o.material.name === 'foliage_low') tris.painted += n;
    });
    const map = m?.map;
    return {
      have: !!m, name: m?.name, alphaTest: m?.alphaTest, a2c: m?.alphaToCoverage, msaa: ctx.post?.profile?.samples ?? 0, side: m?.side, doubleSide: T.DoubleSide, vertexColors: m?.vertexColors,
      image: map?.image ? [map.image.width, map.image.height] : null, wrapS: map?.wrapS, wrapT: map?.wrapT, clamp: T.ClampToEdgeWrapping, repeat: map ? [map.repeat.x, map.repeat.y] : null,
      colorSpace: map?.colorSpace, meshes: meshes.length, tris, cells,
      cast: meshes.filter((o) => o.castShadow).length, receive: meshes.filter((o) => o.receiveShadow).length,
    };
  })()`);
  const s = p.summary();
  problems = { errors: s.errors.length + s.consoleErrors.length, warnings: s.consoleWarnings.length, net: s.netErrors.length };
});
after(async () => { await b?.close(); });

test('the booted material is the sheet: loaded 2048 x 1024, clamped with unit repeat, a 0.5 cut-out, two-sided, vertex-tinted', () => {
  assert.ok(page.have, 'ctx.mat("foliage_cards") exists once the world is flushed');
  assert.deepEqual(page.image, [2048, 1024], 'the image has arrived (the boot waits for the textures it asked for)');
  assert.equal(page.alphaTest, 0.5);
  assert.equal(page.a2c, true, 'the cut-out edge is also written as coverage: anti-aliased on the 4x MSAA of the high profile, a plain 0.5 cut-out without MSAA');
  assert.ok(page.msaa >= 0, 'the profile is known');
  assert.equal(page.side, page.doubleSide);
  assert.equal(page.vertexColors, true, 'the crown shade and the tint ride on the vertex colour');
  assert.deepEqual([page.wrapS, page.wrapT], [page.clamp, page.clamp], 'unit uvs: clamped, so a card never samples the far side of the sheet');
  assert.deepEqual(page.repeat, [1, 1]);
  assert.equal(page.colorSpace, 'srgb', 'colour data');
});

test('the trees draw it: eucalyptus, cypress and broadleaf cards from cells 0, 1 and 4 and no other cell, in meshes that cast and receive shadow', () => {
  assert.ok(page.meshes > 0 && page.tris.cards > 1000, `${page.meshes} meshes, ${page.tris.cards} triangles of canopy cards`);
  assert.deepEqual(Object.keys(page.cells).map(Number).sort(), [0, 1, 4], 'the cells the uvs fall in');
  for (const k of [0, 1, 4]) assert.ok(page.cells[k] > 100, `cell ${k}: ${page.cells[k]} vertices`);
  assert.equal(page.cast, page.meshes, 'every canopy mesh casts a shadow (the plazas are shaded by them)');
  assert.equal(page.receive, page.meshes, 'and receives one');
});

test('the boot is clean with the sheet: no page error, no console error or warning, no 404', () => {
  assert.deepEqual(problems, { errors: 0, warnings: 0, net: 0 });
});
