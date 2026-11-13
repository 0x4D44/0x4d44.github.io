// node tools/build-perth-west.ts --raw-dir ../.scratch/perth-west/osm
// The OSM blocks of the Perth west extension (tools/perth-west-extent.ts), cut by the same builder as the context scene (build-perth.ts,
// build-waverley.ts buildStationOsm): bounded public map API tiles (each under the API's 50,000-node limit), raw tiles kept local, only
// the packed scene committed (web/src/data/perth-scene-west.json: the Waverley packed format, so core/waverley-data.ts unpackWaverleyScene
// reads it). Buildings and mapped roofs only (no rails or platforms), only blocks the context scene (perth-scene.json) does not
// already hold, by id, and only blocks that touch the region (the cut is rounded outward to 1e-4 degree and the map API returns whole
// intersecting ways, so it brings a few blocks that stand wholly outside the extent).
// The cut runs east to the context scene's own west edge (perth-west-region.ts), not to the extent's: the context scene's OSM cut stops at
// about x -1022 while the extension starts at x -1200, so the 178 m between them is in neither and would be a bare strip.
// The extent began at x -2800 when the first six tiles were fetched and was widened to x -3232 (the lead, 2026-11-13 17:58Z) to put the A9 bypass
// inside it: three more tiles cover the new west strip, and the rebuild reads the first six as they were (a fresh --raw-dir seeded with their files).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { unpackWaverleyScene } from '../core/waverley-data.ts';
import { buildStationOsm } from './build-waverley.ts';
import { PERTH_WEST_AREA, touchesRegion } from './perth-west-region.ts';

/** west,south,east,north as the map API takes them, southern row first. `w<row><col>`: the original cut's two columns by three rows over lon
 *  -3.4839..-3.455 (fetched 2026-11-13 15:21Z, when the extent began at x -2800). `wW<row>`: the strip west of them, one tile a row, that the
 *  widening to x0 -3232 added (the A9 bypass lies inside it now). Literal, not computed from the bbox: the raw tiles on disk are named and never
 *  checked against a bbox (build-waverley.ts buildStationOsm), so a tile whose bbox moved under its old name would be read stale. The test
 *  pins that these tile PERTH_WEST_BBOX exactly. Suburbs: each is far under the API's 50,000 nodes (the original six hold 3,590 to 11,514). */
export const PERTH_WEST_TILES: readonly { name: string; bbox: number[] }[] = [
  { name: 'w00', bbox: [-3.4839, 56.3803, -3.4694, 56.3888] },
  { name: 'w01', bbox: [-3.4694, 56.3803, -3.455, 56.3888] },
  { name: 'w10', bbox: [-3.4839, 56.3888, -3.4694, 56.3974] },
  { name: 'w11', bbox: [-3.4694, 56.3888, -3.455, 56.3974] },
  { name: 'w20', bbox: [-3.4839, 56.3974, -3.4694, 56.4059] },
  { name: 'w21', bbox: [-3.4694, 56.3974, -3.455, 56.4059] },
  { name: 'wW0', bbox: [-3.491, 56.3803, -3.4839, 56.3888] },
  { name: 'wW1', bbox: [-3.491, 56.3888, -3.4839, 56.3974] },
  { name: 'wW2', bbox: [-3.491, 56.3974, -3.4839, 56.4059] },
];

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), flag = (key: string, fallback: string) => args.includes(key) ? args[args.indexOf(key) + 1]! : fallback;
  const dataDir = fileURLToPath(new URL('../web/src/data/', import.meta.url));
  const context = unpackWaverleyScene(JSON.parse(await readFile(path.join(dataDir, 'perth-scene.json'), 'utf8')));
  const held = new Set([...context.buildings, ...context.roofs].map(b => b.id));
  await buildStationOsm({
    tiles: PERTH_WEST_TILES, site: PERTH_WEST_AREA, agent: 'almanac-perth-build/0.1',
    rawDir: flag('--raw-dir', '../.scratch/perth-west/osm'), out: flag('--out', path.join(dataDir, 'perth-scene-west.json')),
    finish: scene => {
      scene.rails = []; scene.platforms = [];
      const before = scene.buildings.length + scene.roofs.length, count = () => scene.buildings.length + scene.roofs.length;
      scene.buildings = scene.buildings.filter(b => !held.has(b.id)); scene.roofs = scene.roofs.filter(b => !held.has(b.id));
      const inContext = before - count(), mid = count();
      scene.buildings = scene.buildings.filter(b => touchesRegion(b)); scene.roofs = scene.roofs.filter(b => touchesRegion(b));
      console.error(`west cut: ${before} blocks, ${inContext} already in perth-scene.json, ${mid - count()} wholly outside the region, ${scene.buildings.length} buildings and ${scene.roofs.length} roofs kept`);
    },
  });
}
