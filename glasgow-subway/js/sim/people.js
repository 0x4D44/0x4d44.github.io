// Instanced low-poly people (platform crowd, boarding/alighting streams).
import { mulberry32, clamp } from './util.js';

const PALETTE = [0x2f3b52, 0x6b2d2d, 0x2d5a3b, 0x7a6a4f, 0x1f1f24, 0x8a4f7a, 0x3d6a8a, 0xb5523b, 0x56585c, 0xc0a040, 0x2a2a5a];
const SKIN = [0xf0c8a0, 0xd9a577, 0xa8714a, 0x7a4a2e, 0xf5d3b8];

export class Crowd {
  constructor(THREE, max = 120, variants = null) {
    this.THREE = THREE; this.max = max; this.people = []; this.rng = mulberry32(99); this.variants = variants;
    const body = new THREE.CylinderGeometry(0.2, 0.25, 1.1, 8); body.translate(0, 0.75, 0);
    const head = new THREE.SphereGeometry(0.13, 8, 6); head.translate(0, 1.5, 0);
    const legs = new THREE.CylinderGeometry(0.13, 0.13, 0.25, 6); legs.translate(0, 0.12, 0);
    this.bodyMesh = new THREE.InstancedMesh(body, new THREE.MeshLambertMaterial({ color: 0xffffff }), max);
    this.headMesh = new THREE.InstancedMesh(head, new THREE.MeshLambertMaterial({ color: 0xffffff }), max);
    for (const m of [this.bodyMesh, this.headMesh]) { m.frustumCulled = false; m.count = 0; }
    this.group = new THREE.Group(); this.group.add(this.bodyMesh, this.headMesh);
    if (variants) {
      this.group.remove(this.bodyMesh, this.headMesh);
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      this.vMeshes = variants.map((g) => { const im = new THREE.InstancedMesh(g, mat, max); im.frustumCulled = false; im.count = 0; this.group.add(im); return im; });
    }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._e = new THREE.Euler();
    this._c = new THREE.Color();
  }
  clear() { this.people.length = 0; this._flush(); }
  /** idle/wandering on a rectangle (local frame) at floor height y */
  populate(n, rect, y, avoid = []) {
    for (let i = 0; i < n && this.people.length < this.max; i++) {
      let x, z, tries = 0;
      do { x = rect.x0 + this.rng() * (rect.x1 - rect.x0); z = rect.z0 + this.rng() * (rect.z1 - rect.z0); } while (tries++ < 20 && avoid.some((a) => x > a.x0 - 0.4 && x < a.x1 + 0.4 && z > a.z0 - 0.4 && z < a.z1 + 0.4));
      this.add({ x, z, y, yaw: this.rng() * 6.28, mode: this.rng() < 0.35 ? 'walk' : 'idle', rect, speed: 0.6 + this.rng() * 0.5 });
    }
  }
  add(p) {
    const r = this.rng;
    p.variant = Math.floor(r() * 5); p.body = PALETTE[Math.floor(r() * PALETTE.length)]; p.skin = SKIN[Math.floor(r() * SKIN.length)]; p.scale = 0.92 + r() * 0.16; p.phase = r() * 6.28; p.ttl = p.ttl ?? Infinity;
    this.people.push(p); this._colour(this.people.length - 1);
    return p;
  }
  _colour(i) { if (this.vMeshes) return; const p = this.people[i]; this.bodyMesh.setColorAt(i, this._c.set(p.body)); this.headMesh.setColorAt(i, this._c.set(p.skin)); if (this.bodyMesh.instanceColor) { this.bodyMesh.instanceColor.needsUpdate = true; this.headMesh.instanceColor.needsUpdate = true; } }
  /** stream of people from a to b that vanish at b (boarding) or fade after reaching (alighting) */
  stream(from, to, n, y0, y1, spread = 0.4) {
    for (let i = 0; i < n && this.people.length < this.max; i++) {
      const p = this.add({ x: from.x + (this.rng() - 0.5) * spread, z: from.z + (this.rng() - 0.5) * spread, y: y0, yaw: 0, mode: 'go', tx: to.x + (this.rng() - 0.5) * spread, tz: to.z + (this.rng() - 0.5) * spread, ty: y1, speed: 1.1 + this.rng() * 0.5, delay: i * 0.45 + this.rng() * 0.3 });
      p.hidden = true;
    }
  }
  update(dt, t, yAt) {
    for (let i = this.people.length - 1; i >= 0; i--) {
      const p = this.people[i];
      if (p.mode === 'walk') {
        if (!p.tx || Math.hypot(p.tx - p.x, p.tz - p.z) < 0.3) { p.tx = p.rect.x0 + this.rng() * (p.rect.x1 - p.rect.x0); p.tz = p.rect.z0 + this.rng() * (p.rect.z1 - p.rect.z0); }
        this._step(p, dt, p.speed * 0.7);
      } else if (p.mode === 'go') {
        if (p.delay > 0) { p.delay -= dt; continue; }
        p.hidden = false;
        const d = this._step(p, dt, p.speed);
        if (yAt) p.y = yAt(p.x, p.z, p.y);
        if (d < 0.35) { this.people.splice(i, 1); this._rebuildColours(); }
      }
    }
    this._flush(t);
  }
  _step(p, dt, sp) {
    const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz) || 1;
    const k = Math.min(d, sp * dt) / d; p.x += dx * k; p.z += dz * k; p.yaw = Math.atan2(-dx, -dz);
    return d;
  }
  _rebuildColours() { for (let i = 0; i < this.people.length; i++) this._colour(i); }
  _flush(t = 0) {
    const THREE = this.THREE;
    if (this.vMeshes) {
      const cnt = this.vMeshes.map(() => 0);
      for (const p of this.people) {
        if (p.hidden) continue;
        const vi = p.variant % this.vMeshes.length, im = this.vMeshes[vi];
        const sway = p.mode === 'idle' ? Math.sin(t * 1.3 + p.phase) * 0.03 : Math.sin(t * 7 + p.phase) * 0.04;
        this._p.set(p.x, p.y + (p.mode === 'idle' ? 0 : Math.abs(sway)), p.z);
        this._e.set(0, p.yaw + (p.mode === 'idle' ? sway * 3 : 0), 0); this._q.setFromEuler(this._e);
        this._s.set(p.scale, p.scale, p.scale); this._m.compose(this._p, this._q, this._s);
        im.setMatrixAt(cnt[vi]++, this._m);
      }
      this.vMeshes.forEach((im, i) => { im.count = cnt[i]; im.instanceMatrix.needsUpdate = true; });
      return;
    }
    let n = 0;
    for (const p of this.people) {
      if (p.hidden) continue;
      const sway = p.mode === 'idle' ? Math.sin(t * 1.3 + p.phase) * 0.03 : Math.sin(t * 7 + p.phase) * 0.04;
      this._p.set(p.x, p.y + Math.abs(sway) * (p.mode === 'idle' ? 0 : 1), p.z);
      this._e.set(0, p.yaw + (p.mode === 'idle' ? sway * 3 : 0), 0); this._q.setFromEuler(this._e);
      this._s.set(p.scale, p.scale, p.scale);
      this._m.compose(this._p, this._q, this._s);
      this.bodyMesh.setMatrixAt(n, this._m); this.headMesh.setMatrixAt(n, this._m);
      this.bodyMesh.setColorAt(n, this._c.set(p.body)); this.headMesh.setColorAt(n, this._c.set(p.skin));
      n++;
    }
    this.bodyMesh.count = this.headMesh.count = n;
    this.bodyMesh.instanceMatrix.needsUpdate = this.headMesh.instanceMatrix.needsUpdate = true;
    if (this.bodyMesh.instanceColor) { this.bodyMesh.instanceColor.needsUpdate = true; this.headMesh.instanceColor.needsUpdate = true; }
  }
}
