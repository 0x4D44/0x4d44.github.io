// Strategies that see ONLY what the real UI shows the player: per round, birds sent and birds arrived.
// (No capacity, no hawk/crowd split, no rival.) Shared by the tests and the tuning scripts.
export const constant = (k) => () => k;

// A thoughtful human: double while all arrive, ignore a stray loss, back off firmly on a big one,
// then creep up by one (two after a long calm) to see whether the Gap has widened.
export function sensible(opts = {}) {
  const boost = opts.boost ?? 0.4;
  const back = opts.back ?? 0.7, strayFrac = opts.strayFrac ?? 0.3;
  let ss = true, calm = 0, strays = 0;
  return (run, last) => {
    if (!last) return 2;
    const lost = last.w - last.delivered, frac = lost / last.w;
    // A single missing bird proves little (any crowding loss takes at least two); treat it like a calm round.
    if (lost <= 1) {
      strays = 0; calm++;
      if (ss) return last.w * 2;
      if (calm >= 2) return last.w + Math.max(2, Math.round(last.w * boost));   // calm for a while: probe faster
      return last.w + 1;
    }
    const hawks = run.level.p > 0;      // the level text mentions hawks, or it does not
    if (hawks && frac <= strayFrac) {   // a few birds missing: probably hawks. Keep going, gently.
      calm = 0; strays++;
      return ss ? Math.ceil(last.w * 1.5) : last.w + 1;
    }
    calm = 0;
    ss = false; strays = 0;
    // A big loss: what ARRIVED is the best evidence of what the Gap passes; go a little above it.
    if (frac > 0.4) return Math.max(2, Math.min(Math.round(last.delivered * 1.1), Math.floor(last.w * back)));
    return Math.max(2, Math.floor(last.w * back));
  };
}

// Plain "+1 every round" (additive increase with no decrease at all)
export const plusOne = () => { let w = 1; return (run, last) => (last ? ++w : w); };

// AIMD that tolerates stray loss: halve only if more than a quarter of the flock is lost, else just stop growing.
export function aimd() {
  let w = 1, ss = true;
  return (run, last) => {
    if (!last) return w;
    const lost = last.w - last.delivered;
    if (lost <= 1) { w = ss ? last.w * 2 : last.w + 1; }
    else if (lost / last.w > 0.25 || run.level.p === 0) { ss = false; w = Math.max(2, Math.floor(last.w / 2)); }
    else { ss = false; w = last.w; }
    return w;
  };
}

// "AIMD-style, modern flavour" (think CUBIC): halve on real congestion, ignore stray loss, but grow in
// ever-bigger steps after each calm round, so a freed-up Gap is reclaimed quickly.
export function cubicish() {
  let ss = true, grow = 0;
  return (run, last) => {
    if (!last) return 2;
    const lost = last.w - last.delivered, frac = lost / last.w;
    if (lost <= 1 || (run.level.p > 0 && frac <= 0.3)) { grow++; return ss ? last.w * 2 : last.w + grow; }
    ss = false; grow = 0;
    return Math.max(2, Math.min(Math.floor(last.w / 2), Math.round(last.delivered * 1.5)));
  };
}

// A courteous version of the above for shared skies: it grows in smaller steps, so it does not barge.
export const polite = () => sensible({ boost: 0.12 });

// Open-loop ramp: never reads a single result. w = min(cap, start + step * (round - 1)).
export const ramp = (start, step, cap) => (run) => Math.min(cap, start + step * run.round);
export function* allRamps() { for (let start = 1; start <= 12; start++) for (const step of [0, 1, 2, 3]) for (let cap = 6; cap <= 24; cap += 2) if (step || cap === start + 0) yield { start, step, cap }; }

// Open-loop ramp with ONE token cut: after the first round in which any bird is lost it flies one bird fewer,
// then carries on ramping. (A gaming attempt: it technically "flew fewer birds after a loss".)
export function tokenRamp(start, step, cap, cut = 1) {
  let base = null, done = false;
  return (run, last) => {
    if (base === null) base = start;
    if (last && last.lost > 0 && !done) { done = true; base = Math.max(1, last.requested - cut) - step; }
    base += last ? step : 0;
    return Math.max(1, Math.min(cap, base));
  };
}
export function* allTokenRamps() { for (let start = 1; start <= 12; start++) for (const step of [0, 1, 2, 3]) for (let cap = 6; cap <= 24; cap += 3) for (const cut of [1, 3]) yield { start, step, cap, cut }; }

// Additive increase, additive decrease (+1 / -2): adapts, but not multiplicatively.
export function aiad() {
  let w = 1, ss = true;
  return (run, last) => {
    if (!last) return w;
    const lost = last.w - last.delivered;
    if (lost <= 1) w = ss ? last.w * 2 : last.w + 1;
    else { ss = false; w = Math.max(1, last.w - 2); }
    return w;
  };
}
// Multiplicative increase, multiplicative decrease (x1.5 up, x0.7 down).
export function mimd() {
  let w = 2;
  return (run, last) => {
    if (!last) return w;
    const lost = last.w - last.delivered;
    w = lost <= 1 ? Math.ceil(last.w * 1.5) : Math.max(1, Math.floor(last.w * 0.7));
    return Math.min(24, w);
  };
}
