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
//                  alpha, alphaTest, side:'double', vertexColors (default true), env, desc }
//   tile  - metres per texture repeat for uv:'metric' materials (geometry UVs are in metres)
//   uv    - 'unit' = decal-style 0..1 UVs (posters, signs, product labels): never repeated
//   tex   - texture basename in the manifest (default: the material's own name); false = never textured
//   desc  - plain-language brief for the texture generator (what the real-world surface looks like)
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
    this.anisotropy = 8;
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
    t = this.loader.load('./assets/textures/' + file, () => this._done(), undefined, () => { console.warn('[mat] texture failed', file); this._done(); });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = this.anisotropy;
    this.tex.set(k, t);
    return t;
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
    if (tex) {
      const rep = d.uv === 'unit' ? 1 : 1 / (d.tile ?? 1);
      const bind = (file, srgb) => { const t = this._texture(file, srgb); if (rep !== 1) { t.repeat.set(rep, rep); } if (d.uv === 'unit') { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; } return t; };
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
