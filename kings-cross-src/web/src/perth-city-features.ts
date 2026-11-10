// P3 city features: Perth's ground cover and trees, the Tay's water, its bridges, and the town's two sourced towers.
// - Ground: OSM land use, streets and trees (data/perth-city-landuse.json, tools/build-perth-city-landuse.ts), drawn by Waverley's ground
//   builder (waverley-city-ground.ts) on a drape over the drawn terrain, so the cover never sits under the ground or z-fights it.
// - The Tay: the DTM has no ground in the river (nodata), and tools/build-perth-terrain.ts fills each wet node with the lowest bank
//   pixel round it (ASSUMED). The OSM river polygons (relation/956087, way/82223450) are painted as water on that drape, and a glossy
//   sheet fills them at the drape's level, lifted WATER.lift: so the water is always over the filled river bed, never under it.
// - The Tay Viaduct (OSM way/4438951, 443 m; Wikipedia "Tay Viaduct", Canmore 79826): seven iron girder spans on the city side, ten
//   stone arches on Moncreiffe Island (each 28 ft 4 in clear on 4 ft piers, Canmore), six iron girder spans east of the island, and a
//   walkway on the outer edge of its curve. The arch block is centred on the island's mapped crossing; the girder spans divide the
//   river sections equally (ASSUMED: no span lengths found). The deck stays the track element's (perth-station.ts), at the rail datum.
// - Road bridges: the mapped bridge outlines over the Tay (OSM man_made=bridge: Perth Bridge way/583253156, Queen's Bridge
//   way/742335578; the viaduct's own outline, way/611293698, is left out by the builder), deck from bank to bank. Arch counts are ASSUMED (PERTH_ROAD_BRIDGES).
// - St John's Kirk (way/740861202): its central tower and broach spire at the Phase I DSM's peak over the kirk, the spire's top 155 ft
//   (47.2 m) above the pavement (Historic Environment Scotland LB39300). Kinnoull Tower (way/323543760): the OSM outline as a round
//   tower; the 2011 DSM does not resolve it (its surface stands within 3 m of the DTM there), so its height is ASSUMED.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {Terrain} from '../../core/terrain.ts';
import {Batch} from './materials.ts';
import type {Rgb, V3} from './materials.ts';
import {buildWaverleyCityGround, decodeLanduse, Footprints} from './waverley-city-ground.ts';
import type {LanduseFile} from './waverley-city-ground.ts';
import {rectangleOf} from './waverley-city-roofs.ts';
import {fillSurface, shell} from './waverley-mesh.ts';
import {PERTH_LIDAR_LANDMARKS} from './perth-city-heights.ts';
import {KINNOULL_PEAK, kinnoullWoodland, PERTH_ROCK_TONES} from './perth-woodland.ts';
import file from './data/perth-city-landuse.json' with {type: 'json'};

export const PERTH_LANDUSE = decodeLanduse(file as unknown as LanduseFile);
/** The mapped road bridges over the Tay (tools/build-perth-city-landuse.ts). */
export const PERTH_LANDUSE_BRIDGES: readonly {id: string; name: string; outline: Pt[]}[] = file.bridges.roads.map(b => ({id: b.id, name: b.name, outline: b.outline as Pt[]}));

/** ASSUMED: Kinnoull Hill's woods are seen from a kilometre and more, as one canopy: filled on a wider lattice than Waverley's garden
 *  banks (FILL_STEP 9 m) with the crowns spread to meet, and no trunks under the massed crowns (the cost cap: +320,000 triangles). */
export const PERTH_FILL_STEP = {wood: 18, scrub: 14} as const;
/** ASSUMED: the drape's tolerance and lift (m), three times Waverley's DRAPE_TOLERANCE: Perth's cut is three times the area, seen mostly from
 *  the hill and the river banks; seatDrape still lifts any facet that comes within 0.1 m of the drawn ground. */
export const PERTH_DRAPE = .75;
/** The water sheet's lift over the drape (m: covers its sag between OSM vertices, whose levels differ by up to ~0.6 m), the reach and
 *  quantile of waterLevel(), and its look: ASSUMED, a pale grey-blue reflecting an overcast sky (R-pt3-a, R-pt3-b). */
export const WATER = {lift: .6, reach: 120, surface: .3, colour: 0x6f8794, specular: 0x8a9aa4, shininess: 40} as const;
/** The Tay Viaduct, from Wikipedia ("Tay Viaduct") and Canmore 79826: span counts and the island arches' clear span and pier width. */
export const TAY_VIADUCT = {westSpans: 7, arches: 10, eastSpans: 6, archClear: 8.636, archPier: 1.219} as const;
/** ASSUMED viaduct sections (m; rail datum y = 0): iron side girders from y girder[0] to girder[1] (their tops the parapet), offset
 *  `girderOffset` from the centreline; masonry piers `pier` (along, across); the arch block `archWidth` wide with its crown `crown`
 *  under the rail; the walkway `walk` (inner, outer offset, top y) with a railing `rail` m above it. */
export const VIADUCT_FORM = {girder: [-1.7, .9] as const, girderThick: .35, girderOffset: 2.45, pier: [2.2, 6.2] as const, archWidth: 5.4, crown: -1.3, walk: [2.65, 4.45, -.35] as const, rail: 1.1} as const;
/** ASSUMED road-bridge forms: arches per bridge (no published counts found), the parapet height and the humpback rise of Perth Bridge
 *  (OSM bridge:structure=humpback). */
export const PERTH_ROAD_BRIDGES: Readonly<Record<string, {arches: number; hump: number}>> = {
  'way/583253156': {arches: 9, hump: 1.5}, 'way/742335578': {arches: 3, hump: .6},
};
export const PARAPET = 1.1;
/** St John's Kirk: the spire's top above the pavement (HES LB39300: 155 ft); ASSUMED tower plan (m square), its parapet at `towerShare`
 *  of the spire's height, and the spire's lead. */
export const KIRK_TOWER = {top: 47.24, side: 7.5, towerShare: .55, lead: [.43, .45, .47] as Rgb} as const;
/** Kinnoull Tower from the LiDAR, not the OSM outline (way/323543760): the DSM shows only 3 m over the outline, open ground; 8.7 m
 *  from its centre, on the same cliff-top ground, it shows one compact 10.5 m rise about 4.5 m across (16 one-metre cells over half
 *  its rise; tools/build-perth-city-heights.ts towerNear). That is the tower 8703 and 4307 show: a round tower about two and a half
 *  times as tall as it is wide, standing alone at the very edge of the cliff top. So the outline is offset by the 8.7 m and the tower is
 *  drawn round (12 sides) at the LiDAR peak, its width from the cells, its height the rise. */
const TOWER_NEAR = PERTH_LIDAR_LANDMARKS.kinnoullTower.near!;
export const KINNOULL_TOWER = {id: PERTH_LIDAR_LANDMARKS.kinnoullTower.id, x: TOWER_NEAR.x, z: TOWER_NEAR.z, height: TOWER_NEAR.rise,
  radius: Math.sqrt(TOWER_NEAR.cells / Math.PI), sides: 12} as const;
export const PERTH_FEATURE_OMIT_IDS = [KINNOULL_TOWER.id];
/** ASSUMED: a mapped viewing place (OSM tourism=viewpoint) stands in the open, so no tree is filled within OUTLOOK_CLEAR m of it; and
 *  Kinnoull Hill's summit (the OSM peak, node/29621037, 222 m) is open grass and gorse for SUMMIT_OPEN m round it, the woods below it
 *  (Stone_table_on_Kinnoul_Hill.jpg: grass round the summit table, gorse and low trees at its edge; R-pt3-a England_and_Scotland_152.jpg,
 *  from the summit: open grass and gorse in front, the trees further down). Each is a 24-sided ring the trees keep clear of, as they
 *  do a building; the ground keeps its OSM wood paint. */
export const OUTLOOK_CLEAR = 30, SUMMIT_OPEN = 160;
export const outlookClearings = (): Pt[][] => PERTH_LANDUSE.outlooks.filter(r => r.length === 1).map(([[x, z]]) => {
  const r = Math.hypot(x! - KINNOULL_PEAK[0], z! - KINNOULL_PEAK[1]) < 10 ? SUMMIT_OPEN : OUTLOOK_CLEAR;
  return Array.from({length: 24}, (_, k): Pt => [x! + r * Math.cos(k * Math.PI / 12), z! + r * Math.sin(k * Math.PI / 12)]);
});

const pip = (x: number, z: number, p: readonly Pt[]): boolean => { let yes = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i]![1] > z) !== (p[j]![1] > z) && x < (p[j]![0] - p[i]![0]) * (z - p[i]![1]) / (p[j]![1] - p[i]![1]) + p[i]![0]) yes = !yes; return yes; };
const inWater = (x: number, z: number): boolean => PERTH_LANDUSE.areas.water.some(([o, ...holes]) => pip(x, z, o!) && !holes.some(h => pip(x, z, h)));
const stone: Rgb = [.86, .82, .74], iron: Rgb = [.3, .34, .36];

/** A ring clipped to an axis-aligned box (Sutherland-Hodgman): the terrain ends at its extent, and so does the water drawn on it. */
export function clipRing(ring: readonly Pt[], box: {x0: number; z0: number; x1: number; z1: number}): Pt[] {
  let out: Pt[] = [...ring];
  const edges: [(p: Pt) => boolean, (a: Pt, b: Pt) => Pt][] = [
    [p => p[0] >= box.x0, (a, b) => [box.x0, a[1] + (b[1] - a[1]) * (box.x0 - a[0]) / (b[0] - a[0])]],
    [p => p[0] <= box.x1, (a, b) => [box.x1, a[1] + (b[1] - a[1]) * (box.x1 - a[0]) / (b[0] - a[0])]],
    [p => p[1] >= box.z0, (a, b) => [a[0] + (b[0] - a[0]) * (box.z0 - a[1]) / (b[1] - a[1]), box.z0]],
    [p => p[1] <= box.z1, (a, b) => [a[0] + (b[0] - a[0]) * (box.z1 - a[1]) / (b[1] - a[1]), box.z1]],
  ];
  for (const [inside, cut] of edges) {
    const src = out; out = [];
    for (let i = 0; i < src.length; i++) { const a = src[(i + src.length - 1) % src.length]!, b = src[i]!;
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); } else if (inside(a)) out.push(cut(a, b)); }
  }
  return out;
}

/** The river's level for the water sheet at a point: a low quantile (WATER.surface) of the drawn ground at the wet lattice nodes (16 m,
 *  inside the OSM water) within WATER.reach m. The DTM fills the river flat; the 16 m terrain still climbs the bank inside the OSM
 *  outline at its edge nodes, and a polygon vertex sits on the bank itself, so neither the point's own ground nor the highest node is
 *  the river: the low quantile is. Where the ground is above it (the bank) the drape covers the sheet, and that is the shore. */
export function waterLevel(ground: Pick<Terrain, 'heightAt'>): (x: number, z: number) => number {
  const wet: [number, number, number][] = [];
  for (const [o] of PERTH_LANDUSE.areas.water) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of o!) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let x = Math.ceil(x0 / 16) * 16; x <= x1; x += 16) for (let z = Math.ceil(z0 / 16) * 16; z <= z1; z += 16) if (inWater(x, z)) wet.push([x, z, ground.heightAt(x, z)]);
  }
  return (x, z) => {
    const near: number[] = [];
    for (const [wx, wz, y] of wet) if (Math.abs(wx - x) <= WATER.reach && Math.abs(wz - z) <= WATER.reach && Math.hypot(wx - x, wz - z) <= WATER.reach) near.push(y);
    if (!near.length) return ground.heightAt(x, z);
    near.sort((a, b) => a - b); return near[Math.floor(WATER.surface * (near.length - 1))]!;
  };
}

export interface PerthCityFeatures {group: THREE.Group; stats: {triangles: number; drawCalls: number}; dispose(): void}

/** The ground cover, trees and water; `footprints` are the outlines trees keep clear of; `uncovered` is ground P2 draws itself (the
 *  King's Place cut and the forecourt, perth-frontage-mask.ts), where the drape leaves a hole as it does over the railway bed. */
export function buildPerthCityGround(ground: Terrain, footprints: Footprints, uncovered?: (x: number, z: number) => boolean): PerthCityFeatures {
  const cover = buildWaverleyCityGround(ground, footprints, PERTH_LANDUSE, {fillStep: PERTH_FILL_STEP, woodTrunks: false, drape: PERTH_DRAPE, woodland: kinnoullWoodland(ground, PERTH_LANDUSE.cliffs), rockTones: PERTH_ROCK_TONES, uncovered});
  cover.group.name = 'perth-city-ground';
  const stats = {...cover.stats};
  // the water sheet: each OSM river polygon (less its islands) at the drape's level over the filled river, lifted WATER.lift
  const sheet = new Batch(), level = waterLevel(ground);
  for (const [o, ...holes] of PERTH_LANDUSE.areas.water) {
    const outer = clipRing(o!, PERTH_LANDUSE.extent); if (outer.length < 3) continue;
    fillSurface(sheet, outer, holes.map(h => clipRing(h, PERTH_LANDUSE.extent)).filter(h => h.length >= 3), (x, z) => level(x, z) + PERTH_DRAPE + WATER.lift);
  }
  const wg = sheet.build(), m = new THREE.MeshPhongMaterial({color: WATER.colour, specular: WATER.specular, shininess: WATER.shininess, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
  const water = new THREE.Mesh(wg, m); water.name = 'perth-tay-water'; cover.group.add(water);
  stats.triangles += (wg.index ? wg.index.count : wg.getAttribute('position').count) / 3; stats.drawCalls++;
  return {group: cover.group, stats, dispose() { wg.dispose(); m.dispose(); cover.dispose(); }};
}

// ---- arches and spans ------------------------------------------------------------------------------------------------------------
/** A masonry arch from a to b (plan), `width` across: two spandrel faces from the intrados up to `top`, and the soffit. The intrados is
 *  a half-ellipse from `spring` up to `crown`. */
export function arch(b: Batch, a: Pt, e: Pt, width: number, spring: number, crown: number, top: number, steps = 8): void {
  const dx = e[0] - a[0], dz = e[1] - a[1], len = Math.hypot(dx, dz), nx = -dz / len * width / 2, nz = dx / len * width / 2;
  const y = (t: number) => spring + (crown - spring) * Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2));
  const at = (t: number, side: number): [number, number] => [a[0] + dx * t + side * nx, a[1] + dz * t + side * nz];
  for (let k = 0; k < steps; k++) {
    const t0 = k / steps, t1 = (k + 1) / steps;
    for (const side of [-1, 1]) {
      const [x0, z0] = at(t0, side), [x1, z1] = at(t1, side);
      b.quadUV([x0, y(t0), z0], [x1, y(t1), z1], [x1, top, z1], [x0, top, z0], undefined, [side * nx, 0, side * nz]);
    }
    const [l0x, l0z] = at(t0, -1), [l1x, l1z] = at(t1, -1), [r0x, r0z] = at(t0, 1), [r1x, r1z] = at(t1, 1);
    b.quadUV([l0x, y(t0), l0z], [r0x, y(t0), r0z], [r1x, y(t1), r1z], [l1x, y(t1), l1z], undefined, [0, -1, 0]);
  }
}
/** A box from plan point p, `along` the unit tangent t, `across` it, from y0 to y1. */
const post = (b: Batch, p: Pt, t: Pt, along: number, across: number, y0: number, y1: number, color?: Rgb) => {
  if (!(y1 > y0)) return;
  b.box([p[0], (y0 + y1) / 2, p[1]], [across, y1 - y0, along], {rotY: Math.atan2(t[0], t[1]), color});
};

/** The polyline's point and unit tangent at arc length s. */
function walker(line: readonly Pt[]) {
  const cum = [0]; for (let i = 1; i < line.length; i++) cum.push(cum[i - 1]! + Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]));
  const length = cum.at(-1)!;
  const at = (s: number): {p: Pt; t: Pt} => {
    s = Math.max(0, Math.min(length, s)); let i = 1; while (i < line.length - 1 && cum[i]! < s) i++;
    const a = line[i - 1]!, b = line[i]!, l = cum[i]! - cum[i - 1]! || 1, f = (s - cum[i - 1]!) / l;
    return {p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], t: [(b[0] - a[0]) / l, (b[1] - a[1]) / l]};
  };
  return {length, at};
}

/** The Tay Viaduct along its mapped path: piers, iron spans, the island arches, the walkway. Returns the layout for the tests. */
export function tayViaduct(masonry: Batch, ironwork: Batch, ground: Pick<Terrain, 'heightAt'>, line: readonly Pt[] = file.bridges.viaduct.line as Pt[]): {piers: number[]; arches: [number, number]; island: [number, number]; length: number} {
  const w = walker(line), F = VIADUCT_FORM, V = TAY_VIADUCT;
  // the island crossing: the longest dry run between wet ones along the path
  const wet: boolean[] = []; for (let s = 0; s <= w.length; s += 1) { const {p} = w.at(s); wet.push(inWater(p[0], p[1])); }
  let island: [number, number] = [w.length / 2, w.length / 2];
  const firstWet = wet.indexOf(true), lastWet = wet.lastIndexOf(true);
  for (let i = firstWet, run = -1; i <= lastWet && firstWet >= 0; i++) {
    if (!wet[i] && run < 0) run = i;
    if ((wet[i] || i === lastWet) && run >= 0) { if (i - run > island[1] - island[0]) island = [run, i]; run = -1; }
  }
  const pitch = V.archClear + V.archPier, block = V.arches * pitch + V.archPier, mid = (island[0] + island[1]) / 2;
  const a0 = mid - block / 2, a1 = mid + block / 2;
  const piers: number[] = [];
  for (let k = 0; k <= V.westSpans; k++) piers.push(a0 * k / V.westSpans);
  for (let k = 0; k <= V.eastSpans; k++) piers.push(a1 + (w.length - a1) * k / V.eastSpans);
  // the girder spans' outer side (the walkway's): the side the path turns away from
  const s0 = w.at(0).t, s1 = w.at(w.length).t, turn = Math.sign(s0[0] * s1[1] - s0[1] * s1[0]) || 1;
  const girders = (from: number, to: number) => {
    const A = w.at(from), B = w.at(to), d: Pt = [B.p[0] - A.p[0], B.p[1] - A.p[1]], len = Math.hypot(d[0], d[1]), t: Pt = [d[0] / len, d[1] / len], n: Pt = [-t[1], t[0]];
    const c: Pt = [(A.p[0] + B.p[0]) / 2, (A.p[1] + B.p[1]) / 2];
    for (const side of [-1, 1]) post(ironwork, [c[0] + n[0] * side * F.girderOffset, c[1] + n[1] * side * F.girderOffset], t, len, F.girderThick, F.girder[0], F.girder[1]);
    // the walkway, outside the girder on the outer side of the curve, and its railing (top and mid rails)
    const o = -turn, wc = (F.walk[0] + F.walk[1]) / 2;
    post(ironwork, [c[0] + n[0] * o * wc, c[1] + n[1] * o * wc], t, len, F.walk[1] - F.walk[0], F.walk[2] - .25, F.walk[2]);
    for (const h of [F.rail, F.rail / 2]) post(ironwork, [c[0] + n[0] * o * (F.walk[1] - .05), c[1] + n[1] * o * (F.walk[1] - .05)], t, len, .06, F.walk[2] + h - .06, F.walk[2] + h);
    for (let s = 1; s < len; s += 2.5) post(ironwork, [A.p[0] + t[0] * s + n[0] * o * (F.walk[1] - .05), A.p[1] + t[1] * s + n[1] * o * (F.walk[1] - .05)], t, .08, .08, F.walk[2], F.walk[2] + F.rail);
  };
  for (let k = 0; k < V.westSpans; k++) girders(piers[k]!, piers[k + 1]!);
  for (let k = 0; k < V.eastSpans; k++) girders(piers[V.westSpans + 1 + k]!, piers[V.westSpans + 2 + k]!);
  // masonry piers under the girder spans (into the river bed), the abutments at the ends
  for (const s of piers) { const {p, t} = w.at(s); post(masonry, p, t, F.pier[0], F.pier[1], ground.heightAt(p[0], p[1]) - 1.5, F.girder[0]); }
  // the arches: pier, arch, pier ... from a0 to a1
  for (let k = 0; k <= V.arches; k++) {
    const s = a0 + k * pitch + V.archPier / 2, {p, t} = w.at(s);
    post(masonry, p, t, V.archPier, F.archWidth, ground.heightAt(p[0], p[1]) - .5, F.girder[1]);
    if (k === V.arches) break;
    const A = w.at(s + V.archPier / 2).p, B = w.at(s + V.archPier / 2 + V.archClear).p;
    const floor = Math.max(ground.heightAt(A[0], A[1]), ground.heightAt(B[0], B[1]), ground.heightAt((A[0] + B[0]) / 2, (A[1] + B[1]) / 2));
    const spring = Math.min(F.crown - .6, floor + .3);
    arch(masonry, A, B, F.archWidth, spring, F.crown, F.girder[1]);
    // the spandrel down to the ground under the springing, so no gap shows under a low arch
    for (const q of [A, B]) post(masonry, q, t, .05, F.archWidth, ground.heightAt(q[0], q[1]) - .5, spring);
  }
  return {piers, arches: [a0, a1], island, length: w.length};
}

/** A mapped road bridge over the Tay: a deck from bank to bank over its outline's rectangle, its parapets, its arches and piers. */
export function roadBridge(masonry: Batch, deck: Batch, ground: Pick<Terrain, 'heightAt'>, bridge: {id: string; outline: readonly Pt[]}): void {
  const form = PERTH_ROAD_BRIDGES[bridge.id] ?? {arches: 0, hump: 0};
  const {c, u, L, W} = rectangleOf(bridge.outline as Pt[]), v: Pt = [-u[1], u[0]];
  const end = (s: number): Pt => [c[0] + u[0] * s, c[1] + u[1] * s];
  const h0 = ground.heightAt(...end(-L)), h1 = ground.heightAt(...end(L));
  const top = (s: number) => h0 + (h1 - h0) * (s + L) / (2 * L) + form.hump * (1 - (s / L) ** 2);
  const along = (x: number, z: number) => (x - c[0]) * u[0] + (z - c[1]) * u[1];
  fillSurface(deck, bridge.outline, [], (x, z) => top(along(x, z)) + .05);
  const steps = Math.max(8, Math.round(2 * L / 4));
  for (let k = 0; k < steps; k++) {
    const s0 = -L + 2 * L * k / steps, s1 = -L + 2 * L * (k + 1) / steps;
    for (const side of [-1, 1]) {
      const p0: Pt = [end(s0)[0] + v[0] * side * W, end(s0)[1] + v[1] * side * W], p1: Pt = [end(s1)[0] + v[0] * side * W, end(s1)[1] + v[1] * side * W];
      // the parapet: outer face, top and inner face, 0.45 m thick (ASSUMED)
      const i0: Pt = [p0[0] - v[0] * side * .45, p0[1] - v[1] * side * .45], i1: Pt = [p1[0] - v[0] * side * .45, p1[1] - v[1] * side * .45];
      const t0 = top(s0) + PARAPET, t1 = top(s1) + PARAPET;
      masonry.quadUV([i0[0], top(s0), i0[1]], [i1[0], top(s1), i1[1]], [i1[0], t1, i1[1]], [i0[0], t0, i0[1]], undefined, [-v[0] * side, 0, -v[1] * side]);
      masonry.quadUV([p0[0], t0, p0[1]], [p1[0], t1, p1[1]], [i1[0], t1, i1[1]], [i0[0], t0, i0[1]], undefined, [0, 1, 0]);
      if (!form.arches) masonry.quadUV([p0[0], top(s0) - 1.2, p0[1]], [p1[0], top(s1) - 1.2, p1[1]], [p1[0], t1, p1[1]], [p0[0], t0, p0[1]], undefined, [v[0] * side, 0, v[1] * side]);
    }
    if (!form.arches) { const a = end(s0), b = end(s1); deck.quadUV([a[0] - v[0] * W, top(s0) - 1.2, a[1] - v[1] * W], [a[0] + v[0] * W, top(s0) - 1.2, a[1] + v[1] * W], [b[0] + v[0] * W, top(s1) - 1.2, b[1] + v[1] * W], [b[0] - v[0] * W, top(s1) - 1.2, b[1] - v[1] * W], undefined, [0, -1, 0]); }
  }
  if (!form.arches) return;
  // arches: equal spans between the banks (ASSUMED count), each pier 1/6 of the pitch
  const pitch = 2 * L / form.arches, pier = pitch / 6;
  for (let k = 0; k < form.arches; k++) {
    const sa = -L + k * pitch + pier / 2, sb = -L + (k + 1) * pitch - pier / 2, A = end(sa), B = end(sb);
    const floor = Math.min(ground.heightAt(...A), ground.heightAt(...B)), crown = Math.min(top(sa), top(sb)) - 1.1;
    arch(masonry, A, B, 2 * W, Math.min(crown - 1, floor + .5), crown, (top(sa) + top(sb)) / 2, 10);
    if (k) { const p = end(-L + k * pitch); post(masonry, p, u, pier, 2 * W + .6, ground.heightAt(...p) - 1, top(-L + k * pitch) - 1.1); }
  }
}

/** St John's Kirk's tower and broach spire at the DSM's peak over the kirk, aligned with the kirk's plan; `base` is the kirk's seat. */
export function kirkTower(masonry: Batch, lead: Batch, kirk: {outer: readonly Pt[]}, base: number): {towerTop: number; spireTop: number} {
  const L = PERTH_LIDAR_LANDMARKS.kirk, {u} = rectangleOf(kirk.outer as Pt[]), v: Pt = [-u[1], u[0]], h = KIRK_TOWER.side / 2;
  const c: Pt = [L.x, L.z], spireTop = base + KIRK_TOWER.top, towerTop = base + KIRK_TOWER.top * KIRK_TOWER.towerShare;
  const sq: Pt[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [c[0] + (u[0] * a! + v[0] * b!) * h, c[1] + (u[1] * a! + v[1] * b!) * h]);
  shell(masonry, sq, () => base - .15, () => towerTop);
  // the broach spire: an octagon set in the square (its corner faces broached down to the square's corners), rising to the top
  const r = h * .92, oct: Pt[] = Array.from({length: 8}, (_, i) => { const a = (i + .5) * Math.PI / 4; return [c[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r, c[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r]; });
  const tip: V3 = [c[0], spireTop, c[1]], broach = towerTop + (spireTop - towerTop) * .18;
  for (let i = 0; i < 8; i++) { const p = oct[i]!, q = oct[(i + 1) % 8]!; lead.tri([p[0], broach, p[1]], [q[0], broach, q[1]], tip, undefined, [(p[0] + q[0]) / 2 - c[0], .3, (p[1] + q[1]) / 2 - c[1]]); }
  // the broaches: the square's top slopes in to the octagon's base, a trapezoid on each side
  for (let k = 0; k < 4; k++) {
    const p = sq[k]!, q = sq[(k + 1) % 4]!, mid: Pt = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const near = oct.map((o, i) => ({o, i, d: Math.hypot(o[0] - mid[0], o[1] - mid[1])})).sort((m, n) => m.d - n.d).slice(0, 2).map(m => m.o);
    const [m, n] = Math.hypot(near[0]![0] - p[0], near[0]![1] - p[1]) < Math.hypot(near[1]![0] - p[0], near[1]![1] - p[1]) ? [near[0]!, near[1]!] : [near[1]!, near[0]!];
    lead.quadUV([p[0], towerTop, p[1]], [q[0], towerTop, q[1]], [n[0], broach, n[1]], [m[0], broach, m[1]], undefined, [mid[0] - c[0], .5, mid[1] - c[1]]);
    // the corner broach: the square's corner up to the octagon's corner face
    const corner = oct.map(o => ({o, d: Math.hypot(o[0] - q[0], o[1] - q[1])})).sort((x, y) => x.d - y.d).slice(0, 2).map(x => x.o);
    lead.tri([q[0], towerTop, q[1]], [corner[0]![0], broach, corner[0]![1]], [corner[1]![0], broach, corner[1]![1]], undefined, [q[0] - c[0], .6, q[1] - c[1]]);
  }
  return {towerTop, spireTop};
}
