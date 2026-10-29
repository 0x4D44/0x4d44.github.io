// Frost props: faceted, flat-shaded and vertex-coloured so they read as ice and snow at 300 km/h. Each maker returns ONE merged geometry
// (one InstancedMesh = one draw call). Also: instancing with free orientation, and surface scatter helpers for walls and floor. Owner: world agent.
import * as THREE from 'three';
import { mulberry32 } from '../util.js';

const C = (c) => new THREE.Color(c);

/** Collects flat-shaded triangles with per-vertex colours. */
export class Soup {
  constructor() { this.p = []; this.c = []; }
  tri(a, b, c, ca, cb = ca, cc = ca) {
    for (const [v, k] of [[a, ca], [b, cb], [c, cc]]) { this.p.push(v.x, v.y, v.z); this.c.push(k.r, k.g, k.b); }
  }
  quad(a, b, c, d, ca, cb = ca, cc = ca, cd = ca) { this.tri(a, b, c, ca, cb, cc); this.tri(a, c, d, ca, cc, cd); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeVertexNormals();
    return g;
  }
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** One hexagonal ice crystal: shaft + pointed tip. base (Vector3), axis (unit Vector3), radius, shaft length, tip length. */
function crystal(soup, base, axis, r, hs, ht, cLow, cHigh, cTip, rnd, sides = 6) {
  const t1 = new THREE.Vector3(1, 0, 0); if (Math.abs(axis.x) > 0.9) t1.set(0, 0, 1);
  t1.crossVectors(axis, t1).normalize(); const t2 = new THREE.Vector3().crossVectors(axis, t1);
  const ring = (h, rr, rot) => Array.from({ length: sides }, (_, i) => { const a = (i / sides) * Math.PI * 2 + rot; return base.clone().addScaledVector(axis, h).addScaledVector(t1, Math.cos(a) * rr).addScaledVector(t2, Math.sin(a) * rr); });
  const rot = rnd() * 6, lo = ring(0, r * 0.92, rot), hi = ring(hs, r, rot + 0.05), apex = base.clone().addScaledVector(axis, hs + ht).addScaledVector(t1, (rnd() - 0.5) * r * 0.35);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    soup.quad(lo[i], lo[j], hi[j], hi[i], cLow, cLow, cHigh, cHigh);
    soup.tri(hi[i], hi[j], apex, cHigh, cHigh, cTip);
  }
}

/** Cluster of ice crystals fanning out of a common root. Unit-ish size: footprint ~1, tallest ~height. Root at the origin, grows along +Y. */
export function makeCrystalCluster({ seed = 1, n = 6, height = 1, spread = 0.45, low = 0x2860b8, high = 0x9fdcff, tip = 0xffffff, tilt = 0.5 } = {}) {
  const rnd = mulberry32(seed), s = new Soup(), cl = C(low), ch = C(high), ct = C(tip);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = i === 0 ? 0 : spread * (0.35 + 0.65 * rnd()), k = i === 0 ? 0.12 : tilt * (0.5 + rnd());
    const axis = V(Math.sin(k) * Math.cos(a), Math.cos(k), Math.sin(k) * Math.sin(a)).normalize();
    const h = height * (i === 0 ? 1 : 0.35 + 0.5 * rnd()), r = height * (i === 0 ? 0.14 : 0.07 + 0.06 * rnd());
    crystal(s, V(Math.cos(a) * d, -r * 0.6, Math.sin(a) * d), axis, r, h * 0.7, h * 0.3 + r * 1.2, cl, ch, ct, rnd);
  }
  return s.geometry();
}

/** Faceted ice column / spire, root at y=0, height 1, radius 1. taper = fraction of the height where the point starts (hazard stacks keep full
 *  width up to their collision top). Ringed with snow shelves, twisted slightly, plus a few satellite shards at the foot. */
export function makeIceSpire({ seed = 3, taper = 0.55, sides = 7, rings = 7, shards = 3, low = 0x244f9c, high = 0xa9e2ff, snow = 0xf2f6ff } = {}) {
  const rnd = mulberry32(seed), s = new Soup(), cl = C(low), ch = C(high), cs = C(snow), ct = C(0xffffff);
  const prof = (t) => (t <= taper ? 1 - 0.12 * t / Math.max(taper, 0.01) : Math.pow(1 - (t - taper) / (1 - taper), 0.9)) * (0.9 + 0.2 * Math.sin(t * 17 + seed));
  const hf = (a) => { const v = Math.sin(a) * 43758.5453; return v - Math.floor(v); };
  const ringPts = (t, rot) => {
    const r = Math.max(0.0, prof(t)), y = t;
    return Array.from({ length: sides }, (_, i) => { const a = (i / sides) * Math.PI * 2 + rot + t * 0.6, j = 0.86 + 0.28 * hf(i * 12.9 + t * 40 + seed); return V(Math.cos(a) * r * j, y, Math.sin(a) * r * j); });
  };
  let prev = ringPts(0, 0);
  for (let k = 1; k <= rings; k++) {
    const t = k / rings, cur = ringPts(t === 1 ? 0.999 : t, 0.0);
    const snowy = k % 3 === 0 && t < 0.9, colA = cl.clone().lerp(ch, (k - 1) / rings), colB = cl.clone().lerp(ch, k / rings);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides, a = snowy ? cs : colA, b = snowy ? cs : colB;
      s.quad(prev[i], prev[j], cur[j], cur[i], a, a, b, b);
    }
    prev = cur;
  }
  const apex = V(0.02, 1.0, 0.0); for (let i = 0; i < sides; i++) s.tri(prev[i], prev[(i + 1) % sides], apex, ch, ch, ct);
  for (let m = 0; m < shards; m++) {
    const a = (m / shards) * 6.28 + rnd(), d = 0.95 + 0.25 * rnd(), k = 0.35 + 0.3 * rnd();
    crystal(s, V(Math.cos(a) * d * 0.9, -0.02, Math.sin(a) * d * 0.9), V(Math.sin(k) * Math.cos(a), Math.cos(k), Math.sin(k) * Math.sin(a)).normalize(), 0.28, 0.22 + 0.2 * rnd(), 0.28, cl, ch, ct, rnd);
  }
  return s.geometry();
}

/** Faceted ice arch: a half ring in the XY plane (centre at the origin, crown at +radius, feet at y=0, thickness along z). A jittered n-gon is swept along
 *  the arc, fat at the feet and slimmer at the crown; snow on top, deep blue underneath, ragged icicle teeth along the inner edge. */
export function makeIceArch({ radius = 80, tube = 16, seed = 3, segs = 30, sides = 8, low = 0x1f4a9a, high = 0x8fd6ff, snow = 0xf4f8ff } = {}) {
  const s = new Soup(), cl = C(low), ch = C(high), cs = C(snow);
  const hf = (a) => { const v = Math.sin(a) * 43758.5453; return v - Math.floor(v); };
  const rings = [];
  for (let k = 0; k <= segs; k++) {
    const th = (k / segs) * Math.PI, rh = new THREE.Vector3(Math.cos(th), Math.sin(th), 0), foot = Math.pow(Math.abs(Math.cos(th)), 3);
    const tk = tube * (1 + 0.55 * foot - 0.18 * Math.sin(th)) * (0.88 + 0.24 * hf(k * 3.1 + seed));
    const ring = [];
    for (let i = 0; i < sides; i++) {
      const ph = (i / sides) * Math.PI * 2, j = 0.8 + 0.4 * hf(i * 7.7 + k * 1.9 + seed * 3);
      const rr = tk * j * (i === 0 ? 1.0 : 1.0), out = Math.cos(ph) * rr, z = Math.sin(ph) * rr * 1.35;
      const p = new THREE.Vector3(Math.cos(th) * radius, Math.sin(th) * radius, 0).addScaledVector(rh, out).add(new THREE.Vector3(0, 0, z));
      const topness = 0.5 + 0.5 * (rh.y * Math.cos(ph) * 0.8 + 0.2 * Math.cos(ph));
      ring.push({ p, c: cl.clone().lerp(ch, 0.35 + 0.35 * hf(i + k)).lerp(cs, Math.max(0, topness - 0.45) * 1.6) });
    }
    rings.push(ring);
  }
  for (let k = 0; k < segs; k++) for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides, a = rings[k][i], b = rings[k][j], c = rings[k + 1][j], d = rings[k + 1][i];
    s.quad(a.p, b.p, c.p, d.p, a.c, b.c, c.c, d.c);
  }
  return s.geometry();
}

/** Snow-laden pine, root at y=0, ~1 unit = 22 m tall (scale it). Tiers of drooping cones: snow on the crown, dark needles under the rim. */
export function makeSnowPine({ seed = 1, tiers = 5, height = 22, needles = 0x1a4a52, needles2 = 0x2c6a5a, snow = 0xeef4ff } = {}) {
  const rnd = mulberry32(seed), s = new Soup(), cn = C(needles), cn2 = C(needles2), cs = C(snow), ck = C(0x4a3626);
  const sides = 7;
  // trunk
  const tr = (y, r) => Array.from({ length: 5 }, (_, i) => { const a = (i / 5) * 6.283; return V(Math.cos(a) * r, y, Math.sin(a) * r); });
  const t0 = tr(0, 0.9), t1 = tr(height * 0.34, 0.5);
  for (let i = 0; i < 5; i++) s.quad(t0[i], t0[(i + 1) % 5], t1[(i + 1) % 5], t1[i], ck);
  for (let k = 0; k < tiers; k++) {
    const t = k / (tiers - 1), y0 = height * (0.12 + 0.6 * t), r = 6.4 * (1 - 0.8 * t) + 0.9, h = height * 0.3 * (1 - 0.4 * t) + 2, rot = rnd() * 6.28;
    const rim = Array.from({ length: sides }, (_, i) => { const a = (i / sides) * 6.283 + rot, rr = r * (0.8 + 0.4 * rnd()); return V(Math.cos(a) * rr, y0 - r * 0.16 + (rnd() - 0.5) * 0.6, Math.sin(a) * rr); });
    const apex = V(0, y0 + h, 0), under = V(0, y0 + 0.4, 0);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides, kk = (rnd() < 0.35 ? cn2 : cn).clone().lerp(cs, 0.22 + 0.3 * rnd());
      s.tri(rim[i], rim[j], apex, kk, kk, cs);
      s.tri(rim[j], rim[i], under, cn, cn, cn);                                   // dark underside
    }
  }
  return s.geometry();
}

/** Flat ice floe: irregular slab (radius 1, thickness ~0.16). White-blue top, teal sides. */
export function makeIceFloe({ seed = 5, sides = 8 } = {}) {
  const rnd = mulberry32(seed), s = new Soup(), top = C(0xe9f4ff), edge = C(0x6fb4e8), deep = C(0x2c6fb0);
  const pts = Array.from({ length: sides }, (_, i) => { const a = (i / sides) * 6.283, r = 0.7 + 0.3 * rnd(); return [Math.cos(a) * r, Math.sin(a) * r]; });
  const th = 0.16, c0 = V(0, th * (0.8 + 0.4 * rnd()), 0);
  for (let i = 0; i < sides; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % sides];
    const a = V(x0, th, z0), b = V(x1, th, z1), a2 = V(x0 * 0.94, -th * 0.5, z0 * 0.94), b2 = V(x1 * 0.94, -th * 0.5, z1 * 0.94);
    s.tri(c0, b, a, top, top, top);
    s.quad(a, b, b2, a2, edge, edge, deep, deep);
  }
  return s.geometry();
}

/** Hanging icicle: a 5-sided spike, root ring at y = 0 (radius ~1), point at y = -1 (leaning a little). Pale at the root, clear blue at the point;
 *  vertex-coloured, because the ice materials multiply by the colour attribute and a bare ConeGeometry would come out black. */
export function makeIcicle({ seed = 1, sides = 5, root = 0xe4f2ff, tip = 0x6fb4f2 } = {}) {
  const rnd = mulberry32(seed), s = new Soup(), cr = C(root), ct = C(tip), ring = [];
  const p = V((rnd() - 0.5) * 0.3, -1, (rnd() - 0.5) * 0.3);
  for (let i = 0; i < sides; i++) { const a = (i / sides) * Math.PI * 2 + 0.3, r = 0.85 + 0.3 * rnd(); ring.push(V(Math.cos(a) * r, 0, Math.sin(a) * r)); }
  for (let i = 0; i < sides; i++) s.tri(ring[i], ring[(i + 1) % sides], p, cr, cr, ct);
  return s.geometry();
}

/** Wind-sculpted snow mound: smooth half-ellipsoid, radius 1, height 1 (indexed, smooth normals). */
export function makeSnowDrift({ seed = 2, seg = 12, rings = 4 } = {}) {
  const rnd = mulberry32(seed), pos = [], col = [], idx = [], top = C(0xf4f7ff), low = C(0xb9c8ec);
  const jit = Array.from({ length: seg * 2 }, () => 0.85 + 0.3 * rnd());
  pos.push(0, 1, 0); col.push(top.r, top.g, top.b);
  for (let r = 1; r <= rings; r++) {
    const t = r / rings, y = Math.cos(t * Math.PI / 2) , rad = Math.sin(t * Math.PI / 2);
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * 6.283, j = jit[i % jit.length] * (1 - 0.1 * (r % 2)), x = Math.cos(a) * rad * j, z = Math.sin(a) * rad * j * 0.82;
      pos.push(x, Math.max(0, y) * (0.85 + 0.15 * Math.sin(a * 3 + seed)), z);
      const k = low.clone().lerp(top, Math.pow(1 - t, 0.7)); col.push(k.r, k.g, k.b);
    }
  }
  for (let i = 0; i < seg; i++) idx.push(0, 1 + i, 1 + (i + 1) % seg);
  for (let r = 1; r < rings; r++) for (let i = 0; i < seg; i++) {
    const a = 1 + (r - 1) * seg + i, b = 1 + (r - 1) * seg + (i + 1) % seg, c = a + seg, d = b + seg;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Lamp post: slim dark mast with a cross-arm and a lantern cage; 1 unit = 1 m, mast 30 m. The glowing orb is separate (see makeOrb). */
export function makeMast({ height = 30, color = 0x2a3447, accent = 0x9fb4d8 } = {}) {
  const s = new Soup(), c = C(color), a = C(accent);
  const ring = (y, r, n = 5) => Array.from({ length: n }, (_, i) => { const t = (i / n) * 6.283; return V(Math.cos(t) * r, y, Math.sin(t) * r); });
  const b0 = ring(0, 0.9), b1 = ring(height * 0.9, 0.35);
  for (let i = 0; i < 5; i++) s.quad(b0[i], b0[(i + 1) % 5], b1[(i + 1) % 5], b1[i], c, c, a, a);
  const top = ring(height * 0.9, 1.1), top2 = ring(height * 0.9 + 1.3, 1.1);
  for (let i = 0; i < 5; i++) s.quad(top[i], top[(i + 1) % 5], top2[(i + 1) % 5], top2[i], a);
  const cap = V(0, height * 0.9 + 3.2, 0); for (let i = 0; i < 5; i++) s.tri(top2[i], top2[(i + 1) % 5], cap, a, a, c);
  return s.geometry();
}

/** Glowing orb for lanterns / beacons (icosphere, radius 1). */
export function makeOrb(detail = 1) { return new THREE.IcosahedronGeometry(1, detail); }

/** Instancing with a free orientation: items { pos, quat?|up?, yaw?, scale (number|Vector3), color? }. `up` aligns local +Y to a direction. */
export function instancedQ(geo, mat, items, { cast = false, receive = true } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), ax = new THREE.Vector3(0, 1, 0);
  items.forEach((o, i) => {
    if (o.quat) q.copy(o.quat); else if (o.up) q.setFromUnitVectors(up, o.up); else q.identity();
    if (o.yaw) q.multiply(q2.setFromAxisAngle(ax, o.yaw));
    if (typeof o.scale === 'number') s.setScalar(o.scale); else s.copy(o.scale);
    im.setMatrixAt(i, m.compose(o.pos, q, s));
    if (o.color) im.setColorAt(i, o.color);
  });
  im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = cast; im.receiveShadow = receive; im.frustumCulled = false;
  return im;
}

/** Surface normal of a height function (central differences). */
export function surfaceNormal(H, x, z, e = 6, out = new THREE.Vector3()) {
  return out.set(H(x - e, z) - H(x + e, z), 2 * e, H(x, z - e) - H(x, z + e)).normalize();
}

/**
 * Points on the valley WALLS beside the route: marches outward from the corridor at a random height until the terrain is hit.
 * Returns [{ pos, n, s, lat, dy }]; accept(o) may veto. Keeps `clear` metres between the point and the corridor ellipse.
 */
export function scatterWall(course, H, { count, dyMin = -30, dyMax = 110, seed = 1, clear = 14, maxLat = 420, accept }) {
  const rnd = mulberry32(seed), f = {}, out = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 30) {
    const s = rnd() * course.length; course.frameAt(s, f);
    const side = rnd() < 0.5 ? -1 : 1, dy = dyMin + rnd() * (dyMax - dyMin), y = f.pos.y + dy;
    let lat = f.halfWidth * 0.9, hit = false, x = 0, z = 0;
    for (; lat < maxLat; lat += 5) {
      x = f.pos.x + f.right.x * side * lat; z = f.pos.z + f.right.z * side * lat;
      if (H(x, z) >= y) { hit = true; break; }
    }
    if (!hit) continue;
    const e = Math.hypot(lat / (f.halfWidth + clear), dy / (f.halfHeight + clear));
    if (e < 1) continue;
    const o = { pos: new THREE.Vector3(x, y, z), n: surfaceNormal(H, x, z, 5), s, lat: side * lat, dy, side, r: rnd() };
    if (accept && !accept(o, f)) continue;
    out.push(o);
  }
  return out;
}

/** One wall point beside a route frame: marches outward from the corridor at world height `y` until the terrain is hit. Returns { pos, n, lat } or null. */
export function wallPoint(H, f, side, y, { from = 0.9, maxLat = 420, step = 5 } = {}) {
  for (let lat = f.halfWidth * from; lat < maxLat; lat += step) {
    const x = f.pos.x + f.right.x * side * lat, z = f.pos.z + f.right.z * side * lat;
    if (H(x, z) >= y) return { pos: new THREE.Vector3(x, y, z), n: surfaceNormal(H, x, z, 5), lat: side * lat };
  }
  return null;
}

/** Points on the valley FLOOR around and under the route (clustered into groves when `groves` is set). Returns [{ pos, s, lat, r }]. */
export function scatterFloor(course, H, { count, seed = 1, latMax = 1.15, groves = 0, groveR = 30, accept }) {
  const rnd = mulberry32(seed), f = {}, out = [];
  const centres = [];
  for (let i = 0; i < groves; i++) {
    const s = rnd() * course.length; course.frameAt(s, f);
    const lat = (rnd() * 2 - 1) * f.halfWidth * latMax; centres.push({ s, lat, r: groveR * (0.6 + 0.8 * rnd()) });
  }
  let guard = 0;
  while (out.length < count && guard++ < count * 30) {
    let s, lat;
    if (groves) { const c = centres[Math.floor(rnd() * centres.length)], a = rnd() * 6.283, d = Math.sqrt(rnd()) * c.r; s = c.s + Math.cos(a) * d; lat = c.lat + Math.sin(a) * d; }
    else { s = rnd() * course.length; lat = (rnd() * 2 - 1) * 1; }
    s = ((s % course.length) + course.length) % course.length; course.frameAt(s, f);
    if (!groves) lat *= f.halfWidth * latMax;
    const x = f.pos.x + f.right.x * lat, z = f.pos.z + f.right.z * lat, h = H(x, z);
    const o = { pos: new THREE.Vector3(x, h, z), s, lat, r: rnd(), y0: f.pos.y };
    if (accept && !accept(o, f)) continue;
    out.push(o);
  }
  return out;
}
