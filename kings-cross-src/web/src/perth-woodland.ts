// P3 Kinnoull Hill's woodland (round 2): the OSM woods drawn as broken, mixed woodland, not an even ring of equal crowns.
// - Clumps and gaps: a smooth 64 m value noise leaves the woods' thin patches open (WOODLAND.clump), on top of the fill's own gaps.
// - Mixed size: a crown's height scales by WOODLAND.size (noise for the clump, a hash for the single tree), so young and old stand
//   together.
// - Mixed tone: Scots pine and spruce (dark blue-green), oak, birch and beech (fresh to olive greens), and a few bronzed crowns, by
//   hash (WOODLAND.tones). ASSUMED shares and colours, against 4529878 and 4599836 (Kinnoull's slopes from the viaduct, August:
//   mixed fresh greens with dark conifers) and Kinnoull_Tower 4307 (the same woods, November).
// - The westward sightline from the summit camera (pt-kinnoull-panorama) is open: a massed tree whose top would rise above the line
//   from the eye to the town is left out, so the ground falls away in front as England_and_Scotland_152 shows from the summit.
// - Gorse: scrub at the summit clearing's edge and scattered over the opened slope (152: gorse clumps either side of the path).
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {Tree, Woodland} from './waverley-city-ground.ts';

/** The OSM peak (node/29621037) in the Perth frame. */
export const KINNOULL_PEAK: Pt = [2372, 200];
/** pt-kinnoull-panorama (tools/evidence.mjs FROZEN_PERTH_CAMERAS), whose view the sightline keeps open. */
export const KINNOULL_EYE = {pos: [2368, 212.7, 208] as const, target: [0, 10, 0] as const, halfWidthDeg: 38};
/** ASSUMED woodland shape (see the header). */
export const WOODLAND = {
  noiseCell: 64, clump: .34, size: [.6, 1.3] as const,
  sight: {reach: 700, clear: 1.5},
  gorse: {inner: 165, outer: 190, step: 9, keep: .45, slope: [160, 520] as const, slopeStep: 14, slopeKeep: .3},
  tones: [
    {share: .22, rgb: [.10, .19, .12]},  // Scots pine, spruce
    {share: .30, rgb: [.20, .33, .12]},  // oak
    {share: .22, rgb: [.27, .40, .15]},  // birch, beech in sun
    {share: .16, rgb: [.24, .30, .11]},  // olive
    {share: .10, rgb: [.36, .30, .13]},  // bronzed
  ],
  gorseRgb: [.16, .22, .08],
} as const;

const hash = (x: number, z: number, k: number): number => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
/** Smooth value noise in [0, 1] on a WOODLAND.noiseCell lattice. */
export function woodNoise(x: number, z: number): number {
  const c = WOODLAND.noiseCell, gx = Math.floor(x / c), gz = Math.floor(z / c), fx = x / c - gx, fz = z / c - gz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz), v = (i: number, j: number) => hash((gx + i) * c, (gz + j) * c, 11);
  return (v(0, 0) * (1 - sx) + v(1, 0) * sx) * (1 - sz) + (v(0, 1) * (1 - sx) + v(1, 1) * sx) * sz;
}

/** The sight line's height over (x, z) when it is in the panorama's frame and reach, else undefined. */
export function sightHeight(x: number, z: number): number | undefined {
  const [ex, ey, ez] = KINNOULL_EYE.pos, [tx, ty, tz] = KINNOULL_EYE.target, dx = x - ex, dz = z - ez, d = Math.hypot(dx, dz);
  if (d < 1 || d > WOODLAND.sight.reach) return undefined;
  const a = Math.atan2(dz, dx) - Math.atan2(tz - ez, tx - ex), off = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) * 180 / Math.PI;
  if (off > KINNOULL_EYE.halfWidthDeg) return undefined;
  return ey + (ty - ey) * d / Math.hypot(tx - ex, tz - ez);
}

/** Kinnoull's woodland for buildWaverleyCityGround (options.woodland). */
export function kinnoullWoodland(): Woodland {
  const gorse: Pt[] = [], g = WOODLAND.gorse, [px, pz] = KINNOULL_PEAK;
  for (let a = 0; a < 360; a += 360 * g.step / (2 * Math.PI * g.inner)) for (const r of [g.inner, (g.inner + g.outer) / 2, g.outer]) {
    const x = px + r * Math.cos(a * Math.PI / 180), z = pz + r * Math.sin(a * Math.PI / 180);
    if (hash(x, z, 21) < g.keep) gorse.push([x + (hash(x, z, 22) - .5) * g.step, z + (hash(x, z, 23) - .5) * g.step]);
  }
  for (let x = px - g.slope[1]; x <= px + g.slope[1]; x += g.slopeStep) for (let z = pz - g.slope[1]; z <= pz + g.slope[1]; z += g.slopeStep) {
    const d = Math.hypot(x - px, z - pz); if (d < g.slope[0] || d > g.slope[1] || sightHeight(x, z) === undefined || hash(x, z, 24) >= g.slopeKeep) continue;
    gorse.push([x + (hash(x, z, 25) - .5) * g.slopeStep, z + (hash(x, z, 26) - .5) * g.slopeStep]);
  }
  return {
    size: (x, z, kind) => kind === 'scrub' ? 1 : WOODLAND.size[0] + (WOODLAND.size[1] - WOODLAND.size[0]) * (.6 * woodNoise(x, z) + .4 * hash(x, z, 31)),
    keep: (t: Tree) => {
      if (t.kind === 'wood' && !t.hanging && woodNoise(t.x, t.z) < WOODLAND.clump) return false;
      const s = sightHeight(t.x, t.z); if (s !== undefined && t.kind === 'wood' && t.y + t.height > s - WOODLAND.sight.clear) return false;
      return true;
    },
    tone: (t: Tree, col: THREE.Color) => {
      if (t.kind === 'scrub') { const [r, gg, b] = WOODLAND.gorseRgb, k = .85 + .3 * hash(t.x, t.z, 41); col.setRGB(r * k, gg * k, b * k, THREE.SRGBColorSpace); return; }
      let h = hash(t.x, t.z, 42), pick = WOODLAND.tones[WOODLAND.tones.length - 1]!;
      for (const tone of WOODLAND.tones) { if (h < tone.share) { pick = tone; break; } h -= tone.share; }
      const k = .88 + .24 * hash(t.x, t.z, 43); col.setRGB(pick.rgb[0] * k, pick.rgb[1] * k, pick.rgb[2] * k, THREE.SRGBColorSpace);
    },
    gorse,
  };
}
