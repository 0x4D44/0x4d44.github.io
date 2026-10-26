// Train longitudinal dynamics (pure). Position s = FRONT of train (unwrapped chainage, metres).
import { G, KMH, clamp } from './util.js';

export const DEFAULT_STOCK = {
  cars: 2, lengthM: 39, tareT: 54, capacity: 240, maxKmh: 55, accel: 1.0, decel: 1.0, emergencyDecel: 1.35, kneeKmh: 28,
};

/** Build stock params from subway.json rollingStock.current (tolerant of missing fields). */
export function stockFrom(rs) {
  const p = Object.assign({}, DEFAULT_STOCK);
  const c = rs && (rs.current || rs);
  if (c) {
    const num = (v) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : null);
    p.cars = num(c.cars) || p.cars;
    p.lengthM = num(c.length_m) || num(c.lengthM) || p.lengthM;
    p.tareT = num(c.mass_t) || num(c.massT) || p.tareT;
    p.capacity = num(c.capacity) || (c.capacity && num(c.capacity.total)) || p.capacity;
    p.maxKmh = Math.min(70, num(c.max_speed_kmh) || p.maxKmh);
    const a = num(c.accel) || num(c.accel_ms2); if (a && a < 2) p.accel = a;
    const d = num(c.decel) || num(c.decel_ms2) || num(c.decel_service_ms2); if (d && d < 2) p.decel = d;
    p.emergencyDecel = num(c.decel_emergency_ms2) || Math.max(p.decel * 1.3, 1.2);
  }
  return p;
}

// Lever notches (-3..3). Service brake fraction & power fraction per notch.
export const NOTCH_POWER = [0, 0.34, 0.67, 1];
export const NOTCH_BRAKE = [0, 0.3, 0.62, 1];
export const NOTCH_NAMES = { '-3': 'B3', '-2': 'B2', '-1': 'B1', '0': 'COAST', '1': 'P1', '2': 'P2', '3': 'P3' };
export const notchToCmd = (n) => (n >= 0 ? NOTCH_POWER[Math.min(3, n)] : -NOTCH_BRAKE[Math.min(3, -n)]);

export class Train {
  constructor(stock = DEFAULT_STOCK, opts = {}) {
    this.stock = stock;
    this.s = 0; this.v = 0; this.a = 0; this.dir = 1; // dir: +1 forward, -1 reverse shunt
    this.paxMassKg = 0;
    this.tractionAct = 0; this.brakeAct = 0; // 0..1 actual (lagged)
    this.ebLatched = false; this.ebDemand = false;
    this.holding = true;      // park/holding brake
    this.tractionCut = false; // door interlock / trip
    this.lagApply = opts.lagApply ?? 0.6; this.lagRelease = opts.lagRelease ?? 0.9; this.lagTraction = opts.lagTraction ?? 0.35;
    this.jerk = 0; this.cmd = 0;
    this._lastA = 0;
  }
  get massKg() { return this.stock.tareT * 1000 + this.paxMassKg; }
  get length() { return this.stock.lengthM; }
  get rear() { return this.s - this.stock.lengthM; }
  get brakePressureBar() { return clamp(this.brakeAct, 0, 1.4) * 3.8 + 0.0; }
  /** max tractive acceleration available at speed v (m/s2) at current mass */
  tractiveAccel(v) {
    const st = this.stock, m = this.massKg;
    const F0 = st.tareT * 1000 * st.accel * 1.06; // N at rest (rated against tare mass)
    const knee = st.kneeKmh * KMH;
    const F = v <= knee ? F0 : F0 * knee / v;
    return F / m;
  }
  brakeAccel() { return this.stock.decel; }
  /** resistance deceleration (m/s2, positive slows) at speed v for curvature k */
  resistance(v, k = 0) {
    const a0 = 0.0035 * G;                // rolling/bearing (higher in a small bore)
    const aero = 2.6 * v * v / this.massKg * 1.0 + 0.0006 * v * G;
    const curve = G * 0.0045 * clamp(Math.abs(k) * 100, 0, 3) * 0.5;
    return a0 + aero + curve + (v > 0.01 ? 0 : 0);
  }
  /**
   * cmd: -1..1 (negative = service brake fraction, positive = power fraction). eb: emergency demand.
   * env: { grade (dy/ds, positive uphill in direction of travel at +dir handled here), curvature }
   */
  step(dt, cmd, eb, env = {}) {
    const st = this.stock, g = (env.grade || 0), k = env.curvature || 0;
    if (eb) { this.ebLatched = true; }
    if (this.ebLatched && this.v < 0.02 && !eb) this.ebLatched = false;
    let wantP = cmd > 0 ? cmd : 0, wantB = cmd < 0 ? -cmd : 0;
    if (this.tractionCut) wantP = 0;
    if (this.ebLatched) { wantP = 0; wantB = 1.5; }
    // lag
    const tauT = this.lagTraction;
    this.tractionAct += (wantP - this.tractionAct) * clamp(dt / tauT, 0, 1);
    if (wantP === 0 && this.tractionAct < 0.01) this.tractionAct = 0;
    const tauB = wantB > this.brakeAct ? this.lagApply : this.lagRelease;
    this.brakeAct += (wantB - this.brakeAct) * clamp(dt / tauB, 0, 1);
    if (wantB === 0 && this.brakeAct < 0.01) this.brakeAct = 0;
    const v = this.v;
    const dirv = this.dir;
    // accelerations along direction of travel
    let a = 0;
    a += this.tractionAct * this.tractiveAccel(v);
    const bdec = this.ebLatched ? st.emergencyDecel : st.decel;
    const brakeA = this.brakeAct * (this.ebLatched ? st.emergencyDecel : st.decel) * (this.brakeAct > 1 ? 1 : 1);
    a -= Math.min(brakeA, this.brakeAct * st.emergencyDecel);
    a -= G * g * dirv; // uphill (positive grade in travel dir) slows
    // resistance & holding
    const res = this.resistance(v, k);
    if (v > 0.001) a -= res;
    let vNew = v + a * dt;
    if (vNew < 0) vNew = 0;
    // holding brake: when stopped, no power and not enough traction to climb grade -> stay put
    if (v < 0.03 && ((this.holding && cmd <= 0) || wantB > 0.05 || this.ebLatched) && !(wantP > 0.05)) vNew = 0;
    const vmax = (this.dir < 0 ? 8 * KMH : st.maxKmh * 1.15 * KMH);
    if (vNew > vmax) vNew = vmax;
    const aAct = (vNew - v) / (dt || 1);
    this.jerk = (aAct - this._lastA) / (dt || 1); this._lastA = aAct;
    this.a = aAct;
    this.s += (v + vNew) * 0.5 * dt * dirv;
    this.v = vNew;
    this.cmd = cmd;
    return this;
  }
}
