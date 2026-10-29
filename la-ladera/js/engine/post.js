// Post-processing chain (owner: A1):
//   scene -> HDR target (MSAA on high) -> bloom (HDR threshold) -> ACES tone map + sRGB (OutputPass)
//         -> colour grade / vignette / dither (this file) -> SMAA
// Every quality level goes through the same chain (only the optional passes switch off), so the picture keeps one consistent
// look when adaptive quality steps down. A plain renderer.render() remains only as the emergency fallback if the chain throws.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';

const GradeShader = {
  name: 'LaderaGrade',
  uniforms: {
    tDiffuse: { value: null }, uVig: { value: 0.30 }, uSat: { value: 1.06 }, uCon: { value: 0.22 }, uTime: { value: 0 }, uGrain: { value: 0.010 },
    uAspect: { value: 1 }, uFade: { value: 0 }, uWarm: { value: new THREE.Color(1.045, 1.0, 0.93) }, uCool: { value: new THREE.Color(0.93, 0.99, 1.07) },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uVig, uSat, uCon, uTime, uGrain, uAspect, uFade; uniform vec3 uWarm, uCool; varying vec2 vUv;
    float hash( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
    void main() {
      vec3 c = texture2D( tDiffuse, vUv ).rgb;                       // sRGB, already tone mapped
      float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
      c = mix( vec3( l ), c, uSat );
      c = mix( c, c * c * ( 3.0 - 2.0 * c ), uCon );                 // gentle S-curve
      c *= mix( uCool, uWarm, smoothstep( 0.12, 0.85, l ) );         // cool shadows, warm highlights
      vec2 d = ( vUv - 0.5 ) * vec2( uAspect, 1.0 );
      c *= 1.0 - uVig * smoothstep( 0.30, 1.0, length( d ) * 1.25 ); // vignette
      float n = hash( gl_FragCoord.xy + fract( uTime ) * 61.0 ) + hash( gl_FragCoord.xy * 1.7 + 17.0 + fract( uTime * 1.3 ) * 23.0 ) - 1.0;
      c += n * ( 1.2 / 255.0 + uGrain * 0.35 );                      // triangular dither (kills banding in the sky) + faint grain
      c = mix( c, vec3( 0.0 ), uFade );
      gl_FragColor = vec4( clamp( c, 0.0, 1.0 ), 1.0 );
    }`,
};

/** Renders the scene into a dedicated multisampled HDR target and copies the resolved image into the composer's buffer,
 *  so only ONE render target pays for MSAA (the ping-pong buffers stay single-sample). */
class MSAAScenePass extends Pass {
  constructor(scene, camera, samples) {
    super();
    this.scene = scene; this.camera = camera; this.needsSwap = false;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples, colorSpace: THREE.LinearSRGBColorSpace });
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms), vertexShader: CopyShader.vertexShader, fragmentShader: CopyShader.fragmentShader,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    }));
  }
  setSize(w, h) { this.rt.setSize(w, h); }
  render(renderer, writeBuffer, readBuffer) {
    const auto = renderer.autoClear; renderer.autoClear = true;
    renderer.setRenderTarget(this.rt); renderer.render(this.scene, this.camera);       // resolves into rt.texture at the end of render()
    const u = this.quad.material.uniforms; u.tDiffuse.value = this.rt.texture; u.opacity.value = 1;
    renderer.setRenderTarget(readBuffer); this.quad.render(renderer);
    renderer.autoClear = auto;
  }
  dispose() { this.rt.dispose(); this.quad.material.dispose(); this.quad.dispose(); }
}

/** Quality profiles. `samples` = MSAA on the HDR target; `ratio` = max device pixel ratio; `shadow` = shadow-map size; `lights` = real point lights. */
export const PROFILES = {
  high:   { samples: 4, smaa: true,  bloom: true,  ratio: 1.5,  shadow: 4096, lights: 8 },
  medium: { samples: 0, smaa: true,  bloom: true,  ratio: 1.25, shadow: 2048, lights: 6 },
  low:    { samples: 0, smaa: false, bloom: false, ratio: 1.0,  shadow: 1024, lights: 4 },
};

export class Post {
  constructor(ctx, renderer, scene, camera) {
    this.ctx = ctx; this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.composer = null; this.profile = PROFILES.high; this.name = 'high'; this.broken = false; this.fade = 0;
    this.scenePass = null; this.bloom = this.grade = this.smaa = null;
  }

  /** (Re)build the chain for a profile name. Safe to call repeatedly. */
  setProfile(name) {
    const prof = PROFILES[name] ?? PROFILES.high;
    this.profile = prof; this.name = name;
    this._dispose();
    if (this.broken || this.ctx.opts.post === false) return;
    try {
      const r = this.renderer, size = r.getSize(new THREE.Vector2()), pr = r.getPixelRatio();
      const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 0, colorSpace: THREE.LinearSRGBColorSpace });
      const c = this.composer = new EffectComposer(r, rt);
      c.setPixelRatio(pr); c.setSize(size.x, size.y);
      this.scenePass = prof.samples > 0 ? new MSAAScenePass(this.scene, this.camera, prof.samples) : new RenderPass(this.scene, this.camera);
      c.addPass(this.scenePass);
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x * pr / 2, size.y * pr / 2), 0.3, 0.7, 2.0);
      this.bloom.enabled = prof.bloom; c.addPass(this.bloom);
      c.addPass(new OutputPass());
      this.grade = new ShaderPass(GradeShader); c.addPass(this.grade);
      this.smaa = null;
      if (prof.smaa && this.ctx.opts.aa !== false) { this.smaa = new SMAAPass(); c.addPass(this.smaa); }
      this.grade.uniforms.uAspect.value = size.x / size.y;
    } catch (e) {
      console.error('[post] chain failed, rendering directly', e);
      this.ctx.errors.push({ stage: 'post', message: String(e?.message ?? e) });
      this.broken = true; this._dispose();
    }
  }

  setSize(w, h) {
    if (!this.composer) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    if (this.grade) this.grade.uniforms.uAspect.value = w / h;
  }

  _dispose() {
    const c = this.composer;
    if (!c) return;
    try {
      for (const p of c.passes) p.dispose?.();
      c.renderTarget1?.dispose(); c.renderTarget2?.dispose();
    } catch { /* ignore */ }
    this.composer = null; this.scenePass = this.bloom = this.grade = this.smaa = null;
  }

  get active() { return !!this.composer; }

  render(dt, look) {
    const c = this.composer;
    if (!c) { this.renderer.render(this.scene, this.camera); return; }
    const st = look.state, g = this.grade.uniforms;
    if (this.bloom.enabled) { this.bloom.strength = st.bloomStrength; this.bloom.threshold = st.bloomThreshold; }
    g.uSat.value = st.saturation; g.uTime.value += dt; g.uFade.value = this.fade;
    try { c.render(dt); } catch (e) {
      console.error('[post] render failed, falling back', e);
      this.ctx.errors.push({ stage: 'post', message: String(e?.message ?? e) });
      this.broken = true; this._dispose(); this.renderer.render(this.scene, this.camera);
    }
  }
}
