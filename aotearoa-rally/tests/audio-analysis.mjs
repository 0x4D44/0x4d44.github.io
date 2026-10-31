// Pure audio analysis shared by tests/machines-audio-evidence.mjs (Chrome clips) and the node tests (synthetic signals).
// No DOM, no WebAudio. All spectra are Hann-windowed magnitude FFTs.

export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = i + j + len / 2;
        const vr = re[b] * cr - im[b] * ci, vi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - vr; im[b] = im[a] - vi; re[a] += vr; im[a] += vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

/** Hann-windowed magnitude spectrum of n samples of x starting at `start` (n a power of two). Returns n/2 bins. */
export function mag(x, start, n) {
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = (x[start + i] || 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
  fft(re, im);
  const m = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) m[i] = Math.hypot(re[i], im[i]);
  return m;
}

export const db = (v) => (v > 1e-9 ? 20 * Math.log10(v) : -180);

/** Magnitude-weighted mean frequency (Hz) over non-overlapping 4096-sample frames, DC bin excluded. */
export function spectralCentroid(L, sr, N = 4096) {
  let cen = 0, tot = 0;
  const frames = Math.max(1, Math.floor((L.length - N) / N));
  for (let f = 0; f < frames; f++) { const m = mag(L, f * N, N); for (let k = 1; k < m.length; k++) { cen += m[k] * k; tot += m[k]; } }
  return Math.round((cen / (tot || 1)) * (sr / N));
}

/** Unconstrained strongest bin in [loHz, hiHz]. This is what the round-3 report printed as "measured"; it locks onto harmonics. */
export function peakPick(m, sr, N, loHz = 20, hiHz = 600) {
  const lo = Math.floor((loHz * N) / sr), hi = Math.ceil((hiHz * N) / sr);
  let best = 0, bi = 0;
  for (let k = lo; k < hi; k++) if (m[k] > best) { best = m[k]; bi = k; }
  return (bi * sr) / N;
}

/**
 * Model-frequency check: how far (dB) the energy at `hz` stands above the median of its neighbouring bins (+-3..12 bins, the
 * bins within +-2 of the line excluded). A line that is really there reads +10 dB or more; broadband hiss reads about 0.
 */
export function lineAbove(m, sr, N, hz) {
  const k = Math.round((hz * N) / sr);
  if (k < 4 || k + 14 >= m.length) return NaN;
  let peak = 0;
  for (let q = k - 1; q <= k + 1; q++) peak = Math.max(peak, m[q]);
  const nb = [];
  for (let q = Math.max(1, k - 12); q <= k + 12; q++) if (Math.abs(q - k) > 2) nb.push(m[q]);
  nb.sort((a, b) => a - b);
  return +(db(peak) - db(nb[nb.length >> 1])).toFixed(1);
}

/**
 * Pitch tracking against the model: for the window centred at sample `centre`, the line prominence (dB over neighbours) at f/2, f
 * and 2f of the model firing frequency, plus the unconstrained peak for comparison. An engine "tracks rpm" when f or 2f is
 * prominent; f/2 may legitimately be strong too (V8 lope, flat-four burble), so it is reported but never judged.
 */
export function modelPitchCheck(L, sr, centre, modelHz, N = 8192) {
  const start = Math.max(0, Math.floor(centre - N / 2));
  const m = mag(L, start, N);
  return { peakHz: Math.round(peakPick(m, sr, N)), halfDb: lineAbove(m, sr, N, modelHz / 2), f0Db: lineAbove(m, sr, N, modelHz), f2Db: lineAbove(m, sr, N, modelHz * 2) };
}

/** A clean pulse train at `hz` (narrow positive pulses, duty 12 %), for calibrating the analysis. */
export function pulseTrain(hz, sr, seconds, duty = 0.12) {
  const n = Math.round(sr * seconds), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const ph = (i * hz) / sr; out[i] = ph - Math.floor(ph) < duty ? 1 : 0; }
  return out;
}
