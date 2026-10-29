// Character library: loads people.glb (+ optional people_lod.glb), clones skinned characters, retargets the shared clips, re-tints garments per NPC,
// swaps LOD geometry in place, attaches props to hand bones.
//
// File contract (tools/blender/people_build.py): nodes `person_<id>` (armature + 21 bones) with child `person_<id>_mesh`; ONE shared set of
// rotation-only clips exported on the first armature; meta (people_meta.json) per id: heightM, hipHeightM, seatRootDropM, tags, slots, ...
// Geometry is Draco compressed (decoded with the vendored three.js decoder). glTF characters face -Z; the wrapper group we return faces +Z
// (project convention: ry = atan2(dx, dz)).
//
// Recolour slots: the build bakes `tint * ambient occlusion` into COLOR_0 and stores a garment slot id in the alpha channel (alpha = id * 16 / 255,
// 1.0 = never re-tinted). A variant { top, bottom, shoes, hat, accessory, inner } (hex colours) multiplies the colours of its slots by newTint / bakedTint,
// so one base body gives dozens of looks with no extra texture or draw call.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const canon = (n) => n.replace(/_\d+$/, '');
export const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'forearm_l', 'forearm_r', 'hand_l', 'hand_r',
  'fingers_l', 'fingers_r', 'thigh_l', 'thigh_r', 'shin_l', 'shin_r', 'foot_l', 'foot_r'];

async function fetchJson(url) { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); }

// ---- colour maths lives in look.js (pure, so Node tests can import it); re-exported for the labs ---------------------------------------------
import { hexLinear, tintOf, RATIO_MAX, variantKey } from './look.js';
export { hexLinear, tintOf, variantKey };

/** Copy of a colour attribute with the slots of `spec` ({ slotName: '#hex' }) re-tinted. `slots` = meta.slots of the character. */
export function recolourAttribute(src, slots, spec) {
  const n = src.count, out = new Uint16Array(n * 4), ratio = [];
  if (src.itemSize >= 4) {
    for (const [name, hex] of Object.entries(spec ?? {})) {
      const s = slots?.[name]; if (!s || !hex) continue;
      const base = tintOf(s.hex, s.gain), now = tintOf(hex, s.gain);
      ratio[s.id] = [0, 1, 2].map((c) => Math.min(RATIO_MAX, now[c] / Math.max(base[c], 0.004)));
    }
  }
  for (let i = 0; i < n; i++) {
    let r = src.getX(i), g = src.getY(i), b = src.getZ(i); const a = src.itemSize >= 4 ? src.getW(i) : 1;
    const q = ratio[Math.round((a * 255) / 16)];
    if (q) { r = Math.min(1, r * q[0]); g = Math.min(1, g * q[1]); b = Math.min(1, b * q[2]); }
    out[i * 4] = (r * 65535 + 0.5) | 0; out[i * 4 + 1] = (g * 65535 + 0.5) | 0; out[i * 4 + 2] = (b * 65535 + 0.5) | 0; out[i * 4 + 3] = (a * 65535 + 0.5) | 0;
  }
  return new THREE.BufferAttribute(out, 4, true);
}

export class CharacterLibrary {
  /** root = the models folder (holds manifest.people.json, whose `people` block names the files; a missing LOD file is never requested). */
  constructor(root = './assets/models/') {
    this.root = root; this.base = root + 'people/'; this.meta = null; this.chars = new Map(); this.clips = new Map(); this.lodGeo = new Map(); this.oneShot = new Set();
    this.geoCache = new Map(); this.override = null;
  }

  /** Fetch + parse. */
  async load() {
    // `override = { base, glb?, meta?, lod? }` points the library at a scratch build (labs / tests); the page itself reads the manifest.
    const man = this.override ? null : await fetchJson(this.root + 'manifest.people.json').catch(() => null);
    const p = { dir: 'people/', glb: 'people.glb', meta: 'people_meta.json', lod: null, ...(man?.people ?? {}), ...(this.override ?? {}) };
    this.base = this.override ? this.override.base : this.root + p.dir;
    const draco = new DRACOLoader(); draco.setDecoderPath(new URL('../../vendor/three/examples/jsm/libs/draco/gltf/', import.meta.url).href);
    const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
    try {
      const [meta, gltf, lod] = await Promise.all([
        fetchJson(this.base + p.meta),
        loader.loadAsync(this.base + p.glb),
        p.lod ? loader.loadAsync(this.base + p.lod).catch((e) => { console.warn('[people] LOD file not loaded:', e?.message ?? e); return null; }) : null,
      ]);
      this.parse(gltf, meta, lod);
    } finally { draco.dispose(); }
    return this;
  }

  parse(gltf, meta, lodGltf = null) {
    this.meta = meta; this.fps = meta.fps ?? 24;
    for (const a of gltf.animations) {
      // The clips are sampled on the FIRST armature, so they also carry its bone offsets and scales: keep the rotations only, and every body keeps its own
      // bone lengths (a boy stays 1.3 m tall instead of being stretched to the first character's skeleton).
      const tracks = a.tracks.filter((t) => t.name.endsWith('.quaternion')).map((t) => { const c = t.clone(); c.name = c.name.replace(/_\d+\./, '.'); return c; });
      this.clips.set(a.name, new THREE.AnimationClip(a.name, a.duration, tracks));
    }
    for (const n of meta.oneShotClips ?? []) this.oneShot.add(n);
    for (const m of meta.people) {
      const node = gltf.scene.getObjectByName('person_' + m.id);
      if (!node) { console.warn('[people] character missing in GLB:', m.id); continue; }
      this.chars.set(m.id, { ...m, node });
    }
    if (lodGltf) {
      for (const id of this.chars.keys()) {
        const mesh = lodGltf.scene.getObjectByName(`person_${id}_mesh`);
        let geo = null; mesh?.traverse((o) => { if (o.isSkinnedMesh && !geo) geo = o.geometry; }); if (mesh?.isSkinnedMesh) geo = mesh.geometry;
        if (geo) this.lodGeo.set(id, geo);
      }
    }
    for (const ch of this.chars.values()) {
      ch.node.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { m.envMapIntensity = 0.7; m.needsUpdate = true; }
      });
    }
    return this;
  }

  ids() { return [...this.chars.keys()]; }
  has(id) { return this.chars.has(id); }
  info(id) { return this.chars.get(id); }
  clip(name) { return this.clips.get(name); }
  hasClip(name) { return this.clips.has(name); }

  /** Geometry of character `id` (lod 0/1) re-tinted for `spec`; shares every attribute but the colours and is cached per (id, lod, variant). */
  geometry(id, lod, spec) {
    const ch = this.chars.get(id); if (!ch) return null;
    const key = variantKey(spec), ck = `${id}|${lod}|${key}`;
    let g = this.geoCache.get(ck); if (g) return g;
    let base = null;
    if (lod === 1) base = this.lodGeo.get(id) ?? null;
    else ch.node.traverse((o) => { if (o.isSkinnedMesh && !base) base = o.geometry; });
    if (!base) return null;
    if (!key) { this.geoCache.set(ck, base); return base; }
    g = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(base.attributes)) g.setAttribute(name, name === 'color' ? recolourAttribute(attr, ch.slots, spec) : attr);
    if (base.index) g.setIndex(base.index);
    for (const grp of base.groups) g.addGroup(grp.start, grp.count, grp.materialIndex);
    g.boundingSphere = base.boundingSphere?.clone() ?? null; g.boundingBox = base.boundingBox?.clone() ?? null;
    this.geoCache.set(ck, g); return g;
  }

  /** A live character: { id, root (position it, rotate Y), obj, mesh, mixer, bones{}, meta, lod, variant }. `variant` re-tints the garment slots. */
  instantiate(id, variant = null) {
    const ch = this.chars.get(id); if (!ch) throw new Error('unknown character ' + id);
    const obj = cloneSkinned(ch.node);
    const bones = {}; let mesh = null;
    obj.traverse((o) => {
      if (o.isBone) { o.name = canon(o.name); bones[o.name] = o; }
      if (o.isSkinnedMesh && !mesh) mesh = o;
    });
    obj.position.set(0, 0, 0); obj.rotation.set(0, Math.PI, 0); obj.scale.set(1, 1, 1);
    const root = new THREE.Group(); root.name = 'npc_' + id; root.add(obj);
    const inst = { id, root, obj, mesh, mixer: null, bones, meta: ch, lod: 0, variant: variant ?? null, actions: new Map(), cur: null, curName: null, props: new Map() };
    if (mesh) {
      mesh.frustumCulled = true;
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.35);   // skinned bounds: generous, pose independent
      mesh.boundingBox = new THREE.Box3(new THREE.Vector3(-1, -0.1, -1), new THREE.Vector3(1, 2.1, 1));
      mesh.castShadow = true; mesh.receiveShadow = true;
      if (variant && Object.keys(variant).length) { const g = this.geometry(id, 0, variant); if (g) mesh.geometry = g; }
    }
    inst.mixer = new THREE.AnimationMixer(obj);
    return inst;
  }

  /** In-place LOD swap (same skeleton): 0 = full, 1 = decimated. Returns true if changed. */
  setLod(inst, lod) {
    if (!inst.mesh || inst.lod === lod) return false;
    const g = this.geometry(inst.id, lod, inst.variant); if (!g) return false;
    inst.mesh.geometry = g; inst.mesh.castShadow = lod === 0; inst.lod = lod; return true;
  }

  /** Crossfade to a clip. o: { fade, speed, time (0..1 phase), once }. */
  play(inst, name, o = {}) {
    const clip = this.clips.get(name) ?? this.clips.get(o.fallback ?? 'idle_a');
    if (!clip) return null;
    let a = inst.actions.get(clip.name);
    if (!a) { a = inst.mixer.clipAction(clip); inst.actions.set(clip.name, a); }
    const once = o.once ?? this.oneShot.has(clip.name);
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
    a.timeScale = o.speed ?? 1;
    const prev = inst.cur;
    if (prev === a) return a;
    a.enabled = true; a.setEffectiveWeight(1);
    if (o.time != null) { a.reset(); a.time = o.time * clip.duration; } else if (!prev || (o.fade ?? 0.25) <= 0) a.reset();
    a.play();
    if (prev && (o.fade ?? 0.25) > 0) { a.reset(); if (o.time != null) a.time = o.time * clip.duration; a.crossFadeFrom(prev, o.fade ?? 0.25, false); }
    else if (prev) prev.stop();
    inst.cur = a; inst.curName = clip.name; return a;
  }

  /** Rest-pose world quaternion of bone `name` of character `id` in the glTF frame (the character faces -Z there). Cached. */
  restQuat(id, name) {
    const ch = this.chars.get(id); if (!ch) return null;
    if (!ch._rest) {
      ch._rest = new Map(); ch.node.updateWorldMatrix(true, true);
      ch.node.traverse((o) => { if (o.isBone) ch._rest.set(canon(o.name), { q: o.getWorldQuaternion(new THREE.Quaternion()), p: o.getWorldPosition(new THREE.Vector3()) }); });
    }
    return ch._rest.get(name) ?? null;
  }

  /** World quaternion + head position of bone `name` at phase `t` (0..1) of clip `clip`, in the glTF character frame. Cached per (clip, t). Used to calibrate held props. */
  poseQuat(id, name, clip, t) {
    const ch = this.chars.get(id), c = this.clips.get(clip); if (!ch || !c) return null;
    const key = clip + '@' + t; (ch._pose ??= new Map());
    let m = ch._pose.get(key);
    if (!m) {
      const obj = cloneSkinned(ch.node); obj.traverse((o) => { if (o.isBone) o.name = canon(o.name); });
      const mixer = new THREE.AnimationMixer(obj), a = mixer.clipAction(c);
      a.play(); a.time = t * c.duration; mixer.update(0); obj.updateMatrixWorld(true);
      m = new Map(); obj.traverse((o) => { if (o.isBone) m.set(canon(o.name), { q: o.getWorldQuaternion(new THREE.Quaternion()), p: o.getWorldPosition(new THREE.Vector3()) }); });
      mixer.stopAllAction(); mixer.uncacheRoot(obj); ch._pose.set(key, m);
    }
    return m.get(name) ?? null;
  }

  /**
   * Attach a prop so that, in the REST pose (or at phase `pose.t` of clip `pose.clip` when given), it has orientation `quat` (THREE.Quaternion) and offset `pos`
   * ([x, y, z]) expressed in the glTF character frame (up +Y, forward -Z, the character's right +X, origin = the bone's head); the bone then carries it through every clip.
   */
  attachOriented(inst, boneName, prop, pos = [0, 0, 0], quat = null, scale = 1, tag = boneName, pose = null) {
    const b = inst.bones[boneName], rest = pose ? this.poseQuat(inst.id, boneName, pose.clip, pose.t) : this.restQuat(inst.id, boneName); if (!b || !rest) return null;
    this.detach(inst, tag);
    const inv = rest.q.clone().invert();
    prop.position.set(...pos).applyQuaternion(inv);
    prop.quaternion.copy(inv); if (quat) prop.quaternion.multiply(quat);
    prop.scale.setScalar(scale); b.add(prop); inst.props.set(tag, prop); return prop;
  }

  /** Attach a prop (THREE.Object3D) to a bone with a local offset/rotation. Replaces the prop held under the same `tag`. */
  attach(inst, boneName, prop, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1, tag = boneName) {
    const b = inst.bones[boneName]; if (!b) return null;
    this.detach(inst, tag);
    prop.position.set(...pos); prop.rotation.set(...rot); prop.scale.setScalar(scale); b.add(prop); inst.props.set(tag, prop); return prop;
  }
  detach(inst, tag) {
    const p = inst.props.get(tag); if (!p) return;
    p.parent?.remove(p); inst.props.delete(tag);
  }
}
