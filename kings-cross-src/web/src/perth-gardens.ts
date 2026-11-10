// P3 round 2, C6: Perth's residential land as gardens, not lawn. Round 1 drew landuse=residential as park (one unmown green), so whole
// suburbs read from the hill as mown lawn with houses on it; R-pt3-d and 152 show gardens, hedges and trees, darker and broken.
// Pure data for the drape's painter (waverley-city-ground.ts options.gardens): each residential polygon (tools/build-perth-city-landuse.ts
// `residential`, the same OSM rings as their park paint) is cut into plots, each plot one of GARDENS.tones, with hedges between the plots
// and dark garden-tree crowns dotted over them. Plot size, tones, weights and the tree share are ASSUMED (by eye from R-pt3-d and 152).
import type {Pt} from '../../core/geo.ts';
import {decodeLanduse} from './waverley-city-ground.ts';
import type {GardenPaint, LanduseFile} from './waverley-city-ground.ts';
import file from './data/perth-city-landuse.json' with {type: 'json'};

/** ASSUMED: plots `plot` m (across, deep); tones as [paint, weight] (lawn, worn lawn, shrubs, beds, patio); hedges `hedge` m wide in
 *  `hedgeTone`; one garden tree per `treeEvery` plots, crowns `crown` m in radius, in `crownTone`. */
export const GARDENS = {
  plot: [11, 22] as const,
  tones: [['#4b6428', 4], ['#58642f', 2], ['#34481f', 3], ['#54473a', 1.2], ['#615d54', .8]] as const,
  hedge: .9, hedgeTone: '#26361a', treeEvery: 1.6, crown: [2.2, 4.2] as const, crownTone: '#1f2e16',
} as const;

const hash = (x: number, z: number, k: number): number => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
const pip = (x: number, z: number, p: readonly Pt[]): boolean => { let yes = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i]![1] > z) !== (p[j]![1] > z) && x < (p[j]![0] - p[i]![0]) * (z - p[i]![1]) / (p[j]![1] - p[i]![1]) + p[i]![0]) yes = !yes; return yes; };
const inside = (x: number, z: number, rs: readonly (readonly Pt[])[]) => pip(x, z, rs[0]!) && !rs.slice(1).some(h => pip(x, z, h));

/** The residential rings, decoded as the land-use file's areas are (the same delta code; `residential` sits beside `areas`). */
export const PERTH_RESIDENTIAL: Pt[][][] = decodeLanduse({...(file as unknown as LanduseFile), areas: {park: (file as unknown as {residential: number[][][]}).residential} as LanduseFile['areas']}).areas.park;

/** The garden paint for the drape: plots with their tones, and the garden trees' crowns. */
export function perthGardens(rings: readonly (readonly (readonly Pt[])[])[] = PERTH_RESIDENTIAL): GardenPaint {
  const [W, D] = GARDENS.plot, total = GARDENS.tones.reduce((a, [, w]) => a + w, 0), plots: GardenPaint['plots'] = [], crowns: GardenPaint['crowns'] = [];
  for (const rs of rings) {
    let ax = Infinity, az = Infinity, bx = -Infinity, bz = -Infinity;
    for (const [x, z] of rs[0]!) { ax = Math.min(ax, x); az = Math.min(az, z); bx = Math.max(bx, x); bz = Math.max(bz, z); }
    for (let x = Math.floor(ax / W) * W; x < bx; x += W) for (let z = Math.floor(az / D) * D; z < bz; z += D) {
      if (!inside(x + W / 2, z + D / 2, rs)) continue;
      let pick = hash(x, z, 1) * total, tone: string = GARDENS.tones[0][0];
      for (const [t, w] of GARDENS.tones) { if (pick < w) { tone = t; break; } pick -= w; }
      plots.push({x, z, w: W, d: D, tone});
      if (hash(x, z, 2) * GARDENS.treeEvery < 1) {
        const cx = x + (.15 + .7 * hash(x, z, 3)) * W, cz = z + (.15 + .7 * hash(x, z, 4)) * D;
        crowns.push({x: cx, z: cz, r: GARDENS.crown[0] + (GARDENS.crown[1] - GARDENS.crown[0]) * hash(x, z, 5)});
      }
    }
  }
  return {rings: rings.map(rs => rs.map(r => r.map(p => [p[0], p[1]] as Pt))), plots, crowns, hedge: GARDENS.hedge, hedgeTone: GARDENS.hedgeTone, crownTone: GARDENS.crownTone};
}
