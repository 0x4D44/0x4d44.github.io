// Body fitting for the animated crowd (models/people.glb, people_lod.glb).
// The characters were authored without any collision between their layers: a ponytail hangs straight through a hoodie, a thigh swings out through a
// skirt, a forearm can end up inside a coat. There is no Blender here, so every fix is applied to the loaded meshes (never the .glb files):
//   fitScalp()     - load time, once per skin: the scalp under the hair is drawn again in the hair's colour, so a gap between strands is not a bare patch.
//   fitHair()      - load time, once per geometry: hair that hangs below the neck is pushed out of the garment / skin it is sunk into (bind pose).
//   fitLegs()      - load time: a skirt, dress or kilt is held off the thighs and calves while the character moves (shader patch), and the thigh skin hidden
//                    under it is slimmed (bind pose), so a leg swinging forward no longer comes out through the cloth (see the long comments above fitLegs).
//   trimUnderSkirt() - load time, once per geometry: the part of a top that lies under a skirt's waist edge is not drawn (it only pokes out through the cloth).
//   trimWebbing()  - load time, once per geometry: the triangles of the simplified bodies that join a hand to a thigh are dropped (they stretch into skin-coloured flaps).
//   armRig() / armAxes() / armClip() - load time: the shared clips hang the arms where a slimmer body has room for them, so hands and forearms sink into hips,
//                    skirts and coats. Each character's arm clips are re-keyed with the upper arms turned out by a few degrees (angles solved offline, see armfit.js).
//   armProbe()     - measuring stick for that fit (tests and tools/armfit.mjs; not used while the game runs).
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
// Legs for the people in long socks.
// Five people wear a kilt and knee-length hose. When they were made, the skin that a garment hid in the standing pose was deleted - and for them that was the whole
// leg: the thigh under the kilt, the calf in the sock, and the knee between, which the hem and the sock top just cover when standing. Sitting down, or seen from
// above, there was nothing there: an open sock like a cup, and no leg going into the kilt. The man in Highland dress had no leg skin at all below the hip.
// The socks were holed the same way (half of one was gone), and strips of the suit's trousers were left hanging beside the legs.
// The legs are made again here: a plain tube of skin per leg, hip to mid-calf, bending at the knee, and over it a new sock from where the old one's top was down
// into the shoe, with its turned-over cuff. The shards of the old leg skin, the old socks and the trouser strips are dropped. The tube's radii (a little more) are what the kilt is then held off (fitLegs).
export const HOSE_LEGS = { thigh: 1.5, knee: 1.1, inside: 0.9, under: 0.88, seg: 12, to: 0.62, minHose: 0.03, maxHose: 0.085, hipTaper: 0.45 };

/** radius of a leg tube at t along the thigh (s = 0) or the calf (s = 1), given the radius of the sock just under its top (pure, for the tests) */
export function hoseLegRadius(s, t, rh) {
  const H = HOSE_LEGS, sm = (x) => x * x * (3 - 2 * x);
  if (s === 0) return rh * (H.thigh + (H.knee - H.thigh) * sm(Math.min(1, Math.max(0, t))));   // a thigh is half as thick again as the top of the calf
  if (t < 0.18) return rh * (H.knee + (1.0 - H.knee) * sm(t / 0.18));                              // the knee
  const C = [[0.18, 1], [0.32, 1.04], [0.6, 0.86], [0.85, 0.64], [1, 0.6]]; let i = 0; while (i < C.length - 2 && t > C[i + 1][0]) i++;   // the calf swells, then narrows to the ankle
  const k = Math.min(1, Math.max(0, (t - C[i][0]) / (C[i + 1][0] - C[i][0]))); return rh * (C[i][1] + (C[i + 1][1] - C[i][1]) * sm(k));
}

/** Give a hose wearer legs. Returns { tris, dropped, rh: [l, r], radii (for fitLegs), color } or null (no hose, no skin). Patches the shared skin geometry once. */
export function fitHoseLegs(THREE, root) {
  const T = THREE, H = HOSE_LEGS; let skin = null; const hose = [];
  root.traverse((m) => { if (!m.isSkinnedMesh || !m.material || !m.geometry) return; const n = m.material.name || ''; if (/^skin_/.test(n)) { if (!skin || m.geometry.attributes.position.count > skin.geometry.attributes.position.count) skin = m; } else if (/^hose_#/.test(n)) hose.push(m); });
  if (!skin || !hose.length) return null;
  const g = skin.geometry; if (g.userData.hoseLegs) return g.userData.hoseLegs;
  const rig = legRig(T, skin); if (!rig || !g.index) return null;
  const o = {}, rh = [], top = [];
  for (let L = 0; L < 2; L++) {   // the sock on this leg: how wide it is just under its top, and how far up the calf the top is
    const D = [];
    for (const m of hose) { const hr = legRig(T, m), P = m.geometry.attributes.position; if (!hr) continue; const ha = hr.J[L * 3 + 1], hb = hr.J[L * 3 + 2];
      for (let i = 0; i < P.count; i++) { const d = segDist(P.getX(i), P.getY(i), P.getZ(i), ha, hb, o); if (d < 0.14 && o.t > 0 && o.t < 1) D.push([o.t, d]); } }
    if (D.length < 12) { rh.push(0.055); top.push(0.1); continue; }
    D.sort((x, y) => x[0] - y[0]); const t0 = D[Math.floor(D.length * 0.02)][0], band = D.filter((e) => e[0] < t0 + 0.2).map((e) => e[1]).sort((x, y) => x - y);
    rh.push(Math.min(H.maxHose, Math.max(H.minHose, band[Math.floor(band.length * 0.15)]))); top.push(t0);
  }
  // drop what is left of the old legs (hip to mid-calf): the tube stands in for all of it
  const P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, idx = g.index, keep = [];
  const legW = (i, L) => { let w = 0; for (let c = 0; c < 4; c++) { const bi = SI.getComponent(i, c); if (bi === rig.bone[L * 2] || bi === rig.bone[L * 2 + 1]) w += SW.getComponent(i, c); } return w; };
  const inTube = (i) => { for (let L = 0; L < 2; L++) { if (legW(i, L) < 0.5) continue; const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      segDist(x, y, z, rig.J[L * 3], rig.J[L * 3 + 1], o); const tt = o.t; segDist(x, y, z, rig.J[L * 3 + 1], rig.J[L * 3 + 2], o); if (tt > 0.1 && o.t < 0.94) return true; } return false; };   // (to the ankle: the new sock runs down into the shoe, and the old calf and heel came out through the back of it)
  for (let t = 0; t < idx.count; t += 3) { const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2); if (!(inTube(a) && inTube(b) && inTube(c))) keep.push(a, b, c); }
  const dropped = (idx.count - keep.length) / 3; if (dropped) g.setIndex(new T.BufferAttribute(P.count > 65535 ? new Uint32Array(keep) : new Uint16Array(keep), 1));
  // strips of trousers left from a suit, hanging by the legs: no top reaches below the hips on a leg bone
  let strips = 0;
  root.traverse((m) => { if (!m.isSkinnedMesh || !m.material || !/^cloth_/.test(m.material.name || '') || /tartan|shoe|boot|flat|strap/i.test(m.material.name) || !m.geometry.index || m.geometry.userData.hoseStrips != null) return;
    const mg = m.geometry, mi = mg.index, MI = mg.attributes.skinIndex, MW = mg.attributes.skinWeight; if (!MI || !MW) return; const leg = m.skeleton.bones.map((b) => /^(thigh|calf|foot|ball)_/.test(b.name)), kp = [];
    const on = (i) => { let w = 0; for (let c = 0; c < 4; c++) if (leg[MI.getComponent(i, c)]) w += MW.getComponent(i, c); return w > 0.7; };
    for (let t = 0; t < mi.count; t += 3) { const a = mi.getX(t), b = mi.getX(t + 1), c = mi.getX(t + 2); if (!(on(a) && on(b) && on(c))) kp.push(a, b, c); }
    mg.userData.hoseStrips = (mi.count - kp.length) / 3; strips += mg.userData.hoseStrips; if (kp.length < mi.count) mg.setIndex(new T.BufferAttribute(mg.attributes.position.count > 65535 ? new Uint32Array(kp) : new Uint16Array(kp), 1)); });
  // an Oxford shoe comes with its own white sock, 20 cm up the leg (a few blocky triangles after the decimation): it stood out behind the new hose as a white slab at the heel
  const ankY = Math.max(rig.J[2].y, rig.J[5].y) + 0.035;
  root.traverse((m) => { if (!m.isSkinnedMesh || !m.material || !/shoe/i.test(m.material.name || '') || !m.geometry.index || m.geometry.userData.hoseCollar != null) return;
    const mg = m.geometry, mi = mg.index, MP = mg.attributes.position, kp = [];
    for (let t = 0; t < mi.count; t += 3) { const a = mi.getX(t), b = mi.getX(t + 1), c = mi.getX(t + 2); if (Math.max(MP.getY(a), MP.getY(b), MP.getY(c)) < ankY + 0.02 || Math.min(MP.getY(a), MP.getY(b), MP.getY(c)) < ankY - 0.03) kp.push(a, b, c); }
    mg.userData.hoseCollar = (mi.count - kp.length) / 3; if (kp.length < mi.count) mg.setIndex(new T.BufferAttribute(MP.count > 65535 ? new Uint32Array(kp) : new Uint16Array(kp), 1)); });
  let cuffCol = null; const sockCol = hose[0].material.color ? hose[0].material.color.clone() : new T.Color(0xdddddd), gone = [];
  root.traverse((m) => { if (m.isSkinnedMesh && m.material && /^hose_/.test(m.material.name || '')) { gone.push(m); if (/^hose_cuff/.test(m.material.name) && m.material.color) cuffCol = m.material.color.clone(); } });
  for (const m of gone) if (m.parent) m.parent.remove(m);
  const skinCol = skinColour(T, skin, rig);
  // the tubes
  const pos = [], colr = [], si = [], sw = [], ind = [], N = H.seg, radii = [];
  const st = [[0, 0.04, 1, 0], [0, 0.25, 1, 0], [0, 0.5, 1, 0], [0, 0.74, 1, 0], [0, 0.9, 0.82, 0.18], [0, 1, 0.5, 0.5], [1, 0.07, 0.2, 0.8], [1, 0.18, 0, 1], [1, 0.32, 0, 1], [1, 0.47, 0, 1], [1, H.to, 0, 1]];
  for (let L = 0; L < 2; L++) {
    const hip = rig.J[L * 3], knee = rig.J[L * 3 + 1], ank = rig.J[L * 3 + 2], R = rh[L], t0 = Math.min(0.3, Math.max(0.03, top[L]));
    const sock = [[t0 - 0.006, 0.9, sockCol], [t0, 1.01, sockCol], [0.32, 1, sockCol], [0.47, 1, sockCol], [0.62, 1, sockCol], [0.78, 1, sockCol], [0.9, 1, sockCol], [0.98, 1, sockCol]].filter((e, i) => i < 2 || e[0] > t0 + 0.05);
    const cuff = cuffCol ? [[t0 - 0.008, 0.9, cuffCol], [t0 - 0.004, 1.07, cuffCol], [t0 + 0.085, 1.07, cuffCol], [t0 + 0.088, 1.0, cuffCol]] : [];
    for (const part of [st.map((e) => [e[0], e[1], e[2], e[3], 0, skinCol]), sock.map((e) => [1, e[0], 0, 1, e[1], e[2]]), cuff.map((e) => [1, e[0], 0, 1, e[1], e[2]])]) {
    if (!part.length) continue; const base = pos.length / 3;
    for (const [s, t, wt, wc, k0, cc] of part) {
      const a = s ? knee : hip, b = s ? ank : knee, ax = new T.Vector3().subVectors(b, a).normalize(), c = new T.Vector3().lerpVectors(a, b, t);
      const u = new T.Vector3(1, 0, 0).addScaledVector(ax, -ax.x).normalize(), v = new T.Vector3().crossVectors(ax, u);
      const r = k0 ? hoseLegRadius(1, t, R) * k0 : hoseLegRadius(s, t, R) * (s && t > t0 ? H.inside : H.under) * (s ? 1 : Math.min(1, H.hipTaper + (1 - H.hipTaper) * Math.max(0, t - 0.3) / 0.5));   // (narrow toward the hip: the full thigh came out through the kilt at the side and the back, a bare triangle from waist to mid-kilt - people review 1)
      for (let k = 0; k < N; k++) { const an = k / N * 2 * Math.PI; pos.push(c.x + (u.x * Math.cos(an) + v.x * Math.sin(an)) * r, c.y + (u.y * Math.cos(an) + v.y * Math.sin(an)) * r, c.z + (u.z * Math.cos(an) + v.z * Math.sin(an)) * r); si.push(rig.bone[L * 2], rig.bone[L * 2 + 1], 0, 0); sw.push(wt, wc, 0, 0); colr.push(cc.r, cc.g, cc.b); }
    }
    for (let i = 0; i + 1 < part.length; i++) for (let k = 0; k < N; k++) { const a = base + i * N + k, b = base + i * N + (k + 1) % N, c = base + (i + 1) * N + (k + 1) % N, d = base + (i + 1) * N + k; ind.push(a, b, c, a, c, d); }
    }
    for (const s of [0, 1]) { const r = []; for (let q = 0; q < LEG_STATIONS; q++) r.push(+hoseLegRadius(s, q / (LEG_STATIONS - 1), R).toFixed(4)); radii.push(r); }
  }
  const tg = new T.BufferGeometry(); tg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); tg.setAttribute('color', new T.Float32BufferAttribute(colr, 3)); tg.setAttribute('skinIndex', new T.Uint16BufferAttribute(si, 4)); tg.setAttribute('skinWeight', new T.Float32BufferAttribute(sw, 4));
  tg.setIndex(ind); tg.computeVertexNormals(); tg.computeBoundingSphere(); tg.computeBoundingBox();
  const col = skinCol;
  const mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: skin.material.roughness != null ? skin.material.roughness : 0.7, metalness: 0, side: T.DoubleSide }); mat.name = 'legs_' + (skin.material.name || '');
  const mesh = new T.SkinnedMesh(tg, mat); mesh.name = 'hose_legs'; mesh.position.copy(skin.position); mesh.quaternion.copy(skin.quaternion); mesh.scale.copy(skin.scale);
  mesh.frustumCulled = skin.frustumCulled; mesh.castShadow = false; mesh.receiveShadow = skin.receiveShadow;
  skin.parent.add(mesh); mesh.bind(skin.skeleton, skin.bindMatrix);
  return (g.userData.hoseLegs = { tris: ind.length / 3, dropped, strips, socks: gone.length, rh: rh.map((x) => +x.toFixed(4)), top: top.map((x) => +x.toFixed(3)), radii, color: '#' + col.getHexString() });
}

const SKINCOL = new WeakMap();
/** the colour of a person's skin, on the whole: the middle of what its picture shows on the forearms and hands (bare on everybody) */
function skinColour(THREE, skin, rig) {
  const m = skin.material, col = m.color ? m.color.clone() : new THREE.Color(0xffffff), img = m.map && m.map.image, dflt = new THREE.Color(0xc69a7e);
  if (!img || typeof document === 'undefined') return m.map ? dflt : col;
  let hit = SKINCOL.get(skin.geometry); if (hit) return hit.clone();
  try {
    const cv = document.createElement('canvas'), w = cv.width = 256, h = cv.height = 256, x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h); const px = x.getImageData(0, 0, w, h).data;
    const g = skin.geometry, uv = g.attributes.uv, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, arm = skin.skeleton.bones.map((b) => /^(lowerarm|hand)_/.test(b.name)); let r = 0, gg = 0, b = 0, k = 0;
    for (let i = 0; i < uv.count; i++) { let wa = 0; for (let c = 0; c < 4; c++) if (arm[SI.getComponent(i, c)]) wa += SW.getComponent(i, c); if (wa < 0.8) continue;
      const u = uv.getX(i), vv = m.map.flipY ? 1 - uv.getY(i) : uv.getY(i), X = Math.min(w - 1, Math.max(0, Math.floor((u - Math.floor(u)) * w))), Y = Math.min(h - 1, Math.max(0, Math.floor((vv - Math.floor(vv)) * h))), j = (Y * w + X) * 4; r += px[j]; gg += px[j + 1]; b += px[j + 2]; k++; }
    void rig; hit = k > 20 ? col.multiply(new THREE.Color().setRGB(r / k / 255, gg / k / 255, b / k / 255, THREE.SRGBColorSpace)) : dflt;
  } catch (e) { hit = dflt; }
  SKINCOL.set(skin.geometry, hit); return hit.clone();
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
    // what is left reaching below the line is lifted on to it: the dropped triangles left the hem as saw-teeth hanging over the skirt (people review 2, woman_midi)
    for (let i = 0; i < P.count; i++) if (hidden(i)) P.setY(i, limit);
    P.needsUpdate = true;
    g.userData.underSkirt = (idx.count - keep.length) / 3; stats.tops++; stats.dropped += g.userData.underSkirt;
    if (keep.length < idx.count) g.setIndex(new THREE.BufferAttribute(P.count > 65535 ? new Uint32Array(keep) : new Uint16Array(keep), 1));
  }
  return stats;
}

const NOTLEG = /arm|hand|clavicle|shoulder|neck|head|thumb|index|middle|ring|pinky|finger/i;
/** Drop the skin under a pair of trousers or shorts. The pipeline masks the body away under the clothes only where the garment's own mask says so, and what is left
 *  (seat, backs of the thighs, hips) comes through the cloth as soon as the person sits or strides: skin-coloured holes in the trousers (people review 1). Nothing
 *  under trousers is ever meant to be seen, so every skin triangle that lies wholly between the garment's waist edge and its leg openings (margin 4 cm from each), and
 *  carries no arm or hand weight (a hand beside the thigh is at the same height), goes. Not for skirts, kilts or dresses: under those the legs are seen from below.
 *  Returns { dropped, lo, hi } or null (no such garment). */
export function trimUnderTrousers(THREE, root, o = {}) {
  const margin = o.margin != null ? o.margin : 0.04; let skin = null; const legs = [];
  root.traverse((m) => {
    if (!m.isSkinnedMesh || !m.material || !m.geometry || !m.geometry.attributes.position) return;
    const nm = m.material.name || '';
    if (/^skin_/i.test(nm)) skin = m; else if (/^cloth_/i.test(nm) && !LEG_SKIP.test(nm)) legs.push(m);
  });
  if (!skin || !legs.length || !skin.skeleton) return null;
  const rig = legRig(THREE, skin); if (!rig) return null;
  const hipY = (rig.J[0].y + rig.J[3].y) / 2; let lo = null, hi = null;
  for (const m of legs) {
    const P = m.geometry.attributes.position, n = P.count, ys = new Float32Array(n); for (let i = 0; i < n; i++) ys[i] = P.getY(i); ys.sort();
    const top = ys[Math.floor((n - 1) * 0.9)], bot = ys[Math.floor((n - 1) * 0.02)];
    if (top > hipY + 0.3 || top < hipY - 0.02 || bot > hipY - 0.12) continue;   // a top, a dress, a belt: not legwear
    lo = lo == null ? bot : Math.min(lo, bot); hi = hi == null ? top : Math.max(hi, top);
  }
  if (lo == null) return null;
  const g = skin.geometry, idx = g.index, P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight; if (!idx || !SI || !SW) return null;
  if (g.userData.underTrousers != null) return { dropped: g.userData.underTrousers, lo: +lo.toFixed(3), hi: +hi.toFixed(3) };
  const leg = skin.skeleton.bones.map((b) => !NOTLEG.test(b.name)), y0 = lo + margin, y1 = hi - margin, keep = [];
  const hidden = (i) => { const y = P.getY(i); if (y <= y0 || y >= y1) return false; for (let c = 0; c < 4; c++) if (SW.getComponent(i, c) > 0.02 && !leg[SI.getComponent(i, c)]) return false; return true; };
  for (let t = 0; t < idx.count; t += 3) { const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2); if (!(hidden(a) && hidden(b) && hidden(c))) keep.push(a, b, c); }
  g.userData.underTrousers = (idx.count - keep.length) / 3;
  if (keep.length < idx.count) g.setIndex(new THREE.BufferAttribute(P.count > 65535 ? new Uint32Array(keep) : new Uint16Array(keep), 1));
  return { dropped: g.userData.underTrousers, lo: +lo.toFixed(3), hi: +hi.toFixed(3) };
}

/** Draw in the part of a pair of trousers that lies inside a top worn over it (above the top's hem). The waistband of the low-poly trousers came
 *  through a tank top or a sweater as dark shards across the small of the back, worst on the simplified model (people review 2: ya_tattoo_tank, woman_elder).
 *  Returns { dropped (vertices moved), hem } or null. */
export function trimUnderTop(THREE, root, o = {}) {
  const inset = o.inset != null ? o.inset : 0.015, tops = [], legs = [];
  root.traverse((m) => {
    if (!m.isSkinnedMesh || !m.material || !m.geometry || !m.geometry.attributes.position) return;
    const nm = m.material.name || '';
    if (!/^cloth_/i.test(nm)) return;
    if (/sweater|camisole|shirt|tank|top|hood|blouse|tee|polo/i.test(nm) && !/shoe|boot|sock|tucked|jacket|suit/i.test(nm)) tops.push(m);   // (not an open jacket, nor a shirt tucked in)
    else if (!LEG_SKIP.test(nm)) legs.push(m);
  });
  if (!tops.length || !legs.length) return null;
  let hem = 1e9;
  for (const m of tops) { const P = m.geometry.attributes.position, n = P.count, ys = new Float32Array(n); for (let i = 0; i < n; i++) ys[i] = P.getY(i); ys.sort(); const lo = ys[Math.floor((n - 1) * 0.02)], hi = ys[n - 1]; if (hi - lo > 0.25) hem = Math.min(hem, lo); }
  if (hem > 5) return null;
  let dropped = 0;
  for (const m of legs) {
    const g = m.geometry, idx = g.index, P = g.attributes.position; if (!idx) continue;
    if (g.userData.underTop != null) { dropped += g.userData.underTop; continue; }
    let hi = -1e9; for (let i = 0; i < P.count; i++) hi = Math.max(hi, P.getY(i)); if (hi <= hem) { g.userData.underTop = 0; continue; }
    // under the top the trousers are drawn in, along their own normals, by up to `inset` (eased in over the first 2 cm above the hem): solid still, but behind the
    // top's cloth (the body there is dropped by trimUnderTrousers, so nothing is pushed into view). Dropping them instead opened holes when a sweater rode up.
    const N = g.attributes.normal; let moved = 0;
    if (N) for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y <= hem) continue; const k = inset * Math.min(1, (y - hem) / 0.02); P.setXYZ(i, P.getX(i) - N.getX(i) * k, y - N.getY(i) * k, P.getZ(i) - N.getZ(i) * k); moved++; }
    P.needsUpdate = true; g.userData.underTop = moved; dropped += moved;
  }
  return { dropped, hem: +hem.toFixed(3) };
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

// ---------------------------------------------------------------------------------------------------------------------
// Stiff shoes.
// A shoe bends at the ball of the foot and nowhere else. The authored skin weights smear that one bend over the whole toe box (the front of the sole is
// ~60 % toe bone and ~40 % foot bone), which does no harm while the toes hardly move - but a stride's push-off bends the toe joint 50-70 degrees with the heel
// in the air, and a toe box that is half carried by the foot then dips 7-10 mm below the floor the toe bone is standing on (measured on the rendered mesh, tools/people_motion.mjs).
// Re-weighting the vertices that only the foot and the toe bone carry to a narrow blend about the ball joint (all foot behind it, all toe bone ahead of it) turns the shoe
// into the two rigid parts and the hinge the gait plants: the dip falls to 3-5 mm. Patches each shared geometry once. Returns { meshes, verts } or null when there is no shoe to fit.
const SHOE = /shoe|boot|sneaker|flats/i;
export function fitShoes(THREE, root, o = {}) {
  const half = o.blend == null ? 0.02 : o.blend, stats = { meshes: 0, verts: 0 };
  root.updateMatrixWorld(true);
  root.traverse((m) => {
    if (!m.isSkinnedMesh || !m.geometry || !m.skeleton || !m.geometry.attributes.skinIndex || !m.geometry.attributes.skinWeight) return;
    if (!SHOE.test((m.material && m.material.name) || m.name)) return;
    const g = m.geometry, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, P = g.attributes.position;
    if (g.userData.shoeFit == null) {
      const names = m.skeleton.bones.map((b) => b.name.replace(/_\d+$/, '')), side = {}, v = new THREE.Vector3();
      for (const s of ['l', 'r']) {
        const fi = names.indexOf('foot_' + s), bi = names.indexOf('ball_' + s); if (fi < 0 || bi < 0) continue;
        const a = m.skeleton.bones[fi].getWorldPosition(new THREE.Vector3()), b = m.skeleton.bones[bi].getWorldPosition(new THREE.Vector3());
        side[fi] = side[bi] = { fi, bi, ball: b, ax: new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize() };   // ax: along the foot, heel to toe, level
      }
      let n = 0;
      for (let i = 0; i < P.count; i++) {
        const idx = []; for (let c = 0; c < 4; c++) if (SW.getComponent(i, c) > 1e-4) idx.push(SI.getComponent(i, c));
        const S = side[idx[0]]; if (!S || idx.some((k) => side[k] !== S)) continue;   // only vertices that one foot and its toe bone carry between them
        m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld);
        const t = ((v.x - S.ball.x) * S.ax.x + (v.z - S.ball.z) * S.ax.z) / half, u = Math.max(0, Math.min(1, 0.5 + 0.5 * t)), wb = u * u * (3 - 2 * u);   // 0 behind the ball joint, 1 ahead of it
        SI.setXYZW(i, S.fi, S.bi, 0, 0); SW.setXYZW(i, 1 - wb, wb, 0, 0); n++;
      }
      g.userData.shoeFit = n; SI.needsUpdate = true; SW.needsUpdate = true;
    }
    if (g.userData.shoeFit) { stats.meshes++; stats.verts += g.userData.shoeFit; }
  });
  return stats.verts ? stats : null;
}


// ---------------------------------------------------------------------------------------------------------------------
// Arms kept out of the body.
// The shared clips (idle, walk, sit, hold-the-rail ...) were keyed on one slimmer body: the arms hang and swing where that body has room for them. On the
// real characters - hips and thighs, a skirt's flare, a coat's hem, a hoodie - the forearm and hand end up inside the body and vanish (4-13 cm deep in
// almost every standing clip, 18 cm in walk_bag). A vertex-shader push cannot cure it: the hand would only be squashed flat against the outline. The cure is
// the one an animator uses - turn the arm out from the shoulder until the hand clears the hip. Each character's arm clips are re-keyed once, at load, with
// every upper-arm key turned (abducted) by a constant angle about the axis that carries the hanging arm outwards. The angles (per character, clip and side)
// were solved offline against the real skinned skin + cloth, as the smallest turn that leaves the forearm and hand outside the outline of everything else
// near them; they live in armfit.js and tools/armfit.mjs regenerates them. Premultiplying every key of a slerped track by one rotation is exact, so the
// baked clip plays just like the original with the shoulders turned.

const armBones = (root) => { const b = {}; root.traverse((o) => { if (o.isBone) b[o.name.replace(/_\d+$/, '')] = o; }); return b; };

/** What a rig needs for turning its arms out, read in the bind pose of the template: per side the outward direction (in the shoulder's parent frame) and the
 *  direction of the upper arm to the elbow (in the upper arm's own frame). null when the rig has no arms. */
export function armRig(THREE, root) {
  root.updateMatrixWorld(true);
  const b = armBones(root), rq = new THREE.Quaternion(), rp = new THREE.Vector3(); root.getWorldQuaternion(rq); root.getWorldPosition(rp);
  const lat = new THREE.Vector3(1, 0, 0).applyQuaternion(rq), rig = {};   // the character's left-right axis: the rig faces +/- z
  for (const sd of ['l', 'r']) {
    const up = b['upperarm_' + sd], lo = b['lowerarm_' + sd]; if (!up || !lo || !up.parent || lo.position.lengthSq() < 1e-10) return null;
    const pq = new THREE.Quaternion(), sp = new THREE.Vector3(); up.parent.getWorldQuaternion(pq); up.getWorldPosition(sp);
    const sgn = Math.sign(sp.sub(rp).dot(lat)) || 1;
    rig[sd] = { out: lat.clone().multiplyScalar(sgn).applyQuaternion(pq.clone().invert()).normalize(), dir: lo.position.clone().normalize() };
  }
  return rig;
}

/** The axis (in the shoulder's parent frame) that turns this clip's hanging upper arm outwards, per side - the arm's direction x the outward direction, from the
 *  clip's first key. A side is missing when the arm already points straight out (nothing to turn). Clip tracks must carry the canonical bone names. */
export function armAxes(THREE, rig, clip) {
  const ax = {};
  for (const sd of ['l', 'r']) {
    const r = rig && rig[sd], tr = clip.tracks.find((t) => t.name === 'upperarm_' + sd + '.quaternion'); if (!r || !tr) continue;
    const d = r.dir.clone().applyQuaternion(new THREE.Quaternion(tr.values[0], tr.values[1], tr.values[2], tr.values[3])), a = new THREE.Vector3().crossVectors(d, r.out);
    if (a.lengthSq() > 0.04) ax[sd] = a.normalize();
  }
  return ax;
}

/** A copy of the clip (same name, same length, the other tracks shared) whose upper-arm keys are turned out by degL / degR degrees about axes[side]. */
export function armClip(THREE, clip, axes, degL, degR) {
  const q = new THREE.Quaternion(), a = new THREE.Quaternion(); let changed = false;
  const tracks = clip.tracks.map((tr) => {
    const m = /^upperarm_([lr])\.quaternion$/.exec(tr.name); if (!m) return tr;
    const deg = m[1] === 'l' ? degL : degR, ax = axes[m[1]]; if (!ax || !(deg > 0.05)) return tr;
    q.setFromAxisAngle(ax, deg * Math.PI / 180); const nt = tr.clone(), v = nt.values;
    for (let i = 0; i < v.length; i += 4) { a.set(v[i], v[i + 1], v[i + 2], v[i + 3]).premultiply(q); v[i] = a.x; v[i + 1] = a.y; v[i + 2] = a.z; v[i + 3] = a.w; }
    changed = true; return nt;
  });
  return changed ? new THREE.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode) : clip;
}

/** Measuring stick for the arm fit. Wraps one clone (canonical bone names) of a character: pose(clip, t) poses it and files everything that is not an arm into a
 *  height x depth grid of left / right outline extents; depth(turn) then says, per side, how deep the forearm / hand (and the upper arm beyond the shoulder) lie
 *  inside that outline: the 95th percentile (m) of the vertices' distance inside the outermost body vertex found within about +-3 cm up and +-6 cm front-back.
 *  turn = { l: [axis, radians], r: [axis, radians] } turns the shoulders further, for the solver. Returns { l, r, nl, nr } (n = vertices deeper than 2 cm). */
export function armProbe(THREE, obj) {
  const meshes = []; obj.traverse((m) => { if (m.isSkinnedMesh && m.skeleton && m.geometry.attributes.skinIndex && m.geometry.attributes.skinWeight) meshes.push(m); });
  const bones = armBones(obj), v = new THREE.Vector3(), q = new THREE.Quaternion(), mixer = new THREE.AnimationMixer(obj);
  const ARM = /^(hand|thumb|index|middle|ring|pinky|lowerarm)/i, UP = /^upperarm/i, NY = 128, NZ = 56, Y0 = -0.1, Z0 = -1.1, DY = 0.02, DZ = 0.04;
  const gmax = new Float32Array(NY * NZ), gmin = new Float32Array(NY * NZ);
  const parts = meshes.map((m) => {   // per vertex: 0 body, 1 forearm / hand, 2 upper arm; and the side of an arm vertex
    const g = m.geometry, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, n = g.attributes.position.count, names = m.skeleton.bones.map((b) => b.name.replace(/_\d+$/, '')),
      kind = new Int8Array(n), side = new Int8Array(n), arm = [];
    for (let i = 0; i < n; i++) {
      let best = 0, bi = 0; for (let c = 0; c < 4; c++) { const w = SW.getComponent(i, c); if (w > best) { best = w; bi = SI.getComponent(i, c); } }
      const nm = names[bi] || ''; kind[i] = ARM.test(nm) ? 1 : UP.test(nm) ? 2 : 0; side[i] = /_l$/.test(nm) ? 1 : /_r$/.test(nm) ? -1 : 0; if (kind[i] && side[i]) arm.push(i);
    }
    return { m, kind, side, arm: Int32Array.from(arm) };
  });
  const cell = (y, z) => Math.max(0, Math.min(NY - 1, Math.floor((y - Y0) / DY))) * NZ + Math.max(0, Math.min(NZ - 1, Math.floor((z - Z0) / DZ)));
  const saved = { l: new THREE.Quaternion(), r: new THREE.Quaternion() }, sh = { l: new THREE.Vector3(), r: new THREE.Vector3() };
  let act = null;
  const skinAll = () => { obj.updateMatrixWorld(true); for (const p of parts) p.m.skeleton.update(); };
  return {
    /** pose the clone at time t of the clip and file the body into the grid */
    pose(clip, t) {
      if (!act || act.getClip() !== clip) { mixer.stopAllAction(); mixer.uncacheRoot(obj); act = mixer.clipAction(clip); act.play(); }
      mixer.setTime(t); skinAll(); gmax.fill(-9); gmin.fill(9);
      const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();   // everything is measured in the clone's own frame (x = left-right, y = up, z = front-back)
      for (const sd of ['l', 'r']) { const b = bones['upperarm_' + sd]; saved[sd].copy(b.quaternion); b.getWorldPosition(sh[sd]).applyMatrix4(inv); }
      for (const p of parts) {
        const n = p.kind.length, M = new THREE.Matrix4().multiplyMatrices(inv, p.m.matrixWorld);
        for (let i = 0; i < n; i++) { if (p.kind[i]) continue; p.m.getVertexPosition(i, v).applyMatrix4(M); const c = cell(v.y, v.z); if (v.x > gmax[c]) gmax[c] = v.x; if (v.x < gmin[c]) gmin[c] = v.x; }
      }
    },
    /** burial of the arms in the pose, with the shoulders turned further by turn (or not at all) */
    depth(turn) {
      const bl = bones.upperarm_l, br = bones.upperarm_r;
      if (turn) for (const sd of ['l', 'r']) if (turn[sd] && turn[sd][0]) bones['upperarm_' + sd].quaternion.premultiply(q.setFromAxisAngle(turn[sd][0], turn[sd][1]));
      skinAll();
      const ds = { l: [], r: [] }, inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
      for (const p of parts) for (let j = 0, M = new THREE.Matrix4().multiplyMatrices(inv, p.m.matrixWorld); j < p.arm.length; j++) {
        const i = p.arm[j], sd = p.side[i] > 0 ? 'l' : 'r'; p.m.getVertexPosition(i, v).applyMatrix4(M);
        if (p.kind[i] === 2 && v.distanceTo(sh[sd]) < 0.14) continue;   // the shoulder itself belongs to the body
        const sg = sh[sd].x >= 0 ? 1 : -1, cy = Math.floor((v.y - Y0) / DY), cz = Math.floor((v.z - Z0) / DZ); let ext = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
          const yy = cy + dy, zz = cz + dz; if (yy < 0 || yy >= NY || zz < 0 || zz >= NZ) continue; const c = yy * NZ + zz, e = sg > 0 ? gmax[c] : -gmin[c]; if (e > ext && e < 5) ext = e;
        }
        ds[sd].push(Math.max(0, ext - sg * v.x));
      }
      bl.quaternion.copy(saved.l); br.quaternion.copy(saved.r);   // the mixer will not rewrite an unchanged key: leave the bones as it left them
      const pct = (a) => { if (a.length < 8) return 0; a.sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * 0.95))]; };
      return { l: pct(ds.l), r: pct(ds.r), nl: ds.l.filter((d) => d > 0.02).length, nr: ds.r.filter((d) => d > 0.02).length };
    },
  };
}

// ---- the scalp under the hair ----
// Some hair is an open shell of strands (the ponytail, the bun) or a picture with see-through gaps: between the strands the bare, skin-coloured scalp shows in
// patches. Nobody's scalp looks like that - hair grows out of it. So the part of the head's skin that lies under the hair is drawn once more, in the colour of
// the hair, as a thin cap on the skin: a gap in the hair now shows hair-coloured roots. The cap uses the skin's own vertices (no new geometry, same bones).
// Which skin is "under the hair": seen from the middle of the head, some hair lies in that direction, near the skin. Small holes in that cover are closed up
// (they are the very patches this is for); the face, the ears and the neck are never included.
const SCALP = { near: 0.6, under: 0.07, ang: 0.07, close: 0.34, sparse: 0.6, brow: 0.92, ear: 0.2, front: 0.3, back: 0.7, nape: 1.0, minTris: 12, smooth: 3 };   // lengths in eye-to-eye distances

/** Give a character a hair-coloured scalp under its hair. root: the character's node (bind pose). Returns { tris, verts, covered, filled, color } or null
 *  (no hair, no eyes, no head, or nothing of the scalp is under hair). Runs once per skin geometry; a second call returns the first result. */
export function fitScalp(THREE, root, o = {}) {
  const T = THREE, S = Object.assign({}, SCALP, o); let skin = null, eye = null; const hair = [];
  root.traverse((m) => { if (!m.isSkinnedMesh || !m.material || !m.geometry) return; const n = m.material.name || ''; if (isHair(m)) hair.push(m); else if (/^skin_/.test(n)) skin = skin || m; else if (/^eye_/.test(n)) eye = eye || m; });
  if (!skin || !hair.length) return null;
  const g = skin.geometry; if (g.userData.scalp !== undefined) return g.userData.scalp;
  g.userData.scalp = null;
  const P = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, head = jointBind(T, skin, /^head(_\d+)?$/), hi = skin.skeleton.bones.findIndex((b) => /^head(_\d+)?$/.test(b.name));
  if (!head || hi < 0 || !si || !sw || !eye) return null;
  // the eyes: the line they are on, how far apart, which way the face looks
  const E = eye.geometry.attributes.position; let mx = 0; for (let i = 0; i < E.count; i++) mx += E.getX(i); mx /= E.count || 1;
  const c = [[0, 0, 0, 0], [0, 0, 0, 0]]; for (let i = 0; i < E.count; i++) { const k = E.getX(i) < mx ? 0 : 1; c[k][0] += E.getX(i); c[k][1] += E.getY(i); c[k][2] += E.getZ(i); c[k][3]++; }
  if (c[0][3] < 3 || c[1][3] < 3) return null; for (const k of c) { k[0] /= k[3]; k[1] /= k[3]; k[2] /= k[3]; }
  const d = Math.hypot(c[0][0] - c[1][0], c[0][1] - c[1][1], c[0][2] - c[1][2]), ex = (c[0][0] + c[1][0]) / 2, ey = (c[0][1] + c[1][1]) / 2, ez = (c[0][2] + c[1][2]) / 2; if (!(d > 0.02 && d < 0.12)) return null;
  let fx = ex - head.x, fz = ez - head.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
  const cx = ex - fx * 1.35 * d, cy = ey + 0.55 * d, cz = ez - fz * 1.35 * d;   // about the middle of the skull
  // the hair, as points seen from there: which way, how far out
  const cell = S.ang, key = (x, y, z) => (Math.floor(x / cell) + 64) * 16384 + (Math.floor(y / cell) + 64) * 128 + (Math.floor(z / cell) + 64), dirs = new Map();
  const put = (x, y, z) => { const dx = x - cx, dy = y - cy, dz = z - cz, r = Math.hypot(dx, dy, dz); if (r < 1e-4) return; const ux = dx / r, uy = dy / r, uz = dz / r, k = key(ux, uy, uz); let a = dirs.get(k); if (!a) dirs.set(k, a = []); a.push(ux, uy, uz, r); };
  for (const h of hair) { const t = triangles(h.geometry);
    for (let i = 0; i < t.length; i += 9) { const L = Math.max(Math.hypot(t[i + 3] - t[i], t[i + 4] - t[i + 1], t[i + 5] - t[i + 2]), Math.hypot(t[i + 6] - t[i], t[i + 7] - t[i + 1], t[i + 8] - t[i + 2]), Math.hypot(t[i + 6] - t[i + 3], t[i + 7] - t[i + 4], t[i + 8] - t[i + 5]));
      if (Math.min(t[i + 1], t[i + 4], t[i + 7]) < ey - 2.5 * d && Math.max(t[i + 1], t[i + 4], t[i + 7]) < ey - 2.5 * d) continue;   // (hair far below the head)
      const n = Math.max(1, Math.min(8, Math.ceil(L / (0.09 * d))));
      for (let a = 0; a <= n; a++) for (let b = 0; a + b <= n; b++) { const u = a / n, v = b / n, w = 1 - u - v; put(t[i] * w + t[i + 3] * u + t[i + 6] * v, t[i + 1] * w + t[i + 4] * u + t[i + 7] * v, t[i + 2] * w + t[i + 5] * u + t[i + 8] * v); } } }
  // the skin of the head that could be scalp
  const n = P.count, cand = new Uint8Array(n), cov = new Uint8Array(n); let nc = 0, ncov = 0;
  for (let i = 0; i < n; i++) {
    let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === hi) w += sw.getComponent(i, k); if (w < 0.5) continue;
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), up = (y - ey) / d, fw = ((x - cx) * fx + (z - cz) * fz) / d;
    if ((up < S.ear && !(fw < -S.back && up > -S.nape)) || (fw > S.front && up < S.brow)) continue;   // the face, the ears, the neck (but the back of the head down to the nape)
    cand[i] = 1; nc++;
    const dx = x - cx, dy = y - cy, dz = z - cz, r = Math.hypot(dx, dy, dz), ux = dx / r, uy = dy / r, uz = dz / r;
    look: for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) { const A = dirs.get(key(ux + a * cell, uy + b * cell, uz + e * cell)); if (!A) continue;
      for (let j = 0; j < A.length; j += 4) if (A[j + 3] > r - S.under * d && A[j + 3] < r + S.near * d && (A[j] - ux) ** 2 + (A[j + 1] - uy) ** 2 + (A[j + 2] - uz) ** 2 < cell * cell) { cov[i] = 1; ncov++; break look; } }
  }
  if (!ncov) return null;
  // close the small holes: grow the cover by a little, then shrink it back by as much
  const R = S.close * d, gc = R, gk = (x, y, z) => (Math.floor(x / gc) + 512) * 1048576 + (Math.floor(y / gc) + 512) * 1024 + (Math.floor(z / gc) + 512), grid = new Map();
  for (let i = 0; i < n; i++) if (cand[i]) { const k = gk(P.getX(i), P.getY(i), P.getZ(i)); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i); }
  const nearAny = (i, flag, want) => { const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) { const A = grid.get(gk(x + a * gc, y + b * gc, z + e * gc)); if (!A) continue;
      for (const j of A) if (flag[j] === want && (P.getX(j) - x) ** 2 + (P.getY(j) - y) ** 2 + (P.getZ(j) - z) ** 2 < R * R) return true; }
    return false; };
  const dil = new Uint8Array(n), keep = new Uint8Array(n); let filled = 0, verts = 0;
  const sparse = ncov < S.sparse * nc;   // hair that covers less than this much of the scalp is a few strands on a bare head (the bun): the whole scalp is hair then, pulled back flat
  for (let i = 0; i < n; i++) if (cand[i]) dil[i] = sparse || cov[i] || nearAny(i, cov, 1) ? 1 : 0;
  for (let i = 0; i < n; i++) if (cand[i] && dil[i]) { keep[i] = cov[i] || !nearAny(i, dil, 0) ? 1 : 0; if (keep[i]) { verts++; if (!cov[i]) filled++; } }
  const idx = g.index, m = idx ? idx.count : n, out = [];
  // how covered each vertex is, smoothed over its neighbours (welded by place: the head's seams must not stop it), so the edge of the cap runs as a line and not from vertex to vertex
  const cv = new Float32Array(n); for (let i = 0; i < n; i++) cv[i] = keep[i];
  if (!sparse) { const wk = (i) => Math.round(P.getX(i) * 2e4) + ',' + Math.round(P.getY(i) * 2e4) + ',' + Math.round(P.getZ(i) * 2e4), wid = new Int32Array(n).fill(-1), wm = new Map(); let nw = 0;
    for (let i = 0; i < n; i++) if (cand[i]) { const k = wk(i); let w = wm.get(k); if (w === undefined) wm.set(k, w = nw++); wid[i] = w; }
    const nb = Array.from({ length: nw }, () => new Set());
    for (let k = 0; k < m; k += 3) { const t = [0, 1, 2].map((j) => wid[idx ? idx.getX(k + j) : k + j]); if (t[0] < 0 || t[1] < 0 || t[2] < 0) continue; for (let j = 0; j < 3; j++) { nb[t[j]].add(t[(j + 1) % 3]); nb[t[j]].add(t[(j + 2) % 3]); } }
    let v = new Float32Array(nw); for (let i = 0; i < n; i++) if (wid[i] >= 0) v[wid[i]] = Math.max(v[wid[i]], keep[i]);
    for (let it = 0; it < S.smooth; it++) { const u = new Float32Array(nw); for (let w = 0; w < nw; w++) { let a = v[w], c = 1; for (const j of nb[w]) { a += v[j]; c++; } u[w] = a / c; } v = u; }
    for (let i = 0; i < n; i++) cv[i] = wid[i] >= 0 ? v[wid[i]] : 0; }
  // (a bare head with a few strands: every triangle of the head near the scalp is in, and the hairline is cut smoothly across them when they are drawn)
  const headW = (i) => { let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === hi) w += sw.getComponent(i, k); return w >= 0.5 && (P.getY(i) - ey) / d > -S.nape - 0.4; };
  for (let k = 0; k < m; k += 3) { const a = idx ? idx.getX(k) : k, b = idx ? idx.getX(k + 1) : k + 1, e = idx ? idx.getX(k + 2) : k + 2;
    if (sparse ? (keep[a] || keep[b] || keep[e]) && headW(a) && headW(b) && headW(e) : Math.max(cv[a], cv[b], cv[e]) >= 0.5 && cand[a] && cand[b] && cand[e]) out.push(a, b, e); }
  if (out.length < S.minTris * 3) return null;
  // the cap: the same vertices, its own triangles, the colour of the hair
  const cg = new T.BufferGeometry(); for (const a of ['position', 'normal', 'skinIndex', 'skinWeight']) if (g.attributes[a]) cg.setAttribute(a, g.attributes[a]);
  cg.setIndex(out); if (g.boundingSphere) cg.boundingSphere = g.boundingSphere.clone(); if (g.boundingBox) cg.boundingBox = g.boundingBox.clone();
  const hm = hair[0].material, col = hairColour(T, hm);
  const mat = new T.MeshStandardMaterial({ color: col, roughness: Math.max(0.92, hm.roughness != null ? hm.roughness : 0), metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); mat.name = 'scalp_' + (hm.name || '');
  if (!sparse) {   // the edge of the cap is cut across its outermost triangles, half way between a covered vertex and a bare one, so the hairline is a smooth line and not the saw-teeth of the mesh
    // ...and at the front it stops at a rounded hairline set back from the brow and curving down to the ears (people review 2: the hair's see-through wisps at the
    // temples were filled with flat hair colour, a square notch at each side of the forehead). Behind the temples the covered cut alone decides.
    cg.setAttribute('aScCov', new T.BufferAttribute(cv, 1));
    const U = { uScC: { value: new T.Vector3(cx, ey, cz) }, uScF: { value: new T.Vector2(fx, fz) }, uScD: { value: d } };
    mat.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute float aScCov; varying float vScCov; varying vec3 vScRest;\nvoid main() {').replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvScCov = aScCov; vScRest = position;');
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', `varying float vScCov; varying vec3 vScRest; uniform vec3 uScC; uniform vec2 uScF; uniform float uScD;
void main() {
\tif (vScCov < 0.5) discard;
\tvec2 scq = vScRest.xz - uScC.xz; float scf = dot(scq, uScF), scs = abs(dot(scq, vec2(uScF.y, -uScF.x))), sct = atan(scs, scf);
\tif (sct < 1.6 && (vScRest.y - uScC.y) / uScD < mix(${(S.brow + 1.3).toFixed(3)}, ${S.ear.toFixed(3)}, smoothstep(1.0, 1.8, sct))) discard;`); };
    mat.customProgramCacheKey = () => 'scalpedge3';
  }

  if (sparse) {   // the hairline, in the head's own (bind) space: high over the brow, down past the temple to just over the ear, down again to the nape behind it
    const U = { uScC: { value: new T.Vector3(cx, ey, cz) }, uScF: { value: new T.Vector2(fx, fz) }, uScD: { value: d } };
    mat.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'varying vec3 vScRest;\nvoid main() {').replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvScRest = position;');
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', `varying vec3 vScRest; uniform vec3 uScC; uniform vec2 uScF; uniform float uScD;
void main() {
\tvec2 scq = vScRest.xz - uScC.xz; float scf = dot(scq, uScF), scs = abs(dot(scq, vec2(uScF.y, -uScF.x))), sct = atan(scs, scf);
\tfloat scl = mix(${(S.brow - 0.1).toFixed(3)}, ${S.ear.toFixed(3)}, smoothstep(0.85, 1.5, sct)); scl = mix(scl, ${(-S.nape + 0.1).toFixed(3)}, smoothstep(2.0, 2.5, sct));
\tif ((vScRest.y - uScC.y) / uScD < scl) discard;`); };
    mat.customProgramCacheKey = () => 'scalpline1';
  }
  const cap = new T.SkinnedMesh(cg, mat); cap.name = 'scalp_cap'; cap.position.copy(skin.position); cap.quaternion.copy(skin.quaternion); cap.scale.copy(skin.scale);
  cap.frustumCulled = skin.frustumCulled; cap.castShadow = false; cap.receiveShadow = skin.receiveShadow; cap.renderOrder = skin.renderOrder;
  skin.parent.add(cap); cap.bind(skin.skeleton, skin.bindMatrix);
  return (g.userData.scalp = { tris: out.length / 3, verts, covered: verts - filled, filled, cand: nc, sparse, color: '#' + col.getHexString() });
}

const HAIRCOL = new WeakMap();
/** the colour hair is drawn in, on the whole: the middle of its picture where it is not see-through, times the material's colour */
function hairColour(THREE, m) {
  const col = m.color ? m.color.clone() : new THREE.Color(0x2a2018), img = m.map && m.map.image;
  if (!img || typeof document === 'undefined') return m.map ? col.multiplyScalar(0.55) : col;
  let a = HAIRCOL.get(img);
  if (a === undefined) { a = null; try { const cv = document.createElement('canvas'), w = cv.width = 64, h = cv.height = 64, x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h); const px = x.getImageData(0, 0, w, h).data; let r = 0, gg = 0, b = 0, k = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 128) { r += px[i]; gg += px[i + 1]; b += px[i + 2]; k++; } if (k) a = new THREE.Color().setRGB(r / k / 255, gg / k / 255, b / k / 255, THREE.SRGBColorSpace); } catch (e) { a = null; } HAIRCOL.set(img, a); }
  return a ? col.multiply(a) : col.multiplyScalar(0.55);
}
