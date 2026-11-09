import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { concourseCanopy, shedLayout, stationBuilding } from '../../core/station.ts';
import { buildConcourse, COLUMN_COLLAR, columnMembers, columnProfile, columnTubeDiameter, concourseGrid } from '../src/concourse.ts';

// The funnel: a tree of long, thick, round white tubes. R-a (conc-a-funnel-2012), R-ab (conc-ab-funnel-brick-2025) and
// R-b (conc-b-roof-meets-range-2025-08) show a dozen or more legs on the floor, standing about 4 m across, that widen as
// they rise, cross each other in tall diamonds at swollen cast nodes, and run on into the roof's own lattice round a ring
// of glass. R3 (JMP): a 20 m funnel. Its radius at the head is pinned at the roof grid's first ring (5.4 m) by
// concourse.test.ts; its other dimensions are ASSUMED from the photographs.
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const canopy = concourseCanopy(data);
const station = stationBuilding(data) as NonNullable<ReturnType<typeof stationBuilding>>;
const hotel = data.buildings.find(b => b.id === 46821177)!;
const group = buildConcourse(canopy, station.pts, layout, [hotel.pts]);
const column = group.getObjectByName('concourse-column') as THREE.Mesh;
const { centre, grid } = concourseGrid(canopy, station.pts, layout, [hotel.pts]);
const { nodes, edges } = columnMembers(canopy.apex);
const top = canopy.apex - 0.1;
const radiusOf = (n: readonly number[]): number => Math.hypot(n[0]!, n[2]!);
const length = ([a, b]: [number, number]): number => Math.hypot(nodes[a]![0] - nodes[b]![0], nodes[a]![1] - nodes[b]![1], nodes[a]![2] - nodes[b]![2]);

test('funnel: round eight-sided tubes, a cast node at each crossing, a collar at each foot, as one mesh', () => {
  assert.ok(column, 'the concourse has a column mesh');
  const feet = nodes.filter(n => n[1] === 0).length, crossings = nodes.filter(n => n[1] > 0 && n[1] < top).length;
  // a tube is eight strips of two triangles; a node a twenty-sided blob; a collar eight strips of two triangles and a six-triangle cap
  const expected = edges.length * 16 + crossings * 20 + feet * 22;
  assert.equal(column.geometry.index!.count / 3, expected, `${edges.length} tubes, ${crossings} cast nodes, ${feet} collars`);
  assert.ok(crossings > 100, 'a node at every crossing of the lattice, not a few');
});

test('funnel: a ring of 12 legs stands on the floor, about 4 m across, in collars; the legs widen steadily upward', () => {
  const feet = nodes.filter(n => n[1] === 0);
  assert.equal(feet.length, 12, 'R-a, R-ab: a dozen legs or more at the floor');
  for (const f of feet) {
    // the ring's centre line, 1.4 to 2.2 m from the axis: 3.4 m across, 3.9 m over the tubes (R-ab: feet span 3.7 to 4 m, scaled by the people)
    assert.ok(radiusOf(f) > 1.4 && radiusOf(f) < 2.2, `foot at ${radiusOf(f).toFixed(2)} m from the axis`);
    const collar = Array.from({ length: column.geometry.getAttribute('position').count }, (_, i) => i).filter(i => {
      const p = column.geometry.getAttribute('position');
      return Math.abs(p.getY(i) - COLUMN_COLLAR.height) < 1e-4 && Math.hypot(p.getX(i) - f[0], p.getZ(i) - f[2]) <= COLUMN_COLLAR.radius + 1e-4;
    });
    assert.ok(collar.length >= 8, 'a collar of eight corners stands round every foot');
  }
  const profile = columnProfile(canopy.apex), waist = profile.slice(1).reduce((a, p) => (p[0] < a[0] ? p : a));
  assert.ok(waist[1] < 3, `the legs stop splaying and start to widen within 3 m of the floor (waist at ${waist[1].toFixed(1)} m)`);
  for (let i = profile.findIndex(p => p === waist) + 1; i < profile.length; i++) assert.ok(profile[i]![0] > profile[i - 1]![0], `the funnel widens at ${profile[i]![1].toFixed(1)} m`);
  assert.ok(profile[profile.length - 1]![0] / waist[0] > 2.2, 'the head is more than 2.2 times as wide as the waist');
  const middle = profile.find(p => p[1] >= top / 2)!;
  assert.ok(middle[0] > 1.25 * waist[0] && middle[0] < 0.7 * profile[profile.length - 1]![0], `at mid height the funnel has widened by a quarter already but is not yet at its head's width (${middle[0].toFixed(2)} m)`);
});

test('funnel: the head ring stands on the roof\'s first ring, one leg on each node and one between each pair', () => {
  const heads = nodes.filter(n => n[1] === top), ring = grid.nodes.filter(n => n.ring === 0);
  assert.equal(ring.length, 12, 'the roof grid has twelve nodes at the funnel');
  assert.equal(heads.length, 2 * ring.length, 'twenty-four legs at the head: one on each roof node, one between each pair');
  for (const r of ring) {
    const x = r.x - centre[0], z = r.z - centre[1];
    const nearest = Math.min(...heads.map(h => Math.hypot(h[0] - x, h[2] - z)));
    assert.ok(nearest < 0.4, `a leg ends ${nearest.toFixed(2)} m from the roof node at ${(Math.atan2(z, x) * 180 / Math.PI).toFixed(0)} degrees`);
    assert.ok(Math.abs((r.height ?? NaN) - top) < 0.3, `the roof node is at ${r.height} m`);
  }
});

test('funnel: members run 0.9 to 2.1 m between nodes, so each tube reads as one leg of a tall diamond; each is stout below, slim above', () => {
  const lengths = edges.map(length);
  assert.ok(Math.min(...lengths) > 0.9 && Math.max(...lengths) < 2.1, `lengths ${Math.min(...lengths).toFixed(2)} to ${Math.max(...lengths).toFixed(2)} m`);
  assert.ok(Math.abs(columnTubeDiameter(0, top) - 0.36) < 1e-9 && Math.abs(columnTubeDiameter(top, top) - 0.22) < 1e-9, 'a leg is 0.36 m through at the floor and 0.22 m at the roof');
  let last = Infinity;
  for (let y = 0; y <= top; y += 1) {
    assert.ok(columnTubeDiameter(y, top) < last, `slimmer at ${y} m`);
    last = columnTubeDiameter(y, top);
  }
  // the tube drawn at mid height is as thick as its diameter says: the mesh's widest horizontal reach round a node there is its blob, 0.72 diameters
  const position = column.geometry.getAttribute('position');
  const mid = nodes.find(n => Math.abs(n[1] - 9) < 0.01)!;
  let reach = 0;
  for (let i = 0; i < position.count; i++) {
    if (Math.abs(position.getY(i) - mid[1]) < 0.01 && Math.hypot(position.getX(i) - mid[0], position.getZ(i) - mid[2]) < 0.4) reach = Math.max(reach, Math.hypot(position.getX(i) - mid[0], position.getZ(i) - mid[2]));
  }
  assert.ok(reach > 0.55 * columnTubeDiameter(9, top) && reach < 0.8 * columnTubeDiameter(9, top), `a node at 9 m reaches ${reach.toFixed(3)} m, ${columnTubeDiameter(9, top).toFixed(3)} m legs`);
});
