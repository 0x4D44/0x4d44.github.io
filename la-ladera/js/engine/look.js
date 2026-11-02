// Lighting + atmosphere (owner: A1): time of day, sun/moon, sky dome, aerial haze, stabilised shadows, image-based sky light,
// indoor adaptation and the night state (`ctx.night`, `window_lit` glow).
//
//   const look = new Look(ctx, renderer, camera);   look.setHour(17.2);   each frame: look.update(dt)
//   look.state  { hour, elDeg, night, day, sunDir, moonDir, exposure, bloomThreshold, bloomStrength, saturation, indoor }
import * as THREE from 'three';
import { createSky } from './sky.js';
import { installShaderPatches, lookUniforms } from './shaderpatch.js';
import { clamp } from '../core/util.js';
import { setRoomHour } from './windowroom.js';

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
  // High sun (11-14 h: 55 to 71 degrees). R1-D14: the rows used to stay as they were at 40 degrees (a fill of 1.2 against a sun of 3.9), so noon was a flat pale picture. Now the sun is stronger, the sky light
  // and the IBL fill weaker (deeper shadow under the eaves and the balconies), the air is clearer and the horizon bluer. Every row up to 40 degrees (morning, evening, golden hour) is as it was.
  [55,  0xfff0dc, 3.95, 0x2970cc, 0xa3c4e9, 0xa9c4e9, 0x8a7a5a, 1.07, 1.07, 0.935, 0.0025, 0.10, 0.55, 0.00, 3.10, 0.20, 1.04],
  [75,  0xfff3e4, 4.25, 0x1f68d0, 0x9bbfec, 0xa2c0ec, 0x8a7a5a, 1.00, 1.00, 0.93, 0.0023, 0.08, 0.55, 0.00, 3.20, 0.20, 1.07],
].map((r) => ({
  el: r[0], sun: new THREE.Color(r[1]), sunI: r[2], zen: new THREE.Color(r[3]), hor: new THREE.Color(r[4]), hemiS: new THREE.Color(r[5]),
  hemiG: new THREE.Color(r[6]), hemiI: r[7], envI: r[8], exp: r[9], fog: r[10], glow: r[11], cloud: r[12], stars: r[13], bloomT: r[14], bloomS: r[15], sat: r[16],
}));
const NUM = ['sunI', 'hemiI', 'envI', 'exp', 'fog', 'glow', 'cloud', 'stars', 'bloomT', 'bloomS', 'sat'];
const COL = ['sun', 'zen', 'hor', 'hemiS', 'hemiG'];

// Morning and evening are not mirror images. The same sun height gives a different sky. After the cool night the valley air is still and damp:
// pale blue-white mist, a clear blue zenith, a gold low sun (not the evening's orange) that is a real direct light, and a cool fill that is weaker than
// the plain row's, so the low sun throws long shadows with a cool, deep shade in them (R1-D26: at 07:30 the plaza was evenly lit, with no shadow to read and
// the colour of noon; the old mood had softened the sun to 0.85 and raised the fill to 1.12, which is what flattened it). At the end of
// the day the same height is warm and dusty: amber haze, an orange sun that glows wider through the dust, and a warm grey fill (a blue fill on
// warm light turns cement and paving to ice). `col` entries are [target colour, how far the row moves toward it, 0..1]; `num` entries multiply.
// `exp` makes up for the darker shade of the morning; `glow` is left alone so the evening's is the wider one.
const col = (hex, k) => [new THREE.Color(hex), k];
const MOOD = {
  morning: {
    col: { sun: col(0xffc88a, 0.60), zen: col(0x3f86d8, 0.45), hor: col(0xc4d0e0, 0.72), hemiS: col(0xb4c0da, 0.50), hemiG: col(0x8a7a5c, 0.40) },
    num: { sunI: 1.25, hemiI: 0.70, envI: 0.66, exp: 1.07, fog: 1.5, cloud: 1.15 },
  },
  evening: {
    col: { sun: col(0xff8a3a, 0.45), zen: col(0x405a8a, 0.35), hor: col(0xe3a06b, 0.55), hemiS: col(0xb4a8b0, 0.55), hemiG: col(0x8f6a48, 0.40) },
    num: { sunI: 1.05, hemiI: 0.98, envI: 0.96, fog: 1.2, glow: 1.2, cloud: 1.05, sat: 1.0 },
  },
};
/** How much of the morning / evening mood a sun elevation (degrees) gets: none in the deep night, full from just above the horizon through the golden hour, none by mid-morning. */
export const moodWeight = (elDeg) => sstep(-9, 6, elDeg) * (1 - sstep(10, 45, elDeg));

/**
 * Interpolated palette row for a sun elevation in degrees (written into `out`). `mood`: -1 = the sun is rising (morning), +1 = it is setting
 * (evening), 0 = the plain rows; values in between blend. Pure apart from `out`.
 */
export function samplePalette(elDeg, out = null, mood = 0) {
  out ??= { sun: new THREE.Color(), zen: new THREE.Color(), hor: new THREE.Color(), hemiS: new THREE.Color(), hemiG: new THREE.Color() };
  let i = 0;
  while (i < ROWS.length - 2 && elDeg > ROWS[i + 1].el) i++;
  const a = ROWS[i], b = ROWS[i + 1], t = clamp((elDeg - a.el) / (b.el - a.el), 0, 1), s = t * t * (3 - 2 * t);
  for (const k of NUM) out[k] = a[k] + (b[k] - a[k]) * s;
  for (const k of COL) out[k].copy(a[k]).lerp(b[k], s);
  const w = mood === 0 ? 0 : moodWeight(elDeg), sunUp = sstep(-9, -4, elDeg);                // (the rows keep a black sun below -9 deg: nothing to tint there)
  if (w > 0) for (const [m, amt] of [[MOOD.morning, clamp(-mood, 0, 1) * w], [MOOD.evening, clamp(mood, 0, 1) * w]]) {
    if (amt <= 0) continue;
    for (const k of COL) out[k].lerp(m.col[k][0], m.col[k][1] * amt * (k === 'sun' ? sunUp : 1));
    for (const k in m.num) out[k] *= 1 + (m.num[k] - 1) * amt;
  }
  return out;
}

/** Indoor / outdoor render settings (blended by look.indoor). */
const INDOOR = { hemi: 0.17, env: 0.10, exposure: 1.22, exposureMax: 1.3, bloomT: 3.0, bloomS: 0.18 };
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
    samplePalette(c.elDeg, this.pal, h < 12 ? -1 : 1);                      // the same sun height looks different in the morning and in the evening
    const p = this.pal;
    st.night = 1 - sstep(-5, 7, c.elDeg); st.day = 1 - st.night;
    ctx.night = st.night; ctx.sunDir = st.sunDir; ctx.moonDir = st.moonDir; ctx.sunEl = c.elDeg;
    st.exposure = p.exp; st.bloomThreshold = p.bloomT; st.bloomStrength = p.bloomS; st.saturation = p.sat;
    this.envDirty = true;
    this._applyLights();
    for (const m of ctx.matlib?.glowing ?? []) { m.emissiveIntensity = st.night ** 0.8 * (m.userData.glow ?? 2.4); setRoomHour(m, h); }   // a lit room's evening follows the clock (engine/windowroom.js)
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
    // A lit room needs no night boost: the dark streets are why the night exposure is high (1.55), and in a room it blows a lamp's hot spot on the ceiling
    // into a veil. So indoors: a bit brighter than a dim day, never above exposureMax, and the bloom of the daytime (high threshold, gentle).
    this.renderer.toneMappingExposure = p.exp + (Math.min(p.exp * INDOOR.exposure, INDOOR.exposureMax) - p.exp) * ind;
    st.bloomThreshold = p.bloomT + (Math.max(p.bloomT, INDOOR.bloomT) - p.bloomT) * ind;
    st.bloomStrength = p.bloomS + (Math.min(p.bloomS, INDOOR.bloomS) - p.bloomS) * ind;
    scene.fog.color.copy(p.hor); scene.fog.density = p.fog * (1 - 0.35 * ind);
    su.uZenith.value.copy(p.zen); su.uHorizon.value.copy(p.hor);
    su.uGround.value.copy(p.hor).multiplyScalar(0.28);
    su.uSunDir.value.copy(st.sunDir); su.uMoonDir.value.copy(st.moonDir);
    su.uSunCol.value.copy(p.sun).multiplyScalar(0.55 + 0.45 * Math.min(1, p.sunI));
    su.uGlowCol.value.copy(p.sun).lerp(p.hor, 0.35);
    su.uGlowAmt.value = p.glow; su.uCloudAmt.value = p.cloud; su.uStars.value = p.stars * st.night;
    su.uSunVis.value = sstep(-2.5, 0.5, st.elDeg); su.uMoonVis.value = sstep(-3, -9, st.elDeg) * sstep(-1, 4, st.moonEl);
    su.uCity.value = 1 - sstep(-9, -1, st.elDeg);                        // the valley's lights come on at dusk (sun 1 deg below the horizon), full by 9 deg
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
