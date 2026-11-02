// Static Blender vehicles: actual near + far GLB roots are required before a procedural vehicle is replaced.
// Wheel pivots remain independent in the source GLB. For parked rendering their parts are merged by material,
// then instanced per design / LOD. Paint and wear vary per instance without extra materials or draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clutterLOD, clutterMatrix } from './clutter.js';

export const VEHICLE_RANGES = { near: 19, far: 115, hysteresis: 2 };
// The older furniture catalogue also tags its workshop motorbike 'vehicle'. It is not part of this LOD library.
export const vehicleNames = (ctx) => ctx.assets.names('vehicle').filter((key) => key.startsWith('vehicle_'));
const PAINT_TILES = [0, 1, 2, 3, 4, 5, 6, 7, 12, 13, 14, 15];
const PALETTE = [0xb8222a, 0x2b4f7e, 0xf2c21b, 0xd9cfa8, 0x3d6b4a, 0x2d9590, 0xf4f4f0, 0x6d3037];

export function vehiclePaintTile(hex, salt = 0) {
  if (!Number.isFinite(hex)) return PAINT_TILES[Math.abs(Math.trunc(salt)) % PAINT_TILES.length];
  let best = 0, distance = Infinity;
  const c = new THREE.Color(hex);
  for (let i = 0; i < PALETTE.length; i++) {
    const p = new THREE.Color(PALETTE[i]);
    const d = (p.r - c.r) ** 2 + (p.g - c.g) ** 2 + (p.b - c.b) ** 2;
    if (d < distance) { distance = d; best = i; }
  }
  // A quarter of blue/red/cream/green cars have visibly heavier corrosion or road grime.
  const worn = { 1: 12, 0: 13, 3: 14, 4: 15 };
  return Math.abs(Math.trunc(salt)) % 4 === 0 && worn[best] != null ? worn[best] : best;
}

/**
 * The mean colour of each atlas cell: the sRGB hex of its mean linear colour, measured on assets/textures/vehicles/paint.png inside each cell (tests/world-vehicles-look.test.mjs
 * measures it again, so a repainted atlas fails there and not as a quietly wrong car). A car's colour is a tint on the cell it was dealt, `want / mean`.
 */
export const PAINT_TILE_MEAN = [0x9e4636, 0x45637f, 0xca9e3a, 0xbcb08f, 0x436d53, 0x4a8b88, 0xbfbeb0, 0x733d3f, 0x6e4326, 0x6f5d42, 0xb0874f, 0xc9bd8f, 0x456176, 0x944736, 0xb4a784, 0x4a6b4f];

/** A deterministic 32-bit hash of a place and a count. It draws on no random stream, so giving a car its look moves no other vehicle, prop or person (R1-103). */
export function lookHash(x, z, n = 0) {
  let h = Math.imul(Math.round(x * 64) | 0, 0x85ebca6b) ^ Math.imul(Math.round(z * 64) | 0, 0xc2b2ae35) ^ Math.imul((n | 0) + 0x9e3779b9, 0x27d4eb2f);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return h >>> 0;
}

/**
 * The linear colour multiplier that takes atlas cell `tile` to the car's own colour `hex` (R1-103: the colour list was snapped to eight cells and every car of a cell was the same car).
 * Eighty-five per cent of the way in log space, so a tinted car keeps the cell's faded paint and its chips; `h` adds a few per cent of brightness and warmth, so two cars of one colour are not one colour.
 */
export function vehicleTint(hex, tile, h = 0) {
  if (!Number.isFinite(hex)) return [1, 1, 1];
  const want = new THREE.Color(hex), have = new THREE.Color(PAINT_TILE_MEAN[tile] ?? 0xffffff);
  const lum = ((h & 255) / 255 - 0.5) * 0.14, warm = (((h >>> 8) & 255) / 255 - 0.5) * 0.06;
  const k = (a, b, s) => Math.min(2.2, Math.max(0.05, (Math.max(0.004, a * (1 + lum + s)) / Math.max(0.02, b)) ** 0.85));
  return [k(want.r, have.r, warm), k(want.g, have.g, 0), k(want.b, have.b, -warm)];
}

/**
 * Which of the body's patches a car shows. The model paints the same two rust patches on the doors and the same mud strip along the sill on every car (the "smiley" of R1-103);
 * the shader leaves either off, and mirrors the cell's own weathering front to back, by these bits.
 */
export const LOOK_NO_RUST = 1, LOOK_NO_MUD = 2, LOOK_FLIP = 4;
// the codes cars of one design take, in a ring from a hashed start while any is unused; the original look (both patches, mirrored or not: 0 and 4) is dealt last
const LOOK_RING = [5, 2, 7, 1, 6, 3], LOOK_PLAIN = [4, 0];
export function vehicleLookCode(h, used = new Set()) {
  const start = (h >>> 11) % LOOK_RING.length;
  for (let i = 0; i < LOOK_RING.length; i++) { const c = LOOK_RING[(start + i) % LOOK_RING.length]; if (!used.has(c)) return c; }
  for (const c of LOOK_PLAIN) if (!used.has(c)) return c;
  return LOOK_RING[start];
}

/** Same pose as the procedural vehicles: +Z front, positive pitch raises the nose. */
export const vehicleMatrix = (x, y, z, yaw = 0, pitch = 0) => clutterMatrix(x, y, z, yaw, [1, 1, 1], pitch);
export const vehicleLOD = (distance, previous = 2) => clutterLOD(distance, previous, VEHICLE_RANGES.near, VEHICLE_RANGES.far, VEHICLE_RANGES.hysteresis);

function realParts(ctx, key) {
  const meta = ctx.assets.meta(key), gl = meta && ctx.assets.loaded.get(meta.glb);
  if (!gl?.scene.getObjectByName(meta.node ?? key)) return null;
  const parts = ctx.assets.parts(key);
  if (!parts.length || parts.some((p) => {
    if (!ctx.matlib.has(p.matKey)) return true;
    const g = p.geometry, pos = g?.attributes?.position;
    if (!pos?.count || (g.index?.count ?? pos.count) % 3) return true;
    for (const name of ['position', 'normal', 'uv']) {
      const a = g.attributes[name], width = name === 'uv' ? 2 : 3;
      if (!a || a.itemSize !== width || a.count !== pos.count) return true;
      for (let i = 0; i < a.count; i++) for (let j = 0; j < width; j++) if (!Number.isFinite(a.getComponent(i, j))) return true;
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) {
      const n = g.index.getX(i); if (!Number.isInteger(n) || n < 0 || n >= pos.count) return true;
    }
    const col = g.attributes.color;
    if (col) {
      if (![3, 4].includes(col.itemSize) || col.count !== pos.count) return true;
      for (let i = 0; i < col.count; i++) for (let j = 0; j < col.itemSize; j++) if (!Number.isFinite(col.getComponent(i, j))) return true;
    }
    return false;
  })) return null;
  return parts;
}

function mergeParts(parts, bodyPaintTile) {
  const byMaterial = new Map();
  for (const { geometry, matKey } of parts) {
    const g = geometry.clone(), count = g.attributes.position.count;
    // Exported COLOR_0 can be normalized bytes or RGBA. Normalize it here so every part of a material merges.
    const attrs = {};
    for (const [name, width, fallback] of [['position', 3, 0], ['normal', 3, 0], ['uv', 2, 0], ['color', 3, 1]]) {
      const a = g.getAttribute(name), out = new Float32Array(count * width);
      for (let i = 0; i < count; i++) for (let k = 0; k < width; k++) out[i * width + k] = a ? a.getComponent(i, k) : fallback;
      attrs[name] = new THREE.BufferAttribute(out, width);
    }
    for (const name of Object.keys(g.attributes)) g.deleteAttribute(name);
    for (const [name, attr] of Object.entries(attrs)) g.setAttribute(name, attr);
    if (!g.index) g.setIndex(Array.from({ length: count }, (_, i) => i));
    if (matKey === 'vehicle_paint') {
      const mask = new Float32Array(count), uv = g.attributes.uv;
      for (let i = 0; i < count; i++) {
        const tile = Math.floor(uv.getX(i) * 4) + 4 * Math.floor(uv.getY(i) * 4);
        // Repaint only the main coat. Mismatched panels, white trim, rust and chiva artwork keep their authored cells.
        mask[i] = tile === bodyPaintTile ? 1 : 0;
      }
      g.setAttribute('vehiclePaintMask', new THREE.BufferAttribute(mask, 1));
    }
    let list = byMaterial.get(matKey); if (!list) byMaterial.set(matKey, list = []);
    list.push(g);
  }
  const out = [];
  for (const [matKey, geometries] of byMaterial) {
    const geometry = mergeGeometries(geometries);
    geometries.forEach((g) => g.dispose());
    if (!geometry) throw new Error(`Vehicle material ${matKey} could not be merged`);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    out.push({ geometry, matKey });
  }
  return out;
}

function paintMaterial(ctx) {
  const material = ctx.mat('vehicle_paint').clone();
  material.name = 'vehicle_paint.instanced';
  material.onBeforeCompile = function vehiclePaintShader(shader) {
    THREE.Material.prototype.onBeforeCompile.call(this, shader); // preserve the world's shared fog/sun-glow uniforms
    // vehicleLook = the instance's look: rgb a tint on the main coat (1 = the cell as painted), w the patch bits (LOOK_*: 1 no door rust, 2 no sill mud, 4 mirror the coat's weathering).
    shader.vertexShader = 'attribute float vehiclePaintMask;\nattribute float vehiclePaintTile;\nattribute vec4 vehicleLook;\nvarying vec3 vPaintTint;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      float paintHide = 0.0;
      vPaintTint = vec3(1.0);
      #ifdef USE_MAP
        float paintBits = vehicleLook.w;
        float paintFrom = floor(vMapUv.x * 4.0) + 4.0 * floor(vMapUv.y * 4.0);
        if (vehiclePaintMask > 0.5) {
          vec2 paintCell = vec2(mod(vehiclePaintTile, 4.0), floor(vehiclePaintTile / 4.0)), paintAt = fract(vMapUv * 4.0);
          if (mod(floor(paintBits / 4.0), 2.0) > 0.5) paintAt.x = 1.0 - paintAt.x;
          vMapUv = paintAt * 0.25 + paintCell * 0.25;
          if (dot(vehicleLook.rgb, vec3(1.0)) > 0.001) vPaintTint = vehicleLook.rgb;
        } else {
          if (paintFrom > 7.5 && paintFrom < 8.5 && mod(paintBits, 2.0) > 0.5) paintHide = 1.0;
          if (paintFrom > 8.5 && paintFrom < 9.5 && mod(floor(paintBits / 2.0), 2.0) > 0.5) paintHide = 1.0;
        }
      #endif`);
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      if (paintHide > 0.5) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);          // a patch this car does not wear: all three corners past the far plane, so the triangle is clipped away`);
    shader.fragmentShader = 'varying vec3 vPaintTint;\n' + shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n\tdiffuseColor.rgb *= vPaintTint;');
  };
  material.customProgramCacheKey = () => 'vehicle-paint-atlas-v2';
  return material;
}

export class VehicleLibrary {
  constructor(ctx) {
    this.ctx = ctx; this.types = new Map(); this.records = []; this.batches = []; this.finalized = false; this.rejected = {};
    this.group = new THREE.Group(); this.group.name = 'props.vehicle-library'; this.group.userData.noMerge = true;
    this.last = new THREE.Vector3(Infinity, Infinity, Infinity);
    this.stats = { placed: 0, near: 0, far: 0, culled: 0, triangles: 0, batches: 0, byKey: {} };
    for (const key of vehicleNames(ctx)) {
      const meta = ctx.assets.meta(key);
      if (meta?.size?.length !== 3 || !meta.size.every((n) => Number.isFinite(n) && n > 0)
        || meta.footprint?.length !== 2 || !meta.footprint.every((n) => Number.isFinite(n) && n > 0)) continue;
      const parts = [];
      try {
        const near = realParts(ctx, key), far = typeof meta.lod1 === 'string' && realParts(ctx, meta.lod1);
        if (!near || !far) continue;
        parts.push(mergeParts(near, meta.paintTile)); parts.push(mergeParts(far, meta.paintTile));
        const triangles = parts.map((ps) => ps.reduce((n, p) => n + p.geometry.index.count / 3, 0));
        if (!(triangles[0] > triangles[1] && triangles[1] > 0 && triangles[1] <= 600 && triangles[0] <= 6000)) throw new Error('invalid triangle budget');
        this.types.set(key, { key, meta, parts, triangles, records: [], meshes: [[], []] });
      } catch (error) {
        parts.flat().forEach((p) => p.geometry.dispose());
        this.rejected[key] = String(error.message ?? error);
      }
    }
  }

  has(key) { return this.types.has(key); }
  meta(key) { return this.types.get(key)?.meta; }

  /** False means the caller must draw its existing procedural vehicle. No placeholder counts as a loaded vehicle. */
  place(key, x, y, z, yaw = 0, pitch = 0, options = {}) {
    const type = this.types.get(key);
    if (!type || this.finalized || ![x, y, z, yaw, pitch].every(Number.isFinite)) return false;
    const matrix = vehicleMatrix(x, y, z, yaw, pitch), size = type.meta.size;
    const paint = Number.isInteger(options.paint) && PAINT_TILES.includes(options.paint) ? options.paint
      : vehiclePaintTile(options.hex, Math.round(Math.abs(x * 17 + z * 31)));
    // the look: the colour tint on the main coat, and which of the model's patches this car wears (R1-103). `options.look` ({ tint, code }) overrides either part.
    const h = lookHash(x, z, type.records.length), used = new Set(type.records.map((r) => r.look.code)), forced = options.look ?? {};
    const look = {
      tint: Array.isArray(forced.tint) && forced.tint.length === 3 ? [...forced.tint] : vehicleTint(options.hex, paint, h),
      code: Number.isInteger(forced.code) ? forced.code & 7 : vehicleLookCode(h, used),
    };
    const rec = { key, x, y, z, yaw, pitch, matrix, paint, look, hex: Number.isFinite(options.hex) ? options.hex : null, level: -1, street: options.street ?? null,
      source: options.source ?? 'replacement', footprint: [...type.meta.footprint],
      center: new THREE.Vector3(0, size[1] / 2, 0).applyMatrix4(matrix), radius: Math.hypot(...size) / 2 };
    this.records.push(rec); type.records.push(rec);
    this.stats.placed++; this.stats.byKey[key] = (this.stats.byKey[key] ?? 0) + 1;
    return true;
  }

  finalize() {
    if (this.finalized) return;
    this.finalized = true;
    const paint = this.types.size ? paintMaterial(this.ctx) : null;
    for (const type of this.types.values()) {
      if (!type.records.length) continue;
      for (let lod = 0; lod < 2; lod++) for (const part of type.parts[lod]) {
        const geometry = part.geometry;
        if (part.matKey === 'vehicle_paint') {
          geometry.setAttribute('vehiclePaintTile', new THREE.InstancedBufferAttribute(new Float32Array(type.records.length), 1).setUsage(THREE.DynamicDrawUsage));
          geometry.setAttribute('vehicleLook', new THREE.InstancedBufferAttribute(new Float32Array(type.records.length * 4).fill(1), 4).setUsage(THREE.DynamicDrawUsage));
        }
        const mesh = new THREE.InstancedMesh(geometry, part.matKey === 'vehicle_paint' ? paint : this.ctx.mat(part.matKey), type.records.length);
        mesh.name = `vehicle:${type.key}:${lod}:${part.matKey}`;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // Parked vehicles receive the world's sunlight/shadows; they do not add a second shadow render of the library.
        mesh.castShadow = false; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
        mesh.userData.noMerge = true; mesh.userData.vehicleKey = type.key; mesh.userData.lod = lod;
        type.records.forEach((r, i) => mesh.setMatrixAt(i, r.matrix));
        mesh.computeBoundingBox(); mesh.computeBoundingSphere(); mesh.count = 0; mesh.visible = false;
        this.group.add(mesh); this.batches.push(mesh); type.meshes[lod].push(mesh);
      }
    }
    this.ctx.scene.add(this.group); this.stats.batches = this.batches.length;
    this.ctx.world ??= {}; this.ctx.world.vehicleLibrary = this.stats;
    this.ctx.world.vehicleLoad = { ...this.loadStatus, assets: this.types.size, keys: [...this.types.keys()], rejected: { ...this.rejected } };
    this.ctx.addSystem('vehicles', () => this.update(), 8);
    this.ctx.events.on('player:teleport', () => this.update(true));
    this.update(true);
  }

  update(force = false) {
    if (!this.finalized) return;
    const p = this.ctx.camera?.position;
    if (!p || (!force && this.last.distanceToSquared(p) < .04)) return;
    this.last.copy(p);
    let changed = force, near = 0, far = 0, culled = 0, triangles = 0;
    for (const type of this.types.values()) for (const rec of type.records) {
      const level = vehicleLOD(Math.max(0, p.distanceTo(rec.center) - rec.radius), rec.level);
      if (level !== rec.level) { changed = true; rec.level = level; }
      if (level === 0) near++; else if (level === 1) far++; else culled++;
      if (level < 2) triangles += type.triangles[level];
    }
    if (changed) for (const type of this.types.values()) {
      const counts = [0, 0];
      for (const rec of type.records) if (rec.level < 2) {
        for (const mesh of type.meshes[rec.level]) {
          mesh.setMatrixAt(counts[rec.level], rec.matrix);
          mesh.geometry.attributes.vehiclePaintTile?.setX(counts[rec.level], rec.paint);
          mesh.geometry.attributes.vehicleLook?.setXYZW(counts[rec.level], rec.look.tint[0], rec.look.tint[1], rec.look.tint[2], rec.look.code);
        }
        counts[rec.level]++;
      }
      for (let lod = 0; lod < 2; lod++) for (const mesh of type.meshes[lod]) {
        mesh.count = counts[lod]; mesh.visible = mesh.count > 0; mesh.instanceMatrix.needsUpdate = true;
        if (mesh.geometry.attributes.vehiclePaintTile) mesh.geometry.attributes.vehiclePaintTile.needsUpdate = true;
        if (mesh.geometry.attributes.vehicleLook) mesh.geometry.attributes.vehicleLook.needsUpdate = true;
      }
    }
    Object.assign(this.stats, { near, far, culled, triangles });
  }
}

export async function loadVehicles(ctx) {
  if (ctx.opts?.headless || ctx.opts?.vehicles === false || ctx.opts?.skip?.has('vehicles')) return null;
  const names = vehicleNames(ctx);
  if (!names.length) return null;
  const paths = [...new Set(names.flatMap((key) => {
    const meta = ctx.assets.meta(key), low = ctx.assets.meta(meta.lod1);
    return [meta.glb, ...(low ? [low.glb] : [])];
  }))], failed = [];
  await Promise.all(paths.map((path) => ctx.assets.load(path).catch(() => { failed.push(path); })));
  const vehicles = new VehicleLibrary(ctx);
  vehicles.loadStatus = { files: paths.length, paths, failed };
  ctx.world ??= {}; ctx.world.vehicleLoad = { ...vehicles.loadStatus, assets: vehicles.types.size, keys: [...vehicles.types.keys()], rejected: { ...vehicles.rejected } };
  if (!vehicles.types.size) return null;
  ctx.vehicleLibrary = vehicles;
  return vehicles;
}
