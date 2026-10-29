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
      this.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
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
