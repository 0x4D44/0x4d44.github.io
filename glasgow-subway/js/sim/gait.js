// A procedural walking gait for the MPFB "game engine" rig (the 30 people of models/people.glb), as pure maths: no three.js, no DOM, so it runs under node --test
// and in the page alike. js/sim/gait_three.js reads the live skeleton into the plain description this file takes and writes the answer back.
//
// Why: the clip-driven walk plays one captured stride at the speed that matches the ground (slow-motion giant strides), lifts the body to hide the feet it cannot
// plant, has no pelvis bob / sway / rotation, and drags the feet whenever the person starts, stops or turns (research/people-motion-rubric.md: 3.7 / 10).
// Here the FEET are the primary data. Each foot is a rigid shoe that is either PLANTED (its heel / ball sole point is fixed in the world, and the foot rolls over it:
// heel rocker -> flat -> forefoot rocker) or SWINGING (a smooth path from where it left the floor to where the body will want it, clearing the floor); the pelvis
// follows a published pattern (bob twice a stride, sway once, rotate, drop on the swing side); the trunk counter-rotates, the arms swing against the legs, the head
// stays level; and a two-bone analytic IK puts each hip's thigh / shank through the knee to the ankle. Prior art: Boulic, Magnenat-Thalmann & Thalmann 1990
// (a universal walking model: step length / frequency from speed and leg length, pelvis trajectories), Kovar, Schreiner & Gleicher 2002 (planted feet, no skate),
// Perry & Burnfield (the rockers), Zeni et al. 2008, Saunders, Inman & Eberhart 1953 (pelvic rotation / tilt / lateral shift).
//
// Frames: the NODE frame is the person's own (x right, y up, z back: a character faces -z), at y = 0 the floor. The WORLD frame turns that by `yaw` about y and moves
// it to (x, z): forward = (-sin yaw, -cos yaw). Vectors are [x, y, z], quaternions [x, y, z, w]. The rig: Root > pelvis > spines > clavicles > arms (hands and
// fingers are left to the clip), pelvis > thighs > calves > feet > balls. Every controlled bone is given by its WORLD delta from the rest pose ("delta frame": the
// bone's world orientation = delta * rest), so a head that should stay level is just delta = identity whatever the trunk does.
const PI = Math.PI, D2R = PI / 180;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ------------------------------------------------------------------------------------------------------------------------ vectors and quaternions
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
export const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];
export const qrot = (q, v) => {
  const x = q[0], y = q[1], z = q[2], w = q[3], tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
};
const qnorm = (q) => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; };
export const qx = (a) => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
export const qy = (a) => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
export const qz = (a) => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];
export function qslerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; const s = d < 0 ? -1 : 1; d *= s;
  if (d > 0.9995) return qnorm([a[0] + (s * b[0] - a[0]) * t, a[1] + (s * b[1] - a[1]) * t, a[2] + (s * b[2] - a[2]) * t, a[3] + (s * b[3] - a[3]) * t]);
  const th = Math.acos(clamp(d, -1, 1)), sn = Math.sin(th), wa = Math.sin((1 - t) * th) / sn, wb = Math.sin(t * th) / sn * s;
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb, a[3] * wa + b[3] * wb];
}
/** the rotation whose matrix has columns c1 c2 c3 (an orthonormal right-handed frame) */
function qBasis(c1, c2, c3) {
  const m00 = c1[0], m10 = c1[1], m20 = c1[2], m01 = c2[0], m11 = c2[1], m21 = c2[2], m02 = c3[0], m12 = c3[1], m22 = c3[2], tr = m00 + m11 + m22;
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); return [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s]; }
  if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
  if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]; }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11); return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
}
/** the rotation that carries the frame (d0, a0) onto (d1, a1): d is a bone's axis, a a second direction fixing its twist (both orthonormalised) */
function qAlign(d0, a0, d1, a1) {
  const f = (d, a) => { const x = nrm(d), y = nrm(sub(a, mul(x, dot(a, x)))); return [x, y, cross(x, y)]; };
  const F0 = f(d0, a0), F1 = f(d1, a1);
  return qnorm(qmul(qBasis(F1[0], F1[1], F1[2]), qinv(qBasis(F0[0], F0[1], F0[2]))));
}
const rotX = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]; };
const rotY = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };
const smoother = (s) => { s = clamp(s, 0, 1); return s * s * s * (s * (6 * s - 15) + 10); };     // zero velocity and acceleration at both ends
const cosEase = (s) => 0.5 - 0.5 * Math.cos(PI * clamp(s, 0, 1));
const wrap1 = (x) => x - Math.floor(x);
const angDiff = (a, b) => { let d = (a - b) % (2 * PI); if (d > PI) d -= 2 * PI; if (d < -PI) d += 2 * PI; return d; };

// ------------------------------------------------------------------------------------------------------------------------ the body
export const CONTROLLED = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r',
  'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r', 'ball_l', 'ball_r'];
const SIDE = ['l', 'r'];

/** The constants of one person, from the rest skeleton. rig = { bones:[name], parent:[index|-1], pos:[[x,y,z]] (local), quat:[[x,y,z,w]] (local) }, parents before
 *  children; foot = { heelBack, toeFwd } (m: heel behind / toe tip ahead of the ankle, from the skinned foot). The rest pose stands with the soles on y = 0. */
export function makeBody(rig, foot) {
  const n = rig.bones.length, ix = {}; rig.bones.forEach((b, i) => { ix[b] = i; });
  const P0 = new Array(n), Q0 = new Array(n);
  for (let i = 0; i < n; i++) { const p = rig.parent[i]; if (p < 0) { P0[i] = rig.pos[i].slice(); Q0[i] = rig.quat[i].slice(); } else { P0[i] = add(P0[p], qrot(Q0[p], rig.pos[i])); Q0[i] = qmul(Q0[p], rig.quat[i]); } }
  const g = (nm) => P0[ix[nm]], ort = (v, a) => nrm(sub(v, mul(a, dot(v, a))));
  const B = { rig, ix, P0, Q0, heelBack: foot.heelBack, toeFwd: foot.toeFwd, leg: [], arm: [], hipLocal: [], hipOff: [], controlled: CONTROLLED.map((c) => ix[c]) };
  for (let s = 0; s < 2; s++) {
    const sd = SIDE[s], hip = g('thigh_' + sd), knee = g('calf_' + sd), an = g('foot_' + sd), ba = g('ball_' + sd), d0 = nrm(sub(knee, hip)), e0 = nrm(sub(an, knee)), aH = an[1];
    const bx = ba[0] - an[0], bz = ba[2] - an[2];
    const hp = 0.5 * ba[1];   // the heel-up pivot: half way between the ball-of-foot sole point and the ball joint, so the sole point and the toe tip each slide half as far
    B.leg[s] = { sd, l1: len(sub(knee, hip)), l2: len(sub(an, knee)), d0, e0, a0t: ort([1, 0, 0], d0), a0s: ort([1, 0, 0], e0), ankleH: aH, hp,
      hA: [0, aH, -foot.heelBack],                                  // the ankle, from the heel point (foot flat)
      hB: [bx, 0, bz - foot.heelBack],                              // the heel-up pivot, from the heel point (its height is hp)
      bA: [-bx, aH - hp, -bz],                                      // the ankle, from the pivot
      heelRel: [0, -aH, foot.heelBack], bsRel: [bx, -aH, bz], ballRel: sub(ba, an), toeRel: [0, -ba[1], (an[2] - foot.toeFwd) - ba[2]] };   // sole points and the ball joint, from the ankle
    B.hipLocal[s] = rig.pos[ix['thigh_' + sd]]; B.hipOff[s] = sub(g('thigh_' + sd), g('pelvis'));
    const sh = g('upperarm_' + sd), el = g('lowerarm_' + sd), wr = g('hand_' + sd), dU = nrm(sub(el, sh));
    B.arm[s] = { sd, sh, upper: len(sub(el, sh)), fore: len(sub(wr, el)), dU, abd0: Math.atan2(Math.abs(dU[0]), -dU[1]), tilt0: Math.atan2(-dU[2], -dU[1]) };
  }
  B.hipY = g('thigh_l')[1]; B.hipHalf = Math.abs(g('thigh_l')[0]); B.Lh = B.hipY;
  B.legLen = B.leg[0].l1 + B.leg[0].l2;
  B.shoulderHalf = Math.abs(B.arm[0].sh[0]);
  return B;
}

// ------------------------------------------------------------------------------------------------------------------------ the gait's parameters
/** Everything that depends on how fast this person walks. v in m/s; ve is the speed of a standard 0.92 m hip that walks the same way (dynamic similarity). */
export function gaitParams(B, v) {
  const Lh = B.Lh, ve = v * Math.sqrt(0.92 / Lh), kv = clamp(ve / 1.2, 0.3, 1.8);
  const fs = stepRate(ve) * Math.sqrt(0.92 / Lh);                    // steps per second (dynamic similarity: an adult's cadence at the same dimensionless speed, scaled by 1 / sqrt(leg length))
  const SL = v / fs;                                                  // step length
  const S = clamp(0.61 - 0.05 * (ve - 1.2), 0.59, 0.64);            // stance share of the stride
  const P = { v, ve, fs, SL, S, ff: 0.1, ho: Math.max(0.3, S - 0.25), thHS: clamp((8 + 10 * kv) * D2R, 8 * D2R, 24 * D2R), thTO: clamp((36 + 22 * kv) * D2R, 34 * D2R, 78 * D2R) };
  P.bob = 0.036 * Math.pow(kv, 1.1) * (Lh / 0.92);                   // the bob the pelvis is asked for; the reach of the legs (lowerForReach) adds the rest, to about 0.035 m at 1.2 m/s
  P.sway = 0.040 * Math.pow(1 / Math.max(kv, 0.5), 0.3) * (Lh / 0.92);
  P.yaw = (5 + 6 * Math.min(kv, 1.4)) * D2R;
  P.obl = (3.5 + 2.5 * Math.min(kv, 1.4)) * D2R;
  P.thorax = 0.85;                                                    // thorax yaw against the pelvis (x the pelvis's own)
  P.armSwing = (12 + 19 * ve) * D2R;                                  // peak-to-peak shoulder swing
  P.elbow = (16 + 14 * Math.min(kv, 1.5)) * D2R; P.elbowAmp = (7 + 6 * Math.min(kv, 1.5)) * D2R;
  P.stepHalf = 0.5 * 0.09 * (Lh / 0.92);                             // the heels land this far either side of the line of travel
  P.clear = 0.032 * (Lh / 0.92);                                      // height of the swing foot's lowest point at its peak
  P.lean = (1.5 + 2.0 * Math.min(kv, 1.5)) * D2R;                     // forward lean of the thorax
  // no leg is ever asked to stretch further than a knee bent by `minKnee`; at mid-stance the pelvis is as high as that allows (a little less than the standing height)
  P.cL = B.legLen * Math.cos(0.5 * 9 * D2R);                          // the longest reach a leg is asked for
  P.lat = B.hipHalf - P.stepHalf;                                      // hip to ankle, sideways
  P.hMax = B.leg[0].ankleH - B.hipOff[0][1] + Math.sqrt(Math.max(1e-3, P.cL * P.cL - P.lat * P.lat));
  P.hPeak = Math.min(P.hMax, B.P0[B.ix.pelvis][1] + 0.004);          // the top of the bob: a little above the standing height (the rest pose has the knee a few degrees bent), and never beyond the legs' reach
  P.hAt = (phi, amp = 1) => P.hPeak - P.bob * amp * 0.5 * (1 - Math.cos(4 * PI * (phi - P.bobPh)));
  P.aH = 0.44 * P.SL;                                                 // the heel lands this far ahead of the pelvis (a little under half a step: the other foot is that far behind it at toe-off)
  P.bobPh = clamp((P.aH + B.heelBack) / (2 * P.SL), 0.2, 0.34);       // the pelvis is highest when the planted ankle is under the hip (the legs can reach furthest up), lowest a quarter stride earlier
  return P;
}
// ------------------------------------------------------------------------------------------------------------------------ feet
/** the ankle (world x, height, world z) of a planted foot: H = world heel point with the foot flat, psi = world yaw, th = pitch (toes up +): pivots on the heel when
 *  toes-up, on the ball of the foot when heel-up */
function stanceAnkle(o, H, psi, th) {
  if (th >= 0) { const v = rotY(rotX(o.hA, th), psi); return [H[0] + v[0], v[1], H[1] + v[2]]; }
  const bs = rotY(o.hB, psi), v = rotY(rotX(o.bA, th), psi);
  return [H[0] + bs[0] + v[0], o.hp + v[1], H[1] + bs[2] + v[2]];
}
/** height of the lowest of heel, ball-of-foot and toe tip above the ankle, for foot pitch th and toe-bone pitch thb */
function lowestRel(o, th, thb) {
  const yh = rotX(o.heelRel, th)[1], yb = rotX(o.bsRel, th)[1], yt = rotX(o.ballRel, th)[1] + rotX(o.toeRel, thb)[1];
  return Math.min(yh, yb, yt);
}
const newFoot = (s) => ({ s, mode: 'stance', H: [0, 0], psi: 0, th: 0, sw: null, cur: null, landedAt: -1 });

/** A new gait state for a body. */
export function newGait(B, opts = {}) {
  const g = { body: B, phase: 0, walking: false, wk: 0, t: 0, feet: [newFoot(0), newFoot(1)], x: 0, z: 0, yaw: 0, v: 0, placed: false, P: null, armOut: opts.armOut || [8, 8],
    var: Object.assign({ arm: 1, bob: 1, sway: 1, phase0: 0, yawBias: 0 }, opts.var || {}), pole: [0, 0], stopD: null, stoppedAt: -99 };
  return g;
}

// the world position / yaw of the natural standing stance of a foot, for a person at (x, z) facing yaw
// (adv: where it is for a person who has gone on `adv` m further along their heading - the place a planned stop ends)
function standTarget(g, s, adv = 0) {
  const B = g.body, o = B.leg[s], sgn = s ? 1 : -1, sx = B.hipHalf * 0.92, az = B.P0[B.ix['foot_' + o.sd]][2];
  const l = rotY([sgn * sx, 0, az + B.heelBack], g.yaw);
  return { H: [g.x - Math.sin(g.yaw) * adv + l[0], g.z - Math.cos(g.yaw) * adv + l[2]], psi: g.yaw - sgn * 7 * D2R };
}
function plantBoth(g) { for (let s = 0; s < 2; s++) { const t = standTarget(g, s), f = g.feet[s]; f.mode = 'stance'; f.H = t.H; f.psi = t.psi; f.th = 0; f.sw = null; } }

const toLocal = (g, x, z) => { const dx = x - g.x, dz = z - g.z, c = Math.cos(g.yaw), s = Math.sin(g.yaw); return [dx * c - dz * s, dx * s + dz * c]; };   // world -> node frame (x, z)

function startSwing(g, f, tgt, o) {   // o = { T (s) | null for phase driven, th1, clear }
  const cur = f.cur;
  f.sw = { A0: cur.A.slice(), th0: cur.th, thb0: cur.thb, psi0: cur.psi, tgt: tgt, T: o.T || null, t: 0, s: 0, th1: o.th1, clear: o.clear, A1: null, m0: 0 };
  f.mode = 'swing';
  // the foot leaves the floor already moving forward (it has been rolling over the toes): its path starts with that speed, not from rest
  const P = g.P, T = o.T || (P ? (1 - P.S) * 2 / Math.max(P.fs, 0.2) : 0), t1 = tgt || (P ? landTarget(g, f.s, P, 0) : null);
  if (t1 && T > 0 && f.vA) { const A1 = stanceAnkle(g.body.leg[f.s], t1.H, t1.psi, o.th1), dx = A1[0] - cur.A[0], dz = A1[2] - cur.A[2], D = Math.hypot(dx, dz);
    if (D > 0.05) f.sw.m0 = clamp(((f.vA[0] * dx + f.vA[1] * dz) / D) * T / D, 0, 0.8); }
}

// ------------------------------------------------------------------------------------------------------------------------ the update
const V_ON = 0.16, V_OFF = 0.09;
/** Advance the gait by dt (<= 1/30 s). inp = { x, z, yaw (the person's world position and heading), v (ground speed), walking (the game wants a walk),
 *  stopD (optional: the metres the body still has to travel along its heading before it comes to rest, for a person who is walking to a place to STAND - the last steps then land where
 *  they will stand instead of a stride ahead of it) } */
export function gaitUpdate(g, dt, inp) {
  const B = g.body, F = g.feet;
  g.x = inp.x; g.z = inp.z; g.yaw = inp.yaw; g.v = inp.v; g.t += dt; g.stopD = inp.stopD != null && inp.stopD >= 0 ? inp.stopD : null;
  if (!g.placed) { plantBoth(g); g.placed = true; for (let s = 0; s < 2; s++) { F[s].cur = footOut(g, F[s]); F[s].vA = [0, 0]; } }
  const want = !!inp.walking && (g.walking ? inp.v > V_OFF : inp.v > V_ON);
  const P = g.P = gaitParams(B, Math.max(inp.v, 0));
  g.wk = clamp(g.wk + (want ? dt / WK_UP : -dt / WK_DN), 0, 1);       // how much of a walker the body is: the arms, the sway and the bob grow over the first steps and die away over the last
  if (want && !g.walking) {                                  // set off: the foot that trails swings first
    g.walking = true; g.walkT = 0;
    const fwd = [-Math.sin(g.yaw), -Math.cos(g.yaw)], ahead = F.map((f) => (f.H[0] - g.x) * fwd[0] + (f.H[1] - g.z) * fwd[1]), first = ahead[0] <= ahead[1] ? 0 : 1;
    g.phase = wrap1(P.S + (first ? 0.5 : 0)); g.firstStep = true;
    for (let s = 0; s < 2; s++) F[s].th = 0;
  } else if (!want && g.walking) {                            // stop: a swinging foot lands where the body stands now, a planted one settles
    g.walking = false; g.stoppedAt = g.t;
    for (let s = 0; s < 2; s++) { const f = F[s]; if (f.mode === 'swing') { const t = standTarget(g, s); startSwing(g, f, { H: t.H, psi: t.psi }, { T: 0.3, th1: 0, clear: 0.05 * B.Lh }); } }
  }
  if (g.walking) walkStep(g, dt, P); else standStep(g, dt);
  for (let s = 0; s < 2; s++) { const f = F[s], was = f.cur, now = footOut(g, f); f.vA = was && dt > 0 ? [(now.A[0] - was.A[0]) / dt, (now.A[2] - was.A[2]) / dt] : [0, 0]; f.cur = now; }
  // The pelvis may not be higher than the legs can reach (lowerForReach), but when the cap lifts - the trailing foot leaves the floor and its reach is suddenly not a limit - the
  // pelvis must not pop up with it (up to 6 cm in a frame for a short foot at a fast walk): it is let down at once and eased up with a time constant of H_TAU.
  if (g.walking) { const hc = gaitTargets(g).hCap; g.hF = (g.hF == null || hc < g.hF) ? hc : g.hF + (hc - g.hF) * (1 - Math.exp(-dt / H_TAU)); } else g.hF = null;
}
const H_TAU = 0.05;
const WK_UP = 0.7, WK_DN = 0.5;   // s: the walking body language builds up over the first strides and is let go over half a second after the last

function walkStep(g, dt, P) {
  const F = g.feet; g.walkT += dt; g.phase = wrap1(g.phase + dt * P.fs * 0.5 * (g.v > 0.02 ? 1 : 0));
  for (let s = 0; s < 2; s++) {
    const f = F[s], pf = wrap1(g.phase - (s ? 0.5 : 0));
    if (f.mode === 'stance') {
      if (pf >= P.S && pf < 0.97) {                         // toe-off: swing begins from the pose the foot has now
        f.cur = footOut(g, f, pf); startSwing(g, f, null, { T: null, th1: P.thHS, clear: P.clear });
      } else f.th = stanceTh(P, pf);
    } else if (f.mode === 'swing') {
      if (f.sw.T) { f.sw.t += dt; f.sw.s = clamp(f.sw.t / f.sw.T, 0, 1); if (f.sw.s >= 1) land(g, f, P); }
      else if (pf < P.S) { f.sw.s = 1; land(g, f, P); }                        // the phase has come round to heel strike
      else f.sw.s = clamp((pf - P.S) / (1 - P.S), 0, 1);
    }
  }
}
const stanceTh = (P, pf) => (pf < P.ff ? P.thHS * (1 - cosEase(pf / P.ff)) : pf < P.ho ? 0 : -P.thTO * Math.pow(clamp((pf - P.ho) / (P.S - P.ho), 0, 1), 1.5));

function standStep(g, dt) {
  const F = g.feet, B = g.body, closing = g.t - g.stoppedAt < 1.5;   // the last steps of a walk follow on at once (a person does not stand on their toes and wait); idle re-plants wait for stillness
  const err = [0, 1].map((s) => { const t = standTarget(g, s), f = F[s]; return Math.hypot(t.H[0] - f.H[0], t.H[1] - f.H[1]) + 0.25 * Math.abs(angDiff(t.psi, f.psi)); });
  for (let s = 0; s < 2; s++) { const f = F[s];
    if (f.mode === 'swing') { if (f.sw.T) { f.sw.t += dt; f.sw.s = clamp(f.sw.t / f.sw.T, 0, 1); if (f.sw.s >= 1) land(g, f, null); } }
    else if (!(closing && err[s] > 0.075 && f.th < 0)) f.th += (0 - f.th) * Math.min(1, dt * 9);        // the heel comes back down (unless this foot is about to take the closing step from its toes)
  }
  // a foot that is too far from where the body stands steps back to it (one at a time), once the other carries the weight (flat, or on its heel)
  if (F[0].mode === 'stance' && F[1].mode === 'stance' && g.t - Math.max(F[0].landedAt, F[1].landedAt) > (closing ? 0.08 : 0.25)) {
    const worst = err[1] > err[0] ? 1 : 0, we = err[worst], other = F[1 - worst];
    if (we > 0.075 && (closing ? other.th > -0.05 : Math.abs(F[0].th) + Math.abs(F[1].th) < 0.05)) { const t = standTarget(g, worst), f = F[worst], d = Math.hypot(t.H[0] - f.H[0], t.H[1] - f.H[1]);
      f.cur = footOut(g, f); startSwing(g, f, { H: t.H, psi: t.psi }, { T: clamp(0.3 + 0.35 * d, 0.3, 0.55), th1: 0, clear: 0.05 * B.Lh }); }
  }
}

function land(g, f, P) {
  const t = f.sw.tgt || f.sw.mark || landTarget(g, f.s, P, 0);
  f.H = t.H; f.psi = t.psi; f.mode = 'stance'; f.sw = null; f.landedAt = g.t; f.th = P ? P.thHS : 0; if (P) g.firstStep = false;
}

// where the heel will land: ahead of the pelvis by aH at the time of landing, stepHalf off the line of travel
function landTarget(g, s, P, rem) {
  const fwd = [-Math.sin(g.yaw), -Math.cos(g.yaw)], rgt = [Math.cos(g.yaw), -Math.sin(g.yaw)], sgn = s ? 1 : -1;
  const f = g.feet[s], T = rem * (1 - P.S) * 2 / Math.max(P.fs, 0.2), ahead = P.aH * (g.firstStep ? 0.75 : 1) + P.v * T;
  const toe = (g.var.yawBias + (sgn > 0 ? -6.5 : 6.5)) * D2R;
  const W = { H: [g.x + fwd[0] * ahead + rgt[0] * sgn * P.stepHalf, g.z + fwd[1] * ahead + rgt[1] * sgn * P.stepHalf], psi: g.yaw + toe };
  if (g.stopD != null) {   // on the way to a planned stop the last steps shorten: a foot lands no further on than where it will stand once the body has got there (a person does not
    // stop with a foot a stride ahead and then walk it back), blending into the walking placement while that is still well short of it
    const st = standTarget(g, s, g.stopD), al = (h) => (h[0] - g.x) * fwd[0] + (h[1] - g.z) * fwd[1], k = smoother((al(W.H) - al(st.H) + 0.08) / 0.1);
    if (k > 0) { W.H = [W.H[0] + (st.H[0] - W.H[0]) * k, W.H[1] + (st.H[1] - W.H[1]) * k]; W.psi += angDiff(st.psi, W.psi) * k; }
  }
  return W;
}

/** the pitch of the toe bone that puts its tip on the floor while the foot above it is pitched `th` with the ankle at height ay (the toes stay flat as the heel rises) */
function levelToe(o, ay, th) {
  const jh = ay + rotX(o.ballRel, th)[1], by = -o.toeRel[1], tz = -o.toeRel[2], R = Math.hypot(by, tz), phi = Math.atan2(by, tz);
  return Math.max(0, phi - Math.asin(clamp(jh / R, -1, 1)));
}

// the foot's pose now, in the world: { A: [x, y, z] ankle, psi, th (foot pitch), thb (toe-bone pitch) }
function footOut(g, f, pfNow) {
  const B = g.body, o = B.leg[f.s], P = g.P;
  if (f.mode === 'stance') {
    const th = f.th, A = stanceAnkle(o, f.H, f.psi, th);
    return { A, psi: f.psi, th, thb: th >= 0 ? th : levelToe(o, A[1], th) };
  }
  const sw = f.sw, s = sw.s;
  if (!sw.tgt && !sw.mark && s >= SW_MARK) sw.mark = landTarget(g, f.s, P, 1 - s);          // the landing mark is fixed over the last part of the swing
  const tgt = sw.tgt || sw.mark || landTarget(g, f.s, P, 1 - s);
  const A1 = stanceAnkle(o, tgt.H, tgt.psi, sw.th1);
  // the foot comes up off its toes quickly (level by 0.45 of the swing, so the ankle is not carried high while the knee is bent) and tips up for heel strike; it is over its mark
  // by 97 % of the swing and then lowers straight down, so nothing drags along the floor
  const e = swingE(s, sw.m0), th = sw.th0 * (1 - smoother(s / 0.45)) + sw.th1 * smoother((s - 0.65) / 0.35), thb = sw.thb0 + (th - sw.thb0) * smoother(s / 0.35);
  const x = sw.A0[0] + (A1[0] - sw.A0[0]) * e, z = sw.A0[2] + (A1[2] - sw.A0[2]) * e;
  const c = swingLift(sw.clear, s);                                                       // the lowest point of the foot
  const y = c - lowestRel(o, th, thb);
  // continuity with the stance pose at both ends comes from the lowest point being on the floor there
  return { A: [x, y, z], psi: sw.psi0 + angDiff(tgt.psi, sw.psi0) * e, th, thb };
}
const SW_MARK = 0.7;
// steps per second of a healthy adult (0.92 m hip height) at speed ve (m/s): free walking, Grieve & Gear 1966; Bohannon 1997 (comfortable and fast speeds)
const CAD = [[0.4, 62], [0.6, 77], [0.8, 90], [1.0, 101], [1.2, 110], [1.4, 118], [1.6, 126], [1.8, 134], [2.0, 143], [2.4, 160]];
function stepRate(ve) {
  let c;
  if (ve <= CAD[0][0]) c = Math.max(34, CAD[0][1] - (CAD[0][0] - ve) * 75);
  else if (ve >= CAD[CAD.length - 1][0]) c = CAD[CAD.length - 1][1] + (ve - CAD[CAD.length - 1][0]) * 42;
  else { let i = 1; while (ve > CAD[i][0]) i++; c = CAD[i - 1][1] + (CAD[i][1] - CAD[i - 1][1]) * (ve - CAD[i - 1][0]) / (CAD[i][0] - CAD[i - 1][0]); }
  return c / 60;
}
// how far along its path (0..1) the foot is in the WORLD at swing progress s. It leaves the floor with the speed it has (m0), speeds up through the swing, keeps pace with the body
// from SW_DEC, and stops over its mark in the last stretch (SW_RUN..SW_END), when the heel is still a centimetre up (see swingLift) - a heel that is still sliding once it is on
// the floor looks like skating, and one that stops early leaves the body's own forward speed to pull the foot back through the pelvis (real heels are slowed by the ground in the
// first frames of contact; a model has to finish the move in the air).
const SW_DEC = 0.8, SW_RUN = 0.97, SW_END = 0.99, SW_LOW = 0.96, SW_KAP = 0.43;
function swingE(s, m0) {
  if (s >= SW_END) return 1;
  const sd = SW_DEC, w = SW_END - SW_RUN, p1 = 1 - SW_KAP * (SW_RUN - sd) - 0.5 * SW_KAP * w;
  if (s < sd) { const u = s / sd, m1 = SW_KAP * sd; return (u * u * u - 2 * u * u + u) * m0 * sd + (3 * u * u - 2 * u * u * u) * p1 + (u * u * u - u * u) * m1; }
  if (s < SW_RUN) return p1 + SW_KAP * (s - sd);
  const d = s - SW_RUN; return p1 + SW_KAP * (SW_RUN - sd) + SW_KAP * d - SW_KAP / (2 * w) * d * d;
}
// the height of the foot's lowest point (m) at swing progress s: up quickly after toe-off, then a shallow arch; held a centimetre up until the foot is over its mark, then down
const SW_HOLD = 0.010;
function swingLift(clear, s) { return clear * Math.max(0, Math.sin(PI * Math.pow(s, 0.8))) + SW_HOLD * smoother((s - 0.55) / 0.3) * (1 - smoother((s - SW_LOW) / (1 - SW_LOW))); }

// ------------------------------------------------------------------------------------------------------------------------ the pose
/** The pose of the body for the current state, as world-delta orientations and positions in the NODE frame:
 *  { pelvisPos, pelvisD, spineD:[3], neckD, headD, claD:[2], upD:[2], loD:[2], feet:[{A, psi, th, thb}] } */
export function gaitTargets(g) {
  const B = g.body, P = g.P || gaitParams(B, 0), ph = g.phase, w = smoother(g.wk), T = {};
  const V = g.var;
  // pelvis: height (2 / stride), lateral shift (1 / stride), rotation, drop on the swing side
  const sway = 0.5 * P.sway * V.sway * Math.cos(2 * PI * (ph - 0.3)), ramp = w, bobH = P.hAt(ph, ramp * V.bob);
  const yawP = w * 0.5 * P.yaw * Math.sin(2 * PI * (ph - 0.25)), rollP = -w * 0.5 * P.obl * Math.cos(2 * PI * (ph - 0.3));   // (all of it grows with the walk: a standing pelvis is level, and setting off must not jump the phase's rotation in)
  T.pelvisD = qmul(qy(yawP), qz(rollP));
  T.pelvisPos = [-sway * w, bobH, B.P0[B.ix.pelvis][2]];
  T.feet = g.feet.map((f) => f.cur);
  T.hCap = lowerForReach(g, T, P);
  T.pelvisPos[1] = g.hF == null ? T.hCap : Math.min(T.hCap, g.hF);       // g.hF: the cap's height, but only ever eased UP (see gaitUpdate)
  // trunk: counter-rotates against the pelvis, leans a little forward; the head stays level and straight ahead
  const yawT = -P.thorax * yawP, lean = -P.lean, rollT = 0.3 * rollP;
  const mix = (a, b, t) => a + (b - a) * t;
  T.spineD = [1, 2, 3].map((k) => qmul(qy(mix(yawP, yawT, k / 3)), qmul(qx(lean * k / 3), qz(mix(rollP, rollT, k / 3)))));
  // the head is held nearly still in space (Pozzo et al. 1990: it is stabilised against the trunk's rotation and the body's bounce) but not rigid: a quarter of the thorax's yaw
  // leaks through, half its roll, and the head nods about a degree twice a stride with the bob. The neck takes half of it.
  { const k = ramp, hy = 0.25 * yawT * k, hr = 0.5 * rollT * k, hp = -0.9 * D2R * Math.min(P.ve / 1.2, 1.4) * Math.cos(4 * PI * (ph - P.bobPh)) * k;
    T.headD = qmul(qy(hy), qmul(qx(hp), qz(hr))); T.neckD = qmul(qy(hy * 0.5), qmul(qx(hp * 0.5), qz(hr * 0.5))); }
  T.claD = [T.spineD[2], T.spineD[2]];
  // arms: each swings against the same-side leg; the elbow bends more as the arm goes forward; the shoulder is turned out so the hand clears the hip
  T.upD = []; T.loD = [];
  for (let s = 0; s < 2; s++) {
    const a = B.arm[s], sgn = s ? 1 : -1, amp = 0.5 * P.armSwing * V.arm, sw = (s ? 1 : -1) * amp * Math.cos(2 * PI * ph) * w + 4 * D2R * w;
    const abd = (6 + g.armOut[s]) * D2R, dAbd = abd - a.abd0;
    const up = qmul(T.spineD[2], qmul(qx(sw), qz(sgn * dAbd)));
    const el = P.elbow * (0.5 + 0.5 * w) + P.elbowAmp * Math.cos(2 * PI * (ph - (s ? 0 : 0.5))) * w;
    T.upD[s] = up; T.loD[s] = qmul(up, qx(el));
  }
  return T;
}

const softMin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
/** the pelvis's height, held down so that neither leg is asked to stretch past its reach: a knee bent by KNEE_MIN at mid-stance (nearly straight), and by KNEE_MIN + KNEE_TOE as
 *  the trailing leg leaves the floor (the knee starts to flex in the second half of stance; a leg that is dead straight until toe-off has to snap into its swing, and the knee
 *  angle of a nearly straight leg changes very fast for a small move of the ankle). Once the foot is in the air the reach relaxes over the first half of the swing. */
const KNEE_MIN = 9, KNEE_TOE = 20;
function lowerForReach(g, T, P) {
  const B = g.body, pz = T.pelvisPos[2]; let h = T.pelvisPos[1];
  for (let s = 0; s < 2; s++) {
    const hv = qrot(T.pelvisD, B.hipOff[s]), f = T.feet[s], l = toLocal(g, f.A[0], f.A[2]), fs = g.feet[s];
    const dx = l[0] - T.pelvisPos[0] - hv[0], dz = l[1] - pz - hv[2];
    let kb = 0;
    if (g.walking) { if (fs.mode === 'stance') kb = smoother((wrap1(g.phase - (s ? 0.5 : 0)) - 0.35) / Math.max(0.05, P.S - 0.35)); else if (fs.sw && !fs.sw.T) kb = 1 - smoother(fs.sw.s / 0.5); }
    const cL = kb > 0 ? B.legLen * Math.cos(0.5 * (KNEE_MIN + KNEE_TOE * kb) * D2R) : P.cL;
    h = softMin(h, f.A[1] - hv[1] + Math.sqrt(Math.max(1e-3, cL * cL - dx * dx - dz * dz)), 0.008);
  }
  return h;
}

/** Solve the pose to local bone rotations (and the pelvis's local position). rootP / rootQ = the Root bone's world position / orientation in the node frame (rest
 *  by default). legsOnly (for a standing person whose pelvis and upper body come from a clip): pelvis = { pos, q } in the node frame and only the legs are solved. */
export function gaitSolve(g, T, opts = {}) {
  const B = g.body, ix = B.ix, rootP = opts.rootP || B.P0[ix.Root], rootQ = opts.rootQ || B.Q0[ix.Root], out = { q: {}, pelvisPos: null }, Qw = {};
  const Q0 = (n) => B.Q0[ix[n]], par = (n) => B.rig.bones[B.rig.parent[ix[n]]];
  let pelvisQ, pelvisP;
  if (opts.legsOnly) { pelvisQ = opts.pelvis.q; pelvisP = opts.pelvis.pos; Qw.pelvis = pelvisQ; }   // the pelvis as it is in the node frame (a clip's, or a blend of a clip's and the gait's)
  else {
    pelvisP = T.pelvisPos; Qw.pelvis = pelvisQ = qmul(T.pelvisD, Q0('pelvis')); out.q.pelvis = qnorm(qmul(qinv(rootQ), pelvisQ));
    out.pelvisPos = qrot(qinv(rootQ), sub(pelvisP, rootP));
    ['spine_01', 'spine_02', 'spine_03'].forEach((n, k) => { Qw[n] = qmul(T.spineD[k], Q0(n)); });
    Qw.neck_01 = qmul(T.neckD, Q0('neck_01')); Qw.head = qmul(T.headD, Q0('head'));
    for (let s = 0; s < 2; s++) { const sd = SIDE[s]; Qw['clavicle_' + sd] = qmul(T.claD[s], Q0('clavicle_' + sd)); Qw['upperarm_' + sd] = qmul(T.upD[s], Q0('upperarm_' + sd)); Qw['lowerarm_' + sd] = qmul(T.loD[s], Q0('lowerarm_' + sd)); }
  }
  out.pelvisW = { pos: pelvisP, q: pelvisQ };
  const pelvisYaw = yawOf(qmul(pelvisQ, qinv(Q0('pelvis'))));          // the pelvis's turn from its rest orientation: the knees point halfway between it and the foot
  // legs: hip -> knee -> ankle by two-bone IK, the foot and toe bones set from the foot pose
  for (let s = 0; s < 2; s++) {
    const o = B.leg[s], sd = o.sd, hip = add(pelvisP, qrot(pelvisQ, B.hipLocal[s])), f = T.feet[s], l = toLocal(g, f.A[0], f.A[2]);
    let A = [l[0], f.A[1], l[1]]; const psiRel = f.psi - g.yaw;
    let d = sub(A, hip), D = len(d); const u0 = nrm(d), Dmax = (o.l1 + o.l2) * 0.9995, Dmin = Math.abs(o.l1 - o.l2) + 1e-3;
    if (D > Dmax) { A = add(hip, mul(u0, Dmax)); D = Dmax; } else if (D < Dmin) { D = Dmin; }
    const cosA = clamp((o.l1 * o.l1 + D * D - o.l2 * o.l2) / (2 * o.l1 * D), -1, 1), al = Math.acos(cosA);
    const poleYaw = 0.5 * (psiRel + pelvisYaw), pole = rotY([0, 0, -1], poleYaw);
    const n = nrm(sub(pole, mul(u0, dot(pole, u0)))), K = add(hip, add(mul(u0, o.l1 * cosA), mul(n, o.l1 * Math.sin(al))));
    const a1 = nrm(cross(u0, n)), dT = nrm(sub(K, hip)), dS = nrm(sub(A, K));
    Qw['thigh_' + sd] = qmul(qAlign(o.d0, o.a0t, dT, a1), Q0('thigh_' + sd));
    Qw['calf_' + sd] = qmul(qAlign(o.e0, o.a0s, dS, a1), Q0('calf_' + sd));
    Qw['foot_' + sd] = qmul(qmul(qy(psiRel), qx(f.th)), Q0('foot_' + sd));
    Qw['ball_' + sd] = qmul(qmul(qy(psiRel), qx(f.thb)), Q0('ball_' + sd));
    out.A = out.A || []; out.A[s] = A;
  }
  const names = opts.legsOnly ? ['thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r', 'ball_l', 'ball_r'] : CONTROLLED;
  for (const n of names) { if (n === 'pelvis' && !opts.legsOnly) continue; const p = par(n); out.q[n] = qnorm(qmul(qinv(p === 'Root' ? rootQ : Qw[p]), Qw[n])); }
  return out;
}
const yawOf = (q) => { const f = qrot(q, [0, 0, -1]); return Math.atan2(-f[0], -f[2]); };

/** Forward kinematics of the whole rest skeleton with the solved rotations applied: world (node-frame) positions and orientations of every bone. For tests. */
export function gaitFK(B, solved) {
  const n = B.rig.bones.length, P = new Array(n), Q = new Array(n);
  for (let i = 0; i < n; i++) {
    const nm = B.rig.bones[i], p = B.rig.parent[i];
    const lq = solved.q[nm] || B.rig.quat[i], lp = (nm === 'pelvis' && solved.pelvisPos) ? solved.pelvisPos : B.rig.pos[i];
    if (p < 0) { P[i] = lp.slice(); Q[i] = lq.slice(); } else { P[i] = add(P[p], qrot(Q[p], lp)); Q[i] = qmul(Q[p], lq); }
  }
  return { P, Q };
}
