// One-shot sounds, synthesised (owner: A1): footsteps per surface, landings, doors and shutters, UI ticks and chimes, the chapel bell, birds,
// dogs, horns. Each recipe is `(seed) -> Float32Array` (mono, SR Hz, starts and ends at exactly zero, peak <= its stated level) so it renders under
// Node in tests and the engine only wraps it in an AudioBuffer. Variants differ by seed, never by Math.random().
import { SR, rng, hashSeed, buf, clamp, lerp, whiteNoise, pinkNoise, bandpass, lowpass, highpass, sweepBandpass, addTo, normalize, fade, softclip, removeDC } from './dsp.js';

const TAU = Math.PI * 2;

// ---- footsteps ------------------------------------------------------------------------------------------------------------------------
// (the last five are the beach's, engine/surface.js COAST_KIND: dry sand, wet sand, an ankle of water, a knee of water, the hollow planks of the pier and the raft)
export const SURFACES = ['asphalt', 'concrete', 'cobble', 'dirt', 'grass', 'stairs', 'tile', 'wood', 'carpet', 'sand', 'wetsand', 'shallow', 'wade', 'jetty'];
// A step is two contacts of a shoe: the HEEL lands (a dull thump and a scuff of broadband noise that swells over a few ms and is gone in tens), then the BALL of the foot settles
// 60-90 ms later, softer and a little higher. Nothing in it rings above 1.5 kHz: a shoe on concrete has no resonance, and a narrow ring, a bright tick or a 1 ms attack is what a
// tin sounds like (R2c: "my footsteps sound like someone hitting a tin"). So there is no click and no ring, the scuff swells over 3-6 ms instead of snapping, and the whole step
// is low-passed (STEP_LOWPASS). How LOUD a step is, is the engine's FOOT_GAIN times this sample: every `level` below is that sample's peak, and the library test wants one-shots
// at 0.25 or more, so the quiet is made by the gain. The levels keep the old balance between surfaces (wood loud, carpet soft): each surface's RMS times FOOT_GAIN is 9.5 dB
// under what it was (tests/audio-steps.test.mjs holds the old figures).
//  body: low thump {f Hz, tau s, a}; noise: filtered scuff {bp|lp|hp Hz, q, atk s, tau s, a}; grains: sparse crackle {rate /s, dur s, f Hz, a};
//  knock: the hollow of a board {f Hz, tau s, a}; echo: slap-back {ms, a}; level: peak of the finished sample.
// Bodies sit at 100-200 Hz and the noise carries most of the energy: laptop speakers and earbuds cannot reproduce a 60 Hz thump, so a step has to read through its scuff
// (tests/audio-library.test.mjs: no surface is mostly sub-150 Hz; tests/audio-steps.test.mjs: nothing rings, nothing is above 4 kHz, the level, the heel and the toe).
const STEP = {
  asphalt:  { len: 0.30, level: 0.52, body: { f: 105, tau: 0.045, a: 0.55 }, noise: { bp: 1100, q: 0.6, atk: 0.005, tau: 0.040, a: 2.0 } },
  concrete: { len: 0.30, level: 0.56, body: { f: 125, tau: 0.040, a: 0.45 }, noise: { bp: 1400, q: 0.55, atk: 0.005, tau: 0.034, a: 2.2 } },
  cobble:   { len: 0.32, level: 0.63, body: { f: 140, tau: 0.040, a: 0.40 }, noise: { bp: 1800, q: 0.9, atk: 0.004, tau: 0.045, a: 1.7 }, grains: { rate: 80, dur: 0.07, f: 2600, a: 0.35 } },
  dirt:     { len: 0.34, level: 0.47, body: { f: 95, tau: 0.055, a: 0.55 }, noise: { lp: 1900, atk: 0.006, tau: 0.085, a: 1.8 }, grains: { rate: 140, dur: 0.12, f: 1700, a: 0.40 } },
  grass:    { len: 0.36, level: 0.36, body: { f: 85, tau: 0.065, a: 0.30 }, noise: { bp: 2000, q: 0.5, atk: 0.015, tau: 0.110, a: 1.1 }, grains: { rate: 60, dur: 0.14, f: 3000, a: 0.18 } },
  stairs:   { len: 0.36, level: 0.56, body: { f: 150, tau: 0.040, a: 0.50 }, noise: { bp: 1300, q: 0.6, atk: 0.005, tau: 0.034, a: 2.0 }, echo: { ms: 28, a: 0.20 } },
  tile:     { len: 0.30, level: 0.52, body: { f: 165, tau: 0.032, a: 0.35 }, noise: { bp: 2000, q: 0.6, atk: 0.004, tau: 0.026, a: 1.8 } },
  wood:     { len: 0.34, level: 0.55, body: { f: 150, tau: 0.050, a: 0.60 }, noise: { bp: 750, q: 0.7, atk: 0.005, tau: 0.040, a: 1.6 }, knock: { f: 230, tau: 0.045, a: 0.8 } },
  carpet:   { len: 0.30, level: 0.27, body: { f: 100, tau: 0.055, a: 0.50 }, noise: { lp: 700, atk: 0.010, tau: 0.060, a: 1.4 } },
  // the beach (A1, round 7): sand gives under the shoe (a soft low scuff and a spray of grains), wet sand is heavier and damper (a squelch, few grains), an ankle of water is a splash with droplets,
  // a knee of water a slower, lower slosh, and the pier's planks are a board with a hollow under it (a long low knock and a slap-back from the water below)
  sand:     { len: 0.34, level: 0.33, body: { f: 75, tau: 0.050, a: 0.30 }, noise: { lp: 1700, atk: 0.012, tau: 0.095, a: 1.5 }, grains: { rate: 230, dur: 0.16, f: 2100, a: 0.45 } },
  wetsand:  { len: 0.34, level: 0.42, body: { f: 90, tau: 0.065, a: 0.50 }, noise: { bp: 800, q: 0.6, atk: 0.010, tau: 0.075, a: 1.7 }, grains: { rate: 70, dur: 0.12, f: 1300, a: 0.28 } },
  shallow:  { len: 0.36, level: 0.46, body: { f: 110, tau: 0.040, a: 0.20 }, noise: { bp: 1500, q: 0.45, atk: 0.008, tau: 0.090, a: 1.4 }, grains: { rate: 200, dur: 0.18, f: 2200, a: 0.35 }, bubbles: { n: 5, f: 720, tau: 0.012, a: 0.9, chirp: 9, spread: 0.16 } },
  wade:     { len: 0.38, level: 0.35, body: { f: 80, tau: 0.090, a: 0.35 }, noise: { bp: 850, q: 0.5, atk: 0.025, tau: 0.150, a: 1.7 }, grains: { rate: 130, dur: 0.20, f: 1300, a: 0.30 }, bubbles: { n: 8, f: 480, tau: 0.020, a: 1.0, chirp: 7, spread: 0.26 } },
  jetty:    { len: 0.38, level: 0.44, body: { f: 120, tau: 0.070, a: 0.70 }, noise: { bp: 650, q: 0.7, atk: 0.005, tau: 0.040, a: 1.3 }, knock: { f: 185, tau: 0.095, a: 1.1 }, echo: { ms: 38, a: 0.28 } },
};
const STEP_LOWPASS = 3600;                                                  // Hz, two stages (24 dB per octave): what a footstep has above this is what sounded like tin

const smooth = (x) => x * x * (3 - 2 * x);

/**
 * One contact of a shoe, mixed into `out` from sample `at`: `amp` how hard, `size` 1 for a step and more for a landing (a lower, longer thump), `tone` a pitch factor (the ball of the
 * foot is higher than the heel). The scuff swells over `atk` seconds (a smoothstep, not a 1 ms edge).
 */
function contact(out, at, p, r, { amp = 1, size = 1, tone = 1 } = {}) {
  const sr = SR, m = out.length - at, jit = () => 1 + 0.08 * r.gauss();
  if (m <= 2) return;
  const b = p.body, f0 = b.f * jit() * tone * (size > 1 ? 0.8 : 1), tau = b.tau * jit() * (size > 1 ? 1.8 : 1);
  for (let i = 0; i < m; i++) { const t = i / sr; out[at + i] += Math.sin(TAU * f0 * (1 - 0.3 * (1 - Math.exp(-t / tau))) * t) * Math.exp(-t / tau) * b.a * amp * Math.min(1, size) * smooth(Math.min(1, t / 0.002)); }
  const ns = p.noise;
  if (ns) {
    let x = whiteNoise(m, r);
    x = ns.bp ? bandpass(x, ns.bp * jit() * tone, ns.q ?? 1) : ns.lp ? lowpass(x, ns.lp * jit()) : highpass(x, ns.hp * jit());
    for (let i = 0; i < m; i++) { const t = i / sr; out[at + i] += x[i] * smooth(Math.min(1, t / ns.atk)) * Math.exp(-t / (ns.tau * size)) * ns.a * amp; }
  }
  if (p.grains) {
    const g = p.grains, gl = Math.round(g.dur * size * sr), tmp = new Float32Array(m);
    for (let i = 0; i < gl && i < m; i++) if (r() < g.rate / sr) tmp[i] = (r() * 2 - 1) * Math.exp(-i / (gl * 0.6));
    bandpass(tmp, g.f * jit(), 1.8);
    for (let i = 0; i < m; i++) out[at + i] += tmp[i] * g.a * 6 * amp;
  }
  if (p.knock) { const k = p.knock, kf = k.f * jit() * tone; for (let i = 0; i < m; i++) { const t = i / sr; out[at + i] += Math.sin(TAU * kf * t) * Math.exp(-t / k.tau) * k.a * amp * smooth(Math.min(1, t / 0.003)); } }
  if (p.bubbles) {                       // water: `n` small bubbles over the first `spread` s, each a short tone that rises as it pinches off (Minnaert: f ~ 3 / radius), under 1.3 kHz so that none rings
    const b = p.bubbles, span = Math.max(1, Math.min(m, Math.round(b.spread * size * sr)));
    for (let k = 0; k < b.n; k++) {
      const at0 = Math.floor(r() * span), bf = b.f * (0.65 + 0.7 * r()), bt = b.tau * (0.6 + 0.8 * r()), ba = b.a * (0.35 + 0.65 * r()), cnt = Math.min(m - at0, Math.round(6 * bt * sr));
      for (let i = 0; i < cnt; i++) { const t = i / sr; out[at + at0 + i] += Math.sin(TAU * bf * (t + 0.5 * b.chirp * t * t)) * Math.exp(-t / bt) * ba * amp * smooth(Math.min(1, t / 0.003)); }
    }
  }
}

/** The end of every step and landing: slap-back if the place has one, no DC, a soft edge at both ends, nothing above STEP_LOWPASS, then the surface's level. */
function finishStep(out, p, level) {
  if (p.echo) { const d = Math.round(p.echo.ms / 1000 * SR), e = lowpass(Float32Array.from(out), 1800); for (let i = d; i < out.length; i++) out[i] += e[i - d] * p.echo.a; }
  removeDC(out); fade(out, 1.5, 18);
  lowpass(out, STEP_LOWPASS); lowpass(out, STEP_LOWPASS);
  fade(out, 0.5, 6);
  return normalize(out, level);
}

/** A walking step: the heel lands, the ball of the foot follows 60-90 ms later, softer and a little higher. */
function stepFrom(p, r) {
  const out = new Float32Array(Math.round(p.len * SR));
  contact(out, 0, p, r);
  contact(out, Math.round((0.060 + 0.030 * r()) * SR), p, r, { amp: 0.50 + 0.14 * r(), size: 0.8, tone: 1.12 });
  return finishStep(out, p, p.level);
}

/** One footstep on `surface` (see SURFACES); `variant` picks the seed. */
export function footstep(surface, variant = 0) {
  const p = STEP[surface] ?? STEP.concrete;
  return stepFrom(p, rng(hashSeed('step:' + surface) + variant * 7919));
}

/** A landing: heavier and longer than a step (both feet flat, no heel and toe), with the second foot arriving a beat later. */
export function landing(surface, variant = 0) {
  const p = STEP[surface] ?? STEP.concrete, r = rng(hashSeed('land:' + surface) + variant * 104729), out = new Float32Array(Math.round(0.55 * SR));
  contact(out, 0, p, r, { size: 1.6 });
  contact(out, Math.round(0.07 * SR), p, r, { amp: 0.45, size: 1.1 });
  return finishStep(out, p, Math.min(0.95, p.level * 1.25));
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
function creak(len, r, scale = 1) {                                // scale < 1: a bigger, deeper hinge (a wardrobe); > 1: a small dry squeak
  const n = Math.round(len * SR), src = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = (70 + 40 * Math.sin(TAU * 2.3 * t + 1) + 25 * Math.sin(TAU * 5.1 * t)) * (1 + 0.15 * (r() - 0.5)) * scale;
    ph += f / SR; if (ph >= 1) ph -= 1;
    src[i] = (ph < 0.1 ? 1 : -0.11) + 0.3 * (r() - 0.5);           // stick-slip: sharp pulses with a jittery floor
  }
  const x = sweepBandpass(src, (t) => (650 + 600 * Math.sin(Math.PI * t / len) + 120 * Math.sin(TAU * 7 * t)) * scale, 5);
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
/** A whole sheet unfolded or lifted out of a drawer (the reader opens): slower and crinklier than the menus' swish, still nothing below 300 Hz. */
export function sheet(variant = 0) {
  const r = rng(hashSeed('sheet') + variant * 31), n = Math.round(0.46 * SR), len = n / SR;
  const x = sweepBandpass(whiteNoise(n, r), (t) => 1400 + 2600 * (t / len), 0.7);
  for (let i = 0; i < n; i++) { const u = i / n; x[i] *= Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 1.6 * (0.55 + 0.45 * Math.sin(TAU * (9 + 5 * variant) * u + 1)); }
  const cr = new Float32Array(n); for (let i = 0; i < n; i++) if (r() < 70 / SR) cr[i] = r() * 2 - 1;        // the crinkle: about 70 sparse clicks a second
  bandpass(cr, 3200, 1.1);
  for (let i = 0; i < n; i++) x[i] += cr[i] * Math.sin(Math.PI * i / n) * 6;
  removeDC(x); fade(x, 6, 40); return normalize(x, 0.34);
}

// ---- furniture: drawers, wardrobes, cupboards, chests, lockers, the fridge (container:open / container:close of interiors/containers.js) ---------------
export const FURN_KINDS = ['drawer', 'drawerm', 'till', 'wardrobe', 'cupboard', 'locker', 'lid', 'fridge'];
/** The runner of a drawer or a sticking door: band-passed noise that swells and slips in pulses (rate Hz), `rough` = how deep the slips go. */
function scrape(len, r, f0, f1, q, rough, rate) {
  const n = Math.round(len * SR), x = sweepBandpass(whiteNoise(n, r), (t) => lerp(f0, f1, t / len), q), ph = r() * TAU;
  for (let i = 0; i < n; i++) { const t = i / SR; x[i] *= Math.sin(Math.PI * i / n) ** 0.7 * (1 - rough + rough * Math.max(0, Math.sin(TAU * rate * t + ph)) ** 2); }
  return x;
}
/** A dull wooden knock (a drawer reaching its stop, a lid coming to rest): a body tone at `f` and a woody mid knock, so that it carries on small speakers. */
function knock(out, at, r, g, f) {
  const k = buf(0.18);
  for (let i = 0; i < k.length; i++) { const t = i / SR; k[i] = Math.sin(TAU * f * t) * Math.exp(-t / 0.05); }
  addTo(out, k, at, g * 0.6);
  const nz = bandpass(whiteNoise(k.length, r), 900, 1.2); for (let i = 0; i < nz.length; i++) nz[i] *= Math.exp(-i / (0.012 * SR));
  addTo(out, nz, at, g * 4);
}
/** A heavier thump (a door or lid shutting): body tone, a woody knock near 750 Hz and a short click on top, so it is not mostly sub-150 Hz. */
function thump(out, at, r, g, f) {
  const n = Math.round(0.25 * SR), k = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; k[i] = Math.sin(TAU * f * (1 - 0.25 * (1 - Math.exp(-t / 0.05))) * t) * Math.exp(-t / 0.06); }
  addTo(out, k, at, 0.6 * g);
  const nz = bandpass(whiteNoise(n, r), 750 * (1 + 0.05 * r.gauss()), 0.8); for (let i = 0; i < n; i++) nz[i] *= Math.exp(-i / (0.025 * SR));
  addTo(out, nz, at, 4.5 * g);
  const hi = bandpass(whiteNoise(Math.round(0.02 * SR), r), 2400, 1.5); for (let i = 0; i < hi.length; i++) hi[i] *= Math.exp(-i / (0.004 * SR));
  addTo(out, hi, at, 3 * g);
}
/** Metal on metal: a short stiff clack of three inharmonic partials around `f`. */
function clack(out, at, r, g, f = 1400) {
  const k = buf(0.12);
  for (const [m, tau, a] of [[1, 0.025, 1], [2.1, 0.015, 0.6], [3.7, 0.008, 0.4]]) for (let i = 0; i < k.length; i++) k[i] += Math.sin(TAU * f * m * (1 + 0.01 * r()) * i / SR) * Math.exp(-i / (tau * SR)) * a;
  addTo(out, k, at, g);
}
/** A struck tone: inharmonic partials [ratio, relative decay, amplitude] above f0, a 3 ms attack, `tau` seconds of ring. Mixed into `out` at sample `at`. */
function struck(out, at, f0, g, tau, parts = [[1, 1, 1], [2.76, 0.45, 0.45], [5.4, 0.2, 0.22]]) {
  const n = Math.min(out.length - at, Math.round(tau * 6 * SR));
  for (const [m, k, a] of parts) {
    const f = f0 * m; if (f > SR * 0.45 || n <= 0) continue;
    for (let i = 0; i < n; i++) { const t = i / SR; out[at + i] += Math.sin(TAU * f * t) * Math.exp(-t / (tau * k)) * a * g * Math.min(1, t / 0.003); }
  }
}
/** A big metal door shutting: the clang of the shutter, shorter. */
function clang(out, at, r, g) {
  const k = buf(0.4);
  for (const [f, tau, a] of [[690, 0.14, 1], [1540, 0.1, 0.6], [2480, 0.06, 0.4], [3520, 0.04, 0.25]]) for (let i = 0; i < k.length; i++) k[i] += Math.sin(TAU * f * (1 + 0.01 * r()) * i / SR) * Math.exp(-i / (tau * SR)) * a;
  addTo(out, k, at, g);
}
/** The soft pop of a fridge seal letting go (or catching): a short suction thup with a breath of air. */
function seal(out, at, r, g) {
  const n = Math.round(0.09 * SR), k = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; k[i] = Math.sin(TAU * lerp(430, 170, Math.min(1, t / 0.06)) * t) * Math.exp(-t / 0.03); }
  addTo(out, k, at, g * 0.8);
  const air = lowpass(whiteNoise(n, r), 1400); for (let i = 0; i < n; i++) air[i] *= Math.exp(-i / (0.02 * SR));
  addTo(out, air, at, g * 0.7);
}

/**
 * One furniture sound. kind: drawer (wood runners, a knock at the stop), drawerm (metal runners: a locker, a tool chest, a filing cabinet), till (a shop's cash drawer:
 * runners, a clack, a small bell on opening), wardrobe (deep hinge creak), cupboard (a light latch and a dry squeak, a soft shut), locker (a metal door: clang on closing),
 * lid (a chest lid: long creak, a knock as it rests; a heavy thud closing), fridge (seal pop and thunk). dir: 'open' | 'close'. variant picks the seed.
 * Timing: interiors/containers.js moves a piece in 0.3 s and sends its event as the move starts, and a close eases INTO the shut, so every close lands its bang at
 * 0.26 s (a stop or latch on an opening at 0.26 - 0.3 s): the ear and the eye agree.
 */
export function furniture(kind, dir = 'open', variant = 0) {
  const open = dir !== 'close', r = rng(hashSeed(`furn:${kind}:${open ? 'open' : 'close'}`) + variant * 7919), j = () => 1 + 0.06 * r.gauss(), at = (s) => Math.round(s * SR);
  let out, level = 0.62;
  switch (kind) {
    case 'drawerm':
      out = buf(0.5); addTo(out, scrape(0.3, r, 2000 * j(), 3400 * j(), 2, 0.75, 36), 0, 0.5); clack(out, at(open ? 0.27 : 0.29), r, open ? 0.45 : 0.8, 1300 * j()); level = 0.6; break;
    case 'till':
      out = buf(0.85); addTo(out, scrape(0.28, r, 2200 * j(), 3500 * j(), 2, 0.7, 34), 0, 0.45); clack(out, at(0.26), r, open ? 0.6 : 0.9, 1250 * j());
      if (open) struck(out, at(0.3), 2637 * j(), 0.5, 0.2); else knock(out, at(0.27), r, 0.35, 130);
      level = 0.65; break;
    case 'wardrobe':
      out = buf(open ? 0.8 : 0.85);
      if (open) { latch(out, 0, r, 0.55); addTo(out, creak(0.5 + 0.08 * r(), r, 0.55), at(0.05), 0.5); addTo(out, whoosh(0.3, r, 600, 250), at(0.08), 0.14); }
      else { addTo(out, whoosh(0.3, r, 800, 220), 0, 0.22); thump(out, at(0.26), r, 0.9, 62); latch(out, at(0.31), r, 0.5); addTo(out, creak(0.25, r, 0.55), at(0.02), 0.18); }
      level = 0.66; break;
    case 'cupboard':
      out = buf(open ? 0.55 : 0.65);
      if (open) { latch(out, 0, r, 0.8); addTo(out, creak(0.2 + 0.05 * r(), r, 1.6), at(0.03), 0.28); }
      else { addTo(out, whoosh(0.2, r, 1200, 500), at(0.05), 0.2); thump(out, at(0.26), r, 0.55, 170); latch(out, at(0.3), r, 0.6); }
      level = 0.6; break;
    case 'locker':
      out = buf(0.75);
      if (open) { clack(out, 0, r, 0.8, 900 * j()); addTo(out, creak(0.22, r, 2.2), at(0.04), 0.2); clack(out, at(0.27), r, 0.3, 1900 * j()); }
      else { addTo(out, whoosh(0.2, r, 1800, 900), at(0.03), 0.15); clang(out, at(0.26), r, 0.9); thump(out, at(0.26), r, 0.35, 105); clack(out, at(0.31), r, 0.6, 1100 * j()); }
      level = 0.7; break;
    case 'lid':
      out = buf(open ? 0.7 : 0.75);
      if (open) { latch(out, 0, r, 0.5); addTo(out, creak(0.4, r, 0.9), at(0.03), 0.9); knock(out, at(0.3), r, 0.3, 200); }
      else { addTo(out, whoosh(0.22, r, 700, 250), at(0.04), 0.2); thump(out, at(0.26), r, 1, 70); latch(out, at(0.32), r, 0.45); }
      level = 0.66; break;
    case 'fridge':
      out = buf(open ? 0.55 : 0.62);
      if (open) { latch(out, 0, r, 0.4); seal(out, at(0.03), r, 0.9); const air = highpass(whiteNoise(at(0.3), r), 3000); for (let i = 0; i < air.length; i++) air[i] *= Math.sin(Math.PI * i / air.length) ** 2; addTo(out, air, at(0.05), 0.6); }
      else { addTo(out, whoosh(0.2, r, 900, 300), at(0.04), 0.12); thump(out, at(0.26), r, 0.9, 95); seal(out, at(0.275), r, 0.6); clack(out, at(0.31), r, 0.25, 2200 * j()); }
      level = 0.66; break;
    default:                                                               // drawer: wooden runners
      out = buf(0.5); addTo(out, scrape(open ? 0.28 : 0.26, r, 330 * j(), 820 * j(), 1.2, 0.55, 12 + 3 * r()), 0, 0.55); knock(out, at(open ? 0.26 : 0.25), r, open ? 0.35 : 0.9, open ? 150 : 130); level = 0.62;
  }
  removeDC(out); fade(out, 0.5, 30); return normalize(out, level);
}

// ---- finds: the ting of something special (flow.js plays it with the 'Hallazgo' toast) -------------------------------------------------------------------
export const FIND_SOUNDS = ['coins', 'watches', 'jewels', 'oddities'];
/** coins: a gold coin dropped on a table, ringing, bouncing and settling; watches: tick, tock, tick, tock and a small alarm bell; jewels: a glassy ring with sparkles over it;
 *  oddities: a three-note wooden bloop and a rubbery boing. */
export function findSound(collection = 'coins') {
  const r = rng(hashSeed('find:' + collection)), j = () => 1 + 0.015 * r.gauss(), at = (s) => Math.round(s * SR);
  let out;
  switch (collection) {
    case 'watches': {
      out = buf(1.5);
      for (let k = 0; k < 4; k++) { const f = (k % 2 ? 1000 : 1350) * j(), tk = buf(0.05); for (let i = 0; i < tk.length; i++) { const t = i / SR; tk[i] = (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * 2 * f * t)) * Math.exp(-t / 0.006); } addTo(out, tk, at(0.08 + 0.16 * k), 0.7); }
      struck(out, at(0.8), 1760 * j(), 0.9, 0.32); break;
    }
    case 'jewels': {
      out = buf(1.7);
      for (const [f, a, tau, beat] of [[2093, 0.4, 0.7, 2.3], [3136, 1, 0.55, 3.1], [4699, 0.55, 0.4, 4.4], [6272, 0.35, 0.3, 5.2]]) for (let i = 0; i < out.length; i++) { const t = i / SR; out[i] += (Math.sin(TAU * f * t) + Math.sin(TAU * (f + beat) * t + 1)) * 0.5 * a * Math.exp(-t / tau) * Math.min(1, t / 0.004); }
      for (let k = 0; k < 6; k++) struck(out, at(r.range(0.03, 0.5)), r.range(5200, 7800), 0.22, 0.05, [[1, 1, 1], [2.4, 0.4, 0.4]]);
      break;
    }
    case 'oddities': {
      out = buf(1.1);
      for (const [t, f] of [[0, 523.3], [0.13, 784], [0.26, 659.3]]) struck(out, at(t), f * j(), 0.8, 0.2, [[1, 1, 1], [3.9, 0.28, 0.45], [9.2, 0.1, 0.2]]);
      const n = at(0.26); let ph = 0;
      for (let i = 0; i < n; i++) { const u = i / n, f = u < 0.5 ? lerp(420, 900, u * 2) : lerp(900, 300, (u - 0.5) * 2); ph += f * (1 + 0.04 * Math.sin(TAU * 12 * u)) / SR; if (at(0.44) + i < out.length) out[at(0.44) + i] += Math.sin(TAU * ph) * Math.sin(Math.PI * u) ** 0.6 * 0.4; }
      break;
    }
    default: {                                                             // coins
      out = buf(1.05);
      for (const [t, f, g] of [[0, 2150, 1], [0.105, 2330, 0.55], [0.185, 2520, 0.3], [0.245, 2700, 0.15]]) {
        struck(out, at(t), f * j(), g, 0.16, [[1, 1, 1], [2.32, 0.5, 0.55], [4.1, 0.25, 0.3], [0.5, 1.4, 0.2]]);
        const c = bandpass(whiteNoise(at(0.012), r), 6200, 2); for (let i = 0; i < c.length; i++) c[i] *= Math.exp(-i / (0.003 * SR)); addTo(out, c, at(t), 0.25 * g);
      }
    }
  }
  removeDC(out); fade(out, 0.5, 60); return normalize(out, 0.6);
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
