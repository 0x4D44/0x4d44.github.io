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
import {footprintRuns, ridgeRoofBatches, WAVERLEY_ROOF_PROFILE} from './waverley-roof.ts';
import {latticeGirder, WAVERLEY_PAINT, WAVERLEY_STRUCTURE, waverleyStationPlan, waverleyStructureBatches} from './waverley-station-structure.ts';
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
  /** The roof's solid strips (R-pt1-a: dark bands between the glazed slopes, at the furrows and the ridges), half-widths in plan (m). */
  bands: {gutter: .9, ridge: .45},
  /** The island building: walls to the gutter girders' tops (7.9 m over rail), so the roof bears on them as R-pt1-a shows; the screen above
   *  them up to the glazing is drawn in the wall's stone. Plinth 0.6 m, string course at 4.6 m over rail, cornice 0.35 m (R-pt1-a). */
  building: {top: 7.9, plinth: .6, string: 4.6, stringHeight: .25, cornice: .35, bay: 4.5, groundWindow: [1.4, 2.6, .55] as const, door: [1.5, 2.9] as const, doorEvery: 3, upperWindow: [1.2, 2.1, 5.2] as const, lift: .03},
  /** The Dundee canopies: flat, 5.6 m over rail (above the 4.8 m train envelope the scene test holds), a 0.6 m valance; columns every 7 m. */
  canopy: {top: 5.6, valance: .6, columnEvery: 7, column: .2},
  /** The deck half-width of both footbridges (3 m wide: R-pt1-d's lattice bridge, about two people abreast). */
  deckHalf: 1.5,
  /** Stairs: 1.8 m wide, 0.28 m going, rises of at most 0.18 m (Building Standards range); kept 1.2 m clear of a platform's sides. */
  stair: {width: 1.8, going: .28, maxRise: .18, clear: 1.2},
  /** Lift towers (R-pt1-d Abbott, R-pt1-b): 3.2 m square, standing 3.6 m over the deck. */
  tower: {size: 3.2, above: 3.6},
  /** Bracket clocks on the island building (R-pt1-a2): a 0.8 m dial, 3.6 m up, 0.7 m out from the wall. */
  clock: {radius: .4, height: 3.6, out: .7},
} as const;

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
  stoneWall: 0xb7aa92, stoneDressing: 0xcdc2aa, stonePlinth: 0x6f665b, lattice: 0x6b3a2c, tread: 0xb4b1a8, modern: 0xa3a8ab, glassPanel: 0x9db4ba, handrail: 0xcdd06a, clockFace: 0xf3f1e8, clockCase: 0x2b2b2e,
} as const;
const P = (k: keyof typeof PERTH_PAINT): Rgb => rgb(PERTH_PAINT[k]);

// ---------------------------------------------------------------------------------------------------------------------------------------
// The plan: Waverley's, made in the track frame, then cleared where the footbridges stand.

export interface PerthBridgeLanding {refs: string[]; z: number; width: number; start: Pt; dir: Pt; length: number; stair: [number, number, number, number];
  /** The lift tower (lift bridges): its centre and its unit axis, pointing away from the deck. */
  tower?: {c: Pt; dir: Pt}}
export interface PerthBridgePlan {id: string; along: number; deck: number; kind: 'lattice' | 'lift'; z0: number; z1: number; landings: PerthBridgeLanding[]; posts: Pt[]}
export interface PerthStationPlan {
  roof: Pt[]; canopy: Pt[]; island: Pt[];
  /** Tite's 1848 block (scene frame): its footprint and its tower's centre. */
  tite: {ring: Pt[]; tower: Pt} | undefined;
  /** Track-frame copies of the above, and Waverley's plan in that frame. */
  local: {roof: Pt[]; canopy: Pt[]; island: Pt[]; tite: Pt[]; platforms: {ref: string; pts: Pt[]}[]};
  structure: WaverleyStationPlan;
  bridges: PerthBridgePlan[];
  /** Rectangles (track frame, x0 x1 z0 z1) kept clear of roof columns, girders and furniture: the decks, stairs and towers. */
  clear: [number, number, number, number][];
  canopyColumns: Pt[];
  clocks: {at: Pt; out: Pt}[];
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
  const S = PERTH_STATION, half = S.deckHalf, rise = b.deck - WAVERLEY_LEVELS.platform, steps = Math.ceil(rise / S.stair.maxRise), length = (steps - 1) * S.stair.going;
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
    // ASSUMED: that is platform 1 on the lift bridge (lead ruling 12:31): on its curve no place takes a tower and a stair 1.2 m clear of
    // both edges, though R-pt1-d Abbott shows three towers.
    const dirs: Pt[] = [[1, 0], [-1, 0], tangent, [-tangent[0], -tangent[1]]];
    for (const withTower of b.kind === 'lift' ? [true, false] : [false]) for (const dz of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
      const z = zc + dz;
      const found = dirs.find(d => {
        if (Math.abs(d[0]) < .3 && d[1] * (z - middle) < 0) return false;
        const start: Pt = [b.along + Math.sign(d[0]) * half, z];
        if (!stripInside(rings, start, d, length, S.stair.width, S.stair.clear)) return false;
        return !withTower || stripInside(rings, [b.along - Math.sign(d[0]) * half, z], [-d[0], -d[1]], S.tower.size, S.tower.size, .3);
      });
      if (!found) continue;
      const start: Pt = [b.along + Math.sign(found[0]) * half, z], td: Pt = [-found[0], -found[1]], t0: Pt = [b.along - Math.sign(found[0]) * half, z];
      const tower = withTower ? {c: [t0[0] + td[0] * S.tower.size / 2, t0[1] + td[1] * S.tower.size / 2] as Pt, dir: td} : undefined;
      landings.push({refs: [...b.landings[gi]], z, width: run[1] - run[0], start, dir: found, length, stair: footprintBox(start, found, length, S.stair.width), tower});
      return;
    }
  });
  const zs = landings.map(l => l.z), z0 = Math.min(...zs) - 1, z1 = Math.max(...zs) + 1;
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
  const local = {roof: clipNorth(roof.map(toLocal), PERTH_SHED_NORTH), canopy: canopy.map(toLocal), island: clipNorth(island.map(toLocal), PERTH_SHED_NORTH), tite: titeLocal?.ring ?? [], platforms};
  const localData = {platforms: data.platforms.map(p => ({...p, path: p.path.map(toLocal)})), rails: data.rails.map(r => ({...r, path: r.path.map(toLocal)}))};
  // The island building is a cut-out of the roof's plan (no column, girder or rafter over it), grown 3 cm so the gable screens Waverley's
  // plan draws along the outline skip the edges the building shares with it. The glazing itself runs on over the building (R-pt1-a).
  const cuts = [local.island, local.tite].filter(r => r.length >= 3).map(r => offsetRing(r, .03));
  const structure = waverleyStationPlan(localData, roof.length ? {outer: local.roof, holes: []} : undefined, cuts);
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
  // The scene-frame outlines, as drawn: cut at the shed line.
  const plan: PerthStationPlan = {roof: local.roof.map(toWorld), canopy, island: local.island.map(toWorld), tite: titeLocal && {ring: titeLocal.ring.map(toWorld), tower: toWorld(titeLocal.tower)}, local, structure, bridges, clear, canopyColumns, clocks};
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
/** A straight stair down from the deck at x' = from (dir +1: towards larger x') to the platform: treads, risers, two stringers and handrails. */
function stair(b: Batch, l: PerthBridgeLanding, deck: number, lattice: boolean): void {
  const S = PERTH_STATION.stair, top = deck, bottom = WAVERLEY_LEVELS.platform, n = Math.ceil((top - bottom) / S.maxRise), rise = (top - bottom) / n;
  const d = l.dir, nrm: Pt = [-d[1], d[0]], rotY = Math.atan2(-d[1], d[0]), at = (s: number, t: number): Pt => [l.start[0] + d[0] * s + nrm[0] * t, l.start[1] + d[1] * s + nrm[1] * t];
  const tread = P('tread'), side = lattice ? P('lattice') : P('modern'), rail = lattice ? P('lattice') : P('handrail'), w = S.width;
  for (let k = 1; k < n; k++) {
    const y = top - k * rise, c = at((k - .5) * S.going, 0), r = at((k - 1) * S.going, 0);
    b.box([c[0], y - .03, c[1]], [S.going, .06, w], {rotY, color: tread});
    b.box([r[0], y + rise / 2, r[1]], [.03, rise, w], {rotY, color: tread});
  }
  const L = (n - 1) * S.going;
  for (const s of [-1, 1]) {
    const a0 = at(0, s * (w / 2 + .05)), a1 = at(L, s * (w / 2 + .05));
    beam(b, [a0[0], top - .2, a0[1]], [a1[0], bottom + .05, a1[1]], .1, .4, side);
    // The balustrade: a top rail 1.0 m over the nosings, on posts every 0.6 m (lattice: R-pt1-d's ornate panels read as a dense post row);
    // the modern stair's glazed panel instead (R-pt1-d Abbott).
    beam(b, [a0[0], top + 1, a0[1]], [a1[0], bottom + 1, a1[1]], .06, .06, rail);
    if (lattice) for (let u = 0; u <= L + 1e-9; u += .6) { const p = at(u, s * (w / 2 + .05)), y = top + (bottom - top) * u / L; b.box([p[0], y + .5, p[1]], [.04, 1, .04], {color: side}); }
    else beam(b, [a0[0], top + .55, a0[1]], [a1[0], bottom + .55, a1[1]], .02, .9, P('glassPanel'));
  }
}
function bridgeBatch(b: Batch, br: PerthBridgePlan, roof: readonly Pt[]): void {
  const S = PERTH_STATION, half = S.deckHalf, lattice = br.kind === 'lattice', deckColor = lattice ? P('lattice') : P('modern');
  if (!br.landings.length) return;
  const x0 = br.along - half, x1 = br.along + half, zc = (br.z0 + br.z1) / 2, len = br.z1 - br.z0;
  // Deck: a 0.5 m slab (lattice) or a 1.0 m box girder (modern), the walking surface at `deck`.
  const depth = lattice ? .5 : 1.0;
  b.box([br.along, br.deck - depth / 2, zc], [2 * half, depth, len], {color: deckColor});
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
    // Glazed parapets 1.3 m on a grey kerb, with a yellow handrail (R-pt1-d Abbott).
    for (const x of [x0 + .1, x1 - .1]) {
      b.box([x, br.deck + .65, zc], [.03, 1.3, len], {color: P('glassPanel')});
      b.box([x, br.deck + 1.32, zc], [.1, .06, len], {color: P('modern')});
      b.box([x, br.deck + .9, zc], [.06, .05, len], {color: P('handrail')});
      for (let z = br.z0; z <= br.z1 + 1e-9; z += 1.5) b.box([x, br.deck + .65, Math.min(z, br.z1)], [.08, 1.3, .08], {color: P('modern')});
    }
  }
  for (const p of br.posts) b.box([p[0], (WAVERLEY_LEVELS.platform + br.deck - depth) / 2, p[1]], [.3, br.deck - depth - WAVERLEY_LEVELS.platform, .3], {color: deckColor});
  for (const l of br.landings) {
    stair(b, l, br.deck, lattice);
    if (l.tower) {
      // The lift tower: grey clad box from the platform to 3.6 m over the deck, a cap 0.15 m proud, a dark door on the platform side.
      const T = S.tower, [xc, zc] = l.tower.c, rotY = Math.atan2(-l.tower.dir[1], l.tower.dir[0]), y0 = WAVERLEY_LEVELS.platform, y1 = br.deck + T.above;
      b.box([xc, (y0 + y1) / 2, zc], [T.size, y1 - y0, T.size], {rotY, color: P('modern'), skip: ['-y']});
      b.box([xc, y1 + .1, zc], [T.size + .3, .2, T.size + .3], {rotY, color: P('glassPanel')});
      for (let y = y0 + 1.2; y < y1 - .5; y += 1.2) b.box([xc, y, zc], [T.size + .02, .03, T.size + .02], {rotY, color: P('handrail')});
      // The lift door, on the face away from the deck.
      b.box([xc + l.tower.dir[0] * (T.size / 2 + .02), y0 + 1.1, zc + l.tower.dir[1] * (T.size / 2 + .02)], [.06, 2.2, 1.1], {rotY, color: P('screen')});
    }
  }
}

/** The island building: stone walls to the roof's gutter girders, plinth, string course and cornice, two storeys of windows in 4.5 m bays
 *  (a door in every third ground-floor bay), a flat top under the glazing. Scene frame (no turn). */
export function islandBuildingBatches(ring: readonly Pt[]): {stone: Batch; windows: Batch; top: Batch} {
  const B = PERTH_STATION.building, stone = new Batch({colored: true}), windows = new Batch(), top = new Batch(), r = cleanRing(ring);
  const wall = P('stoneWall'), dressing = P('stoneDressing'), plinth = P('stonePlinth'), deck = WAVERLEY_LEVELS.platform, ground = WAVERLEY_LEVELS.ground;
  const signed = area2(r);
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < .3) continue;
    const d: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], out: Pt = signed > 0 ? [d[1], -d[0]] : [-d[1], d[0]], facing: V3 = [out[0], 0, out[1]];
    const at = (s: number, off: number, y: number): V3 => [a[0] + d[0] * s + out[0] * off, y, a[1] + d[1] * s + out[1] * off], rotY = Math.atan2(-d[1], d[0]);
    stone.poly([at(0, 0, ground), at(len, 0, ground), at(len, 0, B.top), at(0, 0, B.top)], [[0, 0], [len, 0], [len, B.top - ground], [0, B.top - ground]], {facing, color: wall});
    const band = (y0: number, y1: number, depth: number, color: Rgb): void => { stone.box(at(len / 2, depth / 2 - .02, (y0 + y1) / 2), [Math.max(.05, len - .02), y1 - y0, depth + .04], {rotY, color}); };
    if (len < 2) continue;
    band(deck - .1, deck + B.plinth, .08, plinth);
    band(B.string - B.stringHeight / 2, B.string + B.stringHeight / 2, .12, dressing);
    band(B.top - B.cornice, B.top, .25, dressing);
    const n = Math.max(1, Math.round(len / B.bay)), w = len / n;
    if (w < B.groundWindow[0] + .8) continue;
    for (let k = 0; k < n; k++) {
      const s = (k + .5) * w, door = k % B.doorEvery === 1;
      const [gw, gh, gs] = B.groundWindow, [dw, dh] = B.door, [uw, uh, us] = B.upperWindow;
      const openings: [number, number, number][] = [door ? [dw, deck, deck + dh] : [gw, deck + gs, deck + gs + gh], [uw, us, us + uh]];
      for (const [ow, y0, y1] of openings) {
        const s0 = s - ow / 2, s1 = s + ow / 2;
        windows.poly([at(s0, B.lift, y0), at(s1, B.lift, y0), at(s1, B.lift, y1), at(s0, B.lift, y1)], [[0, 0], [ow, 0], [ow, y1 - y0], [0, y1 - y0]], {facing});
        // Dressed surrounds: a sill and a lintel band in the paler stone (R-pt1-a).
        stone.box(at(s, .06, y0 - .08), [ow + .3, .16, .12], {rotY, color: dressing});
        stone.box(at(s, .06, y1 + .12), [ow + .3, .24, .12], {rotY, color: dressing});
      }
    }
  }
  const shape = THREE.ShapeUtils.triangulateShape(r.map(p => new THREE.Vector2(p[0], p[1])), []);
  for (const t of shape) top.tri(...t.map(i => [r[i][0], B.top, r[i][1]] as V3) as [V3, V3, V3], undefined, [0, 1, 0]);
  return {stone, windows, top};
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
  const shaped = L.roof.length >= 3 ? ridgeRoofBatches(L.roof, [], WAVERLEY_ROOF_PROFILE, S.bands, L.tite.length >= 3 ? [L.tite] : []) : undefined;
  if (shaped) { glass.append(shaped.glass); strips.append(shaped.solid); }
  const structure = waverleyStructureBatches(plan.structure);
  const swap = (Object.keys(WAVERLEY_PAINT) as (keyof typeof WAVERLEY_PAINT)[]).map((k): [Rgb, Rgb] => [rgb(WAVERLEY_PAINT[k]), P(k)]);
  // The gable screens along the island building (above its walls, up to the glazing) are drawn in the wall's stone, so the wall reads as
  // rising to the roof (R-pt1-a).
  const fascia = P('fascia'), stoneWall = P('stoneWall');
  recolor(structure.ironwork, swap, (x, z, c) => c[0] === fascia[0] && c[1] === fascia[1] && c[2] === fascia[2] && [L.island, L.tite].some(r => r.length >= 3 && ringDistance([x, z], r) < .1) ? stoneWall : undefined);
  recolor(structure.fittings, swap); recolor(structure.edges, swap); recolor(structure.lip, swap);
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
  fittings.append(structure.fittings);
  for (const b of [glass, strips, structure.ironwork, fittings, structure.edges, structure.faces, structure.tactile, structure.lip]) batchToWorld(b);
  return {glass, strips, ironwork: structure.ironwork, platform: {edges: structure.edges, faces: structure.faces, tactile: structure.tactile, lip: structure.lip}, fittings};
}

/** The roof's ridge height over rail (the glazing's top): the gutter plus the rise. */
export const PERTH_ROOF_RIDGE = WAVERLEY_ROOF_PROFILE.gutter + WAVERLEY_ROOF_PROFILE.rise;
/** The gable screens' and gutter girders' figures this element shares with Waverley's plan, for the clearance tests. */
export const PERTH_ROOF_FIGURES = {gutterGirderBottom: WAVERLEY_STRUCTURE.gutterGirderTop - WAVERLEY_STRUCTURE.gutterGirderDepth, platformGirderBottom: WAVERLEY_STRUCTURE.platformGirderTop - WAVERLEY_STRUCTURE.platformGirderDepth} as const;
