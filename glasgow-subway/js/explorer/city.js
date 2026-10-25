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
const XRAY_MIN = { terrain: 0.13, buildings: 0.07, landmarks: 0.12, roads: 0.28, green: 0.18, water: 0.42, rail: 0.3 };

export class City {
  constructor({ scene, env, base, manifest, ground, bounds, quality, onProgress }) {
    Object.assign(this, { scene, env, base, manifest, ground, bounds, quality, onProgress });
    this.root = new THREE.Group(); this.root.name = 'city'; scene.add(this.root);
    this.recs = []; this.chunks = []; this.xray = 0; this.nightGlow = 0;
    this.layerOn = { terrain: true, buildings: true, landmarks: true, roads: true, water: true, green: true, rail: true };
    this.queue = []; this.active = 0; this.loaded = 0; this.total = 0; this.failed = 0; this.fading = new Set();
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
    this.chunks = this.manifest.chunks.map((c) => ({ ...c, cx: (c.minX + c.maxX) / 2, cz: (c.minZ + c.maxZ) / 2, state: 'idle', appear: 0, group: null }));
    this.total = this.chunks.length;
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
    const vis = this.layerOn[r.layer] !== false && f > 0.012;
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
    if (this.manifest) {
      const lim = this.quality.chunkRadius;
      let n = 0;
      for (const c of this.chunks) {
        c.dist = Math.hypot(c.cx - target.x, c.cz - target.z);
        if (c.state === 'idle' && c.dist < lim) n++;
        else if (c.state === 'loaded' && lim < Infinity && c.dist > lim * 1.9) this.unload(c);
      }
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
      if (c.state !== 'loading') { this.disposeObj(gltf.scene); return; }
      c.group = gltf.scene; c.group.name = c.file; this.root.add(c.group); this.register(c.group, c);
      c.state = 'loaded'; c.appear = 0; this.fading.add(c);
      for (const r of this.recs) if (r.chunk === c) this.applyRec(r);
      this.loaded++;
    } catch (e) { c.state = 'failed'; this.failed++; console.warn('chunk failed', c.file, e.message); }
    this.active--;
    this.onProgress?.(this.loaded + this.failed, this.total);
  }
  unload(c) {
    if (!c.group) return; this.root.remove(c.group); this.disposeObj(c.group);
    this.recs = this.recs.filter((r) => r.chunk !== c); c.group = null; c.state = 'idle'; c.appear = 0; this.loaded--;
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
  /** Fallback ground if A2 didn't ship terrain meshes. */
  addFallbackTerrain() {
    if (this.hasTerrain || !this.manifest) return;
    const g = placeholderCityData(THREE, this.ground, this.bounds); g.children = g.children.filter((o) => o.name.startsWith('terrain'));
    this.root.add(g); this.register(g, { appear: 1 }); this.applyAll();
  }
  stats() { return { loaded: this.loaded, total: this.total, failed: this.failed, layers: [...this.layersSeen] }; }
}
