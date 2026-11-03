// The sea on screen (A1, js/engine/water.js, dev/FEATURE-BEACH.md 2.1), in headless Chrome: three transparent meshes that cost exactly three draws when the sea is in view and none when it
// is not, shaders that compile in every quality tier, a swell on the GPU that agrees with core/sea.js, and a ctx.sea that the swimmers and boats can rely on.
// The page is the booted game (?skip=people,furnish: the sea does not care about the interiors); the test builds the water itself and takes any other water out of the scene first.
// Needs a GPU path (ANGLE or SwiftShader), not a mock. Quiet box: the browser comes only from tests/chrome.mjs.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-water.test.mjs
// Every check has a deliberately broken input selected by C_SABOTAGE=<id>|all, and each must then FAIL (the pattern of world-coast.test.mjs):
//   cull   the cull is off and the meshes are always shown: looking north from z = 90 draws the sea   mesh   the far mesh is gone: the sea draws two meshes, not three
//   shader the fragment shader does not compile                                                       blank  the scene is not drawn: the promenade frame is blank
//   wire   one mesh's sun direction is a copy, not the sky's own uniform                              parity the GPU's wave amplitudes are twice the CPU's
//   sea    ctx.sea.depth answers 0 everywhere                                                         quality setQuality does nothing                       dispose  dispose leaves the sea in the scene
//   seam   the mid mesh is 3 m off: a gap opens along the joins
// The promenade frame is saved as engine-water-promenade.jpg in the directory named by C_SHOTS (nothing is written when it is not set), for a person to look at.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { launch, REPO } from './chrome.mjs';

const SAB = process.env.C_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);
const OUT = process.env.C_SHOTS ? resolve(REPO, process.env.C_SHOTS) : null;
const SEA = -1.2, PEAK = 0.549;

let b, page;

// The page side. Everything the tests share lives on window.__sea: view(x, z, yaw, pitch, hour) puts the player, the clock and the camera, frame(visible) renders once and returns the draw calls of that frame.
// The camera takes the player's pose only on a step (a teleport alone leaves it where it was), and a step may pull the player in: the plot's walls and its edge clamp belong to other agents, so a view
// then puts the camera exactly at (x, z) whatever the player did. The pose of a frame is therefore the one asked for, in a tree that lets the player onto the beach and in one that does not.
const SETUP = `(async () => {
  const SAB = ${JSON.stringify(SAB)}, on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);
  const api = window.__ladera, ctx = api.ctx;
  const coast = await import('/la-ladera/js/world/coast.js');
  const pure = await import('/la-ladera/js/core/sea.js');
  const mod = await import('/la-ladera/js/engine/water.js');
  const { lookUniforms } = await import('/la-ladera/js/engine/shaderpatch.js');
  coast.setGate(ctx.physics, true);                                          // the plot's south gate: the beach is open
  // The sea bed beyond the bay (|x| > 100) is plan._far, which the beach terrain provides in the game. A tree without it still has the old valley there (hills at +13 m south of the plot), which would
  // cut the sea short along x = +-100; the beach profile stands in for the terrain then (coast.ground, the function the terrain is to call), and the probes below see a sea that reaches its edges.
  { const plan = ctx.plan, land = plan._far ?? (plan._far = (await import('/la-ladera/js/world/periphery.js')).makeFarHeight(plan));
    if (land(0, 560) > coast.SEA && typeof plan.coast?.ground === 'function') { const wrapped = (x, z) => (z > 100 ? plan.coast.ground(x, z, land) : land(x, z)); wrapped.road = land.road; plan._far = wrapped; } }
  for (const o of ctx.scene.children.filter((c) => c.name === 'water')) ctx.scene.remove(o);
  for (let i = ctx.systems.length - 1; i >= 0; i--) if (ctx.systems[i].name === 'water') ctx.systems.splice(i, 1);
  const water = mod.buildWater(ctx);
  await water.ready;
  const T = window.__sea = { api, ctx, coast, pure, mod, lookUniforms, water, on };
  T.view = (x, z, yaw, pitch = 0, hour = 13) => {
    api.setHour(hour); api.teleport(x, z, { yaw, pitch }); api.step(2, 1 / 60);
    ctx.camera.position.x = x; ctx.camera.position.z = z; ctx.camera.updateMatrixWorld(true);
  };
  T.frame = (visible = true) => { T.water.group.visible = visible; api.render(); return ctx.renderer.info.render.calls; };
  if (on('cull')) { water.cull.update = () => { for (const m of water.meshes) m.visible = true; }; for (const m of water.meshes) m.frustumCulled = false; }
  if (on('mesh')) water.cull.remove(water.meshes[2]);
  let n = 0; water.group.traverse((o) => { if (o.isMesh) n++; });             // the meshes the scene graph holds (the sabotage 'mesh' takes one out of it)
  return { meshes: n, errors: ctx.errors.length };
})()`;

before(async () => {
  b = await launch({ width: 1280, height: 720 });
  page = await b.open('la-ladera/index.html?autostart&manual&skip=people,furnish');
  const r = await page.eval(SETUP);
  assert.equal(r.meshes, on('mesh') ? 2 : 3, 'the water is built');
});
after(async () => { await b?.close(); });

test('buildWater: one group of three world-fixed transparent meshes (near, mid, far) with the bed under every vertex, the textures loaded, ctx.sea and the system in place', async (t) => {
  const r = await page.eval(`(() => {
    const T = window.__sea, w = T.water, ctx = T.ctx, bb = (m) => m.geometry.boundingBox;
    const found = []; w.group.traverse((o) => { if (o.isMesh) found.push(o); });                  // what the scene graph holds, not what the module says it built
    return {
      inScene: ctx.scene.children.includes(w.group), name: w.group.name, auto: w.group.matrixAutoUpdate,
      meshes: found.map((m) => ({ name: m.name, transparent: m.material.transparent, depthWrite: m.material.depthWrite, depthTest: m.material.depthTest, cast: m.castShadow, recv: m.receiveShadow, fixed: !m.matrixAutoUpdate,
        order: m.renderOrder, tris: m.geometry.userData.triangles, bed: !!m.geometry.getAttribute('aBed'), min: bb(m).min.toArray(), max: bb(m).max.toArray() })),
      systems: ctx.systems.filter((s) => s.name === 'water').map((s) => s.order),
      sea: ctx.sea ? Object.keys(ctx.sea).sort() : null,
      tex: ['tNormal', 'tFoam', 'tCaustic'].map((k) => { const v = w.uniforms[k].value; return { k, w: v.image?.width ?? 0, wrap: v.wrapS === T.ctx.THREE.RepeatWrapping && v.wrapT === T.ctx.THREE.RepeatWrapping }; }),
    };
  })()`);
  assert.ok(r.inScene && r.name === 'water', 'the group "water" is in the scene');
  assert.equal(r.meshes.length, 3, 'three meshes');
  t.diagnostic(r.meshes.map((m) => `${m.name} ${m.tris} tris`).join('  |  '));
  const [near, mid, far] = r.meshes;
  const within = (a, lo, hi, what) => assert.ok(a >= lo && a <= hi, `${what}: ${a} not in [${lo}, ${hi}]`);
  for (const m of r.meshes) {
    assert.ok(m.transparent && !m.depthWrite && m.depthTest, `${m.name}: transparent, tests depth, does not write it`);
    assert.ok(!m.cast && !m.recv, `${m.name}: no shadows`);
    assert.ok(m.fixed && m.bed, `${m.name}: world-fixed, with a bed height per vertex`);
    assert.ok(m.order < 0, `${m.name}: drawn first among the transparent things (renderOrder ${m.order})`);
    assert.ok(m.max[1] >= SEA + PEAK - 1e-3 && m.min[1] <= SEA - PEAK + 1e-3, `${m.name}: the bounds hold the tallest wave (y ${m.min[1]} .. ${m.max[1]})`);
  }
  within(near.min[0], -132.01, -131.99, 'near x0'); within(near.max[0], 131.99, 132.01, 'near x1'); within(near.min[2], 117.99, 118.01, 'near z0'); within(near.max[2], 261.99, 262.01, 'near z1');
  within(mid.min[0], -480.01, -479.99, 'mid x0'); within(mid.max[0], 479.99, 480.01, 'mid x1'); within(mid.min[2], 117.99, 118.01, 'mid z0'); within(mid.max[2], 597.99, 598.01, 'mid z1');
  within(far.min[0], -960.01, -959.99, 'far x0'); within(far.max[0], 959.99, 960.01, 'far x1'); within(far.min[2], 117.99, 118.01, 'far z0'); within(far.max[2], 981.99, 982.01, 'far z1');
  within(near.tris, 12000, 14500, 'near triangles (13k in 2.4 m cells)');
  assert.ok(near.tris + mid.tris + far.tris < 22000, `the whole sea is ${near.tris + mid.tris + far.tris} triangles`);
  assert.deepEqual(r.systems, [5], 'one system "water" at order 5');
  assert.deepEqual(r.sea, ['depth', 'level', 'slope', 'state', 'submerged', 'time', 'under'], 'ctx.sea has state, level, depth, slope, under, submerged (and the clock)');
  for (const x of r.tex) assert.ok(x.w >= 64 && x.wrap, `${x.k}: the image is loaded (${x.w} px), not the placeholder, and it repeats`);
});

test('the shaders compile and link in every quality tier, with no console errors, shader errors or warnings', async () => {
  const r = await page.eval(`(() => {
    const T = window.__sea, ctx = T.ctx, out = [];
    if (T.on('shader')) { const m = T.water.materials[0]; m.fragmentShader = m.fragmentShader.replace('void main()', 'this_is_not_glsl; void main()'); m.needsUpdate = true; }
    for (const q of ['high', 'medium', 'low', 'high']) {
      T.water.setQuality(q); T.view(-6.5, 104, Math.PI); T.frame(true);
      out.push({ q, linked: T.water.materials.map((m) => { const p = ctx.renderer.properties.get(m).currentProgram; return !!p && (!p.diagnostics || p.diagnostics.runnable !== false); }),
        define: T.water.materials[0].defines.WATER_QUALITY, errors: ctx.errors.filter((e) => e.stage === 'shader' || e.stage === 'water' || e.system === 'water').map((e) => e.message.slice(0, 200)) });
    }
    return out;
  })()`);
  for (const x of r) {
    assert.deepEqual(x.linked, [true, true, true], `${x.q}: all three programs link`);
    assert.deepEqual(x.errors, [], `${x.q}: no shader or water errors in ctx.errors`);
  }
  assert.deepEqual(r.map((x) => x.define), [2, 1, 0, 2], 'the tiers are the shader define 2, 1, 0, 2');
  assert.deepEqual(page.summary(), { errors: [], netErrors: [], consoleErrors: [], consoleWarnings: [] }, 'no console errors, warnings or 404s (the textures are fetched from their files)');
});

test('draw calls: the sea in view costs exactly three, out of view none, hidden none (the cull tests boxes, not the bounding sphere that holds the player)', async (t) => {
  const r = await page.eval(`(() => {
    const T = window.__sea, out = { south: [], north: [], shownSouth: null, shownNorth: null };
    T.water.setQuality('high');
    T.view(-6.5, 104, Math.PI); T.frame(true); T.frame(false);                                         // warm: programs, shadow maps, the first frame of a view
    for (let i = 0; i < 3; i++) { const a = T.frame(true), h = T.frame(false); out.south.push([a, h]); }
    T.frame(true); out.shownSouth = T.water.stats().shown;
    T.view(-6.5, 90, 0); T.frame(true); T.frame(false);
    for (let i = 0; i < 3; i++) { const a = T.frame(true), h = T.frame(false); out.north.push([a, h]); }
    T.frame(true); out.shownNorth = T.water.stats().shown;
    return out;
  })()`);
  t.diagnostic(`from the promenade looking south: [with the sea, without] = ${JSON.stringify(r.south)}   from z = 90 looking north: ${JSON.stringify(r.north)}`);
  for (const [a, h] of r.south) assert.equal(a - h, 3, `looking south from the promenade the sea costs ${a - h} draws, expected 3 (with ${a}, group hidden ${h})`);
  assert.deepEqual(r.shownSouth, [true, true, true], 'all three meshes are in view from the promenade');
  for (const [a, h] of r.north) assert.equal(a - h, 0, `looking north from z = 90 the sea costs ${a - h} draws, expected 0 (with ${a}, group hidden ${h})`);
  assert.deepEqual(r.shownNorth, [false, false, false], 'no mesh is in view looking north');
});

test('a frame from the promenade is not blank, the sea changes it, and the picture is saved for a person to look at', async (t) => {
  await page.eval(`(() => { const T = window.__sea; T.water.setQuality('high'); T.view(-6.5, 104, Math.PI); })()`);
  const r = await page.eval(`(() => {
    const T = window.__sea, ctx = T.ctx, cv = ctx.renderer.domElement, c = document.createElement('canvas'); c.width = 48; c.height = 27;
    const g = c.getContext('2d', { willReadFrequently: true });
    const grab = (visible) => { T.water.group.visible = visible; T.api.render(); g.drawImage(cv, 0, 0, 48, 27); return Array.from(g.getImageData(0, 0, 48, 27).data); };
    if (T.on('blank')) ctx.scene.visible = false;
    try { const withSea = grab(true), without = grab(false); return { withSea, without }; } finally { ctx.scene.visible = true; T.water.group.visible = true; }
  })()`);
  const luma = (d, i) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
  const cells = r.withSea.length / 4;
  let mean = 0, sq = 0; const seen = new Set();
  for (let i = 0; i < r.withSea.length; i += 4) { const l = luma(r.withSea, i); mean += l; sq += l * l; seen.add((r.withSea[i] >> 4) * 256 + (r.withSea[i + 1] >> 4) * 16 + (r.withSea[i + 2] >> 4)); }
  mean /= cells; const sd = Math.sqrt(Math.max(0, sq / cells - mean * mean));
  let diff = 0, n = 0; for (let i = 0; i < r.withSea.length; i += 4) for (let k = 0; k < 3; k++) { diff += Math.abs(r.withSea[i + k] - r.without[i + k]); n++; }
  diff /= n;
  t.diagnostic(`mean luma ${mean.toFixed(3)}  luma sd ${sd.toFixed(3)}  colours ${seen.size}  mean |with sea - without| ${diff.toFixed(2)} / 255`);
  assert.ok(mean > 0.04 && mean < 0.96, `mean luma ${mean.toFixed(3)}`);
  assert.ok(sd > 0.03, `luma spread ${sd.toFixed(3)}: the frame is flat`);
  assert.ok(seen.size > 25, `${seen.size} distinct colours: the frame is blank`);
  assert.ok(diff > 0.3, `the sea changes the frame by ${diff.toFixed(2)} / 255: it is not drawn`);
  if (OUT) await page.canvasShot(resolve(OUT, 'engine-water-promenade.jpg'), { w: 1280 });
});

test('the water is wired to the sky and the clock: the sky\'s own uniforms by reference, the fog and the pixel size of the frame being drawn, the sea state of the hour', async () => {
  const r = await page.eval(`(() => {
    const T = window.__sea, ctx = T.ctx, w = T.water, u = w.uniforms, sky = ctx.look.sky.uniforms, P = T.pure, out = { hours: [] };
    if (T.on('wire')) w.materials[1].uniforms.uSunDir = { value: u.uSunDir.value.clone() };
    const keys = ['uZenith', 'uHorizon', 'uSunDir', 'uSunCol', 'uMoonDir', 'uGlowCol', 'uGlowAmt', 'uSunVis', 'uMoonVis'];
    out.sky = keys.filter((k) => u[k] !== sky[k] || w.materials.some((m) => m.uniforms[k] !== sky[k]));
    out.glow = ['ladGlowCol', 'ladGlowAmt'].filter((k) => u[k] !== T.lookUniforms[k] || w.materials.some((m) => m.uniforms[k] !== T.lookUniforms[k]));
    for (const hour of [7, 13, 17.5, 21, 3]) {
      T.view(-6.5, 104, Math.PI, 0, hour); T.frame(true);
      const st = P.seaState(hour), amps = P.waveAmps(st), fog = ctx.scene.fog;
      out.hours.push({ hour, wind: ctx.sea.state.wind, want: st.wind, uWa: u.uWa.value.toArray(), amps, fogDensity: [u.uFogDensity.value, fog.density], fogColour: [u.uFogColor.value.toArray(), fog.color.toArray()],
        pix: u.uPix.value, pixWant: 2 * Math.tan(ctx.camera.fov * Math.PI / 360) / ctx.renderer.domElement.height, sun: [u.uSunDir.value.toArray(), sky.uSunDir.value.toArray()] });
    }
    return out;
  })()`);
  assert.deepEqual(r.sky, [], 'every sky uniform of the water is the sky\'s own object, on the shared uniforms and on each of the three materials');
  assert.deepEqual(r.glow, [], 'the sun-scatter glow uniforms are the standard materials\' own');
  for (const h of r.hours) {
    assert.equal(h.wind, h.want, `hour ${h.hour}: ctx.sea.state.wind`);
    h.uWa.forEach((a, i) => assert.ok(Math.abs(a - h.amps[i]) < 1e-6, `hour ${h.hour}: wave ${i} amplitude ${a} vs ${h.amps[i]}`));
    assert.equal(h.fogDensity[0], h.fogDensity[1], `hour ${h.hour}: the fog density of the frame being drawn`);
    h.fogColour[0].forEach((c, i) => assert.ok(Math.abs(c - h.fogColour[1][i]) < 1e-6, `hour ${h.hour}: fog colour ${i}`));
    assert.ok(h.pix > 0.3 * h.pixWant && h.pix < 3 * h.pixWant, `hour ${h.hour}: pixel angle ${h.pix} against ${h.pixWant} for the canvas`);
    assert.deepEqual(h.sun[0], h.sun[1], `hour ${h.hour}: the sun direction is the sky's`);
  }
  const by = Object.fromEntries(r.hours.map((h) => [h.hour, h]));
  assert.equal(by[13].wind, 1, 'full breeze at 13:00'); assert.equal(by[17.5].wind, 1, 'and at 17:30'); assert.equal(by[7].wind, 0.35, 'calm at dawn'); assert.equal(by[21].wind, 0.35, 'calm at night');
  assert.ok(by[13].uWa[0] > by[7].uWa[0] * 1.7, 'the long swell is 1.8 times higher in the afternoon breeze');
});

test('the swell on the GPU is the swell of core/sea.js: the shader\'s own wave sum, rendered to a float target, agrees within 5 mm at 4096 points, now and a day later', async (t) => {
  const r = await page.eval(`(async () => {
    const T = window.__sea, ctx = T.ctx, w = T.water, u = w.uniforms, THREE = await import('three'), { WAVE_GLSL } = T.mod, rd = ctx.renderer;
    if (!rd.extensions.has('EXT_color_buffer_float')) return { skip: 'no EXT_color_buffer_float' };
    const N = 64, rt = new THREE.WebGLRenderTarget(N, N, { type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false });
    const mat = new THREE.ShaderMaterial({
      uniforms: { uWk: u.uWk, uWx: u.uWx, uWz: u.uWz, uWp: u.uWp, uWa: u.uWa, uWt: u.uWt, uOrigin: { value: new THREE.Vector2(-30, 120) }, uStep: { value: new THREE.Vector2(60 / N, 60 / N) } },
      vertexShader: 'void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
      fragmentShader: WAVE_GLSL + 'uniform vec2 uOrigin, uStep; void main() { vec2 p = uOrigin + floor( gl_FragCoord.xy ) * uStep; gl_FragColor = vec4( waveHeight( p ), 0.0, 0.0, 1.0 ); }',
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false; scene.add(quad);
    const buf = new Float32Array(N * N * 4), out = [];
    const probe = (label) => {
      w.group.visible = true; w.update(0);                                       // the uniforms of this very moment
      if (T.on('parity')) u.uWa.value.x *= 2;
      const prev = rd.getRenderTarget(); rd.setRenderTarget(rt); rd.render(scene, cam); rd.readRenderTargetPixels(rt, 0, 0, N, N, buf); rd.setRenderTarget(prev);
      if (T.on('parity')) u.uWa.value.x /= 2;
      const t = ctx.sea.time, state = ctx.sea.state; let worst = 0, top = 0, sum = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = -30 + 60 / N * i, z = 120 + 60 / N * j, want = T.pure.level(x, z, t, state), got = buf[(j * N + i) * 4];
        worst = Math.max(worst, Math.abs(got - want)); top = Math.max(top, Math.abs(want)); sum += Math.abs(got - want);
      }
      out.push({ label, t, worst, top, mean: sum / (N * N), wind: state.wind });
    };
    T.view(-6.5, 104, Math.PI, 0, 15); probe('15:00');
    w.update(86400); probe('a day later');
    rt.dispose(); mat.dispose(); quad.geometry.dispose();
    return { out };
  })()`);
  if (r.skip) { t.skip(r.skip); return; }
  t.diagnostic(r.out.map((o) => `${o.label}: largest error ${(o.worst * 1000).toFixed(3)} mm, mean ${(o.mean * 1000).toFixed(3)} mm, swell up to ${o.top.toFixed(3)} m (t ${o.t.toFixed(1)} s, wind ${o.wind})`).join('  |  '));
  for (const o of r.out) {
    assert.ok(o.top > 0.1, `${o.label}: the swell the probe compares is ${o.top} m high, not flat`);
    assert.ok(o.worst < 0.005, `${o.label}: the GPU's wave sum is ${(o.worst * 1000).toFixed(2)} mm from core/sea.js`);
  }
});

test('ctx.sea answers what the shader draws: level and slope are the swell times the near mesh\'s weight, depth is the water over the ground, and the waterline is on the beach', async () => {
  const r = await page.eval(`(() => {
    const T = window.__sea, ctx = T.ctx, S = ctx.sea, P = T.pure, coast = ctx.plan.coast, out = { level: 0, slope: 0, num: 0, depth: 0, n: 0 };
    if (T.on('sea')) S.depth = () => 0;
    T.view(-6.5, 104, Math.PI, 0, 15); T.frame(true); T.water.update(7.25);
    const t = S.time, st = S.state; let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 400; i++) {
      const x = -140 + 280 * rnd(), z = 110 + 170 * rnd(), wgt = P.nearWeight(x, z);
      out.level = Math.max(out.level, Math.abs(S.level(x, z) - P.level(x, z, t, st) * wgt));
      const g = S.slope(x, z), sl = P.slope(x, z, t, st), gw = P.nearWeightGrad(x, z), h = P.level(x, z, t, st);
      out.slope = Math.max(out.slope, Math.abs(g[0] - (sl[0] * wgt + h * gw[0])), Math.abs(g[1] - (sl[1] * wgt + h * gw[1])));
      const e = 0.01, nx = (S.level(x + e, z) - S.level(x - e, z)) / (2 * e), nz = (S.level(x, z + e) - S.level(x, z - e)) / (2 * e); out.num = Math.max(out.num, Math.abs(nx - g[0]), Math.abs(nz - g[1]));
      if (Math.abs(x) <= 100 && z > 100) { out.depth = Math.max(out.depth, Math.abs(S.depth(x, z) - (${SEA} + S.level(x, z) - coast.heightAt(x, z)))); out.n++; }
    }
    out.at = { deck: S.depth(-6.5, 104), sand: S.depth(-6.5, 125), swim: S.depth(-6.5, 200), deep: S.depth(-6.5, 215), edge: [S.level(-6.5, P.NEAR.z1), S.level(P.NEAR.x, 150), S.level(-P.NEAR.x, 200), S.level(0, P.NEAR.z1 + 30)], inside: Math.max(...[-90, -60, -6.5, 0, 40, 90].map((x) => Math.abs(S.level(x, P.NEAR.z1 - 1)))) };
    let lo = 118, hi = 215; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (S.depth(-6.5, m) < 0) lo = m; else hi = m; } out.waterline = lo;
    out.still = coast.depthAt(-6.5, 150) + S.level(-6.5, 150, t);
    out.depthAt = S.depth(-6.5, 150);
    return out;
  })()`);
  assert.ok(r.level < 1e-9, `level is the swell times nearWeight (off by ${r.level})`);
  assert.ok(r.slope < 1e-9, `slope is the swell's gradient times nearWeight plus the swell times the weight's gradient (off by ${r.slope})`);
  assert.ok(r.num < 1e-4, `slope agrees with the numeric derivative of level, tapers included (off by ${r.num})`);
  assert.ok(r.n > 100 && r.depth < 1e-9, `depth is the still sea plus the swell minus plan.coast's ground at ${r.n} points (off by ${r.depth})`);
  assert.ok(r.at.deck < -1, `the promenade deck is dry land: ${r.at.deck}`);
  assert.ok(r.at.sand < -0.2, `the sand at z = 125 is dry: ${r.at.sand}`);
  assert.ok(r.at.swim > 2 && r.at.swim < 3.6, `at the swim line (z = 200) the water is 2 to 3.6 m deep: ${r.at.swim}`);
  assert.ok(r.at.deep > r.at.swim, `deeper at the buoy line than at the swim line: ${r.at.deep} against ${r.at.swim}`);
  assert.ok(r.at.edge.every((v) => Math.abs(v) < 1e-9), `no swell on the joins of the near mesh, nor past them: ${r.at.edge}`);
  assert.ok(r.at.inside > 1e-4, `and some a metre inside the edge (the swell dies AT the join, not before it): ${r.at.inside}`);
  assert.ok(r.waterline > 134 && r.waterline < 155, `the waterline at x = -6.5 is at z = ${r.waterline.toFixed(1)} (the still shore is at 144.2; a 0.5 m swell on a 1:16 beach moves it by up to 9 m)`);
  assert.ok(Math.abs(r.depthAt - r.still) < 1e-9, `depth(x, z) is coast.depthAt plus the swell: ${r.depthAt} against ${r.still}`);
});

test('quality tiers: the near mesh is 6, 4 and 2.4 m cells, only high and medium move it, the mid mesh follows it (its fans run through the near mesh\'s vertices), every tier draws three meshes, setQuality follows the engine', async (t) => {
  const r = await page.eval(`(() => {
    const T = window.__sea, ctx = T.ctx, w = T.water, out = [];
    if (T.on('quality')) w.setQuality = () => {};
    T.view(-6.5, 104, Math.PI);
    for (const q of ['low', 'medium', 'high']) {
      w.setQuality(q); const a = T.frame(true), h = T.frame(false), s = w.stats(), want = T.pure.seaMeshes(s.cell);
      out.push({ q, cell: s.cell, near: s.near, mid: s.mid, far: s.far, want: [want.near.tris, want.mid.tris, want.far.tris], define: w.materials[0].defines.WATER_QUALITY, disp: w.materials.map((m) => m.uniforms.uDisp.value), draws: a - h,
        bbMaxY: w.meshes[0].geometry.boundingBox.max.y, idx: w.meshes.map((m) => m.geometry.index.count / 3) });
    }
    const viaEngine = [];
    for (const q of ['medium', 'low', 'high']) { ctx.setQuality(q); viaEngine.push([q, w.stats().quality, w.stats().cell]); }
    return { out, viaEngine };
  })()`);
  t.diagnostic(r.out.map((o) => `${o.q}: ${o.cell} m cells, ${o.near} near + ${o.mid} mid + ${o.far} far triangles, ${o.draws} draws`).join('  |  '));
  assert.deepEqual(r.out.map((o) => o.cell), [6, 4, 2.4], 'near mesh cell by tier');
  assert.ok(r.out[0].near < r.out[1].near && r.out[1].near < r.out[2].near, 'fewer triangles at lower tiers');
  for (const o of r.out) {
    assert.deepEqual([o.near, o.mid, o.far], o.want, `${o.q}: the meshes are the layout core/sea.js makes for ${o.cell} m cells (the mid mesh was rebuilt with the near one)`);
    assert.deepEqual(o.idx, o.want, `${o.q}: and the index buffers on the meshes hold those triangles`);
  }
  assert.deepEqual(r.out.map((o) => o.define), [0, 1, 2], 'the shader define');
  assert.deepEqual(r.out.map((o) => o.disp), [[0, 0, 0], [1, 0, 0], [1, 0, 0]], 'only the near mesh moves, and not at low');
  for (const o of r.out) { assert.equal(o.draws, 3, `${o.q}: three draws`); assert.ok(o.bbMaxY >= SEA + PEAK - 1e-3, `${o.q}: bounds hold the tallest wave`); }
  assert.deepEqual(r.viaEngine, [['medium', 1, 4], ['low', 0, 6], ['high', 2, 2.4]], 'ctx.setQuality moves the water through quality:change');
});

// A pinhole is a pixel where the sea bed (or the sky) shows through the sea along a join between two meshes (the earlier layouts, meshes that abut or overlap with a position test in the pixel shader,
// had them at about 1 in 100 samples from the air and as dashes along the join at a person's eye, where one pixel spans tens of metres and its MSAA samples straddle the join). The sea alone is
// drawn twice from the same camera, over dim magenta and over black; a deep-water pixel (96% opaque) differs by a few levels between the two, a hole by all of them. Samples are taken along the
// joins, in deep water only (the shallows are see-through by design), and the picture has the sea reaching its edges (see SETUP).
test('the joins hold: with only the sea drawn, over magenta and over black, no pixel along the joins between the three meshes differs, from the air and from where a person stands', async (t) => {
  const r = await page.eval(`(async () => {
    const T = window.__sea, ctx = T.ctx, w = T.water, api = T.api, THREE = await import('three'), { NEAR, MESH } = T.pure;
    const SEA = -1.2, cv = ctx.renderer.domElement, W = cv.width, H = cv.height, PI = Math.PI, mid = w.meshes[1];
    if (T.on('seam')) { mid.position.set(3, 0, 3); mid.updateMatrix(); }                 // the mid mesh 3 m off: a gap along the join
    const saved = ctx.scene.children.map((c) => [c, c.visible]), bg = ctx.scene.background;
    for (const c of ctx.scene.children) c.visible = c === w.group;
    w.group.visible = true; w.setQuality('high');
    const c2 = document.createElement('canvas'); c2.width = W; c2.height = H; const g = c2.getContext('2d', { willReadFrequently: true });
    const MAG = new THREE.Color(0.3, 0, 0.3), BLK = new THREE.Color(0, 0, 0);      // dim, so that the bloom (which takes what is brighter than its threshold) does not spread the background over the sea
    const poly = (pts, step) => { const o = []; for (let i = 0; i + 1 < pts.length; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / step)); for (let k = 0; k <= n; k++) o.push([x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n]); } return o; };
    const nx = NEAR.x, nz = NEAR.z1, mz = MESH.mid.z1;
    const near = [...poly([[-nx, 170], [-nx, nz]], 0.5), ...poly([[nx, 170], [nx, nz]], 0.5), ...poly([[-nx, nz], [nx, nz]], 0.5)], midJoin = poly([[-340, mz], [340, mz]], 1.0);
    let seed = 20241029; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const views = [];
    for (const [x, y, z, yaw, pitch] of [[0, 60, 100, PI, -0.62], [0, 250, 90, PI, -0.95], [0, 520, 250, PI, -0.8], [-200, 330, 100, PI + 0.7, -0.6], [150, 120, 120, PI - 0.5, -0.45]]) views.push({ x, y, z, yaw, pitch, hour: 15, seams: near.concat(midJoin), air: true });
    for (let n = 0; n < 24; n++) {
      const z = [104, 125, 140, 150, 170, 190][n % 6], x = -90 + 180 * rnd();
      views.push({ x, y: z <= 108 ? 1.84 : (z < 144 ? 0.7 : 0.2) + 1.64 * (rnd() < 0.7 ? 1 : 1.8), z, yaw: PI + (rnd() - 0.5) * 2, pitch: -0.02 - 0.12 * rnd(), hour: [7, 13, 15, 17.5, 21][n % 5], seams: near, air: false });
    }
    const v = new THREE.Vector3(), out = { views: views.length, samples: 0, holes: 0, bad: [] };
    try {
      for (const vw of views) {
        api.setHour(vw.hour); api.teleport(vw.x, vw.z, { yaw: vw.yaw, pitch: vw.pitch }); api.step(1, 0);
        ctx.camera.position.set(vw.x, vw.y, vw.z); ctx.camera.rotation.set(vw.pitch, vw.yaw, 0, 'YXZ'); ctx.camera.updateMatrixWorld(true);
        ctx.scene.background = MAG; api.render(); g.drawImage(cv, 0, 0); const a = g.getImageData(0, 0, W, H).data.slice();
        ctx.scene.background = BLK; api.render(); g.drawImage(cv, 0, 0); const b = g.getImageData(0, 0, W, H).data;
        for (const [px, pz] of vw.seams) {
          if (ctx.sea.depth(px, pz) < 3.5) continue;
          v.set(px, SEA, pz).applyMatrix4(ctx.camera.matrixWorldInverse);
          if (v.z > -1) continue;
          v.applyMatrix4(ctx.camera.projectionMatrix);
          const sx = Math.round((v.x + 1) / 2 * (W - 1)), sy = Math.round((1 - v.y) / 2 * (H - 1));
          if (sx < 2 || sx > W - 3 || sy < 2 || sy > H - 3) continue;
          out.samples++;
          let hole = false;
          for (let dy = -1; dy <= 1 && !hole; dy++) for (let dx = -1; dx <= 1; dx++) { const i = ((sy + dy) * W + sx + dx) * 4; if (a[i] - b[i] > 60 && a[i + 2] - b[i + 2] > 60) { hole = true; break; } }
          if (hole) { out.holes++; if (out.bad.length < 6) out.bad.push([vw.air ? 'air' : 'eye', +px.toFixed(1), +pz.toFixed(1), sx, sy, vw.hour]); }
        }
      }
    } finally {
      for (const [c, vis] of saved) c.visible = vis;
      ctx.scene.background = bg;
      mid.position.set(0, 0, 0); mid.updateMatrix();
    }
    return out;
  })()`);
  t.diagnostic(`${r.views} views, ${r.samples} samples along the joins in deep water, ${r.holes} holes${r.bad.length ? ', first at ' + JSON.stringify(r.bad) : ''}`);
  assert.ok(r.samples > 10000, `the probe reached ${r.samples} samples along the joins`);
  assert.equal(r.holes, 0, `${r.holes} of ${r.samples} samples along the joins show what lies behind the sea, first at ${JSON.stringify(r.bad)}`);
});

test('hidden costs nothing: no uniform work, only the clock runs; dispose takes the group, the system, ctx.sea and every GPU object away, and a second build works', async () => {
  const r = await page.eval(`(() => {
    const T = window.__sea, ctx = T.ctx, w = T.water, u = w.uniforms, out = {};
    T.water.setQuality('high'); T.view(-6.5, 104, Math.PI, 0, 15); T.frame(true);
    const t0 = ctx.sea.time, wt = u.uWt.value.toArray(), fl = u.uFlow.value.toArray();
    w.group.visible = false; w.update(2.5);
    out.hidden = { dt: ctx.sea.time - t0, sameWt: JSON.stringify(wt) === JSON.stringify(u.uWt.value.toArray()), sameFlow: JSON.stringify(fl) === JSON.stringify(u.uFlow.value.toArray()), wind: ctx.sea.state.wind };
    w.group.visible = true; w.update(0);
    out.visible = { moved: JSON.stringify(wt) !== JSON.stringify(u.uWt.value.toArray()) };
    T.frame(true);
    const info = ctx.renderer.info, mem0 = { g: info.memory.geometries, t: info.memory.textures, p: info.programs.length };
    if (T.on('dispose')) w.dispose = () => {};
    out.drawsBefore = T.frame(true) - T.frame(false);
    w.dispose(); w.dispose();                                                  // twice: the second call is harmless
    out.dispose = { inScene: ctx.scene.children.some((c) => c.name === 'water'), systems: ctx.systems.filter((s) => s.name === 'water').length, sea: 'sea' in ctx,
      freed: { geometries: mem0.g - info.memory.geometries, textures: mem0.t - info.memory.textures, programs: mem0.p - info.programs.length } };
    out.drawsAfter = T.frame(true) - T.frame(false);
    // a second build, as a hot reload would make it
    const again = T.mod.buildWater(ctx); T.water = again;
    out.again = { draws: T.frame(true) - T.frame(false), sea: !!ctx.sea, systems: ctx.systems.filter((s) => s.name === 'water').length };
    return out;
  })()`);
  assert.equal(r.hidden.dt, 2.5, 'the clock runs while the sea is hidden, so the swell is where it should be when it comes back');
  assert.ok(r.hidden.sameWt && r.hidden.sameFlow, 'hidden: no uniform is touched');
  assert.equal(r.hidden.wind, 1, 'ctx.sea.state is kept current while hidden');
  assert.ok(r.visible.moved, 'visible again: the wave phases move');
  assert.equal(r.drawsBefore, 3, 'three draws before dispose');
  assert.equal(r.dispose.inScene, false, 'dispose took the group out of the scene');
  assert.equal(r.dispose.systems, 0, 'dispose took the system out');
  assert.equal(r.dispose.sea, false, 'dispose took ctx.sea away');
  assert.deepEqual([r.dispose.freed.geometries, r.dispose.freed.textures], [3, 3], 'dispose freed the three geometries and the three textures on the GPU');
  assert.ok(r.dispose.freed.programs >= 1, `dispose released the shader program (${r.dispose.freed.programs})`);
  assert.equal(r.drawsAfter, 0, 'after dispose the frame has no sea in it');
  assert.equal(r.again.draws, 3, 'a second build draws three meshes again');
  assert.ok(r.again.sea && r.again.systems === 1, 'a second build has ctx.sea and exactly one system');
  assert.deepEqual(page.summary(), { errors: [], netErrors: [], consoleErrors: [], consoleWarnings: [] }, 'no console errors, warnings or 404s over the whole run');
});
