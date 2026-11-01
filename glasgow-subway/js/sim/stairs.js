// Platform-end stairs for the A3 halls (models/station_<id>.glb).
// A hall GLB only carries an `exit_marker_*` empty at each platform end (it used to be drawn as a green disc). This module turns each marker into a
// real flight of steps that climbs through a stairwell opening in the ceiling:
//   * cutStairHoles()  once per loaded template - measures the soffit over each marker, cuts the stairwell opening out of the ceiling shell (the ceiling is a
//                      handful of big quads, so triangles are clipped against the opening and the pieces keep their uv/normals) and removes the light
//                      fixtures that sat in it. Records the stair specs on tpl.userData.stairs.
//   * buildStairs()    per station view - treads, risers, tiled side walls, handrails, landing and exit door. Everything is built in HALL-NATIVE coordinates
//                      (x across the hall, z along it, y above rail head) so the caller can parent it exactly like the hall clone.
import { ceilingAtHallX } from './hall.js';
import { GeoBuilder } from './gfx.js';

export const STAIR = {
  half: 0.72,      // half the outer width (walls included); the clear width between the walls is 2 * clear
  clear: 0.60,
  foot: 20.15,     // |z| of the bottom riser: just beyond the exit marker's old spot, 2.35 m before the platform end
  back: 26.9,      // |z| of the landing's back wall (the hall's end wall is at 27)
  land: 1.0,       // shortest landing
  riser: 0.175, going: 0.27,
  floor: -0.25,    // walls and the solid under the steps go down to here
  shaft: 2.5,      // headroom of the landing above its floor
  parapet: 1.1,    // wall height above the nosing line before the stair enters the ceiling opening
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Stair geometry for one marker {x, z} of a hall (hall frame). ceilMin/ceilMax: lowest / highest soffit over the stair's width. u = metres along the flight from the foot. */
export function stairSpec(info, mk, ceilMin, ceilMax) {
  const S = STAIR, PY = info && info.platformTopY != null ? info.platformTopY : 0.695, d = mk.z >= 0 ? 1 : -1;
  const yTop = ceilMax + 0.25, N = Math.max(8, Math.round((yTop - PY) / S.riser)), R = (yTop - PY) / N;
  const run = S.back - S.foot, G = clamp((run - S.land) / N, 0.22, S.going);
  const uT = N * G, uE = (N - 0.5) * G;                                   // front of the landing / where the walking line reaches landing level
  const uN = clamp(((ceilMin - 2.0) - PY - R / 2) * G / R, 0.3, uE - 0.6);   // where 2.0 m of headroom is left: the ceiling opening starts here
  return { x: mk.x, d, PY, ceilMin, ceilMax, N, R, G, yTop, uT, uE, uN, U: run, H: yTop + S.shaft };
}
/** hall-frame z at distance u along the flight */
export const stairZ = (sp, u) => sp.d * (STAIR.foot + u);
/** the walking line (through the middle of every tread) */
export const yLine = (sp, u) => (u >= sp.uE ? sp.yTop : sp.PY + sp.R / 2 + sp.R * u / sp.G);
/** the opening cut in the ceiling (hall frame) */
export function holeRect(sp) { const za = stairZ(sp, sp.uN), zb = sp.d * 27.05; return { x0: sp.x - STAIR.half, x1: sp.x + STAIR.half, z0: Math.min(za, zb), z1: Math.max(za, zb) }; }

// ------------------------------------------------------------------------------------------------------------------------------------ template surgery
function toWorld(pos, e, vi) {
  const x = pos.getX(vi), y = pos.getY(vi), z = pos.getZ(vi);
  return [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]];
}

/** Lowest / highest ceiling surface above y = 2.4 over [x0, x1] at depth z, or null when nothing is there. */
function soffitRange(tpl, x0, x1, z) {
  tpl.updateMatrixWorld(true);
  const root = tpl.getObjectByName('hall_shell') || tpl, xs = [0, 1, 2, 3, 4].map((i) => x0 + (x1 - x0) * i / 4), best = xs.map(() => Infinity);
  root.traverse((m) => {
    if (!m.isMesh || !m.geometry || !m.geometry.attributes.position) return;
    const pos = m.geometry.attributes.position, idx = m.geometry.index, e = m.matrixWorld.elements, nT = idx ? idx.count / 3 : pos.count / 3;
    for (let t = 0; t < nT; t++) {
      const a = toWorld(pos, e, idx ? idx.getX(t * 3) : t * 3), b = toWorld(pos, e, idx ? idx.getX(t * 3 + 1) : t * 3 + 1), c = toWorld(pos, e, idx ? idx.getX(t * 3 + 2) : t * 3 + 2);
      if (Math.min(a[1], b[1], c[1]) < 2.4) continue;
      const zlo = Math.min(a[2], b[2], c[2]), zhi = Math.max(a[2], b[2], c[2]); if (z < zlo || z > zhi) continue;
      const det = (b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2]); if (Math.abs(det) < 1e-9) continue;     // vertical in plan: a wall, not a ceiling
      for (let i = 0; i < xs.length; i++) {
        const px = xs[i] - a[0], pz = z - a[2];
        const s = (px * (c[2] - a[2]) - (c[0] - a[0]) * pz) / det, u = ((b[0] - a[0]) * pz - px * (b[2] - a[2])) / det;
        if (s < -1e-6 || u < -1e-6 || s + u > 1 + 1e-6) continue;
        best[i] = Math.min(best[i], a[1] + s * (b[1] - a[1]) + u * (c[1] - a[1]));
      }
    }
  });
  const hit = best.filter(Number.isFinite);
  return hit.length ? [Math.min(...hit), Math.max(...hit)] : null;
}

// Sutherland-Hodgman on barycentric polygons: keep the part where fn(p) >= 0.
function clipPoly(poly, fn) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i], Q = poly[(i + 1) % poly.length], fp = fn(P), fq = fn(Q);
    if (fp >= 0) out.push(P);
    if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t, P[2] + (Q[2] - P[2]) * t]); }
  }
  return out;
}

/** Cuts the rectangles (hall frame, plan view) out of every ceiling-like triangle (above minY and not near-vertical) of the mesh. Returns the number of triangles cut. */
function clipCeiling(THREE, m, rects, minY = 2.4) {
  const g = m.geometry, pos = g && g.attributes.position; if (!pos) return 0;
  const idx = g.index, nT = idx ? idx.count / 3 : pos.count / 3, e = m.matrixWorld.elements;
  const names = Object.keys(g.attributes), at = names.map((n) => g.attributes[n]), extra = at.map(() => []), base = pos.count, out = [];
  let added = 0, cut = 0;
  for (let t = 0; t < nT; t++) {
    const ia = idx ? idx.getX(t * 3) : t * 3, ib = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, ic = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    const A = toWorld(pos, e, ia), B = toWorld(pos, e, ib), C = toWorld(pos, e, ic);
    if (Math.min(A[1], B[1], C[1]) < minY) { out.push(ia, ib, ic); continue; }
    const xmin = Math.min(A[0], B[0], C[0]), xmax = Math.max(A[0], B[0], C[0]), zmin = Math.min(A[2], B[2], C[2]), zmax = Math.max(A[2], B[2], C[2]);
    if (!rects.some((r) => xmax > r.x0 && xmin < r.x1 && zmax > r.z0 && zmin < r.z1)) { out.push(ia, ib, ic); continue; }
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1) < 0.2) { out.push(ia, ib, ic); continue; }       // a wall, not a ceiling
    const X = (p) => p[0] * A[0] + p[1] * B[0] + p[2] * C[0], Z = (p) => p[0] * A[2] + p[1] * B[2] + p[2] * C[2];
    const area = (poly) => { let s = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; s += X(p) * Z(q) - X(q) * Z(p); } return Math.abs(s) / 2; };
    let polys = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]]], touched = false;
    for (const r of rects) {
      const next = [];
      for (const poly of polys) {
        const band = clipPoly(clipPoly(poly, (p) => X(p) - r.x0), (p) => r.x1 - X(p));
        const inner = clipPoly(clipPoly(band, (p) => Z(p) - r.z0), (p) => r.z1 - Z(p));
        if (inner.length < 3 || area(inner) < 1e-7) { next.push(poly); continue; }
        touched = true;       // what is left of the triangle is the part outside the rectangle: left of it, right of it, and the strips before / after it
        next.push(clipPoly(poly, (p) => r.x0 - X(p)), clipPoly(poly, (p) => X(p) - r.x1), clipPoly(band, (p) => r.z0 - Z(p)), clipPoly(band, (p) => Z(p) - r.z1));
      }
      polys = next.filter((pl) => pl.length >= 3 && area(pl) >= 1e-7);
    }
    if (!touched) { out.push(ia, ib, ic); continue; }
    cut++;
    for (const poly of polys) {
      const first = base + added;
      for (const p of poly) {
        for (let k = 0; k < at.length; k++) { const a = at[k], s = a.itemSize, ex = extra[k]; for (let c = 0; c < s; c++) { const get = c === 0 ? 'getX' : c === 1 ? 'getY' : c === 2 ? 'getZ' : 'getW'; ex.push(p[0] * a[get](ia) + p[1] * a[get](ib) + p[2] * a[get](ic)); } }
        added++;
      }
      for (let i = 1; i < poly.length - 1; i++) out.push(first, first + i, first + i + 1);
    }
  }
  if (!cut) return 0;
  const total = base + added;
  names.forEach((n, k) => {
    const a = at[k], s = a.itemSize, arr = new Float32Array(total * s);
    for (let v = 0; v < base; v++) for (let c = 0; c < s; c++) arr[v * s + c] = a[c === 0 ? 'getX' : c === 1 ? 'getY' : c === 2 ? 'getZ' : 'getW'](v);
    arr.set(extra[k], base * s);
    g.setAttribute(n, new THREE.BufferAttribute(arr, s));
  });
  g.setIndex(new THREE.BufferAttribute(total > 65535 ? new Uint32Array(out) : new Uint16Array(out), 1));
  g.computeBoundingBox(); g.computeBoundingSphere(); g.dispose();
  return cut;
}

/** Removes whole light fixtures (triangle groups that share vertices) whose plan footprint touches one of the rectangles. Returns the number of triangles removed. */
function dropFixtures(THREE, m, rects, pad = 0.12, minY = 2.4) {
  const g = m.geometry, pos = g && g.attributes.position, idx = g && g.index; if (!pos || !idx) return 0;
  const nT = idx.count / 3, e = m.matrixWorld.elements, par = Array.from({ length: nT }, (_, i) => i), seen = new Map();
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const bb = [];       // per triangle: world bbox
  for (let t = 0; t < nT; t++) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, z0 = 1e9, z1 = -1e9;
    for (let k = 0; k < 3; k++) {
      const w = toWorld(pos, e, idx.getX(t * 3 + k)), key = Math.round(w[0] * 500) + ',' + Math.round(w[1] * 500) + ',' + Math.round(w[2] * 500);
      x0 = Math.min(x0, w[0]); x1 = Math.max(x1, w[0]); y0 = Math.min(y0, w[1]); z0 = Math.min(z0, w[2]); z1 = Math.max(z1, w[2]);
      if (seen.has(key)) par[find(t)] = find(seen.get(key)); else seen.set(key, t);
    }
    bb.push([x0, x1, y0, z0, z1]);
  }
  const comp = new Map();
  for (let t = 0; t < nT; t++) { const r = find(t), c = comp.get(r) || [1e9, -1e9, 1e9, 1e9, -1e9]; c[0] = Math.min(c[0], bb[t][0]); c[1] = Math.max(c[1], bb[t][1]); c[2] = Math.min(c[2], bb[t][2]); c[3] = Math.min(c[3], bb[t][3]); c[4] = Math.max(c[4], bb[t][4]); comp.set(r, c); }
  const kill = new Set();
  for (const [r, c] of comp) if (c[2] >= minY && rects.some((q) => c[1] > q.x0 - pad && c[0] < q.x1 + pad && c[4] > q.z0 - pad && c[3] < q.z1 + pad)) kill.add(r);
  if (!kill.size) return 0;
  const keep = []; let dropped = 0;
  for (let t = 0; t < nT; t++) { if (kill.has(find(t))) { dropped++; continue; } keep.push(idx.getX(t * 3), idx.getX(t * 3 + 1), idx.getX(t * 3 + 2)); }
  g.setIndex(new THREE.BufferAttribute(pos.count > 65535 ? new Uint32Array(keep) : new Uint16Array(keep), 1));
  return dropped;
}

/**
 * Cuts a stairwell opening in the ceiling over every exit marker of a loaded hall template (once) and returns the stair specs (hall frame).
 * Also removes the ceiling light fixtures that sat inside the opening.
 */
export function cutStairHoles(THREE, tpl, info) {
  if (!tpl || !info) return [];
  if (tpl.userData.stairsTried) return tpl.userData.stairs || [];
  tpl.userData.stairsTried = true;
  tpl.updateMatrixWorld(true);
  const marks = []; tpl.traverse((n) => { if (/^exit_marker/.test(n.name)) { const v = new THREE.Vector3(); n.getWorldPosition(v); marks.push({ x: v.x, z: v.z }); } });
  const specs = marks.map((mk) => {
    const d = mk.z >= 0 ? 1 : -1;
    let r = soffitRange(tpl, mk.x - STAIR.half, mk.x + STAIR.half, d * 24.5);
    if (!r) { const h = [mk.x - STAIR.half, mk.x, mk.x + STAIR.half].map((x) => ceilingAtHallX(info, x)); r = [Math.min(...h), Math.max(...h)]; }
    return stairSpec(info, mk, r[0], r[1]);
  });
  const rects = specs.map(holeRect); let cut = 0, dropped = 0;
  tpl.traverse((m) => {
    if (!m.isMesh) return;
    let lamp = false; for (let p = m; p && p !== tpl; p = p.parent) if (/^hall_lights/.test(p.name)) lamp = true;
    if (lamp) dropped += dropFixtures(THREE, m, rects); else cut += clipCeiling(THREE, m, rects);
  });
  tpl.userData.stairCut = { cut, dropped };
  tpl.userData.stairs = specs;           // only set once every cut went through: the station view falls back to the old marker when this is missing
  return specs;
}

// ------------------------------------------------------------------------------------------------------------------------------------ the flight itself
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/** a flat 4-point face with wanted normal n; uv(p) -> [u, v]; the winding is chosen to match n */
function face(B, P, n, uv, col = [1, 1, 1]) {
  const [a, b, c, d] = P, ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  const loop = (cx * n[0] + cy * n[1] + cz * n[2]) >= 0 ? [a, b, c, d] : [a, d, c, b];
  const ids = loop.map((p) => { const t = uv(p); return B.vert(p[0], p[1], p[2], n[0], n[1], n[2], t[0], t[1], col[0], col[1], col[2]); });
  B.tri(ids[0], ids[1], ids[2]); B.tri(ids[0], ids[2], ids[3]);
}
/** square-section bar between two points (axis in the y-z plane), side = x extent */
function bar(B, p0, p1, side, thick, col) {
  const t = norm3([0, p1[1] - p0[1], p1[2] - p0[2]]); let up = [0, -t[2], t[1]]; if (up[1] < 0) up = [0, -up[1], -up[2]];
  const hs = side / 2, ht = thick / 2, c = (p, sx, su) => [p[0] + sx * hs, p[1] + su * ht * up[1], p[2] + su * ht * up[2]];
  const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, su]) => [c(p0, sx, su), c(p1, sx, su)]);
  const uv = () => [0, 0];
  for (let i = 0; i < 4; i++) {
    const a = P[i], b = P[(i + 1) % 4], nx = (i === 0 ? 0 : i === 2 ? 0 : (i === 1 ? 1 : -1)), nu = (i === 0 ? -1 : i === 2 ? 1 : 0);
    face(B, [a[0], a[1], b[1], b[0]], norm3([nx, nu * up[1], nu * up[2]]), uv, col);
  }
}

/**
 * Builds one flight (hall frame). mats: { dado, wall } = the hall's own tile materials (cloned by the caller if it wants to own them);
 * Returns { group, zones, obstacles, lights, portal } - rectangles in the hall frame ({x0,x1,z0,z1} sorted) for the caller to map into its own frame.
 */
export function buildStairs(THREE, sp, mats, opts = {}) {
  const S = STAIR, { d, x, PY, N, R, G, yTop, uT, uE, uN, U, H } = sp, B0 = S.floor;
  const xl = x - S.clear, xr = x + S.clear, Z = (u) => stairZ(sp, u), TOP = (u) => (u <= uN ? yLine(sp, u) + S.parapet : H);
  const treads = new GeoBuilder(), trim = new GeoBuilder(), steel = new GeoBuilder(), dado = new GeoBuilder(), wall = new GeoBuilder(), glow = new GeoBuilder();
  const cTread = [0.52, 0.52, 0.54], cRiser = [0.34, 0.34, 0.37], cNose = [0.96, 0.78, 0.12], cCap = [0.78, 0.76, 0.7], cSteel = [0.62, 0.65, 0.7];
  const tileUV = (p) => [Math.abs(p[2]), p[1]];
  // ---- steps
  for (let k = 0; k < N; k++) {
    const yb = PY + k * R, yt = PY + (k + 1) * R, u0 = k * G, u1 = (k + 1) * G;
    face(treads, [[xl, yb, Z(u0)], [xr, yb, Z(u0)], [xr, yt, Z(u0)], [xl, yt, Z(u0)]], [0, 0, -d], () => [0, 0], cRiser);
    face(treads, [[xl, yt, Z(u0)], [xr, yt, Z(u0)], [xr, yt, Z(u1)], [xl, yt, Z(u1)]], [0, 1, 0], () => [0, 0], cTread);
    face(treads, [[xl, yt + 0.002, Z(u0)], [xr, yt + 0.002, Z(u0)], [xr, yt + 0.002, Z(u0 + 0.06)], [xl, yt + 0.002, Z(u0 + 0.06)]], [0, 1, 0], () => [0, 0], cNose);
  }
  face(treads, [[xl, yTop, Z(uT)], [xr, yTop, Z(uT)], [xr, yTop, Z(U)], [xl, yTop, Z(U)]], [0, 1, 0], () => [0, 0], cTread);          // landing
  // yellow warning band across the foot (on the platform deck)
  face(trim, [[x - S.half - 0.1, PY + 0.02, Z(-0.55)], [x + S.half + 0.1, PY + 0.02, Z(-0.55)], [x + S.half + 0.1, PY + 0.02, Z(-0.05)], [x - S.half - 0.1, PY + 0.02, Z(-0.05)]], [0, 1, 0], () => [0, 0], cNose);
  // ---- side walls (inner and outer faces, dado band + upper tiles), coping, end caps
  const uB = Math.max(0, Math.min(uN, ((PY + 1.3) - S.parapet - PY - R / 2) * G / R));       // where the parapet climbs above the outer dado band
  const seg = (Bd, xw, nrm, u0, u1, lo0, lo1, hi0, hi1) => face(Bd, [[xw, lo0, Z(u0)], [xw, lo1, Z(u1)], [xw, hi1, Z(u1)], [xw, hi0, Z(u0)]], nrm, tileUV);
  for (const s of [-1, 1]) {
    const xi = x + s * S.clear, xo = x + s * S.half, ni = [-s, 0, 0], no = [s, 0, 0];
    // inner face
    seg(dado, xi, ni, 0, uN, yLine(sp, 0) - 0.25, yLine(sp, uN) - 0.25, yLine(sp, 0) + S.parapet, yLine(sp, uN) + S.parapet);
    seg(dado, xi, ni, uN, uE, yLine(sp, uN) - 0.25, yTop - 0.25, yLine(sp, uN) + 1.2, yTop + 1.2);
    seg(wall, xi, ni, uN, uE, yLine(sp, uN) + 1.2, yTop + 1.2, H, H);
    seg(dado, xi, ni, uE, U, yTop - 0.25, yTop - 0.25, yTop + 1.2, yTop + 1.2);
    seg(wall, xi, ni, uE, U, yTop + 1.2, yTop + 1.2, H, H);
    // outer face
    seg(dado, xo, no, 0, uB, B0, B0, yLine(sp, 0) + S.parapet, yLine(sp, uB) + S.parapet);
    seg(dado, xo, no, uB, U, B0, B0, PY + 1.3, PY + 1.3);
    seg(wall, xo, no, uB, uN, PY + 1.3, PY + 1.3, yLine(sp, uB) + S.parapet, yLine(sp, uN) + S.parapet);
    seg(wall, xo, no, uN, U, PY + 1.3, PY + 1.3, H, H);
    // coping on the parapet, the foot end cap and the step up to the full-height wall
    const topN = norm3([0, G, -d * R]), y0 = yLine(sp, 0) + S.parapet, y1 = yLine(sp, uN) + S.parapet;
    face(trim, [[xi, y0, Z(0)], [xo, y0, Z(0)], [xo, y1, Z(uN)], [xi, y1, Z(uN)]], topN, () => [0, 0], cCap);
    face(wall, [[xi, B0, Z(0)], [xo, B0, Z(0)], [xo, y0, Z(0)], [xi, y0, Z(0)]], [0, 0, -d], tileUV);
    face(wall, [[xi, y1, Z(uN)], [xo, y1, Z(uN)], [xo, H, Z(uN)], [xi, H, Z(uN)]], [0, 0, -d], tileUV);
    // handrail with brackets
    const xrl = x + s * (S.clear - 0.055), r0 = [xrl, yLine(sp, 0) + 0.92, Z(0)], r1 = [xrl, yTop + 0.92, Z(uE)], r2 = [xrl, yTop + 0.92, Z(U - 0.15)];
    bar(steel, r0, r1, 0.045, 0.045, cSteel); bar(steel, r1, r2, 0.045, 0.045, cSteel);
    for (const u of [0.15, uE * 0.34, uE * 0.67, uE - 0.1, (uE + U) / 2]) { const yy = yLine(sp, u) + 0.92; steel.box(Math.min(xi, xrl) - 0.0, yy - 0.12, Z(u) - 0.02, Math.max(xi, xrl), yy, Z(u) + 0.02, cSteel, 1); }
  }
  // ---- shaft above the ceiling: closure over the opening's near edge, back wall, lit ceiling
  face(wall, [[xl, sp.ceilMax, Z(uN)], [xr, sp.ceilMax, Z(uN)], [xr, H, Z(uN)], [xl, H, Z(uN)]], [0, 0, d], tileUV);
  face(wall, [[xl, yTop, Z(U)], [xr, yTop, Z(U)], [xr, H, Z(U)], [xl, H, Z(U)]], [0, 0, -d], tileUV);
  face(glow, [[xl, H, Z(uN)], [xr, H, Z(uN)], [xr, H, Z(U)], [xl, H, Z(U)]], [0, -1, 0], () => [0, 0], [1, 0.96, 0.84]);
  face(glow, [[x - 0.5, yTop, Z(U - 0.02)], [x + 0.5, yTop, Z(U - 0.02)], [x + 0.5, yTop + 2.1, Z(U - 0.02)], [x - 0.5, yTop + 2.1, Z(U - 0.02)]], [0, 0, -d], () => [0, 0], [1, 0.93, 0.78]);
  // ---- meshes
  const group = new THREE.Group(); group.name = 'stair';
  const mVC = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), mGlow = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const mSteel = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: 0x555555 });
  const owned = [mVC, mGlow, mSteel];
  const add = (Bd, mat, name) => { if (!Bd.count) return; const m = new THREE.Mesh(Bd.build(THREE), mat); m.name = name; group.add(m); return m; };
  add(treads, mVC, 'stair_steps'); add(trim, mVC, 'stair_trim'); add(steel, mSteel, 'stair_rails'); add(glow, mGlow, 'stair_glow');
  const dm = mats.dado || new THREE.MeshLambertMaterial({ color: 0x4a6a8a }), wm = mats.wall || new THREE.MeshLambertMaterial({ color: 0xe6e0d0 });
  add(dado, dm, 'stair_dado'); add(wall, wm, 'stair_wall');
  // ---- walker data (hall frame, x0<x1, z0<z1)
  const rect = (xa, xb, za, zb) => ({ x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: Math.min(za, zb), z1: Math.max(za, zb) });
  const ramp = { ...rect(xl, xr, Z(0), Z(uE)), up: d, yFoot: yLine(sp, 0), yTop };       // height runs from yFoot at the foot (z = Z(0)) to yTop at Z(uE)
  const top = { ...rect(xl, xr, Z(uE), Z(U - 0.1)), y: yTop };
  const obstacles = [];
  for (const s of [-1, 1]) obstacles.push(rect(x + s * S.clear, x + s * S.half, Z(0), Z(U + 0.05)));
  obstacles.push(rect(xl - 0.02, xr + 0.02, Z(U - 0.05), Z(U + 0.15)));
  const lights = [
    { x, y: sp.ceilMin - 0.45, z: Z(uN + 0.7), c: 0xffe9c0, i: 4, d: 7 },
    { x, y: yTop + 1.9, z: Z(Math.min(U - 0.4, uE + 0.4)), c: 0xfff0d0, i: 5, d: 8 },
  ];
  const avoid = rect(x - S.half - 0.12, x + S.half + 0.12, Z(-0.05), Z(uT));
  return { group, ramp, top, obstacles, lights, avoid, owned, spec: sp };
}
