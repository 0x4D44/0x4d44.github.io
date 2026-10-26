// ============================================================
// leaked-signals / core.mjs — the physics of Earth's radio leakage.
// Pure functions, no DOM: shared by the page (app.mjs) and the tests.
//
// Frame: equatorial J2000 (x -> vernal equinox, z -> north celestial pole),
// units of light-years / years (so c = 1), angles in degrees at the API edge.
// Approximations are deliberate and documented where they are made.
// ============================================================

export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;
export const JD_J2000 = 2451545.0;
export const DAYS_PER_YEAR = 365.25;       // Julian year
export const AU_LY = 1 / 63241.077;
export const LY_M = 9.4607304725808e15;
export const K_B = 1.380649e-23;
export const EARTH_R_M = 6371e3;
export const SIDEREAL_RATE = 360.98564736629; // deg of GMST per solar day

// ---------- time ----------
export const jdFromUnixMs = ms => ms / 86400000 + 2440587.5;
export const unixMsFromJd = jd => (jd - 2440587.5) * 86400000;
export const jdFromYear = y => JD_J2000 + (y - 2000) * DAYS_PER_YEAR;       // Julian-year decimal
export const yearFromJd = jd => 2000 + (jd - JD_J2000) / DAYS_PER_YEAR;
export function jdFromUTC(y, mo, d, h = 0, mi = 0, s = 0) {
  const dt = new Date(Date.UTC(2000, mo - 1, d, h, mi, s));
  dt.setUTCFullYear(y);
  return jdFromUnixMs(dt.getTime());
}
export const dateFromJd = jd => new Date(unixMsFromJd(jd));
export function fmtUTC(jd, withTime = true) {
  const d = dateFromJd(jd);
  const p = n => String(n).padStart(2, "0");
  const ymd = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  return withTime ? `${ymd} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UT` : ymd;
}

const mod = (x, m) => ((x % m) + m) % m;

/** Greenwich mean sidereal time in degrees. */
export function gmstDeg(jd) {
  const t = (jd - JD_J2000) / 36525;
  return mod(280.46061837 + SIDEREAL_RATE * (jd - JD_J2000) + 0.000387933 * t * t - t * t * t / 38710000, 360);
}

/** Heliocentric position of Earth (low precision, ~0.01 deg), equatorial frame, in AU. */
export function earthHelio(jd) {
  const n = jd - JD_J2000;
  const L = 280.460 + 0.9856474 * n, g = (357.528 + 0.9856003 * n) * D2R;
  const lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D2R;
  const R = 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g);
  const eps = (23.4393 - 3.563e-7 * n) * D2R;
  // Sun's geocentric position, negated
  return [-R * Math.cos(lam), -R * Math.sin(lam) * Math.cos(eps), -R * Math.sin(lam) * Math.sin(eps)];
}

// ---------- geometry ----------
export const radec2vec = (raDeg, decDeg) => {
  const a = raDeg * D2R, d = decDeg * D2R, c = Math.cos(d);
  return [c * Math.cos(a), c * Math.sin(a), Math.sin(d)];
};
export const vec2radec = v => [mod(Math.atan2(v[1], v[0]) * R2D, 360), Math.asin(Math.max(-1, Math.min(1, v[2]))) * R2D];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Local frame of a ground site at time jd: zenith, east, north (unit vectors, equatorial). */
export function siteFrame(latDeg, lonDeg, jd) {
  const alpha = (gmstDeg(jd) + lonDeg) * D2R, phi = latDeg * D2R;
  const ca = Math.cos(alpha), sa = Math.sin(alpha), cp = Math.cos(phi), sp = Math.sin(phi);
  return { z: [cp * ca, cp * sa, sp], e: [-sa, ca, 0], n: [-sp * ca, -sp * sa, cp], ra: alpha * R2D };
}

/** Elevation (deg) of the direction (ra,dec) above a site's local horizon at jd. */
export function elevationOf(latDeg, lonDeg, jd, raDeg, decDeg) {
  const H = (gmstDeg(jd) + lonDeg - raDeg) * D2R, p = latDeg * D2R, d = decDeg * D2R;
  const s = Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H);
  return Math.asin(Math.max(-1, Math.min(1, s))) * R2D;
}

/** Horizon dip (deg) from a mast of height h metres: signals escape this far below the geometric horizon. */
export const horizonDip = hM => Math.acos(EARTH_R_M / (EARTH_R_M + hM)) * R2D;

/** Direction of a ray leaving a site at azimuth theta (from east toward north) and elevation el. */
export function fanDirection(frame, thetaRad, elDeg) {
  const e = elDeg * D2R, ce = Math.cos(e), se = Math.sin(e), ct = Math.cos(thetaRad), st = Math.sin(thetaRad);
  return [
    ce * (ct * frame.e[0] + st * frame.n[0]) + se * frame.z[0],
    ce * (ct * frame.e[1] + st * frame.n[1]) + se * frame.z[1],
    ce * (ct * frame.e[2] + st * frame.n[2]) + se * frame.z[2],
  ];
}

// ---------- the transmitter model ----------
// Vertical pattern of a broadcast mast: a lobe centred just below the horizon (typical beam tilt),
// with a -27 dB gain floor (plus 2% of rays drawn isotropically) standing for sidelobes, nulls-fill and building/ground scatter.
export const LOBE = { peakEl: -0.5, sigma: 4.0, floor: 2e-3 };
export function elevGain(elDeg, lobe = LOBE) {
  const x = (elDeg - lobe.peakEl) / lobe.sigma;
  return lobe.floor + (1 - lobe.floor) * Math.exp(-0.5 * x * x);
}

const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

/** Peak effective radiated power (watts) of a site at decimal year; 0 when off air. */
export function erpW(site, year) {
  if (year < site.start || (site.end != null && year >= site.end)) return 0;
  if (site.gaps) for (const [a, b] of site.gaps) if (year >= a && year < b) return 0;
  const f = smooth((year - site.start) / site.ramp);
  let w = site.erp0 * Math.pow(site.erpMax / site.erp0, f) * (site.kind === "radar" ? 1 : 1000);
  if (site.analogOff != null && year >= site.analogOff) w *= site.digitalFactor ?? 0.08;
  return w;
}
export const isAnalogue = (site, year) => !(site.analogOff != null && year >= site.analogOff) && site.kind !== "radar";

/** Fraction of full power on air at local mean solar hour lh (0-24) in a given year. */
export function activity(year, lh) {
  const inR = (a, b) => (a <= b ? lh >= a && lh < b : lh >= a || lh < b);
  if (year < 1950) return inR(20, 22.5) ? 1 : inR(15, 16) ? 0.4 : 0;
  if (year < 1960) return inR(18, 23.5) ? 1 : inR(11, 13) ? 0.3 : 0;
  if (year < 1985) return inR(18, 23) ? 1 : inR(9, 24) ? 0.4 : inR(0, 1) ? 0.2 : 0;
  if (year < 1995) return inR(18, 23) ? 1 : inR(6, 24) ? 0.55 : 0.2;
  return inR(18, 23) ? 1 : 0.65;
}
/** Local mean solar hour at a site for UT julian date jd. */
export const localHour = (jd, lonDeg) => mod((jd + 0.5 - Math.floor(jd + 0.5)) * 24 + lonDeg / 15, 24);

/** Effective power on air (W) at emission time jd: peak ERP x programme activity. */
export function onAirW(site, jd) {
  const y = yearFromJd(jd);
  const w = erpW(site, y);
  if (w <= 0) return 0;
  if (site.kind === "radar") return w;
  return w * activity(y, localHour(jd, site.lon));
}

// ---------- listener geometry: who can hear whom, when ----------
/**
 * Windows (in emission julian date) during which direction (ra,dec) lies within
 * [eLo,eHi] degrees of elevation at a site. Analytic: sin e = A + B cos H.
 */
export function visibilityWindows(lat, lon, raDeg, decDeg, jdStart, jdEnd, eLo, eHi) {
  const p = lat * D2R, d = decDeg * D2R;
  const A = Math.sin(p) * Math.sin(d), B = Math.cos(p) * Math.cos(d);
  const sLo = Math.sin(eLo * D2R), sHi = Math.sin(eHi * D2R);
  if (Math.abs(B) < 1e-12) return A >= sLo && A <= sHi ? [{ t0: jdStart, t1: jdEnd }] : [];
  const c1 = (sLo - A) / B, c2 = (sHi - A) / B;
  const lo = Math.max(c1, -1), hi = Math.min(c2, 1);
  if (lo > hi) return [];
  const aHi = Math.acos(hi) * R2D, aLo = Math.acos(lo) * R2D; // cosH in [lo,hi] => |H| in [aHi,aLo]
  const spans = (lo <= -1 && hi >= 1) ? [[0, 360]] : [[aHi, aLo], [360 - aLo, 360 - aHi]];
  const H0 = gmstDeg(jdStart) + lon - raDeg;
  const out = [];
  const k0 = -1, k1 = Math.ceil((jdEnd - jdStart) * SIDEREAL_RATE / 360) + 1;
  for (let k = k0; k <= k1; k++) {
    for (const [a, b] of spans) {
      // H(t) = H0 + rate*(t - jdStart); want H = a + 360k .. b + 360k
      const t0 = jdStart + (a + 360 * k - mod(H0, 360)) / SIDEREAL_RATE;
      const t1 = jdStart + (b + 360 * k - mod(H0, 360)) / SIDEREAL_RATE;
      if (t1 < jdStart || t0 > jdEnd) continue;
      out.push({ t0: Math.max(t0, jdStart), t1: Math.min(t1, jdEnd) });
    }
  }
  out.sort((x, y) => x.t0 - y.t0);
  const merged = [];
  for (const w of out) {
    const last = merged[merged.length - 1];
    if (last && w.t0 <= last.t1 + 1e-9) last.t1 = Math.max(last.t1, w.t1); else merged.push({ ...w });
  }
  return merged;
}

/** Reception of a listener at (ra,dec) from one site at emission jd: elevation, relative gain, on-air watts. */
export function receptionFrom(site, jdEmit, raDeg, decDeg) {
  const el = elevationOf(site.lat, site.lon, jdEmit, raDeg, decDeg);
  const dip = horizonDip(site.h || 300);
  if (el < -dip) return { el, gain: 0, w: 0, blocked: true };
  const g = elevGain(el);
  return { el, gain: g, w: onAirW(site, jdEmit) * g, blocked: false };
}

// ---------- receivers and link budget ----------
export const flux = (eirpW, dLy) => eirpW / (4 * Math.PI * Math.pow(dLy * LY_M, 2));      // W/m^2
export const snrLinear = (fluxWm2, areaM2, bwHz, tsysK) => fluxWm2 * areaM2 / (K_B * tsysK * bwHz);
export const TIERS = [
  { id: "carrier", name: "Carrier tone", bw: 1, snr: 10, blurb: "A faint steady tone in one 1 Hz channel: proof that something artificial is there." },
  { id: "audio", name: "Sound", bw: 2e4, snr: 10, blurb: "The sound carrier, intelligible as speech or music." },
  { id: "picture", name: "Picture", bw: 5.5e6, snr: 100, blurb: "The full vision signal, enough SNR to reassemble a watchable picture." },
];
export const RECEIVERS = [
  { id: "dish3", name: "Backyard 3 m dish", area: 4.5 },
  { id: "lovell", name: "Lovell Telescope (76 m)", area: 2.8e3 },
  { id: "arecibo", name: "Arecibo (305 m)", area: 2.76e4 },
  { id: "fast", name: "FAST (500 m)", area: 4.4e4 },
  { id: "sq1km", name: "A full square kilometre array", area: 1e6 },
  { id: "texas", name: "A dish the size of Texas", area: 6.96e11 },
  { id: "earth", name: "A dish as wide as Earth", area: 1.28e14 },
  { id: "sun", name: "A dish as wide as the Sun", area: 1.52e18 },
];
/** Range (ly) at which a source of eirp watts reaches the tier's SNR through a receiver. */
export function rangeLy(eirpW, areaM2, tier, tsysK) {
  const fluxNeeded = tier.snr * K_B * tsysK * tier.bw / areaM2;
  return Math.sqrt(eirpW / (4 * Math.PI * fluxNeeded)) / LY_M;
}
/** Which tiers a received power clears: returns array of tier ids. */
export function tiersClearedAt(eirpW, dLy, areaM2, tsysK) {
  const f = flux(eirpW, dLy);
  return TIERS.filter(t => snrLinear(f, areaM2, t.bw, tsysK) >= t.snr).map(t => t.id);
}

// ---------- deterministic randomness (so datasets are reproducible) ----------
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export function gauss(rnd) { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

/** Sample an emission elevation (deg) from the mast lobe (98%) or the isotropic-ish leak floor (2%). */
export function sampleElevation(rnd, site, dip = horizonDip(site.h || 300)) {
  if (rnd() < 0.02) {
    const lo = Math.sin(-dip * D2R);
    return Math.asin(lo + rnd() * (1 - lo)) * R2D;
  }
  for (let i = 0; i < 12; i++) {
    const e = LOBE.peakEl + Math.abs(gauss(rnd)) * LOBE.sigma * (rnd() < 0.5 ? 1 : 0.35);
    if (e >= -dip) return e;
  }
  return -dip * 0.5;
}

// ---------- radar and deliberate beams ----------
/** Ecliptic (lon,lat deg) -> equatorial unit vector. */
export function eclToVec(lonDeg, latDeg) {
  const eps = 23.4393 * D2R, l = lonDeg * D2R, b = latDeg * D2R;
  const x = Math.cos(b) * Math.cos(l), y = Math.cos(b) * Math.sin(l), z = Math.sin(b);
  return [x, y * Math.cos(eps) - z * Math.sin(eps), y * Math.sin(eps) + z * Math.cos(eps)];
}
/** Julian date near jdNear when direction (ra) transits the site meridian. */
export function transitJd(lonDeg, raDeg, jdNear) {
  const H = mod(gmstDeg(jdNear) + lonDeg - raDeg + 180, 360) - 180; // hour angle now, in (-180,180]
  return jdNear - H / SIDEREAL_RATE;
}
