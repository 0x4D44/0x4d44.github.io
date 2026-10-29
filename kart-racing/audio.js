// Apex Karts audio: pure WebAudio synthesis. Master chain with per-bus gains, glue compressor + limiter,
// procedural reverb send, a gear-shifting kart engine, positional AI engine voices, tyre/wind/gravel beds
// and enveloped SFX. Music is delegated to music.js (MusicEngine), loaded dynamically and optional.
// Every entry point is safe when AudioContext is unavailable or blocked.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const MAX_VOICES = 44;
// ---- bagpipe tune (original, A mixolydian, 6/8 jig feel). Tokens: pitch letter + length in eighths. g=low G, A=low A, B, C=C#, D, E, F=F#, G=high G, a=high A.
const PIPE_HZ = { g: 392, A: 440, B: 493.9, C: 554.4, D: 587.3, E: 659.3, F: 740, G: 784, a: 880 };
const PIPE_EIGHTH = 0.178;
const PIPE_SCORE = [
  "A2 C1 E2 C1 | E1 a2 E1 C2 | D2 F1 a2 F1 | E2 B1 A3",
  "A2 C1 E2 C1 | E1 a2 E1 C2 | D2 F1 a2 F1 | B2 g1 A3",
  "a3 G1 a1 G1 | F2 E1 F2 D1 | E3 C1 E1 F1 | E2 D1 C2 B1",
  "a3 G1 a1 G1 | F2 E1 D2 C1 | B2 C1 D1 C1 B1 | A5 g1",
];
let _pipeEv = null;
function PIPE_TUNE() {
  if (_pipeEv) return _pipeEv;
  const out = []; let prev = null;
  for (const line of PIPE_SCORE) for (const bar of line.split("|")) {
    bar.trim().split(/\s+/).forEach((tok, i) => {
      const f = PIPE_HZ[tok[0]], n = parseFloat(tok.slice(1)); let dur = n * PIPE_EIGHTH;
      const accent = i === 0;
      // gracenote: on a repeated pitch, on bar downbeats, and before long notes (high G above F#, otherwise a low-E flick)
      let grace = 0;
      if (prev === f || (accent && prev !== null) || n >= 3) grace = f >= PIPE_HZ.G ? PIPE_HZ.E : PIPE_HZ.G;
      if (grace === f) grace = 0;
      if (grace) dur = Math.max(0.05, dur);
      out.push({ f, dur, grace, acc: accent });
      prev = f;
    });
  }
  return (_pipeEv = out);
}
const MIN_GAP = { bump: 0.06, wall: 0.08, hit: 0.1, "item-roll": 0.02, "ui-move": 0.03, "drift-level": 0.05, throw: 0.05 };

function driveCurve(k, n = 1024) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); }
  return c;
}
function crushCurve(steps, n = 1024) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.round(x * steps) / steps; }
  return c;
}

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.vol = { volume: 0.8, music: 0.6, sfx: 0.8 };
    this.engine = null;
    this.listener = null;
    this.voices = 0;
    this._last = {};
    this._music = null;
    this._musicWant = null;
    this._musicFailed = false;
    this._intensity = 0.4;
    this._eState = { rpm: 0.3, gear: 0, sf: 0, load: 0.3, boost: false, burbleCool: 0, last: 0, shift: 0 };
    this._others = new Map();
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC({ latencyHint: "interactive" });
      this._build(ctx);
    } catch (e) {
      this.ctx = null;
    }
  }

  /** Build the master graph on any BaseAudioContext (also used by the offline test harness). */
  _build(ctx) {
    this.ctx = ctx;
    const g = () => ctx.createGain();
    this.sfxBus = g(); this.engineBus = g(); this.uiBus = g(); this.musicBus = g(); this.duck = g();
    this.reverbIn = g(); this.reverbOut = g();
    this.pre = g();
    this.glue = ctx.createDynamicsCompressor();
    this.glue.threshold.value = -16; this.glue.knee.value = 12; this.glue.ratio.value = 3.5;
    this.glue.attack.value = 0.008; this.glue.release.value = 0.18;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2; this.limiter.knee.value = 0; this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002; this.limiter.release.value = 0.09;
    this.master = g();
    this.musicBus.connect(this.duck); this.duck.connect(this.pre);
    this.sfxBus.connect(this.pre); this.engineBus.connect(this.pre); this.uiBus.connect(this.pre);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.1);
    this.reverbIn.connect(this.reverb); this.reverb.connect(this.reverbOut); this.reverbOut.gain.value = 0.55;
    this.reverbOut.connect(this.pre);
    this.pre.connect(this.glue); this.glue.connect(this.limiter); this.limiter.connect(this.master);
    this.master.connect(ctx.destination);
    this._noiseBuf = this._makeNoise();
    this._shaper = driveCurve(3);
    this._crush = crushCurve(14);
    this.setVolumes(this.vol);
  }

  _makeNoise() {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * 2);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; lp += (w - lp) * 0.9; d[i] = lp; }
    return b;
  }

  _impulse(sec) {
    const ctx = this.ctx, sr = ctx.sampleRate, len = Math.floor(sr * sec), pre = Math.floor(sr * 0.012);
    const b = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / sr;
        const w = Math.random() * 2 - 1;
        lp += (w - lp) * (0.55 - 0.4 * Math.min(1, t / sec)); // darker tail
        d[i] = lp * Math.exp(-t * 3.4) * (1 - Math.exp(-t * 90));
      }
    }
    return b;
  }

  unlock() {
    if (!this.ctx || !this.ctx.resume) return;
    try { if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {}); } catch (e) { /* ignore */ }
  }

  setVolumes(v) {
    if (v) this.vol = { ...this.vol, ...v };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = (p, x) => p.setTargetAtTime(x, t, 0.02);
    s(this.master.gain, this.vol.volume);
    s(this.sfxBus.gain, this.vol.sfx);
    s(this.engineBus.gain, this.vol.sfx * 0.6);
    s(this.uiBus.gain, this.vol.sfx);
    s(this.musicBus.gain, this.vol.music * 0.7);
  }

  get ready() { return !!this.ctx && this.ctx.state === "running"; }
  setListener(kart) { this.listener = kart; }

  /** Temporarily lower the music (countdown beeps, fanfares). */
  duckMusic(level = 0.45, hold = 1.0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setTargetAtTime(level, t, 0.04);
    this.duck.gain.setTargetAtTime(1, t + hold, 0.35);
  }

  // ------------------------------------------------------------------ voice plumbing
  _dest(bus, pan = 0, send = 0, nodes) {
    const ctx = this.ctx;
    let head;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); p.connect(bus); head = p; nodes.push(p);
    } else head = bus;
    if (send > 0) {
      const s = ctx.createGain(); s.gain.value = send; s.connect(this.reverbIn); nodes.push(s);
      const tap = ctx.createGain(); nodes.push(tap); tap.connect(head); tap.connect(s);
      return tap;
    }
    return head;
  }

  _finish(src, nodes) {
    this.voices++;
    src.onended = () => {
      this.voices--;
      for (const n of nodes) { try { n.disconnect(); } catch (e) { /* ignore */ } }
    };
  }

  _env(g, t0, dur, vol, a = 0.005, d = dur * 0.25, s = 0.7, r = Math.min(0.1, dur * 0.4)) {
    const p = g.gain;
    a = Math.min(a, dur * 0.5); r = Math.min(r, dur * 0.6); d = Math.min(d, Math.max(0.001, dur - a - r));
    p.setValueAtTime(0, t0);
    p.linearRampToValueAtTime(vol, t0 + a);
    const sl = Math.max(1e-4, vol * s);
    p.exponentialRampToValueAtTime(sl, t0 + a + d);
    p.setValueAtTime(sl, t0 + dur - r);
    p.exponentialRampToValueAtTime(1e-4, t0 + dur);
    p.linearRampToValueAtTime(0, t0 + dur + 0.004);
  }

  /** Oscillator voice. o: type f0 f1 dur vol a d s r delay pan send bus filt{type,f0,f1,q} shape vib{f,depth} detune */
  _tone(o) {
    if (this.voices > MAX_VOICES && !o.force) return;
    const ctx = this.ctx, t0 = ctx.currentTime + (o.delay || 0), dur = o.dur, nodes = [];
    const osc = ctx.createOscillator(); nodes.push(osc);
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(10, o.f1), t0 + dur);
    if (o.detune) osc.detune.value = o.detune;
    if (o.vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = o.vib.f; lg.gain.value = o.vib.depth; l.connect(lg); lg.connect(osc.frequency);
      l.start(t0); l.stop(t0 + dur + 0.02); nodes.push(l, lg);
    }
    let n = osc;
    if (o.shape) { const w = ctx.createWaveShaper(); w.curve = o.shape; n.connect(w); n = w; nodes.push(w); }
    if (o.filt) n = this._filter(n, o.filt, t0, dur, nodes);
    const g = ctx.createGain(); nodes.push(g);
    n.connect(g);
    g.connect(this._dest(o.bus || this.sfxBus, o.pan, o.send, nodes));
    this._env(g, t0, dur, o.vol, o.a, o.d, o.s, o.r);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
    this._finish(osc, nodes);
  }

  _filter(n, f, t0, dur, nodes) {
    const bq = this.ctx.createBiquadFilter(); nodes.push(bq);
    bq.type = f.type; bq.Q.value = f.q || 1;
    bq.frequency.setValueAtTime(f.f0, t0);
    if (f.f1) bq.frequency.exponentialRampToValueAtTime(Math.max(20, f.f1), t0 + dur);
    n.connect(bq);
    return bq;
  }

  /** Noise voice. o: dur vol a d s r delay pan send bus filt{...} filt2 */
  _noise(o) {
    if (this.voices > MAX_VOICES && !o.force) return;
    const ctx = this.ctx, t0 = ctx.currentTime + (o.delay || 0), dur = o.dur, nodes = [];
    const src = ctx.createBufferSource(); nodes.push(src);
    src.buffer = this._noiseBuf; src.loop = true;
    let n = src;
    if (o.filt) n = this._filter(n, o.filt, t0, dur, nodes);
    if (o.filt2) n = this._filter(n, o.filt2, t0, dur, nodes);
    const g = ctx.createGain(); nodes.push(g);
    n.connect(g);
    g.connect(this._dest(o.bus || this.sfxBus, o.pan, o.send, nodes));
    this._env(g, t0, dur, o.vol, o.a, o.d, o.s, o.r);
    src.start(t0, Math.random() * 1.5); src.stop(t0 + dur + 0.02);
    this._finish(src, nodes);
  }

  // ------------------------------------------------------------------ SFX
  /** Fire-and-forget by name. opts.kart (optional) positions the sound relative to the listener kart. */
  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    const gap = MIN_GAP[name];
    if (gap && this._last[name] && now - this._last[name] < gap) return;
    this._last[name] = now;
    try { this._play(name, opts); } catch (e) { /* never break the game for audio */ }
  }

  /** Distance attenuation + pan for sounds caused by another kart. Returns null to skip. */
  _spatial(o, personal) {
    const k = o.kart, L = this.listener;
    if (!k || !L || k === L) return { gain: 1, pan: 0 };
    if (personal) return null;
    const dx = k.position.x - L.position.x, dz = k.position.z - L.position.z;
    const d = Math.hypot(dx, dz);
    const rx = -Math.cos(L.heading), rz = Math.sin(L.heading);
    return { gain: 1 / (1 + d / 18) * (d < 120 ? 1 : 0), pan: clamp((dx * rx + dz * rz) / Math.max(8, d), -1, 1) * 0.8 };
  }

  _play(name, o) {
    const U = this.uiBus;
    switch (name) {
      // ---- UI ----
      case "ui-move":
        this._tone({ type: "sine", f0: 820, f1: 1000, dur: 0.06, vol: 0.3, a: 0.003, bus: U });
        this._tone({ type: "triangle", f0: 1640, dur: 0.03, vol: 0.04, a: 0.002, bus: U });
        break;
      case "ui-select":
        this._tone({ type: "sine", f0: 620, dur: 0.1, vol: 0.2, a: 0.004, bus: U, send: 0.12 });
        this._tone({ type: "triangle", f0: 930, dur: 0.16, vol: 0.18, a: 0.004, delay: 0.06, bus: U, send: 0.2 });
        this._tone({ type: "sine", f0: 1860, dur: 0.12, vol: 0.05, delay: 0.06, bus: U });
        break;
      case "ui-back":
        this._tone({ type: "sine", f0: 560, f1: 380, dur: 0.12, vol: 0.18, a: 0.004, bus: U, send: 0.1 });
        this._tone({ type: "triangle", f0: 280, f1: 190, dur: 0.12, vol: 0.1, bus: U });
        break;
      // ---- race flow ----
      case "countdown": case "beep": {
        this.duckMusic(0.5, 0.6);
        const go = o.go || o.label === "GO!" || o.label === "GO";
        if (go) {
          for (const [f, dt] of [[880, 0], [1320, 0.0], [1760, 0.0]])
            this._tone({ type: "sawtooth", f0: f, dur: 0.75, vol: 0.09, a: 0.006, d: 0.15, s: 0.55, r: 0.35, detune: dt || 0,
              filt: { type: "lowpass", f0: 4500, f1: 1400, q: 0.8 }, send: 0.3, force: true });
          this._tone({ type: "sine", f0: 880, dur: 0.9, vol: 0.2, a: 0.004, r: 0.5, send: 0.35, force: true });
          this._tone({ type: "triangle", f0: 2640, dur: 0.9, vol: 0.05, a: 0.01, r: 0.6, vib: { f: 9, depth: 14 }, send: 0.5, force: true });
        } else {
          const f = { 3: 440, 2: 494, 1: 554 }[o.label] || 440;
          this._tone({ type: "square", f0: f, dur: 0.24, vol: 0.1, a: 0.004, s: 0.8, r: 0.06, filt: { type: "lowpass", f0: 2600, q: 0.7 }, force: true });
          this._tone({ type: "sine", f0: f, dur: 0.26, vol: 0.2, a: 0.004, s: 0.8, r: 0.08, send: 0.12, force: true });
        }
        break;
      }
      case "lap":
        [72, 76, 79, 84].forEach((m, i) => this._bell(NOTE(m), 0.7, 0.14, i * 0.07, 0.35));
        break;
      case "finalLap": {
        this.duckMusic(0.55, 0.9);
        for (let i = 0; i < 2; i++) {
          this._tone({ type: "square", f0: 740, f1: 990, dur: 0.2, vol: 0.09, a: 0.01, delay: i * 0.26, filt: { type: "lowpass", f0: 3000, q: 0.8 }, send: 0.15 });
          this._tone({ type: "square", f0: 990, f1: 740, dur: 0.2, vol: 0.09, a: 0.01, delay: i * 0.26 + 0.13, filt: { type: "lowpass", f0: 3000, q: 0.8 }, send: 0.15 });
        }
        this._bell(NOTE(88), 0.8, 0.1, 0.55, 0.4);
        break;
      }
      case "finish": {
        this.duckMusic(0.35, 3.2);
        const ch = [[60, 64, 67], [60, 64, 67], [65, 69, 72], [67, 71, 74], [72, 76, 79]];
        const ts = [0, 0.18, 0.36, 0.54, 0.78];
        ch.forEach((c, i) => c.forEach((m) => this._tone({
          type: "sawtooth", f0: NOTE(m), dur: i === 4 ? 2.2 : 0.3, vol: 0.06, a: 0.02, d: 0.1, s: 0.7, r: i === 4 ? 1.2 : 0.1, delay: ts[i],
          detune: (m % 3 - 1) * 6, filt: { type: "lowpass", f0: 900, f1: 3200, q: 0.9 }, send: 0.35, force: true,
        })));
        this._tone({ type: "triangle", f0: NOTE(48), dur: 2.4, vol: 0.14, a: 0.02, delay: 0.78, r: 1.4, send: 0.3, force: true });
        [84, 88, 91, 96].forEach((m, i) => this._bell(NOTE(m), 1.0, 0.08, 0.9 + i * 0.1, 0.5));
        break;
      }
      case "confetti":
        [76, 79, 83].forEach((m, i) => this._bell(NOTE(m), 0.5, 0.1, i * 0.07, 0.3));
        break;
      // ---- items ----
      case "item-get": {
        const s = this._spatial(o, true); if (!s) break;
        [74, 77, 81, 86, 89, 93].forEach((m, i) => {
          this._tone({ type: "triangle", f0: NOTE(m), dur: 0.22, vol: 0.12, a: 0.004, delay: i * 0.045, send: 0.3 });
          this._tone({ type: "sine", f0: NOTE(m + 12), dur: 0.16, vol: 0.035, a: 0.003, delay: i * 0.045 });
        });
        break;
      }
      case "item-roll": {
        const hi = (o.i | 0) % 2;
        this._tone({ type: "sine", f0: hi ? 1900 : 1500, dur: 0.035, vol: 0.2, a: 0.002, bus: U });
        this._noise({ dur: 0.02, vol: 0.05, a: 0.001, filt: { type: "highpass", f0: 5000 }, bus: U });
        break;
      }
      case "boost": {
        const s = this._spatial(o, false); if (!s) break;
        const v = s.gain, p = s.pan;
        this._noise({ dur: 0.95, vol: 0.34 * v, a: 0.06, d: 0.3, s: 0.5, r: 0.5, filt: { type: "bandpass", f0: 300, f1: 4800, q: 0.9 }, pan: p, send: 0.18 });
        this._tone({ type: "sawtooth", f0: 110, f1: 620, dur: 0.8, vol: 0.09 * v, a: 0.05, r: 0.4, filt: { type: "lowpass", f0: 700, f1: 3200, q: 1 }, pan: p });
        this._tone({ type: "sine", f0: 78, f1: 38, dur: 0.38, vol: 0.34 * v, a: 0.004, d: 0.1, s: 0.4, pan: p });
        this._tone({ type: "triangle", f0: 400, f1: 1500, dur: 0.5, vol: 0.05 * v, a: 0.02, pan: p, vib: { f: 22, depth: 25 } });
        break;
      }
      case "pad": {
        this._noise({ dur: 0.55, vol: 0.22, a: 0.03, filt: { type: "bandpass", f0: 700, f1: 4200, q: 1 }, send: 0.1 });
        this._tone({ type: "sawtooth", f0: 200, f1: 900, dur: 0.45, vol: 0.06, a: 0.03, filt: { type: "lowpass", f0: 900, f1: 3000 } });
        this._tone({ type: "sine", f0: 1320, dur: 0.3, vol: 0.06, a: 0.005, delay: 0.08, send: 0.25 });
        break;
      }
      case "drift-level": {
        const lv = clamp(o.level | 0, 1, 3);
        const base = [0, 83, 86, 91][lv];
        this._bell(NOTE(base), 0.28, 0.22, 0, 0.2);
        if (lv >= 2) this._bell(NOTE(base + 7), 0.28, 0.08, 0.05, 0.2);
        if (lv >= 3) this._bell(NOTE(base + 12), 0.4, 0.08, 0.1, 0.3);
        break;
      }
      case "throw": {
        const s = this._spatial(o, false); if (!s) break;
        this._noise({ dur: 0.3, vol: 0.2 * s.gain, a: 0.01, filt: { type: "bandpass", f0: 2400, f1: 500, q: 0.9 }, pan: s.pan });
        this._tone({ type: "sine", f0: 220, f1: 70, dur: 0.14, vol: 0.2 * s.gain, a: 0.003, pan: s.pan });
        this._tone({ type: "sine", f0: 1100, f1: 1700, dur: 0.4, vol: 0.05 * s.gain, a: 0.02, r: 0.2, pan: s.pan, vib: { f: 40, depth: 30 } });
        break;
      }
      case "banana": {
        const s = this._spatial(o, false); if (!s) break;
        this._tone({ type: "sine", f0: 820, f1: 160, dur: 0.38, vol: 0.22 * s.gain, a: 0.005, pan: s.pan, vib: { f: 26, depth: 90 }, send: 0.12 });
        this._tone({ type: "triangle", f0: 400, f1: 90, dur: 0.3, vol: 0.12 * s.gain, pan: s.pan });
        this._noise({ dur: 0.25, vol: 0.14 * s.gain, a: 0.01, filt: { type: "bandpass", f0: 3500, f1: 600, q: 3 }, pan: s.pan });
        break;
      }
      case "hit": case "spin": {
        const s = this._spatial(o, false); if (!s) break;
        const v = s.gain, p = s.pan;
        this._noise({ dur: 0.7, vol: 0.42 * v, a: 0.003, d: 0.2, s: 0.35, r: 0.3, filt: { type: "lowpass", f0: 4000, f1: 180, q: 0.8 }, pan: p, send: 0.3 });
        this._tone({ type: "sawtooth", f0: 190, f1: 40, dur: 0.55, vol: 0.2 * v, a: 0.003, shape: this._shaper, pan: p });
        this._tone({ type: "sine", f0: 95, f1: 32, dur: 0.5, vol: 0.4 * v, a: 0.003, pan: p });
        this._tone({ type: "square", f0: 1700, f1: 900, dur: 0.18, vol: 0.04 * v, a: 0.002, pan: p, send: 0.3 });
        break;
      }
      case "bump": {
        const s = this._spatial(o, false); if (!s) break;
        this._tone({ type: "sine", f0: 150, f1: 55, dur: 0.17, vol: 0.34 * s.gain, a: 0.003, pan: s.pan });
        this._noise({ dur: 0.1, vol: 0.2 * s.gain, a: 0.002, filt: { type: "lowpass", f0: 1200, f1: 250 }, pan: s.pan });
        this._tone({ type: "triangle", f0: 640, f1: 420, dur: 0.07, vol: 0.05 * s.gain, pan: s.pan });
        break;
      }
      case "wall": {
        const im = clamp((o.impact || 8) / 18, 0.15, 1);
        this._noise({ dur: 0.1 + im * 0.3, vol: 0.2 + 0.3 * im, a: 0.002, d: 0.08, s: 0.4, filt: { type: "bandpass", f0: 1500, f1: 350, q: 0.7 }, send: 0.15 * im });
        this._noise({ dur: 0.3 + im * 0.2, vol: 0.07 * im + 0.03, a: 0.01, filt: { type: "highpass", f0: 3000 } });
        this._tone({ type: "sine", f0: 110, f1: 42, dur: 0.22, vol: 0.45 * im, a: 0.003 });
        this._tone({ type: "square", f0: 260, f1: 180, dur: 0.12, vol: 0.05 * im, filt: { type: "lowpass", f0: 900 } });
        break;
      }
      case "shield": {
        const s = this._spatial(o, false); if (!s) break;
        const v = s.gain, p = s.pan;
        if (o.pop) {
          this._noise({ dur: 0.18, vol: 0.28 * v, a: 0.001, filt: { type: "highpass", f0: 2500 }, pan: p, send: 0.3 });
          this._tone({ type: "sine", f0: 1400, f1: 220, dur: 0.22, vol: 0.2 * v, a: 0.002, pan: p, send: 0.3 });
          this._bell(NOTE(96), 0.5, 0.06 * v, 0.02, 0.5, p);
        } else {
          [60, 67, 72, 76].forEach((m, i) => this._tone({
            type: "triangle", f0: NOTE(m + 12), dur: 1.1, vol: 0.07 * v, a: 0.25, d: 0.3, s: 0.6, r: 0.5, delay: i * 0.04,
            vib: { f: 5 + i, depth: 6 }, pan: p, send: 0.35,
          }));
          this._tone({ type: "sine", f0: 220, f1: 440, dur: 0.5, vol: 0.1 * v, a: 0.05, pan: p });
          this._bell(NOTE(91), 0.5, 0.07 * v, 0.3, 0.4, p);
        }
        break;
      }
      case "shock": {
        this.duckMusic(0.45, 0.8);
        this._tone({ type: "sawtooth", f0: 2800, f1: 50, dur: 0.6, vol: 0.2, a: 0.002, shape: this._crush, filt: { type: "lowpass", f0: 6000, f1: 400 }, send: 0.3, force: true });
        this._noise({ dur: 0.75, vol: 0.35, a: 0.002, d: 0.2, s: 0.4, filt: { type: "bandpass", f0: 6000, f1: 300, q: 0.7 }, send: 0.35, force: true });
        this._tone({ type: "sine", f0: 70, f1: 28, dur: 0.95, vol: 0.55, a: 0.004, d: 0.3, s: 0.5, r: 0.5, force: true });
        this._tone({ type: "square", f0: 1200, f1: 3000, dur: 0.12, vol: 0.07, delay: 0.02, shape: this._crush, force: true });
        break;
      }
      default: break;
    }
  }

  /** Bell: sine partials with inharmonic overtone and exponential decay. */
  _bell(f, dur, vol, delay = 0, send = 0.3, pan = 0) {
    this._tone({ type: "sine", f0: f, dur, vol, a: 0.003, d: dur * 0.6, s: 0.15, r: dur * 0.3, delay, send, pan });
    this._tone({ type: "sine", f0: f * 2.76, dur: dur * 0.5, vol: vol * 0.3, a: 0.002, d: dur * 0.3, s: 0.1, delay, send, pan });
    this._tone({ type: "triangle", f0: f * 2, dur: dur * 0.7, vol: vol * 0.35, a: 0.003, d: dur * 0.4, s: 0.1, delay, send, pan });
  }

  // ------------------------------------------------------------------ player engine
  _loopNoise(dest, filt) {
    const ctx = this.ctx, s = ctx.createBufferSource();
    s.buffer = this._noiseBuf; s.loop = true;
    let n = s;
    const fs = [];
    for (const f of [].concat(filt)) {
      const b = ctx.createBiquadFilter(); b.type = f.type; b.frequency.value = f.f; b.Q.value = f.q || 1; n.connect(b); n = b; fs.push(b);
    }
    const g = ctx.createGain(); g.gain.value = 0; n.connect(g); g.connect(dest);
    s.start(0, Math.random());
    return { src: s, filters: fs, gain: g };
  }

  startEngine() {
    if (!this.ctx || this.engine) return;
    const ctx = this.ctx, eb = this.engineBus, mk = (t, f) => { const o = ctx.createOscillator(); o.type = t; o.frequency.value = f; return o; };
    const out = ctx.createGain(); out.gain.value = 0; out.connect(eb);
    const sum = ctx.createGain();
    const o1 = mk("sawtooth", 80), o2 = mk("square", 40), o3 = mk("sawtooth", 160), o4 = mk("triangle", 240);
    o3.detune.value = 9;
    const gs = [1, 0.5, 0.28, 0.18].map((v, i) => { const g = ctx.createGain(); g.gain.value = v; [o1, o2, o3, o4][i].connect(g); g.connect(sum); return g; });
    const ws = ctx.createWaveShaper(); ws.curve = this._shaper; sum.connect(ws);
    const body = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1200; lp.Q.value = 0.9;
    const bp1 = ctx.createBiquadFilter(); bp1.type = "bandpass"; bp1.frequency.value = 700; bp1.Q.value = 2.2;
    const bp2 = ctx.createBiquadFilter(); bp2.type = "bandpass"; bp2.frequency.value = 1900; bp2.Q.value = 3;
    const g1 = ctx.createGain(); g1.gain.value = 0.9; const g2 = ctx.createGain(); g2.gain.value = 0.7; const g3 = ctx.createGain(); g3.gain.value = 0.35;
    ws.connect(lp); lp.connect(g1); g1.connect(body);
    ws.connect(bp1); bp1.connect(g2); g2.connect(body);
    ws.connect(bp2); bp2.connect(g3); g3.connect(body);
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 38; body.connect(hp);
    const am = ctx.createGain(); am.gain.value = 0.88; hp.connect(am); am.connect(out);
    const lfo = mk("sine", 40), lfoG = ctx.createGain(); lfoG.gain.value = 0.12; lfo.connect(lfoG); lfoG.connect(am.gain);
    const intake = this._loopNoise(out, [{ type: "bandpass", f: 900, q: 0.8 }]);
    const wind = this._loopNoise(eb, [{ type: "highpass", f: 250 }, { type: "bandpass", f: 700, q: 0.5 }]);
    const skid = this._loopNoise(eb, [{ type: "bandpass", f: 1800, q: 7 }]);
    const skid2 = this._loopNoise(eb, [{ type: "bandpass", f: 3100, q: 10 }]);
    const rumble = this._loopNoise(eb, [{ type: "lowpass", f: 170, q: 0.7 }]);
    const rlfo = mk("sine", 17), rlg = ctx.createGain(); rlg.gain.value = 0.5; rlfo.connect(rlg); rlg.connect(rumble.gain.gain);
    for (const o of [o1, o2, o3, o4, lfo, rlfo]) o.start();
    this.engine = { out, osc: [o1, o2, o3, o4], lfo, rlfo, lp, bp1, bp2, am, intake, wind, skid, skid2, rumble, nodes: [out, hp, sum, ws, body, lp, bp1, bp2, g1, g2, g3, am, lfoG, rlg, ...gs] };
    Object.assign(this._eState, { rpm: 0.25, gear: 0, sf: 0, load: 0.3, boost: false, last: 0 });
    // positional voices for the nearest AI karts
    this.engine.others = [0, 1, 2].map(() => {
      const o = mk("sawtooth", 80), o2b = mk("square", 40), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = "lowpass"; f.frequency.value = 900; f.Q.value = 1.2; g.gain.value = 0;
      const sh = ctx.createGain(); sh.gain.value = 0.55; o2b.connect(sh);
      o.connect(f); sh.connect(f); f.connect(g);
      let p = null;
      if (ctx.createStereoPanner) { p = ctx.createStereoPanner(); g.connect(p); p.connect(eb); } else g.connect(eb);
      o.start(); o2b.start();
      return { o, o2: o2b, f, g, p, sh, id: null, prev: 0, prevT: 0 };
    });
    this._others.clear();
  }

  /**
   * speedFrac 0..1.3; boost bool; drift 0 (none) .. 3 level; offRoad bool (gravel/grass rumble).
   * Throttled to ~30 Hz internally.
   */
  updateEngine(speedFrac, boost = false, drift = 0, offRoad = false) {
    const e = this.engine;
    if (!e) return;
    const ctx = this.ctx, now = ctx.currentTime, S = this._eState;
    const dt = now - S.last;
    if (dt < 0.033) return;
    S.last = now;
    const sf = clamp(speedFrac, 0, 1.4);
    // gear model: rpm climbs inside a gear and drops on upshift
    const edges = [0, 0.2, 0.4, 0.6, 0.8, 1.05];
    let gear = 0;
    while (gear < 4 && sf >= edges[gear + 1]) gear++;
    const local = clamp((sf - edges[gear]) / (edges[gear + 1] - edges[gear] || 1), 0, 1);
    if (gear > S.gear) { S.rpm -= 0.3; S.shift = 0.13; } else if (gear < S.gear) { S.rpm += 0.2; S.shift = 0.08; }
    S.gear = gear;
    const acc = dt > 0 ? (sf - S.sf) / dt : 0;
    S.sf = sf;
    const loadT = clamp(0.45 + acc * 7 + (boost ? 0.45 : 0) + (sf < 0.1 ? 0.2 : 0), 0, 1);
    const prevLoad = S.load;
    S.load += (loadT - S.load) * Math.min(1, dt * 7);
    const targetRpm = clamp(0.28 + 0.62 * Math.pow(local, 0.85) + (boost ? 0.1 : 0) + (gear === 4 ? 0.04 : 0), 0, 1);
    S.rpm += (targetRpm - S.rpm) * Math.min(1, dt * 10);
    S.rpm = clamp(S.rpm, 0.1, 1.05);
    S.shift = Math.max(0, S.shift - dt);
    const f = 62 + S.rpm * 215;
    const T = (p, v, tc = 0.035) => p.setTargetAtTime(v, now, tc);
    T(e.osc[0].frequency, f); T(e.osc[1].frequency, f * 0.5); T(e.osc[2].frequency, f * 2); T(e.osc[3].frequency, f * 3);
    T(e.lfo.frequency, f * 0.5);
    T(e.lp.frequency, 650 + S.load * 1700 + S.rpm * 900);
    T(e.bp1.frequency, 480 + S.rpm * 650 + S.load * 250);
    T(e.bp2.frequency, 1400 + S.rpm * 1300);
    T(e.am.gain, 0.9 - S.load * 0.05);
    const dip = S.shift > 0 ? 0.45 : 1;
    T(e.out.gain, (0.09 + 0.11 * S.load + 0.07 * S.rpm) * dip, 0.025);
    T(e.intake.gain.gain, (0.01 + 0.05 * S.load * S.rpm) * dip);
    T(e.intake.filters[0].frequency, 500 + S.rpm * 1800);
    // wind
    T(e.wind.gain.gain, 0.005 + 0.1 * sf * sf, 0.1);
    T(e.wind.filters[1].frequency, 450 + sf * 1700, 0.1);
    // tyre squeal: resonance and level follow drift level
    const dl = drift > 0 ? 1 : 0;
    T(e.skid.gain.gain, dl ? 0.045 + 0.022 * drift : 0, 0.05);
    T(e.skid2.gain.gain, dl ? 0.02 + 0.018 * drift : 0, 0.05);
    if (dl) {
      T(e.skid.filters[0].frequency, 1500 + drift * 260 + Math.sin(now * 23) * 120, 0.04);
      T(e.skid2.filters[0].frequency, 2800 + drift * 320 + Math.sin(now * 31) * 180, 0.04);
      if (Math.random() < 0.2 + 0.2 * drift) this._crackle(drift);
    }
    // gravel / grass rumble
    T(e.rumble.gain.gain, offRoad ? 0.1 + 0.2 * Math.min(1, sf) : 0, 0.08);
    // throttle-lift burble
    if (S.burbleCool > 0) S.burbleCool -= dt;
    if (prevLoad > 0.55 && S.load < 0.4 && S.rpm > 0.5 && S.burbleCool <= 0) {
      S.burbleCool = 1.2;
      const n = 2 + ((Math.random() * 3) | 0);
      let t = 0;
      for (let i = 0; i < n; i++) {
        t += 0.04 + Math.random() * 0.09;
        this._noise({ dur: 0.07, vol: 0.12, a: 0.002, delay: t, filt: { type: "lowpass", f0: 1100 + Math.random() * 900, f1: 250, q: 1.2 }, bus: this.engineBus, force: true });
        this._tone({ type: "sine", f0: 130 + Math.random() * 40, f1: 60, dur: 0.08, vol: 0.1, delay: t, bus: this.engineBus, force: true });
      }
    }
    // turbo flutter when a boost ends
    if (S.boost && !boost) {
      this._noise({ dur: 0.35, vol: 0.12, a: 0.005, filt: { type: "bandpass", f0: 2600, f1: 900, q: 1.5 }, bus: this.engineBus, force: true });
      for (let i = 0; i < 6; i++)
        this._noise({ dur: 0.03, vol: 0.09, a: 0.002, delay: i * 0.045, filt: { type: "highpass", f0: 3500 }, bus: this.engineBus, force: true });
    }
    S.boost = !!boost;
  }

  _crackle(level) {
    this._noise({ dur: 0.012 + Math.random() * 0.012, vol: 0.05 + 0.03 * level, a: 0.0008,
      filt: { type: "highpass", f0: 4500 + Math.random() * 3000 }, pan: Math.random() * 0.6 - 0.3, bus: this.engineBus });
  }

  /**
   * Positional engines of the nearest AI karts. list: [{id, dist, pan, speedFrac}] (any order, any length).
   * Gain, Doppler pitch and pan are derived per voice. Call at >= 20 Hz.
   */
  updateOthers(list) {
    const e = this.engine;
    if (!e) return;
    const now = this.ctx.currentTime;
    const near = list.filter((k) => k.dist < 110).sort((a, b) => a.dist - b.dist).slice(0, 3);
    // keep the same voice for the same kart so Doppler is continuous
    const used = new Set();
    const assign = new Map();
    for (const k of near) { const v = e.others.find((o) => o.id === k.id); if (v) { assign.set(k, v); used.add(v); } }
    for (const k of near) if (!assign.has(k)) { const v = e.others.find((o) => !used.has(o)); if (v) { v.id = k.id; v.prev = k.dist; v.prevT = now; assign.set(k, v); used.add(v); } }
    for (const v of e.others) {
      if (used.has(v)) continue;
      v.id = null;
      v.g.gain.setTargetAtTime(0, now, 0.1);
    }
    for (const [k, v] of assign) {
      const dtv = Math.max(0.02, now - v.prevT);
      const rel = clamp((k.dist - v.prev) / dtv, -70, 70);   // + receding
      v.prev = k.dist; v.prevT = now;
      const dop = 340 / (340 + rel);
      const sf = clamp(k.speedFrac, 0, 1.3);
      const g = clamp(sf * 5 | 0, 0, 4), loc = (sf * 5) % 1;
      const rpm = 0.3 + 0.6 * (g === 4 ? clamp(sf - 0.8, 0, 0.5) * 2 : loc);
      const f = (62 + rpm * 200) * dop;
      v.o.frequency.setTargetAtTime(f, now, 0.05); v.o2.frequency.setTargetAtTime(f * 0.5, now, 0.05);
      v.f.frequency.setTargetAtTime(500 + rpm * 1200 + (k.dist < 20 ? 500 : 0), now, 0.08);
      const att = 1 / (1 + k.dist / 9);
      v.g.gain.setTargetAtTime(0.16 * att * (0.5 + 0.5 * sf), now, 0.06);
      if (v.p) v.p.pan.setTargetAtTime(clamp(k.pan, -1, 1), now, 0.05);
    }
  }

  stopEngine() {
    const e = this.engine;
    if (!e) return;
    this.engine = null;
    try {
      const t = this.ctx.currentTime;
      for (const g of [e.out.gain, e.intake.gain.gain, e.wind.gain.gain, e.skid.gain.gain, e.skid2.gain.gain, e.rumble.gain.gain]) g.setTargetAtTime(0, t, 0.04);
      for (const o of e.others) o.g.gain.setTargetAtTime(0, t, 0.04);
      const end = t + 0.35;
      for (const o of [...e.osc, e.lfo, e.rlfo]) o.stop(end);
      for (const n of [e.intake, e.wind, e.skid, e.skid2, e.rumble]) n.src.stop(end);
      for (const o of e.others) { o.o.stop(end); o.o2.stop(end); }
      setTimeout(() => {
        for (const n of e.nodes) { try { n.disconnect(); } catch (x) { /* ignore */ } }
        for (const o of e.others) { try { o.g.disconnect(); o.f.disconnect(); o.p && o.p.disconnect(); } catch (x) { /* ignore */ } }
        for (const n of [e.intake, e.wind, e.skid, e.skid2, e.rumble]) { try { n.gain.disconnect(); } catch (x) { /* ignore */ } }
      }, 600);
    } catch (err) { /* ignore */ }
  }

  // ------------------------------------------------------------------ bagpiper (Highland Fling): chanter + 3 drones, positional
  // setPiper(true, {x,y,z}) every frame while the piper plays; setPiper(false) fades him out. Self-stops ~0.7 s after the last update.
  // Routed through sfxBus (+ reverb send) so it follows the SFX volume. Tune: an original A-mixolydian 6/8 jig with pipe gracenotes.
  setPiper(on, pos) {
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      if (!on) { if (this._piper && !this._piper.dying) this._piperStop(1.1); return; }
      let p = this._piper;
      if (!p || p.dying) p = this._piperStart();
      if (!p) return;
      p.seen = now; if (pos) p.pos = pos;
      this._piperMix(p);
    } catch (e) { /* never break the game for audio */ }
  }

  _piperStart() {
    const ctx = this.ctx, t0 = ctx.currentTime, mk = (t, f) => { const o = ctx.createOscillator(); o.type = t; o.frequency.value = f; return o; };
    const nodes = [], oscs = [], g = (v) => { const n = ctx.createGain(); n.gain.value = v; nodes.push(n); return n; };
    const bq = (type, f, q) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; nodes.push(n); return n; };
    // output chain: voice sum -> distance low-pass -> fade -> panner -> sfxBus (+ reverb send)
    const sum = g(1), dist = bq("lowpass", 6000, 0.6), out = g(0);
    sum.connect(dist); dist.connect(out);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { nodes.push(pan); out.connect(pan); pan.connect(this.sfxBus); } else out.connect(this.sfxBus);
    const send = g(0.42); out.connect(send); send.connect(this.reverbIn);
    // reed buzz curve (slightly asymmetric, like a double reed)
    if (!this._reedCurve) {
      const n = 1024, c = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(2.4 * x + 0.35) - Math.tanh(0.35); }
      this._reedCurve = c;
    }
    // chanter: two slightly detuned reeds -> shaper -> fixed nasal formants (parallel band-passes) + a little dry body
    const c1 = mk("sawtooth", 440), c2 = mk("sawtooth", 440); c2.detune.value = 6; oscs.push(c1, c2);
    const cIn = g(0.5), cGain = g(0.0), ws = ctx.createWaveShaper(); ws.curve = this._reedCurve; nodes.push(ws);
    c1.connect(cIn); c2.connect(cIn); cIn.connect(ws);
    const fm = g(1);
    const f1 = bq("bandpass", 950, 3.2), f2 = bq("bandpass", 2150, 4.5), f3 = bq("bandpass", 3300, 6), body = bq("lowpass", 2600, 0.7);
    const a1 = g(1.0), a2 = g(0.75), a3 = g(0.3), a4 = g(0.45);
    ws.connect(f1); f1.connect(a1); a1.connect(fm); ws.connect(f2); f2.connect(a2); a2.connect(fm); ws.connect(f3); f3.connect(a3); a3.connect(fm); ws.connect(body); body.connect(a4); a4.connect(fm);
    fm.connect(cGain); cGain.connect(sum);
    // 3 drones: A, A (octave+ below the chanter's low A) and a bass A two octaves down; each two reeds, soft low-pass, slow bag-pressure wobble
    const lfo = mk("sine", 0.37); oscs.push(lfo);
    [[220, 0.15, 1500], [220.7, 0.15, 1400], [110, 0.22, 900]].forEach(([f, v, cut], i) => {
      const o = mk("sawtooth", f), o2 = mk("square", f * 1.0035); oscs.push(o, o2);
      const d = g(v), s = ctx.createWaveShaper(); s.curve = this._reedCurve; nodes.push(s);
      const lp = bq("lowpass", cut, 1.4), pk = bq("peaking", f * 5, 1.2); pk.gain.value = 5;
      const m = g(0.5); o2.connect(m); o.connect(s); m.connect(s); s.connect(lp); lp.connect(pk); pk.connect(d); d.connect(sum);
      const lg = g(v * 0.08 * (i + 1)); lfo.connect(lg); lg.connect(d.gain);
    });
    for (const o of oscs) o.start(t0);
    const p = { ctx, nodes, oscs, c1, c2, cGain, out, dist, pan, send, t0, pos: { x: 0, y: 0, z: 0 }, seen: t0, dying: false, nextT: t0 + 0.05, idx: 0, last: 0, timer: null };
    this._piper = p;
    p.timer = setInterval(() => {
      try {
        if (this._piper !== p) { clearInterval(p.timer); return; }
        if (!p.dying && ctx.currentTime - p.seen > 0.7) this._piperStop(0.5);
        else this._piperSchedule(p, ctx.currentTime + 1.0);
      } catch (e) { /* ignore */ }
    }, 70);
    this._piperSchedule(p, t0 + 1.0);
    return p;
  }

  /** 3D mix: distance attenuation (louder as the kart nears the line), dulling with range, pan from the listener's heading. */
  _piperMix(p) {
    const L = this.listener, now = this.ctx.currentTime;
    let d = 30, pan = 0;
    if (L && L.position && p.pos) {
      const dx = p.pos.x - L.position.x, dz = p.pos.z - L.position.z;
      d = Math.hypot(dx, dz);
      const rx = -Math.cos(L.heading || 0), rz = Math.sin(L.heading || 0);
      pan = clamp((dx * rx + dz * rz) / Math.max(10, d), -1, 1) * 0.85;
    }
    const near = 1 / (1 + d / 22), far = clamp((430 - d) / 90, 0, 1);
    p.out.gain.setTargetAtTime(0.75 * near * far, now, 0.08);
    p.dist.frequency.setTargetAtTime(1400 + 8000 / (1 + d / 28), now, 0.1);
    if (p.pan) p.pan.pan.setTargetAtTime(pan, now, 0.08);
  }

  _piperStop(sec = 1.0) {
    const p = this._piper; if (!p || p.dying) return;
    p.dying = true;
    const now = this.ctx.currentTime;
    p.out.gain.cancelScheduledValues(now); p.out.gain.setTargetAtTime(0, now, sec / 4);
    setTimeout(() => {
      clearInterval(p.timer);
      for (const o of p.oscs) { try { o.stop(); } catch (e) { /* ignore */ } }
      setTimeout(() => { for (const n of p.nodes) { try { n.disconnect(); } catch (e) { /* ignore */ } } try { p.out.disconnect(); p.send.disconnect(); } catch (e) { /* ignore */ } }, 200);
      if (this._piper === p) this._piper = null;
    }, sec * 1000 + 300);
  }

  /** Schedule chanter events (pitch, gracenotes, articulation dips) up to audio time `until`. */
  _piperSchedule(p, until) {
    const ev = PIPE_TUNE();
    while (p.nextT < until) {
      const e = ev[p.idx % ev.length]; p.idx++;
      const t = p.nextT, f = e.f;
      if (e.grace) {
        // gracenote: a very short flick of another pitch, separating (or ornamenting) the note
        p.c1.frequency.setTargetAtTime(e.grace, t, 0.002); p.c2.frequency.setTargetAtTime(e.grace, t, 0.002);
        p.cGain.gain.setValueAtTime(0.5, t); p.cGain.gain.linearRampToValueAtTime(0.95, t + 0.008);
        const tn = t + 0.034;
        p.c1.frequency.setTargetAtTime(f, tn, 0.002); p.c2.frequency.setTargetAtTime(f, tn, 0.002);
        p.cGain.gain.setValueAtTime(0.62, tn); p.cGain.gain.linearRampToValueAtTime(e.acc ? 1.12 : 1.0, tn + 0.02);
      } else {
        p.c1.frequency.setTargetAtTime(f, t, 0.004); p.c2.frequency.setTargetAtTime(f, t, 0.004);
        p.cGain.gain.setValueAtTime(p.last ? 0.7 : 0.0, t); p.cGain.gain.linearRampToValueAtTime(e.acc ? 1.12 : 1.0, t + 0.025);
      }
      p.last = f;
      p.nextT += e.dur;
    }
  }

  // ------------------------------------------------------------------ music (music.js, optional)
  async _ensureMusic() {
    if (this._music || this._musicFailed || !this.ctx) return this._music;
    if (!this._musicLoading) {
      this._musicLoading = import("./music.js").then((m) => {
        this._music = new m.MusicEngine(this.ctx, this.musicBus);
      }).catch((err) => {
        this._musicFailed = true;
        console.info("[audio] music.js unavailable, continuing without music:", err && err.message);
      });
    }
    await this._musicLoading;
    return this._music;
  }

  startMusic(themeId = "menu") {
    if (!this.ctx) return;
    this._musicWant = themeId;
    this._ensureMusic().then((m) => {
      if (!m || this._musicWant !== themeId) return;
      try {
        if (this._musicCur === themeId && m.playing) return;
        this._musicCur = themeId;
        m.start(themeId, { fadeIn: 1.2 });
        m.setIntensity?.(this._intensity);
      } catch (err) { this._musicFailed = true; console.info("[audio] music failed:", err && err.message); }
    });
  }

  setMusicIntensity(v) {
    v = clamp(v, 0, 1);
    if (Math.abs(v - this._intensity) < 0.02) return;
    this._intensity = v;
    try { this._music?.setIntensity?.(v); } catch (e) { /* ignore */ }
  }

  stopMusic(fadeOut = 0.6) {
    this._musicWant = null; this._musicCur = null;
    try { this._music?.stop?.(fadeOut); } catch (e) { /* ignore */ }
  }

  dispose() {
    this.stopMusic(0);
    this.stopEngine();
    try { this._music?.dispose?.(); } catch (e) { /* ignore */ }
    try { if (this.ctx && this.ctx.close) this.ctx.close(); } catch (e) { /* ignore */ }
  }
}
