// Deterministic DSP kit for the procedural sound library (owner: A1). Everything works on mono Float32Array at one fixed sample rate and needs
// no AudioContext, so the whole library renders identically under Node (tests) and in the browser; the engine wraps the arrays in AudioBuffers.
// No Math.random(): every recipe takes a seeded generator, so the same seed gives the same bytes.

export const SR = 22050;                     // library sample rate (WebAudio resamples on playback); footsteps and ambience need no more

/** mulberry32 with helpers. r() in [0,1). */
export function rng(seed) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length) % arr.length];
  r.chance = (p) => r() < p;
  r.gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += r(); return (s - 3) / 0.7071; };     // ~N(0,1)
  r.fork = (label) => rng(hashSeed(String(label)) ^ Math.floor(r() * 4294967296));
  return r;
}

export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const buf = (sec, sr = SR) => new Float32Array(Math.max(1, Math.round(sec * sr)));
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-9), 0, 1); return t * t * (3 - 2 * t); };

export function whiteNoise(n, r) { const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = r() * 2 - 1; return x; }

/** Pink (-3 dB/oct) noise, Paul Kellet's filter; roughly unit-scale. */
export function pinkNoise(n, r) {
  const x = new Float32Array(n); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    x[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
  }
  return x;
}

/** Brown (-6 dB/oct) noise: leaky integrator of white noise, rumble. */
export function brownNoise(n, r) {
  const x = new Float32Array(n); let l = 0;
  for (let i = 0; i < n; i++) { l = (l + 0.02 * (r() * 2 - 1)) / 1.02; x[i] = l * 3.5; }
  return x;
}

// ---- biquad (RBJ cookbook) --------------------------------------------------------------------------------------------------------------
/** type: lp hp bp (constant 0 dB peak) notch peak; f in Hz, q resonance. Returns { b0, b1, b2, a1, a2 } normalised by a0. */
export function biquad(type, f, q = 0.7071, gainDb = 0, sr = SR) {
  const w0 = 2 * Math.PI * clamp(f, 10, sr * 0.49) / sr, cs = Math.cos(w0), sn = Math.sin(w0), al = sn / (2 * Math.max(q, 0.05)), A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lp': b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
    case 'hp': b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
    case 'bp': b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
    case 'notch': b0 = 1; b1 = -2 * cs; b2 = 1; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
    case 'peak': b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; break;
    default: throw new Error('biquad type ' + type);
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Run a biquad over x (in place when out === x, the default). Returns out. */
export function applyBiquad(x, c, out = x) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i], y = c.b0 * v + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = y; out[i] = y;
  }
  return out;
}
export const lowpass = (x, f, q = 0.7071, sr = SR) => applyBiquad(x, biquad('lp', f, q, 0, sr));
export const highpass = (x, f, q = 0.7071, sr = SR) => applyBiquad(x, biquad('hp', f, q, 0, sr));
export const bandpass = (x, f, q = 1, sr = SR) => applyBiquad(x, biquad('bp', f, q, 0, sr));

/** A bandpass whose centre / Q follow functions of the sample index (coefficients refreshed every 32 samples): vowels, sweeps, doppler. */
export function sweepBandpass(x, fOf, qOf, sr = SR) {
  const out = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0, c = null;
  for (let i = 0; i < x.length; i++) {
    if ((i & 31) === 0) c = biquad('bp', fOf(i / sr), typeof qOf === 'function' ? qOf(i / sr) : qOf, 0, sr);
    const v = x[i], y = c.b0 * v + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = y; out[i] = y;
  }
  return out;
}

// ---- measurement / shaping ------------------------------------------------------------------------------------------------------------
export function peak(x) { let m = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > m) m = a; } return m; }
export function rms(x) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, x.length)); }
export function mean(x) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i]; return s / Math.max(1, x.length); }
export function finite(x) { for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i])) return false; return true; }

/** Scale so the peak is `target` (no-op for silence). */
export function normalize(x, target = 0.9) { const p = peak(x); if (p > 1e-9) { const g = target / p; for (let i = 0; i < x.length; i++) x[i] *= g; } return x; }
/** Scale to a loudness (RMS `target`), but never past `maxPeak`: beds of different crest factors then sit at comparable levels in the mix. */
export function normalizeRms(x, target = 0.07, maxPeak = 0.95) {
  const e = rms(x); if (e < 1e-9) return x;
  let g = target / e; const p = peak(x) * g; if (p > maxPeak) g *= maxPeak / p;
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}
/** Smooth random control signal in [-1, 1]: a new random target `hz` times a second, cosine-interpolated (gusts, drift, swells). */
export function lfo(n, r, hz, sr = SR) {
  const out = new Float32Array(n), step = sr / hz; let a = r() * 2 - 1, b = r() * 2 - 1, start = 0;
  for (let i = 0; i < n; i++) {
    if (i >= start + step) { a = b; b = r() * 2 - 1; start += step; }
    out[i] = a + (b - a) * (0.5 - 0.5 * Math.cos(Math.PI * (i - start) / step));
  }
  return out;
}
export function gain(x, g) { for (let i = 0; i < x.length; i++) x[i] *= g; return x; }
export function removeDC(x) { const m = mean(x); for (let i = 0; i < x.length; i++) x[i] -= m; return x; }
export function softclip(x, drive = 1.5) { const n = Math.tanh(drive); for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive) / n; return x; }

/** Raised-cosine fade in / out (milliseconds) so a one-shot starts and ends at exactly zero: no clicks. */
export function fade(x, inMs = 2, outMs = 8, sr = SR) {
  const a = Math.min(x.length >> 1, Math.round(inMs * sr / 1000)), b = Math.min(x.length >> 1, Math.round(outMs * sr / 1000));
  for (let i = 0; i < a; i++) x[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / a);
  for (let i = 0; i < b; i++) x[x.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / b);
  x[x.length - 1] = 0;
  return x;
}

/** Mix `src` into `dst` from sample `at` (clipped at the end), scaled by g. */
export function addTo(dst, src, at = 0, g = 1) {
  const s0 = Math.max(0, -at), n = Math.min(src.length, dst.length - at);
  for (let i = s0; i < n; i++) dst[at + i] += src[i] * g;
  return dst;
}

/**
 * Make `x` loop seamlessly: the last `xfade` seconds are blended (equal power) into the first, and the result is that much shorter, so
 * the sample after the end is the one the blend started from.
 */
export function loopify(x, xfade = 0.5, sr = SR) {
  const f = Math.min(Math.round(xfade * sr), x.length >> 2), n = x.length - f, out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = x[i];
  for (let i = 0; i < f; i++) {
    const t = i / f, a = Math.cos(t * Math.PI / 2), b = Math.sin(t * Math.PI / 2);      // head fades in under the tail that fades out
    out[i] = x[i] * b + x[n + i] * a;
  }
  return out;
}

// ---- voice-like sources ---------------------------------------------------------------------------------------------------------------
const VOWELS = [[800, 1250], [520, 1850], [300, 2300], [500, 950], [330, 820], [650, 1500]];      // a e i o u + schwa-ish: first two formants

/**
 * Crowd / television babble: `voices` talkers made of glottal pulse trains pushed through two moving vowel formants, in syllables of 0.12-0.35 s
 * with pauses, plus a consonant puff at each syllable start. Not words, but the rhythm and timbre of speech heard through a wall or across a plaza.
 * o: { sec, voices, f0:[lo,hi], pause:[lo,hi] seconds between phrases, rate (syllable speed multiplier), breath, seed }
 */
export function babble(o, sr = SR) {
  const r = rng(o.seed ?? 1), n = Math.round(o.sec * sr), out = new Float32Array(n), voices = o.voices ?? 6, [f0lo, f0hi] = o.f0 ?? [110, 220];
  const [pLo, pHi] = o.pause ?? [0.15, 0.9], speed = o.rate ?? 1;
  for (let v = 0; v < voices; v++) {
    const base = r.range(f0lo, f0hi), src = new Float32Array(n), env = new Float32Array(n), f1 = new Float32Array(n), f2 = new Float32Array(n);
    let t = r.range(0, pHi), ph = 0, prev = r.pick(VOWELS);
    while (t < o.sec + 0.4) {
      const dur = r.range(0.12, 0.35) / speed, nxt = r.pick(VOWELS), i0 = Math.round(t * sr), i1 = Math.min(n, Math.round((t + dur) * sr));
      const glide = r.range(-0.18, 0.22);
      for (let i = Math.max(0, i0); i < i1; i++) {
        const u = (i - i0) / Math.max(1, i1 - i0), e = Math.sin(Math.PI * u);
        env[i] = e * e;
        f1[i] = lerp(prev[0], nxt[0], smoothstep(0, 0.5, u)); f2[i] = lerp(prev[1], nxt[1], smoothstep(0, 0.5, u));
        const f0 = base * (1 + glide * (u - 0.5) + 0.04 * Math.sin(2 * Math.PI * 5.5 * (i / sr)));
        ph += f0 / sr; if (ph >= 1) ph -= 1;
        src[i] = 2 * ph - 1;                                                     // sawtooth: all harmonics for the formants to pick from
      }
      prev = nxt; t += dur;
      if (r.chance(0.28)) t += r.range(pLo, pHi); else t += r.range(0.01, 0.08);
    }
    const a = sweepBandpass(src, (s) => f1[Math.min(n - 1, Math.round(s * sr))] || 500, 4, sr), b = sweepBandpass(src, (s) => f2[Math.min(n - 1, Math.round(s * sr))] || 1500, 6, sr);
    const gv = r.range(0.6, 1);
    for (let i = 0; i < n; i++) out[i] += (a[i] * 1.0 + b[i] * 0.55) * env[i] * gv;
  }
  if (o.breath) {                                                                  // consonant puffs and room noise follow the same syllable rhythm loosely
    const nz = highpass(whiteNoise(n, r), 2500, 0.7, sr);
    let t = 0; const pf = new Float32Array(n);
    while (t < o.sec) { const i0 = Math.round(t * sr), len = Math.round(r.range(0.01, 0.03) * sr); for (let i = 0; i < len && i0 + i < n; i++) pf[i0 + i] = Math.exp(-i / (0.35 * len)); t += r.range(0.08, 0.35) / (voices ** 0.5) / speed; }
    for (let i = 0; i < n; i++) out[i] += nz[i] * pf[i] * o.breath;
  }
  return out;
}

// ---- spaces -----------------------------------------------------------------------------------------------------------------------------
/**
 * A synthetic room impulse response, two decorrelated channels at sample rate `sr` (a ConvolverNode needs the buffer at the context's own rate).
 * Early reflections, then noise that decays exponentially and darkens as it goes. o: { sec, tau, pre, dark 0..1, early: [[seconds, gain],...], seed }
 */
export function reverbIR(o = {}, sr = SR) {
  const { sec = 1.2, tau = 0.35, pre = 0.008, dark = 0.6, early = [], seed = 7 } = o, n = Math.max(8, Math.round(sec * sr)), out = [];
  for (let c = 0; c < 2; c++) {
    const r = rng(seed * 131 + c * 17), x = new Float32Array(n), k0 = Math.round(pre * sr); let lp = 0;
    for (let i = k0; i < n; i++) {
      const t = (i - k0) / sr, a = clamp(1 - dark * (1 - Math.exp(-t / (tau * 1.2))), 0.04, 1);
      lp += a * ((r() * 2 - 1) - lp);
      x[i] = lp * Math.exp(-t / tau);
    }
    for (const [at, g] of early) { const k = Math.round((at + c * 0.0037) * sr); if (k > 0 && k < n) x[k] += g * (r() < 0.5 ? -1 : 1); }
    const tail = Math.min(n >> 1, Math.round(0.15 * n)); for (let i = 0; i < tail; i++) x[n - 1 - i] *= i / tail;
    out.push(x);
  }
  return out;
}
