// Biome-shaped, deterministic terrain that blends smoothly into the road bed.
// heightAt(x, z) = land (noise + road-following offset field + authored shapes) blended into the
// cross-section of the road (camber, shoulder, ditch) by distance from the centreline.
// Pure, no THREE, no DOM, no allocation in the hot path.

import { clamp, lerp, smoothstep } from "./mathx.mjs";
import { hash2 } from "./rng.mjs";
import { SURFACE as SF } from "./surfaces.mjs";

// ---------------------------------------------------------------- noise
export function noise2(x, z, seed = 0) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  const ab = a + (b - a) * ux, cd = c + (d - c) * ux;
  return (ab + (cd - ab) * uz) * 2 - 1;
}
export function fbm2(x, z, seed = 0, oct = 4) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise2(x * f, z * f, seed + i * 31);
    n += a; a *= 0.5; f *= 2.02;
  }
  return s / n;
}
export function ridged2(x, z, seed = 0, oct = 4) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    const v = 1 - Math.abs(noise2(x * f, z * f, seed + i * 47));
    s += a * v * v;
    n += a; a *= 0.5; f *= 2.1;
  }
  return s / n;
}

// ---------------------------------------------------------------- biome parameters
export const BIOME_TERRAIN = {
  pasture: { amp: 15, wl: 520, det: 2.4, detWl: 60, warp: 90, ridge: 0, blend: 18, ditch: 0.3, shoulder: 1.4, bound: 12 },
  redwood: { amp: 9, wl: 230, det: 1.8, detWl: 40, warp: 40, ridge: 0, blend: 12, ditch: 0.35, shoulder: 1.2, bound: 5.5 },
  coast: { amp: 11, wl: 380, det: 1.4, detWl: 50, warp: 70, ridge: 0, blend: 14, ditch: 0.2, shoulder: 1.3, bound: 8 },
  tussock: { amp: 26, wl: 900, det: 3.2, detWl: 80, warp: 120, ridge: 14, ridgeWl: 320, blend: 20, ditch: 0.2, shoulder: 1.5, bound: 14 },
  alpine: { amp: 18, wl: 300, det: 2.5, detWl: 50, warp: 60, ridge: 0, blend: 16, ditch: 0.15, shoulder: 1.2, bound: 9, massif: { amp: 260, r0: 80, r1: 380, wl: 700 } },
  rainforest: { amp: 26, wl: 260, det: 2.2, detWl: 45, warp: 60, ridge: 0, blend: 12, ditch: 0.4, shoulder: 1.1, bound: 5.5, massif: { amp: 140, r0: 40, r1: 220, wl: 420 } },
};

export const SEA_LEVEL = 0;
const FIELD_CELL = 32;
const OFF_CELL = 16;
const OFF_R = 64;

/**
 * @param c       compiled centreline (spline.mjs)
 * @param idx     road index (createRoadIndex)
 * @param biome   biome key
 * @param shapes  resolved shape rules [{kind, side, s0, s1, fade, start, ramp, amount, farFade?}]
 * @param streams [{s0, s1, y, reach, depth}]
 */
export function createTerrain(c, idx, biome, shapes, streams, seedBase = 77) {
  const P = BIOME_TERRAIN[biome] || BIOME_TERRAIN.pasture;
  const { N, ds, px, pz, py, width, curv, bank, surf, verge } = c;
  const B = idx.bounds;
  let ySum = 0;
  for (let i = 0; i < N; i++) ySum += py[i];
  const level = ySum / N;
  const sd1 = seedBase + 11, sd2 = seedBase + 23, sd3 = seedBase + 37, sd4 = seedBase + 53, sd5 = seedBase + 71;

  // -------- raw land noise
  const M = P.massif;
  function landNoise(x, z, dist) {
    const wx = x + P.warp * noise2(x / 330, z / 330, sd1);
    const wz = z + P.warp * noise2(x / 330 + 40, z / 330 - 17, sd2);
    let h = P.amp * fbm2(wx / P.wl, wz / P.wl, sd3, 4) + P.det * fbm2(x / P.detWl, z / P.detWl, sd4, 3);
    if (P.ridge) h += P.ridge * (ridged2(wx / P.ridgeWl, wz / P.ridgeWl, sd5, 3) - 0.45);
    if (M) {
      const m = smoothstep(M.r0, M.r1, dist);
      if (m > 0) h += m * M.amp * (0.25 + 0.75 * ridged2(wx / M.wl, wz / M.wl, sd5 + 5, 4));
    }
    return levelAt(x, z) + h;
  }

  // -------- coarse signed-distance field (lat, s) on a grid; brute force on a sparse polyline
  const fPad = 300;
  const fX0 = B.minX - fPad, fZ0 = B.minZ - fPad;
  const fW = Math.ceil((B.maxX - B.minX + 2 * fPad) / FIELD_CELL) + 1;
  const fH = Math.ceil((B.maxZ - B.minZ + 2 * fPad) / FIELD_CELL) + 1;
  const fLat = new Float32Array(fW * fH), fS = new Float32Array(fW * fH), fLev = new Float32Array(fW * fH);
  {
    const step = 8;
    const ids = [];
    for (let i = 0; i < N; i += step) ids.push(i);
    if (ids[ids.length - 1] !== N - 1) ids.push(N - 1);
    for (let cz = 0; cz < fH; cz++) {
      const z = fZ0 + cz * FIELD_CELL;
      for (let cx = 0; cx < fW; cx++) {
        const x = fX0 + cx * FIELD_CELL;
        let best = Infinity, bl = 0, bs = 0, by = 0;
        for (let k = 0; k < ids.length - 1; k++) {
          const i = ids[k], j = ids[k + 1];
          const ax = px[i], az = pz[i], dx = px[j] - ax, dz = pz[j] - az;
          const l2 = dx * dx + dz * dz;
          let t = ((x - ax) * dx + (z - az) * dz) / l2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = ax + dx * t - x, qz = az + dz * t - z;
          const d = qx * qx + qz * qz;
          if (d < best) {
            best = d;
            const l = Math.sqrt(l2);
            bl = (-qx) * (-dz / l) + (-qz) * (dx / l); // (p - q) . right
            bs = (i + (j - i) * t) * ds;
            by = py[i] + (py[j] - py[i]) * t;
          }
        }
        // sign: keep magnitude as true distance
        const dist = Math.sqrt(best);
        fLat[cz * fW + cx] = bl >= 0 ? dist : -dist;
        fS[cz * fW + cx] = bs;
        fLev[cz * fW + cx] = by;
      }
    }
    // blur the nearest-road elevation into a smooth regional level (kills medial-axis steps)
    const tmp = new Float32Array(fW * fH);
    const R = 4;
    for (let pass = 0; pass < 3; pass++) {
      for (let cz = 0; cz < fH; cz++) {
        for (let cx = 0; cx < fW; cx++) {
          let sum = 0;
          for (let k = -R; k <= R; k++) sum += fLev[cz * fW + Math.min(fW - 1, Math.max(0, cx + k))];
          tmp[cz * fW + cx] = sum / (2 * R + 1);
        }
      }
      for (let cz = 0; cz < fH; cz++) {
        for (let cx = 0; cx < fW; cx++) {
          let sum = 0;
          for (let k = -R; k <= R; k++) sum += tmp[Math.min(fH - 1, Math.max(0, cz + k)) * fW + cx];
          fLev[cz * fW + cx] = sum / (2 * R + 1);
        }
      }
    }
  }
  function levelAt(x, z) {
    let fx = (x - fX0) / FIELD_CELL, fz = (z - fZ0) / FIELD_CELL;
    fx = fx < 0 ? 0 : fx > fW - 1.001 ? fW - 1.001 : fx;
    fz = fz < 0 ? 0 : fz > fH - 1.001 ? fH - 1.001 : fz;
    const ix = fx | 0, iz = fz | 0;
    fx -= ix; fz -= iz;
    const i00 = iz * fW + ix, i10 = i00 + 1, i01 = i00 + fW, i11 = i01 + 1;
    return fLev[i00] * (1 - fx) * (1 - fz) + fLev[i10] * fx * (1 - fz) + fLev[i01] * (1 - fx) * fz + fLev[i11] * fx * fz;
  }
  const C0 = { lat: 0, s: 0 };
  function coarseAt(x, z, out) {
    let fx = (x - fX0) / FIELD_CELL, fz = (z - fZ0) / FIELD_CELL;
    fx = fx < 0 ? 0 : fx > fW - 1.001 ? fW - 1.001 : fx;
    fz = fz < 0 ? 0 : fz > fH - 1.001 ? fH - 1.001 : fz;
    const ix = fx | 0, iz = fz | 0;
    fx -= ix; fz -= iz;
    const i00 = iz * fW + ix, i10 = i00 + 1, i01 = i00 + fW, i11 = i01 + 1;
    const w00 = (1 - fx) * (1 - fz), w10 = fx * (1 - fz), w01 = (1 - fx) * fz, w11 = fx * fz;
    out.lat = fLat[i00] * w00 + fLat[i10] * w10 + fLat[i01] * w01 + fLat[i11] * w11;
    out.s = fS[i00] * w00 + fS[i10] * w10 + fS[i01] * w01 + fS[i11] * w11;
  }

  // -------- offset field: smooth weighted average of (road y - land y) around each station
  const pad = OFF_R + OFF_CELL * 2;
  const oX0 = B.minX - pad, oZ0 = B.minZ - pad;
  const oW = Math.ceil((B.maxX - B.minX + 2 * pad) / OFF_CELL) + 1;
  const oH = Math.ceil((B.maxZ - B.minZ + 2 * pad) / OFF_CELL) + 1;
  const oNum = new Float32Array(oW * oH), oDen = new Float32Array(oW * oH);
  for (let i = 0; i < N; i += 4) {
    const o = py[i] - landNoise(px[i], pz[i], 0);
    const cx0 = Math.floor((px[i] - OFF_R - oX0) / OFF_CELL), cx1 = Math.ceil((px[i] + OFF_R - oX0) / OFF_CELL);
    const cz0 = Math.floor((pz[i] - OFF_R - oZ0) / OFF_CELL), cz1 = Math.ceil((pz[i] + OFF_R - oZ0) / OFF_CELL);
    for (let cz = Math.max(0, cz0); cz <= Math.min(oH - 1, cz1); cz++) {
      const gz = oZ0 + cz * OFF_CELL - pz[i];
      for (let cx = Math.max(0, cx0); cx <= Math.min(oW - 1, cx1); cx++) {
        const gx = oX0 + cx * OFF_CELL - px[i];
        const d2 = (gx * gx + gz * gz) / (OFF_R * OFF_R);
        if (d2 >= 1) continue;
        const w = (1 - d2) * (1 - d2);
        oNum[cz * oW + cx] += w * o;
        oDen[cz * oW + cx] += w;
      }
    }
  }
  function offsetAt(x, z) {
    let fx = (x - oX0) / OFF_CELL, fz = (z - oZ0) / OFF_CELL;
    if (fx < 0 || fz < 0 || fx >= oW - 1 || fz >= oH - 1) return 0;
    const ix = fx | 0, iz = fz | 0;
    fx -= ix; fz -= iz;
    const i00 = iz * oW + ix, i10 = i00 + 1, i01 = i00 + oW, i11 = i01 + 1;
    const w00 = (1 - fx) * (1 - fz), w10 = fx * (1 - fz), w01 = (1 - fx) * fz, w11 = fx * fz;
    const den = oDen[i00] * w00 + oDen[i10] * w10 + oDen[i01] * w01 + oDen[i11] * w11;
    if (den < 1e-4) return 0;
    const num = oNum[i00] * w00 + oNum[i10] * w10 + oNum[i01] * w01 + oNum[i11] * w11;
    const t = den >= 2 ? 1 : den * 0.5;
    return (num / den) * (t * t * (3 - 2 * t));
  }

  // -------- helpers on station arrays
  const halfWAt = (s) => {
    let f = s / ds;
    f = f < 0 ? 0 : f > N - 1.001 ? N - 1.001 : f;
    const i = f | 0, t = f - i;
    return 0.5 * (width[i] + (width[i + 1] - width[i]) * t);
  };

  // -------- shapes
  const nShapes = shapes.length;
  function applyShapes(h, x, z, lat, sS) {
    if (nShapes === 0) return h;
    const hw = halfWAt(sS);
    for (let k = 0; k < nShapes; k++) {
      const r = shapes[k];
      if (r.kind === "edge") continue; // boundary-only rule
      const side = lat * r.side;
      if (side <= 0) continue;
      const edge = side - hw;
      if (edge <= r.start) continue;
      if (sS <= r.s0 || sS >= r.s1) continue;
      const win = smoothstep(r.s0, r.s0 + r.fade, sS) * (1 - smoothstep(r.s1 - r.fade, r.s1, sS));
      if (win <= 0) continue;
      const t = smoothstep(r.start, r.start + r.ramp, edge);
      if (r.kind === "sea") {
        const floorY = SEA_LEVEL - 4 - 0.05 * Math.max(0, edge - r.start - r.ramp) + 1.5 * noise2(x / 60, z / 60, sd4);
        h = lerp(h, Math.min(h, floorY), win * t);
      } else if (r.kind === "drop") {
        const far = r.farFade ? 1 - smoothstep(r.farFade[0], r.farFade[1], edge) : 1 - smoothstep(18, 30, edge);
        h -= r.amount * win * t * far * (0.7 + 0.3 * noise2(x / 45, z / 45, sd3));
      } else if (r.kind === "wall") {
        const far = r.farFade ? 1 - smoothstep(r.farFade[0], r.farFade[1], edge) : 1;
        const rock = ridged2(x / 40, z / 40, sd5, 3);
        h += r.amount * win * t * far * (0.5 + 0.9 * rock);
      }
    }
    return h;
  }
  const nStreams = streams.length;
  function applyStreams(h, lat, sS, edgeDist) {
    for (let k = 0; k < nStreams; k++) {
      const st = streams[k];
      if (sS < st.s0 - 30 || sS > st.s1 + 30) continue;
      const mid = 0.5 * (st.s0 + st.s1), half = 0.5 * (st.s1 - st.s0);
      const along = 1 - smoothstep(half * 0.7, half + 6, Math.abs(sS - mid));
      if (along <= 0) continue;
      const across = 1 - smoothstep(st.reach * 0.6, st.reach * 2.0, Math.max(0, edgeDist));
      h -= st.depth * along * across;
    }
    return h;
  }
  function waterAt(sS, edgeDist) {
    for (let k = 0; k < nStreams; k++) {
      const st = streams[k];
      if (sS < st.s0 || sS > st.s1) continue;
      if (edgeDist <= st.reach) return true;
    }
    return false;
  }

  // -------- the public height function
  const N0 = {};
  const SHOULDER = P.shoulder;
  const BLEND = P.blend;
  function heightAt(x, z) {
    const found = idx.nearest(x, z, N0);
    let lat, sS, dist;
    if (found) {
      lat = N0.lat; sS = N0.s; dist = N0.dist;
      if (dist > 20) {
        coarseAt(x, z, C0);
        const wf = 1 - smoothstep(20, 30, dist);
        lat = C0.lat + (lat - C0.lat) * wf;
        sS = C0.s + (sS - C0.s) * wf;
        dist = Math.abs(lat);
      }
    } else {
      coarseAt(x, z, C0);
      lat = C0.lat; sS = C0.s; dist = Math.abs(lat);
    }
    let h = landNoise(x, z, dist) + offsetAt(x, z);
    h = applyShapes(h, x, z, lat, sS);
    if (nStreams) h = applyStreams(h, lat, sS, dist - halfWAt(sS));
    if (!found) return h;

    // road bed
    const i = N0.i, t = N0.t, i1 = i + 1 < N ? i + 1 : i;
    const hw = 0.5 * (width[i] + (width[i1] - width[i]) * t);
    const alat = N0.lat < 0 ? -N0.lat : N0.lat;
    const d = alat - hw;
    const tb = bank[i] + (bank[i1] - bank[i]) * t;
    if (d <= 0) return N0.y - N0.lat * tb;
    if (d >= SHOULDER + BLEND) return h;
    const sgn = N0.lat < 0 ? -1 : 1;
    const edgeY = N0.y - sgn * hw * tb;
    let blendEff = BLEND;
    const k = curv[i] + (curv[i1] - curv[i]) * t;
    if (k * N0.lat > 0 && (k > 0.016 || k < -0.016)) {
      const r = 1 / Math.abs(k);
      const lim = Math.max(2.5, (r - hw - SHOULDER) * 0.85);
      if (lim < blendEff) blendEff = lim;
    }
    if (nShapes) {
      for (let q = 0; q < nShapes; q++) {
        const rr = shapes[q];
        if ((rr.kind === "sea" || rr.kind === "drop") && rr.side === sgn && N0.s > rr.s0 && N0.s < rr.s1) {
          const win = smoothstep(rr.s0, rr.s0 + rr.fade, N0.s) * (1 - smoothstep(rr.s1 - rr.fade, rr.s1, N0.s));
          const tight = Math.max(2.5, rr.start + 1);
          if (win > 0 && tight < blendEff) blendEff = blendEff + (tight - blendEff) * win;
        }
      }
    }
    const dd = d < SHOULDER ? d : SHOULDER;
    let bedH = edgeY - dd * 0.07;
    if (P.ditch) {
      const q = (d - SHOULDER - 0.9) / 1.1;
      bedH -= P.ditch * Math.exp(-q * q);
    }
    const w = 1 - smoothstep(SHOULDER, SHOULDER + blendEff, d);
    return h + (bedH - h) * w;
  }

  const NE = 0.35;
  function normalAt(x, z, out) {
    out = out || { x: 0, y: 1, z: 0 };
    const hx = heightAt(x + NE, z) - heightAt(x - NE, z);
    const hz = heightAt(x, z + NE) - heightAt(x, z - NE);
    const nx = -hx / (2 * NE), nz = -hz / (2 * NE);
    const l = Math.sqrt(nx * nx + 1 + nz * nz);
    out.x = nx / l; out.y = 1 / l; out.z = nz / l;
    return out;
  }

  const N1 = {};
  function surfaceAt(x, z) {
    const found = idx.nearest(x, z, N1);
    if (!found) {
      coarseAt(x, z, C0);
      const i = clamp(Math.round(C0.s / ds), 0, N - 1);
      return verge[i];
    }
    const i = clamp(Math.round(N1.s / ds), 0, N - 1);
    const hw = halfWAt(N1.s);
    const alat = N1.lat < 0 ? -N1.lat : N1.lat;
    if (alat <= hw) return surf[i];
    if (nStreams && waterAt(N1.s, alat - hw)) return SF.WATER;
    return verge[i];
  }

  return {
    heightAt, normalAt, surfaceAt, halfWAt, coarseAt, landNoise, level,
    /** nearest-road scratch result (valid until the next heightAt/surfaceAt call) */
    nearest: (x, z, out) => idx.nearest(x, z, out),
    params: P,
  };
}
