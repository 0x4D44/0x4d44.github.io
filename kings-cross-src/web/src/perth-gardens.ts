// P3 round 2, C6: Perth's residential land as gardens, not lawn. Round 1 drew landuse=residential as park (one unmown green), so whole
// suburbs read from the hill as mown lawn with houses on it; R-pt3-d and 152 show gardens, hedges and trees, darker and broken.
// Pure data for the drape's painter (waverley-city-ground.ts options.gardens): each residential polygon (tools/build-perth-city-landuse.ts
// `residential`, the same OSM rings as their park paint) is cut into plots, each plot one of GARDENS.tones, with hedges between the plots
// and dark garden-tree crowns dotted over them. Plot size, tones, weights and the tree share are ASSUMED (by eye from R-pt3-d and 152).
// Round 3 (C6): round 2's plots were one 11 x 22 m grid on the map axes, so from the hill they read as a chequer laid across the
// streets. Each block's plots now run in its streets' frame, tile by tile (streetFrame: the length-weighted direction, modulo a right
// angle, of the mapped streets within GARDENS.near m of each GARDENS.tile m square), in rows of varied depth cut into plots of varied width (GARDENS.depth, .width).
// The town centre's unmapped ground was one flat paving tone; townPatches lays street-aligned yards, slabs, tarmac and back greens over
// it, under the land use (so mapped areas, streets and gardens paint over them). Their sizes, tones and weights are ASSUMED.
import type {Pt} from '../../core/geo.ts';
import {decodeLanduse} from './waverley-city-ground.ts';
import type {GardenPaint, GardenRect, LanduseFile} from './waverley-city-ground.ts';
import file from './data/perth-city-landuse.json' with {type: 'json'};

/** ASSUMED: plots in rows `depth` m deep cut `width` m wide, in the frame of the streets within `near` m of each `tile` m square; tones as [paint, weight] (lawn, worn lawn, shrubs, beds, patio); hedges `hedge` m wide in
 *  `hedgeTone`; one garden tree per `treeEvery` plots, crowns `crown` m in radius, in `crownTone`. */
export const GARDENS = {
  depth: [14, 30] as const, width: [7, 20] as const, near: 40, tile: 60,
  tones: [['#4b6428', 4], ['#58642f', 2], ['#34481f', 3], ['#54473a', 1.2], ['#615d54', .8]] as const,
  hedge: .9, hedgeTone: '#26361a', treeEvery: 1.6, crown: [2.2, 4.2] as const, crownTone: '#1f2e16',
} as const;

const hash = (x: number, z: number, k: number): number => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
const pip = (x: number, z: number, p: readonly Pt[]): boolean => { let yes = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i]![1] > z) !== (p[j]![1] > z) && x < (p[j]![0] - p[i]![0]) * (z - p[i]![1]) / (p[j]![1] - p[i]![1]) + p[i]![0]) yes = !yes; return yes; };
const inside = (x: number, z: number, rs: readonly (readonly Pt[])[]) => pip(x, z, rs[0]!) && !rs.slice(1).some(h => pip(x, z, h));

/** The residential rings, decoded as the land-use file's areas are (the same delta code; `residential` sits beside `areas`). */
export const PERTH_RESIDENTIAL: Pt[][][] = decodeLanduse({...(file as unknown as LanduseFile), areas: {park: (file as unknown as {residential: number[][][]}).residential} as LanduseFile['areas']}).areas.park;

/** ASSUMED town-centre patches: cells `cell` m (across, deep) in the local street frame, a share `cover` of them painted, tones as
 *  [paint, weight] (slabs, tarmac yard, gravel, mossy yard, back green, the paving itself), within `reach` m of a street. */
export const TOWN_PATCHES = {
  cell: [[6, 16], [8, 22]] as const, cover: .75, reach: 70,
  tones: [['#6a665e', 3], ['#4c4b49', 2.5], ['#6e6658', 1.5], ['#5a5b48', 1.5], ['#4d5a31', 1], ['#57534b', 2]] as const,
} as const;

/** The mapped streets, as segments in 50 m buckets, for streetFrame. */
const STREETS = (() => {
  const segs: [Pt, Pt][] = []; for (const r of decodeLanduse(file as unknown as LanduseFile).roads) for (let i = 1; i < r.line.length; i++) segs.push([r.line[i - 1]!, r.line[i]!]);
  const B = 50, buckets = new Map<string, [Pt, Pt][]>();
  for (const sg of segs) {
    const [a, b] = sg, n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / B));
    const keys = new Set<string>(); for (let k = 0; k <= n; k++) keys.add(`${Math.floor((a[0] + (b[0] - a[0]) * k / n) / B)},${Math.floor((a[1] + (b[1] - a[1]) * k / n) / B)}`);
    for (const key of keys) { const l = buckets.get(key); if (l) l.push(sg); else buckets.set(key, [sg]); }
  }
  /** The segments with any point within `r` m of the box (ax, az)-(bx, bz) (by bucket), deduplicated. */
  const near = (ax: number, az: number, bx: number, bz: number, r: number) => {
    const out = new Set<[Pt, Pt]>();
    for (let i = Math.floor((ax - r) / B); i <= Math.floor((bx + r) / B); i++) for (let j = Math.floor((az - r) / B); j <= Math.floor((bz + r) / B); j++) for (const sg of buckets.get(`${i},${j}`) ?? []) out.add(sg);
    return [...out];
  };
  return {near};
})();
/** Distance from (x, z) to a segment. */
export const segDist = (x: number, z: number, [a, b]: readonly [Pt, Pt]): number => { const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz, t = l ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l)) : 0; return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz); };
/** The mapped street segments near (x, z), within `r` m. */
export const streetsNear = (x: number, z: number, r: number): [Pt, Pt][] => STREETS.near(x, z, x, z, r).filter(sg => segDist(x, z, sg) <= r);
/** The streets' frame over a box: the length-weighted mean direction, modulo a right angle (a quarter-turn circular mean), of the
 *  street segments within `r` m of the box, in radians in [-pi/4, pi/4); undefined if there are none. */
export function streetFrame(ax: number, az: number, bx: number, bz: number, r: number): number | undefined {
  let c = 0, sn = 0;
  for (const [a, b] of STREETS.near(ax, az, bx, bz, r)) {
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if (mx < ax - r || mx > bx + r || mz < az - r || mz > bz + r) continue;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]), t = Math.atan2(b[1] - a[1], b[0] - a[0]); c += l * Math.cos(4 * t); sn += l * Math.sin(4 * t);
  }
  return c || sn ? Math.atan2(sn, c) / 4 : undefined;
}

const pickTone = (tones: readonly (readonly [string, number])[], h: number): string => {
  let pick = h * tones.reduce((a, [, w]) => a + w, 0);
  for (const [t, w] of tones) { if (pick < w) return t; pick -= w; }
  return tones[0]![0];
};
/** Lay rects over a box in a frame turned `rot`: rows `depth` m deep, cut into rects `width` m wide (both varied by hash), each handed
 *  its centre; keep(cx, cz) chooses. */
function layRects(ax: number, az: number, bx: number, bz: number, rot: number, depth: readonly [number, number], width: readonly [number, number], k: number, add: (cx: number, cz: number, w: number, d: number, h: number) => void): void {
  const cx = (ax + bx) / 2, cz = (az + bz) / 2, R = Math.hypot(bx - ax, bz - az) / 2, u: Pt = [Math.cos(rot), Math.sin(rot)], v: Pt = [-u[1], u[0]];
  for (let b = -R, row = 0; b < R; row++) {
    const d = depth[0] + (depth[1] - depth[0]) * hash(row, k, 6);
    for (let a = -R, col = 0; a < R; col++) {
      const w = width[0] + (width[1] - width[0]) * hash(col, row * 31 + k, 7), mu = a + w / 2, mv = b + d / 2;
      add(cx + u[0] * mu + v[0] * mv, cz + u[1] * mu + v[1] * mv, w, d, hash(col + k, row, 8));
      a += w;
    }
    b += d;
  }
}

/** The garden paint for the drape: plots with their tones, the garden trees' crowns, and the town centre's patches. */
export function perthGardens(rings: readonly (readonly (readonly Pt[])[])[] = PERTH_RESIDENTIAL): GardenPaint {
  const plots: GardenRect[] = [], crowns: GardenPaint['crowns'] = [];
  rings.forEach((rs, k) => {
    let ax = Infinity, az = Infinity, bx = -Infinity, bz = -Infinity;
    for (const [x, z] of rs[0]!) { ax = Math.min(ax, x); az = Math.min(az, z); bx = Math.max(bx, x); bz = Math.max(bz, z); }
    const T = GARDENS.tile, whole = streetFrame(ax, az, bx, bz, GARDENS.near) ?? 0;
    for (let tx = ax; tx < bx; tx += T) for (let tz = az; tz < bz; tz += T) {
    const rot = streetFrame(tx, tz, tx + T, tz + T, GARDENS.near) ?? whole;
    layRects(tx, tz, tx + T, tz + T, rot, GARDENS.depth, GARDENS.width, k * 977 + Math.round(tx + 3 * tz), (cx, cz, w, d, h) => {
      if (cx < tx || cx >= tx + T || cz < tz || cz >= tz + T || !inside(cx, cz, rs)) return;
      plots.push({x: cx - w / 2, z: cz - d / 2, w, d, rot, tone: pickTone(GARDENS.tones, h)});
      if (hash(cx, cz, 2) * GARDENS.treeEvery < 1) {
        const a = (hash(cx, cz, 3) - .5) * .7 * w, b = (hash(cx, cz, 4) - .5) * .7 * d;
        crowns.push({x: cx + Math.cos(rot) * a - Math.sin(rot) * b, z: cz + Math.sin(rot) * a + Math.cos(rot) * b, r: GARDENS.crown[0] + (GARDENS.crown[1] - GARDENS.crown[0]) * hash(cx, cz, 5)});
      }
    });
    }
  });
  return {rings: rings.map(rs => rs.map(r => r.map(p => [p[0], p[1]] as Pt))), plots, crowns, hedge: GARDENS.hedge, hedgeTone: GARDENS.hedgeTone, crownTone: GARDENS.crownTone, patches: townPatches(rings)};
}

/** The town centre's patches: over the land-use extent, in 200 m tiles, each tile in its streets' frame; a patch is kept within
 *  TOWN_PATCHES.reach m of a street and outside the residential rings (gardens cover those), with TOWN_PATCHES.cover of them painted. */
export function townPatches(rings: readonly (readonly (readonly Pt[])[])[] = PERTH_RESIDENTIAL): GardenRect[] {
  const E = (file as unknown as LanduseFile).extent, T = 200, P = TOWN_PATCHES, out: GardenRect[] = [];
  for (let tx = E.x0; tx < E.x1; tx += T) for (let tz = E.z0; tz < E.z1; tz += T) {
    const rot = streetFrame(tx, tz, tx + T, tz + T, 0); if (rot === undefined) continue;
    layRects(tx, tz, tx + T, tz + T, rot, P.cell[1], P.cell[0], Math.round(tx * 7 + tz), (cx, cz, w, d, h) => {
      if (cx < tx || cx >= tx + T || cz < tz || cz >= tz + T || hash(cx, cz, 9) > P.cover) return;
      if (!streetsNear(cx, cz, P.reach).length || rings.some(rs => inside(cx, cz, rs))) return;
      out.push({x: cx - w / 2, z: cz - d / 2, w, d, rot, tone: pickTone(P.tones, h)});
    });
  }
  return out;
}
