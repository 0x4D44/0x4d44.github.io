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
// playerHelp small hidden speed help for a human who is last (fraction)
export const DIFFICULTY = {
  easy:   { id: 'easy',   aiSpeed: 0.90, aiSkill: 0.55, rubber: 0.10, rubberRange: 500, mistakes: 1.7, reaction: 0.55, aggro: 0.6,  playerHelp: 0.05 },
  normal: { id: 'normal', aiSpeed: 0.96, aiSkill: 0.75, rubber: 0.08, rubberRange: 450, mistakes: 1.0, reaction: 0.35, aggro: 0.85, playerHelp: 0.025 },
  hard:   { id: 'hard',   aiSpeed: 1.00, aiSkill: 0.90, rubber: 0.06, rubberRange: 400, mistakes: 0.6, reaction: 0.22, aggro: 1.0,  playerHelp: 0 },
  expert: { id: 'expert', aiSpeed: 1.04, aiSkill: 1.00, rubber: 0.05, rubberRange: 350, mistakes: 0.35, reaction: 0.12, aggro: 1.15, playerHelp: 0 },
};

export const RACE = {
  countdown: 3,            // seconds of 3-2-1 before GO
  rocketWindow: 0.4,       // boost pressed in the last 0.4 s before GO = rocket start
  perfectWindow: 0.18,
  finishTimeout: 14,       // seconds the race stays open after the human finishes
  maxClock: 900,           // hard stop (s) if the human never finishes
  overtakeHyst: 5,         // metres a rival must be ahead before places swap
  launchSpeedFrac: 0.72,   // GO launch speed as a fraction of cruise
  respawnStuckT: 3, respawnLostT: 2.5,
  draftRange: 85, draftCone: 0.14, draftTime: 1.6, // slipstream: metres behind, wake half-width grows 0.14 m per m behind, seconds to charge a slingshot
  cruiseRef: 100,          // fallback reference cruise (m/s)
  cruiseNorm: 0.4,         // how far AI cruise is pulled toward the human's craft (0 = raw stats, 1 = identical)
};

export const WEAPONS = {
  missile: { lockTime: 0.9, lockCone: 0.42, lockMin: 40, lockMax: 750, speed: 175, turn: 1.7, turnWeak: 1.0, turnDumb: 0.65, life: 7.5, armT: 0.35, hitPad: 3.0, barrelRange: 70, tumble: 1.5, loss: 0.4 },
  mine: { arm: 0.8, ownerGrace: 1.8, radius: 14, life: 45, tumble: 1.35, loss: 0.35 },
  emp: { radius: 240, stun: 1.5, loss: 0.2 },
  storm: { tumble: 1.3, loss: 0.4 },
  smoke: { radius: 55, life: 6.5 },
  shield: { time: 10 },
  turbo: { time: 2.2, power: 1.6 }, turbo3: { time: 1.6, power: 1.6 },
  drone: { life: 13, speedMul: 1.15, fireEvery: 0.38, range: 230 },
  cannon: { interval: 0.11, heatPerShot: 0.075, cool: 0.4, coolLocked: 0.28, resume: 0.4, speed: 260, life: 1.25, hitPad: 3.2, aimAssist: 0.35, aimCone: 0.14, stagger: 0.93, comboWindow: 2.5, comboHits: 5, comboTumble: 1.1 },
  invulnAfterHit: 1.6,
};
