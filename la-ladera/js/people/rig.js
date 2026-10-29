// Character library: loads people.glb (+ optional people_lod.glb), clones skinned characters, retargets the shared clips,
// swaps LOD geometry in place, attaches props to hand bones.
//
// File contract (tools/blender/people_build.py): nodes `person_<id>` (armature + 21 bones) with child `person_<id>_mesh`; ONE shared set of
// rotation-only clips exported on the first armature; meta (people_meta.json) per id: heightM, hipHeightM, seatRootDropM, tags, ...
// glTF characters face -Z; the wrapper group we return faces +Z (project convention: ry = atan2(dx, dz)).
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canon = (n) => n.replace(/_\d+$/, '');
export const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'forearm_l', 'forearm_r', 'hand_l', 'hand_r',
  'fingers_l', 'fingers_r', 'thigh_l', 'thigh_r', 'shin_l', 'shin_r', 'foot_l', 'foot_r'];

async function fetchJson(url) { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); }

export class CharacterLibrary {
  /** root = the models folder (holds manifest.people.json, whose `people` block names the files; a missing LOD file is never requested). */
  constructor(root = './assets/models/') {
    this.root = root; this.base = root + 'people/'; this.meta = null; this.chars = new Map(); this.clips = new Map(); this.lodGeo = new Map(); this.oneShot = new Set();
    this.materials = new Map();
  }

  /** Fetch + parse. */
  async load() {
    // `override = { base, glb?, meta?, lod? }` points the library at a scratch build (labs / tests); the page itself reads the manifest.
    const man = this.override ? null : await fetchJson(this.root + 'manifest.people.json').catch(() => null);
    const p = { dir: 'people/', glb: 'people.glb', meta: 'people_meta.json', lod: null, ...(man?.people ?? {}), ...(this.override ?? {}) };
    this.base = this.override ? this.override.base : this.root + p.dir;
    const loader = new GLTFLoader();
    const [meta, gltf, lod] = await Promise.all([
      fetchJson(this.base + p.meta),
      loader.loadAsync(this.base + p.glb),
      p.lod ? loader.loadAsync(this.base + p.lod).catch(() => null) : null,
    ]);
    this.parse(gltf, meta, lod);
    return this;
  }

  parse(gltf, meta, lodGltf = null) {
    this.meta = meta; this.fps = meta.fps ?? 24;
    for (const a of gltf.animations) {
      const tracks = a.tracks.map((t) => { const c = t.clone(); c.name = c.name.replace(/_\d+\./, '.'); return c; });
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
        let geo = null; mesh?.traverse((o) => { if (o.isSkinnedMesh && !geo) geo = o.geometry; });
        if (geo) this.lodGeo.set(id, geo);
      }
    }
    // Materials: shared across all clones. LOD materials skip the normal map (cheaper far away).
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

  /** A live character: { id, root (position it, rotate Y), obj, mesh, mixer, bones{}, meta, lod }. */
  instantiate(id) {
    const ch = this.chars.get(id); if (!ch) throw new Error('unknown character ' + id);
    const obj = cloneSkinned(ch.node);
    const bones = {}; let mesh = null;
    obj.traverse((o) => {
      if (o.isBone) { o.name = canon(o.name); bones[o.name] = o; }
      if (o.isSkinnedMesh && !mesh) mesh = o;
    });
    obj.position.set(0, 0, 0); obj.rotation.set(0, Math.PI, 0); obj.scale.set(1, 1, 1);
    const root = new THREE.Group(); root.name = 'npc_' + id; root.add(obj);
    if (mesh) {
      mesh.frustumCulled = true;
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.35);   // skinned bounds: generous, pose independent
      mesh.boundingBox = new THREE.Box3(new THREE.Vector3(-1, -0.1, -1), new THREE.Vector3(1, 2.1, 1));
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData.lod0 = mesh.geometry; mesh.userData.lod0mat = mesh.material;
    }
    const mixer = new THREE.AnimationMixer(obj);
    return { id, root, obj, mesh, mixer, bones, meta: ch, lod: 0, actions: new Map(), cur: null, curName: null };
  }

  /** In-place LOD swap (same skeleton): 0 = full, 1 = decimated. Returns true if changed. */
  setLod(inst, lod) {
    if (!inst.mesh || inst.lod === lod) return false;
    if (lod === 1) {
      const g = this.lodGeo.get(inst.id); if (!g) return false;
      inst.mesh.geometry = g; inst.mesh.castShadow = false;
    } else { inst.mesh.geometry = inst.mesh.userData.lod0; inst.mesh.castShadow = true; }
    inst.lod = lod; return true;
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

  /** Attach a prop (THREE.Object3D) to a bone with a local offset/rotation. */
  attach(inst, boneName, prop, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
    const b = inst.bones[boneName]; if (!b) return null;
    prop.position.set(...pos); prop.rotation.set(...rot); prop.scale.setScalar(scale); b.add(prop); return prop;
  }
}
