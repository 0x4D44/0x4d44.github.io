// Course = CourseLayout (pure logic: path, projection, rings, hints, collision) + visuals (sky, terrain, water, wayfinding, launch deck,
// ground-shadow blobs, lights). The definition lives in world/courses/<id>.js, its scenery in <id>-scenery.js. Owner: world agent.
import * as THREE from 'three';
import { SIM_DT } from '../config.js';
import { CourseLayout } from './layout.js';
import { buildWayfinding } from './wayfinding.js';
import { buildPlatform } from './platform.js';
import { buildBlobs } from './blobs.js';

const yieldFrame = () => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

/** E-06: free the textures a course BAKES per race (data / canvas: shore masks, signs, decals) that a material holds, as a map or a uniform. UniformsUtils.merge()
 *  CLONES texture values, so a part that disposes the texture it created frees one nobody uploaded while the clone on the material keeps its GL texture for good.
 *  Loaded images (game.assets) are plain Textures and shared between races: they stay. */
const baked = (t) => !!t && t.isTexture && (t.isDataTexture || t.isCanvasTexture);
function disposeBaked(m) {
  for (const k in m) if (baked(m[k])) m[k].dispose();
  if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k]?.value; if (baked(v)) v.dispose(); }
}

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
    this._initHazardMotion();
  }

  // ---------------------------------------------------------------- moving hazards (E-04)
  /** Which hazards move, and the frame they move in. Their pose is set to the t = 0 pose here, so a countdown (clock stays 0) draws them where they start. */
  _initHazardMotion() {
    this._movers = []; this.hazardTime = 0;
    const f = {};
    for (const h of this.hazards) {
      const lat = !!(h.data && h.data.axis);
      if (!lat && !(h.kind === 'balloon' && h.sway)) continue;
      h.vel = new THREE.Vector3();
      if (lat) { (h.branch >= 0 ? this.branches[h.branch] : this.path).frameAt(h.s, f); h.motion = { right: f.right.clone(), tan: f.tangent.clone() }; }
      this._movers.push(h);
    }
    this.stepHazards(0);
  }

  /** Moving hazards (sunrise balloons, neon hovercars and blimps) are a pure function of the race clock `t`, advanced ONLY by Race.fixedUpdate: h.pos / h.vel
   *  are what collide(), the AI and the scenery meshes read. The render loop never moves them, so a headless sim, a render-every-step run and a
   *  render-every-third-step run all see the same hazards. Formulas are the ones the scenery used to run on render time. */
  stepHazards(t) {
    this.hazardTime = t;
    for (const h of this._movers) {
      const m = h.motion, d = h.data;
      if (!m) {                                                      // balloon: sways in x and y around home
        const a = t * 0.5 + h.phase, b = t * 0.7 + h.phase * 2, s = h.sway;
        h.pos.set(h.home.x + Math.sin(a) * s, h.home.y + Math.sin(b) * s * 0.4, h.home.z);
        h.vel.set(Math.cos(a) * 0.5 * s, Math.cos(b) * 0.7 * s * 0.4, 0);
        continue;
      }
      const w = (Math.PI * 2) / (d.period || 8), amp = d.amp || 20, ph = t * w + h.phase;
      h.pos.copy(h.home); h.vel.set(0, 0, 0);
      if (d.axis === 'vertical') {                                   // up and down, with a quarter-amplitude slow drift across the lane
        const k = amp * 0.25;
        h.pos.y += amp * Math.sin(ph); h.vel.y = amp * w * Math.cos(ph);
        h.pos.addScaledVector(m.right, k * Math.sin(ph * 0.5)); h.vel.addScaledVector(m.right, k * 0.5 * w * Math.cos(ph * 0.5));
      } else {                                                       // across the lane
        h.pos.addScaledVector(m.right, amp * Math.sin(ph)); h.vel.addScaledVector(m.right, amp * w * Math.cos(ph));
      }
    }
  }

  /** Where the scenery draws a moving hazard this frame: its fixed-step pose pulled back by the part of the step not yet played, so it interpolates
   *  like the racers (Race.render lerps prev -> current by alpha = game.acc / SIM_DT). Manual (test) mode draws the exact pose. */
  hazardRenderPos(h, out, game) {
    const a = !game || game.manual || typeof game.acc !== 'number' ? 1 : Math.min(1, Math.max(0, game.acc / SIM_DT));
    return out.copy(h.pos).addScaledVector(h.vel, -(1 - a) * SIM_DT);
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
      const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.dispose?.(); disposeBaked(x); });
      if (o.isInstancedMesh) o.dispose();            // instanceMatrix / instanceColor are GL buffers of their own: geometry.dispose() never frees them (E-06)
    });
    this.group.clear();
    for (const t of this.owned) t.dispose?.();
    this.owned.length = 0;
    this.sun?.shadow?.map?.dispose?.();
    this._lights.length = 0;
  }
}
