// Post-processing pipeline. Owner: craft agent.
//   createPost(game) -> { init(), setQuality(q), resize(w, h, pixelRatio), update(dt, game), render(dt), dispose() }
// Chain (HDR half-float): Render -> UnrealBloom -> [speed blur + chromatic aberration] -> OutputPass (ACES + sRGB)
//                         -> [grade + vignette + boost glow + flashes + grain] -> FXAA | SMAA -> screen.
// game.q.post === false (Low) runs a light chain Render -> Output -> grade so the per-course grade still applies. Flashes honour settings.reduceFlash.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { quietShaderWarnings } from './env.js';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

const SPEED_SHADER = {
  uniforms: { tDiffuse: { value: null }, uBlur: { value: 0 }, uCA: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uAspect: { value: 1 } },
  vertexShader: VERT,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uBlur; uniform float uCA; uniform vec2 uCenter; uniform float uAspect; varying vec2 vUv;
    void main() {
      vec2 d = vUv - uCenter; vec2 da = vec2(d.x * uAspect, d.y);
      float mask = smoothstep(0.12, 0.85, length(da));
      vec3 col;
      if (uBlur > 0.0005) {
        vec2 dir = -d * uBlur * mask; vec3 acc = vec3(0.0); float ws = 0.0;
        for (int i = 0; i < 8; i++) { float t = float(i) / 7.0; float w = 1.0 - t * 0.55; acc += texture2D(tDiffuse, vUv + dir * t).rgb * w; ws += w; }
        col = acc / ws;
      } else col = texture2D(tDiffuse, vUv).rgb;
      if (uCA > 0.0002) {
        vec2 o = d * uCA * (0.35 + mask);
        col.r = 0.4 * col.r + 0.6 * texture2D(tDiffuse, vUv + o).r;
        col.b = 0.4 * col.b + 0.6 * texture2D(tDiffuse, vUv - o).b;
      }
      gl_FragColor = vec4(col, 1.0);
    }`,
};

const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null }, uSat: { value: 1 }, uContrast: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) }, uVig: { value: 0.3 },
    uFlash: { value: new THREE.Vector4(1, 1, 1, 0) }, uGrain: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 }, uBoost: { value: 0 }, uRes: { value: new THREE.Vector2(1280, 720) },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uSat, uContrast, uVig, uGrain, uTime, uAspect, uBoost; uniform vec3 uTint; uniform vec4 uFlash; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * uContrast + 0.5;
      c *= uTint;
      vec2 q = (vUv - 0.5) * vec2(uAspect * 0.75 + 0.25, 1.0);
      float r = length(q);
      c *= 1.0 - uVig * smoothstep(0.28, 0.95, r);
      c += uBoost * vec3(0.06, 0.2, 0.45) * smoothstep(0.35, 0.9, r);
      c = mix(c, uFlash.rgb, uFlash.a);
      float n = hash(vUv * uRes + fract(uTime) * 61.0) - 0.5;
      c += n * (uGrain + 0.006);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function createPost(game) {
  let composer = null, bloom = null, speedPass = null, gradePass = null, aaPass = null, renderPass = null, outPass = null;
  let built = null;                        // quality signature the composer was built for
  let W = 1, H = 1, PR = 1;
  const S = { speed: 0, boost: 0, tumble: 0, flash: 0, fr: 1, fg: 1, fb: 1, time: 0, flashMax: 1 };
  const offs = [];
  const emp = new THREE.Vector3();

  const player = () => game.player || game.race?.racers?.[0] || null;

  function flash(r, g, b, a) {
    const k = game.settings?.reduceFlash ? 0.12 : 1;
    const v = Math.min(0.5, a * k);        // never white the frame out (flash cap)
    if (v > S.flash) { S.flash = v; S.fr = r; S.fg = g; S.fb = b; }
  }

  function build() {
    const q = game.q, sig = `${q.post}|${q.aa}|${q.bloom}`;
    if (built === sig && composer) return;
    destroy();
    built = sig;
    const rt = new THREE.WebGLRenderTarget(Math.max(1, W * PR), Math.max(1, H * PR), q.post ? { type: THREE.HalfFloatType, samples: q.aa === 'msaa' ? 4 : 0 } : { type: THREE.UnsignedByteType, samples: 0 });
    composer = new EffectComposer(game.renderer, rt);
    composer.setPixelRatio(PR); composer.setSize(W, H);
    renderPass = new RenderPass(game.scene, game.camera); composer.addPass(renderPass);
    if (q.post && q.bloom) {
      bloom = new UnrealBloomPass(new THREE.Vector2(W * PR, H * PR), 0.5, 0.5, 0.9);
      // clamp the HDR that feeds the bloom so a sun disc or a ring cannot flood the frame and swallow the craft (V-15)
      const hp = bloom.materialHighPassFilter;
      hp.fragmentShader = hp.fragmentShader.replace('vec4 texel = texture2D( tDiffuse, vUv );', 'vec4 texel = texture2D( tDiffuse, vUv ); texel.rgb *= min(1.0, 2.6 / max(luminance(texel.rgb), 0.001));');
      composer.addPass(bloom);
    }
    if (q.post) { speedPass = new ShaderPass(SPEED_SHADER); speedPass.enabled = false; composer.addPass(speedPass); }
    outPass = new OutputPass(); composer.addPass(outPass);
    gradePass = new ShaderPass(GRADE_SHADER);
    composer.addPass(gradePass);
    if (!q.post) { /* Low: light chain, no AA pass */ } else if (q.aa === 'smaa') { aaPass = new SMAAPass(); composer.addPass(aaPass); }
    else if (q.aa === 'fxaa') { aaPass = new FXAAPass(); composer.addPass(aaPass); }
    applyEnv(true);
    composer.setPixelRatio(PR); composer.setSize(W, H);
  }

  function destroy() {
    if (composer) { composer.passes.forEach((p) => p.dispose?.()); composer.renderTarget1?.dispose(); composer.renderTarget2?.dispose(); }
    composer = bloom = speedPass = gradePass = aaPass = renderPass = outPass = null; built = null;
  }

  // Compile three's PMREM blur shader once, at boot, with its harmless ANGLE warnings (X4122/X3595, V-35) silenced; every course's sky then reuses the program.
  let pmremWarmed = false;
  function warmPmrem() {
    if (pmremWarmed || !game.renderer?.getContext) return; pmremWarmed = true;
    try {
      const sc = new THREE.Scene(); sc.background = new THREE.Color(0.2, 0.3, 0.5);
      const pm = new THREE.PMREMGenerator(game.renderer); const rt = quietShaderWarnings(game.renderer, () => pm.fromScene(sc, 0, 0.1, 10)); rt.dispose(); pm.dispose();
    } catch (e) { /* optional warm-up */ }
  }

  let lastEnv = null;
  function applyEnv(force) {
    const env = game.course?.environment; if (!env) { if (force && bloom) { bloom.strength = 0.45; bloom.threshold = 0.9; bloom.radius = 0.5; } return; }
    if (!force && env === lastEnv) return; lastEnv = env;
    const b = env.bloom || {};
    if (bloom) { bloom.strength = (b.strength ?? 0.5) * 0.85; bloom.threshold = Math.max(1.1, (b.threshold ?? 0.9) + 0.25); bloom.radius = b.radius ?? 0.5; }
    const g = env.grade || {};
    if (gradePass) {
      const u = gradePass.uniforms;
      u.uSat.value = g.saturation ?? 1.08; u.uContrast.value = g.contrast ?? 1.05; u.uVig.value = g.vignette ?? 0.3;
      if (g.tint) { const t = g.tint; if (t.isColor) u.uTint.value.copy(t); else if (Array.isArray(t)) u.uTint.value.setRGB(t[0], t[1], t[2]); else u.uTint.value.set(t); } else u.uTint.value.setRGB(1, 1, 1);
    }
  }

  const evs = [];
  function listen() {
    const ev = game.events, on = (t, f) => evs.push(ev.on(t, f));
    on('racer:hit', ({ racer, kind, severity = 0.5 }) => {
      if (racer !== game.player) return;
      if (kind === 'emp') flash(0.35, 0.8, 1, 0.55);
      else if (kind === 'lightning') flash(0.85, 0.8, 1, 0.9);
      else if (kind === 'cannon') flash(1, 0.55, 0.4, 0.12);
      else if (kind === 'ground' || kind === 'wall') flash(1, 0.7, 0.4, 0.16 + severity * 0.2);
      else flash(1, 0.55, 0.35, 0.25 + severity * 0.4);
    });
    on('emp:fire', ({ pos, radius }) => { const p = game.player; if (p && pos && p.render && p.render.pos.distanceTo(pos) < (radius || 150)) flash(0.4, 0.8, 1, 0.5); });
    on('lightning:strike', ({ target }) => { if (target === game.player) flash(0.85, 0.82, 1, 0.9); });
    on('race:go', () => flash(1, 1, 1, 0.18));
    on('racer:boost', ({ racer, kind }) => { if (racer === game.player && (kind === 'item' || kind === 'ring' || kind === 'start')) flash(0.6, 0.85, 1, 0.12); });
    on('missile:hit', ({ target }) => { if (target === game.player) flash(1, 0.8, 0.5, 0.45); });
  }

  const api = {
    init() { listen(); },
    setQuality() { warmPmrem(); build(); },
    resize(w, h, pr) {
      W = w; H = h; PR = pr;
      if (composer) { composer.setPixelRatio(pr); composer.setSize(w, h); }
      if (gradePass) { gradePass.uniforms.uAspect.value = w / h; gradePass.uniforms.uRes.value.set(w * pr, h * pr); }
      if (speedPass) speedPass.uniforms.uAspect.value = w / h;
    },
    update(dt) {
      const reduce = !!game.settings?.reduceFlash;
      const p = player(), f = p?.flight;
      let sp = 0, bo = 0, tu = 0;
      if (f) {
        sp = clamp01((f.speed - 75) / 95);
        bo = f.boost?.active ? 1 : 0;
        tu = p.tumble > 0 ? 1 : 0;
      }
      const k = 1 - Math.exp(-5 * dt);
      S.speed += (sp - S.speed) * k; S.boost += (bo - S.boost) * (1 - Math.exp(-7 * dt)); S.tumble += (tu - S.tumble) * (1 - Math.exp(-10 * dt));
      S.flash *= Math.exp(-6.5 * dt); if (S.flash < 0.004) S.flash = 0;
      S.time += dt;
      if (!composer) return;
      applyEnv(false);
      const mot = reduce ? 0.2 : 1;
      const blur = (0.005 * S.speed * S.speed + 0.017 * S.boost + 0.012 * S.tumble) * mot;
      const ca = Math.min(0.0011, 0.0004 * S.speed + 0.0022 * S.boost + 0.002 * S.tumble + S.flash * 0.003) * (reduce ? 0.15 : 1);   // capped: the rocket-start GO must not fringe rings/deck edges
      if (speedPass) { speedPass.enabled = blur > 0.0008 || ca > 0.0003; speedPass.uniforms.uBlur.value = blur; speedPass.uniforms.uCA.value = ca; }
      const u = gradePass.uniforms;
      u.uFlash.value.set(S.fr, S.fg, S.fb, S.flash); u.uTime.value = S.time; u.uBoost.value = S.boost * (reduce ? 0.3 : 1);
      u.uGrain.value = game.q.id === 'low' ? 0 : 0.012;
      if (bloom) bloom.strength = (game.course?.environment?.bloom?.strength ?? 0.5) * 0.85 * (1 + 0.4 * S.boost);
    },
    render() {
      build();
      if (!composer) { game.renderer.render(game.scene, game.camera); return; }
      renderPass.camera = game.camera; renderPass.scene = game.scene;
      const info = game.renderer.info; info.autoReset = false; info.reset();   // report the whole frame, not just the last pass
      composer.render();
      info.autoReset = true;
    },
    /** Trigger a manual screen flash (r,g,b 0..1, alpha 0..1). */
    flash,
    dispose() { for (const off of evs) off(); evs.length = 0; destroy(); },
    get composer() { return composer; },
    state: S,
  };
  return api;
}
