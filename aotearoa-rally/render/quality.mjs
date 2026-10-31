// Quality tiers, FPS governor, chunk/LOD maths, prop table and the skid ring buffer.
// PURE: no THREE, no DOM (unit-tested under node --test; see tests/world-*.test.mjs).

export const QUALITY_LEVELS = ["low", "medium", "high", "ultra"];

/** Every prop kind of CONTRACTS.md section 2 (kept in sync; tests compare against core/stage.mjs). */
export const PROP_KIND_LIST = [
  "pine", "macrocarpa", "redwood", "beech", "pohutukawa", "kauri", "tree_fern", "cabbage_tree", "flax", "toetoe",
  "tussock", "grass_tuft", "fern", "shrub", "boulder", "limestone", "schist", "log", "stump", "fence_post",
  "fence_wire", "power_pole", "sign_chevron", "sign_warning", "marker_post", "tape_barrier", "haybale", "marshal",
  "spectator", "spectator_group", "car_parked", "hut", "farm_shed", "bridge_deck", "bridge_rail", "culvert", "sheep",
  "cow", "steam_vent", "waterfall", "cattlegrid", "guardrail", "tyre_stack", "flag", "tent", "banner_arch",
];

/**
 * lods: number of geometry levels; d0/d1 = switch distances (m) 0->1 and 1->2; max = cull distance;
 * cast: LOD0 casts shadows; dens: thinning class ('small' items thin out first on low tiers).
 */
export const PROP_TABLE = {
  pine: { lods: 3, d0: 70, d1: 230, max: 950, cast: true, dens: "tree" },
  macrocarpa: { lods: 3, d0: 70, d1: 230, max: 900, cast: true, dens: "tree" },
  redwood: { lods: 3, d0: 90, d1: 280, max: 1100, cast: true, dens: "tree" },
  beech: { lods: 3, d0: 70, d1: 230, max: 900, cast: true, dens: "tree" },
  pohutukawa: { lods: 3, d0: 70, d1: 230, max: 900, cast: true, dens: "tree" },
  kauri: { lods: 3, d0: 80, d1: 250, max: 950, cast: true, dens: "tree" },
  tree_fern: { lods: 3, d0: 55, d1: 160, max: 520, cast: true, dens: "mid" },
  cabbage_tree: { lods: 3, d0: 55, d1: 170, max: 600, cast: true, dens: "mid" },
  flax: { lods: 2, d0: 55, d1: 140, max: 260, cast: false, dens: "small" },
  toetoe: { lods: 2, d0: 55, d1: 140, max: 260, cast: false, dens: "small" },
  tussock: { lods: 2, d0: 50, d1: 130, max: 300, cast: false, dens: "small" },
  grass_tuft: { lods: 2, d0: 30, d1: 70, max: 120, cast: false, dens: "small" },
  fern: { lods: 2, d0: 45, d1: 110, max: 200, cast: false, dens: "small" },
  shrub: { lods: 2, d0: 55, d1: 140, max: 280, cast: false, dens: "mid" },
  boulder: { lods: 2, d0: 50, d1: 260, max: 760, cast: true, dens: "mid" },
  limestone: { lods: 2, d0: 60, d1: 320, max: 950, cast: true, dens: "mid" },
  schist: { lods: 2, d0: 60, d1: 320, max: 950, cast: true, dens: "mid" },
  log: { lods: 1, d0: 1e9, d1: 1e9, max: 280, cast: true, dens: "small" },
  stump: { lods: 1, d0: 1e9, d1: 1e9, max: 260, cast: true, dens: "small" },
  fence_post: { lods: 1, d0: 1e9, d1: 1e9, max: 330, cast: false, dens: "small" },
  fence_wire: { lods: 1, d0: 1e9, d1: 1e9, max: 330, cast: false, dens: "small" },
  power_pole: { lods: 2, d0: 140, d1: 1e9, max: 900, cast: true, dens: "mid" },
  sign_chevron: { lods: 1, d0: 1e9, d1: 1e9, max: 300, cast: false, dens: "mid" },
  sign_warning: { lods: 1, d0: 1e9, d1: 1e9, max: 300, cast: false, dens: "mid" },
  marker_post: { lods: 1, d0: 1e9, d1: 1e9, max: 260, cast: false, dens: "mid" },
  tape_barrier: { lods: 1, d0: 1e9, d1: 1e9, max: 260, cast: false, dens: "mid" },
  haybale: { lods: 1, d0: 1e9, d1: 1e9, max: 300, cast: true, dens: "mid" },
  marshal: { lods: 1, d0: 1e9, d1: 1e9, max: 220, cast: true, dens: "mid" },
  spectator: { lods: 1, d0: 1e9, d1: 1e9, max: 220, cast: true, dens: "mid" },
  spectator_group: { lods: 1, d0: 1e9, d1: 1e9, max: 280, cast: true, dens: "mid" },
  car_parked: { lods: 2, d0: 100, d1: 1e9, max: 380, cast: true, dens: "mid" },
  hut: { lods: 2, d0: 220, d1: 1e9, max: 900, cast: true, dens: "mid" },
  farm_shed: { lods: 2, d0: 220, d1: 1e9, max: 900, cast: true, dens: "mid" },
  bridge_deck: { lods: 1, d0: 1e9, d1: 1e9, max: 800, cast: true, dens: "mid" },
  bridge_rail: { lods: 1, d0: 1e9, d1: 1e9, max: 600, cast: true, dens: "mid" },
  culvert: { lods: 1, d0: 1e9, d1: 1e9, max: 300, cast: false, dens: "mid" },
  sheep: { lods: 1, d0: 1e9, d1: 1e9, max: 320, cast: true, dens: "mid" },
  cow: { lods: 1, d0: 1e9, d1: 1e9, max: 360, cast: true, dens: "mid" },
  steam_vent: { lods: 1, d0: 1e9, d1: 1e9, max: 500, cast: false, dens: "mid" },
  waterfall: { lods: 1, d0: 1e9, d1: 1e9, max: 800, cast: false, dens: "mid" },
  cattlegrid: { lods: 1, d0: 1e9, d1: 1e9, max: 220, cast: false, dens: "mid" },
  guardrail: { lods: 1, d0: 1e9, d1: 1e9, max: 450, cast: true, dens: "mid" },
  tyre_stack: { lods: 1, d0: 1e9, d1: 1e9, max: 260, cast: true, dens: "mid" },
  flag: { lods: 1, d0: 1e9, d1: 1e9, max: 280, cast: false, dens: "mid" },
  tent: { lods: 1, d0: 1e9, d1: 1e9, max: 380, cast: true, dens: "mid" },
  banner_arch: { lods: 1, d0: 1e9, d1: 1e9, max: 700, cast: true, dens: "mid" },
};

/**
 * Tier table. Densities are keep-probabilities per `dens` class. `distMul` scales prop distances.
 * terrainLod = distances at which a chunk steps down one LOD (0->1, 1->2, 2->3).
 */
export const QUALITY = {
  low: {
    pixelRatioCap: 1, resScale: 0.85, post: false, msaa: 0, bloom: false, grade: false,
    shadows: true, shadowMap: 1024, shadowRange: 45, shadowFar: 0, shadowCascade2: false, shadowPrimaryLodOnly: true,
    terrainLod: [120, 260, 520], viewDist: 900, terrainSeg: 48, chunkBuildPerFrame: 1,
    density: { tree: 0.55, mid: 0.7, small: 0.4 }, distMul: 0.55, detailTex: false, anisotropy: 2,
    rain: 2600, snow: 1600, envSize: 64, alphaToCoverage: false, grain: 0, texScale: 0.5,
    adverts: 0, headlightsSpot: true, maxPropInstances: 5000, waterDetail: false,
  },
  medium: {
    pixelRatioCap: 1.25, resScale: 1, post: true, msaa: 0, bloom: true, grade: true,
    shadows: true, shadowMap: 2048, shadowRange: 55, shadowFar: 0, shadowCascade2: false, shadowPrimaryLodOnly: false,
    terrainLod: [150, 330, 680], viewDist: 1300, terrainSeg: 64, chunkBuildPerFrame: 1,
    density: { tree: 0.8, mid: 0.9, small: 0.7 }, distMul: 0.8, detailTex: true, anisotropy: 4,
    rain: 4600, snow: 2800, envSize: 128, alphaToCoverage: false, grain: 0.5, texScale: 1,
    adverts: 0.6, headlightsSpot: true, maxPropInstances: 9000, waterDetail: true,
  },
  high: {
    pixelRatioCap: 1.5, resScale: 1, post: true, msaa: 4, bloom: true, grade: true,
    shadows: true, shadowMap: 2048, shadowRange: 35, shadowFar: 200, shadowCascade2: true, shadowPrimaryLodOnly: false,
    terrainLod: [190, 400, 800], viewDist: 1700, terrainSeg: 64, chunkBuildPerFrame: 2,
    density: { tree: 1, mid: 1, small: 1 }, distMul: 1, detailTex: true, anisotropy: 8,
    rain: 7000, snow: 4200, envSize: 256, alphaToCoverage: true, grain: 1, texScale: 1,
    adverts: 1, headlightsSpot: true, maxPropInstances: 14000, waterDetail: true,
  },
  ultra: {
    pixelRatioCap: 2, resScale: 1, post: true, msaa: 4, bloom: true, grade: true,
    shadows: true, shadowMap: 4096, shadowRange: 40, shadowFar: 240, shadowCascade2: true, shadowPrimaryLodOnly: false,
    terrainLod: [240, 480, 950], viewDist: 2100, terrainSeg: 64, chunkBuildPerFrame: 2,
    density: { tree: 1, mid: 1, small: 1 }, distMul: 1.25, detailTex: true, anisotropy: 16,
    rain: 10000, snow: 6000, envSize: 256, alphaToCoverage: true, grain: 1, texScale: 1,
    adverts: 1, headlightsSpot: true, maxPropInstances: 20000, waterDetail: true,
  },
};

export function normalizeQuality(level) {
  return level === "auto" || QUALITY_LEVELS.includes(level) ? level : "auto";
}

/** Guess a tier for 'auto' from coarse device hints (all optional). */
export function guessTier({ cores = 4, mobile = false, dpr = 1, gpuHint = "" } = {}) {
  const g = String(gpuHint).toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(g)) return "low";
  if (mobile) return "low";
  if (/intel|uhd|iris|mali|adreno|apple gpu/.test(g) && cores < 8) return "medium";
  if (cores >= 8 && dpr <= 2) return "high";
  return cores >= 6 ? "high" : "medium";
}

export function tierBelow(level) {
  const i = QUALITY_LEVELS.indexOf(level);
  return QUALITY_LEVELS[Math.max(0, i - 1)];
}

export function tierAbove(level) {
  const i = QUALITY_LEVELS.indexOf(level);
  return QUALITY_LEVELS[Math.min(QUALITY_LEVELS.length - 1, i + 1)];
}

/**
 * Dynamic-resolution governor. Feed `frame(ms)`; read `.scale`. Pure and deterministic.
 * Down: avg above target*1.15 steps the scale down, then asks for a lower tier (`tierDownRequested`).
 * Up (probe): a vsync-capped display never reports frames faster than its refresh, so "fast enough" means avg <= target*1.05
 * for `interval` ms. The governor then steps the scale up one step (or, at max scale with `tierHeadroom`, sets
 * `tierUpRequested`). If the probe degrades within 3 s it is reverted and the next
 * probe waits twice as long (up to 2 min); a held probe resets the wait. `reset()` forgets the backoff; `resetWindow()` keeps them.
 */
/** Scale at which a higher tier is worth probing (the renderer restarts the new tier at this scale). */
export const TIER_UP_SCALE = 0.8;

export function createGovernor({ targetMs = 1000 / 58, min = 0.6, max = 1, step = 0.05, window = 24, probeMs = 6000, probeMaxMs = 120000 } = {}) {
  const buf = new Float32Array(window);
  let n = 0, head = 0, cool = 0, slowFor = 0, okFor = 0, interval = probeMs, probe = null;
  const g = {
    scale: max, enabled: true, tierDownRequested: false, tierUpRequested: false, urgent: false, tierHeadroom: false, targetMs, min, max,
    get probing() { return !!probe; },
    resetWindow() { n = 0; head = 0; cool = 0; slowFor = 0; okFor = 0; probe = null; g.tierDownRequested = false; g.tierUpRequested = false; g.urgent = false; },
    reset() { g.resetWindow(); interval = probeMs; },
    frame(ms) {
      if (!g.enabled || !(ms > 0)) return g.scale;
      buf[head] = Math.min(ms, 250);
      head = (head + 1) % window;
      if (n < window) n++;
      if (cool > 0) cool -= ms;
      if (probe) probe.t += ms;
      if (n < window) return g.scale;
      // trimmed mean: drop the 3 slowest frames so one chunk upload or GC hitch cannot flip the decision
      let sum = 0, m1 = 0, m2 = 0, m3 = 0;
      for (let i = 0; i < window; i++) {
        const v = buf[i]; sum += v;
        if (v > m1) { m3 = m2; m2 = m1; m1 = v; } else if (v > m2) { m3 = m2; m2 = v; } else if (v > m3) m3 = v;
      }
      const avg = (sum - m1 - m2 - m3) / (window - 3);
      const slow = avg > targetMs * 1.15;
      if (probe && slow) { // the probe did not hold: revert and back off
        interval = Math.min(probeMaxMs, interval * 2);
        if (probe.kind === "scale") { g.scale = probe.prev; n = 0; head = 0; cool = 1500; }
        else { g.tierDownRequested = true; g.urgent = true; }
        probe = null; okFor = 0;
        return g.scale;
      }
      if (probe && probe.t > 3000) { probe = null; interval = probeMs; } // held: the new level stands, probe again soon
      if (slow && cool <= 0) {
        if (g.scale > min + 1e-6) g.scale = Math.max(min, +(g.scale - step).toFixed(4));
        else { slowFor += window * avg; if (slowFor > 4000) g.tierDownRequested = true; }
        cool = 400; n = Math.floor(window / 2); okFor = 0;
      } else if (avg <= targetMs * 1.05) {
        slowFor = 0;
        okFor += ms;
        if (!probe) {
          if (okFor >= interval && cool <= 0) {
            if (g.tierHeadroom && g.scale >= TIER_UP_SCALE - 1e-6) {
              probe = { kind: "tier", prev: g.scale, t: 0 };
              g.tierUpRequested = true; n = 0; head = 0; cool = 800; okFor = 0;
            } else if (g.scale < max - 1e-6) {
              probe = { kind: "scale", prev: g.scale, t: 0 };
              g.scale = Math.min(max, +(g.scale + step * 3).toFixed(4));
              n = 0; head = 0; cool = 800; okFor = 0;
            } else if (g.tierHeadroom) {
              probe = { kind: "tier", prev: g.scale, t: 0 };
              g.tierUpRequested = true; n = 0; head = 0; cool = 800; okFor = 0;
            } else okFor = 0;
          }
        }
      } else { if (!slow) slowFor = 0; okFor = 0; }
      return g.scale;
    },
  };
  return g;
}

/** Percentile (0..1) of a ring of samples, without allocating when `scratch` is given. */
export function percentile(samples, count, p, scratch) {
  if (count <= 0) return 0;
  const a = scratch && scratch.length >= count ? scratch : new Float32Array(count);
  for (let i = 0; i < count; i++) a[i] = samples[i];
  const sub = a.subarray(0, count);
  sub.sort();
  return sub[Math.min(count - 1, Math.floor(p * (count - 1) + 0.5))];
}

// ---------------------------------------------------------------- terrain chunk maths

export const CHUNK_SIZE = 128;
export const LOD_QUADS = [64, 32, 16, 8]; // quads per chunk edge for LOD 0..3 (2 m, 4 m, 8 m, 16 m)

/** Chunk grid covering `bounds`. */
export function chunkGrid(bounds, size = CHUNK_SIZE) {
  const x0 = Math.floor(bounds.minX / size), z0 = Math.floor(bounds.minZ / size);
  const x1 = Math.ceil(bounds.maxX / size), z1 = Math.ceil(bounds.maxZ / size);
  return { size, x0, z0, nx: Math.max(1, x1 - x0), nz: Math.max(1, z1 - z0) };
}

export const chunkKey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);

/** LOD for a distance with hysteresis: `cur` (or -1) keeps its level inside a 12% band. */
export function selectLod(dist, thresholds, cur = -1) {
  let lod = 0;
  for (let i = 0; i < thresholds.length; i++) if (dist > thresholds[i]) lod = i + 1;
  if (cur >= 0 && cur !== lod) {
    // hysteresis: only change when clearly beyond the boundary
    if (cur < lod) { const b = thresholds[cur]; if (dist < b * 1.12) return cur; }
    else { const b = thresholds[cur - 1]; if (dist > b * 0.88) return cur; }
  }
  return lod;
}

/** Skirt depth (m) hiding LOD cracks: grows with the cell size of the level. */
export const skirtDepth = (lod) => [1.2, 2.5, 5, 10][lod] ?? 10;

/** Distance from a point to a chunk's square footprint (0 when inside). */
export function chunkDistance(px, pz, cx, cz, size = CHUNK_SIZE) {
  const x0 = cx * size, z0 = cz * size;
  const dx = Math.max(x0 - px, 0, px - (x0 + size));
  const dz = Math.max(z0 - pz, 0, pz - (z0 + size));
  return Math.sqrt(dx * dx + dz * dz);
}

/** Index buffer (Uint16/32) for an (n x n) quad grid with a one-quad skirt ring. Vertex layout: see terrain.mjs. */
export function gridIndices(n) {
  const w = n + 3; // (n+1) grid + 2 skirt rows/cols
  const idx = new Uint32Array(((w - 1) * (w - 1)) * 6);
  let k = 0;
  for (let j = 0; j < w - 1; j++) {
    for (let i = 0; i < w - 1; i++) {
      const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
      // alternate diagonal for less visible striping
      if (((i + j) & 1) === 0) { idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d; }
      else { idx[k++] = a; idx[k++] = c; idx[k++] = d; idx[k++] = a; idx[k++] = d; idx[k++] = b; }
    }
  }
  return idx;
}

// ---------------------------------------------------------------- prop distance / LOD / thinning

/** Which LOD of a prop kind at distance d (or -1 = culled). */
export function propLod(kind, d, distMul = 1) {
  const t = PROP_TABLE[kind] ?? PROP_TABLE.boulder;
  if (d > t.max * distMul) return -1;
  if (t.lods <= 1) return 0;
  if (d < t.d0 * distMul) return 0;
  if (t.lods === 2 || d < t.d1 * distMul) return 1;
  return 2;
}

/** Deterministic keep test for density thinning: stable per prop index. */
export function keepProp(index, kind, density) {
  const cls = (PROP_TABLE[kind] ?? PROP_TABLE.boulder).dens;
  const p = density[cls] ?? 1;
  if (p >= 1) return true;
  let h = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(kind.length, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  return ((h >>> 0) / 4294967296) < p;
}

// ---------------------------------------------------------------- skid marks (ring buffer)

/**
 * Fixed-capacity ring of tyre-mark quads. Each wheel keeps a "pen"; a mark segment is emitted when the
 * contact moved 0.18..4 m since the last one. Writes straight into typed arrays the renderer uploads.
 *  pos   : capacity*4 verts * 3
 *  alpha : capacity*4 verts       (0 = unused)
 *  tint  : capacity*4 verts * 3   (rgb 0..1)
 */
export function createSkidBuffer(capacity = 3072, wheels = 4) {
  const pos = new Float32Array(capacity * 12);
  const alpha = new Float32Array(capacity * 4);
  const tint = new Float32Array(capacity * 12);
  const penX = new Float32Array(wheels), penY = new Float32Array(wheels), penZ = new Float32Array(wheels);
  const penA = new Float32Array(wheels), penLeftX = new Float32Array(wheels), penLeftZ = new Float32Array(wheels);
  const penOn = new Uint8Array(wheels);
  const b = {
    capacity, pos, alpha, tint, head: 0, count: 0, version: 0, lastWritten: -1,
    /** returns the number of segments written (0 or 1). */
    mark(w, x, y, z, yaw, intensity, r, g, bl, width = 0.22) {
      if (!(intensity > 0.05)) { penOn[w] = 0; return 0; }
      // wheel lateral axis from yaw (right = (cos, -sin))
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const hw = width * 0.5;
      if (!penOn[w]) {
        penOn[w] = 1; penX[w] = x; penY[w] = y; penZ[w] = z; penA[w] = intensity; penLeftX[w] = rx; penLeftZ[w] = rz;
        return 0;
      }
      const dx = x - penX[w], dz = z - penZ[w];
      const d2 = dx * dx + dz * dz;
      if (d2 > 16) { penX[w] = x; penY[w] = y; penZ[w] = z; penA[w] = intensity; penLeftX[w] = rx; penLeftZ[w] = rz; return 0; }
      if (d2 < 0.0324) return 0;
      const seg = b.head;
      const p = seg * 12, a = seg * 4;
      const lift = 0.025;
      const ax = penLeftX[w] * hw, az = penLeftZ[w] * hw, bx = rx * hw, bz = rz * hw;
      pos[p] = penX[w] - ax; pos[p + 1] = penY[w] + lift; pos[p + 2] = penZ[w] - az;
      pos[p + 3] = penX[w] + ax; pos[p + 4] = penY[w] + lift; pos[p + 5] = penZ[w] + az;
      pos[p + 6] = x - bx; pos[p + 7] = y + lift; pos[p + 8] = z - bz;
      pos[p + 9] = x + bx; pos[p + 10] = y + lift; pos[p + 11] = z + bz;
      const a0 = Math.min(1, penA[w]), a1 = Math.min(1, intensity);
      alpha[a] = a0; alpha[a + 1] = a0; alpha[a + 2] = a1; alpha[a + 3] = a1;
      for (let v = 0; v < 4; v++) { tint[p + v * 3] = r; tint[p + v * 3 + 1] = g; tint[p + v * 3 + 2] = bl; }
      b.lastWritten = seg;
      b.head = (b.head + 1) % capacity;
      if (b.count < capacity) b.count++;
      b.version++;
      penX[w] = x; penY[w] = y; penZ[w] = z; penA[w] = intensity; penLeftX[w] = rx; penLeftZ[w] = rz;
      return 1;
    },
    lift(w) { penOn[w] = 0; },
    clear() { alpha.fill(0); b.head = 0; b.count = 0; b.version++; penOn.fill(0); b.lastWritten = -1; },
  };
  return b;
}

/** Mark colour (rgb 0..1) and width for a surface id (see core/surfaces.mjs). */
export function skidStyle(surfaceId) {
  switch (surfaceId) {
    case 2: return { r: 0.03, g: 0.03, b: 0.035, width: 0.24 }; // tarmac
    case 3: return { r: 0.12, g: 0.08, b: 0.05, width: 0.3 }; // mud
    case 4: case 11: return { r: 0.55, g: 0.6, b: 0.66, width: 0.28 }; // snow
    case 5: return { r: 0.45, g: 0.4, b: 0.32, width: 0.28 }; // pumice
    case 1: return { r: 0.22, g: 0.16, b: 0.1, width: 0.26 }; // dirt
    case 12: return { r: 0, g: 0, b: 0, width: 0 }; // water: no marks
    default: return { r: 0.2, g: 0.17, b: 0.13, width: 0.26 }; // gravel and the rest
  }
}

/** Force `visible = true` on every object in the list; the returned function restores the previous flags. */
export function forceVisible(objs) {
  const saved = objs.map((o) => o.visible);
  for (const o of objs) o.visible = true;
  return () => { for (let i = 0; i < objs.length; i++) objs[i].visible = saved[i]; };
}

/** Two-cascade split distances: near covers [0, near], far covers [near, far]; 10% overlap for blending. */
export function cascadeSplits(near = 40, far = 140, overlap = 0.1) {
  return { near: { start: 0, end: near * (1 + overlap) }, far: { start: near * (1 - overlap), end: far } };
}

/** Particle fade by camera distance: 0 at d0*0.35 and below, 1 at d0 and beyond (matches the weather shader). */
export function nearFade(d, d0) {
  const a = d0 * 0.35, t = Math.min(1, Math.max(0, (d - a) / (d0 - a)));
  return t * t * (3 - 2 * t);
}
/** Angular cap on a flake's half-size so it can never grow into a disc up close. */
export function flakeSize(base, seedY, d) { return Math.min(base * (0.6 + seedY), d * 0.0075); }
