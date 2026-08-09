// Every random number in OpusRally comes from here. Determinism is not a nicety:
// a stage, its scenery, a replay and a ghost are all just a seed, so anything
// reaching for Math.random() would make a saved time unreproducible.

const UINT = 4294967296;

export function stringSeed(text) {
  let h = 2166136261 >>> 0;
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function normaliseSeed(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) return (seed >>> 0) || 0x9e3779b9;
  return stringSeed(seed ?? "opus") || 0x9e3779b9;
}

// mulberry32: one multiply-xor chain, 2^32 period, passes the smallness tests we
// care about and is a dozen instructions — cheap enough to call per particle.
export function makeRng(seed) {
  let a = normaliseSeed(seed);
  const rng = {
    seed: a,
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / UINT;
    },
    range(lo, hi) {
      return lo + (hi - lo) * rng.next();
    },
    int(lo, hi) {
      return lo + Math.floor(rng.next() * (hi - lo + 1));
    },
    pick(list) {
      return list[Math.floor(rng.next() * list.length) % list.length];
    },
    chance(p) {
      return rng.next() < p;
    },
    // Box–Muller, one sample per call; the discarded twin is not worth the state.
    gauss(mu = 0, sigma = 1) {
      const u = Math.max(rng.next(), 1e-12);
      const v = rng.next();
      return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    // Independent stream from the same parent seed, so adding a consumer never
    // shifts the numbers an existing one sees.
    fork(salt) {
      return makeRng((a ^ stringSeed(salt)) >>> 0);
    },
    shuffle(list) {
      for (let i = list.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng.next() * (i + 1));
        const t = list[i];
        list[i] = list[j];
        list[j] = t;
      }
      return list;
    },
  };
  return rng;
}

export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ (seed | 0);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / UINT;
}

export function hash3(x, y, z, seed = 0) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)
    ^ Math.imul(z | 0, 0x1b873593) ^ (seed | 0);
  h = Math.imul(h ^ (h >>> 13), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
  return ((h ^ (h >>> 15)) >>> 0) / UINT;
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function valueNoise2(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = fade(xf);
  const v = fade(yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  const top = a + (b - a) * u;
  const bot = c + (d - c) * u;
  return (top + (bot - top) * v) * 2 - 1;
}

// Gradient noise. Terrain gets this rather than value noise because value noise's
// axis-aligned lattice shows up as visible cardinal ridges on a big hillside.
export function gradNoise2(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = fade(xf);
  const v = fade(yf);
  const dot = (cx, cy) => {
    const ang = hash2(xi + cx, yi + cy, seed) * Math.PI * 2;
    return Math.cos(ang) * (xf - cx) + Math.sin(ang) * (yf - cy);
  };
  const a = dot(0, 0);
  const b = dot(1, 0);
  const c = dot(0, 1);
  const d = dot(1, 1);
  const top = a + (b - a) * u;
  const bot = c + (d - c) * u;
  return (top + (bot - top) * v) * 1.4142;
}

export function fbm2(x, y, seed = 0, octaves = 4, lacunarity = 2.03, gain = 0.5) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * gradNoise2(x * freq, y * freq, seed + i * 1013);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

// Ridged multifractal — the crease-along-the-top shape that reads as a mountain
// spine instead of a dune.
export function ridged2(x, y, seed = 0, octaves = 4, lacunarity = 2.07, gain = 0.5) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    const n = 1 - Math.abs(gradNoise2(x * freq, y * freq, seed + i * 7919));
    sum += amp * n * n;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? (sum / norm) * 2 - 1 : 0;
}
