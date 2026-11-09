// The buildings around King's Cross and the tunnel mouths north of the throat, as numbers: which OSM outline is which building, how its
// facade divides into bays, where the St Pancras train shed stands, and where the Gasworks and Copenhagen tunnel mouths are. Pure functions,
// no three.js, so the rules are testable without a browser; the web modules (web/src/landmarks.ts, portals.ts) turn the numbers into meshes.
//
// Frame: x east, z south, metres (core/geo.ts). Heights are metres above the model's one ground level.
//
// References (all read 2026-11-08). Each is repeated where its figure is used.
//   [HE-GNH]  Historic England 1113244, Great Northern Hotel (Grade II), as mirrored by
//             https://britishlistedbuildings.co.uk/101113244-great-northern-hotel-and-attached-railings-st-pancras-and-somers-town-ward
//             1854, Lewis Cubitt; yellow stock brick, stucco dressings; slate roof with pedimented dormers; 5 storeys plus attic and basement,
//             18 windows wide, the southern return 5; the sixth and thirteenth bays slightly advanced; round-arched ground floor openings with
//             stucco keystones, square-headed windows above; modillion cornice; "Crescent shaped building. Concave main facade towards King's Cross Station."
//   [HE-STP]  Historic England 1342037, St Pancras Station and former Midland Grand Hotel (Grade I),
//             https://britishlistedbuildings.co.uk/101342037-st-pancras-station-and-former-midland-grand-hotel-st-pancras-and-somers-town-ward
//             "4 main storeys with 2 extra storeys in the roof", gabled dormers; "Deep red Gripper's patent Nottingham bricks", Ancaster stone
//             dressings; "23 windows flanked by towers and a curved 10 window wing to the west"; the "South-east tower" has gabled clocks on each
//             face, corner pinnacles and a spire; the "Left hand tower" 3 storeys of arcaded windows above the main entrance; "25-bay train shed
//             a single 240 foot span", pointed-arch ribs, Butterley Iron Company, 1867.
//   [WP-STP]  Wikipedia, "St Pancras railway station": Barlow shed 245 ft 6 in (74.83 m) wall to wall, 240 ft (73.2 m) wide, 689 ft (210 m)
//             long, 100 ft (30.5 m) high at the apex above the tracks; 24 ribs, one every 29 ft 4 in (8.94 m); the arch is slightly pointed and
//             springs from station level; glass covers the middle half of the roof, timber and slate the outer quarters; the platforms sit 20 ft
//             (6 m) above street level.
//   [WP-MGH]  Wikipedia, "St Pancras Renaissance London Hotel": clock tower 76 m (249 ft). exploring-london.com gives 82 m (west tower 76 m),
//             gilbertscott.org 280 ft = 85.3 m, other sites 72-76 m: the sources disagree. The model takes 82 m, the most repeated figure and the
//             graphical-fidelity rubric's (82 m +/- 4), and marks the west tower ASSUMED (refs/DIMENSIONS.md section 4).
//   [NSC-EXT] New Steel Construction, "Rebirth of St Pancras" (newsteelconstruction.com/wp/rebirth-of-st-pancras/): the 2007 extension is "a new
//             200m long steel canopy", "three spans across the tracks and seven 30m bays longitudinally", a flat roof "subservient to the Barlow
//             Shed" (the arch was rejected: the extension is much wider than the old station), on "four lines of 2.6m deep Warren trusses" with
//             Vierendeel girders across, a "saw-tooth roof profile curving from the top of each girder to the bottom of the next"; the main roof
//             "stops 22m short of the gable end of the Barlow Shed", the gap closed by a shallower transition roof of "pyramids of glass" on a
//             grillage of 1.1m plate girders hung from the Barlow arch. Heights are not published: ASSUMED below.
//   [WP-GAS]  Wikipedia, "Gasworks Tunnel": three bores, each 528 yd (483 m), between 0 mi 22 ch and 0 mi 46 ch from King's Cross;
//             "circular portals decorated with a cornice and voussoir".
//   [WP-COP]  Wikipedia, "Copenhagen Tunnel": three twin-track bores, 594 yd (543 m), between 0 mi 65 ch and 1 mi 12 ch from King's Cross;
//             two bores carry trains, the eastern one does not.
import type { Pt } from './geo.ts';
import type { KxData, Rail } from './osm.ts';
import { FT, pointInPolygon } from './station.ts';
import { seatY } from './terrain.ts';
import type { Terrain } from './terrain.ts';

export { pointInPolygon };

// ---- identities --------------------------------------------------------------------------------

/** The OSM building outlines these models replace. Pass them to buildingPrisms() as the exclusion set. */
export const OSM_IDS = {
  greatNorthernHotel: 46821177,
  midlandGrandHotel: 15694166,
  stPancrasStation: 4256246,
} as const;
export const REPLACED_BUILDING_IDS: readonly number[] = [OSM_IDS.greatNorthernHotel, OSM_IDS.midlandGrandHotel, OSM_IDS.stPancrasStation];

const YARD = 0.9144;
const CHAIN = 22 * FT * 3; // one chain is 22 yd = 20.1168 m

/** Published figures. `ASSUMED` ones are marked in a comment and have no source. */
export const FIGURES = {
  gnh: {
    mainBays: 18, // [HE-GNH] "18 windows wide"
    returnBays: 5, // [HE-GNH] "southern return is 5 windows wide"; the north-west end is ASSUMED to match
    storeys: 5, // [HE-GNH] "5 storeys plus attic"; OSM building:levels = 5
    groundStorey: 4.5, // ASSUMED: tall ground floor with round-arched openings
    upperStorey: 3.7, // ASSUMED
    roofRise: 4.8, // ASSUMED: slate attic roof with pedimented dormers
    roofInset: 3.2, // ASSUMED
  },
  midland: {
    clockTowerHeight: 82, // [WP-MGH] note: 82 m is exploring-london.com's figure and the rubric's (82 +/- 4); Wikipedia says 76 m
    westTowerHeight: 56, // ASSUMED (sources conflict: 76 m on exploring-london.com)
    towerSide: 10.4, // ASSUMED plan of the clock tower
    westTowerSide: 10.8, // ASSUMED
    eaves: 22, // ASSUMED: 4 main storeys [HE-STP] of about 5.5 m
    roofRise: 12, // ASSUMED: 2 extra storeys in the roof [HE-STP]
    roofInset: 7.5, // ASSUMED: the longest run a roof facet may have (the old uniform inset)
    roofDepthShare: 0.4, // ASSUMED: a facet runs at most this share of the building's local depth, so two opposite facets leave a ridge between them
    roofMinRun: 1.0, // ASSUMED: a facet is not squeezed below this run (85 degrees) until its neighbours have given way
    frontBays: 23, // [HE-STP] "23 windows flanked by towers"
    wingBays: 10, // [HE-STP] "a curved 10 window wing to the west"
  },
  barlow: {
    spanWall: 245.5 * (FT), // [WP-STP] 245 ft 6 in = 74.83 m wall to wall
    span: 240 * FT, // [WP-STP] / [HE-STP] 240 ft = 73.15 m between the rib springings
    length: 689 * FT, // [WP-STP] 689 ft = 210.0 m
    rise: 100 * FT, // [WP-STP] 100 ft = 30.48 m above the tracks (OSM carries height=30.5)
    ribSpacing: 29 * FT + 4 * (FT / 12), // [WP-STP] 29 ft 4 in = 8.94 m
    ribs: 24, // [WP-STP]
    // ASSUMED: "slightly pointed" [WP-STP]; the arc centres sit 4 m across the axis. hist-d2's end screen drops 0.5, 1.5, 3.4 and 4.9 m from the crown at 4.4, 8, 13.3 and
    // 16.8 m out (scaled from the 73.15 m span): a round arch is off by 0.73 m rms, offsets of 2, 3, 4, 6 and 8 m by 0.26, 0.10, 0.22, 0.59 and 0.93 m.
    pointOffset: 4,
    glassFraction: 0.5, // [WP-STP] glass covers the middle half of the roof
    undercroftRise: 6, // [WP-STP] platforms 20 ft above the street; NOT modelled (one ground level)
    // The 2007 extension [NSC-EXT]. Heights are ASSUMED, scaled from hist-e (the roof) and hist-d2 (the screen).
    transition: 22, // [NSC-EXT] the main roof stops 22 m short of the Barlow gable
    bays: 7, // [NSC-EXT] seven 30 m bays; the outline's length is shared out among them
    teeth: 2, // ASSUMED: saw-teeth to a bay (hist-e: about nine rows in some 130 m)
    truss: 2.6, // [NSC-EXT] 2.6 m Warren trusses: a tooth climbs one truss depth
    girder: 1.1, // [NSC-EXT] the transition's plate girders
    screenFoot: 12, // ASSUMED: the end screen's glazing starts where the transition roof meets it (hist-d2: about 18 m of glass under the crown)
    pyramid: 1.5, // ASSUMED: rise of a glass pyramid of the transition roof
  },
  tunnel: {
    boreWidth: 8.0, // ASSUMED internal width of a twin-track Victorian bore (OSM track spacing is 3.1-4.3 m)
    crown: 6.2, // ASSUMED crown height above the rail head
    parapet: 7.9, // ASSUMED top of the portal wall above the rail head
    gasworksLength: 528 * YARD, // [WP-GAS] 483 m
    gasworksSouthChainage: 22 * CHAIN, // [WP-GAS] 0 mi 22 ch = 442.6 m
    gasworksNorthChainage: 46 * CHAIN, // [WP-GAS] 0 mi 46 ch = 925.4 m
    copenhagenSouthChainage: 65 * CHAIN, // [WP-COP] 0 mi 65 ch = 1307.6 m
    copenhagenLength: 594 * YARD, // [WP-COP] 543 m
  },
} as const;

// ---- 2-D polygon helpers -----------------------------------------------------------------------

/** Twice the signed area in the (x, z) plane; positive when the points run clockwise on a north-up map. */
export function area2(pts: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i] as Pt;
    const b = pts[(i + 1) % pts.length] as Pt;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s;
}

export interface Edge {
  /** index of the first vertex; the edge runs to vertex (i + 1) % n */
  i: number;
  a: Pt;
  b: Pt;
  length: number;
  /** unit direction a -> b */
  dir: Pt;
  /** unit outward normal, whichever way the polygon is wound */
  normal: Pt;
  mid: Pt;
}

export function polygonEdges(pts: readonly Pt[]): Edge[] {
  const sign = Math.sign(area2(pts)) || 1;
  const out: Edge[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i] as Pt;
    const b = pts[(i + 1) % pts.length] as Pt;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    const dir: Pt = length === 0 ? [1, 0] : [dx / length, dz / length];
    out.push({ i, a, b, length, dir, normal: sign > 0 ? [dir[1], -dir[0]] : [-dir[1], dir[0]], mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] });
  }
  return out;
}

/** Signed turn in degrees at each vertex (incoming edge to outgoing edge); the sign is `area2`'s: convex corners share the polygon's sign. */
export function turnAngles(pts: readonly Pt[]): number[] {
  const n = pts.length;
  const sign = Math.sign(area2(pts)) || 1;
  return pts.map((q, i) => {
    const p = pts[(i + n - 1) % n] as Pt;
    const r = pts[(i + 1) % n] as Pt;
    const d1: Pt = [q[0] - p[0], q[1] - p[1]];
    const d2: Pt = [r[0] - q[0], r[1] - q[1]];
    return (sign * Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]) * 180) / Math.PI;
  });
}

export interface Chain {
  /** vertex indices from the first corner to the last, in polygon order */
  vertices: number[];
  edges: Edge[];
  length: number;
  /** sum of the signed turns at the inner vertices, degrees: negative for a concave run, positive for a convex one */
  turning: number;
}

/**
 * Split an outline into runs of edges between sharp corners (a turn over `minTurnDeg`). A facade
 * turns a corner there; a curved facade only bends a few degrees at each vertex.
 */
export function splitAtCorners(pts: readonly Pt[], minTurnDeg = 60): Chain[] {
  const edges = polygonEdges(pts);
  const turns = turnAngles(pts);
  const n = pts.length;
  const corners = turns.map((t, i) => (Math.abs(t) >= minTurnDeg ? i : -1)).filter((i) => i >= 0);
  if (corners.length === 0) return [];
  const chains: Chain[] = [];
  for (let c = 0; c < corners.length; c++) {
    const start = corners[c] as number;
    const end = corners[(c + 1) % corners.length] as number;
    const vertices = [start];
    const run: Edge[] = [];
    let v = start;
    do {
      run.push(edges[v] as Edge);
      v = (v + 1) % n;
      vertices.push(v);
    } while (v !== end);
    chains.push({ vertices, edges: run, length: run.reduce((s, e) => s + e.length, 0), turning: vertices.slice(1, -1).reduce((s, i) => s + (turns[i] as number), 0) });
  }
  return chains;
}

/**
 * The run of consecutive edges, each bearing within `tolDeg` of the run's first edge, with the greatest
 * total length. (Not seeded by the single longest edge: that may stand alone.)
 */
export function longestStraightRun(pts: readonly Pt[], tolDeg = 12): { start: number; edges: Edge[]; length: number } {
  const edges = polygonEdges(pts);
  const n = edges.length;
  const bearing = (e: Edge): number => Math.atan2(e.dir[1], e.dir[0]);
  const within = (a: Edge, b: Edge): boolean => {
    const d = bearing(a) - bearing(b);
    return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) <= (tolDeg * Math.PI) / 180;
  };
  let best: { start: number; edges: Edge[]; length: number } = { start: 0, edges: [], length: 0 };
  for (let s = 0; s < n; s++) {
    const first = edges[s] as Edge;
    const run: Edge[] = [first];
    for (let k = 1; k < n; k++) {
      const e = edges[(s + k) % n] as Edge;
      if (!within(e, first)) break;
      run.push(e);
    }
    const length = run.reduce((t, e) => t + e.length, 0);
    if (length > best.length) best = { start: s, edges: run, length };
  }
  return best;
}

/** True when two non-adjacent edges of the closed ring cross. */
export function ringSelfIntersects(pts: readonly Pt[]): boolean {
  const n = pts.length;
  const cross = (o: Pt, a: Pt, b: Pt): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  for (let i = 0; i < n; i++) {
    const a = pts[i] as Pt;
    const b = pts[(i + 1) % n] as Pt;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = pts[j] as Pt;
      const d = pts[(j + 1) % n] as Pt;
      if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return true;
    }
  }
  return false;
}

/** Offset every edge inward by `d` metres (mitred corners). Independent of the winding. */
export function insetPolygon(pts: readonly Pt[], d: number): Pt[] {
  const edges = polygonEdges(pts);
  const n = pts.length;
  return pts.map((p, i) => {
    const n1 = (edges[(i + n - 1) % n] as Edge).normal;
    const n2 = (edges[i] as Edge).normal;
    const k = Math.max(0.3, 1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [p[0] - (d * (n1[0] + n2[0])) / k, p[1] - (d * (n1[1] + n2[1])) / k] as Pt;
  });
}

/**
 * The deepest inset up to `d` that keeps the ring simple and every edge pointing the way it did:
 * thin wings of an outline get a shallower roof than the fat middle would allow.
 */
export function safeInset(pts: readonly Pt[], d: number): { ring: Pt[]; inset: number } {
  const edges = polygonEdges(pts);
  for (let k = 0; k < 12; k++) {
    const inset = d * 0.8 ** k;
    const ring = insetPolygon(pts, inset);
    const ok = !ringSelfIntersects(ring) && Math.sign(area2(ring)) === Math.sign(area2(pts)) && ring.every((q, i) => {
      const r = ring[(i + 1) % ring.length] as Pt;
      const e = edges[i] as Edge;
      return (r[0] - q[0]) * e.dir[0] + (r[1] - q[1]) * e.dir[1] > 0.05;
    });
    if (ok) return { ring, inset };
  }
  return { ring: [...pts] as Pt[], inset: 0 };
}

/**
 * Offset edge i inward by `runs[i]`, each its own distance, with mitred corners: the ring at the top of a roof whose facets
 * have a pitch of their own. Every ring edge stays parallel to its eaves edge, so a facet (eaves edge, ring edge) is flat.
 * Independent of the winding.
 */
export function insetPolygonRuns(pts: readonly Pt[], runs: readonly number[]): Pt[] {
  const edges = polygonEdges(pts);
  const n = pts.length;
  return pts.map((p, i) => {
    const e0 = edges[(i + n - 1) % n] as Edge;
    const e1 = edges[i] as Edge;
    const r0 = runs[(i + n - 1) % n] as number;
    const r1 = runs[i] as number;
    const det = e0.normal[0] * e1.normal[1] - e0.normal[1] * e1.normal[0];
    // straight on (to a twentieth of a degree): one offset serves both (fitRoofRuns gives such neighbours the same run)
    if (Math.abs(det) < 1e-3) return [p[0] - (e1.normal[0] * (r0 + r1)) / 2, p[1] - (e1.normal[1] * (r0 + r1)) / 2] as Pt;
    // the point r0 inside edge i-1's line and r1 inside edge i's
    return [p[0] + (r1 * e0.normal[1] - r0 * e1.normal[1]) / det, p[1] + (r0 * e1.normal[0] - r1 * e0.normal[0]) / det] as Pt;
  });
}

/** How far the building reaches in from the middle of edge `i`: along the inward normal to the nearest other edge. */
export function edgeDepth(edges: readonly Edge[], i: number): number {
  const e = edges[i] as Edge;
  const o: Pt = [e.mid[0] - e.normal[0] * 0.05, e.mid[1] - e.normal[1] * 0.05];
  const d: Pt = [-e.normal[0], -e.normal[1]];
  let best = Infinity;
  for (const f of edges) {
    if (f.i === i) continue;
    // o + t d = f.a + s f.dir
    const det = d[1] * f.dir[0] - d[0] * f.dir[1];
    if (Math.abs(det) < 1e-9) continue;
    const rx = f.a[0] - o[0];
    const rz = f.a[1] - o[1];
    const t = (f.dir[0] * rz - f.dir[1] * rx) / det;
    const s = (d[0] * rz - d[1] * rx) / det;
    if (t > 0.01 && s >= -1e-6 && s <= f.length + 1e-6) best = Math.min(best, t);
  }
  return best + 0.05;
}

/**
 * A roof ring with a run of its own for each facet, as near `want[i]` as the outline allows. Edges turning by no more than `joinDeg` degrees make a chain,
 * one roof whose facets share a run (the least wanted along it), so a curved front keeps one pitch; a lone short edge is held to 0.8 of its length. Where
 * facets collide the chains involved give way by a sixth at a time down to `floor`, then their neighbours, until the ring is simple, every edge points
 * the way it did and the ring lies inside the outline. Never throws: an outline that cannot take a roof gets no ring (every run 0).
 */
export function fitRoofRuns(pts: readonly Pt[], want: readonly number[], floor = 0.3, joinDeg = 45): { ring: Pt[]; runs: number[] } {
  const n = pts.length;
  const edges = polygonEdges(pts);
  const outline: Pt[] = [...pts];
  const owner = Array.from({ length: n }, (_, i) => i);
  const root = (i: number): number => (owner[i] === i ? i : (owner[i] = root(owner[i] as number)));
  for (let i = 0; i < n; i++) {
    const a = (edges[(i + n - 1) % n] as Edge).normal;
    const b = (edges[i] as Edge).normal;
    if (Math.abs((Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]) * 180) / Math.PI) <= joinDeg) owner[root(i)] = root((i + n - 1) % n);
  }
  const chains = new Map<number, number[]>();
  for (let i = 0; i < n; i++) chains.set(root(i), [...(chains.get(root(i)) ?? []), i]);
  const chainOf = (i: number): number[] => chains.get(root(i)) as number[];
  const runs: number[] = new Array<number>(n).fill(0);
  for (const members of chains.values()) {
    const r = Math.min(...members.map((i) => Math.max(0, want[i] as number)), members.length === 1 ? 0.8 * (edges[members[0] as number] as Edge).length : Infinity);
    for (const i of members) runs[i] = r;
  }
  const cross = (o: Pt, a: Pt, b: Pt): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const trouble = (ring: readonly Pt[]): Set<number> => {
    const bad = new Set<number>();
    for (let i = 0; i < n; i++) {
      const a = ring[i] as Pt;
      const b = ring[(i + 1) % n] as Pt;
      const e = edges[i] as Edge;
      if ((b[0] - a[0]) * e.dir[0] + (b[1] - a[1]) * e.dir[1] <= 0.3) bad.add(i); // folded over or collapsed
      if (!pointInPolygon(a, outline)) bad.add(i).add((i + n - 1) % n);
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        const c = ring[j] as Pt;
        const d = ring[(j + 1) % n] as Pt;
        if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) bad.add(i).add(j);
      }
    }
    return bad;
  };
  const give = (i: number, least: number): void => {
    const r = Math.max(least, (runs[i] as number) * 0.85);
    for (const j of chainOf(i)) runs[j] = r;
  };
  for (let k = 0; k < 80; k++) {
    const ring = insetPolygonRuns(pts, runs);
    const bad = trouble(ring);
    if (bad.size === 0 && Math.sign(area2(ring)) === Math.sign(area2(pts))) return { ring, runs };
    const squeezable = [...bad].filter((i) => (runs[i] as number) > floor);
    if (squeezable.length) for (const i of squeezable) give(i, floor);
    else for (const i of bad) for (const j of [(i + n - 1) % n, (i + 1) % n]) give(j, 0.1);
  }
  return { ring: [...pts] as Pt[], runs: pts.map(() => 0) };
}

/** Share `total` bays over runs of the given lengths in proportion (largest remainder), so the sum is exactly `total`. */
export function allocateBays(lengths: readonly number[], total: number): number[] {
  const sum = lengths.reduce((s, l) => s + l, 0);
  if (sum === 0) return lengths.map(() => 0);
  const exact = lengths.map((l) => (l / sum) * total);
  const out = exact.map(Math.floor);
  let left = total - out.reduce((s, x) => s + x, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((p, q) => q.r - p.r);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i] = (out[i] as number) + 1;
    left--;
  }
  return out;
}

/** Bay centres along a chain of edges: bays are shared over the edges by length, centred in their share of each edge. */
export interface BayPosition {
  edge: number;
  /** the point on the wall at the middle of the bay */
  at: Pt;
  dir: Pt;
  normal: Pt;
  /** width of the bay along the wall, metres */
  width: number;
}
export function chainBays(edges: readonly Edge[], total: number): BayPosition[] {
  const counts = allocateBays(edges.map((e) => e.length), total);
  const out: BayPosition[] = [];
  edges.forEach((e, k) => {
    const n = counts[k] as number;
    for (let j = 0; j < n; j++) {
      const t = (j + 0.5) / n;
      out.push({ edge: e.i, at: [e.a[0] + e.dir[0] * e.length * t, e.a[1] + e.dir[1] * e.length * t], dir: e.dir, normal: e.normal, width: e.length / n });
    }
  });
  return out;
}

const building = (data: Pick<KxData, 'buildings'>, id: number) => {
  const b = data.buildings.find((x) => x.id === id);
  if (!b) throw new Error(`OSM building ${id} is not in the data`);
  return b;
};

// ---- the Great Northern Hotel ------------------------------------------------------------------

export type HotelFaceKind = 'main' | 'rear' | 'return' | 'end';
export interface HotelFace {
  kind: HotelFaceKind;
  chain: Chain;
  bays: BayPosition[];
}
export interface HotelPlan {
  id: number;
  outline: Pt[];
  faces: HotelFace[];
  /** the facade to the eaves, metres */
  eaves: number;
  ridge: number;
  groundStorey: number;
  upperStorey: number;
  storeys: number;
  roof: { ring: Pt[]; inset: number };
}

/**
 * The crescent. Its four corners are right angles, so the outline splits into four runs: the two long
 * arcs (the concave one faces the station, the convex one faces Pancras Road) and the two ends. The
 * southern end is the "southern return". Bays follow [HE-GNH]: 18 on the concave arc, 5 on the return.
 */
export function greatNorthernHotelPlan(data: Pick<KxData, 'buildings'>): HotelPlan {
  const b = building(data, OSM_IDS.greatNorthernHotel);
  const chains = splitAtCorners(b.pts);
  if (chains.length !== 4) throw new Error(`the Great Northern Hotel outline should have 4 corners, found ${chains.length}`);
  const byLength = [...chains].sort((p, q) => q.length - p.length);
  const longs = byLength.slice(0, 2);
  const concave = longs.reduce((best, c) => (c.turning < best.turning ? c : best));
  const convex = longs.find((c) => c !== concave) as Chain;
  const ends = byLength.slice(2).sort((p, q) => meanZ(q) - meanZ(p));
  const f = FIGURES.gnh;
  const bayWidth = concave.length / f.mainBays;
  const face = (kind: HotelFaceKind, chain: Chain, total: number): HotelFace => ({ kind, chain, bays: chainBays(chain.edges, total) });
  const faces = [
    face('main', concave, f.mainBays),
    face('rear', convex, Math.round(convex.length / bayWidth)),
    face('return', ends[0] as Chain, f.returnBays),
    face('end', ends[1] as Chain, f.returnBays),
  ];
  const eaves = f.groundStorey + (f.storeys - 1) * f.upperStorey;
  const roof = safeInset(b.pts, f.roofInset);
  return { id: b.id, outline: b.pts, faces, eaves, ridge: eaves + f.roofRise, groundStorey: f.groundStorey, upperStorey: f.upperStorey, storeys: f.storeys, roof };
}
const meanZ = (c: Chain): number => c.edges.reduce((s, e) => s + e.mid[1], 0) / c.edges.length;

// ---- the St Pancras Renaissance (Midland Grand) Hotel ------------------------------------------

export interface TowerPlan {
  name: 'clock' | 'west';
  /** centre of the square base */
  centre: Pt;
  side: number;
  height: number;
  /** unit vector along the front, pointing west */
  along: Pt;
  /** unit vector out of the front, toward Euston Road */
  out: Pt;
}
export interface MidlandPlan {
  id: number;
  outline: Pt[];
  /** the Euston Road front: the longest straight run of the outline */
  front: { edges: Edge[]; length: number; east: Pt; west: Pt; bays: BayPosition[] };
  /** the curved wing that continues the front to the west */
  wing: { edges: Edge[]; bays: BayPosition[] };
  towers: TowerPlan[];
  eaves: number;
  ridge: number;
  /**
   * The roof: facet i runs from the eaves along outline edge i to the ring edge i at the ridge height, `runs[i]` metres in
   * (so its pitch is atan(rise / runs[i])). `inset` is the front's run, the roof's own proportions.
   */
  roof: { ring: Pt[]; inset: number; runs: number[] };
}

/**
 * The Midland Grand's Euston Road front is the longest straight run of its outline. The clock tower
 * ("south-east tower" in [HE-STP]) stands at its east end and the entrance tower at its west end; the
 * curved wing carries on beyond. Tower plans are ASSUMED squares set inside the outline.
 */
export function midlandGrandPlan(data: Pick<KxData, 'buildings'>): MidlandPlan {
  const b = building(data, OSM_IDS.midlandGrandHotel);
  const run = longestStraightRun(b.pts, 12);
  const first = run.edges[0] as Edge;
  const last = run.edges[run.edges.length - 1] as Edge;
  // along the front toward the west: the run is wound from the east end to the west end on this outline,
  // but do not rely on it
  const eastFirst = first.a[0] > last.b[0];
  const east = eastFirst ? first.a : last.b;
  const west = eastFirst ? last.b : first.a;
  const dx = west[0] - east[0];
  const dz = west[1] - east[1];
  const l = Math.hypot(dx, dz);
  const along: Pt = [dx / l, dz / l];
  const meanNormal = run.edges.reduce((s, e) => [s[0] + e.normal[0] * e.length, s[1] + e.normal[1] * e.length] as Pt, [0, 0] as Pt);
  const nl = Math.hypot(meanNormal[0], meanNormal[1]);
  const out: Pt = [meanNormal[0] / nl, meanNormal[1] / nl];
  const m = FIGURES.midland;
  const clockHalf = m.towerSide / 2;
  const westHalf = m.westTowerSide / 2;
  // 0.3 m proud of the front so the tower faces never share a plane with the facade
  const towers: TowerPlan[] = [
    { name: 'clock', side: m.towerSide, height: m.clockTowerHeight, along, out, centre: [east[0] + along[0] * (clockHalf + 2) - out[0] * (clockHalf - 0.3), east[1] + along[1] * (clockHalf + 2) - out[1] * (clockHalf - 0.3)] },
    { name: 'west', side: m.westTowerSide, height: m.westTowerHeight, along, out, centre: [west[0] - along[0] * (westHalf - 2.5) - out[0] * (westHalf - 0.3), west[1] - along[1] * (westHalf - 2.5) - out[1] * (westHalf - 0.3)] },
  ];
  // the wing: the edges that follow the run, bending away to the south-west, up to the next sharp corner
  const n = b.pts.length;
  const edges = polygonEdges(b.pts);
  const startAfter = (run.start + run.edges.length) % n;
  const wingEdges: Edge[] = [];
  for (let k = 0, i = startAfter; k < 8; k++, i = (i + 1) % n) {
    const e = edges[i] as Edge;
    wingEdges.push(e);
    if (e.length < 3) break;
  }
  // The roof: one steep pitch the whole length of the front, set by its thinnest place so the two slopes leave a ridge (hist-b, hist-e: slate at about
  // 60 degrees with a narrow crown; ASSUMED). Elsewhere each facet takes the run its own depth allows, never more than the front's.
  const frontRun = Math.min(m.roofInset, m.roofDepthShare * Math.min(...run.edges.map((e) => edgeDepth(edges, e.i))));
  const want = edges.map((e) => Math.max(m.roofMinRun, Math.min(frontRun, m.roofDepthShare * edgeDepth(edges, e.i))));
  const fit = fitRoofRuns(b.pts, want, m.roofMinRun);
  return {
    id: b.id,
    outline: b.pts,
    front: { edges: run.edges, length: run.length, east, west, bays: chainBays(run.edges, m.frontBays) },
    wing: { edges: wingEdges, bays: chainBays(wingEdges, m.wingBays) },
    towers,
    eaves: m.eaves,
    ridge: m.eaves + m.roofRise,
    roof: { ring: fit.ring, inset: fit.runs[first.i] as number, runs: fit.runs },
  };
}

// ---- the St Pancras train shed -----------------------------------------------------------------

export interface BarlowPlan {
  id: number;
  /** direction the platforms run, radians clockwise from north: use with shedToWorld/worldToShed */
  heading: number;
  /** world position of the south-west corner of the vault footprint at v = 0 (the south wall) */
  origin: Pt;
  /** footprint width, wall to wall [WP-STP] */
  width: number;
  /** span between the rib springings [WP-STP] */
  span: number;
  /** crown above the tracks [WP-STP] */
  rise: number;
  /** length of the Barlow shed proper [WP-STP]; the extension (a flat saw-tooth roof, not the arch) carries on to the OSM outline's north end */
  barlowLength: number;
  /** length of the whole vault: Barlow shed plus the northern extension, to the OSM outline's end */
  length: number;
  /** v of each of the Barlow shed's 24 ribs; the extension has none */
  ribs: number[];
  /** length of each of the extension's seven bays: what the outline leaves after the shed and the transition, shared out [NSC-EXT] */
  bay: number;
}

/** Heading of the St Pancras platforms 5-10: the weighted mean of their long axes (they run the full length). */
export function stPancrasHeading(data: Pick<KxData, 'platforms'>): number {
  let sx = 0;
  let sz = 0;
  for (const p of data.platforms) {
    if (p.ref === undefined || (p.layer ?? 0) <= 0 || !['5', '6', '7', '8', '9', '10'].includes(p.ref)) continue;
    const axis = principalAxis(p.pts);
    const sgn = axis[1] < 0 ? 1 : -1; // point north
    sx += sgn * axis[0];
    sz += sgn * axis[1];
  }
  if (sx === 0 && sz === 0) throw new Error('no St Pancras platforms 5-10 to take a heading from');
  return Math.atan2(sx, -sz);
}
/** Unit long axis of a thin polygon: the mean direction of its longest edges. */
function principalAxis(pts: Pt[]): Pt {
  const edges = polygonEdges(pts).sort((a, b) => b.length - a.length).slice(0, 2);
  let sx = 0;
  let sz = 0;
  for (const e of edges) {
    const s = e.dir[1] < 0 ? 1 : -1;
    sx += s * e.dir[0] * e.length;
    sz += s * e.dir[1] * e.length;
  }
  const l = Math.hypot(sx, sz);
  return [sx / l, sz / l];
}

/**
 * Place the Barlow vault on the OSM outline: the platforms give the heading, the outline the south wall, the north end and the east wall. The outline
 * is far wider than the shed (it takes in the hotel's west annexe and the 2007 extension), so the shed hangs from its east edge 40 m in from the south
 * wall, the shed's outer face; the west wall is one wall-to-wall width [WP-STP] to the west. The south wall is the length-weighted mean of the
 * outline's long east-west edges at its south end.
 */
export function barlowPlan(data: Pick<KxData, 'buildings' | 'platforms'>): BarlowPlan {
  const b = building(data, OSM_IDS.stPancrasStation);
  const heading = stPancrasHeading(data);
  const frame = { origin: [0, 0] as Pt, heading };
  const pts = b.pts.map((p) => worldToFrame(frame, p));
  const vMin = Math.min(...pts.map((p) => p.v));
  const vMax = Math.max(...pts.map((p) => p.v));
  // the south wall: edges running (nearly) across the shed within 10 m of the southernmost point
  let weight = 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i] as { u: number; v: number };
    const q = pts[(i + 1) % pts.length] as { u: number; v: number };
    const du = Math.abs(q.u - p.u);
    if (Math.max(p.v, q.v) < vMin + 10 && Math.abs(q.v - p.v) < 0.1 * du) {
      weight += du;
      sum += ((p.v + q.v) / 2) * du;
    }
  }
  const vSouth = weight > 0 ? sum / weight : vMin;
  // the east edge of the outline 40 m in from the south wall
  const cut = vSouth + 40;
  let east = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i] as { u: number; v: number };
    const q = pts[(i + 1) % pts.length] as { u: number; v: number };
    if ((p.v <= cut && q.v > cut) || (q.v <= cut && p.v > cut)) east = Math.max(east, p.u + ((cut - p.v) / (q.v - p.v)) * (q.u - p.u));
  }
  if (!Number.isFinite(east)) throw new Error('the St Pancras outline does not reach 40 m from its south wall');
  const f = FIGURES.barlow;
  const u0 = east - f.spanWall;
  const origin = frameToWorld(frame, u0, vSouth);
  const length = vMax - vSouth;
  // [WP-STP]: 24 ribs one spacing apart, so 23 spacings; centred along the 210 m of the shed proper (the end bays are 2.2 m)
  const first = (f.length - (f.ribs - 1) * f.ribSpacing) / 2;
  const ribs = Array.from({ length: f.ribs }, (_, i) => first + i * f.ribSpacing);
  return { id: b.id, heading, origin, width: f.spanWall, span: f.span, rise: f.rise, barlowLength: f.length, length, ribs, bay: (length - f.length - f.transition) / f.bays };
}
function worldToFrame(s: { origin: Pt; heading: number }, p: Pt): { u: number; v: number } {
  const c = Math.cos(s.heading);
  const sn = Math.sin(s.heading);
  const dx = p[0] - s.origin[0];
  const dz = p[1] - s.origin[1];
  return { u: dx * c + dz * sn, v: dx * sn - dz * c };
}
function frameToWorld(s: { origin: Pt; heading: number }, u: number, v: number): Pt {
  const c = Math.cos(s.heading);
  const sn = Math.sin(s.heading);
  return [s.origin[0] + u * c + v * sn, s.origin[1] + u * sn - v * c];
}

/**
 * The Barlow rib: two circular arcs meeting in a slight point. Each half is an arc whose centre sits
 * `offset` metres across the axis and below the springing line, chosen so the arch springs at
 * (+-span/2, 0) and reaches `rise` at the axis. Returns the height at lateral offset x from the axis.
 */
export function barlowHeight(x: number, span = FIGURES.barlow.span, rise = FIGURES.barlow.rise, offset: number = FIGURES.barlow.pointOffset): number {
  const s = span / 2;
  const e = (s * s + 2 * s * offset - rise * rise) / (2 * rise); // centre depth below the springing line
  const radius = Math.hypot(s + offset, e);
  const ax = Math.abs(x);
  if (ax >= s) return 0;
  // the west half is an arc centred `offset` east of the axis (and `e` below the springing line), so
  // a point `ax` west of the axis is `ax + offset` from that centre
  return Math.sqrt(Math.max(0, radius * radius - (ax + offset) ** 2)) - e;
}

/** The arch section as (x from the west springing, y) points, from the west foot over the crown to the east foot, with arc-length fractions of each half. */
export function barlowSection(steps: number, span = FIGURES.barlow.span, rise = FIGURES.barlow.rise): { x: number; y: number; t: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let k = 0; k <= steps; k++) {
    const x = -span / 2 + (span * k) / steps;
    pts.push({ x, y: barlowHeight(x, span, rise) });
  }
  // arc length from the west foot
  const s: number[] = [0];
  for (let k = 1; k < pts.length; k++) s.push((s[k - 1] as number) + Math.hypot((pts[k] as { x: number }).x - (pts[k - 1] as { x: number }).x, (pts[k] as { y: number }).y - (pts[k - 1] as { y: number }).y));
  const total = s[s.length - 1] as number;
  return pts.map((p, k) => ({ x: p.x + span / 2, y: p.y, t: (s[k] as number) / total }));
}

// ---- where they stand on the ground ------------------------------------------------------------

/** Metres between the ground samples taken inside a footprint: `seatY`'s own default, so the lowest and the highest are found the same way. */
const SEAT_SPACING = 2;

/** Where one structure stands on the terrain (core/terrain.ts). */
export interface Seat {
  /** y of the structure's base: the lowest ground under its footprint, held up to the `floor` where one was given */
  y: number;
  /** the lowest and the highest ground under the footprint: `max - min` is how deep the uphill side goes into the ground */
  min: number;
  max: number;
}

/**
 * Where a structure's base goes: the lowest ground under its footprint (`seatY`), so no wall floats. A footprint of several rings (a building and its
 * towers) is one rigid structure: it takes the lowest, so its parts keep their relative heights. `floor` stops a deep cutting under part of the
 * footprint from sinking the base with it.
 */
export function seatOf(terrain: Pick<Terrain, 'rangeUnder'>, rings: readonly (readonly Pt[])[], floor = -Infinity): Seat {
  let y = Infinity;
  let min = Infinity;
  let max = -Infinity;
  for (const ring of rings) {
    y = Math.min(y, seatY(terrain, ring, SEAT_SPACING));
    const r = terrain.rangeUnder(ring, SEAT_SPACING);
    min = Math.min(min, r.min);
    max = Math.max(max, r.max);
  }
  return { y: Math.max(y, floor), min, max };
}

/** The base of a tower: its square plan, grown by `grow` metres all round. */
export function towerSquare(t: TowerPlan, grow = 0): Pt[] {
  const h = t.side / 2 + grow;
  const c = (a: number, b: number): Pt => [t.centre[0] + t.along[0] * a * h + t.out[0] * b * h, t.centre[1] + t.along[1] * a * h + t.out[1] * b * h];
  return [c(-1, -1), c(1, -1), c(1, 1), c(-1, 1)];
}

/** The footprint of the Barlow vault: the rectangle from the south wall to the end of the outline, wall to wall. */
export function barlowFootprint(plan: BarlowPlan): Pt[] {
  const frame = { origin: plan.origin, heading: plan.heading };
  return [frameToWorld(frame, 0, 0), frameToWorld(frame, plan.width, 0), frameToWorld(frame, plan.width, plan.length), frameToWorld(frame, 0, plan.length)];
}

export type LandmarkName = 'hotel' | 'midland' | 'barlow';
export interface LandmarkPlans {
  hotel: HotelPlan;
  midland: MidlandPlan;
  barlow: BarlowPlan;
}

export function landmarkPlans(data: Pick<KxData, 'buildings' | 'platforms'>): LandmarkPlans {
  return { hotel: greatNorthernHotelPlan(data), midland: midlandGrandPlan(data), barlow: barlowPlan(data) };
}

/** The rings that outline the base of each building: the Midland Grand's own and its two towers' (which stand 0.3 m proud of the front). */
export function landmarkFootprints(p: LandmarkPlans): Record<LandmarkName, Pt[][]> {
  return {
    hotel: [p.hotel.outline],
    midland: [p.midland.outline, ...p.midland.towers.map((t) => towerSquare(t))],
    barlow: [barlowFootprint(p.barlow)],
  };
}

/** How far below the railway's ground (`terrain.groundY`) the Barlow shed's springings may go: its floor is the track level; this stops the cutting past its edge from pulling the vault down. */
export const BARLOW_SINK = 0.3;

/** Where each building stands: its base at the lowest ground under its footprint (the Barlow shed no lower than `BARLOW_SINK` under the railway's ground). */
export function landmarkSeats(plans: LandmarkPlans, terrain: Pick<Terrain, 'rangeUnder' | 'groundY'>): Record<LandmarkName, Seat> {
  const rings = landmarkFootprints(plans);
  return {
    hotel: seatOf(terrain, rings.hotel),
    midland: seatOf(terrain, rings.midland),
    barlow: seatOf(terrain, rings.barlow, terrain.groundY - BARLOW_SINK),
  };
}

// ---- tunnel mouths -----------------------------------------------------------------------------

export interface PortalTrack {
  nodeId: number;
  x: number;
  z: number;
  /** metres across the face from `origin` (positive east-ish: along `across`) */
  lateral: number;
  /** metres along the tunnel axis from `origin` (the face line is s = 0) */
  along: number;
}
export interface MouthBore {
  /** lateral position of the bore's centre line, metres across the face from `origin` */
  lateral: number;
  tracks: PortalTrack[];
  width: number;
}
export interface Mouth {
  /** e.g. "gasworks-south" */
  id: string;
  name: string;
  /** the middle of the face line at rail level: the mean of the outermost portal nodes */
  origin: Pt;
  /** unit vector into the tunnel */
  axis: Pt;
  /** unit vector across the face: the axis turned a quarter turn clockwise on the map (east for a north-bound tunnel) */
  across: Pt;
  bores: MouthBore[];
  /** half the face width: the outer bore edges plus their masonry */
  halfWidth: number;
  nodeIds: number[];
}
export interface TunnelRun {
  name: string;
  mouths: Mouth[];
  /** every OSM node of the tunnel's rails (ids and positions) */
  nodes: { id: number; x: number; z: number }[];
  /** the straight axis of the covered ground: from the first mouth's origin to the other mouth, or to the far end of the extract */
  from: Pt;
  to: Pt;
  /** true when the far end is an OSM extract boundary, not a portal */
  openEnded: boolean;
}

const TUNNEL_REF = 'ECM1';
const BORE_PAIR_MAX = 5.5; // two tracks of one bore are 3.1-4.3 m apart in OSM; bores are 6.3 m or more apart

/**
 * Every place the East Coast Main Line's rails go from open to `tunnel`: OSM nodes shared by a tunnel way and an open way, grouped into mouths (the
 * Gasworks Tunnel's two ends, the Copenhagen Tunnel's south end) and each mouth into bores of one or two tracks.
 */
export function tunnelMouths(data: Pick<KxData, 'nodes' | 'rails'>, ref = TUNNEL_REF): Mouth[] {
  const pos = new Map<number, Pt>(data.nodes.map(([id, x, z]) => [id, [x, z] as Pt]));
  const tunnelWays = data.rails.filter((r) => r.tunnel && r.ref === ref);
  const openAt = new Map<number, Rail[]>();
  for (const r of data.rails) {
    if (r.tunnel) continue;
    for (const nd of r.nodes) {
      const list = openAt.get(nd);
      if (list) list.push(r);
      else openAt.set(nd, [r]);
    }
  }
  interface Portal { id: number; p: Pt; into: Pt }
  const byNode = new Map<number, Portal>();
  for (const w of tunnelWays) {
    for (const [k, nd] of [[0, w.nodes[0] as number], [1, w.nodes[w.nodes.length - 1] as number]] as const) {
      if (!openAt.has(nd) || byNode.has(nd)) continue;
      const p = pos.get(nd);
      const nextId = k === 0 ? (w.nodes[1] as number) : (w.nodes[w.nodes.length - 2] as number);
      const q = pos.get(nextId);
      if (!p || !q) continue;
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (l === 0) continue;
      byNode.set(nd, { id: nd, p, into: [(q[0] - p[0]) / l, (q[1] - p[1]) / l] });
    }
  }
  const portals = [...byNode.values()];
  // cluster by proximity (the faces are under 40 m wide)
  const used = new Array<boolean>(portals.length).fill(false);
  const groups: Portal[][] = [];
  for (let i = 0; i < portals.length; i++) {
    if (used[i]) continue;
    const g: Portal[] = [portals[i] as Portal];
    used[i] = true;
    for (let k = 0; k < g.length; k++) {
      for (let j = 0; j < portals.length; j++) {
        if (used[j]) continue;
        const a = g[k] as Portal;
        const b = portals[j] as Portal;
        if (Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]) < 40) {
          used[j] = true;
          g.push(b);
        }
      }
    }
    groups.push(g);
  }
  const mouths: Mouth[] = groups.map((g) => {
    const sx = g.reduce((s, q) => s + q.into[0], 0);
    const sz = g.reduce((s, q) => s + q.into[1], 0);
    const sl = Math.hypot(sx, sz);
    const axis: Pt = [sx / sl, sz / sl];
    const across: Pt = [-axis[1], axis[0]];
    const mx = g.reduce((s, q) => s + q.p[0], 0) / g.length;
    const mz = g.reduce((s, q) => s + q.p[1], 0) / g.length;
    const rel = g.map((q) => ({ nodeId: q.id, x: q.p[0], z: q.p[1], lateral: (q.p[0] - mx) * across[0] + (q.p[1] - mz) * across[1], along: (q.p[0] - mx) * axis[0] + (q.p[1] - mz) * axis[1] })).sort((a, b) => a.lateral - b.lateral);
    const lo = (rel[0] as PortalTrack).lateral;
    const hi = (rel[rel.length - 1] as PortalTrack).lateral;
    // re-centre laterally on the middle of the outermost tracks, and the face line on the mean along-track position
    const mid = (lo + hi) / 2;
    const origin: Pt = [mx + across[0] * mid, mz + across[1] * mid];
    const tracks = rel.map((t) => ({ ...t, lateral: t.lateral - mid }));
    const bores: MouthBore[] = [];
    for (let i = 0; i < tracks.length; ) {
      const a = tracks[i] as PortalTrack;
      const b = tracks[i + 1];
      if (b && b.lateral - a.lateral < BORE_PAIR_MAX) {
        bores.push({ lateral: (a.lateral + b.lateral) / 2, tracks: [a, b], width: FIGURES.tunnel.boreWidth });
        i += 2;
      } else {
        bores.push({ lateral: a.lateral, tracks: [a], width: FIGURES.tunnel.boreWidth * 0.62 });
        i += 1;
      }
    }
    const first = bores[0] as MouthBore;
    const lastBore = bores[bores.length - 1] as MouthBore;
    const halfWidth = Math.max(Math.abs(first.lateral - first.width / 2), Math.abs(lastBore.lateral + lastBore.width / 2)) + 2.2;
    const id = `${mouthName(origin).id}`;
    return { id, name: mouthName(origin).name, origin, axis, across, bores, halfWidth, nodeIds: g.map((q) => q.id) };
  });
  return mouths.sort((a, b) => a.origin[1] - b.origin[1]).reverse(); // south (large z) first
}

/** The named tunnel ends of the East Coast Main Line inside the extract, by where the portals are. */
function mouthName(origin: Pt): { id: string; name: string } {
  const z = origin[1];
  if (z > -520 && z < -400) return { id: 'gasworks-south', name: 'Gasworks Tunnel, south portals' };
  if (z > -1000 && z < -880) return { id: 'gasworks-north', name: 'Gasworks Tunnel, north portals' };
  if (z > -1400 && z < -1250) return { id: 'copenhagen-south', name: 'Copenhagen Tunnel, south portals' };
  return { id: `tunnel-${Math.round(origin[0])}-${Math.round(origin[1])}`, name: 'Tunnel portals' };
}

/**
 * Tunnels as runs between mouths: walk the tunnel ways from each mouth and join the mouths that reach each other. The Copenhagen Tunnel runs on
 * past the extract's north edge, so its far end is the farthest tunnel node.
 */
export function tunnelRuns(data: Pick<KxData, 'nodes' | 'rails'>, ref = TUNNEL_REF): TunnelRun[] {
  const mouths = tunnelMouths(data, ref);
  const pos = new Map<number, Pt>(data.nodes.map(([id, x, z]) => [id, [x, z] as Pt]));
  const adj = new Map<number, number[]>();
  for (const r of data.rails) {
    if (!r.tunnel || r.ref !== ref) continue;
    for (let i = 0; i + 1 < r.nodes.length; i++) {
      const a = r.nodes[i] as number;
      const b = r.nodes[i + 1] as number;
      adj.set(a, [...(adj.get(a) ?? []), b]);
      adj.set(b, [...(adj.get(b) ?? []), a]);
    }
  }
  const reach = (start: number[]): Set<number> => {
    const seen = new Set<number>(start);
    const stack = [...start];
    while (stack.length) {
      const n = stack.pop() as number;
      for (const m of adj.get(n) ?? []) if (!seen.has(m)) { seen.add(m); stack.push(m); }
    }
    return seen;
  };
  const runs: TunnelRun[] = [];
  const taken = new Set<string>();
  for (const m of mouths) {
    if (taken.has(m.id)) continue;
    const nodes = reach(m.nodeIds);
    const partners = mouths.filter((o) => o.id !== m.id && !taken.has(o.id) && o.nodeIds.some((n) => nodes.has(n)));
    const group = [m, ...partners];
    for (const g of group) taken.add(g.id);
    const list = [...nodes].map((id) => ({ id, x: (pos.get(id) as Pt)[0], z: (pos.get(id) as Pt)[1] }));
    // mouths come south first (largest z), so the run starts at the southern one
    const from = m.origin;
    let to: Pt;
    let openEnded = false;
    const partner = partners[0];
    if (partner) to = partner.origin;
    else {
      openEnded = true;
      const far = list.reduce((best, n) => (Math.hypot(n.x - m.origin[0], n.z - m.origin[1]) > Math.hypot(best.x - m.origin[0], best.z - m.origin[1]) ? n : best), list[0] as { x: number; z: number });
      // the far end of the extract: the mean of the nodes within 15 m of the farthest one
      const near = list.filter((n) => Math.hypot(n.x - far.x, n.z - far.z) < 15);
      to = [near.reduce((s, n) => s + n.x, 0) / near.length, near.reduce((s, n) => s + n.z, 0) / near.length];
    }
    runs.push({ name: m.id.startsWith('gasworks') ? 'Gasworks Tunnel' : m.id.startsWith('copenhagen') ? 'Copenhagen Tunnel' : 'Tunnel', mouths: group, nodes: list, from, to, openEnded });
  }
  return runs;
}

/** Lateral extent of a point set across the line from `from` to `to`: [min, max] metres, positive to the line's right-hand `across`. */
export function lateralRange(from: Pt, to: Pt, pts: readonly { x: number; z: number }[]): { axis: Pt; across: Pt; lo: number; hi: number; length: number } {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  const axis: Pt = [dx / length, dz / length];
  const across: Pt = [-axis[1], axis[0]];
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of pts) {
    const l = (p.x - from[0]) * across[0] + (p.z - from[1]) * across[1];
    lo = Math.min(lo, l);
    hi = Math.max(hi, l);
  }
  return { axis, across, lo, hi, length };
}

// ---- what a portal is made of ------------------------------------------------------------------

export interface ArchOpening {
  /** metres across the face from the face's middle */
  lateral: number;
  halfWidth: number;
  /** height where the round head begins (a semicircle of radius halfWidth, so crown = spring + halfWidth) */
  spring: number;
  crown: number;
}

/** The arch of one bore: a semicircular head on straight jambs, the crown at FIGURES.tunnel.crown. Sizes ASSUMED (see FIGURES.tunnel). */
export function archOpening(bore: Pick<MouthBore, 'lateral' | 'width'>): ArchOpening {
  const halfWidth = bore.width / 2;
  const crown = FIGURES.tunnel.crown;
  return { lateral: bore.lateral, halfWidth, spring: crown - halfWidth, crown };
}

export interface EnvelopeStation {
  /** metres back from the face, along the approach */
  d: number;
  /** the outermost open-rail points either side at that distance, across the face; null where there is no rail */
  lo: number | null;
  hi: number | null;
}

/** How wide the open tracks are on the approach to a mouth: at each `step` metres back from the face, the outermost rail positions across it (the cutting's walls follow them). Rails more than `corridor` m beyond the face's half width are other lines. */
export function approachEnvelope(data: Pick<KxData, 'nodes' | 'rails'>, mouth: Pick<Mouth, 'origin' | 'axis' | 'across' | 'halfWidth'>, reach = 75, step = 15, corridor = 10): EnvelopeStation[] {
  const pos = new Map<number, Pt>(data.nodes.map(([id, x, z]) => [id, [x, z] as Pt]));
  const out: EnvelopeStation[] = [];
  for (let d = 0; d <= reach; d += step) out.push({ d, lo: null, hi: null });
  for (const r of data.rails) {
    if (r.tunnel) continue;
    for (let i = 0; i + 1 < r.nodes.length; i++) {
      const a = pos.get(r.nodes[i] as number);
      const b = pos.get(r.nodes[i + 1] as number);
      if (!a || !b) continue;
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5));
      for (let k = 0; k <= n; k++) {
        const x = a[0] + ((b[0] - a[0]) * k) / n - mouth.origin[0];
        const z = a[1] + ((b[1] - a[1]) * k) / n - mouth.origin[1];
        const u = x * mouth.across[0] + z * mouth.across[1];
        const d = -(x * mouth.axis[0] + z * mouth.axis[1]);
        if (Math.abs(u) > mouth.halfWidth + corridor || d < -step / 2 || d > reach + step / 2) continue;
        const st = out[Math.max(0, Math.min(out.length - 1, Math.round(d / step)))] as EnvelopeStation;
        st.lo = st.lo === null ? u : Math.min(st.lo, u);
        st.hi = st.hi === null ? u : Math.max(st.hi, u);
      }
    }
  }
  return out;
}

export interface Cover {
  name: string;
  /** the run's straight axis, from the first mouth to the other mouth (or to the far end of the extract) */
  from: Pt;
  axis: Pt;
  across: Pt;
  length: number;
  /** lateral extent of the tunnel's own OSM nodes about the straight axis, metres */
  lo: number;
  hi: number;
  openEnded: boolean;
  mouths: Mouth[];
}

/** The ground over each tunnel: its straight axis, length and lateral extent. Every tunnel node lies within [lo, hi] of the axis. */
export function tunnelCover(data: Pick<KxData, 'nodes' | 'rails'>, ref = TUNNEL_REF): Cover[] {
  return tunnelRuns(data, ref).map((run) => {
    const lr = lateralRange(run.from, run.to, run.nodes);
    return { name: run.name, from: run.from, axis: lr.axis, across: lr.across, length: lr.length, lo: lr.lo, hi: lr.hi, openEnded: run.openEnded, mouths: run.mouths };
  });
}
