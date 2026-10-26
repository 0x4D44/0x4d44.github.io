// Physically-motivated diesel synthesiser for the 12LDA28. Pure JS: runs inside an
// AudioWorklet in the browser and under Node for the offline video soundtrack.
//
// Every cylinder produces its own events as its cycle angle passes fixed points:
//   firing TDC  -> low-frequency pressure thump + combustion knock burst
//   exhaust open-> blow-down puff
//   valve events-> mechanical ticks, injection-pump click
// The exhaust-turbocharger adds a rising whine. Firing frequency at 750 rpm is 75 Hz
// (12 cylinders / 2 revolutions), so the "note" is the superposition of these pulses.

const TAU = Math.PI * 2;
export const FIRING = [1, 5, 3, 6, 2, 4];
export const BANK_OFFSET = [0, 60];
// Damped structural modes excited at each firing: [Hz, tau s, amplitude, phase].
const MODES = [[140, 0.016, 0.8, 0.3], [210, 0.014, 0.8, 1.1], [330, 0.010, 0.9, 2.0], [520, 0.008, 0.8, 0.7], [800, 0.006, 0.7, 1.9],
  [1250, 0.005, 0.6, 0.4], [1900, 0.004, 0.5, 2.6], [2800, 0.003, 0.4, 1.3], [4200, 0.0025, 0.3, 0.2], [6300, 0.002, 0.2, 2.2]];
const EVENTS = [
  [0, "fire"], [130, "exh"], [300, "inopen"], [410, "exclose"], [580, "inclose"], [698, "inj"],
];

export class EngineSynth {
  constructor(sr = 48000, seed = 12345) {
    this.sr = sr; this.seed = seed >>> 0;
    this.theta = 0; this.rpm = 0; this.load = 0; this.boost = 1; this.running = false; this.cranking = false;
    this.mic = 1; // 0 cab, 1 engine room, 2 trackside
    this.master = 0.8;
    this.fa = []; this.prev = []; this.cg = [];
    for (let b = 0; b < 2; b++) for (let c = 1; c <= 6; c++) {
      this.fa.push(FIRING.indexOf(c) * 120 + BANK_OFFSET[b]);
      this.prev.push(null);
      this.cg.push(0.65 + this.rand() * 0.7); // per-cylinder gain scatter; scaled up at idle (see 'uneven')
      this.bg = [1.0, 0.55];            // bank B weaker: puts energy at engine order 3 (bank firing rate)
    }
    this.voices = []; // {k,age,amp,f}
    this.knockLP1 = 0; this.knockLP2 = 0; this.kb = 0; this.kb2 = 0;
    this.exhLP = 0; this.thumpLP = 0; this.cabLP = 0; this.cabLP2 = 0; this.trLP = 0;
    this.turboPh = 0; this.turboPh2 = 0; this.turboF = 1300; this.turboLvl = 0; this.strike = 0; this.roarLP = 0; this.roarLP2 = 0; this.rumblePh = 0; this.noiseLP = 0; this.motorPh = 0;
    this.dc = 0; this.hp = 0;
    this.combA = new Float32Array(Math.round(sr * 0.013)); this.combI = 0;
    this.limit = 0; this.jit = 0.0016;
  }
  rand() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  noise() { return this.rand() * 2 - 1; }
  set(p) { Object.assign(this, p); }

  spawn(k, amp, f) {
    if (this.voices.length > 160) this.voices.shift();
    this.voices.push({ k, age: 0, amp: amp * (k === 4 ? 0.92 + this.rand() * 0.16 : 1), f: f || 0, ph: 0, delay: k === 4 ? Math.floor(this.rand() * this.jit * this.sr) : 0 }); // random per-firing timing/level jitter (measured 5-10 %)
  }

  process(out, n) {
    const sr = this.sr, inv = 1 / sr;
    const rpm = this.rpm, load = this.load, running = this.running;
    const dth = rpm * 6 * inv; // crank degrees per sample
    const idleish = running ? Math.max(0, 1 - load * 1.4) : 0;
    const spd = Math.min(1, rpm / 750);
    const micG = [[0.9, 0.55, 0.85], [1.0, 1.0, 1.0], [0.7, 0.95, 0.9]][this.mic] || [1, 1, 1];
    const hiG = 1 + 2.2 * load; // measured: 1-8 kHz rises 3-6 dB relative to the low bands from idle to full power
    const amp = running ? 0.5 + 0.9 * load : (this.cranking ? 0.35 : 0);
    const turboTarget = running ? 700 + Math.max(0, this.boost - 1) / 0.9 * 3600 + 500 * spd : 0;
    for (let i = 0; i < n; i++) {
      // advance crank and detect events
      const th0 = this.theta; this.theta += dth;
      if (rpm > 3) {
        for (let cy = 0; cy < 12; cy++) {
          const fa = this.fa[cy];
          let a = ((this.theta - fa) % 720 + 720) % 720;
          const p = this.prev[cy];
          if (p !== null) {
            for (let e = 0; e < EVENTS.length; e++) {
              const th = EVENTS[e][0];
              const crossed = a >= p ? (p < th && a >= th) : (p < th || a >= th);
              if (!crossed) continue;
              const g = this.cg[cy];
              const kind = EVENTS[e][1];
              if (kind === "fire") {
                // idle: occasional weak/mis-fires give the characteristic lumpy tickover
                let miss = 1;
                if (running && rpm < 420 && this.rand() < 0.07) miss = 0.35;
                const fireAmp = (this.cranking && !running) ? 0.18 : amp;
                const bk = cy < 6 ? this.bg[0] : this.bg[1] + 0.25 * (1 - this.bg[1]) * (1 - idleish);
                this.spawn(0, fireAmp * g * miss * bk, (rpm / 10) * (0.92 + this.rand() * 0.16)); // pressure thump centred on the firing frequency
                this.spawn(1, fireAmp * g * miss * (0.6 + 0.9 * idleish), 0);
                // Resonant strike: deterministic damped modes of the block, so every firing repeats the same
                // waveform and the spectrum is a clean order comb out to the kHz range, as in the recordings.
                const uneven = 1 + (this.cg[cy] - 1) * (1 + 3.2 * idleish);
                this.spawn(4, (running ? 0.5 + 3.0 * load * load : 0.18) * miss * uneven * bk, 0);
              } else if (kind === "exh") {
                this.spawn(2, (running ? 0.5 + 0.8 * load : 0.1) * g, 0);
              } else if (kind === "inj") {
                if (running) this.spawn(3, 0.09 * g, 0);
              } else {
                this.spawn(3, 0.06 * g * (0.4 + spd), 0);
              }
            }
          }
          this.prev[cy] = a;
        }
      }
      // voices
      let thump = 0, knock = 0, exh = 0, strike = 0;
      for (let v = this.voices.length - 1; v >= 0; v--) {
        const vo = this.voices[v]; if (vo.delay > 0) { vo.delay--; continue; } const t = vo.age * inv; vo.age++;
        if (vo.k === 0) {
          const env = Math.exp(-t / 0.032);
          if (env < 0.002) { this.voices.splice(v, 1); continue; }
          vo.ph += TAU * vo.f * inv * (1 - 0.35 * t / (t + 0.04));
          thump += vo.amp * env * (Math.sin(vo.ph) + 0.18 * Math.sin(vo.ph * 2 + 0.6) + 0.08 * Math.sin(vo.ph * 3));
        } else if (vo.k === 1) {
          const env = Math.exp(-t / 0.0055);
          if (env < 0.003) { this.voices.splice(v, 1); continue; }
          knock += vo.amp * env * this.noise();
        } else if (vo.k === 2) {
          const env = Math.exp(-t / 0.022) * (1 - Math.exp(-t / 0.002));
          if (env < 0.003 && t > 0.03) { this.voices.splice(v, 1); continue; }
          exh += vo.amp * env * (this.noise() * 0.8 + Math.sin(TAU * 96 * t));
        } else if (vo.k === 4) {
          if (t > 0.07) { this.voices.splice(v, 1); continue; }
          let st = 0;
          for (let m = 0; m < MODES.length; m++) { const M = MODES[m]; st += M[2] * (M[0] > 1000 ? hiG : 1) * Math.exp(-t / M[1]) * Math.sin(TAU * M[0] * t + M[3]); }
          strike += vo.amp * st;
        } else {
          const env = Math.exp(-t / 0.0009);
          if (env < 0.01) { this.voices.splice(v, 1); continue; }
          knock += vo.amp * env * this.noise() * 2.0;
        }
      }
      // knock bus through a resonant band (cylinder-head / block resonance ~ 1.8 kHz)
      const kf = 0.20;
      this.kb += kf * (knock - this.kb); this.kb2 += kf * (this.kb - this.kb2);
      const kband = knock - this.kb2 * 1.0;
      this.knockLP1 += 0.35 * (kband - this.knockLP1);
      const knockOut = this.knockLP1 * 0.9;
      // exhaust: low-passed puff
      this.exhLP += 0.045 * (exh - this.exhLP);
      this.thumpLP += 0.2 * (thump - this.thumpLP);
      // turbo whine: tracks load and time rather than rpm; 1.3-3.5 kHz, exact 2nd harmonic, spools down with tau ~3.5 s
      const lt = running ? Math.min(1, Math.max(0, (load - 0.08) / 0.5)) : 0;
      const lk = lt > this.turboLvl ? 0.5 * inv : inv / 3.5; this.turboLvl += lk * (lt - this.turboLvl);
      const tfT = 1300 + 2200 * this.turboLvl;
      this.turboF += Math.max(-1200 * inv, Math.min(60 * inv, (tfT - this.turboF) * inv / 2));
      this.turboPh += TAU * this.turboF * inv; this.turboPh2 += TAU * this.turboF * 2 * inv;
      const turbo = (Math.sin(this.turboPh) + 0.6 * Math.sin(this.turboPh2)) * 0.05 * this.turboLvl * this.turboLvl;
      // gear/valve-train mechanical hum at half crank frequency orders
      const hum = rpm > 3 ? Math.sin(this.rumblePh) * 0.03 : 0;
      this.rumblePh += TAU * (rpm / 60) * 36 * inv; // 36 teeth synchronising gear mesh frequency
      // cranking starter whine (generator motoring the engine)
      let motor = 0;
      if (this.cranking) { this.motorPh += TAU * (150 + rpm * 4) * inv; motor = Math.sin(this.motorPh) * 0.03; }
      // sum
      this.roarLP += 0.5 * (this.noise() - this.roarLP); this.roarLP2 += 0.7 * (this.roarLP - this.roarLP2);
      const roar = running ? this.roarLP2 * 1.6 * Math.pow(load, 1.5) * (0.6 + 0.4 * Math.sin(this.theta * TAU / 360 * 6)) : 0;
      let s = (this.thumpLP * 0.34 * (1 - 0.6 * load) + roar + strike * 0.5 + knockOut * 0.9 * micG[1] + this.exhLP * 0.8 * micG[2] + hum * micG[1]) * 0.55 + (turbo + motor) * micG[1];
      // microphone positions
      if (this.mic === 0) { // cab: muffled, low-end heavy
        this.cabLP += 0.8 * (s - this.cabLP); this.cabLP2 += 0.9 * (this.cabLP - this.cabLP2);
        s = this.cabLP2 * 1.4;
      } else if (this.mic === 2) { // trackside: exhaust-forward with short echo
        this.trLP += 0.30 * (s - this.trLP);
        const d = this.combA[this.combI]; this.combA[this.combI] = this.trLP + d * 0.35; this.combI = (this.combI + 1) % this.combA.length;
        s = this.trLP + 0.3 * d;
      }
      // DC blocker + soft saturation
      this.hp += (this.mic === 1 ? 0.012 : 0.006) * (s - this.hp); s -= this.hp; // recordings roll off below ~40-90 Hz
      s = Math.tanh(s * 0.7 * this.master) * 0.85;
      out[i] = s;
    }
    return out;
  }
}
