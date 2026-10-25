// Shared engine simulation state: crank angle, speed, throttle, kinematics.
import { GEOM, TIMING, IDLE_RPM, VARIANTS, engineBhp, rpmFromThrottle } from "./data.js";

export const FIRING = [1, 5, 3, 6, 2, 4]; // per bank, cylinder numbers in firing sequence
export const BANK_OFFSET = [0, 60];       // bank B fires 60 crank-degrees after bank A

// Firing angle (degrees from engine datum) of cylinder c (1..6) in bank b (0|1).
export function fireAngle(b, c) {
  return FIRING.indexOf(c) * 120 + BANK_OFFSET[b];
}
// Crank-throw angle (degrees) for cylinder c in bank b.
export function throwAngle(b, c) {
  return ((fireAngle(b, c) % 360) + 360) % 360;
}
// The cylinder's cycle angle alpha (0..720): 0 = start of power stroke at TDC.
export function cycleAngle(theta, b, c) {
  return (((theta - fireAngle(b, c)) % 720) + 720) % 720;
}
export function strokeOf(alpha) {
  if (alpha < 180) return 0;      // power
  if (alpha < 360) return 1;      // exhaust
  if (alpha < 540) return 2;      // intake
  return 3;                       // compression
}
export const STROKE_NAME = ["Power", "Exhaust", "Intake", "Compression"];

function inWindow(a, s, e) {
  a = ((a % 720) + 720) % 720;
  return s <= e ? (a >= s && a < e) : (a >= s || a < e);
}
export function exhaustOpen(alpha) { return inWindow(alpha, TIMING.exhOpen, TIMING.exhClose); }
export function intakeOpen(alpha) { return inWindow(alpha, TIMING.inOpen, TIMING.inClose); }
export function injecting(alpha) {
  return inWindow(alpha, TIMING.injStart, (TIMING.injStart + TIMING.injDur) % 720);
}
// Valve lift 0..1 for a smooth cam-like lift profile.
function lift(alpha, s, e) {
  let a = ((alpha % 720) + 720) % 720;
  let len = ((e - s) % 720 + 720) % 720;
  let x = (((a - s) % 720) + 720) % 720;
  if (x >= len) return 0;
  const u = x / len;
  return Math.pow(Math.sin(Math.PI * u), 1.5);
}
export const exhaustLift = (alpha) => lift(alpha, TIMING.exhOpen, TIMING.exhClose);
export const intakeLift = (alpha) => lift(alpha, TIMING.inOpen, TIMING.inClose);

// Piston displacement below TDC, mm (0 at TDC, stroke at BDC), from crank angle phi (deg).
export function pistonDown(phiDeg) {
  const r = GEOM.stroke / 2, l = GEOM.rod;
  const p = (phiDeg * Math.PI) / 180;
  const x = r * Math.cos(p) + Math.sqrt(l * l - r * r * Math.sin(p) * Math.sin(p));
  return r + l - x;
}

// In-cylinder pressure (bar absolute) vs cycle angle alpha. Illustrative p-theta trace:
// polytropic compression from inlet closing, a Wiebe-type burn starting just before TDC
// (heat addition scales the polytrope), expansion, exhaust blow-down at exhaust opening.
const CR = 12.5, NPOLY = 1.37;
const volRel = (ang) => 1 / (CR - 1) + pistonDown(ang) / GEOM.stroke;
export function burnFraction(alpha) {
  // alpha in degrees after firing TDC; combustion from about -10 to +35 deg
  const a = alpha > 360 ? alpha - 720 : alpha;
  const s0 = -10, dur = 45, m = 1.0, A = 6.9;
  if (a < s0) return 0; if (a > s0 + dur) return 1;
  return 1 - Math.exp(-A * Math.pow((a - s0) / dur, m + 1));
}
export function cylinderPressureBar(alpha, load = 1, boost = 2.0) {
  const a = ((alpha % 720) + 720) % 720;
  const pc = boost * 0.98;
  const K = 0.15 + 1.05 * load; // peak/compression pressure rise from heat release
  const base = (ang) => pc * Math.pow(volRel(580) / volRel(ang), NPOLY);
  if (a >= 360 && a < 580) return pc;                     // intake (and early compression, valve still open)
  if (a >= 580) return base(a) * (1 + K * burnFraction(a)); // compression, ignition delay overlap
  const p = base(a) * (1 + K * burnFraction(a));          // power stroke
  if (a < TIMING.exhOpen) return p;
  const pExh = boost * 0.95;
  const pOpen = base(TIMING.exhOpen) * (1 + K);
  if (a < 360) { const u = (a - TIMING.exhOpen) / 45; return pExh + (pOpen - pExh) * Math.exp(-4 * u) * (u < 1.6 ? 1 : 0.2) ; }
  return pc;
}

// Engine state ------------------------------------------------------------
export class Engine {
  constructor() {
    this.variant = "Cd";
    this.running = false;
    this.cranking = false;
    this.theta = 0;      // crank angle, degrees (unbounded)
    this.rpm = 0;
    this.targetRpm = 0;
    this.throttle = 0;   // 0..1
    this.timeScale = 1;  // 1 = real time; <1 slow motion
    this.crankT = 0;
    this.t = 0;
  }
  get rated() { return VARIANTS[this.variant].rpm; }
  setVariant(v) { this.variant = v; }
  start() { if (!this.running) { this.cranking = true; this.crankT = 0; } }
  stop() { this.running = false; this.cranking = false; this.targetRpm = 0; }
  setThrottle(t) { this.throttle = Math.min(1, Math.max(0, t)); }
  get bhp() { return this.running ? engineBhp(this.rpm, this.variant) : 0; }
  get load() { return this.running ? Math.min(1, this.bhp / VARIANTS[this.variant].bhp) : 0; }
  get boost() { return 1 + (VARIANTS[this.variant].intercooled && this.variant !== "B" ? 0.85 : 1.1) * Math.pow(Math.max(0, (this.rpm - 350) / (this.rated - 350)), 1.5) * (this.running ? 1 : 0); }
  // Advance by dt real seconds.
  step(dt) {
    this.t += dt;
    if (this.cranking) {
      this.crankT += dt;
      // Main generator motors the engine up to ~100 rpm, then fuel is admitted.
      this.targetRpm = Math.min(110, 20 + this.crankT * 60);
      if (this.crankT > 3.2) { this.cranking = false; this.running = true; }
    } else if (this.running) {
      this.targetRpm = rpmFromThrottle(this.throttle, this.rated);
    } else this.targetRpm = 0;
    const tau = this.running ? (this.targetRpm > this.rpm ? 1.6 : 1.2) : (this.cranking ? 0.5 : 1.5);
    this.rpm += (this.targetRpm - this.rpm) * (1 - Math.exp(-dt / tau));
    if (this.rpm < 0.5 && !this.cranking && !this.running) this.rpm = 0;
    this.theta += this.rpm * 6 * dt * this.timeScale; // 6 deg per rpm-second
    if (this.theta > 1e7) this.theta -= 1e7 - (1e7 % 720);
  }
}
