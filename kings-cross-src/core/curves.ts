// Smooth track: the curve each OSM rail segment is drawn on and the trains run on.
//
// OSM maps a curve as a polyline, so drawn as chords every node is a visible angle (up to 6 degrees
// in the station zone on the 2026 extract) and a turnout's diverging track leaves the through track
// at an angle. Here each segment between two nodes becomes a cubic Hermite curve from node to node,
// sampled into short straight pieces, with one tangent per node and route:
//   - the curve passes through every node: exactly where OSM put it, except where FAIRING (below)
//     has moved an interior node of a wobbly run of plain track;
//   - where a track runs on through a node (a node of degree two, or the straightest pair of
//     segments at a junction, turning by at most SMOOTH_TURN) both sides share one tangent,
//     the Catmull-Rom one (the direction from the previous node to the next), so the track
//     has no angle there;
//   - at a junction, a segment left over after the pairing (a turnout's diverging track) leaves
//     along the through route's tangent when it is within DIVERGE_TURN of it, so it peels away
//     on a curve instead of at an angle; otherwise, and at the end of a track, along its own chord;
//   - three nodes in a line give a straight tangent, so a straight stays straight.
// The pieces turn by at most STEP_TURN each, so a curve is a run of sub-degree joints.
//
// core/graph.ts carries these shapes (buildGraph(data, { curves: true })) and edgePoint() reads a
// train's position off them; core/scene.ts railSegments(data, shapes) draws the same pieces. Both
// call railShapes on the same data, so a train runs exactly on the drawn centre line.
//
// FAIRING. Some ways are traced node by node off aerial imagery, and their nodes wander a few
// tenths of a metre either side of the true alignment (OSM 1390691712 and 1390691713, the two
// roads north of platforms 3 and 4, by up to 0.24 m off a local fit, at 5 to 15 m spacing). A
// curve through every such node snakes: an S every few nodes, radii down to about 50 m on track
// that is straight or gently curved. So before the curves are built, every run of plain track (the
// nodes of degree two between two junctions or ends) is faired (fairNodes): its interior nodes move
// to the least-squares balance between staying put and a smooth curvature, the change of
// curvature penalised over FAIR_LENGTH. A straight or a circle has no change of curvature and
// does not move; a wobble a few nodes long does. Junction nodes, corners (a turn over SMOOTH_TURN)
// and the ends of tracks never move, and a run that would move by less than FAIR_MIN_SHIFT, or by
// more than FAIR_MAX_SHIFT, keeps its nodes exactly. railShapes builds its curves through the
// faired nodes; the graph's node positions (topology, routing, chord lengths) stay OSM's, so a
// position read at a faired node by edgePoint is up to FAIR_MAX_SHIFT from graph.pos there.
// On the 2026 extract: the worst turn-and-turn-back of the drawn surface track falls from 2.97 to
// 0.69 degrees at King's Cross and from 4.64 to 1.17 at St Pancras; 1134 of 1514 nodes move, by
// at most 0.43 m (core/tests/curves.test.ts).
//
// Left out: a real switch model (the diverging curve's radius comes from where OSM put the next
// node, not from a switch type), transition curves as such (the Hermite curve eases its curvature
// in and out, but is only tangent-continuous, not curvature-continuous at the nodes), and cant (the
// owner's ruling: the rails are flat).
import type { Pt } from './geo.ts';
import type { KxData } from './osm.ts';

/** A track runs on through a node when it turns there by at most this (radians); more is a corner. */
export const SMOOTH_TURN = (30 * Math.PI) / 180;
/** A turnout's diverging segment takes the through tangent when its chord is within this of it (radians). */
export const DIVERGE_TURN = (20 * Math.PI) / 180;
/** The most the curve turns over one sampled piece (radians). */
export const STEP_TURN = (0.5 * Math.PI) / 180;
/** The shortest sampled piece, metres. */
export const MIN_STEP = 0.05;
/**
 * The fairing's length scale, metres. ASSUMED. Lateral wobble with a wavelength under about
 * 2 pi FAIR_LENGTH (75 m) is removed; a curve's own shape is kept (its change of curvature is tiny).
 */
export const FAIR_LENGTH = 12;
/**
 * A run of track whose fairing would move no node by this much (metres) keeps its nodes exactly.
 * ASSUMED: half the 0.1 m to which the compact data rounds its coordinates, so below what it resolves.
 */
export const FAIR_MIN_SHIFT = 0.05;
/**
 * A run whose fairing would move a node further than this (metres) keeps its nodes exactly: that is
 * moving the alignment, not removing a wobble. ASSUMED: about a third of the 1.6 m between a rail
 * and a platform face. On the 2026 extract the largest move is 0.43 m.
 */
export const FAIR_MAX_SHIFT = 0.5;

/** One segment's curve: points from the lower node id to the higher, and each point's share (0..1) of the curve's length. */
export interface Shape {
  pts: Pt[];
  along: number[];
}

/** Curves keyed by shapeKey(a, b). */
export type RailShapes = Map<string, Shape>;

export const shapeKey = (a: number, b: number): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

const unit = (x: number, z: number): Pt => {
  const l = Math.hypot(x, z);
  return [x / l, z / l];
};

/**
 * The tangent at each end of each segment, pointing along the segment away from the node:
 * `tangents.get(node)?.get(neighbour)`.
 */
function nodeTangents(pos: Map<number, Pt>, neighbours: Map<number, Set<number>>): Map<number, Map<number, Pt>> {
  const out = new Map<number, Map<number, Pt>>();
  const cosSmooth = Math.cos(SMOOTH_TURN);
  const cosDiverge = Math.cos(DIVERGE_TURN);
  for (const [n, set] of neighbours) {
    const p = pos.get(n) as Pt;
    const ids = [...set];
    const dirs = ids.map((m) => {
      const q = pos.get(m) as Pt;
      return unit(q[0] - p[0], q[1] - p[1]);
    });
    // pair the segments that run on through the node, straightest first
    const pairs: [number, number, number][] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const straightness = -((dirs[i] as Pt)[0] * (dirs[j] as Pt)[0] + (dirs[i] as Pt)[1] * (dirs[j] as Pt)[1]);
        if (straightness >= cosSmooth) pairs.push([straightness, i, j]);
      }
    }
    pairs.sort((a, b) => b[0] - a[0]);
    const taken = ids.map(() => false);
    const through: Pt[] = [];
    const here = new Map<number, Pt>();
    for (const [, i, j] of pairs) {
      if (taken[i] || taken[j]) continue;
      taken[i] = taken[j] = true;
      const a = pos.get(ids[i] as number) as Pt;
      const b = pos.get(ids[j] as number) as Pt;
      const t = unit(b[0] - a[0], b[1] - a[1]); // Catmull-Rom: from one neighbour to the other
      through.push(t);
      here.set(ids[j] as number, t);
      here.set(ids[i] as number, [-t[0], -t[1]]);
    }
    ids.forEach((m, i) => {
      if (taken[i]) return;
      const d = dirs[i] as Pt;
      let best: Pt = d;
      let bestCos = cosDiverge;
      for (const t of through) {
        const c = d[0] * t[0] + d[1] * t[1];
        if (c >= bestCos) [best, bestCos] = [t, c];
        if (-c >= bestCos) [best, bestCos] = [[-t[0], -t[1]], -c];
      }
      here.set(m, best);
    });
    out.set(n, here);
  }
  return out;
}

/** The Hermite curve from p0 to p1 leaving along unit t0 and arriving along unit t1 (both in the direction of travel), sampled. */
export function hermitePoints(p0: Pt, p1: Pt, t0: Pt, t1: Pt): Pt[] {
  const dx = p1[0] - p0[0];
  const dz = p1[1] - p0[1];
  const l = Math.hypot(dx, dz);
  const at = (s: number): Pt => {
    const s2 = s * s;
    const s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1;
    const h10 = s3 - 2 * s2 + s;
    const h01 = -2 * s3 + 3 * s2;
    const h11 = s3 - s2;
    return [h00 * p0[0] + h10 * l * t0[0] + h01 * p1[0] + h11 * l * t1[0], h00 * p0[1] + h10 * l * t0[1] + h01 * p1[1] + h11 * l * t1[1]];
  };
  // the curve's direction at s (its derivative; l * t0 and l * t1 at the ends, never zero here)
  const heading = (s: number): Pt => {
    const s2 = s * s;
    const a = 6 * s2 - 6 * s;
    const b = (3 * s2 - 4 * s + 1) * l;
    const c = (3 * s2 - 2 * s) * l;
    return unit(a * p0[0] + b * t0[0] - a * p1[0] + c * t1[0], a * p0[1] + b * t0[1] - a * p1[1] + c * t1[1]);
  };
  // how far it has turned by each probe (an S turns both ways, and both count)
  const PROBE = 64;
  const turned = [0];
  let prev = heading(0);
  for (let k = 1; k <= PROBE; k++) {
    const d = heading(k / PROBE);
    turned.push((turned[k - 1] as number) + Math.acos(Math.max(-1, Math.min(1, prev[0] * d[0] + prev[1] * d[1]))));
    prev = d;
  }
  const turn = turned[PROBE] as number;
  const n = Math.max(1, Math.min(Math.ceil(turn / STEP_TURN), Math.floor(l / MIN_STEP)));
  // the points split the turn evenly, so each joint turns by about turn / n
  const pts: Pt[] = [p0];
  let k = 0;
  for (let j = 1; j < n; j++) {
    const goal = (j * turn) / n;
    while (k < PROBE - 1 && (turned[k + 1] as number) < goal) k++;
    const lo = turned[k] as number;
    const hi = turned[k + 1] as number;
    pts.push(at((k + (hi > lo ? (goal - lo) / (hi - lo) : 0)) / PROBE));
  }
  pts.push(p1);
  return pts;
}

/** Each point's share of the polyline's length. */
function shares(pts: Pt[]): number[] {
  const along = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot((pts[i] as Pt)[0] - (pts[i - 1] as Pt)[0], (pts[i] as Pt)[1] - (pts[i - 1] as Pt)[1]);
    along.push(total);
  }
  return along.map((a) => (total > 0 ? a / total : 0));
}

/** Each node's neighbours along the rails (a segment of zero length or to a missing node is left out). */
export function railNeighbours(data: Pick<KxData, 'rails'>, pos: Map<number, Pt>): Map<number, Set<number>> {
  const neighbours = new Map<number, Set<number>>();
  const link = (a: number, b: number): void => {
    const set = neighbours.get(a);
    if (set) set.add(b);
    else neighbours.set(a, new Set([b]));
  };
  for (const r of data.rails) {
    for (let i = 0; i + 1 < r.nodes.length; i++) {
      const a = r.nodes[i] as number;
      const b = r.nodes[i + 1] as number;
      const pa = pos.get(a);
      const pb = pos.get(b);
      if (!pa || !pb || a === b || (pa[0] === pb[0] && pa[1] === pb[1])) continue;
      link(a, b);
      link(b, a);
    }
  }
  return neighbours;
}

/** Each run of plain track: its node ids from a junction or end (a node not of degree two) to the next, both included. */
export function plainRuns(neighbours: Map<number, Set<number>>): number[][] {
  const runs: number[][] = [];
  const walked = new Set<string>();
  for (const [start, set] of neighbours) {
    if (set.size === 2) continue;
    for (const first of set) {
      if (walked.has(shapeKey(start, first))) continue;
      walked.add(shapeKey(start, first));
      const run = [start];
      let prev = start;
      let cur = first;
      for (;;) {
        run.push(cur);
        const here = neighbours.get(cur) as Set<number>;
        if (here.size !== 2 || cur === start) break;
        const next = [...here].find((m) => m !== prev) as number;
        walked.add(shapeKey(cur, next));
        prev = cur;
        cur = next;
      }
      runs.push(run);
    }
  }
  return runs;
}

/** Solve the symmetric positive definite system a x = b in place (Gaussian elimination, partial pivoting). */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs((a[r] as number[])[c] as number) > Math.abs((a[p] as number[])[c] as number)) p = r;
    [a[c], a[p]] = [a[p] as number[], a[c] as number[]];
    [b[c], b[p]] = [b[p] as number, b[c] as number];
    const row = a[c] as number[];
    for (let r = c + 1; r < n; r++) {
      const other = a[r] as number[];
      const f = (other[c] as number) / (row[c] as number);
      if (f === 0) continue;
      for (let k = c; k < n; k++) other[k] = (other[k] as number) - f * (row[k] as number);
      b[r] = (b[r] as number) - f * (b[c] as number);
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r] as number;
    for (let k = r + 1; k < n; k++) s -= ((a[r] as number[])[k] as number) * (x[k] as number);
    x[r] = s / ((a[r] as number[])[r] as number);
  }
  return x;
}

/**
 * One run of plain track, faired (see the header): the ends stay, each interior node i moves to the
 * minimum of  sum_i w_i |p_i - o_i|^2 + length^6 sum_j h_j |D3_j|^2,  where o is where OSM put it,
 * w_i its share of the run's length, D2 the curvature (the second divided difference at each
 * interior node, on OSM's spacing) and D3_j the change of D2 over the h_j metres between two interior
 * nodes. Fewer than two interior nodes: nothing to fair against, the run is returned as it is.
 */
export function fairRun(o: readonly Pt[], length = FAIR_LENGTH): Pt[] {
  const n = o.length;
  if (n < 4) return o.map((p) => [p[0], p[1]]);
  const h: number[] = [];
  for (let i = 0; i + 1 < n; i++) h.push(Math.hypot((o[i + 1] as Pt)[0] - (o[i] as Pt)[0], (o[i + 1] as Pt)[1] - (o[i] as Pt)[1]));
  // D2 at interior node i as weights on nodes i-1, i, i+1
  const d2 = (i: number): [number, number, number] => {
    const a = h[i - 1] as number;
    const b = h[i] as number;
    const lo = 2 / ((a + b) * a);
    const hi = 2 / ((a + b) * b);
    return [lo, -(lo + hi), hi];
  };
  // normal equations over all n nodes, then the ends are moved to the right-hand side
  const m: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const l6 = length ** 6;
  for (let i = 1; i + 1 < n; i++) (m[i] as number[])[i] = ((h[i - 1] as number) + (h[i] as number)) / 2;
  for (let i = 1; i + 2 < n; i++) {
    // D3 between interior nodes i and i+1: (D2_{i+1} - D2_i) / h_i, weighted by h_i
    const row = new Array<number>(n).fill(0);
    const [p, q, r] = d2(i);
    const [s, t, u] = d2(i + 1);
    const hi = h[i] as number;
    row[i - 1] = (row[i - 1] as number) - p / hi;
    row[i] = (row[i] as number) - q / hi + s / hi;
    row[i + 1] = (row[i + 1] as number) - r / hi + t / hi;
    row[i + 2] = (row[i + 2] as number) + u / hi;
    const w = l6 * hi;
    for (let a = i - 1; a <= i + 2; a++) for (let b = i - 1; b <= i + 2; b++) (m[a] as number[])[b] = ((m[a] as number[])[b] as number) + w * (row[a] as number) * (row[b] as number);
  }
  const out: Pt[] = o.map((p) => [p[0], p[1]]);
  for (const axis of [0, 1] as const) {
    const a: number[][] = [];
    const rhs: number[] = [];
    for (let i = 1; i + 1 < n; i++) {
      const mi = m[i] as number[];
      a.push(mi.slice(1, n - 1));
      rhs.push(((h[i - 1] as number) + (h[i] as number)) / 2 * (o[i] as Pt)[axis] - (mi[0] as number) * (o[0] as Pt)[axis] - (mi[n - 1] as number) * (o[n - 1] as Pt)[axis]);
    }
    const x = solve(a, rhs);
    for (let i = 1; i + 1 < n; i++) (out[i] as Pt)[axis] = x[i - 1] as number;
  }
  return out;
}

/** Every rail node's position after fairing (see the header): OSM's, except interior nodes of a wobbly run of plain track. */
export function fairNodes(data: Pick<KxData, 'nodes' | 'rails'>, length = FAIR_LENGTH): Map<number, Pt> {
  const pos = new Map<number, Pt>();
  for (const [id, x, z] of data.nodes) pos.set(id, [x, z]);
  const out = new Map(pos);
  const cosSmooth = Math.cos(SMOOTH_TURN);
  const pieces: number[][] = [];
  for (const whole of plainRuns(railNeighbours(data, pos))) {
    // a corner (a turn over SMOOTH_TURN, which railShapes keeps as a corner) is held like a junction
    let piece = [whole[0] as number];
    for (let i = 1; i < whole.length; i++) {
      piece.push(whole[i] as number);
      if (i + 1 === whole.length) break;
      const [a, b, c] = [pos.get(whole[i - 1] as number), pos.get(whole[i] as number), pos.get(whole[i + 1] as number)] as Pt[];
      const u = unit((b as Pt)[0] - (a as Pt)[0], (b as Pt)[1] - (a as Pt)[1]);
      const v = unit((c as Pt)[0] - (b as Pt)[0], (c as Pt)[1] - (b as Pt)[1]);
      if (u[0] * v[0] + u[1] * v[1] < cosSmooth) {
        pieces.push(piece);
        piece = [whole[i] as number];
      }
    }
    pieces.push(piece);
  }
  for (const run of pieces) {
    const o = run.map((id) => pos.get(id) as Pt);
    const faired = fairRun(o, length);
    let shift = 0;
    for (let i = 0; i < o.length; i++) shift = Math.max(shift, Math.hypot((faired[i] as Pt)[0] - (o[i] as Pt)[0], (faired[i] as Pt)[1] - (o[i] as Pt)[1]));
    if (shift < FAIR_MIN_SHIFT || shift > FAIR_MAX_SHIFT) continue;
    for (let i = 1; i + 1 < run.length; i++) out.set(run[i] as number, faired[i] as Pt);
  }
  return out;
}

/** The smooth curve of every rail segment in `data` (see the header), through the faired nodes. */
export function railShapes(data: Pick<KxData, 'nodes' | 'rails'>): RailShapes {
  const raw = new Map<number, Pt>();
  for (const [id, x, z] of data.nodes) raw.set(id, [x, z]);
  const neighbours = railNeighbours(data, raw);
  const pos = fairNodes(data);
  const tangents = nodeTangents(pos, neighbours);
  const shapes: RailShapes = new Map();
  for (const [a, set] of neighbours) {
    for (const b of set) {
      if (b < a) continue; // each segment once, from the lower id
      const t0 = tangents.get(a)?.get(b) as Pt;
      const back = tangents.get(b)?.get(a) as Pt;
      const pts = hermitePoints(pos.get(a) as Pt, pos.get(b) as Pt, t0, [-back[0], -back[1]]);
      shapes.set(shapeKey(a, b), { pts, along: shares(pts) });
    }
  }
  return shapes;
}

/** The curve from node a to node b, in that order (a copy), or undefined when there is none. */
export function shapeFrom(shapes: RailShapes, a: number, b: number): Pt[] | undefined {
  const s = shapes.get(shapeKey(a, b));
  if (!s) return undefined;
  return a < b ? [...s.pts] : [...s.pts].reverse();
}

/**
 * The point a share `t` (0..1) of the way along the curve from node a to node b, and the unit
 * direction of travel there (a to b).
 */
export function shapePoint(shape: Shape, a: number, b: number, t: number): { point: Pt; dir: Pt } {
  const { pts, along } = shape;
  const u = Math.max(0, Math.min(1, a < b ? t : 1 - t));
  let i = 0;
  while (i + 2 < pts.length && (along[i + 1] as number) < u) i++;
  const p = pts[i] as Pt;
  const q = pts[i + 1] as Pt;
  const span = (along[i + 1] as number) - (along[i] as number);
  const f = span > 0 ? (u - (along[i] as number)) / span : 0;
  const d = unit(q[0] - p[0], q[1] - p[1]);
  const sign = a < b ? 1 : -1;
  return { point: [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f], dir: [d[0] * sign, d[1] * sign] };
}
