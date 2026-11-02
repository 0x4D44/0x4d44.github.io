// Efflorescence is a crust, not a puff (owner: A1, js/arch/weather.js `efflor`; review round 6, R1-105: "wall-base damp / efflorescence decals read as pink-white puffs floating on the brick, most
// visible at night", n21.jpg and st4.jpg). A translucent white laid over red brick is pink, and a soft blot hanging on a wall is a puff of smoke; a thin hazy bloom at 7 to 27 % alpha covered a fifth of
// the decal. The painter now lays hard little flecks of salt (small rectangles, mostly opaque) in ragged patches and along the courses, on the dark of the wet, and nothing translucent and pale.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/arch-weather-efflor.test.mjs
// Two proofs: the painter's own strokes under a recording stand-in for the canvas (no browser: no gradient of salt, no blurred disc, every pale fleck small and firm), and the pixels of the real atlas in
// headless Chrome (how much of the decal is pale and see-through, how much is pale crust).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, PAINTERS } from '../js/arch/weather.js';
import { launch } from './chrome.mjs';

const lcg = (s) => () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
const rgbaOf = (s) => { const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(String(s)); return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null; };
const paleOf = (c) => c && Math.min(c.r, c.g, c.b) >= 140;
/** A recording stand-in for the canvas: every property assignment and every call, in order, and the colour of every gradient stop. */
function rec() {
  const ev = [], stops = [];
  const g = new Proxy({}, {
    get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? (...a) => { ev.push({ call: k, a }); return { addColorStop: (_o, c) => stops.push(c) }; } : k === 'measureText' ? () => ({ width: 100 }) : (...a) => { ev.push({ call: k, a }); }),
    set: (_, k, v) => { ev.push({ set: k, v }); return true; },
  });
  return { g, ev, stops };
}

test('R1-105: the painter lays hard flecks of salt: no gradient of it, no blurred disc, no scaled blot, and every pale fleck is small and mostly opaque', () => {
  const { w, h, n } = ITEMS.efflor;
  for (let i = 0; i < n; i++) {
    const L = rec(); PAINTERS.efflor(L.g, w, h, i, lcg(777 + 31 * i));
    const at = `efflor:${i}`;
    assert.equal(L.ev.filter((e) => e.call === 'createRadialGradient').length, 0, `${at}: no radial gradient (a blurred disc of salt is a puff)`);
    assert.equal(L.ev.filter((e) => e.call === 'scale' || e.call === 'ellipse' || e.call === 'arc').length, 0, `${at}: nothing is squashed into an ellipse: a soft blot lying along the wall`);
    for (const c of L.stops) { const q = rgbaOf(c); assert.ok(q && !paleOf(q), `${at}: a gradient stop ${c} is pale: a haze of salt (only the dark of the wet may be graded)`); }
    let fill = null, flecks = 0; const bad = [];
    for (const e of L.ev) {
      if (e.set === 'fillStyle') fill = typeof e.v === 'string' ? rgbaOf(e.v) : null;
      else if (e.call === 'fillRect' && paleOf(fill)) {
        flecks++; const [, , wd, ht] = e.a;
        if (fill.a < 0.28 || wd > 6 || ht > 3.4) bad.push(`${fill.a.toFixed(2)} alpha ${wd.toFixed(1)}x${ht.toFixed(1)}`);
      }
    }
    assert.deepEqual(bad.slice(0, 3), [], `${at}: a pale fleck is faint (under 0.28) or large (over 6 x 3.4 px): ${bad.length} of ${flecks}`);
    assert.ok(flecks >= 160, `${at}: the crust is there (${flecks} flecks)`);
  }
});

test('R1-105: in the real atlas the salt is a crust of firm pale pixels, not a see-through pale haze, and the dark of the wet is still under it', async () => {
  const b = await launch({ width: 800, height: 600 });
  try {
    const page = await b.open('la-ladera/index.html?autostart&manual');
    const rows = JSON.parse(await page.eval(`JSON.stringify((() => {
      const atlas = __ladera.ctx.decalAtlas, A = atlas.canvas, out = [];
      const copy = document.createElement('canvas'); copy.width = A.width; copy.height = A.height;                          // (a copy made for reading back: the atlas itself is the game's)
      const cg = copy.getContext('2d', { willReadFrequently: true }); cg.drawImage(A, 0, 0);
      for (let i = 0; i < ${ITEMS.efflor.n}; i++) {
        const [u0, v0, u1, v1] = atlas.uv['efflor:' + i], sx = Math.round(u0 * A.width), sy = Math.round((1 - v1) * A.height), sw = Math.round((u1 - u0) * A.width), sh = Math.round((v1 - v0) * A.height);
        const d = cg.getImageData(sx, sy, sw, sh).data; let haze = 0, crust = 0, dark = 0;
        for (let k = 0; k < sw * sh; k++) { const a = d[4 * k + 3], lo = Math.min(d[4 * k], d[4 * k + 1], d[4 * k + 2]); if (lo > 140) { if (a > 8 && a < 100) haze++; else if (a >= 115) crust++; } else if (a > 8) dark++; }
        out.push({ i, haze: 100 * haze / (sw * sh), crust: 100 * crust / (sw * sh), dark: 100 * dark / (sw * sh) });
      }
      return out;
    })())`, 60000));
    for (const r of rows) {
      assert.ok(r.haze <= 5, `efflor:${r.i}: ${r.haze.toFixed(1)} % of the decal is pale and see-through (alpha 3 to 39 %): the pink haze (the first version: 21 to 24 %)`);
      assert.ok(r.crust >= 1.5, `efflor:${r.i}: ${r.crust.toFixed(1)} % is firm pale crust (the first version: 0.3 to 0.5 %)`);
      assert.ok(r.dark >= 30, `efflor:${r.i}: ${r.dark.toFixed(0)} % is the dark of the wet: the damp is still there`);
    }
    const s = page.summary();
    assert.deepEqual([s.errors, s.netErrors, s.consoleErrors, s.consoleWarnings], [[], [], [], []]);
  } finally { await b.close(); }
});
