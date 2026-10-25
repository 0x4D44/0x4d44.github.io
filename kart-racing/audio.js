// Pure WebAudio synthesis: SFX, engine, drift squeal and a sequenced chiptune-ish soundtrack.
// Every entry point is safe when AudioContext is unavailable or blocked.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Music patterns. Notes are MIDI numbers (0 = rest). 16 steps per bar.
const SONGS = {
  menu: { bpm: 108, root: 57, bass: [0, 0, 7, 0, 5, 5, 0, 7], lead: [0, 4, 7, 12, 7, 4, 7, 0, 5, 9, 12, 9, 7, 4, 2, 4], leadWave: "triangle", drums: false },
  sunset: { bpm: 124, root: 52, bass: [0, 0, 5, 5, 7, 7, 3, 5], lead: [12, 0, 16, 12, 0, 19, 16, 0, 14, 0, 17, 14, 0, 12, 14, 16], leadWave: "square", drums: true },
  snow: { bpm: 132, root: 50, bass: [0, 0, 0, 3, 5, 5, 3, 3], lead: [12, 15, 19, 15, 12, 15, 17, 15, 14, 17, 21, 17, 14, 12, 10, 12], leadWave: "triangle", drums: true },
  neon: { bpm: 140, root: 45, bass: [0, 0, 12, 0, 0, 0, 10, 0], lead: [24, 0, 0, 19, 0, 22, 0, 19, 24, 0, 0, 26, 0, 24, 0, 22], leadWave: "sawtooth", drums: true },
};
const SONG_KEYS = ["sunset", "snow", "neon"];

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.vol = { volume: 0.8, music: 0.6, sfx: 0.8 };
    this.engineNodes = null;
    this._music = null;
    this._unlocked = false;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.comp = ctx.createDynamicsCompressor();
      this.sfxBus = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);
      this.master.connect(this.comp);
      this.comp.connect(ctx.destination);
      this._noiseBuf = this._makeNoise();
      this.setVolumes(this.vol);
    } catch (e) {
      this.ctx = null;
    }
  }

  _makeNoise() {
    const ctx = this.ctx, len = ctx.sampleRate * 1.5;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  unlock() {
    if (!this.ctx) return;
    try {
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      this._unlocked = true;
    } catch (e) { /* ignore */ }
  }

  setVolumes(v) {
    if (v) this.vol = { ...this.vol, ...v };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.volume, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.02);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.5, t, 0.02);
  }

  get ready() { return !!this.ctx && this.ctx.state === "running"; }

  // ---- primitives ----
  _tone(freq, dur, type = "square", vol = 0.2, slideTo = null, delay = 0, bus = null) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(bus || this.sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  _noise(dur, vol = 0.2, f0 = 1000, f1 = null, type = "bandpass", delay = 0, q = 1, bus = null) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this._noiseBuf;
    s.loop = true;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(bus || this.sfxBus);
    s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }

  /** Fire-and-forget sound effect by name. */
  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state !== "running") return;
    try { this._play(name, opts); } catch (e) { /* never break the game for audio */ }
  }

  _play(name, o) {
    switch (name) {
      case "ui-move": this._tone(660, 0.05, "square", 0.08); break;
      case "ui-select": this._tone(520, 0.07, "square", 0.12); this._tone(780, 0.1, "square", 0.12, null, 0.06); break;
      case "ui-back": this._tone(440, 0.07, "square", 0.1, 300); break;
      case "countdown": case "beep":
        if (o.go || o.label === "GO!" || o.label === "GO") {
          this._tone(880, 0.5, "square", 0.2); this._tone(1320, 0.5, "square", 0.12);
        } else this._tone(440, 0.18, "square", 0.2);
        break;
      case "lap": [660, 880, 1100].forEach((f, i) => this._tone(f, 0.14, "square", 0.14, null, i * 0.08)); break;
      case "finalLap": [880, 660, 880, 1320].forEach((f, i) => this._tone(f, 0.12, "square", 0.16, null, i * 0.1)); break;
      case "finish": {
        const seq = [523, 659, 784, 1047, 784, 1047, 1319];
        seq.forEach((f, i) => { this._tone(f, 0.22, "square", 0.15, null, i * 0.13); this._tone(f / 2, 0.22, "triangle", 0.15, null, i * 0.13); });
        break;
      }
      case "item-get": [784, 988, 1175, 1568].forEach((f, i) => this._tone(f, 0.12, "triangle", 0.18, null, i * 0.05)); break;
      case "item-roll": this._tone(900 + Math.random() * 300, 0.04, "square", 0.05); break;
      case "boost": this._noise(0.8, 0.28, 400, 3500, "bandpass", 0, 0.8); this._tone(200, 0.6, "sawtooth", 0.1, 700); break;
      case "pad": this._noise(0.5, 0.2, 600, 4000, "bandpass", 0, 1); this._tone(300, 0.4, "triangle", 0.12, 900); break;
      case "drift-level": this._tone(900 + (o.level || 1) * 300, 0.09, "square", 0.1); break;
      case "hit": case "spin":
        this._noise(0.5, 0.35, 1800, 200, "lowpass", 0, 1);
        this._tone(220, 0.5, "sawtooth", 0.22, 50);
        break;
      case "bump": this._noise(0.12, 0.22, 500, 150, "lowpass"); this._tone(120, 0.1, "square", 0.12, 70); break;
      case "wall": this._noise(0.2, 0.25 * Math.min(1, (o.impact || 8) / 12 + 0.3), 400, 100, "lowpass"); break;
      case "banana": this._tone(500, 0.35, "sine", 0.2, 1200); this._tone(1200, 0.3, "sine", 0.18, 300, 0.12); break;
      case "throw": this._noise(0.25, 0.2, 2000, 600, "bandpass"); this._tone(500, 0.2, "triangle", 0.12, 250); break;
      case "shield": [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.3, "sine", 0.14, f * 1.02, i * 0.06)); break;
      case "shock":
        this._noise(0.7, 0.4, 5000, 300, "bandpass", 0, 0.7);
        this._tone(1800, 0.6, "sawtooth", 0.18, 80);
        this._tone(90, 0.7, "square", 0.2, 40);
        break;
      case "confetti": [523, 659, 784].forEach((f, i) => this._tone(f, 0.25, "triangle", 0.12, null, i * 0.07)); break;
      default: break;
    }
  }

  // ---- engine ----
  startEngine() {
    if (!this.ctx || this.engineNodes) return;
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
    const o1 = ctx.createOscillator(); o1.type = "sawtooth"; o1.frequency.value = 60;
    const o2 = ctx.createOscillator(); o2.type = "square"; o2.frequency.value = 30;
    const o2g = ctx.createGain(); o2g.gain.value = 0.5;
    o1.connect(lp); o2.connect(o2g); o2g.connect(lp);
    const ns = ctx.createBufferSource(); ns.buffer = this._noiseBuf; ns.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = 600; nf.Q.value = 0.7;
    const ng = ctx.createGain(); ng.gain.value = 0.05;
    ns.connect(nf); nf.connect(ng); ng.connect(g);
    lp.connect(g); g.connect(this.sfxBus);
    // drift squeal
    const sq = ctx.createBufferSource(); sq.buffer = this._noiseBuf; sq.loop = true;
    const sf = ctx.createBiquadFilter(); sf.type = "bandpass"; sf.frequency.value = 2400; sf.Q.value = 6;
    const sg = ctx.createGain(); sg.gain.value = 0;
    sq.connect(sf); sf.connect(sg); sg.connect(this.sfxBus);
    o1.start(); o2.start(); ns.start(); sq.start();
    this.engineNodes = { g, lp, o1, o2, ng, nf, sg, sf, ns, sq };
  }

  /** speedFrac 0..1.2, boost bool, drift 0 (none) .. 3 (level) */
  updateEngine(speedFrac, boost = false, drift = 0) {
    const n = this.engineNodes;
    if (!n) return;
    const t = this.ctx.currentTime;
    const f = 55 + speedFrac * 120 + (boost ? 30 : 0);
    n.o1.frequency.setTargetAtTime(f, t, 0.05);
    n.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    n.lp.frequency.setTargetAtTime(500 + speedFrac * 1500, t, 0.08);
    n.nf.frequency.setTargetAtTime(500 + speedFrac * 1800, t, 0.08);
    n.g.gain.setTargetAtTime(0.1 + speedFrac * 0.12, t, 0.08);
    n.sg.gain.setTargetAtTime(drift > 0 ? 0.04 + drift * 0.02 : 0, t, 0.05);
    n.sf.frequency.setTargetAtTime(2200 + drift * 400, t, 0.1);
  }

  stopEngine() {
    const n = this.engineNodes;
    if (!n) return;
    this.engineNodes = null;
    try {
      const t = this.ctx.currentTime;
      n.g.gain.setTargetAtTime(0, t, 0.05);
      n.sg.gain.setTargetAtTime(0, t, 0.05);
      for (const k of ["o1", "o2", "ns", "sq"]) n[k].stop(t + 0.3);
    } catch (e) { /* ignore */ }
  }

  // ---- music ----
  startMusic(themeId = "menu") {
    if (!this.ctx) return;
    let key = SONGS[themeId] ? themeId : null;
    if (!key) {
      let h = 0;
      for (const c of String(themeId)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      key = SONG_KEYS[h % SONG_KEYS.length];
    }
    if (this._music && this._music.key === key) return;
    this.stopMusic();
    const song = SONGS[key];
    this._music = { key, song, step: 0, next: this.ctx.currentTime + 0.1, timer: null };
    const m = this._music;
    m.timer = setInterval(() => this._schedule(m), 40);
  }

  _schedule(m) {
    if (!this.ctx || this.ctx.state !== "running") { m.next = Math.max(m.next, this.ctx ? this.ctx.currentTime : 0); return; }
    const spb = 60 / m.song.bpm / 4;   // 16th note
    while (m.next < this.ctx.currentTime + 0.25) {
      this._step(m.song, m.step, m.next - this.ctx.currentTime, spb);
      m.step++;
      m.next += spb;
    }
  }

  _step(song, step, delay, spb) {
    const s16 = step % 16, bar = Math.floor(step / 16);
    const bus = this.musicBus;
    // bass: on 8ths, root follows the pattern per bar
    const bn = song.bass[bar % song.bass.length];
    if (s16 % 2 === 0) {
      const f = NOTE(song.root + bn + (s16 % 8 === 6 ? 12 : 0));
      this._tone(f, spb * 1.8, "sawtooth", 0.16, null, delay, bus);
    }
    // lead: pattern, transposed by the bar's bass note
    const ln = song.lead[s16];
    if (ln && (bar % 4 !== 3 || s16 < 8)) {
      this._tone(NOTE(song.root + 12 + ln + bn), spb * 1.6, song.leadWave, 0.09, null, delay, bus);
    }
    if (song.drums) {
      if (s16 % 4 === 0) this._tone(150, 0.12, "sine", 0.35, 45, delay, bus);
      if (s16 === 4 || s16 === 12) this._noise(0.1, 0.18, 1800, null, "highpass", delay, 1, bus);
      if (s16 % 2 === 1) this._noise(0.03, 0.06, 7000, null, "highpass", delay, 1, bus);
    } else if (s16 % 8 === 0) {
      this._tone(130, 0.14, "sine", 0.25, 50, delay, bus);
    }
  }

  stopMusic() {
    if (this._music) { clearInterval(this._music.timer); this._music = null; }
  }

  dispose() {
    this.stopMusic();
    this.stopEngine();
    try { if (this.ctx) this.ctx.close(); } catch (e) { /* ignore */ }
  }
}
