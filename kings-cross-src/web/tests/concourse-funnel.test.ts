import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { concourseCanopy, shedLayout, stationBuilding, worldToShed } from '../../core/station.ts';
import { buildConcourse, columnLegs, columnMembers, columnRadius, columnTubeDiameter, concourseGrid, FUNNEL_HEAD_RING, FUNNEL_REACH, funnelHead, RANGE_FACE } from '../src/concourse.ts';
type V3 = [number, number, number];

// The funnel: a tree of long, thick, round white tubes. R-a (conc-a-funnel-2012), R-ab (conc-ab-funnel-brick-2025) and R-b
// (conc-b-roof-meets-range-2025-08) show a dozen or more legs on the floor, standing about 4 m across, that widen as they rise,
// cross each other in tall diamonds with no collars, sweep out in a trumpet under the glass and run on into the roof's own lattice;
// the legs on the Range side rise straight up against the brick. R3 (JMP): 20 m high, "next to but not touching" the Range.
// The mouth's width is not published: it is the roof grid's third ring (ASSUMED); the other dimensions are ASSUMED from the photographs.
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const canopy = concourseCanopy(data);
const station = stationBuilding(data) as NonNullable<ReturnType<typeof stationBuilding>>;
const hotel = data.buildings.find(b => b.id === 46821177)!;
const group = buildConcourse(canopy, station.pts, layout, [hotel.pts]);
const column = group.getObjectByName('concourse-column') as THREE.Mesh;
const { centre, grid } = concourseGrid(canopy, station.pts, layout, [hotel.pts]);
const head = funnelHead(grid, centre, layout);
const { nodes, edges } = columnMembers(head);
const top = head.reduce((s, p) => s + p[1], 0) / head.length;
const close = (a: number, b: number, eps: number): void => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const radiusOf = (n: readonly number[]): number => Math.hypot(n[0]!, n[2]!);
const length = ([a, b]: [number, number]): number => Math.hypot(nodes[a]![0] - nodes[b]![0], nodes[a]![1] - nodes[b]![1], nodes[a]![2] - nodes[b]![2]);
const position = column.geometry.getAttribute('position');
const rings = (): { y: number; radii: number[] }[] => {
  const byHeight = new Map<string, number[]>();
  for (const n of nodes) byHeight.set(n[1].toFixed(2), [...(byHeight.get(n[1].toFixed(2)) ?? []), radiusOf(n)]);
  return [...byHeight].map(([y, radii]) => ({ y: Number(y), radii })).sort((a, b) => a.y - b.y);
};

test('funnel: round eight-sided tubes drawn along smooth curves, nothing else: no collars, no knuckles, one mesh', () => {
  assert.ok(column, 'the concourse has a column mesh');
  // a leg is a whole number of tubes of eight strips of two triangles each, three at least to curve; a hub or a collar would add to the count
  const tubes = column.geometry.index!.count / 3 / 16 / edges.length;
  assert.ok(Number.isInteger(tubes) && tubes >= 3, `${edges.length} legs drawn in ${tubes} tubes each`);
  assert.ok(edges.length > 250 && edges.length < 450, `${edges.length} members`);
  assert.ok(column.geometry.groups.length <= 1 && !column.children.length, 'one batched mesh');
});

test('funnel: a ring of 12 legs stands on the floor about 4 m across and the funnel opens out above it like a trumpet', () => {
  const feet = nodes.filter(n => n[1] === 0);
  assert.equal(feet.length, 12, 'R-a, R-ab: a dozen legs or more at the floor');
  for (const f of feet) assert.ok(radiusOf(f) > 1.6 && radiusOf(f) < 2.4, `foot at ${radiusOf(f).toFixed(2)} m from the axis (R-ab: feet span 3.7 to 4 m, scaled by the people)`);
  const mean = rings().map(({ y, radii }) => ({ y, r: radii.reduce((a, b) => a + b, 0) / radii.length }));
  const waist = mean.slice(1).reduce((a, p) => (p.r < a.r ? p : a));
  assert.ok(waist.y < 4, `the legs stop splaying and start to widen within 4 m of the floor (waist at ${waist.y} m)`);
  assert.ok(mean[0]!.r > waist.r, 'the feet are splayed');
  const flaring = mean.filter(p => p.y >= waist.y && p.y < top - 0.5);
  for (let i = 1; i < flaring.length; i++) assert.ok(flaring[i]!.r > flaring[i - 1]!.r, `the funnel widens at ${flaring[i]!.y} m`);
  const mouth = Math.min(...head.map(radiusOf)), middle = mean.find(p => p.y >= top / 2)!;
  assert.ok(mouth > 4 * waist.r, `the mouth, ${mouth.toFixed(1)} m out, is more than four times the waist's radius, ${waist.r.toFixed(1)} m (R-a: it sweeps out under the glass)`);
  assert.ok(middle.r > 1.25 * waist.r && middle.r < 0.6 * mouth, `at mid height the funnel has widened but is not yet at half its mouth (${middle.r.toFixed(2)} m)`);
  // the trumpet's own profile is monotone above the waist, from foot to mouth
  let last = 0;
  for (let t = 0.1; t <= 1.0001; t += 0.1) { assert.ok(columnRadius(t, mouth) > last || t === 0.1, `columnRadius at ${t.toFixed(1)}`); last = columnRadius(t, mouth); }
  close(columnRadius(1, mouth), mouth, 1e-9);
});

test('funnel: the head stands on the roof\'s third ring, one leg to each node, and the legs on the Range side rise straight up against the brick', () => {
  const ring = grid.nodes.filter(n => n.ring === FUNNEL_HEAD_RING), heads = nodes.slice(nodes.length - head.length);
  assert.equal(ring.length, 24, 'the roof grid has 24 nodes on its third ring');
  assert.equal(heads.length, ring.length, 'one leg to each roof node');
  let pressed = 0;
  heads.forEach((h, i) => {
    const r = head[i]!;
    assert.ok(Math.abs(h[1] - r[1]) < 1e-9 && Math.abs(h[2] - r[2]) < 1e-9, `leg ${i} ends at its roof node's height and v`);
    assert.ok(Math.abs(h[0] - Math.min(r[0], FUNNEL_REACH)) < 1e-9, `leg ${i} ends at its roof node, or against the Range`);
    if (r[0] > FUNNEL_REACH) pressed++;
  });
  assert.ok(pressed >= 5 && pressed <= 12, `${pressed} legs on the Range side`);
  // below the head every node stands inside the reach too, so the legs there are upright against the brick
  for (const n of nodes) assert.ok(n[0] <= FUNNEL_REACH + 1e-9, `a node at ${n[0].toFixed(2)} m reaches past the limit`);
  for (const r of head) assert.ok(r[1] > 19.2 && r[1] < canopy.apex, `the roof node is at ${r[1]} m, the funnel's 20 m (R3) less the roof's dip to the ring`);
});

test('funnel: it stands beside the Range, 0.25 to 1 m short of the face, never entering the cornice', () => {
  const axis = worldToShed(layout, [column.position.x, column.position.z]);
  let east = -Infinity;
  const p = new THREE.Vector3();
  column.updateMatrixWorld(true);
  for (let i = 0; i < position.count; i++) { p.fromBufferAttribute(position, i).applyMatrix4(column.matrixWorld); east = Math.max(east, worldToShed(layout, [p.x, p.z]).u); }
  const gap = RANGE_FACE - east;
  assert.ok(gap > 0.25 && gap < 1, `the funnel's tubes come within ${gap.toFixed(2)} m of the Range's face (R3: next to, not touching)`);
  assert.ok(Math.abs(axis.u + 17.7) < 1e-6, 'its axis stands 17.7 m from the shed wall, where the roof grid puts it');
  // the Range's cornice stands 0.45 m proud of its face (shed.ts); the legs stay west of it
  assert.ok(east < RANGE_FACE - 0.45, 'the legs stay clear of the cornice');
});

test('funnel: legs cross in diamonds, pass every crossing without a kink, stand upright on the floor and sweep outwards into the roof', () => {
  const legs = columnLegs(head), dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  assert.equal(legs.length, edges.length, 'one curve to each member');
  const first = (e: number): V3 => legs[e]!.tans[0]!, last = (e: number): V3 => legs[e]!.tans[legs[e]!.tans.length - 1]!;
  nodes.forEach((p, n) => {
    const ins = edges.flatMap(([, b], e) => (b === n ? [e] : [])), outs = edges.flatMap(([a], e) => (a === n ? [e] : []));
    // R-ab: no knuckle at a crossing: as many legs arrive and go straight on, within 5 degrees, as there are legs to go on into (a node
    // where the ring above has more legs than the ring below forks, and one leg starts there)
    const straight = ins.filter(i => outs.some(o => dot(last(i), first(o)) > Math.cos(Math.PI / 36))).length;
    assert.ok(straight >= Math.min(ins.length, outs.length), `${straight} of ${ins.length} legs go straight on at the node ${n}, ${p[1].toFixed(1)} m up, which ${outs.length} leave`);
    if (!ins.length) for (const o of outs) assert.ok(first(o)[1] > 0.97, `the foot at node ${n} is upright, ${first(o)[1].toFixed(2)}`);
    if (!outs.length && p[0] < FUNNEL_REACH - 1e-6) for (const i of ins) assert.ok(last(i)[1] < 0.5, `the leg into the roof at node ${n} sweeps outwards, ${last(i)[1].toFixed(2)}`);
    // R-a, R-ab: between the feet and the bell two parents lie either side of a node, half a step round: legs cross in diamonds
    if (ins.length && p[1] > 0.05 * top && p[1] < 0.55 * top) {
      const under = ins.map(e => nodes[edges[e]![0]]!);
      const turn = under.map(q => { let d = Math.atan2(q[2], q[0]) - Math.atan2(p[2], p[0]); while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; });
      if (p[0] < FUNNEL_REACH - 1e-6 && under.every(q => q[0] < FUNNEL_REACH - 1e-6)) assert.ok(Math.min(...turn) < -0.15 && Math.max(...turn) > 0.15, `the legs under node ${n}, ${p[1].toFixed(1)} m up, do not cross it (${turn.map(t => t.toFixed(2))})`);
    }
  });
});

test('funnel: members run 1.2 to 5.1 m between nodes; a leg is 0.36 m through at the floor, 0.22 m at the roof, and is drawn that wide', () => {
  const lengths = edges.map(length);
  assert.ok(Math.min(...lengths) > 1.1 && Math.max(...lengths) < 5.1, `lengths ${Math.min(...lengths).toFixed(2)} to ${Math.max(...lengths).toFixed(2)} m`);
  assert.ok(Math.abs(columnTubeDiameter(0, top) - 0.36) < 1e-9 && Math.abs(columnTubeDiameter(top, top) - 0.22) < 1e-9, 'a leg is 0.36 m through at the floor and 0.22 m at the roof');
  let last = Infinity;
  for (let y = 0; y <= top; y += 1) {
    assert.ok(columnTubeDiameter(y, top) < last, `slimmer at ${y} m`);
    last = columnTubeDiameter(y, top);
  }
  // the tube drawn at a mid-height node is as thick as its diameter says: its nearest surface vertex is half a diameter away
  const mid = nodes.find(n => Math.abs(n[1] - 8.0) < 0.5 && n[0] < 0)!;
  let nearest = Infinity;
  for (let i = 0; i < position.count; i++) nearest = Math.min(nearest, Math.hypot(position.getX(i) - mid[0], position.getY(i) - mid[1], position.getZ(i) - mid[2]));
  const radius = columnTubeDiameter(mid[1], top) / 2;
  assert.ok(Math.abs(nearest - radius) < 0.02, `a node at ${mid[1].toFixed(1)} m has surface ${nearest.toFixed(3)} m away, a ${radius.toFixed(3)} m radius`);
});
