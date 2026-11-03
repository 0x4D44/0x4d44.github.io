// The view from under the sea (A1, round 8, engine patch 3; dev/FEATURE-BEACH.md 2.2): js/engine/underwater.js, the numbers and the pure rules, and the files that apply them: engine/look.js (the fog, the lights, the sky dome
// and the clear colour by the camera's depth), engine/post.js (the grade the post chain reads), engine/shaderpatch.js (the defaults the ground's patch has from the first frame, and the patch's own GLSL) and
// engine/sky.js (the glow of the far village, moved from the city's old bearing to the west headland's). The Look runs here over stubs (no GL: the PMREM is faked) with the REAL scene, lights, sky, palette and sea;
// the shaders themselves compile in headless Chrome in tests/engine-underwater-page.test.mjs. The numbers in the checks are the design's own, written out, not read from the code.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-underwater.test.mjs
// Two inputs of the stubs can be broken, selected by C_SABOTAGE=<id>|all, and the checks that depend on them must then FAIL (the pattern of core-sea.test.mjs):
//   still   the stub sea stands 0.5 m higher than the still sea (every camera is 0.5 m deeper than the check thinks)       dusk   the "night" hour is a daytime hour
// (The code's own constants and branches are held by the mutation runs in the commit message: each one changed in turn, each caught.)
import test from 'node:test';
import assert from 'node:assert/strict';
import './nice.mjs';
import * as THREE from 'three';
import { makeSea } from '../js/core/sea.js';
import * as U from '../js/engine/underwater.js';
import { Look } from '../js/engine/look.js';
import { Post, GradeShader } from '../js/engine/post.js';
import { lookUniforms, installShaderPatches, patchSea, SEA_PATCH, WET, BLANK_CAUSTIC } from '../js/engine/shaderpatch.js';
import { createSky, CITY_GLOW, citySector } from '../js/engine/sky.js';
import { createCoast, SEA } from '../js/world/coast.js';

// The shared uniforms as the module made them: every Look the checks below build writes `ladUnder` and `ladDay`, so a check that read them later would see an earlier check's.
const FRESH = { sea: lookUniforms.uSeaLevel.value, swash: lookUniforms.uSwash.value, under: lookUniforms.ladUnder.value, day: lookUniforms.ladDay.value, caustic: lookUniforms.ladCaustic.value, flow: lookUniforms.ladFlow.value.toArray() };

const SAB = process.env.C_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${typeof a === 'number' ? +a.toFixed(5) : a} against ${b} (+-${tol})`);
const nearArr = (a, b, tol, msg) => { assert.equal(a.length, b.length, `${msg}: length`); a.forEach((v, i) => near(v, b[i], tol, `${msg}[${i}]`)); };
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const STILL = on('still') ? SEA + 0.5 : SEA;
const NOON = 14, NIGHT = on('dusk') ? 14 : 2;

// ---- the numbers ---------------------------------------------------------------------------------------------------------------------------------------------------
test('blend: nothing above 2 cm under the surface (a head bobbing at the waterline is not in and out), all of it from 14 cm, a smoothstep between', () => {
  for (const d of [-5, -0.5, 0, 0.01, 0.02]) assert.equal(U.blend(d), 0, `at ${d} m`);
  near(U.blend(0.03), 0.0197, 0.0005, 'at 3 cm'); near(U.blend(0.08), 0.5, 1e-9, 'at 8 cm'); near(U.blend(0.1), 0.7407, 0.0005, 'at 10 cm');
  for (const d of [0.14, 0.2, 1, 3, 12]) assert.equal(U.blend(d), 1, `at ${d} m`);
  let was = 0; for (let d = 0; d <= 0.16; d += 0.005) { const b = U.blend(d); assert.ok(b >= was - 1e-12, `monotone at ${d}`); was = b; }
  assert.equal(U.UW.DETECT, 0.02, 'the detection depth is the water\'s own (core/sea.js SUBMERGED)');
});

test('fogDensity: 0.06 at the surface (90 % fogged at about 25 m), 0.10 from 3 m down (about 15 m), a straight line between, the surface\'s above it', () => {
  for (const d of [-3, 0]) near(U.fogDensity(d), 0.06, 1e-12, `at ${d} m`);
  near(U.fogDensity(1.5), 0.08, 1e-12, 'at 1.5 m'); near(U.fogDensity(1), 0.06 + 0.04 / 3, 1e-12, 'at 1 m');
  for (const d of [3, 10]) near(U.fogDensity(d), 0.10, 1e-12, `at ${d} m`);
  const z90 = (k) => Math.sqrt(Math.log(10)) / k;                                  // FogExp2: 1 - exp(-(k z)^2) = 0.9
  near(z90(U.fogDensity(0)), 25.3, 0.1, 'the 90 % distance at the surface'); near(z90(U.fogDensity(5)), 15.2, 0.1, 'the 90 % distance deep down');
});

test('fogColor: the water is (0.02, 0.30, 0.36) in the daylight, a tenth of it in the dark, in between by the day (written into the array it is given)', () => {
  nearArr(U.fogColor(1), [0.02, 0.30, 0.36], 1e-12, 'day'); nearArr(U.fogColor(0), [0.002, 0.030, 0.036], 1e-12, 'night'); nearArr(U.fogColor(0.5), [0.011, 0.165, 0.198], 1e-12, 'half');
  const out = [0, 0, 0]; assert.equal(U.fogColor(1, out), out, 'it writes into `out` and returns it');
  nearArr(U.fogColor(2), [0.02, 0.30, 0.36], 1e-12, 'a day of 2 is a day of 1'); nearArr(U.fogColor(-1), [0.002, 0.030, 0.036], 1e-12, 'a day of -1 is a night');
});

test('lightScale: nothing is lost on land, a fifth at the surface, 60 % at 3 m, 40 % from 6 m, in proportion to the blend', () => {
  for (const d of [0, 1, 6, 20]) assert.equal(U.lightScale(0, d), 1, `on land at ${d}`);
  near(U.lightScale(1, 0), 0.8, 1e-12, 'at the surface'); near(U.lightScale(1, 3), 0.6, 1e-12, 'at 3 m'); near(U.lightScale(1, 6), 0.4, 1e-12, 'at 6 m'); near(U.lightScale(1, 30), 0.4, 1e-12, 'at 30 m');
  near(U.lightScale(0.5, 0), 0.9, 1e-12, 'half in, at the surface');
  let was = 1; for (let d = 0; d <= 7; d += 0.25) { const k = U.lightScale(1, d); assert.ok(k <= was + 1e-12, `monotone at ${d}`); was = k; }
});

test('grade: the land\'s own at 0 (the breath changes nothing there), 0.85 saturation and a 0.38 vignette under it, and the vignette closes by 0.34 with the breath going', () => {
  const g0 = U.grade(0, 1, 1.05); near(g0.sat, 1.05, 1e-12, 'land sat'); near(g0.vig, 0.30, 1e-12, 'land vignette, whatever the breath'); nearArr(g0.cool, [0.93, 0.99, 1.07], 1e-12, 'land cool'); nearArr(g0.warm, [1.045, 1.0, 0.93], 1e-12, 'land warm');
  const g1 = U.grade(1, 0, 1.05); near(g1.sat, 0.85, 1e-12, 'sea sat'); near(g1.vig, 0.38, 1e-12, 'sea vignette'); nearArr(g1.cool, [0.74, 0.97, 1.12], 1e-12, 'sea cool'); nearArr(g1.warm, [0.90, 1.0, 1.08], 1e-12, 'sea warm');
  near(U.grade(1, 1, 1.05).vig, 0.72, 1e-12, 'the last breath'); near(U.grade(1, 0.5, 1.05).vig, 0.55, 1e-12, 'half the breath'); near(U.grade(1, 7, 1.05).vig, 0.72, 1e-12, 'a breath over 1 is 1');
  const h = U.grade(0.5, 1, 1.05); near(h.sat, 0.95, 1e-12, 'half in: saturation'); near(h.vig, 0.34 + 0.17, 1e-12, 'half in: the vignette and half of the breath\'s'); nearArr(h.cool, [0.835, 0.98, 1.095], 1e-12, 'half in: cool');
  const out = { sat: 0, vig: 0, cool: [0, 0, 0], warm: [0, 0, 0] }; assert.equal(U.grade(1, 0, 1, out), out, 'it writes into `out`');
});

test('causticAt: none in the swash (to 10 cm), full from 40 cm to 3 m, fading out toward 5 m', () => {
  for (const d of [-1, 0, 0.1]) assert.equal(U.causticAt(d), 0, `at ${d}`);
  near(U.causticAt(0.25), 0.5, 1e-9, 'half way up'); for (const d of [0.4, 1, 3]) assert.equal(U.causticAt(d), 1, `at ${d}`);
  near(U.causticAt(4), 0.5, 1e-9, 'half way down'); for (const d of [5, 9]) assert.equal(U.causticAt(d), 0, `at ${d}`);
});

test('the land\'s numbers are the shipped ones: the grade pass has them as its defaults, and the constants the sea blends from are the same', () => {
  const u = GradeShader.uniforms;
  near(u.uVig.value, 0.30, 1e-12, 'vignette'); near(u.uSat.value, 1.06, 1e-12, 'saturation'); near(u.uCon.value, 0.22, 1e-12, 'contrast'); near(u.uGrain.value, 0.010, 1e-12, 'grain');
  nearArr(u.uCool.value.toArray(), [0.93, 0.99, 1.07], 1e-6, 'cool'); nearArr(u.uWarm.value.toArray(), [1.045, 1.0, 0.93], 1e-6, 'warm');
  assert.equal(U.LAND.vig, 0.30); assert.deepEqual([...U.LAND.cool], [0.93, 0.99, 1.07]); assert.deepEqual([...U.LAND.warm], [1.045, 1.0, 0.93]);
  assert.equal(U.UW.FAR, 60, 'the camera sees 60 m under the sea (engine/visibility.js)'); assert.equal(U.UW.NORTH, 100, 'nothing is asked north of the plot\'s wall');
});

// ---- the Look, over stubs ------------------------------------------------------------------------------------------------------------------------------------------
/** A Look over stubs: the real scene, lights, sky, palette and sea; no GL (the PMREM is faked). The sea is a flat one at the still level, or (real = false) the stand-in seaOf makes; `coast` false is `?skip=coast`. */
function rig({ hour = NOON, coast = true, real = true, breath = 0 } = {}) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(70, 1.6, 0.05, 900);
  const ctx = { scene, hour, opts: {}, config: {}, settings: { v: {} }, events: { emit() {} }, running: true, plan: coast ? { coast: createCoast({ seed: 1, edge: () => 0.1 }) } : {},
    player: { water: { breathSoft: breath }, indoors: false, s: { x: 0, y: 0, z: 0 }, yaw: 0 }, camera };
  if (real) ctx.sea = makeSea({ state: { wind: 0, amp: [0, 0, 0, 0] }, clock: () => 0, still: STILL, ground: () => -5, eye: () => camera.position });
  const look = new Look(ctx, { shadowMap: { enabled: false }, toneMappingExposure: 1, compile() {} }, camera);
  look.pmrem = { fromScene: () => ({ texture: {}, dispose() {} }) };
  return { look, ctx, camera, scene };
}
/** The camera `depth` metres under the still sea at the beach (x 0, z 190, or `z`); one frame of the Look. Returns its state. */
function dive(r, depth, z = 190) { r.camera.position.set(0, SEA - depth, z); r.look.update(1 / 60); return r.look.state; }
const snap = (r) => { const l = r.look, s = l.state, f = r.scene.fog; return {
  fog: f.color.toArray(), dens: f.density, hemi: l.hemi.intensity, hemiC: l.hemi.color.toArray(), hemiG: l.hemi.groundColor.toArray(), sun: l.sun.intensity, sunC: l.sun.color.toArray(), env: r.scene.environmentIntensity,
  bloomS: s.bloomStrength, bloomT: s.bloomThreshold, sat: s.saturation, vig: s.vignette, cool: s.cool.toArray(), warm: s.warm.toArray(), skyOn: l.sky.mesh.visible, bg: r.scene.background, exposure: l.renderer.toneMappingExposure, uw: s.uw,
  under: lookUniforms.ladUnder.value, day: lookUniforms.ladDay.value }; };

test('on land nothing changes, to the last bit: above the sea, anywhere north of the plot\'s wall (the sea is not even asked), under `?skip=coast`', () => {
  const land = rig(); land.camera.position.set(0, 2, 50); land.look.update(1 / 60); const want = snap(land);
  assert.equal(want.uw, 0); assert.equal(want.skyOn, true); assert.equal(want.bg, null); assert.equal(want.under, 0);
  const above = rig(); above.camera.position.set(0, 3, 190); above.look.update(1 / 60); assert.deepEqual(snap(above), want, 'three metres over the sea at z 190');
  const wall = rig(); let asked = 0; const real = wall.ctx.sea; wall.ctx.sea = { ...real, under: (...a) => { asked++; return real.under(...a); } };
  for (const z of [99.99, 50, 0, -80]) { wall.camera.position.set(0, SEA - 4, z); wall.look.update(1 / 60); }
  assert.equal(asked, 0, 'north of z = 100 the sea is never asked'); assert.deepEqual(snap(wall), want, 'and four metres below the datum up there is still the land');
  wall.camera.position.set(0, 2, 100); wall.look.update(1 / 60); assert.equal(asked, 1, 'from z = 100 it is asked, once a frame');
  const none = rig({ coast: false }); none.camera.position.set(0, SEA - 4, 190); none.look.update(1 / 60);
  assert.deepEqual(snap(none), want, 'with no coast (?skip=coast) a camera at z 190 and 3 m under the datum is on land');
});

test('the blend begins 2 cm under the surface and is whole at 14 cm: nothing at 2 cm, a hair under it a hair of the sea, half way at 8 cm', () => {
  const land = rig(); dive(land, -1); const want = snap(land);
  const r = rig(); dive(r, 0.0199); assert.equal(r.look.state.uw, 0, 'at 2 cm (a hair short): still the land'); assert.deepEqual(snap(r), want, 'and to the last bit');
  dive(r, 0.0201); const tiny = snap(r); assert.ok(tiny.uw > 0 && tiny.uw < 1e-4, `a hair under: ${tiny.uw}`); assert.ok(Math.abs(tiny.dens - want.dens) < 1e-4, 'the fog has moved by a hair');
  dive(r, 0.079); assert.ok(r.look.state.uw < 0.5 && r.look.sky.mesh.visible, 'just short of half way: the dome is still there'); dive(r, 0.081); assert.ok(r.look.state.uw > 0.5 && !r.look.sky.mesh.visible, 'just past it: the dome is gone');
  const half = rig(); dive(half, 0.08); near(half.look.state.uw, 0.5, 1e-9, 'half way at 8 cm'); const h = snap(half);
  near(h.dens, (want.dens + 0.06 + 0.04 * 0.08 / 3) / 2, 1e-9, 'the fog density half way between the land\'s and the water\'s (0.06 and a hair at 8 cm)'); near(h.hemi / want.hemi, 0.9, 2e-4, 'the light a tenth down (half of the fifth the surface takes)');
  near(h.sat, (want.sat + 0.85) / 2, 1e-9, 'saturation half way'); near(h.vig, 0.34, 1e-9, 'the vignette half way (no breath going)'); near(lookUniforms.ladUnder.value, 0.5, 1e-9, 'the shared uniform the seabed\'s caustics fade with');
  dive(r, 0.14); assert.equal(r.look.state.uw, 1, 'whole from 14 cm');
});

test('a metre down in the daylight: the water\'s fog (0.02, 0.30, 0.36) at 0.073, a fifth less light and bluer, half the bloom, the dome off and the clear colour the fog\'s, the sea\'s grade', () => {
  const land = rig(); dive(land, -1); const L = snap(land);
  const r = rig(); const s = dive(r, 1), u = snap(r);
  assert.equal(s.uw, 1); near(s.uwDepth, 1, 1e-9, 'the depth the state carries');
  const k = 0.8 - 0.4 * smooth(1 / 6);                                                       // the light left at a metre: 0.8 at the surface to 0.4 at 6 m
  nearArr(u.fog, [0.02 * (0.1 + 0.9 * s.day), 0.30 * (0.1 + 0.9 * s.day), 0.36 * (0.1 + 0.9 * s.day)], 1e-7, 'the fog\'s colour'); assert.ok(s.day > 0.99, 'noon');
  near(u.dens, 0.06 + 0.04 / 3, 1e-9, 'the fog\'s density: 0.06 at the surface to 0.10 at 3 m'); near(u.hemi, L.hemi * k, 1e-9, 'the hemisphere light'); near(u.sun, L.sun * k, 1e-9, 'the sun'); near(u.env, L.env * k, 1e-9, 'the sky\'s image light');
  near(s.sunIntensity, u.sun, 1e-9, 'state.sunIntensity follows the sun');
  const wn = [0.02 / 0.36, 0.30 / 0.36, 1];                                                  // the water's hue at full strength (its largest channel is 1)
  for (const [key, want] of [['hemiC', L.hemiC], ['hemiG', L.hemiG], ['sunC', L.sunC]]) nearArr(u[key], want.map((v, i) => v * (1 - 0.55) + wn[i] * 0.55), 1e-7, `${key}: 55 % of the way to the water's hue`);
  near(u.bloomS, L.bloomS * 0.5, 1e-9, 'half the bloom'); near(u.bloomT, L.bloomT + 0.8, 1e-9, 'and its threshold up by 0.8');
  assert.equal(u.skyOn, false, 'the dome is off'); assert.ok(u.bg instanceof THREE.Color, 'the clear colour is a colour'); nearArr(u.bg.toArray(), u.fog, 1e-12, 'the fog\'s own'); assert.notEqual(u.bg, r.scene.fog.color, 'a copy, not the fog itself');
  near(u.sat, 0.85, 1e-9, 'saturation 0.85'); near(u.vig, 0.38, 1e-9, 'vignette 0.38'); nearArr(u.cool, [0.74, 0.97, 1.12], 1e-6, 'cool'); nearArr(u.warm, [0.90, 1.0, 1.08], 1e-6, 'warm');
  assert.equal(u.under, 1, 'the shared uniform: under'); assert.equal(u.day, s.day, 'and the daylight the caustics are the sun\'s with'); assert.equal(u.exposure, L.exposure, 'the exposure is the land\'s');
  for (const key of ['hemi', 'sun', 'env']) assert.ok(u[key] < L[key], `${key}: less light`);
});

test('deeper is denser and darker, and stops at 6 m: the fog from 0.06 to 0.10 by 3 m, the light from a fifth gone to three fifths gone by 6 m', () => {
  const land = rig(); dive(land, -1); const L = snap(land); let was = null;
  for (const d of [0.5, 1.5, 3, 4.5, 6, 9, 20]) {
    const r = rig(); const s = dive(r, d), u = snap(r);
    near(u.dens, 0.06 + 0.04 * Math.min(1, d / 3), 1e-9, `fog at ${d} m`); near(u.hemi, L.hemi * (0.8 - 0.4 * smooth(d / 6)), 1e-9, `light at ${d} m`); assert.equal(s.uw, 1, `blend at ${d} m`);
    if (was) { assert.ok(u.dens >= was.dens - 1e-12 && u.hemi <= was.hemi + 1e-12, `${d} m: denser and no brighter than the one above`); } was = u;
  }
});

test('at night the water is nearly black: a tenth of the fog\'s colour, the same density, and the land\'s night light under it', () => {
  const land = rig({ hour: NIGHT }); dive(land, -1); const L = snap(land);
  const r = rig({ hour: NIGHT }); const s = dive(r, 2), u = snap(r);
  assert.ok(s.day < 0.01, `a night hour: day ${s.day}`); nearArr(u.fog, [0.002, 0.030, 0.036], 5e-4, 'a tenth of the daylight\'s colour'); near(u.dens, 0.06 + 0.04 * 2 / 3, 1e-9, 'the same density');
  near(u.hemi, L.hemi * (0.8 - 0.4 * smooth(2 / 6)), 1e-9, 'the night\'s light, scaled the same'); assert.equal(u.day, s.day); assert.ok(u.day < 0.01, 'the caustics (the sun\'s) are off');
  for (const c of u.fog) assert.ok(c < 0.04, `dark: ${c}`);
});

test('the breath closes the vignette under the sea and only there: 0.38 with the breath in hand, 0.72 with the last of it, the land\'s 0.30 whatever it is on land', () => {
  const calm = rig({ breath: 0 }), gasp = rig({ breath: 1 }), half = rig({ breath: 0.5 });
  near(dive(calm, 2).vignette, 0.38, 1e-9, 'a full lung'); near(dive(gasp, 2).vignette, 0.72, 1e-9, 'the last of it'); near(dive(half, 2).vignette, 0.55, 1e-9, 'half');
  const land = rig({ breath: 1 }); near(dive(land, -1).vignette, 0.30, 1e-12, 'on land with a breath of 1 (the player\'s water state is ignored there)');
  gasp.ctx.player.water.breathSoft = 0; gasp.look.update(1 / 60); near(gasp.look.state.vignette, 0.38, 1e-9, 'it opens again with the breath');
  const bare = rig(); delete bare.ctx.player.water; near(dive(bare, 2).vignette, 0.38, 1e-9, 'a player with no water state (a test context) has a full lung');
});

test('the way out gives the land back exactly: after the deepest dive and the surface, every light, colour, grade and switch is as if the sea had never been (the saturation too)', () => {
  const land = rig(); dive(land, -1); const L = snap(land);
  for (const hour of [NOON, NIGHT, 7, 19]) {
    const a = rig({ hour }); dive(a, -1); const want = snap(a);
    const r = rig({ hour }); dive(r, 5); assert.equal(r.look.sky.mesh.visible, false, `${hour}: under`);
    dive(r, -1); assert.deepEqual(snap(r), want, `${hour}: back at the surface, after one frame`); dive(r, -1); assert.deepEqual(snap(r), want, `${hour}: and a frame later`);
  }
  assert.equal(L.bg, null);
  const r = rig(); dive(r, 3); r.camera.position.set(0, 2, 20); r.look.update(1 / 60); assert.deepEqual(snap(r), snap(land), 'walking out of the sea and up the beach (north of the wall) is the land as well');
  dive(r, 3); r.look.setHour(NIGHT); assert.equal(r.look.state.uw, 1, 'a clock change under the sea keeps the sea'); near(r.scene.fog.density, 0.06 + 0.04, 1e-9, 'and the fog'); nearArr(r.scene.fog.color.toArray(), [0.002, 0.030, 0.036], 5e-4, 'and its night colour');
});

test('the stand-in sea (the water not built yet, the lazy milestone) puts the camera under from the first frame: the same view, the same thresholds, 0.55 m of swell at most', () => {
  const r = rig({ real: false }); assert.equal(r.ctx.sea, undefined, 'there is no ctx.sea');
  const s = dive(r, 1.0); assert.equal(s.uw, 1, 'a metre under the still sea is under the stand-in\'s swell (at most 0.55 m)'); near(r.scene.fog.density, 0.06 + 0.04 / 3, 0.02, 'the water\'s fog (the surface is where the swell has it)');
  dive(r, -1.0); assert.equal(r.look.state.uw, 0, 'a metre over it is not'); assert.equal(r.look.sky.mesh.visible, true);
  const lazy = rig({ real: false }); lazy.look.update(1 / 60); assert.equal(lazy.look.state.uw, 0, 'a frame with the camera where it starts: the land');
});

test('post hands the look\'s grade to the grade pass: the land\'s own numbers on land, the sea\'s under it, and back', () => {
  const r = rig({ breath: 1 }), post = new Post(r.ctx, r.look.renderer, r.scene, r.camera);
  post.composer = { render() {} }; post.bloom = { enabled: true, strength: 0, threshold: 0 }; post.grade = { uniforms: THREE.UniformsUtils.clone(GradeShader.uniforms) };
  const g = post.grade.uniforms;
  dive(r, -1); post.render(1 / 60, r.look); const sat = r.look.pal.sat;
  near(g.uSat.value, sat, 1e-12, 'land: the palette\'s saturation'); near(g.uVig.value, 0.30, 1e-12, 'land: vignette'); nearArr(g.uCool.value.toArray(), [0.93, 0.99, 1.07], 1e-6, 'land: cool'); nearArr(g.uWarm.value.toArray(), [1.045, 1.0, 0.93], 1e-6, 'land: warm');
  near(post.bloom.strength, r.look.state.bloomStrength, 1e-12, 'land: the look\'s bloom'); near(post.bloom.threshold, r.look.state.bloomThreshold, 1e-12, 'land: the look\'s threshold');
  dive(r, 2); post.render(1 / 60, r.look);
  near(g.uSat.value, 0.85, 1e-12, 'sea: saturation'); near(g.uVig.value, 0.72, 1e-12, 'sea: the vignette with the last breath'); nearArr(g.uCool.value.toArray(), [0.74, 0.97, 1.12], 1e-6, 'sea: cool'); nearArr(g.uWarm.value.toArray(), [0.90, 1.0, 1.08], 1e-6, 'sea: warm');
  near(post.bloom.strength, r.look.state.bloomStrength, 1e-12, 'sea: the look\'s bloom (half of the land\'s)'); assert.ok(post.bloom.strength < r.look.pal.bloomS * 0.51, 'less bloom than the land has');
  dive(r, -1); post.render(1 / 60, r.look);
  near(g.uSat.value, sat, 1e-12, 'out: saturation back'); near(g.uVig.value, 0.30, 1e-12, 'out: vignette back'); nearArr(g.uCool.value.toArray(), [0.93, 0.99, 1.07], 1e-6, 'out: cool back'); nearArr(g.uWarm.value.toArray(), [1.045, 1.0, 0.93], 1e-6, 'out: warm back');
});

// ---- the ground's patch ----------------------------------------------------------------------------------------------------------------------------------------------
test('the shared uniforms have their defaults from the first frame (the ground is drawn long before the sea is): the still sea, no swash, no caustic tile, not under, daylight', () => {
  assert.equal(FRESH.sea, SEA, 'the still sea'); assert.equal(FRESH.swash, 0, 'no swash'); assert.equal(FRESH.under, 0, 'not under'); assert.equal(FRESH.day, 1, 'daylight');
  assert.equal(FRESH.caustic, BLANK_CAUSTIC, 'the 1 x 1 black tile'); assert.equal(BLANK_CAUSTIC.image.width, 1); assert.deepEqual([...BLANK_CAUSTIC.image.data], [0, 0, 0, 255]);
  assert.deepEqual(FRESH.flow, [0, 0, 0, 0], 'no scroll'); assert.ok(lookUniforms.ladFlow.value.isVector4);
});

test('three materials get the beach\'s patch by their NAME, through the one hook every material has: the dry sand the wet line, the two seabeds the caustics', () => {
  installShaderPatches();
  assert.deepEqual({ ...SEA_PATCH }, { sand_dry: 'wet', seabed_sand: 'caustic', seabed_rock: 'caustic' });
  const compile = (name) => { const m = new THREE.MeshStandardMaterial(); m.name = name; const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader }; m.onBeforeCompile(sh, {}); return { m, sh }; };
  const plain = compile('grass'), wet = compile('sand_dry'), bed = compile('seabed_sand'), rock = compile('seabed_rock');
  for (const x of [plain, wet, bed, rock]) { for (const k of ['ladUnder', 'ladDay', 'uSeaLevel', 'uSwash', 'ladCaustic', 'ladFlow', 'ladGlowCol', 'ladGlowAmt']) assert.equal(x.sh.uniforms[k], lookUniforms[k], `${x.m.name}: ${k} is the shared object, not a copy`); }
  assert.ok(!plain.sh.fragmentShader.includes('ladWet') && !plain.sh.fragmentShader.includes('ladK') && !plain.sh.vertexShader.includes('vLadW'), 'a plain material is not touched');
  assert.ok(wet.sh.fragmentShader.includes('ladWet') && !wet.sh.fragmentShader.includes('ladK'), 'sand: the wet line, no caustics'); assert.ok(bed.sh.fragmentShader.includes('ladK') && !bed.sh.fragmentShader.includes('ladWet'), 'seabed: caustics, no wet line');
  for (const x of [wet, bed, rock]) { assert.ok(x.sh.vertexShader.includes('varying vec3 vLadW;') && x.sh.vertexShader.includes('vLadW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;'), `${x.m.name}: the world position is passed on`); assert.ok(x.sh.fragmentShader.includes('varying vec3 vLadW;') && x.sh.fragmentShader.includes('uniform sampler2D ladCaustic;'), `${x.m.name}: and declared in the fragment shader`); }
  assert.ok(rock.sh.fragmentShader.includes('ladK'), 'both seabeds');
  const keys = [plain, wet, bed, rock].map((x) => x.m.customProgramCacheKey()); assert.equal(new Set(keys).size, 3, `the sand, the seabeds and the rest are three programs: ${keys.join(' | ')}`); assert.equal(keys[2], keys[3], 'the two seabeds are one program');
  for (const x of [wet, bed]) { const f = x.sh.fragmentShader; assert.equal((f.match(/#include <common>/g) ?? []).length, 1, 'one include of common, not two (the patch is added once)'); for (const inc of ['roughnessmap_fragment', 'opaque_fragment']) assert.ok(f.includes(`#include <${inc}>`), `${x.m.name}: ${inc} is still included`); }
  const wetF = wet.sh.fragmentShader; assert.ok(wetF.indexOf('ladWet') > wetF.indexOf('#include <roughnessmap_fragment>') && wetF.indexOf('ladWet') < wetF.indexOf('#include <metalnessmap_fragment>'), 'the wet line comes right after the roughness is read (it changes the colour and the roughness the lights then use)');
  const bedF = bed.sh.fragmentShader; assert.ok(bedF.indexOf('ladK') < bedF.indexOf('#include <opaque_fragment>'), 'the caustics are added to the lit colour, before it is written');
});

test('the wet line: 12 cm over the still sea and the swash, soft over 10 cm below and 4 cm above, a third darker (0.36), glossier (0.30)', () => {
  assert.deepEqual({ ...WET }, { line: 0.12, below: 0.10, above: 0.04, dark: 0.36, rough: 0.30 });
  const m = new THREE.MeshStandardMaterial(); m.name = 'sand_dry'; const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader }; patchSea(sh, 'wet');
  const f = sh.fragmentShader; for (const s of ['uSeaLevel + 0.12 + uSwash', 'ladLine - 0.10', 'ladLine + 0.04', '0.36 * ladWet', '0.30, ladWet']) assert.ok(f.includes(s), `the shader has "${s}"`);
});

// ---- the glow of the far lights ---------------------------------------------------------------------------------------------------------------------------------------
test('the glow on the horizon is over the west headland\'s village: centred at -0.89 rad (the headland\'s bearing from the plaza), narrow, thin, and the shader has the same numbers', () => {
  const coast = createCoast({ seed: 1, edge: () => 0.1 }), h = coast.headlands.find((k) => k.x < 0), bearing = Math.atan2(h.x, h.z);
  near(CITY_GLOW.centre, bearing, 0.2, `the west headland (${h.x.toFixed(0)}, ${h.z.toFixed(0)}) lies at ${bearing.toFixed(2)} rad`);
  assert.equal(CITY_GLOW.centre, -0.89); near(citySector(CITY_GLOW.centre), 1, 1e-12, 'whole over the headland');
  near(citySector(CITY_GLOW.centre + 0.12), 1, 1e-12, 'whole 0.12 rad either side'); near(citySector(CITY_GLOW.centre - 0.12), 1, 1e-12, 'both ways');
  near(citySector(CITY_GLOW.centre + 0.31), 0.04 + 0.96 * 0.5, 1e-9, 'half way at 0.31 rad'); near(citySector(CITY_GLOW.centre + 0.5), 0.04, 1e-12, 'the floor from 0.5 rad');
  for (const a of [0, 1.2, 2.5, 3.1, -3.1, 0.89, -2.4]) near(citySector(a), 0.04, 1e-12, `the glow is at its floor at ${a} rad`);
  near(citySector(Math.PI), 0.04, 1e-12, 'due north');
  near(citySector(-0.89 + 2 * Math.PI), 1, 1e-9, 'the angle wraps: 2 pi away is the same place');
  const old = 0.10 + 0.90 * (1 - smooth((Math.abs(0) - 0.55) / (2.5 - 0.55)));
  assert.ok(old > 0.99 && citySector(0) < 0.05, `the city's old bearing (due south) is dark now: ${citySector(0).toFixed(3)} against ${old.toFixed(2)} before`);
  const src = createSky().material.fragmentShader;
  for (const s of ['-0.890', '0.120', '0.500', '0.040', '0.960', '0.050']) assert.ok(src.includes(s), `the shader has ${s}`);
  assert.ok(!src.includes('smoothstep( 0.55, 2.5'), 'the old sector (the whole south) is gone from the shader');
  assert.ok(src.includes('d = min( d, 6.2831853 - d );') && src.includes('abs( a - -0.890 )'), 'the shader measures the angle from the centre, the short way round, as the twin does');
  assert.ok(src.includes('0.040 + 0.960 * ( 1.0 - smoothstep( 0.120, 0.500, d ) )'), 'and the sector is the twin\'s: the floor and the rest by the smoothstep of the angle');
  assert.ok(CITY_GLOW.gain <= 0.14 * 0.4, 'thin: the 163 houses of the village (about 470 lit windows) against the city\'s 1,500');
});
