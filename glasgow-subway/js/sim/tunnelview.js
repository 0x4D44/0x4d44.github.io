// Tunnel: instances models/tunnel_segment.glb rings (0.62 m) along the track in a window around the train.
// Falls back to procedural rings. Rings inside station spans are hidden (the station vault replaces them).
export const RING = 0.61;
export const LAMP_EVERY = 8;
export const FAR_LEN = 2.44;

export async function loadTunnelTemplate(THREE, GLTFLoader, url) {
  try {
    const gltf = await new Promise((res, rej) => new GLTFLoader().load(url, res, undefined, rej));
    gltf.scene.updateMatrixWorld(true);
    const parts = {};
    for (const name of ['seg_plain', 'seg_lamp', 'seg_iron', 'seg_iron_lamp']) {
      const n = gltf.scene.getObjectByName(name); if (!n) continue;
      const meshes = []; n.traverse((o) => { if (o.isMesh) meshes.push(o); });
      parts[name] = meshes;
    }
    if (!parts.seg_plain) throw new Error('no seg_iron');
    return { parts, ok: true };
  } catch (e) {
    console.warn('[sim] tunnel_segment.glb unavailable, procedural rings', e && e.message);
    const geo = new THREE.CylinderGeometry(1.68, 1.68, RING, 20, 1, true); geo.rotateX(Math.PI / 2); geo.translate(0, 1.2, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0x555a60, side: THREE.BackSide });
    const m = new THREE.Mesh(geo, mat);
    return { parts: { seg_plain: [m], seg_lamp: [m] }, ok: false };
  }
}

export class TunnelView {
  constructor(THREE, tpl, scene, opts) {
    this.THREE = THREE; this.scene = scene;
    // quality tier: near rings are the detailed GLB (1054 tris each); everything beyond is a cheap low-poly tube.
    this.quality = (opts && opts.quality) || 'high';
    this.nearA = this.quality === 'low' ? 14 : 24; this.nearB = this.quality === 'low' ? 5 : 8; this.ahead = 75; this.behind = 22;
    this.cap = 90; this.capL = Math.ceil(this.cap / LAMP_EVERY) + 4;
    this.N = Math.ceil((this.nearA + this.nearB) / RING) + 4; this.NL = Math.ceil(this.N / LAMP_EVERY) + 3;
    this.group = new THREE.Group(); this.group.name = 'tunnel'; scene.add(this.group);
    this.plain = this._pool(tpl.parts.seg_plain, this.cap);
    this.lamp = this._pool(tpl.parts.seg_lamp || tpl.parts.seg_iron_lamp || tpl.parts.seg_plain, this.capL);
    this.head = -1e9; this.skip = [];
    this.lights = [];
    for (let i = 0; i < 2; i++) { const l = new THREE.PointLight(0xffc27a, 14, 16, 1.6); l.userData.lamp = -1; this.group.add(l); this.lights.push(l); }
    this._m = new THREE.Matrix4(); this._pa = {}; this._pb = {};
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this._buildFar();
    this.setWindow(this.ahead, this.behind);
  }
  _buildFar() {
    const THREE = this.THREE, L = FAR_LEN, R = 1.7, n = 14;
    const pos = [], nor = [], col = [], idx = [];
    const push = (x, y, z, nx, ny, nz, c) => { pos.push(x, y, z); nor.push(nx, ny, nz); col.push(c[0], c[1], c[2]); return pos.length / 3 - 1; };
    // tube (inner surface), axis y=1.2, along z in [-L/2, L/2]
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const c = [0.30, 0.31, 0.33];
      const v = [[Math.cos(a0) * R, 1.2 + Math.sin(a0) * R, -L / 2], [Math.cos(a1) * R, 1.2 + Math.sin(a1) * R, -L / 2], [Math.cos(a1) * R, 1.2 + Math.sin(a1) * R, L / 2], [Math.cos(a0) * R, 1.2 + Math.sin(a0) * R, L / 2]];
      const nx = -Math.cos((a0 + a1) / 2), ny = -Math.sin((a0 + a1) / 2);
      const k = v.map((q) => push(q[0], q[1], q[2], nx, ny, 0, c));
      idx.push(k[0], k[1], k[2], k[0], k[2], k[3]);
    }
    const box = (x0, y0, z0, x1, y1, z1, c) => { // top + sides only
      const q = (a, b, cc, d, nn) => { const k = [a, b, cc, d].map((p) => push(p[0], p[1], p[2], nn[0], nn[1], nn[2], c)); idx.push(k[0], k[1], k[2], k[0], k[2], k[3]); };
      q([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]);
      q([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0]);
      q([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]);
    };
    box(-1.0, -0.19, -L / 2, 1.0, -0.17, L / 2, [0.14, 0.14, 0.15]);           // slab
    box(-0.645, 0, -L / 2, -0.575, 0.12, L / 2, [0.55, 0.55, 0.58]);          // rails (inside the near rails' volume)
    box(0.575, 0, -L / 2, 0.645, 0.12, L / 2, [0.55, 0.55, 0.58]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.farCap = 70;
    this.far = new THREE.InstancedMesh(g, mat, this.farCap); this.far.frustumCulled = false; this.group.add(this.far);
    // far lamps: emissive boxes on the wall every 4 segments
    const lg = new THREE.BoxGeometry(0.12, 0.3, 0.5);
    this.farLamp = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), this.farCap); this.farLamp.frustumCulled = false; this.group.add(this.farLamp);
    this.farHead = -1e9;
  }
  _placeFar(track, j) {
    const s = j * FAR_LEN, L = track.length;
    const slot = ((j % this.farN) + this.farN) % this.farN;
    const hidden = this._skipped(s - FAR_LEN / 2, L) || this._skipped(s + FAR_LEN / 2, L);
    const a = track.pose(s + FAR_LEN / 2 - 0.05, this._pa), b = track.pose(s - FAR_LEN / 2 + 0.05, this._pb);
    const fx = a.x - b.x, fy = a.y - b.y, fz = a.z - b.z, fl = Math.hypot(fx, fy, fz) || 1;
    const f = [fx / fl, fy / fl, fz / fl];
    let rx = -f[2], rz = f[0]; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    const ux = -rz * f[1], uy = rz * f[0] - rx * f[2], uz = rx * f[1];
    const m = this._m;
    m.set(rx, ux, -f[0], (a.x + b.x) / 2, 0, uy, -f[1], (a.y + b.y) / 2, rz, uz, -f[2], (a.z + b.z) / 2, 0, 0, 0, 1);
    this.far.setMatrixAt(slot, hidden ? this.zero : m); this.far.instanceMatrix.needsUpdate = true;
    if (j % 2 === 0 && !hidden) { const t = new this.THREE.Matrix4().makeTranslation(1.45, 2.15, 0); t.premultiply(m); this.farLamp.setMatrixAt(slot, t); } else this.farLamp.setMatrixAt(slot, this.zero);
    this.farLamp.instanceMatrix.needsUpdate = true;
  }
  _pool(meshes, n) {
    const THREE = this.THREE, out = [];
    for (const m of meshes) {
      const im = new THREE.InstancedMesh(m.geometry, m.material, n);
      im.frustumCulled = false; im.count = n;
      const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      for (let i = 0; i < n; i++) im.setMatrixAt(i, zero);
      // apply the node's own transform baked into instance matrices
      m.updateMatrixWorld(true); im.userData.local = m.matrixWorld.clone();
      this.group.add(im); out.push(im);
    }
    return out;
  }
  setWindow(ahead, behind) {
    this.ahead = ahead; this.behind = behind;
    this.N = Math.min(this.cap, Math.ceil((this.nearA + this.nearB) / RING) + 4); this.NL = Math.min(this.capL, Math.ceil(this.N / LAMP_EVERY) + 3);
    this.farN = Math.min(this.farCap, Math.ceil((ahead + behind) / FAR_LEN) + 3); this.far.count = this.farLamp.count = this.farN; this.farHead = -1e9;
    for (const im of this.plain) im.count = this.N; for (const im of this.lamp) im.count = this.NL;
    this.reset();
  }
  setSkips(spans) { this.skip = spans; this.reset(); }
  reset() { this.head = -1e9; this.farHead = -1e9; }
  _skipped(s, L) {
    for (const [a, b] of this.skip) { let d = s - a; d -= Math.floor(d / L) * L; if (d <= b - a) return true; }
    return false;
  }
  _place(track, k) {
    const THREE = this.THREE, s = k * RING, L = track.length;
    const isLamp = ((k % LAMP_EVERY) + LAMP_EVERY) % LAMP_EVERY === 0;
    const slot = ((k % this.N) + this.N) % this.N;
    const hidden = this._skipped(s, L);
    const a = track.pose(s + 0.01, this._pa), b = track.pose(s - 0.01, this._pb);
    const fx = a.x - b.x, fy = a.y - b.y, fz = a.z - b.z, fl = Math.hypot(fx, fy, fz) || 1;
    const f = [fx / fl, fy / fl, fz / fl];
    let rx = -f[2], rz = f[0]; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    const ux = -rz * f[1], uy = rz * f[0] - rx * f[2], uz = rx * f[1];
    const m = this._m;
    m.set(rx, ux, -f[0], (a.x + b.x) / 2, 0, uy, -f[1], (a.y + b.y) / 2, rz, uz, -f[2], (a.z + b.z) / 2, 0, 0, 0, 1);
    const lslot = ((Math.floor(k / LAMP_EVERY) % this.NL) + this.NL) % this.NL;
    const tmp = new THREE.Matrix4();
    for (const im of this.plain) { if (hidden || isLamp) im.setMatrixAt(slot, this.zero); else { tmp.multiplyMatrices(m, im.userData.local); im.setMatrixAt(slot, tmp); } im.instanceMatrix.needsUpdate = true; }
    if (isLamp) {
      for (const im of this.lamp) { if (hidden) im.setMatrixAt(lslot, this.zero); else { tmp.multiplyMatrices(m, im.userData.local); im.setMatrixAt(lslot, tmp); } im.instanceMatrix.needsUpdate = true; }
      if (!hidden) {
        const li = Math.floor(k / LAMP_EVERY), light = this.lights[((li % 2) + 2) % 2];
        light.position.set(m.elements[12] + rx * 1.3 + 0 * ux, m.elements[13] + 2.0, m.elements[14] + rz * 1.3);
        light.userData.lamp = li;
      }
    }
  }
  update(track, s) {
    const kEnd = Math.floor((s + this.nearA) / RING), kStart = Math.floor((s - this.nearB) / RING);
    if (this.head < kStart - 5 || this.head > kEnd + 5 || this.track !== track) {
      this.track = track; this.head = kStart - 1;
      for (const im of [...this.plain, ...this.lamp]) for (let i = 0; i < im.instanceMatrix.count; i++) im.setMatrixAt(i, this.zero);
    }
    // far low-poly tube
    const jEnd = Math.floor((s + this.ahead) / FAR_LEN), jStart = Math.floor((s - this.behind) / FAR_LEN);
    if (this.farHead < jStart - 4 || this.farHead > jEnd + 4 || this.track !== track || this._farTrack !== track) {
      this._farTrack = track; this.farHead = jStart - 1;
      for (let i = 0; i < this.farCap; i++) { this.far.setMatrixAt(i, this.zero); this.farLamp.setMatrixAt(i, this.zero); }
    }
    let nf = 0; while (this.farHead < jEnd && nf++ < 200) { this.farHead++; this._placeFar(track, this.farHead); }
    let n = 0;
    while (this.head < kEnd && n++ < 400) { this.head++; this._place(track, this.head); }
    const bs = s;
    for (const l of this.lights) l.intensity = 14 * (0.93 + 0.07 * Math.sin(bs * 0.9 + l.userData.lamp * 3.1));
  }
  dispose() { this.scene.remove(this.group); }
}
