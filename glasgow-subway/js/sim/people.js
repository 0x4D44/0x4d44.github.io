// Instanced low-poly people (platform crowd, boarding/alighting streams).
import { mulberry32, clamp } from './util.js';
import { fitHair, fitLegs, legFit, trimUnderSkirt, trimWebbing, countWebbing, fitShoes, armRig, armAxes, armClip, armProbe } from './bodyfit.js';
import { ARM_OUT, ARM_DROP } from './armfit.js';
import * as G from './gait.js';
import { readBody, GaitRig } from './gait_three.js';
import { STEER, angDiff, arrived, steerStep, turnToward } from './steer.js';
import { HoldRig } from './hold_three.js';
import { VARIANTS as PHONE_VARIANTS } from './phone.js';
// ?gait=clip: the captured clip walk the game had before the procedural gait (to compare, and the baseline of research/people-motion-rubric.md)
const CLIP_WALK = typeof location !== 'undefined' && /[?&]gait=clip(&|$)/.test(location.search || '');
// ?phones=0: nobody uses a mobile phone (to compare; the walking metrics of research/people-motion-rubric.md are measured without them)
const NO_PHONES = typeof location !== 'undefined' && /[?&]phones=0(&|$)/.test(location.search || '');
const HOLD_IN = 0.55, HOLD_OUT = 0.5;   // s: the arms come up to the phone over HOLD_IN, and go back down over HOLD_OUT
const PHONE_USE = 0.25, PHONE_CALL = 0.28;   // the share of a standing grown-up's idle bouts spent on a phone, and of those the share that are a call (the rest are typing / reading)
const GAIT_IN = 0.2, GAIT_OUT = 0.35, GAIT_TAIL = 0.6;   // s: the gait is blended in over GAIT_IN, its upper body held GAIT_TAIL after the person stops (the last foot lands, the arms settle), then blended out over GAIT_OUT; the legs stay on the gait for good (feet that stay where they were planted)

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
  /** (the animated crowd clamps stream endpoints onto the platform slab; this plain fallback has no floor model) */
  _toFloor(x, z) { return { x, z }; }
  /** stream of people from a to b that vanish at b (boarding) or fade after reaching (alighting) */
  stream(from, to, n, y0, y1, spread = 0.4, delay0 = 0) {
    for (let i = 0; i < n && this.people.length < this.max; i++) {
      const f0 = this._toFloor(from.x + (this.rng() - 0.5) * spread, from.z + (this.rng() - 0.5) * spread), f1 = this._toFloor(to.x + (this.rng() - 0.5) * spread, to.z + (this.rng() - 0.5) * spread);
      const p = this.add({ x: f0.x, z: f0.z, y: y0, yaw: 0, mode: 'go', tx: f1.x, tz: f1.z, ty: y1, speed: 1.1 + this.rng() * 0.5, delay: delay0 + i * 0.45 + this.rng() * 0.3 });
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
const SIDESTEPS = [0, 0.55, -0.55, 1.1, -1.1];   // headings tried (rad off the straight line to the goal): straight on, then veering to the person's preferred side first. Never backwards - a person who can only retreat is boxed in and stops
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
    for (const c of this.chars) if (/kilt|skirt|highland/.test(c.outfit) && !/trews/.test(c.outfit)) { this._extendHem(c.node); if (c.lodNode) this._extendHem(c.lodNode); }
    this.fit = {};   // body-fitting stats per character (bodyfit.js), for the tests
    for (const c of this.chars) {
      const h = fitHair(THREE, c.node), hl = c.lodNode ? fitHair(THREE, c.lodNode) : null, skirted = /kilt|skirt|highland|dress/.test(c.outfit) && !/trews/.test(c.outfit);
      // skirts held off the thighs (shader patch + slimmed thigh skin). The lower level of detail (all but the 8 nearest people) has cloth made of far bigger flat faces, so its hidden skin gives way more.
      const legs = skirted ? fitLegs(THREE, c.node) : null, legsLod = skirted && c.lodNode ? fitLegs(THREE, c.lodNode, { radii: legs && legs.radii, slim: 0.055, slimCap: 0.55, slimRamp: 0.2 }) : null;
      const trim = skirted ? trimUnderSkirt(THREE, c.node) : null, trimLod = skirted && c.lodNode ? trimUnderSkirt(THREE, c.lodNode) : null;   // tops: nothing drawn under the skirt's waist edge
      const web = trimWebbing(THREE, c.node), webLod = c.lodNode ? trimWebbing(THREE, c.lodNode) : null;   // the simplified body has a few triangles joining a hand to a thigh
      const shoes = fitShoes(THREE, c.node);   // a stiff shoe that bends at the ball of the foot (the full-detail model only: the simplified one's few big faces gain nothing from it, and it is seen from beyond ~11 m)
      this.fit[c.id] = { hair: h, hairLod: hl, legs, legsLod, trim, trimLod, web, webLod, shoes };
    }
    // the 21 rigs share bone names; GLTFLoader suffixed the duplicates (hips_5 ...). The shared clips address the plain names -> canonicalise per clone.
    this.boneNames = new Set(); { const f = this.chars[0]; if (f) f.node.traverse((o) => { if (o.isBone) this.boneNames.add(o.name); }); }   // first rig keeps the plain names (spine_01 ... are REAL names: never strip blindly)
    this.canon = (n) => (this.boneNames.has(n) ? n : (this.boneNames.has(n.replace(/_\d+$/, '')) ? n.replace(/_\d+$/, '') : n));
    for (const a of anims) for (const k of a.tracks) { const m = /^(.*)\.(quaternion|position|scale)$/.exec(k.name); if (m) k.name = this.canon(m[1]) + '.' + m[2]; }
    for (const k of Object.keys(shared)) shared[k] = shared[k];
    // arms turned out of the hips, skirts and coats (bodyfit.js: armClip; the angles come from armfit.js, solved offline by tools/armfit.mjs): each character gets its own copies
    // of the arm clips with the upper-arm keys turned a few degrees outwards. The shared originals stay in pools0 for the solver and the tests. A clip that no turn
    // can clear (hands clasped behind the back, inside the pelvis: ARM_DROP) is simply not played, so long as the pool keeps another.
    this.armRigs = {}; this.armFit = {};
    for (const c of this.chars) {
      const rig = armRig(THREE, c.node), tab = ARM_OUT[c.id], drop = ARM_DROP[c.id] || []; let n = 0; this.armRigs[c.id] = rig;
      c.pools0 = {}; for (const cat of Object.keys(c.pools)) c.pools0[cat] = c.pools[cat].slice();
      if (rig && tab) for (const cat of Object.keys(c.pools)) c.pools[cat] = c.pools[cat].map((clip) => {
        const d = tab[clip.name.split('__').pop()]; if (!d) return clip;
        const nc = armClip(THREE, clip, armAxes(THREE, rig, clip), d[0], d[1]); if (nc !== clip) n++; return nc;
      });
      for (const cat of Object.keys(c.pools)) { const keep = c.pools[cat].filter((clip) => !drop.includes(clip.name.split('__').pop())); if (keep.length) c.pools[cat] = keep; }
      this.armFit[c.id] = n;
    }
    this.adults = this.chars.filter((c) => !c.kid && !c.staff); this.group = new THREE.Group(); this.group.name = 'crowd';
    this._v = new THREE.Vector3(); this.hasAnim = this.chars.length > 0; this._clock = 0; this.avoid = []; this.walker = null; this.gaitOn = !CLIP_WALK; this._gcount = {}; this.phones = !NO_PHONES; this.prng = mulberry32(0x70e5);   // phones have their own random stream: switching them off changes nothing else
    this.reserve = Math.min(10, Math.floor(max * 0.3));   // places kept free for passengers streaming on / off (a full platform must not starve the train doors)
  }
  /** The baked tops (sweater / jacket / camisole) end above the waist and the skin under them is deleted, so with a separate kilt/skirt there is a see-through
   *  band at the midriff. Find the top's centred lower hem loop and extrude it straight down (same skin weights) so it tucks inside the skirt. Patches the shared geometry once. */
  _extendHem(root, drop = 0.13) {
    const THREE = this.THREE;
    root.traverse((o) => {
      if (!o.isSkinnedMesh || !o.material || !/sweater|jacket|camisole|shirt-knit/i.test(o.material.name || '')) return;
      const g = o.geometry; if (g.userData.hemExt) return; g.userData.hemExt = true;
      const P = g.attributes.position, idx = g.index; if (!idx) return;
      const key = (i) => Math.round(P.getX(i) * 2e3) + ',' + Math.round(P.getY(i) * 2e3) + ',' + Math.round(P.getZ(i) * 2e3);
      const canon = new Map(), cid = new Int32Array(P.count); for (let i = 0; i < P.count; i++) { const k = key(i); let c = canon.get(k); if (c == null) { c = i; canon.set(k, c); } cid[i] = c; }
      const ec = new Map(), dir = new Map();   // undirected edge use count, and its directed original
      for (let t = 0; t < idx.count; t += 3) for (let e = 0; e < 3; e++) { const a = cid[idx.getX(t + e)], b = cid[idx.getX(t + (e + 1) % 3)]; if (a === b) continue; const k = a < b ? a + '_' + b : b + '_' + a; ec.set(k, (ec.get(k) || 0) + 1); dir.set(k, [a, b]); }
      const adj = new Map(), edges = []; for (const [k, n] of ec) if (n === 1) { const [a, b] = dir.get(k); edges.push([a, b]); (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
      // connected loops of boundary vertices; the torso hem = the loop that encloses x = 0 (and z centre) with the lowest mean y
      const seen = new Set(), loops = []; for (const v of adj.keys()) { if (seen.has(v)) continue; const comp = [], st = [v]; seen.add(v); while (st.length) { const u = st.pop(); comp.push(u); for (const w of adj.get(u)) if (!seen.has(w)) { seen.add(w); st.push(w); } } loops.push(comp); }
      let best = null, bestY = 1e9;
      for (const L of loops) { let x0 = 1e9, x1 = -1e9, y = 0; for (const v of L) { x0 = Math.min(x0, P.getX(v)); x1 = Math.max(x1, P.getX(v)); y += P.getY(v); } y /= L.length; if (x0 < -0.05 && x1 > 0.05 && L.length > 8 && y < bestY) { bestY = y; best = new Set(L); } }
      if (!best) return;
      const nv = new Map(), attrs = Object.keys(g.attributes), n0 = P.count; let add = 0;
      for (const v of best) nv.set(v, n0 + add++);
      for (const name of attrs) {   // glTF attributes can be interleaved (array is the shared buffer): read through stride/offset, write a plain packed copy
        const A = g.attributes[name], it = A.itemSize, stride = A.isInterleavedBufferAttribute ? A.data.stride : it, off = A.isInterleavedBufferAttribute ? A.offset : 0, src = A.isInterleavedBufferAttribute ? A.data.array : A.array;
        const arr = new src.constructor((n0 + add) * it); for (let i = 0; i < n0; i++) for (let c = 0; c < it; c++) arr[i * it + c] = src[i * stride + off + c];
        for (const [v, w] of nv) { for (let c = 0; c < it; c++) arr[w * it + c] = src[v * stride + off + c]; if (name === 'position') arr[w * 3 + 1] -= drop; }
        g.setAttribute(name, new THREE.BufferAttribute(arr, it, A.normalized));
      }
      const tri = []; for (const [a, b] of edges) if (best.has(a) && best.has(b)) { const a2 = nv.get(a), b2 = nv.get(b); tri.push(b, a, a2, b, a2, b2); }
      const ni = new Uint32Array(idx.count + tri.length); for (let i = 0; i < idx.count; i++) ni[i] = idx.getX(i); ni.set(tri, idx.count); g.setIndex(new THREE.BufferAttribute(ni, 1));
    });
  }
  /** strength of the skirt-off-the-legs push (1 = on, the default; 0 = off, for before / after comparisons) */
  setLegFit(k) { legFit.k.value = k; }
  /** triangles still joining a hand to a leg anywhere in the character templates (0 once bodyfit's trimWebbing has run), for the tests */
  webbing() { let n = 0; for (const c of this.chars) for (const r of [c.node, c.lodNode]) if (r) r.traverse((m) => { if (m.isSkinnedMesh) n += countWebbing(m); }); return n; }
  /** the arm-fit pieces for the tests and tools/armfit.mjs: rigs, the axes that turn a clip's arms out, the baker, and a probe (armProbe) over a fresh clone */
  armKit() {
    const T = this.THREE;
    return { rigs: this.armRigs, probe: (ch, lod) => armProbe(T, this._clone(ch, lod)), axes: (ch, clip) => armAxes(T, this.armRigs[ch.id], clip), bake: (clip, axes, l, r) => armClip(T, clip, axes, l, r) };
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
  _drop(p) { if (p.obj && p.obj.parent) p.obj.parent.remove(p.obj); if (p.mixer) p.mixer.stopAllAction(); p.obj = p.mixer = null; p.gait = null; p.hold = null; }
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
    p.scale = 1; p.ttl = p.ttl ?? Infinity; p.state = p.state || p.mode; if (p.yawT == null) p.yawT = p.yaw; p.sp = p.sp || 0; p.yw = 0;
    p.mixer = new this.THREE.AnimationMixer(obj); p.act = new Map(); p.cur = null; p.yOff = null; p.nextT = 1 + this.rng() * 6;
    p.parent = parent || this.group; p.obj = obj; p.parent.add(obj);
    this._enter(p, p.state, 0);
    if (p.cur) p.cur.time = this.rng() * p.cur.getClip().duration;
    p.mixer.update(0.0001); p.dirty = false;   // pose the skeleton now (far people are frozen, never in the bind pose)
    if (p.hold) this._holdStep(p, 0, true);
    this.people.push(p); this._place(p, true);
    return p;
  }
  /** LOD0 (people.glb) near, LOD1 (people_lod.glb, same rig/clips) beyond ~12 m: rebuild the clone and resume the same clip at the same time */
  _swapLod(p, lod) {
    const old = p.obj, par = p.parent, t = p.cur ? p.cur.time : 0, clip = p.curClip, vis = old.visible;
    par.remove(old); p.mixer.stopAllAction(); p.lod = lod; const obj = this._clone(p.char, lod); obj.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    p.obj = obj; par.add(obj); obj.visible = vis; p.mixer = new this.THREE.AnimationMixer(obj); p.act = new Map(); p.cur = null; if (p.gait) { p.gait.rig = null; const gb = this._gaitBody(p.char, lod); if (gb) { p.gait.gb = gb; p.gait.g.body = gb.body; } }   // the gait lives on, on the new skeleton
    if (clip) { this._play(p, clip, 0, p.cur ? 1 : (clip.name.startsWith('walk') ? (p.speed ? p.speed / p.char.walkSpeed : 1) : 1)); if (p.cur) { p.cur.time = t; } } p.mixer.update(0.0001); p.dirty = false; if (p.hold) { p.hold.rig = null; this._holdStep(p, 0, true); } this._place(p, true);
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
    else if (state === 'sit') { const sp = ch.pools.sitphone && !(this.phones && (ch.kid || ch.staff)); cat = r() < 0.4 ? (sp ? 'sitphone' : ch.pools.sitalt ? 'sitalt' : 'sit') : (ch.pools.sitalt && r() < 0.35 ? 'sitalt' : 'sit'); }   // (children and staff have no phone to hold, so they do not take the pose of holding one)
    else if (state === 'pole') cat = ch.pools.pole ? 'pole' : 'idle';
    else { const x = r(); cat = ch.kid && ch.pools.fidget && x < 0.45 ? 'fidget' : 'idle'; }   // idle poses, or a phone (below): talk/wave/point read as flailing arms
    let clip = (cat === 'walk' && this.gaitOn && this._plainWalk(ch)) || this._clip(ch, cat) || this._clip(ch, state === 'sit' ? 'sit' : 'idle') || ch.pools.idle[0];
    const use = this.phones ? this._phoneUse(p, state, cat) : null;   // who is on a phone: it takes the body of the stock phone clip (head down, or to the ear) and the arms of hold_three.js
    if (use && use.clip) clip = use.clip;
    if (!use && p.hold && p.hold.w > 0 && fade > 0) fade = Math.max(fade, HOLD_OUT + 0.1);   // the phone goes away: the clip's own arms (up by the face, in the stock phone clips) must not drop faster than the hold lets go of them
    this._play(p, clip, fade, cat === 'walk' ? (p.speed ? p.speed / ch.walkSpeed : 1) : 0.9 + r() * 0.2);
    p.stateT = 0; p.nextT = cat === 'walk' ? 1e9 : 3 + r() * 9; if (use) p.nextT = use.dur;
    this._holdTo(p, use);
  }
  // ------------------------------------------------------------------ phones (hold.js: the maths, hold_three.js: the skeleton, phone.js: the phone)
  /** Does this person spend this bout on a phone? Seated: the stock sit_phone clip (cat 'sitphone', already chosen) with a phone in the hands. Standing grown-ups: PHONE_USE of the idle bouts,
   *  a call PHONE_CALL of those, otherwise typing / reading. Walking, riding a pole and children (their arms and eye-lines are not the adults') do not. null, or { kind, clip, dur }. */
  _phoneUse(p, state, cat) {
    const ch = p.char, pr = this.prng;
    if (state === 'sit') return cat === 'sitphone' && !ch.kid && !ch.staff ? { kind: 'sit', clip: null, dur: 8 + pr() * 14 } : null;
    if (state !== 'stand' || cat !== 'idle' || ch.kid || ch.staff || !ch.pools.phone || pr() >= PHONE_USE) return null;
    const call = pr() < PHONE_CALL, want = call ? /phone_call$/ : /phone_stand$/, find = (a) => a && a.find((c) => want.test(c.name));
    const clip = find(ch.pools.phone) || find(ch.pools0 && ch.pools0.phone); if (!clip) return null;
    return { kind: call ? 'call' : 'text', clip, dur: 8 + pr() * 14 };
  }
  /** start, change or end a person's phone bout (the arms are blended in and out by _holdStep; a change of kind lowers the arms first) */
  _holdTo(p, use) {
    let h = p.hold;
    if (!use) { if (h) { h.target = 0; h.next = null; } return; }
    if (!h) h = p.hold = { kind: use.kind, w: 0, target: 1, next: null, rig: null, variant: Math.floor(this.prng() * PHONE_VARIANTS), cap: false };
    else if (h.kind === use.kind || h.w <= 0.02) { h.kind = use.kind; h.target = 1; h.next = null; } else { h.next = use.kind; h.target = 0; return; }
    // the phone is coming out: take the arms as they are NOW, before the animation starts blending in the stock phone clip, so that the first frame of that blend (which swings the hands a tenth
    // of the way to the face) is not shown either: the arms rise from this pose
    if (h.w <= 0.02 && !h.dead && p.obj) {
      if (!h.rig || h.rig.obj !== p.obj) { h.rig = new HoldRig(this.THREE, p.obj, h.variant); if (!h.rig.ok) { h.dead = true; return; } }
      h.rig.capture(); h.cap = true;
    }
  }
  /** One frame of the hold, after the mixer and the gait: ramp its weight, and lay the arms over the pose. snap = the person is not being animated (far, or a one-off pose): no ramp, the weight is the target. */
  _holdStep(p, dt, snap) {
    const h = p.hold; if (!h || h.dead) return; const w0 = h.w;
    h.w = snap ? h.target : h.target > h.w ? Math.min(h.target, h.w + dt / HOLD_IN) : Math.max(h.target, h.w - dt / HOLD_OUT);
    if (h.w <= 0 && h.next) { h.kind = h.next; h.next = null; h.target = 1; if (snap) h.w = 1; }
    if (h.w <= 0) { if (h.rig) h.rig.hide(); return; }
    if (!h.rig || h.rig.obj !== p.obj) { h.rig = new HoldRig(this.THREE, p.obj, h.variant); if (!h.rig.ok) { h.dead = true; return; } }
    if (w0 <= 0) { if (h.cap) h.cap = false; else h.rig.capture(); }   // the arms rise from the pose they were in when the phone came out (taken in _holdTo), not from the stock phone clip's (which swings the hands to the face on its own, fast)
    h.rig.apply(h.kind, h.w * h.w * (3 - 2 * h.w), h.target > 0);   // eased
  }
  /** phones on or off (off: whoever holds one lets go) */
  setPhones(on) { this.phones = !!on; if (!on) for (const p of this.people) if (p.hold) { p.hold.target = 0; p.hold.next = null; p.dirty = true; } }   // (dirty: someone far away, who is not being animated, lets go on the next frame too)
  /** feet exactly on the surface (p.y): lowest sole over the clip sits on it; seated: pelvis contact on the seat top (p.seatY) */
  _yOffset(p) {
    const m = p.m; if (!m) return 0;
    if (p.state === 'sit' && p.seatY != null) return this._sitOff(m, p.seatY - p.y);
    const gs = p.gait; if (gs && gs.wL > 0) return -m.minY * (1 - gs.wL) - gs.gb.sole * gs.wL;   // under the gait the soles are where the gait puts them (the body is NOT lifted to hide a captured stride's feet)
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
    if (!this._onFloor(x, z)) return false;
    if (this._nearWalker(x, z, 0.75 + r * 0.5, 0)) return false;
    for (const a of this.avoid) if (x > a.x0 - r && x < a.x1 + r && z > a.z0 - r && z < a.z1 + r) return false;
    for (const q of this.people) if (q !== self && !q.hidden && q.obj && !q.static && (q.x - x) ** 2 + (q.z - z) ** 2 < 0.45 * 0.45) return false;
    return true;
  }
  // ------------------------------------------------------------------ colliders
  /** The station's floor footprint: people may only stand on the platform slabs (never over the tracks / bore / hall walls) and never inside obstacles. */
  setWorld(zones, obstacles) { this.floor = (zones || []).filter((z) => z.name === 'platform'); this.solid = obstacles || []; }
  _onFloor(x, z, m = 0.22) {
    const F = this.floor; if (!F || !F.length) return true;
    let ok = false; for (const f of F) if (x >= f.x0 + m && x <= f.x1 - m && z >= f.z0 + m && z <= f.z1 - m) { ok = true; break; }
    if (!ok) return false;
    for (const o of this.solid || []) { const cx = Math.min(o.x1, Math.max(o.x0, x)), cz = Math.min(o.z1, Math.max(o.z0, z)); if ((x - cx) ** 2 + (z - cz) ** 2 < 0.25 * 0.25) return false; }
    return true;
  }
  /** nearest point on the platform slab (inset by m): where a streaming passenger heads for when its real destination (stairs, train door) is off the slab */
  _toFloor(x, z, m = 0.3) {
    const F = this.floor; if (!F || !F.length) return { x, z };
    let best = null, bd = 1e9;
    for (const f of F) { const cx = Math.min(f.x1 - m, Math.max(f.x0 + m, x)), cz = Math.min(f.z1 - m, Math.max(f.z0 + m, z)), d = (cx - x) ** 2 + (cz - z) ** 2; if (d < bd) { bd = d; best = { x: cx, z: cz }; } }
    return best;
  }
  /** Safety net only - steering (`_step`) keeps people apart. Bodies that genuinely overlap are eased apart slowly and in small amounts. R is below the 0.45 m
   *  clearance the steering keeps, so the two never fight, and the push is capped so nobody is ever visibly shoved or made to glide. */
  _separate(dt) {
    const P = this.people, R = 0.38, k = Math.min(1, dt * 8), cap = 0.45 * dt;
    for (let i = 0; i < P.length; i++) {
      const a = P[i]; if (a.static || a.hidden || !a.obj || (a.delay > 0)) continue;
      for (let j = i + 1; j < P.length; j++) {
        const b = P[j]; if (b.static || b.hidden || !b.obj || (b.delay > 0)) continue;
        let dx = b.x - a.x, dz = b.z - a.z; const d2 = dx * dx + dz * dz; if (d2 >= R * R) continue;
        let d = Math.sqrt(d2); if (d < 1e-4) { dx = Math.cos(i * 2.4); dz = Math.sin(i * 2.4); d = 1; }
        const push = Math.min((R - d) * 0.5 * k, cap), ux = dx / d * push, uz = dz / d * push;
        if (this._onFloor(a.x - ux, a.z - uz, 0.12)) { a.x -= ux; a.z -= uz; }
        if (this._onFloor(b.x + ux, b.z + uz, 0.12)) { b.x += ux; b.z += uz; }
      }
    }
  }
  populate(n, rect, y, avoid = []) {
    this.avoid = avoid;
    for (let i = 0; i < n && this.people.length < this.max - this.reserve; i++) {
      let x, z, tries = 0;
      do { x = rect.x0 + this.rng() * (rect.x1 - rect.x0); z = rect.z0 + this.rng() * (rect.z1 - rect.z0); } while (tries++ < 40 && (!this._free(x, z, 0.3) || this._nearWalker(x, z, 2.5, 3.6)));
      if (tries > 40) continue;
      this.add({ x, z, y, yaw: this.rng() * 6.28, mode: this.rng() < 0.4 ? 'walk' : 'stand', rect, speed: 0.9 + this.rng() * 0.35, wait: 0 });
    }
  }
  /** Passengers who step off a train / come down the stairs and vanish at the far end. Both ends are clamped onto the platform slab (the stairs and the train are
   *  off it), and `delay0 + i * 0.5` staggers the batch so it never appears stacked on one spot. */
  stream(from, to, n, y0, y1, spread = 0.4, delay0 = 0) {
    for (let i = 0; i < n && this.people.length < this.max; i++) {
      const f0 = this._toFloor(from.x + (this.rng() - 0.5) * spread, from.z + (this.rng() - 0.5) * spread), f1 = this._toFloor(to.x + (this.rng() - 0.5) * spread, to.z + (this.rng() - 0.5) * spread);
      const p = this.add({ x: f0.x, z: f0.z, y: y0, yaw: Math.atan2(-(f1.x - f0.x), -(f1.z - f0.z)), mode: 'go', tx: f1.x, tz: f1.z, ty: y1, speed: 1.1 + this.rng() * 0.3, delay: delay0 + i * 0.5 + this.rng() * 0.6 });
      if (p.obj) { p.hidden = true; p.obj.visible = false; }
    }
  }
  /** platform people walk to the train doors and wait there (queue); board() sends them in when the doors open */
  queue(n, slots) {
    const cand = this.people.filter((q) => !q.static && q.obj && q.mode !== 'go' && q.mode !== 'queue'); const used = [];
    for (const s of slots) { if (used.length >= n) break; let best = null, bd = 1e9; for (const q of cand) { if (used.includes(q)) continue; const d = Math.hypot(q.x - s.x, q.z - s.z); if (d < bd) { bd = d; best = q; } } if (!best) break;
      const f = this._toFloor(s.x, s.z, 0.3);
      used.push(best); best.revert = null; best.mode = 'queue'; best.tx = f.x; best.tz = f.z; best.qyaw = s.yaw; best.slot = { x: f.x, z: f.z, yaw: s.yaw }; best.speed = Math.max(best.speed || 1, 1); best.wait = 0; best.blockT = 0; best.bestD = 1e9; best.stuckT = 0; this._enter(best, 'walk'); }
    return used.length;
  }
  /** the doors are open: everyone in the queue steps in, one after another (they keep idling in the line until their turn, then walk) */
  board(door, delayStep = 0.35) {
    let i = 0;
    for (const q of this.people) if (q.mode === 'queue') {
      q.mode = 'go'; q.revert = null; q.delay = i++ * delayStep + this.rng() * 0.3; { const d = this._toFloor(door(q).x, door(q).z, 0.25); q.tx = d.x; q.tz = d.z; }
      q.speed = 1.1 + this.rng() * 0.3; q.hidden = false; q.goStarted = false;
    }
    return i;
  }
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
    this._separate(dt);
    for (let i = this.people.length - 1; i >= 0; i--) {
      const p = this.people[i]; if (!p.obj) continue;
      p.stateT += dt;
      if (!p.static) {
        if (p.mode === 'walk') {
          if (p.wait > 0) { p.wait -= dt; p.sp = 0; if (p.wait <= 0) this._enter(p, 'walk'); }
          else {
            if (p.tx == null || arrived(p, Math.hypot(p.tx - p.x, p.tz - p.z))) {
              if (p.revert) this._settle(p);   // finished stepping out of the user's way: back to standing / the queue
              else {
                const stood = p.stopHere && p.tx != null;   // it came here to stand a while: it has braked to a halt on the spot
                let tx, tz, k = 0; do { tx = p.rect.x0 + this.rng() * (p.rect.x1 - p.rect.x0); tz = p.rect.z0 + this.rng() * (p.rect.z1 - p.rect.z0); } while (k++ < 12 && !this._free(tx, tz, 0.3, p));
                p.tx = tx; p.tz = tz; p.bestD = 1e9; p.stuckT = 0; p.turnT = 0; p.stopHere = this.rng() < 0.45;   // decided now, so the walk there can end in a planned stop
                if (stood) { p.wait = 2 + this.rng() * 7; p.sp = 0; this._enter(p, 'stand'); }
              }
            }
            if (p.mode === 'walk' && !(p.wait > 0)) {
              const moved = this._step(p, dt, p.speed * 0.85), dd = Math.hypot(p.tx - p.x, p.tz - p.z);
              this._progress(p, moved, dd, dt, 0.05);
              if (!moved || p.stuckT > 1.6) { p.tx = null; p.stopHere = false; p.wait = 0.5 + this.rng(); p.sp = 0; p.stuckT = 0; this._enter(p, 'stand'); }   // boxed in / going nowhere: stop and think again, never shuffle on the spot
            }
          }
        } else if (p.mode === 'queue') {
          const dq = Math.hypot(p.tx - p.x, p.tz - p.z); p.stopHere = true;   // its place in the line is somewhere to stand: it brakes into it
          if (p.state === 'walk' ? !arrived(p, dq) : dq > 0.15) {
            const moved = this._step(p, dt, p.speed * 0.9);
            this._progress(p, moved, dq, dt, 0.05);
            if (moved) { p.blockT = 0; if (p.state !== 'walk') this._enter(p, 'walk'); }
            else { p.blockT = (p.blockT || 0) + dt; if (p.state === 'walk' && p.blockT > 0.3) this._enter(p, 'stand'); }   // boxed in: wait quietly
            if (p.stuckT > 2.5) { p.tx = p.x; p.tz = p.z; p.stuckT = 0; p.yawT = p.qyaw; p.sp = 0; this._enter(p, 'stand'); }   // no way through to its place: wait where it stands
          } else if (p.state === 'walk') { p.yawT = p.qyaw; p.sp = 0; this._enter(p, 'stand'); }
        } else if (p.mode === 'go') {
          if (p.delay > 0) { p.delay -= dt; if (p.hidden) continue; }   // streamers stay invisible until their turn; queued boarders idle in the line
          else {
            if (!p.goStarted) {
              p.goStarted = true; p.bestD = 1e9; p.stuckT = 0; p.turnT = 0; p.blockT = 0; p.sp = 0; p.stopHere = false;   // a passenger on the way to a door or the stairs does not stop for them
              if (p.hidden) { p.hidden = false; p.obj.visible = true; p.yaw = p.yawT = Math.atan2(-(p.tx - p.x), -(p.tz - p.z)); p.yw = 0; }   // a streamer appears already facing the way it goes
              this._enter(p, 'go', 0.2);
            }
            const moved = this._step(p, dt, p.speed, p.blockT > 0.8 ? 2 : 1);   // walks round people and furniture; only a person truly boxed in for a moment goes through
            p.blockT = moved ? 0 : p.blockT + dt; if (yAt) p.y = yAt(p.x, p.z, p.y);
            const dd = Math.hypot(p.tx - p.x, p.tz - p.z);   // progress-based watchdog: sliding along a wall without getting closer is being stuck too
            this._progress(p, moved, dd, dt, 0.03);
            if (dd < 0.35 || p.stuckT > 2.5) { this._drop(p); this.people.splice(i, 1); continue; }
          }
        }
      }
      // someone standing within arm's reach of the user takes a few real steps aside (legs moving) instead of gliding away in their idle pose
      if (!p.static && this.walker && p.mode !== 'go' && p.state !== 'walk' && !p.revert) { const dx = p.x - this.walker.x, dz = p.z - this.walker.z, d = Math.hypot(dx, dz); if (d < 1.0 && !this._makeWay(p, d > 1e-4 ? dx / d : 1, d > 1e-4 ? dz / d : 0) && d > 1e-4) { const k = Math.min(1.0 - d, 1.0 * dt); const nx = p.x + (dx / d) * k, nz = p.z + (dz / d) * k; if (this._onFloor(nx, nz, 0.12)) { p.x = nx; p.z = nz; } } }
      if (!p.static) this._turn(p, dt);
      // idle-variant rotation (phone / talk / look / fidget ...)
      if (p.state !== 'walk' && p.state !== 'go' && p.stateT > p.nextT && p.obj.visible) this._enter(p, p.state);
      this._pace(p, dt);
      this._place(p, false);
      let dist = 0; if (cam) { p.obj.getWorldPosition(v); dist = v.distanceTo(cam); }
      if (cam && hiSet && p.char.lodNode && swaps < 2 && !p.hidden) { const wantLod = !hiSet.has(p); if (wantLod !== !!p.lod) { this._swapLod(p, wantLod); swaps++; } }
      if (!p.hidden) p.obj.visible = dist < this.rVis;
      const animate = (dist < this.rAnim || p.v > 0.2) && p.obj.visible, upd = animate || p.dirty, hold = p.hold;
      if (upd && hold && hold.rig) hold.rig.restore();   // the layers come off in the reverse order they went on: the hold's (arms, phone), then the gait's, leaving the mixer's own pose on the bones before it advances (see gait_three.js)
      if (upd && p.gait && p.gait.rig) p.gait.rig.restore();
      if (animate) { p.mixer.update(dt); p.dirty = false; if (this.gaitOn && !p.static) this._gaitStep(p, dt); } else if (p.dirty) { p.mixer.update(this.crossfade + 0.05); p.dirty = false; }
      if (hold && upd) this._holdStep(p, dt, !animate);
    }
  }
  // ------------------------------------------------------------------ the procedural walk (gait.js: the maths, gait_three.js: the skeleton)
  /** switch the procedural walk on or off: off = the captured clip walk the game had before it (the baseline of research/people-motion-rubric.md) */
  setGait(on) {
    this.gaitOn = !!on;
    if (!on) for (const p of this.people) if (p.gait) { if (p.gait.rig) p.gait.rig.restore(); p.gait = null; }
  }
  /** the plain `walk` clip of a character (not walk_bag, whose hand is curled round a bag there is no model of), or null */
  _plainWalk(ch) { const a = ch.pools.walk; return a && a.find((c) => /(^|__)walk$/.test(c.name)) || null; }
  /** a character's rest skeleton and feet for the gait (gait_three.readBody), measured once from an unanimated clone of the level of detail the person wears: the simplified
   *  model's skeleton is NOT the full one's (bones a percent or so shorter, the root an inch higher), and a gait solved for the wrong one leaves the feet floating. null (never
   *  retried) if the rig is not the expected one. */
  _gaitBody(ch, lod) {
    const key = lod && ch.lodNode ? 'gbLo' : 'gbHi';
    if (ch[key] === undefined) { try { ch[key] = readBody(this.THREE, this._clone(ch, key === 'gbLo')); } catch (e) { ch[key] = null; } }
    return ch[key];
  }
  /** the options a person's gait is made with: a little individuality (it is a crowd, not a squad) - how much each arm swings, how much the body bobs and sways, how the feet
   *  toe out, how quick their steps are for their speed - none of it is in the clip. Fixed for the person, so a re-plant (below) does not change who they are. The traits and the
   *  seed of the step-to-step wander (gait.js VARY) come from the character's id and how many of that character have walked before, not from the order the crowd was made in, so a
   *  recording of one character is the same whatever else is on the platform. */
  _gaitOpts(p) {
    const id = p.char.id, n = this._gcount[id] = (this._gcount[id] || 0) + 1, r = mulberry32(G.seedOf(id) + 977 * n), tab = ARM_OUT[id];
    return { armOut: (tab && tab.walk) || [8, 8], seed: (G.seedOf(id) + 7919 * n) >>> 0,
      var: { arm: 0.85 + 0.3 * r(), bob: 0.9 + 0.2 * r(), sway: 0.85 + 0.3 * r(), yawBias: (r() - 0.5) * 3, cad: 0.95 + 0.1 * r() } };
  }
  /** One frame of the gait, after the mixer: the gait is told where the person is (position, heading, the ground speed they actually covered) and writes over the clip's pose.
   *  Two layers, with their own weights (gait_three.js): the upper body (pelvis, trunk, head, arms; wU) is the gait's while the person walks and for GAIT_TAIL after the last step
   *  (the arms settle), then goes back to the clip; the legs (wL) are the gait's from the first step for good, solved against whatever pelvis the person has, so the feet that were
   *  planted stay planted whatever the idle clips do, and a person who turns on the spot re-plants them with steps. Hands stay with the clip. */
  _gaitStep(p, dt) {
    const walking = p.state === 'walk' || p.state === 'go', standing = p.state === 'stand'; let gs = p.gait;
    if (!gs) {
      if (!walking && !(standing && p.yawT != null && Math.abs(angDiff(p.yaw, p.yawT)) > 0.35)) return;   // nobody who has neither walked nor is about to pivot needs it; one who pivots on the spot does (the idle clip's feet turn with the body)
      const gb = this._gaitBody(p.char, p.lod); if (!gb) return;
      const opts = this._gaitOpts(p); gs = p.gait = { g: G.newGait(gb.body, opts), opts, gb, wU: 0, wL: 0, hold: 0, rig: null, phase: 0, t: this._clock, px: p.x, pz: p.z, py: p.yaw };
    }
    if (this._clock - gs.t > 0.3 || Math.hypot(p.x - gs.px, p.z - gs.pz) > 0.6) { gs.opts.seed = (gs.opts.seed + 0x9e3779b1) >>> 0; gs.g = G.newGait(gs.gb.body, gs.opts); gs.px = p.x; gs.pz = p.z; gs.py = p.yaw; }   // not seen for a while / moved bodily (not walked): plant afresh
    if (walking) gs.hold = 0; else gs.hold += dt;
    gs.wU = walking || gs.hold < GAIT_TAIL ? Math.min(1, gs.wU + dt / GAIT_IN) : Math.max(0, gs.wU - dt / GAIT_OUT);
    gs.wL = walking || standing ? Math.min(1, gs.wL + dt / GAIT_IN) : Math.max(0, gs.wL - dt / GAIT_OUT); gs.t = this._clock;
    if (gs.wU <= 0 && gs.wL <= 0) { gs.g.placed = false; gs.g.walking = false; gs.px = p.x; gs.pz = p.z; gs.py = p.yaw; return; }   // by clip again: the next walk plants its feet where the person stands then
    const n = Math.min(4, Math.max(1, Math.ceil(dt * 30))), dy = angDiff(gs.py, p.yaw), stopD = p.stopHere && p.tx != null && walking ? Math.max(0, Math.hypot(p.tx - p.x, p.tz - p.z) - STEER.ARR) : null;   // metres to go to the place where it will stand (steer.js brakes to rest ARR short of it)
    for (let i = 1; i <= n; i++) { const f = i / n; G.gaitUpdate(gs.g, dt / n, { x: gs.px + (p.x - gs.px) * f, z: gs.pz + (p.z - gs.pz) * f, yaw: gs.py + dy * f, v: p.v, walking, stopD }); }
    gs.px = p.x; gs.pz = p.z; gs.py = p.yaw;
    if (!gs.rig) gs.rig = new GaitRig(this.THREE, p.obj, gs.gb);
    const T = G.gaitTargets(gs.g), sol = gs.wU > 0 ? G.gaitSolve(gs.g, T) : null; let legs = sol;
    if (!sol || gs.wU < 0.999) {   // the legs reach for their planted feet from the pelvis the person really has: the clip's, or the blend of the clip's and the gait's
      let pel = gs.rig.clipPelvis();
      if (sol) { const c = pel, w = gs.wU, b = sol.pelvisW; pel = { pos: [c.pos[0] + (b.pos[0] - c.pos[0]) * w, c.pos[1] + (b.pos[1] - c.pos[1]) * w, c.pos[2] + (b.pos[2] - c.pos[2]) * w], q: G.qslerp(c.q, b.q, w) }; }
      legs = G.gaitSolve(gs.g, T, { legsOnly: true, pelvis: pel });
    }
    gs.rig.apply(sol, gs.wU, legs, gs.wL); gs.phase = gs.g.phase;
  }
  /** ground speed (m/s) at which the walk cycle's planted foot does not slip: on the real skinned soles the mean contact-point speed over the stance is the asset's own
   *  `walkSpeedMps` x ~1.07 (adults 1.02-1.10, children 1.06-1.09 across the rigs), so nothing needs measuring at run time */
  _strideOf(ch) { return ch.walkSpeed * 1.07; }
  /** stride matching: the walk cycle's playback rate follows the speed the person ACTUALLY moved this frame (steering, separation, the user's
   *  body-avoidance shove and wall slides all included), so planted feet stay planted instead of skating. */
  _pace(p, dt) {
    if (p.px == null || !(dt > 0)) { p.px = p.x; p.pz = p.z; p.v = 0; return; }
    const v = Math.hypot(p.x - p.px, p.z - p.pz) / dt; p.px = p.x; p.pz = p.z;
    p.v = v > 4 ? 0 : p.v + (v - p.v) * Math.min(1, dt * 12);   // teleports are not walking
    if ((p.state === 'walk' || p.state === 'go') && p.cur) p.cur.timeScale = Math.min(1.8, p.v / this._strideOf(p.char));
  }
  /** may this person stand at (nx,nz)? On the slab (inset m), clear of furniture, the user and every other person - except that stepping AWAY from something already too close is always allowed */
  _freeStep(p, nx, nz, m = 0.22) {
    if (!this._onFloor(nx, nz, m)) return false;
    const w = this.walker; if (w) { const dn = Math.hypot(nx - w.x, nz - w.z); if (dn < 0.86 && dn < Math.hypot(p.x - w.x, p.z - w.z)) return false; }
    for (const a of this.avoid) if (nx > a.x0 - 0.22 && nx < a.x1 + 0.22 && nz > a.z0 - 0.22 && nz < a.z1 + 0.22) return false;
    for (const q of this.people) {
      if (q === p || q.hidden || !q.obj || q.static) continue;
      const dn2 = (q.x - nx) ** 2 + (q.z - nz) ** 2; if (dn2 >= 0.45 * 0.45) continue;
      if (dn2 > (q.x - p.x) ** 2 + (q.z - p.z) ** 2) continue;   // already inside each other's space: moving apart is fine
      return false;
    }
    return true;
  }
  /** One steering step toward (tx,tz). The straight line is tried first, then wider and wider veers (to the person's preferred side first, so two people meeting head-on pass on
   *  opposite sides); the chosen direction is the heading the person wants, and steer.js turns them toward it and speeds them up or brakes them (a person is a unicycle: they move
   *  the way they face, at a limited acceleration and braking, slowly while their facing is far off, and braking into the target when p.stopHere) - no snapping, no crab-walking,
   *  no jitter, nobody stopped dead.
   *  lvl 0: normal wanderer / queuer (slab inset 0.22); 1: passenger going for a door / the stairs (inset 0.12, still walks round people); 2: boxed-in passenger (floor only).
   *  Returns false when there is no way forward (the person then faces the goal and stands still - never a random shuffle). */
  _step(p, dt, sp, lvl = 0) {
    sp = Math.min(sp, (p.char ? p.char.walkSpeed : 1.3) * 1.3);   // never faster than the walk cycle can plausibly cover (stride matching handles the rest)
    const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz); if (d < 1e-4) return true;
    const ok = (x, z) => (lvl === 2 ? this._onFloor(x, z, 0.12) : this._freeStep(p, x, z, lvl === 1 ? 0.12 : 0.22));
    const h0 = Math.atan2(dz, dx), side = p.side || 1, near = Math.min(d, 0.4), far = Math.min(d, 0.85);
    if (p.sideT > 0) p.sideT -= dt;
    // pick a heading: straight on if it is clear well ahead, else the smallest veer that is (preferred side first, and once a side is chosen the person COMMITS to it for a
    // second - flipping sides every frame in front of an obstacle is the dithering this prevents); pass 1 settles for "clear just ahead", pass 2 may swap sides
    let pick = null;
    for (let pass = 0; pass < 3 && !pick; pass++) for (const off of SIDESTEPS) {
      if (pass < 2 && p.sideT > 0 && off * side < 0) continue;
      const h = h0 + off * side, ux = Math.cos(h), uz = Math.sin(h);
      if (!ok(p.x + ux * near, p.z + uz * near)) continue;
      if (pass === 0 && !ok(p.x + ux * far, p.z + uz * far)) continue;
      pick = { ux, uz, off }; break;
    }
    if (!pick) { p.sp = 0; p.yawT = Math.atan2(-dx, -dz); return false; }
    if (pick.off * side < 0) { p.side = -side; p.sideT = 1.0; } else if (pick.off !== 0) p.sideT = Math.max(p.sideT || 0, 0.8);
    // a veer round something is a heading to follow, but it must not shorten the planned stop: the distance to brake into is still the distance to the target
    const move = steerStep(p, dt, { hT: Math.atan2(-pick.ux, -pick.uz), want: sp, d, stop: !!p.stopHere });
    p.steered = true; p.yawT = p.yaw;
    let sx = -Math.sin(p.yaw) * move, sz = -Math.cos(p.yaw) * move;
    if (!ok(p.x + sx, p.z + sz)) { p.sp = Math.max(0, p.sp - 2 * STEER.BMAX * dt); sx = sz = 0; }   // not facing the checked way yet and the way it faces is blocked: hold, turn, then go
    p.x += sx; p.z += sz;
    return true;
  }
  /** the watchdog of a person on the way somewhere: getting closer (by tol) resets it; turning to face the way (a few seconds at most) is neither progress nor being stuck */
  _progress(p, moved, dd, dt, tol) {
    if (dd < (p.bestD ?? 1e9) - tol) { p.bestD = dd; p.stuckT = 0; p.turnT = 0; }
    else if (moved && p.turning && (p.turnT = (p.turnT || 0) + dt) < 4) { /* pivoting to face the way */ }
    else p.stuckT = (p.stuckT || 0) + dt;
  }
  /** a person who is not being steered this frame is standing: they have no speed, and turn on the spot toward p.yawT (a queue slot, the user) at a pivoting pace. A person who WAS steered
   *  (_step has turned them) is left alone. */
  _turn(p, dt) {
    if (p.steered) { p.steered = false; return; }
    p.sp = 0;
    if (p.yawT == null || (!p.yw && Math.abs(angDiff(p.yaw, p.yawT)) < 1e-3)) return;
    turnToward(p, p.yawT, dt, STEER.PIVOT);
  }
  /** someone standing too close to the user: walk a couple of metres clear (legs moving), then go back to standing / the queue slot. false: nowhere to go */
  _makeWay(p, ux, uz) {
    const a0 = Math.atan2(uz, ux);
    for (const dist of [1.8, 1.2]) for (const off of [0, 0.8, -0.8, 1.6, -1.6, 2.4]) {
      const tx = p.x + Math.cos(a0 + off) * dist, tz = p.z + Math.sin(a0 + off) * dist;
      if (!this._free(tx, tz, 0.3, p)) continue;
      if (p.mode !== 'walk') { p.revert = p.mode; p.mode = 'walk'; }
      p.tx = tx; p.tz = tz; p.wait = 0; p.sp = 0; p.stopHere = true; p.bestD = 1e9; p.stuckT = 0; p.turnT = 0; this._enter(p, 'walk'); return true;
    }
    return false;
  }
  /** back from stepping aside: queue people return to their place in the line, everyone else just stands where they are */
  _settle(p) {
    const m = p.revert; p.revert = null; p.sp = 0; p.stopHere = false;
    if (m === 'queue' && p.slot) { p.mode = 'queue'; p.tx = p.slot.x; p.tz = p.slot.z; p.qyaw = p.slot.yaw; p.blockT = 0; p.bestD = 1e9; p.stuckT = 0; return; }
    p.mode = m || 'stand'; p.tx = null; this._enter(p, 'stand');
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
