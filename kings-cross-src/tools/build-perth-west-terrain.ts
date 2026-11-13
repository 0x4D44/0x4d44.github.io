// Rebuild: node tools/build-perth-west-terrain.ts --cache <lidar cache dir> --osm <west-map-full.json>,<west-a9-strip.json>
//   --osm takes several files (comma-separated); --extent and --out preview a rebuild over another extent. The committed file is the shared
//   PERTH_WEST_EXTENT (perth-west-extent.ts) from the two OSM tiles below. The cache holds the DTM tiles' byte ranges and the OSTN15 grid.
// The two OSM tiles (2026-11-13, HTTP 200, kept outside git; osm-extra/<name>.RECEIPT.txt beside each; the build refuses tiles that do not
// cover the extent plus WEST_OSM_MARGIN m each side, osmGap):
//   west-map-full.json  15:22Z, 10.6 MB: GET https://api.openstreetmap.org/api/0.6/map.json?bbox=-3.48454,56.380035,-3.457243,56.406225
//   west-a9-strip.json  15:32Z, 2.5 MB:  GET https://api.openstreetmap.org/api/0.6/map.json?bbox=-3.500000,56.380000,-3.483889,56.406300
//   (the first is the first brief's extent, x -2800..-1200, plus 40 m; the second is the strip beside it that the widened extent, x -3232, needs.)
// The west extension's ground (lead's brief 2026-11-13, PERTH_WEST_EXTENT): the land from the main terrain's west edge (x -1200) out past
// the A9 western bypass, from the same Phase I 1 m DTM tiles (NO02 here, NO12 and NO11 by the same lookup order) by the same builder
// (buildWaverleyTerrain) and sampler (sampleOrBank, the station-origin reference: so its heights share the main terrain's datum), on the
// main terrain's own 16 m lattice. 16 m, not the east patch's 32 m: the extent is 2,832 m from north to south, which is 177 steps of 16 m
// and not a whole number of 32 m ones; and on a 16 m lattice that starts on the main terrain's rows (x -1200, z -1200 + 16 j) the shared edge
// is made of the very same nodes, so the two files agree there exactly (seamMismatches; tests/perth-west-terrain.test.ts).
// Each node also carries a ground class as the east patch does: water where the DTM's own pixel is nodata (the Phase I water surface),
// else the smallest OSM land-use area round it (two public map-API tiles, above), else field.
// Writes web/src/data/perth-terrain-west.json. Contains Scottish public sector LiDAR data (OGL v3); © OpenStreetMap contributors (ODbL).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { unproject } from '../core/geo.ts';
import { createTerrain } from '../core/terrain.ts';
import type { Extent, TerrainFile } from '../core/terrain.ts';
import { PERTH_ORIGIN } from '../core/perth-data.ts';
import { etrs89ToGrid, readGeoTiff } from './terrain-source.ts';
import { openScottishDtm, SCOTTISH_DTM_PHASE1_BASE } from './waverley-terrain-source.ts';
import { buildWaverleyTerrain } from './build-waverley-terrain.ts';
import type { ScottishTerrainSite } from './build-waverley-terrain.ts';
import { PERTH_TERRAIN_EXTENT, PERTH_TERRAIN_SITE, WATER_RAYS, WATER_RINGS, sampleOrBank } from './build-perth-terrain.ts';
import { EAST_CLASSES, eastAreas, pip } from './build-perth-east-terrain.ts';
import { PERTH_WEST_EXTENT } from './perth-west-extent.ts';

export { PERTH_WEST_EXTENT } from './perth-west-extent.ts';
/** The main terrain's own spacing, so the two lattices are one and the shared edge is made of the same nodes. */
export const PERTH_WEST_STEP = 16;
/** The node classes, by index in the file's `classes` string: the east patch's vocabulary (water, field, wood, scrub, grass, houses, rock). */
export const WEST_CLASSES = EAST_CLASSES;
/** The main terrain's site (origin, the three Phase I tiles) with the day these tiles were read and the nodata rule as it applies here: the
 *  west has no Tay, only ponds and the odd Phase I gap, and the same rings (so a node on the shared edge samples as the main terrain's does). */
export const PERTH_WEST_SITE: ScottishTerrainSite = { ...PERTH_TERRAIN_SITE, step: PERTH_WEST_STEP, accessed: '2026-11-13',
  nodata: `A node on a nodata pixel (a pond's water surface and isolated Phase I gaps) takes the LOWEST valid native pixel on the nearest of the rings ${WATER_RINGS.join(', ')} m round it (${WATER_RAYS} bearings each) that has one: ASSUMED, the bank's lowest ground standing for the water surface; beyond ${WATER_RINGS.at(-1)} m the build refuses.` };
/** A lon/lat box as the map API takes it: west, south, east, north (degrees). */
export type LonLatBox = readonly [west: number, south: number, east: number, north: number];
/** How far (m) beyond the extent the OSM tiles must reach, so a node on the edge sees the areas round it. */
export const WEST_OSM_MARGIN = 40;
/** The extent plus `margin` each side as a lon/lat box (the local frame is equirectangular: a box in it is a box in lon/lat). */
export function osmWanted(extent: Extent, margin = WEST_OSM_MARGIN): LonLatBox {
  const nw = unproject(extent.x0 - margin, extent.z0 - margin, PERTH_ORIGIN), se = unproject(extent.x1 + margin, extent.z1 + margin, PERTH_ORIGIN);
  return [nw.lon, se.lat, se.lon, nw.lat];
}
/**
 * A part of `want` that no tile covers, as a box (the first cell, from the north-west, of the grid the tiles' edges cut `want` into), or null
 * when the tiles cover it all. Tiles that touch cover; so do tiles that overlap.
 */
export function osmGap(tiles: readonly LonLatBox[], want: LonLatBox): LonLatBox | null {
  const cuts = (lo: number, hi: number, at: (t: LonLatBox) => number[]) => [...new Set([lo, hi, ...tiles.flatMap(at).filter(v => v > lo && v < hi)])].sort((a, b) => a - b);
  const xs = cuts(want[0], want[2], t => [t[0], t[2]]), ys = cuts(want[1], want[3], t => [t[1], t[3]]);
  for (let j = ys.length - 2; j >= 0; j--) for (let i = 0; i + 1 < xs.length; i++) {
    const x = (xs[i]! + xs[i + 1]!) / 2, y = (ys[j]! + ys[j + 1]!) / 2;
    if (!tiles.some(t => x >= t[0] && x <= t[2] && y >= t[1] && y <= t[3])) return [xs[i]!, ys[j]!, xs[i + 1]!, ys[j + 1]!];
  }
  return null;
}

type Area = ReturnType<typeof eastAreas>[number];
/**
 * The class of every node of a lattice over `extent`, row by row (z outer, x inner), one digit per node: an index into WEST_CLASSES.
 * Water where `wet` says the node's own DTM pixel is nodata; else the smallest area holding the node (areas come smallest first, as
 * eastAreas gives them); else field. The same rule as build-perth-east-terrain.ts, with a bounding-box test ahead of the polygon one.
 */
export async function nodeClasses(areas: readonly Area[], extent: Extent, step: number, wet: (x: number, z: number) => Promise<boolean>): Promise<string> {
  const nx = Math.round((extent.x1 - extent.x0) / step) + 1, nz = Math.round((extent.z1 - extent.z0) / step) + 1;
  const boxes = areas.map(a => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of a.ring) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); } return [x0, z0, x1, z1] as const; });
  const out: string[] = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = extent.x0 + i * step, z = extent.z0 + j * step;
    let cls: (typeof WEST_CLASSES)[number] = 'field';
    if (await wet(x, z)) cls = 'water';
    else for (let k = 0; k < areas.length; k++) { const b = boxes[k]!; if (x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3] && pip(x, z, areas[k]!.ring)) { cls = areas[k]!.cls; break; } }
    out.push(String(WEST_CLASSES.indexOf(cls)));
  }
  return out.join('');
}

/**
 * The shared edge of the west file and the main file: the west's last column (x = main's first column x) against the main's first
 * column, at every node of the main's edge. `bad` is every node where the heights differ (metres, as the files decode them).
 */
export function seamMismatches(west: TerrainFile, main: TerrainFile): { checked: number; bad: { z: number; west: number; main: number }[] } {
  const w = createTerrain(west), m = createTerrain(main), g = m.grids[0]!, x = g.x0;
  if (Math.abs(west.extent.x1 - x) > 1e-9) throw new Error(`the west extent's east edge ${west.extent.x1} is not the main terrain's west edge ${x}`);
  const bad: { z: number; west: number; main: number }[] = [];
  for (let j = 0; j < g.nz; j++) {
    const z = g.z0 + j * g.step, hw = w.heightAt(x, z), hm = m.heightAt(x, z);
    if (hw !== hm) bad.push({ z, west: hw, main: hm });
  }
  return { checked: g.nz, bad };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const value = (flag: string, fallback: string) => args.includes(flag) ? args[args.indexOf(flag) + 1]! : fallback;
  const numbers = (flag: string, fallback: readonly number[]) => value(flag, fallback.join(',')).split(',').map(Number);
  const cache = value('--cache', '/Users/md/kx-data/perth-lidar');
  const osmFiles = value('--osm', ['west-map-full.json', 'west-a9-strip.json'].map(name => path.join(cache, 'osm-extra', name)).join(',')).split(',');
  const out = value('--out', fileURLToPath(new URL('../web/src/data/perth-terrain-west.json', import.meta.url)));
  const mainPath = value('--main', fileURLToPath(new URL('../web/src/data/perth-terrain.json', import.meta.url)));
  // the shared extent unless a rebuild over another one is asked for (the lead changes the shared file; this flag only previews it)
  const [x0, z0, x1, z1] = numbers('--extent', [PERTH_WEST_EXTENT.x0, PERTH_WEST_EXTENT.z0, PERTH_WEST_EXTENT.x1, PERTH_WEST_EXTENT.z1]) as [number, number, number, number];
  const extent: Extent = { x0, z0, x1, z1 };
  // the OSM tiles first: a build they do not cover would class the nodes beyond them as field without saying so
  const elements = new Map<string, Parameters<typeof eastAreas>[0][number]>(), tiles: LonLatBox[] = [];
  for (const osm of osmFiles) {
    const tile = JSON.parse(await readFile(osm, 'utf8')) as { bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number }; elements: Parameters<typeof eastAreas>[0] };
    if (!tile.bounds) throw new Error(`${osm} has no bounds: not a map API tile`);
    tiles.push([tile.bounds.minlon, tile.bounds.minlat, tile.bounds.maxlon, tile.bounds.maxlat]);
    for (const e of tile.elements) elements.set(`${e.type}/${e.id}`, e);
  }
  const gap = osmGap(tiles, osmWanted(extent));
  if (gap) throw new Error(`the OSM tiles do not cover the extent plus ${WEST_OSM_MARGIN} m: nothing holds the box ${gap.join(',')} (west,south,east,north)`);
  const ostn = { grid: readGeoTiff(await readFile(path.join(cache, 'ostn15.tif'))) };
  const names = PERTH_WEST_SITE.urls.map(url => path.basename(url));
  const sources = await Promise.all(names.map(name => openScottishDtm(name, cache, SCOTTISH_DTM_PHASE1_BASE)));
  const at = async (pe: number, pn: number) => { for (const source of sources) { const v = await source.at(pe, pn); if (v !== null) return v; } return null; };
  const grid = (x: number, z: number) => { const p = unproject(x, z, PERTH_ORIGIN); return etrs89ToGrid(ostn, p.lat, p.lon); };
  const sample = async (x: number, z: number) => { const [e, n] = grid(x, z); return sampleOrBank(at, e, n); };
  const file = await buildWaverleyTerrain(sample, extent, PERTH_WEST_SITE);
  const areas = eastAreas([...elements.values()]);
  const classes = await nodeClasses(areas, extent, PERTH_WEST_STEP, async (x, z) => { const [e, n] = grid(x, z); return (await at(e, n)) === null; });
  const json = JSON.stringify({ ...file, classNames: WEST_CLASSES, classes,
    classSource: `water: the node's own Phase I DTM pixel is nodata (the water surface); else the smallest OSM area holding the node (OSM map API, ${tiles.length === 1 ? 'one tile' : `${tiles.length} tiles`}, ${PERTH_WEST_SITE.accessed}, bbox ${tiles.map(t => t.join(',')).join(' and ')}; © OpenStreetMap contributors, ODbL 1.0); else field` });
  const seam = seamMismatches(JSON.parse(json) as TerrainFile, JSON.parse(await readFile(mainPath, 'utf8')) as TerrainFile);
  if (seam.bad.length) throw new Error(`the west file disagrees with the main terrain on ${seam.bad.length} of ${seam.checked} shared edge nodes: ${JSON.stringify(seam.bad.slice(0, 5))}`);
  await mkdir(path.dirname(out), { recursive: true }); await writeFile(out, json);
  const counts = Object.fromEntries(WEST_CLASSES.map((c, k) => [c, [...classes].filter(ch => ch === String(k)).length]));
  const g = file.grids[0]!;
  console.log(JSON.stringify({ out, extent, nx: g.nx, nz: g.nz, bytes: Buffer.byteLength(json), gzip: gzipSync(json).length, areas: areas.length, counts, seamChecked: seam.checked, mainExtent: PERTH_TERRAIN_EXTENT, referenceGroundAod: file.provenance.referenceGroundAod, datumAod: file.datumAod }));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
