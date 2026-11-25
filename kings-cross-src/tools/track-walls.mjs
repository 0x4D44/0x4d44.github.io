// Do any of the station's walls stand in a train's way? Every surface track that runs into or through the King's Cross shed is swept with
// a train-sized box, segment by segment, and every solid triangle of the shed (brick, stone, piers, the fronts, the spine arcade) and of the
// Western Concourse that enters a box is an interference. CPU only: the same builders the page draws with (web/src/shed.ts, concourse.ts).
import * as THREE from 'three';
import { railShapes } from '../core/curves.ts';
import { railSegments } from '../core/scene.ts';
import { concourseCanopy, shedLayout, stationBuilding, worldToShed } from '../core/station.ts';
import { roofHeight } from '../core/train.ts';
import { buildConcourse } from '../web/src/concourse.ts';
import { buildShed } from '../web/src/shed.ts';

/**
 * The swept envelope, metres. `half`: half of 2.8 m, the widest body that runs here (Class 387, 700 and 717, core/train.ts), plus 0.05 m
 * each side (ASSUMED margin for sway; a kinematic gauge is wider, but a wall this close to a body is visibly wrong either way). `bottom`:
 * 0.15 m above the rail head, so the track bed, sleepers and buffer stops are not walls. `top`: 4.0 m, ASSUMED: over the Azuma's roof
 * covers and folded pantograph (core/train.ts roofHeight, 3.62 m) with room for taller stock, whose roof heights the figures do not all
 * give; a lintel or girder any lower would be in a train's way.
 */
export const TRAIN_ENVELOPE = { half: 1.45, bottom: 0.15, top: Math.max(4.0, roofHeight() + 0.1) };

/** The part of the line swept: the shed's footprint widened by `margin` (m) across and past its north end. */
const SWEEP = { margin: 10, north: 40 };

const solid = m => !(m.transparent && m.opacity < .9) && m.visible !== false;

/** World triangles of every solid mesh under `root` that reach below `top` (instanced meshes expanded). */
function wallTriangles(root, top) {
  const out = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), inst = new THREE.Matrix4(), m = new THREE.Matrix4();
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isMesh || o.visible === false) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (mat && !solid(mat)) return;
    const pos = o.geometry.getAttribute('position'), index = o.geometry.getIndex();
    const n = index ? index.count : pos.count;
    const count = o.isInstancedMesh ? o.count : 1;
    for (let k = 0; k < count; k++) {
      if (o.isInstancedMesh) { o.getMatrixAt(k, inst); m.multiplyMatrices(o.matrixWorld, inst); } else m.copy(o.matrixWorld);
      for (let i = 0; i < n; i += 3) {
        const at = j => (index ? index.getX(i + j) : i + j);
        a.fromBufferAttribute(pos, at(0)).applyMatrix4(m); b.fromBufferAttribute(pos, at(1)).applyMatrix4(m); c.fromBufferAttribute(pos, at(2)).applyMatrix4(m);
        if (Math.min(a.y, b.y, c.y) > top) continue;
        out.push({ name: o.name, t: new THREE.Triangle(a.clone(), b.clone(), c.clone()), box: new THREE.Box3().setFromPoints([a, b, c]) });
      }
    }
  });
  return out;
}

/** The surface tracks near the shed, per OSM way, as world segments [x0, z0, x1, z1] on the same curves the trains run on. */
export function shedTracks(data, layout = shedLayout(data)) {
  const shapes = railShapes(data);
  const near = (x, z) => {
    const { u, v } = worldToShed(layout, [x, z]);
    return u > -SWEEP.margin && u < layout.width + SWEEP.margin && v > -SWEEP.margin && v < layout.length + SWEEP.north;
  };
  const out = [];
  for (const r of data.rails) {
    if (r.tunnel) continue;
    const s = railSegments({ nodes: data.nodes, rails: [r] }, shapes);
    const flat = [...s.main, ...s.siding];
    const segs = [];
    for (let i = 0; i < flat.length; i += 6) if (near(flat[i], flat[i + 2]) || near(flat[i + 3], flat[i + 5])) segs.push([flat[i], flat[i + 2], flat[i + 3], flat[i + 5]]);
    if (segs.length) out.push({ id: r.id, segs });
  }
  return out;
}

/** The station's walls: the shed and the Western Concourse, as the page builds them. */
export function stationWalls(data) {
  const layout = shedLayout(data), group = new THREE.Group();
  group.add(buildShed(layout));
  const station = stationBuilding(data);
  if (station) group.add(buildConcourse(concourseCanopy(data), station.pts, layout, data.buildings.filter(b => b.id === 46821177).map(b => b.pts)));
  return group;
}

/**
 * Every place a wall enters the train envelope: one entry per (track, mesh), with the extent of the touching segments in the shed frame
 * (u across, v north of the south front) and the number of triangles. Empty when the line is clear.
 */
export function trackWallInterferences(data, { walls = stationWalls(data), envelope = TRAIN_ENVELOPE } = {}) {
  const layout = shedLayout(data);
  const tris = wallTriangles(walls, envelope.top);
  const cell = 4, grid = new Map();
  const key = (i, j) => `${i},${j}`;
  tris.forEach((t, n) => {
    for (let i = Math.floor(t.box.min.x / cell); i <= Math.floor(t.box.max.x / cell); i++) for (let j = Math.floor(t.box.min.z / cell); j <= Math.floor(t.box.max.z / cell); j++) {
      const k = key(i, j);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(n);
    }
  });
  const hits = new Map();
  const local = new THREE.Box3(), inv = new THREE.Matrix4(), frame = new THREE.Matrix4(), lt = new THREE.Triangle(), reach = new THREE.Box3();
  for (const track of shedTracks(data, layout)) {
    for (const [x0, z0, x1, z1] of track.segs) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 1e-6) continue;
      const dx = (x1 - x0) / len, dz = (z1 - z0) / len;
      // the segment's own frame: x across the track, y up, z along it
      frame.set(dz, 0, dx, x0, 0, 1, 0, 0, -dx, 0, dz, z0, 0, 0, 0, 1);
      inv.copy(frame).invert();
      local.min.set(-envelope.half, envelope.bottom, 0);
      local.max.set(envelope.half, envelope.top, len);
      reach.copy(local).applyMatrix4(frame);
      const seen = new Set();
      for (let i = Math.floor(reach.min.x / cell); i <= Math.floor(reach.max.x / cell); i++) for (let j = Math.floor(reach.min.z / cell); j <= Math.floor(reach.max.z / cell); j++) {
        for (const n of grid.get(key(i, j)) ?? []) {
          if (seen.has(n)) continue;
          seen.add(n);
          const t = tris[n];
          if (!t.box.intersectsBox(reach)) continue;
          lt.set(t.t.a.clone().applyMatrix4(inv), t.t.b.clone().applyMatrix4(inv), t.t.c.clone().applyMatrix4(inv));
          if (!local.intersectsTriangle(lt)) continue;
          const k = `${track.id} ${t.name}`;
          const at = [worldToShed(layout, [x0, z0]), worldToShed(layout, [x1, z1])];
          const h = hits.get(k) ?? { track: track.id, mesh: t.name, u: [Infinity, -Infinity], v: [Infinity, -Infinity], triangles: 0 };
          for (const p of at) { h.u = [Math.min(h.u[0], p.u), Math.max(h.u[1], p.u)]; h.v = [Math.min(h.v[0], p.v), Math.max(h.v[1], p.v)]; }
          h.triangles++;
          hits.set(k, h);
        }
      }
    }
  }
  return [...hits.values()];
}

/** One line per interference, for a failing assertion or the console. */
export const describeInterference = h => `track ${h.track} runs into ${h.mesh} (${h.triangles} triangles) at u ${h.u[0].toFixed(1)}..${h.u[1].toFixed(1)}, v ${h.v[0].toFixed(1)}..${h.v[1].toFixed(1)}`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const { stationData } = await import('./station-scene.mjs');
  const found = trackWallInterferences(stationData().data);
  console.log(found.length ? found.map(describeInterference).join('\n') : 'no wall stands in a train\'s way');
}
