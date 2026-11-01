// Far hillside kit: shared GLB geometry, spatially bounded instancing and real distance LODs.
// The pre-existing terrain + far-city lights are untouched; a missing/invalid kit simply leaves them in place.
// A5 integration: this module (Codex's `vista.js` on its branch) sits beside vista.js, the procedural far city. It owns ctx.world.vistaKit,
// ctx.world.vistaKitPlan and ctx.world.vistaKitController (vista.js keeps ctx.world.vista). props.js builds it first; vista.js then keeps its
// own rows off the kit's terraces (kitZones) and the kit's houses get lit windows of their own (kitLights), so the far land is never built twice.
import * as THREE from 'three';
import { planVista, placementErrors, VISTA_LIMITS } from './vista-plan.js';
import { houseLights, vistaSites } from './vista.js';
import { kitLook, averageColour } from './vista-look.js';

const PLACEMENT = 'vista/placement.json';
/**
 * The GLBs name their one material `bark_trunk`: when they were built that was a neutral white that took its colour from the vertices. Trunks wear a bark swatch since (world/matdefs.js),
 * and the swatch multiplied every kit house into dark brown, so the kit draws with the neutral twin `vista_matte`. The GLBs, their validator and their tests are untouched.
 */
export const KIT_MATERIALS = Object.freeze({ bark_trunk: 'vista_matte' });
export const kitMaterialKey = (key) => KIT_MATERIALS[key] ?? key;
const tris =(g) => (g.index?.count ?? g.getAttribute('position')?.count ?? 0) / 3;
const reason = (e) => String(e?.message ?? e).slice(0, 300);
const isDisabled = (ctx) => ctx.opts?.vista === false || ctx.opts?.skip?.has('vista') ||
  (typeof location !== 'undefined' && new URLSearchParams(location.search).get('vista') === '0');

/**
 * Select LODs against a conservative whole-world triangle bound, including objects outside the camera frustum.
 * The default far shell always fits. Closer upgrades and small details spend the remaining triangles nearest-first.
 * This is intentionally stricter than the per-view gate, so turning quickly cannot expose an over-budget vista.
 */
export function selectVistaLODs(records, position, previous = [], limits = VISTA_LIMITS) {
  const modes = records.map((p) => p.detail ? 'off' : 'far');
  let triangles = records.reduce((n, p) => n + (p.detail ? 0 : p.farTriangles), 0);
  if (triangles > limits.triangles) throw new Error('vista far geometry exceeds its whole-world budget');
  const candidates = [];
  for (let i = 0; i < records.length; i++) {
    const p = records[i], d = Math.hypot(p.x - position.x, p.y - position.y, p.z - position.z);
    const near = d < limits.nearDistance + (previous[i] === 'near' ? limits.hysteresis : 0);
    if (p.detail) {
      if (d < limits.detailDistance + (previous[i] && previous[i] !== 'off' ? limits.hysteresis : 0)) {
        const mode = near ? 'near' : 'far';
        candidates.push({ i, d, mode, cost: mode === 'near' ? p.nearTriangles : p.farTriangles });
      }
    } else if (near) candidates.push({ i, d, mode: 'near', cost: p.nearTriangles - p.farTriangles });
  }
  candidates.sort((a, b) => a.d - b.d || a.i - b.i);
  for (const c of candidates) if (triangles + c.cost <= limits.triangles) { modes[c.i] = c.mode; triangles += c.cost; }
  return { modes, triangles };
}

/** One immutable shared geometry per kit root, and two bounded instance buffers per asset/tile. */
export function instanceVista(ctx, planned, partsByName) {
  const root = new THREE.Group(); root.name = 'props.vista'; root.userData.noMerge = true;
  const tiles = new Map(), buckets = new Map(), records = [], matrix = new THREE.Matrix4(), quat = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), scale = new THREE.Vector3();
  const lim = planned.limits;
  // R1-D20: each house is drawn in its own paint, height and step off the row (vista-look.js); the plan itself, its layout and its piece ids, are as the planner made them
  const averages = new Map(), baseOf = (p) => { if (!averages.has(p.far)) averages.set(p.far, averageColour(partsByName.get(p.far) ?? [])); return averages.get(p.far); };
  const looks = kitLook(planned, baseOf, planned.seed ?? 0);
  let released = false;
  const releaseBuffers = () => {
    if (released) return;
    released = true; root.removeFromParent();
    for (const b of buckets.values()) b.mesh?.dispose();
    root.clear();
  };
  try {
  for (let i = 0; i < planned.pieces.length; i++) {
    const p = planned.pieces[i], tx = Math.floor(p.x / lim.tileSize), tz = Math.floor(p.z / lim.tileSize), tileKey = `${tx}:${tz}`;
    let tile = tiles.get(tileKey);
    if (!tile) {
      tile = new THREE.Group(); tile.name = `props.vista.${tx}.${tz}`; tile.position.set(tx * lim.tileSize, 0, tz * lim.tileSize);
      tiles.set(tileKey, tile); root.add(tile);
    }
    const L = looks[i];
    matrix.compose(pos.set(p.x + L.dx - tile.position.x, L.y, p.z + L.dz - tile.position.z), quat.setFromAxisAngle(axis, p.ry + L.dry), scale.set(p.scale[0], p.scale[1] * L.sy, p.scale[2]));
    const record = { ...p, matrix: new Float32Array(matrix.elements), color: new THREE.Color(L.color[0], L.color[1], L.color[2]), nearBuckets: [], farBuckets: [] };
    for (const mode of ['near', 'far']) {
      const parts = partsByName.get(p[mode]);
      if (!parts?.length) throw new Error(`vista geometry absent: ${p[mode]}`);
      for (let j = 0; j < parts.length; j++) {
        const key = `${tileKey}|${p[mode]}|${j}`;
        let b = buckets.get(key);
        if (!b) { b = { key, tile, part: parts[j], records: [], mode, count: 0 }; buckets.set(key, b); }
        b.records.push(i); record[`${mode}Buckets`].push(b);
      }
    }
    records.push(record);
  }
  for (const b of buckets.values()) {
    const mesh = b.mesh = new THREE.InstancedMesh(b.part.geometry, ctx.mat(kitMaterialKey(b.part.matKey)), b.records.length);
    mesh.name = `vista:${b.key}`; mesh.castShadow = mesh.receiveShadow = false; mesh.frustumCulled = true;
    mesh.userData.noMerge = true; mesh.userData.vistaLOD = b.mode; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let j = 0; j < b.records.length; j++) {
      const record = records[b.records[j]];
      mesh.instanceMatrix.array.set(record.matrix, j * 16); mesh.setColorAt(j, record.color);
    }
    // Bounds cover the full capacity, never just the instances selected by the latest LOD update.
    // They therefore remain correct as the packed active prefix changes while the camera moves.
    mesh.computeBoundingBox(); mesh.computeBoundingSphere(); mesh.count = 0; mesh.visible = false;
    b.tile.add(mesh);
  }
  const stats = { enabled: true, fallback: false, reason: null, pieces: partsByName.size / 2,
    houses: planned.houses.length, terraces: planned.clusters.length, instances: records.length,
    tiles: tiles.size, buffers: buckets.size, farTriangles: planned.farTriangles,
    triangleLimit: lim.triangles, near: 0, far: 0, culledDetails: 0, activeTriangles: 0, activeDrawCalls: 0 };
  let previous = [], last = new THREE.Vector3(Infinity, Infinity, Infinity), elapsed = 0, disposed = false;
  const update = (dt = 0, force = false) => {
    if (disposed) return;
    elapsed += dt;
    const camera = ctx.camera?.position ?? ctx.plan?.spawn ?? { x: 0, y: 1.64, z: 90 };
    if (!force && elapsed < 0.2 && last.distanceToSquared(camera) < 4) return;
    if (!force && last.distanceToSquared(camera) < 0.01) { elapsed = 0; return; }
    elapsed = 0; last.set(camera.x, camera.y, camera.z);
    const selected = selectVistaLODs(records, camera, previous, lim); previous = selected.modes;
    for (const b of buckets.values()) b.count = 0;
    let near = 0, far = 0, off = 0;
    for (let i = 0; i < records.length; i++) {
      const mode = previous[i], r = records[i];
      if (mode === 'off') { off++; continue; }
      if (mode === 'near') near++; else far++;
      for (const b of r[`${mode}Buckets`]) {
        b.mesh.instanceMatrix.array.set(r.matrix, b.count * 16); b.mesh.setColorAt(b.count, r.color); b.count++;
      }
    }
    let calls = 0;
    for (const b of buckets.values()) {
      b.mesh.count = b.count; b.mesh.visible = b.count > 0;
      b.mesh.instanceMatrix.needsUpdate = true;
      if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
      if (b.count) calls++;
    }
    Object.assign(stats, { near, far, culledDetails: off, activeTriangles: selected.triangles, activeDrawCalls: calls });
  };
  const system = (dt) => update(dt);
  const dispose = () => {
    if (disposed) return;
    disposed = true; releaseBuffers();
    // Remove by callback identity: another system may legitimately use the same display name.
    if (ctx.systems) for (let i = ctx.systems.length - 1; i >= 0; i--) if (ctx.systems[i].fn === system) ctx.systems.splice(i, 1);
    if (ctx.world?.vistaKitController === controller) {
      delete ctx.world.vistaKitController;
      if (ctx.world.vistaKitPlan === planned) delete ctx.world.vistaKitPlan;
      if (ctx.world.vistaKit === stats) delete ctx.world.vistaKit;
    }
    Object.assign(stats, { enabled: false, reason: 'disposed', near: 0, far: 0, activeTriangles: 0, activeDrawCalls: 0 });
  };
  const controller = { root, stats, update, system, dispose, records, buckets };
  update(0, true);
  return controller;
  } catch (e) {
    // This also covers failures after some buffers were allocated but before a controller exists.
    // Geometries and materials belong to the asset/material registries and are intentionally retained.
    releaseBuffers(); throw e;
  }
}

/**
 * vista.js's church and four towers stand on 30-34 m of ground of their own (vistaSites): drop every kit terrace that has a piece inside one of those discs.
 * Done after planVista rather than inside it, so the planner stays exactly the one Codex verified (its layout and its piece ids do not move).
 */
export function clearLandmarks(planned, landmarks) {
  const drop = new Set(planned.pieces.filter((p) => landmarks.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < s.r)).map((p) => p.cluster));
  if (!drop.size) return { ...planned, dropped: [] };
  const pieces = planned.pieces.filter((p) => !drop.has(p.cluster)), houses = planned.houses.filter((h) => !drop.has(h.cluster)), clusters = planned.clusters.filter((c) => !drop.has(c.id));
  const region = new Map(clusters.map((c) => [c.id, c.region])), regionCost = { south: 0, east: 0, west: 0, north: 0 };
  let farTriangles = 0;
  for (const p of pieces) if (!p.detail) { farTriangles += p.farTriangles; regionCost[region.get(p.cluster)] += p.farTriangles; }
  return { ...planned, houses, pieces, clusters, farTriangles, regionCost, dropped: [...drop] };
}

/** The lit windows of the kit's houses, as glow points (the same law as vista.js's far houses: one or two lit windows on the front of seven houses in ten). */
export function kitLights(plan, planned) {
  const index = new Map(planned.clusters.map((c, k) => [c.id, k]));
  return houseLights(plan, planned.houses.map((h, k) => ({ x: h.x, z: h.z, y: h.y, w: h.width, d: h.depth, ry: h.ry, floors: h.levels, i: k, j: 5000 + (index.get(h.cluster) ?? 0) })));
}

/** Validate the loaded roots before publishing any of them into the scene. Never use Assets' magenta stand-in path. */
export function kitParts(ctx, data) {
  const out = new Map();
  for (const p of data.pieces) for (const mode of ['near', 'far']) {
    const name = p[mode], entry = ctx.assets.meta(name), gltf = entry && ctx.assets.loaded.get(entry.glb);
    const node = gltf?.scene.getObjectByName(entry.node ?? name);
    if (!node) throw new Error(`missing vista root ${name}`);
    const parts = ctx.assets.parts(name);
    if (!parts.length) throw new Error(`empty vista root ${name}`);
    let count = 0;
    for (const part of parts) {
      const g = part.geometry;
      if (!g.getAttribute('position') || !g.getAttribute('normal') || !g.getAttribute('color')) throw new Error(`invalid vertex attributes ${name}`);
      if (!ctx.matlib.defs[part.matKey] || part.matKey === 'missing_asset' || !ctx.matlib.defs[kitMaterialKey(part.matKey)]) throw new Error(`unknown vista material ${part.matKey}`);
      count += tris(g);
    }
    if (count !== p[`${mode}Triangles`]) throw new Error(`triangle metadata mismatch ${name}: ${count}`);
    if (mode === 'near' ? count >= 600 : count > 60) throw new Error(`vista triangle budget ${name}`);
    out.set(name, parts);
  }
  return out;
}

/**
 * Browser entry; tests can inject the exact placement data and a disk GLB loader.
 * Missing manifest, offline GLB, invalid placement or incomplete kit all preserve the existing background.
 */
export async function buildVistaKit(ctx, options = {}) {
  ctx.world ??= {};
  if (ctx.world.vistaKitController) return ctx.world.vistaKit;
  const fallback = (why) => (ctx.world.vistaKit = { enabled: false, fallback: true, reason: why, houses: 0, instances: 0, activeTriangles: 0 });
  if (isDisabled(ctx)) return fallback('disabled');
  if (ctx.opts?.headless && !options.placement) return fallback('headless metadata-only world');
  if (!ctx.assets || !ctx.assets.names().some((n) => n.startsWith('vista_'))) return fallback('kit manifest absent');
  let controller;
  try {
    const read = options.read ?? (async () => {
      const response = await fetch(ctx.assets.root + PLACEMENT);
      if (!response.ok) throw new Error(`placement HTTP ${response.status}`);
      return response.json();
    });
    const data = options.placement ?? await read();
    const errors = placementErrors(data);
    if (errors.length) throw new Error(errors.join('; '));
    const names = data.pieces.flatMap((p) => [p.near, p.far]);
    if (!names.every((name) => ctx.assets.has(name))) throw new Error('kit manifest incomplete');
    const files = [...new Set(names.map((name) => ctx.assets.meta(name).glb))];
    // A strict load (rather than preload's warning-and-continue) keeps the swap atomic.
    await Promise.all(files.map((file) => options.load ? options.load(file) : ctx.assets.load(file)));
    const parts = kitParts(ctx, data), sites = vistaSites(ctx.plan);
    const planned = clearLandmarks(planVista(ctx.plan, data, options.limits ?? VISTA_LIMITS), [sites.church, ...sites.towers]);
    if (!planned.houses.length) throw new Error('empty vista plan');
    controller = instanceVista(ctx, planned, parts);
    ctx.scene.add(controller.root);
    ctx.world.vistaKitPlan = planned; ctx.world.vistaKitController = controller; ctx.world.vistaKit = controller.stats;
    ctx.addSystem('vista-lod', controller.system, 8);
    const lights = kitLights(ctx.plan, planned);
    for (const l of lights) ctx.glow?.add({ x: l.x, y: l.y, z: l.z, color: l.color, size: l.size, intensity: l.intensity, on: l.on });
    controller.stats.lights = lights.length; controller.stats.landmarkTerracesDropped = planned.dropped.length;
    return controller.stats;
  } catch (e) {
    controller?.dispose();
    return fallback(reason(e));
  }
}
