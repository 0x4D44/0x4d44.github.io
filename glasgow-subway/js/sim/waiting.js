// How people wait on a platform, and how they answer someone who walks up to them. Pure maths: no three.js (look_three.js lays the result over a skeleton, people.js
// drives it). The sources, and what is taken from each, are in research/people-behaviour.md.
//
// 1. WHERE they wait (chooseSpot). Field studies of real platforms (Kuepper & Seyfried 2023; Bosina et al. 2015) find that people do not spread evenly: they stand by walls
//    and other fixed things, keep a fairly constant distance from strangers, stay back from the edge, and those who arrive late stop near the way in. People who know the
//    line stand where a door will stop. Each of those is a term of spotCost.
// 2. WHAT they look at (attend). A waiting person mostly rests their eyes ahead; now and then they glance up the tunnel (more often as the train comes due), at the
//    indicator, or about. A stranger in the social zone gets one short glance and is then left alone (Goffman's "civil inattention"); one who comes inside personal
//    distance (Hall: about 1.2 m) is looked at, with breaks, because a held mutual gaze of more than about three seconds is uncomfortable (Binetti et al. 2016).
//    Nobody walks away: people yield ground only to someone who keeps pressing into them.

export const PROX = { intimate: 0.45, personal: 1.2, social: 3.6 };   // m (Hall 1966)
export const WAIT = {
  space: 1.2,      // m: the distance kept from a stranger while there is room
  hard: 0.55,      // m: never closer than this
  edge: 0.9,       // m: nobody waits closer to the platform edge
  wall: 0.35,      // cost per metre away from the back wall, for someone who likes a wall behind them
  door: 0.5,       // the pull of a place where a door will stop (within doorR along the platform)
  doorR: 1.6,
  along: 0.035,    // cost per metre walked along the platform from the way in (an early arrival)
  late: 0.3,       // ... and for someone who arrives as the train is due
  noise: 0.7,
};
export const LOOK = {
  yawMax: 1.15,    // rad: how far the head and upper spine turn between them (about 65 degrees); beyond it the body turns
  upMax: 0.45, downMax: 0.5,
  rate: 3.2,       // rad/s: top speed of a turn of the head
  ease: 9,         // 1/s: how hard it eases in to the target
  turnAt: 1.0,     // rad: someone looked at from further round than this turns their body
  turnTo: 0.35,    // rad: ... until the person is this far off straight ahead
  gazeMin: 2.2, gazeMax: 4.5,     // s of looking at you, between looks away
  avertMin: 0.5, avertMax: 1.1,   // s
  glanceMin: 0.8, glanceMax: 1.8, // s: the one glance a stranger in the social zone gets
  ignore: 7,       // s before the same stranger gets another glance
  laugh: 0.55,     // share of people who give a nervous laugh when you step inside personal distance (the rest nod)
  laughDur: 1.1, laughHz: 4.6,
  nodDur: 0.7,
  restMin: 4, restMax: 13,        // s between idle glances
  press: 0.7,      // s of being pressed into (inside intimate distance) before a person gives ground
};

/** cost of waiting at c {x,z}: lower is better. ctx: { others: [{x,z}], backDist(x,z), edgeDist(x,z), entrance: {x,z}|null, doors: [z], late: 0..1, wallLover: 0..1 } */
export function spotCost(c, ctx) {
  let cost = 0;
  for (const o of ctx.others || []) {
    const d = Math.hypot(o.x - c.x, o.z - c.z);
    if (d < WAIT.hard) cost += 100; else if (d < WAIT.space) cost += (WAIT.space - d) * 4;
  }
  const e = ctx.edgeDist ? ctx.edgeDist(c.x, c.z) : 9; if (e < WAIT.edge) cost += 50 + (WAIT.edge - e) * 20;
  if (ctx.backDist) cost += WAIT.wall * (ctx.wallLover ?? 0.5) * 2 * Math.min(3, Math.max(0, ctx.backDist(c.x, c.z)));
  if (ctx.entrance) cost += (WAIT.along + (WAIT.late - WAIT.along) * (ctx.late || 0)) * Math.hypot(ctx.entrance.x - c.x, ctx.entrance.z - c.z);
  if (ctx.doors && ctx.doors.length && !(ctx.late > 0.8)) { let b = 1e9; for (const z of ctx.doors) b = Math.min(b, Math.abs(z - c.z)); if (b < WAIT.doorR) cost -= WAIT.door * (1 - b / WAIT.doorR); }
  return cost;
}
/** the best of the candidate places (each given a little noise, so that two people with the same view of the platform do not pick the same spot); null when none is usable */
export function chooseSpot(cands, ctx, rng) {
  let best = null, bc = 40;   // (40: every usable place costs less; a place inside someone's body space or on the edge costs more)
  for (const c of cands) { const k = spotCost(c, ctx) + rng() * WAIT.noise; if (k < bc) { bc = k; best = c; } }
  return best;
}

const wrap = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
const between = (rng, a, b) => a + rng() * (b - a);
export function newAttention(rng) { return { tgt: 'rest', t: between(rng, 0.5, 8), yaw: 0, pitch: 0, wy: 0, wp: 0, vy: 0, vp: 0, near: false, seen: 0, laugh: 0, nod: 0, bob: 0, press: 0, breath: rng() * 6.28, laughs: rng() < LOOK.laugh, greeted: false }; }

/** One step of a standing person's attention. a: the state (newAttention). ctx:
 *   player: null | { yaw, pitch, d }  - where the player's eyes are, as angles off the way this person's body faces (rad; yaw +ve = to their left), and how far (m)
 *   train:  null | { yaw }            - the same for the train running in (or the tunnel mouth it comes from)
 *   board:  null | { yaw, pitch }     - the next-train indicator
 *   due: 0..1 (how soon the train is), phone: on a phone (eyes stay down unless spoken to, as it were), busy: walking / boarding (no looking about)
 *  Sets a.yaw / a.pitch (head, off the body's facing), a.bob (the shake of a laugh or the dip of a nod, rad), and returns { turn: null | rad } - how far the BODY should
 *  turn - and { yield: true } once someone has pressed into them for LOOK.press. */
export function attend(a, dt, rng, ctx) {
  const pl = ctx.player, out = { turn: null, yield: false };
  const inView = pl && Math.abs(pl.yaw) < 2.0;   // (people notice someone beside them, and a little behind)
  const personal = pl && pl.d < PROX.personal * (a.near ? 1.25 : 1) && (inView || pl.d < 0.8);   // (a little hysteresis: they do not flick on and off at the boundary)
  a.t -= dt; a.seen = Math.max(0, a.seen - dt);
  a.press = pl && pl.d < PROX.intimate ? a.press + dt : 0; if (a.press > LOOK.press) { out.yield = true; a.press = 0; }
  if (ctx.busy) { a.tgt = 'rest'; a.wy = 0; a.wp = 0; a.near = false; }
  else if (personal) {
    if (!a.near) { a.near = true; a.tgt = 'you'; a.t = between(rng, LOOK.gazeMin, LOOK.gazeMax); a.react = between(rng, 0.25, 0.6); a.cue = between(rng, 0.7, 1.4); a.greeted = false; }
    if (a.react > 0) a.react -= dt;   // it takes a moment to notice
    else {
      // a look away goes back toward straight ahead if the head is already turned
      if (a.t <= 0) { if (a.tgt === 'you') { a.tgt = 'avert'; a.t = between(rng, LOOK.avertMin, LOOK.avertMax); a.ay = Math.max(-LOOK.yawMax, Math.min(LOOK.yawMax, pl.yaw)) + (Math.abs(pl.yaw) > 0.5 ? -Math.sign(pl.yaw) : rng() < 0.5 ? -1 : 1) * between(rng, 0.25, 0.5); a.ap = -between(rng, 0.12, 0.3); } else { a.tgt = 'you'; a.t = between(rng, LOOK.gazeMin, LOOK.gazeMax); } }
      if (a.tgt === 'you') { a.wy = pl.yaw; a.wp = pl.pitch; } else { a.wy = a.ay; a.wp = a.ap; }
      if (Math.abs(pl.yaw) > LOOK.turnAt) out.turn = pl.yaw - Math.sign(pl.yaw) * LOOK.turnTo;
      if (!a.greeted && (a.cue -= dt) <= 0) { a.greeted = true; if (a.laughs) a.laugh = LOOK.laughDur; else a.nod = LOOK.nodDur; }
    }
  } else {
    if (a.near) { a.near = false; a.tgt = 'rest'; a.t = between(rng, 1.5, 4); a.seen = LOOK.ignore; }
    const social = pl && pl.d < PROX.social && Math.abs(pl.yaw) < 1.4;
    if (social && a.seen <= 0 && a.tgt !== 'glance' && !ctx.phone) { a.tgt = 'glance'; a.t = between(rng, LOOK.glanceMin, LOOK.glanceMax); a.seen = LOOK.ignore + a.t; }   // one look, then civil inattention
    if (a.t <= 0) {
      if (a.tgt !== 'rest') { a.tgt = 'rest'; a.t = between(rng, LOOK.restMin, LOOK.restMax) * (ctx.phone ? 2.5 : 1) * (1 - 0.6 * (ctx.due || 0)); }
      else {
        const x = rng(), due = ctx.due || 0;
        if (ctx.train && x < 0.35 + 0.5 * due) { a.tgt = 'train'; a.t = between(rng, 1, 2.6 + 3 * due); }
        else if (ctx.board && x < 0.75) { a.tgt = 'board'; a.t = between(rng, 1.2, 2.5); }
        else { a.tgt = 'about'; a.t = between(rng, 0.8, 2.2); a.ay = between(rng, -0.7, 0.7); a.ap = between(rng, -0.15, 0.1); }
      }
    }
    if (a.tgt === 'glance' && pl) { a.wy = pl.yaw; a.wp = pl.pitch; }
    else if (a.tgt === 'train' && ctx.train) { a.wy = ctx.train.yaw; a.wp = 0; }
    else if (a.tgt === 'board' && ctx.board) { a.wy = ctx.board.yaw; a.wp = ctx.board.pitch; }
    else if (a.tgt === 'about') { a.wy = a.ay; a.wp = a.ap; }
    else { a.wy = 0; a.wp = 0; }
  }
  // the head: eased toward the target, with a top speed (a turn of the head takes a few tenths of a second, it does not snap)
  const wy = Math.max(-LOOK.yawMax, Math.min(LOOK.yawMax, wrap(a.wy))), wp = Math.max(-LOOK.downMax, Math.min(LOOK.upMax, a.wp));
  const k = 1 - Math.exp(-LOOK.ease * dt), lim = LOOK.rate * dt;
  a.yaw += Math.max(-lim, Math.min(lim, (wy - a.yaw) * k)); a.pitch += Math.max(-lim, Math.min(lim, (wp - a.pitch) * k));
  // the laugh (a few quick shakes of the shoulders, dying away, eyes dropping) and the nod (one dip)
  a.bob = 0; a.drop = 0;
  if (a.laugh > 0) { const u = 1 - a.laugh / LOOK.laughDur, env = Math.sin(Math.PI * Math.min(1, u * 1.15)) * (1 - 0.5 * u); a.bob = env * Math.sin(u * LOOK.laughDur * LOOK.laughHz * 2 * Math.PI); a.drop = env; a.laugh = Math.max(0, a.laugh - dt); }
  else if (a.nod > 0) { const u = 1 - a.nod / LOOK.nodDur; a.drop = Math.sin(Math.PI * u) ** 2 * 1.3; a.nod = Math.max(0, a.nod - dt); }
  a.breath += dt * 1.6;   // about 15 breaths a minute
  return out;
}
