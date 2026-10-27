// City: streams the chunked GLBs (A2), classifies meshes into layers, drives x-ray / layer visibility / fade-in.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { lerp } from './util.js';
import { placeholderCityData } from './placeholder.js';

const LAYER_RE = /^(terrain|buildings?|roads?|water|green|rail|landmarks?)/i;
const LAYER_ALIAS = { building: 'buildings', road: 'roads', landmark: 'landmarks' };
// x-ray end-state opacity per layer (x = 1)
// Draped layers sit a few cm above the terrain; at distance the depth buffer can't resolve that and they z-fight.
// Units-only negative polygon offsets (a few depth quanta; NO slope factor - at grazing angles a slope factor shoves layers metres
// through bridge decks and each other, which flickers). The real fix for far-field fighting is the larger near plane (app.js).
const LAYER_OFFSET = {};
const XRAY_MIN = { terrain: 0.13, buildings: 0.07, landmarks: 0.12, roads: 0.28, green: 0.18, water: 0.42, rail: 0.3 };

export class City {
  constructor({ scene, env, base, manifest, ground, bounds, quality, onProgress }) {
    Object.assign(this, { scene, env, base, manifest, ground, bounds, quality, onProgress });
    this.root = new THREE.Group(); this.root.name = 'city'; scene.add(this.root);
    this.recs = []; this.chunks = []; this.xray = 0; this.nightGlow = 0;
    this.layerOn = { terrain: true, buildings: true, landmarks: true, roads: true, water: true, green: true, rail: true };
    this.queue = []; this.ready = []; this.active = 0; this.loaded = 0; this.total = 0; this.failed = 0; this.fading = new Set();
    this.hasTerrain = false; this.layersSeen = new Set();
    this.gltf = new GLTFLoader();
    const draco = new DRACOLoader(); draco.setDecoderPath(new URL('vendor/three/examples/jsm/libs/draco/gltf/', base).href); draco.setDecoderConfig({ type: 'wasm' });
    this.gltf.setDRACOLoader(draco); this.gltf.setMeshoptDecoder(MeshoptDecoder);
  }
  async init() {
    if (!this.manifest) {
      const g = placeholderCityData(THREE, this.ground, this.bounds);
      this.root.add(g); this.register(g, { appear: 1 }); this.total = 1; this.loaded = 1; this.placeholder = true; this.hasTerrain = true;
      this.applyAll(); return;
    }
    try { // coarse whole-area underlay so nothing beyond the loaded chunks looks empty
      const ov = await this.gltf.loadAsync(new URL('data/city/overview.glb', this.base).href);
      ov.scene.name = 'overview'; ov.scene.position.y = -14; this.root.add(ov.scene); this.overview = { appear: 1, hidden: false, overview: true };
      this.register(ov.scene, this.overview);
      // The overview's merged building masses are taller than the detailed chunks, so they would hide them.
      // Cut them out exactly where a detailed chunk has loaded (a coarse grid mask), so nothing goes blank while
      // chunks stream in and nothing moves when the camera does.
      this.buildMask();
      for (const r of this.recs) if (r.chunk === this.overview) for (const m of r.mats) {
        m.polygonOffset = true; m.polygonOffsetFactor = 4; m.polygonOffsetUnits = 4;
        if (r.layer === 'buildings') {
          m.onBeforeCompile = (sh) => {
            sh.uniforms.uMask = this.maskU.tex; sh.uniforms.uMaskO = this.maskU.o;
            sh.vertexShader = 'varying vec3 vOvWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vOvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
            sh.fragmentShader = 'varying vec3 vOvWP; uniform sampler2D uMask; uniform vec4 uMaskO;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n if (texture2D(uMask, (vOvWP.xz - uMaskO.xy) * uMaskO.zw).r > 0.5) discard;');
          };
          m.customProgramCacheKey = () => 'ovmask'; m.needsUpdate = true;
        }
      }
    } catch (e) { this.overview = null; }
    this.chunks = this.manifest.chunks.map((c) => ({ ...c, cx: (c.minX + c.maxX) / 2, cz: (c.minZ + c.maxZ) / 2, state: 'idle', appear: 0, group: null }));
    this.total = this.chunks.length;
  }
  buildMask() {
    const cs = this.manifest.chunks; if (!cs.length) return;
    const cell = cs[0].maxX - cs[0].minX;
    const x0 = Math.min(...cs.map((c) => c.minX)), z0 = Math.min(...cs.map((c) => c.minZ));
    const W = Math.ceil((Math.max(...cs.map((c) => c.maxX)) - x0) / cell), H = Math.ceil((Math.max(...cs.map((c) => c.maxZ)) - z0) / cell);
    this.mask = { x0, z0, cell, W, H, data: new Uint8Array(W * H) };
    const tex = new THREE.DataTexture(this.mask.data, W, H, THREE.RedFormat, THREE.UnsignedByteType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true;
    this.maskU = { tex: { value: tex }, o: { value: new THREE.Vector4(x0, z0, 1 / (W * cell), 1 / (H * cell)) } };
  }
  setMask(c, on) {
    const m = this.mask; if (!m) return;
    const i = Math.round((c.minX - m.x0) / m.cell), j = Math.round((c.minZ - m.z0) / m.cell);
    if (i < 0 || j < 0 || i >= m.W || j >= m.H) return;
    m.data[j * m.W + i] = on ? 255 : 0; this.maskU.tex.value.needsUpdate = true;
  }
  layerOf(obj) {
    for (let o = obj; o; o = o.parent) { const m = LAYER_RE.exec(o.name || ''); if (m) { const k = m[1].toLowerCase(); return LAYER_ALIAS[k] || k; } }
    return 'buildings';
  }
  register(root, chunk) {
    root.traverse((o) => {
      o.matrixAutoUpdate = false; o.updateMatrix();
      if (!o.isMesh && !o.isLine && !o.isPoints) return;
      const layer = this.layerOf(o); this.layersSeen.add(layer); if (layer === 'terrain') this.hasTerrain = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const cloned = mats.map((m) => { const c = m.clone(); c.userData.base = { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite, emissive: m.emissive ? m.emissive.clone() : null }; c.userData.layer = layer; return c; });
      for (const c of cloned) { // crisp texture sampling at grazing angles (facades, roads)
        for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) if (c[k]) c[k].anisotropy = 1;
        if (layer === 'water' && c.roughness < 0.8) { c.roughness = 0.85; c.metalness = 0; c.userData.base.rough = 0.85; } // flat water + glossy sun = whole river flashing
      }
      const po = LAYER_OFFSET[layer];
      if (po) for (const c of cloned) { c.polygonOffset = true; c.polygonOffsetFactor = po[0]; c.polygonOffsetUnits = po[1]; }
      o.material = Array.isArray(o.material) ? cloned : cloned[0];
      o.userData.layer = layer; o.userData.chunk = chunk;
      o.renderOrder = layer === 'terrain' ? 2 : layer === 'water' ? 3 : layer === 'roads' || layer === 'green' ? 3 : 4;
      if (o.isMesh && layer !== 'terrain' && !chunk.noCull) o.frustumCulled = true;
      this.recs.push({ obj: o, mats: cloned, layer, chunk });
    });
  }
  factor(layer) { return lerp(1, XRAY_MIN[layer] ?? 0.2, this.xray); }
  applyRec(r) {
    const f = this.factor(r.layer) * r.chunk.appear;
    const vis = this.layerOn[r.layer] !== false && f > 0.012 && !r.chunk.hidden;
    r.obj.visible = vis; if (!vis) return;
    const night = this.env.emis;
    for (const m of r.mats) {
      const b = m.userData.base; m.opacity = b.opacity * f;
      const solid = f > 0.985 && !b.transparent;
      if (m.transparent !== !solid) { m.transparent = !solid; m.needsUpdate = true; }
      m.depthWrite = solid ? b.depthWrite : false;
      if (r.layer === 'buildings' || r.layer === 'landmarks') { if (m.emissive) { m.emissive.setRGB(0.3 * night, 0.22 * night, 0.1 * night); m.emissiveIntensity = 0.25; } }
    }
  }
  applyAll() { for (const r of this.recs) this.applyRec(r); }
  setXray(v) { this.xray = v; this.applyAll(); }
  setLayer(name, on) { this.layerOn[name] = on; this.applyAll(); }
  get terrainMeshes() { return this.recs.filter((r) => r.layer === 'terrain').map((r) => r.obj); }

  update(dt, target) {
    if (this.ready.length) this.attach(this.ready.shift());
    if (this.manifest) {
      const lim = this.quality.chunkRadius;
      let n = 0;
      for (const c of this.chunks) {
        c.dist = Math.hypot(c.cx - target.x, c.cz - target.z);
        if (c.state === 'idle' && c.dist < lim) n++;
        else if (c.state === 'loaded' && lim < Infinity && c.dist > lim * 1.9) this.unload(c);
      }
      if (this.overview && !this.overview.hidden && lim === Infinity && !n && this.active === 0 && this.loaded + this.failed >= this.total) { this.overview.hidden = true; this.applyAll(); }
      if (n && this.active < this.quality.chunkParallel) {
        const cand = this.chunks.filter((c) => c.state === 'idle' && c.dist < lim).sort((a, b) => a.dist - b.dist);
        for (const c of cand) { if (this.active >= this.quality.chunkParallel) break; this.load(c); }
      }
    }
    if (this.fading.size) {
      const done = [];
      for (const c of this.fading) { c.appear = Math.min(1, c.appear + dt / 0.9); if (c.appear >= 1) done.push(c); }
      const fadingNow = new Set(this.fading);
      for (const r of this.recs) if (fadingNow.has(r.chunk)) this.applyRec(r);
      done.forEach((c) => this.fading.delete(c));
    }
  }
  async load(c) {
    c.state = 'loading'; this.active++;
    try {
      const gltf = await this.gltf.loadAsync(new URL('data/city/' + c.file, this.base).href);
      this.ready.push({ c, gltf }); // attached one per frame (see update) so streaming never causes a frame-time spike
    } catch (e) { c.state = 'failed'; this.failed++; this.active--; console.warn('chunk failed', c.file, e.message); this.onProgress?.(this.loaded + this.failed, this.total); }
  }
  attach({ c, gltf }) {
    this.active--;
    if (c.state !== 'loading') { this.disposeObj(gltf.scene); return; }
    c.group = gltf.scene; c.group.name = c.file; this.root.add(c.group); this.register(c.group, c);
    c.state = 'loaded'; c.appear = 1; this.setMask(c, true);
    for (const r of this.recs) if (r.chunk === c) this.applyRec(r);
    this.loaded++; this.onProgress?.(this.loaded + this.failed, this.total);
  }
  unload(c) {
    if (!c.group) return; this.root.remove(c.group); this.disposeObj(c.group);
    this.recs = this.recs.filter((r) => r.chunk !== c); c.group = null; c.state = 'idle'; c.appear = 0; this.loaded--; this.setMask(c, false);
  }
  disposeObj(o) { o.traverse((x) => { x.geometry?.dispose?.(); const m = x.material; if (m) (Array.isArray(m) ? m : [m]).forEach((q) => { for (const k in q) if (q[k]?.isTexture) q[k].dispose(); q.dispose(); }); }); }
  /** Resolves once at least `n` chunks (or all) are loaded. */
  whenLoaded(n = Infinity, timeoutMs = 60000) {
    return new Promise((res) => {
      const t0 = performance.now();
      const chk = () => { const elig = this.chunks.filter((c) => c.dist < this.quality.chunkRadius).length || this.total; if (!this.manifest || this.loaded + this.failed >= Math.min(n, elig) || performance.now() - t0 > timeoutMs) res(); else setTimeout(chk, 100); };
      chk();
    });
  }
  /** Resolves once every chunk whose centre lies within `radius` m of `target` has loaded (or failed). */
  whenNearLoaded(target, radius = 750, timeoutMs = 40000) {
    return new Promise((res) => {
      const t0 = performance.now();
      const chk = () => {
        if (!this.manifest) return res();
        this.update(0.016, target);
        const near = this.chunks.filter((c) => Math.hypot(c.cx - target.x, c.cz - target.z) < radius);
        if (near.every((c) => c.state === 'loaded' || c.state === 'failed') || performance.now() - t0 > timeoutMs) res(); else setTimeout(chk, 120);
      };
      chk();
    });
  }
  /** Fallback ground if A2 didn't ship terrain meshes. */
  addFallbackTerrain() {
    if (this.hasTerrain || !this.manifest) return;
    const g = placeholderCityData(THREE, this.ground, this.bounds); g.children = g.children.filter((o) => o.name.startsWith('terrain'));
    this.root.add(g); this.register(g, { appear: 1 }); this.applyAll();
  }
  stats() { return { loaded: this.loaded, total: this.total, failed: this.failed, layers: [...this.layersSeen] }; }
}
