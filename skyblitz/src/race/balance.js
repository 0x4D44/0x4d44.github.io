// Item + difficulty + race tuning tables. Owner: race agent. Pure data + tiny pure functions (safe in node:test).
// All numbers that decide "how it feels" live here so a tuning pass never touches logic files.

export const ITEMS = {
  missile: { id: 'missile', name: 'Homing Missile', icon: '🚀', count: 1, color: '#ff5a36', desc: 'Hold a lock for 1 s, then fire. Barrel-roll it away.' },
  triple:  { id: 'triple',  name: 'Triple Missiles', icon: '🚀', count: 3, color: '#ff8a1f', desc: 'Three homing missiles, fired one at a time.' },
  mine:    { id: 'mine',    name: 'Flak Mine', icon: '💣', count: 1, color: '#ff3d71', desc: 'Dropped behind you; bursts when a rival gets close.' },
  turbo:   { id: 'turbo',   name: 'Turbo Burst', icon: '⚡', count: 1, color: '#ffd02e', desc: 'A short, strong speed boost.' },
  turbo3:  { id: 'turbo3',  name: 'Triple Turbo', icon: '⚡', count: 3, color: '#ffe66b', desc: 'Three turbo bursts.' },
  shield:  { id: 'shield',  name: 'Aegis Shield', icon: '🛡', count: 1, color: '#33d6ff', desc: 'Absorbs one hit (10 s).' },
  emp:     { id: 'emp',     name: 'Shock Pulse', icon: '📡', count: 1, color: '#9b6bff', desc: 'Stuns every unshielded rival nearby.' },
  storm:   { id: 'storm',   name: 'Thunderstorm', icon: '⛈', count: 1, color: '#7aa8ff', desc: 'Lightning strikes the race leader.' },
  smoke:   { id: 'smoke',   name: 'Smoke Screen', icon: '💨', count: 1, color: '#b8c4d6', desc: 'Blinds and slows rivals who fly through it.' },
  drone:   { id: 'drone',   name: 'Wingman Drone', icon: '🛸', count: 1, color: '#4dff9d', desc: 'A drone hunts the next racer ahead and shoots at it.' },
};
export const ITEM_ORDER = ['missile', 'triple', 'mine', 'turbo', 'turbo3', 'shield', 'emp', 'storm', 'smoke', 'drone'];

/** Grand Prix points by finishing place (1st..8th). */
export const GP_POINTS = [10, 8, 6, 5, 4, 3, 2, 1];

// Item distribution: [weight for the leader, weight for last place]; linear in between (rubber-banding by position).
// Leaders get defence and mines; the back of the pack gets the comeback items (storm, triple turbo, EMP, triple missiles).
const WEIGHTS = {
  missile: [10, 12], triple: [2, 14], mine: [16, 2], turbo: [14, 10], turbo3: [2, 16],
  shield: [22, 4], emp: [2, 10], storm: [0, 14], smoke: [12, 0], drone: [4, 10],
};

export function itemWeights(place, n) {
  const f = n <= 1 ? 0 : Math.max(0, Math.min(1, (place - 1) / (n - 1)));
  const w = {};
  for (const k of ITEM_ORDER) w[k] = WEIGHTS[k][0] + (WEIGHTS[k][1] - WEIGHTS[k][0]) * f;
  if (place <= 1) w.storm = 0;      // the leader never rolls a storm (it would strike somebody else... or nobody)
  return w;
}

/** Roll an item for a racer in `place` of `n`. rng = game-seeded RNG. Returns { type, count }. */
export function rollItem(rng, place, n) {
  const w = itemWeights(place, n);
  let total = 0; for (const k of ITEM_ORDER) total += w[k];
  let x = rng.float() * total;
  for (const k of ITEM_ORDER) { x -= w[k]; if (x <= 0 && w[k] > 0) return { type: k, count: ITEMS[k].count }; }
  return { type: 'turbo', count: 1 };
}

// aiSpeed    base speed multiplier of the AI (before rubber-banding)
// aiSkill    scales every pilot's skill (corner speed, reaction, aim)
// rubber     max +speed bonus when far behind the reference (leaders get 60 % of this as a penalty)
// rubberRange metres of gap for the full effect
// mistakes   scale on the frequency of human-like mistakes
// reaction   AI reaction time (s) to a missile warning / item opportunity
// aggro      scale on item/cannon aggression
// playerHelp hidden speed help for a human trailing the best AI by up to rubberRange m (fraction; from place 4 down)
// aheadSlow  max slowdown of an AI far AHEAD of the human (fraction): 0 within RACE.aheadDead m of gap, full rubberRange m beyond that;
//            never takes the AI below RACE.aheadFloor of its craft's cruise
export const DIFFICULTY = {
  easy:   { id: 'easy', shortcutBias: -0.12, finishExtra: 60,   aiSpeed: 0.67, aiSkill: 0.55, rubber: 0.06, rubberRange: 650, aheadSlow: 0.25, mistakes: 1.7, reaction: 0.55, aggro: 0.6,  playerHelp: 0.25 },
  normal: { id: 'normal', shortcutBias: 0, finishExtra: 40, aiSpeed: 0.77, aiSkill: 0.75, rubber: 0.06, rubberRange: 450, aheadSlow: 0.20, mistakes: 1.0, reaction: 0.35, aggro: 0.85, playerHelp: 0.06 },
  hard:   { id: 'hard', shortcutBias: 0.08,   aiSpeed: 0.79, aiSkill: 0.90, rubber: 0.05, rubberRange: 400, aheadSlow: 0.04, mistakes: 0.6, reaction: 0.22, aggro: 1.0,  playerHelp: 0 },
  expert: { id: 'expert', shortcutBias: 0.12, aiSpeed: 0.996, aiSkill: 1.00, rubber: 0.04, rubberRange: 350, aheadSlow: 0, mistakes: 0.35, reaction: 0.12, aggro: 1.15, playerHelp: 0 },
};

/** Fraction an AI `gap` m ahead of the human slows by: 0 within RACE.aheadDead, rising linearly to d.aheadSlow over d.rubberRange more metres. */
export function aheadSlowFor(gap, d) {
  const g = Math.max(0, Math.min(1, (gap - RACE.aheadDead) / d.rubberRange));
  return (d.aheadSlow || 0) * g;
}

export const RACE = {
  countdown: 3,            // seconds of 3-2-1 before GO
  rocketWindow: 0.5,       // boost pressed in the last 0.5 s before GO = rocket start (good, perfect inside perfectWindow); any boost earlier = early
  perfectWindow: 0.18,
  finishTimeout: 25,       // seconds the race stays open after the human finishes
  maxClock: 900,           // hard stop (s) if the human never finishes
  overtakeHyst: 5,         // metres a rival must be ahead before places swap
  launchSpeedFrac: 0.72,   // GO launch speed as a fraction of cruise
  respawnScrapeT: 3.5, respawnStuckT: 3, respawnLostT: 2.5, respawnHighM: 150, respawnHighT: 1,
  draftRange: 85, draftCone: 0.14, draftTime: 1.6, // slipstream: metres behind, wake half-width grows 0.14 m per m behind, seconds to charge a slingshot
  cruiseRef: 100,          // fallback reference cruise (m/s)
  progressAI: true,        // apply the net-progress respawn to the AI too
  respawnProgEff: 0.1,     // ...and only if net progress is also under this fraction of the path flown in the window (vertical loops credit about 0.2)
  respawnProgSpeed: 15, respawnProgT: 5, // stuck by PROGRESS: under 15 m/s of course progress for 5 s (decaying timer) respawns, however the speed bounces
  assistDrag: 0,           // (d) the human's speed multiplier x (1 - assistDrag * smoothed keyboard-guide weight, 0..0.85); 0 = off
  idleDrag: 0.19,             // hands-off rule: fraction of the human's pace removed at full idle (no key for 14 s); eases in over 8-14 s (0 = off)
  idleRelease: 3,          // idleCruise falls at this rate per second once any key is down (full release in ~0.3 s)
  manualRespawnGap: 1.5,   // s after any respawn before a manual one is accepted again
  gridClearance: 8,      // m between a craft's lowest collision surface and the ground / deck at the grid
  aheadDead: 150,         // metres an AI may lead the human before the ahead-slowdown starts
  aheadFloor: 0.65,        // the ahead-slowdown never takes an AI below this fraction of its craft's cruise
  cruiseNorm: 0.4,        // how far AI cruise is pulled toward the human's craft (0 = raw stats, 1 = identical)
};

export const WEAPONS = {
  // missile: lock = the nearest racer AHEAD ON THE COURSE (gap lockMin..lockMax m) inside a cone measured in the course frame (angle of its lateral / vertical
  // offset against the along-course gap, lockCone rad; a held lock survives lockStick x the cone). Guidance = course-following pursuit: a carrot `look` [near, far] m
  // up the centre line, holding the missile's own offset inside the airway (`airway` of the corridor ellipse) and round hazards (`hazardMargin` m), blending onto the
  // target's line over `courseBlend` [near, far] m of gap and into plain pursuit over `direct` [far, near] m of distance; turnCourse steers the carrot, turn* the pursuit.
  // Barrel evasion is a TIMING WINDOW: a roll protects only from evadeFrom to evadeTo (fractions of the roll) after it starts, so one begun `evadeFrom x T` .. `evadeTo x T`
  // seconds before arrival evades (T = FLIGHT.barrelTime). The ROLL cue (warn `evade`) is narrower by `cue` [early, late] s, the error of tti in the last half second, so a
  // roll begun on the cue lands inside the window. Warning pings: interval = clamp(ping[0] + ping[1] x tti, ping[2], ping[3]); closeTau smooths the closing speed,
  // ttiTau x tti is the time constant that pulls the tti clock toward its raw estimate. The pursuit aims at the intercept point (lead capped at leadMax s); steering
  // starts after armT s. A missile with no quarry, or one it can no longer hurt, takes the nearest racer ahead of it within seekRange m (a weak lock).
  // Speed: accelerates at `accel` to `speed`, holds it for `burn` s, then loses `decay` m/s per s down to `floor` (a boosting racer outruns it); it is lost after `life` s,
  // beyond `loseDist` m, or `passTime` s after it has overshot its target by `passMargin` m (a corridor has no room for a U-turn).
  missile: { lockTime: 0.9, lockCone: 0.45, lockStick: 1.5, lockMin: 40, lockMax: 450, speed: 180, accel: 240, burn: 7.0, decay: 32, floor: 115, turn: 1.7, turnWeak: 1.0, turnDumb: 0.65, turnCourse: 3.2,
             look: [30, 80], airway: 0.6, hazardMargin: 16, courseBlend: [70, 300], direct: [130, 55], life: 9.0, armT: 0.05, seekRange: 300, leadMax: 1.2, hitPad: 3.0, loseDist: 560, passMargin: 8, passTime: 0.15,
             evadeFrom: 0.12, evadeTo: 0.95, cue: [0.03, 0.12], closeTau: 0.25, ttiTau: 0.4, ping: [0.1, 0.13, 0.12, 0.5], tumble: 1.5, loss: 0.4 },
  mine: { arm: 0.8, ownerGrace: 1.8, radius: 14, life: 45, tumble: 1.35, loss: 0.35 },
  emp: { radius: 240, stun: 1.5, loss: 0.2 },
  storm: { tumble: 1.3, loss: 0.4 },
  // smoke: dropped `back` m behind the owner on the line of the nearest follower (within `reach` m); a racer in it is blind for `blind` s (no lock-ons, wobbly steering)
  // and loses speed at `drag` per second, never below 1.1 x its minimum speed.
  smoke: { radius: 55, life: 6.5, blind: 1.2, drag: 0.4, back: 36, reach: 450 },
  shield: { time: 10 },
  turbo: { time: 2.2, power: 1.6 }, turbo3: { time: 1.6, power: 1.6 },
  // drone: course-following wingman that holds `station` m behind the racer ahead and shoots when that racer is within `cone` (cosine) of its nose; it is spent after `maxHits` landed bolts.
  drone: { life: 13, speedMul: 1.15, fireEvery: 0.38, range: 230, cone: 0.86, maxHits: 6, turn: 3.0, station: 24 },
  cannon: { interval: 0.11, heatPerShot: 0.075, cool: 0.4, coolLocked: 0.28, resume: 0.4, speed: 260, life: 1.25, hitPad: 3.2, aimAssist: 0.35, aimCone: 0.14, stagger: 0.93, comboWindow: 2.5, comboHits: 5, comboTumble: 1.1 },
  invulnAfterHit: 1.6,
};
