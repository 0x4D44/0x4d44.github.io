// The map's beach on screen (A1, round 8, engine patch 4; dev/FEATURE-BEACH.md 1.6 and 3.3 item 9), in headless Chrome: the plan grows from the plot's 200 m square to 200 x 322 m, the sea is coloured by its depth, the sand,
// the promenade, the pier, the raft, the stairs, the ramp and the rail are drawn where the world has them, the legend gains Playa and Mar, the beach's names find their places and stay inside the frame; and `?skip=coast`
// is the square plan it always was. The pure parts (the frame, the fit, the colours, the ranks) are tests/ui-map-coast.test.mjs, under Node.
// The page is the booted game (?manual). Quiet box: the browser comes only from tests/chrome.mjs.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/ui-map-coast-page.test.mjs
// Two broken inputs, selected by C_SABOTAGE=<id>|all; the checks that depend on them must then FAIL (the pattern of engine-water.test.mjs):
//   skip   the page of the first two tests is booted with ?skip=coast: no beach on the map          live   the page of the third test (the square plan) is booted WITHOUT ?skip=coast
// The frames are saved as ui-map-coast-*.png in the directory named by C_SHOTS (nothing is written when it is not set), for a person to look at; each is saved before its checks run, so a failing run leaves its picture.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { launch, REPO } from './chrome.mjs';
import { LEGEND_BEACH } from '../js/ui/map.js';
import { PIER, BUOY_Z } from '../js/world/coast.js';

const SAB = process.env.C_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);
const OUT = process.env.C_SHOTS ? resolve(REPO, process.env.C_SHOTS) : null;
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const BEACH = 'la-ladera/index.html?manual', SKIP = 'la-ladera/index.html?manual&skip=coast';

let b, page;
before(async () => {
  b = await launch({ width: 1280, height: 720 });
  page = await b.open(on('skip') ? SKIP : BEACH);
});
after(async () => { await b?.close(); });

// the page side: window.__mp.at(x, z) is the mean colour of the 3 x 3 pixels of the map where the world point (x, z) is drawn (null off the canvas); view() is what the last frame placed
const HELPER = `(() => {
  const mp = window.__mp = {};
  mp.cv = () => document.querySelector('#panelbody canvas');
  mp.xy = (x, z) => { const cv = mp.cv(), v = cv.__view; return [(x - v.cx) * v.s + v.W / 2, (z - v.cz) * v.s + v.H / 2, cv.width / v.W]; };
  mp.at = (x, z) => {
    const cv = mp.cv(), [X, Y, d] = mp.xy(x, z), px = Math.round(X * d), py = Math.round(Y * d);
    if (px < 1 || py < 1 || px > cv.width - 2 || py > cv.height - 2) return null;
    const a = cv.getContext('2d').getImageData(px - 1, py - 1, 3, 3).data; let r = 0, g = 0, bl = 0; for (let i = 0; i < 9; i++) { r += a[i * 4]; g += a[i * 4 + 1]; bl += a[i * 4 + 2]; }
    return [r / 9, g / 9, bl / 9];
  };
  mp.column = (x, z0, z1) => {                       // the luma of every pixel of the column that world x is drawn on, from z0 to z1
    const cv = mp.cv(), g = cv.getContext('2d'), [X, Y0, d] = mp.xy(x, z0), [, Y1] = mp.xy(x, z1), out = [];
    for (let y = Math.round(Y0 * d); y <= Math.round(Y1 * d); y++) { const a = g.getImageData(Math.round(X * d), y, 1, 1).data; out.push(0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]); }
    return out;
  };
  mp.read = () => { const cv = mp.cv(), wr = cv.parentElement.getBoundingClientRect(), box = (e) => { const r = e.getBoundingClientRect(); return [r.left - wr.left, r.top - wr.top, r.width, r.height]; };
    return { v: cv.__view, L: cv.__labels, ui: [...cv.parentElement.querySelectorAll('.mapctl, .maplegend')].map(box), legend: box(cv.parentElement.querySelector('.maplegend')),
      swatches: [...cv.parentElement.querySelectorAll('.maplegend span')].map((s) => [s.textContent, getComputedStyle(s.querySelector('i')).backgroundColor]),
      coast: __ladera.ctx.plan.coast ? { landmarks: __ladera.ctx.plan.coast.landmarks.map((l) => l.name), areas: __ladera.ctx.plan.coast.areas.map((a) => a.name.toUpperCase()) } : null,
      town: __ladera.ctx.plan.landmarks.map((l) => l.name) }; };
  mp.expect = async (x, z) => { const m = await import('/la-ladera/js/ui/map.js'); return m.beachRgb(__ladera.ctx.plan.coast, x, z, 1); };
  return true;
})()`;
const read = async () => JSON.parse(await page.eval('JSON.stringify(window.__mp.read())'));
const at = (x, z) => page.eval(`window.__mp.at(${x}, ${z})`);
const near = (c, want, tol, msg) => { assert.ok(c, `${msg}: the point is on the canvas`); assert.ok(want.every((w, i) => Math.abs(c[i] - w) <= tol), `${msg}: ${c.map((v) => Math.round(v))} against ${want.map((v) => Math.round(v))} (+-${tol})`); };
const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const overlap = (a, c) => a[0] < c[0] + c[2] && a[0] + a[2] > c[0] && a[1] < c[1] + c[3] && a[1] + a[3] > c[1];
const shot = async (name) => { if (OUT) await page.pageShot(resolve(OUT, `ui-map-coast-${name}.png`)); };
const openMap = async () => {
  if ((await page.eval('__ladera.ctx.mode')) === 'title') { await page.eval('document.getElementById("start").click()'); await tick(300); }
  await page.key('KeyM'); await tick(500);
  await page.eval(HELPER);
};
const closeMap = async () => { if ((await page.eval('__ladera.ctx.mode')) === 'panel') { await page.key('KeyM'); await tick(150); } };
// the labels of a frame: apart from each other, inside the canvas and the plan's frame, clear of the buttons and the legend (the contract of tests/ui-flow.test.mjs, here for the taller plan)
const labelsOk = (m, label) => {
  const R = m.L.filter((l) => l.text !== 'N').map((l) => ({ t: l.text, r: [l.x - l.w / 2, l.y - l.h / 2, l.w, l.h] })), f = m.v.frame;
  for (let i = 0; i < R.length; i++) {
    const r = R[i].r;
    assert.ok(r[0] >= 1.9 && r[1] >= 1.9 && r[0] + r[2] <= m.v.W - 1.9 && r[1] + r[3] <= m.v.H - 1.9, `${label}: "${R[i].t}" leaves the canvas`);
    assert.ok(r[0] >= f[0] + 3 && r[1] >= f[1] + 3 && r[0] + r[2] <= f[0] + f[2] - 3 && r[1] + r[3] <= f[1] + f[3] - 3, `${label}: "${R[i].t}" leaves the plan's frame or runs over its line: ${JSON.stringify(r.map(Math.round))} in ${JSON.stringify(f.map(Math.round))}`);
    for (let k = i + 1; k < R.length; k++) assert.ok(!overlap(r, R[k].r), `${label}: "${R[i].t}" and "${R[k].t}" overlap`);
    for (const u of m.ui) assert.ok(!overlap(r, [u[0] - 2, u[1] - 2, u[2] + 4, u[3] + 4]), `${label}: "${R[i].t}" touches a button or the legend`);
  }
};
const SHADE = (c, base, msg) => {      // a colour of the relief: the base colour times one light (0.8 to 1.2), the same for the three channels
  const k = c.map((v, i) => v / base[i]); assert.ok(k.every((v) => v > 0.8 && v < 1.2) && Math.max(...k) - Math.min(...k) < 0.08, `${msg}: ${c.map(Math.round)} is not ${base.map(Math.round)} under one light (${k.map((v) => v.toFixed(2))})`);
};

test('the whole barrio on the map is the plot and the beach, 200 x 322 m, whole inside the canvas; its legend gains Playa and Mar in the colours the plan paints; the sea, the sand, the promenade and the pier are where the world has them', async (t) => {
  t.after(closeMap);
  await openMap();
  const m = await read();
  await shot('whole');                                                                                          // (before the checks, so that a failing run leaves its picture)
  assert.equal(m.v.ext.live, true, 'the plan has its beach');
  assert.deepEqual([m.v.ext.x0, m.v.ext.x1, m.v.ext.z0, m.v.ext.z1], [-100, 100, -100, 222], 'the frame is the square and the beach to the hard stop');
  const [fx, fy, fw, fh] = m.v.frame;
  assert.ok(Math.abs(fh / fw - 322 / 200) < 0.005, `the frame is 200 x 322 m (${fw.toFixed(1)} x ${fh.toFixed(1)} px)`);
  assert.ok(fx >= -0.5 && fy >= -0.5 && fx + fw <= m.v.W + 0.5 && fy + fh <= m.v.H + 0.5, `the whole frame is on the canvas: ${[fx, fy, fw, fh].map(Math.round)} in ${Math.round(m.v.W)} x ${Math.round(m.v.H)}`);
  assert.ok(!overlap(m.v.frame, m.legend), 'the legend is not on the plan'); assert.ok(m.v.s * 322 > m.v.H * 0.8, `the plan is as big as the canvas allows (${m.v.s.toFixed(2)} px a metre)`);
  assert.deepEqual(m.swatches.slice(-2).map(([t]) => t), ['Playa', 'Mar'], 'the legend ends with the beach\'s two entries');
  for (const [i, [css, name]] of LEGEND_BEACH.entries()) assert.equal(m.swatches.at(-2 + i)[1].replace(/\s/g, ''), css.replace(/\s/g, ''), `${name}'s swatch is the colour the plan paints`);
  assert.equal(m.swatches.length, 8, 'six town entries and two for the beach');
  // the names: the pier and the beach are important kinds and are named at the first look; the two areas have their names in the middle of the sand and the water
  const named = (n) => m.L.some((l) => l.text === n);
  assert.ok(named('Muelle de los Pescadores') && named('La Playa'), `the pier and the beach are named: ${m.L.map((l) => l.text).filter((s) => !m.town.includes(s)).join(' | ')}`);
  // the areas have their own names, drawn zoomed out and after the landmarks' (ui/map.js: no label sits on another): the sea's is there, the sand's gives way to the landmark of the same name that stands in the middle of it ("La Playa", seen in the picture)
  for (const n of m.coast.areas) assert.ok(named(n) || m.L.some((l) => l.text.toUpperCase() === n), `the area ${n} is named on the plan, by its own label or by the landmark of its name: ${m.L.map((l) => l.text).join(' | ')}`);
  assert.ok(named('EL MAR'), 'and the sea\'s own label is there');
  assert.ok(m.coast.landmarks.filter(named).length >= 3, `three of the beach's five landmarks are named at the first look (${m.coast.landmarks.filter(named)})`);
  labelsOk(m, 'whole barrio');
  // the colours: what the relief says stands at a point, by the world's own functions, under a light (the town's hill shades the plan, the beach is nearly flat); then the marks drawn over it
  const want = async (x, z) => page.eval(`window.__mp.expect(${x}, ${z})`);
  const sea = await at(40, 205), shallow = await at(70, 150), deep = await at(70, 219), sand = await at(-70, 125), deck = await at(50, 104);
  const planks = []; for (let z = 112; z <= 190; z += 6) planks.push(await at(-6.5, z));          // (the pier is 4.6 px wide on the whole plan, and its name and its marker stand on it: some of its length is not planks, most is)
  SHADE(sea, await want(40, 205), 'the sea at 2.8 m'); SHADE(shallow, await want(70, 150), 'the shallows at 0.37 m'); SHADE(deep, await want(70, 219), 'the sea at 3.4 m');
  SHADE(sand, await want(-70, 125), 'the dry sand'); SHADE(deck, await want(50, 104), 'the promenade');
  assert.ok(sea[2] > sea[0] + 60 && sea[2] > sea[1], `the sea is blue: ${sea.map(Math.round)}`);
  assert.ok(luma(shallow) > luma(sea) + 25 && luma(sea) > luma(deep) + 3, `the sea is darker with depth: ${[shallow, sea, deep].map((c) => Math.round(luma(c)))}`);
  assert.ok(sand[0] > sand[2] + 40 && luma(sand) > luma(deck) + 15, `the sand is yellow and lighter than the promenade: ${sand.map(Math.round)} against ${deck.map(Math.round)}`);
  const brown = planks.filter((c) => c && [125, 92, 58].every((w, i) => Math.abs(c[i] - w) <= 14)).length;
  assert.ok(brown >= 5, `the pier's planks are brown along its length: ${brown} of ${planks.length} samples (7 as built: the others fall on a name, its marker or the pier's dark ends; ${planks.map((c) => (c ? c.map(Math.round).join(',') : 'off')).join(' | ')})`);
  // and its stem runs out to its end (z 191): the samples at z 166, 172 and 178 stand clear of the name and the marker and are planks (a pier cut short by 20 m is sea from z 171)
  const tail = planks.filter((_, i) => { const z = 112 + 6 * i; return z >= 166 && z <= 178; });
  assert.ok(tail.length === 3 && tail.every((c) => c && [125, 92, 58].every((w, i) => Math.abs(c[i] - w) <= 14)), `the pier's stem reaches out to z ${PIER.z1}: the planks at z 166, 172 and 178 are brown (${tail.map((c) => c?.map(Math.round).join(','))})`);
});

test('close up, the stairs have their five treads, the ramp its length, the rail its gaps, the pier its planks and its wider head, the raft its straw and the swim line its buoys, exactly where the plan has them', async (t) => {
  t.after(closeMap);
  await openMap();
  let m = await read();
  assert.equal(m.v.ext.live, true);
  // wheel-zoom on the ramp (S22, x 2.2, z 108 to 117.9): the world point under the pointer stays put
  const [X, Y] = JSON.parse(await page.eval('JSON.stringify(window.__mp.xy(2.2, 113))')), want = async (x, z) => page.eval(`window.__mp.expect(${x}, ${z})`);
  for (let i = 0; i < 4; i++) { await page.eval(`(() => { const cv = window.__mp.cv(), r = cv.getBoundingClientRect(); cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -500, clientX: r.left + ${X}, clientY: r.top + ${Y}, bubbles: true, cancelable: true })); })()`); await tick(80); }
  m = await read(); await shot('ramp'); assert.ok(m.v.s > 20, `zoomed right in (${m.v.s.toFixed(1)} px a metre)`);
  near(await at(2.2, 113), [184, 173, 150], 10, 'the ramp\'s middle (S22)');
  near(await at(-10, 108.42), [239, 227, 199], 10, 'the stairs\' tread (S19, beside the pier)');
  near(await at(-6.5, 114), [125, 92, 58], 10, 'the pier\'s planks');                                              // (the view is anchored on the ramp and 24 px a metre: the canvas ends at z 120)
  near(await at(2.2, 117.3), [184, 173, 150], 10, 'the ramp\'s far end (it runs to z 117.9)');
  near(await at(2.2, 118.7), [224, 197, 144], 14, 'the sand past the ramp\'s end');
  near(await at(20, 107.92), [244, 234, 210], 12, 'the sea wall\'s rail');
  const gap = await at(2.2, 107.92), railC = [244, 234, 210];
  assert.ok(gap && Math.hypot(...gap.map((v, i) => v - railC[i])) > 60, `the rail has its gap at the ramp: ${gap?.map(Math.round)}`);
  const col = JSON.parse(await page.eval('JSON.stringify(window.__mp.column(-10, 108.1, 109.5))'));        // down the flight from just under its top edge: a dark line under each of the four treads and one at the bottom
  let runs = 0, dark = false; for (const v of col) { if (v < 150 && !dark) { runs++; dark = true; } else if (v > 170) dark = false; }
  assert.equal(runs, 5, `the flight is five treads: four dark lines between them and one at the bottom, ${runs} in ${col.length} px (${col.map((v) => Math.round(v)).join(' ')})`);
  const sandNear = await at(-15, 114); SHADE(sandNear, await want(-15, 114), 'the sand beside the pier');                // (the canvas shows x -18 to 21 and z 99 to 120)
  labelsOk(m, 'zoomed in on the ramp');
  // the raft, at the other end of the plan: back to the whole barrio and in on it (on the whole plan its marker, 14 px, covers its 4.6 px); a point 0.9 m off its middle, clear of the marker
  await page.eval('document.querySelector(\'.mapctl button[aria-label="Ver todo"]\').click()'); await tick(250);
  const [RX, RY] = JSON.parse(await page.eval('JSON.stringify(window.__mp.xy(34, 185))'));
  for (let i = 0; i < 4; i++) { await page.eval(`(() => { const cv = window.__mp.cv(), r = cv.getBoundingClientRect(); cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -500, clientX: r.left + ${RX}, clientY: r.top + ${RY}, bubbles: true, cancelable: true })); })()`); await tick(80); }
  m = await read(); await shot('raft'); assert.ok(m.v.s > 20, `zoomed right in on the raft (${m.v.s.toFixed(1)} px a metre)`);
  near(await at(34.9, 185.9), [217, 184, 115], 14, 'the raft (straw)'); labelsOk(m, 'zoomed in on the raft');
  // the pier's far end: in on the stem's last metres (the head is 4 m wide on the 3 m stem) and the sea past it
  const zoomOn = async (x, z) => {
    await page.eval('document.querySelector(\'.mapctl button[aria-label="Ver todo"]\').click()'); await tick(250);
    const [ZX, ZY] = JSON.parse(await page.eval(`JSON.stringify(window.__mp.xy(${x}, ${z}))`));
    for (let i = 0; i < 4; i++) { await page.eval(`(() => { const cv = window.__mp.cv(), r = cv.getBoundingClientRect(); cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -500, clientX: r.left + ${ZX}, clientY: r.top + ${ZY}, bubbles: true, cancelable: true })); })()`); await tick(80); }
    const v = await read(); assert.ok(v.v.s > 20, `zoomed right in on (${x}, ${z}): ${v.v.s.toFixed(1)} px a metre`); return v;
  };
  const sea = (c, msg) => assert.ok(c && c[2] > c[0] + 60, `${msg}: ${c?.map(Math.round)} is not the sea (blue well over red)`);
  m = await zoomOn(PIER.x, 200); await shot('pierend');                                       // (anchored in the sea past the end: the wheel keeps the point under the pointer where it was, so the window shows z 181 to 202)
  near(await at(PIER.x, 184), [125, 92, 58], 10, 'the pier\'s stem near its end');
  near(await at(PIER.x, PIER.z1 - 1.5), [125, 92, 58], 10, 'the pier\'s head');
  near(await at(PIER.x + 1.75, PIER.z1 - 1.5), [125, 92, 58], 10, 'the head is wider than the stem (4 m on 3)');
  sea(await at(PIER.x + 1.75, 184), 'beside the stem'); sea(await at(PIER.x, PIER.z1 + 2), 'past the pier\'s end');
  labelsOk(m, 'zoomed in on the pier\'s end');
  // the swim line: a buoy every 10 m from x -95 (so at -15, -5 and 5, and none at -10 and 0)
  m = await zoomOn(-5, BUOY_Z); await shot('buoys');
  for (const x of [-15, -5, 5]) near(await at(x, BUOY_Z), [242, 184, 74], 14, `the buoy at x ${x}`);
  for (const x of [-10, 0]) sea(await at(x, BUOY_Z), `no buoy at x ${x}`);
  labelsOk(m, 'zoomed in on the swim line');
});

test('?skip=coast leaves the square plan it always was: 200 x 200 m, six legend entries, no beach name', async (t) => {
  t.after(closeMap);
  page = await b.open(on('live') ? BEACH : SKIP);
  await openMap();
  const m = await read(); await shot('square');
  assert.equal(m.v.ext.live, false, 'no beach on the plan');
  assert.deepEqual([m.v.ext.z0, m.v.ext.z1], [-100, 100], 'the square');
  assert.ok(Math.abs(m.v.frame[3] / m.v.frame[2] - 1) < 0.005, `the frame is square (${m.v.frame[2].toFixed(1)} x ${m.v.frame[3].toFixed(1)} px)`);
  assert.equal(m.swatches.length, 6, 'six legend entries'); assert.ok(!m.swatches.some(([t]) => t === 'Playa' || t === 'Mar'), 'and none for the beach');
  for (const n of m.coast?.landmarks ?? []) assert.ok(!m.L.some((l) => l.text === n), `"${n}" is not on a plan that has no beach`);
  for (const n of m.coast?.areas ?? []) assert.ok(!m.L.some((l) => l.text === n), `"${n}" is not on a plan that has no beach`);
  labelsOk(m, 'square plan');
  // and it names at the first look what it always named (the round-7 map: 12 of the 17 landmark names, 5 of the 6 important kinds, 3 areas; tests/ui-flow.test.mjs held these before the beach made the plan 322 m deep, 1.53 px a metre instead of 2.42)
  const town = JSON.parse(await page.eval(`JSON.stringify((() => { const P = __ladera.ctx.plan; return { names: P.landmarks.map((l) => l.name), first: P.landmarks.filter((l) => ['viewpoint', 'chapel', 'school', 'clinic', 'hall', 'court'].includes(l.kind)).map((l) => l.name), areas: P.areas.map((a) => a.name.toUpperCase()) }; })())`));
  const seen = (list) => list.filter((n) => m.L.some((l) => l.text === n)).length;
  assert.ok(seen(town.names) >= 10, `${seen(town.names)} of ${town.names.length} landmark names are on the square plan at the first look`);
  assert.ok(seen(town.first) >= 5, `the important kinds are named first: ${seen(town.first)} of ${town.first.length}`);
  assert.ok(seen(town.areas) >= 2, `and some area names find a place: ${seen(town.areas)}`);
});
