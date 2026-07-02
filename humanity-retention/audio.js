export class AudioManager {
  constructor(settings = {}) {
    this.settings = { mute: false, volume: 0.55, music: true, sfx: true, ...settings };
    this.ctx = null;
    this.master = null;
    this.timer = null;
    this.started = false;
  }
  ensure() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.settings.mute ? 0 : this.settings.volume;
    this.master.connect(this.ctx.destination);
  }
  start() {
    this.ensure();
    if (!this.ctx) return;
    this.ctx.resume?.();
    this.started = true;
    if (this.settings.music) this.startMusic();
  }
  update(settings) {
    this.settings = { ...this.settings, ...settings };
    if (this.master) this.master.gain.value = this.settings.mute ? 0 : this.settings.volume;
    if (!this.settings.music || this.settings.mute) this.stopMusic();
    else if (this.started) this.startMusic();
  }
  tone(freq, dur, vol) {
    if (!this.ctx || !this.master || this.settings.mute) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(vol, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }
  blip(kind = "click") {
    if (!this.settings.sfx || this.settings.mute) return;
    this.ensure();
    const map = { click: [440, .05, .03], alert: [196, .15, .07], success: [660, .22, .06], fail: [110, .24, .07], unlock: [880, .28, .06], ai: [260, .18, .05] };
    const p = map[kind] || map.click;
    this.tone(p[0], p[1], p[2]);
    if (kind === "success" || kind === "unlock") setTimeout(() => this.tone(p[0] * 1.5, .16, p[2]), 95);
  }
  startMusic() {
    if (this.timer || this.settings.mute || !this.settings.music) return;
    this.ensure();
    const notes = [110, 146.8, 164.8, 130.8, 98, 123.5, 146.8, 196];
    let step = 0;
    this.timer = setInterval(() => {
      if (!this.settings.music || this.settings.mute) return;
      this.tone(notes[step++ % notes.length], .34, .015);
    }, 560);
  }
  stopMusic() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
