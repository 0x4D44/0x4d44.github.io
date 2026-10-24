// Web Audio wrapper: starts the synth worklet, forwards engine state, exposes an analyser.
export class EngineAudio {
  constructor() { this.ctx = null; this.node = null; this.analyser = null; this.on = false; this.vol = 0.8; this.mic = 1; }
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
    this.node.connect(this.gain); this.gain.connect(this.analyser); this.analyser.connect(this.ctx.destination);
    this.on = true; this.send({ mic: this.mic }); return true;
  }
  disable() { this.on = false; if (this.gain) this.gain.gain.value = 0; }
  setVolume(v) { this.vol = v; if (this.gain && this.on) this.gain.gain.value = v; }
  setMic(m) { this.mic = m; this.send({ mic: m }); }
  send(p) { if (this.node) this.node.port.postMessage(p); }
  update(eng) { this.send({ rpm: eng.rpm, load: eng.load, boost: eng.boost, running: eng.running, cranking: eng.cranking }); }
}
