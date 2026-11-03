// A room behind the lit glass, in pixels (owner: A1; review round 6, R1-104: "at night lit windows are flat uniform yellow panels with no room behind them, so facades read as cut-outs").
// The real `window_lit` material of the running game (js/engine/windowroom.js) on one pane, seen from the street at 22:00: it shows a room (a ceiling, walls, a lamp: the pane is far from one
// flat colour); at 23:00 a room whose evening is over is dark glass, and an all-night room is still lit; from inside the building the same pane is dark glass, no glow (R1-202);
// a pane that names a furnished room in the room-look table wears that room's wall paint (R1-211). The clock reaches the material
// through engine/look.js `setHour`. The node half (shader text, the barrio's panes, the evening rule) is tests/engine-windowroom.test.mjs.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-windowroom-page.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';

const N = 96;
// The pane's code, 2 + 8 x on-slot + off-slot + look (arch/mb.js roomSeed), written out so the test runs (and fails on its pixels) against a tree without it:
// both come on at 17:30 (slot 0); BED goes off at 22:45 (slot 2), OWL is on all night (slot 7); the same room otherwise.
const LOOK = 0.37 * 0.999, BED = 2 + 8 * 0 + 2 + LOOK, OWL = 2 + 8 * 0 + 7 + LOOK;
// One pane, 1.2 x 1.3 m, facing +z (its front face is the street side: width +1.2), the camera 4 m out on the street side (or 4 m in, behind it), a float target so the glow is not clipped;
// the middle of the pane is measured in linear light, each pixel compressed as l / (1 + l).
const PANE = (hour, code, inside, look = null) => `(() => {
  const L = __ladera, ctx = L.ctx, THREE = ctx.THREE, r = ctx.renderer, N = ${N};
  L.setHour(${hour});
  const m = ctx.mat('window_lit'), W = 1.2, H = 1.3, look = ${JSON.stringify(look)}, SLOT = 2000;
  let c = [${code}, W, H];
  if (look) {                                                                     // R1-211: a furnished room in slot 2000 of the room-look table (wall rgb, kind; lamp rgb, known), and the pane names it
    const tex = m.userData.lrU.lrLooks.value, o = ((SLOT >> 6) * 128 + 2 * (SLOT & 63)) * 4; tex.image.data.set(look, o); tex.needsUpdate = true; c = [${code}, W, H + 8 * SLOT];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-W / 2, -H / 2, 0, W / 2, -H / 2, 0, W / 2, H / 2, 0, -W / 2, H / 2, 0], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute([...c, ...c, ...c, ...c], 3)); geo.setIndex([0, 1, 2, 0, 2, 3]);
  const scene = new THREE.Scene(); scene.add(new THREE.Mesh(geo, m));
  const cam = new THREE.PerspectiveCamera(22, 1, 0.1, 100); cam.position.set(0, 0, ${inside ? -4 : 4}); cam.lookAt(0, 0, 0);
  const rt = new THREE.WebGLRenderTarget(N, N, { type: THREE.FloatType }), keep = r.getRenderTarget(); r.setRenderTarget(rt); r.setClearColor(0x000000, 1); r.clear(); r.render(scene, cam);
  const px = new Float32Array(N * N * 4); r.readRenderTargetPixels(rt, 0, 0, N, N, px); r.setRenderTarget(keep); rt.dispose(); geo.dispose();
  const lum = [], rgb = [0, 0, 0]; for (let y = 30; y < 66; y++) for (let x = 30; x < 66; x++) { const i = (y * N + x) * 4, l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]; lum.push(l / (1 + l)); for (let k = 0; k < 3; k++) rgb[k] += px[i + k]; }   // the middle of the pane, compressed
  if (look) { const tex = m.userData.lrU.lrLooks.value; tex.image.data.fill(0, ((SLOT >> 6) * 128 + 2 * (SLOT & 63)) * 4, ((SLOT >> 6) * 128 + 2 * (SLOT & 63)) * 4 + 8); tex.needsUpdate = true; }
  const mean = lum.reduce((a, b) => a + b, 0) / lum.length, sd = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length);
  return { mean, sd, rb: rgb[0] / Math.max(rgb[2], 1e-6), hourU: m.userData.lrU?.lrHour?.value ?? null, room: !!m.userData.room };
})()`;

test('R1-104 / R1-202 / R1-211: from the street a lit pane shows its room, not one flat glow; a room gone to bed is dark glass; from inside it is dark glass; the card wears the real room\'s paint', async (t) => {
  const b = await launch({ width: 800, height: 600 });
  try {
    const page = await b.open('la-ladera/index.html?autostart&manual');
    const lit = await page.eval(PANE(22, BED, false), 240000), late = await page.eval(PANE(23, BED, false), 240000), owl = await page.eval(PANE(23, OWL, false), 240000);
    const inside = await page.eval(PANE(22, BED, true), 240000);
    const red = await page.eval(PANE(22, OWL, false, [200, 40, 40, 3, 255, 240, 220, 255]), 240000), blue = await page.eval(PANE(22, OWL, false, [40, 60, 200, 3, 255, 240, 220, 255]), 240000);
    // Linear light, no exposure (the game's night exposure brightens all of it alike): what counts is the structure (sd / mean) and the ratios, not the absolute level.
    const f = (o) => `mean ${o.mean.toFixed(3)} sd ${o.sd.toFixed(3)} (sd/mean ${(o.sd / Math.max(o.mean, 1e-6)).toFixed(2)})`, rel = (o) => o.sd / Math.max(o.mean, 1e-6);
    t.diagnostic(`lit ${f(lit)} | late ${f(late)} | all-night ${f(owl)} | inside ${f(inside)}`);
    assert.equal(lit.room, true, 'window_lit is the room material');
    assert.equal(late.hourU, 23, 'the clock (setHour) reaches the material');
    assert.ok(lit.mean > 0.02, `22:00, lived in: the pane glows (${f(lit)})`);
    assert.ok(rel(lit) > 0.2, `22:00: there is a room in it, not a flat panel (${f(lit)}; the old pane was one flat colour)`);
    assert.ok(late.mean < 0.25 * lit.mean, `23:00, its evening over: dark glass (${f(late)} against ${f(lit)})`);
    assert.ok(Math.abs(owl.mean - lit.mean) < 0.2 * lit.mean && rel(owl) > 0.2, `23:00, an all-night room: still the same lit room (${f(owl)} against ${f(lit)})`);
    assert.ok(rel(inside) < 0.5 * rel(lit), `from inside the building the pane is glass, not a room seen backwards (${f(inside)} against ${f(lit)})`);
    assert.ok(inside.mean < 0.25 * lit.mean, `R1-202: from inside at night the pane gives no light of its own, the dark street shows through (${f(inside)} against ${f(lit)}; it was the same cream glow)`);
    t.diagnostic(`R1-211: red-walled room R/B ${red.rb.toFixed(2)}, blue-walled room R/B ${blue.rb.toFixed(2)}`);
    assert.ok(red.rb > 2 * blue.rb, `R1-211: the card paints the real room's walls (red-walled room R/B ${red.rb.toFixed(2)} against blue-walled ${blue.rb.toFixed(2)})`);
    const s = page.summary();
    assert.deepEqual([s.errors, s.netErrors, s.consoleErrors, s.consoleWarnings], [[], [], [], []]);
  } finally { await b.close(); }
});
