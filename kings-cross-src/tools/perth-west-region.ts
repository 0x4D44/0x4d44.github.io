// The OSM cut of the Perth west extension's blocks (tools/build-perth-west.ts) and the region its heights cover (tools/build-perth-city-heights.ts
// --west). Pure: no files, no network. The extent itself is tools/perth-west-extent.ts, never redefined here.
//
// The context scene's OSM cut (core/perth-data.ts PERTH_BBOX) stops at lon -3.455, x about -1022, while the extension's extent starts at
// x -1200 and runs west: the 178 m between them is in neither, so the cut and the region run east to the context scene's own west edge
// (blocks the context scene already holds are dropped by id, tools/build-perth-west.ts).
import { project, unproject } from '../core/geo.ts';
import type { Extent } from '../core/terrain.ts';
import { PERTH_AREA, PERTH_BBOX, PERTH_ORIGIN } from '../core/perth-data.ts';
import type { StationArea, WaverleyArea } from '../core/waverley-data.ts';
import { PERTH_WEST_EXTENT } from './perth-west-extent.ts';

const d4 = (v: number, up: boolean): number => (up ? Math.ceil(v * 1e4) : Math.floor(v * 1e4)) / 1e4;
/** South, west, north, east: the extent's own south, west and north edges (rounded outward to 1e-4 degree), then the context scene's west edge. */
export const PERTH_WEST_BBOX: [number, number, number, number] = (() => {
  const { x0, z0, z1 } = PERTH_WEST_EXTENT, sw = unproject(x0, z1, PERTH_ORIGIN), nw = unproject(x0, z0, PERTH_ORIGIN);
  return [d4(sw.lat, false), d4(sw.lon, false), d4(nw.lat, true), PERTH_BBOX[1]];
})();
export const PERTH_WEST_AREA: StationArea = { origin: PERTH_ORIGIN, bbox: PERTH_WEST_BBOX, stationName: PERTH_AREA.stationName };
/** The extension's extent widened east to the context scene's OSM cut (the 178 m strip between them): the region the west blocks are drawn in. */
export const PERTH_WEST_REGION: Extent = { ...PERTH_WEST_EXTENT, x1: Math.ceil(project(PERTH_ORIGIN.lat, PERTH_BBOX[1], PERTH_ORIGIN)[0]) };
/** Whether a block's bounding box meets the region. The map API cut is rounded outward to 1e-4 degree, so it returns a few blocks that
 *  stand wholly outside the extent (a few metres past its north edge): they have no terrain under them and are dropped. */
export function touchesRegion(b: Pick<WaverleyArea, 'outer'>, region: Extent = PERTH_WEST_REGION): boolean {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of b.outer) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  return x1 >= region.x0 && x0 <= region.x1 && z1 >= region.z0 && z0 <= region.z1;
}
