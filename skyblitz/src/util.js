// Small math / RNG helpers with no DOM or WebGL dependency (safe in node:test). Owner: lead.
export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => (b === a ? 0 : (x - a) / (b - a));
export const saturate = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smoothstep = (a, b, x) => { const t = saturate(invLerp(a, b, x)); return t * t * (3 - 2 * t); };
export const sign = (x) => (x < 0 ? -1 : 1);
/** Frame-rate independent exponential smoothing: damp(current, target, lambda, dt). lambda ~ 1/seconds-to-settle. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
/** Wrap an angle to (-PI, PI]. */
export const wrapPi = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
export const deg = (r) => (r * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;

/** mulberry32: tiny fast seeded PRNG returning floats in [0,1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded RNG used for ALL gameplay randomness (items, AI, spawns) so runs are reproducible. */
export class RNG {
  constructor(seed = 1) { this.seed = seed >>> 0; this.next = mulberry32(this.seed); }
  float() { return this.next(); }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }       // inclusive both ends
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  gauss() { let u = 0; for (let i = 0; i < 6; i++) u += this.next(); return (u - 3) / Math.sqrt(0.5); } // ~N(0,1)
  shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
  fork(salt = 0) { return new RNG((this.seed ^ (salt * 2654435761)) >>> 0); }
}

/** Format seconds as m:ss.mmm (or ss.mmm under a minute when short=true). */
export function fmtTime(sec, short = false) {
  if (sec == null || !isFinite(sec)) return '--:--.---';
  const m = Math.floor(sec / 60), s = sec - m * 60;
  const ss = s.toFixed(3).padStart(6, '0');
  return short && m === 0 ? ss : `${m}:${ss}`;
}
export function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
