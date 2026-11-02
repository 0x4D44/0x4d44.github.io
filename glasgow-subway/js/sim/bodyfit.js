// Body fitting for the animated crowd (models/people.glb, people_lod.glb).
// The characters were authored without any collision between their layers: a ponytail hangs straight through a hoodie, a thigh swings out through a
// skirt, a forearm can end up inside a coat. There is no Blender here, so every fix is applied to the loaded meshes (never the .glb files):
//   fitHair()      - load time, once per geometry: hair that hangs below the neck is pushed out of the garment / skin it is sunk into (bind pose).
// All maths runs in the meshes' bind space, which is where the garment, skin and hair of one character share a skeleton.

const isHair = (m) => /^alpha_hair/i.test(m.material.name || '');
const isBlocker = (m) => /^(cloth_|belt|hose|skin_)/i.test(m.material.name || '');   // anything the hair must not be buried in

/** bind-pose position of the first bone of the mesh's skeleton whose name matches re (GLTFLoader suffixes duplicate rigs: neck_01_5, ...) */
export function jointBind(THREE, mesh, re) {
  const sk = mesh.skeleton; if (!sk) return null;
  const i = sk.bones.findIndex((b) => re.test(b.name)); if (i < 0 || !sk.boneInverses[i]) return null;
  return new THREE.Vector3().setFromMatrixPosition(sk.boneInverses[i].clone().invert());
}

const triangles = (g) => {   // packed xyz of every triangle corner (9 floats per triangle) from a possibly interleaved, possibly non-indexed geometry
  const P = g.attributes.position, idx = g.index, n = idx ? idx.count : P.count, out = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) { const i = idx ? idx.getX(k) : k; out[k * 3] = P.getX(i); out[k * 3 + 1] = P.getY(i); out[k * 3 + 2] = P.getZ(i); }
  return out;
};

/** Push hair that hangs below the neck out of the garments / skin it is buried in, along the character's front-back (z) axis.
 *  The hair strands and the garments are all skinned to the spine / neck / head, which barely move against each other, so one correction in the bind pose
 *  holds through the animations; a small margin covers the rest. Vertices are tested with a ray along z against the blockers' triangles: a vertex is buried
 *  when the first surface behind it faces away (an exit wall). It leaves through the nearer wall (back strands out of the back, front strands out of the chest).
 *  The correction is spread to neighbouring vertices with decay so a strand never kinks, and fades out over the nape so the hair stays attached to the head.
 *  Returns { hairVerts, moved, max } or null when the character has no hair below the neck. */
export function fitHair(THREE, root, o = {}) {
  const margin = o.margin != null ? o.margin : 0.018, maxPush = o.maxPush != null ? o.maxPush : 0.1, fade = o.fade != null ? o.fade : 0.09, CELL = 0.02;
  const hair = [], blockers = [];
  root.traverse((m) => { if (!m.isSkinnedMesh || !m.material || !m.geometry || !m.geometry.attributes.position) return; if (isHair(m)) hair.push(m); else if (isBlocker(m)) blockers.push(m); });
  if (!hair.length || !blockers.length) return null;
  const neck = jointBind(THREE, hair[0], /^neck_01(_\d+)?$/); if (!neck) return null;
  const stats = { hairVerts: 0, moved: 0, max: 0 };
  // triangle grid over (x, y) for the vertical line tests
  const tris = blockers.map((m) => triangles(m.geometry)), grid = new Map(), key = (ix, iy) => ix * 8192 + iy;
  const cellOf = (v) => Math.floor(v / CELL);
  tris.forEach((T, mi) => {
    for (let t = 0; t < T.length; t += 9) {
      const x0 = Math.min(T[t], T[t + 3], T[t + 6]), x1 = Math.max(T[t], T[t + 3], T[t + 6]), y0 = Math.min(T[t + 1], T[t + 4], T[t + 7]), y1 = Math.max(T[t + 1], T[t + 4], T[t + 7]);
      if (y0 > neck.y + fade) continue;   // nothing above the nape matters
      for (let ix = cellOf(x0); ix <= cellOf(x1); ix++) for (let iy = cellOf(y0); iy <= cellOf(y1); iy++) { const k = key(ix, iy + 2048); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(mi, t); }
    }
  });
  const hit = [];   // reused: z, nz pairs for one vertex
  for (const m of hair) {
    const g = m.geometry; if (g.userData.hairFit) continue; g.userData.hairFit = true;
    const P = g.attributes.position, n = P.count, d = new Float32Array(n);   // signed push along z (+ = backwards)
    for (let i = 0; i < n; i++) {
      const px = P.getX(i), py = P.getY(i), pz = P.getZ(i); if (py > neck.y + fade) continue;
      const cell = grid.get(key(cellOf(px), cellOf(py) + 2048)); if (!cell) continue;
      let zb = Infinity, nb = 0, zf = -Infinity, nf = 0;
      for (let c = 0; c < cell.length; c += 2) {
        const T = tris[cell[c]], t = cell[c + 1];
        const ax = T[t], ay = T[t + 1], az = T[t + 2], e1x = T[t + 3] - ax, e1y = T[t + 4] - ay, e1z = T[t + 5] - az, e2x = T[t + 6] - ax, e2y = T[t + 7] - ay, e2z = T[t + 8] - az;
        const det = e1x * e2y - e1y * e2x; if (Math.abs(det) < 1e-10) continue;   // edge-on to the line of sight
        const dx = px - ax, dy = py - ay, u = (dx * e2y - e2x * dy) / det, v = (e1x * dy - dx * e1y) / det, e = 1e-4;
        if (u < -e || v < -e || u + v > 1 + e) continue;
        const z = az + u * e1z + v * e2z, nz = det > 0 ? 1 : -1;
        if (z > pz + 1e-4) { if (z < zb) { zb = z; nb = nz; } } else if (z < pz - 1e-4) { if (z > zf) { zf = z; nf = nz; } }
      }
      if (nb <= 0 || zb === Infinity) continue;   // outside (first wall behind us faces us) or nothing behind: not buried
      const mid = nf < 0 && zf > -Infinity ? (zf + zb) / 2 : neck.z;
      let push = 0;
      if (pz >= mid) push = zb - pz + margin; else if (nf < 0 && zf > -Infinity) push = -(pz - zf + margin);
      if (!push) continue;
      d[i] = Math.max(-maxPush, Math.min(maxPush, push));
    }
    // spread the correction to the neighbours (decaying) so the strands bend instead of kinking; front and back pushes spread separately
    const idx = g.index; if (idx) {
      const nbr = Array.from({ length: n }, () => []);
      for (let t = 0; t < idx.count; t += 3) { const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2); nbr[a].push(b, c); nbr[b].push(a, c); nbr[c].push(a, b); }
      let back = d.map((v) => Math.max(v, 0)), front = d.map((v) => Math.max(-v, 0));
      for (let it = 0; it < 5; it++) {
        const b2 = back.slice(), f2 = front.slice();
        for (let i = 0; i < n; i++) for (const j of nbr[i]) { if (back[j] * 0.8 > b2[i]) b2[i] = back[j] * 0.8; if (front[j] * 0.8 > f2[i]) f2[i] = front[j] * 0.8; }
        back = b2; front = f2;
      }
      for (let i = 0; i < n; i++) d[i] = back[i] >= front[i] ? back[i] : -front[i];
    }
    for (let i = 0; i < n; i++) {
      if (!d[i]) continue;
      const y = P.getY(i), k = Math.max(0, Math.min(1, (neck.y + fade - y) / (fade * 0.6))), w = k * k * (3 - 2 * k);   // 1 at / below the neck joint, 0 at the top of the fade
      const push = d[i] * w; if (Math.abs(push) < 1e-4) continue;
      P.setZ(i, P.getZ(i) + push); stats.moved++; stats.max = Math.max(stats.max, Math.abs(push));
    }
    if (P.isInterleavedBufferAttribute) P.data.needsUpdate = true; else P.needsUpdate = true;
    stats.hairVerts += n;
  }
  return stats.hairVerts ? stats : null;
}
