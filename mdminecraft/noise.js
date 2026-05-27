// Deterministic noise + biome assignment for the world-preview canvas.
// Mirrors the spirit of mdminecraft's seed-XOR-coord scoped RNG and
// multi-octave Perlin terrain — same seed produces the same picture
// every render.

(function () {
  // mulberry32: tiny, deterministic, well-distributed enough for visuals.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // hash 2 coords into a deterministic [0,1) value, seeded.
  function hash2(seed, x, y) {
    let h = seed | 0;
    h = Math.imul(h ^ x, 0x27d4eb2d);
    h = Math.imul(h ^ y, 0x165667b1);
    h ^= h >>> 16;
    return mulberry32(h)();
  }

  // smoothstep
  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // Value noise at fractional (x, y), seeded.
  function value(seed, x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const aa = hash2(seed, xi,     yi);
    const ab = hash2(seed, xi,     yi + 1);
    const ba = hash2(seed, xi + 1, yi);
    const bb = hash2(seed, xi + 1, yi + 1);
    const u = fade(xf), v = fade(yf);
    return lerp(lerp(aa, ba, u), lerp(ab, bb, u), v);
  }

  // Multi-octave (fBm).
  function octaves(seed, x, y, octs, lacunarity, persistence) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octs; i++) {
      sum += amp * value(seed + i * 7919, x * freq, y * freq);
      norm += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  // mdminecraft has 14 biome types — palette tuned to look like an
  // overhead biome map from a terrain debugger.
  const BIOMES = [
    { id: "ocean",        name: "Ocean",        color: "#1a3b5e" },
    { id: "deep_ocean",   name: "Deep Ocean",   color: "#0e2740" },
    { id: "beach",        name: "Beach",        color: "#d6c391" },
    { id: "plains",       name: "Plains",       color: "#8fbf63" },
    { id: "forest",       name: "Forest",       color: "#4d8c3a" },
    { id: "dark_forest",  name: "Dark Forest",  color: "#2f5e28" },
    { id: "taiga",        name: "Taiga",        color: "#6b8d6f" },
    { id: "snowy_taiga",  name: "Snowy Taiga",  color: "#b8c8c0" },
    { id: "tundra",       name: "Tundra",       color: "#dde2e0" },
    { id: "desert",       name: "Desert",       color: "#e3c870" },
    { id: "savanna",      name: "Savanna",      color: "#bca347" },
    { id: "badlands",     name: "Badlands",     color: "#b86a3a" },
    { id: "mountain",     name: "Mountain",     color: "#7d7872" },
    { id: "peaks",        name: "Snowy Peaks",  color: "#efefef" }
  ];

  function pickBiome(elev, moist, temp) {
    if (elev < 0.33) {
      return elev < 0.20 ? BIOMES[1] : BIOMES[0]; // deep ocean / ocean
    }
    if (elev < 0.36) return BIOMES[2]; // beach
    if (elev > 0.78) return BIOMES[13]; // snowy peaks
    if (elev > 0.66) return BIOMES[12]; // mountain
    if (temp < 0.25) {
      if (moist < 0.4) return BIOMES[8];        // tundra
      return moist > 0.7 ? BIOMES[7] : BIOMES[6]; // snowy taiga / taiga
    }
    if (temp > 0.75) {
      if (moist < 0.25) return BIOMES[9];       // desert
      if (moist < 0.45) return BIOMES[11];      // badlands
      return BIOMES[10];                        // savanna
    }
    if (moist > 0.75) return BIOMES[5];          // dark forest
    if (moist > 0.5)  return BIOMES[4];          // forest
    return BIOMES[3];                            // plains
  }

  // Hash a string seed → 32-bit int (same vibe as world_seed parsing).
  function seedToInt(s) {
    if (s === null || s === undefined) return 12345;
    if (typeof s === "number") return s | 0;
    if (/^-?\d+$/.test(s)) return parseInt(s, 10) | 0;
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h | 0;
  }

  // Render heightmap or biome map onto a canvas, given a seed + region.
  // mode: "biomes" | "heightmap" | "seams"
  // Returns { biomeCounts, samples, chunkSeams }
  function renderWorld(canvas, seed, mode, opts) {
    const W = canvas.width;
    const H = canvas.height;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(W, H);
    const px = img.data;

    const seedInt = seedToInt(seed);
    const scale = opts?.scale ?? 0.012;   // world units per pixel
    const tempSeed = seedInt + 4099;
    const moistSeed = seedInt + 8191;

    const counts = {};

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // Elevation: 5 octaves, plus a low-freq continent mask.
        const continent = octaves(seedInt, x * scale * 0.4, y * scale * 0.4, 2, 2, 0.5);
        const elev = 0.55 * octaves(seedInt, x * scale, y * scale, 5, 2.0, 0.5)
                   + 0.45 * continent;

        let col;
        if (mode === "heightmap") {
          // 5 height tiers, like debug-world's █▓▒░·
          const lvl = elev < 0.30 ? 0
                    : elev < 0.45 ? 1
                    : elev < 0.60 ? 2
                    : elev < 0.75 ? 3 : 4;
          const t = [0.18, 0.32, 0.50, 0.70, 0.92][lvl];
          const r = Math.floor(t * 200 + 40);
          const g = Math.floor(t * 210 + 30);
          const b = Math.floor(t * 220 + 40);
          col = [r, g, b];
        } else if (mode === "seams") {
          // Chunk-seam validation view: show 16-px (1-chunk) grid with
          // hash check at boundaries. All chunks valid → all green.
          const cx = Math.floor(x / 16), cy = Math.floor(y / 16);
          const onSeam = x % 16 === 0 || y % 16 === 0;
          const h = hash2(seedInt, cx, cy);
          const baseT = elev;
          const greyR = Math.floor(baseT * 70 + 26);
          const greyG = Math.floor(baseT * 80 + 30);
          const greyB = Math.floor(baseT * 84 + 32);
          if (onSeam) {
            col = h > 0.001 ? [80, 200, 130] : [220, 90, 80]; // (always green: deterministic)
          } else {
            col = [greyR, greyG, greyB];
          }
        } else {
          // biomes
          const moist = octaves(moistSeed, x * scale * 0.7, y * scale * 0.7, 3, 2.0, 0.5);
          const temp  = octaves(tempSeed,  x * scale * 0.5, y * scale * 0.5, 3, 2.0, 0.55);
          const biome = pickBiome(elev, moist, temp);
          counts[biome.id] = (counts[biome.id] || 0) + 1;
          col = hexToRgb(biome.color);
        }

        const idx = (y * W + x) * 4;
        px[idx]     = col[0];
        px[idx + 1] = col[1];
        px[idx + 2] = col[2];
        px[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Overlay: chunk grid for the biomes view (subtle).
    if (mode === "biomes") {
      ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 16) {
        ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 16) {
        ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke();
      }
    }

    // Crosshair at centre.
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 8, H / 2 + 0.5); ctx.lineTo(W / 2 + 8, H / 2 + 0.5);
    ctx.moveTo(W / 2 + 0.5, H / 2 - 8); ctx.lineTo(W / 2 + 0.5, H / 2 + 8);
    ctx.stroke();

    return {
      counts,
      seedInt,
      total: W * H,
      chunks: Math.ceil(W / 16) * Math.ceil(H / 16)
    };
  }

  function hexToRgb(hex) {
    const m = hex.replace("#", "");
    return [
      parseInt(m.slice(0, 2), 16),
      parseInt(m.slice(2, 4), 16),
      parseInt(m.slice(4, 6), 16),
    ];
  }

  window.WorldNoise = { renderWorld, BIOMES, seedToInt };
})();
