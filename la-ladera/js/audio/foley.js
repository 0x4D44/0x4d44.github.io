// One-shot sounds, synthesised (owner: A1): footsteps per surface, landings, doors and shutters, UI ticks and chimes, the chapel bell, birds,
// dogs, horns. Each recipe is `(seed) -> Float32Array` (mono, SR Hz, starts and ends at exactly zero, peak <= its stated level) so it renders under
// Node in tests and the engine only wraps it in an AudioBuffer. Variants differ by seed, never by Math.random().
import { SR, rng, hashSeed, buf, clamp, lerp, whiteNoise, pinkNoise, bandpass, lowpass, highpass, sweepBandpass, addTo, normalize, fade, softclip, removeDC } from './dsp.js';

const TAU = Math.PI * 2;

// ---- footsteps ------------------------------------------------------------------------------------------------------------------------
export const SURFACES = ['asphalt', 'concrete', 'cobble', 'dirt', 'grass', 'stairs', 'tile', 'wood', 'carpet'];
//  body: low thump {f Hz, tau s, a}; noise: filtered burst {bp|lp|hp Hz, q, atk s, tau s, a}; grains: crunchy sparse impulses {rate /s, dur s, f Hz, a};
//  ring: modal resonances [{f, tau, a}]; click: bright tick {f, a}; echo: slap-back {ms, a}; level: peak of the finished sample (relative loudness)
// Bodies sit at 100-200 Hz and the noise carries most of the energy: laptop speakers and earbuds cannot reproduce a 60 Hz thump, so a step has to
// read through its scuff and its click (checked by tests/audio-library.test.mjs: no surface is mostly sub-150 Hz).
const STEP = {
  asphalt:  { len: 0.22, level: 0.62, body: { f: 110, tau: 0.045, a: 0.55 }, noise: { bp: 1400, q: 0.7, atk: 0.002, tau: 0.045, a: 2.2 }, click: { f: 2400, a: 0.30 } },
  concrete: { len: 0.22, level: 0.70, body: { f: 130, tau: 0.040, a: 0.45 }, noise: { bp: 1700, q: 0.6, atk: 0.001, tau: 0.032, a: 2.4 }, click: { f: 3200, a: 0.45 } },
  cobble:   { len: 0.24, level: 0.70, body: { f: 150, tau: 0.040, a: 0.40 }, noise: { bp: 2400, q: 1.4, atk: 0.001, tau: 0.050, a: 1.8 }, grains: { rate: 90, dur: 0.07, f: 3500, a: 0.5 }, click: { f: 4200, a: 0.55 } },
  dirt:     { len: 0.28, level: 0.52, body: { f: 95, tau: 0.055, a: 0.55 }, noise: { lp: 2400, atk: 0.004, tau: 0.090, a: 1.8 }, grains: { rate: 140, dur: 0.12, f: 1800, a: 0.45 } },
  grass:    { len: 0.30, level: 0.40, body: { f: 85, tau: 0.065, a: 0.30 }, noise: { bp: 2500, q: 0.5, atk: 0.015, tau: 0.110, a: 1.1 }, grains: { rate: 60, dur: 0.14, f: 5200, a: 0.20 } },
  stairs:   { len: 0.30, level: 0.72, body: { f: 160, tau: 0.040, a: 0.50 }, noise: { bp: 1500, q: 0.6, atk: 0.001, tau: 0.032, a: 2.2 }, click: { f: 3000, a: 0.50 }, echo: { ms: 28, a: 0.30 } },
  tile:     { len: 0.22, level: 0.72, body: { f: 170, tau: 0.032, a: 0.35 }, noise: { bp: 2800, q: 0.7, atk: 0.001, tau: 0.022, a: 1.8 }, ring: [{ f: 3100, tau: 0.030, a: 0.50 }, { f: 5200, tau: 0.015, a: 0.30 }], click: { f: 4800, a: 0.60 } },
  wood:     { len: 0.28, level: 0.68, body: { f: 190, tau: 0.045, a: 0.50 }, noise: { bp: 1000, q: 0.9, atk: 0.002, tau: 0.045, a: 2.0 }, ring: [{ f: 230, tau: 0.080, a: 0.9 }, { f: 410, tau: 0.060, a: 0.55 }, { f: 680, tau: 0.040, a: 0.30 }], click: { f: 2000, a: 0.60 } },
  carpet:   { len: 0.22, level: 0.30, body: { f: 100, tau: 0.055, a: 0.50 }, noise: { lp: 800, atk: 0.008, tau: 0.060, a: 1.4 } },
};

function stepFrom(p, r, scale = 1) {
  const sr = SR, n = Math.round(p.len * scale * sr), out = new Float32Array(n), jit = () => 1 + 0.08 * r.gauss();
  const b = p.body, f0 = b.f * jit() * (scale > 1 ? 0.8 : 1), tau = b.tau * jit() * (scale > 1 ? 1.8 : 1);
  for (let i = 0; i < n; i++) { const t = i / sr; out[i] += Math.sin(TAU * f0 * (1 - 0.3 * (1 - Math.exp(-t / tau))) * t) * Math.exp(-t / tau) * b.a * Math.min(1, scale); }
  const ns = p.noise;
  if (ns) {
    let x = whiteNoise(n, r);
    x = ns.bp ? bandpass(x, ns.bp * jit(), ns.q ?? 1) : ns.lp ? lowpass(x, ns.lp * jit()) : highpass(x, ns.hp * jit());
    for (let i = 0; i < n; i++) { const t = i / sr; out[i] += x[i] * Math.min(1, t / (ns.atk || 0.001)) * Math.exp(-t / (ns.tau * scale)) * ns.a; }
  }
  if (p.grains) {
    const g = p.grains, gl = Math.round(g.dur * scale * sr), tmp = new Float32Array(n);
    for (let i = 0; i < gl && i < n; i++) if (r() < g.rate / sr * 1.0) tmp[i] = (r() * 2 - 1) * Math.exp(-i / (gl * 0.6));
    bandpass(tmp, g.f * jit(), 1.8);
    for (let i = 0; i < n; i++) out[i] += tmp[i] * g.a * 6;
  }
  for (const m of p.ring ?? []) { const mf = m.f * jit(); for (let i = 0; i < n; i++) { const t = i / sr; out[i] += Math.sin(TAU * mf * t) * Math.exp(-t / m.tau) * m.a; } }
  if (p.click) {
    const c = new Float32Array(n); c[0] = 1; c[1] = -0.5;
    bandpass(c, p.click.f * jit(), 4);
    for (let i = 0; i < n; i++) out[i] += c[i] * p.click.a * 5;
  }
  if (p.echo) { const d = Math.round(p.echo.ms / 1000 * sr), e = lowpass(Float32Array.from(out), 2500); for (let i = d; i < n; i++) out[i] += e[i - d] * p.echo.a; }
  removeDC(out); fade(out, 0.8, 18); normalize(out, p.level);
  return out;
}

/** One footstep on `surface` (see SURFACES); `variant` picks the seed. */
export function footstep(surface, variant = 0) {
  const p = STEP[surface] ?? STEP.concrete;
  return stepFrom(p, rng(hashSeed('step:' + surface) + variant * 7919));
}

/** A landing: heavier and longer than a step, with the second foot arriving a beat later. */
export function landing(surface, variant = 0) {
  const p = STEP[surface] ?? STEP.concrete, r = rng(hashSeed('land:' + surface) + variant * 104729);
  const a = stepFrom(p, r, 1.6), second = stepFrom(p, r, 1.1), out = new Float32Array(Math.round(0.55 * SR));
  addTo(out, a, 0, 1); addTo(out, second, Math.round(0.07 * SR), 0.45);
  fade(out, 0.8, 30); normalize(out, Math.min(0.95, p.level * 1.25));
  return out;
}

/** Cloth rustle for jumps and crouching: a short soft swish. */
export function rustle(variant = 0) {
  const r = rng(hashSeed('rustle') + variant), n = Math.round(0.20 * SR), x = bandpass(whiteNoise(n, r), 1300, 0.7);
  for (let i = 0; i < n; i++) { const u = i / n; x[i] *= Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.2)), 2) * (0.7 + 0.3 * Math.sin(TAU * 11 * u)); }
  fade(x, 6, 30); return normalize(x, 0.30);
}

// ---- doors ------------------------------------------------------------------------------------------------------------------------------
function latch(out, at, r, g = 1) {
  const c = new Float32Array(Math.round(0.03 * SR)); c[0] = 1; c[2] = -0.7;
  bandpass(c, 1700 * (1 + 0.05 * r.gauss()), 5);
  addTo(out, c, at, 0.9 * g);
  const k = buf(0.04); for (let i = 0; i < k.length; i++) k[i] = Math.sin(TAU * 150 * i / SR) * Math.exp(-i / (0.012 * SR));
  addTo(out, k, at, 0.35 * g);
}
function creak(len, r) {
  const n = Math.round(len * SR), src = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = (70 + 40 * Math.sin(TAU * 2.3 * t + 1) + 25 * Math.sin(TAU * 5.1 * t)) * (1 + 0.15 * (r() - 0.5));
    ph += f / SR; if (ph >= 1) ph -= 1;
    src[i] = (ph < 0.1 ? 1 : -0.11) + 0.3 * (r() - 0.5);           // stick-slip: sharp pulses with a jittery floor
  }
  const x = sweepBandpass(src, (t) => 650 + 600 * Math.sin(Math.PI * t / len) + 120 * Math.sin(TAU * 7 * t), 5);
  for (let i = 0; i < n; i++) { const u = i / n; x[i] *= Math.pow(Math.sin(Math.PI * u), 0.8) * (0.75 + 0.25 * Math.sin(TAU * 9 * u + 2)); }
  return x;
}
function whoosh(len, r, f0 = 1500, f1 = 300) {
  const n = Math.round(len * SR), x = sweepBandpass(whiteNoise(n, r), (t) => lerp(f0, f1, t / len), 0.8);
  for (let i = 0; i < n; i++) x[i] *= Math.sin(Math.PI * i / n) ** 1.5;
  return x;
}
function thud(out, at, r, g = 1, f = 80) {
  const n = Math.round(0.28 * SR), k = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; k[i] = Math.sin(TAU * f * (1 - 0.25 * (1 - Math.exp(-t / 0.05))) * t) * Math.exp(-t / 0.075); }
  addTo(out, k, at, 0.9 * g);
  const nz = bandpass(whiteNoise(n, r), 520, 0.9); for (let i = 0; i < n; i++) nz[i] *= Math.exp(-i / (0.03 * SR));
  addTo(out, nz, at, 0.6 * g);
}

/** Wooden door opening: the latch gives, then the hinge complains. */
export function doorOpen(variant = 0) {
  const r = rng(hashSeed('doorOpen') + variant), out = buf(0.75);
  latch(out, 0, r, 0.9); addTo(out, creak(0.55 + 0.1 * r(), r), Math.round(0.04 * SR), 0.42); addTo(out, whoosh(0.3, r, 900, 400), Math.round(0.08 * SR), 0.12);
  fade(out, 0.5, 40); return normalize(out, 0.55);
}
/** Wooden door closing: a swish, the thud against the frame, the latch catching. */
export function doorClose(variant = 0) {
  const r = rng(hashSeed('doorClose') + variant), out = buf(0.8);
  addTo(out, whoosh(0.26, r, 1400, 350), 0, 0.28); thud(out, Math.round(0.22 * SR), r, 1); latch(out, Math.round(0.27 * SR), r, 0.7);
  addTo(out, creak(0.2, r), Math.round(0.02 * SR), 0.14);
  fade(out, 0.5, 40); return normalize(out, 0.7);
}
/** Metal shutter (persiana): slat ratchet with the clang at the start (opening) or the end (closing). */
export function shutter(opening = true, variant = 0) {
  const r = rng(hashSeed('shutter') + variant + (opening ? 0 : 99)), out = buf(1.2), n = Math.round(0.85 * SR);
  const roll = sweepBandpass(whiteNoise(n, r), (t) => 2000 + 500 * Math.sin(TAU * 3 * t), 1.4);
  for (let i = 0; i < n; i++) { const t = i / SR, slat = 0.35 + 0.65 * Math.max(0, Math.sin(TAU * 27 * t)) ** 3; roll[i] *= slat * Math.sin(Math.PI * i / n) ** 0.6; }
  const rumble = lowpass(whiteNoise(n, r), 220); for (let i = 0; i < n; i++) rumble[i] *= Math.sin(Math.PI * i / n);
  const at = opening ? Math.round(0.02 * SR) : Math.round(0.74 * SR);       // opening: the catch lets go, then the slats rattle up; closing: they rattle down and bang on the sill
  addTo(out, roll, opening ? Math.round(0.12 * SR) : 0, 0.5); addTo(out, rumble, opening ? Math.round(0.12 * SR) : 0, 0.5);
  const clang = buf(0.6); for (const [f, tau, a] of [[690, 0.26, 1], [1540, 0.18, 0.6], [2480, 0.11, 0.4], [3520, 0.07, 0.25]]) for (let i = 0; i < clang.length; i++) clang[i] += Math.sin(TAU * f * (1 + 0.01 * r()) * i / SR) * Math.exp(-i / (tau * SR)) * a;
  addTo(out, clang, at, 0.5); thud(out, at, r, 0.35, 110);
  fade(out, 0.5, 60); return normalize(out, 0.7);
}

// ---- UI ---------------------------------------------------------------------------------------------------------------------------------
export function tick() {
  const n = Math.round(0.07 * SR), x = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; x[i] = (Math.sin(TAU * 1250 * t) + 0.3 * Math.sin(TAU * 2500 * t)) * Math.exp(-t / 0.014); }
  fade(x, 0.5, 15); return normalize(x, 0.45);
}
/** Discovery chime: two soft bell notes (E5 then B5), inharmonic partials so it rings like glass rather than a beep. */
export function chime() {
  const out = buf(1.9);
  for (const [f0, at, g] of [[659.3, 0, 1], [987.8, 0.13, 0.8]]) {
    const note = buf(1.7);
    for (const [ratio, tau, a] of [[1, 0.9, 1], [2.76, 0.40, 0.45], [5.4, 0.18, 0.22], [0.5, 1.2, 0.25]]) for (let i = 0; i < note.length; i++) { const t = i / SR; note[i] += Math.sin(TAU * f0 * ratio * t) * Math.exp(-t / tau) * a * Math.min(1, t / 0.004); }
    addTo(out, note, Math.round(at * SR), g);
  }
  fade(out, 1, 120); return normalize(out, 0.6);
}
/** Paper / panel swish for the map, journal and menus. */
export function paper(variant = 0) {
  const r = rng(hashSeed('paper') + variant), n = Math.round(0.16 * SR), x = sweepBandpass(whiteNoise(n, r), (t) => 2600 + 1800 * t / 0.16, 0.7);
  for (let i = 0; i < n; i++) { const u = i / n; x[i] *= Math.sin(Math.PI * u) ** 2 * (0.6 + 0.4 * Math.sin(TAU * 17 * u)); }
  fade(x, 3, 30); return normalize(x, 0.32);
}

// ---- the chapel bell --------------------------------------------------------------------------------------------------------------------
/** One stroke of a small cast bell: strike transient plus inharmonic partials (hum, prime, tierce, quint, nominal ...) with slow beating pairs. */
export function bellStrike() {
  const n = Math.round(7 * SR), out = new Float32Array(n), f0 = 392;                                                      // G4: a small chapel bell
  const partials = [[0.5, 0.55, 5.0], [1.0, 1.0, 4.2], [1.183, 0.75, 3.2], [1.506, 0.6, 2.5], [2.0, 0.5, 1.9], [2.514, 0.25, 1.2], [2.662, 0.2, 1.0], [3.011, 0.12, 0.7], [4.166, 0.07, 0.45]];
  for (const [ratio, a, tau] of partials) {
    const f = f0 * ratio, beat = 0.35 + 0.1 * ratio;
    for (let i = 0; i < n; i++) {
      const t = i / SR, env = Math.exp(-t / tau) * Math.min(1, t / 0.003);
      out[i] += (Math.sin(TAU * f * t) + Math.sin(TAU * (f + beat) * t + 1.3)) * 0.5 * a * env;
    }
  }
  const r = rng(hashSeed('bell')), hit = bandpass(whiteNoise(Math.round(0.03 * SR), r), 2600, 1.5);
  for (let i = 0; i < hit.length; i++) hit[i] *= Math.exp(-i / (0.006 * SR));
  addTo(out, hit, 0, 0.5);
  fade(out, 0.5, 400); return normalize(out, 0.85);
}

// ---- birds, dogs, horns -----------------------------------------------------------------------------------------------------------------
function note(out, at, dur, f0, f1, o = {}) {
  const n = Math.round(dur * SR), vib = o.vib ?? 0, vr = o.vibRate ?? 30, h2 = o.h2 ?? 0.15; let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n, f = lerp(f0, f1, u ** (o.curve ?? 1)) * (1 + vib * Math.sin(TAU * vr * u * dur)), env = Math.sin(Math.PI * u) ** (o.shape ?? 0.7);
    ph += f / SR;
    const k = at + i; if (k >= 0 && k < out.length) out[k] += (Math.sin(TAU * ph) + h2 * Math.sin(TAU * 2 * ph)) * env * (o.a ?? 1);
  }
}
const BIRDS = [
  (o, r) => { for (let k = 0; k < 3; k++) note(o, Math.round(k * 0.16 * SR), 0.09, 3300 - k * 250, 2900 - k * 280, { vib: 0.01 }); },                   // tui-tui-tui
  (o, r) => { for (let k = 0; k < 12; k++) note(o, Math.round(k * 0.04 * SR), 0.026, 4300 - k * 40, 3900 - k * 40, { a: Math.sin(Math.PI * (k + 1) / 13) }); },    // trill
  (o, r) => { for (let k = 0; k < 2; k++) note(o, Math.round(k * 0.24 * SR), 0.17, 2900, 3600, { vib: 0.02, vibRate: 14 }); },                     // pii-pii
  (o, r) => { for (let k = 0; k < 6; k++) note(o, Math.round(k * 0.085 * SR), r.range(0.05, 0.09), r.range(2400, 4400), r.range(2400, 4400), { vib: 0.015 }); },    // warble
  (o, r) => { note(o, 0, 0.28, 470, 520, { vib: 0.012, vibRate: 7, h2: 0.05, shape: 1 }); note(o, Math.round(0.34 * SR), 0.46, 500, 560, { vib: 0.012, vibRate: 7, h2: 0.05, shape: 1 }); note(o, Math.round(0.9 * SR), 0.26, 480, 420, { vib: 0.012, vibRate: 7, h2: 0.05, shape: 1, a: 0.8 }); },  // dove
  (o, r) => { for (let k = 0; k < 4; k++) note(o, Math.round(k * 0.11 * SR), 0.03, 5200, 4700, { a: 0.9 - k * 0.1, h2: 0 }); },                  // chirps
];
export const BIRD_COUNT = BIRDS.length;
/** Play `x` back `rate` times as fast (linear interpolation): pitch and tempo move together, like a tape. */
function resample(x, rate) {
  const n = Math.max(2, Math.floor((x.length - 1) / rate)), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = i * rate, k = Math.floor(p), f = p - k; out[i] = x[k] * (1 - f) + (x[k + 1] ?? 0) * f; }
  return out;
}
/** One bird phrase (variant picks the species-like pattern, `take` the small random differences). */
export function bird(variant = 0, take = 0) {
  const r = rng(hashSeed('bird') + variant * 31 + take * 977), out = buf(1.4);
  BIRDS[variant % BIRDS.length](out, r);
  let last = out.length - 1; while (last > 0 && Math.abs(out[last]) < 1e-4) last--;
  let x = out.slice(0, Math.min(out.length, last + Math.round(0.02 * SR)));
  if (take > 0) x = resample(x, clamp(1 + 0.07 * r.gauss(), 0.88, 1.14));          // another bird of the same kind: a little higher or lower, a little quicker or slower
  fade(x, 1, 8); return normalize(x, variant % BIRDS.length === 4 ? 0.5 : 0.6);
}

/** A short run of dog barks (distant: gain and filtering are the engine's job). */
export function dogBarks(variant = 0) {
  const r = rng(hashSeed('dog') + variant * 13), out = buf(1.6), count = 2 + (variant % 2);
  let at = 0;
  for (let b = 0; b < count; b++) {
    const dur = r.range(0.20, 0.28), n = Math.round(dur * SR), src = new Float32Array(n); let ph = 0;
    const f0 = r.range(320, 430);
    for (let i = 0; i < n; i++) { const u = i / n; ph += f0 * (1 - 0.35 * u) / SR; if (ph >= 1) ph -= 1; src[i] = 2 * ph - 1 + 0.4 * (r() - 0.5); }
    const a = sweepBandpass(src, (t) => lerp(600, 480, t / dur), 4), c = sweepBandpass(src, (t) => lerp(1250, 1000, t / dur), 5);
    for (let i = 0; i < n; i++) { const u = i / n, env = Math.min(1, i / (0.006 * SR)) * Math.exp(-u * 3.2); out[at + i] += (a[i] + 0.6 * c[i]) * env; }
    at += Math.round(r.range(0.30, 0.42) * SR);
  }
  const x = out.slice(0, Math.min(out.length, at + Math.round(0.15 * SR)));
  fade(x, 2, 30); return normalize(x, 0.6);
}

/** Motorbike pip-pip (kind 0) or a car's two-tone horn (kind 1). */
export function horn(kind = 0) {
  const out = buf(kind ? 0.55 : 0.4);
  const tone = (at, dur, fs) => { const n = Math.round(dur * SR); for (let i = 0; i < n; i++) { let v = 0; for (const f of fs) v += Math.sign(Math.sin(TAU * f * i / SR)) * 0.5 + Math.sin(TAU * f * i / SR) * 0.5; out[at + i] += v * Math.min(1, i / 120) * Math.min(1, (n - i) / 200); } };
  if (kind) tone(0, 0.42, [392, 494]); else { tone(0, 0.09, [740]); tone(Math.round(0.16 * SR), 0.11, [740]); }
  const x = lowpass(out, 2400); fade(x, 1, 20); return normalize(softclip(x, 1.2), 0.5);
}
