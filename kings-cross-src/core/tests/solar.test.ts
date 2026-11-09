// core/solar.ts: where the sun is. The algorithm is NOAA's (Meeus' low-accuracy series); the reference values below are NOT from
// NOAA's calculator, which only runs in a browser, but from JPL Horizons (DE441 ephemeris, the observer at King's Cross
// 51.532 N, 0.1233 W, sea level, geometric and refracted apparent elevation), retrieved 2026-11-09. Horizons is the stricter
// reference: NOAA quotes its own series as good to about 0.01 degree and the port lands within 0.01 of Horizons at every point.
import assert from 'node:assert/strict';
import test from 'node:test';
import { julianDay, refractionDeg, solarPosition, STATION_LAT, STATION_LON, sunDirection } from '../solar.ts';

/** [instant, azimuth degrees clockwise from north, geometric elevation, Horizons' refracted elevation (null while the sun is down)] */
const HORIZONS: readonly [string, number, number, number | null][] = [
  ['2026-06-21T12:00:00Z', 178.874952, 61.901201, 61.910251], // summer noon: the year's highest sun
  ['2026-06-21T04:00:00Z', 52.207462, 1.214491, 1.556838], // summer morning, just after sunrise, in the north-east
  ['2026-12-21T11:58:00Z', 179.867319, 15.028624, 15.08979], // winter noon: the year's lowest noon sun
  ['2026-12-21T15:30:00Z', 227.023, 1.907352, 2.195639], // winter evening, 25 minutes before sunset, in the south-west
  ['2026-12-21T17:00:00Z', 244.188695, -9.61099, null], // winter evening, past civil twilight (below -6)
  ['2026-03-20T06:30:00Z', 94.396817, 3.309684, 3.524142], // equinox morning, due east
  ['2026-09-22T17:30:00Z', 265.531617, 3.675807, 3.876266], // equinox evening, due west
  ['2026-11-09T18:00:00Z', 262.189991, -15.647472, null], // the date of this work, six in the evening: well into nautical twilight
  ['2027-02-14T10:00:00Z', 145.136274, 19.141883, 19.189744], // mid February, where the equation of time is at its minimum
  ['2026-01-01T00:00:00Z', 358.158524, -61.476875, null], // midnight at the new year: the sun is below the station, in the north
  ['2024-02-29T12:00:00Z', 176.284651, 30.728202, 30.756509], // a leap day
  ['2026-05-15T19:30:00Z', 299.699978, 1.285346, 1.62144], // late evening in the north-west
];

test('the position matches JPL Horizons within 0.02 degree at twelve instants across a year', () => {
  for (const [when, azimuth, elevation] of HORIZONS) {
    const p = solarPosition(Date.parse(when));
    assert.ok(Math.abs(p.elevationDeg - elevation) < 0.02, `${when}: elevation ${p.elevationDeg.toFixed(4)} against Horizons ${elevation}`);
    assert.ok(Math.abs(p.azimuthDeg - azimuth) < 0.02, `${when}: azimuth ${p.azimuthDeg.toFixed(4)} against Horizons ${azimuth}`);
  }
});

/**
 * [instant, latitude, longitude, geometric elevation, apparent elevation, azimuth, declination, equation of time (minutes), hour angle],
 * all in degrees but the minutes. Computed by a second implementation of NOAA's Solar Calculation Details, written in Python from the
 * published column definitions with NOAA's own variable names rather than by translating core/solar.ts. It agrees with the port to 5e-11
 * at every row, so this table pins the port's transcription of every coefficient and term (Horizons, above, pins the algorithm's accuracy,
 * but only to 0.02 degree, which hides a small coefficient or a century term). The rows span 1900 to 2100, both hemispheres, and the
 * high north, because the century terms grow with the distance from 2000.
 */
const NOAA: readonly [string, number, number, number, number, number, number, number, number][] = [
  ['2026-12-21T11:58:00Z', 51.532, -0.1233, 15.0305904803, 15.0897060826, 179.8647336483, -23.4373049637, 1.9236559949, -0.1423860013], // King's Cross, December noon
  ['2026-06-21T19:30:00Z', 51.532, -0.1233, 5.6528203648, 5.798333157, 301.1934475559, 23.4373867616, -1.8922020394, 111.9036494901], // King's Cross, June evening
  ['2026-11-09T12:00:00Z', 55.9519018, -3.1904199, 17.1049354084, 17.156721051, 180.8668729602, -16.9394944313, 16.2261072322, 0.8661069081], // Waverley, November noon
  ['2026-03-20T20:15:00Z', -0.1807, -78.4678, 46.5497733444, 46.5650454426, 270.3253501495, 0.092565952, -7.3311103014, 43.4494224246], // Quito, March equinox afternoon
  ['2026-01-10T21:40:00Z', -33.8688, 151.2093, 31.6292535286, 31.655373977, 96.4907919836, -21.8498518555, -7.6799641816, -65.7106910454], // Sydney, January morning
  ['2026-06-21T22:30:00Z', 69.6492, 18.9553, 3.131279977, 3.3540227789, 356.3024456804, 23.4369324222, -1.9193520315, 175.9754619921], // Tromso, midnight sun
  ['1900-03-15T10:20:00Z', 51.532, -0.1233, 31.4259384521, 31.4522663459, 147.3792987099, -2.2272997439, -9.1452171862, -27.4096042965], // King's Cross in 1900
  ['1950-09-01T06:05:00Z', 51.532, -0.1233, 7.3029892299, 7.4203738547, 85.5361430243, 8.4849797981, -0.1889290534, -88.9205322634], // King's Cross in 1950
  ['2050-05-05T14:40:00Z', 51.532, -0.1233, 42.3561692845, 42.3738451799, 237.8244344842, 16.4220515304, 3.2881091455, 40.6987272864], // King's Cross in 2050
  ['2100-11-30T09:15:00Z', 51.532, -0.1233, 9.4023128134, 9.4956849701, 144.0973252075, -21.6671467586, 11.4927040399, -38.5001239900], // King's Cross in 2100
  ['1900-07-04T03:45:00Z', -41.2865, 174.7762, 10.803772717, 10.8856417626, 314.0728365417, 22.9371307884, -4.0096104594, 50.0237973852], // Wellington, 1900
  ['2099-01-15T12:30:00Z', 64.1466, -21.9426, 3.8537097734, 4.0477179368, 164.3305782713, -21.00393892, -9.3394996836, -16.7774749209], // Reykjavik, 2099
];

test('the port reproduces a second implementation of NOAA\'s equations to 1e-7 degree, in every field, across 1900 to 2100 and both hemispheres', () => {
  for (const [when, lat, lon, elevation, apparent, azimuth, declination, eot, hourAngle] of NOAA) {
    const p = solarPosition(Date.parse(when), lat, lon);
    const at = `${when} at ${lat}, ${lon}`;
    assert.ok(Math.abs(p.elevationDeg - elevation) < 1e-7, `${at}: elevation ${p.elevationDeg} against ${elevation}`);
    assert.ok(Math.abs(p.apparentElevationDeg - apparent) < 1e-7, `${at}: apparent elevation ${p.apparentElevationDeg} against ${apparent}`);
    assert.ok(Math.abs(p.azimuthDeg - azimuth) < 1e-7, `${at}: azimuth ${p.azimuthDeg} against ${azimuth}`);
    assert.ok(Math.abs(p.declinationDeg - declination) < 1e-7, `${at}: declination ${p.declinationDeg} against ${declination}`);
    assert.ok(Math.abs(p.equationOfTimeMin - eot) < 1e-7, `${at}: equation of time ${p.equationOfTimeMin} against ${eot}`);
    assert.ok(Math.abs(p.hourAngleDeg - hourAngle) < 1e-7, `${at}: hour angle ${p.hourAngleDeg} against ${hourAngle}`);
  }
});

/** [geometric elevation, NOAA's refraction in degrees]: the same second implementation, one row for each piece and each side of each edge. */
const REFRACTION: readonly [number, number][] = [
  [89.9, 0], [85.5, 0], [85, 0.001411956799], [84, 0.001696242999], [60, 0.009314051292], [30, 0.027852711627], [10, 0.088121519414],
  [6, 0.138666846885], [5.5, 0.148714520078], [5, 0.159618055556], [4.5, 0.173059913194], [3, 0.228683611111], [1, 0.363366944444],
  [0, 0.481944444444], [-0.3, 0.527810302528], [-0.575, 0.574931389793], [-0.8, 0.41321895459], [-2, 0.165231181442], [-10, 0.032723296099],
];

test('refraction follows NOAA\'s three pieces to the last printed digit, with its edges at 85, 5 and -0.575 degrees', () => {
  for (const [elevation, expected] of REFRACTION) {
    assert.ok(Math.abs(refractionDeg(elevation) - expected) < 1e-9, `${elevation} degrees: ${refractionDeg(elevation)} against ${expected}`);
  }
  // each edge belongs to the piece below it: 85 is still refracted, 5 itself takes the polynomial (the table row above) and just over 5 the
  // cotangent series (which is 0.00047 degree higher there), and -0.575 itself takes the tail (the polynomial would give 0.57490579)
  assert.ok(refractionDeg(85) > 0.0014 && refractionDeg(85.0001) === 0);
  assert.ok(Math.abs(refractionDeg(5.0001) - 0.160090239549) < 1e-9, `${refractionDeg(5.0001)}`);
});

test('the sun at the zenith or the nadir has an elevation of exactly 90 or -90, never NaN, however the last digit of the sine falls', () => {
  // Found by search, not by hand: at these instants the sine of the elevation rounds to 1.0000000000000002 and -1.0000000000000002, which
  // asin refuses. The clamp in solarPosition is what keeps the sun's position, and everything that is drawn from it, a number.
  const zenith = solarPosition(Date.parse('2026-02-07T12:02:00.000Z'), -15.213254679360418, 3.032200533972387);
  assert.equal(zenith.elevationDeg, 90);
  assert.equal(zenith.apparentElevationDeg, 90);
  assert.ok(Number.isFinite(zenith.azimuthDeg));
  const nadir = solarPosition(Date.parse('2026-02-07T12:02:00.000Z'), 15.213254679360418, -176.9677994660276);
  assert.equal(nadir.elevationDeg, -90);
  assert.ok(Number.isFinite(nadir.apparentElevationDeg) && Number.isFinite(nadir.azimuthDeg));
});

test('the hour angle is always in [-180, 180): the solar day wraps whatever the longitude and the hour, and a whole turn of longitude changes nothing', () => {
  for (const lon of [-179, -120, -0.1233, 0, 90, 150, 179.9]) {
    for (let hour = 0; hour < 24; hour += 1.5) {
      const p = solarPosition(Date.UTC(2026, 5, 21) + hour * 3_600_000, STATION_LAT, lon);
      assert.ok(p.hourAngleDeg >= -180 && p.hourAngleDeg < 180, `longitude ${lon} at ${hour} h UTC: hour angle ${p.hourAngleDeg}`);
    }
  }
  const t = Date.parse('2026-06-21T22:00:00Z');
  const one = solarPosition(t, STATION_LAT, 150), turn = solarPosition(t, STATION_LAT, 150 - 360);
  assert.ok(Math.abs(one.hourAngleDeg - turn.hourAngleDeg) < 1e-9 && Math.abs(one.azimuthDeg - turn.azimuthDeg) < 1e-9);
});

test('the apparent elevation adds refraction and matches Horizons\' refracted elevation where the sun is up', () => {
  for (const [when, , elevation, apparent] of HORIZONS) {
    const p = solarPosition(Date.parse(when));
    assert.ok(p.apparentElevationDeg >= p.elevationDeg, `${when}: refraction never lowers the sun`);
    if (apparent === null) continue;
    assert.ok(Math.abs(p.apparentElevationDeg - apparent) < 0.02, `${when}: apparent ${p.apparentElevationDeg.toFixed(4)} against Horizons ${apparent}`);
    assert.ok(p.apparentElevationDeg - elevation > 0, `${when}: the refracted sun is higher than the geometric one`);
  }
});

test('named cases: summer noon is high in the south, a winter evening low in the south-west, and later it is below civil twilight', () => {
  const summerNoon = solarPosition(Date.parse('2026-06-21T12:00:00Z'));
  assert.ok(summerNoon.elevationDeg > 61 && summerNoon.elevationDeg < 63, `summer noon: ${summerNoon.elevationDeg}`);
  assert.ok(Math.abs(summerNoon.azimuthDeg - 180) < 3, `summer noon is due south: ${summerNoon.azimuthDeg}`);
  assert.ok(Math.abs(summerNoon.declinationDeg - 23.44) < 0.02, `the June solstice's declination: ${summerNoon.declinationDeg}`);

  const winterEvening = solarPosition(Date.parse('2026-12-21T15:30:00Z'));
  assert.ok(winterEvening.elevationDeg > 0 && winterEvening.elevationDeg < 3, `a winter evening: ${winterEvening.elevationDeg}`);
  assert.ok(winterEvening.azimuthDeg > 215 && winterEvening.azimuthDeg < 235, `in the south-west: ${winterEvening.azimuthDeg}`);

  for (const when of ['2026-12-21T17:00:00Z', '2026-11-09T18:00:00Z', '2026-01-01T00:00:00Z']) {
    const p = solarPosition(Date.parse(when));
    assert.ok(p.elevationDeg < -6, `${when}: ${p.elevationDeg.toFixed(2)} is below civil twilight (-6)`);
  }
  // twilight comes and goes through -6 on a winter evening: at 16:20 the sun is still in civil twilight, by 16:50 it is out of it
  assert.ok(solarPosition(Date.parse('2026-12-21T16:20:00Z')).elevationDeg > -6);
  assert.ok(solarPosition(Date.parse('2026-12-21T16:50:00Z')).elevationDeg < -6);
});

test('the equation of time and the declination are the published ones at the equinox and the solstices', () => {
  // the March equinox 2026 was at 14:46 UTC, when the declination crosses zero
  assert.ok(Math.abs(solarPosition(Date.parse('2026-03-20T14:46:00Z')).declinationDeg) < 0.02);
  // the equation of time: about +16.4 min in early November and -14.2 min in mid February (Meeus, ch. 28)
  assert.ok(Math.abs(solarPosition(Date.parse('2026-11-09T12:00:00Z')).equationOfTimeMin - 16.25) < 0.3);
  assert.ok(Math.abs(solarPosition(Date.parse('2027-02-12T12:00:00Z')).equationOfTimeMin - -14.2) < 0.3);
  assert.ok(Math.abs(solarPosition(Date.parse('2026-12-21T12:00:00Z')).declinationDeg - -23.44) < 0.02);
});

test('day length at King\'s Cross is about 16.6 hours at midsummer and 7.8 at midwinter, from the apparent horizon', () => {
  const daylightHours = (day: string): number => {
    let minutes = 0;
    for (let m = 0; m < 1440; m++) if (solarPosition(Date.parse(`${day}T00:00:00Z`) + m * 60_000).elevationDeg > -0.833) minutes++;
    return minutes / 60;
  };
  assert.ok(Math.abs(daylightHours('2026-06-21') - 16.6) < 0.2, `midsummer ${daylightHours('2026-06-21')}`);
  assert.ok(Math.abs(daylightHours('2026-12-21') - 7.8) < 0.2, `midwinter ${daylightHours('2026-12-21')}`);
  const equinox = daylightHours('2026-03-20');
  assert.ok(equinox > 12 && equinox < 12.3, `near the equinox ${equinox}`);
});

test('the sun moves smoothly: no jumps through a day at the solstices, azimuth stays in range and wraps only through north', () => {
  for (const day of ['2026-06-21', '2026-12-21']) {
    let previous = solarPosition(Date.parse(`${day}T00:00:00Z`));
    for (let m = 1; m <= 1440; m++) {
      const p = solarPosition(Date.parse(`${day}T00:00:00Z`) + m * 60_000);
      assert.ok(p.azimuthDeg >= 0 && p.azimuthDeg < 360, `${day} ${m}: azimuth ${p.azimuthDeg} is in [0, 360)`);
      assert.ok(Math.abs(p.elevationDeg - previous.elevationDeg) < 0.3, `${day} ${m}: elevation jumped`);
      const turn = ((p.azimuthDeg - previous.azimuthDeg + 540) % 360) - 180; // the signed difference, through the wrap
      assert.ok(Math.abs(turn) < 1.2, `${day} ${m}: azimuth jumped by ${turn}`);
      previous = p;
    }
  }
});

test('refraction is continuous across its three pieces, falls as the sun climbs, and is nothing near the zenith', () => {
  for (const edge of [5, -0.575]) {
    assert.ok(Math.abs(refractionDeg(edge + 1e-6) - refractionDeg(edge - 1e-6)) < 0.001, `a step in the refraction at ${edge} degrees`);
  }
  assert.ok(Math.abs(refractionDeg(0) - 0.482) < 0.01, `at the horizon NOAA's polynomial gives 1735 arcseconds: ${refractionDeg(0)}`);
  let last = Infinity;
  for (let e = -0.5; e <= 85; e += 0.25) {
    const r = refractionDeg(e);
    assert.ok(r <= last + 1e-9, `refraction rose from ${last} to ${r} at ${e}`);
    last = r;
  }
  assert.equal(refractionDeg(86), 0);
  assert.ok(refractionDeg(30) > 0.025 && refractionDeg(30) < 0.031, `about 1.7 arcminutes at 30 degrees: ${refractionDeg(30)}`);
});

test('sunDirection is a unit vector in the scene frame: east is +x, up is +y, south is +z', () => {
  const near = (a: readonly number[], b: readonly number[], tol = 1e-9): void => a.forEach((v, i) => assert.ok(Math.abs(v - (b[i] as number)) < tol, `${a} vs ${b}`));
  near(sunDirection(0, 0), [0, 0, -1]); // on the horizon due north
  near(sunDirection(0, 90), [1, 0, 0]); // due east
  near(sunDirection(0, 180), [0, 0, 1]); // due south
  near(sunDirection(0, 270), [-1, 0, 0]); // due west
  near(sunDirection(90, 123), [0, 1, 0]); // overhead
  for (const [elevation, azimuth] of [[10, 33], [45, 211], [-20, 300], [62, 179]] as const) {
    const d = sunDirection(elevation, azimuth);
    assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-12);
    assert.ok(Math.abs(d[1] - Math.sin((elevation * Math.PI) / 180)) < 1e-12);
  }
  // the winter evening sun is in the south-west of the scene: west is -x, south +z, and above the horizon
  const p = solarPosition(Date.parse('2026-12-21T15:30:00Z'));
  const [x, y, z] = sunDirection(p.elevationDeg, p.azimuthDeg);
  assert.ok(x < -0.5 && z > 0.4 && y > 0 && y < 0.05, `${[x, y, z]}`);
});

test('the station constants and the Julian day are right', () => {
  assert.equal(STATION_LAT, 51.532);
  assert.equal(STATION_LON, -0.1233);
  assert.equal(julianDay(Date.UTC(2000, 0, 1, 12)), 2_451_545); // J2000.0
  assert.equal(julianDay(0), 2_440_587.5); // the Unix epoch
  // the position depends on where you stand: the same instant, 90 degrees of longitude east, is 90 degrees of hour angle later, and the
  // elevation follows from the declination and the hour angle by the spherical triangle: sin(el) = sin(lat) sin(dec) + cos(lat) cos(dec) cos(H)
  const here = solarPosition(Date.parse('2026-06-21T12:00:00Z'));
  const there = solarPosition(Date.parse('2026-06-21T12:00:00Z'), STATION_LAT, STATION_LON + 90);
  assert.ok(Math.abs(there.hourAngleDeg - here.hourAngleDeg - 90) < 1e-6);
  const rad = Math.PI / 180;
  const sinEl = Math.sin(STATION_LAT * rad) * Math.sin(there.declinationDeg * rad)
    + Math.cos(STATION_LAT * rad) * Math.cos(there.declinationDeg * rad) * Math.cos(there.hourAngleDeg * rad);
  assert.ok(Math.abs(there.elevationDeg - Math.asin(sinEl) / rad) < 1e-9, `${there.elevationDeg} vs ${Math.asin(sinEl) / rad}`);
  assert.ok(there.azimuthDeg > 270 && there.azimuthDeg < 330, `in the evening the midsummer sun is in the north-west: ${there.azimuthDeg}`);
});
