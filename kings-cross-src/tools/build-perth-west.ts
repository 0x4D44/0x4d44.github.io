// node tools/build-perth-west.ts --raw-dir ../.scratch/perth-west/osm
// The OSM blocks of the Perth west extension (tools/perth-west-extent.ts), cut by the same builder as the context scene (build-perth.ts,
// build-waverley.ts buildStationOsm): bounded public map API tiles (each under the API's 50,000-node limit), raw tiles kept local, only
// the packed scene committed (web/src/data/perth-scene-west.json: the Waverley packed format, so core/waverley-data.ts unpackWaverleyScene
// reads it). Buildings and mapped roofs only (no rails or platforms), only blocks the context scene (perth-scene.json) does not
// already hold, by id, and only blocks that touch the region (the cut is rounded outward to 1e-4 degree and the map API returns whole
// intersecting ways, so it brings a few blocks that stand wholly outside the extent).
// The cut runs east to the context scene's own west edge (perth-west-region.ts), not to the extent's: the context scene's OSM cut stops at
// about x -1022 while the extension starts at x -1200, so the 178 m between them is in neither and would be a bare strip.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { unpackWaverleyScene } from '../core/waverley-data.ts';
import { buildStationOsm } from './build-waverley.ts';
import { PERTH_WEST_AREA, PERTH_WEST_BBOX, touchesRegion } from './perth-west-region.ts';

/** west,south,east,north as the map API takes them: two columns by three rows over PERTH_WEST_BBOX (suburbs: far fewer nodes a tile than the town). */
export const PERTH_WEST_TILES = (() => {
  const [S, W, N, E] = PERTH_WEST_BBOX, cols = 2, rows = 3, r4 = (v: number) => Math.round(v * 1e4) / 1e4;
  const lon = (c: number) => r4(W + (E - W) * c / cols), lat = (r: number) => r4(S + (N - S) * r / rows);
  return Array.from({ length: rows * cols }, (_, i) => { const r = Math.floor(i / cols), c = i % cols; return { name: `w${r}${c}`, bbox: [lon(c), lat(r), lon(c + 1), lat(r + 1)] }; });
})();

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
