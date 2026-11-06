// skincheck.mjs - test helper (never loaded by the game): reads a people GLB in plain Node and counts, for every person, the points of the BODY SKIN that lie
// outside a GARMENT in the rest pose - bare skin showing through a T-shirt, a sweater, a kilt's hose. This is the defect tools/people_skinfit.py repairs;
// this file is a separate implementation (JavaScript, ten samples per skin triangle, its own spatial hash and ray test) so the repair is not marked by its own
// ruler. It reads the committed models, so a regenerated people.glb that forgot to run the repair fails js/sim/sim.test.mjs.
//
//   a skin point is "showing" when
//     - a garment surface lies within REACH of it and the point is on its outside (or less than CLEAR under it),
//     - the nearest garment point is not within HEM of an open edge of the garment (neck, cuff, hem: bare skin is meant to show there),
//     - the skin and that garment triangle share bones (a forearm swinging past a shirt's side is bare skin, not "under" the shirt),
//     - and nothing else (a jacket over the shirt, the other side of a crease) covers it along the garment's normal.
import { readFileSync } from 'node:fs';

export const REACH = 0.035, CLEAR = 0.001, HEM = 0.015, OVERLAP = 0.35, COVER = 0.08;
const CLOTH = /^(cloth_|hose_|belt|sporran)/i, FOOTWEAR = /^cloth_(boots|shoes|sneaker)/i, SKIN = /^skin_/;
const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

export function readGlb(path) {
  const d = readFileSync(path);
  if (d.toString('latin1', 0, 4) !== 'glTF') throw new Error('not a GLB: ' + path);
  let off = 12, json = null, bin = null;
  while (off < d.length) {
    const n = d.readUInt32LE(off), t = d.readUInt32LE(off + 4), chunk = d.subarray(off + 8, off + 8 + n); off += 8 + n;
    if (t === 0x4E4F534A) json = JSON.parse(chunk.toString('utf8')); else if (t === 0x004E4942) bin = chunk;
  }
  return { json, bin, dv: new DataView(bin.buffer, bin.byteOffset, bin.byteLength) };
}

export function accessor(g, i) {
  const a = g.json.accessors[i], bv = g.json.bufferViews[a.bufferView], nc = NC[a.type], T = CT[a.componentType];
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride || T.BYTES_PER_ELEMENT * nc;
  const out = a.normalized ? new Float32Array(a.count * nc) : new T(a.count * nc), size = T.BYTES_PER_ELEMENT;
  const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
  const norm = a.normalized ? { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[a.componentType] : 1;
  for (let k = 0; k < a.count; k++) for (let c = 0; c < nc; c++) out[k * nc + c] = g.dv[get](base + k * stride + c * size, true) / norm;
  return out;
}

export function personIds(g) {
  return g.json.nodes.filter((n) => /^person_.+_mesh$/.test(n.name || '')).map((n) => n.name.slice(7, -5)).sort();
}

// the skin and garment primitives of one person: positions, triangles, sparse bone weights per vertex (4 influences)
function person(g, id) {
  const node = g.json.nodes.find((n) => n.name === `person_${id}_mesh`), skins = [], garments = [];
  for (const p of g.json.meshes[node.mesh].primitives) {
    const name = g.json.materials[p.material].name || '', at = p.attributes;
    const prim = { name, P: accessor(g, at.POSITION), I: accessor(g, p.indices), J: at.JOINTS_0 != null ? accessor(g, at.JOINTS_0) : null, W: at.WEIGHTS_0 != null ? accessor(g, at.WEIGHTS_0) : null };
    if (SKIN.test(name)) skins.push(prim); else if (CLOTH.test(name) && !FOOTWEAR.test(name)) garments.push(prim);
  }
  return { skins, garments };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// closest point to p on triangle abc (Ericson, Real-Time Collision Detection 5.1.5)
function closest(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v]; }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w]; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
}

// Moller-Trumbore: does the ray o + t d meet triangle abc for t in (t0, t1)?
function rayHits(o, d, a, b, c, t0, t1) {
  const e1 = sub(b, a), e2 = sub(c, a), pv = cross(d, e2), det = dot(e1, pv);
  if (Math.abs(det) < 1e-12) return false;
  const inv = 1 / det, tv = sub(o, a), u = dot(tv, pv) * inv; if (u < 0 || u > 1) return false;
  const qv = cross(tv, e1), v = dot(d, qv) * inv; if (v < 0 || u + v > 1) return false;
  const t = dot(e2, qv) * inv; return t > t0 && t < t1;
}

class Soup {
  constructor(garments) {
    this.A = []; this.B = []; this.C = []; this.N = []; this.W = [];   // per triangle: corners, unit normal, mean sparse weights {joint: w}
    const wkey = new Map(), wid = (x, y, z) => { const k = Math.round(x * 1e4) + ',' + Math.round(y * 1e4) + ',' + Math.round(z * 1e4); let i = wkey.get(k); if (i === undefined) { i = wkey.size; wkey.set(k, i); } return i; };
    const edges = new Map(), seg = [];
    for (const m of garments) {
      const vw = (v) => { const o = {}; for (let k = 0; k < 4; k++) o[m.J[v * 4 + k]] = (o[m.J[v * 4 + k]] || 0) + m.W[v * 4 + k]; return o; };
      const pt = (v) => [m.P[v * 3], m.P[v * 3 + 1], m.P[v * 3 + 2]], cache = new Map(), wOf = (v) => { if (!cache.has(v)) cache.set(v, vw(v)); return cache.get(v); };
      for (let t = 0; t < m.I.length; t += 3) {
        const v = [m.I[t], m.I[t + 1], m.I[t + 2]], a = pt(v[0]), b = pt(v[1]), c = pt(v[2]), n = cross(sub(b, a), sub(c, a)), l = Math.hypot(...n);
        if (l < 1e-12) continue;
        this.A.push(a); this.B.push(b); this.C.push(c); this.N.push([n[0] / l, n[1] / l, n[2] / l]);
        const w = {}; for (const x of v) for (const [j, f] of Object.entries(wOf(x))) w[j] = (w[j] || 0) + f / 3;
        this.W.push(w);
        const ids = [wid(...a), wid(...b), wid(...c)], P = [a, b, c];
        for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) { const k = Math.min(ids[i], ids[j]) + ':' + Math.max(ids[i], ids[j]); const e = edges.get(k); if (e) e.n++; else edges.set(k, { n: 1, a: P[i], b: P[j] }); }
      }
    }
    for (const e of edges.values()) if (e.n === 1) seg.push(e);   // an edge used by one triangle only is an open edge: a hem, a neck, a cuff
    this.open = seg;
    this.cell = 0.05; this.grid = new Map();
    for (let i = 0; i < this.A.length; i++) {
      const lo = [0, 1, 2].map((k) => Math.min(this.A[i][k], this.B[i][k], this.C[i][k]) - REACH), hi = [0, 1, 2].map((k) => Math.max(this.A[i][k], this.B[i][k], this.C[i][k]) + REACH);
      for (let x = Math.floor(lo[0] / this.cell); x <= Math.floor(hi[0] / this.cell); x++) for (let y = Math.floor(lo[1] / this.cell); y <= Math.floor(hi[1] / this.cell); y++) for (let z = Math.floor(lo[2] / this.cell); z <= Math.floor(hi[2] / this.cell); z++) {
        const k = x + ',' + y + ',' + z; let a = this.grid.get(k); if (!a) this.grid.set(k, a = []); a.push(i);
      }
    }
  }
  near(p) { return this.grid.get(Math.floor(p[0] / this.cell) + ',' + Math.floor(p[1] / this.cell) + ',' + Math.floor(p[2] / this.cell)) || []; }
  hemDist(q) {
    let best = Infinity;
    for (const e of this.open) {
      const ab = sub(e.b, e.a), l2 = dot(ab, ab) + 1e-18, t = Math.max(0, Math.min(1, dot(sub(q, e.a), ab) / l2));
      const d = Math.hypot(q[0] - (e.a[0] + ab[0] * t), q[1] - (e.a[1] + ab[1] * t), q[2] - (e.a[2] + ab[2] * t)); if (d < best) best = d;
    }
    return best;
  }
}

// -> { points: skin samples looked at, showing: count of samples showing skin through a garment, worst: deepest (mm outside the garment), where: [x,y,z] of the worst }
export function skinThrough(g, id, opts = {}) {
  const { skins, garments } = person(g, id), reach = opts.reach ?? REACH, hem = opts.hem ?? HEM;
  const out = { id, points: 0, showing: 0, worst: 0, where: null };
  if (!garments.length || !skins.length) return out;
  const soup = new Soup(garments), grid = [];
  for (let i = 0; i <= 3; i++) for (let j = 0; i + j <= 3; j++) grid.push([i / 3, j / 3, (3 - i - j) / 3]);   // ten samples per triangle
  for (const s of skins) {
    const sw = (v) => { const o = {}; for (let k = 0; k < 4; k++) o[s.J[v * 4 + k]] = (o[s.J[v * 4 + k]] || 0) + s.W[v * 4 + k]; return o; };
    for (let t = 0; t < s.I.length; t += 3) {
      const v = [s.I[t], s.I[t + 1], s.I[t + 2]], P = v.map((x) => [s.P[x * 3], s.P[x * 3 + 1], s.P[x * 3 + 2]]), Wv = v.map(sw);
      for (const [a, b, c] of grid) {
        out.points++;
        const p = [P[0][0] * a + P[1][0] * b + P[2][0] * c, P[0][1] * a + P[1][1] * b + P[2][1] * c, P[0][2] * a + P[1][2] * b + P[2][2] * c];
        const cand = soup.near(p); if (!cand.length) continue;
        let bj = -1, bd = reach, bq = null;
        for (const j of cand) { const q = closest(p, soup.A[j], soup.B[j], soup.C[j]), d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d < bd) { bd = d; bj = j; bq = q; } }
        if (bj < 0) continue;
        const sd = dot(sub(p, bq), soup.N[bj]); if (sd <= -CLEAR) continue;            // safely under the garment
        let ov = 0; const wg = soup.W[bj]; for (const [j, f] of Object.entries(wg)) ov += Math.min(f, (Wv[0][j] || 0) * a + (Wv[1][j] || 0) * b + (Wv[2][j] || 0) * c);
        if (ov < OVERLAP) continue;                                                      // a different limb passing by
        if (soup.hemDist(bq) <= hem) continue;                                           // beside a neck / cuff / hem: skin may show there
        const seen = new Set(); let covered = false;                                    // look along the normal, cell by cell, as far as COVER
        for (let t = 0; t <= COVER && !covered; t += soup.cell * 0.9) {
          const at = [p[0] + soup.N[bj][0] * t, p[1] + soup.N[bj][1] * t, p[2] + soup.N[bj][2] * t];
          for (const j of soup.near(at)) if (!seen.has(j)) { seen.add(j); if (rayHits(p, soup.N[bj], soup.A[j], soup.B[j], soup.C[j], 0.002, COVER)) { covered = true; break; } }
        }
        if (covered) continue;
        out.showing++; if (sd * 1000 > out.worst) { out.worst = sd * 1000; out.where = p; }
        if (opts.collect) opts.collect.push({ p, sd, joint: Object.entries(Wv[0]).sort((x, y) => y[1] - x[1])[0][0] });
      }
    }
  }
  return out;
}

export function skinThroughAll(path, ids) {
  const g = readGlb(path), res = {};
  for (const id of ids || personIds(g)) res[id] = skinThrough(g, id);
  return res;
}
