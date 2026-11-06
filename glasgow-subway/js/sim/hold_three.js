// Puts js/sim/hold.js (pure maths: where the phone is, where the wrists go, the arm that reaches them) on the live skeleton of a person - a three.js clone of one of the people of
// models/people.glb - and carries the phone (phone.js) in the right hand. Nothing here decides who uses a phone or when; people.js does, and sets the weight.
//
// Like gait_three.js it writes over what the animation mixer (and the gait, which comes first) has just put on the bones, so the same hazard applies: the mixer writes a bone only when
// the value it computes has CHANGED since the frame before, so a bone this overlay has moved would keep the move for ever wherever the clip holds still. restore() puts the pose the
// overlay found back, and must be called BEFORE the gait's restore() (the overlay sits on top of the gait's pose: undo the top layer first).
//
// Everything is worked out in the frame of the clone (its own x right / y up / z back, whatever the clone's yaw or the car it rides in): the bones' poses are composed by hand along
// their parent chains from their local transforms, so nothing depends on the scene graph's matrices being up to date.
import * as G from './gait.js';
import { phonePose, holdHands, solveArm } from './hold.js';
import { attachPhone } from './phone.js';

const NEEDED = ['head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r'];
const SIDES = ['r', 'l'];
const ARM_REF = 0.51;   // m: shoulder-to-wrist length of the adult hold.js's numbers were worked out for
const UP = [0, 1, 0];
const KTW = 0.6;        // the forearm takes this share of the hand's turn about the forearm axis, the wrist the rest
const EYE = { up: 0.055, fwd: 0.085 }, EAR = { side: 0.075, up: 0.03 };   // from the head bone (m, for an adult): the middle of the eyes, and the right ear
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** which way each elbow bows, in the person's frame (r right, u up, f forward): hanging down and a little outward and back to type, down and forward and a little outward to call */
const pole = (kind, side, r, u, f) => (kind === 'call'
  ? G.add(G.add(G.mul(u, -0.7), G.mul(f, 0.45)), G.mul(r, 0.3 * side))
  : G.add(G.add(G.mul(u, -1), G.mul(r, 0.35 * side)), G.mul(f, -0.25)));

/** The hold on ONE clone's skeleton (a level-of-detail swap makes a new clone, hence a new HoldRig; who is holding what lives on in people.js). */
export class HoldRig {
  constructor(THREE, obj, variant = 0) {
    this.THREE = THREE; this.obj = obj; this.q = new THREE.Quaternion();
    const by = {}; obj.traverse((b) => { if (b.isBone) by[b.name] = b; });
    this.by = by; this.ok = NEEDED.every((n) => by[n]);
    this.saved = new Float32Array(24); this.snap = new Float32Array(24); this.hasSnap = false; this.applied = false; this.dbg = null; this.phone = null;
    if (!this.ok) return;
    this.arm = {};
    for (const s of SIDES) this.arm[s] = { clav: by['clavicle_' + s], up: by['upperarm_' + s], lo: by['lowerarm_' + s], hand: by['hand_' + s], L1: by['lowerarm_' + s].position.length(), L2: by['hand_' + s].position.length() };
    this.size = clamp((this.arm.r.L1 + this.arm.r.L2) / ARM_REF, 0.7, 1.15);
    this.bones = [this.arm.r.up, this.arm.r.lo, this.arm.r.hand, this.arm.l.up, this.arm.l.lo, this.arm.l.hand];
    this.phone = attachPhone(THREE, by.hand_r, variant);
  }
  /** pose of a bone in the clone's frame, composed from the local transforms up the parent chain: { p: [x, y, z], q: [x, y, z, w] } */
  worldOf(bone) {
    const chain = []; for (let b = bone; b && b !== this.obj; b = b.parent) chain.push(b);
    let p = [0, 0, 0], q = [0, 0, 0, 1];
    for (let i = chain.length - 1; i >= 0; i--) { const b = chain[i], lp = b.position, lq = b.quaternion; p = G.add(p, G.qrot(q, [lp.x, lp.y, lp.z])); q = G.qmul(q, [lq.x, lq.y, lq.z, lq.w]); }
    return { p, q };
  }
  /** the person's frame right now, in the clone's frame, as hold.js wants it: the middle of the eyes, the right ear, the level forward / up / right, the head's own axes */
  frame() {
    const h = this.worldOf(this.by.head), s = this.size, hs = 0.55 + 0.45 * s, hx = G.qrot(h.q, [1, 0, 0]), hy = G.qrot(h.q, [0, 1, 0]), hz = G.qrot(h.q, [0, 0, 1]);   // the head bone: x = the person's left, y up, z forward; a child's head is nearer an adult's size than its arms are (hs)
    let f = G.sub(hz, G.mul(UP, G.dot(hz, UP)));
    if (G.len(f) < 0.3) { const t = this.worldOf(this.by.spine_03 || this.by.head), tz = G.qrot(t.q, [0, 0, 1]); f = G.sub(tz, G.mul(UP, G.dot(tz, UP))); }   // looking (nearly) straight down: the trunk's forward instead
    f = G.nrm(f);
    return { eye: G.add(h.p, G.add(G.mul(hy, EYE.up * hs), G.mul(hz, EYE.fwd * hs))), ear: G.add(G.sub(h.p, G.mul(hx, EAR.side * hs)), G.mul(hy, EAR.up * hs)),
      f, u: UP, r: G.cross(f, UP), s, hf: hz, hu: hy, hr: G.mul(hx, -1) };
  }
  /** Where the phone and the hands should be for this use: { ph (the phone's pose), hands ({ r, l } hold.js hands) }. kind = 'text' | 'sit' | 'walk' | 'call' */
  target(kind) { const F = this.frame(), ph = phonePose(kind, F); return { F, ph, hands: holdHands(kind, ph) }; }
  /** Remember the arms as they are now. The hold then rises from THIS pose (see apply) and not from whatever the animation clip is doing with the arms while it is blended in - the stock
   *  phone clips swing the hands up to the face within a third of a second, and that on top of the hold's own rise whipped the hands up to 18 cm in a frame (measured). */
  capture() { if (!this.ok) return; const S = this.snap, B = this.bones; for (let i = 0; i < B.length; i++) { const q = B[i].quaternion; S[i * 4] = q.x; S[i * 4 + 1] = q.y; S[i * 4 + 2] = q.z; S[i * 4 + 3] = q.w; } this.hasSnap = true; }
  /** Lay the arms (and the phone) over the pose on the bones with weight w (0..1). The pose the bones had is remembered for restore(). rising: the phone is coming out (or is out), so
   *  until w reaches 1 the arms come from the captured pose; otherwise (it is going away) from the pose the animation has them in now. */
  apply(kind, w, rising = false) {
    if (!this.ok) return;
    if (w <= 0) { this.phone.visible = false; return; }
    const S = this.saved, B = this.bones;
    if (!this.applied) { for (let i = 0; i < B.length; i++) { const q = B[i].quaternion; S[i * 4] = q.x; S[i * 4 + 1] = q.y; S[i * 4 + 2] = q.z; S[i * 4 + 3] = q.w; } this.applied = true; }
    if (rising && this.hasSnap && w < 0.999) { const N = this.snap; for (let i = 0; i < B.length; i++) B[i].quaternion.set(N[i * 4], N[i * 4 + 1], N[i * 4 + 2], N[i * 4 + 3]); }
    const T = this.target(kind), F = T.F, err = {};
    for (const sd of SIDES) {
      const hand = T.hands[sd], A = this.arm[sd]; if (!hand) continue;
      const side = sd === 'r' ? 1 : -1, cl = this.worldOf(A.clav), up = this.worldOf(A.up);
      const sol = solveArm(up.p, A.L1, A.L2, hand, pole(kind, side, F.r, F.u, F.f), KTW);
      this._lay(A.up, G.qmul(G.qinv(cl.q), sol.qu), w); this._lay(A.lo, G.qmul(G.qinv(sol.qu), sol.ql), w); this._lay(A.hand, G.qmul(G.qinv(sol.ql), sol.qh), w);
      err[sd] = { miss: G.len(G.sub(hand.O, sol.W)), reach: sol.reach, S: up.p, E: sol.E, W: sol.W, flex: Math.acos(clamp(G.dot(G.nrm(G.sub(sol.E, up.p)), G.nrm(G.sub(sol.W, sol.E))), -1, 1)) * 180 / Math.PI };
    }
    this.dbg = { kind, ph: T.ph, hands: T.hands, err };
    this.phone.setGrip(kind === 'call' ? 'call' : 'text'); this.phone.visible = w > 0.3;
  }
  _lay(bone, k, w) { const q = this.q.set(k[0], k[1], k[2], k[3]); if (w >= 0.999) bone.quaternion.copy(q); else bone.quaternion.slerp(q, w); }
  /** put back the pose the bones had when apply() found them (call before the next mixer update, and whenever the hold is let go) */
  restore() {
    if (!this.ok || !this.applied) return; const S = this.saved;
    for (let i = 0; i < this.bones.length; i++) this.bones[i].quaternion.set(S[i * 4], S[i * 4 + 1], S[i * 4 + 2], S[i * 4 + 3]);
    this.applied = false;
  }
  /** the phone goes back in the pocket */
  hide() { if (this.phone) this.phone.visible = false; }
}
