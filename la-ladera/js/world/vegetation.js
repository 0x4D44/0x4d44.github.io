// Blender vegetation library. One draw per visible species/LOD, never per leaf or plant.
// COLOR_0.rgb is linear albedo; COLOR_0.a is wind flexibility data, NOT opacity.
// The procedural builders remain the per-species fallback (including their RNG/colliders).
import * as THREE from 'three';
import { hashStr } from '../core/rng.js';
import { makeFarHeight, urbanDensity } from './periphery.js';
import { vnoise, project } from './geom.js';

export const TREE_SPECIES = new Set(['eucalyptus', 'cypress', 'palm', 'banana', 'almendro']);
export const VEGETATION_BUDGET = 26000; // main-pass triangles; shadow casters are limited to LOD0 trees
const MAX_TREE_LOD0 = 6;
const MAX_TREE_LOD1 = 16;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Distance thresholds in metres, with hysteresis to avoid a dancing silhouette at a boundary. */
export function vegetationLOD(species, distance, previous = -1, far = false) {
  if (far) return 3;
  const tree = TREE_SPECIES.has(species), grass = species === 'wild_grass';
  const limits = tree ? [13, 34, 80] : grass ? [5, 13, 25] : [8, 22, 48];
  let lod = distance < limits[0] ? 0 : distance < limits[1] ? 1 : distance < limits[2] ? 2 : tree ? 3 : -1;
  if (previous >= 0 && previous !== lod) {
    const edge = limits[Math.min(previous, lod < 0 ? 3 : lod)];
    if (edge != null && Math.abs(distance - edge) < (tree ? 1.5 : 0.6)) lod = previous;
  }
  return lod;
}

/** Decode wind without letting three's USE_COLOR_ALPHA make trunks/pots transparent. */
export function prepareVegetationGeometry(source) {
  const g = source.clone(), c = g.getAttribute('color'), p = g.getAttribute('position');
  if (!p || !g.index || !c || c.itemSize !== 4 || c.count !== p.count) throw new Error('vegetation requires indexed geometry and RGBA wind colours');
  const rgb = new Float32Array(c.count * 3), wind = new Float32Array(c.count);
  for (let i = 0; i < c.count; i++) {
    const values = [c.getX(i), c.getY(i), c.getZ(i), c.getW(i)];
    if (!values.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) throw new Error('vegetation colour/wind outside [0,1]');
    rgb.set(values.slice(0, 3), i * 3); wind[i] = values[3];
  }
  g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
  g.setAttribute('windWeight', new THREE.BufferAttribute(wind, 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

const WIND = `
  vec3 vegBase = vec3(0.0);
  #ifdef USE_INSTANCING
    vegBase = instanceMatrix[3].xyz;
  #endif
  float vegPhase = vegBase.x * 0.31 + vegBase.z * 0.19;
  float vegBend = sin(vegTime * 1.13 + vegPhase) * 0.65
    + sin(vegTime * 1.87 + vegPhase * 1.7 + position.y * 0.9) * 0.35;
  transformed.x += vegBend * windWeight * 0.11;
  transformed.z += sin(vegTime * 1.41 + vegPhase) * windWeight * 0.065;
`;

/** Chain the engine's fog hook; share precisely the same bend with the shadow material. */
export function patchVegetationWind(material, time) {
  if (material.userData.vegetationWind) return material;
  const inherited = material.onBeforeCompile;
  material.onBeforeCompile = function (shader, renderer) {
    inherited?.call(this, shader, renderer);
    shader.uniforms.vegTime = time;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float vegTime;\nattribute float windWeight;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND);
  };
  material.customProgramCacheKey = () => 'ladera-vegetation-wind-v1';
  material.userData.vegetationWind = true;
  material.needsUpdate = true;
  return material;
}

export class VegetationLibrary {
  constructor(ctx) {
    this.ctx = ctx; this.species = new Map(); this.records = []; this.batches = new Map();
    this.group = new THREE.Group(); this.group.name = 'vegetation.library';
    this.time = { value: 0 }; this.frustum = new THREE.Frustum(); this.clip = new THREE.Matrix4();
    this.matrix = new THREE.Matrix4(); this.quat = new THREE.Quaternion(); this.pos = new THREE.Vector3(); this.scale = new THREE.Vector3();
    this.last = new THREE.Vector3(Infinity, Infinity, Infinity); this.lastQuat = new THREE.Quaternion(); this.lastProjection = new THREE.Matrix4();
    this.frame = { instances: 0, triangles: 0, shadowTriangles: 0, draws: 0, lods: [0, 0, 0, 0], culled: 0 };
    this.failed = []; this.finalized = false;
  }

  has(species) { return this.species.has(species); }

  async load() {
    const assets = this.ctx.assets, entries = assets.names('vegetation').map((k) => assets.meta(k));
    const families = new Map();
    for (const e of entries) { if (!families.has(e.species)) families.set(e.species, []); families.get(e.species).push(e); }
    const paths = [...new Set(entries.map((e) => e.glb))];
    const loads = await Promise.allSettled(paths.map((p) => assets.load(p)));
    loads.forEach((r, i) => { if (r.status === 'rejected') this.failed.push(paths[i]); });
    for (const [species, family] of families) {
      const levels = [], required = TREE_SPECIES.has(species) ? [0, 1, 2, 3] : [0, 1, 2];
      try {
        for (const lod of required) {
          const e = family.find((v) => v.lod === lod || (lod === 3 && v.lod === 'billboard'));
          const gl = e && assets.loaded.get(e.glb), node = gl?.scene.getObjectByName(e.node);
          if (!node) throw new Error('missing LOD');
          const meshes = []; node.traverse((m) => { if (m.isMesh) meshes.push(m); });
          if (meshes.length !== 1 || Array.isArray(meshes[0].material)) throw new Error('not a single mesh/material');
          const m = meshes[0], key = m.material.name;
          if (key !== (lod === 3 ? 'flora_billboard' : 'flora_vertex')) throw new Error('wrong material');
          const source = m.geometry.clone().applyMatrix4(m.matrixWorld);
          const geometry = prepareVegetationGeometry(source); source.dispose();
          levels[lod] = { geometry, triangles: geometry.index.count / 3, key };
        }
        const box = levels[0].geometry.boundingBox, size = new THREE.Vector3(); box.getSize(size);
        this.species.set(species, { levels, size, box });
      } catch {
        for (const level of levels) level?.geometry.dispose();
        this.failed.push(species);
      }
    }
    if ([...this.species.keys()].some((s) => TREE_SPECIES.has(s))) {
      try {
        // A single external atlas, registered under its library material name. No GLB embeds a texture.
        const atlas = await new THREE.TextureLoader().loadAsync(assets.root + 'vegetation/billboards.png');
        atlas.colorSpace = THREE.SRGBColorSpace; atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping;
        atlas.anisotropy = 4; atlas.flipY = false;
        this.ctx.mat('flora_billboard').map = atlas;
        this.ctx.mat('flora_billboard').needsUpdate = true;
      } catch {
        // An incomplete family falls back as a whole: never replace a tree with an untextured rectangle.
        for (const [s, v] of this.species) if (TREE_SPECIES.has(s)) { v.levels.forEach((l) => l.geometry.dispose()); this.species.delete(s); }
        this.failed.push('billboards.png');
      }
    }
    this.ctx.world.vegetation = this.stats();
    return this;
  }

  /** Queue an instance. Dimensions are in world metres; callers still own occupancy and collision. */
  place(species, x, y, z, o = {}) {
    const family = this.species.get(species);
    if (!family || this.finalized) return false;
    if (![x, y, z].every(Number.isFinite)) throw new Error('non-finite vegetation position');
    const seed = hashStr(`${species}:${x.toFixed(3)}:${z.toFixed(3)}:${y.toFixed(3)}`);
    const sy = (o.height ?? family.size.y) / family.size.y;
    const sx = o.width == null ? sy : o.width / Math.max(family.size.x, 0.01);
    const sz = o.depth == null ? sx : o.depth / Math.max(family.size.z, 0.01);
    const ry = o.ry ?? (seed / 4294967296) * Math.PI * 2;
    const centre = family.box.getCenter(new THREE.Vector3()).multiply(new THREE.Vector3(sx, sy, sz));
    centre.applyAxisAngle(Y_AXIS, ry).add(new THREE.Vector3(x, y, z));
    const radius = family.size.clone().multiply(new THREE.Vector3(sx, sy, sz)).length() / 2 + 0.3;
    this.records.push({ species, x, y, z, sx, sy, sz, ry, far: !!o.far, lod: -1, sphere: new THREE.Sphere(centre, radius), tint: 0.87 + (seed % 101) / 500 });
    return true;
  }

  finalize() {
    this.finalized = true;
    const counts = new Map(); for (const r of this.records) counts.set(r.species, (counts.get(r.species) ?? 0) + 1);
    const depth = patchVegetationWind(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide }), this.time);
    for (const [species, count] of counts) {
      const family = this.species.get(species);
      family.levels.forEach((level, lod) => {
        const material = patchVegetationWind(this.ctx.mat(level.key), this.time);
        const mesh = new THREE.InstancedMesh(level.geometry, material, count);
        mesh.name = `vegetation.${species}.lod${lod}`; mesh.count = 0; mesh.visible = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.castShadow = TREE_SPECIES.has(species) && lod === 0;
        mesh.receiveShadow = lod < 3; mesh.customDepthMaterial = depth;
        // Individually sphere-culled on CPU; the instance population changes with the camera.
        mesh.frustumCulled = false; mesh.userData.noMerge = true; mesh.userData.vegetation = true;
        this.batches.set(`${species}:${lod}`, { mesh, triangles: level.triangles }); this.group.add(mesh);
      });
    }
    this.ctx.scene.add(this.group);
    this.ctx.addSystem('vegetation', (dt) => { this.time.value += dt; this.update(); }, 8);
    this.ctx.events.on('player:teleport', () => this.update(true));
    // Screenshots/lookAt/render() may change camera orientation without stepping the simulation.
    const render = this.ctx.render;
    if (render) this.ctx.render = () => { this.update(); render(); };
    this.update(true);
  }

  update(force = false) {
    const camera = this.ctx.camera;
    if (!this.finalized || !camera) return;
    if (!force && camera.position.distanceToSquared(this.last) < 0.04 && 1 - Math.abs(camera.quaternion.dot(this.lastQuat)) < 0.0001 && camera.projectionMatrix.equals(this.lastProjection)) return;
    this.last.copy(camera.position); this.lastQuat.copy(camera.quaternion); this.lastProjection.copy(camera.projectionMatrix);
    camera.updateMatrixWorld(); this.clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.clip, camera.coordinateSystem, camera.reversedDepth);
    const candidates = [];
    for (const r of this.records) {
      const d = Math.hypot(camera.position.x - r.x, camera.position.y - r.y, camera.position.z - r.z);
      let lod = vegetationLOD(r.species, d, r.lod, r.far);
      if (lod < 0 || (!this.frustum.intersectsSphere(r.sphere) && !(TREE_SPECIES.has(r.species) && d < 16))) continue;
      candidates.push({ r, d, lod });
    }
    candidates.sort((a, b) => a.d - b.d);
    for (const { mesh } of this.batches.values()) { mesh.count = 0; mesh.visible = false; }
    const frame = { instances: 0, triangles: 0, shadowTriangles: 0, draws: 0, lods: [0, 0, 0, 0], culled: this.records.length - candidates.length };
    let n0 = 0, n1 = 0;
    // Reserve enough triangles for every candidate tree's billboard before spending on nearby detail.
    let reserve = candidates.filter(({ r }) => TREE_SPECIES.has(r.species)).length * 2;
    const colour = new THREE.Color();
    for (const { r, lod: desired } of candidates) {
      const tree = TREE_SPECIES.has(r.species), levels = this.species.get(r.species).levels;
      let lod = desired;
      if (tree) { reserve -= 2; if (lod === 0 && n0 >= MAX_TREE_LOD0) lod = 1; if (lod === 1 && n1 >= MAX_TREE_LOD1) lod = 2; }
      while (lod < levels.length && frame.triangles + levels[lod].triangles + reserve > VEGETATION_BUDGET) lod++;
      if (lod >= levels.length) { frame.culled++; continue; }
      const batch = this.batches.get(`${r.species}:${lod}`), mesh = batch.mesh;
      const ry = lod === 3 ? Math.atan2(camera.position.x - r.x, camera.position.z - r.z) : r.ry;
      this.pos.set(r.x, r.y, r.z); this.scale.set(r.sx, r.sy, r.sz); this.quat.setFromAxisAngle(Y_AXIS, ry);
      this.matrix.compose(this.pos, this.quat, this.scale);
      mesh.setMatrixAt(mesh.count, this.matrix);
      colour.setRGB(r.tint, r.tint, r.tint); mesh.setColorAt(mesh.count, colour); mesh.count++;
      frame.instances++; frame.lods[lod]++; frame.triangles += batch.triangles;
      if (mesh.castShadow) frame.shadowTriangles += batch.triangles;
      if (tree && lod === 0) n0++; if (tree && lod === 1) n1++;
      r.lod = desired;
    }
    for (const { mesh } of this.batches.values()) if (mesh.count) {
      mesh.visible = true; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      frame.draws++;
    }
    this.frame = frame; this.ctx.world.vegetation = this.stats();
  }

  stats() {
    const populations = {}; for (const r of this.records) populations[r.species] = (populations[r.species] ?? 0) + 1;
    return { mode: this.species.size ? 'library' : 'procedural', loadedSpecies: [...this.species.keys()], failed: this.failed.slice(), population: this.records.length, populations, ...this.frame, budget: VEGETATION_BUDGET };
  }
}

export async function initVegetation(K) {
  if (K.ctx.opts.headless || K.ctx.opts.vegetation === 'procedural' || !K.ctx.assets.names('vegetation').length) {
    K.ctx.world.vegetation = { mode: 'procedural', loadedSpecies: [], population: 0 };
    return null;
  }
  const library = await new VegetationLibrary(K.ctx).load();
  K.vegetation = K.ctx.vegetation = library;
  return library;
}

// A no-allocation builder consumes the SAME procedural RNG/collider path while its geometry is replaced.
// Thus turning the library off, or losing one GLB, does not move other trees, benches or navigation edges.
const DISCARD_ACC = { pos: { length: 0 }, idx: { push() {} } };
const DISCARD = { tris: 0, _acc: () => DISCARD_ACC, vert: () => 0 };
export function vegetationBuilder(K, species, x, y, z, o, kind = 'flora', flags) {
  return K.vegetation?.place(species, x, y, z, o) ? DISCARD : K.b(kind, x, z, flags);
}

/** Building-local pot footprint against existing furniture; roof corners already contain tanks, racks and plants. */
export function plantClearOfFurniture(furniture, room, x, z, radius = 0.35) {
  return !(furniture ?? []).some((f) => {
    if (f.room !== room || f.kind !== 'floor') return false;
    const c = Math.cos(f.ry ?? 0), s = Math.sin(f.ry ?? 0), dx = x - f.x, dz = z - f.z;
    const localX = dx * c - dz * s, localZ = dx * s + dz * c;
    const gap = Math.hypot(Math.max(0, Math.abs(localX) - f.w / 2), Math.max(0, Math.abs(localZ) - f.d / 2));
    return gap < radius;
  });
}

/** Supplement existing planting with facade boxes, patio pots and clustered far-hill trees. */
export function dressVegetation(K) {
  const v = K.vegetation;
  if (!v) return;
  const stats = { windowBoxes: 0, balconyBoxes: 0, balconyPlants: 0, balconyVines: 0, patioPlants: 0, streetPots: 0, flowerBeds: 0, farTrees: 0 };
  for (const bp of K.ctx.buildings.values()) {
    const r = K.rng('vegetation:' + bp.id), frame = bp.frame;
    let frontBox = false;
    // Use the architecture's recorded furniture bounds to leave balconies, signs and AC units clear.
    for (const w of bp.windows ?? []) {
      if (w.floor < 1 || w.w < 0.9) continue;
      const chosen = r.chance(w.side === 'front' ? 0.55 : 0.22);
      if (!chosen && !(w.side === 'front' && w.floor === 1 && !frontBox)) continue;
      const u = w.side === 'front' || w.side === 'back' ? w.x : w.z, y = w.floor * bp.shell.fh + w.y - 0.24;
      if ((bp.facade ?? []).some((f) => f.side === w.side && (f.window === w.id || (f.u1 > u - w.w / 2 && f.u0 < u + w.w / 2 && f.y1 > y && f.y0 < y + 0.65)))) continue;
      const p = frame.toWorld(w.x + w.nx * 0.32, w.floor * bp.shell.fh + w.y - 0.24, w.z + w.nz * 0.32);
      if (v.place('window_box', ...p, { width: Math.min(w.w + 0.1, 1.35), height: 0.65, depth: 0.42, ry: frame.ry(Math.atan2(w.nx, w.nz)) })) {
        stats.windowBoxes++; if (w.side === 'front') frontBox = true;
      }
    }
    const emptyRails = (bp.facade ?? []).filter((f) => f.kind === 'balcony' && !f.planter && !f.laundry).sort((a, b) => a.y0 - b.y0 || a.u0 - b.u0);
    for (const f of bp.facade ?? []) {
      if (f.kind !== 'balcony') continue;
      // An exterior trough remains visible from the street. Do not cover existing boxes or laundry.
      if (!f.planter && !f.laundry && (f === emptyRails[0] || r.chance(0.45))) {
        const width = Math.min(f.u1 - f.u0 - 0.24, 1.3), u = (f.u0 + f.u1) / 2, y = f.y1 - 0.3;
        const p = frame.toWorld(u, y, bp.shell.D / 2 + f.out + 0.12);
        if (v.place('window_box', ...p, { width, height: 0.75, depth: 0.38, ry: frame.ry() })) stats.balconyBoxes++;
        if (r.chance(0.45)) {
          const q = frame.toWorld(u, y - 0.95, bp.shell.D / 2 + f.out + 0.22);
          if (v.place('bougainvillea', ...q, { width: width * 0.9, height: 1.05, depth: 0.24, ry: frame.ry() })) stats.balconyVines++;
        }
        continue;
      }
      if (!r.chance(0.62)) continue;
      // A pot on the slab at one end; existing procedural boxes hang outside the rail.
      const p = frame.toWorld(f.u0 + 0.32, f.y0 + 0.15, bp.shell.D / 2 + Math.max(0.26, f.out * 0.45));
      if (v.place('potted_fern', ...p, { height: 1.12, width: 0.48 })) stats.balconyPlants++;
    }
    for (const room of bp.rooms ?? []) {
      if (!room.outdoor || !['patio', 'terrace'].includes(room.type)) continue;
      if (room.type === 'terrace' && room !== bp.rooms.find((q) => q.outdoor && q.type === 'terrace')) continue;
      const b = room.rect;
      for (const [lx, lz] of [[b.x0 + 0.43, b.z0 + 0.43], [b.x1 - 0.43, b.z1 - 0.43]]) {
        if (!plantClearOfFurniture(bp.furniture, room.id, lx, lz)) continue;
        const p = frame.toWorld(lx, room.y + 0.03, lz);
        // Leave door approaches and interior furniture clearance untouched.
        if ((bp.entrances ?? []).some((e) => Math.hypot(e.inside[0] - p[0], e.inside[2] - p[2]) < 1.1)) continue;
        if (v.place(r.chance(0.5) ? 'potted_fern' : 'potted_succulent', ...p, { height: 0.75 })) stats.patioPlants++;
      }
    }
    // The current layout exposes terraces rather than interior patio rooms. Dress the actual
    // ground-level forecourts as well, using the existing occupancy/door/navigation clearance.
    if (['courtyard', 'shophouse', 'house', 'cornerstore', 'apartments', 'tenement', 'rowhouse'].includes(bp.lot.kind)) {
      for (const sign of [-1, 1]) {
        if (bp.lot.kind !== 'courtyard' && !r.chance(0.42)) continue;
        const q = frame.toWorld(sign * (bp.shell.W * 0.5 - 0.5), 0, bp.shell.D * 0.5 + 0.7);
        const p = K.spot(q[0], q[2], { r: 0.3, gap: 0.55, maxR: 2, nav: 0.8 });
        if (!p) continue;
        if (v.place(sign < 0 ? 'potted_fern' : 'potted_succulent', p[0], K.H(...p), p[1], { height: 0.85, width: 0.55 })) {
          K.post(p[0], p[1], 0.2, 0.45); K.occ.take(p[0], p[1], 0.35); stats.streetPots++;
        }
      }
    }
  }
  // A few shallow flower beds on free plaza margins, away from doors, paths and furniture.
  for (const pl of K.plan.plazas) {
    if (pl.kind !== 'plaza') continue;
    const p = K.spot(pl.cx + pl.w * 0.42, pl.cz, { r: 0.6, maxR: 3, nav: 1.0 });
    if (p && v.place('flower_bed', p[0], K.H(...p) + 0.015, p[1], { width: 1.4, depth: 0.8, height: 0.5, ry: pl.ry })) stats.flowerBeds++;
  }
  const far = K.plan._far ?? (K.plan._far = makeFarHeight(K.plan)), r = K.rng('vegetation:far');
  // Broad, irregular groves break up the bare terrain; urban pockets and the exit road remain legible.
  for (let z = -430; z < 610; z += 12) for (let x = -500; x < 500; x += 12) {
    const px = x + r.range(-5, 5), pz = z + r.range(-5, 5);
    if (Math.max(Math.abs(px), Math.abs(pz)) < 112) continue;
    const patch = (vnoise(px, pz, 65, K.plan.seed + 813) + 1) * 0.5;
    const urban = urbanDensity(K.plan, px, pz);
    if (r.next() > 0.15 + patch * 0.68 - urban * 0.55) continue;
    if (pz > 100 && project(far.road.pts, far.road.cum, px, pz).d < 14) continue;
    const species = pz < -110 ? (r.chance(0.72) ? 'eucalyptus' : 'cypress') : r.chance(0.58) ? 'almendro' : r.chance(0.6) ? 'eucalyptus' : 'palm';
    if (v.place(species, px, far(px, pz) - 0.06, pz, { height: r.range(8, 16), far: true })) stats.farTrees++;
  }
  K.ctx.world.vegetationDressing = stats;
}
