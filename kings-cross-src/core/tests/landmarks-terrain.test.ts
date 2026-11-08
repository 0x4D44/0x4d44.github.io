// core/landmarks.ts on the ground: the rings the three buildings stand on and where their bases go, on surfaces whose lowest
// and highest points are known (a plane tilted 10%, a step, flat ground, a pit under one corner).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Pt } from '../geo.ts';
import { BARLOW_SINK, barlowFootprint, FIGURES, landmarkFootprints, landmarkPlans, landmarkSeats, seatOf, towerSquare } from '../landmarks.ts';
import type { LandmarkName } from '../landmarks.ts';
import type { KxData } from '../osm.ts';
import { pointInPolygon } from '../station.ts';
import { terrainFromFunction } from '../terrain.ts';
import { extremes, extremesOver, middleX, stepAt, terrainOver, tilted } from './ground-fixtures.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../../web/src/data/kx-track.json', import.meta.url), 'utf8'));
const close = (a: number, b: number, eps: number, what = ''): void => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} != ${b} (within ${eps})`);
const plans = landmarkPlans(data);
const rings = landmarkFootprints(plans);
const names: LandmarkName[] = ['hotel', 'midland', 'barlow'];
const everyRing = Object.values(rings).flat();
const GROUND_Y = -0.2;

test('seatOf: the lowest ground under the footprint, the lowest of several rings, and a floor that holds the base up without hiding how low the ground is', () => {
  const a: Pt[] = [[100, 50], [140, 50], [140, 70], [100, 70]]; // 0.1 m per metre east and south: 15 .. 21 m
  const b: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]]; // 0 .. 2 m
  const terrain = terrainOver([a, b], tilted());
  const one = seatOf(terrain, [a]);
  close(one.y, 15, 0.01, 'the lowest corner');
  close(one.min, 15, 0.01, 'min');
  close(one.max, 21, 0.01, 'max');
  const two = seatOf(terrain, [a, b]);
  close(two.y, 0, 0.01, 'the lower of two rings');
  close(two.min, 0, 0.01);
  close(two.max, 21, 0.01, 'the highest of both');
  const held = seatOf(terrain, [a, b], 5);
  close(held.y, 5, 0, 'held up to the floor');
  close(held.min, 0, 0.01, 'but the ground is still reported as low as it is');
  close(seatOf(terrain, [a, b], -100).y, 0, 0.01, 'a floor below the ground changes nothing');
});

test('footprints: the hotel stands on its outline, the Midland Grand on its outline and its two towers\' squares, the Barlow shed on the rectangle wall to wall and from the south wall to the north end', () => {
  assert.deepEqual(rings.hotel, [plans.hotel.outline]);
  assert.equal(rings.midland.length, 3, 'the outline and two towers');
  assert.deepEqual(rings.midland[0], plans.midland.outline);
  plans.midland.towers.forEach((t, i) => {
    const sq = rings.midland[i + 1] as Pt[];
    assert.deepEqual(sq, towerSquare(t));
    for (let k = 0; k < 4; k++) close(Math.hypot((sq[(k + 1) % 4] as Pt)[0] - (sq[k] as Pt)[0], (sq[(k + 1) % 4] as Pt)[1] - (sq[k] as Pt)[1]), t.side, 1e-9, `${t.name} tower side`);
    assert.ok(pointInPolygon(t.centre, plans.midland.outline), `the ${t.name} tower's middle is inside the building`);
    // it stands 0.3 m proud of the front: some corner is outside the outline, and none by more than that
    assert.ok(sq.some((p) => !pointInPolygon(p, plans.midland.outline)), `a ${t.name} tower corner stands outside the outline`);
  });
  const [p0, p1, p2, p3] = barlowFootprint(plans.barlow) as [Pt, Pt, Pt, Pt];
  assert.deepEqual(p0, plans.barlow.origin, 'from the south-west corner');
  const len = (p: Pt, q: Pt): number => Math.hypot(q[0] - p[0], q[1] - p[1]);
  close(len(p0, p1), FIGURES.barlow.spanWall, 1e-6, 'wall to wall: 245 ft 6 in');
  close(len(p1, p2), plans.barlow.length, 1e-6, 'to the north end of the vault');
  close(len(p2, p3), FIGURES.barlow.spanWall, 1e-6);
  close(len(p3, p0), plans.barlow.length, 1e-6);
  close((p1[0] - p0[0]) * (p3[0] - p0[0]) + (p1[1] - p0[1]) * (p3[1] - p0[1]), 0, 1e-6, 'a rectangle');
});

test('landmarkSeats on a plane tilted 10% east and south: every building at the lowest ground under its footprint, and the highest is reported too', () => {
  const lowCorner = extremesOver(tilted(), rings.barlow).lo;
  const f = tilted(-0.4 - lowCorner); // the shed's lowest corner 0.4 m under y = 0: above its floor, so nothing holds it up
  const terrain = terrainOver(everyRing, f);
  const seats = landmarkSeats(plans, terrain);
  for (const name of names) {
    const e = extremesOver(f, rings[name]);
    const s = seats[name];
    close(s.y, e.lo, 0.01, `${name} base`);
    close(s.min, e.lo, 0.01, `${name} lowest ground`);
    close(s.max, e.hi, 0.01, `${name} highest ground`);
    assert.ok(s.max - s.min > 5, `${name}: a 10% slope over a building is metres of relief, got ${s.max - s.min}`);
  }
  close(seats.barlow.y, -0.4, 0.01, 'the shed is at the ground, not held up');
  assert.notEqual(seats.hotel.y, seats.midland.y, 'each building has its own');
});

test('landmarkSeats on a step 3 m high that cuts each footprint: the base is on the low side, the high side is reported', () => {
  for (const name of names) {
    const at = middleX(rings[name]);
    const f = stepAt(at, 0, 3);
    const s = landmarkSeats(plans, terrainOver(rings[name], f))[name];
    const e = extremesOver(f, rings[name]);
    assert.equal(e.lo, 0, `${name}: the step cuts the footprint`);
    close(s.y, 0, 0.01, `${name} base`);
    close(s.min, 0, 0.01);
    close(s.max, 3, 0.01, `${name} high side`);
  }
});

test('landmarkSeats on flat ground: the ground\'s own level, but the Barlow shed no lower than 0.3 m under the railway\'s ground, which the others may sink below', () => {
  const level = landmarkSeats(plans, terrainOver(everyRing, () => GROUND_Y));
  for (const name of names) close(level[name].y, GROUND_Y, 1e-6, `${name} on level ground`);
  const low = terrainOver(everyRing, () => -3);
  const seats = landmarkSeats(plans, low);
  close(seats.hotel.y, -3, 0.01, 'the hotel follows the ground down');
  close(seats.midland.y, -3, 0.01, 'the Midland Grand too');
  close(seats.barlow.y, GROUND_Y - BARLOW_SINK, 1e-9, 'the shed is held at 0.3 m under the railway\'s ground');
  close(seats.barlow.min, -3, 0.01, 'and the ground under it is reported as low as it is');
  assert.ok(seats.barlow.y > seats.barlow.min);
  assert.equal(BARLOW_SINK, 0.3);
  // the floor is the terrain's own ground level, not a constant
  const raised = terrainFromFunction(() => -3, { x0: -400, z0: -400, x1: 400, z1: 400 }, 8, { groundY: 5 });
  close(landmarkSeats(plans, raised).barlow.y, 5 - BARLOW_SINK, 1e-9, 'floor = groundY - 0.3');
});

test('the Midland Grand\'s seat takes in its towers: a pit under the clock tower\'s proud corner, outside the outline, sets the base', () => {
  const tower = plans.midland.towers[0] as (typeof plans.midland.towers)[number];
  const corner = towerSquare(tower).find((p) => !pointInPolygon(p, plans.midland.outline)) as Pt;
  assert.ok(corner, 'a corner of the tower stands outside the outline');
  // one grid node, exactly under that corner, 9 m down; the ground is level (and 0, outside the grid too) everywhere else
  const f = (x: number, z: number): number => (Math.abs(x - corner[0]) < 1e-6 && Math.abs(z - corner[1]) < 1e-6 ? -9 : 0);
  const pit = terrainFromFunction(f, { x0: corner[0] - 60, z0: corner[1] - 60, x1: corner[0] + 60, z1: corner[1] + 60 }, 2, { groundY: 0 });
  close(pit.heightAt(corner[0], corner[1]), -9, 1e-6, 'the pit is where the corner is');
  const seats = landmarkSeats(plans, pit);
  close(seats.midland.y, -9, 1e-6, 'the base goes down to the corner of the tower');
  const outlineOnly = seatOf(pit, [plans.midland.outline]);
  assert.ok(outlineOnly.y > -8.9, `the outline alone would miss it: ${outlineOnly.y}`);
  close(seats.hotel.y, 0, 1e-6, 'the hotel, nowhere near, is on level ground');
  close(seats.barlow.y, 0, 1e-6, 'and so is the shed');
});
