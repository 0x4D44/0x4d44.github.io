// The water-sports library as the world knows it before it is loaded (A5, js/world/waterlib.js, dev/FEATURE-BEACH.md phase 2b): the sizes, floats and anchors the plan of the sea stands on, held to the Codex
// library's own files (assets/models/manifest.watersports.json, assets/models/watersports/anchors.json), so a library that changes fails here and not in a picture. Pure Node: nothing is drawn.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-waterlib.test.mjs
// Every check has a deliberately broken input selected by WL_SABOTAGE=<id>|all, and each must then FAIL:
//   size     a size is 5 cm off                 float    a draft is off                      anchor   an anchor has moved                 lod      a design has no low twin
//   name     a design the library does not have  flat     a grounded piece is a floater       kit      the pier kit's numbers disagree      leak     the boot's list names the library
import './nice.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from '../js/core/ctx.js';
import { readAssetJson } from './headless.mjs';
import { SIZE, FLOAT, ANCHOR, WATER_MANIFESTS, WATER_TAG, assetKey, sizeOf } from '../js/world/waterlib.js';

const SAB = process.env.WL_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);
const clone = (o) => JSON.parse(JSON.stringify(o));
const near = (a, b, tol = 1e-6) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);

/** The library's files, and the tables of waterlib.js as the sabotages leave them. */
async function load() {
  const manifest = await readAssetJson(WATER_MANIFESTS[0]), anchors = (await readAssetJson('watersports/anchors.json')).assets;
  const assets = Object.fromEntries(manifest.files.flatMap((f) => Object.entries(f.assets)));
  const size = clone(SIZE), float = clone(FLOAT), anchor = clone(ANCHOR);
  if (on('size')) size.pier_deck[2] += 0.05;
  if (on('float')) float.diving_raft.draft += 0.1;
  if (on('anchor')) anchor.lancha.moorBow[2] += 0.2;
  if (on('lod')) delete assets[assetKey('pier_post')].lod1;
  if (on('name')) size.pier_chair = [1, 1, 1];
  if (on('flat')) float.pier_pile = { draft: 0.1, bob: 0.02, rock: 1 };
  if (on('kit')) { anchor.pier_pile.deckSeat[1] -= 0.3; anchor.pier_lamp.light[1] = 3.2; }
  return { manifest, anchors, assets, size, float, anchor };
}

test('every size the world uses is the library\'s, and every design is in the library', async () => {
  const { assets, size } = await load();
  assert.ok(Object.keys(size).length >= 27, 'the tables hold the 27 designs of the pier, the floaters, the boats and the seabed');
  for (const [name, s] of Object.entries(size)) {
    const e = assets[assetKey(name)];
    assert.ok(e, `${assetKey(name)} is not in manifest.watersports.json`);
    assert.ok(near(e.size, s), `${name}: the table says ${s}, the library ${e.size}`);
  }
  assert.deepEqual(sizeOf('watersports_lancha'), [2.1, 1.6, 7], 'sizeOf takes the library\'s own name as well');
});

test('every design has a low twin with fewer triangles: the town\'s instancing skips a design without one, and the prop would never be drawn', async () => {
  const { assets, size } = await load();
  for (const name of Object.keys(size)) {
    const e = assets[assetKey(name)], low = assets[e.lod1];
    assert.equal(typeof e.lod1, 'string', `${name} names its low twin`);
    assert.ok(low, `${e.lod1} is in the library`);
    assert.ok(low.triangles < e.triangles, `${name}: ${low.triangles} triangles at the low twin, ${e.triangles} at the near`);
    assert.ok(near(low.size, e.size, 0.02), `${name}: the twin is the same size`);
    assert.ok(e.tags.includes(WATER_TAG) && low.tags.includes(WATER_TAG), `${name} and its twin carry the library's tag`);
  }
});

test('the floaters: the draft, bob and rock are the library\'s, and every floater the world uses is in the table and nothing else is', async () => {
  const { anchors, float, size } = await load();
  for (const [name, f] of Object.entries(float)) {
    const a = anchors[assetKey(name)];
    assert.ok(a?.floating, `${name} floats in the library`);
    assert.equal(f.draft, a.draftDepth, `${name} draft`); assert.equal(f.bob, a.bobAmplitude, `${name} bob`); assert.equal(f.rock, a.rockAmplitudeDeg, `${name} rock`);
  }
  for (const name of Object.keys(size)) assert.equal(!!float[name], !!anchors[assetKey(name)].floating, `${name}: the table and the library agree on whether it floats`);
});

test('the anchors the plan stands on are the library\'s, to the millimetre', async () => {
  const { anchors, anchor } = await load();
  for (const [name, set] of Object.entries(anchor)) for (const [key, value] of Object.entries(set)) {
    assert.deepEqual(anchors[assetKey(name)]?.[key], value, `${name}.${key} is not where the library has it`);
  }
});

test('the pier kit fits together: the deck is a deck\'s thickness, the pile reaches it, the lamp\'s light is in the lamp, the ladders end on the decks, the brace spans a bent', async () => {
  const { anchor, size } = await load();
  assert.equal(anchor.pier_deck.stand[1], size.pier_deck[1], 'a deck module\'s top is its own height (it stands on its floor-centre origin)');
  assert.equal(anchor.pier_pile.deckSeat[1], size.pier_pile[1], 'the pile\'s seat is its top');
  assert.ok(anchor.pier_lamp.light[1] < size.pier_lamp[1], 'the lamp\'s light is inside the lamp');
  assert.equal(anchor.pier_end_platform.ladder.end[1], anchor.pier_end_platform.stand[1], 'the platform\'s ladder ends at its deck');
  assert.equal(anchor.diving_raft.ladder.end[1], anchor.diving_raft.stand[1], 'the raft\'s ladder ends at its deck');
  const L = anchor.pier_ladder.ladder, span = L.end[1] - L.start[1];
  assert.ok(span > 2 && span < size.pier_ladder[1], `the pier ladder climbs ${span.toFixed(2)} m`);
  const B = anchor.pier_crossbrace, dx = B.joinEnd[0] - B.joinStart[0];
  assert.ok(dx > 2.2 && dx < size.pier_crossbrace[0], `the crossbrace spans ${dx.toFixed(2)} m, a bent is 2.4 m between its piles' centres`);
  assert.ok(size.pier_pile[0] < 0.4 && size.pier_handrail[0] === 2, 'a pile is a thin post and a handrail is 2 m, the plan\'s post spacing');
});

test('the library is not in the boot registry: only a later sector adds it, and the boot\'s manifest list does not name it', async () => {
  const ctx = createContext({ headless: true });
  await ctx.assets.init(readAssetJson);
  const list = (await readAssetJson('manifest.json')).files;
  if (on('leak')) { list.push(...WATER_MANIFESTS); await ctx.assets.extend(WATER_MANIFESTS, readAssetJson); }
  assert.deepEqual(ctx.assets.names(WATER_TAG), [], 'no water prop before a sector asks for the library');
  assert.ok(!list.some((f) => WATER_MANIFESTS.includes(f)), 'manifest.json does not list the water-sports library');
  await ctx.assets.extend(WATER_MANIFESTS, readAssetJson);
  assert.equal(ctx.assets.names(WATER_TAG).length, 82, 'asked for, it brings its 41 designs and a low twin of each');
  assert.ok(Object.keys(SIZE).every((n) => ctx.assets.meta(assetKey(n))?.glb), 'every design of the tables is registered with the file that holds it');
});
