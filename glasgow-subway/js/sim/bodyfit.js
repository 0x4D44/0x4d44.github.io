// Body fitting for the animated crowd (models/people.glb, people_lod.glb).
// The characters were authored without any collision between their layers: a ponytail hangs straight through a hoodie, a thigh swings out through a
// skirt, a forearm can end up inside a coat. There is no Blender here, so every fix is applied to the loaded meshes (never the .glb files):
//   fitHair()      - load time, once per geometry: hair that hangs below the neck is pushed out of the garment / skin it is sunk into (bind pose).
//   fitLegs()      - load time: a skirt, dress or kilt is held off the thighs and calves while the character moves (shader patch), and the thigh skin hidden
//                    under it is slimmed (bind pose), so a leg swinging forward no longer comes out through the cloth (see the long comments above fitLegs).
//   trimUnderSkirt() - load time, once per geometry: the part of a top that lies under a skirt's waist edge is not drawn (it only pokes out through the cloth).
//   trimWebbing()  - load time, once per geometry: the triangles of the simplified bodies that join a hand to a thigh are dropped (they stretch into skin-coloured flaps).
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
  if (hair.every((m) => m.geometry.userData.hairFit)) {   // already fitted (every AnimCrowd runs this on the same shared character geometry): skip the triangle grid
    const done = hair.map((m) => m.geometry.userData.hairFitStats).filter(Boolean), tot = { hairVerts: 0, moved: 0, max: 0 };
    for (const s of done) { tot.hairVerts += s.hairVerts; tot.moved += s.moved; tot.max = Math.max(tot.max, s.max); }
    return tot.hairVerts ? tot : null;
  }
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
    const gs = g.userData.hairFitStats = { hairVerts: n, moved: 0, max: 0 };   // kept on the geometry: later fitHair() calls on the same (shared) geometry return it instead of redoing the work
    for (let i = 0; i < n; i++) {
      if (!d[i]) continue;
      const y = P.getY(i), k = Math.max(0, Math.min(1, (neck.y + fade - y) / (fade * 0.6))), w = k * k * (3 - 2 * k);   // 1 at / below the neck joint, 0 at the top of the fade
      const push = d[i] * w; if (Math.abs(push) < 1e-4) continue;
      P.setZ(i, P.getZ(i) + push); stats.moved++; stats.max = Math.max(stats.max, Math.abs(push)); gs.moved++; gs.max = Math.max(gs.max, Math.abs(push));
    }
    if (P.isInterleavedBufferAttribute) P.data.needsUpdate = true; else P.needsUpdate = true;
    stats.hairVerts += n;
  }
  return stats.hairVerts ? stats : null;
}


// ---------------------------------------------------------------------------------------------------------------------
// Legs vs skirts.
// A skirt, dress or kilt is skinned to the pelvis, spine and thighs, but it is a tube hanging from the waist: when a thigh swings forward (or a knee lifts) the
// leg's skin comes out through the front of the cloth. The cloth cannot be re-authored here, so two things are done at load time (neither edits the .glb):
//  1. The cloth is held off the legs on the GPU, in the skinning step of the garment's own vertex shader: each of its vertices is kept outside two capsules per leg
//     (hip -> knee and knee -> ankle) whose axes follow the thigh and calf bones, with radii measured from the character's own skin. A vertex is only ever asked to
//     keep min(its distance from the capsule axis in the bind pose, capsule radius + margin): in the bind pose nothing moves, loose cloth that stays clear of the leg
//     is untouched, and only cloth the leg really runs into is pushed (radially, out of the capsule). The garment's bind-pose distances to the four capsule axes ride
//     along as a per-vertex attribute (aLegRest). Materials are cloned per garment mesh (the bone indices and rest joints are per character); the compiled program is
//     shared through customProgramCacheKey.
//  2. That alone is not enough: the cloth is a coarse mesh (flat faces 8 - 12 cm across) round a round thigh, so only its vertices can be kept outside the capsule, and
//     the flat faces between them still cut ~1 cm into the leg. Measured over walks, sits and idles of the characters in skirts, pushing vertices alone left a third
//     to a half of the skin that shows through; pushing harder balloons the skirt. So the thigh skin that is hidden anyway is slimmed too (slimThighs): the
//     remaining sag then has room to hide in.
const LEG_SKIP = /shoe|boot|hose|sock|sweater|jacket|camisole|shirt|belt/i;   // cloth that is never a skirt (tops, footwear, legwear)
export const legFit = { k: { value: 1 } };   // strength of the push, shared by every garment: 1 = on (default), 0 = off (before / after comparisons in tests)
const LEG_STATIONS = 8;   // radius stations along each capsule, t = k / (LEG_STATIONS - 1)
const LEG_PARS = `
#ifdef USE_SKINNING
attribute vec4 aLegRest;
uniform vec4 uLegBone;
uniform vec3 uLegJ[6];
uniform float uLegR[${4 * LEG_STATIONS}];
uniform float uLegM;
uniform float uLegK;
float legRadius( int base, float t ) {
	float x = clamp( t, 0.0, 1.0 ) * ${(LEG_STATIONS - 1).toFixed(1)}, k = min( floor( x ), ${(LEG_STATIONS - 2).toFixed(1)} );
	int i = base + int( k );
	return mix( uLegR[ i ], uLegR[ i + 1 ], x - k );
}
vec3 legCapsule( vec3 p, vec3 a, vec3 b, int base, float rest ) {
	vec3 ab = b - a;
	float t = clamp( dot( p - a, ab ) / max( dot( ab, ab ), 1e-8 ), 0.0, 1.0 );
	vec3 dv = p - ( a + ab * t );
	float d = length( dv ), need = min( rest, legRadius( base, t ) + uLegM );
	return ( d < need && d > 1e-5 ) ? p + dv * ( ( need - d ) / d ) : p;
}
#endif
`;
const LEG_MAIN = `
#ifdef USE_SKINNING
if ( uLegK > 0.0 ) {
	mat4 legT0 = bindMatrixInverse * getBoneMatrix( uLegBone.x ) * bindMatrix, legC0 = bindMatrixInverse * getBoneMatrix( uLegBone.y ) * bindMatrix;
	mat4 legT1 = bindMatrixInverse * getBoneMatrix( uLegBone.z ) * bindMatrix, legC1 = bindMatrixInverse * getBoneMatrix( uLegBone.w ) * bindMatrix;
	vec3 hip0 = ( legT0 * vec4( uLegJ[0], 1.0 ) ).xyz, knee0 = ( legC0 * vec4( uLegJ[1], 1.0 ) ).xyz, ank0 = ( legC0 * vec4( uLegJ[2], 1.0 ) ).xyz;
	vec3 hip1 = ( legT1 * vec4( uLegJ[3], 1.0 ) ).xyz, knee1 = ( legC1 * vec4( uLegJ[4], 1.0 ) ).xyz, ank1 = ( legC1 * vec4( uLegJ[5], 1.0 ) ).xyz;
	vec3 legP = transformed;
	for ( int it = 0; it < 2; it ++ ) {
		legP = legCapsule( legP, hip0, knee0, 0, aLegRest.x );
		legP = legCapsule( legP, knee0, ank0, ${LEG_STATIONS}, aLegRest.y );
		legP = legCapsule( legP, hip1, knee1, ${2 * LEG_STATIONS}, aLegRest.z );
		legP = legCapsule( legP, knee1, ank1, ${3 * LEG_STATIONS}, aLegRest.w );
	}
	transformed = mix( transformed, legP, uLegK );
}
#endif
`;

/** distance from p to the segment a-b, and the position t in [0, 1] of its closest point */
const segDist = (px, py, pz, a, b, out) => {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, l2 = abx * abx + aby * aby + abz * abz || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - a.x) * abx + (py - a.y) * aby + (pz - a.z) * abz) / l2));
  const dx = px - (a.x + abx * t), dy = py - (a.y + aby * t), dz = pz - (a.z + abz * t);
  out.t = t; out.dx = dx; out.dy = dy; out.dz = dz; return Math.sqrt(dx * dx + dy * dy + dz * dz);   // out: position along the segment, and the offset from the closest point
};

/** bone indices (in the mesh's own skeleton) and rest joints (mesh-local) of the legs: [thigh_l, calf_l, thigh_r, calf_r], [hip_l, knee_l, ankle_l, hip_r, knee_r, ankle_r] */
export function legRig(THREE, mesh) {
  const sk = mesh.skeleton; if (!sk) return null;
  const inv = new THREE.Matrix4().copy(mesh.bindMatrix).invert(), bone = [], J = [];
  for (const sd of ['l', 'r']) {
    const at = (name) => { const i = sk.bones.findIndex((b) => new RegExp('^' + name + '_' + sd + '(_\\d+)?$').test(b.name)); return i < 0 || !sk.boneInverses[i] ? null : { i, p: new THREE.Vector3().setFromMatrixPosition(sk.boneInverses[i].clone().invert()).applyMatrix4(inv) }; };
    const th = at('thigh'), ca = at('calf'), ft = at('foot'); if (!th || !ca || !ft) return null;
    bone.push(th.i, ca.i); J.push(th.p, ca.p, ft.p);
  }
  return { bone, J };
}

/** radii of the four capsules at LEG_STATIONS stations along each axis (hip/knee end -> knee/ankle end): the upper envelope of the distance to the axis of the skin
 *  dominated by that bone, over a window of +-0.1 of the length around each station (a leg tapers fast: three coarse stations under-estimated the thigh by up to 1 cm
 *  just above the knee, and that is where the skin came out of the cloth). A station with fewer than 3 vertices in its window takes its 3 nearest. */
export function legRadii(THREE, skin, rig) {
  const g = skin.geometry, P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, n = P.count, out = [], o = {}, N = LEG_STATIONS;
  if (!SI || !SW) return null;
  for (let s = 0; s < 4; s++) {
    const bi = rig.bone[s], a = rig.J[Math.floor(s / 2) * 3 + (s % 2)], b = rig.J[Math.floor(s / 2) * 3 + (s % 2) + 1], T = [], D = [];
    for (let i = 0; i < n; i++) {
      let k = 0, w = SW.getX(i); for (let c = 1; c < 4; c++) { const wc = SW.getComponent(i, c); if (wc > w) { w = wc; k = c; } }
      if (w < 0.6 || SI.getComponent(i, k) !== bi) continue;
      D.push(segDist(P.getX(i), P.getY(i), P.getZ(i), a, b, o)); T.push(o.t);
    }
    const r = [];
    for (let q = 0; q < N; q++) {
      const tq = q / (N - 1); let m = 0, c = 0;
      for (let i = 0; i < D.length; i++) if (Math.abs(T[i] - tq) <= 0.1) { m = Math.max(m, D[i]); c++; }
      if (c < 3 && D.length >= 3) { const near = D.map((d, i) => [Math.abs(T[i] - tq), d]).sort((x, y) => x[0] - y[0]).slice(0, 3); m = Math.max(...near.map((e) => e[1])); c = 3; }
      r.push(c >= 3 ? m : (r.length ? r[r.length - 1] : (s % 2 ? 0.05 : 0.07)));
    }
    out.push(r);
  }
  return out;
}

/** Slim the thighs of the skin that are hidden under a skirt (bind pose, once per geometry): every vertex weighted to a thigh bone moves towards that thigh's
 *  axis by `amount` (default 2.5 cm, at most a quarter of its distance from the axis), fading to nothing between 12 cm and 2 cm above the lowest hem, so the legs
 *  as they come out of the skirt are untouched. Cloth is only vertices and flat triangles round a round thigh, and it is skinned in other proportions than the skin:
 *  its triangles cut the thigh's curve (a flat face 8 - 12 cm across sags ~1 cm below its corners) and its blended vertices lag behind a swinging thigh, so the
 *  skin shows through in patches that no vertex push can reach without ballooning the whole skirt. The skin that is hidden anyway simply gives way instead.
 *  The authored positions are kept on the geometry (userData.legSlimOrig) and put back first, so calling it again with another amount (0 = none) is safe.
 *  Options: cap (largest fraction of a vertex's distance from the axis it may give up, default 0.25), ramp (length in m of the fade-in above the hem, default 0.1).
 *  Returns { verts, max, amount, hem } or null. */
export function slimThighs(THREE, skin, rig, hem, amount, o = {}) {
  const cap = o.cap != null ? o.cap : 0.25, ramp = o.ramp != null ? o.ramp : 0.1;
  const g = skin.geometry, P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, n = P.count;
  if (!SI || !SW || !rig) return null;
  if (!g.userData.legSlimOrig) { const o = new Float32Array(n * 3); for (let i = 0; i < n; i++) { o[i * 3] = P.getX(i); o[i * 3 + 1] = P.getY(i); o[i * 3 + 2] = P.getZ(i); } g.userData.legSlimOrig = o; }
  const orig = g.userData.legSlimOrig, sides = [0, 1].map((s) => ({ bone: rig.bone[s * 2], a: rig.J[s * 3], b: rig.J[s * 3 + 1] })), tmp = {}, stats = { verts: 0, max: 0, amount, hem: +hem.toFixed(3) };
  for (let i = 0; i < n; i++) {
    let x = orig[i * 3], y = orig[i * 3 + 1], z = orig[i * 3 + 2];
    if (amount > 0) {
      const f = Math.max(0, Math.min(1, (y - (hem + 0.02)) / ramp)), sm = f * f * (3 - 2 * f);   // 0 at the hem (+ 2 cm), 1 from `ramp` (10 cm) above that
      if (sm > 0) for (const sd of sides) {
        let w = 0; for (let c = 0; c < 4; c++) if (SI.getComponent(i, c) === sd.bone) w += SW.getComponent(i, c);
        if (w < 0.01) continue;
        const d = segDist(x, y, z, sd.a, sd.b, tmp); if (d < 1e-4) continue;
        const a = Math.min(amount * w * sm, d * cap); x -= tmp.dx / d * a; y -= tmp.dy / d * a; z -= tmp.dz / d * a;
        stats.verts++; stats.max = Math.max(stats.max, a);
      }
    }
    P.setXYZ(i, x, y, z);
  }
  if (P.isInterleavedBufferAttribute) P.data.needsUpdate = true; else P.needsUpdate = true;
  g.userData.legSlim = stats;
  return stats;
}

/** Hold the skirt / dress / kilt cloth of one character off its legs (see above), and slim the thigh skin that hides under it (slimThighs). `root` = the character's
 *  node (bones + meshes). Returns { garments, verts, radii, slim } or null.
 *  Options: margin (m, default 0.006), slim (m, default 0.025; 0 = leave the skin alone), slimCap / slimRamp (see slimThighs), radii (the four capsules' LEG_STATIONS
 *  radii each, from another level of detail of the same character). Idempotent: every AnimCrowd runs this over the same shared template. */
export function fitLegs(THREE, root, o = {}) {
  const margin = o.margin != null ? o.margin : 0.006, slim = o.slim != null ? o.slim : 0.025;
  const skins = [], cloth = [];
  root.traverse((m) => {
    if (!m.isSkinnedMesh || !m.material || !m.geometry || !m.geometry.attributes.position) return;
    const nm = m.material.name || '';
    if (/^skin_/i.test(nm)) skins.push(m); else if (/^(cloth_|sporran)/i.test(nm) && !LEG_SKIP.test(nm)) cloth.push(m);
  });
  if (!skins.length || !cloth.length) return null;
  const skin = skins.reduce((a, b) => (b.geometry.attributes.position.count > a.geometry.attributes.position.count ? b : a));
  if (skin.userData.legFitStats) return skin.userData.legFitStats;
  const srig = legRig(THREE, skin), radii = srig && (o.radii || legRadii(THREE, skin, srig)); if (!radii) return null;   // o.radii: a lower level of detail reuses the legs measured on the full mesh (its own skin is too coarse to measure)
  const hipY = (srig.J[0].y + srig.J[3].y) / 2, stats = { garments: 0, verts: 0, radii: radii.map((r) => r.map((v) => +v.toFixed(4))), margin, slim: null }, tmp = {};
  const hang = [];   // the garments that hang over the legs, with their rigs
  let hem = Infinity;
  for (const m of cloth) {
    const g = m.geometry, P = g.attributes.position, n = P.count; if (g.userData.legFit || m.material.userData.legFit) continue;
    let low = 0, lo = Infinity; for (let i = 0; i < n; i++) { const y = P.getY(i); if (y < hipY - 0.05) low++; if (y < lo) lo = y; }
    if (low < n * 0.05) continue;   // a hat, a scarf: nothing of it hangs over the legs (a mini skirt only has ~15% of its vertices under the hip joint)
    const rig = legRig(THREE, m); if (!rig) continue;
    hang.push({ m, rig }); hem = Math.min(hem, lo);
  }
  if (hang.length && slim > 0) stats.slim = slimThighs(THREE, skin, srig, hem, slim, { cap: o.slimCap, ramp: o.slimRamp });   // the skin is slimmed AFTER its radii are taken: the cloth is still held off the real legs
  for (const { m, rig } of hang) {
    const g = m.geometry, P = g.attributes.position, n = P.count;
    const rest = new Float32Array(n * 4);   // bind-pose distance of every vertex to the four capsule axes
    for (let i = 0; i < n; i++) for (let s = 0; s < 4; s++) { const k = Math.floor(s / 2) * 3 + (s % 2); rest[i * 4 + s] = segDist(P.getX(i), P.getY(i), P.getZ(i), rig.J[k], rig.J[k + 1], tmp); }
    g.setAttribute('aLegRest', new THREE.BufferAttribute(rest, 4)); g.userData.legFit = true;
    const U = { uLegBone: { value: new THREE.Vector4(...rig.bone) }, uLegJ: { value: rig.J }, uLegR: { value: radii.flat() }, uLegM: { value: margin }, uLegK: legFit.k };
    const mat = m.material.clone(); mat.userData = Object.assign({}, mat.userData, { legFit: U });   // the uniforms, for the tests
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <skinning_pars_vertex>', '#include <skinning_pars_vertex>\n' + LEG_PARS).replace('#include <skinning_vertex>', '#include <skinning_vertex>\n' + LEG_MAIN);
    };
    mat.customProgramCacheKey = () => 'legfit2';
    m.material = mat; stats.garments++; stats.verts += n;
  }
  skin.userData.legFitStats = stats;
  return stats;
}


// ---------------------------------------------------------------------------------------------------------------------
// Tops vs skirts.
// A top that reaches below the waist edge of a skirt (the knit of the woman in the midi skirt) is hidden by it there, but the two are cut in different shapes and
// skinned in different proportions: wherever the top is the wider, the part under the edge pokes out through the cloth as red, ragged shards at the hip, and more so
// when the hips swing in a walk. None of that part can be seen when everything is in place, so it is simply not drawn.
const TOP = /sweater|camisole|shirt/i;   // not jackets: a jacket is worn over the waistband and is meant to be seen there
const ARM = /arm|hand|clavicle|shoulder|neck|head/i;   // a sleeve hangs beside the skirt, outside it: never hidden

/** Drop the triangles of a top that lie wholly (every corner) more than `margin` (default 3 cm) below the waist edge of the character's skirt, and carry no arm weight.
 *  The waist edge is the 97th percentile height of a skirt-like garment whose top lies within 35 cm above the hips (a dress or a sash reaches the shoulders: no waist).
 *  Patches each shared geometry once. Returns { tops, dropped, waist } (dropped: triangles) or null when there is no top over a skirt. */
export function trimUnderSkirt(THREE, root, o = {}) {
  const margin = o.margin != null ? o.margin : 0.03, tops = [], skirts = [];
  root.traverse((m) => {
    if (!m.isSkinnedMesh || !m.material || !m.geometry || !m.geometry.attributes.position) return;
    const nm = m.material.name || '';
    if (/^cloth_/i.test(nm) && TOP.test(nm)) tops.push(m); else if (/^(cloth_|sporran)/i.test(nm) && !LEG_SKIP.test(nm)) skirts.push(m);
  });
  if (!tops.length || !skirts.length) return null;
  let waist = null;
  for (const m of skirts) {
    const rig = legRig(THREE, m), P = m.geometry.attributes.position, n = P.count; if (!rig) continue;
    const hipY = (rig.J[0].y + rig.J[3].y) / 2, ys = new Float32Array(n); let low = 0;
    for (let i = 0; i < n; i++) { ys[i] = P.getY(i); if (ys[i] < hipY - 0.05) low++; }
    if (low < n * 0.05) continue;
    ys.sort(); const y = ys[Math.floor((n - 1) * 0.97)];
    if (y > hipY + 0.35 || y < hipY) continue;
    waist = waist == null ? y : Math.max(waist, y);
  }
  if (waist == null) return null;
  const stats = { tops: 0, dropped: 0, waist: +waist.toFixed(3) }, limit = waist - margin;
  for (const m of tops) {
    const g = m.geometry, idx = g.index; if (!idx || !m.skeleton) continue;
    if (g.userData.underSkirt != null) { stats.tops++; stats.dropped += g.userData.underSkirt; continue; }
    const P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight; if (!SI || !SW) continue;
    const arm = m.skeleton.bones.map((b) => ARM.test(b.name)), keep = [];
    const hidden = (i) => { if (P.getY(i) >= limit) return false; for (let c = 0; c < 4; c++) if (SW.getComponent(i, c) > 0.02 && arm[SI.getComponent(i, c)]) return false; return true; };
    for (let t = 0; t < idx.count; t += 3) { const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2); if (!(hidden(a) && hidden(b) && hidden(c))) keep.push(a, b, c); }
    g.userData.underSkirt = (idx.count - keep.length) / 3; stats.tops++; stats.dropped += g.userData.underSkirt;
    if (keep.length < idx.count) g.setIndex(new THREE.BufferAttribute(P.count > 65535 ? new Uint32Array(keep) : new Uint16Array(keep), 1));
  }
  return stats;
}

// ---------------------------------------------------------------------------------------------------------------------
// Webbing between a hand and a leg.
// The simplified body (level of detail 1, what everyone beyond the nearest few people is drawn with) of the three long-skirted women was decimated in the bind pose, with
// the arms hanging against the thighs: a few of its triangles join a finger vertex to two thigh vertices. As soon as the arm swings away they stretch into long
// skin-coloured wedges that stick out of the skirt (and the detailed body has none).
const WEB_HAND = /^(hand|thumb|index|middle|ring|pinky)/i, WEB_LEG = /^(thigh|calf|pelvis|foot)/i;

/** vertex -> 1 (its heaviest bone is a hand / finger), 2 (a thigh / calf / pelvis / foot) or 0, for a skinned mesh (cached per vertex). */
function webKind(m) {
  const g = m.geometry, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, kind = new Map();
  const names = m.skeleton.bones.map((b) => b.name.replace(/_\d+$/, ''));   // GLTFLoader suffixes the duplicate bone names (thigh_l_5)
  return (i) => {
    let k = kind.get(i);
    if (k === undefined) { let best = 0, bi = 0; for (let c = 0; c < 4; c++) { const w = SW.getComponent(i, c); if (w > best) { best = w; bi = SI.getComponent(i, c); } } const nm = names[bi] || ''; k = WEB_HAND.test(nm) ? 1 : WEB_LEG.test(nm) ? 2 : 0; kind.set(i, k); }
    return k;
  };
}

/** How many triangles of this skinned mesh (as it stands now) join a hand / finger to a leg. */
export function countWebbing(m) {
  const g = m.geometry, idx = g && g.index; if (!idx || !m.skeleton || !g.attributes.skinIndex || !g.attributes.skinWeight) return 0;
  const of = webKind(m); let n = 0;
  for (let t = 0; t < idx.count; t += 3) if ((of(idx.getX(t)) | of(idx.getX(t + 1)) | of(idx.getX(t + 2))) === 3) n++;   // 1 | 2 = a hand and a leg in one triangle
  return n;
}

/** Drop every triangle that has a corner whose heaviest bone is a hand / finger and another whose heaviest bone is a thigh / calf / pelvis / foot. Patches each
 *  shared geometry once. Returns { meshes, dropped } (dropped: triangles) or null when nothing was found. */
export function trimWebbing(THREE, root) {
  const stats = { meshes: 0, dropped: 0 };
  root.traverse((m) => {
    if (!m.isSkinnedMesh || !m.geometry || !m.geometry.index || !m.skeleton || !m.geometry.attributes.skinIndex || !m.geometry.attributes.skinWeight) return;
    const g = m.geometry, idx = g.index;
    if (g.userData.webbing == null) {
      const of = webKind(m), keep = [];
      for (let t = 0; t < idx.count; t += 3) { const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2); if ((of(a) | of(b) | of(c)) !== 3) keep.push(a, b, c); }
      g.userData.webbing = (idx.count - keep.length) / 3;
      if (keep.length < idx.count) g.setIndex(new THREE.BufferAttribute(g.attributes.position.count > 65535 ? new Uint32Array(keep) : new Uint16Array(keep), 1));
    }
    if (g.userData.webbing) { stats.meshes++; stats.dropped += g.userData.webbing; }
  });
  return stats.dropped ? stats : null;
}
