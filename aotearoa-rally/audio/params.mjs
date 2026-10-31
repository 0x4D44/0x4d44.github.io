// Pure audio parameter mapping (no WebAudio, no DOM): unit-testable. Everything is bounded and NaN-safe.
import { clamp as clampRaw, clamp01 as clamp01Raw, lerp, smoothstep as smoothRaw } from "../core/mathx.mjs";

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
// NaN-safe versions: a bad number from the simulation must never reach a WebAudio parameter.
const clamp = (v, lo, hi) => clampRaw(fin(v, lo), lo, hi);
const clamp01 = (v) => clamp01Raw(fin(v));
const smoothstep = (a, b, v) => smoothRaw(a, b, fin(v, a));

/** Per-car engine character. Falls back to a generic turbo four. */
export const ENGINE_CHARACTER = {
  // cyl: firing pulses per 2 crank turns. res: three fixed exhaust-pipe resonances [Hz, Q, dB]. bright: harmonic roll-off (higher = brighter).
  // lope: depth of the once-per-crank-turn amplitude wobble (V8 lope, flat-four burble). pops: overrun-crackle readiness (0..1).
  // gate: how much of the sound is pulse-gated combustion noise. jitter: cycle-to-cycle timing/amplitude irregularity (0..1).
  // air: brightness of the engine's own noise and the low-pass floor (the car-to-car spread at the same rpm; 1 = reference).
  huia: { air: 0.97, cyl: 5, burble: 0.35, growl: 0.55, whine: 0.55, tone: 1.0, turboWhistle: 0.9, name: "inline-five turbo", res: [[180, 3.2, 7], [470, 2.4, 5], [1150, 2.0, 4]], bright: 0.85, lope: 0.14, pops: 0.7, gate: 0.7, jitter: 0.5 },
  kea: { air: 1.3, cyl: 4, burble: 0.5, growl: 0.4, whine: 0.7, tone: 1.15, turboWhistle: 0.8, name: "flat-four turbo burble", res: [[140, 3.0, 6], [330, 2.6, 5], [900, 2.4, 6]], bright: 0.95, lope: 0.3, pops: 0.9, gate: 1.45, jitter: 0.7 },
  takahe: { air: 1.6, cyl: 4, burble: 0.1, growl: 0.3, whine: 0.35, tone: 1.3, turboWhistle: 0, name: "high-revving four", res: [[260, 2.4, 4], [700, 2.8, 5], [2100, 2.2, 6]], bright: 1.15, lope: 0.04, pops: 0.35, gate: 1.6, jitter: 0.3 },
  piwakawaka: { air: 0.45, cyl: 8, burble: 0.45, growl: 0.85, whine: 0.3, tone: 0.8, turboWhistle: 0, name: "cross-plane V8 lope", res: [[95, 3.4, 8], [240, 2.6, 6], [620, 2.2, 5]], bright: 0.7, lope: 0.4, pops: 1.0, gate: 0.35, jitter: 0.8 },
  _default: { air: 1.0, cyl: 4, burble: 0.3, growl: 0.5, whine: 0.5, tone: 1.0, turboWhistle: 0.6, name: "four", res: [[200, 2.5, 5], [500, 2.5, 4], [1200, 2.0, 4]], bright: 0.9, lope: 0.1, pops: 0.5, gate: 0.8, jitter: 0.5 },
};
export function engineCharacter(spec) {
  const c = ENGINE_CHARACTER[spec && spec.id] || ENGINE_CHARACTER._default;
  const cyl = (spec && spec.engine && spec.engine.cylinders) || c.cyl;
  const turbo = !!(spec && spec.engine && spec.engine.turbo);
  return { ...c, cyl, turbo, turboWhistle: turbo ? Math.max(c.turboWhistle, 0.5) : 0 };
}

/** Normalised rpm 0..1 between idle and redline. */
export function rpmNorm(rpm, idle = 900, redline = 7500) {
  return clamp01((fin(rpm, idle) - idle) / Math.max(1, redline - idle));
}

/** Firing frequency (Hz) of a 4-stroke engine: cylinders/2 pulses per crank revolution. */
export function firingHz(rpm, cyl = 4) {
  return (Math.max(0, fin(rpm)) / 60) * (cyl / 2);
}

/** Load 0..1 from throttle, rpm position and boost. */
export function engineLoad(throttle, boost, rpmN) {
  return clamp01(fin(throttle) * (0.55 + 0.45 * clamp01(rpmN * 1.4)) + 0.25 * clamp01(boost) * fin(throttle));
}

/** The engine voice: gains and filter positions. Monotonic in load, bounded. */
export function engineVoice(rpm, throttle, boost, idle, redline, chr = ENGINE_CHARACTER._default) {
  const rn = rpmNorm(rpm, idle, redline);
  const th = clamp01(throttle);
  const load = engineLoad(th, boost, rn);
  const idleLevel = 1 - smoothstep(0, 0.25, rn);
  return {
    rn, load,
    fundHz: firingHz(rpm, chr.cyl),
    gain: clamp(0.13 + 0.09 * idleLevel + 0.13 * rn + 0.2 * load, 0, 0.5), // idle lift: standing, the engine must lead the ambience bed (equal level, 3 kHz bed vs 0.4-0.8 kHz engine)
    lowpass: clamp((chr.air || 1) ** 2 * 700 + (chr.air || 1) * (4200 * rn * chr.tone + 3400 * load), 400, 11000), // idle cutoff follows air^2: the cars must differ at idle too
    drive: clamp(0.8 + 3.2 * load * (0.6 + chr.growl), 0.5, 6),
    subGain: clamp(0.02 + 0.1 * chr.burble * (0.5 + 0.5 * idleLevel) + 0.03 * (1 - th), 0, 0.2), // half-order content stays well below the firing frequency
    noiseGain: clamp(0.004 + 0.07 * rn * (0.35 + 0.65 * th), 0, 0.2), // lower floor: idle must be harmonic, not broadband hiss
    noiseFreq: clamp(500 + 2500 * rn, 300, 4000),
  };
}

export function turboVoice(boost, throttle, rpmN, chr) {
  const b = clamp01(fin(boost));
  const k = chr && chr.turboWhistle ? chr.turboWhistle : 0;
  return {
    whistleHz: clamp(2400 + 7200 * b, 2000, 10000),
    whistleGain: clamp(k * 0.05 * smoothstep(0.08, 0.6, b) * (0.35 + 0.65 * clamp01(throttle)), 0, 0.08),
    whooshGain: clamp(k * 0.06 * b * clamp01(throttle), 0, 0.08),
  };
}

export function gearWhine(speedMs, gear, load, chr) {
  const sp = Math.abs(fin(speedMs));
  const g = Math.max(1, Math.abs(fin(gear, 1)));
  return {
    hz: clamp(180 + sp * 38 + g * 40, 150, 3200),
    gain: clamp(0.012 * (chr ? chr.whine : 0.5) * smoothstep(3, 30, sp) * (0.4 + 0.6 * clamp01(load)) * (1 + (gear < 0 ? 1.5 : 0)), 0, 0.03),
  };
}

/** Which engine/tyre/wind scale a camera mode gets. cockpit = muffled. */
export function viewMix(cameraMode) {
  switch (cameraMode) {
    case "bonnet": return { engine: 0.95, lowpass: 2300, tyre: 0.55, tyreLow: 1500, wind: 0.5, whine: 1.5, cockpit: 1, rain: 1 };
    case "bumper": return { engine: 1.15, lowpass: 5200, tyre: 1.1, tyreLow: 6000, wind: 1.3, whine: 0.8, cockpit: 0.25, rain: 0.2 };
    case "far": return { engine: 0.75, lowpass: 7500, tyre: 0.8, tyreLow: 7000, wind: 0.8, whine: 0.6, cockpit: 0, rain: 0 };
    case "cinematic": case "replay": return { engine: 0.85, lowpass: 8500, tyre: 0.9, tyreLow: 8000, wind: 0.8, whine: 0.7, cockpit: 0, rain: 0 };
    default: return { engine: 1, lowpass: 9500, tyre: 1, tyreLow: 9000, wind: 1, whine: 0.8, cockpit: 0, rain: 0.1 };
  }
}

/** Surface noise categories used by audio/surface.mjs. */
export const NOISE_CATS = ["gravel", "dirt", "tarmac", "mud", "snow", "water", "grass", "sand"];
export function noiseCategory(key) {
  switch (key) {
    case "gravel": case "dirt": case "tarmac": case "mud": case "snow": case "water": case "grass": case "sand": return key;
    default: return "gravel";
  }
}

/** Aggregate wheel states into per-category roll and slide intensities (0..1). Writes into `out`. */
export function tyreMix(wheels, speedMs, infoOf, out) {
  for (const k of NOISE_CATS) { out.roll[k] = 0; out.slide[k] = 0; }
  out.squeal = 0; out.skidMax = 0;
  const v = clamp01(Math.abs(fin(speedMs)) / 38);
  if (!wheels) return out;
  for (let i = 0; i < wheels.length; i++) {
    const w = wheels[i];
    if (!w) continue;
    const g = w.grounded === false ? 0 : 1;
    const cat = noiseCategory(infoOf(w.surf));
    const slip = clamp01(Math.max(Math.abs(fin(w.slipRatio)) * 0.9, Math.abs(fin(w.slipAngle)) * 3.2, fin(w.skid)));
    out.roll[cat] += (g * Math.pow(v, 0.85)) / 4; // silent when stopped
    out.slide[cat] += (g * slip * (0.25 + 0.75 * Math.sqrt(v + 0.05))) / 4;
    if (cat === "tarmac") out.squeal += (g * smoothstep(0.35, 0.9, slip) * clamp01(Math.abs(w.load || 4000) / 4000)) / 2;
    out.skidMax = Math.max(out.skidMax, slip * g);
  }
  for (const k of NOISE_CATS) { out.roll[k] = clamp01(out.roll[k]); out.slide[k] = clamp01(out.slide[k]); }
  out.squeal = clamp01(out.squeal);
  return out;
}

export function windVoice(speedMs, view) {
  const v = Math.abs(fin(speedMs));
  const x = clamp01(v / 70);
  return { gain: clamp(0.5 * x * x * (view ? view.wind : 1), 0, 0.5), freq: clamp(250 + v * 14, 200, 2200) };
}

/** Ambience mix from stage def. All levels 0..1. */
export function ambiencePlan(def) {
  const env = (def && def.environment) || {};
  const biome = (def && def.biome) || "pasture";
  const w = env.weather || { type: "clear", intensity: 0 };
  const wi = clamp01(w.intensity);
  const rain = w.type === "rain" ? 0.35 + 0.65 * wi : w.type === "storm" ? 0.6 + 0.4 * wi : 0;
  const night = env.timeOfDay !== undefined && (env.timeOfDay < 5.5 || env.timeOfDay > 20.5) ? 1 : 0;
  const dayish = 1 - night;
  const wet = w.type === "snow" ? 0 : 1;
  const calm = 1 - clamp01(fin(env.windStrength));
  const plan = {
    rain: clamp01(rain),
    wind: clamp01(0.15 + 0.7 * fin(env.windStrength)) * (biome === "alpine" || biome === "tussock" ? 1.2 : 1),
    birds: 0, insects: 0, surf: 0, stream: 0, roar: 0, steam: 0,
  };
  switch (biome) {
    case "pasture": plan.birds = 0.5 * dayish * (1 - rain); plan.insects = 0.45 * dayish * (rain ? 0 : 1) + 0.2 * night; break;
    case "redwood": plan.birds = 0.55 * dayish * (1 - rain * 0.7); plan.steam = 0.35; break;
    case "coast": plan.surf = 0.65; plan.birds = 0.35 * dayish * (1 - rain); plan.insects = 0.15 * dayish; break;
    case "tussock": plan.insects = 0.35 * dayish * (rain ? 0 : 1) * calm; plan.birds = 0.12 * dayish; break;
    case "alpine": plan.birds = 0.05; break;
    case "rainforest": plan.stream = 0.5; plan.roar = 0.3; plan.birds = 0.25 * dayish * (1 - rain); plan.insects = 0.3 * night; break;
    default: break;
  }
  for (const k of Object.keys(plan)) plan[k] = clamp01(plan[k]);
  return plan;
}

/** Impact sound recipe from an impact event. */
export function impactVoice(ev) {
  const s = clamp01(fin(ev && ev.strength, 0.3));
  const zone = ev && ev.zone;
  const pan = zone === "left" ? -0.7 : zone === "right" ? 0.7 : 0;
  const hard = ev && /rock|boulder|limestone|schist|post|pole|barrier|guard|car|bridge/.test(String(ev.kind || ""));
  return {
    pan,
    thudGain: clamp(0.25 + 0.7 * s, 0, 1),
    thudHz: lerp(120, 55, s),
    crunchGain: clamp((s - 0.1) * 0.8 * (hard ? 1.2 : 0.8), 0, 0.9),
    clang: hard || s > 0.7 ? clamp01(s - 0.2) : 0,
    glass: s > 0.55 ? clamp01((s - 0.5) * 1.6) : 0,
    dur: lerp(0.18, 0.6, s),
  };
}

/** Anti-lag crackle intensity (0..1) from throttle, rpm and boost state. */
export function crackleLevel(throttle, rpmN, boost, hasTurbo, pops = 0.5) {
  const lift = 1 - clamp01(fin(throttle) * 4);
  return clamp01(lift * smoothstep(0.3, 0.75, rpmN) * (hasTurbo ? 0.4 + 0.6 * clamp01(boost + 0.3) : 0.35 + 0.5 * clamp01(pops)));
}

export function volumesClean(v) {
  const d = { master: 1, engine: 1, effects: 1, voice: 1, ambience: 1 };
  if (v) for (const k of Object.keys(d)) if (Number.isFinite(v[k])) d[k] = clamp(v[k], 0, 1.5);
  return d;
}
