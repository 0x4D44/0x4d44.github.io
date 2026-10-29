// Looping ambience, synthesised (owner: A1): wind, traffic, crickets, neighbours, children, a ball court, a television, a cumbia radio, a frying
// pan, a metal workshop and the hum of a room. Each bed is `bed(id) -> Float32Array` (mono, SR Hz) that loops with no seam: noise beds are
// cross-faded head into tail (loopify), tonal beds are built from whole cycles so the wrap is mathematically continuous. Every bed is scaled to
// a common loudness (RMS), so the mixer's 0..1 gains mean the same thing for all of them. Deterministic: the seed is the bed's name.
import { SR, rng, hashSeed, buf, clamp, lerp, smoothstep, whiteNoise, pinkNoise, brownNoise, biquad, applyBiquad, lowpass, highpass, bandpass, sweepBandpass,
  normalizeRms, softclip, removeDC, fade, addTo, loopify, lfo, babble } from './dsp.js';

const TAU = Math.PI * 2;
export const BEDS = ['wind', 'traffic', 'crickets', 'murmur', 'children', 'court', 'tv', 'radio', 'sizzle', 'workshop', 'room'];

/** Cross-fade into a seamless loop, remove DC and set the loudness. */
const finish = (x, xf, level) => { const y = loopify(x, xf); removeDC(y); normalizeRms(y, level); return y; };
const scaled = (x, target) => normalizeRms(x, target, 10);          // a layer scaled to a stated RMS before mixing (no peak cap: the bed is capped at the end)
const at = (n, s) => Math.min(n - 1, Math.max(0, Math.round(s * SR)));
const midi = (m) => 440 * 2 ** ((m - 69) / 12);

// ---- voices: a talker's burst of vowel, used for shouts and laughter ----------------------------------------------------------------------
const VOW = { a: [850, 1500], e: [550, 1900], o: [520, 1000], eh: [700, 1400] };
function voiceBurst(dur, fa, fb, vow, jitter = 0.02) {
  const n = Math.round(dur * SR), src = new Float32Array(n); let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n, f = lerp(fa, fb, u) * (1 + jitter * Math.sin(TAU * 5.5 * i / SR));
    ph += f / SR; if (ph >= 1) ph -= 1; src[i] = 2 * ph - 1;
  }
  const a = bandpass(Float32Array.from(src), vow[0], 5), b = bandpass(src, vow[1], 7), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const u = i / n; out[i] = (a[i] + 0.55 * b[i]) * Math.min(1, u / 0.12) * Math.sin(Math.PI * Math.min(1, u * 0.5 + 0.5 * u * u)) ** 0.8; }
  return fade(out, 3, 12);
}
const laugh = (r, f0 = 380, pulses = 5, gap = 0.135) => {
  const out = new Float32Array(Math.round((pulses * gap + 0.2) * SR));
  for (let k = 0; k < pulses; k++) addTo(out, voiceBurst(0.085, f0 * (1 - 0.05 * k), f0 * (0.9 - 0.05 * k), VOW.a), Math.round(k * gap * SR * (1 + 0.1 * r.gauss())), 1 - 0.13 * k);
  return out;
};

// ---- wind --------------------------------------------------------------------------------------------------------------------------------
function wind() {
  const r = rng(hashSeed('bed:wind')), xf = 2, n = Math.round(24 * SR), g1 = lfo(n, r, 0.11), g2 = lfo(n, r, 0.4), gust = new Float32Array(n);
  for (let i = 0; i < n; i++) gust[i] = clamp(0.55 + 0.4 * g1[i] + 0.18 * g2[i], 0.05, 1);
  const low = scaled(highpass(lowpass(pinkNoise(n, r), 520), 60), 0.7), mid = scaled(sweepBandpass(whiteNoise(n, r), (t) => 320 + 800 * gust[at(n, t)], 0.7), 1.0);
  const air = scaled(highpass(lowpass(whiteNoise(n, r), 4200), 1800), 0.14);
  const whistle = scaled(sweepBandpass(whiteNoise(n, r), (t) => 1150 + 260 * Math.sin(TAU * t / 9.3) + 120 * Math.sin(TAU * t / 3.7), 28), 0.5);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const g = gust[i]; out[i] = low[i] * (0.4 + 0.6 * g) + mid[i] * g ** 1.5 + air[i] * g ** 3 + whistle[i] * 3 * Math.max(0, g - 0.72); }
  return finish(out, xf, 0.07);
}

// ---- traffic -----------------------------------------------------------------------------------------------------------------------------
/** One vehicle going by: engine harmonics that sink in pitch as it passes, tyre noise, a swell and a fade. kind 0 car, 1 bus / lorry (diesel chug). */
function passBy(dur, f0, kind, r) {
  const n = Math.round(dur * SR), eng = new Float32Array(n), env = new Float32Array(n); let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n, f = f0 * (1.07 - 0.14 * smoothstep(0.3, 0.8, u)) * (kind ? 0.55 : 1);
    ph += f / SR;
    let v = 0; for (let k = 1; k <= 7; k++) v += Math.sin(TAU * k * ph) / k ** 1.25;
    const chug = kind ? 0.65 + 0.35 * Math.sin(TAU * f * 0.5 * i / SR) : 1;
    eng[i] = v * chug; env[i] = Math.exp(-(((u - 0.46) / 0.23) ** 2));
  }
  lowpass(eng, kind ? 520 : 800);
  const tyre = sweepBandpass(whiteNoise(n, r), (t) => 950 - 380 * smoothstep(0.35, 0.85, t / dur), 0.9);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (eng[i] * 0.55 + tyre[i] * 0.5) * env[i];
  return fade(out, 30, 30);
}
function traffic() {
  const r = rng(hashSeed('bed:traffic')), len = 28, xf = 2.5, n = Math.round((len + xf) * SR), s1 = lfo(n, r, 0.17), s2 = lfo(n, r, 0.31);
  const base = scaled(highpass(lowpass(brownNoise(n, r), 260), 45), 1.0), tyre = scaled(bandpass(pinkNoise(n, r), 700, 0.5), 0.8), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = base[i] * (0.8 + 0.2 * s1[i]) + tyre[i] * (0.6 + 0.4 * s2[i]);
  for (const [t, dur, g, f, kind] of [[4.0, 5.0, 0.9, 82, 0], [9.5, 6.0, 0.8, 70, 1], [14.5, 3.8, 1.0, 96, 0], [19.0, 6.5, 0.9, 62, 1], [24.5, 4.4, 0.7, 78, 0]]) {
    const p = passBy(dur, f * (1 + 0.05 * r.gauss()), kind, r), e = scaled(p, 0.75 * g);
    addTo(out, e, Math.round(t * SR), 1);
  }
  return finish(out, xf, 0.07);
}

// ---- crickets (whole cycles: the loop is exact) ------------------------------------------------------------------------------------------
function crickets() {
  const L = 12, n = Math.round(L * SR), r = rng(hashSeed('bed:crickets')), out = new Float32Array(n);
  for (let k = 0; k < 8; k++) {
    const fc = Math.round(r.range(4200, 5600) * L) / L, chirps = r.int(26, 40), period = L / chirps, pulses = r.pick([3, 3, 4]), pulseHz = r.range(24, 34);
    const phase = r.range(0, period), amp = r.range(0.35, 1), dph = r.range(0, TAU), dcy = r.int(1, 3), fm = r.range(0.4, 1.2);
    for (let i = 0; i < n; i++) {
      const t = i / SR, tp = (((t + phase) % period) + period) % period * pulseHz;               // position in pulses since the chirp began
      if (tp >= pulses) continue;
      const u = tp % 1; if (u > 0.72) continue;
      const bump = Math.sin(Math.PI * u / 0.72) ** 2, swell = Math.sin(Math.PI * (tp + 0.25) / (pulses + 0.5)) ** 0.6;
      const a = amp * (1 + 0.3 * Math.sin(TAU * dcy * t / L + dph));
      out[i] += a * bump * swell * (Math.sin(TAU * fc * t) + 0.14 * Math.sin(TAU * 2 * fc * t) + fm * 0.05 * Math.sin(TAU * fc * 0.5 * t));
    }
  }
  return normalizeRms(removeDC(out), 0.05);
}

// ---- crowds ------------------------------------------------------------------------------------------------------------------------------
function murmur() {
  const xf = 2, len = 18, seed = hashSeed('bed:murmur');
  let x = babble({ sec: len + xf, voices: 8, f0: [95, 235], pause: [0.2, 1.4], rate: 0.85, breath: 0.15, seed });
  x = highpass(lowpass(x, 2600), 130);
  const y = Float32Array.from(x); addTo(y, x, Math.round(0.043 * SR), 0.28); addTo(y, x, Math.round(0.097 * SR), 0.18);
  return finish(y, xf, 0.055);
}
function children() {
  const xf = 1.5, len = 14, r = rng(hashSeed('bed:children')), n = Math.round((len + xf) * SR);
  let x = babble({ sec: len + xf, voices: 5, f0: [270, 440], pause: [0.05, 0.7], rate: 1.6, breath: 0.3, seed: hashSeed('children') });
  x = highpass(lowpass(x, 5200), 280); applyBiquad(x, biquad('peak', 2600, 0.8, 6)); scaled(x, 0.06);
  for (let k = 0; k < 4; k++) { const f = r.range(520, 700); addTo(x, scaled(voiceBurst(r.range(0.35, 0.6), f, f * r.range(1.2, 1.7), r.pick([VOW.a, VOW.e, VOW.eh])), 0.07), Math.round(r.range(xf, len - 0.8) * SR)); }
  for (let k = 0; k < 3; k++) addTo(x, scaled(laugh(r, r.range(340, 420)), 0.05), Math.round(r.range(xf, len - 1) * SR));
  return finish(x, xf, 0.055);
}
function bounce(out, t, r, g = 1, f = 95) {
  const k = new Float32Array(Math.round(0.18 * SR));
  for (let i = 0; i < k.length; i++) { const s = i / SR; k[i] = Math.sin(TAU * f * (1 - 0.2 * (1 - Math.exp(-s / 0.03))) * s) * Math.exp(-s / 0.045); }
  const nz = bandpass(whiteNoise(k.length, r), 800, 1.1); for (let i = 0; i < nz.length; i++) nz[i] *= Math.exp(-i / (0.011 * SR));
  addTo(out, k, Math.round(t * SR), 0.6 * g); addTo(out, nz, Math.round(t * SR), 0.95 * g);
}
function court() {
  const xf = 1.5, len = 14, r = rng(hashSeed('bed:court')), n = Math.round((len + xf) * SR), out = new Float32Array(n);
  let t = xf + 0.3;
  while (t < len - 1.2) {                                                          // a run of dribbles, then a shot, then a pause
    const runs = r.int(5, 9); for (let k = 0; k < runs && t < len - 1.2; k++) { bounce(out, t, r, 0.7 + 0.3 * r(), 90 + 12 * r.gauss()); t += 0.44 + 0.04 * r.gauss(); }
    if (t < len - 1.8) {
      const rim = new Float32Array(Math.round(0.6 * SR));
      for (const [f, tau, a] of [[1100, 0.30, 1], [1830, 0.20, 0.55], [2640, 0.12, 0.35]]) for (let i = 0; i < rim.length; i++) rim[i] += Math.sin(TAU * f * (1 + 0.004 * r.gauss()) * i / SR) * Math.exp(-i / (tau * SR)) * a;
      addTo(out, rim, Math.round((t + 0.12) * SR), 0.28); t += 0.25; bounce(out, t, r, 1, 80); t += r.range(1.0, 2.2);
    }
  }
  for (const s of [3.1, 8.7]) { const sq = sweepBandpass(whiteNoise(Math.round(0.09 * SR), r), (u) => 2300 - 600 * u / 0.09, 6); for (let i = 0; i < sq.length; i++) sq[i] *= Math.sin(Math.PI * i / sq.length); addTo(out, sq, Math.round(s * SR), 0.3); }
  let v = babble({ sec: len + xf, voices: 4, f0: [140, 420], pause: [0.1, 0.9], rate: 1.3, breath: 0.2, seed: hashSeed('court-voices') });
  v = highpass(lowpass(v, 4600), 220); scaled(v, 0.045);
  for (let k = 0; k < 3; k++) { const f = r.range(320, 560); addTo(v, scaled(voiceBurst(r.range(0.3, 0.5), f, f * 1.4, VOW.a), 0.06), Math.round(r.range(xf, len - 0.8) * SR)); }
  const ball = scaled(out, 0.07);
  for (let i = 0; i < n; i++) ball[i] += v[i];
  return finish(ball, xf, 0.06);
}

// ---- television, cumbia radio --------------------------------------------------------------------------------------------------------------
function tv() {
  const xf = 1.5, len = 14, r = rng(hashSeed('bed:tv')), n = Math.round((len + xf) * SR);
  const man = scaled(babble({ sec: len + xf, voices: 1, f0: [100, 128], pause: [0.25, 1.1], rate: 1.1, breath: 0.1, seed: hashSeed('tv-man') }), 0.06);
  const woman = scaled(babble({ sec: len + xf, voices: 1, f0: [190, 235], pause: [0.3, 1.3], rate: 1.2, breath: 0.1, seed: hashSeed('tv-woman') }), 0.045);
  const pad = new Float32Array(n);
  for (const f of [220, 277.2, 329.6]) for (let i = 0; i < n; i++) pad[i] += (Math.abs(((i / SR * f) % 1) * 4 - 2) - 1) * 0.5 * (0.6 + 0.4 * Math.sin(TAU * 0.13 * i / SR + f));
  scaled(pad, 0.012);
  const out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = man[i] + woman[i] + pad[i];
  for (const t of [4.3, 10.8]) {                                                   // studio audience
    const m = Math.round(1.2 * SR), cr = bandpass(whiteNoise(m, r), 1700, 0.7);
    for (let i = 0; i < m; i++) cr[i] *= Math.sin(Math.PI * i / m) ** 1.5 * (0.7 + 0.3 * Math.sin(TAU * 8 * i / SR));
    addTo(out, scaled(cr, 0.03), Math.round(t * SR));
  }
  applyBiquad(out, biquad('peak', 1600, 0.9, 5)); highpass(out, 180); lowpass(out, 4800);
  return finish(out, xf, 0.045);
}

function radio() {
  const bpm = 92, beat = 60 / bpm, bars = 4, len = bars * 4 * beat, n = Math.round(len * SR), r = rng(hashSeed('bed:radio')), out = new Float32Array(n);
  const put = (x, t, g = 1) => { const k = Math.round(t * SR); for (let i = 0; i < x.length; i++) out[(k + i) % n] += x[i] * g; };       // wraps around: the loop has no seam
  const drum = (f, tau, noise, len2 = 0.25) => { const m = Math.round(len2 * SR), x = new Float32Array(m), nz = highpass(whiteNoise(m, r), 700); for (let i = 0; i < m; i++) { const s = i / SR; x[i] = Math.sin(TAU * f * (1 - 0.25 * (1 - Math.exp(-s / 0.03))) * s) * Math.exp(-s / tau) + nz[i] * noise * Math.exp(-s / (tau * 0.4)); } return fade(x, 0.5, 10); };
  const bombo = drum(78, 0.11, 0.1), llamador = drum(150, 0.07, 0.05), alegre = drum(240, 0.06, 0.35, 0.18);
  const raspa = (acc) => { const m = Math.round(0.06 * SR), x = highpass(whiteNoise(m, r), 2600); for (let i = 0; i < m; i++) x[i] *= Math.exp(-i / (0.016 * SR)); return fade(x.map((v) => v * acc), 0.3, 6); };
  const reed = (hz, dur) => {                                                     // accordion: two detuned pulse waves through a formant
    const m = Math.round(dur * SR), x = new Float32Array(m); let p1 = 0, p2 = 0;
    for (let i = 0; i < m; i++) {
      const vib = 1 + 0.006 * Math.sin(TAU * 5.4 * i / SR); p1 += hz * vib / SR; p2 += hz * 1.0065 * vib / SR; p1 %= 1; p2 %= 1;
      x[i] = ((p1 < 0.32 ? 1 : -1) + (p2 < 0.45 ? 1 : -1) * 0.8) * Math.min(1, i / (0.012 * SR)) * Math.min(1, (m - i) / (0.03 * SR));
    }
    return applyBiquad(applyBiquad(x, biquad('bp', hz * 3, 0.6)), biquad('peak', 1500, 0.8, 6));
  };
  const bass = (hz, dur) => { const m = Math.round(dur * SR), x = new Float32Array(m); for (let i = 0; i < m; i++) { const s = i / SR; x[i] = (Math.sin(TAU * hz * s) + 0.35 * Math.sin(TAU * 2 * hz * s)) * Math.exp(-s / 0.22) * Math.min(1, i / 60); } return x; };
  const chords = [[45, 52], [38, 45], [40, 47], [45, 52]];                         // A minor, D minor, E, A minor: bass root and fifth (MIDI)
  const tune = [[64, 64, 67, 69, 67, 64, 62, 64], [65, 65, 69, 69, 67, 65, 64, 62], [64, 64, 68, 71, 68, 64, 62, 64], [69, 67, 64, 60, 62, 64, 69, 0]];
  for (let b = 0; b < bars; b++) {
    const t0 = b * 4 * beat;
    for (let s = 0; s < 16; s++) put(raspa(s % 2 === 0 ? 1 : 0.5), t0 + s * beat / 4, 0.32);
    for (const q of [0, 2]) put(bombo, t0 + q * beat, 0.8);
    for (const q of [1, 3]) put(llamador, t0 + q * beat, 0.6);
    for (const q of [0.5, 1.5, 2.5, 3.5]) put(alegre, t0 + q * beat, 0.35);
    const [root, fifth] = chords[b];
    for (const [q, m] of [[0, root], [1, fifth], [2, root], [3, fifth]]) put(bass(midi(m), beat * 0.9), t0 + q * beat, 0.9);
    tune[b].forEach((m, k) => { if (m) put(reed(midi(m), beat * 0.45), t0 + k * beat / 2, 0.5); });
  }
  const dry = Float32Array.from(out); softclip(dry, 2.4); highpass(dry, 240); applyBiquad(dry, biquad('peak', 1200, 0.9, 5)); lowpass(dry, 3500);   // a small speaker: no lows, a honk, no highs
  const hiss = highpass(whiteNoise(n, r), 1500); for (let i = 0; i < n; i++) dry[i] += hiss[i] * 0.01;
  return normalizeRms(removeDC(dry), 0.05);
}

// ---- kitchen, workshop, room ---------------------------------------------------------------------------------------------------------------
function sizzle() {
  const xf = 1.5, len = 8, r = rng(hashSeed('bed:sizzle')), n = Math.round((len + xf) * SR), wob = lfo(n, r, 0.8), out = new Float32Array(n);
  const hiss = scaled(highpass(whiteNoise(n, r), 2400), 0.5), pops = new Float32Array(n);
  for (let i = 0; i < n; i++) if (r() < (48 + 22 * wob[i]) / SR) pops[i] = (r() * 2 - 1) * (0.4 + 2.6 * r() ** 2);
  const pp = scaled(bandpass(pops, 3300, 1.2), 0.5);
  for (let i = 0; i < n; i++) out[i] = hiss[i] * (0.65 + 0.35 * wob[i]) + pp[i];
  return finish(out, xf, 0.05);
}
function clank(f, r) {
  const m = Math.round(0.6 * SR), x = new Float32Array(m);
  for (const [ratio, tau, a] of [[1, 0.30, 1], [2.76, 0.18, 0.6], [5.4, 0.10, 0.4], [8.9, 0.05, 0.25]]) for (let i = 0; i < m; i++) x[i] += Math.sin(TAU * f * ratio * (1 + 0.003 * r.gauss()) * i / SR) * Math.exp(-i / (tau * SR)) * a;
  const hit = bandpass(whiteNoise(Math.round(0.02 * SR), r), 3000, 1.2); for (let i = 0; i < hit.length; i++) x[i] += hit[i] * Math.exp(-i / (0.004 * SR)) * 1.2;
  return fade(x, 0.3, 40);
}
function workshop() {
  const xf = 1.5, len = 18, r = rng(hashSeed('bed:workshop')), n = Math.round((len + xf) * SR), out = new Float32Array(n);
  let t = xf + 0.6;
  while (t < len - 2.5) {
    const f = r.pick([780, 930, 1120, 1330]), hits = r.int(3, 6), gap = r.range(0.38, 0.55);
    for (let k = 0; k < hits; k++) { addTo(out, clank(f, r), Math.round((t + k * gap * (1 + 0.04 * r.gauss())) * SR), 0.7 - 0.05 * k); }
    t += hits * gap + r.range(1.4, 2.6);
  }
  const gl = Math.round(1.4 * SR), saw = new Float32Array(gl); let ph = 0;
  for (let i = 0; i < gl; i++) { ph += (190 + 25 * Math.sin(TAU * 0.9 * i / SR)) / SR; ph %= 1; saw[i] = (2 * ph - 1) * 0.6 + (r() * 2 - 1) * 0.5; }
  const gr = bandpass(saw, 2300, 1.6); for (let i = 0; i < gl; i++) gr[i] *= Math.min(1, i / (0.09 * SR)) * Math.min(1, (gl - i) / (0.25 * SR)) * (0.8 + 0.2 * Math.sin(TAU * 11 * i / SR));
  addTo(out, scaled(gr, 0.22), Math.round(8.2 * SR));
  const air = bandpass(whiteNoise(Math.round(0.4 * SR), r), 4200, 0.8); for (let i = 0; i < air.length; i++) air[i] *= Math.sin(Math.PI * i / air.length) ** 2;
  addTo(out, scaled(air, 0.1), Math.round(14.3 * SR));
  lowpass(out, 7500);
  return finish(out, xf, 0.055);
}
function room() {
  const L = 8, n = Math.round(L * SR), out = new Float32Array(n), r = rng(hashSeed('bed:room'));
  for (let i = 0; i < n; i++) { const t = i / SR; out[i] = (0.5 * Math.sin(TAU * 60 * t) + Math.sin(TAU * 120 * t + 0.6) + 0.5 * Math.sin(TAU * 180 * t + 1.4) + 0.6 * Math.sin(TAU * 240 * t + 2.1) + 0.25 * Math.sin(TAU * 360 * t + 0.3)) * (0.8 + 0.2 * Math.sin(TAU * t / L)); }
  const air = scaled(loopify(highpass(lowpass(pinkNoise(n + Math.round(1.5 * SR), r), 900), 120), 1.5), 0.45);     // loopify shortens by the fade: n samples again
  for (let i = 0; i < n; i++) out[i] += air[i];
  return normalizeRms(removeDC(out), 0.035);
}

const MAKERS = { wind, traffic, crickets, murmur, children, court, tv, radio, sizzle, workshop, room };
/** The loop for bed `id` (see BEDS). Cheap enough to call once per page load; callers cache it. */
export function bed(id) {
  const f = MAKERS[id]; if (!f) throw new Error('unknown bed ' + id);
  return f();
}
