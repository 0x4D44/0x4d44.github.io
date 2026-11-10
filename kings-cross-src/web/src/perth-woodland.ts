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

/** ASSUMED crag form (round 5, from the round-4 score: "a face, not plates"). 8703 shows Kinnoull's face as a broken grey cliff in steps:
 *  near-vertical risers with vertical joints, narrow ledges with scrub on them. The 16 m terrain can only draw a ramp, and the DTM is not
 *  edited, so the cliff's steepest ground (onCliff, over `slope` deg) is shaped into steps over it: the terrain, roughened by `wobble` m
 *  of noise, is contoured every `band` m on a `grid` m lattice (marching squares), and along each contour stands a vertical riser of rock
 *  from `bury` m under the drawn ground (the terrain plus `drape`) to `rise` m over the terrain, its top level along each `grid`-long
 *  piece and stepping between pieces (the vertical joints). Each riser's top carries a level ledge back into the slope until it meets
 *  the ground, its depth capped by `ledge`. Risers are PERTH_ROCK_TONES lifted by `lift` (flat-shaded, so each piece's turn shows as a joint); a share
 *  `scrub` of the ledges are scrub (WOODLAND.gorseRgb), the rest worn earth-grey. None within `eyeClear` m of the cliff camera, nor
 *  within `keep` of the given points (the tower's foot and annexe). */
/** pt-kinnoull-cliff's eye (tools/evidence.mjs FROZEN_PERTH_CAMERAS), which stands on the gully's rim: no crag within
 *  CRAG.eyeClear m of it, so none fills the frame's foreground. */
export const CLIFF_EYE = [2460, 172.2, 295] as const;
/** `slope` rose from 40 to 41.5 deg in round 6, paying the piers' rounder shafts (PIER_FORM.sides) from the crag's gentlest risers. */
export const CRAG = {eyeClear: 60, slope: 41.5, grid: 5, band: 6, wobble: 1.6, bury: 1, rise: [2.6, 6.4] as const, ledge: [.6, 6] as const,
  lift: 1.3, scrub: .3, ledgeRgb: [.34, .33, .31] as const, column: 11, jointWidth: 3, jointDepth: 90, joints: .13, joint: .3, aspect: 1.5, innerAspect: 3, setback: .5,
  offset: .5, through: [.7, .84] as const, thruMin: 4.8, crack: 1, ledgeRun: 9, pale: [.36, .35, .33] as const, paleMix: .65,
  moss: [.07, .085, .03] as const, mossMix: .6} as const;
/** Round 11 (round-10 score: the columns were dark, flat boxes, near black in shade, where 8703's crag is pale grey with green-brown
 *  growth in its joints; one tall, narrow pale slab stood proud of the face). A through-riser's tone goes `paleMix` of the way to
 *  `pale` (linear, about 1.2 times the face's median grey), each joint's crack `mossMix` of the way to `moss`, a dark green-brown; and
 *  a through-riser needs a piece `thruMin` 4.8 m long (round 8: 3 m), so no narrow slab stands taller than about twice its width.
 *  ASSUMED tones, by eye against 8703. */
/** Round 10 (round-9 score: the face read coursed again; the cap had cut the through-risers from 332 to 9). A through-riser inside the
 *  face, with crag cells below it and above it up past its top, may stand `innerAspect` (3) times its piece's length; at the foot and
 *  against the sky every riser keeps the `aspect` cap, and one-course risers keep it everywhere. The columns come more often
 *  (`through` 0.7 and 0.84, from 0.74 and 0.88), and the joints run in `jointDepth` 90 m bands up the face (from 60), so a crack runs
 *  on through more courses. */
/** Round 9 (round-8 score: the toe fins were still there, and the 1 m cracks did not read). A riser is at most `aspect` times as tall
 *  as its piece is long: it drops courses to fit, a one-course riser is cut down to fit, and a piece too short to stand `rise[0]` m at
 *  that aspect is left out. The crack is set `setback` m back into the slope, in `joint` (0.3) of the rock's tone: a shadowed slot. */
/** Round 8 (round-7 score: thin through-risers stood out as toe fins; a joint darkened its whole piece, a dark buttress several
 *  metres wide). A riser runs through extra courses only where its piece is at least `thruMin` m long. A joint is a `crack` m sliver
 *  at the piece's `b` end, in `joint` of the rock's tone (`crackRgb`), the rest of the piece rock; each crack adds one quad, so the
 *  joint share drops from 0.2 to `joints` to stay in the triangle budget. */
/** Round 7 (round-6 score: the courses still ran level; the joints were keyed to plan cells, so they did not run up the face, and at
 *  0.35 read as black blocks). Each column's riser tops shift by up to `offset` of a band either way (the column noise), and where a
 *  second, coarser noise passes `through[0]` (or `through[1]`) the riser stands one (or two) courses taller, a face running through
 *  2-3 courses, its ledge deeper to match. The joints are keyed to the position along the face (`jointWidth` m strips across the
 *  face's mean direction, in `jointDepth` m bands up it), so the same strip is dark on every course, at `joint` of its tone: a
 *  shadowed crack. Tones follow the `column` noise (round 6 used 0.8 of it, 8.8 m, against its own comment). */
/** Round 6 (round-5 score: "walls, not rock"; the courses ran level and the brown drape showed between them). The face now runs in
 *  vertical columns: each riser's height and tone follow smooth noise on `column` m cells (60% of the height), so a column of tall,
 *  like-toned risers stacks up the face across the courses, beside lower ones; risers in a share `joints` of 7 m plan cells were (round 7: keyed to the face instead)
 *  dark joints (`joint` of their tone), which line up from course to course as vertical cracks. Each ledge runs back to the next course
 *  (the band's run at the local grade, up to `ledge`), so it covers the drape between the courses; the ledges are rock-grey, a share
 *  `scrub` of them scrub. */
type V3 = [number, number, number];
export interface CragStep {
  /** the riser's ends on the ground (plan), its foot and its top (y), the uphill direction (plan), the ledge's depth */
  a: Pt; b: Pt; foot: [number, number]; top: number; up: Pt; ledge: number;
  rgb: V3; scrub: boolean; joint: boolean;
  /** a joint's crack: its width (m, at the `b` end) and its tone */
  crack: number; crackRgb: V3;
  /** how many courses the riser runs through (1-3) */
  courses: number;
}
/** Round 6 (round-5 score: the brown, streaked drape showed between the courses, so each read as a wall on an earth bank). The drape's
 *  map is repainted round the crag's steps (every `cell` m cell within `reach` m of a riser's ends or its ledge's back), each cell one
 *  of PERTH_ROCK_TONES shaded `shade` (the ground between the risers is in their shadow) at `alpha`, so it is the same grey rock (the
 *  shared paint's buff wash and dark wet streaks go under it), and the grass round the crag is left alone. Perth-only: it paints the
 *  Perth cover's own canvas after the shared builder, and draws nothing new. */
export const CLIFF_PAINT = {cell: 4, reach: 3, shade: .7, alpha: .9} as const;
/** The crag's repainted cells (CLIFF_PAINT) round `steps`: each cell's corner (x, z) and its tone. */
export function cliffPaintCells(steps: readonly CragStep[]): {x: number; z: number; tone: string}[] {
  const P = CLIFF_PAINT, seen = new Set<string>(), out: {x: number; z: number; tone: string}[] = [];
  const tones = PERTH_ROCK_TONES.map(t => { const n = parseInt(t.slice(1), 16); return `rgb(${[n >> 16, n >> 8 & 255, n & 255].map(v => Math.round(v * P.shade)).join(',')})`; });
  const mark = (px: number, pz: number) => {
    for (let x = Math.floor((px - P.reach) / P.cell) * P.cell; x <= px + P.reach; x += P.cell) for (let z = Math.floor((pz - P.reach) / P.cell) * P.cell; z <= pz + P.reach; z += P.cell) {
      const k = `${x},${z}`; if (seen.has(k)) continue; seen.add(k); out.push({x, z, tone: tones[Math.floor(hash(x, z, 78) * tones.length)]!});
    }
  };
  for (const k of steps) { const mx = (k.a[0] + k.b[0]) / 2, mz = (k.a[1] + k.b[1]) / 2; mark(k.a[0], k.a[1]); mark(k.b[0], k.b[1]); mark(mx + k.up[0] * k.ledge, mz + k.up[1] * k.ledge); }
  return out;
}
/** The crag's steps (CRAG), clear of `keep` (x, z, radius m). Colours are linear 0-1 channels, as Batch colours. */
export function kinnoullCrag(ground: Pick<Terrain, 'heightAt'>, cliffs: readonly (readonly Pt[])[], keep: readonly (readonly [number, number, number])[] = [], drape = 0): CragStep[] {
  const C = CRAG, G = C.grid, out: CragStep[] = [];
  let ax = Infinity, az = Infinity, bx = -Infinity, bz = -Infinity;
  for (const l of cliffs) for (const [x, z] of l) { ax = Math.min(ax, x); az = Math.min(az, z); bx = Math.max(bx, x); bz = Math.max(bz, z); }
  const r = WOODLAND.cliff.reach, lin = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255].map(v => (v / 255) ** 2.2) as V3; };
  // the roughened height the steps follow: low-frequency noise on 23 m and 9 m cells
  const vn = (x: number, z: number, c: number, k: number) => { const gx = Math.floor(x / c), gz = Math.floor(z / c), fx = x / c - gx, fz = z / c - gz, v = (i: number, j: number) => hash((gx + i) * c, (gz + j) * c, k); return (v(0, 0) * (1 - fx) + v(1, 0) * fx) * (1 - fz) + (v(0, 1) * (1 - fx) + v(1, 1) * fx) * fz; };
  const rough = (x: number, z: number) => ground.heightAt(x, z) + C.wobble * (2 * vn(x, z, 23, 71) + vn(x, z, 9, 72) - 1.5);
  const x0 = Math.floor((ax - r) / G) * G, z0 = Math.floor((az - r) / G) * G, nx = Math.ceil((bx + r - x0) / G) + 1, nz = Math.ceil((bz + r - z0) / G) + 1;
  const hv = new Float32Array(nx * nz); for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) hv[j * nx + i] = rough(x0 + i * G, z0 + j * G);
  // the crag's cells (round 10: a riser is inside the face when crag cells lie below it and above it, up past its top)
  const live = new Uint8Array(nx * nz);
  for (let j = 0; j + 1 < nz; j++) for (let i = 0; i + 1 < nx; i++) {
    const cx = x0 + (i + .5) * G, cz = z0 + (j + .5) * G;
    if (!onCliff(ground, cliffs, cx, cz) || slopeOf(ground, cx, cz) < C.slope || Math.hypot(cx - CLIFF_EYE[0], cz - CLIFF_EYE[2]) < C.eyeClear) continue;
    if (keep.some(([kx, kz, kr]) => Math.hypot(cx - kx, cz - kz) < kr)) continue;
    live[j * nx + i] = 1;
  }
  const isCrag = (x: number, z: number) => { const i = Math.floor((x - x0) / G), j = Math.floor((z - z0) / G); return i >= 0 && j >= 0 && i + 1 < nx && j + 1 < nz && live[j * nx + i] === 1; };
  for (let j = 0; j + 1 < nz; j++) for (let i = 0; i + 1 < nx; i++) {
    const cx = x0 + (i + .5) * G, cz = z0 + (j + .5) * G;
    if (!live[j * nx + i]) continue;
    const c: [number, number, number][] = [[x0 + i * G, z0 + j * G, hv[j * nx + i]!], [x0 + (i + 1) * G, z0 + j * G, hv[j * nx + i + 1]!], [x0 + (i + 1) * G, z0 + (j + 1) * G, hv[(j + 1) * nx + i + 1]!], [x0 + i * G, z0 + (j + 1) * G, hv[(j + 1) * nx + i]!]];
    const lo = Math.min(...c.map(q => q[2])), hi = Math.max(...c.map(q => q[2]));
    // the uphill direction over the cell, in plan
    const gx = ground.heightAt(cx + 2, cz) - ground.heightAt(cx - 2, cz), gz = ground.heightAt(cx, cz + 2) - ground.heightAt(cx, cz - 2), gl = Math.hypot(gx, gz) || 1, up: Pt = [gx / gl, gz / gl], grade = gl / 4;
    for (let L = Math.ceil(lo / C.band) * C.band; L < hi; L += C.band) {
      // where the contour at L crosses the cell's edges
      const cut: Pt[] = [];
      for (let e = 0; e < 4; e++) { const p = c[e]!, q = c[(e + 1) % 4]!; if ((p[2] < L) !== (q[2] < L)) { const f = (L - p[2]) / (q[2] - p[2]); cut.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]); } }
      for (let k = 0; k + 1 < cut.length; k += 2) {
        const a = cut[k]!, b = cut[k + 1]!, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, ya = ground.heightAt(a[0], a[1]), yb = ground.heightAt(b[0], b[1]);
        if (!onCliff(ground, cliffs, mx, mz)) continue;
        // the column's height and tone (smooth across the courses), and whether this piece is a joint (its cell's, the same course to course)
        const col = vn(mx, mz, C.column, 76), thru = vn(mx, mz, C.column * 1.5, 80);
        const base = C.rise[0] + (C.rise[1] - C.rise[0]) * Math.min(1, .6 * col + .4 * hash(Math.round(mx), Math.round(mz), 73));
        const one = Math.max(C.rise[0], base + (vn(mx, mz, C.column, 79) - .5) * 2 * C.offset * C.band);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len * C.aspect < C.rise[0]) continue; // too short to stand as a riser: a fin, not a face
        let courses = len < C.thruMin ? 1 : thru > C.through[1] ? 3 : thru > C.through[0] ? 2 : 1, rise = one + (courses - 1) * C.band;
        // round 10: a through-riser inside the face (crag below it, and above it up past its top) may stand `innerAspect` times its
        // length; at the foot and against the sky every riser keeps the `aspect` cap
        const inside = (r: number) => { if (!isCrag(mx - up[0] * G, mz - up[1] * G)) return false; const run = r / Math.max(grade, .3) + G; for (let d = G; d <= run; d += G) if (!isCrag(mx + up[0] * d, mz + up[1] * d)) return false; return true; };
        while (courses > 1 && rise > len * (inside(rise) ? C.innerAspect : C.aspect)) { courses--; rise -= C.band; }
        if (courses === 1) rise = Math.min(rise, len * C.aspect);
        let top = Math.max(ya, yb) + rise;
        let ledge = Math.max(C.ledge[0], Math.min(C.ledge[1], Math.max(C.band, rise - drape) / Math.max(grade, .3)));
        // a through-riser's ledge runs uphill until it meets the drawn ground; where the slope gives out first, it runs one course fewer
        while (courses > 1) {
          let d = 0; while (d < C.ledge[1] * (2 * courses - 1) && ground.heightAt(mx + up[0] * d, mz + up[1] * d) + drape < top - .3) d += .5;
          if (ground.heightAt(mx + up[0] * d, mz + up[1] * d) + drape >= top - .3) { ledge = Math.max(C.ledge[0], d); break; }
          courses--; rise -= C.band; top -= C.band;
          if (courses === 1) ledge = Math.max(C.ledge[0], Math.min(C.ledge[1], Math.max(C.band, rise - drape) / Math.max(grade, .3)));
        }
        // round 8: a one-course ledge that stops short of the drawn slope runs on uphill (up to `ledgeRun` m) until it meets it
        if (courses === 1) { const meets = (d: number) => ground.heightAt(mx + up[0] * d, mz + up[1] * d) + drape >= top - .3; let d = ledge; while (!meets(d) && d < C.ledgeRun) d += .5; if (meets(d)) ledge = d; }
        const base0 = lin(PERTH_ROCK_TONES[Math.min(PERTH_ROCK_TONES.length - 1, Math.floor(vn(mx, mz, C.column, 74) * PERTH_ROCK_TONES.length))]!).map(v => Math.min(1, v * C.lift)) as V3;
        const tone = (courses > 1 ? base0.map((v, c) => v + (C.pale[c]! - v) * C.paleMix) : base0) as V3; // round 11: pale columns
        out.push({a, b, foot: [ya + drape - C.bury, yb + drape - C.bury], top, up, ledge, rgb: tone, scrub: hash(Math.round(mx), Math.round(mz), 75) < C.scrub, joint: false, crack: 0, crackRgb: tone, courses});
      }
    }
  }
  // the joints, keyed to the position along the face (its mean direction), so a strip is dark course over course
  const face = cragFace(out);
  for (const k of out) { const [s, d] = face(k); if (hash(Math.floor(s / C.jointWidth), Math.floor(d / C.jointDepth), 77) < C.joints && Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1]) > C.crack + .5) { k.joint = true; k.crack = C.crack; k.crackRgb = k.rgb.map((v, c) => v * C.joint + (C.moss[c]! - v * C.joint) * C.mossMix) as V3; } } // round 11: green-brown
  return out;
}
/** The crag's face frame: a step's midpoint as (along the face's mean direction, up it), in m. */
export function cragFace(steps: readonly CragStep[]): (k: CragStep) => [number, number] {
  let ux = 0, uz = 0; for (const k of steps) { ux += k.up[0]; uz += k.up[1]; }
  const l = Math.hypot(ux, uz) || 1, U: Pt = [ux / l, uz / l], T: Pt = [-U[1], U[0]];
  return k => { const mx = (k.a[0] + k.b[0]) / 2, mz = (k.a[1] + k.b[1]) / 2; return [mx * T[0] + mz * T[1], mx * U[0] + mz * U[1]]; };
}
/** The scrub ledge's tone (linear): WOODLAND.gorseRgb darkened, as a top-lit ledge would otherwise read as bright lawn (round 5). */
export const CRAG_SCRUB = WOODLAND.gorseRgb.map(v => v * .6) as [number, number, number];
