// The beach's props, drawn (A5, js/world/beachprops.js, dev/FEATURE-BEACH.md phase 2a): the real Codex GLBs, read from disk, through the town's instancing (js/world/clutter.js) with the plan of the
// promenade (beachfront.js) placed on them. No browser: a headless context, the manifests and GLBs parsed from the repo, the same Clutter the page builds.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-beachprops.test.mjs
// Every check has a deliberately broken input selected by BP_SABOTAGE=<id>|all, and each must then FAIL:
//   leak     the boot reads the library with the rest        noext    the library never reaches the registry       nofile   one of the three GLBs does not arrive     nolod    the civic file has lost its low twins
//   badmat   the town has no cut-out material                stray    the plan holds a prop the library lacks      many     twenty times the props                    stuck    the camera never leaves the deck
//   collide  the beach's Clutter is built without its id     sametag  ... without its tag
import './nice.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { createContext } from '../js/core/ctx.js';
import { generatePlan } from '../js/world/plan.js';
import { readAssetJson, loadClutterFromDisk, ROOT } from './headless.mjs';
import { planFront } from '../js/world/beachfront.js';
import { loadBeachProps, BEACH_TAG, BEACH_ID } from '../js/world/beachprops.js';
import { BEACH_MANIFESTS } from '../js/world/beachlib.js';
import { Clutter } from '../js/world/clutter.js';

const SAB = process.env.BP_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);
const SEED = 20261029;
const FILES = ['beach_props/beach_civic.glb', 'beach_props/beach_leisure.glb', 'beach_props/beach_shore.glb'];

/** A GLB of assets/models parsed from disk and registered where ctx.assets.load would leave it. */
async function parse(ctx, path) {
  const b = await readFile(resolve(ROOT, 'assets/models', path));
  const gl = await ctx.assets.loader.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
  gl.scene.updateMatrixWorld(true); ctx.assets.loaded.set(path, gl); return gl;
}

/** The page's own steps, from disk: manifests read from assets/models, GLBs parsed and registered in ctx.assets.loaded; the sabotages break the input here. */
async function drawn() {
  const ctx = createContext({ seed: SEED, headless: true });
  await ctx.assets.init(readAssetJson);
  const plan = generatePlan(ctx), front = planFront(plan.coast);
  if (on('stray')) front.items.push({ ...front.items[0], key: 'beach_not_in_the_library' });
  if (on('many')) { const one = front.items.slice(); for (let i = 0; i < 19; i++) front.items.push(...one); }
  if (on('badmat')) ctx.matlib.defs = { ...ctx.matlib.defs, beach_props_alpha: undefined };
  ctx.camera = new THREE.PerspectiveCamera(); ctx.camera.position.set(6, 1.7, 106);
  const loads = [];
  const load = async (path) => {
    loads.push(path);
    if (on('nofile') && /beach_shore/.test(path)) throw new Error('the file did not arrive');
    const gl = await parse(ctx, path);
    if (on('nolod') && /beach_civic/.test(path)) for (const o of [...gl.scene.children]) if (/_lod1$/.test(o.name)) o.removeFromParent();
    return gl;
  };
  const C = await loadBeachProps(ctx, front, { read: on('noext') ? async () => null : readAssetJson, load, hidden: true });
  return { ctx, front, C, loads };
}

test('the library is not in the boot registry: only a later sector adds it, and the boot\'s manifest list does not name it', async () => {
  const ctx = createContext({ headless: true });
  await ctx.assets.init(readAssetJson);
  const list = (await readAssetJson('manifest.json')).files;
  if (on('leak')) { list.push(...BEACH_MANIFESTS); await ctx.assets.extend(BEACH_MANIFESTS, readAssetJson); }
  assert.deepEqual(ctx.assets.names(BEACH_TAG), [], 'no beach prop before a sector asks for the library');
  assert.ok(!list.some((f) => BEACH_MANIFESTS.includes(f)), 'manifest.json does not list the beach library');
  await ctx.assets.extend(BEACH_MANIFESTS, readAssetJson);
  assert.equal(ctx.assets.names(BEACH_TAG).length, 97, 'asked for, it brings its 97 props');
  assert.equal(ctx.assets.names(BEACH_TAG + '-lod').length, 97, 'and a low twin of each');
});

test('every prop the plan places is drawn: the three files load, no item is skipped, and nothing is hidden by a missing node', async () => {
  const { ctx, front, C, loads } = await drawn();
  assert.ok(C, 'the props were made');
  assert.deepEqual([...new Set(loads)].sort(), FILES, 'the library\'s three files, each once');
  assert.equal(C.loadStatus.failed.length, 0, 'no file failed');
  assert.equal(ctx.world[BEACH_ID].skipped, 0, 'no item of the plan was left out');
  assert.equal(C.stats.placed, front.items.length, 'every item is an instance');
  for (const key of new Set(front.items.map((i) => i.key))) assert.ok(C.has(key), `${key} has a near and a low model in the library`);
});

test('every part of every prop has a material the town has (the atlas, or its cut-out twin), and the groups are named for the beach', async () => {
  const { ctx, C } = await drawn();
  assert.ok(C, 'the props were made');
  const keys = new Set();
  for (const type of C.types.values()) for (const lod of type.parts) for (const p of lod) keys.add(p.matKey);
  assert.deepEqual([...keys].sort(), ['beach_props', 'beach_props_alpha']);
  for (const k of keys) assert.ok(ctx.matlib.has(k), `the town has no material "${k}"`);
  assert.equal(C.group.name, 'props.beachprops');
  assert.ok(C.batches.every((m) => m.name.startsWith('beachprops:') && m.isInstancedMesh));
});

test('the beach is drawn by distance: from the deck the near props are near and the far ones low, and from far away nothing is drawn; a teleport refreshes at once', async () => {
  const { ctx, C } = await drawn();
  assert.ok(C, 'the props were made');
  const here = { ...C.stats };
  assert.ok(here.near > 20 && here.far > 20, `near ${here.near}, far ${here.far}: both models are in use from the deck`);
  assert.equal(here.near + here.far + here.culled, C.records.length);
  const go = (z) => { ctx.camera.position.set(6, 1.7, z); ctx.events.emit('player:teleport', {}); };
  if (!on('stuck')) go(600);
  assert.equal(C.stats.near + C.stats.far, 0, 'nothing is drawn from 500 m away');
  assert.equal(C.batches.filter((m) => m.visible).length, 0, 'no instanced mesh is visible then');
  go(106);
  const back = { near: C.stats.near, far: C.stats.far };
  assert.equal(back.near, here.near, 'and back on the deck the same props are near');
  assert.ok(back.far >= here.far - 10 && back.far <= here.far, `and nearly the same far (${back.far}; ${here.far} the first time, which the swap's 2 m of hysteresis rounds up)`);
  go(600); go(106);
  assert.deepEqual({ near: C.stats.near, far: C.stats.far }, back, 'a teleport away and back always lands in the same state');
});

test('a budget: the instanced meshes, and the triangles of the whole library at its near model', async () => {
  const { C, front } = await drawn();
  assert.ok(C, 'the props were made');
  let all = 0; for (const type of C.types.values()) all += type.records.length * type.triangles[0];
  // measured with the plan as it stands: 344 props of 64 designs, 168 instanced meshes, 160 k triangles if every prop were at its near model, 59 k from the deck (66 k the most, from the sand at x 60)
  assert.ok(C.batches.length <= 220, `${C.batches.length} instanced meshes (one per prop, part and level; 168 when written)`);
  assert.ok(all < 250000, `${(all / 1000).toFixed(0)} k triangles with every prop at its near model (the plan has ${front.items.length} props; 160 k when written)`);
  assert.ok(C.stats.triangles < 100000, `${(C.stats.triangles / 1000).toFixed(0)} k triangles from the deck (59 k when written)`);
});

test('the beach is a second Clutter beside the town\'s: each has its own group, system, stats and names, and the town\'s own are as they always were', async () => {
  const ctx = createContext({ seed: SEED, headless: true });
  await ctx.assets.init(readAssetJson);
  await ctx.assets.extend(BEACH_MANIFESTS, readAssetJson);
  const town = await loadClutterFromDisk(ctx);                                                // the page's own: tag 'clutter', id 'clutter'
  for (const p of FILES) await parse(ctx, p);
  ctx.camera = new THREE.PerspectiveCamera(); ctx.camera.position.set(0, 1.7, 0);
  const beach = new Clutter(ctx, { tag: on('sametag') ? undefined : BEACH_TAG, id: on('collide') ? undefined : BEACH_ID });
  assert.ok(town.has('clutter_chair') && !town.has('beach_bench'), 'the town\'s holds its own library');
  assert.ok(beach.has('beach_bench') && !beach.has('clutter_chair'), 'the beach\'s holds the beach\'s');
  assert.ok(town.place('clutter_chair', 1, 0, 0) && beach.place('beach_bench', -1, 0, 0));
  town.finalize(); beach.finalize();
  assert.equal(town.group.name, 'props.clutter'); assert.equal(beach.group.name, 'props.beachprops');
  assert.ok(town.batches.every((m) => m.name.startsWith('clutter:')) && beach.batches.every((m) => m.name.startsWith('beachprops:')), 'their meshes are named for their own');
  assert.equal(ctx.world.clutter, town.stats); assert.equal(ctx.world.beachprops, beach.stats);
  assert.equal(ctx.world.clutter.placed, 1); assert.equal(ctx.world.beachprops.placed, 1);
  assert.deepEqual(ctx.systems.filter((s) => s.name === 'clutter' || s.name === 'beachprops').map((s) => s.name).sort(), ['beachprops', 'clutter'], 'one system each');
  assert.deepEqual(ctx.scene.children.filter((o) => /^props\.(clutter|beachprops)$/.test(o.name)).map((o) => o.name).sort(), ['props.beachprops', 'props.clutter'], 'both groups are in the scene');
});
