// Web Audio wrapper. Two interchangeable sound sources feed one output chain:
//  - "samples": recorded Class 47 loops crossfaded by rpm (like a train-sim engine sound), plus
//    start-up and shutdown one-shots. Loaded from ./samples/samples.json when that folder exists.
//  - "synth": the physical-model AudioWorklet (js/audio-core.js), always available as the fallback.
const PERSP = ["cab", "engine_room", "outside"]; // index = the listening-position select value
const IDLE = 390;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export class EngineAudio {
  constructor() {
    this.ctx = null; this.node = null; this.analyser = null; this.on = false; this.vol = 0.8; this.mic = 1;
    this.src = "synth"; this.samplesReady = false; this.lib = null; this.buf = new Map();
    this.voices = new Map(); this.ladder = []; this.wasRunning = false; this.wasCranking = false; this.oneShot = null;
    this.onready = null;
  }
  async enable() {
    if (this.ctx) { await this.ctx.resume(); this.on = true; this.gain.gain.value = this.vol; return true; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    this.ctx = new AC({ latencyHint: "interactive" });
    try {
      await this.ctx.audioWorklet.addModule(new URL("./audio-worklet.js", import.meta.url));
    } catch (e) { console.warn("audio worklet unavailable", e); return false; }
    this.node = new AudioWorkletNode(this.ctx, "engine-proc", { outputChannelCount: [2] });
    this.gain = this.ctx.createGain(); this.gain.gain.value = this.vol;
    this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = 0.78;
    this.synthBus = this.ctx.createGain(); this.sampleBus = this.ctx.createGain(); this.sampleBus.gain.value = 0;
    this.node.connect(this.synthBus); this.synthBus.connect(this.gain);
    this.sampleBus.connect(this.gain); this.gain.connect(this.analyser); this.analyser.connect(this.ctx.destination);
    this.on = true; this.send({ mic: this.mic });
    this.loadSamples();
    return true;
  }
  disable() { this.on = false; if (this.gain) this.gain.gain.value = 0; }
  setVolume(v) { this.vol = v; if (this.gain && this.on) this.gain.gain.value = v; }
  setMic(m) { this.mic = m; this.send({ mic: m }); if (this.samplesReady) this.buildLadder(); }
  send(p) { if (this.node) this.node.port.postMessage(p); }

  // ---- sample library -------------------------------------------------------------------
  async loadSamples() {
    try {
      const base = new URL("../samples/", import.meta.url);
      const r = await fetch(new URL("samples.json", base)); if (!r.ok) return;
      const lib = await r.json();
      const files = [...lib.loops, ...lib.oneshots.filter((o) => o.f.startsWith("start_outside_47596") || o.f.startsWith("shutdown"))];
      await Promise.all(files.map(async (e) => {
        const ab = await (await fetch(new URL(e.f, base))).arrayBuffer();
        this.buf.set(e.f, await this.ctx.decodeAudioData(ab));
      }));
      this.lib = lib; this.samplesReady = true; this.buildLadder();
      this.setSource("samples");
      if (this.onready) this.onready();
    } catch (e) { console.warn("sample set unavailable, using synth", e); }
  }
  setSource(s) {
    if (s === "samples" && !this.samplesReady) s = "synth";
    this.src = s; const t = this.ctx.currentTime;
    this.synthBus.gain.setTargetAtTime(s === "synth" ? 1 : 0, t, 0.05);
    this.sampleBus.gain.setTargetAtTime(s === "samples" ? 1 : 0, t, 0.05);
  }
  // Loops for the chosen listening position, sorted by rpm, near-duplicates dropped.
  buildLadder() {
    for (const [, v] of this.voices) this.killVoice(v);
    this.voices.clear();
    const p = PERSP[this.mic] || "engine_room";
    const own = this.lib.loops.filter((l) => l.p === p);
    // The cab set is the only dense one; borrow its loops to fill gaps wider than 70 rpm so we never stretch one loop far.
    const fill = p === "cab" ? [] : this.lib.loops.filter((l) => l.p === "cab" && !own.some((o) => Math.abs(o.rpm - l.rpm) < 70));
    const all = [...own, ...fill].sort((a, b) => a.rpm - b.rpm);
    const out = [];
    for (const l of all) { const last = out[out.length - 1]; if (last && l.rpm - last.rpm < 14) { if (l.idle && !last.idle) out[out.length - 1] = l; continue; } out.push(l); }
    this.ladder = out;
  }
  killVoice(v) { try { v.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); v.s.stop(this.ctx.currentTime + 0.4); } catch (e) { /* already stopped */ } }
  voice(l) {
    let v = this.voices.get(l.f);
    if (!v) {
      const s = this.ctx.createBufferSource(); s.buffer = this.buf.get(l.f); s.loop = true; s.loopStart = l.ls; s.loopEnd = l.le;
      const g = this.ctx.createGain(); g.gain.value = 0; s.connect(g); g.connect(this.sampleBus);
      s.start(0, l.ls + Math.random() * (l.le - l.ls));
      v = { s, g, l, lastWanted: this.ctx.currentTime }; this.voices.set(l.f, v);
    }
    return v;
  }
  playOne(prefix, vol = 1) {
    const o = this.lib.oneshots.find((e) => e.f.startsWith(prefix)); if (!o) return null;
    const s = this.ctx.createBufferSource(); s.buffer = this.buf.get(o.f);
    const g = this.ctx.createGain(); g.gain.value = vol; s.connect(g); g.connect(this.sampleBus); s.start();
    return { s, g };
  }
  fadeOne(o, t) { if (!o) return; o.g.gain.setTargetAtTime(0, this.ctx.currentTime, t); try { o.s.stop(this.ctx.currentTime + t * 6); } catch (e) { /* ended */ } }
  updateSamples(eng) {
    const now = this.ctx.currentTime, rpm = eng.rpm;
    // transitions: crank -> start sample; stop -> shutdown sample
    if (eng.cranking && !this.wasCranking && !eng.running) { this.fadeOne(this.oneShot, 0.1); this.oneShot = this.playOne("start_outside_47596"); }
    if (eng.running && !this.wasRunning && this.oneShot) this.fadeOne(this.oneShot, 0.7);
    if (!eng.running && this.wasRunning) { this.fadeOne(this.oneShot, 0.1); this.oneShot = this.playOne("shutdown_outside"); }
    if (!eng.running && !eng.cranking && this.wasCranking && !this.wasRunning) this.fadeOne(this.oneShot, 0.3); // aborted start
    this.wasRunning = eng.running; this.wasCranking = eng.cranking;

    const want = new Map();
    if (eng.running && this.ladder.length) {
      const L = this.ladder; let hi = L.findIndex((l) => l.rpm >= rpm); if (hi < 0) hi = L.length - 1; const lo = Math.max(0, hi - 1);
      let w = hi === lo ? 1 : clamp((rpm - L[lo].rpm) / (L[hi].rpm - L[lo].rpm), 0, 1);
      if (rpm <= L[0].rpm) w = 1;
      const fade = clamp((rpm - 120) / 220, 0, 1); // run-up from nothing
      const lvl = (l) => (l.g != null ? Math.pow(10, l.g / 20) : Math.pow(10, 5 * clamp((l.rpm - IDLE) / 350, 0, 1) / 20));
      want.set(L[lo].f, Math.cos(w * Math.PI / 2) * lvl(L[lo]) * fade);
      if (hi !== lo) want.set(L[hi].f, Math.sin(w * Math.PI / 2) * lvl(L[hi]) * fade);
    }
    for (const f of want.keys()) { const l = this.ladder.find((x) => x.f === f); this.voice(l).lastWanted = now; }
    for (const [f, v] of this.voices) {
      const tg = want.get(f) || 0;
      v.g.gain.setTargetAtTime(tg, now, 0.06);
      if (tg > 0) v.s.playbackRate.setTargetAtTime(clamp(rpm / v.l.rpm, 0.45, 1.5), now, 0.05);
      if (now - v.lastWanted > 4) { this.killVoice(v); this.voices.delete(f); }
    }
  }
  update(eng) {
    this.send({ rpm: eng.rpm, load: eng.load, boost: eng.boost, running: eng.running, cranking: eng.cranking });
    if (this.samplesReady && this.src === "samples") this.updateSamples(eng);
  }
}
