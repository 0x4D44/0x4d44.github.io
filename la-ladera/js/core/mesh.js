// MeshBuilder + Batcher: the one way static geometry gets into the scene.
//
// Procedural architecture creates thousands of boxes; making a THREE.BufferGeometry per box and
// merging them is slow and memory-hungry. A MeshBuilder instead appends vertices straight into
// per-material arrays, and `Batcher.flush` turns each (group, material) into ONE mesh.
//
// Conventions (see dev/CONTRACT.md):
//  * UVs are in METRES of the builder's local frame (1 uv unit = 1 m) so that tiling textures keep
//    a constant real-world scale and continue across adjacent boxes. Materials declare `tile`
//    (metres per texture repeat); `uv:'unit'` materials (decals) pass explicit 0..1 UVs via o.uv.
//  * Positions are written in the builder's BASE frame: set it with setBase(matrix) (e.g. the
//    building-local -> world matrix) and author geometry in local coordinates.
//  * matKey = material name, optionally tinted: 'plaster_a' or 'plaster_a#d9a441'.
import * as THREE from 'three';

const _c = new THREE.Color();
const UP = [0, 1, 0];

function rgb(c) {
  if (c == null) return [1, 1, 1];
  if (Array.isArray(c)) return c;
  _c.setHex(c); return [_c.r, _c.g, _c.b];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export class MeshBuilder {
  constructor() {
    this.accs = new Map();
    this.m = new THREE.Matrix4();
    this.nm = new THREE.Matrix3();
    this.baseIdentity = true;
    this.uvOff = [0, 0];       // per-building offset so identical textures do not line up between buildings
    this.tris = 0;
  }

  /** Base frame: everything added afterwards is transformed by `matrix` on the way out. */
  setBase(matrix) {
    this.m.copy(matrix); this.nm.getNormalMatrix(this.m);
    this.baseIdentity = matrix.equals(new THREE.Matrix4());
    return this;
  }
  /** Convenience: base frame = translate(x,y,z) * rotY(ry). */
  setBasePose(x, y, z, ry = 0) {
    return this.setBase(new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z));
  }

  _acc(key) {
    let a = this.accs.get(key);
    if (!a) this.accs.set(key, a = { pos: [], nor: [], uv: [], col: [], idx: [] });
    return a;
  }

  /** Low-level: add one vertex (local coords) with explicit normal/uv/colour; returns its index. */
  vert(acc, p, n, u, v, c) {
    const e = this.m.elements, ne = this.nm.elements;
    const i = acc.pos.length / 3;
    if (this.baseIdentity) {
      acc.pos.push(p[0], p[1], p[2]); acc.nor.push(n[0], n[1], n[2]);
    } else {
      acc.pos.push(
        e[0] * p[0] + e[4] * p[1] + e[8] * p[2] + e[12],
        e[1] * p[0] + e[5] * p[1] + e[9] * p[2] + e[13],
        e[2] * p[0] + e[6] * p[1] + e[10] * p[2] + e[14]);
      const nx = ne[0] * n[0] + ne[3] * n[1] + ne[6] * n[2];
      const ny = ne[1] * n[0] + ne[4] * n[1] + ne[7] * n[2];
      const nz = ne[2] * n[0] + ne[5] * n[1] + ne[8] * n[2];
      const l = Math.hypot(nx, ny, nz) || 1;
      acc.nor.push(nx / l, ny / l, nz / l);
    }
    acc.uv.push(u, v); acc.col.push(c[0], c[1], c[2]);
    return i;
  }

  /**
   * One planar quad, corners a,b,c,d counter-clockwise as seen from the FRONT (outside) face.
   * o: { uv:[u0,v0,...u3,v3] explicit | default metric projection, col, cols:[4 colours], uvScale }
   */
  quad(matKey, a, b, c, d, o = {}) {
    const acc = this._acc(matKey);
    const n = norm(cross(sub(c, a), sub(d, b)));
    let uvs = o.uv;
    if (!uvs) {
      let e1 = cross(UP, n);
      e1 = (Math.hypot(e1[0], e1[1], e1[2]) < 1e-4) ? [1, 0, 0] : norm(e1);
      const e2 = cross(n, e1);
      const s = o.uvScale ?? 1, [ou, ov] = this.uvOff;
      uvs = [];
      for (const p of [a, b, c, d]) uvs.push(dot(p, e1) * s + ou, dot(p, e2) * s + ov);
    }
    const cols = o.cols ? o.cols.map(rgb) : null, c0 = cols ? null : rgb(o.col);
    const i0 = this.vert(acc, a, n, uvs[0], uvs[1], cols ? cols[0] : c0);
    this.vert(acc, b, n, uvs[2], uvs[3], cols ? cols[1] : c0);
    this.vert(acc, c, n, uvs[4], uvs[5], cols ? cols[2] : c0);
    this.vert(acc, d, n, uvs[6], uvs[7], cols ? cols[3] : c0);
    acc.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    this.tris += 2;
  }

  tri(matKey, a, b, c, o = {}) {
    const acc = this._acc(matKey);
    const n = norm(cross(sub(b, a), sub(c, a)));
    let e1 = cross(UP, n);
    e1 = (Math.hypot(e1[0], e1[1], e1[2]) < 1e-4) ? [1, 0, 0] : norm(e1);
    const e2 = cross(n, e1), col = rgb(o.col), [ou, ov] = this.uvOff;
    const uv = o.uv ?? [a, b, c].flatMap((p) => [dot(p, e1) + ou, dot(p, e2) + ov]);
    const i0 = this.vert(acc, a, n, uv[0], uv[1], col);
    this.vert(acc, b, n, uv[2], uv[3], col);
    this.vert(acc, c, n, uv[4], uv[5], col);
    acc.idx.push(i0, i0 + 1, i0 + 2);
    this.tris += 1;
  }

  /**
   * Axis-aligned box (in the local frame), optionally rotated about Y around its centre.
   * mats: 'name' for all faces, or { all, px, nx, py, ny, pz, nz } (px = +x face ...).
   * o: { ry, skip:['ny',...], col, cols (applies to every face) , uvScale }
   */
  box(mats, cx, cy, cz, sx, sy, sz, o = {}) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2, ry = o.ry ?? 0;
    const cs = Math.cos(ry), sn = Math.sin(ry);
    const P = (x, y, z) => [cx + x * cs + z * sn, cy + y, cz - x * sn + z * cs];
    const x0 = -hx, x1 = hx, y0 = -hy, y1 = hy, z0 = -hz, z1 = hz;
    const faces = {
      px: [P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1)],
      nx: [P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)],
      pz: [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)],
      nz: [P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0)],
      py: [P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)],
      ny: [P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)],
    };
    const skip = o.skip ? new Set(o.skip) : null;
    for (const f in faces) {
      if (skip && skip.has(f)) continue;
      const k = typeof mats === 'string' ? mats : (mats[f] ?? mats.all);
      if (!k) continue;
      const q = faces[f];
      this.quad(k, q[0], q[1], q[2], q[3], o);
    }
  }

  /** Box given by two opposite corners (any order). */
  boxMinMax(mats, x0, y0, z0, x1, y1, z1, o = {}) {
    this.box(mats, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), o);
  }

  /** Upright cylinder/cone frustum with smooth side normals. o: { r1 (top radius), caps:true, col, seg } */
  cyl(matKey, cx, cy, cz, r, h, seg = 12, o = {}) {
    const acc = this._acc(matKey), r1 = o.r1 ?? r, col = rgb(o.col), [ou, ov] = this.uvOff;
    const slope = (r - r1) / h, base = acc.pos.length / 3;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a), nn = norm([cs, slope, sn]);
      const u = (a * r) + ou;
      this.vert(acc, [cx + cs * r, cy, cz + sn * r], nn, u, ov, col);
      this.vert(acc, [cx + cs * r1, cy + h, cz + sn * r1], nn, u, h + ov, col);
    }
    for (let i = 0; i < seg; i++) {
      const a = base + i * 2;
      acc.idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    this.tris += seg * 2;
    if (o.caps !== false) {
      for (const [yy, rr, up] of [[cy + h, r1, true], [cy, r, false]]) {
        if (rr <= 1e-4) continue;
        const nn = up ? [0, 1, 0] : [0, -1, 0], c0 = this.vert(acc, [cx, yy, cz], nn, ou, ov, col);
        for (let i = 0; i <= seg; i++) {
          const a = (i / seg) * Math.PI * 2;
          this.vert(acc, [cx + Math.cos(a) * rr, yy, cz + Math.sin(a) * rr], nn, Math.cos(a) * rr + ou, Math.sin(a) * rr + ov, col);
        }
        for (let i = 0; i < seg; i++) { if (up) acc.idx.push(c0, c0 + i + 2, c0 + i + 1); else acc.idx.push(c0, c0 + i + 1, c0 + i + 2); }
        this.tris += seg;
      }
    }
  }

  /**
   * Extruded polygon: floor slabs, platforms, plazas. outline = [[x,z],...]; holes = [[[x,z],...],...].
   * mats: string or { top, bottom, side, all }. y0..y1 = bottom..top. o: { col, skip:['top','bottom','side'] }
   */
  slab(mats, outline, holes, y0, y1, o = {}) {
    const mk = (f) => (typeof mats === 'string' ? mats : (mats[f] ?? mats.all));
    const skip = o.skip ? new Set(o.skip) : null;
    const loops = [outline, ...(holes ?? [])];
    const col = rgb(o.col), [ou, ov] = this.uvOff;
    for (const [face, y, ny] of [['top', y1, 1], ['bottom', y0, -1]]) {
      const key = mk(face); if (!key || (skip && skip.has(face))) continue;
      const acc = this._acc(key), flat = [], verts = [];
      for (const l of loops) for (const p of l) { verts.push(p); flat.push(new THREE.Vector2(p[0], p[1])); }
      const contour = flat.slice(0, outline.length), hs = []; let k = outline.length;
      for (const h of holes ?? []) { hs.push(flat.slice(k, k + h.length)); k += h.length; }
      const tris = THREE.ShapeUtils.triangulateShape(contour, hs);
      const base = acc.pos.length / 3;
      for (const p of verts) this.vert(acc, [p[0], y, p[1]], [0, ny, 0], p[0] + ou, (ny > 0 ? -p[1] : p[1]) + ov, col);
      for (const t of tris) {
        const a = verts[t[0]], b = verts[t[1]], c = verts[t[2]];
        const cz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);   // + => CCW in (x,z) math orientation => normal -y
        const upFacing = cz < 0;
        if (upFacing === (ny > 0)) acc.idx.push(base + t[0], base + t[1], base + t[2]);
        else acc.idx.push(base + t[0], base + t[2], base + t[1]);
      }
      this.tris += tris.length;
    }
    const sk = mk('side');
    if (sk && !(skip && skip.has('side'))) {
      loops.forEach((l, li) => {
        let area = 0; for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; area += p[0] * q[1] - q[0] * p[1]; }
        const outward = (li === 0) === (area > 0);       // true: outward normal is the RIGHT of the edge direction
        for (let i = 0; i < l.length; i++) {
          const p = l[i], q = l[(i + 1) % l.length];
          const A = [p[0], y0, p[1]], B = [q[0], y0, q[1]], C = [q[0], y1, q[1]], D = [p[0], y1, p[1]];
          // quad(a,b,c,d) yields the LEFT normal of p->q; reverse the edge when we need the right one
          if (outward) this.quad(sk, B, A, D, C, o); else this.quad(sk, A, B, C, D, o);
        }
      });
    }
  }

  /** Copy an existing BufferGeometry (e.g. a GLB part) through `matrix` into this builder. */
  geometry(matKey, geo, matrix, o = {}) {
    const acc = this._acc(matKey), col = rgb(o.col);
    const pa = geo.attributes.position, na = geo.attributes.normal, ua = geo.attributes.uv, ca = geo.attributes.color;
    const mm = matrix ?? new THREE.Matrix4(), nmm = new THREE.Matrix3().getNormalMatrix(mm);
    const p = new THREE.Vector3(), n = new THREE.Vector3(), base = acc.pos.length / 3;
    for (let i = 0; i < pa.count; i++) {
      p.fromBufferAttribute(pa, i).applyMatrix4(mm);
      if (na) n.fromBufferAttribute(na, i).applyMatrix3(nmm).normalize(); else n.set(0, 1, 0);
      this.vert(acc, [p.x, p.y, p.z], [n.x, n.y, n.z], ua ? ua.getX(i) : 0, ua ? ua.getY(i) : 0, ca ? [ca.getX(i), ca.getY(i), ca.getZ(i)] : col);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) acc.idx.push(base + geo.index.getX(i));
    else for (let i = 0; i < pa.count; i++) acc.idx.push(base + i);
    this.tris += (geo.index ? geo.index.count : pa.count) / 3;
  }

  get empty() { return this.accs.size === 0; }

  /** Build one Mesh per material key and add them to `parent`. Clears the builder. */
  flush(parent, ctx, o = {}) {
    const out = [];
    for (const [key, a] of this.accs) {
      if (!a.idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(a.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(a.col, 3));
      const n = a.pos.length / 3;
      g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(a.idx, 1) : new THREE.Uint16BufferAttribute(a.idx, 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, ctx.mat(key));
      mesh.name = `${o.name ?? 'batch'}:${key}`;
      mesh.castShadow = o.cast ?? true; mesh.receiveShadow = o.receive ?? true;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      mesh.userData.matKey = key; mesh.userData.groupId = o.name;
      parent.add(mesh); out.push(mesh);
    }
    this.accs.clear(); this.tris = 0;
    return out;
  }
}

/**
 * Named groups, each with an Object3D (visibility-toggleable) and a MeshBuilder.
 * Naming: building exterior `b<id>.ext`, interior `b<id>.int`, world pieces `world.<what>`.
 */
export class Batcher {
  constructor(ctx) { this.ctx = ctx; this.groups = new Map(); }
  group(id, o = {}) {
    let g = this.groups.get(id);
    if (!g) {
      const obj = new THREE.Group(); obj.name = id;
      (o.parent ?? this.ctx.scene).add(obj);
      g = { id, obj, builder: new MeshBuilder(), cast: o.cast ?? true, receive: o.receive ?? true, meshes: [] };
      this.groups.set(id, g);
    }
    return g;
  }
  builder(id, o) { return this.group(id, o).builder; }
  object(id) { return this.group(id).obj; }
  flush(id) {
    const g = this.groups.get(id); if (!g) return [];
    const ms = g.builder.flush(g.obj, this.ctx, { name: id, cast: g.cast, receive: g.receive });
    g.meshes.push(...ms); return ms;
  }
  flushAll() { for (const id of this.groups.keys()) this.flush(id); }
  stats() {
    let meshes = 0, tris = 0;
    for (const g of this.groups.values()) for (const m of g.meshes) { meshes++; tris += m.geometry.index.count / 3; }
    return { groups: this.groups.size, meshes, tris };
  }
}
