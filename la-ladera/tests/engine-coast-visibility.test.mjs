// The coast's visibility rule (A1, round 8, engine patch 4; dev/FEATURE-BEACH.md 2.4): js/engine/visibility.js `_coast()` and `_far()`, on plain three objects under Node.
// The beach's late groups (the props, the sea's three set-piece groups, the seabed, the shore's life) are units of the staged queue: built after the first frame, hidden while they warm, shown by their unit.
// The rule draws them (and lets them cast into the sun's shadow map) only while the camera's frustum meets the coast's box; and under the sea the camera's far plane is 60 m.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-coast-visibility.test.mjs
// Two inputs of the stubs can be broken, selected by C_SABOTAGE=<id>|all, and the checks that depend on them must then FAIL (the pattern of core-sea.test.mjs):
//   south   the views that look at the hill look at the beach instead      noname   one of the groups has a name of its own (a stranger's)
// (The rule's own constants and branches are held by the mutation runs of the commit message: each one changed in turn, each caught.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './nice.mjs';
import * as THREE from 'three';
import { Visibility, COAST } from '../js/engine/visibility.js';
import { UW } from '../js/engine/underwater.js';
import { BEACH_ID } from '../js/world/beachprops.js';
import { WATER_ID, FLOAT_ID } from '../js/world/waterlib.js';
import { ROPES_ID } from '../js/world/waterprops.js';

const SAB = process.env.C_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);

const NAMES = ['props.beachprops', 'props.watersports', 'props.seafloat', 'props.searopes', 'props.seabed', 'props.shorelife'];
const D2R = Math.PI / 180;
const NORTH = 0, WEST = 90, SOUTH = 180, EAST = -90;

/** A scene with the six groups (a mesh in each, as the units make them), the sea (which culls itself), a group that is none of them, and a camera. */
function rig(opts = {}) {
  const scene = new THREE.Scene(), by = {};
  const add = (name, cast = true) => { const g = new THREE.Group(); g.name = name; const m = new THREE.Mesh(); m.castShadow = cast; g.add(m); scene.add(g); by[name] = g; return g; };
  NAMES.forEach((n, i) => add(on('noname') && i === 2 ? 'props.stranger' : n));
  add('water'); add('props.clutter'); add('world.coast.deck');
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 900); scene.add(camera);
  const ctx = { scene, camera, look: { state: { uw: 0 } }, opts: {}, batch: { groups: new Map() }, ...opts };
  const vis = new Visibility(ctx);
  // look(x, y, z, yaw, pitch): the camera there (yaw 0 looks north, -z; 90 west; 180 south; -90 east: three turns the view about +y), then one frame of the rule
  const look = (x, y, z, yaw = 0, pitch = 0) => { camera.position.set(x, y, z); camera.rotation.set(pitch * D2R, (on('south') && yaw === 0 ? 180 : yaw) * D2R, 0, 'YXZ'); vis.update(0.016); return vis; };
  const shown = () => NAMES.filter((n) => by[n]?.visible);
  return { scene, by, camera, ctx, vis, look, shown };
}
const ALL = NAMES.slice();

test('the names are the ones the beach\'s units give their groups (a stranger\'s name is not the rule\'s business)', () => {
  assert.deepEqual([...COAST.GROUPS], NAMES, 'the rule lists the six groups of world/beach.js');
  assert.equal(`props.${BEACH_ID}`, 'props.beachprops', 'the props');
  assert.deepEqual([`props.${WATER_ID}`, `props.${FLOAT_ID}`, `props.${ROPES_ID}`], ['props.watersports', 'props.seafloat', 'props.searopes'], 'the sea\'s three groups of world/waterprops.js');
  for (const [file, name] of [['seabed.js', 'props.seabed'], ['shorelife.js', 'props.shorelife']]) {
    assert.ok(readFileSync(new URL(`../js/world/${file}`, import.meta.url), 'utf8').includes(`group.name = '${name}'`), `world/${file} names its group ${name}`);
  }
  const r = rig();
  r.look(0, 1.7, 92, NORTH);
  assert.deepEqual(r.shown(), [], 'looking at the hill, every group of the list is hidden');
  r.look(0, 1.7, 92, SOUTH);
  assert.equal(r.shown().length, 6, 'and looking at the beach every one of them is shown: each has the name the list has');
});

test('from the hill, looking north, none of the six is drawn; turning round shows them all; turning back hides them again (and the sea, the ground and the town\'s own groups are never touched)', () => {
  const r = rig();
  for (const [x, z] of [[0, 92], [-40, 60], [30, 30], [0, -50], [60, 99]]) {
    r.look(x, 1.7, z, 0);
    assert.deepEqual(r.shown(), [], `(${x}, ${z}) looking north: nothing of the coast`);
  }
  r.look(0, 1.7, 92, 180);
  assert.deepEqual(r.shown(), ALL, 'looking south from the spawn: all six');
  r.look(0, 1.7, 92, 0);
  assert.deepEqual(r.shown(), [], 'and north again: none');
  for (const n of ['water', 'props.clutter', 'world.coast.deck']) assert.equal(r.by[n].visible, true, `${n} is not the rule's`);
  assert.equal(r.vis.stats().coast.hidden, 6, 'the stats count what the rule hides');
  r.look(0, 1.7, 92, 180);
  assert.equal(r.vis.stats().coast.hidden, 0, 'and nothing when they are all shown');
});

test('the rule is the frustum\'s: from z 61 an oblique look east still has the beach in the corner of the picture, a look north-east has not', () => {
  const r = rig();
  for (const side of [EAST, WEST]) {
    r.look(0, 1.7, 61, side);
    assert.deepEqual(r.shown(), ALL, `looking ${side === EAST ? 'east' : 'west'}: the beach is in the near half of the picture (its edge is 45.7 degrees south of the heading)`);
    r.look(0, 1.7, 61, side / 2);
    assert.deepEqual(r.shown(), [], `looking north-${side === EAST ? 'east' : 'west'}: the picture's edge points a hair south of ${side === EAST ? 'east' : 'west'}, and the beach is 39 m further south: nothing`);
    r.look(0, 1.7, 61, side * 80 / 90);
    assert.deepEqual(r.shown(), ALL, `looking ten degrees north of ${side === EAST ? 'east' : 'west'}: the edge of the picture reaches the beach's near corner`);
    r.look(0, 1.7, 95, side, -20);
    assert.deepEqual(r.shown(), ALL, 'from the plot\'s south edge, looking along the promenade and well down: the sand is in the lower half');
  }
});

test('whatever the pose, a coast the camera can see is never hidden: 6,000 seeded poses against a grid of points over the coast\'s box', () => {
  const r = rig(), B = COAST.BOX, pts = [];
  for (let x = -B.x; x <= B.x; x += 20) for (const y of [B.y0, 2, 12, B.y1]) for (let z = B.z0; z <= B.z1; z += 10) pts.push(new THREE.Vector3(x, y, z));
  let a = 0x9E3779B9 >>> 0; const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const v = new THREE.Vector3(); let sees = 0, blind = 0;
  for (let k = 0; k < 6000; k++) {
    const x = (rnd() - 0.5) * 240, y = -5 + rnd() * 30, z = -110 + rnd() * 215, yaw = rnd() * 360, pitch = (rnd() - 0.5) * 120;
    r.look(x, y, z, yaw, pitch);
    r.camera.updateMatrixWorld();
    const visible = pts.some((p) => { v.copy(p).project(r.camera); return v.x >= -1 && v.x <= 1 && v.y >= -1 && v.y <= 1 && v.z >= -1 && v.z <= 1; });
    if (visible) { sees++; assert.deepEqual(r.shown(), ALL, `pose ${k} (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}) yaw ${yaw.toFixed(0)} pitch ${pitch.toFixed(0)}: a point of the coast is in the picture, so the groups are drawn`); } else blind++;
  }
  assert.ok(sees > 1200 && blind > 1200, `the poses are a fair mixture of seeing and not seeing (${sees} / ${blind})`);
});

test('a group that arrives after the first frame is judged in the frame it arrives: hidden at once when the beach is not in view, left alone when it is', () => {
  const r = rig();
  const late = new THREE.Group(); late.name = 'props.shorelife'; late.add(new THREE.Mesh());
  r.scene.remove(r.by['props.shorelife']); delete r.by['props.shorelife'];
  r.look(0, 1.7, 92, 0);
  assert.deepEqual(r.shown(), [], 'the other five are hidden');
  r.scene.add(late); r.by['props.shorelife'] = late;
  r.look(0, 1.7, 92, 0);
  assert.equal(late.visible, false, 'the newcomer is hidden in the very frame it is found');
  r.look(0, 1.7, 92, 180);
  assert.equal(late.visible, true, 'and shown with the rest');
  const later = new THREE.Group(); later.name = 'props.seabed'; r.scene.remove(r.by['props.seabed']); r.scene.add(later);
  r.look(0, 1.7, 92, 180);
  assert.equal(later.visible, true, 'a group that arrives while the beach is in view is simply drawn');
});

test('a unit that keeps its group hidden to warm it stays in charge: the rule neither shows it (in view) nor takes it (out of view); when the unit shows it, the rule judges it before the frame is drawn', () => {
  const r = rig(), warm = r.by['props.seabed'];
  warm.visible = false;                                                // world/beach.js: `hidden: !!lw`, LateWarm.warm(group), then `group.visible = true`
  r.look(0, 1.7, 92, 180);
  assert.equal(warm.visible, false, 'in view and still warming: the rule does not show it');
  assert.deepEqual(r.shown().length, 5, 'the others are drawn');
  r.look(0, 1.7, 92, 0);
  assert.equal(warm.visible, false, 'out of view: still the unit\'s');
  warm.visible = true;                                                 // the unit's `finally`, between two frames
  r.look(0, 1.7, 92, 0);
  assert.equal(warm.visible, false, 'the unit has shown it with the beach behind the camera: hidden by the rule in the same frame');
  r.look(0, 1.7, 92, 180);
  assert.equal(warm.visible, true, 'and drawn when the beach is in view again');
  warm.visible = false; r.look(0, 1.7, 92, 0); r.look(0, 1.7, 92, 180);
  assert.equal(warm.visible, false, 'a group the unit hides after the rule has shown it again is not shown again by the rule');
});

test('a group that is removed and made again (same name) is found again; a group that leaves the scene is let go; no group at all is no error', () => {
  const r = rig();
  r.look(0, 1.7, 92, 0);
  const old = r.by['props.seabed'], fresh = new THREE.Group(); fresh.name = 'props.seabed';
  r.scene.remove(old); r.scene.add(fresh);                             // (the same number of children: the rescan is the group's parent, not the count)
  old.visible = true;
  r.look(0, 1.7, 92, 0);
  assert.equal(fresh.visible, false, 'the new one is hidden');
  assert.equal(old.visible, true, 'the old one, out of the scene, is nobody\'s');
  r.look(0, 1.7, 92, 180);
  assert.equal(fresh.visible, true);
  const bare = rig(); for (const n of NAMES) bare.scene.remove(bare.by[n]);
  let pulls = 0; const pull = bare.camera.updateMatrixWorld.bind(bare.camera); bare.camera.updateMatrixWorld = (f) => { pulls++; pull(f); };
  assert.doesNotThrow(() => bare.look(0, 1.7, 92, 0));
  assert.equal(pulls, 0, 'with no group to judge the rule does no work (no matrix, no frustum)');
  const bareScene = new THREE.Scene(), lone = new THREE.Group(); lone.name = 'props.seabed'; bareScene.add(lone);
  const noCam = new Visibility({ scene: bareScene, opts: {}, batch: { groups: new Map() } });
  assert.doesNotThrow(() => noCam.update(0.1), 'a bare context (no camera) is fine');
  assert.equal(lone.visible, true, 'and the rule has nothing to judge by: the group is left as it is');
  noCam.ctx.look = { state: { uw: 1 } };
  assert.doesNotThrow(() => noCam.update(0.1), 'nor is a camera that is not there a reason to fail under the sea');
});

test('the camera\'s far plane is 60 m from half way under the sea (the dome\'s own threshold) and the land\'s again on the way out; the projection is rebuilt only when it changes', () => {
  const r = rig(); let rebuilt = 0; const up = r.camera.updateProjectionMatrix.bind(r.camera); r.camera.updateProjectionMatrix = () => { rebuilt++; up(); };
  r.look(0, 1.7, 92, 0);
  assert.equal(r.camera.far, 900, 'on land');
  assert.equal(rebuilt, 0, 'nothing rebuilt on land');
  r.ctx.look.state.uw = UW.SKY_OFF - 0.01; r.look(0, -2, 180, 0);
  assert.equal(r.camera.far, 900, 'a hair short of half way: still the land\'s');
  r.ctx.look.state.uw = UW.SKY_OFF; r.look(0, -2, 180, 0);
  assert.equal(r.camera.far, UW.FAR, 'half way: 60 m');
  assert.equal(UW.FAR, 60, 'the design\'s number');
  assert.equal(rebuilt, 1, 'one rebuild');
  for (let i = 0; i < 5; i++) { r.ctx.look.state.uw = 1; r.look(0, -2.5, 180, 0); }
  assert.equal(r.camera.far, UW.FAR); assert.equal(rebuilt, 1, 'and none while it stays under');
  r.ctx.look.state.uw = 0.2; r.look(0, -1.3, 180, 0);
  assert.equal(r.camera.far, 900, 'back to the land\'s far plane');
  assert.equal(rebuilt, 2, 'one rebuild on the way out');
  r.camera.far = 700; r.ctx.look.state.uw = 1; r.look(0, -2.5, 180, 0); r.ctx.look.state.uw = 0; r.look(0, 1.7, 180, 0);
  assert.equal(r.camera.far, 700, 'what the land had is what it gets back, not a number of this file\'s');
  const noLook = rig({ look: undefined }); noLook.look(0, 1.7, 92, 0);
  assert.equal(noLook.camera.far, 900, 'no look, no change');
});

test('the rule judges by the camera\'s own frustum, far plane included: a swimmer inside the box sees it all round; beyond it, looking out to sea, none; and a view whose 60 m end short of the box sees none', () => {
  const r = rig(); r.ctx.look.state.uw = 1;
  r.look(0, -2.5, 190, SOUTH); r.look(0, -2.5, 190, SOUTH);
  assert.deepEqual(r.shown(), ALL, 'looking out to sea from z 190, inside the box: shown');
  r.look(0, -2.5, 190, NORTH);
  assert.deepEqual(r.shown(), ALL, 'looking north at the shore from z 190: shown');
  r.look(0, -2.5, 300, SOUTH);
  assert.deepEqual(r.shown(), [], 'looking out to sea from beyond the box: none');
  r.look(0, -2.5, 320, NORTH); r.look(0, -2.5, 320, NORTH);
  assert.equal(r.camera.far, UW.FAR);
  assert.deepEqual(r.shown(), [], 'looking at the shore from 60 m past the box\'s end, with a far plane of 60 m: the box is not in the picture');
  r.ctx.look.state.uw = 0; r.look(0, 1.7, 320, NORTH); r.look(0, 1.7, 320, NORTH);
  assert.equal(r.camera.far, 900);
  assert.deepEqual(r.shown(), ALL, 'the same place and look from the air (far plane 900): the beach is in the picture');
});

test('a hidden coast group is passed over by the matrix skip and brought up to date in full on the frame it is shown again', () => {
  const r = rig(); r.vis.collect();
  const g = r.by['props.watersports'], m = g.children[0];
  r.look(0, 1.7, 92, 0); r.scene.updateMatrixWorld(true);
  assert.equal(g.visible, false);
  m.position.set(5, 6, 7);                                             // a floater's pose, moved while the group is hidden
  r.scene.updateMatrixWorld();
  assert.notEqual(m.matrixWorld.elements[12], 5, 'not walked while hidden');
  r.look(0, 1.7, 92, 180); r.scene.updateMatrixWorld();
  assert.equal(g.visible, true);
  assert.deepEqual([m.matrixWorld.elements[12], m.matrixWorld.elements[13], m.matrixWorld.elements[14]], [5, 6, 7], 'brought up to date the frame it is drawn');
});
