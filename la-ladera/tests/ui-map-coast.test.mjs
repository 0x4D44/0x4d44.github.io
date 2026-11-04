// The map's beach (A1, round 8, engine patch 4; dev/FEATURE-BEACH.md 1.6 and 3.3 item 9): js/ui/map.js, the pure parts, under Node. The plan grows from the plot's 200 m square to 200 x 322 m when the coast is
// built; the sea is coloured by its depth, the sand and the promenade by what coast.surfaceAt says stands there; the legend and the landmarks gain the beach. The drawing itself, on a real canvas, is
// tests/ui-map-coast-page.test.mjs. `?skip=coast` leaves the square plan: every number below that the land's map had is pinned to its old formula.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/ui-map-coast.test.mjs
// Two inputs can be broken, selected by C_SABOTAGE=<id>|all, and the checks that depend on them must then FAIL (the pattern of core-sea.test.mjs):
//   lowsea   the coast the checks read has its sea 1 m lower than the world's (every depth the map paints is a metre too deep)      oldfit  the checks of the fit use the old square formula for the tall plan
import test from 'node:test';
import assert from 'node:assert/strict';
import './nice.mjs';
import { createCoast, STOP_Z, SEA, DECK_Z, STAIR_FLIGHT } from '../js/world/coast.js';
import { mapExtent, fitScale, minScale, legendBeside, SIDE_MARGIN, WATER_STOPS, waterRgb, beachRgb, LEGEND_BEACH, LM_PRI, byPriority } from '../js/ui/map.js';

const SAB = process.env.C_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${typeof a === 'number' ? +a.toFixed(5) : a} against ${b} (+-${tol})`);

const real = createCoast({ seed: 1, edge: () => 0.1 });
// the coast the colour checks are made against: the real one, or (lowsea) one whose depths are all a metre too big
const coast = on('lowsea') ? { ...real, depthAt: (x, z) => real.depthAt(x, z) + 1 } : real;
const plan = { coast: real, areas: [], landmarks: [] };

test('the frame: the plot\'s square, or the square and the beach down to the hard stop (z 222), by whether the coast is built', () => {
  const live = mapExtent(plan, {}), skip = mapExtent(plan, { skip: new Set(['coast']) });
  assert.deepEqual(live, { x0: -100, x1: 100, z0: -100, z1: 222, live: true }, 'a page with the coast: 200 x 322 m');
  assert.equal(STOP_Z, 220, 'the hard stop is 220 and the frame is two metres over it');
  assert.deepEqual(skip, { x0: -100, x1: 100, z0: -100, z1: 100, live: false }, '?skip=coast: the old square');
  assert.equal(mapExtent({ areas: [] }, {}).live, false, 'a plan with no coast: the square');
  assert.equal(mapExtent(plan, { headless: true }).live, false, 'a headless build without the coast: the square');
  assert.equal(mapExtent(plan, { headless: true, coast: true }).live, true, 'a headless build that asks for the coast: the beach');
  assert.equal(mapExtent(plan, { skip: new Set(['people']) }).live, true, 'other skips do not take the beach away');
  assert.equal(mapExtent(undefined, undefined).live, false, 'no plan at all');
});

test('the fit: the square plan\'s numbers are the old formulas to the bit; the tall plan fits whole, with its margin, into whatever the canvas leaves, and is as big as it can be', () => {
  for (const W of [280, 390, 640, 1000, 1280, 1920]) for (const room of [200, 320, 450, 600, 720, 900, 1200]) {
    assert.equal(fitScale(W, room), Math.min(W, room) / 208, `square, ${W} x ${room}: fit`);
    assert.equal(minScale(W, room), Math.min(W, room) / 260, `square, ${W} x ${room}: the zoom-out floor`);
    const span = 322, s = fitScale(W, room, on('oldfit') ? 200 : span);
    assert.ok((200 + 8) * s <= W + 1e-9 && (span + 8) * s <= room + 1e-9, `${W} x ${room}: the whole frame and its 4 m margin are inside (scale ${s.toFixed(3)})`);
    assert.ok(Math.abs((200 + 8) * s - W) < 1e-9 || Math.abs((span + 8) * s - room) < 1e-9, `${W} x ${room}: and it is as big as it can be: one dimension is full`);
    const floor = minScale(W, room, span);
    assert.ok(floor < s && (200 + 60) * floor <= W + 1e-9 && (span + 60) * floor <= room + 1e-9, `${W} x ${room}: zooming out can go below the fit, and the frame is still whole at the floor`);
  }
  assert.ok(Math.abs(fitScale(1280, 600, 322) - 600 / 330) < 1e-12, 'a wide canvas is as tall as the room: 330 m in 600 px');
  assert.ok(Math.abs(fitScale(390, 700, 322) - 390 / 208) < 1e-12, 'a phone is as wide as the room: 208 m in 390 px');
});

test('the legend stands beside the plan when the empty margin is 150 px or more: the square\'s own rule, and for the tall plan its width, not the canvas\'s height', () => {
  for (const w of [300, 390, 700, 1000, 1280, 1600]) for (const h of [250, 400, 520, 600, 760]) {
    assert.equal(legendBeside(w, h), (w - Math.min(w, h)) / 2 >= SIDE_MARGIN, `square, ${w} x ${h}`);
  }
  assert.equal(SIDE_MARGIN, 150, 'the css column (about 120 px, 8 px in) needs 150');
  // 1000 x 520: a square plan is 520 wide and the margin is 240; a plan 322 m deep is 520 * 200 / 322 = 323 wide and the margin is 338
  assert.equal(legendBeside(1000, 520, 322), true);
  assert.equal(legendBeside(700, 600, 200), false, 'the square plan on 700 x 600: margin 50');
  assert.equal(legendBeside(700, 600, 322), true, 'the tall plan on 700 x 600 is 373 wide: margin 163');
  assert.equal(legendBeside(500, 600, 322), false, 'and on 500 x 600 (plan 373 wide) the margin is 63: the strip below');
  assert.equal(legendBeside(390, 590, 322), false, 'a phone: the strip below');
});

test('the sea\'s colour by depth: the stops exactly, a straight line between them, the first below and the last beyond, a hair darker with every metre', () => {
  assert.ok(Object.isFrozen(WATER_STOPS), 'the table is not for changing');
  for (const [d, c] of WATER_STOPS) assert.deepEqual(waterRgb(d), c, `at ${d} m`);
  for (let i = 1; i < WATER_STOPS.length; i++) {
    const [d0, c0] = WATER_STOPS[i - 1], [d1, c1] = WATER_STOPS[i], mid = waterRgb((d0 + d1) / 2);
    for (let k = 0; k < 3; k++) near(mid[k], (c0[k] + c1[k]) / 2, 1e-9, `half way from ${d0} to ${d1} m, channel ${k}`);
  }
  assert.deepEqual(waterRgb(-3), WATER_STOPS[0][1], 'above the water: the shore\'s');
  assert.deepEqual(waterRgb(NaN), WATER_STOPS[0][1], 'no number: the shore\'s');
  assert.deepEqual(waterRgb(30), WATER_STOPS.at(-1)[1], 'beyond the last stop: the last');
  let prev = Infinity;
  for (let d = 0; d <= 5; d += 0.1) { const c = waterRgb(d), sum = c[0] + c[1] + c[2]; assert.ok(sum <= prev + 1e-9, `deeper is never lighter (${d.toFixed(1)} m)`); prev = sum; }
  const out = [0, 0, 0]; assert.equal(waterRgb(1, out), out, 'written into the array it is given');
  assert.deepEqual(WATER_STOPS.map(([d]) => d), [0, 0.45, 1.3, 2.4, 3.6], 'the stops sit on the world\'s own depths: the shallows end at 0.45 m, the wade at 1.3 m, the bay is 3.4 m at its deepest');
  for (const [, c] of WATER_STOPS) assert.ok(c[2] > c[0] + 10 || c === WATER_STOPS[0][1], 'the sea is bluer than red (the shore\'s milky turquoise is the lightest)');
});

test('the ground\'s colour is what the world says stands there: 6,000 seeded cells of the beach, every surface kind painted with its own colour and the sea by the depth the swimmer would find', () => {
  let a = 0x9E3779B9 >>> 0; const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const seen = {}, DECK = beachRgb(real, 0, 104), SAND = beachRgb(real, 40, 126);
  assert.ok(DECK[0] > DECK[2] && Math.abs(DECK[0] - DECK[1]) < 20, 'the promenade is a warm grey');
  assert.ok(SAND[0] > SAND[2] + 50, 'the sand is yellow');
  for (let k = 0; k < 6000; k++) {
    const x = (rnd() - 0.5) * 200, z = 100.01 + rnd() * 121.9, kind = real.surfaceAt(x, z), c = beachRgb(coast, x, z);
    seen[kind] = (seen[kind] ?? 0) + 1;
    if (kind === 'deck' || kind === 'stairs' || kind === 'ramp') assert.deepEqual(c, DECK, `${kind} at (${x.toFixed(1)}, ${z.toFixed(1)}) is paving`);
    else if (kind === 'sand') assert.deepEqual(c, SAND, `sand at (${x.toFixed(1)}, ${z.toFixed(1)})`);
    else if (kind === 'wetsand') assert.ok(c[0] > 230 && c[1] > 220 && c[2] > 200, `the wet strip at (${x.toFixed(1)}, ${z.toFixed(1)}) is the surf's foam: ${c}`);
    else { const w = waterRgb(real.depthAt(x, z)); for (let i = 0; i < 3; i++) near(c[i], w[i], 1e-9, `${kind} at (${x.toFixed(1)}, ${z.toFixed(1)}), channel ${i}: the colour of ${real.depthAt(x, z).toFixed(2)} m of water`); assert.ok(c[2] > c[0], 'water is bluer than red'); }
  }
  for (const kind of ['deck', 'sand', 'wetsand', 'shallow', 'wade', 'swim']) assert.ok(seen[kind] > 20, `the sample has ${kind} (${seen[kind] ?? 0})`);
  for (const a of real.accesses) {      // the stairs and the ramp are too narrow for the sample: each one's middle, by name
    const ramp = a.kind === 'ramp', z = ramp ? (DECK_Z + real.rampEnd) / 2 : (STAIR_FLIGHT[0] + STAIR_FLIGHT[1]) / 2;
    assert.equal(real.surfaceAt(a.x, z), ramp ? 'ramp' : 'stairs', `${a.id} is where the plan says`);
    assert.deepEqual(beachRgb(coast, a.x, z), DECK, `${a.id}'s ${ramp ? 'ramp' : 'stairs'} is paving`);
  }
  const lit = beachRgb(real, 40, 126, 1.2), dim = beachRgb(real, 40, 126, 0.85);
  assert.ok(lit[0] > SAND[0] * 1.19 || lit[0] === 255, 'the light scales the colour'); assert.ok(Math.abs(dim[0] - SAND[0] * 0.85) < 1e-9, 'and darkens it');
  assert.ok(beachRgb(real, 0, 104, 3).every((v) => v <= 255), 'and never past 255');
  const out = [0, 0, 0]; assert.equal(beachRgb(real, 0, 150, 1, out), out, 'written into the array it is given');
});

test('the legend\'s two beach colours are the ones the plan paints: the sand\'s, and the sea\'s where a swimmer begins (1.3 m); in Spanish', () => {
  assert.deepEqual(LEGEND_BEACH.map(([, t]) => t), ['Playa', 'Mar']);
  const css = (c) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
  assert.equal(LEGEND_BEACH[0][0], css(beachRgb(real, 40, 126)), 'Playa is the sand');
  assert.equal(LEGEND_BEACH[1][0], css(waterRgb(1.3)), 'Mar is the sea at 1.3 m');
  assert.ok(Object.isFrozen(LEGEND_BEACH));
});

test('the beach\'s landmarks are ranked (the pier and the beach are important, the promenade, the tower and the raft are not), and the beach\'s own names are the plan\'s: nothing is renamed', () => {
  const lm = real.landmarks;
  assert.deepEqual(lm.map((l) => l.kind).sort(), ['beach', 'pier', 'promenade', 'raft', 'tower']);
  for (const l of lm) assert.ok(Object.hasOwn(LM_PRI, l.kind), `the map ranks "${l.kind}"`);
  assert.deepEqual(byPriority(lm).map((l) => l.id), ['muelle', 'playa', 'malecon', 'salvavidas', 'balsa'], 'pier, beach, then the plan\'s order');
  assert.deepEqual(byPriority([{ id: 'a', kind: 'zzz' }, { id: 'b', kind: 'shop' }, { id: 'c', kind: 'busstop' }, { id: 'd', kind: 'chapel' }, { id: 'e', kind: 'yyy' }]).map((l) => l.id), ['d', 'a', 'b', 'e', 'c'], 'a kind the map does not list counts 3, the plan\'s order within a rank');
  assert.deepEqual(byPriority(undefined), [], 'no landmarks, no list');
  assert.deepEqual(real.areas.map((a) => a.name), ['La Playa', 'El Mar']);
  for (const [k, v] of Object.entries({ viewpoint: 1, chapel: 1, school: 1, clinic: 1, hall: 1, court: 1, shrine: 2, plaza: 2, stairs: 3, street: 3, shop: 3, busstop: 4 })) assert.equal(LM_PRI[k], v, `the town's ${k} keeps its rank`);
  assert.ok(real.areas.every((a) => a.poly.every(([, z]) => z >= 100 && z <= STOP_Z)) && real.landmarks.every((l) => l.z >= 100 && l.z <= 222), 'all of it is inside the frame\'s south part');
  assert.equal(SEA, -1.2);
});
