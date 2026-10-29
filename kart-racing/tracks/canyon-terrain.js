// Dune Canyon - replacement heightfield: dunes, terraced mesas, carved canyon walls, oasis bowl, baked sun shadows, strata colours.
import * as THREE from "three";
import { LY } from "./canyon.layout.js";

const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash2 = (ix, iz) => { let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const n2 = (x, z, s, o = 0) => vnoise(x / s + o * 17.3, z / s - o * 9.1);
const STRATA = [0xb5532b, 0xcf6d36, 0xe08f4a, 0x9b4328, 0xd9a15f, 0xc25e30, 0xeab270, 0x8a3c26, 0xc9784a, 0xf0c88c];

export function buildCanyonTerrain(track, X, sunDir) {
  const { C, group, wallDist, own, canvas, toTex, noiseFill, rng } = X;
  const { N, ds, px, pz, py, curv } = C;
  const T = X.terrainRect, g0 = X.groundY;
  const CS = 6;
  const nx = Math.floor((T.x1 - T.x0) / CS) + 1, nz = Math.floor((T.z1 - T.z0) / CS) + 1;
  const x0 = T.x0, z0 = T.z0;
  const L = track.length;
  const D0 = wallDist + 0.6;
  const EDGE = wallDist + 3.4, DR = 12;
  const [cA, cB] = LY.canyon, [vA, vB] = LY.trestle;
  const inRange = (s, a, b) => s >= a && s <= b;

  // ---- per-sample properties
  const cw = new Float32Array(N), Wh = new Float32Array(N), calm = new Float32Array(N), via = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const s = i * ds;
    cw[i] = sm(cA, cA + 70, s) * (1 - sm(cB - 70, cB, s));
    let W = 24 + 3 * Math.sin(s * 0.021) + 2 * Math.sin(s * 0.057 + 1);
    W *= 0.68 + 0.32 * sm(0, 170, Math.abs(s - LY.gorgeFloor));
    if (inRange(s, LY.cave[0] - 40, LY.cave[1] + 40)) W = Math.max(W, 25);
    Wh[i] = W;
    const startCalm = s < 140 || s > L - 90 ? 1 : 0;
    const townCalm = inRange(s, LY.town[0] - 40, LY.town[1] + 40) ? 1 : 0;
    calm[i] = Math.max(startCalm, townCalm);
    via[i] = inRange(s, vA, vB) ? 1 : 0;
  }
  // smooth calm
  { const t = new Float32Array(N); for (let p = 0; p < 3; p++) { for (let i = 0; i < N; i++) { let a = 0; for (let k = -15; k <= 15; k++) a += calm[(i + k + N) % N]; t[i] = a / 31; } calm.set(t); } }

  // ---- splat distance fields
  const SZ = nx * nz, BIG = 1e9;
  const dNear = new Float32Array(SZ).fill(BIG), iNear = new Int32Array(SZ).fill(-1);
  const dFar = new Float32Array(SZ).fill(BIG);
  const dCan = new Float32Array(SZ).fill(BIG), iCan = new Int32Array(SZ).fill(-1);
  const rule = new Float32Array(SZ).fill(BIG);
  const splat = (i, R, fn) => {
    const cx = (px[i] - x0) / CS, cz = (pz[i] - z0) / CS, r = Math.ceil(R / CS);
    const ia = Math.max(0, Math.floor(cx - r)), ib = Math.min(nx - 1, Math.ceil(cx + r)), ja = Math.max(0, Math.floor(cz - r)), jb = Math.min(nz - 1, Math.ceil(cz + r));
    for (let j = ja; j <= jb; j++) for (let k = ia; k <= ib; k++) {
      const dx = x0 + k * CS - px[i], dz = z0 + j * CS - pz[i], d = Math.sqrt(dx * dx + dz * dz);
      if (d < R) fn(j * nx + k, d);
    }
  };
  for (let i = 0; i < N; i++) {
    if (!via[i]) splat(i, 70, (q, d) => { if (d < dNear[q]) { dNear[q] = d; iNear[q] = i; } });
    if (cw[i] > 0.02) splat(i, 120, (q, d) => { if (d < dCan[q]) { dCan[q] = d; iCan[q] = i; } });
    const lvl = py[i] - (via[i] ? 3.2 : 0.35), sl = cw[i] > 0.5 ? 2.7 : via[i] ? 1.5 : 0.9;
    splat(i, 55, (q, d) => { const v = lvl + sl * Math.max(0, d - D0 - 2.8); if (v < rule[q]) rule[q] = v; });
    if (i % 6 === 0) splat(i, 200, (q, d) => { if (d < dFar[q]) dFar[q] = d; });
  }

  // ---- oasis + zones
  const gs = X.grandstand ? X.grandstand.side : -1;
  const sp = track.sample(LY.oasisS);
  const oSide = -gs;
  const oasis = { x: sp.pos.x + sp.right.x * oSide * (wallDist + 62), z: sp.pos.z + sp.right.z * oSide * (wallDist + 62), r: 27, y: sp.pos.y - 0.6 };
  X.oasis = oasis;
  const windA = 0.55, wcs = Math.cos(windA), wsn = Math.sin(windA);

  // ---- height
  const H = new Float32Array(SZ), SAND = new Float32Array(SZ);
  for (let j = 0; j < nz; j++) for (let k = 0; k < nx; k++) {
    const q = j * nx + k, x = x0 + k * CS, z = z0 + j * CS;
    const dn = dNear[q], dm = Math.min(dn, dFar[q]);
    let h = g0(x, z);
    const inear = iNear[q];
    // corridor: follow the road surface exactly (below the shoulder strip)
    if (inear >= 0 && dn < D0 + 10) h += (py[inear] - 0.35 - h) * (1 - sm(D0 - 1, D0 + 9, dn));
    const cal = inear >= 0 ? calm[inear] : 0;
    // dunes
    const wd = sm(wallDist + 16, wallDist + 55, dm) * (1 - cal) * (1 - sm(150, 260, dm) * 0.4);
    if (wd > 0) {
      const a = x * wcs + z * wsn, b = -x * wsn + z * wcs;
      const warp = (n2(x, z, 90, 1) - 0.5) * 50 + Math.sin(b / 55) * 14;
      const lam = 62 + 24 * n2(x, z, 300, 2);
      let f = ((a + warp) / lam) % 1; if (f < 0) f += 1;
      const prof = f < 0.72 ? Math.pow(f / 0.72, 1.35) : Math.pow((1 - f) / 0.28, 1.1);
      const amp = 1.8 + 5.5 * n2(x, z, 240, 3);
      h += (prof * amp + (n2(x, z, 9) - 0.5) * 0.35) * wd;
    }
    // mesas + hoodoo spires, away from the road
    const wm = sm(100, 165, dm) * (1 - cal);
    if (wm > 0) {
      const qn = n2(x, z, 230, 4) * 0.62 + n2(x, z, 95, 5) * 0.28 + n2(x, z, 38, 6) * 0.10;
      const mm = sm(0.585, 0.645, qn);
      if (mm > 0) h += (16 + 30 * n2(x, z, 330, 7) + (n2(x, z, 30, 8) - 0.5) * 1.2) * mm * wm;
      const sp2 = sm(0.78, 0.86, n2(x, z, 42, 9)) * sm(75, 120, dm);
      if (sp2 > 0) h += (7 + 9 * n2(x, z, 70, 10)) * sp2;
    }
    // canyon walls
    const ic = iCan[q];
    if (ic >= 0) {
      const d = dCan[q], w = cw[ic];
      if (d > EDGE - 1) {
        const pr = sm(EDGE, EDGE + DR, d), nz1 = (n2(x, z, 23, 11) - 0.5) * 3.5;
        const rim = py[ic] + Wh[ic] * w;
        const top = py[ic] + (Wh[ic] + nz1) * w * pr - 0.32 * Math.max(0, d - EDGE - DR) * w;
        if (top > h) h = top;
      }
    }
    // outer-bank berms on the fast sweepers
    if (inear >= 0 && dn > wallDist + 2 && dn < wallDist + 14 && !cal) {
      const kk = curv[inear];
      if (Math.abs(kk) > 0.005) {
        const dx = x - px[inear], dz = z - pz[inear];
        const tx = C.tx[inear], tz = C.tz[inear];
        const lat = dx * -tz + dz * tx;
        if ((kk > 0 && lat < 0) || (kk < 0 && lat > 0)) h += 1.9 * Math.min(1, Math.abs(kk) / 0.011) * Math.exp(-Math.pow((dn - wallDist - 6.2) / 3.0, 2));
      }
    }
    // oasis: flat sandy basin with a pool
    { const od = Math.hypot(x - oasis.x, z - oasis.z);
      if (od < 90) {
        const w = 1 - sm(46, 88, od);
        h += (oasis.y + 0.3 + (n2(x, z, 14, 12) - 0.5) * 0.5 - h) * w;
        if (od < oasis.r) h = oasis.y - 1.7 * (1 - sm(oasis.r * 0.35, oasis.r, od)) - 0.0;
      } }
    // terrace the cliffs (strata) well above the nearest road
    const ref = inear >= 0 ? py[inear] : 0;
    if (h - ref > 1.2) {
      const step = 3.6, kq = h / step, fl = Math.floor(kq), fr = kq - fl;
      const t = (fl + sm(0.55, 0.95, fr)) * step;
      h += (t - h) * sm(1.2, 6, h - ref) * 0.85;
    }
    // never above the ceiling set by roads in reach
    if (h > rule[q]) h = rule[q];
    // fade to the far ground at the rect edge
    const ed = Math.min(k, nx - 1 - k, j, nz - 1 - j) * CS;
    h *= sm(0, 70, ed);
    H[q] = h; SAND[q] = dn < 60 ? 1 : 0;
  }
  // light smoothing of the big shapes only (keeps road corridor intact)
  { const t = new Float32Array(SZ);
    for (let j = 1; j < nz - 1; j++) for (let k = 1; k < nx - 1; k++) { const q = j * nx + k; if (dNear[q] < D0 + 6) { t[q] = H[q]; continue; } t[q] = H[q] * 0.5 + (H[q - 1] + H[q + 1] + H[q - nx] + H[q + nx]) * 0.125; }
    for (let q = 0; q < SZ; q++) if (t[q] !== 0 || H[q] === 0) { const k = q % nx, j = (q / nx) | 0; if (k > 0 && j > 0 && k < nx - 1 && j < nz - 1) H[q] = t[q]; } }

  const groundY = (x, z) => {
    const fx = (x - x0) / CS, fz = (z - z0) / CS;
    if (fx < 0 || fz < 0 || fx >= nx - 1 || fz >= nz - 1) return 0;
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const a = H[j * nx + i], c = H[j * nx + i + 1], d = H[(j + 1) * nx + i], e = H[(j + 1) * nx + i + 1];
    return (a + (c - a) * tx) * (1 - tz) + (d + (e - d) * tx) * tz;
  };

  // ---- baked sun shadows
  const hl = Math.hypot(sunDir.x, sunDir.z), sx = sunDir.x / hl, sz = sunDir.z / hl, tanEl = sunDir.y / hl;
  const SH = new Float32Array(SZ);
  for (let j = 0; j < nz; j++) for (let k = 0; k < nx; k++) {
    const q = j * nx + k, x = x0 + k * CS, z = z0 + j * CS, h = H[q];
    let mx = 0;
    for (let t = 6; t < 230; t += t < 60 ? 6 : 10) {
      const e = groundY(x + sx * t, z + sz * t) - (h + t * tanEl);
      if (e > mx) mx = e;
    }
    SH[q] = 1 - sm(0.2, 3.2, mx);
  }

  // ---- mesh
  const pos = new Float32Array(SZ * 3), colA = new Float32Array(SZ * 3), uv = new Float32Array(SZ * 2);
  const c = new THREE.Color(), cs1 = new THREE.Color(0xe9b86f), cs2 = new THREE.Color(0xd79a58), cs3 = new THREE.Color(0xc98a52), cg = new THREE.Color(0x6c9a3c), cw2 = new THREE.Color(0xf3d9a2), ct = new THREE.Color(), cr = new THREE.Color(), cshade = new THREE.Color();
  for (let j = 0; j < nz; j++) for (let k = 0; k < nx; k++) {
    const q = j * nx + k, x = x0 + k * CS, z = z0 + j * CS, h = H[q];
    const hx = (H[j * nx + Math.min(nx - 1, k + 1)] - H[j * nx + Math.max(0, k - 1)]) / (2 * CS), hz = (H[Math.min(nz - 1, j + 1) * nx + k] - H[Math.max(0, j - 1) * nx + k]) / (2 * CS);
    const slope = Math.hypot(hx, hz);
    const n = n2(x, z, 19, 13), n3 = n2(x, z, 5, 14);
    c.copy(cs1).lerp(cs2, n).lerp(cs3, n3 * 0.35);
    // dune ripple speckle
    c.offsetHSL(0, 0, (n3 - 0.5) * 0.05);
    // strata on steep or high ground
    const high = sm(8, 15, h), steep = sm(0.35, 0.9, slope);
    const rockness = Math.max(steep, high * 0.75);
    if (rockness > 0.01) {
      const idx = Math.floor(h / 1.15 + (n2(x, z, 40, 15) - 0.5) * 1.6 + n3 * 0.4);
      cr.setHex(STRATA[((Math.imul(idx, 2654435761) >>> 16) + (idx & 3)) % STRATA.length]);
      if (idx % 7 === 0) cr.lerp(cw2, 0.5);
      if (high > 0.6 && steep < 0.5) cr.lerp(cs3, 0.45);   // dusty mesa top
      c.lerp(cr, rockness);
    }
    // oasis green
    const od = Math.hypot(x - oasis.x, z - oasis.z);
    if (od < 50) { const g = (1 - sm(oasis.r * 0.9, 50, od)) * (0.55 + 0.45 * n); c.lerp(cg, g * 0.85 * (od < oasis.r * 0.95 ? 0.5 : 1)); if (od < oasis.r) c.lerp(cw2, 0.3); }
    // shadow side: cool, dark
    const sh = SH[q];
    cshade.setRGB(0.52, 0.46, 0.66);
    ct.setRGB(1, 1, 1).lerp(cshade, 1 - sh);
    c.multiply(ct);
    pos[q * 3] = x; pos[q * 3 + 1] = h; pos[q * 3 + 2] = z;
    colA[q * 3] = c.r; colA[q * 3 + 1] = c.g; colA[q * 3 + 2] = c.b;
    uv[q * 2] = x / 24; uv[q * 2 + 1] = z / 24;
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6); let qi = 0;
  for (let j = 0; j < nz - 1; j++) for (let k = 0; k < nx - 1; k++) { const a = j * nx + k, b = a + 1, d = a + nx, e = d + 1; idx[qi++] = a; idx[qi++] = d; idx[qi++] = b; idx[qi++] = b; idx[qi++] = d; idx[qi++] = e; }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(colA, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
  const dc = canvas(128, 128), dg = dc.getContext("2d"); dg.fillStyle = "#e4e4e4"; dg.fillRect(0, 0, 128, 128); noiseFill(dg, 128, 128, rng, 3500, 0.22, 255, 110, 2);
  const dtex = own(toTex(dc));
  const old = group.getObjectByName("terrain");
  if (old) { group.remove(old); old.geometry.dispose(); }
  const mesh = new THREE.Mesh(own(g), own(new THREE.MeshLambertMaterial({ vertexColors: true, map: dtex })));
  mesh.name = "terrain"; group.add(mesh);

  track.groundY = groundY; X.groundY = groundY;
  X.elevated = (i) => py[i] - groundY(px[i], pz[i]) > 1.2;
  X.terr = { H, nx, nz, x0, z0, CS, dNear, iNear, dCan, iCan, cw, Wh, via, groundY, SH };
  return X.terr;
}
