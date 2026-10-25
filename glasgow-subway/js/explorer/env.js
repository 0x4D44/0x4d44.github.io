// Renderer, scene, sky dome, lighting presets (day / dusk / night).
import * as THREE from 'three';
import { lerp } from './util.js';

export const PRESETS = {
  day:   { top: '#4f8fd0', mid: '#a9c9e6', hor: '#dfe9ef', fog: '#c9d9e4', fogD: 0.00015, sun: '#fff0d8', sunI: 2.6, sunEl: 48, sunAz: 215, hemiS: '#cfe3ff', hemiG: '#5b5a50', hemiI: 1.0, exp: 1.0, glow: 0.35, stars: 0, emis: 0 },
  dusk:  { top: '#24305f', mid: '#8a5a7a', hor: '#f29a58', fog: '#b5806f', fogD: 0.00014, sun: '#ff9250', sunI: 2.0, sunEl: 9, sunAz: 250, hemiS: '#a99bd0', hemiG: '#3b2d32', hemiI: 0.75, exp: 1.0, glow: 0.55, stars: 0.35, emis: 0.25 },
  night: { top: '#02040b', mid: '#0a1428', hor: '#17284a', fog: '#0a1426', fogD: 0.00016, sun: '#7f9bd8', sunI: 0.5, sunEl: 35, sunAz: 140, hemiS: '#3a4a7a', hemiG: '#11131c', hemiI: 0.55, exp: 1.1, glow: 0.9, stars: 1, emis: 0.6 },
};

const DARK = { top: new THREE.Color('#05070b'), mid: new THREE.Color('#0b1018'), hor: new THREE.Color('#141b26') };
const SKY_V = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const SKY_F = `varying vec3 vDir; uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol;
void main(){ float h = clamp(vDir.y,-0.2,1.0); vec3 c = mix(hor, mid, smoothstep(0.0,0.28,h)); c = mix(c, top, smoothstep(0.2,0.9,h));
 c = mix(c, hor*0.6, smoothstep(0.0,-0.2,vDir.y)); float s = max(dot(normalize(vDir), sunDir),0.0); c += sunCol*(pow(s,600.0)*1.2 + pow(s,12.0)*0.18);
 gl_FragColor = vec4(c,1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

export function createEnv(canvas, quality) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.aa, powerPreference: 'high-performance', alpha: false });
  renderer.setPixelRatio(Math.min(quality.pixelRatio, devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#c9d9e4', 0.0001);
  const camera = new THREE.PerspectiveCamera(48, 1, 3, 40000);

  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_V, fragmentShader: SKY_F, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() } },
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(30000, 32, 16), skyMat); sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);

  // stars
  const sp = []; for (let i = 0; i < 700; i++) { const u = Math.random(), v = Math.random() * 0.9 + 0.05, th = u * Math.PI * 2, r = Math.sqrt(1 - v * v); sp.push(Math.cos(th) * r * 28000, v * 28000, Math.sin(th) * r * 28000); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#cfe0ff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  stars.frustumCulled = false; stars.renderOrder = -9; scene.add(stars);

  const hemi = new THREE.HemisphereLight('#fff', '#444', 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff', 2); scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight('#ff9a55', 0.0); scene.add(rim); // warm kick used when x-raying
  rim.position.set(-400, 300, -500);

  const env = {
    renderer, scene, camera, sky, hemi, sun, rim, stars, preset: 'day', cur: null, glow: 0.35, emis: 0, listeners: [],
    setSize(w, h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); },
    setPreset(name, instant = false) { if (!PRESETS[name]) return; env.preset = name; env.from = env.cur ? { ...env.cur } : null; env.tt = instant || !env.cur ? 1 : 0; env.target = PRESETS[name]; if (!env.cur) env.cur = flat(PRESETS[name]); if (instant) { env.cur = flat(PRESETS[name]); apply(); } },
    update(dt, camTarget) {
      sky.position.copy(camera.position);
      if (env.tt < 1) {
        env.tt = Math.min(1, env.tt + dt / 1.2); const t = env.tt * env.tt * (3 - 2 * env.tt); const a = env.from || flat(env.target), b = flat(env.target);
        const c = {}; for (const k in b) c[k] = (b[k] instanceof THREE.Color) ? a[k].clone().lerp(b[k], t) : lerp(a[k], b[k], t);
        env.cur = c; apply();
      }
      sun.target.position.copy(camTarget); sun.target.updateMatrixWorld();
      sun.position.copy(camTarget).addScaledVector(sunDir(env.cur), 4000);
    },
  };
  function flat(p) { const o = {}; for (const k in p) o[k] = (typeof p[k] === 'string') ? new THREE.Color(p[k]) : p[k]; return o; }
  function sunDir(c) { const el = THREE.MathUtils.degToRad(c.sunEl), az = THREE.MathUtils.degToRad(c.sunAz); return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)); }
  function apply(skip) {
    const c = env.cur; const u = skyMat.uniforms;
    const d = env.dim * 0.82; u.top.value.copy(c.top).lerp(DARK.top, d); u.mid.value.copy(c.mid).lerp(DARK.mid, d); u.hor.value.copy(c.hor).lerp(DARK.hor, d); u.sunDir.value.copy(sunDir(c)); u.sunCol.value.copy(c.sun);
    scene.fog.color.copy(c.fog).lerp(DARK.hor, d); scene.fog.density = c.fogD * env.fogScale;
    hemi.color.copy(c.hemiS); hemi.groundColor.copy(c.hemiG); hemi.intensity = c.hemiI;
    sun.color.copy(c.sun); sun.intensity = c.sunI; renderer.toneMappingExposure = c.exp;
    stars.material.opacity = c.stars; env.glow = c.glow; env.emis = c.emis;
    if (skip !== true) env.listeners.forEach((f) => f(c));
  }
  env.fogScale = 1; env.dim = 0; env.setDim = (v) => { env.dim = v; apply(true); }; env.refresh = apply;
  env.setPreset('day', true);
  return env;
}
