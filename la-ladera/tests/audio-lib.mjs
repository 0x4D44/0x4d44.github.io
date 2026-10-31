// Shared helpers for the audio tests (owner: A1): spectra and step statistics on plain Float32Arrays, so the sound library is checked by
// measurement under Node, with no AudioContext and nothing played.
import { SR } from '../js/audio/dsp.js';

/** In-place radix-2 FFT (n a power of two). */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

/** Welch power spectrum: up to `segments` Hann-windowed blocks of `n` samples spread over x. Returns { power: Float64Array(n/2), hz: bin width }. */
export function spectrum(x, n = 4096, segments = 24, sr = SR) {
  const power = new Float64Array(n / 2), win = new Float64Array(n);
  for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
  const count = Math.max(1, Math.min(segments, Math.floor(x.length / n)));
  const hop = count > 1 ? Math.floor((x.length - n) / (count - 1)) : 0;
  for (let s = 0; s < count; s++) {
    const re = new Float64Array(n), im = new Float64Array(n), o = s * hop;
    for (let i = 0; i < n; i++) re[i] = (x[o + i] ?? 0) * win[i];
    fft(re, im);
    for (let k = 0; k < n / 2; k++) power[k] += re[k] * re[k] + im[k] * im[k];
  }
  return { power, hz: sr / n, n };
}
/** Fraction of the total power between lo and hi Hz. */
export function bandShare(x, lo, hi, sr = SR) {
  const { power, hz } = spectrum(x, 4096, 24, sr); let tot = 1e-30, part = 0;
  for (let k = 1; k < power.length; k++) { tot += power[k]; const f = k * hz; if (f >= lo && f < hi) part += power[k]; }
  return part / tot;
}
/** Power-weighted mean frequency. */
export function centroid(x, sr = SR) {
  const { power, hz } = spectrum(x, 4096, 24, sr); let tot = 1e-30, m = 0;
  for (let k = 1; k < power.length; k++) { tot += power[k]; m += power[k] * k * hz; }
  return m / tot;
}
/** Frequency of the strongest bin between lo and hi Hz (finer blocks for tonal sounds). */
export function peakFreq(x, lo, hi, sr = SR, n = 16384) {
  const { power, hz } = spectrum(x.length >= n ? x : Float32Array.from({ length: n }, (_, i) => x[i] ?? 0), n, 8, sr); let best = 0, bf = 0;
  for (let k = 1; k < power.length; k++) { const f = k * hz; if (f >= lo && f <= hi && power[k] > best) { best = power[k]; bf = f; } }
  return bf;
}

/** Statistics of the sample-to-sample step |x[i+1] - x[i]|: how smooth the waveform is, and how big a step the loop seam makes by comparison. */
export function stepStats(x) {
  const n = x.length - 1, d = new Float32Array(n); let s2 = 0;
  for (let i = 0; i < n; i++) { d[i] = Math.abs(x[i + 1] - x[i]); s2 += d[i] * d[i]; }
  const sorted = Float32Array.from(d).sort();
  return { rms: Math.sqrt(s2 / n), p999: sorted[Math.floor(n * 0.999)], max: sorted[n - 1], seam: Math.abs(x[0] - x[x.length - 1]) };
}
/** RMS over a window [a, b) seconds. */
export function windowRms(x, a, b, sr = SR) {
  const i0 = Math.max(0, Math.round(a * sr)), i1 = Math.min(x.length, Math.round(b * sr)); let s = 0;
  for (let i = i0; i < i1; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, i1 - i0));
}
/** A pure tone, for filter tests. */
export const sine = (f, sec = 1, sr = SR) => Float32Array.from({ length: Math.round(sec * sr) }, (_, i) => Math.sin(2 * Math.PI * f * i / sr));
/** RMS of the second half (past the filter's start-up). */
export const settledRms = (x) => { let s = 0; const h = x.length >> 1; for (let i = h; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / (x.length - h)); };
/**
 * Fundamental frequency (Hz) of x[from .. from+len) seconds by autocorrelation between fmin and fmax, with the strength of the peak (1 = a perfect
 * repetition). The first peak that comes within 90 % of the best one wins, so a period and its doubles do not count as an octave error. Reads the PITCH
 * of a voiced sound; a spectrum would show its formants instead.
 */
export function acPitch(x, from, len, fmin = 80, fmax = 800, sr = SR) {
  const i0 = Math.round(from * sr), n = Math.round(len * sr), lagMin = Math.floor(sr / fmax) - 1, lagMax = Math.ceil(sr / fmin) + 1, c = new Float64Array(lagMax + 2);
  let r0 = 1e-30; for (let i = 0; i < n; i++) r0 += (x[i0 + i] ?? 0) ** 2;
  let best = -Infinity;
  for (let l = lagMin; l <= lagMax + 1; l++) { let s = 0; for (let i = 0; i < n; i++) s += (x[i0 + i] ?? 0) * (x[i0 + i + l] ?? 0); c[l] = s; if (l <= lagMax && s > best) best = s; }
  for (let l = lagMin + 1; l <= lagMax; l++) if (c[l] >= 0.9 * best && c[l] >= c[l - 1] && c[l] >= c[l + 1]) return { f: sr / l, strength: c[l] / r0 };
  return { f: 0, strength: 0 };
}
/**
 * The tallest narrow line between lo and hi Hz: dB of the Welch power in a bin over the median power of the 41 bins around it, and where it is. A smooth scuff of noise reaches
 * 5-8 dB by chance; a ring (the tin of a tile, a struck can) is 15 dB and more.
 */
export function narrowPeak(x, lo = 1500, hi = 10000, n = 512, sr = SR) {
  const { power, hz } = spectrum(x, n, 64, sr), w = 20; let best = 0, at = 0;
  for (let k = Math.ceil(lo / hz); k < Math.min(power.length - 1, Math.floor(hi / hz)); k++) {
    const near = Array.from(power.subarray(Math.max(1, k - w), Math.min(power.length, k + w + 1))).sort((p, q) => p - q), r = power[k] / (near[near.length >> 1] + 1e-30);
    if (r > best) { best = r; at = k * hz; }
  }
  return { db: 10 * Math.log10(Math.max(best, 1e-9)), at };
}
/** Milliseconds until the waveform first reaches half of its own peak: how fast the sound starts (a click is under 1 ms, a thump takes a few). */
export function timeToHalf(x, sr = SR) {
  let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v));
  let i = 0; while (i < x.length && Math.abs(x[i]) < 0.5 * pk) i++;
  return i / sr * 1000;
}
/**
 * The heel and the toe of a footstep, read off its envelope (3 ms RMS windows every 0.5 ms): the first lobe is the loudest point of the first 40 ms, the second the loudest point
 * 45-130 ms after it. Returns the delay between them (ms), the second lobe's level re the first (dB) and its bump: its height over the valley before it (1 = no second lobe, the
 * first one just fading away).
 */
export function heelToe(x, sr = SR) {
  const w = Math.round(0.003 * sr), h = Math.round(0.0005 * sr), env = [];
  for (let i = 0; i + w <= x.length; i += h) { let s = 0; for (let j = 0; j < w; j++) s += x[i + j] * x[i + j]; env.push(Math.sqrt(s / w)); }
  const ms = (k) => k * h / sr * 1000;
  let i1 = 0; for (let k = 0; k < Math.floor(0.040 * sr / h); k++) if (env[k] > env[i1]) i1 = k;
  const a = i1 + Math.floor(0.045 * sr / h), b = Math.min(env.length - 1, i1 + Math.floor(0.130 * sr / h)); let i2 = a;
  for (let k = a; k <= b; k++) if (env[k] > env[i2]) i2 = k;
  let valley = Infinity; for (let k = i1; k <= i2; k++) valley = Math.min(valley, env[k]);
  return { gapMs: ms(i2 - i1), toeDb: 20 * Math.log10(env[i2] / env[i1]), bump: env[i2] / Math.max(valley, 1e-9) };
}
