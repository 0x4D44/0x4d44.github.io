// Race progress: turns the raw course projection into an unwrapped, exploit-resistant race distance.
//
// Design: `dist` is ACCUMULATED from small per-step deltas of the projected arc length, never read off absolute s.
//   * a teleport / projection glitch (|delta| above a plausible per-step travel) is REJECTED, so you cannot gain distance by being moved;
//   * laps need `dist >= lap * L` AND every sector crossed in order (`nextSector`), so skipping sectors cannot complete a lap;
//   * shortcuts are fine because branch projections report main-path-equivalent s (jumps at branch transitions up to 0.35 L are accepted);
//   * going backwards lowers `dist` but never un-passes a sector/gate (pointers only advance), so there is nothing to farm.

const _wf = {};
const MAX_STEP = 150;     // metres of arc length accepted per fixed step: the nearest-point projection is ill-conditioned inside tight turns (an aircraft 90 m inside a 100 m radius corner legitimately jumps 80 m of s in one step); real teleports are 100s of metres

function wrapDelta(d, L) {
  if (d > L * 0.5) d -= L; else if (d < -L * 0.5) d += L;
  return d;
}

/** Hard (re)synchronise a racer with the course: used at spawn. dist = signed metres from the start line (negative on the grid). */
export function syncProgress(race, r) {
  const L = race.course.length, p = r.proj;
  race.course.project(r.flight.pos, null, p);
  r.lastS = p.s;
  const s = p.s > L * 0.5 ? p.s - L : p.s;
  r.s = p.s; r.dist = s; r.lateral = p.lateral; r.vertical = p.vertical; r.onBranch = p.branch ?? -1; r.lastBranch = r.onBranch;
  r.nextSector = 1; r.gateIdx = 0; r.ringIdx = 0; r.lap = 1;
  const gates = race.gates, rings = race.rings;
  while (r.gateIdx < gates.length && gates[r.gateIdx].s <= s) r.gateIdx++;
  while (r.ringIdx < rings.length && rings[r.ringIdx].s <= s) r.ringIdx++;
  r.lastGoodS = p.s; r.glitchT = 0; r.shortcut = -1; r.lastU = 0;
}

/** Re-anchor after a teleport / respawn WITHOUT changing dist, sectors or laps (so teleporting grants nothing). */
export function reanchor(race, r) {
  const p = r.proj;
  if (r.shortcut >= 0) race.shortcutExit(r, r.shortcut, false);
  race.course.project(r.flight.pos, null, p);
  r.lastS = p.s; r.s = p.s; r.lateral = p.lateral; r.vertical = p.vertical; r.onBranch = p.branch ?? -1; r.lastBranch = r.onBranch;
  r.glitchT = 0;
}

/**
 * One fixed step of progress tracking for racer r. Returns the accepted arc-length delta (m).
 * Handles gates, boost rings, sectors, laps and shortcuts via callbacks on `race`.
 */
export function stepProgress(race, r, dt) {
  const course = race.course, L = course.length, p = r.proj;
  course.project(r.flight.pos, r.lastS, p);
  let d = wrapDelta(p.s - r.lastS, L);
  const branch = p.branch ?? -1;
  const branchChange = branch !== r.lastBranch;
  const limit = branchChange ? L * 0.35 : MAX_STEP;
  if (Math.abs(d) > limit) {
    // projection glitch or teleport: ignore the sample; after 0.5 s of persistent disagreement re-anchor (no distance credit)
    r.glitchT += dt; race.stats.glitches++;
    if (r.glitchT > 0.5) { r.lastS = p.s; r.glitchT = 0; race.stats.relocks++; }
    d = 0;
  } else { r.glitchT = 0; r.lastS = p.s; }
  if (branchChange) r.lastBranch = branch;
  r.onBranch = branch;
  // shortcut bookkeeping: only counted once past the junction blend (u > 80 m), so skimming the mouth fires nothing
  const u = p.u ?? 0;
  if (branch >= 0 && r.shortcut < 0 && u > 80 && u < 220) race.shortcutEnter(r, branch);
  else if (r.shortcut >= 0 && branch !== r.shortcut) race.shortcutExit(r, r.shortcut, r.lastU > (course.branches[r.shortcut]?.length ?? 1e9) - 150);
  r.lastU = branch >= 0 ? u : 0;
  r.s = p.s; r.lateral = p.lateral; r.vertical = p.vertical;
  r.progSpeed += ((d / Math.max(dt, 1e-4)) - r.progSpeed) * Math.min(1, dt * 3);
  r.dist += d;
  if (race.state === 'done' || r.finished) return d;

  const lapStartDist = (r.lap - 1) * L, lapDist = r.dist - lapStartDist;
  // gates and boost rings (pointers only advance)
  const gates = race.gates, rings = race.rings;
  while (gates && r.gateIdx < gates.length && lapDist >= gates[r.gateIdx].s) race.passGate(r, gates[r.gateIdx++]);
  while (rings && r.ringIdx < rings.length && lapDist >= rings[r.ringIdx].s) race.passRing(r, rings[r.ringIdx++]);
  // sectors in order
  const secs = course.sectors;
  while (r.nextSector < secs.length && lapDist >= secs[r.nextSector]) { race.game.events.emit('sector:pass', { racer: r, sector: r.nextSector }); r.nextSector++; }
  // lap completion: the line is crossed AND every sector was passed in order (sectors are < L, so lapDist >= L implies all of them)
  if (r.nextSector >= secs.length && r.dist >= r.lap * L) {
    const frac = d > 0 ? Math.min(1, Math.max(0, (r.dist - r.lap * L) / d)) : 0;
    race.completeLap(r, race.clock - frac * dt);
  }
  return d;
}

/** Wrong-way detection from the smoothed progress speed; emits race:wrongway {racer,on} on change. */
export function updateWrongWay(race, r, dt) {
  let bad = r.progSpeed < -10 && r.flight.speed > 20 && !(r.tumble > 0) && r.sinceTumble > 1.2;
  if (bad) { race.course.frameAt(r.s, _wf); bad = r.flight.forward.dot(_wf.tangent) < 0.2; }       // really pointing the wrong way
  if (bad) { r.wrongT += dt; r.rightT = 0; } else { r.rightT += dt; if (r.progSpeed > 3) r.wrongT = 0; }
  if (!r.wrongWay && r.wrongT > 1.2) { r.wrongWay = true; race.game.events.emit('race:wrongway', { racer: r, on: true }); }
  else if (r.wrongWay && r.rightT > 0.6 && r.progSpeed > 3) { r.wrongWay = false; r.wrongT = 0; race.game.events.emit('race:wrongway', { racer: r, on: false }); }
}

export { MAX_STEP };
