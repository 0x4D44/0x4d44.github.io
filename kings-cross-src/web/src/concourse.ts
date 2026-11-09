// The Western Concourse: a diagrid roof against the Western Range, to OSM's roof boundary (Arup Journal 2/2012 pp.12-16: a cut shell, 138 m
// north-south). References (refs/western-concourse/): R-a conc-a-funnel-2012, conc-ab-funnel-brick-2025; R-b conc-b-roof-meets-range-2025-08;
// R-c conc-c-exterior-square-2016, conc-c2-dome-aerial-2016. PUBLISHED: 15 % glazed, 1,012 panels "at the perimeter and towards the funnel"
// (refs/DIMENSIONS.md s.2); ribs 150 mm wide, 250-450 mm deep, diagonals 139-219 mm (Arup pp.13-16). Other values are ASSUMED where labelled.
import * as THREE from 'three';
import { concourseHeight, pointInPolygon, shedToWorld, worldToShed } from '../../core/station.ts';
import type { ConcourseCanopy, ShedLayout } from '../../core/station.ts';
import type { Pt } from '../../core/geo.ts';
import { Batch, rgb, rng, texture } from './materials.ts';
import type { Rgb, V2, V3 } from './materials.ts';
import { WESTERN_RANGE } from './shed.ts';

/** Funnel head radius, where the lattice starts, metres (ASSUMED). */
export const FUNNEL_RADIUS = 5.4;
/** Target ring spacing and edge length, metres (ASSUMED). */
export const EDGE = 4.5;
const RIB_WIDTH = 0.15; // Arup pp.13–16: typical fabricated radial ribs are 150 mm wide.
const TUBE_SIDES = 8; // ASSUMED exterior approximation; no unsourced wall thickness/bore.
/** Build-up above the member centre lines, metres (ASSUMED, R-a conc-ab): soffit 0.12, skin 0.45. */
export const SOFFIT_LIFT = 0.12;
export const SKIN_LIFT = 0.45;
/** A cladding diamond's bulge at its middle (ASSUMED, R-c2: two tones to a diamond). */
export const FACET_RISE = 0.1;
/** Glazed zones (published 15 %; ASSUMED widths tuned to it): within 11 m of the funnel axis (R-a), within 4.6 m of the outline (R-c2). */
export const FUNNEL_GLAZING_RADIUS = 11;
export const RIM_GLAZING_WIDTH = 4.6;
/** Published glazed share and the band the rubric accepts. */
export const GLAZED_SHARE = { published: 0.15, tolerance: 0.05 } as const;
/** Rooflights (R-c, R-c2; ASSUMED): 34 m from the axis, every 20 degrees from 20 to 80 south of west, half-diagonals 3.2 m up the slope, 5 m across. */
export const ROOFLIGHT_RADIUS = 34;
export const ROOFLIGHT_AZIMUTHS = [20, 40, 60, 80] as const;
export const ROOFLIGHT_HALF = { along: 3.2, across: 5 } as const;
/** Roof edge fascia (R-c: a thin bright band): rim height up to the skin, on the outline, so the 138 m extent is the cells'. */
export const FASCIA_BOTTOM = 0;
/** Wall framing, metres (ASSUMED, R-c): a post at each rim node, two bars along each edge, a transom at this share of the height. */
export const MULLION = { post: 0.12, bar: 0.07, transom: 0.55 } as const;
/** The wall stands this far inside the outline under the glass brim, on white V struts (R-c, R-c2; ASSUMED). */
export const WALL_INSET = 3;
export const STRUT_DIAMETER = 0.14;
/** u of the roof's cut plane (0.3 m in front of the Range's face) and the top of its cornice. */
export const WEST_WALL = -WESTERN_RANGE.depth - 0.3;
export const CORNICE_TOP = WESTERN_RANGE.storey * WESTERN_RANGE.storeys + 0.5;
/** Perimeter tree columns: 16, "12 m apart and 52.1 m from the centre of the funnel" (Arup 2/2012 p16), facing west; drawn under the roof only, 3 m in and clear of other buildings. ASSUMED: sizes, fork 2.4 m under the roof. */
export const TREES = { count: 16, spacing: 12, radius: 52.1, trunk: 0.6, branch: 0.3, fork: 2.4, edgeClear: 3 } as const;
export function treeSites(shed: ShedLayout, centre: Pt): Pt[] {
  const f = worldToShed(shed, centre), step = 2 * Math.asin(TREES.spacing / (2 * TREES.radius));
  return Array.from({ length: TREES.count }, (_, k) => shedToWorld(shed, f.u - TREES.radius * Math.cos((k - 7.5) * step), f.v + TREES.radius * Math.sin((k - 7.5) * step)));
}

export interface Diagrid {
  /** node positions in world x, z (metres) with the radius from the column */
  nodes: { x: number; z: number; r: number; ring: number; height?: number }[];
  /** triangles as node indices */
  tris: [number, number, number][];
  rings: number;
}

/** The lattice before clipping: rings of nodes from the funnel to the rim, stitched by a two-pointer sweep, odd rings turned half a step. */
export function diagrid(radius: number, centre: Pt, spacing = EDGE): Diagrid {
  const rings = Math.max(2, Math.round((radius - FUNNEL_RADIUS) / spacing));
  const dr = (radius - FUNNEL_RADIUS) / rings;
  const counts: number[] = [];
  const nodes: Diagrid['nodes'] = [];
  const first: number[] = [];
  for (let k = 0; k <= rings; k++) {
    const r = FUNNEL_RADIUS + k * dr;
    const n = Math.max(12, 6 * Math.round((2 * Math.PI * r) / (6 * spacing)));
    counts.push(n);
    first.push(nodes.length);
    const turn = (k % 2) * (Math.PI / n);
    for (let i = 0; i < n; i++) {
      const a = turn + (2 * Math.PI * i) / n;
      nodes.push({ x: centre[0] + r * Math.cos(a), z: centre[1] + r * Math.sin(a), r, ring: k });
    }
  }
  const tris: [number, number, number][] = [];
  for (let k = 0; k < rings; k++) {
    const n = counts[k] as number;
    const m = counts[k + 1] as number;
    const turnA = (k % 2) * (Math.PI / n);
    const turnB = ((k + 1) % 2) * (Math.PI / m);
    // Both rings as unwrapped angle sequences; each step takes the next node (inner or outer) of smaller angle.
    const j0 = Math.round(((turnA - turnB) * m) / (2 * Math.PI));
    const startB = turnB + (2 * Math.PI * j0) / m;
    const angA = (i: number): number => turnA + (2 * Math.PI * i) / n;
    const angB = (j: number): number => startB + (2 * Math.PI * j) / m;
    const outerNode = (j: number): number => (first[k + 1] as number) + ((((j0 + j) % m) + m) % m);
    let i = 0;
    let j = 0;
    for (let s = 0; s < n + m; s++) {
      const a = (first[k] as number) + (i % n);
      const b = outerNode(j);
      if (angA(i + 1) <= angB(j + 1)) {
        tris.push([a, b, (first[k] as number) + ((i + 1) % n)]);
        i++;
      } else {
        tris.push([a, b, outerNode(j + 1)]);
        j++;
      }
    }
  }
  return { nodes, tris, rings };
}

/** An undirected edge, the triangles (indices) sharing it, and how many. */
interface Edge { a: number; b: number; uses: number; cells: number[] }
/** Undirected edges of a set of triangles, once each, keyed `a:b`. */
export function edgesOf(tris: [number, number, number][]): Map<string, Edge> {
  const out = new Map<string, Edge>();
  tris.forEach((t, i) => {
    for (let e = 0; e < 3; e++) {
      const p = t[e] as number, q = t[(e + 1) % 3] as number, a = Math.min(p, q), b = Math.max(p, q), key = `${a}:${b}`;
      const found = out.get(key) ?? { a, b, uses: 0, cells: [] };
      found.uses++;
      found.cells.push(i);
      out.set(key, found);
    }
  });
  return out;
}

// Arup pp.13-16: radial box ribs, axial tubes. ASSUMED: each inner node's nearest angular link outward is a rib.
function roofRibs(edges: Map<string, Edge>, nodes: Diagrid['nodes'], centre: Pt): Set<string> {
  const nearest = new Map<number, {key:string;delta:number}>();
  const angle = (i:number): number => Math.atan2(nodes[i]!.z-centre[1], nodes[i]!.x-centre[0]);
  for (const {a,b} of edges.values()) {
    const na=nodes[a]!, nb=nodes[b]!;
    if (Math.abs(na.ring-nb.ring)!==1 || na.ring<0 || nb.ring<0) continue;
    const inner=na.ring<nb.ring?a:b, outer=inner===a?b:a;
    const raw=Math.abs(angle(inner)-angle(outer)), delta=Math.min(raw,2*Math.PI-raw), key=`${a}:${b}`;
    if (delta < (nearest.get(inner)?.delta ?? Infinity)) nearest.set(inner,{key,delta});
  }
  return new Set([...nearest.values()].map(v=>v.key));
}

/** A round member between two points, each end overrunning 0.05 m for the joint (ASSUMED, as the box members' 0.1 m). */
function roundMember(batch: Batch, p: V3, q: V3, diameter: number): void {
  const t = unit([q[0] - p[0], q[1] - p[1], q[2] - p[2]]), r = diameter / 2, end = (e: V3, k: number): V3 => [e[0] + k * t[0], e[1] + k * t[1], e[2] + k * t[2]];
  tube(batch, [{ p: end(p, -0.05), t, r }, { p: end(q, 0.05), t, r }]);
}

/** A round tube through rings of {point, tangent, radius}; a ring's frame comes from its tangent alone, so tubes meeting at a ring share it (no seam). */
function tube(batch: Batch, rings: readonly { p: V3; t: V3; r: number }[], clamp?: readonly [number, number]): void {
  const verts = rings.map(({ p, t, r }) => {
    let u: V3 = [-t[0] * t[1], 1 - t[1] * t[1], -t[2] * t[1]];
    const l = Math.hypot(...u);
    u = l < 1e-6 ? [1, 0, 0] : [u[0] / l, u[1] / l, u[2] / l];
    const v: V3 = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
    return Array.from({ length: TUBE_SIDES }, (_, j) => {
      const c = Math.cos((j * 2 * Math.PI) / TUBE_SIDES), s = Math.sin((j * 2 * Math.PI) / TUBE_SIDES), n: V3 = [c * u[0] + s * v[0], c * u[1] + s * v[1], c * u[2] + s * v[2]];
      return { n, p: [p[0] + r * n[0], clamp ? Math.min(clamp[1], Math.max(clamp[0], p[1] + r * n[1])) : p[1] + r * n[1], p[2] + r * n[2]] as V3 };
    });
  });
  for (let k = 0; k + 1 < verts.length; k++) for (let j = 0; j < TUBE_SIDES; j++) {
    const a = verts[k]![j]!, b = verts[k]![(j + 1) % TUBE_SIDES]!, c = verts[k + 1]![(j + 1) % TUBE_SIDES]!, d = verts[k + 1]![j]!;
    batch.poly([a.p, b.p, c.p, d.p], undefined, { normals: [a.n, b.n, c.n, d.n] });
  }
}

/** The lattice triangles that are built: inside the OSM footprint, outside the shed and the Range. */
export function keepTriangles(d: Diagrid, footprint: Pt[], shed: Pick<ShedLayout, 'origin' | 'heading' | 'width' | 'length'>): [number, number, number][] {
  const { depth, v0, v1 } = WESTERN_RANGE;
  return d.tris.filter((t) => {
    const p = t.map((i) => d.nodes[i] as Diagrid['nodes'][number]);
    const c: Pt = [(p[0]!.x + p[1]!.x + p[2]!.x) / 3, (p[0]!.z + p[1]!.z + p[2]!.z) / 3];
    const { u, v } = worldToShed(shed, c);
    const inShed = u > -1 && u < shed.width + 1 && v > -1 && v < shed.length + 1;
    const inRange = u > -depth - 0.3 && v > v0 - 1 && v < v1 + 1;
    return !inShed && !inRange && pointInPolygon(c, footprint);
  });
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
/** Distance from p to the segment a-b. */
function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz, t = l ? clamp01(((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

// Reach of a radial box: half depth + half width + 50 mm joint.
const MEMBER_REACH = 0.45 / 2 + RIB_WIDTH / 2 + 0.05;
function cellMeetsBuilding(triangle: Pt[], polygon: Pt[]): boolean {
  if (triangle.some(p => pointInPolygon(p, polygon)) || polygon.some(p => pointInPolygon(p, triangle))) return true;
  const cross = (a: Pt, b: Pt, p: Pt): number => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  for (let i = 0; i < triangle.length; i++) for (let j = 0; j < polygon.length; j++) {
    const a = triangle[i]!, b = triangle[(i + 1) % triangle.length]!, c = polygon[j]!, d = polygon[(j + 1) % polygon.length]!;
    if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return true;
    if (Math.min(segmentDistance(a, c, d), segmentDistance(b, c, d), segmentDistance(c, a, b), segmentDistance(d, a, b)) <= MEMBER_REACH) return true;
  }
  return false;
}

/** The northern limit of the concourse in shed v: where the OSM station outline turns into the suburban roof. */
function concourseNorth(footprint: Pt[], shed: Pick<ShedLayout, 'origin' | 'heading'>): number {
  const arc = footprint.map(p => worldToShed(shed, p)).filter(p => p.u < -45 && p.v <= WESTERN_RANGE.v1 + .1);
  if (arc.length < 3) throw new Error('the OSM concourse boundary is needed to build its roof');
  return Math.max(...arc.map(p => p.v));
}

/** Plan distance to the roof's outer limit (the OSM outline or the northern limit; not the Range cut). */
function rimDistance(shed: Pick<ShedLayout, 'origin' | 'heading'>, footprint: Pt[], north: number, x: number, z: number): number {
  const here: Pt = [x, z];
  let toRim = Math.max(0, north - worldToShed(shed, here).v);
  for (let i = 0; i < footprint.length; i++) toRim = Math.min(toRim, segmentDistance(here, footprint[i]!, footprint[(i + 1) % footprint.length]!));
  return toRim;
}

export function concourseGrid(canopy: ConcourseCanopy, footprint: Pt[], shed: ShedLayout, exclusions: Pt[][] = []): { centre: Pt; grid: Diagrid } {
  const local = footprint.map(p => worldToShed(shed, p));
  const north = concourseNorth(footprint, shed);
  const westWall = WEST_WALL;
  const south = Math.min(...local.filter(p => p.u < westWall && p.v <= north).map(p => p.v));
  // JMP: the funnel beside the façade (mcaslan.agencyprojects.com/Kings-Cross-Station); ASSUMED centred along the roof extent, 0.3 m from it.
  const centreUV = { u: westWall - FUNNEL_RADIUS, v: (south + north) / 2 };
  const centre = shedToWorld(shed, centreUV.u, centreUV.v);
  // More boundary samples retain the small OSM steps/canopies instead of cutting their corners.
  const grid = diagrid(canopy.radius, centre, EDGE * .6);
  const cross = (ax: number, az: number, bx: number, bz: number): number => ax * bz - az * bx;
  for (const n of grid.nodes) {
    const dx = (n.x - centre[0]) / n.r, dz = (n.z - centre[1]) / n.r;
    const dv = dx * Math.sin(shed.heading) - dz * Math.cos(shed.heading);
    let rim = dv > 0 ? (north - centreUV.v) / dv : Infinity;
    for (let i = 0; i < footprint.length; i++) {
      const a = footprint[i]!, b = footprint[(i + 1) % footprint.length]!;
      const ex = b[0] - a[0], ez = b[1] - a[1], det = cross(dx, dz, ex, ez);
      if (Math.abs(det) < 1e-10) continue;
      const ax = a[0] - centre[0], az = a[1] - centre[1];
      const distance = cross(ax, az, ex, ez) / det, t = cross(ax, az, dx, dz) / det;
      if (distance > 0 && t >= 0 && t <= 1) rim = Math.min(rim, distance);
    }
    n.r = FUNNEL_RADIUS + (Math.max(FUNNEL_RADIUS, rim) - FUNNEL_RADIUS) * (n.r - FUNNEL_RADIUS) / (canopy.radius - FUNNEL_RADIUS);
    n.x = centre[0] + dx * n.r;
    n.z = centre[1] + dz * n.r;
  }
  // The façade is a CUT through the shell: clip the faces to it (squeezing rings onto the wall folds them).
  const triangles: Diagrid['tris'] = [];
  const uAt = (i: number): number => worldToShed(shed, [grid.nodes[i]!.x, grid.nodes[i]!.z]).u;
  const cutNodes = new Map<string, number>();
  for (const tri of grid.tris) {
    const polygon: number[] = [];
    for (let i = 0; i < 3; i++) {
      const a = tri[i]!, b = tri[(i + 1) % 3]!, au = uAt(a), bu = uAt(b);
      if (au <= westWall) polygon.push(a);
      if ((au <= westWall) === (bu <= westWall)) continue;
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      let cut = cutNodes.get(key);
      if (cut === undefined) {
        const t = (westWall - au) / (bu - au), na = grid.nodes[a]!, nb = grid.nodes[b]!;
        const x = na.x + t * (nb.x - na.x), z = na.z + t * (nb.z - na.z);
        cut = grid.nodes.length;
        grid.nodes.push({ x, z, r: Math.hypot(x - centre[0], z - centre[1]), ring: -1 });
        cutNodes.set(key, cut);
      }
      polygon.push(cut);
    }
    for (let i = 1; i + 1 < polygon.length; i++) triangles.push([polygon[0]!, polygon[i]!, polygon[i + 1]!]);
  }
  grid.tris = triangles.filter(t => {
    const a = grid.nodes[t[0]]!, b = grid.nodes[t[1]]!, c = grid.nodes[t[2]]!;
    return Math.abs(cross(b.x - a.x, b.z - a.z, c.x - a.x, c.z - a.z)) > 1e-8;
  });
  for (const n of grid.nodes) {
    // Distance to the OUTER boundary: a smooth fall to the rim despite the OSM steps (the façade cut is not a rim).
    const toRim = rimDistance(shed, footprint, north, n.x, n.z);
    n.height = concourseHeight(canopy, canopy.radius * n.r / (n.r + toRim));
  }
  // OSM buildings are distinct domains: exclude crossing cells, member sections included.
  grid.tris = grid.tris.filter(t => !exclusions.some(polygon =>
    cellMeetsBuilding(t.map(i => [grid.nodes[i]!.x, grid.nodes[i]!.z] as Pt), polygon)));
  return { centre, grid };
}

// The funnel (R-a, conc-ab, conc-b: a dozen thick white legs, about 4 m across at the floor, a trumpet under the glass, crossing in tall diamonds, no collars; R3: 20 m).
// ASSUMED (scaled by 1.7 m people): 12 legs forking to 24, 0.36 m through at the foot, 0.22 m at the roof.
/** The roof grid ring the legs land on, one leg to each node. */
export const FUNNEL_HEAD_RING = 2;
/** The Range side stands straight against the brick (conc-ab), clear of the cornice. */
export const FUNNEL_REACH = FUNNEL_RADIUS - 0.6;
/** Rings of legs under the head: height share, leg count (the head has the roof ring's). */
const COLUMN_RINGS = [[0, 12], [0.06, 12], [0.17, 12], [0.29, 12], [0.41, 12], [0.53, 12], [0.65, 18], [0.75, 18], [0.84, 18], [0.92, 24]] as const;
/** Radius of a ring at share t of the head's height: feet 1.85 m out, splayed 0.25 m, a cone, then a bell. */
export const columnRadius = (t: number, mouth: number): number => 1.85 + (mouth - 1.85) * (0.3 * t + 0.7 * t ** 3) + (t ? 0 : 0.25);
/** Diameter of a leg at this height, metres: 0.36 at the floor, 0.22 under the roof (ASSUMED, conc-ab). */
export function columnTubeDiameter(y: number, top: number): number {
  return 0.36 - 0.14 * clamp01(y / top);
}

/** The legs as a graph in the funnel's frame (x = u, z = -v); each node links to the two nearest below, rings half a step apart. */
export function columnMembers(head: V3[]): { nodes: V3[]; edges: [number, number][] } {
  const nodes: V3[] = [], edges: [number, number][] = [], rings: readonly (readonly [number, number])[] = [...COLUMN_RINGS, [1, head.length]];
  const mouth = Math.min(...head.map(p => Math.hypot(p[0], p[2]))), top = head.reduce((s, p) => s + p[1], 0) / head.length;
  const turn = Math.atan2(head[0]![2], head[0]![0]);
  let below: { index: number; angle: number }[] = [];
  rings.forEach(([t, count], k) => {
    const here: typeof below = [], last = k === rings.length - 1;
    for (let i = 0; i < count; i++) {
      const angle = turn + ((i + ((rings.length - 1 - k) % 2) * 0.5) * 2 * Math.PI) / count, r = columnRadius(t, mouth);
      const p: V3 = last ? [...head[i]!] : [r * Math.cos(angle), t * top, r * Math.sin(angle)];
      here.push({ index: nodes.length, angle: last ? Math.atan2(p[2], p[0]) : angle });
      p[0] = Math.min(p[0], FUNNEL_REACH);
      nodes.push(p);
      const apart = (a: number): number => { const d = Math.abs(a - here[i]!.angle) % (2 * Math.PI); return Math.min(d, 2 * Math.PI - d); };
      for (const a of [...below].sort((a, b) => apart(a.angle) - apart(b.angle) || a.index - b.index).slice(0, 2)) edges.push([a.index, nodes.length - 1]);
    }
    below = here;
  });
  return { nodes, edges };
}

/** The roof ring the legs land on, in the funnel's frame (x = u, z = -v from its axis). */
export function funnelHead(grid: Diagrid, centre: Pt, shed: ShedLayout): V3[] {
  const axis = worldToShed(shed, centre);
  return grid.nodes.filter(n => n.ring === FUNNEL_HEAD_RING).map((n): V3 => { const s = worldToShed(shed, [n.x, n.z]); return [s.u - axis.u, n.height!, axis.v - s.v]; });
}

/** Straight tubes a leg is drawn in between two nodes, along a smooth curve. */
export const COLUMN_SEGMENTS = 3;
const sum = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const unit = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Each leg a Hermite curve (conc-ab: long, no collars) sharing end tangents with the leg it continues into: no kink; upright at the floor, flat into the roof. */
export function columnLegs(head: V3[]): { pts: V3[]; tans: V3[] }[] {
  const { nodes, edges } = columnMembers(head);
  const dirs = edges.map(([a, b]) => unit([nodes[b]![0] - nodes[a]![0], nodes[b]![1] - nodes[a]![1], nodes[b]![2] - nodes[a]![2]]));
  const dot = (i: number, j: number): number => dirs[i]![0] * dirs[j]![0] + dirs[i]![1] * dirs[j]![1] + dirs[i]![2] * dirs[j]![2];
  const ends = edges.map((_, e): [V3, V3] => [dirs[e]!, dirs[e]!]); // tangent at an edge's lower and upper node
  nodes.forEach((p, n) => {
    const ins = edges.flatMap(([, b], e) => (b === n ? [e] : [])), outs = edges.flatMap(([a], e) => (a === n ? [e] : [])), used = new Set<number>();
    for (const [i, o] of ins.flatMap(i => outs.map(o => [i, o] as const)).sort((x, y) => dot(y[0], y[1]) - dot(x[0], x[1]))) {
      if (used.has(i) || used.has(o)) continue;
      used.add(i).add(o);
      ends[i]![1] = ends[o]![0] = unit(sum(dirs[i]!, dirs[o]!));
    }
    if (!ins.length) for (const o of outs) ends[o]![0] = unit(sum(dirs[o]!, [0, 2, 0]));
    else if (!outs.length && p[0] < FUNNEL_REACH) for (const i of ins) { const o = unit([p[0], 0, p[2]]); ends[i]![1] = unit(sum(dirs[i]!, [2 * o[0], 0, 2 * o[2]])); }
  });
  return edges.map(([a, b], e) => {
    const P = nodes[a]!, Q = nodes[b]!, L = Math.hypot(Q[0] - P[0], Q[1] - P[1], Q[2] - P[2]), [t0, t1] = ends[e]!;
    const at = (s: number, deriv: boolean): V3 => {
      const s2 = s * s, s3 = s2 * s;
      const h = deriv ? [6 * s2 - 6 * s, 3 * s2 - 4 * s + 1, 6 * s - 6 * s2, 3 * s2 - 2 * s] : [2 * s3 - 3 * s2 + 1, s3 - 2 * s2 + s, 3 * s2 - 2 * s3, s3 - s2];
      return [0, 1, 2].map(c => h[0]! * P[c]! + h[1]! * L * t0[c]! + h[2]! * Q[c]! + h[3]! * L * t1[c]!) as V3;
    };
    const ks = Array.from({ length: COLUMN_SEGMENTS + 1 }, (_, k) => k / COLUMN_SEGMENTS);
    return { pts: ks.map(s => at(s, false)), tans: ks.map(s => unit(at(s, true))) };
  });
}

function columnGeometry(head: V3[]): THREE.BufferGeometry {
  const batch = new Batch(), top = head.reduce((s, p) => s + p[1], 0) / head.length;
  for (const { pts, tans } of columnLegs(head)) tube(batch, pts.map((p, k) => ({ p, t: tans[k]!, r: columnTubeDiameter(p[1], top) / 2 })), [0, 99]);
  return batch.build();
}

// Roof materials, local (materials.ts has no soffit, cladding or daylit glazing).

/** A canvas texture drawn by `draw`, which gets the context and a rectangle fill; null in Node. */
type Fill = (style: string | CanvasGradient, x: number, y: number, w: number, h: number) => void;
function canvasTexture(width: number, height: number, draw: (g: CanvasRenderingContext2D, fill: Fill) => void): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d');
  if (!g) return null;
  draw(g, (style, x, y, w, h) => { g.fillStyle = style; g.fillRect(x, y, w, h); });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** One roof cell in UVs 0..1 (a triangle's corners (0,0), (1,0), (0,1); a diamond's, in order round it): bright in the middle, falling to `edge` of the light at its edges (R-a, R-c). Null in Node. */
const pillowTexture = (shape: 'triangle' | 'diamond', edge: number): THREE.CanvasTexture | null => canvasTexture(64, 64, g => {
  const image = g.createImageData(64, 64);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const u = (x + 0.5) / 64, v = 1 - (y + 0.5) / 64;
      const nearest = shape === 'triangle' ? Math.min(u, v, 1 - u - v) : Math.min(u, v, 1 - u, 1 - v);
      const t = clamp01(nearest / (shape === 'triangle' ? 0.26 : 0.18));
      const light = edge + (1 - edge) * t * t * (3 - 2 * t); // linear light; the texture holds sRGB
      const shade = Math.round(255 * Math.pow(light, 1 / 2.2));
      const k = (y * 64 + x) * 4;
      image.data[k] = image.data[k + 1] = image.data[k + 2] = shade;
      image.data[k + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
});

/** The wall's texture (R-c; ASSUMED heights): glass to 3 m, a navy band to 3.9 m, reflective glass above. Null in Node. */
const WALL_TEXTURE_HEIGHT = 8;
function wallTexture(): THREE.CanvasTexture | null {
  const t = canvasTexture(4, 256, (g, fill) => {
    const y = (m: number): number => 256 * (1 - m / WALL_TEXTURE_HEIGHT), sky = g.createLinearGradient(0, 0, 0, y(3.9));
    sky.addColorStop(0, '#b4c6d6');
    sky.addColorStop(1, '#4c6276');
    fill(sky, 0, 0, 4, y(3.9));
    fill('#141f48', 0, y(3.9), 4, y(3) - y(3.9));
    fill('rgba(44, 66, 84, 0.72)', 0, y(3), 4, 256 - y(3));
  });
  t?.repeat.set(1, 1 / WALL_TEXTURE_HEIGHT);
  return t;
}

interface RoofMaterials {
  soffit: THREE.Material;
  cladding: THREE.Material;
  skylight: THREE.Material;
  skylightTop: THREE.Material;
  member: THREE.Material;
  funnel: THREE.Material;
  floor: THREE.Material;
  wallGlass: THREE.Material;
  mullion: THREE.Material;
}
let roofMaterials: RoofMaterials | null = null;
/** The slab texture's average colour and the tint that darkens it to R-ab/R-b's charcoal (ASSUMED). */
const FLOOR_AVERAGE = 0x9ea2a8, FLOOR_TINT = 0x94948e;

function roofMaterial(): RoofMaterials {
  if (roofMaterials) return roofMaterials;
  const slabs = texture('floorSlab'), wall = wallTexture();
  roofMaterials = {
    // Unlit: the scene's lights shine from above, so a lit underside would be black (R-a: pale soffit).
    soffit: new THREE.MeshBasicMaterial({ map: pillowTexture('triangle', 0.5), color: 0xffffff, vertexColors: true, side: THREE.DoubleSide, name: 'concourse-soffit' }),
    cladding: new THREE.MeshPhongMaterial({ map: pillowTexture('diamond', 0.62), color: 0xffffff, vertexColors: true, specular: 0xaab4c0, shininess: 46, name: 'concourse-cladding' }),
    // Glows from below as daylight does (R-a, conc-ab).
    skylight: new THREE.MeshBasicMaterial({ map: pillowTexture('triangle', 0.7), color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.94, side: THREE.BackSide, depthWrite: false, name: 'concourse-skylight' }),
    // Dark and glassy from above (R-c).
    skylightTop: new THREE.MeshPhongMaterial({ color: 0x6f8aa5, emissive: 0x16202b, specular: 0xffffff, shininess: 120, transparent: true, opacity: 0.66, side: THREE.FrontSide, depthWrite: false, name: 'concourse-skylight-top' }),
    member: new THREE.MeshLambertMaterial({ color: 0xf7f9fb, emissive: 0xbcc1c7, name: 'concourse-member' }),
    funnel: new THREE.MeshLambertMaterial({ color: 0xf4f6f8, emissive: 0x7d8288, name: 'concourse-funnel' }),
    // R-c: dark reflective glass over shopfront glass, a navy band between.
    wallGlass: new THREE.MeshPhongMaterial({ map: wall, color: wall ? 0xffffff : 0x4f677a, specular: 0xdfe9f2, shininess: 110, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false, name: 'concourse-wall' }),
    mullion: new THREE.MeshLambertMaterial({ color: 0x59606a, emissive: 0x23282e, name: 'concourse-mullion' }),
    // R-ab, R-b: dark charcoal slabs, a channel 64-87 against the shared paving's 136 (ASSUMED tint).
    floor: new THREE.MeshLambertMaterial({ map: slabs, color: slabs ? FLOOR_TINT : new THREE.Color(FLOOR_AVERAGE).multiply(new THREE.Color(FLOOR_TINT)), name: 'concourse-floor' }),
  };
  return roofMaterials;
}

type Tri = [number, number, number];

/** Which kept cells are glazed: round the funnel, in the brim, and the rooflights (15 % published; R-a, R-c, R-c2). */
export function glazedCells(d: Diagrid, kept: Tri[], centre: Pt, shed: Pick<ShedLayout, 'origin' | 'heading'>, rim: (x: number, z: number) => number): Set<number> {
  const mid = kept.map((t): Pt => [(d.nodes[t[0]]!.x + d.nodes[t[1]]!.x + d.nodes[t[2]]!.x) / 3, (d.nodes[t[0]]!.z + d.nodes[t[1]]!.z + d.nodes[t[2]]!.z) / 3]);
  const glazed = new Set<number>();
  mid.forEach(([x, z], i) => {
    if (Math.hypot(x - centre[0], z - centre[1]) < FUNNEL_GLAZING_RADIUS || rim(x, z) < RIM_GLAZING_WIDTH) glazed.add(i);
  });
  const funnel = worldToShed(shed, centre);
  for (const azimuth of ROOFLIGHT_AZIMUTHS) {
    const a = (azimuth * Math.PI) / 180, target = shedToWorld(shed, funnel.u - ROOFLIGHT_RADIUS * Math.cos(a), funnel.v - ROOFLIGHT_RADIUS * Math.sin(a));
    const ex = (target[0] - centre[0]) / ROOFLIGHT_RADIUS, ez = (target[1] - centre[1]) / ROOFLIGHT_RADIUS; // up the slope; across it is (-ez, ex)
    mid.forEach(([x, z], i) => {
      const s = (x - target[0]) * ex + (z - target[1]) * ez, t = (z - target[1]) * ex - (x - target[0]) * ez;
      if (Math.abs(s) / ROOFLIGHT_HALF.along + Math.abs(t) / ROOFLIGHT_HALF.across <= 1) glazed.add(i);
    });
  }
  return glazed;
}

// Ground-level fit-out, ASSUMED positions scaled by 1.7 m people; generic signs only. R-ab, R-b: red-topped ticket machines, navy totems;
// R-a: departure boards; R-ab, R-b: plates over the openings, lit shopfronts; Arup 2/2012 pp.24-29: fare gates in the five southern bays.

/** u of the Range's west face, the concourse's side (its east face is 0.01 m inside the shed's wall, 12 m deep). */
export const RANGE_FACE = -WESTERN_RANGE.depth - 0.01;

/** Metres; positions are [u, metres north of the funnel axis] in the shed frame. */
export const FITOUT = {
  /** four machines back to back round a red core: a square block, the red cowls reaching 0.89 m from its axis */
  cluster: { size: 1.78, height: 2.2 },
  clusters: [[-23.5, -12], [-23.5, 12]] as readonly (readonly [number, number])[],
  totem: { width: 1.1, depth: 0.22, height: 3 },
  /** the third keeps out of the gateline view's sight lines to the gate mouths (tested) */
  totems: [[-30, -15], [-30, 15], [-24, -26]] as readonly (readonly [number, number])[],
  /** on short brackets from the Range's face, `bottom` above the floor */
  board: { length: 16.8, height: 1.05, bottom: 5.6, standoff: 0.3, depth: 0.12 },
  /** each board's southern end, metres north of the funnel axis */
  boards: [-24.3, 7.5] as readonly number[],
  /** fare gate cabinets either side of each aisle, at this u, the first bay's centre at v0 + 4 */
  gate: { u: -9, length: 1.6, width: 0.22, height: 1.0, offsets: [-3, -1.8, -0.6, 0.6, 1.8, 3] as readonly number[], bays: 5, firstBay: 4, pitch: 8 },
  /** the two shops' centres (shed.ts WESTERN_SHOPS), their panes 0.4 m inside the Range's face (tested) */
  shops: [WESTERN_RANGE.v0 + 44, WESTERN_RANGE.v0 + 48] as readonly number[],
  /** a lit interior 4 cm in front of a shop's dark pane (0.375 m inside the face, 2.8 m wide, 3.2 m high) */
  shopfront: { width: 2.6, top: 3.15, bottom: 0.04, u: RANGE_FACE + 0.335 },
  /** navy plates over the openings (head 3.6 m), clear of the string course */
  plate: { height: 0.5, bottom: 3.64, standoff: 0.22, depth: 0.05, bayWidth: 5.2, shopWidth: 2.6 },
} as const;
/** The lettering the signs carry. Generic words only. */
export const FITOUT_TEXT = {
  totem: ['Underground', 'Platforms 0 to 8', 'Toilets', 'Left luggage', 'Information'],
  board: ['Leeds   Platform 4   On time', 'York   Platform 6   On time', 'Cambridge   Platform 2   Delayed', 'Peterborough   Platform 3   On time', 'Newcastle   Platform 5   On time'],
  /** over the five gate bays, southernmost first, then over the two shops */
  plates: ['Platforms 0 to 8', 'Underground', 'Toilets', 'Left luggage', 'Information', 'Cafe', 'News and gifts'],
} as const;

/** v of the centre of each opening that carries a plate: the five gate bays, then the two shops. */
export function plateCentres(): number[] {
  const { gate } = FITOUT;
  return [...Array.from({ length: gate.bays }, (_, i) => WESTERN_RANGE.v0 + gate.firstBay + i * gate.pitch), ...FITOUT.shops];
}

/** The sign atlas: one canvas, a region [x, y, w, h] for each lettered face, in its aspect. Null in Node. */
const ATLAS = {
  width: 1024, height: 512,
  totem: [0, 0, 192, 448], board: [0, 448, 1024, 64], shop: [192, 0, 208, 250],
  /** a 56 px row per plate: 582 px for a bay's 5.2 m by 0.5 m, 291 for a shop's 2.6 m */
  plates: [0, 1, 2, 3, 4, 5, 6].map((k): readonly [number, number, number, number] => [400, k * 56, k < 5 ? 582 : 291, 56]),
} as const;
const signAtlas = (): THREE.CanvasTexture | null => canvasTexture(ATLAS.width, ATLAS.height, (g, fill) => {
  const [tx, ty, tw, th] = ATLAS.totem, [bx, by, bw, bh] = ATLAS.board, [sx, sy, sw, sh] = ATLAS.shop;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 2;
  g.textBaseline = 'middle';
  // totem: dark blue, lettered rows, a lit screen (R-b)
  fill('#1b2a5e', tx, ty, tw, th);
  g.fillStyle = '#ffffff';
  g.font = 'bold 18px sans-serif';
  FITOUT_TEXT.totem.forEach((line, i) => {
    const y = ty + 30 + i * 46;
    g.strokeRect(tx + 10, y - 12, 24, 24);
    g.fillText(line, tx + 44, y, tw - 50);
    g.fillRect(tx + 10, y + 21, tw - 20, 1);
  });
  const screen = g.createLinearGradient(0, ty + 270, 0, ty + th - 14);
  screen.addColorStop(0, '#c9c4ff');
  screen.addColorStop(1, '#6f86e8');
  fill(screen, tx + 12, ty + 270, tw - 24, th - 284);
  // board: near black, amber lettering, three entries to a row (R-a)
  fill('#121418', bx, by, bw, bh);
  g.fillStyle = '#ffb21a';
  g.font = 'bold 23px monospace';
  const cell = (bw - 28) / 3;
  for (let row = 0; row < 2; row++) for (let k = 0; k < 3; k++) g.fillText(FITOUT_TEXT.board[(row * 3 + k) % FITOUT_TEXT.board.length]!, bx + 14 + k * cell, by + 18 + row * 28, cell - 22);
  // plates: navy, white lettering, a pictogram square (R-ab, R-b)
  ATLAS.plates.forEach(([px, py, pw, ph], i) => {
    fill('#1d2c66', px, py, pw, ph);
    g.strokeRect(px + 12, py + 12, ph - 24, ph - 24);
    g.fillStyle = '#ffffff';
    g.font = `bold ${i < 5 ? 30 : 26}px sans-serif`;
    g.fillText(FITOUT_TEXT.plates[i]!, px + ph, py + ph / 2 + 1, pw - ph - 12);
  });
  // a lit shopfront: warm light, shelves, counter, goods (generic)
  const light = g.createLinearGradient(0, sy, 0, sy + sh), goods = ['#c4202c', '#2b5fb4', '#e6e0d2', '#3c8a52', '#d9a21b', '#7b4a9a'];
  light.addColorStop(0, '#fff1d2');
  light.addColorStop(0.7, '#f3c987');
  light.addColorStop(1, '#a8743d');
  fill(light, sx, sy, sw, sh);
  [0.22, 0.38, 0.54].forEach((shelf, k) => {
    fill('#5a4a3c', sx + 8, sy + sh * shelf, sw - 16, 4);
    for (let j = 0; j < 6; j++) fill(goods[(j + k * 2) % goods.length]!, sx + 12 + j * 31, sy + sh * shelf - 16, 22, 16);
  });
  fill('#3a2f27', sx, sy + sh * 0.72, sw, sh * 0.28);
  fill('#d8d2c8', sx, sy + sh * 0.72, sw, 6);
  for (const lamp of [0.2, 0.5, 0.8]) fill('#fff6dc', sx + sw * lamp - 10, sy + 4, 20, 6);
});
/** The corners (0,0), (1,0), (1,1), (0,1) of a face in the atlas, from a region [x, y, w, h]. */
const atlasQuad = (r: readonly number[]): V2[] => [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]): V2 => [(r[0]! + u! * r[2]!) / ATLAS.width, 1 - (r[1]! + (1 - v!) * r[3]!) / ATLAS.height]);

let fitOutMaterials: { solid: THREE.Material; signs: THREE.Material } | null = null;
function fitOutMaterial(): { solid: THREE.Material; signs: THREE.Material } {
  if (fitOutMaterials) return fitOutMaterials;
  const atlas = signAtlas();
  fitOutMaterials = {
    solid: new THREE.MeshLambertMaterial({ vertexColors: true, name: 'concourse-fitout' }),
    // unlit, so signs glow; the polygon offset beats the Range's panes (nearer(): -2), so a shopfront 4 cm in front wins at 60 m
    signs: new THREE.MeshBasicMaterial({ map: atlas, color: 0xffffff, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, name: 'concourse-signs' }),
  };
  return fitOutMaterials;
}

/** The fit-out as two meshes (lit solids, unlit signs) in a group in the shed's frame (x = u, z = -v). */
function buildFitOut(shed: ShedLayout, funnelV: number): THREE.Group {
  const solid = new Batch({ colored: true, uv: false }), signs = new Batch({ colored: true });
  const textured = typeof document !== 'undefined';
  const WHITE: Rgb = [1, 1, 1], RED = rgb(0xc4202c), PAPER = rgb(0xe7e9eb), SCREEN = rgb(0x18222c), KEYPAD = rgb(0x8c9298), NAVY = rgb(0x1b2a5e), PLINTH = rgb(0x3b3f45);
  const BOARD = rgb(0x121418), SILVER = rgb(0xbcc1c6), TOP = rgb(0x2c3036), LED = rgb(0x35c06e);
  const L = (u: number, y: number, v: number): V3 => [u, y, -v];
  const part = (u: number, y0: number, v: number, du: number, dy: number, dv: number, color: Rgb): void => solid.box(L(u, y0 + dy / 2, v), [du, dy, dv], { color });
  const { cluster, totem, board, gate } = FITOUT;
  const sign = (region: readonly number[], pts: V3[], normal: V3, plain: Rgb): void => signs.poly(pts, atlasQuad(region), { normal, color: textured ? WHITE : plain });
  // ticket machines: four white machines round a red core, red cowls, a screen and keypad on each front
  for (const [u, dv] of FITOUT.clusters) {
    const v = funnelV + dv;
    part(u, 0, v, 0.6, cluster.height, 0.6, RED);
    for (let k = 0; k < 4; k++) {
      const du = Math.round(Math.cos((k * Math.PI) / 2)), dz = Math.round(Math.sin((k * Math.PI) / 2));
      const body = dz === 0 ? [0.5, 0.56] : [0.56, 0.5], cowl = dz === 0 ? [0.62, 0.64] : [0.64, 0.62], mu = u + du * 0.58, mv = v + dz * 0.58;
      part(mu, 0, mv, body[0]!, 1.55, body[1]!, PAPER);
      part(mu, 1.55, mv, cowl[0]!, cluster.height - 1.55, cowl[1]!, RED);
      // fronts, 1 cm proud of the body
      const fu = mu + du * 0.255, fv = mv + dz * 0.255, across = (a: number, b: number): [number, number] => (dz === 0 ? [a, b] : [b, a]);
      const [sx, sz] = across(0.02, 0.46), [kx, kz] = across(0.02, 0.4);
      part(fu, 1.2, fv, sx, 0.34, sz, SCREEN);
      part(fu, 0.78, fv, kx, 0.3, kz, KEYPAD);
    }
  }
  // wayfinding totems: a dark plinth and body, the lettered faces on both sides in the unlit mesh
  for (const [u, dv] of FITOUT.totems) {
    const v = funnelV + dv, h = totem.height;
    part(u, 0, v, 0.3, 0.1, totem.width + 0.1, PLINTH);
    part(u, 0.1, v, totem.depth, h - 0.1, totem.width, NAVY);
    for (const side of [-1, 1]) {
      const x = u + side * (totem.depth / 2 + 0.004), y0 = 0.1 + 0.12, y1 = h - 0.1;
      // seen from the west face, north is on the left; from the east face, south is
      const left = side < 0 ? 1 : -1;
      const pts = ([[left, y0], [-left, y0], [-left, y1], [left, y1]] as const).map(([k, y]): V3 => L(x, y, v + k * (totem.width / 2 - 0.04)));
      sign(ATLAS.totem, pts, [side, 0, 0], NAVY);
    }
  }
  // departure boards: a dark frame on brackets, the lettered face toward the concourse
  for (const dv of FITOUT.boards) {
    const v0 = funnelV + dv, v1 = v0 + board.length, face = RANGE_FACE - board.standoff - board.depth;
    part(face + board.depth / 2, board.bottom, (v0 + v1) / 2, board.depth, board.height, board.length, BOARD);
    for (const f of [0.05, 0.5, 0.95]) part(RANGE_FACE - board.standoff / 2, board.bottom + 0.2, v0 + f * board.length, board.standoff, 0.12, 0.1, PLINTH);
    const x = face - 0.004, y0 = board.bottom + 0.06, y1 = board.bottom + board.height - 0.06;
    const pts = ([[v0 + 0.06, y0], [v1 - 0.06, y0], [v1 - 0.06, y1], [v0 + 0.06, y1]] as const).map(([v, y]): V3 => L(x, y, v));
    // seen from the west the board's left is its northern end
    sign(ATLAS.board, [pts[1]!, pts[0]!, pts[3]!, pts[2]!], [-1, 0, 0], BOARD);
  }
  // fare gates: silver cabinets, dark tops, a green light
  for (let i = 0; i < gate.bays; i++) for (const o of gate.offsets) {
    const v = WESTERN_RANGE.v0 + gate.firstBay + i * gate.pitch + o;
    part(gate.u, 0, v, gate.length, gate.height - 0.1, gate.width, SILVER);
    part(gate.u, gate.height - 0.1, v, gate.length, 0.1, gate.width + 0.02, TOP);
    part(gate.u - gate.length / 2 + 0.25, gate.height, v, 0.4, 0.02, gate.width - 0.06, LED);
  }
  // navy plates over the bays and shops, on two brackets; the lettering faces west
  const { plate, shopfront } = FITOUT;
  plateCentres().forEach((v, i) => {
    const half = (i < gate.bays ? plate.bayWidth : plate.shopWidth) / 2, back = RANGE_FACE - plate.standoff, face = back - plate.depth;
    part(back - plate.depth / 2, plate.bottom, v, plate.depth, plate.height, half * 2, NAVY);
    for (const side of [-1, 1]) part(RANGE_FACE - plate.standoff / 2, plate.bottom + plate.height / 2 - 0.04, v + side * (half - 0.2), plate.standoff, 0.08, 0.08, PLINTH);
    const y0 = plate.bottom + 0.02, y1 = plate.bottom + plate.height - 0.02;
    // seen from the west the plate's left is its northern end
    const pts = ([[v + half - 0.02, y0], [v - half + 0.02, y0], [v - half + 0.02, y1], [v + half - 0.02, y1]] as const).map(([w, y]): V3 => L(face - 0.004, y, w));
    sign(ATLAS.plates[i]!, pts, [-1, 0, 0], NAVY);
  });
  // the shops' lit interiors, on the Range's dark panes (shed.ts)
  for (const v of FITOUT.shops) {
    const pts = ([[v + shopfront.width / 2, shopfront.bottom], [v - shopfront.width / 2, shopfront.bottom], [v - shopfront.width / 2, shopfront.top], [v + shopfront.width / 2, shopfront.top]] as const).map(([w, y]): V3 => L(shopfront.u, y, w));
    sign(ATLAS.shop, pts, [-1, 0, 0], rgb(0xe8c58a));
  }
  const group = new THREE.Group();
  group.name = 'concourse-fitout';
  group.rotation.y = -shed.heading;
  group.position.set(shed.origin[0], 0, shed.origin[1]);
  const mat = fitOutMaterial();
  for (const [batch, m, name] of [[solid, mat.solid, 'concourse-fitout-solid'], [signs, mat.signs, 'concourse-fitout-signs']] as const) addMesh(group, batch.build(), m, name);
  return group;
}

function addMesh(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, name: string, order = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.renderOrder = order;
  group.add(mesh);
  return mesh;
}

export function buildConcourse(canopy: ConcourseCanopy, footprint: Pt[], shed: ShedLayout, exclusions: Pt[][] = []): THREE.Group {
  const { centre, grid: d } = concourseGrid(canopy, footprint, shed, exclusions);
  const [cx, cz] = centre;
  const kept = keepTriangles(d, footprint, shed);
  const height = (n: Diagrid['nodes'][number]): number => n.height ?? concourseHeight(canopy, n.r);
  const at = (i: number): V3 => {
    const n = d.nodes[i] as Diagrid['nodes'][number];
    return [n.x, height(n), n.z];
  };
  const mat = roofMaterial();
  const north = concourseNorth(footprint, shed);

  const members = new Batch();
  const glass = new Batch({ colored: true });
  const closure = new Batch({ colored: true });
  const struts = new Batch();
  const soffit = new Batch({ colored: true });
  const cladding = new Batch({ colored: true });
  const floor = new Batch();
  const wall = new Batch();
  const mullions = new Batch();
  const edges = edgesOf(kept);
  const ribs = roofRibs(edges, d.nodes, centre);
  // Ribs first, then tubes. ASSUMED linear change with the share of the way from funnel to rim: ribs 450 to 250 mm deep, tubes 219 to 139 mm (Arup's range).
  const share = (r: number): number => clamp01((r - FUNNEL_RADIUS) / (canopy.radius - FUNNEL_RADIUS));
  for (const rib of [true, false]) for (const { a, b } of edges.values()) {
    if (ribs.has(`${a}:${b}`) !== rib) continue;
    const p = at(a), q = at(b), t = share((d.nodes[a]!.r + d.nodes[b]!.r) / 2), dy = q[1] - p[1], len = Math.hypot(q[0] - p[0], dy, q[2] - p[2]);
    if (rib) members.box([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], [len + 0.1, 0.45 - 0.2 * t, RIB_WIDTH], { rotZ: Math.asin(dy / len), rotY: Math.atan2(p[2] - q[2], q[0] - p[0]), skip: ['+x', '-x'] });
    else roundMember(members, p, q, 0.219 - 0.08 * t);
  }

  // Between the members: glass, or a soffit under silver cladding, two cells either side of a rib one diamond facet (R-c, R-c2).
  const rim = (x: number, z: number): number => rimDistance(shed, footprint, north, x, z);
  const glazed = glazedCells(d, kept, centre, shed, rim);
  const tone = rng(0x4b58), paneTone = rng(0x91a3);
  const pane = (): Rgb => { const k = 0.9 + 0.1 * paneTone(); return [k * 0.84, k * 0.92, k]; }; // daylight, a pale blue-white, each pane its own shade
  const SOFFIT_TONE = rgb(0xdadee2), CLADDING_TONE = rgb(0xa9adb2), UP: V3 = [0, 1, 0]; // CLADDING_TONE: the dome's mean in R-c is about (154, 152, 146)
  const scaled = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
  const nodeAt = (i: number, by: number): V3 => { const p = at(i); return [p[0], p[1] + by, p[2]]; };
  const barycentric: [V2, V2, V2] = [[0, 0], [1, 0], [0, 1]];
  kept.forEach((t, i) => {
    if (glazed.has(i)) {
      glass.poly([nodeAt(t[0], SKIN_LIFT), nodeAt(t[1], SKIN_LIFT), nodeAt(t[2], SKIN_LIFT)], barycentric, { facing: UP, color: pane() });
      return;
    }
    const outer = share((d.nodes[t[0]]!.r + d.nodes[t[1]]!.r + d.nodes[t[2]]!.r) / 3);
    // Each cell its own shade (ASSUMED +-4 %), dimming toward the rim.
    soffit.poly([nodeAt(t[0], SOFFIT_LIFT), nodeAt(t[1], SOFFIT_LIFT), nodeAt(t[2], SOFFIT_LIFT)], barycentric, { facing: UP, color: scaled(SOFFIT_TONE, (0.96 + 0.08 * tone()) * (1 - 0.1 * outer)) });
  });
  // An upstand closes the cavity where a solid cell meets a glazed one, so no sky shows through.
  for (const { a, b, cells } of edges.values()) {
    if (cells.length !== 2 || glazed.has(cells[0]!) === glazed.has(cells[1]!)) continue;
    const solid = kept[glazed.has(cells[0]!) ? cells[1]! : cells[0]!]!, apex = at(solid.find(n => n !== a && n !== b)!), A = at(a), B = at(b);
    soffit.poly([nodeAt(a, SOFFIT_LIFT), nodeAt(b, SOFFIT_LIFT), nodeAt(b, SKIN_LIFT), nodeAt(a, SKIN_LIFT)], [[0.34, 0.34], [0.34, 0.34], [0.34, 0.34], [0.34, 0.34]],
      { facing: [(A[0] + B[0]) / 2 - apex[0], 0, (A[2] + B[2]) / 2 - apex[2]], color: scaled(SOFFIT_TONE, 0.9) });
  }
  const paired = new Set<number>();
  for (const [key, { a, b, cells }] of edges) {
    if (!ribs.has(key) || cells.length !== 2) continue;
    const [i, j] = cells as [number, number];
    if (glazed.has(i) || glazed.has(j) || paired.has(i) || paired.has(j)) continue;
    paired.add(i);
    paired.add(j);
    const third = (k: number): number => kept[k]!.find(n => n !== a && n !== b)!;
    const A = nodeAt(a, SKIN_LIFT), B = nodeAt(b, SKIN_LIFT), C = nodeAt(third(i), SKIN_LIFT), D = nodeAt(third(j), SKIN_LIFT);
    const M: V3 = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2 + FACET_RISE, (A[2] + B[2]) / 2];
    const color = scaled(CLADDING_TONE, 0.9 + 0.2 * tone()); // ASSUMED +-10 % from diamond to diamond
    const corners: [V3, V2][] = [[A, [0, 0]], [C, [1, 0]], [B, [1, 1]], [D, [0, 1]]];
    for (let k = 0; k < 4; k++) {
      const [p, up] = corners[k]!, [q, uq] = corners[(k + 1) % 4]!;
      cladding.poly([p, q, M], [up, uq, [0.5, 0.5]], { facing: UP, color });
    }
  }
  kept.forEach((t, i) => { // a solid cell with no partner across its rib (beside the glazing, or at an edge): a flat facet
    if (glazed.has(i) || paired.has(i)) return;
    cladding.poly([nodeAt(t[0], SKIN_LIFT), nodeAt(t[1], SKIN_LIFT), nodeAt(t[2], SKIN_LIFT)], [[0, 0], [1, 0], [1, 1]], { facing: UP, color: scaled(CLADDING_TONE, 0.9 + 0.2 * tone()) });
  });
  // The oculus: glass over the funnel's open top (R-a).
  const crown = d.nodes.filter(n => n.ring === 0);
  for (let i = 0; i < crown.length; i++) {
    const p = crown[i]!, q = crown[(i + 1) % crown.length]!;
    glass.poly([[cx, canopy.apex + SKIN_LIFT, cz], [p.x, height(p) + SKIN_LIFT, p.z], [q.x, height(q) + SKIN_LIFT, q.z]], barycentric, { facing: UP, color: pane() });
  }

  // The ground follows the OSM outline clipped at the façade and northern limits, keeping its small corners.
  let groundOutline = footprint;
  for (const value of [(p: Pt): number => -WESTERN_RANGE.depth - .3 - worldToShed(shed,p).u,
    (p: Pt): number => north - worldToShed(shed,p).v]) {
    const clipped: Pt[] = [];
    for(let i=0;i<groundOutline.length;i++) {
      const a=groundOutline[i]!,b=groundOutline[(i+1)%groundOutline.length]!,va=value(a),vb=value(b);
      if(va>=0) clipped.push(a);
      if((va>=0)!==(vb>=0)) { const t=va/(va-vb); clipped.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]); }
    }
    groundOutline=clipped;
  }
  for(const tri of THREE.ShapeUtils.triangulateShape(groundOutline.map(p=>new THREE.Vector2(...p)),[])) {
    let [a,b,c]=tri.map(i=>groundOutline[i]!) as [Pt,Pt,Pt];
    if((b[1]-a[1])*(c[0]-a[0])-(b[0]-a[0])*(c[1]-a[1])<0) [b,c]=[c,b];
    floor.poly([[a[0],.02,a[1]],[b[0],.02,b[1]],[c[0],.02,c[1]]],[a,b,c]);
  }

  // The wall, WALL_INSET inside the outline, from the floor to the brim glass; the fascia stays on the outline.
  const post = new Set<number>();
  const rimEdges = [...edges.values()].filter(e => e.uses === 1 && d.nodes[e.a]!.ring === d.rings && d.nodes[e.b]!.ring === d.rings);
  const FASCIA_TONE = rgb(0xdfe3e7);
  const inset = (i: number): V3 => { // the wall's foot below node i and its top, on the brim glass over it; with no roof over the foot (beside the hotel) it stays on the outline
    const n = d.nodes[i]!, k = WALL_INSET / Math.hypot(cx - n.x, cz - n.z), x = n.x + (cx - n.x) * k, z = n.z + (cz - n.z) * k;
    const cell = kept.find(t => pointInPolygon([x, z], t.map(j => [d.nodes[j]!.x, d.nodes[j]!.z] as Pt)));
    if (!cell) return [n.x, canopy.rim + SKIN_LIFT, n.z];
    const [a, b, c] = cell.map(j => d.nodes[j]!) as [typeof n, typeof n, typeof n], det = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
    const wa = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / det, wb = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / det;
    return [x, wa * height(a) + wb * height(b) + (1 - wa - wb) * height(c) + SKIN_LIFT, z];
  };
  for (const e of rimEdges) {
    const p = at(e.a);
    const q = at(e.b);
    const len = Math.hypot(q[0] - p[0], q[2] - p[2]);
    // the quad faces the right of travel: go the way that points it away from the column
    const nx = -(q[2] - p[2]);
    const nz = q[0] - p[0];
    const out = nx * ((p[0] + q[0]) / 2 - cx) + nz * ((p[2] + q[2]) / 2 - cz) > 0;
    const [s, t] = out ? [p, q] : [q, p], [ws, wt] = (out ? [e.a, e.b] : [e.b, e.a]).map(inset) as [V3, V3];
    wall.quad([ws[0], 0, ws[2]], [wt[0], 0, wt[2]], wt, ws, [0, 0], [len, 0], [len, wt[1]], [0, ws[1]]);
    // The fascia (R-c: a thin bright band) up to the skin, in the soffit mesh so it reaches the whole outline.
    soffit.poly([[s[0], s[1] + FASCIA_BOTTOM, s[2]], [t[0], t[1] + FASCIA_BOTTOM, t[2]], [t[0], t[1] + SKIN_LIFT, t[2]], [s[0], s[1] + SKIN_LIFT, s[2]]],
      [[0.34, 0.34], [0.34, 0.34], [0.34, 0.34], [0.34, 0.34]], { facing: [nx * (out ? 1 : -1), 0, nz * (out ? 1 : -1)], color: FASCIA_TONE });
    for (const [i, w] of [[e.a, inset(e.a)], [e.b, inset(e.b)]] as const) {
      if (post.has(i)) continue;
      post.add(i);
      mullions.box([w[0], w[1] / 2, w[2]], [MULLION.post, w[1], MULLION.post]);
    }
    for (const k of [1 / 3, 2 / 3]) {
      const y = ws[1] + k * (wt[1] - ws[1]);
      mullions.box([ws[0] + k * (wt[0] - ws[0]), y / 2, ws[2] + k * (wt[2] - ws[2])], [MULLION.bar, y, MULLION.bar]);
    }
    const run = Math.hypot(wt[0] - ws[0], wt[2] - ws[2]), rise = MULLION.transom * (wt[1] - ws[1]), slant = Math.hypot(run, rise);
    const foot: V3 = [(ws[0] + wt[0]) / 2, (MULLION.transom * (ws[1] + wt[1])) / 2, (ws[2] + wt[2]) / 2];
    mullions.box(foot, [slant, MULLION.bar, MULLION.bar], { rotZ: Math.asin(rise / slant), rotY: Math.atan2(-(wt[2] - ws[2]), wt[0] - ws[0]) });
    for (const end of [p, q]) roundMember(struts, foot, end, STRUT_DIAMETER);
  }
  // The Range cut: glass from the cornice to the roof's skin, so no sky shows between roof and Range (R-a, R-b).
  const cut = (i: number): boolean => Math.abs(worldToShed(shed, [d.nodes[i]!.x, d.nodes[i]!.z]).u - WEST_WALL) < 0.01;
  const EAST: V3 = (() => { const o = shedToWorld(shed, 0, 0), e = shedToWorld(shed, 1, 0); return [e[0] - o[0], 0, e[1] - o[1]]; })();
  for (const e of edges.values()) {
    if (e.uses !== 1 || !cut(e.a) || !cut(e.b)) continue;
    const [A, B] = [nodeAt(e.a, SKIN_LIFT), nodeAt(e.b, SKIN_LIFT)], a: V3 = [A[0], Math.min(CORNICE_TOP, A[1]), A[2]], b: V3 = [B[0], Math.min(CORNICE_TOP, B[1]), B[2]];
    if (A[1] <= CORNICE_TOP && B[1] <= CORNICE_TOP) continue;
    closure.poly([a, b, B], barycentric, { facing: EAST, color: pane() });
    closure.poly([a, B, A], barycentric, { facing: EAST, color: pane() });
  }
  // The perimeter tree columns: a trunk and four branches to the nearest roof nodes.
  const used = new Set(kept.flat());
  for (const site of treeSites(shed, centre)) {
    if (!pointInPolygon(site, footprint) || exclusions.some(h => pointInPolygon(site, h)) || worldToShed(shed, site).u > WEST_WALL - 3 || rim(site[0], site[1]) < TREES.edgeClear) continue;
    const near = [...used].sort((i, j) => Math.hypot(d.nodes[i]!.x - site[0], d.nodes[i]!.z - site[1]) - Math.hypot(d.nodes[j]!.x - site[0], d.nodes[j]!.z - site[1])).slice(0, 4).map(at);
    const fork: V3 = [site[0], Math.min(...near.map(n => n[1])) - TREES.fork, site[1]];
    roundMember(struts, [site[0], 0, site[1]], fork, TREES.trunk);
    for (const tip of near) roundMember(struts, fork, tip, TREES.branch);
  }

  const group = new THREE.Group();
  group.name = 'western-concourse';
  const add = (b: Batch, m: THREE.Material, name: string, order = 0): void => { if (b.count > 0) addMesh(group, b.build(), m, name, order); };
  add(members, mat.member, 'concourse-lattice');
  add(soffit, mat.soffit, 'concourse-panels');
  add(cladding, mat.cladding, 'concourse-cladding');
  if (glass.count > 0) { // one geometry, two looks: bright from below, dark and glinting from above
    const panes = glass.build();
    for (const [m, name] of [[mat.skylight, 'concourse-glass'], [mat.skylightTop, 'concourse-glass-top']] as const) addMesh(group, panes, m, name, 3);
  }
  add(wall, mat.wallGlass, 'concourse-wall', 3);
  add(closure, mat.skylight, 'concourse-closure', 3);
  add(struts, mat.funnel, 'concourse-supports');
  add(mullions, mat.mullion, 'concourse-mullions');
  add(floor, mat.floor, 'concourse-floor');
  group.add(buildFitOut(shed, worldToShed(shed, centre).v));
  // The funnel: one mesh about its own axis in the shed's frame, its legs landing on the roof's third ring.
  const column = addMesh(group, columnGeometry(funnelHead(d, centre, shed)), mat.funnel, 'concourse-column');
  column.position.set(cx, 0, cz);
  column.rotation.y = -shed.heading;
  return group;
}
