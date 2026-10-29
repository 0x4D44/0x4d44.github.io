// Private test track for the DYNAMICS lane: a minimal Stage-API implementation built from a curvature
// profile. Used to develop and test physics/bot independently of the STAGES lane.
import { SURFACE } from "../core/surfaces.mjs";

export function makeTestStage(o = {}) {
  const ds = 2;
  const length = o.length || 1000;
  const N = Math.floor(length / ds) + 1;
  const curvFn = o.curv || (() => 0);
  const widthFn = typeof o.width === "function" ? o.width : () => o.width || 8;
  const surfFn = typeof o.surf === "function" ? o.surf : () => (o.surf === undefined ? SURFACE.GRAVEL : o.surf);
  const heightFn = o.height || (() => 0);
  const px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N);
  const tx = new Float32Array(N), tz = new Float32Array(N), curv = new Float32Array(N);
  const slope = new Float32Array(N), widthA = new Float32Array(N), bank = new Float32Array(N);
  const surf = new Uint8Array(N), verge = new Uint8Array(N);
  let x = 0, z = 0, yaw = 0;
  for (let i = 0; i < N; i++) {
    const s = i * ds;
    px[i] = x; pz[i] = z;
    tx[i] = -Math.sin(yaw); tz[i] = -Math.cos(yaw);
    curv[i] = curvFn(s);
    widthA[i] = widthFn(s);
    surf[i] = surfFn(s);
    verge[i] = SURFACE.GRASS;
    py[i] = heightFn(x, z);
    x += tx[i] * ds; z += tz[i] * ds;
    yaw -= curv[i] * ds;
  }
  for (let i = 0; i < N - 1; i++) slope[i] = (py[i + 1] - py[i]) / ds;
  const obstacles = o.obstacles || [];
  const stage = {
    id: "test", lengthM: (N - 1) * ds, ds, N, px, py, pz, tx, tz, slope, width: widthA, curv, bank, surf, verge,
    startPose: { x: px[0], y: py[0], z: pz[0], yaw: 0 },
    hazards: [], props: [], pacenotes: [], checkpoints: [], parTime: 100,
    heightAt(xx, zz) { return heightFn(xx, zz); },
    normalAt(xx, zz, out = { x: 0, y: 1, z: 0 }) {
      const e = 0.4;
      const dx = heightFn(xx + e, zz) - heightFn(xx - e, zz);
      const dz = heightFn(xx, zz + e) - heightFn(xx, zz - e);
      const nx = -dx / (2 * e), nz = -dz / (2 * e);
      const l = Math.sqrt(nx * nx + 1 + nz * nz);
      out.x = nx / l; out.y = 1 / l; out.z = nz / l;
      return out;
    },
    project(xx, zz, hint, out = {}) {
      let lo = 0, hi = N - 2;
      if (hint !== undefined && hint !== null) {
        const hi0 = Math.round(hint / ds);
        lo = Math.max(0, hi0 - 25); hi = Math.min(N - 2, hi0 + 25);
      }
      let best = 1e18, bi = lo, bt = 0;
      for (let i = lo; i <= hi; i++) {
        const ax = px[i], az = pz[i];
        const bx = px[i + 1] - ax, bz = pz[i + 1] - az;
        let t = ((xx - ax) * bx + (zz - az) * bz) / (bx * bx + bz * bz);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = ax + bx * t - xx, cz = az + bz * t - zz;
        const d = cx * cx + cz * cz;
        if (d < best) { best = d; bi = i; bt = t; }
      }
      const cxp = px[bi] + (px[bi + 1] - px[bi]) * bt, czp = pz[bi] + (pz[bi + 1] - pz[bi]) * bt;
      const ttx = tx[bi] + (tx[bi + 1] - tx[bi]) * bt, ttz = tz[bi] + (tz[bi + 1] - tz[bi]) * bt;
      const tl = Math.hypot(ttx, ttz) || 1;
      out.tx = ttx / tl; out.tz = ttz / tl;
      out.s = (bi + bt) * ds;
      out.lat = (xx - cxp) * -out.tz + (zz - czp) * out.tx;
      out.dist = Math.sqrt(best);
      out.x = cxp; out.y = py[bi]; out.z = czp;
      return out;
    },
    sample(s, out = {}) {
      s = s < 0 ? 0 : s > (N - 1) * ds ? (N - 1) * ds : s;
      const f = s / ds, i = Math.min(N - 2, Math.floor(f)), t = f - i;
      const l = (a) => a[i] + (a[i + 1] - a[i]) * t;
      out.s = s; out.x = l(px); out.y = l(py); out.z = l(pz);
      const ttx = l(tx), ttz = l(tz), tl = Math.hypot(ttx, ttz) || 1;
      out.tx = ttx / tl; out.tz = ttz / tl; out.nx = -out.tz; out.nz = out.tx;
      out.width = l(widthA); out.curv = l(curv); out.bank = l(bank); out.slope = l(slope);
      out.surf = surf[t < 0.5 ? i : i + 1]; out.verge = SURFACE.GRASS;
      out.heading = Math.atan2(-out.tx, -out.tz);
      return out;
    },
    surfaceAt(xx, zz) {
      const p = stage.project(xx, zz, undefined, {});
      if (Math.abs(p.lat) < widthA[Math.round(p.s / ds)] * 0.5) return surf[Math.round(p.s / ds)];
      return o.verge === undefined ? SURFACE.GRASS : o.verge;
    },
    boundaryAt(s, out = {}) { out.left = o.boundary || 8; out.right = o.boundary || 8; return out; },
    obstaclesNear(xx, zz, r, out = []) {
      for (const ob of obstacles) {
        const dx = ob.x - xx, dz = ob.z - zz;
        if (dx * dx + dz * dz < (r + ob.r) * (r + ob.r)) out.push(ob);
      }
      return out;
    },
  };
  return stage;
}

export const flatStage = (surf = SURFACE.GRAVEL, length = 3000) => makeTestStage({ length, surf, width: 12, boundary: 400 });

/** A twisty course: [length, curvature] segments with smooth transitions. */
export function makeTestCourse(surf = SURFACE.GRAVEL, scale = 1) {
  const segs = [
    [150, 0], [60, 1 / 90], [40, 0], [70, -1 / 50], [30, 0], [50, 1 / 25], [20, -1 / 120], [120, 0], [90, -1 / 70],
    [60, 1 / 45], [80, 0], [40, -1 / 15], [60, 1 / 35], [100, 0], [100, 1 / 140], [50, -1 / 22], [60, 1 / 60], [250, 0],
    [70, 1 / 18], [40, 0], [90, -1 / 40], [30, 1 / 30], [200, 0],
  ];
  const marks = [];
  let acc = 0;
  for (const [l, c] of segs) { marks.push([acc, acc + l, c * scale]); acc += l; }
  const total = acc;
  const curv = (s) => {
    for (let i = 0; i < marks.length; i++) {
      const [a, b, c] = marks[i];
      if (s >= a && s < b) {
        const e = Math.min(s - a, b - s);
        const k = Math.min(1, e / 12);
        return c * k;
      }
    }
    return 0;
  };
  return makeTestStage({ length: total, curv, surf, width: 9, boundary: 6 });
}
