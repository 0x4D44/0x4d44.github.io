// Browser-safe CPU skinning and closed-surface queries shared by the optional
// wardrobe and its independent asset gate. No files, animation player or fetches.
import { evaluatePoseTarget } from './wear_pose.js';
const fail = (ok, message) => { if (!ok) throw new Error(message); };

export const identity = () => new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
export function multiply(a, b) {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
export function transform(m, p) {
  const [x, y, z] = p;
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}
export function inverseVector(m, d) {
  const a = m[0], b = m[4], c = m[8], e = m[1], f = m[5], g = m[9], h = m[2], i = m[6], j = m[10];
  const det = a * (f * j - g * i) - b * (e * j - g * h) + c * (e * i - f * h);
  fail(Number.isFinite(det) && Math.abs(det) > 1e-10, 'singular blended skin matrix');
  return [((f * j - g * i) * d[0] + (c * i - b * j) * d[1] + (b * g - c * f) * d[2]) / det,
    ((g * h - e * j) * d[0] + (a * j - c * h) * d[1] + (c * e - a * g) * d[2]) / det,
    ((e * i - f * h) * d[0] + (b * h - a * i) * d[1] + (a * f - b * e) * d[2]) / det];
}

export function usedVertices(decoded) { return Uint32Array.from(new Set(decoded.indices)); }
export function blendedMatrix(attrs, index, matrices) {
  const m = new Float64Array(16);
  for (let j = 0; j < 4; j++) {
    const w = attrs.WEIGHTS_0[index * 4 + j]; if (!w) continue;
    const b = matrices[attrs.JOINTS_0[index * 4 + j]]; fail(b, 'invalid skin joint during posing');
    for (let k = 0; k < 16; k++) m[k] += b[k] * w;
  }
  return m;
}
export function skinPositions(decoded, matrices, out = new Float64Array(decoded.attrs.POSITION.length), used = null) {
  const { POSITION: p, JOINTS_0: joint, WEIGHTS_0: weight } = decoded.attrs;
  const count = used ? used.length : p.length / 3;
  for (let v = 0; v < count; v++) {
    const i = used ? used[v] : v, x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
    let ox = 0, oy = 0, oz = 0;
    for (let k = 0; k < 4; k++) {
      const w = weight[i * 4 + k]; if (!w) continue;
      const m = matrices[joint[i * 4 + k]]; fail(m, 'invalid skin joint during posing');
      ox += (m[0] * x + m[4] * y + m[8] * z + m[12]) * w;
      oy += (m[1] * x + m[5] * y + m[9] * z + m[13]) * w;
      oz += (m[2] * x + m[6] * y + m[10] * z + m[14]) * w;
    }
    out[i * 3] = ox; out[i * 3 + 1] = oy; out[i * 3 + 2] = oz;
  }
  return out;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const at = (p, i) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
const ray = [1, 0.3713906763541037, 0.6947465906068658];
const rayInv = ray.map(v => 1 / v);
function rayBoxXYZ(x, y, z, b) {
  const ax = (b[0] - x) * rayInv[0], bx = (b[3] - x) * rayInv[0];
  const ay = (b[1] - y) * rayInv[1], by = (b[4] - y) * rayInv[1];
  const az = (b[2] - z) * rayInv[2], bz = (b[5] - z) * rayInv[2];
  return Math.min(bx, by, bz) >= Math.max(0, ax, ay, az);
}
// The membership ray is fixed. Cache its triangle coefficients per posed
// surface, retaining the same barycentric tolerances and intersection test.
function fixedRayCoefficients(p, ix, out = new Float64Array(ix.length / 3 * 13)) {
  for (let t = 0; t < ix.length / 3; t++) {
    const ai=ix[t*3]*3,bi=ix[t*3+1]*3,ci=ix[t*3+2]*3,o=t*13;
    const ax=p[ai],ay=p[ai+1],az=p[ai+2],ex=p[bi]-ax,ey=p[bi+1]-ay,ez=p[bi+2]-az,fx=p[ci]-ax,fy=p[ci+1]-ay,fz=p[ci+2]-az;
    const hx=ray[1]*fz-ray[2]*fy,hy=ray[2]*fx-ray[0]*fz,hz=ray[0]*fy-ray[1]*fx,det=ex*hx+ey*hy+ez*hz;
    out[o]=ax;out[o+1]=ay;out[o+2]=az;out[o+12]=Math.abs(det)<1e-12?0:Math.sign(det);
    if(!out[o+12])continue;
    out[o+3]=hx/det;out[o+4]=hy/det;out[o+5]=hz/det;
    out[o+6]=(ey*ray[2]-ez*ray[1])/det;out[o+7]=(ez*ray[0]-ex*ray[2])/det;out[o+8]=(ex*ray[1]-ey*ray[0])/det;
    out[o+9]=(ey*fz-ez*fy)/det;out[o+10]=(ez*fx-ex*fz)/det;out[o+11]=(ex*fy-ey*fx)/det;
  }
  return out;
}
function fixedRayTriangle(x,y,z,c,t,detail) {
  const o=t*13;if(!c[o+12])return -1;
  const sx=x-c[o],sy=y-c[o+1],sz=z-c[o+2],u=sx*c[o+3]+sy*c[o+4]+sz*c[o+5];
  if(u < -1e-9 || u > 1+1e-9)return -1;
  const v=sx*c[o+6]+sy*c[o+7]+sz*c[o+8];if(v < -1e-9 || u+v > 1+1e-9)return -1;
  const hit=sx*c[o+9]+sy*c[o+10]+sz*c[o+11];
  if(hit < -1e-9)return -1;
  detail.edge=u<=1e-7||v<=1e-7||u+v>=1-1e-7;
  return Math.max(0,hit);
}

function rayBoxDirection(x, y, z, inverseDirection, b, distance) {
  let lo = 0, hi = distance;
  for (let k = 0; k < 3; k++) {
    const q = k === 0 ? x : k === 1 ? y : z;
    const inverse = inverseDirection[k];
    if (inverse === 0) { if (q < b[k] || q > b[k + 3]) return false; continue; }
    const a = (b[k] - q) * inverse, c = (b[k + 3] - q) * inverse; lo = Math.max(lo, Math.min(a, c)); hi = Math.min(hi, Math.max(a, c));
    if (hi < lo) return false;
  }
  return true;
}
function rayTriangleDirection(x, y, z, direction, p, ix, t, detail) {
  const ai = ix[t * 3] * 3, bi = ix[t * 3 + 1] * 3, ci = ix[t * 3 + 2] * 3;
  const ax = p[ai], ay = p[ai + 1], az = p[ai + 2], e1x = p[bi] - ax, e1y = p[bi + 1] - ay, e1z = p[bi + 2] - az, e2x = p[ci] - ax, e2y = p[ci + 1] - ay, e2z = p[ci + 2] - az;
  const dx = direction[0], dy = direction[1], dz = direction[2], hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
  const det = e1x * hx + e1y * hy + e1z * hz;
  if (Math.abs(det) < 1e-12) return -1;
  const sx = x - ax, sy = y - ay, sz = z - az, u = (sx * hx + sy * hy + sz * hz) / det;
  if (u < -1e-9 || u > 1 + 1e-9) return -1;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, v = (dx * qx + dy * qy + dz * qz) / det;
  if (v < -1e-9 || u + v > 1 + 1e-9) return -1;
  const hit = (e2x * qx + e2y * qy + e2z * qz) / det;
  detail.edge = u <= 1e-7 || v <= 1e-7 || u + v >= 1 - 1e-7;
  detail.entrySign = Math.sign(det);
  return hit >= -1e-9 ? Math.max(0, hit) : -1;
}
function nearestWrite(out, x, y, z, px, py, pz) {
  out[0] = x; out[1] = y; out[2] = z;
  const dx = x - px, dy = y - py, dz = z - pz; return dx * dx + dy * dy + dz * dz;
}
// Closest-point Voronoi regions, using scalar coordinates to avoid allocating
// vectors for every triangle examined by the pose-time correction BVH.
function closestTriangleIndexed(px, py, pz, p, ix, t, out) {
  const ai = ix[t * 3] * 3, bi = ix[t * 3 + 1] * 3, ci = ix[t * 3 + 2] * 3;
  const ax = p[ai], ay = p[ai + 1], az = p[ai + 2], bx = p[bi], by = p[bi + 1], bz = p[bi + 2], cx = p[ci], cy = p[ci + 1], cz = p[ci + 2];
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az, d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return nearestWrite(out, ax, ay, az, px, py, pz);
  const bpx = px - bx, bpy = py - by, bpz = pz - bz, d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return nearestWrite(out, bx, by, bz, px, py, pz);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return nearestWrite(out, ax + abx * v, ay + aby * v, az + abz * v, px, py, pz); }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz, d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return nearestWrite(out, cx, cy, cz, px, py, pz);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return nearestWrite(out, ax + acx * w, ay + acy * w, az + acz * w, px, py, pz); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + d5 - d6); return nearestWrite(out, bx + (cx - bx) * w, by + (cy - by) * w, bz + (cz - bz) * w, px, py, pz); }
  const denom = 1 / (va + vb + vc), v = vb * denom, w = vc * denom;
  return nearestWrite(out, ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w, px, py, pz);
}
function bounds(p, indices, triangles) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const t of triangles) for (let j = 0; j < 3; j++) { const i = indices[t * 3 + j] * 3; for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], p[i + k]); b[k + 3] = Math.max(b[k + 3], p[i + k]); } }
  return b;
}
function buildBvh(p, indices, triangles) {
  const b = bounds(p, indices, triangles), node = { b };
  if (triangles.length <= 8) node.triangles = triangles;
  else {
    const axis = [0, 1, 2].sort((a, c) => (b[c + 3] - b[c]) - (b[a + 3] - b[a]))[0];
    const centre = t => (p[indices[t * 3] * 3 + axis] + p[indices[t * 3 + 1] * 3 + axis] + p[indices[t * 3 + 2] * 3 + axis]) / 3;
    triangles.sort((a, c) => centre(a) - centre(c)); const mid = triangles.length >>> 1;
    node.left = buildBvh(p, indices, triangles.slice(0, mid)); node.right = buildBvh(p, indices, triangles.slice(mid));
  }
  return node;
}
function refit(node, p, indices) {
  if (node.triangles) node.b = bounds(p, indices, node.triangles);
  else {
    refit(node.left, p, indices); refit(node.right, p, indices);
    for (let k = 0; k < 3; k++) { node.b[k] = Math.min(node.left.b[k], node.right.b[k]); node.b[k + 3] = Math.max(node.left.b[k + 3], node.right.b[k + 3]); }
  }
}
function boxDistanceSqXYZ(x, y, z, b) { const dx = Math.max(b[0] - x, 0, x - b[3]), dy = Math.max(b[1] - y, 0, y - b[4]), dz = Math.max(b[2] - z, 0, z - b[5]); return dx * dx + dy * dy + dz * dz; }

/** Closed parts are a union, not one parity ray across overlapping anatomy.
 * Coincident seams are welded only if their skin weights also agree, so an open
 * animated seam cannot pass merely because it happens to touch at rest. */
export class ClosedSurface {
  constructor(decoded, componentRanges = null, label = 'body') {
    this.d = decoded; this.positions = decoded.attrs.POSITION; this.label = label;
    this._pending = []; this._hits = []; this._rayDetail = { edge: false }; this._nearestPending = []; this._closest = new Float64Array(3);
    const { indices, attrs } = decoded;
    fail(indices.length >= 12 && indices.length % 3 === 0, `${label}: empty/nontriangular collision surface`);
    const keys = new Map(), welded = new Uint32Array(decoded.vertices);
    for (const i of usedVertices(decoded)) {
      const key = [...attrs.POSITION.subarray(i * 3, i * 3 + 3)].map(v => Math.round(v * 1e7)).join(',') + '|' +
        (attrs.JOINTS_0 ? [...attrs.JOINTS_0.subarray(i * 4, i * 4 + 4)].join(',') + '|' + [...attrs.WEIGHTS_0.subarray(i * 4, i * 4 + 4)].map(v => Math.round(v * 1e6)).join(',') : '');
      if (!keys.has(key)) keys.set(key, keys.size); welded[i] = keys.get(key);
    }
    const ntri = indices.length / 3;
    if (!componentRanges) {
      const vertexTris = new Map();
      for (let t = 0; t < ntri; t++) for (let k = 0; k < 3; k++) { const v = welded[indices[t * 3 + k]]; if (!vertexTris.has(v)) vertexTris.set(v, []); vertexTris.get(v).push(t); }
      const seen = new Set(); this.components = [];
      for (let t = 0; t < ntri; t++) if (!seen.has(t)) {
        const pending = [t], ts = []; seen.add(t);
        while (pending.length) { const q = pending.pop(); ts.push(q); for (let k = 0; k < 3; k++) for (const v of vertexTris.get(welded[indices[q * 3 + k]])) if (!seen.has(v)) { seen.add(v); pending.push(v); } }
        this.components.push({ name: `component_${this.components.length}`, triangles: ts });
      }
    } else {
      fail(Array.isArray(componentRanges) && componentRanges.length > 0, `${label}: missing closed components`);
      const covered = new Uint8Array(ntri);
      this.components = componentRanges.map(c => {
        fail(Number.isInteger(c.firstIndex) && Number.isInteger(c.indexCount) && c.firstIndex >= 0 && c.indexCount >= 12 && c.firstIndex % 3 === 0 && c.indexCount % 3 === 0 && c.firstIndex + c.indexCount <= indices.length, `${label}: invalid component range`);
        const triangles = Array.from({ length: c.indexCount / 3 }, (_, i) => c.firstIndex / 3 + i);
        for (const t of triangles) { fail(!covered[t], `${label}: overlapping component ranges`); covered[t] = 1; }
        return { name: c.name, triangles };
      });
      fail(covered.every(v => v === 1), `${label}: collision components omit body triangles`);
    }
    for (const part of this.components) {
      const edges = new Map(); let volume = 0;
      for (const t of part.triangles) {
        const ids = [indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]], points = ids.map(i => at(this.positions, i));
        fail(Math.hypot(...cross(sub(points[1], points[0]), sub(points[2], points[0]))) > 1e-12, `${label}/${part.name}: degenerate collision triangle`);
        volume += dot(points[0], cross(points[1], points[2])) / 6;
        for (let k = 0; k < 3; k++) { const a = welded[ids[k]], b = welded[ids[(k + 1) % 3]], key = `${Math.min(a, b)},${Math.max(a, b)}`; fail(a !== b, `${label}: collapsed collision edge`); const e = edges.get(key) ?? [0, 0]; e[0]++; e[1] += a < b ? 1 : -1; edges.set(key, e); }
      }
      fail([...edges.values()].every(([count, balance]) => count === 2 && balance === 0), `${label}/${part.name}: collision surface is open, nonmanifold or inconsistently wound`);
      fail(Number.isFinite(volume) && Math.abs(volume) > 1e-9, `${label}/${part.name}: zero-volume collision component`);
      part.orientation = Math.sign(volume);
      part.root = buildBvh(this.positions, indices, [...part.triangles]);
    }
    this._fixedRay = fixedRayCoefficients(this.positions, indices);
  }
  pose(positions) { this.positions = positions; fixedRayCoefficients(positions, this.d.indices, this._fixedRay); for (const p of this.components) refit(p.root, positions, this.d.indices); return this; }
  inside(point, tolerance = 1e-7) { return this.insideXYZ(point[0], point[1], point[2], tolerance); }
  insideXYZ(x, y, z, tolerance = 1e-7) {
    for (const part of this.components) if (this.containsPart(part, x, y, z, tolerance)) return part;
    return null;
  }
  containsPart(part, x, y, z, tolerance = 1e-7) { return this.windingAt(part, x, y, z, tolerance) !== 0; }
  windingAt(part, x, y, z, tolerance = 1e-7) {
    const b = part.root.b;
    if (x < b[0] || x > b[3] || y < b[1] || y > b[4] || z < b[2] || z > b[5]) return 0;
    const hits = this._hits, pending = this._pending, detail = this._rayDetail;
    let ambiguous = false, winding = 0;
    hits.length = 0; pending.length = 0; pending.push(part.root);
    while (pending.length) {
      const node = pending.pop(); if (!rayBoxXYZ(x, y, z, node.b)) continue;
      if (node.triangles) for (const t of node.triangles) {
        const sign = this._fixedRay[t * 13 + 12];
        if (!sign) ambiguous = true;
        const value = fixedRayTriangle(x, y, z, this._fixedRay, t, detail);
        if (value >= 0) {
          hits.push(value); winding -= sign;
          ambiguous ||= detail.edge || value <= tolerance;
        }
      }
      else pending.push(node.left, node.right);
    }
    hits.sort((a, b) => a - b); let last = -Infinity;
    for (const h of hits) { if (h - last <= tolerance) ambiguous = true; last = h; }
    // A closed limb can fold over itself under linear blend skinning. Signed
    // occupancy two (or minus two) is still inside; odd/even parity is not.
    return ambiguous ? this.solidWindingNumber(part, x, y, z, tolerance) : winding;
  }
  windingInside(part, x, y, z, tolerance = 1e-7) { return this.solidWindingNumber(part, x, y, z, tolerance) !== 0; }
  solidWindingNumber(part, x, y, z, tolerance = 1e-7) {
    const near = this.nearest([x, y, z], part);
    if (near.distance <= tolerance) {
      // An exterior boundary has an empty side. An internal sheet can have
      // nonzero occupancy on both sides and must not clear the whole solid.
      const anchor = near.point, precision = Number.EPSILON * Math.max(1, ...anchor.map(Math.abs)) * 16;
      let step = Math.max(tolerance * 4, precision * 4);
      // Locate the next distinct sheet before taking one-sided limits. A fixed
      // tolerance-sized probe could jump an enclosing sheet and falsely clear
      // a genuinely internal boundary. Only machine-scale coincidences merge.
      for (const sign of [-1, 1]) {
        const direction = near.normal.map(value => value * sign), inverse = direction.map(value => Math.abs(value) < 1e-15 ? 0 : 1 / value);
        const pending = [part.root], detail = { edge: false };
        while (pending.length) {
          const node = pending.pop(); if (!rayBoxDirection(...anchor, inverse, node.b, step)) continue;
          if (node.triangles) for (const t of node.triangles) {
            const distance = rayTriangleDirection(...anchor, direction, this.positions, this.d.indices, t, detail);
            if (distance > precision && distance <= step) step = Math.max(precision, Math.min(step, distance / 4));
          }
          else pending.push(node.left, node.right);
        }
      }
      const a = Math.round(this.solidAngleWinding(part, anchor[0] + near.normal[0] * step, anchor[1] + near.normal[1] * step, anchor[2] + near.normal[2] * step));
      const b = Math.round(this.solidAngleWinding(part, anchor[0] - near.normal[0] * step, anchor[1] - near.normal[1] * step, anchor[2] - near.normal[2] * step));
      return a !== 0 && b !== 0 ? (Math.abs(a) <= Math.abs(b) ? a : b) : 0;
    }
    return Math.round(this.solidAngleWinding(part, x, y, z));
  }
  solidAngleWinding(part, x, y, z) {
    const p = this.positions, ix = this.d.indices; let angle = 0;
    for (const t of part.triangles) {
      const a = ix[t * 3] * 3, b = ix[t * 3 + 1] * 3, c = ix[t * 3 + 2] * 3;
      const ux = p[a] - x, uy = p[a + 1] - y, uz = p[a + 2] - z, vx = p[b] - x, vy = p[b + 1] - y, vz = p[b + 2] - z, wx = p[c] - x, wy = p[c + 1] - y, wz = p[c + 2] - z;
      const lu = Math.hypot(ux, uy, uz), lv = Math.hypot(vx, vy, vz), lw = Math.hypot(wx, wy, wz);
      const determinant = ux * (vy * wz - vz * wy) + uy * (vz * wx - vx * wz) + uz * (vx * wy - vy * wx);
      const denominator = lu * lv * lw + (ux * vx + uy * vy + uz * vz) * lw + (vx * wx + vy * wy + vz * wz) * lu + (wx * ux + wy * uy + wz * uz) * lv;
      angle += 2 * Math.atan2(determinant, denominator);
    }
    fail(Number.isFinite(angle), `${this.label}/${part.name}: non-finite closed-surface winding`);
    return angle / (4 * Math.PI);
  }
  nearest(point, part) {
    const p = this.positions, ix = this.d.indices, pending = this._nearestPending, q = this._closest, x = point[0], y = point[1], z = point[2];
    let distanceSq = Infinity, closestX = 0, closestY = 0, closestZ = 0, closestTriangleIndex = null;
    pending.length = 0; pending.push(part.root);
    while (pending.length) {
      const node = pending.pop(); if (boxDistanceSqXYZ(x, y, z, node.b) > distanceSq) continue;
      if (node.triangles) for (const t of node.triangles) {
        const ds = closestTriangleIndexed(x, y, z, p, ix, t, q);
        if (ds < distanceSq) { distanceSq = ds; closestX = q[0]; closestY = q[1]; closestZ = q[2]; closestTriangleIndex = t; }
      } else { const a = node.left, b = node.right; if (boxDistanceSqXYZ(x, y, z, a.b) < boxDistanceSqXYZ(x, y, z, b.b)) pending.push(b, a); else pending.push(a, b); }
    }
    const ai = ix[closestTriangleIndex * 3] * 3, bi = ix[closestTriangleIndex * 3 + 1] * 3, ci = ix[closestTriangleIndex * 3 + 2] * 3;
    const abx = p[bi] - p[ai], aby = p[bi + 1] - p[ai + 1], abz = p[bi + 2] - p[ai + 2], acx = p[ci] - p[ai], acy = p[ci + 1] - p[ai + 1], acz = p[ci + 2] - p[ai + 2];
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx, norm = Math.hypot(nx, ny, nz) / part.orientation;
    return { point: [closestX, closestY, closestZ], distance: Math.sqrt(distanceSq), normal: [nx / norm, ny / norm, nz / norm] };
  }
  penetration(point, padding = 0.001) {
    const part = this.inside(point); if (!part) return null;
    const near = this.nearest(point, part), delta = sub(near.point, point), length = Math.hypot(...delta);
    if (length > 1e-12) for (let k = 0; k < 3; k++) delta[k] *= (length + padding) / length;
    return { component: part.name, depth: near.distance, deltaWorld: delta };
  }
}

/** Find the first padded union exit along a unit ray. All components contribute,
 * including initially outside ones the ray can enter. After-event membership
 * resolves shared-edge/coplanar tangencies using the same closed-body predicate.
 * A gap smaller than padding is skipped when the padded candidate is not clear. */
export function rayUnionExit(surfaces, point, direction, { padding = 0.002, maxDistance = 0.3, insideParts = null } = {}) {
  const x = point[0], y = point[1], z = point[2], active = new Set(insideParts ?? []), events = [];
  const inverseDirection = direction.map(v => Math.abs(v) < 1e-15 ? 0 : 1 / v), detail = { edge: false };
  if (!insideParts) for (const surface of surfaces) for (const part of surface.components) if (surface.containsPart(part, x, y, z)) active.add(part);
  if (!active.size) return { point: [...point], distance: 0 };
  for (const surface of surfaces) for (const part of surface.components) {
    if (!rayBoxDirection(x, y, z, inverseDirection, part.root.b, maxDistance)) continue;
    const pending = [part.root], hits = [], p = surface.positions, ix = surface.d.indices;
    while (pending.length) {
      const node = pending.pop(); if (!rayBoxDirection(x, y, z, inverseDirection, node.b, maxDistance)) continue;
      if (node.triangles) for (const t of node.triangles) { const h = rayTriangleDirection(x, y, z, direction, p, ix, t, detail); if (h >= 0 && h <= maxDistance) hits.push({ distance: h, edge: detail.edge, step: detail.entrySign }); }
      else pending.push(node.left, node.right);
    }
    hits.sort((a, b) => a.distance - b.distance);
    const crossings = [];
    for (const h of hits) {
      if (!crossings.length || h.distance - crossings.at(-1).distance > 1e-7) crossings.push(h);
      else { crossings[crossings.length - 1].distance = h.distance; crossings[crossings.length - 1].edge = true; }
    }
    let windingAfter = 0;
    for (let i = 0; i < crossings.length; i++) {
      const { distance: t, edge } = crossings[i];
      // The first event establishes actual multiplicity after the origin,
      // including origins on a tolerance boundary. Subsequent strict crossings
      // add their signed contribution; a two-to-one crossing is not an exit.
      // Ambiguous clusters use an off-surface probe with zero boundary tolerance
      // so even a thin overlap retains its exact signed count.
      if (i > 0 && !edge) windingAfter += crossings[i].step;
      else {
        const probe = t + Math.min(0.00001, ((crossings[i + 1]?.distance ?? Infinity) - t) / 4);
        windingAfter = surface.windingAt(part, x + direction[0] * probe, y + direction[1] * probe, z + direction[2] * probe, 0);
      }
      events.push({ distance: t, part, insideAfter: windingAfter !== 0 });
    }
  }
  events.sort((a, b) => a.distance - b.distance);
  for (let i = 0; i < events.length;) {
    let distance = events[i].distance;
    do { const event = events[i++]; distance = Math.max(distance, event.distance); if (event.insideAfter) active.add(event.part); else active.delete(event.part); }
    while (i < events.length && events[i].distance - distance <= 1e-7);
    if (active.size || distance + padding > maxDistance) continue;
    distance += padding;
    const candidate = [x + direction[0] * distance, y + direction[1] * distance, z + direction[2] * distance];
    if (surfaces.every(s => !s.insideXYZ(...candidate))) return { point: candidate, distance };
  }
  return null;
}

/** Correction to the UNION boundary. Projecting to one part can
 * land inside an overlapping arm/torso and oscillate. Try the nearest exits,
 * their bisectors and 26 spatial directions, bracket a clear point, then retain
 * the shortest verified exit. The independent release query is unchanged. */
export function closestUnionExit(surfaces, point, { padding = 0.002, maxDistance = 0.3 } = {}) {
  const contains = p => surfaces.some(s => s.insideXYZ(p[0], p[1], p[2])), hits = [];
  for (const surface of surfaces) for (const part of surface.components) if (surface.containsPart(part, ...point)) hits.push({ surface, part, near: surface.nearest(point, part) });
  if (!hits.length) return null;
  // Leaving the union requires leaving every containing component. The largest
  // nearest-exit distance is therefore a lower bound. If that component's exact
  // nearest exit also clears the whole union, the lower bound is attained. This
  // handles identical/overlapping near+far body parts without a direction search.
  const farthest = hits.reduce((a, b) => a.near.distance >= b.near.distance ? a : b), delta = sub(farthest.near.point, point), length = Math.hypot(...delta);
  if (length > 1e-12 && length + padding <= maxDistance) {
    const candidate = point.map((v, k) => v + delta[k] * (length + padding) / length);
    if (!contains(candidate)) return { point: candidate, deltaWorld: sub(candidate, point), distance: length + padding, components: hits.map(h => `${h.surface.label}/${h.part.name}`) };
  }
  const directions = [], unit = v => { const len = Math.hypot(...v); return len > 1e-10 ? v.map(n => n / len) : null; };
  const add = v => { const d = unit(v); if (d && !directions.some(a => dot(a, d) > 0.999999)) directions.push(d); };
  for (const h of hits) { add(sub(h.near.point, point)); add(h.near.normal); }
  const nearestCount = directions.length;
  for (let i = 0; i < nearestCount; i++) for (let j = i + 1; j < nearestCount; j++) add(directions[i].map((v, k) => v + directions[j][k]));
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) add([x, y, z]);
  let best = null, distance = maxDistance, lowerBound = Math.max(...hits.map(h => h.near.distance));
  const insideParts = new Set(hits.map(h => h.part));
  for (const d of directions) {
    if (lowerBound + padding > distance) continue;
    const candidate = rayUnionExit(surfaces, point, d, { padding, maxDistance: distance, insideParts });
    if (candidate && candidate.distance < distance) { distance = candidate.distance; best = candidate.point; }
    if (distance <= lowerBound + padding + 0.00005) break;
  }
  // Rare boundary/event degeneracies get the original bounded point-query
  // search. Every candidate still passes the same robust union predicate, then
  // pushOutPose independently re-skins and checks the float32 upload.
  if (!best) for (const d of directions) {
    let lo = 0, hi = Math.max(padding, lowerBound + padding), clear = false;
    if (hi > distance) continue;
    for (;;) {
      if (!contains(point.map((v, k) => v + d[k] * hi))) { clear = true; break; }
      lo = hi; hi = Math.min(distance, hi * 1.35 + 0.0005); if (hi <= lo + 1e-8) break;
    }
    if (!clear) continue;
    for (let i = 0; i < 14 && hi - lo > 0.00002; i++) { const mid = (lo + hi) / 2; if (contains(point.map((v, k) => v + d[k] * mid))) lo = mid; else hi = mid; }
    const length = hi + padding, candidate = point.map((v, k) => v + d[k] * length);
    if (length < distance && !contains(candidate)) { best = candidate; distance = length; }
    if (distance <= lowerBound + padding + 0.00005) break;
  }
  fail(best, 'no union exit within authoring correction radius');
  return { point: best, deltaWorld: sub(best, point), distance, components: hits.map(h => `${h.surface.label}/${h.part.name}`) };
}

// Rare fallback for a skin blend that amplifies the ordinary shortest posed
// exit beyond the bind-space bound. Query actual membership along bounded rays
// instead of accepting that inadmissible exit. Every candidate is rounded to
// the exact float32 upload and must satisfy BOTH original displacement bounds.
function boundedPoseExit(surfaces, point, matrix, evaluate, { padding, maxDistance }) {
  const directions = [], contains = p => surfaces.some(surface => surface.insideXYZ(...p));
  const add = v => {
    const length = Math.hypot(...v); if (length < 1e-12) return;
    const direction = v.map(value => value / length);
    if (!directions.some(other => dot(other, direction) > 0.999999)) directions.push(direction);
  };
  for (const surface of surfaces) for (const part of surface.components) if (surface.containsPart(part, ...point)) {
    const nearest = surface.nearest(point, part); add(sub(nearest.point, point)); add(nearest.normal);
  }
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) {
    add([x, y, z]);
    // Include rays aligned with the bind-space axes/diagonals: a collapsed skin
    // blend's useful direction need not coincide with a posed-space grid ray.
    add([matrix[0] * x + matrix[4] * y + matrix[8] * z, matrix[1] * x + matrix[5] * y + matrix[9] * z, matrix[2] * x + matrix[6] * y + matrix[10] * z]);
  }
  let best = null, bestCost = Infinity;
  const limit = maxDistance - padding, firstStep = Math.min(limit, Math.max(1e-7, Math.min(padding / 2, maxDistance / 64)));
  for (const direction of directions) {
    let lower = 0, length = firstStep;
    for (let step = 0; step < 32; step++) {
      const probe = point.map((value, k) => value + direction[k] * length);
      if (contains(probe)) lower = length;
      else {
        let lo = lower, hi = length;
        for (let iteration = 0; iteration < 18; iteration++) {
          const middle = (lo + hi) / 2;
          if (contains(point.map((value, k) => value + direction[k] * middle))) lo = middle; else hi = middle;
        }
        if (hi + padding <= maxDistance) {
          const candidate = evaluate(direction.map(value => value * (hi + padding)));
          if (candidate.withinBounds && !contains(candidate.point)) {
            const cost = Math.max(candidate.bindMove, candidate.posedMove);
            if (cost < bestCost) { bestCost = cost; best = candidate; }
            break;
          }
        }
      }
      if (length >= limit) break;
      length = Math.min(limit, length * 1.5);
    }
  }
  return best;
}

/** Correct one rendered pose, always bounded from the authored bind positions.
 * An optional CPU pose target supplies an initial Float32 interpolation, but
 * never becomes a new displacement origin. Target plus final push-out must fit
 * inside the same total bind-space AND posed-space bounds for every used vertex.
 * The returned float32 bind positions are the actual GPU upload. Re-skin those
 * rounded values before the independent final inside test: a proposed world
 * correction alone is not evidence that the rendered vertex cleared the body.
 * The optional `out` owns reusable bindPositions/posedPositions arrays. */
export function pushOutPose(garment, matrices, surfaces, { used = null, padding = 0.002, maxDistance = 0.18, out = null } = {}) {
  fail(Array.isArray(surfaces) && surfaces.length > 0, 'pose correction requires actual closed body surfaces');
  fail(Number.isFinite(padding) && padding > 0 && Number.isFinite(maxDistance) && maxDistance > padding, 'invalid pose correction bounds');
  const source = garment.attrs.POSITION;
  used ??= usedVertices(garment);
  const bindPositions = out?.bindPositions ?? new Float32Array(source.length), posedPositions = out?.posedPositions ?? new Float64Array(source.length);
  fail(bindPositions instanceof Float32Array && posedPositions instanceof Float64Array && bindPositions.length === source.length && posedPositions.length === source.length,
    'pose correction output arrays have the wrong type or length');
  fail(bindPositions !== source && bindPositions.buffer !== source.buffer, 'pose correction may not overwrite the authored bind positions');
  bindPositions.set(source);
  const target = garment.poseTarget, targetWeight = target ? evaluatePoseTarget(target, matrices) : 0;
  if (target) fail(target.delta instanceof Float32Array && target.delta.length === source.length, 'pose target delta does not match the immutable base POSITION');
  let originPositions = null;
  if (targetWeight > 0) {
    originPositions = out?.originPositions ?? new Float64Array(source.length);
    fail(originPositions instanceof Float64Array && originPositions.length === source.length && originPositions.buffer !== posedPositions.buffer && originPositions.buffer !== source.buffer,
      'pose target origin output has the wrong type, length or alias');
    skinPositions(garment, matrices, originPositions, used);
    if (out) out.originPositions = originPositions;
  }
  const changed = new Set(), origins = new Map(); let targetCount = 0, pushCount = 0, maxPush = 0, maxBindPush = 0;
  for (const vertex of used) {
    const at = vertex * 3;
    fail(Number.isInteger(vertex) && vertex >= 0 && at + 2 < source.length, 'pose correction has an invalid used vertex');
    let targetChanged = false;
    for (let k = 0; k < 3; k++) {
      fail(Number.isFinite(source[at + k]) && (!target || Number.isFinite(target.delta[at + k])), `non-finite pose target or source at vertex ${vertex}`);
      if (targetWeight > 0) {
        bindPositions[at + k] = source[at + k] + targetWeight * target.delta[at + k];
        if (bindPositions[at + k] !== Math.fround(source[at + k])) targetChanged = true;
      }
    }
    if (targetChanged) { changed.add(vertex); targetCount++; }
  }
  const corrected = { ...garment, attrs: { ...garment.attrs, POSITION: bindPositions } };
  skinPositions(corrected, matrices, posedPositions, used);
  for (const vertex of used) {
    const at = vertex * 3, x = posedPositions[at], y = posedPositions[at + 1], z = posedPositions[at + 2];
    const original = originPositions ? [originPositions[at], originPositions[at + 1], originPositions[at + 2]] : [x, y, z];
    const initialBindMove = Math.hypot(bindPositions[at] - source[at], bindPositions[at + 1] - source[at + 1], bindPositions[at + 2] - source[at + 2]);
    const initialPosedMove = Math.hypot(x - original[0], y - original[1], z - original[2]);
    fail([x, y, z, ...original].every(Number.isFinite) && Number.isFinite(initialBindMove) && Number.isFinite(initialPosedMove), `non-finite posed vertex ${vertex}`);
    // Outside vertices still consume the target budget. Skipping this check
    // would silently allow arbitrary targets whenever no final push was needed.
    fail(initialBindMove <= maxDistance && initialPosedMove <= maxDistance, `pose target exceeds ${maxDistance} m at vertex ${vertex}`);
    maxPush = Math.max(maxPush, initialPosedMove); maxBindPush = Math.max(maxBindPush, initialBindMove);
    let inside = false;
    for (const surface of surfaces) if (surface.insideXYZ(x, y, z)) { inside = true; break; }
    if (!inside) continue;
    if (!originPositions) origins.set(vertex, original);
    let point = [x, y, z], matrix = null, cleared = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      const correction = closestUnionExit(surfaces, point, { padding, maxDistance });
      if (!correction) { cleared = true; break; }
      matrix ??= blendedMatrix(garment.attrs, vertex, matrices);
      const evaluate = deltaWorld => {
        const delta = inverseVector(matrix, deltaWorld), bind = delta.map((value, k) => Math.fround(bindPositions[at + k] + value));
        const posed = transform(matrix, bind), bindMove = Math.hypot(...bind.map((value, k) => value - source[at + k])), posedMove = Math.hypot(...posed.map((value, k) => value - original[k]));
        return { bind, point: posed, bindMove, posedMove, withinBounds: bindMove <= maxDistance && posedMove <= maxDistance };
      };
      let candidate = evaluate(correction.deltaWorld);
      if (!candidate.withinBounds) candidate = boundedPoseExit(surfaces, point, matrix, evaluate, { padding, maxDistance });
      fail(candidate?.withinBounds, `pose correction exceeds ${maxDistance} m at vertex ${vertex}`);
      // Only commit an admissible float32 upload. An invalid proposal never
      // becomes the origin of another correction or increases either bound.
      bindPositions.set(candidate.bind, at); point = candidate.point;
      const { bindMove, posedMove } = candidate;
      maxPush = Math.max(maxPush, posedMove); maxBindPush = Math.max(maxBindPush, bindMove);
      if (!surfaces.some(s => s.insideXYZ(...point))) { cleared = true; break; }
    }
    fail(cleared, `pose correction did not clear vertex ${vertex}`);
    posedPositions.set(point, at); changed.add(vertex); pushCount++;
  }
  // Do not reuse the candidate points as a pass. This re-skins every used vertex
  // whose float32 upload changed and reruns the independent predicate. Other
  // vertices retain their already-tested positions: skinning has no dependence
  // on a neighbour's position, and their weights/matrices/body are unchanged.
  skinPositions(corrected, matrices, posedPositions, Array.from(changed));
  // Recompute total movement from the final uploaded Float32 values, including
  // target-only outside vertices. The origin is immutable even after multiple
  // projections or when a reusable output buffer came from the previous frame.
  maxPush = 0; maxBindPush = 0;
  for (const vertex of used) {
    const at = vertex * 3;
    const original = originPositions ? [originPositions[at], originPositions[at + 1], originPositions[at + 2]] : origins.get(vertex) ?? [posedPositions[at], posedPositions[at + 1], posedPositions[at + 2]];
    const bindMove = Math.hypot(bindPositions[at] - source[at], bindPositions[at + 1] - source[at + 1], bindPositions[at + 2] - source[at + 2]);
    const posedMove = Math.hypot(posedPositions[at] - original[0], posedPositions[at + 1] - original[1], posedPositions[at + 2] - original[2]);
    fail(Number.isFinite(bindMove) && Number.isFinite(posedMove) && bindMove <= maxDistance && posedMove <= maxDistance, `final pose correction exceeds ${maxDistance} m at vertex ${vertex}`);
    maxPush = Math.max(maxPush, posedMove); maxBindPush = Math.max(maxBindPush, bindMove);
    if (changed.has(vertex)) for (const surface of surfaces) fail(!surface.insideXYZ(posedPositions[at], posedPositions[at + 1], posedPositions[at + 2]), `pose correction left vertex ${vertex} inside the body`);
  }
  return { bindPositions, posedPositions, count: changed.size, targetWeight, targetCount, pushCount, maxPush, maxBindPush };
}

export function checkPenetrations(surfaces, garment, positions, matrices, { limit = Infinity, push = false, padding = 0.001, used = null } = {}) {
  const issues = [];
  for (const vertex of used ?? usedVertices(garment)) {
    const offset = vertex * 3;
    for (const surface of surfaces) {
      const part = surface.insideXYZ(positions[offset], positions[offset + 1], positions[offset + 2]); if (!part) continue;
      const problem = { vertex, component: part.name, surface: surface.label };
      if (push) { const p = surface.penetration(at(positions, vertex), padding); Object.assign(problem, p); problem.deltaBind = inverseVector(blendedMatrix(garment.attrs, vertex, matrices), p.deltaWorld); }
      issues.push(problem); break;
    }
    if (issues.length >= limit) break;
  }
  return issues;
}
