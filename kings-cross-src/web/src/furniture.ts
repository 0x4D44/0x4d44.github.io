// Platforms and what stands on them, for the King's Cross model: the platform surfaces with their
// edge strips (coping, yellow tactile strip, white line), the instanced furniture (lamp standards,
// benches, help points, departure totems standing on the shed's platforms) and the canopies of platforms
// 9 and 10. Procedural: no image assets, and the only texture drawn here is the totems' screen face.
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
// given by the brief as working figures and no external source was read for them, except the totems,
// measured from a photograph (see FIGURES).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { railShapes, shapeFrom } from '../../core/curves.ts';
import type { Pt } from '../../core/geo.ts';
import type { KxData } from '../../core/osm.ts';
import { PLATFORM_HEIGHT } from '../../core/scene.ts';
import { isSurfacePlatform, longAxis, platformDrawingOutline, PLATFORM_9_OUTLINE_BASIS, PLATFORM_REFS, pointInPolygon, SHED_PLATFORM_REFS, SHED_SPAN_WIDTH, shedToWorld, stationPlatforms, worldToShed } from '../../core/station.ts';
import { eastArcadeU, PLATFORM_CLOCK, ribPositions, SPINE_WALL, westernPassages } from './shed.ts';
import type { ShedLayout } from '../../core/station.ts';
import { Batch, material, rgb, rng, TEXTURES, windowNight } from './materials.ts';
import type { Rgb, V3 } from './materials.ts';
import { GROUND_Y } from './world.ts';

/** The parts of the shed layout this module reads. */
export type FurnitureLayout = Pick<ShedLayout, 'origin' | 'heading' | 'width' | 'length' | 'spine' | 'springing'>;
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
  /** Platforms 9 and 10: pendant lamps under the canopy's longitudinal beam, one every half column bay, midway between the columns and
   *  the bay middles, metres. shed-f (R-kx-shed-interior-f) shows industrial pendants hung from the roof steel, one or two to a bay:
   *  MEASURED in memory (rough); the half-bay pitch is what gives the platform even pools at night. The lamp itself (the bell's glass at
   *  lampHeight - 0.14, the height the night layer lights from) is ASSUMED. */
  pendantSpacing: 7.5,

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

  // --- departure totems: free-standing posts on the shed's platforms (0-8), a screen on each face
  // R-kx-shed-interior-a (shed-a-north-from-footbridge-2019, 1600 px, measured in memory): no screen hangs from the roof; each platform's
  // information stands on a slab totem near the footbridge, its faces along the platform (seen face-on looking north), a navy header with
  // white lettering over a black screen of amber rows. MEASURED (rough, +-25%: the scale is a bicycle wheel beside it, about 83 px/m): the
  // totem 90-97 px wide (about 1.0-1.15 m), its navy header 0.6-0.8 of the width deep, the screen under it at least 1.15 widths tall and about
  // 0.85 of the width across. The base is out of frame: the 2.5 m height and the 0.25 m depth are ASSUMED.
  /** Slab 1.0 m wide (across the platform), 0.25 m deep (along it), 2.5 m tall. */
  totemWidth: 1.0,
  totemDepth: 0.25,
  totemHeight: 2.5,
  /** The navy header at the top, metres deep. MEASURED rough (0.6-0.8 of the width). */
  totemHeader: 0.65,
  /** The screen on each face: 0.85 x 1.1 m, its top 0.05 m under the header. MEASURED rough. */
  screenWidth: 0.85,
  screenHeight: 1.1,
  /** Two totems a platform, 100 m apart along the shed from 20 m inside its south front. ASSUMED: shed-a shows one per platform near the
   *  footbridge and none north of it in the ~100 m of platform in view; the second covers the south half the photograph does not show. */
  totemSpacing: 100,
  totemSouth: 20,
  totemNorth: 6,
  /** Within this of an arcaded wall's line (the west wall, the spine, the east arcade) a totem stands in front of a pier, not an opening, metres. ASSUMED. */
  totemWallReach: 6,
  /** A totem keeps this much clear of a bench's footprint circle, metres: ASSUMED (the lead asked for at least 1.0 m; the scorer saw one stand
   *  right behind a bench seen down the platform, so a bench seat does not overlap its foot from the next bench along either). */
  totemBenchGap: 3.5,
  // --- pole clocks: shed-a shows small digital clocks ("14:24", amber on black) on slim posts among the platforms, a pair of displays side by
  // side on a short crossbar. MEASURED in memory (rough, +-30%): each display about 50 x 18 px where the totems are about 90 px (1.0 m) wide
  // nearer the camera, so about 0.65 x 0.25 m; their foot hidden, their tops level with the train roofs, about 2.9 m over the platform.
  // The post, the bar and the boxes' depth are ASSUMED. One a platform (or shared island), beside its middle totem.
  clockHeight: 2.9,
  clockWidth: 0.65,
  clockTall: 0.25,

  // --- canopies (platforms 9 and 10). MEASURED in memory from R-kx-shed-interior-f (shed-f-suburban-platforms-2022.jpg, looking south along
  // platform 9 toward the buffers, at the steel roof over 9-10; the gap scan corrected 'north', and the figures below are distances, so they stand): eye about 1.6 m over the platform, horizon about y 570 of 1200, a 26 mm-equivalent lens (f ~ 1165 px).
  // The column bases on the far platform sit at y 655, 615, 603, 597, 592 (distances f x 1.6 / dy ~ 22, 41, 56, 69, 85 m): a bay of about 15 m
  // (+-25%). The nearest column rises 270 px over its base at 53 px/m: about 5.1 m to the underside of the roof steel. Over it the roof is a
  // grid of black lattice trusses (X-braced, about a fifth of the column height deep, ~1.2 m) under a near-flat roof of dark corrugated
  // sheet with glazed strips running ACROSS the platform, two to a column bay, each about a third of its half-bay. The steel is painted
  // near-black (sampled about #26292c in shade); the sheet's underside is a dark grey (about #4a4b4a). No valance or fascia board: the edge is
  // the lattice girder's top chord, with a small gutter. Knee braces tie each column to the beam over it.
  /** Roof (sheet) height above the platform top, metres: the 5.2 m column plus the 1.2 m truss. MEASURED (rough, +-15%). */
  canopyHeight: 6.4,
  /** Distance between columns along the platform, metres. MEASURED (rough, +-25%). */
  canopyColumnSpacing: 15,
  /** Depth of the roof's lattice trusses and girders under the sheet, metres. MEASURED (rough, +-30%). */
  canopyTrussDepth: 1.2,
  /** Width of one glazed strip across the roof, metres; there are two to a column bay (a pitch of half the bay). MEASURED (rough, +-30%). */
  canopyGlazeWidth: 2.5,
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

/** How far along the platform from its totem a pole clock stands, tried in turn: one or two rib bays (RIB_SPACING 6.1 m), so it too stands before a pier
 *  where a wall is near, as the totem (on a rib's v) does. ASSUMED. */
const CLOCK_OFFSETS = [6.1, -6.1, 12.2, -12.2] as const;
const STAGGER = { lamp: 5.9, bench: 13.1, help: 29.3 } as const;
const CANOPY_REFS: ReadonlySet<string> = new Set(['9', '10']);
const SHED_REFS: ReadonlySet<string> = new Set(SHED_PLATFORM_REFS);

// ---------------------------------------------------------------------------------------------
// small vector helpers

const WHITE: Rgb = [1, 1, 1];
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const dot2 = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1];

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
// shapes on the shared mesh builder (a coloured Batch from materials.ts: positions, normals, UVs, a colour per vertex)

/** A batch for the furniture: a colour per vertex, white unless a shape says otherwise. */
const newBatch = (): Batch => new Batch({ colored: true });

/** A vertical prism with `sides` flat faces and a flat top. */
function addPrism(b: Batch, cx: number, cz: number, r: number, y0: number, y1: number, sides: number, c: Rgb): void {
  const cap: V3[] = [];
  for (let i = 0; i < sides; i++) {
    const a0 = ((i + 0.5) / sides) * Math.PI * 2;
    const a1 = ((i + 1.5) / sides) * Math.PI * 2;
    const p0: [number, number] = [cx + r * Math.cos(a0), cz + r * Math.sin(a0)];
    const p1: [number, number] = [cx + r * Math.cos(a1), cz + r * Math.sin(a1)];
    const m = (a0 + a1) / 2;
    b.poly([[p0[0], y0, p0[1]], [p1[0], y0, p1[1]], [p1[0], y1, p1[1]], [p0[0], y1, p0[1]]], undefined, { normal: [Math.cos(m), 0, Math.sin(m)], color: c });
    cap.push([p0[0], y1, p0[1]]);
  }
  b.poly(cap, undefined, { normal: [0, 1, 0], color: c });
}

/** A beam along a-b with a horizontal width `w` and a depth `h`, closed at both ends. */
function addBeam(batch: Batch, a: V3, b: V3, w: number, h: number, c: Rgb): void {
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
  const face = (pts: V3[], normal: V3): void => batch.poly(pts, undefined, { normal, color: c });
  face([corner(b, -1, -1), corner(b, 1, -1), corner(b, 1, 1), corner(b, -1, 1)], d);
  face([corner(a, -1, -1), corner(a, 1, -1), corner(a, 1, 1), corner(a, -1, 1)], neg(d));
  face([corner(a, 1, -1), corner(b, 1, -1), corner(b, 1, 1), corner(a, 1, 1)], side);
  face([corner(a, -1, -1), corner(b, -1, -1), corner(b, -1, 1), corner(a, -1, 1)], neg(side));
  face([corner(a, -1, 1), corner(b, -1, 1), corner(b, 1, 1), corner(a, 1, 1)], up);
  face([corner(a, -1, -1), corner(b, -1, -1), corner(b, 1, -1), corner(a, 1, -1)], neg(up));
}

// ---------------------------------------------------------------------------------------------
// platform outlines: which edge is which

export type PlatformEdgeKind = 'track' | 'end' | 'wall' | 'shared' | 'open';

/** One straight piece of running rail, [from, to] in world (x, z). */
export type TrackSegment = [Pt, Pt];

/** The surface rails of the data as the pieces of their drawn curves (core/curves.ts), or undefined when it does not carry them. */
export function trackSegments(data: Partial<Pick<KxData, 'nodes' | 'rails'>>): TrackSegment[] | undefined {
  if (!data.nodes || !data.rails) return undefined;
  const pos = new Map<number, Pt>();
  for (const [id, x, z] of data.nodes) pos.set(id, [x, z]);
  const shapes = railShapes({ nodes: data.nodes, rails: data.rails });
  const out: TrackSegment[] = [];
  for (const r of data.rails) {
    if (r.tunnel) continue;
    for (let i = 0; i + 1 < r.nodes.length; i++) {
      const a = pos.get(r.nodes[i] as number);
      const b = pos.get(r.nodes[i + 1] as number);
      if (!a || !b) continue;
      const curve = shapeFrom(shapes, r.nodes[i] as number, r.nodes[i + 1] as number) ?? [a, b];
      for (let k = 0; k + 1 < curve.length; k++) out.push([curve[k] as Pt, curve[k + 1] as Pt]);
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
export function surfacePlatforms(data: FurnitureData): { id: number; ref?: string; pts: Pt[] }[] {
  return data.platforms.filter((p) => p.pts.length >= 3 && isSurfacePlatform(p)).map(p => {
    const pts = platformDrawingOutline(p, data);
    return pts === p.pts ? p : { ...p, pts };
  });
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

function addTop(b: Batch, pts: readonly Pt[]): void {
  const contour = pts.map((p) => new THREE.Vector2(p[0], p[1]));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []) as number[][];
  const at = (i: number): V3 => [(pts[i] as Pt)[0], PLATFORM_HEIGHT, (pts[i] as Pt)[1]];
  const uv = (i: number): [number, number] => [(pts[i] as Pt)[0], -(pts[i] as Pt)[1]];
  for (const t of tris) {
    const [i, j, k] = t as [number, number, number];
    b.poly([at(i), at(j), at(k)], [uv(i), uv(j), uv(k)], { normal: [0, 1, 0] });
  }
}

function addWalls(b: Batch, edges: readonly PlatformEdge[]): void {
  let run = 0;
  for (const e of edges) {
    // a seam between two polygons is inside one slab of platform: no wall there
    if (e.kind !== 'shared' && e.length > 1e-6) {
      const out: V3 = [-e.inward[0], 0, -e.inward[1]];
      b.poly(
        [[e.a[0], GROUND_Y, e.a[1]], [e.b[0], GROUND_Y, e.b[1]], [e.b[0], PLATFORM_HEIGHT, e.b[1]], [e.a[0], PLATFORM_HEIGHT, e.a[1]]],
        [[run, GROUND_Y], [run + e.length, GROUND_Y], [run + e.length, PLATFORM_HEIGHT], [run, PLATFORM_HEIGHT]],
        { normal: out },
      );
    }
    run += e.length;
  }
}

/** An edge strip whose edge runs within this of the z axis (radians) takes the tops' world v, so its joints line up with theirs (round 17). */
export const STRIP_WORLD_V = (10 * Math.PI) / 180;
/**
 * How far the King's Cross edge strips sit above the tops, metres (round 18). The strip carries the tops' joints on in world v (round 17), but at FIGURES.stripLift
 * (12 mm, Waverley's and Perth's still) the same joint drawn 12 mm higher projects about 2-3 px higher from a 1.6 m eye a few metres off (dy d / (h^2 + d^2) rad):
 * the scorer's joint jog at the boundary (platform-round-5, section 3). The strip's material is pulled forward by a polygon offset (materials.ts nearer), so 1 mm is
 * only a tie-breaker, and the step is under a quarter of a pixel.
 */
export const SHED_STRIP_LIFT = 0.001;
/**
 * Whether a point of an edge strip is under the shed's roof (round 18, platform-round-5 section 3: after dark the coping floor (materials.ts COPING_NIGHT) lit
 * the suburban and throat platforms' copings too, a flat strip brighter than their lamp pools). In shed coordinates: across the train shed (u 0 to width) and
 * along it (v 0 to length). The strip carries it per vertex as `kxCover` (1 under the roof, 0 outside), which the coping's night floor is scaled by.
 */
export function underShedRoof(layout: Pick<ShedLayout, 'origin' | 'heading' | 'width' | 'length'>, p: Pt): boolean {
  const { u, v } = worldToShed(layout, p);
  return u >= 0 && u <= layout.width && v >= 0 && v <= layout.length;
}
function addStrip(b: Batch, chain: StripChain, edges: readonly PlatformEdge[], layout: Pick<ShedLayout, 'origin' | 'heading' | 'width' | 'length'>): void {
  const y = PLATFORM_HEIGHT + SHED_STRIP_LIFT;
  for (let k = 0; k + 1 < chain.outer.length; k++) {
    const e = edges[chain.edges[k] as number] as PlatformEdge;
    const s0 = chain.s[k] as number;
    // UVs in metres, read off the corners themselves so they hold however a corner was cut:
    // u = distance in from the edge (the coping is u = 0), v = distance along it from the start of the run.
    // Round 16's scorer (platform-round-4, the joint jog): on an edge that runs along the platforms (within STRIP_WORLD_V of the z axis), v is the world's -z,
    // as the tops' is (addTop), so the strip's slab joints (materials.ts PLATFORM_JOINT) are the tops' lines carried on across it, not a course of their own
    // at a phase and an angle (the edge's 1-2 degrees off z) of the run's start.
    const worldV = Math.abs(e.dir[1]) >= Math.cos(STRIP_WORLD_V);
    const uvOf = (p: Pt): [number, number] => {
      const rel: Pt = [p[0] - e.a[0], p[1] - e.a[1]];
      return [dot2(rel, e.inward), worldV ? -p[1] : s0 + dot2(rel, e.dir)];
    };
    // the quad cut where its outer and inner sides both cross one of the roof's two ends (shed v = 0 and v = length), so each piece is a quad wholly under
    // the roof or wholly outside it (a quad whose end-cut side is the one crossing is left whole, and takes the cover of its middle)
    type Q = [Pt, Pt, Pt, Pt]; // outer start, outer end, inner end, inner start
    let pieces: Q[] = [[chain.outer[k], chain.outer[k + 1], chain.inner[k + 1], chain.inner[k]] as Q];
    const lerp = (p: Pt, q: Pt, t: number): Pt => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    const cross = (p: Pt, q: Pt, vb: number): number => {
      const a = worldToShed(layout, p).v - vb, c = worldToShed(layout, q).v - vb;
      return a * c < 0 ? a / (a - c) : NaN;
    };
    for (const vb of [0, layout.length]) {
      pieces = pieces.flatMap(([o0, o1, i1, i0]): Q[] => {
        const to = cross(o0, o1, vb), ti = cross(i0, i1, vb);
        if (Number.isNaN(to) || Number.isNaN(ti)) return [[o0, o1, i1, i0]];
        const om = lerp(o0, o1, to), im = lerp(i0, i1, ti);
        return [[o0, om, im, i0], [om, o1, i1, im]];
      });
    }
    for (const poly of pieces) {
      const c: Pt = [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
      const cover = underShedRoof(layout, c) ? 1 : 0;
      b.poly(poly.map((p): V3 => [p[0], y, p[1]]), poly.map(uvOf), { normal: [0, 1, 0], color: [cover, cover, cover] });
    }
  }
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
  group.userData.outlineInferences = polys.filter(p => p.pts !== data.platforms.find(q => q.id === p.id)?.pts)
    .map(p => ({ platform: p.ref, ...PLATFORM_9_OUTLINE_BASIS }));
  const outlines = polys.map((p) => p.pts);
  const tracks = trackSegments(data);
  const tops = newBatch();
  const walls = newBatch();
  const strips = newBatch();
  let stripRuns = 0;
  for (const [i, p] of polys.entries()) {
    const edges = classifyEdges(p.pts, outlines.filter((_, j) => j !== i), layout, tracks);
    addTop(tops, p.pts);
    addWalls(walls, edges);
    for (const chain of stripChains(edges)) {
      addStrip(strips, chain, edges, layout);
      stripRuns++;
    }
  }
  const parts: [string, Batch, THREE.Material][] = [
    ['platform-tops', tops, material('platformTop')], // round 16: the asphalt with slab joints, its own texture (materials.ts platformTop)
    ['platform-walls', walls, material('concrete')],
    ['platform-edges', strips, material('platformEdgeStripShed')], // round 18: its own material, the night floor under the roof only (the colour's red)
  ];
  for (const [name, builder, mat] of parts) {
    if (builder.count === 0) continue;
    const geo = builder.build();
    if (builder === strips) {
      // round 18: the strip's cover (addStrip: its colour's red) as `kxCover`, the coping's night floor's scale (materials.ts copingNight); the colour itself tints nothing
      const col = geo.getAttribute('color');
      geo.setAttribute('kxCover', new THREE.BufferAttribute(Float32Array.from({ length: col.count }, (_, i) => col.getX(i)), 1));
      geo.deleteAttribute('color');
    }
    const mesh = new THREE.Mesh(geo, mat);
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
  /** the shed's arcaded walls on the floor (the spine wall and the east arcade), world (x, z) at their south (v = 0) and north (v = length)
   *  ends, when the layout has a spine: bandAt keeps clear of them */
  walls?: [Pt, Pt][];
}

export function platformFrame(
  ref: string,
  pts: readonly Pt[],
  others: readonly Pt[][],
  layout: Pick<ShedLayout, 'origin' | 'heading' | 'width' | 'length'> & Partial<Pick<ShedLayout, 'spine'>>,
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
  const sp = layout.spine;
  const walls: [Pt, Pt][] | undefined = sp === undefined ? undefined : [sp, eastArcadeU({ spine: sp })].map((u): [Pt, Pt] => [shedToWorld(layout, u, 0), shedToWorld(layout, u, layout.length)]);
  return { ref, pts, edges: classifyEdges(pts, others, layout, tracks), axis, n: [-axis[1], axis[0]], tLo, tHi, ...(walls ? { walls } : {}) };
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
export function bandAt(f: Frame, t: number, half: number, floor = true): Band | null {
  const sec = crossSection(f.pts, f.axis, t);
  if (!sec) return null;
  const lo = f.edges[sec.loEdge] as PlatformEdge;
  const hi = f.edges[sec.hiEdge] as PlatformEdge;
  const setback = (e: PlatformEdge): number => squareTo(f, e, (e.kind === 'track' ? FIGURES.safetyLine + FIGURES.safetySlack : FIGURES.otherMargin) + half);
  let s0 = sec.lo + setback(lo);
  let s1 = sec.hi - setback(hi);
  // the spine wall (web/src/shed.ts SPINE_WALL) stands on the 4/5 island, near but not on its shared edge (the island leans 0.25 degrees off
  // the shed's axis): where it crosses or runs beside this section, a floor item keeps half the wall's thickness and SPINE_WALL.clear from its line
  const w = floor ? spineAt(f, t, sec, SPINE_WALL.thick / 2 + SPINE_WALL.clear + half) : null;
  if (w) {
    if (w.s <= (sec.lo + sec.hi) / 2) s0 = Math.max(s0, w.s + w.cross);
    else s1 = Math.min(s1, w.s - w.cross);
  }
  if (s1 < s0) return null;
  return { s0, s1, mid: (s0 + s1) / 2, loTrack: lo.kind === 'track', hiTrack: hi.kind === 'track' };
}

/**
 * Where the nearer arcaded wall (the spine wall or the east arcade) crosses the section at t (s, across), when it crosses within `keep` of the platform, and `keep` squared to
 * the section (the island leans off the axis, so a distance square to the wall is a little longer along the section).
 */
function spineAt(f: Frame, t: number, sec: { lo: number; hi: number }, keep: number): { s: number; cross: number } | null {
  let best: { s: number; cross: number } | null = null;
  const p = worldPoint(f, t, 0), mid = (sec.lo + sec.hi) / 2;
  for (const [a, b] of f.walls ?? []) {
    const d: Pt = [b[0] - a[0], b[1] - a[1]];
    // the section is p + s n; the wall is a + w d: solve for s and w
    const det = f.n[0] * -d[1] + d[0] * f.n[1];
    if (Math.abs(det) <= 1e-9) continue;
    const rx = a[0] - p[0], rz = a[1] - p[1];
    const s = (rx * -d[1] + d[0] * rz) / det, w = (f.n[0] * rz - f.n[1] * rx) / det;
    if (w < 0 || w > 1 || s <= sec.lo - keep || s >= sec.hi + keep) continue;
    const l = Math.hypot(d[0], d[1]);
    if (!best || Math.abs(s - mid) < Math.abs(best.s - mid)) best = { s, cross: squareTo(f, { dir: [d[0] / l, d[1] / l] }, keep) };
  }
  return best;
}

/** Along-platform positions at `spacing`, starting `south` metres in (plus a phase) and stopping `north` metres short of the far end. */
function slots(f: Frame, spacing: number, phase: number, south: number, north: number): number[] {
  const out: number[] = [];
  for (let t = f.tLo + south + (phase % spacing); t <= f.tHi - north; t += spacing) out.push(t);
  return out;
}

/** The roof height over the shed floor at across-coordinate u: the two circular arches, the flat aisles at the springing line. */
export function shedRoofY(layout: Pick<ShedLayout, 'spine' | 'springing'>, u: number): number {
  const r = SHED_SPAN_WIDTH / 2;
  for (const k of [-1, 1]) {
    const d = Math.abs(u - (layout.spine + k * r));
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
  /** hung from the roof (the canopies' pendant lamps): nothing on the floor, so the floor furniture does not keep clear of it */
  overhead?: true;
}


/** A departure totem: the platforms it serves (one, or an island's two) and the number its header shows. */
export interface TotemPlacement extends Placement {
  refs: string[];
  label: string;
}

/**
 * The islands whose two halves are both platforms with nothing between them, so one totem serves both, as shed-a shows on 6/7 ("Platform 6 /
 * Platform 7"). 4/5 and 0/1 are islands in the OSM data too, but the spine wall and the east arcade stand between their halves, so each keeps its own.
 */
export const TOTEM_ISLANDS: readonly (readonly [string, string])[] = [['2', '3'], ['6', '7']];
/** The shed's platforms grouped as the totems serve them: an island of TOTEM_ISLANDS together, every other platform alone. */
export function totemGroups(refs: readonly string[]): string[][] {
  const out: string[][] = [];
  for (const ref of refs) {
    const island = TOTEM_ISLANDS.find((i) => i.includes(ref));
    if (!island) out.push([ref]);
    else if (island[0] === ref) out.push([...island]);
  }
  return out;
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
  /** the distance along the platform axis of each left/right sample */
  ts: number[];
  /** the glazed strips across the roof, as [from, to] along the platform axis (the rest of the roof is sheet) */
  glazing: [number, number][];
  /** the height of the columns' tops: the underside of the roof's trusses */
  columnTopY: number;
}

export interface FurniturePlan {
  lamps: Placement[];
  benches: Placement[];
  helpPoints: Placement[];
  /** departure totems on the shed's platforms */
  totems: TotemPlacement[];
  /** pole clocks, one beside a totem of each platform or shared island */
  clocks: Placement[];
  /** round 16: bins, platform-number blades and trolley points, one of each a platform or shared island (EXTRAS) */
  extras: ExtraPlacement[];
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
  // the first column half a bay in from the roof's end
  const halfBay = FIGURES.canopyColumnSpacing / 2;
  for (let t = tA + halfBay; t <= tB - halfBay + 1e-9; t += FIGURES.canopyColumnSpacing) columnT.push(t);
  // sample at the ends and at every polygon vertex between them: the outline is straight between vertices, so the roof follows it
  // exactly (the cross beams at the columns are cut from the outline itself, and the mesh reads the lines between samples)
  const raw: number[] = [tA, tB];
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
    // r: the base plate's half-diagonal (0.5 m square), so nothing stands on it
    columns.push({ ref: f.ref, x, z, rotY: 0, r: Math.SQRT2 * 0.25, across: FIGURES.columnSize / 2 });
    crossBeams.push(across(t, sec));
  }
  // two glazed strips to a column bay, centred a quarter and three quarters of the way along it, clipped to the roof
  const pitch = FIGURES.canopyColumnSpacing / 2;
  const glazing: [number, number][] = [];
  const t0 = (columnT[0] ?? tFirst) + pitch / 2;
  for (let k = Math.floor((tFirst - t0) / pitch); t0 + k * pitch - FIGURES.canopyGlazeWidth / 2 < tLast; k++) {
    const lo = Math.max(tFirst, t0 + k * pitch - FIGURES.canopyGlazeWidth / 2);
    const hi = Math.min(tLast, t0 + k * pitch + FIGURES.canopyGlazeWidth / 2);
    if (hi - lo > 0.2) glazing.push([lo, hi]);
  }
  const roofY = PLATFORM_HEIGHT + FIGURES.canopyHeight;
  return { ref: f.ref, roofY, left, right, columns, crossBeams, ts: best.map((s) => s.t), glazing, columnTopY: roofY - FIGURES.canopyTrussDepth };
}

/**
 * Where everything goes. For each platform 0-10 of the King's Cross zone:
 *  - canopies and their columns on 9 and 10 (a single row down the middle of the band that the
 *    safety line leaves, since the platforms are only about 4.8 m wide),
 *  - lamp standards on 9 and 10 (every 24 m from midway in the first column bay, so never at a column) and on the open ends of
 *    0-8 north of the shed's mouth (the shed lights its own platforms),
 *  - help points, then pairs of benches, each shifted along by up to 12 m if it would touch something,
 *  - two departure totems on each of platforms 0-8, inside the shed only, each before a pier where an arcaded wall is near.
 * Pure: no three.js objects, so the tests can hold every rule to it.
 */
export function furniturePlan(data: FurnitureData, layout: FurnitureLayout): FurniturePlan {
  // Reconstructing the platform end does not locate a longer canopy or new furniture.
  const outlines = surfacePlatforms({ platforms: data.platforms }).map((p) => p.pts);
  const tracks = trackSegments(data);
  const plan: FurniturePlan = { lamps: [], benches: [], helpPoints: [], totems: [], clocks: [], extras: [], canopies: [] };
  const kx = stationPlatforms(data);
  const underShed = (p: Pt): boolean => {
    const { u, v } = worldToShed(layout, p);
    return u > -1 && u < layout.width + 1 && v > -1 && v < layout.length + 4;
  };
  const shedFrames = new Map<string, { f: Frame; placed: { x: number; z: number; r: number }[] }>();
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

    // 2. lamp standards; on 9 and 10 pendant lamps hung under the canopy, a quarter bay either side of each column, over the roof's length
    const lampT: number[] = [];
    const canopy = plan.canopies.find((c) => c.ref === ref);
    if (canopyPlatform) {
      if (canopy) {
        const lo = (canopy.ts[0] as number) + 1;
        const hi = (canopy.ts[canopy.ts.length - 1] as number) - 1;
        const t0 = f.tLo + FIGURES.canopyEnd + FIGURES.pendantSpacing / 2;
        for (let t = t0 + Math.ceil((lo - t0) / FIGURES.pendantSpacing) * FIGURES.pendantSpacing; t <= hi + 1e-9; t += FIGURES.pendantSpacing) lampT.push(t);
      }
    } else {
      lampT.push(...slots(f, FIGURES.lampSpacing, index * STAGGER.lamp, FIGURES.endSouth, FIGURES.endNorth));
      // B7 night (b6-round-2 score: shed-interior's near platform, at platform 4's north tip, a flat dark slab): a platform whose last standard
      // falls more than half a spacing short of the north keep-clear gets one more, as near it as the platform is wide enough (1 m steps back)
      const last = lampT[lampT.length - 1];
      if (last !== undefined) for (let t = f.tHi - FIGURES.endNorth; t - last > FIGURES.lampSpacing / 2; t -= 1) if (bandAt(f, t, FIGURES.lampRadius)) { lampT.push(t); break; }
    }
    lampT.forEach((t, k) => {
      if (canopy) {
        // a pendant hangs over the roof's middle line, wherever the roof is (it needs no floor band), facing along the platform
        const l = lineAt(canopy.ts, canopy.left, t);
        const r = lineAt(canopy.ts, canopy.right, t);
        plan.lamps.push({ ref, x: (l[0] + r[0]) / 2, z: (l[1] + r[1]) / 2, rotY: axisFacing, r: FIGURES.lampRadius + 0.05, across: FIGURES.lampRadius, overhead: true });
        return;
      }
      const b = bandAt(f, t, FIGURES.lampRadius);
      if (!b) return;
      const [x, z] = worldPoint(f, t, b.mid);
      if (!canopyPlatform && underShed([x, z])) return;
      const side = faceSide(b, k);
      const p: Placement = { ref, x, z, rotY: facing([f.n[0] * side, f.n[1] * side]), r: FIGURES.lampRadius + 0.05, across: FIGURES.lampRadius };
      if (!canopyPlatform && free(placed, p) && behindSafetyLine(f, p)) {
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

    // 5. the departure totems go in after every platform's own furniture (below): an island's totem stands across both its halves
    if (SHED_REFS.has(ref)) shedFrames.set(ref, { f, placed });
  }

  // 5. departure totems, one at each FIGURES.totemSpacing mark, moved to the nearest rib's v that works, so a totem near an arcaded wall stands
  // before a pier (every wall's piers are under the ribs), out of the Western Concourse's gateline passages, FIGURES.totemBenchGap clear of every
  // bench and FIGURES.gap clear of everything else. A platform alone takes its totem in the middle of its band; an island whose two halves are
  // both platforms (TOTEM_ISLANDS) takes one, midway between the middles of its halves' bands, behind the safety line of both.
  const ribs = ribPositions(layout.length);
  const across = FIGURES.totemWidth / 2;
  const r = Math.hypot(across, FIGURES.totemDepth / 2) + 0.05;
  // the t whose band middle stands at shed v (the platforms run within a degree of the shed's axis, so a few steps converge)
  const tAtV = (f: Frame, v: number): number => {
    let t = (f.tLo + f.tHi) / 2;
    for (let k = 0; k < 6; k++) t += v - worldToShed(layout, worldPoint(f, t, bandAt(f, t, across)?.mid ?? 0)).v;
    return t;
  };
  const benches = new Set<object>(plan.benches);
  for (const refs of totemGroups(SHED_PLATFORM_REFS)) {
    const group = refs.map((ref) => shedFrames.get(ref)).filter((g): g is { f: Frame; placed: { x: number; z: number; r: number }[] } => !!g);
    if (group.length !== refs.length) continue;
    const near = group.flatMap((g) => g.placed);
    // the point midway between the group's band middles at shed v, half-width `half`, or null where one has no band there
    const pointAt = (v: number, half: number): { x: number; z: number; home: Frame } | null => {
      const pts: Pt[] = [];
      for (const { f } of group) {
        const t = tAtV(f, v);
        const b = t < f.tLo + FIGURES.endSouth || t > f.tHi - FIGURES.endNorth ? null : bandAt(f, t, half);
        if (b) pts.push(worldPoint(f, t, b.mid));
      }
      if (pts.length !== group.length) return null;
      const x = pts.reduce((a, q) => a + q[0], 0) / pts.length, z = pts.reduce((a, q) => a + q[1], 0) / pts.length;
      const home = group.find(({ f }) => pointInPolygon([x, z], [...f.pts]));
      return home ? { x, z, home: home.f } : null;
    };
    // round 19, second pass (the lead: the board stood square in front of the 6-7 blade post): every band edge at v, each frame's both sides, furthest first
    // from `from` across the shed (u); an island's halves each give theirs, so it can stand well to one side
    const edgesAt = (v: number, half: number, from: number): { x: number; z: number; home: Frame; off: number }[] => {
      const out: { x: number; z: number; home: Frame; off: number }[] = [];
      for (const { f } of group) {
        const t = tAtV(f, v);
        const b = t < f.tLo + FIGURES.endSouth || t > f.tHi - FIGURES.endNorth ? null : bandAt(f, t, half);
        if (!b) continue;
        for (const s of [b.s0, b.s1]) {
          const [x, z] = worldPoint(f, t, s);
          if (pointInPolygon([x, z], [...f.pts])) out.push({ x, z, home: f, off: Math.abs(worldToShed(layout, [x, z]).u - from) });
        }
      }
      return out.sort((a, b) => b.off - a.off);
    };
    const mine: TotemPlacement[] = [];
    for (let target = FIGURES.totemSouth; target <= layout.length - FIGURES.totemNorth; target += FIGURES.totemSpacing) {
      const order = ribs.filter((v) => v >= FIGURES.totemSouth - 3.1 && v <= layout.length - FIGURES.totemNorth).sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
      for (const rib of order.slice(0, 12)) {
        const pts: Pt[] = [];
        for (const { f } of group) {
          const t = tAtV(f, rib);
          const b = t < f.tLo + FIGURES.endSouth || t > f.tHi - FIGURES.endNorth ? null : bandAt(f, t, across);
          if (b) pts.push(worldPoint(f, t, b.mid));
        }
        if (pts.length !== group.length) continue;
        const x = pts.reduce((a, q) => a + q[0], 0) / pts.length, z = pts.reduce((a, q) => a + q[1], 0) / pts.length;
        const { u, v } = worldToShed(layout, [x, z]);
        if (Math.abs(v - rib) > 0.05) continue;
        if (u < FIGURES.totemWallReach && westernPassages().some(([lo, hi]) => rib + FIGURES.totemDepth / 2 > lo && rib - FIGURES.totemDepth / 2 < hi)) continue;
        const f0 = (group[0] as { f: Frame }).f;
        // its ref is the half whose outline it stands in (an island's totem stands on or beside the seam)
        const home = group.find(({ f }) => pointInPolygon([x, z], [...f.pts]));
        if (!home) continue;
        const p: TotemPlacement = { ref: home.f.ref, refs: [...refs], label: refs.join(' '), x, z, rotY: facing(f0.axis), r, across };
        const clear = near.every((q) => Math.hypot(q.x - p.x, q.z - p.z) >= q.r + p.r + (benches.has(q) ? FIGURES.totemBenchGap : FIGURES.gap));
        if (clear && group.every(({ f }) => behindSafetyLine(f, p))) {
          plan.totems.push(p);
          mine.push(p);
          near.push(p);
          break;
        }
      }
    }
    // a pole clock beside a totem (the middle one first), clear of everything (benches by the totems' gap) and behind the safety lines
    const mid = Math.floor(mine.length / 2);
    const byOrder = [...mine].sort((a, b) => Math.abs(mine.indexOf(a) - mid) - Math.abs(mine.indexOf(b) - mid));
    clock: for (const by of byOrder) {
      const cr = FIGURES.clockWidth + 0.07, v0 = worldToShed(layout, [by.x, by.z]).v;
      for (const d of CLOCK_OFFSETS) {
        const at = pointAt(v0 + d, FIGURES.clockWidth + 0.02);
        if (!at) continue;
        const c: Placement = { ref: at.home.ref, x: at.x, z: at.z, rotY: by.rotY, r: cr, across: FIGURES.clockWidth + 0.02 };
        const clear = near.every((q) => Math.hypot(q.x - c.x, q.z - c.z) >= q.r + c.r + (benches.has(q) ? FIGURES.totemBenchGap : FIGURES.gap));
        if (clear && group.every(({ f }) => behindSafetyLine(f, c))) {
          plan.clocks.push(c);
          near.push(c);
          break clock;
        }
      }
    }
    // round 16 (rubric shed-interior B5, R-kx-shed-interior-e and -a): a pair of bins, a platform-number blade and a trolley point, each clear of everything
    // (benches by the totems' gap), behind the safety lines, and out of the platform clock's bay (EXTRA_CLOCK_CLEAR of its rib, any platform)
    const clockV = ribs.reduce((b, v) => (Math.abs(v - PLATFORM_CLOCK.v * layout.length) < Math.abs(b - PLATFORM_CLOCK.v * layout.length) ? v : b));
    for (const [kind, spec] of Object.entries(EXTRAS) as [ExtraKind, (typeof EXTRAS)[ExtraKind]][]) {
      extra: for (const by of byOrder) {
        const v0 = worldToShed(layout, [by.x, by.z]).v;
        // round 19 (platform-round-6: the trolley point on the centreline in front of the blade post; shed-e has it to one side by the bins)
        const mineOf = (k: ExtraKind) => (kind === 'trolley' ? plan.extras.find((e) => e.kind === k && e.label === refs.join(' ')) : undefined);
        const bins = mineOf('bins'), blade = mineOf('blade');
        const binsD = bins ? worldToShed(layout, [bins.x, bins.z]).v - v0 : null, bladeD = blade ? worldToShed(layout, [blade.x, blade.z]).v - v0 : null;
        const away = binsD !== null && bladeD !== null ? Math.sign(bladeD - binsD) || 1 : 1;
        // round 19, second pass (the lead): beside the bins, just past them on the far side from the blade, and across the platform by TROLLEY_ASIDE from the
        // blade post's line; where the band is too narrow for that, along the platform EXTRA_BESIDE past the bins (the far side from the blade), at the middle
        const postU = blade ? worldToShed(layout, [blade.x, blade.z]).u : null;
        type Try = { d: number; aside: boolean };
        const tries: Try[] = [...(binsD === null ? [] : [{ d: binsD - away * TROLLEY_ALONG, aside: true }, { d: binsD - away * EXTRA_BESIDE, aside: false }]), ...spec.offsets.map((d) => ({ d, aside: false }))];
        for (const { d, aside } of tries) {
          if (Math.abs(v0 + d - clockV) < EXTRA_CLOCK_CLEAR) continue;
          const at = aside ? edgesAt(v0 + d, spec.across, postU ?? 0).find((p) => p.off >= TROLLEY_ASIDE) ?? null : pointAt(v0 + d, spec.across);
          if (!at) continue;
          const c: ExtraPlacement = { ref: at.home.ref, x: at.x, z: at.z, rotY: by.rotY, r: spec.r, across: spec.across, kind, label: refs.join(' ') };
          const clear = near.every((q) => Math.hypot(q.x - c.x, q.z - c.z) >= q.r + c.r + (benches.has(q) ? FIGURES.totemBenchGap : FIGURES.gap));
          if (clear && group.every(({ f }) => behindSafetyLine(f, c))) {
            plan.extras.push(c);
            near.push(c);
            break extra;
          }
        }
      }
    }
  }
  return plan;
}

// ---------------------------------------------------------------------------------------------
// the furniture meshes

const TIMBER = rgb(0x8a5d33);
const IRON = rgb(0x2a3036);
export const PLATFORM_LANTERN_GLASS = rgb(0xf4e6b4);
const HELP_YELLOW = rgb(0xe9b52a);
const HELP_PANEL = rgb(0x1b2229);
const HELP_BUTTON = rgb(0xd13a30);

/** A lamp standard: base, pole and a short arm carrying a small lantern, leaning toward local +z. */
function lampGeometry(): THREE.BufferGeometry {
  const b = newBatch();
  const h = FIGURES.lampHeight;
  addPrism(b, 0, 0, 0.13, 0, 0.4, 8, IRON);
  addPrism(b, 0, 0, 0.055, 0.4, h, 6, IRON);
  b.aabb(-0.03, h - 0.1, 0, 0.03, h - 0.04, 0.5, IRON);
  b.aabb(-0.15, h - 0.2, 0.3, 0.15, h - 0.08, 0.68, PLATFORM_LANTERN_GLASS, true);
  b.aabb(-0.17, h - 0.08, 0.28, 0.17, h - 0.04, 0.7, IRON, true);
  return b.build();
}

/** A slatted bench with a back on four legs; the sitter faces +z. Three seat slats, two back slats. */
/** A pendant lamp under a canopy: a rod down from the longitudinal beam over the columns, an iron bell and its glass, the glass's middle at
 *  lampHeight - 0.14 over the platform (where the night layer lights from, as a standard's lantern). */
export function pendantGeometry(): THREE.BufferGeometry {
  const b = newBatch();
  const h = FIGURES.lampHeight;
  const beam = FIGURES.canopyHeight - FIGURES.canopyTrussDepth - 0.4;
  addPrism(b, 0, 0, 0.02, h + 0.12, beam, 4, IRON);
  addPrism(b, 0, 0, 0.3, h - 0.1, h + 0.04, 8, IRON);
  addPrism(b, 0, 0, 0.12, h + 0.04, h + 0.12, 8, IRON);
  addPrism(b, 0, 0, 0.24, h - 0.18, h - 0.1, 8, PLATFORM_LANTERN_GLASS);
  return b.build();
}

function benchGeometry(): THREE.BufferGeometry {
  const b = newBatch();
  const hl = FIGURES.benchLength / 2;
  const hd = FIGURES.benchDepth / 2;
  const seat = FIGURES.benchSeat;
  for (const z of [-0.17, 0, 0.17]) b.aabb(-hl, seat - 0.04, z - 0.07, hl, seat, z + 0.07, TIMBER, true);
  for (const y of [seat + 0.2, seat + 0.38]) b.aabb(-hl, y, -hd, hl, y + 0.12, -hd + 0.03, TIMBER, true);
  for (const x of [-hl + 0.04, hl - 0.04]) {
    b.aabb(x - 0.025, 0, -hd, x + 0.025, FIGURES.benchBack, -hd + 0.05, IRON, true); // the rear leg runs up to the top of the back
    b.aabb(x - 0.025, 0, hd - 0.05, x + 0.025, seat - 0.04, hd, IRON, true); // the front leg stops under the seat
  }
  return b.build();
}

/** A help point: a yellow post carrying a dark panel with a red button, the same on both faces. */
function helpPointGeometry(): THREE.BufferGeometry {
  const b = newBatch();
  const top = FIGURES.helpHeight;
  b.aabb(-0.05, 0, -0.05, 0.05, top - 0.7, 0.05, HELP_YELLOW);
  b.aabb(-0.17, top - 0.7, -0.04, 0.17, top, 0.04, HELP_PANEL, true);
  b.aabb(-0.17, top - 0.16, -0.045, 0.17, top, 0.045, HELP_YELLOW, true);
  for (const z of [-1, 1]) b.aabb(-0.045, top - 0.42, z * 0.04, 0.045, top - 0.33, z * 0.065, HELP_BUTTON, true);
  return b.build();
}

const TOTEM_BODY = rgb(0x1a1d22);
/** Sampled in memory from shed-a's totem headers (the navy of the National Rail platform signs): about (31, 42, 92). */
const TOTEM_NAVY = rgb(0x1f2a5c);

/** The face texture's layout (screenTexture): the screen's picture over a row of ten digit cells, 0-9, white on navy. */
const ATLAS = { w: 256, h: 400, screen: 330, digitTop: 340, digitBottom: 396 } as const;
/** A header digit's height on the totem, metres. ASSUMED: shed-a's "Platform 8" lettering fills about two thirds of the header. */
const DIGIT_HEIGHT = 0.4;

/**
 * A totem standing on the platform at y = 0, local +z and -z the platform's two directions: a dark slab with a navy header (group 0); and,
 * on both faces, the screen and the header's platform numbers, white digits from the face texture's digit row (group 1).
 */
function totemGeometry(label: string): THREE.BufferGeometry {
  const hw = FIGURES.totemWidth / 2, hd = FIGURES.totemDepth / 2, top = FIGURES.totemHeight, head = top - FIGURES.totemHeader;
  const body = newBatch();
  body.aabb(-hw, 0, -hd, hw, head, hd, TOTEM_BODY);
  body.aabb(-hw, head, -hd, hw, top, hd, TOTEM_NAVY);
  const faces = newBatch();
  const sw = FIGURES.screenWidth / 2, y1 = head - 0.05, y0 = y1 - FIGURES.screenHeight, e = hd + 0.003;
  const sv = 1 - ATLAS.screen / ATLAS.h;
  // seen from +z the image reads left to right along +x; seen from -z, along -x: the same picture on both sides
  faces.poly([[-sw, y0, e], [sw, y0, e], [sw, y1, e], [-sw, y1, e]], [[0, sv], [1, sv], [1, 1], [0, 1]], { normal: [0, 0, 1] });
  faces.poly([[sw, y0, -e], [-sw, y0, -e], [-sw, y1, -e], [sw, y1, -e]], [[0, sv], [1, sv], [1, 1], [0, 1]], { normal: [0, 0, -1] });
  // the number: one cell a digit, a space a 0.6 cell gap, centred in the header
  const dw = (DIGIT_HEIGHT * ATLAS.w) / 10 / (ATLAS.digitBottom - ATLAS.digitTop);
  const advance = [...label].map((ch) => (ch === ' ' ? 0.6 * dw : dw));
  const width = advance.reduce((a, b) => a + b, 0);
  const dy0 = head + (FIGURES.totemHeader - DIGIT_HEIGHT) / 2, dy1 = dy0 + DIGIT_HEIGHT, de = hd + 0.004;
  const v0 = 1 - ATLAS.digitBottom / ATLAS.h, v1 = 1 - ATLAS.digitTop / ATLAS.h;
  let x = -width / 2;
  [...label].forEach((ch, k) => {
    const d = Number(ch);
    if (ch !== ' ' && Number.isInteger(d)) {
      const u0 = d / 10, u1 = (d + 1) / 10, xa = x, xb = x + dw;
      faces.poly([[xa, dy0, de], [xb, dy0, de], [xb, dy1, de], [xa, dy1, de]], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], { normal: [0, 0, 1] });
      faces.poly([[-xa, dy0, -de], [-xb, dy0, -de], [-xb, dy1, -de], [-xa, dy1, -de]], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], { normal: [0, 0, -1] });
    }
    x += advance[k] as number;
  });
  const a = body.build();
  const b = faces.build();
  const merged = mergeGeometries([a, b], true) as THREE.BufferGeometry;
  a.dispose();
  b.dispose();
  return merged;
}

/** The face texture's first time on the screen (four amber blocks, screenTexture's first row), which a pole clock shows: (u0, v0, u1, v1). */
const CLOCK_UV = [8 / ATLAS.w, 1 - 48 / ATLAS.h, 50 / ATLAS.w, 1 - 32 / ATLAS.h] as const;

/**
 * A pole clock at y = 0, local z along the platform: a slim post, a crossbar on its top and two dark displays side by side on it (group 0), each
 * showing a time on both faces (group 1).
 */
function clockGeometry(): THREE.BufferGeometry {
  const w = FIGURES.clockWidth, h = FIGURES.clockTall, top = FIGURES.clockHeight, d = 0.06, y0 = top - h;
  const body = newBatch();
  body.aabb(-0.04, 0, -0.04, 0.04, y0, 0.04, IRON);
  body.aabb(-w - 0.02, y0 - 0.06, -0.03, w + 0.02, y0, 0.03, IRON, true);
  for (const side of [-1, 1]) body.aabb(side > 0 ? 0.01 : -w - 0.01, y0, -d, side > 0 ? w + 0.01 : -0.01, top, d, TOTEM_BODY, true);
  const faces = newBatch();
  const [u0, v0, u1, v1] = CLOCK_UV, e = d + 0.003, m = 0.03;
  for (const side of [-1, 1]) {
    const xa = (side > 0 ? 0.01 : -w - 0.01) + m, xb = (side > 0 ? w + 0.01 : -0.01) - m, ya = y0 + m, yb = top - m;
    faces.poly([[xa, ya, e], [xb, ya, e], [xb, yb, e], [xa, yb, e]], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], { normal: [0, 0, 1] });
    faces.poly([[xb, ya, -e], [xa, ya, -e], [xa, yb, -e], [xb, yb, -e]], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], { normal: [0, 0, -1] });
  }
  const a = body.build();
  const b = faces.build();
  const merged = mergeGeometries([a, b], true) as THREE.BufferGeometry;
  a.dispose();
  b.dispose();
  return merged;
}

export type ExtraKind = 'bins' | 'blade' | 'trolley';
export interface ExtraPlacement extends Placement {
  kind: ExtraKind;
  /** the platform numbers a blade shows */
  label: string;
}
/**
 * Round 16 (rubric shed-interior B5; R-kx-shed-interior-e, viewed: a blue platform-number blade, "7", on a post among the island's columns; a pair of green
 * wheelie bins against a column; a "Trolley Point" board on two legs with a stack of trolleys; R-kx-shed-interior-a: a trolley point board in the middle distance,
 * blue bins at the platform's south end). One of each a platform or shared island, along it from its middle totem by `offsets` (metres), `r` the footprint
 * radius, `across` the half-width (round 17: the bins and the trolley point first tried beside the blade, so a platform has one group of them, as shed-e shows them together). Counts and sizes ASSUMED from the two photographs: neither shows a platform's full length.
 */
export const EXTRAS = {
  bins: { offsets: [12.2, -12.2, 18.3, -18.3, 24.4, -24.4, 30.5, -30.5], r: 0.8, across: 0.4 },
  blade: { offsets: [9.15, -9.15, 15.25, -15.25, 21.35, -21.35], r: 0.45, across: 0.4 },
  trolley: { offsets: [15.25, -15.25, -27.45, 27.45, -33.55, 33.55, -39.65, 39.65], r: 0.9, across: 0.7 }, // round 19: r 0.9 (was 1.5), across 0.7: its row of trolleys (1.37 m) runs across
} as const;
/** round 19, second pass: the trolley point beside the bins stands this far across from the blade post's line (the board's width and 0.3 m), and this far
 * along past the bins (clear of them: their r, its r and FIGURES.gap, with the offset across), metres */
export const TROLLEY_ASIDE = 1.3, TROLLEY_ALONG = 1.6;
/** round 19: the trolley point's fallback, this far along past its group's blade or bins, metres (over the bins' r, its r and FIGURES.gap: 2.3) */
export const EXTRA_BESIDE = 2.4;
/** the platform clock's bay is left clear: no extra within this of its rib, metres (round 15's scorer: nothing within about 6 m of the clock) */
export const EXTRA_CLOCK_CLEAR = 9;
const SIGN_BLUE = rgb(0x1f3c88);
const SIGN_WHITE = rgb(0xf1f2f0);
const BIN_GREEN = rgb(0x2f7a3c);
const TROLLEY_GREY = rgb(0x9aa1a8);
/** The nested trolleys at a trolley point (round 18): how many, how far apart (m), each basket's length and the wire's half-thickness (ASSUMED, shed-e: a short row). */
export const TROLLEY = { n: 3, pitch: 0.22, len: 0.8, wire: 0.012, half: 0.26 } as const; // round 19, second pass: 3 (was 4), so the row across fits the band
/** round 19, second pass: the trolleys' row stands this far in front of the board (its centre), metres */
const TROLLEY_FRONT = 0.5; // round 19: each 0.8 m long, 0.22 m on from the last (72% nested)
/** seven-segment digits: which of a, b, c, d, e, f, g each lights */
const SEGMENTS: Record<string, string> = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg' };
/** One extra at y = 0, local z along the platform; nothing floats: every part stands on the platform or on another part. */
/**
 * Round 17 (platform-round-4 score, section 5): the blade bigger, to read at 30-60 m (shed-e's "7" is about the width of the screens' head beside it), and its
 * panel wholly above the pole clocks' displays and the totems (FIGURES.clockHeight 2.9 m, totemHeight 2.5 m) with `clear` to spare, so from eye height on the
 * platform it never stands in front of them: `top` of the panel, its `size` (height, and least width), the numerals `digit` tall at `pitch`, their `stroke`.
 * At night its face is lit from within (`night`, a share of its own colour, windowNight). All ASSUMED.
 */
export const BLADE = { top: 4.3, size: 1.0, digit: 0.66, pitch: 0.56, stroke: 0.085, clear: 0.3, night: 0.45 } as const;
/** `part`: the post (body), the panel and its numerals (face), or both. */
export function extraGeometry(e: { kind: ExtraKind; label: string }, part: 'all' | 'body' | 'face' = 'all'): THREE.BufferGeometry {
  const b = newBatch();
  if (part === 'face' && e.kind !== 'blade') return b.build();
  if (e.kind === 'bins') {
    // round 17 (the lead: they read about 1.2 m tall and wide): each bin 0.5 m wide and 1.0 m tall with its lid, 0.55 m deep (ASSUMED, paired platform bins)
    for (const sx of [-0.27, 0.27]) {
      b.aabb(sx - 0.24, 0, -0.27, sx + 0.24, 0.95, 0.27, BIN_GREEN);
      b.aabb(sx - 0.25, 0.95, -0.28, sx + 0.25, 1.0, 0.28, IRON, true);
    }
  } else if (e.kind === 'trolley') {
    for (const sx of [-0.42, 0.42]) b.aabb(sx - 0.04, 0, -0.04, sx + 0.04, 2.2, 0.04, IRON);
    b.aabb(-0.5, 1.0, -0.035, 0.5, 2.25, 0.035, SIGN_BLUE, true);
    b.aabb(-0.42, 1.95, -0.045, 0.42, 2.12, 0.045, SIGN_WHITE, true); // the board's heading strip, both faces
    // round 19 (platform-round-6, sections 3 and 5: round 18's frames read as open gates): TROLLEY.n luggage trolleys nested in a row, parallel, each
    // TROLLEY.pitch on from the one before (about 70% of TROLLEY.len overlapped), as shed-e's. Each: a low base frame on four castors, a wire basket at the
    // back (rim bars), two uprights sloping back to a handle. All thin bars in the one merged extras mesh, about 126 triangles a trolley (the base frame has no nose bar: the extras mesh stays under round 16's 4,000).
    const { n, pitch, len, wire: q, half: hw } = TROLLEY;
    const board = b, row = newBatch();
    {
    const b = row;
    const bar = (x: number, y0: number, z0: number, y1: number, z1: number, c: Rgb): void => {
      // a square bar from (x, y0, z0) to (x, y1, z1), sloping in y-z: its four sides
      const l = Math.hypot(y1 - y0, z1 - z0), ny = (-(z1 - z0) / l) * q, nz = ((y1 - y0) / l) * q;
      const at = (sx: number, sn: number, end: 0 | 1): V3 => [x + sx * q, (end ? y1 : y0) + sn * ny, (end ? z1 : z0) + sn * nz];
      for (const [a, c2] of [[[1, 1], [1, -1]], [[1, -1], [-1, -1]], [[-1, -1], [-1, 1]], [[-1, 1], [1, 1]]] as [[number, number], [number, number]][]) {
        b.poly([at(a[0], a[1], 0), at(c2[0], c2[1], 0), at(c2[0], c2[1], 1), at(a[0], a[1], 1)], undefined, { color: c });
      }
    };
    for (let k = 0; k < n; k++) {
      const z0 = 0.3 + k * pitch, z1 = z0 + len; // z0 the back (the handle's end), z1 the nose
      for (const sx of [-hw, hw]) {
        b.aabb(sx - q, 0.07, z0, sx + q, 0.07 + 2 * q, z1, TROLLEY_GREY, true); // the base frame's side rail
        b.aabb(sx - q, 0.82, z0, sx + q, 0.82 + 2 * q, z0 + 0.38, TROLLEY_GREY, true); // the basket's side rim
        for (const z of [z0 + 0.03, z1 - 0.06]) b.aabb(sx - 0.025, 0, z, sx + 0.025, 0.07, z + 0.05, IRON, true); // a castor
        bar(sx, 0.08, z0, 1.02, z0 - 0.16, TROLLEY_GREY); // an upright, sloping back to the handle
      }
      b.aabb(-hw, 0.82, z0 + 0.38 - 2 * q, hw, 0.82 + 2 * q, z0 + 0.38, TROLLEY_GREY, true); // the basket's front rim
      b.aabb(-hw - 0.03, 1.0, z0 - 0.17, hw + 0.03, 1.0 + 3 * q, z0 - 0.17 + 3 * q, IRON, true); // the handle
    }
    }
    // round 19, second pass (the lead: end-on to platform-furniture the nesting did not read): the row turned a quarter, so it runs across the platform, side-on
    // to a camera looking along it, centred on the board and TROLLEY_FRONT in front of it
    const g = row.build(), zc = (0.3 - 0.17 + 0.3 + (n - 1) * pitch + len) / 2;
    g.translate(0, 0, -zc).rotateY(Math.PI / 2).translate(0, 0, TROLLEY_FRONT);
    const merged = mergeGeometries([board.build(), g]) as THREE.BufferGeometry;
    g.dispose();
    return merged;
  } else if (part !== 'face') {
    // its own post, up to the panel's foot (round 18, platform-round-5 section 3: run up to the top it crossed both faces between the digits)
    b.aabb(-0.05, 0, -0.05, 0.05, BLADE.top - BLADE.size, 0.05, IRON);
  }
  if (e.kind === 'blade' && part !== 'body') {
    const { top, size, digit, pitch, stroke: t } = BLADE;
    const digits = e.label.replace(/[^0-9]/g, '').slice(0, 2);
    const w = Math.max(size, pitch * digits.length + 0.4);
    b.aabb(-w / 2, top - size, -0.03, w / 2, top, 0.03, SIGN_BLUE, true);
    // the numbers in white seven-segment strokes on both faces
    const sh = digit, sw = digit * 0.58, y0 = top - size / 2 - sh / 2;
    [...digits].forEach((ch, i) => {
      const cx = -((digits.length - 1) * pitch) / 2 + i * pitch, x0 = cx - sw / 2, x1 = cx + sw / 2, ym = y0 + sh / 2, y1 = y0 + sh;
      const seg: Record<string, [number, number, number, number]> = {
        a: [x0, y1 - t, x1, y1], g: [x0, ym - t / 2, x1, ym + t / 2], d: [x0, y0, x1, y0 + t],
        f: [x0, ym, x0 + t, y1], b: [x1 - t, ym, x1, y1], e: [x0, y0, x0 + t, ym], c: [x1 - t, y0, x1, ym],
      };
      // each face drawn as seen from its own side: the -z face's right is -x, so its strokes (and the digits' order) are mirrored in x to read true
      // (until round 17 both faces shared the +z face's x, and the -z face read mirrored, "7 6" for "6 7")
      for (const s of SEGMENTS[ch] ?? '') for (const side of [-1, 1]) {
        const [a0, b0, a1, b1] = seg[s]!;
        b.aabb(Math.min(side * a0, side * a1), b0, side > 0 ? 0.03 : -0.036, Math.max(side * a0, side * a1), b1, side > 0 ? 0.036 : -0.03, SIGN_WHITE, true);
      }
    });
  }
  return b.build();
}

/** Every totem and pole clock in one mesh, in place: the bodies (group 0), then the faces (group 1), so all of them are two draw calls whatever their numbers. */
function totemsGeometry(totems: readonly TotemPlacement[], clocks: readonly Placement[]): THREE.BufferGeometry {
  const bodies: THREE.BufferGeometry[] = [], faces: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  for (const t of [...totems, ...clocks]) {
    const g = 'label' in t ? totemGeometry((t as TotemPlacement).label) : clockGeometry();
    m.compose(new THREE.Vector3(t.x, PLATFORM_HEIGHT, t.z), new THREE.Quaternion().setFromAxisAngle(_up, t.rotY), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    const [g0, g1] = g.groups as [{ start: number; count: number }, { start: number; count: number }];
    const part = (gr: { start: number; count: number }): THREE.BufferGeometry => {
      const out = new THREE.BufferGeometry();
      const idx = (g.index as THREE.BufferAttribute).array.slice(gr.start, gr.start + gr.count);
      for (const name of Object.keys(g.attributes)) out.setAttribute(name, g.getAttribute(name) as THREE.BufferAttribute);
      out.setIndex(Array.from(idx));
      return out;
    };
    bodies.push(part(g0));
    faces.push(part(g1));
  }
  const body = mergeGeometries(bodies) as THREE.BufferGeometry;
  const face = mergeGeometries(faces) as THREE.BufferGeometry;
  const merged = mergeGeometries([body, face], true) as THREE.BufferGeometry;
  for (const x of [...bodies, ...faces, body, face]) x.dispose();
  return merged;
}

/** A drawing of rows of amber blocks on black: abstract on purpose, no readable times or destinations. Null where there is no document. */
function screenTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = ATLAS.w;
  c.height = ATLAS.h;
  const g = c.getContext('2d');
  if (!g) return null;
  const r = rng(71);
  g.fillStyle = '#06080a';
  g.fillRect(0, 0, 256, ATLAS.screen);
  g.fillStyle = '#ffb02e';
  g.fillRect(10, 9, 118, 9); // the header bar
  g.fillRect(206, 9, 40, 9);
  g.fillStyle = 'rgba(255,176,46,0.35)';
  g.fillRect(10, 24, 236, 2);
  for (let row = 0; row < 12; row++) {
    const y = 34 + row * 24;
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
  // the digit row: ten cells, a white digit on the header's navy in each
  const cell = ATLAS.w / 10;
  g.fillStyle = '#1f2a5c';
  g.fillRect(0, ATLAS.digitTop, ATLAS.w, ATLAS.digitBottom - ATLAS.digitTop);
  g.fillStyle = '#ffffff';
  g.font = `bold ${ATLAS.digitBottom - ATLAS.digitTop - 6}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let d = 0; d < 10; d++) g.fillText(String(d), cell * (d + 0.5), (ATLAS.digitTop + ATLAS.digitBottom) / 2 + 2);
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

let bladeMat: THREE.MeshLambertMaterial | null = null;
/** The blades' faces: vertex-coloured as the rest, and after dark (windowNight) lit from within at BLADE.night of their own colour (the numerals pale, the field blue). */
export function bladeFace(): THREE.MeshLambertMaterial {
  if (bladeMat) return bladeMat;
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.userData.night = BLADE.night;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWinNight = windowNight;
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uWinNight;').replace('#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>\ntotalEmissiveRadiance = max( totalEmissiveRadiance, vColor.rgb * ${BLADE.night.toFixed(2)} * uWinNight );`);
  };
  m.customProgramCacheKey = () => 'platform-blade-night';
  return (bladeMat = m);
}

let furnitureMat: THREE.MeshLambertMaterial | null = null;
const vertexColoured = (): THREE.MeshLambertMaterial => (furnitureMat ??= new THREE.MeshLambertMaterial({ vertexColors: true }));

let canopyGlassMat: THREE.Material | null = null;
/** material('glass') with a little emissive, so the roof reads as sky-lit glass from underneath too (a plain Phong roof is near-black from below). */
function canopyGlass(): THREE.Material {
  if (!canopyGlassMat) {
    const m = material('glass').clone() as THREE.MeshPhongMaterial;
    // shed-f's strips read bright and near-white, a translucent (wired or ribbed) glass lit by the sky, not clear blue: a pale glass,
    // more opaque, with a near-white glow (the atmosphere scales a built emissive by the daylight, so it fades after dark)
    m.color.set(0xe9ecee);
    m.opacity = 0.78;
    m.emissive.set(0xa4abb0);
    m.name = 'canopyGlass';
    canopyGlassMat = m;
  }
  return canopyGlassMat;
}

/** The canopies' colours, sampled from R-kx-shed-interior-f (see FIGURES): near-black steel, a dark grey corrugated sheet. */
export const CANOPY_STEEL: Rgb = [0.149, 0.161, 0.173];
export const CANOPY_SHEET = 0x6a6b68;
/** The sheet's underside is lit only by what the platform bounces (the sun is above it): this lift, sampled as the mid-grey of shed-f's
 *  corrugated soffit (about #4a4b48 where it is not by a glazed strip), keeps it from rendering black. Faded after dark by the atmosphere. */
export const CANOPY_SHEET_GLOW = 0x4a4b48;
let canopySteelMat: THREE.Material | null = null;
const canopySteel = (): THREE.Material => {
  if (!canopySteelMat) {
    canopySteelMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    canopySteelMat.name = 'canopySteel';
  }
  return canopySteelMat;
};
let canopySheetMat: THREE.Material | null = null;
const canopySheet = (): THREE.Material => {
  if (!canopySheetMat) {
    canopySheetMat = new THREE.MeshLambertMaterial({ color: CANOPY_SHEET, emissive: CANOPY_SHEET_GLOW, side: THREE.DoubleSide });
    canopySheetMat.name = 'canopySheet';
  }
  return canopySheetMat;
};

/** A box standing upright on the platform, `al` half its length along the unit `ax` (x, z) and `ac` half its width across it. */
function uprightBox(b: Batch, x: number, z: number, ax: Pt, al: number, ac: number, y0: number, y1: number, c: Rgb): void {
  const n: Pt = [-ax[1], ax[0]];
  const p = (sa: number, sc: number, y: number): V3 => [x + ax[0] * al * sa + n[0] * ac * sc, y, z + ax[1] * al * sa + n[1] * ac * sc];
  const sides: [number, number, number, number, V3][] = [[1, -1, 1, 1, [ax[0], 0, ax[1]]], [-1, 1, -1, -1, [-ax[0], 0, -ax[1]]], [-1, 1, 1, 1, [n[0], 0, n[1]]], [1, -1, -1, -1, [-n[0], 0, -n[1]]]];
  for (const [a0, a1, c0, c1, normal] of sides) b.poly([p(a0, c0, y0), p(a1, c1, y0), p(a1, c1, y1), p(a0, c0, y1)], undefined, { normal, color: c });
  b.poly([p(-1, -1, y1), p(1, -1, y1), p(1, 1, y1), p(-1, 1, y1)], undefined, { normal: [0, 1, 0], color: c });
}

/** The point at `t` along the platform axis on one of the canopy's sampled lines (straight between samples). */
function lineAt(ts: readonly number[], line: readonly Pt[], t: number): Pt {
  let i = 0;
  while (i + 2 < ts.length && t > (ts[i + 1] as number)) i++;
  const t0 = ts[i] as number;
  const t1 = ts[i + 1] as number;
  const k = t1 > t0 ? Math.max(0, Math.min(1, (t - t0) / (t1 - t0))) : 0;
  const a = line[i] as Pt;
  const b = line[i + 1] as Pt;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}

/**
 * The canopy of one platform as R-kx-shed-interior-f shows it: a near-flat roof of dark sheet with glazed strips across it (`glass`, `sheet`),
 * on black steel (`steel`): Warren lattice girders along both edges, X-braced lattice trusses across at each column and at the ends, a
 * longitudinal beam over the columns, H-section columns on base plates with knee braces, and glazing bars in the strips.
 */
function canopyMeshes(c: CanopyPlan): { glass: Batch; sheet: Batch; steel: Batch; lattice: Batch } {
  const glass = newBatch();
  const sheet = newBatch();
  const steel = newBatch();
  // the thin members (lattice webs, glazing bars, knee braces) go in their own draw, which casts no sun shadow: the pass's triangle budget
  // (lighting.ts SHADOW_CASTERS, tests/lighting.test.ts) has room for the chords and columns, not for 10,000 triangles of web under a roof
  const lattice = newBatch();
  const S = CANOPY_STEEL;
  const y = c.roofY;
  const yb = c.columnTopY;
  const at = (line: readonly Pt[], t: number): Pt => lineAt(c.ts, line, t);
  const tFirst = c.ts[0] as number;
  const tLast = c.ts[c.ts.length - 1] as number;
  // the roof: cut at every sample and every strip edge, each piece glass or sheet
  const cuts = [...c.ts, ...c.glazing.flat()].sort((p, q) => p - q).filter((t, i, all) => i === 0 || t - (all[i - 1] as number) > 1e-6);
  for (let i = 0; i + 1 < cuts.length; i++) {
    const t0 = cuts[i] as number;
    const t1 = cuts[i + 1] as number;
    const mid = (t0 + t1) / 2;
    const into = c.glazing.some(([lo, hi]) => mid > lo && mid < hi) ? glass : sheet;
    const l0 = at(c.left, t0), l1 = at(c.left, t1), r0 = at(c.right, t0), r1 = at(c.right, t1);
    into.poly([[l0[0], y - 0.05, l0[1]], [l1[0], y - 0.05, l1[1]], [r1[0], y - 0.05, r1[1]], [r0[0], y - 0.05, r0[1]]], undefined, { normal: [0, 1, 0], color: S });
  }
  // glazing bars: along the platform, every 0.8 m across each strip, just under the glass
  for (const [lo, hi] of c.glazing) {
    const l0 = at(c.left, lo), l1 = at(c.left, hi), r0 = at(c.right, lo), r1 = at(c.right, hi);
    const n = Math.max(2, Math.round(Math.hypot(r0[0] - l0[0], r0[1] - l0[1]) / 0.8));
    for (let k = 1; k < n; k++) {
      const a: Pt = [l0[0] + ((r0[0] - l0[0]) * k) / n, l0[1] + ((r0[1] - l0[1]) * k) / n];
      const b: Pt = [l1[0] + ((r1[0] - l1[0]) * k) / n, l1[1] + ((r1[1] - l1[1]) * k) / n];
      addBeam(lattice, [a[0], y - 0.1, a[1]], [b[0], y - 0.1, b[1]], 0.05, 0.08, S);
    }
  }
  // the edge girders: top chord (its top is the roof's edge, with the gutter), bottom chord and Warren diagonals about every 1.5 m
  const bw = FIGURES.beamWidth;
  const bd = FIGURES.beamDepth;
  const yTop = y - bd;
  const yBot = yb + 0.15;
  for (const side of [c.left, c.right]) {
    for (let i = 0; i + 1 < side.length; i++) {
      const a = side[i] as Pt;
      const b = side[i + 1] as Pt;
      addBeam(steel, [a[0], y - bd / 2, a[1]], [b[0], y - bd / 2, b[1]], bw, bd, S);
      addBeam(steel, [a[0], yb + 0.075, a[1]], [b[0], yb + 0.075, b[1]], 0.15, 0.15, S);
    }
    const n = Math.max(2, Math.round((tLast - tFirst) / 1.5));
    for (let k = 0; k < n; k++) {
      const p = at(side, tFirst + ((tLast - tFirst) * k) / n);
      const q = at(side, tFirst + ((tLast - tFirst) * (k + 1)) / n);
      const [ya, yq] = k % 2 === 0 ? [yTop, yBot] : [yBot, yTop];
      addBeam(lattice, [p[0], ya, p[1]], [q[0], yq, q[1]], 0.08, 0.08, S);
    }
  }
  // the trusses across: top and bottom chords, X-braced panels about 2 m wide, posts at both ends
  for (const [a, b] of c.crossBeams) {
    addBeam(steel, [a[0], y - FIGURES.crossDepth / 2, a[1]], [b[0], y - FIGURES.crossDepth / 2, b[1]], bw, FIGURES.crossDepth, S);
    addBeam(steel, [a[0], yb + 0.075, a[1]], [b[0], yb + 0.075, b[1]], 0.15, 0.15, S);
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
    const pt = (k: number): Pt => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
    for (let k = 0; k < n; k++) {
      const p = pt(k), q = pt(k + 1);
      addBeam(lattice, [p[0], yTop, p[1]], [q[0], yBot, q[1]], 0.07, 0.07, S);
      addBeam(lattice, [p[0], yBot, p[1]], [q[0], yTop, q[1]], 0.07, 0.07, S);
    }
    for (const e of [a, b]) addBeam(lattice, [e[0], yBot, e[1]], [e[0] + 1e-4, yTop, e[1]], 0.08, 0.08, S);
  }
  // the longitudinal beam over the columns, under the trusses, from end truss to end truss
  const centre = c.left.map((l, i): Pt => [(l[0] + (c.right[i] as Pt)[0]) / 2, (l[1] + (c.right[i] as Pt)[1]) / 2]);
  for (let i = 0; i + 1 < centre.length; i++) {
    const a = centre[i] as Pt;
    const b = centre[i + 1] as Pt;
    addBeam(steel, [a[0], yb - 0.2, a[1]], [b[0], yb - 0.2, b[1]], 0.16, 0.4, S);
  }
  // the columns: H-section (two flanges across the platform's axis and a web), a base plate, a cap, knee braces four ways
  c.columns.forEach((col, k) => {
    const [l, r] = c.crossBeams[k + 2] as [Pt, Pt];
    const len = Math.hypot(r[0] - l[0], r[1] - l[1]) || 1;
    const acr: Pt = [(r[0] - l[0]) / len, (r[1] - l[1]) / len];
    const ax: Pt = [acr[1], -acr[0]];
    uprightBox(steel, col.x, col.z, ax, 0.25, 0.25, PLATFORM_HEIGHT, PLATFORM_HEIGHT + 0.04, S);
    for (const s of [-1, 1]) uprightBox(steel, col.x + ax[0] * 0.1 * s, col.z + ax[1] * 0.1 * s, ax, 0.0125, 0.11, PLATFORM_HEIGHT + 0.04, yb - 0.4, S);
    uprightBox(steel, col.x, col.z, ax, 0.09, 0.01, PLATFORM_HEIGHT + 0.04, yb - 0.4, S);
    for (const d of [ax, acr]) {
      for (const s of [-1, 1]) {
        const reach = d === ax ? 1.0 : Math.min(1.0, len / 2 - 0.3);
        addBeam(lattice, [col.x, yb - 1.4, col.z], [col.x + d[0] * reach * s, d === ax ? yb - 0.4 : yb + 0.02, col.z + d[1] * reach * s], 0.07, 0.07, S);
      }
    }
  });
  return { glass, sheet, steel, lattice };
}

/**
 * B6 (shed-gap-scan-1, item 2; the partner's ruling 2026-11-25: the station owns the outer wall beside the platform 9-11 canopy). R-kx-shed-interior-f
 * (shed-f-suburban-platforms-2022.jpg, looking south to the buffers) shows the suburban platforms closed on the west by a tall wall of yellow stock
 * brick with shallow pilasters, the canopy's columns standing in front of it. The model had nothing of the station there: past platform 10's outer
 * track the landscraper's timber face (Platform 37, kxcentral.ts, about 12 m out) stood in its place. The wall runs the length of platform 10's
 * canopy, its face `fromEdge` m out from the platform's outer coping, square to it, in the stock brick of the shed (material 'brick').
 * It casts no sun shadow (its mesh is not in lighting.ts SHADOW_CASTERS: the pass is near its budget). All figures ASSUMED, read in memory from R-f.
 */
export const SUBURBAN_WALL = {
  /** the face from the platform's outer coping: the outer track's centre line is about 1.8 m out (OSM) and the OLE portals' outer masts 2.6 m and more
   *  past it (core/ole.ts mastClearance), so the face stands behind the masts, 3 m and more from any rail, a pilaster's face at least 0.3 m clear of a mast */
  fromEdge: 5.6,
  thickness: 0.7,
  /** the coping's top over the canopy's roof: the roof (carried to the wall since B6 round 2) meets the wall under it */
  aboveRoof: 1.2,
  pilasterWidth: 0.9,
  /** how far a pilaster stands out of the face, toward the tracks. Round 2 (b6-round-1 score, section 5.3: the pilasters read only as faint shading;
   *  R-f shows deep ones with clear shadow sides): 0.25 to 0.45 m, the most the OLE masts leave (a mast's side 0.33 m clear of a pilaster's face) */
  pilasterProud: 0.45,
  /** pilaster centres along the wall: half the canopy's 15 m column bay */
  pilasterSpacing: 7.5,
  copingHeight: 0.3,
  copingOverhang: 0.1,
  /** round 2 (section 5.3, R-f's dark band at the wall's foot): a plinth of darker brick from the foot to this height (y, metres: 0.6 m over the platforms' top) */
  plinthTop: PLATFORM_HEIGHT + 0.6,
  /** the plinth's brick, and a pilaster's two sides (a baked shade, so the sides read as shadow whatever the sun), as multiples of the wall's own (vertex colour) */
  plinthShade: 0.45,
  sideShade: 0.55,
  /** round 2 (section 5.1/5.3): the roof's trusses bear on columns standing just in front of the wall, in pairs: their centres this far out of the face and
   *  this far apart along it (R-f, ASSUMED), one pair under each of canopy 10's trusses */
  columnOut: 0.7,
  columnPair: 0.7,
  /** round 2 (the north context view: the wall stopped dead, the landscraper's face beyond): a return wall at the north end, this long, turned away from the tracks */
  returnLength: 3,
  /** round 2 (section 5.4): after dark the canopy's pendants light the wall: a warm wash (linear RGB, on the brick's own colour), a pool on the wall behind
   *  each lamp falling off with the distance on the wall from the point square behind it (a gaussian of `washSpread` m), the pools summed and capped at 1
   *  (ASSUMED, matched to nothing measured: R-f is a day photograph) */
  washColor: [0.34, 0.24, 0.13] as const,
  washSpread: 2.2,
} as const;

export interface SuburbanWallPlan {
  /** the face toward the tracks and the back, one point per canopy sample, in step (the canopy's own order along the platform) */
  face: Pt[];
  back: Pt[];
  /** canopy 10's sample positions along its platform (`ts`), and its edge lines on the wall's side (`edge`) and on platform 9's (`inner`), in step with `face` */
  ts: number[];
  edge: Pt[];
  inner: Pt[];
  /** the pilasters: their box's centre in plan (it runs from `pilasterProud` out of the face to 0.05 m into it) and its turn about y (local x along the wall) */
  pilasters: { x: number; z: number; rotY: number }[];
  /** the north end's return: from the end of the face (`at`, index into `face`) `returnLength` m along `dir`, away from the tracks */
  ret: { at: number; dir: Pt };
  /** the wall's foot and the coping's top */
  y0: number;
  y1: number;
}

/** `line` moved `d` m to one side, each corner mitred so every segment stays `d` from its own; `side` is +1 for the left-hand normal of the first segment's direction, -1 for the right. */
function offsetLine(line: readonly Pt[], d: number, side: number): Pt[] {
  const normals = line.slice(1).map((b, i): Pt => {
    const a = line[i] as Pt;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(-(b[1] - a[1]) / l) * side, ((b[0] - a[0]) / l) * side];
  });
  return line.map((p, i): Pt => {
    const n0 = normals[Math.max(0, i - 1)] as Pt;
    const n1 = normals[Math.min(normals.length - 1, i)] as Pt;
    const m: Pt = [n0[0] + n1[0], n0[1] + n1[1]];
    const ml = Math.hypot(m[0], m[1]) || 1;
    const k = d / Math.max(0.5, (m[0] * n1[0] + m[1] * n1[1]) / ml);
    return [p[0] + (m[0] / ml) * k, p[1] + (m[1] / ml) * k];
  });
}

/**
 * Where the outer wall stands: along platform 10's canopy, on the side away from platform 9's (the outer side), `fromEdge` out from the coping
 * (the canopy's edge line is `canopyInset` inside it). Null when there is no canopy on 10, or none on 9 to tell the outer side by.
 */
export function suburbanWallPlan(plan: Pick<FurniturePlan, 'canopies'>): SuburbanWallPlan | null {
  const c = plan.canopies.find((k) => k.ref === '10');
  const inner = plan.canopies.find((k) => k.ref === '9');
  if (!c || !inner || c.left.length < 2) return null;
  const W = SUBURBAN_WALL;
  const mid = (line: readonly Pt[]): Pt => [line.reduce((s, p) => s + p[0], 0) / line.length, line.reduce((s, p) => s + p[1], 0) / line.length];
  const other = mid([...inner.left, ...inner.right]);
  const far = (line: readonly Pt[]): number => Math.hypot(mid(line)[0] - other[0], mid(line)[1] - other[1]);
  const [edge, opposite] = far(c.left) >= far(c.right) ? [c.left, c.right] : [c.right, c.left];
  // the side of the edge line that is away from the canopy's other edge
  const a = edge[0] as Pt;
  const b = edge[1] as Pt;
  const o = opposite[0] as Pt;
  const side = Math.sign(-(b[1] - a[1]) * (a[0] - o[0]) + (b[0] - a[0]) * (a[1] - o[1])) || 1;
  const face = offsetLine(edge, W.fromEdge + FIGURES.canopyInset, side);
  const back = offsetLine(edge, W.fromEdge + FIGURES.canopyInset + W.thickness, side);
  // the pilasters, every `pilasterSpacing` along the face, the run centred on its length
  const lengths = face.slice(1).map((p, i) => Math.hypot(p[0] - (face[i] as Pt)[0], p[1] - (face[i] as Pt)[1]));
  const total = lengths.reduce((s, l) => s + l, 0);
  const count = Math.floor((total - W.pilasterWidth) / W.pilasterSpacing) + 1;
  const first = (total - (count - 1) * W.pilasterSpacing) / 2;
  const pilasters: SuburbanWallPlan['pilasters'] = [];
  for (let j = 0; j < count; j++) {
    let s = first + j * W.pilasterSpacing;
    let i = 0;
    while (i < lengths.length - 1 && s > (lengths[i] as number)) s -= lengths[i++] as number;
    const p = face[i] as Pt;
    const q = face[i + 1] as Pt;
    const l = lengths[i] as number;
    const t: Pt = [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
    const n: Pt = [-t[1] * side, t[0] * side]; // toward the back
    const out = (W.pilasterProud - 0.05) / 2; // the box runs 0.05 m into the face
    pilasters.push({ x: p[0] + t[0] * s - n[0] * out, z: p[1] + t[1] * s - n[1] * out, rotY: Math.atan2(-t[1], t[0]) });
  }
  // the north end (north is -z): its return runs from the face's end away from the tracks
  const at = (face[face.length - 1] as Pt)[1] < (face[0] as Pt)[1] ? face.length - 1 : 0;
  const away: Pt = [(back[at] as Pt)[0] - (face[at] as Pt)[0], (back[at] as Pt)[1] - (face[at] as Pt)[1]];
  const al = Math.hypot(away[0], away[1]) || 1;
  return { face, back, ts: [...c.ts], edge: [...edge], inner: [...opposite], pilasters, ret: { at, dir: [away[0] / al, away[1] / al] }, y0: GROUND_Y, y1: c.roofY + W.aboveRoof };
}

/** Nearest point to `p` on the polyline `line`, and whether it is inside it (not clamped to an end). */
function nearestOn(line: readonly Pt[], p: Pt): { q: Pt; inside: boolean } {
  let best = { d: Infinity, q: line[0] as Pt, inside: false };
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i] as Pt, b = line[i + 1] as Pt, dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
    const raw = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2, t = Math.max(0, Math.min(1, raw));
    const q: Pt = [a[0] + dx * t, a[1] + dz * t], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    const inside = !((i === 0 && raw < 0) || (i === line.length - 2 && raw > 1));
    if (d < best.d) best = { d, q, inside };
  }
  return { q: best.q, inside: best.inside };
}

/**
 * B6 round 2 (b6-round-1 score, section 5.1; gap scan B6 item 1): one roof from canopy 9 across the 9-10 track, over canopy 10 and on to the wall, as R-f shows.
 * Two infill strips at the canopies' roof height, cut where canopy 10's roof is cut so its glazed strips run straight on across them: the 9-10 track's (from
 * canopy 10's inner edge to canopy 9's nearest edge, where canopy 9 is beside it) and the outer track's (from canopy 10's outer edge to the wall's face). The
 * glass goes in canopy-glass (no shadow), the sheet in canopy-steel's sheet group, which casts: a roof over a track throws its shade there (the pass grows by
 * the sheet's few hundred triangles; no new caster, no new draw). The steel goes in canopy-lattice (no shadow): at each of canopy 10's trusses a truss
 * across each strip, the outer one bearing on a pair of columns standing just in front of the wall (`columnOut`, `columnPair`) with knee braces to the
 * truss and along the wall, and a beam along the columns' tops.
 */
function suburbanRoofMeshes(c10: CanopyPlan, c9: CanopyPlan, w: SuburbanWallPlan): { glass: Batch; sheet: Batch; lattice: Batch } {
  const glass = newBatch();
  const sheet = newBatch();
  const lattice = newBatch();
  const W = SUBURBAN_WALL;
  const S = CANOPY_STEEL;
  const y = c10.roofY;
  const yb = c10.columnTopY;
  const at = (line: readonly Pt[], t: number): Pt => lineAt(w.ts, line, t);
  // canopy 9's edge on canopy 10's side: of its two lines, the nearer to canopy 10's inner edge
  const d = (line: readonly Pt[]): number => Math.min(...w.inner.map((p) => nearestOn(line, p).q).map((q, i) => Math.hypot(q[0] - (w.inner[i] as Pt)[0], q[1] - (w.inner[i] as Pt)[1])));
  const nine = d(c9.left) <= d(c9.right) ? c9.left : c9.right;
  const tFirst = w.ts[0] as number;
  const tLast = w.ts[w.ts.length - 1] as number;
  const cuts = [...w.ts, ...c10.glazing.flat()].filter((t) => t >= tFirst - 1e-6 && t <= tLast + 1e-6).sort((p, q) => p - q).filter((t, i, all) => i === 0 || t - (all[i - 1] as number) > 1e-6);
  const piece = (l0: Pt, l1: Pt, r1: Pt, r0: Pt, mid: number): void => {
    const into = c10.glazing.some(([lo, hi]) => mid > lo && mid < hi) ? glass : sheet;
    into.poly([[l0[0], y - 0.05, l0[1]], [l1[0], y - 0.05, l1[1]], [r1[0], y - 0.05, r1[1]], [r0[0], y - 0.05, r0[1]]], undefined, { normal: [0, 1, 0], color: S });
  };
  for (let i = 0; i + 1 < cuts.length; i++) {
    const t0 = cuts[i] as number, t1 = cuts[i + 1] as number, mid = (t0 + t1) / 2;
    // the outer track: canopy 10's outer edge to the wall's face
    piece(at(w.edge, t0), at(w.edge, t1), at(w.face, t1), at(w.face, t0), mid);
    // the 9-10 track, where canopy 9 is beside canopy 10 at both cuts
    const a0 = at(w.inner, t0), a1 = at(w.inner, t1), n0 = nearestOn(nine, a0), n1 = nearestOn(nine, a1);
    if (n0.inside && n1.inside) piece(a0, a1, n1.q, n0.q, mid);
  }
  // the trusses: at each of canopy 10's (its end beams and one over each column), across both strips
  const yTop = y - FIGURES.beamDepth;
  const yBot = yb + 0.15;
  const truss = (a: Pt, b: Pt): void => {
    addBeam(lattice, [a[0], y - FIGURES.crossDepth / 2, a[1]], [b[0], y - FIGURES.crossDepth / 2, b[1]], FIGURES.beamWidth, FIGURES.crossDepth, S);
    addBeam(lattice, [a[0], yb + 0.075, a[1]], [b[0], yb + 0.075, b[1]], 0.15, 0.15, S);
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
    for (let k = 0; k < n; k++) {
      const p: Pt = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
      const q: Pt = [a[0] + ((b[0] - a[0]) * (k + 1)) / n, a[1] + ((b[1] - a[1]) * (k + 1)) / n];
      addBeam(lattice, [p[0], yTop, p[1]], [q[0], yBot, q[1]], 0.07, 0.07, S);
      addBeam(lattice, [p[0], yBot, p[1]], [q[0], yTop, q[1]], 0.07, 0.07, S);
    }
  };
  const columnLine: Pt[] = [];
  for (const beam of c10.crossBeams) {
    const [l, r] = beam;
    // its end on the wall's side: the nearer the face
    const gap = (p: Pt): number => { const q = nearestOn(w.face, p).q; return Math.hypot(q[0] - p[0], q[1] - p[1]); };
    const [outer, innerEnd] = gap(l) <= gap(r) ? [l, r] : [r, l];
    // the outer truss, from canopy 10's edge to the wall's columns
    const f = nearestOn(w.face, outer).q;
    const u: Pt = [outer[0] - f[0], outer[1] - f[1]];
    const ul = Math.hypot(u[0], u[1]) || 1;
    const ux: Pt = [u[0] / ul, u[1] / ul]; // from the wall toward the tracks
    const col: Pt = [f[0] + ux[0] * W.columnOut, f[1] + ux[1] * W.columnOut];
    truss(outer, [f[0] + ux[0] * 0.05, f[1] + ux[1] * 0.05]);
    const along: Pt = [-ux[1], ux[0]];
    // the end trusses bear on the wall itself (a pair there would stand past its end); the others on a pair of columns
    const columns = c10.crossBeams.indexOf(beam) >= 2;
    if (columns) columnLine.push(col);
    for (const s of columns ? [-1, 1] : []) {
      const cx = col[0] + along[0] * (W.columnPair / 2) * s, cz = col[1] + along[1] * (W.columnPair / 2) * s;
      uprightBox(lattice, cx, cz, along, 0.125, 0.125, GROUND_Y, GROUND_Y + 0.04, S);
      uprightBox(lattice, cx, cz, along, 0.09, 0.1, GROUND_Y + 0.04, yb - 0.4, S);
      // knee braces: out to the truss's bottom chord, and along the wall to the beam over the columns
      addBeam(lattice, [cx, yb - 1.4, cz], [cx + ux[0] * 1.0, yb + 0.02, cz + ux[1] * 1.0], 0.07, 0.07, S);
      addBeam(lattice, [cx, yb - 1.4, cz], [cx + along[0] * 1.0 * s, yb - 0.4, cz + along[1] * 1.0 * s], 0.07, 0.07, S);
    }
    // the inner truss, across the 9-10 track, where canopy 9 is beside it
    const n = nearestOn(nine, innerEnd);
    if (n.inside) truss(innerEnd, n.q);
  }
  // the beam along the columns' tops, under the trusses
  columnLine.sort((p, q) => nearestT(w, p) - nearestT(w, q));
  for (let i = 0; i + 1 < columnLine.length; i++) {
    const a = columnLine[i] as Pt, b = columnLine[i + 1] as Pt;
    addBeam(lattice, [a[0], yb - 0.2, a[1]], [b[0], yb - 0.2, b[1]], 0.16, 0.4, S);
  }
  return { glass, sheet, lattice };
}

/**
 * The ground under the suburban roof (round 2) in plan: from the wall's face across canopy 10 to canopy 9's facing edge where canopy 9 runs beside it
 * (canopy 10's inner edge where it does not), one point per canopy 10 sample on each side. Null without the wall. For the tests and the weather's cover.
 */
export function suburbanRoofFootprint(plan: Pick<FurniturePlan, 'canopies'>): Pt[] | null {
  const w = suburbanWallPlan(plan);
  const c9 = plan.canopies.find((c) => c.ref === '9');
  if (!w || !c9) return null;
  const d = (line: readonly Pt[]): number => Math.min(...w.inner.map((p) => { const q = nearestOn(line, p).q; return Math.hypot(q[0] - p[0], q[1] - p[1]); }));
  const nine = d(c9.left) <= d(c9.right) ? c9.left : c9.right;
  const side = w.inner.map((p): Pt => { const n = nearestOn(nine, p); return n.inside ? n.q : p; });
  return [...w.face, ...side.reverse()];
}

/** Where along the wall (metres from the face's first point, measured on the face) the point nearest `p` lies. */
function nearestT(w: SuburbanWallPlan, p: Pt): number {
  let s = 0, best = { d: Infinity, s: 0 };
  for (let i = 0; i + 1 < w.face.length; i++) {
    const a = w.face[i] as Pt, b = w.face[i + 1] as Pt, dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    const t = Math.max(0, Math.min(l, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l));
    const d = Math.hypot(p[0] - a[0] - (dx / l) * t, p[1] - a[1] - (dz / l) * t);
    if (d < best.d) best = { d, s: s + t };
    s += l;
  }
  return best.s;
}

/** A pendant lamp as the wall sees it: its glass's middle, and `d`, its distance in plan from the wall's face. */
export interface WallLamp { x: number; y: number; z: number; d: number }

/** Canopy 10's pendants (the plan's overhead lamps on platform 10), their glass at the pendant's height (pendantGeometry), each with its distance from the face. */
export function wallLamps(plan: Pick<FurniturePlan, 'lamps'>, w: Pick<SuburbanWallPlan, 'face'>): WallLamp[] {
  return plan.lamps.filter((l) => l.overhead && l.ref === '10').map((l) => {
    const q = nearestOn(w.face, [l.x, l.z]).q;
    return { x: l.x, y: PLATFORM_HEIGHT + FIGURES.lampHeight - 0.14, z: l.z, d: Math.hypot(q[0] - l.x, q[1] - l.z) };
  });
}

/** The pendants' wash at a point on the wall (SUBURBAN_WALL.washSpread): the sum over the lamps of a gaussian of the distance on the wall from the point square behind each, capped at 1. */
export function wallWash(lamps: readonly WallLamp[], p: V3): number {
  const s2 = 2 * SUBURBAN_WALL.washSpread ** 2;
  let s = 0;
  for (const l of lamps) {
    const r2 = (p[0] - l.x) ** 2 + (p[1] - l.y) ** 2 + (p[2] - l.z) ** 2;
    s += Math.exp(-Math.max(0, r2 - l.d * l.d) / s2);
  }
  return Math.min(1, s);
}

/**
 * The wall's mesh, vertex-coloured: the face toward the tracks in pieces about 1.25 m wide and in rows (the plinth, then up to the lamps' wash's heights),
 * the plinth's brick darker (`plinthShade`); the back, the ends and the coping; the north end's return; the pilasters, their sides in a baked shade
 * (`sideShade`). UVs in metres. A `kxWash` attribute (0..1) carries the canopy's lamps' light at each vertex (wallWash).
 */
function suburbanWallGeometry(w: SuburbanWallPlan, lamps: readonly WallLamp[]): THREE.BufferGeometry {
  const W = SUBURBAN_WALL;
  const b = new Batch({ colored: true });
  const yTop = w.y1 - W.copingHeight;
  const full: Rgb = [1, 1, 1];
  const plinth: Rgb = [W.plinthShade, W.plinthShade, W.plinthShade];
  const shade: Rgb = [W.sideShade, W.sideShade, W.sideShade];
  const along: number[] = [0];
  for (let i = 1; i < w.face.length; i++) along.push((along[i - 1] as number) + Math.hypot((w.face[i] as Pt)[0] - (w.face[i - 1] as Pt)[0], (w.face[i] as Pt)[1] - (w.face[i - 1] as Pt)[1]));
  const away = (i: number): V3 => {
    const f = w.face[i] as Pt;
    const k = w.back[i] as Pt;
    const l = Math.hypot(k[0] - f[0], k[1] - f[1]) || 1;
    return [(k[0] - f[0]) / l, 0, (k[1] - f[1]) / l];
  };
  const toward = (n: V3): V3 => [-n[0], -n[1], -n[2]];
  const quad = (p: Pt, q: Pt, y0: number, y1: number, u0: number, u1: number, facing: V3, color: Rgb): void =>
    b.poly([[p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]]], [[u0, y0 - w.y0], [u1, y0 - w.y0], [u1, y1 - w.y0], [u0, y1 - w.y0]], { facing, color });
  // a vertical strip along `line` from y0 to y1, facing `facing(i)`; `step` > 0 cuts each segment into pieces no longer than it, `rows` the heights it is cut at
  const sheet = (line: readonly Pt[], y0: number, y1: number, facing: (i: number) => V3, step = 0, rows: readonly number[] = []): void => {
    const ys = [y0, ...rows.filter((r) => r > y0 && r < y1), y1];
    for (let i = 0; i + 1 < line.length; i++) {
      const p = line[i] as Pt, q = line[i + 1] as Pt;
      const u0 = along[i] as number, u1 = along[i + 1] as number;
      const n = step > 0 ? Math.max(1, Math.ceil((u1 - u0) / step)) : 1;
      for (let k = 0; k < n; k++) {
        const a: Pt = [p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n];
        const e: Pt = [p[0] + ((q[0] - p[0]) * (k + 1)) / n, p[1] + ((q[1] - p[1]) * (k + 1)) / n];
        for (let r = 0; r + 1 < ys.length; r++) {
          const ya = ys[r] as number, yc = ys[r + 1] as number;
          quad(a, e, ya, yc, u0 + ((u1 - u0) * k) / n, u0 + ((u1 - u0) * (k + 1)) / n, facing(i), yc <= W.plinthTop + 1e-9 ? plinth : full);
        }
      }
    }
  };
  // a horizontal strip between two lines at height y
  const flat = (l0: readonly Pt[], l1: readonly Pt[], y: number, up: boolean): void => {
    for (let i = 0; i + 1 < l0.length; i++) {
      const a = l0[i] as Pt, c = l0[i + 1] as Pt, d = l1[i + 1] as Pt, e = l1[i] as Pt;
      b.poly([[a[0], y, a[1]], [c[0], y, c[1]], [d[0], y, d[1]], [e[0], y, e[1]]], [[a[0], a[1]], [c[0], c[1]], [d[0], d[1]], [e[0], e[1]]], { facing: [0, up ? 1 : -1, 0], color: full });
    }
  };
  const n = w.face.length - 1;
  const dirAt = (i: number, j: number): V3 => {
    const p = w.face[i] as Pt;
    const q = w.face[j] as Pt;
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    return [(q[0] - p[0]) / l, 0, (q[1] - p[1]) / l];
  };
  const endOut = (i: number): V3 => (i === 0 ? dirAt(1, 0) : dirAt(n - 1, n));
  sheet(w.face, w.y0, yTop, (i) => toward(away(i)), 1.25, [W.plinthTop, 2.5, 3.6, 4.7, 5.8]);
  sheet(w.back, w.y0, yTop, (i) => away(i));
  // the ends: the south end plain; the north end turns away from the tracks in its return (a box `returnLength` long, the wall's thickness, from the face's end)
  const south = w.ret.at === 0 ? n : 0;
  quad(w.face[south] as Pt, w.back[south] as Pt, w.y0, W.plinthTop, 0, W.thickness, endOut(south), plinth);
  quad(w.face[south] as Pt, w.back[south] as Pt, W.plinthTop, yTop, 0, W.thickness, endOut(south), full);
  {
    const f = w.face[w.ret.at] as Pt, out = endOut(w.ret.at), dir = w.ret.dir, L = W.returnLength, T = W.thickness;
    // the return's footprint: from the face's end, `L` along `dir`, `T` thick on the wall's side (back from the end along the wall)
    const p0: Pt = f, p1: Pt = [f[0] + dir[0] * L, f[1] + dir[1] * L];
    const q0: Pt = [f[0] - out[0] * T, f[1] - out[2] * T], q1: Pt = [p1[0] - out[0] * T, p1[1] - out[2] * T];
    for (const [ya, yc, col] of [[w.y0, W.plinthTop, plinth], [W.plinthTop, w.y1, full]] as const) {
      quad(p0, p1, ya, yc, 0, L, out, col); // its outer face, flush with the wall's end
      quad(q1, p1, ya, yc, 0, T, [dir[0], 0, dir[1]], col); // its far end
      quad(q0, q1, ya, yc, 0, L, toward(out), col); // its face toward the wall's length (the part past the wall's back)
    }
    b.poly([[p0[0], w.y1, p0[1]], [p1[0], w.y1, p1[1]], [q1[0], w.y1, q1[1]], [q0[0], w.y1, q0[1]]], undefined, { facing: [0, 1, 0], color: full });
  }
  // the coping: its own two lines, `copingOverhang` past each face
  const shift = (line: readonly Pt[], d: number): Pt[] => line.map((p, i): Pt => { const a = away(i); return [p[0] + a[0] * d, p[1] + a[2] * d]; });
  const cf = shift(w.face, -W.copingOverhang);
  const cb = shift(w.back, W.copingOverhang);
  sheet(cf, yTop, w.y1, (i) => toward(away(i)));
  sheet(cb, yTop, w.y1, (i) => away(i));
  flat(cf, cb, w.y1, true);
  flat(cf, cb, yTop, false);
  quad(cf[south] as Pt, cb[south] as Pt, yTop, w.y1, 0, W.thickness, endOut(south), full);
  quad(cf[w.ret.at] as Pt, cb[w.ret.at] as Pt, yTop, w.y1, 0, W.thickness, endOut(w.ret.at), full);
  // the pilasters, from the foot to the coping's underside: the front in the wall's brick (the plinth's below its top), the two sides in shade
  const ph = W.pilasterWidth / 2, pd = (W.pilasterProud + 0.05) / 2;
  for (const p of w.pilasters) {
    const t: Pt = [Math.cos(p.rotY), -Math.sin(p.rotY)]; // local x, along the wall
    const nz: Pt = [Math.sin(p.rotY), Math.cos(p.rotY)]; // local z, across it
    const o = nearestOn(w.face, [p.x, p.z]).q;
    const sgn = (o[0] - p.x) * nz[0] + (o[1] - p.z) * nz[1] > 0 ? -1 : 1; // +1 when local +z points toward the tracks
    const out: Pt = [nz[0] * sgn, nz[1] * sgn];
    const pt = (sa: number, sc: number): Pt => [p.x + t[0] * ph * sa + out[0] * pd * sc, p.z + t[1] * ph * sa + out[1] * pd * sc];
    for (const [ya, yc, col, sideCol] of [[w.y0, W.plinthTop, plinth, [plinth[0] * W.sideShade, plinth[1] * W.sideShade, plinth[2] * W.sideShade] as Rgb], [W.plinthTop, yTop, full, shade]] as const) {
      quad(pt(-1, 1), pt(1, 1), ya, yc, 0, W.pilasterWidth, [out[0], 0, out[1]], col);
      quad(pt(1, -1), pt(1, 1), ya, yc, 0, 2 * pd, [t[0], 0, t[1]], sideCol);
      quad(pt(-1, -1), pt(-1, 1), ya, yc, 0, 2 * pd, [-t[0], 0, -t[1]], sideCol);
    }
    b.poly([[pt(-1, -1)[0], yTop, pt(-1, -1)[1]], [pt(1, -1)[0], yTop, pt(1, -1)[1]], [pt(1, 1)[0], yTop, pt(1, 1)[1]], [pt(-1, 1)[0], yTop, pt(-1, 1)[1]]], undefined, { facing: [0, 1, 0], color: full });
  }
  const g = b.build();
  const pos = g.getAttribute('position');
  const wash = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) wash[i] = wallWash(lamps, [pos.getX(i), pos.getY(i), pos.getZ(i)]);
  g.setAttribute('kxWash', new THREE.BufferAttribute(wash, 1));
  return g;
}

let suburbanBrickMat: THREE.MeshLambertMaterial | null = null;
/**
 * The wall's brick: the shed's stock brick (material 'brick', cloned), taking the vertex colours (the plinth, the pilasters' shaded sides), and after dark
 * (`windowNight`) the lamps' warm wash on the brick's own colour, scaled by the `kxWash` attribute. By day uWinNight is 0: the wash adds nothing.
 */
export function suburbanBrick(): THREE.MeshLambertMaterial {
  if (!suburbanBrickMat) {
    const m = (material('brick') as THREE.MeshLambertMaterial).clone();
    m.vertexColors = true;
    const [r, g, bl] = SUBURBAN_WALL.washColor;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uWinNight = windowNight;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float kxWash;\nvarying float vKxWash;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvKxWash = kxWash;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uWinNight;\nvarying float vKxWash;').replace('#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3( ${r.toFixed(4)}, ${g.toFixed(4)}, ${bl.toFixed(4)} ) * diffuseColor.rgb * vKxWash * uWinNight;`);
    };
    m.customProgramCacheKey = () => 'suburban-wall-wash';
    m.name = 'suburbanBrick';
    suburbanBrickMat = m;
  }
  return suburbanBrickMat;
}

/**
 * B6: the outer wall beside platform 10's canopy (SUBURBAN_WALL), from the furniture's plan (buildFurniture's `userData.plan`): one draw, `suburban-wall`,
 * in the shed's stock brick (suburbanBrick), casting no sun shadow, washed after dark by canopy 10's pendants. A structure, not furniture, so it is its own
 * object beside the furniture group; null without the canopies.
 */
export function buildSuburbanWall(plan: Pick<FurniturePlan, 'canopies' | 'lamps'>): THREE.Mesh | null {
  const wall = suburbanWallPlan(plan);
  if (!wall) return null;
  const mesh = new THREE.Mesh(suburbanWallGeometry(wall, wallLamps(plan, wall)), suburbanBrick());
  mesh.name = 'suburban-wall';
  return mesh;
}

/** Counts, for logging and the dev page. */
export function describePlan(plan: FurniturePlan): Record<string, number> {
  return {
    lamps: plan.lamps.length,
    benches: plan.benches.length,
    helpPoints: plan.helpPoints.length,
    totems: plan.totems.length,
    clocks: plan.clocks.length,
    extras: plan.extras.length,
    canopies: plan.canopies.length,
    columns: plan.canopies.reduce((n, c) => n + c.columns.length, 0),
  };
}

/**
 * The furniture: lamp standards, benches, help points, departure totems and the canopies of platforms
 * 9 and 10, placed by furniturePlan. Every kind is one InstancedMesh (or one merged mesh), so it is a
 * handful of draw calls: lamps, benches, help-points, totems (two groups: the body and the unlit screens), canopy-glass (two groups: the glazed
 * strips and the sheet), canopy-steel, canopy-lattice.
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
  add(instanced('lamps', lampGeometry(), lit, plan.lamps.filter((l) => !l.overhead), PLATFORM_HEIGHT));
  add(instanced('lamps-pendant', pendantGeometry(), lit, plan.lamps.filter((l) => l.overhead), PLATFORM_HEIGHT));
  add(instanced('benches', benchGeometry(), lit, plan.benches, PLATFORM_HEIGHT));
  add(instanced('help-points', helpPointGeometry(), lit, plan.helpPoints, PLATFORM_HEIGHT));

  if (plan.totems.length > 0) {
    // the screens are MeshBasicMaterial: unlit, so they show at full brightness by day and glow at night
    const tex = screenTexture();
    const face = new THREE.MeshBasicMaterial(tex ? { map: tex } : { color: 0x5a3b08 });
    face.name = 'screenFace';
    const totems = new THREE.Mesh(totemsGeometry(plan.totems, plan.clocks), [lit, face]);
    totems.name = 'totems';
    add(totems);
  }
  if (plan.extras.length > 0) {
    // round 16: every bin pair, number blade and trolley point merged in place: one draw, vertex-coloured, casting no shadow (lighting.ts SHADOW_CASTERS)
    const m = new THREE.Matrix4(), placed = (part: 'body' | 'face', items: readonly ExtraPlacement[]) => items.map((e) => {
      const g = extraGeometry(e, part);
      g.applyMatrix4(m.compose(new THREE.Vector3(e.x, PLATFORM_HEIGHT, e.z), new THREE.Quaternion().setFromAxisAngle(_up, e.rotY), new THREE.Vector3(1, 1, 1)));
      return g;
    });
    const parts = placed('body', plan.extras);
    const extras = new THREE.Mesh(mergeGeometries(parts) as THREE.BufferGeometry, lit);
    for (const p of parts) p.dispose();
    extras.name = 'platform-extras';
    add(extras);
    // round 17: the blades' panels and numerals, their own draw, lit from within after dark (bladeFace)
    const faces = placed('face', plan.extras.filter((e) => e.kind === 'blade'));
    if (faces.length) {
      const blades = new THREE.Mesh(mergeGeometries(faces) as THREE.BufferGeometry, bladeFace());
      for (const p of faces) p.dispose();
      blades.name = 'platform-blades';
      add(blades);
    }
  }

  if (plan.canopies.length > 0) {
    const glass = newBatch();
    const sheet = newBatch();
    const steel = newBatch();
    const lattice = newBatch();
    for (const c of plan.canopies) {
      const m = canopyMeshes(c);
      glass.append(m.glass);
      sheet.append(m.sheet);
      steel.append(m.steel);
      lattice.append(m.lattice);
    }
    // B6 round 2: the roof carried across the 9-10 track and on to the outer wall (suburbanRoofMeshes)
    const wall = suburbanWallPlan(plan);
    const c9 = plan.canopies.find((c) => c.ref === '9');
    const c10 = plan.canopies.find((c) => c.ref === '10');
    if (wall && c9 && c10) {
      const m = suburbanRoofMeshes(c10, c9, wall);
      glass.append(m.glass);
      sheet.append(m.sheet);
      lattice.append(m.lattice);
    }
    // the glazed strips and the opaque sheet between them are two meshes: the sheet, a second material of the steel's mesh, casts the sun's
    // shadow (lighting.ts SHADOW_CASTERS, which has room for no new name), the glass lets it through, so the platform is in shade with sunlit
    // bands under the strips; both are roofs to the weather (cover.ts)
    const roof = new THREE.Mesh(glass.build(), canopyGlass());
    roof.name = 'canopy-glass';
    roof.renderOrder = 2;
    add(roof);
    const frame = new THREE.Mesh(mergeGeometries([steel.build(), sheet.build()], true), [canopySteel(), canopySheet()]);
    frame.name = 'canopy-steel';
    add(frame);
    const web = new THREE.Mesh(lattice.build(), canopySteel());
    web.name = 'canopy-lattice';
    add(web);
  }
  return group;
}
