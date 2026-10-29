// Geometry accumulator: collects non-indexed triangles with per-vertex colour, then makes a BufferGeometry.
export class Geo {
  constructor(THREE) {
    this.T = THREE;
    this.p = []; this.n = []; this.uv = []; this.c = [];
    this._m = new THREE.Matrix4(); this._nm = new THREE.Matrix3(); this._v = new THREE.Vector3();
    this._o = new THREE.Object3D();
  }
  get triCount() { return this.p.length / 9; }
  append(o) { for (const k of ["p","n","uv","c"]) { const a=this[k], b=o[k]; for (let i=0;i<b.length;i++) a.push(b[i]); } return this; }
  /** Raw vertex push. */
  vert(x, y, z, nx, ny, nz, u = 0, v = 0, r = 1, g = 1, b = 1) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v); this.c.push(r, g, b);
  }
  /** Add an existing THREE geometry transformed by `m`, tinted by `color` (hex or null = white). */
  add(geometry, m = null, color = 0xffffff) {
    const T = this.T;
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    const col = new T.Color(color);
    const nm = this._nm;
    if (m) nm.getNormalMatrix(m);
    const v = this._v;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (m) v.applyMatrix4(m);
      this.p.push(v.x, v.y, v.z);
      if (nor) {
        v.fromBufferAttribute(nor, i);
        if (m) v.applyMatrix3(nm).normalize();
        this.n.push(v.x, v.y, v.z);
      } else this.n.push(0, 1, 0);
      if (this.fixUV) this.uv.push(this.fixUV[0], this.fixUV[1]); else this.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      this.c.push(col.r, col.g, col.b);
    }
    if (g !== geometry) g.dispose();
    return this;
  }
  /** Matrix from position / euler(xyz) / scale. */
  mat(px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    const o = this._o;
    o.position.set(px, py, pz); o.rotation.set(rx, ry, rz); o.scale.set(sx, sy, sz);
    o.updateMatrix();
    return this._m.copy(o.matrix);
  }
  box(w, h, d, px, py, pz, color, rx = 0, ry = 0, rz = 0, seg = 1) {
    return this.add(new this.T.BoxGeometry(w, h, d, seg, seg, seg), this.mat(px, py, pz, rx, ry, rz), color);
  }
  /** Rounded-ish slab: a box with bevelled look via a scaled sphere-capped cylinder is overkill; use box. */
  cyl(rTop, rBot, h, px, py, pz, color, rx = 0, ry = 0, rz = 0, seg = 16) {
    return this.add(new this.T.CylinderGeometry(rTop, rBot, h, seg, 1), this.mat(px, py, pz, rx, ry, rz), color);
  }
  sphere(r, px, py, pz, color, sx = 1, sy = 1, sz = 1, seg = 14) {
    return this.add(new this.T.SphereGeometry(r, seg, Math.max(6, seg >> 1)), this.mat(px, py, pz, 0, 0, 0, sx, sy, sz), color);
  }
  /** Tube along an array of [x,y,z] points. */
  tube(points, radius, color, seg = 6, curved = true) {
    const T = this.T;
    const pts = points.map((p) => new T.Vector3(p[0], p[1], p[2]));
    const path = curved ? new T.CatmullRomCurve3(pts, false, "centripetal") : new T.CatmullRomCurve3(pts, false, "catmullrom", 0);
    const g = new T.TubeGeometry(path, Math.max(2, pts.length * (curved ? 6 : 1)), radius, seg, false);
    return this.add(g, null, color);
  }
  /**
   * Tube along a path whose radius varies: `rf(u)` for u in 0..1 along the path (0 at an end = a closed, rounded tip).
   * Parallel-transport frames, smooth normals.
   */
  tubeR(points, rf, color, seg = 8, curved = true, n = 0) {
    const T = this.T;
    const pts = points.map((p) => new T.Vector3(p[0], p[1], p[2]));
    const path = curved ? new T.CatmullRomCurve3(pts, false, "centripetal") : new T.CatmullRomCurve3(pts, false, "catmullrom", 0);
    n = n || Math.max(10, pts.length * 8);
    const c = new T.Color(color), rows = [];
    let N = null;
    for (let i = 0; i <= n; i++) {
      const u = i / n, p = path.getPointAt(u), t = path.getTangentAt(u).normalize();
      if (!N) { N = Math.abs(t.y) < 0.9 ? new T.Vector3(0, 1, 0) : new T.Vector3(1, 0, 0); }
      N = N.clone().sub(t.clone().multiplyScalar(N.dot(t))).normalize();
      const B = new T.Vector3().crossVectors(t, N), r = rf(u), row = [];
      for (let j = 0; j < seg; j++) {
        const a = (j / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const nx = N.x * ca + B.x * sa, ny = N.y * ca + B.y * sa, nz = N.z * ca + B.z * sa;
        row.push([p.x + nx * r, p.y + ny * r, p.z + nz * r, nx, ny, nz]);
      }
      rows.push(row);
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg, A = rows[i][j], Bq = rows[i][j2], C = rows[i + 1][j2], D = rows[i + 1][j];
      for (const q of [A, Bq, C, A, C, D]) this.vert(q[0], q[1], q[2], q[3], q[4], q[5], 0, 0, c.r, c.g, c.b);
    }
    return this;
  }
  /** Flat quad strip between two polylines (a[i], b[i]) with an up-ish normal. */
  strip(a, b, color, flip = false) {
    const T = this.T; const c = new T.Color(color);
    const e1 = new T.Vector3(), e2 = new T.Vector3(), nn = new T.Vector3();
    for (let i = 0; i < a.length - 1; i++) {
      const p0 = a[i], p1 = a[i + 1], p2 = b[i + 1], p3 = b[i];
      e1.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
      e2.set(p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]);
      nn.crossVectors(e1, e2).normalize();
      if (flip) nn.negate();
      for (const q of [p0, p1, p2, p0, p2, p3]) this.vert(q[0], q[1], q[2], nn.x, nn.y, nn.z, 0, 0, c.r, c.g, c.b);
    }
    return this;
  }
  /**
   * Extrude a closed 2D profile (array of [z, y], counter-clockwise with z to the right and y up) along x from xa to xb.
   * Side walls get smooth normals from the profile; the two caps are flat. `uv` pins every vertex to one atlas texel
   * (paint colour), `tz` / `ty` optionally shear the far end (for tapered plates).
   */
  extrude(profile, xa, xb, color, uv = [0.003, 0.003]) {
    const T = this.T, c = new T.Color(color), n = profile.length;
    const nrm = profile.map((p, i) => {
      const a = profile[(i + n - 1) % n], b = profile[(i + 1) % n];
      const dz = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dz, dy) || 1;
      return [-dy / l, dz / l]; // outward (ny, nz) for a CCW profile
    });
    const v = (x, p, k, nx = 0, ny = nrm[k][0], nz = nrm[k][1]) => this.vert(x, p[1], p[0], nx, ny, nz, uv[0], uv[1], c.r, c.g, c.b);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, p = profile[i], q = profile[j];
      v(xa, p, i); v(xb, p, i); v(xb, q, j);
      v(xa, p, i); v(xb, q, j); v(xa, q, j);
    }
    let cz = 0, cy = 0;
    for (const p of profile) { cz += p[0] / n; cy += p[1] / n; }
    for (let i = 0; i < n; i++) {
      const p = profile[i], q = profile[(i + 1) % n];
      this.vert(xa, cy, cz, -1, 0, 0, uv[0], uv[1], c.r, c.g, c.b); this.vert(xa, q[1], q[0], -1, 0, 0, uv[0], uv[1], c.r, c.g, c.b); this.vert(xa, p[1], p[0], -1, 0, 0, uv[0], uv[1], c.r, c.g, c.b);
      this.vert(xb, cy, cz, 1, 0, 0, uv[0], uv[1], c.r, c.g, c.b); this.vert(xb, p[1], p[0], 1, 0, 0, uv[0], uv[1], c.r, c.g, c.b); this.vert(xb, q[1], q[0], 1, 0, 0, uv[0], uv[1], c.r, c.g, c.b);
    }
    return this;
  }
  /** Build a BufferGeometry (computes bounds). */
  build(withColor = true) {
    const T = this.T;
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute("normal", new T.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute("uv", new T.BufferAttribute(new Float32Array(this.uv), 2));
    if (withColor) g.setAttribute("color", new T.BufferAttribute(new Float32Array(this.c), 3));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
