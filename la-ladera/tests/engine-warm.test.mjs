// The boot warm-up (owner: A1, js/engine/warm.js): one frame of the whole scene, through the real render path, before the first real frame.
// Review R2a-002/003: the first frame inside L22, L31 and L40 took 54-64 ms because the shadow-depth variant, the lamp line and the dust points compiled there
// and 80-150 chunk geometries and up to 17 atlas textures were uploaded (the same upload spikes hit the ridge, the valley and the streets). A frame's time is
// noise on a shared box, so this counts what the first frame MAKES: programs compiled, textures and geometries uploaded. After the warm-up that is nothing
// (a handful of geometries the rooms build on entry: a drawer, a door).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-warm.test.mjs
// Run the same entries with ?skip=warm and L31 / L40 compile a program and upload 3-16 textures and 150 geometries: that is the control this test fails on.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';

// Review R2c-013: main.js starts the animation loop itself, after the warm-up (ctx.startLoop), and ?manual is the page with NO loop: its tests drive every frame by hand. Every
// animation-frame callback that drew a real frame (ctx.render() counts it in ctx.stats.frames) is counted here. With ?manual there must be none, not even the single frame a loop
// started by mistake would draw before it noticed the flag (frame() has a second guard, so the mistake costs one frame, not a loop: a count of "did the frames keep growing" misses it).
const HOOK = `(() => {
  const T = window.__rafDraws = { n: 0, at: [] };
  const raf0 = window.requestAnimationFrame.bind(window), frames = () => window.__ladera?.ctx?.stats?.frames ?? 0;
  window.requestAnimationFrame = (cb) => raf0((t) => { const f0 = frames(); try { return cb(t); } finally { if (frames() > f0) { T.n++; T.at.push(Math.round(performance.now())); } } });
})()`;

let b, page;
before(async () => {
  b = await launch({ width: 1280, height: 720 });
  await b.page.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
});
after(async () => { await b?.close(); });

const ENTER = (id) => `(() => {
  const L = __ladera, ctx = L.ctx, r = ctx.renderer, gl = r.getContext(), sp = ctx.plan.spawn;
  L.teleport(sp.x, sp.z, { yaw: sp.yaw ?? 0 }); for (let i = 0; i < 6; i++) ctx.step(1 / 30); ctx.render(); ctx.render(); gl.finish();
  const bp = L.buildings().find((x) => x.id === ${JSON.stringify(id)}), e = bp.entrances[0];
  const m0 = { p: r.info.programs.length, t: r.info.memory.textures, g: r.info.memory.geometries };
  L.teleport(e.inside[0], e.inside[2], { y: e.inside[1], yaw: e.yawIn ?? 0 });
  ctx.step(1 / 60); const t0 = performance.now(); ctx.render(); gl.finish(); const ms = performance.now() - t0;
  return { id: ${JSON.stringify(id)}, kind: bp.kind, programs: r.info.programs.length - m0.p, textures: r.info.memory.textures - m0.t, geometries: r.info.memory.geometries - m0.g, ms: +ms.toFixed(1), indoors: !!ctx.player.indoors, building: ctx.player.building };
})()`;

test('boot: the warm-up frame made the programs, textures and geometries of the whole scene, and left every object as it found it', async () => {
  page = await b.open('la-ladera/index.html?autostart&manual');
  const s = await page.eval(`(() => {
    const ctx = __ladera.ctx, st = __ladera.state(), scene = ctx.scene, glow = scene.getObjectByName('glow');
    let hidden = 0, unculled = 0, total = 0; scene.traverse((o) => { total++; if (!o.visible) hidden++; if (!o.frustumCulled) unculled++; });
    const ints = ctx.visibility.ints, shown = ints.filter((i) => i.obj.visible).length;
    const info = ctx.renderer.info, last = { calls: info.render.calls, triangles: info.render.triangles, statsCalls: ctx.stats.drawCalls, statsTriangles: ctx.stats.triangles };
    return { warm: ctx.warm, timing: ctx.timings.warm, state: st.warm, hidden, unculled, total, ints: ints.length, shown, intsOn: ints.filter((i) => i.on).length, glowVisible: glow?.visible, night: ctx.night, errors: st.errors, last };
  })()`);
  assert.ok(s.warm && s.warm.ms > 0, 'ctx.warm says what the frame cost: ' + JSON.stringify(s.warm));
  assert.deepEqual(s.state, s.warm, '__ladera.state().warm is the same record');
  assert.ok(s.timing > 0, 'the stage is timed');
  assert.ok(s.warm.objects > 5000, `the frame covered the whole scene: ${s.warm.objects} objects`);
  assert.equal(s.total, s.warm.objects, 'and nothing was added or removed by it');
  assert.ok(s.warm.geometries > 1000, `it uploaded the chunk and interior geometries: ${s.warm.geometries}`);
  assert.ok(s.warm.textures > 10, `and the atlases: ${s.warm.textures}`);
  assert.ok(s.warm.programs >= 1, `and compiled programs the first frames never needed: ${s.warm.programs}`);
  // everything is back as the systems keep it: the interiors far away hidden, the glow points only at night, the objects culled again
  assert.equal(s.intsOn, s.shown, `every interior group is visible exactly when the visibility system says so (${s.shown} of ${s.ints})`);
  assert.ok(s.shown < s.ints / 2, `the far interiors are hidden again: ${s.shown} of ${s.ints} shown`);
  assert.equal(s.glowVisible, s.night > 0.01, 'the glow points follow the night, not the warm-up');
  assert.equal(s.unculled, s.warm.uncullable, `frustum culling is back on for every object that had it: ${s.unculled} are not culled now, ${s.warm.uncullable} were not before`);
  assert.equal(s.errors, 0, 'no boot error');
  // the last thing drawn is a normal frame, not the warm one (every interior at once): the render counters belong to a ctx.render() and are far below the warm frame's
  assert.ok(s.warm.calls > 2000, `the warm frame drew everything: ${s.warm.calls} calls`);
  assert.equal(s.last.calls, s.last.statsCalls, 'the page went idle after a ctx.render(): its draw calls are the stats\'');
  assert.equal(s.last.triangles, s.last.statsTriangles, '... and its triangles');
  assert.ok(s.last.calls < s.warm.calls / 2, `the canvas holds a normal frame (${s.last.calls} draw calls), not the warm one (${s.warm.calls})`);
  assert.ok(s.last.triangles < s.warm.triangles / 2, `... ${s.last.triangles} triangles against ${s.warm.triangles}`);
});

test('?manual stays a page with no animation loop: the end of the boot starts no frame of its own (main.js calls ctx.startLoop after the warm-up)', async () => {
  // three animation frames (bounded: a hidden page is given none): whatever the boot left pending has run by then
  await page.eval(`Promise.race([new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))), new Promise((r) => setTimeout(r, 3000))]).then(() => true)`);
  const r = await page.eval('({ n: window.__rafDraws.n, at: window.__rafDraws.at })');
  assert.equal(r.n, 0, `${r.n} animation frame(s) drew a real frame in ?manual (at ${r.at.join(', ')} ms): ctx.startLoop() did not honour the flag`);
});

test('the first frame inside L22, L31 and L40 (and a hall and a kiosk) compiles nothing and uploads no texture; the rooms add a few geometries of their own', async () => {
  for (const id of ['L22', 'L31', 'L40', 'L10', 'L01']) {
    const r = await page.eval(ENTER(id), 120000);
    assert.equal(r.building, id, `${id}: the player is in it`);
    assert.equal(r.programs, 0, `${id} (${r.kind}): the first frame compiled ${r.programs} program(s)`);
    assert.equal(r.textures, 0, `${id} (${r.kind}): the first frame uploaded ${r.textures} texture(s)`);
    assert.ok(r.geometries <= 40, `${id} (${r.kind}): the first frame uploaded ${r.geometries} geometries (a drawer, a door: not a room)`);
  }
});

test('the console stayed clean', async () => {
  const s = page.summary();
  assert.deepEqual([s.errors, s.netErrors, s.consoleErrors, s.consoleWarnings], [[], [], [], []]);
});
