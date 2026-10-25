// Tunnel: instances models/tunnel_segment.glb rings (0.62 m) along the track in a window around the train.
// Falls back to procedural rings. Rings inside station spans are hidden (the station vault replaces them).
export const RING = 0.62;
export const LAMP_EVERY = 10;

export async function loadTunnelTemplate(THREE, GLTFLoader, url) {
  try {
    const gltf = await new Promise((res, rej) => new GLTFLoader().load(url, res, undefined, rej));
    const parts = {};
    for (const name of ['seg_iron', 'seg_lamp', 'seg_iron_lamp', 'seg_plain']) {
      const n = gltf.scene.getObjectByName(name); if (!n) continue;
      const meshes = []; n.traverse((o) => { if (o.isMesh) meshes.push(o); });
      parts[name] = meshes;
    }
    if (!parts.seg_iron) throw new Error('no seg_iron');
    return { parts, ok: true };
  } catch (e) {
    console.warn('[sim] tunnel_segment.glb unavailable, procedural rings', e && e.message);
    const geo = new THREE.CylinderGeometry(1.68, 1.68, RING, 20, 1, true); geo.rotateX(Math.PI / 2); geo.translate(0, 1.2, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0x555a60, side: THREE.BackSide });
    const m = new THREE.Mesh(geo, mat);
    return { parts: { seg_iron: [m], seg_lamp: [m] }, ok: false };
  }
}

export class TunnelView {
  constructor(THREE, tpl, scene) {
    this.THREE = THREE; this.scene = scene;
    this.N = 340; this.NL = Math.ceil(this.N / LAMP_EVERY) + 3;
    this.group = new THREE.Group(); this.group.name = 'tunnel'; scene.add(this.group);
    this.plain = this._pool(tpl.parts.seg_iron, this.N);
    this.lamp = this._pool(tpl.parts.seg_lamp || tpl.parts.seg_iron_lamp || tpl.parts.seg_iron, this.NL);
    this.head = -1e9; this.skip = [];
    this.lights = [];
    for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffc27a, 14, 16, 1.6); l.userData.lamp = -1; this.group.add(l); this.lights.push(l); }
    this._m = new THREE.Matrix4(); this._pa = {}; this._pb = {};
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
  }
  _pool(meshes, n) {
    const THREE = this.THREE, out = [];
    for (const m of meshes) {
      const im = new THREE.InstancedMesh(m.geometry, m.material, n);
      im.frustumCulled = false; im.count = n;
      const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      for (let i = 0; i < n; i++) im.setMatrixAt(i, zero);
      // apply the node's own transform baked into instance matrices
      im.userData.local = m.matrix.clone();
      m.updateMatrix(); im.userData.local = m.matrix.clone();
      this.group.add(im); out.push(im);
    }
    return out;
  }
  setSkips(spans) { this.skip = spans; this.reset(); }
  reset() { this.head = -1e9; }
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
        const li = Math.floor(k / LAMP_EVERY), light = this.lights[((li % 3) + 3) % 3];
        light.position.set(m.elements[12] + rx * 1.3 + 0 * ux, m.elements[13] + 2.0, m.elements[14] + rz * 1.3);
        light.userData.lamp = li;
      }
    }
  }
  update(track, s) {
    const kEnd = Math.floor((s + 125) / RING), kStart = Math.floor((s - 55) / RING);
    if (this.head < kStart - 5 || this.head > kEnd + 5 || this.track !== track) {
      this.track = track; this.head = kStart - 1;
      for (const im of [...this.plain, ...this.lamp]) for (let i = 0; i < im.count; i++) im.setMatrixAt(i, this.zero);
    }
    let n = 0;
    while (this.head < kEnd && n++ < 400) { this.head++; this._place(track, this.head); }
    const bs = s;
    for (const l of this.lights) l.intensity = 14 * (0.93 + 0.07 * Math.sin(bs * 0.9 + l.userData.lamp * 3.1));
  }
  dispose() { this.scene.remove(this.group); }
}
