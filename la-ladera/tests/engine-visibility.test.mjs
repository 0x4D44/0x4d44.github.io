// The hidden-subtree matrix skip of engine/visibility.js (owner: A1), on plain three objects under Node.
// three never draws anything below an object with visible = false, but Object3D.updateMatrixWorld walks all of it every frame: the interiors are 6000 of the
// 10000 objects of the scene, and the people hide whoever is out of sight. Visibility makes the scene (and any crowd-like top-level group) pass over hidden
// children and bring them up to date, in full, the first frame they are visible again. The picture must not change: every object that can be seen has
// exactly the matrix plain three gives it.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-visibility.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Visibility } from '../js/engine/visibility.js';

/** world (visible, frozen meshes), five interiors, a crowd of 20 skeletons (10 objects each, the roots frozen like a rig at rest), a village of 20 one-object kids. */
function build() {
  const scene = new THREE.Scene(), all = [];
  const add = (parent, o, name) => { o.name = name; parent.add(o); all.push(o); return o; };
  const world = add(scene, new THREE.Group(), 'world');
  for (let i = 0; i < 3; i++) { const m = add(world, new THREE.Mesh(), 'wall' + i); m.matrixAutoUpdate = false; m.position.set(i, 0, 0); m.updateMatrix(); }
  for (let i = 0; i < 5; i++) {
    const g = add(scene, new THREE.Group(), `int${i}`); g.position.set(10 * i, 0, 0);
    for (let k = 0; k < 3; k++) { const f = add(g, new THREE.Group(), `int${i}.f${k}`); f.position.set(0, k, 0); for (let j = 0; j < 2; j++) add(f, new THREE.Mesh(), `int${i}.f${k}.m${j}`).position.set(j, 0, k); }
  }
  const crowd = add(scene, new THREE.Group(), 'crowd');
  for (let i = 0; i < 20; i++) { let p = add(crowd, new THREE.Group(), `npc${i}`); p.position.set(0, 0, 3 * i); for (let b = 0; b < 9; b++) { p = add(p, new THREE.Group(), `npc${i}.b${b}`); p.position.set(0, 0.2, 0); } }
  const village = add(scene, new THREE.Group(), 'village');
  for (let i = 0; i < 20; i++) add(village, new THREE.Mesh(), 'house' + i).position.set(i, 0, -5);
  const statue = add(scene, new THREE.Group(), 'statue');                                 // heavy but only three children: not a crowd
  for (let i = 0; i < 3; i++) { let p = add(statue, new THREE.Group(), `limb${i}`); for (let b = 0; b < 29; b++) { p = add(p, new THREE.Group(), `limb${i}.j${b}`); p.position.set(0, 0.1, 0); } }
  return { scene, all, by: Object.fromEntries(all.map((o) => [o.name, o])) };
}
const rig = (opts = {}) => { const a = build(), b = build(), vis = new Visibility({ scene: a.scene, opts, batch: { groups: new Map() } }); vis.collect(); return { a, b, vis, scene: a.scene, ref: b.scene }; };
const same = (x, y) => x.matrixWorld.elements.every((v, i) => v === y.matrixWorld.elements[i]);
const seen = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
/** Every object that can be seen (no hidden ancestor, itself included) has the matrix plain three computes; returns the names that do not. */
const wrong = (A, B) => A.all.filter((o, i) => seen(o) && !same(o, B.all[i])).map((o) => o.name);
const update = (r) => { r.scene.updateMatrixWorld(); r.ref.updateMatrixWorld(); };
const both = (r, fn) => { fn(r.a); fn(r.b); };

test('the scene and the crowd skip their hidden children; the buildings, the village and the interiors keep three\'s own walk', () => {
  const r = rig();
  assert.ok(r.scene.userData.skipHidden && r.scene.userData.skipHidden.on, 'the scene itself');
  assert.ok(r.a.by.crowd.userData.skipHidden, 'a group of 20 skeletons is a crowd');
  assert.ok(!r.a.by.village.userData.skipHidden, 'a group of 20 single objects is not');
  assert.ok(!r.a.by.statue.userData.skipHidden, 'nor is a group of three big limbs');
  assert.ok(!r.a.by.world.userData.skipHidden && !r.a.by.int0.userData.skipHidden, 'nor are a building or an interior');
  assert.equal(r.vis.skips.length, 2, 'the scene and the crowd, nothing else');
  assert.equal(r.vis.stats().matrixSkipped, 0, 'nothing hidden yet');
  const off = rig({ skipHidden: false });
  assert.ok(off.scene.userData.skipHidden && !off.scene.userData.skipHidden.on, '?skiphidden=0 installs it switched off');
});

test('a subtree that is hidden from the start still gets one complete update first (nothing ever reads an identity matrix)', () => {
  const a = build(), b = build();
  for (const S of [a, b]) { S.by.int3.visible = false; S.by.npc4.visible = false; }
  new Visibility({ scene: a.scene, opts: {}, batch: { groups: new Map() } }).collect();
  b.scene.updateMatrixWorld();
  assert.equal(a.by['int3.f2.m1'].matrixWorld.elements[12], 31, 'int3 stands at x = 30, the mesh is 1 m along it');
  assert.ok(same(a.by['int3.f2.m1'], b.by['int3.f2.m1']) && same(a.by['npc4.b8'], b.by['npc4.b8']), 'hidden from the start, valid anyway');
});

test('a hidden child is not walked while a visible one is, and the count says how many are being skipped', () => {
  const r = rig(), hid = r.a.by['int2.f1.m0'], vis = r.a.by['int3.f1.m0'];
  both(r, (S) => { S.by.int2.visible = false; }); update(r);
  const before = hid.matrixWorld.elements.slice();
  both(r, (S) => { S.by['int2.f1.m0'].position.x += 5; S.by['int3.f1.m0'].position.x += 5; });
  r.scene.updateMatrixWorld();
  assert.deepEqual(hid.matrixWorld.elements.slice(), before, 'inside a hidden interior nothing is recomputed');
  r.ref.updateMatrixWorld();
  assert.ok(same(vis, r.b.by['int3.f1.m0']), 'a visible interior is updated exactly as three does');
  assert.equal(r.vis.stats().matrixSkipped, 1, 'one hidden child of the scene is being skipped');
  both(r, (S) => { S.by.npc7.visible = false; S.by.npc9.visible = false; }); update(r);
  assert.equal(r.vis.stats().matrixSkipped, 3, 'and two hidden people');
});

test('on the first frame it shows again a hidden subtree is brought up to date in full', () => {
  const r = rig();
  both(r, (S) => { S.by.int1.visible = false; S.by.npc3.visible = false; }); update(r);
  both(r, (S) => { S.by['int1.f2.m1'].position.set(3, 4, 5); S.by.int1.rotation.y = 0.7; S.by.npc3.position.x = 9; S.by['npc3.b8'].position.y = 2; S.by.crowd.position.z = 11; S.by.world.position.x = -4; });
  update(r);
  both(r, (S) => { S.by.int1.visible = true; S.by.npc3.visible = true; });
  update(r);
  assert.deepEqual(wrong(r.a, r.b), [], 'everything that can be seen matches plain three');
  assert.ok(same(r.a.by['int1.f2.m1'], r.b.by['int1.f2.m1']) && same(r.a.by['npc3.b8'], r.b.by['npc3.b8']), 'down to the deepest objects');
  assert.equal(r.vis.stats().matrixSkipped, 0, 'and nothing stays skipped');
});

test('a hidden frozen root whose parent moved is recomputed against the new parent matrix when it shows (the revival is forced)', () => {
  const r = rig();
  both(r, (S) => { const npc = S.by.npc5; npc.matrixAutoUpdate = false; npc.updateMatrix(); });
  update(r);
  both(r, (S) => { S.by.npc5.visible = false; }); update(r);
  both(r, (S) => { S.by.crowd.position.set(100, 2, 50); S.by['npc5.b4'].position.x = 3; }); update(r);
  both(r, (S) => { S.by.npc5.visible = true; }); update(r);
  assert.deepEqual(wrong(r.a, r.b), [], 'a frozen rig does not stay where the crowd used to be');
  assert.equal(r.a.by.npc5.matrixWorld.elements[12], 100, 'it is under the crowd\'s new position');
});

test('any sequence of moves, hides and shows leaves every visible object exactly where plain three puts it', () => {
  const r = rig(); let seed = 20261029;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const roots = ['int0', 'int1', 'int2', 'int3', 'int4', ...Array.from({ length: 20 }, (_, i) => 'npc' + i), 'crowd', 'world', 'village'];
  for (let step = 0; step < 600; step++) {
    const pick = r.a.all[Math.floor(rnd() * r.a.all.length)].name, k = rnd(), v = [rnd() * 8, rnd() * 3, rnd() * 8], toggle = roots[Math.floor(rnd() * roots.length)];
    both(r, (S) => {
      const o = S.by[pick];
      if (k < 0.45 && o.matrixAutoUpdate) o.position.set(...v);
      else if (k < 0.6) o.rotation.y += v[0] * 0.1;
      else if (k < 0.9 && !/^(crowd|world|village)$/.test(toggle)) S.by[toggle].visible = !S.by[toggle].visible;
      else if (k < 0.93) S.scene.visible = true;
    });
    if (rnd() < 0.8) { update(r); assert.deepEqual(wrong(r.a, r.b), [], `after step ${step}`); }
  }
  update(r); assert.deepEqual(wrong(r.a, r.b), []);
  both(r, (S) => { for (const o of S.all) o.visible = true; }); update(r);
  assert.deepEqual(r.a.all.filter((o, i) => !same(o, r.b.all[i])).map((o) => o.name), [], 'with everything shown again, the whole scene is identical');
});

test('switching it off (and ?skiphidden=0) updates what was skipped, then walks everything like three', () => {
  const r = rig();
  both(r, (S) => { S.by.int4.visible = false; S.by.npc0.visible = false; }); update(r);
  both(r, (S) => { S.by['int4.f0.m0'].position.set(7, 7, 7); S.by['npc0.b3'].position.set(7, 7, 7); }); update(r);
  assert.ok(!same(r.a.by['int4.f0.m0'], r.b.by['int4.f0.m0']), 'sanity: skipped while hidden');
  r.vis.skipHiddenMatrices(false);
  assert.ok(same(r.a.by['int4.f0.m0'], r.b.by['int4.f0.m0']) && same(r.a.by['npc0.b3'], r.b.by['npc0.b3']), 'switching off brings them up to date at once');
  both(r, (S) => { S.by['int4.f0.m0'].position.set(1, 2, 3); }); update(r);
  assert.ok(same(r.a.by['int4.f0.m0'], r.b.by['int4.f0.m0']), 'and hidden objects are walked again');
  assert.equal(r.vis.stats().matrixSkipped, 0);
  r.vis.skipHiddenMatrices(true);
  both(r, (S) => { S.by['int4.f0.m0'].position.set(9, 9, 9); }); update(r);
  assert.ok(!same(r.a.by['int4.f0.m0'], r.b.by['int4.f0.m0']), 'switched on again, it skips again');
  assert.equal(r.vis.skips.length, 2, 'asking twice never wraps twice');
});

test('the walk leaves the scene as it found it: the same children arrays, even when an object throws', () => {
  const r = rig(), kids = r.scene.children, crowdKids = r.a.by.crowd.children, n = kids.length;
  both(r, (S) => { S.by.int0.visible = false; }); update(r);
  assert.ok(r.scene.children === kids && r.scene.children.length === n && r.a.by.crowd.children === crowdKids, 'the children arrays are the originals');
  r.a.by.world.updateMatrixWorld = () => { throw new Error('boom'); };
  assert.throws(() => r.scene.updateMatrixWorld(), /boom/);
  assert.ok(r.scene.children === kids && r.scene.children.length === n && kids.includes(r.a.by.int0), 'a throw does not leave the hidden children out of the scene');
});

test('a hidden child that is removed is forgotten, not kept alive', () => {
  const scene = new THREE.Scene(), vis = new Visibility({ scene, opts: {}, batch: { groups: new Map() } }), kids = [0, 1, 2].map(() => new THREE.Group());
  scene.add(...kids); vis.collect();
  for (const k of kids) k.visible = false;
  scene.updateMatrixWorld();
  assert.equal(scene.userData.skipHidden.stale.size, 3);
  scene.remove(kids[0]); scene.updateMatrixWorld();
  assert.ok(!scene.userData.skipHidden.stale.has(kids[0]) && scene.userData.skipHidden.stale.size === 2, 'the removed one is gone from the skipped set');
  assert.equal(vis.skippedNow(), 2, 'and the count follows');
});
