// Span of Control — pure game engine.
// No DOM, no storage, no Date/Math.random: everything flows from the seed so
// tests can replay runs deterministically. The UI owns presentation; content.js
// owns words; this file owns rules.

export const METER_KEYS = ["leadership", "team", "you"];
export const RECENT_WINDOW = 15;
export const WEEKS_PER_QUARTER = 12;
export const FINAL_QUARTER = 12;
export const HEADCOUNT_APEX = 40;
export const RITUAL_CYCLE = ["perf-review", "budget", "planning", "survey"];

// --- deterministic RNG (mulberry32 over an integer state kept on the run) ---
export function rand(state) {
  let t = (state.rngState = (state.rngState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function newGame(seed) {
  return {
    seed: seed | 0,
    rngState: seed | 0,
    weekCount: 0, // total choices made
    meters: { leadership: 55, team: 55, you: 60 },
    headcount: 4,
    flags: {},
    queue: [], // [{ cardId, dueWeek }]
    playedOnce: {},
    recent: [],
    pendingRitual: null,
    pendingCardId: null,
    unlocked: [], // homily ids unlocked this run
    ended: null, // ending id once the run is over
  };
}

export function weekOfQuarter(state) {
  return (state.weekCount % WEEKS_PER_QUARTER) + 1;
}

export function quarterOf(state) {
  return Math.floor(state.weekCount / WEEKS_PER_QUARTER) + 1;
}

// --- job title: a pure function of headcount (the thesis) + quarter flavour ---
const TITLE_LADDER = [
  [0, "Team Lead"],
  [3, "Manager"],
  [6, "Senior Manager"],
  [10, "Group Manager"],
  [15, "Head of Function"],
  [21, "Senior Head of Function"],
  [30, "Director (interim)"],
];
const TITLE_SUFFIXES = [
  "",
  "",
  ", Delivery",
  ", Platform",
  ", Horizontal Enablement",
  ", Cross-Functional Excellence",
  ", Transformation Readiness",
  ", Synergy Realisation",
  ", Strategic Initiatives (Interim)",
  ", Office of the Vision",
  ", Continuity of Meetings",
  ", The Committee",
];
export function titleFor(headcount, quarter) {
  let base = TITLE_LADDER[0][1];
  for (const [min, name] of TITLE_LADDER) if (headcount >= min) base = name;
  const idx = Math.max(0, Math.min(TITLE_SUFFIXES.length - 1, (quarter | 0) - 1));
  return base + TITLE_SUFFIXES[idx];
}

// --- card eligibility ---
export function isEligible(state, card) {
  const quarter = quarterOf(state);
  if (card.once && state.playedOnce[card.id]) return false;
  if (card.minQuarter && quarter < card.minQuarter) return false;
  if (card.maxQuarter && quarter > card.maxQuarter) return false;
  if (card.requiresFlags) for (const f of card.requiresFlags) if (!state.flags[f]) return false;
  if (card.forbidsFlags) for (const f of card.forbidsFlags) if (state.flags[f]) return false;
  return true;
}

export function eligibleCards(state, content) {
  const fresh = [];
  const stale = [];
  for (const card of content.CARDS) {
    if (card.kind === "ritual") continue; // rituals are forced, never drawn
    if (!isEligible(state, card)) continue;
    (state.recent.includes(card.id) ? stale : fresh).push(card);
  }
  // Prefer cards not seen recently; relax the window only if the pool is dry.
  return fresh.length ? fresh : stale;
}

function weightedPick(state, cards) {
  let total = 0;
  for (const c of cards) total += c.weight || 1;
  let roll = rand(state) * total;
  for (const c of cards) {
    roll -= c.weight || 1;
    if (roll <= 0) return c;
  }
  return cards[cards.length - 1];
}

function cardById(content, id) {
  return content.CARDS.find((c) => c.id === id) || null;
}

// Draw the next card: ritual first, then due follow-ups, then the weighted deck.
export function draw(state, content) {
  if (state.ended) return null;
  let card = null;
  if (state.pendingRitual) {
    const pool = content.CARDS.filter(
      (c) => c.kind === "ritual" && c.ritual === state.pendingRitual && isEligible(state, c)
    );
    if (pool.length) card = weightedPick(state, pool);
    state.pendingRitual = null;
  }
  if (!card) {
    const dueIdx = state.queue.findIndex((q) => q.dueWeek <= state.weekCount);
    if (dueIdx >= 0) {
      const [due] = state.queue.splice(dueIdx, 1);
      const c = cardById(content, due.cardId);
      if (c && isEligible(state, c)) card = c;
    }
  }
  if (!card) {
    const pool = eligibleCards(state, content);
    if (!pool.length) return null; // content bug; tests forbid this
    card = weightedPick(state, pool);
  }
  state.pendingCardId = card.id;
  return card;
}

function applyEffects(state, effects) {
  const deltas = { leadership: 0, team: 0, you: 0, headcount: 0 };
  if (!effects) return deltas;
  for (const key of METER_KEYS) {
    if (typeof effects[key] === "number") {
      deltas[key] = effects[key];
      state.meters[key] = Math.max(0, Math.min(100, state.meters[key] + effects[key]));
    }
  }
  if (typeof effects.headcount === "number") {
    deltas.headcount = effects.headcount;
    state.headcount = Math.max(0, state.headcount + effects.headcount);
  }
  return deltas;
}

function checkEnding(state) {
  const m = state.meters;
  if (m.leadership <= 0) return "managed-out";
  if (m.leadership >= 100) return "promoted";
  if (m.team <= 0) return "mass-resignation";
  if (m.team >= 100) return "cult";
  if (m.you <= 0) return "burnout";
  if (m.you >= 100) return "balance";
  if (state.headcount <= 0) return "role-eliminated";
  if (state.headcount >= HEADCOUNT_APEX) return "apex";
  if (quarterOf(state) > FINAL_QUARTER) return "long-service";
  return null;
}

export function reorgChance(headcount, quarter) {
  return Math.max(0, (headcount - 8) * 0.02) + quarter * 0.008;
}

// Resolve the pending card with 'left' or 'right'. Returns what the UI needs
// to narrate the aftermath; mutates state.
export function choose(state, content, side) {
  if (state.ended) return null;
  const card = cardById(content, state.pendingCardId);
  if (!card) return null;
  const choice = side === "left" ? card.left : card.right;

  const deltas = applyEffects(state, choice.effects);
  if (choice.setFlags) for (const f of choice.setFlags) state.flags[f] = true;
  if (choice.clearFlags) for (const f of choice.clearFlags) delete state.flags[f];
  if (choice.followup) {
    state.queue.push({
      cardId: choice.followup.card,
      dueWeek: state.weekCount + (choice.followup.delay || 1),
    });
  }

  let homilyId = null;
  if (choice.homily && !state.unlocked.includes(choice.homily)) {
    state.unlocked.push(choice.homily);
    homilyId = choice.homily;
  }

  if (card.once) state.playedOnce[card.id] = true;
  state.recent.push(card.id);
  if (state.recent.length > RECENT_WINDOW) state.recent.shift();
  state.pendingCardId = null;

  state.weekCount += 1;
  let reorgRolled = false;
  if (state.weekCount % WEEKS_PER_QUARTER === 0) {
    const quarter = quarterOf(state); // the quarter we are entering
    state.pendingRitual = RITUAL_CYCLE[(quarter - 1) % RITUAL_CYCLE.length];
    if (!state.flags.reorg_looms && rand(state) < reorgChance(state.headcount, quarter)) {
      state.flags.reorg_looms = true;
      reorgRolled = true;
    }
  }

  const ending = choice.ending || checkEnding(state);
  if (ending) state.ended = ending;

  return {
    deltas,
    quip: choice.quip || null,
    homilyId,
    ending: ending || null,
    reorgRolled,
    title: titleFor(state.headcount, quarterOf(state)),
  };
}
