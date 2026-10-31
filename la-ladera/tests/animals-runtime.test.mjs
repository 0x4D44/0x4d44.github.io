// Real Three.js objects and the existing Npc/Physics walker; no WebGL required.
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/animals-runtime.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createContext } from '../js/core/ctx.js';
import { makeRng } from '../js/core/rng.js';
import { Npc, BODY } from '../js/people/npc.js';
import { NavGraph } from '../js/people/nav.js';
import { PeopleWorld } from '../js/people/world.js';
import { loadAnimalLibrary, instantiateAnimal, SPECIES } from '../js/animals/library.js';
import { makeAnimalWalker } from '../js/animals/path.js';
import { loadAnimals, ANIMAL_LIMITS } from '../js/animals/index.js';

function fixture() {
  const ctx = createContext({ headless: true, seed: 283 }); ctx.physics.setTerrain(() => 0); ctx.plan = { spawn: { x: 0, z: 0 } };
  const nav = new NavGraph();
  for (let z = 0; z <= 40; z += 5) for (let x = 0; x <= 40; x += 5) {
    const i = nav.add(x, 0, z, 'street', { w: 2.5 });
    if (x > 0) nav.link(i, i - 1); if (z > 0) nav.link(i, i - 9);
  }
  const world = { ready: true, t: 0, nav, physics: ctx.physics, player: { x: 0, y: 0, z: 0 }, inMain: () => true,
    near: () => [], waypoints: PeopleWorld.prototype.waypoints, addPathFollower: PeopleWorld.prototype.addPathFollower };
  ctx.people = { _world: world };
  const manifest = { version: 1, animals: {} }, glbs = new Map();
  for (const key of SPECIES) {
    manifest.animals[key] = { glb: `animals/${key}.glb`, lod: `animals/${key}_lod.glb`, node: key, radius: 0.2, height: 0.6, speed: 0.7, caged: key.endsWith('_caged') };
    for (const far of [false, true]) {
      const scene = new THREE.Group(), node = new THREE.Group(), material = new THREE.MeshStandardMaterial(); material.name = 'fur';
      node.name = key + (far ? '_lod' : '');
      node.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), material)); scene.add(node);
      const animations = ['idle', 'walk', 'eat'].map((name, i) => new THREE.AnimationClip(name, 1,
        [new THREE.NumberKeyframeTrack(`${node.name}.rotation[y]`, [0, 0.5, 1], [0, 0.08 + i * 0.03, 0])]));
      glbs.set(`animals/${node.name}.glb`, { scene, animations });
    }
  }
  return { ctx, world, manifest, glbs, options: { read: async () => manifest, load: async (path) => glbs.get(path) } };
}

function advance(world, seconds) {
  for (let i = 0; i < Math.round(seconds * 30); i++) { world.t += 1 / 30; for (const fn of world._pathFollowers ?? []) fn(1 / 30, world); }
}

test('missing manifest, missing GLB and malformed clips leave the original world untouched', async () => {
  for (const mode of ['manifest', 'missing', 'throw', 'clips', 'material', 'far-budget']) {
    const f = fixture(), { ctx, world, options } = f;
    if (mode === 'manifest') options.read = async () => null;
    if (mode === 'missing') f.glbs.delete('animals/canary_caged_lod.glb');
    if (mode === 'throw') options.load = async () => { throw new Error('404'); };
    if (mode === 'clips') f.glbs.get('animals/cat.glb').animations.pop();
    if (mode === 'material') f.glbs.get('animals/dog.glb').scene.children[0].children[0].material.name = 'unregistered_animal';
    if (mode === 'far-budget') f.glbs.get('animals/mule_lod.glb').scene.children[0].children[0].geometry = new THREE.SphereGeometry(1, 40, 40);
    const before = { children: [...ctx.scene.children], rng: ctx.rng.s, mats: ctx.matlib.cache.size, systems: [...ctx.systems], walls: ctx.physics.walls.length };
    assert.equal(await loadAnimals(ctx, options), null, mode);
    assert.deepEqual(ctx.scene.children, before.children, mode); assert.equal(ctx.rng.s, before.rng, mode);
    assert.equal(ctx.matlib.cache.size, before.mats, mode); assert.deepEqual(ctx.systems, before.systems, mode);
    assert.equal(ctx.physics.walls.length, before.walls, mode); assert.equal(ctx.animals, undefined, mode);
    assert.equal(world._pathFollowers, undefined, mode);
  }
});

test('optional loading times out without attaching a late library', async () => {
  const f = fixture(); let release, loadCount = 0;
  const hanging = new Promise((resolve) => { release = resolve; });
  const keepAlive = setTimeout(() => {}, 50);
  try {
    assert.equal(await loadAnimals(f.ctx, { ...f.options, read: () => hanging, load: async (path) => { loadCount++; return f.glbs.get(path); }, timeout: 5 }), null);
    release(f.manifest); await new Promise((r) => setImmediate(r));
    assert.equal(f.ctx.animals, undefined); assert.equal(f.world._pathFollowers, undefined); assert.equal(loadCount, 0, 'late manifests must not begin GLB downloads');
  } finally { clearTimeout(keepAlive); }
});

test('default optional requests are aborted on timeout', async () => {
  const f = fixture(), originalFetch = globalThis.fetch; let requestedSignal;
  globalThis.fetch = (url, { signal }) => {
    requestedSignal = signal;
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  };
  const keepAlive = setTimeout(() => {}, 50);
  try {
    assert.equal(await loadAnimalLibrary(f.ctx, { timeout: 5 }), null);
    assert.equal(requestedSignal.aborted, true);
    assert.equal(f.ctx.scene.children.length, 0); assert.equal(f.ctx.matlib.cache.size, 0);
  } finally { globalThis.fetch = originalFetch; clearTimeout(keepAlive); }
});

test('all species are loaded atomically and clones have independent poses and shared materials', async () => {
  const f = fixture(), bank = await loadAnimalLibrary(f.ctx, f.options);
  assert.deepEqual([...bank.keys()], SPECIES);
  const a = instantiateAnimal(f.ctx, bank.get('dog')), b = instantiateAnimal(f.ctx, bank.get('dog'));
  const nodeA = a.near.getObjectByName('dog'), nodeB = b.near.getObjectByName('dog');
  assert.notEqual(nodeA, nodeB); assert.equal(nodeA.children[0].geometry, nodeB.children[0].geometry);
  assert.equal(nodeA.children[0].material, f.ctx.mat('fur')); assert.equal(nodeA.children[0].material, nodeB.children[0].material);
  a.play('eat'); a.update(0.2, false);
  assert.notEqual(nodeA.rotation.y, nodeB.rotation.y);
  b.update(0.2, true); assert.equal(b.near.visible, false); assert.equal(b.far.visible, true);
  assert.equal(b.mixer.time, 0, 'far LOD must not evaluate the near skeleton');
  a.dispose(); b.dispose();
});

test('people retain their existing BODY and movement when no animal override is supplied', () => {
  const f = fixture(), bodies = [], physics = { move(s, dx, dz, dt, body) { s.x += dx; s.z += dz; bodies.push(body); } };
  const svc = { t: 0, physics, near: () => [], brain: { next(n, w) { n.stand(w, 'idle', 5); }, unstick() {} } };
  const a = new Npc({ rng: makeRng(19) }), b = new Npc({ rng: makeRng(19), body: BODY });
  for (const n of [a, b]) { n.place(0, 0, 0); n.walk(svc, [{ x: 0, y: 0, z: 4 }]); }
  for (let i = 0; i < 60; i++) { svc.t += 1 / 30; a.step(1 / 30, svc); b.step(1 / 30, svc); }
  assert.deepEqual(a.st, b.st); assert.equal(a.mode, b.mode); assert.ok(bodies.every((body) => body === BODY));
  const animal = makeAnimalWalker(f.world, { id: 'dog', meta: { radius: 0.17, height: 0.5 }, position: { x: 0, y: 0, z: 0 }, rng: makeRng(9) });
  assert.equal(animal.npc.body.radius, 0.17); assert.equal(BODY.radius, 0.25);
});

test('animal path hook uses existing A*, waypoints, Npc walker, and arrival continuation', () => {
  const f = fixture(); let paths = 0, waypoints = 0, arrived = 0;
  const originalPath = f.world.nav.path.bind(f.world.nav), originalWaypoints = f.world.waypoints.bind(f.world);
  f.world.nav.path = (...args) => { paths++; return originalPath(...args); };
  f.world.waypoints = (...args) => { waypoints++; return originalWaypoints(...args); };
  const follower = makeAnimalWalker(f.world, { id: 'dog', meta: { speed: 1 }, position: { x: 0, y: 0, z: 0 }, rng: makeRng(9) });
  assert.equal(follower.follow(1, () => arrived++), true); assert.equal(paths, 1); assert.equal(waypoints, 1);
  for (let i = 0; i < 360; i++) { f.world.t += 1 / 30; follower.step(1 / 30); }
  assert.equal(arrived, 1); assert.ok(Math.abs(follower.npc.x - 5) < 0.35); assert.equal(follower.npc.y, 0);
  assert.ok(Math.sin(follower.npc.ry) > 0.99, '+Z-facing animal turns toward +X movement without the people mesh pi correction');
  assert.equal(follower.follow(99999), false); assert.equal(follower.follow(NaN), false);
});

test('successful loading attaches one passive callback, keeps people/RNG/physics unchanged and places all species', async () => {
  const f = fixture(), seed = f.ctx.rng.s;
  const api = await loadAnimals(f.ctx, f.options);
  assert.ok(api); assert.equal(api.stats().count, ANIMAL_LIMITS.count);
  assert.deepEqual(new Set(api.list().map((a) => a.species)), new Set(SPECIES));
  assert.equal(f.world._pathFollowers.size, 1); assert.equal(f.ctx.systems.length, 0); assert.equal(f.ctx.rng.s, seed);
  assert.equal(f.ctx.physics.walls.length, 0); assert.equal(f.world.npcs, undefined);
  assert.equal(await loadAnimals(f.ctx, f.options), api, 'loading twice must not duplicate actors');
  const cages = api.list().filter((a) => a.caged).map(({ x, y, z }) => ({ x, y, z }));
  advance(f.world, 30);
  assert.deepEqual(api.list().filter((a) => a.caged).map(({ x, y, z }) => ({ x, y, z })), cages);
  assert.ok(api.stats().near <= ANIMAL_LIMITS.maxNear);
  assert.ok(api.stats().triangles <= api.stats().triangleCeiling);
  assert.equal(api.stats().triangleCeiling, 19200);
  assert.equal(api.stats().drawCalls, api.stats().visible, 'one draw in each fixture LOD');
  f.world.player.x = 300; advance(f.world, 1);
  assert.equal(api.stats().visible, 0);
  api.dispose(); assert.equal(f.world._pathFollowers.size, 0); assert.equal(f.ctx.scene.children.length, 0); assert.equal(f.ctx.animals, undefined);
  const replacement = await loadAnimals(f.ctx, f.options); api.dispose();
  assert.equal(f.ctx.animals, replacement); assert.equal(f.world._pathFollowers.size, 1, 'disposing an old handle must not affect a replacement');
  replacement.dispose();
});

test('LOD follows the camera in three dimensions even when the player stays elsewhere', async () => {
  const f = fixture(); f.ctx.camera = new THREE.PerspectiveCamera();
  const api = await loadAnimals(f.ctx, f.options), first = api.list()[0];
  f.world.player.x = 300; f.ctx.camera.position.set(first.x, first.y + 1.5, first.z);
  advance(f.world, 0.1);
  assert.equal(api.list()[0].visible, true); assert.equal(api.list()[0].lod, false);
  f.ctx.camera.position.y = first.y + ANIMAL_LIMITS.near + 1;
  advance(f.world, 0.1); assert.equal(api.list()[0].lod, true);
  f.ctx.camera.position.y = first.y + ANIMAL_LIMITS.far + 1;
  advance(f.world, 0.1); assert.equal(api.stats().visible, 0);
  api.dispose(); advance(f.world, 1); assert.equal(f.world._pathFollowers.size, 0);
});

test('absent or disabled people world does not fetch or create a substitute simulation', async () => {
  const f = fixture(); f.ctx.people = null;
  assert.equal(await loadAnimals(f.ctx, { read: () => { throw new Error('must not fetch'); } }), null);
  assert.equal(f.ctx.systems.length, 0); assert.equal(f.ctx.scene.children.length, 0); assert.equal(f.ctx.animals, undefined);
});

test('skip=animals preserves the baseline without fetching the manifest', async () => {
  const f = fixture(); f.ctx.opts.skip = new Set(['animals']);
  assert.equal(await loadAnimals(f.ctx, { read: () => { throw new Error('must not fetch'); } }), null);
  assert.equal(f.world._pathFollowers, undefined); assert.equal(f.ctx.scene.children.length, 0);
});
