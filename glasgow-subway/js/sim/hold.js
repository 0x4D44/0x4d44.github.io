// A person holding a mobile phone, as pure maths (no three.js, no DOM): where the phone is, which way it faces, and where the wrists have to be to hold it. hold_three.js puts
// the answer on a live skeleton, phone.js is the phone itself, people.js decides who is using one and when.
//
// Why maths and not a captured clip: the clips of the asset that say "phone" (phone_stand, phone_call, sit_phone) were made without a phone in mind. In phone_stand both
// hands are up beside the face with the palms facing each other; in phone_call the hand is in front of the eye rather than at the ear. What a phone-user's arms do is not a
// pose, it is a constraint - the screen is about 40 cm from the eyes, facing them; the phone is against the ear - and whatever the person's height and whatever the trunk and
// head are doing, the hands follow. So the phone is placed from the person's own head (the eyes, the ear), and the wrists are put where they have to be to hold it.
//
// Where the phone is held. The distance is measured: a texter holds it 36.2 cm from the eyes on average (range 17.5-58 cm, n = 129; 32.2 cm for browsing - Bababekova, Rosenfield, Hue
// & Huang 2011, "Font size and viewing distance of handheld smart phones", Optometry and Vision Science 88(7): 795-797), and VIEW below puts it 34-35 cm away. The rest is this file's own
// estimate, not from that paper: the phone is well below the eyes (the gaze drops about 55 degrees to the screen, which faces the eyes), the elbow is bent about 90 degrees and the phone is
// near the chest; a seated texter holds it a little closer and lower. A caller holds the phone flat against the ear and cheek, its top at the ear, its bottom toward the mouth.
// Vectors are [x, y, z] in any one frame (the world, or the person's own); only the axes f (forward), u (up) and r (right) of the person tell the maths which way is which.
import { add, sub, mul, dot, cross, len, nrm, qmul, qinv, qy } from './gait.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const D2R = Math.PI / 180;

/** the phone: iPhone-sized, 71.5 x 147 x 8 mm, a little larger to read from across a platform */
export const PHONE = { w: 0.072, h: 0.150, t: 0.0085 };

/** how far the phone is held from the eyes: forward and down (m), per use. text = standing, sit = seated, walk = texting on the move */
export const VIEW = { text: { fwd: 0.19, drop: 0.28 }, sit: { fwd: 0.17, drop: 0.31 }, walk: { fwd: 0.21, drop: 0.26 } };

/** The hand, in its own frame (the rig's: Y along the fingers, Z out of the palm, X = Y x Z): where the middle of the palm is from the wrist bone, and how far the palm
 *  surface is off the bone's axis (the hand is a little over 5 cm thick). Measured on the skinned hand of the rest pose. */
export const HAND = { palm: 0.065, surface: 0.027 };

/** the grip: with two hands (text) each holds a side of the phone, its palm `side` m off the phone's middle, the fingers across the back toward the other hand and tilted up by
 *  `tilt`, the thumbs on the screen; a call is held in one hand, its palm on the lower half of the phone's back (`callLow` m below the middle) and the fingers up the back of the
 *  phone, leaning `callTilt` toward the back of the head - the wrist ends up at the jaw, below the phone, which is what lets the elbow hang low and forward instead of out at the shoulder */
export const GRIP = { side: 0.05, tilt: 14 * D2R, callTilt: 45 * D2R, callLow: 0.03 };

/** shortest-arc rotation [x, y, z, w] taking the unit vector a onto the unit vector b */
export function arc(a, b) {
  const d = dot(a, b);
  if (d < -0.999999) { let ax = cross([1, 0, 0], a); if (len(ax) < 1e-6) ax = cross([0, 1, 0], a); ax = nrm(ax); return [ax[0], ax[1], ax[2], 0]; }
  const c = cross(a, b), l = Math.hypot(c[0], c[1], c[2], 1 + d); return [c[0] / l, c[1] / l, c[2] / l, (1 + d) / l];
}
/** rotation of `ang` radians about the unit axis */
export const axisAngle = (ax, ang) => { const s = Math.sin(ang / 2); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)]; };
/** signed angle from a to b about the unit axis (only the parts of a and b across the axis count) */
export function signedAngle(a, b, ax) {
  const pa = sub(a, mul(ax, dot(a, ax))), pb = sub(b, mul(ax, dot(b, ax)));
  return Math.atan2(dot(cross(pa, pb), ax), dot(pa, pb));
}
/** the rotation [x, y, z, w] whose matrix has the columns X, Y, Z (a right-handed orthonormal frame) */
export function fromBasis(X, Y, Z) {
  const m00 = X[0], m10 = X[1], m20 = X[2], m01 = Y[0], m11 = Y[1], m21 = Y[2], m02 = Z[0], m12 = Z[1], m22 = Z[2], tr = m00 + m11 + m22;
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); return [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s]; }
  if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
  if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]; }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11); return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
}

/** A two-bone arm reaching a point. S = the shoulder, L1 / L2 = upper arm and forearm lengths, W = where the wrist should be, pole = the direction the elbow should bow toward.
 *  Returns { E, W, reach }: the elbow, the wrist actually reached (W pulled in to what the arm can span) and how far out it is as a fraction of the arm's full length.
 *  The elbow is the one of the two it could be that is nearer the pole. */
export function twoBone(S, L1, L2, W, pole) {
  const d = sub(W, S), D = len(d), lo = Math.abs(L1 - L2) + 1e-3, hi = L1 + L2 - 1e-3, Dc = clamp(D, lo, hi);
  const u = D > 1e-9 ? mul(d, 1 / D) : [0, 0, -1], Wc = add(S, mul(u, Dc));
  const a = (L1 * L1 - L2 * L2 + Dc * Dc) / (2 * Dc), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  let pp = sub(pole, mul(u, dot(pole, u))); if (len(pp) < 1e-6) pp = cross(u, Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]); pp = nrm(pp);
  return { E: add(add(S, mul(u, a)), mul(pp, h)), W: Wc, reach: D / (L1 + L2) };
}

/** The phone's pose for a use. F = { eye, ear (the right ear), f (the head's forward, level), u, r, s (size, 1 = the adult these numbers are for), hf / hu / hr (the head's own forward, up and
 *  right, for a call: the phone follows a tilted head) } in one frame. kind = 'text' | 'sit' | 'walk' | 'call'.
 *  Returns { C, x, y, z }: the centre of the phone, its width axis, its length axis (bottom to top) and its screen normal. */
export function phonePose(kind, F) {
  const s = F.s || 1;
  if (kind === 'call') {
    const hu = F.hu || F.u, hf = F.hf || F.f, hr = F.hr || F.r;
    const y = nrm(add(mul(hu, 0.93), mul(hf, -0.3))), z = mul(hr, -1);   // the top of the phone at the ear, leaning back a little; the screen against the head
    return { C: add(add(F.ear, mul(hr, PHONE.t / 2 + 0.012)), mul(y, -0.045)), x: cross(y, z), y, z };
  }
  const V = VIEW[kind] || VIEW.text, C = add(F.eye, add(mul(F.f, V.fwd * s), mul(F.u, -V.drop * s))), z = nrm(sub(F.eye, C));   // the screen faces the eyes
  const y = nrm(sub(F.u, mul(z, dot(F.u, z)))); return { C, x: cross(y, z), y, z };   // its top leans away: up the slope in the vertical plane through the eyes
}

/** The two hands for a phone pose. Each is { O, X, Y, Z }: where the wrist bone has to be, and the hand's axes (Y the fingers, Z the palm normal, X = Y x Z), so that the palm is on
 *  the back of the phone. text: both hands, a hand on each side, the fingers across the back (toward the other hand, tilted up) and the thumbs on the screen; call: the right hand
 *  alone, behind the phone, the fingers across it toward the back of the head. The right hand's grip is also where the phone sits in the hand: phone.js uses GRIP the same way. */
export function holdHands(kind, ph) {
  const hand = (palmAt, Y, Z) => ({ O: sub(sub(palmAt, mul(Y, HAND.palm)), mul(Z, HAND.surface)), X: cross(Y, Z), Y, Z });   // palmAt = the middle of the palm's surface
  if (kind === 'call') {
    const Z = ph.z, Y = nrm(add(mul(ph.y, Math.cos(GRIP.callTilt)), mul(ph.x, Math.sin(GRIP.callTilt))));   // the palm toward the head, the fingers up the back of the phone and a little toward the back of the head
    return { r: hand(sub(sub(ph.C, mul(Z, PHONE.t / 2 + 0.002)), mul(ph.y, GRIP.callLow)), Y, Z), l: null };
  }
  const G = GRIP, Z = ph.z, back = sub(ph.C, mul(Z, PHONE.t / 2 + 0.002));
  const tiltY = (s) => nrm(add(mul(ph.x, -s * Math.cos(G.tilt)), mul(ph.y, Math.sin(G.tilt))));   // s = +1 the right hand (fingers toward the left), -1 the left hand
  return { r: hand(add(back, mul(ph.x, G.side)), tiltY(1), Z), l: hand(sub(back, mul(ph.x, G.side)), tiltY(-1), Z) };
}

/** Where the phone has to sit in the right hand's frame for the hands above: its centre (P) and its axes in that frame, as the columns of a rotation (x, y, z). */
export function gripInHand(kind, ph, hand) {
  const rel = (v) => [dot(v, hand.X), dot(v, hand.Y), dot(v, hand.Z)];
  return { P: rel(sub(ph.C, hand.O)), x: rel(ph.x), y: rel(ph.y), z: rel(ph.z) };
}

/** A whole arm for a hand target, as the rotations of its three bones. The rig's arm bones (all characters, both levels of detail) have the same axes: local Y runs down the bone to its
 *  child, local X is the elbow's hinge with a positive turn bending the forearm forward (toward local Z), and the hand's Y is along the fingers and its Z out of the palm.
 *  S = the shoulder, L1 / L2 = upper arm and forearm lengths, hand = { O, X, Y, Z } (holdHands), pole = which way the elbow bows, kTw = the share of the forearm's twist that the
 *  forearm itself takes (the rest is the wrist's: the rig has no twist bone, so a wrist forced through the whole turn would pinch the skin there).
 *  Returns { qu, ql, qh } (world rotations of upper arm, forearm and hand as [x, y, z, w]), E (the elbow), W (the wrist actually reached) and reach (distance / full arm length). */
export function solveArm(S, L1, L2, hand, pole, kTw = 0.6) {
  const t = twoBone(S, L1, L2, hand.O, pole), Yu = nrm(sub(t.E, S)), Yl = nrm(sub(t.W, t.E));
  let hinge = cross(Yu, Yl);   // the elbow bends in the plane of the arm: its hinge is across that plane, and this sign is the one that bends the forearm forward
  if (len(hinge) < 1e-4) { const pp = sub(pole, mul(Yu, dot(pole, Yu))); hinge = cross(len(pp) > 1e-6 ? pp : [0, 0, 1], Yu); }   // a straight arm: the plane the pole chooses
  const X = nrm(hinge), Ru = fromBasis(X, Yu, cross(X, Yu)), Rl0 = fromBasis(X, Yl, cross(X, Yl)), Rh = fromBasis(hand.X, hand.Y, hand.Z);
  let rel = qmul(qinv(Rl0), Rh); if (rel[3] < 0) rel = [-rel[0], -rel[1], -rel[2], -rel[3]];
  const phi = 2 * Math.atan2(rel[1], rel[3]);   // the hand's turn about the forearm's own axis, (-pi, pi]
  const Rl = qmul(Rl0, qy(phi * kTw));
  return { qu: Ru, ql: Rl, qh: Rh, E: t.E, W: t.W, reach: t.reach };
}
