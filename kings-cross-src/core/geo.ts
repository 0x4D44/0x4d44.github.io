// Local metric frame for the station. x is metres east of the origin, z is metres south
// (so north is -z, matching three.js's right-handed Y-up convention when looking down
// at a map with north up). An equirectangular projection is accurate to well under a
// metre over the few kilometres this model covers.

export interface LatLon {
  lat: number;
  lon: number;
}

export type Pt = [x: number, z: number];

// King's Cross station, roughly the centre of the platform heads.
export const ORIGIN: LatLon = { lat: 51.5308, lon: -0.1238 };

const EARTH_RADIUS_M = 6_371_008.8;
const RAD = Math.PI / 180;

export function project(lat: number, lon: number, origin: LatLon = ORIGIN): Pt {
  const x = (lon - origin.lon) * RAD * EARTH_RADIUS_M * Math.cos(origin.lat * RAD);
  const z = -(lat - origin.lat) * RAD * EARTH_RADIUS_M + 0; // + 0 turns -0 into 0
  return [x, z];
}

export function unproject(x: number, z: number, origin: LatLon = ORIGIN): LatLon {
  const lat = origin.lat - z / (RAD * EARTH_RADIUS_M);
  const lon = origin.lon + x / (RAD * EARTH_RADIUS_M * Math.cos(origin.lat * RAD));
  return { lat, lon };
}

export const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

export const round = (n: number, places = 1): number => {
  const f = 10 ** places;
  return Math.round(n * f) / f + 0;
};
