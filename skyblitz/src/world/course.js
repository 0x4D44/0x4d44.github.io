// Course = CourseLayout (pure logic: path, projection, rings, hints, collision) + visuals (sky, terrain, water, wayfinding, launch deck,
// ground-shadow blobs, lights). The definition lives in world/courses/<id>.js, its scenery in <id>-scenery.js. Owner: world agent.
import * as THREE from 'three';
import { CourseLayout } from './layout.js';
import { buildWayfinding } from './wayfinding.js';
import { buildPlatform } from './platform.js';
import { buildBlobs } from './blobs.js';

const yieldFrame = () => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

export class Course extends CourseLayout {
  constructor(def, game) {
    super(def);
    this.id = def.id; this.name = def.name;
    this.group = new THREE.Group(); this.group.name = 'course:' + def.id;
    this.environment = def.environment();
    this.parts = [];            // visual parts: { update(dt, game, course), dispose(), attach?(game), detach?(game) }
    this.owned = [];            // textures / render targets we created and must dispose
    this._lights = []; this.sun = null; this.hemi = null;
    this._attached = null; this.time = 0;
    this._unsub = [];
  }

  /** Visual build. Skipped when there is no renderer (node tests). */
  async build(game, { progress = () => {}, scenery } = {}) {
    if (!game || !game.renderer) return;
    const q = game.q;
    progress(0.1, 'Painting the sky');
    await yieldFrame();
    if (scenery) {
      const mod = await scenery();
      await mod.buildScenery(this, game, (p, l) => progress(0.1 + p * 0.65, l), yieldFrame);
    }
    progress(0.78, 'Placing rings and markers');
    await yieldFrame();
    this.addPart(buildWayfinding(this, game));
    progress(0.88, 'Building the launch deck');
    this.addPart(buildPlatform(this, game));
    this.addPart(buildBlobs(this, game));
    progress(0.95, 'Lighting');
    await yieldFrame();
    this._buildLights(game);
    void q;
  }

  addPart(part) { if (!part) return part; this.parts.push(part); if (part.group) this.group.add(part.group); return part; }

  _buildLights(game) {
    const e = this.environment, q = game.q;
    this.hemi = new THREE.HemisphereLight(e.skyTop.clone().lerp(e.skyHorizon, 0.4), (e.ambientGround || new THREE.Color(0x405040)).clone(), e.hemiIntensity ?? (e.night ? 0.9 : 1.15));
    this.sun = new THREE.DirectionalLight(e.sunColor, e.sunIntensity);
    this.sun.name = 'sun';
    this.sun.castShadow = q.shadows > 0;
    if (q.shadows > 0) {
      const sh = this.sun.shadow;
      sh.mapSize.set(q.shadows, q.shadows);
      const R = 220;
      Object.assign(sh.camera, { left: -R, right: R, top: R, bottom: -R, near: 10, far: 1400 });
      sh.bias = -0.0004; sh.normalBias = 0.6;
      sh.camera.updateProjectionMatrix();
    }
    this._lights = [this.hemi, this.sun, this.sun.target];
    this._shTarget = new THREE.Vector3();
    this._shSnap = new THREE.Vector3();
  }

  attach(game) {
    const e = this.environment, scene = game.scene;
    this._attached = game;
    scene.background = e.fogColor.clone();
    scene.fog = new THREE.FogExp2(e.fogColor, e.fogDensity * (1 / (game.q?.farMul || 1)));
    scene.add(this.group);
    for (const l of this._lights) scene.add(l);
    game.renderer.toneMappingExposure = e.exposure;
    for (const p of this.parts) p.attach?.(game, this);
    const env = this.parts.find((p) => p.envMap)?.envMap;
    if (env) scene.environment = env;
    if (scene.environment && 'environmentIntensity' in scene) scene.environmentIntensity = e.envIntensity ?? 1;
    // countdown gantry lights
    const ev = game.events;
    this._unsub.push(ev.on('race:countdown', (p) => this.parts.forEach((x) => x.onCountdown?.(p.n))));
    this._unsub.push(ev.on('race:go', () => this.parts.forEach((x) => x.onGo?.())));
    this._unsub.push(ev.on('race:ready', () => this.parts.forEach((x) => x.onReady?.())));
  }

  detach(game) {
    const scene = (game || this._attached)?.scene;
    for (const u of this._unsub) { try { if (typeof u === 'function') u(); } catch { /* ignore */ } }
    this._unsub.length = 0;
    if (scene) {
      scene.remove(this.group);
      for (const l of this._lights) scene.remove(l);
      scene.background = null; scene.fog = null;
      if (scene.environment && this.parts.some((p) => p.envMap === scene.environment)) scene.environment = null;
    }
    for (const p of this.parts) p.detach?.(game || this._attached);
    this._attached = null;
  }

  /** Focus point for sky/shadow/water following: the human racer, else the race leader, else the camera. */
  _focus(game, out) {
    const r = game.player || game.race?.racers?.[0];
    if (r && r.render) return out.copy(r.render.pos);
    return out.copy(game.camera.position);
  }

  update(dt, game) {
    this.time += dt;
    const focus = this._focus(game, this._shTarget);
    const cam = game.camera;
    if (this.sun) {
      // sun + shadow frustum follow the focus, snapped to the shadow texel grid so edges do not shimmer
      const e = this.environment, size = game.q.shadows || 1024, texel = (2 * 220) / size;
      this._shSnap.copy(focus);
      this._shSnap.x = Math.round(this._shSnap.x / texel) * texel; this._shSnap.y = Math.round(this._shSnap.y / texel) * texel; this._shSnap.z = Math.round(this._shSnap.z / texel) * texel;
      this.sun.target.position.copy(this._shSnap);
      this.sun.position.copy(this._shSnap).addScaledVector(e.sunDir, 700);
      this.sun.target.updateMatrixWorld();
      this.sun.castShadow = game.q.shadows > 0;
    }
    for (const p of this.parts) p.update?.(dt, game, this, cam, focus);
  }

  dispose() {
    for (const p of this.parts) p.dispose?.();
    this.parts.length = 0;
    this.group.traverse((o) => {
      if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
      const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose?.());
    });
    this.group.clear();
    for (const t of this.owned) t.dispose?.();
    this.owned.length = 0;
    this.sun?.shadow?.map?.dispose?.();
    this._lights.length = 0;
  }
}
