// Procedural sky dome (gradient, sun, clouds, stars, moon), PMREM environment, sun/moon light with
// car-following texel-snapped shadows, hemisphere fill and headlights.
import { GLSL_NOISE } from "./materials.mjs";

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uTop, uHorizon, uGround, uSunDir, uSunCol, uMoonDir, uWind;
uniform float uTime, uCover, uStars, uDay, uSunSize, uWetSky, uFlash, uMist;
uniform float uMK, uMB, uMA, uMF; uniform vec3 uMC;
${GLSL_NOISE}
// distant mountain / hill silhouettes in three hazy layers (kind: 1 rolling, 2 jagged snow peaks, 3 layered ridges, 4 islands, 5 cliff walls)
vec3 mountains(vec3 col, vec3 d, float h){
  if (uMK < 0.5 || h > 0.45) return col;
  vec2 c = d.xz / max(length(d.xz), 1e-3);
  float sunSide = dot(c, normalize(uSunDir.xz + 1e-4));
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float fr = (1.1 + fk * 0.8) * uMF;
    float n = vnoise(c * fr + fk * 7.3), m = vnoise(c * fr * 3.3 + fk * 3.1), q = vnoise(c * fr * 9.0 + fk);
    float r;
    if (uMK < 1.5) r = n * 0.7 + m * 0.3;
    else if (uMK < 2.5) { float rd = 1.0 - abs(n * 2.0 - 1.0); r = pow(rd, 1.7) * 0.8 + m * 0.25 + q * 0.06; }
    else if (uMK < 3.5) r = smoothstep(0.2, 0.8, n) * 0.8 + m * 0.2;
    else if (uMK < 4.5) r = smoothstep(0.58, 0.68, n) * (0.5 + 0.5 * m);
    else r = smoothstep(0.35, 0.55, n) * 0.85 + m * 0.2 + q * 0.04;
    float ht = uMB + uMA * r * (1.0 - fk * 0.28) - fk * 0.004;
    float cov = smoothstep(ht, ht - 0.0035, h);
    if (cov <= 0.0) continue;
    float hn = clamp((h - uMB) / max(ht - uMB, 1e-3), 0.0, 1.0);
    vec3 lc = uMC * (0.75 + 0.35 * sunSide * (0.4 + 0.6 * uDay) + 0.35 * m) * (0.15 + 0.85 * uDay);
    if (uMK > 1.5 && uMK < 2.5) lc = mix(lc, vec3(0.9, 0.93, 1.0) * (0.2 + 0.8 * uDay), smoothstep(0.42, 0.62, hn + (m - 0.5) * 0.3) * 0.9);
    float haze = clamp(0.66 - fk * 0.2 + uMist * 0.3 + uWetSky * 0.25, 0.0, 0.97);
    lc = mix(lc, uHorizon * (0.7 + 0.3 * uDay), haze);
    lc = mix(lc, uHorizon * (0.8 + 0.2 * uDay), smoothstep(0.04, -0.01, h) * 0.7);
    col = mix(col, lc, cov);
  }
  return col;
}
float cloudField(vec2 p){
  float s = 0.0, a = 0.55;
  for (int i = 0; i < CLOUD_OCT; i++) { s += a * vnoise(p); p = p * 2.07 + 11.3; a *= 0.5; }
  return s;
}
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  float t = pow(clamp(h, 0.0, 1.0), 0.5);
  vec3 col = mix(uHorizon, uTop, t);
  // below the horizon: toward ground tone
  col = mix(col, uGround, smoothstep(0.0, -0.18, h));
  float mu = max(dot(d, uSunDir), 0.0);
  // horizon haze brightens toward the sun
  float hz = exp(-abs(h) * 5.0);
  col += uSunCol * hz * pow(mu, 3.0) * 0.55 * uDay;
  col += uSunCol * (pow(mu, 14.0) * 0.22 + pow(mu, 900.0) * 0.9) * uDay;
  // sun disc (HDR so bloom picks it up)
  float disc = smoothstep(cos(uSunSize * 1.35), cos(uSunSize), mu);
  col += uSunCol * disc * 9.0 * uDay * (1.0 - 0.8 * uCover);

  // clouds on a virtual plane
  if (h > 0.004) {
    vec2 cp = d.xz / (h + 0.14) * 1.15 + uWind.xz * uTime * 0.012;
    float f = cloudField(cp);
    float thr = mix(0.78, 0.30, uCover);
    float dens = smoothstep(thr, thr + 0.2, f) ;
    // light the cloud: sample slightly toward the sun for a cheap self-shadow
    vec2 toSun = normalize(uSunDir.xz + 1e-4) * 0.06;
    float f2 = cloudField(cp + toSun);
    float lit = clamp(0.5 + (f - f2) * 7.0, 0.0, 1.0);
    vec3 shade = mix(uHorizon * 0.55, uTop * 0.8, 0.4) * (0.55 + 0.45 * uDay);
    vec3 bright = mix(vec3(1.0), uSunCol, 0.5) * (0.35 + 0.8 * uDay);
    vec3 cc = mix(shade, bright, lit);
    cc = mix(cc, uHorizon * (0.75 + 0.25 * uDay), uWetSky * 0.6);
    cc += vec3(0.8, 0.85, 1.0) * uFlash * 0.7;
    col = mix(col, cc, dens * smoothstep(0.004, 0.2, h) * (0.35 + 0.65 * min(1.0, uCover * 1.3)));
  }

  // stars + moon
  if (uStars > 0.01 && h > -0.02) {
    vec3 sd = d * 190.0; vec3 id = floor(sd); vec3 fr = fract(sd) - 0.5;
    float hv = fract(sin(dot(id, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float star = step(0.9965, hv) * smoothstep(0.35, 0.0, length(fr));
    float tw = 0.6 + 0.4 * sin(uTime * 3.0 + hv * 60.0);
    float vis = (1.0 - uCover) * (1.0 - uDay) * uStars;
    col += vec3(0.9, 0.95, 1.0) * star * tw * 1.6 * vis;
    float md = max(dot(d, uMoonDir), 0.0);
    col += vec3(0.85, 0.9, 1.0) * smoothstep(0.99965, 0.99985, md) * 3.0 * uStars * (1.0 - uDay) * (1.0 - uCover * 0.8);
    col += vec3(0.4, 0.5, 0.7) * pow(md, 90.0) * 0.4 * uStars * (1.0 - uDay);
  }
  // mist wash near the horizon
  col = mix(col, uHorizon * (0.9 + 0.1 * uDay), uMist * exp(-max(h, 0.0) * 3.0));
  col = mountains(col, d, h);
  gl_FragColor = vec4(col, 1.0);
}`;

export function createSky(THREE, { getCfg }) {
  const geo = new THREE.SphereGeometry(100, 32, 16);
  const U = {
    uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uWind: { value: new THREE.Vector3(1, 0, 0) }, uTime: { value: 0 }, uCover: { value: 0.3 }, uStars: { value: 0 }, uDay: { value: 1 },
    uMK: { value: 0 }, uMB: { value: 0 }, uMA: { value: 0.05 }, uMF: { value: 1 }, uMC: { value: new THREE.Color(0.3, 0.35, 0.4) },
    uSunSize: { value: 0.0075 }, uWetSky: { value: 0 }, uFlash: { value: 0 }, uMist: { value: 0 },
  };
  const mk = (oct) => new THREE.ShaderMaterial({
    uniforms: U, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    defines: { CLOUD_OCT: oct },
  });
  let mat = mk(getCfg().post ? 5 : 3);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  mesh.name = "sky";

  const sky = {
    mesh, uniforms: U,
    setOctaves(n) { mat.dispose(); mat = mk(n); mesh.material = mat; },
    /** env = def.environment; sunDir (unit vector toward the sun) computed by the caller. */
    setEnvironment(env, sunDir, mood) {
      U.uTop.value.set(env.skyTop); U.uHorizon.value.set(env.skyHorizon);
      U.uGround.value.set(env.fogColor).multiplyScalar(0.55);
      U.uSunDir.value.copy(sunDir);
      U.uSunCol.value.set(env.sunColor);
      U.uMoonDir.value.set(-sunDir.x * 0.6 + 0.2, Math.max(0.45, -sunDir.y + 0.3), -sunDir.z * 0.6 + 0.3).normalize();
      U.uCover.value = env.cloudCover ?? 0.3;
      U.uStars.value = env.stars ?? 0;
      U.uDay.value = mood.day;
      U.uWetSky.value = mood.wetSky;
      U.uMist.value = mood.mist;
    },
    /** Distant ranges per biome. */
    setBiome(biome) {
      const T = {
        pasture: [1, 0.03, 0.08, 1.0, 0x5f7f58], redwood: [1, 0.03, 0.05, 1.3, 0x3d5a3a], coast: [4, 0.02, 0.1, 1.2, 0x4a6a6a],
        tussock: [3, 0.04, 0.13, 1.0, 0x8a7050], alpine: [2, 0.05, 0.28, 0.9, 0x55607a], rainforest: [5, 0.05, 0.4, 0.9, 0x2e4036],
      };
      const t = T[biome];
      U.uMK.value = t ? t[0] : 0;
      if (t) { U.uMB.value = t[1]; U.uMA.value = t[2]; U.uMF.value = t[3]; U.uMC.value.set(t[4]); }
    },
    update(time, camPos, windVec, flash) {
      U.uTime.value = time;
      U.uWind.value.set(windVec.x, 0, windVec.z);
      U.uFlash.value = flash;
      mesh.position.copy(camPos);
    },
    /** Render the sky into a PMREM environment texture (call after setEnvironment). */
    makeEnvironment(renderer, size) {
      const sc = new THREE.Scene();
      const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        uniforms: U, vertexShader: SKY_VERT.replace("gl_Position = p.xyww;", "gl_Position = p;"), fragmentShader: SKY_FRAG, side: THREE.BackSide,
        depthWrite: false, depthTest: false, fog: false, defines: { CLOUD_OCT: 3 },
      }));
      m.frustumCulled = false;
      sc.add(m);
      const pm = new THREE.PMREMGenerator(renderer);
      const rt = pm.fromScene(sc, 0, 0.1, 500, { size: size ?? 128 });
      pm.dispose();
      m.material.dispose();
      return rt;
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
  return sky;
}

/** Sun direction (unit, toward the sun) from def azimuth/elevation (azimuth 0 = -Z, clockwise from above). */
export function sunDirection(THREE, az, el, out = new THREE.Vector3()) {
  const ce = Math.cos(el);
  return out.set(Math.sin(az) * ce, Math.sin(el), -Math.cos(az) * ce);
}

/** Globally patch three's directional-light chunk: light 0 (near cascade) blends into light 1 (far cascade) near its map edge,
 *  and light 1 contributes shadow only. No-op unless two shadow-casting directional lights exist. */
let cascadePatched = false;
export function patchShadowCascade(THREE) {
  if (cascadePatched) return;
  cascadePatched = true;
  const old = "directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;";
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  if (!chunk.includes(old)) return;
  const neu = `{ float arSh = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#if NUM_DIR_LIGHT_SHADOWS > 1
		if ( UNROLLED_LOOP_INDEX == 0 ) {
			vec2 arC = vDirectionalShadowCoord[ 0 ].xy / vDirectionalShadowCoord[ 0 ].w - 0.5;
			float arEdge = max( abs( arC.x ), abs( arC.y ) ) * 2.0;
			float arFar = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowIntensity, directionalLightShadows[ 1 ].shadowBias, directionalLightShadows[ 1 ].shadowRadius, vDirectionalShadowCoord[ 1 ] ) : 1.0;
			arSh = mix( arSh, arFar, smoothstep( 0.72, 0.96, arEdge ) );
		} else { arSh = 0.0; }
		#endif
		directLight.color *= arSh; }`;
  THREE.ShaderChunk.lights_fragment_begin = chunk.replace(old, neu);
}

export function createLighting(THREE, scene, getCfg) {
  patchShadowCascade(THREE);
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.06;
  sun.shadow.radius = 2;
  const cascade = new THREE.DirectionalLight(0xffffff, 0);
  cascade.castShadow = false;
  cascade.shadow.camera.userData.far = true;
  const hemi = new THREE.HemisphereLight(0xbcd2ee, 0x5a5646, 0.35);
  scene.add(sun, sun.target, hemi, cascade, cascade.target);

  const heads = [0, 1].map(() => {
    const l = new THREE.SpotLight(0xfff1d6, 0, 160, 0.5, 0.75, 1.6);
    l.castShadow = false;
    scene.add(l, l.target);
    l.visible = false;
    return l;
  });

  const L = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3(), up = new THREE.Vector3(), tmp = new THREE.Vector3(), tgt = new THREE.Vector3();
  const state = { range: 60, size: 2048, cascadeOn: false, baseIntensity: 3, moonMix: 0, headOn: false, flash: 0 };

  function setShadowMap(size, range, cascadeOn, enabled, farRange = 200) {
    state.range = range; state.cascadeOn = cascadeOn; state.farRange = farRange;
    sun.castShadow = enabled;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose(); sun.shadow.map = null;
    }
    const c = sun.shadow.camera;
    c.left = -range; c.right = range; c.top = range; c.bottom = -range; c.near = 1; c.far = 520;
    c.updateProjectionMatrix();
    cascade.castShadow = cascadeOn && enabled;
    if (cascadeOn) {
      const cs = Math.max(1024, size);
      if (cascade.shadow.mapSize.x !== cs) { cascade.shadow.mapSize.set(cs, cs); cascade.shadow.map?.dispose(); cascade.shadow.map = null; }
      const cc = cascade.shadow.camera;
      cc.left = -farRange; cc.right = farRange; cc.top = farRange; cc.bottom = -farRange; cc.near = 1; cc.far = 900;
      cc.updateProjectionMatrix();
      cascade.shadow.bias = -0.0006; cascade.shadow.normalBias = 0.18; cascade.shadow.radius = 2;
    }
  }

  const api = {
    sun, hemi, heads, setShadowMap, state,
    /** Configure from the stage environment. Returns { sunDir, lightDir, day }. */
    setEnvironment(env, sunDir) {
      const day = THREE.MathUtils.smoothstep(sunDir.y, -0.06, 0.09);
      const moon = new THREE.Vector3(-sunDir.x * 0.6 + 0.2, Math.max(0.45, -sunDir.y + 0.3), -sunDir.z * 0.6 + 0.3).normalize();
      state.baseIntensity = env.sunIntensity ?? 3;
      L.copy(sunDir).lerp(moon, 1 - day).normalize();
      const sc = new THREE.Color(env.sunColor), mc = new THREE.Color(0x8fa6dc);
      sun.color.copy(mc).lerp(sc, day);
      const moonI = 0.9 * (env.stars ?? 0.5) + 0.7;
      sun.intensity = state.baseIntensity * day + moonI * (1 - day);
      state.sunIntensity = sun.intensity;
      const amb = new THREE.Color(env.ambient ?? 0x8aa0b8);
      hemi.color.copy(amb).lerp(new THREE.Color(env.skyTop), 0.35);
      hemi.groundColor.copy(amb).multiplyScalar(0.45);
      hemi.intensity = 0.2 + 0.2 * day + 0.5 * (1 - day);
      state.day = day;
      cascade.color.copy(sun.color);
      state.headOn = !!env.headlights;
      for (const h of heads) h.visible = state.headOn;
      return { sunDir, lightDir: L, day };
    },
    /** carPos = anchor of the shadow frustum. Texel-snapped in light space. */
    update(carPos, carYaw, carSpeed, flash) {
      const size = sun.shadow.mapSize.x;
      const texel = (2 * state.range) / size;
      // light-space basis
      tmp.set(0, 1, 0);
      right.crossVectors(tmp, L);
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      right.normalize();
      up.crossVectors(L, right).normalize();
      const r = Math.round(carPos.x * right.x / texel + carPos.y * right.y / texel + carPos.z * right.z / texel) * texel;
      const u = Math.round((carPos.x * up.x + carPos.y * up.y + carPos.z * up.z) / texel) * texel;
      const l = carPos.x * L.x + carPos.y * L.y + carPos.z * L.z;
      tgt.set(0, 0, 0).addScaledVector(right, r).addScaledVector(up, u).addScaledVector(L, l);
      sun.target.position.copy(tgt);
      sun.position.copy(tgt).addScaledVector(L, 260);
      sun.target.updateMatrixWorld();
      if (state.cascadeOn) {
        const ctexel = (2 * state.farRange) / cascade.shadow.mapSize.x;
        const cr = Math.round((carPos.x * right.x + carPos.y * right.y + carPos.z * right.z) / ctexel) * ctexel;
        const cu = Math.round((carPos.x * up.x + carPos.y * up.y + carPos.z * up.z) / ctexel) * ctexel;
        cascade.target.position.set(0, 0, 0).addScaledVector(right, cr).addScaledVector(up, cu).addScaledVector(L, l);
        cascade.position.copy(cascade.target.position).addScaledVector(L, 420);
        cascade.intensity = 1; // shadow-only helper: its light colour is zeroed in the patched shader chunk (see patchShadowCascade)
        cascade.target.updateMatrixWorld();
      }
      sun.intensity = state.sunIntensity * (1 + flash * 0.6);
      if (state.headOn) {
        const fx = -Math.sin(carYaw), fz = -Math.cos(carYaw), rx = Math.cos(carYaw), rz = -Math.sin(carYaw);
        for (let k = 0; k < 2; k++) {
          const sd = k === 0 ? -1 : 1, h = heads[k];
          h.position.set(carPos.x + fx * 2.0 + rx * 0.62 * sd, carPos.y + 0.7, carPos.z + fz * 2.0 + rz * 0.62 * sd);
          h.target.position.set(carPos.x + fx * 38 + rx * 1.0 * sd, carPos.y - 0.2, carPos.z + fz * 38 + rz * 1.0 * sd);
          h.target.updateMatrixWorld();
          h.intensity = 800;
        }
      }
    },
    dispose() {
      scene.remove(sun, sun.target, hemi, cascade, cascade.target);
      sun.shadow.map?.dispose(); cascade.shadow.map?.dispose();
      for (const h of heads) scene.remove(h, h.target);
    },
  };
  return api;
}
