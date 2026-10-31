// Optional, atomic asset bank. Failed or incomplete downloads produce no objects,
// materials, placeholders, occupancy changes or registered frame callbacks.
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

export const SPECIES = Object.freeze(['dog', 'cat', 'pigeon', 'hen', 'mule', 'parrot_caged', 'canary_caged']);
export const CLIPS = Object.freeze(['idle', 'walk', 'eat']);

function inspect(ctx, gltf, node, limit, clips = false) {
  if (!gltf?.scene?.getObjectByName(node)) return null;
  let triangles = 0, drawCalls = 0, valid = true;
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    triangles += (o.geometry?.index?.count ?? o.geometry?.attributes?.position?.count ?? 0) / 3;
    drawCalls += Array.isArray(o.material) ? o.geometry.groups.filter((g) => g.count > 0).length : 1;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m?.name || !ctx.matlib.has(m.name.split('#')[0])) valid = false;
      if (m?.map || m?.normalMap || m?.emissiveMap) valid = false;
    }
  });
  if (clips && !CLIPS.every((c) => gltf.animations?.some((a) => a.name === c && a.duration > 0 && a.tracks.length))) valid = false;
  return valid && triangles > 0 && triangles <= limit ? { triangles, drawCalls } : null;
}

function disposeGltf(gltf) {
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose(); o.skeleton?.dispose();
    for (const material of Array.isArray(o.material) ? o.material : [o.material]) material.dispose();
  });
}

function deadline(promise, ms, cancel) {
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => { cancel(); resolve(null); }, ms); timer.unref?.(); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Returns null on any missing file; loading this bank never mutates the world. */
export async function loadAnimalLibrary(ctx, options = {}) {
  const controller = new AbortController(), signal = controller.signal, owned = [];
  const root = ctx.assets.root ?? './assets/models/';
  const dispose = () => { for (const gltf of owned.splice(0)) disposeGltf(gltf); };
  const read = options.read ?? (async () => {
    const r = await fetch(root + 'manifest.animals.json', { cache: 'no-cache', signal });
    return r.ok ? r.json() : null;
  });
  // Own these optional requests so a timeout/404 can cancel the rest. Assets.load()
  // intentionally caches promises for other modules and cannot abort this batch.
  const load = options.load ?? (async (path) => {
    const response = await fetch(root + path, { signal });
    if (!response.ok) throw new Error('optional animal asset unavailable');
    const bytes = await response.arrayBuffer();
    if (signal.aborted) return null;
    const gltf = await ctx.assets.loader.parseAsync(bytes, root);
    if (signal.aborted) { disposeGltf(gltf); return null; }
    owned.push(gltf); return gltf;
  });
  try {
    const bank = await deadline((async () => {
      const manifest = await read(signal);
      if (signal.aborted || !manifest?.animals || !SPECIES.every((s) => manifest.animals[s])) return null;
      const entries = await Promise.all(SPECIES.map(async (key) => {
        const meta = manifest.animals[key];
        if (!/^animals\/[a-z_]+\.glb$/.test(meta.glb ?? '') || !/^animals\/[a-z_]+\.glb$/.test(meta.lod ?? '')) return null;
        const [near, far] = await Promise.all([load(meta.glb), load(meta.lod)]);
        const nearStats = inspect(ctx, near, meta.node ?? key, 3000, true), farStats = inspect(ctx, far, meta.lodNode ?? key + '_lod', 300);
        if (!nearStats || !farStats) return null;
        return [key, { meta, near, far, nearStats, farStats }];
      }));
      return entries.every(Boolean) ? new Map(entries) : null;
    })(), options.timeout ?? 12000, () => controller.abort());
    if (!bank) dispose();
    else Object.defineProperty(bank, 'dispose', { value: dispose });
    return bank;
  } catch { dispose(); return null; } // Optional library: preserve the existing barrio without warnings/placeholders.
  finally { controller.abort(); }
}

/** Independent skeletons/mixers; shared immutable geometry and library materials. */
export function instantiateAnimal(ctx, entry) {
  const root = new THREE.Group(), near = cloneSkeleton(entry.near.scene), far = cloneSkeleton(entry.far.scene);
  root.add(near, far); far.visible = false;
  for (const level of [near, far]) level.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map((m) => ctx.mat(m.name)) : ctx.mat(o.material.name);
    // Added animals fit the strict triangle budget without extra shadow passes.
    o.castShadow = false; o.receiveShadow = true;
  });
  const mixer = new THREE.AnimationMixer(near), actions = new Map(entry.near.animations.map((c) => [c.name, mixer.clipAction(c)]));
  let playing = null, elapsed = 0;
  const view = {
    root, near, far, mixer, lod: false, budgets: { near: entry.nearStats, far: entry.farStats },
    play(name, speed = 1) {
      const action = actions.get(name); if (!action) return false;
      if (playing !== action) {
        playing?.fadeOut(0.16); action.reset().setEffectiveWeight(1).fadeIn(playing ? 0.16 : 0).play(); playing = action;
      }
      action.setEffectiveTimeScale(speed); return true;
    },
    update(dt, lod) {
      view.lod = lod; near.visible = !lod; far.visible = lod;
      elapsed += dt;
      if (!lod && elapsed >= 1 / 30) { mixer.update(Math.min(elapsed, 0.25)); elapsed = 0; }
      else if (lod) elapsed = 0; // No skeleton evaluation for the far LOD.
    },
    dispose() {
      mixer.stopAllAction(); mixer.uncacheRoot(near);
      for (const level of [near, far]) level.traverse((o) => o.isSkinnedMesh && o.skeleton.dispose());
      root.removeFromParent();
    },
  };
  view.play('idle');
  return view;
}
