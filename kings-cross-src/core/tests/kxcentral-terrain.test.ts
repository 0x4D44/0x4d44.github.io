// core/kxcentral.ts on the ground: the rings each rigid structure of King's Cross Central stands on, and where its base goes, on
// surfaces whose lowest and highest points are known (a plane tilted 10%, a step, flat ground).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Pt } from '../geo.ts';
import {
  circleRing,
  coalDropsPlan,
  crickPlan,
  distToRing,
  gasholderName,
  gasholderPlan,
  granaryComplex,
  gymnasiumPlan,
  kxSeats,
  landscraperPlan,
  libraryPlan,
  OSM,
  outlineOf,
  polygonArea,
  structureFootprints,
} from '../kxcentral.ts';
import type { Seat, SeatPlans } from '../kxcentral.ts';
import type { KxData } from '../osm.ts';
import { extremesOver, middleX, stepAt, terrainOver, tilted } from './ground-fixtures.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../../web/src/data/kx-track.json', import.meta.url), 'utf8'));
const close = (a: number, b: number, eps: number, what = ''): void => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} != ${b} (within ${eps})`);
const plans: SeatPlans = {
  coal: coalDropsPlan(data),
  granary: granaryComplex(data),
  gas: gasholderPlan(),
  crick: crickPlan(data),
  library: libraryPlan(data),
  gymnasium: gymnasiumPlan(data),
  landscraper: landscraperPlan(data),
};
const rings = structureFootprints(plans);
const names = Object.keys(rings);
const everyRing = Object.values(rings).flat();
const ringsOf = (name: string): Pt[][] => rings[name] as Pt[][];

test('circleRing: n points on the circle, evenly spaced, the first due east', () => {
  const c: Pt = [-250, -640];
  const ring = circleRing(c, 20.4, 48);
  assert.equal(ring.length, 48);
  close((ring[0] as Pt)[0] - c[0], 20.4, 1e-9, 'the first point is east of the centre');
  close((ring[0] as Pt)[1] - c[1], 0, 1e-9);
  ring.forEach((p, i) => {
    close(Math.hypot(p[0] - c[0], p[1] - c[1]), 20.4, 1e-9, `point ${i} on the circle`);
    close(p[0] - c[0], 20.4 * Math.cos((i * 2 * Math.PI) / 48), 1e-9, `point ${i} at its angle`);
    close(p[1] - c[1], 20.4 * Math.sin((i * 2 * Math.PI) / 48), 1e-9, `point ${i} at its angle`);
  });
  assert.equal(circleRing(c, 5, 8).length, 8);
});

test('structure footprints: ten rigid structures, each on the rings its walls stand on', () => {
  const ids = [1106694288, 1106694289, 1106694290, 453267219]; // the triplet's three frames, then Gasholder Park's
  assert.deepEqual(names, ['coalDrops', 'granary', ...ids.map((id) => gasholderName({ id })), 'crick', 'library', 'gymnasium', 'landscraper']);
  assert.equal(gasholderName({ id: 1106694288 }), 'gasholder-1106694288');
  assert.deepEqual(rings.coalDrops, [outlineOf(data, OSM.westernCoalDrops), outlineOf(data, OSM.easternCoalDrops)]);
  assert.deepEqual(rings.granary, [OSM.granary, OSM.westTransitShed, OSM.eastTransitShed, OSM.granaryStreet].map((id) => outlineOf(data, id)));
  assert.deepEqual(rings.crick, plans.crick.parts.map((p) => p.outline));
  assert.deepEqual(rings.library, [plans.library.outline]);
  assert.deepEqual(rings.gymnasium, [plans.gymnasium.outline]);
  assert.deepEqual(rings.landscraper, [plans.landscraper.outline]);
  for (const g of [...plans.gas.triplet, plans.gas.park]) assert.deepEqual(rings[gasholderName(g)], [circleRing(g.centre, g.radius)], `gasholder ${g.id}: a circle of the frame's radius`);
  for (const [name, rs] of Object.entries(rings)) for (const r of rs) assert.ok(r.length >= 3 && polygonArea([...r]) > 300, `${name}: a real footprint`);
});

test('what holds something else up shares its seat: the Coal Drops sheds touch where their roofs kiss, the four Granary buildings tile a block, the Crick\'s vaults share a valley; the gasholders stand apart', () => {
  const [west, east] = ringsOf('coalDrops') as [Pt[], Pt[]];
  assert.ok(plans.coal.gap < 0.5, `the two Coal Drops outlines touch (gap ${plans.coal.gap} m)`);
  assert.ok(distToRing(plans.coal.kiss, west) < 0.5 && distToRing(plans.coal.kiss, east) < 0.5, 'the roofs kiss over the point where they touch');
  const block = ringsOf('granary');
  block.forEach((r, i) => assert.ok(block.some((o, j) => j !== i && r.some((p) => distToRing(p, o) < 0.2)), `Granary building ${i} shares a wall with another`));
  const crick = plans.crick.parts;
  for (const p of (crick[0] as (typeof crick)[number]).shared) for (const part of crick) assert.ok(distToRing(p, part.outline) < 0.05, 'the valley is on both outlines');
  const gas = [...plans.gas.triplet, plans.gas.park];
  for (const a of gas) for (const b of gas) if (a !== b) assert.ok(Math.hypot(a.centre[0] - b.centre[0], a.centre[1] - b.centre[1]) >= a.radius + b.radius - 3, `gasholders ${a.id} and ${b.id} are separate frames`);
});

test('kxSeats on a plane tilted 10% east and south: every structure at the lowest ground under its footprint, the highest reported', () => {
  const f = tilted();
  const seats = kxSeats(plans, terrainOver(everyRing, f));
  assert.deepEqual(Object.keys(seats), names);
  for (const name of names) {
    const e = extremesOver(f, ringsOf(name));
    const s = seats[name] as Seat;
    close(s.y, e.lo, 0.01, `${name} base`);
    close(s.min, e.lo, 0.01, `${name} lowest ground`);
    close(s.max, e.hi, 0.01, `${name} highest ground`);
    assert.ok(s.max - s.min > 3, `${name}: a 10% slope is metres of relief, got ${s.max - s.min}`);
  }
  const gas = names.filter((n) => n.startsWith('gasholder-')).map((n) => (seats[n] as Seat).y);
  assert.equal(new Set(gas.map((y) => y.toFixed(2))).size, 4, 'four gasholders, four seats');
});

test('kxSeats on a step 3 m high that cuts each footprint: the base is on the low side, the high side is reported', () => {
  for (const name of names) {
    const rs = ringsOf(name);
    const f = stepAt(middleX(rs), 0, 3);
    const s = kxSeats(plans, terrainOver(rs, f))[name] as Seat;
    assert.equal(extremesOver(f, rs).lo, 0, `${name}: the step cuts the footprint`);
    close(s.y, 0, 0.01, `${name} base`);
    close(s.min, 0, 0.01, `${name} low side`);
    close(s.max, 3, 0.01, `${name} high side`);
  }
});

test('kxSeats on flat ground: all at its level with no relief; and it asks the terrain for nothing but the range under a ring', () => {
  const flat = kxSeats(plans, terrainOver(everyRing, () => 7.5));
  for (const name of names) {
    const s = flat[name] as Seat;
    close(s.y, 7.5, 1e-3, `${name} on level ground`);
    close(s.max - s.min, 0, 1e-3, `${name} has no relief`);
  }
  let asked = 0;
  const stub = {
    rangeUnder(): { min: number; max: number; mean: number } {
      asked++;
      return { min: 4, max: 6, mean: 5 };
    },
  };
  const seats = kxSeats(plans, stub);
  for (const name of names) assert.deepEqual(seats[name], { y: 4, min: 4, max: 6 });
  assert.ok(asked >= everyRing.length, 'it looked under every ring');
});
