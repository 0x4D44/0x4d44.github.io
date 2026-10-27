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

// ---------------------------------------------------------------------------------------------------------------------
// Animated crowd: A3's people.glb (15 skinned characters, clips `<char>__idle|walk|phone|sit`). Each person is a SkeletonUtils clone with its own
// AnimationMixer; only people near the camera are animated (the rest hold their pose) and far ones are hidden, so cost stays bounded.
const CLIPS = ['idle', 'walk', 'phone', 'sit'];
export class AnimCrowd {
  constructor(THREE, SkeletonUtils, gltf, max = 40, quality = 'high') {
    this.THREE = THREE; this.SU = SkeletonUtils; this.max = max; this.quality = quality; this.people = []; this.rng = mulberry32(99);
    this.rAnim = quality === 'low' ? 16 : 30; this.rVis = quality === 'low' ? 42 : 80;
    this.chars = [];
    const scene = gltf.scene;
    const holder = scene.getObjectByName('people') || scene;
    for (const n of holder.children) {
      const m = /^person_(.+)$/.exec(n.name); if (!m) continue;
      const clips = {}; for (const c of CLIPS) { const a = gltf.animations.find((x) => x.name === m[1] + '__' + c); if (a) clips[c] = a; }
      if (clips.idle) this.chars.push({ id: m[1], node: n, clips, kid: /boy|girl|teen/.test(m[1]), staff: /staff/.test(m[1]) });
    }
    this.adults = this.chars.filter((c) => !c.kid && !c.staff); this.group = new THREE.Group(); this.group.name = 'crowd';
    this._v = new THREE.Vector3(); this.hasAnim = this.chars.length > 0; this._clock = 0;
  }
  clear() { for (const p of this.people) this._drop(p); this.people.length = 0; }
  _drop(p) { if (p.obj && p.obj.parent) p.obj.parent.remove(p.obj); if (p.mixer) p.mixer.stopAllAction(); p.obj = p.mixer = null; }
  _pick() {
    const r = this.rng(); let pool = this.adults;
    if (r < 0.09) pool = this.chars.filter((c) => c.kid); else if (r < 0.12) pool = this.chars.filter((c) => c.staff);
    return pool[Math.floor(this.rng() * pool.length)] || this.chars[0];
  }
  add(p, parent) {
    if (!this.hasAnim || this.people.length >= this.max) return p;
    const ch = p.char || this._pick(); p.char = ch;
    const obj = this.SU.clone(ch.node); obj.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    p.scale = (ch.kid ? 1 : 0.96 + this.rng() * 0.08); obj.scale.setScalar(p.scale);
    p.phase = this.rng() * 6; p.ttl = p.ttl ?? Infinity;
    p.mixer = new this.THREE.AnimationMixer(obj); p.act = {};
    for (const k of Object.keys(ch.clips)) { const a = p.mixer.clipAction(ch.clips[k]); a.play(); a.enabled = true; a.setEffectiveWeight(0); p.act[k] = a; }
    p.cur = null; p.parent = parent || this.group; p.obj = obj; p.parent.add(obj);
    this._setAnim(p, p.mode === 'sit' ? 'sit' : (p.mode === 'walk' || p.mode === 'go') ? 'walk' : (this.rng() < 0.3 && p.act.phone ? 'phone' : 'idle'), 0);
    if (p.act[p.cur]) p.act[p.cur].time = this.rng() * p.act[p.cur].getClip().duration;
    this.people.push(p); this._place(p);
    return p;
  }
  _setAnim(p, name, fade = 0.25) {
    if (!p.act[name]) name = 'idle'; if (p.cur === name) return;
    const n = p.act[name], o = p.cur && p.act[p.cur];
    n.setEffectiveWeight(1); if (o) { if (fade > 0) { n.reset().play(); n.crossFadeFrom(o, fade, false); } else o.setEffectiveWeight(0); }
    p.cur = name;
  }
  populate(n, rect, y, avoid = []) {
    for (let i = 0; i < n && this.people.length < this.max; i++) {
      let x, z, tries = 0;
      do { x = rect.x0 + this.rng() * (rect.x1 - rect.x0); z = rect.z0 + this.rng() * (rect.z1 - rect.z0); } while (tries++ < 20 && avoid.some((a) => x > a.x0 - 0.4 && x < a.x1 + 0.4 && z > a.z0 - 0.4 && z < a.z1 + 0.4));
      this.add({ x, z, y, yaw: this.rng() * 6.28, mode: this.rng() < 0.4 ? 'walk' : 'idle', rect, speed: 0.7 + this.rng() * 0.4, wait: 0 });
    }
  }
  stream(from, to, n, y0, y1, spread = 0.4) {
    for (let i = 0; i < n && this.people.length < this.max; i++) {
      const p = this.add({ x: from.x + (this.rng() - 0.5) * spread, z: from.z + (this.rng() - 0.5) * spread, y: y0, yaw: 0, mode: 'go', tx: to.x + (this.rng() - 0.5) * spread, tz: to.z + (this.rng() - 0.5) * spread, ty: y1, speed: 1.2 + this.rng() * 0.4, delay: i * 0.5 + this.rng() * 0.6 });
      if (p.obj) { p.hidden = true; p.obj.visible = false; }
    }
  }
  /** seated / standing passengers riding in a car: slots = [{x,y,z,yaw,mode:'sit'|'idle'}] in the parent's local frame (parent = car group) */
  seat(parent, slots) { for (const s of slots) { if (this.people.length >= this.max) break; const p = this.add({ ...s, static: true }, parent); if (p.obj && s.mode === 'sit') this._setAnim(p, 'sit', 0); } }
  setEnabled(on) { if (this.enabled === on) return; this.enabled = on; if (!on) for (const p of this.people) if (p.obj) p.obj.visible = false; }
  update(dt, t, yAt, camWorld) {
    if (this.enabled === false) return;
    const cam = camWorld || null, v = this._v; this._clock += dt;
    for (let i = this.people.length - 1; i >= 0; i--) {
      const p = this.people[i]; if (!p.obj) continue;
      if (!p.static) {
        if (p.mode === 'walk') {
          if (p.wait > 0) { p.wait -= dt; if (p.wait <= 0) { p.mode2 = 'walk'; this._setAnim(p, 'walk'); } }
          else {
            if (p.tx == null || Math.hypot(p.tx - p.x, p.tz - p.z) < 0.3) { p.tx = p.rect.x0 + this.rng() * (p.rect.x1 - p.rect.x0); p.tz = p.rect.z0 + this.rng() * (p.rect.z1 - p.rect.z0); if (this.rng() < 0.4) { p.wait = 2 + this.rng() * 6; this._setAnim(p, 'idle'); } }
            if (!(p.wait > 0)) { this._step(p, dt, p.speed * 0.8); if (p.act.walk) p.act.walk.timeScale = p.speed * 0.8 / 1.25; }
          }
        } else if (p.mode === 'go') {
          if (p.delay > 0) { p.delay -= dt; continue; }
          if (p.hidden) { p.hidden = false; p.obj.visible = true; this._setAnim(p, 'walk', 0); }
          const d = this._step(p, dt, p.speed); if (p.act.walk) p.act.walk.timeScale = p.speed / 1.25;
          if (yAt) p.y = yAt(p.x, p.z, p.y);
          if (d < 0.35) { this._drop(p); this.people.splice(i, 1); continue; }
        }
        this._place(p);
      }
      // LOD: hide far people, animate only near ones
      let dist = 0;
      if (cam) { p.obj.getWorldPosition(v); dist = v.distanceTo(cam); }
      if (!p.hidden) p.obj.visible = dist < this.rVis;
      if (dist < this.rAnim && p.obj.visible) p.mixer.update(p.static ? dt : dt);
    }
  }
  _place(p) { p.obj.position.set(p.x, p.y, p.z); p.obj.rotation.set(0, p.yaw, 0); }
  _step(p, dt, sp) {
    const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz) || 1;
    const k = Math.min(d, sp * dt) / d; p.x += dx * k; p.z += dz * k; p.yaw = Math.atan2(-dx, -dz);
    return d;
  }
}
