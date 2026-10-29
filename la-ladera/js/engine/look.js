// Lighting + atmosphere (owner: A1): time of day, sun/moon, sky dome, aerial haze, stabilised shadows, image-based sky light,
// indoor adaptation and the night state (`ctx.night`, `window_lit` glow).
//
//   const look = new Look(ctx, renderer, camera);   look.setHour(17.2);   each frame: look.update(dt)
//   look.state  { hour, elDeg, night, day, sunDir, moonDir, exposure, bloomThreshold, bloomStrength, saturation, indoor }
import * as THREE from 'three';
import { createSky } from './sky.js';
import { installShaderPatches, lookUniforms } from './shaderpatch.js';
import { clamp } from '../core/util.js';

const D2R = Math.PI / 180;
/** La Ladera sits near 6 deg N (Andean Colombia); declination -13 deg = late October. */
export const SITE = { lat: 6, dec: -13 };
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * Direction of the sun (or any body with the given declination) for a clock hour, as a unit vector pointing FROM the scene TOWARD
 * the body in world axes (x east, y up, z south; the hill rises toward -z). Pure: tested in Node.
 */
export function celestial(hour, dec = SITE.dec, lat = SITE.lat, out = {}) {
  const la = lat * D2R, de = dec * D2R, H = (hour - 12) * 15 * D2R;
  const sinEl = Math.sin(la) * Math.sin(de) + Math.cos(la) * Math.cos(de) * Math.cos(H);
  const el = Math.asin(clamp(sinEl, -1, 1)), ce = Math.cos(el);
  const cosAz = ce > 1e-5 ? clamp((Math.sin(de) - sinEl * Math.sin(la)) / (ce * Math.cos(la)), -1, 1) : 1;
  let az = Math.acos(cosAz); if (Math.sin(H) > 0) az = 2 * Math.PI - az;        // afternoon -> west
  out.el = el; out.elDeg = el / D2R; out.az = az;
  out.x = Math.sin(az) * ce; out.y = sinEl; out.z = -Math.cos(az) * ce;
  return out;
}

// Palette by sun elevation (degrees). Colours are sRGB hex (converted to linear by three). Columns:
// el, sun colour, sun intensity, zenith, horizon (= fog), hemi sky, hemi ground, hemi intensity, IBL intensity, exposure,
// fog density, sun-glow amount, cloud amount, stars, bloom threshold, bloom strength, saturation
const ROWS = [
  [-18, 0x000000, 0.00, 0x040a26, 0x142048, 0x4e6cb8, 0x2d3248, 1.90, 1.20, 1.55, 0.0030, 0.00, 0.20, 1.00, 0.85, 0.45, 0.95],
  [-9,  0x000000, 0.00, 0x0a1a52, 0x2f3b6a, 0x4a6ab4, 0x302c3c, 1.70, 1.15, 1.42, 0.0034, 0.10, 0.30, 0.70, 0.90, 0.45, 0.97],
  [-5,  0xff5a22, 0.00, 0x142558, 0x7d5576, 0x5068a8, 0x3a2c30, 1.25, 1.00, 1.24, 0.0036, 0.45, 0.45, 0.30, 1.00, 0.40, 1.00],
  [-2,  0xff5a22, 0.35, 0x1d3470, 0xc46d68, 0x62749f, 0x4b3430, 0.85, 0.85, 1.10, 0.0038, 0.65, 0.60, 0.05, 1.20, 0.35, 1.04],
  [1,   0xff6e2c, 1.05, 0x2a4585, 0xf08a55, 0x7d8cb6, 0x6b4a38, 0.95, 0.95, 1.02, 0.0038, 0.65, 0.70, 0.00, 1.60, 0.32, 1.06],
  [5,   0xff8838, 2.00, 0x32569b, 0xf2a468, 0x8a9cc6, 0x7b5a40, 1.00, 1.00, 0.98, 0.0036, 0.55, 0.75, 0.00, 1.90, 0.30, 1.08],
  [10,  0xffa457, 2.85, 0x3a64aa, 0xe8b88e, 0x94aad0, 0x806247, 1.05, 1.05, 0.96, 0.0034, 0.45, 0.70, 0.00, 2.20, 0.28, 1.08],
  [20,  0xffc88c, 3.35, 0x3478c0, 0xb7cadb, 0x9db8de, 0x84704f, 1.10, 1.10, 0.95, 0.0030, 0.25, 0.60, 0.00, 2.60, 0.22, 1.05],
  [40,  0xffe5c6, 3.70, 0x2c76ca, 0xa9c8e8, 0xa6c2e8, 0x8a7a5a, 1.15, 1.15, 0.94, 0.0028, 0.12, 0.55, 0.00, 3.00, 0.20, 1.03],
  [75,  0xfff3e4, 3.90, 0x2670d0, 0xa6c6ea, 0xaec8ec, 0x8a7a5a, 1.20, 1.20, 0.94, 0.0027, 0.08, 0.55, 0.00, 3.20, 0.20, 1.02],
].map((r) => ({
  el: r[0], sun: new THREE.Color(r[1]), sunI: r[2], zen: new THREE.Color(r[3]), hor: new THREE.Color(r[4]), hemiS: new THREE.Color(r[5]),
  hemiG: new THREE.Color(r[6]), hemiI: r[7], envI: r[8], exp: r[9], fog: r[10], glow: r[11], cloud: r[12], stars: r[13], bloomT: r[14], bloomS: r[15], sat: r[16],
}));
const NUM = ['sunI', 'hemiI', 'envI', 'exp', 'fog', 'glow', 'cloud', 'stars', 'bloomT', 'bloomS', 'sat'];
const COL = ['sun', 'zen', 'hor', 'hemiS', 'hemiG'];

/** Interpolated palette row for a sun elevation in degrees (written into `out`). Pure apart from `out`. */
export function samplePalette(elDeg, out = null) {
  out ??= { sun: new THREE.Color(), zen: new THREE.Color(), hor: new THREE.Color(), hemiS: new THREE.Color(), hemiG: new THREE.Color() };
  let i = 0;
  while (i < ROWS.length - 2 && elDeg > ROWS[i + 1].el) i++;
  const a = ROWS[i], b = ROWS[i + 1], t = clamp((elDeg - a.el) / (b.el - a.el), 0, 1), s = t * t * (3 - 2 * t);
  for (const k of NUM) out[k] = a[k] + (b[k] - a[k]) * s;
  for (const k of COL) out[k].copy(a[k]).lerp(b[k], s);
  return out;
}

/** Indoor / outdoor render settings (blended by look.indoor). */
const INDOOR = { hemi: 0.17, env: 0.10, exposure: 1.22 };
/** When the clock runs (settings.timeFlow): game minutes per real second (a full day = 48 real minutes). */
const FLOW_MIN_PER_SEC = 0.5;

export class Look {
  constructor(ctx, renderer, camera) {
    this.ctx = ctx; this.renderer = renderer; this.camera = camera; this.scene = ctx.scene;
    this.patches = installShaderPatches();
    const scene = this.scene;
    this.pal = samplePalette(10);
    this.sky = createSky();
    scene.add(this.sky.mesh);
    scene.fog = new THREE.FogExp2(0xe8b88e, 0.0034);
    this.hemi = new THREE.HemisphereLight(0x94aad0, 0x806247, 1.0);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffa457, 2.8);
    this.sun.name = 'sun';
    this.sun.castShadow = renderer.shadowMap.enabled;
    scene.add(this.sun, this.sun.target);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null; this.envDirty = true; this.envAt = -1e9; this.time = 0;
    this.shadowHalf = 50; this.shadowDist = 220; this.shadowMap = 4096;
    this.state = {
      hour: ctx.hour, elDeg: 10, night: 0, day: 1, sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3(), exposure: 1,
      bloomThreshold: 2, bloomStrength: 0.3, saturation: 1.05, indoor: 0, sunIntensity: 1,
    };
    this.indoorTarget = 0;
    this._v = new THREE.Vector3(); this._r = new THREE.Vector3(); this._u = new THREE.Vector3(); this._c = new THREE.Vector3();
    this._cel = {}; this._moon = {};
    this.timeScale = 0;                       // game hours per real second (0 = frozen at the golden hour)
    this.setTimeFlow(!!ctx.settings?.v.timeFlow);
    this.setShadowQuality(this.shadowMap);
    this.setHour(ctx.hour);
  }

  /** (Re)allocate the shadow map: 4096 high, 2048 medium, 1024 low. */
  setShadowQuality(size) {
    const sun = this.sun, sc = sun.shadow.camera;
    this.shadowMap = size;
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    sun.shadow.mapSize.set(size, size);
    const H = this.shadowHalf;
    sc.left = -H; sc.right = H; sc.top = H; sc.bottom = -H; sc.near = 5; sc.far = this.shadowDist + 130;
    sc.updateProjectionMatrix();
    sun.shadow.bias = -0.00006; sun.shadow.normalBias = 0.05;
    sun.shadow.radius = clamp(0.08 / ((2 * H) / size), 1, 4);          // ~8 cm penumbra whatever the map size (PCFShadowMap kernel radius in texels)
  }

  /** Jump the indoor/outdoor blend to its target (after a teleport) so the first frame is already correct. */
  snapIndoor() {
    const t = this.ctx.player?.indoors ? 1 : 0;
    if (this.state.indoor !== t) { this.state.indoor = t; this._applyLights(); }
  }

  /** Time flow: true = the clock runs (game minutes per real second below); `?timescale=N` overrides. */
  setTimeFlow(on) {
    this.timeScale = this.ctx.opts.timescale != null ? this.ctx.opts.timescale / 60 : (on ? FLOW_MIN_PER_SEC / 60 : (this.ctx.config.TIME_SCALE ?? 0));
  }

  /** Jump to a clock hour: recomputes sun/moon, the palette, fog, sky and every dependent uniform. */
  setHour(h, silent = false) {
    const ctx = this.ctx, st = this.state;
    h = ((h % 24) + 24) % 24;
    ctx.hour = h; st.hour = h;
    const c = celestial(h, SITE.dec, SITE.lat, this._cel), m = celestial(h + 12, 5, SITE.lat, this._moon);
    st.sunDir.set(c.x, c.y, c.z).normalize(); st.moonDir.set(m.x, m.y, m.z).normalize();
    st.elDeg = c.elDeg; st.moonEl = m.elDeg;
    samplePalette(c.elDeg, this.pal);
    const p = this.pal;
    st.night = 1 - sstep(-5, 7, c.elDeg); st.day = 1 - st.night;
    ctx.night = st.night; ctx.sunDir = st.sunDir; ctx.moonDir = st.moonDir; ctx.sunEl = c.elDeg;
    st.exposure = p.exp; st.bloomThreshold = p.bloomT; st.bloomStrength = p.bloomS; st.saturation = p.sat;
    this.envDirty = true;
    this._applyLights();
    for (const m of ctx.matlib?.glowing ?? []) m.emissiveIntensity = st.night ** 0.8 * (m.userData.glow ?? 2.4);
    if (!silent) ctx.events.emit('time:change', { hour: h, night: st.night });
  }

  /** Push the palette into lights, fog, sky and shared shader uniforms (cheap; called every frame for the indoor blend). */
  _applyLights() {
    const st = this.state, p = this.pal, sun = this.sun, scene = this.scene, ind = st.indoor, su = this.sky.uniforms;
    const moonMix = sstep(-5, -9, st.elDeg) * sstep(-1, 7, st.moonEl);
    // single shadow-casting light: the sun by day, the moon at night (swap happens at zero intensity)
    const useSun = this.useSun = st.elDeg > -5;
    sun.color.copy(useSun ? p.sun : this._moonCol ??= new THREE.Color(0x8fa6ff));
    sun.intensity = useSun ? p.sunI : 1.3 * moonMix;
    st.sunIntensity = sun.intensity;
    this.hemi.color.copy(p.hemiS); this.hemi.groundColor.copy(p.hemiG);
    this.hemi.intensity = p.hemiI * (1 + (INDOOR.hemi - 1) * ind);
    scene.environmentIntensity = p.envI * (1 + (INDOOR.env - 1) * ind);
    this.renderer.toneMappingExposure = p.exp * (1 + (INDOOR.exposure - 1) * ind);
    scene.fog.color.copy(p.hor); scene.fog.density = p.fog * (1 - 0.35 * ind);
    su.uZenith.value.copy(p.zen); su.uHorizon.value.copy(p.hor);
    su.uGround.value.copy(p.hor).multiplyScalar(0.28);
    su.uSunDir.value.copy(st.sunDir); su.uMoonDir.value.copy(st.moonDir);
    su.uSunCol.value.copy(p.sun).multiplyScalar(0.55 + 0.45 * Math.min(1, p.sunI));
    su.uGlowCol.value.copy(p.sun).lerp(p.hor, 0.35);
    su.uGlowAmt.value = p.glow; su.uCloudAmt.value = p.cloud; su.uStars.value = p.stars * st.night;
    su.uSunVis.value = sstep(-2.5, 0.5, st.elDeg); su.uMoonVis.value = sstep(-3, -9, st.elDeg) * sstep(-1, 4, st.moonEl);
    lookUniforms.ladGlowCol.value.copy(su.uGlowCol.value); lookUniforms.ladGlowAmt.value = p.glow * (1 - 0.6 * ind);
  }

  /** Rebuild the image-based sky light from the dome (only when the sky changed; ~ms). */
  refreshEnv() {
    const old = this.envRT;
    this.envRT = this.pmrem.fromScene(this.sky.envScene, 0, 0.1, 100);
    this.scene.environment = this.envRT.texture;
    old?.dispose();
    this.envDirty = false; this.envAt = this.time;
  }

  /** Per frame: clock, indoor blend, sun placement with texel-snapped shadow frustum, sky follow. */
  update(dt) {
    const ctx = this.ctx, st = this.state, cam = this.camera, sun = this.sun;
    this.time += dt;
    if (this.timeScale && ctx.running) {
      this.setHour(ctx.hour + this.timeScale * dt, true);
      this._emitAcc = (this._emitAcc ?? 0) + this.timeScale * dt;
      if (this._emitAcc >= 1 / 60) { this._emitAcc = 0; ctx.events.emit('time:change', { hour: ctx.hour, night: st.night }); }
    }
    // indoor blend
    const target = ctx.player?.indoors ? 1 : 0;
    if (Math.abs(st.indoor - target) > 1e-3) { st.indoor += (target - st.indoor) * Math.min(1, dt * 2.5); this._applyLights(); }
    else if (st.indoor !== target) { st.indoor = target; this._applyLights(); }
    if (this.envDirty && (this.time - this.envAt > (this.timeScale ? 2.5 : 0) || this.envAt < 0)) this.refreshEnv();
    this.sky.uniforms.uTime.value = this.time;
    this.sky.mesh.position.copy(cam.position);

    // sun placement: centre on the player, biased toward the view direction, snapped to the shadow texel grid in light space
    const p = ctx.player?.s;
    const c = this._c.set(p ? p.x : cam.position.x, p ? p.y : 0, p ? p.z : cam.position.z);
    const yaw = ctx.player?.yaw ?? 0, bias = this.shadowHalf * 0.28;
    c.x += -Math.sin(yaw) * bias; c.z += -Math.cos(yaw) * bias;
    const dir = this.useSun ? st.sunDir : st.moonDir;
    const z = this._v.copy(dir), x = this._r.set(0, 1, 0).cross(z).normalize(), y = this._u.copy(z).cross(x);
    const texel = (2 * this.shadowHalf) / this.shadowMap;
    const sx = Math.round(c.dot(x) / texel) * texel - c.dot(x), sy = Math.round(c.dot(y) / texel) * texel - c.dot(y);
    c.addScaledVector(x, sx).addScaledVector(y, sy);
    sun.target.position.copy(c); sun.position.copy(c).addScaledVector(dir, this.shadowDist);
    sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
  }
}
