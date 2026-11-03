// Cab, door and platform audio (WebAudio) + PA via speechSynthesis. Everything guarded; starts after a user gesture.
//  - The running sound (motor, rumble, squeal, brake hiss) is synthesised continuously from the sim state: update().
//  - The doors - opening with its chime, closing with its warning beeps - are real recordings (SAMPLES: a train's doors, CC BY 4.0, credited in models/credits.json), each cut to
//    the sim's 2.6 s door travel so sound and leaves stay in step. They are fetched and decoded after the first gesture; until then - or for good, if a file is missing or this
//    browser cannot decode it, or the page is opened with ?sfx=synth - synthesised versions of the same two sounds play (synthDoorOpen / synthDoorClose), so the doors are never
//    silent. Both go through one per-event chain (level, stereo position, muffling), so a train down the platform sounds like it is down the platform.

const AUDIO_DIR = typeof import.meta !== 'undefined' && import.meta.url ? new URL('../../audio/', import.meta.url).href : 'audio/';
/** the recorded sounds: name ('doorOpen' | 'doorClose') -> { file under glasgow-subway/audio/ (built by tools/make_door_audio.sh), gain (level trim: the files are peak-normalised, this sets them
 *  level with the synthesised stand-ins), credit (its name in models/credits.json) }. A recording must run for the door travel, 2.6 s. */
export const SAMPLES = {
  doorOpen: { file: 'door-open.mp3', gain: 0.32, credit: 'London Underground 1995 Stock train doors opening' },
  doorClose: { file: 'door-close.mp3', gain: 0.4, credit: 'London Underground 1995 Stock train doors closing' },
};
/** ?sfx=synth: use the synthesised door sounds only (to compare, or when the recordings are unwanted) */
const SYNTH_ONLY = typeof location !== 'undefined' && /[?&]sfx=synth(&|$)/.test(location.search || '');

const REACH_REF = 4;   // metres within which a sound arrives at full level
/** how a sound made `dist` metres from the listener arrives: its level (1 = as recorded) and the cutoff (Hz) of the low-pass that muffles it - 0 = none. Inverse distance with a
 *  little extra absorption (it is a tunnel full of people and tiles), and the highs go first. */
export function reach(dist) {
  const d = Math.max(0, dist || 0);
  if (d <= REACH_REF) return { gain: 1, lp: 0 };
  return { gain: Math.pow(REACH_REF / d, 1.3), lp: Math.max(900, 16000 / (1 + (d - REACH_REF) / 12)) };
}
/** stereo position -1 (left) .. 1 (right) of a source at offset (dx, dz) from a listener whose right-hand vector is (rx, rz); centred when it is on top of you */
export function panOf(dx, dz, rx, rz) {
  const d = Math.hypot(dx, dz); if (d < 0.5) return 0;
  return Math.max(-1, Math.min(1, ((dx * rx + dz * rz) / d) * 0.85 * Math.min(1, d / 3)));
}

// ---- synthesised sound parts (BaseAudioContext, destination node, start time) - also render offline for the tests (renderSynth)
const NOISE = new WeakMap();
function noiseBuf(c) {
  let b = NOISE.get(c);
  if (!b) { b = c.createBuffer(1, Math.floor(c.sampleRate * 2), c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; NOISE.set(c, b); }
  return b;
}
/** a puff of filtered noise: o = { dur, type, f, f2 (glide to), q, gain, a (attack s) } */
function burst(c, out, t, o) {
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), a = Math.min(o.a == null ? 0.01 : o.a, o.dur * 0.5);
  s.buffer = noiseBuf(c); s.loop = true; f.type = o.type || 'bandpass'; f.Q.value = o.q == null ? 0.7 : o.q;
  f.frequency.setValueAtTime(o.f, t); if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.gain, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * 1.2); s.stop(t + o.dur + 0.03);
}
/** a dull thump: a sine that falls in pitch and dies quickly, with a bit of body: o = { f, f2, dur, gain } */
function knock(c, out, t, o) {
  const os = c.createOscillator(), g = c.createGain(); os.type = 'sine';
  os.frequency.setValueAtTime(o.f, t); os.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  os.connect(g); g.connect(out); os.start(t); os.stop(t + o.dur + 0.02);
  burst(c, out, t, { dur: Math.min(0.06, o.dur), type: 'lowpass', f: 900, q: 0.7, gain: o.gain * 0.5, a: 0.002 });
}
/** one beep of the warning sounder: a near-square tone (odd harmonics), hard-edged: o = { f, dur, gain } */
function beep(c, out, t, o) {
  const g = c.createGain(), d = o.dur; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.gain, t + 0.004); g.gain.setValueAtTime(o.gain, t + d - 0.012); g.gain.linearRampToValueAtTime(0.0001, t + d);
  for (const [k, a] of [[1, 1], [3, 0.3], [5, 0.15]]) { const os = c.createOscillator(), og = c.createGain(); os.type = 'sine'; os.frequency.value = o.f * k; og.gain.value = a / 1.45; os.connect(og); og.connect(g); os.start(t); os.stop(t + d + 0.02); }
  g.connect(out);
}
/** a door motor: a sawtooth that rises as the leaves pick up speed and falls as they stop: o = { dur, f0, f1, gain } */
function whirr(c, out, t, o) {
  const os = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain(); os.type = 'sawtooth'; lp.type = 'lowpass'; lp.frequency.value = 900;
  os.frequency.setValueAtTime(o.f0, t); os.frequency.linearRampToValueAtTime(o.f1, t + o.dur * 0.4); os.frequency.linearRampToValueAtTime(o.f0 * 0.8, t + o.dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.gain, t + 0.2); g.gain.setValueAtTime(o.gain, t + Math.max(0.2, o.dur - 0.25)); g.gain.linearRampToValueAtTime(0.0001, t + o.dur);
  os.connect(lp); lp.connect(g); g.connect(out); os.start(t); os.stop(t + o.dur + 0.02);
}
export const BEEP_HZ = 2100, BEEP_EVERY = 0.25, BEEP_LEN = 0.12;   // the closing warning: pitch, spacing and length of a beep
export const DOOR_SECS = 2.6;   // how long the leaves take (the sim's DOOR_TIME): the door sounds are cut to this
/** the leaves running on their rollers: low, rumbly noise chattering at the track joints, swelling as they pick up speed and dying as they stop: o = { dur, gain, f, rate } */
function rolling(c, out, t, o) {
  const s = c.createBufferSource(), lp = c.createBiquadFilter(), am = c.createGain(), g = c.createGain(), lfo = c.createOscillator(), d = c.createGain();
  s.buffer = noiseBuf(c); s.loop = true; lp.type = 'lowpass'; lp.frequency.value = o.f || 380; lp.Q.value = 0.7;
  am.gain.value = 0.65; lfo.type = 'triangle'; lfo.frequency.value = o.rate || 11; d.gain.value = 0.35; lfo.connect(d); d.connect(am.gain);   // 0.65 +- 0.35, never negative
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.gain, t + 0.3); g.gain.setValueAtTime(o.gain, t + Math.max(0.3, o.dur - 0.35)); g.gain.linearRampToValueAtTime(0.0001, t + o.dur);
  s.connect(lp); lp.connect(am); am.connect(g); g.connect(out); s.start(t, Math.random() * 1.2); s.stop(t + o.dur + 0.03); lfo.start(t); lfo.stop(t + o.dur + 0.03);
}
/** doors opening: the lock lets go, air rushes into the cylinders and the leaves run back on their rollers with the motor spooling up and down, then the cylinders
 *  exhaust and the leaves meet their rubber end-stops */
export function synthDoorOpen(c, out, t, dur = DOOR_SECS) {
  burst(c, out, t, { dur: 0.03, type: 'highpass', f: 2500, gain: 0.18, a: 0.002 });                                   // lock clack
  knock(c, out, t + 0.015, { f: 150, f2: 70, dur: 0.1, gain: 0.25 });
  burst(c, out, t + 0.07, { dur: 0.5, type: 'bandpass', f: 3400, f2: 2200, q: 0.6, gain: 0.2, a: 0.04 });          // air in
  rolling(c, out, t + 0.1, { dur: dur - 0.35, gain: 0.2, f: 360, rate: 11 });
  burst(c, out, t + 0.5, { dur: dur - 1.0, type: 'bandpass', f: 2600, f2: 1800, q: 0.5, gain: 0.05, a: 0.4 });       // seals and leaves brushing
  whirr(c, out, t + 0.12, { dur: dur - 0.5, f0: 150, f1: 320, gain: 0.035 });
  burst(c, out, t + dur - 0.4, { dur: 0.3, type: 'bandpass', f: 2500, q: 0.6, gain: 0.13, a: 0.05 });              // exhaust
  knock(c, out, t + dur - 0.12, { f: 115, f2: 50, dur: 0.2, gain: 0.5 });                                          // end stops
  burst(c, out, t + dur - 0.12, { dur: 0.06, type: 'bandpass', f: 1400, q: 1, gain: 0.12, a: 0.002 });
}
/** doors closing: the warning sounder beeps all the way while the leaves slide shut, then they meet, the seals bite and the lock drops in */
export function synthDoorClose(c, out, t, dur = DOOR_SECS) {
  const n = Math.max(1, Math.floor((dur - 0.2) / BEEP_EVERY));
  for (let i = 0; i < n; i++) beep(c, out, t + i * BEEP_EVERY, { f: BEEP_HZ, dur: BEEP_LEN, gain: 0.2 });
  burst(c, out, t + 0.05, { dur: 0.4, type: 'bandpass', f: 3000, f2: 2000, q: 0.6, gain: 0.12, a: 0.04 });         // air in
  rolling(c, out, t + 0.1, { dur: dur - 0.4, gain: 0.2, f: 340, rate: 10 });
  burst(c, out, t + 0.4, { dur: dur - 1.0, type: 'bandpass', f: 2400, f2: 1600, q: 0.5, gain: 0.05, a: 0.4 });
  whirr(c, out, t + 0.1, { dur: dur - 0.5, f0: 140, f1: 290, gain: 0.03 });
  knock(c, out, t + dur - 0.14, { f: 105, f2: 45, dur: 0.24, gain: 0.55 });                                        // the leaves meet, the seals compress
  burst(c, out, t + dur - 0.14, { dur: 0.2, type: 'bandpass', f: 2200, q: 0.6, gain: 0.1, a: 0.01 });              // exhaust
  burst(c, out, t + dur + 0.0, { dur: 0.03, type: 'highpass', f: 2500, gain: 0.15, a: 0.002 });                    // lock drops in
  knock(c, out, t + dur + 0.0, { f: 190, f2: 110, dur: 0.08, gain: 0.2 });
}
/** the station PA's two-tone bell that comes before an announcement */
export function synthBong(c, out, t) {
  [[659.3, 0], [523.3, 0.42]].forEach(([f, dt]) => {
    for (const [k, a, d] of [[1, 1, 1.1], [2.01, 0.28, 0.6], [3.02, 0.1, 0.35]]) {
      const os = c.createOscillator(), g = c.createGain(), t0 = t + dt; os.type = 'sine'; os.frequency.value = f * k;
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.13 * a, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      os.connect(g); g.connect(out); os.start(t0); os.stop(t0 + d + 0.02);
    }
  });
}
/** test/analysis helper: one of the synthesised sounds rendered offline - mono Float32Array at `sr`, the sound starting 0.05 s in */
export async function renderSynth(kind, secs = 3.4, sr = 22050) {
  const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext, c = new OC(1, Math.ceil(secs * sr), sr), m = c.createGain(); m.connect(c.destination);
  ({ doorOpen: synthDoorOpen, doorClose: synthDoorClose, bong: synthBong })[kind](c, m, 0.05);
  return (await c.startRendering()).getChannelData(0);
}

export class SimAudio {
  constructor() { this.ctx = null; this.muted = false; this.ok = typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext); this.speechOn = typeof window !== 'undefined' && 'speechSynthesis' in window; this.vol = 0.8; this.started = false; this.hidden = false; this.blocked = 0;
    this.buf = {}; this.loadErr = {}; this.plays = {}; this.last = null; this.cut = 0; this._voice = new WeakMap(); this._speakT = 0; this._attachVisibility(); }
  /** All sound goes silent immediately while the tab is hidden / page backgrounded (and stays silent until it returns); the manual mute flag is kept. */
  _attachVisibility() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    this._vis = () => this.setHidden(!!document.hidden || document.visibilityState === 'hidden');
    this._pagehide = () => this.setHidden(true);
    this._blur = () => setTimeout(() => { if (document.hidden) this.setHidden(true); }, 0);
    document.addEventListener('visibilitychange', this._vis); window.addEventListener('pagehide', this._pagehide); window.addEventListener('pageshow', this._vis); window.addEventListener('blur', this._blur); document.addEventListener('freeze', this._pagehide);
    this.hidden = !!document.hidden;
  }
  setHidden(h) {
    h = !!h; if (this.hidden === h && !(h && this.ctx && this.ctx.state === 'running')) return; this.hidden = h;
    if (h) {
      if (this._speakT) { clearTimeout(this._speakT); this._speakT = 0; }
      if (this.speechOn) try { speechSynthesis.cancel(); } catch (e) {}
      if (this.master && this.ctx) try { this.master.gain.cancelScheduledValues(this.ctx.currentTime); this.master.gain.value = 0; } catch (e) {}
      if (this.ctx && this.ctx.state === 'running') try { this.ctx.suspend(); } catch (e) {}
      if (typeof document !== 'undefined') for (const a of document.querySelectorAll('audio,video')) try { if (!a.paused) { a.dataset.simPaused = '1'; a.pause(); } } catch (e) {}
    } else {
      if (this.master && this.ctx) try { this.master.gain.value = this.muted ? 0 : this.vol; } catch (e) {}
      if (this.ctx && this.ctx.state === 'suspended' && this.started) try { this.ctx.resume(); } catch (e) {}
      if (typeof document !== 'undefined') for (const a of document.querySelectorAll('audio[data-sim-paused]')) try { delete a.dataset.simPaused; a.play(); } catch (e) {}
    }
  }
  state() {
    return { hidden: this.hidden, muted: this.muted, ctx: this.ctx ? this.ctx.state : 'none', gain: this.master ? this.master.gain.value : null, speaking: this.speechOn ? !!(speechSynthesis.speaking || speechSynthesis.pending) : false, blocked: this.blocked,
      samples: Object.fromEntries(Object.keys(SAMPLES).map((k) => [k, !!this.buf[k]])), loadErr: Object.assign({}, this.loadErr), plays: Object.assign({}, this.plays), cut: this.cut, last: this.last };
  }
  /** fetch + decode the recorded sounds (once, after the first gesture); a file that fails leaves its synthesised stand-in in place */
  async _loadSamples() {
    const c = this.ctx; if (!c || this._loading || SYNTH_ONLY) return; this._loading = true;
    await Promise.all(Object.entries(SAMPLES).map(async ([name, s]) => {
      try {
        const r = await fetch(AUDIO_DIR + s.file); if (!r.ok) throw new Error('HTTP ' + r.status);
        const ab = await r.arrayBuffer();
        const buf = await new Promise((res, rej) => { const p = c.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(() => {}); });
        if (this.ctx === c) this.buf[name] = buf;
      } catch (e) { this.loadErr[name] = String(e && e.message || e); }
    }));
  }
  async start() {
    if (this.hidden) return;
    if (!this.ok || this.started) { if (this.ctx && this.ctx.state === 'suspended') try { await this.ctx.resume(); } catch (e) {} return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : this.vol; this.master.connect(c.destination);
      const noise = noiseBuf(c);
      const mkNoise = () => { const s = c.createBufferSource(); s.buffer = noise; s.loop = true; s.start(); return s; };
      // motor whine
      this.m1 = c.createOscillator(); this.m1.type = 'sawtooth'; this.m2 = c.createOscillator(); this.m2.type = 'square';
      this.mLP = c.createBiquadFilter(); this.mLP.type = 'lowpass'; this.mLP.frequency.value = 700; this.mG = c.createGain(); this.mG.gain.value = 0;
      this.m1.connect(this.mLP); this.m2.connect(this.mLP); this.mLP.connect(this.mG); this.mG.connect(this.master); this.m1.start(); this.m2.start();
      // rumble
      this.rN = mkNoise(); this.rLP = c.createBiquadFilter(); this.rLP.type = 'lowpass'; this.rLP.frequency.value = 180; this.rG = c.createGain(); this.rG.gain.value = 0;
      this.rN.connect(this.rLP); this.rLP.connect(this.rG); this.rG.connect(this.master);
      // squeal
      this.sN = mkNoise(); this.sBP = c.createBiquadFilter(); this.sBP.type = 'bandpass'; this.sBP.frequency.value = 2600; this.sBP.Q.value = 14; this.sG = c.createGain(); this.sG.gain.value = 0;
      this.sN.connect(this.sBP); this.sBP.connect(this.sG); this.sG.connect(this.master);
      // brake hiss
      this.hN = mkNoise(); this.hHP = c.createBiquadFilter(); this.hHP.type = 'highpass'; this.hHP.frequency.value = 3500; this.hG = c.createGain(); this.hG.gain.value = 0;
      this.hN.connect(this.hHP); this.hHP.connect(this.hG); this.hG.connect(this.master);
      this.started = true; this._lastBrake = 0;
      this._loadSamples();
    } catch (e) { this.ok = false; }
  }
  setMuted(m) { this.muted = m; if (this.master && !this.hidden) this.master.gain.setTargetAtTime(m ? 0 : this.vol, this.ctx.currentTime, 0.05); if (m && this.speechOn) try { speechSynthesis.cancel(); } catch (e) {} }
  /** st: { v (m/s), traction 0..1, brake 0..1, curv (1/m), inCab (bool), inTrain, doorsOpen } */
  update(st) {
    if (!this.started || !this.ctx || this.hidden) return; const t = this.ctx.currentTime, v = st.v || 0;
    const inside = st.inTrain ? 1 : 0.25;
    const f = 70 + v * 15 + st.traction * 40;
    this.m1.frequency.setTargetAtTime(f, t, 0.1); this.m2.frequency.setTargetAtTime(f * 1.505, t, 0.1);
    this.mG.gain.setTargetAtTime(Math.min(0.07, v * 0.006 + st.traction * 0.035) * inside * (st.doorsOpen ? 0.5 : 1), t, 0.12);
    this.rLP.frequency.setTargetAtTime(120 + v * 22, t, 0.2); this.rG.gain.setTargetAtTime(Math.min(0.5, v * 0.028) * inside, t, 0.2);
    const sq = Math.min(1, Math.abs(st.curv || 0) * 130) * Math.min(1, v / 8) * 0.12 + (st.brake > 0.2 && v < 6 && v > 0.4 ? 0.07 * st.brake : 0);
    this.sBP.frequency.setTargetAtTime(2300 + v * 60, t, 0.2); this.sG.gain.setTargetAtTime(sq * inside, t, 0.15);
    const rel = Math.max(0, this._lastBrake - st.brake); this._lastBrake = st.brake;
    this.hG.gain.setTargetAtTime(Math.min(0.18, rel * 6 + (st.brake > 0.1 ? st.brake * 0.02 : 0)) * inside, t, 0.05);
  }
  /** a per-event output chain: level -> (muffling low-pass) -> (stereo position) -> master. o = { gain, lp (Hz, 0 = none), pan }. Returns the node to feed. */
  _chain(o = {}) {
    const c = this.ctx, g = c.createGain(); g.gain.value = o.gain == null ? 1 : o.gain; let tail = g;
    if (o.lp > 0) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = 0.5; tail.connect(f); tail = f; }
    if (o.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); tail.connect(p); tail = p; }
    tail.connect(this.master); return g;
  }
  /** the doors opening (open = true) or closing with its warning beeps, 2.6 s either way, as heard with o = { gain, pan, lp, key } (see reach() / panOf(); key = the train's object,
   *  so that a reversal cuts the sound that is still running). Returns whether it played. */
  doors(open, o = {}) {
    if (this.hidden) { this.blocked++; return false; }
    if (!this.started || !this.ctx || !this.master || this.muted) return false;
    const gain = o.gain == null ? 1 : o.gain; if (gain < 0.015) return false;   // too far away to hear
    const name = open ? 'doorOpen' : 'doorClose', c = this.ctx, t = c.currentTime + 0.03, out = this._chain({ gain, pan: o.pan, lp: o.lp }), buf = this.buf[name];
    if (o.key && typeof o.key === 'object') {   // one voice per train: a door sound that is still running when the same train's doors reverse is cut short, not left to talk over the new one
      const prev = this._voice.get(o.key); if (prev && prev.end > c.currentTime) { try { prev.g.gain.setTargetAtTime(0, c.currentTime, 0.02); } catch (e) {} this.cut++; }
      this._voice.set(o.key, { g: out, end: t + DOOR_SECS + 0.1 });
    }
    if (buf) { const s = c.createBufferSource(), g = c.createGain(); s.buffer = buf; g.gain.value = SAMPLES[name].gain; s.connect(g); g.connect(out); s.start(t); }
    else (open ? synthDoorOpen : synthDoorClose)(c, out, t);
    this.plays[name] = (this.plays[name] || 0) + 1; this.last = { name, via: buf ? 'sample' : 'synth', gain: +gain.toFixed(3), pan: +(o.pan || 0).toFixed(2), lp: Math.round(o.lp || 0) };
    return true;
  }
  chime(kind = 'door') {
    if (kind === 'door' || kind === 'close') return this.doors(kind === 'door');   // (the old two-tone chimes: callers that still ask for them get the door sounds)
    if (this.hidden) { this.blocked++; return; }
    if (!this.started || !this.ctx) return; const c = this.ctx, t = c.currentTime;
    const seq = { vigil: [1200, 1200, 1200], trip: [300, 220, 300, 220], ok: [660, 990] }[kind] || [880];
    seq.forEach((fr, i) => {
      const o = c.createOscillator(), g = c.createGain(); o.type = kind === 'trip' || kind === 'vigil' ? 'square' : 'sine'; o.frequency.value = fr;
      g.gain.setValueAtTime(0, t + i * 0.22); g.gain.linearRampToValueAtTime(0.18, t + i * 0.22 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.22 + 0.2);
      o.connect(g); g.connect(this.master); o.start(t + i * 0.22); o.stop(t + i * 0.22 + 0.25);
    });
  }
  /** a rat's squeak: two quick, high chirps (vol 0..1, by distance) */
  squeak(vol = 0.5) {
    if (this.hidden) { this.blocked++; return; }
    if (!this.started || !this.ctx || !this.master) return; const c = this.ctx, t = c.currentTime;
    for (let i = 0; i < 2; i++) {
      const o = c.createOscillator(), g = c.createGain(), f = 3300 + Math.random() * 900, t0 = t + i * 0.11;
      o.type = 'sine'; o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f * 1.35, t0 + 0.05); o.frequency.exponentialRampToValueAtTime(f * 0.8, t0 + 0.09);
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.05 * Math.max(0.1, Math.min(1, vol)), t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.09);
      o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + 0.1);
    }
  }
  /** the station PA's two-tone bell */
  bong() {
    if (this.hidden) { this.blocked++; return false; }
    if (!this.started || !this.ctx || !this.master || this.muted) return false;
    const c = this.ctx; synthBong(c, this._chain({ gain: 0.9 }), c.currentTime + 0.03); this.plays.bong = (this.plays.bong || 0) + 1; return true;
  }
  /** an announcement: the PA bell, then the voice a moment later (dropped if the tab is hidden or muted in between) */
  speak(text) {
    if (this.hidden) { this.blocked++; return; }
    if (this.muted || !this.speechOn || !this.started) return;
    try { speechSynthesis.cancel(); } catch (e) {}
    if (this._speakT) clearTimeout(this._speakT);
    this.bong();
    this._speakT = setTimeout(() => {
      this._speakT = 0; if (this.hidden || this.muted) return;
      try { const u = new SpeechSynthesisUtterance(text); u.lang = 'en-GB'; u.rate = 0.95; u.volume = 0.8; speechSynthesis.speak(u); } catch (e) {}
    }, 950);
  }
  dispose() { try { if (this._vis) { document.removeEventListener('visibilitychange', this._vis); window.removeEventListener('pagehide', this._pagehide); window.removeEventListener('pageshow', this._vis); window.removeEventListener('blur', this._blur); document.removeEventListener('freeze', this._pagehide); this._vis = null; } } catch (e) {}
    if (this._speakT) { clearTimeout(this._speakT); this._speakT = 0; }
    try { if (this.ctx) this.ctx.close(); if (this.speechOn) speechSynthesis.cancel(); } catch (e) {} this.started = false; }
}
