// Lamp glow and the far city in the real page (owner: A1): one sprite per street lamp plus the lights on the distant hillsides, all in one
// additive draw call that exists only at night, hidden by anything in front of it, sized by the distance and the viewport, shimmering and
// flashing on their own clocks, coming on one by one through the dusk, and clean on the console. Every check compares the real frame with the
// same frame with the glow object taken out of the scene.
// Quiet box: the browser comes only from tests/chrome.mjs, headless.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/glow.test.mjs
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';

// In the page: frames of this very moment, with the glow in the scene or out of it; mean luma (0..1) in boxes round world points; lit pixels.
const KIT = `window.__gl = (() => {
  const api = window.__ladera, c = api.ctx;
  const grab = () => {
    api.render();
    const cv = c.renderer.domElement, t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
    const g = t.getContext('2d', { willReadFrequently: true }); g.drawImage(cv, 0, 0);
    return { g, W: cv.width, H: cv.height, calls: c.stats.drawCalls };
  };
  const at = (p) => { const v = new c.THREE.Vector3(p[0], p[1], p[2]).project(c.camera); return { x: Math.round((v.x + 1) / 2 * c.renderer.domElement.width), y: Math.round((1 - v.y) / 2 * c.renderer.domElement.height), front: v.z > -1 && v.z < 1 }; };
  const L = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const mean = (d) => { let s = 0; for (let i = 0; i < d.length; i += 4) s += L(d, i); return s / (d.length / 4) / 255; };
  const frame = (withGlow) => {
    const pts = c.glow.points; if (!withGlow) c.scene.remove(pts);
    try { return grab(); } finally { if (!withGlow) c.scene.add(pts); }
  };
  return {
    /** mean luma of the (2r+1)^2 box round each world point, with the glow and without it */
    boxes(points, r = 12) {
      const a = frame(true), b = frame(false);
      return points.map((p) => {
        const s = at(p), x0 = Math.max(0, s.x - r), y0 = Math.max(0, s.y - r), n = 2 * r + 1;
        return { x: s.x, y: s.y, front: s.front, on: mean(a.g.getImageData(x0, y0, n, n).data), off: mean(b.g.getImageData(x0, y0, n, n).data) };
      });
    },
    /** pixels (of the rectangle, default the whole frame) the glow lit by more than 'min' luma, and the draw calls with and without it */
    lit(rect, min = 0.12) {
      const a = frame(true), b = frame(false), [x, y, w, h] = rect ?? [0, 0, a.W, a.H], A = a.g.getImageData(x, y, w, h).data, B = b.g.getImageData(x, y, w, h).data;
      let n = 0; for (let i = 0; i < A.length; i += 4) if ((L(A, i) - L(B, i)) / 255 > min) n++;
      return { lit: n, callsOn: a.calls, callsOff: b.calls };
    },
    /** pixels one extra glow adds to the whole frame: with it minus without it (everything else the same) */
    extraLit(g) {
      c.glow.clearExtras(); const base = this.lit().lit;
      c.glow.add(g); const withIt = this.lit().lit; c.glow.clearExtras();
      return withIt - base;
    },
  };
})()`;

let b, page;
const E = (js) => page.eval(js);
/** Put the camera somewhere at some hour. */
const place = (hour, x, z, yaw, pitch = 0) => E(`(() => { __ladera.setHour(${hour}); __ladera.teleport(${x}, ${z}, { yaw: ${yaw}, pitch: ${pitch} }); __ladera.step(3); return true; })()`);
/** World point 'dist' m ahead of the camera, 'up' m above the eye. */
const ahead = (dist, up) => E(`(() => { const c = __ladera.ctx, cam = c.camera, d = new c.THREE.Vector3(); cam.getWorldDirection(d); d.y = 0; d.normalize();
  return [cam.position.x + d.x * ${dist}, cam.position.y + ${up}, cam.position.z + d.z * ${dist}]; })()`);
/** World point 'dist' m ahead, 'up' m above the ground there (open air over the street, whatever the slope). */
const over = (dist, up) => E(`(() => { const c = __ladera.ctx, cam = c.camera, d = new c.THREE.Vector3(); cam.getWorldDirection(d); d.y = 0; d.normalize();
  const x = cam.position.x + d.x * ${dist}, z = cam.position.z + d.z * ${dist}; return [x, c.plan.heightAt(x, z) + ${up}, z]; })()`);
const SPAWN = [-6.5, 92.5], DOWN = [-6.5, 20];
const lamp = (p, o = {}) => JSON.stringify({ x: p[0], y: p[1], z: p[2], color: 0xffc27a, size: 3, intensity: 1.5, on: 0, ...o });

before(async () => {
  b = await launch({ width: 1280, height: 720 });
  page = await b.open('la-ladera/index.html?autostart&manual');
  await E(KIT);
});
after(async () => { await b?.close(); });

test('one sprite per street lamp and a far city, all in one draw call', async (t) => {
  await place(22, ...SPAWN, 0);
  const s = await E(`(() => { const c = __ladera.ctx; return { glow: __ladera.state().glow, lamps: c.lights.list.filter((l) => l.kind === 'street' && l.on !== false && l.intensity > 0).length, errors: c.errors.length }; })()`);
  t.diagnostic(JSON.stringify(s));
  assert.equal(s.errors, 0, 'ctx.errors');
  assert.ok(s.lamps >= 20, `${s.lamps} street lamps registered`);
  assert.equal(s.glow.street, s.lamps, 'a sprite for every street lamp in the registry');
  assert.ok(s.glow.far > 1500, `${s.glow.far} far-city lights`);
  assert.equal(s.glow.points, s.glow.street + s.glow.far + s.glow.extra, 'the sprites are exactly the lamps, the city and the extras');
  const r = await E(`__gl.lit()`);
  t.diagnostic(`draw calls ${r.callsOn} with, ${r.callsOff} without`);
  assert.equal(r.callsOn - r.callsOff, 1, 'the whole glow is one draw call');
  assert.ok(r.lit > 200, `${r.lit} pixels lit by the glow at 22:00 on the spawn street`);
  assert.equal(await E('__ladera.state().glow.drawn'), true, 'drawn at night');
});

test('nothing is drawn by day: the glow object is hidden and costs no draw call', async () => {
  await place(12, ...SPAWN, 0);
  const g = await E(`(() => { __ladera.render(); return { drawn: __ladera.state().glow.drawn, visible: __ladera.ctx.glow.points.visible, night: __ladera.ctx.night }; })()`);
  assert.deepEqual([g.drawn, g.visible], [false, false], `night ${g.night}`);
  const r = await E(`__gl.lit()`);       // (moving things, sway and the like, differ a little between any two frames: the draw calls are the exact check)
  assert.equal(r.callsOn, r.callsOff, 'no draw call by day');
});

test('a lamp in the open air gets a halo; the same lamp behind the ground gets none; a point to the side is untouched', async (t) => {
  await place(22, ...SPAWN, 0);
  const [ax, ay, az] = await ahead(12, 1.5), [bx, by, bz] = await ahead(9, -4.0);
  await E(`(() => { const c = __ladera.ctx; c.glow.clearExtras(); c.glow.add(${lamp([ax, ay, az])}); c.glow.add(${lamp([bx, by, bz])}); __ladera.step(2); return true; })()`);
  const [air, buried, side] = await E(`__gl.boxes([[${ax}, ${ay}, ${az}], [${bx}, ${by}, ${bz}], [${ax + 5.5}, ${ay + 5}, ${az}]])`);
  t.diagnostic(`air ${air.off.toFixed(3)} -> ${air.on.toFixed(3)} at ${air.x},${air.y}   buried ${buried.off.toFixed(3)} -> ${buried.on.toFixed(3)} at ${buried.x},${buried.y}   side ${side.off.toFixed(3)} -> ${side.on.toFixed(3)}`);
  assert.ok(air.front && air.on - air.off > 0.04, `the halo in open air raises the box from ${air.off.toFixed(3)} to ${air.on.toFixed(3)}`);
  assert.ok(buried.on - buried.off < 0.004, `a lamp buried in the ground must not show (${buried.off.toFixed(3)} -> ${buried.on.toFixed(3)})`);
  assert.ok(Math.abs(side.on - side.off) < 0.004, `a spot away from every lamp is unchanged (${side.off.toFixed(3)} -> ${side.on.toFixed(3)})`);
  await E('__ladera.ctx.glow.clearExtras()');
});

test('the halo covers about four times the pixels at half the distance, and a quarter of them at half the resolution', async (t) => {
  await place(22, ...SPAWN, 0);
  const near = await over(10, 6), far = await over(20, 6);
  const n10 = await E(`__gl.extraLit(${lamp(near)})`), n20 = await E(`__gl.extraLit(${lamp(far)})`);
  t.diagnostic(`halo pixels: ${n10} at 10 m, ${n20} at 20 m (ratio ${(n10 / n20).toFixed(2)}, 4 for a perfect 1/d)`);
  assert.ok(n20 > 500, `${n20} pixels at 20 m`);
  assert.ok(n10 / n20 > 3 && n10 / n20 < 5.5, `ratio ${(n10 / n20).toFixed(2)}`);
  const p = await ahead(14, 2.0), full = await E(`__gl.extraLit(${lamp(p)})`);
  try {
    await E('(() => { __ladera.ctx.resizeTo(640, 360); return true; })()');
    const half = await E(`__gl.extraLit(${lamp(p)})`);
    t.diagnostic(`halo pixels at 14 m: ${full} at 1280x720, ${half} at 640x360 (ratio ${(half / full).toFixed(2)}, 0.25 for a perfect scale)`);
    assert.ok(half / full > 0.15 && half / full < 0.4, `ratio ${(half / full).toFixed(2)}`);
  } finally { await E('(() => { __ladera.ctx.resizeTo(1280, 720); return true; })()'); }
});

test('a lamp right in front of the eye does not blind: the halo fades in between 1.2 and 5 m', async (t) => {
  await place(22, ...SPAWN, 0);
  const gain = {};
  for (const d of [1.5, 6]) {
    const p = await ahead(d, 0);
    await E(`(() => { const c = __ladera.ctx; c.glow.clearExtras(); c.glow.add(${lamp(p)}); return true; })()`);
    const [r] = await E(`__gl.boxes([${JSON.stringify(p)}], 40)`);
    gain[d] = r.on - r.off;
  }
  await E('__ladera.ctx.glow.clearExtras()');
  t.diagnostic(`box gain (81 x 81 px): ${gain[1.5].toFixed(3)} at 1.5 m, ${gain[6].toFixed(3)} at 6 m`);
  assert.ok(gain[1.5] < 0.1, `1.5 m from the eye the box gains ${gain[1.5].toFixed(3)}`);
  assert.ok(gain[6] > 0.25, `6 m away it gains ${gain[6].toFixed(3)}`);
});

test('a flashing beacon is dark and bright on its own clock', async (t) => {
  await place(22, ...SPAWN, 0);
  const p = await ahead(16, 2.2), at = (time) => E(`(() => { __ladera.ctx.look.time = ${time}; return __gl.boxes([${JSON.stringify(p)}])[0].on; })()`);
  await E('__ladera.ctx.glow.clearExtras()');
  const base = await at(0);
  await E(`(() => { __ladera.ctx.glow.add(${lamp(p, { color: 0xff2a10, intensity: 3, blink: 1, phase: 0 })}); return true; })()`);
  const dark = await at(0), bright = await at(0.25), dark2 = await at(0.75);
  await E('__ladera.ctx.glow.clearExtras()');
  t.diagnostic(`box luma: without ${base.toFixed(3)}, at 0.00 s ${dark.toFixed(3)}, 0.25 s ${bright.toFixed(3)}, 0.75 s ${dark2.toFixed(3)}`);
  assert.ok(dark - base < 0.02 && dark2 - base < 0.01, `dark phases ${dark.toFixed(3)} / ${dark2.toFixed(3)} against ${base.toFixed(3)}`);
  assert.ok(bright - base > 0.3, `bright phase ${bright.toFixed(3)} against ${base.toFixed(3)}`);
});

test('looking down the valley the far hillsides are full of lights, and they come on through the dusk', async (t) => {
  await E(`__ladera.ctx.glow.clearExtras()`);
  const band = [200, 280, 800, 150];                       // the opposite hillside between the sky and the roofs
  // the hour at which the night is about half way (the sun at the horizon): where the dusk can be told from the dark
  const dusk = await E(`(() => { let best = null; for (let h = 16.5; h <= 19; h += 0.05) { __ladera.setHour(h); const n = __ladera.ctx.night; if (!best || Math.abs(n - 0.5) < Math.abs(best.n - 0.5)) best = { h: +h.toFixed(2), n: +n.toFixed(2) }; } return best; })()`);
  const lit = {};
  for (const h of [22, dusk.h, 12]) {
    await place(h, ...DOWN, Math.PI, 0.02);
    lit[h] = await E(`__gl.lit(${JSON.stringify(band)}, 0.08)`);
  }
  t.diagnostic(`lit pixels on the far hill: 22:00 ${lit[22].lit}, dusk ${dusk.h} (night ${dusk.n}) ${lit[dusk.h].lit}, noon ${lit[12].lit}`);
  assert.ok(lit[22].lit > 3000, `${lit[22].lit} pixels lit by the far city at 22:00`);
  assert.ok(lit[12].lit < lit[22].lit * 0.05, `no city by day (${lit[12].lit} pixels differ between two frames: sway)`);
  assert.ok(lit[dusk.h].lit > lit[22].lit * 0.1 && lit[dusk.h].lit < lit[22].lit * 0.8, `dusk is partial: ${lit[dusk.h].lit} at ${dusk.h} against ${lit[22].lit} at night`);
});

test('the sky above the hills stays free of sprites; stars and the city glow are the sky shader\'s', async () => {
  await place(22, ...DOWN, Math.PI, 0.02);
  const r = await E(`__gl.lit([0, 0, 1280, 200], 0.08)`);
  assert.ok(r.lit < 25, `${r.lit} sprite pixels in the empty sky`);
});

test('the console stays clean (no shader error, no warning)', async () => {
  const s = page.summary();
  assert.deepEqual([s.errors, s.netErrors, s.consoleErrors, s.consoleWarnings], [[], [], [], []]);
  assert.equal(await E('__ladera.ctx.errors.length'), 0);
});
