// Apex Karts - seasonal decorations: the shared kit (free-spot finder, geometry helpers, glow lights, snow, flyers, gantry).
// Everything here is generic: a season builder (season-halloween.js ...) asks the kit for *places* and gets back spots that
// are clear of the scenery the track already built, so one builder dresses all seven very different tracks.
import * as THREE from "three";
import { makeRng } from "./roster.js";

export const TAU = Math.PI * 2;
const SU = new THREE.Vector3(0, 1, 0), SD = new THREE.Vector3(), SQ = new THREE.Quaternion();
export const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const sstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ geometry helpers
// Concatenate non-indexed geometries that carry position / normal / colour (bake() output or anything run through toNonIndexed()).
export function merge(geos) {
  const gs = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of gs) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3).fill(1), hasUv = gs.some((g) => g.attributes.uv), uv = hasUv ? new Float32Array(n * 2) : null;
  let o = 0;
  for (const g of gs) {
    pos.set(g.attributes.position.array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.color) col.set(g.attributes.color.array, o * 3);
    if (hasUv && g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3)); out.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  if (hasUv) out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return out;
}

// Flat-shaded triangles with colours (for wings and flags): tris = [[[x,y,z],[x,y,z],[x,y,z], hex], ...]
export function triGeo(tris) {
  const pos = [], col = [], c = new THREE.Color();
  for (const [a, b, d, hex] of tris) { c.set(hex); for (const p of [a, b, d]) { pos.push(p[0], p[1], p[2]); col.push(c.r, c.g, c.b); } }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  return g;
}

// A pumpkin of unit radius sitting on y = 0 (1.64 tall): ribbed, orange with darker grooves, stalk on top.
export function pumpkinGeo(X, seg = 12, rings = 7) {
  const g = new THREE.SphereGeometry(1, seg, rings), p = g.attributes.position, n = p.count, col = new Float32Array(n * 3);
  const c0 = new THREE.Color(0xf47b16), c1 = new THREE.Color(0xb94a0a), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), rib = Math.cos(Math.atan2(z, x) * 6), f = 1 + 0.1 * rib * (1 - 0.9 * y * y);
    p.setXYZ(i, x * f, y * 0.82 + 0.82, z * f);
    c.copy(c0).lerp(c1, (0.5 - 0.5 * rib) * 0.75 * (1 - 0.5 * y * y)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  const stem = X.bake([X.part(new THREE.CylinderGeometry(0.1, 0.16, 0.34, 6), X.mat(0.02, 1.62, 0, 1, 1, 1, 0.12, 0, -0.18), 0x5d7a2a), X.part(new THREE.CylinderGeometry(0.05, 0.1, 0.18, 5), X.mat(0.1, 1.84, 0, 1, 1, 1, 0, 0, -0.5), 0x4f6a24)]);
  return merge([g, stem]);
}
// A curved patch hugging a pumpkin's front (+z) that carries one face of the atlas (cell of `cells`).
export function facePatch(cell, cells = 4, U = 8, V = 5) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= V; j++) for (let i = 0; i <= U; i++) {
    const u = i / U, v = j / V, az = (u - 0.5) * 1.7, el = (v - 0.5) * 0.9, cy = Math.cos(el), x0 = Math.sin(az) * cy, z0 = Math.cos(az) * cy, y0 = Math.sin(el);
    const f = (1 + 0.1 * Math.cos(Math.atan2(z0, x0) * 6) * (1 - 0.9 * y0 * y0)) * 1.06;
    pos.push(x0 * f, y0 * 0.82 * 1.03 + 0.82, z0 * f); uv.push((cell + u) / cells, v);
  }
  for (let j = 0; j < V; j++) for (let i = 0; i < U; i++) { const a = j * (U + 1) + i; idx.push(a, a + 1, a + U + 1, a + 1, a + U + 2, a + U + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// Carved jack-o'-lantern faces (four of them in one 1024x128 atlas, transparent where the pumpkin shows through).
export function faceAtlas(canvas) {
  const c = canvas(1024, 128), g = c.getContext("2d");
  const shape = (ox, pts) => {
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(ox + x, y) : g.moveTo(ox + x, y))); g.closePath();
    g.fillStyle = "#ffd23a"; g.fill(); g.lineWidth = 5; g.lineJoin = "round"; g.strokeStyle = "#2b1000"; g.stroke();
    const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    g.beginPath(); pts.forEach(([x, y], i) => { const px = ox + mx + (x - mx) * 0.5, py = my + (y - my) * 0.5; if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath(); g.fillStyle = "#fff6b8"; g.fill();
  };
  const ell = (ox, cx, cy, rx, ry) => { const pts = []; for (let k = 0; k < 14; k++) pts.push([cx + Math.cos((k / 14) * TAU) * rx, cy + Math.sin((k / 14) * TAU) * ry]); shape(ox, pts); };
  // 0: classic triangles + jagged grin
  shape(0, [[52, 52], [100, 52], [76, 16]]); shape(0, [[156, 52], [204, 52], [180, 16]]); shape(0, [[118, 72], [138, 72], [128, 58]]);
  shape(0, [[40, 84], [70, 80], [86, 98], [104, 82], [128, 102], [152, 82], [170, 98], [186, 80], [216, 84], [200, 114], [176, 104], [152, 120], [128, 110], [104, 120], [80, 104], [56, 114]]);
  // 1: round eyes + wide smile
  ell(256, 76, 40, 16, 16); ell(256, 180, 40, 16, 16); shape(256, [[118, 70], [138, 70], [128, 58]]);
  shape(256, [[46, 78], [86, 100], [128, 110], [170, 100], [210, 78], [190, 96], [150, 116], [106, 116], [66, 96]]);
  // 2: angry slants + fangs
  shape(512, [[46, 24], [104, 50], [56, 66]]); shape(512, [[210, 24], [152, 50], [200, 66]]); shape(512, [[118, 74], [138, 74], [128, 60]]);
  shape(512, [[40, 88], [88, 84], [108, 108], [128, 92], [148, 108], [168, 84], [216, 88], [186, 116], [128, 104], [70, 116]]);
  // 3: surprised
  ell(768, 76, 40, 15, 24); ell(768, 180, 40, 15, 24); shape(768, [[118, 72], [138, 72], [128, 58]]); ell(768, 128, 98, 30, 22);
  return c;
}

// A ghost: a tall sheet with a wavy hem, two arms and a surprised face. Unlit colours (it glows a little by itself).
export function ghostGeo(X) {
  const top = new THREE.SphereGeometry(0.5, 10, 7, 0, TAU, 0, Math.PI * 0.62), body = new THREE.CylinderGeometry(0.5, 0.78, 1.15, 10, 4, true);
  const bp = body.attributes.position;
  for (let i = 0; i < bp.count; i++) { const y = bp.getY(i), a = Math.atan2(bp.getZ(i), bp.getX(i)); if (y < -0.5) bp.setY(i, y + 0.14 * Math.sin(a * 5)); }
  body.computeVertexNormals();
  return X.bake([
    X.part(top, X.mat(0, 0.7, 0), 0xf6f8ff), X.part(body, X.mat(0, 0.15, 0), 0xe9efff),
    X.part(new THREE.SphereGeometry(0.17, 6, 4), X.mat(-0.62, 0.35, 0.05, 1.4, 0.8, 0.8, 0, 0, 0.6), 0xf0f4ff), X.part(new THREE.SphereGeometry(0.17, 6, 4), X.mat(0.62, 0.35, 0.05, 1.4, 0.8, 0.8, 0, 0, -0.6), 0xf0f4ff),
    X.part(new THREE.SphereGeometry(0.075, 6, 4), X.mat(-0.17, 0.78, 0.43, 1, 1.4, 0.5), 0x15131f), X.part(new THREE.SphereGeometry(0.075, 6, 4), X.mat(0.17, 0.78, 0.43, 1, 1.4, 0.5), 0x15131f),
    X.part(new THREE.SphereGeometry(0.1, 6, 4), X.mat(0, 0.48, 0.45, 1, 1.5, 0.5), 0x15131f),
  ]);
}

// An egg of height 1 (widest near the bottom) built from lathe bands, so each band can have its own colour. bands: [[t0, t1, hex], ...]
export function eggParts(X, x, y, z, s, bands, seg = 8, ry = 0) {
  const r = (t) => 0.4 * Math.pow(Math.sin(Math.PI * Math.min(Math.max(t, 0.001), 0.999)), 0.75) * (1.12 - 0.34 * t);
  return bands.map(([t0, t1, hex]) => {
    const pts = [], steps = Math.max(2, Math.ceil((t1 - t0) * 6));
    for (let k = 0; k <= steps; k++) { const t = t0 + ((t1 - t0) * k) / steps; pts.push(new THREE.Vector2(r(t), t)); }
    return X.part(new THREE.LatheGeometry(pts, seg), X.mat(x, y, z, s, s, s, 0, ry, 0), hex);
  });
}

// ------------------------------------------------------------------ the kit
export function makeKit(track, X, K) {
  const { C, group, own, anim, wallDist, def } = X;
  const L = track.length, N = C.N, ds = C.ds, b = track.bounds;
  const rng = makeRng(hashStr(def.id + ":" + X.season.id));       // own stream: the track's own random draws are never disturbed
  const R = (a, z) => a + rng() * (z - a), pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const part = X.part, mat = X.mat;
  const Z = { THREE, track, X, K, C, L, N, ds, b, group, own, anim, wallDist, WH: X.WH, rng, R, pick, part, mat, bake: X.bake, TAU, sstep,
    cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2, theme: def.theme, season: X.season, onDeck: def.theme === "skyway", indoor: def.theme === "mall",
    dens: X.low ? 0.5 : 1,                                           // Graphics = Low: half as many props
    big: [], debug: {}, stats: { inst: 0, tris: 0, calls: 0, by: {} } };
  const lam = K.lam, basic = K.basic;
  Z.matV = lam({ vertexColors: true });
  Z.matVD = lam({ vertexColors: true, side: THREE.DoubleSide });
  Z.matBasicV = basic({ vertexColors: true, side: THREE.DoubleSide });

  // ---- shape shorthands (all return bake() parts)
  const sx = (o, k) => (o.s ?? 1) * (o[k] ?? 1);
  Z.P = {
    sph: (r, x, y, z, hex, o = {}) => part(new THREE.SphereGeometry(r, o.w || 8, o.h || 6), mat(x, y, z, sx(o, "x"), sx(o, "y"), sx(o, "z"), o.rx || 0, o.ry || 0, o.rz || 0), hex),
    cyl: (rt, rb, h, x, y, z, hex, o = {}) => part(new THREE.CylinderGeometry(rt, rb, h, o.seg || 8, 1, !!o.open), mat(x, y, z, 1, 1, 1, o.rx || 0, o.ry || 0, o.rz || 0), hex),
    cone: (r, h, x, y, z, hex, o = {}) => part(new THREE.ConeGeometry(r, h, o.seg || 8, 1, !!o.open), mat(x, y, z, 1, 1, 1, o.rx || 0, o.ry || 0, o.rz || 0), hex),
    box: (w, h, d, x, y, z, hex, o = {}) => part(new THREE.BoxGeometry(w, h, d), mat(x, y, z, 1, 1, 1, o.rx || 0, o.ry || 0, o.rz || 0), hex),
    tor: (Rr, r, x, y, z, hex, o = {}) => part(new THREE.TorusGeometry(Rr, r, o.tseg || 5, o.seg || 10, o.arc ?? TAU), mat(x, y, z, 1, 1, 1, o.rx || 0, o.ry || 0, o.rz || 0), hex),
    // a cylinder (limb, rope, cane...) from point a to point b
    seg: (a, b2, r, hex, o = {}) => {
      SD.set(b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]); const len = SD.length(); if (len < 1e-4) return null;
      SQ.setFromUnitVectors(SU, SD.normalize());
      return part(new THREE.CylinderGeometry(o.r2 ?? r, r, 1, o.seg || 5, 1, !!o.open), new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2, (a[2] + b2[2]) / 2), SQ.clone(), new THREE.Vector3(1, len, 1)), hex);
    },
  };
  Z.bakeAll = (parts) => X.bake(parts.filter(Boolean));
  Z.count = (geo, n = 1, name = "?") => { const a = geo.attributes.position.count, t = (geo.index ? geo.index.count : a) / 3 * n; Z.stats.tris += t; Z.stats.calls++; Z.stats.inst += n; Z.stats.by[name] = Math.round((Z.stats.by[name] || 0) + t); };
  Z.inst = (geo, material, items, name) => {
    if (!items.length) return null;
    Z.count(geo, items.length, name);
    return K.instanced(geo, material, items.map((it) => ({ abs: true, ...it })), name);
  };
  Z.mesh = (geo, material, name, parent = group) => { Z.count(geo, 1, name); const m = new THREE.Mesh(own(geo), material); m.name = name; parent.add(m); return m; };
  Z.shadows = (items, rad) => { if (!Z.onDeck && items.length) K.blobShadows(items, rad); };

  // ---- occupancy: where is something already standing? (cell = [lowest, highest] y of anything solid-ish that overlaps it)
  const occ = (() => {
    const PAD = 90; let CS = 1;
    const w = b.maxX - b.minX + 2 * PAD, h = b.maxZ - b.minZ + 2 * PAD;
    while ((w / CS) * (h / CS) > 2.4e6) CS *= 1.25;
    const x0 = b.minX - PAD, z0 = b.minZ - PAD, nx = Math.ceil(w / CS) + 1, nz = Math.ceil(h / CS) + 1;
    let lo = new Float32Array(nx * nz).fill(1e9), hi = new Float32Array(nx * nz).fill(-1e9);
    const cx = (x) => Math.floor((x - x0) / CS), cz = (z) => Math.floor((z - z0) / CS);
    const mark = (ax, bx, az, bz, y0, y1) => {
      let i0 = cx(ax), i1 = cx(bx), j0 = cz(az), j1 = cz(bz);
      if (i1 < 0 || j1 < 0 || i0 >= nx || j0 >= nz) return;
      i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(nx - 1, i1); j1 = Math.min(nz - 1, j1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * nx + i; if (y0 < lo[k]) lo[k] = y0; if (y1 > hi[k]) hi[k] = y1; }
    };
    const blocked = (x, z, r, y0, y1) => {
      const i0 = cx(x - r), i1 = cx(x + r), j0 = cz(z - r), j1 = cz(z + r);
      if (i0 < 0 || j0 < 0 || i1 >= nx || j1 >= nz) return true;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * nx + i; if (hi[k] > y0 && lo[k] < y1) return true; }
      return false;
    };
    // everything the track built so far
    // (the ground itself, the road cross-section and weather are not obstacles; props never go inside the walls anyway)
    const SKIP = new Set(["terrain", "ground", "sea", "sky", "road", "shoulder", "kerbs", "startline", "pads", "snowfall", "drizzle", "walls", "glass", "rail", "hull", "runlights", "tube", "season-snow", "loch", "loch-ness"]);
    let budget = 0;
    const tri = (ax, ay, az, bx, by, bz, cx2, cy, cz2) => {
      const mnx = Math.min(ax, bx, cx2), mxx = Math.max(ax, bx, cx2), mnz = Math.min(az, bz, cz2), mxz = Math.max(az, bz, cz2);
      if (mxx < x0 || mnx > x0 + nx * CS || mxz < z0 || mnz > z0 + nz * CS) return;
      if (mxx - mnx > CS * 1.2 || mxz - mnz > CS * 1.2) {
        if (--budget < 0) return;
        const d1 = (ax - bx) ** 2 + (az - bz) ** 2, d2 = (bx - cx2) ** 2 + (bz - cz2) ** 2, d3 = (cx2 - ax) ** 2 + (cz2 - az) ** 2;
        if (d1 >= d2 && d1 >= d3) { const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2; tri(ax, ay, az, mx, my, mz, cx2, cy, cz2); tri(mx, my, mz, bx, by, bz, cx2, cy, cz2); }
        else if (d2 >= d3) { const mx = (bx + cx2) / 2, my = (by + cy) / 2, mz = (bz + cz2) / 2; tri(ax, ay, az, bx, by, bz, mx, my, mz); tri(ax, ay, az, mx, my, mz, cx2, cy, cz2); }
        else { const mx = (cx2 + ax) / 2, my = (cy + ay) / 2, mz = (cz2 + az) / 2; tri(ax, ay, az, bx, by, bz, mx, my, mz); tri(mx, my, mz, bx, by, bz, cx2, cy, cz2); }
        return;
      }
      mark(mnx, mxx, mnz, mxz, Math.min(ay, by, cy), Math.max(ay, by, cy));
    };
    const v = new THREE.Vector3(), mt = new THREE.Matrix4(), cs = [];
    group.updateMatrixWorld(true);
    group.traverse((o) => {
      if (!o.isMesh || !o.visible || !o.geometry || SKIP.has(o.name)) return;
      const g = o.geometry, pa = g.attributes.position; if (!pa) return;
      if (o.isInstancedMesh) {
        if (!g.boundingBox) g.computeBoundingBox();
        const bb = g.boundingBox, im = o.instanceMatrix.array;
        for (let k = 0; k < o.count; k++) {
          mt.fromArray(im, k * 16).premultiply(o.matrixWorld);
          let a = 1e9, c = -1e9, d = 1e9, e = -1e9, f = 1e9, h2 = -1e9;
          for (let q = 0; q < 8; q++) { v.set(q & 1 ? bb.max.x : bb.min.x, q & 2 ? bb.max.y : bb.min.y, q & 4 ? bb.max.z : bb.min.z).applyMatrix4(mt); a = Math.min(a, v.x); c = Math.max(c, v.x); d = Math.min(d, v.y); e = Math.max(e, v.y); f = Math.min(f, v.z); h2 = Math.max(h2, v.z); }
          mark(a, c, f, h2, d, e);
        }
        return;
      }
      const n = pa.count, wv = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld); wv[i * 3] = v.x; wv[i * 3 + 1] = v.y; wv[i * 3 + 2] = v.z; }
      const ix = g.index, T = ix ? ix.count / 3 : n / 3;
      for (let t = 0; t < T; t++) {
        const a = ix ? ix.getX(t * 3) : t * 3, bq = ix ? ix.getX(t * 3 + 1) : t * 3 + 1, c = ix ? ix.getX(t * 3 + 2) : t * 3 + 2;
        budget = 2500; tri(wv[a * 3], wv[a * 3 + 1], wv[a * 3 + 2], wv[bq * 3], wv[bq * 3 + 1], wv[bq * 3 + 2], wv[c * 3], wv[c * 3 + 1], wv[c * 3 + 2]);
      }
    });
    void cs;
    // solid obstacles the karts can hit (trunks, pillars...)
    for (const o of track.obstacles) if (o.y0 < 1e8) mark(o.x - o.r, o.x + o.r, o.z - o.r, o.z + o.r, Math.max(o.y0, -50), Math.min(o.y1, 200));
    return { blocked, mark: (x, z, r, y0, y1) => mark(x - r, x + r, z - r, z + r, y0, y1), free: () => { lo = hi = new Float32Array(1); } };
  })();
  Z.occ = occ;
  Z.claim = (x, z, r, y0, y1) => { if (occ.blocked(x, z, r, y0, y1)) return false; occ.mark(x, z, r, y0, y1); return true; };
  Z.release = () => { occ.free(); };

  // ---- places
  Z.nearStart = (s, m = 8) => s < m || s > L - m;
  Z.facing = (a, side) => Math.atan2(-side * a.rx, -side * a.rz);          // yaw that makes a prop (front = +z) face the road
  Z.curv = (s) => C.curv[Math.round(s / ds) % N];
  Z.sideOf = (kk, which) => (which === "outside" ? (kk > 0 ? -1 : 1) : (kk > 0 ? 1 : -1));

  // y of the ground at (x, z) if a prop of radius r and height h can stand there, else null
  Z.check = (x, z, i, r, h, o = {}) => {
    const X2 = X;
    let y;
    if (Z.onDeck) y = C.py[i];
    else {
      y = X2.groundY(x, z);
      if (X2.elevated(i) || Math.abs(y - C.py[i]) > (o.dy ?? 1.6)) return null;
      const sl = r * 0.8 + 0.5;
      if (Math.abs(X2.groundY(x + sl, z) - y) > 0.8 || Math.abs(X2.groundY(x - sl, z) - y) > 0.8 || Math.abs(X2.groundY(x, z + sl) - y) > 0.8 || Math.abs(X2.groundY(x, z - sl) - y) > 0.8) return null;
      if (X2.underDeck(x, z, y)) return null;
    }
    const gc = X2.groundClip || {};
    if ((gc.zMin !== undefined && z < gc.zMin + 8) || (gc.zMax !== undefined && z > gc.zMax - 8)) return null;
    const lk = X2.lakeInfo; if (lk && Math.hypot(x - lk.x, z - lk.z) < lk.r + 12) return null;
    if (X2.extra?.seasonBlocked?.(x, z, r)) return null;
    if (!o.air && occ.blocked(x, z, r, y + 0.3, y + h)) return null;
    if (o.air && occ.blocked(x, z, r, (o.y0 ?? y + 1) , (o.y1 ?? y + 3))) return null;
    return y;
  };

  // Find up to n spots beside the track. off = metres beyond the outer face of the wall, [min, max].
  // bend: "any" | "outside" | "inside" | "straight". big: keeps the spot `bigSep` away from every other big spot.
  Z.sample = (o) => {
    const { n: n0, off: off0 = [1.2, 3], r = 0.6, h = 1, bend = "any", minCurv = 0.004, minSep = 0, s0 = 0, s1 = L, sides = [-1, 1], strata = true, tries = 60, filter = null, big = false, bigSep = 80 } = o;
    const out = [], n = Math.ceil(n0 * Z.dens);
    // up on the deck-in-the-void track only the narrow outer catwalk (about 2.6 m beyond the wall) is solid ground
    let off = off0;
    if (Z.onDeck) { const hi = Math.min(off0[1], 2.55 - r); if (hi < 0.05) return out; off = [Math.min(off0[0], hi), hi]; }
    for (let k = 0; k < n; k++) {
      for (let t = 0; t < tries; t++) {
        const s = (((strata ? s0 + ((k + rng()) * (s1 - s0)) / n : R(s0, s1)) % L) + L) % L;
        const side = sides.length === 1 ? sides[0] : sides[rng() < 0.5 ? 0 : 1];
        const i = Math.round(s / ds) % N, kk = C.curv[i], ak = Math.abs(kk);
        if (bend === "outside" && !(ak > minCurv && side === Z.sideOf(kk, "outside"))) continue;
        if (bend === "inside" && !(ak > minCurv && side === Z.sideOf(kk, "inside"))) continue;
        if (bend === "straight" && ak > minCurv) continue;
        if (Z.nearStart(s, 10)) continue;
        const lat = wallDist + 0.55 + R(off[0], off[1]), a = K.at(s, side * lat);
        if (minSep && out.some((p) => (p.x - a.x) ** 2 + (p.z - a.z) ** 2 < minSep * minSep)) continue;
        if (big && Z.big.some((p) => (p.x - a.x) ** 2 + (p.z - a.z) ** 2 < bigSep * bigSep)) continue;
        if (filter && !filter(a, s, side)) continue;
        if (X.nearest(a.x, a.z) < lat - 0.8 - r * 0.3) continue;       // another stretch of road is closer than this one (hairpins, crossings)
        const y = Z.check(a.x, a.z, i, r, h, o);
        if (y === null) continue;
        occ.mark(a.x, a.z, r, y, y + h);
        const sp = { x: a.x, y, z: a.z, s, i, side, k: kk, ry: Z.facing(a, side), h: a.h, rx: a.rx, rz: a.rz };
        out.push(sp); if (big) Z.big.push(sp);
        break;
      }
    }
    return out;
  };

  // spots on the top of the wall (always free), one every `spacing` m, alternating sides unless both
  Z.wallTop = (spacing0, o = {}) => {
    const spacing = spacing0 / Z.dens, out = [], both = !!o.both, jit = o.jitter ?? 0.2;
    let idx = 0;
    for (let s = spacing * 0.5; s < L - 4; s += spacing) {
      const ss = s + R(-jit, jit) * spacing;
      if (Z.nearStart(ss, 5)) continue;
      for (const side of both ? [-1, 1] : [idx % 2 ? 1 : -1]) {
        const a = K.at(ss, side * (wallDist + 0.28));
        out.push({ x: a.x, y: a.y + Z.WH, z: a.z, s: ss, side, ry: Z.facing(a, side), h: a.h, rx: a.rx, rz: a.rz, idx });
      }
      idx++;
    }
    return out;
  };

  // ---- glowing, blinking points (fairy lights, stars, eyes)
  Z.glow = (pts, o = {}) => {
    const n = pts.length; if (!n) return null;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), ph = new Float32Array(n), sz = new Float32Array(n), c = new THREE.Color();
    pts.forEach((p, i) => { pos.set([p.x, p.y, p.z], i * 3); c.set(p.c ?? 0xffffff); col.set([c.r, c.g, c.b], i * 3); ph[i] = p.ph ?? rng(); sz[i] = p.sz ?? 0.14; });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("aCol", new THREE.BufferAttribute(col, 3)); g.setAttribute("aPh", new THREE.BufferAttribute(ph, 1)); g.setAttribute("aSize", new THREE.BufferAttribute(sz, 1));
    const m = own(new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uBlink: { value: o.blink ?? 1 }, uMax: { value: o.max ?? 10 } }]),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
      vertexShader: `uniform float uTime; uniform float uBlink; uniform float uMax; attribute vec3 aCol; attribute float aPh; attribute float aSize; varying vec3 vCol; varying float vA;
        #include <fog_pars_vertex>
        void main(){ vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
          float k = 0.55 + 0.45 * sin(uTime * 2.4 + aPh * 6.2831853); vA = mix(1.0, k, uBlink); vCol = aCol;
          gl_PointSize = clamp(aSize * 520.0 / -mvPosition.z, 2.0, uMax);
          #include <fog_vertex>
        }`,
      fragmentShader: `varying vec3 vCol; varying float vA;
        #include <fog_pars_fragment>
        void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float core = smoothstep(0.5, 0.0, d);
          float fk = 1.0;
          #ifdef USE_FOG
            fk = 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
          #endif
          gl_FragColor = vec4(vCol * (0.45 + 1.2 * core * core), core * vA * fk);
          #include <colorspace_fragment>
        }`,
    }));
    const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = 6; p.name = o.name || "season-lights"; (o.parent || group).add(p); own(g);
    anim.push((dt, t) => { m.uniforms.uTime.value = t; });
    Z.stats.calls++; Z.stats.inst += n;
    return p;
  };

  // ---- strings of triangular pennants between two points (local or world coordinates)
  Z.pennants = () => {
    const pos = [], col = [];
    return {
      add(a, bb, o = {}) {
        const n = o.n ?? 14, sag = o.sag ?? 0.8, size = o.size ?? 0.5, pal = (o.pal || [0xffffff]).map((hx) => new THREE.Color(hx));
        const at = (t) => [a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (bb[2] - a[2]) * t];
        for (let i = 0; i < n; i++) {
          const p0 = at(i / n), p1 = at((i + 1) / n), c = pal[i % pal.length];
          pos.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 - size * 1.25, (p0[2] + p1[2]) / 2);
          for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
        }
      },
      mesh(parent = group, name = "bunting") {
        if (!pos.length) return null;
        const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
        return Z.mesh(g, Z.matBasicV, name, parent);
      },
    };
  };

  // ---- the start gantry's frame of reference: local +x is the driver's LEFT, +z is forward, pillars at x = +/-span
  Z.gantry = () => {
    const a = K.at(0, 0), g = new THREE.Group();
    g.position.set(a.x, a.y, a.z); g.rotation.y = a.h; g.name = "season-gantry"; group.add(g); g.userData.span = wallDist + 1.6;
    return g;
  };

  // ---- something that circles the track in the sky
  Z.flyer = (obj, o = {}) => {
    const rad = o.rad ?? Math.max(230, Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) * 0.45), y = o.y ?? 75, speed = o.speed ?? 0.05, bob = o.bob ?? 2, dir = o.dir ?? 1, ph = o.phase ?? R(0, TAU);
    const cx = o.cx ?? Z.cx, cz = o.cz ?? Z.cz;
    group.add(obj); obj.frustumCulled = false;
    Z.anim.push((dt, t) => {
      const a = ph + dir * t * speed;
      obj.position.set(cx + Math.cos(a) * rad, y + Math.sin(t * 0.9 + ph) * bob, cz + Math.sin(a) * rad);
      obj.rotation.y = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir);
      obj.rotation.z = -0.1 * dir + Math.sin(t * 0.7 + ph) * 0.05;
    });
    return obj;
  };

  // ---- paint onto the sky dome's canvas (rainbows, moons...). fn(g, W, H, project(dir) -> [px, py])
  Z.paintSky = (fn) => {
    const dome = group.getObjectByName("sky"), tex = dome?.material?.map, cv = tex?.image;
    if (!cv || !cv.getContext) return false;
    const W = cv.width, H = cv.height, g = cv.getContext("2d");
    const project = (x, y, zz) => { const l = Math.hypot(x, y, zz) || 1; const phi = (Math.atan2(zz / l, -x / l) + TAU) % TAU, el = Math.asin(y / l); return [(phi / TAU) * W, (0.5 - el / Math.PI) * H]; };
    fn(g, W, H, project); tex.needsUpdate = true; return true;
  };

  // ---- a copy of `geo` moved into place (for baking props into a parent's local frame, e.g. the gantry)
  Z.place = (geo, o = {}) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(o.x || 0, o.y || 0, o.z || 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0)), new THREE.Vector3(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1));
    return geo.clone().applyMatrix4(m);
  };

  // ---- free air for floating props (the deck-in-the-void track): same idea as sample(), but anywhere around the road
  Z.airSpot = (o) => {
    const { n, dist = [30, 70], dy = [-8, 14], r = 5, tries = 40, bigSep = 90 } = o, out = [];
    for (let k = 0; k < n; k++) for (let t = 0; t < tries; t++) {
      const s = (((k + rng()) * L) / n) % L, side = rng() < 0.5 ? -1 : 1, lat = wallDist + 0.55 + R(dist[0], dist[1]), a = K.at(s, side * lat), y = a.y + R(dy[0], dy[1]);
      if (Z.nearStart(s, 14) || X.nearest(a.x, a.z) < lat - 1.5) continue;
      if (Z.big.some((p) => (p.x - a.x) ** 2 + (p.z - a.z) ** 2 < bigSep * bigSep)) continue;
      if (occ.blocked(a.x, a.z, r, y - r, y + r)) continue;
      occ.mark(a.x, a.z, r, y - r, y + r);
      const sp = { x: a.x, y, z: a.z, s, side, ry: Z.facing(a, side), rx: a.rx, rz: a.rz }; out.push(sp); Z.big.push(sp); break;
    }
    return out;
  };

  // ---- flapping things that circle a point (bats, butterflies): one mesh, all motion in the vertex shader.
  // geo: non-indexed, vertex-coloured, +z = forward, wings along +/-x. items: {cx, cy, cz, R (orbit radius), w (rad/s, sign = direction), ph, bob, s, c (tint)}
  Z.swarm = (geo, items, o = {}) => {
    const n = items.length; if (!n) return null;
    const g0 = geo.index ? geo.toNonIndexed() : geo, V = g0.attributes.position.count, pa = g0.attributes.position, ca = g0.attributes.color;
    const pos = new Float32Array(n * V * 3), col = new Float32Array(n * V * 3), aC = new Float32Array(n * V * 3), aP = new Float32Array(n * V * 4), aS = new Float32Array(n * V), tint = new THREE.Color();
    items.forEach((it, k) => {
      if (it.c !== undefined) tint.set(it.c); else tint.setRGB(1, 1, 1);
      for (let v = 0; v < V; v++) {
        const q = k * V + v;
        pos[q * 3] = pa.getX(v); pos[q * 3 + 1] = pa.getY(v); pos[q * 3 + 2] = pa.getZ(v);
        col[q * 3] = (ca ? ca.getX(v) : 1) * tint.r; col[q * 3 + 1] = (ca ? ca.getY(v) : 1) * tint.g; col[q * 3 + 2] = (ca ? ca.getZ(v) : 1) * tint.b;
        aC[q * 3] = it.cx; aC[q * 3 + 1] = it.cy; aC[q * 3 + 2] = it.cz;
        aP[q * 4] = it.R; aP[q * 4 + 1] = it.w; aP[q * 4 + 2] = it.ph; aP[q * 4 + 3] = it.bob ?? 0.4;
        aS[q] = it.s ?? 1;
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.setAttribute("aC", new THREE.BufferAttribute(aC, 3)); g.setAttribute("aP", new THREE.BufferAttribute(aP, 4)); g.setAttribute("aS", new THREE.BufferAttribute(aS, 1));
    const m = own(new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uFlap: { value: o.flap ?? 16 }, uAmp: { value: o.amp ?? 0.9 } }]),
      vertexColors: true, side: THREE.DoubleSide, fog: true,
      vertexShader: `uniform float uTime; uniform float uFlap; uniform float uAmp; attribute vec3 aC; attribute vec4 aP; attribute float aS; varying vec3 vCol;
        #include <common>
        #include <fog_pars_vertex>
        void main(){
          float a = uTime * aP.y + aP.z, sg = aP.y >= 0.0 ? 1.0 : -1.0;
          vec3 l = position * aS;
          l.y += sin(uTime * uFlap + aP.z * 5.0) * uAmp * abs(position.x) * aS;
          vec2 d = vec2(-sin(a), cos(a)) * sg;
          vec3 r = vec3(l.x * d.y + l.z * d.x, l.y, -l.x * d.x + l.z * d.y);
          vec3 wp = aC + vec3(cos(a) * aP.x, sin(uTime * 1.7 + aP.z * 3.0) * aP.w, sin(a) * aP.x) + r;
          vec4 mvPosition = modelViewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          vCol = color;
          #include <fog_vertex>
        }`,
      fragmentShader: `varying vec3 vCol;
        #include <common>
        #include <fog_pars_fragment>
        void main(){ gl_FragColor = vec4(vCol, 1.0);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    }));
    const mesh = new THREE.Mesh(own(g), m); mesh.frustumCulled = false; mesh.name = o.name || "season-swarm"; group.add(mesh);
    anim.push((dt, t) => { m.uniforms.uTime.value = t; });
    Z.stats.calls++; Z.stats.inst += n; Z.stats.tris += (V / 3) * n;
    return mesh;
  };

  // ---- a light dusting of snow over the terrain's colours
  Z.snowGround = (amount = 0.6) => {
    const tm = group.getObjectByName("terrain"), ca = tm?.geometry?.attributes?.color; if (!ca) return;
    const white = new THREE.Color(0xf2f7ff), c = new THREE.Color();
    for (let i = 0; i < ca.count; i++) { c.setRGB(ca.getX(i), ca.getY(i), ca.getZ(i)).lerp(white, amount); ca.setXYZ(i, c.r, c.g, c.b); }
    ca.needsUpdate = true;
  };

  // ---- gentle falling snow around the camera (skip where the track already has its own)
  Z.snowfall = (o = {}) => {
    const n = o.count ?? 1500, pos = new Float32Array(n * 3), sz = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = rng() * 120; pos[i * 3 + 1] = rng() * 60; pos[i * 3 + 2] = rng() * 120; sz[i] = 0.5 + rng(); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("size", new THREE.BufferAttribute(sz, 1));
    const m = own(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, fog: false,
      vertexShader: `uniform float uTime; attribute float size; varying float vA;
        void main(){ vec3 p = position; p.y -= uTime * (2.6 + size * 1.4); p.x += sin(uTime * 0.6 + position.z) * 1.6; p = mod(p, vec3(120.0, 60.0, 120.0)) - vec3(60.0, 10.0, 60.0);
          vec3 w = p + cameraPosition; vec4 mv = viewMatrix * vec4(w, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(size * 110.0 / -mv.z, 1.0, 5.0); vA = smoothstep(60.0, 20.0, length(p)); }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, vA * smoothstep(0.5, 0.15, d) * 0.85); }`,
    }));
    const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = 5; p.name = "season-snow"; group.add(p); own(g);
    anim.push((dt, t) => { m.uniforms.uTime.value = t; });
  };

  return Z;
}
