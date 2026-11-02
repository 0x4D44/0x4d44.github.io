// What a resident looks like at talking distance (round 6): R3-108, the face fill (a dark face under shop lighting or a hat brim was nearly black at 0.9 m), and R3-102, the idle
// carriage (everybody stood in the one idle pose, arms hanging slightly spread). Both are pure or run on a synthetic rig under Node; the pictures are in the page (tests/people-shots.mjs).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-near.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readAssetJson } from './headless.mjs';
import { CharacterLibrary, SKIN_ALPHA, SKIN_FILL, SKIN_MOOD, skinFillChunk, skinMood, patchSkinFill } from '../js/people/rig.js';
import { CARRIAGES, STRAIGHT_ARMED, STRAIGHT_FLEX, carriageOf, poolFor, applyArm, poseIdle, clearCarriage } from '../js/people/carriage.js';

const META = await readAssetJson('people/people_meta.json');
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const RAD = Math.PI / 180;

// ---- R3-108: the face fill ------------------------------------------------------------------------------------------------------------------------------
test('the fill finds skin by the recolour slot the build stores in COLOR_0 alpha, and every resident has that slot', () => {
  assert.ok(near(SKIN_ALPHA, 128 / 255, 1e-9), 'slot 8 is stored as 8 * 16 / 255');
  for (const p of META.people) assert.equal(p.slots?.skin?.id, 8, `${p.id}: the skin slot is id 8 in the shipped meta (the shader looks for alpha ${SKIN_ALPHA.toFixed(3)})`);
  for (const p of META.people) for (const [name, s] of Object.entries(p.slots)) if (name !== 'skin') assert.ok(Math.abs(s.id * 16 / 255 - SKIN_ALPHA) > 0.05, `${p.id}.${name} (slot ${s.id}) is not mistaken for skin`);
});

test('the chunk: only skin, only within talking range, only where the light left it darker than the floor, shaped like a light from the viewer, after the lighting and before the occlusion map', () => {
  const chunk = skinFillChunk(), f = (v) => v.toFixed(3);
  assert.ok(SKIN_FILL.floor >= 0.15 && SKIN_FILL.floor <= 0.45, 'a floor, not a light: a share of the skin\'s own colour');
  assert.ok(SKIN_FILL.near >= 1 && SKIN_FILL.far <= 5 && SKIN_FILL.far > SKIN_FILL.near, 'talking range, with a ramp');
  assert.ok(SKIN_FILL.shape >= 0.2 && SKIN_FILL.shape <= 0.8, 'the face keeps its form: the floor is lower where the skin turns away from the viewer, but never none');
  assert.ok(SKIN_FILL.night >= 0.1 && SKIN_FILL.night <= 0.6, 'a dark street still has dark faces in it, but not black ones');
  for (const need of [`#ifdef USE_COLOR_ALPHA`, `abs( diffuseColor.a - ${f(SKIN_ALPHA)} )`, `smoothstep( ${f(SKIN_FILL.near)}, ${f(SKIN_FILL.far)}, length( vViewPosition ) )`,
    `ladFace = ${f(SKIN_FILL.shape)} + ${f(1 - SKIN_FILL.shape)} * saturate( dot( normal, geometryViewDir ) )`,
    `max( diffuseColor.rgb * ( ${f(SKIN_FILL.floor)} * ladFace * ladSkinMood ) - ladHave, vec3( 0.0 ) ) * ladSkin * ladNear`, '#endif'])
    assert.ok(chunk.includes(need), `the chunk has ${need}`);
  assert.doesNotMatch(chunk, /undefined|NaN|Infinity/);
  assert.equal((chunk.match(/{/g) ?? []).length, (chunk.match(/}/g) ?? []).length, 'braces balance');
  const fs = THREE.ShaderLib.standard.fragmentShader;
  assert.ok(fs.includes('#include <lights_fragment_end>') && fs.includes('#include <aomap_fragment>') && fs.includes('#include <lights_pars_begin>'), 'the vendored three still has the anchors');
  assert.ok(THREE.ShaderChunk.lights_fragment_begin.includes('vec3 geometryViewDir') && THREE.ShaderChunk.normal_fragment_begin.includes('vec3 normal ='), 'and the two names the chunk reads');
});

test('skinMood: the whole floor by day and in any lit room, `night` of it in the open at night, smoothly between', () => {
  assert.equal(skinMood(0, 0), 1); assert.equal(skinMood(0, 1), 1); assert.equal(skinMood(1, 1), 1, 'a lit room at night');
  assert.ok(near(skinMood(1, 0), SKIN_FILL.night), 'the dead of night, in the open: ' + skinMood(1, 0));
  const out = [0, 0.25, 0.5, 0.75, 1].map((n) => skinMood(n, 0)); for (let i = 1; i < out.length; i++) assert.ok(out[i] < out[i - 1], 'darker as night falls: ' + out.join(' '));
  const door = [0, 0.5, 1].map((d) => skinMood(1, d)); assert.ok(door[0] < door[1] && door[1] < door[2], 'lighter as one steps indoors: ' + door.join(' '));
  assert.equal(skinMood(undefined, undefined), 1, 'no look system, no mood'); assert.equal(skinMood(NaN, NaN), 1);
  assert.equal(skinMood(7, -3), skinMood(1, 0), 'out of range is clamped');
});

test('patchSkinFill: the hook puts the chunk after lights_fragment_end, keeps the shared look uniforms, is applied once, and has its own program key', () => {
  const proto = THREE.Material.prototype.onBeforeCompile, calls = [];
  THREE.Material.prototype.onBeforeCompile = function spy(shader) { calls.push(this); shader.uniforms.ladGlowAmt = { value: 0 }; };
  try {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true }), key0 = m.customProgramCacheKey();
    assert.equal(patchSkinFill(m), m); const hook = m.onBeforeCompile; patchSkinFill(m);
    assert.equal(m.onBeforeCompile, hook, 'a second patch changes nothing');
    const shader = { uniforms: {}, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    m.onBeforeCompile(shader);
    assert.deepEqual(calls, [m], 'the shared hook ran first, on this material'); assert.ok(shader.uniforms.ladGlowAmt, 'with its uniforms');
    const fs = shader.fragmentShader, at = fs.indexOf(skinFillChunk());
    assert.ok(fs.indexOf('#include <lights_fragment_end>') < at && at < fs.indexOf('#include <aomap_fragment>'), 'after the lighting, before the occlusion map');
    assert.equal(fs.split(skinFillChunk()).length, 2, 'once');
    assert.equal(shader.uniforms.ladSkinMood, SKIN_MOOD, 'the one shared uniform, so a frame sets it for every person');
    assert.equal(fs.split('uniform float ladSkinMood;').length, 2, 'declared once'); assert.ok(fs.indexOf('uniform float ladSkinMood;') < fs.indexOf('void main'), 'at file scope, before main');
    assert.notEqual(m.customProgramCacheKey(), key0, 'a program of its own'); assert.equal(m.customProgramCacheKey(), 'people-skin-fill-v2');
  } finally { THREE.Material.prototype.onBeforeCompile = proto; }
});

test('CharacterLibrary.parse gives every material of every character the fill (the old library left them as the file made them)', () => {
  const scene = new THREE.Group(), mats = [];
  for (const id of ['a', 'b']) {
    const node = new THREE.Group(); node.name = 'person_' + id;
    const m = new THREE.MeshStandardMaterial(); mats.push(m);
    node.add(new THREE.SkinnedMesh(new THREE.BufferGeometry(), m)); scene.add(node);
  }
  const lib = new CharacterLibrary('./'); lib.parse({ animations: [], scene }, { fps: 24, people: [{ id: 'a', slots: {} }, { id: 'b', slots: {} }] });
  for (const m of mats) { assert.equal(m.userData.ladSkinFill, true); assert.equal(m.customProgramCacheKey(), 'people-skin-fill-v2'); }
});

test('the world frame sets the mood from the look system (night, indoor), and leaves it whole when there is no look system', async () => {
  const { PeopleWorld } = await import('../js/people/world.js');
  const frame = (look) => {                                                      // one PeopleWorld.update on a bare world: nobody about, so all that is left is what the frame does for the light
    const w = { ctx: { player: {}, camera: new THREE.PerspectiveCamera(), look }, ready: true, _pv: new THREE.Matrix4(), _frustum: new THREE.Frustum(), _skinLight: PeopleWorld.prototype._skinLight, syncPlayer() {}, step() {}, talk: { update() {} } };
    PeopleWorld.prototype.update.call(w, 1 / 60); return SKIN_MOOD.value;
  };
  try {
    assert.equal(frame(undefined), 1, 'no look system');
    assert.ok(near(frame({ state: { night: 1, indoor: 0 } }), SKIN_FILL.night), 'the open street at night');
    assert.equal(frame({ state: { night: 1, indoor: 1 } }), 1, 'a lit room at night');
    assert.equal(frame({ state: { night: 0, indoor: 0 } }), 1, 'day: back to the whole floor the next frame');
  } finally { SKIN_MOOD.value = 1; }
});

// ---- R3-102: the idle carriage ---------------------------------------------------------------------------------------------------------------------------
test('the table: nine carriages, the first the authored idle, every angle one a person can hold, the elbow never bent past a right angle and a bit', () => {
  assert.equal(CARRIAGES.length, 9); assert.equal(new Set(CARRIAGES.map((c) => c.name)).size, 9);
  assert.deepEqual(Object.values(CARRIAGES[0].l), [0, 0, 0, 0]); assert.deepEqual(Object.values(CARRIAGES[0].r), [0, 0, 0, 0]);
  for (const c of CARRIAGES) for (const s of [c.l, c.r]) {
    assert.ok(Math.abs(s.add) <= 12 && Math.abs(s.swing) <= 14 && s.flex >= 0 && s.flex <= 95 && s.inward >= 0 && s.inward <= 45, `${c.name}: ${JSON.stringify(s)}`);
  }
});

test('carriageOf: a pure function of the person, spread over every carriage and not clumped (n01 to n85)', () => {
  const ids = Array.from({ length: 85 }, (_, i) => 'n' + String(i + 1).padStart(2, '0'));
  assert.deepEqual(carriageOf('n29'), carriageOf('n29')); assert.notDeepEqual(carriageOf('n29'), carriageOf('n30'));
  const count = new Map(); for (const id of ids) { const c = carriageOf(id, 'm_don'); count.set(c.name, (count.get(c.name) ?? 0) + 1); }
  assert.equal(count.size, CARRIAGES.length, 'every carriage is somebody\'s: ' + [...count].join(' '));
  assert.ok(Math.max(...count.values()) <= 0.25 * ids.length, 'none is more than a quarter of the town: ' + [...count].join(' '));
  assert.ok((count.get('easy') ?? 0) <= 0.2 * ids.length, 'and the authored idle is the few\'s');
  let same = 0; for (let i = 1; i < ids.length; i++) if (carriageOf(ids[i], 'm_don').name === carriageOf(ids[i - 1], 'm_don').name) same++;
  assert.ok(same <= 0.25 * ids.length, `${same} of ${ids.length - 1} neighbours share a carriage`);
  const c = carriageOf('n29'); for (const a of [c.l, c.r]) assert.ok(Number.isFinite(a.add + a.swing + a.flex + a.inward) && a.flex >= 0);
});

test('the four whose short sleeves gape when the elbow bends keep the elbow almost straight, jitter included; everybody else may bend it', () => {
  assert.deepEqual([...STRAIGHT_ARMED].sort(), ['g_girl', 'm_mototaxi', 'm_obrero', 'm_tendero']);
  for (const ch of STRAIGHT_ARMED) {
    assert.ok(poolFor(ch).length >= 4 && poolFor(ch).every((c) => Math.max(c.l.flex, c.r.flex) <= STRAIGHT_FLEX), `${ch} has more than three carriages, none bending the elbow`);
    for (let i = 1; i <= 85; i++) { const c = carriageOf('n' + i, ch); assert.ok(c.l.flex <= STRAIGHT_FLEX && c.r.flex <= STRAIGHT_FLEX, `${ch} n${i} ${c.name} ${c.l.flex.toFixed(1)}/${c.r.flex.toFixed(1)}`); }
  }
  let bent = 0; for (let i = 1; i <= 85; i++) if (carriageOf('n' + i, 'm_don').l.flex > 30 || carriageOf('n' + i, 'm_don').r.flex > 30) bent++;
  assert.ok(bent >= 20, `${bent} of 85 hold a hand to the belt or hands together`);
  assert.ok(META.people.some((p) => p.id === 'm_tendero') && [...STRAIGHT_ARMED].every((id) => META.people.some((p) => p.id === id)), 'these are real characters');
});

/** A rig whose bones are turned every which way (the real rig's are twisted by its roll) yet whose arms hang naturally in the character's frame (up +Y, forward -Z, right +X). */
function rig(seed = 1) {
  let s = seed; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const obj = new THREE.Group(), bones = {}, cum = {};
  const want = {
    hips: [0, 1, 0], spine: [0, 1.2, 0], chest: [0, 1.35, 0],
    clavicle_l: [-0.05, 1.45, 0], upperarm_l: [-0.2, 1.42, 0], forearm_l: [-0.22, 1.13, 0], hand_l: [-0.23, 0.87, 0],
    clavicle_r: [0.05, 1.45, 0], upperarm_r: [0.2, 1.42, 0], forearm_r: [0.22, 1.13, 0], hand_r: [0.23, 0.87, 0],
  };
  const parent = { spine: 'hips', chest: 'spine', clavicle_l: 'chest', upperarm_l: 'clavicle_l', forearm_l: 'upperarm_l', hand_l: 'forearm_l', clavicle_r: 'chest', upperarm_r: 'clavicle_r', forearm_r: 'upperarm_r', hand_r: 'forearm_r' };
  for (const name of Object.keys(want)) {
    const b = new THREE.Bone(); b.name = name; const p = parent[name];
    const pq = p ? cum[p] : new THREE.Quaternion(), pp = p ? new THREE.Vector3(...want[p]) : new THREE.Vector3();
    b.quaternion.setFromEuler(new THREE.Euler((rnd() - 0.5) * 3, (rnd() - 0.5) * 3, (rnd() - 0.5) * 3));
    b.position.copy(new THREE.Vector3(...want[name]).sub(pp).applyQuaternion(pq.clone().invert()));
    cum[name] = pq.clone().multiply(b.quaternion); (p ? bones[p] : obj).add(b); bones[name] = b;
  }
  obj.updateMatrixWorld(true);
  return { id: 'm_don', obj, bones, actions: new Map() };
}
const pos = (inst, name) => { inst.obj.updateMatrixWorld(true); return inst.bones[name].getWorldPosition(new THREE.Vector3()); };
const rot = (axis, deg) => new THREE.Quaternion().setFromAxisAngle(axis, deg * RAD);
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const closeTo = (a, b, msg) => assert.ok(a.distanceTo(b) < 1e-6, `${msg}: ${a.toArray().map((v) => v.toFixed(4))} vs ${b.toArray().map((v) => v.toFixed(4))}`);

test('applyArm turns the arm in the CHARACTER\'s frame whatever the bones\' own axes: toward the body, forward, the elbow bent forward, the forearm turned inward', () => {
  for (const seed of [1, 2, 3, 4]) for (const [side, toward] of [['l', 1], ['r', -1]]) {
    const inst = rig(seed), S = pos(inst, 'upperarm_' + side), E = pos(inst, 'forearm_' + side), W = pos(inst, 'hand_' + side);
    const a = { add: 9, swing: 7, flex: 50, inward: 30 };
    assert.equal(applyArm(inst, side, a, 1), true);
    const qUp = rot(X, a.swing).multiply(rot(Z, toward * a.add)), qFore = rot(Y, -toward * a.inward).multiply(rot(X, a.flex));
    const E2 = S.clone().add(E.clone().sub(S).applyQuaternion(qUp)), W1 = S.clone().add(W.clone().sub(S).applyQuaternion(qUp)), W2 = E2.clone().add(W1.clone().sub(E2).applyQuaternion(qFore));
    closeTo(pos(inst, 'forearm_' + side), E2, `seed ${seed} ${side}: the elbow`); closeTo(pos(inst, 'hand_' + side), W2, `seed ${seed} ${side}: the hand`);
  }
  const l = rig(7), el0 = pos(l, 'forearm_l'), hand0 = pos(l, 'hand_l');
  applyArm(l, 'l', { add: 8, swing: 0, flex: 0, inward: 0 }, 1); assert.ok(pos(l, 'forearm_l').x > el0.x + 0.02, 'toward the body is toward +X for the left arm (it hangs at -X)');
  const r = rig(7), er0 = pos(r, 'forearm_r'); applyArm(r, 'r', { add: 8, swing: 0, flex: 0, inward: 0 }, 1); assert.ok(pos(r, 'forearm_r').x < er0.x - 0.02, 'and toward -X for the right');
  const f = rig(7); applyArm(f, 'l', { add: 0, swing: 10, flex: 0, inward: 0 }, 1); assert.ok(pos(f, 'forearm_l').z < el0.z - 0.03, 'forward is -Z');
  const b = rig(7); applyArm(b, 'l', { add: 0, swing: 0, flex: 60, inward: 0 }, 1); assert.ok(pos(b, 'hand_l').z < hand0.z - 0.15 && pos(b, 'hand_l').y > hand0.y + 0.05, 'a bent elbow brings the hand forward and up');
  const i = rig(7); applyArm(i, 'l', { add: 0, swing: 0, flex: 80, inward: 40 }, 1); assert.ok(pos(i, 'hand_l').x > hand0.x + 0.1, 'turned inward, the left hand goes toward the middle (+X)');
});

test('the weight scales the turn (the crossfade), nothing at weight 0, and a missing arm is not an error', () => {
  const full = rig(3), half = rig(3), none = rig(3), a = { add: 8, swing: 6, flex: 40, inward: 0 };
  applyArm(full, 'l', a, 1); applyArm(half, 'l', a, 0.5);
  const e0 = pos(none, 'forearm_l'), e1 = pos(full, 'forearm_l'), eh = pos(half, 'forearm_l');
  assert.ok(e1.distanceTo(e0) > 0.02 && eh.distanceTo(e0) < e1.distanceTo(e0) * 0.62 && eh.distanceTo(e0) > e1.distanceTo(e0) * 0.38, 'half the weight, about half the way');
  const h0 = pos(none, 'hand_l'), bent = rig(3), bentHalf = rig(3), flex = { add: 0, swing: 0, flex: 60, inward: 0 };      // (the elbow's bend moves the hand, not the elbow: the hand shows whether the forearm's own turn is scaled)
  applyArm(bent, 'l', flex, 1); applyArm(bentHalf, 'l', flex, 0.5);
  const k = pos(bentHalf, 'hand_l').distanceTo(h0) / pos(bent, 'hand_l').distanceTo(h0);
  assert.ok(pos(bent, 'hand_l').distanceTo(h0) > 0.1 && k > 0.38 && k < 0.62, `half the weight bends the elbow about half as far (${k.toFixed(2)})`);
  assert.equal(applyArm(none, 'l', a, 0), false); closeTo(pos(none, 'forearm_l'), e0, 'weight 0');
  assert.equal(applyArm({ bones: {}, obj: new THREE.Group() }, 'l', a, 1), false);
});

/** The clip the idle plays: every bone holds still (the idle forearm's track really does), so the mixer writes a bone ONCE and then leaves it alone. */
function standing(seed = 3) {
  const inst = rig(seed), hold = (name) => new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, [0, 1], [...inst.bones[name].quaternion.toArray(), ...inst.bones[name].quaternion.toArray()]);
  const names = ['upperarm_l', 'forearm_l', 'upperarm_r', 'forearm_r'];
  const idle = new THREE.AnimationClip('idle_a', 1, names.map(hold)), walk = new THREE.AnimationClip('walk', 1, ['upperarm_l', 'upperarm_r'].map((n) => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, [0, 1], [...rot(X, 10).toArray(), ...rot(X, -10).toArray()])));
  inst.mixer = new THREE.AnimationMixer(inst.obj);
  const lib = Object.create(CharacterLibrary.prototype); lib.clips = new Map([['idle_a', idle], ['walk', walk]]); lib.oneShot = new Set();
  inst.root = inst.obj; return { inst, lib };
}
const qs = (inst) => ['upperarm_l', 'forearm_l', 'upperarm_r', 'forearm_r'].map((n) => inst.bones[n].quaternion.clone());
/** The largest turn between two sets of quaternions, radians. (Not Quaternion.angleTo: 2 * acos(dot) reads 1.5e-8 for two identical unit quaternions whose dot rounds to 1 - 1e-16.) */
const drift = (a, b) => Math.max(...a.map((q, i) => { const r = q.clone().invert().multiply(b[i]); return 2 * Math.atan2(Math.hypot(r.x, r.y, r.z), Math.abs(r.w)); }));

test('the frame loop: clear, update, pose, again and again, leaves the arms where the first frame put them; without the clear a still track piles the turn up every frame', () => {
  const { inst, lib } = standing(), id = Array.from({ length: 85 }, (_, i) => 'n' + (i + 1)).find((x) => carriageOf(x, 'm_don').name === 'hands together');
  lib.play(inst, 'idle_a', { fade: 0 });
  const frame = () => { clearCarriage(inst); inst.mixer.update(1 / 60); return poseIdle(inst, id); };
  assert.equal(frame(), true); const first = qs(inst);
  for (let i = 0; i < 60; i++) frame();
  assert.ok(drift(first, qs(inst)) < 1e-9, 'after sixty more frames: ' + drift(first, qs(inst)));
  const c = carriageOf(id, 'm_don'); assert.ok(first[1].angleTo(inst.bones.forearm_l.parent.quaternion) >= 0 && c.l.flex > 40, 'it is a real carriage: hands together');
  // the hazard the clear is for
  const { inst: bad, lib: lib2 } = standing(); lib2.play(bad, 'idle_a', { fade: 0 });
  bad.mixer.update(1 / 60); poseIdle(bad, id); const b1 = qs(bad); for (let i = 0; i < 20; i++) { bad.mixer.update(1 / 60); poseIdle(bad, id); }
  assert.ok(drift(b1, qs(bad)) > 0.5, 'without clearCarriage the mixer leaves the still bones alone and the turn is put on again: ' + drift(b1, qs(bad)).toFixed(2) + ' rad');
});

test('clearCarriage puts the arms back exactly as the mixer left them; a walker (no idle weight) is never touched', () => {
  const { inst, lib } = standing(4); lib.play(inst, 'idle_a', { fade: 0 });
  inst.mixer.update(1 / 60); const before = qs(inst);
  assert.equal(poseIdle(inst, 'n29'), true); assert.ok(drift(before, qs(inst)) > 0.01 || carriageOf('n29', 'm_don').name === 'easy', 'the arms moved');
  clearCarriage(inst); assert.ok(drift(before, qs(inst)) < 1e-12, 'back exactly');
  lib.play(inst, 'walk', { fade: 0 }); inst.mixer.update(1 / 60); const walking = qs(inst);
  assert.equal(poseIdle(inst, 'n29'), false, 'walking: nothing'); assert.ok(drift(walking, qs(inst)) < 1e-12);
});

test('the crossfade eases the carriage in and out with the idle clip\'s weight (no pop)', () => {
  const id = Array.from({ length: 85 }, (_, i) => 'n' + (i + 1)).find((x) => carriageOf(x, 'm_don').name === 'hands together');
  const { inst, lib } = standing(5); lib.play(inst, 'idle_a', { fade: 0 }); inst.mixer.update(1 / 60);
  const rest = qs(inst); poseIdle(inst, id); const full = drift(rest, qs(inst)); clearCarriage(inst);
  lib.play(inst, 'walk', { fade: 0.25 });                                                                    // the idle fades out over a quarter of a second
  const seen = []; for (let i = 0; i < 20; i++) { clearCarriage(inst); inst.mixer.update(1 / 60); const w = inst.actions.get('idle_a').getEffectiveWeight(), b = qs(inst); poseIdle(inst, id); seen.push({ w, d: drift(b, qs(inst)) }); }
  assert.ok(seen[0].w > 0.7 && seen[0].d > 0.5 * full * 0.7, `at the start the carriage is nearly whole: ${JSON.stringify(seen[0])} of ${full.toFixed(2)}`);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i].d <= seen[i - 1].d + 1e-9, `it only fades: ${seen[i - 1].d.toFixed(3)} then ${seen[i].d.toFixed(3)}`);
  assert.ok(seen.at(-1).d < 0.02, 'and is gone when the walk has taken over: ' + seen.at(-1).d);
});

// ---- the world's frame loop ------------------------------------------------------------------------------------------------------------------------------
test('the world: somebody who stands idle with empty hands keeps their own arms; seated, lying down, carrying something: the clip\'s (the old loop gave everybody the same pose)', async () => {
  const { PeopleWorld } = await import('../js/people/world.js');
  const id = Array.from({ length: 85 }, (_, i) => 'n' + (i + 1)).find((x) => carriageOf(x, 'm_don').name === 'hands together');
  const person = (over = {}) => {
    const { inst, lib } = standing(6); Object.assign(inst, { lod: 0, meta: { heightM: 1.7, walkSpeedMps: 1.2, walkFastSpeedMps: 2, runSpeedMps: 3 }, mesh: { castShadow: true }, propName: null, props: new Map() });
    inst.root = new THREE.Group(); inst.root.add(inst.obj);
    lib.play(inst, 'idle_a', { fade: 0 });
    const n = { id, view: inst, dist: 6, st: { x: 0, y: 0, z: 0 }, ry: 0, sitH: null, lieH: null, item: null, mode: 'idle', act: 'idle', moving: false, carry: null, prop: null, idleVariant: 'idle_a', clipName: 'idle_a', talkVariant: false, mixAcc: 0, scene: false, visible: false, speed: 0, curSpeed: 0, rng: { next: () => 0.3 }, ...over };
    return { inst, n, world: { lib, _sph: new THREE.Sphere(), _frustum: new THREE.Frustum(), _clipFor: PeopleWorld.prototype._clipFor } };
  };
  const run = ({ inst, n, world }, frames = 30) => { for (let i = 0; i < frames; i++) PeopleWorld.prototype._syncView.call(world, n, 1 / 60); return qs(inst); };
  const clipPose = (over) => { const p = person(over); p.inst.mixer.update(1 / 60); return qs(p.inst); };
  const idle = person(), stood = run(idle), plain = clipPose({});
  assert.ok(drift(stood, plain) > 0.3, 'standing idle: the arms are carried (hands together moves them by more than 0.3 rad): ' + drift(stood, plain).toFixed(3));
  assert.ok(drift(stood, run(idle, 30)) < 1e-9, 'and stay put over the next thirty frames');
  for (const [what, over] of [['seated', { sitH: 0.45 }], ['lying', { lieH: 0.3 }], ['holding a basket', { prop: 'basket' }]]) {
    const p = person(over); if (over.prop) p.inst.propName = 'basket';
    assert.ok(drift(run(p), plain) < 1e-9, `${what}: the arms are the clip's`);
  }
});
