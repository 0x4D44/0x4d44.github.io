import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { KxData } from '../osm.ts';
import { bounds, buildingHeight, buildingPrisms, DEFAULT_BUILDING_HEIGHT, MAX_BUILDING_HEIGHT, MIN_BUILDING_HEIGHT, platformPrisms, railSegments, TUNNEL_DEPTH } from '../scene.ts';

const nodes: KxData['nodes'] = [[1, 0, 0], [2, 10, 0], [3, 20, 0], [4, 20, 10]];
const rails: KxData['rails'] = [
  { id: 1, nodes: [1, 2, 3], service: 'main', tunnel: false, bridge: false, layer: 0 },
  { id: 2, nodes: [3, 4], service: 'siding', tunnel: false, bridge: false, layer: 0 },
  { id: 3, nodes: [2, 4], service: 'main', tunnel: true, bridge: false, layer: -1 },
  { id: 4, nodes: [1, 99], service: 'main', tunnel: false, bridge: false, layer: 0 }, // node 99 unknown: skipped
];

test('scene: rail segments are bucketed by class, with tunnels below ground', () => {
  const s = railSegments({ nodes, rails });
  assert.equal(s.main.length, 2 * 6, 'two main segments');
  assert.equal(s.siding.length, 6);
  assert.equal(s.tunnel.length, 6);
  assert.deepEqual(s.siding, [20, 0, 0, 20, 0, 10]);
  assert.equal(s.tunnel[1], TUNNEL_DEPTH);
  assert.equal(s.tunnel[4], TUNNEL_DEPTH);
  assert.ok(s.main.every((v, i) => i % 3 !== 1 || v === 0), 'main track is at y = 0');
});

test('scene: building height prefers the height tag, then levels, then a default, clamped', () => {
  assert.equal(buildingHeight({ height: 18.5, levels: 2 }), 18.5);
  assert.equal(buildingHeight({ levels: 5 }), 5 * 3.2);
  assert.equal(buildingHeight({}), DEFAULT_BUILDING_HEIGHT);
  assert.equal(buildingHeight({ height: 0.5 }), MIN_BUILDING_HEIGHT);
  assert.equal(buildingHeight({ height: 900 }), MAX_BUILDING_HEIGHT);
});

test('scene: prisms drop degenerate outlines and keep labels', () => {
  const sq: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const b = buildingPrisms({
    buildings: [
      { id: 1, pts: sq, kind: 'yes', name: 'Shed', height: 12 },
      { id: 2, pts: [[0, 0], [1, 1]], kind: 'yes' },
    ],
  });
  assert.equal(b.length, 1);
  assert.equal(b[0]?.label, 'Shed');
  assert.equal(b[0]?.height, 12);
  const p = platformPrisms({ platforms: [{ id: 3, pts: sq, ref: '4' }, { id: 4, pts: [[0, 0]], ref: '5' }] });
  assert.equal(p.length, 1);
  assert.equal(p[0]?.label, '4');
  assert.equal(p[0]?.height, 0.9);
});

test('scene: bounds of flat positions', () => {
  assert.deepEqual(bounds([1, 0, -5, 9, 0, 7, 4, 0, 0]), { minX: 1, maxX: 9, minZ: -5, maxZ: 7 });
});

test('scene: the real data yields tens of thousands of main-line vertices and a bounded set of buildings', () => {
  const data: KxData = JSON.parse(readFileSync(new URL('../../web/src/data/kx-track.json', import.meta.url), 'utf8'));
  const s = railSegments(data);
  assert.ok(s.main.length / 6 > 300, 'more than 300 main-line segments');
  assert.ok(s.tunnel.length > 0 && s.siding.length > 0);
  const prisms = buildingPrisms(data);
  assert.ok(prisms.length > 900);
  assert.ok(prisms.every((p) => p.height >= MIN_BUILDING_HEIGHT && p.height <= MAX_BUILDING_HEIGHT));
});
