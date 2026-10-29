// Centreline builder: turns an authored stage design (a list of curvature / elevation / surface
// items) into per-station arrays sampled every DS metres, plus a spatial index for nearest-point
// queries. Pure, deterministic, no DOM, no THREE.
//
// Bearings are compass degrees: 0 = -Z ("north"), 90 = +X ("east"), clockwise from above.
// curv > 0 turns right, i.e. bearing increases with s.

import { clamp, smoothstep, lerp } from "./mathx.mjs";
import { hash2 } from "./rng.mjs";

export const DS = 2;
const D2R = Math.PI / 180;

// ---------------------------------------------------------------- 1D noise
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  const a = hash2(i, 7, seed);
  const b = hash2(i + 1, 7, seed);
  return (a + (b - a) * u) * 2 - 1;
}
export function fbm1(x, seed = 0, oct = 3) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise1(x * f, seed + i * 17);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

/** Monotone cubic (PCHIP) interpolator over increasing xs. */
export function pchip(xs, ys) {
  const n = xs.length;
  if (n === 1) return () => ys[0];
  const h = new Float64Array(n - 1);
  const del = new Float64Array(n - 1);
  for (let k = 0; k < n - 1; k++) {
    h[k] = xs[k + 1] - xs[k];
    del[k] = (ys[k + 1] - ys[k]) / h[k];
  }
  const d = new Float64Array(n);
  d[0] = del[0];
  d[n - 1] = del[n - 2];
  for (let k = 1; k < n - 1; k++) {
    if (del[k - 1] * del[k] <= 0) d[k] = 0;
    else {
      const w1 = 2 * h[k] + h[k - 1];
      const w2 = h[k] + 2 * h[k - 1];
      d[k] = (w1 + w2) / (w1 / del[k - 1] + w2 / del[k]);
    }
  }
  let seg = 0;
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    while (seg > 0 && x < xs[seg]) seg--;
    while (seg < n - 2 && x > xs[seg + 1]) seg++;
    const t = (x - xs[seg]) / h[seg];
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[seg] + (t3 - 2 * t2 + t) * h[seg] * d[seg] +
      (-2 * t3 + 3 * t2) * ys[seg + 1] + (t3 - t2) * h[seg] * d[seg + 1];
  };
}

// ---------------------------------------------------------------- design vocabulary
// Items are arrays so a design reads as a list.  Geometry:
export const S = (len) => ["S", len];
export const L = (r, deg, r1) => ["L", r, deg, r1];
export const R = (r, deg, r1) => ["R", r, deg, r1];
/** turn to an absolute compass bearing (degrees) with radius r; dir "L"|"R" forces the way round. */
export const TO = (bearing, r = 60, dir) => ["TO", bearing, r, dir];
export const FILL = () => ["fill"];
export const mark = (name) => ["mark", name];
/** rows of [bearing, radius, straightAfter] expand to TO + S; any other item passes through */
export const W = (rows) => rows.map((r) => (typeof r[0] === "number" ? [["TO", r[0], r[1], r[3]], ...(r[2] ? [["S", r[2]]] : [])] : r));
// Elevation / road metadata (applies from the current s):
export const H = (y) => ["h", y];
export const SURF = (id) => ["surf", id];
export const VERGE = (id) => ["verge", id];
export const WIDTH = (w) => ["width", w];
// Features at the current s:
export const crest = (Hm = 1.0, w = 18) => ["feat", { type: "crest", H: Hm, w }];
export const jump = (Hm = 1.5, w = 13) => ["feat", { type: "jump", H: Hm, w }];
export const dip = (D = 0.8, w = 14) => ["feat", { type: "dip", D, w }];
export const ford = (len = 16, D = 0.65) => ["feat", { type: "ford", len, D }];
export const bridge = (len = 16) => ["feat", { type: "bridge", len }];
export const grid = () => ["feat", { type: "cattlegrid" }];
export const nocut = () => ["feat", { type: "nocut" }];
export const culvert = () => ["feat", { type: "culvert" }];
export const waterfall = (side, h = 30, w = 6) => ["feat", { type: "waterfall", side, h, w }];
export const hut = (side) => ["feat", { type: "hut", side }];
/** esses: n alternating arcs of radius r, angle deg each, starting with first ("L"|"R") */
export function ess(first, r, deg, n, gap = 12) {
  const out = [];
  let d = first;
  for (let i = 0; i < n; i++) {
    out.push(d === "L" ? L(r, deg) : R(r, deg));
    if (gap && i < n - 1) out.push(S(gap));
    d = d === "L" ? "R" : "L";
  }
  return out;
}
export const hairpin = (dir, r = 10) => (dir === "L" ? L(r, 180) : R(r, 180));

// ---------------------------------------------------------------- compile
function flatten(items) {
  const out = [];
  for (const it of items) {
    if (Array.isArray(it) && Array.isArray(it[0])) out.push(...flatten(it));
    else out.push(it);
  }
  return out;
}

export function compileDesign(design, seed = 1) {
  const items = flatten(design.items);
  const pieces = [];
  const feats = [];
  const keys = [];
  const surfCh = [[0, design.surf0 ?? 0]];
  const vergeCh = [[0, design.verge0 ?? 6]];
  const widthCh = [[0, design.width ?? 7]];
  let s = 0;
  let bearing = design.bearing0 ?? 0;
  let fillAt = -1;
  const marks = {};
  const arc = (sign, r0, deg, r1) => {
    const k0 = 1 / r0, k1 = 1 / (r1 || r0);
    const a = deg * D2R;
    const len = a / ((k0 + k1) / 2);
    pieces.push({ s0: s, len, k0: sign * k0, k1: sign * k1 });
    s += len;
    bearing += sign * deg;
  };
  for (const it of items) {
    switch (it[0]) {
      case "S": pieces.push({ s0: s, len: it[1], k0: 0, k1: 0 }); s += it[1]; break;
      case "L": arc(-1, it[1], it[2], it[3]); break;
      case "R": arc(1, it[1], it[2], it[3]); break;
      case "TO": {
        let delta = ((it[1] - bearing + 540) % 360) - 180;
        if (it[3] === "R" && delta < 0) delta += 360;
        if (it[3] === "L" && delta > 0) delta -= 360;
        if (Math.abs(delta) > 0.5) arc(delta > 0 ? 1 : -1, it[2], Math.abs(delta));
        break;
      }
      case "mark": marks[it[1]] = s; break;
      case "fill": fillAt = pieces.length; break;
      case "h": keys.push([s, it[1]]); break;
      case "surf": surfCh.push([s, it[1]]); break;
      case "verge": vergeCh.push([s, it[1]]); break;
      case "width": widthCh.push([s, it[1]]); break;
      case "feat": feats.push({ ...it[1], s }); break;
      default: throw new Error("unknown design item " + it[0]);
    }
  }
  if (fillAt >= 0) {
    const len = Math.max(60, (design.length ?? s) - s);
    pieces.push({ s0: s, len, k0: 0, k1: 0 });
    s += len;
  }
  const total = s;
  const N = Math.round(total / DS) + 1;
  const lengthM = (N - 1) * DS;

  // raw curvature on stations
  const kraw = new Float64Array(N);
  let pi = 0;
  for (let i = 0; i < N; i++) {
    const ss = i * DS;
    while (pi < pieces.length - 1 && ss > pieces[pi].s0 + pieces[pi].len) pi++;
    const p = pieces[pi];
    if (ss > p.s0 + p.len + 1e-9) kraw[i] = 0;
    else kraw[i] = lerp(p.k0, p.k1, p.len > 0 ? clamp((ss - p.s0) / p.len, 0, 1) : 0);
  }
  // smooth: two box passes (half width 4 stations)
  let kA = kraw;
  for (let pass = 0; pass < 2; pass++) {
    const kB = new Float64Array(N);
    const hw = 4;
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let j = -hw; j <= hw; j++) {
        const q = i + j;
        if (q >= 0 && q < N) sum += kA[q];
      }
      kB[i] = sum / (2 * hw + 1);
    }
    kA = kB;
  }

  const c = {
    N, ds: DS, lengthM,
    px: new Float32Array(N), py: new Float32Array(N), pz: new Float32Array(N),
    tx: new Float32Array(N), tz: new Float32Array(N),
    slope: new Float32Array(N), width: new Float32Array(N), curv: new Float32Array(N), bank: new Float32Array(N),
    surf: new Uint8Array(N), verge: new Uint8Array(N),
    bearing: new Float64Array(N),
    feats, design, marks,
  };
  // integrate bearing + position
  let b = (design.bearing0 ?? 0) * D2R;
  let x = design.x0 ?? 0, z = design.z0 ?? 0;
  for (let i = 0; i < N; i++) {
    c.curv[i] = kA[i];
    c.bearing[i] = b;
    c.px[i] = x; c.pz[i] = z;
    c.tx[i] = Math.sin(b); c.tz[i] = -Math.cos(b);
    if (i < N - 1) {
      const bn = b + 0.5 * (kA[i] + kA[i + 1]) * DS;
      const bm = 0.5 * (b + bn);
      x += Math.sin(bm) * DS;
      z -= Math.cos(bm) * DS;
      b = bn;
    }
  }

  // ---- elevation
  const kx = [], ky = [];
  if (!keys.length || keys[0][0] > 0) { kx.push(0); ky.push(keys.length ? keys[0][1] : 0); }
  for (const [ks, ky_] of keys) {
    if (ks <= (kx.length ? kx[kx.length - 1] : -1)) continue;
    kx.push(Math.min(ks, lengthM)); ky.push(ky_);
  }
  if (kx[kx.length - 1] < lengthM) { kx.push(lengthM); ky.push(ky[ky.length - 1]); }
  const base = pchip(kx, ky);
  const [rollA, rollL] = design.roll ?? [2.0, 150];
  const yraw = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const ss = i * DS;
    let y = base(ss) + rollA * fbm1(ss / rollL, 31, 3) * smoothstep(0, 60, ss);
    for (const f of feats) {
      const d = ss - f.s;
      if (f.type === "crest") y += f.H * Math.exp(-((d / f.w) ** 2));
      else if (f.type === "jump") y += f.H * Math.exp(-((d / f.w) ** 2));
      else if (f.type === "dip") y -= f.D * Math.exp(-((d / f.w) ** 2));
      else if (f.type === "ford") {
        const hl = f.len / 2;
        y -= f.D * (1 - smoothstep(hl * 0.8, hl * 1.5, Math.abs(d)));
      }
    }
    yraw[i] = y;
  }
  const maxStep = 0.112 * DS;
  let y = yraw[0];
  c.py[0] = y;
  for (let i = 1; i < N; i++) {
    y += clamp(yraw[i] - y, -maxStep, maxStep);
    c.py[i] = y;
  }
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - 1), bI = Math.min(N - 1, i + 1);
    c.slope[i] = (c.py[bI] - c.py[a]) / ((bI - a) * DS);
  }

  // ---- surfaces
  const fillCh = (arr, ch) => {
    let k = 0;
    for (let i = 0; i < N; i++) {
      const ss = i * DS;
      while (k < ch.length - 1 && ch[k + 1][0] <= ss + 1e-6) k++;
      arr[i] = ch[k][1];
    }
  };
  fillCh(c.surf, surfCh);
  fillCh(c.verge, vergeCh);
  for (const f of feats) {
    if (f.type === "ford") {
      for (let i = 0; i < N; i++) if (Math.abs(i * DS - f.s) <= f.len / 2) c.surf[i] = 12;
    }
  }

  // ---- width
  const wr = new Float64Array(N);
  fillCh(wr, widthCh);
  for (const f of feats) {
    if (f.type === "bridge") {
      for (let i = 0; i < N; i++) {
        const ss = i * DS;
        if (ss >= f.s - 6 && ss <= f.s + f.len + 6) wr[i] = Math.min(wr[i], 5.6);
      }
    }
  }
  let wa = wr;
  for (let pass = 0; pass < 2; pass++) {
    const wb = new Float64Array(N);
    const hw = 6;
    for (let i = 0; i < N; i++) {
      let sum = 0, cnt = 0;
      for (let j = -hw; j <= hw; j++) {
        const q = clamp(i + j, 0, N - 1);
        sum += wa[q]; cnt++;
      }
      wb[i] = sum / cnt;
    }
    wa = wb;
  }
  for (let i = 0; i < N; i++) {
    const ss = i * DS;
    let w = wa[i] + 0.22 * fbm1(ss / 40, 53, 2) + Math.min(0.7, Math.abs(c.curv[i]) * 9);
    for (const f of feats) if (f.type === "bridge" && ss >= f.s - 6 && ss <= f.s + f.len + 6) w = Math.min(w, 5.9);
    c.width[i] = clamp(w, 5.5, 8);
  }

  // ---- camber
  const gain = design.bankGain ?? 2.0, maxB = design.maxBank ?? 0.085;
  for (let i = 0; i < N; i++) c.bank[i] = clamp(c.curv[i] * gain, -maxB, maxB);
  for (const f of feats) {
    if (f.type === "bridge") {
      for (let i = 0; i < N; i++) if (i * DS >= f.s - 4 && i * DS <= f.s + f.len + 4) c.bank[i] = 0;
    }
  }

  // feature station indices
  for (const f of feats) f.i = clamp(Math.round(f.s / DS), 0, N - 1);
  return c;
}

/** Minimum distance between stations more than `minDs` metres apart along s. Returns {d, i, j}. */
export function minSelfApproach(c, minDs = 200) {
  const { N, px, pz, ds } = c;
  const gap = Math.ceil(minDs / ds);
  let best = Infinity, bi = -1, bj = -1;
  for (let i = 0; i < N; i++) {
    for (let j = i + gap; j < N; j++) {
      const dx = px[i] - px[j], dz = pz[i] - pz[j];
      const d = dx * dx + dz * dz;
      if (d < best) { best = d; bi = i; bj = j; }
    }
  }
  return { d: Math.sqrt(best), i: bi, j: bj };
}

// ---------------------------------------------------------------- spatial index
const _cellsDefault = 32;

export function createRoadIndex(c, cell = _cellsDefault, stride = 2) {
  const { N, px, pz, py, tx, tz, ds } = c;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < N; i++) {
    if (px[i] < minX) minX = px[i]; if (px[i] > maxX) maxX = px[i];
    if (pz[i] < minZ) minZ = pz[i]; if (pz[i] > maxZ) maxZ = pz[i];
  }
  const ox = minX - cell, oz = minZ - cell;
  const gx = Math.floor((maxX - minX) / cell) + 3, gz = Math.floor((maxZ - minZ) / cell) + 3;
  const counts = new Int32Array(gx * gz + 1);
  const ids = [];
  for (let i = 0; i < N; i += stride) ids.push(i);
  if (ids[ids.length - 1] !== N - 1) ids.push(N - 1);
  const cellOf = new Int32Array(ids.length);
  for (let k = 0; k < ids.length; k++) {
    const i = ids[k];
    const cx = Math.floor((px[i] - ox) / cell), cz = Math.floor((pz[i] - oz) / cell);
    const ci = cz * gx + cx;
    cellOf[k] = ci;
    counts[ci + 1]++;
  }
  for (let i = 0; i < gx * gz; i++) counts[i + 1] += counts[i];
  const fillPos = counts.slice(0, gx * gz);
  const items = new Int32Array(ids.length);
  for (let k = 0; k < ids.length; k++) items[fillPos[cellOf[k]]++] = ids[k];

  function refine(x, z, bi, out) {
    const lo = Math.max(0, bi - 3), hi = Math.min(N - 2, bi + 2);
    let best = Infinity, bs = lo, bt = 0;
    for (let i = lo; i <= hi; i++) {
      const ax = px[i], az = pz[i];
      const dx = px[i + 1] - ax, dz = pz[i + 1] - az;
      const l2 = dx * dx + dz * dz;
      let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t - x, qz = az + dz * t - z;
      const d = qx * qx + qz * qz;
      if (d < best) { best = d; bs = i; bt = t; }
    }
    return fillOut(x, z, bs, bt, out);
  }
  function fillOut(x, z, i, t, out) {
    const i1 = i + 1 < N ? i + 1 : i;
    const cx = px[i] + (px[i1] - px[i]) * t, cz = pz[i] + (pz[i1] - pz[i]) * t;
    let dx = px[i1] - px[i], dz = pz[i1] - pz[i];
    const l = Math.sqrt(dx * dx + dz * dz) || 1;
    dx /= l; dz /= l;
    const ex = x - cx, ez = z - cz;
    const lat = ex * -dz + ez * dx; // right normal (-tz, tx)
    let ttx = tx[i] + (tx[i1] - tx[i]) * t, ttz = tz[i] + (tz[i1] - tz[i]) * t;
    const tl = Math.sqrt(ttx * ttx + ttz * ttz) || 1;
    out.s = (i + t) * ds;
    out.i = i;
    out.t = t;
    out.lat = lat;
    out.dist = Math.sqrt(ex * ex + ez * ez);
    out.x = cx; out.z = cz;
    out.y = py[i] + (py[i1] - py[i]) * t;
    out.tx = ttx / tl; out.tz = ttz / tl;
    return true;
  }

  /** Grid nearest. Returns false (and leaves out.dist = Infinity) when no station is within ~cell. */
  function nearest(x, z, out) {
    const cx = Math.floor((x - ox) / cell), cz = Math.floor((z - oz) / cell);
    let best = Infinity, bi = -1;
    for (let dz = -1; dz <= 1; dz++) {
      const zz = cz + dz;
      if (zz < 0 || zz >= gz) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = cx + dx;
        if (xx < 0 || xx >= gx) continue;
        const ci = zz * gx + xx;
        for (let k = counts[ci], e = counts[ci + 1]; k < e; k++) {
          const i = items[k];
          const ex = px[i] - x, ez = pz[i] - z;
          const d = ex * ex + ez * ez;
          if (d < best) { best = d; bi = i; }
        }
      }
    }
    if (bi < 0) { out.dist = Infinity; return false; }
    return refine(x, z, bi, out);
  }

  function scanAll(x, z, out) {
    let best = Infinity, bi = 0;
    for (let i = 0; i < N; i += 4) {
      const ex = px[i] - x, ez = pz[i] - z;
      const d = ex * ex + ez * ez;
      if (d < best) { best = d; bi = i; }
    }
    return refine(x, z, bi, out);
  }

  function project(x, z, hintS, out) {
    out = out || {};
    if (hintS !== undefined && hintS !== null && hintS === hintS) {
      const h = clamp(Math.round(hintS / ds), 0, N - 1);
      const lo = Math.max(0, h - 20), hi = Math.min(N - 2, h + 20);
      let best = Infinity, bs = lo, bt = 0;
      for (let i = lo; i <= hi; i++) {
        const ax = px[i], az = pz[i];
        const dx = px[i + 1] - ax, dz = pz[i + 1] - az;
        const l2 = dx * dx + dz * dz;
        let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + dx * t - x, qz = az + dz * t - z;
        const d = qx * qx + qz * qz;
        if (d < best) { best = d; bs = i; bt = t; }
      }
      if (best < 26 * 26) return fillOut(x, z, bs, bt, out) && out;
    }
    if (!nearest(x, z, out)) scanAll(x, z, out);
    return out;
  }

  return { nearest, project, cell, bounds: { minX, maxX, minZ, maxZ } };
}
