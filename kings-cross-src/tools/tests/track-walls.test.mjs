// tools/track-walls.mjs: no wall of the King's Cross shed or concourse stands in a train's way on any track through the shed. Synthetic
// walls pin what the sweep sees; the real station must come back clear.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { SHED_SPAN_WIDTH, shedLayout, worldToShed } from '../../core/station.ts';
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
const probe = box => trackWallInterferences(data, { walls: box }).filter(h => h.mesh === 'probe-wall');

/** u of a track at v (shed frame), from its swept segments. */
function trackU(id, v) {
  for (const [x0, z0, x1, z1] of shedTracks(data, layout).find(t => t.id === id).segs) {
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
  const hits = probe(shedBox([layout.width - layout.aisle / 2, (sp + ground) / 2, layout.length + 0.3], [layout.aisle, sp - ground, 0.6]));
  assert.deepEqual(hits.map(h => h.track), [PLATFORM_0], hits.map(describeInterference).join('\n'));
});

test('a spine wall under the roof valley, from the ground to the springing, would stand on platform 4\'s line: the valley is not where the tracks leave room', () => {
  const valley = layout.aisle + 2 * R;
  const hits = probe(shedBox([valley, (layout.springing - 0.2) / 2, layout.length / 2], [1, layout.springing + 0.2, layout.length]));
  assert.ok(hits.some(h => h.track === PLATFORM_4), hits.map(describeInterference).join('\n'));
});

test('the real station: no wall of the shed or concourse stands in a train\'s way on any line through the shed', () => {
  const found = trackWallInterferences(data, { walls: stationWalls(data) });
  assert.deepEqual(found.map(describeInterference), []);
});
