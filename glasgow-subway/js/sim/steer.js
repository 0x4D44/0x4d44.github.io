// How a person's speed and facing evolve while they walk somewhere, as pure maths (no three.js, no DOM): the crowd (people.js), the recorder (tools/people_motion.html) and the
// offline emulator (gait_emu.mjs) all move people through these functions, so what the rubric measures is what the game does and a test can pin it down.
//
// Why: the first steering low-passed a Cartesian velocity (a = 1 - exp(-8 dt)) toward "straight at the goal" and zeroed it on arrival. That stops a person dead from walking pace
// (peak deceleration 11 m/s2, about a step's time to settle), lets them walk sideways while the body catches up, and spins the body at 300-600 deg/s. A person is not a point mass:
//  - they move along the way they FACE (a unicycle: the heading is the body's own yaw, so nobody crab-walks and the planted feet agree with the path);
//  - the facing turns toward the way they want to go at a limited rate and a limited angular acceleration (a pivot on the spot ~125 deg/s, a little faster once walking: Hase & Stein
//    1999 measured whole-body turns of 90-180 deg in 1-2 s; Courtine & Schieppati 2003 the head leading the body round a bend);
//  - the speed follows the speed they want with a limited acceleration (the first two steps of gait initiation) and a limited braking (a planned stop takes two steps or so, not
//    one: Jaeger & Vanitchatchavan 1992; Hase & Stein 1998), and is lowered while the facing is far off the wanted heading (a corner is taken slowly, turning right round is a pivot);
//  - somebody who is going to STAND at the target follows the braking curve into it, v = sqrt(2 b d), and arrives at rest instead of being stopped.
// Everything is a first-order consequence of those limits; the numbers are published norms or common sense, and are not tuned to any score.
const PI2 = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
/** signed shortest turn from angle a to angle b (rad) */
export const angDiff = (a, b) => { let d = b - a; d -= PI2 * Math.round(d / PI2); return d; };

export const STEER = {
  A: 1.6,        // m/s2, speeding up from rest (about a step and a half to a comfortable walk)
  BR: 1.3,       // m/s2, the planned stop: from 1.2 m/s it takes 0.9 s and 0.55 m
  BMAX: 3.0,     // m/s2, the hardest a person brakes when they have to (something in the way, a sharp corner)
  PIVOT: 2.2,    // rad/s, the fastest turn on the spot (126 deg/s)
  PIVOT_V: 0.35, // rad/s per m/s, a little quicker once the stride has momentum
  AW: 8,         // rad/s2, angular acceleration of the facing (a quarter of a second to full turning speed)
  ARR: 0.04,     // m, a person who is stopping has arrived this close to the target
};

/** the fraction of the wanted speed a person goes at while their facing is `err` rad off the way they want to go: nothing is lost under 20 deg, a right angle costs 45 %, turning right round leaves a crawl */
export function turnGate(err) { const u = clamp((Math.abs(err) - 0.35) / 2.25, 0, 1); return 1 - 0.85 * u * u * (3 - 2 * u); }

/** the fastest the facing may swing round at ground speed v (rad/s) */
export const yawCap = (v) => STEER.PIVOT + STEER.PIVOT_V * Math.min(Math.max(v, 0), 1.3);

/** Turn p.yaw toward `target` with at most `cap` rad/s, accelerating at STEER.AW and slowing so as to arrive without overshoot; p.yw is the turning rate (rad/s). */
export function turnToward(p, target, dt, cap) {
  const err = angDiff(p.yaw, target), a = Math.abs(err), AW = STEER.AW, yw = p.yw || 0;
  const w = Math.sign(err) * Math.min(cap, 0.8 * Math.sqrt(2 * AW * a), 6 * a);
  p.yw = yw + clamp(w - yw, -AW * dt, AW * dt);
  let step = p.yw * dt;
  if (a < 1e-5 || (Math.abs(step) >= a && step * err > 0)) { step = err; p.yw = 0; }
  p.yaw += step;
}

/** One frame of steering for a person who wants to go to a place. p = { yaw, yw, sp } (facing rad, its rate, ground speed m/s); inp = { hT: the heading wanted (rad), want: the speed
 *  wanted (m/s), d: distance to the target (m), stop: the target is a place to stand: brake into it }. Updates p.yaw, p.yw, p.sp and p.turning; returns the distance to move
 *  along the (new) facing this frame. */
export function steerStep(p, dt, inp) {
  const err = angDiff(p.yaw, inp.hT), gate = turnGate(err);
  let vT = inp.want * gate;
  if (inp.stop) vT = Math.min(vT, Math.sqrt(2 * STEER.BR * Math.max(0, inp.d - STEER.ARR)));
  p.sp = vT > p.sp ? Math.min(vT, p.sp + STEER.A * dt) : Math.max(vT, p.sp - STEER.BMAX * dt);
  p.turning = gate < 0.9;
  turnToward(p, inp.hT, dt, yawCap(p.sp));
  return Math.min(p.sp * dt, Math.max(0, inp.d));
}

/** has a person who is going to a place got there? A person who stops is there when within a few centimetres AND all but at rest (the braking curve ends at rest there, so it is a
 *  frame or two after it is close: the speed that is then taken off them is a few cm/s, not a walking pace), or when crawling within 15 cm (a place they cannot quite reach); one who
 *  is only passing through is there at 30 cm, and turns for the next place without stopping. */
export const arrived = (p, d) => (p.stopHere ? (d < STEER.ARR + 0.01 && p.sp < 0.06) || (d < 0.15 && p.sp < 0.05) : d < 0.3);
