// The camera faults the round-4 graphical-fidelity scorers found in the wave-0 cameras, and the guards that keep them fixed:
//   midland-clock-tower cropped the top of the tower (a 35 degree lens aimed at the clock lost the spire);
//   gnh-from-square stood against OSM building 96299681, the round service building (the rubric's stand is 2.2 m from its wall);
//   concourse-exterior-square must stand on the open square, and western-range-full must stand clear of the concourse roof.
// The footprint tests exist because tools/station-scene.mjs viewClearance casts rays, and the city's single-sided materials let a ray
// leave a building it started inside: an eye inside a footprint is caught here, by plan, not there.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { greatNorthernHotelPlan, landmarkFootprints, landmarkPlans, landmarkSeats } from '../../core/landmarks.ts';
import { concourseCanopy, pointInPolygon, shedLayout, shedToWorld, worldToShed } from '../../core/station.ts';
import { CLOCK_TOWER_EYE_Y, CLOCK_TOWER_STANDOFF, CONCOURSE_WEST_STANDOFF, ELEMENT_VIEWS, cityBuildings, stationCameras, stationWorld } from '../evidence.mjs';
import { buildStationScene, clearanceFaults, lensFor, stationData, viewClearance } from '../station-scene.mjs';

const { data } = stationData();
const { terrain } = stationWorld();
const cameras = stationCameras(data);
const plans = landmarkPlans(data);
const scene = buildStationScene();
const ROUND_BUILDING = 96299681;

/** Every footprint in the plan, the hotel and the other landmarks included: [{ id, ring }]. */
const footprints = [
  ...cityBuildings(data).map(b => ({ id: b.id, ring: b.ring })),
  ...Object.entries(landmarkFootprints(plans)).flatMap(([id, rings]) => rings.map(ring => ({ id, ring }))),
];

/** Metres from a world point [x, z] to the nearest footprint edge, negative if the point is inside that footprint, with the footprint's id. */
function footprintMargin([x, z], rings = footprints) {
  let best = { margin: Infinity, id: null };
  for (const { id, ring } of rings) {
    let edge = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      edge = Math.min(edge, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
    }
    const margin = pointInPolygon([x, z], ring) ? -edge : edge;
    if (margin < best.margin) best = { margin, id };
  }
  return best;
}

/** The share of an n x n ray grid across the frame whose first solid, non-ground hit is within `within` metres: a wall or a tree on the lens. */
function nearShare(camera, { occluders, ground }, within, n = 11) {
  const lens = lensFor(camera), origin = lens.position.clone(), raycaster = new THREE.Raycaster();
  const solid = h => h.object.isMesh && h.object.visible !== false && !(h.object.material?.transparent && h.object.material.opacity < .9);
  let near = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    raycaster.set(origin, new THREE.Vector3(2 * i / (n - 1) - 1, 2 * j / (n - 1) - 1, .5).unproject(lens).sub(origin).normalize());
    const hit = raycaster.intersectObjects(occluders, true).find(h => solid(h) && Math.abs(h.point.y - ground.heightAt(h.point.x, h.point.z)) > .35);
    if (hit && hit.distance < within) near++;
  }
  return near / (n * n);
}

const ndcOf = (lens, x, y, z) => new THREE.Vector3(x, y, z).project(lens);
const inFrame = (p, margin = 1) => Math.abs(p.x) <= margin && Math.abs(p.y) <= margin && p.z < 1;

test('midland-clock-tower frames the whole tower, from the eaves to the spire tip, from the stand it always had', () => {
  const midland = plans.midland, clock = midland.towers.find(t => t.name === 'clock'), seat = landmarkSeats(plans, terrain).midland.y;
  const camera = cameras['midland-clock-tower'], lens = lensFor(camera);
  assert.ok(Math.abs(Math.hypot(camera.pos[0] - clock.centre[0], camera.pos[2] - clock.centre[1]) - CLOCK_TOWER_STANDOFF) < 1e-9, 'still 60 m out');
  assert.ok(Math.abs((camera.pos[0] - clock.centre[0]) / CLOCK_TOWER_STANDOFF - clock.out[0]) < 1e-9, 'on the tower\'s front normal');
  assert.equal(camera.pos[1], CLOCK_TOWER_EYE_Y, 'still 40 m up');
  const ndc = (along, y, out = 0) => ndcOf(lens, clock.centre[0] + clock.along[0] * along + clock.out[0] * out, y, clock.centre[1] + clock.along[1] * along + clock.out[1] * out);
  const eavesY = seat + midland.eaves, tipY = seat + clock.height, half = clock.side / 2;
  const tip = ndc(0, tipY), base = ndc(0, eavesY), clockFace = ndc(0, seat + clock.height * .68);
  for (const [label, p] of [['spire tip', tip], ['eaves line', base], ['clock face', clockFace]]) assert.ok(inFrame(p, .95), `${label} is out of frame or against its edge: ${p.x.toFixed(3)}, ${p.y.toFixed(3)}`);
  for (const along of [-half, half]) for (const y of [eavesY, seat + clock.height * .73]) assert.ok(inFrame(ndc(along, y, half), .95), `a corner of the tower at ${y.toFixed(1)} m is out of frame`);
  assert.ok(tip.y - base.y > 1.5, `the tower fills ${((tip.y - base.y) / 2 * 100).toFixed(0)}% of the frame height, not a speck`);
  assert.ok(base.y > -.82, 'the eaves line clears the page\'s status line, which covers the bottom 9% of every capture');
  assert.match(camera.source, /spire tip/);
});

test('gnh-from-square, concourse-exterior-square and concourse-exterior-west stand on open ground, outside OSM building 96299681 and every other footprint', () => {
  assert.ok(footprints.some(f => f.id === ROUND_BUILDING), 'the round service building is in the set the check reads');
  for (const name of ['gnh-from-square', 'concourse-exterior-square', 'concourse-exterior-west']) {
    const { margin, id } = footprintMargin([cameras[name].pos[0], cameras[name].pos[2]]);
    assert.ok(margin >= 5, `${name} is ${margin.toFixed(1)} m from footprint ${id} (negative is inside it)`);
  }
  // The fault: the rubric's stand for gnh-from-square, 45 m due south of the hotel's south end, is 2.2 m from the round building's wall.
  const s = shedLayout(data), hotel = greatNorthernHotelPlan(data), south = worldToShed(s, hotel.outline.reduce((a, b) => b[1] > a[1] ? b : a));
  const rubric = footprintMargin(shedToWorld(s, south.u, south.v - 45));
  assert.equal(rubric.id, ROUND_BUILDING);
  assert.ok(rubric.margin < 3, `the rubric's stand is ${rubric.margin.toFixed(1)} m from the round building: the footprint test must be able to see this`);
  // A footprint test that is inside the building says so.
  const round = footprints.find(f => f.id === ROUND_BUILDING).ring, centre = round.reduce((a, p) => [a[0] + p[0] / round.length, a[1] + p[1] / round.length], [0, 0]);
  assert.ok(footprintMargin(centre).margin < 0, 'a point at the round building\'s centre is inside it');
});

test('gnh-from-square shows the whole crescent with nothing on the lens, where the rubric\'s stand and the first wave-0 stand did not', () => {
  const camera = cameras['gnh-from-square'], lens = lensFor(camera), hotel = greatNorthernHotelPlan(data);
  const eaves = hotel.outline.map(([x, z]) => ndcOf(lens, x, hotel.eaves, z));
  assert.ok(eaves.every(p => inFrame(p)), 'every outline vertex of the hotel, at the eaves, is in frame');
  const main = hotel.faces.find(face => face.kind === 'main').chain.edges, mid = main[Math.floor(main.length / 2)].mid;
  const top = ndcOf(lens, mid[0], hotel.eaves, mid[1]), foot = ndcOf(lens, mid[0], 0, mid[1]);
  assert.ok(Math.abs(foot.x) < .01, 'aimed at the middle of the main face');
  assert.ok(top.y - foot.y > .5, `the hotel is ${((top.y - foot.y) / 2 * 100).toFixed(0)}% of the frame height at the middle of its main face, not a speck`);
  const crowding = nearShare(camera, scene, 15);
  assert.ok(crowding < .05, `${(crowding * 100).toFixed(0)}% of the frame is within 15 m`);
  // The same measure sees the faults: the first wave-0 stand (45 m, 20 degrees east of south) had a wall and trees across a quarter of the frame.
  const s = shedLayout(data), south = worldToShed(s, hotel.outline.reduce((a, b) => b[1] > a[1] ? b : a)), swing = 70 * Math.PI / 180;
  const [x, z] = shedToWorld(s, south.u + 45 * Math.cos(swing), south.v - 45 * Math.sin(swing));
  assert.ok(nearShare({ ...camera, pos: [x, terrain.heightAt(x, z) + 1.7, z] }, scene, 15) > .2, 'the first wave-0 stand is crowded by the round building');
});

test('the exterior roof views take the whole concourse roof into the frame', () => {
  const canopy = concourseCanopy(data), s = shedLayout(data), centre = worldToShed(s, canopy.centre);
  // The rim, at its 5 m height, on the part of the disc west of the shed (u < 0; the rest is under the shed).
  const rim = [];
  for (let degrees = 70; degrees <= 290; degrees += 10) {
    const a = degrees * Math.PI / 180, [x, z] = shedToWorld(s, centre.u + Math.cos(a) * canopy.radius, centre.v + Math.sin(a) * canopy.radius);
    rim.push([x, 5, z]);
  }
  for (const name of ['concourse-exterior-square', 'concourse-exterior-west']) {
    const lens = lensFor(cameras[name]);
    for (const [x, y, z] of rim) { const p = ndcOf(lens, x, y, z); assert.ok(inFrame(p, .98), `${name}: the rim at ${x.toFixed(0)}, ${z.toFixed(0)} is out of frame (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`); }
  }
  const west = cameras['concourse-exterior-west'], local = worldToShed(s, [west.pos[0], west.pos[2]]);
  assert.ok(Math.abs(local.u - (centre.u - canopy.radius - CONCOURSE_WEST_STANDOFF)) < 1e-6 && Math.abs(local.v - centre.v) < 1e-6, '38 m west of the rim on the roof\'s centre line');
  assert.ok(ELEMENT_VIEWS['western-concourse'].includes('concourse-exterior-west'), 'scored with the other western-concourse views');
});

test('western-range-full stands inside the concourse under the roof glazing, clear of it and of the floor', () => {
  const camera = cameras['western-range-full'], eye = new THREE.Vector3(...camera.pos), raycaster = new THREE.Raycaster();
  const nearest = direction => {
    raycaster.set(eye, new THREE.Vector3(...direction));
    return raycaster.intersectObjects(scene.occluders, true).find(h => h.object.isMesh && h.object.visible !== false)?.distance ?? Infinity;
  };
  const up = nearest([0, 1, 0]), down = nearest([0, -1, 0]);
  assert.ok(up >= 2 && up <= 6, `the roof is ${up} m above the eye: under it, not inside it, not outside it`);
  assert.ok(down >= 5, `the floor is ${down} m below the eye`);
  for (const [label, direction] of [['east', [1, 0, 0]], ['west', [-1, 0, 0]], ['north', [0, 0, 1]], ['south', [0, 0, -1]]]) assert.ok(nearest(direction) >= 5, `${label}: ${nearest(direction)} m to the nearest surface`);
  assert.ok(camera.pos[1] > 5, 'above the 5 m rim');
});

test('the corrected cameras pass the scene clearance check: eye outside geometry, lens not on a wall, subject not hidden', () => {
  for (const name of ['midland-clock-tower', 'gnh-from-square', 'concourse-exterior-square', 'concourse-exterior-west', 'western-range-full']) {
    assert.deepEqual(clearanceFaults(name, viewClearance(cameras[name], scene.occluders, scene.ground, { grid: 7 })), [], name);
  }
});
