// Builds the point cloud for the simulator: every point is one piece of an emitted wavefront.
// A point stores where Earth was (origin), which way the signal left (dir) and how old it was at the
// dataset's reference time (age0, in years == light-years travelled). The shader places it at
// origin + dir * (age0 + dT), so scrubbing time costs nothing.
import * as C from "./core.mjs";
import { ALL_SOURCES, BEACONS, siteById } from "./sites.mjs";

export const STRIDE = 10; // origin3 dir3 | age0, src, intensity, kind
export const KIND = { tv: 0, pick: 1, radar: 2, beacon: 3 };

function brightness(w) { return Math.max(0.4, Math.min(1, (Math.log10(Math.max(w, 1)) - 3.0) / 3)); }

/**
 * @param jdNow reference observer time (julian date)
 * @param windowLy only emissions younger than this are generated
 * @param opts {rings, az, seed, filter(src)->bool}
 */
export function buildField(jdNow, windowLy, opts = {}) {
  const rings = opts.rings ?? 140, az = opts.az ?? 64, seed = opts.seed ?? 1;
  const filter = opts.filter || (() => true);
  let buf = new Float32Array(STRIDE * 65536), len = 0;
  const push = (o, d, age, src, inten, kind) => {
    if (len + STRIDE > buf.length) { const nb = new Float32Array(buf.length * 2); nb.set(buf); buf = nb; }
    buf[len] = o[0]; buf[len + 1] = o[1]; buf[len + 2] = o[2]; buf[len + 3] = d[0]; buf[len + 4] = d[1]; buf[len + 5] = d[2];
    buf[len + 6] = age; buf[len + 7] = src; buf[len + 8] = inten; buf[len + 9] = kind; len += STRIDE;
  };
  const winDays = windowLy * C.DAYS_PER_YEAR;

  ALL_SOURCES.forEach((src, si) => {
    if (!filter(src)) return;
    const startJd = C.jdFromYear(src.start), endJd = src.end != null ? C.jdFromYear(src.end) : Infinity;
    const lo = Math.max(jdNow - winDays, startJd), hi = Math.min(jdNow, endJd);
    if (hi <= lo) return;
    const rnd = C.mulberry32(C.hashStr(src.id) ^ seed), dip = C.horizonDip(src.h || 300);
    if (src.kind === "radar") { radarRuns(src, si, lo, hi, jdNow, rnd, push, Math.max(8, Math.round(rings * 0.35))); return; }
    for (let k = 0; k < rings; k++) {
      const jd = lo + ((k + rnd()) / rings) * (hi - lo);
      const w = C.onAirW(src, jd);
      if (w <= 0) continue;
      const fr = C.siteFrame(src.lat, src.lon, jd);
      const eh = C.earthHelio(jd), o = [eh[0] * C.AU_LY, eh[1] * C.AU_LY, eh[2] * C.AU_LY];
      const age = (jdNow - jd) / C.DAYS_PER_YEAR, b = brightness(w);
      const off = rnd();
      if (len + az * STRIDE > buf.length) { let n2 = buf.length * 2; while (len + az * STRIDE > n2) n2 *= 2; const nb = new Float32Array(n2); nb.set(buf); buf = nb; }
      const { e, n, z } = fr;
      for (let j = 0; j < az; j++) {
        const th = ((j + off) / az) * 2 * Math.PI;
        const el = C.sampleElevation(rnd, src, dip);
        const er = el * C.D2R, ce = Math.cos(er), se = Math.sin(er), ct = Math.cos(th) * ce, st = Math.sin(th) * ce;
        buf[len] = o[0]; buf[len + 1] = o[1]; buf[len + 2] = o[2];
        buf[len + 3] = ct * e[0] + st * n[0] + se * z[0]; buf[len + 4] = ct * e[1] + st * n[1] + se * z[1]; buf[len + 5] = ct * e[2] + st * n[2] + se * z[2];
        buf[len + 6] = age; buf[len + 7] = si; buf[len + 8] = b * Math.max(0.05, Math.sqrt(C.elevGain(el))); buf[len + 9] = KIND.tv; len += STRIDE;
      }
    }
  });
  // deliberate messages
  if (opts.beacons !== false) for (const b of BEACONS) {
    const s = beaconSite(b);
    const jd = beaconJd(b, s);
    if (jd > jdNow || jd < jdNow - winDays) continue;
    const d = C.radec2vec(b.ra, b.dec), eh = C.earthHelio(jd), o = [eh[0] * C.AU_LY, eh[1] * C.AU_LY, eh[2] * C.AU_LY];
    const n = 40;
    for (let i = 0; i < n; i++) push(o, d, (jdNow - (jd + (i / n) * b.mins / 1440)) / C.DAYS_PER_YEAR, -1, 1, KIND.beacon);
  }
  return { n: len / STRIDE, data: buf.slice(0, len), jdRef: jdNow, windowLy };
}

export const beaconSite = b => (typeof b.site === "string" ? siteById[b.site] : b.site);
export function beaconJd(b, s = beaconSite(b)) { return C.transitJd(s.lon, b.ra, C.jdFromUTC(...b.date, 12)); }

function radarRuns(src, si, lo, hi, jdNow, rnd, push, nRuns) {
  const lat = src.lat;
  for (let r = 0; r < nRuns; r++) {
    let placed = false;
    for (let tries = 0; tries < 40 && !placed; tries++) {
      const lon = rnd() * 360, beta = C.gauss(rnd) * 3;
      const v = C.eclToVec(lon, beta), [ra, dec] = C.vec2radec(v);
      if (Math.abs(dec - lat) > src.maxZenith) continue;
      const day = lo + rnd() * (hi - lo);
      const jd = C.transitJd(src.lon, ra, day) + (rnd() - 0.5) * 0.08;
      if (jd < lo || jd > hi) continue;
      if (C.elevationOf(src.lat, src.lon, jd, ra, dec) < 90 - src.maxZenith) continue;
      const runDays = (src.runH[0] + rnd() * (src.runH[1] - src.runH[0])) / 24;
      const eh = C.earthHelio(jd), o = [eh[0] * C.AU_LY, eh[1] * C.AU_LY, eh[2] * C.AU_LY];
      const n = 36;
      for (let i = 0; i < n; i++) {
        const t = jd + (i / n) * runDays;
        if (t > jdNow) break;
        push(o, v, (jdNow - t) / C.DAYS_PER_YEAR, si, 1, KIND.radar);
      }
      placed = true;
    }
  }
}

/** The wavefront of one broadcast: dense rings, one per couple of minutes of airtime. */
export function buildBroadcast(b, jdNow, az = 220) {
  const src = siteById[b.site];
  const t0 = C.jdFromUnixMs(Date.parse(b.start)), t1 = t0 + b.mins / 1440;
  const rnd = C.mulberry32(C.hashStr(b.id));
  const n = Math.max(6, Math.min(165, Math.round(b.mins / 2)));
  const out = [];
  for (let k = 0; k < n; k++) {
    const jd = t0 + ((k + 0.5) / n) * (t1 - t0);
    const fr = C.siteFrame(src.lat, src.lon, jd), eh = C.earthHelio(jd);
    const o = [eh[0] * C.AU_LY, eh[1] * C.AU_LY, eh[2] * C.AU_LY], age = (jdNow - jd) / C.DAYS_PER_YEAR;
    for (let j = 0; j < az; j++) {
      const th = ((j + rnd()) / az) * 2 * Math.PI;
      const el = C.sampleElevation(rnd, src), d = C.fanDirection(fr, th, el);
      // y = -2 - fraction of the broadcast elapsed (gl.mjs ramps blue -> magenta); weight follows the mast pattern
      out.push(o[0], o[1], o[2], d[0], d[1], d[2], age, -2 - k / (n - 1), Math.max(0.05, Math.sqrt(C.elevGain(el))), KIND.pick);
    }
  }
  return { n: out.length / STRIDE, data: new Float32Array(out), jdRef: jdNow, t0, t1 };
}

/** Which catalogued stars lie in the fan of a broadcast (elevation window), with arrival dates. */
export function broadcastListeners(b, stars, eHi = 3) {
  const src = siteById[b.site];
  const t0 = C.jdFromUnixMs(Date.parse(b.start)), t1 = t0 + b.mins / 1440;
  const dip = C.horizonDip(src.h || 300);
  const hits = [];
  for (let i = 0; i < stars.n; i++) {
    // stars' direction is fixed; check if elevation is in [-dip, eHi] at any time in [t0,t1]
    const w = C.visibilityWindows(src.lat, src.lon, stars.ra[i], stars.dec[i], t0, t1, -dip, eHi);
    if (w.length) {
      const el0 = C.elevationOf(src.lat, src.lon, (w[0].t0 + w[0].t1) / 2, stars.ra[i], stars.dec[i]);
      hits.push({ i, ly: stars.ly[i], arrive: t0 + stars.ly[i] * C.DAYS_PER_YEAR, secs: w.reduce((s, x) => s + (x.t1 - x.t0), 0) * 86400, el: el0 });
    }
  }
  hits.sort((a, b) => a.ly - b.ly);
  return hits;
}
