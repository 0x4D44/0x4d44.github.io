// Texture set: loads assets/tex/manifest.json files, falls back to canvas-procedural textures.
// Browser-only. A missing file or manifest never breaks rendering.
import { hash2 } from "../core/rng.mjs";

export const TEX_NAMES = {
  road: ["road_gravel", "road_dirt", "road_tarmac", "road_mud", "road_snow", "road_pumice"],
  ground: ["gnd_grass2", "gnd_tussock", "gnd_leaf", "gnd_schist", "gnd_limestone", "gnd_moss_rock", "gnd_sand", "gnd_snow", "gnd_fern"],
  bark: ["bark_redwood", "bark_beech", "bark_pine"],
  foliage: ["foliage_fern", "foliage_pine", "foliage_broadleaf", "foliage_flax", "foliage_grass"],
  // loaded only for the stage that uses them (see stageTextures / ensure)
  rock: ["rock_schist", "rock_limestone", "rock_volcanic", "rock_coastal", "rock_fiord", "rock_cliff"],
  lazyOther: ["wool_fleece", "foliage_toetoe", "foliage_pohutukawa"],
};
export const LAZY_TEX = new Set([...TEX_NAMES.rock, ...TEX_NAMES.lazyOther]);
export const BIOME_ROCK = { pasture: "rock_limestone", redwood: "rock_volcanic", coast: "rock_coastal", tussock: "rock_schist", alpine: "rock_cliff", rainforest: "rock_fiord" };
/** The lazy textures a stage needs: its biome rock, plus fleece for sheep country and the coastal foliage cards. */
export function stageTextures(biome) {
  const out = [BIOME_ROCK[biome] ?? "rock_limestone"];
  if (biome === "pasture" || biome === "coast" || biome === "tussock") out.push("wool_fleece");
  if (biome === "coast") out.push("foliage_toetoe", "foliage_pohutukawa");
  return out;
}
export const ALL_TEX_NAMES = [...TEX_NAMES.road, ...TEX_NAMES.ground, ...TEX_NAMES.bark, ...TEX_NAMES.foliage];

const BASE_COLOR = {
  road_gravel: 0x8d8576, road_dirt: 0x8f7656, road_tarmac: 0x4d4d50, road_mud: 0x4a3a2b, road_snow: 0xdfe7ef, road_pumice: 0xcdbf9f,
  gnd_grass2: 0x6a9a3a, rock_schist: 0x6f737a, rock_limestone: 0xb9b5a3, rock_volcanic: 0x4a3a30, rock_coastal: 0xa87a50, rock_fiord: 0x4a4e4a, rock_cliff: 0x70756d, wool_fleece: 0xe4dccb, gnd_tussock: 0xa9945a, gnd_leaf: 0x5b4630, gnd_schist: 0x6f736a, gnd_limestone: 0xb9b5a3,
  gnd_moss_rock: 0x4c5a3c, gnd_sand: 0xcdb98a, gnd_snow: 0xf2f6fa, gnd_fern: 0x3f6a34,
  bark_redwood: 0x6b3d26, bark_beech: 0x5d5648, bark_pine: 0x7a5a40,
};

// ---- periodic value noise (tiles perfectly) ----
function pnoise(x, y, period, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const m = (a) => ((a % period) + period) % period;
  const a = hash2(m(ix), m(iy), seed), b = hash2(m(ix + 1), m(iy), seed), c = hash2(m(ix), m(iy + 1), seed), d = hash2(m(ix + 1), m(iy + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, base, oct, seed) {
  let s = 0, amp = 0.5, tot = 0, p = base;
  for (let o = 0; o < oct; o++) { s += amp * pnoise(x * p, y * p, p, seed + o * 17); tot += amp; amp *= 0.5; p *= 2; }
  return s / tot;
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
}

/** Procedural stand-in for a texture name. Returns a canvas. */
export function proceduralCanvas(name, size = 128) {
  const c = makeCanvas(size, size);
  const g = c.getContext("2d");
  if (name.startsWith("foliage_")) { drawFoliageCard(g, name, size); return c; }
  const base = BASE_COLOR[name] ?? 0x808080;
  const br = (base >> 16) & 255, bg = (base >> 8) & 255, bb = base & 255;
  const img = g.createImageData(size, size);
  const seed = name.length * 131 + name.charCodeAt(name.length - 1);
  const bark = name.startsWith("bark_");
  const gravel = name === "road_gravel" || name === "road_pumice" || name === "gnd_sand";
  const grass = name === "gnd_grass2" || name === "gnd_tussock" || name === "gnd_fern";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let n = fbm(u, v, 4, 4, seed);
      if (bark) n = 0.55 * fbm(u * 1, v * 0.12, 10, 3, seed) + 0.45 * n; // vertical furrows
      let k = 0.62 + 0.75 * (n - 0.5);
      if (gravel) k += (hash2(x, y, seed) - 0.5) * 0.28;
      else if (grass) k += (fbm(u, v, 24, 2, seed + 5) - 0.5) * 0.45;
      else k += (hash2(x, y, seed) - 0.5) * 0.08;
      const o = (y * size + x) * 4;
      img.data[o] = Math.max(0, Math.min(255, br * k * 1.4)); img.data[o + 1] = Math.max(0, Math.min(255, bg * k * 1.4));
      img.data[o + 2] = Math.max(0, Math.min(255, bb * k * 1.4)); img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

function drawFoliageCard(g, name, S) {
  g.clearRect(0, 0, S, S);
  let seed = name.length * 7;
  const R = () => hash2(seed++, 77, 5);
  const col = (h, s, l) => `hsl(${h},${s}%,${l}%)`;
  if (name === "foliage_pine") {
    g.strokeStyle = col(28, 40, 20); g.lineWidth = S * 0.02;
    g.beginPath(); g.moveTo(S * 0.5, S); g.lineTo(S * 0.5, S * 0.05); g.stroke();
    for (let i = 0; i < 90; i++) {
      const t = R(), y = S * (0.08 + 0.9 * t), side = R() < 0.5 ? -1 : 1, len = S * (0.12 + 0.3 * (1 - Math.abs(t - 0.45)));
      const a = side * (0.5 + R() * 0.7);
      g.strokeStyle = col(112 + R() * 20, 45, 18 + R() * 14); g.lineWidth = S * 0.012;
      g.beginPath(); g.moveTo(S * 0.5, y); g.lineTo(S * 0.5 + Math.sin(a) * len, y - Math.cos(a) * len * 0.5 + len * 0.25); g.stroke();
    }
  } else if (name === "foliage_fern") {
    g.strokeStyle = col(100, 40, 22); g.lineWidth = S * 0.012;
    g.beginPath(); g.moveTo(S * 0.5, S); g.quadraticCurveTo(S * 0.52, S * 0.5, S * 0.5, S * 0.04); g.stroke();
    for (let i = 0; i < 26; i++) {
      const t = i / 26, y = S * (0.96 - 0.9 * t), len = S * 0.33 * Math.sin(Math.PI * (0.1 + 0.9 * t) * 0.9 + 0.3);
      for (const sd of [-1, 1]) {
        g.strokeStyle = col(105 + R() * 15, 55, 24 + R() * 12); g.lineWidth = S * 0.02;
        g.beginPath(); g.moveTo(S * 0.5, y); g.lineTo(S * 0.5 + sd * len, y - len * 0.45); g.stroke();
      }
    }
  } else if (name === "foliage_broadleaf") {
    g.strokeStyle = col(30, 35, 22); g.lineWidth = S * 0.015;
    g.beginPath(); g.moveTo(S * 0.5, S); g.quadraticCurveTo(S * 0.35, S * 0.5, S * 0.55, S * 0.05); g.stroke();
    for (let i = 0; i < 38; i++) {
      const t = R(), x = S * (0.5 + (R() - 0.5) * 0.7 * (1 - t * 0.4)), y = S * (0.08 + t * 0.85), a = R() * 6.28;
      g.fillStyle = col(98 + R() * 30, 50, 20 + R() * 18);
      g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.ellipse(0, 0, S * 0.09, S * 0.045, 0, 0, 6.28); g.fill(); g.restore();
    }
  } else { // flax / grass: fan of blades
    const n = name === "foliage_flax" ? 14 : 24;
    for (let i = 0; i < n; i++) {
      const a = (R() - 0.5) * (name === "foliage_flax" ? 1.1 : 0.9), h = S * (0.55 + R() * 0.4), bx = S * (0.5 + (R() - 0.5) * 0.22);
      g.fillStyle = col(name === "foliage_flax" ? 95 + R() * 20 : 78 + R() * 25, 50, 22 + R() * 20);
      g.beginPath(); g.moveTo(bx - S * 0.02, S); g.quadraticCurveTo(bx + Math.sin(a) * h * 0.5, S - h * 0.6, bx + Math.sin(a) * h, S - Math.cos(a) * h); g.quadraticCurveTo(bx + Math.sin(a) * h * 0.5 + S * 0.02, S - h * 0.55, bx + S * 0.02, S); g.fill();
    }
  }
}

function loadImage(url) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.decoding = "async";
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("img " + url));
    im.src = url;
  });
}

function halve(img) {
  const w = Math.max(64, (img.naturalWidth || img.width) >> 1), h = Math.max(64, (img.naturalHeight || img.height) >> 1);
  const c = makeCanvas(w, h); c.getContext("2d").drawImage(img, 0, 0, w, h); return c;
}

/**
 * @returns {Promise<{get(name), getNormal(name), source(name), isReal(name), meters(name), real:Set, dispose()}>}
 */
export async function loadTextureSet(THREE, { quality = "high", anisotropy = 4, texScale = 1, onProgress, baseUrl } = {}) {
  const base = baseUrl ?? new URL("../assets/tex/", import.meta.url).href;
  const cache = new Map(), normals = new Map(), sources = new Map(), meters = new Map(), real = new Set();
  let manifest = null;
  try {
    const r = await fetch(base + "manifest.json", { cache: "no-cache" });
    if (r.ok) manifest = await r.json();
  } catch { /* procedural only */ }
  const all = manifest?.textures ? Object.entries(manifest.textures) : [];
  const entries = all.filter(([n]) => !LAZY_TEX.has(n)); // stage-specific ones are fetched by ensure()
  const lazyEntries = new Map(all.filter(([n]) => LAZY_TEX.has(n)));
  let done = 0;
  const loadOne = async (name, e) => {
    try {
      let img = await loadImage(base + e.file);
      if (texScale < 1 && !e.alpha) img = halve(img);
      sources.set(name, img);
      meters.set(name, e.meters ?? 4);
      real.add(name);
      if (e.normal) {
        try {
          let ni = await loadImage(base + e.normal);
          normals.set(name, ni);
        } catch { /* no normal */ }
      }
    } catch { /* leave to fallback */ }
  };
  await Promise.all(entries.map(async ([name, e]) => { await loadOne(name, e); done++; onProgress?.(done / Math.max(1, entries.length), "textures"); }));

  const mk = (img, srgb) => {
    const t = new THREE.Texture(img);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = anisotropy;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  };
  const api = {
    real,
    /** Fetch stage-specific textures (idempotent). Call before building the materials that read them. */
    async ensure(names) {
      await Promise.all(names.filter((n) => lazyEntries.has(n) && !real.has(n)).map((n) => loadOne(n, lazyEntries.get(n))));
    },
    isReal: (n) => real.has(n),
    meters: (n) => meters.get(n) ?? (n.startsWith("road_") ? 3 : n.startsWith("bark_") || n.startsWith("foliage_") ? 1.5 : 6),
    /** Drawable (Image/canvas) for atlases. */
    source(n) {
      if (!sources.has(n)) sources.set(n, proceduralCanvas(n, n.startsWith("foliage_") ? 256 : 128));
      return sources.get(n);
    },
    get(n) {
      if (!cache.has(n)) cache.set(n, mk(api.source(n), true));
      return cache.get(n);
    },
    getNormal(n) {
      if (!normals.has(n)) return null;
      const k = n + ":n";
      if (!cache.has(k)) cache.set(k, mk(normals.get(n), false));
      return cache.get(k);
    },
    setAnisotropy(a) { anisotropy = a; for (const t of cache.values()) { t.anisotropy = a; } },
    dispose() { for (const t of cache.values()) t.dispose(); cache.clear(); },
  };
  return api;
}
