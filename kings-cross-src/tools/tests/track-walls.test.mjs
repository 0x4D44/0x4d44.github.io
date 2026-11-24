// tools/track-walls.mjs: no wall of the King's Cross shed or concourse stands in a train's way on any track through the shed. Synthetic
// walls pin what the sweep sees; the real station must come back clear.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { SHED_SPAN_WIDTH, shedLayout, worldToShed } from '../../core/station.ts';
import { EAST_AISLE_OPENING, SPINE_WALL } from '../../web/src/shed.ts';
import { roofHeight } from '../../core/train.ts';
import { stationData } from '../station-scene.mjs';
import { describeInterference, shedTracks, stationWalls, TRAIN_ENVELOPE, trackWallInterferences } from '../track-walls.mjs';

const { data } = stationData();
const layout = shedLayout(data);
const R = SHED_SPAN_WIDTH / 2;
const PLATFORM_0 = 200526794, PLATFORM_4 = 751608050;

/** A brick-like box in the shed's own frame (x = u, y up, z = -v), placed as buildShed places the shed. */
function shedBox([u, y, v], [su, sy, sv]) {
  const g = new THREE.Group();
  g.rotation.y = -layout.heading;
  g.position.set(layout.origin[0], 0, layout.origin[1]);
  const m = new THREE.Mesh(new THREE.BoxGeometry(su, sy, sv), new THREE.MeshBasicMaterial());
  m.name = 'probe-wall';
  m.position.set(u, y, -v);
  g.add(m);
  g.updateMatrixWorld(true);
  return g;
}
let real;
/** The real station's interferences, swept once for the tests that read them. */
const realHits = () => (real ??= trackWallInterferences(data, { walls: stationWalls(data) }));
const probe = box => trackWallInterferences(data, { walls: box }).filter(h => h.mesh === 'probe-wall');

let tracks;
/** u of a track at v (shed frame), from its swept segments. */
function trackU(id, v) {
  for (const [x0, z0, x1, z1] of (tracks ??= shedTracks(data, layout)).find(t => t.id === id).segs) {
    const a = worldToShed(layout, [x0, z0]), b = worldToShed(layout, [x1, z1]);
    if ((a.v - v) * (b.v - v) <= 0 && a.v !== b.v) return a.u + ((v - a.v) / (b.v - a.v)) * (b.u - a.u);
  }
  throw new Error(`track ${id} does not reach v = ${v}`);
}

test('the envelope is a 2.8 m body with 0.05 m each side, from just over the rail head to the roof covers', () => {
  assert.equal(TRAIN_ENVELOPE.half, 1.45);
  assert.ok(TRAIN_ENVELOPE.bottom > 0 && TRAIN_ENVELOPE.bottom < 0.3);
  assert.ok(TRAIN_ENVELOPE.top >= roofHeight() + 0.1 && TRAIN_ENVELOPE.top >= 4, `top ${TRAIN_ENVELOPE.top}`);
});

test('the sweep covers every shed platform\'s line, platform 0 to the north end of the shed', () => {
  const tracks = shedTracks(data, layout);
  const ends = tracks.flatMap(t => t.segs.flatMap(([x0, z0, x1, z1]) => [worldToShed(layout, [x0, z0]), worldToShed(layout, [x1, z1])]));
  // the nine OSM buffer stops of platforms 0-8 stand at v 11-24; each line through the shed is swept from there to past the north gables
  for (const id of [PLATFORM_0, PLATFORM_4]) {
    const vs = tracks.find(t => t.id === id).segs.flatMap(([x0, z0, x1, z1]) => [worldToShed(layout, [x0, z0]).v, worldToShed(layout, [x1, z1]).v]);
    assert.ok(Math.min(...vs) < 25 && Math.max(...vs) > layout.length - 5, `track ${id} swept v ${Math.min(...vs)}..${Math.max(...vs)}`);
  }
  assert.ok(ends.some(p => p.v > layout.length + 25), 'the sweep runs on 25 m and more past the north end');
});

test('a wall a few centimetres into the envelope beside a track is caught, one a few centimetres clear of it is not', () => {
  const u = trackU(PLATFORM_0, 30);
  const beside = inset => shedBox([u + TRAIN_ENVELOPE.half - inset + 0.25, 2, 30], [0.5, 3, 1]);
  assert.equal(probe(beside(0.1)).length, 1, 'a wall 0.1 m inside the envelope');
  assert.equal(probe(beside(-0.1)).length, 0, 'a wall 0.1 m outside it');
  assert.equal(probe(shedBox([u, TRAIN_ENVELOPE.top + 0.3, 30], [3, 0.4, 1])).length, 0, 'a beam over the roof covers');
});

test('the north end wall of the east aisle as it stood closed (8a34e7dd) blocks platform 0\'s line', () => {
  const sp = layout.springing, ground = -0.2;
  // re-pinned 2026-11-24: the east aisle is layout.aisleEast wide (the even `aisle` before the shed realignment)
  const hits = probe(shedBox([layout.width - layout.aisleEast / 2, (sp + ground) / 2, layout.length + 0.3], [layout.aisleEast, sp - ground, 0.6]));
  assert.deepEqual(hits.map(h => h.track), [PLATFORM_0], hits.map(describeInterference).join('\n'));
});

// Inverted 2026-11-24 (the shed realignment, signed off): before it the valley stood over platform 4's track and this test proved that a
// spine wall there would stand on the line. The valley now stands on the 4/5 island, so the same solid probe, the spine wall's thickness,
// ground to springing, the shed's whole length, must touch no track.
test('a solid spine wall under the roof valley, from the ground to the springing, the whole length of the shed, stands on no track', () => {
  assert.ok(Number.isFinite(layout.spine), 'the layout has a spine');
  const hits = probe(shedBox([layout.spine, (layout.springing - 0.2) / 2, layout.length / 2], [SPINE_WALL.thick, layout.springing + 0.2, layout.length]));
  assert.deepEqual(hits.map(describeInterference), []);
});

/** The nearest track envelope's edge on each side of the spine wall at v: [west gap, east gap], metres from the wall's faces. */
function spineGaps(v) {
  const half = SPINE_WALL.thick / 2;
  let west = Infinity, east = Infinity;
  for (const t of (tracks ??= shedTracks(data, layout))) {
    let u;
    try { u = trackU(t.id, v); } catch { continue; }
    if (u < layout.spine) west = Math.min(west, layout.spine - half - (u + TRAIN_ENVELOPE.half));
    else east = Math.min(east, u - TRAIN_ENVELOPE.half - (layout.spine + half));
  }
  return [west, east];
}

test('the spine wall\'s faces stand at least 1 m clear of the nearest train envelope on both sides, the length of the shed (design: 4.05 m west, 2.12 m east)', () => {
  const worst = [Infinity, Infinity];
  for (let v = 12; v <= layout.length; v += 1) {
    const [w, e] = spineGaps(v);
    worst[0] = Math.min(worst[0], w);
    worst[1] = Math.min(worst[1], e);
  }
  assert.ok(Number.isFinite(worst[0]) && Number.isFinite(worst[1]), `a track on each side: ${worst}`);
  assert.ok(worst[0] >= 1.0 && worst[1] >= 1.0, `the tightest gaps: ${worst[0].toFixed(2)} m west, ${worst[1].toFixed(2)} m east`);
});

test('the swept walls include the spine wall: shed-spine runs on the spine line, from the ground into the envelope\'s height, the length of the shed', () => {
  const walls = stationWalls(data);
  walls.updateMatrixWorld(true);
  const brick = walls.getObjectByName('shed-spine');
  assert.ok(brick, 'shed-spine is in the swept walls');
  assert.ok(!(brick.material.transparent && brick.material.opacity < 0.9), 'and solid, so the sweep counts it');
  const pos = brick.geometry.getAttribute('position');
  const p = new THREE.Vector3();
  let vMin = Infinity, vMax = -Infinity, yMin = Infinity, n = 0;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(brick.matrixWorld);
    const q = worldToShed(layout, [p.x, p.z]);
    if (Math.abs(q.u - layout.spine) > SPINE_WALL.thick / 2 + 1e-4) continue; // float32 positions
    n++;
    vMin = Math.min(vMin, q.v); vMax = Math.max(vMax, q.v); yMin = Math.min(yMin, p.y);
  }
  assert.ok(n > 100, `${n} brick vertices on the spine line`);
  assert.ok(vMin < 0.01 && vMax > layout.length - 0.01, `from v ${vMin.toFixed(2)} to ${vMax.toFixed(2)}`);
  assert.ok(yMin < TRAIN_ENVELOPE.bottom, `from y ${yMin.toFixed(2)}`);
});

test('platform 0\'s line lies in the east aisle, east of the east vault\'s springing, and passes out through the north-end opening with room each side', () => {
  const springing = layout.spine + SHED_SPAN_WIDTH;
  let n = 0;
  for (let v = 12; v <= layout.length; v += 1) {
    let u;
    try { u = trackU(PLATFORM_0, v); } catch { continue; } // south of its buffer stop
    n++;
    assert.ok(u - TRAIN_ENVELOPE.half > springing && u + TRAIN_ENVELOPE.half < layout.width, `at v ${v} the envelope is ${(u - TRAIN_ENVELOPE.half).toFixed(2)}..${(u + TRAIN_ENVELOPE.half).toFixed(2)}, the aisle ${springing.toFixed(2)}..${layout.width.toFixed(2)}`);
  }
  assert.ok(n > 200, `platform 0's line is under the shed for ${n} m`);
  const centre = layout.width - EAST_AISLE_OPENING.fromEast, half = EAST_AISLE_OPENING.width / 2;
  for (const v of [layout.length, layout.length + 0.3, layout.length + 0.6]) {
    const u = trackU(PLATFORM_0, v);
    assert.ok(u - TRAIN_ENVELOPE.half > centre - half + 0.1 && u + TRAIN_ENVELOPE.half < centre + half - 0.1, `at v ${v.toFixed(1)} the envelope ${(u - TRAIN_ENVELOPE.half).toFixed(2)}..${(u + TRAIN_ENVELOPE.half).toFixed(2)} is inside the opening ${(centre - half).toFixed(2)}..${(centre + half).toFixed(2)}`);
  }
  assert.deepEqual(realHits().filter(h => h.track === PLATFORM_0).map(describeInterference), [], 'and no wall of the station touches it');
});

test('the real station: no wall of the shed or concourse stands in a train\'s way on any line through the shed', () => {
  assert.deepEqual(realHits().map(describeInterference), []);
});
