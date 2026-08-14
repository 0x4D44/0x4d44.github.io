// Everything the player looks at is built here: the road ribbon, the terrain it
// sits in, the car, the roadside and the event furniture. Nothing is loaded from
// disk — every surface is a DataTexture or a canvas computed from the same seeded
// noise the stage used, so a stage looks identical on reload and on every machine.
//
// THREE is injected rather than imported so this module can be exercised under
// Node, where a WebGLRenderer cannot exist but BufferGeometry happily can.
//
// Triangle budgets are asserted in tests/meshes.test.mjs; see TRIANGLE_BUDGET.

import { clamp, saturate, lerp, smoothstep, smootherstep } from "./mathx.js";
import { makeRng, hash2, hash3, stringSeed } from "./rng.js";
import { SURFACE, surfaceProps } from "./surfaces.js";

const TAU = Math.PI * 2;

// A phone has to draw this at 60 Hz, so the whole stage lives inside half a
// million triangles. Each entry is a hard ceiling, not a target.
export const TRIANGLE_BUDGET = Object.freeze({
  road: 60000,
  terrain: 175000,
  car: 30000,
  wheel: 3000,
  scenery: 240000,
  props: 70000,
  stage: 560000,
});

export const EVENT_BRANDING = Object.freeze({
  event: "OPUS RALLY",
  subtitle: "CRESTFALL STAGES",
  service: "SERVICE PARK",
  sponsors: Object.freeze([
    "NORVEX", "KELTER OILS", "TALVIK", "AXLEWORKS",
    "PYRA FUEL", "STRUT-9", "CINDERQ", "HOLM RACING",
  ]),
});

// ---- small geometry builder ---------------------------------------------

// One rule keeps normals honest: emit shared vertices where the surface should
// look smooth, duplicate them per face where it should look faceted, then let
// computeVertexNormals decide. Explicit normals are only supplied where a test
// needs them to agree bit-for-bit across two geometries (terrain chunk seams).
function mkBuilder() {
  return { pos: [], uv: [], col: [], nor: [], extra: null, idx: [], n: 0 };
}

function vert(b, x, y, z, u, v, r, g, bl) {
  b.pos.push(x, y, z);
  b.uv.push(u, v);
  b.col.push(r, g, bl);
  return b.n++;
}

function tri(b, a, c, d) {
  b.idx.push(a, c, d);
}

function quad(b, a, c, d, e) {
  b.idx.push(a, c, d, a, d, e);
}

function sanitizeNormals(g) {
  const n = g.getAttribute("normal");
  if (!n) return;
  const a = n.array;
  for (let i = 0; i < a.length; i += 3) {
    const l = Math.hypot(a[i], a[i + 1], a[i + 2]);
    if (!(l > 1e-8)) { a[i] = 0; a[i + 1] = 1; a[i + 2] = 0; continue; }
    a[i] /= l; a[i + 1] /= l; a[i + 2] /= l;
  }
  n.needsUpdate = true;
}

function finish(THREE, b, opts = {}) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
  if (opts.uv !== false) g.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
  if (opts.colors !== false) g.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3));
  if (b.extra) {
    for (const key of Object.keys(b.extra)) {
      const e = b.extra[key];
      g.setAttribute(key, new THREE.Float32BufferAttribute(e.data, e.size));
    }
  }
  const Idx = b.n > 65535 ? THREE.Uint32BufferAttribute : THREE.Uint16BufferAttribute;
  g.setIndex(new Idx(b.idx, 1));
  if (b.nor.length === b.pos.length && opts.explicitNormals) {
    g.setAttribute("normal", new THREE.Float32BufferAttribute(b.nor, 3));
  } else {
    g.computeVertexNormals();
  }
  sanitizeNormals(g);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

function triangleCount(geometry) {
  const idx = geometry.getIndex();
  if (idx) return idx.count / 3;
  return geometry.getAttribute("position").count / 3;
}

// ---- primitives ----------------------------------------------------------

// Axis-aligned box, faces unshared so the corners stay crisp.
function pushBox(b, cx, cy, cz, sx, sy, sz, col, uvScale = 1) {
  const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
  const [r, g, bl] = col;
  const face = (p0, p1, p2, p3, uw, uh) => {
    const a = vert(b, p0[0], p0[1], p0[2], 0, 0, r, g, bl);
    const c = vert(b, p1[0], p1[1], p1[2], uw * uvScale, 0, r, g, bl);
    const d = vert(b, p2[0], p2[1], p2[2], uw * uvScale, uh * uvScale, r, g, bl);
    const e = vert(b, p3[0], p3[1], p3[2], 0, uh * uvScale, r, g, bl);
    quad(b, a, c, d, e);
  };
  const x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
  face([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], sx, sy); // +Z
  face([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], sx, sy); // -Z
  face([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], sz, sy); // +X
  face([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], sz, sy); // -X
  face([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], sx, sz); // +Y
  face([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], sx, sz); // -Y
}

// A box whose top face may be smaller, offset and tilted — the workhorse for
// bonnets, roofs, wings and anything else that is a box only to a mathematician.
function pushTaper(b, cx, cy, cz, sxBot, szBot, sxTop, szTop, y0, y1, col, shiftZ = 0) {
  const [r, g, bl] = col;
  // The ring runs counter-clockwise seen from above, which is what makes the
  // four side walls and both caps come out facing outward; the clockwise order
  // this used to have turned every face inside out and a FrontSide material
  // culled the scoop, the louvres, the mirrors and the seats away entirely.
  const corners = (sx, sz, y, dz) => ([
    [cx - sx * 0.5, y, cz + sz * 0.5 + dz],
    [cx + sx * 0.5, y, cz + sz * 0.5 + dz],
    [cx + sx * 0.5, y, cz - sz * 0.5 + dz],
    [cx - sx * 0.5, y, cz - sz * 0.5 + dz],
  ]);
  const lo = corners(sxBot, szBot, cy + y0, 0);
  const hi = corners(sxTop, szTop, cy + y1, shiftZ);
  const add = (p, u, v) => vert(b, p[0], p[1], p[2], u, v, r, g, bl);
  for (let i = 0; i < 4; i += 1) {
    const j = (i + 1) % 4;
    const a = add(lo[i], 0, 0), c = add(lo[j], 1, 0), d = add(hi[j], 1, 1), e = add(hi[i], 0, 1);
    quad(b, a, c, d, e);
  }
  const t0 = add(hi[0], 0, 0), t1 = add(hi[1], 1, 0), t2 = add(hi[2], 1, 1), t3 = add(hi[3], 0, 1);
  quad(b, t0, t1, t2, t3);
  const b0 = add(lo[0], 0, 0), b1 = add(lo[3], 0, 1), b2 = add(lo[2], 1, 1), b3 = add(lo[1], 1, 0);
  quad(b, b0, b1, b2, b3);
}

// Cylinder about an arbitrary axis ("x","y","z"), optionally tapered and capped.
function pushCylinder(b, cx, cy, cz, r0, r1, len, sides, axis, col, caps = true) {
  const [cr, cg, cb] = col;
  const half = len * 0.5;
  // The two in-plane axes have to pair with `along` the same way round for every
  // choice of axis, or the ring runs backwards and the whole cylinder — walls and
  // both caps — comes out inside out. It did, on "z", which is the axis the
  // headlamp discs, the fallen logs and the stump branch are built on.
  const place = (rad, along, ang) => {
    const s = Math.sin(ang) * rad, c = Math.cos(ang) * rad;
    if (axis === "y") return [cx + s, cy + along, cz + c];
    if (axis === "x") return [cx + along, cy + c, cz + s];
    return [cx + c, cy + s, cz + along];
  };
  const ringLo = [], ringHi = [];
  for (let i = 0; i < sides; i += 1) {
    const a = (i / sides) * TAU;
    const p = place(r0, -half, a);
    const q = place(r1, half, a);
    ringLo.push(vert(b, p[0], p[1], p[2], i / sides, 0, cr, cg, cb));
    ringHi.push(vert(b, q[0], q[1], q[2], i / sides, 1, cr, cg, cb));
  }
  for (let i = 0; i < sides; i += 1) {
    const j = (i + 1) % sides;
    quad(b, ringLo[i], ringLo[j], ringHi[j], ringHi[i]);
  }
  if (caps) {
    const cLo = place(0, -half, 0), cHi = place(0, half, 0);
    const a = vert(b, cLo[0], cLo[1], cLo[2], 0.5, 0.5, cr, cg, cb);
    const d = vert(b, cHi[0], cHi[1], cHi[2], 0.5, 0.5, cr, cg, cb);
    const lo2 = [], hi2 = [];
    for (let i = 0; i < sides; i += 1) {
      const ang = (i / sides) * TAU;
      const p = place(r0, -half, ang), q = place(r1, half, ang);
      lo2.push(vert(b, p[0], p[1], p[2], 0.5 + Math.cos(ang) * 0.5, 0.5 + Math.sin(ang) * 0.5, cr, cg, cb));
      hi2.push(vert(b, q[0], q[1], q[2], 0.5 + Math.cos(ang) * 0.5, 0.5 + Math.sin(ang) * 0.5, cr, cg, cb));
    }
    for (let i = 0; i < sides; i += 1) {
      const j = (i + 1) % sides;
      if (r0 > 1e-4) tri(b, a, lo2[j], lo2[i]);
      if (r1 > 1e-4) tri(b, d, hi2[i], hi2[j]);
    }
  }
}

// Cone as a fan from a single apex: a collapsed loft ring would emit degenerate
// triangles, and every geometry here is checked for minimum triangle area.
function pushCone(b, cx, cy, cz, radius, height, sides, col, base = true) {
  const [r, g, bl] = col;
  const apex = vert(b, cx, cy + height, cz, 0.5, 1, r, g, bl);
  const ring = [];
  for (let i = 0; i < sides; i += 1) {
    const a = (i / sides) * TAU;
    ring.push(vert(b, cx + Math.sin(a) * radius, cy, cz + Math.cos(a) * radius, i / sides, 0, r, g, bl));
  }
  for (let i = 0; i < sides; i += 1) tri(b, apex, ring[i], ring[(i + 1) % sides]);
  if (base) {
    const c = vert(b, cx, cy, cz, 0.5, 0.5, r, g, bl);
    const ring2 = [];
    for (let i = 0; i < sides; i += 1) {
      const a = (i / sides) * TAU;
      ring2.push(vert(b, cx + Math.sin(a) * radius, cy, cz + Math.cos(a) * radius, 0.5, 0.5, r, g, bl));
    }
    for (let i = 0; i < sides; i += 1) tri(b, c, ring2[(i + 1) % sides], ring2[i]);
  }
}

// Subdivided octahedron: rounder than a box for a fraction of a UV sphere, and
// with no pole singularity to produce slivers.
const OCTA_V = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
const OCTA_F = [
  [0, 4, 2], [0, 2, 5], [0, 5, 3], [0, 3, 4],
  [1, 2, 4], [1, 5, 2], [1, 3, 5], [1, 4, 3],
];

function pushBlob(b, cx, cy, cz, rx, ry, rz, col, subdiv = 1, warpSeed = 0, warp = 0) {
  const [r, g, bl] = col;
  const emit = (p) => {
    const l = Math.hypot(p[0], p[1], p[2]) || 1;
    const nx = p[0] / l, ny = p[1] / l, nz = p[2] / l;
    let k = 1;
    if (warp > 0) {
      k = 1 + (hash3(Math.round(nx * 64), Math.round(ny * 64), Math.round(nz * 64), warpSeed) - 0.5) * warp;
    }
    return vert(b,
      cx + nx * rx * k, cy + ny * ry * k, cz + nz * rz * k,
      0.5 + Math.atan2(nz, nx) / TAU, 0.5 + ny * 0.5, r, g, bl);
  };
  const mid = (a, c) => [(a[0] + c[0]) * 0.5, (a[1] + c[1]) * 0.5, (a[2] + c[2]) * 0.5];
  const recurse = (p0, p1, p2, depth) => {
    if (depth === 0) {
      tri(b, emit(p0), emit(p1), emit(p2));
      return;
    }
    const m0 = mid(p0, p1), m1 = mid(p1, p2), m2 = mid(p2, p0);
    recurse(p0, m0, m2, depth - 1);
    recurse(m0, p1, m1, depth - 1);
    recurse(m2, m1, p2, depth - 1);
    recurse(m0, m1, m2, depth - 1);
  };
  for (const f of OCTA_F) recurse(OCTA_V[f[0]], OCTA_V[f[1]], OCTA_V[f[2]], subdiv);
}

function pushQuad3(b, p0, p1, p2, p3, col, uw = 1, uh = 1) {
  const [r, g, bl] = col;
  const a = vert(b, p0[0], p0[1], p0[2], 0, 0, r, g, bl);
  const c = vert(b, p1[0], p1[1], p1[2], uw, 0, r, g, bl);
  const d = vert(b, p2[0], p2[1], p2[2], uw, uh, r, g, bl);
  const e = vert(b, p3[0], p3[1], p3[2], 0, uh, r, g, bl);
  quad(b, a, c, d, e);
}

// Parallel-transported sweep: a naive per-segment frame flips when the path
// passes vertical, which twists a roll cage bar inside out.
function pushTube(b, path, radius, sides, col, closedEnds = true) {
  if (path.length < 2) return;
  const [r, g, bl] = col;
  let ux = 0, uy = 1, uz = 0;
  const rings = [];
  for (let i = 0; i < path.length; i += 1) {
    const p = path[i];
    const q = path[Math.min(i + 1, path.length - 1)];
    const o = path[Math.max(i - 1, 0)];
    let tx = q[0] - o[0], ty = q[1] - o[1], tz = q[2] - o[2];
    let tl = Math.hypot(tx, ty, tz);
    if (tl < 1e-9) { tx = 0; ty = 0; tz = 1; tl = 1; }
    tx /= tl; ty /= tl; tz /= tl;
    // Gram-Schmidt the carried up-vector against the new tangent.
    let d = ux * tx + uy * ty + uz * tz;
    let nx = ux - tx * d, ny = uy - ty * d, nz = uz - tz * d;
    let nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-6) {
      nx = Math.abs(tx) < 0.9 ? 1 : 0; ny = Math.abs(tx) < 0.9 ? 0 : 1; nz = 0;
      d = nx * tx + ny * ty + nz * tz;
      nx -= tx * d; ny -= ty * d; nz -= tz * d;
      nl = Math.hypot(nx, ny, nz) || 1;
    }
    nx /= nl; ny /= nl; nz /= nl;
    ux = nx; uy = ny; uz = nz;
    const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
    const ring = [];
    const rad = typeof radius === "function" ? radius(i / (path.length - 1)) : radius;
    for (let k = 0; k < sides; k += 1) {
      const a = (k / sides) * TAU;
      const ca = Math.cos(a) * rad, sa = Math.sin(a) * rad;
      ring.push(vert(b,
        p[0] + nx * ca + bx * sa, p[1] + ny * ca + by * sa, p[2] + nz * ca + bz * sa,
        k / sides, i / (path.length - 1), r, g, bl));
    }
    rings.push(ring);
  }
  for (let i = 0; i + 1 < rings.length; i += 1) {
    for (let k = 0; k < sides; k += 1) {
      const j = (k + 1) % sides;
      quad(b, rings[i][k], rings[i][j], rings[i + 1][j], rings[i + 1][k]);
    }
  }
  if (closedEnds) {
    for (const [ring, p, flip] of [[rings[0], path[0], true], [rings[rings.length - 1], path[path.length - 1], false]]) {
      const c = vert(b, p[0], p[1], p[2], 0.5, 0.5, r, g, bl);
      for (let k = 0; k < sides; k += 1) {
        const j = (k + 1) % sides;
        if (flip) tri(b, c, ring[j], ring[k]); else tri(b, c, ring[k], ring[j]);
      }
    }
  }
}

// Loft closed rings of identical length; the shared vertices give smooth shading
// along the body sides without a normal-smoothing pass guessing at the crease.
function pushLoft(b, rings, col, capStart = false, capEnd = false) {
  const [r, g, bl] = col;
  const K = rings[0].length;
  const idx = [];
  for (let i = 0; i < rings.length; i += 1) {
    const row = [];
    for (let k = 0; k < K; k += 1) {
      const p = rings[i][k];
      row.push(vert(b, p[0], p[1], p[2], k / K, i / (rings.length - 1), r, g, bl));
    }
    idx.push(row);
  }
  for (let i = 0; i + 1 < rings.length; i += 1) {
    for (let k = 0; k < K; k += 1) {
      const j = (k + 1) % K;
      quad(b, idx[i][k], idx[i][j], idx[i + 1][j], idx[i + 1][k]);
    }
  }
  const cap = (ring, flip) => {
    let cx = 0, cy = 0, cz = 0;
    for (const p of ring) { cx += p[0]; cy += p[1]; cz += p[2]; }
    cx /= ring.length; cy /= ring.length; cz /= ring.length;
    const c = vert(b, cx, cy, cz, 0.5, 0.5, r, g, bl);
    const ids = ring.map((p, k) => vert(b, p[0], p[1], p[2], k / K, flip ? 0 : 1, r, g, bl));
    for (let k = 0; k < K; k += 1) {
      const j = (k + 1) % K;
      if (flip) tri(b, c, ids[j], ids[k]); else tri(b, c, ids[k], ids[j]);
    }
  };
  if (capStart) cap(rings[0], true);
  if (capEnd) cap(rings[rings.length - 1], false);
}

export const __primitives = Object.freeze({
  mkBuilder, vert, tri, quad, finish, pushBox, pushTaper, pushCylinder,
  pushCone, pushBlob, pushQuad3, pushTube, pushLoft, triangleCount,
});

// ---- procedural textures -------------------------------------------------

// Tiling matters more than the noise quality: a seam across a hillside is the
// one artefact a photograph never has. rng.js's gradient noise hashes unbounded
// lattice coordinates, so this local copy wraps them to the tile period instead.
function fade5(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function periodicGrad(x, y, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = fade5(xf), v = fade5(yf);
  const g = (cx, cy) => {
    const px = (((xi + cx) % period) + period) % period;
    const py = (((yi + cy) % period) + period) % period;
    const a = hash2(px, py, seed) * TAU;
    return Math.cos(a) * (xf - cx) + Math.sin(a) * (yf - cy);
  };
  const a = g(0, 0), b = g(1, 0), c = g(0, 1), d = g(1, 1);
  const top = a + (b - a) * u;
  const bot = c + (d - c) * u;
  return (top + (bot - top) * v) * 1.4142;
}

function periodicFbm(x, y, period, seed, octaves = 4, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * periodicGrad(x * freq, y * freq, period * freq, seed + i * 1013);
    norm += amp;
    amp *= gain;
    freq *= 2;
  }
  return norm > 0 ? sum / norm : 0;
}

function periodicRidge(x, y, period, seed, octaves = 4) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    const n = 1 - Math.abs(periodicGrad(x * freq, y * freq, period * freq, seed + i * 7919));
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return norm > 0 ? sum / norm : 0;
}

function linearToSrgbByte(v) {
  const c = v <= 0 ? 0 : v >= 1 ? 1 : v;
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
}

// mode drives the height field; everything else (colour, roughness, normal) is
// derived from that one field so a lit surface never disagrees with itself.
const TEXTURE_DEFS = Object.freeze({
  gravel: { mode: "pebble", albedo: [0.355, 0.315, 0.255], tint: [0.05, 0.03, 0.02], rough: [0.78, 0.98], relief: 1.35, lift: 0.55 },
  tarmac: { mode: "asphalt", albedo: [0.118, 0.120, 0.128], tint: [0.02, 0.02, 0.02], rough: [0.52, 0.86], relief: 0.55, lift: 0.35 },
  dirt: { mode: "soil", albedo: [0.255, 0.200, 0.140], tint: [0.05, 0.035, 0.02], rough: [0.82, 0.98], relief: 1.0, lift: 0.45 },
  snow: { mode: "drift", albedo: [0.800, 0.845, 0.905], tint: [0.02, 0.02, 0.04], rough: [0.38, 0.72], relief: 0.8, lift: 0.30 },
  grass: { mode: "blades", albedo: [0.150, 0.215, 0.095], tint: [0.06, 0.07, 0.03], rough: [0.72, 0.95], relief: 1.1, lift: 0.5 },
  rock: { mode: "strata", albedo: [0.250, 0.242, 0.228], tint: [0.05, 0.045, 0.04], rough: [0.62, 0.92], relief: 1.6, lift: 0.5 },
  bark: { mode: "bark", albedo: [0.150, 0.118, 0.085], tint: [0.05, 0.04, 0.025], rough: [0.80, 0.98], relief: 1.5, lift: 0.5 },
  foliage: { mode: "leaf", albedo: [0.115, 0.185, 0.075], tint: [0.05, 0.07, 0.03], rough: [0.66, 0.90], relief: 0.9, lift: 0.45, alpha: true },
  concrete: { mode: "concrete", albedo: [0.330, 0.325, 0.310], tint: [0.02, 0.02, 0.02], rough: [0.66, 0.90], relief: 0.6, lift: 0.4 },
  dirtOverlay: { mode: "splatter", albedo: [0.180, 0.140, 0.095], tint: [0.03, 0.02, 0.015], rough: [0.88, 0.99], relief: 0.7, lift: 0.5, alpha: true },
});

export const TEXTURE_NAMES = Object.freeze(Object.keys(TEXTURE_DEFS));

function heightField(def, size, seed) {
  const h = new Float32Array(size * size);
  const p = Math.max(4, Math.round(size / 32) * 4);
  const inv = 1 / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const fx = x * inv * p, fy = y * inv * p;
      let v = 0;
      switch (def.mode) {
        case "pebble": {
          const base = periodicFbm(fx * 0.5, fy * 0.5, p, seed, 3) * 0.35;
          const stones = periodicRidge(fx * 3, fy * 3, p * 3, seed + 17, 2);
          v = base + Math.pow(stones, 2.1) * 0.9;
          break;
        }
        case "asphalt": {
          const fine = periodicFbm(fx * 6, fy * 6, p * 6, seed, 3) * 0.5 + 0.5;
          const agg = Math.pow(saturate(periodicRidge(fx * 9, fy * 9, p * 9, seed + 3, 1)), 6) * 0.8;
          v = fine * 0.25 + agg;
          break;
        }
        case "soil": {
          v = periodicFbm(fx, fy, p, seed, 4) * 0.5 + 0.5;
          v += Math.pow(saturate(periodicRidge(fx * 4, fy * 4, p * 4, seed + 5, 2)), 3) * 0.35;
          break;
        }
        case "drift": {
          v = periodicFbm(fx * 0.7, fy * 0.7, p, seed, 3) * 0.4 + 0.55;
          v += Math.pow(saturate(periodicFbm(fx * 8, fy * 8, p * 8, seed + 9, 2)), 4) * 0.25;
          break;
        }
        case "blades": {
          // Streaks: high frequency across the blade, low along it.
          v = periodicFbm(fx * 10, fy * 2.2, p * 10, seed, 3) * 0.5 + 0.5;
          v = v * 0.7 + (periodicFbm(fx * 1.2, fy * 1.2, p, seed + 21, 3) * 0.5 + 0.5) * 0.3;
          break;
        }
        case "strata": {
          v = periodicRidge(fx * 1.6, fy * 1.6, p * 2, seed, 4) * 0.75
            + periodicFbm(fx * 6, fy * 6, p * 6, seed + 11, 2) * 0.25 + 0.15;
          break;
        }
        case "bark": {
          v = periodicRidge(fx * 9, fy * 0.9, p * 9, seed, 3) * 0.8
            + periodicFbm(fx * 3, fy * 12, p * 12, seed + 4, 2) * 0.2 + 0.1;
          break;
        }
        case "leaf": {
          const blob = periodicFbm(fx * 5, fy * 5, p * 5, seed, 3) * 0.5 + 0.5;
          v = Math.pow(blob, 1.4);
          break;
        }
        case "concrete": {
          v = periodicFbm(fx * 3, fy * 3, p * 3, seed, 4) * 0.35 + 0.6;
          const pit = saturate(periodicRidge(fx * 14, fy * 14, p * 14, seed + 6, 1));
          v -= Math.pow(pit, 10) * 0.5;
          break;
        }
        default: { // splatter
          const s = saturate(periodicRidge(fx * 4, fy * 4, p * 4, seed, 3));
          v = Math.pow(s, 3.2);
          break;
        }
      }
      h[y * size + x] = saturate(v);
    }
  }
  return h;
}

// Ground textures are read at a grazing angle almost everywhere, where trilinear
// filtering alone collapses them to their average colour a couple of hundred
// metres out. The renderer clamps this to whatever the hardware supports.
const SURFACE_ANISOTROPY = 8;

function buildTextureSet(THREE, name, size, seed) {
  const def = TEXTURE_DEFS[name] || TEXTURE_DEFS.gravel;
  const h = heightField(def, size, seed);
  const px = size * size;
  const colour = new Uint8Array(px * 4);
  const rough = new Uint8Array(px * 4);
  const normal = new Uint8Array(px * 4);
  const mean = [0, 0, 0];
  const at = (x, y) => h[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      const v = h[i];
      const shade = def.lift + v * (1.6 - def.lift);
      const jitter = (hash2(x, y, seed + 991) - 0.5) * 0.10;
      const o = i * 4;
      for (let c = 0; c < 3; c += 1) {
        const base = def.albedo[c] * shade + def.tint[c] * (v - 0.5) * 2 + jitter * def.albedo[c];
        mean[c] += saturate(base);
        colour[o + c] = linearToSrgbByte(base);
      }
      colour[o + 3] = def.alpha ? Math.round(saturate(v * 1.6 - 0.18) * 255) : 255;

      const rg = Math.round(saturate(lerp(def.rough[0], def.rough[1], 1 - v)) * 255);
      rough[o] = rg; rough[o + 1] = rg; rough[o + 2] = rg; rough[o + 3] = 255;

      // Sobel on the same field, so a bump you can see is a bump that lights.
      const dx = (at(x + 1, y) - at(x - 1, y)) * def.relief * size * 0.012;
      const dy = (at(x, y + 1) - at(x, y - 1)) * def.relief * size * 0.012;
      const l = Math.hypot(-dx, -dy, 1);
      normal[o] = Math.round(((-dx / l) * 0.5 + 0.5) * 255);
      normal[o + 1] = Math.round(((-dy / l) * 0.5 + 0.5) * 255);
      normal[o + 2] = Math.round(((1 / l) * 0.5 + 0.5) * 255);
      normal[o + 3] = 255;
    }
  }
  const mk = (data, srgb) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = SURFACE_ANISOTROPY;
    if (srgb && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return Object.freeze({
    name,
    size,
    map: mk(colour, true),
    roughnessMap: mk(rough, false),
    normalMap: mk(normal, false),
    height: h,
    // What this map contributes to the lit albedo on its own, per channel. A
    // mesh that also carries an albedo in its vertex colours divides this out
    // (see neutraliseAlbedo) instead of multiplying the two together.
    albedoMean: Object.freeze([
      Math.max(1e-4, mean[0] / px),
      Math.max(1e-4, mean[1] / px),
      Math.max(1e-4, mean[2] / px),
    ]),
  });
}

// THE ONE ALBEDO RULE. A MeshStandardMaterial shades `map x color x vertexColour`,
// so exactly one of those three may carry the surface's albedo and the other two
// must be neutral. Getting it wrong squares a dark number: conifer foliage came
// out at 0.007 linear against 0.04-0.09 for the real thing, which is why the
// trees photographed as flat black cut-outs. Three shapes are allowed, and
// nothing else — every material in this module goes through one of them:
//
//   generated map  -> neutraliseAlbedo(): `color` is the reciprocal of the map's
//                     own mean, so the map is pure detail and the vertex colour
//                     is the albedo.
//   no colour map  -> vertexAlbedo(): `color` stays white, vertex colour is the
//                     albedo.
//   painted        -> paintedAlbedo(): a canvas map or a flat authored colour IS
//                     the albedo, so vertex colours are switched off entirely.
//
// `userData.opusMapMean` records what the map contributes so the effective
// albedo of any mesh can be measured headlessly; see materialAlbedoScale().
const UNIT_MEAN = Object.freeze([1, 1, 1]);

function neutraliseAlbedo(material, set) {
  if (!material || !set || !material.color) return material;
  const m = set.albedoMean;
  material.color.setRGB(1 / m[0], 1 / m[1], 1 / m[2]);
  material.userData.opusMapMean = m;
  return material;
}

function vertexAlbedo(material) {
  if (!material || !material.color) return material;
  material.color.setRGB(1, 1, 1);
  material.userData.opusMapMean = UNIT_MEAN;
  return material;
}

function paintedAlbedo(material) {
  if (!material) return material;
  material.vertexColors = false;
  material.userData.opusMapMean = null;
  return material;
}

// What a vertex colour of 1.0 reflects through this material, per channel:
// multiply by a geometry's own vertex colours and you have the linear albedo the
// renderer will shade. Null for a painted material, whose albedo lives in canvas
// pixels this module cannot average without a real 2D context.
export function materialAlbedoScale(material, out = [0, 0, 0]) {
  const mean = material && material.userData ? material.userData.opusMapMean : UNIT_MEAN;
  if (mean === null) return null;
  const m = mean || UNIT_MEAN;
  const c = material && material.color;
  out[0] = (c ? c.r : 1) * m[0];
  out[1] = (c ? c.g : 1) * m[1];
  out[2] = (c ? c.b : 1) * m[2];
  return out;
}

const textureCache = new Map();

// Generating the same texture twice is a defect: the cache is keyed on
// everything that changes a pixel.
export function surfaceTexture(THREE, name, opts = {}) {
  const size = opts.size ?? 256;
  const seed = typeof opts.seed === "string" ? stringSeed(opts.seed) : (opts.seed ?? 0);
  const key = `${name}|${size}|${seed}`;
  const hit = textureCache.get(key);
  if (hit) return hit;
  const set = buildTextureSet(THREE, name, size, seed);
  textureCache.set(key, set);
  return set;
}

export function disposeTextures() {
  for (const set of textureCache.values()) {
    set.map.dispose();
    set.roughnessMap.dispose();
    set.normalMap.dispose();
  }
  textureCache.clear();
}

export const clearTextureCache = disposeTextures;

export function textureCacheSize() {
  return textureCache.size;
}

// ---- canvas plumbing -----------------------------------------------------

// Canvas is only used where text is: liveries and signage. Everything else is a
// DataTexture, which is why this module runs headless.
function defaultCanvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }
  return null;
}

function makeCanvas(opts, w, h) {
  const factory = opts && opts.canvasFactory;
  const c = factory ? factory(w, h) : defaultCanvas(w, h);
  if (!c) return null;
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  return c;
}

function canvasTexture(THREE, canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  if (srgb && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// ---- livery --------------------------------------------------------------

// The body UV is a single atlas: the loft assigns u across the section and v
// along the car, so these regions land where the panel does.
const LIVERY_REGIONS = Object.freeze({
  doorLeft: { x: 0.06, y: 0.34, w: 0.30, h: 0.30 },
  doorRight: { x: 0.64, y: 0.34, w: 0.30, h: 0.30 },
  roof: { x: 0.37, y: 0.06, w: 0.26, h: 0.22 },
  bonnet: { x: 0.37, y: 0.70, w: 0.26, h: 0.24 },
});

const STENCIL_FACE = '700 {size}px "Arial Black", "Helvetica Neue", Impact, sans-serif';
const SPONSOR_FACE = '700 {size}px "Arial Narrow", Arial, Helvetica, sans-serif';

function face(template, size) {
  return template.replace("{size}", String(Math.round(size)));
}

function drawPattern(ctx, W, H, livery, mode) {
  const paint = (colour, roughValue) => {
    ctx.fillStyle = mode === "rough" ? greyOf(roughValue) : colour;
  };
  const pattern = livery.pattern || "stripe";
  const stripe = livery.stripe || "#ffffff";
  const accent = livery.accent || "#101010";
  ctx.save();
  if (pattern === "stripe") {
    paint(stripe, 0.22);
    ctx.fillRect(0, H * 0.42, W, H * 0.09);
    paint(accent, 0.30);
    ctx.fillRect(0, H * 0.53, W, H * 0.035);
  } else if (pattern === "chevron") {
    paint(stripe, 0.22);
    for (let i = -2; i < 14; i += 1) {
      const x = (i / 12) * W;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + W * 0.05, 0);
      ctx.lineTo(x + W * 0.11, H);
      ctx.lineTo(x + W * 0.06, H);
      ctx.closePath();
      ctx.fill();
    }
    paint(accent, 0.30);
    ctx.fillRect(0, H * 0.62, W, H * 0.04);
  } else if (pattern === "arrow") {
    paint(stripe, 0.22);
    ctx.beginPath();
    ctx.moveTo(0, H * 0.30);
    ctx.lineTo(W * 0.58, H * 0.30);
    ctx.lineTo(W * 0.74, H * 0.50);
    ctx.lineTo(W * 0.58, H * 0.70);
    ctx.lineTo(0, H * 0.70);
    ctx.closePath();
    ctx.fill();
    paint(accent, 0.30);
    ctx.fillRect(0, H * 0.72, W, H * 0.05);
  } else if (pattern === "blocks") {
    const cols = 6;
    for (let i = 0; i < cols; i += 1) {
      paint(i % 2 ? stripe : accent, i % 2 ? 0.22 : 0.30);
      ctx.fillRect((i / cols) * W, H * (0.30 + 0.03 * (i % 3)), W / cols * 0.92, H * 0.16);
    }
  } else if (pattern === "swoop") {
    paint(stripe, 0.22);
    ctx.beginPath();
    ctx.moveTo(0, H * 0.62);
    ctx.quadraticCurveTo(W * 0.45, H * 0.20, W, H * 0.42);
    ctx.lineTo(W, H * 0.58);
    ctx.quadraticCurveTo(W * 0.45, H * 0.38, 0, H * 0.78);
    ctx.closePath();
    ctx.fill();
    paint(accent, 0.30);
    ctx.beginPath();
    ctx.moveTo(0, H * 0.80);
    ctx.quadraticCurveTo(W * 0.45, H * 0.42, W, H * 0.60);
    ctx.lineTo(W, H * 0.66);
    ctx.quadraticCurveTo(W * 0.45, H * 0.50, 0, H * 0.86);
    ctx.closePath();
    ctx.fill();
  } else if (pattern === "split") {
    paint(stripe, 0.22);
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(W, H * 0.35);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    paint(accent, 0.30);
    ctx.fillRect(0, H * 0.48, W, H * 0.03);
  } else if (pattern === "gradient") {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, stripe);
    g.addColorStop(1, accent);
    ctx.fillStyle = mode === "rough" ? greyOf(0.26) : g;
    ctx.fillRect(0, H * 0.30, W, H * 0.42);
  } else if (pattern === "checker") {
    const n = 16;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        if ((i + j) % 2) continue;
        paint(stripe, 0.22);
        ctx.fillRect((i / n) * W, H * (0.30 + j * 0.06), W / n, H * 0.06);
      }
    }
  }
  ctx.restore();
}

function greyOf(v) {
  const g = Math.round(saturate(v) * 255);
  return `rgb(${g},${g},${g})`;
}

function drawStencilNumber(ctx, region, W, H, text, fill, outline, mode) {
  const cx = (region.x + region.w * 0.5) * W;
  const cy = (region.y + region.h * 0.5) * H;
  const size = region.h * H * 0.78;
  ctx.save();
  ctx.font = face(STENCIL_FACE, size);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(3, size * 0.09);
  ctx.strokeStyle = mode === "rough" ? greyOf(0.20) : outline;
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle = mode === "rough" ? greyOf(0.18) : fill;
  ctx.fillText(text, cx, cy);
  ctx.restore();
}

function drawSponsors(ctx, W, H, rng, mode, team) {
  const rows = [
    { y: 0.24, size: 0.055, n: 3 },
    { y: 0.68, size: 0.045, n: 4 },
    { y: 0.86, size: 0.038, n: 4 },
  ];
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  for (const row of rows) {
    const cell = W / row.n;
    for (let i = 0; i < row.n; i += 1) {
      const word = rng.pick(EVENT_BRANDING.sponsors);
      const size = row.size * H;
      ctx.font = face(SPONSOR_FACE, size);
      ctx.fillStyle = mode === "rough" ? greyOf(0.24) : (rng.chance(0.5) ? "#f4f4f0" : "#101216");
      ctx.fillText(word, cell * (i + 0.5), row.y * H);
    }
  }
  ctx.font = face(SPONSOR_FACE, 0.05 * H);
  ctx.fillStyle = mode === "rough" ? greyOf(0.24) : "#f4f4f0";
  ctx.fillText(String(team || EVENT_BRANDING.event), W * 0.5, H * 0.155);
  ctx.restore();
}

function drawMud(ctx, W, H, rng) {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#ffffff";
  // Heaviest along the sills and behind the arches, which is where it lands.
  for (let i = 0; i < 620; i += 1) {
    const bias = rng.next();
    const x = rng.range(0, W);
    const y = H * (bias < 0.62 ? rng.range(0.62, 1.0) : rng.range(0.20, 0.62));
    const r = rng.range(2, 26) * (bias < 0.62 ? 1.4 : 0.7);
    ctx.globalAlpha = rng.range(0.25, 1);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 60; i += 1) {
    const x = rng.range(0, W);
    const y = rng.range(H * 0.55, H);
    ctx.globalAlpha = rng.range(0.3, 0.9);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + rng.range(-40, 40), y - rng.range(20, 90), x + rng.range(-60, 60), y - rng.range(40, 160));
    ctx.lineWidth = rng.range(2, 9);
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function paintLivery(canvas, livery, mode, seed) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const W = canvas.width, H = canvas.height;
  const rng = makeRng(seed);
  if (mode === "mud") {
    drawMud(ctx, W, H, rng);
    return true;
  }
  ctx.fillStyle = mode === "rough" ? greyOf(0.28) : (livery.base || "#cccccc");
  ctx.fillRect(0, 0, W, H);
  drawPattern(ctx, W, H, livery, mode);
  const num = String(livery.number ?? 0);
  drawStencilNumber(ctx, LIVERY_REGIONS.doorLeft, W, H, num, "#ffffff", "#111111", mode);
  drawStencilNumber(ctx, LIVERY_REGIONS.doorRight, W, H, num, "#ffffff", "#111111", mode);
  drawStencilNumber(ctx, LIVERY_REGIONS.roof, W, H, num, "#111111", "#ffffff", mode);
  drawSponsors(ctx, W, H, rng, mode, livery.team);
  // A rally plate: the one thing that turns a painted car into an entry.
  ctx.save();
  ctx.fillStyle = mode === "rough" ? greyOf(0.34) : "#f2f2ee";
  ctx.fillRect(W * 0.38, H * 0.905, W * 0.24, H * 0.07);
  ctx.fillStyle = mode === "rough" ? greyOf(0.30) : "#14171c";
  ctx.font = face(SPONSOR_FACE, H * 0.036);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(EVENT_BRANDING.event, W * 0.5, H * 0.94);
  ctx.restore();
  return true;
}

// Panel seams and orange peel, computed rather than drawn: a canvas cannot be
// read back to a normal map without getImageData, which the headless path lacks.
function liveryNormalTexture(THREE, size, seed) {
  const data = new Uint8Array(size * size * 4);
  const seams = [0.30, 0.34, 0.64, 0.68];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size, v = y / size;
      let dx = (periodicFbm(u * 24, v * 24, 24, seed, 2)) * 0.05;
      let dy = (periodicFbm(u * 24 + 5, v * 24 + 5, 24, seed + 7, 2)) * 0.05;
      for (const s of seams) {
        const d = (u - s) * size / 4;
        if (Math.abs(d) < 3) dx += -d * Math.exp(-d * d * 0.5) * 0.9;
      }
      const l = Math.hypot(-dx, -dy, 1);
      const o = (y * size + x) * 4;
      data[o] = Math.round(((-dx / l) * 0.5 + 0.5) * 255);
      data[o + 1] = Math.round(((-dy / l) * 0.5 + 0.5) * 255);
      data[o + 2] = Math.round(((1 / l) * 0.5 + 0.5) * 255);
      data[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

const liveryCache = new Map();

export function liveryTexture(THREE, livery, opts = {}) {
  const spec = livery || {};
  const size = opts.size ?? 1024;
  const key = `${spec.team || ""}|${spec.base}|${spec.stripe}|${spec.accent}|${spec.pattern}|${spec.number}|${size}|${opts.canvasFactory ? "fake" : "real"}`;
  const hit = liveryCache.get(key);
  if (hit) { hit.refs += 1; return hit; }

  const seed = stringSeed(`${spec.team || "team"}|${spec.pattern || "stripe"}|${spec.number ?? 0}`);
  const W = size, H = Math.max(8, Math.round(size * 0.5));
  const colourCanvas = makeCanvas(opts, W, H);
  const roughCanvas = makeCanvas(opts, W, H);
  const mudCanvas = makeCanvas(opts, Math.max(8, W >> 1), Math.max(8, H >> 1));

  let map = null, roughnessMap = null, mudMap = null;
  if (colourCanvas && paintLivery(colourCanvas, spec, "colour", seed)) {
    map = canvasTexture(THREE, colourCanvas, true);
  }
  if (roughCanvas && paintLivery(roughCanvas, spec, "rough", seed)) {
    roughnessMap = canvasTexture(THREE, roughCanvas, false);
  }
  if (mudCanvas && paintLivery(mudCanvas, spec, "mud", seed + 99)) {
    mudMap = canvasTexture(THREE, mudCanvas, false);
  }
  const normalMap = liveryNormalTexture(THREE, Math.max(16, Math.min(256, size >> 2)), seed);

  const result = {
    livery: spec,
    size,
    map,
    roughnessMap,
    normalMap,
    mudMap,
    canvas: colourCanvas,
    roughCanvas,
    mudCanvas,
    // The set is shared, so a car and its ghost hold the same GPU textures.
    // Disposing on the first release would leave the survivor rendering with
    // freed maps, so the last holder out frees them.
    refs: 1,
    dispose(force = false) {
      result.refs -= 1;
      if (!force && result.refs > 0) return;
      map?.dispose();
      roughnessMap?.dispose();
      mudMap?.dispose();
      normalMap.dispose();
      result.refs = 0;
      liveryCache.delete(key);
    },
  };
  liveryCache.set(key, result);
  return result;
}

export function clearLiveryCache() {
  for (const v of Array.from(liveryCache.values())) v.dispose(true);
  liveryCache.clear();
}

// ---- stage access --------------------------------------------------------

// stage.js is written by another author and may hand over a partially populated
// Stage while it is in flight; every read here is defensive so a missing optional
// array degrades the look rather than throwing during a build.
function stageAt(stage, i) {
  const n = stage.count;
  const k = i < 0 ? 0 : i >= n ? n - 1 : i;
  return k;
}

function tangentOf(stage, i) {
  if (stage.tx) return [stage.tx[i], stage.ty ? stage.ty[i] : 0, stage.tz[i]];
  const a = stageAt(stage, i - 1), b = stageAt(stage, i + 1);
  const dx = stage.x[b] - stage.x[a], dy = stage.y[b] - stage.y[a], dz = stage.z[b] - stage.z[a];
  const l = Math.hypot(dx, dy, dz) || 1;
  return [dx / l, dy / l, dz / l];
}

function halfWidthOf(stage, i) {
  const w = stage.halfWidth ? stage.halfWidth[i] : 4;
  return Number.isFinite(w) && w > 0.3 ? w : 4;
}

function worldOf(stage) {
  const w = stage.world;
  if (w && typeof w.heightAt === "function") return w;
  return {
    gravity: 9.81,
    heightAt: () => 0,
    bounds: stage.bounds,
  };
}

// A hash grid over the centreline. stage.world.project() is the contract answer
// but it may not exist yet, and scenery rejection has to be exact regardless.
function centrelineIndex(stage) {
  const cell = 40;
  const buckets = new Map();
  // Exact, not a hash. An XOR of two large multiples collides, and a collision
  // hands a query a sample from somewhere else entirely — which then reads as a
  // huge distance to the road and drops a near chunk to the coarsest terrain LOD.
  const key = (cx, cz) => (cx + 1048576) * 4194304 + (cz + 1048576);
  for (let i = 0; i < stage.count; i += 1) {
    const cx = Math.floor(stage.x[i] / cell), cz = Math.floor(stage.z[i] / cell);
    const k = key(cx, cz);
    let list = buckets.get(k);
    if (!list) { list = []; buckets.set(k, list); }
    list.push(i);
  }
  return {
    // Nearest centreline sample and its lateral distance. Returns {index, dist}.
    nearest(x, z) {
      const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
      let best = -1, bestD = Infinity;
      // A ring that yields a hit does not yet prove that hit is nearest: a
      // sample in a corner cell can be further away than one in the next ring
      // out. Keep expanding until the best distance beats what the next ring
      // could possibly hold, since this distance picks the terrain LOD.
      for (let r = 1; r <= 6; r += 1) {
        for (let ox = -r; ox <= r; ox += 1) {
          for (let oz = -r; oz <= r; oz += 1) {
            if (r > 1 && Math.abs(ox) < r && Math.abs(oz) < r) continue;
            const list = buckets.get(key(cx + ox, cz + oz));
            if (!list) continue;
            for (let j = 0; j < list.length; j += 1) {
              const i = list[j];
              const dx = stage.x[i] - x, dz = stage.z[i] - z;
              const d = dx * dx + dz * dz;
              if (d < bestD) { bestD = d; best = i; }
            }
          }
        }
        const guaranteed = (r - 1) * cell;
        if (best >= 0 && bestD <= guaranteed * guaranteed) break;
      }
      if (best < 0) {
        for (let i = 0; i < stage.count; i += 1) {
          const dx = stage.x[i] - x, dz = stage.z[i] - z;
          const d = dx * dx + dz * dz;
          if (d < bestD) { bestD = d; best = i; }
        }
      }
      return { index: best, dist: Math.sqrt(bestD) };
    },
  };
}

// ---- road ----------------------------------------------------------------

// The cross-section is the whole reason a rally road reads as one. Left to
// right: verge, ditch, soft shoulder, edge, the windrow of loose material the
// cars push out, two polished ruts on the racing line, the crown, and the mirror
// of all of it. `f` is a fraction of stage.halfWidth; `off` is metres beyond it,
// so the edge slots sit at exactly ±halfWidth whatever the road is doing.
const ROAD_SLOTS = [
  { f: -1, off: -2.80, kind: "verge" },
  { f: -1, off: -1.15, kind: "ditch" },
  { f: -1, off: -0.42, kind: "shoulder" },
  { f: -1, off: 0, kind: "edge" },
  { f: -0.86, off: 0, kind: "loose" },
  { f: -0.66, off: 0, kind: "rutLip" },
  { f: -0.52, off: 0, kind: "rut" },
  { f: -0.38, off: 0, kind: "rutLip" },
  { f: -0.16, off: 0, kind: "crown" },
  { f: 0, off: 0, kind: "centre" },
  { f: 0.16, off: 0, kind: "crown" },
  { f: 0.38, off: 0, kind: "rutLip" },
  { f: 0.52, off: 0, kind: "rut" },
  { f: 0.66, off: 0, kind: "rutLip" },
  { f: 0.86, off: 0, kind: "loose" },
  { f: 1, off: 0, kind: "edge" },
  { f: 1, off: 0.42, kind: "shoulder" },
  { f: 1, off: 1.15, kind: "ditch" },
  { f: 1, off: 2.80, kind: "verge" },
];

export const ROAD_SECTION = Object.freeze(ROAD_SLOTS.map((s) => Object.freeze({ ...s })));
export const ROAD_EDGE_SLOTS = Object.freeze([3, 15]);
export const ROAD_CENTRE_SLOT = 9;

// Which detail set each running surface is drawn with. The albedo is already in
// the vertex colours, so this picks the grain, the relief and the roughness — the
// things that tell asphalt from a mud stretch from a water splash. Surfaces with
// no set of their own borrow the nearest one that behaves like them: mud and sand
// are soil, ice is a drift, a ford is a smooth dark sheet like asphalt.
const ROAD_TEXTURE = Object.freeze({
  [SURFACE.TARMAC]: "tarmac",
  [SURFACE.GRAVEL]: "gravel",
  [SURFACE.DIRT]: "dirt",
  [SURFACE.SNOW]: "snow",
  [SURFACE.ICE]: "snow",
  [SURFACE.GRASS]: "grass",
  [SURFACE.MUD]: "dirt",
  [SURFACE.SAND]: "dirt",
  [SURFACE.ROCK]: "rock",
  [SURFACE.WATER]: "tarmac",
});

export function roadTextureName(surfaceId) {
  return ROAD_TEXTURE[surfaceId] || "gravel";
}

function smoothed(arr, radius, count) {
  const out = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    let acc = 0, n = 0;
    for (let j = -radius; j <= radius; j += 1) {
      const k = i + j < 0 ? 0 : i + j >= count ? count - 1 : i + j;
      acc += arr[k]; n += 1;
    }
    out[i] = acc / n;
  }
  return out;
}

// Vertex density follows curvature: 2 m through a hairpin, 10 m down a straight.
// `coarsen` stretches the straights only — a 13 km stage has to fit the same
// triangle budget as a 6 km one, and the place to buy that back is the part of
// the road where nothing is happening.
function chooseStations(stage, opts, coarsen = 1) {
  const n = stage.count;
  const step = stage.step || 2;
  const chunkLen = opts.chunkLength ?? 240;
  const maxSpacing = (opts.maxSpacing ?? 10) * coarsen;
  const minSpacing = opts.minSpacing ?? 2;
  const forced = new Uint8Array(n);
  forced[0] = 1;
  forced[n - 1] = 1;
  if (stage.surface) {
    for (let i = 1; i < n; i += 1) if (stage.surface[i] !== stage.surface[i - 1]) { forced[i] = 1; forced[i - 1] = 1; }
  }
  for (const arr of [stage.crest, stage.jump]) {
    if (!arr) continue;
    for (let i = 1; i < n - 1; i += 1) if (arr[i] > 0.35 && arr[i] >= arr[i - 1] && arr[i] >= arr[i + 1]) forced[i] = 1;
  }
  if (Array.isArray(stage.features)) {
    for (const f of stage.features) {
      const i = Math.round((f.s || 0) / step);
      if (i > 0 && i < n) forced[i] = 1;
    }
  }
  const out = [];
  let i = 0;
  let lastChunk = 0;
  while (i < n - 1) {
    out.push(i);
    const k = stage.curvature ? Math.abs(stage.curvature[i]) : 0;
    const spacing = clamp(maxSpacing * Math.exp(-k * 45), minSpacing, maxSpacing);
    let stride = Math.max(1, Math.round(spacing / step));
    let next = Math.min(n - 1, i + stride);
    for (let j = i + 1; j <= next; j += 1) if (forced[j]) { next = j; break; }
    // Never let a span straddle a chunk boundary: the chunk seam has to be a
    // shared station or the frustum cull would leave a hole.
    const chunkOf = (idx) => Math.floor((idx * step) / chunkLen);
    if (chunkOf(next) !== lastChunk) {
      const boundaryS = (lastChunk + 1) * chunkLen;
      const bi = Math.min(n - 1, Math.max(i + 1, Math.round(boundaryS / step)));
      if (bi < next) next = bi;
      lastChunk = chunkOf(next);
    }
    if (next <= i) next = i + 1;
    i = next;
  }
  out.push(n - 1);
  return out;
}

export function buildRoadMesh(THREE, stage, opts = {}) {
  const world = worldOf(stage);
  const step = stage.step || 2;
  const n = stage.count;
  const chunkLength = opts.chunkLength ?? 240;
  const uvScale = opts.uvScale ?? 0.25;      // one texture tile every 4 m
  const budget = opts.roadBudget ?? TRIANGLE_BUDGET.road;
  const perSpan = (ROAD_SLOTS.length - 1) * 2;
  let stations = chooseStations(stage, opts);
  // Same escape valve the terrain uses: a longer stage gets a longer straight
  // between stations rather than a dropped frame. The forced stations (surface
  // changes, crests, jumps, features, chunk seams) survive every step of this.
  for (const coarsen of [1.4, 2, 2.8, 4, 5.6]) {
    if ((stations.length - 1) * perSpan <= budget) break;
    stations = chooseStations(stage, opts, coarsen);
  }

  // Berms and ruts are the marks a season of cars leaves. Both follow smoothed
  // curvature, because a berm does not appear and vanish inside two metres.
  const kAbs = new Float32Array(n);
  for (let i = 0; i < n; i += 1) kAbs[i] = stage.curvature ? Math.abs(stage.curvature[i]) : 0;
  const kSmooth = smoothed(kAbs, 6, n);
  const kSigned = new Float32Array(n);
  for (let i = 0; i < n; i += 1) kSigned[i] = stage.curvature ? stage.curvature[i] : 0;
  const kSignedSmooth = smoothed(kSigned, 6, n);

  const chunks = [];
  const stationInfo = [];
  let builderChunk = -1;
  let b = null;
  let prevRow = null;
  let chunkStations = null;

  const surfaceIdAt = (i) => (stage.surface ? stage.surface[i] : SURFACE.GRAVEL);

  // Index runs of one surface, so a chunk that crosses a village draws its tarmac
  // with the tarmac set and its gravel with the gravel set. chooseStations forces
  // a station on both sides of every surface change, so a run is always exact.
  let groups = null;
  let groupSid = -1;
  let groupStart = 0;
  let prevSample = -1;

  const startChunk = (index) => {
    b = mkBuilder();
    b.extra = { detail: { data: [], size: 3 } };
    chunkStations = [];
    builderChunk = index;
    prevRow = null;
    prevSample = -1;
    groups = [];
    groupSid = -1;
    groupStart = 0;
  };
  const closeGroup = () => {
    if (groupSid >= 0 && b.idx.length > groupStart) {
      groups.push({ surfaceId: groupSid, start: groupStart, count: b.idx.length - groupStart });
    }
  };
  const endChunk = () => {
    if (!b || b.n === 0) return;
    closeGroup();
    const geometry = finish(THREE, b, { explicitNormals: true });
    chunks.push({ index: builderChunk, geometry, stations: chunkStations, groups, mesh: null });
    b = null;
  };

  for (let si = 0; si < stations.length; si += 1) {
    const i = stations[si];
    const s = stage.s ? stage.s[i] : i * step;
    const chunkIndex = Math.min(Math.floor(s / chunkLength), Math.max(0, Math.floor(((n - 1) * step) / chunkLength)));
    if (chunkIndex !== builderChunk) {
      const hadRow = b !== null && prevRow !== null;
      endChunk();
      startChunk(chunkIndex);
      // Re-emit the previous station so the two chunks share an exact seam.
      if (hadRow && si > 0) emitStation(stations[si - 1], true);
    }
    emitStation(i, false);
  }
  endChunk();

  function emitStation(i, isSeamCopy) {
    const hw = halfWidthOf(stage, i);
    const s = stage.s ? stage.s[i] : i * step;
    const cx = stage.x[i], cy = stage.y[i], cz = stage.z[i];
    const t = tangentOf(stage, i);
    // Right = up x tangent = (t.z, 0, -t.x): with +Z forward and +X right that
    // is the driver's right hand, which is the sign every berm decision uses.
    let rx = t[2], ry = 0, rz = -t[0];
    const rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl; ry /= rl; rz /= rl;
    const camber = stage.camber ? stage.camber[i] : 0;
    // Positive camber banks the surface down to the left, so the right-hand
    // lateral axis tilts up by the same angle.
    const ca = Math.cos(camber), sa = Math.sin(camber);
    // Up is tangent x right, not right x tangent: the other order is -up, which
    // turned the whole section upside down (ruts standing proud of the crown,
    // ditches as banks, camber backwards) and pointed every road normal at the
    // ground.
    const ux = t[1] * rz - t[2] * ry;
    const uy = t[2] * rx - t[0] * rz;
    const uz = t[0] * ry - t[1] * rx;
    const ul = Math.hypot(ux, uy, uz) || 1;
    const upx = ux / ul, upy = uy / ul, upz = uz / ul;
    const tiltRx = rx * ca + upx * sa;
    const tiltRy = ry * ca + upy * sa;
    const tiltRz = rz * ca + upz * sa;
    const tiltUx = upx * ca - rx * sa;
    const tiltUy = upy * ca - ry * sa;
    const tiltUz = upz * ca - rz * sa;

    const sid = surfaceIdAt(i);
    const props = surfaceProps(sid);
    const loose = props.looseDepth;
    const isTarmac = sid === SURFACE.TARMAC;
    const isWater = sid === SURFACE.WATER;
    const crown = clamp((isTarmac ? 0.075 : 0.05) * (hw / 4), 0.018, 0.095);
    const rutDepth = (isTarmac ? 0.012 : 0.030 + 0.035 * loose) * (0.7 + 0.6 * hash2(i, 3, 17));
    const bermK = saturate((kSmooth[i] - 0.004) / 0.030) * loose;
    const bermH = bermK * 0.26;
    const cutH = bermK * 0.055;
    const outerSign = kSignedSmooth[i] > 0 ? 1 : -1;
    const wet = isWater ? 1 : 0;

    const base = b.n;
    const rowIdx = [];
    for (let k = 0; k < ROAD_SLOTS.length; k += 1) {
      const slot = ROAD_SLOTS[k];
      const lat = slot.f * hw + slot.off;
      const u = slot.f;
      let h;
      let col;
      let detail = [0, 0, wet];
      const bump = (hash2(i * 7 + k, k * 13, 91) - 0.5) * 0.012 * (1 + props.roughness);
      const side = u > 0 ? 1 : u < 0 ? -1 : 0;
      const onOuter = side === outerSign;
      switch (slot.kind) {
        case "verge": h = null; col = vergeColour(stage, i, props); detail = [0, 0, 0]; break;
        case "ditch": h = -crown - 0.34 - 0.10 * loose; col = mixCol(props.albedo, GRASS_COL, 0.72); detail = [0, 0.2, wet * 0.5]; break;
        case "shoulder": h = -crown * u * u - 0.085 - 0.05 * loose; col = mixCol(props.albedo, GRASS_COL, 0.30); detail = [0, 0.6, wet * 0.7]; break;
        case "edge":
          h = -crown + (onOuter ? bermH * 0.55 : -cutH);
          col = mixCol(props.albedo, props.dustColour, onOuter ? 0.52 : 0.30);
          detail = [0.1, onOuter ? 0.9 : 0.5, wet];
          break;
        case "loose":
          h = -crown * u * u + 0.030 * loose + (onOuter ? bermH : -cutH * 0.6);
          col = mixCol(props.albedo, props.dustColour, onOuter ? 0.40 : 0.18);
          detail = [0.15, onOuter ? 0.8 : 0.35, wet];
          break;
        case "rutLip": h = -crown * u * u - rutDepth * 0.35; col = scaleCol(props.albedo, 0.92); detail = [0.55, 0.25, wet]; break;
        case "rut": h = -crown * u * u - rutDepth; col = scaleCol(props.albedo, isTarmac ? 0.86 : 0.80); detail = [1, 0.08, wet]; break;
        default: h = -crown * u * u; col = scaleCol(props.albedo, 0.98); detail = [0.2, 0.35, wet]; break;
      }
      let px = cx + tiltRx * lat;
      let py = cy + tiltRy * lat;
      let pz = cz + tiltRz * lat;
      if (h === null) {
        const terrain = world.heightAt(px, pz);
        const y = Number.isFinite(terrain) ? clamp(terrain, cy - 6, cy + 6) : cy - 0.6;
        py = Math.min(y, cy - 0.30);
      } else {
        py += tiltUy * (h + bump);
        px += tiltUx * (h + bump);
        pz += tiltUz * (h + bump);
      }
      const idx = vert(b, px, py, pz, lat * uvScale, s * uvScale,
        saturate(col[0]), saturate(col[1]), saturate(col[2]));
      b.extra.detail.data.push(detail[0], detail[1], detail[2]);
      b.nor.push(tiltUx, tiltUy, tiltUz);
      rowIdx.push(idx);
    }
    if (prevRow) {
      // The span carries the surface it starts on, so a change lands exactly on
      // the station stage.js asked for rather than a span early.
      const spanSid = surfaceIdAt(prevSample);
      if (spanSid !== groupSid) {
        closeGroup();
        groupSid = spanSid;
        groupStart = b.idx.length;
      }
      // Slots run left to right and stations run forward, so this order is the
      // one whose face normal comes out along +up rather than into the ground.
      for (let k = 0; k + 1 < ROAD_SLOTS.length; k += 1) {
        quad(b, prevRow[k + 1], prevRow[k], rowIdx[k], rowIdx[k + 1]);
      }
    }
    prevRow = rowIdx;
    prevSample = i;
    const info = {
      s, sampleIndex: i, halfWidth: hw, chunk: builderChunk, vertexBase: base,
      centre: [cx, cy, cz],
      right: [tiltRx, tiltRy, tiltRz],
      up: [tiltUx, tiltUy, tiltUz],
      surfaceId: sid,
      berm: bermH, rut: rutDepth, crown,
    };
    chunkStations.push(info);
    if (!isSeamCopy) stationInfo.push(info);
  }

  // One material per running surface the stage actually uses. Nothing here
  // writes to a texture set: it is handed to every other caller holding the same
  // key, and its wrapping and filtering are settled where it is built.
  const textureSize = opts.textureSize ?? 256;
  const texSeed = stage.seed ?? 0;
  const materials = [];
  const materialSlot = new Map();
  const surfaceMaterials = new Map();
  const override = opts.material || null;
  const slotFor = (sid) => {
    if (override) return 0;
    const hit = materialSlot.get(sid);
    if (hit !== undefined) return hit;
    const props = surfaceProps(sid);
    const tex = surfaceTexture(THREE, roadTextureName(sid), { size: textureSize, seed: texSeed });
    // Gloss is the other half of "this is not gravel": a ford has to reflect the
    // sky and asphalt has to sheen, so the surface's own specular sets the floor
    // the roughness map varies around.
    const m = neutraliseAlbedo(new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: tex.map,
      normalMap: tex.normalMap,
      roughnessMap: tex.roughnessMap,
      roughness: clamp(1 - props.specular * 0.8, 0.18, 1),
      metalness: 0,
      // The ribbon and the terrain share the corridor exactly, so the road is
      // biased toward the camera rather than lifted off the ground.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }), tex);
    m.name = `road-${props.name.toLowerCase()}`;
    const slot = materials.length;
    materials.push(m);
    materialSlot.set(sid, slot);
    surfaceMaterials.set(sid, m);
    return slot;
  };
  if (override) materials.push(override);
  else if (!chunks.length) slotFor(SURFACE.GRAVEL);

  const group = new THREE.Group();
  group.name = "road";
  let triangles = 0;
  for (const c of chunks) {
    for (const g of c.groups) c.geometry.addGroup(g.start, g.count, slotFor(g.surfaceId));
    triangles += triangleCount(c.geometry);
  }
  // The slot indices above are only meaningful once every chunk has been walked,
  // so the meshes are made in a second pass against the finished material list.
  const meshMaterial = materials.length === 1 ? materials[0] : materials;
  for (const c of chunks) {
    const mesh = new THREE.Mesh(c.geometry, meshMaterial);
    mesh.name = `road-chunk-${c.index}`;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData.stations = c.stations;
    c.mesh = mesh;
    group.add(mesh);
  }

  const road = {
    group,
    chunks,
    material: materials[0],
    materials,
    surfaceMaterials,
    stations: stationInfo,
    slots: ROAD_SECTION,
    slotCount: ROAD_SLOTS.length,
    triangles,
    chunkLength,
    dispose() { disposeRoad(road); },
  };
  return road;
}

const GRASS_COL = [0.16, 0.23, 0.10];

function mixCol(a, b2, t) {
  return [a[0] + (b2[0] - a[0]) * t, a[1] + (b2[1] - a[1]) * t, a[2] + (b2[2] - a[2]) * t];
}

function scaleCol(a, k) {
  return [a[0] * k, a[1] * k, a[2] * k];
}

function vergeColour(stage, i, props) {
  const snowy = Array.isArray(stage.surfaceMix) && stage.surfaceMix.includes(SURFACE.SNOW);
  const base = snowy ? [0.74, 0.78, 0.84] : GRASS_COL;
  const n = hash2(i, 5, 31) * 0.2 - 0.1;
  return [saturate(base[0] + n), saturate(base[1] + n), saturate(base[2] + n * 0.5)]
    .map((v, k) => saturate(v * 0.85 + props.albedo[k] * 0.15));
}

export function disposeRoad(road) {
  if (!road) return;
  for (const c of road.chunks) {
    c.geometry.dispose();
    if (c.mesh && c.mesh.parent) c.mesh.parent.remove(c.mesh);
  }
  for (const m of road.materials) m.dispose?.();
  road.chunks.length = 0;
}

// ---- terrain -------------------------------------------------------------

const TERRAIN_PALETTE = Object.freeze({
  rock: [0.250, 0.242, 0.228],
  grass: [0.150, 0.215, 0.095],
  scree: [0.430, 0.415, 0.395],
  snow: [0.820, 0.860, 0.920],
  dirt: [0.250, 0.195, 0.135],
});

// The whole seam question comes down to one rule: every chunk, at every LOD,
// reads its height and its normal from the SAME lattice function. A coarse chunk
// simply visits fewer lattice points, so where two chunks meet the shared points
// are bit-for-bit identical and there is nothing for a crack to open along.
function latticeField(world, L0, originX, originZ) {
  const heights = new Map();
  const key = (i, j) => (i + 1048576) * 4194304 + (j + 1048576);
  const h = (i, j) => {
    const k = key(i, j);
    const hit = heights.get(k);
    if (hit !== undefined) return hit;
    const y = world.heightAt(originX + i * L0, originZ + j * L0);
    const v = Number.isFinite(y) ? y : 0;
    heights.set(k, v);
    return v;
  };
  const normal = (i, j, out) => {
    const dx = (h(i + 1, j) - h(i - 1, j)) / (2 * L0);
    const dz = (h(i, j + 1) - h(i, j - 1)) / (2 * L0);
    const l = Math.hypot(-dx, 1, -dz);
    out[0] = -dx / l; out[1] = 1 / l; out[2] = -dz / l;
    return out;
  };
  return { h, normal, size: heights };
}

export function buildTerrainMesh(THREE, stage, opts = {}) {
  const world = worldOf(stage);
  const bounds = stage.bounds || { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
  const margin = opts.margin ?? 220;
  const minX = bounds.minX - margin, maxX = bounds.maxX + margin;
  const minZ = bounds.minZ - margin, maxZ = bounds.maxZ + margin;
  const spanX = Math.max(64, maxX - minX);
  const spanZ = Math.max(64, maxZ - minZ);
  const budget = opts.triangleBudget ?? TRIANGLE_BUDGET.terrain;
  const index = opts.centreline || centrelineIndex(stage);

  const lodRanges = opts.lodRanges || [95, 280, 720];
  const candidates = opts.baseSteps || [4, 6, 8, 12, 16, 24, 32];

  // Pick the finest lattice that still fits the budget; a 6 km stage on a phone
  // gets a coarser world rather than a dropped frame.
  let L0 = candidates[candidates.length - 1];
  let plan = null;
  for (const cand of candidates) {
    const p = planChunks(cand);
    if (p.triangles <= budget) { L0 = cand; plan = p; break; }
    plan = p;
    L0 = cand;
  }
  if (!plan) plan = planChunks(L0);

  function planChunks(step) {
    const chunkSize = step * 32;
    const originX = Math.floor(minX / step) * step;
    const originZ = Math.floor(minZ / step) * step;
    const nx = Math.ceil(spanX / chunkSize) + 1;
    const nz = Math.ceil(spanZ / chunkSize) + 1;
    const list = [];
    for (let cz = 0; cz < nz; cz += 1) {
      for (let cx = 0; cx < nx; cx += 1) {
        const x0 = originX + cx * chunkSize;
        const z0 = originZ + cz * chunkSize;
        const mid = index.nearest(x0 + chunkSize * 0.5, z0 + chunkSize * 0.5);
        const d = mid.dist;
        let lod = 3;
        if (d < lodRanges[0]) lod = 0;
        else if (d < lodRanges[1]) lod = 1;
        else if (d < lodRanges[2]) lod = 2;
        list.push({ cx, cz, x0, z0, lod, stride: 1, cells: 32, chunkSize });
      }
    }
    // Two LOD steps between neighbours puts a T-junction tens of metres deep at
    // the boundary, which the skirt then has to hide as a dark wall. One step
    // bounds the gap to a single lattice cell, so the skirt is a backstop rather
    // than the thing holding the world together.
    const at = (cx, cz) => (cx < 0 || cz < 0 || cx >= nx || cz >= nz ? null : list[cz * nx + cx]);
    for (let pass = 0; pass < 4; pass += 1) {
      let changed = false;
      for (const c of list) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nb = at(c.cx + dx, c.cz + dz);
          if (nb && nb.lod > c.lod + 1) { nb.lod = c.lod + 1; changed = true; }
        }
      }
      if (!changed) break;
    }
    let triangles = 0;
    for (const c of list) {
      c.stride = 1 << c.lod;
      c.cells = 32 >> c.lod;
      triangles += c.cells * c.cells * 2 + c.cells * 4 * 2;
    }
    return { step, chunkSize, originX, originZ, nx, nz, list, triangles };
  }

  const { chunkSize, originX, originZ } = plan;
  const field = latticeField(world, L0, originX, originZ);
  const snowy = Array.isArray(stage.surfaceMix) && stage.surfaceMix.includes(SURFACE.SNOW);

  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < stage.count; i += 1) {
    if (stage.y[i] < minY) minY = stage.y[i];
    if (stage.y[i] > maxY) maxY = stage.y[i];
  }
  if (!Number.isFinite(minY)) { minY = 0; maxY = 1; }
  const altSpan = Math.max(60, (maxY - minY) * 2.4);

  const nrm = [0, 0, 0];
  const chunks = [];
  let triangles = 0;

  for (const c of plan.list) {
    const b = mkBuilder();
    b.extra = { splat: { data: [], size: 4 } };
    const i0 = Math.round((c.x0 - originX) / L0);
    const j0 = Math.round((c.z0 - originZ) / L0);
    const cells = c.cells;
    const stride = c.stride;
    const grid = [];
    for (let jz = 0; jz <= cells; jz += 1) {
      const row = [];
      for (let ix = 0; ix <= cells; ix += 1) {
        const li = i0 + ix * stride;
        const lj = j0 + jz * stride;
        const x = originX + li * L0;
        const z = originZ + lj * L0;
        const y = field.h(li, lj);
        field.normal(li, lj, nrm);
        const near = index.nearest(x, z);
        const roadDist = near.dist;
        const slope = 1 - nrm[1];
        const alt = saturate((y - minY) / altSpan);
        const rockW = smoothstep(0.16, 0.46, slope);
        const highW = smoothstep(0.62, 0.95, alt) * (1 - rockW * 0.4);
        const dirtW = smoothstep(26, 8, roadDist) * (1 - rockW * 0.6);
        const grassW = Math.max(0.02, 1 - rockW - highW - dirtW);
        const sum = rockW + highW + dirtW + grassW;
        const wr = rockW / sum, wh = highW / sum, wd = dirtW / sum, wg = grassW / sum;
        const high = snowy || alt > 0.8 ? TERRAIN_PALETTE.snow : TERRAIN_PALETTE.scree;
        const jitter = (hash2(li, lj, 7717) - 0.5) * 0.14;
        const col = [0, 0, 0];
        for (let k = 0; k < 3; k += 1) {
          col[k] = saturate(
            TERRAIN_PALETTE.rock[k] * wr + high[k] * wh
            + TERRAIN_PALETTE.dirt[k] * wd + TERRAIN_PALETTE.grass[k] * wg
            + jitter * 0.25);
        }
        const id = vert(b, x, y, z, x * 0.06, z * 0.06, col[0], col[1], col[2]);
        b.nor.push(nrm[0], nrm[1], nrm[2]);
        b.extra.splat.data.push(wr, wg, wh, wd);
        row.push(id);
      }
      grid.push(row);
    }
    for (let jz = 0; jz < cells; jz += 1) {
      for (let ix = 0; ix < cells; ix += 1) {
        const a = grid[jz][ix], d = grid[jz][ix + 1];
        const e = grid[jz + 1][ix + 1], f = grid[jz + 1][ix];
        // Alternating diagonal keeps a ridge from stair-stepping along one axis.
        if ((ix + jz) & 1) { tri(b, a, f, e); tri(b, a, e, d); }
        else { tri(b, a, f, d); tri(b, f, e, d); }
      }
    }
    const surfaceVertexCount = b.n;

    // Skirt: a finer neighbour puts vertices where this chunk has only a chord,
    // and on steep ground that T-junction is metres deep. A fixed drop scaled to
    // the lattice does not know that, so each skirt vertex is dropped below the
    // deepest thing the finest possible lattice holds within a cell either side
    // of it. Both ends of a span see the whole span, so the interpolated bottom
    // edge is under every vertex a neighbour can introduce along it.
    const skirtClear = L0 * 1.4 + 1.2;
    const rim = [];
    const push = (id, li, lj, both) => rim.push({ id, li, lj, both });
    for (let ix = 0; ix <= cells; ix += 1) push(grid[0][ix], i0 + ix * stride, j0, ix === 0 || ix === cells);
    for (let jz = 1; jz <= cells; jz += 1) push(grid[jz][cells], i0 + cells * stride, j0 + jz * stride, jz === cells);
    for (let ix = cells - 1; ix >= 0; ix -= 1) push(grid[cells][ix], i0 + ix * stride, j0 + cells * stride, ix === 0);
    for (let jz = cells - 1; jz >= 1; jz -= 1) push(grid[jz][0], i0, j0 + jz * stride, false);
    const deepestNear = (li, lj, alongI, both) => {
      let m = Infinity;
      for (let d = -stride; d <= stride; d += 1) {
        if (alongI || both) { const v = field.h(li + d, lj); if (v < m) m = v; }
        if (!alongI || both) { const v = field.h(li, lj + d); if (v < m) m = v; }
      }
      return m;
    };
    const skirt = [];
    for (let k = 0; k < rim.length; k += 1) {
      const { id, li, lj, both } = rim[k];
      const px = b.pos[id * 3], pz = b.pos[id * 3 + 2];
      // The first and third runs of the rim vary in i, the second and fourth in j.
      const alongI = k <= cells || (k > cells * 2 && k <= cells * 3);
      const floor = deepestNear(li, lj, alongI, both);
      const sid = vert(b, px, floor - skirtClear, pz, px * 0.06, pz * 0.06,
        b.col[id * 3] * 0.7, b.col[id * 3 + 1] * 0.7, b.col[id * 3 + 2] * 0.7);
      b.nor.push(b.nor[id * 3], b.nor[id * 3 + 1], b.nor[id * 3 + 2]);
      b.extra.splat.data.push(1, 0, 0, 0);
      skirt.push(sid);
    }
    for (let k = 0; k + 1 < rim.length; k += 1) {
      quad(b, rim[k + 1].id, rim[k].id, skirt[k], skirt[k + 1]);
    }
    quad(b, rim[0].id, rim[rim.length - 1].id, skirt[skirt.length - 1], skirt[0]);

    const geometry = finish(THREE, b, { explicitNormals: true });
    triangles += triangleCount(geometry);
    chunks.push({
      cx: c.cx, cz: c.cz, x0: c.x0, z0: c.z0, size: chunkSize, lod: c.lod,
      stride, cells, latticeI0: i0, latticeJ0: j0, latticeStep: L0,
      surfaceVertexCount, geometry, mesh: null,
    });
  }

  const tex = surfaceTexture(THREE, "grass", { size: opts.textureSize ?? 256, seed: (stage.seed ?? 0) + 3 });
  const material = opts.material || neutraliseAlbedo(new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: tex.map,
    normalMap: tex.normalMap,
    roughnessMap: tex.roughnessMap,
    roughness: 1,
    metalness: 0,
  }), tex);

  const group = new THREE.Group();
  group.name = "terrain";
  for (const c of chunks) {
    const mesh = new THREE.Mesh(c.geometry, material);
    mesh.name = `terrain-${c.cx}-${c.cz}-lod${c.lod}`;
    mesh.receiveShadow = true;
    c.mesh = mesh;
    group.add(mesh);
  }

  const terrain = {
    group, chunks, material, triangles,
    latticeStep: L0, chunkSize, originX, originZ,
    heightAt: (x, z) => world.heightAt(x, z),
    dispose() { disposeTerrain(terrain); },
  };
  return terrain;
}

export function disposeTerrain(terrain) {
  if (!terrain) return;
  for (const c of terrain.chunks) {
    c.geometry.dispose();
    if (c.mesh && c.mesh.parent) c.mesh.parent.remove(c.mesh);
  }
  terrain.material.dispose?.();
  terrain.chunks.length = 0;
}

// ---- car -----------------------------------------------------------------

// Panel ids match damage.js's visual.panels keys, in that order, because
// applyCarDamage() indexes the dent uniform array with them directly.
export const CAR_PANELS = Object.freeze(["front", "rear", "left", "right", "roof", "bonnet", "bootlid"]);
export const CAR_DETACHABLE = Object.freeze([
  "bumperFront", "bumperRear", "bonnet", "doorLeft", "doorRight",
  "mirrorLeft", "mirrorRight", "spare", "exhaustTail", "wingRear",
]);

// physics.js places a hub at (±track/2, wheelRadius - comHeight, ±axle); this is
// the same arithmetic, exported so render.js and the tests agree with it.
export function carHubPositions(spec) {
  const front = spec.wheelbase * (1 - spec.weightDistFront);
  const rear = -spec.wheelbase * spec.weightDistFront;
  const y = spec.wheelRadius - spec.comHeight;
  const tf = spec.trackFront * 0.5, tr = spec.trackRear * 0.5;
  return [
    { x: -tf, y, z: front }, { x: tf, y, z: front },
    { x: -tr, y, z: rear }, { x: tr, y, z: rear },
  ];
}

export function carDimensions(spec) {
  const cls = spec.class || "works4wd";
  const wb = spec.wheelbase;
  const track = Math.max(spec.trackFront, spec.trackRear);
  const g = -spec.comHeight;                       // ground plane in car-local Y
  const frontAxle = wb * (1 - spec.weightDistFront);
  const rearAxle = -wb * spec.weightDistFront;
  const frontOverhang = cls === "heritage" ? 0.68 : 0.80;
  const rearOverhang = cls === "heritage" ? 0.72 : 0.84;
  // Flares are what the class regulations actually buy you; the widest current
  // cars land just under 1.88 m across the body, so the numbers stay there.
  const flare = cls === "topclass" ? 0.096 : cls === "works4wd" ? 0.090 : 0.072;
  const halfWidth = track * 0.5 + flare;
  const mirrorOut = 0.105;
  const roofY = g + (cls === "heritage" ? 1.325 : cls === "topclass" ? 1.395 : 1.365);
  const scoopTop = roofY + 0.085;
  const flapBottom = g + 0.045;
  const wingSpan = cls === "topclass" ? 1.52 : cls === "works4wd" ? 1.30 : cls === "heritage" ? 0.86 : 0.98;
  return Object.freeze({
    class: cls,
    ground: g,
    frontAxle, rearAxle,
    frontOverhang, rearOverhang,
    hubY: spec.wheelRadius - spec.comHeight,
    archRadius: spec.wheelRadius + 0.125,
    noseZ: frontAxle + frontOverhang,
    tailZ: rearAxle - rearOverhang,
    halfWidth,
    bodyHalfWidth: track * 0.5 - 0.085,
    flare, mirrorOut,
    beltY: g + 0.895,
    sillY: g + 0.155,
    floorY: g + 0.135,
    roofY,
    scoopTop,
    flapBottom,
    wingSpan,
    length: frontOverhang + wb + rearOverhang,
    width: 2 * (halfWidth + mirrorOut),
    height: scoopTop - flapBottom,
    bbox: Object.freeze({
      minX: -(halfWidth + mirrorOut), maxX: halfWidth + mirrorOut,
      minY: flapBottom, maxY: scoopTop,
      minZ: rearAxle - rearOverhang, maxZ: frontAxle + frontOverhang,
    }),
  });
}

function panelOf(x, y, z, d) {
  if (y > d.roofY - 0.14) return 4;
  if (z > d.frontAxle + 0.12) return 5;                 // bonnet region
  if (z > d.frontAxle - 0.10) return 0;                 // front
  if (z < d.rearAxle - 0.10) return 1;                  // rear
  if (z < d.rearAxle + 0.20) return 6;                  // bootlid
  return x < 0 ? 2 : 3;
}

// Per-vertex dent weight, jittered so a dent creases rather than inflates.
function fillPanelChannel(b, d, forcePanel) {
  const panel = [], weight = [];
  for (let i = 0; i < b.n; i += 1) {
    const x = b.pos[i * 3], y = b.pos[i * 3 + 1], z = b.pos[i * 3 + 2];
    panel.push(forcePanel === undefined ? panelOf(x, y, z, d) : forcePanel);
    const j = hash3(Math.round(x * 40), Math.round(y * 40), Math.round(z * 40), 5501);
    weight.push(0.55 + 0.45 * j);
  }
  b.extra = b.extra || {};
  b.extra.panel = { data: panel, size: 1 };
  b.extra.dentW = { data: weight, size: 1 };
}

const DAMAGE_VERTEX_HEAD = `
attribute float panel;
attribute float dentW;
uniform float uDent[7];
varying vec2 vOpusUv;
`;

const DAMAGE_VERTEX_BODY = `
{
  int pi = int(panel + 0.5);
  float dent = 0.0;
  for (int k = 0; k < 7; k += 1) { if (k == pi) dent = uDent[k]; }
  transformed -= normal * (dent * dentW * 0.16);
  // Our own varying, not three's vMapUv: that one is only declared when the
  // material happens to carry a colour map, so borrowing it fails to compile
  // the whole shader on any livery without one.
  vOpusUv = uv;
}
`;

// Mud is a runtime dial, not a rebuild: the splatter mask is baked once and its
// strength rides a uniform, so a stage-long build-up costs nothing per frame.
function injectDamageShader(material, mudMap) {
  material.userData.dent = new Float32Array(7);
  material.userData.mud = { value: 0 };
  material.userData.mudMap = mudMap || null;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDent = { value: material.userData.dent };
    shader.uniforms.uMud = material.userData.mud;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>${DAMAGE_VERTEX_HEAD}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>${DAMAGE_VERTEX_BODY}`);
    if (mudMap) {
      shader.uniforms.uMudMap = { value: mudMap };
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>
uniform sampler2D uMudMap;
uniform float uMud;
varying vec2 vOpusUv;`)
        .replace("#include <map_fragment>",
          "#include <map_fragment>\nfloat mudA = texture2D(uMudMap, vOpusUv).r * uMud;\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.15,0.115,0.075), mudA);")
        .replace("#include <roughnessmap_fragment>",
          "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.94, texture2D(uMudMap, vOpusUv).r * uMud);");
    } else {
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>
uniform float uMud;
varying vec2 vOpusUv;`);
    }
  };
  material.customProgramCacheKey = () => (mudMap ? "opusrally-damage-mud" : "opusrally-damage");
  return material;
}

// Called once a frame, so neither branch may allocate: the single-material case
// writes straight through rather than wrapping the material in an array.
export function setMudLevel(target, value) {
  const v = value < 0 ? 0 : value > 1 ? 1 : value;
  if (!target) return;
  const mats = target.paintMaterials;
  if (mats) {
    for (let i = 0; i < mats.length; i += 1) {
      const m = mats[i];
      if (m && m.userData && m.userData.mud) m.userData.mud.value = v;
    }
  } else if (target.userData && target.userData.mud) {
    target.userData.mud.value = v;
  }
  if (target.state) target.state.mud = v;
}

// Allocation-free: every write below is a number into a preallocated array or a
// boolean onto an existing object. Called once a frame from render.js.
export function applyCarDamage(car, visual) {
  if (!car || !visual) return;
  const p = visual.panels;
  if (p) {
    const dents = car.dent;
    dents[0] = p.front || 0;
    dents[1] = p.rear || 0;
    dents[2] = p.left || 0;
    dents[3] = p.right || 0;
    dents[4] = p.roof || 0;
    dents[5] = p.bonnet || 0;
    dents[6] = p.bootlid || 0;
    for (let i = 0; i < car.paintMaterials.length; i += 1) {
      const d = car.paintMaterials[i].userData.dent;
      for (let k = 0; k < 7; k += 1) d[k] = dents[k];
    }
  }
  const det = visual.detached;
  if (det) {
    for (let i = 0; i < CAR_DETACHABLE.length; i += 1) {
      const key = CAR_DETACHABLE[i];
      const part = car.parts[key];
      if (part) part.visible = !det[key];
    }
  }
  const glass = visual.glass;
  if (glass && car.parts.windscreen) {
    const m = car.parts.windscreen.material;
    car.parts.windscreen.visible = !glass.windscreenShattered;
    m.opacity = glass.windscreenCracked ? 0.62 : 0.34;
    m.roughness = glass.windscreenCracked ? 0.45 : 0.06;
  }
  const lights = visual.lights;
  if (lights && car.lamps) {
    for (let i = 0; i < car.lamps.length; i += 1) {
      const out = i < 2 ? lights.leftOut : lights.rightOut;
      car.lamps[i].visible = !out;
    }
  }
}

function lerpParams(a, b2, t) {
  const out = {};
  for (const k of Object.keys(a)) out[k] = a[k] + (b2[k] - a[k]) * t;
  return out;
}

// A body section: 14 slots round a closed loop, from the floor centre out to the
// sill, up the flank to the belt line and across the deck. Lofting these is what
// keeps the silhouette curved — hand-placed boxes read as boxes.
function bodyRing(par) {
  const w = par.w, wt = par.wt, yb = par.yb, ybe = par.ybe;
  const right = [
    [0, yb, par.z],
    [w * 0.55, yb + 0.004, par.z],
    [w * 0.93, yb + 0.055, par.z],
    [w, yb + 0.30, par.z],
    [w * 0.985, ybe - 0.20, par.z],
    [wt, ybe, par.z],
    [wt * 0.62, ybe + 0.042, par.z],
    [0, ybe + 0.058, par.z],
  ];
  const ring = right.slice();
  for (let i = right.length - 2; i >= 1; i -= 1) {
    ring.push([-right[i][0], right[i][1], right[i][2]]);
  }
  return ring;
}

function buildBodyShell(b, d, col) {
  const hw = d.bodyHalfWidth;
  const g = d.ground;
  const key = [
    { z: d.tailZ, w: hw * 0.80, wt: hw * 0.72, yb: g + 0.34, ybe: d.beltY + 0.005 },
    { z: d.tailZ + 0.16, w: hw * 0.94, wt: hw * 0.87, yb: g + 0.25, ybe: d.beltY + 0.030 },
    { z: d.rearAxle - 0.44, w: hw * 0.99, wt: hw * 0.905, yb: d.sillY + 0.015, ybe: d.beltY + 0.050 },
    { z: d.rearAxle, w: hw * 1.0, wt: hw * 0.905, yb: d.sillY, ybe: d.beltY + 0.050 },
    { z: d.rearAxle + 0.44, w: hw * 0.975, wt: hw * 0.905, yb: d.sillY - 0.005, ybe: d.beltY + 0.040 },
    { z: (d.rearAxle + d.frontAxle) * 0.5, w: hw * 0.945, wt: hw * 0.915, yb: d.sillY - 0.010, ybe: d.beltY + 0.005 },
    { z: d.frontAxle - 0.44, w: hw * 0.98, wt: hw * 0.905, yb: d.sillY, ybe: d.beltY - 0.015 },
    { z: d.frontAxle, w: hw * 1.0, wt: hw * 0.90, yb: d.sillY + 0.010, ybe: d.beltY - 0.030 },
    { z: d.frontAxle + 0.42, w: hw * 0.96, wt: hw * 0.865, yb: g + 0.205, ybe: d.beltY - 0.060 },
    { z: d.noseZ - 0.20, w: hw * 0.885, wt: hw * 0.785, yb: g + 0.265, ybe: d.beltY - 0.105 },
    { z: d.noseZ, w: hw * 0.745, wt: hw * 0.645, yb: g + 0.345, ybe: d.beltY - 0.145 },
  ];
  const rings = [];
  for (let i = 0; i + 1 < key.length; i += 1) {
    const a = key[i], c = key[i + 1];
    const sub = 2;
    for (let k = 0; k < sub; k += 1) {
      const t = smootherstep(0, 1, k / sub);
      rings.push(bodyRing(lerpParams(a, c, t)));
    }
  }
  rings.push(bodyRing(key[key.length - 1]));
  pushLoft(b, rings, col, true, true);
}

function buildArchFlare(b, d, hubZ, col) {
  const inner = d.bodyHalfWidth;
  const outer = d.halfWidth;
  const r = d.archRadius;
  const rY = r * 0.82;
  // Stop the arc where the sill starts, or the flare dips through the floor.
  const endCos = clamp((d.sillY - d.hubY) / rY, -0.999, 0.999);
  const half = Math.acos(endCos);
  for (const side of [-1, 1]) {
    const rails = [[], []];
    for (let k = 0; k <= 12; k += 1) {
      const a = -half + (k / 12) * half * 2;
      const z = hubZ + Math.sin(a) * r;
      const y = d.hubY + Math.cos(a) * rY;
      rails[0].push([side * inner, y, z]);
      rails[1].push([side * outer, y - 0.030, z]);
    }
    for (let k = 0; k + 1 < rails[0].length; k += 1) {
      const p0 = rails[0][k], p1 = rails[0][k + 1], p2 = rails[1][k + 1], p3 = rails[1][k];
      if (side > 0) pushQuad3(b, p0, p1, p2, p3, col);
      else pushQuad3(b, p3, p2, p1, p0, col);
    }
  }
}

function cabinFrame(d) {
  const zWs = d.frontAxle - 0.30;
  const zRoofF = zWs - 0.80;
  const zRoofR = d.rearAxle + 0.32;
  const zRs = zRoofR - 0.52;
  return {
    zWs, zRoofF, zRoofR, zRs,
    beltW: d.bodyHalfWidth * 0.955,
    roofW: d.bodyHalfWidth * 0.735,
    beltY: d.beltY + 0.05,
    roofY: d.roofY,
  };
}

function buildRoofPanel(b, d, col) {
  const c = cabinFrame(d);
  const nz = 4, nx = 4;
  const grid = [];
  for (let j = 0; j <= nz; j += 1) {
    const t = j / nz;
    const z = lerp(c.zRoofF, c.zRoofR, t);
    const row = [];
    for (let i = 0; i <= nx; i += 1) {
      const u = (i / nx) * 2 - 1;
      const w = c.roofW * (1 - 0.05 * t * t);
      // A crowned roof, plus a touch of taper toward the screen.
      const y = c.roofY - Math.pow(Math.abs(u), 2.4) * 0.035 - (1 - t) * 0.012;
      row.push([u * w, y, z]);
    }
    grid.push(row);
  }
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      pushQuad3(b, grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i], col);
    }
  }
  // Rain rails down each side: the line that reads as a car roof, not a lid.
  for (const side of [-1, 1]) {
    for (let j = 0; j < nz; j += 1) {
      const a = grid[j][side < 0 ? 0 : nx], bb = grid[j + 1][side < 0 ? 0 : nx];
      pushQuad3(b, a, bb,
        [bb[0] + side * 0.022, bb[1] - 0.035, bb[2]],
        [a[0] + side * 0.022, a[1] - 0.035, a[2]], col);
    }
  }
  return c;
}

function buildPillars(b, d, col) {
  const c = cabinFrame(d);
  const r = 0.042;
  for (const side of [-1, 1]) {
    pushTube(b, [
      [side * c.beltW, c.beltY, c.zWs],
      [side * (c.beltW * 0.94), c.beltY + 0.20, c.zWs - 0.26],
      [side * c.roofW, c.roofY - 0.02, c.zRoofF + 0.02],
    ], r, 4, col);
    pushTube(b, [
      [side * c.beltW, c.beltY, (c.zWs + c.zRs) * 0.48],
      [side * (c.beltW * 0.96), c.beltY + 0.22, (c.zWs + c.zRs) * 0.48],
      [side * c.roofW, c.roofY - 0.02, (c.zRoofF + c.zRoofR) * 0.5],
    ], r * 0.85, 4, col);
    pushTube(b, [
      [side * c.beltW, c.beltY, c.zRs],
      [side * (c.beltW * 0.95), c.beltY + 0.20, c.zRs + 0.22],
      [side * c.roofW, c.roofY - 0.02, c.zRoofR - 0.02],
    ], r, 4, col);
    pushTube(b, [
      [side * c.roofW, c.roofY - 0.025, c.zRoofF],
      [side * c.roofW, c.roofY - 0.025, c.zRoofR],
    ], r * 0.6, 4, col);
  }
  return c;
}

function buildGlass(b, d) {
  const c = cabinFrame(d);
  const col = [0.05, 0.07, 0.09];
  const q = (p0, p1, p2, p3) => pushQuad3(b, p0, p1, p2, p3, col);
  // Windscreen, both faces so it is visible from inside the cockpit camera.
  const wsB = [[-c.beltW * 0.93, c.beltY, c.zWs], [c.beltW * 0.93, c.beltY, c.zWs]];
  const wsT = [[-c.roofW * 0.97, c.roofY - 0.03, c.zRoofF + 0.02], [c.roofW * 0.97, c.roofY - 0.03, c.zRoofF + 0.02]];
  q(wsB[0], wsB[1], wsT[1], wsT[0]);
  q(wsT[0], wsT[1], wsB[1], wsB[0]);
  const rsB = [[-c.beltW * 0.90, c.beltY, c.zRs], [c.beltW * 0.90, c.beltY, c.zRs]];
  const rsT = [[-c.roofW * 0.95, c.roofY - 0.03, c.zRoofR - 0.02], [c.roofW * 0.95, c.roofY - 0.03, c.zRoofR - 0.02]];
  q(rsT[0], rsT[1], rsB[1], rsB[0]);
  q(rsB[0], rsB[1], rsT[1], rsT[0]);
  const zMid = (c.zWs + c.zRs) * 0.48;
  for (const side of [-1, 1]) {
    const xB = side * c.beltW * 0.99, xT = side * c.roofW * 1.0;
    const front = [[xB, c.beltY, c.zWs - 0.05], [xB, c.beltY, zMid + 0.03], [xT, c.roofY - 0.05, zMid + 0.03], [xT, c.roofY - 0.05, c.zRoofF + 0.10]];
    const rear = [[xB, c.beltY, zMid - 0.03], [xB, c.beltY, c.zRs + 0.05], [xT, c.roofY - 0.05, c.zRoofR - 0.10], [xT, c.roofY - 0.05, zMid - 0.03]];
    if (side > 0) { q(front[0], front[1], front[2], front[3]); q(rear[0], rear[1], rear[2], rear[3]); }
    else { q(front[3], front[2], front[1], front[0]); q(rear[3], rear[2], rear[1], rear[0]); }
  }
}

function buildBonnet(b, d, col) {
  const c = cabinFrame(d);
  const z0 = c.zWs, z1 = d.noseZ - 0.14;
  const nz = 3, nx = 4;
  const grid = [];
  for (let j = 0; j <= nz; j += 1) {
    const t = j / nz;
    const z = lerp(z0, z1, t);
    const w = lerp(d.bodyHalfWidth * 0.92, d.bodyHalfWidth * 0.70, t);
    const y = lerp(d.beltY + 0.062, d.beltY - 0.125, smoothstep(0, 1, t));
    const row = [];
    for (let i = 0; i <= nx; i += 1) {
      const u = (i / nx) * 2 - 1;
      row.push([u * w, y - Math.pow(Math.abs(u), 3) * 0.030, z]);
    }
    grid.push(row);
  }
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      pushQuad3(b, grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i], col);
    }
  }
  // Two raised louvre vents — the giveaway that this is a competition car.
  const ventCol = [0.05, 0.05, 0.055];
  for (const side of [-1, 1]) {
    const vz = lerp(z0, z1, 0.42);
    const vx = side * d.bodyHalfWidth * 0.44;
    const vy = lerp(d.beltY + 0.062, d.beltY - 0.125, smoothstep(0, 1, 0.42));
    for (let k = 0; k < 3; k += 1) {
      pushTaper(b, vx, vy + 0.012, vz - k * 0.075, 0.28, 0.05, 0.26, 0.035, 0, 0.028, ventCol, -0.012);
    }
  }
  const scoopCol = [0.06, 0.06, 0.065];
  pushTaper(b, 0, lerp(d.beltY + 0.062, d.beltY - 0.125, smoothstep(0, 1, 0.62)) + 0.02,
    lerp(z0, z1, 0.62), 0.44, 0.34, 0.34, 0.24, 0, 0.05, scoopCol, 0.02);
}

function buildRoofScoop(b, d, col) {
  const c = cabinFrame(d);
  const z = c.zRoofF + 0.20;
  pushTaper(b, 0, d.roofY, z, 0.30, 0.42, 0.22, 0.30, 0.005, d.scoopTop - d.roofY, col, -0.03);
  pushQuad3(b,
    [-0.11, d.roofY + 0.012, z + 0.15], [0.11, d.roofY + 0.012, z + 0.15],
    [0.11, d.roofY + 0.080, z + 0.13], [-0.11, d.roofY + 0.080, z + 0.13],
    [0.02, 0.02, 0.022]);
}

function buildBumper(b, d, front, col) {
  const zEnd = front ? d.noseZ : d.tailZ;
  const zIn = front ? d.noseZ - 0.36 : d.tailZ + 0.38;
  const yTop = front ? d.beltY - 0.20 : d.beltY - 0.14;
  const yBot = d.ground + 0.185;
  const w = d.bodyHalfWidth * 0.98;
  const rings = [];
  const steps = 7;
  for (let k = 0; k <= steps; k += 1) {
    const u = (k / steps) * 2 - 1;
    const taper = 1 - 0.30 * u * u;
    const z = lerp(zIn, zEnd, taper);
    rings.push([u * w * (1 - 0.06 * u * u), z]);
  }
  for (let k = 0; k + 1 < rings.length; k += 1) {
    const a = rings[k], c = rings[k + 1];
    pushQuad3(b, [a[0], yBot, a[1]], [c[0], yBot, c[1]], [c[0], yTop, c[1]], [a[0], yTop, a[1]], col);
    // The lower lip: a splitter at the front, a valance at the back.
    const lipZ = front ? -0.10 : 0.10;
    pushQuad3(b, [a[0], yBot, a[1]], [a[0], yBot - 0.055, a[1] + lipZ],
      [c[0], yBot - 0.055, c[1] + lipZ], [c[0], yBot, c[1]], col);
  }
  if (front) {
    const grille = [0.03, 0.03, 0.035];
    pushBox(b, 0, (yTop + yBot) * 0.5, d.noseZ - 0.045, w * 1.02, (yTop - yBot) * 0.55, 0.06, grille);
    for (let k = -2; k <= 2; k += 1) {
      pushBox(b, k * w * 0.30, (yTop + yBot) * 0.5, d.noseZ - 0.03, 0.03, (yTop - yBot) * 0.52, 0.03, col);
    }
  }
}

function buildLightPod(b, d, col) {
  const y = d.beltY - 0.155;
  const z = d.noseZ - 0.02;
  const plate = [0.05, 0.05, 0.055];
  pushBox(b, 0, y, z - 0.03, d.bodyHalfWidth * 1.05, 0.20, 0.05, plate);
  for (const side of [-1, 1]) {
    pushCylinder(b, side * d.bodyHalfWidth * 0.30, y, z - 0.055, 0.078, 0.084, 0.10, 12, "z", col);
    pushCylinder(b, side * d.bodyHalfWidth * 0.66, y, z - 0.055, 0.068, 0.074, 0.10, 12, "z", col);
    pushBox(b, side * d.bodyHalfWidth * 0.48, y - 0.13, z - 0.06, 0.03, 0.16, 0.03, plate);
  }
}

function buildLamps(d) {
  const y = d.beltY - 0.155;
  const z = d.noseZ - 0.014;
  const col = [1, 0.96, 0.86];
  const out = [];
  for (const side of [-1, 1]) {
    out.push([side * d.bodyHalfWidth * 0.30, y, z, 0.070]);
    out.push([side * d.bodyHalfWidth * 0.66, y, z, 0.060]);
  }
  return { positions: out, colour: col };
}

function buildWing(b, d, col) {
  const span = d.wingSpan;
  const chord = d.class === "topclass" ? 0.30 : 0.25;
  const zc = d.tailZ + 0.20;
  const yc = d.class === "topclass" ? d.roofY - 0.06 : d.beltY + 0.28;
  // Cambered aerofoil section swept across the span.
  const profile = [];
  const N = 8;
  for (let k = 0; k < N; k += 1) {
    const t = k / N;
    const a = t * TAU;
    const cz = Math.cos(a) * chord * 0.5;
    const cy = Math.sin(a) * chord * (a < Math.PI ? 0.115 : 0.055) - chord * 0.03;
    profile.push([cz, cy]);
  }
  const rings = [];
  for (const x of [-span * 0.5, -span * 0.25, 0, span * 0.25, span * 0.5]) {
    rings.push(profile.map(([cz, cy]) => [x, yc + cy, zc + cz]));
  }
  pushLoft(b, rings, col, true, true);
  for (const side of [-1, 1]) {
    pushBox(b, side * span * 0.5, yc + 0.02, zc, 0.018, 0.20, chord * 1.12, col);
    pushTube(b, [
      [side * span * 0.30, d.beltY + 0.02, zc + 0.05],
      [side * span * 0.30, yc - 0.05, zc + 0.02],
    ], 0.020, 4, col);
  }
}

function buildDiffuser(b, d, col) {
  const z0 = d.tailZ, z1 = d.rearAxle - 0.18;
  const w = d.bodyHalfWidth * 0.92;
  pushQuad3(b, [-w, d.ground + 0.155, z0], [w, d.ground + 0.155, z0],
    [w, d.floorY - 0.005, z1], [-w, d.floorY - 0.005, z1], col);
  for (let k = -2; k <= 2; k += 1) {
    const x = k * w * 0.40;
    pushQuad3(b, [x, d.ground + 0.155, z0], [x, d.ground + 0.095, z0],
      [x, d.floorY - 0.06, z1], [x, d.floorY - 0.005, z1], col);
  }
}

function buildExhaust(b, d, col) {
  const path = [
    [-0.18, d.floorY - 0.02, d.frontAxle - 0.30],
    [-0.22, d.floorY - 0.03, 0],
    [-0.30, d.floorY + 0.01, d.rearAxle],
    [-0.42, d.ground + 0.24, d.tailZ + 0.16],
  ];
  pushTube(b, path, 0.038, 6, col);
  pushCylinder(b, -0.42, d.ground + 0.245, d.tailZ + 0.10, 0.052, 0.060, 0.16, 10, "z", col);
}

function buildMudflaps(b, d, hubs, col) {
  for (const h of hubs) {
    const back = h.z > 0 ? -1 : -1;
    const z = h.z + back * 0.40;
    const x = Math.sign(h.x) * (d.halfWidth - 0.03);
    pushQuad3(b,
      [x - 0.13, d.sillY - 0.02, z + 0.02], [x + 0.13, d.sillY - 0.02, z + 0.02],
      [x + 0.13, d.flapBottom, z - 0.03], [x - 0.13, d.flapBottom, z - 0.03], col);
    pushQuad3(b,
      [x - 0.13, d.flapBottom, z - 0.03], [x + 0.13, d.flapBottom, z - 0.03],
      [x + 0.13, d.sillY - 0.02, z + 0.02], [x - 0.13, d.sillY - 0.02, z + 0.02], col);
  }
}

function buildMirror(b, d, side, col) {
  const z = d.frontAxle - 0.34;
  const y = d.beltY + 0.075;
  const xIn = side * d.bodyHalfWidth * 0.96;
  const xOut = side * (d.halfWidth + d.mirrorOut);
  pushTube(b, [[xIn, y, z], [xOut * 0.82, y + 0.03, z - 0.02]], 0.016, 4, col);
  pushTaper(b, (xOut + xIn) * 0.5 + side * 0.02, y + 0.055, z - 0.03, 0.10, 0.13, 0.07, 0.10, -0.035, 0.035, col);
  // The outer face defines the car's width envelope; keep it exactly on it.
  pushQuad3(b,
    [xOut, y + 0.020, z - 0.085], [xOut, y + 0.020, z + 0.025],
    [xOut, y + 0.090, z + 0.025], [xOut, y + 0.090, z - 0.085], col);
}

function buildDoor(b, d, side, col) {
  const c = cabinFrame(d);
  const z0 = c.zRs + 0.10, z1 = c.zWs - 0.06;
  const x = side * (d.bodyHalfWidth + 0.012);
  const yTop = d.beltY + 0.030, yBot = d.sillY + 0.06;
  const nz = 3;
  for (let j = 0; j < nz; j += 1) {
    const za = lerp(z0, z1, j / nz), zb = lerp(z0, z1, (j + 1) / nz);
    const p0 = [x, yBot, za], p1 = [x, yBot, zb], p2 = [x, yTop, zb], p3 = [x, yTop, za];
    if (side > 0) pushQuad3(b, p0, p1, p2, p3, col); else pushQuad3(b, p3, p2, p1, p0, col);
  }
  // A shallow swage line and a handle: at chase distance these are the only
  // cues that say "door" rather than "flank".
  pushBox(b, x + side * 0.006, d.beltY - 0.10, (z0 + z1) * 0.5, 0.012, 0.030, (z1 - z0) * 0.85, col);
  pushBox(b, x + side * 0.014, d.beltY - 0.045, (z0 + z1) * 0.5 + 0.16, 0.022, 0.035, 0.13, [0.05, 0.05, 0.055]);
}

function buildRollCage(b, d, col) {
  const c = cabinFrame(d);
  const w = d.bodyHalfWidth * 0.86;
  const r = 0.024;
  const floor = d.floorY + 0.04;
  const top = d.roofY - 0.055;
  const zB = (c.zWs + c.zRs) * 0.48;
  // Main hoop across the B-pillar plane.
  pushTube(b, [
    [-w, floor, zB], [-w, d.beltY, zB], [-w * 0.92, top, zB],
    [0, top + 0.012, zB], [w * 0.92, top, zB], [w, d.beltY, zB], [w, floor, zB],
  ], r, 6, col);
  for (const side of [-1, 1]) {
    pushTube(b, [
      [side * w * 0.92, top, zB], [side * w * 0.90, top, c.zRoofF + 0.16],
      [side * (c.beltW * 0.92), c.beltY + 0.02, c.zWs + 0.02],
      [side * (c.beltW * 0.90), d.beltY - 0.20, c.zWs + 0.10],
    ], r, 6, col);
    pushTube(b, [
      [side * w * 0.92, top, zB], [side * w * 0.86, d.beltY + 0.18, c.zRs - 0.02],
      [side * w * 0.80, floor + 0.05, d.rearAxle - 0.10],
    ], r * 0.9, 6, col);
    pushTube(b, [
      [side * w, d.beltY - 0.06, zB - 0.02], [side * w, d.beltY - 0.30, c.zWs + 0.06],
    ], r * 0.85, 6, col);
    pushTube(b, [
      [side * w, d.beltY - 0.30, zB - 0.02], [side * w, d.beltY - 0.08, c.zWs + 0.06],
    ], r * 0.85, 6, col);
  }
  pushTube(b, [[-w * 0.90, top, zB], [w * 0.86, top - 0.01, c.zRoofF + 0.18]], r * 0.8, 6, col);
}

function buildInterior(b, d, col) {
  const c = cabinFrame(d);
  const floor = d.floorY + 0.02;
  pushQuad3(b, [-d.bodyHalfWidth * 0.9, floor, c.zRs], [d.bodyHalfWidth * 0.9, floor, c.zRs],
    [d.bodyHalfWidth * 0.9, floor, c.zWs], [-d.bodyHalfWidth * 0.9, floor, c.zWs], [0.03, 0.03, 0.035]);
  for (const side of [-1, 1]) {
    const x = side * d.bodyHalfWidth * 0.46;
    const z = (c.zWs + c.zRs) * 0.54;
    pushTaper(b, x, floor, z, 0.42, 0.46, 0.38, 0.42, 0.02, 0.16, col);
    pushTaper(b, x, floor, z - 0.24, 0.42, 0.14, 0.34, 0.12, 0.10, 0.72, col, 0.10);
  }
  pushTaper(b, 0, d.beltY - 0.12, c.zWs - 0.12, d.bodyHalfWidth * 1.6, 0.30, d.bodyHalfWidth * 1.5, 0.22, 0, 0.14, [0.025, 0.025, 0.03], -0.04);
  const wheelPath = [];
  const wr = 0.155;
  for (let k = 0; k <= 12; k += 1) {
    const a = (k / 12) * TAU;
    wheelPath.push([-d.bodyHalfWidth * 0.44 + Math.cos(a) * wr, d.beltY - 0.055 + Math.sin(a) * wr * 0.55, c.zWs - 0.30 + Math.sin(a) * wr * 0.84]);
  }
  pushTube(b, wheelPath, 0.017, 5, [0.04, 0.04, 0.045], false);
}

function buildSpare(b, d, col) {
  const c = cabinFrame(d);
  const y = d.beltY - 0.12;
  const z = c.zRs + 0.22;
  pushCylinder(b, 0, y, z, 0.30, 0.30, 0.20, 14, "y", col);
  pushCylinder(b, 0, y, z, 0.16, 0.16, 0.215, 10, "y", [0.42, 0.43, 0.46]);
}

function buildSumpGuard(b, d, col) {
  pushQuad3(b,
    [-d.bodyHalfWidth * 0.82, d.floorY - 0.018, d.frontAxle + 0.28],
    [d.bodyHalfWidth * 0.82, d.floorY - 0.018, d.frontAxle + 0.28],
    [d.bodyHalfWidth * 0.82, d.floorY - 0.018, d.rearAxle + 0.10],
    [-d.bodyHalfWidth * 0.82, d.floorY - 0.018, d.rearAxle + 0.10], col);
}

export function buildCarMesh(THREE, spec, livery, opts = {}) {
  const paintSpec = livery || spec.livery || { base: "#cccccc", pattern: "stripe", number: 0 };
  const d = carDimensions(spec);
  const hubs = carHubPositions(spec);
  const paintTex = liveryTexture(THREE, paintSpec, opts);

  const white = [1, 1, 1];
  const black = [0.045, 0.045, 0.05];
  const cageCol = [0.80, 0.80, 0.82];
  const trimCol = [0.10, 0.10, 0.115];
  // Every colour below is a linear albedo, because under the one albedo rule the
  // vertex colour is the only thing carrying one on these parts. Moulded bumper
  // plastic is dark but not black: it was 0x14161a on the material AND white in
  // the vertices, which shaded at 0.007 — a third of what soot reflects.
  const bumperCol = [0.038, 0.040, 0.046];

  const paint = opts.paintMaterial || paintedAlbedo(injectDamageShader(new THREE.MeshStandardMaterial({
    map: paintTex.map || null,
    roughnessMap: paintTex.roughnessMap || null,
    normalMap: paintTex.normalMap,
    roughness: 0.34,
    metalness: 0.10,
    vertexColors: false,
  }), paintTex.mudMap));
  const plastic = vertexAlbedo(injectDamageShader(new THREE.MeshStandardMaterial({
    roughness: 0.78, metalness: 0.02, vertexColors: true,
  }), paintTex.mudMap));
  const glassMat = vertexAlbedo(new THREE.MeshStandardMaterial({
    roughness: 0.06, metalness: 0.0,
    transparent: true, opacity: 0.34, side: THREE.DoubleSide, vertexColors: true,
  }));
  const cageMat = vertexAlbedo(new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.55, vertexColors: true }));
  const metalMat = vertexAlbedo(new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.85, vertexColors: true }));
  const trimMat = vertexAlbedo(new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05, vertexColors: true }));
  const lampMat = vertexAlbedo(new THREE.MeshStandardMaterial({
    roughness: 0.12, metalness: 0.0,
    emissive: 0xfff0d0, emissiveIntensity: 1.0, vertexColors: true,
  }));

  const materials = [paint, plastic, glassMat, cageMat, metalMat, trimMat, lampMat];
  const paintMaterials = [paint, plastic];
  const geometries = [];
  const parts = Object.create(null);
  const group = new THREE.Group();
  group.name = `car-${spec.id || "car"}`;

  const addPart = (name, build, material, forcePanel, opt = {}) => {
    const b = mkBuilder();
    build(b);
    if (b.n === 0) return null;
    fillPanelChannel(b, d, forcePanel);
    const geometry = finish(THREE, b, { colors: true });
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = opt.receive !== false;
    parts[name] = mesh;
    (opt.parent || group).add(mesh);
    return mesh;
  };

  addPart("body", (b) => {
    buildBodyShell(b, d, white);
    buildArchFlare(b, d, d.frontAxle, white);
    buildArchFlare(b, d, d.rearAxle, white);
    buildRoofPanel(b, d, white);
    buildPillars(b, d, white);
  }, paint);

  addPart("bonnet", (b) => buildBonnet(b, d, white), paint, 5);
  addPart("bumperFront", (b) => buildBumper(b, d, true, bumperCol), plastic, 0);
  addPart("bumperRear", (b) => buildBumper(b, d, false, bumperCol), plastic, 1);
  addPart("doorLeft", (b) => buildDoor(b, d, -1, white), paint, 2);
  addPart("doorRight", (b) => buildDoor(b, d, 1, white), paint, 3);
  addPart("mirrorLeft", (b) => buildMirror(b, d, -1, white), paint, 2);
  addPart("mirrorRight", (b) => buildMirror(b, d, 1, white), paint, 3);
  addPart("wingRear", (b) => buildWing(b, d, white), paint, 1);
  addPart("roofScoop", (b) => buildRoofScoop(b, d, white), paint, 4);
  addPart("lightPod", (b) => buildLightPod(b, d, trimCol), trimMat, 0);
  addPart("diffuser", (b) => buildDiffuser(b, d, black), trimMat, 1);
  addPart("exhaustTail", (b) => buildExhaust(b, d, [0.62, 0.63, 0.66]), metalMat, 1);
  addPart("mudflaps", (b) => buildMudflaps(b, d, hubs, black), trimMat, 2, { receive: false });
  addPart("sumpGuard", (b) => buildSumpGuard(b, d, [0.45, 0.46, 0.48]), metalMat, 0);
  addPart("spare", (b) => buildSpare(b, d, black), trimMat, 6);
  addPart("rollCage", (b) => buildRollCage(b, d, cageCol), cageMat, 4);
  addPart("interior", (b) => buildInterior(b, d, trimCol), trimMat, 4, { receive: false });

  const lampSpec = buildLamps(d);
  const lamps = [];
  for (let i = 0; i < lampSpec.positions.length; i += 1) {
    const [x, y, z, r] = lampSpec.positions[i];
    const mesh = addPart(`lamp${i}`, (b) => {
      pushCylinder(b, x, y, z, r, r * 0.96, 0.02, 12, "z", lampSpec.colour);
    }, lampMat, 0, { receive: false });
    if (mesh) lamps.push(mesh);
  }

  // Glass last so its transparency sorts after the opaque shell.
  const glassMesh = addPart("glass", (b) => buildGlass(b, d), glassMat, 4, { receive: false });
  if (glassMesh) {
    glassMesh.renderOrder = 2;
    parts.windscreen = glassMesh;
  }

  let triangles = 0;
  for (const g of geometries) triangles += triangleCount(g);

  const car = {
    group,
    parts,
    lamps,
    materials,
    paintMaterials,
    geometries,
    livery: paintTex,
    dimensions: d,
    hubs,
    triangles,
    dent: new Float32Array(7),
    state: { mud: 0 },
    setMud(v) { setMudLevel(car, v); },
    applyDamage(visual) { applyCarDamage(car, visual); },
    dispose() { disposeCar(car); },
  };
  return car;
}

export function disposeCar(car) {
  if (!car) return;
  for (const g of car.geometries) g.dispose();
  for (const m of car.materials) m.dispose?.();
  car.livery?.dispose?.();
  car.geometries.length = 0;
}

// ---- wheels --------------------------------------------------------------

const TREAD_PATTERNS = Object.freeze({
  gravel: { blocks: 14, rows: 3, depth: 0.020, width: 0.55, stagger: 0.5, stud: false },
  tarmac: { blocks: 26, rows: 2, depth: 0.006, width: 0.18, stagger: 0, stud: false },
  snow: { blocks: 18, rows: 3, depth: 0.014, width: 0.32, stagger: 0.35, stud: true },
});

function tyreClassOf(spec) {
  const trim = spec.tyre && spec.tyre.surfaceGrip;
  if (Array.isArray(trim)) {
    if (trim[SURFACE.SNOW] > 1.3) return "snow";
    if (trim[SURFACE.TARMAC] > 1.02) return "tarmac";
  }
  return "gravel";
}

export function buildWheelMesh(THREE, spec, opts = {}) {
  const R = spec.wheelRadius;
  const kind = opts.tyre || tyreClassOf(spec);
  const pattern = TREAD_PATTERNS[kind] || TREAD_PATTERNS.gravel;
  const width = (opts.width ?? (kind === "tarmac" ? 0.235 : 0.205));
  const rimR = R * (kind === "tarmac" ? 0.72 : 0.62);
  // Linear albedos, single-sourced in the vertices (see the one albedo rule):
  // tyre carbon black really is this dark, cast iron this dull.
  const rubber = [0.042, 0.042, 0.045];
  const rimCol = [0.55, 0.56, 0.60];
  const discCol = [0.16, 0.165, 0.175];
  const caliperCol = [0.40, 0.10, 0.06];
  const studCol = [0.52, 0.53, 0.56];
  const hubCol = [0.26, 0.27, 0.29];

  const tyreB = mkBuilder();
  // Sidewall bulge: the profile is revolved, so a gravel tyre visibly squats.
  const profile = [
    [rimR, -width * 0.5],
    [rimR + (R - rimR) * 0.42, -width * 0.60],
    [R - pattern.depth * 0.5, -width * 0.52],
    [R, -width * 0.40],
    [R, width * 0.40],
    [R - pattern.depth * 0.5, width * 0.52],
    [rimR + (R - rimR) * 0.42, width * 0.60],
    [rimR, width * 0.5],
  ];
  const seg = 20;
  const rows = [];
  for (const [pr, px] of profile) {
    const ring = [];
    for (let k = 0; k < seg; k += 1) {
      const a = (k / seg) * TAU;
      ring.push(vert(tyreB, px, Math.cos(a) * pr, Math.sin(a) * pr, k / seg, (px + width) / (2 * width),
        rubber[0], rubber[1], rubber[2]));
    }
    rows.push(ring);
  }
  for (let i = 0; i + 1 < rows.length; i += 1) {
    for (let k = 0; k < seg; k += 1) {
      const j = (k + 1) % seg;
      quad(tyreB, rows[i][k], rows[i][j], rows[i + 1][j], rows[i + 1][k]);
    }
  }
  // Tread blocks: raised pads rather than a grooved cylinder, because the
  // silhouette against the sky is what says "gravel tyre".
  for (let bIdx = 0; bIdx < pattern.blocks; bIdx += 1) {
    for (let r = 0; r < pattern.rows; r += 1) {
      const rowX = (r / (pattern.rows - 1 || 1) - 0.5) * width * 0.72;
      const phase = (bIdx + (r % 2) * pattern.stagger) / pattern.blocks;
      const a0 = phase * TAU;
      const a1 = a0 + (TAU / pattern.blocks) * pattern.width;
      const rr = R + pattern.depth;
      const bw = width * (pattern.rows > 1 ? 0.26 : 0.4);
      const corners = [];
      for (const aa of [a0, a1]) {
        for (const rad of [R - 0.002, rr]) {
          corners.push([Math.cos(aa) * rad, Math.sin(aa) * rad]);
        }
      }
      const p = (i2, x) => [x, corners[i2][0], corners[i2][1]];
      const x0 = rowX - bw * 0.5, x1 = rowX + bw * 0.5;
      pushQuad3(tyreB, p(1, x0), p(3, x0), p(3, x1), p(1, x1), rubber);
      pushQuad3(tyreB, p(0, x0), p(1, x0), p(1, x1), p(0, x1), rubber);
      pushQuad3(tyreB, p(3, x0), p(2, x0), p(2, x1), p(3, x1), rubber);
      pushQuad3(tyreB, p(1, x1), p(3, x1), p(2, x1), p(0, x1), rubber);
      pushQuad3(tyreB, p(3, x0), p(1, x0), p(0, x0), p(2, x0), rubber);
      if (pattern.stud && r === 1 && bIdx % 3 === 0) {
        const mid = (a0 + a1) * 0.5;
        pushCylinder(tyreB, rowX, Math.cos(mid) * (rr + 0.006), Math.sin(mid) * (rr + 0.006),
          0.008, 0.008, 0.014, 5, "x", studCol);
      }
    }
  }

  const rimB = mkBuilder();
  pushCylinder(rimB, 0, 0, 0, rimR, rimR, width * 0.94, 20, "x", rimCol, false);
  pushCylinder(rimB, -width * 0.24, 0, 0, rimR * 0.30, rimR * 0.32, width * 0.30, 12, "x", rimCol);
  const spokes = kind === "tarmac" ? 10 : 8;
  for (let k = 0; k < spokes; k += 1) {
    const a = (k / spokes) * TAU;
    const ca = Math.cos(a), sa = Math.sin(a);
    pushTube(rimB, [
      [-width * 0.22, ca * rimR * 0.26, sa * rimR * 0.26],
      [-width * 0.34, ca * rimR * 0.62, sa * rimR * 0.62],
      [-width * 0.40, ca * rimR * 0.94, sa * rimR * 0.94],
    ], rimR * 0.085, 4, rimCol);
  }
  pushCylinder(rimB, -width * 0.42, 0, 0, rimR * 0.16, rimR * 0.14, 0.04, 8, "x", hubCol);

  const brakeB = mkBuilder();
  pushCylinder(brakeB, width * 0.10, 0, 0, rimR * 0.80, rimR * 0.80, 0.026, 18, "x", discCol);
  const caliperB = mkBuilder();
  pushBox(caliperB, width * 0.10, rimR * 0.66, 0.02, 0.055, rimR * 0.42, 0.10, caliperCol);

  const tyreGeom = finish(THREE, tyreB, { colors: true });
  const rimGeom = finish(THREE, rimB, { colors: true });
  const discGeom = finish(THREE, brakeB, { colors: true });
  const caliperGeom = finish(THREE, caliperB, { colors: true });

  const tyreMat = opts.tyreMaterial || vertexAlbedo(new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.0, vertexColors: true }));
  const rimMat = opts.rimMaterial || vertexAlbedo(new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.75, vertexColors: true }));
  const discMat = vertexAlbedo(new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.8, vertexColors: true }));
  const caliperMat = vertexAlbedo(new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.3, vertexColors: true }));

  const group = new THREE.Group();
  group.name = "wheel";
  const spin = new THREE.Group();
  spin.name = "spin";
  const tyre = new THREE.Mesh(tyreGeom, tyreMat); tyre.name = "tyre";
  const rim = new THREE.Mesh(rimGeom, rimMat); rim.name = "rim";
  const disc = new THREE.Mesh(discGeom, discMat); disc.name = "disc";
  const caliper = new THREE.Mesh(caliperGeom, caliperMat); caliper.name = "caliper";
  spin.add(tyre, rim, disc);
  group.add(spin, caliper);
  for (const m of [tyre, rim, disc, caliper]) m.castShadow = true;

  const geometries = [tyreGeom, rimGeom, discGeom, caliperGeom];
  let triangles = 0;
  for (const g of geometries) triangles += triangleCount(g);

  const wheel = {
    group, spin, tyre, rim, disc, caliper,
    geometries,
    materials: [tyreMat, rimMat, discMat, caliperMat],
    radius: R, width, kind, triangles,
    // Four wheels plus a spare share these geometries; only the Object3D is cloned.
    instance() {
      const g = new THREE.Group();
      const sp = new THREE.Group();
      sp.name = "spin";
      sp.add(new THREE.Mesh(tyreGeom, tyreMat), new THREE.Mesh(rimGeom, rimMat), new THREE.Mesh(discGeom, discMat));
      g.add(sp, new THREE.Mesh(caliperGeom, caliperMat));
      g.userData.spin = sp;
      return g;
    },
    dispose() { disposeWheel(wheel); },
  };
  return wheel;
}

// Allocation-free per-frame helper: three scalar writes and nothing else.
export function updateWheel(wheelObject, steerRad, spinRad, camberRad = 0) {
  if (!wheelObject) return;
  const root = wheelObject.group || wheelObject;
  const spin = wheelObject.spin || root.userData?.spin || root.children[0];
  root.rotation.y = steerRad;
  root.rotation.z = camberRad;
  if (spin) spin.rotation.x = spinRad;
}

export function disposeWheel(wheel) {
  if (!wheel) return;
  for (const g of wheel.geometries) g.dispose();
  for (const m of wheel.materials) m.dispose?.();
  wheel.geometries.length = 0;
}

// ---- scenery -------------------------------------------------------------

// stage.js chooses its own vocabulary for scenery kinds; this is the one place
// that has to agree with it, so unknown kinds are counted rather than thrown.
const SCENERY_ALIASES = Object.freeze({
  tree: "tree", conifer: "tree", pine: "tree", spruce: "tree", birch: "tree", deciduous: "tree", forest: "tree",
  rock: "rock", boulder: "rock", stone: "rock",
  bush: "bush", shrub: "bush", scrub: "bush", gorse: "bush",
  tussock: "tussock", clump: "tussock", grass: "tussock",
  fern: "fern", bracken: "fern",
  log: "log", fallenLog: "log", deadwood: "log",
  stump: "stump",
  building: "building", barn: "building", farmhouse: "building", shed: "building",
  house: "building", cottage: "building", hut: "building",
  pole: "pole", telegraph: "pole", pylon: "pole",
  wall: "wall", drystone: "wall", stonewall: "wall",
  fence: "fence", fencepost: "fence",
  bridge: "bridge", parapet: "bridge",
});

export const SCENERY_KINDS = Object.freeze([
  "tree", "rock", "bush", "tussock", "fern", "log", "stump",
  "building", "pole", "wall", "fence", "bridge",
]);

const TREE_SPECIES = Object.freeze(["spire", "broad", "bare", "scrub"]);
const BUILDING_TYPES = Object.freeze(["barn", "farmhouse", "shed"]);

function treeGeometry(b, species, rng) {
  const bark = [0.16, 0.125, 0.09];
  if (species === "spire") {
    const h = 9.5;
    pushCylinder(b, 0, h * 0.5, 0, 0.19, 0.07, h, 6, "y", bark, false);
    for (let k = 0; k < 3; k += 1) {
      const t = k / 3;
      pushCone(b, 0, 1.8 + t * 5.4, 0, 1.75 * (1 - t * 0.55), 3.6 * (1 - t * 0.32), 8,
        [0.075 + t * 0.02, 0.155 + t * 0.03, 0.070], false);
    }
    return;
  }
  if (species === "broad") {
    const h = 7.2;
    pushCylinder(b, 0, h * 0.30, 0, 0.24, 0.13, h * 0.60, 6, "y", bark, false);
    for (let k = 0; k < 3; k += 1) {
      const a = rng.range(0, TAU);
      const r = k === 0 ? 0 : 1.15;
      pushBlob(b, Math.cos(a) * r, 4.9 + (k === 0 ? 0.5 : -0.25), Math.sin(a) * r,
        2.5 - k * 0.35, 1.9 - k * 0.25, 2.4 - k * 0.35,
        [0.105, 0.185, 0.070], 1, 400 + k, 0.30);
    }
    return;
  }
  if (species === "bare") {
    const h = 6.4;
    pushCylinder(b, 0, h * 0.42, 0, 0.20, 0.09, h * 0.84, 5, "y", bark, false);
    for (let k = 0; k < 6; k += 1) {
      const a = (k / 6) * TAU + rng.range(-0.3, 0.3);
      const lean = rng.range(1.1, 1.9);
      pushTube(b, [
        [0, h * 0.52, 0],
        [Math.cos(a) * lean * 0.5, h * 0.78, Math.sin(a) * lean * 0.5],
        [Math.cos(a) * lean, h * 0.96 + rng.range(-0.3, 0.5), Math.sin(a) * lean],
      ], 0.055, 4, bark, false);
    }
    return;
  }
  const h = 4.3;
  pushCylinder(b, 0, h * 0.28, 0, 0.16, 0.09, h * 0.56, 5, "y", bark, false);
  for (let k = 0; k < 2; k += 1) {
    pushBlob(b, rng.range(-0.5, 0.5), 2.7 + k * 0.7, rng.range(-0.5, 0.5),
      1.5 - k * 0.3, 0.85, 1.45 - k * 0.3, [0.085, 0.140, 0.060], 1, 700 + k, 0.42);
  }
}

function buildingGeometry(b, type) {
  const wallCol = [0.42, 0.40, 0.36];
  const roofCol = [0.20, 0.17, 0.15];
  const trim = [0.10, 0.09, 0.08];
  const dims = type === "barn" ? [8.4, 4.4, 12.0, 2.6]
    : type === "farmhouse" ? [7.2, 5.0, 9.0, 3.0]
      : [3.6, 2.4, 4.8, 1.4];
  const [w, wallH, len, roofH] = dims;
  const hx = w * 0.5, hz = len * 0.5;
  // Walls with window openings: a wall drawn as four quads round a hole reads
  // as a building; the same wall with a texture reads as a box.
  const openings = type === "shed" ? [] : [
    { z: -len * 0.26, w: 1.1, y0: 1.1, y1: 2.3 },
    { z: len * 0.26, w: 1.1, y0: 1.1, y1: 2.3 },
  ];
  for (const side of [-1, 1]) {
    const x = side * hx;
    let cuts = [];
    for (const o of openings) cuts.push([o.z - o.w * 0.5, o.z + o.w * 0.5, o.y0, o.y1]);
    cuts.sort((a, c) => a[0] - c[0]);
    let z = -hz;
    for (const c of cuts) {
      pushQuad3(b, [x, 0, z], [x, 0, c[0]], [x, wallH, c[0]], [x, wallH, z], wallCol);
      pushQuad3(b, [x, 0, c[0]], [x, 0, c[1]], [x, c[2], c[1]], [x, c[2], c[0]], wallCol);
      pushQuad3(b, [x, c[3], c[0]], [x, c[3], c[1]], [x, wallH, c[1]], [x, wallH, c[0]], wallCol);
      pushQuad3(b, [x - side * 0.10, c[2], c[0]], [x - side * 0.10, c[2], c[1]],
        [x - side * 0.10, c[3], c[1]], [x - side * 0.10, c[3], c[0]], [0.03, 0.035, 0.04]);
      z = c[1];
    }
    pushQuad3(b, [x, 0, z], [x, 0, hz], [x, wallH, hz], [x, wallH, z], wallCol);
  }
  for (const end of [-1, 1]) {
    const z = end * hz;
    pushQuad3(b, [-hx, 0, z], [hx, 0, z], [hx, wallH, z], [-hx, wallH, z], wallCol);
    tri(b,
      vert(b, -hx, wallH, z, 0, 0, wallCol[0], wallCol[1], wallCol[2]),
      vert(b, hx, wallH, z, 1, 0, wallCol[0], wallCol[1], wallCol[2]),
      vert(b, 0, wallH + roofH, z, 0.5, 1, wallCol[0], wallCol[1], wallCol[2]));
  }
  // Pitched roof with a proper eaves overhang.
  const eave = 0.42;
  for (const side of [-1, 1]) {
    pushQuad3(b,
      [side * (hx + eave), wallH - eave * 0.32, -hz - eave],
      [side * (hx + eave), wallH - eave * 0.32, hz + eave],
      [0, wallH + roofH, hz + eave],
      [0, wallH + roofH, -hz - eave], roofCol);
  }
  if (type === "barn") {
    pushQuad3(b, [-1.5, 0, hz + 0.02], [1.5, 0, hz + 0.02], [1.5, 3.2, hz + 0.02], [-1.5, 3.2, hz + 0.02], trim);
  }
}

function poleGeometry(b) {
  const wood = [0.20, 0.16, 0.11];
  pushCylinder(b, 0, 4.1, 0, 0.16, 0.11, 8.2, 6, "y", wood, false);
  pushBox(b, 0, 7.55, 0, 1.7, 0.10, 0.12, wood);
  for (const side of [-1, 1]) {
    pushCylinder(b, side * 0.62, 7.70, 0, 0.045, 0.045, 0.16, 5, "y", [0.20, 0.25, 0.22]);
  }
}

function wallGeometry(b) {
  const stone = [0.36, 0.35, 0.32];
  // A drystone wall is a stack of irregular stones, not an extruded prism.
  for (let row = 0; row < 4; row += 1) {
    const y = 0.16 + row * 0.28;
    const n = 5;
    for (let k = 0; k < n; k += 1) {
      const z = -1.6 + (k + 0.5) * (3.2 / n) + (row % 2 ? 0.16 : 0);
      const s = 1 - row * 0.10;
      pushBlob(b, (hash2(row, k, 12) - 0.5) * 0.10, y, z,
        0.30 * s, 0.15, 0.34 * s, stone, 0, 900 + row * 7 + k, 0.5);
    }
  }
  pushBox(b, 0, 1.30, 0, 0.44, 0.14, 3.3, [0.33, 0.32, 0.30]);
}

function fenceGeometry(b) {
  const wood = [0.24, 0.19, 0.13];
  pushBox(b, 0, 0.60, 0, 0.09, 1.20, 0.09, wood);
  for (const y of [0.55, 0.95]) pushBox(b, 0, y, 1.2, 0.05, 0.07, 2.4, wood);
}

function rockGeometry(b, variant) {
  const col = [0.27, 0.26, 0.245];
  const s = variant === 1 ? 1.6 : variant === 2 ? 0.7 : 1.0;
  pushBlob(b, 0, 0.42 * s, 0, 0.85 * s, 0.60 * s, 0.72 * s, col, 1, 1300 + variant, 0.55);
  if (variant === 1) pushBlob(b, 0.6 * s, 0.22 * s, -0.3 * s, 0.42 * s, 0.30 * s, 0.38 * s, col, 0, 1500, 0.6);
}

function bushGeometry(b) {
  const col = [0.10, 0.155, 0.065];
  pushBlob(b, 0, 0.55, 0, 0.95, 0.60, 0.90, col, 1, 1700, 0.42);
  pushBlob(b, 0.42, 0.34, 0.25, 0.55, 0.36, 0.52, col, 0, 1750, 0.5);
}

function tussockGeometry(b) {
  const col = [0.22, 0.24, 0.10];
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * Math.PI;
    const c = Math.cos(a) * 0.34, s = Math.sin(a) * 0.34;
    pushQuad3(b, [-c, 0, -s], [c, 0, s], [c, 0.52, s], [-c, 0.52, -s], col);
    pushQuad3(b, [-c, 0.52, -s], [c, 0.52, s], [c, 0, s], [-c, 0, -s], col);
  }
}

function fernGeometry(b) {
  const col = [0.13, 0.20, 0.075];
  for (let k = 0; k < 5; k += 1) {
    const a = (k / 5) * TAU;
    pushQuad3(b, [0, 0.02, 0], [Math.cos(a) * 0.70, 0.30, Math.sin(a) * 0.70],
      [Math.cos(a) * 0.62, 0.62, Math.sin(a) * 0.62], [Math.cos(a + 0.5) * 0.10, 0.34, Math.sin(a + 0.5) * 0.10], col);
  }
}

function logGeometry(b) {
  const wood = [0.21, 0.165, 0.115];
  pushCylinder(b, 0, 0.26, 0, 0.26, 0.22, 3.4, 7, "z", wood);
  pushCylinder(b, 0.9, 0.22, 1.1, 0.11, 0.08, 0.9, 5, "x", wood, false);
}

function stumpGeometry(b) {
  const wood = [0.23, 0.18, 0.12];
  pushCylinder(b, 0, 0.30, 0, 0.42, 0.36, 0.62, 8, "y", wood);
  pushCylinder(b, 0.30, 0.10, 0.12, 0.10, 0.08, 0.7, 5, "z", wood, false);
}

function bridgeGeometry(b) {
  const stone = [0.38, 0.37, 0.34];
  pushBox(b, 0, 0.55, 0, 0.42, 1.10, 6.0, stone);
  pushBox(b, 0, 1.16, 0, 0.56, 0.14, 6.1, [0.34, 0.33, 0.31]);
}

function sceneryPrototypes(THREE, stage, opts) {
  const rng = makeRng(`${stage.seed ?? "scn"}|scenery`);
  const size = opts.textureSize ?? 256;
  const seed = stage.seed ?? 0;
  const barkTex = surfaceTexture(THREE, "bark", { size, seed });
  const foliageTex = surfaceTexture(THREE, "foliage", { size, seed });
  const rockTex = surfaceTexture(THREE, "rock", { size, seed });
  const concreteTex = surfaceTexture(THREE, "concrete", { size, seed });

  const std = (set, over) => neutraliseAlbedo(new THREE.MeshStandardMaterial(Object.assign({
    map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap,
    roughness: 1, metalness: 0, vertexColors: true,
  }, over)), set);

  const materials = {
    tree: std(foliageTex),
    rock: std(rockTex),
    wood: std(barkTex),
    building: std(concreteTex),
    stone: std(rockTex),
  };

  const protos = new Map();
  const add = (key, matKey, build) => {
    const b = mkBuilder();
    build(b);
    const geometry = finish(THREE, b, { colors: true });
    protos.set(key, { key, geometry, material: materials[matKey], triangles: triangleCount(geometry) });
  };

  for (let i = 0; i < TREE_SPECIES.length; i += 1) {
    add(`tree:${i}`, "tree", (b) => treeGeometry(b, TREE_SPECIES[i], rng.fork(`tree${i}`)));
  }
  for (let i = 0; i < 3; i += 1) add(`rock:${i}`, "rock", (b) => rockGeometry(b, i));
  add("bush:0", "tree", bushGeometry);
  add("tussock:0", "tree", tussockGeometry);
  add("fern:0", "tree", fernGeometry);
  add("log:0", "wood", logGeometry);
  add("stump:0", "wood", stumpGeometry);
  for (let i = 0; i < BUILDING_TYPES.length; i += 1) {
    add(`building:${i}`, "building", (b) => buildingGeometry(b, BUILDING_TYPES[i]));
  }
  add("pole:0", "wood", poleGeometry);
  add("wall:0", "stone", wallGeometry);
  add("fence:0", "wood", fenceGeometry);
  add("bridge:0", "stone", bridgeGeometry);
  return { protos, materials };
}

function variantCount(kind) {
  if (kind === "tree") return TREE_SPECIES.length;
  if (kind === "rock") return 3;
  if (kind === "building") return BUILDING_TYPES.length;
  return 1;
}

// Telegraph wire and fence rails need to know their neighbours, so consecutive
// entries of the same kind within `maxGap` are chained into runs.
function chainRuns(items, maxGap) {
  const runs = [];
  let current = null;
  for (const it of items) {
    if (current && Math.hypot(it.x - current[current.length - 1].x, it.z - current[current.length - 1].z) <= maxGap) {
      current.push(it);
    } else {
      current = [it];
      runs.push(current);
    }
  }
  return runs.filter((r) => r.length > 1);
}

// A stage may hand over more roadside than the budget can draw — northmarch-
// kestrel asks for 316k triangles against a 240k ceiling — so the surplus has to
// go somewhere. Built roadside (a barn, a wall, a fence line) is a tier of its
// own and outlives every plant on the stage; poles and bridges are never thinned
// at all, because the wires hang on the poles and the parapet is the corner.
const SCENERY_PRIORITY = Object.freeze({
  building: 10, wall: 10, fence: 10,
  rock: 1.6, log: 1.5, stump: 1.5, tree: 1.2, bush: 0.6, fern: 0.25, tussock: 0,
});

const SCENERY_KEPT_WHOLE = Object.freeze(["pole", "bridge"]);

// Within a tier the three terms are deliberately comparable in size, so the
// layers thin *together*. Species alone deleted all 616 bushes on kestrel before
// it touched a tree, which is a forest with no understorey; distance alone
// clears the far edge of a stand in a straight line, which is a forest with a
// mown border. Species sets the rate, distance biases it toward the road, and
// the position hash spreads the losses through the stand.
function sceneryKeepScore(p) {
  const priority = SCENERY_PRIORITY[p.kind] ?? 1;
  const near = 1 - saturate(p.dist / 260);
  const dither = hash2(Math.round(p.item.x), Math.round(p.item.z), 4243) - 0.5;
  return priority * 0.35 + near * 0.55 + dither;
}

export function buildSceneryLibrary(THREE, stage, opts = {}) {
  const { protos, materials } = sceneryPrototypes(THREE, stage, opts);
  const index = opts.centreline || centrelineIndex(stage);
  const rng = makeRng(`${stage.seed ?? "scn"}|place`);
  const list = Array.isArray(stage.scenery) ? stage.scenery : [];
  const clearance = opts.clearance ?? 0.4;
  const budget = opts.sceneryBudget ?? TRIANGLE_BUDGET.scenery;

  const placements = [];
  const rejected = [];
  const unknown = [];
  for (const item of list) {
    const kind = SCENERY_ALIASES[item.kind] || null;
    if (!kind) { unknown.push(item); continue; }
    const near = index.nearest(item.x, item.z);
    const hw = halfWidthOf(stage, near.index);
    // Nothing may stand on the road: a tree inside the driving line is a bug
    // in placement, not a decoration.
    if (near.dist < hw + clearance) { rejected.push(item); continue; }
    const vc = variantCount(kind);
    const variant = Number.isFinite(item.variant) ? ((item.variant | 0) % vc + vc) % vc
      : Math.floor(hash2(Math.round(item.x), Math.round(item.z), 33) * vc) % vc;
    const key = `${kind}:${variant}`;
    const proto = protos.get(key);
    if (!proto) { unknown.push(item); continue; }
    placements.push({ item, kind, key, dist: near.dist, cost: proto.triangles, dropped: false });
  }

  // Wires are merged geometry rather than instances, and they hang off poles,
  // which is why poles are never thinned. Their cost is known before anything is
  // placed, so it comes off the budget the instances get to spend.
  const wireB = mkBuilder();
  const wireCol = [0.06, 0.06, 0.07];
  buildWires(wireB, placements.filter((p) => p.kind === "pole").map((p) => p.item), wireCol);
  const wireTriangles = wireB.idx.length / 3;

  let triangles = wireTriangles;
  for (const p of placements) triangles += p.cost;
  const thinned = [];
  if (triangles > budget) {
    const order = [];
    for (let i = 0; i < placements.length; i += 1) {
      if (!SCENERY_KEPT_WHOLE.includes(placements[i].kind)) order.push(i);
    }
    // Ties broken by input order so two runs of the same stage thin identically.
    const score = placements.map(sceneryKeepScore);
    order.sort((a, c) => score[a] - score[c] || a - c);
    for (let k = 0; k < order.length && triangles > budget; k += 1) {
      const p = placements[order[k]];
      p.dropped = true;
      triangles -= p.cost;
      thinned.push(p.item);
    }
  }
  const overBudget = triangles > budget;

  const buckets = new Map();
  for (const p of placements) {
    if (p.dropped) continue;
    let bucket = buckets.get(p.key);
    if (!bucket) { bucket = []; buckets.set(p.key, bucket); }
    bucket.push(p.item);
  }

  const group = new THREE.Group();
  group.name = "scenery";
  const meshes = [];
  let totalInstances = 0;

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const colour = new THREE.Color();

  for (const [key, items] of buckets) {
    const proto = protos.get(key);
    if (!proto) { for (const it of items) unknown.push(it); continue; }
    const mesh = new THREE.InstancedMesh(proto.geometry, proto.material, items.length);
    mesh.name = `scenery-${key}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (let i = 0; i < items.length; i += 1) {
      const it = items[i];
      const s = Number.isFinite(it.scale) && it.scale > 0.05 ? it.scale : 1;
      const jitter = 0.82 + hash3(Math.round(it.x * 4), Math.round(it.z * 4), i, 61) * 0.42;
      const sx = s * jitter * (0.94 + hash2(i, 7, 12) * 0.14);
      pos.set(it.x, Number.isFinite(it.y) ? it.y : 0, it.z);
      q.setFromAxisAngle(axis, Number.isFinite(it.yaw) ? it.yaw : rng.range(0, TAU));
      scl.set(sx, s * jitter, sx);
      m4.compose(pos, q, scl);
      mesh.setMatrixAt(i, m4);
      const tint = 0.80 + hash2(Math.round(it.x), Math.round(it.z), 77) * 0.40;
      colour.setRGB(tint, tint * (0.94 + hash2(i, 3, 5) * 0.12), tint * 0.96);
      mesh.setColorAt(i, colour);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    totalInstances += items.length;
    meshes.push({ key, mesh, count: items.length, triangles: proto.triangles * items.length });
    group.add(mesh);
  }

  let wireMesh = null;
  if (wireB.n > 0) {
    const g = finish(THREE, wireB, { colors: true });
    wireMesh = new THREE.Mesh(g, materials.wood);
    wireMesh.name = "scenery-wires";
    group.add(wireMesh);
  }

  const library = {
    group,
    meshes,
    materials,
    prototypes: protos,
    wires: wireMesh,
    totalInstances,
    rejected,
    unknown,
    // What the budget cost: the items that would have been drawn but were not,
    // and the flag that says even dropping every one of them was not enough.
    thinned,
    budget,
    overBudget,
    triangles,
    dispose() { disposeScenery(library); },
  };
  return library;
}

// Wires and rails: one merged geometry, because a catenary between two poles
// cannot be an instance of anything.
function buildWires(b, poleItems, col) {
  for (const run of chainRuns(poleItems, 70)) {
    for (let i = 0; i + 1 < run.length; i += 1) {
      const a = run[i], c = run[i + 1];
      const span = Math.hypot(c.x - a.x, c.z - a.z);
      const sag = Math.min(1.4, span * 0.035);
      for (const off of [-0.62, 0.62]) {
        const path = [];
        const nx = -(c.z - a.z) / (span || 1), nz = (c.x - a.x) / (span || 1);
        for (let k = 0; k <= 5; k += 1) {
          const t = k / 5;
          const y0 = (Number.isFinite(a.y) ? a.y : 0) + 7.7;
          const y1 = (Number.isFinite(c.y) ? c.y : 0) + 7.7;
          path.push([
            lerp(a.x, c.x, t) + nx * off,
            lerp(y0, y1, t) - Math.sin(t * Math.PI) * sag,
            lerp(a.z, c.z, t) + nz * off,
          ]);
        }
        pushTube(b, path, 0.028, 3, col, false);
      }
    }
  }
  return b;
}

export function disposeScenery(library) {
  if (!library) return;
  for (const entry of library.meshes) {
    entry.mesh.dispose?.();
    if (entry.mesh.parent) entry.mesh.parent.remove(entry.mesh);
  }
  for (const p of library.prototypes.values()) p.geometry.dispose();
  for (const key of Object.keys(library.materials)) library.materials[key].dispose?.();
  if (library.wires) library.wires.geometry.dispose();
  library.meshes.length = 0;
}

// ---- props: the rally furniture -----------------------------------------

export const PROP_KINDS = Object.freeze([
  "gantryStart", "gantryFinish", "flyingFinish", "chevron", "arrowLeft", "arrowRight",
  "distanceBoard", "cautionTriangle", "hayBaleRound", "hayBaleRect", "tyreStack",
  "spectatorStand", "spectatorCheer", "spectatorCrouch", "marshalPost",
  "tapeStake", "bunting", "serviceBanner", "cone",
]);

const PROP_ALIASES = Object.freeze({
  start: "gantryStart", startGantry: "gantryStart", gantry: "gantryStart",
  finish: "gantryFinish", finishGantry: "gantryFinish",
  flyingFinish: "flyingFinish", stopBoard: "flyingFinish",
  chevron: "chevron", arrow: "chevron", arrowLeft: "arrowLeft", arrowRight: "arrowRight",
  distance: "distanceBoard", distanceBoard: "distanceBoard", sign: "distanceBoard",
  caution: "cautionTriangle", warning: "cautionTriangle", cautionTriangle: "cautionTriangle",
  hay: "hayBaleRound", hayBale: "hayBaleRound", bale: "hayBaleRound",
  hayBaleRound: "hayBaleRound", hayBaleRect: "hayBaleRect", strawBale: "hayBaleRect",
  tyres: "tyreStack", tyreStack: "tyreStack", tyrewall: "tyreStack",
  spectator: "spectatorStand", spectators: "spectatorStand", crowd: "spectatorStand",
  spectatorStand: "spectatorStand", spectatorCheer: "spectatorCheer", spectatorCrouch: "spectatorCrouch",
  marshal: "marshalPost", marshalPost: "marshalPost",
  tape: "tapeStake", stake: "tapeStake", tapeStake: "tapeStake", fenceTape: "tapeStake",
  bunting: "bunting", flags: "bunting",
  banner: "serviceBanner", serviceBanner: "serviceBanner", service: "serviceBanner",
  cone: "cone", marker: "cone",
});

// A gantry carries its wordmark as a second instanced mesh at the same pose, so
// the banner inherits the gantry's placement and has to be checked against it.
export const PROP_BANNERS = Object.freeze({ gantryStart: "startBanner", gantryFinish: "finishBanner" });

// The prototypes whose material is a canvas with lettering or a directional
// glyph on it. Which way each of these faces is the whole of its usefulness, so
// tests/meshes.test.mjs walks this list against a real stage's placements.
export const LETTERED_PROTOTYPES = Object.freeze([
  "startBanner", "finishBanner", "serviceBanner", "flyingFinish",
  "chevron", "arrowLeft", "arrowRight", "distanceBoard", "cautionTriangle",
]);

const signCache = new Map();

// Canvas is the only way to get a stencil numeral or an invented wordmark onto a
// board. Without one (headless, no factory) the board falls back to flat colour
// rather than failing the build.
function signTexture(THREE, opts, spec) {
  // Every field that changes a pixel, or two boards that differ only in one of
  // them collide: chevron, arrowLeft and arrowRight differ only in `dir`, and
  // the left-hand arrow was being served the right-hand one's texture.
  const key = `${spec.kind}|${spec.text || ""}|${spec.sub || ""}|${spec.bg}|${spec.fg}`
    + `|${spec.dir ?? 1}|${spec.w ?? 256}|${spec.h ?? 256}|${spec.textScale ?? ""}`;
  const hit = signCache.get(key);
  if (hit) return hit;
  const W = spec.w ?? 256, H = spec.h ?? 256;
  const canvas = makeCanvas(opts, W, H);
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = spec.bg;
  ctx.fillRect(0, 0, W, H);
  if (spec.kind === "chevron") {
    ctx.fillStyle = spec.fg;
    const dir = spec.dir ?? 1;
    for (let k = 0; k < 3; k += 1) {
      const x = W * (0.12 + k * 0.28);
      ctx.beginPath();
      ctx.moveTo(dir > 0 ? x : W - x, H * 0.10);
      ctx.lineTo(dir > 0 ? x + W * 0.22 : W - x - W * 0.22, H * 0.50);
      ctx.lineTo(dir > 0 ? x : W - x, H * 0.90);
      ctx.lineTo(dir > 0 ? x + W * 0.10 : W - x - W * 0.10, H * 0.90);
      ctx.lineTo(dir > 0 ? x + W * 0.32 : W - x - W * 0.32, H * 0.50);
      ctx.lineTo(dir > 0 ? x + W * 0.10 : W - x - W * 0.10, H * 0.10);
      ctx.closePath();
      ctx.fill();
    }
  } else if (spec.kind === "triangle") {
    ctx.fillStyle = spec.fg;
    ctx.beginPath();
    ctx.moveTo(W * 0.5, H * 0.10);
    ctx.lineTo(W * 0.94, H * 0.86);
    ctx.lineTo(W * 0.06, H * 0.86);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = spec.bg;
    ctx.font = face(STENCIL_FACE, H * 0.34);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", W * 0.5, H * 0.62);
  } else {
    ctx.fillStyle = spec.fg;
    ctx.font = face(STENCIL_FACE, H * (spec.textScale ?? 0.42));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(spec.text || ""), W * 0.5, H * 0.5);
    if (spec.sub) {
      ctx.font = face(SPONSOR_FACE, H * 0.16);
      ctx.fillText(String(spec.sub), W * 0.5, H * 0.82);
    }
  }
  const tex = canvasTexture(THREE, canvas, true);
  signCache.set(key, tex);
  return tex;
}

export function clearSignCache() {
  for (const t of signCache.values()) t.dispose();
  signCache.clear();
}

// The sign canvas is clamped at its edges, so a lettered face has to map it
// exactly once. pushBox's UVs run 0..size in metres, which cropped the top of
// every board and smeared the last texel column across the right 17% of a
// chevron. Both faces carry the sign with u running to that side's own right,
// so it reads correctly whichever way the board has been turned.
function boardGeometry(b, w, h, y0, col, postCol, posts = 2) {
  const hx = w * 0.5, y1 = y0 + h, hz = 0.025;
  pushQuad3(b, [-hx, y0, hz], [hx, y0, hz], [hx, y1, hz], [-hx, y1, hz], col);
  pushQuad3(b, [hx, y0, -hz], [-hx, y0, -hz], [-hx, y1, -hz], [hx, y1, -hz], col);
  // The rim takes a corner of the canvas, which is background on every sign.
  const rim = 0.02;
  pushQuad3(b, [-hx, y1, hz], [hx, y1, hz], [hx, y1, -hz], [-hx, y1, -hz], col, rim, rim);
  pushQuad3(b, [hx, y0, hz], [-hx, y0, hz], [-hx, y0, -hz], [hx, y0, -hz], col, rim, rim);
  pushQuad3(b, [hx, y0, hz], [hx, y0, -hz], [hx, y1, -hz], [hx, y1, hz], col, rim, rim);
  pushQuad3(b, [-hx, y0, -hz], [-hx, y0, hz], [-hx, y1, hz], [-hx, y1, -hz], col, rim, rim);
  const px = posts === 1 ? [0] : [-w * 0.34, w * 0.34];
  for (const x of px) pushBox(b, x, y0 * 0.5, -0.04, 0.07, y0, 0.07, postCol);
}

function gantryGeometry(b, finish2) {
  const frame = [0.55, 0.56, 0.58];
  const span = 9.0, height = 5.4;
  for (const side of [-1, 1]) {
    pushCylinder(b, side * span * 0.5, height * 0.5, 0, 0.16, 0.13, height, 8, "y", frame);
    pushBox(b, side * span * 0.5, 0.10, 0, 1.0, 0.20, 1.0, [0.2, 0.2, 0.22]);
  }
  pushCylinder(b, 0, height, 0, 0.15, 0.15, span, 8, "x", frame);
  pushCylinder(b, 0, height - 0.85, 0, 0.09, 0.09, span * 0.98, 6, "x", frame);
  for (let k = -4; k <= 4; k += 1) {
    pushCylinder(b, k * span * 0.11, height - 0.42, 0, 0.045, 0.045, 0.88, 4, "y", frame);
  }
  if (finish2) {
    for (let k = 0; k < 5; k += 1) {
      pushBox(b, -span * 0.4 + k * span * 0.2, height + 0.55, 0, 0.12, 0.9, 0.12, frame);
    }
  }
}

function spectatorGeometry(b, pose) {
  const skin = [0.62, 0.46, 0.36];
  const coat = [0.30, 0.32, 0.38];
  const legs = [0.18, 0.19, 0.24];
  const crouch = pose === "crouch";
  const hipY = crouch ? 0.52 : 0.86;
  const headY = crouch ? 1.24 : 1.66;
  pushTaper(b, 0, 0, 0, 0.30, 0.22, 0.34, 0.24, 0, hipY, legs);
  pushTaper(b, 0, hipY, 0, 0.36, 0.24, 0.32, 0.22, 0, headY - hipY - 0.16, coat);
  pushBlob(b, 0, headY - 0.06, 0, 0.105, 0.125, 0.105, skin, 1, 2100, 0.08);
  for (const side of [-1, 1]) {
    if (pose === "cheer") {
      pushTube(b, [
        [side * 0.20, headY - 0.30, 0], [side * 0.30, headY, 0.02], [side * 0.26, headY + 0.30, 0.04],
      ], 0.048, 4, coat);
    } else if (crouch) {
      pushTube(b, [
        [side * 0.19, headY - 0.34, 0], [side * 0.22, headY - 0.44, 0.16], [side * 0.12, headY - 0.30, 0.28],
      ], 0.046, 4, coat);
    } else {
      pushTube(b, [
        [side * 0.20, headY - 0.30, 0], [side * 0.23, headY - 0.62, 0.02], [side * 0.20, headY - 0.86, 0.06],
      ], 0.046, 4, coat);
    }
  }
}

function propPrototypes(THREE, opts) {
  const size = opts.textureSize ?? 256;
  const concreteTex = surfaceTexture(THREE, "concrete", { size, seed: 11 });
  const dirtTex = surfaceTexture(THREE, "dirt", { size, seed: 11 });

  const plainMat = neutraliseAlbedo(new THREE.MeshStandardMaterial({
    map: concreteTex.map, normalMap: concreteTex.normalMap, roughnessMap: concreteTex.roughnessMap,
    roughness: 1, metalness: 0, vertexColors: true,
  }), concreteTex);
  const strawMat = neutraliseAlbedo(new THREE.MeshStandardMaterial({
    map: dirtTex.map, normalMap: dirtTex.normalMap, roughness: 1, metalness: 0, vertexColors: true,
  }), dirtTex);
  const clothMat = vertexAlbedo(new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, vertexColors: true, side: THREE.DoubleSide }));
  const materials = { plain: plainMat, straw: strawMat, cloth: clothMat };
  const signMats = [];

  // A sign is painted, whichever way it goes: the canvas carries the albedo, and
  // where there is no canvas the flat background colour does. Either way the
  // vertex colours stay out of it.
  const signMaterial = (spec) => {
    const tex = signTexture(THREE, opts, spec);
    const m = paintedAlbedo(new THREE.MeshStandardMaterial({
      map: tex || null,
      color: tex ? 0xffffff : new THREE.Color(spec.bg),
      roughness: 0.72, metalness: 0, side: THREE.DoubleSide,
    }));
    signMats.push(m);
    return m;
  };

  const protos = new Map();
  const add = (key, material, build) => {
    const b = mkBuilder();
    build(b);
    const geometry = finish(THREE, b, { colors: true });
    protos.set(key, { key, geometry, material, triangles: triangleCount(geometry) });
  };

  const post = [0.28, 0.28, 0.30];
  const white = [1, 1, 1];

  // A gantry is placed square to the road at the road's own heading, so the car
  // meets its local -Z face. The banner hangs on that side with u running to the
  // driver's right; on the +Z side it read back to front, which is what put a
  // mirrored wordmark over the start line. It clears the frame's vertical
  // stiffeners, which have a 45 mm radius at z = 0.
  const bannerFace = (b) => pushQuad3(b,
    [4.2, 4.6, -0.06], [-4.2, 4.6, -0.06], [-4.2, 5.35, -0.06], [4.2, 5.35, -0.06], white);

  add("gantryStart", plainMat, (b) => gantryGeometry(b, false));
  add("gantryFinish", plainMat, (b) => gantryGeometry(b, true));
  add("startBanner", signMaterial({ kind: "text", text: EVENT_BRANDING.event, sub: "START", bg: "#0d2b57", fg: "#f4f4f0", w: 512, h: 128, textScale: 0.34 }), bannerFace);
  add("finishBanner", signMaterial({ kind: "text", text: "FINISH", sub: EVENT_BRANDING.subtitle, bg: "#8c1230", fg: "#f4f4f0", w: 512, h: 128, textScale: 0.34 }), bannerFace);
  add("flyingFinish", signMaterial({ kind: "text", text: "FF", sub: "FLYING FINISH", bg: "#f2f2ee", fg: "#101216", w: 256, h: 256 }),
    (b) => boardGeometry(b, 1.0, 1.0, 1.1, white, post, 1));
  add("chevron", signMaterial({ kind: "chevron", bg: "#f0b400", fg: "#141414", dir: 1 }),
    (b) => boardGeometry(b, 1.2, 0.8, 0.9, white, post, 2));
  add("arrowLeft", signMaterial({ kind: "chevron", bg: "#f0b400", fg: "#141414", dir: -1 }),
    (b) => boardGeometry(b, 1.2, 0.8, 0.9, white, post, 2));
  add("arrowRight", signMaterial({ kind: "chevron", bg: "#f0b400", fg: "#141414", dir: 1 }),
    (b) => boardGeometry(b, 1.2, 0.8, 0.9, white, post, 2));
  add("distanceBoard", signMaterial({ kind: "text", text: "200", sub: "METRES", bg: "#f2f2ee", fg: "#101216" }),
    (b) => boardGeometry(b, 0.9, 0.9, 1.0, white, post, 1));
  add("cautionTriangle", signMaterial({ kind: "triangle", bg: "#f0b400", fg: "#141414" }),
    (b) => boardGeometry(b, 0.85, 0.85, 0.85, white, post, 1));
  add("serviceBanner", signMaterial({ kind: "text", text: EVENT_BRANDING.service, sub: EVENT_BRANDING.sponsors[0], bg: "#12304f", fg: "#f4f4f0", w: 512, h: 128, textScale: 0.30 }),
    (b) => {
      pushQuad3(b, [-3.0, 1.4, 0], [3.0, 1.4, 0], [3.0, 2.3, 0], [-3.0, 2.3, 0], white);
      pushCylinder(b, -3.0, 1.15, 0, 0.06, 0.06, 2.3, 5, "y", post);
      pushCylinder(b, 3.0, 1.15, 0, 0.06, 0.06, 2.3, 5, "y", post);
    });

  add("hayBaleRound", strawMat, (b) => {
    pushCylinder(b, 0, 0.62, 0, 0.62, 0.62, 1.20, 12, "x", [0.55, 0.48, 0.28]);
  });
  add("hayBaleRect", strawMat, (b) => {
    pushBox(b, 0, 0.35, 0, 1.10, 0.70, 0.55, [0.53, 0.46, 0.26]);
    for (const z of [-0.14, 0.14]) pushBox(b, 0, 0.36, z, 1.12, 0.05, 0.03, [0.20, 0.18, 0.14]);
  });
  add("tyreStack", plainMat, (b) => {
    for (let k = 0; k < 3; k += 1) {
      pushCylinder(b, 0, 0.16 + k * 0.30, 0, 0.36, 0.36, 0.28, 12, "y", [0.055, 0.055, 0.06], false);
      pushCylinder(b, 0, 0.16 + k * 0.30, 0, 0.20, 0.20, 0.29, 8, "y", [0.055, 0.055, 0.06]);
    }
  });
  add("cone", plainMat, (b) => {
    pushCone(b, 0, 0.02, 0, 0.20, 0.52, 8, [0.82, 0.30, 0.08]);
    pushBox(b, 0, 0.015, 0, 0.44, 0.03, 0.44, [0.10, 0.10, 0.11]);
  });
  add("marshalPost", plainMat, (b) => {
    pushCylinder(b, 0, 1.10, 0, 0.06, 0.05, 2.20, 6, "y", post);
    pushQuad3(b, [0, 1.65, 0], [0.9, 1.72, 0.05], [0.9, 2.15, 0.05], [0, 2.15, 0], [0.85, 0.55, 0.08]);
    pushBox(b, 0, 0.05, 0, 0.42, 0.10, 0.42, [0.18, 0.18, 0.20]);
  });
  add("tapeStake", plainMat, (b) => {
    pushCylinder(b, 0, 0.55, 0, 0.035, 0.030, 1.10, 5, "y", post);
    pushQuad3(b, [0, 0.86, -1.6], [0, 0.86, 1.6], [0, 0.94, 1.6], [0, 0.94, -1.6], [0.90, 0.20, 0.16]);
    pushQuad3(b, [0, 0.94, -1.6], [0, 0.94, 1.6], [0, 0.86, 1.6], [0, 0.86, -1.6], [0.85, 0.85, 0.83]);
  });
  add("bunting", clothMat, (b) => {
    const span = 6.0, sag = 0.42;
    for (let k = 0; k < 12; k += 1) {
      const t = (k + 0.5) / 12;
      const x = -span * 0.5 + t * span;
      const y = 2.5 - Math.sin(t * Math.PI) * sag;
      const c = k % 3 === 0 ? [0.62, 0.13, 0.10] : k % 3 === 1 ? [0.82, 0.80, 0.76] : [0.08, 0.24, 0.46];
      tri(b,
        vert(b, x - 0.13, y, 0, 0, 0, c[0], c[1], c[2]),
        vert(b, x + 0.13, y, 0, 1, 0, c[0], c[1], c[2]),
        vert(b, x, y - 0.30, 0.01, 0.5, 1, c[0], c[1], c[2]));
    }
    const path = [];
    for (let k = 0; k <= 8; k += 1) {
      const t = k / 8;
      path.push([-span * 0.5 + t * span, 2.5 - Math.sin(t * Math.PI) * sag, 0]);
    }
    pushTube(b, path, 0.012, 3, [0.1, 0.1, 0.1], false);
  });
  add("spectatorStand", clothMat, (b) => spectatorGeometry(b, "stand"));
  add("spectatorCheer", clothMat, (b) => spectatorGeometry(b, "cheer"));
  add("spectatorCrouch", clothMat, (b) => spectatorGeometry(b, "crouch"));

  return { protos, materials, signMats };
}

export function buildPropLibrary(THREE, opts = {}) {
  const { protos, materials, signMats } = propPrototypes(THREE, opts);

  const library = {
    prototypes: protos,
    materials,
    signMaterials: signMats,
    kinds: PROP_KINDS,
    aliases: PROP_ALIASES,
    // The instanced pass: stage.props in, one InstancedMesh per kind out.
    build(list) {
      const items = Array.isArray(list) ? list : [];
      const buckets = new Map();
      const unknown = [];
      for (const it of items) {
        const kind = PROP_ALIASES[it.kind] || (protos.has(it.kind) ? it.kind : null);
        if (!kind) { unknown.push(it); continue; }
        let key = kind;
        if (kind === "spectatorStand" && Number.isFinite(it.variant)) {
          key = ["spectatorStand", "spectatorCheer", "spectatorCrouch"][Math.abs(it.variant | 0) % 3];
        }
        let bucket = buckets.get(key);
        if (!bucket) { bucket = []; buckets.set(key, bucket); }
        bucket.push(it);
      }
      // Gantries carry their banner as a second instanced mesh at the same pose.
      const banners = PROP_BANNERS;
      for (const [gk, bk] of Object.entries(banners)) {
        const src = buckets.get(gk);
        if (src) buckets.set(bk, src.slice());
      }

      const group = new THREE.Group();
      group.name = "props";
      const meshes = [];
      let triangles = 0;
      let totalInstances = 0;
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const axis = new THREE.Vector3(0, 1, 0);
      const pos = new THREE.Vector3();
      const scl = new THREE.Vector3();
      for (const [key, entries] of buckets) {
        const proto = protos.get(key);
        if (!proto) { for (const e of entries) unknown.push(e); continue; }
        const mesh = new THREE.InstancedMesh(proto.geometry, proto.material, entries.length);
        mesh.name = `prop-${key}`;
        mesh.castShadow = true;
        for (let i = 0; i < entries.length; i += 1) {
          const it = entries[i];
          const s = Number.isFinite(it.scale) && it.scale > 0.05 ? it.scale : 1;
          pos.set(it.x, Number.isFinite(it.y) ? it.y : 0, it.z);
          q.setFromAxisAngle(axis, Number.isFinite(it.yaw) ? it.yaw : 0);
          scl.set(s, s, s);
          m4.compose(pos, q, scl);
          mesh.setMatrixAt(i, m4);
        }
        mesh.instanceMatrix.needsUpdate = true;
        triangles += proto.triangles * entries.length;
        // Banner instances ride on the gantry count; only count the real props.
        if (!Object.values(banners).includes(key)) totalInstances += entries.length;
        meshes.push({ key, mesh, count: entries.length, triangles: proto.triangles * entries.length });
        group.add(mesh);
      }
      const placed = {
        group, meshes, totalInstances, unknown, triangles,
        dispose() {
          for (const e of placed.meshes) {
            e.mesh.dispose?.();
            if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
          }
          placed.meshes.length = 0;
        },
      };
      return placed;
    },
    dispose() { disposeProps(library); },
  };
  return library;
}

export function disposeProps(library) {
  if (!library) return;
  for (const p of library.prototypes.values()) p.geometry.dispose();
  for (const key of Object.keys(library.materials)) library.materials[key].dispose?.();
  for (const m of library.signMaterials) m.dispose?.();
  library.prototypes.clear();
}

// ---- whole-stage convenience --------------------------------------------

// One call the renderer can make, and one number the budget test can check.
export function buildStageMeshes(THREE, stage, opts = {}) {
  const centreline = centrelineIndex(stage);
  const road = buildRoadMesh(THREE, stage, { ...opts, centreline });
  const terrain = buildTerrainMesh(THREE, stage, { ...opts, centreline });
  const scenery = buildSceneryLibrary(THREE, stage, { ...opts, centreline });
  const propLibrary = buildPropLibrary(THREE, opts);
  const props = propLibrary.build(stage.props || []);
  const group = new THREE.Group();
  group.name = "stage";
  group.add(terrain.group, road.group, scenery.group, props.group);
  const triangles = road.triangles + terrain.triangles + scenery.triangles + props.triangles;
  const bundle = {
    group, road, terrain, scenery, propLibrary, props, triangles,
    dispose() {
      road.dispose();
      terrain.dispose();
      scenery.dispose();
      props.dispose();
      propLibrary.dispose();
    },
  };
  return bundle;
}

export function disposeAll() {
  disposeTextures();
  clearLiveryCache();
  clearSignCache();
}


