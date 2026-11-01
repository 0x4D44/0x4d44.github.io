// Blender clutter, shared between the roof kit and the public-space props. Geometry is loaded once and instanced per
// catalogue key / material / LOD. An asset is usable only when BOTH actual GLB nodes have loaded; callers retain their
// procedural geometry otherwise. No magenta asset-registry placeholder can replace a working procedural prop.
import * as THREE from 'three';

const IDENTITY = new THREE.Matrix4();
const LIMITS = {
  pole: [34, 170], tank: [25, 150], dish: [22, 125], washing: [24, 105], umbrella: [26, 105], shrine: [28, 110],
};

/** 0 = near mesh, 1 = low mesh, 2 = culled. Hysteresis avoids a swap on each step along a distance boundary. */
export function clutterLOD(distance, previous = 2, near = 24, far = 78, hysteresis = 2) {
  if (!Number.isFinite(distance)) return 2;
  if (distance > far + (previous !== 2 ? hysteresis : 0)) return 2;
  return distance <= near + (previous === 0 ? hysteresis : 0) ? 0 : 1;
}

function readyParts(ctx, key) {
  const a = ctx.assets, e = a?.meta(key), node = e && a.loaded.get(e.glb)?.scene.getObjectByName(e.node ?? key);
  if (!node) return null;
  const parts = a.parts(key);
  if (!parts.length || parts.some((p) => !p.geometry?.attributes?.position || !ctx.matlib.has(p.matKey))) return null;
  return parts;
}

/** A record's fixed transform. Non-uniform scale is used only when fitting a line or an existing architectural fixture. */
export function clutterMatrix(x, y, z, yaw = 0, scale = [1, 1, 1], pitch = 0) {
  return new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ'))
    .scale(new THREE.Vector3(...scale)).setPosition(x, y, z);
}

export class Clutter {
  constructor(ctx) {
    this.ctx = ctx; this.types = new Map(); this.records = []; this.batches = []; this.finalized = false;
    this.group = new THREE.Group(); this.group.name = 'props.clutter'; this.group.userData.noMerge = true;
    this.last = new THREE.Vector3(Infinity, Infinity, Infinity);
    this.stats = { placed: 0, near: 0, far: 0, culled: 0, triangles: 0, batches: 0, byKey: {}, replacements: 0, additions: 0 };
    for (const key of ctx.assets.names('clutter')) {
      const meta = ctx.assets.meta(key), near = readyParts(ctx, key), low = typeof meta?.lod1 === 'string' && readyParts(ctx, meta.lod1);
      if (!near || !low || !meta.size?.every((n) => Number.isFinite(n) && n > 0)) continue;
      const lowMeta = ctx.assets.meta(meta.lod1);
      const tri = (parts) => parts.reduce((sum, p) => sum + (p.geometry.index?.count ?? p.geometry.attributes.position.count) / 3, 0);
      const triangles = [tri(near), tri(low)];
      if (!(triangles[1] > 0 && triangles[1] < triangles[0])) continue;
      this.types.set(key, { key, meta, lowMeta, parts: [near, low], triangles, records: [], meshes: [[], []] });
    }
  }

  has(key) { return this.types.has(key); }
  size(key) { return this.types.get(key)?.meta.size; }

  /** Return true only when a real loaded model has been queued. Until then, the caller draws its old procedural prop. */
  place(key, x, y, z, yaw = 0, options = {}) {
    const type = this.types.get(key);
    if (!type || this.finalized || ![x, y, z, yaw].every(Number.isFinite)) return false;
    const scale = options.scale ?? [1, 1, 1];
    if (scale.length !== 3 || !scale.every((v) => Number.isFinite(v) && v > 0)) return false;
    const pitch = options.pitch ?? 0; if (!Number.isFinite(pitch)) return false;
    const family = Object.keys(LIMITS).find((k) => key.includes('_' + k)), ranges = LIMITS[family] ?? [22, 78];
    const radius = Math.hypot(...type.meta.size.map((v, i) => v * scale[i])) / 2;
    const matrix = clutterMatrix(x, y, z, yaw, scale, pitch);
    const rec = {
      key, x, y, z, yaw, pitch, scale: [...scale], matrix,
      center: new THREE.Vector3(0, type.meta.size[1] / 2, 0).applyMatrix4(matrix), radius,
      near: options.near ?? ranges[0], far: options.far ?? ranges[1], level: -1,
      scene: options.scene ?? 'street', source: options.source ?? 'replacement', building: options.building ?? null,
    };
    this.records.push(rec); type.records.push(rec);
    this.stats.placed++; this.stats.byKey[key] = (this.stats.byKey[key] ?? 0) + 1;
    this.stats[rec.source === 'replacement' ? 'replacements' : 'additions']++;
    return true;
  }

  /** Existing props may request their old dimensions so support pads, doors and street-wire anchors stay aligned. */
  fit(key, x, y, z, yaw, size, options = {}) {
    const original = this.size(key); if (!original) return false;
    return this.place(key, x, y, z, yaw, { ...options, scale: size.map((v, i) => v / original[i]) });
  }

  finalize() {
    if (this.finalized) return;
    this.finalized = true;
    for (const type of this.types.values()) {
      if (!type.records.length) continue;
      for (let lod = 0; lod < 2; lod++) for (const part of type.parts[lod]) {
        const mesh = new THREE.InstancedMesh(part.geometry, this.ctx.mat(part.matKey), type.records.length);
        mesh.name = `clutter:${type.key}:${lod}:${part.matKey}`;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // Small clutter receives the existing world shadow; omitting its own shadow pass makes the LOD budget meaningful.
        mesh.castShadow = false; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.matrix.copy(IDENTITY);
        mesh.userData.noMerge = true; mesh.userData.clutterKey = type.key; mesh.userData.lod = lod;
        // Stable conservative bounds cover ALL possible instance slots. Repacking a subset cannot make frustum culling
        // incorrectly reject a newly visible prop, and bounds need not be rebuilt every time the player moves.
        type.records.forEach((r, i) => mesh.setMatrixAt(i, r.matrix));
        mesh.computeBoundingBox(); mesh.computeBoundingSphere(); mesh.count = 0; mesh.visible = false;
        this.group.add(mesh); this.batches.push(mesh); type.meshes[lod].push(mesh);
      }
    }
    this.ctx.scene.add(this.group);
    this.stats.batches = this.batches.length;
    this.ctx.world ??= {}; this.ctx.world.clutter = this.stats;
    this.ctx.world.clutterLoad = { ...this.loadStatus, assets: this.types.size, keys: [...this.types.keys()] };
    this.ctx.addSystem('clutter', () => this.update(), 8);
    this.ctx.events.on('player:teleport', () => this.update(true));
    this.update(true);
  }

  update(force = false) {
    if (!this.finalized) return;
    const p = this.ctx.camera?.position ?? (this.ctx.player?.s && new THREE.Vector3(this.ctx.player.s.x, this.ctx.player.s.y + 1.64, this.ctx.player.s.z));
    if (!p) return;
    if (!force && this.last.distanceToSquared(p) < 0.04) return;
    this.last.copy(p);
    let changed = force, near = 0, far = 0, culled = 0, triangles = 0;
    for (const type of this.types.values()) for (const r of type.records) {
      const d = Math.max(0, p.distanceTo(r.center) - r.radius);
      const level = clutterLOD(d, r.level, r.near, r.far);
      if (level !== r.level) { changed = true; r.level = level; }
      if (level === 0) near++; else if (level === 1) far++; else culled++;
      if (level < 2) triangles += type.triangles[level];
    }
    if (changed) for (const type of this.types.values()) {
      const counts = [0, 0];
      for (const r of type.records) if (r.level < 2) {
        for (const mesh of type.meshes[r.level]) mesh.setMatrixAt(counts[r.level], r.matrix);
        counts[r.level]++;
      }
      for (let lod = 0; lod < 2; lod++) for (const mesh of type.meshes[lod]) {
        mesh.count = counts[lod]; mesh.visible = mesh.count > 0; mesh.instanceMatrix.needsUpdate = true;
      }
    }
    Object.assign(this.stats, { near, far, culled, triangles });
  }
}

/** Called in the assets stage, before architectural roofs are built. A missing/failed file leaves every caller on fallback. */
export async function loadClutter(ctx) {
  if (ctx.opts?.headless || ctx.opts?.clutter === false || ctx.opts?.skip?.has('clutter')) return null;
  const names = ctx.assets.names('clutter');
  if (!names.length) return null;
  const paths = [...new Set(names.map((name) => ctx.assets.meta(name).glb))];
  const failed = [];
  await Promise.all(paths.map((path) => ctx.assets.load(path).catch(() => { failed.push(path); })));
  const clutter = new Clutter(ctx);
  if (!clutter.types.size) return null;
  clutter.loadStatus = { files: paths.length, paths, failed };
  ctx.clutter = clutter;
  ctx.world ??= {}; ctx.world.clutterLoad = { ...clutter.loadStatus, assets: clutter.types.size, keys: [...clutter.types.keys()] };
  return clutter;
}

/** Convert an architectural fixture from building-local coordinates into the shared instancing system. */
export function buildingClutter(G, key, x, y, z, yaw = 0, options = {}) {
  const C = G.ctx.clutter;
  if (!C?.has(key)) return false;
  const p = G.bp.frame.toWorld(x, y, z), ry = G.bp.frame.rotY + yaw;
  return options.size
    ? C.fit(key, ...p, ry, options.size, { ...options, scene: 'roof', building: G.bp.id })
    : C.place(key, ...p, ry, { ...options, scene: 'roof', building: G.bp.id });
}
