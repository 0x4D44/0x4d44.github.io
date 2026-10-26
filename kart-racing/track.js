// Apex Karts - procedural tracks: centreline maths, road/kerb/wall meshes, scenery, themes.
// See SPEC.md (section A) for the contract. Browser-only (uses canvas textures).
import * as THREE from "three";
import { TRACK_DEFS, splineClosed, elevAt } from "./trackdefs.js";
import { makeRng, clamp } from "./roster.js";

const TAU = Math.PI * 2;
const KERB_W = 1.3;
const DS = 2;                 // centreline resample step (m)
const Y_GROUND = -0.03, Y_SHOULDER = 0.0, Y_ROAD = 0.04, Y_KERB = 0.06, Y_DECAL = 0.075;

// ---------------------------------------------------------------- themes
const THEMES = {
  sunset: {
    shoulder: 4.2, kerb: [0xd9262c, 0xffffff], wallBase: "#f2efe8", wallAccent: "#e8453c", wallText: ["ZOOM COLA", "APEX KARTS", "SURF CO", "BOLT TYRES"],
    asphalt: "#4b4a52", line: "#f4efe4", padColor: "#ffb020", padColor2: "#ff5a1f",
    ground: "#86a94f", groundVar: 14, shoulderCol: "#d9c394",
    fog: [0xf3b48c, 140, 900],
    hemi: [0xffe3c8, 0x6d5a4a, 1.05], sun: { color: 0xffc28a, i: 2.5, dir: [-0.48, 0.40, -0.78] },
    sky: { stops: [[0, "#26306e"], [0.18, "#7a4a86"], [0.34, "#e2698a"], [0.44, "#ffa869"], [0.5, "#ffd49a"], [0.56, "#f3b48c"], [1, "#f3b48c"]], sun: { glow: "#ffe2a8", disc: "#fff4d0", size: 0.016 }, clouds: "#ff9a7a", ridge: ["#8f5f7e", "#6e4a6a"], stars: false },
  },
  snow: {
    shoulder: 4.5, kerb: [0x2d7fd6, 0xf4fbff], wallBase: "#eaf3fb", wallAccent: "#2d7fd6", wallText: ["NORDIC OIL", "APEX KARTS", "ICE FEST", "PEAK GEAR"],
    asphalt: "#55585f", line: "#f6fbff", padColor: "#5ee8ff", padColor2: "#2d8cff",
    ground: "#e4eef7", groundVar: 8, shoulderCol: "#cfe0ee",
    fog: [0xcfe4f7, 110, 760],
    hemi: [0xd6e9ff, 0xb9c9d8, 1.15], sun: { color: 0xfff1d6, i: 2.3, dir: [0.42, 0.62, 0.5] },
    sky: { stops: [[0, "#3f86d8"], [0.3, "#7fb6ec"], [0.45, "#b9dcf8"], [0.5, "#d3e8f8"], [0.56, "#cfe4f7"], [1, "#cfe4f7"]], sun: { glow: "#fff6dd", disc: "#ffffff", size: 0.02 }, clouds: "#ffffff", ridge: ["#aac4de", "#8aa7c6"], stars: false },
  },
  neon: {
    shoulder: 4.0, kerb: [0xff2bd6, 0x19e6ff], wallBase: "#1c2036", wallAccent: "#19e6ff", wallText: ["NEON DOCKS", "APEX KARTS", "NITRO", "ZAP-X"],
    asphalt: "#2e2e3c", line: "#8defff", padColor: "#ff3df0", padColor2: "#19e6ff",
    ground: "#2a2c3e", groundVar: 6, shoulderCol: "#34374c",
    fog: [0x120a2c, 70, 560],
    hemi: [0x5a5ab8, 0x1a1530, 1.25], sun: { color: 0x93a4ff, i: 1.1, dir: [0.3, 0.7, 0.45] },
    sky: { stops: [[0, "#04020d"], [0.3, "#0b0620"], [0.44, "#2a1050"], [0.5, "#5a1a7a"], [0.56, "#120a2c"], [1, "#120a2c"]], sun: { glow: "#cdd6ff", disc: "#f4f6ff", size: 0.012 }, clouds: "#3b1a66", ridge: ["#1a0f3a", "#120a2c"], stars: true },
  },
};

// ---------------------------------------------------------------- small helpers
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const wrapS = (s, L) => { s %= L; return s < 0 ? s + L : s; };
const wrapD = (d, L) => { d %= L; if (d > L / 2) d -= L; else if (d < -L / 2) d += L; return d; };

function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function toTex(c, { repeat = true, aniso = 8, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}
function noiseFill(ctx, w, h, rng, n, alpha, light = 255, dark = 0, size = 2) {
  for (let i = 0; i < n; i++) {
    const v = rng() < 0.5 ? dark : light;
    ctx.fillStyle = `rgba(${v},${v},${v},${rng() * alpha})`;
    ctx.fillRect(rng() * w, rng() * h, size * (0.5 + rng()), size * (0.5 + rng()));
  }
}

// Merge a list of {g, m (Matrix4), c (Color)} into one non-indexed BufferGeometry with vertex colours.
function bake(parts) {
  let count = 0;
  const gs = parts.map((p) => { const g = p.g.index ? p.g.toNonIndexed() : p.g; count += g.attributes.position.count; return g; });
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  let o = 0;
  parts.forEach((p, k) => {
    const g = gs[k], pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv;
    nm.getNormalMatrix(p.m);
    const c = p.c || new THREE.Color(1, 1, 1);
    for (let i = 0; i < pa.count; i++, o++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(p.m); pos.set([v.x, v.y, v.z], o * 3);
      v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); nor.set([v.x, v.y, v.z], o * 3);
      col.set([c.r, c.g, c.b], o * 3);
      if (ua) uv.set([ua.getX(i), ua.getY(i)], o * 2);
    }
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return out;
}
const M4 = new THREE.Matrix4(), Q4 = new THREE.Quaternion(), V3a = new THREE.Vector3(), V3b = new THREE.Vector3(), E4 = new THREE.Euler();
function mat(x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  Q4.setFromEuler(E4.set(rx, ry, rz)); return new THREE.Matrix4().compose(V3a.set(x, y, z), Q4, V3b.set(sx, sy, sz));
}
const col = (hex) => new THREE.Color(hex);
function part(g, m, hex) { return { g, m, c: col(hex) }; }

// ---------------------------------------------------------------- strip (road-like ribbon) builder
class Strips {
  constructor(C) { this.C = C; this.pos = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
  // profile: [[lateral, y, u], ...] swept along centreline samples from..from+count
  add({ profile, from = 0, count = this.C.N, tile = 10, vBase = 0, mask = null, swap = false, vSign = 1, color = null }) {
    const { N, px, pz, tx, tz, py, ds } = this.C;
    for (let k = 0; k < count; k++) {
      const i = (from + k) % N, i2 = (i + 1) % N;
      if (mask && !mask(i)) continue;
      const v0 = vSign * ((from + k - vBase) * ds) / tile, v1 = vSign * ((from + k + 1 - vBase) * ds) / tile;
      const r0x = -tz[i], r0z = tx[i], r1x = -tz[i2], r1z = tx[i2];
      for (let j = 0; j < profile.length - 1; j++) {
        const [la, ya, ua] = profile[j], [lb, yb, ub] = profile[j + 1];
        const base = this.n;
        this.pos.push(
          px[i] + r0x * la, py[i] + ya, pz[i] + r0z * la,
          px[i] + r0x * lb, py[i] + yb, pz[i] + r0z * lb,
          px[i2] + r1x * la, py[i2] + ya, pz[i2] + r1z * la,
          px[i2] + r1x * lb, py[i2] + yb, pz[i2] + r1z * lb);
        if (swap) this.uv.push(v0, ua, v0, ub, v1, ua, v1, ub); else this.uv.push(ua, v0, ub, v0, ua, v1, ub, v1);
        const c = color ? color(i, j) : [1, 1, 1];
        for (let q = 0; q < 4; q++) this.col.push(c[0], c[1], c[2]);
        this.idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
        this.n += 4;
      }
    }
    return this;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

// ---------------------------------------------------------------- centreline
function buildCentreline(def) {
  const dense = splineClosed(def.points, 64);
  const M = dense.length, cum = new Float64Array(M + 1);
  for (let i = 1; i <= M; i++) { const a = dense[i - 1], b = dense[i % M]; cum[i] = cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z); }
  const L0 = cum[M], N = Math.round(L0 / DS), ds = L0 / N;
  const px = new Float64Array(N), pz = new Float64Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = i * ds; while (cum[j + 1] < s) j++;
    const f = (s - cum[j]) / (cum[j + 1] - cum[j]), a = dense[j], b = dense[(j + 1) % M];
    px[i] = a.x + (b.x - a.x) * f; pz[i] = a.z + (b.z - a.z) * f;
  }
  const tx = new Float64Array(N), tz = new Float64Array(N), th = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i + N - 1) % N, b = (i + 1) % N;
    const dx = px[b] - px[a], dz = pz[b] - pz[a], l = Math.hypot(dx, dz);
    tx[i] = dx / l; tz[i] = dz / l; th[i] = Math.atan2(tx[i], tz[i]);
  }
  // signed curvature (+ve = right) from heading change, smoothed
  const raw = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let d = th[(i + 2) % N] - th[(i + N - 2) % N];
    while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
    raw[i] = -d / (4 * ds);
  }
  const curv = new Float64Array(N);
  for (let i = 0; i < N; i++) { let a = 0; for (let k = -4; k <= 4; k++) a += raw[(i + k + N) % N]; curv[i] = a / 9; }
  const py = new Float64Array(N);
  for (let i = 0; i < N; i++) py[i] = elevAt(def.elev || [[0, 0], [0.5, 0]], i / N);
  return { N, ds, length: L0, px, pz, tx, tz, th, curv, py };
}

// ---------------------------------------------------------------- the track
export function createTrack(id) {
  const def = TRACK_DEFS.find((d) => d.id === id) || TRACK_DEFS[0];
  const theme = THEMES[def.theme];
  const C = buildCentreline(def);
  const { N, ds, px, pz, tx, tz, curv, py } = C;
  const L = C.length;
  const hw = def.width / 2;
  const wallDist = hw + KERB_W + theme.shoulder;
  const rng = makeRng(hashStr(def.id));
  const disposables = [];
  const track = { id: def.id, name: def.name, laps: def.laps, length: L, def };

  // ---- bounds + minimap
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < N; i++) { minX = Math.min(minX, px[i]); maxX = Math.max(maxX, px[i]); minZ = Math.min(minZ, pz[i]); maxZ = Math.max(maxZ, pz[i]); }
  track.bounds = { minX, maxX, minZ, maxZ };
  track.minimap = [];
  for (let k = 0; k < 160; k++) { const i = Math.floor((k * N) / 160); track.minimap.push({ x: px[i], z: pz[i] }); }

  // ---- kerb flags per side (inside of corners, both sides when tight)
  const kerbL = new Uint8Array(N), kerbR = new Uint8Array(N);
  {
    const fl = new Uint8Array(N), fr = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const k = curv[i];
      if (k > 0.0042) fr[i] = 1; else if (k < -0.0042) fl[i] = 1;
      if (k > 0.011) fl[i] = 1; else if (k < -0.011) fr[i] = 1;
    }
    for (let i = 0; i < N; i++) for (let d = -5; d <= 5; d++) { const j = (i + d + N) % N; if (fl[j]) kerbL[i] = 1; if (fr[j]) kerbR[i] = 1; }
  }

  // ---- ai racing line: elastic band between neighbours, clamped inside the road
  const lineLat = new Float64Array(N);
  {
    const lim = hw - 3.4, K = 5, rx = (i) => -tz[i], rz = (i) => tx[i];
    for (let it = 0; it < 900; it++) {
      for (let i = 0; i < N; i++) {
        const a = (i + N - K) % N, b = (i + K) % N;
        const ax = px[a] + rx(a) * lineLat[a], az = pz[a] + rz(a) * lineLat[a];
        const bx = px[b] + rx(b) * lineLat[b], bz = pz[b] + rz(b) * lineLat[b];
        const mx = (ax + bx) / 2 - px[i], mz = (az + bz) / 2 - pz[i];
        const t = mx * rx(i) + mz * rz(i);
        lineLat[i] = clamp(lineLat[i] * 0.4 + t * 0.6, -lim, lim);
      }
    }
    const tmp = new Float64Array(N);
    for (let p = 0; p < 6; p++) {
      for (let i = 0; i < N; i++) { let a = 0; for (let k = -7; k <= 7; k++) a += lineLat[(i + k + N) % N]; tmp[i] = a / 15; }
      lineLat.set(tmp);
    }
  }

  // ---- sampling API
  const smp = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), slope: 0, halfWidth: hw, wallDist };
  track.sample = (s) => {
    s = wrapS(s, L);
    const f = s / ds, i = Math.floor(f) % N, i2 = (i + 1) % N, t = f - Math.floor(f);
    let ax = tx[i] + (tx[i2] - tx[i]) * t, az = tz[i] + (tz[i2] - tz[i]) * t;
    const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
    smp.pos.set(px[i] + (px[i2] - px[i]) * t, py[i] + (py[i2] - py[i]) * t, pz[i] + (pz[i2] - pz[i]) * t);
    smp.tangent.set(ax, 0, az);
    smp.right.set(-az, 0, ax);
    const sl = (py[i2] - py[i]) / ds; smp.slope = sl;
    const nl = Math.hypot(sl, 1); smp.normal.set(-sl * ax / nl, 1 / nl, -sl * az / nl);
    return smp;
  };
  const lerpArr = (arr, s) => { s = wrapS(s, L); const f = s / ds, i = Math.floor(f) % N, t = f - Math.floor(f); return arr[i] + (arr[(i + 1) % N] - arr[i]) * t; };
  track.aiLine = (s) => lerpArr(lineLat, s);
  track.curvature = (s) => lerpArr(curv, s);

  // ---- boost pads
  track.boostPads = [];
  for (const p of def.pads || []) {
    const lateral = p.lat === "line" ? lerpArr(lineLat, p.s) : p.lat * (hw - p.wid / 2 - 0.8);
    track.boostPads.push({ s: wrapS(p.s, L), lateral, length: p.len, width: p.wid });
  }

  // ---- locate()
  // best segment by horizontal distance (+ vertical mismatch when y is known, to separate crossing legs)
  let bestH = 0;
  function search(x, y, z, from, count) {
    let best = 1e18, bi = 0, bt = 0;
    const hasY = typeof y === "number";
    for (let k = 0; k < count; k++) {
      const i = (from + k + N) % N, i2 = (i + 1) % N;
      const ax = px[i], az = pz[i], bx = px[i2] - ax, bz = pz[i2] - az;
      let t = ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = x - ax - bx * t, dz = z - az - bz * t;
      let d2 = dx * dx + dz * dz;
      const dh = d2;
      if (hasY) { const dy = y - (py[i] + (py[i2] - py[i]) * t); d2 += dy * dy; }
      if (d2 < best) { best = d2; bi = i; bt = t; bestH = dh; }
    }
    return [best, bi, bt];
  }
  track.locate = (pos, hintS) => {
    const x = pos.x, z = pos.z, py0 = pos.y;
    let r;
    if (hintS === undefined || hintS === null || Number.isNaN(hintS)) r = search(x, py0, z, 0, N);
    else {
      r = search(x, py0, z, Math.round(wrapS(hintS, L) / ds) - 30, 61);   // +-60 m around the hint: never jumps to the other crossing leg
      if (r[0] > 50 * 50) r = search(x, py0, z, 0, N);
    }
    const [, i, tt] = r, i2 = (i + 1) % N, d2 = bestH;
    let t = tt;
    for (let k = 0; k < 2; k++) {
      let bx = tx[i] + (tx[i2] - tx[i]) * t, bz = tz[i] + (tz[i2] - tz[i]) * t; const bl = Math.hypot(bx, bz) || 1;
      const ex = x - (px[i] + (px[i2] - px[i]) * t), ez = z - (pz[i] + (pz[i2] - pz[i]) * t);
      t += ((ex * bx + ez * bz) / bl) / ds; t = t < 0 ? 0 : t > 1 ? 1 : t;
    }
    let ax = tx[i] + (tx[i2] - tx[i]) * t, az = tz[i] + (tz[i2] - tz[i]) * t;
    const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
    const cx = px[i] + (px[i2] - px[i]) * t, cz = pz[i] + (pz[i2] - pz[i]) * t;
    const lateral = (x - cx) * -az + (z - cz) * ax;
    const s = (i + t) * ds, al = Math.abs(lateral), y = py[i] + (py[i2] - py[i]) * t;
    const vOk = typeof py0 !== "number" || Math.abs(py0 - y) <= 3;
    let surface = "grass", boost = false, onRoad = false;
    if (vOk && al <= hw) {
      surface = "road"; onRoad = true;
      for (const p of track.boostPads) {
        if (Math.abs(wrapD(s - p.s, L)) <= p.length / 2 && Math.abs(lateral - p.lateral) <= p.width / 2) { boost = true; surface = "boost"; break; }
      }
    } else if (vOk && al <= hw + KERB_W && (lateral > 0 ? kerbR[i] : kerbL[i])) { surface = "kerb"; onRoad = true; }
    return { s, lateral, y, halfWidth: hw, wallDist, onRoad, surface, boost, dist: Math.sqrt(d2) };
  };

  // ---- grid
  track.grid = (i) => {
    const row = Math.floor(i / 2), side = i % 2 ? 1 : -1;
    const s = -(6 + row * 7.5 + (i % 2) * 3.8);
    const sp = track.sample(s);
    const lat = side * Math.min(hw * 0.38, 4.2);
    return { pos: new THREE.Vector3(sp.pos.x + sp.right.x * lat, sp.pos.y, sp.pos.z + sp.right.z * lat), heading: Math.atan2(sp.tangent.x, sp.tangent.z) };
  };

  // ---- spatial grid for scenery queries
  const CELL = 32, cells = new Map();
  const ck = (cx, cz) => cx * 73856093 ^ cz * 19349663;
  for (let i = 0; i < N; i++) { const k = ck(Math.floor(px[i] / CELL), Math.floor(pz[i] / CELL)); let a = cells.get(k); if (!a) cells.set(k, (a = [])); a.push(i); }
  const nearest = (x, z) => {
    let best = 1e18; const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const arr = cells.get(ck(cx + a, cz + b)); if (!arr) continue;
      for (let q = 0; q < arr.length; q++) { const i = arr[q], dx = x - px[i], dz = z - pz[i], d = dx * dx + dz * dz; if (d < best) best = d; }
    }
    return Math.sqrt(best);   // 1e9 when nothing within ~64 m
  };
  track.nearestDist = nearest;

  // ---- item boxes (clusters across the road)
  track.itemBoxes = [];
  const counts = [4, 3, 5, 4, 3, 4];
  (def.itemAt || [0.1, 0.3, 0.5, 0.7, 0.9]).forEach((fr, ci) => {
    const s = fr * L, n = counts[ci % counts.length], span = hw - 2.6;
    for (let k = 0; k < n; k++) {
      const lat = n === 1 ? 0 : -span + (2 * span * k) / (n - 1);
      const sp = track.sample(s);
      track.itemBoxes.push({ pos: new THREE.Vector3(sp.pos.x + sp.right.x * lat, sp.pos.y + 1.2, sp.pos.z + sp.right.z * lat), s });
    }
  });

  // ---- crossings: where a leg passes >3.5 m above another, the upper leg becomes a viaduct (terrain ignores it)
  const cor = new Float64Array(N).fill(1);
  const bridgeIdx = [];
  {
    const R2 = (wallDist + 1.5) ** 2;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const sep = Math.min(Math.abs(i - j), N - Math.abs(i - j)) * ds;
      if (sep < 120 || py[i] - py[j] < 3.5) continue;
      if ((px[i] - px[j]) ** 2 + (pz[i] - pz[j]) ** 2 < R2) { bridgeIdx.push(i); break; }
    }
    for (let i = 0; i < N; i++) {
      let dmin = 1e9; for (const b of bridgeIdx) { const d = Math.min(Math.abs(i - b), N - Math.abs(i - b)) * ds; if (d < dmin) dmin = d; }
      const u = Math.min(1, Math.max(0, (dmin - 62) / 55)); cor[i] = u * u * (3 - 2 * u);
    }
  }
  track.crossings = bridgeIdx.length ? { upperS: bridgeIdx.map((i) => i * ds) } : null;

  // ---- shoreline / lake (terrain is carved around these)
  const shore = def.theme === "sunset" ? { kind: "sea", z: track.bounds.minZ - 70 } : def.theme === "neon" ? { kind: "quay", z: track.bounds.maxZ + wallDist + 26 } : null;
  let lake = null;
  if (def.theme === "snow") {
    let best = null, bd = 1e9; const cxx = (track.bounds.minX + track.bounds.maxX) / 2, czz = (track.bounds.minZ + track.bounds.maxZ) / 2;
    for (let x = track.bounds.minX - 260; x <= track.bounds.maxX + 260; x += 20) for (let z = track.bounds.minZ - 260; z <= track.bounds.maxZ + 260; z += 20) {
      let d = 1e9; for (let q = 0; q < N; q += 2) { const dd = Math.hypot(x - px[q], z - pz[q]); if (dd < d) d = dd; } if (d < 135) continue; const dc = Math.hypot(x - cxx, z - czz); if (dc < bd) { bd = dc; best = { x, z }; }
    }
    lake = best ? { x: best.x, z: best.z, r: 70 } : null;
  }

  // ================================================================= visuals
  const group = new THREE.Group(); group.name = "track-" + def.id;
  track.group = group;
  const anim = [];            // update callbacks (dt,time)
  const own = (o) => { disposables.push(o); return o; };
  const tile = L / Math.round(L / (def.width * 1.0));  // road texture tile along s

  // ---- textures
  function roadTexture() {
    const W = 512, c = canvas(W, W), g = c.getContext("2d");
    g.fillStyle = theme.asphalt; g.fillRect(0, 0, W, W);
    noiseFill(g, W, W, rng, 9000, 0.10, 255, 0, 2); noiseFill(g, W, W, rng, 9000, 0.14, 0, 0, 3);
    // tyre-wear lanes
    for (const cx of [0.3, 0.7]) { const gr = g.createLinearGradient((cx - 0.09) * W, 0, (cx + 0.09) * W, 0); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(0.5, "rgba(0,0,0,0.20)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect((cx - 0.09) * W, 0, 0.18 * W, W); }
    // patches / cracks
    g.strokeStyle = "rgba(0,0,0,0.25)"; g.lineWidth = 1.2;
    for (let i = 0; i < 7; i++) { g.beginPath(); let x = rng() * W, y = rng() * W; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rng() - 0.5) * 50; y += rng() * 40; g.lineTo(x, y); } g.stroke(); }
    if (def.theme === "snow") { for (let i = 0; i < 90; i++) { const side = rng() < 0.5 ? 0 : 1, x = side ? W - rng() * 60 : rng() * 60; g.fillStyle = `rgba(240,248,255,${0.15 + rng() * 0.35})`; g.beginPath(); g.ellipse(x, rng() * W, 4 + rng() * 14, 8 + rng() * 22, 0, 0, TAU); g.fill(); } }
    if (def.theme === "neon") { for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${rng() < 0.5 ? "255,60,240" : "30,230,255"},${0.03 + rng() * 0.05})`; g.fillRect(rng() * W, rng() * W, 3 + rng() * 12, 30 + rng() * 120); } }
    // markings: edge lines + dashed centre
    g.fillStyle = theme.line;
    const lw = 0.0115 * W;
    g.globalAlpha = 0.92;
    g.fillRect(0.035 * W, 0, lw, W); g.fillRect((0.965 - 0.0115) * W, 0, lw, W);
    for (let k = 0; k < 3; k++) g.fillRect(0.5 * W - lw * 0.4, (k / 3) * W, lw * 0.8, W / 6);
    g.globalAlpha = 1;
    if (def.theme === "neon") { g.globalAlpha = 0.35; g.fillStyle = "#19e6ff"; g.fillRect(0.028 * W, 0, lw * 2.4, W); g.fillRect((0.972 - 0.0285) * W, 0, lw * 2.4, W); g.globalAlpha = 1; }
    return own(toTex(c));
  }
  function kerbTexture() {
    const c = canvas(64, 128), g = c.getContext("2d");
    g.fillStyle = "#" + new THREE.Color(theme.kerb[0]).getHexString(); g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#" + new THREE.Color(theme.kerb[1]).getHexString(); g.fillRect(0, 64, 64, 64);
    noiseFill(g, 64, 128, rng, 300, 0.12, 255, 0, 1.5);
    return own(toTex(c));
  }
  function groundTexture(base, varA, size = 256) {
    const c = canvas(size, size), g = c.getContext("2d");
    g.fillStyle = base; g.fillRect(0, 0, size, size);
    for (let i = 0; i < 70; i++) { const v = (rng() - 0.5) * varA * 2.4; g.fillStyle = v > 0 ? `rgba(255,255,255,${v / 255})` : `rgba(0,0,0,${-v / 255})`; g.beginPath(); g.ellipse(rng() * size, rng() * size, 6 + rng() * 22, 6 + rng() * 22, rng() * 3, 0, TAU); g.fill(); }
    noiseFill(g, size, size, rng, 5000, 0.12, 255, 0, 2);
    const t = toTex(c); return own(t);
  }
  function wallTexture() {
    const c = canvas(1024, 128), g = c.getContext("2d");
    g.fillStyle = theme.wallBase; g.fillRect(0, 0, 1024, 128);
    // panel layout: bottom band accent, upper white panel with sponsor text, top cap grey
    g.fillStyle = theme.wallAccent; g.fillRect(0, 128 * 0.78, 1024, 128 * 0.22);        // base band (u 0..0.22) is at canvas bottom
    g.fillStyle = "rgba(0,0,0,0.18)";
    for (let x = 0; x < 1024; x += 256) g.fillRect(x, 0, 3, 128);
    g.fillStyle = def.theme === "neon" ? "#e8fbff" : theme.wallAccent; g.font = "900 31px Arial Black, Impact, sans-serif"; g.textBaseline = "middle"; g.textAlign = "center";
    theme.wallText.forEach((t, i) => { g.fillText(t, 128 + i * 256, 54); });
    g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(0, 0, 1024, 14);     // top cap
    noiseFill(g, 1024, 128, rng, 1800, 0.08, 255, 0, 2);
    if (def.theme === "neon") { g.fillStyle = "#19e6ff"; g.fillRect(0, 0, 1024, 5); g.fillStyle = "#ff2bd6"; g.fillRect(0, 128 * 0.78 - 3, 1024, 3); }
    return own(toTex(c));
  }
  function padTexture() {
    const c = canvas(128, 128), g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, "#0c1030"); gr.addColorStop(0.5, "#16205a"); gr.addColorStop(1, "#0c1030");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    g.fillStyle = theme.padColor;
    for (let k = 0; k < 2; k++) { const y = k * 64; g.beginPath(); g.moveTo(8, y + 50); g.lineTo(64, y + 6); g.lineTo(120, y + 50); g.lineTo(120, y + 62); g.lineTo(64, y + 18); g.lineTo(8, y + 62); g.closePath(); g.fill(); }
    g.strokeStyle = theme.padColor2; g.lineWidth = 6; g.strokeRect(3, 0, 122, 128);
    return own(toTex(c));
  }

  const roadTex = roadTexture();
  const kerbTex = kerbTexture();
  const wallTex = wallTexture();
  const padTex = padTexture();

  // ---- materials
  const mRoad = own(new THREE.MeshStandardMaterial({ map: roadTex, roughness: def.theme === "neon" ? 0.42 : 0.92, metalness: def.theme === "neon" ? 0.25 : 0.0 }));
  const mKerb = own(def.theme === "neon" ? new THREE.MeshBasicMaterial({ map: kerbTex }) : new THREE.MeshLambertMaterial({ map: kerbTex }));
  const mWall = own(def.theme === "neon" ? new THREE.MeshLambertMaterial({ map: wallTex, emissive: 0x303a66, emissiveMap: wallTex, side: THREE.DoubleSide, vertexColors: true }) : new THREE.MeshLambertMaterial({ map: wallTex, side: THREE.DoubleSide, vertexColors: true }));
  const shTex = groundTexture(theme.shoulderCol, 10); shTex.repeat.set(1, 1);
  const mShoulder = own(new THREE.MeshLambertMaterial({ map: shTex }));
  const mPad = own(new THREE.MeshBasicMaterial({ map: padTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));

  // ---- road, kerbs, shoulders, walls
  const roadStrip = new Strips(C).add({ profile: [[-hw, Y_ROAD, 0], [hw, Y_ROAD, 1]], tile });
  const road = new THREE.Mesh(own(roadStrip.geometry()), mRoad); road.name = "road"; group.add(road);

  const kerbTile = 3.0, kerbT = L / Math.round(L / kerbTile);
  const kerbGeo = new Strips(C)
    .add({ profile: [[-hw, Y_KERB, 0], [-hw - KERB_W, Y_KERB, 1]], tile: kerbT, mask: (i) => kerbL[i], swap: false })
    .add({ profile: [[hw, Y_KERB, 0], [hw + KERB_W, Y_KERB, 1]], tile: kerbT, mask: (i) => kerbR[i] });
  const kerbMesh = new THREE.Mesh(own(kerbGeo.geometry()), mKerb); kerbMesh.name = "kerbs"; group.add(kerbMesh);

  const shT = 16;
  const shGeo = new Strips(C)
    .add({ profile: [[-hw, Y_SHOULDER, 0], [-wallDist - 0.6, Y_SHOULDER, 1]], tile: shT * 1.0 })
    .add({ profile: [[hw, Y_SHOULDER, 0], [wallDist + 0.6, Y_SHOULDER, 1]], tile: shT * 1.0 });
  // shoulder uv: u*? -> scale u so texture is not stretched across ~6m
  { const uv = shGeo.uv; for (let k = 0; k < uv.length; k += 2) uv[k] *= 0.4; }
  const shMesh = new THREE.Mesh(own(shGeo.geometry()), mShoulder); shMesh.name = "shoulder"; group.add(shMesh);

  // walls: inner face (u 0.22..0.95 of canvas = wall height), top cap + back as plain
  const WH = 1.05, WT = 0.55, wallT = L / Math.round(L / 16);
  const wallProfile = (sg) => [[sg * wallDist, -0.7, 0.0], [sg * wallDist, WH, 0.98], [sg * (wallDist + WT), WH, 0.95], [sg * (wallDist + WT), -0.7, 0.05]];
  const wallCol = () => [1, 1, 1];
  const wallGeo = new Strips(C)
    .add({ profile: wallProfile(-1), tile: wallT, swap: true, vSign: 1, color: (i, j) => (j === 0 ? [1, 1, 1] : [0.8, 0.8, 0.82]) })
    .add({ profile: wallProfile(1), tile: wallT, swap: true, vSign: -1, color: (i, j) => (j === 0 ? [1, 1, 1] : [0.8, 0.8, 0.82]) });
  void wallCol;
  const wallMesh = new THREE.Mesh(own(wallGeo.geometry()), mWall); wallMesh.name = "walls"; group.add(wallMesh);

  // pads
  if (track.boostPads.length) {
    const ps = new Strips(C);
    for (const p of track.boostPads) {
      const i0 = Math.floor((p.s - p.length / 2) / ds), cnt = Math.ceil(p.length / ds) + 1;
      ps.add({ profile: [[p.lateral - p.width / 2, Y_DECAL, 0], [p.lateral + p.width / 2, Y_DECAL, 1]], from: (i0 + N) % N, count: cnt, tile: 5, vBase: (i0 + N) % N });
    }
    const padMesh = new THREE.Mesh(own(ps.geometry()), mPad); padMesh.name = "pads"; group.add(padMesh);
    anim.push((dt) => { padTex.offset.y -= dt * 1.4; });
  }

  // start / finish line (checker)
  {
    const c = canvas(256, 64), g = c.getContext("2d");
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? "#111" : "#fff"; g.fillRect(x * 16, y * 16, 16, 16); }
    const t = own(toTex(c));
    const sg = new Strips(C).add({ profile: [[-hw, Y_DECAL + 0.005, 0], [hw, Y_DECAL + 0.005, 1]], from: Math.round(-1.2 / ds + N) % N, count: 2, tile: 2 * ds, vBase: 0 });
    const uv = sg.uv; for (let k = 0; k < uv.length; k += 2) { uv[k] *= 1; }
    const m = new THREE.Mesh(own(sg.geometry()), own(new THREE.MeshBasicMaterial({ map: t, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })));
    m.name = "startline"; group.add(m);
  }

  track._ctx = { THREE, C, theme, def, hw, wallDist, cor, bridgeIdx, shore, lake, rng, own, anim, group, nearest, kerbL, kerbR, lineLat, canvas, toTex, noiseFill, bake, mat, part, col, groundTexture, Strips, WH, cells, ck, CELL };

  track._ctx.groundClip = shore ? (shore.kind === "sea" ? { zMin: shore.z - 8 } : { zMax: shore.z }) : {};
  buildTerrain(track);
  buildBridges(track);
  buildScenery(track);

  // ---- ground, sky, lights
  buildEnvironment(track, theme, def);

  track.update = (dt, time) => { for (let i = 0; i < anim.length; i++) anim[i](dt, time); };
  track.dispose = () => { group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); disposables.forEach((d) => d.dispose && d.dispose()); };
  return track;
}

// ================================================================= terrain (heightfield following the road) + bridges
function buildTerrain(track) {
  const X = track._ctx;
  const { C, theme, def, wallDist, cor, shore, lake, own, group, rng, canvas, toTex, noiseFill, cells, ck, CELL } = X;
  const { N, ds, px, pz, py } = C;
  const b = track.bounds, PAD = 300, CS = 6;
  const x0 = Math.floor((b.minX - PAD) / CS) * CS, z0 = Math.floor((b.minZ - PAD) / CS) * CS;
  const nx = Math.ceil((b.maxX + PAD - x0) / CS) + 1, nz = Math.ceil((b.maxZ + PAD - z0) / CS) + 1;
  X.terrainRect = { x0, x1: x0 + (nx - 1) * CS, z0, z1: z0 + (nz - 1) * CS };
  const sm = (a, c, v) => { const t = Math.min(1, Math.max(0, (v - a) / (c - a))); return t * t * (3 - 2 * t); };
  const seed = (hashStr(def.id) % 1000) * 7.31;
  const hash2 = (ix, iz) => { let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const vnoise = (x, z) => { x += seed; z -= seed; const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz); const a = hash2(ix, iz), c = hash2(ix + 1, iz), d = hash2(ix, iz + 1), e = hash2(ix + 1, iz + 1); return (a + (c - a) * u) * (1 - v) + (d + (e - d) * u) * v; };
  const fbm = (x, z) => vnoise(x / 95, z / 95) * 0.62 + vnoise(x / 41, z / 41) * 0.28 + vnoise(x / 17, z / 17) * 0.10 - 0.5;
  const amp = def.theme === "snow" ? 20 : def.theme === "sunset" ? 13 : 1.6;

  // coarse samples for the large-scale height field
  const cs = []; for (let i = 0; i < N; i += 8) cs.push([px[i], pz[i], py[i]]);
  const bg = (x, z) => {
    let sw = 0, sy = 0, dm = 1e18;
    for (let k = 0; k < cs.length; k++) { const c = cs[k], dx = x - c[0], dz = z - c[1], d2 = dx * dx + dz * dz; if (d2 < dm) dm = d2; const w = Math.exp(-d2 / (150 * 150)); sw += w; sy += w * c[2]; }
    const dmin = Math.sqrt(dm), idw = sw > 1e-7 ? sy / sw : 0;
    const env = 1 - sm(130, 330, dmin);
    return env * (idw + amp * 2 * fbm(x, z) * sm(34, 120, dmin));
  };
  const D0 = wallDist + 2.5, BL = 30;
  const corr = (x, z, out) => {
    let wmax = 0, sw = 0, sy = 0; const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let a = -2; a <= 2; a++) for (let c = -2; c <= 2; c++) {
      const arr = cells.get(ck(cx + a, cz + c)); if (!arr) continue;
      for (let q = 0; q < arr.length; q++) {
        const i = arr[q], dx = x - px[i], dz = z - pz[i], d = Math.sqrt(dx * dx + dz * dz);
        if (d >= D0 + BL) continue;
        const wt = (d <= D0 ? 1 : 1 - sm(D0, D0 + BL, d)) * cor[i];
        if (wt <= 0) continue;
        if (wt > wmax) wmax = wt;
        const k = wt / ((d + 2) * (d + 2) * (d + 2) * (d + 2)); sw += k; sy += k * py[i];
      }
    }
    out[0] = wmax; out[1] = sw > 0 ? sy / sw : 0;
  };
  const tmp = [0, 0];
  const height = (x, z) => {
    corr(x, z, tmp);
    let h = bg(x, z);
    if (tmp[0] > 0) h += (tmp[1] - 0.12 - h) * tmp[0];
    if (lake) { const dl = Math.hypot(x - lake.x, z - lake.z); if (dl < lake.r + 26) { const ly = lake.y; h += (ly - 0.35 - h) * (1 - sm(lake.r - 4, lake.r + 26, dl)); } }
    if (shore) {
      if (shore.kind === "sea") h = -3 + (h + 3) * sm(shore.z - 2, shore.z + 42, z);
      else h = -3 + (h + 3) * (1 - sm(shore.z, shore.z + 2.5, z));
    }
    return h;
  };
  if (lake) lake.y = bg(lake.x, lake.z);
  X.lakeInfo = lake;

  const H = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = height(x0 + i * CS, z0 + j * CS);
  const groundY = (x, z) => {
    const fx = (x - x0) / CS, fz = (z - z0) / CS;
    if (fx < 0 || fz < 0 || fx >= nx - 1 || fz >= nz - 1) return 0;
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const a = H[j * nx + i], c = H[j * nx + i + 1], d = H[(j + 1) * nx + i], e = H[(j + 1) * nx + i + 1];
    return (a + (c - a) * tx) * (1 - tz) + (d + (e - d) * tx) * tz;
  };
  track.groundY = groundY; X.groundY = groundY;

  // geometry + colours
  const pos = new Float32Array(nx * nz * 3), colA = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
  const gGrass = new THREE.Color(theme.ground), gAlt = new THREE.Color(theme.ground).offsetHSL(0.02, 0.02, -0.07);
  const sand = new THREE.Color(0xe2cf9c), rock = new THREE.Color(def.theme === "snow" ? 0x667689 : def.theme === "neon" ? 0x0f1018 : 0x8d7b69), dirt = new THREE.Color(0x8a7a5e), snowC = new THREE.Color(0xf0f6fb);
  const tc = new THREE.Color();
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = x0 + i * CS, z = z0 + j * CS, h = H[k];
    const hx = (H[j * nx + Math.min(nx - 1, i + 1)] - H[j * nx + Math.max(0, i - 1)]) / (2 * CS), hz = (H[Math.min(nz - 1, j + 1) * nx + i] - H[Math.max(0, j - 1) * nx + i]) / (2 * CS);
    const slope = Math.hypot(hx, hz);
    const n = vnoise(x / 23, z / 23);
    tc.copy(gGrass).lerp(gAlt, n);
    if (def.theme === "sunset") { if (h < 1.8 && shore) tc.lerp(sand, sm(1.8, 0.2, h) * (1 - sm(shore.z + 30, shore.z + 90, z))); if (h > 5) tc.lerp(dirt, 0.25 * sm(5, 12, h) * n); }
    if (def.theme === "snow") { tc.lerp(snowC, 0.5 * n); }
    tc.lerp(rock, sm(def.theme === "snow" ? 0.5 : 0.42, 0.85, slope));
    if (shore && ((shore.kind === "sea" && h < -0.1) || (shore.kind === "quay" && z > shore.z))) tc.set(def.theme === "neon" ? 0x0b0e1c : 0x7a6a50);
    pos.set([x, h, z], k * 3); colA.set([tc.r, tc.g, tc.b], k * 3); uv.set([x / 26, z / 26], k * 2);
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6); let q = 0;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, c = a + 1, d = a + nx, e = d + 1; idx[q++] = a; idx[q++] = d; idx[q++] = c; idx[q++] = c; idx[q++] = d; idx[q++] = e; }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(colA, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
  const dc = canvas(128, 128), dg = dc.getContext("2d"); dg.fillStyle = "#d8d8d8"; dg.fillRect(0, 0, 128, 128); noiseFill(dg, 128, 128, rng, 3000, 0.25, 255, 90, 2);
  for (let i = 0; i < 30; i++) { dg.fillStyle = `rgba(${rng() < 0.5 ? 255 : 120},${rng() < 0.5 ? 255 : 120},${rng() < 0.5 ? 255 : 120},0.06)`; dg.beginPath(); dg.arc(rng() * 128, rng() * 128, 6 + rng() * 14, 0, TAU); dg.fill(); }
  const dtex = own(toTex(dc));
  const mesh = new THREE.Mesh(own(g), own(new THREE.MeshLambertMaterial({ vertexColors: true, map: dtex })));
  mesh.name = "terrain"; group.add(mesh);
}

function buildBridges(track) {
  const X = track._ctx;
  const { C, wallDist, own, group, bake, mat, part, Strips, def, theme } = X;
  const { N, ds, px, pz, tx, tz, py } = C, gy = X.groundY;
  const el = new Float64Array(N); for (let i = 0; i < N; i++) el[i] = py[i] - gy(px[i], pz[i]);
  X.elevated = (i) => el[i] > 1.2;
  X.underDeck = (x, z, y) => {
    const cx = Math.floor(x / X.CELL), cz = Math.floor(z / X.CELL);
    for (let a = -2; a <= 2; a++) for (let c = -2; c <= 2; c++) { const arr = X.cells.get(X.ck(cx + a, cz + c)); if (!arr) continue; for (const i of arr) { if (py[i] - y < 1.5) continue; const dx = x - px[i], dz = z - pz[i]; if (dx * dx + dz * dz < (wallDist + 2) ** 2) return true; } }
    return false;
  };
  const W = wallDist + 0.6, concrete = def.theme === "neon" ? [0.16, 0.17, 0.24] : def.theme === "snow" ? [0.62, 0.66, 0.7] : [0.66, 0.62, 0.56];
  let any = false; for (let i = 0; i < N; i++) if (el[i] > 0.8) { any = true; break; }
  if (!any) { track.bridge = null; return; }
  const sk = new Strips(C).add({ profile: [[-W, 0, 0], [-W, -1.4, 0.3], [W, -1.4, 0.7], [W, 0, 1]], tile: 8, mask: (i) => el[i] > 0.8, color: (i, j) => (j === 1 ? [concrete[0] * 0.7, concrete[1] * 0.7, concrete[2] * 0.7] : concrete) });
  const mk = new THREE.Mesh(own(sk.geometry()), own(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  mk.name = "deck"; group.add(mk);
  const parts = []; let count = 0;
  const pc = def.theme === "neon" ? 0x303653 : def.theme === "snow" ? 0x9aa6b4 : 0xb5aea0;
  for (let i = 3; i < N; i += 8) {
    if (el[i] < 2.4) continue;
    const ry = Math.atan2(tx[i], tz[i]), lat = W - 3.2, top = py[i] - 1.4, bot = gy(px[i], pz[i]) - 0.5;
    for (const sg of [-1, 1]) {
      const x = px[i] - tz[i] * lat * sg, z = pz[i] + tx[i] * lat * sg;
      parts.push(part(new THREE.BoxGeometry(2.0, top - bot, 2.0), mat(x, (top + bot) / 2, z, 1, 1, 1, 0, ry, 0), pc));
      parts.push(part(new THREE.BoxGeometry(3.0, 0.6, 3.0), mat(x, top - 0.3, z, 1, 1, 1, 0, ry, 0), pc));
    }
    parts.push(part(new THREE.BoxGeometry(2 * lat + 2.6, 1.0, 2.2), mat(px[i], top - 0.5, pz[i], 1, 1, 1, 0, ry, 0), pc));
    count++;
  }
  track.bridge = { pillars: count };
  if (parts.length) { const m = new THREE.Mesh(own(bake(parts)), own(new THREE.MeshLambertMaterial({ vertexColors: true }))); m.name = "pillars"; group.add(m); }
  void theme;
}

// ================================================================= environment (ground, sky, fog, lights)
function buildEnvironment(track, theme, def) {
  const { own, group, groundTexture, canvas, toTex, rng, anim } = track._ctx;
  const b = track.bounds, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  // ground plane; themes may carve out water by setting ctx.groundClip = {zMin?, zMax?}
  const gt = groundTexture(theme.ground, theme.groundVar, 256);
  const clip = track._ctx.groundClip || {};
  const GS = 3600, zA = clip.zMin ?? cz - GS / 2, zB = clip.zMax ?? cz + GS / 2, xA = cx - GS / 2, xB = cx + GS / 2;
  const T = track._ctx.terrainRect;   // far ground leaves a hole where the heightfield terrain is
  const rects = T ? [[xA, T.x0, zA, zB], [T.x1, xB, zA, zB], [T.x0, T.x1, zA, Math.min(zB, T.z0)], [T.x0, T.x1, Math.max(zA, T.z1), zB]] : [[xA, xB, zA, zB]];
  const fp = [], fu = [], fi = [];
  for (const [ax, bx, az, bz] of rects) {
    if (bx - ax < 1 || bz - az < 1) continue; const o = fp.length / 3;
    fp.push(ax, 0, az, bx, 0, az, ax, 0, bz, bx, 0, bz); fu.push(ax / 40, az / 40, bx / 40, az / 40, ax / 40, bz / 40, bx / 40, bz / 40); fi.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
  }
  const g2 = own(new THREE.BufferGeometry()); g2.setAttribute("position", new THREE.Float32BufferAttribute(fp, 3)); g2.setAttribute("uv", new THREE.Float32BufferAttribute(fu, 2)); g2.setIndex(fi); g2.computeVertexNormals();
  const gmesh = new THREE.Mesh(g2, own(new THREE.MeshLambertMaterial({ map: gt })));
  gmesh.position.y = Y_GROUND; gmesh.name = "ground"; group.add(gmesh);

  // sky dome following the camera
  const W = 2048, H = 1024, c = canvas(W, H), g = c.getContext("2d");
  const sky = theme.sky;
  const gr = g.createLinearGradient(0, 0, 0, H);
  sky.stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const dir = new THREE.Vector3(...theme.sun.dir).normalize();
  const phi = (Math.atan2(dir.z, -dir.x) + TAU) % TAU, el = Math.asin(dir.y);
  const sx = (phi / TAU) * W, sy = (1 - (0.5 + el / Math.PI)) * H;
  if (sky.stars) { for (let i = 0; i < 700; i++) { const y = rng() * H * 0.48; g.fillStyle = `rgba(255,255,255,${0.2 + rng() * 0.8})`; const s = rng() < 0.05 ? 2 : 1; g.fillRect(rng() * W, y, s, s); } }
  // clouds (wrap-safe)
  const cloud = (x, y, w, h, a) => { for (const ox of [-W, 0, W]) { const rg = g.createRadialGradient(x + ox, y, 0, x + ox, y, w); rg.addColorStop(0, `rgba(255,255,255,${a})`); rg.addColorStop(1, "rgba(255,255,255,0)"); g.save(); g.translate(0, y); g.scale(1, h / w); g.translate(0, -y); g.fillStyle = rg; g.fillRect(x + ox - w, y - w, 2 * w, 2 * w); g.restore(); } };
  g.save(); g.globalCompositeOperation = def.theme === "neon" ? "lighter" : "source-over";
  const cc = sky.clouds;
  for (let i = 0; i < 46; i++) {
    const y = H * (0.18 + rng() * 0.28), w = 90 + rng() * 220;
    const col = new THREE.Color(cc); g.fillStyle = cc;
    const rg = (x) => { const r = g.createRadialGradient(x, y, 0, x, y, w); r.addColorStop(0, `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},${def.theme === "neon" ? 0.1 : 0.5})`); r.addColorStop(1, `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},0)`); return r; };
    const x = rng() * W;
    for (const ox of [-W, 0, W]) { g.save(); g.translate(x + ox, y); g.scale(1, 0.16); g.translate(-(x + ox), -y); g.fillStyle = rg(x + ox); g.fillRect(x + ox - w, y - w, 2 * w, 2 * w); g.restore(); }
  }
  g.restore();
  void cloud;
  // sun glow + disc
  for (const ox of [-W, 0, W]) {
    const r1 = g.createRadialGradient(sx + ox, sy, 0, sx + ox, sy, W * 0.16);
    r1.addColorStop(0, sky.sun.glow + "ee"); r1.addColorStop(0.15, sky.sun.glow + "66"); r1.addColorStop(1, sky.sun.glow + "00");
    g.fillStyle = r1; g.fillRect(sx + ox - W * 0.16, sy - W * 0.16, W * 0.32, W * 0.32);
    g.fillStyle = sky.sun.disc; g.beginPath(); g.arc(sx + ox, sy, W * sky.sun.size, 0, TAU); g.fill();
  }
  // horizon ridges (periodic, so no seam)
  const ridge = (colr, base, amp, seed) => {
    g.fillStyle = colr; g.beginPath(); g.moveTo(0, H / 2 + 4);
    const r = (k) => Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453 % 1;
    const ph = [r(1), r(2), r(3), r(4), r(5), r(6)].map((v) => v * TAU), fr = [3, 5, 9, 14, 23, 37];
    for (let x = 0; x <= W; x += 4) { let h = 0; for (let k = 0; k < 6; k++) h += Math.sin((x / W) * TAU * fr[k] + ph[k]) / (1 + k * 0.9); g.lineTo(x, H / 2 - base - amp * (0.5 + 0.5 * h / 1.8)); }
    g.lineTo(W, H / 2 + 4); g.closePath(); g.fill();
  };
  ridge(sky.ridge[0], 6, def.theme === "snow" ? 70 : def.theme === "neon" ? 22 : 38, 1.3);
  ridge(sky.ridge[1], 2, def.theme === "snow" ? 36 : def.theme === "neon" ? 14 : 22, 7.1);
  if (def.theme === "neon") {   // skyline lights
    for (let i = 0; i < 90; i++) { const x = rng() * W, w = 8 + rng() * 22, h = 10 + rng() * 60; g.fillStyle = "#0c0722"; g.fillRect(x, H / 2 - h, w, h + 4); for (let k = 0; k < h / 6; k++) if (rng() < 0.5) { g.fillStyle = rng() < 0.6 ? "#ffe9a8" : rng() < 0.5 ? "#19e6ff" : "#ff2bd6"; g.fillRect(x + 2 + rng() * (w - 5), H / 2 - h + 3 + k * 6, 2, 2); } }
  }
  const tex = own(toTex(c, { repeat: false }));
  tex.wrapS = THREE.RepeatWrapping;
  const dome = new THREE.Mesh(own(new THREE.SphereGeometry(420, 48, 24)), own(new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false, depthTest: false })));
  dome.name = "sky"; dome.renderOrder = -100; dome.frustumCulled = false; dome.matrixAutoUpdate = false;
  dome.onBeforeRender = (r, s, cam) => { dome.matrixWorld.makeTranslation(cam.position.x, cam.position.y, cam.position.z); };
  group.add(dome);

  // lights / fog are applied in setupScene
  track.setupScene = (scene, renderer) => {
    const prev = { bg: scene.background, fog: scene.fog };
    scene.background = new THREE.Color(theme.fog[0]);
    scene.fog = new THREE.Fog(theme.fog[0], theme.fog[1], theme.fog[2]);
    const hemi = new THREE.HemisphereLight(theme.hemi[0], theme.hemi[1], theme.hemi[2]);
    const sun = new THREE.DirectionalLight(theme.sun.color, theme.sun.i);
    sun.position.set(...theme.sun.dir).multiplyScalar(200);
    sun.name = "sun";
    scene.add(hemi, sun);
    void renderer;
    return () => { scene.remove(hemi, sun); scene.background = prev.bg; scene.fog = prev.fog; };
  };
  void anim;
}

// ================================================================= scenery (per theme)
function buildScenery(track) {
  const X = track._ctx;
  const { C, theme, def, hw, wallDist, rng, own, anim, group, nearest, bake, mat, part, canvas, toTex, noiseFill } = X;
  const { N, px, pz, tx, tz, curv } = C;
  const L = track.length, b = track.bounds;
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  const R = (a, z) => a + rng() * (z - a);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const lam = (o) => own(new THREE.MeshLambertMaterial(o));
  const basic = (o) => own(new THREE.MeshBasicMaterial(o));
  const at = (s, lat) => { const sp = track.sample(s); return { x: sp.pos.x + sp.right.x * lat, y: sp.pos.y, z: sp.pos.z + sp.right.z * lat, h: Math.atan2(sp.tangent.x, sp.tangent.z), rx: sp.right.x, rz: sp.right.z }; };
  const WT = 0.55, WH = X.WH;

  const instanced = (geo, material, items, name) => {
    const im = new THREE.InstancedMesh(geo, material, items.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    items.forEach((it, i) => {
      q.setFromEuler(e.set(it.rx || 0, it.ry || 0, it.rz || 0)); p.set(it.x, (it.y || 0) + (it.abs ? 0 : X.groundY(it.x, it.z)), it.z);
      const sx = it.sx ?? 1; s.set(sx, it.sy ?? sx, it.sz ?? sx); m.compose(p, q, s); im.setMatrixAt(i, m);
      if (it.c !== undefined) { c.set(it.c); im.setColorAt(i, c); }
    });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.name = name || "inst"; group.add(im); own(geo); return im;
  };
  const shadowMat = own(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  const blobShadows = (items, rad) => {
    if (!items.length) return;
    const g = new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2);
    instanced(g, shadowMat, items.map((t) => ({ x: t.x + 0.8, y: 0.03, z: t.z + 0.8, sx: rad * (t.sx ?? 1) })), "shadows");
  };
  // random points around the track: dist to the centreline in [minD, maxD]
  const scatter = (count, minD, maxD, o = {}) => {
    const out = [], pad = o.pad ?? 260;
    for (let k = 0; k < count * 60 && out.length < count; k++) {
      const x = R(b.minX - pad, b.maxX + pad), z = R(b.minZ - pad, b.maxZ + pad), d = nearest(x, z);
      if (d < minD || (d > maxD && d < 1e8)) continue;
      if (o.filter && !o.filter(x, z)) continue;
      if (o.sep && out.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < o.sep * o.sep)) continue;
      out.push({ x, z });
    }
    return out;
  };
  const ringAround = (count, r0, r1) => { const out = []; for (let i = 0; i < count; i++) { const a = (i / count) * TAU + R(-0.1, 0.1), r = R(r0, r1); out.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, a }); } return out; };
  const stripedTex = (draw, w, h) => { const c = canvas(w, h), g = c.getContext("2d"); draw(g, w, h); return own(toTex(c)); };

  // ============================================================ common: start gantry + banner
  {
    const a = at(0, 0), span = wallDist + 1.6;
    const g = new THREE.Group(); g.position.set(a.x, a.y, a.z); g.rotation.y = a.h; g.name = "gantry";
    const dark = def.theme === "neon" ? 0x20243f : 0x2b2f3a;
    const geo = bake([
      part(new THREE.BoxGeometry(1.5, 11, 1.5), mat(-span, 5.5, 0), dark), part(new THREE.BoxGeometry(1.5, 11, 1.5), mat(span, 5.5, 0), dark),
      part(new THREE.BoxGeometry(2 * span + 1.5, 1.2, 1.4), mat(0, 10.8, 0), dark),
      part(new THREE.BoxGeometry(2.2, 0.5, 2.2), mat(-span, 0.25, 0), 0x555a66), part(new THREE.BoxGeometry(2.2, 0.5, 2.2), mat(span, 0.25, 0), 0x555a66),
      part(new THREE.BoxGeometry(2 * span + 1.5, 0.35, 0.35), mat(0, 7.4, 0), 0xffffff),
    ]);
    g.add(new THREE.Mesh(own(geo), lam({ vertexColors: true })));
    const bc = canvas(1024, 160), bg = bc.getContext("2d");
    const grd = bg.createLinearGradient(0, 0, 1024, 0); grd.addColorStop(0, "#0b1030"); grd.addColorStop(0.5, "#1a2a70"); grd.addColorStop(1, "#0b1030");
    bg.fillStyle = grd; bg.fillRect(0, 0, 1024, 160);
    for (let i = 0; i < 64; i++) for (let j = 0; j < 2; j++) { bg.fillStyle = (i + j) % 2 ? "#fff" : "#111"; bg.fillRect(i * 16, j * 16 + (j ? 128 : 0), 16, 16); }
    bg.fillStyle = "#ffb020"; bg.font = "900 78px Arial Black, Impact, sans-serif"; bg.textAlign = "center"; bg.textBaseline = "middle";
    bg.save(); bg.transform(1, 0, -0.18, 1, 28, 0); bg.fillStyle = "#ff5a1f"; bg.fillText("APEX KARTS", 512 + 3, 83); bg.fillStyle = "#fff4d0"; bg.fillText("APEX KARTS", 512, 80); bg.restore();
    const btex = own(toTex(bc, { repeat: false }));
    const bannerMat = basic({ map: btex });
    const bw = 2 * span - 1.2, banner = new THREE.Mesh(own(new THREE.PlaneGeometry(bw, bw * 160 / 1024)), bannerMat);
    banner.position.set(0, 9.0, 0.8); const b2 = banner.clone(); b2.position.z = -0.8; b2.rotation.y = Math.PI; g.add(banner, b2);
    group.add(g);
  }

  // ============================================================ common: grandstand
  {
    // choose the side with more free space
    const test = (side) => nearest(at(10, side * (wallDist + 30)).x, at(10, side * (wallDist + 30)).z);
    const side = test(-1) >= test(1) ? -1 : 1;
    const len = 56, depth = 11, d0 = wallDist + 4.5, rise = 7.5, s0 = -14;
    const a = at(s0 + len / 2, 0);
    const g = new THREE.Group(); g.position.set(a.x, a.y, a.z); g.rotation.y = a.h; g.name = "grandstand";
    const dir = -side;       // local +x is LEFT of travel; a point on side `side` (+1 right) has local x = -side
    const ct = canvas(512, 256), cg = ct.getContext("2d");
    cg.fillStyle = "#1c2030"; cg.fillRect(0, 0, 512, 256);
    const pal = ["#ff4d4d", "#ffd34d", "#4dd2ff", "#ffffff", "#7dff7d", "#ff7dd2", "#ff9a3c"];
    for (let r = 0; r < 14; r++) for (let x = 0; x < 52; x++) {
      const y = 12 + r * 17.5, xx = x * 10 + 3 + (r % 2) * 4;
      cg.fillStyle = pick(pal); cg.globalAlpha = 0.85; cg.fillRect(xx - 1, y + 5, 8, 9);
      cg.fillStyle = "#f1c9a0"; cg.globalAlpha = 1; cg.beginPath(); cg.arc(xx + 3, y + 2.5, 3.2, 0, TAU); cg.fill();
    }
    const ctex = own(toTex(ct)); ctex.repeat.set(3, 1);
    // build explicitly instead: quad with 4 corners
    const sg = new THREE.BufferGeometry(), x0 = dir * d0, x1 = dir * (d0 + depth), z0 = -len / 2, z1 = len / 2;
    sg.setAttribute("position", new THREE.Float32BufferAttribute([x0, 0.4, z0, x0, 0.4, z1, x1, 0.4 + rise, z0, x1, 0.4 + rise, z1], 3));
    sg.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2)); sg.setIndex([0, 1, 2, 1, 3, 2]); sg.computeVertexNormals();
    const seats = new THREE.Mesh(own(sg), lam({ map: ctex, side: THREE.DoubleSide, emissive: def.theme === "neon" ? 0x777777 : 0x000000, emissiveMap: def.theme === "neon" ? ctex : null }));
    g.add(seats);
    const col1 = def.theme === "neon" ? 0x1b2040 : def.theme === "snow" ? 0x9fb7cf : 0xc9bfae, roof = theme.kerb[0];
    const parts = [
      part(new THREE.BoxGeometry(depth + 1, 5, len + 1), mat(dir * (d0 + depth / 2), -2.1, 0), col1),
      part(new THREE.BoxGeometry(0.6, rise + 1, len), mat(dir * (d0 + depth + 0.2), (rise + 1) / 2, 0), col1),
      part(new THREE.BoxGeometry(depth + 2.5, 0.5, len + 2), mat(dir * (d0 + depth / 2 + 0.6), rise + 3.6, 0), roof),
      part(new THREE.BoxGeometry(0.5, 1.4, len + 1.5), mat(dir * (d0 - 0.4), 1.1, 0), theme.kerb[1]),
    ];
    for (let k = 0; k <= 4; k++) parts.push(part(new THREE.BoxGeometry(0.5, rise + 3.4, 0.5), mat(dir * (d0 + 0.8), (rise + 3.4) / 2, -len / 2 + (k * len) / 4), 0x30343f));
    // side walls (triangles approximated with boxes)
    for (const zz of [-len / 2, len / 2]) parts.push(part(new THREE.BoxGeometry(depth, 0.5, 0.5), mat(dir * (d0 + depth / 2), 0.9 + rise / 2, zz), 0x30343f));
    g.add(new THREE.Mesh(own(bake(parts)), lam({ vertexColors: true })));
    group.add(g);
    X.grandstand = { side, s0, len, d0, depth };
  }

  // ============================================================ common: tyre walls + chevron boards at corners
  {
    const tyres = [];
    for (let i = 0; i < N; i += 1) {
      const k = curv[i], ak = Math.abs(k);
      if (ak < 0.0065 || X.elevated(i)) continue;
      const side = k > 0 ? -1 : 1;                 // outside of the corner
      const lat = side * (wallDist + WT + 0.6);
      const x = px[i] - tz[i] * lat, z = pz[i] + tx[i] * lat;
      const grp = Math.floor(i / 3) % 3;
      for (let h = 0; h < 3; h++) tyres.push({ x, y: 0.22 + h * 0.4, z, rx: Math.PI / 2, c: grp === 0 ? 0xffffff : grp === 1 ? 0xd9262c : 0x1b1b1f });
    }
    if (tyres.length) {
      const tg = new THREE.TorusGeometry(0.4, 0.2, 5, 10);
      instanced(tg, lam({ color: 0xffffff }), tyres, "tyres");
    }
    // chevron boards
    const mk = (right) => stripedTex((g, w, h) => {
      const neon = def.theme === "neon";
      g.fillStyle = neon ? "#07070f" : "#ffd21f"; g.fillRect(0, 0, w, h);
      g.strokeStyle = neon ? "#ff2bd6" : "#111"; g.lineWidth = 16; g.lineJoin = "miter";
      for (let k = 0; k < 2; k++) { g.beginPath(); const x = 28 + k * 48; if (right) { g.moveTo(x, 20); g.lineTo(x + 50, h / 2); g.lineTo(x, h - 20); } else { g.moveTo(w - x, 20); g.lineTo(w - x - 50, h / 2); g.lineTo(w - x, h - 20); } g.stroke(); }
      g.strokeStyle = neon ? "#19e6ff" : "#111"; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    }, 128, 128);
    const boards = { left: [], right: [], posts: [] };
    let last = -999; X.chevrons = [];
    for (let i = 0; i < N; i++) {
      const k = curv[i];
      if (Math.abs(k) < 0.011 || i * C.ds - last < 16 || X.elevated(i)) continue;
      last = i * C.ds;
      // outside of the bend; the board faces the oncoming driver (back along the track, angled toward the road)
      const side = k > 0 ? -1 : 1, lat = side * (wallDist + WT + 2.3);
      const x = px[i] - tz[i] * lat, z = pz[i] + tx[i] * lat;
      const nxv = -tx[i] * Math.cos(0.5) + (-side * -tz[i]) * Math.sin(0.5), nzv = -tz[i] * Math.cos(0.5) + (-side * tx[i]) * Math.sin(0.5);
      const ry = Math.atan2(nxv, nzv);
      boards[k > 0 ? "right" : "left"].push({ x, y: 2.5, z, ry });
      boards.posts.push({ x, y: 1.3, z });
      X.chevrons.push({ s: i * C.ds, turn: k > 0 ? "right" : "left", x, z, nx: nxv, nz: nzv });
    }
    const pg = new THREE.PlaneGeometry(3.2, 3.2);
    for (const key of ["left", "right"]) if (boards[key].length) instanced(pg, basic({ map: mk(key === "right"), side: THREE.DoubleSide }), boards[key], "chevrons-" + key);
    if (boards.posts.length) instanced(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 6), lam({ color: 0x40444f }), boards.posts, "chevron-posts");
  }

  // ============================================================ common: flags (animated) + poles
  const flags = [];
  const addFlags = (list, colors, w = 4.5, hgt = 2.4) => {
    const parts = [], gf = [];
    list.forEach((p, idx) => {
      const gy = X.groundY(p.x, p.z);
      parts.push(part(new THREE.CylinderGeometry(0.09, 0.12, 9, 6), mat(p.x, gy + 4.5, p.z), 0xd8dae0));
      flags.push({ x: p.x, y: gy + 8.2, z: p.z, ry: p.ry ?? 0, phase: rng() * 6, c1: new THREE.Color(colors[idx % colors.length][0]), c2: new THREE.Color(colors[idx % colors.length][1]) });
    });
    if (parts.length) group.add(new THREE.Mesh(own(bake(parts)), lam({ vertexColors: true })));
    if (!flags.length) return;
    const SW = 8, SH = 2, vcount = (SW + 1) * (SH + 1);
    const pos = new Float32Array(flags.length * vcount * 3), colr = new Float32Array(flags.length * vcount * 3), idx = [];
    flags.forEach((f, fi) => {
      for (let j = 0; j <= SH; j++) for (let i = 0; i <= SW; i++) {
        const vi = fi * vcount + j * (SW + 1) + i, c = j < SH / 2 + 0.01 ? f.c1 : f.c2;
        colr.set([c.r, c.g, c.b], vi * 3);
      }
      for (let j = 0; j < SH; j++) for (let i = 0; i < SW; i++) { const a = fi * vcount + j * (SW + 1) + i; idx.push(a, a + 1, a + SW + 1, a + 1, a + SW + 2, a + SW + 1); }
    });
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.BufferAttribute(pos, 3)); fg.setAttribute("color", new THREE.BufferAttribute(colr, 3)); fg.setIndex(idx);
    const fm = new THREE.Mesh(own(fg), basic({ vertexColors: true, side: THREE.DoubleSide })); fm.frustumCulled = false; fm.name = "flags"; group.add(fm);
    const update = (t) => {
      flags.forEach((f, fi) => {
        const cs = Math.cos(f.ry), sn = Math.sin(f.ry);
        for (let j = 0; j <= SH; j++) for (let i = 0; i <= SW; i++) {
          const u = i / SW, lx = u * w, ly = -j * (hgt / SH), lz = Math.sin(t * 4 + f.phase - u * 5) * 0.55 * u;
          const vi = fi * vcount + j * (SW + 1) + i;
          pos[vi * 3] = f.x + lx * cs + lz * sn; pos[vi * 3 + 1] = f.y + ly; pos[vi * 3 + 2] = f.z - lx * sn + lz * cs;
        }
      });
      fg.attributes.position.needsUpdate = true;
    };
    update(0); anim.push((dt, t) => update(t));
  };
  {
    const gs = X.grandstand, flagPts = [];
    for (let k = 0; k < 3; k++) { const a = at(-20 + k * 14, -gs.side * (wallDist + 3.2)); flagPts.push({ x: a.x, z: a.z, ry: a.h + Math.PI / 2 + (gs.side > 0 ? Math.PI : 0) }); }
    for (let k = 0; k < 3; k++) { const a = at(18 + k * 16, gs.side * (wallDist + 3.5)); flagPts.push({ x: a.x, z: a.z, ry: a.h + Math.PI / 2 }); }
    const cols = def.theme === "sunset" ? [[0xff5a1f, 0xffd34d], [0x19b5c8, 0xffffff], [0xe63946, 0xffffff]] : def.theme === "snow" ? [[0x2d7fd6, 0xffffff], [0xe63946, 0xffffff], [0x19b5c8, 0xf4fbff]] : [[0xff2bd6, 0x19e6ff], [0x19e6ff, 0x7b2bff], [0xffd34d, 0xff2bd6]];
    addFlags(flagPts, cols);
  }

  // ============================================================ theme dispatch
  const ctx = { at, instanced, blobShadows, scatter, ringAround, lam, basic, pick, R, stripedTex, addFlags };
  ({ sunset: sceneSunset, snow: sceneSnow, neon: sceneNeon })[def.theme](track, X, ctx);
}

// ---------------------------------------------------------------- Sunset Coast
function sceneSunset(track, X, K) {
  const { C, rng, own, anim, group, nearest, bake, mat, part, canvas, toTex, noiseFill, hw, wallDist, def } = X;
  const { at, instanced, blobShadows, scatter, ringAround, lam, basic, pick, R, stripedTex } = K;
  const b = track.bounds, cx = (b.minX + b.maxX) / 2, L = track.length;
  const seaZ = X.shore.z;

  // sea
  const wc = canvas(256, 256), wg = wc.getContext("2d");
  wg.fillStyle = "#1c88a6"; wg.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) { wg.strokeStyle = `rgba(255,${200 + rng() * 55 | 0},${150 + rng() * 80 | 0},${0.05 + rng() * 0.18})`; wg.lineWidth = 1 + rng() * 1.6; wg.beginPath(); const x = rng() * 256, y = rng() * 256, w = 8 + rng() * 26; wg.moveTo(x, y); wg.quadraticCurveTo(x + w / 2, y - 2 - rng() * 2, x + w, y); wg.stroke(); }
  for (let i = 0; i < 60; i++) { wg.fillStyle = `rgba(10,60,100,${0.05 + rng() * 0.1})`; wg.fillRect(rng() * 256, rng() * 256, 20 + rng() * 40, 3 + rng() * 6); }
  const wtex = own(toTex(wc)); wtex.repeat.set(120, 120);
  const sea = new THREE.Mesh(own(new THREE.PlaneGeometry(3600, 1900).rotateX(-Math.PI / 2)), own(new THREE.MeshStandardMaterial({ map: wtex, roughness: 0.22, metalness: 0.35, color: 0xffffff })));
  sea.position.set(cx, -0.25, seaZ - 8 - 950); sea.name = "sea"; group.add(sea);
  anim.push((dt) => { wtex.offset.x += dt * 0.004; wtex.offset.y += dt * 0.006; });
  // foam line on the shore (terrain carries the sand colouring)
  const fc = canvas(256, 32), fg = fc.getContext("2d");
  for (let i = 0; i < 70; i++) { fg.fillStyle = `rgba(255,255,255,${0.25 + rng() * 0.5})`; fg.beginPath(); fg.ellipse(rng() * 256, 6 + rng() * 20, 5 + rng() * 14, 1.5 + rng() * 3, 0, 0, TAU); fg.fill(); }
  const ftex = own(toTex(fc)); ftex.repeat.set(60, 1);
  const foam = new THREE.Mesh(own(new THREE.PlaneGeometry(3600, 10).rotateX(-Math.PI / 2)), basic({ map: ftex, transparent: true, depthWrite: false, opacity: 0.9 }));
  foam.position.set(cx, -0.12, seaZ + 9); group.add(foam);
  anim.push((dt, t) => { ftex.offset.x += dt * 0.003; foam.position.z = seaZ + 9 + Math.sin(t * 0.8) * 1.6; });

  // palms
  const trunkC = 0x7a5233, trunkD = 0x5e3d22, f1 = 0x2f9a45, f2 = 0x1f7a37;
  const palmParts = [];
  { let x = 0, y = 0, tilt = 0;
    for (let k = 0; k < 6; k++) { const h = 1.45; palmParts.push(part(new THREE.CylinderGeometry(0.2 - k * 0.012, 0.26 - k * 0.012, h, 6), mat(x + Math.sin(tilt) * h / 2, y + h / 2, 0, 1, 1, 1, 0, 0, -tilt), k % 2 ? trunkD : trunkC)); x += Math.sin(tilt) * h; y += Math.cos(tilt) * h; tilt += 0.07; }
    for (let k = 0; k < 9; k++) {
      const az = (k / 9) * TAU, a = k % 2 ? -0.5 : -0.15, len = 4.4;
      const dx = Math.cos(a) * Math.cos(az), dy = Math.sin(a), dz = -Math.cos(a) * Math.sin(az);
      palmParts.push(part(new THREE.ConeGeometry(0.55, len, 4), mat(x + dx * len / 2, y + dy * len / 2 + 0.2, dz * len / 2, 1, 1, 0.22, 0, az, a - Math.PI / 2), k % 2 ? f1 : f2));
    }
    for (let k = 0; k < 3; k++) palmParts.push(part(new THREE.SphereGeometry(0.22, 6, 5), mat(x + Math.cos(k * 2.1) * 0.3, y - 0.2, Math.sin(k * 2.1) * 0.3), 0x5a3a1a));
  }
  const palmGeo = bake(palmParts);
  const palmPts = [];
  for (let s = 18; s < L - 10; s += 22 + rng() * 14) for (const side of [-1, 1]) {
    if (rng() < 0.35) continue;
    const a = at(s, side * (wallDist + R(5, 12)));
    if (nearest(a.x, a.z) < wallDist + 3.5 || X.groundY(a.x, a.z) < 1.2 || X.elevated(Math.round(s / C.ds) % C.N)) continue;
    palmPts.push({ x: a.x, z: a.z, ry: rng() * TAU, sx: R(0.8, 1.25), c: pick([0xffffff, 0xe8ffe0, 0xfff2cc]) });
  }
  for (const p of scatter(90, wallDist + 8, 200, { filter: (x, z) => X.groundY(x, z) > 1.2 && z > seaZ + 20 })) palmPts.push({ x: p.x, z: p.z, ry: rng() * TAU, sx: R(0.8, 1.5), c: pick([0xffffff, 0xe8ffe0, 0xfff2cc]) });
  instanced(palmGeo, lam({ vertexColors: true }), palmPts, "palms"); blobShadows(palmPts, 2.3);

  // beach umbrellas + huts + loungers
  const umb = bake([part(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5), mat(0, 1.2, 0), 0xdddddd), part(new THREE.ConeGeometry(1.5, 0.7, 8), mat(0, 2.5, 0), 0xffffff)]);
  const umbPts = scatter(34, wallDist + 5, 140, { filter: (x, z) => { const h = X.groundY(x, z); return h > 0.5 && h < 2.2 && z < seaZ + 70; }, sep: 5 }).map((p) => ({ x: p.x, z: p.z, ry: rng() * 6, rx: R(-0.12, 0.12), rz: R(-0.12, 0.12), c: pick([0xff5a5a, 0xffd34d, 0x4dd2ff, 0xffffff, 0xff9a3c, 0x7dff9a]) }));
  instanced(umb, lam({ vertexColors: true }), umbPts, "umbrellas");
  const lounger = bake([part(new THREE.BoxGeometry(0.7, 0.15, 1.8), mat(0, 0.3, 0), 0xffffff), part(new THREE.BoxGeometry(0.7, 0.15, 0.7), mat(0, 0.6, -0.8, 1, 1, 1, -0.7, 0, 0), 0xffffff)]);
  instanced(lounger, lam({ vertexColors: true }), umbPts.map((u) => ({ x: u.x + 1.6, z: u.z + 0.6, ry: u.ry, c: u.c })), "loungers");
  const hut = bake([part(new THREE.BoxGeometry(5, 2.6, 4), mat(0, 1.3, 0), 0xf4e6c8), part(new THREE.ConeGeometry(4.0, 1.8, 4), mat(0, 3.5, 0, 1, 1, 1, 0, Math.PI / 4, 0), 0xd9262c), part(new THREE.BoxGeometry(1.2, 2.0, 0.1), mat(0, 1.0, 2.02), 0x2a8aa6), part(new THREE.BoxGeometry(1.2, 0.9, 0.1), mat(-1.7, 1.6, 2.02), 0x7ad6f2)]);
  const hutPts = scatter(7, wallDist + 8, 140, { filter: (x, z) => { const h = X.groundY(x, z); return h > 0.6 && h < 2.2 && z < seaZ + 70; }, sep: 22 }).map((p) => ({ x: p.x, z: p.z, ry: R(-0.3, 0.3), c: pick([0xffffff, 0xffe8d0, 0xe0f4ff]) }));
  instanced(hut, lam({ vertexColors: true }), hutPts, "huts");

  // rocks and distant green hills
  const rockG = new THREE.IcosahedronGeometry(1, 0); { const p = rockG.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.75 + ((Math.sin(i * 12.9) * 43758) % 1 + 1) % 1 * 0.5; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k); } rockG.computeVertexNormals(); }
  const rocks = scatter(60, wallDist + 6, 160, { filter: (x, z) => X.groundY(x, z) > 0.3 }).map((p) => ({ x: p.x, z: p.z, y: 0.3, sx: R(0.8, 3), sy: R(0.8, 2), sz: R(0.8, 3), ry: rng() * 6, c: pick([0x9a8f84, 0x867b70, 0xb0a498]) }));
  instanced(rockG, lam({}), rocks, "rocks"); blobShadows(rocks, 1.2);
  const hillG = new THREE.SphereGeometry(1, 14, 8, 0, TAU, 0, Math.PI / 2);
  const hills = ringAround(30, 330, 520).filter((h) => h.z > seaZ + 60).map((h) => ({ x: h.x, z: h.z, y: -2, sx: R(60, 130), sy: R(18, 44), sz: R(60, 120), ry: rng() * 6, c: pick([0x6d9a4a, 0x5f8c42, 0x7ba253, 0x4f7f3c]) }));
  void hills; void hillG;

  // sailboats + lighthouse
  const boat = bake([
    part(new THREE.BoxGeometry(1.6, 0.8, 5), mat(0, 0.3, 0), 0xf4f4f0), part(new THREE.ConeGeometry(0.8, 1.6, 4), mat(0, 0.3, 3.0, 1, 1, 0.4, Math.PI / 2, 0, 0), 0xf4f4f0),
    part(new THREE.CylinderGeometry(0.05, 0.05, 6, 5), mat(0, 3.4, 0), 0xcccccc), part(new THREE.ConeGeometry(1.4, 5, 3), mat(0, 3.6, 0.1, 1, 1, 0.08), 0xffffff),
  ]);
  const boatM = lam({ vertexColors: true, side: THREE.DoubleSide });
  const boatPts = [];
  for (let i = 0; i < 6; i++) boatPts.push({ abs: true, x: cx + R(-380, 380), z: seaZ - R(50, 260), ry: R(0, 6.28), sx: R(1.5, 2.6), c: pick([0xffffff, 0xffe6cc, 0xffc2c2, 0xcfe8ff]) });
  const boats = instanced(boat, boatM, boatPts, "boats"); boats.frustumCulled = false;
  { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    anim.push((dt, t) => { boatPts.forEach((bp, i) => { q.setFromEuler(e.set(Math.sin(t * 1.1 + i) * 0.05, bp.ry, Math.sin(t * 0.9 + i * 2) * 0.07)); p.set(bp.x, -0.05 + Math.sin(t * 1.3 + i) * 0.08, bp.z); s.setScalar(bp.sx); m.compose(p, q, s); boats.setMatrixAt(i, m); }); boats.instanceMatrix.needsUpdate = true; }); }
  { const lh = new THREE.Group(), lx = cx + 330, lz = seaZ - 170;
    const parts = [part(new THREE.SphereGeometry(18, 8, 5, 0, TAU, 0, Math.PI / 2), mat(0, -3, 0, 1, 0.6, 1), 0x6d6459)];
    for (let k = 0; k < 6; k++) parts.push(part(new THREE.CylinderGeometry(3.2 - k * 0.22 - 0.2, 3.2 - k * 0.22, 5.5, 10), mat(0, 4 + k * 5.5, 0), k % 2 ? 0xd9262c : 0xffffff));
    parts.push(part(new THREE.CylinderGeometry(3.6, 3.6, 0.6, 10), mat(0, 37.2, 0), 0x2b2f3a), part(new THREE.CylinderGeometry(2.0, 2.0, 3, 10), mat(0, 39, 0), 0xfff2b0), part(new THREE.ConeGeometry(2.6, 2.4, 10), mat(0, 41.7, 0), 0xd9262c));
    lh.add(new THREE.Mesh(own(bake(parts)), lam({ vertexColors: true }))); lh.position.set(lx, 0, lz);
    const beamM = basic({ color: 0xfff0b0, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(own(new THREE.ConeGeometry(5, 90, 12, 1, true).translate(0, -45, 0).rotateX(Math.PI / 2)), beamM); beam.position.y = 39; lh.add(beam);
    anim.push((dt, t) => { beam.rotation.y = t * 0.8; });
    group.add(lh); }
}

// ---------------------------------------------------------------- Frostbite Pass
function sceneSnow(track, X, K) {
  const { C, rng, own, anim, group, nearest, bake, mat, part, canvas, toTex, noiseFill, hw, wallDist, def } = X;
  const { at, instanced, blobShadows, scatter, ringAround, lam, basic, pick, R } = K;
  const b = track.bounds, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, L = track.length;

  // pines (green tiers with snow caps)
  const pp = [part(new THREE.CylinderGeometry(0.28, 0.4, 1.8, 6), mat(0, 0.9, 0), 0x5a3d26)];
  const radii = [2.7, 2.2, 1.7, 1.15];
  radii.forEach((r, k) => { const y = 1.3 + k * 1.6; pp.push(part(new THREE.ConeGeometry(r, 2.6, 7, 1, true), mat(0, y + 1.1, 0), k % 2 ? 0x2c6b48 : 0x245c3d)); pp.push(part(new THREE.ConeGeometry(r * 0.8, 1.7, 7, 1, true), mat(0, y + 1.55, 0), 0xf2f8ff)); });
  pp.push(part(new THREE.ConeGeometry(0.6, 1.5, 6), mat(0, 8.2, 0), 0xf2f8ff));
  const pineGeo = bake(pp);
  const pines = [];
  const lakeC = X.lakeInfo || { x: cx, z: b.maxZ + 300, y: 0 };
  const inLake = (x, z) => Math.hypot(x - lakeC.x, z - lakeC.z) < lakeC.r + 14;
  for (let s = 8; s < L; s += 9 + rng() * 8) for (const side of [-1, 1]) {
    const a = at(s, side * (wallDist + R(7, 16)));
    if (nearest(a.x, a.z) < wallDist + 5 || inLake(a.x, a.z) || X.underDeck(a.x, a.z, X.groundY(a.x, a.z))) continue;
    pines.push({ x: a.x, z: a.z, ry: rng() * 6, sx: R(0.85, 1.5), sy: R(0.9, 1.7), c: pick([0xffffff, 0xd8ecd8, 0xc8e0d4, 0xeaf6ff]) });
  }
  for (const p of scatter(520, wallDist + 10, 400, { filter: (x, z) => !inLake(x, z), sep: 6 })) pines.push({ x: p.x, z: p.z, ry: rng() * 6, sx: R(0.9, 1.8), sy: R(0.9, 2.0), c: pick([0xffffff, 0xd8ecd8, 0xc8e0d4, 0xeaf6ff]) });
  instanced(pineGeo, lam({ vertexColors: true }), pines, "pines"); blobShadows(pines, 2.6);

  // rocks
  const rockG = new THREE.DodecahedronGeometry(1, 0);
  const rocks = scatter(70, wallDist + 5, 220, { filter: (x, z) => !inLake(x, z) }).map((p) => ({ x: p.x, z: p.z, y: 0.2, sx: R(0.8, 3.2), sy: R(0.7, 2.2), sz: R(0.8, 3), ry: rng() * 6, rx: R(-0.3, 0.3), c: pick([0x8a98a8, 0x7c8a9a, 0xa2b0c0, 0xeaf2fa]) }));
  instanced(rockG, lam({}), rocks, "rocks"); blobShadows(rocks, 1.4);

  // frozen lake
  { const c = canvas(512, 512), g = c.getContext("2d");
    const gr = g.createRadialGradient(256, 256, 20, 256, 256, 256); gr.addColorStop(0, "#c9ecff"); gr.addColorStop(0.8, "#a8d8f2"); gr.addColorStop(1, "#d8eefc"); g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = 1.5;
    for (let i = 0; i < 38; i++) { g.beginPath(); let x = rng() * 512, y = rng() * 512; g.moveTo(x, y); for (let k = 0; k < 7; k++) { x += (rng() - 0.5) * 120; y += (rng() - 0.5) * 120; g.lineTo(x, y); } g.stroke(); }
    g.strokeStyle = "rgba(80,140,190,0.35)"; for (let i = 0; i < 14; i++) { g.beginPath(); let x = rng() * 512, y = rng() * 512; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (rng() - 0.5) * 90; y += (rng() - 0.5) * 90; g.lineTo(x, y); } g.stroke(); }
    const lake = new THREE.Mesh(own(new THREE.CircleGeometry(lakeC.r, 40).rotateX(-Math.PI / 2)), own(new THREE.MeshStandardMaterial({ map: own(toTex(c, { repeat: false })), roughness: 0.12, metalness: 0.15 })));
    lake.position.set(lakeC.x, (lakeC.y || 0) - 0.12, lakeC.z); lake.name = "lake"; group.add(lake); }

  // chalets
  const chalet = bake([
    part(new THREE.BoxGeometry(8, 3.6, 6), mat(0, 1.8, 0), 0x8a5a34), part(new THREE.BoxGeometry(9.2, 0.4, 3.9), mat(0, 4.55, -1.75, 1, 1, 1, 0.5, 0, 0), 0xf4f9ff), part(new THREE.BoxGeometry(9.2, 0.4, 3.9), mat(0, 4.55, 1.75, 1, 1, 1, -0.5, 0, 0), 0xf4f9ff),
    part(new THREE.BoxGeometry(1.0, 3, 1.0), mat(2.4, 5.2, 0), 0x6b6f78), part(new THREE.BoxGeometry(1.1, 0.3, 1.1), mat(2.4, 6.8, 0), 0xf4f9ff),
    part(new THREE.BoxGeometry(1.3, 2.2, 0.15), mat(-1.8, 1.1, 3.05), 0x3b2616), part(new THREE.BoxGeometry(1.6, 1.2, 0.15), mat(1.4, 2.0, 3.05), 0xffd98a), part(new THREE.BoxGeometry(1.2, 1.1, 0.15), mat(3.1, 2.0, 3.05), 0xffd98a),
    part(new THREE.BoxGeometry(8.4, 0.3, 0.3), mat(0, 3.3, 3.1), 0x5c3a20),
  ]);
  const chalets = scatter(9, wallDist + 14, 160, { filter: (x, z) => !inLake(x, z), sep: 30 }).map((p) => { const l = track.locate({ x: p.x, z: p.z }); const sp = track.sample(l.s); return { x: p.x, z: p.z, ry: Math.atan2(sp.tangent.x, sp.tangent.z) + (l.lateral > 0 ? -Math.PI / 2 : Math.PI / 2) + R(-0.2, 0.2), c: pick([0xffffff, 0xe8d8c8, 0xd8e8ff]) }; });
  instanced(chalet, lam({ vertexColors: true }), chalets, "chalets");

  // striped marker poles on hairpins and snowmen near the start
  const poleG = bake([part(new THREE.CylinderGeometry(0.1, 0.1, 3, 5), mat(0, 1.5, 0), 0xe63946), part(new THREE.CylinderGeometry(0.105, 0.105, 0.7, 5), mat(0, 1.0, 0), 0xffffff), part(new THREE.CylinderGeometry(0.105, 0.105, 0.7, 5), mat(0, 2.4, 0), 0xffffff)]);
  const poles = [];
  for (let i = 0; i < C.N; i += 4) { const k = X.C.curv[i]; if (Math.abs(k) < 0.014 || X.elevated(i)) continue; const side = k > 0 ? -1 : 1, lat = side * (wallDist + 1.8 + 0.55 + 1.0); poles.push({ x: C.px[i] - C.tz[i] * lat, z: C.pz[i] + C.tx[i] * lat }); }
  if (poles.length) instanced(poleG, lam({ vertexColors: true }), poles, "poles");
  const snowman = bake([part(new THREE.SphereGeometry(0.9, 8, 6), mat(0, 0.85, 0), 0xffffff), part(new THREE.SphereGeometry(0.65, 8, 6), mat(0, 2.0, 0), 0xffffff), part(new THREE.SphereGeometry(0.45, 8, 6), mat(0, 2.9, 0), 0xffffff), part(new THREE.ConeGeometry(0.1, 0.5, 5), mat(0, 2.9, 0.5, 1, 1, 1, Math.PI / 2, 0, 0), 0xff7a1f), part(new THREE.CylinderGeometry(0.4, 0.4, 0.5, 8), mat(0, 3.5, 0), 0x222222)]);
  const sm = [];
  for (let k = 0; k < 4; k++) { const a = at(-30 + k * 6, X.grandstand.side * -(wallDist + 7 + (k % 2) * 3)); sm.push({ x: a.x, z: a.z, ry: a.h + Math.PI, sx: R(0.8, 1.2) }); }
  instanced(snowman, lam({ vertexColors: true }), sm, "snowmen");

  // distant snowy mountains (instanced pyramids with caps)
  const mg = bake([part(new THREE.ConeGeometry(1, 1, 7), mat(0, 0.5, 0), 0x8fa3b8), part(new THREE.ConeGeometry(0.6, 0.6, 7), mat(0, 0.7, 0), 0xffffff)]);
  const mts = ringAround(34, 470, 640).map((m) => ({ x: m.x, z: m.z, y: -4, sx: R(110, 240), sy: R(130, 300), sz: R(110, 240), ry: rng() * 6, c: pick([0xffffff, 0xe6eef7, 0xcfdcea]) }));
  instanced(mg, lam({ vertexColors: true }), mts, "mountains");

  // snowfall
  const n = 2200, pos = new Float32Array(n * 3), sz = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos[i * 3] = rng() * 120; pos[i * 3 + 1] = rng() * 60; pos[i * 3 + 2] = rng() * 120; sz[i] = 0.5 + rng(); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(pos, 3)); sg.setAttribute("size", new THREE.BufferAttribute(sz, 1));
  const sm2 = own(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, fog: false,
    vertexShader: `uniform float uTime; attribute float size; varying float vA;
      void main(){ vec3 p = position; p.y -= uTime * (3.0 + size * 1.5); p.x += sin(uTime * 0.7 + position.z) * 1.5; p = mod(p, vec3(120.0, 60.0, 120.0)) - vec3(60.0, 10.0, 60.0);
        vec3 w = p + cameraPosition; vec4 mv = viewMatrix * vec4(w, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(size * 120.0 / -mv.z, 1.0, 6.0); vA = smoothstep(60.0, 20.0, length(p)); }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, vA * smoothstep(0.5, 0.15, d) * 0.9); }`,
  }));
  const snow = new THREE.Points(sg, sm2); snow.frustumCulled = false; snow.renderOrder = 5; snow.name = "snowfall"; group.add(snow);
  anim.push((dt, t) => { sm2.uniforms.uTime.value = t; });
}

// ---------------------------------------------------------------- Neon Docks
function sceneNeon(track, X, K) {
  const { C, rng, own, anim, group, nearest, bake, mat, part, canvas, toTex, noiseFill, hw, wallDist, def } = X;
  const { at, instanced, scatter, ringAround, lam, basic, pick, R, stripedTex } = K;
  const b = track.bounds, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, L = track.length;
  const quayZ = X.shore.z;
  const NEON = [0xff2bd6, 0x19e6ff, 0xffd34d, 0x7b4bff, 0x3dff9a];

  // water
  const wc = canvas(256, 256), wg = wc.getContext("2d");
  wg.fillStyle = "#050a1c"; wg.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 120; i++) { wg.fillStyle = `rgba(${pick(["255,43,214", "25,230,255", "255,211,77", "123,75,255"])},${0.05 + rng() * 0.15})`; wg.fillRect(rng() * 256, rng() * 256, 2 + rng() * 5, 14 + rng() * 40); }
  const wtex = own(toTex(wc)); wtex.repeat.set(70, 70);
  const water = new THREE.Mesh(own(new THREE.PlaneGeometry(3600, 1900).rotateX(-Math.PI / 2)), own(new THREE.MeshStandardMaterial({ map: wtex, roughness: 0.15, metalness: 0.5, color: 0xffffff })));
  water.position.set(cx, -0.9, quayZ + 950 - 0.5); group.add(water);
  anim.push((dt) => { wtex.offset.y += dt * 0.004; wtex.offset.x += dt * 0.0015; });
  // quay edge strip (bollard line)
  { const q = new THREE.Mesh(own(new THREE.BoxGeometry(3600, 1.2, 1.4)), basic({ color: 0x19e6ff })); q.position.set(cx, -0.3, quayZ + 0.3); group.add(q); }

  // containers
  const ctex = stripedTex((g, w, h) => { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.fillStyle = "rgba(0,0,0,0.22)"; for (let x = 0; x < w; x += 8) g.fillRect(x, 0, 3, h); g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4); noiseFill(g, w, h, rng, 400, 0.15, 255, 0, 2); }, 128, 32);
  const cg = new THREE.BoxGeometry(12, 2.6, 2.5);
  const cols = [0xd9462c, 0x2a63d6, 0xe8a317, 0x1fa88b, 0xb02a7a, 0x8a8f9c, 0x3a3f56, 0xc9c24a];
  const conts = [];
  for (const p of scatter(520, wallDist + 7, 170, { pad: 60, sep: 5.2 })) {
    const tall = 1 + Math.floor(rng() * 3), ry = rng() < 0.5 ? 0 : Math.PI / 2, base = pick(cols);
    for (let h = 0; h < tall; h++) conts.push({ x: p.x, y: 1.3 + h * 2.62, z: p.z, ry, c: h === 0 ? base : pick(cols) });
  }
  instanced(cg, lam({ map: ctex, emissive: 0x151826 }), conts, "containers");

  // cranes
  const craneParts = [];
  const cc = 0xe8571f;
  for (const [x, z] of [[-9, -6], [9, -6], [-9, 6], [9, 6]]) craneParts.push(part(new THREE.BoxGeometry(1.1, 26, 1.1), mat(x, 13, z), cc));
  craneParts.push(part(new THREE.BoxGeometry(21, 1.2, 15), mat(0, 26, 0), 0x2b2f3a), part(new THREE.BoxGeometry(22, 1.6, 1.6), mat(0, 21, -6), cc), part(new THREE.BoxGeometry(22, 1.6, 1.6), mat(0, 21, 6), cc));
  craneParts.push(part(new THREE.BoxGeometry(2.0, 2.0, 70), mat(0, 29, 25), cc), part(new THREE.BoxGeometry(1.0, 1.0, 40), mat(0, 33, 5, 1, 1, 1, 0.25, 0, 0), 0xb53d14), part(new THREE.BoxGeometry(5, 3, 4), mat(0, 30.8, 38), 0x2b2f3a), part(new THREE.BoxGeometry(0.2, 12, 0.2), mat(0, 24, 38), 0x111111));
  craneParts.push(part(new THREE.BoxGeometry(3, 2.6, 6), mat(0, 28, 0), 0xf2f2f2));
  const craneGeo = bake(craneParts);
  const cranes = [], lights = [];
  const craneXs = [-130, -20, 95, 205].filter((x) => x > b.minX - 60 && x < b.maxX + 60);
  craneXs.forEach((x, i) => { cranes.push({ x, z: quayZ - 12, ry: 0, c: 0xffffff }); lights.push([x, 34, quayZ - 12 + 38 - 0]); });
  instanced(craneGeo, lam({ vertexColors: true }), cranes, "cranes");

  // ships (hull + stacked containers) in the water
  const shipGeo = bake([part(new THREE.BoxGeometry(24, 8, 120), mat(0, 4, 0), 0x2a2f45), part(new THREE.BoxGeometry(22, 0.6, 114), mat(0, 8.3, 0), 0x6a6f84), part(new THREE.BoxGeometry(16, 12, 12), mat(0, 14, -48), 0xdcdce4)]);
  const ships = [{ abs: true, x: cx - 120, z: quayZ + 90, ry: 0.06, c: 0xffffff }, { abs: true, x: cx + 160, z: quayZ + 190, ry: -0.04, c: 0xffffff }];
  instanced(shipGeo, lam({ vertexColors: true }), ships, "ships");
  const shipConts = []; ships.forEach((sh) => { for (let k = -5; k <= 5; k++) for (let r = -1; r <= 1; r++) for (let h = 0; h < 2; h++) shipConts.push({ abs: true, x: sh.x + r * 3.3, y: 9.9 + h * 2.62, z: sh.z + k * 8 + 6, ry: Math.PI / 2, c: pick(cols) }); });
  instanced(cg, lam({ map: ctex, emissive: 0x151826 }), shipConts, "ship-containers");

  // lamp masts with glow + light pools on the tarmac
  const lampG = bake([part(new THREE.CylinderGeometry(0.16, 0.24, 9.5, 6), mat(0, 4.75, 0), 0x3a3f56), part(new THREE.BoxGeometry(0.2, 0.2, 2.4), mat(0, 9.5, 1.2), 0x3a3f56)]);
  const lampPts = [], glowPos = [], poolPts = [];
  for (let s = 14; s < L - 6; s += 42) {
    const side = Math.floor(s / 42) % 2 ? 1 : -1, a = at(s, side * (wallDist + 3.2));
    if (nearest(a.x, a.z) < wallDist + 2 || X.underDeck(a.x, a.z, X.groundY(a.x, a.z)) || X.elevated(Math.round(s / C.ds) % C.N)) continue;
    const ry = Math.atan2(-a.rx * side, -a.rz * side);        // arm points toward road
    lampPts.push({ x: a.x, z: a.z, ry });
    const hx = a.x + Math.sin(ry) * 2.4, hz = a.z + Math.cos(ry) * 2.4;
    glowPos.push(hx, X.groundY(a.x, a.z) + 9.4, hz);
    const pc = at(s, side * -2);
    poolPts.push({ abs: true, x: pc.x, y: pc.y + 0.09, z: pc.z, sx: 1, c: s % 84 < 42 ? 0xfff0c0 : 0xffd0f0 });
  }
  instanced(lampG, lam({ vertexColors: true }), lampPts, "lamps");
  const glowTex = stripedTex((g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.25, "rgba(255,255,255,0.45)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, w, h); }, 64, 64);
  const addGlow = (pos, colorHex, size) => {
    const gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const pts = new THREE.Points(own(gg), own(new THREE.PointsMaterial({ map: glowTex, color: colorHex, size, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
    pts.frustumCulled = false; group.add(pts); return pts;
  };
  if (glowPos.length) addGlow(glowPos, 0xfff0c0, 7);
  if (poolPts.length) {
    const pg = new THREE.PlaneGeometry(30, 30).rotateX(-Math.PI / 2);
    const pm = basic({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    instanced(pg, pm, poolPts, "light-pools");
  }
  // crane warning lights (blink)
  const redPos = []; lights.forEach(([x]) => { const g0 = X.groundY(x, quayZ - 12); redPos.push(x, g0 + 34.5, quayZ - 12); redPos.push(x, g0 + 32, quayZ - 12 + 66); });
  const blink = addGlow(redPos, 0xff2a2a, 10);
  anim.push((dt, t) => { blink.material.opacity = 0.35 + 0.65 * (Math.sin(t * 3.2) > 0 ? 1 : 0.1); });

  // neon signs
  const signTexts = [["APEX", "#ff2bd6"], ["NITRO", "#19e6ff"], ["DOCKS", "#ffd34d"], ["ZAP-X", "#3dff9a"], ["TURBO", "#ff2bd6"], ["GO!", "#19e6ff"]];
  const signPts = [];
  signTexts.forEach(([txt, colr], i) => {
    const t = stripedTex((g, w, h) => { g.fillStyle = "#07070f"; g.fillRect(0, 0, w, h); g.strokeStyle = colr; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12); g.shadowColor = colr; g.shadowBlur = 18; g.fillStyle = colr; g.font = "900 70px Arial Black, Impact, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(txt, w / 2, h / 2 + 4); g.fillText(txt, w / 2, h / 2 + 4); }, 256, 128);
    const s0 = ((i + 0.5) / signTexts.length) * L, side = i % 2 ? 1 : -1, a = at(s0 + 17, side * (wallDist + 9));
    if (nearest(a.x, a.z) < wallDist + 5 || X.underDeck(a.x, a.z, X.groundY(a.x, a.z))) return;
    const mesh = new THREE.Mesh(own(new THREE.PlaneGeometry(14, 7)), basic({ map: t, side: THREE.DoubleSide }));
    mesh.position.set(a.x, X.groundY(a.x, a.z) + 12, a.z); mesh.rotation.y = Math.atan2(-a.rx * side, -a.rz * side); group.add(mesh);
    const post = new THREE.Mesh(own(new THREE.CylinderGeometry(0.3, 0.4, 12, 6)), lam({ color: 0x2a2f45 })); post.position.set(a.x, X.groundY(a.x, a.z) + 6, a.z); group.add(post);
    signPts.push(a.x, 12, a.z);
  });
  void signPts;

  // searchlights
  const beams = [];
  for (let i = 0; i < 3; i++) {
    const p = scatter(1, wallDist + 15, 300, { filter: (x, z) => z < b.maxZ })[0] || { x: cx, z: cz };
    const m = basic({ color: i % 2 ? 0x19e6ff : 0xff2bd6, transparent: true, opacity: 0.10, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const beam = new THREE.Mesh(own(new THREE.ConeGeometry(14, 420, 14, 1, true).translate(0, 210, 0)), m);
    beam.position.set(p.x, X.groundY(p.x, p.z), p.z); beam.userData = { ph: rng() * 6, sp: 0.25 + rng() * 0.2 }; group.add(beam); beams.push(beam);
  }
  anim.push((dt, t) => { beams.forEach((bm) => { const u = bm.userData; bm.rotation.set(Math.sin(t * u.sp + u.ph) * 0.5, t * u.sp * 0.7, Math.cos(t * u.sp * 0.8 + u.ph) * 0.5); }); });

  // skyline of lit towers around the harbour
  const wt = stripedTex((g, w, h) => { g.fillStyle = "#0b0a1c"; g.fillRect(0, 0, w, h); for (let y = 4; y < h; y += 8) for (let x = 3; x < w; x += 8) { if (rng() < 0.55) { g.fillStyle = rng() < 0.7 ? "#ffe9a8" : rng() < 0.5 ? "#19e6ff" : "#ff2bd6"; g.fillRect(x, y, 4, 4); } } }, 128, 256);
  const bGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const towers = ringAround(46, 400, 560).filter((t) => t.z < quayZ + 30).map((t) => ({ x: t.x, z: t.z, sx: R(26, 60), sy: R(70, 190), sz: R(26, 60), ry: R(0, 3), c: pick([0xffffff, 0xcfd6ff, 0xe8c8ff]) }));
  instanced(bGeo, basic({ map: wt }), towers, "skyline");
  // wall-top neon strips are baked into the wall texture; add glowing kerb-height edge lights
  { const edge = []; for (let i = 0; i < C.N; i += 4) for (const side of [-1, 1]) { const lat = side * (wallDist - 0.05); edge.push(C.px[i] - C.tz[i] * lat, C.py[i] + 1.12, C.pz[i] + C.tx[i] * lat); } addGlow(edge, 0x19e6ff, 2.2); }
}
