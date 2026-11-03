// The swimmer and the diver (A1, round 8, engine patch 2: js/engine/swim.js, the rules, and the Player that runs them; dev/FEATURE-BEACH.md 3.1 and 3.3). The pure rules are held on their own (the modes and their
// hysteresis, the wade's slowing, the plunge, the breath, the ladders, the eye and the roll, the debug places), then the REAL Player runs over the REAL coast (plan.coast), the REAL sea colliders (the pier's piles and
// skirt, the raft's) and the REAL swell (core/sea.js makeSea): walking in, swimming, coming out, diving, the plunge off the pier, the ladders, the current at the south edge, the finds' depth windows through the
// real Discoveries, and the land (nothing changes there). The speeds and times in the checks are the design's own numbers, written out, not read from the code.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-swim.test.mjs
// Every check has a deliberately broken input selected by C_SABOTAGE=<id>|all, and each must then FAIL (the pattern of core-sea.test.mjs):
//   swimon    a walker swims from 1.45 m           swimoff  no hysteresis (a swimmer stands up at 1.55 m again)      deep   the deep wade begins at 0.70 m           wademin  the wade begins at 0.20 m
//   speed     a swimmer's speed is 1.0 m/s          dive     C dives at 0.4 m/s                                       rise   Space rises at 0.4 m/s                 breath   the breath is 20 s, not 25
//   plunge    the fall is 3.2 m, not 1.4 m          limit    no current at the south edge                              ladder  the ladders reach 0.3 m                  eye      the swimmer's eye is on the surface
//   land      a walker's speed is 2.0 m/s           motion   the sea-motion setting is ignored                         surface  the moped is found from the surface
import test from 'node:test';
import assert from 'node:assert/strict';
import './nice.mjs';
import * as THREE from 'three';
import { CONFIG } from '../js/core/config.js';
import { Physics } from '../js/core/physics.js';
import { makeSea, seaState } from '../js/core/sea.js';
import { Discoveries } from '../js/core/registries.js';
import { Player } from '../js/engine/player.js';
import { createSettings } from '../js/engine/settings.js';
import { installDebug } from '../js/engine/debug.js';
import * as SW from '../js/engine/swim.js';
import { createCoast, SEA, PIER, RAFT, Z0 } from '../js/world/coast.js';
import { planSea, seaColliders } from '../js/world/beachsea.js';
import { planBeachFinds, SURFACE_Y } from '../js/world/beachfinds.js';

const SAB = process.env.C_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);
const P = CONFIG.PLAYER;
if (on('swimon')) P.swimOn = 1.45;
if (on('swimoff')) P.swimOff = 1.55;
if (on('deep')) P.deep = 0.7;
if (on('wademin')) P.wadeMin = 0.2;
if (on('speed')) P.swim = 1.0;
if (on('dive')) P.dive = 0.4;
if (on('rise')) P.rise = 0.4;
if (on('breath')) P.breath = 20;
if (on('eye')) P.swimEye = 0;
if (on('land')) P.walk = 2.0;

const coast = createCoast({ seed: 1, edge: () => 0.1 });
const SEAPLAN = planSea(coast);
const climbs = on('ladder') ? coast.climbs.map((c) => ({ ...c, r: 0.3 })) : coast.climbs;
const ground = (x, z) => coast.heightAt(x, z);
const clock = { t: 0 };
const flatSea = () => makeSea({ state: { wind: 0, amp: [0, 0, 0, 0] }, clock: () => clock.t, still: SEA, ground });
const swellSea = () => makeSea({ state: seaState(15), clock: () => clock.t, still: SEA, ground });
const zAtDepth = (d, x = 0) => { let a = Z0 + 40, b = 219; for (let i = 0; i < 50; i++) { const m = (a + b) / 2; if (coast.depthAt(x, m) < d) a = m; else b = m; } return (a + b) / 2; };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${typeof a === 'number' ? +a.toFixed(3) : a} against ${b} (+-${tol})`);

// ---- the pure rules ---------------------------------------------------------------------------------------------------------------------------------------------
test('modeFor: dry to 0.10 m, wade over it, deep from 0.90, swim from 1.55 and kept to 1.30 (a swimmer stands up in the deep wade, never in the shallow one); a walker whose feet are not in the water is dry at any depth', () => {
  const seq = (was, wet, ds) => ds.map((d) => (was = SW.modeFor(d, was, wet)));
  assert.deepEqual(seq('dry', true, [0, 0.05, 0.10, 0.11, 0.5, 0.89, 0.90, 1.2, 1.45, 1.54, 1.55, 2.5]), ['dry', 'dry', 'dry', 'wade', 'wade', 'wade', 'deep', 'deep', 'deep', 'deep', 'swim', 'swim'], 'walking in');
  assert.deepEqual(seq('swim', true, [2.5, 1.6, 1.45, 1.31, 1.30, 1.29, 0.95, 0.89, 0.5, 0.10, 0.05]), ['swim', 'swim', 'swim', 'swim', 'swim', 'deep', 'deep', 'wade', 'wade', 'dry', 'dry'], 'coming out');
  assert.equal(SW.modeFor(1.45, 'deep', true), 'deep', 'a walker is no swimmer at 1.45'); assert.equal(SW.modeFor(1.45, 'swim', true), 'swim', 'and a swimmer is one');
  assert.deepEqual(seq('dry', false, [0, 0.5, 1.0, 1.6, 3.0]), ['dry', 'dry', 'dry', 'dry', 'dry'], 'up on a deck or in the air: dry whatever lies under him');
  assert.equal(SW.modeFor(0.5), 'wade', 'the defaults: a walker, in the water');
});

test('wadeScale: all the speed to 0.10 m, a quarter off at half a metre, half off from 0.90 m down', () => {
  for (const [d, k] of [[-1, 1], [0, 1], [0.10, 1], [0.5, 0.75], [0.9, 0.5], [1.4, 0.5]]) near(SW.wadeScale(d), k, 1e-9, `at ${d} m`);
});

test('the plunge: a fall keeps 35 % of its speed and the water\'s drag (3 per second) takes the rest: 0.6 m under after a 1.4 m fall, in proportion for the others', () => {
  const v = (h) => -Math.sqrt(2 * 9.8 * h);
  near(SW.plungeSpeed(v(1.4)), -1.83, 0.01, 'the speed after a 1.4 m fall'); near(SW.plungeDepth(v(1.4)), 0.61, 0.01, 'the depth after a 1.4 m fall');
  near(SW.plungeDepth(v(0.6)), 0.40, 0.01, 'after 0.6 m'); near(SW.plungeDepth(v(3.0)), 0.89, 0.01, 'after 3 m');
});

test('the breath: low at 25 s under, carried up at 40 s, a gasp when the head is out (the breath never worse than 25 s), refilled three times faster in air; breathSoft is the last stretch', () => {
  const b = { t: 0, low: false, lift: false }, got = [], dt = 0.05;
  for (let t = dt; t < 40.5; t += dt) for (const e of SW.breathStep(b, true, dt)) got.push([e, +t.toFixed(2)]);
  assert.deepEqual(got.map((g) => g[0]), ['low', 'lift'], 'in order');
  near(got[0][1], 25, 0.06, 'the heartbeat at'); near(got[1][1], 40, 0.06, 'the lift at');
  assert.deepEqual(SW.breathStep(b, false, dt), ['gasp'], 'the head comes out: a gasp'); assert.ok(b.t <= 25 && !b.lift, `and the breath is back to 25 s, no worse (${b.t})`);
  for (let i = 0; i < 60; i++) SW.breathStep(b, false, dt);                                         // 3 s in air
  near(b.t, 25 - 9, 0.2, 'three seconds in air refill nine'); assert.ok(!b.low, 'and the warning is over');
  const c = { t: 0, low: false, lift: false }; for (let i = 0; i < 200; i++) SW.breathStep(c, true, dt);   // 10 s under, then air: 10 / 3 s to be whole
  for (let i = 0; i < 65; i++) SW.breathStep(c, false, dt); assert.ok(c.t > 0.1, `3.25 s is not quite enough (${c.t})`); for (let i = 0; i < 5; i++) SW.breathStep(c, false, dt); assert.equal(c.t, 0, 'and 3.5 s is');
  for (const [t, k] of [[0, 0], [25, 0], [32.5, 0.5], [40, 1], [55, 1]]) near(SW.breathSoft(t), k, 1e-9, `breathSoft(${t})`);
});

test('the ladders: within 0.8 m of the rungs and not below the lowest, the nearest; none for a swimmer 2 m off', () => {
  assert.equal(SW.climbAt(climbs, 34, 182.6, -1.5)?.id, 'raft.ladder', 'the raft\'s, 0.6 m from it'); assert.equal(SW.climbAt(climbs, -6.5, 192.2, -1.5)?.id, 'pier.ladder', 'the pier\'s');
  assert.equal(SW.climbAt(climbs, 34, 181.0, -1.5), null, '2.2 m from the raft\'s'); assert.equal(SW.climbAt(climbs, 34, 182.6, -2.4), null, 'a diver under its lowest rung');
  assert.equal(SW.climbAt(climbs, 34, 182.6, -2.0)?.id, 'raft.ladder', 'a diver at the rungs\' foot'); assert.equal(SW.climbAt(null, 0, 0, 0), null, 'a world without ladders');
});

test('the eye: 0.14 m over the surface at rest and riding the swell, never under it at the surface (the setting 0 included), where the body is when diving, continuous in between', () => {
  const rest = SW.swimY();
  for (const m of [0, 0.5, 1]) for (const level of [-0.55, -0.3, 0, 0.2, 0.55]) assert.ok(SW.eyeFor(rest, level, m) >= SEA + level + SW.CLEAR - 1e-9, `the head at the surface is not in the water: m ${m}, swell ${level}`);
  near(SW.eyeFor(rest, 0, 1), SEA + 0.14, 1e-9, 'a flat sea'); near(SW.eyeFor(rest, 0.3, 1), SEA + 0.3 + 0.14, 1e-9, 'riding a 0.3 m swell');
  near(SW.eyeFor(rest, 0, 0), SEA + 0.14, 1e-9, 'a steady head in a flat sea'); near(SW.eyeFor(rest, 0.5, 0), SEA + 0.5 + 0.06, 1e-9, 'a steady head still rides over a crest that would drown it (6 cm over it)');
  for (const level of [-0.5, 0, 0.5]) near(SW.eyeFor(rest - 0.6, level, 1), rest - 0.6 + 0.44, 1e-9, `diving 0.6 m: his own height, the swell ${level} does not reach it`);
  for (const h of [0.001, 0.0002]) {                                                                // (the swell's lift fades over the first 0.6 m of a dive, at most 3.5 m of eye per metre of depth: no step bigger than that, however fine the step)
    let prev = SW.eyeFor(rest, 0.4, 1); for (let d = h; d <= 1.0001; d += h) { const e = SW.eyeFor(rest - d, 0.4, 1); assert.ok(Math.abs(e - prev) <= 3.5 * h + 1e-9, `no jump of the eye at ${d.toFixed(4)} m down (${Math.abs(e - prev)} in a step of ${h})`); prev = e; }
  }
});

test('the roll: leans with the surface\'s slope across the view, at most 0.8 degrees, none with the setting at 0', () => {
  near(SW.rollFor(0, 0, 0, 1), 0, 1e-12, 'a flat surface'); near(SW.rollFor(0.01, 0, 0, 1), 0.0014, 1e-6, 'a gentle slope is linear'); near(SW.rollFor(0.5, 0, 0, 1), 0.8 * Math.PI / 180, 1e-9, 'a steep one is held at 0.8 degrees');
  near(SW.rollFor(0.5, 0, Math.PI, 1), -0.8 * Math.PI / 180, 1e-9, 'looking the other way leans the other way'); near(SW.rollFor(0.5, 0, 0, 0), 0, 1e-12, 'the setting at 0 keeps him upright');
  near(SW.rollFor(0, 0.5, Math.PI / 2, 1), -0.8 * Math.PI / 180, 1e-9, 'looking west (yaw 90 degrees, his right is north), a surface that rises toward the south falls on his right');
  near(SW.rollFor(0, 0.5, -Math.PI / 2, 1), 0.8 * Math.PI / 180, 1e-9, 'and looking east it rises on his right');
});

test('tp places: the sand, the pier\'s head, 40 m out at the surface, the seabed by the anchor; an override wins, a wrong name throws', () => {
  assert.deepEqual([...SW.TP_NAMES], ['beach', 'pier', 'swim', 'under']);
  const beach = SW.tpPlace(coast, 'beach'); assert.ok(coast.depthAt(beach.x, beach.z) < -0.2 && !beach.swim, 'dry sand, well up from the water');
  const pier = SW.tpPlace(coast, 'pier'); near(pier.x, PIER.x, 1e-9, 'the pier\'s line'); assert.equal(pier.y, PIER.top, 'on its deck'); assert.ok(pier.z > PIER.z1 - 3 && pier.z < PIER.z1, 'at its head');
  const swim = SW.tpPlace(coast, 'swim'); assert.ok(swim.swim && coast.depthAt(swim.x, swim.z) >= 1.55 && swim.z >= Z0 + 40 && swim.z < 204, 'in the sea, over swimming depth, 40 m or more out, clear of the current');
  const under = SW.tpPlace(coast, 'under'); assert.ok(under.swim && Math.hypot(under.x + 22, under.z - 190) < 5 && under.y > coast.heightAt(under.x, under.z) && under.y < coast.heightAt(under.x, under.z) + 1, 'on the seabed beside the anchor (-22, 190)');
  assert.equal(SW.tpPlace(coast, 'beach', { x: 5 }).x, 5, 'an override'); assert.throws(() => SW.tpPlace(coast, 'moon'), /no place 'moon'/);
});

// ---- the real Player over the real coast ----------------------------------------------------------------------------------------------------------------------
/** A player on the coast: the real kernel with the sea's colliders, the real sea (flat unless asked), a fake context that records the events and the toasts. `sea: null` leaves ctx.sea out (the lazy road, before the water exists). */
function world(o = {}) {
  const { sea = flatSea(), colliders = true, discover = { check() {} }, settings = {}, plan = true, probe } = o;
  clock.t = 0;
  const physics = new Physics(); physics.setTerrain((x, z) => (z > Z0 ? coast.heightAt(x, z) : 0.1));
  if (colliders) seaColliders(physics, SEAPLAN);
  const C = on('limit') ? { ...coast, limit: (x, z) => ({ ...coast.limit(x, z), soft: 0 }) } : on('ladder') ? { ...coast, climbs } : coast;
  const w = { t: 0, ev: [], toasts: [] };
  const ctx = w.ctx = {
    physics, camera: new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 900), settings: { v: { ...settings } }, buildings: new Map(), errors: [], running: true, plan: plan ? { streets: [], plazas: [], coast: C } : { streets: [], plazas: [] }, hour: 15,
    events: { emit: (n, d) => w.ev.push({ n, d, t: w.t }) }, ui: { toast: (t) => w.toasts.push(t), prompt() {} }, interact: { update() {}, prompt: () => '', use() {} }, discover,
  };
  if (probe) Object.defineProperty(ctx, 'sea', { get: probe }); else if (sea) ctx.sea = sea;
  w.p = new Player(ctx); ctx.player = w.p;
  return w;
}
function run(w, secs, each) {
  const n = Math.round(secs * 60);
  for (let i = 0; i < n; i++) { clock.t += 1 / 60; w.t += 1 / 60; w.p.update(1 / 60); if (each?.(w, i) === true) return i + 1; }
  return n;
}
const snap = (w) => { const p = w.p; return { t: w.t, mode: p.water.mode, depth: p.water.depth, v: p.speed, x: p.s.x, y: p.s.y, z: p.s.z, eye: p.eyeY, under: p.water.under, diving: p.water.diving, onGround: p.s.onGround }; };
const evs = (w, n) => w.ev.filter((e) => e.n === n);
const seq = (tr, key = 'mode') => tr.map((r) => r[key]).filter((m, i, a) => i === 0 || m !== a[i - 1]);
const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
const maxStep = (tr, key) => tr.reduce((m, r, i) => (i ? Math.max(m, Math.abs(r[key] - tr[i - 1][key])) : m), 0);
const REST = SW.swimY();

test('walking in from the sand with W held: dry, wade at 0.10 m, deep at 0.90, swimming at 1.55; slower in the wade, no jump in the deep, the first hint once, the eye never jumps', () => {
  const w = world(); w.p.teleport(0, 140, { yaw: Math.PI }); w.p.keys.add('KeyW');
  const tr = []; run(w, 34, () => tr.push(snap(w)));
  assert.deepEqual(seq(tr), ['dry', 'wade', 'deep', 'swim'], 'the four modes, in order, each once');
  for (const [mode, lo, hi] of [['wade', 0.10, 0.125], ['deep', 0.90, 0.925], ['swim', 1.55, 1.575]]) { const r = tr.find((f) => f.mode === mode); assert.ok(r.depth > lo && r.depth <= hi, `${mode} begins at ${lo} m, not at ${r.depth.toFixed(3)}`); }
  assert.deepEqual(w.toasts, [SW.TOAST.hint], 'the hint (Space, C, Shift), once'); const sw = evs(w, 'player:swim'); assert.equal(sw.length, 1, 'one entry'); assert.deepEqual([sw[0].d.on, sw[0].d.how], [true, 'walk']);
  const half = tr.filter((r) => r.mode === 'wade' && r.depth > 0.45 && r.depth < 0.55); near(mean(half.map((r) => r.v)), 2.3 * 0.75, 0.07, 'the speed at half a metre: a quarter off');
  const knee = tr.filter((r) => r.mode === 'deep' && r.depth > 1.0 && r.depth < 1.5); near(mean(knee.map((r) => r.v)), 2.3 * 0.5, 0.07, 'the speed in the deep wade: half off');
  const last = tr.slice(-120); near(mean(last.map((r) => r.v)), 1.4, 0.07, 'the swimming speed'); near(last.at(-1).y, REST, 0.01, 'the swimmer\'s feet: 0.3 m under the surface'); near(last.at(-1).eye, SEA + 0.14, 0.02, 'his eye: 0.14 m over it');
  assert.ok(maxStep(tr, 'eye') < 0.03, `the eye never jumps on the way in (largest step ${maxStep(tr, 'eye').toFixed(4)} m per frame)`);
  assert.ok(!w.ev.some((e) => e.n === 'player:jump' || e.n === 'player:land' || e.n === 'player:splash'), 'no jump, no landing, no splash on the way'); assert.deepEqual(w.ctx.errors, []);
});

test('in the deep wade there is no sprint, no jump and no crouch (the eyes are still dry)', () => {
  const w = world(); w.p.teleport(0, zAtDepth(1.2), { yaw: Math.PI }); for (const k of ['KeyW', 'ShiftLeft', 'Space', 'KeyC']) w.p.keys.add(k);
  const vy = []; run(w, 1.5, () => vy.push(w.p.s.y)); assert.equal(w.p.water.mode, 'deep'); assert.ok(!w.p.crouching && w.p.crouch < 1e-6, 'no crouch');
  assert.equal(evs(w, 'player:jump').length, 0, 'no jump'); assert.ok(Math.max(...vy) - Math.min(...vy) < 0.1, 'the feet stay on the ground'); near(w.p.speed, 1.15, 0.12, 'the walk, not the run: 5 m/s would be 2.5 here');
});

test('coming out: a swimmer stands up under 1.30 m into the deep wade (once, no flicker), the feet on the ground, the eye eases to his own height', () => {
  const w = world(); w.p.teleport(0, 185, { yaw: 0, swim: true }); w.p.keys.add('KeyW');
  const tr = []; run(w, 32, () => tr.push(snap(w)));
  assert.deepEqual(seq(tr), ['swim', 'deep', 'wade', 'dry'], 'out of the water, once'); const i = tr.findIndex((r) => r.mode === 'deep'), r = tr[i];
  assert.ok(r.depth < 1.30 && r.depth > 1.27, `he stands up at 1.30 m, not at ${r.depth.toFixed(3)}`); assert.ok(r.onGround && Math.abs(r.y - ground(r.x, r.z)) < 0.05, 'on the ground at once');
  const sw = evs(w, 'player:swim'); assert.deepEqual(sw.map((e) => [e.d.on, e.d.how]), [[true, 'teleport'], [false, 'walk']], 'the events');
  assert.ok(maxStep(tr, 'eye') < 0.04, `the eye never jumps coming out (largest step ${maxStep(tr, 'eye').toFixed(4)} m per frame)`); assert.deepEqual(w.ctx.errors, []);
  w.p.keys.delete('KeyW'); run(w, 3); near(w.p.eyeY - w.p.s.y, 1.64, 0.01, 'on dry land the eye is 1.64 m over the feet again'); assert.equal(w.p.wetOff, 0, 'and the water\'s offset is gone');
});

test('the band between 1.30 and 1.55 m: a walker stands there (deep), a swimmer floats there', () => {
  const z = zAtDepth(1.45);
  const a = world(); a.p.teleport(0, z, { yaw: Math.PI }); run(a, 1.5); assert.equal(a.p.water.mode, 'deep', 'a walker at 1.45 m wades');
  const b = world(); b.p.teleport(0, z, { yaw: Math.PI, swim: true }); run(b, 1.5); assert.equal(b.p.water.mode, 'swim', 'a swimmer at 1.45 m swims'); near(b.p.s.y, REST, 0.01, 'at the surface');
});

test('swimming: 1.4 m/s, 2.2 with Shift, slow to start and to stop, a stroke every 1.4 s while he moves and none while he floats', () => {
  const w = world(); w.p.teleport(0, 180, { yaw: Math.PI, swim: true }); run(w, 4); assert.equal(evs(w, 'player:stroke').length, 0, 'floating: no stroke');
  w.p.keys.add('KeyW'); const tr = []; run(w, 0.4, () => tr.push(snap(w))); assert.ok(tr.at(-1).v > 0.5 && tr.at(-1).v < 1.3, `slow to start: ${tr.at(-1).v.toFixed(2)} m/s after 0.4 s`);
  run(w, 9.6, () => tr.push(snap(w))); near(mean(tr.slice(-120).map((r) => r.v)), 1.4, 0.07, 'the speed'); const st = evs(w, 'player:stroke'); assert.ok(st.length >= 6 && st.length <= 8, `${st.length} strokes in 10 s`);
  assert.ok(st.every((e, i) => i === 0 || e.d.foot !== st[i - 1].d.foot), 'the feet alternate'); assert.ok(st.every((e) => !e.d.fast && !e.d.under), 'not fast, head out');
  w.p.keys.add('ShiftLeft'); const t2 = []; run(w, 3, () => t2.push(snap(w))); near(mean(t2.slice(-60).map((r) => r.v)), 2.2, 0.1, 'with Shift'); assert.ok(evs(w, 'player:stroke').at(-1).d.fast, 'a fast stroke');
  w.p.keys.delete('KeyW'); w.p.keys.delete('ShiftLeft'); const t3 = []; run(w, 0.5, () => t3.push(snap(w))); assert.ok(t3.at(-1).v > 0.3, `slow to stop: still ${t3.at(-1).v.toFixed(2)} m/s after 0.5 s`); run(w, 4); assert.ok(w.p.speed < 0.02, 'then he floats');
});

test('diving with C: down to the seabed + 0.3 m in 3 s, the head under, a heartbeat at 25 s, carried up at 40 s whatever the keys say, out with a gasp that is no worse than 25 s', () => {
  const w = world(), floor = SW.diveFloor(ground(0, 185)); w.p.teleport(0, 185, { yaw: Math.PI, swim: true }); run(w, 1);
  w.p.keys.add('KeyC'); const tr = []; let freed = false;
  run(w, 50, () => { tr.push(snap(w)); if (!freed && evs(w, 'player:breath').some((e) => e.d.phase === 'lift')) { w.p.keys.delete('KeyC'); freed = true; } });
  const at3 = tr.find((r) => r.t >= 4.0); near(at3.y, floor, 0.02, 'on the seabed after 3 s of C'); assert.ok(tr.every((r) => r.y >= floor - 1e-6), 'never under the seabed + 0.3 m'); assert.ok(at3.under && at3.eye < SEA - 0.02 && at3.diving, 'the head is under');
  assert.equal(evs(w, 'player:dive').length, 1, 'one dive'); const br = evs(w, 'player:breath'); assert.deepEqual(br.map((e) => e.d.phase), ['low', 'lift', 'gasp'], 'the breath\'s three events');
  near(br[0].d.t, 25, 0.05, 'the heartbeat'); near(br[1].d.t, 40, 0.05, 'the lift'); assert.ok(br[2].d.t <= 25.0001, `the gasp leaves 25 s or less (${br[2].d.t})`);
  const dive = evs(w, 'player:dive')[0].t, sur = evs(w, 'player:surface'); near(br[0].t - dive, 25, 0.1, 'seconds under at the heartbeat'); near(br[1].t - dive, 40, 0.1, 'seconds under at the lift');
  assert.equal(sur.length, 1, 'he surfaces once'); assert.ok(sur[0].t > br[1].t && sur[0].t - br[1].t < 3, `carried up in under 3 s (${(sur[0].t - br[1].t).toFixed(2)})`); assert.ok(br[2].t >= sur[0].t, 'the gasp is with the head out');
  const last = tr.at(-1); assert.ok(!last.under && last.y <= REST + 1e-6, 'at the surface at the end'); assert.deepEqual(w.ctx.errors, []);
});

test('Space comes up from the seabed in 2.5 s and stops at the surface (no jumping out of the water); the head out brings the breath back', () => {
  const w = world(); w.p.teleport(0, 185, { yaw: Math.PI, swim: true }); w.p.keys.add('KeyC'); run(w, 0.1); assert.ok(Math.abs(w.p.water.vy) < 0.6, `slow to start: ${w.p.water.vy.toFixed(2)} m/s after 0.1 s of C`); run(w, 3.9); assert.ok(w.p.water.under); w.p.keys.delete('KeyC'); w.p.keys.add('Space');
  let top = -9; run(w, 2.5, () => { top = Math.max(top, w.p.s.y); }); assert.ok(w.p.s.y > REST - 0.02, `at the surface after 2.5 s (feet at ${w.p.s.y.toFixed(2)}, rest ${REST})`); run(w, 2); assert.ok(top <= REST + 1e-6 && w.p.s.y <= REST + 1e-6, 'and no higher than that'); assert.equal(w.p.water.vy, 0);
  assert.ok(!w.p.submerged, 'the head is out');
});

test('diving by looking: W with the view 35 degrees or more down dives along the look (slower over the ground), level holds the depth, looking up comes back', () => {
  const w = world(); w.p.teleport(0, 183, { yaw: Math.PI, pitch: -0.9, swim: true }); w.p.keys.add('KeyW'); const tr = [];
  run(w, 2.5, () => tr.push(snap(w))); assert.ok(tr.at(-1).y < REST - 0.9 && tr.at(-1).diving, `down after 2.5 s (feet at ${tr.at(-1).y.toFixed(2)})`); near(mean(tr.slice(-30).map((r) => r.v)), 1.4 * Math.cos(0.9), 0.1, 'the ground speed is the look\'s cosine');
  w.p.setLook(Math.PI, 0); const y0 = w.p.s.y; run(w, 1); near(w.p.s.y, y0, 0.05, 'level: the depth is held'); w.p.setLook(Math.PI, 0.9); run(w, 3); near(w.p.s.y, REST, 0.02, 'looking up: back at the surface');
  const w2 = world(); w2.p.teleport(0, 183, { yaw: Math.PI, pitch: -0.3, swim: true }); w2.p.keys.add('KeyW'); run(w2, 3); near(w2.p.s.y, REST, 0.01, 'looking down 17 degrees is no dive');
  const w3 = world(); w3.p.teleport(0, 183, { yaw: Math.PI, pitch: -1.2, swim: true }); run(w3, 3); near(w3.p.s.y, REST, 0.01, 'looking straight down without W is no dive either'); assert.equal(w3.p.water.diving, false, 'nor is he flagged as diving');
});

test('a fall into the sea (1.4 m): the feet cross the surface, go 0.6 m under, buoyancy brings them back; a splash event once, no landing; a fall into the shallows or the deep wade is a landing', () => {
  const h = on('plunge') ? 3.2 : 1.4, w = world(); w.p.teleport(0, 185, { y: SEA + h, yaw: Math.PI }); let min = 0, dv = false; run(w, 4, () => { if (w.p.s.y < min) { min = w.p.s.y; dv = w.p.water.diving; } });
  near(SEA - min, 0.6, 0.15, 'the feet\'s deepest point under the surface'); assert.ok(dv, 'at the bottom of the plunge he is a diver (the feet 0.3 m under their resting place)'); near(w.p.s.y, REST, 0.02, 'and back at rest'); const sp = evs(w, 'player:splash'); assert.equal(sp.length, 1, 'one splash'); near(sp[0].d.speed, Math.sqrt(2 * 9.8 * 1.4), 0.3, 'the speed of the fall');
  assert.equal(evs(w, 'player:land').length, 0, 'no landing'); assert.deepEqual(evs(w, 'player:swim').map((e) => [e.d.on, e.d.how]), [[true, 'plunge']]); assert.ok(w.p.water.under === false && w.p.water.mode === 'swim');
  const q = world(); q.p.teleport(0, 185, { y: SEA + 1.4, yaw: Math.PI }); run(q, 0.9); q.p.keys.add('Space'); run(q, 0.15); q.p.keys.delete('Space'); run(q, 4);
  near(q.p.s.y, REST, 0.02, 'a tap on Space in the plunge does not leave him hanging under the surface');
  for (const depth of [0.37, 1.40]) {
    const v = world(); v.p.teleport(0, zAtDepth(depth), { y: SEA + 1.4, yaw: Math.PI }); run(v, 2);
    assert.equal(evs(v, 'player:splash').length, 0, `${depth} m deep: no splash`); assert.equal(evs(v, 'player:land').length, 1, 'a landing'); assert.equal(v.p.water.mode, depth > 0.9 ? 'deep' : 'wade');
  }
});

test('the pier: its deck is dry however deep the water under it; off the head and into the sea he swims, and a ladder will not take him in his first moments in the water', () => {
  const w = world(); w.p.teleport(PIER.x, 110, { y: PIER.top, yaw: Math.PI }); w.p.keys.add('KeyW'); const tr = []; run(w, 33, () => tr.push(snap(w)));
  assert.deepEqual(seq(tr), ['dry'], 'dry the whole way along the planks'); assert.ok(tr.every((r) => Math.abs(r.y - PIER.top) < 0.03), 'on the deck'); assert.equal(w.p.surface, 'jetty'); assert.ok(w.p.s.z > 183 && w.p.s.z < 191, `at the head (${w.p.s.z.toFixed(1)})`);
  assert.equal(w.toasts.length, 0, 'no hint up there'); assert.ok(tr.at(-1).depth > 1.8, 'with 2 m of water under it');
  const j = world(); j.p.teleport(PIER.x, 191.9, { y: PIER.top, yaw: Math.PI }); run(j, 0.2); j.p.keys.add('Space'); run(j, 3);          // (off the head beside the ladder; Space goes down in the fall (no coyote jump by then) and is still down in the water)
  const tp = evs(j, 'player:swim')[0], c = evs(j, 'player:climb'); assert.deepEqual([tp.d.on, tp.d.how], [true, 'plunge'], 'into the sea'); assert.equal(c.length, 1, 'one climb'); assert.equal(c[0].d.id, 'pier.ladder');
  assert.ok(c[0].t - tp.t >= 0.75 && c[0].t - tp.t <= 1.2, `Space still down from the jump: the ladder waits 0.8 s, not ${(c[0].t - tp.t).toFixed(2)} s`);
  assert.equal(j.p.water.mode, 'dry', 'on the planks'); near(j.p.s.y, PIER.top, 0.02, 'at the deck\'s height'); near(j.p.s.z, 190, 0.05, 'at the ladder\'s exit'); assert.equal(j.p.surface, 'jetty'); assert.deepEqual(evs(j, 'player:swim').map((e) => e.d.how), ['plunge', 'ladder']);
});

test('the raft\'s ladder: W when facing it climbs in 0.4 s onto the planks; with his back to it W does not, Space does; a hint says so once', () => {
  const w = world(); w.p.teleport(RAFT.x, 178, { yaw: Math.PI, swim: true }); w.p.keys.add('KeyW'); const tr = [];
  run(w, 6, () => { tr.push(snap(w)); if (evs(w, 'player:swim').some((e) => e.d.how === 'ladder')) w.p.keys.delete('KeyW'); });             // (W is let go at the top: the raft is 3 m across and he would walk off its far edge)
  const c = evs(w, 'player:climb'); assert.equal(c.length, 1); assert.equal(c[0].d.id, 'raft.ladder'); const done = evs(w, 'player:swim').find((e) => e.d.how === 'ladder'); near(done.t - c[0].t, 0.4, 0.03, 'seconds up the ladder');
  assert.equal(w.p.water.mode, 'dry'); near(w.p.s.y, RAFT.top, 0.02, 'on the raft\'s planks'); near(w.p.s.x, 34, 0.05, 'at its exit'); near(w.p.s.z, 184.1, 0.05, 'at its exit'); assert.equal(w.p.surface, 'jetty'); assert.ok(maxStep(tr, 'eye') < 0.2, `a smooth climb (largest eye step ${maxStep(tr, 'eye').toFixed(3)})`);
  const b = world(); b.p.teleport(RAFT.x, 182.6, { yaw: 0, swim: true }); run(b, 1); assert.equal(evs(b, 'player:climb').length, 0, 'idle, facing away'); assert.deepEqual(b.toasts.filter((t) => t === SW.TOAST.ladder), [SW.TOAST.ladder], 'the hint, once');
  b.p.keys.add('KeyW'); run(b, 0.1); assert.equal(evs(b, 'player:climb').length, 0, 'W with his back to it: no'); b.p.keys.delete('KeyW'); b.p.keys.add('Space'); run(b, 0.1); assert.equal(evs(b, 'player:climb').length, 1, 'Space: yes');
});

test('the sea\'s solids stop a swimmer as they stop a walker: a pile, the raft\'s skirt; he passes between the piles under the pier and under the head\'s rail (his head is under it)', () => {
  let last = null; const hold = (x, z, yaw, secs) => { const w = last = world(); w.p.teleport(x, z, { yaw, swim: true }); w.p.keys.add('KeyW'); run(w, secs); return w.p; }, east = -Math.PI / 2;
  const strokesAfter5 = () => evs(last, 'player:stroke').filter((e) => e.t > 5).length;
  const a = hold(-12, 182, east, 8); assert.ok(a.s.x < -7.9 && a.s.x > -8.4, `stopped by the pile at x -7.7 (he is at ${a.s.x.toFixed(2)})`);
  assert.equal(strokesAfter5(), 0, 'and once stopped he makes no strokes (what he really does is his speed, as a walker\'s steps are the ground he covers)'); assert.ok(Math.hypot(a.vx, a.vz) < 0.05, `and he keeps no speed against it (${Math.hypot(a.vx, a.vz).toFixed(2)} m/s)`);
  const x0 = a.s.x; a.yaw += Math.PI; run(last, 0.3); assert.ok(x0 - a.s.x > 0.12, `turned from it he is off it at once (${(x0 - a.s.x).toFixed(3)} m in 0.3 s; with the speed he pushed with he would take twice as long)`);
  const b = hold(28, 185, east, 8); assert.ok(b.s.x < 32.2 && b.s.x > 31.9, `stopped by the raft's skirt (at ${b.s.x.toFixed(2)})`); assert.equal(strokesAfter5(), 0, 'no strokes against the skirt either');
  const c = hold(PIER.x, 178, Math.PI, 5); assert.ok(c.s.z > 184 && Math.abs(c.s.x - PIER.x) < 0.3, `under the pier, between the piles (z ${c.s.z.toFixed(1)}, x ${c.s.x.toFixed(2)})`);
  const d = hold(-12, 189.5, east, 4); assert.ok(d.s.x > -7.5, `under the head's rail and between its piles (x ${d.s.x.toFixed(2)})`);
  const e = world(); e.p.teleport(-7.7, 182.05, { yaw: east, swim: true }); e.p.keys.add('KeyW'); run(e, 0.5); const off = Math.hypot(e.p.s.x + 7.7, e.p.s.z - 182);
  assert.ok(off > 0.3 && off < 1.5, `put inside a pile he is pushed out of it (the kernel's half metre in a frame is no speed of his), not flung (${off.toFixed(2)} m from it after half a second)`);
});

test('standing on the raft in a heavy swell the planks stay dry: the deck is a floor under his feet, the water that rises over it is no reason to swim', () => {
  const w = world({ sea: swellSea() }); w.p.teleport(RAFT.x, RAFT.z, { y: RAFT.top }); let crest = -9; const modes = [];
  run(w, 60, () => { crest = Math.max(crest, w.ctx.sea.level(RAFT.x, RAFT.z)); modes.push(w.p.water.mode); });
  assert.ok(SEA + crest > RAFT.top + 0.02, `the premise: the surface rises over the planks (crest ${crest.toFixed(2)} m)`); assert.ok(modes.every((m) => m === 'dry'), 'dry throughout'); near(w.p.s.y, RAFT.top, 0.02, 'on the planks');
});

test('the current at the south edge: from z 204 the swimmer slows and is pushed toward the shore; he settles about 212 m, never near the hard stop; the lifeguard whistles from z 207, once a minute at most, and says so once', () => {
  const w = world(); w.p.teleport(20, 196, { yaw: Math.PI, swim: true }); w.p.keys.add('KeyW'); const tr = []; run(w, 72, () => tr.push(snap(w)));
  const zs = tr.map((r) => r.z); assert.ok(Math.max(...zs) < 214, `he cannot swim out (furthest z ${Math.max(...zs).toFixed(2)})`); near(mean(zs.slice(-120)), 211.1, 0.8, 'where the current and his stroke balance'); assert.ok(mean(tr.slice(-120).map((r) => r.v)) < 0.1, 'and he is not moving there');
  const wh = evs(w, 'player:whistle'); assert.equal(wh.length, 2, 'two whistles in 72 s'); assert.ok(wh[1].t - wh[0].t >= 59.9, `a minute apart (${(wh[1].t - wh[0].t).toFixed(1)} s)`); assert.ok(wh[0].d.z >= 207, 'from z 207'); assert.deepEqual(w.toasts.filter((t) => t === SW.TOAST.limit), [SW.TOAST.limit], 'the toast once');
  const f = world(); f.p.teleport(20, 196, { yaw: Math.PI, swim: true }); f.p.keys.add('KeyW'); f.p.keys.add('ShiftLeft'); run(f, 40); assert.ok(f.p.s.z < 216 && f.p.s.z > 211, `Shift settles a little further out, still inside (${f.p.s.z.toFixed(2)})`);
  const h = world(); h.p.teleport(20, 211, { yaw: 0, swim: true }); h.p.keys.add('KeyW'); run(h, 1); assert.ok(211 - h.p.s.z > 0.85 && 211 - h.p.s.z < 1.2, `back toward the shore at 211 m the current is with him: his 0.6 m/s and its 0.56 (${(211 - h.p.s.z).toFixed(2)} m in the first second)`);
  const g = world(); g.p.teleport(20, 150, { yaw: Math.PI, swim: true }); g.p.s.z = 230; run(g, 0.1); assert.ok(g.p.s.z <= 219.5, 'the hard stop holds as ever');
});

test('the swell: the eye rides it and never goes under at the surface, the camera leans with it by 0.8 degrees at most; the sea-motion setting at 0 keeps the camera upright', () => {
  for (const m of [1, 0]) {
    const settings = createSettings({}); settings.set('seaMotion', m); if (on('motion')) settings.set('seaMotion', 1);
    const w = world({ sea: swellSea() }); w.ctx.settings = settings; w.p.teleport(0, 185, { yaw: 0, swim: true }); run(w, 2); const eyes = [], gap = [], rolls = [];
    run(w, 30, () => { const lv = w.ctx.sea.level(0, 185); eyes.push(w.p.eyeY); gap.push(w.p.eyeY - (SEA + lv)); rolls.push(Math.abs(w.p.roll)); });
    assert.ok(Math.min(...gap) > (m === 1 ? 0.04 : 0), `m ${m}: the head is never under the surface at the surface (smallest gap ${Math.min(...gap).toFixed(3)} m; the camera follows the surface a few hundredths of a second late, so a steady head over a fast rising crest is closer than CLEAR)`); assert.ok(Math.max(...rolls) <= SW.ROLL_MAX + 1e-6, `m ${m}: no more than 0.8 degrees of roll`);
    if (m === 1) { assert.ok(Math.max(...eyes) - Math.min(...eyes) > 0.3, `he rides the swell (${(Math.max(...eyes) - Math.min(...eyes)).toFixed(2)} m of eye travel)`); assert.ok(Math.max(...rolls) > 0.003, 'and leans'); near(mean(gap), 0.14, 0.03, 'about 0.14 m over the surface'); }
    else { assert.ok(Math.max(...rolls) < 1e-6, 'm 0: upright'); assert.ok(Math.min(...eyes) > SEA + 0.13, 'm 0: the eye stays at its resting height until a crest would reach it'); }
  }
});

test('the stand-in sea (the lazy road, before the water is built): the same walk-in, the same swim, no ctx.sea needed', () => {
  const w = world({ sea: null }); w.p.teleport(0, 150, { yaw: Math.PI }); w.p.keys.add('KeyW'); run(w, 30); assert.equal(w.p.water.mode, 'swim', 'swimming'); assert.ok(w.p.s.z > 170 && w.p.s.z < 200, `in the bay (${w.p.s.z.toFixed(1)})`); assert.deepEqual(w.ctx.errors, []);
});

test('teleport: with swim he is put in the sea at the surface and swims at once; out of the sea it says so; the water code knows the ground he was put on', () => {
  const w = world(); w.p.teleport(0, 185, { swim: true }); near(w.p.s.y, REST, 1e-6, 'at the surface'); near(w.p.eyeY, SEA + 0.14, 0.005, 'his eye at once'); assert.equal(w.p.water.mode, 'swim'); assert.deepEqual(evs(w, 'player:swim').map((e) => [e.d.on, e.d.how]), [[true, 'teleport']]);
  w.p.teleport(0, 120, {}); assert.deepEqual(evs(w, 'player:swim').map((e) => [e.d.on, e.d.how]), [[true, 'teleport'], [false, 'teleport']], 'the buttons are told'); run(w, 0.5); assert.equal(w.p.water.mode, 'dry'); near(w.p.eyeY - w.p.s.y, 1.64, 0.02, 'the land\'s eye');
  const d = world(); d.p.teleport(0, 185, { swim: true, y: -2.5 }); run(d, 0.5); assert.ok(d.p.water.under && d.p.water.diving, 'with a depth he is a diver'); near(d.p.s.y, -2.5, 0.02, 'where he was put');
});

test('the finds\' depth rule meets the controller: a swimmer at the surface right over the moped, the anchor and the reef finds nothing, a diver on the seabed finds each (the real Discoveries, A5\'s SURFACE_Y and DIVE_ABOVE)', () => {
  const finds = planBeachFinds(coast, null, SEAPLAN).map((d) => ({ ...d })); if (on('surface')) finds.find((d) => d.id === 'moto').y = SURFACE_Y;
  near(REST, SURFACE_Y, 1e-9, 'a swimmer\'s feet are the finds\' surface');
  for (const id of ['moto', 'ancla', 'coral']) {
    const d = finds.find((f) => f.id === id), D = new Discoveries({ events: { emit() {} } }); for (const f of finds) D.register({ ...f });
    const w = world({ discover: D }); w.p.teleport(d.x, d.z, { swim: true, yaw: 0 }); run(w, 1.5); assert.ok(!D.found.has(id), `${id}: a swimmer at the surface right above finds nothing`);
    w.p.keys.add('KeyC'); run(w, 4); assert.ok(w.p.s.y < REST - 1, `${id}: he is down (${w.p.s.y.toFixed(2)})`); assert.ok(D.found.has(id), `${id}: a diver on the seabed finds it`);
  }
});

test('the land is unchanged: north of the plot\'s edge, and on a plan without a coast, nothing of the water runs (the sea is never even asked for), walking, running, crouching and jumping are the old numbers', () => {
  const asked = []; const w = world({ colliders: false, probe: () => { asked.push(1); throw new Error('the sea was asked on dry land'); } }); const p = w.p;
  p.teleport(0, 60, { yaw: 0 }); p.keys.add('KeyW'); run(w, 1.5); near(p.speed, 2.3, 0.05, 'walking'); p.keys.add('ShiftLeft'); run(w, 2); near(p.speed, 5.0, 0.1, 'running'); p.keys.delete('ShiftLeft');
  p.keys.add('KeyC'); run(w, 1.5); near(p.speed, 1.2, 0.05, 'crouching'); near(p.eyeY - p.s.y, 1.15, 0.01, 'a crouched eye'); p.keys.delete('KeyC'); p.keys.delete('KeyW'); run(w, 1.5);
  near(p.eyeY - p.s.y, 1.64, 0.01, 'a standing eye'); let top = 0; const y0 = p.s.y; p.keys.add('Space'); run(w, 1, () => { top = Math.max(top, p.s.y - y0); }); near(top, 0.66, 0.05, 'a jump'); p.keys.delete('Space'); run(w, 1);
  assert.equal(asked.length, 0, 'no sea'); assert.equal(p.water.mode, 'dry'); assert.equal(w.ev.filter((e) => /player:(swim|splash|stroke|dive|surface|breath|climb|whistle)/.test(e.n)).length, 0, 'no water events'); assert.equal(p.wetOff, 0);
  const n = world({ plan: false, sea: null }); n.p.teleport(0, 60, { swim: true, yaw: 0 }); run(n, 1); assert.equal(n.p.water.mode, 'dry', 'a plan without a coast: swim is ignored'); near(n.p.eyeY - n.p.s.y, 1.64, 0.01, 'and he stands');
});

test('a fault puts a swimmer back where he last swam, not on the beach', () => {
  const w = world(); w.p.teleport(0, 180, { yaw: Math.PI, swim: true }); w.p.keys.add('KeyW'); run(w, 5); w.p.keys.delete('KeyW'); run(w, 1.5); const z = w.p.s.z; assert.ok(z > 186, `the premise: he swam on (z ${z.toFixed(1)})`);
  w.p.s.x = NaN; run(w, 1 / 60); near(w.p.s.z, z, 1.0, 'put back about where he was'); assert.ok(Number.isFinite(w.p.s.x) && w.p.s.y > -1.6 && w.ctx.errors.length === 1 && /fell out of the world/.test(w.ctx.errors[0].message), `restored at the surface, one error noted (${w.p.s.y.toFixed(2)})`);
  w.p.s.y = -500; run(w, 1 / 60); assert.ok(w.p.s.y >= SW.diveFloor(ground(w.p.s.x, w.p.s.z)) - 1e-9, 'and a swimmer cannot sink through the seabed: the floor holds him');
});

test('settings: seaMotion is a 0 to 1 setting that starts at 1 and holds its range', () => {
  const s = createSettings({}); assert.equal(s.v.seaMotion, 1); assert.equal(s.set('seaMotion', 0.4), 0.4); assert.equal(s.set('seaMotion', 7), 1); assert.equal(s.set('seaMotion', -3), 0); assert.equal(s.set('seaMotion', 'x'), 1, 'a bad value is the default');
});

test('__ladera.tp: the four places and the water in state(); lookAt knows a swimmer\'s eye', () => {
  const w = world(); w.ctx.step = (dt) => w.p.update(dt); w.ctx.opts = {}; w.ctx.anchors = []; w.ctx.lights = { list: [] }; Object.assign(w.ctx.discover, { count: 0, total: 0, finds: [] });
  const saved = globalThis.window; globalThis.window = {};
  try {
    installDebug(w.ctx); const api = globalThis.window.__ladera;
    let s = api.tp('beach'); assert.equal(s.water.mode, 'dry'); assert.ok(s.pos[2] > 130 && s.pos[2] < 140 && s.surface === 'sand', JSON.stringify(s.pos));
    s = api.tp('pier'); assert.deepEqual([s.pos[0], s.pos[1]], [PIER.x, PIER.top]); assert.equal(s.water.mode, 'dry', 'on the deck');
    s = api.tp('swim'); assert.equal(s.water.mode, 'swim'); near(s.pos[1], REST, 0.01, 'at the surface'); near(s.eyeY, SEA + 0.14, 0.01, 'the eye'); api.lookAt(0, SEA + 0.14, 190); near(w.p.pitch, 0, 0.02, 'lookAt: level with a swimmer\'s eye');
    s = api.step(90); assert.equal(s.water.under, false); s = api.tp('under'); api.step(10); s = api.state(); assert.ok(s.water.mode === 'swim' && s.water.under && s.water.diving, JSON.stringify(s.water)); assert.ok(s.eyeY < SEA - 0.5);
    assert.throws(() => api.tp('moon'), /no place/); const dry = world({ plan: false }); dry.ctx.step = (dt) => dry.p.update(dt); dry.ctx.opts = {}; dry.ctx.anchors = []; dry.ctx.lights = { list: [] }; Object.assign(dry.ctx.discover, { count: 0, total: 0, finds: [] });
    installDebug(dry.ctx); assert.throws(() => globalThis.window.__ladera.tp('swim'), /no beach/);
  } finally { if (saved === undefined) delete globalThis.window; else globalThis.window = saved; }
});
