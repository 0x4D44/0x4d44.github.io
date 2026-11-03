// The view from under the sea on screen (A1, round 8, engine patch 3; dev/FEATURE-BEACH.md 2.2), in headless Chrome: the shaders the beach patches (the wet sand, the seabeds' caustics) and the surface seen from below
// (Snell's window) compile and link with no console error, and the frames look the way the numbers of tests/engine-underwater.test.mjs say: a camera under the sea sees the water's own colour and a dome that is off, one in the
// air sees none of it, the wet line darkens the sand, the caustics brighten the seabed, the sea's surface from below is a window of sky in the water's mirror. Needs a GPU path (ANGLE or SwiftShader), not a mock.
// The page is the booted game (?skip=people,furnish); the test builds the water itself, as tests/engine-water.test.mjs does, and takes any other water out of the scene first. Quiet box: the browser comes only from tests/chrome.mjs.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-underwater-page.test.mjs
// Every check has a deliberately broken input selected by C_SABOTAGE=<id>|all, and each must then FAIL (the pattern of engine-water.test.mjs):
//   above   the "under" views are 1 m ABOVE the sea             nocaustic  the caustic tile never reaches the seabeds (the 1 x 1 black tile)       nowet  the wet line ignores the sea level (uSeaLevel is read-only)
//   noside  the water's meshes keep their front side from below   nodome   the sky dome stays on under the sea
// The frames are saved as engine-underwater-*.jpg in the directory named by C_SHOTS (nothing is written when it is not set), for a person to look at; each is saved before its checks run, so a failing run leaves its picture.
// What the checks read is the colour of a frame, not a luma alone: from under the sea the sky is a deep blue (its luma is no more than the water's teal round it), and wet sand is 12 % darker, not 36 % (the table's number is the albedo's).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { launch, REPO } from './chrome.mjs';

const SAB = process.env.C_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);
const OUT = process.env.C_SHOTS ? resolve(REPO, process.env.C_SHOTS) : null;
const SEA = -1.2;

let b, page;

// The page side: window.__uw.cam(x, y, z, yaw, pitch, hour) puts the camera exactly there and draws one frame (ctx.render runs the Look for that very pose), grab() reads the frame as a small image, and
// region() is the mean colour of a part of it.
const SETUP = `(async () => {
  const SAB = ${JSON.stringify(SAB)}, on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);
  const api = window.__ladera, ctx = api.ctx, THREE = ctx.THREE;
  const coast = await import('/la-ladera/js/world/coast.js');
  const mod = await import('/la-ladera/js/engine/water.js');
  const { lookUniforms, BLANK_CAUSTIC } = await import('/la-ladera/js/engine/shaderpatch.js');
  coast.setGate(ctx.physics, true);
  { const plan = ctx.plan, land = plan._far ?? (plan._far = (await import('/la-ladera/js/world/periphery.js')).makeFarHeight(plan));
    if (land(0, 560) > coast.SEA && typeof plan.coast?.ground === 'function') { const wrapped = (x, z) => (z > 100 ? plan.coast.ground(x, z, land) : land(x, z)); wrapped.road = land.road; plan._far = wrapped; } }
  for (const o of ctx.scene.children.filter((c) => c.name === 'water')) ctx.scene.remove(o);
  for (let i = ctx.systems.length - 1; i >= 0; i--) if (ctx.systems[i].name === 'water') ctx.systems.splice(i, 1);
  const water = mod.buildWater(ctx); await water.ready;
  if (on('noside')) for (const m of water.materials) Object.defineProperty(m, 'side', { get: () => THREE.FrontSide, set() {} });
  if (on('nocaustic')) Object.defineProperty(lookUniforms.ladCaustic, 'value', { get: () => BLANK_CAUSTIC, set() {} });
  if (on('nowet')) Object.defineProperty(lookUniforms.uSeaLevel, 'value', { get: () => ${SEA}, set() {} });
  const C = ctx.plan.coast, U = window.__uw = { api, ctx, coast, water, lookUniforms, BLANK_CAUSTIC, THREE };
  U.zAt = (d, x = 0) => { let a = 100, b = 219; for (let i = 0; i < 50; i++) { const m = (a + b) / 2; if (C.depthAt(x, m) < d) a = m; else b = m; } return (a + b) / 2; };
  U.cam = (x, y, z, yaw, pitch, hour = 13) => {
    api.setHour(hour); api.teleport(x, z, { yaw, pitch }); api.step(2, 1 / 60);
    const cam = ctx.camera; cam.position.set(x, y, z); cam.rotation.set(pitch, yaw, 0, 'YXZ'); cam.updateMatrixWorld(true);
    if (on('nodome')) ctx.look.sky.mesh.visible = true;
    api.render();
    if (on('nodome')) ctx.look.sky.mesh.visible = true;
    return U.snap();
  };
  U.snap = () => { const s = ctx.look.state, f = ctx.scene.fog; return { uw: s.uw, depth: s.uwDepth, sky: ctx.look.sky.mesh.visible, bg: ctx.scene.background ? ctx.scene.background.toArray() : null, fog: f.color.toArray(), dens: f.density,
    sides: water.materials.map((m) => m.side), uUnder: water.uniforms.uUnder.value, under: lookUniforms.ladUnder.value, errors: ctx.errors.length }; };
  const cv = ctx.renderer.domElement, c = document.createElement('canvas'), W = 64, H = 36; c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  U.grab = () => { g.drawImage(cv, 0, 0, W, H); return Array.from(g.getImageData(0, 0, W, H).data); };
  U.W = W; U.H = H;
  return { meshes: water.meshes.length, errors: ctx.errors.length, caustic: lookUniforms.ladCaustic.value.image?.width ?? 0 };
})()`;

before(async () => {
  b = await launch({ width: 1280, height: 720 });
  page = await b.open('la-ladera/index.html?autostart&manual&skip=people,furnish');
  const r = await page.eval(SETUP);
  assert.equal(r.meshes, 3, 'the water is built');
  if (!on('nocaustic')) assert.ok(r.caustic >= 64, `the caustic tile is loaded (${r.caustic} px)`);
});
after(async () => { await b?.close(); });

/** Mean linear-ish colour and luma (0..1) of a region of a grabbed frame ([x0, x1) x [y0, y1) in a W x H image). */
const region = (d, W, H, x0, y0, x1, y1) => { let r = 0, g = 0, bl = 0, n = 0; for (let y = Math.floor(y0 * H); y < Math.ceil(y1 * H); y++) for (let x = Math.floor(x0 * W); x < Math.ceil(x1 * W); x++) { const i = (y * W + x) * 4; r += d[i]; g += d[i + 1]; bl += d[i + 2]; n++; } r /= n * 255; g /= n * 255; bl /= n * 255; return { r, g, b: bl, luma: 0.2126 * r + 0.7152 * g + 0.0722 * bl }; };
const shot = async (name) => { if (OUT) await page.canvasShot(resolve(OUT, `engine-underwater-${name}.jpg`), { w: 1280 }); };

test('the beach\'s shaders compile and link, in the air and under the sea, with no console errors or warnings: the sand\'s wet line, the seabeds\' caustics, the surface seen from below', async () => {
  const r = await page.eval(`(() => {
    const U = window.__uw, ctx = U.ctx, out = {};
    U.water.setQuality('high');
    out.air = U.cam(0, ${SEA} + 1.7, U.zAt(0) + 2, 0, -0.35);                                 // on the sand at the waterline, looking up the beach
    out.sea = U.cam(0, ${SEA} + 1.2, U.zAt(1.2), Math.PI, -0.1);                              // in the water, looking out to sea
    out.bed = U.cam(0, ${SEA} - (${on('above') ? -1 : 1}) * 1.0, U.zAt(2.2), Math.PI, -0.9);  // a metre under, looking down at the seabed
    out.up = U.cam(0, ${SEA} - (${on('above') ? -1 : 1}) * 2.5, U.zAt(4.5), 0, 1.45);         // two and a half metres under, looking up
    out.air2 = U.cam(0, ${SEA} + 1.7, U.zAt(0) + 2, 0, -0.35);                                // and out again
    const progs = ctx.renderer.info.programs ?? [];
    out.keys = { wet: progs.filter((p) => String(p.cacheKey).includes('ladSea:wet')).length, caustic: progs.filter((p) => String(p.cacheKey).includes('ladSea:caustic')).length };
    out.bad = progs.filter((p) => p.diagnostics && p.diagnostics.runnable === false).length;
    out.errors = ctx.errors.filter((e) => e.stage === 'shader' || e.stage === 'water' || e.system === 'water' || e.stage === 'post').map((e) => String(e.message).slice(0, 200));
    out.sides = [out.air.sides, out.sea.sides, out.bed.sides, out.up.sides, out.air2.sides];
    return out;
  })()`);
  assert.deepEqual(r.errors, [], 'no shader, water or post errors in ctx.errors');
  assert.equal(r.bad, 0, 'every program links');
  assert.ok(r.keys.wet >= 1 && r.keys.caustic >= 1, `the sand's program and the seabeds' were compiled with the patch: ${JSON.stringify(r.keys)}`);
  assert.deepEqual(page.summary(), { errors: [], netErrors: [], consoleErrors: [], consoleWarnings: [] }, 'no console errors, warnings or 404s');
});

test('from under the sea the dome is off, the fog is the water\'s and the grade the sea\'s; from the air none of it; the water\'s meshes turn back side out under the surface and front side out over it', async () => {
  const r = await page.eval(`(() => {
    const U = window.__uw, ctx = U.ctx, out = {};
    out.air = U.cam(0, ${SEA} + 1.7, U.zAt(0) + 2, 0, -0.35);
    out.under = U.cam(0, ${SEA} - (${on('above') ? -1 : 1}) * 2, U.zAt(4), Math.PI, 0);
    const g = ctx.post.grade?.uniforms; out.grade = g ? { sat: g.uSat.value, vig: g.uVig.value, cool: g.uCool.value.toArray(), warm: g.uWarm.value.toArray() } : null;
    out.air2 = U.cam(0, ${SEA} + 1.7, U.zAt(0) + 2, 0, -0.35);
    const g2 = ctx.post.grade?.uniforms; out.grade2 = g2 ? { sat: g2.uSat.value, vig: g2.uVig.value } : null;
    out.hour = ctx.look.state.day;
    out.front = U.THREE.FrontSide; out.back = U.THREE.BackSide;
    return out;
  })()`);
  assert.equal(r.air.uw, 0, 'in the air: no sea'); assert.equal(r.air.sky, true, 'in the air: the dome'); assert.equal(r.air.bg, null, 'in the air: no clear colour of the water\'s'); assert.equal(r.air.uUnder, 0); assert.equal(r.air.under, 0);
  assert.deepEqual(r.air.sides, [r.front, r.front, r.front], 'in the air the water\'s three meshes are drawn front side out');
  assert.equal(r.under.uw, 1, 'two metres under: the whole sea'); assert.ok(Math.abs(r.under.depth - 2) < 0.8, `the camera is ${r.under.depth.toFixed(2)} m under (the swell moves the surface by half a metre at most)`);
  assert.equal(r.under.sky, false, 'under the sea: the dome is off'); assert.ok(r.under.bg, 'and the clear colour is the water\'s'); assert.deepEqual(r.under.bg.map((c) => +c.toFixed(5)), r.under.fog.map((c) => +c.toFixed(5)), 'the fog\'s own');
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(r.under.fog[i] - [0.02, 0.30, 0.36][i] * (0.1 + 0.9 * r.hour)) < 1e-4, `the fog colour ${i}: ${r.under.fog[i]}`);
  assert.ok(r.under.dens >= 0.06 && r.under.dens <= 0.10, `the fog density ${r.under.dens}`); assert.equal(r.under.uUnder, 1, 'the water\'s shader knows it is looked at from below'); assert.equal(r.under.under, 1);
  assert.deepEqual(r.under.sides, [r.back, r.back, r.back], 'under the surface the water\'s meshes are drawn back side out');
  assert.ok(r.grade, 'the post chain has its grade pass'); assert.ok(Math.abs(r.grade.sat - 0.85) < 1e-6 && Math.abs(r.grade.vig - 0.38) < 1e-6, `the sea's grade: ${JSON.stringify(r.grade)}`);
  assert.ok(Math.abs(r.grade.cool[0] - 0.74) < 1e-6 && Math.abs(r.grade.warm[2] - 1.08) < 1e-6, 'bluer shadows and highlights');
  assert.equal(r.air2.uw, 0, 'and out again'); assert.equal(r.air2.sky, true); assert.equal(r.air2.bg, null); assert.deepEqual(r.air2.sides, [r.front, r.front, r.front]);
  assert.ok(Math.abs(r.grade2.vig - 0.30) < 1e-6 && r.grade2.sat > 0.9, `the land's grade is back: ${JSON.stringify(r.grade2)}`);
  assert.deepEqual(page.summary().consoleErrors, [], 'no console errors');
});

test('a frame from under the sea is the water\'s: green and blue over red, no sky where the sky would be, not blank; the same view from a metre over the surface is the sky and the sea', async (t) => {
  const r = await page.eval(`(() => {
    const U = window.__uw, out = {};
    const z = U.zAt(3.5), dive = ${on('above') ? -1 : 1};
    U.cam(0, ${SEA} - dive * 1.5, z, Math.PI, 0.05); out.under = U.grab();
    U.cam(0, ${SEA} + 1.0, z, Math.PI, 0.05); out.air = U.grab();
    U.cam(0, ${SEA} - dive * 1.5, z, Math.PI, 0.05); out.W = U.W; out.H = U.H;
    return out;
  })()`);
  await shot('under'); await page.eval(`window.__uw.cam(0, ${SEA} + 1.0, window.__uw.zAt(3.5), Math.PI, 0.05)`); await shot('air');       // (before the checks, so that a failing run leaves its pictures)
  const u = region(r.under, r.W, r.H, 0, 0, 1, 1), a = region(r.air, r.W, r.H, 0, 0, 1, 1), ut = region(r.under, r.W, r.H, 0, 0, 1, 0.33), at = region(r.air, r.W, r.H, 0, 0, 1, 0.33);
  t.diagnostic(`under: r ${u.r.toFixed(3)} g ${u.g.toFixed(3)} b ${u.b.toFixed(3)} luma ${u.luma.toFixed(3)}   air: r ${a.r.toFixed(3)} g ${a.g.toFixed(3)} b ${a.b.toFixed(3)} luma ${a.luma.toFixed(3)}   the top third, under: r ${ut.r.toFixed(3)}, air: r ${at.r.toFixed(3)}`);
  assert.ok(u.luma > 0.02 && u.luma < 0.6, `not blank, not blown: luma ${u.luma.toFixed(3)}`); assert.ok(u.g > u.r * 1.8 && u.b > u.r * 1.8, `green and blue over red: ${JSON.stringify(u)}`);
  // (the air's frame is blue too, sky over sea: what it has and the water's has not is the sky's red in the top of the frame, 0.44 against 0.19 as built)
  assert.ok(ut.r < 0.6 * at.r, `where the sky would be, the frame from under the sea has the water's colour (red ${ut.r.toFixed(3)}) and not the sky's (${at.r.toFixed(3)} from the air)`);
});

test('Snell\'s window: looking straight up from under the sea the centre is the sky (a deep blue, with next to no red) and past the window the surface mirrors the sea (teal: green nearly as strong as blue, and less blue)', async (t) => {
  const r = await page.eval(`(() => {
    const U = window.__uw, dive = ${on('above') ? -1 : 1};
    U.cam(0, ${SEA} - dive * 2.5, U.zAt(4.5), 0, 1.5, 13); const d = U.grab();
    return { d, W: U.W, H: U.H, uw: U.ctx.look.state.uw };
  })()`);
  await shot('window');                                                                                         // (before the checks, so that a failing run leaves its picture)
  // the four corners and the two ends of the middle row: 49 to 56 degrees from straight up, past the window's edge (the critical angle, 48.6 degrees)
  const c = region(r.d, r.W, r.H, 0.4, 0.4, 0.6, 0.6), k = [region(r.d, r.W, r.H, 0, 0, 0.12, 0.2), region(r.d, r.W, r.H, 0.88, 0, 1, 0.2), region(r.d, r.W, r.H, 0, 0.8, 0.12, 1), region(r.d, r.W, r.H, 0.88, 0.8, 1, 1), region(r.d, r.W, r.H, 0, 0.4, 0.05, 0.6), region(r.d, r.W, r.H, 0.95, 0.4, 1, 0.6)];
  const mean = (key) => k.reduce((s, x) => s + x[key], 0) / k.length, out = { r: mean('r'), g: mean('g'), b: mean('b'), luma: mean('luma') };
  t.diagnostic(`centre r ${c.r.toFixed(2)} g ${c.g.toFixed(2)} b ${c.b.toFixed(2)} luma ${c.luma.toFixed(3)}   past the window r ${out.r.toFixed(2)} g ${out.g.toFixed(2)} b ${out.b.toFixed(2)} luma ${out.luma.toFixed(3)} (green over blue ${(out.g / out.b).toFixed(2)})   uw ${r.uw}`);
  assert.equal(r.uw, 1);
  // (what the window is, on screen, is the sky's blue: its luma is no more than the teal round it, 0.34 against 0.38 as built, so the checks are on the colour)
  assert.ok(c.b > out.b + 0.15, `the window is bluer (${c.b.toFixed(3)}) than its surroundings (${out.b.toFixed(3)})`);
  assert.ok(c.b > 0.6 && c.r < 0.8 * out.r, `and is the sky's blue, not the water's: blue ${c.b.toFixed(3)}, red ${c.r.toFixed(3)} against ${out.r.toFixed(3)} round it`);        // (as built: blue 0.79, red 0.05 to 0.10 as the swell moves the window, against 0.16 round it)
  // past the window the surface is a mirror of the sea, the water's own colour: green nearly as strong as blue (0.86 as built). If the window were too wide (a refractive index of 1) or the surface showed the sky all over,
  // the same frame is the sky's deep blue out to the corners, with its vignette on: green over blue 0.56 and a luma of 0.26 where the mirror has 0.38
  assert.ok(out.g > 0.72 * out.b, `past the window the surface mirrors the sea, teal, and not the sky's deep blue: green ${out.g.toFixed(3)} against blue ${out.b.toFixed(3)} (${(out.g / out.b).toFixed(2)} x)`);
});

test('the caustics brighten the seabed under a camera that is under the sea, and only there: the same frame with the caustic tile blanked is darker, and from over the surface blanking it changes nothing', async (t) => {
  const r = await page.eval(`(() => {
    const U = window.__uw, dive = ${on('above') ? -1 : 1}, z = U.zAt(2.2), L = U.lookUniforms, tile = L.ladCaustic.value;
    U.cam(0, ${SEA} + 1.0, z, Math.PI, -0.9, 13); const air1 = U.grab();                                          // (the caustic term is the tile's: with the black one it adds nothing; ctx.render() runs the Look again and writes the blend back, so the blend itself cannot be pulled out)
    L.ladCaustic.value = U.BLANK_CAUSTIC; U.api.render(); const air0 = U.grab(); L.ladCaustic.value = tile;
    U.cam(0, ${SEA} - dive * 1.0, z, Math.PI, -0.9, 13); const on1 = U.grab(); const state = U.snap();
    L.ladCaustic.value = U.BLANK_CAUSTIC; U.api.render(); const off = U.grab();
    L.ladCaustic.value = tile; U.api.render();                                                                    // (and the picture of it is the one with the caustics)
    return { on1, off, air1, air0, W: U.W, H: U.H, state };
  })()`);
  assert.equal(r.state.uw, 1);
  const a = region(r.on1, r.W, r.H, 0.2, 0.3, 0.8, 0.95), o = region(r.off, r.W, r.H, 0.2, 0.3, 0.8, 0.95), a1 = region(r.air1, r.W, r.H, 0.2, 0.3, 0.8, 0.95), a0 = region(r.air0, r.W, r.H, 0.2, 0.3, 0.8, 0.95);
  t.diagnostic(`seabed luma with the caustics ${a.luma.toFixed(4)}, without ${o.luma.toFixed(4)} (${(a.luma / o.luma).toFixed(3)} x); from over the surface ${a1.luma.toFixed(4)} and ${a0.luma.toFixed(4)} (${(a1.luma / a0.luma).toFixed(4)} x)`);
  await shot('seabed');
  assert.ok(a.luma > 0.015, `the seabed is seen: ${a.luma.toFixed(4)}`); assert.ok(a.luma > o.luma * 1.025, `the caustics add light: ${a.luma.toFixed(4)} against ${o.luma.toFixed(4)}`);          // (1.055 x as built, 1.000 x with the tile blank: the threshold is between)
  assert.ok(Math.abs(a1.luma / a0.luma - 1) < 0.004, `and only under the sea: from a metre over it the tile makes no difference (${(a1.luma / a0.luma).toFixed(4)} x)`);
});

test('the sand the sea has wet is darker: with the wet line raised over the whole beach in view, the sand under the camera is a good deal darker than with the sea where it is', async (t) => {
  const r = await page.eval(`(() => {
    const U = window.__uw, L = U.lookUniforms, z = U.zAt(0) - 8;                                                  // eight metres up the beach, on the dry sand, looking down at it (the frame is all sand)
    U.cam(0, 0, z, 0, -1.0, 13); const eye = U.api.state().eyeY + 0.6;
    L.uSeaLevel.value = ${SEA}; U.cam(0, eye, z, 0, -1.0, 13); const dry = U.grab();
    L.uSeaLevel.value = ${SEA} + 4; U.api.render(); const wet = U.grab();
    L.uSeaLevel.value = ${SEA}; U.api.render();
    return { dry, wet, W: U.W, H: U.H, swash: L.uSwash.value, eye };
  })()`);
  await shot('sand');
  if (OUT) { await page.eval(`(() => { const U = window.__uw; U.lookUniforms.uSeaLevel.value = ${SEA} + 4; U.api.render(); })()`); await shot('sand-wet'); await page.eval(`(() => { const U = window.__uw; U.lookUniforms.uSeaLevel.value = ${SEA}; U.api.render(); })()`); }
  const d = region(r.dry, r.W, r.H, 0.1, 0.1, 0.9, 0.9), w = region(r.wet, r.W, r.H, 0.1, 0.1, 0.9, 0.9);
  t.diagnostic(`the sand under the camera (eye at ${r.eye.toFixed(2)} m): luma ${d.luma.toFixed(3)} dry, ${w.luma.toFixed(3)} with the wet line raised by 4 m (${(w.luma / d.luma).toFixed(3)} x)   swash ${r.swash.toFixed(3)} m`);
  assert.ok(d.luma > 0.05, `the sand is seen: ${d.luma.toFixed(3)}`); assert.ok(w.luma < d.luma * 0.93 && w.luma > d.luma * 0.3, `the wet sand is darker, not black: ${(w.luma / d.luma).toFixed(3)} x the dry`);          // (0.88 x as built, 1.00 x when the wet line ignores the sea level: the threshold is between)
  assert.ok(r.swash >= 0 && r.swash <= 0.1 + 1e-9, `the run-up of the swell is within 10 cm: ${r.swash}`);
});

test('the sea\'s own surface from the air is still the sea (draw calls: three), and the whole sequence ended without an error', async () => {
  const r = await page.eval(`(() => { const U = window.__uw; U.cam(0, ${SEA} + 1.7, U.zAt(0) + 2, Math.PI, -0.05); const a = U.ctx.renderer.info.render.calls; U.water.group.visible = false; U.api.render(); const h = U.ctx.renderer.info.render.calls; U.water.group.visible = true; return { a, h, errors: U.ctx.errors.length }; })()`);
  assert.equal(r.a - r.h, 3, 'three draws for the sea'); assert.equal(r.errors, 0, 'ctx.errors is empty');
  assert.deepEqual(page.summary(), { errors: [], netErrors: [], consoleErrors: [], consoleWarnings: [] }, 'no console errors, warnings or 404s');
});
