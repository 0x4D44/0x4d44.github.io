// Shared constants for Apex Karts: roster, item defs, scoring. Imported by every module.
// Conventions (ALL modules): y is up; heading θ: forward=(sinθ,0,cosθ), right=(-cosθ,0,sinθ).
// Steering input +1 = turn right. Track lateral offset +ve = right of the centreline. Units: metres, seconds.

export const ROSTER = [
  { id: "ember",  name: "Ember",  color: 0xe63946, accent: 0xffd166, blurb: "Hot-headed all-rounder.",   stats: { speed: 0.60, accel: 0.60, handling: 0.60, weight: 0.50 } },
  { id: "marlin", name: "Marlin", color: 0x1d7ff0, accent: 0xffffff, blurb: "Smooth and precise.",       stats: { speed: 0.50, accel: 0.55, handling: 0.85, weight: 0.35 } },
  { id: "bruno",  name: "Bruno",  color: 0x7b4a1e, accent: 0xf4a261, blurb: "Heavy hitter, top speed.",  stats: { speed: 0.90, accel: 0.30, handling: 0.40, weight: 0.95 } },
  { id: "pixel",  name: "Pixel",  color: 0xb517e8, accent: 0x7cff6b, blurb: "Zippy, gets away fast.",    stats: { speed: 0.40, accel: 0.90, handling: 0.75, weight: 0.20 } },
  { id: "jade",   name: "Jade",   color: 0x1fa86b, accent: 0xf1faee, blurb: "Balanced drift queen.",     stats: { speed: 0.65, accel: 0.50, handling: 0.70, weight: 0.45 } },
  { id: "sol",    name: "Sol",    color: 0xffb703, accent: 0x222222, blurb: "Fast in a straight line.",  stats: { speed: 0.80, accel: 0.45, handling: 0.45, weight: 0.65 } },
  { id: "nova",   name: "Nova",   color: 0x2ec4b6, accent: 0xff006e, blurb: "Light, nimble, twitchy.",   stats: { speed: 0.45, accel: 0.75, handling: 0.90, weight: 0.15 } },
  { id: "onyx",   name: "Onyx",   color: 0x2b2d42, accent: 0xef233c, blurb: "Quiet menace.",             stats: { speed: 0.75, accel: 0.55, handling: 0.55, weight: 0.70 } },
];

// Item ids. `rarity` weights are by race-position band: [front(1-2), mid(3-5), back(6-8)]
export const ITEMS = {
  boost:  { id: "boost",  name: "Turbo",        icon: "🔥", weights: [30, 22, 10] },
  triple: { id: "triple", name: "Triple Turbo", icon: "🔥🔥🔥", weights: [0, 12, 22] },
  banana: { id: "banana", name: "Banana",       icon: "🍌", weights: [34, 18, 6] },
  green:  { id: "green",  name: "Bouncer",      icon: "🟢", weights: [24, 22, 12] },
  homing: { id: "homing", name: "Seeker",       icon: "🎯", weights: [0, 14, 28] },
  shield: { id: "shield", name: "Shield",       icon: "🛡️", weights: [12, 10, 8] },
  shock:  { id: "shock",  name: "Shockwave",    icon: "⚡", weights: [0, 2, 14] },
};
export const ITEM_IDS = Object.keys(ITEMS);

export const RACERS = 8;
export const POINTS = [15, 12, 10, 8, 6, 4, 2, 1];   // by finishing place, for Grand Prix
export const DIFFICULTIES = ["easy", "normal", "hard"];
export const LAP_OPTIONS = [1, 2, 3, 5];

// Input object produced by Controls (player) and AIDriver (bots), consumed by Kart.update
export function blankInput() {
  return { throttle: 0, brake: 0, steer: 0, drift: false, useItem: false, lookBack: false };
}

// Deterministic RNG (mulberry32)
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export function formatTime(s) {
  if (s == null || !isFinite(s)) return "--:--.---";
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${r < 10 ? "0" : ""}${r.toFixed(3)}`;
}
