// The soundscape rules (js/audio/mix.js, owner: A1): which sounds belong to which place and hour. Pure functions on the real plan, so zones, day and
// night, altitude, crowds, emitters and the bell schedule are all checked as numbers, without WebAudio.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/audio-mix.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/audio/mix.js';
import { seaState } from '../js/core/sea.js';
import { createCoast, BAY_X } from '../js/world/coast.js';
import { makePlan } from './world-lib.mjs';

const { plan } = makePlan();
const lm = (id) => plan.landmarks.find((l) => l.id === id);
const SQUARE = [[0, 0], [10, 0], [10, 10], [0, 10]];
const mixAt = (x, z, o = {}) => {
  const lo = 0, hi = 30, alt = o.alt ?? Math.min(1, Math.max(0, (plan.heightAt(x, z) - lo) / (hi - lo)));
  return M.computeMix({ areas: plan.areas, x, z, alt, hour: 17.2, crowd: 0.4, ...o });
};

test('geometry: distance to a polygon is 0 inside and the true distance outside; weights sum to one', () => {
  assert.equal(M.distToPoly(SQUARE, 5, 5), 0);
  assert.ok(Math.abs(M.distToPoly(SQUARE, 15, 5) - 5) < 1e-9);
  assert.ok(Math.abs(M.distToPoly(SQUARE, 13, 14) - 5) < 1e-9, 'nearest point is the corner');
  assert.ok(Math.abs(M.distToPoly(SQUARE, 5, -2) - 2) < 1e-9);
  const w = M.areaWeights(plan.areas, -6.5, 92.5);
  assert.ok(Math.abs(w.reduce((a, o) => a + o.w, 0) - 1) < 1e-9);
  assert.equal(w.sort((a, b) => b.w - a.w)[0].id, 'plan');
  assert.deepEqual(M.areaWeights([], 0, 0), [{ id: 'default', w: 1 }]);
  assert.deepEqual(M.areaWeights([{ id: 'bad', poly: [[0, 0]] }], 0, 0), [{ id: 'default', w: 1 }], 'a degenerate area is ignored');
});

test('zoneAt names the barrio\'s areas where the landmarks are', () => {
  assert.equal(M.zoneAt(plan.areas, plan.spawn.x, plan.spawn.z), 'plan', 'spawn: the bottom street');
  assert.equal(M.zoneAt(plan.areas, lm('mirador').x, lm('mirador').z), 'ridge');
  assert.equal(M.zoneAt(plan.areas, lm('almendros').x, lm('almendros').z), 'almendros');
  assert.equal(M.zoneAt(plan.areas, lm('capillaplaza').x, lm('capillaplaza').z), 'cumbre');
  assert.equal(M.zoneAt(plan.areas, -80, 0), 'west'); assert.equal(M.zoneAt(plan.areas, 80, 0), 'east');
  assert.equal(M.zoneAt(plan.areas, 500, 500), null, 'far outside every area');
});

test('every zone has a full, finite, non-negative recipe', () => {
  for (const a of plan.areas) assert.ok(M.ZONES[a.id], 'no zone recipe for area ' + a.id);
  for (const [id, z] of Object.entries({ ...M.ZONES, default: M.DEFAULT_ZONE })) for (const k of M.ZONE_KEYS) assert.ok(Number.isFinite(z[k]) && z[k] >= 0 && z[k] <= 1.5, `${id}.${k}`);
  const b = M.blendZones(plan.areas, 0, 0); for (const k of M.ZONE_KEYS) assert.ok(b[k] >= 0 && b[k] <= 1.5, k);
});

test('the day: dark by night, light by day, in one smooth step each way', () => {
  assert.equal(M.nightFromHour(12), 0); assert.equal(M.nightFromHour(3), 1); assert.equal(M.nightFromHour(0), 1); assert.equal(M.nightFromHour(23.9), 1);
  let prev = 1; for (let h = 5.0; h <= 7.0; h += 0.1) { const n = M.nightFromHour(h); assert.ok(n <= prev + 1e-9, 'dawn is monotone at ' + h); prev = n; }
  prev = 0; for (let h = 17.9; h <= 19.8; h += 0.1) { const n = M.nightFromHour(h); assert.ok(n >= prev - 1e-9, 'dusk is monotone at ' + h); prev = n; }
  assert.ok(M.nightFromHour(6) > 0.2 && M.nightFromHour(6) < 0.9 && M.nightFromHour(18.8) > 0.2 && M.nightFromHour(18.8) < 0.9, 'dawn and dusk are in between');
  assert.equal(M.nightFromHour(30), M.nightFromHour(6), 'hours wrap');
});

test('activities follow the hours of a household and a street', () => {
  const A = M.activity;
  assert.equal(A('tv', 4), 0); assert.equal(A('tv', 20), 1); assert.equal(A('radio', 3), 0); assert.ok(A('radio', 10) > 0.9);
  assert.equal(A('school', 3), 0); assert.equal(A('school', 12), 1); assert.equal(A('workshop', 22), 0); assert.ok(A('workshop', 10) > 0.9);
  assert.ok(A('cook', 12.5) > 0.9 && A('cook', 10) < 0.2 && A('cook', 18.5) > 0.9 && A('cook', 3) === 0, 'meals');
  assert.ok(A('court', 17) > 0.9 && A('court', 4) === 0);
  assert.ok(A('traffic', 3) >= 0.3 && A('traffic', 3) < A('traffic', 8), 'a few vehicles at 3 am, a lot at 8');
  assert.ok(A('birds', 12) >= 0.55 && A('birds', 6) > A('birds', 12), 'birds sing most at dawn');
  for (const k of ['awake', 'kids', 'tv', 'cook', 'radio', 'workshop', 'court', 'school', 'traffic', 'birds', 'unknown']) for (let h = -3; h < 30; h += 0.25) { const v = A(k, h); assert.ok(v >= 0 && v <= 1.0001 && Number.isFinite(v), `${k} @ ${h}: ${v}`); }
  assert.equal(A('unknown', 5), 1);
});

test('mix: altitude trades traffic for wind', () => {
  const lowAlt = mixAt(0, 90, { alt: 0 }), mid = mixAt(0, 90, { alt: 0.5 }), high = mixAt(0, 90, { alt: 1 });
  assert.ok(lowAlt.beds.wind < mid.beds.wind && mid.beds.wind < high.beds.wind, 'wind rises with height');
  assert.ok(lowAlt.beds.traffic > mid.beds.traffic && mid.beds.traffic > high.beds.traffic, 'traffic falls with height');
  const bottom = mixAt(plan.spawn.x, plan.spawn.z, { alt: 0 }), ridge = mixAt(lm('mirador').x, lm('mirador').z, { alt: 1 });
  assert.ok(bottom.beds.traffic > bottom.beds.wind, 'the bottom street is traffic: ' + JSON.stringify(bottom.beds));
  assert.ok(ridge.beds.wind > ridge.beds.traffic * 5, 'the ridge is wind: ' + JSON.stringify(ridge.beds));
  assert.ok(ridge.rates.horns < 0.1, 'next to no car horns on the ridge (one in ten minutes at most): ' + ridge.rates.horns);
  assert.ok(bottom.rates.horns > 0.5, 'but some down on the road');
});

test('mix: day and night swap the crickets for the birds, the children and the neighbours', () => {
  const day = mixAt(20, 47, { hour: 11, night: 0 }), night = mixAt(20, 47, { hour: 23, night: 1 }), dawn = mixAt(20, 47, { hour: 6.3, night: 0.35 });
  assert.equal(day.beds.crickets, 0); assert.ok(night.beds.crickets > 0.3, 'crickets at night: ' + night.beds.crickets);
  assert.ok(dawn.beds.crickets > 0 && dawn.beds.crickets < night.beds.crickets, 'and fewer at dawn');
  assert.ok(day.rates.birds > 5 && night.rates.birds === 0, `birds ${day.rates.birds} / ${night.rates.birds}`);
  assert.ok(night.rates.dogs > day.rates.dogs, 'dogs bark more at night');
  assert.ok(day.beds.children > 0.2 && night.beds.children === 0, 'children play by day only');
  assert.equal(mixAt(20, 47, { hour: 5, night: 0.8 }).beds.children, 0, 'and not at five in the morning');
  assert.ok(day.beds.murmur > night.beds.murmur && night.beds.murmur >= 0, 'fewer voices at night');
  assert.ok(mixAt(20, 47, { hour: 3, night: 1 }).beds.murmur < 0.5 * day.beds.murmur, 'nearly none at 3 am');
  // the children go in with the light, not only with the clock: at 19.2 h their hours are not quite over but the sun has gone
  const dusk = mixAt(20, 47, { hour: 19.2 }), light = mixAt(20, 47, { hour: 19.2, night: 0 });
  assert.ok(dusk.beds.children > 0 && dusk.beds.children < 0.35 * light.beds.children, `at dusk the children are called in: ${dusk.beds.children.toFixed(3)} against ${light.beds.children.toFixed(3)} in full light`);
});

test('mix: a crowd raises the neighbours and the children; an empty street quietens them', () => {
  const lone = mixAt(0, 90, { hour: 11, night: 0, crowd: 0 }), busy = mixAt(0, 90, { hour: 11, night: 0, crowd: 1 });
  assert.ok(busy.beds.murmur > 2 * lone.beds.murmur && busy.beds.children > 2 * lone.beds.children);
  assert.ok(lone.beds.murmur > 0, 'never completely empty');
});

test('mix: every output is finite and bounded, for any place, hour, altitude and crowd', () => {
  for (const x of [-120, -50, 0, 40, 130]) for (const z of [-120, -60, 0, 60, 120]) for (const hour of [0, 6, 12, 17.2, 22]) for (const alt of [0, 0.5, 1]) for (const crowd of [0, 1]) {
    const m = M.computeMix({ areas: plan.areas, x, z, alt, hour, crowd });
    for (const [k, v] of [...Object.entries(m.beds), ...Object.entries(m.rates)]) assert.ok(Number.isFinite(v) && v >= 0 && v < 30, `${k} = ${v} at ${x},${z} ${hour}h`);
    for (const k of Object.keys(m.beds)) assert.ok(m.beds[k] <= 2, `${k} bed ${m.beds[k]}`);
  }
  const bare = M.computeMix({}); assert.ok(Number.isFinite(bare.beds.wind), 'no inputs at all still gives a mix');
});

test('heightRange samples the terrain\'s 5th..95th percentile', () => {
  const r = M.heightRange(plan.heightAt);
  assert.ok(r.hi - r.lo > 20 && r.hi - r.lo < 40 && r.lo >= 0 && r.hi < 40, JSON.stringify(r));
  assert.deepEqual(M.heightRange(() => NaN), { lo: 0, hi: 30 }, 'no valid terrain: a sane default');
  const flat = M.heightRange(() => 5); assert.ok(flat.hi > flat.lo, 'a flat plain never divides by zero');
  const spiky = M.heightRange((x, z) => (x === 0 && z === 0 ? 500 : x === 8 && z === 8 ? -300 : 10 + x / 16 + z / 32));
  assert.ok(spiky.hi < 25 && spiky.lo > -5 && spiky.hi > 15 && spiky.lo < 5, `a mast and a pit do not stretch the range: ${JSON.stringify(spiky)}`);
});

// ---- emitters ---------------------------------------------------------------------------------------------------------------------------------
const ANCHORS = [
  { id: 'a1', kind: 'tv', x: 10, y: 0, z: 70, building: 'L01' }, { id: 'a2', kind: 'tv', x: 12, y: 0, z: 71, building: 'L01' }, { id: 'a3', kind: 'cook', x: 11, y: 0, z: 72, building: 'L01' },
  { id: 'a4', kind: 'tv', x: -20, y: 3, z: 40, building: 'L02' }, { id: 'a5', kind: 'counter', x: 30, y: 0, z: 80, building: 'L03' }, { id: 'a6', kind: 'sleep', x: 1, y: 0, z: 1, building: 'L04' },
  ...Array.from({ length: 40 }, (_, i) => ({ id: 'b' + i, kind: ['tv', 'cook', 'counter'][i % 3], x: i * 3 - 60, y: 0, z: 20 + i, building: 'B' + i })),
];

test('emitters: the landmarks that make noise, plus households, at most one of each kind per building, the same every time', () => {
  const a = M.buildEmitters(plan, ANCHORS), b = M.buildEmitters(plan, ANCHORS);
  assert.deepEqual(a, b, 'deterministic');
  assert.equal(new Set(a.map((e) => e.id)).size, a.length, 'unique ids');
  const kinds = (k) => a.filter((e) => e.kind === k);
  assert.equal(kinds('court').length, 1); assert.equal(kinds('school').length, 1); assert.equal(kinds('workshop').length, 1, 'the motorbike workshop');
  assert.ok(kinds('radio').some((e) => e.id === 'radio:panaderia') && kinds('radio').some((e) => e.id === 'radio:hall'), 'the bakery radio and the hall');
  assert.ok(a.some((e) => e.id === 'court:cancha') && Math.abs(a.find((e) => e.id === 'court:cancha').x - lm('cancha').x) < 1e-9, 'placed at the landmark');
  const per = new Map(); for (const e of a.filter((x) => x.building)) { const k = e.kind + '|' + e.building; per.set(k, (per.get(k) ?? 0) + 1); }
  assert.ok([...per.values()].every((n) => n === 1), 'one tv / stove / radio per building');
  assert.ok(!a.some((e) => e.building === 'L04'), 'a bed makes no sound');
  assert.ok(a.filter((e) => e.building && e.id.startsWith('tv:')).length > 3 && a.filter((e) => e.kind === 'cook').length > 3, 'a fair share of the households have a tv and a stove');
  for (const e of a) { assert.ok(Number.isFinite(e.x + e.y + e.z) && e.max > e.ref && e.gain > 0 && e.bed, e.id); }
  assert.deepEqual(M.buildEmitters(null, []), [], 'no plan, no emitters');
  const crowded = M.buildEmitters(plan, Array.from({ length: 30 }, (_, i) => ({ id: 'c' + i, kind: i % 2 ? 'tv' : 'cook', x: i, y: 0, z: 60, building: 'BIG' })));
  assert.equal(crowded.filter((e) => e.kind === 'tv').length, 1, 'fifteen televisions in one building are one television');
  assert.equal(crowded.filter((e) => e.kind === 'cook').length, 1, 'and fifteen stoves one stove');
});

test('emitterScore: loudest at the source, fading with distance, gone past its range or out of its hours', () => {
  const tv = { id: 't', kind: 'tv', x: 0, y: 0, z: 0, ...M.EMITTER.tv };
  const s = (d, h = 20) => M.emitterScore(tv, d, 0, 0, h);
  assert.ok(s(0) > s(2) && s(2) > s(6) && s(6) > s(15) && s(15) > 0, 'monotone');
  assert.equal(s(tv.max + 1), 0); assert.equal(s(5, 4), 0, 'a television is off at 4 am');
  assert.equal(s(2, 16.1), 0, 'one that has just come on (3 % of its evening) is still silent, not a whisper that takes a voice from the rest');
  assert.ok(s(2, 16.5) > 0.3 * s(2, 20), 'half-way through its switch-on it is clearly audible');
  assert.ok(s(1.5) <= tv.gain + 1e-9 && s(0) <= tv.gain + 1e-9, 'never louder than its gain');
  const crowd = { id: 'c', kind: 'court', x: 0, y: 0, z: 0, ...M.EMITTER.court };
  assert.ok(M.emitterScore(crowd, 60, 0, 0, 17) > M.emitterScore(tv, 60, 0, 0, 17), 'a court carries across the barrio, a television does not');
  assert.equal(M.emitterScore(crowd, 60, 0, 0, 3), 0, 'nobody plays at 3 am');
});

test('pickEmitters: the loudest few, best first, with a bonus for the ones already sounding', () => {
  const mk = (id, x) => ({ id, kind: 'tv', x, y: 0, z: 0, ...M.EMITTER.tv });
  const all = [mk('far', 15), mk('near', 2), mk('mid', 6), mk('out', 200), mk('mid2', 7)];
  const top = M.pickEmitters(all, 0, 0, 0, 20, null, 3);
  assert.deepEqual(top.map((t) => t.em.id), ['near', 'mid', 'mid2']);
  assert.ok(top[0].score > top[1].score && top[1].score > top[2].score && top[0].dist === 2);
  assert.ok(!M.pickEmitters(all, 0, 0, 0, 20, null, 10).some((t) => t.em.id === 'out'), 'out of range is never picked');
  assert.equal(M.pickEmitters(all, 0, 0, 0, 4, null, 10).length, 0, 'nothing is on at 4 am');
  const tie = M.pickEmitters([mk('b', 5), mk('a', 5)], 0, 0, 0, 20, null, 2).map((t) => t.em.id); assert.deepEqual(tie, ['a', 'b'], 'ties are broken by id');
  const close = [mk('A', 6), mk('B', 6.6)];
  assert.equal(M.pickEmitters(close, 0, 0, 0, 20, null, 1)[0].em.id, 'A');
  assert.equal(M.pickEmitters(close, 0, 0, 0, 20, new Set(['B']), 1)[0].em.id, 'B', 'hysteresis: a voice already playing is kept when the scores are close');
});

test('the bell: three for the Angelus, the hour (up to six) in daylight, silence at night', () => {
  const S = M.strokesForHour;
  assert.deepEqual([6, 12, 18].map(S), [3, 3, 3]);
  assert.deepEqual([0, 3, 5, 22, 23].map(S), [0, 0, 0, 0, 0]);
  assert.deepEqual([13, 14, 15, 16, 17].map(S), [1, 2, 3, 4, 5]);
  for (let h = 0; h < 24; h++) assert.ok(S(h) >= 0 && S(h) <= 6, `hour ${h}: ${S(h)}`);
  assert.equal(S(12.9), 3, 'fractional hours count as their hour'); assert.equal(S(-1), S(23));
});

test('pickStream: a seeded stream of numbers in range', () => {
  const a = M.pickStream(5), b = M.pickStream(5), c = M.pickStream(6);
  const xs = Array.from({ length: 50 }, () => a()), ys = Array.from({ length: 50 }, () => b()), zs = Array.from({ length: 50 }, () => c());
  assert.deepEqual(xs, ys); assert.notDeepEqual(xs, zs); assert.ok(xs.every((v) => v >= 0 && v < 1));
  const r = M.pickStream(1); for (let i = 0; i < 200; i++) { const v = r.range(3, 4), k = r.int(2, 4); assert.ok(v >= 3 && v < 4 && k >= 2 && k <= 4); }
});

// ---- the beach (round 8, engine patch 4; dev/FEATURE-BEACH.md 5): the surf, the gulls and the sea heard from under it --------------------------------------------------------
const coast = createCoast({ seed: 1, edge: () => 0.1 }), BEACH = [...plan.areas, ...coast.areas];
const close = (a, b, tol = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} against ${b} (+-${tol})`.trim());
const beachAt = (x, z, o = {}) => M.computeMix({ areas: BEACH, x, z, alt: 0.1, hour: 15, night: 0, crowd: 0.4, shore: M.nearestShore(coast, x, z)?.dist, ...o });
const AIR = ['wind', 'traffic', 'crickets', 'murmur', 'children', 'surf'];

test('the beach\'s two areas are zones with a full recipe, and zoneAt names them where the sand and the sea are', () => {
  assert.deepEqual(coast.areas.map((a) => a.id).sort(), ['mar', 'playa']);
  for (const a of coast.areas) assert.ok(M.ZONES[a.id], 'no zone recipe for area ' + a.id);
  assert.equal(M.zoneAt(BEACH, 0, 125), 'playa', 'the sand'); assert.equal(M.zoneAt(BEACH, 0, 112), 'playa', 'and the promenade');
  assert.equal(M.zoneAt(BEACH, 0, 190), 'mar', 'the water'); assert.equal(M.zoneAt(BEACH, plan.spawn.x, plan.spawn.z), 'plan', 'the town keeps its own');
  assert.ok(M.ZONES.playa.gulls === 1 && M.ZONES.mar.gulls >= 0.8 && M.ZONES.playa.surf === 1 && M.ZONES.mar.surf === 1, 'the gulls and the surf are at home here');
  for (const id of ['plan', 'almendros', 'faroles', 'cruz', 'cumbre', 'ridge', 'west', 'east']) assert.ok(M.ZONES[id].gulls <= 0.35 && M.ZONES[id].surf <= 1, id + ': the town keeps a small share of the sea');
  assert.ok(M.ZONES.ridge.surf >= 0.9 && M.ZONES.almendros.surf < 0.9, 'the open ridge faces the sea, the plaza among its trees less');
});

test('nearestShore: the point of the waterline straight across from you between the bay\'s walls, the end of the straight shore beyond them, from either side of the line', () => {
  const z0 = coast.shoreZ(20), town = M.nearestShore(coast, 20, 100), sea = M.nearestShore(coast, 20, 200), on = M.nearestShore(coast, 0, coast.shoreZ(0));
  assert.equal(town.x, 20); assert.equal(town.z, z0); close(town.dist, z0 - 100, 1e-9, 'from the town');
  assert.equal(sea.x, 20); assert.equal(sea.z, z0); close(sea.dist, 200 - z0, 1e-9, 'from the sea');
  assert.equal(on.dist, 0, 'standing on the waterline');
  const east = M.nearestShore(coast, 150, 150), west = M.nearestShore(coast, -150, 150);
  assert.equal(east.x, BAY_X); assert.equal(west.x, -BAY_X); assert.equal(east.z, coast.shoreZ(BAY_X));
  close(east.dist, Math.hypot(150 - BAY_X, 150 - coast.shoreZ(BAY_X)), 1e-9, 'beyond the east wall: to the end of the straight shore, not to the curve');
  close(west.dist, east.dist, 1e-9, 'and the west is the same');
  assert.equal(M.nearestShore(undefined, 0, 0), null, 'no coast'); assert.equal(M.nearestShore({}, 0, 0), null, 'a coast with no shore line');
  assert.equal(M.nearestShore(coast, NaN, 0), null); assert.equal(M.nearestShore(coast, 0, undefined), null);
});

test('surfLevel: a third of the roar at 45 m, more in the afternoon\'s breeze than at dawn, and the zone sets what the place keeps of it', () => {
  const f = M.surfLevel;
  assert.equal(M.SURF.REACH, 45); assert.equal(f(0, 1, 1), 1); close(f(45, 1, 1), Math.exp(-1), 1e-12, 'e^-1 at the reach');
  close(f(0, 0.35, 1), 0.5 + 0.5 * 0.35, 1e-12, 'the breeze at dawn'); close(f(30, 1, 0.5), 0.5 * f(30, 1, 1), 1e-12, 'half the zone');
  for (let d = 0; d < 300; d += 5) assert.ok(f(d + 5, 0.7, 1) < f(d, 0.7, 1), `monotone at ${d}`);
  for (const w of [0, 0.2, 0.4, 0.6, 0.8]) assert.ok(f(20, w + 0.2, 1) > f(20, w, 1), `a stronger breeze is louder at ${w}`);
  assert.equal(f(-5, 1, 1), f(0, 1, 1), 'inside the line is the line'); assert.equal(f(10, 5, 1), f(10, 1, 1)); assert.equal(f(10, -1, 1), f(10, 0, 1), 'the wind is a share of one');
  for (const bad of [NaN, undefined, null, Infinity]) assert.equal(f(bad, 1, 1), 0, `no shore (${bad}): no surf`);
});

test('underwaterMix: nothing changes in the air; with the head under the beds are dull and a quarter as loud, the world is gone and the sea\'s own bed is full', () => {
  const air = M.underwaterMix(0), deep = M.underwaterMix(1), mid = M.underwaterMix(0.5);
  assert.deepEqual([air.uw, air.cutoff, air.beds, air.shots, air.bed, air.heart.on], [0, 16000, 1, 1, 0, false]);
  assert.deepEqual([deep.uw, deep.cutoff, deep.beds, deep.shots, deep.bed], [1, 500, 0.25, 0, 1]);
  assert.deepEqual([M.UNDER.CUT, M.UNDER.AIR, M.UNDER.BEDS, M.UNDER.FADE], [500, 16000, 0.25, 0.15]); assert.ok(Object.isFrozen(M.UNDER) && Object.isFrozen(M.UNDER.BPM) && Object.isFrozen(M.UNDER.HEART));
  close(mid.cutoff, Math.sqrt(16000 * 500), 1e-6, 'the low-pass runs by octaves (a geometric blend)'); close(mid.beds, 0.625, 1e-12); close(mid.shots, 0.5, 1e-12); close(mid.bed, 0.5, 1e-12);
  let prev = M.underwaterMix(0);
  for (let u = 0.05; u <= 1.0001; u += 0.05) { const m = M.underwaterMix(u); assert.ok(m.cutoff < prev.cutoff && m.beds < prev.beds && m.shots < prev.shots && m.bed > prev.bed, `monotone at ${u.toFixed(2)}`); prev = m; }
  assert.deepEqual(M.underwaterMix(-1), air, 'above the water is the air'); assert.deepEqual(M.underwaterMix(7), deep, 'and deeper than deep is deep');
  assert.deepEqual(M.underwaterMix(NaN), air); assert.deepEqual(M.underwaterMix('x'), air); assert.deepEqual(M.underwaterMix(), air);
});

test('underwaterMix: the heart starts with the low breath and the head well under, and beats faster and louder as the breath goes', () => {
  const h = (uw, b, low) => M.underwaterMix(uw, b, low).heart;
  assert.equal(h(1, 0.5, false).on, false, 'no low breath, no heart'); assert.equal(h(0, 1, true).on, false, 'at the surface it is not heard, short of breath or not');
  assert.equal(h(0.5, 1, true).on, false, 'half under is not enough'); assert.equal(h(0.51, 1, true).on, true); assert.equal(h(1, 0, true).on, true);
  close(h(1, 0, true).bpm, 66, 1e-9); close(h(1, 1, true).bpm, 120, 1e-9); close(h(1, 0.5, true).bpm, 93, 1e-9);
  close(h(1, 0, true).gain, 0.35, 1e-9); close(h(1, 1, true).gain, 1.0, 1e-9); close(h(0.75, 1, true).gain, 0.75, 1e-9, 'its level goes with the depth');
  for (let i = 0; i < 10; i++) { const a = h(1, i / 10, true), c = h(1, (i + 1) / 10, true); assert.ok(c.bpm > a.bpm && c.gain > a.gain, `faster and louder from a breath of ${i / 10}`); }
  assert.equal(h(1, 9, true).bpm, 120); assert.equal(h(1, -3, true).bpm, 66); assert.ok(Number.isFinite(h(1, NaN, true).bpm), 'a garbage breath is a calm one');
});

test('mix: the surf is the sea\'s roar by the distance to the shore and the afternoon\'s wind; nowhere near it, or with no coast, there is none', () => {
  const line = beachAt(0, 144), sand = beachAt(0, 125), prom = beachAt(0, 112), spawn = beachAt(plan.spawn.x, plan.spawn.z), ridge = beachAt(0, -60);
  const s = [line, sand, prom, spawn, ridge].map((m) => m.beds.surf);
  for (let i = 1; i < s.length; i++) assert.ok(s[i] < s[i - 1], `the surf falls with the distance: ${s.map((v) => v.toFixed(3))}`);
  assert.ok(line.beds.surf > 0.9 && ridge.beds.surf < 0.03 && spawn.beds.surf > 0.2 && spawn.beds.surf < 0.45, `at the line ${line.beds.surf}, at the spawn ${spawn.beds.surf}, on the far ridge ${ridge.beds.surf}`);
  for (const [name, m, x, z] of [['sand', sand, 0, 125], ['spawn', spawn, plan.spawn.x, plan.spawn.z]]) assert.equal(m.beds.surf, M.surfLevel(M.nearestShore(coast, x, z).dist, seaState(15).wind, M.blendZones(BEACH, x, z).surf), name + ': the bed is surfLevel of the real distance, wind and zone');
  const dawn = beachAt(0, 125, { hour: 6, night: 0.3 });
  close(sand.beds.surf / dawn.beds.surf, (0.5 + 0.5 * seaState(15).wind) / (0.5 + 0.5 * seaState(6).wind), 1e-9, 'the same place is louder in the afternoon\'s breeze than at dawn, by the sea\'s own wind');
  assert.ok(sand.beds.surf > 1.3 * dawn.beds.surf, 'by about half as much again');
  const none = M.computeMix({ areas: BEACH, x: 0, z: 125, alt: 0.1, hour: 15, night: 0, crowd: 0.4 });
  assert.equal(none.beds.surf, 0, 'no shore given: no surf'); assert.equal(M.computeMix({ areas: plan.areas, x: 0, z: 90, hour: 12, shore: NaN }).beds.surf, 0, 'a garbage distance is no shore');
  assert.ok(none.beds.wind === sand.beds.wind && none.beds.traffic === sand.beds.traffic, 'and everything else is as it was');
});

test('mix: the surf masks the night\'s crickets, in proportion', () => {
  const night = { hour: 23, night: 1 }, a = beachAt(0, 125, night), b = beachAt(0, 125, { ...night, shore: undefined });
  assert.ok(b.beds.crickets > 0.3 && a.beds.crickets < b.beds.crickets, `crickets ${a.beds.crickets.toFixed(3)} by the sea against ${b.beds.crickets.toFixed(3)} without it`);
  close(a.beds.crickets, b.beds.crickets * (1 - 0.5 * a.beds.surf), 1e-12, 'by half the surf\'s level');
  const far = beachAt(0, -60, night), farNo = beachAt(0, -60, { ...night, shore: undefined });
  assert.ok(far.beds.crickets > 0.98 * farNo.beds.crickets, 'on the far ridge nearly all of them are heard');
});

test('mix: gulls call about six times a minute over the sand by day, less in the town, never at night and never from under the water', () => {
  const sand = beachAt(0, 125), town = beachAt(plan.spawn.x, plan.spawn.z), sea = beachAt(0, 190), ridge = beachAt(0, -60);
  assert.equal(M.GULLS_PER_MIN, 6);
  assert.ok(sand.rates.gulls > 5 && sand.rates.gulls <= 6.0001, `on the sand ${sand.rates.gulls}`); assert.ok(sea.rates.gulls > 4.5 && sea.rates.gulls <= 6.0001, `over the sea ${sea.rates.gulls}`);
  assert.ok(town.rates.gulls > 1.5 && town.rates.gulls < 0.6 * sand.rates.gulls, `in the town ${town.rates.gulls}`); assert.ok(ridge.rates.gulls > 0 && ridge.rates.gulls < town.rates.gulls, 'fewer still up the hill');
  close(beachAt(0, 125, { night: 0.5 }).rates.gulls, 0.5 * sand.rates.gulls, 1e-9, 'by the share of the day'); assert.equal(beachAt(0, 125, { hour: 23, night: 1 }).rates.gulls, 0);
  close(beachAt(0, 190, { under: 0.5 }).rates.gulls, 0.5 * sea.rates.gulls, 1e-9, 'half under, half the calls'); assert.equal(beachAt(0, 190, { under: 1 }).rates.gulls, 0);
});

test('mix: with the head under the sea the beds keep a quarter, the sea\'s own bed fills in, the world\'s one-shots stop', () => {
  const air = beachAt(0, 190), half = beachAt(0, 190, { under: 0.5 }), deep = beachAt(0, 190, { under: 1 });
  assert.equal(air.beds.underwater, 0); close(half.beds.underwater, 0.5, 1e-12); assert.equal(deep.beds.underwater, 1);
  for (const k of AIR) { assert.ok(air.beds[k] > 0 || k === 'crickets' || k === 'children', k + ' is there in the air'); close(deep.beds[k], 0.25 * air.beds[k], 1e-12, k + ' under'); close(half.beds[k], 0.625 * air.beds[k], 1e-12, k + ' half under'); }
  for (const k of ['birds', 'dogs', 'horns', 'gulls']) { assert.ok(air.rates[k] > 0, k + ' in the air'); assert.equal(deep.rates[k], 0, k + ' under'); close(half.rates[k], 0.5 * air.rates[k], 1e-12, k + ' half under'); }
  assert.deepEqual(deep.under, M.underwaterMix(1, undefined, undefined), 'the mix carries the sea\'s own numbers for the engine'); assert.equal(air.under.uw, 0);
  const breath = beachAt(0, 190, { under: 1, breath: 0.6, breathLow: true }).under;
  assert.deepEqual(breath, M.underwaterMix(1, 0.6, true), 'and the breath reaches the heart'); assert.equal(breath.heart.on, true);
  assert.equal(beachAt(0, 190, { under: 1, breath: 0.6 }).under.heart.on, false, 'but only with the low breath');
});

test('mix: every output is finite and bounded for the beach too: any shore, depth and breath', () => {
  for (const x of [-150, -100, 0, 100, 150]) for (const z of [0, 100, 125, 144, 190, 222, 260]) for (const hour of [0, 6, 12, 15, 22]) for (const under of [0, 0.3, 1]) for (const [breath, low] of [[0, false], [1, true]]) {
    const m = beachAt(x, z, { hour, night: undefined, under, breath, breathLow: low });
    for (const [k, v] of [...Object.entries(m.beds), ...Object.entries(m.rates), ['bpm', m.under.heart.bpm], ['hgain', m.under.heart.gain], ['cut', m.under.cutoff]]) assert.ok(Number.isFinite(v) && v >= 0 && v < 30000, `${k} = ${v} at ${x},${z} ${hour}h uw ${under}`);
    for (const k of Object.keys(m.beds)) assert.ok(m.beds[k] <= 2, `${k} bed ${m.beds[k]}`);
    assert.ok(m.under.heart.gain <= 1 && m.under.heart.bpm >= 66 && m.under.heart.bpm <= 120);
  }
  const wild = M.computeMix({ areas: BEACH, x: 0, z: 125, hour: 15, shore: -3, under: NaN, breath: NaN, breathLow: 'yes' }); assert.ok(Number.isFinite(wild.beds.surf) && wild.under.uw === 0, 'garbage in the beach\'s fields never gives a number out of range');
});
