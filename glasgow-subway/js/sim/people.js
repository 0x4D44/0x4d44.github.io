// Instanced low-poly people (platform crowd, boarding/alighting streams).
import { mulberry32, clamp } from './util.js';
import { fitHair, fitScalp, fitHoseLegs, fitLegs, legFit, trimUnderSkirt, trimUnderTop, trimUnderTrousers, trimWebbing, countWebbing, fitShoes, armRig, armAxes, armClip, armProbe } from './bodyfit.js';
import { ARM_OUT, ARM_DROP } from './armfit.js';
import { LEG_RADII } from './legradii.js';
import * as G from './gait.js';
import { readBody, GaitRig } from './gait_three.js';
import { STEER, angDiff, arrived, steerStep, turnToward } from './steer.js';
import { HoldRig } from './hold_three.js';
import { VARIANTS as PHONE_VARIANTS } from './phone.js';
import { pickBag, fitBody, wearBag, stepBag, dropBag } from './bags.js';
import { makeHaggis, followStep, poseHaggis, poseLead } from './haggis.js';
import { BLINK, blinkStep, eyeRig, gazeStep, makeEyes, makeLids } from './blink.js';
import { buildSmile, smileMesh } from './smile.js';
import { PROX, chooseSpot, newAttention, attend } from './waiting.js';
import { LookRig } from './look_three.js';
export const PET_OWNER = 'adult_string_vest';   // the man in the string vest walks a haggis (haggis.js)
import { dressTee, undressTee, takePrint, releasePrint, printAtlas, teeColour, TEE } from './tees.js';
// ?gait=clip: the captured clip walk the game had before the procedural gait (to compare, and the baseline of research/people-motion-rubric.md)
const ARM_FADE = 0.8, ARM_BONE = /^(clavicle|upperarm|lowerarm|hand|thumb|index|middle|ring|pinky)/;   // s: an arm that was up on a pole is lowered over this long, as a person lets go and drops the hand (POSE_FADE dropped it 0.6 m in 0.2 s - review 65)
const POSE_FADE = 0.4;   // s: a person handed over between crowds goes from their old pose to their new one in this long
const SIT_FEET = 0.07;   // how far below the floor a seated person's soles may reach before they are lifted off the seat (people audit: 0.08)
const CLIP_WALK = typeof location !== 'undefined' && /[?&]gait=clip(&|$)/.test(location.search || '');
// ?phones=0: nobody uses a mobile phone (to compare; the walking metrics of research/people-motion-rubric.md are measured without them)
// ?bags=0: nobody carries a bag (bags.js)
const NO_BAGS = typeof location !== 'undefined' && /[?&]bags=0(&|$)/.test(location.search || '');
const NO_PHONES = typeof location !== 'undefined' && /[?&]phones=0(&|$)/.test(location.search || '');
const STEP_TURN = 1.6;   // rad/s: the turn on the spot of a rider stepping round (to sit, after standing up, at a new spot)
const FLOOR_BONE = 0.025;   // m: the lowest a foot or ball-of-foot bone may be above the floor while sitting down or getting up (standing, they are at 2.5 - 4.5 cm)
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
// Characters in use, shared by every AnimCrowd in the page: id -> number of people wearing it.
const IN_USE = new Map();
export const charsInUse = () => IN_USE;
export const resetCharsInUse = () => IN_USE.clear();
const useChar = (id, d) => { const n = (IN_USE.get(id) || 0) + d; if (n > 0) IN_USE.set(id, n); else IN_USE.delete(id); };
/** Choose a character for one more person. Preference: (a) unused anywhere, from `pool` (the category the mix rolled); (b) unused anywhere, from any category;
 *  (c) unused in this crowd (`local`: id -> count), least used globally; (d) least used in this crowd. `filter` (a spot only some fit) applies throughout; null when nobody fits.
 *  Random among equals, drawn from `rng` only. A character with `rare` (0..1, from people_meta.json: the one top hat) is taken only that fraction of the
 *  times it is drawn, in every step but the last, which must always find someone. */
export function pickChar(chars, pool, filter, rng, local, global = IN_USE) {
  const g = (c) => global.get(c.id) || 0, l = (c) => local.get(c.id) || 0;
  const draw = (list, rare = true) => { const a = list.slice(); while (a.length) { const i = Math.floor(rng() * a.length), c = a[i]; if ((!rare || !c.rare || rng() < c.rare) && (!filter || filter(c))) return c; a[i] = a[a.length - 1]; a.pop(); } return null; };   // filter lazily: it can be expensive
  const least = (list, key, rare) => { const by = new Map(); for (const c of list) { const k = key(c); (by.get(k) || by.set(k, []).get(k)).push(c); } for (const k of [...by.keys()].sort((x, y) => x - y)) { const c = draw(by.get(k), rare); if (c) return c; } return null; };
  return draw(pool.filter((c) => !g(c))) || draw(chars.filter((c) => !g(c))) || least(chars.filter((c) => !l(c)), g) || least(chars, (c) => l(c) * 1e6 + g(c), false);
}
// id -> [[material name, r, g, b multiplier (linear: 0.15 shows as ~0.42)], ...]. Review 8: the two long-coat women wore one pale striped coat that read as a bathrobe (now
// camel and dark navy); adult_casual2 and ya_ginger_lad one sweatshirt; teen_skirt and woman_mini one top (woman_mini's goes blue; her tartan was turned green at build)
const GARMENT_TINT = { woman_mini: [[/skirt/i, 0.09, 0.12, 0.1], [/camisole/i, 0.22, 0.3, 0.55]], elder_woman_coat: [[/^cloth_coat\./i, 0.33, 0.2, 0.09, 'flat']],
  ya_winter: [[/^cloth_coat\./i, 0.035, 0.045, 0.09, 'flat']], teen_tube: [[/skirt/i, 0.07, 0.12, 0.3, 'flat']], ya_ginger_lad: [[/casualsuit/i, 0.32, 0.32, 0.32]],
  man_kilt_casual: [[/sweater/i, 0.3, 0.26, 0.3]], teen_skater: [[/tennisshoes/i, 0.06, 0.06, 0.07]],
  adult_lusekofta: [[/winterboots/i, 0.12, 0.06, 0.025, 'flat']], adult_beret: [[/riding_boots/i, 0.05, 0.05, 0.05]],
  man_elder: [[/^skin_/, 1.6, 1.35, 1.15]], man_longcoat: [[/^skin_/, 0.78, 0.84, 1.05]], elder_man_suit: [[/^skin_/, 0.74, 0.86, 1.25]] };   // (review 67: man_elder's skin grey and grimy, man_longcoat's orange - warmed and cooled)   // (review 13: the one maze-striped coat on two women - now a plain camel coat and a plain navy one; the tartan mini on two girls - teen_tube's now plain blue)   // (review 13: the boots' white texture parts stretched into white wedges at the boot tops - now the boot's own colour throughout)   // (review 11: man_beard's red jumper on man_kilt_casual too - now a dark burgundy; teen_skater's white trainers on sum_loose_shorts_w's template - now black)
/** the four garment groups the crowd keeps any one of under half of the people near by (_pick) */
const garmentGroup = (c) => (/skirt|dress|sash/.test(c.outfit) ? 'skirt' : /kilt|highland/.test(c.outfit) && !/trews/.test(c.outfit) ? 'kilt' : /shorts|leggings/.test(c.outfit) ? 'bare' : 'trousers');
/** 'f' or 'm', from the body's skin material (MPFB2 names them skin_..._female / skin_..._male), '' if neither */
const sexOf = (node) => { let s = ''; if (node) node.traverse((o) => { for (const x of o.material ? [].concat(o.material) : []) if (!s && /^skin_/.test(x.name || '')) s = /female/.test(x.name) ? 'f' : /male/.test(x.name) ? 'm' : ''; }); return s; };
// whose far model is poor close to (review 62: boy_kilt's and girl_school_kilt's jumpers a flat box with the arms out of the sleeves; red mouth smears and misaligned eyes on the
// decimated heads): they keep the full model 8 m further out - to about 19 m, where the far model's faults are a few pixels
const LOD_POOR = new Set(['boy_kilt', 'girl_school_kilt', 'adult_piper', 'elder_man_suit', 'ya_spiky', 'man_kilt_casual', 'teen_shorts_lad', 'ya_tattoo_tank', 'adult_smile_blouse', 'woman_elder', 'boy_shorts', 'woman_puffer']);
const FINGER_SIGN = 1;   // a positive turn about a finger bone's own X closes it toward the palm
const PHONE_SIDE = 1;    // the right hand (_fingerRig: side 0 is the left), which holds a phone to the ear (hold.js holdHands)
export class AnimCrowd {
  /** gltf: people.glb (full detail), lodGltf: people_lod.glb. Either may be null; with only the LOD file everyone is drawn from it until attachFull(people.glb)
   *  (the game loads the small file first, so the station is drawn without waiting for the big one). */
  constructor(THREE, SkeletonUtils, gltf, max = 40, quality = 'high', lodGltf = null) {
    this.THREE = THREE; this.SU = SkeletonUtils; this.max = max; this.quality = quality; this.people = []; this.rng = mulberry32(99); this.printRng = mulberry32(1149);   // prints draw from their own stream: the crowd's sequence is unchanged
    printAtlas(THREE);   // start loading the print atlas now, so the first T-shirts are not blank (null in Node)
    this.rAnim = quality === 'low' ? 20 : 40; this.rVis = quality === 'low' ? 70 : 140;   // (rVis: beyond the far end of the longest platform from anywhere on it - at 60 m people at the far end blinked out as you walked away)
    // (2026-11-15, people review 3: these two sat inside the comment above, so every change of clip snapped in one frame and the platform crowd had no cap on full-detail people)
    this.crossfade = 0.3; this.maxHi = quality === 'low' ? 6 : 28;
    this.chars = []; this.meas = new Map();
    const prim = gltf || lodGltf, scene = prim.scene, holder = scene.getObjectByName('people') || scene;
    const meta = prim.meta || (lodGltf && lodGltf.meta) || null;   // optional models/people_meta.json: { <id>: { height } }
    const anims = prim.animations.map((a) => new THREE.AnimationClip(a.name, a.duration, a.tracks.map((k) => { const c = k.clone(); c.name = k.name; return c; })));   // shared clips address suffixed bones (hips_5): retarget to the canonical names
    const shared = {}; for (const a of anims) { const cat = catOf(a.name.includes('__') ? a.name.split('__')[1] : a.name); if (cat) (shared[cat] = shared[cat] || []).push(a); }
    for (const n of holder.children) {
      const m = /^person_(.+)$/.exec(n.name); if (!m) continue;
      const mt = meta && meta[m[1]], kid = /boy|girl|kid|child/.test(m[1]) && !/teen/.test(m[1]);
      const pools = {}; for (const k of Object.keys(shared)) { if (k === 'fidget' && !kid) continue; pools[k] = shared[k].filter((a) => !a.name.includes('__') || a.name.startsWith(m[1] + '__')); if (!pools[k].length) delete pools[k]; }
      if (!pools.idle) continue;
      const lodNode = !lodGltf ? null : gltf ? lodGltf.scene.getObjectByName('person_' + m[1]) : n;
      this.chars.push({ id: m[1], sex: sexOf(n || lodNode), node: gltf ? n : null, lodNode, outfit: (mt && mt.outfit) || 'trousers', pools, kid, small: /small/.test(m[1]), staff: /staff/.test(m[1]), elder: /elder/.test(m[1]) || (mt && mt.kind) === 'elder', kind: (mt && mt.kind) || '', metaH: mt && mt.heightM, walkSpeed: (mt && mt.walkSpeedMps) || 1.3, rare: (mt && mt.rare) || 0 });
    }
    this.fit = {};   // body-fitting stats per character (bodyfit.js), for the tests
    for (const c of this.chars) { this.fit[c.id] = { hair: null, hairLod: null, legs: null, legsLod: null, trim: null, trimLod: null, web: null, webLod: null, shoes: null }; if (c.node) this._fitFull(c); if (c.lodNode) this._fitLod(c); }
    // a few garments darkened where the build's hue turn left them too loud: woman_mini's tartan turned green came out neon (review 7 asked for another tartan; a dark Black Watch green reads as one)
    // brows and lashes: the texture's hairs are mostly half-transparent, and the export's cut-off at 0.5 kept only their cores - brows of a few black dashes (reviews 31 - 36,
    // 'dotted brows' on most faces). Blended instead, over the skin they lie on, with only the faintest wisps cut.
    for (const c of this.chars) for (const r of [c.node, c.lodNode]) if (r) r.traverse((m) => { const mt = m.isMesh && m.material; if (!mt || !/^alpha_(brows|lashes)/.test(mt.name || '') || mt.userData.soft) return; mt.userData.soft = true; mt.transparent = true; mt.alphaTest = 0.04; mt.depthWrite = false; mt.needsUpdate = true; });
    for (const c of this.chars) { const T = GARMENT_TINT[c.id]; if (T) for (const r of [c.node, c.lodNode]) if (r) r.traverse((m) => { if (!m.isMesh || !m.material || m.material.userData.tintOf === c.id) return; const t = T.find((x) => x[0].test(m.material.name || '')); if (!t) return; m.material = m.material.clone(); m.material.color.setRGB(t[1], t[2], t[3]); if (t[4] === 'flat') { m.material.map = null; m.material.needsUpdate = true; } m.material.userData.tintOf = c.id; }); }   // ('flat': the picture goes and the colour stands alone - a texture whose light parts stretch into wedges)   // (a clone: one material can be shared by several characters in the file)
    // the 21 rigs share bone names; GLTFLoader suffixed the duplicates (hips_5 ...). The shared clips address the plain names -> canonicalise per clone.
    this.boneNames = new Set(); { const f = this.chars[0]; if (f) (f.node || f.lodNode).traverse((o) => { if (o.isBone) this.boneNames.add(o.name); }); }   // first rig keeps the plain names (spine_01 ... are REAL names: never strip blindly)
    this.canon = (n) => (this.boneNames.has(n) ? n : (this.boneNames.has(n.replace(/_\d+$/, '')) ? n.replace(/_\d+$/, '') : n));
    for (const a of anims) for (const k of a.tracks) { const m = /^(.*)\.(quaternion|position|scale)$/.exec(k.name); if (m) k.name = this.canon(m[1]) + '.' + m[2]; }
    for (const k of Object.keys(shared)) shared[k] = shared[k];
    // arms turned out of the hips, skirts and coats (bodyfit.js: armClip; the angles come from armfit.js, solved offline by tools/armfit.mjs): each character gets its own copies
    // of the arm clips with the upper-arm keys turned a few degrees outwards. The shared originals stay in pools0 for the solver and the tests. A clip that no turn
    // can clear (hands clasped behind the back, inside the pelvis: ARM_DROP) is simply not played, so long as the pool keeps another.
    this.armRigs = {}; this.armFit = {};
    for (const c of this.chars) {
      const rig = armRig(THREE, c.node || c.lodNode), tab = ARM_OUT[c.id], drop = ARM_DROP[c.id] || []; let n = 0; this.armRigs[c.id] = rig;
      c.pools0 = {}; for (const cat of Object.keys(c.pools)) c.pools0[cat] = c.pools[cat].slice();
      if (rig && tab) for (const cat of Object.keys(c.pools)) c.pools[cat] = c.pools[cat].map((clip) => {
        const d = tab[clip.name.split('__').pop()]; if (!d) return clip;
        const nc = armClip(THREE, clip, armAxes(THREE, rig, clip), d[0], d[1]); if (nc !== clip) n++; return nc;
      });
      for (const cat of Object.keys(c.pools)) { const keep = c.pools[cat].filter((clip) => !drop.includes(clip.name.split('__').pop())); if (keep.length) c.pools[cat] = keep; }
      this.armFit[c.id] = n;
    }
    this.adults = this.chars.filter((c) => !c.kid && !c.staff); this.group = new THREE.Group(); this.group.name = 'crowd';
    this._v = new THREE.Vector3(); this.hasAnim = this.chars.length > 0; this._clock = 0; this.avoid = []; this.walker = null; this.gaitOn = !CLIP_WALK; this._gcount = {}; this.phones = !NO_PHONES; this.prng = mulberry32(0x70e5); this.bags = !NO_BAGS; this.brng = mulberry32(0xba95);   // phones have their own random stream: switching them off changes nothing else
    this.reserve = Math.min(10, Math.floor(max * 0.3));   // places kept free for passengers streaming on / off (a full platform must not starve the train doors)
  }
  /** the garment as Blender's cloth simulation settled it on a seat (tools/assets_people_mpfb.py seat_drape: the rest-space offset _seat), as a morph target that follows the
   *  person into and out of the sit: switched at once while the body blended for half a second, the dress bulged like a bustle sitting down and stood as a tube over bent
   *  thighs getting up (review 42). The morph's normals are full floats: written into the model's Int8 normals they rounded to nothing and the seated skirt drew black. */
  _seatMorph(p, dt) {
    const on = p.state === 'sit' ? 1 : 0;   // (from the moment they start to sit: held back until the settle had ended, the body wore the standing skirt on the seat for half a second - review 43)
    if (p.seatObj !== p.obj) { p.seatObj = p.obj; p.seatMeshes = []; if (p.obj) p.obj.traverse((m) => { if (!m.isSkinnedMesh) return; const g = m.userData.standGeo || m.geometry, sa = g.attributes._seat; if (!sa) return;
      let mg = g.userData.morphGeo;   // (a geometry of its own, shared only by those who have morph influences: on the shared one, a clone without them broke the render - e2e)
      if (!mg) { mg = g.userData.morphGeo = g.clone();
        const d = new this.THREE.Float32BufferAttribute(sa.count * 3, 3); for (let i = 0; i < sa.count; i++) d.setXYZ(i, sa.getX(i), sa.getY(i), sa.getZ(i));
        const tmp = new this.THREE.BufferGeometry(); const P = g.attributes.position.clone(); for (let i = 0; i < P.count; i++) P.setXYZ(i, P.getX(i) + d.getX(i), P.getY(i) + d.getY(i), P.getZ(i) + d.getZ(i)); tmp.setAttribute('position', P); if (g.index) tmp.setIndex(g.index); tmp.computeVertexNormals();
        const n0 = g.attributes.normal, nd = new this.THREE.Float32BufferAttribute(sa.count * 3, 3), nn = tmp.attributes.normal;
        for (let i = 0; i < sa.count; i++) nd.setXYZ(i, nn.getX(i) - (n0 ? n0.getX(i) : 0), nn.getY(i) - (n0 ? n0.getY(i) : 0), nn.getZ(i) - (n0 ? n0.getZ(i) : 0));
        mg.morphAttributes.position = [d]; mg.morphAttributes.normal = [nd]; mg.morphTargetsRelative = true;
      }
      m.userData.standGeo = g; m.geometry = mg; m.updateMorphTargets(); if (m.material) m.material.needsUpdate = true; p.seatMeshes.push(m); }); p.seatW = on; }
    if (!p.seatMeshes || !p.seatMeshes.length) return;
    const T = on ? 1.0 : 0.5; p.seatW += Math.max(-dt / T, Math.min(dt / T, on - p.seatW));   // (in over the second the settle takes, out over the half second of the rise)
    for (const m of p.seatMeshes) if (m.morphTargetInfluences) m.morphTargetInfluences[0] = p.seatW;
  }
  _seatDraped(c) { if (c.seatDrape === undefined) { c.seatDrape = false; for (const r of [c.node, c.lodNode]) if (r) r.traverse((m) => { if (m.isMesh && m.geometry && m.geometry.attributes._seat) c.seatDrape = true; }); } return c.seatDrape; }
  _skirted(c) { return /kilt|skirt|highland|dress/.test(c.outfit) && !/trews/.test(c.outfit); }
  /** the bodyfit.js fits of the full-detail model (people.glb) */
  _fitFull(c) {
    const T = this.THREE, n = c.node, f = this.fit[c.id], sk = this._skirted(c);
    if (/kilt|skirt|highland/.test(c.outfit) && !/trews/.test(c.outfit)) this._extendHem(n);
    f.hair = fitHair(T, n);
    f.scalp = fitScalp(T, n);   // hair-coloured roots under the hair, so a gap between strands is not a bare patch
    f.hose = fitHoseLegs(T, n);   // legs for the people in long socks (theirs were deleted with the skin a garment hid); the kilt is held off these
    f.legs = sk ? fitLegs(T, n, Object.assign(f.hose ? { radii: f.hose.radii } : {}, /pencil|midi/.test(c.outfit) ? { slim: 0.05, margin: 0.012, slimRamp: 0.03, slimCap: 0.4 } : { slimRamp: 0.04 })) : null;   // (a pencil skirt fits close: the thighs came through its front mid-stride - review 3)   // skirts held off the thighs (shader patch + slimmed thigh skin)
    f.trim = sk ? trimUnderSkirt(T, n) : null;   // tops: nothing drawn under the skirt's waist edge
    f.cuffs = !sk && /trousers|trews|leggings/.test(c.outfit) ? this._extendCuffs(n) : 0;
    f.underTop = !sk && /trousers|shorts|trews|leggings/.test(c.outfit) ? trimUnderTop(T, n) : null;
    f.under = !sk && /trousers|shorts|trews|leggings/.test(c.outfit) ? trimUnderTrousers(T, n) : null;   // no skin left under trousers to come through the seat
    f.web = trimWebbing(T, n);
    f.shoes = fitShoes(T, n);   // a stiff shoe that bends at the ball of the foot (the full-detail model only: the simplified one's few big faces gain nothing from it, and it is seen from beyond ~11 m)
  }
  /** the fits of the simplified model (people_lod.glb). Its cloth is made of far bigger flat faces, so its hidden skin gives way more; its own skin is too coarse to
   *  measure the legs on, so it takes the full model's leg radii - measured now when both are here, else the same numbers from legradii.js (tools/legradii.mjs). */
  _fitLod(c) {
    const T = this.THREE, n = c.lodNode, f = this.fit[c.id], sk = this._skirted(c);
    if (/kilt|skirt|highland/.test(c.outfit) && !/trews/.test(c.outfit)) this._extendHem(n);
    f.hairLod = fitHair(T, n);
    f.scalpLod = fitScalp(T, n);
    f.hoseLod = fitHoseLegs(T, n);
    const radii = (f.hoseLod && f.hoseLod.radii) || (f.legs && f.legs.radii) || LEG_RADII[c.id];
    f.legsLod = sk ? fitLegs(T, n, { radii, slim: 0.055, slimCap: 0.55, slimRamp: 0.2 }) : null;
    f.trimLod = sk ? trimUnderSkirt(T, n) : null;
    f.cuffsLod = !sk && /trousers|trews|leggings/.test(c.outfit) ? this._extendCuffs(n) : 0;
    f.underTopLod = !sk && /trousers|shorts|trews|leggings/.test(c.outfit) ? trimUnderTop(T, n) : null;
    f.underLod = !sk && /trousers|shorts|trews|leggings/.test(c.outfit) ? trimUnderTrousers(T, n) : null;
    f.webLod = trimWebbing(T, n);   // the simplified body has a few triangles joining a hand to a thigh
    f.puffLod = this._puffOuter(n);
  }
  /** On the simplified model the layers under an outer garment were simplified harder than it (the staff work suit is 137 vertices under a 1714-vertex vest), so their
   *  flat faces come through it: the vest became a patchwork of orange on navy and the long coats showed jeans through holes (review 7, on the true far model). The outer
   *  garment is moved out along its own normals, once (the geometry is shared by every clone): none for the vest (since review 9 it is painted on to the suit itself), 1 cm for a coat (its own simplification now keeps its seams and enough faces: tools/assets_people_mpfb.py lod_uv) - nothing at 6 m and more. */
  _puffOuter(n) {
    let k = 0; n.traverse((m) => {
      if (!m.isMesh || !m.material || m.geometry.userData.puffed) return; const nm = m.material.name || '', d = /^cloth_hivis/.test(nm) ? 0 : /^cloth_coat\./.test(nm) ? 0.01 : 0; if (!d) return;
      const g = m.geometry, P = g.attributes.position, N = g.attributes.normal; if (!N) return;
      // one direction per point in space: vertices split along a seam (different normals at one place) move together, so no crack opens along the seam
      const key = (i) => Math.round(P.getX(i) * 2000) + ',' + Math.round(P.getY(i) * 2000) + ',' + Math.round(P.getZ(i) * 2000), acc = new Map(), ks = [];
      for (let i = 0; i < P.count; i++) { const kk = key(i); ks.push(kk); const a = acc.get(kk) || [0, 0, 0]; a[0] += N.getX(i); a[1] += N.getY(i); a[2] += N.getZ(i); acc.set(kk, a); }
      for (let i = 0; i < P.count; i++) { const a = acc.get(ks[i]), l = Math.hypot(a[0], a[1], a[2]) || 1; P.setXYZ(i, P.getX(i) + a[0] / l * d, P.getY(i) + a[1] / l * d, P.getZ(i) + a[2] / l * d); N.setXYZ(i, a[0] / l, a[1] / l, a[2] / l); }   // (and shaded smooth with them: the coats' split normals lit them as white shards)
      for (const A of [P, N]) { A.needsUpdate = true; if (A.isInterleavedBufferAttribute) A.data.needsUpdate = true; } g.userData.puffed = true; g.computeBoundingSphere(); k++;
    });
    return k;
  }
  /** people.glb has arrived (after a crowd was built from people_lod.glb alone): fit it and let the nearest people swap up to it, a couple a frame, in update().
   *  Measurements so far came from the simplified model; they are dropped so that from now on they come from the full one, as they would have. */
  attachFull(gltf) {
    if (!gltf || this.chars.every((c) => c.node)) return 0;
    const holder = gltf.scene.getObjectByName('people') || gltf.scene; let n = 0;
    for (const c of this.chars) {
      if (c.node) continue; const node = holder.getObjectByName('person_' + c.id); if (!node) continue;
      c.node = node; this._fitFull(c); n++;
      const want = LEG_RADII[c.id], got = this.fit[c.id].legs && this.fit[c.id].legs.radii;
      if (got && JSON.stringify(got) !== JSON.stringify(want)) console.warn('[people] legradii.js is stale for', c.id, '- rerun node tools/legradii.mjs --write');
      for (const k of Object.keys(c)) if (/^_h_/.test(k)) delete c[k];
      c.gbHi = undefined;
    }
    const f = this.chars.find((c) => c.node); if (f) f.node.traverse((o) => { if (o.isBone && !this.boneNames.has(this.canon(o.name))) console.warn('[people] people.glb bone not in the rig of people_lod.glb', o.name); });
    this.meas.clear();
    return n;
  }
  /** The baked tops (sweater / jacket / camisole) end above the waist and the skin under them is deleted, so with a separate kilt/skirt there is a see-through
   *  band at the midriff. Find the top's centred lower hem loop and extrude it straight down (same skin weights) so it tucks inside the skirt. Patches the shared geometry once. */
  /** add a band of faces under a boundary loop of a garment: copies of its vertices (same weights, UVs) `drop` lower (never below `floor`), stitched to it */
  _extrudeLoop(g, best, edges, drop, floor) {
    const THREE = this.THREE, P = g.attributes.position, idx = g.index;
      const nv = new Map(), attrs = Object.keys(g.attributes), n0 = P.count; let add = 0;
      for (const v of best) nv.set(v, n0 + add++);
      for (const name of attrs) {   // glTF attributes can be interleaved (array is the shared buffer): read through stride/offset, write a plain packed copy
        const A = g.attributes[name], it = A.itemSize, stride = A.isInterleavedBufferAttribute ? A.data.stride : it, off = A.isInterleavedBufferAttribute ? A.offset : 0, src = A.isInterleavedBufferAttribute ? A.data.array : A.array;
        const arr = new src.constructor((n0 + add) * it); for (let i = 0; i < n0; i++) for (let c = 0; c < it; c++) arr[i * it + c] = src[i * stride + off + c];
        for (const [v, w] of nv) { for (let c = 0; c < it; c++) arr[w * it + c] = src[v * stride + off + c]; if (name === 'position') arr[w * 3 + 1] = Math.max(floor, arr[w * 3 + 1] - drop); }
        g.setAttribute(name, new THREE.BufferAttribute(arr, it, A.normalized));
      }
      const tri = []; for (const [a, b] of edges) if (best.has(a) && best.has(b)) { const a2 = nv.get(a), b2 = nv.get(b); tri.push(b, a, a2, b, a2, b2); }
      const ni = new Uint32Array(idx.count + tri.length); for (let i = 0; i < idx.count; i++) ni[i] = idx.getX(i); ni.set(tri, idx.count); g.setIndex(new THREE.BufferAttribute(ni, 1));
  }
  /** Full-length trousers: each ankle cuff is carried a few cm down into the shoe. The decimated cuff is a ragged loop and the ankle skin showed between it
   *  and the shoe as jagged skin-coloured teeth (people review 1: 'ragged hems'). Returns the number of cuffs extended. */
  _extendCuffs(root, drop = 0.045) {
    let n = 0, cuffLo = 1e9;
    root.traverse((o) => {
      if (!o.isSkinnedMesh || !o.material || !/^cloth_/i.test(o.material.name || '') || /shoe|boot|sock|hose|sweater|jacket|camisole|shirt|belt|sneaker|flats/i.test(o.material.name)) return;
      const g = o.geometry; if (g.userData.cuffExt != null) { n += g.userData.cuffExt; return; } g.userData.cuffExt = 0;
      const P = g.attributes.position, idx = g.index; if (!idx) return;
      let lo = 1e9, hi = -1e9; for (let i = 0; i < P.count; i++) { const y = P.getY(i); lo = Math.min(lo, y); hi = Math.max(hi, y); }
      if (lo > 0.2 || hi < 0.7) return;   // not trousers that reach the ankle
      const key = (i) => Math.round(P.getX(i) * 2e3) + ',' + Math.round(P.getY(i) * 2e3) + ',' + Math.round(P.getZ(i) * 2e3);
      const canon = new Map(), cid = new Int32Array(P.count); for (let i = 0; i < P.count; i++) { const k = key(i); let c = canon.get(k); if (c == null) { c = i; canon.set(k, c); } cid[i] = c; }
      const ec = new Map(), dir = new Map();
      for (let t = 0; t < idx.count; t += 3) for (let e = 0; e < 3; e++) { const a = cid[idx.getX(t + e)], b = cid[idx.getX(t + (e + 1) % 3)]; if (a === b) continue; const k = a < b ? a + '_' + b : b + '_' + a; ec.set(k, (ec.get(k) || 0) + 1); dir.set(k, [a, b]); }
      const adj = new Map(), edges = []; for (const [k, c] of ec) if (c === 1) { const [a, b] = dir.get(k); edges.push([a, b]); (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
      const seen = new Set(); for (const v of adj.keys()) { if (seen.has(v)) continue; const comp = [], st = [v]; seen.add(v); while (st.length) { const u = st.pop(); comp.push(u); for (const w of adj.get(u)) if (!seen.has(w)) { seen.add(w); st.push(w); } }
        let y = 0; for (const u of comp) y += P.getY(u); y /= comp.length;
        if (comp.length >= 6 && y < lo + 0.06) { this._extrudeLoop(g, new Set(comp), edges, drop, 0.025); g.userData.cuffExt++; }
      }
      n += g.userData.cuffExt; cuffLo = Math.min(cuffLo, lo);
    });
    // ...and a shoe's collar, wholly inside a trouser leg that comes down over the shoe, is dropped: a decimated collar pokes through the cuff as ragged teeth
    // (tall boots - a shaft above 25 cm - are the other way round: the trouser leg is tucked in, and what of it lies inside the shaft is dropped instead:
    //  review 2 saw adult_heel_boots' jeans come through the boot at the shin)
    const shoes = []; root.traverse((o) => { if (o.isSkinnedMesh && o.material && /shoe|boot|sneaker|flats/i.test(o.material.name || '')) { const P = o.geometry.attributes.position; let hi = -1e9; for (let i = 0; i < P.count; i++) hi = Math.max(hi, P.getY(i)); shoes.push([o, hi]); } });
    const boot = shoes.reduce((m, [, hi]) => Math.max(m, hi), 0);
    if (boot > 0.25) { root.traverse((o) => {
      if (!o.isSkinnedMesh || !o.material || !/^cloth_/i.test(o.material.name || '') || /shoe|boot|sneaker|flats|sock|hose/i.test(o.material.name)) return;
      const g = o.geometry, idx = g.index, P = g.attributes.position; if (!idx || g.userData.inBoot != null) return;
      const lim = boot - 0.035, keep = []; for (let t = 0; t < idx.count; t += 3) { const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2); if (!(P.getY(a) < lim && P.getY(b) < lim && P.getY(c) < lim)) keep.push(a, b, c); }
      g.userData.inBoot = (idx.count - keep.length) / 3; if (keep.length < idx.count) g.setIndex(new this.THREE.BufferAttribute(new Uint32Array(keep), 1));
      // a kept triangle with a corner still down in the shaft is lifted on to the line, so the leg ends in a level hem inside the top of the boot (review 7: adult_lusekofta's
      // flared hems hung over the boots in long jagged shards, the low corners swinging with the foot)
      let lifted = 0; for (const i of new Set(keep)) if (P.getY(i) < lim) { P.setY(i, lim); lifted++; }
      if (lifted) { P.needsUpdate = true; if (P.isInterleavedBufferAttribute) P.data.needsUpdate = true; }
    }); return n; }
    if (cuffLo < 0.09) for (const [o] of shoes) {
      const g = o.geometry, idx = g.index, P = g.attributes.position; if (!idx || g.userData.underCuff != null) continue;
      const lim = cuffLo + 0.025, keep = []; for (let t = 0; t < idx.count; t += 3) { const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2); const ya = P.getY(a), yb = P.getY(b), yc = P.getY(c); if ((ya + yb + yc) / 3 <= lim && Math.max(ya, yb, yc) <= lim + 0.025) keep.push(a, b, c); }   // (a sliver with one low corner reaching up the leg goes too)
      g.userData.underCuff = (idx.count - keep.length) / 3; if (keep.length < idx.count) g.setIndex(new this.THREE.BufferAttribute(new Uint32Array(keep), 1));
    }
    return n;
  }
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
      this._extrudeLoop(g, best, edges, drop, -1e9);
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
  _clone(ch, lod) { const o = this.SU.clone((lod && ch.lodNode) || !ch.node ? ch.lodNode : ch.node); o.traverse((n) => { if (n.isBone) n.name = this.canon(n.name); }); return o; }
  // ------------------------------------------------------------------ measuring
  /** soles/head/hips of a character in a clip, from the real skinned vertices over the clip. Cached. */
  measure(ch, clip) {
    const key = ch.id + ':' + clip.name, hit = this.meas.get(key); if (hit) return hit;
    const THREE = this.THREE, obj = this._clone(ch), mixer = new THREE.AnimationMixer(obj); mixer.clipAction(clip).play();
    const sk = []; obj.traverse((o) => { if (o.isSkinnedMesh) sk.push(o); }); const hipsB = sk[0].skeleton.bones.find((b) => /^(pelvis|hips)$/i.test(b.name)) || sk[0].skeleton.bones[0];
    const v = new THREE.Vector3(), h = new THREE.Vector3(), N = 4, keep = []; const feetB = ['foot_l', 'foot_r', 'ball_l', 'ball_r'].map((n) => sk[0].skeleton.bones.find((b) => b.name === n)).filter(Boolean), feet = [0, 0], ankles = [0, 0], ankles2 = [[0, 0], [0, 0]]; let minY = 1e9, maxY = -1e9, hx = 0, hy = 0, hz = 0, contact = 0, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    // where each hand closes (the crook of the curled middle finger, as for a bag handle): a rider holding a pole is placed so that this point is on the pole (review 14)
    const bone = (n) => sk[0].skeleton.bones.find((b) => b.name === n), G = { l: [bone('middle_01_l') || bone('hand_l'), bone('middle_02_l')], r: [bone('middle_01_r') || bone('hand_r'), bone('middle_02_r')] }, grip = { l: [0, 0, 0], r: [0, 0, 0] };
    for (let k = 0; k < N; k++) {
      mixer.setTime((k / N) * clip.duration); obj.updateMatrixWorld(true); hipsB.getWorldPosition(h);
      for (const sd of ['l', 'r']) { const [b0, b1] = G[sd]; if (!b0) continue; b0.getWorldPosition(v); if (b1) { const v1 = b1.getWorldPosition(new THREE.Vector3()); v.lerp(v1, 0.5); } grip[sd][0] += v.x / N; grip[sd][1] += v.y / N; grip[sd][2] += v.z / N; }
      let sMin = 1e9; const cv = [];
      for (const m of sk) { m.skeleton.update(); const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i += 2) { m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld); sMin = Math.min(sMin, v.y); maxY = Math.max(maxY, v.y); minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z); cv.push(v.y, v.z); if (k === 0 || k === 2) keep.push(v.x, v.y, v.z); } }
      minY = Math.min(minY, sMin); hx += h.x; hy += h.y; hz += h.z; for (const fb of feetB) { fb.getWorldPosition(v); feet[0] += v.x / (N * feetB.length); feet[1] += v.z / (N * feetB.length); } for (const fb of feetB) { const k = { foot_l: 0, foot_r: 1 }[fb.name]; if (k == null) continue; fb.getWorldPosition(v); ankles2[k][0] += v.x / N; ankles2[k][1] += v.z / N; } for (const fb of feetB.filter((b) => /^foot_/.test(b.name))) { fb.getWorldPosition(v); ankles[0] += v.x / (N * 2); ankles[1] += v.z / (N * 2); }
      // pelvis contact: lowest vertex y near the hips' z (excluding the feet region) = where a seat surface touches
      let c = 1e9; for (let i = 0; i < cv.length; i += 2) if (Math.abs(cv[i + 1] - h.z) < 0.22 && cv[i] > sMin + 0.25 && cv[i] < c) c = cv[i]; contact += c === 1e9 ? h.y - 0.1 : c;
    }
    const r = { minY, maxY, height: maxY - minY, hips: [hx / N, hy / N, hz / N], contact: Math.max(contact / N, hy / N - 0.09), verts: new Float32Array(keep), grip, feet, ankles, ankles2, w: maxX - minX, d: maxZ - minZ, minX, maxX, minZ, maxZ };
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
  /** a standing rider holding a pole: where to stand, which way to face and in which clip, so that the gripping hand (the higher one) closes on the upright pole at
   *  pole {x, z} (the parent's frame). s = {y, ceilAt}; ok(x, z, yaw) vetoes places (the aisle, the doorways, other riders, bags). null if this character cannot.
   *  (review 14: riders were put anywhere, facing anyway, and every hand in a pole or rail clip held air 0.26-1.08 m from the nearest pole) */
  poleSpot(ch, pole, s, ok, rng = this.rng) {
    const out = [];
    for (const clip of ch.pools.pole || []) {
      const m = this.measure(ch, clip), g = m.grip; if (!g) continue; const h = g.l[1] > g.r[1] ? g.l : g.r, hy = h[1] - m.minY; if (hy < 0.75 || hy > 1.85) continue;   // (the pole runs from the floor to 1.95 m)
      for (let k = 0; k < 24; k++) {
        const px = pole.x + (pole.slant ? pole.slant(hy) : 0);   // (where the pole is at the height of the hand: a door pole leans in above 1.26 m - review 15: the raised hand of the pole clip held air 4-14 cm off it)
        const yaw = k * Math.PI / 12, c = Math.cos(yaw), sn = Math.sin(yaw), x = px - (c * h[0] + sn * h[2]), z = pole.z - (-sn * h[0] + c * h[2]);
        if (ok(x, z, yaw)) out.push({ x, z, yaw, clip, pole, hand: h === g.l ? 0 : 1 });
      }
    }
    while (out.length) { const f = out.splice(Math.floor(rng() * out.length), 1)[0]; if (this._fitsStandAt(ch, { x: f.x, y: s.y, z: f.z, yaw: f.yaw, mode: 'pole', ceilAt: s.ceilAt })) return f; }   // (the ceiling test is the slow one: only on the place drawn)
    return null;
  }
  // ------------------------------------------------------------------ people
  clear() { if (this.people.length) this._recent = new Set(this.people.filter((p) => p.char).map((p) => p.char.id)); for (const p of this.people) this._drop(p); this.people.length = 0; }
  _drop(p) { if (p.counted) { p.counted = false; useChar(p.char.id, -1); } if (p.print != null) { releasePrint(p.print); p.print = null; } if (p.pet) { for (const o of [p.pet.root, p.pet.lead, p.pet.lead2].filter(Boolean)) if (o.parent) o.parent.remove(o); p.pet = null; } if (p.obj) undressTee(p.obj); if (p.obj && p.obj.parent) p.obj.parent.remove(p.obj); if (p.mixer) p.mixer.stopAllAction(); p.obj = p.mixer = null; p.gait = null; p.hold = null; }
  _rollPool() {
    // mix: ~10% children, ~3% staff, ~12% skirts/dresses, ~8% kilts/Highland dress, ~35% shorts and leggings (denim, Lycra, chino), the rest (~32%) trousers and jeans:
    // no garment is on more than half of a crowd (research/people-rubric.md, category 6), though 58 of the 99 people in the file wear trousers
    const r = this.rng(); let pool;
    const skirt = (c) => /skirt|dress|sash|highland_dress/.test(c.outfit), kilt = (c) => /kilt|highland/.test(c.outfit) && !skirt(c);
    if (r < 0.10) pool = this.chars.filter((c) => c.kid); else if (r < 0.13) pool = this.chars.filter((c) => c.staff);
    else if (r < 0.25) pool = this.chars.filter((c) => skirt(c) && !c.kid); else if (r < 0.29) pool = this.chars.filter((c) => kilt(c) && !c.kid);   // (people review 1: at 8% of the roll, with the pipers and the school kilts, tartan was a quarter of every platform)
    else { const bare = (c) => /shorts|leggings/.test(c.outfit); pool = this.chars.filter((c) => !c.kid && !c.staff && !skirt(c) && !kilt(c) && bare(c) === (r < 0.72)); }   // (review 2 counted 58-62% trousers on platforms: shorts and leggings now ~43%, trousers ~28% of the draw - review 38 still found trousers over half a platform in 19 of 20 samples, the riders getting off, who sit, being trousers and shorts)
    return pool.length ? pool : this.chars;
  }
  _pick(filter) {   // never the same person twice in a crowd, nor (while the roster allows) twice on screen across crowds: see pickChar
    const own = new Map(); for (const q of this.people) if (q.char) own.set(q.char.id, (own.get(q.char.id) || 0) + 1);
    // nobody who was on the last platform you saw (people review 2: five people stood on all three platforms visited), while the roster allows
    const rec = this._recent, f2 = rec && rec.size ? (c) => !rec.has(c.id) && (!filter || filter(c)) : filter;
    // the mix of what people wear holds round each newcomer, not only on average (review 8: within 15 m shorts were 73 % of one platform, trousers 62-80 % of three
    // others; the rubric allows no garment on more than half)
    // review 10: re-rolling the category still left one garment over half the people near the player in every run (it gave up after four rolls, and counted children
    // apart). Now a group already worn by 45 % of the people within 15 m is left out of the draw while anyone else fits; children count by what they wear.
    const grp = garmentGroup;
    const at = this._pickAt, par = this._pickPar, near = (q) => !at || at.x == null || ((!par || q.parent === par) && Math.hypot(q.x - at.x, q.z - at.z) < 15);   // (in a train: the same car - its riders' x, z are in the car's own frame, and every car's are near (0, 0) - review 14 still counted 55-57 % in one garment in a car)
    const tally = new Map(); let nOwn = 0; for (const q of this.people) if (q.char && q.obj && near(q)) { nOwn++; const g = grp(q.char); tally.set(g, (tally.get(g) || 0) + 1); }
    const full = new Set(); if (nOwn >= 2) for (const [g, n] of tally) if (n + 1 > 0.45 * (nOwn + 1)) full.add(g);
    // and grown-ups of one sex are kept under 58 % of those near by: the skirt, dress and leggings rolls are nearly all women's, and review 62 counted 52 women to 24 men within 60 m
    let nF = 0, nM = 0; for (const q of this.people) if (q.char && q.obj && !q.char.kid && near(q)) { if (q.char.sex === 'f') nF++; else if (q.char.sex === 'm') nM++; }
    const sexFull = nF + nM >= 2 ? (nF + 1 > 0.58 * (nF + nM + 1) ? 'f' : nM + 1 > 0.58 * (nF + nM + 1) ? 'm' : '') : '';
    const okMix = (c) => !full.has(grp(c)) && !(sexFull && !c.kid && c.sex === sexFull), and = (f) => (f ? (c) => okMix(c) && f(c) : okMix);
    let pool = this._rollPool(); for (let k = 0; k < 6 && pool.length && pool.every((c) => full.has(grp(c))); k++) pool = this._rollPool();
    const free = (x) => (x && !(this.unique && IN_USE.get(x.id)) ? x : null), tryF = (f) => free(pickChar(this.chars, pool, f, this.rng, own));   // (an in-use pick is no pick in a unique crowd: try the next)
    const c = ((full.size || sexFull) && ((f2 !== filter && tryF(and(f2))) || tryF(and(filter)))) || (f2 !== filter && tryF(f2)) || pickChar(this.chars, pool, filter, this.rng, own);
    // unique (the game's crowds): nobody is drawn twice while they are anywhere in the page - an empty seat or a thinner platform rather than a twin (review 7: a full train
    // of 75 with 26 on the platform and 12 in the other train is 113 people from a roster of 99, and twins sat in one car)
    // and when nobody left fits but a garment already worn by half of them, the seat or the spot stays empty: the roster has 58 of 99 in trousers, and with everyone in use
    // once (unique) the draw fell back to trousers - review 15 counted 41 of 180 car samples over half one garment, 73 % at worst
    if (c && this.unique && nOwn >= 4 && full.has(grp(c)) && (tally.get(grp(c)) || 0) + 1 > 0.5 * (nOwn + 1)) return null;
    // and likewise one sex: when the draw falls back to a grown-up of the sex already over 58 % near by, the place stays empty (review 64: the player's car ran 10 women to 6 men
    // for the whole ride, over 58 % in 94 % of frames - the unique roster's fallback skipped the check)
    if (c && this.unique && sexFull && !c.kid && c.sex === sexFull && nF + nM >= 4) return null;
    return c && this.unique && IN_USE.get(c.id) ? null : c;
  }
  add(p, parent, filter) {
    if (!this.hasAnim || (this.people.length >= this.max && !p.force)) return p;
    // a person handed over with their look (getting off a train on to this platform, getting on) who is already here in this crowd comes as somebody else: review 6 saw
    // the same people twice on one platform and in one car. Their bag and print go with the look, so they are dropped too.
    if (p.char && this.people.some((q) => q.char === p.char && q.obj)) { p.char = null; p.bag = undefined; p.print = null; p.teeColour = undefined; }
    this._pickAt = p; this._pickPar = parent || null; const ch = p.char || this._pick(filter); this._pickAt = this._pickPar = null; if (!ch) return p; p.char = ch; if (p.onPick) { p.onPick(p, ch); p.onPick = null; } p.counted = true; useChar(ch.id, 1);
    p.lod = !!ch.lodNode; const obj = this._clone(ch, p.lod); obj.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });   // (only the LOD file loaded yet: everybody is drawn from it)
    this._dressTee(p, obj); this._lids(p, obj);
    p.scale = 1; p.ttl = p.ttl ?? Infinity; p.state = p.state || p.mode; if (p.yawT == null) p.yawT = p.yaw; p.sp = p.sp || 0; p.yw = 0;
    p.mixer = new this.THREE.AnimationMixer(obj); p.act = new Map(); p.cur = null; p.yOff = null; p.nextT = 1 + this.rng() * 6;
    p.parent = parent || this.group; p.obj = obj; p.parent.add(obj);
    obj.traverse((b) => { if (b.isBone) b.userData.restPos = b.position.clone(); });   // (each bone's own rest position, before any clip has moved it: what a hand-over's pose blend eases a bone the clip does not move back to - _poseBlend)
    if (p.bag === undefined) { p.bag = this._rollBag(ch); for (let k = 0; k < 3 && p.state === 'pole' && p.bag && p.bag.kind === 'trolley'; k++) p.bag = this._rollBag(ch); if (p.state === 'pole' && p.bag && p.bag.kind === 'trolley') p.bag = null; }   /* (nobody holding a pole has a wheeled case: towed from the hand on the pole, it swung up off the floor and round the rider at 0.2 m a frame, and handed over at the door it jumped to the hand - review 63) */   // (before the first pose is chosen: a bag in the hand rules out typing on a phone)
    this._enter(p, p.state, 0);
    if (p.cur) p.cur.time = this.rng() * p.cur.getClip().duration;
    p.mixer.update(0.0001); p.dirty = false;   // pose the skeleton now (far people are frozen, never in the bind pose)
    if (p.hold) this._holdStep(p, 0, !p.pose);   /* (handed over: the phone comes up from the old body's pose over HOLD_IN; snapped on, it overrode the pose blend and both hands jumped 0.54 - 0.62 m at the door - review 64) */
    if (p.pose) { p.poseFrom = p.pose; p.pose = null; p.poseT = 0; this._poseBlend(p, 0); }
    this.people.push(p); this._place(p, true);
    this._bagOn(p);
    if (ch.id === PET_OWNER) { p.pet = makeHaggis(this.THREE); this._petStep(p, 0); }
    return p;
  }
  /** a person's measurements for a bag (bags.js): taken once from the full-detail model, or from the simplified one until the full one has arrived */
  _bagFit(ch) {
    const src = ch.node ? 'full' : 'lod'; if (ch.bagFit && ch.bagFit.src === src) return ch.bagFit.fit;
    let fit = null; try { fit = fitBody(this.THREE, this._clone(ch, false), ch.metaH || 1.75); } catch (e) { fit = null; }
    ch.bagFit = { src, fit }; return fit;
  }
  /** what this person carries: decided once, and kept while they are on screen (through LOD swaps, and from the platform onto the train: see take) */
  _rollBag(ch) { const fit = this._bagFit(ch), bag = pickBag(this.brng, { kid: ch.kid, staff: ch.staff, kind: ch.kind, outfit: ch.outfit, id: ch.id, pet: ch.id === PET_OWNER, longHair: !fit || fit.longHair || !fit.ok }); return this.bags ? bag : null; }
  _bagOn(p) {
    const old = p.bagRig; p.bagRig = null; if (!p.bag || !p.obj) return;
    // the bag was rolled when the person was first made, maybe on the simplified model, whose decimated hair can miss being long: a rucksack under long hair becomes a tote
    if (p.bag.kind === 'ruck' && !p.char.kid) { const f = this._bagFit(p.char); if (f && f.longHair) p.bag = { kind: 'tote', colour: '#d8cfb8', hand: true }; }
    try { p.bagRig = wearBag(this.THREE, p.obj, p.bag, this._bagFit(p.char), p.char.metaH || 1.75); } catch (e) { p.bagRig = null; }
    if (p.bagRig) stepBag(p.bagRig, p.state === 'sit', p.state === 'pole', true, this._bagHow(p));
    // the same bag on the other model (a near/far swap): it carries on as it was - placed afresh from the new skeleton, which the gait has not posed yet this frame, a towed
    // case flickered 0.2 - 0.5 m for a frame (review 58); and where its wheels trail and were parked in the car, or the case swung 0.34 m back to the rigid towed place (review 66)
    if (p.bagRig && old && old.kind === p.bagRig.kind && old.mesh && p.bagRig.mesh) { p.bagRig.tow = old.tow; p.bagRig.park = old.park; p.bagRig.parkP = old.parkP; p.bagRig.wP = old.wP; p.bagRig.wasDown = old.wasDown; p.bagRig.lw = old.lw; p.bagRig.th = old.th; p.bagRig.carry = old.carry; if (old.where === p.bagRig.where) { p.bagRig.mesh.position.copy(old.mesh.position); p.bagRig.mesh.rotation.copy(old.mesh.rotation); if (old.handle && p.bagRig.handle) p.bagRig.handle.position.copy(old.handle.position); } }
  }
  /** Seated, a skirt or dress hung straight down from the hips as a ring round the knees, the bare thighs inside it (review 9: ya_smile_dress, elder_woman_dress,
   *  teen_skirt). A seated wearer's garment meshes take a second set of skin weights, made once per character and model: below the hips each vertex is
   *  handed over to the thigh on its own side, from nothing at the hip to all of it at the knee, so the cloth lies along the thighs and falls from the knees. */
  _skirtSit(p, on) {
    p.skirtSit = on; p.skirtObj = p.obj; if (!p.obj) return;
    p.obj.traverse((m) => {
      if (!m.isSkinnedMesh || !m.material || !/^cloth_/i.test(m.material.name || '') || /shoe|boot|flats|sock|hose|camisole|top|blouse|shirt|sweater|jacket/i.test(m.material.name)) return;
      const g0 = m.userData.standGeo || m.geometry; m.userData.standGeo = g0;
      if (g0.attributes._seat) return;   // (a garment draped on the seat follows its morph instead: _seatMorph)
      if (!on) { m.geometry = g0; return; }
      let gs = g0.userData.sitGeo;
      if (gs === undefined) { gs = g0.userData.sitGeo = this._sitWeights(m, g0) || null; }
      if (gs) m.geometry = gs;
    });
  }
  _sitWeights(m, g0) {
    const T = this.THREE, sk = m.skeleton, names = sk.bones.map((b) => this.canon(b.name)), ix = (n) => names.indexOf(n);
    const tl = ix('thigh_l'), tr = ix('thigh_r'), cl = ix('calf_l'), cr = ix('calf_r'); if (tl < 0 || tr < 0 || cl < 0 || cr < 0) return null;
    const bindPos = (i) => new T.Vector3().setFromMatrixPosition(sk.boneInverses[i].clone().invert());   // the joint in the mesh's bind space
    const hl = bindPos(tl), hr = bindPos(tr), kl = bindPos(cl), kr = bindPos(cr), hipY = (hl.y + hr.y) / 2, kneeY = (kl.y + kr.y) / 2, midX = (hl.x + hr.x) / 2, sl = Math.sign(hl.x - midX) || 1;
    if (!(hipY - kneeY > 0.1)) return null;
    const g = g0.clone(), P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight; if (!SI || !SW) return null;
    const si = new Float32Array(SI.count * 4), sw = new Float32Array(SW.count * 4);
    // the hand-over is complete at this garment's own hem (a mini ends mid-thigh: ramped to the knee it was half the hips' still, and stood out as a hoop - review 11)
    let hemY = Infinity; for (let i = 0; i < P.count; i++) hemY = Math.min(hemY, P.getY(i)); const endY = Math.max(kneeY, hemY + 0.03);
    const give = (idx, w, b, amt) => { let at = idx.indexOf(b); if (at < 0) { at = w.indexOf(Math.min(...w)); idx[at] = b; w[at] = 0; } w[at] += amt; };
    for (let i = 0; i < P.count; i++) {
      const y = P.getY(i), x = P.getX(i), u = (hipY - 0.02 - y) / Math.max(0.05, hipY - 0.02 - endY), t = u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
      const idx = [SI.getX(i), SI.getY(i), SI.getZ(i), SI.getW(i)], w = [SW.getX(i), SW.getY(i), SW.getZ(i), SW.getW(i)];
      if (t > 0) {
        // near the middle the cloth spans both thighs, shared by how far it lies to each side: split at the middle line it opened between the legs (review 11)
        const bl = Math.min(1, Math.max(0, 0.5 + (x - midX) * sl / 0.09));
        for (let k = 0; k < 4; k++) w[k] *= 1 - t;
        if (bl > 0) give(idx, w, tl, t * bl); if (bl < 1) give(idx, w, tr, t * (1 - bl));
        const sum = w[0] + w[1] + w[2] + w[3]; for (let k = 0; k < 4; k++) w[k] /= sum || 1;
      }
      for (let k = 0; k < 4; k++) { si[i * 4 + k] = idx[k]; sw[i * 4 + k] = w[k]; }
    }
    g.setAttribute('skinIndex', new T.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new T.BufferAttribute(sw, 4));
    return g;
  }
  /** would one more person in ch's garment group make it over half of the people on parent (a car)? (boarders bring their own look: the pick rule never saw them - review 15) */
  mixOver(parent, ch, extra = []) {
    let n = 0, same = 0; const g = garmentGroup(ch); for (const q of this.people) if (q.parent === parent && q.char && q.obj && !q.leaving) { n++; if (garmentGroup(q.char) === g) same++; }   // (one getting off here is not staying - review 18)
    for (const c of extra) { n++; if (garmentGroup(c) === g) same++; }
    if (n + 1 >= 4 && same + 1 > 0.5 * (n + 1)) return true;   // (n + 1: the 3rd and 4th people into a car are checked too - 4 of 4 in trousers for 98 s, review 57)
    // and the grown-ups of one sex kept to 60 % of a car's: the draw's cap holds where the people are drawn, but boarding and alighting changed a car's mix after it, and a car of
    // five grown-ups ran 4 women to 1 man for 118 s (review 67)
    if (ch.kid || !ch.sex) return false; let a = 0, ss = 0; const one = (c) => { if (c && !c.kid && c.sex) { a++; if (c.sex === ch.sex) ss++; } };
    for (const q of this.people) if (q.parent === parent && q.char && q.obj && !q.leaving) one(q.char); for (const c of extra) one(c);
    return a + 1 >= 4 && ss + 1 > 0.6 * (a + 1);
  }
  /** would one more person in ch's garment group make it over half of the people of this crowd within r of (x, z)? (riders getting off on to a platform: review 16 counted
   *  a platform near the player over half one garment in 13 of 65 samples) */
  mixNear(ch, x, z, r = 15) {
    let n = 0, same = 0; const g = garmentGroup(ch); for (const q of this.people) if (q.char && q.obj && Math.hypot(q.x - x, q.z - z) < r) { n++; if (garmentGroup(q.char) === g) same++; }
    return n >= 4 && same + 1 > 0.5 * (n + 1);
  }
  /** would the car be left with one garment over half its people if q (and those already leaving) got off? (riders getting off thinned a car to 7 of 12 in trousers - review 15) */
  mixLeaves(q) {
    const t = new Map(); let n = 0; for (const o of this.people) if (o.parent === q.parent && o.char && o.obj && o !== q && !o.leaving) { n++; const g = garmentGroup(o.char); t.set(g, (t.get(g) || 0) + 1); }
    if (n >= 4) for (const v of t.values()) if (v > 0.5 * n) return true;
    // nor of one sex over 60 % of the grown-ups left, where this one's going makes it worse (see mixOver)
    if (q.char && !q.char.kid && q.char.sex) { let a = 0, f = 0; for (const o of this.people) if (o.parent === q.parent && o.char && o.obj && o !== q && !o.leaving && !o.char.kid && o.char.sex) { a++; if (o.char.sex === 'f') f++; }
      const sh = (k, m) => (m ? Math.max(k, m - k) / m : 0), after = sh(f, a), before = sh(f + (q.char.sex === 'f' ? 1 : 0), a + 1); if (a >= 4 && after > 0.6 && after > before) return true; }
    return false;
  }
  /** is (x, z) in this car (its frame) within r of the bag at a seated rider's feet? (it stands in front of their toes, about half a metre in from the hips) */
  _bagNear(car, x, z, r = 0.5) {
    // where the bag really is (stepBag draws it in front of the toes), in the car's frame; the estimate from the hips missed it (review 13: an ankle in a tote for 15 s)
    const v = this._bv || (this._bv = new this.THREE.Vector3());
    for (const q of this.people) {
      if (q.parent !== car || q.state !== 'sit' || !q.bag || !q.obj) continue; let bx, bz;
      const m = q.bagRig && q.bagRig.mesh; if (m && m.parent) { m.updateWorldMatrix(true, false); m.getWorldPosition(v); car.worldToLocal(v); bx = v.x; bz = v.z; } else { bx = q.x - Math.sign(q.x || 1) * 0.5; bz = q.z; }
      if (Math.hypot(bx - x, bz - z) < r + (q.bag.kind === 'trolley' ? 0.08 : 0)) return true;
    }
    return false;
  }
  /** test hook: give a person a bag by hand ({ kind, colour, hand } or null) */
  /** a person handed over from another crowd (on to a train) keeps their case's tow and lift, and it is placed from there now rather than stood up afresh */
  /** what a case was doing, and where it was in the world, as its owner is handed between the platform's crowd and a car's (old: the rig; the snapshot is taken before the old body is dropped) */
  bagSnap(r) { if (!r || !r.mesh) return null; const T = this.THREE, wp = new T.Vector3(), d = new T.Vector3(0, 0, 1); r.mesh.updateWorldMatrix(true, false); r.mesh.getWorldPosition(wp); d.transformDirection(r.mesh.matrixWorld); return { kind: r.kind, tow: r.tow, lw: r.lw, th: r.th, wp, wy: Math.atan2(d.x, d.z), rx: r.mesh.rotation.x }; }
  bagCarry(p, old) {
    const r = p.bagRig; if (!r || !old || old.kind !== r.kind || r.kind !== 'trolley') return; r.tow = old.tow || 0; r.lw = old.lw || 0; r.th = old.th; r.park = null; p.obj.updateMatrixWorld(true);
    const T = this.THREE, par = r.mesh && r.mesh.parent;
    // a pole rider stands the case where it is: parked at its place beside the leg, it was dragged by the hand as the pose blended, then glided 0.85 m over the floor (review 61)
    if (old.wp && par && (p.state === 'pole' || (old.tow || 0) < 0.5)) { const l = par.worldToLocal(old.wp.clone()); r.park = [l.x, l.z]; r.tow = 0; r.lp = null; }   // (a case standing parked stays standing where it was, and is picked up as the new body walks to it: taken in tow at once, it glided 0.5 - 0.67 m to a leaver's hand over the pose blend - review 65)   // (and lets go of it: left in tow, it followed the hand to the pole, 0.22 m a frame)
    stepBag(r, p.state === 'sit', p.state === 'pole', false, this._bagHow(p));
    // and whatever is left between where the case was and where the new body draws it is eased out over the pose blend (getting off, the case went from standing to towed in one
    // frame and jumped 0.20 - 0.27 m - review 61)
    if (old.wp && par) { r.mesh.updateWorldMatrix(true, false); const now = new T.Vector3(); r.mesh.getWorldPosition(now); const a = par.worldToLocal(old.wp.clone()), b = par.worldToLocal(now.clone()), d = new T.Vector3(0, 0, 1).transformDirection(r.mesh.matrixWorld);
      r.carry = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z, ry: angDiff(Math.atan2(d.x, d.z), old.wy), rx: (old.rx || 0) - r.mesh.rotation.x, t: 0 }; this._bagEase(r, 0); }
  }
  _bagEase(r, dt) { const c = r.carry; if (!c) return; c.t += dt; const u = Math.min(1, c.t / POSE_FADE), w = 1 - u * u * (3 - 2 * u); if (w <= 0.001) { r.carry = null; return; } r.mesh.position.x += c.x * w; r.mesh.position.y += c.y * w; r.mesh.position.z += c.z * w; r.mesh.rotation.y += c.ry * w; r.mesh.rotation.x += (c.rx || 0) * w; }
  _bagSet(p, bag) { dropBag(p.bagRig); p.bag = bag; if (p.gait) { if (p.gait.rig) p.gait.rig.restore(); p.gait = null; } this._bagOn(p); return !!p.bagRig; }
  /** how a wheeled case is handled this frame: towed as far as the person is walking, carried on the stairs */
  _bagHow(p) { if (!p.bagRig || p.bagRig.kind !== 'trolley') return null; const w = p.settleTurn || p.settleGait || (p.leaving && (p.state === 'go' || p.state === 'walk')) || (p.routed && p.state !== 'sit') ? 1 : p.gait ? p.gait.wU : (p.cur && /^walk/.test(p.cur.getClip().name) ? 1 : 0);   /* (a leaver only once they move off: standing still at the door, the parked case glided 0.2 - 0.36 m to the hand with no hand on it - review 64) (stepping round or to a new spot, the case is taken by the handle: left standing, it swept round its owner on the floor untouched - review 52. Waiting at the door to get off, or on a route on or off a train (queuing at the door, the first steps off it - where the tow dipped to 0.75 and back), it is held by the handle too: set down there, it slid 0.34 - 0.95 m across the floor to the hand of the walker who took them over - review 62) */ this._bh = this._bh || {}; this._bh.walk = w; this._bh.lift = !!p.stair; this._bh.turn = !!(p.settleTurn || p.settleGait); this._bh.settle = !p.walking && p.state !== 'walk' && p.state !== 'go'; this._bh.dt = this._bagDt || 1 / 60; return this._bh; }
  /** a case carried up or down the stairs is held up by a bent arm (people review 1: the big case stayed at foot level and ran through the steps) */
  _carryStep(p, dt) { const g = p.gait; if (!g || !p.bagRig || p.bagRig.kind !== 'trolley') return; const c = g.carry || (g.carry = [0, 0]), want = p.stair ? 0.5 : 0; c[0] += (want - c[0]) * (1 - Math.exp(-6 * dt)); if (c[0] < 0.002 && !want) c[0] = 0; }
  /** test hook: set a person's smile by hand (0..1) */
  _smileSet(p, w) { if (p.face) p.face.morphTargetInfluences[0] = w; return !!p.face; }
  /** eyelids (blink.js) for a full-detail clone; the far model has none. Where the eyes are is read once per character. */
  _lids(p, obj) {
    p.lids = null; p.eyes = null; p.face = null; const ch = p.char; if (p.lod || !ch.node) return;
    // the smile (smile.js): one morph target on the character's skin, made once; this clone's skin then carries its own amount of it
    if (ch.smileRig === undefined) { try { ch.smileRig = buildSmile(this.THREE, this._clone(ch, false)) || null; } catch (e) { ch.smileRig = null; } }
    p.face = smileMesh(obj, ch.smileRig);
    if (this.blinks === false) return;
    if (ch.eyeRig === undefined) { try { ch.eyeRig = eyeRig(this.THREE, this._clone(ch, false)); } catch (e) { ch.eyeRig = null; } }
    p.lids = makeLids(this.THREE, obj, ch.eyeRig); if (!p.blink) p.blink = {};
    p.eyes = makeEyes(this.THREE, obj, ch.eyeRig); if (!p.gaze) p.gaze = {};
  }
  /** a T-shirt wearer keeps one chest print and shirt colour (tees.js) for as long as they are on screen, through LOD swaps; given back in _drop */
  _dressTee(p, obj) {
    let tee = false; obj.traverse((m) => { if (m.isMesh && m.material && TEE.test(m.material.name || '')) tee = true; });
    if (!tee) return;
    if (p.print == null) { p.print = takePrint(this.printRng); p.teeColour = teeColour(this.printRng); }
    dressTee(this.THREE, obj, p.print, p.teeColour);
  }
  /** LOD0 (people.glb) near, LOD1 (people_lod.glb, same rig/clips) beyond ~12 m: rebuild the clone and resume the same clip at the same time */
  _swapLod(p, lod) {
    const old = p.obj, par = p.parent, t = p.cur ? p.cur.time : 0, clip = p.curClip, vis = old.visible;
    const fe = p.fadeEnd, fd = p.fadeDur, yF = p.yFrom, pa = p.prevAct, mid = pa && fe && this._clock < fe && fd > 0, prev = mid ? pa.getClip() : null, pt = mid ? pa.time : 0;   // (in the middle of a blend - sitting down, getting up: it carries on across the swap, from where it was)
    par.remove(old); p.mixer.stopAllAction(); p.lod = lod; undressTee(old); const obj = this._clone(p.char, lod); obj.traverse((o) => { if (o.isMesh) o.frustumCulled = false; }); this._dressTee(p, obj); this._lids(p, obj);
    obj.traverse((b) => { if (b.isBone) b.userData.restPos = b.position.clone(); });   // (the new body's own rest, as add() takes it: without it a body swapped to the full model mid hand-over kept every untracked bone at the clip's, and the pelvis popped 4 - 7 cm - review 65)
    p.obj = obj; par.add(obj); obj.visible = vis; p.mixer = new this.THREE.AnimationMixer(obj); p.act = new Map(); p.cur = null; if (p.gait) { p.gait.rig = null; const gb = this._gaitBody(p.char, lod); if (gb) { p.gait.gb = gb; p.gait.g.body = gb.body; } }   // the gait lives on, on the new skeleton
    if (clip) { this._play(p, clip, 0, p.cur ? 1 : (clip.name.startsWith('walk') ? (p.speed ? p.speed / p.char.walkSpeed : 1) : 1)); if (p.cur) { p.cur.time = t; } }
    if (clip && mid && p.cur) { const o = this._action(p, prev); o.enabled = true; o.play(); o.time = pt; p.fadeEnd = fe; p.fadeDur = fd; p.yFrom = yF; p.prevAct = o; p.manFade = { o, n: p.cur }; this._manFade(p); } p.mixer.update(0.0001); p.dirty = false; if (p.hold) { const r0 = p.hold.rig; p.hold.rig = null; this._holdStep(p, 0, false); const r1 = p.hold.rig; if (r0 && r1 && r0.hasSnap && r0 !== r1) { r1.snap.set(r0.snap); r1.hasSnap = true; } }   /* (the hold goes on from where it was, with the pose it rose from: snapped to its end, the hands jumped 0.18 m at a swap during a put-away - review 62) */ this._place(p, true); this._bagOn(p); if (mid && p.manFade) this._floorFeet(p);
  }
  /** a blend carried across a model swap, weighted by hand to the end it would have had (three's own cross-fade cannot be resumed part-way) */
  /** how far a clip change has blended, 0..1: eased (smoothstep), so that a limb the two clips put in different places sets off and comes to rest gently. Three's own cross-fade moves the
   *  weights at a constant rate and stops them dead: a hand coming down from a phone clip moved 5 cm a frame and stopped in one frame (review 61). Every clip change is weighted here. */
  _fadeE(p) { const w = Math.min(1, Math.max(0, 1 - (p.fadeEnd - this._clock) / p.fadeDur)); return w * w * (3 - 2 * w); }
  _manFade(p, end = false) {
    const f = p.manFade; if (!f) return; const e = end ? 1 : this._fadeE(p);
    if (f.olds) { f.n.setEffectiveWeight(f.n0 + (1 - f.n0) * e); for (const [a, w0] of f.olds) a.setEffectiveWeight(w0 * (1 - e)); }   // (every clip still showing at the change goes out together: sum of weights stays 1)
    else { f.n.setEffectiveWeight(e); f.o.setEffectiveWeight(1 - e); }
    if (e >= 1) { if (f.o) f.o.setEffectiveWeight(0); p.manFade = null; }
  }
  _action(p, clip) { let a = p.act.get(clip.name); if (!a) { a = p.mixer.clipAction(clip); a.setEffectiveWeight(0); a.play(); p.act.set(clip.name, a); } return a; }
  _play(p, clip, fade = this.crossfade, speed = 1) {
    if (!clip) return; const n = this._action(p, clip), o = p.cur; if (o === n) { n.timeScale = speed; return; }
    n.timeScale = speed; n.enabled = true;
    p.manFade = null;
    if (o && fade > 0) { const olds = []; for (const a of p.act.values()) { a.stopFading(); if (a !== n && a.getEffectiveWeight() > 0) olds.push([a, a.getEffectiveWeight()]); } const n0 = Math.min(1, n.getEffectiveWeight()); n.reset().play(); if (/^walk/.test(clip.name) && /^walk/.test(o.getClip().name)) n.time = ((o.time / o.getClip().duration) % 1) * clip.duration;   /* (walk to walk: the new walk picks up at the old one's point in the stride - started from its own beginning, the two crossfaded half a stride apart and a far body's foot jumped 0.15 - 0.20 m in a frame - review 64) */ p.manFade = { n, n0, olds }; }
    else { for (const a of p.act.values()) { a.stopFading(); if (a !== n) a.setEffectiveWeight(0); } n.setEffectiveWeight(1); }
    p.prevAct = o && fade > 0 ? o : null;
    p.cur = n; p.curClip = clip; p.m = this.measure(p.char, clip); p.dirty = true; p.fadeEnd = o && fade > 0 ? this._clock + fade : 0; p.fadeDur = fade; p.yFrom = p.yOff;
    if (p.manFade) this._manFade(p);   // (until fadeEnd the pose is a blend of two clips: audits leave it alone)
  }
  /** state -> clip choice (idle variants rotate, phone/talk/pole/fidget when the asset has them) */
  _enter(p, state, fade = this.crossfade) {
    const ch = p.char, r = this.rng; p.state = state;
    let cat = 'idle';
    if (state === 'walk' || state === 'go') cat = 'walk';
    else if (state === 'sit') { const sp = ch.pools.sitphone && !(this.phones && (ch.kid || ch.staff)); cat = r() < 0.4 ? (sp ? 'sitphone' : ch.pools.sitalt ? 'sitalt' : 'sit') : (ch.pools.sitalt && r() < 0.35 ? 'sitalt' : 'sit');; if (sp && this.phones && p.hold && p.hold.target > 0 && /^(text|sit)$/.test(p.hold.kind)) cat = 'sitphone'; }   // (someone texting who sits down goes on texting: put away mid-sit, the phone clip's empty hands showed by the face - review 45)   // (children and staff have no phone to hold, so they do not take the pose of holding one)
    else if (state === 'pole') cat = ch.pools.pole ? 'pole' : 'idle';
    else { const x = r(); cat = ch.kid && ch.pools.fidget && x < 0.2 ? 'fidget' : 'idle'; }   // idle poses, or a phone (below): talk/wave/point read as flailing arms
    // (the looking-about and crossed-leg sits hold a hand out wide: with someone in the next seat it rested on their knee - review 28, in 2 of 3 rides)
    if (state === 'sit' && cat === 'sitalt' && this.people.some((o) => o !== p && o.parent === p.parent && o.state === 'sit' && Math.sign(o.x) === Math.sign(p.x) && Math.abs(o.z - p.z) < 0.75)) cat = 'sit';
    if (state === 'sit' && cat === 'sitalt' && this._seatDraped(ch)) cat = 'sit';   // (a skirt draped on the seat was settled in the plain sit: crossed legs would go through it)
    let clip = (cat === 'walk' && this.gaitOn && this._plainWalk(ch)) || this._clip(ch, cat) || this._clip(ch, state === 'sit' ? 'sit' : 'idle') || ch.pools.idle[0];
    if (state === 'pole' && p.poleClip && (ch.pools.pole || []).includes(p.poleClip)) clip = p.poleClip;   // (the clip the rider was placed for: the other one puts the other hand up, in the air)
    if (clip && /cross/.test(clip.name) && (/pencil|midi/.test(ch.outfit) || (p.bag && p.bag.kind))) clip = this._clip(ch, 'sit') || clip;   // (nor does anyone with a bag standing at their feet: the crossed leg went through it - review 8)   // (a pencil skirt does not cross its legs: it split into flaps - review 5)
    // Standing: the quiet stance is the rule. The other idle clip is a gesture of the whole right arm (the forearm swings through 109 degrees); looped for a whole bout, on a
    // platform of people, it read as arms waving about. It is now an occasional single gesture: one pass of the clip, then back to the quiet stance.
    let once = false;
    if (cat === 'idle' && state !== 'sit' && ch.pools.idle.length > 1) { const quiet = ch.pools.idle.find((c) => /idle_a$/.test(c.name)) || ch.pools.idle[0]; if (clip !== quiet) { if (p.cat === 'idle' && p.curClip === quiet && r() < 0.12 && !(p.bag && p.bag.hand) && !/piper/.test(ch.id)) once = true; else clip = quiet; } }   // (no arm-sweeping gesture with a bag in the hand: it swung the bag up to the chest)
    if (cat === 'fidget') once = true;
    const use = this.phones ? this._phoneUse(p, state, cat) : null;   // who is on a phone: it takes the body of the stock phone clip (head down, or to the ear) and the arms of hold_three.js
    if (use && use.clip) clip = use.clip;
    if (!use && p.hold && p.hold.w > 0 && fade > 0) fade = Math.max(fade, HOLD_OUT + 0.1);  if (!use && p.hold && fade > 0) p.hold.out = Math.max(HOLD_OUT, fade);   // ... nor may the hold let go faster than the clip's arms come down (a 1 s sit: they showed empty by the face for half a second - review 45)   // the phone goes away: the clip's own arms (up by the face, in the stock phone clips) must not drop faster than the hold lets go of them
    const was = p.cat, m0 = p.m;
    this._play(p, clip, fade, cat === 'walk' ? (p.speed ? p.speed / ch.walkSpeed : 1) : 0.9 + r() * 0.2);
    // Walking off from a standing pose: remember the pose that was left. Until the gait has the legs, the height of the body is a blend of that pose's and the gait's (_yOffset); the
    // walk clip being faded in is no part of it: its lowest sole is 12-59 mm lower than any standing clip's (30 characters, every idle / fidget / pole clip; median 28 mm for the idle ones),
    // and the body is placed to put the lowest sole of the clip it is in on the floor, so it hopped 9-25 mm (median 15) at the first step and came back down once the gait had the legs.
    p.cat = cat; if (cat !== 'walk') p.mFrom = null; else if (was !== 'walk') p.mFrom = m0 && was && !was.startsWith('sit') ? m0 : null;
    p.stateT = 0; p.nextT = cat === 'walk' ? 1e9 : once && !use ? clip.duration : 6 + r() * 14; if (use) p.nextT = use.dur; if (cat === 'walk') p.homeYaw = null;
    this._holdTo(p, use);
  }
  // ------------------------------------------------------------------ phones (hold.js: the maths, hold_three.js: the skeleton, phone.js: the phone)
  /** Does this person spend this bout on a phone? Seated: the stock sit_phone clip (cat 'sitphone', already chosen) with a phone in the hands. Standing grown-ups: PHONE_USE of the idle bouts,
   *  a call PHONE_CALL of those, otherwise typing / reading. Walking, riding a pole and children (their arms and eye-lines are not the adults') do not. null, or { kind, clip, dur }. */
  _phoneUse(p, state, cat) {
    const ch = p.char, pr = this.prng;
    if (state === 'sit') return cat === 'sitphone' && !ch.kid && !ch.staff ? { kind: 'sit', clip: null, dur: 8 + pr() * 14 } : null;   // (not with a bag on the lap: the hands and the phone went into it - review 8)
    if (state !== 'stand' || cat !== 'idle' || ch.kid || ch.staff || !ch.pools.phone || pr() >= PHONE_USE) return null;
    const call = pr() < PHONE_CALL, want = call ? /phone_call$/ : /phone_stand$/, find = (a) => a && a.find((c) => want.test(c.name));
    const clip = find(ch.pools.phone) || find(ch.pools0 && ch.pools0.phone); if (!clip) return null;
    const dur = 8 + pr() * 14; if ((p.bag && p.bag.hand) || /piper/.test(ch.id)) return null;   // (a bag in a hand, or the pipes: no phone at all - review 2 saw a holdall hung from the texting hand and a call taken over the pipes; the draws are made all the same)
    return { kind: call ? 'call' : 'text', clip, dur };
  }
  /** start, change or end a person's phone bout (the arms are blended in and out by _holdStep; a change of kind lowers the arms first) */
  _holdTo(p, use) {
    let h = p.hold;
    if (!use) { if (h) { h.target = 0; h.next = null; } return; }
    if (!h) h = p.hold = { kind: use.kind, w: 0, target: 1, next: null, rig: null, variant: Math.floor(this.prng() * PHONE_VARIANTS), cap: false };
    else if (h.kind === use.kind || h.w <= 0.02 || /^(text|sit)$/.test(h.kind) && /^(text|sit)$/.test(use.kind)) { h.kind = use.kind; h.target = 1; h.next = null; } else { h.next = use.kind; h.target = 0; return; }   // (texting standing and seated hold the phone 2-3 cm apart: sitting down, the phone stays out - lowered and raised again, the stock sit_phone clip's empty hands showed between - review 45)
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
    h.w = snap ? h.target : h.target > h.w ? Math.min(h.target, h.w + dt / HOLD_IN) : Math.max(h.target, h.w - dt / (h.out || HOLD_OUT)); if (h.target > 0) h.out = null;
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
    const gs = p.gait, b = p.mFrom || m;   // (b: the pose the person is walking out of while the gait takes the legs over - see _enter - otherwise the clip they are in)
    if (gs && gs.wL > 0) return -b.minY * (1 - gs.wL) - gs.gb.sole * gs.wL;   // under the gait the soles are where the gait puts them (the body is NOT lifted to hide a captured stride's feet)
    if (p.mFrom && this._gaitDue(p)) return -p.mFrom.minY;   // the first walking frame: the gait is made after the person has been placed, and is about to have the legs
    if (!gs && p.poseFrom && p.poseFrom.feet && this.gaitOn) { const gb = this._gaitBody(p.char, p.lod); if (gb) return -gb.sole; }   // handed over standing on the old body's feet: the gait takes the legs at full weight next frame, so the body stands on its soles now (placed by the clip's lowest point first, the body rose 4 - 5 cm in one frame with the feet held, and sank back - review 65's boarder pop)
    return -m.minY;
  }
  /** will the gait take this person's legs? (it is on, they are animated people, and the rig is one it can drive; a rig not yet looked at counts: _gaitStep looks at it next) */
  _gaitDue(p) { return this.gaitOn && !p.static && p.char[p.lod && p.char.lodNode ? 'gbLo' : 'gbHi'] !== null; }
  /** pelvis on the seat top; if that would push the shoes through the floor, shoes win; if the feet would hang, sink the pelvis up to 6 cm into the cushion */
  _sitOff(m, seatRel) { const yA = seatRel - m.contact, feet = yA + m.minY; return feet < 0 ? -m.minY : yA - Math.min(feet, 0.06); }
  /** the haggis of PET_OWNER: follows where its owner was drawn last frame, in the owner's own group; the lead runs to the owner's left hand */
  _petStep(p, dt) {
    const pet = p.pet, o = p.obj, par = o.parent; if (!par) return;
    if (pet.root.parent !== par) { par.add(pet.root); par.add(pet.lead); if (pet.lead2) par.add(pet.lead2); pet.h.v = null; }
    const vis = o.visible && !p.hidden; pet.root.visible = pet.lead.visible = vis; if (pet.lead2) pet.lead2.visible = vis;
    const near = []; for (const q of this.people) if (q !== p && q.obj && q.obj.parent === par && Math.abs(q.obj.position.x - pet.h.x) < 1 && Math.abs(q.obj.position.z - pet.h.z) < 1) { near.push({ x: q.obj.position.x, z: q.obj.position.z }); if (q.state === 'sit') near.push({ x: q.obj.position.x - Math.sin(q.yaw) * 0.45, z: q.obj.position.z - Math.cos(q.yaw) * 0.45 }); }   /* (and a seated rider's feet, half a metre in front: review 32 had it inside a foot for 68 s) */
    followStep(pet.h, { x: o.position.x, z: o.position.z, yaw: p.yaw, sit: p.state === 'sit' }, dt, near, (h) => { if (!p.yAt && this.floor && !this._onFloor(h.x, h.z, 0.15)) { const f = this._toFloor(h.x, h.z, 0.15); h.x = f.x; h.z = f.z; } });   // (on the platform, never in a wall: review 33 had it 60 s inside the wall behind its owner)
    poseHaggis(pet, p.yAt ? p.yAt(pet.h.x, pet.h.z) : p.y);   // (on the stairs, on the tread under it, not at its owner's height: review 33 saw it 0.6 m under the steps)
    if (pet.hand === undefined || pet.handOf !== o) { pet.handOf = o; pet.hand = null; o.traverse((b) => { if (b.isBone && /hand_l$/.test(b.name) && !pet.hand) pet.hand = b; }); }
    const v = this._v;
    if (pet.hand) { o.updateWorldMatrix(true, false); pet.hand.updateWorldMatrix(true, false); par.updateWorldMatrix(true, false); pet.hand.getWorldPosition(v); par.worldToLocal(v); } else v.set(o.position.x, p.y + 0.8, o.position.z);
    poseLead(pet, v.x, v.y, v.z);
  }
  _place(p, snap) {
    const tgt = this._yOffset(p);
    // into or out of a sit the body's height follows the pose's own blend: eased in a quarter of a second, the body sat down before the legs had bent (the feet 22 - 28 cm under
    // the floor) and stood up before they had straightened (the feet 10 - 12 cm off it) - review 44
    if ((!snap || p.manFade) && p.yFrom != null && p.fadeEnd && this._clock < p.fadeEnd && p.fadeDur > 0 && (p.state === 'sit' || p.wasSit)) { const w = this._fadeE(p); p.yOff = p.yFrom + (tgt - p.yFrom) * w; }
    else p.yOff = snap || p.yOff == null ? tgt : p.yOff + (tgt - p.yOff) * 0.25;
    if (!(p.fadeEnd && this._clock < p.fadeEnd)) p.wasSit = p.state === 'sit';
    let x = p.x, z = p.z;
    if (p.state === 'sit' && p.m) { // hips over the seat position (not the root): root = seat - R(yaw) * hipsLocalXZ
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw), hx = p.m.hips[0], hz = p.m.hips[2]; x -= c * hx + s * hz; z -= -s * hx + c * hz;
    }
    if (p.rootOff && p.poseFrom) { const u = Math.min(1, p.poseT / POSE_FADE), w = 1 - u * u * (3 - 2 * u); x += p.rootOff.x * w; z += p.rootOff.z * w; }   // (handed over a little way from where they stood: drawn there first, then eased across)
    p.obj.position.set(x, p.y + p.yOff, z); p.obj.rotation.set(0, p.yaw, 0);
  }
  /** the first-person user (crowd-group local frame): nobody spawns within 2.5 m or in the near view cone, and people step around them */
  setWalker(x, z, yaw, on = true, eyeY = null) { this.walker = on ? { x, z, yaw, eyeY: eyeY == null ? undefined : eyeY } : null; }
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
  /** Doorways of a train standing with its doors open: strips of floor from the platform edge into the car, which only passengers on their way on or off (mode 'go') may use.
   *  Without them boarders stopped and vanished on the platform edge and alighters appeared there. When the doors close, anyone still in a doorway is aboard and is removed. */
  setBays(bays) {
    const had = this.bays && this.bays.length, old = this.bays; this.bays = bays || [];
    if (this.bays.length) { this._exitBays = null; for (const q of this.people) q.bayOut = null; } else if (had) this._exitBays = old;   // (the doorways of a train that has shut its doors stay floor for anyone still in one, until they have walked off: see below)
    if (had && !this.bays.length && this.floor && this.floor.length) for (let i = this.people.length - 1; i >= 0; i--) { const q = this.people[i]; if (q.static || !q.obj || q.stair) continue; this._goNow = false; this._exitNow = false; if (!this._onFloor(q.x, q.z, 0)) {
      // a boarder is aboard (their onArrive puts them in the car); anyone else - someone getting off - steps back on to the platform edge and goes on from there,
      // rather than vanish in the doorway as it shuts (review 22: 4 a run removed in view)
      if (!q.onArrive && q.obj.visible && !q.hidden) { let bx = q.x, bz = q.z, bd = 1e9; for (const f of this.floor) { const x = Math.min(f.x1 - 0.3, Math.max(f.x0 + 0.3, q.x)), z = Math.min(f.z1 - 0.3, Math.max(f.z0 + 0.3, q.z)), d = (x - q.x) ** 2 + (z - q.z) ** 2; if (d < bd) { bd = d; bx = x; bz = z; } }
        q.bayOut = true; if (q.tx == null || q.mode === 'stand') { q.mode = 'walk'; q.revert = 'stand'; q.tx = bx; q.tz = bz; q.stopHere = true; q.wait = 0; q.sp = 0; q.stuckT = 0; q.bestD = 1e9; this._enter(q, 'walk'); } continue; }   // (they walk off it: put there in one frame, review 34 saw a woman jump 0.82 m)
      if (q.onArrive) q.onArrive(q, false); this._drop(q); this.people.splice(i, 1); } }
  }
  _floors() { return this._goNow && this.bays && this.bays.length ? this.floor.concat(this.bays) : this._exitNow && this._exitBays ? this.floor.concat(this._exitBays) : this.floor; }
  _onFloor(x, z, m = 0.22) {
    const F = this.floor && this._floors(); if (!F || !F.length) return true;
    let ok = false; for (const f of F) if (x >= f.x0 + m && x <= f.x1 - m && z >= f.z0 + m && z <= f.z1 - m) { ok = true; break; }
    if (!ok) return false;
    for (const o of this.solid || []) { const cx = Math.min(o.x1, Math.max(o.x0, x)), cz = Math.min(o.z1, Math.max(o.z0, z)); if ((x - cx) ** 2 + (z - cz) ** 2 < 0.25 * 0.25) return false; }
    return true;
  }
  /** nearest point on the platform slab (inset by m): where a streaming passenger heads for when its real destination (stairs, train door) is off the slab */
  _toFloor(x, z, m = 0.3, go = false) {
    const g0 = this._goNow; if (go) this._goNow = true; const F = this.floor && this._floors(); this._goNow = g0; if (!F || !F.length) return { x, z };
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
  /** What the crowd knows of the platform it stands on (crowd frame): { edgeX, S (+1: the platform lies on the +x side of its edge), backX | null (the wall behind, none on an
   *  island), doors: [z] (where the doors stop), entrances: [{x,z}], board: {x,y,z} | null, trainZ: null | z of the train running in, fromZ: 0 | +-1 (the end trains come
   *  from), due: 0..1 }. Set by the game (index.js); the last three change as trains come and go. */
  setSite(site) { this.site = site || null; }
  /** the way someone waiting faces: the track, give or take */
  _faceTrack() { const s = this.site; return (s ? s.S : 1) * Math.PI / 2 + (this.rng() - 0.5) * 1.1; }
  /** A place to wait (waiting.js): the best of a handful of free places in the rect. late 0..1: how soon the train is as this person comes on to the platform; from: where they come from. */
  _waitSpot(rect, opts = {}) {
    const s = this.site, cands = [], self = opts.self || null;
    for (let k = 0; k < 60 && cands.length < 24; k++) { const x = rect.x0 + this.rng() * (rect.x1 - rect.x0), z = rect.z0 + this.rng() * (rect.z1 - rect.z0); if (this._free(x, z, 0.3, self) && !(opts.clearOfUser && this._nearWalker(x, z, 2.5, 3.6))) cands.push({ x, z }); }
    // nobody waits at the foot of a stair: they walk on, clear of the way down for those behind (review 20: 16 of 81 newcomers stopped within 1 m of the last step)
    const feet = ((s && s.entrances) || []).concat(opts.from ? [opts.from] : []), clear = cands.filter((c) => feet.every((f) => Math.hypot(c.x - f.x, c.z - f.z) > 2.2));
    if (clear.length) cands.splice(0, cands.length, ...clear);
    const others = []; for (const q of this.people) if (q !== self && q.obj && !q.static && !q.hidden) { const e = q.arriving && q.path && q.path.length ? q.path[q.path.length - 1] : q.arriving || (q.mode === 'walk' && q.tx != null) ? { x: q.tx, z: q.tz } : q; others.push({ x: e.x, z: e.z }); }   // (someone on the way to a place has taken it)
    const ctx = { others, late: opts.late || 0, wallLover: this.rng(), entrance: opts.from || null };
    if (s) { ctx.edgeDist = (x) => Math.abs(x - s.edgeX); if (s.backX != null) ctx.backDist = (x) => Math.abs(s.backX - x); ctx.doors = s.doors; if (!ctx.entrance && s.entrances && s.entrances.length) ctx.entrance = s.entrances[Math.floor(this.rng() * s.entrances.length)]; }
    return chooseSpot(cands, ctx, this.rng);
  }
  /** the people already waiting when the player comes on to the platform: standing where people stand (see _waitSpot), facing the track */
  populate(n, rect, y, avoid = []) {
    this.avoid = avoid;
    for (let i = 0; i < n && this.people.length < this.max - this.reserve; i++) {
      const c = this._waitSpot(rect, { clearOfUser: true, late: this.rng() ** 2 * 0.5 }); if (!c) continue;
      this.add({ x: c.x, z: c.z, y, yaw: this._faceTrack(), mode: 'stand', rect, speed: 0.9 + this.rng() * 0.35, wait: 0, restT: 40 + this.rng() * 160 });
    }
  }
  /** Someone comes on to the platform to wait for a train: down the stairs (route: points in the crowd frame, each { x, z, rail?, speed? }; yAt(x, z) the height of the
   *  floor along it), then across the platform to a place to wait, where they stop and stand. Without a route they start at `from`. Returns the person, or null. */
  arrive(rect, y, o = {}) {
    if (this.people.length >= this.max - this.reserve) return null;
    const route = o.route || [], from = route.length ? route[route.length - 1] : o.from, start = route.length ? route[0] : o.from;
    const c = this._waitSpot(rect, { late: o.late || 0, from }); if (!c) return null;
    const path = route.slice(1).map((q) => ({ ...q, rail: true, stair: true })).concat([{ x: c.x, z: c.z, speed: 1.0 + this.rng() * 0.3 }]), first = path.shift();
    const p = this.add({ x: start.x, z: start.z, y: o.yAt ? o.yAt(start.x, start.z) : y, yaw: Math.atan2(-(first.x - start.x), -(first.z - start.z)), mode: 'go', tx: first.x, tz: first.z, rail: !!first.rail, stair: !!first.stair, ty: y, speed: first.speed || o.speed || 0.7, delay: o.delay || 0, path, onArrive: () => 'keep', arriving: true, yAt: o.yAt || null, rect });
    if (!p.obj) return null;
    if (p.delay > 0) { p.hidden = true; p.obj.visible = false; }
    return p;
  }
  /** Passengers who step off a train / come down the stairs and vanish at the far end. Both ends are clamped onto the platform slab (the stairs and the train are
   *  off it), and `delay0 + i * 0.5` staggers the batch so it never appears stacked on one spot. */
  stream(from, to, n, y0, y1, spread = 0.4, delay0 = 0) {
    for (let i = 0; i < n && this.people.length < this.max; i++) {
      const f0 = this._toFloor(from.x + (this.rng() - 0.5) * spread, from.z + (this.rng() - 0.5) * spread, 0.3, true), f1 = this._toFloor(to.x + (this.rng() - 0.5) * spread, to.z + (this.rng() - 0.5) * spread, 0.3, true);
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
      q.mode = 'go'; q.revert = null; q.delay = i++ * delayStep + this.rng() * 0.3; { const d = this._toFloor(door(q).x, door(q).z, 0.25, true); q.tx = d.x; q.tz = d.z; }
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
      const f0 = s.fit ? s.fit : s.mode !== 'sit' && s.ceilAt ? (c) => this._fitsStandAt(c, s) : (s.mode === 'sit' ? (c) => this._canSit(c, s) : null);
      const filter = s.mode === 'sit' ? f0 : (c) => !c.kid && (!f0 || f0(c));   // (a child does not stand alone in a car, at a pole or anywhere else: review 33 saw girl_school_kilt by herself at a pole)
      const p = this.add({ ...s, static: true }, parent, filter); if (p.obj) made.push(p);
    }
    return made;
  }
  _canSit(c, s) {   // every vertex of the seated body, in every sit clip, must stay under the ceiling profile and inside the side walls at this seat
    // a knee-length winter coat (punkduck_winter_coat, MakeHuman's rig) balloons into a crumpled shell over the thighs in every sit clip: its wearers stand (review 4)
    if (c.longCoat === undefined) { c.longCoat = false; const n = c.node || c.lodNode; if (n) n.traverse((o) => { if (o.isMesh && o.material && /^cloth_coat\./i.test(o.material.name || '')) c.longCoat = true; }); }
    if (c.longCoat && !this._seatDraped(c)) return false;
    // ... and the skirts and kilts that still break on a seat even with the seated skin weights (_skirtSit): teen_tube's mini balloons from the hips,
    // man_kilt_casual's knee comes through his kilt; the pipers' and boy_kilt's kilts are not yet seen seated. Their wearers stand (review 8 had stood every
    // kilt and five skirts; review 9 then found seated cars were all trousers and shorts)
    if (/^(woman_mini|teen_skirt|teen_tube|elder_woman_dress|adult_beret|woman_coat|man_kilt_casual|man_highland|woman_midi|woman_sash|ya_smile_dress)$/.test(c.id)) return false;   // (reviews 46 - 50: seated, woman_midi's midi skirt was a rigid dome, woman_sash's dress a bell, ya_smile_dress's hem a sheet between the knees - they stand)   // (review 43: woman_coat's skirt split at the crotch with a sheet below the seat, man_kilt_casual's thighs through gaps in the kilt, man_highland's kilt up to a band at the hips)   // (draped, still broken seated - review 42: the minis shred round the thighs, elder_woman_dress's dress rides to the crotch, adult_beret's skirt leaves bare thigh above the boots)
    if (!this._seatDraped(c) && /^(teen_tube|man_kilt_casual|man_highland|adult_piper|boy_kilt|woman_mini|teen_skirt|elder_woman_dress|woman_sash|woman_midi|adult_beret|woman_dress|woman_coat|ya_smile_dress|girl_small|girl_school_kilt)$/.test(c.id)) return false;   // (review 37: let sit again after stills in the viewer looked whole, in the game elder_woman_dress's skirt rode to the hip in stiff flaps and ya_smile_dress's hem hung as a half-disc below the seat - both stand again)   // (review 18: woman_dress torn at the knee, woman_coat showing the underside of her skirt) (review 16: woman_sash's dress a stiff tube with the knee through it, woman_midi's skirt holed at both knees, adult_beret's knees through her pencil skirt)   // (review 11: seated, the short pleated minis stood as a hoop round the hips with the crotch showing, at eye height in the car; review 12: elder_woman_dress's dress parted to the hip)
    // and the soles must reach the floor with the pelvis on the seat: _sitOff lifts a body whose feet would go through the floor, so legs (with heels) too long
    // for this seat would leave the person hovering above it (the audit allows 8 cm). Such a person stands instead.
    if (s.seatY != null) for (const cat of ['sit', 'sitalt', 'sitphone']) for (const clip of c.pools[cat] || []) { const m = this.measure(c, clip); if (s.seatY - s.y - m.contact + m.minY < -SIT_FEET) return false; }
    if (!s.ceilAt) return true; const cs = Math.cos(s.yaw), sn = Math.sin(s.yaw);
    for (const cat of ['sit', 'sitalt', 'sitphone']) for (const clip of c.pools[cat] || []) {
      const m = this.measure(c, clip), yOff = this._sitOff(m, s.seatY - s.y), V = m.verts;
      for (let i = 0; i < V.length; i += 3) { const rx = V[i] - m.hips[0], rz = V[i + 2] - m.hips[2], x = s.x + cs * rx + sn * rz, y = s.y + yOff + V[i + 1]; if (Math.abs(x) > 1.07 || y > s.ceilAt(x) - 0.035) return false; }
    }
    return !!(c.pools.sit && c.pools.sit.length);
  }
  // ------------------------------------------------------------------ riders changing place (used by the game's boarding / alighting: index.js _exchange)
  /** hand a person over to another crowd: they are removed here and what makes them recognisable (who they are, their print and shirt colour) is returned, to be given to add() there */
  /** the pose a person has now (each bone's local rotation and position, by name), for whoever takes them over in another crowd to start from */
  snapPose(q) { if (!q || !q.obj) return null; const m = new Map(); q.obj.traverse((o) => { if (o.isBone && !m.has(o.name)) m.set(o.name, [o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w, o.position.x, o.position.y, o.position.z]); });
    q.obj.updateMatrixWorld(true); const V = this.THREE.Vector3, feet = []; for (const n of ['foot_l', 'foot_r']) { let b = null; q.obj.traverse((x) => { if (!b && x.isBone && x.name.endsWith(n)) b = x; }); if (b) feet.push(b.getWorldPosition(new V())); }
    if (q.state === 'pole' || (q.curClip && /hold_(pole|rail)/.test(q.curClip.name))) m.armUp = true;   // (an arm up on a pole: it comes down over ARM_FADE, not the 0.4 s of the rest - review 65's release whip, 0.6 m in 0.2 s)
    if (feet.length === 2) m.feet = feet;   // (the ankles where the old body DREW them, in the world: the new body's gait plants its feet there - see _plantFrom)
    return m; }
  /** the feet of a body handed over from another crowd, in the new parent's frame ([x, z] per ankle), while its pose is still being blended from the old one. Planted from the new clip's
   *  ankles at the new root instead, the drawn feet were dragged 0.08 - 0.23 m across the floor to them over the 0.4 s blend as the person stepped off the train (review 61) */
  _plantFrom(p) {
    const f = p.poseFrom && p.poseFrom.feet, par = p.obj && p.obj.parent; if (!f || !par) return null;
    par.updateMatrixWorld(true); return f.map((w) => { const v = par.worldToLocal(w.clone()); return [v.x, v.z]; });
  }
  /** handed over from another crowd (getting on or off a train): the new body starts in the old one's pose and where it stood, and goes over to its own in POSE_FADE s.
   *  Made afresh in its own clip's pose, the whole body jumped in one frame at the door - feet 0.20 - 0.44 m, hands up to 0.53 m, 11 of 11 people (review 60) */
  /** end a hand-over's pose blend now: bones whose position the clip does not set go back to their rest */
  _poseEnd(p) { const tr = p._poseTr && p._poseTr.clip === p.curClip ? p._poseTr : null; if (p.obj) p.obj.traverse((o) => { if (o.isBone && o.userData.restPos && !(tr && tr.pos.has(o.name))) o.position.copy(o.userData.restPos); }); p.poseFrom = null; p.rootOff = null; }
  _poseBlend(p, dt) {
    p.poseT += dt; const u = Math.min(1, p.poseT / POSE_FADE), w0 = 1 - u * u * (3 - 2 * u), ua = p.poseFrom.armUp ? Math.min(1, p.poseT / ARM_FADE) : u, wa = 1 - ua * ua * (3 - 2 * ua); if (wa <= 0.001) { this._poseEnd(p); return; }
    const tr = p.curClip ? (p._poseTr && p._poseTr.clip === p.curClip ? p._poseTr : (p._poseTr = { clip: p.curClip, set: new Set(p.curClip.tracks.map((t) => t.name.split('.')[0])), pos: new Set(p.curClip.tracks.filter((t) => /\.position$/.test(t.name)).map((t) => t.name.split('.')[0])) })) : null;
    const Q = this._pq || (this._pq = new this.THREE.Quaternion()), V = this._pv || (this._pv = new this.THREE.Vector3());
    p.obj.traverse((o) => { if (!o.isBone || (tr && !tr.set.has(o.name))) return; const a = p.poseFrom.get(o.name); if (!a) return; const w = ARM_BONE.test(o.name) ? wa : w0; if (w <= 0.001) return; o.quaternion.slerp(Q.set(a[0], a[1], a[2], a[3]), w); if (!tr || tr.pos.has(o.name)) o.position.lerp(V.set(a[4], a[5], a[6]), w); else if (o.userData.restPos) o.position.copy(o.userData.restPos).lerp(V.set(a[4], a[5], a[6]), w); });   // (only bones the clip sets afresh every frame: any other would keep the blend. And position only where the clip sets position: idle_a turns the pelvis but does not move it, so the lerp piled up frame on frame and left a boarder's pelvis at the old body's, 15 cm down - the both-circles audit's woman_scarf. Such a bone is eased from the old body's to its own rest, not left at its rest from the first frame: that popped boarders up 4 - 16 cm at the door - review 64. The rest is read off the body when it is made, before any clip runs: read at the first blend, a clip had already moved the pelvis, and the both-circles audit's woman_scarf stood 16 cm down again; read off the character's template, other bones' rests differed and boarders popped up 8 - 17 cm)
  }
  take(q) { const i = this.people.indexOf(q); if (i < 0) return null; const look = { char: q.char, print: q.print, teeColour: q.teeColour, bag: q.bag, force: true, pose: this.snapPose(q), bagOld: this.bagSnap(q.bagRig) }; q.print = null; this._drop(q); this.people.splice(i, 1); return look; }
  /** a walking passenger who is visible from the first frame and follows a route (points in the crowd's frame); onArrive(p, reached) is called at the end, then they are removed */
  walkOn(look, from, yaw, path, y, onArrive, speed) {
    const p = this.add({ ...look, x: from.x, z: from.z, y, yaw, yawT: yaw, mode: 'go', tx: path[0].x, tz: path[0].z, rail: !!path[0].rail, ty: y, speed: speed || 1.0 + this.rng() * 0.25, delay: 0, path: path.slice(1), onArrive, routed: true });
    return p.obj ? p : null;
  }
  /** a passenger who gives up on their route (the doors closed, or no way through the crowd) is one of the people on the platform again */
  release(q) {
    if (q.hidden || !q.obj) { const i = this.people.indexOf(q); if (i >= 0) { this._drop(q); this.people.splice(i, 1); } return; }
    const any = this.people.find((o) => o.rect); q.rect = q.rect || (any && any.rect); if (!q.rect) { const f = this.floor && this.floor[0]; q.rect = f ? { x0: f.x0 + 0.4, x1: f.x1 - 0.4, z0: f.z0 + 0.4, z1: f.z1 - 0.4 } : { x0: q.x - 2, x1: q.x + 2, z0: q.z - 2, z1: q.z + 2 }; }
    q.mode = 'stand'; q.routed = false; q.arriving = false; q.yAt = null; q.onArrive = null; q.path = null; q.rail = false; q.legR = 0; q.delay = 0; q.tx = null; q.stopHere = false; q.wait = 0; q.sp = 0; q.stuckT = 0; q.speed = 0.9 + this.rng() * 0.35; q.restT = 40 + this.rng() * 160; q.yawT = this._faceTrack(); this._enter(q, 'stand');
  }
  /** end a routed passenger's walk now, wherever they are (the doors are closing on someone already in the doorway) */
  finish(q) { const i = this.people.indexOf(q); if (i < 0) return; if (q.onArrive && q.onArrive(q, false) === 'keep') return this.release(q); this._drop(q); this.people.splice(i, 1); }
  /** a seated rider gets up: into a standing pose while moving to `to` {x,z,yaw} (the aisle in front of the seat), then(p) */
  rise(p, to, dur = 0.9, then = null) {
    if (p.state === 'sit' && p.gait) { if (p.gait.rig) p.gait.rig.restore(); p.gait = null; }   // (a gait left from before they sat would be blended in while the body is still carried out of the seat: both feet slid 21 cm sideways at 2.7 m/s - review 52)
    // standing up: straight up where the feet are, facing the way they sat, then a stepped turn to to.yaw (turned while rising - the whole body spun about 86 degrees in the
    // 0.75 s - each foot glided 30 - 52 cm across the floor - review 47). Where the ceiling will not have them standing there, or the gait cannot step them round, as before.
    if (p.state === 'sit' && !to.plain && (to.mode || 'stand') === 'stand' && this._canStepTurn(p)) {
      const f = this.seatFeet(p.char, { x: p.x, z: p.z, yaw: p.yaw }), at = f && { ...to, x: f.x, z: f.z, yaw: p.yaw };
      if (at && this._fitsStandAt(p.char, at)) { const yaw = to.yaw; return this.rise(p, { ...at, plain: true }, dur, (q) => { if (Math.abs(angDiff(q.yaw, yaw)) > 0.3 && this._canStepTurn(q)) this._stepTurn(q, yaw, then); else if (then) then(q); }); }
    }
    if (p.state === 'sit' && p.m) { const c = Math.cos(p.yaw), s = Math.sin(p.yaw), hx = p.m.hips[0], hz = p.m.hips[2]; p.x -= c * hx + s * hz; p.z -= -s * hx + c * hz; }   // from here on x,z are the root's (see _place)
    const stepIt = p.state !== 'sit' && this._canStepTurn(p);   // (a standing rider moved to a new spot - room made, a pole taken: the gait steps them there; glided, the feet slid 30 - 50 cm - review 47)
    p.mode = to.mode || 'stand'; p.seatY = null; this._enter(p, p.mode, to.plain ? dur : 0.5);   // (plain - straight up where the feet are: the pose blends over the whole rise, the body moving in step; stood in 0.5 s and moved on for 0.9, the feet slid 8 cm)
    p.tween = { lin: !!to.plain, x0: p.x, z0: p.z, a0: p.yaw, x1: to.x, z1: to.z, a1: to.yaw, t: 0, dur, then };
    if (stepIt) { p.static = false; p.settleGait = true; p.yawT = p.yaw; p.tween.a1 = p.yaw; p.tween.then = (q) => this._stepTurn(q, to.yaw, then); }   // (moved facing as they were, then turned by steps: the yaw tweened over feet the gait had pinned twisted the legs 85 - 133 degrees - review 48)
  }
  /** a standing rider sits down on `seat` {x,z,yaw,seatY} */
  /** where a seated person's feet will be (car frame): the seat (the hips) plus the plain sit clip's feet-from-hips, turned to the seat's facing. A boarder walks to here, turns
   *  their back to the seat and sits down without moving their feet (walked to the aisle and slid back into the seat, the feet skated 15 - 50 cm - review 45) */
  seatFeet(ch, seat) {
    const clip = (ch.pools.sit || []).find((c) => /sit_idle/.test(c.name)) || (ch.pools.sit || [])[0]; if (!clip) return null;
    const m = this.measure(ch, clip), dx = m.feet[0] - m.hips[0], dz = m.feet[1] - m.hips[2], c = Math.cos(seat.yaw), s = Math.sin(seat.yaw);
    return { x: seat.x + c * dx + s * dz, z: seat.z - s * dx + c * dz };
  }
  /** half sat (a blend of a standing and a sitting clip) the feet are not where either clip has them: the body's height is a blend too, and the balls of the feet went 4-6 cm
   *  through the floor half way down. Lift the body until the lowest foot bone is FLOOR_BONE above the floor. */
  _floorFeet(p) {
    const bs = this._footBones(p); if (!bs) return; p.obj.updateMatrixWorld(true); const v = this._v; let lo = 1e9;
    for (const o of bs) { o.getWorldPosition(v); p.obj.parent.worldToLocal(v); lo = Math.min(lo, v.y); }
    const under = p.y + FLOOR_BONE - lo; if (under > 0) { p.yOff += under; p.obj.position.y += under; p.obj.updateMatrixWorld(true); }
  }
  _footBones(p) {
    if (!p.obj) return null; const c = p._feetB && p._feetB.obj === p.obj ? p._feetB : (p._feetB = { obj: p.obj, b: [] });
    if (!c.b.length) p.obj.traverse((o) => { if (o.isBone && /^(foot|ball)_[lr]$/.test(o.name) && !c.b.some((x) => x.name === o.name)) c.b.push(o); }); return c.b.length ? c.b : null;
  }
  /** where the feet are now (the mean of the foot and ball bones), in the person's own frame [x, z]: the clip's average is 2 - 5 cm off at any one moment of an idle */
  _feetNow(p) {
    const bs = this._footBones(p); if (!bs) return null;
    p.obj.updateMatrixWorld(true); const v = this._v, inv = this._inv || (this._inv = new this.THREE.Matrix4()); inv.copy(p.obj.matrixWorld).invert(); let x = 0, z = 0;
    for (const o of bs) { o.getWorldPosition(v).applyMatrix4(inv); x += v.x / bs.length; z += v.z / bs.length; }
    return [x, z];
  }
  settle(p, seat, dur = 1.0, then = null) {
    const turn = angDiff(p.yaw, seat.yaw);   // first a turn on the spot, back to the seat (turning while being lowered swung the feet round the hips)
    // the turn is stepped by the gait, as on a platform (a rider is static - no gait - so for the turn and until the gait has let go of the legs, they are not): rotated as a
    // whole about the feet, each foot slid 24 - 53 cm round an arc flat on the floor, a person on a turntable - review 46
    if (Math.abs(turn) > 0.3 && p.state !== 'sit' && this._canStepTurn(p)) { this._stepTurn(p, seat.yaw, (q) => this.settle(q, seat, dur, then)); p.settling = seat; return; }
    if (Math.abs(turn) > 0.3 && p.state !== 'sit') { const f = this._feetNow(p) || (p.m && p.m.feet) || [0, 0], c0 = Math.cos(p.yaw), s0 = Math.sin(p.yaw); p.tween = { pivot: [p.x + c0 * f[0] + s0 * f[1], p.z - s0 * f[0] + c0 * f[1], f[0], f[1]], x0: p.x, z0: p.z, a0: p.yaw, x1: p.x, z1: p.z, a1: seat.yaw, t: 0, dur: 0.3 + 0.3 * Math.min(1, Math.abs(turn) / (Math.PI / 2)), then: (q) => this.settle(q, seat, dur, then) }; p.settling = seat; return; }
    p.settling = null;
    p.mode = 'sit'; p.seatY = seat.seatY; this._enter(p, 'sit', Math.min(1.0, dur));   // (the sit blends in over the move itself: in 0.5 s of a 1 s settle the body squatted in the air ahead of the seat - review 43)
    if (p.m) { const c = Math.cos(p.yaw), s = Math.sin(p.yaw), hx = p.m.hips[0], hz = p.m.hips[2]; p.x += c * hx + s * hz; p.z += -s * hx + c * hz; }   // x,z become the hips' again
    p.tween = { lin: true, x0: p.x, z0: p.z, a0: p.yaw, x1: seat.x, z1: seat.z, a1: seat.yaw, t: 0, dur, then };   // (lin: the hips go back in step with the pose's blend, which is linear: eased, the feet ran 10 cm ahead and back mid-sit)
  }
  /** the stepped turn before sitting down: when they face the seat's way and the last step has landed, they sit (a few seconds at the most, whatever happens) */
  /** a turn on the spot to yaw, stepped by the gait (a rider is static - no gait - so for the turn, and until the gait has given the legs back to the clip, they are not), then cb(p) */
  _stepTurn(p, yaw, cb) { p.static = false; p.settleGait = true; p.yawT = yaw; p.tween = null; p.settleTurn = { yaw, cb, t: 0, done: 0 }; }
  _canStepTurn(p) { return this.gaitOn && p.char[p.lod && p.char.lodNode ? 'gbLo' : 'gbHi'] !== null && !p.settleTurn; }
  _settleTurnStep(p, dt) {
    const w = p.settleTurn; w.t += dt; const g = p.gait && p.gait.g, still = !g || (!g.walking && !g.feet.some((f) => f.mode === 'swing'));
    if (Math.abs(angDiff(p.yaw, w.yaw)) < 0.03) w.done += dt; else w.done = 0;
    const aligned = !g || g.feet.every((f) => Math.abs(angDiff(f.psi, w.yaw)) < 0.45);   // (both feet round too: released with one still 70 - 90 degrees off, the clip swept it 20 - 42 cm - review 48)
    if (!w.rel && ((w.done > 0.25 && still && aligned) || w.done > 2 || w.t > 7)) { w.rel = true; p.gaitRelease = true; p.yawT = w.yaw; }   // faced round: the gait lets go of the legs, standing (GAIT_OUT)...
    if (w.rel && (!p.gait || (p.gait.wL <= 0 && p.gait.wU <= 0) || w.t > 9)) {   /* (the failsafe after the gait has had time to let go: at 4 s, a turn of 140 degrees or more snapped the legs back to the clip in one frame - review 49) */ p.settleTurn = null; p.gaitRelease = false; p.settleGait = false; p.static = true; p.yawT = null; p.yaw += angDiff(p.yaw, w.yaw);   /* (by the short way: set outright, a turn across +-180 degrees made the facing jump a whole turn and the gait spun both feet round in 0.17 s - review 51) */ if (w.cb) w.cb(p); }   // ...then on (sitting down: with the gait still on the legs as the hips went back, the feet slid 13 - 22 cm)
  }
  _tweenStep(p, dt) {
    const w = p.tween; w.t += dt; const u = Math.min(1, w.t / w.dur), k = w.lin ? u : u * u * (3 - 2 * u);
    p.x = w.x0 + (w.x1 - w.x0) * k; p.z = w.z0 + (w.z1 - w.z0) * k; p.yaw = w.a0 + angDiff(w.a0, w.a1) * k; p.dirty = true;
    if (w.pivot) { const [X, Z, fx, fz] = w.pivot, c = Math.cos(p.yaw), sn = Math.sin(p.yaw); p.x = X - (c * fx + sn * fz); p.z = Z - (-sn * fx + c * fz); }   // (a turn on the spot turns about the feet, not the root)
    if (u >= 1) { p.tween = null; if (w.then) w.then(p); }
  }
  setEnabled(on) { if (this.enabled === on) return; this.enabled = on; if (!on) for (const p of this.people) if (p.obj) p.obj.visible = false; }
  update(dt, t, yAt, camWorld) {
    this._bagDt = dt;   // (for the cases: see bags.js's trailer)
    if (this.enabled === false) return;
    const cam = camWorld || null, v = this._v; this._clock += dt; let swaps = 0;
    // LOD0 (~8k tris) only for the nearest few people within ~11 m; everyone else uses the ~2.2k-tri LOD1 model
    let hiSet = null; if (cam) { const arr = []; for (const q of this.people) { if (!q.obj || q.hidden) continue; q.obj.getWorldPosition(v); arr.push([v.distanceTo(cam) - (q.lod ? 0 : 2) - (LOD_POOR.has(q.char.id) ? 8 : 0), q]); } arr.sort((a, b) => a[0] - b[0]); hiSet = new Set(); for (const [d, q] of arr) { if ((hiSet.size >= this.maxHi && d > 6) || d > (this.quality === 'low' ? 11 : 15)) break; hiSet.add(q); } }   // (everyone within 6 m is on the full model whatever the budget: review 4 still saw up to 10 far models within 6 m beside a train) (and at high quality the full model to 15 m, budget allowing: the far model's baked faces split and smear mouths at 11 - 15 m - review 65)
    this._goNow = false; this._exitNow = false; this._separate(dt);
    for (let i = this.people.length - 1; i >= 0; i--) {
      const p = this.people[i]; if (!p.obj) continue;
      if (p.pet) this._petStep(p, dt);
      if (((p.state === 'sit') !== !!p.skirtSit || (p.skirtSit && p.skirtObj !== p.obj)) && this._skirted(p.char)) this._skirtSit(p, p.state === 'sit');
      if (this._skirted(p.char) && this._seatDraped(p.char)) this._seatMorph(p, dt);   // (and again on a new model: swapped between the near and far model, a seated skirt kept its standing weights - review 37's dresses)
      if (p.bagRig && p.obj.visible && (p.bagRig.kind !== 'ruck' || p.state === 'sit' || p.bagRig.where !== 'back')) { if (p.leaving) p.obj.updateMatrixWorld(true); stepBag(p.bagRig, p.state === 'sit', p.state === 'pole', !!(p.lod && p.state === 'sit'), this._bagHow(p)); if (p.bagRig.carry) this._bagEase(p.bagRig, dt); }   // (a far-model rider is not animated every frame: its bones' world matrices can still be the standing bind pose's, which put the lap bag at the chin - review 8. fresh = read them after an update. And for one getting off, whose case is held by the hand at the door: a rider not animated every frame has the hand's world matrix from where the train was, up to 1 km back, and the case was handed over there and flew in to the walker - review 62's fix, caught by its own probe. Only the matrices: stepBag's fresh also sets the tow at once, and the case jumped to the hand in one frame - review 63)
      if (p.face) { let w = 0; if (cam && !p.hidden && p.att && p.att.sm > 0.004) { p.obj.getWorldPosition(v); if (v.distanceTo(cam) < BLINK.range) w = p.att.sm; } if (Math.abs(w - p.face.morphTargetInfluences[0]) > 0.002 || (!w && p.face.morphTargetInfluences[0])) p.face.morphTargetInfluences[0] = w; }
      if (p.eyes && cam && !p.hidden) { p.obj.getWorldPosition(v); if (v.distanceTo(cam) < BLINK.range) { const a = p.att, g = gazeStep(p.gaze, dt, this.rng, { phone: !!p.hold, want: a && a.tgt && a.tgt !== 'about' ? (a.wy || 0) - (a.yaw || 0) : 0 }); if (Math.abs(g.y - p.eyes.y) + Math.abs(g.p - p.eyes.p) > 0.002) p.eyes.set(g.y, g.p); } }
      if (p.lids) { let c = 0; if (cam && !p.hidden) { p.obj.getWorldPosition(v); if (v.distanceTo(cam) < BLINK.range) c = blinkStep(p.blink, dt, this.rng, { sit: p.state === 'sit', phone: !!p.hold }); } if (p.face) c = Math.max(c, 0.2 * p.face.morphTargetInfluences[0]); if (c !== p.lids.c) p.lids.set(c); }   // a real smile narrows the eyes (the cheeks push the lower lids up): without it review 6 read the smiles as faint smirks
      p.stateT += dt; this._goNow = p.mode === 'go'; this._exitNow = false; if (p.bayOut && this._onFloor(p.x, p.z, 0)) p.bayOut = null; this._exitNow = !!p.bayOut;
      if (!p.static) {
        if (p.mode === 'walk') {
          if (p.wait > 0) { p.wait -= dt; p.sp = 0; if (p.wait <= 0) this._enter(p, 'walk'); }
          else {
            if (p.tx == null || arrived(p, Math.hypot(p.tx - p.x, p.tz - p.z))) {
              if (p.revert) this._settle(p);   // finished stepping out of the user's way: back to standing / the queue
              else { p.mode = 'stand'; p.tx = null; p.sp = 0; p.stopHere = false; p.yawT = this._faceTrack(); p.restT = 40 + this.rng() * 160; this._enter(p, 'stand'); }   // it walked to a place to wait: it waits there
            }
            if (p.mode === 'walk' && !(p.wait > 0)) {
              const moved = this._step(p, dt, p.speed * 0.85), dd = Math.hypot(p.tx - p.x, p.tz - p.z);
              this._progress(p, moved, dd, dt, 0.05);
              if ((!moved && !p.standingBack) || p.stuckT > 1.6) { const wasBack = p.standingBack; p.standingBack = false; p.tx = null;   /* (one walking back from the doors keeps trying for a moment: one blocked frame ended the walk at the edge - review 27, 8 of 37) */ p.stopHere = false; p.sp = 0; p.stuckT = 0; if (p.revert) this._settle(p); else { p.mode = 'stand'; p.yawT = this._faceTrack(); p.restT = 40 + this.rng() * 160; this._enter(p, 'stand'); }
                if (wasBack && (p.backTries = (p.backTries || 0) + 1) < 14 && this.site && this.site.edgeX != null && Math.abs(p.x - this.site.edgeX) < 1.0) this.standBack(p, true); else if (!wasBack) p.backTries = 0; }   // boxed in / going nowhere: wait here instead, never shuffle on the spot (but one stuck on the way back from the edge tries another spot, three times: review 33)
            }
          }
        } else if (p.mode === 'stand') {
          // people wait where they stand. Once in a long while one of them moves to another place (never while someone is close to them, or a train is due)
          if (p.restT != null && (p.restT -= dt) < 0 && p.rect && !(p.att && p.att.near) && !(this.site && this.site.due > 0.5)) {
            p.restT = 60 + this.rng() * 180; const c = this._waitSpot(p.rect, { self: p, from: { x: p.x, z: p.z }, late: 0.6 });
            if (c && Math.hypot(c.x - p.x, c.z - p.z) > 1.5) { p.mode = 'walk'; p.tx = c.x; p.tz = c.z; p.wait = 0; p.stopHere = true; p.bestD = 1e9; p.stuckT = 0; p.turnT = 0; p.speed = 0.8 + this.rng() * 0.25; this._enter(p, 'walk'); }
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
            const moved = p.rail ? this._railStep(p, dt, p.speed) : this._step(p, dt, p.speed, p.blockT > 0.8 ? 2 : 1);   // walks round people and furniture; only a person truly boxed in for a moment goes through
            p.blockT = moved ? 0 : p.blockT + dt; if (p.yAt) p.y = p.stair ? p.yAt(p.x, p.z) : p.ty ?? p.y; else if (yAt) p.y = yAt(p.x, p.z, p.y);
            const dd = Math.hypot(p.tx - p.x, p.tz - p.z);   // progress-based watchdog: sliding along a wall without getting closer is being stuck too
            this._progress(p, moved, dd, dt, 0.03); if (p.stair) p.stuckT = 0;   // (on the stairs there is nowhere else to go: wait for the person in front)
            if (dd < (p.legR || 0.35) && p.path && p.path.length) { const n = p.path.shift(); p.tx = n.x; p.tz = n.z; p.rail = !!n.rail; p.stair = !!n.stair; p.legR = n.r || 0; if (n.speed) p.speed = n.speed; p.bestD = 1e9; p.stuckT = 0; p.turnT = 0; p.stopHere = !p.path.length && !!p.onArrive; }   // the next leg of a route (door, aisle, seat)
            else if (dd < (p.onArrive ? 0.12 : 0.35) || p.stuckT > (p.routed && p.onArrive ? 6 : 2.5)) {   /* (one getting off, held up, joins those waiting after 2.5 s as anyone else does: review 23 saw them stand frozen for 6 s first) */ if (p.onArrive && p.onArrive(p, dd < 0.6) === 'keep') { this.release(p); continue; } if (!p.onArrive && dd >= 0.35 && p.obj.visible && !p.hidden && this._onFloor(p.x, p.z, 0)) { this.release(p); continue; } this._drop(p); this.people.splice(i, 1); continue; }   // (stuck in plain view on the platform - someone getting off, held up on the way to the stairs - they stand there, one of the people waiting, rather than vanish: review 22, 27 in 10 runs)
          }
        }
      }
      if (p.madeWayT > 0) p.madeWayT -= dt;
      if (!p.hidden && p.obj.visible) this._attend(p, dt);   // (riders too, though they are static: review 3 counted no smile and no look round in 1512 rider samples)
      if (!p.static) this._turn(p, dt); if (p.tween && (p.static || p.settleGait)) this._tweenStep(p, dt);
      if (p.settleTurn) this._settleTurnStep(p, dt);
      if (p.settleGait && p.state === 'sit' && (!p.gait || (p.gait.wL <= 0 && p.gait.wU <= 0))) { p.settleGait = false; p.static = true; p.yawT = null; }   // (the gait has let go of the legs: a rider again)
      // idle-variant rotation (phone / talk / look / fidget ...)
      if (p.state !== 'walk' && p.state !== 'go' && p.stateT > p.nextT && p.obj.visible) this._enter(p, p.state);
      this._pace(p, dt);
      this._place(p, false);
      let dist = 0; if (cam) { p.obj.getWorldPosition(v); dist = v.distanceTo(cam); }
      if (cam && hiSet && p.char.lodNode && p.char.node && (swaps < 4 || (p.lod && dist < 6.5)) && !p.hidden) {   /* (in the middle of sitting down or getting up too: the blend is carried across - review 44's boarder who sat on air was the clip restarted at full weight; held back to the end of the blend, the far model stayed in use at 6-7 m - review 45) */ const wantLod = !hiSet.has(p); if (wantLod !== !!p.lod) { this._swapLod(p, wantLod); swaps++; } }   // (anyone within 6.5 m on the far model swaps at once: review 3 saw everyone near on it for half a second after boarding)
      if (!p.hidden) p.obj.visible = dist < this.rVis;
      const gw = p.gait && p.gait.g, animate = (dist < this.rAnim || p.v > 0.2 || ((p.state === 'walk' || p.state === 'go') && !p.paused) || (gw && (gw.walking || gw.wk > 0 || p.gait.wU > 0)) || (p.fadeEnd && this._clock < p.fadeEnd + 1)) && p.obj.visible, upd = animate || p.dirty, hold = p.hold;
      if (upd && p.look) p.look.restore();
      if (upd && hold && hold.rig) hold.rig.restore();   // the layers come off in the reverse order they went on: the hold's (arms, phone), then the gait's, leaving the mixer's own pose on the bones before it advances (see gait_three.js)
      if (upd && p.gait && p.gait.rig) p.gait.rig.restore();
      if (p.manFade) this._manFade(p);
      if (animate) { p.mixer.update(dt); p.dirty = false; if (p.poseFrom) this._poseBlend(p, dt); if (this.gaitOn && !p.static) { this._carryStep(p, dt); this._gaitStep(p, dt); } else if (this.gaitOn && (p.state === 'stand' || p.state === 'pole' || p.gait) && !(p.tween && !p.settleGait && !p.gait)) this._gaitStep(p, dt);   /* (not while a rider is carried by a tween with no gait of their own - standing up out of a seat: made then, it skated a foot 24 - 39 cm as the body left the seat - review 50) */   /* (a standing rider too: the idle clips turn the pelvis but never move it, so the shoes slid 8 - 12 cm side to side together every few seconds - review 49; planted by the gait they stay, and step when the body has drifted off them) */ } else if (p.dirty) { if (p.manFade) this._manFade(p, true); p.mixer.update(this.crossfade + 0.05); p.dirty = false; }
      // (a far person is animated until the walk has wound down and the clip's fade is over, and for a second after any clip change, so the feet step to the new stance: frozen at the moment they slowed below
      // 0.2 m/s, then switched to the idle clip with the gait stripped off, the hand jumped 0.28 - 0.35 m in one frame - review 60's grip snap at a stop, caught 40 m out at Partick; the gait re-applied in no time over the new clip instead held a 0.28 m straddle; and anyone setting off: frozen until 0.2 m/s, the first step was caught up in one frame, a 0.12 - 0.15 m foot pop at half of all far starts - review 61)
      if (p.poseFrom && !animate) { this._poseEnd(p); p.dirty = true; }   /* (dropped part-way - not animated now - the bones the clip never moves go back to their rest: left as the blend had them, a boarder made far off kept the old walker's pelvis and stood 15 cm into the floor - the both-circles audit's woman_scarf) */   // (the blend itself goes on before the gait, above: done after it, it pulled the legs the gait had planted on the old body's feet back towards the old pose, and the feet slid 0.1 - 0.3 m - review 61)
      if (upd && p.fadeEnd && this._clock < p.fadeEnd && (p.state === 'sit' || p.wasSit)) this._floorFeet(p);
      if (hold && upd) this._holdStep(p, dt, !animate);
      if (upd) this._fingers(p, dt, !animate);
      // the look goes on after the hold (put on first, it sent a texting arm to 97% of full stretch at a full turn of the head). Someone holding a phone turns head and neck only: the shoulders, and so the hands, stay put
      if (animate && p.att && dist < 14) {
        const a = p.att, still = p.state !== 'walk' && p.state !== 'go', chest = still && dist < 8 ? Math.sin(a.breath) * 0.011 + a.bob * 0.03 : 0, pitch = a.pitch - (a.drop || 0) * 0.13;
        if (Math.abs(a.yaw) > 0.004 || Math.abs(pitch) > 0.004 || chest) { if (!p.look || p.look.obj !== p.obj) p.look = new LookRig(this.THREE, p.obj); const e = hold && hold.w > 0 ? hold.w * hold.w * (3 - 2 * hold.w) : 0, hk = 1 - e * (hold && hold.kind === 'call' ? 0.7 : 0); p.look.apply(a.yaw * hk, pitch * hk, chest * (1 - e), 1 - e); }   // (held to the hold's own eased weight: switched on whole when the weight fell under 0.02, the shoulders turned back with the head in one frame and the hand jumped 0.12 m as the phone went away - review 61)
      }
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
  /** Fingers. The clips leave the hands nearly flat (a quarter of a radian over three joints), which reads as an open, offering palm on a swinging arm. A hand at
   *  rest hangs half closed, and a hand on a handle is closed round it. This goes on after the mixer (which writes the fingers afresh at every update): relaxed
   *  for both hands, a grip for the hand with a bag or a case handle in it. A hand on a phone, a pole or a rail, waving or pointing keeps the clip's own fingers. */
  _fingers(p, dt, snap) {
    const clip = p.cur ? p.cur.getClip().name : '', onPole = p.poleAt && p.poleHand != null && /pole|rail/.test(clip), ph = p.hold && p.hold.w > 0.02 ? p.hold : null; if ((/phone|wave|point/.test(clip) && !ph) || (/pole|rail/.test(clip) && !onPole)) return;   // (a hand on a pole is closed round it: review 15 saw an open claw)
    let f = p.fing; if (!f || f.obj !== p.obj) f = p.fing = this._fingerRig(p.obj, f); if (!f.ok) return;
    const rg = p.bagRig, gh = rg && p.obj.visible ? rg.gh : -1, held = p.hold && p.hold.w > 0;
    for (let s = 0; s < 2; s++) {
      if (held && !ph) continue;
      // a phone is held with the fingers bent round its edges, not on a flat open hand (review 35/36): a call in the right hand
      const want = ph ? (ph.kind === 'call' ? (s === PHONE_SIDE ? 0.55 * ph.w : 0) : 0) :   /* (texting: the fingers stay flat on the phone's back - bent, they left it floating over them, review 39) */ gh === s || (onPole && p.poleHand === s) ? 1 : 0; f.c[s] = snap || f.c[s] < 0 ? want : f.c[s] + (want - f.c[s]) * Math.min(1, dt * 7); const c = f.c[s], q = this._fq || (this._fq = new this.THREE.Quaternion()), X = this._fx || (this._fx = new this.THREE.Vector3(1, 0, 0));
      for (const b of f.side[s]) { const a = b.rel + (b.grip - b.rel) * c; b.bone.quaternion.copy(b.rest).multiply(q.setFromAxisAngle(X, a)); }
    }
  }
  _fingerRig(obj, old) {
    const T = this.THREE, f = { obj, ok: false, side: [[], []], c: old ? old.c : [-1, -1] }; let skel = null; obj.traverse((o) => { if (!skel && o.isSkinnedMesh) skel = o.skeleton; }); if (!skel) return f;
    const restW = new Map(), m = new T.Matrix4(); skel.bones.forEach((b, i) => restW.set(b, m.clone().copy(skel.boneInverses[i]).invert()));
    const REL = { index: [0.30, 0.42, 0.26], middle: [0.38, 0.50, 0.30], ring: [0.46, 0.56, 0.34], pinky: [0.52, 0.60, 0.36], thumb: [0.10, 0.16, 0.20] }, GRIP = { index: [1.05, 1.20, 0.65], middle: [1.10, 1.25, 0.70], ring: [1.12, 1.25, 0.70], pinky: [1.12, 1.22, 0.70], thumb: [0.22, 0.45, 0.50] };
    for (const b of skel.bones) {
      const k = /^(index|middle|ring|pinky|thumb)_0([123])_([lr])$/.exec(b.name); if (!k || !restW.has(b.parent)) continue;
      const loc = m.clone().copy(restW.get(b.parent)).invert().multiply(restW.get(b)), rest = new T.Quaternion().setFromRotationMatrix(loc);
      f.side[k[3] === 'l' ? 0 : 1].push({ bone: b, rest, rel: FINGER_SIGN * REL[k[1]][k[2] - 1], grip: FINGER_SIGN * GRIP[k[1]][k[2] - 1] });
    }
    f.ok = f.side[0].length > 0; return f;
  }
  _gaitOpts(p) {
    const id = p.char.id, n = this._gcount[id] = (this._gcount[id] || 0) + 1, r = mulberry32(G.seedOf(id) + 977 * n), tab = ARM_OUT[id];
    const bg = p.bag && p.bag.hand ? p.bag.kind : '', ao = ((tab && tab.walk) || [8, 8]).slice(); if (bg === 'trolley') ao[0] += 7;   // (the left hand carries: bags.js)
    return { armOut: ao, hold: [bg === 'trolley' ? 1 : /case|holdall|shopper/.test(bg) ? 0.8 : bg ? 0.35 : 0, 0], trail: [bg === 'trolley' ? 22 : 0, 0], seed: (G.seedOf(id) + 7919 * n) >>> 0,
      var: { arm: (0.8 + 0.4 * r()) * (p.char.elder ? 0.7 : p.char.kid ? 1.15 : 1), elbow: (0.7 + 0.6 * r()) * (p.char.elder ? 0.8 : p.char.kid ? 1.2 : 1), bob: 0.9 + 0.2 * r(), sway: 0.85 + 0.3 * r(), yawBias: (r() - 0.5) * 3, cad: (0.95 + 0.1 * r()) * (/pencil/.test(p.char.outfit) ? 1.1 : 1) * (p.char.elder ? 1.04 : 1), wid: (0.75 + 0.55 * r()) * (p.char.elder ? 1.25 : 1), stoop: p.char.elder ? 4 + 4 * r() : 0 } };
  }
  /** One frame of the gait, after the mixer: the gait is told where the person is (position, heading, the ground speed they actually covered) and writes over the clip's pose.
   *  Two layers, with their own weights (gait_three.js): the upper body (pelvis, trunk, head, arms; wU) is the gait's while the person walks and for GAIT_TAIL after the last step
   *  (the arms settle), then goes back to the clip; the legs (wL) are the gait's from the first step for good, solved against whatever pelvis the person has, so the feet that were
   *  planted stay planted whatever the idle clips do, and a person who turns on the spot re-plants them with steps. Hands stay with the clip. */
  /** where the person's ankles are now, as drawn (the parent's frame, [x, z] each), for a gait to plant its feet on; null if the bones cannot be read */
  _clipAnkles(p) {
    const o = p.obj, par = o && o.parent; if (!par) return null;
    o.updateMatrixWorld(true); const v = this._v, out = [];
    for (const n of ['foot_l', 'foot_r']) { let b = null; o.traverse((x) => { if (!b && x.isBone && x.name.endsWith(n)) b = x; }); if (!b) return null; b.getWorldPosition(v); par.worldToLocal(v); out.push([v.x, v.z]); }
    return out;
  }
  _rootOffNow(p) { if (!(p.rootOff && p.poseFrom)) return [0, 0]; const u = Math.min(1, p.poseT / POSE_FADE), w = 1 - u * u * (3 - 2 * u); return [p.rootOff.x * w, p.rootOff.z * w]; }
  _gaitStep(p, dt) {
    const ro = this._rootOffNow(p), X = p.x + ro[0], Z = p.z + ro[1];   // (where the body is DRAWN: handed over, it is drawn where the old body stood and eased across - told the gait it was already at its new spot, the planted feet jumped 0.12 m and glid back - review 61)
    const walking = (p.state === 'walk' || p.state === 'go') && !p.paused, standing = (p.state === 'stand' || p.state === 'pole' || !!p.paused || (p.settleGait && p.state !== 'sit')) && !p.gaitRelease; let gs = p.gait;   // (gaitRelease: turned to sit down, the legs go back to the clip before the sit starts)
    if (!gs) {
      if (!walking && !standing) return;   // (anyone standing has the gait on the legs: their feet stay planted while the clip sways the body)   // nobody who has neither walked nor is about to pivot needs it; one who pivots on the spot does (the idle clip's feet turn with the body)
      const gb = this._gaitBody(p.char, p.lod); if (!gb) return;
      const opts = this._gaitOpts(p); gs = p.gait = { g: G.newGait(gb.body, { ...opts, plantAt: this._plantFrom(p) || this._clipAnkles(p) }),   // (handed over: the legs are the gait's from the first frame, on the feet the old body stood on; eased in from the clip, the clip's legs dragged them)
      opts, gb, wU: 0, wL: p.poseFrom && p.poseFrom.feet ? 1 : 0, hold: walking ? 0 : GAIT_TAIL, rig: null, phase: 0, t: this._clock, px: X, pz: Z, py: p.yaw };
    }
    if (this._clock - gs.t > 0.3 || Math.hypot(X - gs.px, Z - gs.pz) > 0.6) { gs.opts.seed = (gs.opts.seed + 0x9e3779b1) >>> 0; gs.g = G.newGait(gs.gb.body, { ...gs.opts, plantAt: this._clipAnkles(p) }); gs.px = X; gs.pz = Z; gs.py = p.yaw; }   // not seen for a while / moved bodily (not walked): plant afresh
    { const quiet = p.settleGait && p.state !== 'pole' ? (p.char.pools.idle || []).find((c) => /idle_a$/.test(c.name)) : standing && p.curClip && !/^walk/.test(p.curClip.name) ? p.curClip : null; gs.g.standAt = quiet ? this.measure(p.char, quiet).ankles2 : null; }   // (a stepped turn ends standing where the idle clip has its feet: the hand-back to the clip slid a foot 35 - 39 cm - review 47)
    if (walking) gs.hold = 0; else gs.hold += dt;
    gs.wU = walking || gs.hold < GAIT_TAIL ? Math.min(1, gs.wU + dt / GAIT_IN) : Math.max(0, gs.wU - dt / GAIT_OUT);
    gs.wL = walking || standing ? Math.min(1, gs.wL + dt / GAIT_IN) : Math.max(0, gs.wL - dt / GAIT_OUT); gs.t = this._clock;
    if (gs.wU <= 0 && gs.wL <= 0) { gs.g.placed = false; gs.g.walking = false; gs.px = X; gs.pz = Z; gs.py = p.yaw; return; }   // by clip again: the next walk plants its feet where the person stands then
    const n = Math.min(4, Math.max(1, Math.ceil(dt * 30))), dy = angDiff(gs.py, p.yaw), stopD = p.stopHere && p.tx != null && walking ? Math.max(0, Math.hypot(p.tx - p.x, p.tz - p.z) - STEER.ARR) : null;   // metres to go to the place where it will stand (steer.js brakes to rest ARR short of it)
    for (let i = 1; i <= n; i++) { const f = i / n; G.gaitUpdate(gs.g, dt / n, { x: gs.px + (X - gs.px) * f, z: gs.pz + (Z - gs.pz) * f, yaw: gs.py + dy * f, v: p.v, walking, stopD }); }
    gs.px = X; gs.pz = Z; gs.py = p.yaw;
    if (!gs.rig) gs.rig = new GaitRig(this.THREE, p.obj, gs.gb);
    const T = G.gaitTargets(gs.g), sol = gs.wU > 0 ? G.gaitSolve(gs.g, T) : null; let legs = sol;
    if (!sol || gs.wU < 0.999) {   // the legs reach for their planted feet from the pelvis the person really has: the clip's, or the blend of the clip's and the gait's
      let pel = gs.rig.clipPelvis();
      if (sol) { const c = pel, w = gs.wU, b = sol.pelvisW; pel = { pos: [c.pos[0] + (b.pos[0] - c.pos[0]) * w, c.pos[1] + (b.pos[1] - c.pos[1]) * w, c.pos[2] + (b.pos[2] - c.pos[2]) * w], q: G.qslerp(c.q, b.q, w) }; }
      legs = G.gaitSolve(gs.g, T, { legsOnly: true, pelvis: pel });
    }
    let wArm = gs.wU; if (p.poseFrom && p.poseFrom.armUp) { const ua = Math.min(1, p.poseT / ARM_FADE); wArm = Math.min(wArm, ua * ua * (3 - 2 * ua)); }   // (the walk's arm swing comes in as the pole arm comes down, not over GAIT_IN: that dropped the hand 0.6 m in 0.2 s - review 65)
    gs.rig.apply(sol, gs.wU, legs, gs.wL, wArm); gs.phase = gs.g.phase;
  }
  /** ground speed (m/s) at which the walk cycle's planted foot does not slip: on the real skinned soles the mean contact-point speed over the stance is the asset's own
   *  `walkSpeedMps` x ~1.07 (adults 1.02-1.10, children 1.06-1.09 across the rigs), so nothing needs measuring at run time */
  _strideOf(ch) { return ch.walkSpeed * 1.07; }
  /** stride matching: the walk cycle's playback rate follows the speed the person ACTUALLY moved this frame (steering, separation, the user's
   *  body-avoidance shove and wall slides all included), so planted feet stay planted instead of skating. */
  _pace(p, dt) {
    if (p.px == null || !(dt > 0)) { p.px = p.x; p.pz = p.z; p.v = 0; return; }
    // standing (held up): the crowd's little nudges are not taken - feet planted in the standing pose do not slide (review 24: 16 of 30 pauses slid over 10 cm,
    // up to 0.41 m). How far the crowd asked them to move decides when they walk on.
    p.intent = Math.hypot(p.x - p.px, p.z - p.pz) / dt;
    if (p.paused && !p.static && p.intent < 0.5) { p.x = p.px; p.z = p.pz; }
    const v = Math.hypot(p.x - p.px, p.z - p.pz) / dt; p.px = p.x; p.pz = p.z;
    p.vRise = v > p.v + 0.02 ? (p.vRise || 0) + dt : 0;   // (how long the speed has been rising, frame on frame: a walk-off, not a queue's nudge)
    p.v = v > 4 ? 0 : p.v + (v - p.v) * Math.min(1, dt * (v < 0.7 && p.v < 0.7 && !(p.vRise > 0.066) ? 4 : 12));   // teleports are not walking   (shuffling in a queue the crowd's nudges come and go frame to frame: smoothed at 12/s there, the speed flicked 0.16 - 0.41 - 0.20 m/s and the planted foot stepped 5 cm a frame - review 65; but a speed rising for more than two frames is a walk-off and is followed at once: eased at 4/s, the gait was told 0.37 m/s of a body doing 0.62, and its feet fell behind - review 66)
    if (p.v > 0.15 && p.hold && p.hold.target > 0 && p.state !== 'sit' && !p.settleTurn && !p.settleGait) this._holdTo(p, null);   // moving off (stepping aside for someone, shuffled along): the phone goes away (not the slide back into a seat: that put the phone away for good and left the sit_phone clip cupping nothing - review 45)
    if ((p.state === 'walk' || p.state === 'go') && p.cur) {
      // held up (a jam on the way to the doors): after half a second still, they stand - feet together, the quiet stance - and walk on when there is room. Left in the walk
      // with no speed, the stride froze half taken with the arms mid-swing for seconds at a time (review 19: 1.4 - 5.1 s, a bent-knee half stride in a crowd)
      if (p.v < 0.08) p.stillT = (p.stillT || 0) + dt; else if (p.v > 0.15) p.stillT = 0;
      p.pauseT = p.paused ? (p.pauseT || 0) + dt : 0;
      p.goT = p.paused ? 0 : (p.goT == null ? 9 : p.goT + dt);   // (how long since they last walked on)
      // (in sooner, out only on a clear move after a moment: review 20 saw a crawling jam flick between the two up to 39 times a minute)
      const still = !p.static && (p.paused ? !((p.intent > 0.25 && p.pauseT > 1.5) || p.intent > 0.5) : p.stillT > 0.3 && p.goT > 1.0);   /* (out only after 1.5 s: at 0.8 a jam stopped and started up to 50 times a minute - review 37; held walking longer than 1 s, walkers froze in the walk clip instead) */   // (and once on the move, a moment before they stop again: review 33 counted 47 stops and starts a minute)   // (but moved along briskly, they walk at once: review 21 saw a pushed walker glide 0.42 m in the standing pose)
      if (still !== !!p.paused) { p.paused = still; if (!still) p.stillT = 0;   /* (walking on, the stillness that stopped them is spent: left at 0.3 s or more it stopped them again the next frame, before the smoothed speed had reached 0.15) */
         const ch = p.char, quiet = ch.pools.idle.find((c) => /idle_a$/.test(c.name)) || ch.pools.idle[0]; this._play(p, still ? quiet : (this.gaitOn && this._plainWalk(ch)) || this._clip(ch, 'walk') || quiet, 0.4); }
      if (!p.paused && p.cur) p.cur.timeScale = Math.min(1.8, p.v / this._strideOf(p.char));
    } else if (p.paused) p.paused = false;
  }
  /** a boxed-in passenger may squeeze past people (closer than the 0.45 m everyone else keeps) but not through them: no step ends inside 0.3 m of anyone, unless it moves
   *  away from them (gp7: alighters in a crush passed 0.07 m apart, centre to centre) */
  _core(p, nx, nz, R = 0.3) {
    for (const q of this.people) { if (q === p || q.hidden || !q.obj || q.static) continue; const dn2 = (q.x - nx) ** 2 + (q.z - nz) ** 2; if (dn2 < R * R && dn2 < (q.x - p.x) ** 2 + (q.z - p.z) ** 2) return false; }
    return true;
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
    sp *= this._paceK(p); sp = Math.min(sp, (p.char ? p.char.walkSpeed : 1.3) * 1.3);   // never faster than the walk cycle can plausibly cover (stride matching handles the rest)
    const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz); if (d < 1e-4) return true;
    const ok = (x, z) => (lvl === 2 ? this._onFloor(x, z, 0.12) && this._core(p, x, z) : this._freeStep(p, x, z, lvl === 1 ? 0.12 : 0.22));
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
  /** A step along a leg of a route through a doorway or down a car's aisle (a path point marked rail): straight for the point, with the same turning and braking as any walker, but
   *  no steering round things - the platform's floor map does not reach in there, and a veer would be through the door jamb. They wait behind anyone in the way ahead. */
  /** a person's own pace against the crowd's: older people walk at about 1.0-1.1 m/s against 1.3-1.4 for younger adults (Bohannon 1997, Bohannon & Andrews 2011);
   *  a tight skirt shortens the step (people review 2: elders walked like everyone else, a pencil skirt tore at a full stride) */
  _paceK(p) { const c = p.char; if (!c) return 1; return c._pace || (c._pace = (c.elder ? 0.78 : 1) * (/pencil/.test(c.outfit) ? 0.85 : 1)); }
  _railStep(p, dt, sp) {
    sp *= this._paceK(p);
    const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz); if (d < 1e-4) return true; const ux = dx / d, uz = dz / d;
    if (p.blockT > 1.5) p.passT = 1.0;   // (held up 1.5 s: walk on for a second before looking again - one free frame per 1.5 s made a 5 cm/s creep)
    const pass = p.passT > 0; if (pass) p.passT -= dt;
    for (const q of this.people) { if (q === p || q.hidden || !q.obj || q.static) continue; const ex = q.x - p.x, ez = q.z - p.z, e = Math.hypot(ex, ez); if (e > 0.5 || e < 1e-4) continue;
      // someone going the same way, level with or ahead of this walker and too close, is followed, never walked through: the one behind gives way (gp7: two climbers abreast held
      // 0.16-0.25 m apart for 11 s - the cone ahead missed a neighbour alongside).  A walk-past (pass) only ever goes by someone standing or coming the other way.
      const qd = q.mode === 'go' ? Math.hypot(q.tx - q.x, q.tz - q.z) : 0, same = qd > 1e-3 && ((q.tx - q.x) * ux + (q.tz - q.z) * uz) / qd > 0.3, proj = ex * ux + ez * uz;
      const follow = same && (!pass || (q.v || 0) > 0.15);   // (a walker who has waited 1.5 s may pass one who has stopped too: two on different legs of the stairs each saw the other ahead and stood for 42 s)
      if ((follow && e < 0.42 && proj >= 0) || (!pass && proj > 0.3 * e) || (follow && proj > 0.3 * e)) {
        // someone standing in the way (a waiter at the stair foot) steps aside, out of the line of the stairs, and the walker waits for them (review 5: they held whole flights
        // up for 98 s; review 6: ignoring them walked people through each other)
        if (q.mode !== 'go' && q.mode !== 'walk' && !(q.madeWayT > 0)) { q.madeWayT = 4; const sx = -uz, sz = ux, k = ex * sx + ez * sz >= 0 ? 1 : -1; this._makeWay(q, sx * k, sz * k); }
        p.sp = Math.max(0, (p.sp || 0) - 2 * STEER.BMAX * dt); p.yawT = Math.atan2(-dx, -dz); return false; } }
    const move = steerStep(p, dt, { hT: Math.atan2(-ux, -uz), want: Math.min(sp, (p.char ? p.char.walkSpeed : 1.3) * 1.3), d, stop: !!p.stopHere });
    p.steered = true; p.yawT = p.yaw;
    // even walking past, a step never ends inside another body (0.32 m, centre to centre) unless it moves away from them: the walker edges sideways round them instead
    // (review 8: alighters on door routes passed 0.04-0.25 m apart for up to 1.8 s). Held up 3 s, they may squeeze through (4.5 s let a stair walker stand 8 s - review 10 run), so nobody is stuck for good
    const fx = p.x - Math.sin(p.yaw) * move, fz = p.z - Math.cos(p.yaw) * move, held = pass && (p.blockT || 0) < 3 && !this._core(p, fx, fz, 0.3);
    if (!held) { p.x = fx; p.z = fz; } else p.sp = Math.max(0, (p.sp || 0) - 2 * STEER.BMAX * dt);
    if (pass) {   // walking past someone standing on the stairs: edge round them, sideways, rather than through them (gp8: 0.14-0.29 m for up to 12 s)
      const sx = -uz, sz = ux; let lat = 0;
      for (const q of this.people) { if (q === p || q.hidden || !q.obj || q.static) continue; const ex = q.x - p.x, ez = q.z - p.z, e = Math.hypot(ex, ez); if (e < 0.42 && e > 1e-4) { const l = ex * sx + ez * sz; lat -= (l >= 0 ? 1 : -1) * (0.42 - e); } }
      if (lat) { const k = Math.max(-0.5 * dt, Math.min(0.5 * dt, lat)), nx = p.x + sx * k, nz = p.z + sz * k; if (this._onFloor(nx, nz, 0.12) || held) { p.x = nx; p.z = nz; } }
    }
    return !held;
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
    let tgt = p.yawT; const g = p.settleTurn && p.gait && p.gait.g;
    if (g) { const F = g.feet, m = F[0].psi + angDiff(F[0].psi, F[1].psi) / 2; tgt = m + Math.max(-1.0, Math.min(1.0, angDiff(m, p.yawT))); g.stoppedAt = g.t; }   // (stepped round: the body faces no more than 46 degrees past its feet and waits for them; the steps follow on as a walk's closing steps do, not an idle re-plant's)
    turnToward(p, tgt, dt, p.settleTurn ? STEP_TURN : STEER.PIVOT);   // (a rider's stepped turn: at the platform's 126 deg/s the body led a planted foot by 90 - 140 degrees before it stepped - review 48)
  }
  /** What a person on the platform is looking at, and what they do about the player (waiting.js). Nobody walks off when the player comes close: they stay where they are,
   *  look, turn toward the player if they must, and laugh or nod. Only someone the player keeps pressing into (inside 0.45 m) steps back. */
  _attend(p, dt) {
    const a = p.att || (p.att = newAttention(this.rng)), w = this.walker, s = this.site, busy = p.state === 'walk' || p.state === 'go' || p.state === 'sit';
    const eye = p.y + (p.char.metaH || 1.7) * 0.93, rel = (x, z) => angDiff(p.yaw, Math.atan2(-(x - p.x), -(z - p.z)));
    const ctx = { player: null, train: null, board: null, due: s ? s.due || 0 : 0, phone: !!(p.hold && p.hold.target > 0), busy };
    let d = 9, dx = 0, dz = 0;
    if (w) { dx = w.x - p.x; dz = w.z - p.z; d = Math.hypot(dx, dz); if (d < PROX.social + 1) ctx.player = { yaw: rel(w.x, w.z), pitch: Math.atan2((w.eyeY ?? p.y + 1.62) - eye, Math.max(0.3, d)) + (ctx.phone ? 0.3 : 0), d }; }
    if (s) {
      const tz = s.trainZ != null ? s.trainZ : s.fromZ ? s.fromZ * 60 : null; if (tz != null && Math.abs(tz - p.z) > 6) ctx.train = { yaw: rel(s.edgeX - s.S * 1.4, tz) };
      if (s.board) { const bz = s.board.zs ? s.board.zs.reduce((b, z) => (Math.abs(z - p.z) < Math.abs(b - p.z) ? z : b), s.board.zs[0]) : s.board.z, bd = Math.hypot(s.board.x - p.x, bz - p.z); if (bd > 1.5 && bd < 14) { const y = rel(s.board.x, bz); if (Math.abs(y) < 1.3) ctx.board = { yaw: y, pitch: Math.atan2(s.board.y - eye, bd) }; } }
    }
    const o = attend(a, dt, this.rng, ctx);
    if (busy || p.mode === 'go' || p.static) { p.homeYaw = null; return; }   // (a rider or anyone placed by hand keeps their place: the face and eyes only)
    if (o.turn != null) { if (p.homeYaw == null) p.homeYaw = p.yawT ?? p.yaw; p.yawT = p.yaw + o.turn; }
    else if (!a.near && p.homeYaw != null) { p.yawT = p.homeYaw; p.homeYaw = null; }
    if (o.yield && w && !p.revert && d > 1e-4) this._makeWay(p, -dx / d, -dz / d);
  }
  /** someone who is not boarding after all (the train is full, or would be all one garment) walks back from the doors to a place to wait, standing there as
   *  the others do, rather than stand at the doorway for the next train or two (review 24: 0.3 - 0.9 m from the edge for 250 s) */
  standBack(q, retry = false) {
    if (!retry) q.backTries = 0;   // (a fresh turn-away starts its tries afresh)
    if (!this.people.includes(q)) return; this.release(q); if (!this.people.includes(q) || !q.rect) return;
    // (well back from the edge: review 26 still found 7 of 9 within a metre of it - the first spot drawn may be at the edge itself)
    const s = this.site, back = (c) => !s || s.edgeX == null || Math.abs(c.x - s.edgeX) > 1.5; let c = null;
    { const score = (t) => (back(t) ? 0 : 100 - (s && s.edgeX != null ? Math.abs(t.x - s.edgeX) : 0)) + Math.hypot(t.x - q.x, t.z - q.z);   // well back first, then the nearest: a spot 16 m off took one along the edge and stuck him there (review 33)
      for (let k = 0; k < 24; k++) { const t = this._waitSpot(q.rect, { self: q }); if (t && (!c || score(t) < score(c))) c = t; } }
    if (!c || (!back(c) && s && s.edgeX != null && Math.abs(c.x - s.edgeX) <= Math.abs(q.x - s.edgeX) + 0.3) || Math.hypot(c.x - q.x, c.z - q.z) < 0.5) return;   // (a spot short of 1.5 m still does, if it is well back from where they are)
    q.standingBack = true; q.revert = 'stand'; q.mode = 'walk'; q.tx = c.x; q.tz = c.z; q.wait = Math.min(6, Math.max(0, (q.backTries || 0) - 2) * 1.5); q.sp = 0; q.stopHere = true; q.bestD = 1e9; q.stuckT = 0; q.turnT = 0; this._enter(q, 'walk');   // (after a few goes, a pause before the next: they keep trying, every few seconds, while the crowd shifts - review 35: one left 2 - 9 cm from the edge for 200 s after three)
  }
  /** someone the user keeps pressing into: walk a couple of metres clear (legs moving), then go back to standing / the queue slot. false: nowhere to go */
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
    const m = p.revert; p.revert = null; p.sp = 0; p.stopHere = false; p.standingBack = false;   // (review 28: left set, it carried into later walks)
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
