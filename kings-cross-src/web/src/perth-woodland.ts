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
// - The cliff is bare: no wood or scrub on ground steeper than WOODLAND.cliff.slope within WOODLAND.cliff.reach m of an OSM cliff line
//   (8703: grey rock with only a few small trees in its clefts; 4307: the pale face bare above the woods), so the ground's rock paint
//   shows. Kinnoull's rock is paler than Waverley's dolerite (PERTH_ROCK_TONES).
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {Terrain} from '../../core/terrain.ts';
import {slopeOf} from './waverley-city-ground.ts';
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
  cliff: {slope: 34, reach: 45},
} as const;

const hash = (x: number, z: number, k: number): number => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
/** Smooth value noise in [0, 1] on a WOODLAND.noiseCell lattice. */
export function woodNoise(x: number, z: number): number {
  const c = WOODLAND.noiseCell, gx = Math.floor(x / c), gz = Math.floor(z / c), fx = x / c - gx, fz = z / c - gz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz), v = (i: number, j: number) => hash((gx + i) * c, (gz + j) * c, 11);
  return (v(0, 0) * (1 - sx) + v(1, 0) * sx) * (1 - sz) + (v(0, 1) * (1 - sx) + v(1, 1) * sx) * sz;
}

/** Is (x, z) in the panorama's frame (within its half width of the axis) and within WOODLAND.sight.reach of the eye: the summit's
 *  slopes in view (where the clearing's gorse runs down). */
export function inPanoramaNear(x: number, z: number): boolean {
  const d = Math.hypot(x - KINNOULL_EYE.pos[0], z - KINNOULL_EYE.pos[2]);
  return d >= 1 && d <= WOODLAND.sight.reach && Math.abs(bearingOff(x, z)) <= KINNOULL_EYE.halfWidthDeg;
}
/** The bearing of (x, z) from the panorama's eye off its axis, in degrees (-180 to 180). */
function bearingOff(x: number, z: number): number {
  const [ex, , ez] = KINNOULL_EYE.pos, [tx, , tz] = KINNOULL_EYE.target, a = Math.atan2(z - ez, x - ex) - Math.atan2(tz - ez, tx - ex);
  return Math.atan2(Math.sin(a), Math.cos(a)) * 180 / Math.PI;
}

/** The view from the summit (round 3 score, C2: round 3's canopy, capped only within 700 m and under one straight line, rose across the
 *  frame and hid the Tay, the North Inch and the near town). Per bearing across the frame (SIGHT.margin degrees past each edge, every
 *  SIGHT.bearing degrees), the bare ground is marched every SIGHT.step m out to the terrain's edge: a point is in view if its angle from
 *  the eye is not under the highest angle before it. The cap at a distance is the lowest angle of the ground in view from SIGHT.shadow
 *  m beyond it outward (so a top may hide the strip just behind itself, as a real tree or an island's trees do, but nothing further
 *  off: not the river, the Inch or the town), or the horizon angle there, whichever is higher (a top under the brow before it is out of
 *  view itself). The small islands' tree belts (perth-canopy.ts ISLAND_CANOPY) take SIGHT.island m: trees standing in the river may hide
 *  more of the channel behind them. */
export const SIGHT = {bearing: .2, margin: 3, step: 6, near: 20, shadow: 40, island: 90} as const;
type View = {b0: number; nb: number; nt: number; cap: Float32Array};
const views = new WeakMap<object, Map<number, View>>();
function viewOf(ground: Pick<Terrain, 'heightAt' | 'extent'>, shadow: number): View {
  const byShadow = views.get(ground) ?? new Map<number, View>(); views.set(ground, byShadow);
  const hit = byShadow.get(shadow); if (hit) return hit;
  const [ex, ey, ez] = KINNOULL_EYE.pos, [tx, , tz] = KINNOULL_EYE.target, axis = Math.atan2(tz - ez, tx - ex), E = ground.extent;
  const b0 = -KINNOULL_EYE.halfWidthDeg - SIGHT.margin, nb = Math.ceil(2 * (KINNOULL_EYE.halfWidthDeg + SIGHT.margin) / SIGHT.bearing) + 1;
  const reach = Math.hypot(Math.max(E.x1 - ex, ex - E.x0), Math.max(E.z1 - ez, ez - E.z0)), nt = Math.ceil(reach / SIGHT.step) + 1;
  const cap = new Float32Array(nb * nt).fill(NaN), ang = new Float32Array(nt), seen = new Uint8Array(nt), horizon = new Float32Array(nt);
  for (let k = 0; k < nb; k++) {
    const a = axis + (b0 + k * SIGHT.bearing) * Math.PI / 180, ux = Math.cos(a), uz = Math.sin(a);
    let top = -Infinity, last = 0;
    for (let i = 0; i < nt; i++) {
      const t = i * SIGHT.step, x = ex + ux * t, z = ez + uz * t;
      horizon[i] = top;
      if (t < SIGHT.near) { ang[i] = NaN; seen[i] = 0; continue; }
      if (x < E.x0 || x > E.x1 || z < E.z0 || z > E.z1) break;
      ang[i] = (ground.heightAt(x, z) - ey) / t; seen[i] = ang[i]! >= top ? 1 : 0; top = Math.max(top, ang[i]!); last = i;
    }
    // the lowest angle in view from SIGHT.shadow m beyond each distance out to the end
    const w = Math.round(shadow / SIGHT.step), low = new Float32Array(last + 2).fill(Infinity);
    for (let i = last; i >= 0; i--) low[i] = Math.min(low[i + 1]!, seen[i] ? ang[i]! : Infinity);
    for (let i = 0; i <= last; i++) { const l = i + w <= last ? low[i + w]! : Infinity; if (Number.isFinite(l)) cap[k * nt + i] = Math.max(l, horizon[i]!); }
  }
  const v = {b0, nb, nt, cap}; byShadow.set(shadow, v); return v;
}
/** The highest a top may stand at (x, z) without hiding ground in view from the summit, or undefined where it hides nothing (out of the
 *  frame, or no ground in view beyond it). The lower of the two bearings either side, so it holds between them. */
export function sightHeight(ground: Pick<Terrain, 'heightAt' | 'extent'>, x: number, z: number, shadow: number = SIGHT.shadow): number | undefined {
  const [ex, ey, ez] = KINNOULL_EYE.pos, d = Math.hypot(x - ex, z - ez), V = viewOf(ground, shadow), f = (bearingOff(x, z) - V.b0) / SIGHT.bearing;
  if (f < 0 || f > V.nb - 1 || d < SIGHT.near) return undefined;
  const i = Math.min(V.nt - 1, Math.round(d / SIGHT.step));
  let c = Infinity;
  for (const k of [Math.floor(f), Math.ceil(f)]) for (const j of [i - 1, i, i + 1]) if (j >= 0 && j < V.nt) { const v = V.cap[k * V.nt + j]!; if (!Number.isNaN(v)) c = Math.min(c, v); }
  return Number.isFinite(c) ? ey + c * d : undefined;
}

/** ASSUMED rock tones for Kinnoull's cliff (8703, 4307: pale grey andesite, lichen grey-green, cream and rust where it weathers). */
export const PERTH_ROCK_TONES = ['#8a877f', '#7d7a72', '#96918a', '#6f6c66', '#86826f', '#9a9384', '#7a7466', '#8f8b80'] as const;

const segDist = (x: number, z: number, a: Pt, b: Pt): number => {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz, u = L ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L)) : 0;
  return Math.hypot(x - a[0] - u * dx, z - a[1] - u * dz);
};
/** Is (x, z) on the cliff: steeper than WOODLAND.cliff.slope and within its reach of an OSM cliff line? */
export function onCliff(ground: Pick<Terrain, 'heightAt'>, cliffs: readonly (readonly Pt[])[], x: number, z: number): boolean {
  if (slopeOf(ground, x, z) <= WOODLAND.cliff.slope) return false;
  return cliffs.some(l => l.some((p, i) => i > 0 && segDist(x, z, l[i - 1]!, p) <= WOODLAND.cliff.reach));
}

/** Kinnoull's woodland for buildWaverleyCityGround (options.woodland); `canopy` (perth-canopy.ts) is where one draped canopy stands in
 *  for the massed crowns, so no massed tree is placed under it. */
export function kinnoullWoodland(ground: Pick<Terrain, 'heightAt' | 'extent'>, cliffs: readonly (readonly Pt[])[], canopy?: {inCanopy(x: number, z: number): boolean}): Woodland {
  const gorse: Pt[] = [], g = WOODLAND.gorse, [px, pz] = KINNOULL_PEAK;
  for (let a = 0; a < 360; a += 360 * g.step / (2 * Math.PI * g.inner)) for (const r of [g.inner, (g.inner + g.outer) / 2, g.outer]) {
    const x = px + r * Math.cos(a * Math.PI / 180), z = pz + r * Math.sin(a * Math.PI / 180);
    if (hash(x, z, 21) < g.keep) gorse.push([x + (hash(x, z, 22) - .5) * g.step, z + (hash(x, z, 23) - .5) * g.step]);
  }
  for (let x = px - g.slope[1]; x <= px + g.slope[1]; x += g.slopeStep) for (let z = pz - g.slope[1]; z <= pz + g.slope[1]; z += g.slopeStep) {
    const d = Math.hypot(x - px, z - pz); if (d < g.slope[0] || d > g.slope[1] || !inPanoramaNear(x, z) || hash(x, z, 24) >= g.slopeKeep) continue;
    gorse.push([x + (hash(x, z, 25) - .5) * g.slopeStep, z + (hash(x, z, 26) - .5) * g.slopeStep]);
  }
  return {
    size: (x, z, kind) => kind === 'scrub' ? 1 : WOODLAND.size[0] + (WOODLAND.size[1] - WOODLAND.size[0]) * (.6 * woodNoise(x, z) + .4 * hash(x, z, 31)),
    keep: (t: Tree) => {
      if (onCliff(ground, cliffs, t.x, t.z)) return false;
      if (canopy && t.kind === 'wood' && canopy.inCanopy(t.x, t.z)) return false;
      if (t.kind === 'wood' && !t.hanging && woodNoise(t.x, t.z) < WOODLAND.clump) return false;
      const s = sightHeight(ground, t.x, t.z); if (s !== undefined && t.kind !== 'tree' && t.y + t.height > s - WOODLAND.sight.clear) return false;
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

/** ASSUMED crag form (round 3, C1; round 4 from the round-3 score). 8703 shows Kinnoull's face as pale grey rock in broken blocks with
 *  dark joints, ledges and scrub, not a smooth ramp; the 16 m terrain can only draw the ramp, and round 3's boxes stood out of it as
 *  shelves. So irregular slabs are laid flush on the cliff's steepest ground (onCliff, over `slope` deg) on a `step` m lattice: each
 *  `width` m across and `height` m down the fall line, its four corners pulled in or out by up to `ragged` of its size, its base seated
 *  `bury` m under the drawn ground (the terrain plus `drape`) at every corner, its face `proud` m over it and bevelled in by `bevel` of
 *  its size (the drawn ground's facets on the cliff stand up to half a metre off the terrain's own height, so less is lost under it). The face is one of
 *  PERTH_ROCK_TONES lifted by `lift`; the bevels are shaded `joint` (dark joints between the slabs) and, on a share `scrub` of the
 *  slabs, the uphill bevel is a ledge of scrub in WOODLAND.gorseRgb. None within `eyeClear` m of the cliff camera, nor within `keep`
 *  of the given points (the tower's foot and annexe). */
/** pt-kinnoull-cliff's eye (tools/evidence.mjs FROZEN_PERTH_CAMERAS), which stands on the gully's rim: no crag block within
 *  CRAG.eyeClear m of it, so none fills the frame's foreground. */
export const CLIFF_EYE = [2460, 172.2, 295] as const;
export const CRAG = {eyeClear: 60, step: 6, width: [6.5, 10] as const, height: [5, 7.5] as const, ragged: .25, proud: [.8, 1.4] as const,
  bevel: .16, bury: 1, jitter: 2, lift: 1.3, joint: .38, scrub: .22, slope: 40} as const;
type V3 = [number, number, number];
export interface CragBlock {
  /** the slab's middle on the ground */
  x: number; z: number;
  /** its corners on the ground and on its face, in the same order round it */
  base: [V3, V3, V3, V3]; face: [V3, V3, V3, V3];
  /** which bevel (index i: from corner i to i + 1) faces uphill: the ledge */
  ledge: number;
  rgb: [number, number, number]; joint: [number, number, number]; scrub: boolean;
}
/** The crag's slabs (CRAG), clear of `keep` (x, z, radius m). Colours are linear 0-1 channels, as Batch colours. */
export function kinnoullCrag(ground: Pick<Terrain, 'heightAt'>, cliffs: readonly (readonly Pt[])[], keep: readonly (readonly [number, number, number])[] = [], drape = 0): CragBlock[] {
  const C = CRAG, out: CragBlock[] = [];
  let ax = Infinity, az = Infinity, bx = -Infinity, bz = -Infinity;
  for (const l of cliffs) for (const [x, z] of l) { ax = Math.min(ax, x); az = Math.min(az, z); bx = Math.max(bx, x); bz = Math.max(bz, z); }
  const r = WOODLAND.cliff.reach, lin = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255].map(v => (v / 255) ** 2.2) as V3; };
  for (let gx = Math.floor((ax - r) / C.step) * C.step; gx <= bx + r; gx += C.step) for (let gz = Math.floor((az - r) / C.step) * C.step; gz <= bz + r; gz += C.step) {
    const x = gx + (hash(gx, gz, 61) - .5) * C.jitter, z = gz + (hash(gx, gz, 62) - .5) * C.jitter;
    if (!onCliff(ground, cliffs, x, z) || slopeOf(ground, x, z) < C.slope || Math.hypot(x - CLIFF_EYE[0], z - CLIFF_EYE[2]) < C.eyeClear) continue;
    if (keep.some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr)) continue;
    // the fall line (down the slope) and across it, in plan
    const dx = ground.heightAt(x - 2, z) - ground.heightAt(x + 2, z), dz = ground.heightAt(x, z - 2) - ground.heightAt(x, z + 2), l = Math.hypot(dx, dz) || 1;
    const fx = dx / l, fz = dz / l, w = C.width[0] + (C.width[1] - C.width[0]) * hash(gx, gz, 63), h = C.height[0] + (C.height[1] - C.height[0]) * hash(gx, gz, 64);
    // the plan footprint of a slab `h` m down the slope: its plan depth is the slope's run over that length
    const g = l / 4, run = h / Math.hypot(1, g);
    const corners: [number, number][] = [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]];
    const base = corners.map(([u, v], k) => {
      const ru = 1 + (hash(gx + k, gz, 67) - .5) * 2 * C.ragged, rv = 1 + (hash(gx, gz + k, 68) - .5) * 2 * C.ragged;
      const px = x + (-fz) * u * w * ru + fx * v * run * rv, pz = z + fx * u * w * ru + fz * v * run * rv;
      return [px, ground.heightAt(px, pz) + drape - C.bury, pz] as V3;
    }) as CragBlock['base'];
    // the face: the base drawn in towards its middle by `bevel` and stood out along the slope's normal
    const nl = Math.hypot(dx / 4, 1, dz / 4), n: V3 = [dx / 4 / nl, 1 / nl, dz / 4 / nl], proud = C.proud[0] + (C.proud[1] - C.proud[0]) * hash(gx, gz, 65);
    const mx = base.reduce((a, p) => a + p[0], 0) / 4, mz = base.reduce((a, p) => a + p[2], 0) / 4;
    // seated `proud` m over the ground under each face corner, so the slab follows the face's curve and never sinks into it
    const face = base.map(p => { const fx2 = p[0] + (mx - p[0]) * C.bevel + n[0] * proud, fz2 = p[2] + (mz - p[2]) * C.bevel + n[2] * proud; return [fx2, ground.heightAt(fx2, fz2) + drape + proud, fz2] as V3; }) as CragBlock['face'];
    const tone = lin(PERTH_ROCK_TONES[Math.floor(hash(gx, gz, 66) * PERTH_ROCK_TONES.length)]!), rgb = tone.map(v => Math.min(1, v * C.lift)) as V3;
    // corners 0-1 lie uphill (v = -0.5: against the fall line)
    out.push({x, z, base, face, ledge: 0, rgb, joint: rgb.map(v => v * C.joint) as V3, scrub: hash(gx, gz, 69) < C.scrub});
  }
  return out;
}
/** The scrub ledge's tone (linear), WOODLAND.gorseRgb. */
export const CRAG_SCRUB = WOODLAND.gorseRgb.map(v => v) as [number, number, number];
