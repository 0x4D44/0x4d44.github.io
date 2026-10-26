// Shared projection. WORLD FRAME (three.js): +X east, +Y up (metres above Ordnance Datum / sea level),
// -Z north (so +Z is south). Same constants are mirrored in tools/geo.py - keep them identical.
export const ORIGIN = { lat: 55.8600, lon: -4.2700 };
const M_PER_DEG_LAT = 111132.0;
const M_PER_DEG_LON = 111320.0 * Math.cos(ORIGIN.lat * Math.PI / 180);
export function project(lat, lon) {
  return { x: (lon - ORIGIN.lon) * M_PER_DEG_LON, z: -(lat - ORIGIN.lat) * M_PER_DEG_LAT };
}
export function unproject(x, z) {
  return { lat: ORIGIN.lat - z / M_PER_DEG_LAT, lon: ORIGIN.lon + x / M_PER_DEG_LON };
}
