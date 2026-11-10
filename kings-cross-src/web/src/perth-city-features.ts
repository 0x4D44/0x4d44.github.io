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
//   way/742335578; the viaduct's own outline, way/611293698, is left out by the builder), deck from bank to bank. Arch counts are sourced (HES, Canmore; PERTH_ROAD_BRIDGES); equal spans are ASSUMED.
// - St John's Kirk (way/740861202): its central tower and broach spire at the Phase I DSM's peak over the kirk, the spire's top 155 ft
//   (47.2 m) above the pavement (Historic Environment Scotland LB39300). Kinnoull Tower (way/323543760): the DSM does not resolve it
//   over its OSM outline, but it does 8.7 m away on the same cliff top, so the tower is drawn there at that LiDAR rise (KINNOULL_TOWER).
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {Terrain} from '../../core/terrain.ts';
import {Batch} from './materials.ts';
import type {Rgb, V3} from './materials.ts';
import {buildWaverleyCityGround, decodeLanduse, Footprints} from './waverley-city-ground.ts';
import type {LanduseFile} from './waverley-city-ground.ts';
import {rectangleOf} from './waverley-city-roofs.ts';
import {fillSurface, shell} from './waverley-mesh.ts';
import {revolve} from './waverley-frontage-mesh.ts';
import {PERTH_LIDAR_LANDMARKS} from './perth-city-heights.ts';
import {CRAG_SCRUB, KINNOULL_PEAK, kinnoullCrag, kinnoullWoodland, PERTH_ROCK_TONES} from './perth-woodland.ts';
import {perthGardens} from './perth-gardens.ts';
import {CROWNS, crownTexture, ISLAND_CANOPY, islandBeltTrees, kinnoullCanopy} from './perth-canopy.ts';
import {inSummitHole, SUMMIT, SUMMIT_CENTRE, summitBushes, summitDetail, summitGround} from './perth-summit.ts';
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
/** The Tay's shore (round 2, C3). Inside the OSM river outline the 16 m terrain still climbs the bank, so the drape shows above the water
 *  sheet there; painted as water (GROUND_COLOURS.water) it read as a dark band along every bank. It is painted as wet shingle and silt
 *  instead (`shore`, ASSUMED: R-pt3-a and the viaduct photographs show a pale grey-brown margin between the grass and the water). The
 *  sheet's own tone is broken by a tiling wash `wash` m across: slow streaks along the flow, lighter where the overcast sky lies on the
 *  water and darker in the channel (`light`, `dark`, each at most `alpha`; ASSUMED). */
export const SHORE = {shore: '#6e6a5c', wash: 360, light: '#a6b4ba', dark: '#4d6470', alpha: .16, streaks: 46} as const;
/** The water sheet's wash: a tiling canvas around WATER.colour (browser only; null in Node). */
function waterWash(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); if (!g) return null;
  g.fillStyle = `#${WATER.colour.toString(16).padStart(6, '0')}`; g.fillRect(0, 0, N, N);
  const rnd = (i: number, k: number) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0; i < SHORE.streaks; i++) {
    const x = rnd(i, 1) * N, y = rnd(i, 2) * N, rx = 20 + rnd(i, 3) * 70, ry = 3 + rnd(i, 4) * 10, a = (.35 + rnd(i, 5) * .65) * SHORE.alpha;
    g.fillStyle = rnd(i, 6) < .5 ? SHORE.light : SHORE.dark; g.globalAlpha = a;
    // drawn at each wrap offset so the tile repeats without a seam
    for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) { g.beginPath(); g.ellipse(x + ox, y + oy, rx, ry, (rnd(i, 7) - .5) * .5, 0, Math.PI * 2); g.fill(); }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / SHORE.wash, 1 / SHORE.wash); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** The Tay Viaduct, from Wikipedia ("Tay Viaduct") and Canmore 79826: span counts and the island arches' clear span and pier width. */
export const TAY_VIADUCT = {westSpans: 7, arches: 10, eastSpans: 6, archClear: 8.636, archPier: 1.219} as const;
/** ASSUMED viaduct sections (m; rail datum y = 0): iron side girders from y girder[0] to girder[1] (their tops the parapet), offset
 *  `girderOffset` from the centreline; masonry piers `pier` (along, across); the arch block `archWidth` wide with its crown `crown`
 *  under the rail; the walkway `walk` (inner, outer offset, top y) with a railing `rail` m above it. */
export const VIADUCT_FORM = {girder: [-1.7, .9] as const, girderThick: .35, girderOffset: 2.45, pier: [2.2, 6.2] as const, archWidth: 5.4, crown: -1.3, walk: [2.65, 4.45, -.35] as const, rail: 1.1} as const;
/** The girder spans' piers and paint from the photographs (Geograph 2166751 William Starkey 2010, 2892061 Roger Davies 2012, 4529878
 *  Richard Webb 2014, 4599836 Rude Health 2015; CC BY-SA 2.0; round 2, C4). Each pier is a pair of tall rusticated sandstone columns,
 *  one under each girder, under a capping course that spans both; the girders are painted pale grey and the footway's railing white.
 *  Sizes and tones are read by eye from them (ASSUMED): `column` m square, the cap `cap` m deep and `capOver` m past the columns, the
 *  rustication `courses` m apart, a darker joint every course. */
export const VIADUCT_LOOK = {column: 2.2, cap: .8, capOver: .35, courses: 1.2, stone: [.80, .70, .60] as Rgb, joint: [.62, .53, .45] as Rgb,
  girder: [.78, .80, .79] as Rgb, railing: [.95, .95, .93] as Rgb, shadeLift: .14} as const;
/** Round 3 (C4), from 2166751: the girder piers' columns are round and tall, about three times as high as they are wide over the water,
 *  rusticated in bands; a cross girder closes the dark gap between the cap and the deck; the plate girders carry vertical stiffeners.
 *  ASSUMED by eye: the visible height over `aspect` gives the diameter, within `diameter`; `sides` facets; bands `band` m tall, every
 *  other one `proud` m out; the cross girder up to `crossTop`; a stiffener every `stiffener` m, `stiffenerSize` (along, out). */
export const PIER_FORM = {aspect: 3, diameter: [1.2, 2.2] as const, sides: 10, band: .9, proud: .07, crossTop: -.55,
  stiffener: 1.8, stiffenerSize: [.16, .16] as const, stiffenerShade: .72, web: .62} as const;
/** Round 4 (C4, round-3 score): 2166751's twin columns stand together as one dumbbell mass, not apart under a slab like a trestle: a
 *  masonry web `PIER_FORM.web` of the diameter thick joins each pair from its foot to the cap, set back inside the columns' faces. The
 *  girder band was flat and dark: the girders are paler (VIADUCT_LOOK.girder) and the stiffeners stand prouder and darker, so they read. */
/** Road-bridge forms. Arch counts are sourced (round 2):
 *  - Perth Bridge (Smeaton, 1771) has nine arches: seven over the river and two smaller land arches at the ends (HES LB39339;
 *    Canmore 28308, "nine arches ... total span of 268m").
 *  - Queen's Bridge (1960) has three prestressed concrete spans on two piers (1960 Pathé press sheet, NoS 109399; Canmore 79821).
 *  Drawing them as equal spans from bank to bank is ASSUMED: Perth Bridge's land arches are smaller and Queen's Bridge's centre span
 *  is longer. The humpback rise follows OSM bridge:structure=humpback and is ASSUMED, as is the parapet height. */
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
/** Round 4 (round-3 score, C1): the crag keeps clear of the tower's foot and its annexe (x, z, radius m; ASSUMED by eye from the cliff view). */
export const CRAG_KEEP: readonly (readonly [number, number, number])[] = [[KINNOULL_TOWER.x, KINNOULL_TOWER.z, 22]];
export const PERTH_FEATURE_OMIT_IDS = [KINNOULL_TOWER.id];
/** Kinnoull Tower's look, from 8703 and 4307 (round 3, C1). It is a pale grey rubble tower with two red sandstone string courses and a
 *  projecting cornice, and a lower annexe against its north side about half its height (in 8703, seen from the west, the block on its
 *  left). All ASSUMED, by eye: the courses at `bands` of the height, `band` m deep, standing `proud` m out; the cornice `cornice` m
 *  deep and `over` m out; the annexe `annexe` (along x, across z, height share), and the stone and band tones. */
export const TOWER_LOOK = {bands: [.55, .8] as const, band: .45, proud: .06, cornice: .5, over: .22,
  annexe: [3.6, 3.0, .45] as const, stone: [.56, .54, .50] as Rgb, red: [.36, .17, .12] as Rgb} as const;
/** A vertical ring of `sides` quads about (x, z), from y0 to y1 at radius r, with UVs in metres (u round the ring, v up). */
function ring(b: Batch, x: number, z: number, r: number, y0: number, y1: number, sides: number, color: Rgb): void {
  for (let i = 0; i < sides; i++) {
    const a0 = i * 2 * Math.PI / sides, a1 = (i + 1) * 2 * Math.PI / sides, am = (a0 + a1) / 2, w = 2 * r * Math.sin(Math.PI / sides);
    const p = (a: number, y: number): V3 => [x + r * Math.cos(a), y, z + r * Math.sin(a)];
    b.quad(p(a0, y0), p(a1, y0), p(a1, y1), p(a0, y1), [i * w, y0], [(i + 1) * w, y0], [(i + 1) * w, y1], [i * w, y1], {facing: [Math.cos(am), 0, Math.sin(am)], color});
  }
}
/** Kinnoull Tower at its LiDAR place on `base` (the ground there): the coursed shaft, its red string courses and cornice, a capped top,
 *  and the lower annexe. Returns the drawn top. */
export function kinnoullTower(b: Batch, base: number): {top: number; annexeTop: number} {
  const {x, z, radius: r, height, sides} = KINNOULL_TOWER, L = TOWER_LOOK, y0 = base - .3, top = base + height;
  let y = y0;
  for (const share of L.bands) { const yb = base + height * share; ring(b, x, z, r, y, yb, sides, L.stone); ring(b, x, z, r + L.proud, yb, yb + L.band, sides, L.red); y = yb + L.band; }
  ring(b, x, z, r, y, top - L.cornice, sides, L.stone);
  ring(b, x, z, r + L.over, top - L.cornice, top, sides, L.stone);
  revolve(b, x, z, [[r, top - L.cornice], [r + L.over, top - L.cornice]], sides, L.stone); // the cornice's soffit, facing down
  revolve(b, x, z, [[r + L.over, top], [0, top]], sides, L.stone); // the roof
  const [ax, az, share] = L.annexe, annexeTop = base + height * share;
  b.box([x, (y0 + annexeTop) / 2, z - r - az / 2 + .4], [ax, annexeTop - y0, az], {color: L.stone});
  return {top, annexeTop};
}
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
  const canopy = kinnoullCanopy(ground, PERTH_LANDUSE.areas.wood, PERTH_LANDUSE.cliffs, PERTH_LANDUSE.areas.water), belts = islandBeltTrees(ground, PERTH_LANDUSE.areas.wood, PERTH_LANDUSE.areas.water);
  // the massed fill gives way to the canopy and to the islands' single trees
  const covered = {inCanopy: (x: number, z: number) => canopy.inCanopy(x, z) || belts.inBelt(x, z)};
  const cover = buildWaverleyCityGround(ground, footprints, PERTH_LANDUSE, {fillStep: PERTH_FILL_STEP, woodTrunks: false, drape: PERTH_DRAPE, woodland: kinnoullWoodland(ground, PERTH_LANDUSE.cliffs, covered), rockTones: PERTH_ROCK_TONES, waterPaint: SHORE.shore, gardens: perthGardens(), uncovered: (x, z) => inSummitHole(ground, x, z) || (uncovered?.(x, z) ?? false)});
  cover.group.name = 'perth-city-ground';
  const stats = {...cover.stats};
  // the water sheet: each OSM river polygon (less its islands) at the drape's level over the filled river, lifted WATER.lift
  const sheet = new Batch(), level = waterLevel(ground);
  for (const [o, ...holes] of PERTH_LANDUSE.areas.water) {
    const outer = clipRing(o!, PERTH_LANDUSE.extent); if (outer.length < 3) continue;
    fillSurface(sheet, outer, holes.map(h => clipRing(h, PERTH_LANDUSE.extent)).filter(h => h.length >= 3), (x, z) => level(x, z) + PERTH_DRAPE + WATER.lift);
  }
  const wg = sheet.build(), wash = waterWash(), m = new THREE.MeshPhongMaterial({color: wash ? 0xffffff : WATER.colour, map: wash, specular: WATER.specular, shininess: WATER.shininess, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
  const water = new THREE.Mesh(wg, m); water.name = 'perth-tay-water'; cover.group.add(water);
  stats.triangles += (wg.index ? wg.index.count : wg.getAttribute('position').count) / 3; stats.drawCalls++;
  // Kinnoull's crag (perth-woodland.ts kinnoullCrag): rock blocks and ledges set into the cliff, in plain vertex-coloured rock
  const crag = new Batch({colored: true});
  // flush slabs: the face in the rock's tone, the bevels dark (the joints), the uphill bevel of some a scrub ledge
  for (const k of kinnoullCrag(ground, PERTH_LANDUSE.cliffs, CRAG_KEEP, PERTH_DRAPE)) {
    crag.poly(k.face, undefined, {color: k.rgb, facing: [0, 1, 0]});
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4, mid: [number, number, number] = [(k.base[i]![0] + k.base[j]![0]) / 2 - k.x, 0, (k.base[i]![2] + k.base[j]![2]) / 2 - k.z];
      crag.poly([k.base[i]!, k.base[j]!, k.face[j]!, k.face[i]!], undefined, {color: k.scrub && i === k.ledge ? CRAG_SCRUB : k.joint, facing: mid});
    }
  }
  const cg = crag.build(), rock = new THREE.MeshLambertMaterial({vertexColors: true});
  const cragMesh = new THREE.Mesh(cg, rock); cragMesh.name = 'perth-kinnoull-crag'; cover.group.add(cragMesh);
  stats.triangles += (cg.index ? cg.index.count : cg.getAttribute('position').count) / 3; stats.drawCalls++;
  // the summit clearing's own close ground (perth-summit.ts), in the drape's hole there
  const near = PERTH_LANDUSE.paths.filter(p => p.line.some(([x, z]) => Math.hypot(x - SUMMIT_CENTRE[0], z - SUMMIT_CENTRE[1]) < SUMMIT.patch + 20));
  const summit = summitGround(ground, near), sm = new THREE.MeshLambertMaterial({map: summit.texture, color: summit.texture ? 0xffffff : 0x5b7431}), detail = summitDetail(sm);
  const summitMesh = new THREE.Mesh(summit.geometry, sm); summitMesh.name = 'perth-summit-ground'; cover.group.add(summitMesh);
  // low gorse bushes near the eye (perth-summit.ts summitBushes): flattened smooth spheres, half buried
  const bushMap = crownTexture(); if (bushMap) bushMap.repeat.set(4, 2);
  const bushes = summitBushes(ground, near), bushG = new THREE.SphereGeometry(1, 7, 4), bushM = new THREE.MeshLambertMaterial({map: bushMap});
  const bushMesh = new THREE.InstancedMesh(bushG, bushM, Math.max(1, bushes.length));
  {
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    bushes.forEach((b, i) => { q.setFromAxisAngle(up, b.x * 3.1 % 6.283); mx.compose(new THREE.Vector3(b.x, b.y + b.height * .35, b.z), q, new THREE.Vector3(b.radius, b.height * .65, b.radius * .8)); bushMesh.setMatrixAt(i, mx); c.setRGB(b.rgb[0], b.rgb[1], b.rgb[2], THREE.SRGBColorSpace); bushMesh.setColorAt(i, c); });
    bushMesh.count = bushes.length; bushMesh.name = 'perth-summit-gorse'; bushMesh.computeBoundingSphere(); cover.group.add(bushMesh);
    stats.triangles += bushes.length * (bushG.index ? bushG.index.count : bushG.getAttribute('position').count) / 3; stats.drawCalls++;
  }
  stats.triangles += summit.geometry.index!.count / 3; stats.drawCalls++;
  // Kinnoull's continuous canopy (perth-canopy.ts), in place of the massed crowns it covers
  const crownMap = crownTexture(), cm = new THREE.MeshLambertMaterial({vertexColors: true, map: crownMap});
  if (canopy.geometry) { const mesh = new THREE.Mesh(canopy.geometry, cm); mesh.name = 'perth-kinnoull-canopy'; cover.group.add(mesh); stats.triangles += canopy.geometry.index!.count / 3; stats.drawCalls++; }
  // the small islands' tree belts (perth-canopy.ts islandBeltTrees): round crowns (a 7 x 4 sphere, smooth) on bare trunks
  const beltCrown = new THREE.SphereGeometry(1, 7, 4), beltTrunk = new THREE.CylinderGeometry(1, 1, 1, 3, 1, true);
  const beltMap = crownMap?.clone() ?? null; if (beltMap) { beltMap.repeat.set(3, 1.5); beltMap.needsUpdate = true; }
  const beltLeaf = new THREE.MeshLambertMaterial({map: beltMap}), beltBark = new THREE.MeshLambertMaterial({color: 0x4a3f33});
  const crowns = new THREE.InstancedMesh(beltCrown, beltLeaf, Math.max(1, belts.trees.length)), trunks = new THREE.InstancedMesh(beltTrunk, beltBark, Math.max(1, belts.trees.length));
  {
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    belts.trees.forEach((t, i) => {
      q.setFromAxisAngle(up, (t.x * 7.1 + t.z * 3.3) % 6.283);
      mx.compose(new THREE.Vector3(t.x, t.y + t.height - t.crown / 2, t.z), q, new THREE.Vector3(t.radius, t.crown / 2, t.radius)); crowns.setMatrixAt(i, mx);
      c.setRGB(t.rgb[0] * CROWNS.lift, t.rgb[1] * CROWNS.lift, t.rgb[2] * CROWNS.lift, THREE.SRGBColorSpace); crowns.setColorAt(i, c);
      const th = t.height - t.crown * .7 + .4; mx.compose(new THREE.Vector3(t.x, t.y - .4 + th / 2, t.z), q, new THREE.Vector3(ISLAND_CANOPY.trunk, th, ISLAND_CANOPY.trunk)); trunks.setMatrixAt(i, mx);
    });
    crowns.count = trunks.count = belts.trees.length; crowns.name = 'perth-island-trees'; trunks.name = 'perth-island-trunks';
    crowns.computeBoundingSphere(); trunks.computeBoundingSphere(); cover.group.add(crowns, trunks);
    stats.triangles += belts.trees.length * ((beltCrown.index ? beltCrown.index.count : beltCrown.getAttribute('position').count) / 3 + 6); stats.drawCalls += 2;
  }
  return {group: cover.group, stats, dispose() { wg.dispose(); wash?.dispose(); m.dispose(); canopy.geometry?.dispose(); crownMap?.dispose(); cm.dispose(); beltCrown.dispose(); beltTrunk.dispose(); beltMap?.dispose(); beltLeaf.dispose(); beltBark.dispose(); summit.geometry.dispose(); summit.texture?.dispose(); detail?.dispose(); sm.dispose(); bushG.dispose(); bushMap?.dispose(); bushM.dispose(); cg.dispose(); rock.dispose(); cover.dispose(); }};
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
const post = (b: Batch, p: Pt, t: Pt, along: number, across: number, y0: number, y1: number, color?: Rgb): void => {
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
  return {length, at, vertices: cum};
}

/** The Tay Viaduct along its mapped path: piers, iron spans, the island arches, the walkway. Returns the layout for the tests. */
export function tayViaduct(masonry: Batch, ironwork: Batch, ground: Pick<Terrain, 'heightAt'>, line: readonly Pt[] = file.bridges.viaduct.line as Pt[]): {piers: number[]; pierPlan: {p: Pt; t: Pt}[]; columns: {p: Pt; diameter: number; visible: number}[]; arches: [number, number]; island: [number, number]; length: number} {
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
    const L = VIADUCT_LOOK;
    for (const side of [-1, 1]) post(ironwork, [c[0] + n[0] * side * F.girderOffset, c[1] + n[1] * side * F.girderOffset], t, len, F.girderThick, F.girder[0], F.girder[1], L.girder);
    // the plate girders' vertical stiffeners, on each girder's outer face (PIER_FORM)
    const shade: Rgb = [L.girder[0] * PIER_FORM.stiffenerShade, L.girder[1] * PIER_FORM.stiffenerShade, L.girder[2] * PIER_FORM.stiffenerShade], [sa, so] = PIER_FORM.stiffenerSize;
    for (const side of [-1, 1]) for (let u = PIER_FORM.stiffener / 2; u < len; u += PIER_FORM.stiffener) {
      const off = side * (F.girderOffset + F.girderThick / 2 + so / 2);
      post(ironwork, [A.p[0] + t[0] * u + n[0] * off, A.p[1] + t[1] * u + n[1] * off], t, sa, so, F.girder[0], F.girder[1], shade);
    }
    // the walkway, outside the girder on the outer side of the curve, and its railing (top and mid rails)
    const o = -turn, wc = (F.walk[0] + F.walk[1]) / 2;
    post(ironwork, [c[0] + n[0] * o * wc, c[1] + n[1] * o * wc], t, len, F.walk[1] - F.walk[0], F.walk[2] - .25, F.walk[2], L.girder);
    for (const h of [F.rail, F.rail / 2]) post(ironwork, [c[0] + n[0] * o * (F.walk[1] - .05), c[1] + n[1] * o * (F.walk[1] - .05)], t, len, .06, F.walk[2] + h - .06, F.walk[2] + h, L.railing);
    for (let s = 1; s < len; s += 2.5) post(ironwork, [A.p[0] + t[0] * s + n[0] * o * (F.walk[1] - .05), A.p[1] + t[1] * s + n[1] * o * (F.walk[1] - .05)], t, .08, .08, F.walk[2], F.walk[2] + F.rail, L.railing);
  };
  // each span in straight pieces broken at the mapped path's bends (round 4): a single chord pier to pier cut inside the curve, and the
  // track's deck, which follows the path, stood out past the girder there as a dark concrete band in pt-tay-viaduct
  const span = (from: number, to: number) => { const cuts = [from, ...w.vertices.filter(v => v > from + 1 && v < to - 1), to]; for (let i = 1; i < cuts.length; i++) girders(cuts[i - 1]!, cuts[i]!); };
  for (let k = 0; k < V.westSpans; k++) span(piers[k]!, piers[k + 1]!);
  for (let k = 0; k < V.eastSpans; k++) span(piers[V.westSpans + 1 + k]!, piers[V.westSpans + 2 + k]!);
  // masonry piers under the girder spans (into the river bed), the abutments at the ends: twin rusticated columns, one under each girder,
  // under a capping course across both (VIADUCT_LOOK)
  const L = VIADUCT_LOOK, pierPlan: {p: Pt; t: Pt}[] = [], columns: {p: Pt; diameter: number; visible: number}[] = [];
  for (const s of piers) {
    const {p, t} = w.at(s), n: Pt = [-t[1], t[0]], foot = ground.heightAt(p[0], p[1]) - 1.5, capY = F.girder[0] - L.cap; pierPlan.push({p, t});
    const water = ground.heightAt(p[0], p[1]) + PERTH_DRAPE + WATER.lift, diameter = Math.max(PIER_FORM.diameter[0], Math.min(PIER_FORM.diameter[1], (capY - water) / PIER_FORM.aspect));
    for (const side of [-1, 1]) {
      const q: Pt = [p[0] + n[0] * side * F.girderOffset, p[1] + n[1] * side * F.girderOffset];
      // a round column, rusticated in bands (every other band proud), its diameter a third of its height over the water (PIER_FORM)
      ring(masonry, q[0], q[1], diameter / 2, foot, capY, PIER_FORM.sides, L.joint);
      for (let y = foot, k = 0; y < capY; y += PIER_FORM.band, k++) if (k % 2) ring(masonry, q[0], q[1], diameter / 2 + PIER_FORM.proud, y, Math.min(capY, y + PIER_FORM.band), PIER_FORM.sides, L.stone);
    }
    // the web joining the pair into one mass (PIER_FORM.web)
    post(masonry, p, t, diameter * PIER_FORM.web, 2 * F.girderOffset, foot, capY, L.joint);
    post(masonry, p, t, diameter + 2 * L.capOver, 2 * F.girderOffset + diameter + 2 * L.capOver, capY, F.girder[0], L.stone);
    // the cross girder on the cap, between the plate girders up to the deck: no dark gap over the cap
    post(ironwork, p, t, diameter, 2 * F.girderOffset - F.girderThick, F.girder[0], PIER_FORM.crossTop, L.girder);
    columns.push({p, diameter, visible: capY - water});
  }
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
  return {piers, pierPlan, columns, arches: [a0, a1], island, length: w.length};
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
