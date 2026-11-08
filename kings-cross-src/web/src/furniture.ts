// Platforms and what stands on them, for the King's Cross model: the platform surfaces with their
// edge strips (coping, yellow tactile strip, white line), the instanced furniture (lamp standards,
// benches, help points, departure screens hung from the shed roof) and the canopies of platforms
// 9 and 10. Procedural: no image assets, and the only texture drawn here is the screens' face.
//
// What it replaces in web/src/main.ts: the `platforms` merged mesh and the yellow `outlineSegments`
// lines are `buildPlatforms(data, layout)`; `buildFurniture(data, layout)` is new. Together about ten
// draw calls (three for the platforms, the rest for the furniture and canopies).
//
// FRAME. World: x east, z south (north is -z), metres, y up. The rail head top is y = 0; the platform
// top is PLATFORM_HEIGHT above it (core/scene.ts, 0.9 m; the real standard is 0.915 m); the ground is
// GROUND_Y (web/src/world.ts, -0.2 m) and the platform walls start there. Platforms 0-8 stand under the
// shed (shedLayout in core/station.ts), 9 and 10 outside it to the west; there is no platform 11.
//
// WHICH EDGE IS A TRACK EDGE. A platform outline edge is classified (classifyEdges) as
//   shared  another platform polygon lies just outside it (OSM draws an island as two adjacent
//           polygons that share their nodes: platforms 0/1, 2/3, 4/5, 6/7, and 8/9 at the north end),
//   wall    both ends are within FIGURES.wallTolerance of a shed flank wall (u = 0 or u = width) over
//           the shed's length (platform 8's west face lies 0.3-2.2 m from the wall in the OSM data),
//   end     it does not run along the platform (more than FIGURES.alongDeg from its long axis),
//   open    it runs along the platform but no track lies beside it (only judged when the data carries
//           the rails: platform 9's east face and platform 8's west face north of the shed have none),
//   track   anything else: a long edge facing a track.
// Edge strips go on runs of 'track' edges that add up to at least FIGURES.minTrackRun, so a long edge
// that OSM splits into short pieces still gets one continuous strip; furniture keeps its distance from
// every 'track' edge, whatever its length.
//
// UVs. Platform tops carry UVs in METRES, u = x (east) and v = -z (north): one asphalt tile (2 x 2 m,
// materials.ts) covers 2 m of the real thing and the texture does not stretch, whatever the polygon.
// An edge strip has u = 0 at the edge running to 1.6 m inboard and v = metres along the edge, which is
// how TEXTURES.platformEdge is drawn (1.6 m across, 0.5 m along).
//
// NUMBERS. Every figure is in FIGURES with its source. The platform heights, the edge strip's width and
// the asphalt scale come from the repo (scene.ts, world.ts, materials.ts). Everything else is
// ASSUMED: the 1.6 m safety line, the furniture sizes and spacings and the canopy dimensions were
// given by the brief as working figures and no external source was read for them. The screens' rods
// end at the shed's circular intrados (shedRoofY, from layout.springing and SHED_SPAN_WIDTH, the same
// arcs web/src/shed.ts draws): if the shed's roof changes shape, so must that function.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Pt } from '../../core/geo.ts';
import type { KxData } from '../../core/osm.ts';
import { PLATFORM_HEIGHT } from '../../core/scene.ts';
import { isSurfacePlatform, longAxis, PLATFORM_REFS, pointInPolygon, SHED_PLATFORM_REFS, SHED_SPAN_WIDTH, stationPlatforms, worldToShed } from '../../core/station.ts';
import type { ShedLayout } from '../../core/station.ts';
import { material, rng, TEXTURES } from './materials.ts';
import { GROUND_Y } from './world.ts';

/** The parts of the shed layout this module reads. */
export type FurnitureLayout = Pick<ShedLayout, 'origin' | 'heading' | 'width' | 'length' | 'aisle' | 'springing'>;
/** The platforms are all that is needed; with the rails too, an edge with no track beside it gets no strip and no safety line. */
export type FurnitureData = Pick<KxData, 'platforms'> & Partial<Pick<KxData, 'nodes' | 'rails'>>;

export const FIGURES = {
  // --- platform surface and edge strips
  /** Nothing stands closer than this to a track-facing edge, metres. ASSUMED (the brief's safety line). */
  safetyLine: 1.6,
  /** Extra clearance on top of the safety line, so a bench corner or a slanted edge still clears it. ASSUMED. */
  safetySlack: 0.1,
  /** Clearance from any other platform edge (an end, a wall, a seam between two polygons), metres. ASSUMED. */
  otherMargin: 0.35,
  /** Width of the edge strip: one tile of TEXTURES.platformEdge across (materials.ts). */
  stripWidth: TEXTURES.platformEdge.tile[0],
  /** How far the strip sits above the platform top, metres. ASSUMED: a hair, backed by a polygon offset on its material. */
  stripLift: 0.012,
  /** A run of track edges shorter than this gets no strip, metres. ASSUMED (the brief). */
  minTrackRun: 12,
  /** An edge is 'along the platform' when within this angle of the polygon's long axis, degrees. ASSUMED. */
  alongDeg: 35,
  /** A strip does not turn a corner sharper than this: the run is split instead, degrees. ASSUMED. */
  maxBendDeg: 50,
  /** An edge this close to a shed flank wall counts as the wall, metres: platform 8's west face is 0.3-2.2 m off it (OSM). */
  wallTolerance: 2.5,
  /** How far outside an edge to probe for a neighbouring platform polygon, metres. ASSUMED. */
  sharedProbe: 0.25,
  /** An edge faces a track when a rail lies within `trackReach` of the point `trackProbe` outside it (a platform face is
   *  about 1.7 m from the track centre line; the OSM outlines stray by a metre or two), metres. ASSUMED. */
  trackProbe: 1.7,
  trackReach: 2.2,

  // --- where along a platform things go
  /** Keep this far from the south end (the buffer end) and the north end of the platform polygon, metres. ASSUMED. */
  endSouth: 12,
  endNorth: 8,
  /** Gap kept between two pieces of furniture, metres. ASSUMED. */
  gap: 0.3,
  /** A help point or a bench pair that would touch something slides along the platform by up to this much, metres. ASSUMED. */
  maxShift: 12,

  // --- lamp standards (platforms 9 and 10, and the open ends of 0-8 north of the shed's mouth)
  /** Pole height, metres. ASSUMED (the brief: about 4.5 m). */
  lampHeight: 4.5,
  /** Along-platform spacing, metres. ASSUMED. */
  lampSpacing: 24,
  /** Radius of the base, metres. ASSUMED. */
  lampRadius: 0.15,

  // --- benches
  /** Slatted bench with a back, 1.8 m long (ASSUMED: the brief), 0.5 m deep, seat 0.45 m up, back 0.9 m up (ASSUMED). */
  benchLength: 1.8,
  benchDepth: 0.5,
  benchSeat: 0.45,
  benchBack: 0.9,
  /** Distance between the centres of the two benches of a pair, metres. ASSUMED. */
  benchPairGap: 2.4,
  /** Along-platform spacing between pairs, metres. ASSUMED. */
  benchSpacing: 45,

  // --- help points
  /** A post 1.8 m tall (ASSUMED: the brief) with a panel, one every 80 m (ASSUMED). */
  helpHeight: 1.8,
  helpSpacing: 80,

  // --- departure screens, hung from the shed roof (platforms 0-8)
  /** A double-sided 1.2 x 0.7 m panel (ASSUMED: the brief) whose lower edge is 3.5 m above the platform (ASSUMED: the brief). */
  screenWidth: 1.2,
  screenHeight: 0.7,
  screenDepth: 0.08,
  screenBottom: 3.5,
  /** Distance between the two rods, metres. ASSUMED. */
  rodGap: 0.9,
  /** Rod radius, metres. ASSUMED. */
  rodRadius: 0.02,
  /** The rods stop this far under the roof surface, metres. ASSUMED. */
  rodBelowRoof: 0.15,
  /** Spacing along the middle of each shed platform, metres. ASSUMED. */
  screenSpacing: 30,
  /** Screens stay this far from the shed's south front and north mouth, metres. ASSUMED. */
  screenSouth: 12,
  screenNorth: 6,

  // --- canopies (platforms 9 and 10)
  /** Roof height above the platform top, metres. ASSUMED (the brief). */
  canopyHeight: 5.2,
  /** Distance between columns along the platform, metres. ASSUMED (the brief: about 12 m). */
  canopyColumnSpacing: 12,
  /** The roof and its edge beams stop this far inside the platform outline, so nothing hangs over the track side, metres. ASSUMED. */
  canopyInset: 0.3,
  /** The roof starts this far from each end of the platform polygon, metres, and needs at least this width, metres. ASSUMED. */
  canopyEnd: 4,
  canopyMinWidth: 2,
  /** Edge beam 0.2 m wide and 0.3 m deep, cross beams 0.2 x 0.28 m, columns 0.18 m across (all ASSUMED). */
  beamWidth: 0.2,
  beamDepth: 0.3,
  crossDepth: 0.28,
  columnSize: 0.18,
} as const;

const STAGGER = { lamp: 5.9, bench: 13.1, help: 29.3, screen: 9.7 } as const;
const CANOPY_REFS: ReadonlySet<string> = new Set(['9', '10']);
const SHED_REFS: ReadonlySet<string> = new Set(SHED_PLATFORM_REFS);

// ---------------------------------------------------------------------------------------------
// small vector helpers

type V3 = [number, number, number];
type Rgb = [number, number, number];
const WHITE: Rgb = [1, 1, 1];
const ZERO2: [number, number] = [0, 0];
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm3 = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const dot2 = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1];
/** A 0xRRGGBB colour as the linear triple a vertex colour wants. */
const rgb = (hex: number): Rgb => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};

function signedArea(pts: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i] as Pt;
    const b = pts[(i + 1) % pts.length] as Pt;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

/** Distance from p to the segment a-b. */
function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

// ---------------------------------------------------------------------------------------------
// a small flat-shaded mesh builder (positions, normals, uvs, vertex colours)

class MeshBuilder {
  readonly position: number[] = [];
  readonly normal: number[] = [];
  readonly uv: number[] = [];
  readonly color: number[] = [];

  /** A convex polygon as a triangle fan, wound so that its front faces along `n`. */
  face(vs: readonly V3[], n: V3, uvs?: readonly [number, number][], c: Rgb = WHITE): void {
    const g = cross3(sub3(vs[1] as V3, vs[0] as V3), sub3(vs[2] as V3, vs[0] as V3));
    const order = vs.map((_, i) => i);
    if (dot3(g, n) < 0) order.reverse();
    for (let k = 1; k + 1 < order.length; k++) {
      for (const i of [order[0], order[k], order[k + 1]] as number[]) {
        const v = vs[i] as V3;
        this.position.push(v[0], v[1], v[2]);
        this.normal.push(n[0], n[1], n[2]);
        const t = uvs?.[i] ?? ZERO2;
        this.uv.push(t[0], t[1]);
        this.color.push(c[0], c[1], c[2]);
      }
    }
  }

  /** An axis-aligned box from (x0,y0,z0) to (x1,y1,z1). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Rgb, skipBottom = false): void {
    const P = (x: number, y: number, z: number): V3 => [x, y, z];
    this.face([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], [1, 0, 0], undefined, c);
    this.face([P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)], [-1, 0, 0], undefined, c);
    this.face([P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0)], [0, 1, 0], undefined, c);
    if (!skipBottom) this.face([P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)], [0, -1, 0], undefined, c);
    this.face([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], [0, 0, 1], undefined, c);
    this.face([P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), P(x1, y0, z0)], [0, 0, -1], undefined, c);
  }

  /** A vertical prism with `sides` flat faces and a flat top. */
  prism(cx: number, cz: number, r: number, y0: number, y1: number, sides: number, c: Rgb): void {
    const cap: V3[] = [];
    for (let i = 0; i < sides; i++) {
      const a0 = ((i + 0.5) / sides) * Math.PI * 2;
      const a1 = ((i + 1.5) / sides) * Math.PI * 2;
      const p0: [number, number] = [cx + r * Math.cos(a0), cz + r * Math.sin(a0)];
      const p1: [number, number] = [cx + r * Math.cos(a1), cz + r * Math.sin(a1)];
      const m = (a0 + a1) / 2;
      this.face([[p0[0], y0, p0[1]], [p1[0], y0, p1[1]], [p1[0], y1, p1[1]], [p0[0], y1, p0[1]]], [Math.cos(m), 0, Math.sin(m)], undefined, c);
      cap.push([p0[0], y1, p0[1]]);
    }
    this.face(cap, [0, 1, 0], undefined, c);
  }

  /** A beam along a-b with a horizontal width `w` and a depth `h`, closed at both ends. */
  beam(a: V3, b: V3, w: number, h: number, c: Rgb): void {
    const d = norm3(sub3(b, a));
    let side = cross3([0, 1, 0], d);
    if (Math.hypot(side[0], side[1], side[2]) < 1e-6) side = [1, 0, 0];
    side = norm3(side);
    const up = cross3(d, side);
    const corner = (e: V3, sx: number, sy: number): V3 => [
      e[0] + side[0] * sx * (w / 2) + up[0] * sy * (h / 2),
      e[1] + side[1] * sx * (w / 2) + up[1] * sy * (h / 2),
      e[2] + side[2] * sx * (w / 2) + up[2] * sy * (h / 2),
    ];
    const neg = (v: V3): V3 => [-v[0], -v[1], -v[2]];
    this.face([corner(b, -1, -1), corner(b, 1, -1), corner(b, 1, 1), corner(b, -1, 1)], d, undefined, c);
    this.face([corner(a, -1, -1), corner(a, 1, -1), corner(a, 1, 1), corner(a, -1, 1)], neg(d), undefined, c);
    this.face([corner(a, 1, -1), corner(b, 1, -1), corner(b, 1, 1), corner(a, 1, 1)], side, undefined, c);
    this.face([corner(a, -1, -1), corner(b, -1, -1), corner(b, -1, 1), corner(a, -1, 1)], neg(side), undefined, c);
    this.face([corner(a, -1, 1), corner(b, -1, 1), corner(b, 1, 1), corner(a, 1, 1)], up, undefined, c);
    this.face([corner(a, -1, -1), corner(b, -1, -1), corner(b, 1, -1), corner(a, 1, -1)], neg(up), undefined, c);
  }

  /** Add everything another builder holds. A loop, not a spread: these arrays can be long. */
  append(other: MeshBuilder): void {
    for (const key of ['position', 'normal', 'uv', 'color'] as const) {
      const from = other[key];
      const to = this[key];
      for (let i = 0; i < from.length; i++) to.push(from[i] as number);
    }
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
    return g;
  }
}

// ---------------------------------------------------------------------------------------------
// platform outlines: which edge is which

export type PlatformEdgeKind = 'track' | 'end' | 'wall' | 'shared' | 'open';

/** One straight piece of running rail, [from, to] in world (x, z). */
export type TrackSegment = [Pt, Pt];

/** The surface rails of the data as segments, or undefined when it does not carry them. */
export function trackSegments(data: Partial<Pick<KxData, 'nodes' | 'rails'>>): TrackSegment[] | undefined {
  if (!data.nodes || !data.rails) return undefined;
  const pos = new Map<number, Pt>();
  for (const [id, x, z] of data.nodes) pos.set(id, [x, z]);
  const out: TrackSegment[] = [];
  for (const r of data.rails) {
    if (r.tunnel) continue;
    for (let i = 0; i + 1 < r.nodes.length; i++) {
      const a = pos.get(r.nodes[i] as number);
      const b = pos.get(r.nodes[i + 1] as number);
      if (a && b) out.push([a, b]);
    }
  }
  return out;
}

export interface PlatformEdge {
  index: number;
  a: Pt;
  b: Pt;
  length: number;
  /** unit vector from a to b */
  dir: Pt;
  /** unit vector pointing into the polygon, whatever its winding */
  inward: Pt;
  kind: PlatformEdgeKind;
}

/** Surface platforms with a usable outline: the same set core/scene.ts platformPrisms draws. */
export function surfacePlatforms(data: Pick<KxData, 'platforms'>): { id: number; ref?: string; pts: Pt[] }[] {
  return data.platforms.filter((p) => p.pts.length >= 3 && isSurfacePlatform(p));
}

function isShared(a: Pt, b: Pt, length: number, inward: Pt, others: readonly Pt[][]): boolean {
  const n = Math.max(3, Math.ceil(length / 8));
  let hits = 0;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const p: Pt = [a[0] + (b[0] - a[0]) * t - inward[0] * FIGURES.sharedProbe, a[1] + (b[1] - a[1]) * t - inward[1] * FIGURES.sharedProbe];
    if (others.some((o) => pointInPolygon(p, o))) hits++;
  }
  return hits >= Math.ceil(n * 0.6);
}

function onShedWall(a: Pt, b: Pt, layout: Pick<ShedLayout, 'origin' | 'heading' | 'width' | 'length'>): boolean {
  const sa = worldToShed(layout, a);
  const sb = worldToShed(layout, b);
  const v = (sa.v + sb.v) / 2;
  if (v < -2 || v > layout.length + 2) return false;
  const tol = FIGURES.wallTolerance;
  return Math.max(Math.abs(sa.u), Math.abs(sb.u)) <= tol || Math.max(Math.abs(sa.u - layout.width), Math.abs(sb.u - layout.width)) <= tol;
}

/** Does a rail run beside this edge: for most sample points along it, one within trackReach of the point trackProbe outside? */
function facesTrack(a: Pt, b: Pt, length: number, inward: Pt, near: readonly TrackSegment[]): boolean {
  const n = Math.max(3, Math.ceil(length / 8));
  let hits = 0;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const p: Pt = [a[0] + (b[0] - a[0]) * t - inward[0] * FIGURES.trackProbe, a[1] + (b[1] - a[1]) * t - inward[1] * FIGURES.trackProbe];
    if (near.some(([c, d]) => segmentDistance(p, c, d) <= FIGURES.trackReach)) hits++;
  }
  return hits >= Math.ceil(n * 0.5);
}

/**
 * Classify each edge of one platform outline (see the header). `others` are the outlines of the other
 * surface platforms, for the seams between adjacent polygons; `tracks`, when given, lets an edge with
 * no rail beside it be 'open' rather than 'track'.
 */
export function classifyEdges(
  pts: readonly Pt[],
  others: readonly Pt[][],
  layout: Pick<ShedLayout, 'origin' | 'heading' | 'width' | 'length'>,
  tracks?: readonly TrackSegment[],
): PlatformEdge[] {
  const sign = signedArea(pts) >= 0 ? 1 : -1;
  const axis = longAxis(pts as Pt[]).axis;
  const cosAlong = Math.cos((FIGURES.alongDeg * Math.PI) / 180);
  // only the rails near this outline matter: keep the per-edge search short
  const reach = FIGURES.trackProbe + FIGURES.trackReach + 1;
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs) - reach, Math.max(...xs) + reach, Math.min(...zs) - reach, Math.max(...zs) + reach];
  const near = tracks?.filter(([c, d]) => Math.max(c[0], d[0]) >= x0 && Math.min(c[0], d[0]) <= x1 && Math.max(c[1], d[1]) >= z0 && Math.min(c[1], d[1]) <= z1);
  return pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length] as Pt;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    const dir: Pt = length > 0 ? [dx / length, dz / length] : [0, 0];
    // shoelace > 0 in (x, z): the interior is on the (-dz, dx) side of each edge, else on the other
    const inward: Pt = sign > 0 ? [-dir[1], dir[0]] : [dir[1], -dir[0]];
    let kind: PlatformEdgeKind;
    if (length < 1e-6) kind = 'end';
    else if (isShared(a, b, length, inward, others)) kind = 'shared';
    else if (onShedWall(a, b, layout)) kind = 'wall';
    else if (Math.abs(dot2(dir, axis)) < cosAlong) kind = 'end';
    else if (near && !facesTrack(a, b, length, inward, near)) kind = 'open';
    else kind = 'track';
    return { index: i, a, b, length, dir, inward, kind };
  });
}

/** Distance from p to the nearest edge of the given kind. */
export function distanceToEdges(p: Pt, edges: readonly PlatformEdge[], kind: PlatformEdgeKind = 'track'): number {
  let best = Infinity;
  for (const e of edges) if (e.kind === kind) best = Math.min(best, segmentDistance(p, e.a, e.b));
  return best;
}

// ---------------------------------------------------------------------------------------------
// edge strips

export interface StripChain {
  /** indices of the polygon edges the strip follows, in order */
  edges: number[];
  /** the strip's outer boundary: the platform's own vertices, one more than there are edges */
  outer: Pt[];
  /**
   * The inner boundary, FIGURES.stripWidth inboard of the edges (mitred at the bends), except that it is
   * never deeper than half the way to another strip's edge on the same platform (so the strips along the
   * two sides of a tapering tip meet instead of overlapping) and that, at the two ends of the run, it
   * stops where it meets the platform's outline (so a slanted end is not overrun).
   */
  inner: Pt[];
  /** distance along the outer boundary at each vertex */
  s: number[];
}

/**
 * Where the line `depth` square-in from `own` (an edge of the run) meets the outline, walking from the
 * end of the run along its non-track edges: forward from own.b (step 1) or backward from own.a (step -1).
 * Null if it does not meet it within a few edges.
 */
function endCut(edges: readonly PlatformEdge[], own: PlatformEdge, step: 1 | -1, depth: number): Pt | null {
  const n = edges.length;
  const v = step > 0 ? own.b : own.a;
  const side = (p: Pt): number => (p[0] - v[0]) * own.inward[0] + (p[1] - v[1]) * own.inward[1];
  for (let k = 1; k <= 6; k++) {
    const e = edges[(own.index + step * k + n * 6) % n] as PlatformEdge;
    if (e.kind === 'track') return null;
    const [p, q] = step > 0 ? [e.a, e.b] : [e.b, e.a];
    const sp = side(p);
    const sq = side(q);
    if ((sp - depth) * (sq - depth) <= 0 && sp !== sq) {
      const t = (depth - sp) / (sq - sp);
      return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    }
  }
  return null;
}

const touches = (e: Pick<PlatformEdge, 'a' | 'b'>, v: Pt): boolean => (e.a[0] === v[0] && e.a[1] === v[1]) || (e.b[0] === v[0] && e.b[1] === v[1]);

/** Runs of consecutive track edges that are long enough for a strip, with their mitred inner boundary. */
export function stripChains(edges: readonly PlatformEdge[]): StripChain[] {
  const n = edges.length;
  const isTrack = (i: number): boolean => (edges[i] as PlatformEdge).kind === 'track';
  if (!edges.some((e) => e.kind === 'track')) return [];
  let start = 0;
  for (let i = 0; i < n; i++) {
    if (isTrack(i) && !isTrack((i + n - 1) % n)) {
      start = i;
      break;
    }
  }
  const cosBend = Math.cos((FIGURES.maxBendDeg * Math.PI) / 180);
  const runs: number[][] = [];
  let cur: number[] = [];
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    if (!isTrack(i)) {
      if (cur.length) runs.push(cur);
      cur = [];
      continue;
    }
    if (cur.length) {
      const prev = edges[cur[cur.length - 1] as number] as PlatformEdge;
      if (dot2(prev.dir, (edges[i] as PlatformEdge).dir) < cosBend) {
        runs.push(cur);
        cur = [];
      }
    }
    cur.push(i);
  }
  if (cur.length) runs.push(cur);

  const w = FIGURES.stripWidth;
  const long = runs
    .map((run) => ({ run, es: run.map((i) => edges[i] as PlatformEdge) }))
    .filter(({ es }) => es.reduce((s, e) => s + e.length, 0) >= FIGURES.minTrackRun);
  return long.map(({ run, es }, ri) => {
    const outer: Pt[] = [(es[0] as PlatformEdge).a, ...es.map((e) => e.b)];
    const rivals = long.filter((_, rj) => rj !== ri).flatMap((r) => r.es);
    const inner: Pt[] = outer.map((v, j) => {
      const prev = es[j - 1];
      const next = es[j];
      const n0 = (prev ?? next) as PlatformEdge;
      const n1 = (next ?? prev) as PlatformEdge;
      // mitre: along the sum of the two inward normals, scaled so both offset lines are `depth` from the edges
      const k = 1 + dot2(n0.inward, n1.inward);
      const m: Pt = [(n0.inward[0] + n1.inward[0]) / k, (n0.inward[1] + n1.inward[1]) / k];
      const gap = Math.min(...rivals.filter((e) => !touches(e, v)).map((e) => segmentDistance(v, e.a, e.b)));
      const depth = Math.min(w, gap / 2 / Math.hypot(m[0], m[1]));
      const cut = j === 0 ? endCut(edges, es[0] as PlatformEdge, -1, depth) : j === es.length ? endCut(edges, es[j - 1] as PlatformEdge, 1, depth) : null;
      return cut ?? [v[0] + depth * m[0], v[1] + depth * m[1]];
    });
    const s = [0];
    for (const e of es) s.push((s[s.length - 1] as number) + e.length);
    return { edges: run, outer, inner, s };
  });
}

// ---------------------------------------------------------------------------------------------
// the platform meshes

function addTop(b: MeshBuilder, pts: readonly Pt[]): void {
  const contour = pts.map((p) => new THREE.Vector2(p[0], p[1]));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []) as number[][];
  const at = (i: number): V3 => [(pts[i] as Pt)[0], PLATFORM_HEIGHT, (pts[i] as Pt)[1]];
  const uv = (i: number): [number, number] => [(pts[i] as Pt)[0], -(pts[i] as Pt)[1]];
  for (const t of tris) {
    const [i, j, k] = t as [number, number, number];
    b.face([at(i), at(j), at(k)], [0, 1, 0], [uv(i), uv(j), uv(k)]);
  }
}

function addWalls(b: MeshBuilder, edges: readonly PlatformEdge[]): void {
  let run = 0;
  for (const e of edges) {
    // a seam between two polygons is inside one slab of platform: no wall there
    if (e.kind !== 'shared' && e.length > 1e-6) {
      const out: V3 = [-e.inward[0], 0, -e.inward[1]];
      b.face(
        [[e.a[0], GROUND_Y, e.a[1]], [e.b[0], GROUND_Y, e.b[1]], [e.b[0], PLATFORM_HEIGHT, e.b[1]], [e.a[0], PLATFORM_HEIGHT, e.a[1]]],
        out,
        [[run, GROUND_Y], [run + e.length, GROUND_Y], [run + e.length, PLATFORM_HEIGHT], [run, PLATFORM_HEIGHT]],
      );
    }
    run += e.length;
  }
}

function addStrip(b: MeshBuilder, chain: StripChain, edges: readonly PlatformEdge[]): void {
  const y = PLATFORM_HEIGHT + FIGURES.stripLift;
  for (let k = 0; k + 1 < chain.outer.length; k++) {
    const e = edges[chain.edges[k] as number] as PlatformEdge;
    const s0 = chain.s[k] as number;
    // UVs in metres, read off the corners themselves so they hold however a corner was cut:
    // u = distance in from the edge (the coping is u = 0), v = distance along it from the start of the run
    const corner = (p: Pt): { at: V3; uv: [number, number] } => {
      const rel: Pt = [p[0] - e.a[0], p[1] - e.a[1]];
      return { at: [p[0], y, p[1]], uv: [dot2(rel, e.inward), s0 + dot2(rel, e.dir)] };
    };
    const quad = [chain.outer[k], chain.outer[k + 1], chain.inner[k + 1], chain.inner[k]].map((p) => corner(p as Pt));
    b.face(quad.map((q) => q.at), [0, 1, 0], quad.map((q) => q.uv));
  }
}

let edgeStripMaterial: THREE.Material | null = null;
/** The shared platform-edge material, cloned so its polygon offset (which keeps the strip clear of the surface at any range) stays ours. */
function stripMaterial(): THREE.Material {
  if (!edgeStripMaterial) {
    edgeStripMaterial = material('platformEdge').clone();
    edgeStripMaterial.name = 'platformEdgeStrip';
    edgeStripMaterial.polygonOffset = true;
    edgeStripMaterial.polygonOffsetFactor = -2;
    edgeStripMaterial.polygonOffsetUnits = -2;
  }
  return edgeStripMaterial;
}

/**
 * Every surface platform as a slab from the ground to PLATFORM_HEIGHT: asphalt on top (UVs in metres),
 * plain concrete walls, and a coping/tactile/white-line strip along each track-facing edge. Three
 * meshes: platform-tops, platform-walls, platform-edges.
 */
export function buildPlatforms(data: FurnitureData, layout: Pick<ShedLayout, 'origin' | 'heading' | 'width' | 'length'>): THREE.Group {
  const group = new THREE.Group();
  group.name = 'platforms';
  const polys = surfacePlatforms(data);
  const outlines = polys.map((p) => p.pts);
  const tracks = trackSegments(data);
  const tops = new MeshBuilder();
  const walls = new MeshBuilder();
  const strips = new MeshBuilder();
  let stripRuns = 0;
  for (const [i, p] of polys.entries()) {
    const edges = classifyEdges(p.pts, outlines.filter((_, j) => j !== i), layout, tracks);
    addTop(tops, p.pts);
    addWalls(walls, edges);
    for (const chain of stripChains(edges)) {
      addStrip(strips, chain, edges);
      stripRuns++;
    }
  }
  const parts: [string, MeshBuilder, THREE.Material][] = [
    ['platform-tops', tops, material('asphalt')],
    ['platform-walls', walls, material('concrete')],
    ['platform-edges', strips, stripMaterial()],
  ];
  for (const [name, builder, mat] of parts) {
    if (builder.position.length === 0) continue;
    const mesh = new THREE.Mesh(builder.geometry(), mat);
    mesh.name = name;
    group.add(mesh);
  }
  group.userData.platforms = polys.length;
  group.userData.stripRuns = stripRuns;
  return group;
}

// ---------------------------------------------------------------------------------------------
// placement along a platform (pure: no three.js objects)

export interface Section {
  /** across-platform coordinates of the interval's two ends, metres (s = dot(p, n)) */
  lo: number;
  hi: number;
  /** the polygon edges the ends lie on */
  loEdge: number;
  hiEdge: number;
}

/**
 * Where the line {p : dot(p, axis) = t} crosses the polygon: the widest interval of it that lies
 * inside, as across-platform coordinates s = dot(p, n) with n = (-axis.z, axis.x), or null.
 */
export function crossSection(pts: readonly Pt[], axis: Pt, t: number): Section | null {
  const n: Pt = [-axis[1], axis[0]];
  const hits: { s: number; edge: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i] as Pt;
    const b = pts[(i + 1) % pts.length] as Pt;
    const ta = dot2(a, axis);
    const tb = dot2(b, axis);
    if (ta <= t === tb <= t) continue;
    const k = (t - ta) / (tb - ta);
    const sa = dot2(a, n);
    const sb = dot2(b, n);
    hits.push({ s: sa + k * (sb - sa), edge: i });
  }
  hits.sort((p, q) => p.s - q.s);
  let best: Section | null = null;
  for (let i = 0; i + 1 < hits.length; i += 2) {
    const lo = hits[i] as { s: number; edge: number };
    const hi = hits[i + 1] as { s: number; edge: number };
    if (!best || hi.s - lo.s > best.hi - best.lo) best = { lo: lo.s, hi: hi.s, loEdge: lo.edge, hiEdge: hi.edge };
  }
  return best;
}

export interface Frame {
  ref: string;
  pts: readonly Pt[];
  edges: PlatformEdge[];
  /** the platform's long axis, unit, pointing north (-z) */
  axis: Pt;
  /** unit across the platform: n = (-axis.z, axis.x), east when the axis points north */
  n: Pt;
  /** extent of the polygon along the axis, metres */
  tLo: number;
  tHi: number;
}

export function platformFrame(
  ref: string,
  pts: readonly Pt[],
  others: readonly Pt[][],
  layout: Pick<ShedLayout, 'origin' | 'heading' | 'width' | 'length'>,
  tracks?: readonly TrackSegment[],
): Frame {
  const la = longAxis(pts as Pt[]).axis;
  const axis: Pt = la[1] > 0 ? [-la[0], -la[1]] : la;
  let tLo = Infinity;
  let tHi = -Infinity;
  for (const p of pts) {
    const t = dot2(p, axis);
    tLo = Math.min(tLo, t);
    tHi = Math.max(tHi, t);
  }
  return { ref, pts, edges: classifyEdges(pts, others, layout, tracks), axis, n: [-axis[1], axis[0]], tLo, tHi };
}

/** The point at along-coordinate t and across-coordinate s. */
export const worldPoint = (f: Pick<Frame, 'axis' | 'n'>, t: number, s: number): Pt => [f.axis[0] * t + f.n[0] * s, f.axis[1] * t + f.n[1] * s];

/**
 * How far to measure across the platform (along the section) to stand `d` metres square to an edge that
 * runs at an angle to the axis. Capped at twice `d`, for edges more than 60 degrees off the axis.
 */
export const squareTo = (f: Pick<Frame, 'axis'>, e: Pick<PlatformEdge, 'dir'>, d: number): number => d / Math.max(Math.abs(dot2(e.dir, f.axis)), 0.5);

export interface Band {
  /** the across-coordinates an item's centre may take: s0..s1 */
  s0: number;
  s1: number;
  mid: number;
  /** is the low (-n) / high (+n) side a track-facing edge */
  loTrack: boolean;
  hiTrack: boolean;
}

/**
 * The across-platform band where an item of half-width `half` may stand at along-coordinate t: at
 * least the safety line from a track-facing edge and FIGURES.otherMargin from any other edge, both
 * measured square to the edge, or null where the platform is too narrow.
 */
export function bandAt(f: Frame, t: number, half: number): Band | null {
  const sec = crossSection(f.pts, f.axis, t);
  if (!sec) return null;
  const lo = f.edges[sec.loEdge] as PlatformEdge;
  const hi = f.edges[sec.hiEdge] as PlatformEdge;
  const setback = (e: PlatformEdge): number => squareTo(f, e, (e.kind === 'track' ? FIGURES.safetyLine + FIGURES.safetySlack : FIGURES.otherMargin) + half);
  const s0 = sec.lo + setback(lo);
  const s1 = sec.hi - setback(hi);
  if (s1 < s0) return null;
  return { s0, s1, mid: (s0 + s1) / 2, loTrack: lo.kind === 'track', hiTrack: hi.kind === 'track' };
}

/** Along-platform positions at `spacing`, starting `south` metres in (plus a phase) and stopping `north` metres short of the far end. */
function slots(f: Frame, spacing: number, phase: number, south: number, north: number): number[] {
  const out: number[] = [];
  for (let t = f.tLo + south + (phase % spacing); t <= f.tHi - north; t += spacing) out.push(t);
  return out;
}

/** The roof height over the shed floor at across-coordinate u: the two circular arches, the flat aisles at the springing line. */
export function shedRoofY(layout: Pick<ShedLayout, 'aisle' | 'springing'>, u: number): number {
  const r = SHED_SPAN_WIDTH / 2;
  for (const k of [1, 3]) {
    const d = Math.abs(u - (layout.aisle + k * r));
    if (d <= r) return layout.springing + Math.sqrt(r * r - d * d);
  }
  return layout.springing;
}

export interface Placement {
  ref: string;
  x: number;
  z: number;
  /** turn about y, so that local +z faces (sin rotY, cos rotY) in the world's (x, z) */
  rotY: number;
  /** radius of the footprint circle two pieces must not overlap, metres */
  r: number;
  /** half-width across the platform, metres */
  across: number;
}

export interface ScreenPlacement extends Placement {
  /** roof height above the screen, metres */
  roofY: number;
}

export interface CanopyPlan {
  ref: string;
  roofY: number;
  /** the edge beams' centre lines, one point per sample along the platform, in step */
  left: Pt[];
  right: Pt[];
  /** the columns (also in the plan's overlap check) */
  columns: Placement[];
  /** cross beams (left point, right point) at each column and at both ends of the roof */
  crossBeams: [Pt, Pt][];
}

export interface FurniturePlan {
  lamps: Placement[];
  benches: Placement[];
  helpPoints: Placement[];
  screens: ScreenPlacement[];
  canopies: CanopyPlan[];
}

const facing = (f: [number, number]): number => Math.atan2(f[0], f[1]);
const free = (placed: readonly { x: number; z: number; r: number }[], p: { x: number; z: number; r: number }): boolean =>
  placed.every((q) => Math.hypot(q.x - p.x, q.z - p.z) >= q.r + p.r + FIGURES.gap);
/** `steps` + 1 shifts from 0 to FIGURES.maxShift, in equal steps. */
const shifts = (steps: number): number[] => Array.from({ length: steps + 1 }, (_, i) => (FIGURES.maxShift * i) / steps);
/** True Euclidean check, whatever the band said: the piece's near side is at least the safety line from every track-facing edge. */
const behindSafetyLine = (f: Frame, p: Placement): boolean => distanceToEdges([p.x, p.z], f.edges) >= FIGURES.safetyLine + p.across;

/** Which side of the platform an item faces: toward the one track-facing edge, alternating where both sides are. */
function faceSide(b: Band, k: number): 1 | -1 {
  if (b.hiTrack && !b.loTrack) return 1;
  if (b.loTrack && !b.hiTrack) return -1;
  return k % 2 === 0 ? 1 : -1;
}

function canopyFor(f: Frame): CanopyPlan | null {
  const tA = f.tLo + FIGURES.canopyEnd;
  const tB = f.tHi - FIGURES.canopyEnd;
  if (tB <= tA) return null;
  const columnT: number[] = [];
  for (let t = tA + 6; t <= tB - 6 + 1e-9; t += FIGURES.canopyColumnSpacing) columnT.push(t);
  // sample at the ends, at every polygon vertex between them and at the columns: the outline is straight
  // between vertices, so the roof follows it exactly
  const raw: number[] = [tA, tB, ...columnT];
  for (const p of f.pts) {
    const t = dot2(p, f.axis);
    if (t > tA + 0.5 && t < tB - 0.5) raw.push(t);
  }
  raw.sort((p, q) => p - q);
  const ts = raw.filter((t, i) => i === 0 || t - (raw[i - 1] as number) > 0.05);
  const inset = FIGURES.canopyInset;
  const samples = ts.map((t) => {
    const sec = crossSection(f.pts, f.axis, t);
    return { t, sec: sec && sec.hi - sec.lo >= 2 * inset + FIGURES.canopyMinWidth ? sec : null };
  });
  // the longest unbroken run of valid samples
  let best: typeof samples = [];
  let cur: typeof samples = [];
  for (const s of samples) {
    if (s.sec) cur.push(s);
    else cur = [];
    if (cur.length > best.length) best = [...cur];
  }
  if (best.length < 2) return null;
  // the beams' centre lines, `inset` square to the platform edge on each side
  const across = (t: number, sec: Section): [Pt, Pt] => [
    worldPoint(f, t, sec.lo + squareTo(f, f.edges[sec.loEdge] as PlatformEdge, inset)),
    worldPoint(f, t, sec.hi - squareTo(f, f.edges[sec.hiEdge] as PlatformEdge, inset)),
  ];
  const ends = (s: (typeof samples)[number]): [Pt, Pt] => across(s.t, s.sec as Section);
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (const s of best) {
    const [l, r] = ends(s);
    left.push(l);
    right.push(r);
  }
  const tFirst = (best[0] as (typeof samples)[number]).t;
  const tLast = (best[best.length - 1] as (typeof samples)[number]).t;
  const columns: Placement[] = [];
  const crossBeams: [Pt, Pt][] = [ends(best[0] as (typeof samples)[number]), ends(best[best.length - 1] as (typeof samples)[number])];
  for (const t of columnT) {
    if (t < tFirst || t > tLast) continue;
    const b = bandAt(f, t, FIGURES.columnSize / 2);
    const sec = crossSection(f.pts, f.axis, t);
    if (!b || !sec) continue;
    const [x, z] = worldPoint(f, t, b.mid);
    columns.push({ ref: f.ref, x, z, rotY: 0, r: FIGURES.columnSize, across: FIGURES.columnSize / 2 });
    crossBeams.push(across(t, sec));
  }
  return { ref: f.ref, roofY: PLATFORM_HEIGHT + FIGURES.canopyHeight, left, right, columns, crossBeams };
}

/**
 * Where everything goes. For each platform 0-10 of the King's Cross zone:
 *  - canopies and their columns on 9 and 10 (a single row down the middle of the band that the
 *    safety line leaves, since the platforms are only about 4.8 m wide),
 *  - lamp standards on 9 and 10 (midway between columns, every second bay) and on the open ends of
 *    0-8 north of the shed's mouth (the shed lights its own platforms),
 *  - help points, then pairs of benches, each shifted along by up to 12 m if it would touch something,
 *  - departure screens along the middle of platforms 0-8, inside the shed only.
 * Pure: no three.js objects, so the tests can hold every rule to it.
 */
export function furniturePlan(data: FurnitureData, layout: FurnitureLayout): FurniturePlan {
  const outlines = surfacePlatforms(data).map((p) => p.pts);
  const tracks = trackSegments(data);
  const plan: FurniturePlan = { lamps: [], benches: [], helpPoints: [], screens: [], canopies: [] };
  const kx = stationPlatforms(data);
  const underShed = (p: Pt): boolean => {
    const { u, v } = worldToShed(layout, p);
    return u > -1 && u < layout.width + 1 && v > -1 && v < layout.length + 4;
  };
  for (const [index, ref] of PLATFORM_REFS.entries()) {
    const platform = kx.get(ref);
    if (!platform) continue;
    const f = platformFrame(ref, platform.pts, outlines.filter((o) => o !== platform.pts), layout, tracks);
    const placed: { x: number; z: number; r: number }[] = [];
    const canopyPlatform = CANOPY_REFS.has(ref);
    const axisFacing = facing(f.axis);

    // 1. the canopy and its columns
    if (canopyPlatform) {
      const c = canopyFor(f);
      if (c) {
        plan.canopies.push(c);
        placed.push(...c.columns);
      }
    }

    // 2. lamp standards
    const lampT: number[] = [];
    if (canopyPlatform) {
      for (let t = f.tLo + FIGURES.canopyEnd + 12; t <= f.tHi - FIGURES.canopyEnd - 6; t += FIGURES.lampSpacing) lampT.push(t);
    } else {
      lampT.push(...slots(f, FIGURES.lampSpacing, index * STAGGER.lamp, FIGURES.endSouth, FIGURES.endNorth));
    }
    lampT.forEach((t, k) => {
      const b = bandAt(f, t, FIGURES.lampRadius);
      if (!b) return;
      const [x, z] = worldPoint(f, t, b.mid);
      if (!canopyPlatform && underShed([x, z])) return;
      const side = faceSide(b, k);
      const p: Placement = { ref, x, z, rotY: facing([f.n[0] * side, f.n[1] * side]), r: FIGURES.lampRadius + 0.05, across: FIGURES.lampRadius };
      if (free(placed, p) && behindSafetyLine(f, p)) {
        plan.lamps.push(p);
        placed.push(p);
      }
    });

    // 3. help points, shifted along if something is in the way
    for (const t0 of slots(f, FIGURES.helpSpacing, 20 + index * STAGGER.help, FIGURES.endSouth, FIGURES.endNorth)) {
      for (const shift of shifts(4)) {
        const t = t0 + shift;
        const b = bandAt(f, t, 0.2);
        if (!b) continue;
        const [x, z] = worldPoint(f, t, b.mid);
        const p: Placement = { ref, x, z, rotY: axisFacing, r: 0.3, across: 0.2 };
        if (free(placed, p) && behindSafetyLine(f, p)) {
          plan.helpPoints.push(p);
          placed.push(p);
          break;
        }
      }
    }

    // 4. pairs of benches
    slots(f, FIGURES.benchSpacing, index * STAGGER.bench, FIGURES.endSouth, FIGURES.endNorth).forEach((t0, k) => {
      for (const shift of shifts(3)) {
        const pair: Placement[] = [];
        for (const dt of [-FIGURES.benchPairGap / 2, FIGURES.benchPairGap / 2]) {
          const t = t0 + shift + dt;
          const b = bandAt(f, t, FIGURES.benchDepth / 2);
          if (!b) break;
          const [x, z] = worldPoint(f, t, b.mid);
          const side = faceSide(b, k);
          pair.push({ ref, x, z, rotY: facing([f.n[0] * side, f.n[1] * side]), r: FIGURES.benchLength / 2 + 0.05, across: FIGURES.benchDepth / 2 });
        }
        if (pair.length === 2 && pair.every((p) => free(placed, p) && behindSafetyLine(f, p))) {
          plan.benches.push(...pair);
          placed.push(...pair);
          break;
        }
      }
    });

    // 5. departure screens, hung from the shed roof along the middle of the platform
    if (SHED_REFS.has(ref)) {
      for (const t of slots(f, FIGURES.screenSpacing, index * STAGGER.screen, FIGURES.endSouth, FIGURES.endNorth)) {
        const b = bandAt(f, t, FIGURES.screenWidth / 2);
        if (!b) continue;
        const [x, z] = worldPoint(f, t, b.mid);
        const { u, v } = worldToShed(layout, [x, z]);
        if (v < FIGURES.screenSouth || v > layout.length - FIGURES.screenNorth || u < 0.5 || u > layout.width - 0.5) continue;
        plan.screens.push({ ref, x, z, rotY: axisFacing, r: FIGURES.screenWidth / 2 + 0.05, across: FIGURES.screenWidth / 2, roofY: shedRoofY(layout, u) });
      }
    }
  }
  return plan;
}

// ---------------------------------------------------------------------------------------------
// the furniture meshes

const TIMBER = rgb(0x8a5d33);
const IRON = rgb(0x2a3036);
const LAMP_GLASS = rgb(0xf4e6b4);
const HELP_YELLOW = rgb(0xe9b52a);
const HELP_PANEL = rgb(0x1b2229);
const HELP_BUTTON = rgb(0xd13a30);

/** A lamp standard: base, pole and a short arm carrying a small lantern, leaning toward local +z. */
function lampGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const h = FIGURES.lampHeight;
  b.prism(0, 0, 0.13, 0, 0.4, 8, IRON);
  b.prism(0, 0, 0.055, 0.4, h, 6, IRON);
  b.box(-0.03, h - 0.1, 0, 0.03, h - 0.04, 0.5, IRON);
  b.box(-0.15, h - 0.2, 0.3, 0.15, h - 0.08, 0.68, LAMP_GLASS, true);
  b.box(-0.17, h - 0.08, 0.28, 0.17, h - 0.04, 0.7, IRON, true);
  return b.geometry();
}

/** A slatted bench with a back on four legs; the sitter faces +z. Three seat slats, two back slats. */
function benchGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const hl = FIGURES.benchLength / 2;
  const hd = FIGURES.benchDepth / 2;
  const seat = FIGURES.benchSeat;
  for (const z of [-0.17, 0, 0.17]) b.box(-hl, seat - 0.04, z - 0.07, hl, seat, z + 0.07, TIMBER, true);
  for (const y of [seat + 0.2, seat + 0.38]) b.box(-hl, y, -hd, hl, y + 0.12, -hd + 0.03, TIMBER, true);
  for (const x of [-hl + 0.04, hl - 0.04]) {
    b.box(x - 0.025, 0, -hd, x + 0.025, FIGURES.benchBack, -hd + 0.05, IRON, true); // the rear leg runs up to the top of the back
    b.box(x - 0.025, 0, hd - 0.05, x + 0.025, seat - 0.04, hd, IRON, true); // the front leg stops under the seat
  }
  return b.geometry();
}

/** A help point: a yellow post carrying a dark panel with a red button, the same on both faces. */
function helpPointGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const top = FIGURES.helpHeight;
  b.box(-0.05, 0, -0.05, 0.05, top - 0.7, 0.05, HELP_YELLOW);
  b.box(-0.17, top - 0.7, -0.04, 0.17, top, 0.04, HELP_PANEL, true);
  b.box(-0.17, top - 0.16, -0.045, 0.17, top, 0.045, HELP_YELLOW, true);
  for (const z of [-1, 1]) b.box(-0.045, top - 0.42, z * 0.04, 0.045, top - 0.33, z * 0.065, HELP_BUTTON, true);
  return b.geometry();
}

/** The screen's four edges, a frame with open faces, as group 0, and the two faces as group 1. */
function screenGeometry(): THREE.BufferGeometry {
  const hw = FIGURES.screenWidth / 2;
  const hh = FIGURES.screenHeight / 2;
  const hd = FIGURES.screenDepth / 2;
  const frame = new MeshBuilder();
  const dark = rgb(0x0d1014);
  frame.face([[-hw, hh, -hd], [hw, hh, -hd], [hw, hh, hd], [-hw, hh, hd]], [0, 1, 0], undefined, dark);
  frame.face([[-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd]], [0, -1, 0], undefined, dark);
  frame.face([[-hw, -hh, -hd], [-hw, hh, -hd], [-hw, hh, hd], [-hw, -hh, hd]], [-1, 0, 0], undefined, dark);
  frame.face([[hw, -hh, -hd], [hw, hh, -hd], [hw, hh, hd], [hw, -hh, hd]], [1, 0, 0], undefined, dark);
  const faces = new MeshBuilder();
  const e = 0.002;
  // seen from +z the image reads left to right along +x; seen from -z, along -x: the same picture on both sides
  faces.face([[-hw, -hh, hd + e], [hw, -hh, hd + e], [hw, hh, hd + e], [-hw, hh, hd + e]], [0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  faces.face([[hw, -hh, -hd - e], [-hw, -hh, -hd - e], [-hw, hh, -hd - e], [hw, hh, -hd - e]], [0, 0, -1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  const a = frame.geometry();
  const b = faces.geometry();
  const merged = mergeGeometries([a, b], true) as THREE.BufferGeometry;
  a.dispose();
  b.dispose();
  return merged;
}

/** A unit-long vertical rod from y = 0 to 1; each instance scales y to its own length. */
function rodGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.prism(0, 0, FIGURES.rodRadius, 0, 1, 6, rgb(0x2a3036));
  return b.geometry();
}

/** A drawing of rows of amber blocks on black: abstract on purpose, no readable times or destinations. Null where there is no document. */
function screenTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 150;
  const g = c.getContext('2d');
  if (!g) return null;
  const r = rng(71);
  g.fillStyle = '#06080a';
  g.fillRect(0, 0, 256, 150);
  g.fillStyle = '#ffb02e';
  g.fillRect(10, 9, 118, 9); // the header bar
  g.fillRect(206, 9, 40, 9);
  g.fillStyle = 'rgba(255,176,46,0.35)';
  g.fillRect(10, 24, 236, 2);
  for (let row = 0; row < 5; row++) {
    const y = 34 + row * 23;
    g.fillStyle = 'rgba(255,176,46,0.9)';
    for (let k = 0; k < 4; k++) g.fillRect(10 + k * 9 + (k > 1 ? 4 : 0), y, 6, 12); // a time, as four blocks
    let x = 62;
    const end = 150 + r() * 30;
    while (x < end) {
      const w = 6 + Math.floor(r() * 14);
      g.fillRect(x, y + (r() < 0.15 ? 3 : 0), w, r() < 0.15 ? 9 : 12); // a destination, as letter-sized blocks
      x += w + 4 + (r() < 0.2 ? 6 : 0);
    }
    g.fillRect(206, y, 10, 12); // the platform
    g.fillStyle = 'rgba(255,176,46,0.6)';
    g.fillRect(224, y + 3, 22, 7); // the status
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function setInstance(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, rotY: number, sy = 1): void {
  _q.setFromAxisAngle(_up, rotY);
  _p.set(x, y, z);
  _s.set(1, sy, 1);
  mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
}

function instanced(name: string, geometry: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], items: readonly Placement[], y: number): THREE.InstancedMesh | null {
  if (items.length === 0) return null;
  const mesh = new THREE.InstancedMesh(geometry, mat, items.length);
  mesh.name = name;
  items.forEach((it, i) => setInstance(mesh, i, it.x, y, it.z, it.rotY));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

let furnitureMat: THREE.MeshLambertMaterial | null = null;
const vertexColoured = (): THREE.MeshLambertMaterial => (furnitureMat ??= new THREE.MeshLambertMaterial({ vertexColors: true }));

let canopyGlassMat: THREE.Material | null = null;
/** material('glass') with a little emissive, so the roof reads as sky-lit glass from underneath too (a plain Phong roof is near-black from below). */
function canopyGlass(): THREE.Material {
  if (!canopyGlassMat) {
    const m = material('glass').clone() as THREE.MeshPhongMaterial;
    m.emissive.set(0x3a5670);
    m.name = 'canopyGlass';
    canopyGlassMat = m;
  }
  return canopyGlassMat;
}

/** The canopy of one platform: a flat translucent roof between two edge beams, cross beams, and the columns' steel. */
function canopyMeshes(c: CanopyPlan): { glass: MeshBuilder; steel: MeshBuilder } {
  const glass = new MeshBuilder();
  const steel = new MeshBuilder();
  const y = c.roofY;
  for (let i = 0; i + 1 < c.left.length; i++) {
    const l0 = c.left[i] as Pt;
    const l1 = c.left[i + 1] as Pt;
    const r0 = c.right[i] as Pt;
    const r1 = c.right[i + 1] as Pt;
    glass.face([[l0[0], y - 0.05, l0[1]], [l1[0], y - 0.05, l1[1]], [r1[0], y - 0.05, r1[1]], [r0[0], y - 0.05, r0[1]]], [0, 1, 0]);
  }
  const bw = FIGURES.beamWidth;
  const bd = FIGURES.beamDepth;
  for (const side of [c.left, c.right]) {
    for (let i = 0; i + 1 < side.length; i++) {
      const a = side[i] as Pt;
      const b = side[i + 1] as Pt;
      steel.beam([a[0], y - bd / 2, a[1]], [b[0], y - bd / 2, b[1]], bw, bd, WHITE);
    }
  }
  for (const [a, b] of c.crossBeams) steel.beam([a[0], y - FIGURES.crossDepth / 2, a[1]], [b[0], y - FIGURES.crossDepth / 2, b[1]], bw, FIGURES.crossDepth, WHITE);
  const half = FIGURES.columnSize / 2;
  for (const col of c.columns) steel.box(col.x - half, PLATFORM_HEIGHT, col.z - half, col.x + half, y - FIGURES.crossDepth, col.z + half, WHITE, true);
  return { glass, steel };
}

/** Counts, for logging and the dev page. */
export function describePlan(plan: FurniturePlan): Record<string, number> {
  return {
    lamps: plan.lamps.length,
    benches: plan.benches.length,
    helpPoints: plan.helpPoints.length,
    screens: plan.screens.length,
    canopies: plan.canopies.length,
    columns: plan.canopies.reduce((n, c) => n + c.columns.length, 0),
  };
}

/**
 * The furniture: lamp standards, benches, help points, roof-hung screens and the canopies of platforms
 * 9 and 10, placed by furniturePlan. Every kind is one InstancedMesh (or one merged mesh), so it is a
 * handful of draw calls: lamps, benches, help-points, screens (two groups) and screen-rods, canopy-glass, canopy-steel.
 */
export function buildFurniture(data: FurnitureData, layout: FurnitureLayout): THREE.Group {
  const group = new THREE.Group();
  group.name = 'furniture';
  const plan = furniturePlan(data, layout);
  group.userData.plan = plan;
  group.userData.counts = describePlan(plan);
  const lit = vertexColoured();
  const add = (m: THREE.Object3D | null): void => {
    if (m) group.add(m);
  };
  add(instanced('lamps', lampGeometry(), lit, plan.lamps, PLATFORM_HEIGHT));
  add(instanced('benches', benchGeometry(), lit, plan.benches, PLATFORM_HEIGHT));
  add(instanced('help-points', helpPointGeometry(), lit, plan.helpPoints, PLATFORM_HEIGHT));

  if (plan.screens.length > 0) {
    const tex = screenTexture();
    const face = new THREE.MeshBasicMaterial(tex ? { map: tex } : { color: 0x5a3b08 });
    face.name = 'screenFace';
    const panelY = PLATFORM_HEIGHT + FIGURES.screenBottom + FIGURES.screenHeight / 2;
    add(instanced('screens', screenGeometry(), [lit, face], plan.screens, panelY));
    const rods = new THREE.InstancedMesh(rodGeometry(), lit, plan.screens.length * 2);
    rods.name = 'screen-rods';
    const rodBase = PLATFORM_HEIGHT + FIGURES.screenBottom + FIGURES.screenHeight;
    plan.screens.forEach((s, i) => {
      const length = Math.max(0.05, s.roofY - FIGURES.rodBelowRoof - rodBase);
      // the rods sit either side of the panel's middle, across the platform (local x)
      const ax = Math.cos(s.rotY);
      const az = -Math.sin(s.rotY);
      for (const [k, side] of [-1, 1].entries()) setInstance(rods, i * 2 + k, s.x + ax * side * FIGURES.rodGap / 2, rodBase, s.z + az * side * FIGURES.rodGap / 2, 0, length);
    });
    rods.instanceMatrix.needsUpdate = true;
    rods.computeBoundingSphere();
    add(rods);
  }

  if (plan.canopies.length > 0) {
    const glass = new MeshBuilder();
    const steel = new MeshBuilder();
    for (const c of plan.canopies) {
      const m = canopyMeshes(c);
      glass.append(m.glass);
      steel.append(m.steel);
    }
    const roof = new THREE.Mesh(glass.geometry(), canopyGlass());
    roof.name = 'canopy-glass';
    roof.renderOrder = 2;
    add(roof);
    const frame = new THREE.Mesh(steel.geometry(), material('whiteSteel'));
    frame.name = 'canopy-steel';
    add(frame);
  }
  return group;
}
