// Seeded, forkable RNG (mulberry32). Everything procedural must draw from one of
// these so the world is identical on every load and in every test.
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

export class Rng {
  constructor(seed = 1) { this.s = (seed >>> 0) || 1; }
  next() {
    let t = (this.s += 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }          // inclusive
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  weighted(items, w = (x) => x.w ?? 1) {
    let t = 0; for (const it of items) t += w(it);
    let r = this.next() * t;
    for (const it of items) { r -= w(it); if (r <= 0) return it; }
    return items[items.length - 1];
  }
  shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
  gauss() { return (this.next() + this.next() + this.next() + this.next() - 2) / 0.5774; }
  /** Independent child stream: fork('building:12') is stable no matter how much the parent has drawn. */
  fork(label) { return new Rng((this.s ^ hashStr(String(label))) >>> 0); }
}

export const makeRng = (seed) => new Rng(seed);
