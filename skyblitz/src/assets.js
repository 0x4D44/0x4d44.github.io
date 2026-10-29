// Texture manifest + loader with graceful fallbacks. Owner: lead.
// Files live in skyblitz/assets/tex/. A missing/failed file NEVER throws: you get a neutral placeholder and a one-time console.warn.
// colour = 'srgb' for albedo/emissive/sprites, 'linear' for normal/noise/mask data.
// cols/rows describe atlases (row-major from the TOP-LEFT cell, index = row * cols + col).
import * as THREE from 'three';

const T = (file, colour, extra = {}) => ({ file, colour, wrap: 'repeat', ...extra });
export const TEXTURES = {
  rock_red:        T('rock_red.webp', 'srgb'),
  rock_red_n:      T('rock_red_n.png', 'linear'),
  rock_grey:       T('rock_grey.webp', 'srgb'),
  rock_grey_n:     T('rock_grey_n.png', 'linear'),
  grass:           T('grass.webp', 'srgb'),
  sand:            T('sand.webp', 'srgb'),
  snow:            T('snow.webp', 'srgb'),
  ice:             T('ice.webp', 'srgb'),
  concrete:        T('concrete.webp', 'srgb'),
  metal_deck:      T('metal_deck.webp', 'srgb'),
  water_n:         T('water_n.png', 'linear'),
  foam:            T('foam.webp', 'linear'),
  noise:           T('noise.png', 'linear'),
  facade_atlas:    T('facade_atlas.webp', 'srgb', { cols: 4, rows: 4 }),
  facade_emissive: T('facade_emissive.png', 'srgb', { cols: 4, rows: 4 }),
  neon_signs:      T('neon_signs.webp', 'srgb', { cols: 4, rows: 2, wrap: 'clamp' }),
  stars:           T('stars.webp', 'srgb', { wrap: 'repeat-x' }),
  aurora:          T('aurora.png', 'srgb', { wrap: 'repeat-x' }),
  sun_glow:        T('sun_glow.png', 'srgb', { wrap: 'clamp' }),
  cloud_atlas:     T('cloud_atlas.png', 'srgb', { cols: 4, rows: 4, wrap: 'clamp' }),
  smoke_atlas:     T('smoke_atlas.png', 'srgb', { cols: 4, rows: 4, wrap: 'clamp' }),
  explosion_atlas: T('explosion_atlas.png', 'srgb', { cols: 4, rows: 4, wrap: 'clamp' }),
  spark:           T('spark.png', 'srgb', { wrap: 'clamp' }),
  flare_atlas:     T('flare_atlas.png', 'srgb', { cols: 4, rows: 1, wrap: 'clamp' }),
  shockwave:       T('shockwave.png', 'srgb', { wrap: 'clamp' }),
  lightning_atlas: T('lightning_atlas.png', 'srgb', { cols: 4, rows: 2, wrap: 'clamp' }),
};

function placeholder(name) {
  const flatNormal = name.endsWith('_n');
  const rgba = flatNormal ? [128, 128, 255, 1] : /atlas|spark|glow|shockwave|aurora/.test(name) ? [255, 255, 255, 0] : /emissive/.test(name) ? [0, 0, 0, 1] : [150, 150, 150, 1];
  const c = document.createElement('canvas'); c.width = c.height = 2;
  const g = c.getContext('2d'); g.fillStyle = `rgba(${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3]})`; g.fillRect(0, 0, 2, 2);
  const tex = new THREE.Texture(c); // a plain Texture (not DataTexture) so the real image can replace the canvas later
  tex.needsUpdate = true;
  tex.userData.placeholder = true;
  return tex;
}

export class Assets {
  constructor(renderer, base = new URL('../assets/tex/', import.meta.url).href) {
    this.renderer = renderer; this.base = base; this.cache = new Map(); this.warned = new Set(); this.failed = new Set();
    this.loader = new THREE.TextureLoader();
  }
  has(name) { const t = this.cache.get(name); return !!t && !t.userData.placeholder; }
  /** Synchronous: returns the loaded texture, or a placeholder (the real one swaps its image in when it arrives). */
  tex(name) {
    let t = this.cache.get(name);
    if (!t) { this._start(name); t = this.cache.get(name); }
    return t;
  }
  /** Atlas helper: fills out = Vector4(u0, v0, du, dv) for cell `index` (row-major from top-left; v is flipped for three's origin). */
  uv(name, index, out = new THREE.Vector4()) {
    const d = TEXTURES[name] || {}; const cols = d.cols || 1, rows = d.rows || 1;
    const c = index % cols, r = Math.floor(index / cols) % rows;
    return out.set(c / cols, 1 - (r + 1) / rows, 1 / cols, 1 / rows);
  }
  atlas(name) { const d = TEXTURES[name] || {}; return { texture: this.tex(name), cols: d.cols || 1, rows: d.rows || 1 }; }
  /** Await real files for the given names (all of them if omitted). Never rejects. */
  async preload(names = Object.keys(TEXTURES), onProgress) {
    let done = 0;
    await Promise.all(names.map((n) => this._start(n).finally(() => { done++; onProgress?.(done / names.length); })));
  }
  _configure(tex, d) {
    tex.colorSpace = d.colour === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    const rep = d.wrap === 'clamp' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    tex.wrapS = d.wrap === 'clamp' ? rep : THREE.RepeatWrapping; tex.wrapT = d.wrap === 'repeat-x' || d.wrap === 'clamp' ? THREE.ClampToEdgeWrapping : rep;
    tex.anisotropy = this.renderer ? Math.min(8, this.renderer.capabilities.getMaxAnisotropy()) : 1;
    tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
  }
  _start(name) {
    if (this.cache.has(name) && this.cache.get(name).userData.promise) return this.cache.get(name).userData.promise;
    const d = TEXTURES[name];
    const ph = placeholder(name);
    this.cache.set(name, ph);
    if (!d) { this._warn(name, 'unknown texture name'); return Promise.resolve(ph); }
    const promise = new Promise((resolve) => {
      this.loader.load(this.base + d.file, (real) => {
        // Swap the real image into the already-handed-out placeholder so materials that hold it update in place.
        ph.dispose();                       // size may change: drop any GPU storage made for the 2x2 canvas
        ph.image = real.image;
        this._configure(ph, d);
        ph.userData.placeholder = false;
        resolve(ph);
      }, undefined, () => { this.failed.add(name); this._warn(name, 'failed to load ' + d.file); resolve(ph); });
    });
    ph.userData.promise = promise;
    return promise;
  }
  _warn(name, msg) { if (!this.warned.has(name)) { this.warned.add(name); console.warn(`[assets] ${name}: ${msg}`); } }
}
