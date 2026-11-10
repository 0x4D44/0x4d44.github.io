// P1 station: the track, the platforms and the station roof. perth-scene.ts calls these once, in this order, and adds what they fill to its
// track, platforms and roof parts. Horizontal geometry is OSM (ODbL, core/perth-data.ts). ASSUMED, not measured Perth dimensions: the
// 0.915 m platform height, rail and sleeper sizes, the deck depth. The roof, the island building, the canopies, the footbridges and the
// fittings are planned and shaped in perth-station-structure.ts, from the photographs in gfx-rubrics/perth-station.md (sources there).
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {WaverleyArea, WaverleyScene as PerthData} from '../../core/waverley-data.ts';
import {PERTH_STATION_BUILDING_ID} from '../../core/perth-data.ts';
import {Batch, material} from './materials.ts';
import type {V2, V3} from './materials.ts';
import {WAVERLEY_LEVELS, fillSurface, walls} from './waverley-mesh.ts';
import {stationTexture} from './waverley-station-textures.ts';
import {paintMaterial} from './waverley-station-structure.ts';
import {islandBuildingBatches, PERTH_DIAL, PERTH_PAINT, PERTH_RAMP_FENCE, perthRoofOver, platformParts, titeRoofBatches, PERTH_ROOF_RIDGE, PERTH_STATION, perthStationBatches, perthStationPlan, toWorld} from './perth-station-structure.ts';
import type {PerthStationBatches} from './perth-station-structure.ts';
import {railStrip, stationTrackSegments} from './station-railway.ts';
import type {TrackSegment} from './station-railway.ts';
import type {PerthBuild} from './perth-scene.ts';

/** ASSUMED levels: Waverley's preview datum and track dimensions (waverley-mesh.ts), and a deck under track on a mapped bridge. */
export const PERTH_LEVELS = {...WAVERLEY_LEVELS, deckTop: -.3, deckDepth: 1.2, deckHalfWidth: WAVERLEY_LEVELS.ballastHalfWidth + .6} as const;

/** The rails on a mapped bridge, which stand on a deck rather than pull the ground up (bridge=yes, or any bridge tag but "no"). */
export const onBridge = (tags: Record<string, string>): boolean => !!tags.bridge && tags.bridge !== 'no';
/** The surface track segments, split into those on the ground and those on a mapped bridge. */
/** The covered platforms' concrete (R-pt1-d north: smooth grey with fine joints). ASSUMED shade. */
export const PERTH_CONCRETE = 0x9a9b99;
/** The platform surfaces' detail maps (round 4), multiplied over the material colour; UVs are world metres (fillSurface). Built as data
 *  (deterministic hash noise), so they need no canvas: 'asphalt' a fine grain over a 2 m tile; 'concrete' a faint grain with a 2 mm
 *  joint every 1.5 m both ways. ASSUMED scales. Cached per kind, as stationTexture's are: the scene disposes its materials, not their
 *  maps, so one shared texture per kind is never leaked by a rebuild. */
const surfaceCache = new Map<string, THREE.DataTexture>();
export const PERTH_SURFACE_TILE = {asphalt: 2, concrete: 3, ashlar: 2.4, px: 128, joint: 1.5} as const;
/** Round 5: the island building's ashlar (R-pt1-a, R-pt1-a2: grey-buff squared stone in regular courses, not a chequer). In its UVs (two
 *  to the metre, islandBuildingBatches) one tile is 1.2 m of wall: four 0.3 m courses, blocks 0.45-0.9 m long by a hash, a fine dark
 *  joint, each block's tone within 6 % of the next. ASSUMED sizes. */
export const PERTH_ASHLAR = {px: 256, courses: 4, block: [.45, .9] as const, joint: .8} as const;
export function perthSurfaceTexture(kind: 'asphalt' | 'concrete' | 'ashlar'): THREE.DataTexture {
  const hit = surfaceCache.get(kind); if (hit) return hit;
  const T = PERTH_SURFACE_TILE, n = kind === 'ashlar' ? PERTH_ASHLAR.px : T.px, tile = T[kind], data = new Uint8Array(n * n * 4);
  const hash = (x: number, y: number): number => { let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  const every = Math.round(n * T.joint / tile);
  if (kind === 'ashlar') {
    const A = PERTH_ASHLAR, ch = n / A.courses, m = n / (tile / 2);
    for (let row = 0; row < A.courses; row++) {
      // The row's joints: from a hashed start, blocks of hashed length, wrapping across the tile.
      const cuts: number[] = []; let x = Math.floor(hash(row, 7) * n);
      while (cuts.length < 12) { cuts.push(x % n); x += Math.round((A.block[0] + (A.block[1] - A.block[0]) * hash(row, cuts.length)) * m); if (x - cuts[0] > n - A.block[0] * m) break; }
      cuts.sort((a, b) => a - b);
      for (let y = Math.round(row * ch); y < Math.round((row + 1) * ch); y++) for (let x2 = 0; x2 < n; x2++) {
        const bi = cuts.filter(c => c <= x2).length, tone = .94 + .06 * hash(row * 31 + bi, 3), grain = .97 + .03 * hash(x2, y);
        const joint = y === Math.round(row * ch) || cuts.includes(x2) ? A.joint : 1, v = Math.round(255 * tone * grain * joint), k = 4 * (y * n + x2);
        data[k] = data[k + 1] = data[k + 2] = v; data[k + 3] = 255;
      }
    }
  } else for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const grain = kind === 'asphalt' ? .86 + .14 * hash(x, y) : .95 + .05 * hash(x, y);
    const joint = kind === 'concrete' && (x % every === 0 || y % every === 0) ? .86 : 1, v = Math.round(255 * grain * joint), k = 4 * (y * n + x);
    data[k] = data[k + 1] = data[k + 2] = v; data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / tile, 1 / tile); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true; t.name = `perth-${kind}`;
  surfaceCache.set(kind, t);
  return t;
}
/** Round 5: the spandrels' pierced pattern (R-pt1-a, R-pt1-c: circles in the plate between scrolled ribs): a `cell` m square repeat, a
 *  round hole of radius `hole` m at each cell's centre and quarter holes of `corner` m at its corners, so the holes read as rings
 *  between diamonds. Alpha 0 in the holes. ASSUMED sizes. Cached, as perthSurfaceTexture's are. */
export const PERTH_PIERCED = {cell: .3, hole: .1, corner: .05, px: 64} as const;
let pierced: THREE.DataTexture | undefined;
export function perthPiercedTexture(): THREE.DataTexture {
  if (pierced) return pierced;
  const P = PERTH_PIERCED, n = P.px, data = new Uint8Array(n * n * 4), m = n / P.cell;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const cx = (x + .5) / m - P.cell / 2, cy = (y + .5) / m - P.cell / 2, ex = Math.min((x + .5) / m, P.cell - (x + .5) / m), ey = Math.min((y + .5) / m, P.cell - (y + .5) / m);
    const hole = Math.hypot(cx, cy) < P.hole || Math.hypot(ex, ey) < P.corner, k = 4 * (y * n + x);
    data[k] = data[k + 1] = data[k + 2] = 255; data[k + 3] = hole ? 0 : 255;
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / P.cell, 1 / P.cell); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true; t.name = 'perth-pierced';
  return pierced = t;
}
/** Round 7 (S4, the round-6 score: "ticks, not Roman numerals"): the clocks' dial (R-pt1-a2): black Roman numerals I to XII (IIII for four,
 *  as on R-pt1-a2's dial), each upright to the rim, on white inside a two-line minute track; laid out by PERTH_DIAL (perth-station-structure.ts)
 *  in fractions of the dial's radius. u right, v up, the dial's centre at (0.5, 0.5); row 0 is v 0. Built as data, cached. */
export const PERTH_ROMAN = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'] as const;
let dial: THREE.DataTexture | undefined;
export function perthDialTexture(): THREE.DataTexture {
  if (dial) return dial;
  const D = PERTH_DIAL, n = D.px, data = new Uint8Array(n * n * 4).fill(255), h = D.height, sw = D.stroke / 2, gap = .08 * h;
  // Each numeral's strokes in its own frame (x across, y up the radius), in dial radii, centred on the numeral.
  type Seg = [number, number, number, number];
  const glyphs = PERTH_ROMAN.map(s => {
    const width = (c: string): number => c === 'I' ? .12 * h : .6 * h, total = [...s].reduce((a, c) => a + width(c), 0) + gap * (s.length - 1), segs: Seg[] = [];
    let x = -total / 2;
    for (const c of s) {
      const w = width(c), m = x + w / 2, t = h / 2;
      if (c === 'I') segs.push([m, -t, m, t]);
      else if (c === 'V') segs.push([x, t, m, -t], [m, -t, x + w, t]);
      else segs.push([x, t, x + w, -t], [x, -t, x + w, t]);
      x += w + gap;
    }
    return segs;
  });
  const near = (px: number, py: number, [ax, ay, bx, by]: Seg): number => {
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + .5) / n * 2 - 1, y = (j + .5) / n * 2 - 1, r = Math.hypot(x, y);
    let ink = Math.abs(r - D.track[0]) < sw / 2 || Math.abs(r - D.track[1]) < sw / 2;
    if (!ink && Math.abs(r - D.numerals) < h) {
      // The nearest hour (clockwise from twelve), and the pixel in that numeral's frame: up along the radius, across clockwise.
      const k = ((Math.round((Math.PI / 2 - Math.atan2(y, x)) / (Math.PI / 6)) % 12) + 12) % 12, a = Math.PI / 2 - k * Math.PI / 6;
      const ux = Math.cos(a), uy = Math.sin(a), cx = x - ux * D.numerals, cy = y - uy * D.numerals;
      const gx = cx * uy - cy * ux, gy = cx * ux + cy * uy;
      ink = glyphs[k].some(s => near(gx, gy, s) < sw);
    }
    if (ink) { const q = 4 * (j * n + i); data[q] = data[q + 1] = data[q + 2] = 20; }
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; t.name = 'perth-dial';
  return dial = t;
}
/** Round 8 (S2): R-pt1-a's ring ornament in the arched braces at the column heads (its top right: open iron circles, each with a scroll
 *  curled inside, filling the spandrel between the curved brace and the girder over it). Round 9 (the round-8 score: the rings were too
 *  small, cut to lower arcs where the brace is shallow, and lost on far braces): one ring per tile, drawn on its own square
 *  (perth-station-structure.ts PERTH_BRACE_RINGS sizes and places each to fit its corner), its UVs 0-1 across the square. A cut-out (alpha
 *  0 but on the iron): a ring of centre-line radius `ring`, `bar` wide, with a C-scroll of radius `scroll` inside, open on its `gap`
 *  (radians) toward +u; all in UV units (the square is 1). The mip levels are built by hand, each texel's alpha the MAX of the four
 *  under it, so a thin bar keeps alpha over the cut (alphaTest .5) as the brace recedes, where averaged mips fade it out. Cached. */
export const PERTH_RING_ORNAMENT = {ring: .44, bar: .07, scroll: .2, scrollBar: .06, gap: 1.6, px: 256} as const;
let rings: THREE.DataTexture | undefined;
export function perthRingTexture(): THREE.DataTexture {
  if (rings) return rings;
  const R = PERTH_RING_ORNAMENT, n = R.px, data = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + .5) / n - .5, y = (j + .5) / n - .5, r = Math.hypot(x, y), a = Math.abs(Math.atan2(y, x));
    const iron = Math.abs(r - R.ring) < R.bar / 2 || (Math.abs(r - R.scroll) < R.scrollBar / 2 && a > R.gap / 2), q = 4 * (j * n + i);
    data[q] = data[q + 1] = data[q + 2] = 255; data[q + 3] = iron ? 255 : 0;
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  const mips: {data: Uint8Array; width: number; height: number}[] = [{data, width: n, height: n}];
  for (let w = n / 2; w >= 1; w /= 2) {
    const up = mips[mips.length - 1].data, uw = w * 2, d = new Uint8Array(w * w * 4);
    for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
      const q = 4 * (j * w + i); d[q] = d[q + 1] = d[q + 2] = 255;
      d[q + 3] = Math.max(up[4 * (2 * j * uw + 2 * i) + 3], up[4 * (2 * j * uw + 2 * i + 1) + 3], up[4 * ((2 * j + 1) * uw + 2 * i) + 3], up[4 * ((2 * j + 1) * uw + 2 * i + 1) + 3]);
    }
    mips.push({data: d, width: w, height: w});
  }
  t.mipmaps = mips as unknown as THREE.DataTexture['mipmaps'];
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = false; t.anisotropy = 8; t.needsUpdate = true; t.name = 'perth-rings';
  return rings = t;
}
/** Round 9 (S3, the round-8 score: "the ramp still reads as a flat red quad"): the ramps' own finish, so the slope reads where it leaves
 *  the deck: pale broom-finished concrete crossed by grip grooves, `groove` m wide every `pitch` m down the slope, on a light concrete
 *  grey (`color`), where the deck is red asphalt. Its UVs are track metres across and down the ramp (u = z', v = x'). ASSUMED finish (no
 *  photograph shows the ramps; grooved concrete is the usual finish of a platform-end ramp). Cached. */
export const PERTH_RAMP_FINISH = {color: 0xb4b2ab, foot: .5, pitch: .15, groove: .035, tone: .58, tile: .6, px: 128} as const;
let rampFinish: THREE.DataTexture | undefined;
export function perthRampTexture(): THREE.DataTexture {
  if (rampFinish) return rampFinish;
  const F = PERTH_RAMP_FINISH, n = F.px, data = new Uint8Array(n * n * 4), m = n / F.tile;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const v = (j + .5) / m, d = ((v % F.pitch) + F.pitch) % F.pitch, groove = Math.min(d, F.pitch - d) < F.groove / 2;
    const broom = .94 + .06 * (((i * 7919 + j * 104729) % 97) / 97), q = 4 * (j * n + i), g = Math.round(255 * (groove ? F.tone : broom));
    data[q] = data[q + 1] = data[q + 2] = g; data[q + 3] = 255;
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / F.tile, 1 / F.tile); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; t.name = 'perth-ramp-finish';
  return rampFinish = t;
}
/** Round 8 (S3): Rosser1954's close steel mesh (the fence across the 4/5 island's south end: grey welded-mesh panels) as a cut-out over
 *  the fence's panels, whose UVs are metres along the fence and up: vertical wires every `pitch[0]` m, horizontal every `pitch[1]` m,
 *  `wire` m thick. ASSUMED mesh (the photograph resolves panels, not wires); a common security-mesh pitch. Cached. */
export const PERTH_FENCE_MESH = {pitch: [.05, .2] as const, wire: .008, tile: .4, px: 256} as const;
let mesh: THREE.DataTexture | undefined;
export function perthMeshTexture(): THREE.DataTexture {
  if (mesh) return mesh;
  const M = PERTH_FENCE_MESH, n = M.px, data = new Uint8Array(n * n * 4), m = n / M.tile;
  const on = (p: number, pitch: number): boolean => { const d = ((p % pitch) + pitch) % pitch; return Math.min(d, pitch - d) < M.wire / 2 + .5 / m; };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const q = 4 * (j * n + i); data[q] = data[q + 1] = data[q + 2] = 255; data[q + 3] = on((i + .5) / m, M.pitch[0]) || on((j + .5) / m, M.pitch[1]) ? 255 : 0;
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / M.tile, 1 / M.tile); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true; t.name = 'perth-fence-mesh';
  return mesh = t;
}
/** The roof's solid bands: R-pt1-a's brown-grey sheeting (round 4: round 3's near-black read as voids from below; round 5: lighter again,
 *  as round 4's 0x5e544b still read near-black from pt-platform-4-north and pt-roof-underside; round 6: lighter again, as round 5's 0x7d7064
 *  did not change the read: the undersides face down, away from the sun, so only the sky light reaches them). ASSUMED shade. */
export const PERTH_BAND_BROWN = 0xa59886;
/** The bands' undersides (PerthStationBatches.soffits): R-pt1-a's and R-pt1-d north's dark brown-grey timber boarding, the roof reading
 *  from the platforms as bright glazing between dark boards. Round 8: round 7's pale tone with a sky-lit glow was wrong against both
 *  photographs and is gone (no emissive). The paint is the bands' own brown-grey a little lifted, so that under the board map
 *  (perthBoardTexture, mean about 0.86) the boards average the round-6 tone and their joints show. ASSUMED shade. */
export const PERTH_BAND_SOFFIT = 0xc6b7a2;
/** Round 8 (S2): the boarding's map, multiplied over PERTH_BAND_SOFFIT. The soffits' UVs are track-frame metres (u along x', v along z',
 *  ridgeRoofBatches), and the bands run along z', so the boards (R-pt1-a: narrow boards laid across each band) are `board` m wide in v,
 *  each a little lighter or darker by a hash (`tone`), with a dark joint (`joint`, `jointPx` px) between them, over a `tile` m repeat.
 *  ASSUMED sizes. Cached. */
export const PERTH_BOARDS = {tile: 1.2, board: .15, tone: [.8, .95] as const, joint: .5, jointPx: 2, px: 128} as const;
let boards: THREE.DataTexture | undefined;
export function perthBoardTexture(): THREE.DataTexture {
  if (boards) return boards;
  const B = PERTH_BOARDS, n = B.px, data = new Uint8Array(n * n * 4), per = n * B.board / B.tile;
  const hash = (k: number): number => { let h = Math.imul(k ^ 0x5bd1e995, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  for (let j = 0; j < n; j++) {
    const k = Math.floor(j / per), joint = j - k * per < B.jointPx, tone = joint ? B.joint : B.tone[0] + (B.tone[1] - B.tone[0]) * hash(k + 1);
    for (let i = 0; i < n; i++) { const grain = .97 + .03 * hash(1000 + j * n + i), v = Math.round(255 * tone * grain), q = 4 * (j * n + i); data[q] = data[q + 1] = data[q + 2] = v; data[q + 3] = 255; }
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / B.tile, 1 / B.tile); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true; t.name = 'perth-boards';
  return boards = t;
}
/** The open platforms' red asphalt (R-pt1-b, Abbott 6573357). ASSUMED shade. */
export const PERTH_OPEN_ASPHALT = 0xa0705f;
/** The Dundee platforms' open ends in dark grey asphalt instead (lead ruling 2026-11-10, after round 3: R-pt1-c, Abbott 2012, and
 *  Champion 2011, geograph 2687800, both show platform 1 grey). ASSUMED shade. */
export const PERTH_OPEN_GREY = 0x4c4d4f;
export const PERTH_GREY_PLATFORMS: readonly string[] = ['1', '2'];
export function perthTrack(data: Pick<PerthData, 'rails'>): {ground: TrackSegment[]; bridge: TrackSegment[]} {
  return {ground: stationTrackSegments({rails: data.rails.filter(r => !onBridge(r.tags))}), bridge: stationTrackSegments({rails: data.rails.filter(r => onBridge(r.tags))})};
}
/** The mapped station (OSM way/4064272, building=train_station, layer 1): its 14,500 m2 outline spans the main platforms and their tracks,
 *  so it is the station's roofed area, not a solid block (the railway rule, stationRailwayIntrusions, already keeps it out of the city).
 *  The overall roof covers it (perth-station-structure.ts perthRoofRings), the island building standing under it. */
export const stationOutline = (data: Pick<PerthData, 'buildings'>): WaverleyArea | undefined => data.buildings.find(b => b.id === PERTH_STATION_BUILDING_ID);
/** The overall roof's ridge (m above rail): the glazing's top. ASSUMED (perth-station-structure.ts: Waverley's profile, 8 m gutter + 2.4 m rise). */
/** (Rounded to float32, as the drawn geometry holds it, so the scene test can compare the two exactly.) */
export const PERTH_STATION_ROOF_HEIGHT = Math.fround(PERTH_ROOF_RIDGE);
/** ASSUMED fascia depth (m) of the station roof and the town's mapped roofs (perth-city.ts addPerthMappedRoofs). */
export const PERTH_FASCIA = .6;

/** Track: ballast, rail heads and sleepers on every surface segment; a deck under the bridge segments. */
export function addPerthTrack(build: PerthBuild, track: {ground: TrackSegment[]; bridge: TrackSegment[]}, group: THREE.Group): void {
  const {add, stats, geometries} = build;
  const ballast = new Batch(), rails = new Batch(), deck = new Batch(), sleepers: V3[] = [];
  for (const [ax, az, bx, bz] of [...track.ground, ...track.bridge]) {
    const a: Pt = [ax, az], b: Pt = [bx, bz], dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz), nx = -dz / length, nz = dx / length;
    railStrip(ballast, a, b, PERTH_LEVELS.ballastHalfWidth, -.14);
    for (const side of [-1, 1]) {
      const offset = side * (PERTH_LEVELS.railHalfGauge + PERTH_LEVELS.railHeadWidth / 2);
      railStrip(rails, [ax + nx * offset, az + nz * offset], [bx + nx * offset, bz + nz * offset], PERTH_LEVELS.railHeadWidth / 2, 0);
    }
    for (let s = .325; s < length; s += .65) sleepers.push([ax + dx * s / length, Math.atan2(dx, dz), az + dz * s / length]);
  }
  for (const [ax, az, bx, bz] of track.bridge) {
    const length = Math.hypot(bx - ax, bz - az), cx = (ax + bx) / 2, cz = (az + bz) / 2;
    deck.box([cx, PERTH_LEVELS.deckTop - PERTH_LEVELS.deckDepth / 2, cz], [PERTH_LEVELS.deckHalfWidth * 2, PERTH_LEVELS.deckDepth, length + .02], {rotY: Math.atan2(bx - ax, bz - az)});
  }
  add(group, ballast, material('ballast'), 'perth-ballast');
  add(group, rails, material('steel'), 'perth-rail-heads');
  add(group, deck, material('concrete'), 'perth-bridge-decks');
  if (sleepers.length) {
    const g = new THREE.BoxGeometry(2.6, .05, .25), m = new THREE.InstancedMesh(g, material('concrete'), sleepers.length), matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    sleepers.forEach(([x, yaw, z], i) => { q.setFromAxisAngle(up, yaw); matrix.compose(new THREE.Vector3(x, -.125, z), q, new THREE.Vector3(1, 1, 1)); m.setMatrixAt(i, matrix); });
    m.instanceMatrix.needsUpdate = true; m.name = 'perth-sleepers'; group.add(m); geometries.add(g);
    stats.triangles += sleepers.length * 12; stats.drawCalls++; stats.sleepers = sleepers.length;
  }
}

/** The element's plan and batches, made once per scene data (the platforms and the roof both draw from them). */
const batchCache = new WeakMap<object, PerthStationBatches>();
function stationBatches(data: Pick<PerthData, 'platforms' | 'rails' | 'buildings'>): PerthStationBatches {
  let b = batchCache.get(data);
  if (!b) { b = perthStationBatches(perthStationPlan(data, stationOutline(data)?.outer)); batchCache.set(data, b); }
  return b;
}

/** Platforms: OSM outlines at the ASSUMED 0.915 m deck in pale flags, the coper and tactile strip on every track edge, the faces, and what
 *  stands on them: the island building, the roof's columns, the footbridges, furniture and clocks (perth-station-structure.ts). */
export function addPerthPlatforms(build: PerthBuild, data: Pick<PerthData, 'platforms' | 'rails' | 'buildings'>, group: THREE.Group): void {
  const {add, own} = build;
  // The tops: worn mid-grey flags under the roof; in the open beyond both its ends (perth-station-structure.ts platformParts), continuous
  // red asphalt, untextured (round 3: the flag texture had read as a tile chequer; Abbott 6573357, R-pt1-b, shows plain red surfacing),
  // but dark grey on the Dundee platforms (PERTH_GREY_PLATFORMS).
  const tops = new Batch(), open = new Batch(), grey = new Batch();
  for (const p of data.platforms) { const parts = platformParts(p.path); if (parts.covered.length) fillSurface(tops, parts.covered, [], () => PERTH_LEVELS.platform); for (const q of parts.open) fillSurface(PERTH_GREY_PLATFORMS.includes(p.ref ?? '') ? grey : open, q, [], () => PERTH_LEVELS.platform); }
  // Round 6: the end ramps (perth-station-structure.ts platformRamps), from the deck down to rail level. Round 9 (S3): in their own
  // grooved concrete (perthRampTexture), not the platform's surfacing, so the slope reads where it leaves the deck.
  // Round 10 (S3, the round-9 score: shade the ramp by its pitch, it is lit flat): each vertex's colour falls with its depth below the
  // deck, from 1 at the head to PERTH_RAMP_FINISH.foot at rail level, so the ramp darkens down its fall as it drops between the
  // platform's end walls. ASSUMED shading cue.
  const ramps = new Batch({colored: true});
  for (const r of perthStationPlan(data, stationOutline(data)?.outer).ramps) {
    const [e0, e1, f0, f1] = [r.e0, r.e1, r.f0, r.f1].map(toWorld), y = PERTH_LEVELS.platform, rail = WAVERLEY_LEVELS.rail, from = ramps.positions.length;
    ramps.poly([[e0[0], y, e0[1]], [e1[0], y, e1[1]], [f1[0], rail, f1[1]], [f0[0], rail, f0[1]]], [r.e0, r.e1, r.f1, r.f0].map(p => [p[1], p[0]] as V2), {facing: [0, 1, 0]});
    for (let i = from; i < ramps.positions.length; i += 3) { const k = 1 - (1 - PERTH_RAMP_FINISH.foot) * (y - ramps.positions[i + 1]) / (y - rail); ramps.colors[i] = ramps.colors[i + 1] = ramps.colors[i + 2] = k; }
  }
  const s = stationBatches(data);
  // Red brick faces (Abbott 6573357, R-pt1-b), under the buff coper (perth-station-structure.ts).
  const faceStone = own(material('brickRed').clone() as THREE.MeshLambertMaterial); faceStone.color.multiply(new THREE.Color(0xb8aca4));
  // Round 4: smooth grey concrete with fine joints under the roof (R-pt1-d north), not the blotched flags.
  const paving = own(new THREE.MeshLambertMaterial({color: PERTH_CONCRETE, map: perthSurfaceTexture('concrete')}));
  const surfacing = own(new THREE.MeshLambertMaterial({color: PERTH_OPEN_ASPHALT, map: perthSurfaceTexture('asphalt')}));
  const blister = own(material('platformEdgeStrip').clone() as THREE.MeshLambertMaterial), blisterMap = stationTexture('blister'); blister.map = blisterMap; blister.color.setHex(blisterMap ? 0xffffff : 0xcfae3a);
  add(group, tops, paving, 'perth-platform-surfaces');
  add(group, open, surfacing, 'perth-platform-surfaces-open');
  add(group, grey, own(new THREE.MeshLambertMaterial({color: PERTH_OPEN_GREY, map: perthSurfaceTexture('asphalt')})), 'perth-platform-surfaces-open-grey');
  add(group, ramps, own(new THREE.MeshLambertMaterial({color: PERTH_RAMP_FINISH.color, map: perthRampTexture(), vertexColors: true})), 'perth-platform-ramps');
  add(group, s.platform.faces, faceStone, 'perth-platform-faces');
  const edges = new Batch({colored: true, uv: false}); edges.append(s.platform.edges); edges.append(s.platform.lip);
  add(group, edges, own(paintMaterial(material('platformEdgeStrip'))), 'perth-platform-edges');
  add(group, s.platform.tactile, blister, 'perth-platform-tactile');
  add(group, s.fittings, own(paintMaterial(material('whiteSteel'))), 'perth-columns-bridges-furniture');
  // The bridges' and kiosk's glass panels (round 3): see-through, so the platform 4 elevation reads past the lift bridge's stairs. ASSUMED opacity.
  // Round 8 (S3): the ramp fences' close mesh (Rosser1954), a cut-out in the fence's grey.
  add(group, s.mesh, own(new THREE.MeshLambertMaterial({color: PERTH_RAMP_FENCE.color, map: perthMeshTexture(), alphaTest: .5, side: THREE.DoubleSide})), 'perth-ramp-fence-mesh');
  // Round 7 (S4): the clocks' dial faces, their Roman numerals in a texture (perthDialTexture).
  add(group, s.dials, own(new THREE.MeshLambertMaterial({color: PERTH_PAINT.clockFace, map: perthDialTexture()})), 'perth-clock-dials');
  add(group, s.panes, own(new THREE.MeshLambertMaterial({vertexColors: true, transparent: true, opacity: .28, depthWrite: false, side: THREE.DoubleSide})), 'perth-bridge-glass');
  // The island building (perth-station-structure.ts islandBuildingBatches), its stone coloured per vertex: divide out the stone texture's
  // own average (materials.ts stone, 0xa99a7c) as Waverley's central block does, so the texture adds only coursing.
  const station = stationOutline(data);
  const plan = perthStationPlan(data, station?.outer), parts = islandBuildingBatches(plan.island, perthRoofOver(plan));
  // Tite's 1848 block and its octagonal tower (perth-station-structure.ts PERTH_TITE), in the same draws.
  if (plan.tite) {
    const walls = islandBuildingBatches(plan.tite.ring), roof = titeRoofBatches(plan.tite.ring, plan.tite.tower);
    parts.stone.append(walls.stone); parts.stone.append(roof.stone); parts.windows.append(walls.windows); parts.top.append(walls.top);
    // Its hipped slate roof and spire stand outside the glazing, so they are a roof of their own for the rain cover (cover.ts ROOF_MESHES).
    const slate = own(material('slate').clone() as THREE.MeshLambertMaterial); slate.color.multiply(new THREE.Color(0xa9a59b));
    add(group, roof.slate, slate, 'perth-tite-roof');
  }
  // Round 5: Perth's own low-contrast ashlar (PERTH_ASHLAR) instead of the shared stone texture, whose strong per-block tones read as a
  // pink chequer; the vertex colours carry the grey-buff, the map only coursing (its mean divided out).
  const ashlar = perthSurfaceTexture('ashlar'), ad = ashlar.image.data as Uint8Array; let mean = 0; for (let i = 0; i < ad.length; i += 4) mean += ad[i]; mean /= ad.length / 4 * 255;
  const stone = own(new THREE.MeshLambertMaterial({vertexColors: true, map: ashlar})); const avg = new THREE.Color().setRGB(mean, mean, mean, THREE.SRGBColorSpace); stone.color.setRGB(1 / avg.r, 1 / avg.g, 1 / avg.b);
  add(group, parts.stone, stone, 'perth-island-building');
  add(group, parts.windows, material('sash'), 'perth-island-building-windows');
  const top = own(material('slate').clone() as THREE.MeshLambertMaterial); top.color.multiply(new THREE.Color(0xa9a59b));
  add(group, parts.top, top, 'perth-island-building-top');
}

/** The station roof's glazing material, from the scene's shared glass (perth-scene.ts): R-pt1-a, R-pt1-c and R-pt1-d show translucent
 *  white panes (obscured or weathered wired glass), not clear blue sky through them: a milky, mostly opaque pane. ASSUMED shade. */
export function perthGlazing(m: THREE.MeshLambertMaterial): THREE.MeshLambertMaterial {
  // The clear-pane texture (its alpha lets the sky through) gives way to a flat milky pane; the glazing bars are the roof's own rafters.
  m.map = null; m.emissiveMap = null; m.color.setHex(0xc9c7bf); m.emissive.setHex(0x7d7b74); m.transparent = true; m.opacity = .84;
  return m;
}

/** The overall roof: its glazing into `glass` (perth-scene.ts draws it, named for the rain cover), the Dundee canopies' valance into the roof
 *  part's shared `fascia` batch (the town's mapped roofs add theirs after it), and, given the scene's adder and roof group, the solid strips
 *  and the ironwork (trusses, girders, gables) as their own draws. */
export function addPerthStationRoof(data: Pick<PerthData, 'buildings' | 'platforms' | 'rails'>, glass: Batch, fascia: Batch, build?: PerthBuild, group?: THREE.Group): void {
  const station = stationOutline(data);
  if (!station) return;
  const s = stationBatches(data), plan = perthStationPlan(data, station.outer);
  glass.append(s.glass);
  if (plan.canopy.length >= 3) walls(fascia, plan.canopy, [], () => PERTH_STATION.canopy.top - PERTH_STATION.canopy.valance, () => PERTH_STATION.canopy.top);
  if (!build || !group) return;
  const strips = build.own(material('whiteSteel').clone() as THREE.MeshLambertMaterial); strips.color.setHex(PERTH_BAND_BROWN); strips.side = THREE.DoubleSide;
  build.add(group, s.strips, strips, 'perth-roof-strips');
  // The bands' undersides (round 7: their own draw): R-pt1-a's dark boarding, its boards mapped (round 8, perthBoardTexture), no glow.
  const soffit = build.own(material('whiteSteel').clone() as THREE.MeshLambertMaterial); soffit.color.setHex(PERTH_BAND_SOFFIT); soffit.emissive.setHex(0); soffit.map = perthBoardTexture(); soffit.side = THREE.DoubleSide;
  build.add(group, s.soffits, soffit, 'perth-roof-band-soffits');
  build.add(group, s.ironwork, build.own(paintMaterial(material('whiteSteel'))), 'perth-roof-ironwork');
  // Round 5: the spandrels' pierced plates (R-pt1-a, R-pt1-c), in the ironwork's paint, cut by the pattern's alpha.
  build.add(group, s.spandrels, build.own(new THREE.MeshLambertMaterial({color: PERTH_PAINT.iron, map: perthPiercedTexture(), alphaTest: .5, side: THREE.DoubleSide})), 'perth-roof-spandrels');
  // Round 8: the gutter braces' ring ornament (R-pt1-a), a cut-out in the ironwork's paint.
  build.add(group, s.ornament, build.own(new THREE.MeshLambertMaterial({color: PERTH_PAINT.iron, map: perthRingTexture(), alphaTest: .5, side: THREE.DoubleSide})), 'perth-roof-brace-ornament');
  // The glazing's weathered outer face (perth-station-structure.ts PerthStationBatches.weather): seen from above only.
  // Round 3: opaque, so the transparent sort can no longer put the milky panes over it (round 2's overview read white and streaky); its
  // faces look up, so from under the roof it is culled and the panes show. A weathered grey, ASSUMED shade.
  // Pulled toward the eye by a polygon offset: from pt-overview's 1.5 km the 4 cm lift is under the depth buffer's resolution and the panes
  // beneath won the depth test in patches (the white stripes); the offset counts in depth steps, so it holds at any range.
  const weather = build.own(new THREE.MeshLambertMaterial({color: 0x7a7b78, side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8}));
  build.add(group, s.weather, weather, 'perth-roof-weathering');
}
