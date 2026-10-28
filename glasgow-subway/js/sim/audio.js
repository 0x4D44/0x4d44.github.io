// Procedural cab audio (WebAudio) + PA via speechSynthesis. Everything guarded; starts after a user gesture.
export class SimAudio {
  constructor() { this.ctx = null; this.muted = false; this.ok = typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext); this.speechOn = typeof window !== 'undefined' && 'speechSynthesis' in window; this.vol = 0.8; this.started = false; this.hidden = false; this.blocked = 0; this._attachVisibility(); }
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
  state() { return { hidden: this.hidden, muted: this.muted, ctx: this.ctx ? this.ctx.state : 'none', gain: this.master ? this.master.gain.value : null, speaking: this.speechOn ? !!(speechSynthesis.speaking || speechSynthesis.pending) : false, blocked: this.blocked }; }
  async start() {
    if (this.hidden) return;
    if (!this.ok || this.started) { if (this.ctx && this.ctx.state === 'suspended') try { await this.ctx.resume(); } catch (e) {} return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : this.vol; this.master.connect(c.destination);
      const noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
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
  chime(kind = 'door') {
    if (this.hidden) { this.blocked++; return; }
    if (!this.started || !this.ctx) return; const c = this.ctx, t = c.currentTime;
    const seq = { door: [880, 660], close: [660, 880, 660], vigil: [1200, 1200, 1200], trip: [300, 220, 300, 220], ok: [660, 990] }[kind] || [880];
    seq.forEach((fr, i) => {
      const o = c.createOscillator(), g = c.createGain(); o.type = kind === 'trip' || kind === 'vigil' ? 'square' : 'sine'; o.frequency.value = fr;
      g.gain.setValueAtTime(0, t + i * 0.22); g.gain.linearRampToValueAtTime(0.18, t + i * 0.22 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.22 + 0.2);
      o.connect(g); g.connect(this.master); o.start(t + i * 0.22); o.stop(t + i * 0.22 + 0.25);
    });
  }
  speak(text) {
    if (this.hidden) { this.blocked++; return; }
    if (this.muted || !this.speechOn || !this.started) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'en-GB'; u.rate = 0.95; u.volume = 0.8; speechSynthesis.speak(u); } catch (e) {}
  }
  dispose() { try { if (this._vis) { document.removeEventListener('visibilitychange', this._vis); window.removeEventListener('pagehide', this._pagehide); window.removeEventListener('pageshow', this._vis); window.removeEventListener('blur', this._blur); document.removeEventListener('freeze', this._pagehide); this._vis = null; } } catch (e) {}
    try { if (this.ctx) this.ctx.close(); if (this.speechOn) speechSynthesis.cancel(); } catch (e) {} this.started = false; }
}
