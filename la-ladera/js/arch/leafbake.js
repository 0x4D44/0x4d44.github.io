// Closed door leaves are static, so they are drawn from a few big meshes instead of one mesh each (the live leaves of a hillside of doors and shutters were
// 240 draw calls at the spawn view, 322 with the room doors, of a 1500 budget). `bakeLeaves` copies every closed leaf, in world space, into chunks: exterior
// leaves into spatial chunks of the barrio (one mesh per material and neighbourhood, like core/merge.js), room doors into one mesh per material under their
// building's `.int` group (so the engine's visibility budget hides them with the rest of the interior). The live leaf then hides. While a door moves, or stands
// open, the baked triangles of that door go degenerate (their index range is zeroed, the way A3's cabinet fronts do it) and the live leaf shows; once it has
// settled closed again the live leaf hides and the triangles come back. The geometry is the same either way, so nothing on screen changes.
import * as THREE from 'three';
import { planChunks } from '../core/merge.js';

const SPAN = 128, MAXV = 60000;

/** The live hinge pivots of a door (a shop door or a double door has several). */
export const pivotsOf = (st) => (st.rig ? st.rig.pivots : [st.pivot]);

const meshesUnder = (pivots) => { const out = []; for (const pv of pivots) pv.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };
const touch = (attr, from, count) => { attr.addUpdateRange?.(from, count); attr.needsUpdate = true; };

/** One mesh per material for the leaves in `items`, in world space, added to `parent`; every leaf records the index ranges it owns (`st.bake`). */
function makeChunk(items, parent, name, counter) {
  const byMat = new Map();
  for (const it of items) for (const m of it.meshes) {
    const key = `${m.material.uuid}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${m.renderOrder}`;
    let e = byMat.get(key);
    if (!e) byMat.set(key, e = { mat: m.material, matKey: m.userData.matKey, cast: m.castShadow, recv: m.receiveShadow, ro: m.renderOrder, nv: 0, ni: 0, parts: [] });
    e.nv += m.geometry.attributes.position.count; e.ni += m.geometry.index.count; e.parts.push({ st: it.st, m });
  }
  const made = [];
  for (const e of byMat.values()) {
    const pos = new Float32Array(e.nv * 3), nor = new Float32Array(e.nv * 3), uv = new Float32Array(e.nv * 2), col = new Float32Array(e.nv * 3).fill(1);
    const idx = e.nv > 65535 ? new Uint32Array(e.ni) : new Uint16Array(e.ni), owned = [];
    let vo = 0, io = 0;
    for (const { st, m } of e.parts) {
      const g = m.geometry, n = g.attributes.position.count, P = g.attributes.position.array, Nn = g.attributes.normal?.array, U = g.attributes.uv?.array, C = g.attributes.color?.array;
      const M = m.matrixWorld.elements, N = new THREE.Matrix3().getNormalMatrix(m.matrixWorld).elements;
      for (let i = 0; i < n; i++) {
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], o = (vo + i) * 3;
        pos[o] = M[0] * x + M[4] * y + M[8] * z + M[12]; pos[o + 1] = M[1] * x + M[5] * y + M[9] * z + M[13]; pos[o + 2] = M[2] * x + M[6] * y + M[10] * z + M[14];
        if (Nn) {
          const a = Nn[i * 3], b = Nn[i * 3 + 1], c = Nn[i * 3 + 2], nx = N[0] * a + N[3] * b + N[6] * c, ny = N[1] * a + N[4] * b + N[7] * c, nz = N[2] * a + N[5] * b + N[8] * c, l = Math.hypot(nx, ny, nz) || 1;
          nor[o] = nx / l; nor[o + 1] = ny / l; nor[o + 2] = nz / l;
        }
        if (U) { uv[(vo + i) * 2] = U[i * 2]; uv[(vo + i) * 2 + 1] = U[i * 2 + 1]; }
        if (C) { col[o] = C[i * 3]; col[o + 1] = C[i * 3 + 1]; col[o + 2] = C[i * 3 + 2]; }
      }
      const si = g.index.array, c = g.index.count;
      for (let k = 0; k < c; k++) idx[io + k] = si[k] + vo;
      owned.push({ st, from: io, to: io + c });
      vo += n; io += c;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const index = new THREE.BufferAttribute(idx, 1); geo.setIndex(index);
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, e.mat);
    mesh.name = `${name}:${e.matKey ?? e.mat.name ?? 'mat'}#${++counter.n}`;
    mesh.castShadow = e.cast; mesh.receiveShadow = e.recv; mesh.renderOrder = e.ro; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    mesh.userData.matKey = e.matKey; mesh.userData.noMerge = true; mesh.userData.bakedLeaves = e.parts.length;
    parent.add(mesh); made.push(mesh);
    for (const r of owned) (r.st.bake ??= []).push({ mesh, index, from: r.from, to: r.to, saved: null });
  }
  return made;
}

/**
 * Bake every door leaf that has not been baked yet and stands closed (`ctx.archBakePending`, filled by doors.js); the system calls it at its first tick, when every
 * building and every static merge is done. Returns the meshes it made.
 */
export function bakeLeaves(ctx) {
  const pending = ctx.archBakePending;
  if (!pending?.size) return [];
  const doors = [...pending].filter((st) => !st.bake && !st.open && st.t === 0 && st.target === 0 && !ctx.archDoorsActive?.has(st));
  pending.clear();
  const ext = [], int = new Map(), box = new THREE.Box3(), tmp = new THREE.Box3();
  for (const st of doors) {
    const pivots = pivotsOf(st);
    for (const pv of pivots) pv.updateWorldMatrix(true, true);
    const meshes = meshesUnder(pivots);
    if (!meshes.length) continue;
    box.makeEmpty();
    let v = 0;
    for (const m of meshes) { const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox(); box.union(tmp.copy(g.boundingBox).applyMatrix4(m.matrixWorld)); v += g.attributes.position.count; }
    const it = { st, meshes, x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z, cx: (box.min.x + box.max.x) / 2, cz: (box.min.z + box.max.z) / 2, v };
    if (st.d.ext || st.d.roof) ext.push(it); else (int.get(st.bid) ?? int.set(st.bid, []).get(st.bid)).push(it);
  }
  const made = [], counter = ctx.archBakeCounter ??= { n: 0 };
  if (ext.length) {
    const root = ctx.archBaked ??= (() => { const g = new THREE.Group(); g.name = 'leaves.baked'; ctx.scene.add(g); return g; })();
    for (const leaf of planChunks(ext, { maxSpan: SPAN, maxVerts: MAXV })) made.push(...makeChunk(leaf, root, 'leaves.baked', counter));
  }
  for (const [bid, list] of int) {
    const parent = ctx.batch.object(bid + '.int');
    for (const leaf of planChunks(list, { maxSpan: SPAN, maxVerts: MAXV })) made.push(...makeChunk(leaf, parent, bid + '.leaves.baked', counter));
  }
  for (const it of [...ext, ...[...int.values()].flat()]) if (it.st.bake) { it.st.bakeHidden = false; for (const pv of pivotsOf(it.st)) pv.visible = false; }
  return made;
}

/** The door starts to move or stands open: its baked triangles vanish and the live leaf shows (a no-op for a door that was never baked). */
export function hideBaked(st) {
  if (!st.bake || st.bakeHidden) return;
  for (const r of st.bake) { r.saved = r.index.array.slice(r.from, r.to); r.index.array.fill(0, r.from, r.to); touch(r.index, r.from, r.to - r.from); }
  st.bakeHidden = true;
  for (const pv of pivotsOf(st)) pv.visible = true;
}

/** The door has settled closed: the baked triangles come back and the live leaf hides. */
export function showBaked(st) {
  if (!st.bake || !st.bakeHidden) return;
  for (const r of st.bake) { r.index.array.set(r.saved, r.from); r.saved = null; touch(r.index, r.from, r.to - r.from); }
  st.bakeHidden = false;
  for (const pv of pivotsOf(st)) pv.visible = false;
}
