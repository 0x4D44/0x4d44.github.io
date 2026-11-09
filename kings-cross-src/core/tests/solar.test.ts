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
