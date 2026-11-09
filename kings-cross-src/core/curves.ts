// Smooth track: the curve each OSM rail segment is drawn on and the trains run on.
//
// OSM maps a curve as a polyline, so drawn as chords every node is a visible angle (up to 6 degrees
// in the station zone on the 2026 extract) and a turnout's diverging track leaves the through track
// at an angle. Here each segment between two nodes becomes a cubic Hermite curve from node to node,
// sampled into short straight pieces, with one tangent per node and route:
//   - every OSM node stays exactly where it is (the curve passes through it);
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

/** The smooth curve of every rail segment in `data` (see the header). */
export function railShapes(data: Pick<KxData, 'nodes' | 'rails'>): RailShapes {
  const pos = new Map<number, Pt>();
  for (const [id, x, z] of data.nodes) pos.set(id, [x, z]);
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
