// Procedural lightning bolts: jagged camera-facing strips with a hot core and a wide glow, re-jittered at 24 Hz for flicker. Owner: craft agent.
import * as THREE from 'three';

const SEG = 26, BR = 2, BSEG = 9, POOL = 3;
const PTS = SEG + BR * BSEG;            // points per bolt
const _s = new THREE.Vector3(), _t = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();

export class LightningSystem {
  constructor() {
    this.group = new THREE.Group();
    // per bolt: 2 layers (core, glow) x PTS points x 2 verts
    const V = POOL * 2 * PTS * 2;
    this.pos = new Float32Array(V * 3); this.col = new Float32Array(V * 4);
    const idx = [];
    for (let b = 0; b < POOL; b++) for (let l = 0; l < 2; l++) {
      const base = (b * 2 + l) * PTS * 2;
      const strip = (from, n) => { for (let i = 0; i < n - 1; i++) { const a = base + (from + i) * 2, c = a + 2; idx.push(a, a + 1, c, a + 1, c + 1, c); } };
      strip(0, SEG); for (let k = 0; k < BR; k++) strip(SEG + k * BSEG, BSEG);
    }
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage); this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('color', this.aCol); g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 10; this.group.add(this.mesh);
    this.bolts = []; for (let i = 0; i < POOL; i++) this.bolts.push({ t: 99, life: 0.5, top: new THREE.Vector3(), bot: new THREE.Vector3(), rt: 0, seed: 0 });
    this.next = 0;
  }
  strike(pos, camera) {
    const b = this.bolts[this.next]; this.next = (this.next + 1) % POOL;
    b.t = 0; b.life = 0.5; b.bot.copy(pos); b.top.set(pos.x + (Math.random() - 0.5) * 160, pos.y + 900, pos.z + (Math.random() - 0.5) * 160); b.rt = 0; b.seed = Math.random() * 1000;
    void camera;
  }
  _build(bi, b, cam, now) {
    const gl = bi * 2 * PTS * 2;
    // jagged main path from top to bot (displacement shrinks toward the ends)
    let k = 0; const pts = this._p || (this._p = new Float32Array(PTS * 3)), wid = this._w || (this._w = new Float32Array(PTS));
    const rr = (i) => { const x = Math.sin((i + 1) * 12.9898 + b.seed + Math.floor(now * 24) * 78.233) * 43758.5453; return x - Math.floor(x) - 0.5; };
    _d.subVectors(b.bot, b.top);
    for (let i = 0; i < SEG; i++) {
      const f = i / (SEG - 1), e = (0.25 + Math.sin(f * Math.PI)) * 70;
      pts[k * 3] = b.top.x + _d.x * f + rr(i * 3) * e; pts[k * 3 + 1] = b.top.y + _d.y * f; pts[k * 3 + 2] = b.top.z + _d.z * f + rr(i * 3 + 1) * e; wid[k] = 1; k++;
    }
    for (let br = 0; br < BR; br++) {
      const si = 5 + Math.floor((rr(100 + br) + 0.5) * (SEG - 12)); const ox = pts[si * 3], oy = pts[si * 3 + 1], oz = pts[si * 3 + 2];
      const dx = rr(200 + br) * 160, dz = rr(300 + br) * 160;
      for (let i = 0; i < BSEG; i++) { const f = i / (BSEG - 1); pts[k * 3] = ox + dx * f + rr(400 + i) * 12; pts[k * 3 + 1] = oy - 150 * f; pts[k * 3 + 2] = oz + dz * f + rr(500 + i) * 12; wid[k] = 0.45 * (1 - f * 0.8); k++; }
    }
    const fade = Math.max(0, 1 - b.t / b.life), flick = 0.65 + 0.35 * Math.sin(b.t * 90 + b.seed) * Math.sin(b.t * 37);
    const inten = fade * Math.max(0.2, flick);
    for (let layer = 0; layer < 2; layer++) {
      const base = gl + layer * PTS * 2; const w0 = layer === 0 ? 0.9 : 4.5;
      for (let i = 0; i < PTS; i++) {
        const px = pts[i * 3], py = pts[i * 3 + 1], pz = pts[i * 3 + 2];
        const s0 = i < SEG ? 0 : SEG + Math.floor((i - SEG) / BSEG) * BSEG, s1 = i < SEG ? SEG - 1 : s0 + BSEG - 1;
        const j = Math.min(i + 1, s1), j2 = Math.max(i - 1, s0);
        _t.set(pts[j * 3] - pts[j2 * 3], pts[j * 3 + 1] - pts[j2 * 3 + 1], pts[j * 3 + 2] - pts[j2 * 3 + 2]);
        _c.set(cam.x - px, cam.y - py, cam.z - pz); _s.crossVectors(_t, _c); const l = _s.length(); if (l > 1e-6) _s.multiplyScalar(1 / l); else _s.set(1, 0, 0);
        const w = w0 * wid[i] * (0.8 + 0.2 * fade);
        const v = (base + i * 2) * 3, c = (base + i * 2) * 4;
        this.pos[v] = px + _s.x * w; this.pos[v + 1] = py + _s.y * w; this.pos[v + 2] = pz + _s.z * w; this.pos[v + 3] = px - _s.x * w; this.pos[v + 4] = py - _s.y * w; this.pos[v + 5] = pz - _s.z * w;
        const cr = layer === 0 ? 1.5 : 0.35, cg = layer === 0 ? 1.5 : 0.4, cb = layer === 0 ? 2.2 : 0.9, al = layer === 0 ? inten : inten * 0.3;
        this.col[c] = this.col[c + 4] = cr; this.col[c + 1] = this.col[c + 5] = cg; this.col[c + 2] = this.col[c + 6] = cb; this.col[c + 3] = this.col[c + 7] = al;
      }
    }
  }
  update(dt, camPos, now) {
    let any = false;
    for (let bi = 0; bi < POOL; bi++) {
      const b = this.bolts[bi];
      if (b.t >= b.life) { if (b.t < 90) { b.t = 99; const gl = bi * 2 * PTS * 2; this.col.fill(0, gl * 4, (gl + 2 * PTS * 2) * 4); any = true; } continue; }
      b.t += dt; this._build(bi, b, camPos, now); any = true;
    }
    if (any) { this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; }
  }
  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
