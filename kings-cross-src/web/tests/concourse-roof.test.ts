import assert from 'node:assert/strict';
import test from 'node:test';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { concourseCanopy, pointInPolygon, shedLayout, stationBuilding } from '../../core/station.ts';
import * as THREE from 'three';
import { buildConcourse, concourseGrid, edgesOf, keepTriangles } from '../src/concourse.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const canopy = concourseCanopy(data), shed = shedLayout(data);
const footprint = (stationBuilding(data) as NonNullable<ReturnType<typeof stationBuilding>>).pts;
const hotel = data.buildings.find(b => b.id === 46821177)!;
const exclusions = [hotel.pts];
const { centre, grid } = concourseGrid(canopy, footprint, shed, exclusions);
const roofEdges = [...edgesOf(keepTriangles(grid, footprint, shed)).values()];

// ASSUMED classification: in each ring step, the closest connection from each inner node on one hand
// (the way atan2(z, x) grows: clockwise seen from above, z being south) is a box rib; all remaining triangulation edges are round diagrid members.
const radial = new Map<number, { key: string; delta: number }>();
const angle = (i: number): number => Math.atan2(grid.nodes[i]!.z - centre[1], grid.nodes[i]!.x - centre[0]);
const turn = (inner: number, outer: number): number => (angle(outer) - angle(inner) + 1e-6 + 4 * Math.PI) % (2 * Math.PI);
for (const edge of roofEdges) {
  const a = grid.nodes[edge.a]!, b = grid.nodes[edge.b]!;
  if (Math.abs(a.ring - b.ring) !== 1 || a.ring < 0 || b.ring < 0) continue;
  const inner = a.ring < b.ring ? edge.a : edge.b, outer = a.ring < b.ring ? edge.b : edge.a;
  const delta = turn(inner, outer);
  const key = `${edge.a}:${edge.b}`, previous = radial.get(inner);
  if (!previous || delta < previous.delta) radial.set(inner, { key, delta });
}
const ribKeys = new Set([...radial.values()].map(member => member.key));
const ribs = roofEdges.filter(edge => ribKeys.has(`${edge.a}:${edge.b}`));
const tubes = roofEdges.filter(edge => !ribKeys.has(`${edge.a}:${edge.b}`));
const group = buildConcourse(canopy, footprint, shed, exclusions);
const mesh = group.getObjectByName('concourse-lattice') as import('three').Mesh;
const position = mesh.geometry.getAttribute('position');
// A drawn tube is open: the four-sided section's two lower faces, a keel of 8 vertices, since the faces that look up at the cladding are never seen (round 5, C1: the weave is
// twice as fine at the same triangle cost). A rib is a box without its two ends and its top, three faces of four vertices.
const OPEN = 8, RIB = 12;
type V3 = [number, number, number];

/** The section frame of a member from p to q: its centre, the unit vector across it in the vertical plane (u) and the horizontal one across it (v). */
function frameOf(p: V3, q: V3) {
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], length = Math.hypot(dx, dy, dz);
  const rz = Math.asin(dy / length), ry = Math.atan2(-dz, dx);
  return {
    centre: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2],
    u: [-Math.sin(rz) * Math.cos(ry), Math.cos(rz), Math.sin(rz) * Math.sin(ry)],
    v: [Math.sin(ry), 0, Math.cos(ry)],
  } as const;
}
const at = (i: number): V3 => { const n = grid.nodes[i]!; return [n.x, n.height ?? 0, n.z]; };
const frame = (a: number, b: number) => frameOf(at(a), at(b));

function extent(start: number, count: number, direction: readonly number[], c: readonly number[]): number {
  const values: number[] = [];
  for (let i = start; i < start + count; i++) {
    const d = [position.getX(i) - c[0]!, position.getY(i) - c[1]!, position.getZ(i) - c[2]!];
    values.push(d[0]! * direction[0]! + d[1]! * direction[1]! + d[2]! * direction[2]!);
  }
  return Math.max(...values) - Math.min(...values);
}

test('roof member classification and drawn sections match the published member families', () => {
  assert.ok(roofEdges.every(({a,b}) => [a,b].every(i => !pointInPolygon([grid.nodes[i]!.x, grid.nodes[i]!.z], hotel.pts))), 'classified member endpoints must clear the hotel domain');
  assert.ok(ribs.length > 0 && tubes.length > ribs.length, `expected radial box ribs and more round diagonals, got ${ribs.length}/${tubes.length}`);
  const cells = keepTriangles(grid, footprint, shed);
  // round 6 (C3): the finer net is drawn in the solid cells only, those with a soffit; the glazed field round the funnel keeps the coarse lattice, so that the legs run on into members
  // at their full thickness, with no ring of slim bars at the head. A cell is found by the float32 positions of its corners, which is what the soffit's vertices hold.
  const soffit = group.getObjectByName('concourse-panels') as THREE.Mesh, sp = soffit.geometry.getAttribute('position'), si = soffit.geometry.index!;
  const key = (x: number, z: number): string => `${Math.fround(x)},${Math.fround(z)}`;
  const drawn = new Set<string>();
  for (let i = 0; i < si.count; i += 3) drawn.add([0, 1, 2].map(k => key(sp.getX(si.getX(i + k)), sp.getZ(si.getX(i + k)))).sort().join('|'));
  const solid = cells.filter(t => drawn.has(t.map(i => key(grid.nodes[i]!.x, grid.nodes[i]!.z)).sort().join('|'))), medial = solid.length * 3;
  assert.equal(drawn.size, solid.length, 'a soffit under each solid cell, and no other');
  assert.ok(solid.length > 1000 && cells.length - solid.length > 100, `${solid.length} solid cells, ${cells.length - solid.length} glazed`);
  assert.equal(position.count, ribs.length * RIB + tubes.length * OPEN + medial * OPEN,
    'one open box per selected radial rib, then one open tube per other triangulation edge, then the three slim tubes of each solid cell\'s medial triangle, none in the glazed field');
  assert.equal(group.children.filter(child => child.name === 'concourse-lattice').length, 1, 'one batched roof-member mesh');
  assert.equal(mesh.geometry.groups.length, 0, 'single material range on the batched roof mesh');

  let offset = 0;
  for (const edge of ribs) {
    const f = frame(edge.a, edge.b), a = grid.nodes[edge.a]!, b = grid.nodes[edge.b]!;
    const fraction = Math.max(0, Math.min(1, ((a.r + b.r) / 2 - 5.4) / (canopy.radius - 5.4)));
    const depth = 0.45 - 0.20 * fraction; // ASSUMED linear interpolation within Arup's 250–450 mm range.
    const w = extent(offset, RIB, f.u, f.centre), d = extent(offset, RIB, f.v, f.centre);
    assert.ok(Math.abs(Math.min(w, d) - 0.15) < 1e-4, `rib width ${w} x ${d} m is not 150 mm`);
    assert.ok(Math.abs(Math.max(w, d) - depth) < 1e-4, `rib ${edge.a}:${edge.b} depth ${w} x ${d} m, expected ${depth} m at r=${(a.r+b.r)/2}`);
    // three faces of four vertices, the bottom and the two sides: none looks up (along the section's own up), the top and the ends being left out
    const looks = Array.from({ length: RIB / 4 }, (_, q) => {
      const P = [0, 1, 2].map(k => new THREE.Vector3(position.getX(offset + 4 * q + k), position.getY(offset + 4 * q + k), position.getZ(offset + 4 * q + k)));
      return new THREE.Vector3().crossVectors(P[1]!.clone().sub(P[0]!), P[2]!.clone().sub(P[0]!)).normalize().dot(new THREE.Vector3(...f.u));
    });
    assert.ok(looks.filter(d => d < -0.9).length === 1 && looks.filter(d => Math.abs(d) < 0.1).length === 2, `a rib is its bottom and its two sides, open at the top (faces look ${looks.map(d => d.toFixed(2))} along its up)`);
    offset += RIB;
  }
  // a tube's vertices: all on one circle about its axis (its half-diameter out), and none above the axis, the section's top vertex being the one left out with the faces that look up
  const measure = (f: ReturnType<typeof frameOf>, diameter: number, label: string): void => {
    const radii: number[] = [];
    for (let i = offset; i < offset + OPEN; i++) {
      const d = [position.getX(i) - f.centre[0]!, position.getY(i) - f.centre[1]!, position.getZ(i) - f.centre[2]!];
      radii.push(Math.hypot(d[0]! * f.u[0]! + d[1]! * f.u[1]! + d[2]! * f.u[2]!, d[0]! * f.v[0]! + d[1]! * f.v[1]! + d[2]! * f.v[2]!));
      assert.ok(d[0]! * f.u[0]! + d[1]! * f.u[1]! + d[2]! * f.u[2]! < 1e-4, `${label}: a tube's vertex stands above its axis: the faces that look up are left out`);
    }
    assert.ok(Math.max(...radii) - Math.min(...radii) < 1e-4, `${label}: the section is polygonal-round, not rectangular`);
    assert.ok(Math.abs(2 * radii[0]! - diameter) < 1e-4, `${label}: tube diameter ${2 * radii[0]!} m, expected ${diameter} m`);
    offset += OPEN;
  };
  for (const edge of tubes) {
    const a = grid.nodes[edge.a]!, b = grid.nodes[edge.b]!;
    const fraction = Math.max(0, Math.min(1, ((a.r + b.r) / 2 - 5.4) / (canopy.radius - 5.4)));
    measure(frame(edge.a, edge.b), 0.219 - 0.080 * fraction, `tube ${edge.a}:${edge.b}`); // ASSUMED linear interpolation within Arup's 139–219 mm range.
  }
  // half way along each solid cell's sides, a finer net: the medial triangle of the cell, 0.1 m through (round 5, C1: twice the weave at the same cell)
  for (const t of solid) {
    const mid = [0, 1, 2].map((k): V3 => { const p = at(t[k]!), q = at(t[(k + 1) % 3]!); return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]; });
    for (let k = 0; k < 3; k++) measure(frameOf(mid[k]!, mid[(k + 1) % 3]!), 0.1, `medial tube of cell ${t.join(':')}`);
  }
  assert.equal(offset, position.count, 'all drawn member vertices were measured');
});

// R-ab: the lattice swirls out of the funnel in continuous curves. The ribs are those curves: nearly all of them turn the same way (the way
// atan2(z, x) grows), and each runs on into the next ring's rib, so a chain of them sweeps round as it goes out instead of zigzagging about a radius.
test('roof ribs sweep out of the funnel as swept curves, all turning one way', () => {
  type Rib = { a: number; b: number };
  const innerOf = (e: Rib): number => (grid.nodes[e.a]!.ring < grid.nodes[e.b]!.ring ? e.a : e.b);
  const outerOf = (e: Rib): number => (innerOf(e) === e.a ? e.b : e.a);
  const signed = (e: Rib): number => { const d = angle(outerOf(e)) - angle(innerOf(e)); return Math.atan2(Math.sin(d), Math.cos(d)); };
  const oneWay = ribs.filter(e => signed(e) > -1e-6).length;
  assert.ok(oneWay >= 0.95 * ribs.length, `${oneWay} of ${ribs.length} ribs turn the same way`);
  const byInner = new Map(ribs.map(e => [innerOf(e), e] as const));
  const swirls = ribs.filter(e => grid.nodes[innerOf(e)]!.ring === 2).map(e => {
    let total = 0, length = 0;
    for (let r: Rib | undefined = e; r; r = byInner.get(outerOf(r))) { total += signed(r); length++; }
    return { total, length };
  });
  assert.ok(swirls.length >= 12 && swirls.every(s => s.length >= 10), `${swirls.length} chains from the funnel's mouth, ${swirls.map(s => s.length)} ribs long`);
  const mean = swirls.reduce((sum, s) => sum + s.total, 0) / swirls.length;
  assert.ok(mean > 0.25, `a rib chain sweeps ${mean.toFixed(2)} rad round on its way out (a zigzag about a radius sweeps about 0)`);
});
