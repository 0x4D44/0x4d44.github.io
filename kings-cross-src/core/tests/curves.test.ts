// The smooth track (core/curves.ts): a curve through every OSM node with no angle where a track runs
// on, straights left straight, a turnout's branch leaving along its through route, and the graph's
// edgePoint() reading a train's position off exactly the pieces railSegments() draws.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DIVERGE_TURN, railShapes, shapeFrom, SMOOTH_TURN, STEP_TURN } from '../curves.ts';
import type { Pt } from '../geo.ts';
import { buildGraph, edgePoint } from '../graph.ts';
import type { KxData } from '../osm.ts';
import { railSegments } from '../scene.ts';

type Data = Pick<KxData, 'nodes' | 'rails'>;
const deg = (r: number): number => (r * 180) / Math.PI;

/** One way per point list; node ids numbered from `first`, a point reused by value reuses its id. */
function ways(...lists: Pt[][]): Data {
  const nodes: KxData['nodes'] = [];
  const ids = new Map<string, number>();
  const rails: KxData['rails'] = lists.map((pts, i) => ({
    id: 100 + i,
    nodes: pts.map((p) => {
      const key = `${p[0]},${p[1]}`;
      let id = ids.get(key);
      if (id === undefined) {
        id = nodes.length + 1;
        ids.set(key, id);
        nodes.push([id, p[0], p[1]]);
      }
      return id;
    }),
    service: 'main',
    tunnel: false,
    bridge: false,
    layer: 0,
  }));
  return { nodes, rails };
}

/** The drawn pieces as point pairs. */
function pieces(segments: number[]): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  for (let i = 0; i + 5 < segments.length; i += 6) out.push([[segments[i] as number, segments[i + 2] as number], [segments[i + 3] as number, segments[i + 5] as number]]);
  return out;
}

/** Distance from p to the nearest drawn piece. */
function offTrack(drawn: [Pt, Pt][], p: Pt): number {
  let best = Infinity;
  for (const [a, b] of drawn) {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz));
  }
  return best;
}

/** The angle (degrees) between two direction vectors. */
const between = (u: Pt, v: Pt): number => deg(Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))))));

/** The largest turn (degrees) from one piece to the next along a point list. */
function worstJoint(pts: Pt[]): number {
  let worst = 0;
  for (let i = 1; i + 1 < pts.length; i++) {
    const a = pts[i - 1] as Pt;
    const b = pts[i] as Pt;
    const c = pts[i + 1] as Pt;
    worst = Math.max(worst, between([b[0] - a[0], b[1] - a[1]], [c[0] - b[0], c[1] - b[1]]));
  }
  return worst;
}

/** The curve along a whole way, node to node. */
function along(data: Data, way = 0): Pt[] {
  const shapes = railShapes(data);
  const ids = (data.rails[way] as KxData['rails'][number]).nodes;
  const out: Pt[] = [];
  for (let i = 0; i + 1 < ids.length; i++) out.push(...(shapeFrom(shapes, ids[i] as number, ids[i + 1] as number) as Pt[]).slice(i ? 1 : 0));
  return out;
}

test('curves: a polyline round a circle becomes a curve within 2 cm of the circle, through every node, with no joint over a degree', () => {
  // R 300 m, nodes every 6 degrees (31 m chords): the chords sag 0.41 m inside the circle and turn 6 degrees at each node
  const R = 300;
  const pts: Pt[] = [];
  for (let k = 0; k <= 10; k++) pts.push([R * Math.sin((k * 6 * Math.PI) / 180), R - R * Math.cos((k * 6 * Math.PI) / 180)]);
  const data = ways(pts);
  assert.ok(worstJoint(pts) > 5.9, 'the polyline has its angles');
  const curve = along(data);
  for (const p of pts) assert.ok(curve.some((q) => q[0] === p[0] && q[1] === p[1]), `node ${p} is on the curve, exactly`);
  // between the end nodes (where the curve has only its own chord to go by) the curve is the circle
  const inner = curve.filter((p) => p[0] > (pts[1] as Pt)[0] && p[0] < (pts[9] as Pt)[0]);
  assert.ok(inner.length > 80, `${inner.length} points between the end nodes`);
  for (const p of inner) assert.ok(Math.abs(Math.hypot(p[0], p[1] - R) - R) < 0.02, `${p} is ${(Math.hypot(p[0], p[1] - R) - R).toFixed(3)} m off the circle`);
  assert.ok(worstJoint(curve) < 1, `worst joint ${worstJoint(curve).toFixed(2)} degrees`);
});

test('curves: a straight stays a straight piece, and a corner sharper than SMOOTH_TURN stays a corner', () => {
  const straight = ways([[0, 0], [0, -40], [0, -100]]);
  assert.deepEqual(along(straight), [[0, 0], [0, -40], [0, -100]], 'three nodes in a line: two pieces, nothing added');
  const a = SMOOTH_TURN + 0.05;
  const corner = ways([[0, 0], [0, -40], [40 * Math.sin(a), -40 - 40 * Math.cos(a)]]);
  assert.deepEqual(along(corner), corner.nodes.map(([, x, z]) => [x, z]), 'a corner is not rounded off');
});

test('curves: at a turnout the branch leaves along the through route, and the through route has no angle at the switch', () => {
  // through route: a straight north with a 2 degree bend at the switch node; the branch's chord leaves at 9 degrees
  const b = (2 * Math.PI) / 180;
  const switchNode: Pt = [0, -50];
  const through: Pt[] = [[0, 0], switchNode, [40 * Math.sin(b), -50 - 40 * Math.cos(b)]];
  const d = (9 * Math.PI) / 180;
  const branch: Pt[] = [switchNode, [30 * Math.sin(d), -50 - 30 * Math.cos(d)], [30 * Math.sin(d) + 10, -50 - 30 * Math.cos(d) - 40]];
  const data = ways(through, branch);
  const shapes = railShapes(data);
  const id = (p: Pt): number => (data.nodes.find(([, x, z]) => x === p[0] && z === p[1]) as KxData['nodes'][number])[0];
  const into = shapeFrom(shapes, id(through[0] as Pt), id(switchNode)) as Pt[];
  const on = shapeFrom(shapes, id(switchNode), id(through[2] as Pt)) as Pt[];
  const off = shapeFrom(shapes, id(switchNode), id(branch[1] as Pt)) as Pt[];
  const last = (s: Pt[]): Pt => [(s.at(-1) as Pt)[0] - (s.at(-2) as Pt)[0], (s.at(-1) as Pt)[1] - (s.at(-2) as Pt)[1]];
  const first = (s: Pt[]): Pt => [(s[1] as Pt)[0] - (s[0] as Pt)[0], (s[1] as Pt)[1] - (s[0] as Pt)[1]];
  assert.ok(between(last(into), first(on)) < 1, `through route turns ${between(last(into), first(on)).toFixed(2)} degrees at the switch (the chords: 2)`);
  assert.ok(between(last(into), first(off)) < 1.5, `the branch leaves at ${between(last(into), first(off)).toFixed(2)} degrees (its chord: 9)`);
  assert.ok(worstJoint(off) < 1, 'and curves away smoothly');
  // a branch beyond DIVERGE_TURN keeps its own chord
  const wide = DIVERGE_TURN + 0.05;
  const crossing = ways(through, [switchNode, [30 * Math.sin(wide), -50 - 30 * Math.cos(wide)]]);
  const cross = railShapes(crossing);
  const s = shapeFrom(cross, 2, 4) as Pt[];
  assert.equal(s.length, 2, 'a sharp branch is drawn as its chord');
});

test('curves: edgePoint on a curved graph is on the drawn pieces at every t, both ways round, and on the chord without curves', () => {
  const R = 200;
  const pts: Pt[] = [];
  for (let k = 0; k <= 8; k++) pts.push([R * Math.sin((k * 8 * Math.PI) / 180), R - R * Math.cos((k * 8 * Math.PI) / 180)]);
  const data = ways(pts, [pts[3] as Pt, [(pts[3] as Pt)[0] + 30, (pts[3] as Pt)[1] + 12]]);
  const drawn = pieces(railSegments(data, railShapes(data)).main);
  const curved = buildGraph(data, { curves: true });
  const straight = buildGraph(data);
  let chordOff = 0;
  for (const e of curved.edges) {
    for (let k = 0; k <= 20; k++) {
      const t = k / 20;
      const p = edgePoint(curved, e, t);
      assert.ok(offTrack(drawn, p.point) < 1e-9, `edge ${e.a}-${e.b} at t ${t} is ${offTrack(drawn, p.point)} m off the drawn track`);
      const back = edgePoint(curved, { a: e.b, b: e.a }, 1 - t);
      assert.ok(Math.hypot(back.point[0] - p.point[0], back.point[1] - p.point[1]) < 1e-9, 'the same point from the other end');
      assert.ok(Math.abs(back.dir[0] + p.dir[0]) < 1e-9 && Math.abs(back.dir[1] + p.dir[1]) < 1e-9, 'facing the other way');
      assert.ok(Math.abs(Math.hypot(...p.dir) - 1) < 1e-9, 'a unit direction');
      chordOff = Math.max(chordOff, offTrack(drawn, edgePoint(straight, e, t).point));
    }
    const a = curved.pos.get(e.a) as Pt;
    const b = curved.pos.get(e.b) as Pt;
    assert.deepEqual(edgePoint(curved, e, 0).point, a, 't 0 is the node');
    assert.deepEqual(edgePoint(curved, e, 1).point, b, 't 1 is the node');
    const mid = edgePoint(straight, e, 0.5).point;
    assert.deepEqual(mid, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 'without curves, the chord');
  }
  assert.ok(chordOff > 0.3, `a train on the chords would be ${chordOff.toFixed(2)} m off the drawn rails`);
  assert.equal(straight.shapes, undefined);
});

test('curves: on the real extract every segment has a curve, every node stays put, and no joint where a track runs on turns over 1.5 degrees', () => {
  const data: KxData = JSON.parse(readFileSync(new URL('../../web/src/data/kx-track.json', import.meta.url), 'utf8'));
  const shapes = railShapes(data);
  const g = buildGraph(data);
  const pos = new Map(data.nodes.map(([id, x, z]) => [id, [x, z] as Pt]));
  let worst = 0;
  for (const e of g.edges) {
    const s = shapeFrom(shapes, e.a, e.b);
    assert.ok(s, `edge ${e.a}-${e.b} has a curve`);
    assert.deepEqual(s[0], pos.get(e.a));
    assert.deepEqual(s.at(-1), pos.get(e.b));
    worst = Math.max(worst, worstJoint(s));
  }
  assert.ok(worst < 1.5, `a joint inside a segment turns ${worst.toFixed(2)} degrees`);
  assert.ok(STEP_TURN <= (0.5 * Math.PI) / 180);
});
