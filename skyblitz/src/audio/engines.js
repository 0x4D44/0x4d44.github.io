// Continuous aircraft sounds: the player's engine (jet turbine / propeller), wind, boost roar, scrape, and the
// light positional engine used for nearby AI racers. All nodes are created once per voice and only their params move.
import { getLib } from './dsp.js';
import { clamp, lerp, mulberry32 } from '../util.js';

const rnd = mulberry32(0xe91e);   // seeded loop offsets: offline renders are deterministic (E-21)

// Per-craft voicing. kind 'jet' | 'prop'.
export const ENGINE_VOICES = {
  falcon:  { kind: 'jet',  whine: [900, 2700],  roar: 650,  rumble: 0.5, whineG: 0.05, burner: 0.8 },
  wasp:    { kind: 'jet',  whine: [1300, 3500], roar: 900,  rumble: 0.3, whineG: 0.06, burner: 0.6 },
  manta:   { kind: 'jet',  whine: [600, 1900],  roar: 520,  rumble: 0.6, whineG: 0.035, burner: 0.7 },
  comet:   { kind: 'jet',  whine: [1000, 3100], roar: 800,  rumble: 0.7, whineG: 0.055, burner: 1.0 },
  bulldog: { kind: 'prop', f: [46, 96],  detune: 0.025, bright: 800,  buzz: 0.6 },
  sprite:  { kind: 'prop', f: [68, 142], detune: 0.004, bright: 1500, buzz: 1.0 },
};
const FALLBACK = ENGINE_VOICES.falcon;
export const voiceFor = (racer) => ENGINE_VOICES[racer?.spec?.id] || ENGINE_VOICES[racer?.craftId] || FALLBACK;

function loopNoise(c, kind, lib) {
  const s = c.createBufferSource(); s.buffer = lib[kind]; s.loop = true; s.start(0, rnd() * 1.5); return s;
}
function osc(c, type, f) { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; }
const T = 0.07;   // param smoothing time constant (s)
const set = (p, v, now, k = T) => p.setTargetAtTime(v, now, k);

/** The player's full engine + wind + boost + scrape bed. Fed by update(state). */
export class PlayerEngine {
  constructor(c, dest, voice) {
    const lib = getLib(c);
    this.c = c; this.voice = voice; this.nodes = [];
    const n = (x) => { this.nodes.push(x); return x; };
    this.out = n(c.createGain()); this.out.gain.value = 0; this.out.connect(dest);
    const g = (v, d = this.out) => { const x = n(c.createGain()); x.gain.value = v; x.connect(d); return x; };
    const f = (type, fr, q, d) => { const x = n(c.createBiquadFilter()); x.type = type; x.frequency.value = fr; x.Q.value = q; x.connect(d); return x; };
    this.g = {};
    if (voice.kind === 'jet') {
      this.g.rumble = g(0); const lpR = f('lowpass', 170, 0.7, this.g.rumble); n(loopNoise(c, 'brown', lib)).connect(lpR);
      this.g.roar = g(0); this.fRoar = f('bandpass', voice.roar, 0.8, this.g.roar); n(loopNoise(c, 'pink', lib)).connect(this.fRoar);
      this.g.whine = g(0); this.fWhine = f('bandpass', voice.whine[0], 5, this.g.whine);
      this.oW1 = n(osc(c, 'sawtooth', voice.whine[0])); this.oW2 = n(osc(c, 'square', voice.whine[0] * 1.505));
      const w2 = g(0.35, this.fWhine); this.oW1.connect(this.fWhine); this.oW2.connect(w2);
      this.g.burner = g(0); this.fBurner = f('lowpass', 1400, 0.6, this.g.burner); n(loopNoise(c, 'white', lib)).connect(this.fBurner);
    } else {
      this.g.prop = g(0);
      this.fProp = f('lowpass', voice.bright, 0.9, this.g.prop);
      this.oP1 = n(osc(c, 'sawtooth', voice.f[0])); this.oP2 = n(osc(c, 'sawtooth', voice.f[0] * (1 + voice.detune)));
      this.oP3 = n(osc(c, 'square', voice.f[0] * 0.5));
      const g3 = g(0.18, this.fProp), g12 = g(0.35, this.fProp); this.oP1.connect(g12); this.oP2.connect(g12); this.oP3.connect(g3);
      // blade-pass flutter (amplitude chop that follows rpm)
      this.chop = n(osc(c, 'sine', 12)); const cg = g(0.05, this.g.prop.gain); this.chop.connect(cg);
      this.g.wash = g(0); const fw = f('bandpass', 420, 0.9, this.g.wash); n(loopNoise(c, 'pink', lib)).connect(fw);
      this.g.rumble = g(0); const lpR = f('lowpass', 130, 0.7, this.g.rumble); n(loopNoise(c, 'brown', lib)).connect(lpR);
    }
    // airflow
    this.g.wind = g(0); this.fWind = f('bandpass', 500, 0.6, this.g.wind); n(loopNoise(c, 'pink', lib)).connect(this.fWind);
    this.g.hiss = g(0); const fh = f('highpass', 4500, 0.5, this.g.hiss); n(loopNoise(c, 'white', lib)).connect(fh);
    // boost roar (pulsing) and scrape
    this.g.boost = g(0); this.fBoost = f('bandpass', 900, 0.9, this.g.boost); n(loopNoise(c, 'pink', lib)).connect(this.fBoost);
    this.boostLfo = n(osc(c, 'sine', 9)); const bl = g(0.3, this.g.boost.gain); this.boostLfo.connect(bl);
    this.g.scrape = g(0); const fs = f('bandpass', 2200, 2.5, this.g.scrape); n(loopNoise(c, 'white', lib)).connect(fs); this.fScrape = fs;
    this.level = 0;
  }
  /** s: { on, speedN 0..1.6, throttle 0..1, boost 0..1, g, airbrake 0..1, tumble bool, draft 0..1, scrape 0..1 } */
  update(s, now) {
    const v = this.voice, th = clamp(s.throttle, 0, 1), sp = clamp(s.speedN, 0, 1.6), G = clamp(Math.abs(s.g) / 6, 0, 1);
    set(this.out.gain, s.on ? 1 : 0, now, s.on ? 0.15 : 0.08);
    if (v.kind === 'jet') {
      const spool = clamp(0.25 + 0.55 * th + 0.45 * s.boost + 0.2 * sp, 0, 1.4);
      set(this.g.rumble.gain, (0.25 + 0.4 * th + 0.5 * s.boost) * v.rumble, now);
      set(this.g.roar.gain, (0.04 + 0.22 * spool * spool) * (1 - 0.3 * s.airbrake), now);
      set(this.fRoar.frequency, v.roar * (0.7 + 0.8 * spool), now);
      const wf = lerp(v.whine[0], v.whine[1], clamp(spool / 1.3, 0, 1));
      set(this.oW1.frequency, wf, now, 0.1); set(this.oW2.frequency, wf * 1.505, now, 0.1); set(this.fWhine.frequency, wf, now, 0.1);
      set(this.g.whine.gain, v.whineG * (0.4 + 1.2 * spool) * (s.tumble ? 0.4 : 1), now);
      set(this.g.burner.gain, v.burner * 0.2 * (s.boost > 0.05 ? 0.35 + 0.65 * s.boost : 0), now, 0.1);
      set(this.fBurner.frequency, 1200 + 1800 * s.boost, now);
    } else {
      const rpm = clamp(0.2 + 0.6 * th + 0.25 * s.boost + 0.1 * sp - 0.15 * s.airbrake, 0, 1.2);
      const f = lerp(v.f[0], v.f[1], clamp(rpm, 0, 1.15));
      set(this.oP1.frequency, f, now, 0.12); set(this.oP2.frequency, f * (1 + v.detune), now, 0.12); set(this.oP3.frequency, f * 0.5, now, 0.12);
      set(this.chop.frequency, f * 0.25, now, 0.12);
      set(this.g.prop.gain, 0.09 + 0.05 * rpm, now);
      set(this.fProp.frequency, v.bright * (0.7 + 0.7 * rpm + 0.4 * s.boost), now);
      set(this.g.wash.gain, (0.015 + 0.08 * rpm) * v.buzz, now);
      set(this.g.rumble.gain, 0.15 + 0.22 * rpm, now);
    }
    const w = sp * sp;
    set(this.g.wind.gain, 0.01 + 0.2 * w + 0.16 * s.draft, now);
    set(this.fWind.frequency, 350 + 1500 * sp + 600 * s.airbrake, now);
    set(this.g.hiss.gain, 0.01 + 0.07 * G * sp + 0.03 * s.airbrake + 0.025 * w, now);
    set(this.g.boost.gain, s.boost > 0.02 ? 0.04 + 0.2 * s.boost : 0, now, 0.08);
    set(this.fBoost.frequency, 700 + 900 * s.boost, now);
    set(this.g.scrape.gain, 0.22 * s.scrape, now, 0.04);
    set(this.fScrape.frequency, 1600 + 1400 * s.scrape + 600 * sp, now);
  }
  dispose() {
    try { this.out.disconnect(); } catch { /* gone */ }
    for (const n of this.nodes) { try { n.stop?.(); } catch { /* not started */ } try { n.disconnect(); } catch { /* gone */ } }
    this.nodes.length = 0;
  }
}

/** Light positional engine for an AI racer: panner + distance + Doppler. */
export class AIEngine {
  constructor(c, dest, lib) {
    this.c = c; this.nodes = []; this.racer = null; this.voice = FALLBACK;
    const n = (x) => { this.nodes.push(x); return x; };
    this.pan = n(c.createPanner()); const p = this.pan;
    p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 22; p.rolloffFactor = 1.35; p.maxDistance = 900;
    this.lp = n(c.createBiquadFilter()); this.lp.type = 'lowpass'; this.lp.frequency.value = 4000;
    this.out = n(c.createGain()); this.out.gain.value = 0;
    this.out.connect(this.lp); this.lp.connect(p); p.connect(dest);
    this.o1 = n(osc(c, 'sawtooth', 200)); this.o2 = n(osc(c, 'square', 301));
    this.fBody = n(c.createBiquadFilter()); this.fBody.type = 'lowpass'; this.fBody.frequency.value = 1200; this.fBody.connect(this.out);
    const g1 = n(c.createGain()); g1.gain.value = 0.16; this.o1.connect(g1); g1.connect(this.fBody);
    const g2 = n(c.createGain()); g2.gain.value = 0.05; this.o2.connect(g2); g2.connect(this.fBody);
    this.nz = n(loopNoise(c, 'pink', lib)); this.fN = n(c.createBiquadFilter()); this.fN.type = 'bandpass'; this.fN.Q.value = 0.8;
    const gn = n(c.createGain()); gn.gain.value = 0.22; this.nz.connect(this.fN); this.fN.connect(gn); gn.connect(this.out);
    this.fN.frequency.value = 700;
  }
  assign(racer) { this.racer = racer; this.voice = voiceFor(racer); }
  /** pos/vel: racer world values; lvel: listener velocity; doppler: pitch ratio; gain 0..1 */
  update(pos, doppler, gain, throttle, boost, now) {
    const v = this.voice, p = this.pan;
    if (p.positionX) { set(p.positionX, pos.x, now, 0.03); set(p.positionY, pos.y, now, 0.03); set(p.positionZ, pos.z, now, 0.03); }
    else p.setPosition(pos.x, pos.y, pos.z);
    let f1, f2;
    if (v.kind === 'jet') { f1 = lerp(120, 260, throttle) * 1.0; f2 = f1 * 1.5; }
    else { f1 = lerp(v.f[0], v.f[1], clamp(throttle * 0.9 + boost * 0.2, 0, 1.1)); f2 = f1 * 0.5; }
    set(this.o1.frequency, f1 * doppler, now, 0.05); set(this.o2.frequency, f2 * doppler, now, 0.05);
    set(this.fN.frequency, (v.kind === 'jet' ? 800 + 900 * throttle + 700 * boost : 500 + 400 * throttle) * doppler, now, 0.05);
    set(this.fBody.frequency, (v.kind === 'jet' ? 900 : 1400) * (1 + boost * 0.6), now, 0.1);
    set(this.out.gain, gain * (0.8 + 0.4 * boost), now, 0.1);
  }
  silence(now) { set(this.out.gain, 0, now, 0.08); }
  dispose() {
    for (const n of this.nodes) { try { n.stop?.(); } catch { /* not started */ } try { n.disconnect(); } catch { /* gone */ } }
    this.nodes.length = 0;
  }
}
