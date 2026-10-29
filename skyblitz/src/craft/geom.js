// Procedural geometry kit for the aircraft: lofted fuselages, airfoil wing patches, UV mapping into the livery atlas.
// Pure THREE math (no DOM), so it runs under node:test. Owner: craft agent.
//
// Livery atlas layout (u right, v up; the canvas is 1024 x 1536):
//   v 0.40..1.00  TOP planform  (u = x / Wm + .5, v: nose at the top)          -> stripes, numbers, roundels
//   v 0.22..0.40  RIGHT side profile (nose to the right)
//   v 0.04..0.22  LEFT side profile  (nose to the left, so type reads correctly)
//   v 0.00..0.04  SOLID cells, u quarters: [0 dark, 1 accent, 2 secondary, 3 primary]
import * as THREE from 'three';

export const ATLAS = { W: 1024, H: 1536, topV0: 0.4, rV0: 0.22, lV0: 0.04, solidV: 0.02 };
const TAU = Math.PI * 2;
const sgnPow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

/** Loft along +Z through superellipse sections: [z, halfWidth, top, bottom, yCentre, n(optional, 2 = ellipse, 4 = boxy)]. */
export function loft(secs, K = 20, caps = true) {
  const pos = [], idx = [];
  for (const s of secs) {
    const [z, hw, top, bot, yc, n = 2.2] = s; const e = 2 / n;
    for (let k = 0; k < K; k++) {
      const a = (k / K) * TAU, c = Math.cos(a), sn = Math.sin(a);
      pos.push(hw * sgnPow(c, e), yc + (sn >= 0 ? top : bot) * sgnPow(sn, e), z);
    }
  }
  const R = secs.length;
  for (let i = 0; i < R - 1; i++) {
    for (let k = 0; k < K; k++) {
      const a = i * K + k, b = i * K + ((k + 1) % K), c = (i + 1) * K + k, d = (i + 1) * K + ((k + 1) % K);
      idx.push(a, b, c, b, d, c);
    }
  }
  if (caps) {
    for (const [ri, flip] of [[0, true], [R - 1, false]]) {
      const ci = pos.length / 3; let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < K; k++) { cx += pos[(ri * K + k) * 3]; cy += pos[(ri * K + k) * 3 + 1]; cz += pos[(ri * K + k) * 3 + 2]; }
      pos.push(cx / K, cy / K, cz / K);
      for (let k = 0; k < K; k++) { const a = ri * K + k, b = ri * K + ((k + 1) % K); if (flip) idx.push(ci, b, a); else idx.push(ci, a, b); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// NACA-ish half thickness at chord fraction x (unit chord, thickness ratio t)
const naca = (x, t) => 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1015 * x ** 4);

/**
 * Airfoil wing patch for the RIGHT half (x >= 0). stations: [{x, z (leading edge), y, chord, t}] sorted by x.
 * c0..c1 chord fraction range, s0..s1 span fraction range over the stations' x extent.
 * Returns geometry plus the hinge line (at chord c0) p0 -> p1 (inner -> outer) for control surfaces.
 */
export function wingPatch(stations, { c0 = 0, c1 = 1, s0 = 0, s1 = 1, N = 14, cam = 0.015 } = {}) {
  const xa = stations[0].x, xb = stations[stations.length - 1].x;
  const xs = [xa + (xb - xa) * s0];
  for (const s of stations) if (s.x > xs[0] + 1e-4 && s.x < xa + (xb - xa) * s1 - 1e-4) xs.push(s.x);
  xs.push(xa + (xb - xa) * s1);
  const at = (x) => {
    let i = 0; while (i < stations.length - 2 && stations[i + 1].x < x) i++;
    const A = stations[i], B = stations[i + 1], f = B.x === A.x ? 0 : (x - A.x) / (B.x - A.x);
    const L = (p) => A[p] + (B[p] - A[p]) * f;
    return { x, z: L('z'), y: L('y'), chord: L('chord'), t: L('t') };
  };
  const pos = [], idx = [];
  const ring = 2 * N;
  const cs = [];
  for (let j = 0; j < N; j++) { const u = j / (N - 1); cs.push(c0 + (c1 - c0) * (c0 < 0.01 ? 1 - Math.cos(u * Math.PI * 0.5) : u)); }
  const first = at(xs[0]), last = at(xs[xs.length - 1]);
  for (const x of xs) {
    const s = at(x);
    for (let j = 0; j < N; j++) { const c = cs[j]; const ht = naca(c, s.t) * s.chord, cm = 4 * cam * c * (1 - c) * s.chord; pos.push(s.x, s.y + cm + ht, s.z + c * s.chord); }
    for (let j = N - 1; j >= 0; j--) { const c = cs[j]; const ht = naca(c, s.t) * s.chord, cm = 4 * cam * c * (1 - c) * s.chord; pos.push(s.x, s.y + cm - ht, s.z + c * s.chord); }
  }
  const R = xs.length;
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < ring; j++) {
    const a = i * ring + j, b = i * ring + ((j + 1) % ring), c = (i + 1) * ring + j, d = (i + 1) * ring + ((j + 1) % ring);
    idx.push(a, b, c, b, d, c);
  }
  for (const [ri, out] of [[0, false], [R - 1, true]]) {
    const ci = pos.length / 3; let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < ring; j++) { cx += pos[(ri * ring + j) * 3]; cy += pos[(ri * ring + j) * 3 + 1]; cz += pos[(ri * ring + j) * 3 + 2]; }
    pos.push(cx / ring, cy / ring, cz / ring);
    for (let j = 0; j < ring; j++) { const a = ri * ring + j, b = ri * ring + ((j + 1) % ring); if (out) idx.push(ci, a, b); else idx.push(ci, b, a); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.hinge = [new THREE.Vector3(first.x, first.y, first.z + c0 * first.chord), new THREE.Vector3(last.x, last.y, last.z + c0 * last.chord)];
  return g;
}

export function mirrorX(g) {
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, -p.getX(i));
  const ix = g.index; if (ix) { const a = ix.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } ix.needsUpdate = true; }
  const h = g.userData.hinge; if (h) { for (const v of h) v.x = -v.x; }
  g.computeVertexNormals(); return g;
}

/** Merge geometries (position, normal and, when every part has them, uv) into one non-indexed geometry. */
export function merge(list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of parts) if (!g.attributes.normal) g.computeVertexNormals();
  const names = ['position', 'normal']; if (parts.every((g) => g.attributes.uv)) names.push('uv');
  const out = new THREE.BufferGeometry();
  for (const nm of names) {
    const sz = parts[0].attributes[nm].itemSize; let n = 0; for (const g of parts) n += g.attributes[nm].count;
    const arr = new Float32Array(n * sz); let o = 0;
    for (const g of parts) { arr.set(g.attributes[nm].array, o); o += g.attributes[nm].array.length; }
    out.setAttribute(nm, new THREE.BufferAttribute(arr, sz));
  }
  return out;
}

/** Convert to non-indexed (keeping smooth normals) and write atlas UVs per triangle. mode: 'auto' | 'solid:<dark|accent|secondary|primary>' | 'top'. */
export function mapUV(g0, dims, mode = 'auto') {
  if (!g0.attributes.normal) g0.computeVertexNormals();
  const g = g0.index ? g0.toNonIndexed() : g0;
  const p = g.attributes.position, nrm = g.attributes.normal, n = p.count;
  const uv = new Float32Array(n * 2);
  const Wm = dims.W * 1.12, Lm = dims.L * 1.12;
  const A = ATLAS;
  const solid = { dark: 0, accent: 1, secondary: 2, primary: 3 };
  for (let t = 0; t < n; t += 3) {
    let cx = 0, cy = 0, cz = 0, nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < 3; k++) { cx += p.getX(t + k); cy += p.getY(t + k); cz += p.getZ(t + k); nx += nrm.getX(t + k); ny += nrm.getY(t + k); nz += nrm.getZ(t + k); }
    cx /= 3; cz /= 3; nx /= 3; ny /= 3; nz /= 3;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl;
    let region;
    if (mode.startsWith('solid:')) region = 'solid:' + mode.slice(6);
    else if (mode === 'top') region = 'top';
    else if (ny < -0.55) region = 'solid:secondary';
    else if (ny > 0.74) region = 'top';
    else region = nx >= 0 ? 'R' : 'L';
    for (let k = 0; k < 3; k++) {
      const x = p.getX(t + k), y = p.getY(t + k), z = p.getZ(t + k);
      let u, v;
      if (region === 'top') { u = x / Wm + 0.5; v = A.topV0 + (1 - A.topV0) * (0.5 - z / Lm); }
      else if (region === 'R') { u = 0.5 - z / Lm; v = A.rV0 + (A.topV0 - A.rV0) * (0.5 + y / (dims.L * 0.3)); }
      else if (region === 'L') { u = 0.5 + z / Lm; v = A.lV0 + (A.rV0 - A.lV0) * (0.5 + y / (dims.L * 0.3)); }
      else { const c = solid[region.slice(6)]; u = (c + 0.5) / 4; v = A.solidV; }
      if (region === 'top' || region === 'R' || region === 'L') {
        const lo = region === 'top' ? A.topV0 : region === 'R' ? A.rV0 : A.lV0, hi = region === 'top' ? 1 : region === 'R' ? A.topV0 : A.rV0;
        const pad = 0.004; v = Math.min(hi - pad, Math.max(lo + pad, v)); u = Math.min(0.995, Math.max(0.005, u));
      }
      uv[(t + k) * 2] = u; uv[(t + k) * 2 + 1] = v;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Straight tube between two points (struts, wires, pitot). */
export function tube(a, b, r, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

/** Surface of revolution about +Z: profile [[z, r], ...] (nose first). */
export function lathe(profile, K = 20, center = [0, 0]) {
  return loft(profile.map(([z, r]) => [z, r, r, r, 0, 2]), K).translate(center[0], center[1], 0);
}

/** Flame cone along +Z with RGBA vertex colours (hot core -> transparent tip). */
export function flameGeometry(r, len, K = 14) {
  const pos = [], col = [], idx = [];
  const rings = [[0, 0.8, [0.7, 0.85, 1, 0.9]], [0.15, 0.9, [1, 0.8, 0.4, 0.8]], [0.5, 0.6, [1, 0.45, 0.12, 0.5]], [1, 0.0, [1, 0.25, 0.05, 0]]];
  for (const [zf, rf, c] of rings) for (let k = 0; k < K; k++) { const a = (k / K) * TAU; pos.push(Math.cos(a) * r * rf, Math.sin(a) * r * rf, zf * len); col.push(...c); }
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < K; k++) {
    const a = i * K + k, b = i * K + ((k + 1) % K), c = (i + 1) * K + k, d = (i + 1) * K + ((k + 1) % K);
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx);
  return g;
}
