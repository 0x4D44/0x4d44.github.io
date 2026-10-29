// Pure path maths for courses (no DOM / WebGL): centripetal Catmull-Rom through control points, uniform arc-length resampling,
// parallel-transport frames (robust through vertical loops), banking, corridor sizes and a hint-based nearest-point projector.
// Owner: world agent. Runs under node:test.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _x = new THREE.Vector3();
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/** Small authoring helper: collects control points + named marks, and can splice a vertical loop into the route. */
export class PathBuilder {
  constructor() { this.pts = []; this.marks = {}; }
  /** add(x,y,z, {bank (deg, additive), hw, hh, mark}) */
  add(x, y, z, o = {}) {
    this.pts.push({ p: [x, y, z], bank: o.bank ?? null, hw: o.hw ?? null, hh: o.hh ?? null });
    if (o.mark) this.marks[o.mark] = this.pts.length - 1;
    return this;
  }
  mark(name, offset = 0) { this.marks[name] = this.pts.length - 1 + offset; return this; }
  last() { return this.pts[this.pts.length - 1].p; }
  /** Insert a vertical loop: entry = last point, heading = unit horizontal direction [dx,dz]. Loop plane is vertical along the heading;
   *  the route drifts `drift` m sideways (+ = right of heading) across the loop so the two passes never touch. */
  loop(heading, { R = 100, drift = 40, n = 12, tail = 90, hw = null, hh = null, mark = 'loop' } = {}) {
    const [x0, y0, z0] = this.last();
    const dx = heading[0], dz = heading[1];
    const sx = -dz, sz = dx;                                         // right = forward x up = (-dz, 0, dx)
    this.mark(mark + 'Entry');
    for (let k = 1; k <= n; k++) {
      const th = (k / n) * Math.PI * 2;
      const f = Math.sin(th) * R, up = (1 - Math.cos(th)) * R, side = drift * (th / (Math.PI * 2));
      this.add(x0 + dx * f + sx * side, y0 + up, z0 + dz * f + sz * side, { hw, hh, mark: k === Math.round(n / 2) ? mark + 'Top' : undefined });
    }
    this.mark(mark + 'Exit');
    const [ex, ey, ez] = this.last();
    this.add(ex + dx * tail, ey, ez + dz * tail, { hw, hh });
    return this;
  }
}

/** A resampled spline with frames. closed=true: a loop (s wraps). closed=false: an open piece (u clamps), with optional ghost points
 *  at both ends (lead/trail) that only shape the tangent and are not part of the sampled range. */
export class PathData {
  /** pts: [{p:[x,y,z], bank, hw, hh}] ; opts: { closed, ds, hw, hh, lead, trail, upStart, upEnd, bankRamp, hwStart,hwEnd,hhStart,hhEnd, autoBank, bankSpeed } */
  constructor(pts, opts = {}) {
    const closed = opts.closed !== false;
    this.closed = closed;
    const lead = closed ? 0 : (opts.lead ?? 0), trail = closed ? 0 : (opts.trail ?? 0);
    const n = pts.length;
    const defHW = opts.hw ?? 100, defHH = opts.hh ?? 70;
    const vecs = pts.map((q) => new THREE.Vector3(q.p[0], q.p[1], q.p[2]));
    const curve = new THREE.CatmullRomCurve3(vecs, closed, 'centripetal');
    this.curve = curve;
    const p0 = closed ? 0 : lead, p1 = closed ? n : n - 1 - trail;       // parameter range in control-index units
    const tOf = (p) => p / (closed ? n : n - 1);

    // ---- dense sampling -> cumulative arc length
    const per = 64, M = Math.round((p1 - p0) * per);
    const dpos = new Float64Array((M + 1) * 3), cum = new Float64Array(M + 1);
    for (let i = 0; i <= M; i++) {
      curve.getPoint(Math.min(1, tOf(p0 + ((p1 - p0) * i) / M)), _v);
      dpos[i * 3] = _v.x; dpos[i * 3 + 1] = _v.y; dpos[i * 3 + 2] = _v.z;
      if (i) cum[i] = cum[i - 1] + Math.hypot(dpos[i * 3] - dpos[i * 3 - 3], dpos[i * 3 + 1] - dpos[i * 3 - 2], dpos[i * 3 + 2] - dpos[i * 3 - 1]);
    }
    const L = cum[M];
    const ds0 = opts.ds ?? 2.5;
    const N = closed ? Math.max(8, Math.round(L / ds0)) : Math.max(4, Math.round(L / ds0)) + 1;   // samples
    const ds = closed ? L / N : L / (N - 1);
    this.length = L; this.N = N; this.ds = ds;

    // ---- uniform resample (position evaluated on the true curve at the interpolated parameter)
    const pos = new Float64Array(N * 3), par = new Float64Array(N);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const target = i * ds;
      while (j < M - 1 && cum[j + 1] < target) j++;
      const seg = cum[j + 1] - cum[j], t = seg > 1e-9 ? Math.min(1, Math.max(0, (target - cum[j]) / seg)) : 0;
      const p = p0 + ((p1 - p0) * (j + t)) / M;
      par[i] = p;
      curve.getPoint(Math.min(1, tOf(p)), _v);
      pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z;
    }
    this.pos = pos; this.par = par;
    const idx = (i) => (closed ? ((i % N) + N) % N : Math.min(N - 1, Math.max(0, i)));

    // ---- tangents (central differences) and curvature vectors
    const tan = new Float64Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = idx(i - 1), b = idx(i + 1);
      _v.set(pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]).normalize();
      tan[i * 3] = _v.x; tan[i * 3 + 1] = _v.y; tan[i * 3 + 2] = _v.z;
    }
    this.tan = tan;
    const curv = new Float64Array(N), turn = new Float64Array(N);       // |kappa| (1/m) and signed yaw rate (+ = turning right), horizontal-weighted
    const K = 3;
    for (let i = 0; i < N; i++) {
      const a = idx(i - K), b = idx(i + K);
      const dxT = tan[b * 3] - tan[a * 3], dyT = tan[b * 3 + 1] - tan[a * 3 + 1], dzT = tan[b * 3 + 2] - tan[a * 3 + 2];
      const span = (closed ? 2 * K : idx(i + K) - idx(i - K)) * ds || 1;
      curv[i] = Math.hypot(dxT, dyT, dzT) / span;
      // heading psi = atan2(tx, -tz) (0 = north/-Z, + toward +X = turning right). yaw rate = dpsi/ds
      const tx0 = tan[a * 3], tz0 = tan[a * 3 + 2], tx1 = tan[b * 3], tz1 = tan[b * 3 + 2];
      const h0 = Math.hypot(tx0, tz0), h1 = Math.hypot(tx1, tz1);
      let yaw = 0;
      if (h0 > 0.05 && h1 > 0.05) {
        const cr = -(tx0 * -tz1 - -tz0 * tx1) / (h0 * h1);              // sin(dpsi): + = turning right (clockwise seen from above)
        const dt = (tx0 * tx1 + tz0 * tz1) / (h0 * h1);
        yaw = Math.atan2(cr, dt) / span;
      }
      const hf = Math.min(h0, h1);
      turn[i] = yaw * hf * hf;
    }
    this.curv = curv; this.turn = turn;

    // ---- attribute interpolation at control-index parameter
    const attrAt = (p, key, def) => {
      const m = pts.length;
      let i0 = Math.floor(p), f = p - i0;
      const ia = closed ? ((i0 % m) + m) % m : Math.min(m - 1, Math.max(0, i0)), ib = closed ? ((i0 + 1) % m) : Math.min(m - 1, i0 + 1);
      // walk back/forward to the nearest control points that define the attribute, so partial specs interpolate sensibly
      const find = (start, dir) => { for (let k = 0; k < m; k++) { const q = pts[closed ? (((start + dir * k) % m) + m) % m : Math.min(m - 1, Math.max(0, start + dir * k))]; if (q[key] != null) return q[key]; } return def; };
      const va = pts[ia][key] != null ? pts[ia][key] : find(ia, -1), vb = pts[ib][key] != null ? pts[ib][key] : find(ib, 1);
      return va + (vb - va) * smooth(f);
    };
    const hwA = new Float32Array(N), hhA = new Float32Array(N), bankAdd = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      hwA[i] = attrAt(par[i], 'hw', defHW); hhA[i] = attrAt(par[i], 'hh', defHH);
      // bank offsets default to 0 (not "inherit")
      const m = pts.length, i0 = Math.floor(par[i]), f = par[i] - i0;
      const ia = closed ? ((i0 % m) + m) % m : Math.min(m - 1, Math.max(0, i0)), ib = closed ? ((i0 + 1) % m) : Math.min(m - 1, i0 + 1);
      const va = pts[ia].bank ?? 0, vb = pts[ib].bank ?? 0;
      bankAdd[i] = ((va + (vb - va) * smooth(f)) * Math.PI) / 180;
    }

    // ---- ends of open pieces: taper corridor to the supplied host values
    if (!closed) {
      const taper = opts.taper ?? 140;
      for (let i = 0; i < N; i++) {
        const u = i * ds, e = Math.min(u, L - u);
        const w = smooth(e / taper);
        const hs = u < L / 2 ? [opts.hwStart, opts.hhStart] : [opts.hwEnd, opts.hhEnd];
        if (hs[0] != null) hwA[i] = hs[0] + (hwA[i] - hs[0]) * w;
        if (hs[1] != null) hhA[i] = hs[1] + (hhA[i] - hs[1]) * w;
      }
    }

    // ---- parallel transport frames
    const up = new Float64Array(N * 3);
    const upStart = opts.upStart ? opts.upStart.clone() : WORLD_UP.clone();
    {
      _w.set(tan[0], tan[1], tan[2]);
      _v.copy(upStart).addScaledVector(_w, -upStart.dot(_w));
      if (_v.lengthSq() < 1e-6) _v.set(0, 0, -1).addScaledVector(_w, _w.z);
      _v.normalize();
      up[0] = _v.x; up[1] = _v.y; up[2] = _v.z;
      const upc = _v.clone(), ta = new THREE.Vector3(), tb = new THREE.Vector3(), ax = new THREE.Vector3();
      const steps = closed ? N : N - 1;
      for (let i = 1; i <= steps; i++) {
        const ia = idx(i - 1), ib = idx(i);
        ta.set(tan[ia * 3], tan[ia * 3 + 1], tan[ia * 3 + 2]); tb.set(tan[ib * 3], tan[ib * 3 + 1], tan[ib * 3 + 2]);
        ax.crossVectors(ta, tb);
        const sn = ax.length();
        if (sn > 1e-9) { ax.divideScalar(sn); upc.applyAxisAngle(ax, Math.atan2(sn, ta.dot(tb))); }
        upc.addScaledVector(tb, -upc.dot(tb)).normalize();
        if (i < N) { up[i * 3] = upc.x; up[i * 3 + 1] = upc.y; up[i * 3 + 2] = upc.z; }
      }
      if (closed) {
        // Pin the frame to the horizon wherever the path is not near-vertical; across loops the residual twist is interpolated.
        const delta = new Float64Array(N), valid = new Uint8Array(N);
        for (let i = 0; i < N; i++) {
          _w.set(tan[i * 3], tan[i * 3 + 1], tan[i * 3 + 2]); _v.set(up[i * 3], up[i * 3 + 1], up[i * 3 + 2]);
          _x.copy(WORLD_UP).addScaledVector(_w, -_w.y).normalize();
          if (Math.abs(_w.y) < 0.55 && _v.dot(_x) > 0.3) {
            _x.copy(WORLD_UP).addScaledVector(_w, -_w.y).normalize();
            const sn = new THREE.Vector3().crossVectors(_v, _x).dot(_w);
            delta[i] = Math.atan2(sn, _v.dot(_x)); valid[i] = 1;
          }
        }
        let any = -1; for (let i = 0; i < N; i++) if (valid[i]) { any = i; break; }
        if (any >= 0) {
          for (let i = 0; i < N; i++) {
            if (valid[i]) continue;
            let a2 = 1; while (!valid[((i - a2) % N + N) % N]) a2++;
            let b2 = 1; while (!valid[(i + b2) % N]) b2++;
            const va = delta[((i - a2) % N + N) % N], vb = delta[(i + b2) % N], w = smooth(a2 / (a2 + b2));
            delta[i] = va + (vb - va) * w;
          }
          for (let i = 0; i < N; i++) {
            _w.set(tan[i * 3], tan[i * 3 + 1], tan[i * 3 + 2]); _v.set(up[i * 3], up[i * 3 + 1], up[i * 3 + 2]);
            _v.applyAxisAngle(_w, delta[i]); up[i * 3] = _v.x; up[i * 3 + 1] = _v.y; up[i * 3 + 2] = _v.z;
          }
        }
      }
      // holonomy / end-frame correction: twist about the tangent so the far end meets the target up
      const target = closed ? null : opts.upEnd ? opts.upEnd.clone() : null;
      if (target) {
        const last = idx(steps);
        tb.set(tan[last * 3], tan[last * 3 + 1], tan[last * 3 + 2]);
        const tgt = target.clone().addScaledVector(tb, -target.dot(tb)).normalize();
        const sinA = new THREE.Vector3().crossVectors(upc, tgt).dot(tb), cosA = upc.dot(tgt);
        const phi = Math.atan2(sinA, cosA);
        for (let i = 0; i < N; i++) {
          const w = closed ? i / N : smooth(i / (N - 1));
          _v.set(up[i * 3], up[i * 3 + 1], up[i * 3 + 2]);
          _w.set(tan[i * 3], tan[i * 3 + 1], tan[i * 3 + 2]);
          _v.applyAxisAngle(_w, phi * w);
          up[i * 3] = _v.x; up[i * 3 + 1] = _v.y; up[i * 3 + 2] = _v.z;
        }
      }
    }

    // ---- bank = smoothed automatic bank from yaw rate + authored offsets; then rotate the frame about the tangent
    const autoBank = opts.autoBank ?? 0.6, vB = opts.bankSpeed ?? 95, maxBank = opts.maxBank ?? 1.0;
    const rawBank = new Float64Array(N);
    for (let i = 0; i < N; i++) rawBank[i] = autoBank * Math.atan((vB * vB * turn[i]) / 18);
    const bank = new Float32Array(N), W = Math.max(1, Math.round(45 / ds));
    for (let i = 0; i < N; i++) {
      let a = 0, c = 0;
      for (let k = -W; k <= W; k++) { const q = closed ? ((i + k) % N + N) % N : i + k; if (q < 0 || q >= N) continue; const wt = 1 - Math.abs(k) / (W + 1); a += rawBank[q] * wt; c += wt; }
      let b = a / c;
      if (!closed) b *= smooth(Math.min(i * ds, L - i * ds) / (opts.bankRamp ?? 60));    // no auto bank right at a junction
      b = Math.max(-maxBank, Math.min(maxBank, b)) + bankAdd[i];
      bank[i] = b;
    }
    const upB = new Float64Array(N * 3), right = new Float64Array(N * 3);
    for (let i = 0; i < N; i++) {
      _w.set(tan[i * 3], tan[i * 3 + 1], tan[i * 3 + 2]);
      _v.set(up[i * 3], up[i * 3 + 1], up[i * 3 + 2]);
      // bank is only the *extra* twist when the frame is the junction-blended branch frame; for closed paths it is the full bank
      // up' = up cos b + right sin b ; right = tangent x up
      _x.crossVectors(_w, _v).normalize();
      const cb = Math.cos(bank[i]), sb = Math.sin(bank[i]);
      _v.multiplyScalar(cb).addScaledVector(_x, sb).normalize();
      _x.crossVectors(_w, _v).normalize();
      upB[i * 3] = _v.x; upB[i * 3 + 1] = _v.y; upB[i * 3 + 2] = _v.z;
      right[i * 3] = _x.x; right[i * 3 + 1] = _x.y; right[i * 3 + 2] = _x.z;
    }
    this.up = upB; this.right = right; this.bank = bank; this.hw = hwA; this.hh = hhA;
    this._f = null;
  }

  /** s -> fractional sample index, handling wrap (closed) / clamp (open). Returns i0 and t via this._i0/_t. */
  _locate(s) {
    const N = this.N, L = this.length;
    if (this.closed) { s = ((s % L) + L) % L; } else s = s < 0 ? 0 : s > L ? L : s;
    const x = s / this.ds;
    let i0 = Math.floor(x);
    if (this.closed) { i0 %= N; } else if (i0 >= N - 1) i0 = N - 2;
    this._t = x - Math.floor(x); if (!this.closed && s >= L) this._t = 1;
    this._i0 = i0; this._i1 = this.closed ? (i0 + 1) % N : i0 + 1;
    return s;
  }

  /** Frame at arc length s: fills out{pos,tangent,up,right,halfWidth,halfHeight,bank,curvature,turn}. Allocates missing vectors only. */
  frameAt(s, out) {
    this._locate(s);
    const a = this._i0, b = this._i1, t = this._t, P = this.pos, T = this.tan, U = this.up;
    (out.pos ||= new THREE.Vector3()).set(P[a * 3] + (P[b * 3] - P[a * 3]) * t, P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * t, P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * t);
    (out.tangent ||= new THREE.Vector3()).set(T[a * 3] + (T[b * 3] - T[a * 3]) * t, T[a * 3 + 1] + (T[b * 3 + 1] - T[a * 3 + 1]) * t, T[a * 3 + 2] + (T[b * 3 + 2] - T[a * 3 + 2]) * t).normalize();
    (out.up ||= new THREE.Vector3()).set(U[a * 3] + (U[b * 3] - U[a * 3]) * t, U[a * 3 + 1] + (U[b * 3 + 1] - U[a * 3 + 1]) * t, U[a * 3 + 2] + (U[b * 3 + 2] - U[a * 3 + 2]) * t);
    // re-orthonormalise: up -= (up.t) t
    out.up.addScaledVector(out.tangent, -out.up.dot(out.tangent)).normalize();
    (out.right ||= new THREE.Vector3()).crossVectors(out.tangent, out.up).normalize();
    out.halfWidth = this.hw[a] + (this.hw[b] - this.hw[a]) * t;
    out.halfHeight = this.hh[a] + (this.hh[b] - this.hh[a]) * t;
    out.bank = this.bank[a] + (this.bank[b] - this.bank[a]) * t;
    out.curvature = this.curv[a] + (this.curv[b] - this.curv[a]) * t;
    out.turn = this.turn[a] + (this.turn[b] - this.turn[a]) * t;
    return out;
  }

  /** Nearest point projection. closed: hintS windowed (±windowM) unless null/non-finite -> full scan. open: always full scan.
   *  out gets s (wrapped to [0,L) for closed), lateral (+right), vertical (+up), dist. Returns out. */
  project(pos, hintS, out, windowM = 130) {
    const N = this.N, P = this.pos, ds = this.ds, L = this.length, closed = this.closed;
    const px = pos.x, py = pos.y, pz = pos.z;
    let best = Infinity, bi = 0;
    const scan = (i) => {
      const dx = P[i * 3] - px, dy = P[i * 3 + 1] - py, dz = P[i * 3 + 2] - pz, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < best) { best = d2; bi = i; }
    };
    if (closed && hintS != null && isFinite(hintS)) {
      const c = Math.round((((hintS % L) + L) % L) / ds), w = Math.min(Math.ceil(windowM / ds), (N >> 1) - 1);
      for (let k = -w; k <= w; k++) scan((((c + k) % N) + N) % N);
    } else for (let i = 0; i < N; i++) scan(i);

    // Newton refinement of  f(s) = (pos - P(s)) . T(s) = 0  using interpolated frames
    const f = this._pf || (this._pf = {});
    let s = bi * ds;
    for (let it = 0; it < 3; it++) {
      this.frameAt(s, f);
      const ex = px - f.pos.x, ey = py - f.pos.y, ez = pz - f.pos.z;
      let step = ex * f.tangent.x + ey * f.tangent.y + ez * f.tangent.z;
      // d/ds of f is -(1 - kappa * (offset toward the centre of curvature)); approximate with the straight-line step, damped near high curvature
      step = Math.max(-ds * 4, Math.min(ds * 4, step));
      s += step;
      if (!closed) { s = Math.max(0, Math.min(L, s)); }
      if (Math.abs(step) < 1e-3) break;
    }
    this.frameAt(s, f);
    const ex = px - f.pos.x, ey = py - f.pos.y, ez = pz - f.pos.z;
    out.s = closed ? ((s % L) + L) % L : s;
    out.lateral = ex * f.right.x + ey * f.right.y + ez * f.right.z;
    out.vertical = ex * f.up.x + ey * f.up.y + ez * f.up.z;
    out.dist = Math.hypot(ex, ey, ez);
    return out;
  }

  /** Control-index parameter -> arc length (monotonic search over resampled params). */
  sAtParam(p) {
    const par = this.par, N = this.N;
    if (p <= par[0]) return 0;
    if (p >= par[N - 1]) return (N - 1) * this.ds + 0;
    let lo = 0, hi = N - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (par[m] <= p) lo = m; else hi = m; }
    return (lo + (p - par[lo]) / (par[hi] - par[lo])) * this.ds;
  }
}
