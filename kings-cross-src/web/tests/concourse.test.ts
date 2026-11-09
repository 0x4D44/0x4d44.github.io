import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { concourseCanopy, concourseHeight, pointInPolygon, shedLayout, stationBuilding, worldToShed } from '../../core/station.ts';
import { buildConcourse, columnProfile, diagrid, EDGE, edgesOf, FUNNEL_RADIUS, keepTriangles } from '../src/concourse.ts';
import type { Diagrid } from '../src/concourse.ts';
import { WESTERN_RANGE } from '../src/shed.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const canopy = concourseCanopy(data);
const station = stationBuilding(data) as NonNullable<ReturnType<typeof stationBuilding>>;
const close = (a: number, b: number, eps = 1e-6): void => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const EPS = 1e-4; // float32 geometry
const ringCounts = (d: Diagrid): number[] => {
  const counts: number[] = Array.from({ length: d.rings + 1 }, () => 0);
  for (const n of d.nodes) counts[n.ring] = (counts[n.ring] as number) + 1;
  return counts;
};
const area = (d: Diagrid, t: [number, number, number]): number => {
  const [a, b, c] = t.map((i) => d.nodes[i] as Diagrid['nodes'][number]) as [Diagrid['nodes'][number], Diagrid['nodes'][number], Diagrid['nodes'][number]];
  return Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2;
};

test('diagrid: rings of nodes on circles, counts growing in sixes from the funnel to the rim', () => {
  const d = diagrid(canopy.radius, canopy.centre);
  const counts = ringCounts(d);
  assert.equal(counts.length, d.rings + 1);
  assert.equal(counts.reduce((s, n) => s + n, 0), d.nodes.length);
  for (let k = 0; k < counts.length; k++) {
    const n = counts[k] as number;
    assert.equal(n % 6, 0, `ring ${k} has ${n} nodes`);
    assert.ok(n >= 12);
    if (k > 0) assert.ok(n >= (counts[k - 1] as number), 'rings do not shrink outward');
  }
  for (const n of d.nodes) {
    const r = Math.hypot(n.x - canopy.centre[0], n.z - canopy.centre[1]);
    close(r, n.r, 1e-9);
  }
  close((d.nodes[0] as Diagrid['nodes'][number]).r, FUNNEL_RADIUS, 1e-9);
  close((d.nodes[d.nodes.length - 1] as Diagrid['nodes'][number]).r, canopy.radius, 1e-9);
});

test('diagrid: the triangles close up with no gap or overlap, and are all about EDGE metres across', () => {
  const d = diagrid(canopy.radius, canopy.centre);
  const counts = ringCounts(d);
  const edges = edgesOf(d.tris);
  // every interior edge is shared by exactly two triangles; the only free edges are the two boundary rings
  let free = 0;
  for (const e of edges.values()) {
    assert.ok(e.uses === 1 || e.uses === 2, `edge ${e.a}-${e.b} is used ${e.uses} times`);
    if (e.uses === 1) {
      free++;
      const ra = (d.nodes[e.a] as Diagrid['nodes'][number]).ring;
      const rb = (d.nodes[e.b] as Diagrid['nodes'][number]).ring;
      assert.ok(ra === rb && (ra === 0 || ra === d.rings), `free edge between rings ${ra} and ${rb}`);
    }
  }
  assert.equal(free, (counts[0] as number) + (counts[d.rings] as number));
  // an annulus: V - E + F = 0
  assert.equal(d.nodes.length - edges.size + d.tris.length, 0);
  // the triangles tile the annulus: their areas add up to it (the polygonal rings lose a fraction of a percent to the circle)
  const total = d.tris.reduce((s, t) => s + area(d, t), 0);
  const annulus = Math.PI * (canopy.radius ** 2 - FUNNEL_RADIUS ** 2);
  assert.ok(total / annulus > 0.995 && total / annulus <= 1, `triangles cover ${(100 * total) / annulus} % of the annulus`);
  for (const e of edges.values()) {
    const a = d.nodes[e.a] as Diagrid['nodes'][number];
    const b = d.nodes[e.b] as Diagrid['nodes'][number];
    const len = Math.hypot(a.x - b.x, a.z - b.z);
    assert.ok(len > 0.5 * EDGE && len < 1.8 * EDGE, `member ${e.a}-${e.b} is ${len.toFixed(2)} m long`);
  }
  for (const t of d.tris) assert.ok(area(d, t) > 2, 'a sliver triangle');
});

test('keepTriangles: inside the OSM footprint, clear of the shed and of the Western Range, and nothing else dropped', () => {
  const d = diagrid(canopy.radius, canopy.centre);
  const kept = keepTriangles(d, station.pts, layout);
  assert.ok(kept.length > 0.5 * d.tris.length && kept.length < d.tris.length, `${kept.length} of ${d.tris.length} kept`);
  const centre = (t: [number, number, number]): [number, number] => {
    const p = t.map((i) => d.nodes[i] as Diagrid['nodes'][number]);
    return [((p[0] as Diagrid['nodes'][number]).x + (p[1] as Diagrid['nodes'][number]).x + (p[2] as Diagrid['nodes'][number]).x) / 3, ((p[0] as Diagrid['nodes'][number]).z + (p[1] as Diagrid['nodes'][number]).z + (p[2] as Diagrid['nodes'][number]).z) / 3];
  };
  const keptSet = new Set(kept);
  for (const t of d.tris) {
    const c = centre(t);
    const { u, v } = worldToShed(layout, c);
    const inShed = u > -1 && u < layout.width + 1 && v > -1 && v < layout.length + 1;
    const inRange = u > -WESTERN_RANGE.depth - 0.3 && v > WESTERN_RANGE.v0 - 1 && v < WESTERN_RANGE.v1 + 1;
    const inside = pointInPolygon(c, station.pts);
    if (keptSet.has(t)) {
      assert.ok(inside && !inShed && !inRange, `kept a triangle at u=${u.toFixed(1)} v=${v.toFixed(1)} that is outside the footprint or inside the shed or Range`);
    } else {
      assert.ok(!inside || inShed || inRange, `dropped a triangle at u=${u.toFixed(1)} v=${v.toFixed(1)} that belongs`);
    }
  }
});

test('columnProfile: a trumpet that rises from a flared foot, narrows to a waist and opens out to the funnel rim under the apex', () => {
  const profile = columnProfile(20);
  assert.deepEqual(profile[0]?.[1], 0, 'starts on the floor');
  assert.deepEqual(profile[profile.length - 1], [FUNNEL_RADIUS, 19.9]);
  for (let i = 1; i < profile.length; i++) assert.ok((profile[i] as [number, number])[1] > (profile[i - 1] as [number, number])[1], 'heights rise');
  const radii = profile.map(([r]) => r);
  const waist = radii.indexOf(Math.min(...radii));
  assert.ok(waist > 0 && waist < radii.length - 1, 'the waist is between the foot and the rim');
  for (let i = waist + 1; i < radii.length; i++) assert.ok((radii[i] as number) >= (radii[i - 1] as number), 'the trumpet only opens above its waist');
  assert.ok(Math.max(...radii) <= FUNNEL_RADIUS + 1e-9);
});

test('buildConcourse: lattice under the published apex, panels and floor facing up, rim glazing facing out', () => {
  const group = buildConcourse(canopy, station.pts, layout);
  const named = (n: string): THREE.Mesh => group.getObjectByName(n) as THREE.Mesh;
  for (const n of ['concourse-lattice', 'concourse-glass', 'concourse-panels', 'concourse-wall', 'concourse-mullions', 'concourse-floor', 'concourse-column']) assert.ok(named(n), `no ${n}`);
  const bbox = (m: THREE.Mesh): THREE.Box3 => {
    m.geometry.computeBoundingBox();
    return m.geometry.boundingBox as THREE.Box3;
  };
  // the roof is 20 m at the stalk, 5 m at the rim; members are 0.3 m deep
  const lattice = bbox(named('concourse-lattice'));
  assert.ok(lattice.max.y > 19 && lattice.max.y < canopy.apex + 0.3, `lattice tops out at ${lattice.max.y}`);
  assert.ok(lattice.min.y > canopy.rim - 0.5 && lattice.min.y < canopy.rim + 2);
  // the column rises to just under the funnel
  close(bbox(named('concourse-column')).max.y, canopy.apex - 0.1, EPS);
  // roof infill and the floor face up
  for (const n of ['concourse-glass', 'concourse-panels', 'concourse-floor']) {
    const g = named(n).geometry;
    const normal = g.getAttribute('normal');
    for (let i = 0; i < normal.count; i++) assert.ok(normal.getY(i) > 0.3, `${n}: a face points down`);
  }
  close(bbox(named('concourse-floor')).max.y, 0.02, EPS);
  // each rim glazing quad faces away from the column
  const wall = named('concourse-wall').geometry;
  const wp = wall.getAttribute('position');
  const wn = wall.getAttribute('normal');
  assert.ok(wp.count >= 20, `${wp.count / 4} rim panes`);
  for (let i = 0; i < wp.count; i++) {
    const out = (wp.getX(i) - canopy.centre[0]) * wn.getX(i) + (wp.getZ(i) - canopy.centre[1]) * wn.getZ(i);
    assert.ok(out > 0, 'a rim pane faces the column');
    assert.ok(Math.abs(wn.getY(i)) < 1e-6, 'a rim pane is vertical');
  }
  // the rim glazing runs from the floor to the roof edge, which is the lowest roof height on the ring
  const rimTop = concourseHeight(canopy, canopy.radius);
  close(bbox(named('concourse-wall')).max.y, rimTop, EPS);
  close(rimTop, canopy.rim, 1e-9);
});

// Arup Journal 2/2012, printed p.15 fig.6 explicitly measures the overall N–S roof extent:
// https://www.arup.com/globalassets/downloads/arup-journal/the-arup-journal-2012-issue-2.pdf#page=15
test('the drawn concourse spans Arup’s 138 m overall roof within the structure tolerance', () => {
  const group = buildConcourse(canopy, station.pts, layout);
  const mesh = group.getObjectByName('concourse-panels') as THREE.Mesh;
  const p = mesh.geometry.getAttribute('position');
  const v = Array.from({length: p.count}, (_, i) => worldToShed(layout, [p.getX(i), p.getZ(i)]).v);
  const span = Math.max(...v) - Math.min(...v);
  assert.ok(Math.abs(span - 138) < 3, `drawn overall N–S extent ${span} m, not a fitted-circle diameter`);
});

// Arup pp.12–16 and JMP put the funnel next to the Western Range façade. The existing
// full-round funnel approximation must clear that façade; its exact survey position is unknown.
test('the funnel stands beside the Western Range without entering its brickwork', () => {
  const column = buildConcourse(canopy, station.pts, layout).getObjectByName('concourse-column')!;
  const {u} = worldToShed(layout, [column.position.x, column.position.z]);
  const gap = -WESTERN_RANGE.depth - (u + FUNNEL_RADIUS);
  assert.ok(gap >= 0 && gap <= 1, `funnel top is ${gap} m from the façade`);
});

test('the roof reaches the OSM concourse arc including its north and south canopy ends', () => {
  const roof = buildConcourse(canopy, station.pts, layout).getObjectByName('concourse-panels') as THREE.Mesh;
  const p = roof.geometry.getAttribute('position');
  for (const point of station.pts) {
    const {u,v} = worldToShed(layout, point);
    if (u >= -45 || v > WESTERN_RANGE.v1 + .1) continue;
    let nearest = Infinity;
    for (let i=0;i<p.count;i++) nearest = Math.min(nearest, Math.hypot(p.getX(i)-point[0],p.getZ(i)-point[1]));
    assert.ok(nearest < 3, `OSM roof edge u=${u}, v=${v} is ${nearest} m from the drawn roof`);
  }
});
