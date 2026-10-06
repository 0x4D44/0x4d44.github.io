// Strategies that see ONLY what the real UI shows the player: per round, birds sent and birds arrived.
// (No capacity, no hawk/crowd split, no rival.) Shared by the tests and the tuning scripts.
export const constant = (k) => () => k;

// A thoughtful human: double while all arrive, ignore a stray loss, back off firmly on a big one,
// then creep up by one (two after a long calm) to see whether the Gap has widened.
export function sensible(opts = {}) {
  const back = opts.back ?? 0.7, strayFrac = opts.strayFrac ?? 0.2;
  let ss = true, calm = 0, strays = 0;
  return (run, last) => {
    if (!last) return 2;
    const lost = last.w - last.delivered, frac = lost / last.w;
    // A single missing bird proves little (any crowding loss takes at least two); treat it like a calm round.
    if (lost <= 1) {
      strays = 0; calm++;
      if (ss) return last.w * 2;
      if (calm >= 2) return last.w + Math.max(2, Math.round(last.w * 0.4));   // calm for a while: probe faster
      return last.w + 1;
    }
    calm = 0;
    if (frac <= strayFrac && lost <= 2) {            // probably a stray hawk: hold, but not forever
      strays++;
      if (strays >= 2) { ss = false; return Math.max(2, last.w - 1); }
      return last.w;
    }
    ss = false; strays = 0;
    // A big loss: what ARRIVED is the best evidence of what the Gap passes; go a little above it.
    if (frac > 0.4) return Math.max(2, Math.round(last.delivered * 1.3));
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
    else if (lost / last.w > 0.25) { ss = false; w = Math.max(2, Math.floor(last.w / 2)); }
    else { ss = false; w = last.w; }
    return w;
  };
}
