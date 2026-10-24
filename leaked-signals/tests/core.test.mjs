import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../core.mjs";
import { SITES, RADARS, BEACONS, siteById } from "../sites.mjs";
import { BROADCASTS } from "../broadcasts.mjs";

test("GMST at J2000.0 is 280.46 deg", () => assert.ok(Math.abs(C.gmstDeg(C.JD_J2000) - 280.4606) < 0.01));

test("a sidereal day is 3m56s shorter than a solar day", () => {
  const d = 1 / C.SIDEREAL_RATE * 360; // days per sidereal revolution
  assert.ok(Math.abs((1 - d) * 86400 - 235.9) < 0.5);
});

test("horizon fans only reach declinations within 90-lat of the equator (+ dip + lobe)", () => {
  const rnd = C.mulberry32(7);
  for (const lat of [0, 30, 54, 70]) {
    const site = { lat, lon: 10, h: 300 };
    let maxDec = 0;
    for (let i = 0; i < 4000; i++) {
      const fr = C.siteFrame(lat, 10, C.JD_J2000 + rnd() * 3);
      const dir = C.fanDirection(fr, rnd() * 2 * Math.PI, 0);       // e = 0: pure horizon
      maxDec = Math.max(maxDec, Math.abs(C.vec2radec(dir)[1]));
    }
    assert.ok(maxDec <= 90 - lat + 1e-6, `lat ${lat}: ${maxDec}`);
    assert.ok(maxDec >= 90 - lat - 1.0, `band edge should be reached at lat ${lat}`);
  }
});

test("analytic visibility windows agree with brute force", () => {
  const lat = 54, lon = -1, jd0 = C.jdFromUTC(2000, 1, 1);
  for (const [ra, dec] of [[100, -16.7], [200, 10], [50, 30], [10, 40], [300, -30], [0, 80]]) {
    const w = C.visibilityWindows(lat, lon, ra, dec, jd0, jd0 + 5, -0.5, 3);
    let brute = 0;
    const N = 5 * 24 * 60;
    for (let i = 0; i < N; i++) {
      const e = C.elevationOf(lat, lon, jd0 + (i + 0.5) / (24 * 60), ra, dec);
      if (e >= -0.5 && e <= 3) brute++;
    }
    const analytic = w.reduce((s, x) => s + (x.t1 - x.t0), 0) * 24 * 60;
    assert.ok(Math.abs(brute - analytic) <= 2 * (w.length + 1), `${ra},${dec}: ${brute} vs ${analytic}`);
  }
});

test("circumpolar stars never hear a horizon-only site; equatorial stars hear it twice a day", () => {
  const jd0 = C.jdFromUTC(2000, 6, 1);
  assert.equal(C.visibilityWindows(54, 0, 0, 85, jd0, jd0 + 3, -0.5, 1).length, 0);
  const w = C.visibilityWindows(54, 0, 120, 0, jd0, jd0 + 3, -0.5, 1);
  assert.ok(w.length === 6 || w.length === 5 || w.length === 7);
});

test("window start drifts 3m56s earlier each solar day", () => {
  const jd0 = C.jdFromUTC(2000, 6, 1);
  const w = C.visibilityWindows(54, 0, 120, 0, jd0, jd0 + 4, -0.5, 1);
  const rising = [];
  for (let i = 0; i < w.length; i++) if (!rising.length || w[i].t0 - rising[rising.length - 1] > 0.8) rising.push(w[i].t0);
  const d = (rising[1] - rising[0] - 1) * 86400;
  assert.ok(Math.abs(d + 235.9) < 5, `drift ${d}`);
});

test("earth heliocentric distance ~1 AU and Sun direction sane", () => {
  const p = C.earthHelio(C.jdFromUTC(2000, 3, 20, 12));
  assert.ok(Math.abs(Math.hypot(...p) - 0.996) < 0.01);
  assert.ok(p[0] < -0.9);               // near the March equinox the Sun is toward +x, so Earth is at -x
});

test("link budget: carriers reach further than pictures, bigger dishes reach further", () => {
  const eirp = 1e6;
  const [car, aud, pic] = C.TIERS;
  const fast = C.RECEIVERS.find(r => r.id === "fast").area, earth = C.RECEIVERS.find(r => r.id === "earth").area;
  assert.ok(C.rangeLy(eirp, fast, car, 300) > C.rangeLy(eirp, fast, aud, 300));
  assert.ok(C.rangeLy(eirp, fast, aud, 300) > C.rangeLy(eirp, fast, pic, 300));
  assert.ok(C.rangeLy(eirp, earth, pic, 300) > C.rangeLy(eirp, fast, pic, 300) * 1000);
  const r = C.rangeLy(eirp, earth, pic, 300);
  assert.ok(r > 0.05 && r < 1, `earth-dish picture range ${r}`);   // an Earth-wide dish decodes 1 MW TV only to a fraction of a light-year
  assert.ok(C.rangeLy(eirp, fast, pic, 300) < 1e-5);              // FAST: well under 1 AU
  assert.ok(C.rangeLy(eirp, fast, car, 300) > 0.01 && C.rangeLy(eirp, fast, car, 300) < 0.1); // ...but spots the carrier at ~2,000 AU
  assert.deepEqual(C.tiersClearedAt(eirp, r * 0.9, earth, 300), ["carrier", "audio", "picture"]);
  assert.deepEqual(C.tiersClearedAt(eirp, r * 1.1, earth, 300).includes("picture"), false);
});

test("site table is sane", () => {
  const ids = new Set();
  for (const s of [...SITES, ...RADARS]) {
    assert.ok(!ids.has(s.id), "dup " + s.id); ids.add(s.id);
    assert.ok(Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180);
    assert.ok(s.start > 1930 && s.start < 2000);
    assert.ok(s.erpMax >= s.erp0);
  }
  assert.ok(SITES.length >= 45);
  assert.ok(C.erpW(siteById["gb-london"], 1938) > 0);
  assert.equal(C.erpW(siteById["gb-london"], 1942), 0);        // BBC closed for the war
  assert.ok(C.erpW(siteById["de-berlin"], 1942) > 0);          // Berlin carried on
  assert.ok(C.erpW(siteById["gb-london"], 2015) < C.erpW(siteById["gb-london"], 2005) * 0.2); // digital: lower power
});

test("broadcasts reference real sites and were on air", () => {
  for (const b of BROADCASTS) {
    const s = siteById[b.site];
    assert.ok(s, b.id);
    const jd = C.jdFromUnixMs(Date.parse(b.start));
    assert.ok(C.erpW(s, C.yearFromJd(jd)) > 0, `${b.id} off air`);
    assert.ok(b.mins > 0 && b.mins <= 720);
  }
});

test("beacons are within the dish's reach at transit", () => {
  for (const b of BEACONS) {
    const site = typeof b.site === "string" ? siteById[b.site] : b.site;
    const jd = C.transitJd(site.lon, b.ra, C.jdFromUTC(...b.date, 12));
    const el = C.elevationOf(site.lat, site.lon, jd, b.ra, b.dec);
    assert.ok(el > 20, `${b.id} el ${el}`);
  }
});

test("retarded time: 90 ly away you see 1936 now", () => {
  const T = C.jdFromYear(2026.81);
  const te = T - 90 * C.DAYS_PER_YEAR;
  assert.ok(Math.abs(C.yearFromJd(te) - 1936.81) < 1e-9);
});
