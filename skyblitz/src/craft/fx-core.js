// Effect building blocks: instanced billboard particle pools, camera-facing ribbon trails, small shaders. Owner: craft agent.
// Everything is preallocated; per-frame work allocates nothing.
import * as THREE from 'three';

const VS = /* glsl */`
attribute vec3 iPos; attribute float iSize; attribute float iRot; attribute vec4 iCol; attribute vec4 iUV;
varying vec2 vUv; varying vec4 vCol;
void main() {
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  float c = cos(iRot), s = sin(iRot);
  vec2 p = position.xy * iSize;
  mv.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  vUv = iUV.xy + (position.xy + 0.5) * iUV.zw; vCol = iCol;
  gl_Position = projectionMatrix * mv;
}`;
const FS = /* glsl */`
uniform sampler2D map; varying vec2 vUv; varying vec4 vCol;
void main() {
  vec4 t = texture2D(map, vUv);
  #ifdef ADDITIVE
    gl_FragColor = vec4(t.rgb * vCol.rgb * (t.a * vCol.a), 1.0);
  #elif defined(PREMUL)
    gl_FragColor = vec4(t.rgb * vCol.rgb * (t.a * vCol.a), t.a * vCol.a);
  #else
    gl_FragColor = vec4(t.rgb * vCol.rgb, t.a * vCol.a);
  #endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const STRIDE = 22;   // floats per particle in the sim array
// layout: 0-2 pos, 3-5 vel, 6 age, 7 life, 8 s0, 9 s1, 10 rot, 11 rotV, 12-15 c0, 16-19 c1, 20 grav, 21 drag ; frames in Int arrays

export class SpriteSystem {
  constructor(texture, { cols = 1, rows = 1, additive = true, premul = false, cap = 2000, order = 5 } = {}) {
    this.cap = cap; this.n = 0; this.cols = cols; this.rows = rows; this.additive = additive;
    this.sim = new Float32Array(cap * STRIDE); this.f0 = new Int16Array(cap); this.fn = new Int16Array(cap);
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry(); g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aUV = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iSize', this.aSize); g.setAttribute('iRot', this.aRot); g.setAttribute('iCol', this.aCol); g.setAttribute('iUV', this.aUV);
    g.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture } }, vertexShader: VS, fragmentShader: FS, defines: additive ? { ADDITIVE: '' } : premul ? { PREMUL: '' } : {},
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : premul ? THREE.CustomBlending : THREE.NormalBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
    });
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = order; this.geo = g; this.mat = mat;
  }
  /** Emit one particle. Colours are rgba start -> end; size s0 -> s1; f0/fn pick atlas cells (fn>0 = flipbook over the lifetime). */
  emit(x, y, z, vx, vy, vz, life, s0, s1, r0, g0, b0, a0, r1, g1, b1, a1, grav = 0, drag = 0, f0 = 0, fn = 0, rot = 0, rotV = 0) {
    if (this.n >= this.cap) return false;
    const i = this.n++, o = i * STRIDE, s = this.sim;
    s[o] = x; s[o + 1] = y; s[o + 2] = z; s[o + 3] = vx; s[o + 4] = vy; s[o + 5] = vz; s[o + 6] = 0; s[o + 7] = life; s[o + 8] = s0; s[o + 9] = s1; s[o + 10] = rot; s[o + 11] = rotV;
    s[o + 12] = r0; s[o + 13] = g0; s[o + 14] = b0; s[o + 15] = a0; s[o + 16] = r1; s[o + 17] = g1; s[o + 18] = b1; s[o + 19] = a1; s[o + 20] = grav; s[o + 21] = drag;
    this.f0[i] = f0; this.fn[i] = fn;
    return true;
  }
  update(dt) {
    const s = this.sim, cols = this.cols, rows = this.rows, cw = 1 / cols, ch = 1 / rows;
    const P = this.aPos.array, Z = this.aSize.array, R = this.aRot.array, C = this.aCol.array, U = this.aUV.array;
    let i = 0;
    while (i < this.n) {
      const o = i * STRIDE;
      s[o + 6] += dt;
      const age = s[o + 6], life = s[o + 7];
      if (age >= life) {      // swap-remove
        const last = --this.n;
        if (i !== last) { const lo = last * STRIDE; for (let k = 0; k < STRIDE; k++) s[o + k] = s[lo + k]; this.f0[i] = this.f0[last]; this.fn[i] = this.fn[last]; }
        continue;
      }
      const t = age / life, drag = Math.exp(-s[o + 21] * dt);
      s[o + 3] *= drag; s[o + 4] = s[o + 4] * drag - s[o + 20] * dt; s[o + 5] *= drag;
      s[o] += s[o + 3] * dt; s[o + 1] += s[o + 4] * dt; s[o + 2] += s[o + 5] * dt;
      s[o + 10] += s[o + 11] * dt;
      P[i * 3] = s[o]; P[i * 3 + 1] = s[o + 1]; P[i * 3 + 2] = s[o + 2];
      Z[i] = s[o + 8] + (s[o + 9] - s[o + 8]) * t; R[i] = s[o + 10];
      C[i * 4] = s[o + 12] + (s[o + 16] - s[o + 12]) * t; C[i * 4 + 1] = s[o + 13] + (s[o + 17] - s[o + 13]) * t;
      C[i * 4 + 2] = s[o + 14] + (s[o + 18] - s[o + 14]) * t; C[i * 4 + 3] = s[o + 15] + (s[o + 19] - s[o + 15]) * t;
      let cell = this.f0[i]; const fn = this.fn[i]; if (fn > 0) cell += Math.min(fn - 1, Math.floor(t * fn));
      const cx = cell % cols, cy = Math.floor(cell / cols) % rows;
      U[i * 4] = cx * cw; U[i * 4 + 1] = 1 - (cy + 1) * ch; U[i * 4 + 2] = cw; U[i * 4 + 3] = ch;
      i++;
    }
    this.geo.instanceCount = this.n;
    this.aPos.needsUpdate = this.aSize.needsUpdate = this.aRot.needsUpdate = this.aCol.needsUpdate = this.aUV.needsUpdate = true;
  }
  clear() { this.n = 0; this.geo.instanceCount = 0; }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

// ---------------------------------------------------------------------------------------------------------------- ribbons
const _side = new THREE.Vector3(), _tan = new THREE.Vector3(), _toCam = new THREE.Vector3();

/** Many camera-facing ribbon trails in one draw call. Each ribbon is a ring buffer of N points. */
export class RibbonSystem {
  constructor({ ribbons = 24, N = 64, additive = false, order = 4 } = {}) {
    this.R = ribbons; this.N = N;
    this.pts = new Float32Array(ribbons * N * 3); this.birth = new Float32Array(ribbons * N);
    this.head = new Int16Array(ribbons); this.count = new Int16Array(ribbons); this.active = new Uint8Array(ribbons);
    this.width = new Float32Array(ribbons); this.life = new Float32Array(ribbons); this.tint = new Float32Array(ribbons * 4); this.gain = new Float32Array(ribbons);
    this.lastT = new Float32Array(ribbons); this.shown = new Uint8Array(ribbons);
    const V = ribbons * N * 2;
    this.pos = new Float32Array(V * 3); this.col = new Float32Array(V * 4);
    const idx = new Uint32Array(ribbons * (N - 1) * 6); let k = 0;
    for (let r = 0; r < ribbons; r++) for (let i = 0; i < N - 1; i++) {
      const a = (r * N + i) * 2, b = a + 2;
      idx[k++] = a; idx[k++] = a + 1; idx[k++] = b; idx[k++] = a + 1; idx[k++] = b + 1; idx[k++] = b;
    }
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage); this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('color', this.aCol); g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = order; this.geo = g;
    this.free = []; for (let r = ribbons - 1; r >= 0; r--) this.free.push(r);
  }
  acquire(width, life, r, g, b, gain = 1) {
    if (!this.free.length) return -1;
    const id = this.free.pop(); this.active[id] = 1; this.count[id] = 0; this.head[id] = 0; this.width[id] = width; this.life[id] = life; this.gain[id] = gain;
    this.tint[id * 4] = r; this.tint[id * 4 + 1] = g; this.tint[id * 4 + 2] = b; this.tint[id * 4 + 3] = 1; this.lastT[id] = -1e9;
    return id;
  }
  release(id) { if (id < 0 || !this.active[id]) return; this.active[id] = 0; this.free.push(id); this.hide(id); }
  hide(id) { const v = id * this.N * 2; this.col.fill(0, v * 4, (v + this.N * 2) * 4); this.pos.fill(0, v * 3, (v + this.N * 2) * 3); this.shown[id] = 0; }
  /** Break the ribbon (teleport/respawn) so no streak crosses the gap. */
  cut(id) { if (id >= 0) { this.count[id] = 0; } }
  push(id, x, y, z, now) {
    if (id < 0) return;
    const N = this.N, h = (this.head[id] + 1) % N; this.head[id] = h;
    const o = (id * N + h) * 3; this.pts[o] = x; this.pts[o + 1] = y; this.pts[o + 2] = z; this.birth[id * N + h] = now;
    if (this.count[id] < N) this.count[id]++;
  }
  update(now, camera) {
    const N = this.N, cp = camera.position;
    for (let r = 0; r < this.R; r++) {
      if (!this.active[r]) continue;
      const cnt = this.count[r]; const vbase = r * N * 2;
      if (cnt < 2) { if (this.shown[r]) this.hide(r); continue; }
      this.shown[r] = 1;
      const life = this.life[r], w0 = this.width[r], tr = this.tint[r * 4], tg = this.tint[r * 4 + 1], tb = this.tint[r * 4 + 2], gain = this.gain[r];
      for (let k = 0; k < N; k++) {
        const kk = Math.min(k, cnt - 1);
        const ii = (this.head[r] - kk + N * 2) % N, o = (r * N + ii) * 3;
        const iN = (this.head[r] - Math.min(kk + 1, cnt - 1) + N * 2) % N, iP = (this.head[r] - Math.max(kk - 1, 0) + N * 2) % N;
        const px = this.pts[o], py = this.pts[o + 1], pz = this.pts[o + 2];
        _tan.set(this.pts[(r * N + iP) * 3] - this.pts[(r * N + iN) * 3], this.pts[(r * N + iP) * 3 + 1] - this.pts[(r * N + iN) * 3 + 1], this.pts[(r * N + iP) * 3 + 2] - this.pts[(r * N + iN) * 3 + 2]);
        _toCam.set(cp.x - px, cp.y - py, cp.z - pz);
        _side.crossVectors(_tan, _toCam); const sl = _side.length(); if (sl > 1e-6) _side.multiplyScalar(1 / sl); else _side.set(1, 0, 0);
        const age = (now - this.birth[r * N + ii]) / life;
        let a = k >= cnt ? 0 : (1 - age); if (a < 0) a = 0;
        const fade = a * a * (3 - 2 * a);               // smoothstep fade-out along the length
        const head = Math.min(1, kk / 3);               // soft start at the aircraft end
        const w = w0 * (0.35 + 0.65 * Math.min(1, age * 3 + 0.2) + age * 0.6) * (0.4 + 0.6 * head);
        const al = fade * head * gain * 0.75;
        const v = (vbase + k * 2) * 3, c = (vbase + k * 2) * 4;
        this.pos[v] = px + _side.x * w; this.pos[v + 1] = py + _side.y * w; this.pos[v + 2] = pz + _side.z * w;
        this.pos[v + 3] = px - _side.x * w; this.pos[v + 4] = py - _side.y * w; this.pos[v + 5] = pz - _side.z * w;
        this.col[c] = this.col[c + 4] = tr; this.col[c + 1] = this.col[c + 5] = tg; this.col[c + 2] = this.col[c + 6] = tb; this.col[c + 3] = this.col[c + 7] = al;
      }
    }
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true;
  }
  dispose() { this.geo.dispose(); this.mesh.material.dispose(); }
}

// ---------------------------------------------------------------------------------------------------------------- shaders
export function fresnelMaterial(color, power = 2.5, intensity = 1.5) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uPower: { value: power }, uI: { value: intensity }, uTime: { value: 0 }, uPulse: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vP = position; vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uPower,uI,uTime,uPulse; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower);
        float hex = 0.5 + 0.5*sin(vP.x*9.0+uTime*2.0)*sin(vP.y*9.0-uTime*1.5)*sin(vP.z*9.0+uTime);
        float a = (f*0.9 + 0.05 + hex*0.18*f + uPulse*0.5) * uI; gl_FragColor = vec4(uColor * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

/** Procedural canvas textures (browser only). */
export function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export const starTexture = () => canvasTex(256, (g, S) => {
  g.translate(S / 2, S / 2);
  const rg = g.createRadialGradient(0, 0, 0, 0, 0, S / 2); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.12, 'rgba(255,255,255,0.55)'); rg.addColorStop(0.5, 'rgba(255,255,255,0.08)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.beginPath(); g.arc(0, 0, S / 2, 0, 7); g.fill();
  for (let k = 0; k < 4; k++) {
    g.save(); g.rotate((k * Math.PI) / 4 + 0.2); const len = k % 2 ? S * 0.36 : S * 0.5;
    const lg = g.createLinearGradient(-len, 0, len, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.95)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg; g.beginPath(); g.moveTo(-len, 0); g.lineTo(0, -S * 0.022); g.lineTo(len, 0); g.lineTo(0, S * 0.022); g.fill(); g.restore();
  }
});
export const glowTexture = () => canvasTex(128, (g, S) => {
  const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.25, 'rgba(255,255,255,0.55)'); rg.addColorStop(0.6, 'rgba(255,255,255,0.12)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, S, S);
});
export const ringTexture = () => canvasTex(256, (g, S) => {
  const rg = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2); rg.addColorStop(0, 'rgba(255,255,255,0)'); rg.addColorStop(0.55, 'rgba(255,255,255,0.15)'); rg.addColorStop(0.82, 'rgba(255,255,255,1)'); rg.addColorStop(0.9, 'rgba(255,255,255,0.5)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, S, S);
});
