// The station shell as numbers: which OSM platform is which, how long it is, and where the
// train shed stands. Pure functions, no three.js, so the rules are testable without a browser.
//
// References (all checked 2026-11-07):
//   - Train shed: two arched spans, each 105 ft wide, 800 ft long, 71 ft to the crown, by
//     Lewis Cubitt, 1851-52. Network Rail, "The history of London King's Cross station"
//     (https://www.networkrail.co.uk/who-we-are/our-history/iconic-infrastructure/the-history-of-london-kings-cross-station/)
//     and Victorian Web (https://victorianweb.org/art/architecture/london/54.html).
//   - Clock tower: 112 ft (Grace's Guide, https://www.gracesguide.co.uk/King%27s_Cross_Railway_Station).
//     One other page says 120 ft; 112 ft has more support.
//   - Platforms: there are platforms 0-10. A 2021 remodel took the old platform 10 out of use and
//     relabelled platform 11 as 10 (Wikipedia, "London King's Cross railway station"). OSM and
//     SMART agree: neither has a platform 11. Do not add one.
import { centroid, inZone, KINGS_CROSS } from './zones.ts';
import type { Pt } from './geo.ts';
import type { Building, KxData, Platform } from './osm.ts';

export const FT = 0.3048;
export const SHED_SPAN_WIDTH = 105 * FT; // clear width of each arch, 32.0 m
export const SHED_LENGTH = 800 * FT; // 243.8 m
export const SHED_CROWN_HEIGHT = 71 * FT; // 21.6 m above the platform
export const CLOCK_TOWER_HEIGHT = 112 * FT; // 34.1 m
export const GAUGE = 1.435; // standard gauge, metres between the inner rail faces

/** Platform numbers at King's Cross today. */
export const PLATFORM_REFS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;
/** Platforms under the main train shed (the suburban 9 and 10 sit west of it). */
export const SHED_PLATFORM_REFS = ['0', '1', '2', '3', '4', '5', '6', '7', '8'] as const;

const dot = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const len = (a: Pt): number => Math.hypot(a[0], a[1]);

/**
 * A platform you could stand on at ground level or above. Underground platforms (tube, deep
 * level; OSM layer below 0 or tagged tunnel) sit under the station and share its numbers, so
 * they are neither drawn nor counted as King's Cross platforms.
 */
export const isSurfacePlatform = (p: Pick<Platform, 'layer' | 'tunnel'>): boolean => p.tunnel !== true && (p.layer ?? 0) >= 0;

/** The OSM platform polygon for each platform number inside the King's Cross zone. */
export function stationPlatforms(data: Pick<KxData, 'platforms'>): Map<string, Platform> {
  const out = new Map<string, Platform>();
  for (const p of data.platforms) {
    if (p.ref === undefined || p.pts.length < 3 || !isSurfacePlatform(p)) continue;
    if (!inZone(KINGS_CROSS, centroid(p.pts))) continue;
    out.set(p.ref, p);
  }
  return out;
}

export function polygonArea(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i] as Pt;
    const b = pts[(i + 1) % pts.length] as Pt;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

/**
 * The long axis of a thin polygon, from its smallest enclosing rectangle (one side of that
 * rectangle lies along an edge of the polygon): the unit axis, the rectangle's length along it,
 * and the polygon's mean width (area / length). Exact for a slab; a chamfered end changes the
 * length by no more than the chamfer.
 */
export function longAxis(pts: Pt[]): { axis: Pt; length: number; width: number } {
  let bestArea = Infinity;
  let axis: Pt = [0, -1];
  let length = 0;
  for (let i = 0; i < pts.length; i++) {
    const d = sub(pts[(i + 1) % pts.length] as Pt, pts[i] as Pt);
    const l = len(d);
    if (l === 0) continue;
    const e: Pt = [d[0] / l, d[1] / l];
    const n: Pt = [-e[1], e[0]];
    let eLo = Infinity;
    let eHi = -Infinity;
    let nLo = Infinity;
    let nHi = -Infinity;
    for (const p of pts) {
      const t = dot(p, e);
      const s = dot(p, n);
      if (t < eLo) eLo = t;
      if (t > eHi) eHi = t;
      if (s < nLo) nLo = s;
      if (s > nHi) nHi = s;
    }
    const along = eHi - eLo;
    const across = nHi - nLo;
    if (along * across < bestArea) {
      bestArea = along * across;
      if (along >= across) {
        axis = e;
        length = along;
      } else {
        axis = n;
        length = across;
      }
    }
  }
  return { axis, length, width: polygonArea(pts) / length };
}

export interface PlatformInfo {
  ref: string;
  osmId: number;
  /** metres along the platform's long axis */
  lengthM: number;
  /** area / length, metres */
  meanWidthM: number;
  areaM2: number;
}

export function platformReport(data: Pick<KxData, 'platforms'>): PlatformInfo[] {
  const map = stationPlatforms(data);
  const out: PlatformInfo[] = [];
  for (const ref of PLATFORM_REFS) {
    const p = map.get(ref);
    if (!p) continue;
    const { length, width } = longAxis(p.pts);
    out.push({ ref, osmId: p.id, lengthM: length, meanWidthM: width, areaM2: polygonArea(p.pts) });
  }
  return out;
}

/** The middle of a platform's south end (the buffer-stop end): the mean of its two southmost vertices. */
export function platformSouthEnd(pts: Pt[]): Pt {
  const south = [...pts].sort((a, b) => b[1] - a[1]).slice(0, 2) as [Pt, Pt];
  return [(south[0][0] + south[1][0]) / 2, (south[0][1] + south[1][1]) / 2];
}

/** x of the polygon's outline on the line z = zq: the smallest and largest crossing, or null. */
export function xRangeAtZ(pts: Pt[], zq: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i] as Pt;
    const b = pts[(i + 1) % pts.length] as Pt;
    if ((a[1] <= zq && b[1] > zq) || (b[1] <= zq && a[1] > zq)) {
      const x = a[0] + ((zq - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
  }
  return lo === Infinity ? null : [lo, hi];
}

/**
 * Heading of the platforms, radians clockwise from north (towards -z) to east (+x). The throat
 * fans out, but the platform faces under the shed are near parallel and lean a couple of degrees
 * east as they run north. Fitted over the shed platforms between two z cut lines.
 */
export function platformHeading(data: Pick<KxData, 'platforms'>, zSouth = -60, zNorth = -250): number {
  const map = stationPlatforms(data);
  const slopes: number[] = [];
  for (const ref of SHED_PLATFORM_REFS) {
    const p = map.get(ref);
    if (!p) continue;
    const s = xRangeAtZ(p.pts, zSouth);
    const n = xRangeAtZ(p.pts, zNorth);
    if (!s || !n) continue;
    const dx = (n[0] + n[1]) / 2 - (s[0] + s[1]) / 2;
    slopes.push(Math.atan2(dx, zSouth - zNorth));
  }
  if (slopes.length === 0) throw new Error('no shed platforms to take a heading from');
  return slopes.reduce((a, b) => a + b, 0) / slopes.length;
}

/**
 * The train shed in its own frame. u runs across (east), v runs along the platforms (north),
 * in metres from `origin`, the south-west corner of the shed floor. World position:
 *   [ox + u*cos(h) + v*sin(h),  oz + u*sin(h) - v*cos(h) ]   with h = heading
 */
export interface ShedLayout {
  origin: Pt;
  heading: number;
  /** total width of the footprint, metres */
  width: number;
  length: number;
  /** side aisle on each flank, metres; each arch is SHED_SPAN_WIDTH wide, two of them */
  aisle: number;
  crown: number;
  /** height of the arch springing above the platform: crown minus the radius */
  springing: number;
}

export function shedToWorld(s: Pick<ShedLayout, 'origin' | 'heading'>, u: number, v: number): Pt {
  const c = Math.cos(s.heading);
  const sn = Math.sin(s.heading);
  return [s.origin[0] + u * c + v * sn, s.origin[1] + u * sn - v * c];
}

export function worldToShed(s: Pick<ShedLayout, 'origin' | 'heading'>, p: Pt): { u: number; v: number } {
  const c = Math.cos(s.heading);
  const sn = Math.sin(s.heading);
  const dx = p[0] - s.origin[0];
  const dz = p[1] - s.origin[1];
  return { u: dx * c + dz * sn, v: dx * sn - dz * c };
}

/**
 * The OSM building polygon for King's Cross station itself (shed, concourse and suburban canopy).
 * Picked by name: its centroid sits south of the platform zone, so the zone cannot find it, and
 * St Pancras is a train_station building too.
 */
export function stationBuilding(data: Pick<KxData, 'buildings'>): Building | undefined {
  return data.buildings.find((b) => b.kind === 'train_station' && b.name !== undefined && /king'?s cross/i.test(b.name));
}

/**
 * Place the shed. The east wall is the east edge of the OSM station footprint; the west wall sits
 * just outside platform 8's west face; the south end is the footprint's south edge. The length is
 * the published 800 ft, so the north end is derived, not read from OSM (which draws the
 * footprint a few metres longer). The aisles are what is left of the footprint width once the two
 * published 105 ft arches are taken out.
 */
export function shedLayout(data: Pick<KxData, 'platforms' | 'buildings'>): ShedLayout {
  const heading = platformHeading(data);
  const platforms = stationPlatforms(data);
  const p8 = platforms.get('8');
  const station = stationBuilding(data);
  if (!p8 || !station) throw new Error('platform 8 and the station building are needed to place the shed');
  const zRef = -100;
  const east = xRangeAtZ(station.pts, zRef);
  const westFace = xRangeAtZ(p8.pts, zRef);
  if (!east || !westFace) throw new Error('station outline does not reach z = -100');
  // Work in the heading frame about a provisional origin to read the south edge of the footprint.
  const prov = { origin: [0, 0] as Pt, heading };
  const eastU = worldToShed(prov, [east[1], zRef]).u;
  const westU = worldToShed(prov, [westFace[0] - 0.5, zRef]).u;
  // The footprint's south edge: its vertices with the largest z that lie east of the concourse arc.
  const southZ = Math.max(...station.pts.filter((p) => p[0] > westFace[0]).map((p) => p[1]));
  const southV = worldToShed(prov, [(westFace[0] + east[1]) / 2, southZ]).v;
  const origin = shedToWorld(prov, westU, southV);
  const radius = SHED_SPAN_WIDTH / 2;
  const width = eastU - westU;
  return {
    origin,
    heading,
    width,
    length: SHED_LENGTH,
    aisle: (width - 2 * SHED_SPAN_WIDTH) / 2,
    crown: SHED_CROWN_HEIGHT,
    springing: SHED_CROWN_HEIGHT - radius,
  };
}

/** The OSM buffer stops at the south end of the shed: one per terminating track of platforms 0-8. */
export function shedBufferStops(data: Pick<KxData, 'buffers'>, shed: Pick<ShedLayout, 'origin' | 'heading' | 'width'>): { id: number; x: number; z: number }[] {
  return data.buffers.filter((b) => {
    const { u, v } = worldToShed(shed, [b.x, b.z]);
    return u >= 0 && u <= shed.width && v >= 0 && v <= 40;
  });
}

/** Is the point inside the polygon (even-odd rule)? */
export function pointInPolygon(p: Pt, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i] as Pt;
    const b = pts[j] as Pt;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** Least-squares circle through the points (Kasa's algebraic fit), with the rms distance from the circle. */
export function fitCircle(pts: Pt[]): { centre: Pt; radius: number; rms: number } {
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let sxz = 0;
  let syz = 0;
  let sz = 0;
  for (const [x, y] of pts) {
    const z = x * x + y * y;
    sx += x;
    sy += y;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
    sxz += x * z;
    syz += y * z;
    sz += z;
  }
  const n = pts.length;
  const a = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
  const rhs = [sxz, syz, sz];
  const det3 = (m: number[][]): number =>
    (m[0] as number[])[0]! * ((m[1] as number[])[1]! * (m[2] as number[])[2]! - (m[1] as number[])[2]! * (m[2] as number[])[1]!) -
    (m[0] as number[])[1]! * ((m[1] as number[])[0]! * (m[2] as number[])[2]! - (m[1] as number[])[2]! * (m[2] as number[])[0]!) +
    (m[0] as number[])[2]! * ((m[1] as number[])[0]! * (m[2] as number[])[1]! - (m[1] as number[])[1]! * (m[2] as number[])[0]!);
  const d = det3(a);
  if (n < 3 || Math.abs(d) < 1e-9) throw new Error('cannot fit a circle to these points');
  const col = (k: number): number[][] => a.map((row, i) => row.map((v, j) => (j === k ? (rhs[i] as number) : v)));
  const cx = det3(col(0)) / d / 2;
  const cz = det3(col(1)) / d / 2;
  const radius = Math.sqrt(det3(col(2)) / d + cx * cx + cz * cz);
  const rms = Math.sqrt(pts.reduce((s, [x, y]) => s + (Math.hypot(x - cx, y - cz) - radius) ** 2, 0) / n);
  return { centre: [cx, cz], radius, rms };
}

/** Published heights of the Western Concourse roof: 20 m at the central stalk, 5 m at the rim (Proquest/Architect). */
export const CONCOURSE_APEX = 20;
export const CONCOURSE_RIM = 5;

export interface ConcourseCanopy {
  centre: Pt;
  /** from the OSM footprint arc: about 63 m, against the 74 m published radius */
  radius: number;
  /** rms distance of the arc points from the fitted circle, metres: how well OSM follows a circle */
  rms: number;
  apex: number;
  rim: number;
}

/**
 * The Western Concourse canopy. Position and radius come from the circular arc in the OSM station
 * footprint, west of the shed (the arc points are the vertices more than 45 m west of the shed's
 * west wall and within 140 m of the south front). Heights are the published ones.
 */
export function concourseCanopy(data: Pick<KxData, 'platforms' | 'buildings'>): ConcourseCanopy {
  const shed = shedLayout(data);
  const station = stationBuilding(data);
  if (!station) throw new Error('the station building is needed to place the concourse');
  const arcPts = station.pts.filter((p) => {
    const { u, v } = worldToShed(shed, p);
    return u < -45 && v < 140;
  });
  const { centre, radius, rms } = fitCircle(arcPts);
  return { centre, radius, rms, apex: CONCOURSE_APEX, rim: CONCOURSE_RIM };
}

/** Roof height at distance r from the stalk: a shallow dome from the apex down to the rim. */
export function concourseHeight(c: Pick<ConcourseCanopy, 'apex' | 'rim' | 'radius'>, r: number): number {
  const t = Math.min(1, Math.max(0, r / c.radius));
  return c.rim + (c.apex - c.rim) * (1 - t * t);
}

/**
 * Twin running rails for one centre-line segment, as two [x1,z1,x2,z2] pairs offset by half the
 * gauge each side. The 'gauge' is the distance between the inner faces; the centre line of each
 * rail is a rail-head width further out, so an offset of gauge/2 + head/2 is used.
 */
export const RAIL_HEAD_WIDTH = 0.072; // 113A flat-bottom rail head, about 72 mm
export function railPair(a: Pt, b: Pt, gauge = GAUGE): [[number, number, number, number], [number, number, number, number]] | null {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l = Math.hypot(dx, dz);
  if (l === 0) return null;
  const off = gauge / 2 + RAIL_HEAD_WIDTH / 2;
  const nx = (-dz / l) * off;
  const nz = (dx / l) * off;
  return [
    [a[0] + nx, a[1] + nz, b[0] + nx, b[1] + nz],
    [a[0] - nx, a[1] - nz, b[0] - nx, b[1] - nz],
  ];
}
