// La Ladera master plan (A5). PURE DATA: no meshes, no DOM, runs under node. See dev/CONTRACT.md 5.1.
//   generatePlan(ctx) -> { seed, bounds, heightAt, lots, streets, plazas, nav, pois, landmarks, areas, spawn, ... }
// The layout itself (street centre-lines, frontage runs, plazas) is hand authored in layout.js; this file turns it into
// street height profiles, lots on flattened pads, a 0.5 m height grid (heightAt), the walking graph, POIs and names.
import { PALETTE } from '../core/config.js';
import { clamp, lerp, ss, dist, unit, cumLen, project, fillet, resample, pointInPoly, polyDistPoint, gapBetween, footprint } from './geom.js';
import { HALF, CELL, N, makeBaseTerrain, createField } from './field.js';
import { ITEMS, ROWS } from './layout.js';
import { makeNamer } from './names.js';
import { buildNav } from './nav.js';
import { buildPlaces } from './places.js';

const round05 = (v) => Math.round(v * 20) / 20;
const GMAX = { road: 0.10, street: 0.09, alley: 0.17, path: 0.19 };
export const BAND = { road: 0.55, street: 0.5, alley: 0.4, path: 0.5, stair: 0.4 };
export const PAD_BAND = 0.6, PLAZA_BAND = 0.6;
/** Raised pavement strips inside the width of a street with `sidewalk: true` (heightAt includes them). */
export const SIDEWALK = { w: 0.9, lift: 0.12 };
const NODE_KIND = { road: 'street', street: 'street', alley: 'alley', stair: 'stair', path: 'path' };
const FLOORS_H = { chapel: 4.2, school: 3.2, hall: 3.4, workshop: 3.2, clinic: 3.0, kiosk: 2.6, cornerstore: 2.8 };

// ---------------------------------------------------------------------------------------------------- profiles
function yAtDense(d, s) {
  const { cum, y } = d, L = cum[cum.length - 1];
  s = clamp(s, 0, L);
  let lo = 1, hi = cum.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m + 1; else hi = m; }
  const seg = cum[lo] - cum[lo - 1] || 1, u = (s - cum[lo - 1]) / seg;
  return lerp(y[lo - 1], y[lo], u);
}

/** Terrain-following height profile limited to gradient g, pinned to optional end heights. */
function terrainProfile(pts, cum, T, g, yA, yB, dy = 0, flatA = 0, flatB = 0) {
  const n = pts.length, L = cum[n - 1], ds = L / (n - 1);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = T(pts[i][0], pts[i][1]) + dy;
  const pin = () => { if (yA != null) y[0] = yA; if (yB != null) y[n - 1] = yB; };
  pin();
  const R = Math.max(1, Math.round(7 / ds));
  const smooth = (passes, r) => {
    for (let p = 0; p < passes; p++) {
      const o = Float64Array.from(y);
      for (let i = 0; i < n; i++) { let s = 0; for (let k = -r; k <= r; k++) s += o[clamp(i + k, 0, n - 1)]; y[i] = s / (2 * r + 1); }
      pin();
    }
  };
  smooth(3, R);
  for (let i = 0; i < n; i++) {
    const s = cum[i];
    if (yA != null && s <= flatA) y[i] = yA;
    if (yB != null && s >= L - flatB) y[i] = yB;
    if (yA != null) y[i] = clamp(y[i], yA - g * s, yA + g * s);
    if (yB != null) y[i] = clamp(y[i], yB - g * (L - s), yB + g * (L - s));
  }
  for (let rep = 0; rep < 2; rep++) {
    for (let i = 1; i < n; i++) y[i] = clamp(y[i], y[i - 1] - g * ds, y[i - 1] + g * ds);
    pin();
    for (let i = n - 2; i >= 0; i--) y[i] = clamp(y[i], y[i + 1] - g * ds, y[i + 1] + g * ds);
    pin();
  }
  return y;
}

/** Stair profile: flights (~60 % gradient, ~0.17 rise) separated by landings; optional mandatory landing o.hold=[s0,s1]. */
function stairProfile(len, y0, y1, o = {}) {
  const dir = y1 >= y0 ? 1 : -1, R = Math.abs(y1 - y0), stepRise = o.stepRise ?? 0.17;
  if (o.hold) {
    const [h0, h1] = o.hold, Ll = h0, Lu = len - h1;
    const nAll = Math.max(2, Math.round(R / stepRise)), nLow = clamp(Math.round((nAll * Ll) / (Ll + Lu)), 1, nAll - 1);
    const yh = y0 + (dir * R * nLow) / nAll;
    const low = stairProfile(Ll, y0, yh, { ...o, hold: null }), up = stairProfile(Lu, yh, y1, { ...o, hold: null });
    const knots = low.knots.slice(); knots.push([h1, yh]);
    for (const k of up.knots.slice(1)) knots.push([k[0] + h1, k[1]]);
    const steps = low.steps + up.steps;
    return { knots, steps, rise: R * dir, tread: Math.min(low.tread, up.tread), stepRise: R / steps };
  }
  const n = Math.max(1, Math.round(R / stepRise)), r = R / n;
  let tread = o.tread ?? 0.30;
  const apr = 0.7;
  let free = len - n * tread - 2 * apr;
  if (free < 0) { tread = Math.max(0.26, (len - 2 * apr) / n); free = len - n * tread - 2 * apr; }
  if (free < 0) { free = 0; tread = Math.max(0.2, (len - 2 * apr) / n); }
  const minK = Math.floor((n - 1) / 12), maxK = Math.max(0, Math.floor(n / 4) - 1);
  const k = clamp(Math.round(free / 3.6), minK, maxK);
  const flights = []; for (let i = 0; i <= k; i++) flights.push(Math.floor(n / (k + 1)) + (i < n % (k + 1) ? 1 : 0));
  const landLen = k > 0 ? free / k : 0, extra = k > 0 ? 0 : free / 2;
  const knots = [[0, y0]]; let s = apr + extra, y = y0; knots.push([s, y]);
  flights.forEach((f, i) => {
    s += f * tread; y += dir * f * r; knots.push([s, y]);
    if (i < k) { s += landLen; knots.push([s, y]); }
  });
  s += apr + extra; knots.push([s, y1]);
  return { knots, steps: n, rise: R * dir, tread, stepRise: r };
}

/** Flights [s0,s1,y0,y1,steps] and landings [s0,s1] derived from stair knots. */
function stairInfo(knots, rStep) {
  const flights = [], landings = [];
  for (let i = 1; i < knots.length; i++) {
    const a = knots[i - 1], b = knots[i];
    if (Math.abs(b[1] - a[1]) < 1e-6) { const last = landings[landings.length - 1]; if (last && Math.abs(last[1] - a[0]) < 1e-6) last[1] = b[0]; else landings.push([a[0], b[0]]); }
    else flights.push([a[0], b[0], a[1], b[1], Math.max(1, Math.round(Math.abs(b[1] - a[1]) / rStep))].map((v) => +v.toFixed(3)));
  }
  return { flights, landings: landings.map((l) => l.map((v) => +v.toFixed(3))) };
}

// ---------------------------------------------------------------------------------------------------- generator
export function generatePlan(ctx) {
  const seed = (ctx.seed ?? 1) | 0;
  const rng = ctx.rng.fork('world:plan');
  const T = makeBaseTerrain(seed);
  const field = createField(T);
  const nameLot = makeNamer();

  // ---- streets and plazas in dependency order
  const streets = [], plazas = [], byId = new Map(), plazaById = new Map();
  const yOf = (id, x, z) => {
    if (plazaById.has(id)) return plazaById.get(id).y;
    const o = byId.get(id); if (!o) throw new Error('layout: unknown ref ' + id);
    const pr = project(o._d.pts, o._d.cum, x, z); return yAtDense(o._d, pr.s);
  };
  for (const it of ITEMS) {
    if (it.type === 'street') {
      const corners = it.corners.map((c) => [c[0], c[1]]);
      let yA = it.y0 ?? null, yB = it.y1 ?? null;
      const last = corners.length - 1;
      for (const [snap, from, idx, setY] of [[it.snap0, it.from0, 0, (v) => { yA = v; }], [it.snap1, it.from1, last, (v) => { yB = v; }]]) {
        const ref = snap ?? from; if (!ref) continue;
        if (snap) { const o = byId.get(snap); const pr = project(o._d.pts, o._d.cum, corners[idx][0], corners[idx][1]); corners[idx] = [pr.x, pr.z]; }
        setY(yOf(ref, corners[idx][0], corners[idx][1]));
      }
      const rounded = it.kind === 'stair' ? corners : fillet(corners, it.radii ?? [], 1.5);
      const { pts, cum } = resample(rounded, 1.0);
      // a street snapped onto another starts at the other street's surface where it leaves that carriageway (the road is flat across)
      let flatA = null, flatB = null;
      for (const [snap, end] of [[it.snap0, 0], [it.snap1, 1]]) {
        if (!snap) continue;
        const o = byId.get(snap), hw = o.width / 2, n = pts.length, dir = end === 0 ? 1 : -1;
        let k = end === 0 ? 0 : n - 1;
        while (k + dir > 0 && k + dir < n - 1 && project(o._d.pts, o._d.cum, pts[k][0], pts[k][1]).d < hw + 0.1) k += dir;
        const pr = project(o._d.pts, o._d.cum, pts[k][0], pts[k][1]), yy = yAtDense(o._d, pr.s), len = end === 0 ? cum[k] : cum[n - 1] - cum[k];
        if (end === 0) { yA = yy; flatA = len + 1.0; } else { yB = yy; flatB = len + 1.0; }
      }
      let y, extra = {};
      if (it.kind === 'stair') {
        if (yA == null) yA = T(pts[0][0], pts[0][1]); if (yB == null) yB = T(pts[pts.length - 1][0], pts[pts.length - 1][1]);
        const sp = stairProfile(cum[cum.length - 1], yA, yB, it);
        y = Float64Array.from(cum, (s) => { const kn = sp.knots; let i = 1; while (i < kn.length - 1 && kn[i][0] < s) i++; const a = kn[i - 1], b = kn[i]; return lerp(a[1], b[1], clamp((s - a[0]) / ((b[0] - a[0]) || 1), 0, 1)); });
        const inf = stairInfo(sp.knots, sp.stepRise);
        extra = { steps: sp.steps, rise: +sp.rise.toFixed(3), tread: +sp.tread.toFixed(3), stepRise: +sp.stepRise.toFixed(3), flights: inf.flights, landings: inf.landings, knots: sp.knots.map((k) => [+k[0].toFixed(3), +k[1].toFixed(3)]) };
      } else {
        const fl = (snap, from, ) => (snap ? byId.get(snap).width / 2 + 0.9 : from ? 1.2 : 0);
        y = terrainProfile(pts, cum, T, it.gmax ?? GMAX[it.kind] ?? 0.1, yA, yB, it.dy ?? 0, flatA ?? fl(it.snap0, it.from0), flatB ?? fl(it.snap1, it.from1));
        if (it.lin && yA != null && yB != null) { const L = cum[cum.length - 1]; for (let i = 0; i < y.length; i++) y[i] = lerp(yA, yB, cum[i] / L); }
      }
      const st = {
        id: it.id, name: it.name, en: it.en, kind: it.kind, width: it.width, surface: it.surface ?? (it.kind === 'stair' ? 'stairs' : 'concrete'),
        sidewalk: !!it.sidewalk, lamps: !!it.lamps, pts: simplify(rounded, 1.0), len: cum[cum.length - 1], ...extra,
        prof: Array.from({ length: Math.ceil(cum[cum.length - 1] / 2) + 1 }, (_, i) => { const s = Math.min(cum[cum.length - 1], i * 2); return [+s.toFixed(2), +yAtDense({ cum, y }, s).toFixed(3)]; }),
      };
      Object.defineProperty(st, '_d', { value: { pts, cum, y }, enumerable: false });
      Object.defineProperty(st, '_raw', { value: corners, enumerable: false });
      Object.defineProperty(st, '_bb', { value: [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))], enumerable: false });
      streets.push(st); byId.set(st.id, st);
    } else if (it.type === 'plaza') {
      const [cx, cz, w, d, ry = 0] = it.rect, c = Math.cos(ry), s = Math.sin(ry);
      const poly = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => [cx + x * c + z * s, cz - x * s + z * c]);
      let y;
      if (it.y != null) y = it.y;
      else if (it.yFrom) y = yOf(it.yFrom, cx, cz);
      else { let a = 0, k = 0; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { a += T(cx + i * w * 0.3, cz + j * d * 0.3); k++; } y = a / k; }
      y = round05(y + (it.dy ?? 0));
      const pl = { id: it.id, name: it.name, en: it.en, poly, y, kind: it.kind, cx, cz, w, d, ry };
      plazas.push(pl); plazaById.set(pl.id, pl);
    }
  }

  // ---- lots from the frontage rows
  const lots = [], warnings = [], placed = [];
  const palettes = PALETTE.facade;
  let lastPal = [];
  const blocked = (fp, others, rowId) => {
    for (const p of fp) if (Math.abs(p[0]) > 98.6 || Math.abs(p[1]) > 98.6) return true;
    const xs = fp.map((p) => p[0]), zs = fp.map((p) => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    for (const st of streets) {
      const m = st.width / 2 + 0.3;
      if (x1 < st._bb[0] - m || x0 > st._bb[2] + m || z1 < st._bb[1] - m || z0 > st._bb[3] + m) continue;
      for (const q of st._d.pts) if (q[0] > x0 - m && q[0] < x1 + m && q[1] > z0 - m && q[1] < z1 + m && polyDistPoint(fp, q[0], q[1]) < m) return true;
    }
    for (const pl of plazas) if (gapBetween(fp, pl.poly) < 0.3) return true;
    for (const o of others) { const g = gapBetween(fp, o.fp); if (g < 0.3 && !(o.rowId === rowId && g > -0.05)) return true; }
    return false;
  };
  for (const row of ROWS) {
    const rowId = row.id ?? row.st + ':' + (row.leg ?? 'at') + (row.side ?? '') + ':' + (row.s0 ?? 0);
    // a row stands along a street chord, or (row.at) is placed explicitly facing a plaza
    let place, s;
    if (row.at) {
      if (!plazaById.has(row.st) && !byId.has(row.st)) throw new Error('row: unknown front ' + row.st);
      const ry = row.ry ?? 0, c0 = Math.cos(ry), s0 = Math.sin(ry);
      s = -row.items[0][0] / 2;
      place = (cs) => ({ cx: row.at[0] + cs * c0, cz: row.at[1] - cs * s0, rotY: ry });
    } else {
      const st = byId.get(row.st); if (!st) throw new Error('row: unknown street ' + row.st);
      const A = st._raw[row.leg], B = st._raw[row.leg + 1];
      const t = unit(B[0] - A[0], B[1] - A[1]), right = [-t[1], t[0]];
      const cp = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[row.side];
      const n = right[0] * cp[0] + right[1] * cp[1] >= 0 ? right : [-right[0], -right[1]];
      const F = st.width / 2 + 0.6 + (row.setb ?? 0);
      s = row.s0;
      place = (cs, d) => ({ cx: A[0] + t[0] * cs + n[0] * (F + d / 2), cz: A[1] + t[1] * cs + n[1] * (F + d / 2), rotY: Math.atan2(-n[0], -n[1]) });
    }
    for (const it of row.items) {
      const [w, d, fl, kind, shop = null, o = {}] = it;
      s += o.g ?? 0;
      const i = lots.length;
      const lr = rng.fork('lot:' + i);
      const floors = Array.isArray(fl) ? lr.int(fl[0], fl[1]) : fl;
      let cs, cx, cz, rotY, fp, tries = 0;
      for (; tries < 200; tries++) {
        cs = s + w / 2; ({ cx, cz, rotY } = place(cs, d));
        fp = footprint({ x: cx, z: cz, rotY, w, d });
        if (!blocked(fp, placed, rowId)) break;
        s += 0.25;
      }
      if (tries >= 200) warnings.push(`row ${rowId}: could not place ${kind} ${w}x${d}`);
      placed.push({ fp, rowId });
      let pal; for (let tries = 0; tries < 8; tries++) { pal = lr.pick(palettes); if (!lastPal.includes(pal)) break; }
      lastPal.push(pal); if (lastPal.length > 3) lastPal.shift();
      const roofs = kind === 'unfinished' ? ['unfinished'] : kind === 'chapel' ? ['tile'] : ['terrace', 'terrace', 'corrugated', 'tile'];
      const u = o.u ?? (w >= 5.5 && kind !== 'kiosk' ? clamp(lr.range(-1, 1) * (w / 2 - 1.3), -(w / 2 - 1.3), w / 2 - 1.3) * (shop ? 0.4 : 1) : 0);
      lots.push({
        id: 'L' + String(i).padStart(2, '0'), name: o.name ?? nameLot(kind, shop, lr, i), kind, x: +cx.toFixed(3), y: 0, z: +cz.toFixed(3), rotY: +rotY.toFixed(5),
        w, d, floors, fh: FLOORS_H[kind] ?? 2.8, front: row.st,
        entrance: { side: 'front', u: +u.toFixed(2) }, party: { left: false, right: false, back: false },
        ...(shop ? { shop } : {}), roofAccess: o.roofAccess ?? (floors >= 2 && kind !== 'chapel' && lr.chance(0.75)),
        style: { palette: pal, roof: o.roof ?? lr.pick(roofs), balconies: floors >= 2 && kind !== 'chapel' ? lr.int(0, Math.min(3, floors)) : 0, notes: o.notes ?? '' },
        seed: (seed * 31 + 1000 + i * 7919) >>> 0, row: rowId,
      });
      s += w;
    }
  }

  // door positions (world) and lot elevations from the front street profile
  for (const lot of lots) {
    const c = Math.cos(lot.rotY), s = Math.sin(lot.rotY), e = lot.entrance;
    const lx = e.u, lz = lot.d / 2 + 1.2;
    const ox = lot.x + lx * c + lz * s, oz = lot.z - lx * s + lz * c;
    const pl = plazaById.get(lot.front), st = byId.get(lot.front);
    const yFront = pl ? pl.y : yAtDense(st._d, project(st._d.pts, st._d.cum, ox, oz).s);
    lot.y = round05(yFront + 0.25);
    e.outside = [+ox.toFixed(3), +(lot.y - 0.25).toFixed(3), +oz.toFixed(3)];
  }

  // ---- party walls (shared walls with a neighbour)
  const fps = lots.map((l) => footprint(l));
  const inside = (poly, x, z, g = 0.0) => pointInPoly(poly, x, z) || polyDistPoint(poly, x, z) <= g;
  lots.forEach((lot, i) => {
    const c = Math.cos(lot.rotY), s = Math.sin(lot.rotY), hw = lot.w / 2, hd = lot.d / 2;
    const W = (lx, lz) => [lot.x + lx * c + lz * s, lot.z - lx * s + lz * c];
    const sides = { left: (f) => W(-hw - 0.06, f * hd), right: (f) => W(hw + 0.06, f * hd), back: (f) => W(f * hw, -hd - 0.06) };
    for (const side of ['left', 'right', 'back']) {
      let hit = 0;
      for (const f of [-0.6, -0.2, 0.2, 0.6]) {
        const p = sides[side](f);
        if (lots.some((o, j) => j !== i && inside(fps[j], p[0], p[1], 0.03))) hit++;
      }
      lot.party[side] = hit >= 2;
    }
  });

  // ---- height grid: terrain -> lot pads -> corridors -> plazas -> stairs
  const scratchD = new Float32Array(N * N).fill(Infinity), scratchY = new Float32Array(N * N);
  const lotCells = new Map(), CELLM = 8, ckey = (a, b) => (a + 512) * 1024 + (b + 512);
  const fpLot = lots.map((lot) => ({ lot, c: Math.cos(lot.rotY), s: Math.sin(lot.rotY) }));
  for (const L of fpLot) {
    const { lot } = L, r = Math.hypot(lot.w, lot.d) / 2 + 1;
    for (let a = Math.floor((lot.x - r) / CELLM); a <= Math.floor((lot.x + r) / CELLM); a++)
      for (let b = Math.floor((lot.z - r) / CELLM); b <= Math.floor((lot.z + r) / CELLM); b++) {
        const k = ckey(a, b); let arr = lotCells.get(k); if (!arr) lotCells.set(k, arr = []); arr.push(L);
      }
  }
  for (const L of fpLot) {          // lot pads (plinth rectangle + soft band)
    const { lot } = L, hw = lot.w / 2 + 0.3, hd = lot.d / 2 + 0.3, B = 0.6, r = Math.hypot(hw, hd) + B;
    field.nodes(lot.x - r, lot.z - r, lot.x + r, lot.z + r, (i, x, z) => {
      const dx = x - lot.x, dz = z - lot.z, lx = dx * L.c - dz * L.s, lz = dx * L.s + dz * L.c;
      const d = Math.hypot(Math.max(Math.abs(lx) - hw, 0), Math.max(Math.abs(lz) - hd, 0));
      if (d < B) field.blend(i, lot.y - 0.3, d <= 0 ? 1 : 1 - ss(0, B, d));
    });
  }
  const stampCorridor = (st) => {
    const d = st._d, hw = st.width / 2, B = BAND[st.kind] ?? 0.5, touched = [];
    for (let k = 1; k < d.pts.length; k++) {
      const a = d.pts[k - 1], b = d.pts[k], vx = b[0] - a[0], vz = b[1] - a[1], l2 = vx * vx + vz * vz || 1e-12, m = hw + B;
      field.nodes(Math.min(a[0], b[0]) - m, Math.min(a[1], b[1]) - m, Math.max(a[0], b[0]) + m, Math.max(a[1], b[1]) + m, (i, x, z) => {
        let u = ((x - a[0]) * vx + (z - a[1]) * vz) / l2; u = u < 0 ? 0 : u > 1 ? 1 : u;
        const dd = Math.hypot(x - (a[0] + vx * u), z - (a[1] + vz * u));
        if (dd >= m) return;
        if (scratchD[i] === Infinity) touched.push(i);
        if (dd < scratchD[i]) { scratchD[i] = dd; scratchY[i] = lerp(d.y[k - 1], d.y[k], u); }
      });
    }
    const join = st.sidewalk ? joiners.get(st.id) : null;
    for (const i of touched) {
      const dd = scratchD[i];
      let lift = 0;
      if (join && dd > hw - SIDEWALK.w - 0.15) {
        const x = -HALF + (i % N) * CELL, z = -HALF + Math.floor(i / N) * CELL;
        if (!join.some((j) => project(j._d.pts, j._d.cum, x, z).d <= j.width / 2 + 0.5)) lift = SIDEWALK.lift * ss(hw - SIDEWALK.w - 0.12, hw - SIDEWALK.w + 0.12, dd);
      }
      field.blend(i, scratchY[i] + lift, dd <= hw ? 1 : 1 - ss(0, B, dd - hw)); scratchD[i] = Infinity;
    }
  };
  // side streets / paths that open onto a street with sidewalks: the kerb is dropped across their mouth
  const joiners = new Map();
  for (const st of streets) {
    if (!st.sidewalk) continue;
    joiners.set(st.id, streets.filter((j) => j !== st && j.kind !== 'stair' && [j._d.pts[0], j._d.pts[j._d.pts.length - 1]].some((p) => project(st._d.pts, st._d.cum, p[0], p[1]).d <= st.width / 2 + 1.3)));
  }
  const korder = { path: 0, alley: 1, street: 2, road: 3 };
  for (const st of streets.filter((s) => s.kind !== 'stair').sort((a, b) => korder[a.kind] - korder[b.kind])) stampCorridor(st);
  for (const pl of plazas) {
    const B = 0.6, xs = pl.poly.map((p) => p[0]), zs = pl.poly.map((p) => p[1]);
    field.nodes(Math.min(...xs) - B, Math.min(...zs) - B, Math.max(...xs) + B, Math.max(...zs) + B, (i, x, z) => {
      const d = pointInPoly(pl.poly, x, z) ? 0 : polyDistPoint(pl.poly, x, z);
      if (d < B) field.blend(i, pl.y, d <= 0 ? 1 : 1 - ss(0, B, d));
    });
  }
  for (const st of streets.filter((s) => s.kind === 'stair')) stampCorridor(st);

  // ---- heightAt: grid + exact plinth inside lot footprints (+0.3 m)
  const heightAt = (x, z) => {
    const arr = lotCells.get(ckey(Math.floor(x / CELLM), Math.floor(z / CELLM)));
    if (arr) {
      let best = null, bd = 1e9;
      for (const L of arr) {
        const { lot } = L, dx = x - lot.x, dz = z - lot.z, lx = dx * L.c - dz * L.s, lz = dx * L.s + dz * L.c;
        const ox = Math.abs(lx) - lot.w / 2, oz = Math.abs(lz) - lot.d / 2;
        if (ox <= 0 && oz <= 0) return lot.y - 0.3;
        if (ox <= 0.3 && oz <= 0.3) { const d = Math.max(ox, oz); if (d < bd) { bd = d; best = lot; } }
      }
      if (best) return best.y - 0.3;
    }
    return field.sample(x, z);
  };

  const plan = {
    seed, bounds: { min: -HALF, max: HALF }, heightAt, lots, streets, plazas,
    nav: { nodes: [], edges: [] }, pois: [], landmarks: [], areas: [], spawn: { x: 0, z: 0, yaw: 0 }, warnings,
  };
  Object.defineProperty(plan, '_field', { value: field, enumerable: false });
  Object.defineProperty(plan, '_byId', { value: byId, enumerable: false });
  Object.defineProperty(plan, '_T', { value: T, enumerable: false });
  Object.defineProperty(plan, '_joiners', { value: joiners, enumerable: false });
  buildNav(plan, plazaById);
  buildPlaces(plan, rng);
  plan.spawn.y = +heightAt(plan.spawn.x, plan.spawn.z).toFixed(2);
  return plan;
}

/** Keep corner points of a dense polyline: drop collinear interior points (keeps arcs). */
function simplify(pts, tol) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
    const cr = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / (Math.hypot(c[0] - a[0], c[1] - a[1]) || 1);
    if (cr > 0.02 || Math.hypot(b[0] - a[0], b[1] - a[1]) > 12) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out.map((p) => [+p[0].toFixed(2), +p[1].toFixed(2)]);
}
