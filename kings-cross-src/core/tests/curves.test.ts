// The smooth track (core/curves.ts): a curve through every OSM node with no angle where a track runs
// on, straights left straight, a turnout's branch leaving along its through route, and the graph's
// edgePoint() reading a train's position off exactly the pieces railSegments() draws.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DIVERGE_TURN, FAIR_LENGTH, FAIR_MAX_SHIFT, FAIR_MIN_SHIFT, fairNodes, fairRun, plainRuns, railNeighbours, railShapes, shapeFrom, shapeKey, SMOOTH_TURN, STEP_TURN } from '../curves.ts';
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

test('curves: on the real extract every segment has a curve, every node is where the fairing puts it, and no joint where a track runs on turns over 1.5 degrees', () => {
  const data: KxData = JSON.parse(readFileSync(new URL('../../web/src/data/kx-track.json', import.meta.url), 'utf8'));
  const shapes = railShapes(data);
  const g = buildGraph(data);
  const pos = fairNodes(data);
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

// ---- fairing ----------------------------------------------------------------------------------

/** How far p is from the line through a and b. */
const offLine = (p: Pt, a: Pt, b: Pt): number => Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / Math.hypot(b[0] - a[0], b[1] - a[1]);

test('fairing: a straight whose nodes wander 0.3 m either side is drawn straight, the ends exactly where they were', () => {
  const o: Pt[] = [];
  for (let k = 0; k <= 25; k++) o.push([k === 0 || k === 25 ? 0 : (k % 2 ? 0.3 : -0.3) * (k % 3 ? 1 : 0.5), -8 * k]);
  const f = fairRun(o);
  assert.deepEqual(f[0], o[0]);
  assert.deepEqual(f.at(-1), o.at(-1));
  const worst = Math.max(...f.map((p) => offLine(p, o[0] as Pt, o.at(-1) as Pt)));
  assert.ok(worst < 0.06, `a faired node is ${worst.toFixed(3)} m off the straight (OSM's: 0.3)`);
  // and on the graph: the run between two ends, drawn
  const curve = along(ways(o));
  const drawn = Math.max(...curve.map((p) => offLine(p, o[0] as Pt, o.at(-1) as Pt)));
  assert.ok(drawn < 0.06, `the drawn track is ${drawn.toFixed(3)} m off the straight`);
});

test('fairing: a curve keeps its alignment; with its nodes wandering it is faired back onto the circle, and a clean one does not move', () => {
  const R = 300;
  const on = (k: number): Pt => [R * Math.sin(k / 30), R - R * Math.cos(k / 30)]; // nodes 10 m apart
  const clean: Pt[] = [];
  const wobbly: Pt[] = [];
  for (let k = 0; k <= 20; k++) {
    const p = on(k);
    clean.push(p);
    const n = Math.hypot(p[0], p[1] - R);
    const off = k === 0 || k === 20 ? 0 : k % 2 ? 0.25 : -0.2;
    wobbly.push([p[0] + (off * p[0]) / n, p[1] + (off * (p[1] - R)) / n]);
  }
  const still = Math.max(...fairRun(clean).map((p, i) => Math.hypot(p[0] - (clean[i] as Pt)[0], p[1] - (clean[i] as Pt)[1])));
  assert.ok(still < 0.01, `a clean circle's node moves ${still.toFixed(4)} m`); // the change of direction of its curvature, 1/R^2: millimetres, and under FAIR_MIN_SHIFT
  const f = fairRun(wobbly);
  const worst = Math.max(...f.map((p) => Math.abs(Math.hypot(p[0], p[1] - R) - R)));
  assert.ok(worst < 0.06, `a faired node is ${worst.toFixed(3)} m off the circle (OSM's: 0.25)`);
  // the drawn curve: no S left in it
  const curve = along(ways(wobbly));
  const inner = curve.filter((p) => p[0] > (wobbly[2] as Pt)[0] && p[0] < (wobbly[18] as Pt)[0]);
  assert.ok(reversals(inner) < 0.2, `the drawn curve turns back by ${reversals(inner).toFixed(2)} degrees`);
});

test('fairing: junctions, corners and ends never move; a run under FAIR_MIN_SHIFT keeps OSM\'s nodes exactly; FAIR_LENGTH is the stated scale', () => {
  assert.equal(FAIR_LENGTH, 12);
  // a wobbly straight with a branch off its middle node: that node is a junction
  const main: Pt[] = [];
  for (let k = 0; k <= 12; k++) main.push([k === 0 || k === 6 || k === 12 ? 0 : k % 2 ? 0.3 : -0.3, -8 * k]);
  const data = ways(main, [main[6] as Pt, [6, -60], [12, -75]]);
  const f = fairNodes(data);
  const id = (p: Pt): number => (data.nodes.find(([, x, z]) => x === p[0] && z === p[1]) as KxData['nodes'][number])[0];
  for (const p of [main[0], main[6], main[12], [12, -75]] as Pt[]) assert.deepEqual(f.get(id(p)), p, `node ${p} stays`);
  assert.ok(Math.abs((f.get(id(main[3] as Pt)) as Pt)[0]) < 0.15, 'an interior node of a run is faired');
  // a corner (over SMOOTH_TURN) is held
  const a = SMOOTH_TURN + 0.1;
  const bent: Pt[] = [[0, 0], [0.2, -10], [0, -20], [0.2, -30], [0, -40]];
  for (let k = 1; k <= 4; k++) bent.push([10 * k * Math.sin(a), -40 - 10 * k * Math.cos(a)]);
  const cd = ways(bent);
  const cf = fairNodes(cd);
  assert.deepEqual(cf.get(5), [0, -40], 'the corner stays');
  assert.ok(Math.abs((cf.get(2) as Pt)[0]) < 0.15, 'and the wobble before it is faired as a run of its own');
  // under FAIR_MIN_SHIFT: exactly OSM's
  const tiny: Pt[] = [];
  for (let k = 0; k <= 10; k++) tiny.push([k === 0 || k === 10 ? 0 : k % 2 ? 0.02 : -0.02, -10 * k]);
  const td = ways(tiny);
  const tf = fairNodes(td);
  for (const [n, x, z] of td.nodes) assert.deepEqual(tf.get(n), [x, z], `node ${n} below FAIR_MIN_SHIFT (${FAIR_MIN_SHIFT} m) stays`);
  // over FAIR_MAX_SHIFT: a 3 m dogleg is an alignment, not a wobble, and is left as OSM has it
  const dog: Pt[] = [];
  for (let k = 0; k <= 10; k++) dog.push([k >= 4 && k <= 6 ? 3 : 0, -10 * k]);
  const dd = ways(dog);
  assert.ok(Math.max(...fairRun(dog).map((p, i) => Math.abs(p[0] - (dog[i] as Pt)[0]))) > FAIR_MAX_SHIFT, 'the fairing would move it further than FAIR_MAX_SHIFT');
  const df = fairNodes(dd);
  for (const [n, x, z] of dd.nodes) assert.deepEqual(df.get(n), [x, z], `node ${n} of a run over FAIR_MAX_SHIFT (${FAIR_MAX_SHIFT} m) stays`);
});

/**
 * The largest heading, in degrees, that the polyline turns and then turns back within a short
 * distance: of each pair of neighbouring bends that turn opposite ways (curvature over 1/3000 per
 * metre, read over 3 m, the bends at most 10 m apart), the smaller of the two turns. An S-wiggle
 * gives its own size; a curve between straights, or a curve that eases in, gives nothing.
 */
function reversals(pts: Pt[]): number {
  const ds = [0];
  for (let i = 1; i < pts.length; i++) ds.push((ds[i - 1] as number) + Math.hypot((pts[i] as Pt)[0] - (pts[i - 1] as Pt)[0], (pts[i] as Pt)[1] - (pts[i - 1] as Pt)[1]));
  const total = ds.at(-1) as number;
  let j = 0;
  const sm: Pt[] = [];
  for (let t = 0; t <= total; t += 1) {
    while (j + 2 < pts.length && (ds[j + 1] as number) < t) j++;
    const p = pts[j] as Pt;
    const q = pts[j + 1] as Pt;
    const f = (t - (ds[j] as number)) / ((ds[j + 1] as number) - (ds[j] as number) || 1);
    sm.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]);
  }
  const B = 3;
  const lobes: { s: number; e: number; sign: number; turn: number }[] = [];
  for (let c = B; c + B < sm.length; c++) {
    const a = sm[c - B] as Pt;
    const m = sm[c] as Pt;
    const b = sm[c + B] as Pt;
    let d = Math.atan2(b[1] - m[1], b[0] - m[0]) - Math.atan2(m[1] - a[1], m[0] - a[0]);
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const k = d / B;
    if (Math.abs(k) < 1 / 3000) continue;
    const last = lobes.at(-1);
    if (last && last.sign === Math.sign(k) && c - last.e <= 2) {
      last.e = c;
      last.turn += k;
    } else lobes.push({ s: c, e: c, sign: Math.sign(k), turn: k });
  }
  let worst = 0;
  for (let i = 0; i + 1 < lobes.length; i++) {
    const l = lobes[i] as (typeof lobes)[number];
    const m = lobes[i + 1] as (typeof lobes)[number];
    if (l.sign === -m.sign && m.s - l.e <= 10) worst = Math.max(worst, deg(Math.min(Math.abs(l.turn), Math.abs(m.turn))));
  }
  return worst;
}

/** The worst reversal (degrees) on the drawn surface track in a box, over every run of plain track's interior (its end segments take a junction's tangent). */
function worstReversal(data: KxData, box: { minX: number; maxX: number; minZ: number; maxZ: number }, shapes = railShapes(data)): { deg: number; runs: number } {
  const pos = new Map(data.nodes.map(([id, x, z]) => [id, [x, z] as Pt]));
  const tunnel = new Set<string>();
  for (const r of data.rails) if (r.tunnel) for (let i = 0; i + 1 < r.nodes.length; i++) tunnel.add(shapeKey(r.nodes[i] as number, r.nodes[i + 1] as number));
  const inBox = (p: Pt): boolean => p[0] >= box.minX && p[0] <= box.maxX && p[1] >= box.minZ && p[1] <= box.maxZ;
  let worst = 0;
  let runs = 0;
  for (const run of plainRuns(railNeighbours(data, pos))) {
    if (run.length < 4 || !run.some((n) => inBox(pos.get(n) as Pt))) continue;
    if (run.some((n, i) => i > 0 && tunnel.has(shapeKey(run[i - 1] as number, n)))) continue;
    const pts: Pt[] = [];
    for (let i = 1; i + 2 < run.length; i++) pts.push(...(shapeFrom(shapes, run[i] as number, run[i + 1] as number) as Pt[]).slice(pts.length ? 1 : 0));
    runs++;
    worst = Math.max(worst, reversals(pts.filter(inBox)));
  }
  return { deg: worst, runs };
}

test('fairing: on the real extract no surface track at King\'s Cross or St Pancras wiggles (turns and turns back) by over 1.5 degrees, and no node moves over FAIR_MAX_SHIFT', () => {
  // OSM's nodes made the curves wiggle by up to 2.97 degrees at King's Cross (OSM 1390691713, the road
  // north of platform 4, at about x 48, z -296) and 4.64 at St Pancras; faired, 0.69 and 1.17
  const data: KxData = JSON.parse(readFileSync(new URL('../../web/src/data/kx-track.json', import.meta.url), 'utf8'));
  const kx = worstReversal(data, { minX: -60, maxX: 160, minZ: -700, maxZ: 60 });
  const stp = worstReversal(data, { minX: -420, maxX: -40, minZ: -750, maxZ: 60 });
  assert.ok(kx.runs >= 8 && stp.runs >= 8, `${kx.runs} and ${stp.runs} runs measured`);
  assert.ok(kx.deg < 1.5, `King's Cross track turns back by ${kx.deg.toFixed(2)} degrees`);
  assert.ok(stp.deg < 1.5, `St Pancras track turns back by ${stp.deg.toFixed(2)} degrees`);
  const f = fairNodes(data);
  let worst = 0;
  for (const [id, x, z] of data.nodes) worst = Math.max(worst, Math.hypot((f.get(id) as Pt)[0] - x, (f.get(id) as Pt)[1] - z));
  assert.ok(worst > FAIR_MIN_SHIFT && worst <= FAIR_MAX_SHIFT, `the largest move is ${worst.toFixed(3)} m`);
});
