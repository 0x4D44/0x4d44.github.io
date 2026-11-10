// node tools/build-perth.ts --raw-dir ../.scratch/perth/osm
// Six bounded public OSM map requests (each under the API's 50,000-node limit); the raw tiles stay local, only the packed scene is committed.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildStationOsm } from './build-waverley.ts';
import { PERTH_AREA } from '../core/perth-data.ts';
const [S, W, N, E] = PERTH_AREA.bbox, MID = (S + N) / 2;
const COLS = [W, W + (E - W) / 3, W + 2 * (E - W) / 3, E].map(v => Math.round(v * 1e4) / 1e4);
/** west,south,east,north as the map API takes them: three columns by two rows over PERTH_BBOX. */
export const PERTH_TILES = ([[S, MID, 's'], [MID, N, 'n']] as const).flatMap(([lo, hi, row]) =>
  [0, 1, 2].map(c => ({ name: `${row}${c}`, bbox: [COLS[c]!, lo, COLS[c + 1]!, hi] })));
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), flag = (key: string) => args[args.indexOf(key) + 1];
  await buildStationOsm({ tiles: PERTH_TILES, site: PERTH_AREA, agent: 'almanac-perth-build/0.1',
    rawDir: args.includes('--raw-dir') ? flag('--raw-dir')! : '../.scratch/perth/osm',
    out: args.includes('--out') ? flag('--out')! : 'web/src/data/perth-scene.json' });
}
