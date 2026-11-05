// The Glasgow Subway fleet as a roster: individually numbered units shared by the two circles.
//
// Real fleet (research/train-numbering.md): the third-generation Stadler METRO trains (in service since
// 11 Dec 2023) are 17 four-car units, numbered 301-317; each car carries its unit number and a car letter
// (301A, 301B, 301C, 301D ... 317D). The old Metro-Cammell cars were numbered one by one (101-133 motor
// cars, 201-208 trailers) and were not formed into numbered units - the Stadler units are, so the sim,
// which shows the Stadler train, numbers units.
//
// Model: one pool of 17 units. In full service six units run each circle (research/NOTES.md), the rest
// are spare in the depot; a unit stays on its circle for the whole session and is the same train every
// lap. Each circle is a ring: a lap takes the time a real simulated train needs (measureCycle runs the
// real Service round the real track once), and the units on it are evenly spaced round it. Everything a
// platform board or the HUD wants to say about a train is then a pure function of the clock, so a
// countdown can only fall (it never steps up when a train leaves), and the same unit is back at a
// station exactly one lap after it left.
//
// Pure logic: no THREE, no DOM (unit-tested under node).

export const FLEET_FIRST = 301;
export const FLEET_SIZE = 17;
export const CAR_LETTERS = ['A', 'B', 'C', 'D'];
export const IN_SERVICE = 6;   // units per circle in full service

export const unitIds = () => Array.from({ length: FLEET_SIZE }, (_, i) => FLEET_FIRST + i);
export const carIds = (unit) => CAR_LETTERS.map((l) => `${unit}${l}`);
/** '305B' -> 305 (and 305 -> 305) */
export const unitOfCar = (id) => parseInt(String(id), 10);
export const isUnit = (n) => Number.isInteger(n) && n >= FLEET_FIRST && n < FLEET_FIRST + FLEET_SIZE;

/** small deterministic PRNG (mulberry32) so a seed always gives the same roster */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mod = (a, n) => ((a % n) + n) % n;

/**
 * Run one fresh ATO service round its circuit twice and record the second lap: the first lap starts from a
 * train placed exactly on its berth and runs a few seconds quicker than every lap after it, so the steady
 * state (what a train that has been running all day does) is what the roster must be built from.
 * `svc` must be a new Service standing at stop 0 (startIdx 0), ATO and auto doors on, and it is used up.
 * Times are lap time: 0 = the train has just stopped at stop 0.
 * @returns {{arr:number[], dep:number[], period:number, lead:number}} arr[j]/dep[j]: when the train stops at / leaves
 *   stop j; period: one lap (s); lead: how long a fresh service takes to reach lap time 0 (see advanceToLap)
 */
export function measureCycle(svc, { dt = 0.05, maxSteps = 800000 } = {}) {
  const n = svc.track.stops.length, arr = new Array(n).fill(null), dep = new Array(n).fill(null), t0 = svc.t;
  let lead = null, period = null;
  svc.on((type, d) => {
    if (!d || typeof d.idx !== 'number') return;
    const t = svc.t - t0;
    if (type === 'arrive') {
      if (d.idx === 0) { if (lead == null) lead = t; else if (period == null) period = t - lead; }
      else if (lead != null && period == null && arr[d.idx] == null) arr[d.idx] = t - lead;
    } else if (type === 'depart' && lead != null && period == null && dep[d.idx] == null) dep[d.idx] = t - lead;
  });
  arr[0] = 0;
  for (let k = 0; k < maxSteps && period == null; k++) svc.update(dt);
  if (period == null || arr.some((x) => x == null) || dep.some((x) => x == null)) throw new Error('measureCycle: the service did not complete two laps');
  return { arr, dep, period, lead };
}

/** Bring a fresh Service (standing at stop 0) to where a unit that has been running all day is `tau` seconds into its lap. */
export function advanceToLap(svc, cycle, tau, dt = 0.1) {
  const total = cycle.lead + mod(tau, cycle.period), n = Math.max(1, Math.ceil(total / dt)), h = total / n;
  for (let i = 0; i < n; i++) svc.update(h);
  return svc;
}

/** the units one circle runs, evenly spaced round its ring */
export class Ring {
  /**
   * @param {string} line 'outer' | 'inner'
   * @param {{arr:number[],dep:number[],period:number}} cycle
   * @param {number[]} units unit numbers, in running order (each one 1/n of a lap behind the one before)
   * @param {number} phase0 clock time at which units[0] stops at stop 0
   */
  constructor(line, cycle, units, phase0 = 0) {
    this.line = line; this.arr = cycle.arr.slice(); this.dep = cycle.dep.slice(); this.period = cycle.period;
    this.stops = cycle.arr.length; this.units = units.slice();
    this.phase = new Map(); units.forEach((u, i) => this.phase.set(u, phase0 + i * cycle.period / units.length));
  }
  get headway() { return this.period / Math.max(1, this.units.length); }
  /** seconds since the unit last stopped at stop 0 (0..period) */
  lapTime(unit, now) { return mod(now - this.phase.get(unit), this.period); }
  /** the unit's next visit to stop j that has not finished at `now`: {at, dep, eta, inStation} (eta 0 while it is standing there) */
  visit(unit, j, now) {
    const a0 = this.phase.get(unit) + this.arr[j], dw = this.dep[j] - this.arr[j], P = this.period;
    const k = Math.ceil((now - a0 - dw) / P), at = a0 + k * P;   // first visit whose doors-closed time (at + dw) is after now
    const inStation = at <= now;
    return { unit, stop: j, at, dep: at + dw, eta: inStation ? 0 : at - now, inStation, line: this.line };
  }
  /** upcoming visits to stop j, soonest first (a train standing there now comes first) */
  upcoming(j, now, count = 3) {
    const v = this.units.map((u) => this.visit(u, j, now)).sort((a, b) => a.at - b.at);
    return v.slice(0, count);
  }
  /** the next train to reach stop j that is not yet in it (the one a waiting passenger is waiting for) */
  nextArriving(j, now) { return this.upcoming(j, now, this.units.length).find((v) => !v.inStation) || null; }
  /** where the unit is: the stop it last left/stands in, and whether it is standing */
  where(unit, now) {
    const tau = this.lapTime(unit, now); let j = 0;
    for (let i = 0; i < this.stops; i++) if (this.arr[i] <= tau) j = i;
    return { stop: j, standing: tau < this.dep[j], tau };
  }
  /**
   * The unit really stopped at (kind 'arrive') or left (kind 'depart') stop j at clock time t: pin its place on
   * the ring to that. The whole ring slips by the same amount (a late train delays the service behind it, and
   * the spacing between units is kept), so the roster never has two trains on top of each other.
   * @returns {number} how far the ring moved (s)
   */
  anchor(unit, j, t, kind = 'arrive') {
    const want = t - (kind === 'depart' ? this.dep[j] : this.arr[j]), cur = this.phase.get(unit);
    let d = mod(want - cur + this.period / 2, this.period) - this.period / 2;   // shortest way round
    if (Math.abs(d) < 1e-9) return 0;
    for (const u of this.units) this.phase.set(u, this.phase.get(u) + d);
    return d;
  }
  /** move the ring so that the next arrival at stop j (that has not started yet) is `eta` seconds away */
  alignNext(j, now, eta) {
    const nx = this.nextArriving(j, now); if (!nx) return 0;
    const d = eta - nx.eta; for (const u of this.units) this.phase.set(u, this.phase.get(u) + d); return d;
  }
}

/** the whole fleet: the pool of units, which circle each runs, the clock */
export class Fleet {
  /**
   * @param {{outer:object, inner:object}} cycles measured cycles per circle (measureCycle)
   * @param {{seed?:number, inService?:number, now?:number}} [opts]
   */
  constructor(cycles, { seed = 2023, inService = IN_SERVICE, now = 0 } = {}) {
    this.clock = now; this.seed = seed; this.cycles = cycles;
    const r = rng(seed), pool = unitIds();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    this.inService = inService;
    this.lineOf = new Map();
    const take = (line) => { const u = pool.splice(0, inService); u.forEach((x) => this.lineOf.set(x, line)); return u; };
    this.rings = {};
    for (const line of ['outer', 'inner']) this.rings[line] = new Ring(line, cycles[line], take(line), now - r() * cycles[line].period);
    this.spare = pool.slice().sort((a, b) => a - b); this.spare.forEach((x) => this.lineOf.set(x, 'depot'));
  }
  advance(dt) { this.clock += dt; }
  ring(line) { return this.rings[line]; }
  /** which circle a unit runs: 'outer' | 'inner' | 'depot' (spare) */
  lineOfUnit(unit) { return this.lineOf.get(unit) || null; }
  /** upcoming visits at stop j of a circle, soonest first (see Ring.upcoming) */
  upcoming(line, j, count = 3) { return this.rings[line].upcoming(j, this.clock, count); }
  nextArriving(line, j) { return this.rings[line].nextArriving(j, this.clock); }
  /** a real train stopped at / left stop j of its circle: keep the roster in step with it */
  anchor(line, unit, j, kind = 'arrive', t = this.clock) { return this.rings[line].anchor(unit, j, t, kind); }
  /** the unit standing in (or next arriving at) stop j of a circle */
  unitAt(line, j) { const u = this.rings[line].upcoming(j, this.clock, 1)[0]; return u ? u.unit : null; }
  /** the first `n` units of every circle, for display */
  roster() { return { outer: this.rings.outer.units.slice(), inner: this.rings.inner.units.slice(), spare: this.spare.slice() }; }
}
