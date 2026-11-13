// Rebuild: node tools/build-perth-east-terrain.ts --cache /Users/md/kx-data/perth-lidar --osm /Users/md/kx-data/perth-lidar/osm-extra/east-map.json
// P3's east patch (lead ruling 2026-11-10 13:13): the ground east of the main terrain's edge (x 2624) that pt-kinnoull-cliff looks
// over, the Tay's corridor below Kinnoull, from the same Phase I 1 m DTM tile (NO12) by the same builder (buildWaverleyTerrain) and
// sampler (sampleOrBank, the same station-origin reference), on a coarser 32 m lattice. Only the corridor: Phase I has no data north of
// z 80 east of x about 2700 (Kinnoull's crest and Binn Hill), so the patch's north edge is z 80 and nothing there is invented.
// Each node also carries a ground class: water where the DTM's own pixel is nodata (the Phase I water surface), else the OSM land use
// round it (one public map-API tile, east-map.json: its date and query in east-map.RECEIPT.txt beside it), else field.
// Writes web/src/data/perth-terrain-east.json. Contains Scottish public sector LiDAR data (OGL v3); © OpenStreetMap contributors (ODbL).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { project, unproject } from '../core/geo.ts';
import type { Pt } from '../core/geo.ts';
import type { Extent } from '../core/terrain.ts';
import { PERTH_ORIGIN } from '../core/perth-data.ts';
import { etrs89ToGrid, readGeoTiff } from './terrain-source.ts';
import { openScottishDtm, SCOTTISH_DTM_PHASE1_BASE } from './waverley-terrain-source.ts';
import { buildWaverleyTerrain } from './build-waverley-terrain.ts';
import { PERTH_TERRAIN_EXTENT, PERTH_TERRAIN_SITE, sampleOrBank } from './build-perth-terrain.ts';

/** The patch: from the main terrain's east edge to x 4128, over the covered corridor z 80 to 1232 (past the main terrain's south edge,
 *  912, so the cliff camera's south-east look has ground under it), in whole 32 m steps. */
export const PERTH_EAST_EXTENT: Extent = { x0: PERTH_TERRAIN_EXTENT.x1, z0: 80, x1: 4128, z1: 1232 };
/** ASSUMED: the Tay is up to about 400 m wide here, wider than the main terrain's 128 m search: a node still on nodata after it takes
 *  the lowest valid pixel on the nearest of these wider rings (the bank's lowest ground standing for the water, as sampleOrBank). */
export const EAST_WATER_RINGS = [192, 256, 320] as const;
export const PERTH_EAST_STEP = 32;
/** The node classes, by index in the file's `classes` string. */
export const EAST_CLASSES = ['field', 'water', 'wood', 'scrub', 'grass', 'houses', 'rock'] as const;

type Element = { type: string; id: number; lat?: number; lon?: number; nodes?: number[]; tags?: Record<string, string>; members?: { type: string; ref: number; role: string }[] };
function classOf(t: Record<string, string>): (typeof EAST_CLASSES)[number] | undefined {
  if (t.building) return undefined;
  if (t.natural === 'water' || t.waterway === 'riverbank' || t.water) return 'water';
  if (t.natural === 'wood' || t.landuse === 'forest') return 'wood';
  if (t.natural === 'scrub' || t.natural === 'heath') return 'scrub';
  if (t.natural === 'bare_rock' || t.natural === 'scree') return 'rock';
  if (t.landuse === 'residential' || t.landuse === 'industrial' || t.landuse === 'commercial') return 'houses';
  if (t.landuse === 'grass' || t.landuse === 'meadow' || t.leisure === 'park' || t.leisure === 'golf_course' || t.natural === 'grassland' || t.landuse === 'cemetery') return 'grass';
  if (t.landuse === 'farmland' || t.landuse === 'farmyard') return 'field';
  return undefined;
}
export const pip = (x: number, z: number, p: readonly Pt[]) => { let yes = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i]![1] > z) !== (p[j]![1] > z) && x < (p[j]![0] - p[i]![0]) * (z - p[i]![1]) / (p[j]![1] - p[i]![1]) + p[i]![0]) yes = !yes; return yes; };

/** The OSM areas (closed ways, and multipolygon outers made of closed ways) with a class, smallest first (the most specific wins). */
export function eastAreas(elements: Element[]): { cls: (typeof EAST_CLASSES)[number]; ring: Pt[]; area: number }[] {
  const all = new Map(elements.map(e => [`${e.type}/${e.id}`, e]));
  const ring = (ids: number[]): Pt[] | undefined => { const out: Pt[] = []; for (const id of ids) { const n = all.get(`node/${id}`); if (n?.lat === undefined || n.lon === undefined) return undefined; out.push(project(n.lat, n.lon, PERTH_ORIGIN) as Pt); } return out; };
  const out: { cls: (typeof EAST_CLASSES)[number]; ring: Pt[]; area: number }[] = [];
  const add = (cls: (typeof EAST_CLASSES)[number], ids: number[]) => { if (ids.length < 4 || ids[0] !== ids.at(-1)) return; const r = ring(ids); if (!r) return; let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j]![0] - r[i]![0]) * (r[j]![1] + r[i]![1]); out.push({ cls, ring: r, area: Math.abs(a / 2) }); };
  for (const e of elements) {
    const cls = e.tags ? classOf(e.tags) : undefined; if (!cls) continue;
    if (e.type === 'way' && e.nodes) add(cls, e.nodes);
    if (e.type === 'relation' && e.tags?.type === 'multipolygon') for (const m of e.members ?? []) if (m.type === 'way' && m.role === 'outer') { const w = all.get(`way/${m.ref}`); if (w?.nodes) add(cls, w.nodes); }
  }
  return out.sort((a, b) => a.area - b.area);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const value = (flag: string, fallback: string) => args.includes(flag) ? args[args.indexOf(flag) + 1]! : fallback;
  const cache = value('--cache', '/Users/md/kx-data/perth-lidar'), osm = value('--osm', path.join(cache, 'osm-extra/east-map.json'));
  const out = value('--out', fileURLToPath(new URL('../web/src/data/perth-terrain-east.json', import.meta.url)));
  const ostn = { grid: readGeoTiff(await readFile(path.join(cache, 'ostn15.tif'))) };
  const names = ['NO12_1M_DTM_PHASE1.tif', 'NO02_1M_DTM_PHASE1.tif', 'NO11_1M_DTM_PHASE1.tif'];
  const sources = await Promise.all(names.map(name => openScottishDtm(name, cache, SCOTTISH_DTM_PHASE1_BASE)));
  const at = async (pe: number, pn: number) => { for (const source of sources) { const v = await source.at(pe, pn); if (v !== null) return v; } return null; };
  const grid = (x: number, z: number) => { const p = unproject(x, z, PERTH_ORIGIN); return etrs89ToGrid(ostn, p.lat, p.lon); };
  const sample = async (x: number, z: number) => {
    const [e, n] = grid(x, z), own = await sampleOrBank(at, e, n); if (own !== null) return own;
    for (const r of EAST_WATER_RINGS) { let low: number | null = null; for (let k = 0; k < 32; k++) { const v = await at(e + r * Math.cos(k * Math.PI / 16), n + r * Math.sin(k * Math.PI / 16)); if (v !== null && (low === null || v < low)) low = v; } if (low !== null) return low; }
    return null;
  };
  const file = await buildWaverleyTerrain(sample, PERTH_EAST_EXTENT, { ...PERTH_TERRAIN_SITE, step: PERTH_EAST_STEP });
  const areas = eastAreas(JSON.parse(await readFile(osm, 'utf8')).elements as Element[]);
  const E = PERTH_EAST_EXTENT, nx = (E.x1 - E.x0) / PERTH_EAST_STEP + 1, nz = (E.z1 - E.z0) / PERTH_EAST_STEP + 1;
  let classes = '';
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = E.x0 + i * PERTH_EAST_STEP, z = E.z0 + j * PERTH_EAST_STEP, [e, n] = grid(x, z);
    const cls = (await at(e, n)) === null ? 'water' : areas.find(a => pip(x, z, a.ring))?.cls ?? 'field';
    classes += String(EAST_CLASSES.indexOf(cls));
  }
  const json = JSON.stringify({ ...file, classNames: EAST_CLASSES, classes,
    classSource: 'water: the node\'s own Phase I DTM pixel is nodata (the water surface); else the smallest OSM area holding the node (OSM map API tile, 2026-11-10, bbox -3.396413,56.380036,-3.370677,56.391115; © OpenStreetMap contributors, ODbL 1.0); else field' });
  await mkdir(path.dirname(out), { recursive: true }); await writeFile(out, json);
  const counts = Object.fromEntries(EAST_CLASSES.map((c, k) => [c, [...classes].filter(ch => ch === String(k)).length]));
  console.log(JSON.stringify({ out, nx, nz, bytes: json.length, gzip: gzipSync(json).length, areas: areas.length, counts }));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
