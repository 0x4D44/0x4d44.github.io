import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { concourseCanopy, shedLayout, stationBuilding, worldToShed } from '../../core/station.ts';
import { buildConcourse, COLUMN_SEGMENTS, columnLegs, columnMembers, columnRadius, columnStrands, columnTubeDiameter, concourseGrid, edgesOf, FORK_START, FUNNEL_HEAD_RING, FUNNEL_REACH, funnelHead, funnelRoof, keepTriangles, RANGE_FACE, tubeRings } from '../src/concourse.ts';
import type { Ring } from '../src/concourse.ts';
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
const kept = keepTriangles(grid, station.pts, layout);
const roof = funnelRoof(grid, kept, centre, layout);
const { nodes, edges } = columnMembers(head);
const top = head.reduce((s, p) => s + p[1], 0) / head.length;
const close = (a: number, b: number, eps: number): void => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const dot3 = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const angle3 = (a: readonly number[], b: readonly number[]): number => Math.acos(Math.max(-1, Math.min(1, dot3(a, b))));
const distance3 = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const toward = (a: readonly number[], b: readonly number[]): V3 => { const d: V3 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], l = Math.hypot(...d); return [d[0] / l, d[1] / l, d[2] / l]; };
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
  // R-a, R-ab: it sweeps out until it runs level into the roof's lattice, with no rim under it: in the last hundredth of its height it leans 70 degrees from the upright
  const lean = Math.atan((mouth - columnRadius(0.99, mouth)) / (0.01 * top)) * 57.2958;
  assert.ok(lean > 70, `the flare meets the roof ${lean.toFixed(0)} degrees from the upright, not level`);
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
  const legs = columnLegs(head, roof), dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  assert.equal(legs.length, edges.length, 'one curve to each member');
  const first = (e: number): V3 => legs[e]!.tans[0]!, last = (e: number): V3 => legs[e]!.tans[legs[e]!.tans.length - 1]!;
  nodes.forEach((p, n) => {
    const ins = edges.flatMap(([, b], e) => (b === n ? [e] : [])), outs = edges.flatMap(([a], e) => (a === n ? [e] : []));
    // R-ab: no knuckle at a crossing: as many legs arrive and go straight on, within 5 degrees, as there are legs to go on into (a node
    // where the ring above has more legs than the ring below forks, and one leg starts there)
    const straight = ins.filter(i => outs.some(o => dot(last(i), first(o)) > Math.cos(Math.PI / 36))).length;
    assert.ok(straight >= Math.min(ins.length, outs.length), `${straight} of ${ins.length} legs go straight on at the node ${n}, ${p[1].toFixed(1)} m up, which ${outs.length} leave`);
    if (!ins.length) for (const o of outs) assert.ok(first(o)[1] > 0.97, `the foot at node ${n} is upright, ${first(o)[1].toFixed(2)}`);
    if (!outs.length && p[0] < FUNNEL_REACH - 1e-6) for (const i of ins) {
      assert.ok(last(i)[1] < 0.3, `the leg into the roof at node ${n} lands within 17 degrees of the roof's slope, ${last(i)[1].toFixed(2)} (R-a: the legs fan out into the first ring of members)`);
      assert.ok(roof[n - nodes.length + head.length]!.some(m => dot(last(i), m) > 0.99999), `the leg into the roof at node ${n} lands along none of the members the roof sends out of it`);
    }
    // R-a, R-ab: between the feet and the bell two parents lie either side of a node, half a step round: legs cross in diamonds
    if (ins.length && p[1] > 0.05 * top && p[1] < 0.55 * top) {
      const under = ins.map(e => nodes[edges[e]![0]]!);
      const turn = under.map(q => { let d = Math.atan2(q[2], q[0]) - Math.atan2(p[2], p[0]); while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; });
      if (p[0] < FUNNEL_REACH - 1e-6 && under.every(q => q[0] < FUNNEL_REACH - 1e-6)) assert.ok(Math.min(...turn) < -0.15 && Math.max(...turn) > 0.15, `the legs under node ${n}, ${p[1].toFixed(1)} m up, do not cross it (${turn.map(t => t.toFixed(2))})`);
    }
  });
});

// R-a, R-ab: where two legs cross they run straight on, each as one tube, not as pieces cut off at the crossing.
test('funnel: legs that go straight on are drawn as one tube, so a crossing cuts no leg across and draws no ring twice', () => {
  const legs = columnLegs(head, roof), strands = columnStrands(head, roof);
  assert.equal(strands.reduce((s, rings) => s + rings.length - 1, 0), COLUMN_SEGMENTS * legs.length, 'every leg is drawn once, in its own pieces, the ring it shares with the next leg counted once');
  let joined = 0;
  legs.forEach((leg, e) => {
    if (leg.next === undefined) return;
    const next = legs[leg.next]!;
    assert.ok(distance3(leg.pts[leg.pts.length - 1]!, next.pts[0]!) < 1e-9 && dot3(leg.tans[leg.tans.length - 1]!, next.tans[0]!) > 0.99999, `leg ${e} does not meet the leg it goes on into along the same line`);
    joined++;
  });
  assert.equal(joined, legs.length - 2 * head.length, 'every leg goes on into another but the two that land on each roof node');
  assert.ok(strands.length * 4 < legs.length, `${strands.length} tubes for ${legs.length} legs`);
  for (const rings of strands) for (let k = 1; k < rings.length; k++) assert.ok(distance3(rings[k - 1]!.p, rings[k]!.p) > 0.25, `two rings of one tube lie ${distance3(rings[k - 1]!.p, rings[k]!.p).toFixed(3)} m apart`);
});

// A frame worked out from the tangent alone flips as the tangent passes the vertical, and the tube pinches into a bow-tie there.
test('funnel: a tube never twists, however its tangent bends: each ring is the last one turned by no more than the tangent turned', () => {
  const lean = ([x, y, z]: V3): V3 => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
  const over = [[0.5, 0.8, 0], [0.12, 0.99, 0.02], [-0.2, 0.97, 0.05], [-0.55, 0.8, 0.1]].map(t => lean(t as V3)).map((t, k) => ({ p: [k, k, 0] as V3, t, r: 0.1 }));
  const check = (label: string, rings: Ring[]): void => {
    const frames = tubeRings(rings), spoke = (k: number): V3 => toward(rings[k]!.p, frames[k]![0]!.p); // the ring's first vertex, out from its axis
    for (let k = 0; k + 1 < frames.length; k++) {
      const turned = angle3(spoke(k), spoke(k + 1)), bent = angle3(rings[k]!.t, rings[k + 1]!.t);
      assert.ok(turned <= bent + 1e-9, `${label}: ring ${k} to ${k + 1} turns the frame ${(turned * 57.3).toFixed(0)} degrees, the tangent ${(bent * 57.3).toFixed(0)}`);
    }
  };
  check('a tube leaning over the vertical', over);
  columnStrands(head, roof).forEach((rings, s) => check(`strand ${s}`, rings));
});

// Two equal tubes that cross meet along a crease, and each leans a different way there, so lit plainly they show a hard step across it (a tear).
test('funnel: where two tubes cross, each is shaded halfway toward the other\'s own normal at the crossing, so the crease shows no step', () => {
  let crossed = 0, round = 0, shared = 0;
  for (const rings of columnStrands(head, roof)) {
    const frames = tubeRings(rings), crossings = rings.filter(c => c.x);
    // how far a vertex is from the axis of the tube that crosses at `c`
    const away = (v: V3, c: Ring): number => { const a = [v[0] - c.p[0], v[1] - c.p[1], v[2] - c.p[2]], d = dot3(a, c.x!); return Math.hypot(a[0]! - d * c.x![0], a[1]! - d * c.x![1], a[2]! - d * c.x![2]); };
    rings.forEach((ring, k) => {
      for (const vertex of frames[k]!) {
        const radial = toward(ring.p, vertex.p);
        close(Math.hypot(...vertex.n), 1, 1e-9);
        if (ring.x) {
          // at the crossing itself: halfway between the tube's own normal and the other tube's, which is straight out from the other's axis; unless a second crossing of
          // the same tube reaches the vertex too (two crossings within two radii of one another's tubes, where the legs run nearly parallel), which blends in its own
          if (crossings.some(c => c !== ring && away(vertex.p, c) < 2 * ring.r)) { shared++; continue; }
          const along = dot3(radial, ring.x), other = toward([0, 0, 0], [radial[0] - along * ring.x[0], radial[1] - along * ring.x[1], radial[2] - along * ring.x[2]]);
          close(angle3(vertex.n, other), angle3(radial, other) / 2, 1e-6);
          if (angle3(radial, other) > 0.2) crossed++;
        }
        // well clear of every tube that crosses it (two radii from its axis) a vertex is shaded round
        if (crossings.every(c => away(vertex.p, c) > 2 * ring.r)) { assert.ok(angle3(vertex.n, radial) < 1e-6, 'a vertex well clear of the tubes that cross it is shaded round, its normal straight out from its own axis'); round++; }
      }
    });
  }
  assert.ok(crossed > 500 && round > 1000, `${crossed} vertices where two tubes lean apart at a crossing, ${round} clear of any`);
  assert.ok(shared < crossed / 40, `${shared} vertices at a crossing are also reached by a second one: rare, not the rule (${crossed} are not)`);
});

// R-ab: a leg that starts above the floor grows out of the legs it crosses, as a branch; at the foot, 24 legs start from 12 feet.
test('funnel: a leg that forks off starts inside the legs it grows from, at part of its width, and is full width a third of the way on', () => {
  const strands = columnStrands(head, roof), forks = strands.filter(rings => rings[0]!.p[1] > 0);
  const owed = nodes.reduce((s, _, n) => s + Math.max(0, edges.filter(([a]) => a === n).length - edges.filter(([, b]) => b === n).length) * (nodes[n]![1] > 0 ? 1 : 0), 0);
  assert.equal(forks.length, owed, 'one fork for each leg a node sends out beyond the legs that arrive at it');
  assert.equal(strands.length, forks.length + edges.filter(([a]) => nodes[a]![1] === 0).length, 'the other tubes start on the floor');
  for (const rings of forks) {
    const full = columnTubeDiameter(rings[0]!.p[1], top) / 2;
    assert.ok(rings[0]!.r > 0.5 * full && rings[0]!.r < full, `a fork starts ${(rings[0]!.r / full).toFixed(2)} of its width: inside the legs it leaves, but not as a needle`);
    close(rings[0]!.r, FORK_START * full, 1e-9);
    close(rings[1]!.r, columnTubeDiameter(rings[1]!.p[1], top) / 2, 1e-9);
    assert.ok(strands.some(other => other !== rings && other.some(ring => distance3(ring.p, rings[0]!.p) < 1e-9)), 'a fork starts on the axis of another leg');
  }
  for (const rings of strands.filter(r => r[0]!.p[1] === 0)) close(rings[0]!.r, columnTubeDiameter(0, top) / 2, 1e-9);
});

// R-a: the legs run on into the roof's own members, each along the one nearest its heading.
test('funnel: a leg into the roof lands along the roof member nearest its heading, and two legs along two members where the roof sends out two', () => {
  const legs = columnLegs(head, roof), first = nodes.length - head.length;
  head.forEach((_, k) => {
    const n = first + k, ins = edges.flatMap(([, b], e) => (b === n ? [e] : []));
    const end = (e: number): V3 => legs[e]!.tans[legs[e]!.tans.length - 1]!, heading = (e: number): V3 => toward(nodes[edges[e]![0]]!, nodes[n]!);
    if (nodes[n]![0] >= FUNNEL_REACH - 1e-6) { for (const e of ins) assert.ok(dot3(end(e), heading(e)) > 0.99999, `a leg against the Range at node ${k} rises straight`); return; }
    const members = roof[k]!, landed = ins.map(e => members.findIndex(m => dot3(end(e), m) > 0.99999));
    assert.ok(landed.every(j => j >= 0), `a leg into node ${k} lands along no roof member`);
    if (ins.length > 1 && members.length > 1) assert.notEqual(landed[0], landed[1], `both legs into node ${k} land along one of its ${members.length} members`);
    let best = { leg: 0, member: 0, dot: -Infinity };
    ins.forEach((e, i) => members.forEach((m, j) => { if (dot3(heading(e), m) > best.dot) best = { leg: i, member: j, dot: dot3(heading(e), m) }; }));
    assert.equal(landed[best.leg], best.member, `the leg and member at node ${k} that suit each other best are matched`);
  });
});

// The real roof never puts two legs in a head node after the same member, so the rule is pinned with a roof made to: the leg that suits the member
// better takes it, and the other takes the member left, not the same one over it.
test('funnel: where two legs suit the same roof member, the nearer takes it and the other goes along the member left', () => {
  const first = nodes.length - head.length, k = head.findIndex((_, i) => nodes[first + i]![0] < FUNNEL_REACH - 1e-6 && edges.filter(([, b]) => b === first + i).length === 2);
  assert.ok(k >= 0, 'a head node with two legs and room to stand on');
  const n = first + k, ins = edges.flatMap(([, b], e) => (b === n ? [e] : [])), a = toward(nodes[edges[ins[0]!]![0]]!, nodes[n]!), b = toward(nodes[edges[ins[1]!]![0]]!, nodes[n]!);
  const x = toward([0, 0, 0], [1.3 * a[0] + 0.7 * b[0], 1.3 * a[1] + 0.7 * b[1], 1.3 * a[2] + 0.7 * b[2]]), y = toward([0, 0, 0], [x[0], x[1] - 1.5, x[2] + 0.4]);
  assert.ok(dot3(a, x) > dot3(b, x) && dot3(a, x) > dot3(a, y) && dot3(b, x) > dot3(b, y), 'both legs suit x better than y, the first leg suiting it better than the second');
  const legs = columnLegs(head, roof.map((members, i) => (i === k ? [x, y] : members))), end = (e: number): V3 => legs[e]!.tans[legs[e]!.tans.length - 1]!;
  assert.ok(dot3(end(ins[0]!), x) > 0.99999, 'the leg that suits x better lands along it');
  assert.ok(dot3(end(ins[1]!), y) > 0.99999, 'the other leg lands along the member left');
});

// The members are the lattice's own links, so a leg that lands along one runs on into it.
test('funnelRoof: the members out of a head node are the lattice links to the ring beyond it, unit vectors in the funnel\'s frame, none rising', () => {
  const axis = worldToShed(layout, centre), at = (i: number): V3 => { const n = grid.nodes[i]!, s = worldToShed(layout, [n.x, n.z]); return [s.u - axis.u, n.height!, axis.v - s.v]; };
  const links = [...edgesOf(kept).values()], ring = grid.nodes.flatMap((n, i) => (n.ring === FUNNEL_HEAD_RING ? [i] : []));
  assert.equal(roof.length, ring.length, 'a list for each head node');
  let linked = 0;
  ring.forEach((i, k) => {
    const want = links.flatMap(({ a, b }) => { const o = a === i ? b : b === i ? a : -1; return o >= 0 && grid.nodes[o]!.ring === FUNNEL_HEAD_RING + 1 ? [toward(at(i), at(o))] : []; });
    if (!want.length) {
      // only where the roof is cut away at the Range, against which the legs rise
      assert.ok(head[k]![0] >= FUNNEL_REACH, `head node ${k} is clear of the Range and has no lattice link beyond it`);
      assert.deepEqual(roof[k], [toward([0, 0, 0], [head[k]![0], 0, head[k]![2]])], 'a head node the roof sends nothing out of gets the way straight out, level');
      return;
    }
    linked++;
    assert.equal(roof[k]!.length, want.length, `head node ${k} sends out ${want.length} members`);
    for (const m of roof[k]!) { close(Math.hypot(...m), 1, 1e-9); assert.ok(want.some(w => dot3(w, m) > 0.99999), `head node ${k}: a member that is no link of the lattice`); }
  });
  assert.ok(linked >= 12 && linked < ring.length, `${linked} of ${ring.length} head nodes have the lattice beyond them`);
  for (const m of roof.flat()) assert.ok(m[1] <= 0.02, `a member rises ${m[1].toFixed(2)}: the roof falls away from the funnel's mouth`);
});

test('funnel: members run 1.2 to 6.3 m between nodes (the last, flaring out to the roof, the longest); a leg is 0.36 m through at the floor, 0.22 m at the roof, and is drawn that wide', () => {
  const lengths = edges.map(length);
  assert.ok(Math.min(...lengths) > 1.1 && Math.max(...lengths) < 6.3, `lengths ${Math.min(...lengths).toFixed(2)} to ${Math.max(...lengths).toFixed(2)} m`);
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
