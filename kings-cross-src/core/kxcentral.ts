// The King's Cross Central landmarks as numbers: Coal Drops Yard and its kissing roofs, the Granary and its
// transit sheds, the gasholders, the Francis Crick Institute, the British Library, the German Gymnasium and the
// Platform 37 "landscraper". Which OSM outline is which building, how tall each part stands (with the source of
// the figure), how a roof is shaped, how a wall divides into bays. Pure functions, no three.js, so the rules are
// testable without a browser; web/src/kxcentral.ts only turns these numbers into meshes.
//
// Frame: x east, z south, metres (core/geo.ts). Heights are metres above the model's one ground level.
//
// References (all read 2026-11-08). Each is repeated where its figure is used. A figure marked ASSUMED has no source.
//   [OSM]     the outlines in web/src/data/kx-track.json (OpenStreetMap contributors, ODbL), plus ways fetched from
//             Overpass on 2026-11-08 for what that extract lacks (the gasholders, the Crick's building:parts).
//   [CM]      Construction Management, "BAM raises roof of Heatherwick's King's Cross wonder",
//             https://constructionmanagement.co.uk/bam-raises-roof-heatherwicks-kings-cross-wonder/ : the roofs kiss at
//             25 m; the two Victorian buildings stand 150 m (east) and 120 m (west) long, the new roofs are about 75 m
//             (east) and 65 m (west) long; the original buildings had two storeys and Heatherwick added one.
//   [HE-GRA]  Historic England list entry 1379215, The Granary (Grade II*), as mirrored at britishlistedbuildings.co.uk/
//             101379215-the-granary-st-pancras-and-somers-town-ward : Lewis Cubitt 1851-2; multi-coloured stock brick;
//             double-hipped Welsh slate roof; six storeys; a symmetrical south front of nine bays in which four slightly
//             projecting hoist bays (full-height segmental recesses) alternate with segmental-arched casement windows;
//             clear column heights 2.4 m (4.1 m on the ground floor); flanked by the transit sheds.
//   [HE-GYM]  Historic England list entry 1113243, German Gymnasium, 26 Pancras Road, as mirrored at
//             britishlistedbuildings.co.uk/101113243-26-pancras-road-st-pancras-and-somers-town-ward : Gruning 1864-65;
//             stock brick; a three-storey one-window frontage; hipped roof with a continuous ridge lantern; laminated
//             timber trusses of about 20 m span; the east elevation has five pointed-arch windows above an oculus.
//             The hall's 57 ft (17.4 m) floor-to-ceiling height is from whatsdownthatstreet.com (read as a search summary).
//   [HE-GAS]  Historic England list entry 1464325, the King's Cross gasholders 10, 11 and 12 (read as a search summary):
//             about 33 m high; internal diameters 40.8 m (No. 10), 44.3 m (No. 11) and 32.3 m (No. 12).
//   [AM]      Architect magazine, https://www.architectmagazine.com/?p=245074 (a search summary): Gasholder Park, the
//             frame of gasholder No. 8 about 25 m high, internal diameter about 40 m, a canopy about 30 m across.
//   [AR]      Architectural Record, April 2018, WilkinsonEyre's Gasholders London: 145 flats in three drums; the guide
//             frames "painted battleship gray" and slightly proud of the drums; drums of silver-grey aluminium with
//             perforated shutters and dark ring beams; roof gardens on top; a circular courtyard in each drum.
//   [DC]      Designcurial, https://www.designcurial.com/news/kings-cross-gasholders-by-wilkinsoneyre-4829871 (a search
//             summary): the three drums are 12, 9 and 8 storeys.
//   [ADF]     Architects Datafile, "Transparently innovative", https://architectsdatafile.co.uk/?p=222882 : the Crick is
//             170 m long, four storeys below and eight above ground; the roof structure reaches 43 m above street level;
//             a vaulted roof hooped north-south and gently curved east-west, of two interlocking shells (160 x 80 m);
//             louvre blades with photovoltaic blades; labs wrapped in terracotta inside a mostly glass envelope.
//   [WP-CRK]  Wikipedia, "Francis Crick Institute": up to eight storeys above ground and four basement levels.
//   [HE-BL]   Historic England list entry 1426345, British Library (Grade I), as mirrored at britishlistedbuildings.co.uk/
//             101426345 : Wilson with M. J. Long, 1982-99; a 7.8 x 7.8 m column grid; dark red hand-made Leicestershire
//             brick; slate stepped roofs; a south frontage of five bays and four storeys; an east block of six main
//             storeys; west blocks with double-stepped pitched roofs; a clock tower above the junction of the east block
//             and the entrance roofscape, its clock facing south.
//   [WP-P37]  Wikipedia, "Platform 37": 11 storeys, terraced roof gardens, "72 m at highest point" (probably above
//             ordnance datum: the ground here is about 25 m AOD, which would make about 46 m above the street: INFERENCE).
//   [NSC]     New Steel Construction, https://www.newsteelconstruction.com/wp/steel-landscraper-takes-shape-in-kings-cross/ :
//             over 300 m long, 11 storeys, roof terraces and a running track, 60 400 m2 of offices.
//   [GU]      The Guardian, 2 July 2022 (a search summary): about 250 trees in the roof garden.
//   [DZ]      Dezeen, June 2025 (a search summary): a slatted facade of glass and Accoya timber.
import type { Pt } from './geo.ts';
import type { KxData } from './osm.ts';
import { chainBays, polygonEdges } from './landmarks.ts';
import type { BayPosition, Edge } from './landmarks.ts';
import { area2, safeInset } from './landmarks.ts';
import { fitCircle, longAxis, pointInPolygon, polygonArea } from './station.ts';

export { area2, pointInPolygon, polygonArea, polygonEdges, safeInset };
export type { BayPosition, Edge };

// ---- identities ---------------------------------------------------------------------------------

/**
 * The OSM building outlines this module replaces. NOTE (corrections to the brief): the Granary is 222021576, not
 * 222021578 (that is the Central Saint Martins "street" between the sheds); the Google landscraper is 1018561795
 * "Platform 37" (265720685 is 6 Pancras Square); the gasholders are not in the extract, so they have no id to hide.
 */
export const OSM = {
  westernCoalDrops: 222021572,
  easternCoalDrops: 222021573,
  granary: 222021576,
  westTransitShed: 222021577,
  eastTransitShed: 222021570,
  granaryStreet: 222021578,
  crick: 132318687,
  britishLibrary: 4680891,
  gymnasium: 46821178,
  landscraper: 1018561795,
} as const;
export const KXCENTRAL_OSM_IDS: readonly number[] = Object.values(OSM);

/** Published figures. `ASSUMED` ones are marked in a comment and have no source. */
export const FIG = {
  coal: {
    apex: 25, // [CM] the kiss, 25 m
    storeys: 3, // [CM] two Victorian storeys plus the one Heatherwick added
    storeyHeight: 3.5, // ASSUMED
    liftRadius: 70, // ASSUMED: about the 65 m and 75 m roof lengths [CM]
    pitch: 0.35, // ASSUMED: slope of the unlifted slate roof, rise per metre in from the eaves
    ridgeRise: 3.5, // ASSUMED: height of the unlifted ridge above the eaves
    lengthEast: 150, // [CM]
    lengthWest: 120, // [CM] (the OSM outline measures about 99 m; see the test)
    maxEdge: 8, // mesh resolution of the roof, metres (a finer mesh gains nothing: the lift is a cone 70 m wide)
  },
  granary: {
    storeys: 6, // [HE-GRA]
    groundClear: 4.1, // [HE-GRA] column height, ground floor
    upperClear: 2.4, // [HE-GRA] column height, upper floors
    slab: 0.6, // ASSUMED: floor slab and beam depth
    bays: 9, // [HE-GRA]
    hoistBays: [1, 3, 5, 7], // [HE-GRA] four hoist bays alternating with the casement bays (so five casement bays)
    hoistProjection: 0.4, // ASSUMED ("slightly projecting")
    pitch: 35, // ASSUMED roof pitch in degrees
    shedEaves: 11, // ASSUMED
    shedRise: 4, // ASSUMED
    streetEaves: 11, // ASSUMED
    streetRise: 2.5, // ASSUMED
  },
  gymnasium: {
    eaves: 12, // ASSUMED
    ridge: 17.4, // whatsdownthatstreet (via [HE-GYM]): 57 ft hall height, used here as the ridge height
    lantern: 1.8, // ASSUMED height of the ridge lantern
    lanternWidth: 2.6, // ASSUMED
    eastWindows: 5, // [HE-GYM] five pointed-arch windows above an oculus
  },
  gas: {
    tripletHeight: 33, // [HE-GAS]
    parkHeight: 25, // [AM]
    tripletTiers: 3, // ASSUMED
    parkTiers: 2, // ASSUMED
    columnPitch: 5.5, // ASSUMED metres of circumference per column
    storeyHeight: 2.7, // ASSUMED
    drumStoreys: [12, 9, 8], // [DC] 12, 9 and 8 storeys; which drum has which is ASSUMED (the biggest takes the most)
    frameStandoff: 1.2, // ASSUMED: the frame stands slightly proud of the drum [AR]
    courtRatio: 0.38, // ASSUMED: the courtyard radius as a share of the drum's
    canopyRadius: 15, // [AM] a canopy about 30 m across
    canopyHeight: 9, // ASSUMED
    diameters: { 1106694288: 40.8, 1106694290: 44.3, 1106694289: 32.3 } as Record<number, number>, // [HE-GAS] No. 10, 11, 12
  },
  crick: {
    storeys: 8, // [ADF] [WP-CRK] eight above ground (OSM levels 12 and 11 count four basements)
    storeyHeight: 4, // ASSUMED
    crown: 43, // [ADF] the roof structure reaches 43 m above street level
    lengthwise: 0.1, // ASSUMED: how much lower the vault ends sit than its middle ("gently curved" along its length)
    maxEdge: 8, // mesh resolution of the roof, metres
  },
  library: {
    westStoreys: 4, // [HE-BL] the south frontage is four storeys
    eastStoreys: 6, // [HE-BL] the east block has six main storeys
    storeyHeight: 4.2, // ASSUMED
    grid: 7.8, // [HE-BL] column grid, metres
    roofPitch: 35, // ASSUMED: degrees, the stepped slate roofs
    maxStepRise: 4.5, // ASSUMED: no stepped roof climbs more than this
    eastRise: 4.5, // ASSUMED: ridge of the east block's roof above its eaves
    stepInset: 10, // ASSUMED: how far in each roof tries to climb (less where the block is narrow)
    upperStoreys: 1, // ASSUMED: the one storey between the first and second roof of the stepped west block
    upperFromZ: 45, // ASSUMED: the upper storey stands south of this line, on the main body (the thin north wing keeps one roof)
    clockSide: 7.8, // ASSUMED: one structural bay
    clockHeight: 34, // ASSUMED
    gateWidth: 7.8, // ASSUMED: one structural bay [HE-BL]
    cutNear: [-236.5, 133.3] as Pt, // the re-entrant corner where the piazza meets the east block ([OSM] outline, vertex 47)
    cutFar: [-217.8, 199.6] as Pt, // the south-east end of the east block's west face ([OSM] outline, vertex 42)
  },
  landscraper: {
    storeys: 11, // [WP-P37] [NSC]
    storeyHeight: 4.2, // ASSUMED
    zoneStoreys: [7, 9, 11], // ASSUMED: three terraces rising to the north end; only the 11 is sourced
    zoneCuts: [0.36, 0.7], // ASSUMED: where the terraces step, as a share of the length from the south end
    trees: 250, // [GU]
    treeInset: 2.5, // ASSUMED: trees stand this far in from the roof edge
    treeSpacing: 5.5, // ASSUMED
  },
} as const;

// ---- the polygon toolbox -----------------------------------------------------------------------

const dot = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1];
const cross3 = (a: Pt, b: Pt, c: Pt): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** A ring without repeated points (and without a closing copy of its first point). */
export function cleanRing(pts: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || dist(p, q) > 1e-6) out.push([p[0], p[1]]);
  }
  while (out.length > 1 && dist(out[0] as Pt, out[out.length - 1] as Pt) <= 1e-6) out.pop();
  return out;
}

/** Drop the vertices that only add edges: closer than `minEdge` to the one kept before, or turning by less than `straightDeg`. */
export function simplifyRing(pts: readonly Pt[], minEdge = 1.5, straightDeg = 3): Pt[] {
  let ring = cleanRing(pts);
  for (let pass = 0; pass < 8 && ring.length > 3; pass++) {
    const keep: Pt[] = [];
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const p = ring[i] as Pt;
      const prev = keep.length ? (keep[keep.length - 1] as Pt) : (ring[(i + n - 1) % n] as Pt);
      const next = ring[(i + 1) % n] as Pt;
      const d1: Pt = [p[0] - prev[0], p[1] - prev[1]];
      const d2: Pt = [next[0] - p[0], next[1] - p[1]];
      const l1 = Math.hypot(d1[0], d1[1]);
      const l2 = Math.hypot(d2[0], d2[1]);
      const turn = (Math.abs(Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1])) * 180) / Math.PI;
      if (l1 < minEdge || (l2 > 0 && turn < straightDeg)) continue;
      keep.push(p);
    }
    if (keep.length < 3 || keep.length === ring.length) {
      if (keep.length >= 3) ring = keep;
      break;
    }
    ring = keep;
  }
  return ring;
}

function inTriangle(p: Pt, a: Pt, b: Pt, c: Pt): boolean {
  // a, b, c run counter-clockwise (positive): the boundary counts as inside, the corners themselves do not
  if ((p[0] === a[0] && p[1] === a[1]) || (p[0] === b[0] && p[1] === b[1]) || (p[0] === c[0] && p[1] === c[1])) return false;
  return cross3(a, b, p) >= -1e-9 && cross3(b, c, p) >= -1e-9 && cross3(c, a, p) >= -1e-9;
}

/**
 * Ear clipping of a simple polygon (any winding, no holes): triangles as index triples into `ring`, every one turning
 * the positive way (counter-clockwise in the (x, z) plane, as area2 counts). A vertex that adds no corner is dropped.
 */
export function earClip(ring: readonly Pt[]): [number, number, number][] {
  const idx = ring.map((_, i) => i);
  if (area2(ring) < 0) idx.reverse();
  const tris: [number, number, number][] = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 20000) {
    let clipped = false;
    const n = idx.length;
    for (let k = 0; k < n; k++) {
      const i0 = idx[(k + n - 1) % n] as number;
      const i1 = idx[k] as number;
      const i2 = idx[(k + 1) % n] as number;
      const a = ring[i0] as Pt;
      const b = ring[i1] as Pt;
      const c = ring[i2] as Pt;
      if (cross3(a, b, c) <= 1e-9) continue; // a reflex corner, or a straight run: not an ear
      let free = true;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue;
        if (inTriangle(ring[j] as Pt, a, b, c)) {
          free = false;
          break;
        }
      }
      if (!free) continue;
      tris.push([i0, i1, i2]);
      idx.splice(k, 1);
      clipped = true;
      break;
    }
    if (clipped) continue;
    // no ear: drop a vertex that lies on the line through its neighbours (a zero-area sliver), or stop
    let dropped = false;
    for (let k = 0; k < n; k++) {
      const a = ring[idx[(k + n - 1) % n] as number] as Pt;
      const b = ring[idx[k] as number] as Pt;
      const c = ring[idx[(k + 1) % n] as number] as Pt;
      if (Math.abs(cross3(a, b, c)) <= 1e-6) {
        idx.splice(k, 1);
        dropped = true;
        break;
      }
    }
    if (!dropped) break;
  }
  if (idx.length === 3 && Math.abs(cross3(ring[idx[0] as number] as Pt, ring[idx[1] as number] as Pt, ring[idx[2] as number] as Pt)) > 1e-9) tris.push([idx[0] as number, idx[1] as number, idx[2] as number]);
  return tris;
}

export interface PolyMesh {
  points: Pt[];
  /** triangles, each turning the positive way (see `earClip`) */
  tris: [number, number, number][];
  /** the outline as indices into `points`, in order, turning the positive way; every outline edge is a mesh edge */
  boundary: number[];
}

/**
 * A triangle mesh of a simple polygon whose edges are all at most `maxEdge` long, and which has no T-junctions: the
 * polygon is ear-clipped, then the longest edge of any triangle that is too long is bisected (Rivara's longest-edge
 * refinement: a bisection is carried out only when the edge is the longest of both triangles that share it, so each
 * split meets its neighbour exactly). The outline is returned as `boundary`, so a wall built on it meets the roof.
 */
export function meshPolygon(input: readonly Pt[], maxEdge: number): PolyMesh {
  const ring = simplifyRing(input, 0, 0.05);
  const points: Pt[] = ring.map((p) => [p[0], p[1]] as Pt);
  const tris: ([number, number, number] | null)[] = earClip(ring);
  const key = (a: number, b: number): number => (a < b ? a * 1e7 + b : b * 1e7 + a);
  const edgeTris = new Map<number, number[]>();
  const edgesOf = (t: [number, number, number]): [number, number][] => [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]];
  const link = (t: number): void => {
    for (const [p, q] of edgesOf(tris[t] as [number, number, number])) {
      const k = key(p, q);
      const l = edgeTris.get(k);
      if (l) l.push(t);
      else edgeTris.set(k, [t]);
    }
  };
  const unlink = (t: number): void => {
    for (const [p, q] of edgesOf(tris[t] as [number, number, number])) {
      const k = key(p, q);
      const l = (edgeTris.get(k) as number[]).filter((x) => x !== t);
      if (l.length) edgeTris.set(k, l);
      else edgeTris.delete(k);
    }
  };
  tris.forEach((_, t) => link(t));
  const len = (p: number, q: number): number => dist(points[p] as Pt, points[q] as Pt);
  // a strict order on edges (length, then key), so that "the longest edge" of a triangle is never a tie
  const rank = (p: number, q: number): number => Math.round(len(p, q) * 1e6) * 1e-6 + key(p, q) * 1e-18;
  const longest = (t: number): [number, number] => {
    let best: [number, number] = [0, 0];
    let bestRank = -1;
    for (const [p, q] of edgesOf(tris[t] as [number, number, number])) {
      const r = rank(p, q);
      if (r > bestRank) {
        bestRank = r;
        best = [p, q];
      }
    }
    return best;
  };
  const queue: number[] = tris.map((_, t) => t);
  const split = (t: number, p: number, q: number, m: number): void => {
    const [a, b, c] = tris[t] as [number, number, number];
    let v: [number, number, number];
    if ((a === p && b === q) || (a === q && b === p)) v = [a, b, c];
    else if ((b === p && c === q) || (b === q && c === p)) v = [b, c, a];
    else v = [c, a, b];
    unlink(t);
    tris[t] = null;
    tris.push([v[0], m, v[2]]);
    link(tris.length - 1);
    tris.push([m, v[1], v[2]]);
    link(tris.length - 1);
    queue.push(tris.length - 2, tris.length - 1);
  };
  let steps = 0;
  while (queue.length && steps++ < 400000) {
    const start = queue.pop() as number;
    if (!tris[start]) continue;
    let t = start;
    let did = false;
    for (let hops = 0; hops < 5000; hops++) {
      const [p, q] = longest(t);
      if (len(p, q) <= maxEdge) break;
      const nb = (edgeTris.get(key(p, q)) as number[]).find((x) => x !== t);
      const mid: Pt = [((points[p] as Pt)[0] + (points[q] as Pt)[0]) / 2, ((points[p] as Pt)[1] + (points[q] as Pt)[1]) / 2];
      if (nb === undefined) {
        points.push(mid);
        split(t, p, q, points.length - 1);
        did = true;
        break;
      }
      const [np, nq] = longest(nb);
      if (key(np, nq) === key(p, q)) {
        points.push(mid);
        const m = points.length - 1;
        split(t, p, q, m);
        split(nb, p, q, m);
        did = true;
        break;
      }
      t = nb; // the neighbour's longest edge is longer than this one: refine that first
    }
    if (did && tris[start]) queue.push(start); // the walk ended at a neighbour: this triangle may still be too big
  }
  const live = tris.filter((t): t is [number, number, number] => t !== null);
  const next = new Map<number, number>();
  for (const t of live) for (const [p, q] of edgesOf(t)) if ((edgeTris.get(key(p, q)) as number[]).length === 1) next.set(p, q);
  const boundary: number[] = [];
  if (next.size) {
    const first = next.keys().next().value as number;
    let v = first;
    do {
      boundary.push(v);
      v = next.get(v) as number;
    } while (v !== undefined && v !== first && boundary.length <= next.size);
  }
  return { points, tris: live, boundary };
}

/** Drop the vertices where the ring turns back on itself by more than `turnDeg` (a thin spike or notch an inset cannot follow). */
export function dropSharpTurns(pts: readonly Pt[], turnDeg = 150): Pt[] {
  let out = [...pts];
  for (let again = true; again && out.length > 3; ) {
    again = false;
    for (let i = 0; i < out.length; i++) {
      const p = out[(i + out.length - 1) % out.length] as Pt;
      const q = out[i] as Pt;
      const r = out[(i + 1) % out.length] as Pt;
      const turn = (Math.abs(Math.atan2((q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]), (q[0] - p[0]) * (r[0] - q[0]) + (q[1] - p[1]) * (r[1] - q[1]))) * 180) / Math.PI;
      if (turn > turnDeg) {
        out = out.filter((_, k) => k !== i);
        again = true;
        break;
      }
    }
  }
  return out;
}

/** Remove the vertices where a ring doubles back along its own line (a zero-area spike), until there are none. */
export function dropSpikes(ring: readonly Pt[]): Pt[] {
  let out = [...ring];
  for (let again = true; again && out.length > 3; ) {
    again = false;
    for (let i = 0; i < out.length; i++) {
      const p = out[(i + out.length - 1) % out.length] as Pt;
      const q = out[i] as Pt;
      const r = out[(i + 1) % out.length] as Pt;
      const d1: Pt = [q[0] - p[0], q[1] - p[1]];
      const d2: Pt = [r[0] - q[0], r[1] - q[1]];
      const scale = Math.hypot(d1[0], d1[1]) * Math.hypot(d2[0], d2[1]);
      if (scale > 0 && Math.abs(d1[0] * d2[1] - d1[1] * d2[0]) <= 1e-6 * scale && d1[0] * d2[0] + d1[1] * d2[1] < 0) {
        out = out.filter((_, k) => k !== i);
        again = true;
        break;
      }
    }
  }
  return out;
}

/**
 * The part of the ring where (p - origin) . normal >= 0 (Sutherland-Hodgman, with the zero-area spikes it leaves where a
 * concave ring dips out of the half-plane and back dropped: exact for a convex ring, and sound for a concave one so long
 * as the line does not cut it into separate pieces).
 */
export function clipHalfPlane(ring: readonly Pt[], origin: Pt, normal: Pt): Pt[] {
  const side = (p: Pt): number => (p[0] - origin[0]) * normal[0] + (p[1] - origin[1]) * normal[1];
  const out: Pt[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i] as Pt;
    const b = ring[(i + 1) % ring.length] as Pt;
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa > 0 && sb < 0) || (sa < 0 && sb > 0)) {
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return dropSpikes(cleanRing(out));
}

/** The ring with a point inserted wherever an edge crosses the line (p - origin) . normal = 0. */
export function insertCrossings(ring: readonly Pt[], origin: Pt, normal: Pt): Pt[] {
  const side = (p: Pt): number => (p[0] - origin[0]) * normal[0] + (p[1] - origin[1]) * normal[1];
  const out: Pt[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i] as Pt;
    const b = ring[(i + 1) % ring.length] as Pt;
    out.push(a);
    const sa = side(a);
    const sb = side(b);
    if ((sa > 1e-9 && sb < -1e-9) || (sa < -1e-9 && sb > 1e-9)) {
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** Distance from p to the segment a-b. */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 === 0 ? 0 : clamp01(((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2);
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dz * t));
}
/** Distance from p to the nearest edge of a closed ring. */
export function distToRing(p: Pt, ring: readonly Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) best = Math.min(best, distToSegment(p, ring[i] as Pt, ring[(i + 1) % ring.length] as Pt));
  return best;
}
/** Distance from p to an open polyline. */
export function distToPolyline(p: Pt, line: readonly Pt[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) best = Math.min(best, distToSegment(p, line[i] as Pt, line[i + 1] as Pt));
  return best;
}

/** Is the point on the ring's boundary, within `tol` metres? */
export const onRing = (p: Pt, ring: readonly Pt[], tol = 0.1): boolean => distToRing(p, ring) <= tol;

/** The edges of `ring` that are not shared with any of `others` (both ends on another ring's boundary): the walls that can be seen. */
export function exposedEdges(ring: readonly Pt[], others: readonly (readonly Pt[])[], tol = 0.1): Edge[] {
  return polygonEdges(ring).filter((e) => !others.some((o) => onRing(e.a, o, tol) && onRing(e.b, o, tol) && onRing(e.mid, o, tol)));
}

/** A wall standing over a lower neighbour: an edge piece, the neighbour's roof height at each end (the foot) and this building's own top at each end. */
export interface RaisedWall {
  edge: Edge;
  baseA: number;
  baseB: number;
  topA: number;
  topB: number;
}
export interface Neighbour {
  ring: readonly Pt[];
  /** the height of the neighbour's roof (or wall top) at a point of the plan */
  top(p: Pt): number;
}

/**
 * The walls of a building above its lower neighbours. Where an edge of `ring` lies on a neighbour's ring, nothing is built
 * between the two at ground level (that wall is inside), but whatever stands higher than the neighbour's roof is open to the sky:
 * a wall from the neighbour's roof (followed at every vertex of the neighbour's ring along the edge, so a gable's peak is
 * kept) up to this building's own `top`, wherever that is `minRise` metres or more above it.
 */
export function raisedWalls(ring: readonly Pt[], top: (p: Pt) => number, neighbours: readonly Neighbour[], tol = 0.2, minRise = 0.25): RaisedWall[] {
  const out: RaisedWall[] = [];
  for (const e of polygonEdges(ring)) {
    const covering = neighbours.filter((n) => onRing(e.a, n.ring, tol) && onRing(e.b, n.ring, tol) && onRing(e.mid, n.ring, tol));
    if (!covering.length) continue;
    const ts = new Set<number>([0, 1]);
    for (const n of covering) {
      for (const q of n.ring) {
        if (distToSegment(q, e.a, e.b) > tol) continue;
        const t = ((q[0] - e.a[0]) * e.dir[0] + (q[1] - e.a[1]) * e.dir[1]) / e.length;
        if (t > 1e-3 && t < 1 - 1e-3) ts.add(t);
      }
    }
    const cuts = [...ts].sort((x, y) => x - y);
    const at = (t: number): Pt => [e.a[0] + (e.b[0] - e.a[0]) * t, e.a[1] + (e.b[1] - e.a[1]) * t];
    const base = (p: Pt): number => Math.max(...covering.map((n) => n.top(p)));
    for (let k = 0; k + 1 < cuts.length; k++) {
      const a = at(cuts[k] as number);
      const b = at(cuts[k + 1] as number);
      const length = dist(a, b);
      if (length < 0.05) continue;
      const topA = top(a);
      const topB = top(b);
      const baseA = base(a);
      const baseB = base(b);
      if (topA - baseA < minRise && topB - baseB < minRise) continue;
      out.push({ edge: { ...e, a, b, length, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }, baseA: Math.min(baseA, topA), baseB: Math.min(baseB, topB), topA, topB });
    }
  }
  return out;
}

/** The vertex of the ring nearest to a point. */
export function nearestVertex(ring: readonly Pt[], p: Pt): { index: number; point: Pt; distance: number } {
  let best = { index: 0, point: ring[0] as Pt, distance: Infinity };
  ring.forEach((q, i) => {
    const d = dist(q, p);
    if (d < best.distance) best = { index: i, point: q, distance: d };
  });
  return best;
}

/** The unit surface normal of a height field at (x, z), by central differences over `eps` metres. */
export function surfaceNormal(height: (p: Pt) => number, p: Pt, eps = 0.5): [number, number, number] {
  const dx = (height([p[0] + eps, p[1]]) - height([p[0] - eps, p[1]])) / (2 * eps);
  const dz = (height([p[0], p[1] + eps]) - height([p[0], p[1] - eps])) / (2 * eps);
  const l = Math.hypot(dx, 1, dz);
  return [-dx / l, 1 / l, -dz / l];
}

/** Deterministic random numbers in [0, 1): the same trees every load. */
export function rand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const building = (data: Pick<KxData, 'buildings'>, id: number) => {
  const b = data.buildings.find((x) => x.id === id);
  if (!b) throw new Error(`OSM building ${id} is not in the data`);
  return b;
};
/** The outline of an OSM building, as a clean ring. */
export const outlineOf = (data: Pick<KxData, 'buildings'>, id: number): Pt[] => cleanRing(building(data, id).pts);

// ---- gabled and hipped roofs --------------------------------------------------------------------

export interface GableRoof {
  /** the outline with a vertex wherever it crosses the ridge line (the wall tops follow the roof from vertex to vertex) */
  ring: Pt[];
  /** the two roof planes' outlines: each is flat, so each is ear-clipped into triangles */
  halves: Pt[][];
  /** a point on the ridge line, and the unit vector across it */
  origin: Pt;
  across: Pt;
  axis: Pt;
  halfWidth: number;
  /** height of the roof at a point of the plan */
  height(p: Pt): number;
}

/**
 * A pitched roof over any outline, ridge along the outline's long axis through the middle of its width, gable ends.
 * The two roof planes are exactly flat, so the ridge is a clean line.
 */
export function gableRoof(outline: readonly Pt[], eaves: number, rise: number): GableRoof {
  const ring = cleanRing(outline);
  const { axis } = longAxis([...ring]);
  const across: Pt = [-axis[1], axis[0]];
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of ring) {
    const v = dot(p, across);
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const mid = (lo + hi) / 2;
  const halfWidth = (hi - lo) / 2;
  const origin: Pt = [across[0] * mid, across[1] * mid];
  return {
    ring: insertCrossings(ring, origin, across),
    halves: [clipHalfPlane(ring, origin, across), clipHalfPlane(ring, origin, [-across[0], -across[1]])],
    origin,
    across,
    axis,
    halfWidth,
    height: (p) => eaves + rise * (1 - Math.abs(dot(p, across) - mid) / halfWidth),
  };
}

export type Facet = [number, number, number][];

/**
 * The eight facets of a roof over a rectangle that is hipped at both ends, with two parallel ridges (the Granary's
 * "double-hipped" roof [HE-GRA]): `o` is a corner, `u` and `v` unit vectors along the two sides, `l` and `d` their lengths.
 * Each half is hipped at 45 degrees in plan, the ridge `rise` above the eaves y0 and a quarter of the depth in.
 */
export function doubleHippedRoof(o: Pt, u: Pt, v: Pt, l: number, d: number, y0: number, rise: number): Facet[] {
  const at = (a: number, b: number, y: number): [number, number, number] => [o[0] + u[0] * a + v[0] * b, y, o[1] + u[1] * a + v[1] * b];
  const out: Facet[] = [];
  const half = d / 2;
  const a = Math.min(half / 2, l / 2);
  for (const b0 of [0, half]) {
    const m = b0 + half / 2;
    const y1 = y0 + rise;
    out.push([at(0, b0, y0), at(l, b0, y0), at(l - a, m, y1), at(a, m, y1)]); // the slope facing the long side nearer b = 0
    out.push([at(l, b0 + half, y0), at(0, b0 + half, y0), at(a, m, y1), at(l - a, m, y1)]); // and the one facing the other
    out.push([at(0, b0 + half, y0), at(0, b0, y0), at(a, m, y1)]); // the hip at u = 0
    out.push([at(l, b0, y0), at(l, b0 + half, y0), at(l - a, m, y1)]); // and at u = l
  }
  return out;
}

// ---- Coal Drops Yard ----------------------------------------------------------------------------

export interface CoalBuilding {
  id: number;
  outline: Pt[];
  /** length along the long axis of the OSM outline */
  length: number;
}
export interface CoalDropsPlan {
  west: CoalBuilding;
  east: CoalBuilding;
  /** where the two outlines touch: the kissing point (plan position; its height is `apex`) */
  kiss: Pt;
  /** the nearest the two outlines come, metres: 0 where they touch */
  gap: number;
  apex: number;
  eaves: number;
  radius: number;
  /** the roof height above the ground at a point of the plan, over one of the two buildings */
  roofHeight(which: 'west' | 'east', p: Pt): number;
}

/**
 * Heatherwick's roofs. Each Victorian shed has a shallow slate roof at its eaves; near the point where the two
 * outlines touch the roof is peeled up in a cone that reaches the same 25 m [CM] on both sides, so the two roofs meet
 * there: h = base + (apex - base) w, base the pitched roof (rising from the eaves with the distance in from the wall)
 * and w = (1 - r / R)^2, r the distance from the kiss and R the lift radius. The cone's shape and radius are ASSUMED.
 */
export function coalDropsPlan(data: Pick<KxData, 'buildings'>): CoalDropsPlan {
  const w = outlineOf(data, OSM.westernCoalDrops);
  const e = outlineOf(data, OSM.easternCoalDrops);
  let gap = Infinity;
  let kiss: Pt = [0, 0];
  for (const a of w) {
    for (const b of e) {
      const d = dist(a, b);
      if (d < gap) {
        gap = d;
        kiss = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      }
    }
  }
  const f = FIG.coal;
  const eaves = f.storeys * f.storeyHeight;
  const outlines = { west: w, east: e };
  return {
    west: { id: OSM.westernCoalDrops, outline: w, length: longAxis([...w]).length },
    east: { id: OSM.easternCoalDrops, outline: e, length: longAxis([...e]).length },
    kiss,
    gap,
    apex: f.apex,
    eaves,
    radius: f.liftRadius,
    roofHeight(which, p) {
      const base = eaves + Math.min(f.pitch * distToRing(p, outlines[which]), f.ridgeRise);
      const t = clamp01(1 - dist(p, kiss) / f.liftRadius);
      return base + (f.apex - base) * t * t;
    },
  };
}

// ---- the Granary complex ------------------------------------------------------------------------

export interface GranaryPlan {
  outline: Pt[];
  /** the south front, edge by edge, and its nine bays */
  front: Edge[];
  bays: BayPosition[];
  hoist: number[];
  /** the rectangle the outline fits: a corner, unit vectors along the front (u) and into the building (v), the sides */
  frame: { origin: Pt; u: Pt; v: Pt; length: number; depth: number };
  /** floor level of each storey, then the eaves */
  floors: number[];
  eaves: number;
  roofRise: number;
  /** the double-hipped roof, facet by facet */
  roof: Facet[];
  /** the edges that are not shared with a neighbour: the walls that show (the south front) */
  walls: Edge[];
  /** the walls above the lower neighbours' roofs, on the edges it shares with them */
  raised: RaisedWall[];
}
export interface ShedPlan {
  id: number;
  outline: Pt[];
  eaves: number;
  roof: GableRoof;
  /** the edges that are not shared with a neighbour: the walls that show */
  walls: Edge[];
  /** the walls above the lower neighbours' roofs, on the edges it shares with them */
  raised: RaisedWall[];
}
export interface GranaryComplex {
  granary: GranaryPlan;
  westShed: ShedPlan;
  eastShed: ShedPlan;
  street: ShedPlan;
}

/** The Granary and what stands round it: the four outlines tile the block, so the shared walls are left out. */
export function granaryComplex(data: Pick<KxData, 'buildings'>): GranaryComplex {
  const f = FIG.granary;
  const outline = outlineOf(data, OSM.granary);
  const rings = {
    granary: outline,
    westShed: outlineOf(data, OSM.westTransitShed),
    eastShed: outlineOf(data, OSM.eastTransitShed),
    street: outlineOf(data, OSM.granaryStreet),
  };
  const south = polygonEdges(outline).filter((e) => e.normal[1] > 0.5);
  const first = south[0] as Edge;
  const last = south[south.length - 1] as Edge;
  const run: Pt = [last.b[0] - first.a[0], last.b[1] - first.a[1]];
  const rl = Math.hypot(run[0], run[1]);
  const u: Pt = [run[0] / rl, run[1] / rl];
  const into: Pt = [-first.normal[0], -first.normal[1]];
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  for (const p of outline) {
    u0 = Math.min(u0, dot(p, u));
    u1 = Math.max(u1, dot(p, u));
    v0 = Math.min(v0, dot(p, into));
    v1 = Math.max(v1, dot(p, into));
  }
  const origin: Pt = [u[0] * u0 + into[0] * v0, u[1] * u0 + into[1] * v0];
  const floors = [0];
  for (let s = 1; s < f.storeys; s++) floors.push((floors[s - 1] as number) + (s === 1 ? f.groundClear : f.upperClear) + f.slab);
  const eaves = (floors[f.storeys - 1] as number) + f.upperClear + f.slab;
  const length = u1 - u0;
  const depth = v1 - v0;
  const roofRise = (depth / 4) * Math.tan((f.pitch * Math.PI) / 180);
  const granary: GranaryPlan = {
    outline,
    front: south,
    bays: chainBays(south, f.bays),
    hoist: [...f.hoistBays],
    frame: { origin, u, v: into, length, depth },
    floors,
    eaves,
    roofRise,
    roof: doubleHippedRoof(origin, u, into, length, depth, eaves, roofRise),
    walls: [],
    raised: [],
  };
  const roofs = {
    westShed: gableRoof(rings.westShed, f.shedEaves, f.shedRise),
    eastShed: gableRoof(rings.eastShed, f.shedEaves, f.shedRise),
    street: gableRoof(rings.street, f.streetEaves, f.streetRise),
  };
  // what each tile stands up to at a point of the plan: the Granary's walls to its eaves (its roof sits on them), a shed's to its roof
  const tiles = {
    granary: { ring: outline, top: (): number => eaves },
    westShed: { ring: roofs.westShed.ring, top: roofs.westShed.height },
    eastShed: { ring: roofs.eastShed.ring, top: roofs.eastShed.height },
    street: { ring: roofs.street.ring, top: roofs.street.height },
  };
  type Tile = keyof typeof tiles;
  const next = (me: Tile): Neighbour[] => (Object.keys(tiles) as Tile[]).filter((k) => k !== me).map((k) => tiles[k]);
  const shed = (id: number, tile: Exclude<Tile, 'granary'>, eavesH: number): ShedPlan => {
    const t = tiles[tile];
    // the walls are the edges of the ring with the ridge crossings in it, so a gable end rises to the ridge
    return { id, outline: rings[tile], eaves: eavesH, roof: roofs[tile], walls: exposedEdges(t.ring, next(tile).map((n) => n.ring)), raised: raisedWalls(t.ring, t.top, next(tile)) };
  };
  granary.walls = exposedEdges(outline, next('granary').map((n) => n.ring));
  granary.raised = raisedWalls(outline, tiles.granary.top, next('granary'));
  return {
    granary,
    westShed: shed(OSM.westTransitShed, 'westShed', f.shedEaves),
    eastShed: shed(OSM.eastTransitShed, 'eastShed', f.shedEaves),
    street: shed(OSM.granaryStreet, 'street', f.streetEaves),
  };
}

// ---- the gasholders -----------------------------------------------------------------------------

/** OpenStreetMap ways (man_made=gasometer), Overpass 2026-11-08, in local metres rounded to 0.1 m. */
export const GASHOLDER_WAYS: Readonly<Record<number, Pt[]>> = {
  1106694288: [[-221.3, -644.3], [-225, -647.3], [-237.9, -650.1], [-246.9, -647.2], [-250.6, -644.2], [-253.6, -640.5], [-255.7, -636.2], [-256.8, -631.6], [-256.9, -626.8], [-255.9, -622.2], [-253.8, -617.9], [-250.9, -614.1], [-247.1, -611.2], [-242.8, -609.1], [-238.2, -608], [-233.4, -608], [-228.8, -609.1], [-224.5, -611.2], [-220.8, -614.2], [-217.9, -618], [-215.9, -622.3], [-214.9, -627], [-215, -631.7], [-216.1, -636.4], [-218.2, -640.6]],
  1106694289: [[-233, -654.8], [-234.8, -660], [-234.7, -665.6], [-233.4, -669.7], [-231, -673.3], [-227.8, -676.3], [-224, -678.2], [-219.8, -679.2], [-215.5, -679], [-211.3, -677.7], [-207.7, -675.4], [-204.7, -672.3], [-202.7, -668.4], [-201.7, -664.2], [-201.9, -659.9], [-203.1, -655.8], [-205.4, -652.1], [-208.5, -649.1], [-212.3, -647], [-216.5, -646], [-220.9, -646.1], [-225, -647.3], [-229.6, -650.4]],
  1106694290: [[-270.8, -649.2], [-274.5, -652.6], [-277.4, -656.7], [-279.3, -661.3], [-280.2, -666.2], [-280, -671.3], [-278.7, -676.1], [-276.3, -680.5], [-273.1, -684.4], [-269.1, -687.4], [-264.5, -689.4], [-259.7, -690.5], [-254.6, -690.4], [-249.8, -689.2], [-245.3, -687], [-241.4, -683.9], [-238.3, -680], [-236.1, -675.5], [-234.9, -670.6], [-234.7, -665.6], [-239.8, -653.6], [-246.9, -647.2], [-247, -647.5], [-251.7, -645.7], [-256.6, -645], [-261.6, -645.3], [-266.4, -646.8]],
  // Gasholder Park: the frame of gasholder No. 8 (wikimedia_commons category on the way)
  453267219: [[-306.2, -668.7], [-302.6, -668.1], [-299, -668.1], [-295.4, -668.6], [-294.2, -669], [-291.9, -669.8], [-288.7, -671.4], [-285.8, -673.5], [-283.2, -676.1], [-282.2, -677.5], [-279.5, -682.3], [-278.5, -685.5], [-278, -689.2], [-278, -692.5], [-278.5, -695.9], [-279.2, -698.1], [-281.1, -702.3], [-284.2, -706.4], [-287.6, -709.3], [-291, -711.2], [-294.5, -712.5], [-298.5, -713.3], [-299.9, -713.3], [-301.8, -713.3], [-306.5, -712.6], [-311, -710.8], [-315, -708.2], [-318, -705.2], [-320.4, -701.7], [-322.2, -697.4], [-323.1, -693.5], [-323.2, -690.1], [-323.1, -689.2], [-322.9, -686.7], [-322.2, -684], [-320.7, -680.3], [-318.2, -676.4], [-315.7, -673.8], [-312.8, -671.6], [-309.6, -669.9], [-308.1, -669.4]],
};

export interface Gasholder {
  /** OSM way id */
  id: number;
  centre: Pt;
  /** radius of the least-squares circle through the way's nodes: the outside of the guide frame */
  radius: number;
  rms: number;
  height: number;
  tiers: number;
  /** the number of guide-frame columns round the circle */
  columns: number;
  /** the apartment drum inside a triplet frame: radius, storeys and height; the courtyard radius (null for the park) */
  drum: { radius: number; storeys: number; height: number; court: number } | null;
}

export interface GasholderPlan {
  triplet: Gasholder[];
  park: Gasholder;
}

export function gasholderPlan(): GasholderPlan {
  const f = FIG.gas;
  const circle = (id: number): { centre: Pt; radius: number; rms: number } => fitCircle([...(GASHOLDER_WAYS[id] as Pt[])]);
  const ids = [1106694288, 1106694289, 1106694290];
  // the biggest drum takes the most storeys (ASSUMED); the order of f.drumStoreys is biggest first
  const bySize = [...ids].sort((a, b) => circle(b).radius - circle(a).radius);
  const triplet = ids.map((id): Gasholder => {
    const c = circle(id);
    const storeys = f.drumStoreys[bySize.indexOf(id)] as number;
    const radius = c.radius - f.frameStandoff;
    return {
      id,
      centre: c.centre,
      radius: c.radius,
      rms: c.rms,
      height: f.tripletHeight,
      tiers: f.tripletTiers,
      columns: Math.round((2 * Math.PI * c.radius) / f.columnPitch),
      drum: { radius, storeys, height: storeys * f.storeyHeight, court: radius * f.courtRatio },
    };
  });
  const p = circle(453267219);
  const park: Gasholder = { id: 453267219, centre: p.centre, radius: p.radius, rms: p.rms, height: f.parkHeight, tiers: f.parkTiers, columns: Math.round((2 * Math.PI * p.radius) / f.columnPitch), drum: null };
  return { triplet, park };
}

// ---- the Francis Crick Institute ----------------------------------------------------------------

/**
 * The Crick's two building:part ways (OSM 1492077991, levels 11, and 1492077992, levels 12), Overpass 2026-11-08, in local
 * metres. They meet along `shared`, which both outlines contain edge for edge.
 */
const CRICK_SHARED: Pt[] = [[-406.7, -50.6], [-344.2, -89.4], [-337.3, -93.4], [-330.4, -96.6], [-277.2, -114]];
export const CRICK_PARTS = {
  north: {
    id: 1492077991,
    levels: 11,
    outline: [[-409, -54.4], [-423.4, -78.2], [-303.9, -151.9], [-292.2, -135.4], [-277.2, -114], [-330.4, -96.6], [-337.3, -93.4], [-344.2, -89.4], [-406.7, -50.6], [-407.5, -52.1]] as Pt[],
    outer: [[-423.4, -78.2], [-303.9, -151.9]] as Pt[],
  },
  south: {
    id: 1492077992,
    levels: 12,
    outline: [[-393.1, -17.9], [-411.5, -47.5], [-406.7, -50.6], [-344.2, -89.4], [-337.3, -93.4], [-330.4, -96.6], [-277.2, -114], [-271, -116], [-266.8, -101.5], [-264.9, -95.2], [-262.3, -84.2], [-313.9, -65.9], [-319.9, -63.3], [-326.6, -59.3]] as Pt[],
    outer: [[-393.1, -17.9], [-326.6, -59.3], [-319.9, -63.3], [-313.9, -65.9], [-262.3, -84.2]] as Pt[],
  },
} as const;

export interface CrickPart {
  id: number;
  outline: Pt[];
  shared: Pt[];
  outer: Pt[];
  axis: Pt;
  centre: Pt;
  halfLength: number;
  eaves: number;
  crown: number;
  /** the roof height above the ground at a point of the plan */
  roofHeight(p: Pt): number;
}
export interface CrickPlan {
  /** the building's OSM outline (hidden), and the two parts that replace it */
  outline: Pt[];
  parts: CrickPart[];
}

/**
 * Two barrel vaults side by side (they "interlock" [ADF]). Across a part the roof is a parabolic arch from the eaves on
 * one long side to the same height on the other, its crown 43 m [ADF] on the middle line; along it the crown sags by a
 * tenth towards the ends ("gently curved", ASSUMED). The arch is measured from the part's two long sides themselves (the
 * shared one and the outer one), so both parts meet exactly at the eaves on the valley between them.
 */
export function crickPlan(data: Pick<KxData, 'buildings'>): CrickPlan {
  const f = FIG.crick;
  const eaves = f.storeys * f.storeyHeight;
  const make = (src: (typeof CRICK_PARTS)['north' | 'south']): CrickPart => {
    const outline = cleanRing(src.outline);
    const { axis } = longAxis([...outline]);
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of outline) {
      lo = Math.min(lo, dot(p, axis));
      hi = Math.max(hi, dot(p, axis));
    }
    const centreU = (lo + hi) / 2;
    const halfLength = (hi - lo) / 2;
    const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length;
    const cz = outline.reduce((s, p) => s + p[1], 0) / outline.length;
    const shared = CRICK_SHARED;
    const outer = [...src.outer] as Pt[];
    const roofHeight = (p: Pt): number => {
      const dS = distToPolyline(p, shared);
      const dO = distToPolyline(p, outer);
      const sum = dS + dO;
      const across = sum < 1e-9 ? 0 : (4 * dS * dO) / (sum * sum);
      const along = 1 - f.lengthwise * ((dot(p, axis) - centreU) / halfLength) ** 2;
      return eaves + (f.crown - eaves) * across * along;
    };
    return { id: src.id, outline, shared: [...shared], outer, axis, centre: [cx, cz], halfLength, eaves, crown: f.crown, roofHeight };
  };
  return { outline: outlineOf(data, OSM.crick), parts: [make(CRICK_PARTS.north), make(CRICK_PARTS.south)] };
}

// ---- the British Library ------------------------------------------------------------------------

export interface LibraryTier {
  /** the outline of the walls of this tier, the height they start from and the height of their tops */
  ring: Pt[];
  base: number;
  top: number;
}
export interface LibraryPlan {
  outline: Pt[];
  /** the east block (Midland Road side, six storeys) and the west block (four storeys, stepped roofs) */
  east: Pt[];
  west: Pt[];
  cut: { origin: Pt; dir: Pt; normal: Pt };
  westEaves: number;
  eastEaves: number;
  eastRoof: GableRoof;
  /** the west block's two roofs: the outline each rises from (at `base`), the ring it climbs to (at `top`), the inset between them */
  steps: { outline: Pt[]; ring: Pt[]; inset: number; base: number; top: number }[];
  /** the walls of the upper storey between the two roofs */
  upper: LibraryTier;
  clock: { centre: Pt; side: number; height: number; corners: Pt[]; faces: { at: Pt; normal: Pt; dir: Pt }[] };
  /** the piazza front (the longest south-facing edge of the west block) and the gateway at its middle */
  front: Edge;
  gate: { at: Pt; dir: Pt; normal: Pt; width: number };
}

export function libraryPlan(data: Pick<KxData, 'buildings'>): LibraryPlan {
  const f = FIG.library;
  // the outline at the scale of a roof: its jogs of a few metres and one thin spike dropped, so the roofs can step inwards
  const outline = dropSharpTurns(simplifyRing(building(data, OSM.britishLibrary).pts, 5, 6));
  const near = nearestVertex(outline, f.cutNear);
  const far = nearestVertex(outline, f.cutFar);
  const d0: Pt = [far.point[0] - near.point[0], far.point[1] - near.point[1]];
  const dl = Math.hypot(d0[0], d0[1]);
  const dir: Pt = [d0[0] / dl, d0[1] / dl];
  const normal: Pt = dir[1] > 0 ? [dir[1], -dir[0]] : [-dir[1], dir[0]]; // points east
  const east = clipHalfPlane(outline, near.point, normal);
  const west = clipHalfPlane(outline, near.point, [-normal[0], -normal[1]]);
  const westEaves = f.westStoreys * f.storeyHeight;
  const eastEaves = f.eastStoreys * f.storeyHeight;
  // the first roof climbs from the eaves to a ring inside the walls; an upper storey stands on that ring (where the west
  // block is wide enough: its thin north wing keeps a single roof) and carries the second roof
  const rise = (inset: number): number => Math.min(f.maxStepRise, inset * Math.tan((f.roofPitch * Math.PI) / 180));
  const s1 = safeInset(west, f.stepInset);
  const top1 = westEaves + rise(s1.inset);
  const upperTop = top1 + f.upperStoreys * f.storeyHeight;
  const upperRing = simplifyRing(clipHalfPlane(s1.ring, [0, f.upperFromZ], [0, 1]), 4, 5);
  const s2 = safeInset(upperRing, f.stepInset);
  const steps = [
    { outline: west, ring: s1.ring, inset: s1.inset, base: westEaves, top: top1 },
    { outline: upperRing, ring: s2.ring, inset: s2.inset, base: upperTop, top: upperTop + rise(s2.inset) },
  ];
  // the clock tower: one bay square, inside the east block just north of the corner where the piazza meets it (ASSUMED)
  const c: Pt = [near.point[0] + normal[0] * 6 - dir[0] * 4, near.point[1] + normal[1] * 6 - dir[1] * 4];
  const h = f.clockSide / 2;
  const corner = (a: number, b: number): Pt => [c[0] + dir[0] * a * h + normal[0] * b * h, c[1] + dir[1] * a * h + normal[1] * b * h];
  // the faces: the south one (dir points south-east, so the south face is the one at +dir) carries the clock
  const faces = [
    { at: [c[0] + dir[0] * h, c[1] + dir[1] * h] as Pt, normal: dir, dir: [-normal[0], -normal[1]] as Pt },
    { at: [c[0] + normal[0] * h, c[1] + normal[1] * h] as Pt, normal, dir },
    { at: [c[0] - normal[0] * h, c[1] - normal[1] * h] as Pt, normal: [-normal[0], -normal[1]] as Pt, dir: [-dir[0], -dir[1]] as Pt },
    { at: [c[0] - dir[0] * h, c[1] - dir[1] * h] as Pt, normal: [-dir[0], -dir[1]] as Pt, dir: normal },
  ];
  // the piazza front: the longest edge of the west block that faces south (the entrance faces the piazza and Euston Road)
  const frontEdge = polygonEdges(west)
    .filter((e) => e.normal[1] > 0.7)
    .sort((a, b) => b.length - a.length)[0] as Edge;
  const gate = { at: frontEdge.mid, dir: frontEdge.dir, normal: frontEdge.normal, width: f.gateWidth };
  return {
    outline,
    east,
    west,
    cut: { origin: near.point, dir, normal },
    westEaves,
    eastEaves,
    eastRoof: gableRoof(east, eastEaves, f.eastRise),
    steps,
    upper: { ring: upperRing, base: top1, top: upperTop },
    clock: { centre: c, side: f.clockSide, height: f.clockHeight, corners: [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], faces },
    front: frontEdge,
    gate,
  };
}

// ---- the German Gymnasium -----------------------------------------------------------------------

export interface GymnasiumPlan {
  outline: Pt[];
  eaves: number;
  ridge: number;
  roof: GableRoof;
  /** the end wall that faces east (the one with five pointed windows above an oculus), if the outline has one */
  east: Edge | null;
  /** the ridge lantern: its two ends on the ridge line and its width */
  lantern: { a: Pt; b: Pt; width: number; base: number; top: number };
}

export function gymnasiumPlan(data: Pick<KxData, 'buildings'>): GymnasiumPlan {
  const f = FIG.gymnasium;
  const outline = simplifyRing(building(data, OSM.gymnasium).pts, 1.2, 4);
  const roof = gableRoof(outline, f.eaves, f.ridge - f.eaves);
  // the ridge runs along the axis through `origin`; it ends where that line leaves the outline
  const along = outline.map((p) => dot(p, roof.axis));
  const lo = Math.min(...along);
  const hi = Math.max(...along);
  const pointOnRidge = (t: number): Pt => [roof.origin[0] + roof.axis[0] * t, roof.origin[1] + roof.axis[1] * t];
  // pull the lantern in from the gable ends by a few metres so it sits wholly on the ridge
  const a = pointOnRidge(lo + (hi - lo) * 0.18);
  const b = pointOnRidge(hi - (hi - lo) * 0.18);
  let east: Edge | null = null;
  for (const e of polygonEdges(outline)) if (e.length >= 9 && e.normal[0] > 0.5 && (!east || e.normal[0] * e.length > east.normal[0] * east.length)) east = e;
  return { outline, eaves: f.eaves, ridge: f.ridge, roof, east, lantern: { a, b, width: f.lanternWidth, base: f.ridge, top: f.ridge + f.lantern } };
}

// ---- Platform 37, the landscraper ---------------------------------------------------------------

export interface LandscraperZone {
  ring: Pt[];
  storeys: number;
  height: number;
}
export interface Tree {
  x: number;
  y: number;
  z: number;
  /** crown size, metres */
  size: number;
}
export interface LandscraperPlan {
  outline: Pt[];
  axis: Pt;
  zones: LandscraperZone[];
  /** the lines where the roof steps: a point on each and the unit normal (pointing towards the taller zone) */
  cuts: { origin: Pt; normal: Pt }[];
  trees: Tree[];
}

export function landscraperPlan(data: Pick<KxData, 'buildings'>): LandscraperPlan {
  const f = FIG.landscraper;
  const outline = outlineOf(data, OSM.landscraper);
  const la = longAxis([...outline]);
  // the long axis points north (-z), so the zone list runs from the south (low) end to the north (high) end
  const axis: Pt = la.axis[1] > 0 ? [-la.axis[0], -la.axis[1]] : la.axis;
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of outline) {
    lo = Math.min(lo, dot(p, axis));
    hi = Math.max(hi, dot(p, axis));
  }
  const at = (t: number): Pt => [axis[0] * (lo + (hi - lo) * t), axis[1] * (lo + (hi - lo) * t)];
  const cuts = f.zoneCuts.map((t) => ({ origin: at(t), normal: axis }));
  const neg: Pt = [-axis[0], -axis[1]];
  const zones: LandscraperZone[] = [
    { ring: clipHalfPlane(outline, (cuts[0] as { origin: Pt }).origin, neg), storeys: f.zoneStoreys[0], height: f.zoneStoreys[0] * f.storeyHeight },
    { ring: clipHalfPlane(clipHalfPlane(outline, (cuts[0] as { origin: Pt }).origin, axis), (cuts[1] as { origin: Pt }).origin, neg), storeys: f.zoneStoreys[1], height: f.zoneStoreys[1] * f.storeyHeight },
    { ring: clipHalfPlane(outline, (cuts[1] as { origin: Pt }).origin, axis), storeys: f.zoneStoreys[2], height: f.zoneStoreys[2] * f.storeyHeight },
  ];
  // the roof garden: candidates on a jittered grid inside each roof (kept clear of the edge), then shared out over the
  // terraces by area, and the first `count` of each kept
  const r = rand(37);
  const side: Pt = [-axis[1], axis[0]];
  const cands = zones.map((z): Pt[] => {
    const cand: Pt[] = [];
    let zlo = Infinity;
    let zhi = -Infinity;
    let vlo = Infinity;
    let vhi = -Infinity;
    for (const p of z.ring) {
      zlo = Math.min(zlo, dot(p, axis));
      zhi = Math.max(zhi, dot(p, axis));
      vlo = Math.min(vlo, dot(p, side));
      vhi = Math.max(vhi, dot(p, side));
    }
    for (let a = zlo + f.treeSpacing / 2; a < zhi; a += f.treeSpacing) {
      for (let b = vlo + f.treeSpacing / 2; b < vhi; b += f.treeSpacing) {
        const aa = a + (r() - 0.5) * f.treeSpacing * 0.3;
        const bb = b + (r() - 0.5) * f.treeSpacing * 0.3;
        const p: Pt = [axis[0] * aa + side[0] * bb, axis[1] * aa + side[1] * bb];
        if (pointInPolygon(p, z.ring) && distToRing(p, z.ring) >= f.treeInset) cand.push(p);
      }
    }
    for (let k = cand.length - 1; k > 0; k--) {
      // a seeded shuffle, so the trees kept are spread over the roof, not bunched at one end
      const j = Math.floor(r() * (k + 1));
      [cand[k], cand[j]] = [cand[j] as Pt, cand[k] as Pt];
    }
    return cand;
  });
  // shared out over the terraces by area; a terrace short of sites hands its share on, so the count is exactly f.trees
  const total = zones.reduce((s, z) => s + polygonArea(z.ring), 0);
  const take = zones.map((z, i) => Math.min((cands[i] as Pt[]).length, Math.round((f.trees * polygonArea(z.ring)) / total)));
  let short: number = f.trees - take.reduce((s, n) => s + n, 0);
  for (let i = 0; i < zones.length && short !== 0; i++) {
    const room = (cands[i] as Pt[]).length - (take[i] as number);
    const add = short > 0 ? Math.min(short, room) : Math.max(short, -(take[i] as number));
    take[i] = (take[i] as number) + add;
    short -= add;
  }
  const trees: Tree[] = [];
  zones.forEach((z, i) => {
    for (const p of (cands[i] as Pt[]).slice(0, take[i] as number)) trees.push({ x: p[0], y: z.height, z: p[1], size: 3.2 + r() * 2.8 });
  });
  return { outline, axis, zones, cuts, trees };
}
