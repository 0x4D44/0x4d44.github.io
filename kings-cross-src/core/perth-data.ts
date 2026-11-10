// Perth (Scotland): the station's local frame and OSM cut. The scene is built by the Waverley OSM builder (waverley-data.ts
// buildWaverleyScene) with this area: horizontal geometry is OSM (ODbL); heights are relative to footprint ground.
import type { LatLon } from './geo.ts';
import type { StationArea } from './waverley-data.ts';
/** OSM node/6960414984, the Perth station node (railway=station, ref:crs PTH): the frame's origin, x east, z south. */
export const PERTH_ORIGIN: LatLon = { lat: 56.3914751, lon: -3.4383963 };
/** South, west, north, east. ASSUMED context cut: the station and its approaches, the town centre to the North and South Inches, the Tay
 *  and Bridgend, and Kinnoull Hill's summit (about 56.3965 N, 3.3995 W) on the east edge. */
export const PERTH_BBOX: [number, number, number, number] = [56.383, -3.455, 56.403, -3.395];
export const PERTH_AREA: StationArea = { origin: PERTH_ORIGIN, bbox: PERTH_BBOX, stationName: 'Perth Railway Station' };
/** The mapped station building (OSM way/4064272, building=train_station, layer 1). */
export const PERTH_STATION_BUILDING_ID = 'way/4064272';
