// Where the sun is, for the scene clock. Pure maths, no three.js, no I/O.
//
// SOURCE. NOAA Global Monitoring Laboratory, "Solar Calculation Details" and the NOAA_Solar_Calculations worksheets
// (https://gml.noaa.gov/grad/solcalc/calcdetails.html), which condense Jean Meeus, "Astronomical Algorithms" (2nd ed.,
// 1998), ch. 7 (Julian day), 22 (obliquity), 25 (low-accuracy solar position) and 28 (equation of time). The series are
// truncated: NOAA quotes the sun's position good to about 0.01 degree for years 1800 to 2100, and core/tests/solar.test.ts holds
// this port to JPL Horizons (DE441) at twelve instants, within 0.02 degree in elevation and azimuth (it lands within 0.01).
//
// FRAME. Latitude is north-positive, longitude east-positive (King's Cross is 51.532, -0.1233). Time is an epoch in
// milliseconds, read as UTC. Delta-T (TT - UT, about 69 s) is ignored, as NOAA ignores it: it moves the sun by under 0.001 degree.
// Azimuth runs clockwise from true north, 0 to 360. `sunDirection` turns an elevation and azimuth into the scene's frame
// (core/geo.ts: x east, y up, z south).

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const mod = (x: number, m: number): number => ((x % m) + m) % m;

/** King's Cross, the point the sun and the weather are computed for. */
export const STATION_LAT = 51.532;
export const STATION_LON = -0.1233;

export interface SolarPosition {
  /** Geometric elevation of the sun's centre above the horizon, degrees (no refraction): what twilight is defined on. */
  elevationDeg: number;
  /** The same with NOAA's atmospheric refraction correction added: where the sun appears to be. */
  apparentElevationDeg: number;
  /** Degrees clockwise from true north, 0 (inclusive) to 360 (exclusive). */
  azimuthDeg: number;
  /** Solar declination, degrees. */
  declinationDeg: number;
  /** Equation of time, minutes (apparent minus mean solar time): about +16.4 in early November, -14.3 in mid February. */
  equationOfTimeMin: number;
  /** Hour angle, degrees: negative before solar noon, positive after. */
  hourAngleDeg: number;
}

/** Julian day of an epoch given in milliseconds (UTC). */
export const julianDay = (epochMs: number): number => epochMs / 86_400_000 + 2_440_587.5;

/**
 * NOAA's refraction correction to the elevation, degrees, for a geometric elevation `e` in degrees. Piecewise: a cotangent
 * series above 5 degrees, a polynomial through the horizon, and a cotangent tail below -0.575 degrees (which is a convention for
 * a continuous curve, not a physical refraction of a sun that is below the horizon).
 */
export function refractionDeg(e: number): number {
  if (e > 85) return 0;
  const t = Math.tan(e * RAD);
  let arcsec: number;
  if (e > 5) arcsec = 58.1 / t - 0.07 / t ** 3 + 0.000086 / t ** 5;
  else if (e > -0.575) arcsec = 1735 + e * (-518.2 + e * (103.4 + e * (-12.79 + e * 0.711)));
  else arcsec = -20.772 / t;
  return arcsec / 3600;
}

/** The sun's position for the instant `epochMs` (UTC milliseconds) seen from latitude `latDeg`, longitude `lonDeg` (east positive). */
export function solarPosition(epochMs: number, latDeg: number = STATION_LAT, lonDeg: number = STATION_LON): SolarPosition {
  const T = (julianDay(epochMs) - 2_451_545) / 36_525; // Julian centuries since J2000.0
  const L0 = mod(280.46646 + T * (36_000.76983 + T * 0.0003032), 360); // geometric mean longitude, degrees
  const M = 357.52911 + T * (35_999.05029 - 0.0001537 * T); // geometric mean anomaly, degrees
  const ecc = 0.016708634 - T * (0.000042037 + 0.0000001267 * T); // eccentricity of the Earth's orbit
  const Mr = M * RAD;
  // equation of the centre, then the true and the apparent (nutation and aberration corrected) longitude
  const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) + Math.sin(3 * Mr) * 0.000289;
  const omega = (125.04 - 1934.136 * T) * RAD;
  const lambda = (L0 + C - 0.00569 - 0.00478 * Math.sin(omega)) * RAD;
  // obliquity of the ecliptic, corrected for nutation
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = (eps0 + 0.00256 * Math.cos(omega)) * RAD;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  // equation of time, minutes
  const y = Math.tan(eps / 2) ** 2;
  const L0r = L0 * RAD;
  const eot = 4 * DEG * (y * Math.sin(2 * L0r) - 2 * ecc * Math.sin(Mr) + 4 * ecc * y * Math.sin(Mr) * Math.cos(2 * L0r)
    - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * ecc * ecc * Math.sin(2 * Mr));
  // true solar time (minutes into the solar day) and the hour angle
  const utcMinutes = mod(epochMs / 60_000, 1440);
  const trueSolarTime = mod(utcMinutes + eot + 4 * lonDeg, 1440);
  const hourAngle = (trueSolarTime / 4 - 180) * RAD;
  const lat = latDeg * RAD;
  const sinEl = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle);
  const elevationDeg = Math.asin(Math.max(-1, Math.min(1, sinEl))) * DEG;
  // NOAA takes the azimuth from an acos that is undefined at the zenith and the poles; atan2 on the same triangle is the same angle
  // measured from south (positive westward), and + 180 puts it clockwise from north.
  const azimuthDeg = mod(Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) * DEG + 180, 360);
  return {
    elevationDeg,
    apparentElevationDeg: elevationDeg + refractionDeg(elevationDeg),
    azimuthDeg,
    declinationDeg: decl * DEG,
    equationOfTimeMin: eot,
    hourAngleDeg: hourAngle * DEG,
  };
}

/** A unit vector toward the sun in the scene's frame (x east, y up, z south), from an elevation and a clockwise-from-north azimuth in degrees. */
export function sunDirection(elevationDeg: number, azimuthDeg: number): [number, number, number] {
  const el = elevationDeg * RAD;
  const az = azimuthDeg * RAD;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}
