// The sea's set pieces, drawn (A5, js/world/waterprops.js, dev/FEATURE-BEACH.md phase 2b): the real Codex GLBs, read from disk, through the town's instancing (js/world/clutter.js) with the plan of the sea
// (beachsea.js) placed on them. No browser: a headless context, the manifest and GLBs parsed from the repo, the same Clutters the page builds.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-waterprops.test.mjs
// Every check has a deliberately broken input selected by WP_SABOTAGE=<id>|all, and each must then FAIL:
//   noext    the library never reaches the registry      nofile   the boats' file does not arrive         nolod    the pier's file has lost its low twins     stray    the plan holds a piece the library lacks
//   badmat   the town has no window material              noonly   each Clutter builds the whole library    collide  the two Clutters are built without ids      nosystem the swell's system is never registered
//   norope   the mooring lines are not drawn               nolight  the lamps have no light                  frozen   the swell does not move the floaters       stuck    the camera never leaves the deck
import './nice.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { createContext } from '../js/core/ctx.js';
import { generatePlan } from '../js/world/plan.js';
import { readAssetJson, ROOT } from './headless.mjs';
import { planSea } from '../js/world/beachsea.js';
import { loadWaterProps, ROPES_ID } from '../js/world/waterprops.js';
import { WATER_MANIFESTS, WATER_TAG, WATER_ID, FLOAT_ID } from '../js/world/waterlib.js';
import { Clutter } from '../js/world/clutter.js';
import { PIER, SEA } from '../js/world/coast.js';

const SAB = process.env.WP_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);
const SEED = 20261029;
const FILES = ['watersports/watersports_boats.glb', 'watersports/watersports_pier.glb'];

/** A GLB of assets/models parsed from disk and registered where ctx.assets.load would leave it. */
async function parse(ctx, path) {
  const b = await readFile(resolve(ROOT, 'assets/models', path));
  const gl = await ctx.assets.loader.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
  gl.scene.updateMatrixWorld(true); ctx.assets.loaded.set(path, gl); return gl;
}

/** A sea that moves: the water module's ctx.sea, as a function of a clock the checks turn. */
const fakeSea = (clock) => ({ get time() { return clock.t; }, level: (x, z, t = clock.t) => 0.25 * Math.sin(0.4 * x + 0.3 * z - 1.1 * t) });

/** The page's own steps, from disk: the manifest read from assets/models, the GLBs parsed and registered in ctx.assets.loaded; the sabotages break the input here. */
async function drawn() {
  const ctx = createContext({ seed: SEED, headless: true });
  await ctx.assets.init(readAssetJson);
  const plan = generatePlan(ctx), sea = planSea(plan.coast), ref = planSea(plan.coast), clock = { t: 0 };           // (ref: the plan as it is, whatever a sabotage does to the copy that is drawn)
  if (on('stray')) sea.items.push({ ...sea.items[0], key: 'watersports_not_in_the_library', float: undefined });
  if (on('norope')) sea.ropes = [];
  if (on('nolight')) sea.lamps = [];
  if (on('badmat')) ctx.matlib.defs = { ...ctx.matlib.defs, watersports_window: undefined };
  ctx.camera = new THREE.PerspectiveCamera(); ctx.camera.position.set(PIER.x + 6, 1.7, 150);
  ctx.sea = fakeSea(clock);
  const lights = []; ctx.lights = { add: (l) => lights.push(l), list: lights };
  const glows = []; ctx.glow = { add: (g) => glows.push(g) };
  const loads = [];
  const load = async (path) => {
    loads.push(path);
    if (on('nofile') && /boats/.test(path)) throw new Error('the file did not arrive');
    const gl = await parse(ctx, path);
    if (on('nolod') && /pier/.test(path)) for (const o of [...gl.scene.children]) if (/_lod1$/.test(o.name)) o.removeFromParent();
    return gl;
  };
  const systems0 = ctx.systems.length;
  const W = await loadWaterProps(ctx, sea, { read: on('noext') ? async () => null : readAssetJson, load, hidden: true });
  if (on('nosystem')) ctx.systems.splice(systems0, ctx.systems.length);
  return { ctx, sea, ref, W, loads, clock, lights, glows };
}

test('every piece of the plan is drawn: the pier\'s and the boats\' files load (not the boards\'), no piece is skipped, and nothing is hidden by a missing node', async () => {
  const { ctx, sea, W, loads } = await drawn();
  assert.ok(W, 'the pieces were made');
  assert.deepEqual([...new Set(loads)].sort(), FILES, 'the two files the plan needs, each once; the boards\' stay on disk');
  assert.deepEqual(ctx.world.waterprops.failed, [], 'no file failed');
  assert.equal(ctx.world.waterprops.skipped, 0, 'no piece of the plan was left out');
  assert.equal(ctx.world.waterprops.placed, sea.items.length, 'every piece is an instance');
  assert.equal(W.fixed.stats.placed + W.floating.stats.placed, sea.items.length);
  assert.equal(W.floaters.length, sea.items.filter((i) => i.float).length, 'and every floater is one the swell will move');
});

test('two Clutters share the library and each builds only its own designs: the fixed pieces\' and the floaters\', with their own groups, systems and stats', async () => {
  const { ctx, sea, W } = await drawn();
  assert.ok(W, 'the pieces were made');
  const keys = (list) => new Set(list.map((i) => i.key));
  assert.deepEqual([...W.fixed.types.keys()].sort(), [...keys(sea.items.filter((i) => !i.float))].sort(), 'the fixed one holds the designs it places and no other');
  assert.deepEqual([...W.floating.types.keys()].sort(), [...keys(sea.items.filter((i) => i.float))].sort(), 'the floaters\' holds theirs');
  assert.equal(W.fixed.group.name, 'props.' + WATER_ID); assert.equal(W.floating.group.name, 'props.' + FLOAT_ID); assert.equal(W.ropes.name, 'props.' + ROPES_ID);
  assert.ok(W.fixed.batches.every((m) => m.name.startsWith(WATER_ID + ':')) && W.floating.batches.every((m) => m.name.startsWith(FLOAT_ID + ':')), 'their meshes are named for their own');
  assert.equal(ctx.world[WATER_ID], W.fixed.stats); assert.equal(ctx.world[FLOAT_ID], W.floating.stats);
  const names = ctx.systems.map((s) => s.name);
  for (const id of [WATER_ID, FLOAT_ID, 'seafloat-pose']) assert.ok(names.includes(id), `a system called ${id}`);
  assert.ok(ctx.systems.find((s) => s.name === 'seafloat-pose').order > ctx.systems.find((s) => s.name === 'seafloat').order, 'the swell is posed after the instancing\'s own update');
  assert.deepEqual(ctx.scene.children.filter((o) => /^props\.(watersports|seafloat|searopes)$/.test(o.name)).map((o) => o.name).sort(), ['props.seafloat', 'props.searopes', 'props.watersports'], 'all three groups are in the scene');
  assert.ok([W.fixed.group, W.floating.group, W.ropes].every((g) => g.visible === false), 'hidden until the caller has warmed them');
});

test('every part of every piece has a material the town has (the atlas, its cut-out twin or its glass), and no mesh draws a texture it cannot bind', async () => {
  const { ctx, W } = await drawn();
  assert.ok(W, 'the pieces were made');
  const keys = new Set();
  for (const C of [W.fixed, W.floating]) for (const type of C.types.values()) for (const lod of type.parts) for (const p of lod) keys.add(p.matKey);
  assert.ok(keys.has('watersports_atlas'), 'the atlas');
  for (const k of keys) { assert.ok(/^watersports_(atlas|alpha|window|fabric)$/.test(k), `${k}: a material of the library`); assert.ok(ctx.matlib.has(k), `the town has no material "${k}"`); }
  const m = ctx.mat('watersports_window'), a = ctx.mat('watersports_alpha');
  assert.ok(m.transparent && m.opacity < 0.3 && m.depthWrite === false && m.side === THREE.DoubleSide, 'the glass blends, at the library\'s 0.24, without writing depth');
  assert.ok(a.alphaTest === 0.45 && a.side === THREE.DoubleSide, 'the painted names are cut out at the library\'s 0.45');
  for (const C of [W.fixed, W.floating]) for (const mesh of C.batches) assert.ok(mesh.geometry.attributes.color && mesh.material.vertexColors, `${mesh.name}: the library's vertex colours are used`);
});

test('the swell moves the floaters and nothing else: the buoys, the rope of floats and the boats ride the surface, the raft hardly breathes, the pier does not move', async () => {
  const { ctx, W, clock } = await drawn();
  assert.ok(W, 'the pieces were made');
  const snap = (C) => C.records.map((r) => r.matrix.elements.slice());
  const fixed0 = snap(W.fixed), float0 = snap(W.floating);
  const run = (t) => { clock.t = t; for (const s of ctx.systems.filter((q) => q.name === 'seafloat-pose')) s.fn(1 / 60, ctx); };
  if (!on('frozen')) run(2.5); else run(0);
  const float1 = snap(W.floating), moved = float1.filter((e, i) => e.some((v, k) => Math.abs(v - float0[i][k]) > 1e-6)).length;
  assert.ok(moved >= W.floaters.length - 1, `${moved} of ${W.floaters.length} floaters moved with the swell (the raft's bob may be near rest)`);
  assert.deepEqual(snap(W.fixed), fixed0, 'no fixed piece moved');
  for (const f of W.floaters) {
    const y = f.rec.matrix.elements[13];
    if (f.it.float.rig === 'rigid') assert.ok(Math.abs(y - SEA) <= f.it.float.bob + 1e-9, `${f.it.id}: the raft stays within its bob of rest`);
    else assert.ok(Math.abs(y - SEA) <= 0.26, `${f.it.id}: riding the surface (${(y - SEA).toFixed(3)} m)`);
  }
  // the moored boats' ropes: each runs from its cleat to the boat's ring as the boat is now, and keeps doing so as the sea moves on
  assert.equal(W.lines.length, 3, 'three mooring lines');
  assert.equal(W.ropes.children.length, 3);
  for (const t of [2.5, 5.1, 9.8]) {
    run(t);
    for (const { r, boat, mesh } of W.lines) {
      const a = new THREE.Vector3(0, 0, 0).applyMatrix4(mesh.matrix), b = new THREE.Vector3(0, 1, 0).applyMatrix4(mesh.matrix), ring = new THREE.Vector3(...r.anchor).applyMatrix4(boat.rec.matrix);
      assert.ok(a.distanceTo(new THREE.Vector3(...r.a)) < 1e-6, `${r.id} is made fast to its cleat`);
      assert.ok(b.distanceTo(ring) < 1e-6, `${r.id} runs to the boat's ring at t ${t} (${b.toArray().map((v) => v.toFixed(2))} against ${ring.toArray().map((v) => v.toFixed(2))})`);
    }
  }
});

test('the pier\'s lamps have their light and their halo, and the lights are the plan\'s', async () => {
  const { ref, lights, glows } = await drawn();
  assert.equal(ref.lamps.length, 10);
  assert.equal(lights.length, ref.lamps.length, 'a real light for each lamp');
  assert.equal(glows.length, ref.lamps.length, 'and a halo');
  for (const l of ref.lamps) assert.ok(lights.some((q) => Math.abs(q.x - l.light.x) < 1e-9 && Math.abs(q.y - l.light.y) < 1e-9 && Math.abs(q.z - l.light.z) < 1e-9 && q.kind === 'street'), `${l.id}'s light is where the lamp's head is`);
});

test('the sea is drawn by distance: from the pier the near pieces are near and the far ones low, from far away nothing is drawn, and a teleport refreshes at once', async () => {
  const { ctx, W } = await drawn();
  assert.ok(W, 'the pieces were made');
  const here = { fixed: { ...W.fixed.stats }, floating: { ...W.floating.stats } };
  assert.ok(here.fixed.near > 50 && here.fixed.far > 20, `the fixed pieces: near ${here.fixed.near}, far ${here.fixed.far}: both models are in use from the pier`);
  assert.ok(here.floating.near + here.floating.far > 20, `and the floaters: ${here.floating.near} near, ${here.floating.far} far`);
  const go = (z) => { ctx.camera.position.set(PIER.x + 6, 1.7, z); ctx.events.emit('player:teleport', {}); };
  if (!on('stuck')) go(900);
  assert.equal(W.fixed.stats.near + W.fixed.stats.far + W.floating.stats.near + W.floating.stats.far, 0, 'nothing is drawn from 750 m away');
  assert.equal([...W.fixed.batches, ...W.floating.batches].filter((m) => m.visible).length, 0, 'no instanced mesh is visible then');
  go(150);
  assert.equal(W.fixed.stats.near, here.fixed.near, 'and back on the pier the same pieces are near');
});

test('a budget: the instanced meshes, and the triangles of the whole sea at its near model and from the pier', async () => {
  const { W, sea } = await drawn();
  assert.ok(W, 'the pieces were made');
  let all = 0; for (const C of [W.fixed, W.floating]) for (const type of C.types.values()) all += type.records.length * type.triangles[0];
  const batches = W.fixed.batches.length + W.floating.batches.length;
  // measured with the plan as it stands: 406 pieces of 29 designs, 123 instanced meshes (one per design, part and level), 41 k triangles with every piece at its near model
  assert.ok(batches <= 160, `${batches} instanced meshes (one per design, part and level; 123 when written)`);
  assert.ok(all < 80000, `${(all / 1000).toFixed(0)} k triangles with every piece at its near model (the plan has ${sea.items.length} pieces; 41 k when written)`);
  assert.ok(W.fixed.stats.triangles + W.floating.stats.triangles < 40000, `${((W.fixed.stats.triangles + W.floating.stats.triangles) / 1000).toFixed(0)} k triangles from the pier`);
});

test('Clutter\'s `only` keeps an instance to its own designs, and two instances of one library do not collide', async () => {
  const ctx = createContext({ seed: SEED, headless: true });
  await ctx.assets.init(readAssetJson);
  await ctx.assets.extend(WATER_MANIFESTS, readAssetJson);
  for (const p of FILES) await parse(ctx, p);
  ctx.camera = new THREE.PerspectiveCamera(); ctx.camera.position.set(0, 1.7, 0);
  const all = new Clutter(ctx, { tag: WATER_TAG, id: 'all' });
  const a = new Clutter(ctx, { tag: WATER_TAG, id: WATER_ID, only: ['watersports_buoy', 'watersports_oar'] });
  const b = new Clutter(ctx, { tag: WATER_TAG, id: on('collide') ? WATER_ID : FLOAT_ID, ...(on('noonly') ? {} : { only: ['watersports_lancha'] }) });
  assert.ok(all.types.size > 25, `without a filter it builds every design the loaded files hold (${all.types.size})`);
  assert.deepEqual([...a.types.keys()].sort(), ['watersports_buoy', 'watersports_oar'], 'with a filter, only those');
  assert.deepEqual([...b.types.keys()], ['watersports_lancha'], 'and the other instance of the same library holds its own');
  assert.ok(a.place('watersports_buoy', 1, 0, 0) && !a.place('watersports_lancha', 1, 0, 0), 'it places those and no other');
  assert.ok(b.place('watersports_lancha', -1, 0, 0) && !b.place('watersports_buoy', -1, 0, 0));
  a.finalize(); b.finalize();
  assert.notEqual(a.group.name, b.group.name, 'each has its own group');
  assert.notEqual(ctx.world[WATER_ID], ctx.world[FLOAT_ID], 'and its own stats');
  assert.equal(ctx.world[WATER_ID].placed, 1); assert.equal(ctx.world[FLOAT_ID].placed, 1);
  assert.equal(ctx.systems.filter((s) => s.name === WATER_ID || s.name === FLOAT_ID).length, 2, 'and one system each');
});
