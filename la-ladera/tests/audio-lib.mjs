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
