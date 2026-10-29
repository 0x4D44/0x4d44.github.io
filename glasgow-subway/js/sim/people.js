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
// Animated crowd: A3's people.glb (rigged characters; clips `<char>__<clip>`; root = soles-level origin). Each person is a SkeletonUtils clone with its own
// AnimationMixer. Placement is DATA-DRIVEN: every (character, clip) is measured once with the real skinned vertices (soles, head top, hips, pelvis
// contact height) so feet land exactly on the floor / platform / bench and heads stay under the ceiling. Only people near the camera are animated.
const catOf = (n) => {   // shared A3 clip names (rev 7) -> behaviour category
  n = n.toLowerCase();
  if (/^turn_/.test(n) || /^walk_(step|fast)/.test(n)) return null;
  if (/^kid_/.test(n)) return 'fidget'; if (/^sit_phone/.test(n)) return 'sitphone'; if (/^sit_(look|cross)/.test(n)) return 'sitalt'; if (/^sit/.test(n)) return 'sit';
  if (/hold_(pole|rail)/.test(n)) return 'pole'; if (/^phone/.test(n)) return 'phone'; if (/^(wave|point)/.test(n)) return 'wave'; if (/^talk/.test(n)) return 'talk'; if (/^walk/.test(n)) return 'walk'; if (/^idle/.test(n)) return 'idle';
  return null;
};
const dflt = (a, b) => (a != null ? a : b);
export class AnimCrowd {
  constructor(THREE, SkeletonUtils, gltf, max = 40, quality = 'high', lodGltf = null) {
    this.THREE = THREE; this.SU = SkeletonUtils; this.max = max; this.quality = quality; this.people = []; this.rng = mulberry32(99);
    this.rAnim = quality === 'low' ? 16 : 30; this.rVis = quality === 'low' ? 36 : 60; this.crossfade = 0.3; this.maxHi = quality === 'low' ? 3 : 8;
    this.chars = []; this.meas = new Map();
    const scene = gltf.scene, holder = scene.getObjectByName('people') || scene;
    const meta = gltf.meta || null;   // optional models/people_meta.json: { <id>: { height } }
    const anims = gltf.animations.map((a) => new THREE.AnimationClip(a.name, a.duration, a.tracks.map((k) => { const c = k.clone(); c.name = k.name; return c; })));   // shared clips address suffixed bones (hips_5): retarget to the canonical names
    const shared = {}; for (const a of anims) { const cat = catOf(a.name.includes('__') ? a.name.split('__')[1] : a.name); if (cat) (shared[cat] = shared[cat] || []).push(a); }
    for (const n of holder.children) {
      const m = /^person_(.+)$/.exec(n.name); if (!m) continue;
      const mt = meta && meta[m[1]], kid = /boy|girl|kid|child/.test(m[1]) && !/teen/.test(m[1]);
      const pools = {}; for (const k of Object.keys(shared)) { if (k === 'fidget' && !kid) continue; pools[k] = shared[k].filter((a) => !a.name.includes('__') || a.name.startsWith(m[1] + '__')); if (!pools[k].length) delete pools[k]; }
      if (!pools.idle) continue;
      const lodNode = lodGltf ? (lodGltf.scene.getObjectByName('person_' + m[1])) : null;
      this.chars.push({ id: m[1], node: n, lodNode, outfit: (mt && mt.outfit) || 'trousers', pools, kid, small: /small/.test(m[1]), staff: /staff/.test(m[1]), elder: /elder/.test(m[1]), metaH: mt && mt.heightM, walkSpeed: (mt && mt.walkSpeedMps) || 1.3 });
    }
    // the 21 rigs share bone names; GLTFLoader suffixed the duplicates (hips_5 ...). The shared clips address the plain names -> canonicalise per clone.
    this.boneNames = new Set(); { const f = this.chars[0]; if (f) f.node.traverse((o) => { if (o.isBone) this.boneNames.add(o.name); }); }   // first rig keeps the plain names (spine_01 ... are REAL names: never strip blindly)
    this.canon = (n) => (this.boneNames.has(n) ? n : (this.boneNames.has(n.replace(/_\d+$/, '')) ? n.replace(/_\d+$/, '') : n));
    for (const a of anims) for (const k of a.tracks) { const m = /^(.*)\.(quaternion|position|scale)$/.exec(k.name); if (m) k.name = this.canon(m[1]) + '.' + m[2]; }
    for (const k of Object.keys(shared)) shared[k] = shared[k];
    this.adults = this.chars.filter((c) => !c.kid && !c.staff); this.group = new THREE.Group(); this.group.name = 'crowd';
    this._v = new THREE.Vector3(); this.hasAnim = this.chars.length > 0; this._clock = 0; this.avoid = []; this.walker = null;
  }
  _clone(ch, lod) { const o = this.SU.clone(lod && ch.lodNode ? ch.lodNode : ch.node); o.traverse((n) => { if (n.isBone) n.name = this.canon(n.name); }); return o; }
  // ------------------------------------------------------------------ measuring
  /** soles/head/hips of a character in a clip, from the real skinned vertices over the clip. Cached. */
  measure(ch, clip) {
    const key = ch.id + ':' + clip.name, hit = this.meas.get(key); if (hit) return hit;
    const THREE = this.THREE, obj = this._clone(ch), mixer = new THREE.AnimationMixer(obj); mixer.clipAction(clip).play();
    const sk = []; obj.traverse((o) => { if (o.isSkinnedMesh) sk.push(o); }); const hipsB = sk[0].skeleton.bones.find((b) => /^(pelvis|hips)$/i.test(b.name)) || sk[0].skeleton.bones[0];
    const v = new THREE.Vector3(), h = new THREE.Vector3(), N = 4, keep = []; let minY = 1e9, maxY = -1e9, hx = 0, hy = 0, hz = 0, contact = 0, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let k = 0; k < N; k++) {
      mixer.setTime((k / N) * clip.duration); obj.updateMatrixWorld(true); hipsB.getWorldPosition(h);
      let sMin = 1e9; const cv = [];
      for (const m of sk) { m.skeleton.update(); const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i += 2) { m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld); sMin = Math.min(sMin, v.y); maxY = Math.max(maxY, v.y); minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z); cv.push(v.y, v.z); if (k === 0 || k === 2) keep.push(v.x, v.y, v.z); } }
      minY = Math.min(minY, sMin); hx += h.x; hy += h.y; hz += h.z;
      // pelvis contact: lowest vertex y near the hips' z (excluding the feet region) = where a seat surface touches
      let c = 1e9; for (let i = 0; i < cv.length; i += 2) if (Math.abs(cv[i + 1] - h.z) < 0.22 && cv[i] > sMin + 0.25 && cv[i] < c) c = cv[i]; contact += c === 1e9 ? h.y - 0.1 : c;
    }
    const r = { minY, maxY, height: maxY - minY, hips: [hx / N, hy / N, hz / N], contact: Math.max(contact / N, hy / N - 0.09), verts: new Float32Array(keep), w: maxX - minX, d: maxZ - minZ, minX, maxX, minZ, maxZ };
    this.meas.set(key, r); return r;
  }
  _clip(ch, cat, rng) { const a = ch.pools[cat]; return a && a.length ? a[Math.floor((rng || this.rng)() * a.length)] : null; }
  /** every vertex of every standing clip this state can use (hand on the rail included) must clear the ceiling profile and the walls at x, with this facing */
  _fitsStandAt(ch, s) {
    if (!s.ceilAt) return true; const cats = s.mode === 'pole' ? ['pole'] : ['idle', 'phone', 'talk', 'fidget'], cs = Math.cos(s.yaw), sn = Math.sin(s.yaw);
    if (ch.metaH != null && ch.metaH > s.ceilAt(s.x) - s.y - 0.05) return false;
    for (const c of cats) for (const clip of ch.pools[c] || []) {
      const m = this.measure(ch, clip), V = m.verts;
      for (let i = 0; i < V.length; i += 3) { const x = s.x + cs * V[i] + sn * V[i + 2], y = s.y - m.minY + V[i + 1]; if (Math.abs(x) > 1.07 || y > s.ceilAt(x) - 0.035) return false; }
    }
    return true;
  }
  /** tallest posture height (m, soles = 0) over the standing clips a state can use (arm-up poses count: a hand on the rail is higher than the head) */
  standHeight(ch, state = 'stand') {
    const key = '_h_' + state; if (ch[key] != null) return ch[key];
    const cats = state === 'pole' ? ['pole'] : ['idle', 'phone', 'talk', 'fidget']; let h = 0;
    for (const c of cats) for (const clip of ch.pools[c] || []) h = Math.max(h, this.measure(ch, clip).height);
    return (ch[key] = h || ch.metaH || 1.7);
  }
  // ------------------------------------------------------------------ people
  clear() { for (const p of this.people) this._drop(p); this.people.length = 0; }
  _drop(p) { if (p.obj && p.obj.parent) p.obj.parent.remove(p.obj); if (p.mixer) p.mixer.stopAllAction(); p.obj = p.mixer = null; }
  _rawPick() {
    // mix: ~10% children, ~3% staff, ~12% skirts/dresses, ~8% kilts/Highland dress, the rest everyday trousers
    const r = this.rng(); let pool;
    const skirt = (c) => /skirt|dress|sash|highland_dress/.test(c.outfit), kilt = (c) => /kilt|highland/.test(c.outfit) && !skirt(c);
    if (r < 0.10) pool = this.chars.filter((c) => c.kid); else if (r < 0.13) pool = this.chars.filter((c) => c.staff);
    else if (r < 0.25) pool = this.chars.filter((c) => skirt(c) && !c.kid); else if (r < 0.33) pool = this.chars.filter((c) => kilt(c) && !c.kid);
    else pool = this.chars.filter((c) => !c.kid && !c.staff && !skirt(c) && !kilt(c));
    if (!pool.length) pool = this.chars; return pool[Math.floor(this.rng() * pool.length)];
  }
  _pick(filter) {
    const used = (c) => this.people.reduce((n, q) => n + (q.char === c ? 1 : 0), 0);   // spread the mix: repeats are progressively less likely
    if (!filter) { for (let i = 0; i < 6; i++) { const c = this._rawPick(); if (this.rng() < 1 / (1 + used(c))) return c; } return this._rawPick(); }
    for (let i = 0; i < 18; i++) { const c = this._rawPick(); if (this.rng() < 1 / (1 + 0.8 * used(c)) && filter(c)) return c; }
    for (let i = 0; i < 10; i++) { const c = this._rawPick(); if (filter(c)) return c; }   // sample, don't test everyone (measuring is the expensive part)
    return [...this.chars].sort((a, b) => (a.metaH || 9) - (b.metaH || 9)).find(filter) || null;   // nobody fits this spot -> leave it empty
  }
  add(p, parent, filter) {
    if (!this.hasAnim || this.people.length >= this.max) return p;
    const ch = p.char || this._pick(filter); if (!ch) return p; p.char = ch;
    const obj = this._clone(ch, !!ch.lodNode && !p.static); p.lod = !!ch.lodNode && !p.static; obj.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    p.scale = 1; p.ttl = p.ttl ?? Infinity; p.state = p.state || p.mode;
    p.mixer = new this.THREE.AnimationMixer(obj); p.act = new Map(); p.cur = null; p.yOff = null; p.nextT = 1 + this.rng() * 6;
    p.parent = parent || this.group; p.obj = obj; p.parent.add(obj);
    this._enter(p, p.state, 0);
    if (p.cur) p.cur.time = this.rng() * p.cur.getClip().duration;
    p.mixer.update(0.0001); p.dirty = false;   // pose the skeleton now (far people are frozen, never in the bind pose)
    this.people.push(p); this._place(p, true);
    return p;
  }
  /** LOD0 (people.glb) near, LOD1 (people_lod.glb, same rig/clips) beyond ~12 m: rebuild the clone and resume the same clip at the same time */
  _swapLod(p, lod) {
    const old = p.obj, par = p.parent, t = p.cur ? p.cur.time : 0, clip = p.curClip, vis = old.visible;
    par.remove(old); p.mixer.stopAllAction(); p.lod = lod; const obj = this._clone(p.char, lod); obj.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    p.obj = obj; par.add(obj); obj.visible = vis; p.mixer = new this.THREE.AnimationMixer(obj); p.act = new Map(); p.cur = null;
    if (clip) { this._play(p, clip, 0, p.cur ? 1 : (clip.name.startsWith('walk') ? (p.speed ? p.speed / p.char.walkSpeed : 1) : 1)); if (p.cur) { p.cur.time = t; } } p.mixer.update(0.0001); p.dirty = false; this._place(p, true);
  }
  _action(p, clip) { let a = p.act.get(clip.name); if (!a) { a = p.mixer.clipAction(clip); a.setEffectiveWeight(0); a.play(); p.act.set(clip.name, a); } return a; }
  _play(p, clip, fade = this.crossfade, speed = 1) {
    if (!clip) return; const n = this._action(p, clip), o = p.cur; if (o === n) { n.timeScale = speed; return; }
    n.timeScale = speed; n.enabled = true;
    if (o && fade > 0) { n.reset().setEffectiveWeight(1).play(); n.crossFadeFrom(o, fade, false); } else { if (o) o.setEffectiveWeight(0); n.setEffectiveWeight(1); }
    p.cur = n; p.curClip = clip; p.m = this.measure(p.char, clip); p.dirty = true;
  }
  /** state -> clip choice (idle variants rotate, phone/talk/pole/fidget when the asset has them) */
  _enter(p, state, fade = this.crossfade) {
    const ch = p.char, r = this.rng; p.state = state;
    let cat = 'idle';
    if (state === 'walk' || state === 'go') cat = 'walk';
    else if (state === 'sit') cat = r() < 0.4 ? (ch.pools.sitphone ? 'sitphone' : ch.pools.sitalt ? 'sitalt' : 'sit') : (ch.pools.sitalt && r() < 0.35 ? 'sitalt' : 'sit');
    else if (state === 'pole') cat = ch.pools.pole ? 'pole' : 'idle';
    else { const x = r(); cat = ch.kid && ch.pools.fidget && x < 0.45 ? 'fidget' : x < 0.3 && ch.pools.phone ? 'phone' : x < 0.5 && ch.pools.talk ? 'talk' : x < 0.54 && ch.pools.wave && !p.static ? 'wave' : 'idle'; }
    let clip = this._clip(ch, cat) || this._clip(ch, state === 'sit' ? 'sit' : 'idle') || ch.pools.idle[0];
    this._play(p, clip, fade, cat === 'walk' ? (p.speed ? p.speed / ch.walkSpeed : 1) : 0.9 + r() * 0.2);
    p.stateT = 0; p.nextT = cat === 'walk' ? 1e9 : 3 + r() * 9;
  }
  /** feet exactly on the surface (p.y): lowest sole over the clip sits on it; seated: pelvis contact on the seat top (p.seatY) */
  _yOffset(p) {
    const m = p.m; if (!m) return 0;
    if (p.state === 'sit' && p.seatY != null) return this._sitOff(m, p.seatY - p.y);
    return -m.minY;
  }
  /** pelvis on the seat top; if that would push the shoes through the floor, shoes win; if the feet would hang, sink the pelvis up to 6 cm into the cushion */
  _sitOff(m, seatRel) { const yA = seatRel - m.contact, feet = yA + m.minY; return feet < 0 ? -m.minY : yA - Math.min(feet, 0.06); }
  _place(p, snap) {
    const tgt = this._yOffset(p); p.yOff = snap || p.yOff == null ? tgt : p.yOff + (tgt - p.yOff) * 0.25;
    let x = p.x, z = p.z;
    if (p.state === 'sit' && p.m) { // hips over the seat position (not the root): root = seat - R(yaw) * hipsLocalXZ
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw), hx = p.m.hips[0], hz = p.m.hips[2]; x -= c * hx + s * hz; z -= -s * hx + c * hz;
    }
    p.obj.position.set(x, p.y + p.yOff, z); p.obj.rotation.set(0, p.yaw, 0);
  }
  /** the first-person user (crowd-group local frame): nobody spawns within 2.5 m or in the near view cone, and people step around them */
  setWalker(x, z, yaw, on = true) { this.walker = on ? { x, z, yaw } : null; }
  _nearWalker(x, z, R, cone) {
    const w = this.walker; if (!w) return false; const dx = x - w.x, dz = z - w.z, d = Math.hypot(dx, dz); if (d < R) return true;
    if (cone && d < cone) { const fx = -Math.sin(w.yaw), fz = -Math.cos(w.yaw); if ((dx * fx + dz * fz) / (d || 1) > Math.cos(1.15)) return true; }   // inside ~66 deg of the view direction
    return false;
  }
  _free(x, z, r, self) {
    if (this._nearWalker(x, z, 0.75 + r * 0.5, 0)) return false;
    for (const a of this.avoid) if (x > a.x0 - r && x < a.x1 + r && z > a.z0 - r && z < a.z1 + r) return false;
    for (const q of this.people) if (q !== self && !q.hidden && q.obj && !q.static && (q.x - x) ** 2 + (q.z - z) ** 2 < 0.45 * 0.45) return false;
    return true;
  }
  populate(n, rect, y, avoid = []) {
    this.avoid = avoid;
    for (let i = 0; i < n && this.people.length < this.max; i++) {
      let x, z, tries = 0;
      do { x = rect.x0 + this.rng() * (rect.x1 - rect.x0); z = rect.z0 + this.rng() * (rect.z1 - rect.z0); } while (tries++ < 40 && (!this._free(x, z, 0.3) || this._nearWalker(x, z, 2.5, 3.6)));
      if (tries > 40) continue;
      this.add({ x, z, y, yaw: this.rng() * 6.28, mode: this.rng() < 0.4 ? 'walk' : 'stand', rect, speed: 0.9 + this.rng() * 0.35, wait: 0 });
    }
  }
  stream(from, to, n, y0, y1, spread = 0.4) {
    for (let i = 0; i < n && this.people.length < this.max; i++) {
      const p = this.add({ x: from.x + (this.rng() - 0.5) * spread, z: from.z + (this.rng() - 0.5) * spread, y: y0, yaw: 0, mode: 'go', tx: to.x + (this.rng() - 0.5) * spread, tz: to.z + (this.rng() - 0.5) * spread, ty: y1, speed: 1.1 + this.rng() * 0.3, delay: i * 0.5 + this.rng() * 0.6 });
      if (p.obj) { p.hidden = true; p.obj.visible = false; }
    }
  }
  /** platform people walk to the train doors and wait there (queue); board() sends them in when the doors open */
  queue(n, slots) {
    const cand = this.people.filter((q) => !q.static && q.obj && q.mode !== 'go' && q.mode !== 'queue'); const used = [];
    for (const s of slots) { if (used.length >= n) break; let best = null, bd = 1e9; for (const q of cand) { if (used.includes(q)) continue; const d = Math.hypot(q.x - s.x, q.z - s.z); if (d < bd) { bd = d; best = q; } } if (!best) break;
      used.push(best); best.mode = 'queue'; best.tx = s.x; best.tz = s.z; best.qyaw = s.yaw; best.speed = Math.max(best.speed || 1, 1); best.wait = 0; this._enter(best, 'walk'); }
    return used.length;
  }
  board(door, delayStep = 0.35) { let i = 0; for (const q of this.people) if (q.mode === 'queue') { q.mode = 'go'; q.delay = i++ * delayStep + this.rng() * 0.3; q.tx = door(q).x; q.tz = door(q).z; q.speed = 1.1 + this.rng() * 0.3; q.hidden = false; this._enter(q, 'go', 0.2); } return i; }
  /** seated / standing passengers riding in a car: slots in the parent's (car group) frame: seated {x,y,z,yaw,seatY,mode:'sit'} (x,z = pelvis position),
   *  standing {x,y,z,yaw,mode:'stand'|'pole', maxH} (maxH = tallest allowed person: headroom(x) - 0.08) */
  seat(parent, slots) {
    const made = [];
    for (const s of slots) {
      if (this.people.length >= this.max) break;
      const filter = s.mode !== 'sit' && s.ceilAt ? (c) => this._fitsStandAt(c, s) : (s.mode === 'sit' ? (c) => this._canSit(c, s) : null);
      const p = this.add({ ...s, static: true }, parent, filter); if (p.obj) made.push(p);
    }
    return made;
  }
  _canSit(c, s) {   // every vertex of the seated body, in every sit clip, must stay under the ceiling profile and inside the side walls at this seat
    if (!s.ceilAt) return true; const cs = Math.cos(s.yaw), sn = Math.sin(s.yaw);
    for (const cat of ['sit', 'sitalt', 'sitphone']) for (const clip of c.pools[cat] || []) {
      const m = this.measure(c, clip), yOff = this._sitOff(m, s.seatY - s.y), V = m.verts;
      for (let i = 0; i < V.length; i += 3) { const rx = V[i] - m.hips[0], rz = V[i + 2] - m.hips[2], x = s.x + cs * rx + sn * rz, y = s.y + yOff + V[i + 1]; if (Math.abs(x) > 1.07 || y > s.ceilAt(x) - 0.035) return false; }
    }
    return !!(c.pools.sit && c.pools.sit.length);
  }
  setEnabled(on) { if (this.enabled === on) return; this.enabled = on; if (!on) for (const p of this.people) if (p.obj) p.obj.visible = false; }
  update(dt, t, yAt, camWorld) {
    if (this.enabled === false) return;
    const cam = camWorld || null, v = this._v; this._clock += dt; let swaps = 0;
    // LOD0 (~9.5k tris) only for the nearest few people within ~11 m; everyone else uses the ~2.2k-tri LOD1 model
    let hiSet = null; if (cam) { const arr = []; for (const q of this.people) { if (!q.obj || q.hidden) continue; q.obj.getWorldPosition(v); arr.push([v.distanceTo(cam) - (q.lod ? 0 : 2), q]); } arr.sort((a, b) => a[0] - b[0]); hiSet = new Set(); for (const [d, q] of arr) { if (hiSet.size >= this.maxHi || d > 11) break; hiSet.add(q); } }
    for (let i = this.people.length - 1; i >= 0; i--) {
      const p = this.people[i]; if (!p.obj) continue;
      p.stateT += dt;
      if (!p.static) {
        if (p.mode === 'walk') {
          if (p.wait > 0) { p.wait -= dt; if (p.wait <= 0) this._enter(p, 'walk'); }
          else {
            if (p.tx == null || Math.hypot(p.tx - p.x, p.tz - p.z) < 0.3) {
              let tx, tz, k = 0; do { tx = p.rect.x0 + this.rng() * (p.rect.x1 - p.rect.x0); tz = p.rect.z0 + this.rng() * (p.rect.z1 - p.rect.z0); } while (k++ < 12 && !this._free(tx, tz, 0.3, p));
              p.tx = tx; p.tz = tz; if (this.rng() < 0.45) { p.wait = 2 + this.rng() * 7; this._enter(p, 'stand'); }
            }
            if (!(p.wait > 0)) { if (!this._step(p, dt, p.speed * 0.85)) { p.tx = null; p.wait = 0.5 + this.rng(); this._enter(p, 'stand'); } }
          }
        } else if (p.mode === 'queue') {
          if (Math.hypot(p.tx - p.x, p.tz - p.z) > 0.12) { if (!this._step(p, dt, p.speed * 0.9)) { p.x += (this.rng() - 0.5) * 0.1; p.z += (this.rng() - 0.5) * 0.1; } }
          else if (p.state === 'walk') { p.yaw = p.qyaw; this._enter(p, 'stand'); }
        } else if (p.mode === 'go') {
          if (p.delay > 0) { p.delay -= dt; continue; }
          if (p.hidden) { p.hidden = false; p.obj.visible = true; this._enter(p, 'go', 0); }
          const d = this._step(p, dt, p.speed, true); if (yAt) p.y = yAt(p.x, p.z, p.y);
          if (Math.hypot(p.tx - p.x, p.tz - p.z) < 0.35) { this._drop(p); this.people.splice(i, 1); continue; }
        }
      }
      // soft avoidance: step away from the user's body instead of standing in their face
      if (!p.static && this.walker && p.mode !== 'go') { const dx = p.x - this.walker.x, dz = p.z - this.walker.z, d = Math.hypot(dx, dz); if (d < 1.25 && d > 1e-4) { const k = Math.min(1.25 - d, 1.4 * dt); p.x += (dx / d) * k; p.z += (dz / d) * k; if (p.rect) { p.x = Math.min(p.rect.x1, Math.max(p.rect.x0, p.x)); p.z = Math.min(p.rect.z1, Math.max(p.rect.z0, p.z)); } } }
      // idle-variant rotation (phone / talk / look / fidget ...)
      if (p.state !== 'walk' && p.state !== 'go' && p.stateT > p.nextT && p.obj.visible) this._enter(p, p.state);
      this._place(p, false);
      let dist = 0; if (cam) { p.obj.getWorldPosition(v); dist = v.distanceTo(cam); }
      if (cam && hiSet && p.char.lodNode && swaps < 2 && !p.hidden) { const wantLod = !hiSet.has(p); if (wantLod !== !!p.lod) { this._swapLod(p, wantLod); swaps++; } }
      if (!p.hidden) p.obj.visible = dist < this.rVis;
      if (dist < this.rAnim && p.obj.visible) { p.mixer.update(dt); p.dirty = false; } else if (p.dirty) { p.mixer.update(this.crossfade + 0.05); p.dirty = false; }
    }
  }
  _step(p, dt, sp, ghost) {
    const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz) || 1, k = Math.min(d, sp * dt) / d, nx = p.x + dx * k, nz = p.z + dz * k;
    if (!ghost && !this._free(nx, nz, 0.22, p)) return false;   // would walk into furniture / another person
    p.x = nx; p.z = nz; p.yaw = Math.atan2(-dx, -dz); return true;
  }
  // ------------------------------------------------------------------ audit (regression tests)
  /** Real skinned-vertex metrics of every person, in the frame of `refMatrixInv` (default: the person's parent). Returns {id,state,foot,head,x,z,verts:[[x,y,z]...]} */
  bodyOf(p, inv) {
    const THREE = this.THREE, v = new THREE.Vector3(), pts = []; p.obj.updateMatrixWorld(true);
    const m0 = inv || (p.parent ? new THREE.Matrix4().copy(p.parent.matrixWorld).invert() : new THREE.Matrix4());
    p.obj.traverse((o) => { if (o.isSkinnedMesh) { o.skeleton.update(); const pos = o.geometry.attributes.position; for (let i = 0; i < pos.count; i += 2) { o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld).applyMatrix4(m0); pts.push(v.x, v.y, v.z); } } });
    let foot = 1e9, head = -1e9; for (let i = 1; i < pts.length; i += 3) { foot = Math.min(foot, pts[i]); head = Math.max(head, pts[i]); }
    return { id: p.char.id, state: p.state, mode: p.mode, foot, head, pts };
  }
}
