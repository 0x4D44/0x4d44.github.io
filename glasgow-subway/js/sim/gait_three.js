// Puts js/sim/gait.js (pure maths) on the live skeleton of a person: a three.js clone of one of the people of models/people.glb. Nothing here decides how a person walks;
// it reads the rest skeleton into the plain description gait.makeBody takes, and writes the gait's answer over what the animation mixer has just put on the bones.
//
// Four hazards, each handled here:
//  - the rig's feet are not in the skeleton: heelBack / toeFwd (the shoe's reach behind and ahead of the ankle bone) come from the skinned vertices of the foot, measured once
//    per character from an unanimated clone (readBody);
//  - the mixer writes a bone only when the value it computes has CHANGED since the frame before (three's PropertyMixer.apply), so a bone this overlay has bent would keep
//    the bend for ever wherever the clip holds still. restore() therefore puts the mixer's own pose back before every mixer update;
//  - the overlay is blended in and out so a person who sets off from, or settles back into, a clip pose does not snap. It has two weights: wU for the pelvis, trunk, head and arms (the
//    walking body language, let go a moment after the last step) and wL for the legs (kept for good once a person has walked, so that the feet stay where they were planted and a
//    standing person does not skate when an idle clip shifts its weight or the body turns: the gait re-plants the feet with steps instead). The legs are solved against the pelvis
//    the person actually has - the clip's, or the blend of the clip's and the gait's - so they reach their planted feet whatever mixture of the two the upper body is in.
import * as G from './gait.js';

const FOOT_FALLBACK = { heelBack: 0.06, toeFwd: 0.19 };
const REQUIRED = [...G.CONTROLLED, 'Root', 'hand_l', 'hand_r'];
const clampN = (x, a, b) => Math.max(a, Math.min(b, x));
const UPPER = 12;   // G.CONTROLLED: the first twelve bones (pelvis, spine, neck, head, clavicles, arms) are the upper body, the last eight (thighs, calves, feet, balls) the legs

/** A character's rest skeleton as gait.makeBody wants it, and its feet measured from the skinned vertices. `obj` = a clone that no mixer has touched (rest pose).
 *  Returns { body, sole, heelBack, toeFwd } or null when the skeleton is not the expected rig (the person then keeps walking by clip).
 *  `sole` is how far the lowest point of the shoes sits above the origin of the clone at rest: the body description is shifted down by it, so that its floor (y = 0) is the
 *  sole, and the clone has to be placed `sole` lower than the floor to stand on it. */
export function readBody(THREE, obj) {
  obj.updateMatrixWorld(true);
  const list = []; obj.traverse((b) => { if (b.isBone) list.push(b); });
  const by = {}; for (const b of list) by[b.name] = b;
  for (const n of REQUIRED) if (!by[n]) return null;
  const idx = new Map(list.map((b, i) => [b, i]));
  const rig = { bones: list.map((b) => b.name), parent: list.map((b) => (idx.has(b.parent) ? idx.get(b.parent) : -1)), pos: list.map((b) => b.position.toArray()), quat: list.map((b) => b.quaternion.toArray()) };
  // the left foot: every vertex that is (almost) wholly skinned to the foot or toe bone and lies on the left of the body
  const an = by.foot_l.getWorldPosition(new THREE.Vector3()), v = new THREE.Vector3(); let zmax = -1e9, zmin = 1e9, ymin = 1e9, found = 0;
  obj.traverse((m) => {
    if (!m.isSkinnedMesh) return;
    const a = m.geometry.attributes, si = a.skinIndex, sw = a.skinWeight, bs = m.skeleton.bones; if (!si || !sw) return;
    for (let i = 0; i < a.position.count; i++) {
      let s = 0; for (let k = 0; k < 4; k++) { const nm = bs[si.getComponent(i, k)].name; if (nm === 'foot_l' || nm === 'ball_l') s += sw.getComponent(i, k); }
      if (s < 0.9) continue; m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld);
      if (v.x > -0.01 || v.x < an.x - 0.12) continue;
      zmax = Math.max(zmax, v.z); zmin = Math.min(zmin, v.z); ymin = Math.min(ymin, v.y); found++;
    }
  });
  const heelBack = found ? clampN(zmax - an.z, 0.04, 0.09) : FOOT_FALLBACK.heelBack, toeFwd = found ? clampN(an.z - zmin, 0.13, 0.25) : FOOT_FALLBACK.toeFwd, sole = found && ymin > -0.05 && ymin < 0.08 ? ymin : 0;
  const r0 = rig.parent.indexOf(-1); rig.pos[r0][1] -= sole;
  return { body: G.makeBody(rig, { heelBack, toeFwd }), sole, heelBack, toeFwd, restRootQ: rig.quat[r0].slice() };
}

/** The gait's hold on ONE clone's skeleton (a person's level-of-detail swap makes a new clone, hence a new GaitRig; the gait state itself lives on). */
export class GaitRig {
  constructor(THREE, obj, gb) {
    this.THREE = THREE; this.gb = gb; this.q = new THREE.Quaternion(); this.v = new THREE.Vector3();
    const by = {}; obj.traverse((b) => { if (b.isBone) by[b.name] = b; });
    this.root = by.Root; this.pelvis = by.pelvis; this.bone = G.CONTROLLED.map((n) => by[n]);
    this.saved = new Float32Array(this.bone.length * 4 + 4 + 3); this.applied = false;
  }
  /** the pelvis the mixer has just put on the skeleton, in the node frame the gait works in: { pos, q } (a clip animates the pelvis's rotation only; its position is the rest one) */
  clipPelvis() {
    const B = this.gb.body, rq = this.gb.restRootQ, p = this.pelvis.position, r = this.pelvis.quaternion;
    return { pos: G.add(B.P0[B.ix.Root], G.qrot(rq, [p.x, p.y, p.z])), q: G.qmul(rq, [r.x, r.y, r.z, r.w]) };
  }
  /** write the solved pose over what the mixer has just put on the bones. `sol` (gait.gaitSolve) holds the whole body and is laid over the pelvis, trunk, head and arms with
   *  weight wU; `legs` (a gaitSolve with legsOnly) is laid over the legs with weight wL. Either may be null (that part is left to the clip). */
  apply(sol, wU, legs, wL) {
    const names = G.CONTROLLED, S = this.saved, q = this.q, pel = this.pelvis, root = this.root;
    if (!this.applied) {   // remember the mixer's pose, for restore()
      for (let i = 0; i < this.bone.length; i++) { const b = this.bone[i].quaternion; S[i * 4] = b.x; S[i * 4 + 1] = b.y; S[i * 4 + 2] = b.z; S[i * 4 + 3] = b.w; }
      const o = this.bone.length * 4; S[o] = root.quaternion.x; S[o + 1] = root.quaternion.y; S[o + 2] = root.quaternion.z; S[o + 3] = root.quaternion.w;
      S[o + 4] = pel.position.x; S[o + 5] = pel.position.y; S[o + 6] = pel.position.z; this.applied = true;
    }
    const lay = (i, k, w) => { const b = this.bone[i].quaternion; q.set(k[0], k[1], k[2], k[3]); if (w >= 0.999) b.copy(q); else b.slerp(q, w); };
    if (sol && wU > 0) for (let i = 0; i < UPPER; i++) { const k = sol.q[names[i]]; if (k) lay(i, k, wU); }
    if (legs && wL > 0) for (let i = UPPER; i < names.length; i++) { const k = legs.q[names[i]]; if (k) lay(i, k, wL); }
    const w = Math.max(sol && wU > 0 ? wU : 0, legs && wL > 0 ? wL : 0), rq = this.gb.restRootQ; q.set(rq[0], rq[1], rq[2], rq[3]); if (w >= 0.999) root.quaternion.copy(q); else root.quaternion.slerp(q, w);
    const pp = sol && wU > 0 && sol.pelvisPos; if (pp) { if (wU >= 0.999) pel.position.set(pp[0], pp[1], pp[2]); else pel.position.lerp(this.v.set(pp[0], pp[1], pp[2]), wU); }
  }
  /** put back the pose the mixer wrote (call before the next mixer update, and whenever the overlay is switched off) */
  restore() {
    if (!this.applied) return; const S = this.saved;
    for (let i = 0; i < this.bone.length; i++) this.bone[i].quaternion.set(S[i * 4], S[i * 4 + 1], S[i * 4 + 2], S[i * 4 + 3]);
    const o = this.bone.length * 4; this.root.quaternion.set(S[o], S[o + 1], S[o + 2], S[o + 3]); this.pelvis.position.set(S[o + 4], S[o + 5], S[o + 6]);
    this.applied = false;
  }
}
