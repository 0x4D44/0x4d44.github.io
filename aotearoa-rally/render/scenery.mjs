// Scenery: procedural geometry for every PROP_KIND, instanced through ONE atlas material,
// streamed from a spatial hash with per-instance distance LOD, culling, density thinning,
// wind sway (vertex shader), steam plumes and waterfalls.
import { createPropMaterial, buildPropAtlas, atlasCell, patchCommon, GLSL_NOISE } from "./materials.mjs";
import { PROP_TABLE, PROP_KIND_LIST, propLod, keepProp } from "./quality.mjs";

const TAU = Math.PI * 2;
const hs = (i, k) => { let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(k + 11, 0x85ebca6b); h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };

// ---------------------------------------------------------------- mesh builder
class MB {
  constructor(T) {
    this.T = T;
    this.p = []; this.n = []; this.u = []; this.c = []; this.s = []; this.i = [];
    this.cell = atlasCell("white");
    this.col = [1, 1, 1];
    this.m = new T.Matrix4(); this.nm = new T.Matrix3();
    this.stack = [];
    this.sw = (y) => 0;
    this._v = new T.Vector3(); this._n = new T.Vector3();
    this.seed = 1;
  }
  cellName(n) { this.cell = atlasCell(n); return this; }
  color(r, g, b) { if (typeof r === "number" && g === undefined) { const c = new this.T.Color(r); this.col = [c.r, c.g, c.b]; } else this.col = [r, g, b]; return this; }
  colorV(c, k = 1) { this.col = [c.r * k, c.g * k, c.b * k]; return this; }
  sway(fn) { this.sw = typeof fn === "function" ? fn : () => fn; return this; }
  push(m) { this.stack.push(this.m.clone()); this.m.multiply(m); this.nm.getNormalMatrix(this.m); return this; }
  pop() { this.m.copy(this.stack.pop()); this.nm.getNormalMatrix(this.m); return this; }
  /** transform helper: translate, euler(XYZ), scale */
  static X(T, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    return new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz, "YXZ")), new T.Vector3(sx, sy, sz));
  }
  at(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) { return this.push(MB.X(this.T, x, y, z, rx, ry, rz, sx, sy, sz)); }
  vert(x, y, z, nx, ny, nz, u, v, sw = 0) {
    const w = this._v.set(x, y, z).applyMatrix4(this.m), n = this._n.set(nx, ny, nz).applyMatrix3(this.nm).normalize();
    this.p.push(w.x, w.y, w.z); this.n.push(n.x, n.y, n.z);
    const c = this.cell; this.u.push(c[0] + (c[2] - c[0]) * u, c[1] + (c[3] - c[1]) * v);
    this.c.push(this.col[0], this.col[1], this.col[2]);
    this.s.push(sw);
    return this.p.length / 3 - 1;
  }
  tri(a, b, c) { this.i.push(a, b, c); }
  quadIdx(a, b, c, d) { this.i.push(a, b, c, c, b, d); }
  /** card: base point p, direction dir, side vector (unit), width w, length h, outward normal n, droop (world vec), 3 rows. */
  card(px, py, pz, dx, dy, dz, sx, sy, sz, w, h, n, droop, swayAmt = 1, rows = 2) {
    const base = this.p.length / 3;
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const taper = t < 0.5 ? 0.45 + t * 1.1 : 1.0 - (t - 0.5) * 0.9; // widest at mid
      const hw = (w * 0.5) * taper;
      const bx = px + dx * h * t + droop[0] * t * t, by = py + dy * h * t + droop[1] * t * t, bz = pz + dz * h * t + droop[2] * t * t;
      const sw = swayAmt * this.sw(by) * (0.5 + 0.5 * t);
      this.vert(bx - sx * hw, by - sy * hw, bz - sz * hw, n[0], n[1], n[2], 0, t, sw);
      this.vert(bx + sx * hw, by + sy * hw, bz + sz * hw, n[0], n[1], n[2], 1, t, sw);
    }
    for (let r = 0; r < rows; r++) { const a = base + r * 2; this.quadIdx(a, a + 1, a + 2, a + 3); }
  }
  /** Tapered tube along a path (Vector3-like [x,y,z] arrays). Bark tiles each ~3 m of length / circumference. */
  limb(pts, r0, r1, seg = 8, { tile = 3, cap = false, flare = 0 } = {}) {
    const T = this.T;
    // resample
    const rs = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
    const steps = Math.max(1, Math.ceil(total / tile));
    let acc = 0, seglen = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); acc += l; seglen.push(acc); }
    for (let k = 0; k <= steps; k++) {
      const d = (k / steps) * total;
      let j = 0; while (j < seglen.length - 1 && seglen[j] < d) j++;
      const d0 = j === 0 ? 0 : seglen[j - 1], t = seglen[j] > d0 ? (d - d0) / (seglen[j] - d0) : 0;
      const a = pts[j], b = pts[j + 1];
      rs.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, d / total]);
    }
    const circ = TAU * Math.max(r0, r1);
    const tilesU = Math.max(1, Math.round(circ / tile));
    const perTile = Math.max(1, Math.round(seg / tilesU));
    const S = perTile * tilesU;
    const ring = (k) => {
      const p = rs[k], q = rs[Math.min(rs.length - 1, k + 1)], o = rs[Math.max(0, k - 1)];
      let tx = q[0] - o[0], ty = q[1] - o[1], tz = q[2] - o[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      let ax = 0, ay = 1, az = 0; if (Math.abs(ty) > 0.9) { ax = 1; ay = 0; }
      let ux = ay * tz - az * ty, uy = az * tx - ax * tz, uz = ax * ty - ay * tx; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
      const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux;
      const r = r0 + (r1 - r0) * p[3] + flare * Math.max(0, 1 - p[3] * 6) * r0;
      return { p, ux, uy, uz, vx, vy, vz, r };
    };
    const rings = rs.map((_, k) => ring(k));
    for (let k = 0; k < rings.length - 1; k++) {
      const A = rings[k], B = rings[k + 1];
      for (let i = 0; i < S; i++) {
        const a0 = (i / S) * TAU, a1 = ((i + 1) / S) * TAU;
        const u0 = (i % perTile) / perTile, u1 = u0 + 1 / perTile;
        const mk = (R, a, u, v) => {
          const ca = Math.cos(a), sa = Math.sin(a);
          const nx = R.ux * ca + R.vx * sa, ny = R.uy * ca + R.vy * sa, nz = R.uz * ca + R.vz * sa;
          return this.vert(R.p[0] + nx * R.r, R.p[1] + ny * R.r, R.p[2] + nz * R.r, nx, ny, nz, u, v, this.sw(R.p[1]));
        };
        const v0 = mk(A, a0, u0, 0), v1 = mk(A, a1, u1, 0), v2 = mk(B, a0, u0, 1), v3 = mk(B, a1, u1, 1);
        this.i.push(v0, v2, v1, v1, v2, v3);
      }
    }
    if (cap) {
      const R = rings[rings.length - 1];
      const c = this.vert(R.p[0], R.p[1], R.p[2], 0, 1, 0, 0.5, 0.5, this.sw(R.p[1]));
      const ids = [];
      for (let i = 0; i <= S; i++) { const a = (i / S) * TAU; ids.push(this.vert(R.p[0] + (R.ux * Math.cos(a) + R.vx * Math.sin(a)) * R.r, R.p[1] + (R.uy * Math.cos(a) + R.vy * Math.sin(a)) * R.r, R.p[2] + (R.uz * Math.cos(a) + R.vz * Math.sin(a)) * R.r, 0, 1, 0, 0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a), this.sw(R.p[1]))); }
      for (let i = 0; i < S; i++) this.i.push(c, ids[i + 1], ids[i]);
    }
    return this;
  }
  cyl(r0, r1, h, seg = 8, opts) { return this.limb([[0, 0, 0], [0, h, 0]], r0, r1, seg, opts); }
  box(sx, sy, sz, { yBase = true, uvScale = 1 } = {}) {
    const hx = sx / 2, hz = sz / 2, y0 = yBase ? 0 : -sy / 2, y1 = yBase ? sy : sy / 2;
    const faces = [
      [[hx, y0, hz], [hx, y0, -hz], [hx, y1, hz], [hx, y1, -hz], [1, 0, 0]],
      [[-hx, y0, -hz], [-hx, y0, hz], [-hx, y1, -hz], [-hx, y1, hz], [-1, 0, 0]],
      [[-hx, y1, hz], [hx, y1, hz], [-hx, y1, -hz], [hx, y1, -hz], [0, 1, 0]],
      [[-hx, y0, -hz], [hx, y0, -hz], [-hx, y0, hz], [hx, y0, hz], [0, -1, 0]],
      [[-hx, y0, hz], [hx, y0, hz], [-hx, y1, hz], [hx, y1, hz], [0, 0, 1]],
      [[hx, y0, -hz], [-hx, y0, -hz], [hx, y1, -hz], [-hx, y1, -hz], [0, 0, -1]],
    ];
    for (const f of faces) {
      const n = f[4];
      const a = this.vert(...f[0], ...n, 0, 0), b = this.vert(...f[1], ...n, uvScale, 0), c = this.vert(...f[2], ...n, 0, uvScale), d = this.vert(...f[3], ...n, uvScale, uvScale);
      this.quadIdx(a, b, c, d);
    }
    return this;
  }
  ellipsoid(rx, ry, rz, seg = 8, rings = 5, swayAmt = 0) {
    const base = this.p.length / 3;
    for (let j = 0; j <= rings; j++) {
      const v = j / rings, phi = v * Math.PI;
      for (let i = 0; i <= seg; i++) {
        const u = i / seg, th = u * TAU;
        const nx = Math.sin(phi) * Math.cos(th), ny = Math.cos(phi), nz = Math.sin(phi) * Math.sin(th);
        const y = ny * ry;
        this.vert(nx * rx, y, nz * rz, nx / rx, ny / ry, nz / rz, u, v, swayAmt ? swayAmt * this.sw(y) : this.sw(y));
      }
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const a = base + j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
      this.i.push(a, b, c, b, d, c);
    }
    return this;
  }
  cone(r, h, seg = 8, rings = 1) { return this.limb([[0, 0, 0], [0, h, 0]], r, 0.02, seg, { tile: Math.max(3, h / rings) }); }
  torus(R, r, seg = 12, tseg = 6) {
    const base = this.p.length / 3;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * TAU;
      for (let j = 0; j <= tseg; j++) {
        const b = (j / tseg) * TAU;
        const nx = Math.cos(b) * Math.cos(a), ny = Math.sin(b), nz = Math.cos(b) * Math.sin(a);
        this.vert((R + r * Math.cos(b)) * Math.cos(a), r * Math.sin(b), (R + r * Math.cos(b)) * Math.sin(a), nx, ny, nz, i / seg, j / tseg);
      }
    }
    for (let i = 0; i < seg; i++) for (let j = 0; j < tseg; j++) {
      const a = base + i * (tseg + 1) + j, b = a + 1, c = a + tseg + 1, d = c + 1;
      this.i.push(a, c, b, b, c, d);
    }
    return this;
  }
  /** flat polygon (xy plane, facing +z) from points [x,y]; used for signs. */
  poly(pts, z = 0, flip = false) {
    const ids = pts.map(([x, y]) => this.vert(x, y, z, 0, 0, flip ? -1 : 1, 0.5, 0.5));
    for (let i = 1; i < ids.length - 1; i++) this.i.push(ids[0], flip ? ids[i + 1] : ids[i], flip ? ids[i] : ids[i + 1]);
    return this;
  }
  /** faceted displaced icosphere (rocks). */
  rock(rx, ry, rz, seed, sub = 1, rough = 0.28, planar = 0) {
    const T = this.T;
    const t = (1 + Math.sqrt(5)) / 2;
    let V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((v) => { const l = Math.hypot(...v); return v.map((c) => c / l); });
    let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for (let s = 0; s < sub; s++) {
      const nf = []; const cache = new Map();
      const mid = (a, b) => { const k = a < b ? a * 1000 + b : b * 1000 + a; if (cache.has(k)) return cache.get(k); const m = [(V[a][0] + V[b][0]) / 2, (V[a][1] + V[b][1]) / 2, (V[a][2] + V[b][2]) / 2]; const l = Math.hypot(...m); V.push(m.map((c) => c / l)); cache.set(k, V.length - 1); return V.length - 1; };
      for (const [a, b, c] of F) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
      F = nf;
    }
    const lat = (x, y, z, sd) => hs(((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) | 0, sd);
    const n3 = (x, y, z, sd) => {
      const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
      const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
      const L = (a, b, t) => a + (b - a) * t;
      return L(L(L(lat(ix, iy, iz, sd), lat(ix + 1, iy, iz, sd), ux), L(lat(ix, iy + 1, iz, sd), lat(ix + 1, iy + 1, iz, sd), ux), uy),
        L(L(lat(ix, iy, iz + 1, sd), lat(ix + 1, iy, iz + 1, sd), ux), L(lat(ix, iy + 1, iz + 1, sd), lat(ix + 1, iy + 1, iz + 1, sd), ux), uy), uz);
    };
    const disp = V.map((v, i) => {
      const n = n3(v[0] * 1.7 + seed, v[1] * 1.7, v[2] * 1.7, seed) * 2 - 1;
      const n2 = n3(v[0] * 3.9 + 9, v[1] * 3.9 + seed, v[2] * 3.9, seed + 5) * 2 - 1;
      const n4 = n3(v[0] * 8.5 + 3, v[1] * 6 + seed, v[2] * 8.5, seed + 9) * 2 - 1;
      const k = 1 + rough * (0.62 * n + 0.3 * n2 + 0.2 * n4);
      const y = v[1] * ry * k;
      return [v[0] * rx * k, planar && y < -ry * 0.3 ? -ry * 0.3 * 0 + y * 0.2 : y, v[2] * rz * k];
    });
    const vn = disp.map(() => [0, 0, 0]);
    for (const [a, b, c] of F) {
      const A = disp[a], B = disp[b], C = disp[c];
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      for (const q of [a, b, c]) { vn[q][0] += fx; vn[q][1] += fy; vn[q][2] += fz; }
    }
    for (const q of vn) { const l = Math.hypot(q[0], q[1], q[2]) || 1; q[0] /= l; q[1] /= l; q[2] /= l; }
    for (const [a, b, c] of F) {
      const A = disp[a], B = disp[b], C = disp[c];
      let ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
      const uvf = (P) => (ay >= ax && ay >= az ? [P[0] / (rx * 1.4) * 0.5 + 0.5, P[2] / (rz * 1.4) * 0.5 + 0.5] : ax >= az ? [P[2] / (rz * 1.4) * 0.5 + 0.5, P[1] / (ry * 1.4) * 0.5 + 0.5] : [P[0] / (rx * 1.4) * 0.5 + 0.5, P[1] / (ry * 1.4) * 0.5 + 0.5]);
      const ids = [[A, a], [B, b], [C, c]].map(([P, qi]) => { const uv = uvf(P); const sn = vn[qi]; return this.vert(P[0], P[1], P[2], sn[0] * 0.82 + nx * 0.18, sn[1] * 0.82 + ny * 0.18, sn[2] * 0.82 + nz * 0.18, uv[0], uv[1]); });
      this.i.push(ids[0], ids[1], ids[2]);
    }
    return this;
  }
  toGeometry() {
    const g = new this.T.BufferGeometry();
    g.setAttribute("position", new this.T.Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new this.T.Float32BufferAttribute(this.n, 3));
    g.setAttribute("uv", new this.T.Float32BufferAttribute(this.u, 2));
    g.setAttribute("color", new this.T.Float32BufferAttribute(this.c, 3));
    g.setAttribute("aSway", new this.T.Float32BufferAttribute(this.s, 1));
    g.setIndex(this.i.length > 65000 ? new this.T.Uint32BufferAttribute(this.i, 1) : new this.T.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------- palette helpers
function paletteFor(T, pal = {}) {
  const C = (h, d) => new T.Color(h ?? d);
  const mixW = (c, k) => new T.Color(1, 1, 1).lerp(c, k); // keep photo detail, add hue
  const f1 = C(pal.foliage, 0x3d6a2c), f2 = C(pal.foliage2, 0x57803a);
  const boost = (c) => new T.Color(Math.min(1.6, c.r * 3.2), Math.min(1.6, c.g * 3.2), Math.min(1.6, c.b * 3.2));
  return {
    f1: mixW(boost(f1), 0.62), f2: mixW(boost(f2), 0.62), g1: mixW(boost(C(pal.grass, 0x6b8a3a)), 0.7), g2: mixW(boost(C(pal.grass2, 0x8d9a4a)), 0.7), trunk: mixW(C(pal.trunk, 0x5a4430).multiplyScalar(1.7), 0.4),
    rock: mixW(C(pal.rock, 0x8a8a80).multiplyScalar(1.15), 0.5), accent: C(pal.accent, 0xd24a2c),
    f1d: C(pal.foliage, 0x3d6a2c), f2d: C(pal.foliage2, 0x57803a), trunkD: C(pal.trunk, 0x5a4430), rockD: C(pal.rock, 0x8a8a80),
  };
}

// ---------------------------------------------------------------- kind builders
// Each returns an MB for (kind, variant, lod). Typical size = 1.0 scale.
function conifer(mb, P, o, lod, v) {
  const { H, trunkR, crownStart, crownR, whorls, perW, tint, cardW, droop = 0.18, bark = "bark_pine", cardCell = "foliage_pine" } = o;
  const sw = (y) => Math.pow(Math.max(0, y / H), 1.7);
  mb.sway(sw);
  mb.cellName(bark).colorV(P.trunk, 1);
  mb.limb([[0, 0, 0], [0.15 * (v - 0.5), H * 0.5, 0.1], [0, H * 0.98, 0]], trunkR, 0.05, lod === 0 ? 9 : 6, { tile: 3, flare: 0.8 });
  mb.cellName(cardCell);
  const wh = lod === 0 ? whorls : Math.ceil(whorls * 0.5), pw = lod === 0 ? perW : Math.max(5, perW - 2);
  for (let k = 0; k < wh; k++) {
    const t = k / (wh - 1);
    const y = crownStart + (H * 0.97 - crownStart) * t;
    const R = crownR * Math.pow(1 - t, 0.85) + 0.5;
    for (let j = 0; j < pw; j++) {
      const az = (j / pw) * TAU + k * 2.399 + hs(k * 31 + j, v + 3) * 0.5;
      const pitch = -0.18 + t * 0.55 + (hs(k + j * 7, v) - 0.5) * 0.25;
      const dx = Math.sin(az) * Math.cos(pitch), dz = Math.cos(az) * Math.cos(pitch), dy = Math.sin(pitch);
      const L = R * (lod === 0 ? 1.15 : 1.5), W = cardW * (0.8 + R * 0.12) * (lod === 0 ? 1 : 1.5);
      const sx = Math.cos(az), sz = -Math.sin(az);
      const nn = [Math.sin(az) * 0.8, 0.45, Math.cos(az) * 0.8];
      const tcol = j % 2 ? P.f1 : P.f2;
      mb.colorV(tcol, (0.78 + 0.35 * hs(k * 13 + j, v)) * tint * (0.68 + 0.42 * t));
      mb.card(0, y, 0, dx, dy, dz, sx, 0, sz, W, L, nn, [0, -L * droop, 0], 1, 2);
    }
  }
  // sky-lit top tuft
  mb.colorV(P.f2, tint);
  mb.card(0, H * 0.9, 0, 0, 1, 0, 1, 0, 0, 1.2, H * 0.1, [0, 1, 0], [0, 0, 0], 1, 1);
  mb.card(0, H * 0.9, 0, 0, 1, 0, 0, 0, 1, 1.2, H * 0.1, [0, 1, 0], [0, 0, 0], 1, 1);
}

function blobTree(mb, P, o, lod) { // LOD2: vertex-colour silhouette
  const { H, trunkR, crownR, crownY, conifer: isCon } = o;
  mb.sway((y) => Math.pow(Math.max(0, y / H), 1.7) * 0.8);
  mb.cellName("white").colorV(P.trunkD, 1);
  mb.limb([[0, 0, 0], [0, H * 0.9, 0]], trunkR, 0.1, 5, { tile: 6 });
  mb.colorV(P.f1d, 1.0);
  if (isCon) {
    mb.at(0, crownY, 0); mb.cone(crownR, H - crownY, 7); mb.pop();
    mb.colorV(P.f2d, 0.9);
    mb.at(0, crownY + (H - crownY) * 0.35, 0); mb.cone(crownR * 0.7, (H - crownY) * 0.65, 7); mb.pop();
  } else {
    mb.at(0, crownY, 0); mb.ellipsoid(crownR, crownR * 0.7, crownR, 7, 4); mb.pop();
    mb.colorV(P.f2d, 0.95);
    mb.at(crownR * 0.35, crownY + crownR * 0.35, 0); mb.ellipsoid(crownR * 0.6, crownR * 0.45, crownR * 0.6, 6, 3); mb.pop();
  }
}

function broadleaf(mb, P, o, lod, v) {
  const { H, trunkH, trunkR, crownR, crownY, clusters, cardSize, lean = 0, tint = 1, bark = "bark_beech", cardCell = "foliage_broadleaf", red = 0, limbs = 4 } = o;
  mb.sway((y) => Math.pow(Math.max(0, y / H), 1.5));
  mb.cellName(bark).colorV(P.trunk, 1);
  const tp = [[0, 0, 0], [lean * 0.4, trunkH * 0.5, lean * 0.2], [lean, trunkH, lean * 0.5]];
  mb.limb(tp, trunkR, trunkR * 0.55, lod === 0 ? 9 : 6, { tile: 3, flare: 0.6 });
  const nCl = lod === 0 ? clusters : Math.ceil(clusters * 0.4);
  const cx0 = lean, cz0 = lean * 0.5;
  if (lod === 0) {
    for (let k = 0; k < limbs; k++) {
      const az = (k / limbs) * TAU + v;
      const ex = cx0 + Math.sin(az) * crownR * 0.7, ez = cz0 + Math.cos(az) * crownR * 0.7, ey = crownY + crownR * 0.1;
      mb.limb([[lean, trunkH * 0.9, lean * 0.5], [(lean + ex) / 2, (trunkH + ey) / 2 + 0.3, (lean * 0.5 + ez) / 2], [ex, ey, ez]], trunkR * 0.38, trunkR * 0.12, 6, { tile: 3 });
    }
  }
  mb.cellName(cardCell);
  for (let k = 0; k < nCl; k++) {
    const a = hs(k, v + 21) * TAU, b = Math.acos(1 - 2 * hs(k, v + 22) * 0.9), r = Math.cbrt(hs(k, v + 23)) * 0.95;
    const cx = cx0 + Math.sin(b) * Math.cos(a) * crownR * r, cy = crownY + Math.cos(b) * crownR * 0.62 * r, cz = cz0 + Math.sin(b) * Math.sin(a) * crownR * r;
    const nx = cx - cx0, ny = (cy - crownY) * 1.1 + 0.4, nz = cz - cz0, nl = Math.hypot(nx, ny, nz) || 1;
    const nn = [nx / nl, ny / nl, nz / nl];
    const per = lod === 0 ? 5 : 3;
    for (let q = 0; q < per; q++) {
      const az = hs(k * 5 + q, v + 31) * TAU, tilt = (hs(k * 7 + q, v + 32) - 0.35) * 1.4;
      const dx = Math.sin(az) * Math.cos(tilt), dz = Math.cos(az) * Math.cos(tilt), dy = Math.sin(tilt) * 0.8 + 0.2;
      const sz = cardSize * (lod === 0 ? 1.3 : 2.0) * (0.8 + hs(k, q) * 0.5);
      const isRed = red && hs(k * 3 + q, v) < red;
      if (isRed) mb.colorV(P.accent, 1.2);
      else mb.colorV(hs(k, q + 3) < 0.5 ? P.f1 : P.f2, (0.75 + 0.4 * hs(k + 9, q)) * tint * (0.66 + 0.4 * r + 0.18 * Math.max(-1, Math.min(1, (cy - crownY) / (crownR * 0.6)))));
      mb.card(cx - dx * sz * 0.4, cy - dy * sz * 0.4, cz - dz * sz * 0.4, dx, dy, dz, dz, 0, -dx, sz, sz, nn, [0, -sz * 0.25, 0], 1, 1);
    }
  }
}

function palmLike(mb, P, o, lod, v) { // tree fern / cabbage tree heads
  const { H, trunkR, fronds, frondL, frondW, cell, droop = 0.55, headY = H, bark = "bark_pine", tint = 1, stems = 1 } = o;
  mb.sway((y) => Math.pow(Math.max(0, y / headY), 1.3));
  for (let s = 0; s < stems; s++) {
    const ang = (s / stems) * TAU + v, off = stems > 1 ? 0.9 + 0.5 * s : 0;
    const ox = Math.sin(ang) * off * 0.5, oz = Math.cos(ang) * off * 0.5;
    const sh = H * (stems > 1 ? 0.7 + 0.3 * hs(s, v) : 1);
    mb.cellName(bark).colorV(P.trunk, stems > 1 ? 0.9 : 0.55);
    mb.limb([[0, 0, 0], [ox * 0.5, sh * 0.5, oz * 0.5], [ox, sh, oz]], trunkR, trunkR * 0.8, lod === 0 ? 7 : 5, { tile: 2 });
    mb.cellName(cell);
    const nf = lod === 0 ? fronds : Math.ceil(fronds * 0.55);
    for (let k = 0; k < nf; k++) {
      const az = (k / nf) * TAU + hs(k, v + s) * 0.4 + s;
      const el = 0.1 + (hs(k + 5, v) - 0.3) * 0.6;
      const dx = Math.sin(az) * Math.cos(el), dz = Math.cos(az) * Math.cos(el), dy = Math.sin(el);
      const L = frondL * (0.85 + 0.3 * hs(k, v + 8));
      mb.colorV(k % 2 ? P.f1 : P.f2, (0.8 + 0.3 * hs(k, v + 2)) * tint);
      mb.card(ox, sh, oz, dx, dy, dz, dz, 0, -dx, frondW * (lod === 0 ? 1 : 1.3), L, [dx * 0.6, 0.7, dz * 0.6], [dx * L * 0.25, -L * droop, dz * L * 0.25], 1, 2);
    }
  }
}

function bladeClump(mb, P, o, lod, v) { // flax, toetoe, tussock, grass, fern, shrub
  const { n, h, w, cell, spread = 0.7, tint = 1, droop = 0.35, col2, swayAmt = 1, grassy = false } = o;
  const base = grassy ? P.g1 : P.f1;
  mb.sway((y) => Math.min(1, y / (h * 0.9)) * swayAmt);
  mb.cellName(cell);
  const cnt = lod === 0 ? n : Math.max(3, Math.ceil(n * 0.5));
  for (let k = 0; k < cnt; k++) {
    const az = (k / cnt) * TAU + hs(k, v) * 0.6;
    const el = 1.15 - spread * hs(k, v + 4) - (o.flatten ?? 0);
    const dx = Math.sin(az) * Math.cos(el), dz = Math.cos(az) * Math.cos(el), dy = Math.sin(el);
    const L = h * (0.7 + 0.4 * hs(k, v + 6));
    mb.colorV(k % 3 === 0 && col2 ? col2 : base, (0.75 + 0.45 * hs(k, v + 9)) * tint);
    mb.card(0, 0, 0, dx, dy, dz, dz, 0, -dx, w * (lod === 0 ? 1 : 1.4), L, [dx * 0.3, 0.8, dz * 0.3], [dx * L * 0.35, -L * droop, dz * L * 0.35], 1, 2);
  }
}

function rockKind(mb, P, o, lod, v) {
  const { rx, ry, rz, cell, sub, rough, tint = 1, count = 1, cluster = 0.6, mossy = 0 } = o;
  mb.cellName(cell);
  const s = lod === 0 ? sub : Math.max(0, sub - 1);
  for (let k = 0; k < count; k++) {
    const a = (k / count) * TAU + v, d = k === 0 ? 0 : cluster * Math.max(rx, rz);
    const sc = k === 0 ? 1 : 0.45 + 0.3 * hs(k, v);
    mb.at(Math.sin(a) * d, ry * sc * 0.3, Math.cos(a) * d, 0, hs(k, v) * TAU, 0);
    mb.colorV(P.rock, tint * (0.85 + 0.25 * hs(k, v + 4)));
    mb.rock(rx * sc, ry * sc, rz * sc, v * 7 + k, s, rough);
    mb.pop();
  }
  if (mossy) { mb.cellName("gnd_moss_rock"); mb.colorV(P.f1d, 1.3); mb.at(0, ry * 0.7, 0); mb.rock(rx * 0.7, ry * 0.4, rz * 0.7, v + 77, 0, 0.2); mb.pop(); }
}

function person(mb, P, v, kind) {
  // variety by variant: jacket colour, trousers, hat, cheering arms, child scale, backpack
  const jackets = [[0.75, 0.12, 0.1], [0.12, 0.3, 0.7], [0.9, 0.78, 0.12], [0.15, 0.5, 0.3], [0.86, 0.86, 0.84], [0.5, 0.15, 0.5], [0.95, 0.45, 0.1], [0.1, 0.1, 0.12]];
  const trousers = [[0.14, 0.16, 0.3], [0.2, 0.2, 0.22], [0.35, 0.28, 0.2], [0.1, 0.1, 0.12], [0.25, 0.32, 0.45]];
  const skin = [[0.8, 0.58, 0.45], [0.55, 0.38, 0.28], [0.9, 0.7, 0.58], [0.4, 0.27, 0.2], [0.7, 0.5, 0.38]];
  const marshal = kind === "marshal";
  const h1 = (k) => hs(v * 13 + 5, k);
  const sh = marshal ? [0.98, 0.5, 0.04] : jackets[Math.floor(h1(1) * jackets.length)];
  const pants = marshal ? [0.1, 0.12, 0.2] : trousers[Math.floor(h1(2) * trousers.length)];
  const sk = skin[Math.floor(h1(3) * skin.length)];
  const child = !marshal && h1(4) > 0.78;
  const cheer = !marshal && h1(5) > 0.5;
  const hat = marshal ? 1 : Math.floor(h1(6) * 4); // 0 none, 1 cap/helmet, 2 beanie, 3 wide hat
  mb.at(0, 0, 0, 0, 0, 0, child ? 0.66 : 0.94 + 0.12 * h1(7));
  mb.cellName("fabric");
  mb.sway(0);
  for (const sd of [-1, 1]) { mb.color(...pants); mb.at(sd * 0.1, 0.07, 0); mb.cyl(0.078, 0.066, 0.8, 6, { tile: 3 }); mb.pop(); mb.color(0.08, 0.08, 0.09); mb.at(sd * 0.1, 0, 0.04); mb.ellipsoid(0.075, 0.045, 0.12, 6, 3); mb.pop(); }
  mb.color(...sh); mb.at(0, 0.82, 0); mb.cyl(0.2, 0.175, 0.64, 8, { tile: 3 }); mb.pop();
  mb.color(...sh); mb.at(0, 1.4, 0); mb.ellipsoid(0.215, 0.09, 0.14, 8, 3); mb.pop(); // shoulders
  if (marshal) { for (const y of [0.98, 1.2]) { mb.color(0.85, 0.88, 0.8); mb.at(0, y, 0); mb.cyl(0.205, 0.205, 0.05, 8, { tile: 3 }); mb.pop(); } }
  else if (h1(8) > 0.65) { mb.color(...jackets[(Math.floor(h1(9) * 8) + 3) % 8]); mb.at(0, 0.9, -0.17); mb.box(0.26, 0.38, 0.12); mb.pop(); } // backpack
  for (const sd of [-1, 1]) {
    mb.color(...sh);
    if (cheer) { mb.at(sd * 0.23, 1.38, 0, 0, 0, -sd * (0.35 + 0.25 * h1(10))); mb.cyl(0.058, 0.046, 0.52, 5, { tile: 3 }); mb.pop(); mb.color(...sk); mb.at(sd * (0.23 + 0.2 + 0.1 * h1(10)), 1.88, 0); mb.ellipsoid(0.055, 0.055, 0.055, 5, 3); mb.pop(); }
    else { mb.at(sd * 0.25, 1.4, 0, 0, 0, sd * 0.12); mb.cyl(0.058, 0.046, -0.55, 5, { tile: 3 }); mb.pop(); mb.color(...sk); mb.at(sd * 0.29, 0.83, 0); mb.ellipsoid(0.052, 0.052, 0.052, 5, 3); mb.pop(); }
  }
  mb.color(...sk); mb.at(0, 1.43, 0); mb.cyl(0.05, 0.055, 0.1, 5, { tile: 3 }); mb.pop();
  mb.color(...sk); mb.at(0, 1.56, 0); mb.ellipsoid(0.105, 0.125, 0.115, 8, 5); mb.pop();
  if (hat === 1) { mb.color(...(marshal ? [0.95, 0.95, 0.95] : jackets[Math.floor(h1(11) * 8)])); mb.at(0, 1.63, 0); mb.ellipsoid(0.12, 0.085, 0.13, 8, 3); mb.pop(); mb.at(0, 1.62, 0.1); mb.box(0.18, 0.02, 0.1); mb.pop(); }
  else if (hat === 2) { mb.color(...jackets[Math.floor(h1(12) * 8)]); mb.at(0, 1.62, 0); mb.ellipsoid(0.115, 0.1, 0.12, 8, 4); mb.pop(); }
  else if (hat === 3) { mb.color(0.45, 0.36, 0.22); mb.at(0, 1.64, 0); mb.cyl(0.22, 0.22, 0.02, 10, { tile: 3 }); mb.pop(); mb.at(0, 1.64, 0); mb.cyl(0.11, 0.1, 0.1, 8, { tile: 3 }); mb.pop(); }
  else { mb.color(0.15 + 0.3 * h1(13), 0.1 + 0.12 * h1(13), 0.06); mb.at(0, 1.61, -0.01); mb.ellipsoid(0.11, 0.08, 0.115, 6, 3); mb.pop(); }
  mb.pop();
}

function signPlate(mb, post, w, h, yTop, fn) {
  mb.cellName("metal").color(0.55, 0.55, 0.58); mb.at(0, 0, 0); mb.cyl(0.035, 0.035, yTop, 6, { tile: 4 }); mb.pop();
  mb.cellName("white");
  fn(mb);
}

const BUILD = {
  pine: (mb, P, lod, v) => lod === 2 ? blobTree(mb, P, { H: 18, trunkR: 0.28, crownR: 3.2, crownY: 3.8, conifer: true }, lod)
    : conifer(mb, P, { H: 18, trunkR: 0.3, crownStart: 3.6, crownR: 3.4, whorls: 19, perW: 9, tint: 1, cardW: 2.6 }, lod, v),
  redwood: (mb, P, lod, v) => lod === 2 ? blobTree(mb, P, { H: 44, trunkR: 0.95, crownR: 4.2, crownY: 15, conifer: true }, lod)
    : conifer(mb, P, { H: 44, trunkR: 1.05, crownStart: 16, crownR: 4.6, whorls: 17, perW: 7, tint: 0.85, cardW: 3.0, droop: 0.28, bark: "bark_redwood" }, lod, v),
  kauri: (mb, P, lod, v) => lod === 2 ? blobTree(mb, P, { H: 30, trunkR: 0.8, crownR: 5, crownY: 17, conifer: false }, lod)
    : broadleaf(mb, P, { H: 30, trunkH: 17, trunkR: 0.85, crownR: 5.5, crownY: 22, clusters: 26, cardSize: 3, tint: 0.9, bark: "bark_pine", limbs: 5 }, lod, v),
  macrocarpa: (mb, P, lod, v) => lod === 2 ? blobTree(mb, P, { H: 15, trunkR: 0.55, crownR: 7, crownY: 8, conifer: false }, lod)
    : broadleaf(mb, P, { H: 15, trunkH: 5, trunkR: 0.55, crownR: 7.5, crownY: 9, clusters: 24, cardSize: 3.3, tint: 0.62, bark: "bark_pine", cardCell: "foliage_pine", limbs: 5, lean: 0.4 }, lod, v),
  beech: (mb, P, lod, v) => lod === 2 ? blobTree(mb, P, { H: 21, trunkR: 0.38, crownR: 6, crownY: 13, conifer: false }, lod)
    : broadleaf(mb, P, { H: 21, trunkH: 9, trunkR: 0.45, crownR: 6.4, crownY: 14, clusters: 30, cardSize: 2.6, tint: 0.95, bark: "bark_beech", limbs: 5 }, lod, v),
  pohutukawa: (mb, P, lod, v) => lod === 2 ? blobTree(mb, P, { H: 10, trunkR: 0.6, crownR: 6.5, crownY: 6, conifer: false }, lod)
    : broadleaf(mb, P, { H: 10, trunkH: 3.2, trunkR: 0.62, crownR: 7, crownY: 6, clusters: 28, cardSize: 2.6, tint: 0.8, bark: "bark_beech", limbs: 6, lean: 1.2, red: 0.1 }, lod, v),
  tree_fern: (mb, P, lod, v) => lod === 2 ? (mb.sway(0.4), mb.cellName("white").colorV(P.trunkD, 0.7), mb.cyl(0.12, 0.1, 3.6, 4), mb.colorV(P.f1d, 1), mb.at(0, 3.5, 0), mb.ellipsoid(2, 0.7, 2, 6, 3), mb.pop())
    : palmLike(mb, P, { H: 3.8, headY: 3.8, trunkR: 0.14, fronds: 11, frondL: 2.4, frondW: 1.1, cell: "foliage_fern", tint: 0.95 }, lod, v),
  cabbage_tree: (mb, P, lod, v) => lod === 2 ? (mb.sway(0.4), mb.cellName("white").colorV(P.trunkD, 1), mb.cyl(0.22, 0.14, 5, 4), mb.colorV(P.f2d, 1.05), mb.at(0, 5.6, 0), mb.ellipsoid(1.8, 1.1, 1.8, 6, 3), mb.pop())
    : palmLike(mb, P, { H: 6, headY: 5, trunkR: 0.22, fronds: 14, frondL: 1.7, frondW: 0.5, cell: "foliage_flax", droop: 0.25, bark: "bark_pine", tint: 1.05, stems: 3 }, lod, v),
  flax: (mb, P, lod, v) => bladeClump(mb, P, { n: 16, h: 1.7, w: 0.42, cell: "foliage_flax", spread: 0.55, tint: 1, droop: 0.5 }, lod, v),
  toetoe: (mb, P, lod, v) => {
    bladeClump(mb, P, { n: 14, h: 1.8, w: 0.3, cell: "foliage_flax", spread: 0.6, tint: 1.1, droop: 0.55, col2: P.f2 }, lod, v);
    if (lod === 0) for (let k = 0; k < 6; k++) {
      const az = (k / 6) * TAU + v, lean = 0.35 + 0.3 * hs(k, v), hgt = 2.2 + hs(k, v + 2);
      mb.cellName("white").color(0.78, 0.7, 0.5);
      mb.limb([[0, 0, 0], [Math.sin(az) * lean * 0.5, hgt * 0.6, Math.cos(az) * lean * 0.5], [Math.sin(az) * lean, hgt, Math.cos(az) * lean]], 0.012, 0.008, 4, { tile: 3 });
      mb.color(0.93, 0.89, 0.78); mb.at(Math.sin(az) * lean, hgt - 0.28, Math.cos(az) * lean, 0.25 * Math.cos(az), 0, 0.25 * Math.sin(az)); mb.ellipsoid(0.07, 0.34, 0.07, 5, 4, 1.2); mb.pop();
    }
  },
  tussock: (mb, P, lod, v) => bladeClump(mb, P, { n: 28, h: 0.95, w: 0.24, cell: "foliage_grass", spread: 0.6, tint: 1.2, droop: 0.55, col2: P.g2, grassy: true }, lod, v),
  grass_tuft: (mb, P, lod, v) => bladeClump(mb, P, { n: 9, h: 0.55, w: 0.28, cell: "foliage_grass", spread: 0.4, tint: 1.1, droop: 0.25, grassy: true }, lod, v),
  fern: (mb, P, lod, v) => bladeClump(mb, P, { n: 9, h: 1.0, w: 0.55, cell: "foliage_fern", spread: 0.8, tint: 0.95, droop: 0.55, flatten: 0.3 }, lod, v),
  shrub: (mb, P, lod, v) => broadleaf(mb, P, { H: 1.6, trunkH: 0.3, trunkR: 0.05, crownR: 0.95, crownY: 0.8, clusters: lod === 0 ? 10 : 5, cardSize: 0.8, tint: 0.95, bark: "bark_beech", limbs: 0 }, lod, v),
  boulder: (mb, P, lod, v) => rockKind(mb, P, { rx: 1.0, ry: 1.0, rz: 0.85, cell: "gnd_schist", sub: 2, rough: 0.4, count: 2, cluster: 0.45 }, lod, v),
  limestone: (mb, P, lod, v) => rockKind(mb, P, { rx: 1.5, ry: 3.3, rz: 1.3, cell: "gnd_limestone", sub: 3, rough: 0.5, count: 3, cluster: 0.7, tint: 0.85 }, lod, v),
  schist: (mb, P, lod, v) => rockKind(mb, P, { rx: 1.9, ry: 2.7, rz: 1.6, cell: "gnd_schist", sub: 3, rough: 0.5, count: 3, cluster: 0.6 }, lod, v),
  log: (mb, P) => { mb.cellName("bark_beech").colorV(P.trunk, 0.9); mb.at(0, 0.35, 0, 0, 0, Math.PI / 2); mb.cyl(0.34, 0.3, 4.6, 8, { cap: true }); mb.pop(); mb.cellName("white").color(0.72, 0.6, 0.42); mb.at(-0.0, 0.35, 0, 0, 0, Math.PI / 2); mb.ellipsoid(0.01, 0.01, 0.01, 3, 2); mb.pop(); },
  stump: (mb, P) => { mb.cellName("bark_pine").colorV(P.trunk, 0.9); mb.cyl(0.42, 0.34, 0.65, 9, { cap: true }); mb.cellName("white").color(0.72, 0.6, 0.44); mb.at(0, 0.655, 0); mb.ellipsoid(0.34, 0.01, 0.34, 8, 2); mb.pop(); },
  fence_post: (mb, P) => { mb.cellName("planks").color(0.75, 0.62, 0.45); mb.cyl(0.07, 0.06, 1.25, 6, { tile: 3 }); mb.cellName("white").color(0.55, 0.45, 0.32); mb.at(0, 1.25, 0); mb.ellipsoid(0.06, 0.03, 0.06, 5, 2); mb.pop(); },
  fence_wire: (mb) => { mb.cellName("metal").color(0.5, 0.5, 0.52); for (const y of [0.35, 0.65, 0.95, 1.2]) { const pts = []; for (let k = 0; k <= 4; k++) pts.push([0, y - 0.05 * Math.sin((k / 4) * Math.PI), k / 4 - 0.5]); mb.limb(pts, 0.007, 0.007, 3, { tile: 4 }); } },
  power_pole: (mb, P, lod) => {
    mb.cellName("bark_pine").colorV(P.trunk, 0.8); mb.cyl(0.17, 0.12, 10.5, 7, { tile: 4 });
    mb.cellName("planks").color(0.6, 0.5, 0.38); mb.at(0, 9.6, 0); mb.box(2.4, 0.12, 0.12); mb.pop();
    if (lod === 0) for (const x of [-1.0, 0, 1.0]) { mb.cellName("white").color(0.82, 0.82, 0.8); mb.at(x, 9.72, 0); mb.cyl(0.04, 0.05, 0.22, 5); mb.pop(); mb.cellName("metal").color(0.2, 0.2, 0.22); mb.limb([[x, 9.9, 0], [x + 6, 9.55, 0.05], [x + 12, 9.9, 0.1]], 0.012, 0.012, 3, { tile: 8 }); }
  },
  sign_chevron: (mb) => {
    mb.cellName("metal").color(0.5, 0.5, 0.52); mb.cyl(0.035, 0.035, 1.9, 6, { tile: 4 });
    mb.cellName("white").color(0.08, 0.08, 0.1); mb.at(0, 1.95, 0); mb.box(0.92, 0.92, 0.03, { yBase: false }); mb.pop();
    mb.color(1.0, 0.82, 0.05); mb.at(0, 1.95, 0.02); mb.box(0.82, 0.82, 0.01, { yBase: false }); mb.pop();
    mb.color(0.05, 0.05, 0.06); mb.at(0, 1.95, 0.028); mb.poly([[-0.28, -0.32], [-0.1, -0.32], [0.3, 0], [-0.1, 0.32], [-0.28, 0.32], [0.12, 0]]); mb.pop();
  },
  sign_warning: (mb) => {
    mb.cellName("metal").color(0.5, 0.5, 0.52); mb.cyl(0.035, 0.035, 1.8, 6, { tile: 4 });
    mb.cellName("white");
    mb.color(0.8, 0.07, 0.07); mb.at(0, 2.05, 0.0); mb.poly([[-0.55, -0.45], [0.55, -0.45], [0, 0.55]]); mb.pop();
    mb.color(0.96, 0.96, 0.9); mb.at(0, 2.05, 0.004); mb.poly([[-0.42, -0.36], [0.42, -0.36], [0, 0.4]]); mb.pop();
    mb.color(0.05, 0.05, 0.06); mb.at(0, 2.02, 0.008); mb.poly([[-0.2, -0.22], [-0.08, -0.22], [0.02, 0.1], [0.1, 0.1], [0.1, 0.0], [0.2, 0.15], [0.1, 0.3], [0.1, 0.2], [-0.02, 0.2]]); mb.pop();
    mb.color(0.8, 0.07, 0.07); mb.at(0, 2.05, -0.004); mb.poly([[-0.55, -0.45], [0, 0.55], [0.55, -0.45]], 0, true); mb.pop();
  },
  marker_post: (mb) => { mb.cellName("white"); mb.color(0.93, 0.93, 0.9); mb.cyl(0.05, 0.05, 1.05, 6, { tile: 4 }); mb.color(0.85, 0.12, 0.1); mb.at(0, 0.7, 0); mb.cyl(0.052, 0.052, 0.18, 6, { tile: 4 }); mb.pop(); mb.color(0.95, 0.85, 0.2); mb.at(0, 1.05, 0); mb.cyl(0.05, 0.03, 0.04, 6); mb.pop(); },
  tape_barrier: (mb) => {
    mb.cellName("planks").color(0.7, 0.58, 0.4); for (const z of [-3, 3]) { mb.at(0, 0, z); mb.cyl(0.035, 0.035, 1.2, 5, { tile: 4 }); mb.pop(); }
    mb.cellName("white");
    for (let k = 0; k < 12; k++) { const r = k % 2; mb.color(r ? 0.88 : 0.9, r ? 0.1 : 0.9, r ? 0.1 : 0.9); mb.at(0, 1.0, -3 + k * 0.5 + 0.25); mb.box(0.01, 0.1, 0.5, { yBase: false }); mb.at(0, -0.24, 0); mb.box(0.01, 0.1, 0.5, { yBase: false }); mb.pop(); mb.pop(); }
  },
  haybale: (mb, P, lod, v) => {
    mb.cellName("fabric");
    if (v % 2) { mb.color(0.92, 0.94, 0.95); } else mb.color(0.78, 0.66, 0.34);
    mb.at(0, 0.62, 0, 0, 0, Math.PI / 2); mb.cyl(0.62, 0.62, 1.2, 12, { cap: true }); mb.pop();
    mb.cellName("white"); if (!(v % 2)) { mb.color(0.62, 0.5, 0.22); mb.at(0, 0.62, 0, 0, 0, Math.PI / 2); mb.at(0, 0.6, 0); mb.ellipsoid(0.55, 0.01, 0.55, 8, 2); mb.pop(); mb.pop(); }
  },
  marshal: (mb, P, lod, v) => person(mb, P, v, "marshal"),
  spectator: (mb, P, lod, v) => person(mb, P, v, "spectator"),
  spectator_group: (mb, P, lod, v) => { for (let k = 0; k < 5; k++) { mb.at(Math.sin(k * 1.9) * 0.9, 0, Math.cos(k * 2.3) * 0.5 - 0.2, 0, hs(k, v) * 0.8 - 0.4, 0, 1, 0.92 + 0.14 * hs(k, 9)); person(mb, P, v * 2 + k, "spectator"); mb.pop(); } },
  car_parked: (mb, P, lod, v) => {
    const cols = [[0.75, 0.08, 0.08], [0.15, 0.25, 0.6], [0.88, 0.88, 0.86], [0.12, 0.35, 0.25]];
    const c = cols[v % cols.length];
    mb.cellName("white");
    mb.color(...c); mb.at(0, 0.38, 0); mb.box(1.8, 0.62, 4.3); mb.pop();
    mb.color(...c); mb.at(0, 1.0, 0.1); mb.box(1.6, 0.52, 2.2); mb.pop();
    mb.color(0.1, 0.13, 0.16); mb.at(0, 1.02, 0.1); mb.box(1.64, 0.4, 2.0); mb.pop();
    mb.color(0.05, 0.05, 0.05);
    for (const x of [-0.9, 0.9]) for (const z of [-1.3, 1.3]) { mb.at(x, 0.32, z, 0, 0, Math.PI / 2); mb.cyl(0.32, 0.32, 0.22, lod === 0 ? 10 : 6, { cap: true }); mb.pop(); }
  },
  hut: (mb, P, lod) => {
    mb.cellName("planks"); mb.color(0.75, 0.68, 0.55); mb.box(4.2, 2.4, 3.4);
    mb.cellName("metal"); mb.color(0.5, 0.28, 0.2);
    const A = [[-2.4, 2.35, 1.9], [2.4, 2.35, 1.9], [-2.4, 3.5, 0], [2.4, 3.5, 0], [-2.4, 2.35, -1.9], [2.4, 2.35, -1.9]];
    const ids = A.map((p) => mb.vert(p[0], p[1], p[2], 0, 1, 0, p[0] / 5 + 0.5, p[2] / 4 + 0.5));
    mb.i.push(ids[0], ids[1], ids[2], ids[2], ids[1], ids[3], ids[2], ids[3], ids[4], ids[4], ids[3], ids[5]);
    mb.cellName("white"); mb.color(0.25, 0.17, 0.1); mb.at(0, 0, 1.71); mb.box(0.9, 1.9, 0.06); mb.pop();
    mb.color(0.2, 0.28, 0.32); mb.at(1.3, 1.0, 1.71); mb.box(0.7, 0.7, 0.05); mb.pop();
  },
  farm_shed: (mb, P, lod) => {
    mb.cellName("metal"); mb.color(0.62, 0.55, 0.5); mb.box(10, 4.2, 6.5);
    const A = [[-5.2, 4.1, 3.4], [5.2, 4.1, 3.4], [-5.2, 5.9, 0], [5.2, 5.9, 0], [-5.2, 4.1, -3.4], [5.2, 4.1, -3.4]];
    mb.color(0.4, 0.2, 0.15);
    const ids = A.map((p) => mb.vert(p[0], p[1], p[2], 0, 1, 0, p[0] / 12 + 0.5, p[2] / 8 + 0.5));
    mb.i.push(ids[0], ids[1], ids[2], ids[2], ids[1], ids[3], ids[2], ids[3], ids[4], ids[4], ids[3], ids[5]);
    mb.cellName("white"); mb.color(0.18, 0.15, 0.12); mb.at(0, 0, 3.26); mb.box(3.2, 3.2, 0.1); mb.pop();
  },
  bridge_deck: (mb, P, lod) => {
    mb.cellName("planks"); mb.color(0.62, 0.5, 0.36); mb.at(0, -0.13, 0); mb.box(5.4, 0.18, 12); mb.pop();
    mb.cellName("bark_pine"); mb.colorV(P.trunk, 0.8); for (const x of [-2.2, -0.7, 0.7, 2.2]) { mb.at(x, -0.75, 0); mb.box(0.3, 0.55, 12.4); mb.pop(); }
    mb.cellName("metal"); mb.color(0.4, 0.4, 0.42); for (const z of [-5.6, 5.6]) { mb.at(0, -2.4, z); mb.box(4.8, 1.8, 0.5); mb.pop(); }
    mb.cellName("planks"); mb.color(0.55, 0.45, 0.33); for (const x of [-2.55, 2.55]) { mb.at(x, 0.0, 0); mb.box(0.3, 0.16, 12.2); mb.pop(); }
  },
  bridge_rail: (mb, P) => {
    mb.cellName("planks"); mb.color(0.65, 0.52, 0.38);
    for (const z of [-1.4, 1.4]) { mb.at(0, 0, z); mb.cyl(0.08, 0.08, 1.05, 6); mb.pop(); }
    for (const y of [0.55, 0.95]) { mb.at(0, y, 0); mb.box(0.1, 0.1, 3.1, { yBase: false }); mb.pop(); }
  },
  culvert: (mb, P) => { mb.cellName("white"); mb.color(0.6, 0.6, 0.58); mb.at(0, 0.0, 0); mb.box(2.6, 1.4, 0.5); mb.pop(); mb.color(0.07, 0.07, 0.08); mb.at(0, 0.5, 0.26); mb.ellipsoid(0.55, 0.5, 0.01, 8, 4); mb.pop(); },
  sheep: (mb, P, lod, v) => {
    mb.sway(0); mb.cellName("fabric");
    mb.color(0.9, 0.88, 0.8); mb.at(0, 0.58, 0); mb.ellipsoid(0.34, 0.3, 0.55, 8, 5); mb.pop();
    mb.color(0.18, 0.15, 0.13); mb.at(0, 0.7, 0.62); mb.ellipsoid(0.1, 0.12, 0.17, 6, 4); mb.pop();
    mb.color(0.25, 0.2, 0.18); for (const x of [-0.16, 0.16]) for (const z of [-0.35, 0.35]) { mb.at(x, 0, z); mb.cyl(0.035, 0.03, 0.4, 4); mb.pop(); }
  },
  cow: (mb, P, lod, v) => {
    mb.sway(0); mb.cellName("fabric");
    const body = v % 2 ? [0.4, 0.22, 0.12] : [0.1, 0.1, 0.1];
    mb.color(...body); mb.at(0, 1.05, 0); mb.ellipsoid(0.45, 0.42, 0.95, 8, 5); mb.pop();
    if (!(v % 2)) { mb.color(0.92, 0.92, 0.9); mb.at(0.1, 1.15, -0.1); mb.ellipsoid(0.38, 0.32, 0.4, 7, 4); mb.pop(); }
    mb.color(...body); mb.at(0, 1.2, 1.05); mb.ellipsoid(0.2, 0.22, 0.3, 7, 4); mb.pop();
    mb.color(0.15, 0.12, 0.1); for (const x of [-0.25, 0.25]) for (const z of [-0.6, 0.6]) { mb.at(x, 0, z); mb.cyl(0.07, 0.055, 0.75, 5); mb.pop(); }
  },
  cattlegrid: (mb) => { mb.cellName("white"); mb.color(0.08, 0.08, 0.09); mb.at(0, -0.2, 0); mb.box(6.6, 0.2, 3.0); mb.pop(); mb.cellName("metal"); mb.color(0.6, 0.6, 0.62); for (let k = 0; k < 10; k++) { mb.at(0, -0.02, -1.3 + k * 0.29); mb.box(6.6, 0.07, 0.11); mb.pop(); } },
  guardrail: (mb) => {
    mb.cellName("metal"); mb.color(0.72, 0.74, 0.77);
    mb.at(0, 0.52, 0); mb.box(0.1, 0.3, 6.0, { yBase: false }); mb.pop();
    mb.color(0.5, 0.5, 0.52); for (const z of [-2.9, 0, 2.9]) { mb.at(-0.12, 0, z); mb.cyl(0.05, 0.05, 0.8, 5); mb.pop(); }
  },
  tyre_stack: (mb, P, lod, v) => { mb.cellName("white"); for (let k = 0; k < 5; k++) { mb.color(k === 1 && v % 2 ? 0.9 : 0.07, k === 1 && v % 2 ? 0.9 : 0.07, k === 1 && v % 2 ? 0.88 : 0.075); mb.at(0, 0.12 + k * 0.24, 0); mb.torus(0.3, 0.12, lod === 0 ? 14 : 8, 6); mb.pop(); } },
  flag: (mb, P, lod, v) => {
    mb.sway(0); mb.cellName("metal"); mb.color(0.7, 0.7, 0.72); mb.cyl(0.03, 0.025, 4.2, 6, { tile: 4 });
    mb.cellName("white"); const cols = [[0.85, 0.12, 0.1], [0.95, 0.8, 0.1], [0.12, 0.3, 0.7]]; mb.color(...cols[v % 3]);
    const b = mb.p.length / 3;
    for (let c = 0; c <= 6; c++) for (let r = 0; r <= 1; r++) mb.vert(0.04 + c * 0.22, 3.55 + r * 0.7, 0, 0, 0, 1, c / 6, r, c / 6 * 0.9);
    for (let c = 0; c < 6; c++) { const a = b + c * 2; mb.quadIdx(a, a + 2, a + 1, a + 3); }
  },
  tent: (mb, P, lod, v) => {
    const cols = [[0.92, 0.92, 0.9], [0.8, 0.12, 0.1], [0.15, 0.3, 0.65]]; const c = cols[v % 3];
    mb.cellName("fabric"); mb.color(...c); mb.box(4.0, 2.0, 4.0);
    const A = [[-2.1, 2.0, -2.1], [2.1, 2.0, -2.1], [2.1, 2.0, 2.1], [-2.1, 2.0, 2.1], [0, 3.4, 0]];
    const ids = A.map((p) => mb.vert(p[0], p[1], p[2], 0, 0.7, 0, p[0] / 5 + 0.5, p[2] / 5 + 0.5));
    mb.i.push(ids[0], ids[4], ids[1], ids[1], ids[4], ids[2], ids[2], ids[4], ids[3], ids[3], ids[4], ids[0]);
    mb.cellName("white"); mb.color(0.1, 0.1, 0.12); mb.at(0, 0, 2.01); mb.box(1.0, 1.5, 0.04); mb.pop();
  },
  banner_arch: (mb, P, lod, v) => {
    mb.sway(0); mb.cellName("fabric");
    mb.color(0.9, 0.12, 0.1); for (const x of [-5.4, 5.4]) { mb.at(x, 0, 0); mb.cyl(0.55, 0.5, 5.2, 10, { cap: true }); mb.pop(); }
    mb.at(0, 5.2, 0, 0, 0, Math.PI / 2); mb.cyl(0.55, 0.55, 10.8, 10, { cap: true }); mb.pop();
    mb.cellName("white");
    for (let k = 0; k < 18; k++) { const wc = k % 2 ? 0.08 : 0.96; mb.color(wc, wc, wc); mb.at(-5.1 + k * 0.6 + 0.3, 4.3, 0.57); mb.box(0.6, 0.75, 0.02, { yBase: false }); mb.pop(); }
    mb.color(0.97, 0.78, 0.05); mb.at(0, 5.2, 0.55); mb.box(7.5, 0.28, 0.02, { yBase: false }); mb.pop();
  },
  steam_vent: (mb, P, lod, v) => {
    mb.cellName("gnd_limestone"); mb.color(0.95, 0.9, 0.7);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; mb.at(Math.sin(a) * 0.9, 0.12, Math.cos(a) * 0.9, 0, a, 0); mb.rock(0.5, 0.25, 0.4, k + v, 0, 0.3); mb.pop(); }
    mb.cellName("white"); mb.color(0.62, 0.58, 0.25); mb.at(0, 0.02, 0); mb.ellipsoid(1.1, 0.06, 1.1, 8, 2); mb.pop();
    mb.color(0.02, 0.02, 0.02); mb.at(0, 0.09, 0); mb.ellipsoid(0.45, 0.02, 0.45, 8, 2); mb.pop();
  },
  waterfall: (mb) => { /* geometry from the dedicated animated mesh; keep rocks only */ mb.cellName("gnd_moss_rock"); mb.color(0.7, 0.75, 0.7); mb.at(0, 0.5, 0.6); mb.rock(2.4, 1.0, 1.2, 4, 1, 0.3); mb.pop(); },
};

function fallbackBox(mb) { mb.cellName("white"); mb.color(0.9, 0.2, 0.9); mb.box(1, 1, 1); }

// ---------------------------------------------------------------- scenery system
export function createScenery(THREE, { SU, textures, getCfg }) {
  const group = new THREE.Group();
  group.name = "scenery";
  let atlas = null, mat = null;
  let stage = null, P = null;
  const meshes = new Map(); // key -> { mesh, kind, lod, tri, cap }
  // baked-style ambient occlusion: soft dark blobs on the ground under trees and rocks (one instanced draw call)
  const AO_MAX = 1400;
  const AO_R = { pine: 2.6, redwood: 5.5, beech: 3.4, kauri: 4.2, macrocarpa: 4, pohutukawa: 3.6, boulder: 1.9, limestone: 2.6, schist: 3.2, tree_fern: 1.8, cabbage_tree: 1.2, stump: 0.9, log: 1.8 };
  const aoGeo = new THREE.PlaneGeometry(2, 2); aoGeo.rotateX(-Math.PI / 2);
  const aoMesh = new THREE.InstancedMesh(aoGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: "varying vec2 vU; void main(){ vU = position.xz; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }",
    fragmentShader: "precision highp float; varying vec2 vU; void main(){ float r = length(vU); float a = smoothstep(1.0, 0.1, r) * 0.42; if (a < 0.01) discard; gl_FragColor = vec4(0.02, 0.025, 0.02, a); }",
  }), AO_MAX);
  aoMesh.frustumCulled = false; aoMesh.count = 0; aoMesh.visible = false; aoMesh.renderOrder = 1;
  aoMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(aoMesh);
  const geomCache = new Map();
  const cell = 64;
  let cellMap = new Map();
  let X, Y, Z, R, S, K, Vv, LN, WD, kinds = [], kindIndex = new Map();
  let lastBuild = { x: 1e9, z: 1e9, yaw: 9, t: -9 };
  const cullStats = { instances: 0, triangles: 0, meshes: 0 };
  const vents = { mesh: null, uniforms: null, list: [] };
  const falls = [];
  const m4 = new THREE.Matrix4();
  const colTmp = new THREE.Color();

  const SPAN = { fence_wire: { l: 1 }, tape_barrier: { l: 6 }, guardrail: { l: 6 }, bridge_rail: { l: 3 }, bridge_deck: { w: 5.4, l: 12 }, cattlegrid: { w: 6.6, l: 3.0 }, culvert: { w: 2.6 }, banner_arch: { w: 10.8 } };
  const VARIANTS = { pine: 2, redwood: 2, beech: 2, macrocarpa: 2, pohutukawa: 2, kauri: 1, boulder: 2, limestone: 2, schist: 2, spectator: 8, spectator_group: 4, car_parked: 3, haybale: 2, cow: 2, flag: 3, tent: 3, tyre_stack: 2, tree_fern: 2, cabbage_tree: 2, flax: 2, tussock: 2, fern: 2, toetoe: 1 };

  function geometryFor(kind, v, lod) {
    const key = kind + "|" + v + "|" + lod;
    if (geomCache.has(key)) return geomCache.get(key);
    const mb = new MB(THREE);
    mb.seed = v;
    try { (BUILD[kind] ?? fallbackBox)(mb, P, lod, v); } catch (e) { console.error("scenery build failed", kind, e); mb.p = []; mb.n = []; mb.u = []; mb.c = []; mb.s = []; mb.i = []; fallbackBox(mb); }
    const g = mb.toGeometry();
    g.userData.tris = mb.i.length / 3;
    geomCache.set(key, g);
    return g;
  }

  /** Dense render-only undergrowth beside the road (ferns, flax, tussock, tufts); the stage's own props are untouched. */
  const COVER = {
    pasture: [["grass_tuft", 5, 1.0, 1.7], ["flax", 1, 0.8, 1.3]],
    redwood: [["fern", 6, 0.9, 1.6], ["grass_tuft", 1, 0.8, 1.2]],
    coast: [["flax", 3, 0.8, 1.4], ["grass_tuft", 4, 1, 1.6], ["toetoe", 1, 0.8, 1.2]],
    tussock: [["tussock", 4, 0.8, 1.4], ["grass_tuft", 3, 1, 1.5]],
    alpine: [["tussock", 3, 0.6, 1.0], ["grass_tuft", 1, 0.7, 1.0]],
    rainforest: [["fern", 7, 1.0, 1.9], ["shrub", 1, 0.7, 1.1]],
  };
  function groundCover(st, biome) {
    const tbl = COVER[biome];
    if (!tbl || !st.px || !st.N) return [];
    const out = [];
    let wsum = 0; for (const t of tbl) wsum += t[1];
    const step = Math.max(2, Math.round(2.0 / (st.ds || 1)));
    const mAlpine = biome === "alpine" ? 0.5 : 1;
    for (let i = 2; i < st.N - 2; i += step) {
      for (let side = -1; side <= 1; side += 2) for (let k = 0; k < 5; k++) {
        const id = i * 12 + (side > 0 ? 6 : 0) + k;
        if (hs(id, 71) > 0.8 * mAlpine) continue;
        const tx = st.px[i + 1] - st.px[i - 1], tz = st.pz[i + 1] - st.pz[i - 1], tl = Math.hypot(tx, tz) || 1;
        const nx = -tz / tl, nz = tx / tl;
        const hw = Math.max(1.5, st.width[i] * 0.5);
        const lat = side * (hw + 1.0 + Math.pow(hs(id, 72), 1.5) * 13);
        const x = st.px[i] + nx * lat + (hs(id, 73) - 0.5) * 2.0, z = st.pz[i] + nz * lat + (hs(id, 74) - 0.5) * 2.0;
        const y = st.heightAt(x, z);
        if (!(y > (st.seaLevel ?? 0) + 0.35)) continue;
        let r = hs(id, 75) * wsum, pick = tbl[0];
        for (const t of tbl) { if (r < t[1]) { pick = t; break; } r -= t[1]; }
        out.push({ kind: pick[0], x, y, z, rot: hs(id, 76) * TAU, scale: pick[2] + hs(id, 77) * (pick[3] - pick[2]), variant: (hs(id, 78) * 4) | 0 });
      }
    }
    return out;
  }

  function ensureMesh(kind, v, lod, cap) {
    const key = kind + "|" + v + "|" + lod;
    let e = meshes.get(key);
    if (e) { if (cap > e.cap) { /* capacity is fixed at creation from total count */ } return e; }
    const g = geometryFor(kind, v, lod);
    const mesh = new THREE.InstancedMesh(g, mat, cap);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    const t = PROP_TABLE[kind] ?? PROP_TABLE.boulder;
    mesh.castShadow = !!t.cast && getCfg().shadows && lod === 0;
    mesh.receiveShadow = true;
    group.add(mesh);
    e = { mesh, kind, lod, tri: g.userData.tris, cap, key, nS: 0 };
    if (mesh.castShadow) {
      // shadow passes draw fewer instances: near cascade = the near-ring prefix, far cascade = trees only (keeps tris in budget)
      const ent = e, treeLike = t.dens === "tree";
      let saved = 0;
      mesh.onBeforeShadow = (r, o, cam, shCam) => { saved = mesh.count; mesh.count = shCam.userData.far ? (treeLike ? saved : 0) : Math.min(saved, ent.nS); };
      mesh.onAfterShadow = () => { mesh.count = saved; };
    }
    meshes.set(key, e);
    return e;
  }

  const api = {
    group,
    get stats() { return cullStats; },
    async setStage(st, palette) {
      api.disposeStage();
      stage = st;
      const cfg = getCfg();
      P = paletteFor(THREE, palette ?? st.def.palette);
      atlas = buildPropAtlas(THREE, textures, { cell: cfg.texScale < 1 ? 256 : 512, anisotropy: cfg.anisotropy });
      mat = createPropMaterial(THREE, atlas, SU, { alphaToCoverage: cfg.alphaToCoverage });
      const props = (st.props ?? []).concat(groundCover(st, st.def.biome));
      const n = props.length;
      X = new Float32Array(n); Y = new Float32Array(n); Z = new Float32Array(n); R = new Float32Array(n); S = new Float32Array(n);
      K = new Uint8Array(n); Vv = new Uint8Array(n); LN = new Float32Array(n); WD = new Float32Array(n);
      kinds = []; kindIndex = new Map();
      const keys = [];
      for (let i = 0; i < n; i++) {
        const p = props[i];
        let ki = kindIndex.get(p.kind);
        if (ki === undefined) { ki = kinds.length; kinds.push(p.kind); kindIndex.set(p.kind, ki); }
        X[i] = p.x; Y[i] = p.y; Z[i] = p.z; R[i] = p.rot ?? 0; S[i] = p.scale ?? 1; K[i] = ki; Vv[i] = (p.variant ?? 0) | 0; LN[i] = p.len ?? 0; WD[i] = p.w ?? 0;
        keys.push(((Math.floor(p.x / cell) + 4096) * 8192 + (Math.floor(p.z / cell) + 4096)));
      }
      cellMap = new Map();
      for (let i = 0; i < n; i++) { const k = keys[i]; let a = cellMap.get(k); if (!a) { a = []; cellMap.set(k, a); } a.push(i); }
      for (const [k, a] of cellMap) cellMap.set(k, Int32Array.from(a));
      // per kind-variant counts -> mesh capacity
      const counts = new Map();
      for (let i = 0; i < n; i++) {
        const kind = kinds[K[i]], nv = VARIANTS[kind] ?? 1;
        const key = kind + "|" + (Vv[i] % nv);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      api._counts = counts;
      // steam vents and waterfalls
      setupVents(props);
      setupFalls(props);
      lastBuild.x = 1e9;
    },
    /** rebuild the visible instance sets when the camera moved enough. */
    update(camera, time, force = false) {
      if (!stage) return;
      const cfg = getCfg();
      const cx = camera.position.x, cz = camera.position.z;
      camera.getWorldDirection(fwdTmp);
      const yaw = Math.atan2(fwdTmp.x, fwdTmp.z);
      const dx = cx - lastBuild.x, dz = cz - lastBuild.z;
      let dyaw = Math.abs(yaw - lastBuild.yaw); if (dyaw > Math.PI) dyaw = TAU - dyaw;
      if (!force && dx * dx + dz * dz < 25 && dyaw < 0.07 && time - lastBuild.t < 0.5) { updateVents(time, camera); return; }
      lastBuild.x = cx; lastBuild.z = cz; lastBuild.yaw = yaw; lastBuild.t = time;
      rebuild(camera, cfg);
      updateVents(time, camera);
    },
    disposeStage() {
      for (const e of meshes.values()) { group.remove(e.mesh); e.mesh.dispose(); }
      meshes.clear();
      for (const g of geomCache.values()) g.dispose();
      geomCache.clear();
      if (vents.mesh) { group.remove(vents.mesh); vents.mesh.geometry.dispose(); vents.mesh.material.dispose(); vents.mesh = null; }
      for (const f of falls) { group.remove(f); f.geometry.dispose(); f.material.dispose(); }
      falls.length = 0;
      atlas?.dispose(); mat?.dispose(); atlas = mat = null; stage = null; cellMap = new Map();
    },
    refreshQuality() {
      if (!stage) return;
      const st = stage;
      api.setStage(st);
    },
    dispose() { api.disposeStage(); },
    kindsPresent() { return kinds.slice(); },
  };

  const fwdTmp = new THREE.Vector3();
  const counters = new Map();

  function rebuild(camera, cfg) {
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const f = fwdTmp;
    const fx = f.x, fz = f.z, fl = Math.hypot(fx, fz) || 1, nfx = fx / fl, nfz = fz / fl;
    const hfov = Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
    const cosLim = Math.cos(Math.min(2.5, hfov + 0.5));
    const dm = cfg.distMul;
    let maxR = 0;
    for (const k of kinds) maxR = Math.max(maxR, (PROP_TABLE[k] ?? PROP_TABLE.boulder).max * dm);
    maxR = Math.min(maxR, getCfg().viewDist);
    const cr = Math.ceil(maxR / cell) + 1;
    const ccx = Math.floor(cx / cell), ccz = Math.floor(cz / cell);
    for (const e of meshes.values()) { e.n = 0; e.nS = 0; }
    let aoN = 0;
    let crossed = false;
    let total = 0;
    const budget = cfg.maxPropInstances;
    const dens = cfg.density;
    // ring order: near cells first
    const order = [];
    for (let dz = -cr; dz <= cr; dz++) for (let dx = -cr; dx <= cr; dx++) {
      const d2 = dx * dx + dz * dz;
      if (d2 <= cr * cr) order.push([d2, dx, dz]);
    }
    order.sort((a, b) => a[0] - b[0]);
    const swMat = m4.elements;
    for (let oi = 0; oi < order.length && total < budget; oi++) {
      const [, dx, dz] = order[oi];
      if (!crossed && Math.sqrt(order[oi][0]) * cell > 80) { crossed = true; for (const e of meshes.values()) e.nS = e.n; }
      const arr = cellMap.get((ccx + dx + 4096) * 8192 + (ccz + dz + 4096));
      if (!arr) continue;
      for (let a = 0; a < arr.length; a++) {
        const i = arr[a];
        const kind = kinds[K[i]];
        const ex = X[i] - cx, ez = Z[i] - cz;
        const d2 = ex * ex + ez * ez;
        const tbl = PROP_TABLE[kind] ?? PROP_TABLE.boulder;
        const mx = tbl.max * dm;
        if (d2 > mx * mx) continue;
        const d = Math.sqrt(d2);
        if (!keepProp(i, kind, dens)) continue;
        // frustum-ish cone cull (always keep near props: they cast shadows / are about to be seen)
        if (d > 70) {
          const cosA = (ex * nfx + ez * nfz) / d;
          if (cosA < cosLim) continue;
        }
        const lod = propLod(kind, d, dm);
        if (lod < 0) continue;
        const nv = VARIANTS[kind] ?? 1, v = Vv[i] % nv;
        const key = kind + "|" + v + "|" + lod;
        let e = meshes.get(key);
        if (!e) {
          const cnt = api._counts.get(kind + "|" + v) ?? 1;
          e = ensureMesh(kind, v, lod, cnt);
          e.n = 0;
        }
        if (e.n >= e.cap) continue;
        // matrix: T * Ry(rot) * S (non-uniform jitter for variety)
        const s = S[i], h1 = hs(i, 5), h2 = hs(i, 6);
        const sy = s * (tbl.dens === "tree" ? 0.9 + 0.25 * h1 : kind === "boulder" || kind === "limestone" || kind === "schist" ? 0.8 + 0.4 * h1 : 1);
        const sxz = s * (tbl.dens === "tree" ? 0.9 + 0.2 * h2 : kind === "boulder" || kind === "limestone" || kind === "schist" ? 0.85 + 0.35 * h2 : 1);
        let sxx = sxz, szz = sxz;
        const sp = SPAN[kind];
        if (sp) { const sc = S[i]; sxx = sp.w && WD[i] ? (WD[i] / sp.w) * sc : sc; szz = sp.l && LN[i] ? (LN[i] / sp.l) * sc : sc; }
        const c = Math.cos(R[i]), sn = Math.sin(R[i]);
        const o = e.n * 16, ar = e.mesh.instanceMatrix.array;
        ar[o] = c * sxx; ar[o + 1] = 0; ar[o + 2] = -sn * sxx; ar[o + 3] = 0;
        const ln = tbl.dens === "tree" ? (hs(i, 12) - 0.5) * 0.14 : 0, ln2 = tbl.dens === "tree" ? (hs(i, 13) - 0.5) * 0.14 : 0;
        ar[o + 4] = ln * sy; ar[o + 5] = sy; ar[o + 6] = ln2 * sy; ar[o + 7] = 0;
        ar[o + 8] = sn * szz; ar[o + 9] = 0; ar[o + 10] = c * szz; ar[o + 11] = 0;
        ar[o + 12] = X[i]; ar[o + 13] = Y[i] - 0.04; ar[o + 14] = Z[i]; ar[o + 15] = 1;
        const tint = tbl.dens === "tree" ? 0.78 + 0.44 * hs(i, 9) : 0.86 + 0.28 * hs(i, 9);
        const ca = e.mesh.instanceColor.array, oc = e.n * 3;
        const hue = tbl.dens === "tree" ? 0.12 : 0.06; ca[oc] = tint * (1 - hue / 2 + hue * hs(i, 10)); ca[oc + 1] = tint; ca[oc + 2] = tint * (1 - hue / 2 + hue * hs(i, 11) * 0.8);
        e.n++;
        if (aoN < AO_MAX && d < 75 && AO_R[kind]) { const r = AO_R[kind] * S[i] * (0.9 + 0.3 * hs(i, 14)), ao = aoMesh.instanceMatrix.array, q = aoN * 16; ao[q] = r; ao[q + 1] = 0; ao[q + 2] = 0; ao[q + 3] = 0; ao[q + 4] = 0; ao[q + 5] = 1; ao[q + 6] = 0; ao[q + 7] = 0; ao[q + 8] = 0; ao[q + 9] = 0; ao[q + 10] = r; ao[q + 11] = 0; ao[q + 12] = X[i]; ao[q + 13] = Y[i] + 0.05; ao[q + 14] = Z[i]; ao[q + 15] = 1; aoN++; }
        total++;
      }
    }
    let tris = 0, ms = 0;
    for (const e of meshes.values()) {
      e.mesh.count = e.n;
      if (!crossed) e.nS = e.n;
      e.mesh.visible = e.n > 0;
      if (e.n > 0) {
        ms++;
        tris += e.n * e.tri;
        const im = e.mesh.instanceMatrix; im.clearUpdateRanges?.(); im.addUpdateRange?.(0, e.n * 16); im.needsUpdate = true;
        const ic = e.mesh.instanceColor; ic.clearUpdateRanges?.(); ic.addUpdateRange?.(0, e.n * 3); ic.needsUpdate = true;
      }
    }
    aoMesh.count = aoN; aoMesh.visible = aoN > 0; aoMesh.instanceMatrix.needsUpdate = true;
    cullStats.instances = total; cullStats.triangles = tris; cullStats.meshes = ms;
  }

  // ---- steam vents: one draw call of rising, expanding soft sprites for all vents
  function setupVents(props) {
    const list = props.filter((p) => p.kind === "steam_vent");
    vents.list = list;
    if (!list.length) return;
    const per = 14, nq = Math.min(list.length, 40) * per;
    const pos = new Float32Array(nq * 4 * 3), seed = new Float32Array(nq * 4 * 4), corner = new Float32Array(nq * 4 * 2), idx = new Uint32Array(nq * 6);
    const cr = [-1, -1, 1, -1, -1, 1, 1, 1];
    for (let v = 0; v < Math.min(list.length, 40); v++) for (let k = 0; k < per; k++) {
      const q = v * per + k;
      for (let c = 0; c < 4; c++) {
        const o = q * 4 + c;
        pos[o * 3] = list[v].x; pos[o * 3 + 1] = list[v].y; pos[o * 3 + 2] = list[v].z;
        seed[o * 4] = k / per + hs(q, 1) * 0.07; seed[o * 4 + 1] = hs(q, 2); seed[o * 4 + 2] = hs(q, 3); seed[o * 4 + 3] = list[v].scale ?? 1;
        corner[o * 2] = cr[c * 2]; corner[o * 2 + 1] = cr[c * 2 + 1];
      }
      const b = q * 4; idx.set([b, b + 1, b + 2, b + 2, b + 1, b + 3], q * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    g.setAttribute("aCorner", new THREE.BufferAttribute(corner, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const u = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(0.8, 0.5) }, uLight: { value: new THREE.Color(1, 1, 1) }, uWindAmp: SU.uWindAmp };
    vents.uniforms = u;
    const m = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, fog: false,
      vertexShader: /* glsl */ `attribute vec4 aSeed; attribute vec2 aCorner; uniform float uTime; uniform vec2 uWind; uniform float uWindAmp;
        varying vec2 vC; varying float vA; varying float vH;
        void main(){
          float ph = fract(uTime * (0.16 + aSeed.y * 0.06) + aSeed.x);
          float h = ph * (7.0 + 5.0 * aSeed.z) * aSeed.w;
          vec3 p = position + vec3(uWind.x, 0.0, uWind.y) * (h * h * 0.045 * (0.6 + uWindAmp)) + vec3(sin(aSeed.z * 20.0 + ph * 3.0) * 0.4, h + 0.2, cos(aSeed.y * 20.0 + ph * 3.0) * 0.4);
          float s = (0.7 + ph * 3.8) * aSeed.w;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 wp = p + (right * aCorner.x + up * aCorner.y) * s;
          vC = aCorner; vA = (1.0 - ph) * smoothstep(0.0, 0.08, ph); vH = ph;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */ `precision highp float; varying vec2 vC; varying float vA; varying float vH; uniform vec3 uLight;
        void main(){ float r = length(vC); float a = smoothstep(1.0, 0.0, r); a = a * a * vA * 0.38; if (a < 0.004) discard; gl_FragColor = vec4(mix(vec3(0.98), vec3(0.8, 0.84, 0.88), vH) * uLight, a); }`,
    });
    vents.mesh = new THREE.Mesh(g, m);
    vents.mesh.frustumCulled = false;
    vents.mesh.renderOrder = 8;
    group.add(vents.mesh);
  }
  function updateVents(time) { if (vents.uniforms) vents.uniforms.uTime.value = time; }

  // ---- waterfalls: animated streaking sheet + foam
  function setupFalls(props) {
    for (const p of props) {
      if (p.kind !== "waterfall") continue;
      const w = (p.w ?? 3.2) * (p.scale ?? 1) * 1.6, h = (p.h ?? 26) * (p.scale ?? 1) * 1.2;
      const g = new THREE.PlaneGeometry(w, h, 1, 1);
      g.translate(0, h / 2, 0);
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
        uniforms: { uTime: SU.uTime, uSeed: { value: hs(Math.floor(p.x * 7 + p.z * 3), 4) * 10 }, uSun: SU.uSunCol, uNight: SU.uNight },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `precision highp float; varying vec2 vUv; uniform float uTime; uniform float uSeed; uniform vec3 uSun; uniform float uNight;
          ${GLSL_NOISE}
          void main(){
            float x = vUv.x, y = vUv.y;
            float edge = smoothstep(0.0, 0.18, x) * smoothstep(1.0, 0.82, x);
            float streak = vnoise(vec2(x * 22.0 + uSeed, y * 2.2 + uTime * 2.4)) * 0.6 + vnoise(vec2(x * 50.0 + uSeed * 2.0, y * 5.0 + uTime * 4.0)) * 0.4;
            float foam = smoothstep(0.18, 0.0, y) * (0.6 + 0.4 * vnoise(vec2(x * 14.0, uTime * 3.0)));
            float a = edge * (0.5 + 0.55 * streak) * smoothstep(1.0, 0.9, y) + foam * 1.4;
            vec3 c = mix(vec3(0.7, 0.78, 0.82), vec3(1.0), streak * 0.8 + foam) * (0.55 + 0.45 * (1.0 - uNight) + 0.15 + 0.55 * uNight);
            gl_FragColor = vec4(c, clamp(a, 0.0, 0.9) * 0.9);
          }`,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(p.x, p.y - 0.5, p.z);
      mesh.rotation.y = p.rot ?? 0;
      mesh.renderOrder = 6;
      group.add(mesh);
      falls.push(mesh);
    }
  }

  return api;
}

export const SCENERY_BUILDERS = Object.keys(BUILD);
export { PROP_KIND_LIST };
