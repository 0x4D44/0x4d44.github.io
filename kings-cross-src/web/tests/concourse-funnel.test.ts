import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { concourseCanopy, shedLayout, stationBuilding, worldToShed } from '../../core/station.ts';
import { buildConcourse, COLUMN_SEGMENTS, columnLegs, columnMembers, columnRadius, columnStrands, columnTubeDiameter, concourseGrid, CORNICE_TOP, edgesOf, FUNNEL_HEAD_RING, FUNNEL_REACH, funnelHead, funnelRoof, keepTriangles, RANGE_FACE, tubeRings } from '../src/concourse.ts';
import type { Ring } from '../src/concourse.ts';
type V3 = [number, number, number];

// The funnel: a tree of long, thick, round white tubes. R-a (conc-a-funnel-2012), R-ab (conc-ab-funnel-brick-2025) and R-b
// (conc-b-roof-meets-range-2025-08) show a dozen or more legs on the floor, standing about 4 m across, that widen as they rise,
// cross each other in tall diamonds with no collars, sweep out in a trumpet under the glass and run on into the roof's own lattice;
// the legs on the Range side rise straight up against the brick. R3 (JMP): 20 m high, "next to but not touching" the Range.
// Round 5 (scorer, C3): the legs are evenly spaced, regular diamonds of single members, not near-parallel pairs, and the head is not a tangle of
// thin branches: twelve legs from the floor to the head, twelve nodes in every ring, each crossing its neighbours half a step round, no leg forking.
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
  heads.forEach((_, i) => assert.equal(edges.filter(([, b]) => b === nodes.length - heads.length + i).length, 1, `head node ${i} takes one leg: two legs into a node are a tangle of thin branches (round 5, C3)`));
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

test('funnel: it stands beside the Range, 0.45 to 1 m short of the face, never entering the cornice', () => {
  const axis = worldToShed(layout, [column.position.x, column.position.z]);
  let east = -Infinity;
  const p = new THREE.Vector3();
  column.updateMatrixWorld(true);
  for (let i = 0; i < position.count; i++) { p.fromBufferAttribute(position, i).applyMatrix4(column.matrixWorld); east = Math.max(east, worldToShed(layout, [p.x, p.z]).u); }
  const gap = RANGE_FACE - east;
  // the Range's cornice stands 0.45 m proud of its face (shed.ts): every tube of the funnel stays west of it, at every height
  assert.ok(gap > 0.45 && gap < 1, `the funnel's tubes come within ${gap.toFixed(3)} m of the Range's face (R3: next to, not touching; the cornice is 0.45 m)`);
  assert.ok(Math.abs(axis.u + 17.7) < 1e-6, 'its axis stands 17.7 m from the shed wall, where the roof grid puts it');
});

// Round 5 (scorer): over the Range's cornice the roof's closure glass fills the cut, 0.29 m off the brick, so a funnel that came within 0.29 m of the face up there would pierce it.
test('funnel: it stands clear of the closure glass over the Range\'s cornice, every tube at least 0.1 m west of it (R3: next to, not touching)', () => {
  const closure = group.getObjectByName('concourse-closure') as THREE.Mesh | undefined;
  assert.ok(closure, 'the roof closes its cut over the Range with a glass wall');
  const glass = closure.geometry.getAttribute('position'), p = new THREE.Vector3();
  const axis = worldToShed(layout, [column.position.x, column.position.z]);
  closure.updateMatrixWorld(true);
  column.updateMatrixWorld(true);
  // the glass in front of the funnel, as built: the closure's corners within the funnel's width of its axis along the Range, from the cornice's foot up
  const plane: number[] = [], heights: number[] = [];
  for (let i = 0; i < glass.count; i++) {
    p.fromBufferAttribute(glass, i).applyMatrix4(closure.matrixWorld);
    const at = worldToShed(layout, [p.x, p.z]);
    if (Math.abs(at.v - axis.v) < 6.4 && p.y > CORNICE_TOP - 1) { plane.push(at.u); heights.push(p.y); }
  }
  assert.ok(plane.length >= 8, `${plane.length} corners of the closure glass stand before the funnel`);
  const wall = Math.max(...plane), foot = Math.min(...heights);
  assert.ok(wall - Math.min(...plane) < 1e-6, 'the glass there is one flat plane');
  assert.ok(wall < RANGE_FACE - 0.25 && wall > RANGE_FACE - 0.35, `the glass stands ${(RANGE_FACE - wall).toFixed(2)} m off the Range's face (0.29 m: the roof's cut, 0.3 m in front of the wall)`);
  assert.ok(Math.abs(foot - CORNICE_TOP) < 0.01, `the glass starts at the cornice's top, ${foot.toFixed(2)} m up`);
  let east = -Infinity;
  for (let i = 0; i < position.count; i++) { p.fromBufferAttribute(position, i).applyMatrix4(column.matrixWorld); if (p.y > foot) east = Math.max(east, worldToShed(layout, [p.x, p.z]).u); }
  assert.ok(east < wall - 0.1, `the funnel's tubes above the cornice come within ${(wall - east).toFixed(3)} m of the closure glass`);
});

test('funnel: legs cross in diamonds, pass every crossing without a kink, stand upright on the floor and sweep outwards into the roof', () => {
  const legs = columnLegs(head, roof), dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  assert.equal(legs.length, edges.length, 'one curve to each member');
  const first = (e: number): V3 => legs[e]!.tans[0]!, last = (e: number): V3 => legs[e]!.tans[legs[e]!.tans.length - 1]!;
  nodes.forEach((p, n) => {
    const ins = edges.flatMap(([, b], e) => (b === n ? [e] : [])), outs = edges.flatMap(([a], e) => (a === n ? [e] : []));
    // R-ab: no knuckle at a crossing: as many legs arrive and go straight on, within 5 degrees, as there are legs to go on into
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
  assert.equal(joined, legs.length - head.length, 'every leg goes on into another but the one that lands on each roof node');
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

// Two equal tubes that cross meet along a crease, and each leans a different way there, so lit plainly they show a hard step across it (a tear). `shading` asserts
// every vertex of a strand's tubes and counts them: those at a crossing, those clear of every crossing, and those at a crossing that a second one reaches too.
const shading = (rings: readonly Ring[]): { crossed: number; round: number; shared: number; coned: number } => {
  const count = { crossed: 0, round: 0, shared: 0, coned: 0 };
  // the tube that crosses at `c`, seen from a vertex: how far the vertex is from its axis, and which way is straight out from that axis
  const from = (v: V3, c: Ring): { away: number; out: V3 } => {
    const a: V3 = [v[0] - c.p[0], v[1] - c.p[1], v[2] - c.p[2]], d = dot3(a, c.x!), m: V3 = [a[0] - d * c.x![0], a[1] - d * c.x![1], a[2] - d * c.x![2]];
    return { away: Math.hypot(...m), out: toward([0, 0, 0], m) };
  };
  // the determinant of three vectors, to write one as a sum of three others
  const det = (a: V3, b: V3, c: V3): number => dot3(a, [b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0]]);
  const orders = <T>(a: T[]): T[][] => (a.length < 2 ? [a] : a.flatMap((x, i) => orders([...a.slice(0, i), ...a.slice(i + 1)]).map(o => [x, ...o])));
  const frames = tubeRings(rings), crossings = rings.filter(c => c.x);
  rings.forEach((ring, k) => {
    for (const vertex of frames[k]!) {
      const radial = toward(ring.p, vertex.p);
      close(Math.hypot(...vertex.n), 1, 1e-9);
      // the tubes that reach the vertex (within two radii of their axes), each with its pull: whole within a radius of the axis, none at two
      const hits = crossings.map(c => from(vertex.p, c)).filter(h => h.away > 1e-9 && h.away < 2 * ring.r).map(h => ({ out: h.out, pull: Math.min(1, 2 - h.away / ring.r) }));
      if (ring.x && hits.length > 1) {
        // a second crossing reaches this one's vertex (where legs run nearly parallel, two crossings overlap): the shading leans toward the tubes one after the other, so it is
        // what leaning the round normal toward each in turn gives, in whichever order, and it lies in the cone of the round normal and the tubes' own
        count.shared++;
        const lean = (order: typeof hits): V3 => order.reduce((s, h) => toward([0, 0, 0], [s[0] + h.pull * h.out[0], s[1] + h.pull * h.out[1], s[2] + h.pull * h.out[2]]), radial);
        assert.ok(orders(hits).some(order => angle3(lean(order), vertex.n) < 1e-6), 'a vertex that two crossings reach is shaded as the round normal leaned toward each of them in turn');
        const [p, q] = [hits[0]!.out, hits[1]!.out], whole = det(radial, p, q);
        // (the three directions in one plane, which cannot be written as a sum of the others in only one way, are left to the check above)
        if (hits.length === 2 && Math.abs(whole) > 1e-3) {
          count.coned++;
          for (const share of [det(vertex.n, p, q), det(radial, vertex.n, q), det(radial, p, vertex.n)]) assert.ok(share / whole > 0, 'the shading is the round normal and both tubes\' own, each in some measure, none turned against');
        }
        continue;
      }
      if (ring.x) {
        // at the crossing itself: halfway between the tube's own normal and the other tube's, which is straight out from the other's axis
        const along = dot3(radial, ring.x), other = toward([0, 0, 0], [radial[0] - along * ring.x[0], radial[1] - along * ring.x[1], radial[2] - along * ring.x[2]]);
        close(angle3(vertex.n, other), angle3(radial, other) / 2, 1e-6);
        if (angle3(radial, other) > 0.2) count.crossed++;
      }
      // well clear of every tube that crosses it (two radii from its axis) a vertex is shaded round
      if (hits.length === 0) { assert.ok(angle3(vertex.n, radial) < 1e-6, 'a vertex well clear of the tubes that cross it is shaded round, its normal straight out from its own axis'); count.round++; }
    }
  });
  return count;
};

test('funnel: where two tubes cross, each is shaded halfway toward the other\'s own normal at the crossing, so the crease shows no step', () => {
  let crossed = 0, round = 0, shared = 0;
  for (const rings of columnStrands(head, roof)) { const count = shading(rings); crossed += count.crossed; round += count.round; shared += count.shared; }
  assert.ok(crossed > 500 && round > 1000, `${crossed} vertices where two tubes lean apart at a crossing, ${round} clear of any`);
  assert.ok(shared < crossed / 40, `${shared} vertices at a crossing are also reached by a second one: rare, not the rule (${crossed} are not)`);
});

// Independent of the funnel's own layout: a straight tube up the y axis crossed by two others a tube's width apart, so their crossings overlap.
test('funnel: a vertex that two crossings reach is shaded as the round normal leaned toward each tube in turn, whatever the layout', () => {
  const r = 0.1, up: V3 = [0, 1, 0], plain = (y: number): Ring => ({ p: [0, y, 0], t: up, r }), crossing = (y: number, x: V3): Ring => ({ p: [0, y, 0], t: up, r, x: toward([0, 0, 0], x) });
  const count = shading([plain(0), plain(0.5), crossing(0.9, [1, 1, 0]), crossing(1.1, [0, 1, 1]), plain(1.5), plain(2)]);
  assert.ok(count.shared > 4 && count.coned > 2, `${count.shared} vertices of the two crossings are reached by both, ${count.coned} of them in the cone`);
  assert.ok(count.crossed > 0 && count.round > 4, `${count.crossed} lean apart at a crossing alone, ${count.round} are clear of both`);
});

// R-ab, round 5 (C3): twenty-four tubes stand on the floor, two from each of the twelve feet, and each runs unbroken up to a head node of its own: no leg forks off another
// partway up (a fork is a thin branch growing out of a thick one, which read as a tangle at the head), so every crossing is two single members.
test('funnel: twenty-four tubes stand on the floor, two from each of the twelve feet at full width, each runs up to a head node of its own, and none starts higher', () => {
  const strands = columnStrands(head, roof), feet = nodes.filter(n => n[1] === 0), heads = nodes.slice(nodes.length - head.length);
  assert.equal(feet.length, 12, 'twelve feet');
  assert.equal(strands.length, 2 * feet.length, 'two tubes from each foot');
  assert.equal(strands.length, head.length, 'one tube to each head node');
  for (const rings of strands) {
    assert.equal(rings[0]!.p[1], 0, `a tube starts ${rings[0]!.p[1].toFixed(2)} m up: it forks off another leg instead of standing on the floor`);
    close(rings[0]!.r, columnTubeDiameter(0, top) / 2, 1e-9); // full width at the foot, not a needle growing out of another tube
    assert.ok(feet.some(f => distance3(f, rings[0]!.p) < 1e-9), 'a tube starts on a foot');
    assert.ok(heads.some(h => distance3(h, rings[rings.length - 1]!.p) < 1e-9), 'a tube ends on a head node');
  }
  for (const f of feet) assert.equal(strands.filter(rings => distance3(f, rings[0]!.p) < 1e-9).length, 2, `two tubes start at the foot ${f[0].toFixed(2)}, ${f[2].toFixed(2)}`);
  for (const h of heads) assert.equal(strands.filter(rings => distance3(h, rings[rings.length - 1]!.p) < 1e-9).length, 1, `one tube ends at the head node ${h[0].toFixed(2)}, ${h[2].toFixed(2)}`);
});

// R-ab, round 5 (C3): "legs evenly spaced: regular diamond crossings, not near-parallel pairs". A ring is twelve nodes a twelfth of a turn apart, and the next ring up is turned
// half a step. (The Range side presses its nodes flat against the brick, which moves them off their angle; the nodes clear of it are measured.)
test('funnel: every ring below the head is twelve nodes a twelfth of a turn apart, turned half a step from the ring below, so the diamonds are all alike', () => {
  const step = Math.PI / 6, wrap = (d: number): number => { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const rows = rings().filter(r => r.y < top - 0.5).map(({ y }) => nodes.filter(n => n[1].toFixed(2) === y.toFixed(2)));
  assert.ok(rows.length >= 12, `${rows.length} rings from the floor to the head`);
  const free = (row: V3[]): number[] => row.filter(n => n[0] < FUNNEL_REACH - 1e-6).map(n => Math.atan2(n[2], n[0]));
  rows.forEach((row, k) => {
    assert.equal(row.length, 12, `ring ${k} has ${row.length} nodes`);
    const angles = free(row);
    assert.ok(angles.length >= 8, `ring ${k}: ${angles.length} nodes clear of the Range to measure`);
    for (const a of angles) for (const b of angles) { const turns = wrap(a - b) / step; close(turns, Math.round(turns), 1e-6); } // a whole number of twelfths apart
    if (k) for (const a of angles) for (const b of free(rows[k - 1]!)) { const turns = wrap(a - b) / step; close(Math.abs(turns - Math.round(turns)), 0.5, 1e-6); } // and half a step from the ring below
  });
});

// R-a: the legs run on into the roof's own members, each along the one nearest its heading.
test('funnel: a leg into the roof lands along the roof member nearest its heading, one leg to each node', () => {
  const legs = columnLegs(head, roof), first = nodes.length - head.length;
  head.forEach((_, k) => {
    const n = first + k, ins = edges.flatMap(([, b], e) => (b === n ? [e] : []));
    const end = (e: number): V3 => legs[e]!.tans[legs[e]!.tans.length - 1]!, heading = (e: number): V3 => toward(nodes[edges[e]![0]]!, nodes[n]!);
    if (nodes[n]![0] >= FUNNEL_REACH - 1e-6) { for (const e of ins) assert.ok(dot3(end(e), heading(e)) > 0.99999, `a leg against the Range at node ${k} rises straight`); return; }
    const members = roof[k]!, landed = ins.map(e => members.findIndex(m => dot3(end(e), m) > 0.99999));
    assert.equal(ins.length, 1, `node ${k} takes one leg`);
    assert.ok(landed.every(j => j >= 0), `a leg into node ${k} lands along no roof member`);
    let best = { leg: 0, member: 0, dot: -Infinity };
    ins.forEach((e, i) => members.forEach((m, j) => { if (dot3(heading(e), m) > best.dot) best = { leg: i, member: j, dot: dot3(heading(e), m) }; }));
    assert.equal(landed[best.leg], best.member, `the leg and member at node ${k} that suit each other best are matched`);
  });
});

// The real roof sends one to three members out of a head node, mostly in the order of their angle: the rule is pinned with a roof made to list three in every order.
test('funnel: a leg lands along whichever of the roof\'s members lies nearest its heading, whatever order the roof lists them in', () => {
  const first = nodes.length - head.length, k = head.findIndex((_, i) => nodes[first + i]![0] < FUNNEL_REACH - 1e-6);
  assert.ok(k >= 0, 'a head node with room to stand on');
  const n = first + k, e = edges.findIndex(([, b]) => b === n), heading = toward(nodes[edges[e]![0]]!, nodes[n]!);
  const near = toward([0, 0, 0], [heading[0] + 0.2, heading[1] - 0.2, heading[2]]), mid = toward([0, 0, 0], [heading[0] - 0.4, heading[1] - 0.5, heading[2] + 0.1]), far = toward([0, 0, 0], [heading[0], heading[1] - 1.5, heading[2] + 0.4]);
  assert.ok(dot3(heading, near) > dot3(heading, mid) && dot3(heading, mid) > dot3(heading, far), 'the three members lie nearer and farther from the heading, in that order');
  for (const order of [[near, mid, far], [far, mid, near], [mid, far, near]]) {
    const legs = columnLegs(head, roof.map((members, i) => (i === k ? order : members)));
    assert.ok(dot3(legs[e]!.tans[legs[e]!.tans.length - 1]!, near) > 0.99999, 'the leg lands along the member nearest its heading');
  }
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

test('funnel: members run 1.2 to 5.1 m between nodes, but for the last stretch into the head, which flares out to the roof and runs to 6.3 m; a leg is 0.36 m through at the floor, 0.22 m at the roof, and is drawn that wide', () => {
  // the last stretch is the members that land on the head's nodes (the head's are the last of the nodes): they cross the widest gap, from the last ring out to the roof's ring
  const first = nodes.length - head.length, lands = ([, b]: [number, number]): boolean => b >= first;
  const stalk = edges.filter(e => !lands(e)).map(length), flare = edges.filter(lands).map(length), long = flare.filter(l => l > 5.1).length;
  assert.ok(Math.min(...stalk, ...flare) > 1.1 && Math.max(...stalk) < 5.1, `members below the head run ${Math.min(...stalk, ...flare).toFixed(2)} to ${Math.max(...stalk).toFixed(2)} m: a long one in the trunk is a ring missing`);
  assert.ok(Math.max(...flare) < 6.3 && long <= flare.length / 6, `the last stretch runs to ${Math.max(...flare).toFixed(2)} m, ${long} of its ${flare.length} members over 5.1 m`);
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
