// Arc-length sampling of a closed track polyline.
export class Track {
  constructor(def, key) {
    this.key = key; this.def = def; this.name = def.name || key;
    const p = def.points; this.n = p.length;
    this.x = new Float64Array(this.n); this.y = new Float64Array(this.n); this.z = new Float64Array(this.n); this.s = new Float64Array(this.n);
    let acc = 0, okS = true;
    for (let i = 0; i < this.n; i++) {
      this.x[i] = p[i].x; this.y[i] = p[i].y; this.z[i] = p[i].z;
      if (i) acc += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y, p[i].z - p[i - 1].z);
      this.s[i] = acc;
      if (!Number.isFinite(p[i].s) || (i && p[i].s < p[i - 1].s)) okS = false;
    }
    const offs = okS ? p[0].s : 0;
    if (okS) for (let i = 0; i < this.n; i++) this.s[i] = p[i].s - offs;
    this.offset = offs;
    const closeD = Math.hypot(p[0].x - p[this.n - 1].x, p[0].y - p[this.n - 1].y, p[0].z - p[this.n - 1].z);
    this.length = this.s[this.n - 1] + (def.closed === false ? 0 : closeD);
    this.closed = def.closed !== false;
  }
  index(s) {
    s = this.closed ? ((s % this.length) + this.length) % this.length : Math.max(0, Math.min(this.length, s));
    let lo = 0, hi = this.n - 1;
    if (s >= this.s[hi]) return { i: hi, j: this.closed ? 0 : hi, t: (s - this.s[hi]) / Math.max(1e-6, this.length - this.s[hi]), s };
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.s[m] <= s) lo = m; else hi = m; }
    return { i: lo, j: hi, t: (s - this.s[lo]) / Math.max(1e-6, this.s[hi] - this.s[lo]), s };
  }
  /** position & unit tangent at chainage s */
  at(s, out = {}) {
    const { i, j, t } = this.index(s);
    out.x = this.x[i] + (this.x[j] - this.x[i]) * t; out.y = this.y[i] + (this.y[j] - this.y[i]) * t; out.z = this.z[i] + (this.z[j] - this.z[i]) * t;
    // tangent from a short central difference for smoothness
    const a = this.index(s - 6), b = this.index(s + 6);
    let tx = (this.x[b.j] * b.t + this.x[b.i] * (1 - b.t)) - (this.x[a.j] * a.t + this.x[a.i] * (1 - a.t));
    let ty = (this.y[b.j] * b.t + this.y[b.i] * (1 - b.t)) - (this.y[a.j] * a.t + this.y[a.i] * (1 - a.t));
    let tz = (this.z[b.j] * b.t + this.z[b.i] * (1 - b.t)) - (this.z[a.j] * a.t + this.z[a.i] * (1 - a.t));
    const l = Math.hypot(tx, ty, tz) || 1; out.tx = tx / l; out.ty = ty / l; out.tz = tz / l; out.s = s; return out;
  }
  nearest(x, z, y = null) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < this.n; i++) { const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2 + (y == null ? 0 : (this.y[i] - y) ** 2); if (d < bd) { bd = d; bi = i; } }
    return { i: bi, s: this.s[bi], dist: Math.sqrt(bd) };
  }
  stopS(stationId) { const st = this.def.stops?.find((q) => q.station === stationId); return st ? st.s - this.offset : null; }
}
