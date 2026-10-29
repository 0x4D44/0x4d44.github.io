// Base terrain function T(x,z) and the 0.5 m height grid that becomes plan.heightAt.
// Pure data; no THREE. The hill rises toward -z (north): ~0 m at z=+100, ~30 m at z=-100.
import { clamp, lerp, ss, vnoise } from './geom.js';

export const HALF = 100, CELL = 0.5, N = 401;

/** Analytic base terrain (smooth). Deterministic per seed. */
export function makeBaseTerrain(seed) {
  // y(z): integral of a slope profile (rise per metre going north), y(100) = 0.
  const z0 = -140, z1 = 140, dz = 0.25, n = Math.round((z1 - z0) / dz) + 1;
  const slope = (z) => {
    let s = 0.022;
    s += (0.235 - 0.022) * ss(74, 58, z);        // toe -> hill face
    s -= (0.235 - 0.05) * ss(-38, -58, z);       // face -> summit plateau
    s -= 0.012 * ss(-82, -100, z);
    return s;
  };
  const U = new Float64Array(n);
  for (let i = 1; i < n; i++) { const za = z0 + (i - 1) * dz, zb = za + dz; U[i] = U[i - 1] + 0.5 * (slope(za) + slope(zb)) * dz; }
  const U100 = U[Math.round((100 - z0) / dz)];
  const eOfZ = (z) => {
    const f = (clamp(z, z0, z1 - 1e-6) - z0) / dz, i = Math.floor(f), t = f - i;
    return U100 - (U[i] * (1 - t) + U[i + 1] * t);   // north (small z) is higher
  };
  return function T(x, z) {
    const west = 3.2 * ss(-28, -98, x) * ss(70, 10, z);
    const gully = -1.8 * Math.exp(-(((x - 86) / 8) ** 2)) * ss(75, 25, z);
    const calm = 0.35 + 0.65 * ss(75, 55, z);
    const noise = (0.4 * vnoise(x, z, 28, seed) + 0.12 * vnoise(x + 50, z - 30, 9, seed + 7)) * calm;
    return eOfZ(z) + west + gully + noise;
  };
}

/** The height grid. H[iz*N+ix] is the height at x = -100+ix*CELL, z = -100+iz*CELL. */
export function createField(T) {
  const H = new Float32Array(N * N);
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) H[iz * N + ix] = T(-HALF + ix * CELL, -HALF + iz * CELL);
  const f = {
    H, T,
    sample(x, z) {
      const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
      if (fx < 0 || fx > N - 1 || fz < 0 || fz > N - 1) {
        const cx = clamp(x, -HALF, HALF), cz = clamp(z, -HALF, HALF);
        return f.sample(cx, cz) + (T(x, z) - T(cx, cz));
      }
      const ix = Math.min(N - 2, Math.floor(fx)), iz = Math.min(N - 2, Math.floor(fz)), tx = fx - ix, tz = fz - iz, i = iz * N + ix;
      return H[i] * (1 - tx) * (1 - tz) + H[i + 1] * tx * (1 - tz) + H[i + N] * (1 - tx) * tz + H[i + N + 1] * tx * tz;
    },
    /** Visit every grid node inside a world bbox: cb(i, x, z). */
    nodes(x0, z0, x1, z1, cb) {
      const i0 = clamp(Math.floor((x0 + HALF) / CELL), 0, N - 1), i1 = clamp(Math.ceil((x1 + HALF) / CELL), 0, N - 1);
      const j0 = clamp(Math.floor((z0 + HALF) / CELL), 0, N - 1), j1 = clamp(Math.ceil((z1 + HALF) / CELL), 0, N - 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cb(j * N + i, -HALF + i * CELL, -HALF + j * CELL);
    },
    /** h = lerp(h, target, w) for one node. */
    blend(i, target, w) { if (w > 0) H[i] = lerp(H[i], target, w > 1 ? 1 : w); },
  };
  return f;
}
