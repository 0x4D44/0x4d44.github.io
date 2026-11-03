// Idle carriage (R3-102: "arms hang in the same slightly spread idle"). The standing idle clips are one pose for every body, so a street of people waiting reads as one mannequin
// copied. Each person keeps their own small, steady offset of the arms while they stand idle: arms in close, a hand toward the belt, hands together in front, arms a little back.
//
// The offsets are rotations in the CHARACTER's own frame (up +Y, forward -Z, the character's right +X, the glTF frame the rig is authored in), turned into each bone's own
// parent frame, so they do not depend on the bones' local axes (the rig's are twisted by its roll). The mixer only writes a bone when its clip value CHANGED since the last update
// (a track that holds still, like the idle forearm's, is left alone), so an offset put on a bone would be put on again every frame: the frame loop calls `clearCarriage` right
// BEFORE `mixer.update` (it puts the bones back as the mixer left them) and `poseIdle` right after it (it remembers them, then turns the arms). The offsets fade with the idle clip's
// own weight, so the arms ease in and out as the crossfade does and never pop. Nothing here draws from the sim's random streams: the carriage is a pure function of the person's id.
// The same layer leans the head of someone holding a phone to the ear toward it (R3-205, `poseCall`), on the call clip's weight.
import * as THREE from 'three';

const arm = (add, swing, flex, inward = 0) => ({ add, swing, flex, inward });
/**
 * Degrees, per arm. `add`: the upper arm turned toward the body (negative: away from it, the elbow out); `swing`: the upper arm forward (negative: back); `flex`: the forearm bent
 * forward at the elbow; `inward`: the forearm then turned toward the middle of the body (a hand to the belt, hands together). The first is the authored idle.
 */
export const CARRIAGES = [
  { name: 'easy',               l: arm(0, 0, 0),         r: arm(0, 0, 0) },
  { name: 'close',              l: arm(8, 0, 6),         r: arm(8, 0, 6) },
  { name: 'left hand to belt',  l: arm(-6, -6, 92, 40),  r: arm(5, 0, 4) },
  { name: 'right hand to belt', l: arm(5, 0, 4),         r: arm(-6, -6, 92, 40) },
  { name: 'hands together',     l: arm(6, 4, 58, 32),    r: arm(6, 4, 58, 32) },
  { name: 'one forward',        l: arm(4, 6, 40, 10),    r: arm(9, 0, 8) },
  { name: 'back',               l: arm(5, -12, 10),      r: arm(5, -12, 10) },
  { name: 'hands low',          l: arm(5, 8, 8),         r: arm(5, 8, 8) },
  { name: 'one each way',       l: arm(6, 8, 8),         r: arm(6, -8, 8) },
];
/**
 * Bending the elbow pulls the hem of a SHORT sleeve off the arm under it, and a notch of bare skin shows in the cloth (the sleeves of these four, at 1 m: the bend is the talk clip's
 * too, but those four would hold it for the whole of a wait). Whoever wears one of them keeps to the carriages that leave the elbow almost straight.
 */
export const STRAIGHT_ARMED = new Set(['m_tendero', 'm_obrero', 'g_girl', 'm_mototaxi']);
export const STRAIGHT_FLEX = 10;
const JITTER = 2;       // degrees either way, per number, so two people who share a carriage are not the same pose

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const bend = (c) => Math.max(c.l.flex, c.r.flex);
/** The carriages `charId` may have: all of them, or (the four whose short sleeves gape) those that leave the elbow straight. */
export const poolFor = (charId) => (STRAIGHT_ARMED.has(charId) ? CARRIAGES.filter((c) => bend(c) <= STRAIGHT_FLEX) : CARRIAGES);
/** The carriage of person `id` (body `charId`): { name, l: { add, swing, flex, inward }, r: {...} }, degrees. Pure and stable. */
export function carriageOf(id, charId = null) {
  const key = String(id), pool = poolFor(charId), base = pool[(hash(key) >>> 4) % pool.length], cap = STRAIGHT_ARMED.has(charId) ? STRAIGHT_FLEX : Infinity;
  let s = hash(key + '#') || 1;
  const jit = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s / 4294967296 * 2 - 1) * JITTER; };
  const shake = (a) => (a.flex === 0 && a.add === 0 ? { ...a } : arm(a.add + jit(), a.swing + jit(), Math.min(cap, Math.max(0, a.flex + jit())), a.inward ? a.inward + jit() : 0));
  return { name: base.name, l: shake(base.l), r: shake(base.r) };
}

// ---- the live skeleton -----------------------------------------------------------------------------------------------------------------------------
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1), RAD = Math.PI / 180;
const _a = new THREE.Quaternion(), _d = new THREE.Quaternion(), _s = new THREE.Quaternion(), _t = new THREE.Quaternion();
const ARM_BONES = ['upperarm_l', 'forearm_l', 'upperarm_r', 'forearm_r', 'head'];        // (the head is the call's, poseCall below: saved and put back with the arms)

/** Turn `bone` by `q`, a rotation given in the frame of `root` (the character's), whatever the bone's own axes and its parents' turns. */
function turn(root, bone, q) {
  _a.identity(); for (let o = bone.parent; o && o !== root; o = o.parent) _a.premultiply(o.quaternion);       // the parent's orientation within the character's frame
  _d.copy(_a).invert().multiply(q).multiply(_a);                                                              // the same turn in the parent's own frame
  bone.quaternion.premultiply(_d);
}
/** Put `a` ({ add, swing, flex, inward } degrees, scaled by `w`) on the arm `side` ('l' | 'r') of the rig `inst` (right after the mixer wrote the pose). */
export function applyArm(inst, side, a, w = 1) {
  const up = inst.bones?.['upperarm_' + side], fore = inst.bones?.['forearm_' + side], root = inst.obj;
  if (!up || !fore || !root || !(w > 0)) return false;
  const toward = side === 'l' ? 1 : -1;                                                                    // the left arm hangs at -X: toward the body is toward +X (a turn about +Z)
  _s.setFromAxisAngle(AZ, toward * a.add * w * RAD);
  _t.setFromAxisAngle(AX, a.swing * w * RAD); _t.multiply(_s);                                             // swing (about +X: a hanging limb goes forward, -Z) after the turn toward the body
  turn(root, up, _t);
  _t.setFromAxisAngle(AX, a.flex * w * RAD);                                                               // (the forearm's parent is the upper arm, already turned)
  if (a.inward) { _s.setFromAxisAngle(AY, -toward * a.inward * w * RAD); _s.multiply(_t); _t.copy(_s); }   // then turned about the vertical toward the middle: -Y for the left forearm, +Y for the right
  turn(root, fore, _t);
  return true;
}

/**
 * Weight of one idle clip in a rig's current mix: 1 when it stands in it, 0 when it does anything else, the crossfade's share in between. A clip that is not running is 0: a stopped action
 * (CharacterLibrary.play with no fade) keeps the effective weight it had, and a walker would be given the carriage of the idle it left.
 */
export function idleWeight(inst, name) { const a = inst.actions?.get(name); return a && a.isRunning() ? Math.min(1, Math.max(0, a.getEffectiveWeight())) : 0; }

/** Put the arm bones back as the mixer left them. Call right BEFORE `mixer.update` (see the top of this file). Cheap when nothing was applied. */
export function clearCarriage(inst) {
  if (!inst.carriageOn) return;
  const q = inst.carriageQ; for (let i = 0; i < ARM_BONES.length; i++) inst.bones[ARM_BONES[i]]?.quaternion.copy(q[i]);
  inst.carriageOn = false;
}

/**
 * The arms of person `id` for the idle they are standing in. Call right after `mixer.update`. idle_b is the clip with the right hand moving (it already bends that arm), so the right
 * arm takes only a quarter of the carriage there. Returns true when something was applied.
 */
export function poseIdle(inst, id) {
  const wa = idleWeight(inst, 'idle_a'), wb = idleWeight(inst, 'idle_b'); if (wa + wb < 0.005) return false;
  const c = (inst.carriage ??= carriageOf(id, inst.id));
  const wl = Math.min(1, wa + wb), wr = Math.min(1, wa + 0.25 * wb);
  remember(inst);
  const l = applyArm(inst, 'l', c.l, wl), r = applyArm(inst, 'r', c.r, wr);
  return l || r;
}

/** Remember the bones as the mixer left them, for `clearCarriage`. */
function remember(inst) {
  const q = (inst.carriageQ ??= ARM_BONES.map(() => new THREE.Quaternion()));
  for (let i = 0; i < ARM_BONES.length; i++) { const b = inst.bones?.[ARM_BONES[i]]; if (b) q[i].copy(b.quaternion); }
  inst.carriageOn = true;
}

/** R3-205: how far the head of someone on a call leans to the phone at their ear, degrees, at the call clip's whole weight (the clip holds the head upright, and the phone stood a hand's breadth off the ear). */
export const CALL_TILT = 12;
/**
 * The head of whoever holds a phone to the ear leans to meet it: about the character's forward axis, toward the right shoulder (the phone's side), by the call clip's weight (so it eases in and out
 * with the crossfade). Call right after `mixer.update`, and after `poseIdle` when that runs (it has already remembered the bones); `clearCarriage` puts the head back before the next update.
 * Returns true when something was applied.
 */
export function poseCall(inst) {
  const w = idleWeight(inst, 'phone_call'), head = inst.bones?.head, root = inst.obj; if (!(w > 0.005) || !head || !root) return false;
  if (!inst.carriageOn) remember(inst);
  turn(root, head, _t.setFromAxisAngle(AZ, -CALL_TILT * w * RAD));                                         // (a turn about +Z by a negative angle takes the top of the head toward +X, the character's right)
  return true;
}
