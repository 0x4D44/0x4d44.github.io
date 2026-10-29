// Mall Mayhem - shared building helpers: wall shells with openings, interior floor overlays on the road, elevated decks.
import * as THREE from "three";
import { Mesher, rectUV, TAU } from "./mall-kit.js";

export const WT = 2.5;   // shell wall thickness

// repeating canvas texture (separate from the atlas, so it can tile)
export function tiledTex(S, w, h, draw, aniso = 8) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; S.own(t); return t;
}

// quad with absolute-coordinate tiled UVs on a vertical face
function tiledWall(S, m, cx, cz, nx, nz, a, b, y0, y1, color, tile = 4) {
  S.wallQuad(m, cx, cz, nx, nz, Math.abs(b - a), y0, y1, color, [[a / tile, y0 / tile], [b / tile, y0 / tile], [b / tile, y1 / tile], [a / tile, y1 / tile]], 0);
}

// Builds the outer shell of an axis-aligned building. R = {x0,x1,z0,z1,h}; openings: {w:[{c,hw,h}], e:[], n:[], s:[]} (c = coordinate along the wall).
// Returns inner wall segments for the caller to decorate: [{side, a, b, y0, y1, plane, nx, nz}] (nx,nz = inward normal)
export function buildShell(S, R, openings, o = {}) {
  const T = WT, H = R.h, fm = S.fac[o.fac ?? 0], tint = o.tint ?? 0xffffff, inner = [];
  const innerCol = o.innerCol ?? 0xe9e6df, capCol = o.capCol ?? 0xcfd3d8;
  const sides = {
    w: { n: [-1, 0], plane: R.x0, lo: R.z0, hi: R.z1, axisZ: true }, e: { n: [1, 0], plane: R.x1, lo: R.z0, hi: R.z1, axisZ: true },
    n: { n: [0, -1], plane: R.z0, lo: R.x0, hi: R.x1, axisZ: false }, s: { n: [0, 1], plane: R.z1, lo: R.x0, hi: R.x1, axisZ: false },
  };
  for (const key of Object.keys(sides)) {
    const sd = sides[key], [nx, nz] = sd.n, ops = (openings[key] || []).slice().sort((p, q) => p.c - q.c);
    const segs = []; let cur = sd.lo;
    for (const op of ops) { segs.push([cur, op.c - op.hw, 0, H]); segs.push([op.c - op.hw, op.c + op.hw, op.h, H]); cur = op.c + op.hw; }
    segs.push([cur, sd.hi, 0, H]);
    for (const [a, b, y0, y1] of segs) {
      if (b - a < 0.05) continue;
      const mid = (a + b) / 2, w = b - a;
      const px = sd.axisZ ? sd.plane : mid, pz = sd.axisZ ? mid : sd.plane;
      tiledWall(S, fm, px, pz, nx, nz, a, b, y0, y1, tint);
      // inner face
      const ix = sd.axisZ ? sd.plane - nx * T : mid, iz = sd.axisZ ? mid : sd.plane - nz * T;
      S.wallQuad(S.basic, ix, iz, -nx, -nz, w, y0, y1, innerCol, null, 0);
      inner.push({ side: key, a, b, y0, y1, ix, iz, nx: -nx, nz: -nz });
      // top cap
      if (y1 >= H - 0.01) { if (sd.axisZ) S.flat(S.lit, Math.min(sd.plane, sd.plane - nx * T), a, Math.max(sd.plane, sd.plane - nx * T), b, H + 0.02, capCol, 1); else S.flat(S.lit, a, Math.min(sd.plane, sd.plane - nz * T), b, Math.max(sd.plane, sd.plane - nz * T), H + 0.02, capCol, 1); }
    }
    // jambs + underside of lintels
    for (const op of ops) {
      for (const sg of [-1, 1]) {
        const c = op.c + sg * op.hw, tx = sd.axisZ ? 0 : 1, tz = sd.axisZ ? 1 : 0;   // direction along the wall
        const p0 = sd.axisZ ? [sd.plane, 0, c] : [c, 0, sd.plane], p1 = sd.axisZ ? [sd.plane - nx * T, 0, c] : [c, 0, sd.plane - nz * T];
        S.lit.quad([p0[0], 0, p0[2]], [p1[0], 0, p1[2]], [p1[0], op.h, p1[2]], [p0[0], op.h, p0[2]], capCol, null, [-sg * tx, 0, -sg * tz]);
      }
      const a = op.c - op.hw, b = op.c + op.hw;
      if (sd.axisZ) S.flat(S.lit, Math.min(sd.plane, sd.plane - nx * T), a, Math.max(sd.plane, sd.plane - nx * T), b, op.h, capCol, -1);
      else S.flat(S.lit, a, Math.min(sd.plane, sd.plane - nz * T), b, Math.max(sd.plane, sd.plane - nz * T), op.h, capCol, -1);
    }
  }
  // roof (top, lit) + ceiling (underside, basic)
  S.flat(S.lit, R.x0, R.z0, R.x1, R.z1, H, o.roofCol ?? 0x9a9da3, 1);
  if (!o.noCeiling) S.flat(S.basic, R.x0 + T, R.z0 + T, R.x1 - T, R.z1 - T, H - 0.15, o.ceilCol ?? 0xf0f2f4, -1);
  return inner;
}

// Interior floor + lane markings laid over the road (and its shoulders) wherever mask(i) is true.
export function roadOverlay(S, tex, mask, tileLen = 16, name = "floor", lift = 0.012) {
  const { X, group, own, wallDist, C } = S;
  const Y = 0.04 + lift;
  const st = new X.Strips(C).add({ profile: [[-wallDist, Y, 0], [wallDist, Y, 1]], tile: tileLen, mask });
  const m = new THREE.Mesh(own(st.geometry()), own(new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -1.6, polygonOffsetUnits: -2.6 })));
  m.name = name; group.add(m); return m;
}
// painter for a road-overlay texture: 256 wide spans 2*wallDist laterally, 256 high = tileLen metres
export function floorPainter(S, base1, base2, lineCol, o = {}) {
  const { hw, wallDist } = S;
  return (g, w, h) => {
    const cells = o.cells ?? 8;
    for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) { g.fillStyle = (i + j) % 2 ? base1 : base2; g.fillRect((i * w) / cells, (j * h) / cells, w / cells + 1, h / cells + 1); }
    g.fillStyle = "rgba(0,0,0,0.08)"; g.fillRect(0, 0, w, 2); for (let i = 0; i < cells; i++) g.fillRect((i * w) / cells, 0, 1, h);
    if (o.shoulder) { g.fillStyle = o.shoulder; const e = (wallDist - hw) / (2 * wallDist) * w; g.globalAlpha = 0.5; g.fillRect(0, 0, e, h); g.fillRect(w - e, 0, e, h); g.globalAlpha = 1; }
    const lw = 0.4 / (2 * wallDist) * w, e1 = 0.5 - (hw - 0.5) / (2 * wallDist), e2 = 0.5 + (hw - 0.5) / (2 * wallDist);
    g.fillStyle = lineCol; g.fillRect(e1 * w - lw / 2, 0, lw, h); g.fillRect(e2 * w - lw / 2, 0, lw, h);
    for (let k = 0; k < 2; k++) g.fillRect(w / 2 - lw * 0.4, (k / 2) * h, lw * 0.8, h / 4);
    if (o.extra) o.extra(g, w, h);
  };
}

// Concrete deck under the road + pillars (outside the wall) wherever the road is more than 0.6 m up. Colliders are not needed: everything is beyond wallDist.
export function elevatedDeck(S, maskExtra = () => true, step = 10) {
  const { X, group, own, wallDist, C } = S;
  const { N, px, pz, tx, tz, py, ds } = C, W = wallDist + 0.6;
  const concrete = [0.72, 0.72, 0.74], dark = [0.5, 0.5, 0.53];
  const up = (i) => py[i] > 0.6 && maskExtra(i);
  const st = new X.Strips(C).add({ profile: [[-W, 0, 0], [-W, -1.5, 0.3], [W, -1.5, 0.7], [W, 0, 1]], tile: 8, mask: up, color: (i, j) => (j === 1 ? dark : concrete) });
  if (st.n) { const m = new THREE.Mesh(own(st.geometry()), own(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }))); m.name = "mall-deck"; group.add(m); }
  const stepI = Math.round(step / ds);
  for (let i = 2; i < N; i += stepI) {
    if (!up(i) || py[i] < 1.2) continue;
    const ry = Math.atan2(tx[i], tz[i]), top = py[i] - 1.5;
    for (const sg of [-1, 1]) {
      const lat = (wallDist + 1.6) * sg, x = px[i] - tz[i] * lat, z = pz[i] + tx[i] * lat;
      S.lit.box(x, top / 2, z, 1.6, top, 1.6, 0xc4c4c8, { ry }); S.lit.box(x, top - 0.3, z, 2.4, 0.6, 2.4, 0xb0b0b6, { ry });
    }
    void group;
  }
}

// shop-front wall run: fills [a,b] along an inner wall with atlas shopfronts of 8 m, rows at given y ranges
export function shopRun(S, seg, rows, o = {}) {
  const len = seg.b - seg.a; if (len < 5) return;
  const n = Math.max(1, Math.round(len / 8)), w = len / n;
  for (let k = 0; k < n; k++) {
    const mid = seg.a + (k + 0.5) * w, along = seg.side === "w" || seg.side === "e";
    const cx = along ? seg.ix : mid, cz = along ? mid : seg.iz;
    for (const [y0, y1, dy] of rows) {
      const idx = Math.floor(S.rng() * S.nShops) + (dy || 0), r = S.shop(idx);
      S.wallQuad(S.sign, cx, cz, seg.nx, seg.nz, w - 0.2, y0, y1, 0xffffff, rectUV(r.uv), 0.05);
    }
  }
}
export { Mesher, TAU };
