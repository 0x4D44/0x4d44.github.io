// Tiny WebAudio building blocks shared by the SFX recipes, the engine voices and the offline tests.
// Pure functions of an (Offline)AudioContext: no DOM, so this module imports fine under node:test (it just is not run there).
import { mulberry32 } from '../util.js';

const FLOOR = 0.0001;
const libs = new WeakMap();

/** Shared per-context resources: noise buffers + a generated reverb impulse. Cached per context. */
export function getLib(c) {
  let lib = libs.get(c);
  if (lib) return lib;
  const sr = c.sampleRate, n = Math.floor(sr * 2);
  const rnd = mulberry32(0x5eed1234);
  const mk = () => c.createBuffer(1, n, sr);
  const white = mk(), pink = mk(), brown = mk();
  const w = white.getChannelData(0), p = pink.getChannelData(0), b = brown.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const x = rnd() * 2 - 1;
    w[i] = x;
    b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
    p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11; b6 = x * 0.115926;
    last = (last + 0.02 * x) / 1.02; b[i] = last * 3.5;
  }
  // wrap-around crossfade so the loops are click-free
  const fade = Math.floor(sr * 0.02);
  for (const buf of [white, pink, brown]) {
    const d = buf.getChannelData(0);
    for (let i = 0; i < fade; i++) { const a = i / fade; d[n - fade + i] = d[n - fade + i] * (1 - a) + d[i] * a; }
  }
  // reverb impulse: 1.6 s decaying stereo noise with a darkening tail
  const irLen = Math.floor(sr * 1.6), ir = c.createBuffer(2, irLen, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch); let lp = 0;
    for (let i = 0; i < irLen; i++) {
      const t = i / irLen, k = 0.55 - 0.45 * t;
      lp += k * ((rnd() * 2 - 1) - lp);
      d[i] = lp * Math.pow(1 - t, 2.6) * (i < sr * 0.004 ? i / (sr * 0.004) : 1);
    }
  }
  lib = { white, pink, brown, ir, reverbIn: null };
  libs.set(c, lib);
  return lib;
}

/** A recipe builder: collects every node it makes (for cleanup) and tracks when the sound ends. */
export class Rig {
  constructor(c, out, t0) { this.c = c; this.out = out; this.t0 = t0; this.end = t0; this.nodes = []; this.lib = getLib(c); }
  add(n) { this.nodes.push(n); return n; }
  gain(v = 1, dest = this.out) { const g = this.add(this.c.createGain()); g.gain.value = v; g.connect(dest); return g; }
  filter(type, f, q = 1, dest = this.out) { const n = this.add(this.c.createBiquadFilter()); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(dest); return n; }
  /** Optional reverb send (only when the engine installed the shared reverb on the context's lib). */
  send(node, amt) { if (this.lib.reverbIn && amt > 0) { const s = this.gain(amt, this.lib.reverbIn); node.connect(s); } }
  fin(t) { if (t > this.end) this.end = t; }
  get dur() { return this.end - this.t0; }
}

function env(g, T, att, peak, dur, hold = 0) {
  g.setValueAtTime(FLOOR, T);
  g.linearRampToValueAtTime(peak, T + Math.max(att, 0.001));
  if (hold > 0) g.setValueAtTime(peak, T + att + hold);
  g.exponentialRampToValueAtTime(FLOOR, T + dur);
}

/** Oscillator voice. f0->f1 exponential glide over dur. opts: type, t (offset from rig start), g, att, hold, wet, dest, lp (lowpass Hz), vib {rate,depth} */
export function tone(r, o) {
  const c = r.c, T = r.t0 + (o.t || 0), dur = o.dur, f0 = o.f0, f1 = o.f1 ?? f0;
  const osc = r.add(c.createOscillator()); osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(f0, T);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, T + dur);
  if (o.detune) osc.detune.value = o.detune;
  const g = r.add(c.createGain()); env(g.gain, T, o.att ?? 0.004, o.g ?? 0.3, dur, o.hold || 0);
  let tail = osc;
  if (o.lp) { const f = r.filter('lowpass', o.lp, 0.7, g); osc.connect(f); } else osc.connect(g);
  if (o.vib) {
    const l = r.add(c.createOscillator()); l.frequency.value = o.vib.rate; const lg = r.add(c.createGain()); lg.gain.value = o.vib.depth;
    l.connect(lg); lg.connect(osc.frequency); l.start(T); l.stop(T + dur + 0.05);
  }
  g.connect(o.dest || r.out);
  if (o.wet) r.send(g, o.wet);
  osc.start(T); osc.stop(T + dur + 0.03); r.fin(T + dur + 0.03);
  return g;
}

/** Filtered-noise voice. kind: white|pink|brown. ftype/f0->f1 sweep, q. */
export function noise(r, o) {
  const c = r.c, T = r.t0 + (o.t || 0), dur = o.dur;
  const src = r.add(c.createBufferSource()); src.buffer = r.lib[o.kind || 'white']; src.loop = true;
  const off = (o.off ?? Math.random()) * 1.5;
  const f = r.add(c.createBiquadFilter()); f.type = o.ftype || 'bandpass'; f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.f0 || 1000, T);
  if (o.f1 && o.f1 !== o.f0) {
    if (o.mid) { f.frequency.exponentialRampToValueAtTime(o.mid, T + dur * 0.45); }
    f.frequency.exponentialRampToValueAtTime(o.f1, T + dur);
  }
  const g = r.add(c.createGain()); env(g.gain, T, o.att ?? 0.004, o.g ?? 0.3, dur, o.hold || 0);
  src.connect(f); f.connect(g); g.connect(o.dest || r.out);
  if (o.wet) r.send(g, o.wet);
  src.start(T, off); src.stop(T + dur + 0.03); r.fin(T + dur + 0.03);
  return g;
}

/** Amplitude-modulate a gain param with a sine LFO (tremolo / buzz). */
export function lfo(r, target, rate, depth, T, dur, shape = 'sine') {
  const l = r.add(r.c.createOscillator()); l.type = shape; l.frequency.value = rate;
  const g = r.add(r.c.createGain()); g.gain.value = depth; l.connect(g); g.connect(target);
  l.start(T); l.stop(T + dur + 0.05); return l;
}

export const semis = (n) => Math.pow(2, n / 12);
export { FLOOR };
