// Material library. Every module declares the materials it needs in its own `matdefs.js`
// (name -> definition); this file merges them and builds shared MeshStandardMaterials on demand.
// Textures are bound BY NAME from assets/textures/manifest.json (produced by the texture pipeline),
// so a module can declare a material today with a flat colour and it picks up its texture later
// with no code change.
//
//   ctx.mat('plaster_a')            shared material
//   ctx.mat('plaster_a#d9a441')     same material, tinted (colour multiplies the texture) - one texture, many paints
//
// matdef fields: { color, rough, metal, tile, uv:'metric'|'unit', tex, normal, emissive, emissiveIntensity,
//                  alpha, alphaTest, side:'double', vertexColors (default true), env, desc, prio, glow }
//   tile  - metres per texture repeat for uv:'metric' materials (geometry UVs are in metres)
//   uv    - 'unit' = decal-style 0..1 UVs (posters, signs, product labels): never repeated
//   tex   - texture basename in the manifest (default: the material's own name); false = never textured
//   desc  - plain-language brief for the texture generator (what the real-world surface looks like)
//   prio  - 1|2|3 generation order for the texture factory (1 = needed first)
//   glow  - emissive intensity at FULL NIGHT (the engine drives emissiveIntensity = glow * ctx.night); `window_lit` defaults to 2.4
// The manifest entry may carry `tileScale` (< 1 when the processed swatch covers less than `tile` metres): repeat = 1 / (tile * tileScale).
import * as THREE from 'three';
import engine from '../engine/matdefs.js';
import world from '../world/matdefs.js';
import arch from '../arch/matdefs.js';
import interiors from '../interiors/matdefs.js';
import people from '../people/matdefs.js';

export const ALL_DEFS = { ...engine, ...world, ...arch, ...interiors, ...people };
export const DEF_OWNERS = Object.fromEntries([['engine', engine], ['world', world], ['arch', arch], ['interiors', interiors], ['people', people]]
  .flatMap(([o, d]) => Object.keys(d).map((k) => [k, o])));

export class MaterialLib {
  constructor(ctx) {
    this.ctx = ctx; this.defs = ALL_DEFS; this.cache = new Map(); this.tex = new Map();
    this.manifest = {}; this.pending = 0; this.missing = new Set(); this.loader = new THREE.TextureLoader();
    this.waiters = [];
    this.anisotropy = 8;                       // the engine raises it to the GPU maximum before any material is made
    this.variants = new Map();                 // base texture -> [clones with their own repeat]
    this.vcache = new Map();
    this.glowing = [];                         // materials whose emissiveIntensity follows ctx.night
  }

  async init() {
    try {
      const r = await fetch('./assets/textures/manifest.json', { cache: 'no-cache' });
      if (r.ok) this.manifest = (await r.json()).textures ?? {};
    } catch { /* no textures yet: flat colours */ }
  }

  has(name) { return !!this.defs[name]; }

  _texture(file, srgb) {
    const k = file + (srgb ? ':s' : ':l');
    let t = this.tex.get(k);
    if (t) return t;
    this.pending++;
    t = this.loader.load('./assets/textures/' + file, () => { for (const v of this.variants.get(t) ?? []) v.needsUpdate = true; this._done(); }, undefined, () => { console.warn('[mat] texture failed', file); this._done(); });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = this.anisotropy;
    this.tex.set(k, t);
    return t;
  }
  /** A texture object with its own repeat that SHARES the base image (one GPU upload however many tile sizes use the file). */
  _variant(base, rep, clamp) {
    const key = `${base.uuid}:${rep.toFixed(5)}:${clamp ? 'c' : 'r'}`;
    let v = this.vcache.get(key);
    if (v) return v;
    v = base.clone(); v.repeat.set(rep, rep);
    if (clamp) v.wrapS = v.wrapT = THREE.ClampToEdgeWrapping;
    this.vcache.set(key, v);
    let list = this.variants.get(base); if (!list) this.variants.set(base, list = []);
    list.push(v);
    // Texture.clone() ends with `needsUpdate = true` (version 1) even when the shared image has not arrived: a frame drawn then makes three log
    // "Texture marked for update but no image data found" once per variant (a console warning = rubric hard cap C1, and a slow link always
    // draws such frames). An empty variant stays at version 0; the loader callback in _texture() marks it when the image lands.
    if (!base.image) v.version = 0;
    return v;
  }
  _done() { if (--this.pending <= 0) { const w = this.waiters.splice(0); w.forEach((f) => f()); } }
  /** Resolves when every texture requested so far has finished loading. */
  whenReady() { return this.pending <= 0 ? Promise.resolve() : new Promise((r) => this.waiters.push(r)); }

  get(key) {
    let m = this.cache.get(key);
    if (m) return m;
    const [name, tint] = key.split('#');
    const d = this.defs[name];
    if (!d) {
      if (!this.missing.has(name)) { this.missing.add(name); console.warn(`[mat] unknown material '${name}'`); }
      m = new THREE.MeshStandardMaterial({ color: 0xff00ff, roughness: 1 });
      this.cache.set(key, m); return m;
    }
    const tex = d.tex === false ? null : this.manifest[typeof d.tex === 'string' ? d.tex : name];
    const baseColor = tint ? parseInt(tint, 16) : (tex ? 0xffffff : (d.color ?? 0xcccccc));
    m = new THREE.MeshStandardMaterial({
      color: baseColor, roughness: d.rough ?? 0.9, metalness: d.metal ?? 0,
      vertexColors: d.vertexColors !== false, envMapIntensity: d.env ?? 0.6,
      side: d.side === 'double' ? THREE.DoubleSide : THREE.FrontSide,
    });
    if (d.emissive != null) { m.emissive = new THREE.Color(d.emissive); m.emissiveIntensity = d.emissiveIntensity ?? 1; }
    if (d.alpha != null && d.alpha < 1) { m.transparent = true; m.opacity = d.alpha; m.depthWrite = d.depthWrite ?? false; }
    if (d.alphaTest != null) m.alphaTest = d.alphaTest;
    if (d.flat) m.flatShading = true;
    m.name = key;
    if (d.glow != null || name === 'window_lit') { m.userData.glow = d.glow ?? 2.4; m.emissiveIntensity = (this.ctx?.night ?? 0) * m.userData.glow; this.glowing.push(m); }
    if (tex) {
      const unit = d.uv === 'unit';
      const rep = unit ? 1 : 1 / ((d.tile ?? 1) * (tex.tileScale ?? 1));
      const bind = (file, srgb) => { const t = this._texture(file, srgb); return (rep === 1 && !unit) ? t : this._variant(t, rep, unit); };
      if (tex.map) m.map = bind(tex.map, true);
      if (tex.normal) { m.normalMap = bind(tex.normal, false); m.normalScale = new THREE.Vector2(d.normalScale ?? 1, d.normalScale ?? 1); }
      if (tex.rough) m.roughnessMap = bind(tex.rough, false);
      if (tex.map && d.alphaFromMap) m.transparent = true;
    }
    this.cache.set(key, m);
    return m;
  }

  /** Names declared by modules (for the texture factory and the unknown-name lint). */
  list() { return Object.entries(this.defs).map(([name, d]) => ({ name, owner: DEF_OWNERS[name], ...d })); }
}
