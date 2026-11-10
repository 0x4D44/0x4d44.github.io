// core/streetlights.ts: where the street lamps and the forecourt's masts stand (round seven, night lighting). Pure data, so every rule is tested on numbers: first on a straight street whose
// answer is worked out by hand, then on the real committed data (web/src/data/kx-city.json and kx-track.json).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildCity, hash01, inKxCentral } from '../city.ts';
import type { CityData, RoadClass } from '../city.ts';
import type { Pt } from '../geo.ts';
import type { KxData } from '../osm.ts';
import { pointInPolygon, shedLayout, shedToWorld, worldToShed } from '../station.ts';
import {
  decodeLampRoads, encodeLampRoads, forecourtMasts, FORECOURT_MASTS, LAMP_END_MARGIN, LAMP_KERB, LAMP_KIND, LAMP_MIN_RUN, LAMP_RULES, lampKind, lampSpots, MAST_HEIGHT, MAST_LIFT, POOL_REACH, poolRadius,
} from '../streetlights.ts';
import type { LampContext, LampRoad, LampRule, LampRun } from '../streetlights.ts';

const city: CityData = JSON.parse(readFileSync(new URL('../../web/src/data/kx-city.json', import.meta.url), 'utf8'));
const data: KxData = JSON.parse(readFileSync(new URL('../../web/src/data/kx-track.json', import.meta.url), 'utf8'));

const close = (a: number, b: number, eps: number, what = ''): void => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} != ${b} (within ${eps})`);
const ctx = (over: Partial<LampContext> = {}): LampContext => ({ rand: hash01, modern: () => false, blocked: () => false, ...over });
const run = (over: Partial<LampRun> = {}): LampRun => ({ id: 5, cls: 'tertiary', half: 3.5, line: [[0, 0], [300, 0]], y: 0.07, ...over });
const rules = Object.entries(LAMP_RULES) as [RoadClass, LampRule][];

test('lampSpots: a lamp every spacing metres along a street, the sides taking turns, a kerb outside the carriageway, the arm over the road', () => {
  const rule = LAMP_RULES.tertiary as LampRule;
  const spots = lampSpots([run()], ctx());
  assert.ok(spots.length >= 10 && spots.length <= 14, `${spots.length} lamps on 300 m of a street with a lamp every ${rule.spacing} m`);
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i]!;
    if (i > 0) {
      const gap = s.x - spots[i - 1]!.x;
      assert.ok(gap >= rule.spacing * 0.9 - 1e-9 && gap <= rule.spacing * 1.1 + 1e-9, `lamp ${i} stands ${gap} m past the last, a tenth either way of ${rule.spacing}`);
      assert.notEqual(Math.sign(s.z), Math.sign(spots[i - 1]!.z), `lamp ${i} is on the other side from the one before`);
    }
    // a post stands a kerb outside the carriageway's edge (half 3.5 m), 4.1 m from the centre line
    close(Math.abs(s.z), 3.5 + LAMP_KERB, 1e-9, `lamp ${i}'s offset`);
    assert.ok(s.x >= LAMP_END_MARGIN && s.x <= 300 - LAMP_END_MARGIN, `lamp ${i} keeps clear of the ends (x ${s.x})`);
    assert.equal(s.height, rule.height);
    assert.equal(s.y, 0.07);
    assert.deepEqual(s.slope, [0, 0]);
    assert.equal(s.mast, undefined);
    // the arm lies along x at a yaw of zero, and a turn about y takes it to (cos yaw, -sin yaw) on the ground: it points across to the centre line
    const arm: Pt = [Math.cos(s.yaw), -Math.sin(s.yaw)];
    close(arm[0], 0, 1e-9, `lamp ${i}'s arm along the street`);
    close(arm[1], -Math.sign(s.z), 1e-9, `lamp ${i}'s arm across the street, toward the centre line`);
  }
  assert.equal(new Set(spots.map((s) => s.kind)).size, 1, 'one road, one kind of light');
  // the other way along the same street the lamps still stand at the same offsets, on the same sides of the road (the right of travel changes, so the sides swap)
  const back = lampSpots([run({ line: [[300, 0], [0, 0]] })], ctx());
  for (const s of back) close(Math.abs(s.z), 3.5 + LAMP_KERB, 1e-9, 'a street drawn from the other end');
  assert.ok(Math.abs(back.length - spots.length) <= 1, `${back.length} lamps the other way, ${spots.length} this way`);
});

test('lampSpots: the roads that are lit and how: taller posts and a closer spacing on the bigger roads, none on a path or a cycleway', () => {
  assert.deepEqual(Object.keys(LAMP_RULES).sort(), ['minor', 'pedestrian', 'primary', 'secondary', 'service', 'tertiary', 'trunk']);
  const order: RoadClass[] = ['trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'];
  for (let i = 1; i < order.length; i++) {
    const [big, small] = [LAMP_RULES[order[i - 1] as RoadClass] as LampRule, LAMP_RULES[order[i] as RoadClass] as LampRule];
    assert.ok(big.height >= small.height, `${order[i - 1]} is as tall as ${order[i]}: ${big.height} against ${small.height}`);
    assert.ok(big.spacing <= small.spacing, `${order[i - 1]} is as close as ${order[i]}: ${big.spacing} against ${small.spacing}`);
  }
  for (const [cls, rule] of rules) {
    const spots = lampSpots([run({ cls, line: [[0, 0], [400, 0]] })], ctx());
    const expected = (400 - 2 * LAMP_END_MARGIN) / rule.spacing;
    assert.ok(Math.abs(spots.length - expected) <= 3, `${cls}: ${spots.length} lamps on 400 m, about ${expected.toFixed(1)}`);
    assert.ok(spots.every((s) => s.height === rule.height), `${cls}: posts of ${rule.height} m`);
  }
  for (const cls of ['path', 'cycleway'] as const) assert.deepEqual(lampSpots([run({ cls })], ctx()), [], `${cls}: no lamps`);
});

test('lampSpots: a service road\'s lamps all stand on one side (the side is the road\'s own luck), the others alternate', () => {
  assert.equal(LAMP_RULES.service?.sides, 'one');
  for (const id of [1, 2, 3, 4, 5, 6]) {
    const sides = new Set(lampSpots([run({ id, cls: 'service', line: [[0, 0], [300, 0]] })], ctx()).map((s) => Math.sign(s.z)));
    assert.equal(sides.size, 1, `road ${id}: one side only`);
  }
  const seen = new Set<number>();
  for (let id = 1; id <= 20; id++) for (const s of lampSpots([run({ id, cls: 'service' })], ctx())) seen.add(Math.sign(s.z));
  assert.equal(seen.size, 2, 'but not always the same one');
  for (const [cls, rule] of rules) {
    if (rule.sides !== 'alternate') continue;
    const sides = lampSpots([run({ cls })], ctx()).map((s) => Math.sign(s.z));
    assert.ok(sides.every((side, i) => i === 0 || side !== sides[i - 1]), `${cls}: the sides take turns`);
  }
});

test('lampSpots: none near the end of a run, none on a run that is too short, and none where blocked says so (whose own road is passed to it)', () => {
  assert.deepEqual(lampSpots([run({ line: [[0, 0], [LAMP_MIN_RUN - 0.1, 0]] })], ctx()), [], 'a run under the minimum has no lamp');
  // the end margins alone leave room for a lamp on a run a hair under the minimum (9 m to 10.9 m of a 19.9 m one), so for some roads' luck the minimum is what keeps it bare
  const roomy = (id: number, length: number): number => lampSpots([run({ id, cls: 'trunk', line: [[0, 0], [length, 0]] })], ctx()).length;
  const withRoom = Array.from({ length: 200 }, (_, id) => id).filter((id) => roomy(id, LAMP_MIN_RUN) > 0);
  assert.ok(withRoom.length >= 10, `${withRoom.length} of 200 roads have their first lamp in the room a minimum run leaves`);
  for (let id = 0; id < 200; id++) assert.equal(roomy(id, LAMP_MIN_RUN - 0.1), 0, `road ${id}: a run of ${LAMP_MIN_RUN - 0.1} m has no lamp, whatever its luck`);
  assert.deepEqual(lampSpots([run({ line: [[0, 0]] })], ctx()), [], 'a point is no road');
  const short = lampSpots([run({ line: [[0, 0], [60, 0]] })], ctx());
  assert.ok(short.length >= 1 && short.every((s) => s.x >= LAMP_END_MARGIN && s.x <= 60 - LAMP_END_MARGIN), `${short.map((s) => s.x)} all clear of the ends`);
  const all = lampSpots([run({ id: 9 })], ctx());
  const calls: [Pt, number][] = [];
  const blocked = lampSpots([run({ id: 9 })], ctx({ blocked: (p, id) => { calls.push([p, id]); return p[0] > 100 && p[0] < 200; } }));
  assert.ok(all.some((s) => s.x > 100 && s.x < 200), 'there are lamps in the stretch to block');
  assert.ok(blocked.every((s) => !(s.x > 100 && s.x < 200)), 'none stands in the blocked stretch');
  assert.deepEqual(blocked, all.filter((s) => !(s.x > 100 && s.x < 200)), 'and the others do not move for it');
  assert.equal(calls.length, all.length, 'it is asked about every place a lamp would go');
  assert.ok(calls.every(([, id]) => id === 9), 'with the road\'s own number');
  for (const [p, ] of calls) close(Math.abs(p[1]), 4.1, 1e-9, 'at the lamp\'s own foot');
});

test('lampSpots: the same lamps every time, a road of its own luck, and a bend is followed (the offset is from the line at every lamp)', () => {
  const a = lampSpots([run()], ctx());
  assert.deepEqual(lampSpots([run()], ctx()), a, 'repeatable');
  const other = lampSpots([run({ id: 6 })], ctx());
  assert.notDeepEqual(other.map((s) => s.x), a.map((s) => s.x), 'another road, other places');
  // the first lamp of a road stands its own distance in from the end (a margin and up to half a spacing: each road's own luck), not the margin for all of them
  const spacing = (LAMP_RULES.tertiary as LampRule).spacing;
  const firsts = Array.from({ length: 30 }, (_, id) => (lampSpots([run({ id: id + 1 })], ctx())[0] as { x: number }).x);
  assert.ok(firsts.every((x) => x >= LAMP_END_MARGIN - 1e-9 && x <= LAMP_END_MARGIN + spacing / 2 + 1e-9), `every first lamp is within half a spacing of the margin: ${firsts}`);
  assert.ok(new Set(firsts.map((x) => x.toFixed(3))).size >= 20, `and at each road's own distance: ${new Set(firsts.map((x) => x.toFixed(3))).size} different in 30 roads`);
  // a street that turns a right angle at (100, 0): a lamp on the first leg is 4.1 m from it in z, one on the second 4.1 m in x, and the road has both
  const bent = lampSpots([run({ cls: 'primary', line: [[0, 0], [100, 0], [100, 100]] })], ctx());
  const onFirst = bent.filter((s) => s.x <= 100 && Math.abs(Math.abs(s.z) - 4.1) < 1e-9);
  const onSecond = bent.filter((s) => s.z > 4.5 && Math.abs(Math.abs(s.x - 100) - 4.1) < 1e-9);
  assert.ok(onFirst.length >= 3 && onSecond.length >= 3, `${onFirst.length} lamps on the first leg, ${onSecond.length} on the second`);
  assert.equal(onFirst.length + onSecond.length, bent.length, 'every lamp is on one leg or the other');
  // and the arm of a lamp on the second leg turns with it: along x, across a street that runs south
  for (const s of onSecond) {
    close(Math.abs(Math.cos(s.yaw)), 1, 1e-9, 'across a street that runs south');
    close(Math.sin(s.yaw), 0, 1e-9, 'and not along it');
  }
});

test('lampSpots: a lamp stands on the surface it is given and the pool lies in the surface\'s plane: the slope is the surface\'s gradient, on any bearing', () => {
  const plane = (x: number, z: number): number => 0.3 + 0.1 * x + 0.05 * z;
  for (const line of [[[0, 0], [300, 0]], [[0, 0], [0, 300]], [[0, 0], [200, 200]], [[300, 100], [0, -50]]] as Pt[][]) {
    const spots = lampSpots([run({ line, y: (x, z) => plane(x, z) })], ctx());
    assert.ok(spots.length >= 8, `${spots.length} lamps along ${JSON.stringify(line)}`);
    for (const s of spots) {
      close(s.y, plane(s.x, s.z), 1e-9, 'the height under the post is the surface\'s');
      close(s.slope[0], 0.1, 1e-9, 'the rise per metre east');
      close(s.slope[1], 0.05, 1e-9, 'the rise per metre south');
    }
  }
  // a surface that is a function of the way along and the way across (the drape of a bridge deck): along the street it rises 0.02 a metre and across it, to the right of travel, 0.01
  const deck = lampSpots([run({ y: (_x, _z, along, across) => 0.02 * along + 0.01 * across })], ctx());
  assert.ok(deck.length >= 8, `${deck.length} lamps on the deck`);
  for (const s of deck) {
    close(s.slope[0], 0.02, 1e-9, 'rise along the street (east)');
    close(s.slope[1], -0.01, 1e-9, 'rise to the right of travel, which is north of an eastbound street');
    // the post stands at the kerb, 4.1 m across from the line (to the right of travel, which is north, z < 0, on an eastbound street), so the surface's height there is 0.02 a metre along and 0.01 a metre across
    close(s.y, 0.02 * s.x - 0.01 * s.z, 1e-9, 'the height is the surface\'s at the foot of the post, across from the line, not at the line');
  }
  assert.deepEqual(lampSpots([run({ y: 1.25 })], ctx()).map((s) => [s.y, ...s.slope]).filter(([y, a, b]) => y !== 1.25 || a !== 0 || b !== 0), [], 'a level surface has no slope');
});

test('lampKind: a repeatable share of the old streets is sodium and the rest warm white, the new quarter\'s are white, its walkways cool', () => {
  const share = (cls: RoadClass, kind: number): number => {
    let n = 0;
    for (let id = 0; id < 400; id++) if (lampKind({ id, cls }, ctx(), [0, 0]) === kind) n++;
    return n / 400;
  };
  close(share('primary', LAMP_KIND.sodium), 0.8, 0.07, 'a main road is mostly sodium');
  close(share('trunk', LAMP_KIND.sodium), 0.8, 0.07, 'and a trunk road');
  close(share('secondary', LAMP_KIND.sodium), 0.8, 0.07, 'and a secondary road');
  close(share('tertiary', LAMP_KIND.sodium), 0.55, 0.08, 'a tertiary road is a side street');
  close(share('minor', LAMP_KIND.sodium), 0.55, 0.08, 'a side street about half');
  close(share('service', LAMP_KIND.sodium), 0.55, 0.08, 'and a service road');
  assert.equal(share('pedestrian', LAMP_KIND.warm), 1, 'a pedestrian street is warm white');
  assert.equal(share('primary', LAMP_KIND.cool), 0, 'no old street is cool');
  const modern = (cls: RoadClass): number => lampKind({ id: 3, cls }, ctx({ modern: () => true }), [10, 10]);
  assert.equal(modern('primary'), LAMP_KIND.warm);
  assert.equal(modern('minor'), LAMP_KIND.warm);
  assert.equal(modern('pedestrian'), LAMP_KIND.cool);
  assert.equal(modern('service'), LAMP_KIND.cool);
  // it is the lamp's own place that is asked, so a long street changes its light where it crosses the new quarter's edge
  const asked: Pt[] = [];
  lampKind({ id: 3, cls: 'minor' }, ctx({ modern: (p) => { asked.push(p); return false; } }), [7, 9]);
  assert.deepEqual(asked, [[7, 9]]);
  const crossing = lampSpots([run({ id: 4, cls: 'primary', line: [[0, 0], [400, 0]] })], ctx({ modern: (p) => p[0] > 200 }));
  assert.ok(crossing.some((l) => l.x < 200) && crossing.some((l) => l.x > 200));
  assert.ok(crossing.filter((l) => l.x > 200).every((l) => l.kind === LAMP_KIND.warm), 'white inside the quarter');
  assert.equal(new Set(crossing.filter((l) => l.x < 200).map((l) => l.kind)).size, 1, 'and the road\'s own light outside it');
  // and in the real city: the lamps of the new quarter are never sodium
  const real = buildCity(data.buildings, city, { groundY: 0, trees: false });
  assert.ok(real.lamps.length > 900 && real.lamps.length < 1300, `${real.lamps.length} lamps in the real city`);
  const lit = real.lamps.filter((l) => inKxCentral([l.x, l.z]));
  assert.ok(lit.length > 150, `${lit.length} lamps in the new quarter`);
  assert.ok(lit.every((l) => l.kind !== LAMP_KIND.sodium), 'none of them sodium');
  assert.ok(real.lamps.some((l) => l.kind === LAMP_KIND.sodium) && real.lamps.some((l) => l.kind === LAMP_KIND.warm), 'the old streets have both');
});

test('a pool of light reaches POOL_REACH post heights, to where the light, falling as the cube of the cosine from the lamp\'s foot, is a eleventh of what it is under the lamp', () => {
  assert.equal(poolRadius(10), 10 * POOL_REACH);
  assert.equal(poolRadius(0), 0);
  const edge = 1 / Math.sqrt(1 + POOL_REACH * POOL_REACH);
  close(edge ** 3, 1 / 11, 0.005, 'a eleventh at the edge');
});

test('forecourtMasts: a row of masts in front of the station front, in the shed\'s frame, each on the ground it is given and tilted to it', () => {
  const layout = shedLayout(data);
  const plane = (x: number, z: number): number => 4.2 + 0.02 * x + 0.01 * z;
  const masts = forecourtMasts(data, plane);
  assert.equal(masts.length, FORECOURT_MASTS.length);
  assert.ok(masts.length >= 4 && masts.length <= 10);
  masts.forEach((m, i) => {
    const [u, v] = FORECOURT_MASTS[i] as readonly [number, number];
    const [x, z] = shedToWorld(layout, u, v);
    close(m.x, x, 1e-9, `mast ${i} x`);
    close(m.z, z, 1e-9, `mast ${i} z`);
    close(m.y, plane(x, z) + MAST_LIFT, 1e-9, `mast ${i} stands on the ground and the plaza's lift`);
    close(m.slope[0], 0.02, 1e-9, `mast ${i} slope east`);
    close(m.slope[1], 0.01, 1e-9, `mast ${i} slope south`);
    assert.equal(m.mast, true);
    assert.equal(m.kind, LAMP_KIND.cool);
    assert.equal(m.height, MAST_HEIGHT);
    assert.equal(m.yaw, 0);
    assert.ok(worldToShed(layout, [m.x, m.z]).v < 0, `mast ${i} is in front of the front`);
  });
  assert.equal(MAST_HEIGHT, 12);
  assert.ok(MAST_LIFT > 0.1 && MAST_LIFT < 0.2, 'the plaza\'s 5 cm and the drape\'s 10 cm');
  // none where there is no station to stand in front of (a data set without platform 8 or the station building)
  assert.deepEqual(forecourtMasts({ platforms: [], buildings: [] }, plane), []);
  assert.deepEqual(forecourtMasts({ platforms: data.platforms, buildings: [] }, plane), []);
});

test('the real forecourt: no mast stands in a building or within two metres of a street lamp, and the masts are spaced apart along the front', () => {
  const layout = shedLayout(data);
  const masts = forecourtMasts(data, () => 0);
  const real = buildCity(data.buildings, city, { groundY: 0, trees: false });
  for (const m of masts) {
    for (const b of data.buildings) assert.equal(pointInPolygon([m.x, m.z], b.pts), false, `mast at ${m.x.toFixed(1)}, ${m.z.toFixed(1)} is inside building ${b.id}`);
    for (const l of real.lamps) assert.ok(Math.hypot(l.x - m.x, l.z - m.z) > 2, `mast at ${m.x.toFixed(1)}, ${m.z.toFixed(1)} is ${Math.hypot(l.x - m.x, l.z - m.z).toFixed(2)} m from a street lamp`);
  }
  const us = masts.map((m) => worldToShed(layout, [m.x, m.z]).u).sort((p, q) => p - q);
  for (let i = 1; i < us.length; i++) assert.ok((us[i] as number) - (us[i - 1] as number) >= 15, `masts ${i - 1} and ${i} are ${((us[i] as number) - (us[i - 1] as number)).toFixed(1)} m apart along the front`);
});

test('encodeLampRoads and decodeLampRoads: a line is its first point and then its steps, in whole units, by class, the decks of bridges apart; decoding gives the same lines back', () => {
  const roads: LampRoad[] = [
    { cls: 'primary', bridge: false, line: [[-771, -596.5], [-681, -624], [-680.5, -620]] },
    { cls: 'minor', bridge: false, line: [[10, 20], [10, 20.5]] },
    { cls: 'primary', bridge: true, line: [[103, -87], [148, 76.5]] },
    { cls: 'primary', bridge: false, line: [[0, 0], [1.5, -2]] },
  ];
  const file = encodeLampRoads(roads, 0.5);
  // the first point is its own whole units from the origin, then each point is the steps from the last (minus signs and all)
  assert.deepEqual(file.ways.primary, [[-1542, -1193, 180, -55, 1, 8], [0, 0, 3, -4]]);
  assert.deepEqual(file.ways.minor, [[20, 40, 0, 1]]);
  assert.deepEqual(file.bridges.primary, [[206, -174, 90, 327]]);
  assert.equal(file.bridges.minor, undefined, 'no class that has no deck');
  // the order is the file's: the ground's roads (each class in the order it was met), then the bridges'
  const back = decodeLampRoads({ unit: 0.5, ...file });
  assert.deepEqual(back, [roads[0], roads[3], roads[1], roads[2]]);
  // a step is the unit: the same file at another unit is the same steps at another scale
  const wide = decodeLampRoads({ unit: 2, ...file });
  assert.deepEqual(wide[0]?.line[0], [-3084, -2386]);
  assert.deepEqual(wide[0]?.line[1], [-3084 + 360, -2386 - 110]);
  // a point between two units is the nearer one, whichever side of zero it is on
  const rounded = encodeLampRoads([{ cls: 'tertiary', bridge: false, line: [[0.24, -0.24], [0.26, -0.26], [-0.74, 0.76]] }], 0.5);
  assert.deepEqual(decodeLampRoads({ unit: 0.5, ...rounded })[0]?.line, [[0, 0], [0.5, -0.5], [-0.5, 1]]);
  // nothing in, nothing out
  assert.deepEqual(encodeLampRoads([], 0.5), { ways: {}, bridges: {} });
  assert.deepEqual(decodeLampRoads({ unit: 0.5, ways: {}, bridges: {} }), []);
});
