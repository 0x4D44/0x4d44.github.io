// Weather: GPU-animated rain streaks, snow flurries, ground splashes, lightning, wind.
// All particles are shader-driven in a box that follows the camera; no per-frame allocation.

const PARTICLE_VERT = /* glsl */ `
attribute vec3 aSeed; attribute vec2 aCorner;
uniform vec3 uCam; uniform vec3 uVel; uniform vec3 uStreak; uniform float uNear; uniform vec3 uBox; uniform float uTime; uniform float uSize; uniform float uLen; uniform float uSway;
uniform float uCabinOn; uniform mat4 uCabinInv; uniform vec4 uCabinA; uniform vec4 uCabinB;
varying vec2 vC; varying float vFade; varying float vDist;
void main(){
  vec3 base = aSeed * uBox;
  vec3 sway = vec3(0.0);
  #ifdef SNOW
    sway = vec3(sin(uTime * 0.9 + aSeed.x * 40.0), 0.0, cos(uTime * 0.8 + aSeed.z * 37.0)) * uSway;
  #endif
  vec3 p = mod(base + uVel * uTime - uCam, uBox) - uBox * 0.5 + uCam + sway;
  vec3 toCam = p - cameraPosition;
  float d = length(toCam);
  vDist = d;
  vC = aCorner;
  #ifdef SNOW
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
    vec3 up = normalize(cross(toCam, right));
    float s = min(uSize * (0.6 + aSeed.y), d * 0.0075);
    vec3 wp = p + right * aCorner.x * s + up * aCorner.y * s;
  #else
    vec3 dir = normalize(uStreak);
    vec3 right = normalize(cross(dir, toCam));
    float l = uLen * (0.7 + 0.6 * aSeed.y);
    vec3 wp = p + dir * (aCorner.y * max(l, d * 0.012)) + right * aCorner.x * max(uSize, d * 0.0014);
  #endif
  // fade at the box boundary and very near the camera
  vec3 rel = (p - uCam) / (uBox * 0.5);
  vFade = (1.0 - smoothstep(0.7, 1.0, max(abs(rel.x), max(abs(rel.y), abs(rel.z))))) * smoothstep(uNear * 0.35, uNear, d);
  // cockpit view: nothing is drawn inside the cabin volume (behind the windscreen, under the roof): it would float over the headliner
  if (uCabinOn > 0.5) {
    vec3 l = (uCabinInv * vec4(p, 1.0)).xyz;
    float t = clamp((l.y - uCabinB.y) / (uCabinB.w - uCabinB.y), 0.0, 1.0);
    float zs = uCabinB.x + (uCabinB.z - uCabinB.x) * t;
    if (abs(l.x) < uCabinA.x && l.y > uCabinA.y && l.y < uCabinA.z && l.z > zs && l.z < uCabinA.w) vFade = 0.0;
  }
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const PARTICLE_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor; uniform float uAlpha; uniform float uLight;
varying vec2 vC; varying float vFade; varying float vDist;
void main(){
  #ifdef SNOW
    float r = length(vC);
    float a = smoothstep(1.0, 0.1, r); a *= a;
  #else
    float a = (1.0 - abs(vC.x)) * smoothstep(1.0, 0.55, abs(vC.y));
  #endif
  a *= uAlpha * vFade * (1.0 - smoothstep(30.0, 60.0, vDist) * 0.5);
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * uLight, a);
}`;

const SPLASH_VERT = /* glsl */ `
attribute vec3 aSeed; attribute vec2 aCorner;
uniform vec3 uCenter; uniform float uTime; uniform float uRadius; uniform float uGroundY;
varying vec2 vC; varying float vA; varying float vPh;
void main(){
  float ph = fract(uTime * (0.9 + 0.6 * aSeed.z) + aSeed.y * 7.0);
  vec2 off = (aSeed.xz * 2.0 - 1.0) * uRadius;
  vec3 c = vec3(uCenter.x + off.x, uGroundY + 0.03, uCenter.z + off.y);
  float s = (0.04 + ph * 0.24) * (0.55 + 0.9 * fract(aSeed.x * 37.1 + aSeed.z * 11.3)); // random final radius
  vC = aCorner; vPh = ph;
  // fades: born soft, dies slowly, thins out toward the edge of the patch and with camera distance
  float dist = length(c - cameraPosition);
  vA = pow(1.0 - ph, 1.6) * smoothstep(0.0, 0.08, ph) * (1.0 - length(off) / uRadius) * (1.0 - smoothstep(3.0, 12.0, dist));
  gl_Position = projectionMatrix * viewMatrix * vec4(c + vec3(aCorner.x * s, 0.0, aCorner.y * s), 1.0);
}`;

const SPLASH_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor; uniform float uAlpha;
varying vec2 vC; varying float vA; varying float vPh;
void main(){
  float r = length(vC);
  // thin gaussian ring whose width follows the quad's pixel footprint, plus a faint inner echo; no hard edge anywhere
  float w = max(0.2, fwidth(r) * 2.2);
  float ring = exp(-pow((r - 0.72) / w, 2.0)) + 0.35 * exp(-pow((r - 0.42) / (w * 1.2), 2.0)) * smoothstep(0.15, 0.5, vPh);
  float a = ring * smoothstep(1.0, 0.8, r) * vA * uAlpha * 0.45;
  if (a < 0.006) discard;
  gl_FragColor = vec4(uColor, a);
}`;

function makeQuads(THREE, count, seedFn) {
  const aSeed = new Float32Array(count * 4 * 3), aCorner = new Float32Array(count * 4 * 2);
  const idx = new Uint32Array(count * 6), pos = new Float32Array(count * 4 * 3);
  const corners = [-1, -1, 1, -1, -1, 1, 1, 1];
  for (let i = 0; i < count; i++) {
    const s = seedFn(i);
    for (let c = 0; c < 4; c++) {
      const v = i * 4 + c;
      aSeed[v * 3] = s[0]; aSeed[v * 3 + 1] = s[1]; aSeed[v * 3 + 2] = s[2];
      aCorner[v * 2] = corners[c * 2]; aCorner[v * 2 + 1] = corners[c * 2 + 1];
    }
    const v = i * 4;
    idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(aSeed, 3));
  g.setAttribute("aCorner", new THREE.BufferAttribute(aCorner, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return g;
}

/** Multiplier on the stage's base fog density for a weather state (pure). `clear` over a hazy stage default thins the haze. */
export function fogFactor(w) {
  let f = 1 + 0.9 * w.rainAmt + 1.2 * w.mist + 0.5 * w.snowAmt + 2.6 * w.fog;
  if (w.cleared) f *= 0.35;
  return f;
}

export function createWeather(THREE, { SU, getCfg }) {
  const group = new THREE.Group();
  group.name = "weather";
  const hash = (i, k) => { let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(k + 7, 0x85ebca6b); h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
  const seedFn = (i) => [hash(i, 1), hash(i, 2), hash(i, 3)];

  const common = () => ({
    uCam: { value: new THREE.Vector3() }, uVel: { value: new THREE.Vector3(0, -9, 0) }, uBox: { value: new THREE.Vector3(26, 17, 26) },
    uStreak: { value: new THREE.Vector3(0, -1, 0) }, uNear: { value: 5 }, uTime: { value: 0 }, uSize: { value: 0.016 }, uLen: { value: 0.9 }, uSway: { value: 0.6 },
    uColor: { value: new THREE.Color(0.72, 0.78, 0.86) }, uAlpha: { value: 0.35 }, uLight: { value: 1 },
    uCabinOn: { value: 0 }, uCabinInv: { value: new THREE.Matrix4() }, uCabinA: { value: new THREE.Vector4() }, uCabinB: { value: new THREE.Vector4() },
  });
  const setCabin = (cabin) => {
    for (const u of [rainU, snowU]) {
      const on = !!(cabin && cabin.on);
      u.uCabinOn.value = on ? 1 : 0;
      if (!on) continue;
      const v = cabin.vol;
      u.uCabinInv.value.copy(cabin.inv);
      u.uCabinA.value.set(v.hw, v.ymin, v.ymax, v.zRear); u.uCabinB.value.set(v.zb, v.yb, v.zh, v.yh);
    }
  };
  const rainU = common();
  const snowU = common();
  snowU.uVel.value.set(0.6, -1.4, 0.3); snowU.uSize.value = 0.07; snowU.uAlpha.value = 1.0; snowU.uNear.value = 4.5;
  snowU.uColor.value.set(1, 1, 1);
  const splashU = { uCenter: { value: new THREE.Vector3() }, uTime: { value: 0 }, uRadius: { value: 11 }, uGroundY: { value: 0 }, uColor: { value: new THREE.Color(0.8, 0.85, 0.9) }, uAlpha: { value: 0.35 } };

  let rain = null, snow = null, splash = null;
  const state = { type: "clear", intensity: 0, wetness: 0, rainAmt: 0, snowAmt: 0, mist: 0, fog: 0, cleared: false, flash: 0, nextFlash: 4, flashT: 0, storm: false, maxRain: 0, maxSnow: 0 };
  const wind = { x: 1, z: 0, strength: 0.3 };

  function build() {
    api.dispose(true);
    const cfg = getCfg();
    state.maxRain = cfg.rain; state.maxSnow = cfg.snow;
    const mat = (u, frag, vert, defs) => new THREE.ShaderMaterial({
      uniforms: u, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, fog: false, defines: defs, side: THREE.DoubleSide,
    });
    rain = new THREE.Mesh(makeQuads(THREE, cfg.rain, seedFn), mat(rainU, PARTICLE_FRAG, PARTICLE_VERT, {}));
    snow = new THREE.Mesh(makeQuads(THREE, cfg.snow, seedFn), mat(snowU, PARTICLE_FRAG, PARTICLE_VERT, { SNOW: 1 }));
    splash = new THREE.Mesh(makeQuads(THREE, Math.floor(cfg.rain * 0.12), (i) => [hash(i, 11), hash(i, 12), hash(i, 13)]), mat(splashU, SPLASH_FRAG, SPLASH_VERT, {}));
    for (const m of [rain, snow, splash]) { m.frustumCulled = false; m.renderOrder = 10; m.visible = false; group.add(m); }
  }

  const api = {
    group, state, wind,
    rebuild: build,
    setWeather(env, override) {
      const w = { ...(env.weather ?? {}), ...(override ?? {}) };
      state.type = w.type ?? "clear";
      state.intensity = w.intensity ?? 0;
      state.wetness = w.wetness ?? (state.type === "rain" || state.type === "storm" ? 0.8 : 0);
      state.storm = state.type === "storm";
      state.rainAmt = state.type === "rain" ? state.intensity : state.storm ? Math.max(0.85, state.intensity) : 0;
      state.snowAmt = state.type === "snow" ? state.intensity : 0;
      state.fog = state.type === "fog" ? Math.min(1, state.intensity) : 0;
      // fog implies a hazy sky too; mist is lighter. A plain "clear" override on a stage that ships with mist/cloud/snow strips its haze.
      state.mist = state.type === "mist" ? state.intensity : state.type === "fog" ? 0.55 + 0.45 * state.fog : 0;
      state.cleared = state.type === "clear" && !!env.weather?.type && env.weather.type !== "clear";
      wind.strength = env.windStrength ?? 0.3 + (state.storm ? 0.5 : 0);
      if (state.storm) wind.strength = Math.max(wind.strength, 0.8);
      wind.x = 0.82; wind.z = 0.57;
      state.nextFlash = 3 + (state.storm ? 2 : 1e9);
      if (!rain) build();
      rain.visible = state.rainAmt > 0.01;
      snow.visible = state.snowAmt > 0.01;
      splash.visible = state.rainAmt > 0.01;
      rain.geometry.setDrawRange(0, Math.max(6, Math.floor(state.maxRain * Math.min(1, state.rainAmt)) * 6));
      snow.geometry.setDrawRange(0, Math.max(6, Math.floor(state.maxSnow * Math.min(1, state.snowAmt)) * 6));
      splash.geometry.setDrawRange(0, Math.max(6, Math.floor((splash.geometry.index.count / 6) * Math.min(1, state.rainAmt)) * 6));
      SU.uWet.value = state.wetness;
      SU.uSnow.value = state.type === "snow" ? 0.25 + 0.5 * state.intensity : 0;
      SU.uWindAmp.value = 0.25 + wind.strength * 1.0;
      SU.uWind.value.set(wind.x, wind.z);
      return state;
    },
    /** lightLevel 0..1.2: scene brightness so rain/snow are not glowing at night. */
    update(dt, time, camPos, carPos, carVel, lightLevel, fogColor, cabin) {
      if (!rain) return;
      setCabin(cabin);
      SU.uTime.value = time;
      state.flash = 0;
      if (state.storm) {
        state.nextFlash -= dt;
        if (state.nextFlash <= 0) { state.flashT = 0.45; state.nextFlash = 4 + (time * 7.13 % 7); }
        if (state.flashT > 0) {
          state.flashT -= dt;
          const f = state.flashT;
          state.flash = Math.max(0, Math.sin(f * 38) * 0.5 + 0.5) * Math.min(1, f * 4);
        }
      }
      SU.uFlash.value = state.flash;
      const lit = Math.max(0.42, Math.min(1.1, lightLevel));
      if (rain.visible) {
        rainU.uCam.value.copy(camPos);
        rainU.uTime.value = time;
        const spd = 11 + 5 * state.rainAmt;
        // streak direction = fall velocity relative to the moving camera
        const vx = wind.x * wind.strength * 5, vz = wind.z * wind.strength * 5;
        rainU.uVel.value.set(vx, -spd, vz);
        // streak = fall velocity relative to the moving car, drawn as ~1/28 s of exposure
        const sx = vx - carVel.x, sz = vz - carVel.z;
        rainU.uStreak.value.set(sx, -spd, sz);
        rainU.uLen.value = Math.min(2.2, Math.hypot(sx, spd, sz) * 0.012);
        rainU.uAlpha.value = 0.4 + 0.25 * state.rainAmt;
        rainU.uLight.value = lit;
        rainU.uColor.value.set(fogColor).lerp(new THREE.Color(1, 1, 1), 0.65);
        splashU.uCenter.value.copy(carPos);
        splashU.uGroundY.value = carPos.y - 0.25;
        splashU.uTime.value = time;
        splashU.uAlpha.value = 0.28 * state.rainAmt * lit;
      }
      if (snow.visible) {
        snowU.uCam.value.copy(camPos);
        snowU.uTime.value = time;
        snowU.uVel.value.set(wind.x * (0.6 + wind.strength * 2), -1.3, wind.z * (0.6 + wind.strength * 2));
        snowU.uLight.value = Math.max(0.5, lit);
      }
    },
    dispose(keepGroup) {
      for (const m of [rain, snow, splash]) if (m) { group.remove(m); m.geometry.dispose(); m.material.dispose(); }
      rain = snow = splash = null;
      if (!keepGroup) group.clear();
    },
  };
  return api;
}
