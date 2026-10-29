// Post-processing: MSAA HDR target -> bloom -> tone map (OutputPass) -> SMAA (medium) -> grade
// (vignette, grain, speed radial blur, colour grading). Falls back to direct rendering on 'low'.
import { EffectComposer, RenderPass, ShaderPass, UnrealBloomPass, OutputPass, SMAAPass } from "three/addons";

const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uSpeed: { value: 0 }, uVig: { value: 0.32 }, uGrain: { value: 0.035 },
    uLift: { value: [0.0, 0.0, 0.0] }, uGain: { value: [1, 1, 1] }, uSat: { value: 1.0 }, uContrast: { value: 1.0 }, uAspect: { value: 1.6 },
    uDrops: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uSpeed, uVig, uGrain, uSat, uContrast, uAspect, uDrops;
    uniform vec3 uLift, uGain; varying vec2 vUv;
    float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      vec2 c = vUv - 0.5;
      float r = length(c * vec2(uAspect, 1.0));
      vec3 col;
      if (uSpeed > 0.015) {
        float k = uSpeed * 0.055;
        col = vec3(0.0); float tot = 0.0;
        for (int i = 0; i < 7; i++) {
          float f = float(i) / 6.0;
          float w = 1.0 - f * 0.55;
          col += texture2D(tDiffuse, vUv - c * k * f * smoothstep(0.12, 0.7, r) * 2.0).rgb * w; tot += w;
        }
        col /= tot;
      } else col = texture2D(tDiffuse, vUv).rgb;
      // grade: lift / gain / saturation / contrast (sRGB space)
      col = col * uGain + uLift * (1.0 - col);
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uContrast + 0.5;
      // vignette
      float v = smoothstep(0.35, 0.95, r);
      col *= 1.0 - v * uVig;
      // grain (strongest in mid-tones)
      float g = hash(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 91.7) - 0.5;
      col += g * uGrain * (1.0 - abs(l - 0.5) * 1.2);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export function createPost(THREE, renderer, scene, camera) {
  let composer = null, bloom = null, grade = null, rt = null, smaa = null;
  const state = { w: 2, h: 2, pr: 1, cfg: null, enabled: false, gradeParams: null };

  function dispose() {
    composer?.dispose?.();
    rt?.dispose();
    bloom?.dispose?.();
    smaa?.dispose?.();
    composer = rt = bloom = grade = smaa = null;
  }

  function build(cfg) {
    dispose();
    state.cfg = cfg;
    state.enabled = !!cfg.post;
    if (!state.enabled) return;
    rt = new THREE.WebGLRenderTarget(state.w * state.pr, state.h * state.pr, { type: THREE.HalfFloatType, samples: cfg.msaa, depthBuffer: true });
    composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(state.pr);
    composer.setSize(state.w, state.h);
    composer.addPass(new RenderPass(scene, camera));
    if (cfg.bloom) {
      bloom = new UnrealBloomPass(new THREE.Vector2(Math.max(2, (state.w * state.pr) >> 1), Math.max(2, (state.h * state.pr) >> 1)), 0.3, 0.55, 0.9);
      composer.addPass(bloom);
    }
    composer.addPass(new OutputPass());
    if (!cfg.msaa) { smaa = new SMAAPass(state.w * state.pr, state.h * state.pr); composer.addPass(smaa); }
    if (cfg.grade) {
      grade = new ShaderPass(GRADE_SHADER);
      grade.uniforms = THREE.UniformsUtils.clone(GRADE_SHADER.uniforms);
      grade.material.uniforms = grade.uniforms;
      composer.addPass(grade);
      if (state.gradeParams) api.setGrade(state.gradeParams);
    }
  }

  const api = {
    get enabled() { return state.enabled; },
    configure(cfg) { build(cfg); },
    setSize(w, h, pr) {
      state.w = Math.max(2, Math.floor(w)); state.h = Math.max(2, Math.floor(h)); state.pr = pr;
      if (composer) {
        rt.setSize(state.w * pr, state.h * pr);
        composer.setPixelRatio(pr);
        composer.setSize(state.w, state.h);
        if (bloom) bloom.resolution.set(Math.max(2, (state.w * pr) >> 1), Math.max(2, (state.h * pr) >> 1));
        if (grade) grade.uniforms.uAspect.value = state.w / state.h;
      }
    },
    /** { lift:[r,g,b], gain:[r,g,b], sat, contrast, vignette, bloom: {strength, threshold, radius} } */
    setGrade(p) {
      state.gradeParams = p;
      if (grade) {
        const u = grade.uniforms;
        u.uLift.value = p.lift ?? [0, 0, 0]; u.uGain.value = p.gain ?? [1, 1, 1];
        u.uSat.value = p.sat ?? 1; u.uContrast.value = p.contrast ?? 1; u.uVig.value = p.vignette ?? 0.3;
        u.uGrain.value = (p.grain ?? 0.035) * (state.cfg?.grain ?? 1);
      }
      if (bloom && p.bloom) { bloom.strength = p.bloom.strength; bloom.threshold = p.bloom.threshold; bloom.radius = p.bloom.radius; }
    },
    setDynamic(time, speed01) {
      if (grade) { grade.uniforms.uTime.value = time; grade.uniforms.uSpeed.value = speed01; }
    },
    render(dt) { composer.render(dt); },
    /** Start every program the composer needs in parallel and wait for them. The scene programs must be compiled with the HDR target
     *  bound (cache keys include output colour space / tone mapping, which differ between the canvas and a render target),
     *  and each pass material under the target it will render into (the last pass renders to the canvas). */
    async compileAsync(extraScene, cam, onStep) {
      const prev = renderer.getRenderTarget();
      try {
        if (composer && rt) {
          renderer.setRenderTarget(rt);
          await renderer.compileAsync(extraScene, cam);
          onStep?.();
          const passes = composer.passes.filter((p) => p.enabled !== false);
          const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false;
          const sc = new THREE.Scene(); sc.add(quad);
          const oc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
          const mats = (p) => {
            const out = new Set();
            const add = (v) => { if (v && v.isMaterial) out.add(v); else if (Array.isArray(v)) v.forEach(add); };
            if (p.isRenderPass) return out;
            for (const v of Object.values(p)) add(v);
            return out;
          };
          const jobs = [];
          passes.forEach((p, i) => {
            const last = i === passes.length - 1;
            for (const m of mats(p)) jobs.push({ m, target: last ? null : rt });
          });
          // group by target so every compile of a group is in flight at once
          for (const tgt of [rt, null]) {
            const group = jobs.filter((j) => j.target === tgt);
            if (!group.length) continue;
            renderer.setRenderTarget(tgt);
            const sceneG = new THREE.Scene();
            for (const j of group) { const q = new THREE.Mesh(quad.geometry, j.m); q.frustumCulled = false; sceneG.add(q); }
            try { await renderer.compileAsync(sceneG, oc); } catch { /* ignore */ }
            onStep?.();
          }
          quad.geometry.dispose();
        } else {
          renderer.setRenderTarget(null);
          await renderer.compileAsync(extraScene, cam);
        }
      } finally { renderer.setRenderTarget(prev); }
    },
    dispose,
  };
  return api;
}
