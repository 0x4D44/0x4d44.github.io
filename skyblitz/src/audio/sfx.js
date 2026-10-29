// Procedural one-shot SFX recipes (WebAudio only, no sample files).
// Every recipe: (c, out, t, o) -> { dur, nodes }. `o.p` = pitch multiplier, `o.vol` = level, `o.n` = chain index, `o.sev` = severity 0..1,
// `o.size` = explosion scale. Recipes are context-agnostic so tests can render them through an OfflineAudioContext.
import { Rig, tone, noise, lfo, semis } from './dsp.js';

const R = {};
const done = (r) => ({ dur: r.dur, nodes: r.nodes });
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
// Seed = hash(name) ^ o.seed: tests get identical renders, the game passes a changing o.seed for variation.
const def = (name, fn) => { const h = hash(name); R[name] = (c, out, t, o = {}) => { const r = new Rig(c, out, t, h ^ (o.seed | 0)); fn(r, o); return done(r); }; };

// ---------------------------------------------------------------- UI
def('uiHover', (r, o) => { tone(r, { f0: 1900 * (o.p || 1), f1: 2300, dur: 0.05, g: 0.12 }); });
def('uiClick', (r, o) => {
  tone(r, { type: 'triangle', f0: 880, f1: 660, dur: 0.07, g: 0.3 });
  noise(r, { ftype: 'highpass', f0: 4000, dur: 0.02, g: 0.12 });
});
def('uiConfirm', (r) => {
  [0, 4, 7, 12].forEach((s, i) => tone(r, { type: 'triangle', f0: 523 * semis(s), t: i * 0.055, dur: 0.18, g: 0.26, wet: 0.2 }));
});
def('uiBack', (r) => { tone(r, { type: 'triangle', f0: 740, f1: 440, dur: 0.11, g: 0.28 }); });
def('uiError', (r) => { for (let i = 0; i < 2; i++) tone(r, { type: 'square', f0: 190, f1: 170, t: i * 0.11, dur: 0.09, g: 0.16, lp: 900 }); });

// ---------------------------------------------------------------- race flow
def('countBeep', (r, o) => {
  const p = o.p || 1;
  tone(r, { type: 'sine', f0: 440 * p, dur: 0.3, g: 0.4, hold: 0.08 });
  tone(r, { type: 'square', f0: 440 * p, dur: 0.28, g: 0.08, lp: 1800 });
});
def('goBeep', (r) => {
  [0, 7, 12].forEach((s) => tone(r, { type: 'sawtooth', f0: 880 * semis(s), dur: 0.85, g: 0.15, hold: 0.25, lp: 3200, wet: 0.25 }));
  noise(r, { ftype: 'bandpass', f0: 400, f1: 5000, q: 0.8, dur: 0.6, g: 0.18, att: 0.03 });
});
def('lap', (r) => {
  [0, 4, 7, 12, 16].forEach((s, i) => {
    tone(r, { type: 'triangle', f0: 659 * semis(s), t: i * 0.075, dur: 0.38, g: 0.22, wet: 0.35 });
    tone(r, { type: 'sine', f0: 1318 * semis(s), t: i * 0.075, dur: 0.25, g: 0.07 });
  });
});
def('finalLap', (r) => {
  for (let i = 0; i < 3; i++) {
    tone(r, { type: 'sawtooth', f0: 740, t: i * 0.42, dur: 0.18, g: 0.2, lp: 2200 });
    tone(r, { type: 'sawtooth', f0: 988, t: i * 0.42 + 0.19, dur: 0.2, g: 0.2, lp: 2600 });
  }
  noise(r, { ftype: 'bandpass', f0: 300, f1: 4000, dur: 0.9, g: 0.12, att: 0.4 });
  [0, 7, 12].forEach((s) => tone(r, { type: 'triangle', f0: 523 * semis(s), t: 1.25, dur: 0.7, g: 0.16, wet: 0.4 }));
});
def('rocket', (r, o) => {
  noise(r, { ftype: 'bandpass', f0: 250, f1: 3500, q: 0.7, dur: 0.9, g: 0.4, att: 0.04 });
  tone(r, { type: 'sine', f0: 140, f1: 45, dur: 0.5, g: 0.45 });
  if (o.perfect) [0, 7, 12, 19].forEach((s, i) => tone(r, { type: 'triangle', f0: 880 * semis(s), t: 0.05 + i * 0.05, dur: 0.4, g: 0.12, wet: 0.4 }));
});
def('overtake', (r) => {
  noise(r, { ftype: 'bandpass', f0: 500, f1: 2600, q: 1.2, dur: 0.28, g: 0.14, att: 0.06 });
  tone(r, { type: 'sine', f0: 600, f1: 900, dur: 0.18, g: 0.12 });
});
def('passed', (r) => { tone(r, { type: 'sine', f0: 380, f1: 270, dur: 0.18, g: 0.14 }); });
def('wrongWay', (r) => {
  for (let i = 0; i < 2; i++) {
    tone(r, { type: 'square', f0: 620, t: i * 0.3, dur: 0.14, g: 0.15, lp: 2000 });
    tone(r, { type: 'square', f0: 440, t: i * 0.3 + 0.15, dur: 0.14, g: 0.15, lp: 2000 });
  }
});
def('respawn', (r) => {
  noise(r, { ftype: 'bandpass', f0: 300, f1: 3500, dur: 0.6, g: 0.22, att: 0.2 });
  [0, 5, 9, 14].forEach((s, i) => tone(r, { f0: 784 * semis(s), t: 0.1 + i * 0.06, dur: 0.3, g: 0.12, wet: 0.4 }));
});
def('winJingle', (r) => {
  [[0, 0], [4, 0.14], [7, 0.28], [12, 0.42], [16, 0.7], [19, 0.7], [24, 0.7]].forEach(([s, t]) => {
    tone(r, { type: 'sawtooth', f0: 523 * semis(s), t, dur: t >= 0.7 ? 1.4 : 0.3, g: 0.1, lp: 3000, wet: 0.4 });
  });
});
def('loseJingle', (r) => {
  [[7, 0], [5, 0.22], [3, 0.44], [0, 0.66]].forEach(([s, t]) => tone(r, { type: 'triangle', f0: 392 * semis(s), t, dur: 0.5, g: 0.2, wet: 0.4 }));
});

// ---------------------------------------------------------------- pickups, gates, stunts
def('orb', (r) => {
  tone(r, { f0: 700, f1: 1500, dur: 0.22, g: 0.25 });
  tone(r, { type: 'triangle', f0: 2100, f1: 3100, t: 0.07, dur: 0.18, g: 0.1, wet: 0.3 });
  noise(r, { ftype: 'highpass', f0: 6000, dur: 0.12, g: 0.07, att: 0.02 });
});
def('itemReady', (r) => { [1568, 2093].forEach((f, i) => tone(r, { f0: f, t: i * 0.07, dur: 0.22, g: 0.15, wet: 0.3 })); });
// pentatonic climb along a gate chain
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
def('gate', (r, o) => {
  const f = 740 * semis(PENTA[Math.min(PENTA.length - 1, o.n || 0)]);
  tone(r, { f0: f, dur: 0.38, g: 0.26, wet: 0.25 });
  tone(r, { f0: f * 2.76, dur: 0.16, g: 0.07 });
  tone(r, { type: 'triangle', f0: f * 2, dur: 0.22, g: 0.1 });
});
def('gatePerfect', (r, o) => {
  const f = 740 * semis(PENTA[Math.min(PENTA.length - 1, o.n || 0)]);
  tone(r, { f0: f, dur: 0.5, g: 0.24, wet: 0.35 });
  tone(r, { f0: f * 1.5, dur: 0.45, g: 0.14, wet: 0.35 });
  tone(r, { f0: f * 2.76, dur: 0.2, g: 0.07 });
  for (let i = 0; i < 4; i++) tone(r, { f0: 3000 + i * 650, t: 0.04 + i * 0.045, dur: 0.14, g: 0.08, wet: 0.5 });
  noise(r, { ftype: 'highpass', f0: 7000, dur: 0.3, g: 0.07, att: 0.05 });
});
def('boostIgnite', (r) => {
  noise(r, { ftype: 'bandpass', f0: 250, f1: 3200, q: 0.7, dur: 0.7, g: 0.4, att: 0.02 });
  tone(r, { type: 'sawtooth', f0: 70, f1: 150, dur: 0.6, g: 0.22, lp: 500 });
  tone(r, { f0: 120, f1: 40, dur: 0.35, g: 0.4 });
  tone(r, { f0: 600, f1: 1800, dur: 0.3, g: 0.07, wet: 0.3 });
});
def('ringBoost', (r) => {
  tone(r, { f0: 500, f1: 2400, dur: 0.35, g: 0.18, wet: 0.3 });
  noise(r, { ftype: 'bandpass', f0: 600, f1: 4000, dur: 0.45, g: 0.22, att: 0.05 });
});
def('rollWhoosh', (r, o) => {
  noise(r, { ftype: 'bandpass', f0: 500 * (o.p || 1), mid: 2400, f1: 600, q: 1.3, dur: 0.6, g: 0.3, att: 0.12, kind: 'pink' });
  tone(r, { f0: 350, f1: 700, dur: 0.6, g: 0.05 });
});
def('loopWhoosh', (r) => {
  noise(r, { ftype: 'bandpass', f0: 250, mid: 1300, f1: 280, q: 1.0, dur: 1.1, g: 0.32, att: 0.25, kind: 'pink' });
  tone(r, { f0: 180, mid: 0, f1: 420, dur: 1.1, g: 0.08, att: 0.3, hold: 0.2 });
});
def('stunt', (r) => {
  [0, 7].forEach((s, i) => tone(r, { f0: 1047 * semis(s), t: i * 0.07, dur: 0.3, g: 0.14, wet: 0.35 }));
});
def('nearMiss', (r) => {
  noise(r, { ftype: 'bandpass', f0: 1800, f1: 500, q: 1.5, dur: 0.28, g: 0.28, att: 0.05 });
  tone(r, { f0: 900, f1: 450, dur: 0.22, g: 0.05 });
});
def('shortcut', (r) => {
  noise(r, { ftype: 'bandpass', f0: 300, f1: 3500, dur: 0.7, g: 0.25, att: 0.15 });
  tone(r, { f0: 400, f1: 1600, dur: 0.5, g: 0.12, wet: 0.3 });
});

// ---------------------------------------------------------------- weapons and hazards
def('missileLaunch', (r, o) => {
  tone(r, { f0: 160, f1: 50, dur: 0.18, g: 0.35 });
  noise(r, { ftype: 'highpass', f0: 2500, dur: 0.12, g: 0.2 });
  noise(r, { ftype: 'bandpass', f0: 500, mid: 2200, f1: 900, q: 0.8, dur: 1.0, g: 0.3, att: 0.05, kind: 'pink' });
  tone(r, { type: 'sawtooth', f0: 110, f1: 70, dur: 0.8, g: 0.06, lp: 600 });
});
def('lockTick', (r, o) => { tone(r, { f0: 1500 * (o.p || 1), dur: 0.05, g: 0.2 }); });
def('lockSolid', (r) => { tone(r, { f0: 2000, dur: 0.3, g: 0.2, hold: 0.15 }); tone(r, { f0: 3000, dur: 0.2, g: 0.05 }); });
def('warnBeep', (r, o) => {
  const p = o.p || 1;
  tone(r, { type: 'square', f0: 1000 * p, dur: 0.08, g: 0.16, lp: 3500 });
  tone(r, { type: 'square', f0: 1500 * p, t: 0.09, dur: 0.08, g: 0.13, lp: 3500 });
});
def('evade', (r) => {
  noise(r, { ftype: 'bandpass', f0: 3200, f1: 500, q: 1.2, dur: 0.35, g: 0.28, att: 0.04 });
  tone(r, { f0: 900, f1: 400, dur: 0.3, g: 0.06 });
});
def('explosion', (r, o) => {
  const s = o.size ?? 1, L = 0.55 + 0.9 * s;
  tone(r, { f0: 95, f1: 26, dur: 0.5 + 0.7 * s, g: 0.42 * (0.6 + 0.4 * s), att: 0.006 });
  noise(r, { kind: 'pink', ftype: 'lowpass', f0: 3600, f1: 160, q: 0.5, dur: L, g: 0.32, att: 0.004, wet: 0.35 });
  noise(r, { ftype: 'bandpass', f0: 2200, f1: 900, q: 0.8, dur: 0.09, g: 0.2, att: 0.001 });
  noise(r, { kind: 'brown', ftype: 'lowpass', f0: 220, f1: 60, dur: L * 1.7, g: 0.28, att: 0.04, wet: 0.2 });
  for (let i = 0; i < 4 + Math.floor(4 * s); i++) noise(r, { ftype: 'highpass', f0: 3000 + i * 400, t: 0.12 + r.rnd() * 0.5 * s, dur: 0.03, g: 0.08, att: 0.002 });
});
def('mineDrop', (r) => { tone(r, { f0: 520, f1: 260, dur: 0.12, g: 0.22 }); noise(r, { ftype: 'highpass', f0: 3000, dur: 0.03, g: 0.1 }); });
def('mineBlast', (r) => {
  tone(r, { f0: 120, f1: 35, dur: 0.5, g: 0.38 });
  noise(r, { kind: 'pink', ftype: 'lowpass', f0: 3000, f1: 200, dur: 0.6, g: 0.28, att: 0.003, wet: 0.25 });
  for (let i = 0; i < 9; i++) noise(r, { ftype: 'bandpass', f0: 1500 + r.rnd() * 3500, q: 3, t: i * 0.035 + r.rnd() * 0.03, dur: 0.05, g: 0.13, att: 0.002 });
});
def('emp', (r) => {
  const g = tone(r, { type: 'sawtooth', f0: 1400, f1: 55, dur: 1.0, g: 0.08, lp: 3500, wet: 0.3 });
  lfo(r, g.gain, 38, 0.04, r.t0, 1.0, 'square');
  noise(r, { ftype: 'bandpass', f0: 5000, f1: 300, q: 2, dur: 0.9, g: 0.11, att: 0.01 });
  for (let i = 0; i < 6; i++) noise(r, { ftype: 'highpass', f0: 4000, q: 0.5, t: 0.05 + i * 0.08, dur: 0.025, g: 0.07, att: 0.001 });
  tone(r, { f0: 70, f1: 30, dur: 0.5, g: 0.17 });
});
def('lightning', (r) => {
  noise(r, { ftype: 'highpass', f0: 2000, dur: 0.12, g: 0.3, att: 0.001 });
  noise(r, { ftype: 'bandpass', f0: 3000, f1: 300, q: 0.6, dur: 0.5, g: 0.3, att: 0.002 });
  tone(r, { f0: 110, f1: 40, dur: 0.4, g: 0.35 });
  // thunder rolls in a beat later
  noise(r, { kind: 'brown', ftype: 'lowpass', f0: 380, f1: 55, q: 0.5, t: 0.22, dur: 2.6, g: 0.42, att: 0.15, wet: 0.5 });
});
def('smoke', (r) => {
  noise(r, { kind: 'pink', ftype: 'bandpass', f0: 1800, f1: 450, q: 0.7, dur: 0.75, g: 0.22, att: 0.02 });
  tone(r, { f0: 200, f1: 100, dur: 0.2, g: 0.15 });
});
def('droneLaunch', (r) => {
  tone(r, { type: 'sawtooth', f0: 180, f1: 560, dur: 0.7, g: 0.1, lp: 1800, vib: { rate: 22, depth: 18 } });
  noise(r, { ftype: 'bandpass', f0: 800, f1: 2500, dur: 0.5, g: 0.12, att: 0.1 });
  tone(r, { f0: 150, f1: 60, dur: 0.15, g: 0.25 });
});
def('shieldUp', (r) => {
  [0, 0.07, -0.07].forEach((d) => tone(r, { f0: 320, f1: 960, detune: d * 100, dur: 0.6, g: 0.1, att: 0.1, wet: 0.35 }));
  noise(r, { ftype: 'bandpass', f0: 1000, f1: 5000, q: 2, dur: 0.5, g: 0.1, att: 0.15 });
});
def('shieldBlock', (r) => {
  [800, 1330, 2170, 3050].forEach((f, i) => tone(r, { f0: f, dur: 0.6 - i * 0.1, g: 0.14 / (1 + i * 0.4), wet: 0.35 }));
  noise(r, { ftype: 'highpass', f0: 3000, dur: 0.08, g: 0.3, att: 0.001 });
  tone(r, { f0: 140, f1: 60, dur: 0.2, g: 0.3 });
});
def('shieldDown', (r) => {
  tone(r, { f0: 900, f1: 180, dur: 0.5, g: 0.15, wet: 0.3 });
  noise(r, { ftype: 'bandpass', f0: 3000, f1: 400, dur: 0.4, g: 0.1 });
});
def('cannon', (r, o) => {
  const p = o.p || 1;
  tone(r, { f0: 2000 * p, f1: 280 * p, dur: 0.1, g: 0.22, att: 0.001 });
  noise(r, { ftype: 'bandpass', f0: 3200, q: 1, dur: 0.045, g: 0.16, att: 0.001 });
  tone(r, { type: 'square', f0: 110, f1: 70, dur: 0.07, g: 0.1, lp: 400 });
});
def('cannonHit', (r, o) => {
  noise(r, { ftype: 'highpass', f0: 5000, dur: 0.05, g: 0.2, att: 0.001 });
  tone(r, { f0: 2300 * (o.p || 1), f1: 1100, dur: 0.07, g: 0.1 });
});
def('overheat', (r) => {
  noise(r, { ftype: 'highpass', f0: 3200, f1: 1500, dur: 0.7, g: 0.2, att: 0.02 });
  [0, 0.18].forEach((t) => tone(r, { type: 'square', f0: 900, f1: 400, t, dur: 0.12, g: 0.1, lp: 2500 }));
});

// ---------------------------------------------------------------- damage
def('hitThump', (r, o) => {
  const s = 0.4 + 0.6 * (o.sev ?? 0.5);
  tone(r, { f0: 140, f1: 38, dur: 0.15 + 0.3 * s, g: 0.5 * s, att: 0.003 });
  noise(r, { ftype: 'lowpass', f0: 900, f1: 200, dur: 0.12 + 0.2 * s, g: 0.35 * s, att: 0.002 });
  noise(r, { ftype: 'bandpass', f0: 2500, q: 2, dur: 0.06, g: 0.12 * s, att: 0.001 });
});
def('stall', (r) => {
  const g = tone(r, { type: 'sawtooth', f0: 150, f1: 120, dur: 0.5, g: 0.18, lp: 700, hold: 0.25 });
  lfo(r, g.gain, 22, 0.1, r.t0, 0.5, 'square');
});
def('recover', (r) => {
  tone(r, { f0: 500, f1: 1000, dur: 0.15, g: 0.15 });
  tone(r, { f0: 1500, t: 0.1, dur: 0.18, g: 0.1, wet: 0.3 });
});
/** Tumble siren: wails for o.dur seconds. */
def('tumble', (r, o) => {
  const d = Math.min(2.6, o.dur || 1.6);
  const osc = r.add(r.c.createOscillator()); osc.type = 'sawtooth';
  const base = r.gain(0.0001), lp = r.filter('lowpass', 1500, 0.8, base);
  osc.connect(lp);
  const T = r.t0;
  osc.frequency.setValueAtTime(520, T);
  for (let i = 0; i * 0.33 < d; i++) {
    osc.frequency.linearRampToValueAtTime(900, T + i * 0.33 + 0.16);
    osc.frequency.linearRampToValueAtTime(480, T + i * 0.33 + 0.33);
  }
  base.gain.setValueAtTime(0.0001, T); base.gain.linearRampToValueAtTime(0.16, T + 0.05);
  base.gain.setValueAtTime(0.16, T + d - 0.12); base.gain.exponentialRampToValueAtTime(0.0001, T + d);
  osc.start(T); osc.stop(T + d + 0.03); r.fin(T + d + 0.03);
  noise(r, { ftype: 'lowpass', f0: 600, f1: 150, dur: d, g: 0.15, att: 0.05 });
});

// ---------------------------------------------------------------- feedback cues (V-20, V-37, P-14)
/** Storm cast for its user: a charging zap-rise, then a muffled distant thunder roll. */
def('stormCast', (r) => {
  tone(r, { type: 'sawtooth', f0: 220, f1: 1800, dur: 0.35, g: 0.1, lp: 2600, att: 0.05, wet: 0.3 });
  noise(r, { ftype: 'highpass', f0: 3500, dur: 0.1, t: 0.33, g: 0.22, att: 0.001 });
  noise(r, { kind: 'brown', ftype: 'lowpass', f0: 320, f1: 50, q: 0.5, t: 0.5, dur: 2.2, g: 0.4, att: 0.2, wet: 0.5 });
});
/** Distant thunder (the Storm user hearing a strike land far away). */
def('thunderFar', (r) => {
  noise(r, { kind: 'brown', ftype: 'lowpass', f0: 260, f1: 45, q: 0.5, dur: 2.4, g: 0.38, att: 0.25, wet: 0.55 });
  tone(r, { f0: 70, f1: 32, dur: 1.2, g: 0.18, att: 0.1 });
});
/** Soft tone while a rival is locking on to the player: o.p rises with lock progress. */
def('beingLocked', (r, o) => {
  tone(r, { f0: 640 * (o.p || 1), dur: 0.12, g: 0.13, att: 0.01 });
  tone(r, { f0: 960 * (o.p || 1), t: 0.001, dur: 0.1, g: 0.05, att: 0.01 });
});
/** "ROLL NOW": distinct rising triple chirp, only when the barrel roll can still evade the missile. */
def('rollNow', (r) => {
  [0, 0.09, 0.18].forEach((t, i) => tone(r, { type: 'triangle', f0: 1200 * semis(i * 4), t, dur: 0.09, g: 0.2, att: 0.004, wet: 0.2 }));
  tone(r, { type: 'square', f0: 2400, t: 0.27, dur: 0.16, g: 0.07, lp: 4000 });
});
/** Tiny tick for camera change / look-back. */
def('camTick', (r, o) => { tone(r, { type: 'triangle', f0: 1500 * (o.p || 1), f1: 1100 * (o.p || 1), dur: 0.035, g: 0.2, att: 0.002 }); });

export const SFX = R;
export const SFX_NAMES = Object.keys(R);
