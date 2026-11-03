// THE WATER UNDER A WALKER (A1, round 8, dev/FEATURE-BEACH.md 3.1 and 3.3): the numbers and the pure rules of the swim and dive state machine. engine/player.js runs them once a frame; nothing here
// touches THREE, the DOM or the context, so tests/engine-swim.test.mjs holds every threshold on its own and runs the real Player over them (walking in, swimming, diving, the ladders, the current).
//
//   mode   'dry' | 'wade' | 'deep' | 'swim', from the depth (metres of water over the ground under the feet) and the mode before it:
//          dry   depth <= 0.10                 as on land
//          wade  depth over 0.10               speed x (1 - 0.5 x clamp((depth - 0.10) / 0.8)): 2.3 down to 1.15 m/s; the steps are splashes (surface 'shallow' under 0.45 m, 'wade' above)
//          deep  depth >= 0.90                 no sprint, no jump, no crouch; the eyes are still dry (they are 1.64 over the feet)
//          swim  depth >= 1.55, kept to 1.30   the feet leave the ground; horizontal, 1.4 m/s (Shift 2.2); C or looking down 35 degrees with W dives; Space comes up
//   A walker is only IN the water while his feet are: up on the pier's or the raft's deck, or in the air over the sea, he is dry whatever the depth under him (`wet`).
//
// The swimmer's body. `s.y` (the feet) is the body's LOWEST point, because the kernel's walls count from it (a wall blocks when its top is over 0.4 m above the feet): 0.3 m under the still surface, so
// the head is 0.14 m over it (the eye is 0.44 m over the feet). That is world/beachfinds.js SURFACE_Y = SEA - 0.3 = -1.5, which is the one place the finds' windows read: a swimmer at the surface is
// outside the three seabed finds' depth windows and a diver on the floor (the seabed + 0.3, no deeper than 3.4 m under the still surface) is inside them. The swell lifts the EYE, not the feet.
import { CONFIG } from '../core/config.js';
import { SEA, PIER } from '../world/coast.js';

const P = CONFIG.PLAYER;                                       // (read at every call, not copied: a test moves a number and the controller follows)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const FLOAT = 0.3;                                      // the feet hang this far under the still surface of a swimmer at rest
export const BODY = 0.6;                                       // the swimmer's height for the kernel's walls and floors
export const eyeUp = () => FLOAT + P.swimEye;                  // the eye over the feet: P.swimEye (0.14) over the still surface, so 0.44
export const FLOOR_UP = 0.3;                                   // a diver stays this far over the seabed ...
export const MAX_DEPTH = 3.4;                                  // ... and no deeper than this under the still surface
export const WET_UP = 0.02;                                    // feet this far over the surface or lower are in the water
export const SURFACE_EPS = 0.08;                               // a swimmer more than this under his resting height is diving
export const DIVE_PITCH = (-35 * Math.PI) / 180;               // looking down further than this with W while swimming is a dive
export const WADE_SLOW = 0.5, WADE_SPAN = 0.8;                 // the share of speed lost at 0.90 m, and the depth span over which it is lost (from wadeMin)
export const ACCEL = 4, DECEL = 2.5, VY_RATE = 6;              // the water's smoothing (1/s): slow to start, slow to stop
export const PLUNGE = 0.35, DRAG = 3, PLUNGE_END = 0.1, PLUNGE_MAX = 1.5;   // a fall into the sea keeps 35 % of its speed, drag 3 per second until it is under 0.1 m/s (at most 1.5 s), then buoyancy
export const BUOY = 1.0;                                       // m/s up, after a plunge or a lift
export const BREATH_LIFT = 40, BREATH_REFILL = 3;              // seconds under before the lift to the surface; refill 3 times faster in air
export const STROKE = 1.4;                                     // seconds between the swimmer's stroke events while he moves
export const CLIMB_TIME = 0.4;                                 // seconds up a ladder
export const LADDER_GRACE = 0.8;                               // seconds after he enters the water before a ladder takes him (he jumped in beside it with Space still down)
export const RESIST = 0.8, PUSH = 0.8;                         // at the soft limit's end the speed is x (1 - 0.8) and a 0.8 m/s current runs toward the shore
export const WHISTLE_Z = 207, WHISTLE_EVERY = 60;              // the lifeguard's whistle: from this z, at most once in this many seconds of swimming
export const RIDE_FADE = 0.6, CLEAR = 0.06;                    // the eye rides the swell from the surface down to this far under it; at the surface it is never less than CLEAR over it
export const ROLL_GAIN = 0.14, ROLL_MAX = (0.8 * Math.PI) / 180;   // the camera's roll with the surface's slope across the view, and its limit (0.8 degrees)
export const TOAST = Object.freeze({
  hint: 'Espacio: subir. C: bucear. Shift: nadar más rápido.',
  ladder: 'Espacio o W: subir por la escalera.',
  limit: 'Más allá la corriente es fuerte. El salvavidas te silba.',
});

/** The mode for a depth, the mode before it and whether the feet are in the water. A swimmer stays one down to swimOff; nobody else becomes one before swimOn. */
export function modeFor(depth, was = 'dry', wet = true) {
  if (was === 'swim' ? depth >= P.swimOff : wet && depth >= P.swimOn) return 'swim';
  if (!wet) return 'dry';
  return depth >= P.deep ? 'deep' : depth > P.wadeMin ? 'wade' : 'dry';
}

/** The speed a wader keeps: all of it up to wadeMin, half of it from 0.90 m down. */
export const wadeScale = (depth) => 1 - WADE_SLOW * clamp((depth - P.wadeMin) / WADE_SPAN, 0, 1);

/** The feet of a swimmer at rest. */
export const swimY = (sea = SEA) => sea - FLOAT;
/** The lowest a diver goes: 0.3 m over the ground, never more than 3.4 m under the still surface. */
export const diveFloor = (ground, sea = SEA) => Math.max(ground + FLOOR_UP, sea - MAX_DEPTH);
/** The current at the south edge: the share of speed kept, and the push toward the shore (m/s). `soft` is plan.coast.limit(x, z).soft, 0 to 1 over z 204 to 215. */
export const limitScale = (soft) => 1 - RESIST * soft;
export const limitPush = (soft) => PUSH * soft;
/** What a fall into the sea becomes: the speed the plunge starts with, and the depth under the point the feet crossed the surface at that it comes to rest (drag only). Both negative speeds are down. */
export const plungeSpeed = (vyIn) => vyIn * PLUNGE;
export const plungeDepth = (vyIn) => (-vyIn * PLUNGE) / DRAG;

/** Looking down with W, past DIVE_PITCH: the keyboard's dive, as C is. */
export const wantsDive = (f, pitch, crouchKey) => !!crouchKey || (f > 0.2 && pitch < DIVE_PITCH);

/**
 * The breath, one step. b = { t, low, lift }: seconds under, the warning given, being carried up. `under` = the head is under the surface. Returns the events of the step, in order:
 * 'low' (P.breath seconds under: the heartbeat), 'lift' (40 s: carried up), 'gasp' (the lift is over: the head is out; the breath is back to P.breath, never worse). In air it refills 3 times faster than it runs out.
 */
export function breathStep(b, under, dt) {
  const out = [];
  if (under) {
    b.t += dt;
    if (!b.low && b.t >= P.breath) { b.low = true; out.push('low'); }
    if (!b.lift && b.t >= BREATH_LIFT) { b.lift = true; out.push('lift'); }
  } else {
    if (b.lift) { b.lift = false; b.t = Math.min(b.t, P.breath); out.push('gasp'); }
    else b.t = Math.max(0, b.t - BREATH_REFILL * dt);
    if (b.t < P.breath) b.low = false;
  }
  return out;
}
/** 0 to 1 over the last stretch of breath (25 to 40 s): the closing vignette and the heartbeat. */
export const breathSoft = (t) => clamp((t - P.breath) / (BREATH_LIFT - P.breath), 0, 1);

/** The ladder a swimmer at (x, z) with his feet at y can take (plan.coast.climbs: within its radius, not below its lowest rung), the nearest, or null. */
export function climbAt(climbs, x, z, y) {
  let best = null, bd = Infinity;
  if (climbs) for (const c of climbs) { const d = Math.hypot(x - c.x, z - c.z); if (d <= c.r && y >= c.y - 0.05 && d < bd) { best = c; bd = d; } }
  return best;
}

/** The eye (absolute height) of a swimmer whose feet are at y, over a surface that stands `level` over the still sea. 0.44 over the feet; at the surface it rides the swell (m = the setting, 0 to 1) and is
 *  never under it (the head is never in the water at the surface, whatever the setting). Diving, the head is where the body is. */
export function eyeFor(y, level, m = 1, sea = SEA) {
  const up = clamp(1 - (swimY(sea) - y) / RIDE_FADE, 0, 1), e = y + eyeUp() + up * m * level;
  return e + up * Math.max(0, sea + level + CLEAR - e);                      // (the lift to CLEAR over the surface fades out with `up`: a diver's head is where his body puts it)
}
/** The camera's roll (radians) from the surface's slope [dh/dx, dh/dz] and the way he looks: the surface rising to his right leans him left. */
export function rollFor(sx, sz, yaw, m = 1) {
  const across = sx * Math.cos(yaw) - sz * Math.sin(yaw);
  return m * clamp(across * ROLL_GAIN, -ROLL_MAX, ROLL_MAX);
}

/** `__ladera.tp(name)` (engine/debug.js): where the player is put on the beach. 'beach': the sand at the middle of the bay, the water's edge ahead; 'pier': the head of the pier at its rail's gap, looking out to sea;
 *  'swim': at the surface 40 m out, looking back at the beach and the town; 'under': on the seabed 4 m from the sunken anchor, looking at it. `o` overrides any member (x, z, y, yaw, pitch, swim). */
export const TP_NAMES = Object.freeze(['beach', 'pier', 'swim', 'under']);
export function tpPlace(coast, where, o = {}) {
  const at = {
    beach: { x: 0, z: 135.5, yaw: Math.PI, pitch: -0.02 },
    pier: { x: PIER.x, z: PIER.z1 - 1.5, y: PIER.top, yaw: Math.PI, pitch: -0.12 },
    swim: { x: 0, z: 185, swim: true, yaw: 0, pitch: 0.02 },
    under: { x: -22, z: 186, swim: true, floor: true, yaw: Math.PI, pitch: -0.1 },
  }[where];
  if (!at) throw new Error(`tp: no place '${where}' (${TP_NAMES.join(', ')})`);
  const { floor, ...t } = { ...at, ...o };
  if (floor && t.y === undefined) t.y = diveFloor(coast.heightAt(t.x, t.z)) + 0.2;
  return t;
}

/** The state a player carries (player.water): see engine/player.js. */
export const newWater = () => ({
  mode: 'dry', depth: -1, surf: SEA, under: false, diving: false,
  vy: 0, plunge: 0, buoy: false, breath: { t: 0, low: false, lift: false }, breathSoft: 0,
  stroke: STROKE, foot: 0, climb: null, ladderOk: 0, clock: 0, whistleAt: -1e9, whistled: false, hinted: false, ladderHinted: false,
  eye: SEA, roll: 0,
});

/** The numbers, for the debug overlay and the tests. */
export const WATER = Object.freeze({
  FLOAT, BODY, FLOOR_UP, MAX_DEPTH, WET_UP, SURFACE_EPS, DIVE_PITCH, WADE_SLOW, WADE_SPAN, ACCEL, DECEL, VY_RATE, PLUNGE, DRAG, PLUNGE_END, PLUNGE_MAX, BUOY,
  BREATH_LIFT, BREATH_REFILL, STROKE, CLIMB_TIME, LADDER_GRACE, RESIST, PUSH, WHISTLE_Z, WHISTLE_EVERY, RIDE_FADE, CLEAR, ROLL_GAIN, ROLL_MAX,
});
