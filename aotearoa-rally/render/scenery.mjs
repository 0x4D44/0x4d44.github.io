// Scenery: procedural geometry for every PROP_KIND, instanced through ONE atlas material,
// streamed from a spatial hash with per-instance distance LOD, culling, density thinning,
// wind sway (vertex shader), steam plumes and waterfalls.
import { createPropMaterial, createRockMaterial, buildPropAtlas, atlasCell, patchCommon, GLSL_NOISE } from "./materials.mjs";
import { BIOME_ROCK } from "./textures.mjs";
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
  card(px, py, pz, dx, dy, dz, sx, sy, sz, w, h, n, droop, swayAmt = 1, rows = 2, taper0 = true) {
    const base = this.p.length / 3;
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const taper = !taper0 ? 1 : t < 0.5 ? 0.45 + t * 1.1 : 1.0 - (t - 0.5) * 0.9; // widest at mid
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
  rock(rx, ry, rz, seed, sub = 1, rough = 0.28, planar = 0, { blocky = 0, strata = 0, facet = 0.18, top = 1, lean = 0 } = {}) {
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
      const yn = v[1], hz = Math.sqrt(Math.max(0, 1 - yn * yn));
      // blocky: pull the rounded profile toward a squared-off column (flat top, near-vertical sides) so tall rocks are not cones
      const sq = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(yn), 4)), 0.25);
      const f = blocky ? 1 + blocky * (Math.min(1.5, sq / Math.max(0.2, hz)) - 1) : 1;
      // strata: horizontal ledges that step the radius in and out with height
      const led = strata ? 1 + strata * 0.16 * (((yn * 3.1 + seed * 0.37) % 1 + 1) % 1 - 0.5) : 1;
      let y = yn * ry * k;
      if (top < 1) y = Math.min(y, ry * top * (0.94 + 0.06 * n2));
      const kk = k * f * led;
      return [v[0] * rx * kk + lean * Math.max(0, y), planar && y < -ry * 0.3 ? -ry * 0.3 * 0 + y * 0.2 : y, v[2] * rz * kk];
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
      const ids = [[A, a], [B, b], [C, c]].map(([P, qi]) => { const uv = uvf(P); const sn = vn[qi]; return this.vert(P[0], P[1], P[2], sn[0] * (1 - facet) + nx * facet, sn[1] * (1 - facet) + ny * facet, sn[2] * (1 - facet) + nz * facet, uv[0], uv[1]); });
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
  const { H, trunkH, trunkR, crownR, crownY, clusters, cardSize, lean = 0, tint = 1, bark = "bark_beech", cardCell = "foliage_broadleaf", red = 0, limbs = 4, flat = 0.62, stems = 1, spread = 0.72, arch = 0.5, photo = false, greenMix = 0 } = o;
  mb.sway((y) => Math.pow(Math.max(0, y / H), 1.5));
  const R = (k, q = 0) => hs(k * 17 + q, v + 41);
  // every crown cluster sits on a branch: collect anchors while the branches are built, then hang foliage on them
  const anchors = [];
  const nst = lod === 2 ? 1 : stems;
  const cx0 = lean, cz0 = lean * 0.5; // crown centre (xz)
  for (let st = 0; st < nst; st++) {
    const sa = (st / nst) * TAU + v * 2.1, so = st === 0 ? 0 : 0.5 + 0.6 * R(st, 1);
    const bx = Math.sin(sa) * so * 0.5, bz = Math.cos(sa) * so * 0.5;
    const fh = trunkH * (st === 0 ? 1 : 0.7 + 0.3 * R(st, 2)); // fork height
    const fx = bx + lean * (st === 0 ? 1 : 1.2) + Math.sin(sa) * so * 0.35, fz = bz + lean * 0.5 * (st === 0 ? 1 : 1.2) + Math.cos(sa) * so * 0.35;
    mb.cellName(bark).colorV(P.trunk, st === 0 ? 1 : 0.92);
    mb.limb([[bx, 0, bz], [bx + (fx - bx) * 0.35 + (R(st, 3) - 0.5) * 0.3, fh * 0.45, bz + (fz - bz) * 0.35], [fx, fh, fz]], trunkR * (st === 0 ? 1 : 0.72), trunkR * (st === 0 ? 0.62 : 0.5), lod === 0 ? 8 : 5, { tile: 2.4, flare: 0.7 });
    const nl = lod === 2 ? 0 : Math.max(3, Math.ceil(limbs / nst));
    for (let j = 0; j < nl; j++) {
      const az = (j / nl) * TAU + sa + R(j, 4) * 0.9;
      const reach = crownR * (spread * (0.7 + 0.45 * R(j, 5)));
      const top = Math.max(fh + 0.6, crownY + crownR * flat * (R(j, 6) * 0.9 - 0.25));
      const ex = cx0 + Math.sin(az) * reach, ez = cz0 + Math.cos(az) * reach;
      // control points: leave the fork rising, then arch outward
      const m1 = [fx + (ex - fx) * 0.22, fh + (top - fh) * (0.45 + 0.4 * arch), fz + (ez - fz) * 0.22];
      const m2 = [fx + (ex - fx) * 0.62, fh + (top - fh) * (0.85 + 0.15 * arch) + 0.25, fz + (ez - fz) * 0.62];
      const pts = [[fx, fh, fz], m1, m2, [ex, top, ez]];
      mb.cellName(bark).colorV(P.trunk, 0.95);
      mb.limb(pts, trunkR * 0.46, trunkR * 0.1, lod === 0 ? 5 : 4, { tile: lod === 0 ? 2.2 : 3.2 });
      for (const t of [0.34, 0.5, 0.64, 0.78, 0.9, 1.0]) {
        const u = 1 - t, c = [u * u * u * pts[0][0] + 3 * u * u * t * pts[1][0] + 3 * u * t * t * pts[2][0] + t * t * t * pts[3][0], u * u * u * pts[0][1] + 3 * u * u * t * pts[1][1] + 3 * u * t * t * pts[2][1] + t * t * t * pts[3][1], u * u * u * pts[0][2] + 3 * u * u * t * pts[1][2] + 3 * u * t * t * pts[2][2] + t * t * t * pts[3][2]];
        anchors.push(c);
      }
    }
  }
  if (lod === 2 || !anchors.length) { // never reached for lod 2 in practice (blobTree), but keep a sane fallback
    anchors.push([cx0, crownY, cz0]);
  }
  mb.cellName(cardCell);
  const per = lod === 0 ? 3 : 2;
  const want = lod === 0 ? clusters : Math.ceil(clusters * 0.45);
  const nCl = Math.min(anchors.length, want);
  const stride = anchors.length / nCl;
  for (let k = 0; k < nCl; k++) {
    const an = anchors[Math.min(anchors.length - 1, Math.floor(k * stride))];
    const cx = an[0] + (R(k, 7) - 0.5) * cardSize * 0.5, cy = an[1] + (R(k, 8) - 0.3) * cardSize * 0.5, cz = an[2] + (R(k, 9) - 0.5) * cardSize * 0.5;
    const ox = cx - cx0, oz = cz - cz0, ol = Math.hypot(ox, oz) || 1;
    const hgt = Math.max(-1, Math.min(1, (cy - crownY) / (crownR * flat + 0.01)));
    const nn0 = [ox / ol * 0.7, 0.55 + 0.3 * hgt, oz / ol * 0.7], nl0 = Math.hypot(...nn0);
    const nn = [nn0[0] / nl0, nn0[1] / nl0, nn0[2] / nl0];
    const outward = Math.min(1, ol / (crownR * spread + 0.01));
    for (let q = 0; q < per; q++) {
      const az = Math.atan2(ox, oz) + (R(k * 5 + q, 10) - 0.5) * 3.4, tilt = -0.15 + R(k * 7 + q, 11) * 0.75;
      const dx = Math.sin(az) * Math.cos(tilt), dz = Math.cos(az) * Math.cos(tilt), dy = Math.sin(tilt);
      const sz = cardSize * (lod === 0 ? 1.45 : 2.1) * (0.8 + R(k, q + 12) * 0.5);
      const isRed = red && R(k * 3 + q, 13) < red;
      const leafy = photo && R(k * 5 + q, 21) < greenMix; // dense dark-green crown cards between the flowering ones
      if (photo) mb.cellName(leafy ? "foliage_broadleaf" : cardCell);
      if (leafy) mb.colorV(R(k, q + 3) < 0.5 ? P.f1 : P.f2, (0.62 + 0.3 * R(k + 9, q)) * (0.7 + 0.25 * outward + 0.2 * hgt));
      else if (photo) { const kk = (0.62 + 0.3 * R(k, q + 3) + 0.18 * hgt) * tint; mb.color(kk, kk, kk * 0.96); }
      else if (isRed) mb.colorV(P.accent, 1.2);
      else mb.colorV(R(k, q + 3) < 0.5 ? P.f1 : P.f2, (0.74 + 0.4 * R(k + 9, q)) * tint * (0.7 + 0.25 * outward + 0.2 * hgt));
      mb.card(cx - dx * sz * 0.45, cy - dy * sz * 0.45, cz - dz * sz * 0.45, dx, dy, dz, dz, 0, -dx, sz, sz, nn, [0, -sz * 0.22, 0], 1, 1, !photo);
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
    mb.cellName(bark).colorV(P.trunkD, stems > 1 ? 1.0 : 0.7);
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
  const { rx, ry, rz, cell, sub, rough, tint = 1, count = 1, cluster = 0.6, mossy = 0, shape = {} } = o;
  mb.cellName(cell);
  const s = lod === 0 ? sub : Math.max(0, sub - 1);
  for (let k = 0; k < count; k++) {
    const a = (k / count) * TAU + v, d = k === 0 ? 0 : cluster * Math.max(rx, rz);
    const sc = k === 0 ? 1 : 0.45 + 0.35 * hs(k, v);
    const tall = k === 0 ? 1 : 0.7 + 0.6 * hs(k, v + 3);
    mb.at(Math.sin(a) * d, ry * sc * 0.25, Math.cos(a) * d, (hs(k, v + 8) - 0.5) * 0.12, hs(k, v) * TAU, (hs(k, v + 9) - 0.5) * 0.12);
    mb.colorV(P.rock, tint * 1.35 * (0.8 + 0.3 * hs(k, v + 4)));
    mb.rock(rx * sc * (0.85 + 0.3 * hs(k, v + 5)), ry * sc * tall, rz * sc * (0.85 + 0.3 * hs(k, v + 6)), v * 7 + k * 3.7, s, rough, 0, { ...shape, lean: (shape.lean ?? 0) * (hs(k, v + 7) - 0.5) * 2 });
    mb.pop();
  }
  if (mossy) { mb.cellName("gnd_moss_rock"); mb.colorV(P.f1d, 1.3); mb.at(0, ry * 0.7, 0); mb.rock(rx * 0.7, ry * 0.4, rz * 0.7, v + 77, 0, 0.2); mb.pop(); }
}

function person(mb, P, v, kind) {
  // variety by variant: clothing, hair/hat, pose (arms down / waving / both up / one up), child scale, backpack
  const jackets = [[0.75, 0.12, 0.1], [0.12, 0.3, 0.7], [0.9, 0.78, 0.12], [0.15, 0.5, 0.3], [0.86, 0.86, 0.84], [0.5, 0.15, 0.5], [0.95, 0.45, 0.1], [0.1, 0.1, 0.12]];
  const trousers = [[0.14, 0.16, 0.3], [0.2, 0.2, 0.22], [0.35, 0.28, 0.2], [0.1, 0.1, 0.12], [0.25, 0.32, 0.45]];
  const skin = [[0.8, 0.58, 0.45], [0.55, 0.38, 0.28], [0.9, 0.7, 0.58], [0.4, 0.27, 0.2], [0.7, 0.5, 0.38]];
  const hairs = [[0.12, 0.08, 0.05], [0.3, 0.2, 0.1], [0.65, 0.5, 0.25], [0.5, 0.5, 0.5], [0.05, 0.05, 0.05]];
  const marshal = kind === "marshal";
  const h1 = (k) => hs(v * 13 + 5, k);
  const sh = marshal ? [0.98, 0.5, 0.04] : jackets[Math.floor(h1(1) * jackets.length)];
  const pants = marshal ? [0.1, 0.12, 0.2] : trousers[Math.floor(h1(2) * trousers.length)];
  const sk = skin[Math.floor(h1(3) * skin.length)];
  const hair = hairs[Math.floor(h1(14) * hairs.length)];
  const child = !marshal && h1(4) > 0.8;
  const pose = marshal ? 5 : Math.floor(h1(5) * 5); // 0,1 arms down; 2 one arm waving; 3 both up; 4 one up, one on hip; 5 marshal (flag arm forward)
  const hat = marshal ? 1 : Math.floor(h1(6) * 4); // 0 hair, 1 cap/helmet, 2 beanie, 3 wide hat
  const wide = 0.92 + 0.16 * h1(15); // shoulder / hip width variation
  mb.at(0, 0, 0, 0, 0, 0, child ? 0.66 : 0.94 + 0.12 * h1(7));
  mb.cellName("fabric");
  mb.sway(0);
  // legs: tapered with a bent knee, shoes
  for (const sd of [-1, 1]) {
    const st = sd * (0.02 + 0.03 * h1(16));
    mb.color(...pants);
    mb.limb([[sd * 0.095 * wide, 0.95, 0], [sd * 0.1 * wide + st, 0.52, 0.02], [sd * 0.1 * wide + st, 0.09, 0.0]], 0.09, 0.058, 6, { tile: 0.45 });
    mb.color(0.08, 0.08, 0.09); mb.at(sd * 0.1 * wide + st, 0.0, 0.05); mb.ellipsoid(0.07, 0.05, 0.13, 6, 3); mb.pop();
  }
  // hips and a tapered torso (narrow waist, broad chest) rather than a straight tube
  mb.color(...pants); mb.at(0, 0.97, 0); mb.ellipsoid(0.185 * wide, 0.1, 0.125, 7, 3); mb.pop();
  mb.color(...sh);
  mb.limb([[0, 0.95, 0], [0, 1.18, 0], [0, 1.42, 0]], 0.158 * wide, 0.2 * wide, 7, { tile: 0.5 });
  mb.at(0, 1.43, 0); mb.ellipsoid(0.225 * wide, 0.085, 0.135, 8, 3); mb.pop(); // shoulders
  if (marshal) { for (const y of [1.0, 1.24]) { mb.color(0.85, 0.88, 0.8); mb.at(0, y, 0); mb.ellipsoid(0.172 * wide, 0.028, 0.14, 8, 2); mb.pop(); } }
  else if (h1(8) > 0.68) { mb.color(...jackets[(Math.floor(h1(9) * 8) + 3) % 8]); mb.at(0, 1.1, -0.15); mb.ellipsoid(0.15, 0.22, 0.09, 6, 3); mb.pop(); } // backpack
  // arms: shoulder -> elbow -> hand, so waving and raised arms read as bent limbs
  const arm = (sd, mode) => {
    const x0 = sd * 0.235 * wide;
    let e, hnd;
    if (mode === 0) { e = [sd * 0.29, 1.15, 0.03]; hnd = [sd * 0.27, 0.92, 0.1]; } // down
    else if (mode === 1) { e = [sd * 0.38, 1.6, 0.0]; hnd = [sd * 0.36, 1.93, 0.02]; } // cheer: up and out
    else if (mode === 2) { e = [sd * 0.4, 1.46, 0.04]; hnd = [sd * 0.3, 1.84, 0.1]; } // waving: forearm up
    else if (mode === 3) { e = [sd * 0.33, 1.18, 0.0]; hnd = [sd * 0.2, 1.0, 0.04]; } // hand on hip
    else { e = [sd * 0.28, 1.2, 0.18]; hnd = [sd * 0.18, 1.38, 0.38]; } // forward (marshal)
    mb.color(...sh); mb.limb([[x0, 1.4, 0], e, hnd], 0.058, 0.045, 5, { tile: 0.45 });
    mb.color(...sk); mb.at(hnd[0], hnd[1], hnd[2]); mb.ellipsoid(0.05, 0.055, 0.05, 5, 3); mb.pop();
  };
  const sdWave = h1(17) > 0.5 ? 1 : -1;
  for (const sd of [-1, 1]) {
    let mode = 0;
    if (pose === 2) mode = sd === sdWave ? 2 : 0;
    else if (pose === 3) mode = 1;
    else if (pose === 4) mode = sd === sdWave ? 1 : 3;
    else if (pose === 5) mode = sd === sdWave ? 4 : 0;
    arm(sd, mode);
  }
  mb.color(...sk); mb.at(0, 1.47, 0); mb.cyl(0.05, 0.055, 0.1, 5, { tile: 3 }); mb.pop();
  mb.color(...sk); mb.at(0, 1.58, 0.005); mb.ellipsoid(0.1, 0.125, 0.112, 8, 5); mb.pop(); // head
  mb.color(...sk); mb.at(0, 1.565, 0.108); mb.ellipsoid(0.02, 0.028, 0.025, 4, 2); mb.pop(); // nose
  if (hat === 1) { mb.color(...(marshal ? [0.95, 0.95, 0.95] : jackets[Math.floor(h1(11) * 8)])); mb.at(0, 1.65, 0); mb.ellipsoid(0.118, 0.075, 0.13, 8, 3); mb.pop(); mb.at(0, 1.63, 0.105); mb.ellipsoid(0.1, 0.012, 0.07, 6, 2); mb.pop(); }
  else if (hat === 2) { mb.color(...jackets[Math.floor(h1(12) * 8)]); mb.at(0, 1.645, -0.005); mb.ellipsoid(0.12, 0.1, 0.125, 8, 4); mb.pop(); mb.at(0, 1.74, -0.005); mb.ellipsoid(0.035, 0.035, 0.035, 5, 2); mb.pop(); }
  else if (hat === 3) { mb.color(0.45, 0.36, 0.22); mb.at(0, 1.665, 0); mb.ellipsoid(0.23, 0.014, 0.23, 9, 2); mb.pop(); mb.at(0, 1.69, 0); mb.ellipsoid(0.105, 0.075, 0.108, 8, 3); mb.pop(); }
  else { mb.color(...hair); mb.at(0, 1.62, -0.018); mb.ellipsoid(0.108, 0.1, 0.12, 8, 3); mb.pop(); if (h1(18) > 0.5) { mb.at(0, 1.55, -0.07); mb.ellipsoid(0.09, 0.12, 0.06, 6, 3); mb.pop(); } }
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
    : broadleaf(mb, P, { H: 30, trunkH: 17, trunkR: 0.85, crownR: 5.5, crownY: 22, clusters: 22, cardSize: 3.3, tint: 0.9, bark: "bark_pine", limbs: 5 }, lod, v),
  macrocarpa: (mb, P, lod, v) => lod === 2 ? blobTree(mb, P, { H: 15, trunkR: 0.55, crownR: 7, crownY: 8, conifer: false }, lod)
    : broadleaf(mb, P, { H: 15, trunkH: 5, trunkR: 0.55, crownR: 7.5, crownY: 9, clusters: 26, cardSize: 3.2, tint: 0.62, bark: "bark_pine", cardCell: "foliage_pine", limbs: 6, lean: 0.4, spread: 0.8, flat: 0.55 }, lod, v),
  beech: (mb, P, lod, v) => lod === 2 ? blobTree(mb, P, { H: 21, trunkR: 0.38, crownR: 6, crownY: 13, conifer: false }, lod)
    : broadleaf(mb, P, { H: 21, trunkH: 9, trunkR: 0.45, crownR: 6.4, crownY: 14, clusters: 24, cardSize: 3.0, tint: 0.95, bark: "bark_beech", limbs: 5 }, lod, v),
  pohutukawa: (mb, P, lod, v) => lod === 2 ? blobTree(mb, P, { H: 10, trunkR: 0.6, crownR: 6.5, crownY: 6, conifer: false }, lod)
    : broadleaf(mb, P, { H: 10, trunkH: 2.4, trunkR: 0.62, crownR: 7.2, crownY: 5.0, clusters: 40, cardSize: 3.4, tint: 0.95, bark: "bark_beech", cardCell: "foliage_pohutukawa", photo: true, greenMix: 0.62, limbs: 8, lean: 1.0, flat: 0.42, stems: 2, spread: 0.85, arch: 0.25 }, lod, v),
  tree_fern: (mb, P, lod, v) => lod === 2 ? (mb.sway(0.4), mb.cellName("white").colorV(P.trunkD, 0.7), mb.cyl(0.12, 0.1, 3.6, 4), mb.colorV(P.f1d, 1), mb.at(0, 3.5, 0), mb.ellipsoid(2, 0.7, 2, 6, 3), mb.pop())
    : palmLike(mb, P, { H: 3.8, headY: 3.8, trunkR: 0.14, fronds: 11, frondL: 2.4, frondW: 1.1, cell: "foliage_fern", tint: 0.95 }, lod, v),
  cabbage_tree: (mb, P, lod, v) => lod === 2 ? (mb.sway(0.4), mb.cellName("white").colorV(P.trunkD, 1), mb.cyl(0.22, 0.14, 5, 4), mb.colorV(P.f2d, 1.05), mb.at(0, 5.6, 0), mb.ellipsoid(1.8, 1.1, 1.8, 6, 3), mb.pop())
    : palmLike(mb, P, { H: 6, headY: 5, trunkR: 0.22, fronds: 24, frondL: 1.9, frondW: 0.62, cell: "foliage_flax", droop: 0.3, bark: "bark_pine", tint: 1.0, stems: 3 }, lod, v),
  flax: (mb, P, lod, v) => bladeClump(mb, P, { n: 16, h: 1.7, w: 0.42, cell: "foliage_flax", spread: 0.55, tint: 1, droop: 0.5 }, lod, v),
  toetoe: (mb, P, lod, v) => { // 3-5 crossed upright alpha cards of the photographed plant; random scale, turn, flip and tint
    mb.sway((y) => Math.min(1, y / 2.4) * 1.1);
    mb.cellName("foliage_toetoe");
    const n = lod === 0 ? 4 : 3;
    for (let k = 0; k < n; k++) {
      const az = (k / n) * Math.PI + (hs(k, v) - 0.5) * 0.5, sc = 0.7 + 0.4 * hs(k, v + 3), flip = hs(k, v + 6) < 0.5 ? -1 : 1;
      const sx = Math.cos(az) * flip, sz = -Math.sin(az) * flip, kk = 0.8 + 0.25 * hs(k, v + 9);
      mb.color(kk, kk * (0.98 + 0.04 * hs(k, v + 2)), kk * 0.92);
      mb.card(0, 0, 0, 0, 1, 0, sx, 0, sz, 3.4 * sc, 3.4 * sc, [Math.sin(az), 0.35, Math.cos(az)], [0.25 * Math.sin(az), 0, 0.25 * Math.cos(az)], 1, 3, false);
    }
  },
  tussock: (mb, P, lod, v) => bladeClump(mb, P, { n: 28, h: 0.95, w: 0.24, cell: "foliage_grass", spread: 0.6, tint: 1.2, droop: 0.55, col2: P.g2, grassy: true }, lod, v),
  grass_tuft: (mb, P, lod, v) => bladeClump(mb, P, { n: 9, h: 0.55, w: 0.28, cell: "foliage_grass", spread: 0.4, tint: 1.1, droop: 0.25, grassy: true }, lod, v),
  fern: (mb, P, lod, v) => bladeClump(mb, P, { n: 9, h: 1.0, w: 0.55, cell: "foliage_fern", spread: 0.8, tint: 0.95, droop: 0.55, flatten: 0.3 }, lod, v),
  shrub: (mb, P, lod, v) => broadleaf(mb, P, { H: 1.6, trunkH: 0.3, trunkR: 0.05, crownR: 0.95, crownY: 0.8, clusters: lod === 0 ? 10 : 5, cardSize: 0.8, tint: 0.95, bark: "bark_beech", limbs: 0 }, lod, v),
  boulder: (mb, P, lod, v) => rockKind(mb, P, { rx: 1.0, ry: 1.0, rz: 0.85, cell: "rock_stage", sub: 3, rough: 0.5, count: 2, cluster: 0.45, shape: { facet: 0.2 } }, lod, v),
  limestone: (mb, P, lod, v) => rockKind(mb, P, { rx: 1.7, ry: 3.0, rz: 1.45, cell: "rock_stage", sub: 2, rough: 0.62, count: 4, cluster: 0.8, tint: 0.85, shape: { blocky: 0.85, strata: 1, facet: 0.55, top: 0.8, lean: 0.25 } }, lod, v),
  schist: (mb, P, lod, v) => rockKind(mb, P, { rx: 1.9, ry: 2.5, rz: 1.6, cell: "rock_stage", sub: 2, rough: 0.6, count: 3, cluster: 0.6, shape: { blocky: 0.45, strata: 0.7, facet: 0.5, top: 0.88 } }, lod, v),
  log: (mb, P) => { mb.cellName("bark_beech").colorV(P.trunk, 0.9); mb.at(0, 0.35, 0, 0, 0, Math.PI / 2); mb.cyl(0.34, 0.3, 4.6, 8, { cap: true }); mb.pop(); mb.cellName("white").color(0.72, 0.6, 0.42); mb.at(-0.0, 0.35, 0, 0, 0, Math.PI / 2); mb.ellipsoid(0.01, 0.01, 0.01, 3, 2); mb.pop(); },
  stump: (mb, P) => { mb.cellName("bark_pine").colorV(P.trunk, 0.9); mb.cyl(0.42, 0.34, 0.65, 9, { cap: true }); mb.cellName("white").color(0.72, 0.6, 0.44); mb.at(0, 0.655, 0); mb.ellipsoid(0.34, 0.01, 0.34, 8, 2); mb.pop(); },
  fence_post: (mb, P) => { mb.cellName("planks").color(0.75, 0.62, 0.45); mb.cyl(0.07, 0.06, 1.25, 6, { tile: 3 }); mb.cellName("white").color(0.55, 0.45, 0.32); mb.at(0, 1.25, 0); mb.ellipsoid(0.06, 0.03, 0.06, 5, 2); mb.pop(); },
  fence_wire: (mb) => { mb.cellName("metal").color(0.5, 0.5, 0.52); for (const y of [0.35, 0.65, 0.95, 1.2]) { const pts = []; for (let k = 0; k <= 4; k++) pts.push([0, y - 0.05 * Math.sin((k / 4) * Math.PI), k / 4 - 0.5]); mb.limb(pts, 0.007, 0.007, 3, { tile: 4 }); } },
  power_pole: (mb, P, lod) => {
    mb.cellName("bark_pine").colorV(P.trunk, 0.8); mb.cyl(0.17, 0.12, 10.5, 7, { tile: 4 });
    mb.cellName("planks").color(0.6, 0.5, 0.38); mb.at(0, 9.6, 0); mb.box(2.4, 0.12, 0.12); mb.pop();
    if (lod === 0) for (const x of [-1.0, 0, 1.0]) { mb.cellName("white").color(0.82, 0.82, 0.8); mb.at(x, 9.72, 0); mb.cyl(0.04, 0.05, 0.22, 5); mb.pop(); } // wires: see setupWires (continuous catenaries between poles)
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
  sheep: (mb, P, lod, v) => { // woolly body of overlapping lumps, dark head and ears, four legs, tail; variants differ in size, tone and head angle
    mb.sway(0); mb.cellName("fabric");
    const sc = 0.9 + 0.2 * hs(v, 3), tone = 0.82 + 0.16 * hs(v, 5), dark = v % 3 === 2;
    mb.at(0, 0, 0, 0, hs(v, 9) * 0.3 - 0.15, 0, sc);
    const wool = (x, y, z, rx, ry, rz, t) => { mb.cellName("wool_fleece"); mb.color(tone * t, tone * t * 0.97, tone * t * 0.9); mb.at(x, y, z); mb.ellipsoid(rx, ry, rz, lod === 0 ? 7 : 5, lod === 0 ? 5 : 3); mb.pop(); };
    wool(0, 0.62, 0, 0.36, 0.33, 0.58, 1.0);
    wool(0.17, 0.7, 0.22, 0.2, 0.2, 0.24, 1.06); wool(-0.17, 0.7, 0.22, 0.2, 0.2, 0.24, 0.98);
    wool(0.17, 0.68, -0.25, 0.2, 0.2, 0.25, 0.95); wool(-0.17, 0.7, -0.25, 0.2, 0.2, 0.25, 1.03);
    wool(0, 0.8, 0, 0.26, 0.17, 0.4, 1.08); wool(0, 0.7, 0.45, 0.22, 0.2, 0.18, 1.0);
    const skin = dark ? [0.1, 0.09, 0.08] : [0.2, 0.17, 0.15];
    mb.cellName("fabric");
    mb.color(...skin);
    mb.at(0, 0.72, 0.66, 0.35 + 0.25 * hs(v, 7), 0, 0); mb.ellipsoid(0.1, 0.13, 0.19, 6, 4); mb.pop(); // head
    for (const sd of [-1, 1]) { mb.at(sd * 0.13, 0.8, 0.62, 0, 0, sd * 0.9); mb.ellipsoid(0.12, 0.03, 0.05, 4, 2); mb.pop(); } // ears
    mb.color(skin[0] * 1.2, skin[1] * 1.2, skin[2] * 1.2);
    for (const x of [-0.17, 0.17]) for (const z of [-0.36, 0.38]) { mb.at(x, 0, z); mb.cyl(0.04, 0.032, 0.42, 5); mb.pop(); }
    wool(0, 0.62, -0.55, 0.1, 0.1, 0.1, 0.9); // tail tuft
    mb.pop();
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
const ringCache = new Map();
/** Cells within radius cr of the camera cell, nearest first, as parallel typed arrays (computed once per radius). */
export function ringOrder(cr) {
  let r = ringCache.get(cr);
  if (r) return r;
  const list = [];
  for (let dz = -cr; dz <= cr; dz++) for (let dx = -cr; dx <= cr; dx++) { const d2 = dx * dx + dz * dz; if (d2 <= cr * cr) list.push([d2, dx, dz]); }
  list.sort((a, b) => a[0] - b[0]);
  r = { n: list.length, d2: Int32Array.from(list, (e) => e[0]), dx: Int32Array.from(list, (e) => e[1]), dz: Int32Array.from(list, (e) => e[2]) };
  ringCache.set(cr, r);
  return r;
}

export function createScenery(THREE, { SU, textures, getCfg }) {
  const group = new THREE.Group();
  group.name = "scenery";
  let atlas = null, mat = null, rockMat = null;
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
  let wires = null;
  const m4 = new THREE.Matrix4();
  const colTmp = new THREE.Color();

  const SPAN = { fence_wire: { l: 1 }, tape_barrier: { l: 6 }, guardrail: { l: 6 }, bridge_rail: { l: 3 }, bridge_deck: { w: 5.4, l: 12 }, cattlegrid: { w: 6.6, l: 3.0 }, culvert: { w: 2.6 }, banner_arch: { w: 10.8 } };
  const VARIANTS = { pine: 2, redwood: 2, beech: 2, macrocarpa: 2, pohutukawa: 2, kauri: 1, boulder: 4, limestone: 3, schist: 3, spectator: 8, spectator_group: 4, car_parked: 3, haybale: 2, cow: 2, sheep: 3, flag: 3, tent: 3, tyre_stack: 2, tree_fern: 2, cabbage_tree: 2, flax: 2, tussock: 2, fern: 2, toetoe: 2 };

  const ROCK_KINDS = new Set(["boulder", "limestone", "schist"]);

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
    const mesh = new THREE.InstancedMesh(g, rockMat && ROCK_KINDS.has(kind) ? rockMat : mat, cap);
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
    /** Placed props (read-only view) for tests: positions and kind names. */
    get propData() { return { n: X ? X.length : 0, X, Y, Z, K, kinds }; },
    async setStage(st, palette) {
      api.disposeStage();
      stage = st;
      const cfg = getCfg();
      P = paletteFor(THREE, palette ?? st.def.palette);
      atlas = buildPropAtlas(THREE, textures, { cell: cfg.texScale < 1 ? 256 : 512, anisotropy: cfg.anisotropy, rock: BIOME_ROCK[st.def.biome] && textures.isReal(BIOME_ROCK[st.def.biome]) ? BIOME_ROCK[st.def.biome] : null });
      mat = createPropMaterial(THREE, atlas, SU, { alphaToCoverage: cfg.alphaToCoverage });
      const rn = BIOME_ROCK[st.def.biome];
      rockMat = rn && textures.isReal(rn) ? createRockMaterial(THREE, textures.get(rn), SU, textures.meters(rn)) : null;
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
      setupWires(props);
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
    /** Build and upload every kind/variant/LOD mesh the stage can show (one dummy instance each) so no first-sight
     *  geometry build or buffer upload lands in a driving frame. Call before the warm-up render. */
    prewarm() {
      if (!stage) return;
      for (const kind of kinds) {
        const nv = VARIANTS[kind] ?? 1, lods = (PROP_TABLE[kind] ?? PROP_TABLE.boulder).lods;
        for (let v = 0; v < nv; v++) {
          const cnt = api._counts.get(kind + "|" + v);
          if (!cnt) continue;
          for (let lod = 0; lod < lods; lod++) { const e = ensureMesh(kind, v, lod, cnt); if (e.n === undefined) e.n = 0; if (!e.mesh.count) { e.mesh.count = 1; e.mesh.visible = true; } }
        }
      }
    },
    disposeStage() {
      for (const e of meshes.values()) { group.remove(e.mesh); e.mesh.dispose(); }
      meshes.clear();
      for (const g of geomCache.values()) g.dispose();
      geomCache.clear();
      if (vents.mesh) { group.remove(vents.mesh); vents.mesh.geometry.dispose(); vents.mesh.material.dispose(); vents.mesh = null; }
      for (const f of falls) { group.remove(f); f.geometry.dispose(); f.material.dispose(); }
      falls.length = 0;
      if (wires) { group.remove(wires); wires.geometry.dispose(); wires.material.dispose(); wires = null; }
      atlas?.dispose(); mat?.dispose(); rockMat?.dispose(); atlas = mat = rockMat = null; stage = null; cellMap = new Map();
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
    const order = ringOrder(cr); // cached per radius: building and sorting thousands of tuples every rebuild was GC churn on the main thread
    const swMat = m4.elements;
    for (let oi = 0; oi < order.n && total < budget; oi++) {
      const dx = order.dx[oi], dz = order.dz[oi];
      if (!crossed && Math.sqrt(order.d2[oi]) * cell > 80) { crossed = true; for (const e of meshes.values()) e.nS = e.n; }
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
        if (kind !== "power_pole" && !keepProp(i, kind, dens)) continue; // poles are never thinned: the wires join them
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


  // ---- power lines: one draw call of continuous catenary ribbons joining the insulators of consecutive poles.
  // Ribbons are expanded in clip space to a fixed pixel width with a soft edge, so they stay a solid anti-aliased line at any distance.
  function setupWires(props) {
    const poles = props.filter((p) => p.kind === "power_pole");
    if (poles.length < 2) return;
    const pos = [], other = [], side = [], idx = [];
    const ins = (p, lx) => { const s = p.scale ?? 1, r = p.rot ?? 0; return [p.x + lx * Math.cos(r) * s, p.y - 0.04 + 9.9 * s, p.z - lx * Math.sin(r) * s]; };
    const push = (a, b, sd) => { pos.push(a[0], a[1], a[2]); other.push(b[0], b[1], b[2]); side.push(sd); };
    for (let i = 0; i + 1 < poles.length; i++) {
      const A = poles[i], B = poles[i + 1];
      const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz);
      if (L < 8 || L > 160) continue; // a different line, or a gap in this one
      const r = A.rot ?? 0, tx = Math.sin(r), tz = Math.cos(r); // pole local +z = line direction
      if (Math.abs(dx * tx + dz * tz) < 0.7 * L) continue;
      for (const lx of [-1, 0, 1]) {
        const a = ins(A, lx), b = ins(B, lx);
        const span = Math.hypot(b[0] - a[0], b[2] - a[2]), sag = Math.min(2.6, span * 0.022);
        const n = Math.max(6, Math.min(16, Math.ceil(span / 5)));
        let prev = null;
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
          if (prev) {
            const base = pos.length / 3;
            push(prev, q, -1); push(prev, q, 1); push(q, prev, 1); push(q, prev, -1);
            idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
          prev = q;
        }
      }
    }
    if (!idx.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aOther", new THREE.Float32BufferAttribute(other, 3));
    g.setAttribute("aSide", new THREE.Float32BufferAttribute(side, 1));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const m = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uRes: { value: new THREE.Vector2(1280, 720) }, uPx: { value: 1.7 }, uCol: { value: new THREE.Color(0.1, 0.1, 0.12) } }]),
      transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `attribute vec3 aOther; attribute float aSide; uniform vec2 uRes; uniform float uPx; varying float vS; varying float vW;
        #include <fog_pars_vertex>
        void main(){
          vec4 c0 = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          vec4 c1 = projectionMatrix * modelViewMatrix * vec4(aOther, 1.0);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vec2 s0 = c0.xy / max(c0.w, 1e-4) * uRes * 0.5, s1 = c1.xy / max(c1.w, 1e-4) * uRes * 0.5;
          vec2 d = s1 - s0; float dl = length(d); d = dl > 1e-4 ? d / dl : vec2(1.0, 0.0);
          vec2 n = vec2(-d.y, d.x);
          float half_ = uPx * 0.5 + 0.75; // half width + one pixel of soft edge
          vec2 off = n * aSide * half_;
          gl_Position = c0; gl_Position.xy += off / (uRes * 0.5) * c0.w;
          vS = aSide * half_ / (uPx * 0.5 + 0.75);
          vW = uPx;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `uniform vec3 uCol; varying float vS; varying float vW;
        #include <fog_pars_fragment>
        void main(){
          float edge = abs(vS), core = (vW * 0.5) / (vW * 0.5 + 0.75);
          float a = 1.0 - smoothstep(core, 1.0, edge);
          if (a < 0.01) discard;
          gl_FragColor = vec4(uCol, a * 0.85);
          #include <fog_fragment>
        }`,
    });
    wires = new THREE.Mesh(g, m);
    wires.frustumCulled = false; wires.renderOrder = 3;
    wires.onBeforeRender = (r) => {
      const t = r.getRenderTarget();
      if (t) m.uniforms.uRes.value.set(t.width, t.height); else r.getDrawingBufferSize(m.uniforms.uRes.value);
    };
    group.add(wires);
  }

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

/** Build one prop geometry outside a stage (tests, tooling). */
export function buildPropGeometry(T, kind, v, lod, palette = {}) {
  const mb = new MB(T); mb.seed = v;
  BUILD[kind](mb, paletteFor(T, palette), lod, v);
  return mb.toGeometry();
}
export const SCENERY_BUILDERS = Object.keys(BUILD);
export { PROP_KIND_LIST };
