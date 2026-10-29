// The soundscape rules (js/audio/mix.js, owner: A1): which sounds belong to which place and hour. Pure functions on the real plan, so zones, day and
// night, altitude, crowds, emitters and the bell schedule are all checked as numbers, without WebAudio.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/audio-mix.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/audio/mix.js';
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
});

test('emitterScore: loudest at the source, fading with distance, gone past its range or out of its hours', () => {
  const tv = { id: 't', kind: 'tv', x: 0, y: 0, z: 0, ...M.EMITTER.tv };
  const s = (d, h = 20) => M.emitterScore(tv, d, 0, 0, h);
  assert.ok(s(0) > s(2) && s(2) > s(6) && s(6) > s(15) && s(15) > 0, 'monotone');
  assert.equal(s(tv.max + 1), 0); assert.equal(s(5, 4), 0, 'a television is off at 4 am');
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
