// Track: dense, smooth, closed polyline with chainage s (metres), pose / gradient / curvature
// queries, speed limit profile and a braking-curve "safe speed" profile.
import { KMH, G, clamp, lerp, smoothstep, wrapL, wrapAngle } from './util.js';

const RESAMPLE = 2.0; // metres between internal nodes

function cumulative(pts) {
  const n = pts.length, c = new Float64Array(n);
  for (let i = 1; i < n; i++) c[i] = c[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
  return c;
}

export class Track {
  /**
   * @param raw  { points:[{x,y,z,s}], stops:[{station,s,dwellS}], speedLimits:[{s0,s1,kmh}], name, direction }
   * @param opts { maxKmh, latAccel, platformLen, trainLen, straighten:true, brakeProfile }
   */
  constructor(raw, opts = {}) {
    this.name = raw.name || 'Track';
    this.direction = raw.direction || '';
    this.opts = Object.assign({ maxKmh: 55, latAccel: 1.1, platformLen: 50, trainLen: 39, straighten: true, brakeProfile: 0.8, platformKmh: 45 }, opts);
    let src = raw.points.map((p) => ({ x: p.x, y: p.y, z: p.z, s: p.s }));
    // drop duplicated closing node
    const f = src[0], l = src[src.length - 1];
    if (src.length > 3 && Math.hypot(f.x - l.x, f.z - l.z) < 3) src.pop();
    const rawCum = cumulative(src);
    const closeGap = Math.hypot(src[0].x - src[src.length - 1].x, src[0].y - src[src.length - 1].y, src[0].z - src[src.length - 1].z);
    const L = rawCum[src.length - 1] + closeGap;
    this.length = L;
    // raw chainage -> internal chainage map (piecewise linear). Falls back to identity.
    const rawS = src.map((p, i) => (Number.isFinite(p.s) ? p.s : rawCum[i]));
    for (let i = 1; i < rawS.length; i++) if (rawS[i] < rawS[i - 1]) { for (let j = 0; j < rawS.length; j++) rawS[j] = rawCum[j]; break; }
    const rawLen = rawS[rawS.length - 1] + (rawS.length > 1 ? (rawS[rawS.length - 1] - rawS[rawS.length - 2]) : 0);
    this._mapRaw = (s) => {
      s = wrapL(s - rawS[0], rawLen) + rawS[0];
      let lo = 0, hi = rawS.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (rawS[m] <= s) lo = m; else hi = m; }
      const span = rawS[hi] - rawS[lo] || 1;
      const t = clamp((s - rawS[lo]) / span, 0, 1.0001);
      return lerp(rawCum[lo], rawCum[hi], Math.min(t, 1));
    };
    // resample to uniform spacing by closed Catmull-Rom
    const n = Math.max(8, Math.round(L / RESAMPLE));
    this.n = n; this.ds = L / n;
    const X = new Float64Array(n), Y = new Float64Array(n), Z = new Float64Array(n);
    const m = src.length;
    const P = (i) => src[((i % m) + m) % m];
    let seg = 0;
    for (let k = 0; k < n; k++) {
      const s = k * this.ds;
      while (seg < m - 1 && rawCum[seg + 1] <= s) seg++;
      const a = rawCum[seg], b = seg + 1 < m ? rawCum[seg + 1] : L;
      const t = b > a ? clamp((s - a) / (b - a), 0, 1) : 0;
      const p0 = P(seg - 1), p1 = P(seg), p2 = P(seg + 1), p3 = P(seg + 2);
      const cr = (q0, q1, q2, q3) => 0.5 * ((2 * q1) + (-q0 + q2) * t + (2 * q0 - 5 * q1 + 4 * q2 - q3) * t * t + (-q0 + 3 * q1 - 3 * q2 + q3) * t * t * t);
      X[k] = cr(p0.x, p1.x, p2.x, p3.x); Y[k] = cr(p0.y, p1.y, p2.y, p3.y); Z[k] = cr(p0.z, p1.z, p2.z, p3.z);
    }
    this.X = X; this.Y = Y; this.Z = Z;
    // stops / limits in internal chainage
    const platLen = this.opts.platformLen, trainLen = this.opts.trainLen;
    this.stops = (raw.stops || []).map((st, i) => ({ ...st, index: i, s: wrapL(this._mapRaw(st.s), L), dwellS: st.dwellS || 25 }));
    this.limitsRaw = (raw.speedLimits || []).map((q) => ({ s0: wrapL(this._mapRaw(q.s0), L), s1: wrapL(this._mapRaw(q.s1), L), kmh: q.kmh }));
    if (this.opts.straighten) this._straighten(trainLen, platLen);
    this._tangents();
    this._curvGrade();
    this._speedProfile();
  }

  _straighten(trainLen, platLen) {
    const { X, Y, Z, n, ds, length: L } = this;
    const half = Math.max(platLen, trainLen + 6) / 2 + 22, fade = 45;
    const R0 = { X: X.slice(), Y: Y.slice(), Z: Z.slice() };
    for (const st of this.stops) {
      const sc = st.s - trainLen / 2;
      const k0 = Math.round(wrapL(sc, L) / ds) % n;
      const kk = Math.round(30 / ds);
      const a = (k0 - kk + n) % n, b = (k0 + kk) % n;
      let tx = R0.X[b] - R0.X[a], tz = R0.Z[b] - R0.Z[a]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const px = R0.X[k0], pz = R0.Z[k0], py = R0.Y[k0];
      const reach = Math.ceil((half + fade) / ds);
      for (let j = -reach; j <= reach; j++) {
        const k = (k0 + j + n) % n, d = j * ds, ad = Math.abs(d);
        const w = ad <= half ? 1 : 1 - smoothstep(half, half + fade, ad);
        const sx = px + tx * d, sz = pz + tz * d;
        X[k] = lerp(R0.X[k], sx, w); Z[k] = lerp(R0.Z[k], sz, w); Y[k] = lerp(R0.Y[k], py, w);
      }
      st.straight = { cx: px, cz: pz, tx, tz, y: py };
    }
  }

  _tangents() {
    const { X, Y, Z, n } = this;
    let TX = new Float64Array(n), TY = new Float64Array(n), TZ = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n, b = (i + 1) % n;
      TX[i] = X[b] - X[a]; TY[i] = Y[b] - Y[a]; TZ[i] = Z[b] - Z[a];
    }
    for (let pass = 0; pass < 2; pass++) {
      const nx = new Float64Array(n), ny = new Float64Array(n), nz = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const a = (i - 1 + n) % n, b = (i + 1) % n;
        nx[i] = TX[a] + 2 * TX[i] + TX[b]; ny[i] = TY[a] + 2 * TY[i] + TY[b]; nz[i] = TZ[a] + 2 * TZ[i] + TZ[b];
      }
      TX = nx; TY = ny; TZ = nz;
    }
    for (let i = 0; i < n; i++) { const l = Math.hypot(TX[i], TY[i], TZ[i]) || 1; TX[i] /= l; TY[i] /= l; TZ[i] /= l; }
    this.TX = TX; this.TY = TY; this.TZ = TZ;
  }

  _curvGrade() {
    const { n, ds, TX, TZ, Y } = this;
    const K = new Float64Array(n), Gd = new Float64Array(n);
    const span = Math.max(1, Math.round(10 / ds));
    for (let i = 0; i < n; i++) {
      const a = (i - span + n) % n, b = (i + span) % n;
      const ha = Math.atan2(TX[a], -TZ[a]), hb = Math.atan2(TX[b], -TZ[b]);
      K[i] = wrapAngle(hb - ha) / (2 * span * ds);
      Gd[i] = (Y[b] - Y[a]) / (2 * span * ds);
    }
    this.K = K; this.Gd = Gd;
  }

  _idx(s) {
    s = wrapL(s, this.length);
    const f = s / this.ds; let i = Math.floor(f);
    if (i >= this.n) i = this.n - 1;
    return [i, f - i];
  }

  /** Fills out with x,y,z (position), tx,ty,tz (unit tangent), returns out. */
  pose(s, out = {}) {
    const [i, t] = this._idx(s), j = (i + 1) % this.n, ds = this.ds;
    const t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    out.x = h00 * this.X[i] + h10 * ds * this.TX[i] + h01 * this.X[j] + h11 * ds * this.TX[j];
    out.y = h00 * this.Y[i] + h10 * ds * this.TY[i] + h01 * this.Y[j] + h11 * ds * this.TY[j];
    out.z = h00 * this.Z[i] + h10 * ds * this.TZ[i] + h01 * this.Z[j] + h11 * ds * this.TZ[j];
    let tx = lerp(this.TX[i], this.TX[j], t), ty = lerp(this.TY[i], this.TY[j], t), tz = lerp(this.TZ[i], this.TZ[j], t);
    const l = Math.hypot(tx, ty, tz) || 1;
    out.tx = tx / l; out.ty = ty / l; out.tz = tz / l;
    return out;
  }
  gradient(s) { const [i, t] = this._idx(s); return lerp(this.Gd[i], this.Gd[(i + 1) % this.n], t); }
  curvature(s) { const [i, t] = this._idx(s); return lerp(this.K[i], this.K[(i + 1) % this.n], t); }

  /** signed distance ahead from s to target (0..L), wraps */
  ahead(s, target) { return wrapL(target - s, this.length); }

  _speedProfile() {
    const L = this.length, ds = 2, N = Math.ceil(L / ds); this.gds = L / N; this.gN = N;
    const o = this.opts, vmax = o.maxKmh * KMH;
    const lim = new Float32Array(N).fill(vmax);
    const inRange = (s, a, b) => (a <= b ? s >= a && s <= b : s >= a || s <= b);
    for (let i = 0; i < N; i++) {
      const s = i * this.gds;
      for (const q of this.limitsRaw) if (inRange(s, q.s0, q.s1) && q.kmh * KMH < lim[i]) lim[i] = q.kmh * KMH;
    }
    // curves: window max curvature +-18 m
    const w = Math.round(18 / this.gds);
    for (let i = 0; i < N; i++) {
      let kmax = 0;
      for (let j = -w; j <= w; j += 2) kmax = Math.max(kmax, Math.abs(this.curvature(((i + j + N) % N) * this.gds)));
      if (kmax > 1e-4) lim[i] = Math.min(lim[i], Math.max(6 * KMH * 2, Math.sqrt(o.latAccel / kmax)));
    }
    // platforms: lower limit near stops
    const pk = o.platformKmh * KMH;
    for (const st of this.stops) {
      const lo = st.s - 140, hi = st.s + 60;
      for (let i = 0; i < N; i++) {
        const s = i * this.gds, d = wrapL(s - lo, L);
        if (d <= hi - lo) lim[i] = Math.min(lim[i], pk);
      }
    }
    this.vlim = lim;
    // backward braking-curve pass (cyclic, no stops): safe lookahead profile
    const safe = Float32Array.from(lim), a = o.brakeProfile;
    for (let pass = 0; pass < 3; pass++) {
      for (let i = N - 1; i >= 0; i--) {
        const nx = safe[(i + 1) % N];
        const v = Math.sqrt(nx * nx + 2 * a * this.gds);
        if (v < safe[i]) safe[i] = v;
      }
    }
    this.vsafe = safe;
  }
  _grid(arr, s) { const f = wrapL(s, this.length) / this.gds; const i = Math.floor(f) % this.gN; return lerp(arr[i], arr[(i + 1) % this.gN], f - Math.floor(f)); }
  /** posted speed limit (m/s) at s */
  limit(s) { return this._grid(this.vlim, s); }
  /** max speed (m/s) allowing braking to later limits (service brake 0.8 m/s2) */
  safeSpeed(s) { return this._grid(this.vsafe, s); }
}
