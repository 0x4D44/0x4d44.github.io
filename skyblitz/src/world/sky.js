// Sky dome (gradient, sun disc + glow, procedural cloud deck, stars, aurora) + PMREM environment + billboard cloud puffs. Owner: world agent.
import * as THREE from 'three';

/** Default glow around the sun: [broad amplitude, broad exponent, tight amplitude, tight exponent]. A course may set `environment.sunGlow` to tame it (R2-V-15: Sunrise); the sea reflects the same glow. */
export const SUN_GLOW = [0.28, 6, 0.45, 40];

const SKY_VS = `
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;                      // always at the far plane
}`;
const SKY_FS = `
uniform vec3 uTop, uMid, uHorizon, uBelow, uSunDir, uSunColor;
uniform vec4 uGlow;                          // glow around the sun: (broad amplitude, broad exponent, tight amplitude, tight exponent); env.sunGlow
uniform float uNight, uTime, uCloud, uAurora, uSunSize;
uniform vec3 uCloudLit, uCloudShade;
uniform sampler2D tStars, tAurora;
varying vec3 vDir;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<5;i++){ s += a*vn(p); p = p*2.03 + 7.1; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  float up = clamp(y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, up));
  col = mix(col, uTop, smoothstep(0.12, 0.85, up));
  col = mix(col, uBelow, smoothstep(0.0, -0.18, y));
  float sd = max(dot(d, uSunDir), 0.0);
  // warm glow toward the sun, tight disc
  col += uSunColor * (pow(sd, uGlow.y) * uGlow.x + pow(sd, uGlow.w) * uGlow.z) * (1.0 - uNight * 0.6);
  float disc = smoothstep(uSunSize, uSunSize * 0.82, 1.0 - sd);
  col += uSunColor * disc * 9.0 * (1.0 - uNight);
  // stars
  if (uNight > 0.01 && y > 0.0) {
    vec2 su = vec2(atan(d.x, -d.z) / 6.2831853 + 0.5, y);
    float st = texture2D(tStars, vec2(su.x * 2.0, su.y * 1.3)).r;
    col += vec3(st * st) * 1.6 * uNight * smoothstep(0.0, 0.25, y);
  }
  // aurora curtains
  if (uAurora > 0.01 && y > 0.02) {
    vec2 au = vec2(atan(d.x, -d.z) / 6.2831853 * 3.0 + uTime * 0.01, y * 1.6 - 0.05);
    vec4 a = texture2D(tAurora, au);
    float m = smoothstep(0.02, 0.2, y) * (1.0 - smoothstep(0.55, 0.95, y));
    col += a.rgb * a.a * m * uAurora * 1.8;
  }
  // cloud deck: projected onto a plane, lit from the sun side
  if (uCloud > 0.01 && y > 0.005) {
    vec2 cp = d.xz / (y + 0.14) * 0.55 + vec2(uTime * 0.004, 0.0);
    float n = fbm(cp * 1.3);
    float cov = smoothstep(0.52 - uCloud * 0.12, 0.82, n);
    float n2 = fbm(cp * 1.3 + uSunDir.xz * 0.12);
    float lit = clamp(0.5 + (n - n2) * 6.0, 0.0, 1.0);
    vec3 cc = mix(uCloudShade, uCloudLit, lit);
    cc += uSunColor * pow(sd, 8.0) * 0.5;
    col = mix(col, cc, cov * smoothstep(0.005, 0.12, y) * 0.9);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createSkyDome(env, game, opts = {}) {
  const u = {
    uTop: { value: env.skyTop }, uMid: { value: env.skyMid ?? env.skyTop.clone().lerp(env.skyHorizon, 0.55) }, uHorizon: { value: env.skyHorizon },
    uBelow: { value: env.fogColor }, uSunDir: { value: env.sunDir }, uSunColor: { value: env.sunColor }, uGlow: { value: new THREE.Vector4(...(env.sunGlow ?? SUN_GLOW)) },
    uNight: { value: env.night ? 1 : 0 }, uTime: { value: 0 }, uCloud: { value: opts.cloudDeck ?? 0.6 }, uAurora: { value: opts.aurora ?? 0 }, uSunSize: { value: opts.sunSize ?? 0.0009 },
    uCloudLit: { value: opts.cloudLit ?? new THREE.Color(1.0, 0.93, 0.85) }, uCloudShade: { value: opts.cloudShade ?? new THREE.Color(0.55, 0.5, 0.6) },
    tStars: { value: game.assets.tex('stars') }, tAurora: { value: game.assets.tex('aurora') },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false });
  const geo = new THREE.SphereGeometry(1, 48, 24);
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = -1000; mesh.scale.setScalar(9000); mesh.name = 'sky';
  return {
    group: mesh, uniforms: u,
    /** environment map for reflective paint (PMREM of the dome alone) */
    makeEnvMap(renderer) {
      const sc = new THREE.Scene(); const m2 = mesh.clone(); m2.scale.setScalar(50); m2.material = mat.clone(); m2.material.depthTest = true; m2.material.uniforms = u; sc.add(m2);
      const pm = new THREE.PMREMGenerator(renderer); const rt = pm.fromScene(sc, 0, 0.1, 200); pm.dispose(); m2.material.dispose();
      return rt;
    },
    update(dt, g, course, cam) { u.uTime.value += dt; mesh.position.copy(cam.position); },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

const CLOUD_VS = `
attribute vec4 aUv; attribute vec4 aData;   // uv rect; (size, aspect, opacity, rot)
varying vec2 vUv; varying float vA; varying vec3 vC;
uniform vec3 uLit, uShade;
void main(){
  vec3 c = (modelMatrix * instanceMatrix * vec4(0,0,0,1)).xyz;
  vec4 mv = viewMatrix * vec4(c, 1.0);
  float size = aData.x;
  vec2 p = position.xy * size; p.y *= aData.y;
  float cs = cos(aData.w), sn = sin(aData.w); p = vec2(p.x*cs - p.y*sn, p.x*sn + p.y*cs);
  mv.xy += p;
  gl_Position = projectionMatrix * mv;
  vUv = aUv.xy + uv * aUv.zw;
  float dist = -mv.z;
  vA = aData.z * smoothstep(size * 0.45, size * 1.5, dist);
  vC = c;
}`;
const CLOUD_FS = `
uniform sampler2D tMap; uniform vec3 uLit, uShade, uFog; uniform float uFogD, uFade;
varying vec2 vUv; varying float vA; varying vec3 vC;
void main(){
  vec4 t = texture2D(tMap, vUv);
  float lum = dot(t.rgb, vec3(0.333));
  vec3 col = mix(uShade, uLit, clamp(lum * 1.15, 0.0, 1.0));
  float d = length(cameraPosition - vC);
  float f = 1.0 - exp(-uFogD * uFogD * d * d);
  col = mix(col, uFog, f * 0.75);
  gl_FragColor = vec4(col, t.a * vA * uFade);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Billboard clouds from cloud_atlas: positions given as [{x,y,z,size,rot}]. */
export function createCloudPuffs(env, game, list) {
  const atlas = game.assets.atlas('cloud_atlas');
  const quad = new THREE.PlaneGeometry(1, 1);
  const n = list.length;
  const uvA = new Float32Array(n * 4), dat = new Float32Array(n * 4);
  const tmp = new THREE.Vector4();
  list.forEach((c, i) => {
    game.assets.uv('cloud_atlas', c.cell ?? (i * 7) % 16, tmp); uvA.set([tmp.x, tmp.y, tmp.z, tmp.w], i * 4);
    dat.set([c.size, c.aspect ?? 0.8, c.opacity ?? 0.9, c.rot ?? 0], i * 4);
  });
  quad.setAttribute('aUv', new THREE.InstancedBufferAttribute(uvA, 4));
  quad.setAttribute('aData', new THREE.InstancedBufferAttribute(dat, 4));
  const lit = env.cloudLit ?? new THREE.Color(1, 0.95, 0.9), shade = env.cloudShade ?? new THREE.Color(0.62, 0.66, 0.8);
  const mat = new THREE.ShaderMaterial({
    uniforms: { tMap: { value: atlas.texture }, uLit: { value: lit }, uShade: { value: shade }, uFog: { value: env.fogColor }, uFogD: { value: env.fogDensity }, uFade: { value: 1 } },
    vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS, transparent: true, depthWrite: false, fog: false,
  });
  const im = new THREE.InstancedMesh(quad, mat, n);
  const m = new THREE.Matrix4();
  list.forEach((c, i) => { im.setMatrixAt(i, m.makeTranslation(c.x, c.y, c.z)); });
  im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; im.renderOrder = 5;
  return { group: im, fade: mat.uniforms.uFade, dispose() { quad.dispose(); mat.dispose(); } };
}
