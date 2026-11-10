// P1 station: the overall roof, the island building, the Dundee canopies, both footbridges and the platform fittings (pure: batches only).
//
// SOURCES (gfx-rubrics/perth-station.md; photographs in refs/perth, receipts in SOURCES.json, all CC BY-SA):
//  R-pt1-a  (Sheppard 2018, platform 4): two-storey stone ranges on the island, the roof's iron trusses and pitched glazing springing from them.
//  R-pt1-a2 (Sheppard 2018, platform 4 and 5 clocks): bracket clocks on the island building.
//  R-pt1-b  (habiloid 2025, overview from the west): the long glazed roof, and the modern footbridge with its three lift towers south of it.
//  R-pt1-c  (Rosser1954 2016, bay platforms 5-7): cream cast-iron columns, ornate brackets, glazed pitched bays.
//  R-pt1-d  (Sheppard 2018 north and south footbridges, from platform 1; Abbott 2020 "Footbridges"): the lattice-sided north bridge with its
//           iron stairs and covered span to platform 1; the modern grey bridge with glazed parapets, stairs and lift towers.
// FORM. The two Sheppard footbridge photographs (R-pt1-d), taken along the platforms, show the glazed bays and their lattice girders running
// across the tracks: the roof is drawn as Waverley's ridge-and-furrow (waverley-roof.ts), ridges square to the through lines, on Waverley's
// column-and-girder plan (waverley-station-structure.ts), laid out in a frame turned to Perth's track bearing (PERTH_TRACK_AXIS).
// INFERRED, not published: the bay platforms' roof (R-pt1-c) has its ridges along the tracks; this round draws it with the main roof's.
// ASSUMED (no Perth dimension is published; each scaled from the photographs against the ASSUMED 0.915 m platform): the roof profile
// (Waverley's: 12 m pitch, 8 m gutter, 2.4 m rise; R-pt1-a puts the gutter girders' underside about 5.5 m over platform 4, two door
// heights over the ground-floor doors), the island building's storeys, window and door sizes, the footbridge deck heights, spans, stairs
// and towers, and every paint shade. Positions are OSM (ODbL) where OSM maps the thing; the footbridges' positions are INFERRED (below).
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {WaverleyScene as PerthData} from '../../core/waverley-data.ts';
import {Batch, rgb} from './materials.ts';
import type {Rgb, V3} from './materials.ts';
import {WAVERLEY_LEVELS, cleanRing} from './waverley-mesh.ts';
import {footprintRuns, ridgeRoofBatches, roofHeight, WAVERLEY_ROOF_PROFILE} from './waverley-roof.ts';
import {latticeGirder, WAVERLEY_EDGE_BANDS, WAVERLEY_PAINT, WAVERLEY_STRUCTURE, waverleyStationPlan, waverleyStructureBatches} from './waverley-station-structure.ts';
import type {WaverleyStationPlan, WaverleyStructureBatches} from './waverley-station-structure.ts';
import {bandAt, distanceToEdges, worldPoint} from './furniture.ts';

// ---------------------------------------------------------------------------------------------------------------------------------------
// The track frame: x' along the through lines (pointing south), z' across them (pointing west). Every plan below is made in it, so that
// Waverley's ridge-and-furrow, whose ridges run north-south across Waverley's east-west tracks, runs across Perth's tracks too.

/** The through lines' bearing: OSM way/779447285 (HGL1, the main line past platform 4) from (-62.8, -84.7) to (-21.6, 26.6). */
export const PERTH_TRACK_AXIS: Pt = (() => { const dx = -21.6 + 62.8, dz = 26.6 + 84.7, l = Math.hypot(dx, dz); return [dx / l, dz / l]; })();
const D = PERTH_TRACK_AXIS, E: Pt = [-D[1], D[0]];
/** The bay phase: x' is measured from a point PERTH_BAY_PHASE m north of the station node along the tracks, so the roof's furrow and column
 *  lines (every 12 m from x' = 0) fall mid-bay at the frozen pt-roof-underside eye (no column within 2 m of it). ASSUMED: no plan of the
 *  roof's bays is published, so the phase is free; the 12 m pitch is not changed. */
export const PERTH_BAY_PHASE = 4.1;
export const toLocal = (p: readonly number[]): Pt => [p[0] * D[0] + p[1] * D[1] + PERTH_BAY_PHASE, p[0] * E[0] + p[1] * E[1]];
export const toWorld = (p: readonly number[]): Pt => { const x = p[0] - PERTH_BAY_PHASE; return [x * D[0] + p[1] * E[0], x * D[1] + p[1] * E[1]]; };
/** Turn a batch built in the track frame into the scene's frame, in place (positions and normals; a rotation and a shift, so windings hold). */
export function batchToWorld(b: Batch): Batch {
  const p = b.positions, n = b.normals;
  for (let i = 0; i < p.length; i += 3) { const x = p[i] - PERTH_BAY_PHASE, z = p[i + 2]; p[i] = x * D[0] + z * E[0]; p[i + 2] = x * D[1] + z * E[1]; }
  for (let i = 0; i < n.length; i += 3) { const x = n[i], z = n[i + 2]; n[i] = x * D[0] + z * E[0]; n[i + 2] = x * D[1] + z * E[1]; }
  return b;
}
/** The shed line (lead ruling 2026-11-10 12:21): the train shed and the island building stop about 12 m inside the outline's north edge;
 *  the north-front buildings beyond it, and their roofs, are the frontage element's (W2). OSM's north edge runs at x' = -211 (its eastern
 *  corners, (-128.3, -177.5) and (-112.1, -183.6)) to -231; the line is 12 m inside the nearer, in the track frame. */
export const PERTH_SHED_NORTH = -211 + 12 + PERTH_BAY_PHASE;
/** The part of a ring (track frame) at x' >= x (Sutherland-Hodgman against one half-plane). */
export function clipNorth(r: readonly Pt[], x: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], ia = a[0] >= x, ib = b[0] >= x;
    if (ia) out.push(a);
    if (ia !== ib) { const t = (x - a[0]) / (b[0] - a[0]); out.push([x, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}

// --- small plan helpers
const near = (a: readonly number[], b: readonly number[], d = .2): boolean => Math.hypot(a[0] - b[0], a[1] - b[1]) < d;
export function inRing(p: Pt, r: readonly Pt[]): boolean { let yes = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > p[1]) !== (r[j][1] > p[1]) && p[0] < (r[j][0] - r[i][0]) * (p[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) yes = !yes; return yes; }
const segDist = (p: Pt, a: Pt, b: Pt): number => { const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz, t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz); };
export function ringDistance(p: Pt, r: readonly Pt[]): number { let best = Infinity; for (let i = 0; i < r.length; i++) best = Math.min(best, segDist(p, r[i], r[(i + 1) % r.length])); return best; }
const area2 = (r: readonly Pt[]): number => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return s; };
/** A ring moved `d` metres outward (mitred; each corner's move capped at 4 d). */
export function offsetRing(r: readonly Pt[], d: number): Pt[] {
  const s = area2(r) > 0 ? 1 : -1, n = r.length;
  const normal = (a: Pt, b: Pt): Pt => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [s * (b[1] - a[1]) / l, -s * (b[0] - a[0]) / l]; };
  return r.map((p, i) => {
    const n0 = normal(r[(i + n - 1) % n], p), n1 = normal(p, r[(i + 1) % n]), l = Math.hypot(n0[0] + n1[0], n0[1] + n1[1]) || 1, m: Pt = [(n0[0] + n1[0]) / l, (n0[1] + n1[1]) / l];
    const k = Math.min(4 * d, d / Math.max(.25, m[0] * n1[0] + m[1] * n1[1]));
    return [p[0] + m[0] * k, p[1] + m[1] * k];
  });
}
/** The part of a ring on one side of an axis line (Sutherland-Hodgman): axis 0 is x', 1 is z'; `greater` keeps the side at or over v. */
export function clipHalf(r: readonly Pt[], axis: 0 | 1, v: number, greater: boolean): Pt[] {
  const out: Pt[] = [], o = 1 - axis, ins = (p: Pt): boolean => greater ? p[axis] >= v : p[axis] <= v;
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], ia = ins(a), ib = ins(b);
    if (ia) out.push(a);
    if (ia !== ib) { const t = (v - a[axis]) / (b[axis] - a[axis]), q: Pt = [0, 0]; q[axis] = v; q[o] = a[o] + (b[o] - a[o]) * t; out.push(q); }
  }
  return out;
}
/** A ring less its corner x' >= x, z' >= z (the region must take one bite out of the ring, entering across one of the two lines and
 *  leaving across the other): the vertices inside it go, the crossing points and the region's corner come in. */
export function cutCorner(r: readonly Pt[], x: number, z: number): Pt[] {
  const inside = (p: Pt): boolean => p[0] >= x && p[1] >= z, out: Pt[] = [];
  const cross = (a: Pt, b: Pt): Pt => {
    // Where a-b crosses the region's boundary: the line it crosses is the one whose crossing lies on the region's side of the other.
    const tx = (x - a[0]) / (b[0] - a[0]), tz = (z - a[1]) / (b[1] - a[1]);
    const px: Pt = [x, a[1] + (b[1] - a[1]) * tx], pz: Pt = [a[0] + (b[0] - a[0]) * tz, z];
    return tx >= 0 && tx <= 1 && px[1] >= z ? px : pz;
  };
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], ia = inside(a), ib = inside(b);
    if (!ia) out.push(a);
    if (!ia && ib) out.push(cross(a, b));
    if (ia && !ib) { const q = cross(a, b), last = out.at(-1); if (last && last[0] !== q[0] && last[1] !== q[1]) out.push([x, z]); out.push(q); }
  }
  return out;
}
/** Sorted runs [z0, z1] of the line x' = x inside any of `rings`, touching runs (closer than `join`) merged. */
export function section(rings: readonly (readonly Pt[])[], x: number, join = .3): [number, number][] {
  const runs = rings.flatMap(r => footprintRuns(r, [], x)).sort((a, b) => a[0] - b[0]), out: [number, number][] = [];
  for (const r of runs) { const last = out.at(-1); if (last && r[0] - last[1] < join) last[1] = Math.max(last[1], r[1]); else out.push([r[0], r[1]]); }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// The roof's outline, the canopies' and the island building's (all OSM vertices; scene frame).

/** The bay track between platforms 5 and 6 (rail way/367722985): OSM's station outline (way/4064272) leaves it out as a 6 m notch, but
 *  R-pt1-c shows the bay roof spanning it. Closing the notch is a W1 proposal awaiting the lead's ruling (rubric: "a lead ruling per bay"). */
export const PERTH_BAY_NOTCH: readonly Pt[] = [[-45.4, 34.4], [-79.5, -48.5], [-85.8, -46], [-52.6, 35.1]];
/** The outline's two curved arms over the Dundee platforms 1 and 2 (east of the line between these two outline corners) are those platforms'
 *  canopies (rubric S4), not the overall roof: drawn low and flat (PERTH_CANOPY). */
export const PERTH_CANOPY_SPLIT: readonly [Pt, Pt] = [[14.7, -14], [15.4, 20]];
/** The overall roof's outline (the station outline, the bay notch closed, the Dundee canopies split off) and the canopies' outline. */
export function perthRoofRings(outer: readonly Pt[]): {roof: Pt[]; canopy: Pt[]} {
  const ring = cleanRing(outer).filter(p => !PERTH_BAY_NOTCH.some(q => near(p, q)));
  const i = ring.findIndex(p => near(p, PERTH_CANOPY_SPLIT[0])), j = ring.findIndex(p => near(p, PERTH_CANOPY_SPLIT[1]));
  if (i < 0 || j < 0) return {roof: ring, canopy: []};
  if (i < j) return {roof: [...ring.slice(0, i + 1), ...ring.slice(j)], canopy: ring.slice(i, j + 1)};
  return {roof: ring.slice(j, i + 1), canopy: [...ring.slice(i), ...ring.slice(0, j + 1)]};
}
/** The island building: the space OSM leaves between platform 4's west edge (way/44200505) and the east edges of platforms 5 (way/44200501)
 *  and 7 (way/44200496), closed at the north by the station outline's own corners. R-pt1-a shows the stone ranges filling it on the
 *  platform 4 face; R-pt1-c on the platform 5 face. Traced corner by corner (each matched to an OSM vertex within 0.2 m by perthIslandRing). */
export const PERTH_ISLAND_BUILDING: readonly Pt[] = [[-31.1, 27.6], [-45.8, -10.5], [-69.7, -71.6], [-87.7, -117.2], [-112.1, -183.6], [-128.3, -177.5], [-135.8, -196.5],
  [-147.6, -192.6], [-109.5, -96.6], [-95.7, -101.4], [-81.6, -67.6], [-74.5, -50.7], [-69.2, -52.3], [-51.3, -8.6], [-36, 29.7]];
/** PERTH_ISLAND_BUILDING snapped to the mapped vertices it was traced from (the platforms' and the station outline's). */
export function perthIslandRing(data: Pick<PerthData, 'platforms' | 'buildings'>, outline?: readonly Pt[]): Pt[] {
  const vertices = [...data.platforms.flatMap(p => p.path), ...outline ?? []];
  return PERTH_ISLAND_BUILDING.map(p => { const v = vertices.find(q => near(p, q)); return v ? [v[0], v[1]] as Pt : [p[0], p[1]] as Pt; });
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Sizes. Every figure ASSUMED (see the header) unless it says otherwise.

export const PERTH_STATION = {
  /** The roof's solid strips (R-pt1-a, R-pt1-d: wide dark bands between the glazed slopes, at the furrows and the ridges, about as wide as
   *  the glass between them), half-widths in plan (m). */
  bands: {gutter: 1.5, ridge: .75},
  /** The island building: walls to the gutter girders' tops (7.9 m over rail), so the roof bears on them as R-pt1-a shows; the screen above
   *  them up to the glazing is drawn in the wall's stone. Plinth 0.6 m, string course at 4.6 m over rail, cornice 0.35 m (R-pt1-a). */
  building: {top: 7.9, plinth: .6, string: 4.6, stringHeight: .25, cornice: .35, bay: 4.5, groundWindow: [1.4, 2.6, .55] as const, door: [1.5, 2.9] as const, doorEvery: 3, upperWindow: [1.2, 2.1, 5.2] as const, lift: .03},
  /** The Dundee canopies: flat, 5.6 m over rail (above the 4.8 m train envelope the scene test holds), a 0.6 m valance; columns every 7 m. */
  canopy: {top: 5.6, valance: .6, columnEvery: 7, column: .2},
  /** The deck half-width of both footbridges (3 m wide: R-pt1-d's lattice bridge, about two people abreast). */
  deckHalf: 1.5,
  /** Stairs: 1.8 m wide, 0.28 m going, rises of at most 0.18 m (Building Standards range); kept 1.2 m clear of a platform's sides. The lift
   *  bridge's are dog-legs (R-pt1-d Abbott: a flight down from the deck to a half landing on round columns, a second flight back beside it):
   *  the flights 0.2 m apart, the half landing 1.8 m deep, its columns 0.36 m across. ASSUMED sizes, scaled from Abbott against the
   *  1.1 m balustrade. */
  stair: {width: 1.8, going: .28, maxRise: .18, clear: 1.2, gap: .2, landing: 1.8, column: .18},
  /** Lift towers (R-pt1-d Abbott, R-pt1-b): 3.2 m square, standing 3.6 m over the deck, clad in vertical panels about 0.8 m wide (Abbott);
   *  ASSUMED sizes scaled from Abbott against the stair's balustrade. */
  tower: {size: 3.2, above: 3.6, panel: .8},
  /** Bracket clocks on the island building (R-pt1-a2): a 0.8 m dial, 3.6 m up, 0.7 m out from the wall. */
  clock: {radius: .4, height: 3.6, out: .7},
  /** Furniture, ASSUMED sizes scaled from R-pt1-a (benches against the building's doors) and R-pt1-c:
   *  - benches 1.8 m long, their seat 0.45 m up, standing benchOff m out from the wall;
   *  - the kiosk 4.2 m along the wall, 2.2 m out, 3.2 m to its eaves, centred near x' = kioskAlong;
   *  - direction boards 2.4 x 0.9 m, their foot 3.0 m up; number boards 0.6 m square, 3.0 m up. */
  furniture: {benchOff: .75, bench: [1.8, .45] as const, kiosk: [4.2, 2.2, 3.2] as const, kioskAlong: -26 + PERTH_BAY_PHASE, board: [2.4, .9, 3.0] as const, number: [.6, 3.0] as const},
} as const;

/** The bay roof over platforms 5-7 (R-pt1-c, looking along platform 5: the ridges run along the tracks, the pitched glazing on arched iron
 *  ribs, an arched glazed screen closing the south end, cream columns with arched lattice spandrels down platforms 6/7, the island building's
 *  wall on the other side). Track frame (x' south, z' west), all INFERRED or ASSUMED from that photograph:
 *  - it covers the roof's part at x' >= north (the island building's own west step, OSM) and z' >= z0 (just inside platform 5's east edge);
 *  - two spans across it, furrow to furrow: platform 5 and its bay track on the island wall and the column line, then platforms 6/7 out to
 *    the outline's west edge (the second span's far furrow lies past that edge, which cuts it);
 *  - the column line z' = columnZ on platforms 6/7, a column every columnEvery m where the platform takes it 1.5 m clear of both edges;
 *  - the arched ribs spring at `springing` and stand every ribEvery m. */
export const PERTH_BAY_ROOF = {
  north: -124.3, z0: 44.6, gutter: 8, columnZ: 63.6, columnEvery: 9, springing: 7, ribEvery: 4.5,
  spans: [{z0: 44.6, z1: 63.6, rise: 3.2}, {z0: 63.6, z1: 73.6, rise: 1.8}],
  bands: {gutter: .6, ridge: .3},
} as const;
/** The bay roof's glazing height over rail (m) at z' (its spans' pitched profile; the gutter outside them). */
export function bayRoofHeight(z: number): number {
  const s = PERTH_BAY_ROOF.spans.find(q => z >= q.z0 && z <= q.z1) ?? (z > PERTH_BAY_ROOF.spans[1].z1 ? PERTH_BAY_ROOF.spans[1] : undefined);
  if (!s) return PERTH_BAY_ROOF.gutter;
  const half = (s.z1 - s.z0) / 2, t = Math.min(1, Math.abs(z - (s.z0 + half)) / half);
  return PERTH_BAY_ROOF.gutter + s.rise * (1 - t) + (z > s.z1 ? s.rise * (z - s.z1) / half : 0);
}

/** The two footbridges, in the track frame: `along` is the deck's centre line x' (m). INFERRED positions: the north (lattice) bridge crosses
 *  from platform 4 by the island building to platforms 3 and 1 under the roof (R-pt1-d north and "from platform 1": its covered span runs
 *  out to platform 1 past the roof); the south (lift) bridge stands just south of the overall roof (R-pt1-b), with a tower on each of the
 *  three islands it serves (R-pt1-d Abbott shows three). Each landing is a platform group: an island drawn as two OSM polygons is one group.
 *  Deck walking levels over rail: 6.6 m (north) and 7.0 m (south), so each deck's underside clears the 5.6 m Dundee canopy.
 *  Where on its platform a landing stands is NOT fixed by the evidence (no photograph places a stair or tower across its island): each is
 *  put at the best estimate, the middle of its platform group on the deck's line, and moved only as far as it must be to fit (ASSUMED). */
export const PERTH_FOOTBRIDGES = [
  {id: 'north', along: -20 + PERTH_BAY_PHASE, deck: 6.6, kind: 'lattice', landings: [['4'], ['3'], ['1']]},
  {id: 'south', along: 24 + PERTH_BAY_PHASE, deck: 7.0, kind: 'lift', landings: [['4', '5'], ['2', '3'], ['1']]},
] as const;

/** Where along the platform (x', m) each island clock hangs: platform 4's south of the north footbridge, platform 5's by the bay ends. ASSUMED. */
export const PERTH_CLOCK_ALONG: Readonly<Record<string, number>> = {'4': -8 + PERTH_BAY_PHASE, '5': -30 + PERTH_BAY_PHASE};

/** Paint (R-pt1-a, R-pt1-c, R-pt1-d): dark brown roof ironwork, cream columns, a maroon lattice bridge, a grey modern bridge. ASSUMED shades. */
export const PERTH_PAINT = {
  iron: 0x4d4238, column: 0xd9d0b6, gilt: 0xcfc4a6, pedestal: 0x5d4f42, lamp: 0xefeee8, bench: 0xa9aeb2, sign: 0x203a72, signFace: 0xf2f2ee,
  screen: 0x1b1d20, valance: 0x4d4238, fascia: 0x4d4238, railing: 0x5a3e30, render: 0xd8ccb2, office: 0x34465a, officeRoof: 0x6d7175, door: 0x3c2f27,
  stoneWall: 0xa3958d, stoneDressing: 0xbcb0a6, stonePlinth: 0x6a5f5a, lattice: 0x6b3a2c, tread: 0xb4b1a8, modern: 0xa3a8ab, frame: 0xe2e3df, seam: 0x8d9295, glassPanel: 0x9db4ba, handrail: 0xcdd06a, clockFace: 0xf3f1e8, clockCase: 0x2b2b2e, coper: 0xcbb68e, benchSlat: 0xb2602f, benchFrame: 0x2e2f31, bin: 0x2b3034, timber: 0x6e4a30,
} as const;
const P = (k: keyof typeof PERTH_PAINT): Rgb => rgb(PERTH_PAINT[k]);

// ---------------------------------------------------------------------------------------------------------------------------------------
// The plan: Waverley's, made in the track frame, then cleared where the footbridges stand.

export interface PerthBridgeLanding {refs: string[]; z: number; width: number; start: Pt; dir: Pt; length: number; stair: [number, number, number, number];
  /** A dog-leg's (lift bridges): the side (+1 or -1 along the stair's left normal) of the flight that leaves the deck; the other returns. */
  side?: number;
  /** The lift tower (lift bridges): its centre and its unit axis, pointing away from the deck. */
  tower?: {c: Pt; dir: Pt}}
export interface PerthBridgePlan {id: string; along: number; deck: number; kind: 'lattice' | 'lift'; z0: number; z1: number; landings: PerthBridgeLanding[]; posts: Pt[]}
export interface PerthStationPlan {
  roof: Pt[]; canopy: Pt[]; island: Pt[];
  /** Tite's 1848 block (scene frame): its footprint and its tower's centre. */
  tite: {ring: Pt[]; tower: Pt} | undefined;
  /** Track-frame copies of the above, and Waverley's plan in that frame. */
  local: {roof: Pt[]; canopy: Pt[]; island: Pt[]; tite: Pt[]; platforms: {ref: string; pts: Pt[]}[];
    /** The roof split in two: the main ridge-and-furrow roof and the bay roof (PERTH_BAY_ROOF). */
    main: Pt[]; bay: Pt[]};
  structure: WaverleyStationPlan;
  bridges: PerthBridgePlan[];
  /** Rectangles (track frame, x0 x1 z0 z1) kept clear of roof columns, girders and furniture: the decks, stairs and towers. */
  clear: [number, number, number, number][];
  canopyColumns: Pt[];
  clocks: {at: Pt; out: Pt}[];
  /** R-pt1-a's and R-pt1-c's platform furniture (track frame): benches and bins along the island building's faces (`out` from the wall),
   *  the timber kiosk on its platform 4 face, direction boards hung from the column-to-column girders (`dir` along the girder) and
   *  platform number boards on the columns. */
  furniture: {benches: {at: Pt; out: Pt}[]; bins: Pt[]; kiosk?: {at: Pt; out: Pt}; boards: {at: Pt; dir: Pt}[]; numbers: {at: Pt; dir: Pt}[]};
}
const inRect = (p: Pt, r: readonly number[], m = 0): boolean => p[0] >= r[0] - m && p[0] <= r[1] + m && p[1] >= r[2] - m && p[1] <= r[3] + m;

/** The rectangle (x0 x1 z0 z1, track frame) round a stair or tower footprint: start point, unit direction, length, width. */
function footprintBox(start: Pt, dir: Pt, length: number, width: number): [number, number, number, number] {
  const n: Pt = [-dir[1], dir[0]], end: Pt = [start[0] + dir[0] * length, start[1] + dir[1] * length], w = width / 2;
  const pts = [start, end].flatMap(p => [[p[0] + n[0] * w, p[1] + n[1] * w], [p[0] - n[0] * w, p[1] - n[1] * w]]);
  return [Math.min(...pts.map(p => p[0])), Math.max(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[1]))];
}
/** Does the strip from `start` along `dir` (length x width, grown by `margin` all round) lie inside the platform group, sampled every 0.4 m? */
function stripInside(rings: readonly (readonly Pt[])[], start: Pt, dir: Pt, length: number, width: number, margin: number): boolean {
  const n: Pt = [-dir[1], dir[0]], half = width / 2 + margin;
  for (let s = -margin; s <= length + margin + 1e-9; s += .4) for (let t = -half; t <= half + 1e-9; t += .4) {
    const p: Pt = [start[0] + dir[0] * s + n[0] * t, start[1] + dir[1] * s + n[1] * t];
    if (!rings.some(r => inRing(p, r))) return false;
  }
  return true;
}
function planBridge(b: typeof PERTH_FOOTBRIDGES[number], platforms: {ref: string; pts: Pt[]}[]): PerthBridgePlan {
  const S = PERTH_STATION, half = S.deckHalf, rise = b.deck - WAVERLEY_LEVELS.platform, steps = Math.ceil(rise / S.stair.maxRise);
  // A straight flight's run, or a dog-leg's: the first flight's run and the half landing (the second flight returns beside it).
  const runOf = (dogleg: boolean): [number, number] => dogleg ? [(Math.ceil(steps / 2) - 1) * S.stair.going + S.stair.landing, 2 * S.stair.width + S.stair.gap] : [(steps - 1) * S.stair.going, S.stair.width];
  // What a landing tries, in order: the lift bridge's dog-leg with its tower, a straight flight with its tower, then each without.
  const tries: [boolean, boolean][] = b.kind === 'lift' ? [[true, true], [false, true], [true, false], [false, false]] : [[false, false]];
  const groups = b.landings.map(refs => platforms.filter(p => (refs as readonly string[]).includes(p.ref)).map(p => p.pts));
  const centres = groups.map(rings => { const runs = section(rings, b.along); return runs.length ? runs.reduce((a, r) => r[1] - r[0] > a[1] - a[0] ? r : a) : undefined; });
  const known = centres.filter((c): c is [number, number] => !!c), middle = known.reduce((s, c) => s + (c[0] + c[1]) / 2, 0) / Math.max(1, known.length);
  const landings: PerthBridgeLanding[] = [];
  groups.forEach((rings, gi) => {
    const run = centres[gi]; if (!run || !rings.length) return;
    const zc = (run[0] + run[1]) / 2;
    // The platform's own heading here (its middle line's drift across x'), for the curved Dundee platforms.
    const mid = (x: number): number | undefined => { const r = section(rings, x).find(q => q[0] <= zc + 6 && q[1] >= zc - 6); return r && (r[0] + r[1]) / 2; };
    const m0 = mid(b.along - 3), m1 = mid(b.along + 3), slope = m0 !== undefined && m1 !== undefined ? (m1 - m0) / 6 : 0, tl = Math.hypot(1, slope), tangent: Pt = [1 / tl, slope / tl];
    // Candidate stairs: along the tracks (south, then north), along the platform's heading either way, each from the deck's side at the
    // landing, never back under the deck. The first whose footprint, 1.2 m clear all round, lies on the platform wins.
    // A lift bridge's tower stands on the deck's other side, on the stair's line; where no place takes both, the stair alone is drawn.
    // With dog-leg stairs every island the lift bridge serves takes both, platform 1's curve included: three towers, as R-pt1-d Abbott and
    // R-pt1-b show (the round 1 straight flight left platform 1 without one; lead ruling 12:31 accepted that as ASSUMED).
    const dirs: Pt[] = [[1, 0], [-1, 0], tangent, [-tangent[0], -tangent[1]]];
    for (const [dogleg, withTower] of tries) for (const dz of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
      const z = zc + dz, [length, width] = runOf(dogleg);
      // The tower's places for a stair heading d: across the deck from it, on its line, or beside it on the deck's same side (R-pt1-d
      // Abbott's nearest tower stands beside its stair's head). Each as its foot's middle point and its heading away from the deck.
      const towerSpots = (d: Pt): [Pt, Pt][] => {
        const sg = Math.sign(d[0]), n: Pt = [-d[1], d[0]], o = width / 2 + .3 + S.tower.size / 2, st: Pt = [b.along + sg * half, z];
        // Across the deck it may stand a little along the deck from the stair's line, where a curved platform turns away under it.
        const across = [0, 1, -1, 2, -2, 3, -3].map((k): [Pt, Pt] => [[b.along - sg * half, z + k], [-d[0], -d[1]]]);
        return [...across, [[st[0] + n[0] * o, st[1] + n[1] * o], d], [[st[0] - n[0] * o, st[1] - n[1] * o], d]];
      };
      let spot: [Pt, Pt] | undefined;
      const found = dirs.find(d => {
        if (Math.abs(d[0]) < .3 && d[1] * (z - middle) < 0) return false;
        const start: Pt = [b.along + Math.sign(d[0]) * half, z];
        if (!stripInside(rings, start, d, length, width, S.stair.clear)) return false;
        spot = withTower ? towerSpots(d).find(([p, td]) => stripInside(rings, p, td, S.tower.size, S.tower.size, .3)) : undefined;
        return !withTower || !!spot;
      });
      if (!found) continue;
      const start: Pt = [b.along + Math.sign(found[0]) * half, z];
      const tower = withTower && spot ? {c: [spot[0][0] + spot[1][0] * S.tower.size / 2, spot[0][1] + spot[1][1] * S.tower.size / 2] as Pt, dir: spot[1]} : undefined;
      // The dog-leg's first flight leaves the deck on the side towards the bridge's middle, so it meets the deck even at the outer islands.
      const nz = found[0], side = dogleg ? (Math.sign((middle - z) * nz) || 1) : undefined;
      landings.push({refs: [...b.landings[gi]], z, width: run[1] - run[0], start, dir: found, length, stair: footprintBox(start, found, length, width), tower, side});
      return;
    }
  });
  // The deck reaches every stair head and tower it serves.
  const T2 = S.tower.size / 2, zs = landings.flatMap(l => l.tower ? [l.z - 1, l.z + 1, l.tower.c[1] - T2, l.tower.c[1] + T2] : [l.z - 1, l.z + 1]), z0 = Math.min(...zs), z1 = Math.max(...zs);
  // Posts under the deck: a pair on every platform the deck crosses that has room for them.
  const posts: Pt[] = [];
  for (const r of section(platforms.map(p => p.pts), b.along)) {
    const z = (r[0] + r[1]) / 2;
    if (z < z0 || z > z1 || r[1] - r[0] < 3.5) continue;
    for (const s of [-1, 1]) posts.push([b.along + s * (half - .2), z]);
  }
  return {id: b.id, along: b.along, deck: b.deck, kind: b.kind, z0, z1, landings, posts};
}

/** Tite's 1848 block (lead ruling 12:24, from W2's evidence: HES LB39340, "a multi-bay former ticket office block" whose earliest section
 *  faces the platforms, with a 2-storey north extension by A & A Heiton; R-pt1-b shows its octagonal tower north of the main footbridge at
 *  about x -34). OSM maps no building there: the block is drawn on platform 3's east edge (OSM way/44200499, from (-15.7, -10.7) to
 *  (-51.9, -97.8)), PERTH_TITE.width deep to the east, from just north of the north footbridge to PERTH_TITE.north. Its depth, length,
 *  height and the tower's sizes are ASSUMED, scaled from R-pt1-b against the platform. Its walls rise to the roof's gutter girders like the
 *  island's; it carries its own hipped slate roof and the overall roof stops at it. */
export const PERTH_TITE = {edge: [[-15.7, -10.7], [-51.9, -97.8]] as readonly Pt[], width: 12, north: -82, bridgeGap: 1.1, towerX: -34, towerRadius: 2.8, towerTop: 17, spireTop: 24, rise: 4} as const;
function titeBlock(data: Pick<PerthData, 'platforms'>): {ring: Pt[]; tower: Pt} | undefined {
  const p3 = data.platforms.find(p => p.ref === '3'); if (!p3) return undefined;
  const snap = (q: Pt): Pt => { const v = p3.path.find(r => near(r, q)); return v ? [v[0], v[1]] : [q[0], q[1]]; };
  const a = toLocal(snap(PERTH_TITE.edge[0] as Pt)), b = toLocal(snap(PERTH_TITE.edge[1] as Pt)), north = PERTH_FOOTBRIDGES[0].along - PERTH_STATION.deckHalf - PERTH_TITE.bridgeGap;
  const at = (x: number): Pt => [x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])], w0 = at(north), w1 = at(PERTH_TITE.north);
  // The block lies on the edge's east side (-z' in the track frame: platform 3 is west of its east edge).
  const ring: Pt[] = [w0, w1, [w1[0], w1[1] - PERTH_TITE.width], [w0[0], w0[1] - PERTH_TITE.width]];
  // The tower on the block's middle line, where that line passes x = PERTH_TITE.towerX in the scene frame.
  let tower: Pt = [(w0[0] + w1[0]) / 2, (w0[1] + w1[1]) / 2 - PERTH_TITE.width / 2], miss = Infinity;
  for (let x = w1[0] + PERTH_TITE.towerRadius + 1; x <= w0[0] - PERTH_TITE.towerRadius - 1; x += .25) { const c: Pt = [x, at(x)[1] - PERTH_TITE.width / 2], m = Math.abs(toWorld(c)[0] - PERTH_TITE.towerX); if (m < miss) { miss = m; tower = c; } }
  return {ring, tower};
}

const planCache = new WeakMap<object, PerthStationPlan>();
/** Where everything goes (pure). Cached per data object: the platforms and the roof both read it. */
export function perthStationPlan(data: Pick<PerthData, 'platforms' | 'rails' | 'buildings'>, outline: readonly Pt[] | undefined): PerthStationPlan {
  const hit = planCache.get(data); if (hit) return hit;
  const {roof, canopy} = outline ? perthRoofRings(outline) : {roof: [], canopy: []};
  const island = perthIslandRing(data, outline);
  const platforms = data.platforms.map(p => ({ref: p.ref ?? '', pts: cleanRing(p.path).map(toLocal)}));
  const titeLocal = titeBlock(data);
  const roofLocal = clipNorth(roof.map(toLocal), PERTH_SHED_NORTH), BR = PERTH_BAY_ROOF;
  const bay = roofLocal.length >= 3 ? clipHalf(clipHalf(roofLocal, 0, BR.north, true), 1, BR.z0, true) : [];
  const local = {roof: roofLocal, canopy: canopy.map(toLocal), island: clipNorth(island.map(toLocal), PERTH_SHED_NORTH), tite: titeLocal?.ring ?? [], platforms,
    main: bay.length >= 3 ? cutCorner(roofLocal, BR.north, BR.z0) : roofLocal, bay: bay.length >= 3 ? bay : []};
  const localData = {platforms: data.platforms.map(p => ({...p, path: p.path.map(toLocal)})), rails: data.rails.map(r => ({...r, path: r.path.map(toLocal)}))};
  // The island building is a cut-out of the roof's plan (no column, girder or rafter over it), grown 3 cm so the gable screens Waverley's
  // plan draws along the outline skip the edges the building shares with it. The glazing itself runs on over the building (R-pt1-a).
  const cuts = [local.island, local.tite].filter(r => r.length >= 3).map(r => offsetRing(r, .03));
  const structure = waverleyStationPlan(localData, roof.length ? {outer: local.main, holes: []} : undefined, cuts);
  const bridges = PERTH_FOOTBRIDGES.map(b => planBridge(b, platforms));
  const clear: [number, number, number, number][] = [];
  for (const b of bridges) {
    clear.push([b.along - PERTH_STATION.deckHalf, b.along + PERTH_STATION.deckHalf, b.z0, b.z1]);
    for (const l of b.landings) {
      const T = PERTH_STATION.tower.size;
      clear.push(l.stair);
      if (l.tower) clear.push(footprintBox([l.tower.c[0] - l.tower.dir[0] * T / 2, l.tower.c[1] - l.tower.dir[1] * T / 2], l.tower.dir, T, T));
    }
  }
  // Clear the roof's plan where the bridges stand: no column, platform girder, lamp, bench, sign or screen in a deck, stair or tower (0.5 m
  // margin); a platform girder or lamp whose span crosses one goes with it. Perth's platforms carry no Waverley-style office (none sourced).
  const blocked = (p: Pt, m = .5): boolean => clear.some(r => inRect(p, r, m));
  const crosses = ([a, b]: [Pt, Pt]): boolean => { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .25); for (let i = 0; i <= n; i++) if (blocked([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n], .6)) return true; return false; };
  const s = structure, dropped = s.spans.filter(crosses).map(([a, b]): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  s.columns = s.columns.filter(c => !blocked([c.x, c.z], .8));
  s.spans = s.spans.filter(sp => !crosses(sp) && [sp[0], sp[1]].every(e => s.columns.some(c => near([c.x, c.z], e, .05))));
  s.lamps = s.lamps.filter(l => !blocked([l.x, l.z]) && !dropped.some(d => near(d, [l.x, l.z], .1)));
  for (const k of ['benches', 'signs', 'screens'] as const) s[k] = s[k].filter(o => !blocked([o.x, o.z]) && (k !== 'signs' || s.columns.some(c => near([c.x, c.z], [o.x, o.z], .05))));
  s.offices = [];
  // The bay roof's column line (PERTH_BAY_ROOF) and the girders along it, column to column and out to the bay roof's ends.
  if (local.bay.length >= 3) {
    const xs = local.bay.map(p => p[0]), lo = Math.max(BR.north, Math.min(...xs)), hi = Math.max(...xs), line: Pt[] = [];
    for (let x = hi - 4; x > lo + 2; x -= BR.columnEvery) {
      const p: Pt = [x, BR.columnZ], pf = platforms.find(q => inRing(p, q.pts));
      if (!pf || ringDistance(p, pf.pts) < 1.5 || blocked(p, .8)) continue;
      s.columns.push({x, z: BR.columnZ, ref: pf.ref}); line.push(p);
    }
    const ends = section([local.bay.map(([x, z]): Pt => [z, x])], BR.columnZ).flat();
    if (line.length && ends.length) {
      const pts: Pt[] = [[Math.max(...ends) - .3, BR.columnZ], ...line, [Math.min(...ends) + .3, BR.columnZ]];
      for (let i = 1; i < pts.length; i++) s.spans.push([pts[i - 1], pts[i]]);
    }
  }
  // Railings stand along a platform's open edges: not along the island building's walls, nor across a stair.
  const byWall = (p: Pt): boolean => [local.island, local.tite].some(r => r.length >= 3 && ringDistance(p, r) < 1);
  s.railings = s.railings.filter(([a, b]) => !(byWall(a) && byWall(b)) && !crosses([a, b]));
  // Canopy columns: down each Dundee platform's middle, every PERTH_STATION.canopy.columnEvery m along its axis, under the canopy, clear of
  // the track edges (the KX safety line) and of the bridges.
  const canopyColumns: Pt[] = [];
  if (local.canopy.length >= 3) for (const f of s.frames) {
    if (f.ref !== '1' && f.ref !== '2') continue;
    for (let t = f.tLo + 3; t < f.tHi - 3; t += PERTH_STATION.canopy.columnEvery) {
      const band = bandAt(f, t, PERTH_STATION.canopy.column); if (!band) continue;
      const p = worldPoint(f, t, band.mid);
      if (inRing(p, f.pts) && inRing(p, local.canopy) && ringDistance(p, local.canopy) > .6 && distanceToEdges(p, f.edges) > 1.8 && !blocked(p, 1)) canopyColumns.push(p);
    }
  }
  // Clocks (R-pt1-a2: platform 4 and platform 5): one bracket clock on the island building's wall facing each platform, at the wall point
  // nearest PERTH_CLOCK_ALONG (x'). ASSUMED positions: the photographs do not fix them along the platform.
  const clocks: {at: Pt; out: Pt}[] = [];
  const sgn = area2(local.island) > 0 ? 1 : -1;
  for (const [ref, target] of Object.entries(PERTH_CLOCK_ALONG)) {
    const pf = platforms.find(p => p.ref === ref); if (!pf) continue;
    let best: {at: Pt; out: Pt; miss: number} | undefined;
    for (let i = 0; i < local.island.length; i++) {
      const a = local.island[i], b = local.island[(i + 1) % local.island.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 4) continue;
      const out: Pt = [sgn * (b[1] - a[1]) / len, -sgn * (b[0] - a[0]) / len], dx = b[0] - a[0];
      const s = Math.max(1, Math.min(len - 1, Math.abs(dx) > 1e-6 ? (target - a[0]) / dx * len : len / 2)), m: Pt = [a[0] + (b[0] - a[0]) * s / len, a[1] + (b[1] - a[1]) * s / len];
      const probe: Pt = [m[0] + out[0] * 2, m[1] + out[1] * 2], miss = Math.abs(m[0] - target);
      if (inRing(probe, pf.pts) && !blocked(probe, 1) && (!best || miss < best.miss)) best = {at: m, out, miss};
    }
    if (best) clocks.push({at: best.at, out: best.out});
  }
  // Furniture (R-pt1-a, R-pt1-c; positions ASSUMED, densities from those photographs): along each island face a bench in every bay that
  // has no door (the building's 4.5 m bays, a door in every third) and a bin by every second door, 0.75 m out from the wall, wherever the
  // spot is on a platform, 2 m clear of its track edges and clear of the bridges.
  const F = PERTH_STATION.furniture, frameOf = (p: Pt) => s.frames.find(f => inRing(p, f.pts));
  const roomy = (p: Pt, m: number): boolean => { const f = frameOf(p); return !!f && distanceToEdges(p, f.edges) > m && !blocked(p, 1); };
  const furniture: PerthStationPlan['furniture'] = {benches: [], bins: [], boards: [], numbers: []};
  const isl = local.island, sgnI = area2(isl) > 0 ? 1 : -1;
  let kioskMiss = 0;
  for (let i = 0; i < isl.length; i++) {
    const a = isl[i], b = isl[(i + 1) % isl.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 2) continue;
    const d: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], out: Pt = [sgnI * d[1], -sgnI * d[0]], n = Math.max(1, Math.round(len / PERTH_STATION.building.bay)), w = len / n;
    const at = (t: number, o: number): Pt => [a[0] + d[0] * t + out[0] * o, a[1] + d[1] * t + out[1] * o];
    for (let k = 0; k < n; k++) {
      const door = k % PERTH_STATION.building.doorEvery === 1, p = at((k + .5) * w + (door ? 1.4 : 0), door ? .5 : F.benchOff);
      if (!roomy(p, 2)) continue;
      if (!door) furniture.benches.push({at: p, out});
      else if (k % 2) furniture.bins.push(p);
    }
    // The kiosk (R-pt1-a: a glazed timber kiosk against the building's platform 4 face, north of the north footbridge): on the platform 4
    // face, its middle nearest x' = F.kioskAlong. ASSUMED position along the face.
    const pf4 = platforms.find(q => q.ref === '4'), t = Math.max(F.kiosk[0], Math.min(len - F.kiosk[0], Math.abs(d[0]) > 1e-6 ? (F.kioskAlong - a[0]) / d[0] : -1)), c = at(t, F.kiosk[1] / 2 + .05);
    const corners = [-1, 1].flatMap(e => [at(t + e * F.kiosk[0] / 2, .1), at(t + e * F.kiosk[0] / 2, F.kiosk[1])]);
    if (pf4 && len > F.kiosk[0] + 2 && inRing(c, pf4.pts) && roomy(c, 1.8) && corners.every(q => roomy(q, 1)) && (!kioskMiss || Math.abs(c[0] - F.kioskAlong) < kioskMiss)) { furniture.kiosk = {at: at(t, 0), out}; kioskMiss = Math.abs(c[0] - F.kioskAlong); }
  }
  if (furniture.kiosk) { const k = furniture.kiosk; furniture.benches = furniture.benches.filter(q => Math.hypot(q.at[0] - k.at[0], q.at[1] - k.at[1]) > F.kiosk[0] / 2 + 1.5); furniture.bins = furniture.bins.filter(q => Math.hypot(q[0] - k.at[0], q[1] - k.at[1]) > F.kiosk[0] / 2 + 1); }
  // Direction boards under the girders (R-pt1-a, R-pt1-c: white boards hung over the platforms): one at every second girder's middle,
  // 2 m clear of the track edges; platform number boards (R-pt1-c "5", "6 7") on every fourth column, square to the platform.
  s.spans.forEach(([a, b], i) => {
    const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (i % 2 || l < 4) return;
    const dir: Pt = [(b[0] - a[0]) / l, (b[1] - a[1]) / l], e = F.board[0] / 2;
    if ([m, [m[0] + dir[0] * e, m[1] + dir[1] * e], [m[0] - dir[0] * e, m[1] - dir[1] * e]].every(p => roomy(p as Pt, 2))) furniture.boards.push({at: m, dir});
  });
  s.columns.forEach((c, i) => {
    if (i % 4 !== 2) return; const f = frameOf([c.x, c.z]); if (!f) return;
    const p: Pt = [c.x, c.z]; if (roomy(p, 1.8)) furniture.numbers.push({at: p, dir: [f.axis[0], f.axis[1]]});
  });
  // The scene-frame outlines, as drawn: cut at the shed line.
  const plan: PerthStationPlan = {roof: local.roof.map(toWorld), canopy, island: local.island.map(toWorld), tite: titeLocal && {ring: titeLocal.ring.map(toWorld), tower: toWorld(titeLocal.tower)}, local, structure, bridges, clear, canopyColumns, clocks, furniture};
  planCache.set(data, plan);
  return plan;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Shapes. Everything is built in the track frame and turned into the scene's at the end (batchToWorld).

/** A box from a to b (its long axis), w wide and h deep. */
function beam(b: Batch, a: V3, c: V3, w: number, h: number, color: Rgb): void {
  const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2], l = Math.hypot(dx, dy, dz), hz = Math.hypot(dx, dz);
  if (l < 1e-6) return;
  b.box([(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2], [l, h, w], {rotZ: Math.atan2(dy, hz), rotY: Math.atan2(-dz, dx), color});
}
/** An upright round column (an octagonal prism) from y0 to y1. */
function roundColumn(b: Batch, x: number, z: number, r: number, y0: number, y1: number, color: Rgb): void {
  for (let k = 0; k < 8; k++) {
    const a0 = k / 8 * Math.PI * 2, a1 = (k + 1) / 8 * Math.PI * 2, am = (a0 + a1) / 2;
    b.poly([[x + r * Math.cos(a0), y0, z + r * Math.sin(a0)], [x + r * Math.cos(a1), y0, z + r * Math.sin(a1)], [x + r * Math.cos(a1), y1, z + r * Math.sin(a1)], [x + r * Math.cos(a0), y1, z + r * Math.sin(a0)]], undefined, {facing: [Math.cos(am), 0, Math.sin(am)], color});
  }
}
/** One flight of a footbridge stair: from `s0` along the landing's direction times `sgn`, centred `t` across it, `n` rises of `rise` down
 *  from `yTop` (the treads between; the last rise lands on the flight's foot). Treads, risers, two stringers and a balustrade each side:
 *  lattice (R-pt1-d north: dense iron posts) or modern (R-pt1-d Abbott: a glazed panel in a pale frame with a yellow handrail). */
function flight(b: Batch, l: PerthBridgeLanding, s0: number, sgn: number, t: number, yTop: number, n: number, rise: number, lattice: boolean): void {
  const S = PERTH_STATION.stair, d = l.dir, nrm: Pt = [-d[1], d[0]], rotY = Math.atan2(-d[1], d[0]);
  const at = (s: number, u: number): Pt => [l.start[0] + d[0] * s + nrm[0] * u, l.start[1] + d[1] * s + nrm[1] * u];
  const tread = P('tread'), side = lattice ? P('lattice') : P('frame'), rail = lattice ? P('lattice') : P('handrail'), w = S.width;
  for (let k = 1; k < n; k++) {
    const y = yTop - k * rise, c = at(s0 + sgn * (k - .5) * S.going, t), r = at(s0 + sgn * (k - 1) * S.going, t);
    b.box([c[0], y - .03, c[1]], [S.going, .06, w], {rotY, color: tread});
    b.box([r[0], y + rise / 2, r[1]], [.03, rise, w], {rotY, color: tread});
  }
  const L = (n - 1) * S.going, yBot = yTop - n * rise;
  for (const e of [-1, 1]) {
    const a0 = at(s0, t + e * (w / 2 + .05)), a1 = at(s0 + sgn * L, t + e * (w / 2 + .05));
    beam(b, [a0[0], yTop - .2, a0[1]], [a1[0], yBot + .05, a1[1]], .1, .4, side);
    beam(b, [a0[0], yTop + 1, a0[1]], [a1[0], yBot + 1, a1[1]], .06, .06, rail);
    if (lattice) for (let u = 0; u <= L + 1e-9; u += .6) { const p = at(s0 + sgn * u, t + e * (w / 2 + .05)), y = yTop + (yBot - yTop) * u / L; b.box([p[0], y + .5, p[1]], [.04, 1, .04], {color: side}); }
    else {
      beam(b, [a0[0], yTop + .6, a0[1]], [a1[0], yBot + .6, a1[1]], .02, .8, P('glassPanel'));
      beam(b, [a0[0], yTop + 1.1, a0[1]], [a1[0], yBot + 1.1, a1[1]], .07, .05, side);
      for (let u = 0; u <= L + 1e-9; u += 1.2) { const p = at(s0 + sgn * u, t + e * (w / 2 + .05)), y = yTop + (yBot - yTop) * u / L; b.box([p[0], y + .58, p[1]], [.05, 1.05, .05], {color: side}); }
    }
  }
}
/** The stair at a landing: a straight flight from the deck to the platform (the lattice bridge), or a dog-leg (the lift bridge: the first
 *  flight from the deck to a half landing on two round columns, the second back beside it to the platform). */
function stair(b: Batch, l: PerthBridgeLanding, deck: number, lattice: boolean): void {
  const S = PERTH_STATION.stair, n = Math.ceil((deck - WAVERLEY_LEVELS.platform) / S.maxRise), rise = (deck - WAVERLEY_LEVELS.platform) / n;
  if (l.side === undefined) { flight(b, l, 0, 1, 0, deck, n, rise, lattice); return; }
  const n1 = Math.ceil(n / 2), n2 = n - n1, L1 = (n1 - 1) * S.going, off = (S.width + S.gap) / 2, yMid = deck - n1 * rise;
  flight(b, l, 0, 1, l.side * off, deck, n1, rise, lattice);
  flight(b, l, L1, -1, -l.side * off, yMid, n2, rise, lattice);
  // The half landing and its two round columns at its outer corners.
  const d = l.dir, nrm: Pt = [-d[1], d[0]], at = (s: number, u: number): Pt => [l.start[0] + d[0] * s + nrm[0] * u, l.start[1] + d[1] * s + nrm[1] * u];
  const c = at(L1 + S.landing / 2, 0), W = 2 * S.width + S.gap;
  b.box([c[0], yMid - .15, c[1]], [S.landing, .3, W], {rotY: Math.atan2(-d[1], d[0]), color: P('frame')});
  b.box([c[0], yMid + .01, c[1]], [S.landing - .1, .02, W - .1], {rotY: Math.atan2(-d[1], d[0]), color: P('tread')});
  for (const u of [-1, 1]) { const p = at(L1 + S.landing - .3, u * (W / 2 - .3)); roundColumn(b, p[0], p[1], S.column, WAVERLEY_LEVELS.platform, yMid - .3, P('frame')); }
  // The landing's balustrade, round its three open sides.
  const e = at(L1 + S.landing - .02, 0);
  b.box([e[0], yMid + .6, e[1]], [.02, .8, W], {rotY: Math.atan2(-d[1], d[0]), color: P('glassPanel')});
  b.box([e[0], yMid + 1.1, e[1]], [.07, .05, W], {rotY: Math.atan2(-d[1], d[0]), color: P('frame')});
}
function bridgeBatch(b: Batch, br: PerthBridgePlan, roof: readonly Pt[]): void {
  const S = PERTH_STATION, half = S.deckHalf, lattice = br.kind === 'lattice', deckColor = lattice ? P('lattice') : P('frame');
  if (!br.landings.length) return;
  const x0 = br.along - half, x1 = br.along + half, zc = (br.z0 + br.z1) / 2, len = br.z1 - br.z0;
  // Deck: a 0.5 m slab (lattice), or (modern, R-pt1-d Abbott) a 0.3 m slab between two 0.7 m pale edge beams, so the span reads light.
  const depth = lattice ? .5 : .7;
  if (lattice) b.box([br.along, br.deck - depth / 2, zc], [2 * half, depth, len], {color: deckColor});
  else {
    b.box([br.along, br.deck - .15, zc], [2 * half - .3, .3, len], {color: P('modern')});
    for (const x of [x0 + .12, x1 - .12]) b.box([x, br.deck - depth / 2 + .1, zc], [.24, depth + .2, len], {color: deckColor});
  }
  b.box([br.along, br.deck + .01, zc], [2 * half - .3, .02, len - .3], {color: P('tread')});
  if (lattice) {
    // Lattice-sided parapets, 1.7 m (R-pt1-d north: crossed flats in square panels between top and bottom chords).
    for (const x of [x0 + .15, x1 - .15]) latticeGirder(b, [x, br.z0], [x, br.z1], br.deck + 1.7, 1.7, P('lattice'));
    // The covered span past the roof (R-pt1-d "from platform 1": a pitched timber roof on the lattice sides), in 1 m pieces at least 1 m
    // outside the overall roof.
    const eaves = br.deck + 2.2, ridge = br.deck + 3.0;
    for (let z = br.z0; z < br.z1 - 1e-9; z += 1) {
      const za = z, zb = Math.min(br.z1, z + 1), mid: Pt = [br.along, (za + zb) / 2];
      if (inRing(mid, roof) || ringDistance(mid, roof) < 1.2) continue;
      for (const s of [-1, 1]) b.poly([[br.along + s * (half + .3), eaves, za], [br.along + s * (half + .3), eaves, zb], [br.along, ridge, zb], [br.along, ridge, za]], undefined, {facing: [s * .7, .7, 0], color: P('iron')});
      for (const s of [-1, 1]) b.poly([[br.along + s * (half + .3), eaves, za], [br.along + s * (half + .3), eaves, zb], [br.along, ridge, zb], [br.along, ridge, za]], undefined, {facing: [-s * .7, -.7, 0], color: P('iron')});
      for (const x of [x0 + .15, x1 - .15]) b.box([x, (br.deck + 1.7 + eaves) / 2, (za + zb) / 2], [.1, eaves - br.deck - 1.7, .1], {color: P('lattice')});
    }
  } else {
    // Glazed parapets 1.1 m in a pale frame (posts every 1.5 m, a top rail) with a yellow handrail (R-pt1-d Abbott).
    for (const x of [x0 + .1, x1 - .1]) {
      b.box([x, br.deck + .6, zc], [.02, .8, len], {color: P('glassPanel')});
      b.box([x, br.deck + 1.12, zc], [.08, .06, len], {color: P('frame')});
      b.box([x, br.deck + .95, zc], [.06, .05, len], {color: P('handrail')});
      for (let z = br.z0; z <= br.z1 + 1e-9; z += 1.5) b.box([x, br.deck + .58, Math.min(z, br.z1)], [.06, 1.1, .06], {color: P('frame')});
    }
  }
  // Posts under the deck: square iron (lattice), round pale columns (modern).
  for (const p of br.posts) {
    if (lattice) b.box([p[0], (WAVERLEY_LEVELS.platform + br.deck - depth) / 2, p[1]], [.3, br.deck - depth - WAVERLEY_LEVELS.platform, .3], {color: deckColor});
    else roundColumn(b, p[0], p[1], .2, WAVERLEY_LEVELS.platform, br.deck - depth, P('frame'));
  }
  for (const l of br.landings) {
    stair(b, l, br.deck, lattice);
    if (l.tower) {
      // The lift tower (R-pt1-d Abbott): a grey box from the platform to 3.6 m over the deck, clad in vertical panels (a proud seam between
      // each), a flat cap 0.15 m proud all round, a dark door on the face away from the deck.
      const T = S.tower, [xc, zc] = l.tower.c, rotY = Math.atan2(-l.tower.dir[1], l.tower.dir[0]), y0 = WAVERLEY_LEVELS.platform, y1 = br.deck + T.above;
      b.box([xc, (y0 + y1) / 2, zc], [T.size, y1 - y0, T.size], {rotY, color: P('modern'), skip: ['-y']});
      b.box([xc, y1 + .1, zc], [T.size + .3, .2, T.size + .3], {rotY, color: P('frame')});
      const u: Pt = l.tower.dir, v: Pt = [-u[1], u[0]], hs = T.size / 2 + .015;
      for (const [f, g] of [[u, v], [v, u]] as [Pt, Pt][]) for (const e of [-1, 1]) for (let k = -T.size / 2 + T.panel; k < T.size / 2 - .1; k += T.panel) {
        b.box([xc + f[0] * e * hs + g[0] * k, (y0 + y1) / 2, zc + f[1] * e * hs + g[1] * k], [.04, y1 - y0 - .3, .04], {color: P('seam')});
      }
      b.box([xc + l.tower.dir[0] * (T.size / 2 + .02), y0 + 1.1, zc + l.tower.dir[1] * (T.size / 2 + .02)], [.06, 2.2, 1.1], {rotY, color: P('screen')});
    }
  }
}

/** The island building: stone walls to the roof's gutter girders, plinth, string course and cornice, two storeys of openings in 4.5 m bays,
 *  a flat top under the glazing. R-pt1-a's elevation to platform 4, as drawn (sizes ASSUMED, scaled from that photograph against its doors):
 *  - ground floor: a door in a dressed surround in every third bay; elsewhere a bipartite window (a stone mullion and a transom);
 *  - first floor: tripartite and bipartite windows in turn, each light under a round arched head;
 *  - attic gables: where the roof over a bay leaves room (`roofOver`, m over rail at a scene point), every second bay carries a stone
 *    gable up into it, with a small arched light, its coping 0.25 m clear of the glazing.
 *  The stone's coursing is laid at half the texture's scale (0.6 x 0.3 m blocks: R-pt1-a's small-coursed ashlar). Scene frame. */
export function islandBuildingBatches(ring: readonly Pt[], roofOver?: (p: Pt) => number): {stone: Batch; windows: Batch; top: Batch} {
  const B = PERTH_STATION.building, stone = new Batch({colored: true}), windows = new Batch(), top = new Batch(), r = cleanRing(ring);
  const wall = P('stoneWall'), dressing = P('stoneDressing'), plinth = P('stonePlinth'), deck = WAVERLEY_LEVELS.platform, ground = WAVERLEY_LEVELS.ground, k2 = 2;
  const signed = area2(r);
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < .3) continue;
    const d: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], out: Pt = signed > 0 ? [d[1], -d[0]] : [-d[1], d[0]], facing: V3 = [out[0], 0, out[1]];
    const at = (s: number, off: number, y: number): V3 => [a[0] + d[0] * s + out[0] * off, y, a[1] + d[1] * s + out[1] * off], rotY = Math.atan2(-d[1], d[0]);
    stone.poly([at(0, 0, ground), at(len, 0, ground), at(len, 0, B.top), at(0, 0, B.top)], [[0, 0], [len * k2, 0], [len * k2, (B.top - ground) * k2], [0, (B.top - ground) * k2]], {facing, color: wall});
    const band = (y0: number, y1: number, depth: number, color: Rgb): void => { stone.box(at(len / 2, depth / 2 - .02, (y0 + y1) / 2), [Math.max(.05, len - .02), y1 - y0, depth + .04], {rotY, color}); };
    if (len < 2) continue;
    band(deck - .1, deck + B.plinth, .08, plinth);
    band(B.string - B.stringHeight / 2, B.string + B.stringHeight / 2, .12, dressing);
    band(B.top - B.cornice, B.top, .25, dressing);
    const n = Math.max(1, Math.round(len / B.bay)), w = len / n;
    if (w < B.groundWindow[0] + .8) continue;
    /** One opening `ow` wide from y0 to y1 centred at s: `lights` lights split by stone mullions, a transom at 0.7 of the height, round
     *  arched heads over each light (`arched`), and a dressed surround (jambs, sill, lintel or hood). */
    const opening = (s: number, ow: number, y0: number, y1: number, lights: number, transom: boolean, arched: boolean): void => {
      const lw = ow / lights, rr = lw / 2;
      for (let j = 0; j < lights; j++) {
        const c = s - ow / 2 + (j + .5) * lw, l0 = c - rr, l1 = c + rr, yh = arched ? y1 - rr : y1;
        windows.poly([at(l0, B.lift, y0), at(l1, B.lift, y0), at(l1, B.lift, yh), at(l0, B.lift, yh)], [[0, 0], [lw, 0], [lw, yh - y0], [0, yh - y0]], {facing});
        if (arched) {
          const arc = Array.from({length: 7}, (_, q): V3 => { const t = q / 6 * Math.PI; return at(c + rr * Math.cos(t), B.lift, yh + rr * Math.sin(t)); });
          windows.poly([at(l1, B.lift, yh), ...arc.slice(1, 6), at(l0, B.lift, yh)], undefined, {facing});
          for (let q = 0; q < 6; q++) { const t0 = q / 6 * Math.PI, t1 = (q + 1) / 6 * Math.PI, R = rr + .08; beam(stone, at(c + R * Math.cos(t0), .06, yh + R * Math.sin(t0)), at(c + R * Math.cos(t1), .06, yh + R * Math.sin(t1)), .12, .16, dressing); }
        }
      }
      for (let j = 1; j < lights; j++) stone.box(at(s - ow / 2 + j * lw, .04, (y0 + y1) / 2), [.14, y1 - y0, .1], {rotY, color: dressing});
      if (transom) stone.box(at(s, .04, y0 + (y1 - y0) * .7), [ow, .12, .1], {rotY, color: dressing});
      for (const e of [-1, 1]) stone.box(at(s + e * (ow / 2 + .08), .05, (y0 + y1) / 2), [.16, y1 - y0 + .1, .12], {rotY, color: dressing});
      stone.box(at(s, .06, y0 - .08), [ow + .4, .16, .14], {rotY, color: dressing});
      if (!arched) stone.box(at(s, .06, y1 + .14), [ow + .4, .28, .14], {rotY, color: dressing});
    };
    for (let k = 0; k < n; k++) {
      const s = (k + .5) * w, door = k % B.doorEvery === 1, [gw, gh, gs] = B.groundWindow, [dw, dh] = B.door, [uw, uh, us] = B.upperWindow;
      if (door) {
        // A panelled timber door in a dressed surround with a fanlight over it.
        stone.box(at(s, .02, deck + dh / 2), [dw, dh, .06], {rotY, color: P('door')});
        windows.poly([at(s - dw / 2, B.lift, deck + dh + .1), at(s + dw / 2, B.lift, deck + dh + .1), at(s + dw / 2, B.lift, deck + dh + .6), at(s - dw / 2, B.lift, deck + dh + .6)], [[0, 0], [dw, 0], [dw, .5], [0, .5]], {facing});
        for (const e of [-1, 1]) stone.box(at(s + e * (dw / 2 + .12), .08, deck + (dh + .7) / 2), [.24, dh + .7, .16], {rotY, color: dressing});
        stone.box(at(s, .1, deck + dh + .8), [dw + .7, .3, .2], {rotY, color: dressing});
      } else opening(s, gw + .4, deck + gs, deck + gs + gh, 2, true, false);
      opening(s, k % 2 ? uw + .4 : uw + 1.2, us, us + uh, k % 2 ? 2 : 3, false, true);
      // The attic gable over every second bay, where the roof leaves it room.
      if (!roofOver || k % 2) continue;
      const mid = at(s, 0, 0), head = roofOver([mid[0], mid[2]]) - .25 - B.top;
      if (head < 1.2) continue;
      const gh2 = Math.min(2.2, head), hw = 1.7;
      stone.poly([at(s - hw, 0, B.top), at(s + hw, 0, B.top), at(s, 0, B.top + gh2)], [[0, 0], [2 * hw * k2, 0], [hw * k2, gh2 * k2]], {facing, color: wall});
      stone.poly([at(s - hw, -.3, B.top), at(s + hw, -.3, B.top), at(s, -.3, B.top + gh2)], undefined, {facing: [-facing[0], 0, -facing[2]], color: wall});
      for (const e of [-1, 1]) beam(stone, at(s + e * (hw + .1), .05, B.top - .02), at(s, .05, B.top + gh2 + .1), .2, .14, dressing);
      const lw2 = .7, y0 = B.top + .2, y1 = Math.min(B.top + gh2 - .5, y0 + 1.1);
      if (y1 - y0 > .5) {
        windows.poly([at(s - lw2 / 2, B.lift, y0), at(s + lw2 / 2, B.lift, y0), at(s + lw2 / 2, B.lift, y1 - lw2 / 2), at(s - lw2 / 2, B.lift, y1 - lw2 / 2)], [[0, 0], [lw2, 0], [lw2, y1 - y0], [0, y1 - y0]], {facing});
        windows.poly(Array.from({length: 7}, (_, q): V3 => { const t = q / 6 * Math.PI; return at(s + lw2 / 2 * Math.cos(t), B.lift, y1 - lw2 / 2 + lw2 / 2 * Math.sin(t)); }), undefined, {facing});
      }
    }
  }
  const shape = THREE.ShapeUtils.triangulateShape(r.map(p => new THREE.Vector2(p[0], p[1])), []);
  for (const t of shape) top.tri(...t.map(i => [r[i][0], B.top, r[i][1]] as V3) as [V3, V3, V3], undefined, [0, 1, 0]);
  return {stone, windows, top};
}
/** The roof's glazing height over rail at a scene point (the main roof's ridge-and-furrow, or the bay roof's where that covers it). */
export function perthRoofOver(plan: PerthStationPlan): (p: Pt) => number {
  return p => { const q = toLocal(p); return plan.local.bay.length >= 3 && inRing(q, plan.local.bay) ? bayRoofHeight(q[1]) : roofHeight(q[0]); };
}

/** Tite's block over its walls (islandBuildingBatches): a hipped slate roof from the walls' top, and the octagonal tower in stone with a
 *  slated spire. Scene frame. */
export function titeRoofBatches(ring: readonly Pt[], tower: Pt): {stone: Batch; slate: Batch} {
  const T = PERTH_TITE, eaves = PERTH_STATION.building.top, stone = new Batch({colored: true}), slate = new Batch();
  const [w0, w1, e1, e0] = ring, mid = (p: Pt, q: Pt): Pt => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], ms = mid(w0, e0), mn = mid(w1, e1);
  const l = Math.hypot(mn[0] - ms[0], mn[1] - ms[1]), u: Pt = [(mn[0] - ms[0]) / l, (mn[1] - ms[1]) / l], hw = T.width / 2;
  const r0: Pt = [ms[0] + u[0] * hw, ms[1] + u[1] * hw], r1: Pt = [mn[0] - u[0] * hw, mn[1] - u[1] * hw], y = (p: Pt, h: number): V3 => [p[0], h, p[1]], top = eaves + T.rise;
  for (const face of [[w0, w1, r1, r0], [e1, e0, r0, r1], [e0, w0, r0], [w1, e1, r1]] as Pt[][]) slate.poly(face.map((p, i) => y(p, i >= 2 ? top : eaves)), undefined, {facing: [0, 1, 0]});
  const wall = P('stoneWall'), dressing = P('stoneDressing'), n = 8, R = T.towerRadius, pt = (k: number, r: number): Pt => { const a = (k + .5) / n * Math.PI * 2; return [tower[0] + r * Math.cos(a), tower[1] + r * Math.sin(a)]; };
  for (let k = 0; k < n; k++) {
    const a = pt(k, R), b = pt(k + 1, R), m = (k + 1) / n * Math.PI * 2, facing: V3 = [Math.cos(m), 0, Math.sin(m)];
    stone.poly([y(a, WAVERLEY_LEVELS.ground), y(b, WAVERLEY_LEVELS.ground), y(b, T.towerTop), y(a, T.towerTop)], undefined, {facing, color: wall});
    // A cornice band at the eaves and at the top stage, and a tall lancet in each face of the belfry stage (R-pt1-b).
    for (const [h0, h1] of [[eaves, eaves + .3], [T.towerTop - .4, T.towerTop]]) { const a2 = pt(k, R + .15), b2 = pt(k + 1, R + .15); stone.poly([y(a2, h0), y(b2, h0), y(b2, h1), y(a2, h1)], undefined, {facing, color: dressing}); }
    const c = mid(a, b), d: Pt = [(b[0] - a[0]) * .18, (b[1] - a[1]) * .18], o: Pt = [Math.cos(m) * .03, Math.sin(m) * .03], h0 = T.towerTop - 4, h1 = T.towerTop - 1.2;
    stone.poly([[c[0] - d[0] + o[0], h0, c[1] - d[1] + o[1]], [c[0] + d[0] + o[0], h0, c[1] + d[1] + o[1]], [c[0] + d[0] + o[0], h1, c[1] + d[1] + o[1]], [c[0] - d[0] + o[0], h1, c[1] - d[1] + o[1]]], undefined, {facing, color: P('clockCase')});
    slate.poly([y(pt(k, R + .15), T.towerTop), y(pt(k + 1, R + .15), T.towerTop), [tower[0], T.spireTop, tower[1]]], undefined, {facing: [Math.cos(m), .4, Math.sin(m)]});
  }
  return {stone, slate};
}

/** An arched rib (R-pt1-a's curved braces, R-pt1-c's arched ribs and spandrels) from a to c, springing at y0 at both ends and rising as a
 *  half ellipse to `apex`, with a vertical bar every `strut` m from the rib up to top(s) (s: metres from a) wherever that gap is 0.1 m or
 *  more. Only the pieces `keep` accepts are drawn. */
function archRib(b: Batch, a: Pt, c: Pt, y0: number, apex: number, top: (s: number) => number, color: Rgb, opts: {strut?: number; size?: number; keep?: (p: Pt, y: number) => boolean} = {}): void {
  const L = Math.hypot(c[0] - a[0], c[1] - a[1]), strut = opts.strut ?? 1, size = opts.size ?? .1, keep = opts.keep ?? (() => true);
  if (L < 1) return;
  const at = (s: number): Pt => [a[0] + (c[0] - a[0]) * s / L, a[1] + (c[1] - a[1]) * s / L];
  const y = (s: number): number => y0 + (apex - y0) * Math.sqrt(Math.max(0, 1 - (2 * s / L - 1) ** 2));
  // Steps even in angle round the ellipse, so the steep springings get as many pieces as the crown.
  const n = 12, sAt = (k: number): number => L / 2 * (1 - Math.cos(Math.PI * k / n));
  for (let k = 0; k < n; k++) {
    const s0 = sAt(k), s1 = sAt(k + 1), m = at((s0 + s1) / 2); if (!keep(m, y((s0 + s1) / 2))) continue;
    const p0 = at(s0), p1 = at(s1);
    beam(b, [p0[0], y(s0), p0[1]], [p1[0], y(s1), p1[1]], size, size, color);
  }
  for (let s = strut; s < L - strut / 2; s += strut) {
    const p = at(s), y1 = top(s), y2 = y(s);
    if (y1 - y2 > .1 && keep(p, y2)) b.box([p[0], (y1 + y2) / 2, p[1]], [.05, y1 - y2, .05], {color});
  }
}
/** The ironwork that makes the main roof Perth's rather than Waverley's (R-pt1-a, R-pt1-d): a pitched truss on every second rafter pair,
 *  its principals the rafters and an arched brace under them from gutter girder to gutter girder, and an arched spandrel under every
 *  column-to-column girder. ASSUMED proportions: springing at the girders' undersides, the crown 1.1 m under the ridge. */
function archedIronwork(b: Batch, plan: PerthStationPlan): void {
  const W = WAVERLEY_STRUCTURE, iron = P('iron'), under = W.gutterGirderTop - W.gutterGirderDepth, ridge = WAVERLEY_ROOF_PROFILE.gutter + WAVERLEY_ROOF_PROFILE.rise;
  for (const [x0, x1, z] of plan.structure.purlins) {
    if (Math.round(z / W.purlinSpacing) % 2) continue;
    const a: Pt = [Math.min(x0, x1) + .2, z], c: Pt = [Math.max(x0, x1) - .2, z];
    archRib(b, a, c, under, ridge - 1.1, s => roofHeight(a[0] + s) - .4, iron, {strut: 1});
  }
  const girder = W.platformGirderTop - W.platformGirderDepth;
  for (const [a, c] of plan.structure.spans) archRib(b, a, c, girder - 1.3, girder - .02, () => girder, iron, {strut: .5, size: .08});
}
/** The bay roof (PERTH_BAY_ROOF): its glazing, laid out in a frame turned a quarter so Waverley's ridge-and-furrow builder runs its ridges
 *  along the tracks; rafters, arched ribs, the arched glazed screen at its south end, and the screens closing it to the north, the west and
 *  over the island building's wall. Track frame. */
function bayRoof(glass: Batch, strips: Batch, iron: Batch, plan: PerthStationPlan): void {
  const BR = PERTH_BAY_ROOF, ring = plan.local.bay, paint = P('iron'), fascia = P('fascia'), stone = P('stoneWall');
  const turn = (b: Batch): Batch => {
    // (u, v) = (z', -x') back to (x', z'): a quarter turn, so windings hold.
    for (const a of [b.positions, b.normals]) for (let i = 0; i < a.length; i += 3) { const u = a[i], v = a[i + 2]; a[i] = -v; a[i + 2] = u; }
    return b;
  };
  // The glazing kept 0.12 m inside the bay's outline, whose south edge crosses the closed bay notch (PERTH_BAY_NOTCH) on a chord.
  const turned = offsetRing(ring, -.12).map(([x, z]): Pt => [z, -x]);
  BR.spans.forEach((sp, i) => {
    const part = clipHalf(clipHalf(turned, 0, sp.z0, true), 0, i === BR.spans.length - 1 ? Infinity : sp.z1, false);
    if (part.length < 3) return;
    const r = ridgeRoofBatches(part, [], {gutter: BR.gutter, rise: sp.rise, pitch: sp.z1 - sp.z0, phase: sp.z0}, BR.bands);
    glass.append(turn(r.glass)); strips.append(turn(r.solid));
  });
  const xs = ring.map(p => p[0]), north = Math.min(...xs), south = Math.max(...xs), runsAt = (x: number) => section([ring], x);
  const zRunsAt = (z: number) => section([ring.map(([x, q]): Pt => [q, x])], z);
  const breaks = BR.spans.flatMap(sp => [sp.z0, (sp.z0 + sp.z1) / 2, sp.z1]);
  // Rafters across the slopes every 3 m, 0.2 m under the glazing.
  for (let x = south - 1.5; x > north + .5; x -= 3) for (const [z0, z1] of runsAt(x)) {
    const zs = [z0 + .1, ...breaks.filter(z => z > z0 + .1 && z < z1 - .1), z1 - .1];
    for (let k = 1; k < zs.length; k++) beam(iron, [x, bayRoofHeight(zs[k - 1]) - .2, zs[k - 1]], [x, bayRoofHeight(zs[k]) - .2, zs[k]], .1, .2, paint);
  }
  // Arched ribs across each span, springing from the island wall and the column-line girder (none inside the island building).
  const island = plan.local.island, keep = (p: Pt, y: number): boolean => inRing(p, ring) && (y > PERTH_STATION.building.top || !inRing(p, island));
  for (let x = south - 2; x > north + 1; x -= BR.ribEvery) for (const sp of BR.spans) {
    archRib(iron, [x, sp.z0 + .15], [x, sp.z1 - .15], BR.springing, BR.gutter + sp.rise - .9, s => bayRoofHeight(sp.z0 + .15 + s) - .3, paint, {strut: .9, keep});
  }
  // The south end: an arched screen across each span (R-pt1-c), glazed from the springing up to the roof's profile on the outline's edge.
  const edgeX = (z: number): number | undefined => { const r = zRunsAt(z); return r.length ? Math.max(...r.map(q => q[1])) - .15 : undefined; };
  for (const sp of BR.spans) {
    const z0 = sp.z0 + .05, runs = section([ring], south - .3), z1 = Math.min(sp.z1 - .05, ...runs.map(q => q[1] - .05));
    if (z1 - z0 < 2) continue;
    const n = Math.ceil((z1 - z0) / .5), zs = Array.from({length: n + 1}, (_, k) => z0 + (z1 - z0) * k / n), ex = zs.map(edgeX);
    if (ex.some(x => x === undefined)) continue;
    for (let k = 1; k <= n; k++) {
      const xa = ex[k - 1]!, xb = ex[k]!, za = zs[k - 1], zb = zs[k];
      glass.poly([[xa, BR.springing, za], [xb, BR.springing, zb], [xb, bayRoofHeight(zb), zb], [xa, bayRoofHeight(za), za]], [[za, BR.springing], [zb, BR.springing], [zb, bayRoofHeight(zb)], [za, bayRoofHeight(za)]], {facing: [1, 0, 0]});
    }
    const xm = (ex[0]! + ex[n]!) / 2 - .08;
    archRib(iron, [xm, z0], [xm, z1], BR.springing, BR.gutter + sp.rise - .5, s => bayRoofHeight(z0 + s) - .05, paint, {strut: .8, size: .14});
    beam(iron, [xm, BR.springing - .25, z0], [xm, BR.springing - .25, z1], .3, .5, paint);
  }
  // The north end over the main roof, and the west edge: opaque screens from the walls' top up to the bay roof's profile.
  const top = PERTH_STATION.building.top, screen = (a: Pt, c: Pt, facing: V3, color: Rgb, b: Batch): void => {
    const ya = bayRoofHeight(a[1]), yc = bayRoofHeight(c[1]); if (Math.max(ya, yc) <= top + .02) return;
    b.poly([[a[0], top, a[1]], [c[0], top, c[1]], [c[0], Math.max(top, yc), c[1]], [a[0], Math.max(top, ya), a[1]]], undefined, {facing, color});
  };
  const nr = section([ring], north + .05);
  for (const [z0, z1] of nr) for (let z = z0; z < z1 - 1e-9; z += 1) screen([north + .05, z], [north + .05, Math.min(z1, z + 1)], [-1, 0, 0], fascia, iron);
  for (let x = north; x < south - 1e-9; x += 1) {
    const xa = x, xb = Math.min(south, x + 1), ra = runsAt(xa + .01), rb = runsAt(xb - .01); if (!ra.length || !rb.length) continue;
    screen([xa, ra.at(-1)![1] - .05], [xb, rb.at(-1)![1] - .05], [0, 0, 1], fascia, iron);
  }
  // Over the island building's wall where the bay roof stands above it: the wall's stone carried up to the glazing.
  const sgn = area2(island) > 0 ? 1 : -1;
  for (let i = 0; i < island.length; i++) {
    const a = island[i], c = island[(i + 1) % island.length], len = Math.hypot(c[0] - a[0], c[1] - a[1]); if (len < .1) continue;
    const out: V3 = [sgn * (c[1] - a[1]) / len, 0, -sgn * (c[0] - a[0]) / len];
    for (let s = 0; s < len - 1e-9; s += 1) {
      const p = (t: number): Pt => [a[0] + (c[0] - a[0]) * t / len, a[1] + (c[1] - a[1]) * t / len], s1 = Math.min(len, s + 1), m = p((s + s1) / 2);
      if (inRing(m, ring)) screen(p(s), p(s1), out, stone, iron);
    }
  }
}

/** The platform furniture (PerthStationPlan.furniture), track frame. */
function furnitureBatch(b: Batch, plan: PerthStationPlan): void {
  const F = PERTH_STATION.furniture, deck = WAVERLEY_LEVELS.platform, slat = P('benchSlat'), frame = P('benchFrame');
  for (const {at, out} of plan.furniture.benches) {
    // R-pt1-a's slatted timber benches on dark iron ends: three seat slats, two back slats, an end frame each side.
    const along: Pt = [-out[1], out[0]], rotY = Math.atan2(-along[1], along[0]), [L, h] = F.bench, p = (o: number, y: number, u = 0): V3 => [at[0] + out[0] * o + along[0] * u, deck + y, at[1] + out[1] * o + along[1] * u];
    for (const o of [-.15, 0, .15]) b.box(p(o, h), [L, .04, .11], {rotY, color: slat});
    for (const y of [.62, .8]) b.box(p(-.24, y), [L, .1, .04], {rotY, color: slat});
    for (const u of [-L / 2 + .1, L / 2 - .1]) { b.box(p(0, h / 2, u), [.06, h, .45], {rotY, color: frame}); b.box(p(-.24, .65, u), [.06, .45, .05], {rotY, color: frame}); }
  }
  for (const at of plan.furniture.bins) { b.box([at[0], deck + .45, at[1]], [.5, .9, .5], {color: P('bin')}); b.box([at[0], deck + .93, at[1]], [.56, .06, .56], {color: P('benchFrame')}); }
  if (plan.furniture.kiosk) {
    // The kiosk (R-pt1-a): a timber frame against the wall, panelled to 1.0 m, glazed above to its eaves, a lean-to roof down from the wall.
    const {at, out} = plan.furniture.kiosk, along: Pt = [-out[1], out[0]], [L, D, H] = F.kiosk, timber = P('timber');
    const p = (o: number, y: number, u: number): V3 => [at[0] + out[0] * o + along[0] * u, deck + y, at[1] + out[1] * o + along[1] * u], rotY = Math.atan2(-along[1], along[0]);
    b.box(p(D / 2, .5, 0), [L, 1, D], {rotY, color: timber});
    for (let u = -L / 2; u <= L / 2 + 1e-9; u += L / 4) b.box(p(D, (1 + H) / 2, u), [.1, H - 1, .1], {rotY, color: timber});
    for (const u of [-L / 2, L / 2]) for (let o = D / 2; o < D; o += D / 2) b.box(p(o, (1 + H) / 2, u), [.1, H - 1, .1], {rotY, color: timber});
    b.box(p(D - .02, (1 + H) / 2, 0), [L - .1, H - 1.05, .03], {rotY, color: P('glassPanel')});
    for (const u of [-L / 2 + .02, L / 2 - .02]) b.box(p(D / 2, (1 + H) / 2, u), [.03, H - 1.05, D - .1], {rotY, color: P('glassPanel')});
    b.box(p(D, H - .25, 0), [L + .2, .4, .12], {rotY, color: timber});
    b.poly([p(-.05, H + .9, -L / 2 - .15), p(-.05, H + .9, L / 2 + .15), p(D + .3, H, L / 2 + .15), p(D + .3, H, -L / 2 - .15)], undefined, {facing: [out[0] * .6, .8, out[1] * .6], color: P('officeRoof')});
    b.poly([p(-.05, H + .88, -L / 2 - .15), p(-.05, H + .88, L / 2 + .15), p(D + .3, H - .02, L / 2 + .15), p(D + .3, H - .02, -L / 2 - .15)], undefined, {facing: [-out[0] * .6, -.8, -out[1] * .6], color: timber});
  }
  const girder = WAVERLEY_STRUCTURE.platformGirderTop - WAVERLEY_STRUCTURE.platformGirderDepth;
  for (const {at, dir} of plan.furniture.boards) {
    // A white direction board with a blue head band, hung on two rods from the girder (R-pt1-a, R-pt1-c). Blank: no lettering.
    const [w, h, y0] = F.board, rotY = Math.atan2(-dir[1], dir[0]);
    b.box([at[0], deck + y0 + h / 2, at[1]], [w, h, .08], {rotY, color: P('signFace')});
    b.box([at[0], deck + y0 + h - .12, at[1]], [w + .02, .2, .1], {rotY, color: P('sign')});
    for (const e of [-1, 1]) { const q: Pt = [at[0] + dir[0] * e * (w / 2 - .2), at[1] + dir[1] * e * (w / 2 - .2)]; b.box([q[0], (deck + y0 + h + girder) / 2, q[1]], [.03, girder - deck - y0 - h, .03], {color: P('iron')}); }
  }
  for (const {at, dir} of plan.furniture.numbers) {
    // A platform number board on its column, square to the platform: a white square with a dark figure block (no numerals drawn).
    const [w, y0] = F.number, rotY = Math.atan2(-dir[1], dir[0]) + Math.PI / 2, c: Pt = [at[0] + dir[0] * .24, at[1] + dir[1] * .24];
    b.box([c[0], deck + y0, c[1]], [w, w, .06], {rotY, color: P('signFace')});
    b.box([c[0], deck + y0, c[1]], [w * .45, w * .6, .08], {rotY, color: P('screen')});
  }
}

export interface PerthStationBatches {
  /** Roof part (track frame turned to the scene's): the glazing (into the scene's shared roof glass), the solid strips, the ironwork. */
  glass: Batch; strips: Batch; ironwork: Batch;
  /** Platforms part: Waverley's platform strips, faces and fittings, the footbridges, clocks and canopy columns. */
  platform: Pick<WaverleyStructureBatches, 'edges' | 'faces' | 'tactile' | 'lip'>; fittings: Batch;
}
const recolor = (b: Batch, swap: [Rgb, Rgb][], override?: (x: number, z: number, c: Rgb) => Rgb | undefined): Batch => {
  const c = b.colors, p = b.positions;
  for (let i = 0; i < c.length; i += 3) {
    const cur: Rgb = [c[i], c[i + 1], c[i + 2]];
    let next = swap.find(([from]) => Math.abs(from[0] - cur[0]) + Math.abs(from[1] - cur[1]) + Math.abs(from[2] - cur[2]) < 1e-6)?.[1];
    const o = override?.(p[i], p[i + 2], next ?? cur); if (o) next = o;
    if (next) { c[i] = next[0]; c[i + 1] = next[1]; c[i + 2] = next[2]; }
  }
  return b;
};
/** Every batch of the station element, in the scene's frame. */
export function perthStationBatches(plan: PerthStationPlan): PerthStationBatches {
  const L = plan.local, S = PERTH_STATION;
  const glass = new Batch(), strips = new Batch(), fittings = new Batch({colored: true, uv: false});
  const shaped = L.main.length >= 3 ? ridgeRoofBatches(L.main, [], WAVERLEY_ROOF_PROFILE, S.bands, L.tite.length >= 3 ? [L.tite] : []) : undefined;
  if (shaped) { glass.append(shaped.glass); strips.append(shaped.solid); }
  const structure = waverleyStructureBatches(plan.structure);
  archedIronwork(structure.ironwork, plan);
  if (L.bay.length >= 3) bayRoof(glass, strips, structure.ironwork, plan);
  const swap = (Object.keys(WAVERLEY_PAINT) as (keyof typeof WAVERLEY_PAINT)[]).map((k): [Rgb, Rgb] => [rgb(WAVERLEY_PAINT[k]), P(k)]);
  // The gable screens along the island building (above its walls, up to the glazing) are drawn in the wall's stone, so the wall reads as
  // rising to the roof (R-pt1-a).
  const fascia = P('fascia'), stoneWall = P('stoneWall');
  recolor(structure.ironwork, swap, (x, z, c) => c[0] === fascia[0] && c[1] === fascia[1] && c[2] === fascia[2] && [L.island, L.tite].some(r => r.length >= 3 && ringDistance([x, z], r) < .1) ? stoneWall : undefined);
  // The coper and its nosing in buff (Abbott 6573357, R-pt1-b: a buff coping over red brick faces), not Waverley's pale grey.
  const coper: [Rgb, Rgb] = [rgb(WAVERLEY_EDGE_BANDS[0].color), P('coper')];
  recolor(structure.fittings, swap); recolor(structure.edges, [...swap, coper]); recolor(structure.lip, [...swap, coper]);
  // The Dundee canopies: flat glazing at canopy.top, cut round the stairs that pass through them, on a column row down each platform.
  if (L.canopy.length >= 3) {
    const cuts = plan.clear.map(([x0, x1, z0, z1]): Pt[] => [[x0 - .3, z0 - .3], [x1 + .3, z0 - .3], [x1 + .3, z1 + .3], [x0 - .3, z1 + .3]]);
    const flat = ridgeRoofBatches(L.canopy, [], {gutter: S.canopy.top, rise: 0, pitch: 12, phase: 0}, {gutter: 0, ridge: 0}, cuts);
    glass.append(flat.glass);
    for (const p of plan.canopyColumns) {
      fittings.box([p[0], (WAVERLEY_LEVELS.platform + S.canopy.top - S.canopy.valance) / 2, p[1]], [S.canopy.column, S.canopy.top - S.canopy.valance - WAVERLEY_LEVELS.platform, S.canopy.column], {color: P('column')});
      // A bracket each way across the platform, up to the canopy's underside (R-pt1-c's curved brackets, drawn straight).
      for (const s of [-1, 1]) beam(fittings, [p[0], S.canopy.top - 1.6, p[1]], [p[0], S.canopy.top - .05, p[1] + s * 1.4], .08, .1, P('iron'));
    }
  }
  for (const br of plan.bridges) bridgeBatch(fittings, br, L.roof);
  for (const c of plan.clocks) {
    // A double-sided bracket clock: the case's dials face along the wall (w), it hangs `out` from the wall on an iron bracket.
    const C = S.clock, y = WAVERLEY_LEVELS.platform + C.height, o = c.out, w: Pt = [-o[1], o[0]], p: V3 = [c.at[0] + o[0] * C.out, y, c.at[1] + o[1] * C.out];
    beam(fittings, [c.at[0], y + C.radius + .05, c.at[1]], [p[0], y + C.radius + .05, p[2]], .06, .08, P('iron'));
    fittings.box(p, [C.radius * 2, C.radius * 2, .14], {rotY: Math.atan2(-o[1], o[0]), color: P('clockCase')});
    for (const s of [-1, 1]) {
      const face = Array.from({length: 12}, (_, k): V3 => { const a = k / 12 * Math.PI * 2, r = C.radius * .9; return [p[0] + o[0] * Math.cos(a) * r + s * .08 * w[0], y + Math.sin(a) * r, p[2] + o[1] * Math.cos(a) * r + s * .08 * w[1]]; });
      fittings.poly(face, undefined, {facing: [s * w[0], 0, s * w[1]], color: P('clockFace')});
    }
  }
  furnitureBatch(fittings, plan);
  fittings.append(structure.fittings);
  for (const b of [glass, strips, structure.ironwork, fittings, structure.edges, structure.faces, structure.tactile, structure.lip]) batchToWorld(b);
  return {glass, strips, ironwork: structure.ironwork, platform: {edges: structure.edges, faces: structure.faces, tactile: structure.tactile, lip: structure.lip}, fittings};
}

/** The platform tops' split (track frame x'): north of it under the roof, in worn mid-grey concrete flags (R-pt1-a, R-pt1-c); south of
 *  it in the open, in red and buff surfacing (Abbott 6573357, R-pt1-b). The main roof's south end, ASSUMED one line across. */
export const PERTH_OPEN_SOUTH = 24;
/** A platform outline (scene frame) split at PERTH_OPEN_SOUTH: the covered part and the open part (scene frame; either may be empty). */
export function platformParts(path: readonly Pt[]): {covered: Pt[]; open: Pt[]} {
  const r = cleanRing(path).map(toLocal), part = (g: boolean): Pt[] => { const q = clipHalf(r, 0, PERTH_OPEN_SOUTH, g); return q.length >= 3 ? q.map(toWorld) : []; };
  return {covered: part(false), open: part(true)};
}

/** The roof's ridge height over rail (the glazing's top): the gutter plus the rise. */
export const PERTH_ROOF_RIDGE = Math.max(WAVERLEY_ROOF_PROFILE.gutter + WAVERLEY_ROOF_PROFILE.rise, ...PERTH_BAY_ROOF.spans.map(s => PERTH_BAY_ROOF.gutter + s.rise));
/** The gable screens' and gutter girders' figures this element shares with Waverley's plan, for the clearance tests. */
export const PERTH_ROOF_FIGURES = {gutterGirderBottom: WAVERLEY_STRUCTURE.gutterGirderTop - WAVERLEY_STRUCTURE.gutterGirderDepth, platformGirderBottom: WAVERLEY_STRUCTURE.platformGirderTop - WAVERLEY_STRUCTURE.platformGirderDepth} as const;
